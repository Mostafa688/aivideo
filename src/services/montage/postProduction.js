// ── postProduction.js ── واجهة بالروابط فوق محرك المونتاج: تنزّل الفيديوهات، تعمل المونتاج الكامل
// (انتقالات + مؤثرات + موسيقى + كابشن) وترفع النتيجة (R2، أو /outputs محليًا في التطوير).
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { montageVideos, captionVideoFile } from './index.js';
import { rmQuiet } from '../documentary/ff.js';

const TEMP_ROOT = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function download(url, dest) {
  if (!/^https?:\/\//i.test(url)) { // رابط محلي (/outputs/...) في بيئة التطوير
    fs.copyFileSync(path.join(process.cwd(), url.replace(/^\//, '')), dest);
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to download ${url}: ${res.status}`);
  const out = fs.createWriteStream(dest);
  await new Promise((resolve, reject) => { res.body.pipe(out); res.body.on('error', reject); out.on('finish', resolve); out.on('error', reject); });
}

async function upload(file, key) {
  if (process.env.S3_ENDPOINT_URL && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && R2_PUBLIC_URL) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'auto', endpoint: process.env.S3_ENDPOINT_URL, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET || 'erivion-videos', Key: key, Body: fs.createReadStream(file), ContentType: 'video/mp4', ContentLength: fs.statSync(file).size }));
    return `${R2_PUBLIC_URL}/${key}`;
  }
  const rel = path.join('montage', path.basename(key));
  const dest = path.join(process.cwd(), 'outputs', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
  return '/outputs/' + rel.replace(/\\/g, '/');
}

const langCode = (l) => String(l || 'en').toLowerCase().split(/[-_]/)[0];

/**
 * مونتاج كامل بالروابط.
 * @param {object} o
 * @param {string[]} o.videoUrls
 * @param {string|null} [o.narrationPath] سرد جديد بيستبدل صوت المقاطع
 * @param {{style?:string,lang?:string,position?:string}|null} [o.captions]  الكابشن بيتفرّغ تلقائي من الصوت
 * @param {Buffer|null} [o.musicBuffer]
 * @param {'auto'|'soft'|'none'} [o.transitions]
 * @returns {Promise<string>} رابط الفيديو النهائي
 */
export async function finishVideos({ videoUrls, narrationPath = null, captions = null, musicBuffer = null, transitions = 'auto', sfx = true }) {
  const id = `fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(TEMP_ROOT, id);
  fs.mkdirSync(workDir, { recursive: true });
  try {
    const files = [];
    for (let i = 0; i < videoUrls.length; i++) { const f = path.join(workDir, `src_${i}.mp4`); await download(videoUrls[i], f); files.push(f); }
    let musicFile = null;
    if (musicBuffer) { musicFile = path.join(workDir, 'music.mp3'); fs.writeFileSync(musicFile, musicBuffer); }
    const r = await montageVideos({
      files, workDir: path.join(workDir, 'm'), transitions, narrationFile: narrationPath, musicFile, sfx,
      captions: captions ? { style: captions.style || 'karaoke', lang: langCode(captions.lang), position: captions.position || 'auto' } : null,
    });
    return await upload(r.file, `generated-videos/montage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
  } finally { rmQuiet(workDir); }
}

/** كابشن على فيديو واحد من رابط (من غير أي موديل خارجي) — الكلمات بتتفرّغ من صوته */
export async function captionVideoUrl({ videoUrl, lang = 'en', style = 'karaoke', position = 'auto', words = null }) {
  const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(TEMP_ROOT, id);
  fs.mkdirSync(workDir, { recursive: true });
  try {
    const src = path.join(workDir, 'src.mp4');
    await download(videoUrl, src);
    const r = await montageVideos({ files: [src], workDir: path.join(workDir, 'm'), transitions: 'none', sfx: false, words, captions: { style, lang: langCode(lang), position } });
    return await upload(r.file, `generated-videos/captioned_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
  } finally { rmQuiet(workDir); }
}

export { captionVideoFile };
