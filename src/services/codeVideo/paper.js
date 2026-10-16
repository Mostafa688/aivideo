// ── paper.js ── أدوات الكولاج الورقي لنمط Vox: ورق متقطع الحواف، شريط لاصق، أسهم مرسومة باليد بتترسم قدامك،
// دواير ماركر، ختم مطاطي، نجمة انفجار، زوايا كاميرا، كتابة آلة كاتبة، و"اهتزاز" stop-motion (boil) زي الورق المتصوّر فريم فريم
import { f1, f2, rand, clamp01, easeOutCubic, easeOutBack, seg, esc, uid } from './design.js';

export const MONO = "'Noto Sans Mono', 'DejaVu Sans Mono', monospace";
export const DISPLAY = "'Noto Sans Display', 'Noto Sans', 'DejaVu Sans', sans-serif";
export const INK = '#1c1a18';
export const PAPER_WHITE = '#f6f1e4';

/** اهتزاز stop-motion: إزاحة صغيرة بتتغيّر 8 مرات في الثانية (مش ناعمة) — بيدّي إحساس ورق حقيقي */
export function boil(t, seed, amp = 1.6, fps = 8) {
  const k = Math.floor(t * fps);
  return { dx: (rand(k, seed) - 0.5) * 2 * amp, dy: (rand(k, seed + 7.3) - 0.5) * 2 * amp, rot: (rand(k, seed + 3.1) - 0.5) * amp * 0.35 };
}

/** حدود ورقة متقطعة (مستطيل بحواف مسنّنة عشوائية ثابتة) */
export function tornPath(x, y, w, h, seed, jag = 9, step = 16) {
  const pts = [];
  const side = (ax, ay, bx, by, nx, ny, k0) => {
    const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const u = i / n, j = (rand(k0 + i, seed) * 0.85 + 0.15) * jag * (i % 2 ? 1 : 0.45);
      pts.push([ax + (bx - ax) * u + nx * j, ay + (by - ay) * u + ny * j]);
    }
  };
  side(x, y, x + w, y, 0, 1, 0); side(x + w, y, x + w, y + h, -1, 0, 100); side(x + w, y + h, x, y + h, 0, -1, 200); side(x, y + h, x, y, 1, 0, 300);
  return 'M' + pts.map(p => `${f1(p[0])} ${f1(p[1])}`).join('L') + 'Z';
}

/** ألياف/نمش الورق (ثابتة) فوق مساحة */
export function fibers(x, y, w, h, seed, s, n = 26, color = INK, op = 0.08) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const px = x + rand(i, seed) * w, py = y + rand(i, seed + 2) * h, l = (6 + rand(i, seed + 4) * 22) * s, a = rand(i, seed + 6) * Math.PI;
    d += `M${f1(px)} ${f1(py)}l${f1(Math.cos(a) * l)} ${f1(Math.sin(a) * l)}`;
  }
  return `<path d="${d}" stroke="${color}" stroke-width="${f1(1.1 * s)}" opacity="${op}" fill="none" stroke-linecap="round"/>`;
}

/** كارت ورق متقطع بظل (المحتوى جوّاه بيتحط بره الدالة) */
export function paperCard(c, { x, y, w, h, seed = 1, fill = PAPER_WHITE, shadow = 0.28, jag = 8 }) {
  const { s } = c;
  const d = tornPath(x, y, w, h, seed, jag * s, 16 * s);
  return `<path d="${d}" fill="#000" opacity="${shadow}" transform="translate(${f1(9 * s)} ${f1(14 * s)})"/><path d="${d}" fill="${fill}"/>` + fibers(x, y, w, h, seed, s, Math.round(w * h / (9000 * s * s)));
}

/** شريط لاصق شبه شفاف بأطراف مقطوعة */
export function tape(c, cx, cy, len, rot = -6, seed = 1, color = '#e9dcb4') {
  const { s } = c, hh = 20 * s, l = len / 2;
  let d = `M${f1(-l)} ${f1(-hh)}`;
  for (let i = 0; i <= 4; i++) d += `L${f1(l + (i % 2 ? 4 : -2) * s * rand(i, seed))} ${f1(-hh + (2 * hh * i) / 4)}`;
  for (let i = 4; i >= 0; i--) d += `L${f1(-l - (i % 2 ? 4 : -2) * s * rand(i + 9, seed))} ${f1(-hh + (2 * hh * i) / 4)}`;
  return `<g transform="translate(${f1(cx)} ${f1(cy)}) rotate(${f1(rot)})"><path d="${d}Z" fill="${color}" opacity="0.78"/><path d="M${f1(-l)} ${f1(-hh * 0.4)}H${f1(l)}" stroke="#fff" stroke-width="${f1(3 * s)}" opacity="0.25"/></g>`;
}

const qPoint = (x1, y1, cx, cy, x2, y2, u) => [(1 - u) * (1 - u) * x1 + 2 * (1 - u) * u * cx + u * u * x2, (1 - u) * (1 - u) * y1 + 2 * (1 - u) * u * cy + u * u * y2];

/** سهم مرسوم باليد بيترسم تدريجيًا (p من 0 لـ1)، منحني، والرأس بيظهر في الآخر */
export function handArrow(c, { x1, y1, x2, y2, bend = 0.3, p = 1, color = INK, width = 7, seed = 1 }) {
  if (p <= 0) return '';
  const { s } = c, mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
  const cx = mx - dy * bend, cy = my + dx * bend;
  const pp = clamp01(p), n = 22, pts = [];
  for (let i = 0; i <= n; i++) { const u = (i / n) * pp, q = qPoint(x1, y1, cx, cy, x2, y2, u); const wob = (rand(i, seed) - 0.5) * 2.2 * s; pts.push([q[0] + wob, q[1] + wob * 0.6]); }
  let o = `<path d="M${pts.map(q => `${f1(q[0])} ${f1(q[1])}`).join('L')}" stroke="${color}" stroke-width="${f1(width * s)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (pp > 0.82) {
    const k = clamp01((pp - 0.82) / 0.18), end = qPoint(x1, y1, cx, cy, x2, y2, 1), pre = qPoint(x1, y1, cx, cy, x2, y2, 0.9);
    const ang = Math.atan2(end[1] - pre[1], end[0] - pre[0]), L = 34 * s * k;
    for (const sgn of [1, -1]) o += `<path d="M${f1(end[0])} ${f1(end[1])}l${f1(Math.cos(ang + Math.PI + sgn * 0.55) * L)} ${f1(Math.sin(ang + Math.PI + sgn * 0.55) * L)}" stroke="${color}" stroke-width="${f1(width * s)}" stroke-linecap="round"/>`;
  }
  return o;
}

/** أسهم دايرية منقطة (زي "بيلف ويرجع") */
export function dashedLoop(c, { cx, cy, r, p = 1, color = INK, t = 0, arrows = 2 }) {
  const { s } = c; let o = '';
  for (let k = 0; k < arrows; k++) {
    const a0 = (k / arrows) * Math.PI * 2 + t * 0.6, sweep = (Math.PI * 2 / arrows) * 0.62 * clamp01(p);
    if (sweep <= 0.02) continue;
    const a1 = a0 + sweep, large = sweep > Math.PI ? 1 : 0;
    const P = (a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    const [sx, sy] = P(a0), [ex, ey] = P(a1);
    o += `<path d="M${f1(sx)} ${f1(sy)}A${f1(r)} ${f1(r)} 0 ${large} 1 ${f1(ex)} ${f1(ey)}" stroke="${color}" stroke-width="${f1(6 * s)}" fill="none" stroke-dasharray="${f1(18 * s)} ${f1(14 * s)}" stroke-linecap="round"/>`;
    const tang = a1 + Math.PI / 2, L = 30 * s;
    for (const sgn of [1, -1]) o += `<path d="M${f1(ex)} ${f1(ey)}l${f1(Math.cos(tang + Math.PI + sgn * 0.6) * L)} ${f1(Math.sin(tang + Math.PI + sgn * 0.6) * L)}" stroke="${color}" stroke-width="${f1(6 * s)}" stroke-linecap="round"/>`;
  }
  return o;
}

/** دايرة ماركر مرسومة باليد حوالين حاجة (لفة وشوية) */
export function markerCircle(c, { cx, cy, rx, ry, p = 1, color = '#d62828', width = 7, seed = 1 }) {
  if (p <= 0) return '';
  const { s } = c, turns = 1.12 * clamp01(p), n = 40, pts = [];
  for (let i = 0; i <= n; i++) {
    const a = -2.2 + (i / n) * turns * Math.PI * 2, j = 1 + (rand(i, seed) - 0.5) * 0.05 + (i / n) * 0.06;
    pts.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]);
  }
  return `<path d="M${pts.map(q => `${f1(q[0])} ${f1(q[1])}`).join('L')}" stroke="${color}" stroke-width="${f1(width * s)}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>`;
}

/** خط تحت الكلام مرسوم باليد (متعرّج سنة) */
export function scribbleLine(c, { x1, x2, y, p = 1, color = '#d62828', width = 6, seed = 1 }) {
  if (p <= 0) return '';
  const { s } = c, n = 14, X = x1 + (x2 - x1) * clamp01(p);
  let d = `M${f1(x1)} ${f1(y)}`;
  for (let i = 1; i <= n; i++) d += `L${f1(x1 + (X - x1) * (i / n))} ${f1(y + (rand(i, seed) - 0.5) * 7 * s)}`;
  return `<path d="${d}" stroke="${color}" stroke-width="${f1(width * s)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** نجمة انفجار */
export function starburst(c, { cx, cy, r, points = 11, color = '#e85d5d', p = 1, rot = 0 }) {
  if (p <= 0) return '';
  const k = easeOutBack(clamp01(p)), pts = [];
  for (let i = 0; i < points * 2; i++) { const a = (i / (points * 2)) * Math.PI * 2 + rot, rr = (i % 2 ? r * 0.48 : r) * k; pts.push(`${f1(cx + Math.cos(a) * rr)},${f1(cy + Math.sin(a) * rr)}`); }
  return `<polygon points="${pts.join(' ')}" fill="${color}" opacity="0.92"/>`;
}

/** زوايا عدسة الكاميرا حوالين الكادر */
export function corners(c, { x, y, w, h, len = 70, p = 1, color = INK, width = 6 }) {
  const { s } = c, L = len * s * clamp01(p), W = width * s;
  if (L <= 0) return '';
  const d = `M${f1(x)} ${f1(y + L)}V${f1(y)}H${f1(x + L)}M${f1(x + w - L)} ${f1(y)}H${f1(x + w)}V${f1(y + L)}M${f1(x + w)} ${f1(y + h - L)}V${f1(y + h)}H${f1(x + w - L)}M${f1(x + L)} ${f1(y + h)}H${f1(x)}V${f1(y + h - L)}`;
  return `<path d="${d}" stroke="${color}" stroke-width="${f1(W)}" fill="none"/>`;
}

/** ختم مطاطي بينزل بخبطة (من كبير لحجمه) بإطار مزدوج */
export function stamp(c, { text, cx, cy, size = 64, rot = -8, color = '#c1121f', p = 1 }) {
  if (p <= 0 || !text) return '';
  const { s } = c, k = clamp01(p), sc = 1 + (1 - easeOutCubic(k)) * 0.9, op = Math.min(1, k * 2.2);
  const tw = Math.min(c.w * 0.8, String(text).length * size * 0.66 + size * 0.9), th = size * 1.5;
  return `<g opacity="${f2(op * 0.9)}" transform="translate(${f1(cx)} ${f1(cy)}) rotate(${f1(rot)}) scale(${f2(sc)})">`
    + `<rect x="${f1(-tw / 2)}" y="${f1(-th / 2)}" width="${f1(tw)}" height="${f1(th)}" fill="none" stroke="${color}" stroke-width="${f1(6 * s)}" rx="${f1(8 * s)}"/>`
    + `<rect x="${f1(-tw / 2 + 10 * s)}" y="${f1(-th / 2 + 10 * s)}" width="${f1(tw - 20 * s)}" height="${f1(th - 20 * s)}" fill="none" stroke="${color}" stroke-width="${f1(2.5 * s)}" rx="${f1(5 * s)}"/>`
    + `<text x="0" y="${f1(size * 0.36)}" font-family="${c.rtl ? c.ff : DISPLAY}" font-size="${f1(size)}" font-weight="900" text-anchor="middle" fill="${color}"${c.rtl ? ' direction="rtl"' : ` letter-spacing="${f1(size * 0.06)}"`}>${esc(text)}</text></g>`;
}

/** سطور آلة كاتبة بتتكتب حرف حرف (لاتيني/أرقام — المونو مش بيدعم العربي كويس) */
export function typeLines(c, lines, x, y, size, t, t0 = 0, cps = 26, color = INK) {
  let o = '', tt = t - t0;
  lines.forEach((ln, i) => {
    const str = String(ln), n = Math.max(0, Math.min(str.length, Math.floor(tt * cps)));
    tt -= str.length / cps + 0.15;
    if (n <= 0) return;
    const shown = str.slice(0, n) + (n < str.length && Math.floor(t * 4) % 2 ? '▌' : '');
    o += `<text x="${f1(x)}" y="${f1(y + i * size * 1.35)}" font-family="${MONO}" font-size="${f1(size)}" font-weight="700" fill="${color}" xml:space="preserve">${esc(shown)}</text>`;
  });
  return o;
}

/** دخول ورقة "مرمية" من بره الكادر: إزاحة + دوران + هبوط بسيط (stop-motion متقطع) */
export function toss(t, at, { from = 'bottom', dist = 260, s = 1, dur = 0.5, fps = 12 } = {}) {
  const tq = Math.floor(Math.max(0, t) * fps) / fps;
  const k = easeOutBack(clamp01((tq - at) / dur)), v = 1 - k;
  const dx = from === 'left' ? -dist * v : from === 'right' ? dist * v : 0, dy = from === 'top' ? -dist * v : from === 'bottom' ? dist * v : 0;
  return { dx: dx * s, dy: dy * s, rot: v * (from === 'left' ? -14 : 14), o: tq >= at ? 1 : 0, k };
}

/** سطر كلام على شريط ورق متقطع (زي قصاصة) */
export function paperStrip(c, { x, y, w, h, seed = 1, fill = PAPER_WHITE, rot = -1 }) {
  const { s } = c, d = tornPath(x, y, w, h, seed, 6 * s, 14 * s);
  return `<g transform="rotate(${f1(rot)} ${f1(x + w / 2)} ${f1(y + h / 2)})"><path d="${d}" fill="#000" opacity="0.22" transform="translate(${f1(6 * s)} ${f1(9 * s)})"/><path d="${d}" fill="${fill}"/></g>`;
}

export const clipId = (c, name) => uid(c, name);
export { seg, easeOutCubic };
