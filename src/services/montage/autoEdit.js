// ── autoEdit.js ── مونتاج تلقائي بـffmpeg لفيديو العميل المرفوع (كلام: فلوج/شرح/تسجيل شاشة): تفريغ الكلام →
// قص الصمت (jump cuts) → زوم ديناميكي بيتبدّل بين اللقطات → انتقالات بين الفقرات + مؤثرات → كابشن قوي بكلمات متزامنة
// → موسيقى بتهدّى تحت الكلام. كله ffmpeg + Whisper (Groq)، من غير أي أداة Replicate مدفوعة.
import fs from 'fs';
import path from 'path';
import { ffmpeg, probeDuration, hasAudio, rmQuiet } from '../documentary/ff.js';
import { montageVideos, displaySize, transcribeAudioFile } from './index.js';

const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30'];
const SENTENCE_END = /[.!?؟…]["'”)]*$/;
const MAX_SIDE = 1920; // نصغّر أي فيديو أكبر من 1080p لتخفيف الرندر

/** يقسّم الكلمات لجمل: علامة ترقيم، أو صمت > 0.5 ثانية، أو جملة أطول من 14 ثانية */
export function splitSentences(words, { gap = 0.5, maxLen = 14 } = {}) {
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length) { out.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur }); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length && (w.start - cur[cur.length - 1].end > gap || w.end - cur[0].start > maxLen)) flush();
    cur.push(w);
    if (SENTENCE_END.test(w.w) && cur.length >= 2) flush();
  }
  flush();
  return out;
}

/**
 * يحدد أجزاء الفيديو اللي هتفضل (من غير الصمت الطويل).
 * @returns {{start:number,end:number,gapBefore:number}[]} gapBefore = طول الصمت اللي اتقطع قبل الجزء (للتقسيم لفقرات)
 */
export function planCuts(sentences, duration, { cutSilence = true, minGap = 0.35, padBefore = 0.1, padAfter = 0.18 } = {}) {
  if (!sentences.length) return [{ start: 0, end: duration, gapBefore: 0 }];
  if (!cutSilence) return [{ start: 0, end: duration, gapBefore: 0 }];
  const raw = sentences.map(s => ({ start: Math.max(0, s.start - padBefore), end: Math.min(duration, s.end + padAfter) }));
  const segs = [];
  for (const r of raw) {
    const last = segs[segs.length - 1];
    if (last && r.start - last.end < minGap) last.end = Math.max(last.end, r.end);
    else segs.push({ ...r, gapBefore: last ? r.start - last.end : 0 });
  }
  // أجزاء قصيرة جدًا (< 0.5 ثانية) بتتدمج في اللي قبلها بدل ما تبقى وميض
  const merged = [];
  for (const sg of segs) {
    if (merged.length && sg.end - sg.start < 0.5) merged[merged.length - 1].end = sg.end;
    else merged.push(sg);
  }
  return merged;
}

/** تحديد مستوى الزوم لكل جزء: دفع بطيء → لقطة مقرّبة ثابتة → سحب للخلف */
export function zoomPlan(n, animate) {
  const pattern = animate ? [[1.0, 1.07], [1.14, 1.14], [1.07, 1.0]] : [[1.0, 1.0], [1.12, 1.12], [1.0, 1.0]];
  return Array.from({ length: n }, (_, i) => pattern[i % 3]);
}

function targetSize(w, h) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const even = (x) => Math.max(2, Math.round((x * k) / 2) * 2);
  return { W: even(w), H: even(h) };
}

async function renderSegment({ src, dest, start, len, W, H, z0, z1 }) {
  const animated = Math.abs(z1 - z0) > 0.001;
  const zExpr = animated ? `(${z0}+(${(z1 - z0).toFixed(4)})*t/${Math.max(0.3, len).toFixed(3)})` : String(z0);
  let vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
  if (animated) vf += `,scale=w='ceil(${W}*${zExpr}/2)*2':h='ceil(${H}*${zExpr}/2)*2':eval=frame,crop=${W}:${H}`;
  else if (z0 > 1.001) vf += `,scale=${Math.ceil((W * z0) / 2) * 2}:${Math.ceil((H * z0) / 2) * 2},crop=${W}:${H}`;
  vf += ',fps=30,format=yuv420p';
  const fade = Math.min(0.03, len / 4);
  await ffmpeg(['-ss', start.toFixed(3), '-t', len.toFixed(3), '-i', src, '-vf', vf,
    '-af', `aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, len - fade).toFixed(3)}:d=${fade}`,
    ...ENC, '-c:a', 'aac', '-b:a', '160k', dest]);
}

/**
 * @param {object} o
 * @param {string} o.file  فيديو العميل
 * @param {string} o.workDir
 * @param {string} [o.language]  لغة الكلام (en/ar/…)
 * @param {object} [o.options] { cutSilence, zoom, transitions, captions: 'karaoke'|'box'|'pop'|'none', music:{file,volume}|null }
 * @returns {{file,duration,words,transcript,chapters,stats}}
 */
export async function autoEditVideo({ file, workDir, language = 'en', options = {}, onProgress = () => {}, onTranscript = null, deps = {} }) {
  const opt = { cutSilence: true, zoom: true, transitions: true, captions: 'karaoke', music: null, ...options };
  fs.mkdirSync(workDir, { recursive: true });
  const size = await displaySize(file);
  const D = await probeDuration(file);
  if (!size || !(D > 1)) throw new Error('unreadable video');
  if (!(await hasAudio(file))) { const e = new Error('no_audio'); e.code = 'no_audio'; throw e; }
  const { W, H } = targetSize(size.w, size.h);

  // 1) تفريغ الكلام
  onProgress({ stage: 'transcribe', frac: 0 });
  const wav = path.join(workDir, 'src_audio.wav');
  await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '16000', wav]);
  const words = await (deps.transcribe || transcribeAudioFile)(wav, workDir, language);
  rmQuiet(wav);
  if (!words.length) { const e = new Error('no_speech'); e.code = 'no_speech'; throw e; }
  if (onTranscript) await onTranscript(words);
  const sentences = splitSentences(words);
  const cuts = planCuts(sentences, D, { cutSilence: opt.cutSilence });
  const animate = D <= 300; // الزوم المتحرك أبطأ في الرندر: للفيديوهات الأطول بنستخدم لقطات مقرّبة ثابتة
  const zooms = opt.zoom ? zoomPlan(cuts.length, animate) : cuts.map(() => [1, 1]);

  // 2) قص كل جزء (مع زوم) وتجميعهم لفقرات
  const segFiles = [];
  for (let i = 0; i < cuts.length; i++) {
    onProgress({ stage: 'cut', frac: i / cuts.length });
    const dest = path.join(workDir, `seg_${i}.mp4`);
    await renderSegment({ src: file, dest, start: cuts[i].start, len: cuts[i].end - cuts[i].start, W, H, z0: zooms[i][0], z1: zooms[i][1] });
    segFiles.push({ dest, dur: await probeDuration(dest) });
  }
  const chapters = [];
  let cur = null;
  segFiles.forEach((sg, i) => {
    if (!cur || cuts[i].gapBefore >= 1.2 || cur.dur >= 25) { cur = { files: [], dur: 0, firstIndex: i }; chapters.push(cur); }
    cur.files.push(sg.dest); cur.dur += sg.dur;
  });
  const chapterFiles = [];
  for (let c = 0; c < chapters.length; c++) {
    const out = path.join(workDir, `chap_${c}.mp4`);
    if (chapters[c].files.length === 1) fs.renameSync(chapters[c].files[0], out);
    else {
      const list = path.join(workDir, `chap_${c}.txt`);
      fs.writeFileSync(list, chapters[c].files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
      chapters[c].files.forEach(f => rmQuiet(f));
    }
    chapterFiles.push(out);
  }

  // 3) الكلمات على الزمن الجديد (بعد قص الصمت)
  let offset = 0;
  const newWords = [];
  segFiles.forEach((sg, i) => {
    for (const w of words) if (w.start >= cuts[i].start - 0.02 && w.start < cuts[i].end) newWords.push({ w: w.w, start: offset + Math.max(0, w.start - cuts[i].start), end: offset + Math.min(sg.dur, Math.max(0, w.end - cuts[i].start)) });
    offset += sg.dur;
  });

  // 4) الانتقالات بين الفقرات + مؤثرات + موسيقى + كابشن
  onProgress({ stage: 'finish', frac: 0 });
  const r = await montageVideos({
    files: chapterFiles, workDir: path.join(workDir, 'final'), assumeNormalized: true,
    transitions: opt.transitions && chapterFiles.length > 1 ? 'auto' : 'none', sfx: true,
    words: opt.captions && opt.captions !== 'none' ? newWords : null,
    captions: opt.captions && opt.captions !== 'none' ? { style: opt.captions, lang: String(language).split(/[-_]/)[0], position: 'auto', transcribe: false } : null,
    musicFile: opt.music?.file || null, musicVolume: opt.music?.volume ?? 0.1,
  });
  chapterFiles.forEach(f => rmQuiet(f));
  const chapterList = [];
  let t = 0;
  chapters.forEach((c, i) => { chapterList.push({ t, title: `Part ${i + 1}` }); t += c.dur; });
  return {
    file: r.file, duration: r.duration, words: newWords, transcript: words.map(w => w.w).join(' '), chapters: chapterList,
    stats: { originalSec: D, finalSec: r.duration, cuts: cuts.length, chapters: chapters.length, removedSec: Math.max(0, D - r.duration) },
  };
}
