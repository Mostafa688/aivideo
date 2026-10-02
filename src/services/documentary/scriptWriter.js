// ── scriptWriter.js ── "اعمله بالذكاء الاصطناعي": موضوع → سكريبت سرد موثّق ببحث ويب حقيقي (Tavily) ثم كتابة على أقسام
import { llmJson, llmText } from './llm.js';
import { searchWeb, WEB_SEARCH_AVAILABLE } from '../webSearchService.js';

export const WORDS_PER_MIN = { en: 150, ar: 125, default: 140 };
export const MAX_SCRIPT_CHARS = 23000;

const wordsFor = (minutes, language) => Math.round(minutes * (WORDS_PER_MIN[String(language).split(/[-_]/)[0]] || WORDS_PER_MIN.default));

async function gatherResearch(topic, deps) {
  const search = deps.searchWeb || searchWeb;
  if (!deps.searchWeb && !WEB_SEARCH_AVAILABLE) return { notes: '', sources: [] };
  const queries = [topic, `${topic} key facts timeline`, `${topic} history background`];
  const sources = [], chunks = [];
  for (const q of queries) {
    try {
      const r = await search(q, { maxResults: 5 });
      if (r.answer) chunks.push(r.answer);
      for (const x of r.results || []) { chunks.push(`${x.title}: ${x.content}`); sources.push({ title: x.title, url: x.url }); }
    } catch (e) { console.warn('[Documentary/script] research failed:', e.message); }
  }
  return { notes: chunks.join('\n').slice(0, 9000), sources: sources.filter((s, i, a) => a.findIndex(y => y.url === s.url) === i).slice(0, 12) };
}

/**
 * @returns {{title, script, sources}}
 */
export async function writeScript({ topic, minutes = 5, language = 'en', angle = '' }, deps = {}) {
  const ask = deps.llmJson || llmJson;
  const write = deps.llmText || llmText;
  minutes = Math.min(30, Math.max(1, minutes));
  const total = wordsFor(minutes, language);
  const { notes, sources } = await gatherResearch(topic, deps);
  const langName = String(language).startsWith('ar') ? 'Arabic' : (language === 'en' ? 'English' : language);
  const nSections = Math.min(14, Math.max(2, Math.ceil(minutes / 1.6)));

  const outline = await ask({
    system: `You are a documentary researcher. Build an outline for a ${minutes}-minute documentary narration about the topic. Use ONLY facts present in the research notes (or universally well-established facts). Return ONLY JSON: {"title":"...","sections":[{"heading":"...","facts":["concrete fact with numbers/dates/names","..."]}]} with exactly ${nSections} sections in a compelling story order (hook, context, development, climax, aftermath/legacy). Facts must be specific and verifiable. The title and headings must be in ${langName}.`,
    user: `Topic: ${topic}\n${angle ? `Angle: ${angle}\n` : ''}Research notes:\n${notes || '(none available — rely only on well-established facts)'}`,
    maxTokens: 4000,
  });
  const sections = (outline.sections || []).slice(0, nSections);
  if (!sections.length) throw new Error('could not outline the script');
  const perSection = Math.round(total / sections.length);

  const texts = new Array(sections.length);
  const CONC = 3;
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONC, sections.length) }, async () => {
    while (next < sections.length) {
      const i = next++;
      const s = sections[i];
      texts[i] = await write({
        system: `You write narration for a documentary, in ${langName}. Write ONLY the spoken narration for one section: vivid, clear, engaging, authoritative; short-to-medium sentences; no headings, no stage directions, no bullet points, no emojis, no markdown. Write numbers as digits (e.g. 1969, 400,000). Use ONLY the facts provided for this section — never invent names, dates or numbers. About ${perSection} words.${i === 0 ? ' Start with a strong hook.' : ' Continue naturally from the previous section.'}${i === sections.length - 1 ? ' End with a memorable closing line.' : ''}`,
        user: `Documentary: ${outline.title || topic}\nSection ${i + 1}/${sections.length}: ${s.heading}\nFacts:\n- ${(s.facts || []).join('\n- ')}`,
        maxTokens: Math.max(600, perSection * 4), temperature: 0.6,
      });
    }
  }));
  let script = texts.map(t => String(t || '').replace(/\*\*|^#+\s*/gm, '').trim()).filter(Boolean).join('\n\n');
  if (script.length > MAX_SCRIPT_CHARS) script = script.slice(0, MAX_SCRIPT_CHARS).replace(/[^.!?؟]*$/, '').trim();
  return { title: String(outline.title || topic).slice(0, 120), script, sources };
}
