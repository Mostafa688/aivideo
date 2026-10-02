// ── sources/index.js ── بحث موحّد في مصادر الميديا + تنزيل/تجهيز الأصل المحلي
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { searchPexels } from './pexels.js';
import { searchPixabay } from './pixabay.js';
import { searchNasa, materializeNasa } from './nasa.js';
import { searchWikimedia } from './wikimedia.js';
import { searchInternetArchive, materializeArchive } from './internetArchive.js';
import { downloadToFile } from './common.js';
import { ffmpeg, probeVideo, probeDuration } from '../ff.js';

// خطوط المصادر حسب نية اللقطة: stock = لقطات عامة (B-roll) | archive = أرشيف تاريخي/شخصيات/أحداث | nasa = فضاء
export const SOURCE_GROUPS = {
  stock: ['pexels', 'pixabay'],
  archive: ['wikimedia', 'archive', 'nasa', 'pexels'],
  nasa: ['nasa', 'wikimedia', 'pexels'],
  any: ['pexels', 'wikimedia', 'archive', 'nasa', 'pixabay'],
};

const SEARCHERS = {
  pexels: (q, o, d) => searchPexels(q, o, d),
  pixabay: (q, o, d) => searchPixabay(q, o, d),
  nasa: (q, o, d) => searchNasa(q, o, d),
  wikimedia: (q, o, d) => searchWikimedia(q, o, d),
  archive: (q, o, d) => searchInternetArchive(q, o, d),
};

export const sourceAvailability = () => ({
  pexels: !!process.env.PEXELS_API_KEY, pixabay: !!process.env.PIXABAY_API_KEY, nasa: true, wikimedia: true, archive: true,
});

/** يبحث في مجموعة مصادر بالتوازي ويرجّع مرشحين مرخّصين فقط (license.ok) من غير تكرار */
export async function searchCandidates(query, { group = 'stock', kinds = ['video', 'image'], orientation = 'landscape', limit = 8 } = {}, deps = {}) {
  const names = (SOURCE_GROUPS[group] || SOURCE_GROUPS.stock).filter(n => sourceAvailability()[n]);
  const lists = await Promise.all(names.map(async n => {
    try { return await SEARCHERS[n](query, { kinds, orientation, limit }, deps); } catch (e) { console.warn(`[Documentary/sources] ${n} search failed: ${e.message}`); return []; }
  }));
  const seen = new Set();
  const out = [];
  for (const c of lists.flat()) {
    if (!c?.license?.ok || seen.has(c.id)) continue;
    seen.add(c.id); out.push(c);
  }
  return out;
}

export async function materialize(c, deps = {}) {
  if (c.source === 'nasa') return materializeNasa(c, deps);
  if (c.source === 'archive') return materializeArchive(c, deps);
  return c.url ? c : null;
}

/**
 * ينزّل الأصل ويجهّزه محليًا. صورة → JPEG (حد أقصى 3000px)، فيديو → MP4 قصير مقصوص لمدة اللقطة.
 * لو فشل بيرمي خطأ (المستدعي بيجرّب المرشح التالي).
 * @returns {{file, kind:'image'|'video', width, height, duration?}}
 */
export async function fetchAsset(c, destDir, { clipSeconds = 6 } = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  const safe = c.id.replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
  if (c.kind === 'image') {
    const raw = path.join(destDir, `${safe}.raw`);
    await downloadToFile(c.url, raw, { maxBytes: 40 * 1024 * 1024 });
    const out = path.join(destDir, `${safe}.jpg`);
    const img = sharp(raw, { failOn: 'none', limitInputPixels: 200e6 }).rotate();
    const meta = await img.metadata();
    if (!meta.width || meta.width < 500 || !meta.height || meta.height < 350) throw new Error('image too small');
    await img.resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#000' }).jpeg({ quality: 90 }).toFile(out);
    fs.rmSync(raw, { force: true });
    const m2 = await sharp(out).metadata();
    return { file: out, kind: 'image', width: m2.width, height: m2.height };
  }
  // فيديو
  const out = path.join(destDir, `${safe}.mp4`);
  if (c.remote) {
    // أرشيف: بنقص جزء من نص الفيلم عن بُعد (مش بنحمّل الفيلم كله)
    const total = c.duration || 600;
    const len = Math.min(clipSeconds + 2, Math.max(4, total * 0.5));
    const start = Math.max(0, Math.min(total - len - 1, total * (0.12 + Math.random() * 0.6)));
    await ffmpeg(['-rw_timeout', '30000000', '-ss', start.toFixed(2), '-i', c.url, '-t', len.toFixed(2), '-vf', 'scale=1280:-2,fps=30', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', out], { timeoutMs: 4 * 60 * 1000 });
  } else {
    const raw = path.join(destDir, `${safe}.src.mp4`);
    await downloadToFile(c.url, raw, { maxBytes: 120 * 1024 * 1024, timeoutMs: 120000 });
    fs.renameSync(raw, out);
  }
  const info = await probeVideo(out);
  if (!info.width || info.duration < 1) throw new Error('bad video');
  return { file: out, kind: 'video', width: info.width, height: info.height, duration: info.duration || (await probeDuration(out)) };
}
