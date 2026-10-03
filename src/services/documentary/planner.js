// ── planner.js ── من كلمات موقّتة → لقطات (beats) → خطة بصرية (LLM) مع تحقق صارم في الكود
import { llmJson } from './llm.js';
import { TEMPLATE_NAMES, WORLD_CODES } from './svgTemplates.js';

const SENT_END = /[.!?؟…]["'”)\]]*$/;
const PUNCH_WORDS = 2;

// ── 1) تقسيم الكلام لجمل قصيرة (beats) بتوقيتات متصلة ───────────────────────────────────────
export function buildBeats(tokens, { totalDur, minDur = 2.4, maxDur = 8.5, tail = 0.8, hookUntil = 10, hookDur = 2.3 } = {}) {
  if (!tokens.length) return [];
  // جمل
  let sentences = [], cur = [];
  tokens.forEach((t) => {
    cur.push(t);
    if (SENT_END.test(t.w) || t.paraEnd || t.sentenceEnd) { sentences.push(cur); cur = []; }
  });
  if (cur.length) sentences.push(cur);
  // قسّم الجمل الطويلة
  const split = [];
  for (const s of sentences) {
    const dur = s[s.length - 1].end - s[0].start;
    if (dur <= maxDur) { split.push(s); continue; }
    const k = Math.ceil(dur / (maxDur * 0.8));
    let from = 0;
    for (let p = 1; p <= k; p++) {
      let to = p === k ? s.length : Math.round((s.length * p) / k);
      // دوّر على أقرب فاصلة ±3 كلمات
      if (p < k) for (let d = 0; d <= 3; d++) { const c1 = to - d, c2 = to + d; if (c1 > from + 2 && /[,;:،؛]$/.test(s[c1 - 1].w)) { to = c1; break; } if (c2 < s.length - 1 && /[,;:،؛]$/.test(s[c2 - 1].w)) { to = c2; break; } }
      if (to > from) split.push(s.slice(from, to));
      from = to;
    }
  }
  // ادمج القصير مع اللي بعده
  const merged = [];
  for (let i = 0; i < split.length; i++) {
    let s = split[i];
    while (s[s.length - 1].end - s[0].start < minDur && i + 1 < split.length && (split[i + 1][split[i + 1].length - 1].end - s[0].start) <= maxDur * 1.15) { s = s.concat(split[++i]); }
    merged.push(s);
  }
  // آخر beat قصير يندمج في اللي قبله
  if (merged.length > 1) {
    const last = merged[merged.length - 1];
    if (last[last.length - 1].end - last[0].start < 1.6) { merged[merged.length - 2] = merged[merged.length - 2].concat(last); merged.pop(); }
  }
  // الـhook: أول ~10 ثواني بنقطّعها لقطات سريعة (~2.2 ثانية) عشان البداية تبقى سريعة وقوية
  const hooked = [];
  for (const s of merged) {
    const dur = s[s.length - 1].end - s[0].start;
    if (s[0].start < hookUntil && dur > hookDur * 1.6 && s.length >= 6) {
      const k = Math.min(4, Math.max(2, Math.round(dur / hookDur)));
      let from = 0;
      for (let p = 1; p <= k && from < s.length; p++) {
        let to = p === k ? s.length : Math.max(from + 2, Math.round((s.length * p) / k));
        if (p < k) for (let d = 0; d <= 2; d++) { if (to - d > from + 2 && /[,;:،؛]$/.test(s[to - d - 1].w)) { to -= d; break; } }
        if (s.length - to < 2 && p < k) to = s.length;
        hooked.push(s.slice(from, to)); from = to;
      }
    } else hooked.push(s);
  }
  const beats = hooked.map((s, i) => ({ i, text: s.map(t => t.w).join(' '), tokens: s, start: s[0].start, end: s[s.length - 1].end, hook: s[0].start < hookUntil }));
  // اتصال زمني: بداية كل beat = نهاية اللي قبله (الفجوات بتتوزع)
  for (let i = 0; i < beats.length; i++) {
    beats[i].start = i === 0 ? 0 : (beats[i - 1].tokens[beats[i - 1].tokens.length - 1].end + beats[i].tokens[0].start) / 2;
    if (i > 0) beats[i - 1].end = beats[i].start;
  }
  beats[beats.length - 1].end = Math.max(totalDur || 0, beats[beats.length - 1].end) + tail;
  beats.forEach(b => { b.dur = Math.max(0.5, b.end - b.start); });
  return beats;
}

// ── 2) أرقام من نص (للتحقق إن أرقام القوالب مأخوذة من الكلام فعلاً مش مخترعة) ────────────────────
const AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
export function numbersInText(text) {
  const t = String(text || '').replace(/[٠-٩]/g, d => AR_DIGITS[d]).replace(/(\d)[,٬\s](?=\d{3}\b)/g, '$1');
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*(million|billion|thousand|trillion|مليون|مليار|ألف|الف)?/gi;
  let m;
  while ((m = re.exec(t))) {
    let v = parseFloat(m[1]);
    const mult = (m[2] || '').toLowerCase();
    if (/million|مليون/.test(mult)) v *= 1e6; else if (/billion|مليار/.test(mult)) v *= 1e9; else if (/trillion/.test(mult)) v *= 1e12; else if (/thousand|ألف|الف/.test(mult)) v *= 1e3;
    out.push(v);
  }
  return out;
}
const grounded = (value, nums) => nums.some(n => Math.abs(n - value) <= Math.max(0.011 * Math.abs(n), 1e-9));

// ── 3) تحقق/تنضيف بيانات القوالب ───────────────────────────────────────────────────────────────
const clip = (s, n) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const strArr = (a, min, max, n) => (Array.isArray(a) ? a.map(x => clip(x, n)).filter(Boolean).slice(0, max) : []).filter((_, i, arr) => arr.length >= min);

const ALIASES = { US: ['america', 'usa', 'u.s.', 'united states'], GB: ['britain', 'british', 'england', 'english', 'u.k.', 'uk '], RU: ['russia', 'soviet', 'ussr'], FR: ['french'], NL: ['dutch', 'holland'], DE: ['german'], CN: ['chinese', 'china'], JP: ['japanese'], ES: ['spanish'], IN: ['indian'], EG: ['egyptian'], IL: ['israeli'], SA: ['saudi'], AE: ['emirat'], TR: ['turkish', 'ottoman'], IR: ['persian', 'iranian'], GR: ['greek'], IT: ['italian'], KR: ['korea'], KP: ['korea'] };
const regionNames = { en: null, ar: null };
function countryMentioned(code, text) {
  try {
    regionNames.en ||= new Intl.DisplayNames(['en'], { type: 'region' });
    regionNames.ar ||= new Intl.DisplayNames(['ar'], { type: 'region' });
  } catch { return false; }
  const en = String(regionNames.en.of(code) || '').toLowerCase();
  const ar = String(regionNames.ar.of(code) || '').replace(/^ال/, '');
  const stem = en.length <= 4 ? en : en.slice(0, Math.max(4, Math.ceil(en.length * 0.75)));
  const t = ` ${text} `;
  return (en && t.includes(en)) || (stem.length >= 4 && t.includes(stem)) || (ar.length >= 3 && t.includes(ar)) || (ALIASES[code] || []).some(a => t.includes(a));
}

export function sanitizeTemplate(name, data, beatText) {
  if (!TEMPLATE_NAMES.includes(name) || !data || typeof data !== 'object') return null;
  const nums = numbersInText(beatText);
  switch (name) {
    case 'title_card': { const title = clip(data.title, 80); return title ? { title, subtitle: clip(data.subtitle, 100) || undefined, kicker: clip(data.kicker, 30) || undefined } : null; }
    case 'lower_third': { const n = clip(data.name, 48); return n ? { name: n, role: clip(data.role, 60) || undefined } : null; }
    case 'quote': { const t = clip(data.text, 220); return t ? { text: t, author: clip(data.author, 50) || undefined } : null; }
    case 'bullet_panel': case 'evidence_board': { const b = strArr(data.bullets, 2, 6, 70); return b.length >= 2 ? { title: clip(data.title, 40) || undefined, bullets: b } : null; }
    case 'counter': {
      const v = Number(data.value);
      if (!Number.isFinite(v) || !grounded(v, nums)) return null;
      return { value: v, prefix: clip(data.prefix, 4) || undefined, suffix: clip(data.suffix, 12) || undefined, label: clip(data.label, 60) || undefined, decimals: Number.isInteger(data.decimals) ? Math.min(3, data.decimals) : undefined };
    }
    case 'bar_chart': case 'donut_chart': {
      const items = (Array.isArray(data.items) ? data.items : []).map(i => ({ label: clip(i?.label, 28), value: Number(i?.value) })).filter(i => i.label && Number.isFinite(i.value) && i.value >= 0).slice(0, name === 'donut_chart' ? 6 : 8);
      if (items.length < 2 || !items.every(i => grounded(i.value, nums))) return null;
      return { title: clip(data.title, 50) || undefined, items };
    }
    case 'timeline': {
      const events = (Array.isArray(data.events) ? data.events : []).map(e => ({ date: clip(e?.date, 12), label: clip(e?.label, 44) })).filter(e => e.date && e.label).slice(0, 6);
      const text = String(beatText);
      if (events.length < 3 || !events.every(e => text.includes(e.date) || text.includes(String(e.date).replace(/[^\d]/g, '')))) return null;
      return { title: clip(data.title, 40) || undefined, events };
    }
    case 'route_diagram': { const nodes = strArr(data.nodes, 3, 6, 30); return nodes.length >= 3 ? { title: clip(data.title, 40) || undefined, nodes } : null; }
    case 'map_reveal': {
      const text = String(beatText).toLowerCase();
      const places = (Array.isArray(data.places) ? data.places : []).map(pl => ({ name: clip(pl?.name, 28), lat: Number(pl?.lat), lon: Number(pl?.lon) }))
        .filter(pl => pl.name && Number.isFinite(pl.lat) && Number.isFinite(pl.lon) && pl.lat >= -58 && pl.lat <= 84 && pl.lon >= -180 && pl.lon <= 180).slice(0, 4);
      // لازم كل مكان يكون مذكور فعلاً في جملة الـbeat (أي كلمة ≥3 حروف من اسمه)
      const mentioned = (pl) => pl.name.toLowerCase().split(/[\s,،-]+/).some(w => w.length >= 3 && text.includes(w.replace(/^ال/, '')));
      const kept = places.filter(mentioned);
      // دول مظلّلة: كود ISO صالح + الدولة مذكورة فعلاً في الجملة (اسمها بالإنجليزي/العربي أو جذر قريب منه)
      const regions = (Array.isArray(data.regions) ? data.regions : []).map(r => ({ code: String(r?.code || '').toUpperCase(), label: clip(r?.label, 28) || undefined }))
        .filter(r => WORLD_CODES.has(r.code) && countryMentioned(r.code, text)).slice(0, 4);
      if (!kept.length && !regions.length) return null;
      return { title: clip(data.title, 40) || undefined, places: kept, regions, route: kept.length > 1 && data.route !== false };
    }
    case 'photo_board': {
      const photos = (Array.isArray(data.photos) ? data.photos : []).map(p => ({ query: clip(p?.query, 80), caption: clip(p?.caption, 34) || undefined })).filter(p => p.query).slice(0, 4);
      return photos.length >= 2 ? { title: clip(data.title, 30) || undefined, photos } : null;
    }
    case 'kinetic_text': case 'stack_text': case 'marker_text': { const t = clip(data.text, 90); return t && t.split(/\s+/).length <= 14 ? { text: t, emphasis: strArr(data.emphasis, 0, 3, 20) } : null; }
    default: return null;
  }
}

const GRADES = new Set(['none', 'bw_archive', 'sepia', 'cinematic', 'warm', 'cool']);
const TRANSITIONS = new Set(['cut', 'dip', 'flash']);
const VISUALS = new Set(['stock', 'archive', 'nasa', 'text']);
const MOODS = ['epic', 'documentary', 'tension', 'emotional', 'chill', 'upbeat'];

// ── 4) خطة احتياطية لو الـLLM فشل ───────────────────────────────────────────────────────────────
export function fallbackBeatPlan(beat) {
  const words = beat.text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 3).sort((a, b) => b.length - a.length).slice(0, 3);
  return { visual: 'stock', kind: 'either', queries: [words.join(' ') || 'abstract background'], overlays: [], grade: 'none', emphasis: [], transition: 'cut' };
}

export function sanitizeBeatPlan(raw, beat) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const visual = VISUALS.has(p.visual) ? p.visual : 'stock';
  const queries = (Array.isArray(p.queries) ? p.queries : []).map(q => clip(q, 80)).filter(Boolean).slice(0, 3);
  const plan = {
    visual, kind: ['video', 'image', 'either'].includes(p.kind) ? p.kind : 'either', queries,
    overlays: [], grade: GRADES.has(p.grade) ? p.grade : 'none', emphasis: strArr(p.emphasis, 0, PUNCH_WORDS, 20),
    transition: TRANSITIONS.has(p.transition) ? p.transition : 'cut', chapter: clip(p.chapter, 60) || undefined, template: null,
  };
  const tpl = p.template && sanitizeTemplate(p.template.name || p.template, p.template.data || p.data, beat.text);
  if (tpl) {
    const name = p.template.name || p.template;
    if (visual === 'text') plan.template = { name, data: tpl };
    else plan.overlays.push({ template: name, data: tpl });
  }
  if (visual === 'text' && !plan.template) { plan.visual = 'stock'; }
  if (plan.visual !== 'text' && !plan.queries.length) plan.queries = fallbackBeatPlan(beat).queries;
  return plan;
}

// ── 5) تخطيط كل الـbeats بنداءات LLM على دفعات + قواعد إيقاع في الكود ────────────────────────────
const SYSTEM = `You are the editor of a documentary YouTube channel. You receive a narration split into beats (one sentence or phrase each, with its duration). For EACH beat choose what is shown on screen while it is spoken.

Return ONLY JSON: {"title":"short documentary title","mood":"epic|documentary|tension|emotional|chill|upbeat","beats":[{"i":0,"visual":"stock|archive|nasa|text","kind":"video|image|either","queries":["specific search","broader search"],"grade":"none|bw_archive|sepia|cinematic|warm|cool","emphasis":["word"],"transition":"cut|dip|flash","chapter":"Chapter title (only on the first beat of a new chapter)","template":{"name":"...","data":{}}}]}

Rules:
- "visual": "archive" = real historical photos/films, named people, places, events, documents (queries MUST include proper names and years, e.g. "Winston Churchill 1941"); "nasa" = space, rockets, planets, astronauts; "stock" = generic b-roll that illustrates the idea (nature, cities, machines, crowds); "text" = a motion-graphic scene with no footage (use sparingly).
- Queries are English search terms for photo/video libraries (2-3, from specific to broad). Never ask for text, logos, maps with labels, or identifiable private individuals. Show what the sentence concretely says.
- Use a template ONLY when the data comes from the beat's own text. NEVER invent facts or numbers. Available templates and data:
  title_card {title,subtitle?,kicker?} (chapter openers, visual "text") | lower_third {name,role?} (first time a real person is named, overlay on archive/stock) | quote {text,author?} (a direct quote said in the text, visual "text") | bullet_panel {title?,bullets[2-6]} or evidence_board (same) (an enumeration in the text) | counter {value,prefix?,suffix?,label?} (one striking number written in the text) | bar_chart/donut_chart {title?,items[{label,value}]} (2+ numbers written in the text) | timeline {title?,events[{date,label}]} (3+ dated events in the text) | route_diagram {title?,nodes[3-6]} (a sequence of steps/places in the text) | map_reveal {title?,places?[1-4 of {name,lat,lon}],regions?[1-4 of {code,label?}],route?} (a real geographic place, country or journey is named in the text; visual "text"; needs a beat of 3.2+ seconds; places: name = the place as written in the narration language, lat/lon = WGS84 decimal degrees you are certain about, never guess; regions: highlight whole countries with their ISO 3166-1 alpha-2 code, label = a short caption such as "Communist forces" or "Allied powers", only for countries named in the text) | photo_board {title?,photos[2-4 of {query,caption?}]} (a pinboard of old/archival photographs of the specific people, ships, places or objects the text names; visual "text"; needs a beat of 3.6+ seconds; query = a precise English search such as "HMS Amethyst 1949 frigate" or "Mao Zedong 1949"; caption = 1-4 words; use for introductions of key people/objects) | kinetic_text {text,emphasis[]} (a punchy phrase of <=10 words copied from the text).
- Use motion graphics GENEROUSLY — about 1 in 3 beats should carry a template or overlay (lower_third for every named person, counter for numbers, kinetic_text for striking phrases), but never two "text" beats in a row. Put "chapter" on the first beat and whenever the topic clearly shifts.
- MAPS: whenever countries, regions, borders, invasions, routes or journeys are named, use a map_reveal beat (visual "text") with "regions" (ISO codes of the named countries, with a short label) and "places" when you are certain of the coordinates — at least one map in every ~45 seconds of narration when geography is part of the story. PHOTO BOARDS: use photo_board when 2-4 specific people, ships, places or objects are introduced (at least once in every ~45 seconds when such subjects exist).
- THE HOOK: the first beats (the first ~10 seconds) are the hook — pick the most dramatic, concrete, visually striking footage for them (movement, scale, faces, explosions, crowds, vast landscapes — whatever the sentence really says), use varied queries per beat, no text-only scenes, and "flash" on the very first beat.
- "grade": bw_archive for old (pre-1960) archival material, sepia for 1800s-1920s, cinematic for dramatic modern scenes, none for generic stock.
- "emphasis": up to 2 words from the beat that deserve a zoom punch.
- "transition": mostly "cut"; "dip" at chapter changes; "flash" for sudden dramatic moments.
Output every beat index given, in order.`;

export async function planBeats({ beats, language = 'en', topic = '', onProgress = () => {} }, deps = {}) {
  const ask = deps.llmJson || llmJson;
  const plans = new Array(beats.length).fill(null);
  let title = topic || '', mood = 'documentary';
  const CH = 18;
  for (let from = 0; from < beats.length; from += CH) {
    const chunk = beats.slice(from, from + CH);
    const user = `Language of the narration: ${language}. ${topic ? `Topic: ${topic}.` : ''}\n${from > 0 ? `(Continuing; earlier beats already planned. Do not repeat the title.)\n` : ''}Beats:\n` + chunk.map(b => `[${b.i}] (${b.dur.toFixed(1)}s) ${b.text}`).join('\n');
    try {
      const r = await ask({ system: SYSTEM, user, maxTokens: 5000 });
      if (from === 0) { title = clip(r.title, 90) || title; if (MOODS.includes(r.mood)) mood = r.mood; }
      const byI = new Map((Array.isArray(r.beats) ? r.beats : []).map(x => [Number(x.i), x]));
      for (const b of chunk) plans[b.i] = sanitizeBeatPlan(byI.get(b.i), b);
    } catch (e) {
      console.warn(`[Documentary/planner] chunk ${from} failed (${e.message}) — using fallback plans`);
      for (const b of chunk) plans[b.i] = fallbackBeatPlan(b);
    }
    onProgress({ stage: 'planning', done: Math.min(beats.length, from + CH), total: beats.length });
  }
  await ensureRichScenes({ beats, plans, language, ask });
  enforcePacing(plans, beats);
  return { title, mood, plans };
}


// ── 6) ضمان مشاهد الخرائط/لوحات الصور: لو الـLLM ما استخدمهاش وفيه دول/أشخاص مذكورين، بنضيفها بالكود (مع تحقق) ─────────────
const NO_MAP = new Set(['GE', 'JO', 'TD', 'NE']); // أسماء ملتبسة (ولاية/اسم شخص/كلمة عادية)
const STRICT_ALIASES = { US: ['america', 'usa', 'united states'], GB: ['britain', 'united kingdom', 'england'], RU: ['russia', 'soviet union', 'ussr'], NL: ['holland', 'netherlands'], DE: ['germany'], CN: ['china'], KR: ['south korea'], KP: ['north korea'], AE: ['uae'] };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameCache = {};
function countryNames(code) {
  if (nameCache[code]) return nameCache[code];
  let en = '', ar = '';
  try { regionNames.en ||= new Intl.DisplayNames(['en'], { type: 'region' }); regionNames.ar ||= new Intl.DisplayNames(['ar'], { type: 'region' }); en = String(regionNames.en.of(code) || ''); ar = String(regionNames.ar.of(code) || ''); } catch { /* no ICU */ }
  return (nameCache[code] = { en, ar, latin: [en.toLowerCase(), ...(STRICT_ALIASES[code] || [])].filter(n => n.length >= 4 || code === 'US' || code === 'UK') });
}
/** الدول المذكورة فعلاً (مطابقة كلمة كاملة — أدق بكتير من مطابقة الجذر المستخدمة في التحقق) */
export function countriesIn(text) {
  const lower = String(text || '').toLowerCase();
  const found = [];
  for (const code of WORLD_CODES) {
    if (NO_MAP.has(code)) continue;
    const { ar, latin } = countryNames(code);
    const latinHit = latin.some(n => new RegExp(`(^|[^\\p{L}])${esc(n)}(?![\\p{L}])`, 'u').test(lower));
    const arStem = ar.replace(/^ال/, '');
    const arHit = arStem.length >= 3 && new RegExp(`(^|[^\\u0600-\\u06FF])[وبلفكال]{0,3}${esc(arStem)}(?![\\u0600-\\u06FF])`, 'u').test(String(text || ''));
    if (latinHit || arHit) found.push(code);
  }
  return found;
}

const countryLabel = (code, language) => { const n = countryNames(code); return String((language === 'ar' ? n.ar : n.en) || n.en || code).slice(0, 26); };

// تباعد: مشهد "text" جديد لازم يبعد عن أي مشهد text تاني (لا قبله ولا بعده مباشرة) وعن الـhook
function freeSlot(plans, beats, i, minGapSec = 8) {
  if (i < 1 || beats[i].hook || plans[i].visual === 'text') return false;
  if (plans[i - 1]?.visual === 'text' || plans[i + 1]?.visual === 'text') return false;
  return !plans.some((p, k) => p.visual === 'text' && Math.abs(beats[k].start - beats[i].start) < minGapSec);
}

export function injectMaps({ beats, plans, language = 'en' }) {
  const total = beats.length ? beats[beats.length - 1].end : 0;
  const existing = plans.filter(p => p.template?.name === 'map_reveal').length;
  const want = Math.max(1, Math.min(4, Math.round(total / 60))) - existing;
  if (want <= 0) return 0;
  const cands = beats.map((b, i) => ({ i, c: b.dur >= 3.4 ? countriesIn(b.text) : [] })).filter(x => x.c.length).sort((a, b) => (Math.min(3, b.c.length) - Math.min(3, a.c.length)) || (a.i - b.i));
  let added = 0;
  for (const { i, c } of cands) {
    if (added >= want) break;
    if (!freeSlot(plans, beats, i)) continue;
    const data = sanitizeTemplate('map_reveal', { regions: c.slice(0, 3).map(code => ({ code, label: countryLabel(code, language) })), places: [], route: false }, beats[i].text.toLowerCase());
    if (!data) continue;
    Object.assign(plans[i], { visual: 'text', template: { name: 'map_reveal', data }, queries: [], overlays: [], keep: true });
    added++;
  }
  return added;
}

const SYSTEM_BOARDS = `You pick beats of a documentary narration that deserve a PHOTO BOARD: a pinboard of 2-4 archival photographs of the specific people, ships, vehicles, places or objects that the beat's text names. Return ONLY JSON: {"boards":[{"i":12,"title":"short title (optional)","photos":[{"query":"precise English search such as \\"Winston Churchill 1941\\"","caption":"1-4 words"}]}]}. Rules: only beats whose text actually names concrete, photographable subjects (introductions of key people/objects/places); each query names the subject precisely with a year/place when the text gives it; never invent subjects that are not in the text; at most the requested number of boards, spread across the film; if nothing suits, return {"boards":[]}.`;

export async function injectBoards({ beats, plans, ask = llmJson, language = 'en' }) {
  const total = beats.length ? beats[beats.length - 1].end : 0;
  const existing = plans.filter(p => p.template?.name === 'photo_board').length;
  const want = Math.max(1, Math.min(4, Math.round(total / 50))) - existing;
  if (want <= 0) return 0;
  const cands = beats.filter((b, i) => b.dur >= 3.8 && freeSlot(plans, beats, i)).slice(0, 60);
  if (!cands.length) return 0;
  let r;
  try { r = await ask({ system: SYSTEM_BOARDS, user: `Language of the narration: ${language}. Pick up to ${want} beat(s).\nBeats:\n` + cands.map(b => `[${b.i}] (${b.dur.toFixed(1)}s) ${b.text}`).join('\n'), maxTokens: 1500, temperature: 0.2 }); }
  catch (e) { console.warn('[Documentary/planner] photo-board pass failed:', e.message); return 0; }
  let added = 0;
  for (const x of Array.isArray(r?.boards) ? r.boards : []) {
    const i = Number(x?.i);
    if (added >= want || !cands.some(b => b.i === i) || !freeSlot(plans, beats, i)) continue;
    const data = sanitizeTemplate('photo_board', { title: x.title, photos: x.photos }, beats[i].text);
    if (!data) continue;
    Object.assign(plans[i], { visual: 'text', template: { name: 'photo_board', data }, queries: [], overlays: [], keep: true });
    added++;
  }
  return added;
}

export async function ensureRichScenes({ beats, plans, language = 'en', ask = llmJson }) {
  try { injectMaps({ beats, plans, language }); } catch (e) { console.warn('[Documentary/planner] map injection failed:', e.message); }
  try { await injectBoards({ beats, plans, ask, language }); } catch (e) { console.warn('[Documentary/planner] board injection failed:', e.message); }
}

// قواعد الإيقاع: مفيش نصّين ورا بعض، نسبة القوالب، حد أدنى لمدة القوالب، انتقال بداية الفصل
export function enforcePacing(plans, beats) {
  let templated = 0, prevText = false;
  plans.forEach((p, i) => {
    const b = beats[i];
    const isText = p.visual === 'text';
    if (isText && (prevText || b.dur < ({ map_reveal: 3.2, photo_board: 3.6 }[p.template?.name] || 2.6))) { // حوّل لستوك + اعتبر القالب overlay لو ينفع
      p.visual = 'stock'; p.queries = p.queries.length ? p.queries : fallbackBeatPlan(b).queries; p.template = null;
    }
    if (p.visual === 'text') templated++;
    if (b.dur < 2.2) p.overlays = [];
    prevText = p.visual === 'text';
  });
  // لو القوالب النصية > 30% ، شيل أضعفها (مش title_card)
  const limit = Math.ceil(plans.length * 0.4);
  if (templated > limit) {
    let excess = templated - limit;
    for (let i = plans.length - 1; i >= 0 && excess > 0; i--) {
      if (plans[i].visual === 'text' && plans[i].template?.name !== 'title_card' && !plans[i].chapter && !plans[i].keep) { plans[i].visual = 'stock'; plans[i].queries = fallbackBeatPlan(beats[i]).queries; plans[i].template = null; excess--; }
    }
  }
  plans.forEach((p, i) => { if (p.chapter && i > 0 && p.transition === 'cut') p.transition = 'dip'; });
}

// وقت نبضات الزوم داخل اللقطة (ثواني من بداية اللقطة) من كلمات التأكيد
export function punchTimes(beat, emphasis) {
  const out = [];
  const set = new Set((emphasis || []).map(e => String(e).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  for (const t of beat.tokens) {
    const n = String(t.w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (set.has(n)) { const rel = t.start - beat.start; if (rel > 0.3 && rel < beat.dur - 0.4) out.push(rel); }
  }
  return out.slice(0, 2);
}

export const MUSIC_MOODS = MOODS;
