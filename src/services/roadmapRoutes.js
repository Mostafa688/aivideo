// ── roadmapRoutes.js ──────────────────────────────────────────────────────────
// صفحة "الخطة القادمة" (roadmap) — عكس الـchangelog تمامًا: مش بتعرض اللي خلص، بتعرض اللي
// جاي وبتخلي العميل يصوّت على أكتر فيتشر عايزه — بيحس إن صوته بيتسمع، وبيدّينا بيانات حقيقية
// عن أولويات العملاء بدل التخمين. طلب مباشر من العميل.
import express from 'express';
import pkg from 'pg';
import { adminAuth } from './adminAuthMiddleware.js';
import { authMiddleware } from './authRoutes.js';
import { verifyToken } from './authService.js';

const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS roadmap_items (
    id SERIAL PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'planned',
    title_ar TEXT NOT NULL,
    title_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    is_published INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Roadmap] create roadmap_items error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS roadmap_votes (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES roadmap_items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(item_id, user_id)
  )
`).catch(e => console.error('[Roadmap] create roadmap_votes error:', e.message));

const VALID_STATUSES = ['planned', 'in_progress', 'done'];

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════

router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ri.*, COUNT(rv.id)::int AS vote_count
      FROM roadmap_items ri
      LEFT JOIN roadmap_votes rv ON rv.item_id = ri.id
      GROUP BY ri.id
      ORDER BY vote_count DESC, ri.sort_order ASC, ri.id DESC
    `);
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', adminAuth, async (req, res) => {
  try {
    const { status, title_ar, title_en, description_ar, description_en, is_published, sort_order } = req.body;
    if (!title_ar?.trim() || !title_en?.trim()) return res.status(400).json({ error: 'title_ar and title_en are required' });
    const finalStatus = VALID_STATUSES.includes(status) ? status : 'planned';
    const { rows } = await pool.query(
      `INSERT INTO roadmap_items (status, title_ar, title_en, description_ar, description_en, is_published, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [finalStatus, title_ar.trim(), title_en.trim(), description_ar || null, description_en || null,
        is_published === false ? 0 : 1, parseInt(sort_order, 10) || 0]
    );
    res.json({ item: { ...rows[0], vote_count: 0 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { status, title_ar, title_en, description_ar, description_en, is_published, sort_order } = req.body;
    const finalStatus = status === undefined ? null : (VALID_STATUSES.includes(status) ? status : 'planned');
    const { rows } = await pool.query(
      `UPDATE roadmap_items SET
        status = COALESCE($1, status),
        title_ar = COALESCE($2, title_ar),
        title_en = COALESCE($3, title_en),
        description_ar = $4,
        description_en = $5,
        is_published = COALESCE($6, is_published),
        sort_order = COALESCE($7, sort_order)
       WHERE id = $8 RETURNING *`,
      [finalStatus, title_ar?.trim() || null, title_en?.trim() || null,
        description_ar ?? null, description_en ?? null,
        is_published === undefined ? null : (is_published ? 1 : 0),
        sort_order === undefined ? null : parseInt(sort_order, 10), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ item: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM roadmap_items WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════

// ✅ NEW: قايمة الروادماب العامة — متاحة للكل من غير تسجيل دخول (زي الكورسات/الـchangelog)،
// بس التصويت نفسه محتاج تسجيل دخول (فحص هوية بسيط ضد تصويت مزيف/متكرر). لو فيه توكن، بنرجع
// "voted" لكل عنصر عشان الفرونت إند يقدر يلوّن الزرار اللي العميل صوّت عليه فعلاً
router.get('/', async (req, res) => {
  try {
    const language = req.query.language === 'en' ? 'en' : 'ar';
    let userId = null;
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      try {
        userId = verifyToken(authHeader.slice(7).trim())?.userId || null;
      } catch { /* توكن غير صالح — نكمل من غير معرفة هوية، مش خطأ */ }
    }
    const { rows } = await pool.query(`
      SELECT ri.*, COUNT(rv.id)::int AS vote_count,
        ${userId ? `EXISTS(SELECT 1 FROM roadmap_votes WHERE item_id = ri.id AND user_id = $1)` : 'false'} AS voted
      FROM roadmap_items ri
      LEFT JOIN roadmap_votes rv ON rv.item_id = ri.id
      WHERE ri.is_published = 1
      GROUP BY ri.id
      ORDER BY vote_count DESC, ri.sort_order ASC, ri.id DESC
    `, userId ? [userId] : []);
    const items = rows.map(r => ({
      id: r.id,
      status: r.status,
      title: language === 'en' ? r.title_en : r.title_ar,
      description: language === 'en' ? r.description_en : r.description_ar,
      voteCount: r.vote_count,
      voted: !!r.voted,
    }));
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: تصويت toggle — لو العميل مصوّتش قبل كده يضيف صوت، لو صوّت بالفعل يشيله (unvote).
// محتاج تسجيل دخول حقيقي (authMiddleware) عشان نمنع تصويت مزيف/متكرر من نفس الشخص
router.post('/:id/vote', authMiddleware, async (req, res) => {
  try {
    const itemId = parseInt(req.params.id, 10);
    if (!itemId) return res.status(400).json({ error: 'invalid item id' });
    const existing = await pool.query('SELECT id FROM roadmap_votes WHERE item_id = $1 AND user_id = $2', [itemId, req.user.userId]);
    if (existing.rows.length) {
      await pool.query('DELETE FROM roadmap_votes WHERE id = $1', [existing.rows[0].id]);
      const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM roadmap_votes WHERE item_id = $1', [itemId]);
      return res.json({ voted: false, voteCount: rows[0].c });
    }
    await pool.query('INSERT INTO roadmap_votes (item_id, user_id) VALUES ($1, $2)', [itemId, req.user.userId]);
    const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM roadmap_votes WHERE item_id = $1', [itemId]);
    res.json({ voted: true, voteCount: rows[0].c });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
