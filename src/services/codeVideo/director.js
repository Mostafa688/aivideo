// ── director.js ── المخرج: بيقسّم الكلام لمشاهد (بالكود، على حدود الجمل وتوقيت الكلمات) وبيسأل الـLLM يختار لكل مشهد
// نوع التصوير المناسب (نص متحرك/رقم/رسم بياني/قايمة/مقارنة...) من JSON محدّد. أي مشهد يطلع غلط/مش مبني على الكلام الفعلي
// بيرجع تلقائي لنص متحرك. الأرقام لازم تكون اتقالت في الكلام (مفيش اختراع إحصائيات).
import { llmJson } from '../documentary/llm.js';
import { PALETTE_NAMES, MOTION_PALETTES, TOON_PALETTES, VOX_PALETTES, ICON_NAMES, resolveIcon } from './design.js';
import { BACKDROPS } from './fx.js';
import { CARTOON_BACKDROPS, VOX_BACKDROPS } from './fxLooks.js';
import { SCENE_TYPES } from './scenes.js';
import { CAST, CAST_IDS, EMOTIONS, POSES } from './characters.js';

// أنماط الفيديو: motion = موشن جرافيك/إنفوجرافيك | vox = فيديو شرح بصور أرشيفية (على طريقة Vox) | cartoon = شخصيات كارتون 2D | cartoon3d = شخصيات كارتون 3D
export const LOOKS = ['motion', 'vox', 'cartoon', 'cartoon3d'];
export const isCartoon = (look) => look === 'cartoon' || look === 'cartoon3d';
const CARTOON_TYPES = ['char_say', 'char_prop', 'char_duo'];
const VOX_TYPES = ['photo', 'fullphoto', 'collage', 'headline'];
const BASE_TYPES = SCENE_TYPES.filter(t => !CARTOON_TYPES.includes(t) && !VOX_TYPES.includes(t));
export const allowedTypes = (look) => new Set([...BASE_TYPES, ...(isCartoon(look) ? CARTOON_TYPES : look === 'vox' ? VOX_TYPES : [])]);
export const LOOK_PALETTES = { motion: MOTION_PALETTES, vox: VOX_PALETTES, cartoon: TOON_PALETTES, cartoon3d: TOON_PALETTES };
const FEMALE_CAST = new Set(['lina', 'noor', 'maya']), MALE_CAST = new Set(['sam', 'omar', 'prof']);
export function defaultHost(voiceGender = 'unknown') { return voiceGender === 'female' ? 'lina' : voiceGender === 'male' ? 'sam' : 'robo'; }

export const MOODS = ['epic', 'tech', 'business', 'nature', 'energetic', 'serious', 'clean', 'minimal'];
export const CAMS = ['push', 'pull', 'left', 'right', 'up', 'drift'];
export const TRANSITIONS = ['cut', 'slide', 'slideup', 'zoom', 'wipe', 'iris', 'flash', 'glitch'];
const TR_DUR = { cut: 0, slide: 0.55, slideup: 0.55, zoom: 0.6, wipe: 0.6, iris: 0.65, flash: 0.5, glitch: 0.5 };
const CALM_BG = ['aurora', 'bokeh', 'stripes', 'particles'];
const DATA_TYPES = new Set(['stat', 'bars', 'donut', 'line', 'list', 'compare', 'timeline', 'icons', 'steps', 'gridstats', 'network', 'globe']);

// ── تطبيع نص (عربي/إنجليزي) للمطابقة ──
const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const stripAl = (w) => (w.length > 4 && w.startsWith('ال') ? w.slice(2) : w);
const toks = (s) => norm(s).split(' ').filter(w => w.length > 1).map(stripAl);
const stemHit = (a, said) => said.has(a) || [...said].some(b => Math.min(a.length, b.length) >= 3 && (b.startsWith(a.slice(0, 3)) && a.startsWith(b.slice(0, 3))) && (Math.min(a.length, b.length) >= 4 ? b.startsWith(a.slice(0, 4)) || a.startsWith(b.slice(0, 4)) : a === b));
const grounded = (text, said, ratio = 0.5) => { const t = toks(text); if (!t.length) return false; return t.filter(x => stemHit(x, said)).length / t.length >= ratio; };
const clean = (s, max) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

// ── أرقام منطوقة: أرقام عادية + كلمات أرقام شائعة (إنجليزي/عربي) ──
const AR_DIG = { '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
const WORD_NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, million: 1e6, billion: 1e9,
  صفر: 0, واحد: 1, واحده: 1, اثنين: 2, اتنين: 2, اثنان: 2, ثلاثه: 3, تلاته: 3, ثلاث: 3, تلات: 3, اربعه: 4, اربع: 4, خمسه: 5, خمس: 5, سته: 6, ست: 6, سبعه: 7, سبع: 7, ثمانيه: 8, تمانيه: 8, ثمان: 8, تسعه: 9, تسع: 9, عشره: 10, عشر: 10, عشرين: 20, عشرون: 20, ثلاثين: 30, تلاتين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, ثمانين: 80, تمانين: 80, تسعين: 90, مائه: 100, ميه: 100, مئه: 100, الف: 1000, مليون: 1e6, مليار: 1e9 };
export function spokenNumbers(text) {
  const out = new Set();
  const t = String(text || '').replace(/[٠-٩]/g, d => String(AR_DIG[d])).replace(/(\d)[,٬](\d{3})/g, '$1$2');
  for (const m of t.matchAll(/\d+(?:[.,٫]\d+)?/g)) out.add(Number(m[0].replace(/[,٫]/, '.')));
  const words = norm(t).split(' ').map(stripAl);
  words.forEach((w, i) => { if (WORD_NUM[w] != null) { out.add(WORD_NUM[w]); const nx = WORD_NUM[words[i + 1]]; if (nx && nx >= 100) out.add(WORD_NUM[w] * nx); } });
  return out;
}
const numberSaid = (value, said) => { for (const n of said) if (Math.abs(n - value) <= Math.max(1e-9, Math.abs(value) * 1e-6)) return true; return false; };

// ── تقسيم الكلام لمشاهد ──
const SENT_END = /[.!?؟…。]["'”)»]*$/;
export function segmentScenes(tokens, total, { minLen = 3.0, maxLen = 8.5, softMax = 6.5, maxScenes = 36 } = {}) {
  if (!tokens.length) return [];
  // 1) جمل
  const sents = []; let cur = [];
  tokens.forEach((tk, i) => {
    cur.push(tk);
    const nx = tokens[i + 1], gap = nx ? nx.start - tk.end : 9;
    if (SENT_END.test(tk.w) || tk.paraEnd || tk.sentenceEnd || gap > 0.7 || !nx) { sents.push(cur); cur = []; }
  });
  // 2) جملة طويلة (> maxLen) تتقسم عند فاصلة/منتصف
  const pieces = [];
  for (const sn of sents) {
    const dur = sn[sn.length - 1].end - sn[0].start;
    if (dur <= maxLen) { pieces.push(sn); continue; }
    const parts = Math.ceil(dur / (maxLen * 0.85)); const target = dur / parts; let start = 0;
    for (let p = 1; p <= parts; p++) {
      let cut = sn.length;
      if (p < parts) {
        const goal = sn[0].start + target * p; let best = -1, bd = 1e9;
        sn.forEach((tk, i) => { if (i <= start || i >= sn.length - 1) return; const d = Math.abs(tk.end - goal) - (/[,،;:؛]$/.test(tk.w) ? 0.8 : 0); if (d < bd) { bd = d; best = i + 1; } });
        cut = best > start ? best : Math.max(start + 1, Math.round(sn.length * p / parts));
      }
      pieces.push(sn.slice(start, cut)); start = cut;
    }
  }
  // 3) دمج الجمل القصيرة لحد minLen
  const groups = []; let g = [];
  const gdur = (x) => (x.length ? x[x.length - 1].end - x[0].start : 0);
  for (const pc of pieces) {
    if (g.length && (gdur(g) >= minLen || (gdur(g) >= 2.0 && gdur([...g, ...pc]) > softMax))) { groups.push(g); g = []; }
    if (g.length && gdur([...g, ...pc]) > maxLen) { groups.push(g); g = []; }
    g = [...g, ...pc];
  }
  if (g.length) { if (groups.length && gdur(g) < minLen * 0.6 && gdur([...groups[groups.length - 1], ...g]) <= maxLen + 2.5) groups[groups.length - 1] = [...groups[groups.length - 1], ...g]; else groups.push(g); }
  // لو زودنا عن الحد: ندمج أقصر الجيران
  while (groups.length > maxScenes) { let bi = 0, bd = 1e9; for (let i = 0; i < groups.length - 1; i++) { const d = gdur([...groups[i], ...groups[i + 1]]); if (d < bd) { bd = d; bi = i; } } groups.splice(bi, 2, [...groups[bi], ...groups[bi + 1]]); }
  // 4) مشاهد متصلة زمنيًا
  const scenes = groups.map((tk, i) => ({ tokens: tk, text: tk.map(x => x.w).join(' '), start: 0, end: 0 }));
  scenes.forEach((sc, i) => { sc.start = i === 0 ? 0 : scenes[i - 1].end; sc.end = i === scenes.length - 1 ? total : (sc.tokens[sc.tokens.length - 1].end + scenes[i + 1].tokens[0].start) / 2; if (sc.end - sc.start < 1.2) sc.end = sc.start + 1.2; });
  for (let i = 1; i < scenes.length; i++) scenes[i].start = scenes[i - 1].end;
  scenes[scenes.length - 1].end = Math.max(total, scenes[scenes.length - 1].end);
  return scenes;
}

// ── تنضيف بيانات مشهد (نوع + بيانات + تأريض في الكلام) ──
const strs = (arr, n, len) => (Array.isArray(arr) ? arr : []).map(x => clean(typeof x === 'string' ? x : x?.text ?? x?.label, len)).filter(Boolean).slice(0, n);
export function sanitizeScene(raw, spoken, { first = false, last = false, look = 'motion', host = 'sam' } = {}) {
  if (!raw || !allowedTypes(look).has(raw.type)) return null;
  const said = new Set(toks(spoken)); const nums = spokenNumbers(spoken); const d = raw.data || {};
  switch (raw.type) {
    case 'kinetic': return { type: 'kinetic', data: { emphasis: strs(d.emphasis, 3, 24) } };
    case 'title': { const title = clean(d.title, 70); if (!title || title.split(/\s+/).length > 10) return null; return { type: 'title', data: { title, subtitle: clean(d.subtitle, 70) || undefined, kicker: clean(d.kicker, 22) || undefined } }; }
    case 'bigword': { const word = clean(d.word, 22); if (!word || word.split(/\s+/).length > 2 || !grounded(word, said, 0.5)) return null; return { type: 'bigword', data: { word, sub: clean(d.sub, 46) || undefined } }; }
    case 'quote': { const text = clean(d.text, 150); if (!text || !grounded(text, said, 0.7)) return null; return { type: 'quote', data: { text, author: clean(d.author, 40) || undefined } }; }
    case 'outro': { const headline = clean(d.headline, 60); if (!headline) return null; return { type: 'outro', data: { headline, sub: clean(d.sub, 60) || undefined, cta: clean(d.cta, 26) || undefined } }; }
    case 'stat': {
      const value = Number(d.value);
      if (!Number.isFinite(value) || value <= 0 || !numberSaid(value, nums)) return null;
      return { type: 'stat', data: { value, prefix: clean(d.prefix, 3) || undefined, suffix: clean(d.suffix, 6) || undefined, label: clean(d.label, 70) || undefined, icon: d.icon ? resolveIcon(d.icon) : undefined } };
    }
    case 'bars': case 'donut': {
      const items = (Array.isArray(d.items) ? d.items : []).map(x => ({ label: clean(x?.label, 24), value: Number(x?.value) })).filter(x => x.label && Number.isFinite(x.value) && x.value > 0).slice(0, raw.type === 'donut' ? 5 : 6);
      if (items.length < 2 || items.filter(x => numberSaid(x.value, nums)).length < Math.max(2, Math.ceil(items.length * 0.6))) return null;
      return { type: raw.type, data: { title: clean(d.title, 40) || undefined, unit: clean(d.unit, 4) || undefined, prefix: clean(d.prefix, 3) || undefined, items } };
    }
    case 'line': {
      const points = (Array.isArray(d.points) ? d.points : []).map(x => ({ label: clean(x?.label, 14), value: Number(x?.value) })).filter(x => x.label && Number.isFinite(x.value)).slice(0, 8);
      if (points.length < 3 || points.filter(x => numberSaid(x.value, nums)).length < Math.max(2, Math.ceil(points.length * 0.6))) return null;
      return { type: 'line', data: { title: clean(d.title, 40) || undefined, unit: clean(d.unit, 4) || undefined, prefix: clean(d.prefix, 3) || undefined, points } };
    }
    case 'gridstats': {
      const items = (Array.isArray(d.items) ? d.items : []).map(x => ({ value: Number(x?.value), prefix: clean(x?.prefix, 3) || undefined, suffix: clean(x?.suffix, 6) || undefined, label: clean(x?.label, 30) })).filter(x => Number.isFinite(x.value) && x.value > 0 && x.label).slice(0, 4);
      if (items.length < 2 || items.filter(x => numberSaid(x.value, nums)).length < items.length) return null;
      return { type: 'gridstats', data: { title: clean(d.title, 40) || undefined, items } };
    }
    case 'list': {
      const items = (Array.isArray(d.items) ? d.items : []).map(x => ({ text: clean(typeof x === 'string' ? x : x?.text, 56), icon: x?.icon ? resolveIcon(x.icon) : undefined })).filter(x => x.text).slice(0, 5);
      if (items.length < 2 || items.filter(x => grounded(x.text, said, 0.5)).length < Math.ceil(items.length / 2)) return null;
      return { type: 'list', data: { title: clean(d.title, 40) || undefined, items } };
    }
    case 'icons': {
      const items = (Array.isArray(d.items) ? d.items : []).map((x, i) => ({ icon: resolveIcon(x?.icon, i), label: clean(x?.label, 22) })).filter(x => x.label).slice(0, 6);
      if (items.length < 2 || items.filter(x => grounded(x.label, said, 0.5)).length < Math.ceil(items.length / 2)) return null;
      return { type: 'icons', data: { title: clean(d.title, 40) || undefined, items } };
    }
    case 'steps': {
      const steps = strs(d.steps, 5, 34).map(label => ({ label }));
      if (steps.length < 3 || steps.filter(x => grounded(x.label, said, 0.5)).length < Math.ceil(steps.length / 2)) return null;
      return { type: 'steps', data: { title: clean(d.title, 40) || undefined, steps } };
    }
    case 'compare': {
      const side = (x) => { if (typeof x === 'string') return { title: clean(x, 34), points: [] }; return { title: clean(x?.title, 34), points: strs(x?.points, 3, 36) }; };
      const left = side(d.left), right = side(d.right);
      if (!left.title || !right.title || !grounded(left.title, said, 0.5) || !grounded(right.title, said, 0.5)) return null;
      return { type: 'compare', data: { title: clean(d.title, 40) || undefined, left, right } };
    }
    case 'timeline': {
      const events = (Array.isArray(d.events) ? d.events : []).map(x => ({ date: clean(x?.date, 12), label: clean(x?.label, 40) })).filter(x => x.date && x.label).slice(0, 6);
      if (events.length < 3 || events.filter(x => grounded(x.label, said, 0.4) || [...spokenNumbers(x.date)].some(n => numberSaid(n, nums))).length < Math.ceil(events.length * 0.7)) return null;
      return { type: 'timeline', data: { title: clean(d.title, 40) || undefined, events } };
    }
    case 'network': {
      const nodes = (Array.isArray(d.nodes) ? d.nodes : []).map((x, i) => ({ label: clean(typeof x === 'string' ? x : x?.label, 22), icon: resolveIcon(x?.icon, i) })).filter(x => x.label).slice(0, 6);
      const center = clean(d.center, 20);
      if (!center || nodes.length < 3 || nodes.filter(x => grounded(x.label, said, 0.5)).length < Math.ceil(nodes.length / 2)) return null;
      return { type: 'network', data: { title: clean(d.title, 40) || undefined, center, nodes } };
    }
    case 'globe': {
      const pins = (Array.isArray(d.pins) ? d.pins : []).map(x => ({ lat: Number(x?.lat), lon: Number(x?.lon), label: clean(x?.label, 18) })).filter(x => Number.isFinite(x.lat) && Number.isFinite(x.lon) && Math.abs(x.lat) <= 90 && Math.abs(x.lon) <= 180).slice(0, 4);
      return { type: 'globe', data: { title: clean(d.title, 40) || undefined, pins } };
    }
    case 'char_say': {
      const character = CAST[d.character] ? d.character : host;
      return { type: 'char_say', data: { character, emotion: EMOTIONS.includes(d.emotion) ? d.emotion : 'neutral', pose: POSES.includes(d.pose) ? d.pose : undefined, emphasis: strs(d.emphasis, 3, 24) } };
    }
    case 'char_prop': {
      const label = clean(d.label, 34); if (!label || !grounded(label, said, 0.5)) return null;
      return { type: 'char_prop', data: { character: CAST[d.character] ? d.character : host, icon: resolveIcon(d.icon), label, emotion: EMOTIONS.includes(d.emotion) ? d.emotion : 'happy', pose: POSES.includes(d.pose) ? d.pose : 'point' } };
    }
    case 'char_duo': {
      const a = CAST[d.a] ? d.a : host, b = CAST[d.b] && d.b !== a ? d.b : CAST_IDS.find(x => x !== a && x !== 'robo');
      return { type: 'char_duo', data: { a, b, first: d.first === 'b' ? 'b' : 'a', emphasis: strs(d.emphasis, 3, 24) } };
    }
    case 'photo': case 'fullphoto': {
      const query = clean(d.query, 80); if (query.length < 3) return null;
      const caption = clean(d.caption, 40);
      return { type: raw.type, data: { query, named: d.named === true, caption: caption && grounded(caption, said, 0.4) ? caption : undefined, emphasis: strs(d.emphasis, 3, 24), side: d.side === 'right' || d.side === 'left' ? d.side : undefined } };
    }
    case 'collage': {
      const slots = (Array.isArray(d.queries) ? d.queries : []).map(x => ({ query: clean(typeof x === 'string' ? x : x?.query, 80), named: typeof x === 'object' && x?.named === true })).filter(x => x.query.length >= 3).slice(0, 3);
      const headline = clean(d.headline, 60);
      if (slots.length < 2 || (headline && !grounded(headline, said, 0.5))) return null;
      return { type: 'collage', data: { slots, headline: headline || undefined } };
    }
    case 'headline': {
      const headline = clean(d.headline, 90); if (!headline || !grounded(headline, said, 0.6)) return null;
      return { type: 'headline', data: { headline, emphasis: strs(d.emphasis, 2, 24) } };
    }
    default: return null;
  }
}

// ── الـprompt ──
const SYSTEM_MOTION = `You are the director of professional animated explainer videos made entirely with code (motion graphics, kinetic typography, charts). You receive a voice-over split into scenes (with durations). For EACH scene choose the on-screen visual that best illustrates what is being said at that moment.

Return ONLY JSON: {"title":"short video title (max 7 words, narration language)","mood":"epic|tech|business|nature|energetic|serious|clean|minimal","palette":"neon|sunset|emerald|royal|crimson|ocean|mono|daylight","scenes":[{"i":0,"type":"...","data":{},"bg":"aurora","cam":"push","transition":"slide"}]}

Scene types and their "data":
- kinetic {"emphasis":["1-3 key words exactly as spoken"]} — the spoken words appear in sync with the voice as huge animated type. The default for statements, emotions, claims. Needs NO other data.
- title {"title","subtitle?","kicker?"} — opening title card (first scene only, or a rare chapter opener).
- bigword {"word":"1-2 words said in the scene","sub?"} — a punch moment slamming on screen (max 3 in the whole video).
- quote {"text":"verbatim quote said","author?"}
- stat {"value":number said,"prefix?":"$","suffix?":"%|K|M|x","label":"what it measures","icon?":"icon name"} — ONE striking number.
- bars {"title?","unit?","items":[{"label","value"}]} 2-6, donut {"title?","items":[{"label","value"}]} 2-5, line {"title?","unit?","points":[{"label","value"}]} 3-8, gridstats {"title?","items":[{"value","prefix?","suffix?","label"}]} 2-4 — ONLY when the voice states the numbers.
- list {"title?","items":[{"text","icon?"}]} 2-5 — enumerations said in the scene.
- compare {"title?","left":{"title","points":["..."]},"right":{...}} — two things contrasted.
- timeline {"title?","events":[{"date","label"}]} 3-6 — dates/years said.
- icons {"title?","items":[{"icon","label"}]} 2-6 — a few concrete concepts/benefits.
- steps {"title?","steps":[{"label"}]} 3-5 — a process in order.
- globe {"title?","pins?":[{"lat","lon","label"}]} — worldwide/geography/countries.
- network {"title?","center","nodes":[{"label","icon?"}]} 3-6 — an ecosystem/connected parts.
- outro {"headline","sub?","cta?"} — closing card: ONLY for the very last scene when it is a conclusion / call to action.
Icon names: ${ICON_NAMES.join(', ')}.

Rules:
- Every word on screen must come from the narration (same language, same wording or a short quote of it). NEVER invent numbers, facts, names or statistics: numbers in stat/bars/donut/line/gridstats/timeline must be said in the scene's own text.
- Match the visual to the content: a number said → stat; a list → list; a comparison → compare; a process → steps; a statement → kinetic. Be varied: never the same type 3 times in a row; aim for roughly 35-45% kinetic scenes and visual variety in the rest.
- The first scene is the hook: use title, bigword or a strong kinetic.
- "bg": aurora|grid|particles|rays|waves|hex|bokeh|stripes|orbits — match the mood and vary it; for chart/list/compare/timeline scenes use only aurora, bokeh, stripes or particles.
- "cam": push|pull|left|right|up|drift. "transition" (into this scene): cut|slide|slideup|zoom|wipe|iris|flash|glitch — mostly quick and varied; flash/glitch only for dramatic punches (max 3 each); the first scene uses cut.
Output every scene index given, in order.`;
const CATALOG = `Scene types and their "data":
- kinetic {"emphasis":["1-3 key words exactly as spoken"]} — the spoken words appear in sync with the voice as huge animated type. The default for statements, emotions, claims. Needs NO other data.
- title {"title","subtitle?","kicker?"} — opening title card (first scene only, or a rare chapter opener).
- bigword {"word":"1-2 words said in the scene","sub?"} — a punch moment slamming on screen (max 3 in the whole video).
- quote {"text":"verbatim quote said","author?"}
- stat {"value":number said,"prefix?":"$","suffix?":"%|K|M|x","label":"what it measures","icon?":"icon name"} — ONE striking number.
- bars {"title?","unit?","items":[{"label","value"}]} 2-6, donut {"title?","items":[{"label","value"}]} 2-5, line {"title?","unit?","points":[{"label","value"}]} 3-8, gridstats {"title?","items":[{"value","prefix?","suffix?","label"}]} 2-4 — ONLY when the voice states the numbers.
- list {"title?","items":[{"text","icon?"}]} 2-5 — enumerations said in the scene.
- compare {"title?","left":{"title","points":["..."]},"right":{...}} — two things contrasted.
- timeline {"title?","events":[{"date","label"}]} 3-6 — dates/years said.
- icons {"title?","items":[{"icon","label"}]} 2-6 — a few concrete concepts/benefits.
- steps {"title?","steps":[{"label"}]} 3-5 — a process in order.
- globe {"title?","pins?":[{"lat","lon","label"}]} — worldwide/geography/countries.
- network {"title?","center","nodes":[{"label","icon?"}]} 3-6 — an ecosystem/connected parts.
- outro {"headline","sub?","cta?"} — closing card: ONLY for the very last scene when it is a conclusion / call to action.
Icon names: ${ICON_NAMES.join(', ')}.

`;

const VOX_DOC = `Photo scenes (archive photos are fetched automatically from "query"):
- photo {"query":"2-5 English words to find a REAL archival/stock photo of what is being discussed (e.g. 'Suez Canal 1956', 'Gamal Abdel Nasser', 'busy market')","named":true|false,"caption?":"short label said in the scene (place/name/year)","emphasis":["1-2 words said"],"side?":"left|right"} — a photo in a taped paper frame beside the spoken words.
- fullphoto {same fields as photo} — full-screen warm black-and-white photo with big words on top: for dramatic or emotional moments.
- collage {"queries":[{"query":"...","named":true|false},{...}],"headline":"3-6 words said in the scene"} — 2-3 photos scattered with a headline (max 3 in the video).
- headline {"headline":"a newspaper-style headline made ONLY of words said in the scene","emphasis?":["words"]} — a newspaper clipping (max 3 in the video).
named=true when the photo must show a specific real person, place, event or object (it is strictly verified and dropped if not found); named=false for generic imagery (e.g. 'stock exchange floor', 'crowded street').
`;
const CARTOON_DOC = `Cartoon scenes (the video is a cartoon with characters):
- char_say {"character":"cast id","emotion":"neutral|happy|excited|surprised|sad|angry|think","pose":"rest|wave|point|up|shrug|hold|cheer","emphasis":["1-2 words said"]} — a cartoon character says the scene's words in a speech bubble, mouth moving with the voice. The workhorse: 50-60% of all scenes.
- char_prop {"character","icon":"icon name","label":"2-4 words said in the scene","emotion","pose"} — a character beside a big icon/object that illustrates the point.
- char_duo {"a":"cast id","b":"cast id","first":"a|b","emphasis":[]} — two characters, one explains and the other reacts (max 3 in the video).
Do NOT use kinetic scenes (use char_say instead).
`;

const COMMON_HEAD = (what) => `You are the director of professional animated explainer videos made entirely with code. ${what} You receive a voice-over split into scenes (with durations). For EACH scene choose the on-screen visual that best illustrates what is being said at that moment.

Return ONLY JSON: {"title":"short video title (max 7 words, narration language)","mood":"epic|tech|business|nature|energetic|serious|clean|minimal","palette":"PALETTES","PLUS_META","scenes":[{"i":0,"type":"...","data":{},"bg":"BGS","cam":"push","transition":"slide"}]}

`;
const COMMON_RULES = `Rules:
- Every word on screen must come from the narration (same language, same wording or a short quote of it). NEVER invent numbers, facts, names or statistics: numbers in stat/bars/donut/line/gridstats/timeline must be said in the scene's own text.
- Match the visual to the content and be varied: never the same type 3 times in a row (except char_say). The first scene is the hook: a title or a strong scene. The last scene may be an outro.
- "cam": push|pull|left|right|up|drift. "transition" (into this scene): cut|slide|slideup|zoom|wipe|iris|flash — mostly quick and varied; the first scene uses cut.
Output every scene index given, in order.`;

export function buildSystem(look = 'motion') {
  const icons = `\nIcon names: ${ICON_NAMES.join(', ')}.\n\n`;
  if (look === 'vox') {
    return COMMON_HEAD('The style is a Vox-like documentary explainer: real archival and stock photos in taped paper frames, newspaper headlines, maps, charts and highlighted words on warm paper.').replace('PALETTES', 'vox|voxdark').replace('"PLUS_META",', '').replace('BGS', 'paper')
      + VOX_DOC + CATALOG + icons + COMMON_RULES
      + '\n- For Vox style: at least 45% of scenes should be photo / fullphoto / collage — a mention of a real person, place, event, object or era => a NAMED photo with a precise English query (name + year/place). Use stat/bars/line/timeline/globe when numbers or geography are said, headline for a claim or news moment, kinetic only for short abstract statements (max 25%). Never reuse a query. "bg" is always paper.';
  }
  if (isCartoon(look)) {
    return COMMON_HEAD(`The style is a ${look === 'cartoon3d' ? '3D cartoon' : '2D cartoon'} animation: friendly cartoon characters (a narrator host and others) talk, react and point, with infographic scenes when numbers or lists appear.`).replace('PALETTES', 'toon|candy|mint|sunny').replace('"PLUS_META"', '"host":"cast id of the main narrator character","cast":["up to 3 cast ids"]').replace('BGS', 'sky|room|studio|city')
      + CARTOON_DOC + CATALOG + icons + COMMON_RULES
      + '\n- For cartoon style: char_say 50-60%, char_prop 10-20%, char_duo up to 3, infographic scenes (stat/bars/list/compare/steps/timeline/icons...) only when the voice states numbers/lists. Vary characters and emotions; the host narrates most scenes. "bg" is sky|room|studio|city (for chart/list scenes use sky or studio).';
  }
  return SYSTEM_MOTION;
}

const fmtScene = (sc, i) => `[${i}] (${(sc.end - sc.start).toFixed(1)}s, ${sc.tokens.length} words) ${sc.text}`;

export async function directVideo({ spoken, language = 'en', ratio = '16:9', topic = '', style = null, look = 'motion', voiceGender = 'unknown', onProgress = () => {} }, deps = {}) {
  const ask = deps.llmJson || llmJson;
  const scenes = spoken;
  const plans = new Array(scenes.length).fill(null); let meta = { title: topic || '', mood: 'tech', palette: null, host: null, cast: [] };
  const CH = 14, system = buildSystem(look);
  const castLine = isCartoon(look) ? `Cast ids: ${CAST_IDS.map(id => `${id} (${CAST[id].label})`).join('; ')}. The narrator voice is ${voiceGender}${voiceGender === 'unknown' ? '' : ' — pick a host of the same gender (male: sam, omar, prof; female: lina, noor, maya)'}. ` : '';
  for (let from = 0; from < scenes.length; from += CH) {
    const chunk = scenes.slice(from, from + CH);
    const user = `Narration language: ${language}. Video format: ${ratio === '9:16' ? 'vertical 9:16 (short-form)' : 'horizontal 16:9'}. ${castLine}${topic ? `Topic: ${topic}. ` : ''}${style ? `Requested style/mood: ${style}. ` : ''}Total scenes: ${scenes.length}.${from > 0 ? ' (Continuing — earlier scenes already planned; do not repeat the title.' + (meta.host ? ` Host: ${meta.host}.` : '') + ')' : ''}\nScenes:\n` + chunk.map((sc, k) => fmtScene(sc, from + k)).join('\n') + (from + CH >= scenes.length ? '\n(The last scene is index ' + (scenes.length - 1) + '.)' : '');
    try {
      const r = await ask({ system, user, maxTokens: 6000, temperature: 0.4 });
      if (from === 0) {
        const pals = LOOK_PALETTES[look] || MOTION_PALETTES;
        meta = { title: clean(r.title, 70) || meta.title, mood: MOODS.includes(r.mood) ? r.mood : 'tech', palette: pals.includes(r.palette) ? r.palette : null, host: CAST[r.host] ? r.host : null, cast: (Array.isArray(r.cast) ? r.cast : []).filter(x => CAST[x]).slice(0, 3) };
      }
      const byI = new Map((Array.isArray(r.scenes) ? r.scenes : []).map(x => [Number(x.i), x]));
      chunk.forEach((sc, k) => { plans[from + k] = byI.get(from + k) || null; });
    } catch (e) { console.warn(`[CodeVideo/director] chunk ${from} failed (${e.message}) — fallback scenes`); }
    onProgress(Math.min(1, (from + CH) / scenes.length));
  }
  return finalizePlan({ scenes, plans, meta, ratio, look, voiceGender });
}

const POSE_CYCLE = ['point', 'up', 'hold', 'shrug', 'point', 'cheer'];
const EMO_CYCLE = ['happy', 'neutral', 'excited', 'think'];
const TOON_TR = ['slide', 'zoom', 'wipe', 'slideup', 'iris'], VOX_TR = ['slide', 'wipe', 'zoom', 'slideup', 'cut'];

/** يطبّق قواعد التنويع بالكود وبيطلّع قايمة المشاهد النهائية (type/data/bg/cam/transition) */
export function finalizePlan({ scenes, plans, meta, ratio = '16:9', look = 'motion', voiceGender = 'unknown' }) {
  const n = scenes.length; const out = [];
  const cartoon = isCartoon(look), vox = look === 'vox';
  let host = CAST[meta.host] ? meta.host : null;
  if (cartoon) {
    const ok = (id) => (voiceGender === 'female' ? !MALE_CAST.has(id) : voiceGender === 'male' ? !FEMALE_CAST.has(id) : true);
    if (!host || !ok(host)) host = (meta.cast || []).find(ok) || defaultHost(voiceGender);
  }
  let bigwords = 0, titles = 0, flashGlitch = 0, collages = 0, headlines = 0, duos = 0, kinetics = 0;
  scenes.forEach((sc, i) => {
    const raw = plans[i]; let clean0 = null;
    try { clean0 = sanitizeScene(raw, sc.text, { first: i === 0, last: i === n - 1, look, host: host || 'sam' }); } catch { clean0 = null; }
    if (clean0?.type === 'outro' && i !== n - 1) clean0 = null;
    if (clean0?.type === 'bigword' && ++bigwords > (cartoon ? 2 : 3)) clean0 = null;
    if (clean0?.type === 'title' && (++titles > 2 || (i !== 0 && sc.end - sc.start < 3))) clean0 = null;
    if (clean0?.type === 'collage' && ++collages > 3) clean0 = null;
    if (clean0?.type === 'headline' && ++headlines > 3) clean0 = null;
    if (clean0?.type === 'char_duo' && (++duos > 3 || (sc.end - sc.start) < 3.5)) clean0 = { type: 'char_say', data: { character: host, emotion: 'neutral', emphasis: [] } };
    if (cartoon && clean0?.type === 'kinetic') clean0 = null;
    const kin = cartoon ? { type: 'char_say', data: { character: host, emotion: EMO_CYCLE[i % 4], emphasis: [] } } : { type: 'kinetic', data: { emphasis: [] } };
    let pick = clean0 || kin;
    if (vox && pick.type === 'kinetic' && ++kinetics > Math.ceil(n * 0.3) && sc.text.split(/\s+/).length >= 4) pick = { type: 'headline', data: { headline: sc.text.split(/\s+/).slice(0, 8).join(' '), emphasis: [] } };
    if (out.length >= 2 && out[out.length - 1].type === pick.type && out[out.length - 2].type === pick.type && pick.type !== 'kinetic' && pick.type !== 'char_say') pick = kin;
    if (pick.type === 'char_say' && !pick.data.pose) pick = { ...pick, data: { ...pick.data, pose: POSE_CYCLE[i % POSE_CYCLE.length] } };
    out.push({ type: pick.type, data: pick.data, raw });
  });
  // المشهد الأول: عنوان (أو كلمة/نص قوي)
  const firstOk = cartoon ? ['title', 'char_say', 'bigword'] : vox ? ['title', 'bigword', 'kinetic', 'fullphoto', 'photo'] : ['title', 'bigword', 'kinetic'];
  if (out.length && !firstOk.includes(out[0].type)) out[0] = { type: 'title', data: { title: meta.title || scenes[0].text.split(/\s+/).slice(0, 7).join(' ') }, raw: null };
  if (out.length && ['kinetic', 'char_say'].includes(out[0].type) && meta.title && scenes.length >= 4 && (scenes[0].end - scenes[0].start) >= 3) out[0] = { type: 'title', data: { title: meta.title }, raw: null };
  if (cartoon && out.length) { const lt = out[out.length - 1]; if (lt.type === 'char_say' && n >= 5 && !lt.raw?.data) lt.data = { ...lt.data, emotion: 'excited', pose: 'cheer' }; }
  const pals = LOOK_PALETTES[look] || MOTION_PALETTES;
  const palette = pals.includes(meta.palette) ? meta.palette : null;
  let lastTr = null;
  const bgList = cartoon ? CARTOON_BACKDROPS : vox ? ['paper'] : BACKDROPS;
  const trPool = cartoon ? TOON_TR : vox ? VOX_TR : ['slide', 'zoom', 'wipe', 'slideup', 'iris'];
  return {
    title: meta.title, mood: meta.mood, palette, host, look,
    scenes: out.map((o, i) => {
      const raw = o.raw || {};
      const isData = DATA_TYPES.has(o.type);
      let bg;
      if (vox) bg = 'paper';
      else if (cartoon) { bg = CARTOON_BACKDROPS.includes(raw.bg) ? raw.bg : bgList[i % bgList.length]; if (isData && !['sky', 'studio'].includes(bg)) bg = i % 2 ? 'sky' : 'studio'; if (i > 0 && bg === out[i - 1]._bg) bg = bgList[(bgList.indexOf(bg) + 1) % bgList.length]; if (isData && !['sky', 'studio'].includes(bg)) bg = 'studio'; }
      else {
        bg = BACKDROPS.includes(raw.bg) ? raw.bg : null;
        if (isData && !CALM_BG.includes(bg)) bg = CALM_BG[(i * 3 + 1) % CALM_BG.length];
        if (!bg) bg = (o.type === 'bigword' ? ['rays', 'grid', 'orbits'] : o.type === 'title' || o.type === 'outro' ? ['aurora', 'grid', 'rays'] : BACKDROPS)[i % (o.type === 'bigword' || o.type === 'title' || o.type === 'outro' ? 3 : BACKDROPS.length)];
        if (i > 0 && bg === out[i - 1]._bg && !isData) bg = BACKDROPS[(BACKDROPS.indexOf(bg) + 3) % BACKDROPS.length];
      }
      o._bg = bg;
      const cam = CAMS.includes(raw.cam) ? raw.cam : CAMS[i % CAMS.length];
      let tr = TRANSITIONS.includes(raw.transition) ? raw.transition : trPool[i % trPool.length];
      if ((cartoon || vox) && (tr === 'glitch' || tr === 'flash')) tr = trPool[i % trPool.length];
      if (i === 0) tr = 'cut';
      if ((tr === 'flash' || tr === 'glitch') && ++flashGlitch > 5) tr = 'zoom';
      if (tr === lastTr && tr !== 'cut') tr = trPool.find(x => x !== tr && x !== 'cut') || 'slide';
      lastTr = tr;
      return { type: o.type, data: o.data, bg, cam, transition: tr };
    }),
  };
}

export const trDuration = (kind) => TR_DUR[kind] ?? 0.5;
