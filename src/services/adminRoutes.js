import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'erivion_admin_2026';
  if (!secret || secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const [
      totalUsers, verifiedUsers, planDist, totalVideos, recentUsers,
      totalRevenue, pendingPayments, weeklySignups, model3Users, videosPerDay, topUsers,
    ] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users'),
      pool.query('SELECT COUNT(*) FROM users WHERE verified = 1'),
      pool.query('SELECT plan, COUNT(*) as count FROM users GROUP BY plan'),
      pool.query('SELECT COUNT(*) FROM videos'),
      pool.query('SELECT id, email, plan, model3_access, model5_access, created_at, verified FROM users ORDER BY id DESC LIMIT 20'),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM payment_requests WHERE status = 'approved'"),
      pool.query("SELECT COUNT(*) FROM payment_requests WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*) FROM users WHERE created_at::timestamp >= NOW() - INTERVAL '7 days'"),
      pool.query('SELECT COUNT(*) FROM users WHERE model3_access = 1'),
      pool.query(`SELECT DATE(created_at::timestamp) as day, COUNT(*) as count FROM videos WHERE created_at::timestamp >= NOW() - INTERVAL '7 days' GROUP BY DATE(created_at::timestamp) ORDER BY day ASC`),
      pool.query(`SELECT u.email, u.plan, COUNT(v.id) as video_count FROM users u LEFT JOIN videos v ON v.user_id = u.id GROUP BY u.id, u.email, u.plan ORDER BY video_count DESC LIMIT 5`),
    ]);
    res.json({
      overview: {
        total_users: parseInt(totalUsers.rows[0].count),
        verified_users: parseInt(verifiedUsers.rows[0].count),
        total_videos: parseInt(totalVideos.rows[0].count),
        total_revenue_egp: parseInt(totalRevenue.rows[0].total),
        pending_payments: parseInt(pendingPayments.rows[0].count),
        weekly_signups: parseInt(weeklySignups.rows[0].count),
        model3_users: parseInt(model3Users.rows[0].count),
      },
      plan_distribution: planDist.rows,
      recent_users: recentUsers.rows,
      videos_per_day: videosPerDay.rows,
      top_users: topUsers.rows,
    });
  } catch (err) {
    console.error('[Admin Stats]', err.message);
    res.status(500).json({ error: err.message });
  }
});
router.get('/payments', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM payment_requests ORDER BY created_at DESC LIMIT 50';
    let params = [];
    if (status) { query = 'SELECT * FROM payment_requests WHERE status = $1 ORDER BY created_at DESC LIMIT 50'; params = [status]; }
    const { rows } = await pool.query(query, params);
    res.json({ payments: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { plan, search, limit = 50 } = req.query;
    let where = [], params = [], idx = 1;
    if (plan) { where.push(`plan = $${idx++}`); params.push(plan); }
    if (search) { where.push(`(email ILIKE $${idx++} OR name ILIKE $${idx - 1})`); params.push(`%${search}%`); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.name, u.plan, u.verified, u.model3_access, u.model3_plan, u.model4_access, u.model4_plan, u.model5_access, u.model5_plan, u.ref_code, u.created_at,
             COALESCE(uu.credits_used, 0) as credits_used,
             COALESCE(uu.videos_this_week, 0) as videos_this_week,
             COUNT(v.id) as total_videos
      FROM users u
      LEFT JOIN user_usage uu ON uu.user_id = u.id
      LEFT JOIN videos v ON v.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.email, u.name, u.plan, u.verified, u.model3_access, u.model3_plan, u.model4_access, u.model4_plan, u.model5_access, u.model5_plan, u.ref_code, u.created_at, uu.credits_used, uu.videos_this_week
      ORDER BY u.id DESC
      LIMIT $${idx}
    `, [...params, parseInt(limit)]);
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/videos', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT v.id, v.filename, v.title, v.created_at, u.email, u.plan
      FROM videos v JOIN users u ON u.id = v.user_id
      ORDER BY v.created_at DESC LIMIT 50
    `);
    res.json({ videos: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.post('/user/plan', adminAuth, async (req, res) => {
  try {
    const { email, plan, model3_access, model3_plan } = req.body;
    if (!email || !plan) return res.status(400).json({ error: 'email and plan required' });
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);
    await pool.query('UPDATE users SET plan = $1, plan_expires_at = $2 WHERE email = $3', [plan, plan === 'free' ? null : expiresAt.toISOString(), email]);
    if (model3_access !== undefined) {
      await pool.query('UPDATE users SET model3_access = $1, model3_plan = $2 WHERE email = $3', [model3_access ? 1 : 0, model3_plan || null, email]);
    }
    res.json({ success: true, message: `Updated ${email} to ${plan}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── Model 3 Admin ──────────────────────────────────────────────────────────
router.post('/user/model3', adminAuth, async (req, res) => {
  try {
    const { email, access, plan } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    await pool.query(
      'UPDATE users SET model3_access = $1, model3_plan = $2 WHERE email = $3',
      [access ? 1 : 0, plan || 'm3_starter', email]
    );
    res.json({ success: true, message: `Model 3 updated for ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── Model 4 Admin ──────────────────────────────────────────────────────────
router.post('/user/model4', adminAuth, async (req, res) => {
  try {
    const { email, access, plan } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    await pool.query(
      'UPDATE users SET model4_access = $1, model4_plan = $2 WHERE email = $3',
      [access ? 1 : 0, plan || 'm4_plan1', email]
    );
    res.json({ success: true, message: `Model 4 updated for ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── Model 5 (Cinematic) Admin ──────────────────────────────────────────────
router.post('/user/model5', adminAuth, async (req, res) => {
  try {
    const { email, access, plan } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    await pool.query(
      'UPDATE users SET model5_access = $1, model5_plan = $2 WHERE email = $3',
      [access ? 1 : 0, plan || 'mc_starter', email]
    );
    res.json({ success: true, message: `Model 5 Cinematic updated for ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
export default router;