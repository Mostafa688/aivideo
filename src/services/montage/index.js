// ── montage/index.js ── مونتاج بـffmpeg فقط (من غير أي أداة Replicate مدفوعة): بيجمّع مشاهد/فيديوهات في فيديو
// واحد بانتقالات متنوّعة (xfade) من غير ما الصوت يتأثر، ويضيف مؤثرات صوتية عند القطعات وموسيقى بتهدّى تحت
// الكلام وكابشن بنفس محرك الأفلام الوثائقية (تحت للفيديو الطويل، في النص بحركة للقصير).
import fs from 'fs';
import path from 'path';
import { ffmpeg, probeDuration, hasAudio, rmQuiet, run } from '../documentary/ff.js';
import { buildCaptionsAss, measureCaptionWords } from '../documentary/captions.js';
import { ensureSfx } from '../documentary/sfx.js';
import { mixAudio } from '../documentary/audioMix.js';
import { isRtlLang } from '../documentary/textutil.js';
import { transcribeWords } from '../documentary/align.js';

export const SHORT_VIDEO_MAX_SEC = 75; // أقصر من كده = فيديو قصير (كابشن في النص)

const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30'];
const TRANSITION_SET = ['fade', 'slideleft', 'wipeleft', 'circleopen', 'zoomin', 'smoothleft', 'fadewhite', 'dissolve', 'slideup', 'radial'];
// مجموعة "قوية" للمونتاج الذكي: حركة واضحة وقطعات ديناميكية (كلها متاحة من ffmpeg 4.3)
const PUNCHY_SET = ['slideleft', 'zoomin', 'circleopen', 'wipeleft', 'diagtl', 'slideup', 'hlslice', 'fadewhite', 'squeezeh', 'smoothleft', 'vertopen', 'radial'];
const escFilterPath = (p) => String(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

/** الأبعاد المعروضة الحقيقية (بتحترم علامة الدوران) */
export async function displaySize(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', file]);
  const st = JSON.parse(stdout)?.streams?.[0];
  if (!st) return null;
  let w = parseInt(st.width, 10), h = parseInt(st.height, 10);
  if (!(w > 0 && h > 0)) return null;
  const rot = ((parseInt(st.tags?.rotate || '0', 10) || st.side_data_list?.find(x => typeof x.rotation === 'number')?.rotation || 0) % 360 + 360) % 360;
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  return { w: w - (w % 2), h: h - (h % 2) };
}

/** كل مقطع يتحوّل لنفس المقاس/الفريمات/الصوت (مع blur-fill لو النسبة مختلفة، وصمت لو مفيش صوت) */
async function normalizeClip(src, dest, W, H) {
  const size = await displaySize(src);
  const dur = await probeDuration(src);
  if (!size || !(dur > 0.2)) throw new Error('unreadable clip');
  const same = Math.abs(size.w / size.h - W / H) < 0.01;
  const vf = same
    ? `scale=${W}:${H},setsar=1,fps=30,format=yuv420p`
    : `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:4,eq=brightness=-0.08[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p`;
  const audio = await hasAudio(src);
  const args = ['-i', src];
  if (!audio) args.push('-f', 'lavfi', '-t', dur.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo');
  args.push('-filter_complex', same ? `[0:v]${vf}[v]` : `[0:v]${vf}[v]`, '-map', '[v]', '-map', audio ? '0:a:0' : '1:a:0',
    '-af', 'aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo', ...ENC, '-c:a', 'aac', '-b:a', '160k', '-t', dur.toFixed(3), '-movflags', '+faststart', dest);
  await ffmpeg(args);
  return { file: dest, dur: await probeDuration(dest) };
}

/** يختار مدة الانتقال ونوعه لكل وصلة (متنوّع لكن متكرر بشكل ثابت) */
export function planTransitions(durs, mode = 'auto', variant = 'auto') {
  const n = durs.length;
  if (mode === 'none' || n < 2) return { d: 0, types: [] };
  const avg = durs.reduce((a, b) => a + b, 0) / n;
  const minDur = Math.min(...durs);
  const d = Math.max(0.18, Math.min(0.45, avg * 0.07));
  if (minDur < d * 3) return { d: 0, types: [] }; // مقطع أقصر من الانتقال: قطع مباشر أأمن
  const types = [];
  for (let i = 0; i < n - 1; i++) types.push(mode === 'soft' ? (i % 2 ? 'dissolve' : 'fade') : (variant === 'punchy' ? PUNCHY_SET[(i * 5 + n) % PUNCHY_SET.length] : TRANSITION_SET[(i * 3 + n) % TRANSITION_SET.length]));
  return { d: Number(d.toFixed(3)), types };
}

/** يدمج مقاطع متطابقة الترميز: قطع مباشر (concat) أو xfade على فيديو فقط والصوت بيتوصّل زي ما هو */
async function joinClips(clips, workDir, plan) {
  const out = path.join(workDir, 'joined.mp4');
  const n = clips.length;
  if (!plan.d) {
    const list = path.join(workDir, 'join_list.txt');
    fs.writeFileSync(list, clips.map(c => `file '${c.file.replace(/'/g, "'\\''")}'`).join('\n'));
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out]);
    return { file: out, cuts: clips.slice(0, -1).map((_, i) => clips.slice(0, i + 1).reduce((a, c) => a + c.dur, 0)) };
  }
  const d = plan.d;
  const inputs = clips.flatMap(c => ['-i', c.file]);
  const parts = [];
  // كل مقطع (غير الأخير) بيتمدد d ثانية بتجميد آخر فريم، فالانتقال بياكل الجزء المتجمّد ومدة الفيديو بتفضل = مجموع المدد (متزامنة مع الصوت)
  for (let i = 0; i < n; i++) parts.push(`[${i}:v]${i < n - 1 ? `tpad=stop_mode=clone:stop_duration=${d}` : 'null'}[p${i}]`);
  let prev = 'p0', cum = 0;
  for (let i = 1; i < n; i++) {
    cum += clips[i - 1].dur;
    const label = i === n - 1 ? 'vout' : `x${i}`;
    parts.push(`[${prev}][p${i}]xfade=transition=${plan.types[i - 1]}:duration=${d}:offset=${cum.toFixed(3)}[${label}]`);
    prev = label;
  }
  parts.push(`${clips.map((_, i) => `[${i}:a]`).join('')}concat=n=${n}:v=0:a=1[aout]`);
  await ffmpeg([...inputs, '-filter_complex', parts.join(';'), '-map', '[vout]', '-map', '[aout]', ...ENC, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  let c2 = 0;
  return { file: out, cuts: clips.slice(0, -1).map(c => (c2 += c.dur)) };
}

/** تفريغ كلمات بتوقيتات (Whisper عبر Groq) على أجزاء 10 دقايق */
export async function transcribeAudioFile(file, workDir, language = null) {
  const dur = await probeDuration(file);
  const words = [];
  for (let t = 0, k = 0; t < dur; t += 600, k++) {
    const part = path.join(workDir, `asr_${k}.mp3`);
    await ffmpeg(['-ss', String(t), '-i', file, '-t', '600', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', part]);
    const r = await transcribeWords(part, { language });
    words.push(...r.words.map(w => ({ w: w.w, start: w.start + t, end: w.end + t })));
    rmQuiet(part);
  }
  return words;
}

/** الكابشن: لو الفيديو قصير → في النص بحركة، طويل → تحت */
export function captionPosition(duration, requested = 'auto', portrait = false) {
  if (requested === 'bottom' || requested === 'center') return requested;
  // أفقي (16:9): الكابشن دايمًا تحت وبحجم أكبر؛ الرأسي القصير (ريلز/تيك توك): في النص بحركة
  return portrait && duration <= SHORT_VIDEO_MAX_SEC ? 'center' : 'bottom';
}

const LANDSCAPE_CAPTION_SCALE = 1.32; // كابشن الفيديو الأفقي أكبر (64 → ~84px على 1080p)

async function writeAss({ words, style, lang, W, H, duration, position, workDir, title = null }) {
  const fsScale = H > W ? 1 : LANDSCAPE_CAPTION_SCALE;
  let widths = null;
  if (words?.length && isRtlLang(lang) && style !== 'box') widths = await measureCaptionWords(words, { lang, w: W, h: H, fsScale }).catch(() => null);
  const file = path.join(workDir, 'captions.ass');
  fs.writeFileSync(file, buildCaptionsAss({ words: words || [], style, w: W, h: H, lang, widths, position: captionPosition(duration, position, H > W), fsScale, title }));
  return file;
}

/**
 * مونتاج كامل لمجموعة ملفات فيديو محلية.
 * @param {object} o
 * @param {string[]} o.files  ملفات بالترتيب
 * @param {string} o.workDir
 * @param {'auto'|'soft'|'none'} [o.transitions]
 * @param {string|null} [o.narrationFile]  صوت بيستبدل صوت المقاطع (بيتقصّ/بيتمدّ لمدة الفيديو)
 * @param {{w:string,start:number,end:number}[]|null} [o.words]  كلمات بتوقيت الفيديو النهائي (لو فيه كابشن ومعاك الكلمات)
 * @param {{style?:string, position?:string, lang?:string, transcribe?:boolean}|null} [o.captions]
 * @param {string|null} [o.musicFile]
 * @param {number} [o.musicVolume]
 * @param {boolean} [o.sfx]
 * @returns {{file:string,duration:number,width:number,height:number,words:any[]|null,cuts:number[]}}
 */
export async function montageVideos({ files, workDir, transitions = 'auto', narrationFile = null, words = null, captions = null, musicFile = null, musicVolume = 0.14, sfx = true, assumeNormalized = false, extraSfx = [], title = null, transitionStyle = 'auto', onProgress = () => {} }) {
  if (!files?.length) throw new Error('no clips');
  fs.mkdirSync(workDir, { recursive: true });
  const size = await displaySize(files[0]);
  if (!size) throw new Error('cannot read the first clip size');
  const { w: W, h: H } = size;

  // 1) توحيد المقاطع
  const clips = [];
  for (let i = 0; i < files.length; i++) {
    onProgress({ stage: 'normalize', done: i, total: files.length });
    clips.push(assumeNormalized ? { file: files[i], dur: await probeDuration(files[i]) } : await normalizeClip(files[i], path.join(workDir, `n_${i}.mp4`), W, H));
  }
  // 2) الدمج + الانتقالات
  onProgress({ stage: 'join', done: 0, total: 1 });
  const plan = planTransitions(clips.map(c => c.dur), transitions, transitionStyle);
  const joined = clips.length === 1 ? { file: clips[0].file, cuts: [] } : await joinClips(clips, workDir, plan);
  if (!assumeNormalized) clips.forEach(c => { if (c.file !== joined.file) rmQuiet(c.file); });
  const duration = await probeDuration(joined.file);

  // 3) الصوت الأساسي (الصوت الأصلي أو سرد جديد) + كلمات الكابشن
  const baseWav = path.join(workDir, 'base.wav');
  if (narrationFile) await ffmpeg(['-i', narrationFile, '-ar', '44100', '-ac', '2', baseWav]);
  else await ffmpeg(['-i', joined.file, '-vn', '-ar', '44100', '-ac', '2', baseWav]);
  const lang = captions?.lang || 'en';
  let capWords = words;
  if (captions && !capWords && captions.transcribe !== false) {
    onProgress({ stage: 'transcribe', done: 0, total: 1 });
    try { capWords = await transcribeAudioFile(baseWav, workDir, lang); } catch (e) { console.warn('[Montage] transcription failed — no captions:', e.message); capWords = null; }
  }

  // 4) مؤثرات عند القطعات + موسيقى + توحيد الصوت
  onProgress({ stage: 'audio', done: 0, total: 1 });
  const needMix = !!(musicFile || (sfx && joined.cuts.length) || narrationFile || extraSfx.length);
  let audioFile = null;
  if (needMix) {
    const sfxFiles = (sfx && joined.cuts.length) || extraSfx.length ? await ensureSfx(path.join(workDir, 'sfx')) : {};
    const sfxEvents = sfx && plan.d ? joined.cuts.map((t, i) => ({ t: Math.max(0, t - 0.04), type: i % 4 === 3 ? 'impact' : 'whoosh', vol: i % 4 === 3 ? 0.35 : 0.3 })) : [];
    audioFile = path.join(workDir, 'mixed.m4a');
    sfxEvents.push(...extraSfx);
    await mixAudio({ narrationFile: baseWav, musicFile, musicVolume, sfxEvents, sfxFiles, duration, outFile: audioFile });
  }

  // 5) الإخراج النهائي: كابشن محروق (لو فيه) + الصوت
  onProgress({ stage: 'final', done: 0, total: 1 });
  const out = path.join(workDir, 'final.mp4');
  const args = ['-i', joined.file];
  if (audioFile) args.push('-i', audioFile);
  args.push('-map', '0:v', '-map', audioFile ? '1:a' : '0:a');
  const hasCaps = !!(captions && capWords?.length);
  if (hasCaps || (title && duration >= 12)) {
    const ass = await writeAss({ words: hasCaps ? capWords : [], style: captions?.style || 'karaoke', lang, W, H, duration, position: captions?.position || 'auto', workDir, title: title && duration >= 12 ? { text: title } : null });
    args.push('-vf', `ass='${escFilterPath(ass)}'`, ...ENC);
  } else args.push('-c:v', 'copy');
  args.push('-c:a', audioFile ? 'copy' : 'aac', '-t', duration.toFixed(3), '-movflags', '+faststart', out);
  await ffmpeg(args);
  rmQuiet(joined.file === out ? '' : joined.file);
  return { file: out, duration: await probeDuration(out), width: W, height: H, words: capWords || null, cuts: joined.cuts };
}

/** كابشن بس على فيديو واحد (بديل fictions-ai/autocaption): بيرجّع ملف محلي */
export async function captionVideoFile({ file, words, workDir, style = 'karaoke', lang = 'en', position = 'auto' }) {
  fs.mkdirSync(workDir, { recursive: true });
  const size = await displaySize(file);
  if (!size) throw new Error('cannot read the video size');
  const duration = await probeDuration(file);
  const ass = await writeAss({ words, style, lang, W: size.w, H: size.h, duration, position, workDir });
  const out = path.join(workDir, 'captioned.mp4');
  const audio = await hasAudio(file);
  await ffmpeg(['-i', file, '-vf', `ass='${escFilterPath(ass)}'`, ...ENC, ...(audio ? ['-c:a', 'copy'] : ['-an']), '-movflags', '+faststart', out]);
  return out;
}
