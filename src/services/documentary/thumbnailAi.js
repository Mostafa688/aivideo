// ── thumbnailAi.js ── صورة مصغرة بالذكاء الاصطناعي لفيلم وثائقي (Nano Banana 2.1) بعد "بحث وفهم":
//  1) بحث ويب مقصور على يوتيوب عن نفس الموضوع → صور مصغرة لفيديوهات حقيقية في المجال
//  2) بحث تاني عن مبادئ الـCTR وسياسات الصور المصغرة
//  3) موديل رؤية يقرا الصور المصغرة ويستخرج أنماط التصميم (ألوان، تكوين، نص، وجوه)
//  4) كاتب برومبت (LLM) بقواعد CTR + سياسات يوتيوب والأرباح → برومبت + نص الصورة (بلغة الفيلم، عربي عادي)
//  5) فحص أمان للبرومبت → توليد بـnano_banana_2_1 16:9
// كل خطوة خارجية قابلة للحقن (deps) عشان الاختبار بدون خدمات حقيقية.
import fetch from 'node-fetch';
import sharp from 'sharp';
import { llmJson } from './llm.js';
import { searchWeb, WEB_SEARCH_AVAILABLE } from '../webSearchService.js';
import { checkContentSafety } from '../scriptService.js';
import { generateNewModelImages } from '../newImageModelsService.js';

const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const YT_ID = /(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/i;
export const researchAvailable = () => WEB_SEARCH_AVAILABLE;

export const youtubeIdFromUrl = (url) => (String(url || '').match(YT_ID) || [])[1] || null;

/** نتائج بحث يوتيوب → [{id, title, thumbUrls[]}] (من غير تكرار) */
export function videosFromResults(results, max = 6) {
  const seen = new Set(), out = [];
  for (const r of results || []) {
    const id = youtubeIdFromUrl(r?.url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: String(r.title || '').replace(/\s*-\s*YouTube\s*$/i, '').slice(0, 120), thumbUrls: [`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${id}/mqdefault.jpg`] });
    if (out.length >= max) break;
  }
  return out;
}

async function fetchThumb(video, fetchImpl = fetch) {
  for (const u of video.thumbUrls) {
    try {
      const res = await fetchImpl(u);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const img = await sharp(buf, { failOn: 'none' }).resize(512, 288, { fit: 'cover' }).jpeg({ quality: 70 }).toBuffer();
      if (img.length < 2500) continue; // صورة placeholder فاضية
      return `data:image/jpeg;base64,${img.toString('base64')}`;
    } catch { /* جرّب الرابط اللي بعده */ }
  }
  return null;
}

const VISION_PROMPT = (titles) => `You are a YouTube thumbnail strategist. These are the thumbnails (in order) of real YouTube videos about a similar topic; their titles: ${titles.map((t, i) => `${i + 1}) ${t}`).join(' | ')}.
Study them and return ONLY JSON: {"patterns":["<=14 words each: recurring design choices that make them clickable (subject, framing, colours, contrast, text size/placement, emotion, curiosity device)"],"palette":"dominant colour combinations","textStyle":"how text is used (word count, size, colour, outline, language)","composition":"typical layout","subjects":"what is usually shown","avoid":["weak or risky things seen (clutter, tiny text, misleading fake UI, shock content)"]}. Describe what you actually see; do not invent.`;

async function visionAnalyze(images, titles) {
  const key = process.env.GROQ_API_KEY;
  if (!key || !images.length) return null;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL, max_tokens: 700, temperature: 0.2, response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [{ type: 'text', text: VISION_PROMPT(titles) }, ...images.slice(0, 5).map(u => ({ type: 'image_url', image_url: { url: u } }))] }],
    }),
  });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  const raw = String((await res.json()).choices?.[0]?.message?.content || '').trim();
  try { return JSON.parse(raw.replace(/^```(?:json)?|```$/g, '')); } catch { return { patterns: [raw.slice(0, 400)] }; }
}

// المبادئ الأساسية (بتتضاف دايمًا) — بنكمّلها بنتيجة بحث الإرشادات الحي
export const CTR_AND_POLICY_RULES = `CTR PRINCIPLES (what makes a documentary thumbnail get clicked):
- ONE clear focal subject that is readable at phone size (about 168x94 px): a face with a strong, genuine emotion, or one striking object/scene. No clutter, no collage of 5 things.
- High contrast and saturated but harmonious colours; the subject separated from the background (rim light, glow, blur); dramatic cinematic lighting.
- Big bold text of 2-4 words MAX (ideally 3), huge, thick, high-contrast with a dark outline/shadow, placed where YouTube's duration badge (bottom-right corner) will not cover it. The text must ADD curiosity or stakes, not repeat the whole title.
- A curiosity gap or a clear promise — but 100% honest: the thumbnail must truthfully represent what the video delivers.
- 16:9, simple composition (rule of thirds), a consistent look suitable for a documentary channel.
YOUTUBE POLICY & MONETISATION (the thumbnail must obey all of this):
- No nudity or sexual content; no graphic violence, gore, dead bodies, or shocking injury; no hate or harassment; nothing that promotes dangerous acts; no child-safety issues.
- Not misleading or deceptive: no fake claims, fake "BREAKING"/"LIVE"/"CENSORED" labels, fake play buttons, fake progress bars, fake view counts, fake UI, fake news-channel logos, or a scene that the video does not contain.
- No logos or trademarks of other companies, no copyrighted characters; no depiction of a real, identifiable living person; for historical figures show a stylised/period-appropriate depiction without claiming to be a photograph.
- Advertiser-friendly: avoid anything that would limit monetisation (graphic violence, tragedy exploitation, sensitive-event shock imagery).`;

const PROMPT_SYSTEM = `You are an expert YouTube thumbnail designer and prompt engineer for the image model Nano Banana. You design ONE thumbnail for a finished documentary. You are given: the documentary title and script excerpt, the language, an analysis of real thumbnails from the same niche (what already works), and live guidance notes.
Return ONLY JSON: {"concept":"1-2 sentences: the idea and why it should earn clicks","text":"the thumbnail text (2-4 words, written in the documentary's language, Arabic if the film is Arabic)","prompt":"the full English image prompt"}
The prompt must: describe a single focal subject in precise visual detail (age/era, clothing/material, pose, EXPRESSION), the setting and cinematic lighting, camera framing (medium or close shot, subject large), a colour palette with strong contrast, 16:9 composition that leaves the bottom-right corner uncluttered; and it MUST instruct the model to render the exact text in quotes — e.g. big bold thick sans-serif letters reading "TEXT" in <language>, white or yellow with a thick dark outline, high contrast, placed on the left/top third, perfectly spelled and fully legible. State that there is no other text, no logos, no watermarks, no play button and no UI elements. Follow the CTR and policy rules strictly; if the topic is violent or tragic, show tension or aftermath symbolically (silhouettes, ruins, dramatic sky, a worried face) — never gore. Everything shown must be truthful to the documentary's content.`;

/** التكلفة الفعلية للبحث بتتحسب هنا: كل بحث ناجح = وحدة بحث واحدة */
export async function researchThumbnails({ title, language = 'en' }, deps = {}) {
  const search = deps.searchWeb || searchWeb;
  const fetchImpl = deps.fetchImpl || fetch;
  const ar = String(language).startsWith('ar');
  const topic = String(title || '').slice(0, 120);
  let searchesDone = 0;
  const result = { examples: [], analysis: null, guidance: '', searchesDone: 0 };

  // 1) بحث أمثلة: فيديوهات يوتيوب عن نفس الموضوع
  try {
    const r = await search(`${topic} ${ar ? 'فيلم وثائقي' : 'documentary'}`, { maxResults: 10, includeDomains: ['youtube.com', 'youtu.be'], depth: 'basic' });
    searchesDone++;
    const videos = videosFromResults(r.results, 6);
    const imgs = [];
    for (const v of videos) { const d = await fetchThumb(v, fetchImpl); if (d) imgs.push({ title: v.title, data: d }); if (imgs.length >= 5) break; }
    result.examples = imgs.map(i => i.title);
    if (imgs.length) {
      try { result.analysis = await (deps.vision || visionAnalyze)(imgs.map(i => i.data), imgs.map(i => i.title)); }
      catch (e) { console.warn('[Documentary/aiThumb] vision failed:', e.message); }
    }
    if (!imgs.length || !result.analysis) searchesDone--; // مفيش أمثلة مفهومة فعلاً → البحث ده مش هيتحاسب
  } catch (e) { console.warn('[Documentary/aiThumb] example search failed:', e.message); }

  // 2) بحث إرشادات: CTR + سياسات الصور المصغرة (عام)
  try {
    const r = await search('YouTube thumbnail best practices click-through rate documentary thumbnail policy guidelines misleading thumbnails', { maxResults: 5, depth: 'basic' });
    const notes = [r.answer, ...(r.results || []).slice(0, 4).map(x => `${x.title}: ${x.content}`)].filter(Boolean).join('\n').slice(0, 2200);
    if (notes) { result.guidance = notes; searchesDone++; }
  } catch (e) { console.warn('[Documentary/aiThumb] guidance search failed:', e.message); }

  result.searchesDone = searchesDone;
  return result;
}

const clipWords = (s, max) => String(s || '').replace(/["“”<>]/g, '').replace(/\s+/g, ' ').trim().split(/\s+/).slice(0, max).join(' ');

export async function writeThumbnailPrompt({ title, script, language, research }, deps = {}) {
  const ask = deps.ask || llmJson;
  const langName = ({ ar: 'Arabic', en: 'English', es: 'Spanish', fr: 'French', de: 'German' })[String(language).split(/[-_]/)[0]] || 'the documentary language';
  const a = research?.analysis;
  const analysis = a ? `Patterns seen in real thumbnails of this niche: ${(a.patterns || []).join('; ')}. Palette: ${a.palette || '-'}. Text style: ${a.textStyle || '-'}. Composition: ${a.composition || '-'}. Subjects: ${a.subjects || '-'}. Avoid: ${(a.avoid || []).join('; ') || '-'}.` : 'No niche examples could be analysed — rely on the principles.';
  const user = `Documentary title: ${title}\nLanguage of the film and of the thumbnail text: ${langName}\nScript excerpt:\n${String(script || '').slice(0, 2500)}\n\nNICHE ANALYSIS (from real YouTube thumbnails about similar topics):\n${analysis}\nExample titles: ${(research?.examples || []).slice(0, 5).join(' | ') || '-'}\n\nLIVE GUIDANCE NOTES (web search):\n${research?.guidance || '-'}\n\n${CTR_AND_POLICY_RULES}`;
  const raw = await ask({ system: PROMPT_SYSTEM, user, maxTokens: 1200, temperature: 0.7 });
  const text = clipWords(raw.text, 5);
  const prompt = String(raw.prompt || '').trim().slice(0, 2400);
  if (!text || prompt.length < 60) throw new Error('thumbnail prompt was empty');
  // نضمن إن النص المطلوب مذكور حرفيًا في البرومبت بنفس اللغة (لو الكاتب نسي)
  const withText = prompt.includes(text) ? prompt : `${prompt}\nRender exactly this ${langName} text in big bold thick letters with a dark outline, perfectly spelled: "${text}".`;
  return { concept: String(raw.concept || '').slice(0, 300), text, prompt: withText };
}

/**
 * الخط الكامل. بيرجّع { url, text, concept, prompt, research:{examples,analysis,guidance,searchesDone} }.
 * @param {{title,script,language,research?:object}} o  research جاهز (من كاش) = بنتخطى البحث
 */
export async function createAiThumbnail({ title, script, language = 'en', research = null }, deps = {}) {
  const r = research || await researchThumbnails({ title, language }, deps);
  const w = await writeThumbnailPrompt({ title, script, language, research: r }, deps);
  const safety = await (deps.checkSafety || checkContentSafety)(`${w.text}\n${w.prompt}`.slice(0, 1500));
  if (safety.unsafe) { const e = new Error('thumbnail prompt rejected by safety check'); e.code = 'unsafe'; throw e; }
  const gen = deps.generate || generateNewModelImages;
  const urls = await gen({ modelKey: 'nano_banana_2_1', prompt: w.prompt, aspectRatio: '16:9', count: 1, tier: '1K' });
  const url = Array.isArray(urls) ? urls[0] : urls;
  if (!url) throw new Error('image generation returned nothing');
  return { url, text: w.text, concept: w.concept, prompt: w.prompt, research: { examples: r.examples || [], analysis: r.analysis || null, guidance: r.guidance ? String(r.guidance).slice(0, 600) : '', searchesDone: r.searchesDone || 0 } };
}
