// ── changelogRoutes.js ────────────────────────────────────────────────────────
// صفحة "إيه الجديد" (changelog/roadmap) — قايمة عامة بتحديثات الموقع، كل تحديث بعنوان/وصف
// ثنائي اللغة (زي نمط FAQPage.jsx) وتاج بيوصف نوعه (جديد/تحسين/إصلاح/قريبًا)، مرتبة بالتاريخ.
// الهدف: يوري للعميل (خصوصًا القديم) إننا بنطور المنتج فعليًا وبشكل مستمر — طلب مباشر من العميل.
import express from 'express';
import pkg from 'pg';
import { adminAuth } from './adminAuthMiddleware.js';

const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS changelog_entries (
    id SERIAL PRIMARY KEY,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    tag TEXT NOT NULL DEFAULT 'new',
    title_ar TEXT NOT NULL,
    title_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    is_published INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Changelog] create table error:', e.message));

const VALID_TAGS = ['new', 'improved', 'fixed', 'coming_soon'];

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════

router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM changelog_entries ORDER BY entry_date DESC, sort_order ASC, id DESC`
    );
    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', adminAuth, async (req, res) => {
  try {
    const { entry_date, tag, title_ar, title_en, description_ar, description_en, is_published, sort_order } = req.body;
    if (!title_ar?.trim() || !title_en?.trim()) return res.status(400).json({ error: 'title_ar and title_en are required' });
    const finalTag = VALID_TAGS.includes(tag) ? tag : 'new';
    const { rows } = await pool.query(
      `INSERT INTO changelog_entries (entry_date, tag, title_ar, title_en, description_ar, description_en, is_published, sort_order)
       VALUES (COALESCE($1, CURRENT_DATE), $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [entry_date || null, finalTag, title_ar.trim(), title_en.trim(), description_ar || null, description_en || null,
        is_published === false ? 0 : 1, parseInt(sort_order, 10) || 0]
    );
    res.json({ entry: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { entry_date, tag, title_ar, title_en, description_ar, description_en, is_published, sort_order } = req.body;
    const finalTag = tag === undefined ? null : (VALID_TAGS.includes(tag) ? tag : 'new');
    const { rows } = await pool.query(
      `UPDATE changelog_entries SET
        entry_date = COALESCE($1, entry_date),
        tag = COALESCE($2, tag),
        title_ar = COALESCE($3, title_ar),
        title_en = COALESCE($4, title_en),
        description_ar = $5,
        description_en = $6,
        is_published = COALESCE($7, is_published),
        sort_order = COALESCE($8, sort_order)
       WHERE id = $9 RETURNING *`,
      [entry_date || null, finalTag, title_ar?.trim() || null, title_en?.trim() || null,
        description_ar ?? null, description_en ?? null,
        is_published === undefined ? null : (is_published ? 1 : 0),
        sort_order === undefined ? null : parseInt(sort_order, 10), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM changelog_entries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════

// قايمة الـchangelog العامة — متاحة للكل من غير تسجيل دخول، بس المنشور (is_published) بيظهر
router.get('/', async (req, res) => {
  try {
    const language = req.query.language === 'en' ? 'en' : 'ar';
    const { rows } = await pool.query(
      `SELECT id, entry_date, tag, title_ar, title_en, description_ar, description_en
       FROM changelog_entries WHERE is_published = 1 ORDER BY entry_date DESC, sort_order ASC, id DESC`
    );
    const entries = rows.map(r => ({
      id: r.id,
      date: r.entry_date,
      tag: r.tag,
      title: language === 'en' ? r.title_en : r.title_ar,
      description: language === 'en' ? r.description_en : r.description_ar,
    }));
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
