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

/** ASS كابشن لقطة واحدة (توقيت نسبي لبداية اللقطة) — بيرجّع مسار الملف أو null لو مفيش كلمات في اللقطة */
export function beatCaptionsAss({ words, start, dur, style, w, h, lang, theme, widths = null, file }) {
  if (!words?.length) return null;
  if (h > w && style && style !== 'none') style = 'word'; // الفيديو الطولي (9:16): كابشن كلمة كلمة في النص
  const t1 = start + dur;
  const ws = words.filter(x => x.start >= start - 0.001 && x.start < t1).map(x => ({ w: x.w, start: Math.max(0, x.start - start), end: Math.min(dur, x.end - start) })).filter(x => x.end > x.start);
  if (!ws.length) return null;
  fs.writeFileSync(file, buildCaptionsAss({ words: ws, style, w, h, lang, theme, widths }));
  return file;
}

export async function renderDocumentary({ timeline, workDir, onProgress = () => {}, concurrency = 2, keepWork = false, keepClips = false }) {
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

  // 0) كابشن كل لقطة (ASS بتوقيت نسبي لبداية اللقطة): بنحرقه جوه المقطع نفسه
  const capStyle = timeline.captions?.style || 'karaoke';
  const capWords = timeline.captions?.words || [];
  let widths = null;
  if (capWords.length && rtl && capStyle !== 'box') widths = await measureCaptionWords(capWords, { lang, w, h }).catch(() => null);
  const starts = []; { let t = 0; for (const b of beats) { starts.push(t); t += b.dur; } }
  const assFor = (i) => beatCaptionsAss({ words: capWords, start: starts[i], dur: beats[i].dur, style: capStyle, w, h, lang, theme, widths, file: path.join(clipsDir, `cap_${String(i).padStart(4, '0')}.ass`) });

  // 1) المقاطع
  const clipFiles = new Array(beats.length);
  let done = 0;
  const failures = [];
  await pool(beats, concurrency, async (beat, i) => {
    const captionsAss = assFor(i);
    try {
      clipFiles[i] = await buildBeatClip({ beat, w, h, theme, bgPath, lang, rtl, workDir: clipsDir, index: i, captionsAss });
    } catch (e) {
      failures.push({ index: i, error: e.message });
      clipFiles[i] = await buildBeatClip({ beat: { dur: beat.dur, visual: { kind: 'background' }, overlays: [] }, w, h, theme, bgPath, lang, rtl, workDir: clipsDir, index: i, captionsAss });
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

  // 4) التصدير النهائي: فيديو (مقاطع فيها الكابشن) + الصوت — نسخ مباشر للاتنين
  const outFile = path.join(workDir, 'final.mp4');
  await ffmpeg(['-i', videoFile, '-i', audioFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-t', total.toFixed(3), '-movflags', '+faststart', outFile]);
  const duration = await probeDuration(outFile);
  onProgress({ stage: 'done' });
  if (!keepWork && !keepClips) { rmQuiet(clipsDir); rmQuiet(list); rmQuiet(videoFile); rmQuiet(audioFile); }
  return { file: outFile, duration, failures, width: w, height: h, clipFiles: keepClips ? clipFiles : undefined, audioFile: keepClips ? audioFile : undefined, starts: keepClips ? starts : undefined };
}
