// ── smartMontage.js ── مونتاج ذكي لعدة فيديوهات للعميل: "فهم" كل فيديو (وصف بصري + تفريغ الكلام) → مخطط (LLM) بيقرر الترتيب
// واللقطات اللي تفضل وإيه اللي يتكتم → تنفيذ بـffmpeg فقط (قص + جمب كت + زوم + انتقالات + مؤثرات + كابشن + موسيقى).
// المخطط بيتراجع بالكود (حدود الوقت/السرعة/الإجمالي) وفيه خطة احتياطية حتمية لو الـLLM فشل.
import fs from 'fs';
import path from 'path';
import { ffmpeg, probeDuration, hasAudio, rmQuiet } from '../documentary/ff.js';
import { llmJson } from '../documentary/llm.js';
import { montageVideos, displaySize, transcribeAudioFile } from './index.js';
import { splitSentences, planCuts, zoomPlan } from './autoEdit.js';

const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30'];
const MOODS = ['epic', 'documentary', 'tension', 'emotional', 'chill', 'upbeat'];
const MAX_SIDE = 1920;
export const MAX_TOTAL_OUTPUT_SEC = 20 * 60;

const SYSTEM = `You are a professional video editor (YouTube / Reels / TikTok style) with a great sense of pacing. You receive several raw clips the customer filmed or collected, with what each one shows, its length, whether it has speech and, for speech clips, the transcript split into timed sentences. You also receive the customer's wishes (they may be empty — then YOU decide everything).
Return ONLY JSON: {"title":"short title","style":"fast|clean|calm|dramatic","musicMood":"epic|documentary|tension|emotional|chill|upbeat","segments":[{"clip":"V1","start":0.0,"end":8.5,"audio":"keep|mute","speed":1}]}
Rules:
- Segments are played in the order you list them (you may reorder clips). Times are seconds inside that clip.
- Open with a strong hook (the most interesting 2-4 seconds). Cut dead time, repetition and rambling; keep the best moments. Never invent clips.
- Speech clips: choose whole sentences using the transcript timestamps (start at a sentence start, end at a sentence end) and use audio "keep". Non-speech clips (b-roll, scenery, action): choose the best 3-8 second windows and use audio "mute" (music will carry them); "speed" may be 1-1.5 for muted action, otherwise 1.
- If the customer gave a target length or style, follow it. Without one: if the total raw footage is under 90 seconds keep most of it; otherwise aim for 45-120 seconds (or up to about 6 minutes when the speech content clearly deserves it).
- At most 40 segments. Each segment 1-45 seconds.`;

const fmt = (s) => Number(s).toFixed(1);

/** وصف مختصر لكل فيديو للمخطط (مع الجمل المؤقتة للفيديوهات اللي فيها كلام) */
export function describeForPlanner(clips) {
  return clips.map((c, i) => {
    const head = `V${i + 1} "${c.name}" — ${fmt(c.duration)}s — ${c.hasSpeech ? 'HAS SPEECH' : (c.hasAudio ? 'ambient audio only (no clear speech)' : 'no audio')} — shows: ${c.analysis?.description || 'unknown'}`;
    if (!c.hasSpeech || !c.sentences?.length) return head;
    const lines = c.sentences.slice(0, 80).map(s => `  [${fmt(s.start)}-${fmt(s.end)}] ${s.words.map(w => w.w).join(' ').slice(0, 140)}`);
    return `${head}\n${lines.join('\n')}${c.sentences.length > 80 ? '\n  …' : ''}`;
  }).join('\n\n');
}

/** تنظيف الخطة بالكود: كل الأرقام بتتحقق ومفيش حاجة بتتصدّق من الـLLM */
export function sanitizePlan(raw, clips) {
  const byLabel = new Map(clips.map((c, i) => [`V${i + 1}`, c]));
  const segs = [];
  for (const s of Array.isArray(raw?.segments) ? raw.segments : []) {
    const c = byLabel.get(String(s?.clip || '').toUpperCase());
    if (!c) continue;
    let start = Number(s.start), end = Number(s.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    start = Math.max(0, Math.min(start, c.duration - 0.5));
    end = Math.min(c.duration, Math.max(end, start));
    if (end - start < 0.8) continue;
    if (end - start > 45) end = start + 45;
    const keep = s.audio !== 'mute' && c.hasAudio;
    const speed = !keep ? Math.min(1.5, Math.max(1, Number(s.speed) || 1)) : 1;
    segs.push({ clipIndex: clips.indexOf(c), start: Number(start.toFixed(2)), end: Number(end.toFixed(2)), keep, speed });
    if (segs.length >= 40) break;
  }
  let total = 0;
  const limited = [];
  for (const s of segs) { const d = (s.end - s.start) / s.speed; if (total + d > MAX_TOTAL_OUTPUT_SEC) break; total += d; limited.push(s); }
  if (total < 3) return null;
  return {
    title: String(raw?.title || '').slice(0, 90) || null, style: ['fast', 'clean', 'calm', 'dramatic'].includes(raw?.style) ? raw.style : 'fast',
    musicMood: MOODS.includes(raw?.musicMood) ? raw.musicMood : null, segments: limited,
  };
}

/** خطة احتياطية: كل الفيديوهات بترتيبها — الكلام كامل (الصمت بيتقص بعدين)، والباقي أحسن 2×4 ثواني */
export function fallbackPlan(clips) {
  const segments = [];
  clips.forEach((c, i) => {
    if (c.hasSpeech) segments.push({ clipIndex: i, start: 0, end: Math.min(c.duration, 300), keep: true, speed: 1 });
    else if (c.duration <= 10) segments.push({ clipIndex: i, start: 0, end: c.duration, keep: false, speed: 1 });
    else { for (const f of [0.25, 0.65]) { const st = Math.min(c.duration - 4, c.duration * f); segments.push({ clipIndex: i, start: Number(st.toFixed(2)), end: Number((st + 4).toFixed(2)), keep: false, speed: 1 }); } }
  });
  return { title: null, style: 'fast', musicMood: null, segments };
}

export async function planMontage({ clips, instructions = '', ask = llmJson }) {
  const user = `Customer's wishes: ${instructions.trim() ? `"${instructions.trim().slice(0, 600)}"` : '(none — you decide)'}\n\nClips:\n${describeForPlanner(clips)}`;
  try {
    const raw = await ask({ system: SYSTEM, user, maxTokens: 3500, temperature: 0.3 });
    const plan = sanitizePlan(raw, clips);
    if (plan) return { ...plan, source: 'ai' };
  } catch (e) { console.warn('[SmartMontage] planner failed, using fallback:', e.message); }
  return { ...fallbackPlan(clips), source: 'fallback' };
}

function targetSizeFor(clips) {
  let portrait = 0, landscape = 0;
  for (const c of clips) (c.height > c.width ? portrait++ : landscape++);
  const [w, h] = portrait > landscape ? [1080, 1920] : [1920, 1080];
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { W: w * k, H: h * k };
}

async function renderSub({ src, dest, start, len, W, H, srcW, srcH, z0, z1, speed, keepAudio }) {
  const aspectDiff = Math.abs(srcW / srcH - W / H) / (W / H);
  const animated = Math.abs(z1 - z0) > 0.001 && aspectDiff <= 0.15;
  const zExpr = animated ? `(${z0}+(${(z1 - z0).toFixed(4)})*t/${Math.max(0.3, len / speed).toFixed(3)})` : String(z0);
  let vf;
  if (aspectDiff > 0.15) {
    // اتجاه مختلف: الفيديو كامل في النص + خلفية مغبّشة بدل ما نقص جانب كبير منه
    vf = `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:4,eq=brightness=-0.08[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  } else {
    vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    if (animated) vf += `,scale=w='ceil(${W}*${zExpr}/2)*2':h='ceil(${H}*${zExpr}/2)*2':eval=frame,crop=${W}:${H}`;
    else if (z0 > 1.001) vf += `,scale=${Math.ceil((W * z0) / 2) * 2}:${Math.ceil((H * z0) / 2) * 2},crop=${W}:${H}`;
  }
  if (speed !== 1) vf += `,setpts=PTS/${speed}`;
  vf += ',fps=30,format=yuv420p';
  const outLen = len / speed;
  const args = ['-ss', start.toFixed(3), '-t', len.toFixed(3), '-i', src];
  const fade = Math.min(0.03, outLen / 4);
  if (keepAudio) {
    args.push('-filter_complex', `[0:v]${vf}[v];[0:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, outLen - fade).toFixed(3)}:d=${fade}[a]`, '-map', '[v]', '-map', '[a]');
  } else {
    args.push('-f', 'lavfi', '-t', outLen.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo', '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', '-map', '1:a');
  }
  args.push(...ENC, '-c:a', 'aac', '-b:a', '160k', '-t', outLen.toFixed(3), dest);
  await ffmpeg(args);
  return await probeDuration(dest);
}

/**
 * ينفّذ الخطة.
 * @returns {{file,duration,words,transcript,chapters,stats}}
 */
export async function executePlan({ plan, clips, workDir, options = {}, onProgress = () => {} }) {
  fs.mkdirSync(workDir, { recursive: true });
  const { W, H } = targetSizeFor(clips);
  const animate = plan.segments.length <= 24;
  const zooms = options.zoom === false ? null : zoomPlan(200, animate);
  const chapters = [];
  const newWords = [];
  let offset = 0, subIndex = 0, speechSec = 0;
  for (let si = 0; si < plan.segments.length; si++) {
    onProgress({ stage: 'cut', frac: si / plan.segments.length });
    const sg = plan.segments[si];
    const c = clips[sg.clipIndex];
    // أجزاء فرعية: للكلام بنقص الصمت جوه الجزء، غير كده جزء واحد
    let subs = [{ start: sg.start, end: sg.end }];
    if (sg.keep && c.hasSpeech && c.sentences?.length && options.cutSilence !== false) {
      const inRange = c.sentences.filter(s => s.end > sg.start && s.start < sg.end);
      if (inRange.length) {
        subs = planCuts(inRange, c.duration, { cutSilence: true }).map(x => ({ start: Math.max(sg.start, x.start), end: Math.min(sg.end, x.end) })).filter(x => x.end - x.start >= 0.4);
        if (!subs.length) subs = [{ start: sg.start, end: sg.end }];
      }
    }
    const files = [];
    for (const sub of subs) {
      const dest = path.join(workDir, `sub_${subIndex}.mp4`);
      const [z0, z1] = zooms ? zooms[subIndex % zooms.length] : [1, 1];
      const dur = await renderSub({ src: c.file, dest, start: sub.start, len: sub.end - sub.start, W, H, srcW: c.width, srcH: c.height, z0, z1, speed: sg.keep ? 1 : sg.speed, keepAudio: sg.keep });
      if (sg.keep && c.words?.length) {
        for (const w of c.words) if (w.start >= sub.start - 0.02 && w.start < sub.end) newWords.push({ w: w.w, start: offset + Math.max(0, w.start - sub.start), end: offset + Math.min(dur, Math.max(0.05, w.end - sub.start)) });
        speechSec += dur;
      }
      files.push(dest); offset += dur; subIndex++;
    }
    const out = path.join(workDir, `chap_${si}.mp4`);
    if (files.length === 1) fs.renameSync(files[0], out);
    else {
      const list = path.join(workDir, `chap_${si}.txt`);
      fs.writeFileSync(list, files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
      await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
      files.forEach(f => rmQuiet(f));
    }
    chapters.push({ file: out, dur: await probeDuration(out), clip: c.name });
  }
  onProgress({ stage: 'finish', frac: 0 });
  const total = chapters.reduce((a, c) => a + c.dur, 0);
  const speechShare = total ? speechSec / total : 0;
  const capStyle = options.captions && options.captions !== 'none' ? options.captions : null;
  const r = await montageVideos({
    files: chapters.map(c => c.file), workDir: path.join(workDir, 'final'), assumeNormalized: true,
    transitions: chapters.length > 1 && chapters.length <= 40 ? (plan.style === 'calm' ? 'soft' : 'auto') : 'none', sfx: true,
    words: capStyle && newWords.length ? newWords : null,
    captions: capStyle && newWords.length ? { style: capStyle, lang: String(options.language || 'en').split(/[-_]/)[0], position: 'auto', transcribe: false } : null,
    musicFile: options.musicFile || null, musicVolume: speechShare > 0.35 ? 0.1 : 0.24,
  });
  chapters.forEach(c => rmQuiet(c.file));
  let t = 0;
  return {
    file: r.file, duration: r.duration, words: newWords, transcript: newWords.map(w => w.w).join(' '),
    chapters: chapters.map(c => { const o = { t, title: c.clip }; t += c.dur; return o; }),
    stats: { segments: plan.segments.length, subs: subIndex, speechShare: Number(speechShare.toFixed(2)), finalSec: r.duration },
  };
}

/** كل الخطوات: تفريغ كلام الفيديوهات اللي فيها كلام → خطة → تنفيذ */
export async function smartMontage({ assets, workDir, instructions = '', options = {}, onProgress = () => {}, deps = {} }) {
  fs.mkdirSync(workDir, { recursive: true });
  const transcribe = deps.transcribe || transcribeAudioFile;
  const clips = [];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    onProgress({ stage: 'transcribe', frac: i / assets.length });
    const size = await displaySize(a.file).catch(() => null);
    const c = { name: a.name, file: a.file, duration: a.duration, width: size?.w || a.width, height: size?.h || a.height, hasAudio: a.hasAudio, hasSpeech: !!a.analysis?.hasSpeech, analysis: a.analysis, words: null, sentences: null };
    if (c.hasSpeech) {
      const wav = path.join(workDir, `src_${i}.wav`);
      try {
        await ffmpeg(['-i', a.file, '-vn', '-ac', '1', '-ar', '16000', wav]);
        c.words = await transcribe(wav, workDir, options.language || null);
        c.sentences = splitSentences(c.words);
        if (!c.words.length) c.hasSpeech = false;
      } catch (e) { console.warn('[SmartMontage] transcription failed for a clip, treating as no speech:', e.message); c.hasSpeech = false; }
      finally { rmQuiet(wav); }
    }
    clips.push(c);
  }
  if (deps.onTranscript) await deps.onTranscript(clips.flatMap(c => c.words || []));
  onProgress({ stage: 'plan', frac: 0 });
  const plan = await planMontage({ clips, instructions, ask: deps.ask });
  const result = await executePlan({ plan, clips, workDir: path.join(workDir, 'exec'), options, onProgress });
  return { ...result, plan: { title: plan.title, style: plan.style, musicMood: plan.musicMood, source: plan.source }, clips: clips.map(c => ({ name: c.name, duration: c.duration, hasSpeech: c.hasSpeech })) };
}
