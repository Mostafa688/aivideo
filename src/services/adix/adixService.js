// ── adix/adixService.js ── Adix: إعلان منتج كامل بيعمله Claude Opus 5.5 من الأول للآخر.
// 1) العميل بيرفع لحد 10 صور للمنتج + فكرته → Opus بيشوف الصور (كونتاكت شيت) ويحلل المنتج، ويختار أنسب موديل فيديو
//    ودقته ومدته، ويكتب الفكرة واللقطات والبرومبتات والكلام → عرض سعر بالتكلفة الفعلية (من غير هامش ربح) والعميل يوافق.
// 2) توليد الفيديو الأساسي (لقطة واحدة أو أكتر على حسب أقصى مدة للموديل).
// 3) Opus بيراجع الفيديو (شيت فريمات بتوقيتها + نص الكلام بتوقيت كل كلمة) ويكتب خطة مونتاج (EDL): قص، لقطات إضافية
//    (صورة/فيديو بيتولدوا بنفس المنتج)، زووم، موشن جرافيك في أماكن محددة، ترجمة، شاشة نهاية، موسيقى.
// 4) المونتاج (compose.js) → 5) Opus بيراجع النسخة النهائية مرة تانية، ولو فيه مشكلة بيصلح خطة المونتاج ونعيد التركيب.
// كل خطوة مدفوعة بتتسجل في دفتر (ledger) بتكلفتها الحقيقية بالدولار؛ بنحجز التقدير مقدمًا والباقي بيرجع في الآخر.
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import pkg from 'pg';
import { generateNewModelVideo, NEW_VIDEO_MODELS } from '../newVideoModelsService.js';
import { generateNewModelImages } from '../newImageModelsService.js';
import { REPLICATE_MODEL_COSTS, usdToCredits } from '../creditPricingEngine.js';
import { uploadBufferToR2 } from '../audioVideoService.js';
import { getBackgroundMusicBuffer } from '../videoAudioService.js';
import { transcribeWords } from '../documentary/align.js';
import { ffmpeg, probeDuration, hasAudio, rmQuiet } from '../documentary/ff.js';
import { toCutout } from '../codeVideo/images.js';
import { chargeCredits, addCreditsBalance, getCreditsBalance } from '../authService.js';
import { checkContentSafety } from '../scriptService.js';
import { composeAd, sanitizeEdl, SFX_TYPES, MOTIONS, TRANSITIONS } from './compose.js';
import { DESIGN_DOC, FONT_CHOICES } from './designKit.js';
import { musicLibrary, musicPath } from './musicBeats.js';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false, max: 3 });

const ready = (async () => {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS adix_jobs (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, status TEXT DEFAULT 'planning', stage TEXT DEFAULT 'planning', progress INTEGER DEFAULT 0,
    input JSONB NOT NULL, plan JSONB, edl JSONB, state JSONB DEFAULT '{}'::jsonb, ledger JSONB DEFAULT '[]'::jsonb,
    quote INTEGER DEFAULT 0, reserved INTEGER DEFAULT 0, spent INTEGER DEFAULT 0, video_url TEXT, thumb_url TEXT, error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
})().catch((e) => console.warn('[Adix] table init failed:', e.message));

// ── الثوابت ──
export const ADIX_LIMITS = { maxPhotos: 10, minSec: 5, maxSec: 60, maxShots: 8, maxInserts: 4 };
const OPUS = { slug: 'anthropic/claude-opus-5.5', inPerM: 4, outPerM: 20 };
// تكاليف تقديرية (بالدولار) للخطوات اللي مالهاش سعر ثابت — بنحجزها مقدمًا، والفعلي بيتحسب من التوكنز الحقيقية
const EST = { review: 0.34, finalReview: 0.2, fixRound: 0.24, asr: 0.003, renderPerMin: 0.03, cutout: 0.001 };
const INSERT_IMAGE_MODEL = 'nano_banana_2';
const INSERT_VIDEO_MODEL = 'wan_3'; const INSERT_VIDEO_TIER = '720p';
const DIM = { '9:16': [1080, 1920], '16:9': [1920, 1080] };
const MUSIC_MOODS = ['upbeat', 'epic', 'emotional', 'chill', 'tension', 'documentary', 'general'];

// الموديلات اللي Opus بيختار منها (أقوى الموجود حاليًا) — المدد والدقات من NEW_VIDEO_MODELS/REPLICATE_MODEL_COSTS نفسهم
export const ADIX_VIDEO_MODELS = {
  seedance_2_5: { ui: { ar: 'المنتج بيطلع مطابق للصور بالظبط (بياخد كل صورك كمرجع)، لقطة واحدة متصلة لحد 30 ثانية، وبيعمل صوت وكلام', en: 'Product looks exactly like your photos (uses all of them as references), one continuous take up to 30s, with sound and speech', tags_ar: ['مطابقة المنتج', 'صوت وكلام'], tags_en: ['Product fidelity', 'Sound & speech'] }, label: 'Seedance 2.5', tiers: ['480p', '720p'], refs: 30, audio: true,
    note: 'BEST product fidelity: takes ALL the product photos as references so the product looks exactly like them (logo, label, colors, shape). Up to 30s in ONE continuous take with several camera moves. Native sound effects, music and spoken lines (good for voice-over / a person talking).' },
  kling_3_0_omni: { ui: { ar: 'أوقع حركة وفيزياء: سوائل ورشّ وإيدين بتستخدم المنتج وناس — بجودة 1080p', en: 'Most realistic motion & physics: liquids, splashes, hands using the product, people — 1080p', tags_ar: ['حركة واقعية', '1080p'], tags_en: ['Realistic motion', '1080p'] }, label: 'Kling 3.0 Omni', tiers: ['720p', '1080p'], refs: 0, audio: true,
    note: 'Most realistic motion and physics (liquids pouring, splashes, hands using the product, fabric, people). Premium 1080p look. Starts from ONE product photo as the first frame. 3–15s per shot.' },
  veo3_standard: { ui: { ar: 'أعلى واقعية سينمائية وأحسن ناس بتتكلم (حركة شفايف وصوت طبيعي)، لحد 8 ثواني للقطة', en: 'Top cinematic realism and the best talking people (lip-sync, natural voice), up to 8s per shot', tags_ar: ['سينمائي', 'ناس بتتكلم'], tags_en: ['Cinematic', 'Talking people'] }, label: 'Veo 3.1', tiers: ['720p', '1080p'], refs: 0, audio: true,
    note: 'Top cinematic realism and the best talking humans (lip-sync, natural voice, ambience). Starts from ONE photo. Max 8s per shot (4/6/8), so longer ads need several shots.' },
  veo3_fast: { ui: { ar: 'جودة Veo بسعر أقل، لحد 8 ثواني للقطة', en: 'Veo quality for less, up to 8s per shot', tags_ar: ['أوفر من Veo'], tags_en: ['Cheaper Veo'] }, label: 'Veo 3.1 Fast', tiers: ['720p', '1080p'], refs: 0, audio: true,
    note: 'Veo quality for less. Starts from ONE photo. Max 8s per shot (4/6/8).' },
  omni_flash_1_1: { ui: { ar: 'ثبات كويس للمنتج بلحد 10 صور مرجعية وسعر أقل، لحد 10 ثواني — من غير كلام', en: 'Good product consistency with up to 10 reference photos, lower price, up to 10s — no speech', tags_ar: ['سعر أقل'], tags_en: ['Lower price'] }, label: 'Gemini Omni 1.1 Flash', tiers: ['720p', '1080p'], refs: 10, audio: false,
    note: 'Good product consistency with up to 10 reference photos, cheaper than Seedance. 3–10s per shot. No reliable voice.' },
  wan_3: { ui: { ar: 'الأرخص: حركة ناعمة 1080p لحد 30 ثانية من صورة واحدة — الإعلان بيعتمد على الموسيقى والنصوص', en: 'Cheapest: smooth 1080p up to 30s from one photo — the ad relies on music and on-screen text', tags_ar: ['الأرخص', '1080p'], tags_en: ['Cheapest', '1080p'] }, label: 'Wan 3', tiers: ['720p', '1080p'], refs: 0, audio: false,
    note: 'Budget option: smooth 1080p up to 30s from ONE photo. No voice — music + motion graphics carry the ad.' },
};

const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const hex = (c, d = '#ff3d6e') => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : d);
const toCredits = (usd) => (usd > 0 ? usdToCredits(usd, { multiplier: 1 }) : 0); // بالتكلفة — من غير هامش ربح
export const usdPerSec = (key, tier) => { const c = REPLICATE_MODEL_COSTS[key]; return Number(c?.tiers?.[tier] ?? c?.usdCost ?? 0); };
const imageUsd = (key) => Number(REPLICATE_MODEL_COSTS[key]?.usdCost ?? 0.07);

/** أقرب مدة صالحة للموديل (Veo: 4/6/8 بس، الباقي من الأقل للأقصى) */
export function fitShotSeconds(key, sec) {
  const m = NEW_VIDEO_MODELS[key]; const s = Math.max(1, Math.round(num(sec, 5)));
  if (m?.allowedDurations) return m.allowedDurations.find((d) => d >= s) || m.allowedDurations[m.allowedDurations.length - 1];
  return clamp(s, m?.minDurationSec || 3, m?.maxDurationSec || 10);
}
export const maxShotSec = (key) => { const m = NEW_VIDEO_MODELS[key]; return m?.allowedDurations ? Math.max(...m.allowedDurations) : (m?.maxDurationSec || 10); };

// ── Opus على Replicate ──
async function opusCall({ system, prompt, imageUrl = null, maxTokens = 12000, effort = 'medium', timeoutMs = 420000 }) {
  const token = process.env.REPLICATE_API_TOKEN; if (!token) throw new Error('REPLICATE_API_TOKEN not set');
  const input = { prompt, system_prompt: system, max_tokens: maxTokens, effort, ...(imageUrl ? { image: imageUrl, max_image_resolution: 2 } : {}) };
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const t0 = Date.now();
  let pred = await (await fetch(`https://api.replicate.com/v1/models/${OPUS.slug}/predictions`, { method: 'POST', headers: { ...H, Prefer: 'wait=60' }, body: JSON.stringify({ input }) })).json();
  while (pred && pred.id && !['succeeded', 'failed', 'canceled'].includes(pred.status) && Date.now() - t0 < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    pred = await (await fetch(pred.urls?.get || `https://api.replicate.com/v1/predictions/${pred.id}`, { headers: H })).json();
  }
  if (!pred || pred.status !== 'succeeded') throw new Error(`opus ${pred?.status || 'no response'}: ${String(pred?.error || pred?.detail || '').slice(0, 200)}`);
  const text = (Array.isArray(pred.output) ? pred.output.join('') : String(pred.output || '')).trim();
  const inTok = Number(pred.metrics?.input_token_count) || Math.ceil((system.length + prompt.length) / 3.6) + (imageUrl ? 2800 : 0);
  const outTok = Number(pred.metrics?.output_token_count) || Math.ceil(text.length / 3.6) * 2;
  return { text, usd: (inTok / 1e6) * OPUS.inPerM + (outTok / 1e6) * OPUS.outPerM };
}
export function parseJsonLoose(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '');
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no json');
  return JSON.parse(t.slice(a, b + 1));
}
async function opusJson(args) {
  const r = await opusCall(args); let usd = r.usd;
  try { return { json: parseJsonLoose(r.text), usd }; } catch { /* مرة كمان */ }
  const r2 = await opusCall({ ...args, prompt: `${args.prompt}\n\nIMPORTANT: reply with ONLY one valid JSON object — no prose, no markdown fences.` });
  usd += r2.usd;
  return { json: parseJsonLoose(r2.text), usd };
}

// ── صور ──
async function fetchBuffer(url) { const r = await fetch(url); if (!r.ok) throw new Error(`download ${r.status}`); return Buffer.from(await r.arrayBuffer()); }
async function download(url, file) { fs.writeFileSync(file, await fetchBuffer(url)); return file; }
const labelSvg = (w, h, text) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect x="0" y="0" width="${Math.max(64, text.length * 15 + 20)}" height="38" rx="8" fill="#000" fill-opacity="0.78"/><text x="10" y="27" font-family="Noto Sans,DejaVu Sans,sans-serif" font-size="24" font-weight="700" fill="#fff">${text.replace(/[<&>]/g, '')}</text></svg>`);

/** شبكة صور مرقّمة (للمنتج #1..#10 أو لفريمات الفيديو بتوقيتها) في صورة واحدة ≤2 ميجابكسل — Opus على Replicate بياخد صورة واحدة */
export async function buildSheet(buffers, labels, { cell = 420, cols = null } = {}) {
  const n = buffers.length; const c = cols || Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n / c);
  const metas = await Promise.all(buffers.map((b) => sharp(b, { failOn: 'none' }).metadata()));
  const portrait = metas.filter((m) => (m.height || 1) > (m.width || 1)).length > n / 2;
  const cw = cell, ch = portrait ? Math.round(cell * 16 / 9) : Math.round(cell * 9 / 16) < 240 ? cell : Math.round(cell * 9 / 16);
  const tiles = await Promise.all(buffers.map(async (b, i) => {
    const img = await sharp(b, { failOn: 'none' }).rotate().resize(cw, ch, { fit: 'contain', background: '#141218' }).png().toBuffer();
    return sharp(img).composite([{ input: labelSvg(cw, ch, labels[i]), left: 0, top: 0 }]).jpeg({ quality: 86 }).toBuffer();
  }));
  let sheet = await sharp({ create: { width: c * cw + (c - 1) * 6, height: rows * ch + (rows - 1) * 6, channels: 3, background: '#000' } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % c) * (cw + 6), top: Math.floor(i / c) * (ch + 6) }))).jpeg({ quality: 86 }).toBuffer();
  const m = await sharp(sheet).metadata();
  const scale = Math.min(1, Math.sqrt(1.95e6 / (m.width * m.height)));
  if (scale < 1) sheet = await sharp(sheet).resize(Math.round(m.width * scale)).jpeg({ quality: 86 }).toBuffer();
  return sheet;
}

/** فريمات من فيديو كل خطوة زمنية + شيت بتوقيتها */
async function framesSheet(videoFile, workDir, { maxFrames = 16 } = {}) {
  const D = await probeDuration(videoFile);
  const n = clamp(Math.round(D / 1.5), 6, maxFrames); const step = D / n;
  const times = Array.from({ length: n }, (_, i) => +(step * (i + 0.5)).toFixed(2));
  const bufs = [];
  for (const [i, t] of times.entries()) {
    const f = path.join(workDir, `fr_${i}.jpg`);
    await ffmpeg(['-ss', t.toFixed(2), '-i', videoFile, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', f]);
    bufs.push(fs.readFileSync(f)); rmQuiet(f);
  }
  return { sheet: await buildSheet(bufs, times.map((t) => `t=${t.toFixed(1)}s`), { cell: 360, cols: Math.min(n, (await sharp(bufs[0]).metadata()).height > (await sharp(bufs[0]).metadata()).width ? 6 : 4) }), times, duration: D };
}

// ── قاعدة البيانات ──
async function save(id, fields) {
  const keys = Object.keys(fields); if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const vals = keys.map((k) => (fields[k] !== null && typeof fields[k] === 'object' ? JSON.stringify(fields[k]) : fields[k]));
  await pool.query(`UPDATE adix_jobs SET ${sets}, updated_at = NOW() WHERE id = $1`, [id, ...vals]);
}
const ledgerUsd = (ledger) => (ledger || []).reduce((a, x) => a + (Number(x.usd) || 0), 0);

export function publicJob(j) {
  if (!j) return null;
  const ledger = Array.isArray(j.ledger) ? j.ledger : [];
  return {
    id: j.id, status: j.status, stage: j.stage, progress: j.progress, input: { idea: j.input?.idea, aspect: j.input?.aspect, photos: j.input?.photos || [], length: j.input?.length, model: j.input?.model },
    plan: j.plan ? { product: j.plan.product, concept: j.plan.concept, model: j.plan.model, modelLabel: ADIX_VIDEO_MODELS[j.plan.model]?.label, tier: j.plan.tier, aspect: j.plan.aspect, seconds: j.plan.seconds, shots: (j.plan.shots || []).map((s) => ({ seconds: s.seconds, summary: s.summary, camera: s.camera || {}, lighting: s.lighting || '', beats: s.beats || [] })), dialogue: j.plan.dialogue, audio: j.plan.audio || null, format: j.plan.format || null, reason: j.plan.reason, quoteBreakdown: j.plan.quoteBreakdown, alternatives: j.plan.alternatives } : null,
    quote: j.quote, reserved: j.reserved, spent: j.spent, videoUrl: j.video_url, thumbnailUrl: j.thumb_url, error: j.error,
    ledger: ledger.map((x) => ({ step: x.step, credits: toCredits(x.usd), usd: +Number(x.usd || 0).toFixed(4) })),
    review: j.state?.reviewNote || null, finalNote: j.state?.finalNote || null, decisions: j.state?.decisions || [], createdAt: j.created_at,
  };
}
export async function getAdixJob(id, userId) {
  await ready;
  const { rows: [j] } = await pool.query('SELECT * FROM adix_jobs WHERE id = $1', [Number(id)]);
  if (!j || (userId && j.user_id !== userId)) return null;
  return publicJob(j);
}
export async function listAdixJobs(userId, limit = 30) {
  await ready;
  const { rows } = await pool.query('SELECT * FROM adix_jobs WHERE user_id = $1 ORDER BY id DESC LIMIT $2', [userId, limit]);
  return rows.map(publicJob);
}

// ── 1) التخطيط ──
const AUDIO_SPEECH = ['none', 'voiceover', 'on_screen'];
const AUDIO_TEXT = ['none', 'minimal', 'key'];
const DIALECTS = { egypt: 'Egyptian Arabic (مصري)', gulf: 'Saudi/Gulf Arabic (خليجي)', levant: 'Levantine Arabic (شامي)', msa: 'Modern Standard Arabic (فصحى بسيطة)', maghreb: 'simple Maghrebi-friendly Arabic', en: 'English' };

function modelCatalogText(aspect) {
  return Object.entries(ADIX_VIDEO_MODELS).map(([k, m]) => {
    const nm = NEW_VIDEO_MODELS[k]; const dur = nm?.allowedDurations ? `durations ${nm.allowedDurations.join('/')}s` : `${nm?.minDurationSec || 3}–${nm?.maxDurationSec || 10}s per shot`;
    const prices = m.tiers.map((t) => `${t} $${usdPerSec(k, t).toFixed(3)}/s`).join(', ');
    return `- "${k}" (${m.label}): ${dur}; ${prices}; ${m.refs ? `reference photos: up to ${m.refs}` : 'first-frame photo only'}; ${m.note}`;
  }).join('\n') + `\nAspect ratio requested: ${aspect}.`;
}

const PLAN_SYSTEM = `You are Adix — the creative director of a top advertising studio, working inside Erivion. A customer uploaded photos of their product and an idea. You look at the product photos (a numbered contact sheet: #1, #2, …), understand the product deeply, and design the strongest possible short video ad.
AD FORMATS — choose (or blend) the format that THIS product, THIS idea and THIS audience respond to best; nothing is fixed:
- fast-paced / hype: many 0.3–1.2s micro-shots, beat-synced cuts, speed ramps, whip pans, punch-ins, kinetic type — energy, sport, fashion drops, gadgets, youth.
- cinematic / luxury: few long elegant takes, slow motion, macro details, soft light and reflections, minimal or no words — perfume, jewellery, watches, premium cars, cosmetics.
- CGI / 3D product: impossible physics and hyper-real renders — the product assembles from parts, floats in a stylised world, liquids/particles orbit it, x-ray or exploded views of ingredients/tech — drinks, tech, skincare, food.
- UGC / creator-style: a real-looking person filming themselves on a phone (handheld, front camera, natural light, home/street), talking straight to camera, honest reaction, unboxing, "POV", testimonial, get-ready-with-me — beauty, fashion, food, apps, everyday products; native social look with bold captions.
- demo / problem-solution / before-after: shows the product working and the result — cleaning, tools, fitness, skincare.
- lifestyle / story: a mini story of people using it in their life — family, food, travel, home.
- food & appetite: macro sizzle, pours, steam, cheese pulls, crunchy sound design.
- ASMR / satisfying, stop-motion, unboxing, comparison, meme/trend formats — whenever they fit.
Match pacing, camera language, lighting, sound, editing rhythm and on-screen text to the chosen format. For fast-paced ads, write each generated shot as several quick in-shot cuts with timecodes (e.g. "0–0.8s: extreme macro of …, CUT TO 0.8–1.6s: …") so the editor has many micro-shots to re-sequence on the music beat later. For UGC describe the person (age, look, outfit, setting), the phone-camera framing, natural speech in the chosen dialect and authentic imperfections. For CGI describe the stylised render world, materials and the impossible motion.
Think like the best commercial directors: a scroll-stopping first 1.5 seconds, one clear selling idea, the product as the hero (perfectly recognisable — same shape, label, logo, colours), premium lighting, purposeful camera moves, and a confident ending on the product.
You must choose the best AI video model for THIS product and THIS idea (fidelity of the label/packaging, physics like liquids, people talking, length needed, budget). Respect each model's real limits. The customer pays the exact provider cost, so don't waste money: pick the cheaper model when it gives the same result, but never sacrifice what makes the ad work.
You DIRECT every shot like a director of photography: for each shot you decide the exact camera — movement and its path (dolly-in, push, pull-back, orbit/arc with degrees and direction, crane/jib up or down, tilt, pan, whip pan, tracking alongside, top-down, FPV/drone, handheld, locked-off), start and end framing (extreme close-up, macro, close-up, medium, wide, hero shot), lens (e.g. 24mm wide, 50mm, 85mm portrait, 100mm macro) and depth of field, camera angle and height, speed and its ramps (e.g. slow then whip, speed-ramp into slow motion), stabilisation, focus pulls (rack focus from X to Y), plus lighting (key/rim/back light, colour temperature, practicals, reflections on the product) and a beat-by-beat timeline inside the shot with timecodes. Nothing generic: every move must have a reason (reveal, emphasis, energy, luxury, appetite…).
Prompts for the video model must be in ENGLISH, concrete and visual (subject, action, camera, lighting, lens, mood, setting, pacing), must contain that camera direction and timeline, and must describe the product exactly as in the photos. If the model has native audio, describe sounds and write any spoken line in quotes in the customer's language/dialect and say who speaks (voice-over or on-screen person). Never invent claims the customer did not give (no fake prices, certifications or medical claims).
Shots: if the ad is longer than the model's max per shot, split into several shots that cut together naturally (each shot = one continuous take). For reference-capable models list the photo numbers to use as references; for first-frame models pick the ONE best photo as the opening frame (or null to generate from text — only if the photo doesn't fit the shot).
Reply with ONLY a JSON object.`;

function planPrompt(input, nPhotos) {
  const len = input.length === 'auto' ? 'choose the ideal length (usually 10–20s)' : `about ${input.length} seconds`;
  return `CUSTOMER IDEA: ${input.idea || '(no idea given — propose the best concept for this product)'}
${input.brand ? `BRAND NAME: ${input.brand}\n` : ''}${input.price ? `PRICE / OFFER (exactly as given): ${input.price}\n` : ''}${input.cta ? `CALL TO ACTION: ${input.cta}\n` : ''}LENGTH: ${len} (min ${ADIX_LIMITS.minSec}, max ${ADIX_LIMITS.maxSec}).
ASPECT: ${input.aspect}.
AUDIO & LANGUAGE — YOU decide: does this product's best ad need spoken words at all (a voice-over, or an on-screen person talking), or is it strongest as pure cinema (visuals + music + sound design) with only a few words on screen — or no text at all? Base it on the product, the audience and what grabs them. If there are words (spoken or on screen), choose the language/dialect the target audience responds to, using the language and dialect the customer wrote the idea in, the brand and the packaging as signals. The customer uses the site in: ${input.uiLang === 'ar' ? 'Arabic' : 'English'}.
PHOTOS: ${nPhotos} product photos in the attached contact sheet (#1..#${nPhotos}).
${input.model && input.model !== 'auto' ? `The customer CHOSE the video model "${input.model}" — use it (you still pick tier, shots and prompts).\n` : ''}
AVAILABLE VIDEO MODELS:
${modelCatalogText(input.aspect)}

Return JSON:
{
 "product": { "name": "...", "category": "...", "what_i_see": "precise visual description of the product from the photos (shape, colours, label text, materials)", "key_benefits": ["..."], "audience": "...", "accent_color": "#RRGGBB (brand colour taken from the product)" },
 "format": { "style": "fast_paced|cinematic|cgi|ugc|demo|lifestyle|food|asmr|stop_motion|unboxing|comparison|trend|other", "blend": ["optional second style"], "pacing": "slow|medium|fast|hyper", "why": "short, customer's language: why this format grabs this product's audience" },
 "concept": { "title": "short name of the idea", "hook": "what happens in the first 1.5s", "story": "the ad beat by beat", "look": "visual style", "music_mood": "one of ${MUSIC_MOODS.join('|')}" },
 "model": "model key", "tier": "resolution", "reason": "why this model + tier fits this product (1–2 sentences, customer-friendly, in the customer's language)",
 "alternatives": [ { "model": "key", "tier": "...", "why": "short, customer's language" } ],
 "shots": [ {
    "seconds": number,
    "summary": "one line in the customer's language",
    "camera": { "move": "exact movement + path (e.g. 'slow dolly-in then 40° orbit to the right')", "start_framing": "...", "end_framing": "...", "lens": "focal length + depth of field", "angle": "angle + height", "speed": "speed / ramps", "rig": "gimbal|dolly|crane|drone|handheld|locked-off|macro probe", "focus": "focus behaviour (rack focus …) or empty" },
    "lighting": "lighting setup for this shot",
    "beats": [ { "from": s, "to": s, "action": "what happens", "camera": "what the camera does in this beat" } ],
    "sound": "sound design for this shot (if the model makes audio)",
    "prompt": "the complete English prompt for the video model — includes the action, product description, camera direction, lighting and the timed beats",
    "reference_photos": [photo numbers], "first_frame_photo": number|null } ],
 "audio": { "speech": "${AUDIO_SPEECH.join('|')}", "onscreen_text": "${AUDIO_TEXT.join('|')}", "language": "one of ${Object.keys(DIALECTS).join('|')} (for any speech/text)", "why": "short, customer's language: why this audio/text approach grabs this audience" },
 "dialogue": "all spoken lines in order (in the chosen language) or empty",
 "end_card": { "brand": "...", "tagline": "short, customer's language", "cta": "short button text, customer's language", "price": "only if the customer gave it" },
 "hero_photo": photo number that shows the whole product most clearly (used for the end card cut-out)
}`;
}

const CAM_KEYS = ['move', 'start_framing', 'end_framing', 'lens', 'angle', 'speed', 'rig', 'focus'];
function cleanCamera(c) { const o = {}; if (c && typeof c === 'object') for (const k of CAM_KEYS) if (c[k]) o[k] = clip(c[k], 200); return o; }
/** البرومبت النهائي للموديل: نص Opus + الإخراج المنظم (كاميرا/إضاءة/توقيت) لو مش مكتوب جواه */
export function shotPrompt(s) {
  const c = s.camera || {}; const parts = [s.prompt];
  const cam = [c.move && `movement: ${c.move}`, (c.start_framing || c.end_framing) && `framing: ${c.start_framing || '?'} → ${c.end_framing || '?'}`, c.lens && `lens: ${c.lens}`, c.angle && `angle: ${c.angle}`, c.speed && `speed: ${c.speed}`, c.rig && `rig: ${c.rig}`, c.focus && `focus: ${c.focus}`].filter(Boolean);
  if (cam.length && !/camera:/i.test(s.prompt)) parts.push(`Camera — ${cam.join('; ')}.`);
  if (s.lighting && !s.prompt.includes(s.lighting.slice(0, 30))) parts.push(`Lighting — ${s.lighting}.`);
  if (s.beats?.length && !/\b\d+(\.\d+)?\s*[–-]\s*\d+(\.\d+)?\s*s/.test(s.prompt)) parts.push(`Timeline — ${s.beats.map((b) => `${b.from}–${b.to}s: ${b.action}${b.camera ? ` (camera: ${b.camera})` : ''}`).join(' | ')}.`);
  if (s.sound && !s.prompt.includes(s.sound.slice(0, 30))) parts.push(`Sound — ${s.sound}.`);
  return parts.join('\n').slice(0, 3800);
}

export function sanitizeAdixPlan(raw, input, nPhotos) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const forced = input.model && input.model !== 'auto' && ADIX_VIDEO_MODELS[input.model] ? input.model : null;
  const model = forced || (ADIX_VIDEO_MODELS[p.model] ? p.model : 'seedance_2_5');
  const M = ADIX_VIDEO_MODELS[model];
  const tier = M.tiers.includes(p.tier) ? p.tier : M.tiers[M.tiers.length - 1];
  const photoOk = (n) => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= nPhotos;
  const maxS = maxShotSec(model);
  let shots = (Array.isArray(p.shots) ? p.shots : []).slice(0, ADIX_LIMITS.maxShots).map((s) => ({
    seconds: fitShotSeconds(model, Math.min(num(s?.seconds, 6), maxS)),
    prompt: clip(s?.prompt, 2400),
    refs: M.refs ? (Array.isArray(s?.reference_photos) ? s.reference_photos : []).filter(photoOk).map(Number).slice(0, M.refs) : [],
    first: photoOk(s?.first_frame_photo) ? Number(s.first_frame_photo) : null,
    summary: clip(s?.summary, 160),
    camera: cleanCamera(s?.camera), lighting: clip(s?.lighting, 300), sound: clip(s?.sound, 300),
    beats: (Array.isArray(s?.beats) ? s.beats : []).slice(0, 8).map((b) => ({ from: clamp(num(b?.from, 0), 0, 60), to: clamp(num(b?.to, 0), 0, 60), action: clip(b?.action, 240), camera: clip(b?.camera, 200) })).filter((b) => b.action || b.camera),
  })).filter((s) => s.prompt.length > 10);
  if (!shots.length) throw new Error('plan_has_no_shots');
  // ماينفعش يعدّي الحد الأقصى للإعلان
  let total = 0; shots = shots.filter((s) => (total + s.seconds <= ADIX_LIMITS.maxSec + 2 ? (total += s.seconds, true) : false));
  if (M.refs && shots.every((s) => !s.refs.length)) shots.forEach((s) => { s.refs = Array.from({ length: Math.min(nPhotos, M.refs) }, (_, i) => i + 1); });
  if (!M.refs) shots.forEach((s, i) => { if (s.first == null && i === 0) s.first = 1; });
  const prod = p.product || {}; const con = p.concept || {}; const ec = p.end_card || {};
  return {
    model, tier, aspect: input.aspect, seconds: total,
    product: { name: clip(prod.name, 80), category: clip(prod.category, 60), whatISee: clip(prod.what_i_see, 900), benefits: (Array.isArray(prod.key_benefits) ? prod.key_benefits : []).map((x) => clip(x, 80)).slice(0, 6), audience: clip(prod.audience, 160), accent: hex(prod.accent_color) },
    format: { style: clip(p.format?.style, 30) || 'cinematic', blend: (Array.isArray(p.format?.blend) ? p.format.blend : []).map((x) => clip(x, 30)).slice(0, 2), pacing: ['slow', 'medium', 'fast', 'hyper'].includes(p.format?.pacing) ? p.format.pacing : 'medium', why: clip(p.format?.why, 300) },
    concept: { title: clip(con.title, 80), hook: clip(con.hook, 300), story: clip(con.story, 1200), look: clip(con.look, 300), music: MUSIC_MOODS.includes(con.music_mood) ? con.music_mood : 'upbeat' },
    reason: clip(p.reason, 400),
    alternatives: (Array.isArray(p.alternatives) ? p.alternatives : []).filter((a) => ADIX_VIDEO_MODELS[a?.model]).slice(0, 3).map((a) => ({ model: a.model, label: ADIX_VIDEO_MODELS[a.model].label, tier: ADIX_VIDEO_MODELS[a.model].tiers.includes(a.tier) ? a.tier : ADIX_VIDEO_MODELS[a.model].tiers[0], why: clip(a.why, 200) })),
    shots, dialogue: clip(p.dialogue, 1200),
    audio: { speech: AUDIO_SPEECH.includes(p.audio?.speech) ? p.audio.speech : (p.dialogue ? 'voiceover' : 'none'), text: AUDIO_TEXT.includes(p.audio?.onscreen_text) ? p.audio.onscreen_text : 'key', lang: DIALECTS[p.audio?.language] ? p.audio.language : (input.uiLang === 'en' ? 'en' : 'egypt'), why: clip(p.audio?.why, 300) },
    endCard: { brand: clip(ec.brand || input.brand || prod.name, 30), tagline: clip(ec.tagline, 60), cta: clip(ec.cta || input.cta, 28), price: clip(input.price ? (ec.price || input.price) : '', 24) },
    heroPhoto: photoOk(p.hero_photo) ? Number(p.hero_photo) : 1,
  };
}

/** عرض السعر بالتكلفة الحقيقية — بنود واضحة للعميل */
export function quoteAdix(plan) {
  const videoUsd = plan.shots.reduce((a, s) => a + s.seconds * usdPerSec(plan.model, plan.tier), 0);
  const insertsUsd = 2 * imageUsd(INSERT_IMAGE_MODEL) + 2 * (imageUsd(INSERT_IMAGE_MODEL) + 4 * usdPerSec(INSERT_VIDEO_MODEL, INSERT_VIDEO_TIER)); // سقف اللقطات الإضافية
  const reviewUsd = EST.review + EST.finalReview + EST.fixRound;
  const otherUsd = EST.asr + EST.cutout + EST.renderPerMin * Math.max(1, Math.ceil((plan.seconds + 4) / 60));
  const items = [
    { key: 'video', usd: videoUsd }, { key: 'review', usd: reviewUsd }, { key: 'inserts', usd: insertsUsd, max: true }, { key: 'render', usd: otherUsd },
  ].map((x) => ({ ...x, credits: toCredits(x.usd) }));
  return { items, totalUsd: items.reduce((a, x) => a + x.usd, 0), total: toCredits(items.reduce((a, x) => a + x.usd, 0)) };
}

/** إنشاء طلب + التخطيط في الخلفية. photos = روابط R2 للصور (≤10) */
export async function createAdixJob(userId, rawInput) {
  await ready;
  const input = {
    photos: (Array.isArray(rawInput.photos) ? rawInput.photos : []).filter((u) => /^https?:\/\//.test(u)).slice(0, ADIX_LIMITS.maxPhotos),
    idea: clip(rawInput.idea, 1500), aspect: DIM[rawInput.aspect] ? rawInput.aspect : '9:16',
    length: rawInput.length === 'auto' || !rawInput.length ? 'auto' : clamp(Math.round(num(rawInput.length, 15)), ADIX_LIMITS.minSec, ADIX_LIMITS.maxSec),
    uiLang: rawInput.uiLang === 'en' ? 'en' : 'ar', model: ADIX_VIDEO_MODELS[rawInput.model] ? rawInput.model : 'auto',
    brand: clip(rawInput.brand, 40), price: clip(rawInput.price, 30), cta: clip(rawInput.cta, 30),
  };
  if (!input.photos.length) throw new Error('no_photos');
  const safety = await checkContentSafety([input.idea, input.brand, input.cta].join('\n')).catch(() => ({ unsafe: false }));
  if (safety.unsafe) throw new Error('content_policy_violation');
  const bal = await getCreditsBalance(userId).catch(() => 0);
  if (bal < 8) { const e = new Error('quota_exceeded'); e.cost = 8; e.remaining = bal; throw e; }
  const { rows: [job] } = await pool.query(`INSERT INTO adix_jobs (user_id, input, status, stage, progress) VALUES ($1, $2, 'planning', 'analyze', 5) RETURNING id`, [userId, JSON.stringify(input)]);
  planJob(job.id).catch((e) => console.warn('[Adix] plan crashed:', e.message));
  return { jobId: job.id };
}

async function planJob(id) {
  const { rows: [job] } = await pool.query('SELECT * FROM adix_jobs WHERE id = $1', [id]);
  if (!job) return;
  const input = job.input;
  try {
    const bufs = await Promise.all(input.photos.map(fetchBuffer));
    const sheet = await buildSheet(bufs, bufs.map((_, i) => `#${i + 1}`), { cell: 480 });
    const sheetUrl = await uploadBufferToR2(sheet, `adix/${id}/photos_${Date.now()}.jpg`, 'image/jpeg');
    await save(id, { stage: 'concept', progress: 35, state: { sheetUrl } });
    const { json, usd } = await opusJson({ system: PLAN_SYSTEM, prompt: planPrompt(input, bufs.length), imageUrl: sheetUrl, maxTokens: 14000, effort: 'high' });
    // التخطيط اتعمل فعلاً — بيتخصم بتكلفته (حتى لو العميل ماوافقش على التنفيذ)
    const planCredits = toCredits(usd);
    await chargeCredits(job.user_id, planCredits).catch(() => null);
    const plan = sanitizeAdixPlan(json, input, bufs.length);
    const q = quoteAdix(plan); plan.quoteBreakdown = q.items.map((x) => ({ key: x.key, credits: x.credits, max: !!x.max }));
    await save(id, { status: 'awaiting', stage: 'awaiting', progress: 100, plan, quote: q.total, spent: planCredits, ledger: [{ step: 'plan', usd }], state: { sheetUrl } });
  } catch (e) {
    console.warn(`[Adix] #${id} planning failed:`, e.message);
    await save(id, { status: 'failed', stage: 'failed', error: String(e.message).slice(0, 300) }).catch(() => {});
  }
}

/** العميل وافق (ممكن يغيّر الموديل/الدقة من البدائل) → حجز التقدير وبدء التنفيذ */
export async function approveAdixJob(id, userId, { model = null, tier = null } = {}) {
  await ready;
  const { rows: [job] } = await pool.query('SELECT * FROM adix_jobs WHERE id = $1', [Number(id)]);
  if (!job || job.user_id !== userId) throw new Error('not_found');
  if (job.status !== 'awaiting') throw new Error('not_awaiting');
  const plan = job.plan;
  if (model && ADIX_VIDEO_MODELS[model] && model !== plan.model) {
    // تبديل الموديل: نفس اللقطات بحدود الموديل الجديد
    const M = ADIX_VIDEO_MODELS[model]; const maxS = maxShotSec(model); const nPhotos = job.input.photos.length;
    const shots = [];
    for (const s of plan.shots) {
      let left = s.seconds;
      while (left > 0.5 && shots.length < ADIX_LIMITS.maxShots) { const sec = fitShotSeconds(model, Math.min(left, maxS)); shots.push({ ...s, seconds: sec, refs: M.refs ? (s.refs.length ? s.refs : Array.from({ length: Math.min(nPhotos, M.refs) }, (_, i) => i + 1)) : [], first: M.refs ? s.first : (s.first ?? plan.heroPhoto) }); left -= sec; }
    }
    plan.model = model; plan.shots = shots; plan.seconds = shots.reduce((a, s) => a + s.seconds, 0);
    plan.tier = M.tiers.includes(tier) ? tier : M.tiers[M.tiers.length - 1];
  } else if (tier && ADIX_VIDEO_MODELS[plan.model].tiers.includes(tier)) plan.tier = tier;
  const q = quoteAdix(plan); plan.quoteBreakdown = q.items.map((x) => ({ key: x.key, credits: x.credits, max: !!x.max }));
  const charge = await chargeCredits(userId, q.total);
  if (!charge?.success) { const e = new Error('quota_exceeded'); e.cost = q.total; e.remaining = charge?.remaining; throw e; }
  await save(job.id, { status: 'running', stage: 'generate', progress: 3, plan, quote: q.total, reserved: q.total });
  runAdix(job.id).catch((e) => console.warn('[Adix] run crashed:', e.message));
  return { jobId: job.id, reserved: q.total, remaining: charge.remaining };
}

export async function cancelAdixJob(id, userId) {
  await ready;
  const { rowCount } = await pool.query(`UPDATE adix_jobs SET status = 'canceled', stage = 'canceled', updated_at = NOW() WHERE id = $1 AND user_id = $2 AND status IN ('awaiting','planning')`, [Number(id), userId]);
  return rowCount > 0;
}

// ── 3) مراجعة Opus للفيديو → خطة مونتاج ──
const PRESET_DOC = `QUICK PRESETS (optional shortcuts — use them only when a standard element is exactly right; for anything that defines the ad's look, design it yourself with "type":"design"). Each preset also accepts "accent":"#RRGGBB" and "sfx":

- headline: { text (≤7 words), highlight (one word of text to colour), position: top|center|bottom, size: s|m|xl } — big kinetic title, word by word.
- callout: { text (≤3 words), sub (≤5 words), x, y } — animated pointer line from the point (x,y = 0..1 of the frame, e.g. the cap, the label, a feature ON the product at that moment) to a label card. Only when that part is visible at that time.
- badge: { text (e.g. "-25%", "جديد", "NEW"), sub (≤3 words), position: top-right|top-left|bottom-right|bottom-left|mid-right|mid-left } — rotating starburst for offers/prices/newness.
- lowerThird: { text (brand/product name), sub (short detail) } — sleek bar with name.
- stat: { text (a number with unit, e.g. "500 مل", "24h", "0%"), sub (label), position: top|center|bottom } — number counts up.
- checklist: { items: [2–4 short benefits], position: top|center|bottom } — benefits ticked one by one.
- flash: { } (0.15–0.35s long) — light flash to punctuate a cut or a beat.
`;
const EDIT_RULES = `Design rules (your taste decides everything else): never cover the product's label or a face (look at where they are in the frames at that time); keep text inside the safe area; on-screen text follows the planned text strategy and language, brand spelled exactly; text must be readable on the footage behind it (contrast, shadow, plate); every element and every edit must have a reason ("why"); motion must feel timed to the action, the cuts and the voice — not random.
SFX names: ${SFX_TYPES.join(', ')}. Each element/insert/punch/end card may carry "sfx":[{"at":s (relative to its start),"type":name,"vol":0..1}] or false; omit for a sensible default.`;
const OVERLAY_DOC = `${DESIGN_DOC}

${PRESET_DOC}
${EDIT_RULES}`;

const REVIEW_SYSTEM = `You are Adix's senior editor, colourist, sound designer and motion designer in one — there are NO templates here: you decide what this specific ad needs, why, and exactly how it looks, moves and sounds. You get the generated ad as a sheet of frames with timestamps (t=…s), the exact spoken words with timings, and the creative plan.
First study it frame by frame like a picky creative director: Is the product clearly visible and correct (same label/shape/colours)? Where does the energy drop? Which moments need a message on screen, a pointer to a feature, a number, an offer, a benefit, a brand moment — and which moments must stay clean? Is anything broken (warped product, glitch, wrong text, frozen frame) that must be cut or covered? Would an extra shot (macro detail, lifestyle moment, texture, ingredient) make it stronger, and with what camera move? What colour grade, transitions, sound design and music level fit this brand?
Then design and write a precise EDIT DECISION LIST. Your motion design must match the product's world (luxury ≠ sport ≠ food ≠ tech): choose fonts, colours (from the product/brand), shapes, layout, timing curves, entrances/exits and effects yourself, and compose elements from layers. Times are in seconds of the base video (0 … duration). Premium and intentional — every element earns its place. Reply with ONLY JSON.`;

function reviewPrompt(job, info) {
  const fmt = job.plan.format;
  const p = job.plan; const words = info.words.map((w) => `${w.start.toFixed(2)}-${w.end.toFixed(2)} ${w.w}`).join('\n');
  return `PRODUCT: ${p.product.name} — ${p.product.whatISee}
BENEFITS: ${p.product.benefits.join(' | ')}
FORMAT: ${fmt ? `${fmt.style}${fmt.blend?.length ? ` + ${fmt.blend.join(' + ')}` : ''}, pacing ${fmt.pacing}` : 'n/a'} — edit with the rhythm, camera language and text style of this format.
CONCEPT: ${p.concept.title}. Hook: ${p.concept.hook}. Story: ${p.concept.story}
CUSTOMER IDEA: ${job.input.idea}
${job.input.price ? `PRICE/OFFER (exact): ${job.input.price}\n` : ''}BRAND: ${p.endCard.brand}. CTA: ${p.endCard.cta}
AUDIO/TEXT STRATEGY (decided in planning — keep it unless the footage proves otherwise): speech=${p.audio?.speech || 'auto'}, on-screen text=${p.audio?.text || 'key'} (none = no words on screen except the end card; minimal = 1–2 short words at most), language: ${DIALECTS[p.audio?.lang] || DIALECTS.egypt}.
BASE VIDEO: ${info.duration.toFixed(2)}s, aspect ${p.aspect}. Has speech: ${info.words.length ? 'yes' : 'no'}.
SPOKEN WORDS (start-end word):
${words || '(no speech)'}

${OVERLAY_DOC}

EXTRA SHOTS ("inserts"): up to ${ADIX_LIMITS.maxInserts}. Each replaces the PICTURE for its time range (the original sound keeps playing). kind "image" = a still generated from the product photos, animated with YOUR camera move: "motion": ${MOTIONS.join('|')}, "zoom" 1.0–1.6 (how far), "focusX"/"focusY" 0..1 (what the move centres on), "ease": linear|out|inOut. kind "video" = a short generated clip (more expensive) — put the full camera direction (movement, lens, framing, speed) inside its prompt. Prompts in English, product described exactly. Inserts last 0.8–4s. "transitionIn"/"transitionOut": ${TRANSITIONS.join('|')}. Only when they really improve the ad.
CUTS: remove broken/boring ranges (keep the flow; never cut inside a spoken word).
PUNCHES: {start,end,zoom 1.04–1.8,x,y focus 0..1,"style": snap (instant punch-in) | push (zoom grows over the range) | shake (impact shake)} on beats.
GRADE: {"contrast" 0.7–1.5,"saturation" 0–2,"brightness" -0.15–0.15,"warmth" -1 (cool) … 1 (warm),"vignette" 0–1,"grain" 0–1,"sharpen" 0–1} — or omit to keep the original look.
CAPTIONS: "captions": true|false, "captionStyle": {"font": ${Object.keys(FONT_CHOICES).join('|')},"size" 0.035–0.12,"y" 0..1,"color","highlight","style": box|color|none,"maxWords" 1–7}.
END CARD: design it yourself: "end_card": {"seconds" 1.5–6,"background": blur|freeze|darken|color,"bgColor","transition": ${TRANSITIONS.join('|')},"sfx":[…],"layers":[ design layers — use {"shape":"image","src":"product"} for the product cut-out ], plus "brand","tagline","cta","price" as plain text for reference}.
RE-EDIT (fast-paced and rhythm edits): "sequence": [{"start","end" (base-video seconds),"speed" 0.25–4 (0.5 = slow motion, 2 = speed-up),"audio": keep|mute}, …] rebuilds the ad from pieces of the base video in ANY order (pieces may repeat) — use it to cut micro-shots on the music beat, build speed ramps, open with the strongest moment, etc. When you use "sequence", it REPLACES "cuts", and ALL other times (overlays, inserts, punches) are in the NEW timeline of the re-edited ad (0 … sum of piece lengths ÷ speed). Keep speech pieces at speed 1 with audio keep; mute pieces whose sound would be chopped.
MUSIC: pick a track from the library (or false for none): "music": {"track": "exact track name", "from": seconds into the track to start, "volume": 0–1 (0.15–0.3 under speech, 0.6–0.9 for music-driven ads)}. Each track has its BPM and first beat: beats in the ad = firstBeat + k×(60/BPM) − from (for every k where that is ≥ 0). Cut, punch, flash and animate ON those beats when the format is rhythmic.
MUSIC LIBRARY:
${(info.music || []).map((t) => `- "${t.name}" — ${t.tags.join(', ')} — ${t.bpm} BPM, first beat ${t.firstBeat}s`).join('\n')}

Return JSON:
{
 "assessment": "2–4 sentences: what works, what you fixed (customer's language)",
 "cuts": [{"start","end","why"}],
 "inserts": [{"id":"i1","kind":"image|video","prompt":"...","start","end","motion","zoom","focusX","focusY","ease","transitionIn","transitionOut","sfx","why"}],
 "punches": [{"start","end","zoom","x","y","style","sfx","why"}],
 "overlays": [ {"type":"design", …} or a preset — each with "why" ],
 "grade": {…},
 "captions": true|false, "captionStyle": {…},
 "end_card": {…},
 "accent": "#RRGGBB",
 "sequence": [ … ] (optional),
 "music": {"track","from","volume"} or false
}`;
}

const FINAL_SYSTEM = `You are Adix's final quality check before the customer sees their ad — and still its designer. You get the finished ad as frames with timestamps, the edit list that produced it, and the product info. Check strictly: product correct and clearly visible; every on-screen text readable, correctly spelled (brand exact), in the right dialect, not covering the product or faces, not colliding with other elements; the design looks premium and fits the brand; timing feels right; the ending sells. If everything is good, approve. If anything can be clearly better, return a corrected FULL edit list (same JSON shape) — you may redesign, move, retime, add or remove motion elements, change the grade, transitions, punches, sound and the end card design, and drop inserts, but you cannot generate new shots. Reply with ONLY JSON: {"approve": true|false, "note": "1–3 sentences for the customer (their language)", "edl": {…only when approve is false…}}`;

// ── 2..5) التنفيذ ──
async function runAdix(id) {
  await ready;
  const { rows: [job] } = await pool.query('SELECT * FROM adix_jobs WHERE id = $1', [id]);
  if (!job || job.status !== 'running') return;
  const plan = job.plan; const input = job.input; const st = job.state || {}; const ledger = Array.isArray(job.ledger) ? job.ledger : [];
  st.shots = st.shots || plan.shots.map(() => ({})); st.inserts = st.inserts || {};
  const persist = (stage, progress, extra = {}) => save(id, { state: st, ledger, stage, progress: Math.min(99, Math.round(progress)), spent: toCredits(ledgerUsd(ledger)), ...extra });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `adix_${id}_`));
  const [W, H] = DIM[plan.aspect] || DIM['9:16'];
  const photo = (n) => input.photos[n - 1];
  try {
    // 2) الفيديو الأساسي
    let done = st.shots.filter((s) => s.url).length;
    for (let i = 0; i < plan.shots.length; i++) {
      if (st.shots[i].url) continue;
      const s = plan.shots[i];
      const refs = s.refs.map(photo).filter(Boolean);
      const url = await generateNewModelVideo({
        modelKey: plan.model, prompt: shotPrompt(s), aspectRatio: plan.aspect, durationSec: s.seconds, tier: plan.tier,
        ...(refs.length ? { referenceImageUrls: refs } : s.first ? { imageUrl: photo(s.first) } : {}),
      });
      st.shots[i].url = url; ledger.push({ step: `video_shot_${i + 1}`, usd: s.seconds * usdPerSec(plan.model, plan.tier) }); done++;
      await persist('generate', 5 + 35 * done / plan.shots.length);
    }
    const base = path.join(work, 'base.mp4');
    const shotFiles = [];
    for (let i = 0; i < st.shots.length; i++) shotFiles.push(await download(st.shots[i].url, path.join(work, `shot${i}.mp4`)));
    await concatShots(shotFiles, base, W, H);

    // 3) المراجعة الأولى
    let edlRaw = job.edl;
    let words = st.words || null;
    if (!words) {
      words = [];
      // إعلان سينمائي من غير كلام (قرار Opus) → مفيش داعي لتفريغ الصوت
      if (plan.audio?.speech !== 'none' && await hasAudio(base).catch(() => false)) {
        const wav = path.join(work, 'a.wav');
        await ffmpeg(['-i', base, '-vn', '-ac', '1', '-ar', '16000', wav]);
        const lang = plan.audio?.lang === 'en' ? 'en' : 'ar';
        words = (await transcribeWords(wav, { language: lang }).catch(() => ({ words: [] }))).words || [];
        ledger.push({ step: 'transcribe', usd: EST.asr });
      }
      st.words = words.map((w) => ({ w: w.w, start: +w.start.toFixed(2), end: +w.end.toFixed(2) }));
      await persist('review', 45);
    }
    if (!edlRaw) {
      const fr = await framesSheet(base, work);
      const sheetUrl = await uploadBufferToR2(fr.sheet, `adix/${id}/review_${Date.now()}.jpg`, 'image/jpeg');
      const { json, usd } = await opusJson({ system: REVIEW_SYSTEM, prompt: reviewPrompt({ ...job, plan }, { duration: fr.duration, words: st.words, music: await musicLibrary().catch(() => []) }), imageUrl: sheetUrl, maxTokens: 30000, effort: 'high' });
      ledger.push({ step: 'review', usd }); edlRaw = json; st.reviewNote = clip(json.assessment, 600);
      // قرارات Opus (إيه اتعمل وليه) — بتظهر للعميل مع الإعلان
      const dec = (kind, x) => (x?.why ? { kind, at: +num(x.start, 0).toFixed(1), why: clip(x.why, 220) } : null);
      st.decisions = [...(json.cuts || []).map((x) => dec('cut', x)), ...(json.inserts || []).map((x) => dec('insert', x)), ...(json.punches || []).map((x) => dec('punch', x)), ...(json.overlays || []).map((x) => dec('motion', x))].filter(Boolean).sort((a, b) => a.at - b.at).slice(0, 24);
      await persist('review', 52, { edl: edlRaw });
    }

    // 4) اللقطات الإضافية (في حدود السقف المحجوز)
    const insertCap = quoteAdix(plan).items.find((x) => x.key === 'inserts').usd;
    let insertUsd = ledger.filter((x) => x.step.startsWith('insert')).reduce((a, x) => a + x.usd, 0);
    const wanted = (Array.isArray(edlRaw.inserts) ? edlRaw.inserts : []).slice(0, ADIX_LIMITS.maxInserts);
    const refs = [plan.heroPhoto, ...plan.shots.flatMap((s) => s.refs)].filter((n, i, a) => n && a.indexOf(n) === i).slice(0, 4).map(photo).filter(Boolean);
    for (const [k, ins] of wanted.entries()) {
      const key = String(ins.id || `i${k + 1}`); ins.id = key;
      if (st.inserts[key]) continue;
      const len = clamp(num(ins.end, 0) - num(ins.start, 0), 0.8, 4);
      const isVideo = ins.kind === 'video';
      const cost = imageUsd(INSERT_IMAGE_MODEL) + (isVideo ? fitShotSeconds(INSERT_VIDEO_MODEL, Math.ceil(len)) * usdPerSec(INSERT_VIDEO_MODEL, INSERT_VIDEO_TIER) : 0);
      if (insertUsd + cost > insertCap + 1e-6) continue;
      try {
        const prompt = `${clip(ins.prompt, 1500)}. The product must look exactly like in the reference photos (same shape, label, logo and colours). ${plan.concept.look}. Premium commercial photography, no added text.`;
        const img = await generateNewModelImages({ modelKey: INSERT_IMAGE_MODEL, prompt, referenceImageUrls: refs, aspectRatio: plan.aspect, count: 1 });
        const imgUrl = Array.isArray(img) ? (typeof img[0] === 'string' ? img[0] : img[0]?.url) : null;
        if (!imgUrl) continue;
        ledger.push({ step: `insert_image_${key}`, usd: imageUsd(INSERT_IMAGE_MODEL) }); insertUsd += imageUsd(INSERT_IMAGE_MODEL);
        let url = imgUrl;
        if (isVideo) {
          const sec = fitShotSeconds(INSERT_VIDEO_MODEL, Math.ceil(len));
          url = await generateNewModelVideo({ modelKey: INSERT_VIDEO_MODEL, prompt: `${clip(ins.prompt, 2400)}. The product stays exactly the same as in the first frame.`, imageUrl: imgUrl, aspectRatio: plan.aspect, durationSec: sec, tier: INSERT_VIDEO_TIER });
          ledger.push({ step: `insert_video_${key}`, usd: sec * usdPerSec(INSERT_VIDEO_MODEL, INSERT_VIDEO_TIER) }); insertUsd += sec * usdPerSec(INSERT_VIDEO_MODEL, INSERT_VIDEO_TIER);
        }
        st.inserts[key] = url;
      } catch (e) { console.warn(`[Adix] #${id} insert ${key} failed:`, e.message); }
      await persist('inserts', 55 + 15 * (k + 1) / wanted.length);
    }
    const insertFiles = {};
    for (const [key, url] of Object.entries(st.inserts)) insertFiles[key] = await download(url, path.join(work, `ins_${key}${/\.(png|jpe?g|webp)(\?|$)/i.test(url) ? '.jpg' : '.mp4'}`));

    // 5) المونتاج
    const accent = hex(edlRaw.accent, plan.product.accent);
    const baseDur = await probeDuration(base);
    const toEdl = (raw) => sanitizeEdl({ ...raw, endCard: { ...plan.endCard, ...(raw.end_card || raw.endCard || {}), ...(input.price ? { price: input.price } : {}) } }, { duration: baseDur, insertFiles });
    let edl = toEdl(edlRaw);
    let productPng = null;
    try {
      const hp = await download(photo(plan.heroPhoto) || input.photos[0], path.join(work, 'hero.jpg'));
      const cut = await toCutout(hp, { allowModel: true }); ledger.push({ step: 'cutout', usd: EST.cutout });
      if (cut?.uriCut) { productPng = path.join(work, 'hero.png'); fs.writeFileSync(productPng, Buffer.from(cut.uriCut.split(',')[1], 'base64')); }
    } catch (e) { console.warn(`[Adix] #${id} cutout failed:`, e.message); }
    let musicFile = null; let musicFrom = 0;
    // التراك اللي Opus اختاره بالاسم (عشان البيتس اللي حسب عليها القطعات تبقى نفسها) — أو بالمود كبديل
    const mPick = edlRaw.music && typeof edlRaw.music === 'object' ? edlRaw.music : null;
    if (mPick?.track) {
      const lib = await musicLibrary().catch(() => []);
      const tr = lib.find((t) => t.name.toLowerCase() === String(mPick.track).toLowerCase().replace(/\.mp3$/, '')) || lib.find((t) => t.name.toLowerCase().includes(String(mPick.track).toLowerCase().slice(0, 12)));
      if (tr) { musicFile = musicPath(tr.file); musicFrom = Math.max(0, Math.min(120, Number(mPick.from) || 0)); if (Number.isFinite(Number(mPick.volume))) edl.musicVolume = Math.max(0, Math.min(1, Number(mPick.volume))); }
    }
    const musicMood = musicFile || edlRaw.music === false ? null : (MUSIC_MOODS.includes(edlRaw.music) ? edlRaw.music : plan.concept.music);
    if (musicMood) {
      const buf = await getBackgroundMusicBuffer('youtube', musicMood).catch(() => null);
      if (buf) { musicFile = path.join(work, 'music.mp3'); fs.writeFileSync(musicFile, buf); }
    }
    const compose = async (e, tag) => composeAd({ baseVideo: base, workDir: path.join(work, `cmp_${tag}`), edl: e, W, H, accent, words: st.words || [], productPng, musicFile, musicFrom, onStage: (s) => persist('compose', s === 'mix' ? 82 : 74).catch(() => {}) });
    await persist('compose', 72);
    let out = await compose(edl, 'a');
    ledger.push({ step: 'render', usd: EST.renderPerMin * Math.max(1, Math.ceil(out.duration / 60)) });

    // 6) المراجعة النهائية + جولة تصليح واحدة
    if (!st.finalChecked) {
      await persist('final_review', 86);
      const fr = await framesSheet(out.file, work, { maxFrames: 18 });
      const url = await uploadBufferToR2(fr.sheet, `adix/${id}/final_${Date.now()}.jpg`, 'image/jpeg');
      const prompt = `PRODUCT: ${plan.product.name} — ${plan.product.whatISee}\nBRAND (exact spelling): ${plan.endCard.brand}\nON-SCREEN LANGUAGE: ${DIALECTS[plan.audio?.lang] || DIALECTS.egypt}; text strategy: ${plan.audio?.text || 'key'}\nFINAL AD: ${out.duration.toFixed(2)}s (the last ${(out.duration - out.cutDuration).toFixed(1)}s are the end card). ${edlRaw.sequence?.length ? 'The edit list re-sequences the base video ("sequence" = base times); every other time in it is on the FINAL timeline, same as the frames.' : 'The edit list below uses BASE-video times (before cuts); the frames show FINAL times.'}\nEDIT LIST:\n${JSON.stringify({ ...edlRaw, inserts: (edlRaw.inserts || []).filter((x) => st.inserts[x.id]) }).slice(0, 40000)}\n\n${OVERLAY_DOC}`;
      try {
        const { json, usd } = await opusJson({ system: FINAL_SYSTEM, prompt, imageUrl: url, maxTokens: 30000, effort: 'high' });
        ledger.push({ step: 'final_review', usd }); st.finalNote = clip(json.note, 600); st.finalChecked = true;
        if (json.approve === false && json.edl && typeof json.edl === 'object') {
          await persist('fix', 90);
          const fixed = toEdl({ ...json.edl, inserts: (json.edl.inserts || edlRaw.inserts || []).filter((x) => st.inserts[x?.id]) });
          if (!Number.isFinite(fixed.musicVolume)) fixed.musicVolume = edl.musicVolume;
          const out2 = await compose(fixed, 'b').catch((e) => { console.warn(`[Adix] #${id} fix round failed:`, e.message); return null; });
          if (out2) { out = out2; edl = fixed; ledger.push({ step: 'render_fix', usd: EST.renderPerMin }); }
        }
      } catch (e) { console.warn(`[Adix] #${id} final review failed:`, e.message); st.finalChecked = true; }
    }

    // 7) رفع + حساب نهائي بالتكلفة
    await persist('upload', 96);
    const videoUrl = await uploadBufferToR2(fs.readFileSync(out.file), `adix/${id}/ad_${Date.now()}.mp4`, 'video/mp4');
    const thumb = path.join(work, 'thumb.jpg');
    await ffmpeg(['-ss', Math.min(1.2, out.duration / 3).toFixed(2), '-i', out.file, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', thumb]).catch(() => {});
    const thumbUrl = fs.existsSync(thumb) ? await uploadBufferToR2(fs.readFileSync(thumb), `adix/${id}/thumb_${Date.now()}.jpg`, 'image/jpeg').catch(() => null) : null;
    await settle(job, ledger, { status: 'done', stage: 'done', progress: 100, video_url: videoUrl, thumb_url: thumbUrl, state: st, edl });
    console.log(`[Adix] #${id} done — ${plan.model} ${plan.tier}, ${out.duration.toFixed(1)}s, cost $${ledgerUsd(ledger).toFixed(3)}`);
  } catch (e) {
    console.warn(`[Adix] #${id} failed:`, e.message);
    await settle(job, ledger, { status: 'failed', stage: 'failed', error: String(e.message).slice(0, 300), state: st }).catch(() => {});
  } finally { rmQuiet(work); }
}

// الحساب النهائي: المصروف الفعلي (شامل التخطيط اللي اتخصم قبل كده) — والباقي من الحجز بيرجع
async function settle(job, ledger, fields) {
  const total = toCredits(ledgerUsd(ledger));
  const planCredits = toCredits(ledgerUsd(ledger.filter((x) => x.step === 'plan')));
  const usedFromReserve = Math.max(0, total - planCredits);
  const refund = Math.max(0, (job.reserved || 0) - usedFromReserve);
  if (refund > 0) await addCreditsBalance(job.user_id, refund).catch(() => {});
  await save(job.id, { ...fields, ledger, spent: planCredits + Math.min(usedFromReserve, job.reserved || 0) });
}

async function concatShots(files, out, W, H) {
  const withA = await Promise.all(files.map((f) => hasAudio(f).catch(() => false)));
  const ins = files.flatMap((f) => ['-i', f]); const g = [];
  const durs = await Promise.all(files.map(probeDuration));
  files.forEach((_, i) => {
    g.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p[v${i}]`);
    g.push(withA[i] ? `[${i}:a]aresample=44100,aformat=channel_layouts=stereo[a${i}]` : `anullsrc=r=44100:cl=stereo,atrim=0:${durs[i].toFixed(3)}[a${i}]`);
  });
  g.push(`${files.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${files.length}:v=1:a=1[v][a]`);
  await ffmpeg([...ins, '-filter_complex', g.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', out], { timeoutMs: 10 * 60 * 1000 });
  return out;
}

/** بعد restart: كمّل أي إعلان كان شغال (والتخطيط اللي اتقطع يتعاد) */
export async function resumeAdixJobs() {
  musicLibrary().catch(() => {}); // تحليل إيقاع مكتبة الموسيقى مرة واحدة في الخلفية
  if (!process.env.DATABASE_URL) return;
  await ready;
  const { rows } = await pool.query(`SELECT id, status FROM adix_jobs WHERE status IN ('running','planning') AND updated_at > NOW() - INTERVAL '1 day' ORDER BY id`).catch(() => ({ rows: [] }));
  for (const r of rows) (r.status === 'planning' ? planJob(r.id) : runAdix(r.id)).catch((e) => console.warn('[Adix] resume failed:', e.message));
  if (rows.length) console.log(`[Adix] resumed ${rows.length} job(s)`);
}
