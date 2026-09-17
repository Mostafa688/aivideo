// ── coursesRoutes.js ──────────────────────────────────────────────────────────
// نظام الكورسات: كورسات مقفولة للمشتركين بس (plan != 'free')، ماعدا فيديو تعريفي واحد
// بيشرح الموقع نفسه ومتاح للكل من غير اشتراك. كل كورس ممكن يحتوي على أكتر من فيديو، وكل
// كورس/فيديو ممكن يكون ليه ملف مرفق. كل كورس بيتحط بلغة واحدة (ar/en)، ونفس الكورس بلغة
// تانية بيتضاف كصف منفصل مربوط بنفس group_key عشان الأدمن يقدر يضيف نسخة مترجمة لنفس
// الكورس (نفس نمط الـ_ar/_en المستخدم في FAQPage.jsx/CoursesPage.jsx، بس كصفوف DB هنا).
import express from 'express';
import pkg from 'pg';
import multer from 'multer';
import { adminAuth } from './adminAuthMiddleware.js';
import { authMiddleware } from './authRoutes.js';
import { getUserById } from './authService.js';

const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    group_key TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'ar',
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    intro_video_url TEXT,
    attachment_url TEXT,
    attachment_label TEXT,
    is_free INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Courses] create courses table error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS course_videos (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    video_url TEXT NOT NULL,
    attachment_url TEXT,
    attachment_label TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Courses] create course_videos table error:', e.message));

// فيديو واحد بس، بيشرح الموقع نفسه، مفتوح لأي حد من غير اشتراك — عمود واحد (id=1) دايمًا
pool.query(`
  CREATE TABLE IF NOT EXISTS site_intro_video (
    id INTEGER PRIMARY KEY DEFAULT 1,
    title_ar TEXT,
    title_en TEXT,
    description_ar TEXT,
    description_en TEXT,
    thumbnail_url TEXT,
    video_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT single_row CHECK (id = 1)
  )
`).catch(e => console.error('[Courses] create site_intro_video table error:', e.message));

// ── R2 upload (نفس نمط newVideoModelsService.js/newImageModelsService.js) ──────
const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function uploadCourseFileToR2(buffer, key, contentType) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `${R2_PUBLIC_URL}/${key}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB — كافي لفيديو كورس/ملف مرفق
});

// "مشترك" = عنده باقة مدفوعة فعلية (plan != 'free')، مش رصيد كريديت لحظي — نفس التعريف
// اللي اتفقنا عليه في تقييد صفحة الأدمن على تير Model 3/4/5 القديمة، هنا بس للكورسات
function isSubscriberPlan(plan) {
  return !!plan && plan !== 'free';
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES — لازم تتسجل قبل أي راوت فيه :id/:courseId عشان الترتيب في Express
// ══════════════════════════════════════════════════════════════════════════

router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT c.*, COUNT(v.id)::int AS video_count
      FROM courses c
      LEFT JOIN course_videos v ON v.course_id = c.id
      GROUP BY c.id
      ORDER BY c.group_key ASC, c.language ASC, c.sort_order ASC, c.id ASC
    `);
    res.json({ courses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', adminAuth, async (req, res) => {
  try {
    const { group_key, language, title, description, thumbnail_url, intro_video_url, attachment_url, attachment_label, is_free, sort_order } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    if (!language || !['ar', 'en'].includes(language)) return res.status(400).json({ error: 'language must be ar or en' });
    // مفيش group_key متبعت = كورس جديد كليًا، بننشئ group_key فريد بنفسنا. لو متبعت = ده معناه
    // الأدمن بيضيف نسخة مترجمة لكورس موجود، فبنربطها بنفس المجموعة
    const finalGroupKey = group_key?.trim() || `course_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const { rows } = await pool.query(
      `INSERT INTO courses (group_key, language, title, description, thumbnail_url, intro_video_url, attachment_url, attachment_label, is_free, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [finalGroupKey, language, title.trim(), description || null, thumbnail_url || null, intro_video_url || null, attachment_url || null, attachment_label || null, is_free ? 1 : 0, parseInt(sort_order, 10) || 0]
    );
    res.json({ course: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { title, description, thumbnail_url, intro_video_url, attachment_url, attachment_label, is_free, sort_order, language } = req.body;
    const { rows } = await pool.query(
      `UPDATE courses SET
        title = COALESCE($1, title),
        description = $2,
        thumbnail_url = $3,
        intro_video_url = $4,
        attachment_url = $5,
        attachment_label = $6,
        is_free = COALESCE($7, is_free),
        sort_order = COALESCE($8, sort_order),
        language = COALESCE($9, language)
       WHERE id = $10 RETURNING *`,
      [title?.trim() || null, description ?? null, thumbnail_url ?? null, intro_video_url ?? null, attachment_url ?? null, attachment_label ?? null,
        is_free === undefined ? null : (is_free ? 1 : 0), sort_order === undefined ? null : parseInt(sort_order, 10), language || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Course not found' });
    res.json({ course: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/:id/videos', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM course_videos WHERE course_id = $1 ORDER BY sort_order ASC, id ASC',
      [req.params.id]
    );
    res.json({ videos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/:id/videos', adminAuth, async (req, res) => {
  try {
    const { title, description, thumbnail_url, video_url, attachment_url, attachment_label, sort_order } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
    if (!video_url?.trim()) return res.status(400).json({ error: 'video_url is required' });
    const { rows } = await pool.query(
      `INSERT INTO course_videos (course_id, title, description, thumbnail_url, video_url, attachment_url, attachment_label, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.params.id, title.trim(), description || null, thumbnail_url || null, video_url.trim(), attachment_url || null, attachment_label || null, parseInt(sort_order, 10) || 0]
    );
    res.json({ video: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/videos/:videoId', adminAuth, async (req, res) => {
  try {
    const { title, description, thumbnail_url, video_url, attachment_url, attachment_label, sort_order } = req.body;
    const { rows } = await pool.query(
      `UPDATE course_videos SET
        title = COALESCE($1, title),
        description = $2,
        thumbnail_url = $3,
        video_url = COALESCE($4, video_url),
        attachment_url = $5,
        attachment_label = $6,
        sort_order = COALESCE($7, sort_order)
       WHERE id = $8 RETURNING *`,
      [title?.trim() || null, description ?? null, thumbnail_url ?? null, video_url?.trim() || null, attachment_url ?? null, attachment_label ?? null,
        sort_order === undefined ? null : parseInt(sort_order, 10), req.params.videoId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Video not found' });
    res.json({ video: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/videos/:videoId', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM course_videos WHERE id = $1', [req.params.videoId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// رفع عام لأي ملف كورس (فيديو/صورة مصغرة/ملف مرفق) — بيرجع رابط R2 دائم زي أبلود التمبليتس
router.post('/admin/upload', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!S3_ENDPOINT_URL || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
      return res.status(503).json({ error: 'R2 storage is not configured on the server' });
    }
    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
    const key = `courses/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadCourseFileToR2(req.file.buffer, key, req.file.mimetype || 'application/octet-stream');
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/admin/intro-video', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM site_intro_video WHERE id = 1');
    res.json({ intro: rows[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/intro-video', adminAuth, async (req, res) => {
  try {
    const { title_ar, title_en, description_ar, description_en, thumbnail_url, video_url } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO site_intro_video (id, title_ar, title_en, description_ar, description_en, thumbnail_url, video_url, updated_at)
       VALUES (1, $1,$2,$3,$4,$5,$6, NOW())
       ON CONFLICT (id) DO UPDATE SET
         title_ar = $1, title_en = $2, description_ar = $3, description_en = $4,
         thumbnail_url = $5, video_url = $6, updated_at = NOW()
       RETURNING *`,
      [title_ar || null, title_en || null, description_ar || null, description_en || null, thumbnail_url || null, video_url || null]
    );
    res.json({ intro: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════

// كتالوج الكورسات — متاح للكل من غير تسجيل دخول (عنوان/وصف/صورة مصغرة بس، من غير روابط
// فيديو حقيقية) عشان الزائر يقدر يشوف إيه المتاح قبل ما يشترك
router.get('/', async (req, res) => {
  try {
    const language = req.query.language === 'en' ? 'en' : 'ar';
    const { rows } = await pool.query(
      `SELECT c.id, c.group_key, c.title, c.description, c.thumbnail_url, c.is_free, COUNT(v.id)::int AS video_count
       FROM courses c LEFT JOIN course_videos v ON v.course_id = c.id
       WHERE c.language = $1
       GROUP BY c.id
       ORDER BY c.sort_order ASC, c.id ASC`,
      [language]
    );
    res.json({ courses: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// الفيديو التعريفي المجاني بتاع الموقع نفسه — مفتوح لأي حد من غير اشتراك
router.get('/intro-video', async (req, res) => {
  try {
    const language = req.query.language === 'en' ? 'en' : 'ar';
    const { rows } = await pool.query('SELECT * FROM site_intro_video WHERE id = 1');
    const row = rows[0];
    if (!row || !row.video_url) return res.json({ intro: null });
    res.json({
      intro: {
        title: language === 'en' ? row.title_en : row.title_ar,
        description: language === 'en' ? row.description_en : row.description_ar,
        thumbnail_url: row.thumbnail_url,
        video_url: row.video_url,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// تفاصيل كورس واحد + فيديوهاته — لازم تسجيل دخول عشان نعرف هل المستخدم مشترك ولا لأ.
// لو الكورس مش مجاني والمستخدم مش مشترك، بنرجّع البيانات الوصفية بس (عنوان/وصف/صورة مصغرة
// لكل فيديو) من غير روابط الفيديو/الملفات الحقيقية، مع locked:true عشان الفرونت إند يعرض
// شاشة "اشترك عشان تفتح الكورس ده" بدل الفيديو
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    const course = rows[0];
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const user = await getUserById(req.user.userId);
    const unlocked = !!course.is_free || isSubscriberPlan(user?.plan);

    const { rows: videos } = await pool.query(
      'SELECT * FROM course_videos WHERE course_id = $1 ORDER BY sort_order ASC, id ASC',
      [req.params.id]
    );

    if (!unlocked) {
      return res.json({
        course: { id: course.id, title: course.title, description: course.description, thumbnail_url: course.thumbnail_url, intro_video_url: course.intro_video_url, is_free: false },
        videos: videos.map(v => ({ id: v.id, title: v.title, description: v.description, thumbnail_url: v.thumbnail_url })),
        locked: true,
      });
    }

    res.json({ course, videos, locked: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
