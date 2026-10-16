// ── objects3d.js ── أشكال "3D" ناعمة مرسومة بالكود (قطعة بازل، نجمة لمعة، مثلث تحذير بارز، برق، قلب، عملة...)
// زي الأشكال اللي في فيديوهات الشرح التحريرية: سُمك (extrusion) + تدرّج لوني + لمعة + ظل ناعم — من غير أي صور
import { f1, f2, uid, mix, darken, lighten, clamp01, spring } from './design.js';

// كل شكل في مربع 100×100 (مركزه 50,50)
const SHAPES = {
  puzzle: 'M20 30h18c-4-6-4-16 8-17s14 10 8 17h18v18c6-4 16-4 17 8s-10 14-17 8v18H54c4 6 4 16-8 17s-14-10-8-17H20V66c-6 4-16 4-17-8s10-14 17-8z',
  sparkle: 'M50 2C54 34 66 46 98 50C66 54 54 66 50 98C46 66 34 54 2 50C34 46 46 34 50 2Z',
  warning: 'M50 6C54 6 57 8 59 12L95 78C99 86 94 94 85 94H15C6 94 1 86 5 78L41 12C43 8 46 6 50 6ZM50 30L22 80H78Z',
  bolt: 'M58 2L14 58H44L36 98L86 38H54Z',
  heart: 'M50 92C18 70 4 52 4 34C4 18 16 8 30 8C40 8 46 14 50 20C54 14 60 8 70 8C84 8 96 18 96 34C96 52 82 70 50 92Z',
  star: 'M50 4L62 36L96 37L69 58L79 92L50 72L21 92L31 58L4 37L38 36Z',
  arrow: 'M14 74L56 32H34V16H84V66H68V44L26 86Z',
  coin: 'M50 4A46 46 0 1 1 49.9 4Z',
  check: 'M50 4A46 46 0 1 1 49.9 4ZM28 50L22 57L42 76L78 38L71 31L42 61Z',
  cross: 'M50 4A46 46 0 1 1 49.9 4ZM33 26L26 33L43 50L26 67L33 74L50 57L67 74L74 67L57 50L74 33L67 26L50 43Z',
  target: 'M50 4A46 46 0 1 1 49.9 4ZM50 20A30 30 0 1 0 50.1 20ZM50 34A16 16 0 1 1 49.9 34Z',
  bulb: 'M50 4C28 4 14 20 14 38C14 52 22 60 30 68V80H70V68C78 60 86 52 86 38C86 20 72 4 50 4ZM34 86H66V96H34Z',
  question: 'M50 4A46 46 0 1 1 49.9 4ZM50 20C38 20 30 27 30 38H42C42 33 45 30 50 30C55 30 58 33 58 37C58 45 44 46 44 60V64H56V61C56 52 70 50 70 37C70 27 62 20 50 20ZM44 70H56V82H44Z',
  flame: 'M50 2C56 22 80 34 80 62C80 82 66 96 50 96C34 96 20 82 20 62C20 46 30 38 36 30C38 42 44 48 50 48C52 34 44 20 50 2Z',
};
export const OBJECT_NAMES = Object.keys(SHAPES);
const ALIAS = { puzzle: 'puzzle', piece: 'puzzle', sparkle: 'sparkle', shine: 'sparkle', magic: 'sparkle', warning: 'warning', risk: 'warning', danger: 'warning', alert: 'warning', energy: 'bolt', speed: 'bolt', love: 'heart', growth: 'arrow', up: 'arrow', money: 'coin', yes: 'check', no: 'cross', wrong: 'cross', goal: 'target', idea: 'bulb', why: 'question', hot: 'flame', fire: 'flame' };
export const resolveObject = (n) => { const k = String(n || '').toLowerCase().trim(); return SHAPES[k] ? k : ALIAS[k] || null; };

// تفاصيل محفورة فوق الوش (خطوط)
const DETAIL = { coin: 'M50 16A34 34 0 1 1 49.9 16ZM58 36C56 32 53 30 49 30C43 30 39 33 39 38C39 48 61 44 61 56C61 62 56 66 50 66C45 66 41 63 39 59M50 24V30M50 66V74', bulb: 'M40 80V70M60 80V70', heart: '' };

// ألوان افتراضية لكل شكل (لو مفيش لون من الباليت)
const BASE = { puzzle: '#7b2ff7', sparkle: '#c13cf0', warning: '#d9d6cf', bolt: '#ffc531', heart: '#f0405a', star: '#ffc531', arrow: '#22b573', coin: '#e6b23a', check: '#22b573', cross: '#e23b3b', target: '#e23b3b', bulb: '#ffd23f', question: '#3a6df0', flame: '#ff7a1a' };

/**
 * يرسم شكل 3D متمركز على (cx,cy) بحجم size. t = الزمن، at = وقت الظهور
 * بيدخل بنطّة spring وبيتهادى (float) بعدها
 */
export function object3d(c, name, cx, cy, size, { t = 1, at = 0, color = null, rot = -8, float = true, depth = 0.09 } = {}) {
  const key = resolveObject(name); if (!key) return '';
  const x = t - at; if (x <= 0) return '';
  const k = spring(x * 0.6, { k: 10, d: 5.5 }), op = clamp01(x / 0.18);
  const base = color || BASE[key];
  const fl = float ? Math.sin(t * 1.3 + cx * 0.01) * size * 0.03 : 0, wob = float ? Math.sin(t * 0.9 + cy * 0.01) * 3 : 0;
  const sc = (size / 100) * Math.max(0.01, k), id = uid(c, `o3${key}${Math.round(cx)}${Math.round(cy)}`);
  const P = SHAPES[key];
  const dk = darken(base, 0.38), lt = lighten(base, 0.38);
  const ex = Math.max(3, Math.round(depth * 100 / 1.6));
  let ext = '';
  for (let i = ex; i >= 1; i--) ext += `<path d="${P}" transform="translate(${f1(i * 0.9)} ${f1(i * 1.4)})" fill="${mix(dk, base, i / ex * 0.25)}"/>`;
  return `<g opacity="${f2(op)}" transform="translate(${f1(cx)} ${f1(cy + fl)}) rotate(${f1(rot + wob + (1 - Math.min(1, k)) * 25)}) scale(${f2(sc)}) translate(-50 -50)">`
    + `<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lt}"/><stop offset="0.55" stop-color="${base}"/><stop offset="1" stop-color="${darken(base, 0.18)}"/></linearGradient>`
    + `<filter id="${id}b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5"/></filter><clipPath id="${id}c"><path d="${P}"/></clipPath></defs>`
    + `<path d="${P}" transform="translate(9 18)" fill="#000" opacity="0.22" filter="url(#${id}b)" fill-rule="evenodd"/>`
    + `<g fill-rule="evenodd">${ext}<path d="${P}" fill="url(#${id}g)"/></g>`
    + `<g clip-path="url(#${id}c)"><ellipse cx="30" cy="22" rx="38" ry="20" fill="#fff" opacity="0.28" transform="rotate(-25 30 22)"/></g>`
    + `<path d="${P}" fill="none" stroke="${lt}" stroke-width="1.6" opacity="0.6" fill-rule="evenodd"/>`
    + (DETAIL[key] ? `<path d="${DETAIL[key]}" fill="none" stroke="${dk}" stroke-width="4" stroke-linecap="round" opacity="0.55"/>` : '')
    + '</g>';
}
