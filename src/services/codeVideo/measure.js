// ── measure.js ── قياس عرض الكلمات الحقيقي (Pango عن طريق sharp) عشان تخطيط الكلمات الفردية (kinetic) يبقى مظبوط
import sharp from 'sharp';
import { esc } from './design.js';

const cache = new Map();
const fontOf = (rtl, heavy) => (rtl ? `Noto Sans Arabic ${heavy ? 'Bold' : 'Regular'} 100` : `Noto Sans ${heavy ? 'Bold' : 'Regular'} 100`);

export async function measureWord(word, { rtl = false, heavy = true } = {}) {
  const key = `${rtl ? 1 : 0}${heavy ? 1 : 0}|${word}`;
  if (cache.has(key)) return cache.get(key);
  let w;
  try {
    const m = await sharp({ text: { text: esc(word), font: fontOf(rtl, heavy), rgba: true, dpi: 72 } }).metadata();
    w = m.width || 0;
  } catch { w = 0; }
  if (!w) w = String(word).length * 58;
  cache.set(key, w);
  return w; // العرض عند حجم خط 100px
}

/** بيجهّز دالة متزامنة mw(word, size) لكل الكلمات المطلوبة */
export async function makeMeasurer(words, { rtl = false, heavy = true } = {}) {
  const uniq = [...new Set(words.map(String).filter(Boolean))];
  await Promise.all(uniq.map(w => measureWord(w, { rtl, heavy })));
  const space = await measureWord('م م', { rtl, heavy }) - (await measureWord('مم', { rtl, heavy }));
  return {
    word: (w, size) => ((cache.get(`${rtl ? 1 : 0}${heavy ? 1 : 0}|${w}`) ?? String(w).length * 58) * size) / 100,
    space: (size) => (Math.max(20, space || 28) * size) / 100,
  };
}
