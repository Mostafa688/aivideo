// ── adix/designKit.js ── لغة تصميم موشن جرافيك بيكتبها Opus بنفسه (مش قوالب): كل عنصر عبارة عن طبقات
// (نص بخط يختاره، أشكال، خطوط بتترسم، مسارات، صورة المنتج المقصوصة، شرارات) وكل طبقة لها keyframes
// (مكان، حجم، دوران، شفافية، blur، كشف تدريجي، رسم) بمنحنيات حركة يختارها، وتقسيم النص لكلمات/حروف بتدخل ورا بعض.
// السيرفر بيتأكد من كل رقم ولون (حدود آمنة) وبيرسم الفريمات SVG → PNG شفاف زي باقي motionKit.
import sharp from 'sharp';
import { canPath, measure as latMeasure, glyphs } from '../codeVideo/typeset.js';

// ── الخطوط المتاحة (عربي + لاتيني لكل اختيار) ──
export const FONT_CHOICES = {
  kufi: { lat: 'clean', ar: "'Noto Kufi Arabic','Noto Sans Arabic',sans-serif", pango: 'Noto Kufi Arabic Bold', w: 700, desc: 'bold geometric — Arabic Kufi / Latin Poppins ExtraBold (modern, strong)' },
  naskh: { lat: 'serif', ar: "'Noto Naskh Arabic','Noto Sans Arabic',serif", pango: 'Noto Naskh Arabic Bold', w: 700, desc: 'elegant calligraphic — Arabic Naskh / Latin Playfair Display Black (luxury, beauty, food, perfume)' },
  arabicSans: { lat: 'sans', ar: "'Noto Sans Arabic',sans-serif", pango: 'Noto Sans Arabic', w: 500, desc: 'light clean sans — Arabic Sans / Latin Poppins Medium (minimal, tech, calm)' },
  anton: { lat: 'condensed', ar: "'Noto Kufi Arabic','Noto Sans Arabic',sans-serif", pango: 'Noto Kufi Arabic Bold', w: 700, desc: 'tall condensed impact — Latin Anton / Arabic Kufi (sport, energy, big numbers)' },
  serifItalic: { lat: 'serifItalic', ar: "'Noto Naskh Arabic','Noto Sans Arabic',serif", pango: 'Noto Naskh Arabic Bold', w: 700, desc: 'italic serif — Latin Playfair Italic / Arabic Naskh (fashion, perfume, editorial)' },
  heavyItalic: { lat: 'round', ar: "'Noto Kufi Arabic','Noto Sans Arabic',sans-serif", pango: 'Noto Kufi Arabic Bold', w: 700, desc: 'heavy italic — Latin Poppins ExtraBold Italic / Arabic Kufi (speed, dynamic)' },
};
export const SHAPES = ['text', 'rect', 'circle', 'ring', 'line', 'path', 'image', 'sparkles'];
export const EASES = ['linear', 'in', 'out', 'inOut', 'back', 'elastic', 'bounce', 'expo'];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const isAr = (s) => /[؀-ۿ]/.test(String(s || ''));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const hex = (c, d = null) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : /^#[0-9a-f]{3}$/i.test(String(c || '')) ? `#${[...String(c).slice(1)].map((x) => x + x).join('')}` : d);
const EASE = {
  linear: (x) => x, in: (x) => x * x * x, out: (x) => 1 - Math.pow(1 - x, 3),
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: (x) => { const c1 = 1.8, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  elastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  bounce: (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; },
  expo: (x) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x)),
};
const mixHex = (a, b, p) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * p);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};

// ── تنضيف تصميم Opus ──
const PROP_LIM = { x: [-0.5, 1.5], y: [-0.5, 1.5], scale: [0, 8], sx: [-4, 4], sy: [-4, 4], rotate: [-1080, 1080], opacity: [0, 1], blur: [0, 40], reveal: [0, 1], draw: [0, 1] };
const DEF = { x: 0.5, y: 0.5, scale: 1, sx: 1, sy: 1, rotate: 0, opacity: 1, blur: 0, reveal: 1, draw: 1 };
const PATH_OK = /^[MmLlHhVvCcSsQqTtZz0-9.,\s-]{2,1200}$/;

function cleanKeys(keys, dur) {
  const ks = (Array.isArray(keys) ? keys : []).slice(0, 12).map((k) => {
    const o = { t: clamp(num(k?.t, 0), 0, dur) };
    for (const [p, [a, b]] of Object.entries(PROP_LIM)) if (k?.[p] != null && Number.isFinite(Number(k[p]))) o[p] = clamp(Number(k[p]), a, b);
    if (hex(k?.color)) o.color = hex(k.color);
    if (EASES.includes(k?.ease)) o.ease = k.ease;
    return o;
  }).sort((a, b) => a.t - b.t);
  if (!ks.length) ks.push({ t: 0 });
  // كل keyframe بياخد القيم اللي مش مكتوبة من اللي قبله
  let prev = { ...DEF };
  return ks.map((k) => { const full = { ...prev, ...k }; prev = full; return full; });
}

function cleanLayer(l, dur) {
  if (!l || !SHAPES.includes(l.shape)) return null;
  const s = { shape: l.shape, start: clamp(num(l.start, 0), 0, dur), end: clamp(num(l.end, dur), 0, dur), keys: cleanKeys(l.keys, dur), ease: EASES.includes(l.ease) ? l.ease : 'out' };
  if (s.end - s.start < 0.05) return null;
  s.color = hex(l.color, '#ffffff'); s.opacityMul = clamp(num(l.opacity, 1), 0, 1);
  const g = Array.isArray(l.gradient) ? l.gradient.map((c) => hex(c)).filter(Boolean).slice(0, 3) : [];
  if (g.length >= 2) { s.gradient = g; s.gradientAngle = clamp(num(l.gradientAngle, 90), -360, 360); }
  if (hex(l.stroke)) { s.stroke = hex(l.stroke); s.strokeWidth = clamp(num(l.strokeWidth, 0.02), 0, 0.2); }
  if (l.shadow) s.shadow = hex(l.shadow, '#000000');
  if (hex(l.glow)) s.glow = hex(l.glow);
  if (l.blend === 'screen' || l.blend === 'multiply' || l.blend === 'overlay') s.blend = l.blend;
  s.revealDir = ['left', 'right', 'up', 'down', 'center'].includes(l.revealDir) ? l.revealDir : 'left';
  if (l.float) s.float = { amp: clamp(num(l.float.amp, 0.006), 0, 0.05), speed: clamp(num(l.float.speed, 0.6), 0, 4), rotate: clamp(num(l.float.rotate, 0), 0, 15) };
  switch (l.shape) {
    case 'text': {
      s.text = String(l.text ?? '').replace(/[\u0000-\u001F]/g, (c) => (c === '\n' ? '\n' : '')).slice(0, 120);
      const cnt = l.count && Number.isFinite(Number(l.count.to)) ? { from: num(l.count.from, 0), to: Number(l.count.to), decimals: clamp(Math.round(num(l.count.decimals, 0)), 0, 2), prefix: String(l.count.prefix || '').slice(0, 8), suffix: String(l.count.suffix || '').slice(0, 12), dur: clamp(num(l.count.dur, 1.2), 0.2, 6), ease: EASES.includes(l.count.ease) ? l.count.ease : 'out' } : null;
      if (!s.text && !cnt) return null;
      s.count = cnt;
      s.font = FONT_CHOICES[l.font] ? l.font : 'kufi';
      s.size = clamp(num(l.size, 0.07), 0.015, 0.4);
      s.align = ['left', 'right', 'center'].includes(l.align) ? l.align : 'center';
      s.track = clamp(num(l.letterSpacing, 0), -0.05, 0.6);
      s.lineHeight = clamp(num(l.lineHeight, isAr(s.text) ? 1.45 : 1.15), 0.8, 2.5);
      s.maxWidth = clamp(num(l.maxWidth, 0.86), 0.1, 1);
      s.split = ['none', 'words', 'letters', 'lines'].includes(l.split) ? l.split : 'none';
      s.stagger = clamp(num(l.stagger, 0.06), 0, 1);
      s.unitDur = clamp(num(l.unitDur, 0.4), 0.05, 3);
      s.unitEase = EASES.includes(l.unitEase) ? l.unitEase : 'out';
      const uf = l.unitFrom || {};
      s.unitFrom = { dx: clamp(num(uf.dx, 0), -2, 2), dy: clamp(num(uf.dy, s.split === 'none' ? 0 : 0.6), -3, 3), opacity: clamp(num(uf.opacity, s.split === 'none' ? 1 : 0), 0, 1), scale: clamp(num(uf.scale, 1), 0, 5), rotate: clamp(num(uf.rotate, 0), -360, 360), blur: clamp(num(uf.blur, 0), 0, 30) };
      if (l.bg && typeof l.bg === 'object') s.bg = { color: hex(l.bg.color, '#000000'), opacity: clamp(num(l.bg.opacity, 0.7), 0, 1), radius: clamp(num(l.bg.radius, 0.25), 0, 2), padX: clamp(num(l.bg.padX, 0.45), 0, 3), padY: clamp(num(l.bg.padY, 0.25), 0, 3), stroke: hex(l.bg.stroke), gradient: Array.isArray(l.bg.gradient) ? l.bg.gradient.map((c) => hex(c)).filter(Boolean).slice(0, 3) : null };
      if (l.highlight && Array.isArray(l.highlight.words)) s.highlight = { words: l.highlight.words.map((w) => String(w).trim()).filter(Boolean).slice(0, 6), color: hex(l.highlight.color, '#ffd400'), style: ['color', 'marker', 'underline'].includes(l.highlight.style) ? l.highlight.style : 'color', textColor: hex(l.highlight.textColor) };
      break;
    }
    case 'rect': s.w = clamp(num(l.w, 0.3), 0, 2); s.h = clamp(num(l.h, 0.1), 0, 2); s.radius = clamp(num(l.radius, 0), 0, 0.5); break;
    case 'circle': s.r = clamp(num(l.r, 0.1), 0, 1.5); break;
    case 'ring': s.r = clamp(num(l.r, 0.12), 0, 1.5); s.width = clamp(num(l.width, 0.012), 0.001, 0.2); s.dash = clamp(num(l.dash, 0), 0, 0.2); break;
    case 'line': s.x2 = clamp(num(l.x2, 0.7), -0.5, 1.5); s.y2 = clamp(num(l.y2, 0.5), -0.5, 1.5); s.width = clamp(num(l.width, 0.008), 0.001, 0.1); s.cap = l.cap === 'butt' ? 'butt' : 'round'; s.arrow = !!l.arrow; s.dash = clamp(num(l.dash, 0), 0, 0.1); break;
    case 'path': if (!PATH_OK.test(String(l.d || ''))) return null; s.d = String(l.d); s.size = clamp(num(l.size, 0.2), 0.01, 2); s.fill = l.fill === false ? false : true; break;
    case 'image': s.src = l.src === 'product' ? 'product' : null; if (!s.src) return null; s.h = clamp(num(l.h, 0.4), 0.02, 1.5); break;
    case 'sparkles': s.count = clamp(Math.round(num(l.count, 14)), 1, 60); s.spread = clamp(num(l.spread, 0.25), 0.01, 1.5); s.size = clamp(num(l.size, 0.015), 0.002, 0.08); s.seed = Math.round(num(l.seed, 7)); break;
    default: return null;
  }
  return s;
}

/** تصميم Opus → شكل آمن (أو null لو مفيش طبقات صالحة) */
export function sanitizeDesign(o) {
  const dur = Math.max(0.1, num(o.end, 0) - num(o.start, 0));
  const layers = (Array.isArray(o.layers) ? o.layers : []).slice(0, 24).map((l) => cleanLayer(l, dur)).filter(Boolean);
  return layers.length ? layers : null;
}

// ── حساب حالة الطبقة في لحظة ──
function stateAt(L, t) {
  const ks = L.keys; const lt = t - L.start;
  let st;
  if (lt <= ks[0].t) st = { ...ks[0] };
  else if (lt >= ks[ks.length - 1].t) st = { ...ks[ks.length - 1] };
  else {
    let i = 1; while (ks[i].t < lt) i++;
    const a = ks[i - 1], b = ks[i]; const p = (EASE[b.ease || L.ease] || EASE.out)((lt - a.t) / Math.max(1e-6, b.t - a.t));
    st = {};
    for (const k of Object.keys(DEF)) st[k] = a[k] + (b[k] - a[k]) * p;
    if (a.color || b.color) st.color = a.color && b.color ? mixHex(a.color, b.color, clamp(p, 0, 1)) : (b.color || a.color);
  }
  if (L.float) { st.y += Math.sin(lt * 2 * Math.PI * L.float.speed) * L.float.amp; st.rotate += Math.sin(lt * 2 * Math.PI * L.float.speed * 0.7) * L.float.rotate; }
  return st;
}

// ── طول مسار تقريبي (librsvg مش بيدعم pathLength) ──
export function pathLength(d) {
  const toks = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, len = 0, lcx = 0, lcy = 0;
  const n = () => Number(toks[i++]);
  const seg = (pts) => { for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); };
  const cubic = (x1, y1, x2, y2, ex, ey) => { const pts = []; for (let s = 0; s <= 16; s++) { const u = s / 16, v = 1 - u; pts.push([v * v * v * x + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * ex, v * v * v * y + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * ey]); } seg(pts); lcx = x2; lcy = y2; x = ex; y = ey; };
  const quad = (x1, y1, ex, ey) => { const pts = []; for (let s = 0; s <= 12; s++) { const u = s / 12, v = 1 - u; pts.push([v * v * x + 2 * v * u * x1 + u * u * ex, v * v * y + 2 * v * u * y1 + u * u * ey]); } seg(pts); lcx = x1; lcy = y1; x = ex; y = ey; };
  while (i < toks.length) {
    if (/[A-Za-z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(); const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': x = ox + n(); y = oy + n(); sx = x; sy = y; cmd = rel ? 'l' : 'L'; break;
      case 'L': { const ex = ox + n(), ey = oy + n(); len += Math.hypot(ex - x, ey - y); x = ex; y = ey; break; }
      case 'H': { const ex = (rel ? x : 0) + n(); len += Math.abs(ex - x); x = ex; break; }
      case 'V': { const ey = (rel ? y : 0) + n(); len += Math.abs(ey - y); y = ey; break; }
      case 'C': { const a = [ox + n(), oy + n(), ox + n(), oy + n(), ox + n(), oy + n()]; cubic(...a); break; }
      case 'S': { const x1 = 2 * x - lcx, y1 = 2 * y - lcy; const a = [ox + n(), oy + n(), ox + n(), oy + n()]; cubic(x1, y1, ...a); break; }
      case 'Q': { const a = [ox + n(), oy + n(), ox + n(), oy + n()]; quad(...a); break; }
      case 'T': { const x1 = 2 * x - lcx, y1 = 2 * y - lcy; quad(x1, y1, ox + n(), oy + n()); break; }
      case 'Z': len += Math.hypot(sx - x, sy - y); x = sx; y = sy; i += 0; cmd = ''; break;
      default: i++;
    }
    if (!cmd && i < toks.length && !/[A-Za-z]/.test(toks[i])) i++;
  }
  return Math.max(1, len);
}

// ── قياس النص ──
const AR_W = new Map();
async function arWidth(str, pango) {
  const k = `${pango}|${str}`; if (AR_W.has(k)) return AR_W.get(k);
  let w = 0; try { w = (await sharp({ text: { text: esc(str), font: `${pango} 100`, rgba: true, dpi: 72 } }).metadata()).width || 0; } catch { w = 0; }
  if (!w) w = String(str).length * 55;
  AR_W.set(k, w); return w;
}
// وحدات النص (كلمة/حرف/سطر) بمكانها — بيتحسب مرة واحدة قبل الرندر
async function layoutText(L, W, H) {
  const F = FONT_CHOICES[L.font]; const px = L.size * Math.min(W, H);
  const pathable = (s) => !isAr(s) && canPath(F.lat, s);
  const wOf = async (s) => (pathable(s) ? latMeasure(F.lat, s, px, { track: L.track }) : ((await arWidth(s, F.pango)) * px) / 100);
  const spaceW = Math.max((await wOf('a a')) - (await wOf('aa')), isAr(L.text) ? px * 0.3 : 0);
  const maxW = L.maxWidth * W;
  const paras = String(L.text).split('\n');
  const lines = [];
  for (const para of paras) {
    const words = para.split(/\s+/).filter(Boolean); let cur = []; let cw = 0;
    for (const w of words) { const ww = await wOf(w); if (cur.length && cw + spaceW + ww > maxW) { lines.push(cur); cur = []; cw = 0; } cur.push({ w, ww }); cw += (cur.length > 1 ? spaceW : 0) + ww; }
    if (cur.length) lines.push(cur);
  }
  const lh = px * L.lineHeight; const blockH = lh * (lines.length - 1) + px; const units = []; let maxLine = 0;
  lines.forEach((ln, li) => {
    const rtl = isAr(ln.map((x) => x.w).join(' '));
    const lw = ln.reduce((a, x) => a + x.ww, 0) + spaceW * (ln.length - 1); maxLine = Math.max(maxLine, lw);
    const base = -blockH / 2 + li * lh + px * 0.78;
    const x0 = L.align === 'left' ? 0 : L.align === 'right' ? -lw : -lw / 2; // بيتظبط تحت بعد maxLine
    units.push({ line: li, lw, x0, base, rtl, words: ln });
  });
  return { px, lh, blockH, lines: units, maxLine, spaceW, pathable };
}

function fillDef(id, colors, angle) {
  const a = (num(angle, 90) * Math.PI) / 180; const x2 = 0.5 + Math.cos(a) / 2, y2 = 0.5 + Math.sin(a) / 2;
  return `<linearGradient id="${id}" x1="${(1 - x2).toFixed(3)}" y1="${(1 - y2).toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}">${colors.map((c, i) => `<stop offset="${(i / (colors.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
}

/** بيجهّز التصميم ويرجّع frame(t) → SVG — ctx.productUri/productW/productH للصورة المقصوصة */
export async function buildDesign(o, W, H, accent, ctx = {}) {
  const layers = o._layers || sanitizeDesign(o); if (!layers) return () => '';
  const M = Math.min(W, H);
  // تجهيز النصوص
  for (const L of layers) {
    if (L.shape !== 'text') continue;
    if (L.count) { L.text = `${L.count.prefix}${L.count.to.toFixed(L.count.decimals)}${L.count.suffix}`; }
    L._lay = await layoutText(L, W, H);
    const lay = L._lay;
    for (const u of lay.lines) u.x0 = L.align === 'left' ? -lay.maxLine / 2 : L.align === 'right' ? lay.maxLine / 2 - u.lw : -u.lw / 2;
  }
  const F = (L) => FONT_CHOICES[L.font];

  const textUnits = (L, t, st) => {
    const lay = L._lay; const px = lay.px; let out = ''; let ui = 0;
    const fill = st.color || L.color;
    const paint = L.gradient ? `url(#g${L._i})` : fill;
    const strokeA = L.stroke ? ` stroke="${L.stroke}" stroke-width="${(L.strokeWidth * px).toFixed(1)}" paint-order="stroke" stroke-linejoin="round"` : '';
    const lt = t - L.start;
    const unitTf = (cx, cy) => {
      const i = ui++; const u = (EASE[L.unitEase] || EASE.out)(clamp((lt - i * L.stagger) / L.unitDur, 0, 1)); const f = L.unitFrom; const v = 1 - u;
      const op = f.opacity + (1 - f.opacity) * u; const sc = f.scale + (1 - f.scale) * u;
      const tf = `translate(${(f.dx * px * v).toFixed(1)} ${(f.dy * px * v).toFixed(1)}) translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${(f.rotate * v).toFixed(1)}) scale(${sc.toFixed(3)}) translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`;
      const bl = f.blur * v;
      return { tf, op, bl, i };
    };
    const hlSet = new Set((L.highlight?.words || []).map((w) => w.replace(/[^\p{L}\p{N}%]/gu, '')));
    const isHl = (w) => hlSet.size && hlSet.has(String(w).replace(/[^\p{L}\p{N}%]/gu, ''));
    const drawPiece = (str, x, base, color, unitLeft, unitW) => {
      // x = بداية القطعة من الشمال
      if (lay.pathable(str)) {
        const d = glyphs(F(L).lat, str, x, base, px, { track: L.track }).map((g) => g.d).join('');
        return `<path d="${d}" fill="${color}"${strokeA}/>`;
      }
      return `<text x="${(unitLeft + unitW / 2).toFixed(1)}" y="${base.toFixed(1)}" text-anchor="middle" font-family="${F(L).ar}" font-size="${px.toFixed(1)}" font-weight="${F(L).w}" fill="${color}"${strokeA}>${esc(str)}</text>`;
    };
    const wrapUnit = (inner, cx, cy) => {
      const { tf, op, bl, i } = unitTf(cx, cy); if (op <= 0.003) return '';
      const filt = bl > 0.3 ? `<filter id="ub${L._i}_${i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${bl.toFixed(1)}"/></filter>` : '';
      return `${filt}<g transform="${tf}" opacity="${op.toFixed(3)}"${filt ? ` filter="url(#ub${L._i}_${i})"` : ''}>${inner}</g>`;
    };
    // نص العدّاد بيتغير كل فريم → قطعة واحدة في النص
    if (L.count) {
      const c = L.count; const p = (EASE[c.ease] || EASE.out)(clamp(lt / c.dur, 0, 1));
      const str = `${c.prefix}${(c.from + (c.to - c.from) * p).toFixed(c.decimals)}${c.suffix}`;
      const base = lay.lines[0].base; const wd = lay.pathable(str) ? latMeasure(F(L).lat, str, px, { track: L.track }) : lay.maxLine;
      const x = L.align === 'left' ? -lay.maxLine / 2 : L.align === 'right' ? lay.maxLine / 2 - wd : -wd / 2;
      return wrapUnit(drawPiece(str, x, base, paint, x, wd), 0, base - px * 0.35);
    }
    for (const ln of lay.lines) {
      const lineStr = ln.words.map((x) => x.w).join(' ');
      if ((L.split === 'none' || L.split === 'lines') && !hlSet.size) { out += wrapUnit(drawPiece(lineStr, ln.x0, ln.base, paint, ln.x0, ln.lw), ln.x0 + ln.lw / 2, ln.base - px * 0.35); continue; }
      // كلمة كلمة (العربي من اليمين للشمال)
      let cursor = ln.rtl ? ln.x0 + ln.lw : ln.x0;
      for (const wd of ln.words) {
        const left = ln.rtl ? cursor - wd.ww : cursor; cursor = ln.rtl ? cursor - wd.ww - lay.spaceW : cursor + wd.ww + lay.spaceW;
        const hl = isHl(wd.w);
        let back = '';
        if (hl && L.highlight.style === 'marker') back = `<rect x="${(left - px * 0.12).toFixed(1)}" y="${(ln.base - px * 0.92).toFixed(1)}" width="${(wd.ww + px * 0.24).toFixed(1)}" height="${(px * 1.18).toFixed(1)}" rx="${(px * 0.14).toFixed(1)}" fill="${L.highlight.color}"/>`;
        if (hl && L.highlight.style === 'underline') back = `<rect x="${left.toFixed(1)}" y="${(ln.base + px * 0.12).toFixed(1)}" width="${wd.ww.toFixed(1)}" height="${(px * 0.12).toFixed(1)}" rx="${(px * 0.06).toFixed(1)}" fill="${L.highlight.color}"/>`;
        const col = hl ? (L.highlight.style === 'color' ? L.highlight.color : (L.highlight.textColor || paint)) : paint;
        if (L.split === 'letters' && lay.pathable(wd.w)) {
          if (back) out += back;
          for (const g of glyphs(F(L).lat, wd.w, left, ln.base, px, { track: L.track })) out += wrapUnit(`<path d="${g.d}" fill="${col}"${strokeA}/>`, (g.x0 + g.x1) / 2, ln.base - px * 0.35);
        } else out += wrapUnit(back + drawPiece(wd.w, left, ln.base, col, left, wd.ww), left + wd.ww / 2, ln.base - px * 0.35);
      }
    }
    return out;
  };

  layers.forEach((L, i) => { L._i = i; });
  const staticDefs = layers.map((L) => {
    let d = '';
    if (L.gradient) d += fillDef(`g${L._i}`, L.gradient, L.gradientAngle);
    if (L.bg?.gradient?.length >= 2) d += fillDef(`bg${L._i}`, L.bg.gradient, 0);
    if (L.shadow) d += `<filter id="sh${L._i}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="${(M * 0.006).toFixed(1)}" stdDeviation="${(M * 0.01).toFixed(1)}" flood-color="${L.shadow}" flood-opacity="0.55"/></filter>`;
    if (L.glow) d += `<filter id="gl${L._i}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur in="SourceAlpha" stdDeviation="${(M * 0.012).toFixed(1)}" result="b"/><feFlood flood-color="${L.glow}" flood-opacity="0.9"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
    return d;
  }).join('');

  // حدود العنصر (للكشف التدريجي) بإحداثيات محلية حوالين (0,0)
  const bbox = (L) => {
    if (L.shape === 'text') { const lay = L._lay; const padX = L.bg ? L.bg.padX * lay.px : lay.px * 0.2; const padY = L.bg ? L.bg.padY * lay.px : lay.px * 0.3; return [-lay.maxLine / 2 - padX, -lay.blockH / 2 - padY, lay.maxLine + 2 * padX, lay.blockH + 2 * padY]; }
    if (L.shape === 'rect') return [-L.w * W / 2, -L.h * H / 2, L.w * W, L.h * H];
    if (L.shape === 'circle' || L.shape === 'ring') { const r = L.r * M + (L.width || 0) * M; return [-r, -r, 2 * r, 2 * r]; }
    if (L.shape === 'path') { const s = L.size * M; return [-s / 2, -s / 2, s, s]; }
    if (L.shape === 'image') { const h = L.h * H; const w = h * (ctx.productW || 1) / (ctx.productH || 1); return [-w / 2, -h / 2, w, h]; }
    const s = L.spread * M * 1.2 || M * 0.2; return [-s, -s, 2 * s, 2 * s];
  };
  const clipFor = (L, st) => {
    if (st.reveal >= 0.999) return ['', ''];
    const [bx, by, bw, bh] = bbox(L); const r = clamp(st.reveal, 0, 1); let x = bx, y = by, w = bw, h = bh;
    if (L.revealDir === 'left') w = bw * r; else if (L.revealDir === 'right') { w = bw * r; x = bx + bw - w; } else if (L.revealDir === 'down') h = bh * r; else if (L.revealDir === 'up') { h = bh * r; y = by + bh - h; } else { w = bw * r; x = bx + (bw - w) / 2; }
    return [`<clipPath id="cl${L._i}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}" height="${h.toFixed(1)}"/></clipPath>`, ` clip-path="url(#cl${L._i})"`];
  };
  const paintOf = (L, st) => (L.gradient ? `url(#g${L._i})` : (st.color || L.color));
  const strokeOf = (L) => (L.stroke ? ` stroke="${L.stroke}" stroke-width="${(L.strokeWidth * M).toFixed(1)}"` : '');

  const body = (L, st, t) => {
    switch (L.shape) {
      case 'text': {
        const lay = L._lay; let bg = '';
        if (L.bg) { const [bx, by, bw, bh] = bbox(L); bg = `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(L.bg.radius * lay.px).toFixed(1)}" fill="${L.bg.gradient?.length >= 2 ? `url(#bg${L._i})` : L.bg.color}" fill-opacity="${L.bg.opacity}"${L.bg.stroke ? ` stroke="${L.bg.stroke}" stroke-width="${(lay.px * 0.05).toFixed(1)}"` : ''}/>`; }
        return bg + textUnits(L, t, st);
      }
      case 'rect': return `<rect x="${(-L.w * W / 2).toFixed(1)}" y="${(-L.h * H / 2).toFixed(1)}" width="${(L.w * W).toFixed(1)}" height="${(L.h * H).toFixed(1)}" rx="${(L.radius * M).toFixed(1)}" fill="${paintOf(L, st)}"${strokeOf(L)}/>`;
      case 'circle': return `<circle r="${(L.r * M).toFixed(1)}" fill="${paintOf(L, st)}"${strokeOf(L)}/>`;
      case 'ring': {
        const r = L.r * M; const c = 2 * Math.PI * r; const dr = clamp(st.draw, 0, 1);
        const dash = L.dash ? `${(L.dash * M).toFixed(1)} ${(L.dash * M).toFixed(1)}` : `${(c * dr).toFixed(1)} ${(c + 1).toFixed(1)}`;
        return `<circle r="${r.toFixed(1)}" fill="none" stroke="${paintOf(L, st)}" stroke-width="${(L.width * M).toFixed(1)}" stroke-linecap="round" stroke-dasharray="${dash}" transform="rotate(-90)"/>`;
      }
      case 'path': {
        const s = (L.size * M) / 100; const sw = L.stroke ? (L.strokeWidth * M) / s : 0;
        const len = L._len || (L._len = pathLength(L.d)); const dr = clamp(st.draw, 0, 1);
        const drawA = dr < 0.999 ? ` stroke-dasharray="${len.toFixed(1)} ${(len + 1).toFixed(1)}" stroke-dashoffset="${(len * (1 - dr)).toFixed(1)}"` : '';
        return `<g transform="scale(${s.toFixed(4)}) translate(-50 -50)"><path d="${L.d}" fill="${L.fill && dr >= 0.999 ? paintOf(L, st) : 'none'}"${L.stroke || !L.fill ? ` stroke="${L.stroke || paintOf(L, st)}" stroke-width="${(sw || 2).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"` : ''}${drawA}/></g>`;
      }
      case 'image': {
        if (!ctx.productUri) return '';
        const [bx, by, bw, bh] = bbox(L);
        return `<image href="${ctx.productUri}" x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
      }
      case 'sparkles': {
        const life = Math.max(0.05, L.end - L.start); const p = clamp((t - L.start) / life, 0, 1); let s = ''; let seed = L.seed * 9301 + 49297;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let k = 0; k < L.count; k++) {
          const ang = rnd() * Math.PI * 2; const dist = (0.3 + 0.7 * rnd()) * L.spread * M; const delay = rnd() * 0.35; const q = clamp((p - delay) / (1 - delay), 0, 1);
          if (q <= 0) continue;
          const e = EASE.expo(q); const x = Math.cos(ang) * dist * e, y = Math.sin(ang) * dist * e; const sz = L.size * M * (0.6 + 0.8 * rnd()) * (1 - q * 0.6); const op = q < 0.15 ? q / 0.15 : 1 - (q - 0.15) / 0.85;
          s += `<path d="M0 ${-sz} Q0 0 ${sz} 0 Q0 0 0 ${sz} Q0 0 ${-sz} 0 Q0 0 0 ${-sz}Z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang * 57.3 + q * 90).toFixed(0)})" fill="${paintOf(L, st)}" opacity="${clamp(op, 0, 1).toFixed(2)}"/>`;
        }
        return s;
      }
      default: return '';
    }
  };

  return (t) => {
    let defs = staticDefs; let out = '';
    for (const L of layers) {
      if (t < L.start || t > L.end) continue;
      const st = stateAt(L, t); const op = st.opacity * L.opacityMul; if (op <= 0.003) continue;
      if (L.shape === 'line') {
        const x1 = st.x * W, y1 = st.y * H, x2 = L.x2 * W, y2 = L.y2 * H; const len = Math.hypot(x2 - x1, y2 - y1); const dr = clamp(st.draw, 0, 1);
        const ex = x1 + (x2 - x1) * dr, ey = y1 + (y2 - y1) * dr; const sw = L.width * M;
        let s = `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="${paintOf(L, st)}" stroke-width="${sw.toFixed(1)}" stroke-linecap="${L.cap}"${L.dash ? ` stroke-dasharray="${(L.dash * M).toFixed(1)} ${(L.dash * M).toFixed(1)}"` : ''}/>`;
        if (L.arrow && dr > 0.2 && len > 1) { const a = Math.atan2(y2 - y1, x2 - x1); const h = sw * 3.2; s += `<path d="M${ex.toFixed(1)} ${ey.toFixed(1)} L${(ex - h * Math.cos(a - 0.45)).toFixed(1)} ${(ey - h * Math.sin(a - 0.45)).toFixed(1)} L${(ex - h * Math.cos(a + 0.45)).toFixed(1)} ${(ey - h * Math.sin(a + 0.45)).toFixed(1)}Z" fill="${paintOf(L, st)}"/>`; }
        out += `<g opacity="${op.toFixed(3)}"${L.shadow ? ` filter="url(#sh${L._i})"` : L.glow ? ` filter="url(#gl${L._i})"` : ''}>${s}</g>`;
        continue;
      }
      const [cdef, cattr] = clipFor(L, st); defs += cdef;
      let inner = body(L, st, t); if (!inner) continue;
      if (cattr) inner = `<g${cattr}>${inner}</g>`;
      const fx = L.glow ? ` filter="url(#gl${L._i})"` : L.shadow ? ` filter="url(#sh${L._i})"` : '';
      let g = `<g transform="translate(${(st.x * W).toFixed(1)} ${(st.y * H).toFixed(1)}) rotate(${st.rotate.toFixed(2)}) scale(${(st.scale * st.sx).toFixed(4)} ${(st.scale * st.sy).toFixed(4)})"${fx}>${inner}</g>`;
      if (st.blur > 0.3) { defs += `<filter id="lb${L._i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${st.blur.toFixed(1)}"/></filter>`; g = `<g filter="url(#lb${L._i})">${g}</g>`; }
      out += `<g opacity="${op.toFixed(3)}"${L.blend ? ` style="mix-blend-mode:${L.blend}"` : ''}>${g}</g>`;
    }
    return out ? `<defs>${defs}</defs>${out}` : '';
  };
}

/** وصف لغة التصميم لـ Opus (بيتحط في البرومبت) */
export const DESIGN_DOC = `CUSTOM MOTION DESIGN ("type":"design") — YOU are the motion designer. Nothing is a template: you compose every element from layers and animate them with keyframes, choosing fonts, colours, sizes, positions, timing, easing and effects that fit THIS product, THIS moment and the brand.
{ "type":"design", "start":s, "end":s, "why":"what this element does for the ad", "sfx":[{"at":s,"type":SFX,"vol":0..1}] , "layers":[ LAYER, … ] }   (layers draw in order: first = back)
LAYER common fields: "shape", "start"/"end" (seconds relative to the element, optional), "keys":[{"t":s, "x":0..1, "y":0..1 (position of the layer centre as a fraction of frame width/height), "scale", "sx","sy" (stretch), "rotate" (deg), "opacity" 0..1, "blur" px, "reveal" 0..1 (wipe-in mask), "draw" 0..1 (stroke drawing for line/ring/path), "color" "#RRGGBB", "ease": linear|in|out|inOut|back|elastic|bounce|expo (curve INTO this key)}] — values carry over from the previous key; "ease" default for the layer; "revealDir": left|right|up|down|center; "color"; "gradient":["#..","#.."] + "gradientAngle"; "stroke" + "strokeWidth" (fraction of frame); "shadow":"#000000"; "glow":"#RRGGBB"; "float":{"amp":0.006,"speed":0.6,"rotate":2} (idle motion); "opacity" multiplier; "blend": screen|multiply|overlay.
SHAPES:
- "text": "text" (\\n for new line), "font": ${Object.entries(FONT_CHOICES).map(([k, f]) => `${k} (${f.desc})`).join('; ')}; "size" (fraction of the short side, 0.03 small … 0.2 huge); "align": left|center|right; "letterSpacing" (Latin, fraction of size); "lineHeight"; "maxWidth" (fraction of width, auto-wraps); "split": none|lines|words|letters (letters = Latin only) + "stagger" s + "unitDur" s + "unitEase" + "unitFrom":{"dx","dy" (in font sizes),"opacity","scale","rotate","blur"} = how each word/letter enters; "bg":{"color","opacity","radius","padX","padY","stroke","gradient"}; "highlight":{"words":[..],"color","style":"color|marker|underline","textColor"}; "count":{"from","to","decimals","prefix","suffix","dur","ease"} = animated counter (text ignored).
- "rect": "w","h" (fractions of frame width/height), "radius" (fraction of short side).  - "circle": "r".  - "ring": "r","width","dash" (animate "draw").
- "line": from the layer position (x,y) to "x2","y2" (fractions of frame), "width", "arrow":true, "dash" — animate "draw" to make it grow (pointers, underlines, frames).
- "path": "d" (SVG path in a 0..100 box, M/L/H/V/C/S/Q/T/Z only), "size" (fraction of short side), "fill":false for outline only — icons, arrows, swooshes, hand-drawn circles, stars; animate "draw".
- "image": "src":"product" (the product cut-out), "h" (fraction of frame height).
- "sparkles": "count","spread","size","seed" — a particle burst over the layer's life.
Coordinates: x=0 left, x=1 right, y=0 top, y=1 bottom. Keep text inside 0.06..0.94 of the frame (safe area) and away from the product and faces you see in the frames.`;
