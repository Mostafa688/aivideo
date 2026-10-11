// ── art.js ── مشهد "رسم حر": رسّام (LLM) بيرسم أي حاجة كـ JSON بلغة وصف محدودة وآمنة (أشكال + مسارات + حركة + شخصيات من الكاست)،
// والكود بيتحقق من كل حاجة (قوائم بيضاء، حدود أرقام وعدد عناصر، مفيش سكريبتات ولا صور خارجية) وبعدين بيرسمها ويحرّكها في المشهد.
// الـLLM مش بينفّذ أي كود — بس بيوصف رسمة، والرندر بتاعنا.
import { llmJson } from '../documentary/llm.js';
import { f1, f2, clamp01, easeOutCubic, spring, txt, uid, icon, resolveIcon, ICON_NAMES, rgba } from './design.js';
import { mouthAt, blinkAt, CAST } from './characters.js';
import { drawAny } from './creatures.js';
import { inkWords } from './scenesV.js';
import { kinetic } from './scenesA.js';

const MAX_ELEMENTS = 60, MAX_CHARS = 3;
const HEX = /^#[0-9a-f]{6}$/i, HEX3 = /^#[0-9a-f]{3}$/i;
const TOKENS = new Set(['a1', 'a2', 'a3', 'text', 'muted', 'white', 'black', 'none', 'bg0', 'bg1', 'bg2']);
const IN_KINDS = ['pop', 'fade', 'slideL', 'slideR', 'slideU', 'slideD', 'grow', 'drop'];
const LOOP_KINDS = ['float', 'spin', 'pulse', 'wiggle', 'sway', 'orbit', 'flicker'];
const num = (v, lo = -30, hi = 130, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const hexNorm = (s) => (HEX.test(s) ? s.toLowerCase() : HEX3.test(s) ? '#' + s.slice(1).split('').map(x => x + x).join('').toLowerCase() : null);
const colorPart = (s) => { s = String(s || '').trim(); return TOKENS.has(s) && s !== 'none' ? s : hexNorm(s); };
function cleanFill(v, d = null) {
  const s = String(v ?? '').trim();
  if (TOKENS.has(s)) return s;
  const h = hexNorm(s); if (h) return h;
  const m = /^(grad|rad):([^,]+),([^,]+)$/i.exec(s);
  if (m) { const a = colorPart(m[2]), b = colorPart(m[3]); if (a && b) return `${m[1].toLowerCase()}:${a},${b}`; }
  return d;
}

// ── التحقق من العناصر ──
const cleanAnim = (e, out) => {
  const i = e.in; if (i && typeof i === 'object' && IN_KINDS.includes(i.kind)) out.in = { kind: i.kind, at: i.at == null ? null : num(i.at, 0, 1, 0), dur: num(i.dur, 0.2, 1.4, 0.5) };
  const l = e.loop; if (l && typeof l === 'object' && LOOP_KINDS.includes(l.kind)) out.loop = { kind: l.kind, amp: num(l.amp, 0, 14, l.kind === 'spin' ? 0 : 2.5), speed: num(l.speed, 0.2, 5, 1) };
  const m = e.move; if (m && Array.isArray(m.to) && m.to.length === 2) out.move = { to: [num(m.to[0]), num(m.to[1])], at: num(m.at, 0, 1, 0.3), dur: num(m.dur, 0.4, 4, 1.4) };
};
const PATH_OK = /^[MLHVCSQTAZ0-9eE.,\s-]+$/;

/** يرجّع عنصر نضيف أو null. ctx: { castIds:Set, textOk:(t)=>bool, count:{n,chars} } */
function cleanEl(e, ctx, depth = 0) {
  if (!e || typeof e !== 'object' || ctx.count.n >= MAX_ELEMENTS) return null;
  const shape = String(e.shape || '').toLowerCase(), out = { shape };
  const fill = cleanFill(e.fill, null), stroke = cleanFill(e.stroke, null);
  if (fill) out.fill = fill; if (stroke) out.stroke = stroke;
  out.sw = num(e.sw, 0, 8, stroke ? 1 : 0); out.op = num(e.op, 0, 1, 1); out.rot = num(e.rot, -360, 360, 0);
  switch (shape) {
    case 'rect': Object.assign(out, { x: num(e.x), y: num(e.y), w: num(e.w, 0, 160, 10), h: num(e.h, 0, 160, 10), rx: num(e.rx, 0, 60, 0) }); break;
    case 'circle': Object.assign(out, { x: num(e.x), y: num(e.y), r: num(e.r, 0.3, 90, 5) }); break;
    case 'ellipse': Object.assign(out, { x: num(e.x), y: num(e.y), rx: num(e.rx, 0.3, 90, 6), ry: num(e.ry, 0.3, 90, 4) }); break;
    case 'line': Object.assign(out, { x1: num(e.x1), y1: num(e.y1), x2: num(e.x2), y2: num(e.y2) }); if (!out.stroke) out.stroke = out.fill || 'text'; out.sw = num(e.sw, 0.3, 8, 1); delete out.fill; break;
    case 'polygon': {
      let pts = Array.isArray(e.points) ? e.points : [];
      if (typeof e.points === 'string') pts = e.points.trim().split(/\s+/).map(p => p.split(',').map(Number));
      pts = pts.filter(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)).slice(0, 24).map(p => [num(p[0]), num(p[1])]);
      if (pts.length < 3) return null; out.points = pts; break;
    }
    case 'path': {
      const d = String(e.d || '').trim();
      if (d.length < 6 || d.length > 600 || !PATH_OK.test(d) || !/^M/.test(d)) return null;
      out.d = d; break;
    }
    case 'text': {
      const text = String(e.text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!text || !ctx.textOk(text)) return null;
      Object.assign(out, { text, x: num(e.x, 0, 100, 50), y: num(e.y, 0, 100, 50), size: num(e.size, 2.5, 30, 8), weight: e.weight === 400 || e.weight === 600 ? e.weight : 800, anchor: ['start', 'end'].includes(e.anchor) ? e.anchor : 'middle' });
      if (!out.fill) out.fill = 'text'; break;
    }
    case 'icon': Object.assign(out, { name: resolveIcon(e.name), x: num(e.x), y: num(e.y), size: num(e.size, 3, 80, 14) }); if (!out.fill) out.fill = 'a1'; out.sw = num(e.sw, 2, 9, 5.5); break;
    case 'character': {
      if (!ctx.castIds.has(e.id) || ctx.count.chars >= MAX_CHARS) return null; ctx.count.chars++;
      Object.assign(out, { id: e.id, x: num(e.x), y: num(e.y), size: num(e.size, 18, 120, 50), emotion: String(e.emotion || 'happy'), pose: String(e.pose || 'rest'), flip: e.flip === true, speak: e.speak === true }); break;
    }
    case 'group': {
      if (depth >= 2) return null;
      ctx.count.n++;
      const kids = (Array.isArray(e.children) ? e.children : []).slice(0, 24).map(k => cleanEl(k, ctx, depth + 1)).filter(Boolean);
      if (!kids.length) return null;
      Object.assign(out, { children: kids, tx: num(e.tx, -60, 60, 0), ty: num(e.ty, -60, 60, 0), scale: num(e.scale, 0.2, 3, 1), pivot: Array.isArray(e.pivot) && e.pivot.length === 2 ? [num(e.pivot[0]), num(e.pivot[1])] : null });
      cleanAnim(e, out); return out;
    }
    default: return null;
  }
  if (['rect', 'circle', 'ellipse', 'polygon', 'path'].includes(shape) && !out.fill && !out.stroke) out.fill = 'a1';
  if (Array.isArray(e.pivot) && e.pivot.length === 2) out.pivot = [num(e.pivot[0]), num(e.pivot[1])];
  ctx.count.n++;
  cleanAnim(e, out);
  return out;
}

/** @returns {{bg:string|null, elements:Array}|null} */
export function sanitizeArt(raw, { castIds = new Set(), textOk = () => false } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const ctx = { castIds, textOk, count: { n: 0, chars: 0 } };
  const elements = (Array.isArray(raw.elements) ? raw.elements : []).map(e => cleanEl(e, ctx)).filter(Boolean);
  if (elements.length < 3) return null;
  return { bg: cleanFill(raw.bg, null), elements };
}

// ── مواعيد ظهور العناصر (ثواني من بداية المشهد) — بيستخدمها الرندر والصوت ──
export function appearTimes(elements, dur) {
  const n = elements.length, step = Math.min(0.16, (dur * 0.5) / Math.max(1, n));
  return elements.map((e, i) => (e.in && e.in.at != null ? e.in.at * dur * 0.6 : 0.2 + i * step));
}

// ── الرندر ──
function bbox(e) {
  if (e.pivot) return e.pivot;
  switch (e.shape) {
    case 'rect': return [e.x + e.w / 2, e.y + e.h / 2];
    case 'circle': case 'ellipse': case 'icon': case 'text': return [e.x, e.y];
    case 'character': return [e.x, e.y - e.size * 0.4];
    case 'line': return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2];
    case 'polygon': { const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; }
    case 'path': { const n = (e.d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1); return xs.length && ys.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : [50, 50]; }
    case 'group': { const ps = e.children.map(bbox); return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length]; }
    default: return [50, 50];
  }
}

function fillRef(c, f, rc) {
  if (!f || f === 'none') return 'none';
  const pal = c.pal;
  const tok = { a1: pal.a1, a2: pal.a2, a3: pal.a3, text: pal.text, muted: pal.muted, white: '#ffffff', black: '#111111', bg0: pal.bg[0], bg1: pal.bg[1], bg2: pal.bg[2] };
  if (tok[f]) return tok[f];
  if (f.startsWith('#')) return f;
  const m = /^(grad|rad):(.+),(.+)$/.exec(f);
  if (!m) return pal.a1;
  const id = uid(c, `ag${rc.gid++}`), p = (x) => tok[x] || x;
  rc.defs.push(m[1] === 'grad' ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p(m[2])}"/><stop offset="1" stop-color="${p(m[3])}"/></linearGradient>` : `<radialGradient id="${id}"><stop offset="0" stop-color="${p(m[2])}"/><stop offset="1" stop-color="${p(m[3])}"/></radialGradient>`);
  return `url(#${id})`;
}

function renderEl(c, e, rc, t0) {
  const t = rc.t - t0; if (t < 0) return '';
  let dx = 0, dy = 0, rot = e.rot || 0, sx = 1, sy = 1, op = e.op ?? 1;
  const [px, py] = bbox(e);
  if (e.in) {
    const p = clamp01(t / e.in.dur), ez = easeOutCubic(p);
    switch (e.in.kind) {
      case 'pop': { const s = Math.max(0, spring(t / e.in.dur * 0.6, { k: 11, d: 6 })); sx = sy = s; op *= Math.min(1, p * 4); break; }
      case 'fade': op *= p; break;
      case 'slideL': dx = -(1 - ez) * 30; op *= Math.min(1, p * 3); break;
      case 'slideR': dx = (1 - ez) * 30; op *= Math.min(1, p * 3); break;
      case 'slideU': dy = -(1 - ez) * 30; op *= Math.min(1, p * 3); break;
      case 'slideD': dy = (1 - ez) * 30; op *= Math.min(1, p * 3); break;
      case 'grow': sx = sy = Math.max(0.001, ez); op *= Math.min(1, p * 4); break;
      case 'drop': { const b = p < 1 ? 1 - Math.pow(1 - p, 3) * Math.cos(p * 9) : 1; dy = -(1 - b) * 45; op *= Math.min(1, p * 4); break; }
      default: break;
    }
  } else op *= Math.min(1, t / 0.25);
  if (e.loop) {
    const { kind, amp, speed } = e.loop, w = rc.t * speed * 2;
    if (kind === 'float') dy += Math.sin(w * 1.4) * amp;
    else if (kind === 'sway') dx += Math.sin(w * 1.2) * amp;
    else if (kind === 'spin') rot += rc.t * (amp || 60) * speed;
    else if (kind === 'pulse') { const k = 1 + Math.sin(w * 1.6) * (amp * 0.02 || 0.05); sx *= k; sy *= k; }
    else if (kind === 'wiggle') rot += Math.sin(w * 2) * (amp || 4);
    else if (kind === 'orbit') { dx += Math.cos(w) * amp; dy += Math.sin(w) * amp; }
    else if (kind === 'flicker') op *= 0.6 + 0.4 * Math.abs(Math.sin(w * 3));
  }
  if (e.move) { const mt = e.move.at * rc.dur * 0.6, p = clamp01((rc.t - mt) / e.move.dur), ez = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; dx += (e.move.to[0] - px) * ez; dy += (e.move.to[1] - py) * ez; }
  const tf = `translate(${f1(dx)} ${f1(dy)}) translate(${f1(px)} ${f1(py)}) rotate(${f1(rot)}) scale(${f2(sx)} ${f2(sy)}) translate(${f1(-px)} ${f1(-py)})`;
  const f = fillRef(c, e.fill, rc), st = e.stroke ? fillRef(c, e.stroke, rc) : 'none';
  const sa = `fill="${f}"${e.stroke || e.sw ? ` stroke="${st}" stroke-width="${f1(e.sw || 1)}" stroke-linecap="round" stroke-linejoin="round"` : ''}`;
  let body = '';
  switch (e.shape) {
    case 'rect': body = `<rect x="${f1(e.x)}" y="${f1(e.y)}" width="${f1(e.w)}" height="${f1(e.h)}" rx="${f1(e.rx)}" ${sa}/>`; break;
    case 'circle': body = `<circle cx="${f1(e.x)}" cy="${f1(e.y)}" r="${f1(e.r)}" ${sa}/>`; break;
    case 'ellipse': body = `<ellipse cx="${f1(e.x)}" cy="${f1(e.y)}" rx="${f1(e.rx)}" ry="${f1(e.ry)}" ${sa}/>`; break;
    case 'line': body = `<line x1="${f1(e.x1)}" y1="${f1(e.y1)}" x2="${f1(e.x2)}" y2="${f1(e.y2)}" stroke="${st}" stroke-width="${f1(e.sw)}" stroke-linecap="round"/>`; break;
    case 'polygon': body = `<polygon points="${e.points.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ')}" ${sa}/>`; break;
    case 'path': body = `<path d="${e.d}" ${sa}/>`; break;
    case 'text': body = txt(c, e.text, e.x, e.y, e.size, { weight: e.weight, fill: f, anchor: e.anchor }); break;
    case 'icon': body = icon(c, e.name, e.x, e.y, e.size, { color: f === 'none' ? c.pal.a1 : f, sw: e.sw }); break;
    case 'character': {
      const spec = c.cast?.map?.[e.id] || CAST[e.id]; if (!spec) return '';
      const st2 = { t: rc.t, mouth: e.speak ? mouthAt(rc.tokens, rc.t) : 0, blink: blinkAt(rc.t, rc.idx), emotion: e.emotion, look: 0.2, armT: clamp01((t - 0.3) / 0.5), ...(e.pose === 'point' || e.pose === 'wave' || e.pose === 'up' ? { armR: e.pose } : e.pose === 'cheer' || e.pose === 'shrug' || e.pose === 'hold' ? { armL: e.pose, armR: e.pose } : {}) };
      body = drawAny(c, spec, st2, { x: e.x, y: e.y, size: e.size, flip: e.flip, style: c.look === 'cartoon3d' ? '3d' : 'flat', tag: `ac${rc.idx}_${rc.gid++}` }); break;
    }
    case 'group': {
      const kids = e.children.map((k, i) => renderEl(c, k, rc, t0 + (k.in && k.in.at != null ? k.in.at * rc.dur * 0.6 - t0 : 0.06 * i))).join('');
      body = `<g transform="translate(${f1(e.tx)} ${f1(e.ty)})${e.scale !== 1 ? ` translate(${f1(px)} ${f1(py)}) scale(${f2(e.scale)}) translate(${f1(-px)} ${f1(-py)})` : ''}">${kids}</g>`; break;
    }
    default: return '';
  }
  return `<g transform="${tf}" opacity="${f2(op)}">${body}</g>`;
}

/** مشهد الرسم: ستيدج مربع بيتحط جنب الكلام المتزامن (أو بملء الشاشة مع شريط كلام تحته) */
export function art(c, d, t, dur, sc) {
  if (!d.elements || !d.elements.length) return kinetic(c, d, t, dur, sc);
  const { w, h, s, pal, portrait } = c; let o = '';
  const side = sc.index % 2 ? 'right' : 'left', full = d.layout === 'full' && !portrait;
  let S, sx, sy, box;
  if (portrait) { S = w * 0.92; sx = w * 0.04; sy = h * 0.07; box = { x: w * 0.07, y: sy + S + h * 0.03, w: w * 0.86, h: h - (sy + S + h * 0.03) - h * 0.05 }; }
  else if (full) { S = Math.min(h * 0.74, w * 0.9); sx = (w - S) / 2; sy = h * 0.05; box = { x: w * 0.08, y: h * 0.82, w: w * 0.84, h: h * 0.15 }; }
  else { S = Math.min(h * 0.82, w * 0.52); sx = side === 'left' ? w * 0.04 : w - w * 0.04 - S; sy = (h - S) / 2; box = { x: side === 'left' ? sx + S + w * 0.03 : w * 0.05, y: h * 0.14, w: w - S - w * 0.04 - w * 0.03 - w * 0.05, h: h * 0.72 }; }
  const e0 = clamp01(t / 0.45), pop = easeOutCubic(e0), kb = 1 + 0.035 * clamp01(t / Math.max(1, dur));
  const cx = sx + S / 2, cy = sy + S / 2, id = uid(c, 'artclip'), R = 6;
  const rc = { c, t, dur, idx: sc.index, tokens: sc.tokens || [], gid: 0, defs: [] };
  const times = appearTimes(d.elements, dur);
  const inner = d.elements.map((e, i) => renderEl(c, e, rc, times[i])).join('');
  const bgFill = d.bg ? fillRef(c, d.bg, rc) : (pal.dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.6)');
  o += `<g opacity="${f2(pop)}" transform="translate(${f1(cx)} ${f1(cy)}) scale(${f2((0.92 + 0.08 * pop) * kb)}) translate(${f1(-cx)} ${f1(-cy)})">`;
  o += `<rect x="${f1(sx + S * 0.014)}" y="${f1(sy + S * 0.03)}" width="${f1(S)}" height="${f1(S)}" rx="${f1(S * R / 100)}" fill="#000" opacity="${pal.dark ? 0.35 : 0.14}"/>`;
  o += `<g transform="translate(${f1(sx)} ${f1(sy)}) scale(${f2(S / 100)})"><defs><clipPath id="${id}"><rect width="100" height="100" rx="${R}"/></clipPath>${rc.defs.join('')}</defs><rect width="100" height="100" rx="${R}" fill="${bgFill}"/><g clip-path="url(#${id})">${inner}</g><rect width="100" height="100" rx="${R}" fill="none" stroke="${pal.dark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.18)'}" stroke-width="0.8"/></g></g>`;
  o += inkWords(c, sc.tokens, t, box, { emphasis: d.emphasis, startSize: full ? 62 : portrait ? 74 : 80, maxLines: full ? 2 : 6 });
  return o;
}

// ── الرسّام (LLM) ──
const SYSTEM = `You are a vector illustrator for an animation engine. You draw flat, cute, clean illustrations as JSON; the engine renders and animates them. The canvas is a square 0..100 by 0..100 (x to the right, y down). Return ONLY JSON: {"bg":"<fill>","elements":[ ... ]}.

Element shapes (all numbers are canvas units):
- {"shape":"rect","x","y","w","h","rx","fill"}  (x,y = top-left)
- {"shape":"circle","x","y","r","fill"}  {"shape":"ellipse","x","y","rx","ry","fill"}  (x,y = centre)
- {"shape":"line","x1","y1","x2","y2","stroke","sw"}
- {"shape":"polygon","points":[[x,y],[x,y],...],"fill"}
- {"shape":"path","d":"M 10 80 L 50 20 Q 70 40 90 80 Z","fill","stroke","sw"}  — ABSOLUTE UPPERCASE commands only (M L H V C S Q T A Z), max 600 characters
- {"shape":"text","text":"a word said in the scene","x","y","size","fill","weight"}  — only words that are said in the scene, max 3 labels
- {"shape":"icon","name":"<icon name>","x","y","size","fill"}  — icons: ICONS
CHARACTERS
- {"shape":"group","children":[...],"tx":0,"ty":0}  — group related parts so they move together
Common optional fields: "fill" (hex like #f59e0b, a palette token a1|a2|a3|text|muted|white|black|bg0|bg1|bg2, none, or a gradient "grad:#top,#bottom" / "rad:#centre,#edge"), "stroke","sw" (0-8),"op" (opacity 0-1),"rot" (degrees),
"in":{"kind":"pop|fade|slideL|slideR|slideU|slideD|grow|drop","at":0-1,"dur":0.3-1} (how it appears; "at" = when across the scene, omit for an automatic stagger),
"loop":{"kind":"float|spin|pulse|wiggle|sway|orbit|flicker","amp":number,"speed":number} (continuous motion), "move":{"to":[x,y],"at":0-1,"dur":seconds} (travels from its place to a target — cars, boats, birds).

How to draw well:
- Layer from back to front: background (sky/room/water as the "bg" fill or big rects), ground, main subject, details, small moving things last.
- Build the main subject from 8-20 simple shapes, large and centred (about 60-80% of the canvas). Round, friendly geometry. Eyes/windows/etc. as small circles and rects.
- Add a soft shadow under objects: a dark ellipse (fill #000, op 0.12).
- Use 3-5 harmonious colours plus palette tokens; make sure the subject contrasts with the background. Bright, flat fills; use gradients sparingly.
- Make it feel alive: 2-5 elements with a "loop" (clouds sway, sun spins slowly, bubbles float, wheels spin) and a staggered "in" for the main parts. Everything must stay inside the canvas.
- Total at most 45 elements (a group counts as one plus its children). No overlapping text. Never draw logos, real people or text that is not said in the scene.

Example (a house with a sun): {"bg":"grad:#bfe6ff,#e8f7ff","elements":[{"shape":"circle","x":80,"y":20,"r":10,"fill":"#ffc833","loop":{"kind":"spin","amp":40,"speed":0.3},"in":{"kind":"pop"}},{"shape":"rect","x":0,"y":78,"w":100,"h":22,"fill":"#3bb273"},{"shape":"ellipse","x":50,"y":80,"rx":30,"ry":4,"fill":"#000","op":0.12},{"shape":"rect","x":28,"y":46,"w":44,"h":34,"rx":2,"fill":"#ffd9a8","in":{"kind":"grow"}},{"shape":"polygon","points":[[22,48],[50,22],[78,48]],"fill":"#e4572e","in":{"kind":"drop"}},{"shape":"rect","x":44,"y":60,"w":12,"h":20,"rx":2,"fill":"#7a4a2b"},{"shape":"rect","x":32,"y":54,"w":9,"h":9,"fill":"#9bd1ff"},{"shape":"circle","x":18,"y":30,"r":6,"fill":"#fff","loop":{"kind":"sway","amp":4,"speed":0.5}}]}`;

export function artistSystem(castMap = null) {
  const icons = ICON_NAMES.join(', ');
  const castIds = castMap ? Object.keys(castMap).filter(id => castMap[id].custom).concat(Object.keys(castMap).filter(id => !castMap[id].custom)) : [];
  const chars = castMap ? `- {"shape":"character","id":"<cast id>","x","y","size","emotion":"neutral|happy|excited|surprised|sad|angry|think","pose":"rest|wave|point|up|shrug|hold|cheer","speak":true|false}  — a cast character with a face and arms (x,y = waist centre, size = bust height, 40-70 looks right, max 3). Cast: ${castIds.map(id => `${id} (${castMap[id].label})`).join('; ')}. Use them when the scene needs a character (the main character interacting with your drawing).` : '';
  return SYSTEM.replace('ICONS', icons).replace('CHARACTERS\n', chars ? chars + '\n' : '');
}

/** يطلب من الرسّام رسمة لمشهد؛ بيتحقق ويعيد المحاولة مرة. بيرجّع { bg, elements } أو null */
export async function designArt({ idea, text, language = 'en', palette, castMap = null, look = 'motion', textOk = () => false }, deps = {}) {
  const ask = deps.llmJson || llmJson;
  const castIds = new Set(castMap ? Object.keys(castMap) : []);
  const pal = palette ? `Palette: dark=${palette.dark}, a1=${palette.a1}, a2=${palette.a2}, a3=${palette.a3}, text=${palette.text}, background gradient=${palette.bg.join('→')}.` : '';
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const user = `Draw this scene: ${String(idea).slice(0, 260)}\nWords said in the scene (narration language ${language}): "${String(text).slice(0, 300)}"\n${pal} Style: ${look === 'vox' ? 'editorial explainer illustration' : look.startsWith('cartoon') ? 'friendly cartoon' : 'clean modern flat illustration'}.${feedback}`;
      const r = await ask({ system: artistSystem(castMap), user, maxTokens: 4200, temperature: attempt ? 0.4 : 0.6 });
      const clean = sanitizeArt(r, { castIds, textOk });
      if (clean) return clean;
      feedback = '\nYour previous answer was unusable (too few valid shapes or invalid fields). Return the JSON again with 12-30 simple valid elements, absolute uppercase path commands only.';
    } catch (e) { console.warn('[CodeVideo/art] illustrator failed:', e.message); }
  }
  return null;
}
