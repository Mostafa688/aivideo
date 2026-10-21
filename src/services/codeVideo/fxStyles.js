// ── fxStyles.js ── "أنظمة تصميم" لفيديوهات الموشن: كل فيديو بياخد شخصية بصرية كاملة (خلفية + كروت + عناصر ديكور متحركة)
// مش بس ألوان. الأنظمة: glow (داكن متوهّج — الافتراضي القديم)، flat (ألوان مصمتة وحدود سميكة وظل حاد)، swiss (أبيض مينيمال
// بشبكة وخطوط رفيعة)، blueprint (مخطط هندسي أزرق بخطوط بيضاء)، pop (ريترو: نقط هافتون ونجوم وألوان جريئة)، pastel (ناعم بكور لامعة)
import { f1, f2, rand, rgba, uid, STYLE_PALETTES } from './design.js';

export const DESIGN_STYLES = ['glow', 'flat', 'swiss', 'blueprint', 'pop', 'pastel'];

export const STYLE_OF = (pal) => (pal && DESIGN_STYLES.includes(pal.style) ? pal.style : 'glow');
const STYLE_KEYS = { flat: ['flatSun', 'flatMint', 'flatCoral'], swiss: ['swiss', 'swissBlue'], blueprint: ['blueprint'], pop: ['pop', 'popPink'], pastel: ['pastel', 'pastelMint'] };
/** باليتة لنظام معيّن (seed بيختار نسخة منها) — glow بيرجّع null (بيستخدم باليتات الموشن العادية) */
export function paletteForStyle(style, seed = 0) {
  const keys = STYLE_KEYS[style]; if (!keys) return null;
  const k = keys[Math.abs(Math.floor(seed)) % keys.length];
  return { name: k, ...STYLE_PALETTES[k] };
}
/** اختيار نظام لو المخرج مختارش: حسب المود + تنويع بالـseed (عشان كل فيديو يطلع مختلف) */
export function pickDesignStyle(mood, seed = 0) {
  const byMood = { tech: ['blueprint', 'glow', 'swiss'], business: ['swiss', 'flat', 'pastel'], epic: ['glow', 'pop'], energetic: ['pop', 'flat', 'glow'], nature: ['pastel', 'flat'], serious: ['swiss', 'glow'], clean: ['swiss', 'pastel'], minimal: ['swiss'] };
  const opts = byMood[mood] || ['flat', 'pop', 'swiss', 'pastel', 'glow', 'blueprint'];
  return opts[Math.abs(Math.floor(seed)) % opts.length];
}

// ── الكروت ──
export function styleCard(c, x, y, w, h, { r = 30, fill = null, stroke = null, accent = null, opacity = 1, shadow = true } = {}) {
  const st = STYLE_OF(c.pal), s = c.s, pal = c.pal; let o = `<g opacity="${f2(opacity)}">`;
  if (st === 'flat' || st === 'pop') {
    const R = Math.min(r, 22) * s, ink = pal.ink || '#111';
    if (shadow) o += `<rect x="${f1(x + 12 * s)}" y="${f1(y + 12 * s)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(R)}" fill="${ink}"/>`;
    o += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(R)}" fill="${fill && !/^rgba/.test(fill) ? fill : pal.card}" stroke="${ink}" stroke-width="${f1(5 * s)}"/>`;
    if (accent) o += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(16 * s)}" rx="${f1(R * 0.5)}" fill="${accent}" stroke="${ink}" stroke-width="${f1(5 * s)}"/>`;
  } else if (st === 'swiss') {
    o += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" fill="${pal.card}" stroke="${pal.ink}" stroke-width="${f1(2.5 * s)}"/>`;
    o += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(14 * s)}" height="${f1(h)}" fill="${accent || pal.a1}"/>`;
  } else if (st === 'blueprint') {
    const R = 10 * s;
    o += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(R)}" fill="rgba(255,255,255,0.07)" stroke="#ffffff" stroke-width="${f1(2.6 * s)}" stroke-dasharray="${f1(16 * s)} ${f1(9 * s)}"/>`;
    for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) o += `<path d="M${f1(px - 14 * s)} ${f1(py)}H${f1(px + 14 * s)}M${f1(px)} ${f1(py - 14 * s)}V${f1(py + 14 * s)}" stroke="${pal.a2}" stroke-width="${f1(3 * s)}"/>`;
    if (accent) o += `<rect x="${f1(x)}" y="${f1(y + 18 * s)}" width="${f1(7 * s)}" height="${f1(h - 36 * s)}" fill="${accent}"/>`;
  } else { // pastel
    const R = Math.max(r, 34) * s;
    if (shadow) o += `<rect x="${f1(x)}" y="${f1(y + 18 * s)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(R)}" fill="${pal.a1}" opacity="0.14"/>`;
    o += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(R)}" fill="${pal.card}" stroke="#ffffff" stroke-width="${f1(3 * s)}"/>`;
    if (accent) o += `<circle cx="${f1(x + 30 * s)}" cy="${f1(y + 30 * s)}" r="${f1(9 * s)}" fill="${accent}"/>`;
  }
  return o + '</g>';
}

// ── الخلفيات (soft = بتتحوّل لـplate منخفض الدقة، crisp = خطوط حادة كل إطار) ──
const dotPattern = (c, id, col, gap, r, op) => `<pattern id="${id}" width="${f1(gap)}" height="${f1(gap)}" patternUnits="userSpaceOnUse"><circle cx="${f1(gap / 2)}" cy="${f1(gap / 2)}" r="${f1(r)}" fill="${col}" opacity="${op}"/></pattern>`;
export function styleBackdrop(c, t, seed = 0) {
  const { w, h, pal, s } = c, st = STYLE_OF(pal); const m = Math.max(w, h);
  let soft = '', crisp = '';
  if (st === 'flat') {
    soft = `<rect width="${w}" height="${h}" fill="${pal.bg[0]}"/>`;
    const a = t * 0.12 + seed;
    soft += `<circle cx="${f1(w * (0.85 + 0.05 * Math.sin(a)))}" cy="${f1(h * (0.12 + 0.04 * Math.cos(a)))}" r="${f1(m * 0.32)}" fill="${pal.bg[1]}"/>`;
    soft += `<circle cx="${f1(w * (0.08 + 0.04 * Math.cos(a)))}" cy="${f1(h * (0.95 + 0.03 * Math.sin(a)))}" r="${f1(m * 0.26)}" fill="${pal.bg[2]}" opacity="0.7"/>`;
  } else if (st === 'swiss') {
    soft = `<rect width="${w}" height="${h}" fill="${pal.bg[0]}"/>`;
    const g = 90 * s; let d = '';
    for (let x = g; x < w; x += g) d += `M${f1(x)} 0V${h}`;
    for (let y = g; y < h; y += g) d += `M0 ${f1(y)}H${w}`;
    crisp = `<path d="${d}" stroke="${pal.ink}" stroke-width="${f1(1 * s)}" opacity="0.07"/>`;
    const r = m * 0.3, cx = w * 0.88, cy = h * 0.14, rot = t * 8;
    crisp += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" stroke="${pal.a1}" stroke-width="${f1(3 * s)}" stroke-dasharray="${f1(r * 0.4)} ${f1(r * 0.12)}" transform="rotate(${f1(rot)} ${f1(cx)} ${f1(cy)})" opacity="0.6"/>`;
    crisp += `<rect x="${f1(w * 0.06)}" y="${f1(h * 0.06)}" width="${f1(120 * s)}" height="${f1(14 * s)}" fill="${pal.a1}"/>`;
  } else if (st === 'blueprint') {
    const gid = uid(c, 'bpg');
    soft = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${pal.bg[0]}"/><stop offset="1" stop-color="${pal.bg[2]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${gid})"/>`;
    const g = 40 * s; let dMin = '', dMaj = '';
    for (let x = 0, k = 0; x < w; x += g, k++) (k % 5 ? (dMin += `M${f1(x)} 0V${h}`) : (dMaj += `M${f1(x)} 0V${h}`));
    for (let y = 0, k = 0; y < h; y += g, k++) (k % 5 ? (dMin += `M0 ${f1(y)}H${w}`) : (dMaj += `M0 ${f1(y)}H${w}`));
    crisp = `<path d="${dMin}" stroke="#fff" stroke-width="${f1(0.8 * s)}" opacity="0.07"/><path d="${dMaj}" stroke="#fff" stroke-width="${f1(1.4 * s)}" opacity="0.13"/>`;
    const cx = w * 0.12, cy = h * 0.88, r = m * 0.16;
    crisp += `<g opacity="0.35" transform="rotate(${f1(t * 14)} ${f1(cx)} ${f1(cy)})"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" stroke="#fff" stroke-width="${f1(2 * s)}"/><path d="M${f1(cx - r)} ${f1(cy)}H${f1(cx + r)}M${f1(cx)} ${f1(cy - r)}V${f1(cy + r)}" stroke="#fff" stroke-width="${f1(1.5 * s)}"/></g>`;
  } else if (st === 'pop') {
    const pid = uid(c, 'hd'), rid = uid(c, 'hdr');
    soft = `<rect width="${w}" height="${h}" fill="${pal.bg[0]}"/>`;
    crisp = `<defs>${dotPattern(c, pid, pal.a2, 26 * s, 5 * s, 0.22)}${dotPattern(c, rid, pal.a1, 30 * s, 6 * s, 0.2)}</defs>`;
    crisp += `<rect x="0" y="0" width="${f1(w * 0.42)}" height="${f1(h * 0.3)}" fill="url(#${pid})"/><rect x="${f1(w * 0.6)}" y="${f1(h * 0.72)}" width="${f1(w * 0.4)}" height="${f1(h * 0.28)}" fill="url(#${rid})"/>`;
    // شعاعات بتلف ورا المحتوى
    const cx = w / 2, cy = h * 0.5, R = m * 0.9, n = 16; let rays = '';
    for (let i = 0; i < n; i += 2) { const a1 = (i / n) * Math.PI * 2, a2 = ((i + 1) / n) * Math.PI * 2; rays += `M${f1(cx)} ${f1(cy)}L${f1(cx + Math.cos(a1) * R)} ${f1(cy + Math.sin(a1) * R)}L${f1(cx + Math.cos(a2) * R)} ${f1(cy + Math.sin(a2) * R)}Z`; }
    soft += `<path d="${rays}" fill="${pal.bg[1]}" transform="rotate(${f1(t * 6 + seed * 20)} ${f1(cx)} ${f1(cy)})"/>`;
  } else { // pastel
    const cols = [pal.a1, pal.a2, pal.a3]; let defs = '<defs>', body = '';
    soft = `<rect width="${w}" height="${h}" fill="${pal.bg[0]}"/>`;
    cols.forEach((col, i) => {
      const id = uid(c, 'pb' + i); defs += `<radialGradient id="${id}"><stop offset="0" stop-color="${col}" stop-opacity="0.38"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;
      const ph = seed + i * 2.1;
      body += `<circle cx="${f1(w * (0.5 + 0.4 * Math.sin(t * 0.25 + ph)))}" cy="${f1(h * (0.5 + 0.38 * Math.cos(t * 0.2 + ph)))}" r="${f1(m * 0.55)}" fill="url(#${id})"/>`;
    });
    soft += defs + '</defs>' + body;
  }
  return { soft, crisp };
}

// ── عناصر ديكور متحركة في أطراف الكادر (بتدخل بنطّة مع بداية المشهد وبتفضل تتحرك) — "عناصر وموشنز أكتر" في كل مشهد ──
function edgeSpot(c, k, seed) {
  const { w, h } = c; const r = rand(seed * 97 + k * 13.7);
  const side = Math.floor(rand(seed * 31 + k * 7.1) * 4);
  const u = 0.08 + r * 0.84;
  if (side === 0) return [w * u, h * (0.05 + rand(k + seed) * 0.07)];
  if (side === 1) return [w * u, h * (0.88 + rand(k * 3 + seed) * 0.07)];
  if (side === 2) return [w * (0.04 + rand(k * 5 + seed) * 0.06), h * u];
  return [w * (0.9 + rand(k * 7 + seed) * 0.06), h * u];
}
function shapeSvg(kind, x, y, sz, col, ink, s, rot) {
  const tr = `transform="rotate(${f1(rot)} ${f1(x)} ${f1(y)})"`;
  switch (kind) {
    case 'circle': return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sz * 0.5)}" fill="${col}"${ink ? ` stroke="${ink}" stroke-width="${f1(4 * s)}"` : ''}/>`;
    case 'ring': return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sz * 0.45)}" fill="none" stroke="${col}" stroke-width="${f1(sz * 0.14)}"/>`;
    case 'plus': return `<path ${tr} d="M${f1(x - sz / 2)} ${f1(y)}H${f1(x + sz / 2)}M${f1(x)} ${f1(y - sz / 2)}V${f1(y + sz / 2)}" stroke="${col}" stroke-width="${f1(sz * 0.2)}" stroke-linecap="round"/>`;
    case 'tri': return `<path ${tr} d="M${f1(x)} ${f1(y - sz / 2)}L${f1(x + sz / 2)} ${f1(y + sz / 2)}H${f1(x - sz / 2)}Z" fill="${col}"${ink ? ` stroke="${ink}" stroke-width="${f1(4 * s)}" stroke-linejoin="round"` : ''}/>`;
    case 'squig': { let d = `M${f1(x - sz)} ${f1(y)}`; for (let i = 0; i < 4; i++) d += `Q${f1(x - sz + (i + 0.5) * sz / 2)} ${f1(y + (i % 2 ? sz * 0.3 : -sz * 0.3))} ${f1(x - sz + (i + 1) * sz / 2)} ${f1(y)}`; return `<path ${tr} d="${d}" fill="none" stroke="${col}" stroke-width="${f1(sz * 0.14)}" stroke-linecap="round"/>`; }
    case 'square': return `<rect ${tr} x="${f1(x - sz / 2)}" y="${f1(y - sz / 2)}" width="${f1(sz)}" height="${f1(sz)}" fill="${col}"${ink ? ` stroke="${ink}" stroke-width="${f1(4 * s)}"` : ''}/>`;
    case 'star': { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? sz * 0.22 : sz * 0.5; d += `${i ? 'L' : 'M'}${f1(x + Math.cos(a) * rr)} ${f1(y + Math.sin(a) * rr)}`; } return `<path ${tr} d="${d}Z" fill="${col}"${ink ? ` stroke="${ink}" stroke-width="${f1(4 * s)}" stroke-linejoin="round"` : ''}/>`; }
    case 'cross': return `<path ${tr} d="M${f1(x - sz / 2)} ${f1(y - sz / 2)}L${f1(x + sz / 2)} ${f1(y + sz / 2)}M${f1(x + sz / 2)} ${f1(y - sz / 2)}L${f1(x - sz / 2)} ${f1(y + sz / 2)}" stroke="${col}" stroke-width="${f1(sz * 0.16)}" stroke-linecap="round"/>`;
    case 'dim': return `<path ${tr} d="M${f1(x - sz)} ${f1(y)}H${f1(x + sz)}M${f1(x - sz)} ${f1(y - sz * 0.2)}V${f1(y + sz * 0.2)}M${f1(x + sz)} ${f1(y - sz * 0.2)}V${f1(y + sz * 0.2)}" stroke="${col}" stroke-width="${f1(2.5 * s)}"/>`;
    case 'sphere': return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(sz * 0.5)}" fill="${col}"/><circle cx="${f1(x - sz * 0.16)}" cy="${f1(y - sz * 0.16)}" r="${f1(sz * 0.16)}" fill="#fff" opacity="0.55"/>`;
    default: return '';
  }
}
const DECOR = {
  glow: { kinds: ['ring', 'plus', 'circle', 'cross'], n: 6, ink: false, op: 0.45 },
  flat: { kinds: ['circle', 'tri', 'squig', 'plus', 'square', 'ring'], n: 9, ink: true, op: 1 },
  swiss: { kinds: ['square', 'plus', 'circle', 'cross'], n: 7, ink: false, op: 0.9 },
  blueprint: { kinds: ['plus', 'dim', 'ring', 'cross'], n: 8, ink: false, op: 0.7 },
  pop: { kinds: ['star', 'circle', 'tri', 'squig', 'plus'], n: 9, ink: true, op: 1 },
  pastel: { kinds: ['sphere', 'ring', 'circle', 'plus'], n: 8, ink: false, op: 0.85 },
};
export function styleDecor(c, t, sceneIndex = 0) {
  const st = STYLE_OF(c.pal), D = DECOR[st], { pal, s } = c; let o = '';
  const cols = [pal.a1, pal.a2, pal.a3].filter(Boolean);
  for (let k = 0; k < D.n; k++) {
    const seed = sceneIndex * 3.7 + 1;
    const [bx, by] = edgeSpot(c, k, seed);
    const kind = D.kinds[Math.floor(rand(seed * 11 + k * 3.3) * D.kinds.length)];
    const sz = (st === 'glow' ? 26 : 34 + rand(k * 9 + seed) * 40) * s;
    const appear = 0.08 + k * 0.07, p = Math.max(0, Math.min(1, (t - appear) / 0.35));
    if (p <= 0) continue;
    const pop = p < 1 ? 1 - Math.pow(1 - p, 3) * Math.cos(p * 7) : 1;
    const ph = k * 1.9 + seed;
    const x = bx + Math.sin(t * 0.9 + ph) * 10 * s, y = by + Math.cos(t * 0.7 + ph) * 12 * s;
    const rot = (kind === 'ring' || kind === 'circle' || kind === 'sphere') ? 0 : (t * (k % 2 ? 40 : -30) + ph * 30);
    const col = st === 'swiss' && k % 3 ? pal.ink : st === 'blueprint' ? (k % 3 ? '#ffffff' : pal.a2) : cols[k % cols.length];
    o += `<g opacity="${f2(D.op)}" transform="translate(${f1(x)} ${f1(y)}) scale(${f2(pop)}) translate(${f1(-x)} ${f1(-y)})">${shapeSvg(kind, x, y, sz, col, D.ink ? (pal.ink || '#111') : null, s, rot)}</g>`;
  }
  return o;
}
