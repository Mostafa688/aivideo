// ── documentaryService.js ── منسّق الفيلم الوثائقي: حجز كريديت → سكريبت → سرد وتوقيت → خطة → أصول → رندر → رفع
// كل مرحلة بتفشل بشكل آمن: أي خطأ نهائي = فشل الوظيفة + رد كامل للكريديت. الأخطاء الجزئية (لقطة، موسيقى، مصدر) بتتعامل
// معاها المراحل نفسها بخطط بديلة من غير ما تفشّل الفيلم.
import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { cleanScript } from './scriptCleaner.js';
import { buildSrt } from './uploadPackage.js';
import { persistEditor, EDIT_MAX_MINUTES } from './editorStore.js';
import { runEditTask, sweepExpiredEditors } from './editorService.js';
import { autoEditVideo } from '../montage/autoEdit.js';
import { smartMontage } from '../montage/smartMontage.js';
import { resolveAssets as resolveMontageAssets, removeAssets as removeMontageAssets, sweepOldAssets, withAnalysis, MAX_TOTAL_MINUTES, MAX_ASSETS_PER_USER } from '../montage/assets.js';
import { chargeCredits, addCreditsBalance, getCreditsBalance, getUserById } from '../authService.js';
import { watermarkVideo } from '../watermark.js';
import { getDocumentaryCreditCost, getAutoEditCreditCost } from '../creditPricingEngine.js';
import { checkContentSafety } from '../scriptService.js';
import { synthesizeNarration, getBackgroundMusicBuffer } from '../videoAudioService.js';
import { ffmpeg, probeDuration, rmQuiet, probeVideo, hasAudio } from './ff.js';
import { transcribeWords, tokenizeScript, alignScriptToWords, tokensFromAsr } from './align.js';
import { buildBeats, planBeats } from './planner.js';
import { resolveAssets } from './resolver.js';
import { buildTimeline } from './timelineBuilder.js';
import { renderDocumentary } from './index.js';
import { writeScript, WORDS_PER_MIN, MAX_SCRIPT_CHARS } from './scriptWriter.js';
import { THEMES } from './themes.js';
import * as store from './store.js';

const TEMP_ROOT = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';
const MAX_CONCURRENT = Math.max(1, Number(process.env.DOC_MAX_CONCURRENT || 1));
export const MAX_MINUTES = 30;
export const TRIAL_MAX_SECONDS = 62; // أول فيلم مجاني: صوت مرفوع لحد دقيقة
export const MIN_SCRIPT_CHARS = 120;
export const LANGUAGES = { en: 'English', ar: 'العربية', es: 'Español', fr: 'Français', de: 'Deutsch' };
export const CAPTION_STYLES = ['karaoke', 'box', 'pop', 'none'];
export const THEME_NAMES = Object.keys(THEMES);
export const MOODS = ['epic', 'documentary', 'tension', 'emotional', 'chill', 'upbeat'];

const queue = [];
let active = 0;
const live = new Map(); // jobId -> { cancel:false }

// ── تقدير الطول والتكلفة ──────────────────────────────────────────────────────────────────────
export function estimateMinutes({ script, audioDurationSec, minutes, language = 'en' }) {
  if (audioDurationSec) return audioDurationSec / 60;
  if (script) {
    const words = script.trim().split(/\s+/).filter(Boolean).length;
    return words / (WORDS_PER_MIN[String(language).split(/[-_]/)[0]] || WORDS_PER_MIN.default);
  }
  return Number(minutes) || 0;
}
export function quote(input) {
  const minutes = estimateMinutes(input);
  const userVoiceover = !!input.audioDurationSec;
  return { minutes: Math.round(minutes * 100) / 100, cost: getDocumentaryCreditCost(minutes, { userVoiceover }), userVoiceover };
}

function normalizeInput(raw) {
  const mode = ['script', 'topic', 'voiceover'].includes(raw.mode) ? raw.mode : 'script';
  const language = LANGUAGES[raw.language] ? raw.language : 'en';
  const input = {
    mode, language, ratio: raw.ratio === '9:16' ? '9:16' : '16:9',
    theme: THEME_NAMES.includes(raw.theme) ? raw.theme : 'blue',
    captions: CAPTION_STYLES.includes(raw.captions) ? raw.captions : 'karaoke',
    motionGraphics: raw.motionGraphics !== false,
    voiceKey: typeof raw.voiceKey === 'string' ? raw.voiceKey.slice(0, 30) : 'male_wise',
    music: raw.music === false ? false : true,
    musicMood: MOODS.includes(raw.musicMood) ? raw.musicMood : null,
    musicTrack: typeof raw.musicTrack === 'string' ? raw.musicTrack.slice(0, 120) : null,
    sources: raw.sources === 'stock' ? 'stock' : 'all',
    title: typeof raw.title === 'string' ? raw.title.slice(0, 120) : '',
  };
  if (mode === 'script') input.script = String(raw.script || '').trim();
  if (mode === 'topic') { input.topic = String(raw.topic || '').trim().slice(0, 300); input.minutes = Math.min(MAX_MINUTES, Math.max(1, Number(raw.minutes) || 5)); }
  if (mode === 'voiceover') { input.audioFile = raw.audioFile; input.audioDurationSec = raw.audioDurationSec; }
  return input;
}

/**
 * يتحقق من الطلب، يفحص المحتوى، يحجز الكريديت (ذري)، يسجّل الوظيفة ويدخّلها الطابور.
 * @returns {{ok:true, job, cost, minutes} | {ok:false, status, error, message, cost?, remaining?}}
 */
export async function startJob(userId, raw, hooks = {}) {
  const input = normalizeInput(raw);
  if (input.mode === 'script') {
    // سكريبت ملصوق من ChatGPT/Claude: أوقات/مشاهد/تعليمات → نص التسجيل الصافي (Groq بيراجع لو فيه علامات)
    input.script = (await cleanScript(input.script.slice(0, MAX_SCRIPT_CHARS * 2))).script;
    if (input.script.length < MIN_SCRIPT_CHARS) return { ok: false, status: 400, error: 'script_too_short', message: `The script is too short (minimum ${MIN_SCRIPT_CHARS} characters).` };
    if (input.script.length > MAX_SCRIPT_CHARS) return { ok: false, status: 400, error: 'script_too_long', message: `The script is too long (maximum ${MAX_SCRIPT_CHARS} characters).` };
  }
  if (input.mode === 'topic' && input.topic.length < 3) return { ok: false, status: 400, error: 'topic_required', message: 'Please enter a topic.' };
  if (input.mode === 'voiceover' && (!input.audioFile || !fs.existsSync(input.audioFile))) return { ok: false, status: 400, error: 'audio_required', message: 'Please upload your voiceover.' };

  const q = quote(input);
  if (q.minutes < 0.4) return { ok: false, status: 400, error: 'too_short', message: 'The video would be shorter than 25 seconds.' };
  if (q.minutes > MAX_MINUTES + 0.5) return { ok: false, status: 400, error: 'too_long', message: `The maximum length is ${MAX_MINUTES} minutes.` };

  const safety = await checkContentSafety([input.title, input.topic, (input.script || '').slice(0, 6000)].filter(Boolean).join('\n'));
  if (safety.unsafe) return { ok: false, status: 400, error: 'content_policy_violation', message: 'This content cannot be generated.', category: safety.category };

  // أول فيلم مجاني: صوت مرفوع ≤ دقيقة، مرة واحدة لكل حساب (بتتاخد بشكل ذري، وبتتردّ لو الفيلم فشل)
  let trial = false;
  if (input.mode === 'voiceover' && input.audioDurationSec <= TRIAL_MAX_SECONDS) {
    try { trial = await store.claimTrial(userId); } catch (e) { console.warn('[Documentary] trial check failed:', e.message); }
  }
  if (trial) input.watermark = true; else delete input.watermark; // الدقيقة المجانية عليها علامة مائية (العميل ما يقدرش يحدد ده بنفسه)
  const cost = trial ? 0 : q.cost;
  const charge = trial ? { success: true, remaining: await getCreditsBalance(userId).catch(() => null) } : await chargeCredits(userId, q.cost);
  if (!charge.success) return { ok: false, status: 403, error: 'quota_exceeded', message: `This documentary needs ${q.cost} credits, you have ${charge.remaining}.`, cost: q.cost, remaining: charge.remaining };

  let job;
  try {
    const stored = { ...input }; delete stored.audioFile;
    job = await store.createJob({ userId, input: stored, title: input.title || input.topic || null, creditsCharged: cost });
    if (trial) await store.updateJob(job.id, { meta: { trial: true, trialKind: 'doc' } }).catch(() => {});
  } catch (e) {
    if (trial) await store.releaseTrial(userId).catch(() => {}); else await addCreditsBalance(userId, q.cost).catch(() => {});
    return { ok: false, status: 500, error: 'job_create_failed', message: 'Could not start the job. Your credits were not charged.' };
  }
  enqueue({ id: job.id, userId, input, charged: cost, minutes: q.minutes, hooks, trial, trialKind: 'doc' });
  return { ok: true, job, cost, minutes: q.minutes, remaining: charge.remaining, trial };
}

function enqueue(task) {
  queue.push(task);
  pump();
}
export function enqueueEdit(task) { enqueue(task); }
export function queuePosition(jobId) {
  const i = queue.findIndex(t => t.id === jobId);
  return i >= 0 ? i + 1 : 0;
}
function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const task = queue.shift();
    active++;
    runTask(task).catch(e => console.error('[Documentary] unexpected:', e)).finally(() => { active--; pump(); });
  }
}

async function refund(task, amount) {
  if (amount > 0) await addCreditsBalance(task.userId, amount).catch(e => console.error('[Documentary] REFUND FAILED', task.id, amount, e.message));
}

// ── التنفيذ ──────────────────────────────────────────────────────────────────────────────────
const STAGES = { script: [0, 6], narration: [6, 28], plan: [28, 38], assets: [38, 66], render: [66, 94], upload: [94, 99], transcribe: [2, 25], cut: [25, 70], finish: [70, 94] };
function progressor(jobId) {
  let last = 0, lastAt = 0;
  return async (stage, frac = 0, extra = {}) => {
    const [a, b] = STAGES[stage] || [0, 0];
    const progress = Math.round(a + (b - a) * Math.min(1, Math.max(0, frac)));
    const now = Date.now();
    if (progress === last && !extra.title && !extra.script && now - lastAt < 4000) return;
    last = progress; lastAt = now;
    await store.updateJob(jobId, { stage, progress, ...extra }).catch(() => {});
  };
}

async function runTask(task) {
  if (task.kind === 'edit') return runEditTask(task);
  const { id, userId, input } = task;
  const workDir = path.join(TEMP_ROOT, `doc_${id}`);
  const prog0 = progressor(id);
  let currentStage = 'script';
  const prog = (stage, ...rest) => { currentStage = stage; return prog0(stage, ...rest); };
  fs.mkdirSync(workDir, { recursive: true });
  try {
    await store.updateJob(id, { status: 'processing', stage: 'script', progress: 1 });
    const result = input.mode === 'autoedit' ? await produceAutoEdit({ id, input, workDir, prog }) : input.mode === 'montage' ? await produceSmartMontage({ id, userId, input, workDir, prog }) : await produce({ id, userId, input, workDir, prog });
    // رفع
    await prog('upload', 0);
    const base = `documentaries/${userId}/${id}`;
    const videoUrl = await store.uploadFile(result.file, `${base}.mp4`, 'video/mp4');
    let thumbUrl = null;
    try {
      const thumb = path.join(workDir, 'thumb.jpg');
      await ffmpeg(['-ss', String(Math.min(12, result.duration * 0.2)), '-i', result.file, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', thumb]);
      thumbUrl = await store.uploadFile(thumb, `${base}.jpg`, 'image/jpeg');
    } catch (e) { console.warn('[Documentary] thumbnail failed:', e.message); }
    // الدفع على الطول الفعلي: فرق الحجز المسبق بيترد
    const actual = task.fixedCost ? task.charged : getDocumentaryCreditCost(result.duration / 60, { userVoiceover: input.mode === 'voiceover' });
    const back = Math.max(0, task.charged - actual);
    if (back >= 2) await refund(task, back);
    await store.updateJob(id, { status: 'done', stage: 'done', progress: 100, result_url: videoUrl, thumbnail_url: thumbUrl, duration_sec: result.duration, credits_refunded: back >= 2 ? back : 0, credits_list: result.credits, script: result.script, title: result.title, meta: { chapters: result.chapters, srt: result.srt, language: input.language, ratio: input.ratio, ...(result.editor ? { editor: result.editor } : {}) } });
    task.hooks?.onDone?.({ videoUrl, thumbnailUrl: thumbUrl, durationSec: result.duration, title: result.title, credits: result.credits, creditsCharged: task.charged - (back >= 2 ? back : 0) });
  } catch (e) {
    console.error(`[Documentary] job ${id} failed:`, e.message);
    await refund(task, task.charged);
    if (task.trial) await store.releaseTrial(userId, task.trialKind || 'doc').catch(() => {});
    task.hooks?.onFail?.(e);
    await store.updateJob(id, { status: 'failed', stage: currentStage, error: userFacingError(e), error_detail: String(e.message || e).slice(0, 800), credits_refunded: task.charged }).catch(() => {});
  } finally {
    rmQuiet(workDir);
    if (input.audioFile) rmQuiet(path.dirname(input.audioFile));
    if (input.videoFile) rmQuiet(path.dirname(input.videoFile));
    if (input.mode === 'montage' && input.assetIds) removeMontageAssets(userId, input.assetIds);
  }
}

const USER_ERRORS = {
  no_audio: 'This video has no audio, so there is nothing to edit by speech. Your credits were refunded.',
  no_speech: 'No speech was detected in this video. Your credits were refunded.',
  content_policy: 'This video contains content we cannot edit. Your credits were refunded.',
};
function userFacingError(e) { return USER_ERRORS[e?.code] || 'The video could not be completed, your credits were refunded.'; }

// ── مونتاج تلقائي لفيديو مرفوع (ffmpeg + Whisper): قص صمت + زوم + انتقالات + مؤثرات + كابشن + موسيقى ──
export const AUTOEDIT_MAX_MINUTES = 20;
export const AUTOEDIT_CAPTIONS = ['karaoke', 'box', 'pop', 'none'];
export function quoteAutoEdit(durationSec) {
  const minutes = Math.round((Number(durationSec) || 0) / 6) / 10;
  return { minutes, cost: getAutoEditCreditCost((Number(durationSec) || 0) / 60) };
}

function normalizeAutoEditOptions(raw = {}) {
  const bool = (v, d) => (v === undefined ? d : v === true || v === 'true' || v === '1');
  return {
    cutSilence: bool(raw.cutSilence, true), zoom: bool(raw.zoom, true), transitions: bool(raw.transitions, true),
    captions: AUTOEDIT_CAPTIONS.includes(raw.captions) ? raw.captions : 'karaoke',
    music: bool(raw.music, false), musicMood: MOODS.includes(raw.musicMood) ? raw.musicMood : null,
    musicTrack: typeof raw.musicTrack === 'string' ? raw.musicTrack.slice(0, 120) : null,
    language: LANGUAGES[raw.language] ? raw.language : 'en',
  };
}

export async function startAutoEditJob(userId, { file, durationSec, title, options }) {
  const opt = normalizeAutoEditOptions(options);
  if (!file || !fs.existsSync(file)) return { ok: false, status: 400, error: 'video_required', message: 'Please upload a video.' };
  if (!(durationSec >= 5)) return { ok: false, status: 400, error: 'bad_video', message: 'The video is too short (minimum 5 seconds).' };
  if (durationSec > AUTOEDIT_MAX_MINUTES * 60 + 5) return { ok: false, status: 400, error: 'too_long', message: `The maximum length is ${AUTOEDIT_MAX_MINUTES} minutes.` };
  const q = quoteAutoEdit(durationSec);
  const charge = await chargeCredits(userId, q.cost);
  if (!charge.success) return { ok: false, status: 403, error: 'quota_exceeded', message: `This edit needs ${q.cost} credits, you have ${charge.remaining}.`, cost: q.cost, remaining: charge.remaining };
  let job;
  try {
    job = await store.createJob({ userId, input: { mode: 'autoedit', ...opt, durationSec }, title: String(title || '').slice(0, 120) || null, creditsCharged: q.cost });
  } catch (e) {
    await addCreditsBalance(userId, q.cost).catch(() => {});
    return { ok: false, status: 500, error: 'job_create_failed', message: 'Could not start the job. Your credits were not charged.' };
  }
  enqueue({ id: job.id, userId, input: { mode: 'autoedit', ...opt, durationSec, videoFile: file }, charged: q.cost, minutes: q.minutes, fixedCost: true, hooks: {} });
  return { ok: true, job, cost: q.cost, minutes: q.minutes, remaining: charge.remaining };
}

// نفس المونتاج التلقائي بس من رابط فيديو (مثلاً فيديو العميل المرفوع في شات الـagent): بننزّله، نفحصه، ونبدأ الوظيفة
// ── مونتاج ذكي لعدة فيديوهات مرفوعة في شات الـagent (فهم الفيديوهات + مخطط + تنفيذ ffmpeg) ──
export const MONTAGE_TRIAL_MAX_SECONDS = 120;
export const MONTAGE_TRIAL_MAX_VIDEOS = 6;

export async function startMontageJob(userId, { assetIds, instructions = '', options = {} }) {
  const ids = [...new Set((Array.isArray(assetIds) ? assetIds : []).map(String))];
  if (!ids.length || ids.length > MAX_ASSETS_PER_USER + 1) return { ok: false, status: 400, error: 'bad_assets', message: `Choose 1 to ${MAX_ASSETS_PER_USER} uploaded videos.` };
  const assets = resolveMontageAssets(userId, ids);
  if (!assets) return { ok: false, status: 400, error: 'assets_expired', message: 'The uploaded videos expired or were not found — please upload them again.' };
  const videos = assets.filter(a => a.kind !== 'audio');
  const voice = assets.find(a => a.kind === 'audio') || null;
  if (!videos.length) return { ok: false, status: 400, error: 'bad_assets', message: 'Add at least one video to the montage.' };
  const footageSec = videos.reduce((a, x) => a + x.duration, 0);
  if (footageSec > MAX_TOTAL_MINUTES * 60 + 5) return { ok: false, status: 400, error: 'too_long', message: `The videos add up to more than ${MAX_TOTAL_MINUTES} minutes.` };
  // مع الفويس-أوفر الفيديو النهائي بطول الصوت، فالتسعير على مدة الصوت (والفيديوهات بتتحلل بس)
  const totalSec = voice ? Math.max(voice.duration, 30) : footageSec;
  const text = String(instructions || '').slice(0, 800);
  if (text) { const safety = await checkContentSafety(text); if (safety.unsafe) return { ok: false, status: 400, error: 'content_policy_violation', message: 'These instructions cannot be used.' }; }
  const opt = normalizeAutoEditOptions(options);
  const q = quoteAutoEdit(totalSec);
  // مونتاج مجاني مرة واحدة لكل حساب: ناتج ≤ دقيقتين (طول الفويس أو طول اللقطات) وحد أقصى 6 فيديوهات، بعلامة مائية — للخطة المجانية أو لو الرصيد مش كفاية
  let trial = false;
  const rawOutSec = voice ? voice.duration : footageSec;
  if (rawOutSec <= MONTAGE_TRIAL_MAX_SECONDS + 2 && videos.length <= MONTAGE_TRIAL_MAX_VIDEOS) {
    try {
      const user = await getUserById(userId).catch(() => null);
      const bal = await getCreditsBalance(userId).catch(() => 0);
      if ((user?.plan || 'free') === 'free' || bal < q.cost) trial = await store.claimTrial(userId, 'montage');
    } catch (e) { console.warn('[Montage] trial check failed:', e.message); }
  }
  const cost = trial ? 0 : q.cost;
  const charge = trial ? { success: true, remaining: await getCreditsBalance(userId).catch(() => null) } : await chargeCredits(userId, q.cost);
  if (!charge.success) return { ok: false, status: 403, error: 'quota_exceeded', message: `This montage needs ${q.cost} credits, you have ${charge.remaining}.`, cost: q.cost, remaining: charge.remaining };
  let job;
  try {
    job = await store.createJob({ userId, input: { mode: 'montage', ...opt, instructions: text, assetIds: ids, durationSec: totalSec, voiceover: !!voice, watermark: trial || undefined, clips: videos.map(a => a.name) }, title: (options.title || videos[0].name || 'Montage').replace(/\.[a-z0-9]{2,4}$/i, '').slice(0, 120), creditsCharged: cost });
    if (trial) await store.updateJob(job.id, { meta: { trial: true, trialKind: 'montage' } }).catch(() => {});
  } catch (e) {
    if (trial) await store.releaseTrial(userId, 'montage').catch(() => {}); else await addCreditsBalance(userId, q.cost).catch(() => {});
    return { ok: false, status: 500, error: 'job_create_failed', message: 'Could not start the job. Your credits were not charged.' };
  }
  enqueue({ id: job.id, userId, input: { mode: 'montage', ...opt, instructions: text, assetIds: ids, durationSec: totalSec, voiceover: !!voice, watermark: trial || undefined }, charged: cost, minutes: q.minutes, fixedCost: true, hooks: {}, trial, trialKind: 'montage' });
  return { ok: true, job, cost, minutes: q.minutes, remaining: charge.remaining, trial };
}

async function produceSmartMontage({ id, userId, input, workDir, prog }) {
  await prog('transcribe', 0);
  const assets = resolveMontageAssets(userId, input.assetIds);
  if (!assets) throw new Error('uploaded videos are no longer available');
  const analysed = [];
  for (const a of assets) analysed.push((await withAnalysis(userId, a.id, a.kind === 'audio' ? 90000 : 20000)) || a);
  let musicFile = null;
  if (input.music) {
    try {
      musicFile = path.join(workDir, 'music.mp3');
      const track = input.musicTrack && /^[\w ',.&()\-]+\.mp3$/i.test(input.musicTrack) && fs.existsSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack));
      if (track) fs.copyFileSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack), musicFile);
      else fs.writeFileSync(musicFile, await getBackgroundMusicBuffer('youtube', input.musicMood || 'upbeat'));
    } catch (e) { console.warn('[SmartMontage] music unavailable:', e.message); musicFile = null; }
  }
  const r = await smartMontage({
    assets: analysed, workDir: path.join(workDir, 'smart'), instructions: input.instructions,
    options: { captions: input.captions, cutSilence: input.cutSilence, zoom: input.zoom, language: input.language, musicFile },
    onProgress: ({ stage, frac = 0 }) => prog(stage === 'plan' ? 'cut' : stage, stage === 'plan' ? 0 : frac),
    deps: { onTranscript: async (words) => {
      const safety = await checkContentSafety(words.map(w => w.w).join(' ').slice(0, 6000));
      if (safety.unsafe) { const e = new Error('content policy'); e.code = 'content_policy'; throw e; }
    } },
  });
  const title = (await store.getJobAny(id))?.title || r.plan?.title || 'Montage';
  if (input.watermark) r.file = await watermarkVideo(r.file);
  return { file: r.file, duration: r.duration, credits: [], script: r.transcript, title, chapters: [], srt: buildSrt(r.words) };
}

export async function startAutoEditFromUrl(userId, videoUrl, options = {}) {
  const dir = path.join(TEMP_ROOT, `aeurl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'input.mp4');
  try {
    if (/^https?:\/\//i.test(videoUrl)) {
      const res = await fetch(videoUrl);
      if (!res.ok) throw new Error(`download failed ${res.status}`);
      const len = Number(res.headers.get('content-length') || 0);
      if (len > 600 * 1024 * 1024) { rmQuiet(dir); return { ok: false, status: 400, error: 'file_too_large', message: 'The video is larger than 600MB.' }; }
      await new Promise((resolve, reject) => { const out = fs.createWriteStream(file); res.body.pipe(out); res.body.on('error', reject); out.on('finish', resolve); out.on('error', reject); });
    } else {
      fs.copyFileSync(path.join(process.cwd(), videoUrl.replace(/^\//, '')), file);
    }
    const info = await probeVideo(file).catch(() => null);
    if (!info?.width) { rmQuiet(dir); return { ok: false, status: 400, error: 'bad_video', message: 'This file is not a readable video.' }; }
    if (!(await hasAudio(file))) { rmQuiet(dir); return { ok: false, status: 400, error: 'no_audio', message: 'This video has no audio.' }; }
    const dur = info.duration || (await probeDuration(file));
    const r = await startAutoEditJob(userId, { file, durationSec: dur, title: options.title || 'Edited video', options });
    if (!r.ok) rmQuiet(dir);
    return r;
  } catch (e) {
    rmQuiet(dir);
    console.error('[AutoEdit] URL start failed:', e.message);
    return { ok: false, status: 500, error: 'failed', message: 'Could not start the job.' };
  }
}

async function produceAutoEdit({ id, input, workDir, prog }) {
  await prog('transcribe', 0);
  let musicFile = null;
  if (input.music) {
    try {
      musicFile = path.join(workDir, 'music.mp3');
      const track = input.musicTrack && /^[\w ',.&()\-]+\.mp3$/i.test(input.musicTrack) && fs.existsSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack));
      if (track) fs.copyFileSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack), musicFile);
      else fs.writeFileSync(musicFile, await getBackgroundMusicBuffer('youtube', input.musicMood));
    } catch (e) { console.warn('[AutoEdit] music unavailable:', e.message); musicFile = null; }
  }
  const r = await autoEditVideo({
    file: input.videoFile, workDir: path.join(workDir, 'edit'), language: input.language,
    options: { cutSilence: input.cutSilence, zoom: input.zoom, transitions: input.transitions, captions: input.captions, music: musicFile ? { file: musicFile, volume: 0.1 } : null },
    onProgress: ({ stage, frac = 0 }) => prog(stage === 'finish' ? 'finish' : stage, frac),
    onTranscript: async (words) => {
      const safety = await checkContentSafety(words.map(w => w.w).join(' ').slice(0, 6000));
      if (safety.unsafe) { const e = new Error('content policy'); e.code = 'content_policy'; throw e; }
    },
  });
  const title = (await store.getJobAny(id))?.title || 'Edited video';
  return { file: r.file, duration: r.duration, credits: [], script: r.transcript, title, chapters: r.chapters, srt: buildSrt(r.words) };
}

// قبل ما نبعت لـTTS: نقسّم السكريبت لقطع ≤ maxChars على حدود الفقرات/الجمل
export function splitForTts(script, maxChars = 700) {
  const chunks = [];
  for (const para of String(script).split(/\n{1,}/).map(p => p.trim()).filter(Boolean)) {
    const sentences = para.match(/[^.!?؟…]+[.!?؟…]*["'”)]*\s*/g) || [para];
    let cur = '';
    for (const s of sentences) {
      if ((cur + s).length > maxChars && cur) { chunks.push({ text: cur.trim(), paraEnd: false }); cur = ''; }
      if (s.length > maxChars) { // جملة طويلة جدًا: قطّعها على فواصل
        for (const part of s.split(/(?<=[,;:،؛])\s+/)) { if ((cur + part).length > maxChars && cur) { chunks.push({ text: cur.trim(), paraEnd: false }); cur = ''; } cur += part + ' '; }
      } else cur += s;
    }
    if (cur.trim()) chunks.push({ text: cur.trim(), paraEnd: true });
  }
  return chunks;
}

async function toWav(src, dest) { await ffmpeg(['-i', src, '-ar', '44100', '-ac', '2', dest]); return dest; }

// تفريغ ملف طويل على أجزاء 10 دقايق (حد حجم Whisper) مع إزاحة التوقيت
async function transcribeLong(file, workDir, language) {
  const dur = await probeDuration(file);
  const all = { words: [], segments: [] };
  const SEG = 600;
  for (let t = 0, k = 0; t < dur; t += SEG, k++) {
    const part = path.join(workDir, `asr_${k}.mp3`);
    await ffmpeg(['-ss', String(t), '-i', file, '-t', String(SEG), '-ac', '1', '-ar', '16000', '-b:a', '48k', part]);
    const r = await transcribeWords(part, { language });
    all.words.push(...r.words.map(w => ({ ...w, start: w.start + t, end: w.end + t })));
    all.segments.push(...r.segments.map(s => ({ ...s, start: s.start + t, end: s.end + t })));
    rmQuiet(part);
  }
  if (!all.words.length) throw new Error('no speech detected in the voiceover');
  return all;
}

async function produce({ id, userId, input, workDir, prog }) {
  const lang = input.language;
  let title = input.title || input.topic || '';
  let script = input.script || '';
  let sources = [];

  // 1) السكريبت (وضع الموضوع)
  if (input.mode === 'topic') {
    await prog('script', 0.1);
    const w = await writeScript({ topic: input.topic, minutes: input.minutes, language: lang });
    script = w.script; title = title || w.title; sources = w.sources;
    await prog('script', 1, { title, script });
  }

  // 2) السرد + توقيت الكلمات
  let tokens, narrationFile;
  if (input.mode === 'voiceover') {
    await prog('narration', 0.05);
    const asr = await transcribeLong(input.audioFile, workDir, lang);
    tokens = tokensFromAsr(asr);
    narrationFile = await toWav(input.audioFile, path.join(workDir, 'narration.wav'));
    script = asr.text || tokens.map(t => t.w).join(' ');
  } else {
    const chunks = splitForTts(script);
    if (!chunks.length) throw new Error('empty script');
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      await prog('narration', (i / chunks.length) * 0.9);
      let n;
      try { n = await synthesizeNarration(chunks[i].text, { voiceKey: input.voiceKey, languageCode: lang }); }
      catch (e) { if (input.voiceKey !== 'male_wise') n = await synthesizeNarration(chunks[i].text, { voiceKey: 'male_wise', languageCode: lang }); else throw e; }
      const wav = await toWav(n.audioPath, path.join(workDir, `tts_${i}.wav`));
      rmQuiet(n.workDir);
      let words;
      try { words = (await transcribeWords(wav, { language: lang })).words; } catch (e) { words = null; }
      parts.push({ wav, dur: await probeDuration(wav), text: chunks[i].text, words });
    }
    // دمج مع فجوة صغيرة بين القطع
    const sil = path.join(workDir, 'sil.wav');
    await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.28', sil]);
    const list = path.join(workDir, 'tts_list.txt');
    const lines = []; let offset = 0; tokens = [];
    parts.forEach((p, i) => {
      lines.push(`file '${p.wav}'`);
      const tk = tokenizeScript(p.text);
      let timed;
      if (p.words) timed = alignScriptToWords(tk, p.words);
      else timed = tk.map((t, k) => ({ ...t, start: (k / tk.length) * p.dur, end: ((k + 1) / tk.length) * p.dur })); // بدون Whisper: توزيع منتظم
      timed.forEach(t => tokens.push({ ...t, start: t.start + offset, end: t.end + offset, sentenceEnd: false }));
      if (tokens.length) tokens[tokens.length - 1].paraEnd = true;
      offset += p.dur;
      if (i < parts.length - 1) { lines.push(`file '${sil}'`); offset += 0.28; }
    });
    fs.writeFileSync(list, lines.join('\n'));
    narrationFile = path.join(workDir, 'narration.wav');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', narrationFile]);
    parts.forEach(p => rmQuiet(p.wav));
  }
  const total = await probeDuration(narrationFile);
  await prog('narration', 1);

  // 3) الخطة
  const beats = buildBeats(tokens, { totalDur: total });
  if (!beats.length) throw new Error('no beats');
  const plan = await planBeats({ beats, language: lang, topic: input.topic || title, onProgress: ({ done, total: t }) => prog('plan', done / t) });
  title = title || plan.title || 'Documentary';
  await prog('plan', 1, { title });

  // 4) الأصول
  const plans = plan.plans;
  if (input.sources === 'stock') plans.forEach(p => { if (p.visual === 'archive' || p.visual === 'nasa') p.visual = 'stock'; });
  const { assets, allCredits, boards } = await resolveAssets({ beats, plans, ratio: input.ratio, assetsDir: path.join(workDir, 'assets'), onProgress: ({ stage, done, total: t }) => prog('assets', stage === 'search' ? (done / t) * 0.3 : 0.3 + (done / t) * 0.7) });
  await prog('assets', 1);

  // 5) الموسيقى
  let musicFile = null;
  if (input.music) {
    try {
      musicFile = path.join(workDir, 'music.mp3');
      const track = input.musicTrack && /^[\w ',.&()\-]+\.mp3$/i.test(input.musicTrack) && fs.existsSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack));
      if (track) fs.copyFileSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack), musicFile);
      else fs.writeFileSync(musicFile, await getBackgroundMusicBuffer('youtube', input.musicMood || plan.mood));
    } catch (e) { console.warn('[Documentary] music unavailable:', e.message); musicFile = null; }
  }

  // 6) الرندر
  const timeline = buildTimeline({ beats, plans, assets, boards, tokens, ratio: input.ratio, theme: input.theme, lang, captionsStyle: input.captions === 'none' ? null : input.captions, narrationFile, musicFile, motionGraphics: input.motionGraphics });
  const editable = !input.watermark && timeline.beats.reduce((x, b) => x + b.dur, 0) <= EDIT_MAX_MINUTES * 60; // الفيلم المجاني (بعلامة مائية) مفيهوش محرر مشاهد: التعديل كان هيشيل العلامة
  const r = await renderDocumentary({ timeline, keepClips: editable, workDir: path.join(workDir, 'render'), concurrency: Math.max(1, Math.min(3, Number(process.env.DOC_RENDER_CONCURRENCY || 2))), onProgress: ({ stage, done, total: t }) => prog('render', stage === 'clips' ? (done / t) * 0.85 : stage === 'joined' ? 0.88 : stage === 'audio' ? 0.94 : 0.99) });
  if (r.failures.length) console.warn(`[Documentary] job ${id}: ${r.failures.length} beat(s) fell back to plain backgrounds`);
  if (input.watermark) { try { r.file = await watermarkVideo(r.file); } catch (e) { throw new Error(`watermark failed: ${e.message}`); } }
  const chapters = plans.map((p, i) => (p.chapter ? { t: beats[i].start, title: p.chapter } : null)).filter(Boolean);
  // محرر المشاهد: بنخزّن مقاطع اللقطات + الصوت النهائي (لو الفيلم قصير كفاية) — فشل التخزين ما يفشّلش الفيلم
  let editor = null;
  if (editable && r.clipFiles) {
    try {
      await prog('upload', 0.2);
      editor = await persistEditor({ jobId: id, userId, render: r, timeline, beats, plans, assets, words: timeline.captions?.words || [], workDir: path.join(workDir, 'editor'), ratio: input.ratio, extraCredits: sources.map(s => s.url) });
    } catch (e) { console.warn(`[Documentary] job ${id}: editor data not stored (${e.message})`); }
  }
  return { editor, file: r.file, duration: r.duration, credits: [...allCredits, ...sources.map(s => s.url)], script, title, chapters, srt: buildSrt(timeline.captions?.words || tokens.map(t => ({ w: t.w, start: t.start, end: t.end }))) };
}

// عند إقلاع السيرفر: وظايف كانت شغالة اتقطعت → نردّ كريديتها
export async function recoverInterruptedJobs() {
  try {
    for (const e of await store.stuckEdits()) { if (e.charged > 0) await addCreditsBalance(e.user_id, e.charged).catch(() => {}); console.warn(`[Documentary] recovered interrupted edit of job ${e.id}${e.charged ? ' (refunded)' : ''}`); }
    sweepExpiredEditors();
    sweepOldAssets(); setInterval(sweepOldAssets, 3600e3).unref?.();
    setInterval(sweepExpiredEditors, 6 * 3600e3).unref?.();
    const rows = await store.claimStuckJobs();
    for (const r of rows) {
      if (r.meta?.trial) await store.releaseTrial(r.user_id, r.meta.trialKind || 'doc').catch(() => {});
      const back = (r.credits_charged || 0) - (r.credits_refunded || 0);
      if (back > 0) { await addCreditsBalance(r.user_id, back).catch(() => {}); await store.updateJob(r.id, { credits_refunded: r.credits_charged }).catch(() => {}); }
    }
    if (rows.length) console.warn(`[Documentary] recovered ${rows.length} interrupted job(s) and refunded their credits`);
  } catch (e) { console.warn('[Documentary] recovery skipped:', e.message); }
}
