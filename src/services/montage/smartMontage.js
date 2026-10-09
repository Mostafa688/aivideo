// ── smartMontage.js ── مونتاج ذكي لعدة فيديوهات للعميل: "فهم" كل فيديو (وصف بصري + تفريغ الكلام) → مخطط (LLM) بيقرر الترتيب
// واللقطات اللي تفضل وإيه اللي يتكتم → تنفيذ بـffmpeg فقط (قص + جمب كت + زوم + انتقالات + مؤثرات + كابشن + موسيقى).
// المخطط بيتراجع بالكود (حدود الوقت/السرعة/الإجمالي) وفيه خطة احتياطية حتمية لو الـLLM فشل.
import fs from 'fs';
import path from 'path';
import { ffmpeg, probeDuration, hasAudio, rmQuiet } from '../documentary/ff.js';
import { llmJson } from '../documentary/llm.js';
import { montageVideos, displaySize, transcribeAudioFile } from './index.js';
import { splitSentences, planCuts, zoomPlan } from './autoEdit.js';
import { buildBeatClip } from '../documentary/clipBuilder.js';
import { sanitizeTemplate, yearsIn, percentsIn } from '../documentary/planner.js';
import { themeFromPalette, scenesNote } from './assets.js';
import { renderMotionScene, composeScenePart } from './motionScenes.js';
import { planCutaways } from './cutaways.js';
import { getTheme } from '../documentary/themes.js';
import { isRtlLang } from '../documentary/textutil.js';

const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', '30'];
const MOODS = ['epic', 'documentary', 'tension', 'emotional', 'chill', 'upbeat'];
const MAX_SIDE = 1920;
export const MAX_TOTAL_OUTPUT_SEC = 20 * 60;

const SYSTEM = `You are a top creative video editor (YouTube / Reels / TikTok / cinematic edits) with a great sense of pacing. You receive the raw clips the customer uploaded: what each one shows (with a timeline of what is on screen at given seconds), its length, whether it has speech and, for speech clips, the transcript split into timed sentences. You also receive the customer's wishes (may be empty — then YOU decide everything) and, sometimes, a STYLE REFERENCE for the motion graphics.
Return ONLY JSON: {"title":"short title","style":"fast|clean|calm|dramatic","musicMood":"epic|documentary|tension|emotional|chill|upbeat","segments":[{"clip":"V1","start":0.0,"end":8.5,"audio":"keep|mute","speed":1,"overlays":[{"at":3.2,"template":"stack_text","data":{"text":"...","emphasis":["word"]}}]}]}
Rules:
- Segments play in the order you list them (you may reorder clips). Times are seconds inside that clip.
- LENGTH: unless the customer asked for a length or for "highlights/shorter", KEEP THE CONTENT: when the raw footage is under ~2.5 minutes use (almost) all of it — at least 85% — because the customer wants THEIR video edited, not shortened. Only longer raw footage gets condensed (45-120 seconds, or up to ~6 minutes when the speech deserves it). Never drop a sentence in the middle of a dialogue or story.
- Open with a strong hook (the most interesting 2-4 seconds may be moved to the start as a teaser ONLY if it does not spoil the story).
- Speech clips: cut at sentence boundaries (use the timestamps) and use audio "keep". Non-speech clips (b-roll, scenery, action): audio "keep" when the clip has meaningful sound (effects, ambience, a cinematic scene), "mute" for silent/noisy footage (music will carry it); "speed" may be 1-1.5 only for muted action.
- MOTION GRAPHICS ("overlays", optional, at most one every ~6 seconds): "at" = the second inside the clip when it appears. Templates: kinetic_text {text,emphasis[]} (punchy phrase of 2-6 words copied EXACTLY from what is said around that moment), stack_text {text,emphasis[]} (2-5 words copied exactly, giant words slamming in — hard-hitting moments), marker_text {text,emphasis[]} (3-8 words copied exactly with a highlighter on the key words — key claims), stamp {text,tone:"red|gold"} (1-3 words said there, slammed like a rubber stamp — verdicts, shocking moments), news_bar {text,tag?} (a headline built from the words said there), side_note {text,tag?} (a short fact said there), bottom_sheet {title?,items[2-4]} (a list that rises from the bottom when the speaker lists things), counter {value,prefix?,suffix?,label?} (a number said there), lower_third {name,role?} (a person who is named). Text must be in the language spoken and come from what is said (or from text the customer explicitly asked to show) — never invent facts. If a STYLE REFERENCE is given, prefer its graphic types.
- SCENES: a clip may list its detected SCENES with what each shows. Cut at scene boundaries (a segment should start at a scene start and end at a scene end when possible) and use the scene descriptions to understand what is where — never start a segment in the middle of a transition.
- At most 40 segments. Each segment 1-45 seconds.`;

const fmt = (s) => Number(s).toFixed(1);

/** وصف مختصر لكل فيديو للمخطط (مع الجمل المؤقتة للفيديوهات اللي فيها كلام) */
export function describeForPlanner(clips) {
  return clips.map((c, i) => {
    const tl = c.analysis?.moments?.length ? ` — timeline: ${c.analysis.moments.map(m => `${fmt(m.t)}s ${m.what}`).join('; ')}` : '';
    const head = `V${i + 1} "${c.name}" — ${fmt(c.duration)}s — ${c.hasSpeech ? 'HAS SPEECH' : (c.hasAudio ? 'ambient audio only (no clear speech)' : 'no audio')} — shows: ${c.analysis?.description || 'unknown'}${tl}${scenesNote(c.analysis, 30)}${c.analysis?.energy ? ` — energy: ${c.analysis.energy}` : ''}`;
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
    const overlays = (Array.isArray(s.overlays) ? s.overlays : (s.overlay ? [s.overlay] : [])).filter(o => o && typeof o === 'object').slice(0, 4);
    segs.push({ clipIndex: clips.indexOf(c), start: Number(start.toFixed(2)), end: Number(end.toFixed(2)), keep, speed, overlays });
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

// العميل طلب طول معيّن أو "ملخص/أقصر"؟ غير كده الفيديو القصير بيفضل بمحتواه كامل
const ASKS_LENGTH = /\d+\s*(s\b|sec|second|ث\b|ثانيه|ثانية|ثواني|دقيقه|دقيقة|دقايق|دقائق|min)|shorter|short version|highlight|trim it|cut it down|summar|recap|اختصر|اختصار|قصّر|قصر|أقصر|اقصر|أهم اللقطات|اهم اللقطات|ملخص|تلخيص/i;
export const asksForLength = (instructions) => ASKS_LENGTH.test(String(instructions || ''));

/** خطة "حافظ على المحتوى": كل مقطع كامل (صوته محفوظ لو فيه صوت) — للفيديوهات القصيرة لما المخطط قصّ كتير من غير طلب */
export function keepAllPlan(clips, base = {}) {
  return { title: base.title || null, style: base.style || 'fast', musicMood: base.musicMood || null, segments: clips.map((c, i) => ({ clipIndex: i, start: 0, end: Number(Math.min(c.duration, 300).toFixed(2)), keep: !!c.hasAudio, speed: 1, overlays: [] })) };
}

export function enforceLength(plan, clips, instructions = '') {
  const raw = clips.reduce((a, c) => a + c.duration, 0);
  const out = plan.segments.reduce((a, sg) => a + (sg.end - sg.start) / (sg.speed || 1), 0);
  if (asksForLength(instructions) || raw > 150 || out >= raw * 0.8) return plan;
  // المخطط قصّ أكتر من 20% من فيديو قصير من غير ما العميل يطلب — بنرجّع المحتوى كامل وبنحتفظ بالجرافيكس المقترحة لكل مقطع
  const kept = keepAllPlan(clips, plan);
  for (const sg of plan.segments) kept.segments[sg.clipIndex].overlays.push(...(sg.overlays || []));
  return { ...kept, lengthRestored: true };
}

export async function planMontage({ clips, instructions = '', style = null, ask = llmJson, dense = false }) {
  const ref = style?.description ? `\n\nSTYLE REFERENCE for the motion graphics: ${style.description}${style.templates?.length ? ` (closest graphic types: ${style.templates.join(', ')})` : ''}` : '';
  const user = `Customer's wishes: ${instructions.trim() ? `"${instructions.trim().slice(0, 600)}"` : '(none — you decide)'}${dense ? '\nThe customer wants MANY motion graphics (a content-creator style): propose an overlay about every 3-4 seconds of speech.' : ''}${ref}\n\nClips:\n${describeForPlanner(clips)}`;
  try {
    const raw = await ask({ system: SYSTEM, user, maxTokens: 4000, temperature: 0.3 });
    const plan = sanitizePlan(raw, clips);
    if (plan) return { ...enforceLength(plan, clips, instructions), source: 'ai' };
  } catch (e) { console.warn('[SmartMontage] planner failed, using fallback:', e.message); }
  return { ...(asksForLength(instructions) ? fallbackPlan(clips) : (clips.reduce((a, c) => a + c.duration, 0) <= 150 ? keepAllPlan(clips) : fallbackPlan(clips))), source: 'fallback' };
}

function targetSizeFor(clips) {
  let portrait = 0, landscape = 0;
  for (const c of clips) (c.height > c.width ? portrait++ : landscape++);
  const [w, h] = portrait > landscape ? [1080, 1920] : [1920, 1080];
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { W: w * k, H: h * k };
}

const even = (x) => Math.max(2, Math.ceil(x / 2) * 2);
// حركات الكاميرا المتبدّلة بين اللقطات (دفع، سحب، بان يمين/شمال، لكمة سريعة)
const MOTIONS = [{ z0: 1, z1: 1.1 }, { pan: 'R' }, { z0: 1.1, z1: 1 }, { pan: 'L' }, { z0: 1, z1: 1.09, fast: true }];
export const motionFor = (i, enabled = true) => (enabled ? MOTIONS[i % MOTIONS.length] : { z0: 1, z1: 1 });

const STEP_LEVELS = [1.12, 1.0, 1.18, 1.05, 1.14, 1.0];
/**
 * نقاط "punch-in" جوه لقطة طويلة (بثواني اللقطة): كل ~3 ثواني، على أقرب فاصل بين كلمتين لو فيه كلام.
 * @param words كلمات بتوقيت نسبي لبداية اللقطة
 */
export function stepKeys(len, words = [], { every = 3.1, min = 2.2, offset = 0 } = {}) {
  if (len < 4.6) return [];
  const gaps = [];
  for (let i = 0; i + 1 < words.length; i++) if (words[i + 1].start - words[i].end >= 0.03) gaps.push((words[i].end + words[i + 1].start) / 2);
  const keys = [];
  let last = 0, k = offset;
  for (let target = every; target < len - min * 0.8; target += every) {
    let t = target;
    if (words.length) {
      const g = gaps.filter(x => Math.abs(x - target) <= 1.1).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
      if (g !== undefined) t = g; else if (words.some(w => target > w.start - 0.05 && target < w.end + 0.05)) continue; // ما نقطعش في نص كلمة
    }
    if (t - last < min || len - t < min * 0.8) continue;
    keys.push({ t: Number(t.toFixed(3)), z: STEP_LEVELS[k++ % STEP_LEVELS.length] });
    last = t;
  }
  return keys;
}

async function renderSub({ src, dest, start, len, W, H, srcW, srcH, z0 = 1, z1 = 1, pan = null, fast = false, speed = 1, keepAudio, loop = false, grade = true, steps = null, flashes = null }) {
  const aspectDiff = Math.abs(srcW / srcH - W / H) / (W / H);
  const blur = aspectDiff > 0.15;
  const L = Math.max(0.3, len); // بالثواني الأصلية (قبل تغيير السرعة)
  const animated = !pan && Math.abs(z1 - z0) > 0.001;
  let vf;
  if (blur) {
    // اتجاه مختلف: الفيديو كامل في النص + خلفية مغبّشة بدل ما نقص جانب كبير منه
    vf = `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=28:4,eq=brightness=-0.08[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  } else {
    vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;
    if (pan) vf += `,scale=${even(W * 1.14)}:${even(H * 1.14)},crop=${W}:${H}:x='(iw-${W})*${pan === 'R' ? `min(t/${L.toFixed(3)},1)` : `(1-min(t/${L.toFixed(3)},1))`}':y='(ih-${H})/2'`;
    else if (animated) {
      const zExpr = fast ? `(${z0}+(${(z1 - z0).toFixed(4)})*min(t/0.45,1))` : `(${z0}+(${(z1 - z0).toFixed(4)})*t/${L.toFixed(3)})`;
      vf += `,scale=w='ceil(${W}*${zExpr}/2)*2':h='ceil(${H}*${zExpr}/2)*2':eval=frame,crop=${W}:${H}`;
    } else if (z0 > 1.001) vf += `,scale=${even(W * z0)}:${even(H * z0)},crop=${W}:${H}`;
  }
  if (steps?.length) {
    // مونتاج "punch-in": قفزات زوم سريعة عند حدود الكلام جوه نفس اللقطة الطويلة (إحساس قطعات من غير ما الصوت يتقطع)
    let prevZ = 1;
    const terms = steps.map(st => { const dz = st.z - prevZ; prevZ = st.z; return `${dz.toFixed(3)}*clip((t-${st.t.toFixed(3)})/0.09,0,1)`; });
    const zE = `(1+${(0.035 / L).toFixed(5)}*t+${terms.join('+')})`;
    vf += `,scale=w='ceil(${W}*${zE}/2)*2':h='ceil(${H}*${zE}/2)*2':eval=frame,crop=${W}:${H}`;
  }
  if (flashes?.length) vf += `,eq=brightness='0.22*(${flashes.map(T => `max(0,1-abs(t-${T.toFixed(3)})/0.08)`).join('+')})':eval=frame`;
  if (grade) vf += ',eq=contrast=1.05:saturation=1.1'; // لون موحّد خفيف يربط اللقطات ببعض (من غير تغميق/فينييت على الأطراف)
  if (speed !== 1) vf += `,setpts=PTS/${speed}`;
  vf += ',fps=30,format=yuv420p';
  const outLen = len / speed;
  const args = [...(loop ? ['-stream_loop', '-1'] : []), '-ss', start.toFixed(3), '-t', len.toFixed(3), '-i', src];
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
export async function executePlan({ plan, clips, workDir, options = {}, style = null, instructions = '', onProgress = () => {} }) {
  fs.mkdirSync(workDir, { recursive: true });
  const { W, H } = targetSizeFor(clips);
  const animate = plan.segments.length <= 24;
  const zooms = options.zoom === false ? null : zoomPlan(200, animate);
  const chapters = [];
  const newWords = [];
  const subsMap = []; // {ci, start, end, offset, speed} — عشان نحوّل توقيت جوه المقطع لتوقيت الفيديو النهائي
  const stepSfx = [];
  let offset = 0, subIndex = 0, speechSec = 0, stepCount = 0;
  // مشاهد موشن كاملة (cutaways) بتحل مكان لقطات من الفيديو الأصلي والصوت الأصلي بيكمّل: بنقسم الجزء عند حدودها (لقطة ← مشهد ← لقطة)
  const cutaways = options.cutaways === false || options.mode === 'transitions' ? [] : (Array.isArray(plan.cutaways) ? plan.cutaways : []);
  const sceneWins = []; // نوافذ ظهور المشاهد في الفيديو النهائي — الكابشن والجرافيكس الصغيرة بتفضل برّاها
  const sceneTheme = (() => { const t = style?.theme || (plan.style === 'dramatic' || ['epic', 'tension'].includes(plan.musicMood) ? 'cinematic' : 'blue'); return typeof t === 'string' ? getTheme(t) : t; })();
  const sceneLang = captionLang(clips.flatMap(c => c.words || []), options.language);
  for (let si = 0; si < plan.segments.length; si++) {
    onProgress({ stage: 'cut', frac: si / plan.segments.length });
    const sg = plan.segments[si];
    const c = clips[sg.clipIndex];
    // أجزاء فرعية: قص الصمت بس لما الجزء أغلبه كلام (فلوج/شرح) — المشاهد السينمائية/الحوار مع مؤثرات بتفضل كاملة
    let subs = [{ start: sg.start, end: sg.end }];
    if (sg.keep && c.hasSpeech && c.sentences?.length && options.cutSilence !== false) {
      const inRange = c.sentences.filter(s => s.end > sg.start && s.start < sg.end);
      const spoken = inRange.reduce((a, s) => a + (Math.min(sg.end, s.end) - Math.max(sg.start, s.start)), 0);
      if (inRange.length && spoken / Math.max(0.1, sg.end - sg.start) >= 0.55) {
        subs = planCuts(inRange, c.duration, { cutSilence: true }).map(x => ({ start: Math.max(sg.start, x.start), end: Math.min(sg.end, x.end) })).filter(x => x.end - x.start >= 0.4);
        if (!subs.length) subs = [{ start: sg.start, end: sg.end }];
      }
    }
    const files = [];
    for (const sub of subs) {
      const dest = path.join(workDir, `sub_${subIndex}.mp4`);
      const speed = sg.keep ? 1 : sg.speed;
      const len = sub.end - sub.start;
      // لقطة طويلة: قفزات زوم على حدود الكلام (punch-in) بدل زوم واحد بطيء؛ القصيرة: حركة كاميرا متبدّلة
      const relWords = (c.words || []).filter(w => w.start >= sub.start && w.end <= sub.end).map(w => ({ start: w.start - sub.start, end: w.end - sub.start }));
      const subCuts = cutaways.filter(k => k.clipIndex === sg.clipIndex && sg.keep && c.hasSpeech && k.start >= sub.start + 0.1 && k.end <= sub.end - 0.1).sort((a, b) => a.start - b.start);
      const steps = options.zoom === false || subCuts.length ? [] : stepKeys(len, sg.keep && c.hasSpeech ? relWords : [], { offset: stepCount });
      const flashes = steps.filter((_, k) => (stepCount + k) % 3 === 2).map(st => st.t);
      stepCount += steps.length;
      const mo = steps.length ? { z0: 1, z1: 1 } : (sg.keep ? (() => { const [a, b] = zooms ? zooms[subIndex % zooms.length] : [1, 1]; return { z0: a, z1: b }; })() : motionFor(subIndex, options.zoom !== false && animate));
      let dur;
      if (subCuts.length) {
        // لقطة ← مشهد موشن (بصوت الفيديو الأصلي لنفس الفترة) ← لقطة تكمّل من نفس نقطة الصوت: التقسيم بيحافظ على الطول والصوت من غير أي قطع
        const parts = []; let cursor = sub.start, rel = 0;
        const addFootage = async (a, b) => {
          const pl = b - a; if (pl < 0.25) return;
          const pw = (c.words || []).filter(w => w.start >= a && w.end <= b).map(w => ({ start: w.start - a, end: w.end - a }));
          const stp = options.zoom === false ? [] : stepKeys(pl, c.hasSpeech ? pw : [], { offset: stepCount });
          const fl = stp.filter((_, k) => (stepCount + k) % 3 === 2).map(st => st.t);
          stepCount += stp.length;
          const mo2 = stp.length ? { z0: 1, z1: 1 } : (() => { const [za, zb] = zooms ? zooms[(subIndex + parts.length) % zooms.length] : [1, 1]; return { z0: za, z1: zb }; })();
          const pf = path.join(workDir, `sub_${subIndex}_p${parts.length}.mp4`);
          const pd = await renderSub({ src: c.file, dest: pf, start: a, len: pl, W, H, srcW: c.width, srcH: c.height, ...mo2, speed: 1, keepAudio: true, steps: stp, flashes: fl });
          for (const st of stp) stepSfx.push({ t: offset + rel + st.t - 0.03, type: fl.includes(st.t) ? 'impact' : 'swish', vol: fl.includes(st.t) ? 0.26 : 0.14 });
          parts.push(pf); rel += pd;
        };
        for (const k of subCuts) {
          await addFootage(cursor, Math.max(cursor, k.start));
          const kStart = Math.max(cursor, k.start), kLen = k.end - kStart;
          const fdir = path.join(workDir, `scene_${subIndex}_${parts.length}`);
          const frames = await renderMotionScene({ scene: k.scene, dur: kLen, w: W, h: H, theme: sceneTheme, lang: sceneLang, dir: fdir, scale: 0.75 });
          const sf = path.join(workDir, `sub_${subIndex}_p${parts.length}.mp4`);
          await composeScenePart({ frames, src: c.file, srcStart: kStart, len: kLen, dest: sf, W, H, enc: ENC });
          rmQuiet(fdir);
          sceneWins.push([offset + rel, offset + rel + kLen]);
          stepSfx.push({ t: offset + rel + 0.02, type: 'impact', vol: 0.3 }, { t: offset + rel + kLen - 0.12, type: 'swish', vol: 0.16 });
          parts.push(sf); rel += kLen; cursor = k.end;
        }
        await addFootage(cursor, sub.end);
        const lst = path.join(workDir, `sub_${subIndex}_parts.txt`);
        fs.writeFileSync(lst, parts.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
        await ffmpeg(['-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', dest]);
        parts.forEach(f => rmQuiet(f)); rmQuiet(lst);
        dur = await probeDuration(dest);
      } else {
        dur = await renderSub({ src: c.file, dest, start: sub.start, len, W, H, srcW: c.width, srcH: c.height, ...mo, speed, keepAudio: sg.keep, steps, flashes });
      }
      for (const st of steps) stepSfx.push({ t: offset + st.t / speed - 0.03, type: flashes.includes(st.t) ? 'impact' : 'swish', vol: flashes.includes(st.t) ? 0.26 : 0.14 });
      subsMap.push({ ci: sg.clipIndex, start: sub.start, end: sub.end, offset, speed, si });
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
  const lang = captionLang(newWords, options.language);
  const portraitShort = H > W && total <= 180;

  // موشن جرافيك: (1) طلبات العميل بالاسم (2) اقتراحات المخطط بعد التحقق (3) عبارات قوية من الكلام تلقائيًا
  const ovs = [];
  if (options.motionGraphics !== false) {
    ovs.push(...placeCustomerGraphics(options.graphics, newWords, total).map(o => ({ ...o, prio: 2 })));
    const mapT = (ci, t) => { const m = subsMap.find(x => x.ci === ci && t >= x.start - 0.05 && t < x.end + 0.05); return m ? m.offset + (Math.min(t, m.end) - m.start) / m.speed : null; };
    plan.segments.forEach((sg) => {
      for (const o of sg.overlays || []) {
        const ct = Number.isFinite(Number(o?.at)) ? Math.max(sg.start, Math.min(sg.end - 0.5, Number(o.at))) : sg.start + 0.4;
        const at = mapT(sg.clipIndex, ct);
        if (at === null) continue;
        const ov = sanitizeOverlay(o, inWindow(newWords, at - 0.6, at + 4.5), instructions);
        if (ov) ovs.push({ ...timeOverlay(ov, at, newWords), prio: 1 });
      }
    });
    if (newWords.length) ovs.push(...autoPhraseOverlays(newWords, total, [...ovs, ...sceneWins.map(([a, b]) => ({ at: a, dur: b - a }))], style?.templates, { dense: options.graphicsLevel === 'high' }).map(o => ({ ...o, prio: 0 })));
    ovs.push(...autoExtraOverlays(newWords, total, [...ovs, ...sceneWins.map(([a, b]) => ({ at: a, dur: b - a }))], { dense: options.graphicsLevel === 'high' }));
  }
  const overlays = resolveOverlays(ovs.filter(o => (o.prio || 0) >= 2 || !sceneWins.some(([a, b]) => o.at < b + 0.2 && a < o.at + o.dur + 0.2)), total);
  const extraSfx = [{ t: 0.04, type: 'impact', vol: 0.45 }, ...stepSfx, ...overlays.flatMap(o => overlaySfx(o, o.at))];
  const hideCaps = [...overlays.filter(o => hidesCaptions(o.template, portraitShort)).map(o => [o.at - 0.05, o.at + o.dur - 0.2]), ...sceneWins.map(([a, b]) => [a - 0.05, b + 0.02])];
  const theme = style?.theme || (plan.style === 'dramatic' || ['epic', 'tension'].includes(plan.musicMood) ? 'cinematic' : 'blue');
  const r = await montageVideos({
    files: chapters.map(c => c.file), workDir: path.join(workDir, 'final'), assumeNormalized: true,
    transitions: chapters.length > 1 && chapters.length <= 40 ? (plan.style === 'calm' ? 'soft' : 'auto') : 'none', transitionStyle: plan.style === 'calm' ? 'auto' : 'punchy', sfx: true,
    words: capStyle && newWords.length ? newWords.filter(w => !hideCaps.some(([a, b]) => (w.start + w.end) / 2 >= a && (w.start + w.end) / 2 <= b)) : null,
    captions: capStyle && newWords.length ? { style: capStyle, lang, position: 'auto', transcribe: false } : null,
    musicFile: options.musicFile || null, musicVolume: speechShare > 0.35 ? 0.1 : 0.22, extraSfx,
    overlays: overlays.map(({ template, data, at, dur }) => ({ template, data, at, dur })), overlayTheme: theme,
  });
  chapters.forEach(c => rmQuiet(c.file));
  let t = 0;
  return {
    file: r.file, duration: r.duration, words: newWords, transcript: newWords.map(w => w.w).join(' '),
    chapters: chapters.map(c => { const o = { t, title: c.clip }; t += c.dur; return o; }),
    stats: { segments: plan.segments.length, subs: subIndex, scenes: sceneWins.length, punchIns: stepCount, graphics: overlays.length, speechShare: Number(speechShare.toFixed(2)), finalSec: r.duration, lengthRestored: !!plan.lengthRestored },
  };
}

// ── موشن جرافيك على الفيديو كله (المونتاج العادي + طلبات العميل) ──────────────────────────────────────
const OV_DUR = { corner_frame: 1.8, wipe_bars: 0.9, stamp: 2.2, counter: 2.8, lower_third: 3.6, news_bar: 3.6, side_note: 3.6, bottom_sheet: 4.4, bullet_panel: 4.4, icon_pop: 3.6, percent_ring: 3, date_card: 3 };
const TOP_OR_SIDE = new Set(['news_bar', 'side_note']);
/** الكابشن يختفي وقت الجرافيك اللي بيغطي نفس المكان (عشان الكلام ما يتكتبش مرتين ولا يتراكب) */
export function hidesCaptions(template, centeredCaptions) {
  if (template === 'corner_frame' || template === 'wipe_bars') return false; // زخرفة متحركة من غير نص — الكابشن يفضل ظاهر
  if (PHRASE_TEMPLATES.has(template) || template === 'stamp') return true;
  if (TOP_OR_SIDE.has(template)) return false;
  return centeredCaptions ? template !== 'lower_third' : ['bottom_sheet', 'lower_third', 'bullet_panel'].includes(template);
}

/** توقيت الجرافيك: نصوص الكلام بتظهر لحظة ما العبارة بتتقال وبتفضل لحد ما تخلص (+ثانية) */
function timeOverlay(ov, at, words) {
  if (PHRASE_TEMPLATES.has(ov.template) || ov.template === 'stamp') {
    const sp = phraseSpan(inWindow(words, at - 0.6, at + 5), ov.data.text);
    if (sp) return { ...ov, at: Math.max(0, sp.start - 0.12), dur: Math.min(4.4, Math.max(1.8, sp.end - sp.start + 1.1)) };
  }
  return { ...ov, at: Math.max(0, at), dur: OV_DUR[ov.template] || 3.2 };
}

/** طلبات العميل ("ضيف كلمة X بموشن قوي في الأول/الآخر/لما يقول Y") → جرافيك بتوقيت مضبوط */
export function placeCustomerGraphics(graphics, words, total) {
  const out = [];
  for (const g of Array.isArray(graphics) ? graphics : []) {
    const text = String(g?.text || '').trim();
    if (!text) continue;
    const style = g.style || 'stack_text';
    let at;
    if (typeof g.at === 'number') at = g.at;
    else if (g.at === 'end') at = total - (OV_DUR[style] || 3.2) - 0.4;
    else if (g.at === 'middle') at = total / 2;
    else if (!g.at || g.at === 'start') at = 0.35;
    else { const sp = phraseSpan(words, g.at); at = sp ? sp.start : 0.35; }
    at = Math.max(0.1, Math.min(total - 1.4, at));
    const words1 = text.split(/\s+/);
    const emphasis = [...words1].sort((a, b) => b.length - a.length).slice(0, 1).map(w => w.replace(/[^\p{L}\p{N}]/gu, ''));
    const raw = style === 'stamp' ? { text, tone: 'red' } : style === 'news_bar' || style === 'side_note' ? { text } : style === 'bottom_sheet' ? { title: text, items: g.items || [] } : style === 'lower_third' ? { name: text } : { text: style === 'stack_text' ? words1.slice(0, 6).join(' ') : text, emphasis };
    const data = sanitizeTemplate(style, raw, [text, ...(g.items || [])].join(' '));
    if (!data) continue;
    out.push({ template: style, data, at, dur: Math.min(OV_DUR[style] || 3.4, total - at - 0.1) });
  }
  return out;
}

/** عبارات قوية من الكلام كل ~6-7 ثواني (من غير ما تقرب من جرافيك تاني) */
export function autoPhraseOverlays(words, total, existing = [], preferred = [], { dense = false } = {}) {
  const rot = (preferred || []).filter(t => ['stack_text', 'kinetic_text', 'marker_text'].includes(t));
  const order = rot.length ? [...rot, ...['stack_text', 'kinetic_text', 'marker_text'].filter(t => !rot.includes(t))] : ['stack_text', 'kinetic_text', 'marker_text'];
  const out = [];
  let k = 0, last = -99;
  for (const sen of splitSentences(words)) {
    if (sen.start < 0.8 && total > 10) continue;
    if (sen.start - last < (dense ? 3.2 : 4.6)) continue;
    if ([...existing, ...out].some(o => Math.abs(o.at - sen.start) < (dense ? 2.4 : 3.6))) continue;
    const win = sen.words.filter(w => w.start < sen.start + 3.6);
    const ov = autoKinetic(win, order[k % order.length]);
    if (!ov) continue;
    out.push(timeOverlay(ov, sen.start, words)); k++; last = sen.start;
    if (out.length >= Math.max(2, Math.round(total / (dense ? 3.6 : 5)))) break;
  }
  return out;
}

/** جرافيكس إضافي من الكلام نفسه + زخرفة متحركة: سنة → date_card، نسبة → percent_ring (متأرضين في الجملة)، وإطار/مسحة متحركة من غير نص —
 *  عشان فيديو الكلام (فلوج/شرح) ما يطلعش "عريان" حتى لو الكلام قليل. بتتحط في الفراغات بس (الأولوية للعبارات وطلبات العميل). */
export function autoExtraOverlays(words, total, existing = [], { dense = false } = {}) {
  const out = [];
  const taken = (at, dur) => [...existing, ...out].some(o => at < o.at + o.dur + 0.5 && o.at < at + dur + 0.5);
  const add = (template, data, at, dur) => { if (at < 0.1 || at > total - 1.3 || taken(at, dur)) return false; out.push({ template, data, at, dur: Math.min(dur, total - at - 0.1), prio: -1 }); return true; };
  let years = 0, pcs = 0;
  for (const sen of splitSentences(words || [])) {
    const text = sen.words.map(w => w.w).join(' ');
    const at = (needle) => (sen.words.find(w => normW(w.w).includes(needle)) || sen.words[0]).start;
    if (years < 3) { const ys = yearsIn(text); const data = ys.length ? sanitizeTemplate('date_card', { year: ys[0] }, text) : null; if (data && add('date_card', data, at(String(ys[0])), OV_DUR.date_card)) years++; }
    if (pcs < 2) { const ps = percentsIn(text); const data = ps.length ? sanitizeTemplate('percent_ring', { value: ps[0] }, text) : null; if (data && add('percent_ring', data, at(String(ps[0])), OV_DUR.percent_ring)) pcs++; }
  }
  add('wipe_bars', {}, 0.15, OV_DUR.wipe_bars);
  const step = dense ? 4.2 : 7.2;
  for (let t = 2.2; t < total - 2; t += step) add('corner_frame', {}, t, OV_DUR.corner_frame);
  return out;
}

/** ترتيب نهائي: من غير تراكب (الأولوية لطلب العميل، ثم المخطط، ثم التلقائي) */
export function resolveOverlays(list, total) {
  const sorted = [...list].filter(o => o.at < total - 0.8).sort((a, b) => (b.prio || 0) - (a.prio || 0) || a.at - b.at);
  const kept = [];
  for (const o of sorted) {
    const dur = Math.min(o.dur, total - o.at - 0.05);
    if (dur < 0.9) continue;
    if (kept.some(x => o.at < x.at + x.dur + 0.4 && x.at < o.at + dur + 0.4)) continue;
    kept.push({ ...o, dur });
  }
  return kept.sort((a, b) => a.at - b.at);
}


// ════════════════════════════ وضع الفويس-أوفر ════════════════════════════
// العميل رافع تعليق صوتي: الفيديو كله بيتبني على مدته (الصوت هو المرجع)، صوت المقاطع بيتقفل، والمشاهد بتتوزّع على الكلام
// بترتيب منطقي وبتتقطع عند حدود الجمل/الكلمات عشان الصورة تتزامن مع اللي بيتقال.
const VO_MIN_SHOT = 1.8, VO_MAX_SHOT = 8, VO_TAIL = 0.45;

const SYSTEM_VO = `You are a professional video editor (documentary / YouTube / Reels). The customer recorded a voiceover and uploaded several raw clips. You must lay the clips over the narration so that every picture matches what is being said at that moment, with strong pacing. All clip audio will be muted — only the voiceover plays (plus music/effects added by the system).
You receive: the narration as timed sentences, its total duration, the customer's wishes (may be empty), and the clips (label, name, length, what it shows). The clips are listed in the customer's intended order: when the file names are numbered (1.1, 1.2, … or clip2, clip10) that numbering is the story order — keep it unless the narration clearly requires another order.
Return ONLY JSON: {"style":"fast|clean|calm|dramatic","musicMood":"epic|documentary|tension|emotional|chill|upbeat","shots":[{"clip":"V1","start":0.0,"until":4.2,"overlay":{"template":"kinetic_text","data":{"text":"...","emphasis":["word"]}}}]}
Rules:
- "shots" play in order and cover the narration from 0 to its end. "until" = the narration time (seconds) where this shot ends (strictly increasing; the last one equals the narration duration). "start" = the second inside the clip where the shot begins (choose the most interesting part, avoid the first/last 0.3s).
- Match meaning: when the narration talks about something a clip shows, use that clip at that moment. Use EVERY clip at least once unless it is unusable (black, shaky, blurry); a good clip can be used again later with a different "start".
- Pace: shots of 2-6 seconds (up to 8 for calm moments); change picture at sentence or clause boundaries. Open with the most striking visual for the hook.
- Be creative with MOTION GRAPHICS: about every second shot may carry an "overlay" (optional field) animated on top of the picture: kinetic_text {text,emphasis[]} = a punchy phrase of 2-6 words copied EXACTLY from the narration of that shot (words pop in big, the emphasis words are enlarged and recoloured); stack_text {text,emphasis[]} = 2-5 words copied exactly, stacked as giant words slamming in one under the other — for hard-hitting moments; marker_text {text,emphasis[]} = a phrase of 3-8 words copied exactly with a highlighter marker swiping over the emphasis words — for key claims. Mix the three styles across the film; use them for the strongest phrases, claims, numbers and turning points; counter {value,prefix?,suffix?,label?} = one striking number written in the narration (not a year); lower_third {name,role?} = the first time a real person is named; quote {text,author?} = a sentence quoted in the narration; bullet_panel {title?,bullets[2-5]} = an enumeration spoken in the narration. All overlay text must come from what is actually said in that shot — never invent facts or numbers, and use the narration's language. Never put an overlay on two consecutive shots.
- SCENES: a clip may list its detected SCENES (cuts) with what each shows — this is how you SEE a long video. When the customer uploaded ONE long video made of several scenes, treat each scene as its own shot source: for every narration moment pick the scene whose content matches what is being said, set "start" to that scene's start (shots should stay inside one scene when possible), use the scenes in the order that follows the narration's meaning, and reuse a scene with a different "start" only when needed. A short scene is slowed slightly to fill its shot, a long one is trimmed — the system does that.
- At most 60 shots. Never invent clips.`;

/** حدود القطع الممكنة: نهايات الكلمات (القطع بين كلمتين، مش في نص كلمة) */
function cutPoints(words) { return words.map(w => w.end).filter(Number.isFinite).sort((a, b) => a - b); }
const snapTo = (t, points, tol = 0.7) => { let best = null; for (const p of points) { if (Math.abs(p - t) <= tol && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p; } return best ?? t; };

export function describeForVoicePlanner(clips, narr) {
  const lines = narr.sentences.slice(0, 160).map(s => `[${fmt(s.start)}-${fmt(s.end)}] ${s.words.map(w => w.w).join(' ').slice(0, 160)}`);
  const cl = clips.map((c, i) => `V${i + 1} "${c.name}" — ${fmt(c.duration)}s — shows: ${c.analysis?.description || 'unknown'}${scenesNote(c.analysis, 30)}`);
  return `Narration (${fmt(narr.duration)}s):\n${lines.join('\n')}\n\nClips:\n${cl.join('\n')}`;
}

/** بداية اللقطة جوه مقطع طويل فيه مشاهد مكتشفة: لو قريبة من بداية مشهد (أو أول 0.8ث منه) نبدأ من بداية المشهد بالظبط — عشان مانبدأش وسط انتقال */
export function snapToSceneStart(clip, start) {
  const sc = clip?.analysis?.scenes;
  if (!Array.isArray(sc) || sc.length < 2) return start;
  const cur = sc.find(x => start >= x.start - 0.01 && start < x.end);
  if (cur && start - cur.start <= 0.8) return cur.start + 0.05;
  const next = sc.find(x => x.start > start && x.start - start <= 0.5);
  return next ? next.start + 0.05 : start;
}

/** تحقق بالكود من خطة الـLLM: توقيتات متزايدة، لقطات 1.8-8 ثانية، قطع عند حدود الكلمات، تغطية الصوت بالكامل */
export function sanitizeVoicePlan(raw, clips, narr) {
  const D = narr.duration;
  const points = cutPoints(narr.words);
  const byLabel = new Map(clips.map((c, i) => [`V${i + 1}`, i]));
  const picks = [];
  let prev = 0;
  for (const s of Array.isArray(raw?.shots) ? raw.shots : []) {
    const ci = byLabel.get(String(s?.clip || '').toUpperCase());
    let until = Number(s?.until);
    if (ci === undefined || !Number.isFinite(until)) continue;
    until = Math.min(D, snapTo(until, points));
    if (until - prev < VO_MIN_SHOT) { if (until >= D - 0.05 && picks.length) picks[picks.length - 1].until = D; continue; }
    picks.push({ clipIndex: ci, start: snapToSceneStart(clips[ci], Number(s.start) || 0), until, overlay: s.overlay });
    prev = until;
    if (until >= D - 0.05 || picks.length >= 60) break;
  }
  if (!picks.length) return null;
  picks[picks.length - 1].until = D;
  // لقطات أطول من الحد: بنقسمها (نفس المقطع بيكمّل من بعد نقطته)
  const shots = [];
  let t0 = 0;
  for (const p of picks) {
    let span = p.until - t0, off = p.start;
    const parts = Math.max(1, Math.ceil(span / VO_MAX_SHOT));
    for (let k = 0; k < parts; k++) { const len = span / parts; shots.push({ clipIndex: p.clipIndex, start: off, dur: len, overlay: k === 0 ? p.overlay : undefined }); off += len; }
    t0 = p.until;
  }
  return { title: null, style: ['fast', 'clean', 'calm', 'dramatic'].includes(raw?.style) ? raw.style : 'fast', musicMood: MOODS.includes(raw?.musicMood) ? raw.musicMood : null, shots: fitShots(shots, clips) };
}

/** كل لقطة تتظبط على مقطعها: بداية صالحة، وبطء/تكرار لو المقطع أقصر من المطلوب */
function fitShots(shots, clips) {
  return shots.map((s) => {
    const c = clips[s.clipIndex];
    let start = Math.max(0, Math.min(s.start, Math.max(0, c.duration - s.dur - 0.05)));
    let speed = 1, loop = false, len = s.dur;
    if (c.duration - start < s.dur) { // المتبقي من المقطع أقصر من اللقطة: نبدأ من أوله ونبطّئ شوية، ولو لسه أقصر نكرر
      start = 0; speed = Math.max(0.7, Math.min(1, c.duration / s.dur));
      len = Math.min(c.duration, s.dur * speed); loop = c.duration < s.dur * speed - 0.05; if (loop) len = s.dur * speed;
    }
    return { clipIndex: s.clipIndex, start: Number(start.toFixed(2)), len: Number(len.toFixed(3)), speed, loop, dur: Number(s.dur.toFixed(3)), overlay: s.overlay };
  });
}

/** خطة احتياطية: لقطات ~4 ثواني متوزّعة على الكلام بنسبة أطوال المقاطع وبترتيبها، وكل مقطع بيتستخدم */
export function fallbackVoicePlan(clips, narr) {
  const D = narr.duration;
  const points = cutPoints(narr.words);
  const n = Math.max(1, Math.round(D / 4));
  const cuts = [];
  for (let i = 1; i < n; i++) cuts.push(Math.min(D - 0.5, Math.max(cuts[cuts.length - 1] || 0, snapTo((D * i) / n, points, 1.0))));
  cuts.push(D);
  const durs = []; let p = 0; for (const c of cuts) { durs.push(c - p); p = c; }
  const total = clips.reduce((a, c) => a + c.duration, 0) || 1;
  // عدد اللقطات لكل مقطع بنسبة طوله (على الأقل 1 لو اللقطات تكفي، ولو أقل من المقاطع بنختار مقاطع موزّعة بالتساوي)
  const m = durs.length;
  let counts;
  if (m < clips.length) { counts = clips.map(() => 0); for (let k = 0; k < m; k++) counts[Math.floor(((k + 0.5) * clips.length) / m)] = 1; }
  else {
    const ideal = clips.map(c => (m * c.duration) / total);
    counts = ideal.map(x => Math.max(1, Math.floor(x)));
    let sum = counts.reduce((a, b) => a + b, 0);
    while (sum < m) { let bi = 0, bv = -1; ideal.forEach((x, i) => { const v = x - counts[i]; if (v > bv) { bv = v; bi = i; } }); counts[bi]++; sum++; }
    while (sum > m) { let bi = 0, bv = -1; counts.forEach((c, i) => { if (c > 1 && counts[i] - ideal[i] > bv) { bv = counts[i] - ideal[i]; bi = i; } }); if (bv < 0) break; counts[bi]--; sum--; }
  }
  const order = [];
  clips.forEach((c, i) => { for (let k = 0; k < counts[i]; k++) order.push({ i, k, of: counts[i] }); });
  const shots = durs.map((d, idx) => {
    const o = order[Math.min(idx, order.length - 1)];
    const c = clips[o.i];
    const start = Math.max(0, (c.duration - d) * ((o.k + 0.5) / o.of));
    return { clipIndex: o.i, start, dur: d };
  });
  return { title: null, style: 'fast', musicMood: null, shots: fitShots(shots, clips) };
}


// ── موشن جرافيك فوق المشاهد (نفس قوالب الأفلام الوثائقية): نصوص بتظهر بحركة، كلمات مهمة بتكبر وتتغير ألوانها، أرقام، أسماء... ──
const OVERLAY_TEMPLATES = new Set(['kinetic_text', 'stack_text', 'marker_text', 'lower_third', 'counter', 'quote', 'bullet_panel', 'stamp', 'news_bar', 'side_note', 'bottom_sheet']);
const PHRASE_TEMPLATES = new Set(['kinetic_text', 'stack_text', 'marker_text', 'quote']); // قوالب نص من الكلام (الكابشن بيختفي وقت ظهورها)
const normW = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const inWindow = (words, t0, t1) => words.filter(w => w.start >= t0 - 0.05 && w.start < t1);
const mostlySaid = (s, set) => { const ws = String(s).split(/\s+/).map(normW).filter(Boolean); return ws.length > 0 && ws.filter(x => set.has(x)).length / ws.length >= 0.7; };

/** تحقق من overlay جاي من الـLLM: القالب مسموح، البيانات سليمة، والنص مأخوذ من كلام اللقطة فعلاً (مفيش اختراع) */
export function sanitizeOverlay(raw, win, extraText = '') {
  if (!raw || !OVERLAY_TEMPLATES.has(raw.template)) return null;
  const extra = String(extraText || '').split(/\s+/).map(w => ({ w }));
  const all = [...win, ...extra];
  if (!all.length) return null;
  const text = all.map(w => w.w).join(' ');
  const data = sanitizeTemplate(raw.template, raw.data, text);
  if (!data) return null;
  const said = new Set(all.map(w => normW(w.w)).filter(Boolean));
  if (['stamp', 'news_bar', 'side_note'].includes(raw.template) && !mostlySaid(data.text, said)) return null;
  if (raw.template === 'bottom_sheet' && data.items.filter(b => mostlySaid(b, said)).length < Math.ceil(data.items.length / 2)) return null;
  if (PHRASE_TEMPLATES.has(raw.template) && !mostlySaid(data.text, said)) return null;
  if (raw.template === 'stack_text' && data.text.split(/\s+/).length > 6) return null;
  if (raw.template === 'lower_third' && !mostlySaid(data.name, said)) return null;
  if (raw.template === 'bullet_panel' && data.bullets.filter(b => mostlySaid(b, said)).length < Math.ceil(data.bullets.length / 2)) return null;
  if (raw.template === 'counter' && Number.isInteger(data.value) && data.value >= 1800 && data.value <= 2100 && !data.suffix && !data.prefix) return null; // سنة مش عدّاد
  return { template: raw.template, data };
}

/** نص قوي من كلام اللقطة (2-6 كلمات) مع كلمات التأكيد — بنستخدمه لما الـLLM ما يديش overlay */
export function autoKinetic(win, template = 'kinetic_text') {
  if (win.length < 3) return null;
  // عبارات: نقطع عند علامات الترقيم، ونختار أطول عبارة (≤ 6 كلمات) أو أول 5 كلمات
  const clauses = []; let cur = [];
  for (const w of win) { cur.push(w); if (/[.,;:!?،؛؟…]$/.test(w.w)) { clauses.push(cur); cur = []; } }
  if (cur.length) clauses.push(cur);
  let best = clauses.filter(c => c.length >= 2 && c.length <= 6).sort((a, b) => b.reduce((x, w) => x + w.w.length, 0) - a.reduce((x, w) => x + w.w.length, 0))[0];
  if (!best) best = win.slice(0, Math.min(5, win.length));
  const text = best.map(w => w.w.replace(/[.,;:!?،؛؟…]+$/, '')).join(' ');
  const emphasis = [...best].map(w => w.w.replace(/[^\p{L}\p{N}]/gu, '')).filter(w => w.length >= 4).sort((a, b) => b.length - a.length).slice(0, 2);
  const max = template === 'stack_text' ? 4 : 99;
  const trimmed = text.split(/\s+/).slice(0, max).join(' ');
  const data = sanitizeTemplate(template, { text: trimmed, emphasis }, trimmed);
  return data ? { template, data } : null;
}

/** بيحسب لكل لقطة نافذة كلامها ويثبّت الـoverlay (من الـLLM بعد التحقق، أو تلقائي كل لقطة تانية) — مفيش لقطتين ورا بعض */
export function finalizeOverlays(shots, narr, { dense = false } = {}) {
  let t0 = 0, prev = false, autoCount = 0;
  shots.forEach((s, i) => {
    const t1 = t0 + s.dur;
    const win = inWindow(narr.words, t0, t1);
    let ov = sanitizeOverlay(s.overlay, win);
    if (!ov && !prev && (dense || i % 2 === 0)) ov = autoKinetic(win, ['kinetic_text', 'marker_text', 'stack_text'][autoCount++ % 3]);
    if (ov && prev) ov = null;
    if (s.dur < 1.6) ov = null;
    s.overlay = ov || null;
    prev = !!ov;
    t0 = t1;
  });
  return shots;
}

export async function planVoiceover({ clips, narr, instructions = '', style = null, ask = llmJson, dense = false }) {
  const ref = style?.description ? `\n\nSTYLE REFERENCE for the motion graphics: ${style.description}${style.templates?.length ? ` (prefer: ${style.templates.join(', ')})` : ''}` : '';
  const user = `Customer's wishes: ${instructions.trim() ? `"${instructions.trim().slice(0, 600)}"` : '(none — you decide)'}${dense ? '\nThe customer wants MANY motion graphics: put an overlay on almost every shot that has a strong phrase.' : ''}${ref}\n\n${describeForVoicePlanner(clips, narr)}`;
  try {
    const raw = await ask({ system: SYSTEM_VO, user, maxTokens: 4500, temperature: 0.3 });
    const plan = sanitizeVoicePlan(raw, clips, narr);
    if (plan && plan.shots.length >= Math.min(2, Math.ceil(narr.duration / VO_MAX_SHOT))) { finalizeOverlays(plan.shots, narr, { dense }); return { ...plan, source: 'ai' }; }
  } catch (e) { console.warn('[SmartMontage] voiceover planner failed, using fallback:', e.message); }
  const fb = fallbackVoicePlan(clips, narr); finalizeOverlays(fb.shots, narr, { dense });
  return { ...fb, source: 'fallback' };
}


/** مكان العبارة المكتوبة جوه كلام اللقطة (بداية/نهاية الكلام الفعلي) — عشان النص يظهر وقت ما بيتقال */
export function phraseSpan(win, text) {
  const target = String(text).split(/\s+/).map(normW).filter(Boolean);
  if (!target.length || !win.length) return null;
  let best = null;
  for (let i = 0; i < win.length; i++) {
    let hit = 0, last = i;
    for (let k = 0; k < target.length && i + k < win.length + 2; k++) { const w = win[i + k]; if (w && normW(w.w) === target[k]) { hit++; last = i + k; } }
    if (hit >= Math.ceil(target.length * 0.6) && (!best || hit > best.hit)) best = { hit, start: win[i].start, end: win[last].end };
  }
  return best ? { start: best.start, end: best.end } : null;
}

/** مؤثرات صوتية للـoverlay (بتتوزّع مع حركة القالب نفسه) */
export function overlaySfx(ov, absAt) {
  const ev = [];
  const words = String(ov.data?.text || '').split(/\s+/).filter(Boolean);
  switch (ov.template) {
    case 'kinetic_text': words.slice(0, 10).forEach((_, i) => ev.push({ t: absAt + 0.12 + i * 0.22, type: i === 0 ? 'click' : 'tick', vol: 0.3 })); break;
    case 'stack_text': { const n = Math.min(4, words.length); for (let i = 0; i < n; i++) ev.push({ t: absAt + 0.2 + i * 0.2, type: i === n - 1 ? 'boom' : 'impact', vol: i === n - 1 ? 0.42 : 0.28 }); break; }
    case 'marker_text': ev.push({ t: absAt + 0.08, type: 'swish', vol: 0.3 }, { t: absAt + 0.5, type: 'pop', vol: 0.4 }); break;
    case 'quote': ev.push({ t: absAt + 0.05, type: 'swish', vol: 0.3 }); break;
    case 'counter': ev.push({ t: absAt + 0.1, type: 'riser', vol: 0.32 }); break;
    case 'lower_third': ev.push({ t: absAt + 0.05, type: 'whoosh', vol: 0.3 }, { t: absAt + 0.55, type: 'click', vol: 0.3 }); break;
    case 'bullet_panel': (ov.data?.bullets || []).slice(0, 5).forEach((_, i) => ev.push({ t: absAt + 0.6 + i * 0.5, type: 'pop', vol: 0.35 })); break;
    case 'bottom_sheet': ev.push({ t: absAt + 0.05, type: 'swish', vol: 0.35 }); (ov.data?.items || []).slice(0, 4).forEach((_, i) => ev.push({ t: absAt + 0.55 + i * 0.5, type: 'pop', vol: 0.35 })); break;
    case 'stamp': ev.push({ t: absAt + 0.3, type: 'boom', vol: 0.55 }, { t: absAt + 0.3, type: 'click', vol: 0.35 }); break;
    case 'news_bar': ev.push({ t: absAt + 0.05, type: 'swish', vol: 0.3 }, { t: absAt + 0.5, type: 'click', vol: 0.25 }); break;
    case 'side_note': ev.push({ t: absAt + 0.05, type: 'swish', vol: 0.3 }); break;
    default: break;
  }
  return ev;
}

const hasArabic = (s) => /[؀-ۿ]/.test(s);

export async function executeVoicePlan({ plan, clips, narr, voiceFile, workDir, options = {}, style = null, onProgress = () => {} }) {
  fs.mkdirSync(workDir, { recursive: true });
  const { W, H } = targetSizeFor(clips);
  const files = [];
  const animate = plan.shots.length <= 45 && options.zoom !== false;
  const lang0 = captionLang(narr.words, options.language);
  const theme = style?.theme || (plan.style === 'dramatic' ? 'cinematic' : 'blue');
  // طلبات العميل بالاسم بتتحط على الفيديو كله؛ الجرافيك التلقائي في نفس الوقت بيتشال (الأولوية للعميل)
  const custom = options.motionGraphics === false ? [] : placeCustomerGraphics(options.graphics, narr.words, narr.duration);
  { let t0 = 0; for (const s of plan.shots) { const t1 = t0 + s.dur; if (s.overlay && custom.some(g => g.at < t1 + 0.3 && t0 < g.at + g.dur + 0.3)) s.overlay = null; t0 = t1; } }
  const hideCaps = custom.filter(o => hidesCaptions(o.template, false)).map(o => [o.at - 0.05, o.at + o.dur - 0.2]); // فترات الكابشن بيختفي فيها لأن نفس الكلام ظاهر كنص متحرك (مفيش تكرار)
  const extraSfx = [{ t: 0.04, type: 'impact', vol: 0.5 }, ...custom.flatMap(o => overlaySfx(o, o.at))];
  let shotStart = 0;
  const bakedWins = []; // نوافذ الجرافيكس المدمجة جوه اللقطات — الزخرفة الإضافية ما بتتراكبش عليها
  for (let i = 0; i < plan.shots.length; i++) {
    onProgress({ stage: 'cut', frac: i / plan.shots.length });
    const s = plan.shots[i], c = clips[s.clipIndex];
    const raw = path.join(workDir, `shot_${i}.mp4`);
    const extra = i === plan.shots.length - 1 ? VO_TAIL : 0; // ذيل صغير في الآخر عشان الموسيقى تقفل بنعومة
    const outLen = s.dur + extra;
    await renderSub({ src: c.file, dest: raw, start: s.start, len: outLen * s.speed, W, H, srcW: c.width, srcH: c.height, ...motionFor(i, animate), speed: s.speed, keepAudio: false, loop: s.loop || (c.duration - s.start < outLen * s.speed) });
    let finalFile = raw;
    if (s.overlay && options.motionGraphics !== false) {
      // موشن جرافيك: بنركّب القالب المتحرك فوق اللقطة (نفس محرك الأفلام الوثائقية) وبنرجّع الصوت الصامت للمقطع
      try {
        // نصوص الكلام: بتظهر وقت ما العبارة بتتقال وبتفضل لحد ما تخلص (+ثانية)؛ الباقي بتوقيت ثابت
        let at = s.overlay.template === 'lower_third' ? 0.45 : 0.18, ovDur = Math.min(outLen - at - 0.2, 4.5);
        const phrase = PHRASE_TEMPLATES.has(s.overlay.template) ? phraseSpan(inWindow(narr.words, shotStart, shotStart + s.dur), s.overlay.data.text) : null;
        if (phrase) { at = Math.max(0.1, Math.min(outLen - 1.4, phrase.start - shotStart - 0.12)); ovDur = Math.min(outLen - at - 0.1, Math.max(1.8, phrase.end - phrase.start + 1.1), 4.4); }
        if (ovDur >= 0.9) {
          const v = await buildBeatClip({ beat: { dur: outLen, visual: { kind: 'clip', file: raw }, overlays: [{ template: s.overlay.template, data: s.overlay.data, at, dur: ovDur }], dim: false, textOutline: true }, w: W, h: H, theme, bgPath: null, lang: lang0, rtl: isRtlLang(lang0), workDir, index: i });
          const withAudio = path.join(workDir, `shotov_${i}.mp4`);
          await ffmpeg(['-i', v, '-i', raw, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-shortest', withAudio]);
          rmQuiet(v); rmQuiet(raw); finalFile = withAudio;
          extraSfx.push(...overlaySfx(s.overlay, shotStart + at));
          bakedWins.push({ at: shotStart + at, dur: ovDur });
          if (PHRASE_TEMPLATES.has(s.overlay.template)) hideCaps.push([shotStart + at - 0.05, shotStart + at + ovDur - 0.3]);
        }
      } catch (e) { console.warn('[SmartMontage] overlay failed for shot', i, '— continuing without it:', e.message); }
    }
    files.push(finalFile);
    shotStart += s.dur;
  }
  onProgress({ stage: 'finish', frac: 0 });
  const capStyle = options.captions && options.captions !== 'none' ? options.captions : null;
  const lang = captionLang(narr.words, options.language);
  const extraOv = options.motionGraphics === false ? [] : autoExtraOverlays(narr.words, narr.duration, [...custom, ...bakedWins], { dense: options.graphicsLevel === 'high' }).map(({ template, data, at, dur }) => ({ template, data, at, dur }));
  const r = await montageVideos({
    files, workDir: path.join(workDir, 'final'), assumeNormalized: true, narrationFile: voiceFile,
    transitions: files.length > 1 ? (plan.style === 'calm' ? 'soft' : 'auto') : 'none', transitionStyle: plan.style === 'calm' ? 'auto' : 'punchy', sfx: true,
    words: capStyle ? narr.words.filter(w => !hideCaps.some(([a, b]) => (w.start + w.end) / 2 >= a && (w.start + w.end) / 2 <= b)) : null,
    captions: capStyle ? { style: capStyle, lang, position: 'auto', transcribe: false } : null,
    musicFile: options.musicFile || null, musicVolume: 0.12, extraSfx,
    overlays: [...custom, ...extraOv], overlayTheme: theme,
  });
  files.forEach(f => rmQuiet(f));
  let tt = 0;
  return {
    file: r.file, duration: r.duration, words: narr.words, transcript: narr.words.map(w => w.w).join(' '),
    chapters: plan.shots.map(s => { const o = { t: tt, title: clips[s.clipIndex].name }; tt += s.dur; return o; }),
    stats: { mode: 'voiceover', shots: plan.shots.length, narrationSec: narr.duration, finalSec: r.duration },
  };
}

/** صور الستايل المرجعية → ثيم ألوان + أنواع الجرافيك الأقرب + وصف للمخطط */
export function styleFrom(images) {
  const im = (images || []).find(a => a.analysis);
  if (!im) return null;
  const theme = themeFromPalette(im.analysis.palette);
  return { description: im.analysis.description || '', templates: (im.analysis.templates || []).filter(t => OVERLAY_TEMPLATES.has(t)), theme: theme || null };
}

/** كل الخطوات: (فويس-أوفر؟ ← خطة على الصوت) أو (تفريغ كلام الفيديوهات → خطة → تنفيذ) */
/** لغة الكابشن/الخط من الكلام الفعلي نفسه (مش من حقل language اللي الايجنت بيكتبه — كان بيطلّع كابشن عربي لفيديو إنجليزي) */
export function captionLang(words, hint) {
  if (hasArabic((words || []).map(w => w.w).join(' '))) return 'ar';
  const h = String(hint && hint !== 'auto' ? hint : 'en').split(/[-_]/)[0];
  return ['es', 'fr', 'de'].includes(h) ? h : 'en';
}

/** تفريغ بكشف اللغة التلقائي: الـhint ما بيتفرضش على الموديل (لو اتفرض غلط، كلام إنجليزي بيطلع "مترجم" بالعربي)، وبنستخدمه بس لو الكشف التلقائي ملقاش كلام */
export async function transcribeAuto(transcribe, file, workDir, hint) {
  const words = await transcribe(file, workDir, null);
  if (words?.length) return words;
  const h = hint && hint !== 'auto' ? hint : null;
  return h ? transcribe(file, workDir, h) : (words || []);
}

export async function smartMontage({ assets, workDir, instructions = '', options = {}, onProgress = () => {}, deps = {} }) {
  fs.mkdirSync(workDir, { recursive: true });
  const transcribe = deps.transcribe || transcribeAudioFile;
  const voice = assets.find(a => a.kind === 'audio') || null;
  const videos = assets.filter(a => (a.kind || 'video') === 'video');
  const style = styleFrom(assets.filter(a => a.kind === 'image'));
  if (!videos.length) { const e = new Error('no videos'); e.code = 'no_videos'; throw e; }
  const clips = [];
  for (let i = 0; i < videos.length; i++) {
    const a = videos[i];
    onProgress({ stage: 'transcribe', frac: i / videos.length });
    const size = await displaySize(a.file).catch(() => null);
    const c = { name: a.name, file: a.file, duration: a.duration, width: size?.w || a.width, height: size?.h || a.height, hasAudio: a.hasAudio, hasSpeech: !voice && !!a.analysis?.hasSpeech, analysis: a.analysis, words: null, sentences: null };
    if (c.hasSpeech) {
      const wav = path.join(workDir, `src_${i}.wav`);
      try {
        await ffmpeg(['-i', a.file, '-vn', '-ac', '1', '-ar', '16000', wav]);
        c.words = await transcribeAuto(transcribe, wav, workDir, options.language);
        c.sentences = splitSentences(c.words);
        if (!c.words.length) c.hasSpeech = false;
      } catch (e) { console.warn('[SmartMontage] transcription failed for a clip, treating as no speech:', e.message); c.hasSpeech = false; }
      finally { rmQuiet(wav); }
    }
    clips.push(c);
  }
  if (voice) {
    let words = (voice.analysis?.words || []).map(([w, start, end]) => ({ w, start, end }));
    if (!words.length) words = await transcribeAuto(transcribe, voice.file, workDir, options.language);
    if (!words.length) { const e = new Error('no speech in the voiceover'); e.code = 'no_speech'; throw e; }
    if (deps.onTranscript) await deps.onTranscript(words);
    const narr = { words, sentences: splitSentences(words), duration: await probeDuration(voice.file) };
    onProgress({ stage: 'plan', frac: 0 });
    const plan = await planVoiceover({ clips, narr, instructions, style, ask: deps.ask, dense: options.graphicsLevel === 'high' });
    const result = await executeVoicePlan({ plan, clips, narr, voiceFile: voice.file, workDir: path.join(workDir, 'exec'), options, style, onProgress });
    return { ...result, plan: { title: plan.title, style: plan.style, musicMood: plan.musicMood, source: plan.source }, clips: clips.map(c => ({ name: c.name, duration: c.duration, hasSpeech: false })) };
  }
  if (deps.onTranscript) await deps.onTranscript(clips.flatMap(c => c.words || []));
  onProgress({ stage: 'plan', frac: 0 });
  const plan = options.mode === 'transitions'
    ? { ...keepAllPlan(clips, { style: options.transitionStyle === 'soft' ? 'calm' : 'clean' }), source: 'transitions' } // بس ضم بالترتيب + انتقالات: من غير إعادة ترتيب أو قص
    : await planMontage({ clips, instructions, style, ask: deps.ask, dense: options.graphicsLevel === 'high' });
  if (options.cutaways !== false && options.mode !== 'transitions') {
    onProgress({ stage: 'plan', frac: 0.6 });
    try { plan.cutaways = await planCutaways({ clips, instructions, style, dense: options.graphicsLevel === 'high', ask: deps.ask }); }
    catch (e) { console.warn('[SmartMontage] cutaway planning failed:', e.message); plan.cutaways = []; }
  }
  const result = await executePlan({ plan, clips, workDir: path.join(workDir, 'exec'), options, style, instructions, onProgress });
  return { ...result, plan: { title: plan.title, style: plan.style, musicMood: plan.musicMood, source: plan.source }, clips: clips.map(c => ({ name: c.name, duration: c.duration, hasSpeech: c.hasSpeech })) };
}
