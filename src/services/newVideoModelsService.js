// ── newVideoModelsService.js ──────────────────────────────────────────────────
// The new Replicate video-generation models the client asked to add (Veo 3.1 /
// Veo 3.1 Fast, Kling 2.5 Turbo Pro / Kling 2.1, Seedance 1.5/2.0/2.5, Luma
// Ray 2) — separate from the existing Model 1-8 video pipelines, which are
// untouched. Supports real per-resolution quality tiers where the model
// actually charges differently by resolution (see creditPricingEngine.js).
//
// Model slugs and input schemas below were confirmed via web search (Replicate
// itself was egress-blocked in this dev sandbox) as of Sept 2026 — some fields
// (marked below) are best-effort from third-party docs, not a live schema
// fetch, and should be double-checked against each model's real
// replicate.com/<slug>/api/schema page before depending on them heavily.

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // فيديو بياخد وقت أطول بكتير من صورة — 10 دقايق كافية للغالبية

function authHeaders() {
  return { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' };
}

// نفس نمط الرفع لـ R2 المستخدم في newImageModelsService.js/audioVideoService.js —
// نفس متغيرات البيئة بالظبط. الفيديوهات المتولدة برضو لازم تتخزن دائم مش تفضل على
// رابط replicate.delivery المؤقت
const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function uploadBufferToR2(buffer, key, contentType) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `${R2_PUBLIC_URL}/${key}`;
}

// ✅ FIX (نفس باج حقيقي حصل في newImageModelsService.js): كان بيرجع الرابط المؤقت وكأنه
// دائم لو فشل التنزيل مرة واحدة — رابط مؤقت من بروكسي طرف تالت ممكن يتخزن كـ"دائم" في
// الـhistory، وبعدين أي استخدام تاني ليه (كـreference lمثلاً) بيفشل بـ403. دلوقتي نعيد
// المحاولة، ولو فشلت الكل نرمي error حقيقي بدل رابط مؤقت مضمون يتعطل لاحقًا
async function downloadWithRetry(url, maxRetries = 3) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function persistVideoToR2(url, modelKey) {
  if (!S3_ENDPOINT_URL || !S3_ACCESS_KEY || !S3_SECRET_KEY) return url;
  const res = await downloadWithRetry(url);
  const contentType = res.headers.get('content-type') || 'video/mp4';
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = `generated-videos/${modelKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
  return await uploadBufferToR2(buffer, key, contentType);
}

// كل مفتاح هنا بيطابق نفس المفتاح في creditPricingEngine.js's REPLICATE_MODEL_COSTS —
// عشان حساب السعر والتوليد الفعلي يفضلوا مصدر واحد للحقيقة
export const NEW_VIDEO_MODELS = {
  veo3_fast: {
    slug: 'google/veo-3.1-fast',
    supportsImageInput: true,
    allowedDurations: [4, 6, 8],
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      resolution: tier || '720p',
      duration_seconds: [4, 6, 8].includes(durationSec) ? durationSec : 8,
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  veo3_standard: {
    slug: 'google/veo-3.1',
    supportsImageInput: true,
    allowedDurations: [4, 6, 8],
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      resolution: tier || '720p',
      duration_seconds: [4, 6, 8].includes(durationSec) ? durationSec : 8,
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  kling_2_5: {
    slug: 'kwaivgi/kling-v2.5-turbo-pro',
    supportsImageInput: true,
    allowedDurations: [5, 10],
    // ⚠ التوثيق اللي لقيته وصف "image" كحقل مطلوب لنسخة image-to-video بالتحديد — لو النص-لفيديو
    // من غير صورة رجع خطأ، محتاج نسخة/باراميتر تاني للـ text-to-video البحت، يحتاج تأكيد حي
    buildInput: ({ prompt, imageUrl, durationSec }) => ({
      prompt,
      duration: [5, 10].includes(durationSec) ? durationSec : 5,
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  kling_2_1: {
    slug: 'kwaivgi/kling-v2.1',
    supportsImageInput: true,
    allowedDurations: [5, 10],
    buildInput: ({ prompt, imageUrl, durationSec, tier }) => ({
      prompt,
      duration: [5, 10].includes(durationSec) ? durationSec : 5,
      ...(tier ? { resolution: tier } : {}),
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  // ✅ FIX (مراجعة أسعار: العميل أكد من صفحة الموديل إن السعر بيتقسم with_audio/without_audio
  // وكمان حسب الدقة 480p/720p/1080p، وسعرنا المحدث دلوقتي مبني على with_audio) — أضفنا
  // generate_audio:true هنا زي seedance_2_0 بالظبط، عشان الفيديو الفعلي يتولّد بصوت ويطابق
  // السعر الحقيقي اللي بنتقاضاه. حقل "resolution" مش مؤكد 100% لنفس الموديل ده تحديدًا (قياسًا
  // على seedance_2_0/2_5 اللي من نفس العيلة وبيقبلوا نفس الاسم) — يحتاج تأكيد حي بعد الإطلاق
  seedance_1_5: {
    slug: 'bytedance/seedance-1.5-pro',
    supportsImageInput: true,
    minDurationSec: 1,
    maxDurationSec: 12,
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      resolution: tier || '720p',
      aspect_ratio: aspectRatio || '16:9',
      duration: Math.min(Math.max(durationSec || 5, 1), 12),
      generate_audio: true,
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  seedance_2_0: {
    slug: 'bytedance/seedance-2.0',
    supportsImageInput: true,
    minDurationSec: 4,
    maxDurationSec: 15,
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      resolution: tier || '720p',
      aspect_ratio: aspectRatio || '16:9',
      duration: Math.min(Math.max(durationSec || 5, 4), 15),
      generate_audio: true,
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  seedance_2_5: {
    slug: 'bytedance/seedance-2.5',
    supportsImageInput: true,
    minDurationSec: 4,
    maxDurationSec: 30,
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      resolution: tier || '720p',
      aspect_ratio: aspectRatio || '16:9',
      duration: Math.min(Math.max(durationSec || 5, 4), 30),
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  // ✅ NEW (طلب العميل — سعره مؤكد من صفحة الموديل مباشرة، سكرين شوت العميل): نسخة أسرع/أرخص
  // من seedance_2_0 — نفس شكل الـinput بالظبط بالقياس على العيلة، بس الـslug واسم النسخة
  // (fast) لسه محتاج تأكيد حي، ومدى المدة مفترض نفس seedance_2_0 العادي لحد ما يتأكد
  seedance_2_0_fast: {
    slug: 'bytedance/seedance-2.0-fast',
    supportsImageInput: true,
    minDurationSec: 4,
    maxDurationSec: 15,
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      resolution: tier || '720p',
      aspect_ratio: aspectRatio || '16:9',
      duration: Math.min(Math.max(durationSec || 5, 4), 15),
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  // ✅ NEW (طلب العميل — الـslug ده فعلاً مؤكد ومستخدم بالفعل في adminRoutes.js's Studio
  // feature القديمة، فحقول الـinput دي حقيقية مش تخمين: prompt/aspect_ratio/resolution/
  // duration/fps/camera_fixed). مدى المدة مش مؤكد فعليًا (افتراض بالقياس على seedance_1_5)
  seedance_1_pro_fast: {
    slug: 'bytedance/seedance-1-pro-fast',
    supportsImageInput: true,
    minDurationSec: 1,
    maxDurationSec: 12,
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      resolution: tier || '720p',
      duration: Math.min(Math.max(durationSec || 5, 1), 12),
      fps: 24,
      camera_fixed: false,
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  // ✅ NEW (طلب العميل، سعره مؤكد من صفحة الموديل مباشرة — سكرين شوت العميل): الـschema
  // الحقيقي (أسماء الحقول) لسه مش مؤكدة (مفيش سكرين شوت لصفحة الـInput)، دي أفضل تخمين بناءً
  // على نمط باقي الموديلات في نفس الملف، يحتاج تأكيد حي قبل الاعتماد عليه بكتر
  prunaai_p_video: {
    slug: 'prunaai/p-video',
    supportsImageInput: true,
    minDurationSec: 1,
    maxDurationSec: 10,
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      resolution: tier || '720p',
      duration: Math.min(Math.max(durationSec || 5, 1), 10),
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  // ✅ NEW (طلب العميل، سعره مؤكد من صفحة الموديل مباشرة — سكرين شوت العميل، وreadme الموديل
  // بيقول صراحة إنه بيدعم "native-speech lip-sync" — نسخة قوية للفيديوهات اللي فيها حوار/
  // كلام حقيقي على الشاشة): نفس ملاحظة الـschema فوق، تخمين معقول محتاج تأكيد حي
  prunaai_p_video_2: {
    slug: 'prunaai/p-video-2',
    supportsImageInput: true,
    minDurationSec: 1,
    maxDurationSec: 10,
    buildInput: ({ prompt, imageUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      resolution: tier || '720p',
      duration: Math.min(Math.max(durationSec || 5, 1), 10),
      ...(imageUrl ? { image: imageUrl } : {}),
    }),
  },
  // ✅ Luma Ray 2 — Replicate بيعرضه كـ slug منفصل لكل دقة (مش باراميتر resolution داخل نفس
  // الموديل زي الباقي)، فمفتاح الموديل هنا نفسه بيحدد الجودة
  luma_ray2_540p: {
    slug: 'luma/ray-2-540p',
    supportsImageInput: true,
    allowedDurations: [5, 9],
    buildInput: ({ prompt, imageUrl, durationSec }) => ({
      prompt,
      duration: durationSec >= 9 ? '9s' : '5s',
      ...(imageUrl ? { image_url: imageUrl } : {}),
    }),
  },
  luma_ray2_720p: {
    slug: 'luma/ray-2-720p',
    supportsImageInput: true,
    allowedDurations: [5, 9],
    buildInput: ({ prompt, imageUrl, durationSec }) => ({
      prompt,
      duration: durationSec >= 9 ? '9s' : '5s',
      ...(imageUrl ? { image_url: imageUrl } : {}),
    }),
  },
  // ✅ NEW (طلب العميل): Gemini Omni 1.1 Flash — أول موديل حقيقي عندنا بيعمل video-to-video
  // فعلي (تعديل فيديو موجود بتعليمات نصية عادية)، غير كل موديلات الفيديو التانية اللي بتعمل
  // text/image-to-video بس. بيدعم كمان image-to-video عادي (reference_images) لو مفيش فيديو مصدر.
  // ⚠ اسم حقل الفيديو المصدر بالظبط في schema الحقيقي على Replicate (video_url/video/input_video)
  // لسه محتاج تأكيد حي — استخدمنا "video" كأرجح تخمين بناءً على تسمية الموديلات المشابهة، لازم
  // يتأكد قبل الاعتماد عليه في الإنتاج الحقيقي. السعر ~$0.10/ثانية عند 720p (مؤكد من حساب
  // التوكنز الحقيقي: 5792 توكن/ثانية × $17.50/مليون)، الدقات التانية (360p/1080p/4K) سعرها
  // مش مؤكد فبنستخدم نفس السعر كتقدير موحد لحد التأكيد الحي
  omni_flash_1_1: {
    slug: 'google/gemini-omni-1.1',
    supportsImageInput: true,
    supportsVideoEdit: true,
    allowedDurations: [3, 4, 5, 6, 7, 8, 9, 10],
    buildInput: ({ prompt, imageUrl, sourceVideoUrl, aspectRatio, durationSec, tier }) => ({
      prompt,
      resolution: tier || '720p',
      aspect_ratio: aspectRatio || '16:9',
      duration: Math.min(Math.max(durationSec || 5, 3), 10),
      ...(sourceVideoUrl ? { video: sourceVideoUrl } : imageUrl ? { reference_images: [imageUrl] } : {}),
    }),
  },
};

async function withRetry429(fn, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = /429|throttled|rate limit/i.test(err.message || '');
      if (!is429 || attempt === maxRetries) throw err;
      let waitSec = 18;
      const m = /retry_after["\s:]+(\d+(\.\d+)?)/i.exec(err.message || '');
      if (m) waitSec = Math.max(parseFloat(m[1]) + 3, 8);
      console.warn(`[NewVideoModels] 429 rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

async function pollPrediction(predictionId, label) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`${label} failed: ${data.error}`);
  }
  throw new Error(`${label} timed out`);
}

/**
 * Generates one video with the given model + quality tier, returning its
 * permanent (R2-persisted) URL. `tier` is a resolution string ("720p" etc.)
 * for models that support it — ignored otherwise.
 */
export async function generateNewModelVideo({ modelKey, prompt, imageUrl = null, sourceVideoUrl = null, aspectRatio = '16:9', durationSec = 5, tier = null }) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const model = NEW_VIDEO_MODELS[modelKey];
  if (!model) throw new Error(`Unknown video model: ${modelKey}`);
  if (!prompt?.trim()) throw new Error('prompt is required');
  if (sourceVideoUrl && !model.supportsVideoEdit) throw new Error(`${modelKey} does not support video-to-video editing`);
  const label = `${modelKey} video generation`;

  const input = model.buildInput({ prompt, imageUrl, sourceVideoUrl, aspectRatio, durationSec, tier });
  const output = await withRetry429(async () => {
    const res = await fetch(`https://api.replicate.com/v1/models/${model.slug}/predictions`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ input }),
    });
    if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (data.error) throw new Error(`${label}: ${data.error}`);
    let out = data.status === 'succeeded' ? data.output : null;
    if (!out && data.id) out = await pollPrediction(data.id, label);
    if (!out) throw new Error(`${label} returned no output`);
    return out;
  });

  const videoUrl = Array.isArray(output) ? output[0] : output;
  return persistVideoToR2(videoUrl, modelKey);
}

/**
 * Rounds a needed duration (e.g. real narration audio length) up to the
 * smallest real duration this engine actually supports — so a generated
 * video is never shorter than the narration that will be muxed onto it.
 * Discrete-duration engines (allowedDurations) pick the smallest fitting
 * step; continuous ones (minDurationSec/maxDurationSec) just clamp.
 */
export function getSuggestedDuration(modelKey, neededSec) {
  const model = NEW_VIDEO_MODELS[modelKey];
  const rounded = Math.max(1, Math.ceil(neededSec || 1));
  if (!model) return rounded;
  if (model.allowedDurations) {
    const fit = model.allowedDurations.find(d => d >= rounded);
    return fit ?? model.allowedDurations[model.allowedDurations.length - 1];
  }
  const min = model.minDurationSec ?? 1;
  const max = model.maxDurationSec ?? 30;
  return Math.min(Math.max(rounded, min), max);
}
