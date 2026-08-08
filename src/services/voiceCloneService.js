// ── voiceCloneService.js ─────────────────────────────────────────────────────
// فويس كلون حقيقي عن طريق resemble-ai/chatterbox-multilingual على Replicate — استنساخ
// "zero-shot" من عينة صوت قصيرة (بيرفعها العميل مرة واحدة ونحفظها)، بدون أي اشتراك شهري
// (Replicate pay-per-use، نفس الحساب المستخدم فعليًا في باقي الموقع). موصى بيها 10 ثواني،
// مرفوضة لو أكتر من دقيقة.
//
// ✅ أسماء الحقول اتأكدت من صفحة replicate.com/resemble-ai/chatterbox-multilingual/api/schema
// مباشرة (Input schema): text (حد أقصى 300 حرف!)، language، cfg_weight، temperature،
// exaggeration، reference_audio. عشان النص ممكن يبقى أطول من 300 حرف (سكريبتات فيديو)،
// النص بيتقسم لقطع أقل من 300 حرف كل واحدة وبيتعمل نداء منفصل لكل قطعة وبعدين تتلحم بـ ffmpeg.

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = 'temp';

export const MAX_VOICE_SAMPLE_SEC = 60;   // ✅ مرفوض لو أطول من دقيقة
export const RECOMMENDED_VOICE_SAMPLE_SEC = 10; // موصى بيها (مش إجبارية)

// ✅ نفس نمط رفع الفيديوهات لـ R2 المستخدم فعليًا في /api/templates/upload-video —
// نفس المتغيرات البيئية بالظبط، بس هنا لملفات صوت (مفتاح voices/ بدل templates/)
export async function uploadVoiceSampleToR2(buffer, mimeExt = 'mp3') {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  const key = `voices/voice_${Date.now()}.${mimeExt}`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: `audio/${mimeExt === 'mp3' ? 'mpeg' : mimeExt}`,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

// ✅ بيتحقق من مدة عينة الصوت (بيقبل أي صيغة صوت شائعة عن طريق ffprobe) ويرفض لو أطول من الحد
export function checkVoiceSampleDuration(audioBase64) {
  const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const tmpPath = path.join(TEMP_DIR, `voice_sample_check_${Date.now()}.mp3`);
  fs.writeFileSync(tmpPath, buffer);
  try {
    const dur = parseFloat(execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tmpPath}"`,
      { encoding: 'utf8' }
    ).trim());
    if (!dur || dur <= 0) throw new Error('Could not read audio duration — file may be corrupted');
    if (dur > MAX_VOICE_SAMPLE_SEC) throw new Error(`Voice sample is ${dur.toFixed(1)}s — maximum allowed is ${MAX_VOICE_SAMPLE_SEC}s`);
    return { buffer, durationSec: dur };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

const CHATTERBOX_TEXT_LIMIT = 300; // ✅ حد الموديل الرسمي (شوف الملحوظة فوق)

// النص بيتقسم على حدود الجمل (. ! ? أو . ! ؟ العربي) لقطع أقل من الحد، من غير ما تتقطع
// جملة نص نص. لو جملة واحدة أطول من الحد لوحدها، بتتقطع بالمسافات كحل أخير.
function splitTextIntoChunks(text, maxLen = CHATTERBOX_TEXT_LIMIT) {
  const sentences = (text || '').match(/[^.!?؟]+[.!?؟]*/g) || [text || ''];
  const chunks = [];
  let current = '';
  for (let sentence of sentences) {
    sentence = sentence.trim();
    if (!sentence) continue;
    if (sentence.length > maxLen) {
      if (current) { chunks.push(current); current = ''; }
      const words = sentence.split(/\s+/);
      let piece = '';
      for (const w of words) {
        if ((piece + ' ' + w).trim().length > maxLen) { if (piece) chunks.push(piece.trim()); piece = w; }
        else piece = (piece + ' ' + w).trim();
      }
      if (piece) chunks.push(piece.trim());
      continue;
    }
    if ((current + ' ' + sentence).trim().length > maxLen) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + ' ' + sentence).trim();
    }
  }
  if (current) chunks.push(current.trim());
  return chunks.length ? chunks : [(text || '').slice(0, maxLen)];
}

// نداء واحد لـ Replicate لقطعة نص واحدة (أقل من CHATTERBOX_TEXT_LIMIT حرف) — بيرجّع مسار
// ملف mp3 محلي مؤقت
async function cloneVoiceChunk(sampleUrl, textChunk, language) {
  const res = await fetch('https://api.replicate.com/v1/models/resemble-ai/chatterbox-multilingual/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({
      input: {
        text: textChunk,
        language,
        reference_audio: sampleUrl,
        cfg_weight: 0.5,
        temperature: 0.8,
        exaggeration: 0.5,
      },
    }),
  });
  if (!res.ok) throw new Error(`Voice clone error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let prediction = await res.json();
  let audioUrl;
  if (prediction.status === 'succeeded' && prediction.output) {
    audioUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  } else {
    const predictionId = prediction.id;
    if (!predictionId) throw new Error(`No prediction ID from voice clone: ${JSON.stringify(prediction).slice(0, 200)}`);
    const headers = { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` };
    const maxWait = 120_000, pollInterval = 3_000, startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
      if (!statusRes.ok) continue;
      const data = await statusRes.json();
      if (data.status === 'succeeded') { audioUrl = Array.isArray(data.output) ? data.output[0] : data.output; break; }
      if (data.status === 'failed' || data.status === 'canceled') throw new Error(`Voice clone failed: ${data.error || 'unknown'}`);
    }
    if (!audioUrl) throw new Error('Voice clone timed out');
  }
  if (!audioUrl) throw new Error('Voice clone returned no audio URL');

  const fetchRes = await fetch(audioUrl);
  if (!fetchRes.ok) throw new Error(`Failed to download cloned voice audio: ${fetchRes.status}`);
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const chunkPath = path.join(TEMP_DIR, `cloned_voice_chunk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.mp3`);
  fs.writeFileSync(chunkPath, Buffer.from(await fetchRes.arrayBuffer()));
  return chunkPath;
}

// ✅ الاستنساخ الفعلي — بياخد عينة الصوت المحفوظة + نص السكريبت (بأي طول)، ويرجّع مسار ملف
// صوت واحد بنفس نبرة/صوت العميل. Zero-shot: مفيش "تدريب" أو voice ID دائم عند المزوّد.
// النص الأطول من 300 حرف بيتقسم لقطع وكل قطعة بتتبعت في نداء منفصل، وبعدين القطع بتتلحم
// بـ ffmpeg concat في ملف واحد نهائي.
export async function cloneVoiceNarration(sampleUrl, text, language = 'en') {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const lang = (language || 'en').startsWith('ar') ? 'ar' : (language || 'en').slice(0, 2);
  const chunks = splitTextIntoChunks(text, CHATTERBOX_TEXT_LIMIT);

  const chunkPaths = [];
  try {
    for (const chunk of chunks) {
      chunkPaths.push(await cloneVoiceChunk(sampleUrl, chunk, lang));
    }

    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    const outPath = path.join(OUTPUTS_DIR, `cloned_voice_${Date.now()}.mp3`);

    if (chunkPaths.length === 1) {
      fs.copyFileSync(chunkPaths[0], outPath);
    } else {
      const listPath = path.join(TEMP_DIR, `cloned_voice_concat_${Date.now()}.txt`);
      const listContent = chunkPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
      fs.writeFileSync(listPath, listContent);
      execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`, { stdio: 'pipe' });
      try { fs.unlinkSync(listPath); } catch {}
    }
    return outPath;
  } finally {
    for (const p of chunkPaths) { try { fs.unlinkSync(p); } catch {} }
  }
}
