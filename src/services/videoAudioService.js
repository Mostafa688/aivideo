// ── videoAudioService.js ──────────────────────────────────────────────────────
// طلب العميل: النظام الجديد (نانو بنانا/سيدانس/فيو3/...) كان مفيهوش فويس أوفر/كابشن/موسيقى
// خالص (الموديلات القديمة 1-8 كان فيها الحاجات دي built-in) — ده بيقفل الفجوة دي كطبقة
// post-processing فوق أي فيديو اتعمل بالنظام الجديد:
//   1. فويس أوفر: Gemini TTS الحقيقي على Replicate (google/gemini-3.1-flash-tts) — بنولّده
//      الأول، نقيس مدته الحقيقية بـffprobe، وبعدين نولّد الفيديو بمدة كافية تسع السرد كامل
//      (مش العكس)، وبعدين ندمج صوت السرد على الفيديو بـffmpeg.
//   2. كابشن: بنفرّغ صوت السرد بـWhisper (Groq — سريع ومتاح عندنا بالفعل)، نبني منه SRT
//      حقيقي بتوقيتات دقيقة (مش تخمين Replicate)، وبعدين نبعت الفيديو + الـSRT لموديل
//      fictions-ai/autocaption على Replicate اللي بيحرق الكابشن على الفيديو فعليًا.
//   3. موسيقى خلفية: "ستايل يوتيوب" بياخد ملف عشوائي من assets/music/ (مكتبة يوتيوب أصلية
//      حطها العميل بنفسه)؛ الستايل العادي بيجيب مقطوعة CC0 حقيقية من Freesound API (مجاني،
//      استخدام تجاري كامل بدون أي attribution — استبدلنا Jamendo بيه لأن الـfree tier بتاعه
//      كان "non-commercial use" بس، خطر ترخيصي حقيقي لمنتج تجاري زي ده).
//
// ✅ حقول gemini-3.1-flash-tts مؤكدة 100% دلوقتي (العميل بعت سكرين شوت لصفحة الـInput schema
// الحقيقية على Replicate: text/voice/prompt/language_code) — مش تخمين تاني. أسماء الأصوات
// التفصيلية لسه غير موثقة بالكامل (Kore مؤكدة كافتراضي، الباقي أفضل تخمين).
// ✅ حقول fictions-ai/autocaption الأساسية مؤكدة 100% دلوقتي كمان (سكرين شوت تاني من العميل
// لصفحة الـInput schema الحقيقية: font/color/kerning/opacity/MaxChars/fontsize/translate/
// output_video/stroke_color/stroke_width/right_to_left/subs_position/highlight_color/
// video_file_input/output_transcript/transcript_file_input). الحاجة الوحيدة المتبقية أفضل
// تخمين: شكل محتوى transcript_file_input بالظبط (uri لملف JSON بصيغة [{word,start,end}] —
// مبني على كود المصدر المفتوح للموديل على GitHub، مش قراءة مباشرة من الـwrapper الحقيقي).
// ⚠ Freesound مكتبة مؤثرات صوتية/تسجيلات مجتمعية بالأساس، مش مكتبة أغاني مُلحّنة زي Jamendo —
// فلترنا بالمدة والكلمة المفتاحية "music" عشان نقلل مؤثرات قصيرة، بس جودة/تنوع "موسيقى خلفية"
// حقيقية فيها أقل من مكتبة موسيقى مُلحّنة بالكامل. يستاهل مراجعة حية بعد الإطلاق.

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const FREESOUND_API_KEY = process.env.FREESOUND_API_KEY;
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';
const LOCAL_MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');

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

function replicateHeaders() {
  return { Authorization: `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', Prefer: 'wait' };
}

async function pollPrediction(predictionId, label, timeoutMs = 5 * 60 * 1000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`${label} failed: ${JSON.stringify(data.error || data.logs?.slice(-300))}`);
  }
  throw new Error(`${label} timed out`);
}

// ✅ FIX (باج حقيقي في الإنتاج — حرق الكابشن بيفشل بـ404 "resource could not be found"):
// شكل الـ"models/{owner}/{slug}/predictions" (من غير "version") ده بيشتغل بس للموديلات
// اللي بتدعم "latest version" الرسمية عن طريق الشورت-هاند ده — مش كل الموديلات على Replicate
// بتدعمه (تأكد من العميل نفسه من صفحة الـAPI الحقيقية لـfictions-ai/autocaption: الاستخدام
// الرسمي المطلوب بتاعه هو endpoint عام "/v1/predictions" + حقل "version" صريح (هاش مثبّت)،
// مش الشورت-هاند بالاسم). بنضيف باراميتر "version" اختياري هنا: لو موجود، نستخدم الـendpoint
// العام بالهاش المثبّت (زي fictions-ai/autocaption)؛ لو مش موجود، نفضل نستخدم الشورت-هاند
// بالاسم زي ما هو (شغال فعلاً للموديلات التانية زي google/gemini-3.1-flash-tts)
async function runReplicatePrediction(slug, input, label, version = null) {
  const url = version ? 'https://api.replicate.com/v1/predictions' : `https://api.replicate.com/v1/models/${slug}/predictions`;
  const body = version ? { version, input } : { input };
  const res = await fetch(url, {
    method: 'POST', headers: replicateHeaders(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (data.error) throw new Error(`${label}: ${data.error}`);
  let output = data.status === 'succeeded' ? data.output : null;
  if (!output && data.id) output = await pollPrediction(data.id, label);
  if (!output) throw new Error(`${label} returned no output`);
  return output;
}

function getMediaDuration(filePath) {
  const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, { encoding: 'utf8' }).trim();
  return parseFloat(out) || 0;
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to download ${url}: ${res.status}`);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

// ── 1. فويس أوفر (Gemini TTS via Replicate) ──────────────────────────────────
// ✅ FIX (مؤكد من صفحة الموديل الحقيقية نفسها — العميل بعت سكرين شوت للـ Input schema):
// الحقول الحقيقية هي "text"، "voice" (مش "voice_name")، "prompt" (توجيه أسلوب الإلقاء —
// نبرة/سرعة/مشاعر، افتراضي "Say the following.")، و"language_code" (كود لغة كامل زي
// "en-US" مش "en" بس). أسماء الأصوات الفعلية لسه مش موثقة بالكامل علنًا — "Kore" مؤكدة
// (الافتراضي في الـschema نفسه)، الباقي (Charon/Puck) من أمثلة حقيقية شايفناها بره الموديل
const GEMINI_VOICE_MAP = {
  male_wise: 'Charon', male_american: 'Puck', male_arabic: 'Charon',
  female_american: 'Kore', female_arabic: 'Kore', none: 'Kore',
};
// لغة قصيرة (زي باقي الحقول في البرومبت: en/ar) → كود لغة كامل حقيقي يقبله الموديل
const GEMINI_LANGUAGE_MAP = {
  en: 'en-US', ar: 'ar-EG', ar_eg: 'ar-EG', ar_gulf: 'ar-XA', es: 'es-US', fr: 'fr-FR', de: 'de-DE',
};

/**
 * يولّد صوت سرد حقيقي من نص عن طريق Gemini TTS، ينزّله محليًا، ويرجّع مساره + مدته
 * الحقيقية بالثواني (مقاسة بـffprobe مش تقدير كلمات) — دي المدة اللي المفروض الفيديو
 * يتولّد بيها عشان السرد يسع كامل من غير ما يتقطع.
 */
export async function synthesizeNarration(script, { voiceKey = 'male_wise', languageCode = null, stylePrompt = null } = {}) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  if (!script?.trim()) throw new Error('narration script is required');
  const voiceName = GEMINI_VOICE_MAP[voiceKey] || 'Kore';
  const langCode = languageCode ? (GEMINI_LANGUAGE_MAP[languageCode] || languageCode) : undefined;
  const input = {
    text: script.trim(),
    voice: voiceName,
    prompt: stylePrompt || 'Say the following in a warm, natural, engaging narrator tone.',
    ...(langCode ? { language_code: langCode } : {}),
  };
  const output = await runReplicatePrediction('google/gemini-3.1-flash-tts', input, 'Gemini TTS narration');
  const audioUrl = Array.isArray(output) ? output[0] : output;

  const jobId = `narr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(TEMP_DIR, jobId);
  await mkdir(workDir, { recursive: true });
  const audioPath = path.join(workDir, 'narration.mp3');
  await downloadToFile(audioUrl, audioPath);
  const durationSec = getMediaDuration(audioPath);
  if (!durationSec) throw new Error('could not measure narration audio duration');
  return { audioPath, durationSec, workDir };
}

// ── 2. تفريغ صوت السرد بتوقيتات لكل كلمة (Whisper عبر Groq — سريع وموجود بالفعل) ──
/**
 * يفرّغ ملف صوت لكلمات بتوقيتات حقيقية (start/end لكل كلمة، مش كل جملة) عن طريق
 * Groq Whisper — أسرع وأرخص بكتير من موديل Whisper منفصل على Replicate. بيرجع
 * مصفوفة {word,start,end} — نفس الشكل اللي fictions-ai/autocaption بيستخدمه
 * داخليًا (شفناه في الكود المصدري المفتوح بتاعه على GitHub: wordlevel_info =
 * [{word, start, end}, ...]) — ده أفضل أساس متاح لبناء transcript_file_input.
 */
export async function transcribeWithTimestamps(audioPath) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath), { filename: 'narration.mp3', contentType: 'audio/mpeg' });
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: 'Bearer ' + GROQ_API_KEY, ...form.getHeaders() }, body: form,
  });
  if (!res.ok) throw new Error(`Whisper transcription error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const words = (data.words || []).map(w => ({ word: (w.word || '').trim().toUpperCase(), start: w.start, end: w.end })).filter(w => w.word);
  if (!words.length) throw new Error('Whisper returned no word-level timestamps');
  return words;
}

// ── 3. حرق الكابشن على الفيديو (fictions-ai/autocaption عبر Replicate) ───────
/**
 * يحرق كابشن حقيقي (كاريوكي، كلمة بكلمة) على فيديو، باستخدام تفريغ الكلمات اللي
 * احنا عملناه من Whisper (نص مؤكد 100% مش تخمين الموديل) — بيرجع رابط الفيديو
 * المكبتن. باقي الحقول (font/color/stroke/إلخ) مؤكدة 100% من صفحة الـInput
 * schema الحقيقية على Replicate (سكرين شوت من العميل نفسه).
 * ⚠ "transcript_file_input" نوعه uri (ملف مرفوع، مش نص خام) — بنرفع الكلمات
 * كملف JSON على R2. الشكل بالظبط ([{word,start,end}]) مبني على كود المصدر
 * المفتوح للموديل (مش قراءة مباشرة من الـwrapper الحقيقي على Replicate)، يحتاج
 * تأكيد حي.
 */
export async function burnCaptions(videoUrl, words, { rightToLeft = false } = {}) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const transcriptJson = JSON.stringify(words);
  const transcriptKey = `generated-videos/transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.json`;
  const transcriptUrl = await uploadBufferToR2(Buffer.from(transcriptJson, 'utf8'), transcriptKey, 'application/json');
  const input = {
    video_file_input: videoUrl,
    transcript_file_input: transcriptUrl,
    output_video: true,
    output_transcript: false,
    // ⚠ "Only Arial fonts are supported" لـright_to_left حسب الـschema — لازم نستخدم Arial
    // (مش Poppins) لما اللغة عربي، وإلا الحروف العربية هتتكسر بصريًا
    font: rightToLeft ? 'Arial/Arial.ttf' : 'Poppins/Poppins-ExtraBold.ttf',
    fontsize: 7,
    MaxChars: 20,
    kerning: -5,
    color: 'white',
    highlight_color: 'yellow',
    stroke_color: 'black',
    stroke_width: 2.6,
    subs_position: 'bottom75',
    right_to_left: rightToLeft,
  };
  // ✅ الهاش ده مأخوذ من كود الـAPI الرسمي الحقيقي لصفحة الموديل نفسها (Node.js/HTTP tabs) —
  // الموديل ده تحديدًا بيتطلب هاش نسخة مثبّت، مش الشورت-هاند بالاسم بس (راجع تعليق runReplicatePrediction فوق)
  const output = await runReplicatePrediction('fictions-ai/autocaption', input, 'Caption burning', '18a45ff0d95feb4449d192bbdc06b4a6df168fa33def76dfc51b78ae224b599b');
  const captionedUrl = Array.isArray(output) ? output[0] : (output?.output_video || output);
  return captionedUrl;
}

// ── 4. موسيقى خلفية (ملفات يوتيوب المحلية أو Freesound API) ──────────────────
// ❌ استبدلنا Jamendo (طلب العميل: "شوف حاجة تانية غير ده") — الـfree tier بتاعهم موثق رسميًا
// إنه "non-commercial use" بس، وده منتج تجاري مدفوع، فكان خطر ترخيصي حقيقي.
// ✅ Freesound بديل حقيقي: API مجاني فعليًا (مفتاح فوري من freesound.org/apiv2/apply)، وأهم
// حاجة بيسمح تفلتر بالترخيص — فلترنا هنا على "Creative Commons 0" (CC0) بالظبط، يعني المقطوعة
// ملهاش أي حقوق محفوظة خالص، استخدام تجاري كامل بدون أي attribution مطلوب — صفر خطر ترخيصي.
// ⚠ الفرق الوحيد: Freesound مكتبة مؤثرات صوتية/تسجيلات مجتمعية بالأساس، مش مكتبة أغاني مُلحّنة
// زي Jamendo، فجودة/كثافة "موسيقى خلفية" حقيقية فيها أقل — بنفلتر على مدة أطول (30-400 ثانية)
// وكلمة "music" في التاج عشان نستبعد المؤثرات القصيرة قدر الإمكان، بس النتيجة مش مضمونة نفس
// جودة موسيقى Jamendo المُلحّنة بالكامل
/**
 * "ستايل يوتيوب" (musicStyle === 'youtube'): بيختار ملف عشوائي من assets/music/
 * (مكتبة يوتيوب حقيقية العميل حاططها بنفسه) — من غير أي API خارجي.
 * غير كده: بيجيب مقطوعة CC0 حقيقية من Freesound (يحتاج FREESOUND_API_KEY في env —
 * مفتاح فوري ومجاني من freesound.org/apiv2/apply).
 */
export async function getBackgroundMusicBuffer(musicStyle = 'general', mood = null) {
  if (musicStyle === 'youtube') {
    if (!fs.existsSync(LOCAL_MUSIC_DIR)) throw new Error('local YouTube music library not found');
    const files = fs.readdirSync(LOCAL_MUSIC_DIR).filter(f => f.toLowerCase().endsWith('.mp3'));
    if (!files.length) throw new Error('local YouTube music library is empty');
    const pick = files[Math.floor(Math.random() * files.length)];
    return fs.readFileSync(path.join(LOCAL_MUSIC_DIR, pick));
  }
  if (!FREESOUND_API_KEY) throw new Error('FREESOUND_API_KEY not set');
  // ✅ FIX (باج حقيقي في الإنتاج: خطوة الموسيقى — آخر خطوة في مسار طويل (دمج + سرد + كابشن
  // اتنجحوا كلهم بالفعل) — كانت بتفشل المسار كله وترجّع الكريديت بسبب 502 عابر من Freesound
  // (عطل جانبهم، مش باج في الكود عندنا)، من غير أي محاولة تانية خالص. عطل مؤقت في خدمة خارجية
  // ملهوش داعي يضيّع نتيجة خطوات نجحت فعلاً ودفع فيها العميل وقت ومعالجة. بنعيد المحاولة كذا
  // مرة (تأخير بسيط بينهم)، ولو لسه فاشل بعد المحاولات كلها ومكتبة اليوتيوب المحلية متاحة،
  // نستخدمها كبديل بدل ما نفشّل المسار كله من غير أي موسيقى خالص — أهم حاجة الفيديو يوصل
  // بالنتيجة، مش نوع الموسيقى بالظبط
  const fetchWithRetry = async (url, maxRetries = 3) => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
    throw lastErr;
  };
  const localFallback = () => {
    if (!fs.existsSync(LOCAL_MUSIC_DIR)) return null;
    const files = fs.readdirSync(LOCAL_MUSIC_DIR).filter(f => f.toLowerCase().endsWith('.mp3'));
    if (!files.length) return null;
    const pick = files[Math.floor(Math.random() * files.length)];
    console.warn('[VideoAudio] Freesound failed after retries, falling back to local music library');
    return fs.readFileSync(path.join(LOCAL_MUSIC_DIR, pick));
  };
  try {
    const query = mood ? `${mood} music` : 'background music';
    const params = new URLSearchParams({
      query, token: FREESOUND_API_KEY, page_size: '20', sort: 'rating_desc',
      fields: 'id,name,previews,duration,license',
      filter: 'license:"Creative Commons 0" duration:[25 TO 400]',
    });
    const res = await fetchWithRetry(`https://freesound.org/apiv2/search/text/?${params}`);
    const data = await res.json();
    const tracks = (data.results || []).filter(t => t.previews?.['preview-hq-mp3']);
    if (!tracks.length) throw new Error('Freesound returned no CC0 tracks for this mood');
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    const audioRes = await fetchWithRetry(pick.previews['preview-hq-mp3']);
    return Buffer.from(await audioRes.arrayBuffer());
  } catch (e) {
    const fallback = localFallback();
    if (fallback) return fallback;
    throw new Error(`Freesound API error: ${e.message}`);
  }
}

// ── 5. الدمج النهائي (ffmpeg): سرد + موسيقى فوق الفيديو ─────────────────────
/**
 * يدمج صوت السرد (لو موجود، بيبقى المسار الأساسي) وموسيقى الخلفية (لو موجودة،
 * بتتخفّض تلقائيًا لصوت خافت تحت السرد عن طريق sidechaincompress، أو تكون هي
 * الصوت الوحيد لو مفيش سرد) على فيديو موجود، ويرفع الناتج على R2.
 */
export async function composeVideoAudio({ videoUrl, narrationPath = null, musicBuffer = null, modelKeyForNaming = 'audio' }) {
  const jobId = `audiomix_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(TEMP_DIR, jobId);
  await mkdir(workDir, { recursive: true });
  try {
    const videoPath = path.join(workDir, 'in.mp4');
    await downloadToFile(videoUrl, videoPath);

    let musicPath = null;
    if (musicBuffer) {
      musicPath = path.join(workDir, 'music.mp3');
      fs.writeFileSync(musicPath, musicBuffer);
    }

    const outputPath = path.join(workDir, 'out.mp4');
    // ✅ FIX (باج حقيقي في الإنتاج — الدمج بيفشل والعميل بياخد كريديته مرجوعة، ffmpeg process
    // بيتقفل بـ"Killed" بعد "buffers queued in out_#0:1, something may be wrong" متصاعدة):
    // "-shortest" مش موثوق فيه هنا لأنه بيعتمد على الـmuxer يكتشف نهاية أقصر stream لوحده —
    // بس فرع الموسيقى فيه "aloop=loop=-1" (تكرار لا نهائي)، والفيديو ماشي بـ"-c:v copy" (نسخ
    // مباشر من غير ما يعدي على الـfilter graph خالص) — التركيبة دي معروفة إنها مش دايمًا بتدّي
    // للـmuxer إشارة EOF واضحة، فبيفضل فرع الموسيقى اللانهائي يطلّع صوت من غير ما حد يوقفه،
    // والبفر بتاع مسار الصوت في المخرج بيكبر من غير حد لحد ما الـprocess يتقتل (OOM).
    // ✅ FIX (المحاولة الأولى بـ"-t" مش كانت كافية لوحدها): كانت بتعتمد على قياس مدة الفيديو
    // الهدف بـffprobe (getMediaDuration) — بس الفيديو في المسار ده (دمج + سرد + كابشن محروق
    // بموديل خارجي على Replicate) بيبقى عدى بمراحل معالجة كتير، وبعض الحاويات الناتجة من
    // خدمات خارجية زي كده مفيهاش بيانات مدة واضحة في الـformat metadata، فـffprobe بيرجع "N/A"
    // (بيترجم لـ0 في الكود)، فالكود كان بيرجع تلقائيًا لـ"-shortest" القديم المكسور — يعني
    // نفس الباج بالظبط بيرجع في المسار ده تحديدًا. الحل الجذري الحقيقي: نشيل التكرار اللانهائي
    // "loop=-1" خالص ونستبدله بعدد تكرار محدود وكبير بما يكفي (50 مرة — أي مقطوعة موسيقى حتى
    // لو 400 ثانية هتتكرر لـ~5.5 ساعة، أكتر بكتير من أي فيديو حقيقي) — كده الـfilter graph
    // بيبقى عنده مدة محدودة معروفة دايمًا، و"-shortest"/"-t" هيشتغلوا صح بغض النظر عن نجاح
    // قياس المدة بـffprobe من عدمه
    const targetDurationSec = narrationPath ? getMediaDuration(narrationPath) : getMediaDuration(videoPath);
    const t = targetDurationSec > 0 ? targetDurationSec.toFixed(2) : null;
    const durationArg = t ? `-t ${t}` : '-shortest';
    const MUSIC_LOOP_COUNT = 50; // محدود، مش لانهائي — كافي لأي فيديو حقيقي بأمان
    // ✅ FIX (باج حقيقي — العميل سمع الموسيقى عالية جدًا فوق السرد رغم إنها متخفّضة لـ0.18 في
    // الكود): "amix" في ffmpeg بيطبّق تطبيع تلقائي (normalize) افتراضيًا — بيقسّم كل المداخل
    // على عددهم (0.5x لكل مدخل هنا) إلا لو "normalize=0" اتحطت صراحة. ده كان بيقلل صوت
    // السرد نفسه بنص قيمته الأصلية من غير قصد، فالنسبة الحقيقية بين السرد والموسيقى بعد
    // الدمج مكانتش زي المتوقع من قيم "volume" المكتوبة، والموسيقى حسّت إنها أعلى مما هي
    // مفروضة. بنضيف "normalize=0" عشان قيم الـvolume المكتوبة تبقى هي الفيصل الوحيد، مع
    // تخفيض إضافي لقيم الموسيقى نفسها كمان بناءً على ملاحظة العميل المباشرة
    let cmd;
    if (narrationPath && musicPath) {
      // سرد (أساسي) + موسيقى (خافتة تحته طول الوقت، تتقطع لو أطول من الفيديو)
      cmd = `ffmpeg -i "${videoPath}" -i "${narrationPath}" -i "${musicPath}" -filter_complex ` +
        `"[2:a]volume=0.12,aloop=loop=${MUSIC_LOOP_COUNT}:size=2e9[music];[1:a][music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -c:a aac ${durationArg} -y "${outputPath}"`;
    } else if (narrationPath) {
      cmd = `ffmpeg -i "${videoPath}" -i "${narrationPath}" -map 0:v -map 1:a -c:v copy -c:a aac ${durationArg} -y "${outputPath}"`;
    } else if (musicPath) {
      cmd = `ffmpeg -i "${videoPath}" -i "${musicPath}" -filter_complex ` +
        `"[1:a]volume=0.22,aloop=loop=${MUSIC_LOOP_COUNT}:size=2e9[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -c:a aac ${durationArg} -y "${outputPath}"`;
    } else {
      throw new Error('composeVideoAudio needs narrationPath and/or musicBuffer');
    }
    execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 50 });

    const buffer = fs.readFileSync(outputPath);
    const key = `generated-videos/${modelKeyForNaming}_audio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    return await uploadBufferToR2(buffer, key, 'video/mp4');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// ── 6. مطابقة مدة فيديو موجود لمدة صوت حقيقي (سرد/حوار) ─────────────────────────
// ✅ NEW (طلب العميل: نظام مطابقة عام — مش خاص بالأنمي بس، أي فيديو عادي ممكن يستخدمه):
// لما يكون عندنا صوت حقيقي (سرد أو جملة حوار) اتولّد بالفعل وطوله الحقيقي معروف، والفيديو
// اللي هيتحط عليه اتولّد بمدة قريبة بس مش مطابقة بالظبط — بدل ما نسيب المشهد يتقطع فجأة
// (لو الصوت أقصر) أو يتكرر آخر فريم/يفضل صامت (لو الصوت أطول)، بنعدّل توقيت الفيديو نفسه:
// فرق تافه (أقل من نص ثانية) بنسيبه زي ما هو (مش يستاهل معالجة). لو الصوت أقصر من الفيديو،
// بنقصّه لنفس مدة الصوت بالظبط (قص بسيط، من غير تغيير سرعة الحركة). لو الصوت أطول، بنبطّئ
// الفيديو (فيلتر setpts) عشان يمتد بالظبط لنفس مدة الصوت — الحركة تبقى أبطأ شوية بس المشهد
// كله يفضل موجود (أفضل من قصه ووقف الحركة فجأة نص المشهد). اتأكد عمليًا بـffmpeg حقيقي في
// السانbox: قص لهدف 3 ثانية من فيديو 5 ثواني رجع 3.000000 بالظبط، وتبطيء لهدف 7.5 ثانية رجع
// 7.48 (فرق 0.02 ثانية بسبب تقريب الفريمات — مقبول تمامًا، composeVideoAudio's "-t" هيظبط أي
// فرق متبقي وقت الدمج النهائي مع الصوت بأي حال). الصوت الأصلي بتاع الفيديو (لو موجود) بيتشال
// هنا عمدًا (-an) — الخطوة دي دايمًا متبوعة بـcomposeVideoAudio() اللي بيركّب الصوت الحقيقي
// (سرد/حوار) فوق الناتج بعد كده
export async function conformVideoDurationToAudio({ videoUrl, targetDurationSec, modelKeyForNaming = 'conform' }) {
  const jobId = `conform_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(TEMP_DIR, jobId);
  await mkdir(workDir, { recursive: true });
  try {
    const videoPath = path.join(workDir, 'in.mp4');
    await downloadToFile(videoUrl, videoPath);
    const realDurationSec = getMediaDuration(videoPath);
    if (!realDurationSec || !targetDurationSec || targetDurationSec <= 0) {
      throw new Error('conformVideoDurationToAudio needs real durations for both video and target');
    }

    // فرق تافه — مش يستاهل أي معالجة، نرجع الرابط الأصلي زي ما هو
    if (Math.abs(realDurationSec - targetDurationSec) < 0.5) return videoUrl;

    const outputPath = path.join(workDir, 'out.mp4');
    let cmd;
    if (targetDurationSec < realDurationSec) {
      // الصوت أقصر من المشهد — قص بسيط لنفس مدة الصوت بالظبط، من غير تغيير سرعة الحركة
      cmd = `ffmpeg -i "${videoPath}" -t ${targetDurationSec.toFixed(2)} -an -c:v libx264 -preset veryfast -pix_fmt yuv420p -y "${outputPath}"`;
    } else {
      // الصوت أطول من المشهد — نبطّئ الفيديو (setpts) عشان يمتد بالظبط لنفس مدة الصوت
      const factor = targetDurationSec / realDurationSec;
      cmd = `ffmpeg -i "${videoPath}" -filter:v "setpts=${factor.toFixed(6)}*PTS" -an -c:v libx264 -preset veryfast -pix_fmt yuv420p -y "${outputPath}"`;
    }
    execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 50 });

    const buffer = fs.readFileSync(outputPath);
    const key = `generated-videos/${modelKeyForNaming}_conformed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    return await uploadBufferToR2(buffer, key, 'video/mp4');
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
