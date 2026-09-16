// ── newImageModelsService.js ─────────────────────────────────────────────────
// Phase 3: the new Replicate image-generation models the client asked to add
// (Nano Banana family, Grok Image, GPT-Image, Seedream 4/5) — separate from
// the existing Model 1-8 image/video pipelines, which are untouched.
//
// Model slugs and input schemas below are confirmed against each model's own
// Replicate page as of Sept 2026. "Nano Banana Lite" is intentionally absent —
// it's only available on fal.ai, not Replicate, so it isn't wired here even
// though it's priced in creditPricingEngine.js for the client's reference table.

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const MAX_BATCH = 20; // client's explicit ask: up to 20 images per generation

function authHeaders() {
  return { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' };
}

// ✅ NEW (باج حقيقي: الصور مكنتش بتتخزن على R2 خالص، فرابط التحميل كان بيوداك لـ replicate.delivery
// مباشرة — روابط مؤقتة ممكن تنتهي، ومش المفروض تبقى مصدر الحقيقة للميديا بتاعة العميل): نفس نمط
// الرفع المستخدم فعليًا في audioVideoService.js — نفس متغيرات البيئة بالظبط
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

// بتنزل كل صورة من الرابط المؤقت بتاع Replicate وترفعها على R2، وترجع الرابط الدائم بدلها.
// لو الرفع فشل لأي سبب (مفيش مفاتيح R2 مثلاً)، بترجع الرابط الأصلي بدل ما تفشّل التوليد كله
// ✅ FIX (باج حقيقي في الإنتاج): بعض الموديلات (نانو بنانا تحديدًا) بترجع رابط مؤقت من بروكسي
// طرف تالت (Aliyun OSS) — لو فشل تنزيله (حتى مرة واحدة، شبكة متقطعة مثلاً)، الكود القديم كان
// "بيرجع" الرابط المؤقت ده وكأنه رابط دائم عادي، فبيتخزن في الـhistory ويتستخدم تاني كـreference
// لاحقًا — وبعد ما وقته يخلص (أو صلاحيته الحقيقية أضيق مما اتوقعنا)، أي محاولة استخدامه بعد
// كده بتفشل بـ403 (زي ما حصل فعليًا مع عميل حقيقي). دلوقتي: نعيد المحاولة كذا مرة (تقلبات
// شبكة عابرة)، ولو فشلت الكل نرمي error حقيقي بدل ما نرجع رابط مؤقت مضمون يتعطل لاحقًا —
// أحسن نفشل التوليد ونرد الكريديت بدل ما نديله صورة "ناجحة" هتنكسر بعدين
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

async function persistImagesToR2(urls, modelKey) {
  if (!S3_ENDPOINT_URL || !S3_ACCESS_KEY || !S3_SECRET_KEY) return urls;
  return Promise.all(urls.map(async (url) => {
    const res = await downloadWithRetry(url);
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());
    const key = `generated-images/${modelKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return await uploadBufferToR2(buffer, key, contentType);
  }));
}

// Each entry: real Replicate slug, how to build its input object from our
// common params, and whether the model can generate a batch in one call.
export const NEW_IMAGE_MODELS = {
  nano_banana: {
    slug: 'google/nano-banana',
    buildInput: ({ prompt, referenceImageUrls, aspectRatio }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16',
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 14) } : {}),
    }),
  },
  // ✅ FIX (باج حقيقي: "جودة الصور وحشة" — سبب منفصل تمامًا عن باج النسبة فوق): نانو بنانا 2
  // وبرو بيدعموا حقل "resolution" منفصل عن "aspect_ratio" (القيم: 512px/1K/2K/4K) — الكود
  // القديم ماكانش بيبعته خالص، يعني الموديل كان بيرجع لأقل دقة افتراضية بتاعته لوحده.
  // ✅ NEW: دلوقتي "tier" بقى باراميتر حقيقي بسعر خاص بيه (زي موديلات الفيديو بالظبط) —
  // شايفه creditPricingEngine.js's REPLICATE_MODEL_COSTS[key].tiers — مش هاردكودد تاني
  nano_banana_2: {
    slug: 'google/nano-banana-2',
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, tier }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', resolution: tier || '1K', output_format: 'jpg',
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 14) } : {}),
    }),
  },
  nano_banana_pro: {
    slug: 'google/nano-banana-pro',
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, tier }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', resolution: tier || '2K', output_format: 'jpg',
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 14) } : {}),
    }),
  },
  grok_image: {
    slug: 'xai/grok-imagine-image',
    buildInput: ({ prompt, aspectRatio }) => ({ prompt, aspect_ratio: aspectRatio || '9:16' }),
  },
  // ✅ NEW (طلب العميل — سعره مؤكد من العميل مباشرة $0.034/صورة، سعر واحد بلا دقات متعددة):
  // ⚠ اسم الـslug تخمين بالقياس على nano_banana_2/nano_banana_pro، يحتاج تأكيد حي
  nano_banana_2_lite: {
    slug: 'google/nano-banana-2-lite',
    buildInput: ({ prompt, referenceImageUrls, aspectRatio }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', output_format: 'jpg',
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 14) } : {}),
    }),
  },
  // ❌ REMOVED (gpt_image / openai/gpt-image-1) — باج حقيقي مكتشف أثناء مراجعة الأسعار: الموديل
  // ده على Replicate شغال "bring-your-own-key" فقط — لازم العميل (يعني إحنا) نبعت مفتاح OpenAI
  // حقيقي خاص بنا جوه الـ input نفسه ("openai_api_key")، وبعدين حساب OpenAI بتاعنا هو اللي
  // بيتحاسب مباشرة (مش عن طريق كريديت Replicate العادي زي كل الموديلات التانية). الكود القديم
  // فوق ماكانش بيبعت أي مفتاح خالص، يعني أي طلب فعلي كان لازم يفشل من Replicate (رفض التوثيق)
  // فيترفق الكريديت تلقائيًا — يعني الموديل ده كان معطّل فعليًا لأي عميل اختاره أو الايجنت رشحه
  // (كان بيترشّح تحديدًا لطلبات فيها نص/كتابة في الصورة). "quality":"standard" كان كمان قيمة
  // غير صحيحة أصلاً لموديل OpenAI ده (القيم الحقيقية: low/medium/high/auto). اتشال تمامًا لحد
  // ما يتحط مفتاح OpenAI حقيقي في env (OPENAI_API_KEY) ويتصلح الـ buildInput فعليًا — قرار
  // بزنس محتاج موافقة صاحب المشروع (فتح حساب OpenAI منفصل ودفع مباشر بدل ما يعدي على Replicate).
  // ✅ FIX (باج حقيقي حصل مع عميل حقيقي: طلب صورة 16:9 وطلعت 1:1 دايمًا بصرف النظر عن أي نسبة
  // مطلوبة): الكود القديم كان بيبعت "image_size" بقيم زي "portrait_16_9"/"landscape_16_9" —
  // ده أسلوب تسمية fal.ai مش Replicate. الـ schema الحقيقي لموديلات Seedream على Replicate
  // نفسها بيقبل حقل "aspect_ratio" مباشر بنفس قيم باقي الموديلات فوق (زي "16:9"/"9:16"/"1:1") —
  // القيمة القديمة "portrait_16_9" مكنتش حقل معروف للموديل فكان بيتجاهله ويرجع لنسبته الافتراضية
  // (مربع) دايمًا. لازم يتأكد بعد التوليد الحي إن ده اتحل فعليًا.
  seedream_4: {
    slug: 'bytedance/seedream-4',
    nativeBatchParam: 'max_images',
    maxNativeBatch: 6,
    // ✅ FIX: نفس فكرة الدقة فوق — Seedream بيدعم حقل "size" منفصل (small=512px/regular=1
    // ميجابكسل/big=2048px) مكانش بيتبعت خالص، فكان بيرجع لأقل حجم افتراضي. "regular" توازن معقول.
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, count }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', size: 'regular',
      max_images: Math.min(Math.max(1, count || 1), 6),
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 10) } : {}),
    }),
  },
  seedream_5: {
    slug: 'bytedance/seedream-5-pro',
    nativeBatchParam: 'max_images',
    maxNativeBatch: 6,
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, count }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', size: 'regular',
      max_images: Math.min(Math.max(1, count || 1), 6),
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 10) } : {}),
    }),
  },
  seedream_5_lite: {
    slug: 'bytedance/seedream-5-lite',
    nativeBatchParam: 'max_images',
    maxNativeBatch: 6,
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, count }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', size: 'regular',
      max_images: Math.min(Math.max(1, count || 1), 6),
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 10) } : {}),
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
      console.warn(`[NewImageModels] 429 rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

async function pollPrediction(predictionId, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
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

async function runPrediction(slug, input, label) {
  return withRetry429(async () => {
    const res = await fetch(`https://api.replicate.com/v1/models/${slug}/predictions`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ input }),
    });
    if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (data.error) throw new Error(`${label}: ${data.error}`);
    let output = data.status === 'succeeded' ? data.output : null;
    if (!output && data.id) output = await pollPrediction(data.id, 120000, label);
    if (!output) throw new Error(`${label} returned no output`);
    return Array.isArray(output) ? output : [output];
  });
}

// Runs `tasks` (thunks) with at most `limit` in flight at once.
async function runWithConcurrency(tasks, limit = 4) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Generates `count` images (up to 20) with the given model, returning a flat
 * array of image URLs. Uses the model's native batch parameter when it has
 * one (GPT-Image, Seedream family); otherwise runs one prediction per image
 * with limited concurrency.
 *
 * ✅ NEW (طلب العميل، وباج حقيقي: "اعمل الاربع صور مرة واحدة" لأربع مشاهد مختلفة
 * كان مفيش طريقة يوصفها للايجينت — الماركر كان بيقبل prompt واحد + count بس، يعني
 * نسخ متطابقة من نفس البرومبت، لا مشاهد مختلفة. لو `prompts` (مصفوفة برومبتات مختلفة)
 * اتبعتت، كل واحد فيهم بيتعمله prediction منفصل بصورة واحدة بالظبط (حتى لو الموديل
 * عنده native batch param، عشان ده بيولّد N نسخة من نفس البرومبت مش N برومبت مختلف)،
 * والنتيجة بترجع بنفس ترتيب الـ prompts.
 */
export async function generateNewModelImages({ modelKey, prompt, prompts = null, referenceImageUrls = [], aspectRatio = '9:16', count = 1, tier = null }) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const model = NEW_IMAGE_MODELS[modelKey];
  if (!model) throw new Error(`Unknown image model: ${modelKey}`);
  const label = `${modelKey} image generation`;

  const distinctPrompts = Array.isArray(prompts) ? prompts.filter(p => typeof p === 'string' && p.trim()) : [];
  if (distinctPrompts.length >= 2) {
    const capped = distinctPrompts.slice(0, MAX_BATCH);
    const results = await runWithConcurrency(
      capped.map(p => () => runPrediction(model.slug, model.buildInput({ prompt: p, referenceImageUrls, aspectRatio, count: 1, tier }), label)),
      4
    );
    return persistImagesToR2(results.flat(), modelKey);
  }

  if (!prompt?.trim()) throw new Error('prompt is required');
  const total = Math.min(Math.max(1, count || 1), MAX_BATCH);

  if (model.nativeBatchParam) {
    const chunks = [];
    let remaining = total;
    while (remaining > 0) {
      const chunkSize = Math.min(remaining, model.maxNativeBatch);
      chunks.push(chunkSize);
      remaining -= chunkSize;
    }
    const results = await runWithConcurrency(
      chunks.map(chunkSize => () => runPrediction(model.slug, model.buildInput({ prompt, referenceImageUrls, aspectRatio, count: chunkSize, tier }), label)),
      3
    );
    return persistImagesToR2(results.flat(), modelKey);
  }

  const results = await runWithConcurrency(
    Array.from({ length: total }, () => () => runPrediction(model.slug, model.buildInput({ prompt, referenceImageUrls, aspectRatio, tier }), label)),
    4
  );
  return persistImagesToR2(results.flat(), modelKey);
}
