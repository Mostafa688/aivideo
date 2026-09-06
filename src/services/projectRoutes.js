import express from 'express';
import pkg from 'pg';
import { authMiddleware } from './authRoutes.js';
const { Pool } = pkg;

// ── Projects (Phase: Workspace redesign) ────────────────────────────────────
// أول مرة يظهر فيها مفهوم "مشروع" في الداتا موديل بتاع المنصة — كل مشروع بيمثل مساحة عمل
// مستقلة (اسم + تاريخ) هتتربط لاحقًا بالميديا المتولدة جواها (صور/فيديوهات) لما الـ workspace
// الجديد (Agent + Canvas + Organize) يتبنى بالكامل. النسخة دي بس: CRUD أساسي + قائمة الداشبورد.
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL DEFAULT 'Untitled Project',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);`);
    console.log('[Projects] Table ready');
  } catch (e) { console.warn('[Projects] Init error:', e.message); }
})();

const router = express.Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, created_at, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.userId]
    );
    res.json({ projects: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const name = (req.body?.name || '').trim().slice(0, 120) || 'Untitled Project';
    const { rows } = await pool.query(
      'INSERT INTO projects (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at, updated_at',
      [req.user.userId, name]
    );
    res.status(201).json({ project: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, created_at, updated_at FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ project: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const name = (req.body?.name || '').trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await pool.query(
      'UPDATE projects SET name = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3 RETURNING id, name, created_at, updated_at',
      [name, req.params.id, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ project: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM projects WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'not_found' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
