// ── endCard.js ── شاشة نهاية بسيطة بنص (زي "عمل الطالبة: … — الصف ٣/٦") بتتضاف في آخر الفيديو المدموج.
// بنفس أبعاد أول فيديو، نص عربي/إنجليزي في النص على خلفية متدرّجة، ظهور ناعم، وصوت صامت عشان الدمج يشتغل عادي
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { ffmpeg, probeVideo, rmQuiet } from '../documentary/ff.js';
import { uploadUserSourceVideoToR2 } from '../audioVideoService.js';
import { wrapText, esc } from '../documentary/textutil.js';

const isAr = (s) => /[؀-ۿ]/.test(s);

/** @returns {Promise<string>} رابط عام لمقطع شاشة النهاية */
export async function makeEndCardUrl({ text, seconds = 3, refVideoUrl = null }) {
  let w = 1920, h = 1080;
  if (refVideoUrl) { try { const v = await probeVideo(refVideoUrl); if (v.width && v.height) { w = v.width; h = v.height; } } catch { /* الافتراضي */ } }
  w -= w % 2; h -= h % 2;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'endcard-'));
  try {
    const s = Math.min(w, h) / 1080, ar = isAr(text);
    let size = Math.round(82 * s), lines = [];
    for (; size > 34 * s; size -= 4) { lines = wrapText(text, w * 0.84, size, { maxLines: 99 }); if (lines.length <= 4) break; }
    const lh = size * 1.45, y0 = h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35;
    const ff = ar ? "'Noto Kufi Arabic','Noto Sans Arabic',sans-serif" : "'Noto Sans','DejaVu Sans',sans-serif";
    const body = lines.map((ln, i) => `<text x="${w / 2}" y="${(y0 + i * lh).toFixed(1)}" text-anchor="middle" font-family="${ff}" font-size="${size}" font-weight="700" fill="#ffffff"${ar ? ' direction="rtl" unicode-bidi="embed"' : ''}>${esc(ln)}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1446"/><stop offset="1" stop-color="#5a2a8c"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect x="${w * 0.06}" y="${h * 0.06}" width="${w * 0.88}" height="${h * 0.88}" rx="${28 * s}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="${3 * s}"/>${body}</svg>`;
    const png = path.join(dir, 'card.png'), mp4 = path.join(dir, 'card.mp4');
    await sharp(Buffer.from(svg)).png().toFile(png);
    const sec = Math.min(6, Math.max(2, Number(seconds) || 3));
    await ffmpeg(['-loop', '1', '-framerate', '30', '-i', png, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(sec),
      '-vf', `fade=t=in:st=0:d=0.5,fade=t=out:st=${(sec - 0.4).toFixed(2)}:d=0.4,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-shortest', mp4]);
    return await uploadUserSourceVideoToR2(fs.readFileSync(mp4));
  } finally { rmQuiet(dir); }
}
