// ── design.js ── نظام التصميم للفيديو المرسوم بالكود: ألوان، خطوط، حركة (springs)، نص، أيقونات
import { esc, wrapText, textWidth, isRtlLang } from '../documentary/textutil.js';
import { clamp01, lerp, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, easeOutExpo, seg } from '../documentary/easing.js';

export { esc, wrapText, textWidth, clamp01, lerp, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, easeOutExpo, seg };

// ── ألوان ──
export const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return [255, 255, 255]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const toHex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); };
export const lighten = (h, k) => mix(h, '#ffffff', k);
export const darken = (h, k) => mix(h, '#000000', k);
export const rgba = (h, a) => { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${clamp01(a).toFixed(3)})`; };

export const PALETTES = {
  neon: { dark: true, bg: ['#050816', '#0b1230', '#1b0b3d'], a1: '#22d3ee', a2: '#e879f9', a3: '#facc15', text: '#ffffff', muted: '#9fb0d8' },
  sunset: { dark: true, bg: ['#12061f', '#2a0f3d', '#4d1a45'], a1: '#fb7185', a2: '#fbbf24', a3: '#a78bfa', text: '#fff7f2', muted: '#d9b8c8' },
  emerald: { dark: true, bg: ['#03120d', '#062a20', '#0c4030'], a1: '#34d399', a2: '#fcd34d', a3: '#38bdf8', text: '#f2fff9', muted: '#9fd6c0' },
  royal: { dark: true, bg: ['#0a0a1f', '#14124a', '#2a1f78'], a1: '#818cf8', a2: '#fbbf24', a3: '#f472b6', text: '#ffffff', muted: '#b4b4e6' },
  crimson: { dark: true, bg: ['#0a0a0d', '#1a0c14', '#33101f'], a1: '#f43f5e', a2: '#f8fafc', a3: '#fb923c', text: '#ffffff', muted: '#c9a8b2' },
  ocean: { dark: true, bg: ['#021526', '#033260', '#07589a'], a1: '#38bdf8', a2: '#fde047', a3: '#5eead4', text: '#ffffff', muted: '#a8cdee' },
  mono: { dark: true, bg: ['#050505', '#101010', '#202020'], a1: '#ffffff', a2: '#ef4444', a3: '#a3a3a3', text: '#ffffff', muted: '#a3a3a3' },
  daylight: { dark: false, bg: ['#f8fafc', '#e6edfd', '#d4e2ff'], a1: '#2563eb', a2: '#f97316', a3: '#16a34a', text: '#0f172a', muted: '#475569' },
  // ألوان أنماط الكارتون (فاتحة ومبهجة) وفوكس (ورق + ماركر)
  toon: { dark: false, bg: ['#bfe6ff', '#d9f0ff', '#fff3d6'], a1: '#ff6b6b', a2: '#ffc833', a3: '#3bb273', text: '#1f2a44', muted: '#4a5d80' },
  candy: { dark: false, bg: ['#ffd6ec', '#ffe9f4', '#e9dcff'], a1: '#ff4fa3', a2: '#8b5cf6', a3: '#22c1c3', text: '#2a1747', muted: '#6b5a8a' },
  mint: { dark: false, bg: ['#c9f2e3', '#e3faf1', '#fff6d9'], a1: '#10b981', a2: '#f97316', a3: '#3b82f6', text: '#12332a', muted: '#456b5e' },
  sunny: { dark: false, bg: ['#ffe29a', '#ffedc0', '#ffd0a6'], a1: '#ef4444', a2: '#2563eb', a3: '#16a34a', text: '#3a2108', muted: '#7a5a34' },
  vox: { dark: false, bg: ['#f3eee2', '#ece5d3', '#e1d7bd'], a1: '#e63946', a2: '#f2a900', a3: '#1d3557', text: '#16161a', muted: '#5f594b', mark: '#ffd23f', emph: '#e63946' },
  voxdark: { dark: true, bg: ['#0d0d10', '#17171b', '#222227'], a1: '#ffd23f', a2: '#e63946', a3: '#8ecae6', text: '#ffffff', muted: '#a9a9b3', mark: '#ffd23f' },
};
// باليتات كل نظام (أكتر من واحدة عشان فيديوهين بنفس النظام ميطلعوش متطابقين)
export const STYLE_PALETTES = {
  flatSun: { style: 'flat', dark: false, bg: ['#ffd23f', '#ffc21a', '#ffe48a'], a1: '#ff4d6d', a2: '#2b59c3', a3: '#06d6a0', text: '#111111', muted: '#3d3d3d', ink: '#111111', card: '#ffffff', emph: '#ff4d6d' },
  flatMint: { style: 'flat', dark: false, bg: ['#2ec4b6', '#25b3a6', '#7fe0d6'], a1: '#ff9f1c', a2: '#e71d36', a3: '#ffffff', text: '#0b1f1d', muted: '#163d39', ink: '#0b1f1d', card: '#fdfffc', emph: '#e71d36' },
  flatCoral: { style: 'flat', dark: false, bg: ['#ff6b6b', '#f25c5c', '#ffa3a3'], a1: '#ffe66d', a2: '#1a535c', a3: '#4ecdc4', text: '#16161a', muted: '#3b2a2a', ink: '#16161a', card: '#ffffff', emph: '#1a535c' },
  swiss: { style: 'swiss', dark: false, bg: ['#f7f7f2', '#f2f2ec', '#ebebe3'], a1: '#e4002b', a2: '#111111', a3: '#0057b8', text: '#111111', muted: '#55554f', ink: '#111111', card: '#ffffff', emph: '#e4002b' },
  swissBlue: { style: 'swiss', dark: false, bg: ['#f5f7fa', '#eef2f7', '#e6ebf2'], a1: '#0047ff', a2: '#111111', a3: '#ff5a1f', text: '#0d1117', muted: '#4b5563', ink: '#0d1117', card: '#ffffff', emph: '#0047ff' },
  blueprint: { style: 'blueprint', dark: true, bg: ['#0a2a66', '#0d3a8c', '#1150b8'], a1: '#ffffff', a2: '#ffd166', a3: '#7fd1ff', text: '#ffffff', muted: '#b9d3ff', ink: '#ffffff', card: 'rgba(255,255,255,0.06)', emph: '#ffd166' },
  pop: { style: 'pop', dark: false, bg: ['#fff1d6', '#ffe8bf', '#ffd9a0'], a1: '#e63946', a2: '#1d4ed8', a3: '#ffb703', text: '#14110f', muted: '#4a3f35', ink: '#14110f', card: '#ffffff', emph: '#e63946' },
  popPink: { style: 'pop', dark: false, bg: ['#ffd6e8', '#ffc4dd', '#ffadd0'], a1: '#7b2cbf', a2: '#ff006e', a3: '#3a86ff', text: '#1a0b14', muted: '#4d2a3d', ink: '#1a0b14', card: '#ffffff', emph: '#ff006e' },
  pastel: { style: 'pastel', dark: false, bg: ['#e9e4ff', '#fde2f3', '#d9f2ff'], a1: '#7c5cff', a2: '#ff7ab6', a3: '#3cc6ff', text: '#1e1b3a', muted: '#5b577e', ink: '#1e1b3a', card: 'rgba(255,255,255,0.78)', emph: '#7c5cff' },
  pastelMint: { style: 'pastel', dark: false, bg: ['#d8fff1', '#e8f7ff', '#fff3d9'], a1: '#00b894', a2: '#6c5ce7', a3: '#fd9644', text: '#13312a', muted: '#4f6f66', ink: '#13312a', card: 'rgba(255,255,255,0.8)', emph: '#6c5ce7' },
};
Object.assign(PALETTES, STYLE_PALETTES);
export const MOTION_PALETTES = ['neon', 'sunset', 'emerald', 'royal', 'crimson', 'ocean', 'mono', 'daylight'];
export const TOON_PALETTES = ['toon', 'candy', 'mint', 'sunny'];
export const VOX_PALETTES = ['vox', 'voxdark'];
export const PALETTE_NAMES = MOTION_PALETTES;
export const ALL_PALETTE_NAMES = Object.keys(PALETTES);
const MOOD_PALETTE = { epic: 'royal', tech: 'neon', business: 'ocean', nature: 'emerald', energetic: 'sunset', serious: 'crimson', clean: 'daylight', minimal: 'mono' };
export function pickPalette(name, mood) {
  const key = PALETTES[name] ? name : (MOOD_PALETTE[mood] || 'neon');
  return { name: key, ...PALETTES[key] };
}

// ── سياق الرسم ──
export function makeCtx({ w, h, palette, lang = 'en', id = 'a' }) {
  const rtl = isRtlLang(lang);
  return {
    w, h, s: Math.min(w, h) / 1080, portrait: h > w, pal: palette, lang, rtl, id,
    ff: rtl ? "'Noto Sans Arabic', 'Noto Kufi Arabic', 'Noto Naskh Arabic', 'DejaVu Sans', sans-serif" : "'Noto Sans', 'DejaVu Sans', sans-serif",
  };
}
export const uid = (c, name) => `${c.id}_${name}`;

// ── حركة ──
/** spring: يطلع لـ1 بتجاوز بسيط (overshoot) — الزمن بالثواني من بداية الحركة */
export const spring = (t, { k = 9, d = 5.2 } = {}) => (t <= 0 ? 0 : 1 - Math.exp(-d * t) * Math.cos(k * t));
export const popIn = (t, dur = 0.5) => spring(t / dur * 0.5, { k: 11, d: 6 });
export const fade = (t, a, b) => clamp01((t - a) / Math.max(1e-6, b - a));
export const rand = (i, k = 0) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
export const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '0');
export const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2) : '0');

// ── نص ──
/**
 * نص SVG: size بالـpx بعد المقياس (مش مضروب في s)، glow = خط عريض شفاف تحت النص (تأثير توهّج من غير فلاتر)
 */
export function txt(c, str, x, y, size, o = {}) {
  let { weight = 800, fill = c.pal.text, anchor = 'middle', opacity = 1, glow = null, glowW = 0.085, stroke = null, strokeW = 0, spacing = null, italic = false, transform = null, rtl = c.rtl } = o;
  if (!str && str !== 0) return '';
  // العربي: الخط الأسود/الـ900 بيعرّض الحروف أكتر من القياس (Bold) وبيلزّق الكلمات، والتباعد بين الحروف بيفصل الحروف المتصلة، والحواف السميكة بتطمس النقط
  if (rtl) { weight = Math.min(weight, 700); spacing = null; glowW *= 0.5; strokeW *= 0.55; }
  // شبكة أمان: أي سطر طويل بيتصغّر عشان ميخرجش برا الإطار
  if (c.w > 400 && size > 20 && anchor === 'middle') { const est = textWidth(String(str), size, weight >= 700); const lim = c.w * 0.94; if (est > lim) size *= lim / est; }
  // الاتجاه rtl بيقلب معنى start/end في SVG — بنثبّت المعنى الفيزيائي (start = الحافة الشمال، end = الحافة اليمين) لكل المشاهد
  const anch = rtl && anchor !== 'middle' ? (anchor === 'start' ? 'end' : 'start') : anchor;
  const base = `x="${f1(x)}" y="${f1(y)}" font-family="${c.ff}" font-size="${f1(size)}" font-weight="${weight}" text-anchor="${anch}"${rtl ? ' direction="rtl" unicode-bidi="embed"' : ''}${spacing != null ? ` letter-spacing="${f1(spacing)}"` : ''}${italic ? ' font-style="italic"' : ''}`;
  const tf = transform ? ` transform="${transform}"` : '';
  let out = '';
  if (glow) out += `<text ${base} fill="none" stroke="${glow}" stroke-width="${f1(size * glowW)}" stroke-linejoin="round" opacity="${f2(opacity * 0.42)}"${tf}>${esc(str)}</text>`;
  out += `<text ${base} fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${f1(strokeW)}" paint-order="stroke"` : ''} opacity="${f2(opacity)}"${tf}>${esc(str)}</text>`;
  return out;
}
/** أنسب حجم خط لنص (عدد سطور محدود) داخل صندوق */
export function fitText(text, maxW, maxH, { max = 200, min = 36, lineGap = 1.18, bold = true, maxLines = 4 } = {}) {
  for (let size = max; size >= min; size -= 4) {
    const lines = wrapText(text, maxW, size, { bold, maxLines: 99 });
    if (lines.length <= maxLines && lines.length * size * lineGap <= maxH) return { size, lines };
  }
  return { size: min, lines: wrapText(text, maxW, min, { bold, maxLines }) };
}

// ── أيقونات (صندوق 100×100، خطوط مستديرة) — اسم → SVG داخلي ──
const I = (d) => d;
const ICONS = {
  rocket: I('<path d="M50 8c14 10 22 26 20 46l-12 12H42L30 54C28 34 36 18 50 8z"/><circle cx="50" cy="38" r="7"/><path d="M30 54l-12 8 4-16M70 54l12 8-4-16M42 66l-4 14 12-8 12 8-4-14"/>'),
  bulb: I('<path d="M50 10a26 26 0 0 0-14 48c4 3 5 6 5 10h18c0-4 1-7 5-10A26 26 0 0 0 50 10z"/><path d="M42 76h16M44 86h12"/>'),
  chart: I('<path d="M12 84h78M20 70l20-22 14 12 28-34"/><path d="M70 26h16v16"/>'),
  bars: I('<path d="M14 86h74"/><rect x="20" y="52" width="14" height="30" rx="3"/><rect x="43" y="34" width="14" height="48" rx="3"/><rect x="66" y="16" width="14" height="66" rx="3"/>'),
  shield: I('<path d="M50 8l32 12v26c0 22-14 38-32 46C32 84 18 68 18 46V20z"/><path d="M36 48l10 10 20-22"/>'),
  heart: I('<path d="M50 86C20 64 10 46 10 32a20 20 0 0 1 40-4 20 20 0 0 1 40 4c0 14-10 32-40 54z"/>'),
  brain: I('<path d="M38 18a14 14 0 0 0-14 14 12 12 0 0 0-6 20 12 12 0 0 0 8 18 14 14 0 0 0 24 6V22a10 10 0 0 0-12-4zM62 18a14 14 0 0 1 14 14 12 12 0 0 1 6 20 12 12 0 0 1-8 18 14 14 0 0 1-24 6V22a10 10 0 0 1 12-4z"/>'),
  globe: I('<circle cx="50" cy="50" r="38"/><path d="M12 50h76M50 12c-18 20-18 56 0 76M50 12c18 20 18 56 0 76"/>'),
  clock: I('<circle cx="50" cy="50" r="38"/><path d="M50 26v26l18 10"/>'),
  coin: I('<circle cx="50" cy="50" r="38"/><path d="M58 34c-2-4-6-6-10-6-6 0-10 4-10 8s4 7 12 9 12 5 12 10-5 8-11 8c-5 0-9-3-11-7M50 22v6M50 72v6"/>'),
  lock: I('<rect x="22" y="44" width="56" height="42" rx="8"/><path d="M34 44V32a16 16 0 0 1 32 0v12M50 58v12"/>'),
  star: I('<path d="M50 10l12 26 28 4-20 20 5 28-25-14-25 14 5-28L10 40l28-4z"/>'),
  check: I('<circle cx="50" cy="50" r="38"/><path d="M32 52l12 12 24-26"/>'),
  cloud: I('<path d="M28 72a18 18 0 0 1-2-36 24 24 0 0 1 46 6 15 15 0 0 1 0 30z"/>'),
  phone: I('<rect x="28" y="8" width="44" height="84" rx="9"/><path d="M44 18h12M46 82h8"/>'),
  laptop: I('<rect x="18" y="22" width="64" height="44" rx="5"/><path d="M8 78h84l-6 8H14z"/>'),
  gear: I('<circle cx="50" cy="50" r="14"/><path d="M50 10v14M50 76v14M10 50h14M76 50h14M22 22l10 10M68 68l10 10M78 22L68 32M32 68L22 78"/><circle cx="50" cy="50" r="28"/>'),
  user: I('<circle cx="50" cy="32" r="18"/><path d="M14 90c0-20 16-34 36-34s36 14 36 34"/>'),
  users: I('<circle cx="36" cy="32" r="14"/><circle cx="68" cy="36" r="11"/><path d="M8 86c0-16 12-28 28-28s28 12 28 28M62 60c16 0 28 10 30 26"/>'),
  target: I('<circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="22"/><circle cx="50" cy="50" r="6"/><path d="M50 4v14M50 82v14M4 50h14M82 50h14"/>'),
  flag: I('<path d="M24 90V12M24 14h54l-12 18 12 18H24"/>'),
  book: I('<path d="M50 24c-10-8-26-10-38-6v60c12-4 28-2 38 6 10-8 26-10 38-6V18c-12-4-28-2-38 6zM50 24v60"/>'),
  camera: I('<rect x="8" y="26" width="84" height="56" rx="9"/><circle cx="50" cy="54" r="16"/><path d="M34 26l6-12h20l6 12"/>'),
  play: I('<circle cx="50" cy="50" r="38"/><path d="M42 33l26 17-26 17z"/>'),
  mic: I('<rect x="36" y="8" width="28" height="48" rx="14"/><path d="M22 46c0 18 12 30 28 30s28-12 28-30M50 76v14M38 90h24"/>'),
  wifi: I('<path d="M10 38c22-20 58-20 80 0M24 54c14-12 38-12 52 0M38 70c8-6 16-6 24 0"/><circle cx="50" cy="84" r="4"/>'),
  fire: I('<path d="M50 8c4 16 24 26 24 52a24 24 0 0 1-48 0c0-12 6-18 12-24 2 8 6 12 10 12 0-14-4-24 2-40z"/>'),
  leaf: I('<path d="M86 14C40 12 14 36 14 66c0 8 4 16 8 20 4-26 22-38 44-44-20 10-30 22-34 38 40 4 54-30 54-66z"/>'),
  drop: I('<path d="M50 8C32 32 20 46 20 62a30 30 0 0 0 60 0C80 46 68 32 50 8z"/>'),
  bolt: I('<path d="M56 6L22 54h24l-6 40 38-52H52z"/>'),
  trophy: I('<path d="M28 12h44v26a22 22 0 0 1-44 0zM28 20H12c0 16 8 24 18 26M72 20h16c0 16-8 24-18 26M50 60v18M32 90h36M38 78h24"/>'),
  search: I('<circle cx="42" cy="42" r="28"/><path d="M62 62l28 28"/>'),
  mail: I('<rect x="8" y="22" width="84" height="58" rx="8"/><path d="M10 28l40 30 40-30"/>'),
  home: I('<path d="M10 48L50 14l40 34M20 42v44h60V42M40 86V60h20v26"/>'),
  car: I('<path d="M12 66l8-24c2-6 6-8 12-8h36c6 0 10 2 12 8l8 24v14H12zM12 66h76"/><circle cx="30" cy="80" r="8"/><circle cx="70" cy="80" r="8"/>'),
  plane: I('<path d="M92 14L8 44l30 12 12 30zM38 56l54-42"/>'),
  key: I('<circle cx="32" cy="50" r="18"/><path d="M50 50h42M76 50v14M88 50v10"/>'),
  gift: I('<rect x="12" y="38" width="76" height="52" rx="4"/><path d="M8 26h84v12H8zM50 26v64M50 26c-12-16-30-14-28-4 2 8 20 4 28 4zM50 26c12-16 30-14 28-4-2 8-20 4-28 4z"/>'),
  cart: I('<path d="M6 14h14l12 50h48l8-34H26"/><circle cx="38" cy="82" r="6"/><circle cx="72" cy="82" r="6"/>'),
  building: I('<rect x="22" y="10" width="56" height="80" rx="3"/><path d="M34 26h8M58 26h8M34 42h8M58 42h8M34 58h8M58 58h8M42 90V74h16v16"/>'),
  warning: I('<path d="M50 10L92 86H8z"/><path d="M50 38v24M50 74v4"/>'),
  question: I('<circle cx="50" cy="50" r="38"/><path d="M38 40a12 12 0 0 1 24 2c0 10-12 10-12 22M50 76v4"/>'),
  link: I('<path d="M42 58a16 16 0 0 0 22 0l16-16a16 16 0 0 0-22-22l-6 6M58 42a16 16 0 0 0-22 0L20 58a16 16 0 0 0 22 22l6-6"/>'),
  money: I('<rect x="8" y="26" width="84" height="48" rx="6"/><circle cx="50" cy="50" r="12"/><path d="M20 38v0M80 62v0"/>'),
  medal: I('<circle cx="50" cy="60" r="24"/><path d="M34 40L24 10h18l8 18M66 40l10-30H58l-8 18M50 48v24"/>'),
  sun: I('<circle cx="50" cy="50" r="18"/><path d="M50 8v12M50 80v12M8 50h12M80 50h12M20 20l8 8M72 72l8 8M80 20l-8 8M28 72l-8 8"/>'),
  moon: I('<path d="M70 12a38 38 0 1 0 18 56A32 32 0 0 1 70 12z"/>'),
  code: I('<path d="M34 28L12 50l22 22M66 28l22 22-22 22M56 18L44 82"/>'),
  database: I('<ellipse cx="50" cy="22" rx="32" ry="12"/><path d="M18 22v56c0 7 14 12 32 12s32-5 32-12V22M18 50c0 7 14 12 32 12s32-5 32-12"/>'),
  chat: I('<path d="M10 16h80v52H44L24 88V68H10z"/><path d="M28 36h44M28 50h28"/>'),
  eye: I('<path d="M6 50C20 28 36 20 50 20s30 8 44 30C80 72 64 80 50 80S20 72 6 50z"/><circle cx="50" cy="50" r="14"/>'),
  pin: I('<path d="M50 90C30 62 22 50 22 36a28 28 0 0 1 56 0c0 14-8 26-28 54z"/><circle cx="50" cy="36" r="10"/>'),
  battery: I('<rect x="8" y="30" width="76" height="40" rx="7"/><path d="M90 42v16M18 40h20v20H18z"/>'),
  atom: I('<circle cx="50" cy="50" r="6"/><ellipse cx="50" cy="50" rx="40" ry="16"/><ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(120 50 50)"/>'),
};
export const ICON_NAMES = Object.keys(ICONS);
const ICON_ALIAS = { growth: 'chart', money: 'coin', idea: 'bulb', speed: 'bolt', secure: 'shield', security: 'shield', time: 'clock', world: 'globe', team: 'users', person: 'user', goal: 'target', win: 'trophy', video: 'play', audio: 'mic', internet: 'wifi', ai: 'brain', data: 'database', app: 'phone', computer: 'laptop', energy: 'bolt', health: 'heart', email: 'mail', location: 'pin', science: 'atom', search: 'search', learn: 'book', education: 'book', shopping: 'cart', travel: 'plane', finance: 'coin', warning: 'warning', danger: 'warning', success: 'check', quality: 'medal', night: 'moon', day: 'sun' };
export const resolveIcon = (name, fallbackIdx = 0) => {
  const k = String(name || '').toLowerCase().trim();
  if (ICONS[k]) return k;
  if (ICON_ALIAS[k]) return ICON_ALIAS[k];
  return ICON_NAMES[fallbackIdx % ICON_NAMES.length];
};
/** أيقونة مرسومة (stroke) في مربع size متمركزة على (cx,cy) */
export function icon(c, name, cx, cy, size, { color = c.pal.a1, sw = 5.5, opacity = 1, rot = 0, fill = 'none' } = {}) {
  const body = ICONS[resolveIcon(name)] || ICONS.star;
  const k = size / 100;
  return `<g transform="translate(${f1(cx - size / 2)} ${f1(cy - size / 2)}) scale(${f2(k)})${rot ? ` rotate(${f1(rot)} 50 50)` : ''}" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" opacity="${f2(opacity)}">${body}</g>`;
}
