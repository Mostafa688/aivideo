// ── assets.js ── فيديوهات العميل المرفوعة في شات الـagent للمونتاج: بتتخزّن مؤقتًا على القرص (3 ساعات) وتتحلّل
// (إطارات → vision model يوصف المشهد، وعينة صوت → Whisper يحدد لو فيه كلام) عشان الـagent والمخطط "يفهموا" الفيديو.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import fetch from 'node-fetch';
import { ffmpeg, probeDuration, hasAudio, rmQuiet, run } from '../documentary/ff.js';
import { displaySize } from './index.js';
import { transcribeWords } from '../documentary/align.js';

const ROOT = path.join(process.platform === 'win32' ? 'temp' : '/tmp/aivideo', 'montage_assets');
const TTL_MS = 3 * 3600e3;
export const MAX_ASSETS_PER_USER = 12;
export const MAX_ASSET_MINUTES = 20;
export const MAX_TOTAL_MINUTES = 20;
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const dirOf = (userId, id) => path.join(ROOT, String(userId), id);
const metaPath = (userId, id) => path.join(dirOf(userId, id), 'meta.json');

function readMeta(userId, id) {
  try { return JSON.parse(fs.readFileSync(metaPath(userId, id), 'utf8')); } catch { return null; }
}
function writeMeta(userId, id, meta) { fs.writeFileSync(metaPath(userId, id), JSON.stringify(meta)); }

export function listAssets(userId) {
  const dir = path.join(ROOT, String(userId));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map(id => readMeta(userId, id)).filter(Boolean).sort((a, b) => a.createdAt - b.createdAt);
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

/** يحفظ ملف اتحمّل (multer disk) كأصل + يفحصه. بيرمي Error بكود لو الفيديو مش صالح */
export async function registerAsset(userId, tmpFile, originalName) {
  const fail = (code, message) => { rmQuiet(path.dirname(tmpFile)); const e = new Error(message); e.code = code; throw e; };
  const size = await displaySize(tmpFile).catch(() => null);
  if (!size) fail('bad_video', 'This file is not a readable video.');
  const duration = await probeDuration(tmpFile).catch(() => 0);
  if (!(duration >= 1)) fail('bad_video', 'The video is too short (minimum 1 second).');
  if (duration > MAX_ASSET_MINUTES * 60 + 5) fail('too_long', `A single video can be up to ${MAX_ASSET_MINUTES} minutes.`);
  const existing = listAssets(userId);
  if (existing.length >= MAX_ASSETS_PER_USER) fail('too_many', `You can keep up to ${MAX_ASSETS_PER_USER} videos at a time.`);
  const id = crypto.randomBytes(8).toString('hex');
  const dir = dirOf(userId, id);
  fs.mkdirSync(dir, { recursive: true });
  const ext = (path.extname(originalName || '').replace(/[^.\w]/g, '').slice(0, 6) || '.mp4');
  const file = path.join(dir, `input${ext}`);
  fs.renameSync(tmpFile, file);
  rmQuiet(path.dirname(tmpFile));
  const meta = {
    id, userId, file, name: String(originalName || 'video').slice(0, 80), duration: Number(duration.toFixed(2)), width: size.w, height: size.h,
    hasAudio: await hasAudio(file).catch(() => false), createdAt: Date.now(), analysis: null,
  };
  writeMeta(userId, id, meta);
  analyzeInBackground(meta); // مش بنستناه — الرد بيرجع فورًا
  return meta;
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

async function analyze(meta, deps = {}) {
  const dir = path.dirname(meta.file);
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
