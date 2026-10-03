// ── editorStore.js ── "محرر المشاهد" بعد الإنتاج: بنحتفظ بمقاطع كل لقطة (فيها الكابشن) + الصوت النهائي + صورة مصغّرة لكل لقطة،
// فتبديل لقطة واحدة = رندر مقطع واحد + دمج بالنسخ (ثواني) من غير ما الفيلم كله يتعاد رندره. الملفات بتتخزّن على R2
// (أو outputs محليًا) وبتتمسح بعد مدة (EDIT_RETENTION_DAYS) — الفيلم النهائي نفسه فاضل.
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { ffmpeg, probeDuration } from './ff.js';
import * as store from './store.js';

export const EDIT_MAX_MINUTES = 12;      // أطول فيلم بيتخزّن للتعديل
export const EDIT_RETENTION_DAYS = 30;
export const EDIT_CREDITS = 2;           // تكلفة "تطبيق التعديلات" (مهما كان عدد المشاهد المتغيّرة، لحد 10)
export const EDIT_MAX_CHANGES = 10;
const THUMB = { landscape: [160, 90], portrait: [90, 160] };
const COLS = 10;
const MOTIONS = ['in', 'out', 'pan_left', 'pan_right'];

export async function downloadTo(url, dest) {
  if (!/^https?:\/\//i.test(url)) { fs.copyFileSync(path.join(process.cwd(), url.replace(/^\//, '')), dest); return dest; }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
  await new Promise((resolve, reject) => { const out = fs.createWriteStream(dest); res.body.pipe(out); res.body.on('error', reject); out.on('finish', resolve); out.on('error', reject); });
  return dest;
}

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const idx = i++; await fn(items[idx], idx); } }));
}

/** مواصفات تبديل لقطة: الأصل الجديد مكان القديم مع نفس التدرّج اللوني/الحركة */
export function specWithAsset(spec, asset, index) {
  const visual = { ...spec.visual, kind: asset.kind, file: asset.file, punches: spec.visual?.punches || [] };
  if (asset.kind === 'video') { visual.motion = index % 3 === 0 ? 'push' : 'still'; visual.startOffset = 0; delete visual.amount; delete visual.fit; }
  else { visual.motion = MOTIONS[index % MOTIONS.length]; delete visual.startOffset; }
  return { ...spec, visual };
}

/** صورة مصغّرة (إطار من نص المقطع) */
async function frameThumb(clip, dur, [tw, th], dest) {
  await ffmpeg(['-ss', String(Math.max(0, dur / 2)), '-i', clip, '-frames:v', '1', '-vf', `scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th}`, '-q:v', '5', dest]);
  return dest;
}

export async function buildSprite(clipFiles, durs, ratio, workDir) {
  const [tw, th] = ratio === '9:16' ? THUMB.portrait : THUMB.landscape;
  const rows = Math.ceil(clipFiles.length / COLS);
  const thumbs = new Array(clipFiles.length);
  await pool(clipFiles, 6, async (clip, i) => {
    try { thumbs[i] = await sharp(await frameThumb(clip, durs[i], [tw, th], path.join(workDir, `th_${i}.jpg`))).resize(tw, th).toBuffer(); } catch { thumbs[i] = null; }
  });
  const composites = thumbs.map((buf, i) => (buf ? { input: buf, left: (i % COLS) * tw, top: Math.floor(i / COLS) * th } : null)).filter(Boolean);
  const file = path.join(workDir, 'sprite.jpg');
  await sharp({ create: { width: COLS * tw, height: rows * th, channels: 3, background: '#111' } }).composite(composites).jpeg({ quality: 70 }).toFile(file);
  return { file, tw, th, cols: COLS };
}

/** تحديث خانة واحدة في الـsprite (بعد تبديل لقطة) */
export async function patchSprite(spriteUrl, index, clipFile, dur, ratio, workDir) {
  const [tw, th] = ratio === '9:16' ? THUMB.portrait : THUMB.landscape;
  const file = path.join(workDir, 'sprite_old.jpg');
  await downloadTo(spriteUrl, file);
  const thumb = await sharp(await frameThumb(clipFile, dur, [tw, th], path.join(workDir, `th_new_${index}.jpg`))).resize(tw, th).toBuffer();
  const out = path.join(workDir, 'sprite_new.jpg');
  await sharp(file).composite([{ input: thumb, left: (index % COLS) * tw, top: Math.floor(index / COLS) * th }]).jpeg({ quality: 70 }).toFile(out);
  return out;
}

/**
 * بيخزّن حالة التعديل بعد رندر ناجح.
 * @param {object} o { jobId, userId, render:{clipFiles,audioFile,starts}, timeline, beats, plans, assets, boards, words, workDir, input, extraCredits }
 * @returns editor meta (JSON صغير يتحط في documentary_jobs.meta.editor) أو null لو الفيلم أطول من الحد
 */
export async function persistEditor({ jobId, userId, render, timeline, beats, plans, assets, words, workDir, ratio, extraCredits = [] }) {
  const total = beats.reduce((a, b) => a + b.dur, 0);
  if (total > EDIT_MAX_MINUTES * 60 || !render.clipFiles?.length) return null;
  fs.mkdirSync(workDir, { recursive: true });
  const base = `documentaries/${userId}/${jobId}/edit`;
  const clips = new Array(render.clipFiles.length);
  await pool(render.clipFiles, 4, async (f, i) => { clips[i] = await store.uploadFile(f, `${base}/clip_${i}.mp4`, 'video/mp4'); });
  const audioUrl = await store.uploadFile(render.audioFile, `${base}/audio.m4a`, 'audio/mp4');
  const durs = timeline.beats.map(b => b.dur);
  const sprite = await buildSprite(render.clipFiles, durs, ratio, workDir);
  const spriteUrl = await store.uploadFile(sprite.file, `${base}/sprite_v0.jpg`, 'image/jpeg');
  const list = timeline.beats.map((tb, i) => {
    const plan = plans[i] || {};
    const a = assets[i];
    const swappable = (tb.visual?.kind === 'video' || tb.visual?.kind === 'image') && !!a;
    return {
      i, start: render.starts[i], dur: tb.dur, text: beats[i]?.text || '',
      kind: tb.visual?.kind || 'background', swappable,
      group: plan.visual === 'archive' ? 'archive' : plan.visual === 'nasa' ? 'nasa' : 'stock', queries: plan.queries || [],
      credit: a?.credit || null, assetTitle: a?.title || null,
      spec: swappable ? { dur: tb.dur, visual: { kind: tb.visual.kind, grade: tb.visual.grade, motion: tb.visual.motion, punches: tb.visual.punches || [] }, overlays: (tb.overlays || []).filter(o => !o.data?.photos), transitionIn: tb.transitionIn || 'cut' } : null,
    };
  });
  return {
    version: 1, expiresAt: new Date(Date.now() + EDIT_RETENTION_DAYS * 86400e3).toISOString(), revision: 0,
    ratio, theme: timeline.theme, lang: timeline.lang, captionsStyle: timeline.captions?.style || null,
    words: (words || []).map(w => [w.w, Number(w.start.toFixed(2)), Number(w.end.toFixed(2))]),
    audioUrl, clips, sprite: { url: spriteUrl, tw: sprite.tw, th: sprite.th, cols: sprite.cols }, beats: list, extraCredits,
  };
}

/** كل ملفات التعديل لفيلم (للمسح بعد انتهاء المدة) */
export async function deleteEditorFiles(jobId, userId) {
  const prefix = `documentaries/${userId}/${jobId}/edit/`;
  if (process.env.S3_ENDPOINT_URL && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY) {
    const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'auto', endpoint: process.env.S3_ENDPOINT_URL, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
    const Bucket = process.env.S3_BUCKET || 'erivion-videos';
    const list = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix }));
    const keys = (list.Contents || []).map(o => ({ Key: o.Key }));
    if (keys.length) await s3.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys } }));
    return keys.length;
  }
  const dir = path.join(process.cwd(), 'outputs', 'documentary', String(userId), String(jobId), 'edit');
  if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); return 1; }
  return 0;
}

export { probeDuration };
