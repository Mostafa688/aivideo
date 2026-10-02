// ── documentary/index.js ── محرك رندر الفيلم الوثائقي: Timeline → MP4
// Timeline = { ratio:'16:9'|'9:16', theme, lang, beats:[{dur, visual, overlays, transitionIn}], narrationFile,
//              musicFile?, captions?:{words, style}, sfx?:boolean }
// القاعدة: أي لقطة تفشل بتتبدّل بلقطة خلفية بسيطة بدل ما الفيديو كله يفشل.
import fs from 'fs';
import path from 'path';
import { ffmpeg, probeDuration, rmQuiet } from './ff.js';
import { buildBeatClip } from './clipBuilder.js';
import { renderBackground } from './background.js';
import { buildCaptionsAss, measureCaptionWords } from './captions.js';
import { ensureSfx, sfxForBeat } from './sfx.js';
import { mixAudio } from './audioMix.js';
import { isRtlLang } from './textutil.js';

export const RATIO_SIZE = { '16:9': { w: 1920, h: 1080 }, '9:16': { w: 1080, h: 1920 } };

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  }));
}

const escFilterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,');

export async function renderDocumentary({ timeline, workDir, onProgress = () => {}, concurrency = 2, keepWork = false }) {
  const { w, h } = RATIO_SIZE[timeline.ratio] || RATIO_SIZE['16:9'];
  const lang = timeline.lang || 'en';
  const rtl = isRtlLang(lang);
  const theme = timeline.theme || 'blue';
  fs.mkdirSync(workDir, { recursive: true });
  const clipsDir = path.join(workDir, 'clips');
  fs.mkdirSync(clipsDir, { recursive: true });
  const bgPath = path.join(workDir, 'bg.png');
  await renderBackground(theme, w, h, bgPath);

  const beats = timeline.beats;
  if (!beats?.length) throw new Error('timeline has no beats');
  const total = beats.reduce((a, b) => a + b.dur, 0);

  // 1) المقاطع
  const clipFiles = new Array(beats.length);
  let done = 0;
  const failures = [];
  await pool(beats, concurrency, async (beat, i) => {
    try {
      clipFiles[i] = await buildBeatClip({ beat, w, h, theme, bgPath, lang, rtl, workDir: clipsDir, index: i });
    } catch (e) {
      failures.push({ index: i, error: e.message });
      clipFiles[i] = await buildBeatClip({ beat: { dur: beat.dur, visual: { kind: 'background' }, overlays: [] }, w, h, theme, bgPath, lang, rtl, workDir: clipsDir, index: i });
    }
    onProgress({ stage: 'clips', done: ++done, total: beats.length });
  });

  // 2) دمج المقاطع (نسخ مباشر، من غير إعادة تشفير)
  const list = path.join(workDir, 'list.txt');
  fs.writeFileSync(list, clipFiles.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
  const videoFile = path.join(workDir, 'video.mp4');
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', videoFile]);
  onProgress({ stage: 'joined' });

  // 3) الصوت
  const sfxFiles = timeline.sfx === false ? {} : await ensureSfx(path.join(workDir, 'sfx'));
  let t0 = 0; const sfxEvents = [];
  beats.forEach(b => { sfxEvents.push(...sfxForBeat(b, t0)); t0 += b.dur; });
  const audioFile = path.join(workDir, 'mix.m4a');
  await mixAudio({ narrationFile: timeline.narrationFile, musicFile: timeline.musicFile || null, musicVolume: timeline.musicVolume ?? 0.15, sfxEvents, sfxFiles, duration: total, outFile: audioFile });
  onProgress({ stage: 'audio' });

  // 4) الكابشن + التصدير النهائي
  const outFile = path.join(workDir, 'final.mp4');
  const args = ['-i', videoFile, '-i', audioFile, '-map', '0:v', '-map', '1:a'];
  if (timeline.captions?.words?.length) {
    const assFile = path.join(workDir, 'captions.ass');
    const capStyle = timeline.captions.style || 'karaoke';
    let widths = null;
    if (isRtlLang(lang) && capStyle !== 'box') widths = await measureCaptionWords(timeline.captions.words, { lang, w, h }).catch(() => null);
    fs.writeFileSync(assFile, buildCaptionsAss({ words: timeline.captions.words, style: capStyle, w, h, lang, theme, widths }));
    args.push('-vf', `ass='${escFilterPath(assFile)}'`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high');
  } else {
    args.push('-c:v', 'copy');
  }
  args.push('-c:a', 'copy', '-t', total.toFixed(3), '-movflags', '+faststart', outFile);
  await ffmpeg(args);
  const duration = await probeDuration(outFile);
  onProgress({ stage: 'done' });
  if (!keepWork) { rmQuiet(clipsDir); rmQuiet(list); rmQuiet(videoFile); rmQuiet(audioFile); }
  return { file: outFile, duration, failures, width: w, height: h };
}
