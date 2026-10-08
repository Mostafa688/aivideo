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
import sharp from 'sharp';
import { groqVision } from '../visionService.js';

const ROOT = path.join(process.platform === 'win32' ? 'temp' : '/tmp/aivideo', 'montage_assets');
const TTL_MS = 3 * 3600e3;
export const MAX_ASSETS_PER_USER = 20; // فيديوهات (الصوت المرفوع كـvoiceover بيتحسب لوحده)
export const MAX_ASSET_MINUTES = 20;
export const MAX_TOTAL_MINUTES = 20;
export const MAX_VOICE_MINUTES = 20;
export const MAX_STYLE_IMAGES = 4; // صور مرجعية لستايل الموشن جرافيك (مثلاً من Pinterest)
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;
export const isVideoAsset = (a) => (a.kind || 'video') === 'video';

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
  const videos = list.filter(isVideoAsset);
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
export async function registerAsset(userId, tmpFile, originalName, { seq = null, srcUrl = null } = {}) {
  const fail = (code, message) => { rmQuiet(path.dirname(tmpFile)); const e = new Error(message); e.code = code; throw e; };
  if (IMAGE_EXT.test(originalName || '') || IMAGE_EXT.test(tmpFile)) return registerImage(userId, tmpFile, originalName, { seq, fail });
  const size = await displaySize(tmpFile).catch(() => null);
  const duration = await probeDuration(tmpFile).catch(() => 0);
  const audioOnly = !size && duration >= 1 && await hasAudio(tmpFile).catch(() => false);
  if (!size && !audioOnly) fail('bad_video', 'This file is not a readable video or audio file.');
  if (!(duration >= 1)) fail('bad_video', 'The file is too short (minimum 1 second).');
  const kind = audioOnly ? 'audio' : 'video';
  if (kind === 'video' && duration > MAX_ASSET_MINUTES * 60 + 5) fail('too_long', `A single video can be up to ${MAX_ASSET_MINUTES} minutes.`);
  if (kind === 'audio' && duration > MAX_VOICE_MINUTES * 60 + 5) fail('too_long', `The voiceover can be up to ${MAX_VOICE_MINUTES} minutes.`);
  const existing = listAssets(userId);
  if (kind === 'video' && existing.filter(isVideoAsset).length >= MAX_ASSETS_PER_USER) fail('too_many', `You can keep up to ${MAX_ASSETS_PER_USER} videos at a time.`);
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
    hasAudio: kind === 'audio' ? true : await hasAudio(file).catch(() => false), createdAt: Date.now(), seq: Number.isFinite(Number(seq)) ? Number(seq) : null, srcUrl, analysis: null,
  };
  writeMeta(userId, id, meta);
  analyzeInBackground(meta); // مش بنستناه — الرد بيرجع فورًا
  return meta;
}

/** ملف صوت موجود على السيرفر (فويس الشات) يتسجّل كـvoiceover للمونتاج */
export async function registerVoiceFile(userId, srcFile, name = 'voiceover.mp3', srcUrl = null) {
  const tmpDir = path.join(path.dirname(ROOT), `mup_voice_${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, 'in' + (path.extname(srcFile) || '.mp3'));
  fs.copyFileSync(srcFile, tmp);
  return registerAsset(userId, tmp, name, { srcUrl });
}

/** صورة مرجعية لستايل الموشن جرافيك: بتتحلل (وصف الستايل + الألوان) والمونتاج بيعمل جرافيكس بنفس الروح */
async function registerImage(userId, tmpFile, originalName, { seq, fail }) {
  let md;
  try { md = await sharp(tmpFile).metadata(); } catch { md = null; }
  if (!md?.width || !md?.height) fail('bad_image', 'This file is not a readable image.');
  const existing = listAssets(userId);
  const imgs = existing.filter(a => a.kind === 'image');
  if (imgs.length >= MAX_STYLE_IMAGES) removeAssets(userId, imgs.slice(0, imgs.length - MAX_STYLE_IMAGES + 1).map(a => a.id)); // الأقدم بيتشال
  const id = crypto.randomBytes(8).toString('hex');
  const dir = dirOf(userId, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'ref.png');
  await sharp(tmpFile).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).png().toFile(file);
  rmQuiet(path.dirname(tmpFile));
  const meta = { id, userId, kind: 'image', file, name: String(originalName || 'image').slice(0, 80), duration: 0, width: md.width, height: md.height, hasAudio: false, createdAt: Date.now(), seq: Number.isFinite(Number(seq)) ? Number(seq) : null, srcUrl: null, analysis: null };
  writeMeta(userId, id, meta);
  analyzeInBackground(meta);
  return meta;
}

/** ألوان الصورة الغالبة (مرتبة بالتشبّع/التكرار) — بتتحول لثيم للقوالب */
export async function imagePalette(file) {
  const { data, info } = await sharp(file).resize(48, 48, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const x = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    x.n++; x.r += r; x.g += g; x.b += b; buckets.set(key, x);
  }
  const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
  return [...buckets.values()].map(x => {
    const r = x.r / x.n, g = x.g / x.n, b = x.b / x.n;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return { hex: `#${hex(r)}${hex(g)}${hex(b)}`, n: x.n, sat: mx ? (mx - mn) / mx : 0, lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 };
  }).sort((a, b) => b.n - a.n).slice(0, 12);
}

/** ثيم قوالب من ألوان صورة مرجعية: أكتر لونين مشبّعين = accent/accent2، والأغمق = لوح الخلفية */
export function themeFromPalette(pal) {
  if (!Array.isArray(pal) || !pal.length) return null;
  const vivid = pal.filter(c => c.sat > 0.35 && c.lum > 0.18 && c.lum < 0.92).sort((a, b) => (b.sat * Math.sqrt(b.n)) - (a.sat * Math.sqrt(a.n)));
  const accent = vivid[0]?.hex || '#ffd166';
  const accent2 = vivid.find(c => c.hex !== accent && Math.abs(parseInt(c.hex.slice(1, 3), 16) - parseInt(accent.slice(1, 3), 16)) + Math.abs(parseInt(c.hex.slice(3, 5), 16) - parseInt(accent.slice(3, 5), 16)) + Math.abs(parseInt(c.hex.slice(5, 7), 16) - parseInt(accent.slice(5, 7), 16)) > 90)?.hex || '#ffffff';
  const dark = [...pal].sort((a, b) => a.lum - b.lum)[0];
  const rgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
  const panelBase = dark && dark.lum < 0.35 ? dark.hex : '#0b0d14';
  return { label: 'Reference', bgTop: panelBase, bgBottom: panelBase, text: '#ffffff', muted: '#d0d4e0', accent, accent2, panel: `rgba(${rgb(panelBase)},0.82)`, panelStroke: `rgba(${rgb(accent)},0.55)`, grain: 0.04, vignette: 0.4, grade: 'none' };
}

// ── التحليل: وصف بصري + هل فيه كلام ──────────────────────────────────────────────────────────
const FRAME_POINTS = [0.06, 0.28, 0.5, 0.72, 0.94];
async function frameDataUrls(file, duration) {
  const out = [];
  for (const f of FRAME_POINTS) {
    const tmp = `${file}.f${Math.round(f * 100)}.jpg`;
    try {
      await ffmpeg(['-ss', String(Math.max(0, duration * f)), '-i', file, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '5', tmp]);
      out.push('data:image/jpeg;base64,' + fs.readFileSync(tmp).toString('base64'));
    } catch { /* إطار فاشل */ } finally { rmQuiet(tmp); }
  }
  return out;
}

// ── فهم الفيديو على مستوى المشاهد: حدود القطع (scene detection) + إطار من نص كل مشهد يتوصف بالـvision → timeline بالتوقيت ──
const SCENE_MIN_VIDEO_SEC = 6, SCENE_MAX = 24;
export async function detectSceneCuts(file, duration, { threshold = 0.32 } = {}) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-an', '-vf', `fps=6,scale=320:-2,select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'], { timeoutMs: 180000 });
  const cuts = [];
  for (const m of String(stderr).matchAll(/pts_time:([0-9.]+)/g)) cuts.push(Number(m[1]));
  return cuts.filter(t => Number.isFinite(t) && t > 0.4 && t < duration - 0.4).sort((a, b) => a - b);
}

/** حدود → مشاهد: أقصر من minLen بتتدمج في اللي قبلها، وفوق max بندمج أقصر مشهدين متجاورين */
export function buildScenes(cuts, duration, { minLen = 1.2, max = SCENE_MAX } = {}) {
  const b = [0, ...cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > 0.05), duration];
  let sc = [];
  for (let i = 0; i < b.length - 1; i++) if (b[i + 1] - b[i] > 0.01) sc.push({ start: b[i], end: b[i + 1] });
  const mergeAt = (i) => { // ادمج المشهد i في اللي قبله (أو بعده لو هو الأول)
    if (sc.length < 2) return;
    if (i > 0) { sc[i - 1].end = sc[i].end; sc.splice(i, 1); } else { sc[1].start = sc[0].start; sc.splice(0, 1); }
  };
  for (;;) {
    const i = sc.findIndex(x => x.end - x.start < minLen);
    if (i < 0 || sc.length < 2) break;
    mergeAt(i);
  }
  while (sc.length > max) {
    let best = 0, bl = Infinity;
    sc.forEach((x, i) => { const l = x.end - x.start; if (l < bl) { bl = l; best = i; } });
    mergeAt(best);
  }
  return sc.map(x => ({ start: Number(x.start.toFixed(2)), end: Number(x.end.toFixed(2)) }));
}

async function sceneFrame(file, t) {
  const tmp = `${file}.s${Math.round(t * 100)}.jpg`;
  try {
    await ffmpeg(['-ss', String(Math.max(0, t)), '-i', file, '-frames:v', '1', '-vf', 'scale=384:-2', '-q:v', '6', tmp]);
    return 'data:image/jpeg;base64,' + fs.readFileSync(tmp).toString('base64');
  } catch { return null; } finally { rmQuiet(tmp); }
}

const SCENES_PROMPT = (sc) => `These are ${sc.length} frames, one per scene, in order, taken from ONE video. Scene times (seconds): ${sc.map((x, i) => `${i}: ${x.start.toFixed(1)}-${x.end.toFixed(1)}`).join(' | ')}. You are a video editor logging the footage. Return ONLY JSON: {"scenes":[{"i":0,"what":"<=12 words: who/what is on screen, the action and the setting"}]} with exactly one entry per frame, same order. Describe only what you see.`;

/** يوصف كل مشهد (دفعات من 8 إطارات). بيرجّع [{start,end,what}] أو null لو الرؤية فشلت كلها */
export async function describeScenes(file, scenes, { ask } = {}) {
  const out = scenes.map(x => ({ ...x, what: '' }));
  let any = false;
  for (let from = 0; from < scenes.length; from += 8) {
    const chunk = scenes.slice(from, from + 8);
    const frames = [];
    for (const sc of chunk) frames.push(await sceneFrame(file, (sc.start + sc.end) / 2));
    const idx = frames.map((f, k) => (f ? k : -1)).filter(k => k >= 0);
    if (!idx.length) continue;
    try {
      const use = idx.map(k => chunk[k]);
      const urls = idx.map(k => frames[k]);
      const raw = ask ? await ask(urls, use) : (await groqVision({ max_tokens: 700, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: SCENES_PROMPT(use) }, ...urls.map(u => ({ type: 'image_url', image_url: { url: u } }))] }] })).choices?.[0]?.message?.content;
      const txt = typeof raw === 'string' ? raw : JSON.stringify(raw || {});
      const j = JSON.parse((txt.match(/\{[\s\S]*\}/) || ['{}'])[0]);
      for (const e of Array.isArray(j.scenes) ? j.scenes : []) {
        const k = idx[Number(e?.i)];
        if (k !== undefined && e?.what) { out[from + k].what = String(e.what).slice(0, 110); any = true; }
      }
    } catch (e) { console.warn('[Montage/assets] scene description failed:', e.message); }
  }
  return any ? out : null;
}

/** تحليل المشاهد لفيديو: null لو قصير جدًا أو لقطة واحدة متصلة */
export async function analyzeScenes(file, duration, deps = {}) {
  if (!(duration >= SCENE_MIN_VIDEO_SEC)) return null;
  const cuts = await (deps.detectCuts || detectSceneCuts)(file, duration);
  const scenes = buildScenes(cuts, duration);
  if (scenes.length < 2) return null;
  return (await describeScenes(file, scenes, { ask: deps.sceneVision })) || scenes.map(x => ({ ...x, what: '' }));
}

const VIDEO_PROMPT = (times) => `These are ${times.length} frames sampled from ONE video clip at ${times.map(t => `${t}s`).join(', ')}. You are a video editor studying the footage before editing it. Return ONLY JSON: {"summary":"<=40 words: who/what is shown (a person talking to camera? cinematic scene? screen recording? product? landscape? action?), setting, mood, lighting, camera motion and any quality problem (shaky, dark, blurry)","moments":[{"t":<second>,"what":"<=12 words: what is on screen at that time"}],"faces":"none|small|large (is a face the main subject and where)","energy":"calm|medium|high"}. One moment per frame, using the given seconds.`;

/** وصف الفيديو بالـvision: ملخص + لحظات بتوقيتها (عشان المخطط يعرف إيه بيحصل امتى) */
export async function describeVideo(urls, times, { ask } = {}) {
  if (ask) return ask(urls);
  const key = process.env.GROQ_API_KEY;
  if (!key || !urls.length) return null;
  const data = await groqVision({
    max_tokens: 420, temperature: 0.2, response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [{ type: 'text', text: VIDEO_PROMPT(times) }, ...urls.map(u => ({ type: 'image_url', image_url: { url: u } }))] }],
  });
  const raw = String(data.choices?.[0]?.message?.content || '').trim();
  try { return JSON.parse(raw.replace(/^```(?:json)?|```$/g, '')); } catch { return { summary: raw.slice(0, 300) }; }
}

const IMAGE_PROMPT = 'This image is a MOTION-GRAPHICS / design reference the customer wants their video graphics to look like (it may come from Pinterest or a template). Return ONLY JSON: {"summary":"<=45 words describing the visual style: layout, shapes (bars, boxes, circles, stickers), typography (bold condensed, handwritten, outlined…), colours, effects (neon glow, gradients, grain), and how the elements would animate","templates":["2-4 names, best first, from: kinetic_text, stack_text, marker_text, lower_third, bullet_panel, bottom_sheet, side_note, news_bar, counter, quote, icon_pop, stamp, percent_ring"],"text":"any readable text in the image, or empty"}';

export async function describeStyleImage(file, { ask } = {}) {
  if (ask) return ask(file);
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  const buf = await sharp(file).resize(768, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const data = await groqVision({ max_tokens: 300, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [{ type: 'text', text: IMAGE_PROMPT }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + buf.toString('base64') } }] }] });
  const raw = String(data.choices?.[0]?.message?.content || '').trim();
  try { return JSON.parse(raw.replace(/^```(?:json)?|```$/g, '')); } catch { return { summary: raw.slice(0, 300) }; }
}

export async function describeFrames(urls, { ask } = {}) {
  if (ask) return ask(urls);
  const key = process.env.GROQ_API_KEY;
  if (!key || !urls.length) return '';
  const data = await groqVision({
      max_tokens: 160, temperature: 0.2,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'These are 3 frames sampled from one video clip (start, middle, end). In at most 40 words describe what the clip shows: subject/people (a person talking to the camera? screen recording? product? landscape? action?), setting, motion, lighting and any quality problem (shaky, dark, blurry). Plain text only.' },
        ...urls.map(u => ({ type: 'image_url', image_url: { url: u } })),
      ] }],
  });
  return String(data.choices?.[0]?.message?.content || '').trim();
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
  if (meta.kind === 'image') {
    const out = { description: 'Motion-graphics style reference image', templates: [], palette: [] };
    try { out.palette = (await imagePalette(meta.file)).slice(0, 8); } catch (e) { console.warn('[Montage/assets] palette failed:', e.message); }
    try {
      const r = await describeStyleImage(meta.file, deps);
      if (r) { out.description = String(r.summary || out.description).slice(0, 400); out.templates = (Array.isArray(r.templates) ? r.templates : []).map(String).slice(0, 4); out.text = String(r.text || '').slice(0, 120); }
    } catch (e) { console.warn('[Montage/assets] style vision skipped:', e.message); }
    return out;
  }
  const out = { description: '', hasSpeech: false, gist: '', moments: [] };
  const scenesP = analyzeScenes(meta.file, meta.duration, deps).catch((e) => { console.warn('[Montage/assets] scene analysis skipped:', e.message); return null; });
  try {
    const times = FRAME_POINTS.map(f => Number((meta.duration * f).toFixed(1)));
    const v = await describeVideo(await frameDataUrls(meta.file, meta.duration), times, deps);
    if (typeof v === 'string') out.description = v;
    else if (v) {
      out.description = String(v.summary || '').slice(0, 400);
      out.moments = (Array.isArray(v.moments) ? v.moments : []).map(m => ({ t: Number(m?.t) || 0, what: String(m?.what || '').slice(0, 100) })).filter(m => m.what).slice(0, 8);
      if (['none', 'small', 'large'].includes(v.faces)) out.faces = v.faces;
      if (['calm', 'medium', 'high'].includes(v.energy)) out.energy = v.energy;
    }
  } catch (e) { console.warn('[Montage/assets] vision skipped:', e.message); }
  if (meta.hasAudio) {
    try { Object.assign(out, await (deps.speech || sampleSpeech)(meta.file, meta.duration, dir)); } catch (e) { console.warn('[Montage/assets] speech check skipped:', e.message); }
  }
  // المشاهد بتخلص بعد الوصف (فيديو طويل = أبطأ) — الوصف بيتحفظ فورًا، والمشاهد بتتضاف لما تجهز (analyzeInBackground)
  Object.defineProperty(out, '_scenesP', { value: scenesP, enumerable: false });
  return out;
}

const pending = new Map(); // `${userId}:${id}` → Promise
function analyzeInBackground(meta) {
  const key = `${meta.userId}:${meta.id}`;
  const p = analyze(meta).then(async (a) => {
    const m = readMeta(meta.userId, meta.id); if (m) { m.analysis = a; writeMeta(meta.userId, meta.id, m); }
    const sc = a?._scenesP ? await a._scenesP : null;
    if (sc?.length) { const m2 = readMeta(meta.userId, meta.id); if (m2) { m2.analysis = { ...(m2.analysis || {}), scenes: sc }; writeMeta(meta.userId, meta.id, m2); } }
    return a;
  })
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

/** سطر المشاهد المكتشفة (للـagent والمخطط): [من-إلى] الوصف — حد أقصى 14 مشهد في الملاحظة */
export function scenesNote(analysis, max = 14) {
  const sc = analysis?.scenes;
  if (!Array.isArray(sc) || sc.length < 2) return '';
  const shown = sc.length <= max ? sc : sc.filter((_, i) => i % Math.ceil(sc.length / max) === 0).slice(0, max);
  return ` — ${sc.length} scenes (detected cuts)${sc.length > max ? `, first ${shown.length} sampled` : ''}: ${shown.map(x => `[${Number(x.start).toFixed(1)}-${Number(x.end).toFixed(1)}] ${x.what || '…'}`).join('; ')}`;
}

/** ملاحظة النظام للـagent: كل اللي متخزّن للعميل (بترجع في كل رسالة عشان الـids ما تضيعش بين الرسائل) */
export async function buildMontageNote(userId) {
  const stored = listAssets(userId).slice(0, MAX_ASSETS_PER_USER + 1);
  if (!stored.length) return null;
  const metas = [];
  for (const m0 of stored) { const m = await withAnalysis(userId, m0.id, m0.kind === 'audio' ? 60000 : 25000); if (m) metas.push(m); }
  const vids = metas.filter(isVideoAsset), voice = metas.find(m => m.kind === 'audio'), imgs = metas.filter(m => m.kind === 'image');
  if (!vids.length && !voice && !imgs.length) return null;
  const lines = vids.map((m, i) => `V${i + 1} [id ${m.id}] "${m.name}" ${Math.round(m.duration)}s ${m.width}x${m.height}${m.height > m.width ? ' (vertical 9:16)' : ''}, audio: ${m.analysis?.hasSpeech ? 'speech' : (m.hasAudio ? 'ambient sound only' : 'none')} — shows: ${m.analysis?.description || 'analysis not available'}${m.analysis?.moments?.length ? ` — timeline: ${m.analysis.moments.map(x => `${x.t}s ${x.what}`).join('; ')}` : ''}${scenesNote(m.analysis)}${m.analysis?.gist ? ` — says (excerpt): "${m.analysis.gist}"` : ''}`);
  const imgLines = imgs.map((m, i) => `STYLE REFERENCE IMAGE R${i + 1} [id ${m.id}] "${m.name}" — ${m.analysis?.description || 'motion-graphics reference'}${m.analysis?.templates?.length ? ` (closest graphic types: ${m.analysis.templates.join(', ')})` : ''}`);
  const totalSec = vids.reduce((a, m) => a + m.duration, 0);
  const priceSec = voice ? Math.max(voice.duration, 30) : totalSec;
  return `MONTAGE UPLOADS currently stored for this customer (kept 3 hours; the list is in the order the montage will use — numbered file names are the intended story order): ${vids.length ? lines.join(' | ') : 'no videos yet'}.${imgs.length ? ` ${imgLines.join(' | ')} — these images are used automatically as the look of the montage's motion graphics (same colours and the closest graphic style); mention it in one line.` : ''}${voice ? ` VOICEOVER [id ${voice.id}] "${voice.name}" ${Math.round(voice.duration)}s — transcript excerpt: "${voice.analysis?.gist || ''}" — with a voiceover the final video is exactly as long as the voiceover, all clip sounds are muted and the scenes are laid over the narration.` : ''} Footage total ${Math.round(totalSec)}s; the montage price would be ${getAutoEditCreditCost(priceSec / 60)} credits. These ids are valid — never ask the customer for URLs or ids. See rule 13e.`;
}
