// ── characterStudioRoutes.js ── "استوديو الشخصيات" (زي Elements/AI Influencer عند Higgsfield):
//  • شخصيات جاهزة (presets) بيضيفها الأدمن — العميل بيستخدمها مباشرة أو يحفظها في شخصياته
//  • قوالب ترند (trend templates): فيديو حركة/كلام جاهز + العميل يبدّل الشخصية بصورته/شخصيته (نقل أداء prunaai/p-video-animate)
//  • السعر بيتحسب من نفس جدول الأسعار (ثانية الفيديو × سعر الموديل) ويتخصم من /api/videos/generate الموجود
import express from 'express';
import pkg from 'pg';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import sharp from 'sharp';
import { adminAuth } from './adminAuthMiddleware.js';
import { authMiddleware } from './authRoutes.js';
import { uploadBufferToR2 } from './audioVideoService.js';
import { NEW_VIDEO_MODELS } from './newVideoModelsService.js';
import { getPerSecondCreditCost, getQualityTiers, getMaxClipSeconds } from './creditPricingEngine.js';
import { groqVision, toVisionDataUrl, locateFaceBox } from './visionService.js';

const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

export const DEFAULT_TEMPLATE_ENGINE = 'prunaai_p_video_animate';
// محركات القوالب: نقل الأداء (P-Video Animate: حركة وكلام الفيديو الأصلي بالظبط، تبديل شخصية واحدة، لحد 60ث) أو Seedance 2.5
// (بيعيد بناء الفيديو بالذكاء الاصطناعي من فيديو مرجعي + صورة الشخصية + برومبت — بيقدر يغيّر الشكل زي لون الشعر والعضلات، لحد 30ث وأغلى)
export const REFERENCE_TEMPLATE_ENGINE = 'seedance_2_5';
const isTemplateEngine = (e) => e === REFERENCE_TEMPLATE_ENGINE || !!NEW_VIDEO_MODELS[e]?.performanceTransfer;
const engineMaxSec = (e) => (e === REFERENCE_TEMPLATE_ENGINE ? (NEW_VIDEO_MODELS[e]?.refCaps?.videoMaxTotalSec || 30) : (getMaxClipSeconds(e) || 60));
const billSecFor = (engine, sec) => (engine === REFERENCE_TEMPLATE_ENGINE ? Math.min(30, Math.max(4, Math.ceil(sec))) : Math.max(1, Math.ceil(sec)));
export const PRESET_CATEGORIES = ['person', 'influencer', 'cartoon', 'animal', 'mascot', 'other'];
export const TEMPLATE_CATEGORIES = ['dance', 'comedy', 'cinematic', 'talking', 'product', 'viral', 'other'];

export async function initCharacterStudioTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS character_presets (
    id SERIAL PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL, description_ar TEXT, description_en TEXT,
    image_url TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'person', is_published INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS trend_templates (
    id SERIAL PRIMARY KEY, title_ar TEXT NOT NULL, title_en TEXT NOT NULL, description_ar TEXT, description_en TEXT,
    category TEXT NOT NULL DEFAULT 'viral', cover_url TEXT, preview_url TEXT, source_video_url TEXT NOT NULL, duration_sec NUMERIC NOT NULL DEFAULT 5,
    engine TEXT NOT NULL DEFAULT 'prunaai_p_video_animate', is_featured INTEGER DEFAULT 0, is_published INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
    uses_count INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query(`ALTER TABLE trend_templates ADD COLUMN IF NOT EXISTS prompt TEXT`);
  await pool.query(`ALTER TABLE trend_templates ADD COLUMN IF NOT EXISTS aspect TEXT`);
  await pool.query(`ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS hidden_refs JSONB DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE character_references ADD COLUMN IF NOT EXISTS hidden_refs JSONB DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE character_references ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE character_references ADD COLUMN IF NOT EXISTS kind TEXT`);
}
// الجدول بتاع شخصيات العميل بيتعمل في authService (بعد تشغيله)؛ نستنى شوية ونعيد المحاولة
(async () => { for (let i = 0; i < 6; i++) { try { await initCharacterStudioTables(); return; } catch (e) { if (i === 5) console.error('[CharacterStudio] init error:', e.message); await new Promise(r => setTimeout(r, 3000)); } } })();

const ffprobeDuration = (file) => new Promise((resolve) => execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], (e, out) => resolve(e ? 0 : parseFloat(String(out).trim()) || 0)));
const ffmpegFrame = (file, out, at) => new Promise((resolve, reject) => execFile('ffmpeg', ['-v', 'error', '-y', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', out], (e) => (e ? reject(e) : resolve())));

/** وصف مظهر الشخصية (وجه/شعر/بشرة...) من الصورة — بيتخزن ويتحط في وصف أي فيديو بالشخصية دي. أي فشل = من غير وصف. */
export async function describeCharacterImage(buffer) {
  const url = await toVisionDataUrl(`data:image/jpeg;base64,${buffer.toString('base64')}`, { max: 768 });
  const data = await groqVision({ max_tokens: 120, temperature: 0.2, messages: [{ role: 'user', content: [
    { type: 'text', text: 'Describe the PERMANENT physical appearance of the main person/character in this image in at most 35 words, English: apparent age range, face shape, hair (colour/length/style), skin tone, build, distinctive features (glasses, beard, freckles…). Do NOT describe clothing, background or pose. If it is an animal, cartoon or mascot, describe its species/design and colours instead. Output only the description.' },
    { type: 'image_url', image_url: { url } }] }] });
  return String(data.choices?.[0]?.message?.content || '').replace(/\s+/g, ' ').trim().slice(0, 300);
}


/**
 * صورة الوش (للعرض بس) من صورة شخصية بجسم كامل: بنحدد مكان الوش بـGemini، ولو مش متاح بنقدّره من التركيب
 * (البرومبت بيخلي الراس في أعلى الصورة). بترجّع JPEG مربع 768px. locate قابلة للحقن للاختبار.
 */
export async function makeFaceCrop(buffer, { locate = locateFaceBox } = {}) {
  const img = sharp(buffer, { failOn: 'none' }).rotate();
  const meta = await img.metadata();
  const W = meta.width, H = meta.height;
  if (!W || !H) throw new Error('bad image');
  let box = null;
  try { box = await locate(await toVisionDataUrl(`data:image/jpeg;base64,${(await sharp(buffer, { failOn: 'none' }).rotate().resize(768, 768, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer()).toString('base64')}`, { max: 768 })); } catch { /* تقدير ثابت */ }
  let cx, cy, side;
  if (box) {
    const [y0, x0, y1, x1] = box;
    cx = ((x0 + x1) / 2 / 1000) * W; cy = ((y0 + y1) / 2 / 1000) * H;
    side = Math.max(((x1 - x0) / 1000) * W, ((y1 - y0) / 1000) * H) * 1.9;
  } else {
    cx = W / 2; cy = H * 0.13; side = Math.min(W, H) * 0.42;
  }
  side = Math.round(Math.min(Math.max(side, Math.min(W, H) * 0.22), Math.min(W, H)));
  const left = Math.round(Math.min(Math.max(0, cx - side / 2), W - side));
  const top = Math.round(Math.min(Math.max(0, cy - side / 2), H - side));
  return sharp(buffer, { failOn: 'none' }).rotate().extract({ left, top, width: side, height: side }).resize(768, 768, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();
}

/** صورة شخصية متولّدة (جسم كامل) → { faceUrl (للعرض)، fullUrl (المرجع المخفي) } على R2 بتاعنا */
export async function splitGeneratedCharacter(fullUrl, { locate } = {}) {
  const res = await fetch(fullUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`could not read the generated image (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const face = await makeFaceCrop(buf, { locate });
  const faceUrl = await uploadBufferToR2(face, `characters/face_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`, 'image/jpeg');
  return { faceUrl, fullUrl };
}

// ── صورة "شيت زوايا" (كذا نسخة من الشخصية جنب بعض في صورة واحدة) مينفعش تتبعت كصورة وحيدة لموديل بياخد شخصية واحدة (P-Video Animate بيحرّك كل النسخ؛
//    وSeedance بيتلخبط في الاستبدال). بنكتشفها من النسبة (عريضة جدًا) ونرتّب الصور بحيث أول واحدة تبقى لشخص واحد.
const SHEET_ASPECT = 1.6;
const aspectCache = new Map();
async function imageAspect(url) {
  if (aspectCache.has(url)) return aspectCache.get(url);
  let a = null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (r.ok) { const m = await sharp(Buffer.from(await r.arrayBuffer()), { failOn: 'none' }).metadata(); if (m.width && m.height) a = m.width / m.height; }
  } catch { /* مش قادرين نقيس: نعتبرها صورة عادية */ }
  if (a != null) aspectCache.set(url, a);
  return a;
}
/** بيرجّع الصور بترتيب أول واحدة فيها شخص واحد (مش شيت). لو كلها شيتات، بنحط صورة الوش الأول كبديل. */
export async function orderSingleSubjectFirst(urls, faceUrl = null) {
  const list = (Array.isArray(urls) ? urls : []).filter(Boolean);
  const withA = await Promise.all(list.map(async u => [u, await imageAspect(u)]));
  const singles = withA.filter(([, a]) => a == null || a <= SHEET_ASPECT).map(([u]) => u);
  const sheets = withA.filter(([, a]) => a != null && a > SHEET_ASPECT).map(([u]) => u);
  if (!singles.length && faceUrl) singles.push(faceUrl);
  return [...singles, ...sheets];
}

const tiersFor = (engine) => { try { const t = getQualityTiers(engine); return Array.isArray(t) && t.length ? t : ['720p']; } catch { return ['720p']; } };
const costsFor = (engine, sec) => Object.fromEntries(tiersFor(engine).map(t => { try { return [t, getPerSecondCreditCost(engine, billSecFor(engine, sec), t, { videoIn: engine === REFERENCE_TEMPLATE_ENGINE })]; } catch { return [t, null]; } }));
const pub = (r, lang) => ({
  id: r.id, title: lang === 'en' ? r.title_en : r.title_ar, description: (lang === 'en' ? r.description_en : r.description_ar) || '',
  category: r.category, coverUrl: r.cover_url, previewUrl: r.preview_url || null, durationSec: Number(r.duration_sec), engine: r.engine, mode: r.engine === REFERENCE_TEMPLATE_ENGINE ? 'reference' : 'transfer',
  tiers: tiersFor(r.engine), costs: costsFor(r.engine, Number(r.duration_sec)), featured: !!r.is_featured, uses: r.uses_count || 0,
});

// ══════════ عام ══════════
router.get('/presets', async (req, res) => {
  try {
    const lang = req.query.language === 'en' ? 'en' : 'ar';
    const { rows } = await pool.query(`SELECT * FROM character_presets WHERE is_published = 1 ORDER BY sort_order ASC, id DESC`);
    res.json({ presets: rows.map(r => ({ id: r.id, name: lang === 'en' ? r.name_en : r.name_ar, description: (lang === 'en' ? r.description_en : r.description_ar) || '', imageUrl: r.image_url, category: r.category })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// صور الشخصية المخفية (كل الزوايا) — مش بتظهر للعميل في أي قايمة؛ بتتجاب وقت الاستخدام للتوليد بس (للمسجّلين)
router.get('/presets/:id/refs', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT image_url, hidden_refs FROM character_presets WHERE id = $1 AND is_published = 1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    const refs = await orderSingleSubjectFirst(refList(rows[0].hidden_refs), rows[0].image_url);
    res.json({ imageUrl: refs[0] || rows[0].image_url, refs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/templates', async (req, res) => {
  try {
    const lang = req.query.language === 'en' ? 'en' : 'ar';
    const { rows } = await pool.query(`SELECT * FROM trend_templates WHERE is_published = 1 ORDER BY is_featured DESC, sort_order ASC, id DESC`);
    res.json({ templates: rows.map(r => pub(r, lang)), categories: [...new Set(rows.map(r => r.category))] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// رابط الفيديو المصدر (الحركة والكلام) — للمسجّلين بس؛ الفرونت بيبعته لـ/api/videos/generate مع صورة الشخصية
router.get('/templates/:id/source', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM trend_templates WHERE id = $1 AND is_published = 1`, [req.params.id]);
    const r = rows[0];
    if (!r) return res.status(404).json({ error: 'not_found' });
    pool.query(`UPDATE trend_templates SET uses_count = uses_count + 1 WHERE id = $1`, [r.id]).catch(() => {});
    res.json({ sourceVideoUrl: r.source_video_url, model: r.engine, mode: r.engine === REFERENCE_TEMPLATE_ENGINE ? 'reference' : 'transfer', prompt: r.prompt || '', aspect: r.aspect || '9:16', durationSec: Number(r.duration_sec), tiers: tiersFor(r.engine), costs: costsFor(r.engine, Number(r.duration_sec)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════ أدمن ══════════
// رفع ملف (صورة شخصية/غلاف أو فيديو قالب). للفيديو: بيقيس المدة وبيطلّع غلاف تلقائي من إطار الفيديو
router.post('/admin/upload', adminAuth, upload.single('file'), async (req, res) => {
  let tmp = null;
  try {
    const f = req.file;
    if (!f?.buffer?.length) return res.status(400).json({ error: 'No file uploaded' });
    const isVideo = /^video\//.test(f.mimetype || '');
    const isImage = /^image\//.test(f.mimetype || '');
    if (!isVideo && !isImage) return res.status(400).json({ error: 'File must be an image or a video' });
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (isImage) {
      const buf = await sharp(f.buffer, { failOn: 'none' }).rotate().resize(1280, 1280, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      const meta = await sharp(buf).metadata();
      return res.json({ url: await uploadBufferToR2(buf, `character-studio/img_${stamp}.jpg`, 'image/jpeg'), aspect: meta.width && meta.height ? Math.round((meta.width / meta.height) * 100) / 100 : null, looksLikeSheet: !!(meta.width && meta.height && meta.width / meta.height > SHEET_ASPECT) });
    }
    tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cstudio-')), 'in.mp4');
    fs.writeFileSync(tmp, f.buffer);
    const durationSec = await ffprobeDuration(tmp);
    if (!durationSec) return res.status(400).json({ error: 'Could not read this video — use an MP4 file' });
    const maxSec = getMaxClipSeconds(DEFAULT_TEMPLATE_ENGINE) || 60;
    if (durationSec > maxSec + 0.5) return res.status(400).json({ error: `Video is ${Math.round(durationSec)}s — the limit for the template engine is ${maxSec}s` });
    let aspect = null;
    try { const dims = await new Promise((resolve) => execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', tmp], (e, out) => resolve(e ? '' : String(out).trim()))); const [w, h] = dims.split('x').map(Number); if (w && h) aspect = w >= h ? '16:9' : '9:16'; } catch { /* اختياري */ }
    const url = await uploadBufferToR2(f.buffer, `character-studio/vid_${stamp}.mp4`, 'video/mp4');
    let coverUrl = null;
    try { const jpg = tmp.replace('in.mp4', 'cover.jpg'); await ffmpegFrame(tmp, jpg, Math.min(1, durationSec / 3)); coverUrl = await uploadBufferToR2(fs.readFileSync(jpg), `character-studio/cover_${stamp}.jpg`, 'image/jpeg'); } catch (e) { console.warn('[CharacterStudio] cover failed:', e.message); }
    res.json({ url, durationSec: Math.round(durationSec * 10) / 10, coverUrl, aspect });
  } catch (e) { console.error('[CharacterStudio] upload failed:', e.message); res.status(500).json({ error: e.message }); }
  finally { if (tmp) fs.rm(path.dirname(tmp), { recursive: true, force: true }, () => {}); }
});

const text = (v, n = 300) => String(v ?? '').replace(/<[^>]*>/g, '').trim().slice(0, n);
const flag = (v) => (v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0);
const refList = (v) => (Array.isArray(v) ? v : []).map(u => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : null)).filter(Boolean).filter((u, i, a) => a.indexOf(u) === i).slice(0, 6);
const httpUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : null);

router.get('/admin/presets', adminAuth, async (req, res) => { try { res.json({ presets: (await pool.query(`SELECT * FROM character_presets ORDER BY sort_order ASC, id DESC`)).rows, categories: PRESET_CATEGORIES }); } catch (e) { res.status(500).json({ error: e.message }); } });
router.post('/admin/presets', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!text(b.name_ar) || !text(b.name_en)) return res.status(400).json({ error: 'name_ar and name_en are required' });
    if (!httpUrl(b.image_url)) return res.status(400).json({ error: 'image_url is required (upload an image first)' });
    const { rows } = await pool.query(`INSERT INTO character_presets (name_ar,name_en,description_ar,description_en,image_url,category,is_published,sort_order,hidden_refs) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING *`,
      [text(b.name_ar, 80), text(b.name_en, 80), text(b.description_ar, 400) || null, text(b.description_en, 400) || null, httpUrl(b.image_url), PRESET_CATEGORIES.includes(b.category) ? b.category : 'person', b.is_published === false || b.is_published === 0 ? 0 : 1, parseInt(b.sort_order, 10) || 0, JSON.stringify(refList(b.hidden_refs))]);
    res.json({ preset: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/admin/presets/:id', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(`UPDATE character_presets SET name_ar=COALESCE($2,name_ar), name_en=COALESCE($3,name_en), description_ar=COALESCE($4,description_ar), description_en=COALESCE($5,description_en), image_url=COALESCE($6,image_url), category=COALESCE($7,category), is_published=COALESCE($8,is_published), sort_order=COALESCE($9,sort_order), hidden_refs=COALESCE($10::jsonb,hidden_refs) WHERE id=$1 RETURNING *`,
      [req.params.id, b.name_ar !== undefined ? text(b.name_ar, 80) : null, b.name_en !== undefined ? text(b.name_en, 80) : null, b.description_ar !== undefined ? text(b.description_ar, 400) : null, b.description_en !== undefined ? text(b.description_en, 400) : null, httpUrl(b.image_url), PRESET_CATEGORIES.includes(b.category) ? b.category : null, b.is_published === undefined ? null : flag(b.is_published), b.sort_order === undefined ? null : parseInt(b.sort_order, 10) || 0, b.hidden_refs === undefined ? null : JSON.stringify(refList(b.hidden_refs))]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ preset: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/admin/presets/:id', adminAuth, async (req, res) => { try { await pool.query(`DELETE FROM character_presets WHERE id = $1`, [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

router.get('/admin/templates', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM trend_templates ORDER BY is_featured DESC, sort_order ASC, id DESC`);
    res.json({ templates: rows.map(r => ({ ...r, costs: costsFor(r.engine, Number(r.duration_sec)) })), categories: TEMPLATE_CATEGORIES, engines: [...Object.keys(NEW_VIDEO_MODELS).filter(k => NEW_VIDEO_MODELS[k].performanceTransfer), REFERENCE_TEMPLATE_ENGINE] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/admin/templates', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!text(b.title_ar) || !text(b.title_en)) return res.status(400).json({ error: 'title_ar and title_en are required' });
    if (!httpUrl(b.source_video_url)) return res.status(400).json({ error: 'source_video_url is required (upload the video first)' });
    const engine = isTemplateEngine(b.engine) ? b.engine : DEFAULT_TEMPLATE_ENGINE;
    const dur = Math.max(1, Math.min(engineMaxSec(engine), Number(b.duration_sec) || 5));
    const aspect = b.aspect === '16:9' || b.aspect === '9:16' ? b.aspect : null;
    if (Number(b.duration_sec) > engineMaxSec(engine) + 0.5) return res.status(400).json({ error: `This engine supports videos up to ${engineMaxSec(engine)} seconds — the source video is ${Math.round(Number(b.duration_sec))}s` });
    const { rows } = await pool.query(`INSERT INTO trend_templates (title_ar,title_en,description_ar,description_en,category,cover_url,preview_url,source_video_url,duration_sec,engine,is_featured,is_published,sort_order,prompt,aspect) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [text(b.title_ar, 100), text(b.title_en, 100), text(b.description_ar, 500) || null, text(b.description_en, 500) || null, text(b.category, 30) || 'viral', httpUrl(b.cover_url), httpUrl(b.preview_url), httpUrl(b.source_video_url), dur, engine, flag(b.is_featured), b.is_published === false || b.is_published === 0 ? 0 : 1, parseInt(b.sort_order, 10) || 0, text(b.prompt, 800) || null, aspect]);
    res.json({ template: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put('/admin/templates/:id', adminAuth, async (req, res) => {
  try {
    const b = req.body || {};
    const { rows } = await pool.query(`UPDATE trend_templates SET title_ar=COALESCE($2,title_ar), title_en=COALESCE($3,title_en), description_ar=COALESCE($4,description_ar), description_en=COALESCE($5,description_en), category=COALESCE($6,category), cover_url=COALESCE($7,cover_url), preview_url=COALESCE($8,preview_url), source_video_url=COALESCE($9,source_video_url), duration_sec=COALESCE($10,duration_sec), is_featured=COALESCE($11,is_featured), is_published=COALESCE($12,is_published), sort_order=COALESCE($13,sort_order), engine=COALESCE($14,engine), prompt=COALESCE($15,prompt), aspect=COALESCE($16,aspect) WHERE id=$1 RETURNING *`,
      [req.params.id, b.title_ar !== undefined ? text(b.title_ar, 100) : null, b.title_en !== undefined ? text(b.title_en, 100) : null, b.description_ar !== undefined ? text(b.description_ar, 500) : null, b.description_en !== undefined ? text(b.description_en, 500) : null, b.category ? text(b.category, 30) : null, httpUrl(b.cover_url), httpUrl(b.preview_url), httpUrl(b.source_video_url), b.duration_sec ? Math.max(1, Number(b.duration_sec)) : null, b.is_featured === undefined ? null : flag(b.is_featured), b.is_published === undefined ? null : flag(b.is_published), b.sort_order === undefined ? null : parseInt(b.sort_order, 10) || 0, isTemplateEngine(b.engine) ? b.engine : null, b.prompt !== undefined ? text(b.prompt, 800) : null, b.aspect === '16:9' || b.aspect === '9:16' ? b.aspect : null]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ template: rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/admin/templates/:id', adminAuth, async (req, res) => { try { await pool.query(`DELETE FROM trend_templates WHERE id = $1`, [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

export { refList };
export async function getPresetById(id) { const { rows } = await pool.query(`SELECT * FROM character_presets WHERE id = $1 AND is_published = 1`, [id]); return rows[0] || null; }
export default router;
