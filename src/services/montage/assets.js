// ── assets.js ── فيديوهات العميل المرفوعة في شات الـagent للمونتاج: بتتخزّن مؤقتًا على القرص (3 ساعات) وتتحلّل
// (إطارات → vision model يوصف المشهد، وعينة صوت → Whisper يحدد لو فيه كلام) عشان الـagent والمخطط "يفهموا" الفيديو.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { ffmpeg, probeDuration, hasAudio, rmQuiet, run } from '../documentary/ff.js';
import { displaySize, transcribeAudioFile } from './index.js';
import { transcribeWords } from '../documentary/align.js';
import { getAutoEditCreditCost } from '../creditPricingEngine.js';

const ROOT = path.join(process.platform === 'win32' ? 'temp' : '/tmp/aivideo', 'montage_assets');
const TTL_MS = 3 * 3600e3;
export const MAX_ASSETS_PER_USER = 20; // فيديوهات (الصوت المرفوع كـvoiceover بيتحسب لوحده)
export const MAX_ASSET_MINUTES = 20;
export const MAX_TOTAL_MINUTES = 20;
export const MAX_VOICE_MINUTES = 20;
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const dirOf = (userId, id) => path.join(ROOT, String(userId), id);
const metaPath = (userId, id) => path.join(dirOf(userId, id), 'meta.json');

function readMeta(userId, id) {
  try { return JSON.parse(fs.readFileSync(metaPath(userId, id), 'utf8')); } catch { return null; }
}
function writeMeta(userId, id, meta) { fs.writeFileSync(metaPath(userId, id), JSON.stringify(meta)); }

const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

/**
 * ترتيب الفيديوهات: لو أسماء أغلبها فيها أرقام (1.1, 1.2, … 1.10 أو clip2 clip10) فالرقم هو الترتيب المقصود (ترتيب طبيعي)،
 * وغير كده ترتيب اختيار العميل (seq من الفرونت) — مش ترتيب انتهاء الرفع (الرفع متوازي فبيتلخبط).
 */
export function orderAssets(list) {
  const videos = list.filter(a => a.kind !== 'audio');
  const numbered = videos.filter(a => /\d/.test(a.name || '')).length;
  const byName = videos.length >= 2 && numbered >= Math.ceil(videos.length * 0.7);
  const arr = [...list];
  arr.sort((a, b) => (byName ? natural(a.name, b.name) : ((a.seq ?? a.createdAt) - (b.seq ?? b.createdAt))) || a.createdAt - b.createdAt);
  return arr;
}

export function listAssets(userId) {
  const dir = path.join(ROOT, String(userId));
  if (!fs.existsSync(dir)) return [];
  return orderAssets(fs.readdirSync(dir).map(id => readMeta(userId, id)).filter(Boolean));
}

/** يرجّع ملفات الأصول المطلوبة (بترتيب الطلب) لو كلها بتاعة العميل وموجودة، وإلا null */
export function resolveAssets(userId, ids) {
  const out = [];
  for (const id of ids || []) {
    if (!/^[a-f0-9]{16}$/.test(String(id))) return null;
    const m = readMeta(userId, id);
    if (!m || !fs.existsSync(m.file)) return null;
    out.push(m);
  }
  return out;
}

export function removeAssets(userId, ids) { for (const id of ids || []) rmQuiet(dirOf(userId, id)); }

export function sweepOldAssets() {
  try {
    if (!fs.existsSync(ROOT)) return;
    const now = Date.now();
    for (const u of fs.readdirSync(ROOT)) {
      const ud = path.join(ROOT, u);
      for (const id of fs.readdirSync(ud)) {
        const m = (() => { try { return JSON.parse(fs.readFileSync(path.join(ud, id, 'meta.json'), 'utf8')); } catch { return null; } })();
        if (!m || now - m.createdAt > TTL_MS) rmQuiet(path.join(ud, id));
      }
    }
  } catch { /* ignore */ }
}

/** يحفظ ملف اتحمّل (multer disk) كأصل (فيديو أو صوت فويس-أوفر) + يفحصه. بيرمي Error بكود لو الملف مش صالح */
export async function registerAsset(userId, tmpFile, originalName, { seq = null } = {}) {
  const fail = (code, message) => { rmQuiet(path.dirname(tmpFile)); const e = new Error(message); e.code = code; throw e; };
  const size = await displaySize(tmpFile).catch(() => null);
  const duration = await probeDuration(tmpFile).catch(() => 0);
  const audioOnly = !size && duration >= 1 && await hasAudio(tmpFile).catch(() => false);
  if (!size && !audioOnly) fail('bad_video', 'This file is not a readable video or audio file.');
  if (!(duration >= 1)) fail('bad_video', 'The file is too short (minimum 1 second).');
  const kind = audioOnly ? 'audio' : 'video';
  if (kind === 'video' && duration > MAX_ASSET_MINUTES * 60 + 5) fail('too_long', `A single video can be up to ${MAX_ASSET_MINUTES} minutes.`);
  if (kind === 'audio' && duration > MAX_VOICE_MINUTES * 60 + 5) fail('too_long', `The voiceover can be up to ${MAX_VOICE_MINUTES} minutes.`);
  const existing = listAssets(userId);
  if (kind === 'video' && existing.filter(a => a.kind !== 'audio').length >= MAX_ASSETS_PER_USER) fail('too_many', `You can keep up to ${MAX_ASSETS_PER_USER} videos at a time.`);
  if (kind === 'audio') removeAssets(userId, existing.filter(a => a.kind === 'audio').map(a => a.id)); // صوت واحد بس: الجديد بيحل محل القديم
  const id = crypto.randomBytes(8).toString('hex');
  const dir = dirOf(userId, id);
  fs.mkdirSync(dir, { recursive: true });
  const ext = (path.extname(originalName || '').replace(/[^.\w]/g, '').slice(0, 6) || (kind === 'audio' ? '.mp3' : '.mp4'));
  const file = path.join(dir, `input${ext}`);
  fs.renameSync(tmpFile, file);
  rmQuiet(path.dirname(tmpFile));
  const meta = {
    id, userId, kind, file, name: String(originalName || kind).slice(0, 80), duration: Number(duration.toFixed(2)), width: size?.w || 0, height: size?.h || 0,
    hasAudio: kind === 'audio' ? true : await hasAudio(file).catch(() => false), createdAt: Date.now(), seq: Number.isFinite(Number(seq)) ? Number(seq) : null, analysis: null,
  };
  writeMeta(userId, id, meta);
  analyzeInBackground(meta); // مش بنستناه — الرد بيرجع فورًا
  return meta;
}

/** ملف صوت موجود على السيرفر (فويس الشات) يتسجّل كـvoiceover للمونتاج */
export async function registerVoiceFile(userId, srcFile, name = 'voiceover.mp3') {
  const tmpDir = path.join(path.dirname(ROOT), `mup_voice_${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, 'in' + (path.extname(srcFile) || '.mp3'));
  fs.copyFileSync(srcFile, tmp);
  return registerAsset(userId, tmp, name);
}

// ── التحليل: وصف بصري + هل فيه كلام ──────────────────────────────────────────────────────────
async function frameDataUrls(file, duration) {
  const out = [];
  for (const f of [0.12, 0.5, 0.88]) {
    const tmp = `${file}.f${Math.round(f * 100)}.jpg`;
    try {
      await ffmpeg(['-ss', String(Math.max(0, duration * f)), '-i', file, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '5', tmp]);
      out.push('data:image/jpeg;base64,' + fs.readFileSync(tmp).toString('base64'));
    } catch { /* إطار فاشل */ } finally { rmQuiet(tmp); }
  }
  return out;
}

export async function describeFrames(urls, { ask } = {}) {
  if (ask) return ask(urls);
  const key = process.env.GROQ_API_KEY;
  if (!key || !urls.length) return '';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: VISION_MODEL, max_tokens: 160, temperature: 0.2,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'These are 3 frames sampled from one video clip (start, middle, end). In at most 40 words describe what the clip shows: subject/people (a person talking to the camera? screen recording? product? landscape? action?), setting, motion, lighting and any quality problem (shaky, dark, blurry). Plain text only.' },
        ...urls.map(u => ({ type: 'image_url', image_url: { url: u } })),
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`vision ${res.status}`);
  return String((await res.json()).choices?.[0]?.message?.content || '').trim();
}

/** هل في كلام؟ بنفرّغ عينة ≤ 75 ثانية من النص */
async function sampleSpeech(file, duration, dir, language = null) {
  const start = Math.max(0, Math.min(duration * 0.3, duration - 75));
  const wav = path.join(dir, 'speech_sample.mp3');
  await ffmpeg(['-ss', String(start), '-i', file, '-t', '75', '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', wav]);
  try {
    const r = await transcribeWords(wav, { language });
    const spokenSec = r.words.reduce((a, w) => a + Math.max(0, w.end - w.start), 0);
    const sample = Math.min(75, duration - start);
    return { hasSpeech: r.words.length >= 6 && spokenSec / Math.max(1, sample) > 0.12, gist: r.text.trim().slice(0, 240) };
  } finally { rmQuiet(wav); }
}

async function analyzeVoice(meta, deps = {}) {
  const dir = path.dirname(meta.file);
  const words = await (deps.transcribe || transcribeAudioFile)(meta.file, dir, null);
  return { description: 'Voiceover narration', hasSpeech: words.length > 0, gist: words.map(w => w.w).join(' ').slice(0, 240), words: words.map(w => [w.w, Number(w.start.toFixed(2)), Number(w.end.toFixed(2))]) };
}

async function analyze(meta, deps = {}) {
  const dir = path.dirname(meta.file);
  if (meta.kind === 'audio') { try { return await analyzeVoice(meta, deps); } catch (e) { console.warn('[Montage/assets] voiceover transcription failed:', e.message); return { description: 'Voiceover narration', hasSpeech: false, gist: '', words: [] }; } }
  const out = { description: '', hasSpeech: false, gist: '' };
  try { out.description = await describeFrames(await frameDataUrls(meta.file, meta.duration), deps); } catch (e) { console.warn('[Montage/assets] vision skipped:', e.message); }
  if (meta.hasAudio) {
    try { Object.assign(out, await (deps.speech || sampleSpeech)(meta.file, meta.duration, dir)); } catch (e) { console.warn('[Montage/assets] speech check skipped:', e.message); }
  }
  return out;
}

const pending = new Map(); // `${userId}:${id}` → Promise
function analyzeInBackground(meta) {
  const key = `${meta.userId}:${meta.id}`;
  const p = analyze(meta).then(a => { const m = readMeta(meta.userId, meta.id); if (m) { m.analysis = a; writeMeta(meta.userId, meta.id, m); } return a; })
    .catch(() => null).finally(() => pending.delete(key));
  pending.set(key, p);
}

/** ينتظر انتهاء التحليل (بحد أقصى timeoutMs) ويرجّع الأصل بتحليله */
export async function withAnalysis(userId, id, timeoutMs = 25000) {
  const key = `${userId}:${id}`;
  const p = pending.get(key);
  if (p) await Promise.race([p, new Promise(r => setTimeout(r, timeoutMs))]);
  return readMeta(userId, id);
}

export { analyze as analyzeAsset };

/** ملاحظة النظام للـagent: كل اللي متخزّن للعميل (بترجع في كل رسالة عشان الـids ما تضيعش بين الرسائل) */
export async function buildMontageNote(userId) {
  const stored = listAssets(userId).slice(0, MAX_ASSETS_PER_USER + 1);
  if (!stored.length) return null;
  const metas = [];
  for (const m0 of stored) { const m = await withAnalysis(userId, m0.id, m0.kind === 'audio' ? 60000 : 25000); if (m) metas.push(m); }
  const vids = metas.filter(m => m.kind !== 'audio'), voice = metas.find(m => m.kind === 'audio');
  if (!vids.length && !voice) return null;
  const lines = vids.map((m, i) => `V${i + 1} [id ${m.id}] "${m.name}" ${Math.round(m.duration)}s ${m.width}x${m.height}, audio: ${m.analysis?.hasSpeech ? 'speech' : (m.hasAudio ? 'ambient sound only' : 'none')} — shows: ${m.analysis?.description || 'analysis not available'}${m.analysis?.gist ? ` — says (excerpt): "${m.analysis.gist}"` : ''}`);
  const totalSec = vids.reduce((a, m) => a + m.duration, 0);
  const priceSec = voice ? Math.max(voice.duration, 30) : totalSec;
  return `MONTAGE UPLOADS currently stored for this customer (kept 3 hours; the list is in the order the montage will use — numbered file names are the intended story order): ${vids.length ? lines.join(' | ') : 'no videos yet'}.${voice ? ` VOICEOVER [id ${voice.id}] "${voice.name}" ${Math.round(voice.duration)}s — transcript excerpt: "${voice.analysis?.gist || ''}" — with a voiceover the final video is exactly as long as the voiceover, all clip sounds are muted and the scenes are laid over the narration.` : ''} Footage total ${Math.round(totalSec)}s; the montage price would be ${getAutoEditCreditCost(priceSec / 60)} credits. These ids are valid — never ask the customer for URLs or ids. See rule 13e.`;
}
