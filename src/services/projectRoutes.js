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
    // ✅ NEW (باج حقيقي: العميل بيدخل مشروع، يعمل شات وصور وفيديوهات مع الايجنت، يخرج ويرجع —
    // يلاقي كل حاجة اختفت لأنها كانت state في الفرونت إند بس، مفيش تخزين حقيقي خالص): سناب
    // شوت واحد لكل مشروع بيشيل الرسايل كلها (نص + ميديا) كـ JSON — مش صف لكل رسالة، عشان
    // التنفيذ يفضل بسيط (upsert واحد بدل حسابات append/order معقدة) والحجم صغير أصلاً (نصوص +
    // روابط ميديا مش الملفات نفسها)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS project_chat_state (
        project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        messages JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
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

// ✅ NEW: حالة شات الايجنت (نص + ميديا) لمشروع معيّن — بتتحمل لما المستخدم يفتح المشروع
// وبتتحفظ (upsert) كل ما تتغيّر، عشان الدخول والخروج من المشروع محدش يفقد أي حاجة
const MAX_MESSAGES_BYTES = 2 * 1024 * 1024; // 2MB سقف أمان معقول لسناب شوت JSON واحد

router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const own = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    if (!own.rows.length) return res.status(404).json({ error: 'not_found' });
    const { rows } = await pool.query('SELECT messages FROM project_chat_state WHERE project_id = $1', [req.params.id]);
    res.json({ messages: rows[0]?.messages || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const own = await pool.query('SELECT id FROM projects WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    if (!own.rows.length) return res.status(404).json({ error: 'not_found' });
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const json = JSON.stringify(messages);
    if (Buffer.byteLength(json, 'utf8') > MAX_MESSAGES_BYTES) {
      return res.status(413).json({ error: 'too_large' });
    }
    await pool.query(
      `INSERT INTO project_chat_state (project_id, user_id, messages, updated_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (project_id) DO UPDATE SET messages = $3, updated_at = NOW()`,
      [req.params.id, req.user.userId, json]
    );
    await pool.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
