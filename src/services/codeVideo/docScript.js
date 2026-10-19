// ── docScript.js ── من PDF/مستند لسكريبت شرح: بنقسم المستند لأجزاء، نعمل خطة (عنوان + فصول)، وبعدين نكتب سرد كل جزء
// على قد الوقت المخصص له — من المحتوى المكتوب بس (من غير اختراع معلومات أو أرقام)، بلغة المستند، بأسلوب درس شيّق:
// افتتاحية جذابة، شرح واضح بأمثلة من المستند، وملخص في الآخر. الفيديو بعدها بيتعمل بالمخرج العادي (موشن/فوكس، خرايط، صور...).
import { llmText, llmJson } from '../documentary/llm.js';
import { detectLang } from './narration.js';

export const DOC_TEXT_MAX_CHARS = 150000;
const WPS = { ar: 2.0, en: 2.5 };
const wps = (lang) => WPS[String(lang).split(/[-_]/)[0]] || 2.3;
const LANG_NAME = (l) => (String(l).startsWith('ar') ? 'Modern Standard Arabic that is simple, warm and spoken-friendly (فصحى مبسطة)' : l === 'en' ? 'English' : l);
// لهجات سكريبت الفويس أوفر اللي العميل بيسجّله بنفسه (أو بأداة صوت زي ElevenLabs / Google AI Studio)
export const SCRIPT_DIALECTS = {
  msa: { lang: 'ar', name: 'Modern Standard Arabic that is simple, warm and spoken-friendly (فصحى مبسطة)' },
  egyptian: { lang: 'ar', name: 'Egyptian Arabic (العامية المصرية) as people really speak in Cairo — natural, friendly, like a popular Egyptian YouTube explainer; keep names and technical terms correct' },
  saudi: { lang: 'ar', name: 'Saudi Arabic (اللهجة السعودية/النجدية-الحجازية البيضاء) — natural and clear for all Saudis' },
  gulf: { lang: 'ar', name: 'Gulf Arabic (اللهجة الخليجية البيضاء: كويتي/إماراتي/قطري مفهوم للكل)' },
  levantine: { lang: 'ar', name: 'Levantine Arabic (اللهجة الشامية: سوري/لبناني/فلسطيني/أردني بيضاء)' },
  maghrebi: { lang: 'ar', name: 'Moroccan/Maghrebi Arabic (الدارجة المغاربية) written so a Moroccan or Algerian viewer finds it natural' },
  iraqi: { lang: 'ar', name: 'Iraqi Arabic (اللهجة العراقية)' },
  en: { lang: 'en', name: 'English (translate the content faithfully if the document is in another language)' },
};

/** تقسيم المستند لأجزاء متماسكة (على العناوين/الفقرات) بحجم تقريبي */
export function splitDocument(text, target = 5000) {
  const paras = String(text || '').replace(/\r/g, '').split(/\n{2,}|\n(?=\s*(?:#|\d+[.)]\s|[IVX]+\.\s|الفصل|الباب|المبحث|أولا|ثانيا|ثالثا|Chapter|Section|Unit|Lesson))/i).map(p => p.trim()).filter(Boolean);
  const chunks = []; let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > target && cur) { chunks.push(cur); cur = ''; }
    if (p.length > target * 1.6) { for (let i = 0; i < p.length; i += target) chunks.push(p.slice(i, i + target)); continue; }
    cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** مدة مقترحة للفيديو حسب حجم المستند (ممكن العميل يغيّرها) */
export function suggestSeconds(text, maxSeconds, lang = null) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  const L = lang || detectLang(text, 'en') || 'en';
  const narrationWords = Math.min(words, Math.max(120, words * 0.45)); // الشرح أقصر من المستند الأصلي
  return Math.round(Math.max(45, Math.min(maxSeconds - 6, narrationWords / wps(L))));
}

/**
 * @returns {Promise<{ script: string, title: string, language: string, outline: string[] }>}
 */
export async function writeDocumentScript({ text, seconds = 180, language = null, brief = '', dialect = null, forVoice = false, onProgress = () => {} }, deps = {}) {
  const src = String(text || '').slice(0, DOC_TEXT_MAX_CHARS);
  const D = SCRIPT_DIALECTS[dialect] || null;
  const lang = D ? D.lang : (language || detectLang(src, 'en') || 'en');
  const LANG_NAME = (l) => (D ? D.name : (String(l).startsWith('ar') ? 'Modern Standard Arabic that is simple, warm and spoken-friendly (فصحى مبسطة)' : l === 'en' ? 'English' : l));
  const voiceRule = forVoice ? ' This text will be READ ALOUD by a person or a text-to-speech tool: write every number, year, percentage and unit as words exactly as they are spoken in this dialect (e.g. 1869 → ألف وتمانمية تسعة وستين in Egyptian), no symbols, no abbreviations, no parentheses.' : '';
  const chunks = splitDocument(src, seconds > 600 ? 7000 : 5000);
  const totalWords = Math.round(seconds * wps(lang));
  const ask = deps.llmJson || llmJson, write = deps.llmText || llmText;

  // 1) خطة: عنوان + نقط كل جزء + أهميته (عشان الوقت يتوزّع على المهم مش على طول الجزء بس)
  let plan = null;
  try {
    plan = await ask({
      system: `You plan an educational explainer video made from a customer's document. Return ONLY JSON: {"title":"a short catchy video title in ${LANG_NAME(lang)}","parts":[{"i":0,"heading":"short heading in ${LANG_NAME(lang)}","weight":1-5 (how important/explanation-worthy this part is; 0 = skip: references, indexes, copyright, tables of contents, page numbers, repeated headers),"goal":"what the viewer must UNDERSTAND after this part (the idea, the cause/effect or the how/why — not just the facts), one short sentence","terms":["key terms/concepts in this part that a student must have explained"]}]}. One entry per part, same order. Think like a teacher planning a lesson: the goal is understanding, not a list of facts.`,
      user: `${brief ? `Customer direction: ${brief}\n` : ''}Parts of the document (first 900 characters of each):\n${chunks.map((c, i) => `[${i}] ${c.slice(0, 900).replace(/\s+/g, ' ')}`).join('\n')}`,
      maxTokens: 3000, temperature: 0.2,
    });
  } catch { plan = null; }
  const parts = chunks.map((c, i) => {
    const p = (plan?.parts || []).find(x => Number(x?.i) === i) || {};
    const wgt = Number.isFinite(Number(p.weight)) ? Math.max(0, Math.min(5, Number(p.weight))) : 3;
    return { i, text: c, heading: String(p.heading || '').slice(0, 80), goal: String(p.goal || '').slice(0, 240), terms: (Array.isArray(p.terms) ? p.terms : []).map(x => String(x).slice(0, 60)).slice(0, 6), weight: wgt * Math.sqrt(Math.max(200, c.length) / 1000) };
  }).filter(p => p.weight > 0);
  const use = parts.length ? parts : chunks.map((c, i) => ({ i, text: c, heading: '', weight: 1 }));
  const wsum = use.reduce((a, p) => a + p.weight, 0) || 1;
  const title = String(plan?.title || '').slice(0, 90) || (use[0]?.heading || '');
  await onProgress(0.1);

  // 2) سرد كل جزء على قد نصيبه من الوقت، بالتسلسل (كل جزء عارف آخر جملة قبله عشان الربط يبقى طبيعي)
  const out = []; let prevTail = '';
  for (let k = 0; k < use.length; k++) {
    const p = use[k], first = k === 0, last = k === use.length - 1;
    const words = Math.max(40, Math.round((totalWords * p.weight) / wsum));
    const piece = await write({
      system: `You write the VOICE-OVER for one part of an educational explainer video made from a document, in ${LANG_NAME(lang)}. About ${words} words (never more than ${Math.round(words * 1.12)}). THIS IS A LESSON, NOT A NEWS READ-OUT OR A SUMMARY: the viewer must come out UNDERSTANDING the ideas, like after a class with an excellent, friendly teacher. How to teach:
- Explain, don't list: for every important fact say WHY it matters, HOW it works or WHAT it led to (cause → effect), using only reasons and links that the document gives or that follow directly from it.
- Define every key term the first time it appears, in plain words (e.g. "what does 'nationalisation' mean? it means the state took ownership of…").
- Use a simple everyday comparison or picture to make an abstract idea or a big number feel real (e.g. "193 km — roughly the distance between two nearby cities"); comparisons are illustrations, never new facts, and must not change any fact.
- Ask the viewer short questions and answer them ("why was this so important? because…"), and speak to them directly ("notice that…", "imagine…").
- Build step by step from simple to detailed; one idea per sentence; signpost ("first…", "the second reason…", "so what happened next?").
- After a dense idea, restate it in one simple sentence ("in short: …").
- Never invent facts, names, numbers, dates or events that are not in the document; keep its real numbers, names, places and terms (they become on-screen charts, maps and photos).
${first ? '- Open the whole lesson with a strong hook (a surprising fact or a question from the document), then say in one sentence what the viewer will understand by the end.' : '- Continue naturally from the previous part (do not greet or re-introduce the video); link the new idea to what was just explained.'}
${last ? '- Close the whole lesson with a short recap of the 3 most important ideas in simple words, and one sentence on why they matter.' : '- Do not summarise the whole lesson yet.'} No headings, no bullet points, no stage directions, no emojis — only the spoken words, in short paragraphs.${voiceRule}`,
      user: `${title ? `Video title: ${title}\n` : ''}${p.heading ? `This part: ${p.heading}\n` : ''}${p.goal ? `Teaching goal of this part: ${p.goal}\n` : ''}${p.terms?.length ? `Terms to explain: ${p.terms.join(', ')}\n` : ''}${prevTail ? `The previous part ended with: "${prevTail}"\n` : ''}${brief ? `Customer direction: ${brief}\n` : ''}Document part:\n${p.text}`,
      maxTokens: Math.max(700, words * 5), temperature: 0.45,
    });
    const clean = String(piece || '').replace(/\*\*|^#+\s*|^\s*[-•*]\s+/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    if (clean) { out.push(clean); prevTail = clean.split(/(?<=[.!?؟])\s+/).slice(-1)[0]?.slice(0, 200) || ''; }
    await onProgress(0.1 + 0.9 * ((k + 1) / use.length));
  }
  const script = out.join('\n\n');
  if (script.trim().split(/\s+/).length < 25) throw Object.assign(new Error('document_script_empty'), { code: 'document_script_empty' });
  return { script, title, language: lang, outline: use.map(p => p.heading).filter(Boolean) };
}
