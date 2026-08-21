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

// ✅ FIX: الملصقات بقت SVG خام جاي من مكتبة Iconify (مش PNG مولّد بالذكاء الاصطناعي) —
// SVG بيتفتح عادي في <img> في واجهة الأدمن، وsharp بيقدر يرندره مباشرة في مرحلة البناء
export async function uploadElementImageToR2(buffer) {
  const key = `audio-video/images/element_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.svg`;
  return uploadBufferToR2(buffer, key, 'image/svg+xml');
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
  const system = `You break a spoken narration transcript (given as an indexed word list "index:word", space-separated) into a DENSE, ordered sequence of short "beats" — roughly every 3 to 5 words, or a short natural phrase/clause if that reads better. Cover the ENTIRE narration with near-gapless beats — do not skip stretches of it, and do not merge everything into a few broad topics like a summary would.

CRITICAL — EVERY beat shows EXACTLY ONE thing on screen, NEVER both: either a small ICON/emoji-style sticker (no text), or on-screen TEXT (no icon). Never combine an icon with text for the same beat. Icons come from a real public icon/emoji library search (not AI-generated), and the library is large and covers most everyday nouns, actions, and places — so lean toward requesting an icon whenever the beat names ANY concrete person, object, action, or place, even a moderately specific one (the search tries the full phrase and then falls back to its individual words, so a partial match still finds something). Only use TEXT when the phrase is genuinely abstract, a transition/connector, a feeling with no physical form, or a very specific/niche description with no plausible icon at all — an unmatched icon request automatically becomes text anyway, so there's little downside to trying the icon first whenever there's a real concrete thing to point at.

For each beat, output:
- "start_idx","end_idx": word indices (inclusive) it covers — reference ONLY the given indices, never invent numbers
- "text": the exact words for this beat, copied verbatim from the transcript
- "kind": "character" (icon, depicts/refers to a specific named recurring person — use a generic person/role icon, e.g. "man"), "object" (icon, a common concrete object/place/action), "text" (on-screen text only, no icon — abstract/transition/niche/no good simple-icon match), or "quote" (a direct Quranic verse, an authentic Hadith quote, or anything that would require depicting Allah/God or a prophet, see rule below)
- "character_key": ONLY when kind is "character" — a short lowercase English slug identifying that person (e.g. "bilal") — reuse the EXACT SAME character_key every single time this same person is depicted anywhere else in the transcript, so their icon stays consistent
- "image_prompt": ONLY for "character"/"object" kinds — OMIT this field entirely for "text"/"quote" kinds (they get on-screen text only, never an icon). This is a SEARCH KEYWORD for a public icon/emoji library, NOT a scene description: 1-2 common English words naming the single concrete thing to search for (e.g. "book", "clock", "handshake", "mosque", "man walking", "heart", "compass") — simple, universal, generic terms only, never a sentence or a specific/niche description.
- "quote_source": ONLY when kind is "quote" — which real source this is: "quran" (a direct Quranic verse/ayah), "bukhari" (a Hadith explicitly attributed to Sahih al-Bukhari), "muslim" (a Hadith explicitly attributed to Sahih Muslim), or "other" (any other Hadith/religious reference, or an Allah/prophet mention with no specific named source). Only use "bukhari"/"muslim" when the narration itself names that specific collection — default to "other" if it just says "a Hadith says..." with no named collection.

CRITICAL religious-respect rule: NEVER create a beat depicting Allah/God, or any prophet (by name or title like "the Prophet"/"Messenger of God", in any language) — never give them "character" kind or an icon search of any figure. Use "quote" kind instead for these beats (and for direct Quranic verses / Hadith text) — these may still show a real cover image of the actual source book (Quran/Bukhari/Muslim) alongside the text, which is NOT a depiction of Allah or a prophet, just the physical book/text itself. When the narration only attributes something to them ("the Prophet said...") while actually discussing a concrete subject, make the beat about that concrete subject and skip the attribution — do not create a separate beat for the attribution itself.

Output ONLY valid JSON, no explanation, no markdown fences: [{"start_idx":N,"end_idx":N,"text":"...","kind":"object"|"character"|"text"|"quote","character_key":"...","image_prompt":"...","quote_source":"..."}].`;
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
        quoteSource: kind === 'quote' ? guessQuoteSource(el.quote_source, el.text) : null,
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
    .map(el => isSensitiveReligiousElement(el.element)
      ? { ...el, kind: 'quote', imagePrompt: null, characterKey: null, quoteSource: el.quoteSource || guessQuoteSource(null, el.element) }
      : el)
    .sort((a, b) => a.startIdx - b.startIdx);

  return elements;
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

// ✅ بيرجّع buffer الـ SVG الخام (مش PNG) — التحويل/الـresize بيحصل في audioVideoRenderService.js
// بـ sharp، اللي بيقدر يرندر SVG مباشرة. بيرجّع null لو مفيش ولا نتيجة واحدة أو حصل أي خطأ
// (مش استثناء بيوقف حاجة — حالة طبيعية ومتوقعة، يعني الجملة دي هتتحول لنص بدل ملصق)
export async function findLibraryIcon(keyword) {
  const candidates = buildIconSearchCandidates(keyword);
  if (!candidates.length) return null;
  try {
    for (const q of candidates) {
      const icons = await iconifySearch(q);
      if (!icons.length) continue;
      const preferred = icons.find(i => PREFERRED_EMOJI_PREFIXES.some(p => i.startsWith(`${p}:`)));
      const chosen = preferred || icons[0];
      const [prefix, ...nameParts] = chosen.split(':');
      const name = nameParts.join(':');
      const svgRes = await fetch(`https://api.iconify.design/${prefix}/${name}.svg`);
      if (!svgRes.ok) continue;
      return Buffer.from(await svgRes.arrayBuffer());
    }
    return null;
  } catch (e) {
    console.warn('[AudioVideo] Iconify lookup failed for keyword:', keyword, e.message);
    return null;
  }
}
