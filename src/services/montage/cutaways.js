// ── cutaways.js ── تخطيط مشاهد الموشن اللي بتتحط مكان لقطات من الفيديو الأصلي (والصوت الأصلي بيكمّل من غير قطع):
// الـLLM بيختار لحظات في الكلام (مفهوم/قايمة/رقم/مقارنة) ويصمّم المشهد، والكود بيتحقق من كل حاجة (توقيت على حدود الكلمات، تأريض النص
// في اللي اتقال فعلًا، تباعد، حد أقصى). لو الـLLM فشل → خطة احتياطية من الكلام نفسه.
import { llmJson } from '../documentary/llm.js';
import { sanitizeScene, SCENE_TYPES } from './motionScenes.js';

const fmt = (n) => Number(n).toFixed(1);
export const CUT_MIN = 1.8, CUT_MAX = 5.2;

const SYSTEM = `You are a top motion designer and editor for YouTube / Reels. A person speaks in a video. You choose moments where the footage is REPLACED for a few seconds by a full-screen animated motion-graphics scene (3D shapes, big animated text, bars, cards — all made in code) that visualizes exactly what is being said, while the original voice continues without any cut. Then the footage comes back.
You receive the transcript of each clip as timed sentences. Return ONLY JSON: {"cutaways":[{"clip":"V1","start":5.2,"end":8.4,"scene":{"type":"headline|keywords|list|stat|compare","data":{...}}}]}.
Scene types and data (ALL text must be copied or condensed from the words actually spoken in that window, in the speaker's language — never invent facts or numbers):
- headline {text: 2-6 strongest words of the sentence, sub?: a short supporting phrase} — a key claim, a punchline, a definition.
- keywords {title?: short title, items: 3-5 single words/short phrases that were said} — a concept explained through several ideas (shown orbiting a 3D cube).
- list {title?, items: 2-4 short items that were said} — steps, tips, an enumeration.
- stat {value: a number that was said (digits), prefix?, suffix?: "%" etc., label: what the number is} — a striking number or percentage (shown with 3D bars).
- compare {left, right} — two things contrasted in the sentence.
Rules: each cutaway is 2-5 seconds; "start" = the start of a sentence/clause, "end" = the end of a word; they never touch the first 2 seconds or the last 1.5 seconds of a clip; at least 6 seconds of real footage between two cutaways; choose the moments that gain the most from a visual (not filler sentences); vary the types; at most the number you are told.`;

const wordsIn = (c, a, b) => (c.words || []).filter(w => w.end > a && w.start < b);

/** تنضيف قائمة cutaways: كل رقم بيتحقق، والتوقيت بيتثبّت على حدود الكلمات، والمشهد لازم يكون مؤرَّض في الكلام */
export function sanitizeCutaways(raw, clips, { max = 8, gap = 6 } = {}) {
  const byLabel = new Map(clips.map((c, i) => [`V${i + 1}`, i]));
  const out = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    const ci = byLabel.get(String(r?.clip || '').toUpperCase());
    if (ci === undefined) continue;
    const c = clips[ci];
    if (!c.hasSpeech || !(c.words || []).length) continue;
    let start = Number(r.start), end = Number(r.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    // تثبيت على حدود الكلمات (بداية كلمة / نهاية كلمة) في حدود 0.7 ثانية
    const ws = c.words;
    const nearStart = ws.reduce((b, w) => (Math.abs(w.start - start) < Math.abs(b.start - start) ? w : b), ws[0]);
    const nearEnd = ws.reduce((b, w) => (Math.abs(w.end - end) < Math.abs(b.end - end) ? w : b), ws[0]);
    if (Math.abs(nearStart.start - start) <= 0.7) start = nearStart.start;
    if (Math.abs(nearEnd.end - end) <= 0.7) end = nearEnd.end;
    if (end - start < CUT_MIN) end = start + CUT_MIN;
    if (end - start > CUT_MAX) end = start + CUT_MAX;
    if (start < 2 || end > c.duration - 1.5) continue;
    const spoken = wordsIn(c, start - 0.8, end + 0.8).map(w => w.w).join(' ');
    const scene = sanitizeScene(r.scene, spoken);
    if (!scene) continue;
    out.push({ clipIndex: ci, start: Number(start.toFixed(2)), end: Number(end.toFixed(2)), scene });
  }
  out.sort((a, b) => a.clipIndex - b.clipIndex || a.start - b.start);
  const kept = [];
  for (const k of out) {
    const prev = kept.filter(x => x.clipIndex === k.clipIndex).pop();
    if (prev && k.start - prev.end < gap) continue;
    kept.push(k);
    if (kept.length >= max) break;
  }
  return kept;
}

/** كام مشهد مناسب: حسب مدة الكلام الفعلي (مشهد كل ~12 ثانية، أو كل ~8 في وضع الجرافيكس الكتير) */
export function cutawayBudget(clips, { dense = false } = {}) {
  const speech = clips.reduce((a, c) => a + (c.hasSpeech ? c.duration : 0), 0);
  if (speech < 7) return 0;
  return Math.max(1, Math.min(8, Math.floor(speech / (dense ? 8 : 12))));
}

// ── خطة احتياطية من الكلام نفسه (من غير LLM) ──
const NUM_RE = /(\d[\d,.]*)\s*(%|percent|بالمئة|في المئة|بالمائة|k|m|million|مليون|ألف|الف)?/i;
function clauseOf(sen) {
  const clauses = []; let cur = [];
  for (const w of sen.words) { cur.push(w); if (/[.,;:!?،؛؟…]$/.test(w.w)) { clauses.push(cur); cur = []; } }
  if (cur.length) clauses.push(cur);
  const best = clauses.filter(x => x.length >= 2 && x.length <= 6).sort((a, b) => b.reduce((s, w) => s + w.w.length, 0) - a.reduce((s, w) => s + w.w.length, 0))[0] || sen.words.slice(0, Math.min(5, sen.words.length));
  return best.map(w => w.w.replace(/[.,;:!?،؛؟…]+$/, '')).join(' ');
}
export function fallbackCutaways(clips, { dense = false } = {}) {
  const budget = cutawayBudget(clips, { dense });
  const gap = dense ? 6 : 9;
  const out = [];
  clips.forEach((c, ci) => {
    if (!c.hasSpeech || !c.sentences?.length) return;
    let last = -99, k = 0;
    for (const sen of c.sentences) {
      if (out.length >= budget) break;
      if (sen.start < 2.2 || sen.end > c.duration - 1.6 || sen.start - last < gap) continue;
      const text = sen.words.map(w => w.w).join(' ');
      const start = sen.words[0].start, end = Math.min(sen.words[sen.words.length - 1].end, start + 4.4);
      let scene = null;
      const m = NUM_RE.exec(text);
      if (m && Number.isFinite(parseFloat(m[1].replace(/,/g, ''))) && !/^(1[89]|20)\d\d$/.test(m[1])) {
        const suf = m[2] && /%|percent|المئة|المائة/i.test(m[2]) ? '%' : undefined;
        scene = { type: 'stat', data: { value: parseFloat(m[1].replace(/,/g, '')), suffix: suf, label: text.replace(m[0], '').replace(/\s+/g, ' ').trim().split(/\s+/).slice(0, 8).join(' ') } };
      } else {
        const items = text.split(/\s*(?:,|،|;|\band\b|\bthen\b|و(?=\S))\s*/i).map(x => x.trim()).filter(x => x.split(/\s+/).length <= 5 && x.length > 2);
        if (items.length >= 3) scene = { type: 'list', data: { items: items.slice(0, 4) } };
        else scene = { type: k % 2 ? 'keywords' : 'headline', data: null };
        if (scene.type === 'headline') scene.data = { text: clauseOf(sen).split(/\s+/).slice(0, 6).join(' ') };
        else if (scene.type === 'keywords') {
          const kw = [...new Set(sen.words.map(w => w.w.replace(/[^\p{L}\p{N}]/gu, '')).filter(w => w.length >= 5))].slice(0, 5);
          scene = kw.length >= 3 ? { type: 'keywords', data: { items: kw } } : { type: 'headline', data: { text: clauseOf(sen).split(/\s+/).slice(0, 6).join(' ') } };
        }
      }
      const ok = sanitizeCutaways([{ clip: `V${ci + 1}`, start, end, scene }], clips, { max: 1 })[0];
      if (ok) { out.push(ok); last = ok.end; k++; }
    }
  });
  return out.slice(0, budget);
}

/** الخطة الكاملة: LLM أولًا (بعد التحقق)، ولو مرجّعش حاجة صالحة → الاحتياطي */
export async function planCutaways({ clips, instructions = '', style = null, dense = false, ask = llmJson }) {
  const budget = cutawayBudget(clips, { dense });
  if (!budget) return [];
  const cl = clips.map((c, i) => {
    if (!c.hasSpeech || !c.sentences?.length) return `V${i + 1} "${c.name}" — ${fmt(c.duration)}s — no speech`;
    return `V${i + 1} "${c.name}" — ${fmt(c.duration)}s — transcript:\n` + c.sentences.slice(0, 120).map(s => `  [${fmt(s.start)}-${fmt(s.end)}] ${s.words.map(w => w.w).join(' ').slice(0, 170)}`).join('\n');
  }).join('\n\n');
  const ref = style?.description ? `\nSTYLE REFERENCE the customer wants the graphics to feel like: ${style.description}` : '';
  const user = `Customer's wishes: ${instructions.trim() ? `"${instructions.trim().slice(0, 500)}"` : '(none)'}${ref}\nChoose up to ${budget} cutaways in total.\n\n${cl}`;
  try {
    const raw = await ask({ system: SYSTEM, user, maxTokens: 3000, temperature: 0.4 });
    const ok = sanitizeCutaways(raw?.cutaways, clips, { max: budget, gap: dense ? 5 : 6 });
    if (ok.length) return ok;
  } catch (e) { console.warn('[Cutaways] planner failed, using the fallback:', e.message); }
  return fallbackCutaways(clips, { dense });
}

export { SCENE_TYPES };
