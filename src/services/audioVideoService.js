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
// ✅ FIX: كان 'llama-3.3-70b-versatile' — Groq بقى بيرجّع 404 model_not_found عليه (اتشال/اتقفل
// الوصول ليه)، فأي job كان بيفشل فورًا على مرحلة الاستخراج. استبدلناه بـ openai/gpt-oss-120b
// (نفس الموديل المستخدم فعليًا وبنجاح في كل أماكن توليد الـ JSON التانية في src/index.js)
const ELEMENT_EXTRACTION_MODEL = 'openai/gpt-oss-120b';

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
// إنسان)، وكذلك آيات القرآن والأحاديث الشريفة — كل ده يتحط "نص بس على الشاشة" (زي أي لقطة
// عادية، نفس الأنيميشن) من غير أي ملصق/صورة خالص، مش بيتشال من الفيديو (كان قبل كده بيتشال
// تمامًا فيضيع النص). القائمة دي شبكة أمان في الكود نفسه — مش بس تعليمات للـ LLM — عشان
// الموضوع حساس جدًا ومينفعش يعتمد بس على التزام النموذج.
// ✅ فحص substring بسيط، عمدًا مش regex بـ \b — \b بيعتمد على \w اللي مبيتعرفش على حروف
// عربي أصلًا (يعني \b كانت هتفشل تعمل matching صح على نص عربي بالكامل). substring مباشر
// أوسع شوية (ممكن يحوّل عنصر مش لازم يتحول) لكن ده هو الاتجاه الآمن هنا — أي شك يتحول لنص
const SENSITIVE_ELEMENT_KEYWORDS = [
  'الله', 'ﷲ', 'سبحانه وتعالى', 'رب العالمين', 'النبي', 'الرسول', 'رسول الله',
  'محمد صلى', 'صلى الله عليه وسلم', 'نبي الله', 'سيدنا ', 'قال تعالى', 'قال رسول الله',
  'حديث', 'الحديث', 'آية', 'الآية', 'سورة', 'القرآن',
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
  const system = `You break a spoken narration transcript (given as an indexed word list "index:word", space-separated) into a DENSE, ordered sequence of short "beats" — roughly every 3 to 5 words, or a short natural phrase/clause if that reads better. Cover the ENTIRE narration with near-gapless beats — do not skip stretches of it, and do not merge everything into a few broad topics like a summary would.

CRITICAL — EVERY beat shows EXACTLY ONE thing on screen, NEVER both: either an animated illustrated SCENE (no text), or on-screen TEXT (no scene image). Never combine a scene image with text for the same beat. Decide per beat which fits better:
- Use a SCENE ("character"/"object" kind) when the phrase names a concrete, drawable thing — a person, object, place, or clear physical action. Most beats should be this if the narration is at all concrete.
- Use TEXT ("text" kind) when the phrase is abstract, a transition, a connector, or otherwise has no good concrete visual — words like "لا بد أن"/"إذاً"/"وبهذا"/"المحددة ولم يتحدث عنه كثيرون" don't need an invented scene; just show them as text. Don't force a scene onto a phrase that doesn't really have one — text is a completely normal, expected outcome for plenty of beats, not a fallback to avoid.

For each beat, output:
- "start_idx","end_idx": word indices (inclusive) it covers — reference ONLY the given indices, never invent numbers
- "text": the exact words for this beat, copied verbatim from the transcript
- "kind": "character" (scene, depicts/refers to a specific named recurring person), "object" (scene, a concrete object/place/action), "text" (on-screen text only, no scene image — abstract/transition/no good visual), or "quote" (on-screen text only, no scene image — a direct Quranic verse, an authentic Hadith quote, or anything that would require depicting Allah/God or a prophet, see rule below)
- "character_key": ONLY when kind is "character" — a short lowercase English slug identifying that person (e.g. "bilal") — reuse the EXACT SAME character_key every single time this same person is depicted anywhere else in the transcript, so their scene image stays visually consistent
- "image_prompt": ONLY for "character"/"object" kinds — OMIT this field entirely for "text"/"quote" kinds (they get on-screen text only, never an image). CRITICAL — this must show real comprehension, not word-matching: read the beat's actual MEANING in context (use the surrounding beats/narration to understand what's really being said), then describe a short, concrete English scene of what is actually happening or being depicted at that moment — a real illustrated moment with a setting and (where relevant) a person doing something, not a generic isolated icon/symbol standing for a keyword. E.g. for a phrase about a long period whose end only God knows, don't just draw "an hourglass" — depict the actual scene implied by the narration (people waiting, a long road stretching into the distance, etc., whatever truly fits the context). Never take a single abstract noun and turn it into a floating generic icon — always ground it in the real scene the narration is describing.

CRITICAL religious-respect rule: NEVER create a beat depicting Allah/God, or any prophet (by name or title like "the Prophet"/"Messenger of God", in any language) — never give them "character" kind or a visual image_prompt of any figure. Use "quote" kind instead for these beats (and for direct Quranic verses / Hadith text) so the words still appear as on-screen text with no image. When the narration only attributes something to them ("the Prophet said...") while actually discussing a concrete subject, make the beat about that concrete subject and skip the attribution — do not create a separate beat for the attribution itself.

Output ONLY valid JSON, no explanation, no markdown fences: [{"start_idx":N,"end_idx":N,"text":"...","kind":"object"|"character"|"text"|"quote","character_key":"...","image_prompt":"..."}].`;
  const user = `Indexed transcript (word_index:word):\n${indexedTranscript}\n\nJSON only:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ELEMENT_EXTRACTION_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 8000, temperature: 0.3, reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Element extraction Groq error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  let raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
  const firstBracket = raw.indexOf('[');
  if (firstBracket > 0) raw = raw.slice(firstBracket);

  // ✅ التقسيم الكثيف (لقطة كل 3-5 كلمات) بيطلع رد أطول بكتير من قبل، وممكن يتقطع لو وصل
  // لحد max_tokens قبل ما يخلص المصفوفة (finish_reason:"length") — بدل ما نفشل ونضيع كل حاجة
  // اتستخرجت لحد وقتها، بنحاول نصلح الـ JSON: نلاقي آخر "}" كامل قبل الجزء الناقص ونقفل
  // المصفوفة من هناك. لو نجح، بيرجّع كل اللقطات الكاملة اللي اتولدت قبل القطع.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const lastCompleteObjEnd = raw.lastIndexOf('}');
    if (lastCompleteObjEnd === -1) {
      console.error('[AudioVideo] Extraction raw response (unparseable):', raw.slice(0, 500));
      throw new Error(`Element extraction returned invalid JSON (finish_reason: ${finishReason}, length: ${raw.length} chars)`);
    }
    try {
      parsed = JSON.parse(raw.slice(0, lastCompleteObjEnd + 1) + ']');
      console.warn(`[AudioVideo] Extraction JSON was truncated (finish_reason: ${finishReason}) — recovered ${parsed.length} complete beats`);
    } catch {
      console.error('[AudioVideo] Extraction raw response (unparseable even after truncation repair):', raw.slice(0, 300), '...', raw.slice(-300));
      throw new Error(`Element extraction returned invalid JSON (finish_reason: ${finishReason}, length: ${raw.length} chars)`);
    }
  }
  if (!Array.isArray(parsed)) throw new Error('Element extraction did not return a JSON array');

  const maxIdx = words.length - 1;
  const elements = parsed
    .map(el => {
      const startIdx = Math.max(0, Math.min(maxIdx, Math.round(Number(el.start_idx))));
      const endIdx = Math.max(startIdx, Math.min(maxIdx, Math.round(Number(el.end_idx))));
      const kind = el.kind === 'character' ? 'character' : el.kind === 'quote' ? 'quote' : el.kind === 'text' ? 'text' : 'object';
      const isTextOnly = kind === 'quote' || kind === 'text';
      return {
        element: String(el.text || '').slice(0, 200).trim(),
        text: String(el.text || '').slice(0, 200).trim(),
        imagePrompt: isTextOnly ? null : String(el.image_prompt || el.text || '').slice(0, 300).trim(),
        kind,
        characterKey: kind === 'character' ? String(el.character_key || '').toLowerCase().trim().slice(0, 60) : null,
        startIdx, endIdx,
        start: words[startIdx].start,
        end: words[endIdx].end,
      };
    })
    .filter(el => el.element && Number.isFinite(el.start) && Number.isFinite(el.end) && el.end > el.start)
    // ✅ FIX (طلب العميل): شبكة الأمان دلوقتي بتحوّل العنصر الحساس لـ"quote" (نص بس، من غير
    // صورة/ملصق) بدل ما تشيله بالكامل — الآيات والأحاديث وأي إشارة لله/نبي لازم تفضل ظاهرة
    // كنص على الشاشة، بس من غير أي تمثيل بصري خالص، حتى لو الـ LLM حطها "character"/"object"
    // غلط بدل "quote" من الأول
    .map(el => isSensitiveReligiousElement(el.element) ? { ...el, kind: 'quote', imagePrompt: null, characterKey: null } : el)
    .sort((a, b) => a.startIdx - b.startIdx);

  return elements;
}

// ✅ Pollinations مجانية بدون مفتاح، وده معناه limit صارم على معدل الطلبات (429) خصوصًا لو
// كذا عنصر بيتولدوا ورا بعض بسرعة. بدل ما نستسلم من أول 429، بنعمل backoff تصاعدي (3s, 6s,
// 9s) ونجرب تاني — الفشل الوحيد المقبول هو بعد استنفاد المحاولات دي كلها
async function fetchPollinationsImage(prompt, attempt = 1) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
  const res = await fetch(url);
  // ✅ FIX: التقسيم الكثيف الجديد (لقطة كل 3-5 كلمات) بيطلب 15-20+ صورة للـ job الواحد بدل
  // 6-8 زي الأول — لوجات حقيقية أظهرت إن الـ 429 بيفضل مستمر حتى بعد فواصل 40-80 ثانية بين
  // الطلبات، يعني حد Pollinations أصعب بكتير من افتراضنا الأول. بدل backoff قصير (3s/6s/9s)
  // اللي بيرمي الصورة بسرعة، دلوقتي أطول وأصبر بكتير (10s/20s/30s/40s)
  if (res.status === 429 && attempt <= 4) {
    await new Promise(r => setTimeout(r, attempt * 10000));
    return fetchPollinationsImage(prompt, attempt + 1);
  }
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ✅ FIX (شكوى حقيقية: "العناصر كانت بتبقى لونها اخضر ومش مفهومة"): الطريقة القديمة كانت
// binary بس — بكسل إما شفاف تمامًا أو سايبه زي ما هو بلون الخلفية الأصلي. بكسلات الحافة
// (anti-aliasing) بين الشكل والخلفية الخضراء هي مزيج أخضر+لون الشكل، ولو المسافة اللونية
// بتاعتها طلعت أكبر من tolerance، كانت بتفضل بلونها الأخضر الممزوج ده كامل بلا أي تغيير —
// ده بالظبط الهامش/الوهج الأخضر اللي كان ظاهر حوالين كل ملصق. دلوقتي بندمج حلين:
// 1) alpha متدرّج (مش قطع ثنائي) في نطاق بين tolerance داخلي وخارجي، فحواف الشكل بتطلع
//    ناعمة بدل مسننة.
// 2) "despill" حقيقي: أي بكسل فضل شبه-شفاف (يعني على حافة الخلفية) وقناة الأخضر فيه أعلى
//    من الأحمر/الأزرق، بنسحب الأخضر لتحت لمستوى أقرب لباقي الألوان — ده بالظبط اللي بيشيل
//    "الوهج/التلوين الأخضر" المتبقي على حواف الشخصية بعد الإزالة، مش بس على الخلفية نفسها.
async function removeFlatBackground(buffer, innerTolerance = 30, outerTolerance = 75) {
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
  const edgePixels = []; // بكسلات شبه-شفافة (حافة) — محتاجين despill عليها بعد الانتشار
  const stack = [];
  for (let x = 0; x < width; x++) { stack.push(x); stack.push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { stack.push(y * width); stack.push(y * width + width - 1); }

  while (stack.length) {
    const pos = stack.pop();
    if (visited[pos]) continue;
    visited[pos] = 1;
    const p = pos * channels;
    const dist = colorDist(p);
    if (dist > outerTolerance) continue; // مش لون الخلفية خالص — نوقف الانتشار من هنا
    // ✅ alpha متدرّج: قريب جدًا من الأخضر = شفاف تمامًا، على الحافة = شفافية جزئية،
    // بعيد شوية (لسه جوه نطاق الانتشار) = يفضل شبه معتم لحد ما يتفحص بـ despill تحت
    const alphaFactor = dist <= innerTolerance ? 0 : (dist - innerTolerance) / (outerTolerance - innerTolerance);
    const newAlpha = Math.round(Math.min(255, Math.max(0, alphaFactor * 255)));
    data[p + 3] = newAlpha;
    if (newAlpha > 0) edgePixels.push(p);
    const x = pos % width, y = (pos - x) / width;
    if (x > 0) stack.push(pos - 1);
    if (x < width - 1) stack.push(pos + 1);
    if (y > 0) stack.push(pos - width);
    if (y < height - 1) stack.push(pos + width);
  }

  // ✅ Despill: على أي بكسل حافة (شبه-شفاف) لسه فيه أثر أخضر واضح، نسحب قناة الأخضر لتحت
  // لمستوى متوسط الأحمر/الأزرق — بيشيل الوهج الأخضر المتبقي على حواف الشكل نفسه
  for (const p of edgePixels) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const neutralG = (r + b) / 2;
    if (g > neutralG) {
      const opacity = data[p + 3] / 255; // كل ما البكسل أشفف، كل ما نسحب الأخضر أكتر
      data[p + 1] = Math.round(g - (g - neutralG) * (1 - opacity * 0.5));
    }
  }

  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

// ✅ أسلوب رسم مسطّح (2D flat vector illustration) بدل الصور الفوتوغرافية الواقعية اللي
// كانت طالعة قبل كده — أنسب لفيديو شرح متسق، وأنسب كمان لإزالة الخلفية الحقيقية فوق (خلفية
// لون واحد مصمت بدل تدرّج/ظل زي الصور الفوتوغرافية)
export async function generateElementImage(imagePrompt) {
  // ✅ FIX (شكوى حقيقية: كل ملصق طالع بلون أخضر/نعناعي مش مفهوم رغم تصحيح removeFlatBackground
  // في الحواف): المشكلة كانت أعمق من الحواف — طلب "خلفية خضراء" في البرومبت نفسه كان بيخلي
  // الموديل يميل بلوحة ألوان الشكل كله ناحية الأخضر/النعناعي (تسرّب لوني في التوليد نفسه، مش
  // بس في الحواف بعد الإزالة). الحل المباشر اللي طلبه العميل: خلفية الفيديو النهائي بيضاء
  // أصلًا (BG_COLOR في audioVideoRenderService.js)، فمفيش داعي لخلفية خضراء + إزالة خالص —
  // نطلب من Pollinations خلفية بيضاء صريحة من الأول، فألوان الشكل نفسه تفضل طبيعية زي ما هي.
  // removeFlatBackground فضلت زي ما هي بالظبط (بتاخد لون الخلفية الفعلي من زوايا الصورة
  // ديناميكيًا، مش لون مكتوب في الكود)، فبتشتغل صح مع أي لون خلفية من غير أي تغيير فيها.
  // ✅ FIX (طلب العميل): مفيش كلمة "sticker"/"icon" في البرومبت تاني — ده كان بيخلي الموديل
  // يطلع رموز/أيقونات مجردة غريبة لأي مفهوم صعب التصوير (زي ساعة رملية لـ"مدة")، بدل ما يرسم
  // "مشهد" حقيقي بسيط زي أي رسمة توضيحية عادية بتصوّر اللحظة/الفكرة فعليًا
  const fullPrompt = `${imagePrompt}, a natural ordinary illustrated scene — not an icon, not a sticker, not an abstract symbol, no isolated single object floating alone — depict an actual small moment or scene that captures the meaning, simple flat 2D illustration style, clean bold outlines, flat solid colors, vibrant natural colors, rich saturated color palette, no photorealism, no 3D render, no gradient, no texture, on a solid plain pure white background (#FFFFFF), single flat white background, no shadow, no vignette, centered`;
  let buffer;
  try {
    buffer = await fetchPollinationsImage(fullPrompt);
  } catch (e) {
    // ✅ محاولة تانية بـ prompt معدّل شوية — مفيش تكلفة إضافية من إعادة المحاولة (زي ما طلب)
    buffer = await fetchPollinationsImage(`${fullPrompt}, flat illustration, clean vector art`);
  }
  return removeFlatBackground(buffer);
}
