// ── typeset.js ── خطوط تحريرية (مجلات/بوسترات) للحروف اللاتيني: الحروف بتتحوّل لمسارات SVG (opentype.js)
// فالشكل ثابت على أي سيرفر ومن غير ما الخط يكون متثبّت في النظام، وكل حرف له مساره فينفع نحرّكه لوحده (blur/حركة).
// العربي: بيترسم كنص SVG عادي بخطوط Noto (العربي محتاج تشكيل حروف متصلة، وده شغل محرّك النصوص مش opentype)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import sharp from 'sharp';
import { esc } from './design.js';

const require = createRequire(import.meta.url);
const opentype = require('opentype.js');
const DIR = path.join(process.cwd(), 'assets', 'fonts');

const FILES = {
  serif: 'PlayfairDisplay_900Black.ttf',          // RISK / BIGGEST
  serifItalic: 'PlayfairDisplay_700Bold_Italic.ttf', // When you learn
  condensed: 'Anton_400Regular.ttf',              // Problem
  round: 'Poppins_800ExtraBold_Italic.ttf',       // no one / either
  clean: 'Poppins_800ExtraBold.ttf',              // research
  sans: 'Poppins_500Medium.ttf',                  // INVESTMENT (حروف متباعدة)
  sansItalic: 'Poppins_500Medium_Italic.ttf',     // Every piece of content should
};
const cache = {};
export function font(key) {
  if (cache[key] !== undefined) return cache[key];
  try { cache[key] = opentype.parse(fs.readFileSync(path.join(DIR, FILES[key])).buffer.slice(0)); } catch (e) { console.warn(`[typeset] font ${key}: ${e.message}`); cache[key] = null; }
  return cache[key];
}

// العربي (وأي حرف مش موجود في الخط) → نص SVG بخطوط النظام
const AR_FAMILY = { serif: "'Noto Naskh Arabic', 'Noto Sans Arabic', serif", serifItalic: "'Noto Naskh Arabic', 'Noto Sans Arabic', serif", condensed: "'Noto Kufi Arabic', 'Noto Sans Arabic', sans-serif", round: "'Noto Kufi Arabic', 'Noto Sans Arabic', sans-serif", clean: "'Noto Kufi Arabic', 'Noto Sans Arabic', sans-serif", sans: "'Noto Sans Arabic', sans-serif", sansItalic: "'Noto Sans Arabic', sans-serif" };
export const AR_PANGO = { serif: 'Noto Naskh Arabic Bold', serifItalic: 'Noto Naskh Arabic Bold', condensed: 'Noto Kufi Arabic Bold', round: 'Noto Kufi Arabic Bold', clean: 'Noto Kufi Arabic Bold', sans: 'Noto Sans Arabic', sansItalic: 'Noto Sans Arabic' };
export const arFamily = (key) => AR_FAMILY[key] || AR_FAMILY.clean;

/** كل حروف النص موجودة في الخط؟ (لو لأ → نرسمه كنص عادي) */
export function canPath(key, text) {
  const f = font(key); if (!f) return false;
  for (const ch of String(text)) { if (ch === ' ') continue; if (f.charToGlyphIndex(ch) === 0) return false; }
  return true;
}

/** عرض النص (px) عند حجم size مع تباعد حروف إضافي track (نسبة من الحجم) — widths = قياسات العربي الجاهزة من produce */
export function measure(key, text, size, { track = 0, widths = null } = {}) {
  const str = String(text || '');
  if (!canPath(key, str)) { const w100 = widths?.[`${key}|${str}`]; return w100 ? (w100 * size) / 100 : str.length * size * 0.56; }
  const f = font(key);
  return f.getAdvanceWidth(str, size, { kerning: true }) + Math.max(0, [...str].length - 1) * track * size;
}

/**
 * الحروف كمسارات منفصلة — كل عنصر: { d, x0, x1, ch, i } (x0/x1 = بداية/نهاية الحرف أفقيًا)
 * x = بداية السطر (الشمال)، y = خط القاعدة
 */
export function glyphs(key, text, x, y, size, { track = 0 } = {}) {
  const f = font(key); const out = [];
  const str = String(text || ''); const gs = f.stringToGlyphs(str); const scale = size / f.unitsPerEm;
  let cx = x; const chars = [...str];
  gs.forEach((g, i) => {
    const d = g.getPath(cx, y, size).toPathData(1);
    const adv = g.advanceWidth * scale;
    out.push({ d, x0: cx, x1: cx + adv, ch: chars[i] || '', i });
    cx += adv + track * size;
    if (gs[i + 1]) cx += f.getKerningValue(g, gs[i + 1]) * scale;
  });
  return out;
}

/**
 * سطر نص جاهز (مسار واحد أو نص SVG للعربي)
 * anchor: start | middle | end (فيزيائي: start = الشمال)
 */
export function line(c, key, text, x, y, size, { anchor = 'start', fill = '#111', opacity = 1, track = 0, widths = null, extra = '' } = {}) {
  const str = String(text || ''); if (!str) return '';
  const wd = measure(key, str, size, { track, widths });
  const x0 = anchor === 'middle' ? x - wd / 2 : anchor === 'end' ? x - wd : x;
  if (!canPath(key, str)) {
    return `<text x="${(x0 + wd / 2).toFixed(1)}" y="${y.toFixed(1)}" font-family="${arFamily(key)}" font-size="${size.toFixed(1)}" font-weight="${key === 'sans' || key === 'sansItalic' ? 500 : 700}" text-anchor="middle" direction="rtl" unicode-bidi="embed" fill="${fill}" opacity="${opacity.toFixed(2)}"${extra}>${esc(str)}</text>`;
  }
  const d = glyphs(key, str, x0, y, size, { track }).map(g => g.d).join('');
  return `<path d="${d}" fill="${fill}" opacity="${opacity.toFixed(2)}"${extra}/>`;
}

/** أكبر حجم يخلّي النص جوه عرض maxW */
export function fitSize(key, text, maxW, { max = 300, min = 30, track = 0, widths = null } = {}) {
  const w100 = measure(key, text, 100, { track, widths });
  return Math.max(min, Math.min(max, (maxW / Math.max(1, w100)) * 100));
}

/** قياس العربي الحقيقي (Pango) لكل نص × كل خط تحريري — بيتحسب مرة واحدة قبل الرندر ويتحط في data._w */
export async function measureNonLatin(texts) {
  const out = {}; const memo = new Map();
  const one = async (str, pf) => {
    const k = `${pf}|${str}`; if (memo.has(k)) return memo.get(k);
    let w = 0;
    try { w = (await sharp({ text: { text: esc(str), font: `${pf} 100`, rgba: true, dpi: 72 } }).metadata()).width || 0; } catch { w = 0; }
    memo.set(k, w); return w;
  };
  for (const str of [...new Set(texts.map(x => String(x || '')).filter(Boolean))]) {
    for (const key of Object.keys(FILES)) {
      if (canPath(key, str)) continue;
      const w = await one(str, AR_PANGO[key]);
      if (w) out[`${key}|${str}`] = w;
    }
  }
  return out;
}
