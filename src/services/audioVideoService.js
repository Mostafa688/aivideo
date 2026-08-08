// ── audioVideoService.js ─────────────────────────────────────────────────────
// مصنع فيديو الصوت (أدمن) — المرحلة 1 بس: رفع فويس أوفر جاهز + تفريغه لنص بتوقيت دقيق
// على مستوى الكلمة الواحدة عن طريق Groq Whisper (نفس الـ GROQ_API_KEY المستخدم في باقي
// الموقع). المراحل الجاية (استخراج العناصر بالـ LLM، توليد/جلب الصور، بناء الفيديو
// النهائي بـ ffmpeg) هتتضاف بعد ما المرحلة دي تتجرب وتتأكد شغالة صح.

import Groq from 'groq-sdk';
import fs from 'fs';
import path from 'path';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// ✅ نفس نمط رفع الملفات المستخدم فعليًا في voiceCloneService.js/templates upload —
// نفس المتغيرات البيئية بالظبط، بس هنا لملفات مصدر فويس أوفر الأدمن (مفتاح audio-video/)
export async function uploadAudioVideoSourceToR2(buffer, mimeExt = 'mp3') {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  const key = `audio-video/source_${Date.now()}.${mimeExt}`;
  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: `audio/${mimeExt === 'mp3' ? 'mpeg' : mimeExt}`,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

// ✅ تفريغ الصوت بتوقيت دقيق على مستوى الكلمة — response_format: verbose_json +
// timestamp_granularities: ['word'] بيرجّع كل كلمة مع start/end بالثانية (نفس بروتوكول
// OpenAI Whisper API اللي Groq متوافق معاه بالظبط)
export async function transcribeAudioWithTimestamps(filePath) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const transcription = await groq.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: 'whisper-large-v3',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });
  const words = (transcription.words || []).map(w => ({
    word: w.word,
    start: Number(w.start),
    end: Number(w.end),
  }));
  return { text: transcription.text || '', words };
}

export function tmpAudioPath(originalName) {
  const ext = (String(originalName || '').split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp3';
  fs.mkdirSync('temp', { recursive: true });
  return path.join('temp', `audiovideo_${Date.now()}.${ext}`);
}
