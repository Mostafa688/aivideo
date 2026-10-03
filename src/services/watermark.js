// ── watermark.js ── علامة "Erivion" المائية للنسخ المجانية (بتتحط على الفيديو النهائي بإعادة تشفير سريعة)
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { ffmpeg, probeDuration } from './documentary/ff.js';
import { displaySize } from './montage/index.js';

const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30'];

/** PNG شفاف بكلمة Erivion (أبيض شبه شفاف + ظل) بعرض مناسب لحجم الفيديو */
export async function renderWatermarkPng(videoW, dest) {
  const w = Math.max(150, Math.round(videoW * 0.15));
  const h = Math.round(w * 0.34);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><filter id="s" x="-10%" y="-20%" width="120%" height="160%"><feDropShadow dx="0" dy="${(h * 0.04).toFixed(1)}" stdDeviation="${(h * 0.06).toFixed(1)}" flood-color="#000" flood-opacity="0.65"/></filter></defs>
<g filter="url(#s)"><circle cx="${(h * 0.34).toFixed(1)}" cy="${(h * 0.5).toFixed(1)}" r="${(h * 0.2).toFixed(1)}" fill="#8b7cf8" fill-opacity="0.9"/>
<text x="${(h * 0.72).toFixed(1)}" y="${(h * 0.66).toFixed(1)}" font-family="'Noto Sans','DejaVu Sans',sans-serif" font-size="${(h * 0.5).toFixed(1)}" font-weight="800" fill="#ffffff" fill-opacity="0.82">Erivion</text></g></svg>`;
  await sharp(Buffer.from(svg), { density: 72 }).png().toFile(dest);
  return dest;
}

/** بيرجّع مسار فيديو جديد عليه العلامة (الصوت بيتنسخ زي ما هو) */
export async function watermarkVideo(file) {
  const size = await displaySize(file);
  if (!size) throw new Error('cannot read the video size for the watermark');
  const dir = path.dirname(file);
  const png = path.join(dir, `wm_${Date.now()}.png`);
  await renderWatermarkPng(size.w, png);
  const out = path.join(dir, `wm_${path.basename(file)}`);
  const margin = Math.round(Math.min(size.w, size.h) * 0.035);
  await ffmpeg(['-i', file, '-i', png, '-filter_complex', `[0:v][1:v]overlay=W-w-${margin}:${margin}:format=auto,format=yuv420p[v]`, '-map', '[v]', '-map', '0:a?', ...ENC, '-c:a', 'copy', '-movflags', '+faststart', out]);
  try { fs.unlinkSync(png); } catch { /* ignore */ }
  return out;
}

export { probeDuration };
