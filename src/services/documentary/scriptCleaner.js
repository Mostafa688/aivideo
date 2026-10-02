// ── scriptCleaner.js ── تنضيف السكريبت الملصوق (من ChatGPT/Claude/Docs) ليبقى نص التسجيل الصافي بس:
// بنشيل الأوقات (00:15 / [0:30-0:45]) والتقسيمات (Scene 1 / مشهد 2 / عناوين markdown) وتعليمات اللقطات
// والمؤثرات والموسيقى وأسماء المتحدثين. أول طبقة بالكود (مجانية وحتمية)، وبعدها Groq بيراجع لو
// السكريبت كان فيه علامات — مع حواجز: مفيش تلخيص ولا إعادة صياغة ولا إضافة كلام (لو الرد مش أمين، بنرجع لتنضيف الكود).
import { llmText } from './llm.js';

const DIRECTIVE_WORDS = '(?:music|sfx|sound|audio|pause|beat|visual|b-?roll|cut|fade|transition|on[- ]screen|screen|shot|camera|cue|v\\.?o\\.?|narrator|narration|animation|graphic|text|title|lower third|موسيقى|مؤثر|مؤثرات|صمت|توقف|لقطة|مشهد|انتقال|شاشة|الشاشة|رسوم|عنوان|صوت|الصوت)';
const TS = '\\d{1,2}:\\d{2}(?::\\d{2})?(?:[.,]\\d{1,3})?';
const TS_RANGE = `${TS}(?:\\s*(?:-|–|—|to|->|→)\\s*${TS})?`;

const RE = {
  mdFence: /^```.*$/gm,
  mdRule: /^\s*(?:-{3,}|\*{3,}|_{3,}|={3,})\s*$/gm,
  mdHeading: /^\s{0,3}#{1,6}\s+.*$/gm,
  bracketTs: new RegExp(`[\\[(【]\\s*${TS_RANGE}\\s*[\\])】]`, 'g'),
  bracketSec: /[\[(【]\s*~?\d+(?:\.\d+)?\s*(?:-|–|—|to)?\s*(?:\d+(?:\.\d+)?)?\s*(?:s|sec|secs|seconds|ثانية|ثواني|ث)\s*[\])】]/gi,
  words: /[\[(【]\s*~?\s*\d+\s*(?:words?|كلمة|كلمات)\s*[\])】]/gi,
  lineTs: new RegExp(`^[ \\t]*(?:[-*•]\\s*)?${TS_RANGE}\\s*(?:[:：\\-–—.)\\]]\\s*)?`, 'gm'),
  rangeTs: new RegExp(`${TS}\\s*(?:-|–|—|->|→)\\s*${TS}`, 'g'),
  sceneLine: /^[ \t]*[\[(【*_ ]*(?:scene|shot|part|section|segment|chapter|act|intro|outro|hook|scene\s*\d+|مشهد|المشهد|الفصل|الجزء|القسم|المقطع|اللقطة|المقدمة|الخاتمة)\s*(?:#|no\.?|number)?\s*\d*[\])】*_ ]*(?:[:：\-–—.][^\n]{0,90})?[ \t]*$/gim,
  directiveLine: new RegExp(`^[ \\t]*(?:[-*•]\\s*)?[\\[(*_ ]*(?:visuals?|video|audio|music|sfx|sound(?: effects?)?|b-?roll|shot|camera|screen|on[- ]screen(?: text)?|graphics?|animation|note|notes|editor|direction|cue|transition|footage|المرئيات|الفيديو|الصوت|الموسيقى|المؤثرات|لقطة|اللقطة|الكاميرا|الشاشة|على الشاشة|رسوم|ملاحظة|ملاحظات|مونتاج|انتقال)[\\])*_ ]*[:：\\-–—].*$`, 'gim'),
  speaker: /^[ \t]*(?:[-*•]\s*)?[*_]*(?:narrator|narration|voice[- ]?over|v\.?o\.?|host|speaker(?:\s*\d+)?|الراوي|المعلق|المذيع|صوت الراوي|المتحدث|التعليق الصوتي)[*_]*\s*(?:\([^)]*\))?\s*[:：\-–—]\s*/gim,
  bracketDirective: /\[[^\]\n]{1,200}\]/g,
  parenDirective: new RegExp(`\\(\\s*${DIRECTIVE_WORDS}(?![\\p{L}])[^)\\n]{0,160}\\)`, 'giu'),
  starDirective: new RegExp(`\\*\\s*${DIRECTIVE_WORDS}(?![\\p{L}])[^*\\n]{0,160}\\*`, 'giu'),
  mdBold: /(\*\*|__)(.+?)\1/g,
  mdItalic: /(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g,
  bullet: /^[ \t]*[-*•]\s+/gm,
};

// هل النص فيه علامات تستاهل المراجعة؟
export function looksDirty(text) {
  const t = String(text || '');
  const nog = (re) => new RegExp(re.source, re.flags.replace('g', ''));
  return [RE.lineTs, RE.bracketTs, RE.rangeTs, RE.bracketSec, RE.words, RE.mdHeading, RE.sceneLine, RE.directiveLine, RE.speaker, RE.bracketDirective, RE.mdBold].some(re => nog(re).test(t));
}

function resetRe() { for (const r of Object.values(RE)) r.lastIndex = 0; }

// تنضيف بالكود (حتمي): بيحافظ على الفقرات (سطر فاضي بين الفقرات)
export function basicClean(text) {
  resetRe();
  let t = String(text || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  t = t.replace(RE.mdFence, '').replace(RE.mdRule, '').replace(RE.mdHeading, '');
  t = t.replace(RE.bracketTs, ' ').replace(RE.bracketSec, ' ').replace(RE.words, ' ');
  t = t.replace(RE.lineTs, '').replace(RE.rangeTs, ' ');
  t = t.replace(RE.directiveLine, '').replace(RE.sceneLine, '');
  t = t.replace(RE.speaker, '');
  t = t.replace(RE.bracketDirective, ' ').replace(RE.parenDirective, ' ').replace(RE.starDirective, ' ');
  t = t.replace(RE.mdBold, '$2').replace(RE.mdItalic, '$1$2').replace(RE.bullet, '');
  t = t.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n').trim();
  return t;
}

const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const wordsOf = (s) => String(s).split(/\s+/).map(norm).filter(Boolean);

// أمانة رد الـLLM: كل كلمات الرد تقريبًا لازم تكون موجودة في الأصل (مفيش كلام جديد)، ومحافظ على أغلب الطول
export function isFaithful(source, output) {
  const src = wordsOf(source), out = wordsOf(output);
  if (!out.length) return false;
  if (out.length < src.length * 0.55 || out.length > src.length * 1.02) return false;
  const bag = new Map();
  for (const w of src) bag.set(w, (bag.get(w) || 0) + 1);
  let found = 0;
  for (const w of out) { const c = bag.get(w); if (c > 0) { found++; bag.set(w, c - 1); } }
  return found / out.length >= 0.96;
}

const SYSTEM = `You are a script editor preparing a pasted video script for a voice recording. The text may contain timestamps or time ranges, scene/section/chapter headings, markdown, shot/visual/camera/B-roll directions, music or sound-effect cues, speaker labels (Narrator:, الراوي:), word counts, and notes to the editor.
Output ONLY the words the narrator will say aloud, in the original language, as plain text.
Rules:
- Keep the original wording EXACTLY. Do not rewrite, summarize, translate, correct, shorten, reorder or add anything.
- Remove everything that is not spoken: timestamps, scene/section numbers and headings, markdown symbols, bracketed or parenthesized directions, sound/music/visual cues, speaker labels, word counts, notes.
- Keep paragraph breaks: one blank line between paragraphs/sections.
- If a heading is clearly part of the spoken text, keep it; otherwise remove it.
- No preface, no explanation, no quotes around the result.`;

function chunkParagraphs(text, max = 5500) {
  const paras = text.split(/\n{2,}/);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > max && cur) { chunks.push(cur); cur = p; } else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/**
 * @returns {{script:string, changed:boolean, usedAi:boolean, removedChars:number}}
 * force: يشغّل مراجعة Groq حتى لو الكود ما لقاش علامات
 */
export async function cleanScript(raw, { force = false, ask = llmText } = {}) {
  const original = String(raw || '');
  const dirty = looksDirty(original);
  const basic = basicClean(original);
  let script = basic, usedAi = false;
  if ((dirty || force) && basic.length >= 40) {
    try {
      const parts = [];
      for (const chunk of chunkParagraphs(basic)) {
        const out = await ask({ system: SYSTEM, user: chunk, maxTokens: 6000, temperature: 0.1 });
        const cleaned = String(out).replace(/^```[a-z]*\n?|```$/gim, '').trim();
        if (!isFaithful(chunk, cleaned)) throw new Error('unfaithful AI cleanup');
        parts.push(cleaned);
      }
      script = parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
      usedAi = true;
    } catch (e) {
      console.warn('[Documentary/cleaner] AI pass skipped:', e.message);
      script = basic;
    }
  }
  return { script, changed: script !== original.trim(), usedAi, removedChars: Math.max(0, original.length - script.length) };
}
