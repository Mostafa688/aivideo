// ── audioVideoService.js ─────────────────────────────────────────────────────
// مصنع فيديو الصوت (أدمن) — رفع فويس أوفر جاهز، تفريغه لنص بتوقيت دقيق على مستوى الكلمة
// (Groq Whisper)، تقسيمه للقطات كثيفة (كل 3-4 كلمات تقريبًا، Groq LLM) مع ملصق حقيقي من
// مكتبة أيقونات/إيموجي مجانية (Iconify — بدون مفتاح API) لكل لقطة عندها تصور بصري بسيط
// وشائع؛ أي لقطة مالهاش نتيجة مطابقة في المكتبة بتتحول لنص بدل ما تتلغى. الشخصيات المسمّاة
// بتتكرر بنفس الملصق. بناء الفيديو النهائي (ملصقات متحركة بحركة pop + نص متحرك للقطات
// النصية + دمج الصوت) في audioVideoRenderService.js.

import Groq from 'groq-sdk';
import fetch from 'node-fetch';
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

// ✅ FIX: الملصقات بقت جايه من أكتر من مصدر دلوقتي — SVG خام من Iconify (المصدر الأساسي)،
// أو PNG من GitHub emoji API (مصدر احتياطي تاني لو Iconify مالقاش حاجة، شوف findLibraryIcon).
// بنكتشف النوع الحقيقي من أول بايتات الملف (magic bytes) بدل ما نفترض SVG دايمًا زي الأول —
// لو اترفع PNG بامتداد/Content-Type غلط (.svg / image/svg+xml)، المتصفح مش هيقدر يعرضه صح
// ✅ NEW: زودنا webp/gif برضو (Tenor بيرجع الاتنين دول للستيكرز) — sharp بيقدر يفك أول
// فريم من الاتنين مباشرة زي أي صورة عادية، فمحتاجين بس نتعرف على النوع الصح عشان الرفع
function detectImageExt(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buffer.length >= 4 && buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
  return 'svg';
}
export async function uploadElementImageToR2(buffer) {
  const ext = detectImageExt(buffer);
  const contentType = ext === 'png' ? 'image/png' : ext === 'jpg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/svg+xml';
  const key = `audio-video/images/element_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  return uploadBufferToR2(buffer, key, contentType);
}

// ✅ بيحافظ على نوع الملف الحقيقي اللي اترفع (JPG/PNG/WEBP)، عكس uploadElementImageToR2
// اللي بتفترض SVG دايمًا من Iconify
function imageExtToContentType(ext) {
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}
async function uploadUserImageToR2(buffer, mimeExt, folder, name) {
  const ext = String(mimeExt || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const key = `audio-video/${folder}/${name}_${Date.now()}.${ext}`;
  return uploadBufferToR2(buffer, key, imageExtToContentType(ext));
}

// ✅ NEW (طلب العميل): صور مرجعية ثابتة بيرفعها الأدمن يدويًا (غلاف القرآن الكريم، صحيح
// البخاري، صحيح مسلم...) — بتتستخدم تلقائيًا مع لقطات "quote"
export async function uploadReferenceImageToR2(buffer, mimeExt = 'jpg', refKey = 'ref') {
  return uploadUserImageToR2(buffer, mimeExt, 'reference', refKey);
}

// ✅ NEW (طلب العميل): صورة "مشهد مركّب" — دايجرام واحد (زي 11 مرحلة) بيتحدد عليه نقاط
// زوم/pan يدويًا بدل ما يتقسم لملصقات منفصلة
export async function uploadCompositeImageToR2(buffer, mimeExt = 'jpg') {
  return uploadUserImageToR2(buffer, mimeExt, 'composite', 'scene');
}

export async function uploadFinalVideoToR2(buffer) {
  const key = `audio-video/final/video_${Date.now()}.mp4`;
  return uploadBufferToR2(buffer, key, 'video/mp4');
}

// ✅ NEW (طلب العميل): الفيديو النهائي يتحذف تلقائيًا من R2 بعد 24 ساعة عشان التخزين
// مايتجمعش — بنشتق مفتاح الملف من رابطه العام مباشرة (بنشيل بادئة R2_PUBLIC_URL بس)
export async function deleteAudioVideoFileFromR2(fileUrl) {
  if (!fileUrl) return;
  const prefix = `${R2_PUBLIC_URL}/`;
  if (!fileUrl.startsWith(prefix)) return;
  const key = fileUrl.slice(prefix.length);
  if (!key) return;
  try {
    const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: S3_ENDPOINT_URL,
      credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
    });
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (e) {
    console.warn('[AudioVideo] Failed to delete expired R2 file:', fileUrl, e.message);
  }
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

// ✅ NEW (طلب العميل): تحديد مصدر لقطة "quote" (قرآن/بخاري/مسلم/تاني) — بنفضّل قيمة الـ LLM
// نفسها لو موجودة ومعروفة، وإلا بنحاول نستنتجها من كلمات مفتاحية في نص اللقطة كشبكة أمان
// (لو الشبكة فوق هي اللي حوّلت اللقطة لـ"quote" أصلًا، الـ LLM ميكونش دّى quote_source خالص)
function guessQuoteSource(llmValue, text) {
  const known = ['quran', 'bukhari', 'muslim', 'other'];
  if (known.includes(llmValue)) return llmValue;
  const n = String(text || '');
  if (/بخاري/.test(n)) return 'bukhari';
  if (/مسلم/.test(n)) return 'muslim';
  if (/قرآن|آية|الآية|سورة/.test(n)) return 'quran';
  return 'other';
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
  const system = `You break a spoken narration transcript (given as an indexed word list "index:word", space-separated) into a VERY DENSE, ordered sequence of short "beats" — roughly every 2 to 4 words, or a short natural phrase/clause if that reads better, STRETCHING to 5-7 words only when that's what it takes to include one concrete, icon-able subject rather than cutting a clause into two bare connector fragments with nothing to show. This is a whiteboard-explainer style video — the whole appeal is a new icon/sticker landing on screen every couple of words, so err toward MORE, SHORTER beats rather than fewer longer ones. Cover the ENTIRE narration with near-gapless beats — do not skip stretches of it, and do not merge everything into a few broad topics like a summary would.

CRITICAL — EVERY beat shows EXACTLY ONE thing on screen, NEVER both: either a small ICON/emoji-style sticker (no text), or on-screen TEXT (no icon). Never combine an icon with text for the same beat. Icons come from a real public icon/emoji library search across FOUR sources (Iconify, Tenor stickers, Giphy stickers, GitHub emoji) covering practically every everyday noun, action, place, and emotion, and if all four still miss, the system automatically GENERATES a custom illustration for the request instead of giving up — so an icon/object/character request essentially ALWAYS ends up with a real visual one way or another, never a blank/failed beat. Given that safety net, default to "character"/"object" and only fall back to "text" when you are genuinely out of options: for ANY beat that names a person, object, animal, action, place, emotion, or even a loosely concrete abstract idea that could plausibly be drawn as a simple icon or small scene (e.g. "growing wealth" -> coins/money icon, "feeling lost" -> a person icon looking confused, "years passed" -> calendar/hourglass icon, "hard work" -> person working/sweat icon), you MUST pick "character"/"object" — do not play it safe with "text" just because the icon isn't 100% guaranteed to exist; the four-source search plus AI-generation fallback means it essentially always will. Reserve "text" ONLY for pure connectors/transitions ("and so", "therefore", "meanwhile"), or a phrase with truly no visual referent at all (a bare number, a date, a fully abstract claim with no depictable subject). The overwhelming majority of beats — think 80%+ — should end up as "character"/"object", not "text".

For each beat, output:
- "start_idx","end_idx": word indices (inclusive) it covers — reference ONLY the given indices, never invent numbers
- "text": the exact words for this beat, copied verbatim from the transcript
- "kind": "character" (icon, depicts/refers to a specific named recurring person — use a generic person/role icon, e.g. "man"), "object" (icon, a common concrete object/place/action), "text" (on-screen text only, no icon — abstract/transition/niche/no good simple-icon match), or "quote" (a direct Quranic verse, an authentic Hadith quote, or anything that would require depicting Allah/God or a prophet, see rule below)
- "character_key": ONLY when kind is "character" — a short lowercase English slug identifying that person (e.g. "bilal") — reuse the EXACT SAME character_key every single time this same person is depicted anywhere else in the transcript, so their icon stays consistent
- "image_prompts": ONLY for "character"/"object" kinds — OMIT this field entirely for "text"/"quote" kinds (they get on-screen text only, never an icon). An ARRAY of 3-4 alternative SEARCH KEYWORDS for a public icon/emoji library, NOT scene descriptions: each is 1-2 common English words naming the single concrete thing to search for. Order them from most specific/descriptive to most generic/fallback (e.g. for "an elderly man walking slowly": ["old man walking", "elderly man", "person walking", "person"]; for "a mosque at sunset": ["mosque sunset", "mosque", "islamic building", "building"]) — the search tries each in order across all four sources and stops at the first that finds an icon, so the later ones are safety-net fallbacks, not just repeats of the first idea. More candidates here means a real icon match more often instead of falling through to AI generation.
- "quote_source": ONLY when kind is "quote" — which real source this is: "quran" (a direct Quranic verse/ayah), "bukhari" (a Hadith explicitly attributed to Sahih al-Bukhari), "muslim" (a Hadith explicitly attributed to Sahih Muslim), or "other" (any other Hadith/religious reference, or an Allah/prophet mention with no specific named source). Only use "bukhari"/"muslim" when the narration itself names that specific collection — default to "other" if it just says "a Hadith says..." with no named collection.

CRITICAL religious-respect rule: NEVER create a beat depicting Allah/God, or any prophet (by name or title like "the Prophet"/"Messenger of God", in any language) — never give them "character" kind or an icon search of any figure. Use "quote" kind instead for these beats (and for direct Quranic verses / Hadith text) — these may still show a real cover image of the actual source book (Quran/Bukhari/Muslim) alongside the text, which is NOT a depiction of Allah or a prophet, just the physical book/text itself. When the narration only attributes something to them ("the Prophet said...") while actually discussing a concrete subject, make the beat about that concrete subject and skip the attribution — do not create a separate beat for the attribution itself.

Output ONLY valid JSON, no explanation, no markdown fences: [{"start_idx":N,"end_idx":N,"text":"...","kind":"object"|"character"|"text"|"quote","character_key":"...","image_prompts":["...","..."],"quote_source":"..."}].`;
  const user = `Indexed transcript (word_index:word):\n${indexedTranscript}\n\nJSON only:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ELEMENT_EXTRACTION_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      // ✅ FIX (طلب العميل: "زود العناصر... لقيت في عنصر لكل حاجة في iconify"): التقسيم
      // بقى أكثف بكتير (2-4 كلمات بدل 3-5)، يعني عدد اللقطات لكل فيديو زاد جدًا — رفعنا
      // max_tokens عشان الرد الأطول ميتقطعش قبل ما يخلص المصفوفة
      max_tokens: 12000, temperature: 0.3, reasoning_effort: 'low',
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
      // ✅ NEW (طلب العميل: "زود الملصقات"): بدل ما نطلب كلمة بحث واحدة بس لكل لقطة، بنطلب
      // من الـ LLM 2-3 بدائل مرتبة (الأكثر تحديدًا الأول، وبدائل أعم كشبكة أمان) في نفس
      // النداء بالظبط (مفيش نداء إضافي/تكلفة إضافية) — findLibraryIcon هيجرب كل واحدة على
      // التوالي في مرحلة الاستخراج (audioVideoRoutes.js) لحد ما توحد نتيجة، فرصة أكبر للقطة
      // إنها تلاقي ملصق بدل ما تتحول لنص. imagePrompt بيفضل أول بديل بس للتوافق مع أي كود قديم
      const promptCandidates = isTextOnly ? [] : (Array.isArray(el.image_prompts) && el.image_prompts.length
        ? el.image_prompts.map(p => String(p || '').slice(0, 300).trim()).filter(Boolean)
        : (el.image_prompt || el.text ? [String(el.image_prompt || el.text || '').slice(0, 300).trim()] : []));
      return {
        element: String(el.text || '').slice(0, 200).trim(),
        text: String(el.text || '').slice(0, 200).trim(),
        imagePrompt: promptCandidates[0] || null,
        imagePromptCandidates: promptCandidates,
        kind,
        characterKey: kind === 'character' ? String(el.character_key || '').toLowerCase().trim().slice(0, 60) : null,
        quoteSource: kind === 'quote' ? guessQuoteSource(el.quote_source, el.text) : null,
        startIdx, endIdx,
        start: words[startIdx].start,
        end: words[endIdx].end,
      };
    })
    .filter(el => el.element && Number.isFinite(el.start) && Number.isFinite(el.end) && el.end > el.start)
    // ✅ FIX (بلاغ العميل: كتلة نص ضخمة — اقتباس/جملة كاملة طويلة جدًا ظاهرة ثابتة على الشاشة
    // بدل نص بيتغيّر كل شوية زي باقي اللقطات): التعليمات فوق بتقول للموديل يلتزم بـ3-5 كلمات
    // لكل لقطة، لكن ده مش مضمون 100% (خصوصًا لقطات "quote" لما الموديل يفضّل يسيب الاقتباس
    // كامل كوحدة واحدة). شبكة أمان في الكود نفسه: أي لقطة أطول من الحد ده بتتقسّم هنا لبيتات
    // فرعية متتالية (~5 كلمات لكل واحدة)، كل واحدة بتوقيتها الحقيقي من الـ words array الأصلي —
    // نفس الـ kind/quoteSource بتتورّث لكل جزء
    .flatMap(el => {
      const MAX_BEAT_WORDS = 8, SPLIT_CHUNK_WORDS = 5;
      const span = el.endIdx - el.startIdx + 1;
      if (span <= MAX_BEAT_WORDS) return [el];
      const chunks = [];
      for (let s = el.startIdx; s <= el.endIdx; s += SPLIT_CHUNK_WORDS) {
        const e = Math.min(el.endIdx, s + SPLIT_CHUNK_WORDS - 1);
        const chunkText = words.slice(s, e + 1).map(w => w.word).join(' ').trim();
        if (!chunkText) continue;
        chunks.push({ ...el, element: chunkText, text: chunkText, startIdx: s, endIdx: e, start: words[s].start, end: words[e].end });
      }
      return chunks.length ? chunks : [el];
    })
    // ✅ FIX (طلب العميل): شبكة الأمان دلوقتي بتحوّل العنصر الحساس لـ"quote" (نص بس، من غير
    // صورة/ملصق) بدل ما تشيله بالكامل — الآيات والأحاديث وأي إشارة لله/نبي لازم تفضل ظاهرة
    // كنص على الشاشة، بس من غير أي تمثيل بصري خالص، حتى لو الـ LLM حطها "character"/"object"
    // غلط بدل "quote" من الأول
    .map(el => isSensitiveReligiousElement(el.element)
      ? { ...el, kind: 'quote', imagePrompt: null, imagePromptCandidates: [], characterKey: null, quoteSource: el.quoteSource || guessQuoteSource(null, el.element) }
      : el)
    .sort((a, b) => a.startIdx - b.startIdx);

  return elements;
}

// ✅ NEW: اتفصلت من audioVideoRoutes.js (كانت جوه /jobs/:id/extract مباشرة) عشان أي pipeline
// تاني (زي whiteboardVideoRoutes.js العام) يقدر يستخدم نفس منطق "جيب/ولّد صورة لكل عنصر"
// من غير تكرار كود — ده اللي كان ناقص في الـpipeline العام، فكل العناصر كانت بتتحط في
// الفيديو من غير imageUrl خالص (طالعة فاضية تمامًا، ولا حتى نص لأن kind فضلت object/character
// مش text). بياخد العناصر الخام من extractVideoElements + خريطة الصور المرجعية (Quran/
// Bukhari/Muslim)، وبيرجّع نفس العناصر بس معاها imageUrl (أو kind:'text' لو مفيش نتيجة خالص)
export async function resolveElementImages(elements, referenceImages = {}) {
  const characterImageCache = new Map(); // characterKey -> imageUrl
  const withImages = [];
  let llmTextCount = 0, iconFoundCount = 0, iconMissCount = 0, aiGeneratedCount = 0;
  for (const el of elements) {
    if (el.kind === 'quote') {
      const refUrl = referenceImages[el.quoteSource] || referenceImages.other || null;
      if (refUrl) iconFoundCount++; else llmTextCount++;
      withImages.push({ ...el, imageUrl: refUrl });
      continue;
    }
    if (el.kind === 'text') {
      llmTextCount++;
      withImages.push({ ...el, imageUrl: null });
      continue;
    }
    if (el.kind === 'character' && el.characterKey && characterImageCache.has(el.characterKey)) {
      iconFoundCount++;
      withImages.push({ ...el, imageUrl: characterImageCache.get(el.characterKey) });
      continue;
    }
    const promptCandidates = Array.isArray(el.imagePromptCandidates) && el.imagePromptCandidates.length
      ? el.imagePromptCandidates
      : (el.imagePrompt ? [el.imagePrompt] : []);
    let buffer = null;
    for (const candidate of promptCandidates) {
      try {
        buffer = await findLibraryIcon(candidate);
      } catch (e) {
        console.warn('[AudioVideo] Icon lookup failed for candidate, trying next:', candidate, e.message);
      }
      if (buffer) break;
    }
    if (!buffer) {
      try {
        const genBuffer = await generateElementImage(promptCandidates[0] || el.text);
        const genImageUrl = await uploadElementImageToR2(genBuffer);
        aiGeneratedCount++;
        console.log(`[AudioVideo] Icon miss — beat "${el.text}" tried [${promptCandidates.join(', ') || 'none'}], no match in any icon library, generated one with AI instead`);
        withImages.push({ ...el, imageUrl: genImageUrl, imagePromptCandidates: undefined });
        if (el.kind === 'character' && el.characterKey) characterImageCache.set(el.characterKey, genImageUrl);
        continue;
      } catch (e) {
        console.warn('[AudioVideo] AI image generation fallback also failed:', el.text, e.message);
      }
      iconMissCount++;
      console.log(`[AudioVideo] Icon miss — beat "${el.text}" tried [${promptCandidates.join(', ') || 'none'}], no match in any icon library, AI generation also failed, downgraded to text`);
      withImages.push({ ...el, kind: 'text', imageUrl: null, imagePrompt: null, imagePromptCandidates: [], characterKey: null });
      continue;
    }
    iconFoundCount++;
    const imageUrl = await uploadElementImageToR2(buffer);
    withImages.push({ ...el, imageUrl, imagePromptCandidates: undefined });
    if (el.kind === 'character' && el.characterKey) characterImageCache.set(el.characterKey, imageUrl);
  }
  console.log(`[AudioVideo] Extract summary: ${elements.length} beats — LLM chose text/quote directly: ${llmTextCount}, icon found: ${iconFoundCount}, AI-generated (icon miss fallback): ${aiGeneratedCount}, icon search + AI generation both failed (downgraded to text): ${iconMissCount}`);
  return withImages;
}

// ✅ FIX (طلب العميل): بدل ما نولّد صور بالذكاء الاصطناعي (كانت طالعة وحشة/مش مفهومة كتير)،
// دلوقتي بندور على ملصق حقيقي جاهز في مكتبة أيقونات/إيموجي عامة ومجانية بالكامل (Iconify —
// بيجمع مئات الآلاف من الأيقونات من مكتبات مفتوحة المصدر كتير، من غير أي مفتاح API أو تسجيل).
// لو مفيش نتيجة مطابقة، بترجع null — والـ caller (audioVideoRoutes.js) وقتها بيحوّل اللقطة
// دي لـ"نص بس" بدل ما يفضل يحاول يخترع ملصق، بالظبط زي ما طلب العميل.
// ✅ FIX (باج حقيقي: كل اللقطات كانت بترجع "نص بس" حتى لكلمات عادية جدًا زي "كتاب"): كان
// فيه نداء أول بفلتر "prefixes" على مجموعات إيموجي معيّنة، ولو أي اسم مجموعة فيها غلط أو مش
// موجود فعليًا، Iconify كانت بترجع رد غير ناجح، والكود كان بيعمل throw فورًا من غير ما يجرب
// النداء التاني (بحث عام من غير فلتر) خالص — يعني أي مشكلة في فلتر الإيموجي كانت بتلغي
// البحث كله وتحول كل حاجة لنص. دلوقتي نداء واحد بس (بحث عام مضمون الصيغة، من غير فلتر
// prefixes خطر)، وتفضيل نتيجة من مجموعة إيموجي ملوّنة *بعد* ما النتائج ترجع (فلترة محلية
// آمنة، مش شرط في الطلب نفسه) — وأي خطأ شبكة/API بيترجع null هادي (مش throw) عشان اللقطة
// تتحول لنص بس، مش توقف البحث كله.
const PREFERRED_EMOJI_PREFIXES = ['noto', 'twemoji', 'openmoji', 'fxemoji', 'noto-v1'];

async function iconifySearch(query) {
  const url = `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=24`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data.icons) ? data.icons : [];
}

// ✅ NEW (طلب العميل: "زود ملصقات") — لو عبارة البحث الكاملة (مثلاً "man walking") مالهاش أي
// نتيجة في Iconify، ده مش معناه إن مفيش أيقونة مناسبة خالص — غالبًا كلمة واحدة من العبارة
// (الاسم الأساسي فيها، زي "man") هي اللي فعلاً موجودة كأيقونة، والكلمة التانية (فعل/صفة زي
// "walking") هي اللي مخليّة البحث الدقيق يفشل. فبنبني قائمة محاولات بديلة: العبارة كاملة
// الأول، وبعدين كل كلمة لوحدها (الأطول فالأقصر، عشان الاسم المميز غالبًا أطول من كلمة ربط)،
// وبعدين محاولة أخيرة بإفراد الجمع (strip "s") لو الكلمة منتهية بيها
function buildIconSearchCandidates(keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return [];
  const candidates = [q];
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      if (w.length > 2 && !candidates.includes(w)) candidates.push(w);
    }
  }
  const last = candidates[candidates.length - 1];
  if (last && last.length > 3 && last.endsWith('s') && !candidates.includes(last.slice(0, -1))) {
    candidates.push(last.slice(0, -1));
  }
  return candidates;
}

// ✅ NEW (طلب العميل: "ممكن نزود مواقع تانية للملصقات لو ملقاش يدور في واحد تاني") — مصدر
// احتياطي ثاني، منفصل تمامًا عن Iconify: GitHub الرسمي بيوفر قائمة كل الإيموجي بتاعته
// (شورت-كود → رابط صورة PNG حقيقي) من غير أي مفتاح API خالص. بنجيبها مرة واحدة ونكاشها في
// الميموري، وبندوّر فيها بمطابقة نصية بسيطة (شورت-كود مطابق أو جزء منه) على كل كلمة من كلمات
// البحث. لو Iconify فشل تمامًا (مش مجرد الكلمة دي، فشل حقيقي)، ده بيديها فرصة تانية قبل ما
// اللقطة تتحول لنص بدل ملصق
let githubEmojiMapCache = null;
async function loadGithubEmojiMap() {
  if (githubEmojiMapCache) return githubEmojiMapCache;
  try {
    const res = await fetch('https://api.github.com/emojis');
    if (!res.ok) return (githubEmojiMapCache = {});
    const data = await res.json();
    return (githubEmojiMapCache = data && typeof data === 'object' ? data : {});
  } catch {
    return (githubEmojiMapCache = {});
  }
}
// ✅ NEW (طلب العميل: "زود مواقع للملصقات، فيه موقع زي Tenor بس ستيكر مش GIF"): Tenor
// (بتاع جوجل) عنده قسم "Sticker" منفصل تمامًا عن الـ GIFs العادية (صور ثابتة أو متحركة
// بخلفية شفافة، مصممة أصلًا كملصقات) — محتاج مفتاح API مجاني من Google (Tenor API)، مش
// زي Iconify/GitHub اللي من غير مفتاح خالص. لو المفتاح مش متظبط في متغيرات البيئة
// (TENOR_API_KEY)، الدالة دي بترجع null بهدوء والبحث بيكمل عادي على المصادر التانية —
// يعني المصدر ده اختياري بالكامل، مش شرط يشتغل الموقع من غيره
const TENOR_API_KEY = process.env.TENOR_API_KEY;
async function findTenorStickerUrl(keyword) {
  if (!TENOR_API_KEY) return null;
  const q = String(keyword || '').trim();
  if (!q) return null;
  try {
    const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&client_key=erivion_audiovideo&limit=6&contentfilter=high&searchfilter=sticker&media_filter=png_transparent,webp_transparent,tinygif_transparent,gif_transparent`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    for (const r of results) {
      const mf = r.media_formats || {};
      const pick = mf.png_transparent || mf.webp_transparent || mf.tinygif_transparent || mf.gif_transparent;
      if (pick?.url) return pick.url;
    }
    return null;
  } catch (e) {
    console.warn('[AudioVideo] Tenor sticker lookup failed:', keyword, e.message);
    return null;
  }
}

// ✅ NEW (طلب العميل: "زود مواقع للملصقات، فيه موقع اسمه giphy"): Giphy عنده قسم "Stickers"
// منفصل عن الـ GIFs العادية بالظبط زي Tenor (صور بخلفية شفافة، مصممة أصلًا كملصقات) —
// نفس النمط بالظبط: مفتاح API مجاني من Giphy (GIPHY_API_KEY)، لو مش متظبط الدالة بترجع
// null بهدوء والبحث بيكمل عادي على المصادر التانية — مصدر اختياري بالكامل
const GIPHY_API_KEY = process.env.GIPHY_API_KEY;
async function findGiphyStickerUrl(keyword) {
  if (!GIPHY_API_KEY) return null;
  const q = String(keyword || '').trim();
  if (!q) return null;
  try {
    const url = `https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=6&rating=g`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const results = Array.isArray(data.data) ? data.data : [];
    for (const r of results) {
      const images = r.images || {};
      const pick = images.fixed_width_downsampled || images.downsized || images.original;
      if (pick?.url) return pick.url;
    }
    return null;
  } catch (e) {
    console.warn('[AudioVideo] Giphy sticker lookup failed:', keyword, e.message);
    return null;
  }
}

async function findGithubEmojiUrl(keyword) {
  const q = String(keyword || '').trim().toLowerCase();
  if (!q) return null;
  const map = await loadGithubEmojiMap();
  const keys = Object.keys(map);
  if (!keys.length) return null;
  const words = q.split(/\s+/).filter(w => w.length > 2);
  const tries = [q, ...words.sort((a, b) => b.length - a.length)];
  for (const w of tries) {
    const exact = keys.find(k => k === w || k.replace(/_/g, ' ') === w);
    if (exact) return map[exact];
  }
  for (const w of tries) {
    const partial = keys.find(k => k.includes(w) || w.includes(k));
    if (partial) return map[partial];
  }
  return null;
}

// ✅ بيرجّع buffer الصورة الخام (SVG من Iconify أو PNG من الاحتياطي) — التحويل/الـresize
// بيحصل في audioVideoRenderService.js بـ sharp، اللي بيقدر يرندر الاتنين. بيرجّع null لو
// مفيش نتيجة في أي مصدر أو حصل أي خطأ (مش استثناء بيوقف حاجة — حالة طبيعية ومتوقعة، يعني
// الجملة دي هتتحول لنص بدل ملصق)
export async function findLibraryIcon(keyword) {
  const candidates = buildIconSearchCandidates(keyword);
  if (!candidates.length) return null;
  try {
    for (const q of candidates) {
      const icons = await iconifySearch(q);
      if (!icons.length) continue;
      // ✅ FIX (بلاغ العميل: "لازم يكون فيه ذكاء أكتر في اختيار الملصق مش أي ملصق يختاره"):
      // كنا بنفضّل أي أيقونة من مجموعات إيموجي معيّنة لمجرد إنها من المجموعة دي، حتى لو اسمها
      // مش قريب من كلمة البحث خالص — ده كان أحيانًا بيستبدل أفضل نتيجة رجّعتها Iconify نفسها
      // (مرتبة بالفعل بالأصلح للكلمة) بملصق إيموجي أقل صلة بس لأنه من الأسلوب المفضّل بصريًا.
      // دلوقتي بنفضّل ملصق الإيموجي بس لو اسمه فعلاً قريب من كلمة البحث، وإلا بناخد أول نتيجة
      // زي ما هي (ترتيب Iconify نفسه حسب الصلة)
      const qLower = q.toLowerCase();
      const relevantEmoji = icons.find(i => {
        if (!PREFERRED_EMOJI_PREFIXES.some(p => i.startsWith(`${p}:`))) return false;
        const name = i.split(':').slice(1).join(':').replace(/-/g, ' ');
        return name.includes(qLower) || qLower.includes(name);
      });
      const chosen = relevantEmoji || icons[0];
      const [prefix, ...nameParts] = chosen.split(':');
      const name = nameParts.join(':');
      const svgRes = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`);
      if (!svgRes.ok) continue;
      return Buffer.from(await svgRes.arrayBuffer());
    }
    for (const q of candidates) {
      const tenorUrl = await findTenorStickerUrl(q);
      if (!tenorUrl) continue;
      const tenorRes = await fetch(tenorUrl);
      if (tenorRes.ok) return Buffer.from(await tenorRes.arrayBuffer());
    }
    for (const q of candidates) {
      const giphyUrl = await findGiphyStickerUrl(q);
      if (!giphyUrl) continue;
      const giphyRes = await fetch(giphyUrl);
      if (giphyRes.ok) return Buffer.from(await giphyRes.arrayBuffer());
    }
    const ghUrl = await findGithubEmojiUrl(keyword);
    if (ghUrl) {
      const ghRes = await fetch(ghUrl);
      if (ghRes.ok) return Buffer.from(await ghRes.arrayBuffer());
    }
    return null;
  } catch (e) {
    console.warn('[AudioVideo] Icon lookup failed for keyword:', keyword, e.message);
    return null;
  }
}

// ✅ NEW (طلب العميل: واجهة بحث يدوي عن ملصق — الأدمن/المستخدم يكتب كلمة ويشوف نتائج حقيقية
// يختار منها بنفسه، بدل ما النظام يختار تلقائي زي findLibraryIcon فوق): بيرجّع مصفوفة نتائج
// (لحد limit) من كل المصادر الأربعة مع بعض — كل نتيجة رابط صورة عام (CDN مباشر) تقدر
// الواجهة تعرضه كـ<img> من غير ما تحتاج تعدي عليه بالسيرفر تاني. الترتيب: Iconify (أكتر
// مصدر فيه تنوع)، Tenor، Giphy، GitHub emoji — كل مصدر بياخد نصيب من الـlimit عشان النتايج
// تتنوع مش كلها من مصدر واحد
export async function searchStickerCandidates(query, limit = 16) {
  const q = String(query || '').trim();
  if (!q) return [];
  const perSource = Math.max(2, Math.ceil(limit / 4));
  const results = [];

  try {
    const icons = await iconifySearch(q);
    for (const chosen of icons.slice(0, perSource)) {
      const [prefix, ...nameParts] = chosen.split(':');
      const name = nameParts.join(':');
      results.push({ source: 'iconify', label: name.replace(/-/g, ' '), url: `https://api.iconify.design/${prefix}/${name}.svg` });
    }
  } catch (e) { console.warn('[AudioVideo] Sticker search (Iconify) failed:', e.message); }

  if (TENOR_API_KEY) {
    try {
      const url = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${TENOR_API_KEY}&client_key=erivion_audiovideo&limit=${perSource}&contentfilter=high&searchfilter=sticker&media_filter=png_transparent,webp_transparent,tinygif_transparent,gif_transparent`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        for (const r of (data.results || [])) {
          const mf = r.media_formats || {};
          const pick = mf.png_transparent || mf.webp_transparent || mf.tinygif_transparent || mf.gif_transparent;
          if (pick?.url) results.push({ source: 'tenor', label: q, url: pick.url });
        }
      }
    } catch (e) { console.warn('[AudioVideo] Sticker search (Tenor) failed:', e.message); }
  }

  if (GIPHY_API_KEY) {
    try {
      const url = `https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=${perSource}&rating=g`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        for (const r of (data.data || [])) {
          const images = r.images || {};
          const pick = images.fixed_width_downsampled || images.downsized || images.original;
          if (pick?.url) results.push({ source: 'giphy', label: q, url: pick.url });
        }
      }
    } catch (e) { console.warn('[AudioVideo] Sticker search (Giphy) failed:', e.message); }
  }

  try {
    const ghUrl = await findGithubEmojiUrl(q);
    if (ghUrl) results.push({ source: 'github', label: q, url: ghUrl });
  } catch (e) { console.warn('[AudioVideo] Sticker search (GitHub emoji) failed:', e.message); }

  return results.slice(0, limit);
}

// ✅ NEW (طلب العميل: "لو مفيش ملصق مطابق يعملهولي بالكود، ملوّن و2D Cartoon"): لو مكتبة
// الأيقونات كلها (Iconify/Tenor/GitHub emoji) مالقتش نتيجة لأي بديل بحث، بدل ما نستسلم
// ونحوّل اللقطة لنص فورًا، بنجرّب نولّد صورة بالذكاء الاصطناعي (Pollinations.ai — مجاني
// بالكامل بدون مفتاح API). ده fallback أخير بس (مكتبة حقيقية لسه هي الأول دايمًا — أسرع
// وأدق)، مش بديل عن البحث.
// ✅ FIX (طلب العميل: "الخلفية تكون بيضاء أصلًا من غير أي إزالة خلفية"): بدل التوليد على
// خلفية كروما كي خضراء وبعدين محاولة إزالتها بالكود (اللي ممكن يسيب وهج/حواف مش نضيفة مهما
// اتحسّنت الخوارزمية)، بنولّد الصورة على خلفية بيضاء صريحة من الأساس — نفس لون خلفية الرندر
// بالظبط (BG_COLOR في audioVideoRenderService.js) — فبتندمج تلقائيًا من غير أي حاجة زيادة
async function fetchPollinationsImage(prompt, attempt = 1) {
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true`;
  const res = await fetch(url);
  if (res.status === 429 && attempt <= 4) {
    await new Promise(r => setTimeout(r, attempt * 10000));
    return fetchPollinationsImage(prompt, attempt + 1);
  }
  if (!res.ok) throw new Error(`Pollinations error ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ✅ ستايل "2D Cartoon" ملوّن بالظبط زي ما طلب العميل، على خلفية بيضاء صريحة
export async function generateElementImage(imagePrompt) {
  const fullPrompt = `${imagePrompt}, 2D cartoon illustration, flat solid colors, clean bold outlines, vibrant natural colors, rich saturated color palette, no photorealism, no 3D render, no gradient, no texture, on a solid plain white background (#FFFFFF), single flat white background, no shadow, centered`;
  try {
    return await fetchPollinationsImage(fullPrompt);
  } catch {
    return fetchPollinationsImage(`${fullPrompt}, flat design, sticker style, vector art`);
  }
}

// ── ملصقات مخصّصة بالجملة (طلب العميل) ───────────────────────────────────────────
// الأدمن بيرفع مجموعة صور/ملصقات جاهزة (ممكن يكون فيها نص مكتوب أصلًا)، والنظام:
// 1) بيقرأ كل صورة بموديل رؤية (vision) مجاني على Groq — نفس مفتاح GROQ_API_KEY المستخدم
//    أصلًا للتفريغ والاستخراج، فمفيش أي تسجيل/مفتاح جديد مطلوب من العميل خالص.
// 2) بيدي النظام كل الأوصاف دي + الترانسكريبت الكامل مرقّم بالكلمة لنداء LLM واحد يحدد
//    لكل صورة أنسب لحظة في الفيديو تتناسب مع كلامها.
// 3) بيتحط كل ملصق كـ"عنصر" عادي زي أي لقطة تانية (imageWidth/imageHeight بتتخزن معاه
//    عشان الرندر يحافظ على نسبته الأصلية بدل ما يفرض مربع تابت زي الأيقونات العادية).
async function uploadBulkStickerToR2(buffer, mimeExt) {
  return uploadUserImageToR2(buffer, mimeExt, 'bulk-sticker', 'img');
}

// ✅ FIX (بلاغ حقيقي من اللوج: 404 model_not_found): كان فيه اسم موديل رؤية واحد بس
// مكتوب يدويًا، واتضح إنه مش متاح فعليًا على الحساب ده. بدل ما نراهن على اسم واحد
// (ونتفاجئ تاني لو اتغيّر/اتشال زي ما حصل قبل كده مع موديل الاستخراج)، بنجرب كذا موديل
// رؤية معروف على Groq بالترتيب لحد ما واحد ينجح — ونحفظ أول واحد نجح في الذاكرة عشان
// الصور اللي بعده تستخدمه على طول من غير ما تعيد تجربة الفاشلين في كل مرة
const VISION_MODEL_CANDIDATES = [
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
];
let workingVisionModel = null;
async function captionImageWithVision(imageUrl) {
  if (!GROQ_API_KEY) return null;
  const candidates = workingVisionModel ? [workingVisionModel, ...VISION_MODEL_CANDIDATES.filter(m => m !== workingVisionModel)] : VISION_MODEL_CANDIDATES;
  for (const model of candidates) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this sticker/image in one short sentence (max 20 words): what it depicts, and if it has any text written on it, quote that text exactly. Answer in the same language as any text in the image, or English if there is none. No preamble, just the description.' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          }],
          max_tokens: 150, temperature: 0.2,
        }),
      });
      if (!res.ok) {
        const errText = (await res.text()).slice(0, 200);
        console.warn('[AudioVideo] Vision caption request failed:', model, res.status, errText);
        continue;
      }
      workingVisionModel = model;
      const data = await res.json();
      return (data.choices?.[0]?.message?.content || '').trim().slice(0, 300) || null;
    } catch (e) {
      console.warn('[AudioVideo] Vision caption failed:', model, e.message);
    }
  }
  return null;
}
export { captionImageWithVision, uploadBulkStickerToR2 };

// ✅ نداء واحد بس (زي extractVideoElements بالظبط): بياخد الترانسكريبت مرقّم بالكلمة +
// وصف كل صورة، ويرجّع لكل صورة أنسب word_index تظهر عنده. reasoning اختياري بيساعد في
// الدقة (بيخلي الموديل يفكر خطوة بخطوة) وممكن نلوجه للتشخيص لو المطابقة غلط
export async function matchStickersToTranscript(words, images) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  if (!words?.length || !images?.length) return [];
  const indexedTranscript = words.map((w, i) => `${i}:${w.word}`).join(' ');
  const imageList = images.map((img, i) => `${i}: ${img.caption || '(no description available)'}`).join('\n');
  const system = `You are given a numbered list of custom sticker images an admin uploaded for a narration video, and the video's full narration transcript as an indexed word list ("index:word", space-separated). For EACH image, find the single word index in the transcript where that image's content best matches what's being said at that moment (if the sticker has text written on it, match it to the point where the narration says something equivalent or closely related). Assume the images are roughly in the same order as they'll appear in the narration unless the content clearly says otherwise. Briefly reason before deciding, then give your final answer.

Output ONLY valid JSON, no explanation outside the JSON, no markdown fences: [{"image_index":N,"start_idx":N,"reasoning":"reason in 6 words or fewer"}] — one entry per image, in image_index order. Keep "reasoning" very short (a few words, not a sentence) so the full response stays compact.`;
  const user = `Images:\n${imageList}\n\nIndexed transcript (word_index:word):\n${indexedTranscript}\n\nJSON only:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ELEMENT_EXTRACTION_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 6000, temperature: 0.2, reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Sticker matching Groq error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const finishReason = data.choices?.[0]?.finish_reason;
  let raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
  const firstBracket = raw.indexOf('[');
  if (firstBracket > 0) raw = raw.slice(firstBracket);

  // ✅ FIX (بلاغ حقيقي من اللوج: "Sticker matching returned invalid JSON"): نفس مشكلة
  // الاستخراج بالظبط ممكن تحصل هنا — لو الرد اتقطع قبل ما يخلص المصفوفة (finish_reason:
  // "length")، كان أي خطأ JSON.parse بيفشّل الدفعة كلها من غير أي محاولة تعافي. دلوقتي
  // بنحاول نصلح الـ JSON زي extractVideoElements بالظبط: نلاقي آخر "}" كامل ونقفل المصفوفة
  // من هناك، فنسترجع كل المطابقات الكاملة اللي اتولدت قبل القطع بدل ما نضيعها كلها
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const lastCompleteObjEnd = raw.lastIndexOf('}');
    if (lastCompleteObjEnd === -1) {
      console.error('[AudioVideo] Sticker matching raw response (unparseable):', raw.slice(0, 500));
      throw new Error(`Sticker matching returned invalid JSON (finish_reason: ${finishReason}, length: ${raw.length} chars)`);
    }
    try {
      parsed = JSON.parse(raw.slice(0, lastCompleteObjEnd + 1) + ']');
      console.warn(`[AudioVideo] Sticker matching JSON was truncated (finish_reason: ${finishReason}) — recovered ${parsed.length} complete matches`);
    } catch {
      console.error('[AudioVideo] Sticker matching raw response (unparseable even after truncation repair):', raw.slice(0, 300), '...', raw.slice(-300));
      throw new Error(`Sticker matching returned invalid JSON (finish_reason: ${finishReason}, length: ${raw.length} chars)`);
    }
  }
  if (!Array.isArray(parsed)) throw new Error('Sticker matching did not return a JSON array');

  const maxIdx = words.length - 1;
  return parsed
    .map(m => ({
      imageIndex: Math.round(Number(m.image_index)),
      startIdx: Math.max(0, Math.min(maxIdx, Math.round(Number(m.start_idx)))),
      reasoning: String(m.reasoning || '').slice(0, 200),
    }))
    .filter(m => Number.isInteger(m.imageIndex) && m.imageIndex >= 0 && m.imageIndex < images.length);
}
