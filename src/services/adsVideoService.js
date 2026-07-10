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

// ── كشف تلقائي: هل المنتج "ملبوس" (تيشيرت، حذاء، فستان...)؟ ولو كذلك، هل العميل
// حدد رغبة معينة (يظهر على شخص ولا لأ، رجل ولا ست) من وصف المنتج نفسه؟ ─────────
async function analyzeProductType(productName, productDesc, customHook) {
  const fallback = { isWearable: false, showPerson: false, genderPref: 'unspecified' };
  if (!GROQ_API_KEY) return fallback;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 100, temperature: 0,
        messages: [
          { role: 'system', content: `Classify a product for an ad video. Determine:
1. "isWearable": true if the product is clothing, shoes, an accessory worn on the body, or similar (e.g. t-shirt, dress, watch, sunglasses, shoes, jacket, hijab, jewelry). false for anything else (food, drinks, electronics, furniture, cosmetics in a bottle, etc.)
2. "showPerson": if isWearable, true UNLESS the product text explicitly says NOT to show it on a person/model (e.g. "no model", "without people", "on a mannequin", "flat lay only", "product only"). Default true when wearable and nothing is said either way.
3. "genderPref": "male" if the text explicitly says men's/for him/boy, "female" if explicitly women's/for her/girl, otherwise "unspecified".
Respond with ONLY raw JSON: {"isWearable": bool, "showPerson": bool, "genderPref": "male"|"female"|"unspecified"}` },
          { role: 'user', content: `Product: "${productName}". Description: "${productDesc || ''}". Note: "${customHook || ''}"` },
        ],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return fallback;
    const parsed = JSON.parse(m[0]);
    return { isWearable: !!parsed.isWearable, showPerson: parsed.showPerson !== false, genderPref: parsed.genderPref || 'unspecified' };
  } catch (e) {
    console.warn('[AdsService] Product type analysis failed, using fallback:', e.message);
    return fallback;
  }
}

// ── Scene configs — بدون "dark background" في أي prompt ──────────────────────
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc, location) =>
      `Professional product advertisement. The exact ${product} from the reference image — keep every single visual detail (shape, color, label, material) perfectly unchanged. ${desc}. Placed naturally within this setting: ${location}. Perfect studio-quality lighting matching this environment, photorealistic 8K commercial photography.`,
    motion: (product) =>
      `The exact ${product} from the reference image slowly rotates 25 degrees revealing its side profile, a soft directional light sweeps across its surface creating a subtle shimmer, camera holds a slow, steady push-in, shallow depth of field, premium commercial product reveal, no other objects enter frame`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc, location) =>
      `Continuing the same story — the exact ${product} from the reference image is now being naturally picked up and used by a real person within the exact same setting established: ${location}. ${desc}. The product itself must remain visually identical to the reference (same shape, color, label) as it moves. Warm, aspirational lighting, cinematic depth, photorealistic 8K commercial photography.`,
    motion: (product) =>
      `A person's hand naturally reaches into frame and picks up the exact ${product} from the reference image, then uses it in a realistic, natural motion appropriate to what this product actually is, camera holds a smooth cinematic arc following the action, shallow depth of field with soft background blur, warm aspirational lighting, the product's exact appearance never changes throughout`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    buildPrompt: (product, desc, location) =>
      `Lifestyle advertisement. The exact ${product} from the reference image — every detail unchanged — shown naturally within this setting: ${location}. ${desc}. Warm natural lighting, aspirational scene, photorealistic.`,
    motion: (product) =>
      `The exact ${product} from the reference image sits in this lifestyle scene, camera performs a slow parallax drift sideways then gently zooms out to reveal the surrounding context, warm bokeh in the background, natural ambient movement (light curtains, soft steam, or similar) appropriate to the setting, aspirational commercial cinematography`,
  },
  {
    id: 'closeup',
    label: 'Close-up',
    buildPrompt: (product, desc, location) =>
      `Macro product photo. The exact ${product} from the reference image — extreme close-up of finest details, unchanged shape and color, with a softly blurred background hinting at this setting: ${location}. ${desc}. Ultra-shallow depth of field, razor-sharp, luxury photography.`,
    motion: (product) =>
      `Ultra slow macro push-in on the exact ${product} from the reference image, its finest surface textures and details gradually come into sharp focus, a single soft light reflection glides across its surface, barely perceptible camera drift, luxury cinematic product macro`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc, location) =>
      `Commercial product photo. The exact ${product} from the reference image — unchanged in every detail — at a dynamic 45-degree angle, on a surface and backdrop consistent with this setting: ${location}. ${desc}. Dramatic side lighting, long elegant shadow, high-end photography.`,
    motion: (product) =>
      `Slow cinematic dolly move left to right around the exact ${product} from the reference image, a long dramatic shadow glides across the surface in sync with the camera, a focused spotlight follows the product, premium high-end advertisement cinematography`,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    buildPrompt: (product, desc) =>
      `Minimalist ad. The exact ${product} from the reference image, unchanged in every detail, on white seamless background, soft shadow below. ${desc}. Clean Apple-style aesthetic, crisp modern photography.`,
    motion: (product) =>
      `The exact ${product} from the reference image gently levitates a few centimeters upward with a soft, weightless motion, then settles back down with a subtle bounce, a soft shadow pulses beneath in sync with the movement, clean minimal modern commercial motion`,
  },
];

// ── سكريبت الإعلان — بيتولّد بـ Groq بميزانية كلمات محسوبة على حسب مدة الفيديو
// الفعلية، عشان الصوت ميعديش وقت الفيديو أبدًا. هووك قوي جدًا + أسلوب إقناعي حقيقي ──
async function generateAdScript(productName, productDesc, customHook, videoDurationSec, lang) {
  // ✅ هامش أمان حقيقي: الكلام الصوتي يستهدف ~70% من مدة الفيديو فقط (مثلاً 10-11
  // ثانية لفيديو 15 ثانية)، عشان الانتقالات بين المشاهد بتاخد وقت من الفيديو الفعلي،
  // ولو TTS اتكلم أبطأ من المتوقع لسه في أمان وميعديش مدة الفيديو أبدًا
  const narrationTarget = Math.max(6, Math.round(videoDurationSec * 0.7));
  const maxWords = Math.round(narrationTarget * (lang === 'ar' ? 2.0 : 2.3)); // معدل كلام متحفظ (TTS بيتكلم أبطأ من الكلام العادي)
  const isAr = lang === 'ar';
  const fallback = isAr
    ? `${customHook || `هل جربت ${productName}؟`} ${productDesc}. ${productName} — جربه دلوقتي.`
    : `${customHook || `Meet ${productName}.`} ${productDesc}. Get ${productName} today.`;

  if (!GROQ_API_KEY) return { script: fallback, targetSeconds: narrationTarget };
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 200, temperature: 0.8,
        messages: [
          { role: 'system', content: `You are an elite direct-response ad copywriter. Write a voiceover script for a short video ad that:
1. Opens with a VERY strong, scroll-stopping hook in the first sentence — create curiosity, desire, or urgency immediately (not a generic greeting).
2. Builds genuine desire for the product using the description given — make the viewer WANT it, don't just list facts.
3. Ends with a short, punchy call-to-action naturally mentioning the product name.
4. STRICT HARD LIMIT: maximum ${maxWords} words total (this is critical — the audio must fit inside a ${narrationTarget}-second video, going over will break the video). Count your words before answering.
5. Write in ${isAr ? 'Egyptian-friendly Modern Standard Arabic' : 'English'}, natural spoken tone, no stage directions, no emojis, no quotation marks.
Output ONLY the script text, nothing else.` },
          { role: 'user', content: `Product: "${productName}". Description: "${productDesc}".${customHook ? ` Preferred hook idea: "${customHook}".` : ''} Max ${maxWords} words.` },
        ],
      }),
    });
    if (!res.ok) return { script: fallback, targetSeconds: narrationTarget };
    const data = await res.json();
    let script = (data.choices?.[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
    // ✅ شبكة أمان إضافية: لو Groq تجاوز حد الكلمات رغم التعليمات، نقصه يدويًا
    const words = script.split(/\s+/).filter(Boolean);
    if (words.length > maxWords + 5) script = words.slice(0, maxWords).join(' ') + '.';
    return { script: script || fallback, targetSeconds: narrationTarget };
  } catch (e) {
    console.warn('[AdsService] Script generation failed, using fallback:', e.message);
    return { script: fallback, targetSeconds: narrationTarget };
  }
}

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

// ── ضمان صارم: الصوت المولّد أبدًا ميتجاوزش مدة الفيديو، مهما كان تقدير الكلمات غير دقيق ──
// بيقيس المدة الحقيقية بـ ffprobe، ولو أطول من المسموح بيسرّعه بلطف (atempo) لحد ما يظبط،
// ولو لسه أطول حتى بعد أقصى تسريع معقول، بيقصه كملاذ أخير كضمان نهائي
async function enforceAudioDuration(audioPath, maxSeconds) {
  try {
    const { stdout } = await execFileAsync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', audioPath]);
    const actual = parseFloat(stdout.trim());
    if (!actual || actual <= maxSeconds + 0.3) return; // في الحدود المسموحة بالفعل
    const speedNeeded = actual / maxSeconds;
    const tempPath = audioPath + '.tmp.mp3';
    if (speedNeeded <= 1.35) {
      // تسريع لطيف (atempo لسه بيحافظ على طبيعية الصوت لحد 1.35x تقريبًا)
      await execFileAsync('ffmpeg', ['-i', audioPath, '-filter:a', `atempo=${speedNeeded.toFixed(3)}`, '-y', tempPath]);
      console.warn(`[AdsService] Voiceover was ${actual.toFixed(1)}s (max ${maxSeconds}s) — sped up ${speedNeeded.toFixed(2)}x`);
    } else {
      // أطول بكتير من المتوقع — التسريع هيبقى غير طبيعي، فبنقص الصوت للحد المسموح كضمان أخير
      await execFileAsync('ffmpeg', ['-i', audioPath, '-t', String(maxSeconds), '-y', tempPath]);
      console.warn(`[AdsService] Voiceover was ${actual.toFixed(1)}s (max ${maxSeconds}s) — too long to speed up naturally, trimmed instead`);
    }
    fs.renameSync(tempPath, audioPath);
  } catch (e) {
    console.warn('[AdsService] Audio duration enforcement failed (non-fatal):', e.message);
  }
}

async function generateAdsVoiceover(script, aiVoiceKey, language, targetSeconds = null) {
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

  const rawFname = `ads_voice_raw_${Date.now()}.mp3`;
  const rawPath = join(process.cwd(), 'outputs', rawFname);
  await downloadFile(audioUrl, rawPath);

  const fname = `ads_voice_${Date.now()}.mp3`;
  const fpath = join(process.cwd(), 'outputs', fname);

  // ✅ FIX: التعليق الصوتي كان بيطلع أطول من الفيديو (23 ثانية على فيديو 15 ثانية).
  // نقيس المدة الحقيقية، ولو أطول من المسموح بيتم تسريعه بلطف (atempo)، ولو لسه
  // أطول حتى بعد أقصى تسريع معقول، بنقصه — عشان الصوت أبدًا ميعديش وقت الفيديو
  if (targetSeconds) {
    let actualDur = null;
    try {
      const { stdout } = await execFileAsync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', rawPath]);
      actualDur = parseFloat(stdout.trim());
    } catch (e) { console.warn('[AdsService] ffprobe failed on voiceover, skipping duration check:', e.message); }

    if (actualDur && actualDur > targetSeconds + 0.5) {
      const speedNeeded = Math.min(actualDur / targetSeconds, 1.3); // أقصى تسريع 1.3x عشان الصوت يفضل طبيعي
      console.warn(`[AdsService] Voiceover ${actualDur.toFixed(1)}s > target ${targetSeconds}s — speeding up ${speedNeeded.toFixed(2)}x`);
      try {
        await execFileAsync('ffmpeg', ['-i', rawPath, '-filter:a', `atempo=${speedNeeded.toFixed(3)}`, '-y', fpath]);
        // لو لسه أطول من المسموح حتى بعد التسريع (كلام كتير جدًا)، نقصه كملاذ أخير
        const { stdout: d2 } = await execFileAsync('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1', fpath]);
        const newDur = parseFloat(d2.trim());
        if (newDur > targetSeconds + 0.8) {
          const trimmed = fpath + '.trim.mp3';
          await execFileAsync('ffmpeg', ['-i', fpath, '-t', String(targetSeconds), '-af', 'afade=t=out:st=' + Math.max(0, targetSeconds-0.4) + ':d=0.4', '-y', trimmed]);
          fs.renameSync(trimmed, fpath);
        }
      } catch (e) {
        console.warn('[AdsService] atempo speed-up failed, using raw audio as-is:', e.message);
        fs.copyFileSync(rawPath, fpath);
      }
      try { fs.unlinkSync(rawPath); } catch {}
    } else {
      fs.renameSync(rawPath, fpath);
    }
  } else {
    fs.renameSync(rawPath, fpath);
  }

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
async function generateAdSceneImage(productImageBase64, productName, productDesc, sceneConfig, ratio, location, wearableInstruction = '') {
  const b64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '');
  const prompt = sceneConfig.buildPrompt(productName, productDesc, location) + wearableInstruction;

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
// ✅ تغييرات: (1) اتشال عنوان اسم المنتج في أول الفيديو خالص، (2) انتقالات حقيقية
// (crossfade) بين المشاهد بدل القطع الجاف، (3) كابشن اختياري، (4) لينك المنتج
// كأنيميشن أنيق في آخر الفيديو لو العميل حدده.
async function composeAdVideo({ animatedScenes, audioPath, ratio, outputDir, jobId, captions, scriptText, productLink }) {
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

  // ── كل كليب بيتقص لمدة ثابتة 5 ثواني بالظبط قبل أي حاجة، عشان توقيت الـ xfade يبقى دقيق ──
  const CLIP_DUR = 5.0;
  const XFADE_DUR = 0.5; // مدة الانتقال بين كل مشهد ومشهد
  const totalDur = numClips > 1 ? (numClips * CLIP_DUR - (numClips - 1) * XFADE_DUR) : CLIP_DUR;

  const inputArgs = clipPaths.flatMap(p => ['-i', p]);
  let voiceInputIdx = -1, musicInputIdx = -1;
  if (hasVoice) { voiceInputIdx = inputArgs.length / 2; inputArgs.push('-i', audioPath); }
  if (hasMusic) { musicInputIdx = inputArgs.length / 2; inputArgs.push('-stream_loop', '-1', '-i', musicFile); }

  const fp = [];
  // ── فيديو: قص كل مشهد لمدة ثابتة، ثم دمجهم بانتقال crossfade حقيقي بينهم ──
  for (let i = 0; i < numClips; i++) {
    fp.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24,trim=0:${CLIP_DUR},setpts=PTS-STARTPTS[sv${i}]`);
  }
  let vLabel;
  if (numClips === 1) {
    fp.push(`[sv0]null[vjoined]`);
    vLabel = 'vjoined';
  } else {
    let prevLabel = 'sv0', cumulativeDur = CLIP_DUR;
    for (let i = 1; i < numClips; i++) {
      const offset = cumulativeDur - XFADE_DUR;
      const outLabel = `vx${i}`;
      fp.push(`[${prevLabel}][sv${i}]xfade=transition=fade:duration=${XFADE_DUR}:offset=${offset.toFixed(2)}[${outLabel}]`);
      cumulativeDur = cumulativeDur + CLIP_DUR - XFADE_DUR;
      prevLabel = outLabel;
    }
    vLabel = prevLabel;
  }

  // ── صوت: نجمع المؤثرات الصوتية الأصلية من كل مشهد — بس لو مفيش تعليق صوتي ──
  const audioLayers = [];
  const audioFilters = [];
  if (!hasVoice) {
    for (let i = 0; i < numClips; i++) {
      fp.push(`[${i}:a]atrim=0:${CLIP_DUR},asetpts=PTS-STARTPTS[sa${i}]`);
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

  let fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const hasArabicText = /[\u0600-\u06FF]/.test((scriptText || '') + (productLink || ''));
  if (hasArabicText) {
    for (const f of ['/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']) {
      if (fs.existsSync(f)) { fontFile = f; break; }
    }
  }

  let vCurrent = vLabel;

  // ── كابشن اختياري — بيتقسم على عدد المشاهد ويظهر كل جزء في توقيت مشهده ──
  if (captions && scriptText?.trim()) {
    const sentences = scriptText.trim().split(/(?<=[.!?؟])\s+/).filter(Boolean);
    const chunks = [];
    const perChunk = Math.max(1, Math.ceil(sentences.length / numClips));
    for (let i = 0; i < sentences.length; i += perChunk) chunks.push(sentences.slice(i, i + perChunk).join(' '));
    while (chunks.length < numClips) chunks.push('');
    const capFs = ratio === '9:16' ? 40 : 34;
    const capY = ratio === '9:16' ? H - 260 : H - 140;
    let cumulativeDur = CLIP_DUR;
    const capFilters = [];
    for (let i = 0; i < Math.min(chunks.length, numClips); i++) {
      const t0 = i === 0 ? 0 : cumulativeDur - XFADE_DUR;
      const t1 = i === 0 ? CLIP_DUR : cumulativeDur - XFADE_DUR + CLIP_DUR;
      if (i > 0) cumulativeDur = cumulativeDur + CLIP_DUR - XFADE_DUR;
      const safe = chunks[i].replace(/\\/g,'\\\\').replace(/'/g,'\u2019').replace(/:/g,'\\:').replace(/\[/g,'\\[').replace(/\]/g,'\\]');
      if (!safe) continue;
      capFilters.push(`drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=black@0.6:fontsize=${capFs}:x=(w-text_w)/2+2:y=${capY}+2:box=1:boxcolor=black@0.35:boxborderw=14:enable='between(t,${t0.toFixed(2)},${t1.toFixed(2)})',`+
        `drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=white:fontsize=${capFs}:x=(w-text_w)/2:y=${capY}:enable='between(t,${t0.toFixed(2)},${t1.toFixed(2)})'`);
    }
    if (capFilters.length) {
      fp.push(`[${vCurrent}]${capFilters.join(',')}[vcaptioned]`);
      vCurrent = 'vcaptioned';
    }
  }

  // ── لينك المنتج — بانر أنيق يظهر بأنيميشن fade في آخر 3 ثواني من الفيديو ──
  if (productLink?.trim()) {
    const safeLink = productLink.trim().replace(/\\/g,'\\\\').replace(/'/g,'\u2019').replace(/:/g,'\\:').replace(/\[/g,'\\[').replace(/\]/g,'\\]');
    const linkStart = Math.max(0, totalDur - 3);
    const bH = ratio==='9:16'?110:90;
    const bY = H - bH - (ratio==='9:16'?60:30);
    const fs2 = ratio==='9:16'?38:32;
    fp.push(
      `[${vCurrent}]drawbox=x=0:y=${bY}:w=${W}:h=${bH}:color=black@0.6:t=fill:enable='between(t,${linkStart.toFixed(2)},${totalDur.toFixed(2)})',`+
      `drawtext=fontfile=${fontFile}:text='🔗 ${safeLink}':fontcolor=white:fontsize=${fs2}:x=(w-text_w)/2:y=${bY+bH/2}-text_h/2:alpha='if(lt(t,${linkStart.toFixed(2)}),0,if(lt(t,${(linkStart+0.4).toFixed(2)}),(t-${linkStart.toFixed(2)})/0.4,1))':enable='between(t,${linkStart.toFixed(2)},${totalDur.toFixed(2)})'[vlinked]`
    );
    vCurrent = 'vlinked';
  }

  fp.push(`[${vCurrent}]fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0,totalDur-0.8).toFixed(1)}:d=0.8[vfinal]`);

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
  ratio, language, sceneCount, customHook,
  captions, productLink,
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

  // ✅ منتجات "ملبوسة" (تيشيرت، حذاء، فستان...) — نظهرها على شخص لابسها إلا لو
  // العميل حدد صراحة إنه مش عايز كده، وبنحترم تفضيل الجنس لو حدده هو
  const productTypeInfo = await analyzeProductType(productName, productDesc.trim(), customHook);
  let wearableInstruction = '';
  if (productTypeInfo.isWearable && productTypeInfo.showPerson) {
    const genderText = productTypeInfo.genderPref === 'male' ? 'a man' : productTypeInfo.genderPref === 'female' ? 'a woman' : 'a person';
    wearableInstruction = ` The product must be shown worn by ${genderText} with a natural, attractive appearance — not displayed as a flat, empty garment or on a mannequin.`;
    console.log(`[AdsService] Wearable product detected — showing worn by ${genderText}`);
  } else if (productTypeInfo.isWearable) {
    console.log(`[AdsService] Wearable product detected — customer requested no person/model shown`);
  }

  // ── 1. FLUX ───────────────────────────────────────────────────────────────
  progress('scenes', `Generating ${count} scenes with FLUX...`);
  const sceneImages = [];
  for (let i = 0; i < selectedScenes.length; i++) {
    const sc = selectedScenes[i];
    try {
      console.log(`[AdsService] [${i+1}/${count}] FLUX: ${sc.label}`);
      const imageUrl = await withRetry429(() => generateAdSceneImage(productImageBase64, productName, productDesc.trim(), sc, ratio, adLocation, wearableInstruction));
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
  let adScriptText = ''; // ✅ محتاجينه بره الـ if عشان نستخدمه في الكابشن لو العميل طلبها
  const videoDurationSec = count * 5;
  if (audioMode === 'ai_voice') {
    progress('voice', 'Writing ad script (Groq)...');
    try {
      const lang = language?.startsWith('ar') ? 'ar' : 'en';
      const { script, targetSeconds } = await generateAdScript(productName, productDesc.trim(), customHook||'', videoDurationSec, lang);
      console.log(`[AdsService] Ad script (target ${targetSeconds}s): ${script}`);
      adScriptText = script;
      progress('voice', 'Generating AI voiceover (Gemini 3.1 Flash TTS)...');
      audioPath = await withRetry429(() => generateAdsVoiceover(script, aiVoiceKey||'male_arabic', language||'ar', targetSeconds));
      // ✅ ضمان صارم: الصوت أبدًا مش هيتجاوز مدة الفيديو الفعلية (بهامش أمان ثانية واحدة)
      await enforceAudioDuration(audioPath, Math.max(5, videoDurationSec - 1));
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
      const motionPrompt = scene.motion(productName) + wearableInstruction;
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
    animatedScenes, audioPath, ratio, outputDir, jobId,
    captions: !!captions, scriptText: adScriptText, productLink,
  });

  progress('done', 'Ad video ready!');
  return { outputPath, sceneCount: animatedScenes.length };
}

export function buildAdScript(n, d, lang, h='') {
  return SCRIPT_TEMPLATES[lang?.startsWith('ar')?'ar':'en'](n, d||'', h);
}