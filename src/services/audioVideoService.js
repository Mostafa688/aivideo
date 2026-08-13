// ── audioVideoService.js ─────────────────────────────────────────────────────
// مصنع فيديو الصوت (أدمن) — رفع فويس أوفر جاهز، تفريغه لنص بتوقيت دقيق على مستوى الكلمة
// (Groq Whisper)، تقسيمه للقطات كثيفة (كل 3-4 كلمات تقريبًا، Groq LLM) مع صورة ملصق 2D
// شفافة الخلفية لكل لقطة (Pollinations.ai — مجاني بالكامل بدون مفتاح)، والشخصيات المسمّاة
// بتتكرر بنفس الملصق. بناء الفيديو النهائي (ملصقات متحركة + نص متحرك + دمج الصوت) في
// audioVideoRenderService.js.

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

// ⚠️ احترام رمزية: ممنوع أي تمثيل بصري لله سبحانه وتعالى أو لأي نبي من الأنبياء (وجه/جسد
// إنسان). القائمة دي شبكة أمان في الكود نفسه — مش بس تعليمات للـ LLM — عشان الموضوع حساس
// جدًا ومينفعش يعتمد بس على التزام النموذج. أي عنصر بيطابق النمط ده بيتشال تمامًا من قائمة
// العناصر المرئية (مش بيتستبدل بصورة رمزية، بيتشال خالص — العنصر المجاور ليه في الكلام هو
// اللي بيفضل ظاهر على الشاشة، بالظبط زي ما طلب العميل).
// ✅ فحص substring بسيط، عمدًا مش regex بـ \b — \b بيعتمد على \w اللي مبيتعرفش على حروف
// عربي أصلًا (يعني \b كانت هتفشل تعمل matching صح على نص عربي بالكامل). substring مباشر
// أوسع شوية (ممكن يشيل عنصر مش لازم يتشال) لكن ده هو الاتجاه الآمن هنا — أي شك بيبقى حذف
const SENSITIVE_ELEMENT_KEYWORDS = [
  'الله', 'ﷲ', 'سبحانه وتعالى', 'رب العالمين', 'النبي', 'الرسول', 'رسول الله',
  'محمد صلى', 'صلى الله عليه وسلم', 'نبي الله', 'سيدنا ',
];
function isSensitiveReligiousElement(name) {
  const n = String(name || '');
  return SENSITIVE_ELEMENT_KEYWORDS.some(kw => n.includes(kw));
}

// ✅ استخراج "لقطات" كثيفة — عنصر كل 3-4 كلمات تقريبًا (مش عنصر لكل "موضوع" كبير زي الأول)،
// عشان الفيديو يبقى كثيف بالملصقات زي المرجع اللي العميل بعته. بنديله الترانسكريبت كقائمة
// كلمات مرقّمة ("index:word") ونطلب منه يرجّع أرقام الـ index (مش أرقام ثواني) — إحنا اللي
// بنحسب start/end الحقيقي من الـ index اللي هو رجّعه، مباشرة من الـ words array الأصلي اللي
// فيه التوقيت الحقيقي من Whisper. كل لقطة كمان بترجع نص اللقطة نفسه (هيتحط على الشاشة كنص
// متحرك) — وبتترمز كـ "character" لو بتمثل شخصية معينة بالاسم، مع characterKey ثابت لنفس
// الشخصية في كل مرة تتذكر، عشان نعيد استخدام نفس صورة الملصق بدل ما نولّد شكل مختلف كل مرة.
export async function extractVideoElements(words) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  if (!words || words.length === 0) return [];

  const indexedTranscript = words.map((w, i) => `${i}:${w.word}`).join(' ');
  const system = `You break a spoken narration transcript (given as an indexed word list "index:word", space-separated) into a DENSE, ordered sequence of short visual "beats" that will each get their own animated sticker + on-screen text in a video — roughly every 3 to 5 words, or a short natural phrase/clause if that reads better. Cover the ENTIRE narration with near-gapless beats — do not skip stretches of it, and do not merge everything into a few broad topics like a summary would.

For each beat, output:
- "start_idx","end_idx": word indices (inclusive) it covers — reference ONLY the given indices, never invent numbers
- "text": the exact words for this beat, copied verbatim from the transcript — this becomes on-screen animated text
- "kind": "character" if this beat depicts or refers to a specific named recurring person in the story, otherwise "object" (an object, place, action, or abstract concept)
- "character_key": ONLY when kind is "character" — a short lowercase English slug identifying that person (e.g. "bilal") — reuse the EXACT SAME character_key every single time this same person is depicted anywhere else in the transcript, so their sticker stays visually consistent
- "image_prompt": a short, concrete English visual description for a 2D sticker — for a "character" beat, describe their appearance/clothing/pose once (it's still fine to repeat it on later beats with the same character_key, it'll just be ignored after the first use)

CRITICAL religious-respect rule: NEVER create a beat depicting Allah/God, or any prophet (by name or title like "the Prophet"/"Messenger of God", in any language) — never give them "character" kind or a visual image_prompt of any figure. When the narration only attributes something to them ("the Prophet said...") while actually discussing a concrete subject, make the beat about that concrete subject and skip the attribution — do not create a separate beat for the attribution itself.

Output ONLY valid JSON, no explanation, no markdown fences: [{"start_idx":N,"end_idx":N,"text":"...","kind":"object"|"character","character_key":"...","image_prompt":"..."}].`;
  const user = `Indexed transcript (word_index:word):\n${indexedTranscript}\n\nJSON only:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ELEMENT_EXTRACTION_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 7000, temperature: 0.3,
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
      const kind = el.kind === 'character' ? 'character' : 'object';
      return {
        element: String(el.text || '').slice(0, 200).trim(),
        text: String(el.text || '').slice(0, 200).trim(),
        imagePrompt: String(el.image_prompt || el.text || '').slice(0, 300).trim(),
        kind,
        characterKey: kind === 'character' ? String(el.character_key || '').toLowerCase().trim().slice(0, 60) : null,
        startIdx, endIdx,
        start: words[startIdx].start,
        end: words[endIdx].end,
      };
    })
    .filter(el => el.element && Number.isFinite(el.start) && Number.isFinite(el.end) && el.end > el.start)
    // ✅ شبكة الأمان — بتشيل أي عنصر حساس حتى لو الـ LLM اتجاهل التعليمة فوق (نادر بس ممكن)
    .filter(el => !isSensitiveReligiousElement(el.element))
    .sort((a, b) => a.startIdx - b.startIdx);

  return elements;
}

// ✅ Pollinations مجانية بدون مفتاح، وده معناه limit صارم على معدل الطلبات (429) خصوصًا لو
// كذا عنصر بيتولدوا ورا بعض بسرعة. بدل ما نستسلم من أول 429، بنعمل backoff تصاعدي (3s, 6s,
// 9s) ونجرب تاني — الفشل الوحيد المقبول هو بعد استنفاد المحاولات دي كلها
async function fetchPollinationsImage(prompt, attempt = 1) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
  const res = await fetch(url);
  if (res.status === 429 && attempt <= 3) {
    await new Promise(r => setTimeout(r, attempt * 3000));
    return fetchPollinationsImage(prompt, attempt + 1);
  }
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ✅ إزالة خلفية حقيقية (مش بس "استنى واعتمد على الـ prompt") — بنولّد الصورة على خلفية
// لون واحد صريح (كروما كي أخضر) بدل الأبيض، وبعدين بنعمل flood-fill حقيقي من حدود الصورة
// لأي بكسل قريب من نفس اللون ده ونشيله (شفافية). الأسلوب "2D flat illustration" اللي
// طلبناه من الموديل بالذات مناسب جدًا للطريقة دي لأن خلفيته لون واحد مصمت (عكس الصور
// الفوتوغرافية اللي فيها تدرّج/ظل بيصعّب أي إزالة خلفية بسيطة زي دي).
// ⚠️ حد معروف: ممكن يفضل هامش رفيع جدًا ملوّن بلون الخلفية حوالين حواف الشكل (خاصية شائعة
// في أي كروما كي بسيط من غير alpha matting متقدم) — تحسين محتمل لاحقًا لو ظهر واضح فعليًا.
async function removeFlatBackground(buffer, tolerance = 45) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const idx = (x, y) => (y * width + x) * channels;

  // نلتقط لون الخلفية الفعلي من زوايا الصورة (متوسطهم) بدل افتراض لون ثابت مسبقًا —
  // أدق لو Pollinations رجّع درجة خضراء مختلفة شوية عن اللي طلبناها بالظبط
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  let kr = 0, kg = 0, kb = 0;
  for (const [cx, cy] of corners) {
    const p = idx(cx, cy);
    kr += data[p]; kg += data[p + 1]; kb += data[p + 2];
  }
  kr /= 4; kg /= 4; kb /= 4;

  const colorDist = (p) => {
    const dr = data[p] - kr, dg = data[p + 1] - kg, db = data[p + 2] - kb;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const visited = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x++) { stack.push(x); stack.push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { stack.push(y * width); stack.push(y * width + width - 1); }

  while (stack.length) {
    const pos = stack.pop();
    if (visited[pos]) continue;
    visited[pos] = 1;
    const p = pos * channels;
    if (colorDist(p) > tolerance) continue; // مش لون الخلفية — نوقف الانتشار من هنا
    data[p + 3] = 0; // شفاف
    const x = pos % width, y = (pos - x) / width;
    if (x > 0) stack.push(pos - 1);
    if (x < width - 1) stack.push(pos + 1);
    if (y > 0) stack.push(pos - width);
    if (y < height - 1) stack.push(pos + width);
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

// ✅ أسلوب رسم مسطّح (2D flat vector illustration) بدل الصور الفوتوغرافية الواقعية اللي
// كانت طالعة قبل كده — أنسب لفيديو شرح متسق، وأنسب كمان لإزالة الخلفية الحقيقية فوق (خلفية
// لون واحد مصمت بدل تدرّج/ظل زي الصور الفوتوغرافية)
export async function generateElementImage(imagePrompt) {
  const fullPrompt = `${imagePrompt}, simple flat 2D vector illustration, flat solid colors, clean bold outlines, minimalist icon style, no photorealism, no 3D render, no gradient, no texture, on a solid plain green background (#00FF00), single flat color background, no shadow, centered`;
  let buffer;
  try {
    buffer = await fetchPollinationsImage(fullPrompt);
  } catch (e) {
    // ✅ محاولة تانية بـ prompt معدّل شوية — مفيش تكلفة إضافية من إعادة المحاولة (زي ما طلب)
    buffer = await fetchPollinationsImage(`${fullPrompt}, flat design, sticker style, vector art`);
  }
  return removeFlatBackground(buffer);
}
