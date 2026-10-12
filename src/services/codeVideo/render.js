// ── render.js ── رندر الفيديو بالكود: إطارات SVG → sharp (raw) → ffmpeg عن طريق pipe، وبعدها خلط الصوت وتركيبه
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import sharp from 'sharp';
import { frameSvg, ensurePlates } from './compose.js';
import { mixCodeVideoAudio } from './sound.js';
import { ffmpeg, probeDuration } from '../documentary/ff.js';

export const FPS = 30;
export const RATIO_SIZE = { '16:9': { w: 1920, h: 1080 }, '9:16': { w: 1080, h: 1920 } };

function startEncoder({ w, h, fps, outFile, assFile }) {
  const vf = assFile ? ['-vf', `ass=${assFile.replace(/\\/g, '/').replace(/:/g, '\\:')}`] : [];
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-r', String(fps), '-i', 'pipe:0',
    ...vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', outFile];
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', d => { err = (err + d).slice(-4000); });
  const done = new Promise((resolve, reject) => { p.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg encode failed (${code}): ${err.split('\n').slice(-6).join('\n')}`)))); p.on('error', reject); });
  return { p, done };
}

/** بيرندر كل الإطارات بالتوازي ويكتبها بالترتيب في ffmpeg */
export async function renderSilentVideo({ story, outFile, fps = FPS, concurrency = Number(process.env.CV_RENDER_CONCURRENCY || Math.min(4, Math.max(1, os.cpus().length))), assFile = null, onProgress = () => {} }) {
  const { w, h } = story; const total = Math.ceil(story.duration * fps);
  const enc = startEncoder({ w, h, fps, outFile, assFile });
  const plateCache = new Map();
  let next = 0, written = 0, failure = null; const ready = new Map(); const MAX_AHEAD = concurrency * 3;
  const waiters = new Set(); const wake = () => { for (const r of [...waiters]) r(); };
  const sleepUntilChange = () => new Promise(r => { const f = () => { waiters.delete(f); r(); }; waiters.add(f); setTimeout(f, 150); });

  const worker = async () => {
    while (!failure) {
      if (next >= total) return;
      if (next - written > MAX_AHEAD) { await sleepUntilChange(); continue; }
      const i = next++;
      try {
        const plates = await ensurePlates(story, i / fps, plateCache);
        const svg = frameSvg(story, i / fps, plates);
        const buf = await sharp(Buffer.from(svg), { density: 72 }).removeAlpha().raw().toBuffer();
        ready.set(i, buf); wake();
      } catch (e) { failure = e; wake(); return; }
    }
  };
  const workers = Array.from({ length: concurrency }, worker);
  const writer = (async () => {
    while (written < total && !failure) {
      const buf = ready.get(written);
      if (!buf) { await sleepUntilChange(); continue; }
      ready.delete(written);
      if (!enc.p.stdin.write(buf)) await new Promise(r => enc.p.stdin.once('drain', r));
      written++; wake();
      if (written % 30 === 0) onProgress(written / total);
    }
  })();
  try { await Promise.all([...workers, writer]); } catch (e) { failure = failure || e; }
  if (failure) { try { enc.p.kill('SIGKILL'); } catch {} await enc.done.catch(() => {}); throw failure; }
  enc.p.stdin.end();
  await enc.done;
  onProgress(1);
}

/**
 * الفيديو الكامل: رندر صامت + خلط الصوت (صوت + موسيقى + مؤثرات) + دمج
 * story = { w, h, palette, lang, scenes, mm, duration }
 */
export async function renderCodeVideo({ story, narrationFile, musicFile = null, assFile = null, workDir, outFile, onProgress = () => {}, musicVolume = 0.2 }) {
  fs.mkdirSync(workDir, { recursive: true });
  const silent = path.join(workDir, 'silent.mp4');
  await renderSilentVideo({ story, outFile: silent, assFile, onProgress: (f) => onProgress('frames', f) });
  onProgress('audio', 0);
  const mix = path.join(workDir, 'mix.m4a');
  const info = await mixCodeVideoAudio({ narrationFile, musicFile, scenes: story.scenes, duration: story.duration, workDir, outFile: mix, musicVolume, sfxGain: story.look === 'world3d' ? 0.6 : 0.85 });
  onProgress('audio', 1);
  await ffmpeg(['-i', silent, '-i', mix, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', outFile]);
  return { file: outFile, duration: await probeDuration(outFile), sfxEvents: info.events };
}
