// ── audioVideoService.js ─────────────────────────────────────────────────────
// مصنع فيديو الصوت (أدمن) — رفع فويس أوفر جاهز، تفريغه لنص بتوقيت دقيق على مستوى الكلمة
// (Groq Whisper)، استخراج العناصر المذكورة فيه (Groq LLM)، وتوليد صورة بخلفية بيضاء لكل
// عنصر (Pollinations.ai — مجاني بالكامل بدون مفتاح). بناء الفيديو النهائي (زوم + كابشنز
// + دمج الصوت) في audioVideoRenderService.js.

import Groq from 'groq-sdk';
import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const ELEMENT_EXTRACTION_MODEL = 'llama-3.3-70b-versatile'; // نفس الموديل المستخدم فعليًا في باقي الموقع لمهام الـ JSON السريعة

const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// ✅ نفس نمط رفع الملفات المستخدم فعليًا في voiceCloneService.js/templates upload —
// نفس المتغيرات البيئية بالظبط. مشترك لكل ملفات المصنع ده (صوت مصدر، صور عناصر، فيديو نهائي)
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

export async function uploadAudioVideoSourceToR2(buffer, mimeExt = 'mp3') {
  return uploadBufferToR2(buffer, `audio-video/source_${Date.now()}.${mimeExt}`, `audio/${mimeExt === 'mp3' ? 'mpeg' : mimeExt}`);
}

export async function uploadElementImageToR2(buffer) {
  const key = `audio-video/images/element_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;
  return uploadBufferToR2(buffer, key, 'image/png');
}

export async function uploadFinalVideoToR2(buffer) {
  const key = `audio-video/final/video_${Date.now()}.mp4`;
  return uploadBufferToR2(buffer, key, 'video/mp4');
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

// ✅ استخراج العناصر — بنديله الترانسكريبت كقائمة كلمات مرقّمة ("index:word") ونطلب منه
// يرجّع أرقام الـ index (مش أرقام ثواني) لبداية/نهاية كل عنصر. ده أدق بكتير من ما نسيبه
// يحاول "يخترع" أرقام ثواني عشرية بنفسه — إحنا اللي بنحسب start/end الحقيقي من الـ index
// اللي هو رجّعه، مباشرة من الـ words array الأصلي اللي فيه التوقيت الحقيقي من Whisper.
export async function extractVideoElements(words) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  if (!words || words.length === 0) return [];

  const indexedTranscript = words.map((w, i) => `${i}:${w.word}`).join(' ');
  const system = `You analyze a spoken narration transcript, given as an indexed word list ("index:word", space-separated), and extract the ordered list of distinct visual "elements" (concrete objects/topics/subjects) the narration discusses, in the order first mentioned. For each element, give the word index where its discussion STARTS and the word index where it ENDS (inclusive) — reference ONLY the given indices, never invent timestamps or numbers not present in the list. Also give a short, concrete English image-generation prompt describing the element visually (no style words, just the concrete subject). Merge repeated/scattered mentions of the same subject into ONE element spanning its first mention to its last. Output ONLY valid JSON, no explanation, no markdown fences: [{"element":"short name, in the transcript's own language","start_idx":N,"end_idx":N,"image_prompt":"..."}]. Keep it to at most 12 elements even for a long transcript.`;
  const user = `Indexed transcript (word_index:word):\n${indexedTranscript}\n\nJSON only:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ELEMENT_EXTRACTION_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 2000, temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`Element extraction Groq error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();

  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error('Element extraction returned invalid JSON'); }
  if (!Array.isArray(parsed)) throw new Error('Element extraction did not return a JSON array');

  const maxIdx = words.length - 1;
  const elements = parsed
    .map(el => {
      const startIdx = Math.max(0, Math.min(maxIdx, Math.round(Number(el.start_idx))));
      const endIdx = Math.max(startIdx, Math.min(maxIdx, Math.round(Number(el.end_idx))));
      return {
        element: String(el.element || '').slice(0, 80).trim(),
        imagePrompt: String(el.image_prompt || el.element || '').slice(0, 300).trim(),
        startIdx, endIdx,
        start: words[startIdx].start,
        end: words[endIdx].end,
      };
    })
    .filter(el => el.element && Number.isFinite(el.start) && Number.isFinite(el.end) && el.end > el.start)
    .sort((a, b) => a.startIdx - b.startIdx);

  return elements;
}

async function fetchPollinationsImage(prompt) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ✅ الصورة لازم تبقى بخلفية بيضاء نقية بالكامل — شرط أساسي. بدل السلسلة الأصلية
// (Pexels/Unsplash + rembg لإزالة الخلفية)، استخدمنا Pollinations وحده بس مع prompt قوي
// يفرض خلفية بيضاء استوديو مباشرة، لسببين: (1) rembg مكتبة بايثون، والباك اند هنا Node.js
// بالكامل — إضافة runtime بايثون + موديل segmentation بس لخاصية واحدة تعقيد نشر حقيقي على
// Railway، (2) حتى مع إزالة الخلفية، صور Stock الحقيقية نادرًا ما بتطلع خلفيتها #FFFFFF نقية
// فعلًا (فيه حواف/ظلال متبقية) — توليد مباشر "isolated on pure white background, studio
// product photography" بيديّنا نتيجة أنضف وأكثر اتساقًا لنفس الشرط بالظبط.
export async function generateElementImage(imagePrompt) {
  const fullPrompt = `${imagePrompt}, isolated on pure white background, studio product photography, no shadows, no other objects, centered, high detail`;
  let buffer;
  try {
    buffer = await fetchPollinationsImage(fullPrompt);
  } catch (e) {
    // ✅ محاولة تانية بـ prompt معدّل شوية — مفيش تكلفة إضافية من إعادة المحاولة (زي ما طلب)
    buffer = await fetchPollinationsImage(`${fullPrompt}, plain white backdrop, product catalog photo, minimalist`);
  }
  // نفلطح أي شفافية على خلفية بيضاء نقية ونوحد الصيغة PNG
  return sharp(buffer).flatten({ background: '#ffffff' }).png().toBuffer();
}
