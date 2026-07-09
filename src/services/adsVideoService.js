// ── adsVideoService.js ────────────────────────────────────────────────────────
// Pipeline:
//   1. FLUX kontext-dev → صورة reference
//   2. seedance-2.0-fast I2V بـ [Image1] في الـ prompt (مدعوم على Replicate)
//   3. FFmpeg → دمج + عنوان + fade

import fetch from 'node-fetch';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// ── Ads model uses its OWN dedicated voice model (google/gemini-3.1-flash-tts on Replicate) ──
// ⚠️ لا تستخدم generateVoiceover من voiceService.js هنا — كل باقي الموقع شغال بـ Edge TTS
// وده متعمّد ومتفق عليه، وموديل الإعلانات بس هو المفروض يستخدم Gemini 3.1 Flash TTS.

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

// ── تحديد مكان/بيئة ثابتة ومتسقة للإعلان بناءً على المنتج ووصفه ──────────────
// عشان مثلاً علبة لبن تظهر في مزرعة أبقار، وساعة فاخرة تظهر في محل مجوهرات، إلخ
// المكان ده بيتثبت ويتكرر في كل المشاهد عشان الإعلان يبقى متسق ومتتابع منطقيًا
async function determineAdLocation(productName, productDesc) {
  const fallback = 'a clean, modern professional studio setting appropriate for this product category';
  if (!GROQ_API_KEY) return fallback;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 120, temperature: 0.4,
        messages: [
          { role: 'system', content: 'You are an expert commercial ad director. Given a product, pick ONE specific, realistic, visually-rich real-world location/environment that best fits this exact product for an advertisement — the kind a real ad agency would choose. Examples: milk product → a sunlit dairy farm with cows in the background; luxury watch → an elegant jewelry boutique display; running shoes → an outdoor running track at sunrise; coffee → a cozy rustic cafe interior. Output ONLY the location description in English, max 20 words, no explanation, no quotes.' },
          { role: 'user', content: `Product: "${productName}". Description: "${productDesc}". Best advertisement location:` },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const loc = (data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
    return loc || fallback;
  } catch (e) {
    console.warn('[AdsService] Location determination failed, using fallback:', e.message);
    return fallback;
  }
}

// ── تحديد موثرات صوتية محددة ومناسبة للمنتج والمكان — بتتكرر في كل مشاهد ─────
// بدل عبارة عامة زي "ambient sound"، بنطلب من الموديل يحدد 2-3 أصوات حقيقية
// تناسب المنتج والمكان بالظبط (زي مثلاً علبة لبن في مزرعة → "cow moos, distant birdsong, gentle wind")
async function determineAdSoundEffects(productName, productDesc, location) {
  const fallback = 'soft ambient room tone, subtle air movement';
  if (!GROQ_API_KEY) return fallback;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 80, temperature: 0.4,
        messages: [
          { role: 'system', content: 'You are a professional sound designer for commercial ads. Given a product and its setting, list 2-3 SPECIFIC, realistic sound effects that would genuinely be heard in that exact scene (never music, never generic words like "ambient sound"). Examples: dairy farm → "cow moos softly, distant birdsong, gentle breeze through grass"; jewelry boutique → "soft footsteps on marble, faint clink of glass display cases"; running track → "sneakers striking pavement, steady breathing, wind past ears". Output ONLY a short comma-separated list in English, max 15 words, no explanation, no quotes.' },
          { role: 'user', content: `Product: "${productName}". Description: "${productDesc}". Setting: "${location}". Specific sound effects for this scene:` },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const sfx = (data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
    return sfx || fallback;
  } catch (e) {
    console.warn('[AdsService] Sound effects determination failed, using fallback:', e.message);
    return fallback;
  }
}

// ── Scene configs — بدون "dark background" في أي prompt ──────────────────────
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc, location) =>
      `Professional product advertisement. The exact ${product} from the reference image — keep every detail. ${desc}. Setting: ${location}. Perfect studio-quality lighting matching this environment, photorealistic 8K commercial photography.`,
    motion: (product) =>
      `The ${product} product slowly rotates revealing all sides, subtle light shimmer, cinematic slow motion product reveal, professional advertisement`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    buildPrompt: (product, desc, location) =>
      `Lifestyle advertisement. The exact ${product} from the reference image, shown naturally within this setting: ${location}. ${desc}. Warm natural lighting, aspirational scene, photorealistic.`,
    motion: (product) =>
      `The ${product} in lifestyle setting, gentle parallax motion, slow zoom out revealing context, warm bokeh, aspirational advertisement`,
  },
  {
    id: 'closeup',
    label: 'Close-up',
    buildPrompt: (product, desc, location) =>
      `Macro product photo. The exact ${product} from the reference image — extreme close-up of finest details, with a softly blurred background hinting at this setting: ${location}. ${desc}. Ultra-shallow depth of field, razor-sharp, luxury photography.`,
    motion: (product) =>
      `The ${product} ultra slow macro push-in, finest surface details emerge, barely perceptible camera drift, luxury cinematic`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc, location) =>
      `Commercial product photo. The exact ${product} at a dynamic 45-degree angle, on a surface and backdrop consistent with this setting: ${location}. ${desc}. Dramatic side lighting, long elegant shadow, high-end photography.`,
    motion: (product) =>
      `The ${product} slow cinematic dolly left to right, shadow glides across surface, spotlight follows product`,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    buildPrompt: (product, desc) =>
      `Minimalist ad. The exact ${product} on white seamless background, soft shadow below. ${desc}. Clean Apple-style aesthetic, crisp modern photography.`,
    motion: (product) =>
      `The ${product} gently levitates upward and settles, clean modern bounce, soft shadow pulse beneath`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc, location) =>
      `Product-in-use advertisement. The exact ${product} being elegantly used within this setting: ${location}. ${desc}. Aspirational energy, cinematic depth shift, commercial photography.`,
    motion: (product) =>
      `The ${product} in use, cinematic camera arc reveals product, dynamic depth of field shift, aspirational energy`,
  },
];

const SCRIPT_TEMPLATES = {
  ar: (n, d, h) => `${h||`هل تعرف سر ${n}؟`}\n\n${d}\n\nصُنع بدقة. صُمم لك.\n\n${n} — لأنك تستحق الأفضل.`,
  en: (n, d, h) => `${h||`What if one product could change everything?`}\n\nIntroducing ${n}.\n\n${d}\n\nCrafted with precision. Designed for you.\n\n${n} — Because you deserve the best.`,
};

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
  return destPath;
}

// ── موسيقى خلفية ثابتة من مجلد assets/music — نفس المقطوعة لكل مشاهد الإعلان ──
// (بدل ما Seedance يولّد موسيقى عشوائية مختلفة في كل مشهد، ده كان بيكسر الاتساق)
function findMusicFile() {
  const dir = join(process.cwd(), 'assets', 'music');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (!files.length) return null;
  return join(dir, files[Math.floor(Math.random() * files.length)]);
}

// ── google/gemini-3.1-flash-tts (Replicate) — الصوت المخصص لموديل الإعلانات بس ────────
// Schema اتأكد منه من صفحة الموديل الرسمية على Replicate: text / voice / prompt (style) / language_code
const GEMINI_VOICE_MAP = {
  male_arabic:   'Charon',   // Male, Informative — مناسب لصوت راوي إعلان واثق
  female_arabic: 'Sulafat',  // Female, Warm
  male_american: 'Puck',     // Male, Upbeat
  female_american: 'Kore',   // Female, Firm
  male_wise:     'Orus',
  female_wise:   'Gacrux',
  male_young:    'Fenrir',
  female_young:  'Leda',
  male_child:    'Achird',
  female_child:  'Autonoe',
};

async function generateAdsVoiceover(script, aiVoiceKey, language) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const voice = GEMINI_VOICE_MAP[aiVoiceKey] || (String(aiVoiceKey||'').startsWith('female') ? 'Sulafat' : 'Charon');
  const langCode = language?.startsWith('ar') ? 'ar-EG' : 'en-US';
  const stylePrompt = 'A confident, warm advertisement narrator recording a commercial voiceover. Clear, persuasive, upbeat energy, natural pacing with brief pauses at commas and periods so the delivery breathes naturally — never rushed or robotic.';

  const res = await fetch('https://api.replicate.com/v1/models/google/gemini-3.1-flash-tts/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({ input: { text: script, voice, prompt: stylePrompt, language_code: langCode } }),
  });
  if (!res.ok) throw new Error(`GeminiTTS ${res.status}: ${(await res.text()).slice(0,300)}`);
  const data = await res.json();
  if (data.error) throw new Error(`GeminiTTS: ${data.error}`);

  let audioUrl;
  if (data.status === 'succeeded' && data.output) {
    audioUrl = Array.isArray(data.output) ? data.output[0] : data.output;
  } else if (data.id) {
    audioUrl = await pollPrediction(data.id, 120000, 'Gemini 3.1 Flash TTS');
  } else {
    throw new Error(`No prediction ID from GeminiTTS: ${JSON.stringify(data).slice(0,200)}`);
  }
  if (!audioUrl) throw new Error('GeminiTTS returned no audio URL');

  const fname = `ads_voice_${Date.now()}.mp3`;
  const fpath = join(process.cwd(), 'outputs', fname);
  await downloadFile(audioUrl, fpath);
  console.log(`[AdsService] Gemini TTS voice generated (${voice}, ${langCode}) → ${fname}`);
  return fpath;
}


// ── إعادة محاولة تلقائية عند 429 (rate limit بسبب رصيد Replicate أقل من $5) ──
// بيقرأ retry_after من رسالة الخطأ نفسها لو موجودة، وإلا بيستنى 15 ثانية افتراضيًا
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
      console.warn(`[AdsService] 429 rate limited, retrying in ${waitSec}s (attempt ${attempt+1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

async function pollPrediction(predictionId, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    console.log(`[AdsService] ${label} → ${data.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`${label} failed: ${data.error}`);
  }
  throw new Error(`${label} timed out`);
}

// ── Step 1: FLUX kontext-dev ──────────────────────────────────────────────────
async function generateAdSceneImage(productImageBase64, productName, productDesc, sceneConfig, ratio, location) {
  const b64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '');
  const prompt = sceneConfig.buildPrompt(productName, productDesc, location);

  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({
      input: {
        input_image: `data:image/jpeg;base64,${b64}`,
        prompt,
        aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
        output_format: 'webp',
        output_quality: 90,
        guidance: 3.5,
        num_inference_steps: 28,
      },
    }),
  });

  if (!res.ok) throw new Error(`FLUX ${res.status}: ${(await res.text()).slice(0,200)}`);
  const data = await res.json();
  if (data.error) throw new Error(`FLUX: ${data.error}`);
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error('No prediction ID from FLUX');
  return await pollPrediction(data.id, 180000, `FLUX "${sceneConfig.label}"`);
}

// ── Step 2a: Seedance 2.0 Fast I2V — طريقة "من غير صوت متكلم" ─────────────────
// ✅ REAL FIX (تم التأكد من الـ schema الرسمي بتاع Replicate): الموديل ده مالوش حقل اسمه
// first_frame_image خالص — هو موديل موحّد (multimodal) والمدخل الوحيد بتاع الصور هو array
// اسمه "images" (لحد 9 صور)، وتحديد إن الصورة دي "الإطار الأول" بيتحدد من صياغة البرومبت
// نفسه ([Image1] + جملة توضح إنها الفريم الأول)، مش من parameter منفصل زي ما كنا فاكرين.
// كان بيتبعت first_frame_image وهو حقل مش موجود، فـ Replicate كانت بتتجاهله بصمت وترجع
// تعمل الفيديو من الصفر بناءً على البرومبت بس — وده بالظبط اللي كان بيحصل.
async function animateWithSeedance2(imageUrl, motionPrompt, ratio, soundEffects) {
  const sfx = soundEffects || 'soft ambient room tone, subtle air movement';
  const anchoredPrompt =
    `[Image1] is the exact first frame of this video — its composition, framing, product and background must stay completely unchanged in the opening instant, then animate forward from it. ${motionPrompt}. ` +
    `No background music, no music of any kind. Sound design for this exact scene: ${sfx}.`;

  const input = {
    prompt: anchoredPrompt,
    images: [imageUrl],   // ← المدخل الصح الوحيد للصور على الـ schema الموحّد ده
    aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
    resolution: '480p',
    duration: 5,
    generate_audio: true,
  };

  console.log(`[AdsService] Seedance 2.0 Fast I2V (images[] + [Image1] anchor) → ${imageUrl?.slice(0,80)}`);
  console.log(`[AdsService] Motion prompt: ${motionPrompt.slice(0,100)}`);

  const res = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-2.0-fast/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) throw new Error(`Seedance ${res.status}: ${(await res.text()).slice(0,300)}`);
  const data = await res.json();
  console.log(`[AdsService] Seedance response: status=${data.status} error=${data.error||'none'}`);
  if (data.error) throw new Error(`Seedance: ${data.error}`);
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error(`No prediction ID from Seedance: ${JSON.stringify(data).slice(0,200)}`);
  return await pollPrediction(data.id, 420000, `Seedance 2.0 Fast`);
}

// ── Step 2b: Seedance 1 Pro Fast I2V — طريقة "مع صوت متكلم (voice over)" ──────
// ✅ ده نفس الـ model slug (bytedance/seedance-1-pro-fast) اللي شغال بالفعل في موديل 4
// (seedanceService.js) من غير صورة — يعني الـ endpoint ده مؤكد 100% إنه موجود، مفيش خطر 404.
// الجديد هنا بس إننا بنضيف حقل "image" (مفرد) عشان يشتغل Image-to-Video بدل Text-to-Video —
// اتأكد من اسم الحقل ده من أكتر من مصدر بيعكس نفس schema الـ Replicate الرسمي لنفس العيلة.
// أرخص من seedance-2.0-fast زي ما طلبت، والصوت بيتعمله mute بعدين في الـ FFmpeg.
async function animateWithSeedance1ProFast(imageUrl, motionPrompt, ratio) {
  const input = {
    prompt: `${motionPrompt}. Keep the exact product and setting from the reference image unchanged, only add motion.`,
    image: imageUrl,   // ← بارامتر مفرد لتحريك الصورة
    aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
    resolution: '480p',
    duration: 5,
    camera_fixed: false,
  };

  console.log(`[AdsService] Seedance 1 Pro Fast I2V (image) → ${imageUrl?.slice(0,80)}`);

  const res = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-1-pro-fast/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) throw new Error(`Seedance1ProFast ${res.status}: ${(await res.text()).slice(0,300)}`);
  const data = await res.json();
  if (data.error) throw new Error(`Seedance1ProFast: ${data.error}`);
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error(`No prediction ID from Seedance1ProFast: ${JSON.stringify(data).slice(0,200)}`);
  return await pollPrediction(data.id, 420000, `Seedance 1 Pro Fast`);
}

// ── Step 3: FFmpeg compose ────────────────────────────────────────────────────
async function composeAdVideo({ animatedScenes, productName, showTitle, audioPath, ratio, outputDir, jobId }) {
  const [W, H] = ratio === '9:16' ? [1080, 1920] : [1920, 1080];
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const clipPaths = [];
  for (let i = 0; i < animatedScenes.length; i++) {
    const cp = join(TEMP_DIR, `ads_${jobId}_${i}.mp4`);
    await downloadFile(animatedScenes[i].videoUrl, cp);
    clipPaths.push(cp);
    console.log(`[AdsService] ✓ Clip ${i+1} downloaded`);
  }

  const numClips = clipPaths.length;
  const hasVoice = !!(audioPath && fs.existsSync(audioPath));
  const musicFile = findMusicFile();
  const hasMusic = !!musicFile;
  console.log(`[AdsService] Audio layers → voice: ${hasVoice} | music: ${hasMusic ? musicFile : 'none found'}`);

  let fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  if (/[\u0600-\u06FF]/.test(productName)) {
    for (const f of ['/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']) {
      if (fs.existsSync(f)) { fontFile = f; break; }
    }
  }

  const totalDur = numClips * 5.5;
  const inputArgs = clipPaths.flatMap(p => ['-i', p]);
  let voiceInputIdx = -1, musicInputIdx = -1;
  if (hasVoice) { voiceInputIdx = inputArgs.length / 2; inputArgs.push('-i', audioPath); }
  if (hasMusic) { musicInputIdx = inputArgs.length / 2; inputArgs.push('-stream_loop', '-1', '-i', musicFile); }

  const fp = [];
  // ── فيديو: قص وضبط كل مشهد ثم دمجهم ──
  for (let i = 0; i < numClips; i++) {
    fp.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[sv${i}]`);
  }
  fp.push(`${clipPaths.map((_,i)=>`[sv${i}]`).join('')}concat=n=${numClips}:v=1:a=0[vconcat]`);

  // ── صوت: نجمع المؤثرات الصوتية الأصلية من كل مشهد — بس لو مفيش تعليق صوتي ──
  // (لو فيه voice over، الكليبات جايه من seedance-1.5-pro-fast وممكن تيجي من غير صوت أصلاً،
  // وعلى العموم الصوت النهائي المطلوب في الحالة دي = التعليق + الموسيقى بس، فبنعمل mute للكليبات)
  const audioLayers = [];
  const audioFilters = [];
  if (!hasVoice) {
    for (let i = 0; i < numClips; i++) {
      fp.push(`[${i}:a]atrim=0:5.5,asetpts=PTS-STARTPTS[sa${i}]`);
    }
    fp.push(`${clipPaths.map((_,i)=>`[sa${i}]`).join('')}concat=n=${numClips}:v=0:a=1[asfx]`);
    audioLayers.push('[asfx]');
  }
  if (hasMusic) {
    audioFilters.push(`[${musicInputIdx}:a]atrim=0:${totalDur.toFixed(1)},asetpts=PTS-STARTPTS,volume=0.18[amusic]`);
    audioLayers.push('[amusic]');
  }
  if (hasVoice) {
    audioFilters.push(`[${voiceInputIdx}:a]volume=1.0[avoice]`);
    audioLayers.push('[avoice]');
  }
  fp.push(...audioFilters);
  fp.push(`${audioLayers.join('')}amix=inputs=${audioLayers.length}:duration=first:dropout_transition=2[amixed]`);

  if (showTitle && productName.trim()) {
    const safe = productName.trim()
      .replace(/\\/g,'\\\\').replace(/'/g,'\u2019')
      .replace(/:/g,'\\:').replace(/\[/g,'\\[').replace(/\]/g,'\\]');
    const fs2 = ratio==='9:16'?72:60;
    const bH = ratio==='9:16'?240:200;
    const bY = Math.floor((H-bH)/2);
    fp.push(
      `[vconcat]drawbox=x=0:y=${bY}:w=${W}:h=${bH}:color=black@0.55:t=fill:enable='between(t,0,3.5)',`+
      `drawbox=x=0:y=${bY}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',`+
      `drawbox=x=0:y=${bY+bH-3}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',`+
      `drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=black@0.5:fontsize=${fs2}:x=(w-text_w)/2+3:y=(h-text_h)/2+3:enable='between(t,0,3.5)',`+
      `drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=white:fontsize=${fs2}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,3.5)'[vtitled]`
    );
  } else {
    fp.push(`[vconcat]null[vtitled]`);
  }

  fp.push(`[vtitled]fade=t=in:st=0:d=0.6,fade=t=out:st=${(totalDur-1.2).toFixed(1)}:d=1.0[vfinal]`);

  const outputPath = join(outputDir, `ad_${jobId}.mp4`);
  const args = [...inputArgs, '-filter_complex', fp.join(';'), '-map', '[vfinal]', '-map', '[amixed]', '-c:a', 'aac', '-b:a', '128k', '-shortest'];
  args.push('-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-y',outputPath);

  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 200*1024*1024 });
  } catch (err) {
    throw new Error('FFmpeg: ' + (err.stderr?.toString().slice(-600) || err.message));
  }

  setTimeout(() => { clipPaths.forEach(f => { try { fs.unlinkSync(f); } catch {} }); }, 60000);
  return outputPath;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function renderAdVideo({
  productImageBase64, productName, productDesc,
  audioMode, uploadedAudioPath, aiVoiceKey,
  ratio, language, sceneCount, customHook, showTitle,
  outputDir, jobId, onProgress,
}) {
  const progress = (step, msg) => { console.log(`[AdsService][${jobId}] ${step}: ${msg}`); onProgress?.({ step, msg }); };

  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  if (!productDesc?.trim()) throw new Error('Product description is required');

  const count = Math.min(Math.max(parseInt(sceneCount)||5, 3), SCENE_CONFIGS.length);
  const selectedScenes = SCENE_CONFIGS.slice(0, count);
  console.log(`[AdsService] ${count} scenes: ${selectedScenes.map(s=>s.label).join(', ')}`);

  // ── 0. تحديد مكان/بيئة ثابتة للإعلان كله بناءً على المنتج ─────────────────
  progress('scenes', 'Determining the best setting for this product...');
  const adLocation = await determineAdLocation(productName, productDesc.trim());
  console.log(`[AdsService] Determined ad location: ${adLocation}`);
  // ✅ موثرات صوتية محددة بدقة على حسب المنتج والمكان (مش عبارة عامة) — بتتكرر في كل مشاهد
  const adSoundEffects = await determineAdSoundEffects(productName, productDesc.trim(), adLocation);
  console.log(`[AdsService] Determined sound effects: ${adSoundEffects}`);

  // ── 1. FLUX ───────────────────────────────────────────────────────────────
  progress('scenes', `Generating ${count} scenes with FLUX...`);
  const sceneImages = [];
  for (let i = 0; i < selectedScenes.length; i++) {
    const sc = selectedScenes[i];
    try {
      console.log(`[AdsService] [${i+1}/${count}] FLUX: ${sc.label}`);
      const imageUrl = await withRetry429(() => generateAdSceneImage(productImageBase64, productName, productDesc.trim(), sc, ratio, adLocation));
      console.log(`[AdsService] ✓ FLUX ${i+1}: ${imageUrl}`);
      sceneImages.push({ ...sc, imageUrl });
      progress('scenes', `Scene ${i+1}/${count}: ${sc.label} ✓`);
      if (i < selectedScenes.length - 1) await new Promise(r => setTimeout(r, 11000));
    } catch (err) {
      console.error(`[AdsService] ✗ FLUX "${sc.label}": ${err.message}`);
    }
  }
  if (sceneImages.length === 0) throw new Error('All FLUX scene generation failed');

  // ── 2. Audio ──────────────────────────────────────────────────────────────
  let audioPath = null;
  if (audioMode === 'ai_voice') {
    progress('voice', 'Generating AI voiceover (Gemini 3.1 Flash TTS)...');
    try {
      const lang = language?.startsWith('ar') ? 'ar' : 'en';
      const script = SCRIPT_TEMPLATES[lang](productName, productDesc.trim(), customHook||'');
      audioPath = await withRetry429(() => generateAdsVoiceover(script, aiVoiceKey||'male_arabic', language||'ar'));
    } catch (err) { console.warn('[AdsService] Voiceover failed:', err.message); }
  } else if (audioMode === 'upload' && uploadedAudioPath) {
    audioPath = uploadedAudioPath;
  }

  const hasVoice = !!audioPath;

  // ── 3. Animate ────────────────────────────────────────────────────────────
  // ✅ FIX: الحساب عنده رصيد أقل من $5 فبيتقلل السرعة لـ 6 طلبات/دقيقة (طلب كل ~10 ثواني تقريبًا).
  // زي ما عملنا مع FLUX بالظبط، لازم تأخير بين كل نداء animate + إعادة محاولة تلقائية لو حصل 429.
  const animateLabel = hasVoice ? 'Seedance 1 Pro Fast' : 'Seedance 2.0';
  progress('animate', `Animating ${sceneImages.length} scenes with ${animateLabel}...`);
  const animatedScenes = [];
  for (let i = 0; i < sceneImages.length; i++) {
    const scene = sceneImages[i];
    try {
      const motionPrompt = scene.motion(productName);
      console.log(`[AdsService] [${i+1}/${sceneImages.length}] ${animateLabel}: ${scene.label}`);
      const videoUrl = hasVoice
        ? await withRetry429(() => animateWithSeedance1ProFast(scene.imageUrl, motionPrompt, ratio))
        : await withRetry429(() => animateWithSeedance2(scene.imageUrl, motionPrompt, ratio, adSoundEffects));
      animatedScenes.push({ ...scene, videoUrl });
      console.log(`[AdsService] ✓ Animated ${i+1}: ${scene.label}`);
      progress('animate', `Animated ${i+1}/${sceneImages.length}: ${scene.label} ✓`);
    } catch (err) {
      console.error(`[AdsService] ✗ Animate "${scene.label}": ${err.message}`);
    }
    // ── تأخير بين كل مشهد ومشهد عشان نتجنب الـ 429 (نفس الأسلوب المستخدم مع FLUX) ──
    if (i < sceneImages.length - 1) await new Promise(r => setTimeout(r, 16000));
  }
  if (animatedScenes.length === 0) throw new Error('All animation attempts failed');

  // ── 4. FFmpeg ─────────────────────────────────────────────────────────────
  progress('compose', `Composing ${animatedScenes.length} clips...`);
  const outputPath = await composeAdVideo({
    animatedScenes, productName, showTitle: showTitle !== false,
    audioPath, ratio, outputDir, jobId,
  });

  progress('done', 'Ad video ready!');
  return { outputPath, sceneCount: animatedScenes.length };
}

export function buildAdScript(n, d, lang, h='') {
  return SCRIPT_TEMPLATES[lang?.startsWith('ar')?'ar':'en'](n, d||'', h);
}