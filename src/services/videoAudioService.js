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

async function runReplicatePrediction(slug, input, label) {
  const res = await fetch(`https://api.replicate.com/v1/models/${slug}/predictions`, {
    method: 'POST', headers: replicateHeaders(), body: JSON.stringify({ input }),
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
  const output = await runReplicatePrediction('fictions-ai/autocaption', input, 'Caption burning');
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
  const query = mood ? `${mood} music` : 'background music';
  const params = new URLSearchParams({
    query, token: FREESOUND_API_KEY, page_size: '20', sort: 'rating_desc',
    fields: 'id,name,previews,duration,license',
    filter: 'license:"Creative Commons 0" duration:[25 TO 400]',
  });
  const res = await fetch(`https://freesound.org/apiv2/search/text/?${params}`);
  if (!res.ok) throw new Error(`Freesound API error ${res.status}`);
  const data = await res.json();
  const tracks = (data.results || []).filter(t => t.previews?.['preview-hq-mp3']);
  if (!tracks.length) throw new Error('Freesound returned no CC0 tracks for this mood');
  const pick = tracks[Math.floor(Math.random() * tracks.length)];
  const audioRes = await fetch(pick.previews['preview-hq-mp3']);
  if (!audioRes.ok) throw new Error(`failed to download Freesound track: ${audioRes.status}`);
  return Buffer.from(await audioRes.arrayBuffer());
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
    // والبفر بتاع مسار الصوت في المخرج بيكبر من غير حد لحد ما الـprocess يتقتل (OOM). الحل:
    // نقيس المدة الحقيقية المستهدفة بـffprobe (مدة السرد، أو مدة الفيديو لو موسيقى بس) ونديها
    // كـ"-t" صريح بدل ما نتوكل على "-shortest" يكتشفها لوحده
    const targetDurationSec = narrationPath ? getMediaDuration(narrationPath) : getMediaDuration(videoPath);
    const t = targetDurationSec > 0 ? targetDurationSec.toFixed(2) : null;
    const durationArg = t ? `-t ${t}` : '-shortest';
    let cmd;
    if (narrationPath && musicPath) {
      // سرد (أساسي) + موسيقى (خافتة تحته طول الوقت، تتقطع لو أطول من الفيديو)
      cmd = `ffmpeg -i "${videoPath}" -i "${narrationPath}" -i "${musicPath}" -filter_complex ` +
        `"[2:a]volume=0.18,aloop=loop=-1:size=2e9[music];[1:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -c:a aac ${durationArg} -y "${outputPath}"`;
    } else if (narrationPath) {
      cmd = `ffmpeg -i "${videoPath}" -i "${narrationPath}" -map 0:v -map 1:a -c:v copy -c:a aac ${durationArg} -y "${outputPath}"`;
    } else if (musicPath) {
      cmd = `ffmpeg -i "${videoPath}" -i "${musicPath}" -filter_complex ` +
        `"[1:a]volume=0.35,aloop=loop=-1:size=2e9[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
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
