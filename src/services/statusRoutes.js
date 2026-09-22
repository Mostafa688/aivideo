// ── statusRoutes.js ───────────────────────────────────────────────────────────
// صفحة حالة النظام العامة (زي status.openai.com/status.stripe.com) — جزء من "إيه الناقص
// عشان نبقى زي المواقع الكبيرة": فحص حي لصحة المكونات الأساسية (قاعدة البيانات، تخزين
// الملفات، مفاتيح الـAPI الخارجية) + بلاغات أعطال يقدر الأدمن ينشرها/يقفلها يدويًا وقت
// حصول مشكلة حقيقية — عشان العميل يعرف إحنا عارفين المشكلة بدل ما يستغرب ويفتح تذكرة دعم
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
  CREATE TABLE IF NOT EXISTS status_incidents (
    id SERIAL PRIMARY KEY,
    severity TEXT NOT NULL DEFAULT 'degraded',
    title_ar TEXT NOT NULL,
    title_en TEXT NOT NULL,
    description_ar TEXT,
    description_en TEXT,
    resolved INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
  )
`).catch(e => console.error('[Status] create status_incidents error:', e.message));

const VALID_SEVERITIES = ['info', 'degraded', 'outage'];

// ── فحوصات حية حقيقية للمكونات الأساسية — مش مجرد "OK" ثابت ──────────────────
async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    return { status: 'operational', label: 'Database' };
  } catch {
    return { status: 'outage', label: 'Database' };
  }
}

function checkStorage() {
  // ✅ فحص خفيف (مش نداء شبكة حقيقي في كل طلب — ده كان هيبطّئ الصفحة العامة من غير داعي):
  // بنتأكد إن إعدادات R2 موجودة فعلاً، مش بس نرجّع "OK" ثابت بدون معنى
  const ok = !!(process.env.S3_ENDPOINT_URL && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY);
  return { status: ok ? 'operational' : 'outage', label: 'Media Storage' };
}

function checkGenerationEngines() {
  const ok = !!process.env.REPLICATE_API_TOKEN;
  return { status: ok ? 'operational' : 'outage', label: 'AI Generation Engines' };
}

function checkAgentChat() {
  const ok = !!process.env.GROQ_API_KEY;
  return { status: ok ? 'operational' : 'outage', label: 'Agent Chat' };
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES — بلاغات الأعطال (incidents)
// ══════════════════════════════════════════════════════════════════════════

router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM status_incidents ORDER BY created_at DESC LIMIT 100`);
    res.json({ incidents: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', adminAuth, async (req, res) => {
  try {
    const { severity, title_ar, title_en, description_ar, description_en } = req.body;
    if (!title_ar?.trim() || !title_en?.trim()) return res.status(400).json({ error: 'title_ar and title_en are required' });
    const finalSeverity = VALID_SEVERITIES.includes(severity) ? severity : 'degraded';
    const { rows } = await pool.query(
      `INSERT INTO status_incidents (severity, title_ar, title_en, description_ar, description_en)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [finalSeverity, title_ar.trim(), title_en.trim(), description_ar || null, description_en || null]
    );
    res.json({ incident: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/:id/resolve', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE status_incidents SET resolved = 1, resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Incident not found' });
    res.json({ incident: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM status_incidents WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTE
// ══════════════════════════════════════════════════════════════════════════

router.get('/', async (req, res) => {
  try {
    const language = req.query.language === 'en' ? 'en' : 'ar';
    const [db, storage, engines, agent] = await Promise.all([
      checkDatabase(), checkStorage(), checkGenerationEngines(), checkAgentChat(),
    ]);
    const components = [db, storage, engines, agent];
    const overall = components.some(c => c.status === 'outage')
      ? 'outage'
      : components.some(c => c.status === 'degraded') ? 'degraded' : 'operational';

    const { rows } = await pool.query(
      `SELECT * FROM status_incidents ORDER BY created_at DESC LIMIT 20`
    );
    const incidents = rows.map(r => ({
      id: r.id,
      severity: r.severity,
      title: language === 'en' ? r.title_en : r.title_ar,
      description: language === 'en' ? r.description_en : r.description_ar,
      resolved: r.resolved === 1,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));

    res.json({ overall, components, incidents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
