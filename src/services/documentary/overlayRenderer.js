// ── overlayRenderer.js ── بيحوّل قالب SVG لتسلسل إطارات PNG شفافة (دخول → ثبات → خروج)
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { renderTemplateFrame, templateAnimEnd } from './svgTemplates.js';
import { prepareTemplateData } from './boardPrep.js';

export const FPS = 30;
const EXIT_SEC = 0.35;

async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  });
  await Promise.all(workers);
}

async function svgToPng(svg, outPath) {
  await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 2 }).toFile(outPath);
}

/**
 * @returns {{dir, inCount, outCount, holdFile, inPattern, outPattern, tHold, tOut, fps}}
 * الإطارات: in_%04d.png (دخول)، hold.png (ثبات)، out_%04d.png (خروج) — الزمن محسوب بالنسبة لبداية القالب
 */
export async function renderOverlay({ template, data: rawData, dur, w, h, theme, themeName = 'cinematic', lang = 'en', rtl = false, dir, concurrency = 4, outline = false }) {
  fs.mkdirSync(dir, { recursive: true });
  const data = await prepareTemplateData(template, rawData, { w, h, themeName });
  const rawEnd = Math.max(0.2, templateAnimEnd(template, data));
  // لو اللقطة قصيرة نسرّع الحركة عشان تخلص جوه ~65% من المدة
  const speed = rawEnd > dur * 0.65 ? rawEnd / (dur * 0.65) : 1;
  const animEnd = rawEnd / speed;
  const tOut = Math.max(animEnd + 0.05, dur - EXIT_SEC);
  const exitDur = Math.max(0.12, dur - tOut);
  const inCount = Math.max(1, Math.ceil(animEnd * FPS));
  const outCount = Math.max(1, Math.round(exitDur * FPS));
  const base = { w, h, theme, lang, rtl, outline };

  const jobs = [];
  for (let i = 0; i < inCount; i++) jobs.push({ file: path.join(dir, `in_${String(i).padStart(4, '0')}.png`), t: (i / FPS) * speed, exit: 0 });
  jobs.push({ file: path.join(dir, 'hold.png'), t: rawEnd, exit: 0 });
  for (let i = 0; i < outCount; i++) jobs.push({ file: path.join(dir, `out_${String(i).padStart(4, '0')}.png`), t: rawEnd, exit: (i + 1) / outCount });

  await pool(jobs, concurrency, async (j) => svgToPng(renderTemplateFrame(template, data, j.t, { ...base, exit: j.exit }), j.file));
  return {
    dir, fps: FPS, inCount, outCount,
    inPattern: path.join(dir, 'in_%04d.png'), holdFile: path.join(dir, 'hold.png'), outPattern: path.join(dir, 'out_%04d.png'),
    tHold: inCount / FPS, tOut,
  };
}
