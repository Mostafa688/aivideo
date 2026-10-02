// ── boardPrep.js ── تجهيز بيانات القوالب اللي بتحتاج صور (photo_board) قبل الرسم: كل صورة بتتقص بنسبة
// منطقة الصورة في الكارت وبتتصغّر وبتتحط كـdata URI (فمفيش ملفات خارجية جوه الـSVG)، وخلفية الورق/المكتب
// بتتولّد مرة واحدة (تدرّج + حبيبات + فينييت) بدل ما نرسم فلاتر تقيلة في كل فريم.
import sharp from 'sharp';
import { getTheme } from './themes.js';

export const POLAROID = { h: 1.22, pad: 0.06, cap: 0.22 };
const PHOTO_W = 1 - POLAROID.pad * 2;
const PHOTO_H = POLAROID.h - POLAROID.pad - POLAROID.cap;
export const PHOTO_AR = PHOTO_W / PHOTO_H;

const PAPER = { cinematic: ['#d8c6a0', '#b49c6e'], vintage: ['#dccfb3', '#bba884'], light: ['#f1ebdd', '#d9d0bb'] };

export const boardIsDark = (themeName) => !PAPER[themeName];

async function buildBackground(w, h, themeName) {
  const th = getTheme(themeName);
  const [top, bottom] = PAPER[themeName] || [th.bgTop, th.bgBottom];
  const grad = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></radialGradient><radialGradient id="v" cx="50%" cy="50%" r="72%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#v)"/></svg>`);
  // حبيبات ورق: ضوضاء رمادية بشفافية قليلة
  const noise = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = 90 + ((Math.random() * 120) | 0); noise[i * 4] = v; noise[i * 4 + 1] = v; noise[i * 4 + 2] = v; noise[i * 4 + 3] = 26; }
  const buf = await sharp(grad).composite([{ input: noise, raw: { width: w, height: h, channels: 4 }, blend: 'over' }]).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

async function photoUri(file) {
  const W = 520, H = Math.round(W / PHOTO_AR);
  const buf = await sharp(file, { failOn: 'none' }).rotate().resize(W, H, { fit: 'cover', position: 'attention' })
    .modulate({ saturation: 0.7 }).jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

/** بيرجّع نسخة من data فيها _bg و photos[i].uri (الصور اللي فشل تحميلها بتتشال) */
export async function prepareTemplateData(name, data, { w, h, themeName = 'cinematic' }) {
  if (name !== 'photo_board') return data;
  const photos = [];
  for (const p of data.photos || []) {
    if (!p.file) continue;
    try { photos.push({ caption: p.caption, uri: await photoUri(p.file) }); } catch { /* صورة بايظة: نتخطاها */ }
  }
  return { ...data, photos, _bg: await buildBackground(w, h, themeName), _dark: boardIsDark(themeName) };
}
