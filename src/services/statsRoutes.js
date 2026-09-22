// ── statsRoutes.js ────────────────────────────────────────────────────────────
// داشبورد إحصائيات شخصي للعميل ("كام فيديو عملت الشهر ده؟ صرفت كام كريديت؟ أكتر موديل
// بستخدمه؟") — جزء من "إيه الناقص عشان نبقى زي المواقع الكبيرة". محتاج سجل حقيقي مؤرَّخ لكل
// عملية (مش موجود قبل كده — الجداول القديمة كلها عدادات إجمالية بس، من غير تاريخ لكل عملية)،
// فبنبني هنا سجل جديد وبنسجل فيه كل توليد حقيقي ينجح على النظام الجديد (الصور/الفيديوهات/
// الدمج/التحليل/التعديل) وقت ما يخلص فعليًا — الإحصائيات بترجع بس من لحظة إطلاق الفيتشر ده،
// مش بيانات تاريخية مُلفَّقة من عدادات قديمة بأشكال مختلفة تمامًا لكل موديل
import express from 'express';
import pkg from 'pg';
import { authMiddleware } from './authRoutes.js';

const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS user_generation_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    model_key TEXT,
    credit_cost INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Stats] create user_generation_log error:', e.message));
pool.query(`CREATE INDEX IF NOT EXISTS idx_generation_log_user_date ON user_generation_log(user_id, created_at)`).catch(() => {});

// ✅ الدالة اللي بتستخدمها كل نقاط النجاح في index.js (توليد صورة/فيديو/دمج/تحليل/تعديل) —
// استدعاء واحد بسيط، بره أي منطق كريديت/رندر أصلي، عشان ميأثرش على أي حاجة موجودة لو فشل
export async function logGeneration({ userId, kind, modelKey = null, creditCost = 0 }) {
  try {
    await pool.query(
      `INSERT INTO user_generation_log (user_id, kind, model_key, credit_cost) VALUES ($1,$2,$3,$4)`,
      [userId, kind, modelKey, Math.round(creditCost) || 0]
    );
  } catch (e) {
    console.error('[Stats] logGeneration failed (non-fatal):', e.message);
  }
}

// ── GET /api/stats/me — إحصائيات العميل الحالي بس (مش الأدمن) ──────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [{ rows: monthRows }, { rows: totalRows }, { rows: byKindRows }, { rows: byModelRows }, { rows: dailyRows }] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(credit_cost),0)::int AS credits
         FROM user_generation_log WHERE user_id = $1 AND created_at >= date_trunc('month', NOW())`,
        [userId]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(credit_cost),0)::int AS credits
         FROM user_generation_log WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT kind, COUNT(*)::int AS count FROM user_generation_log WHERE user_id = $1 GROUP BY kind ORDER BY count DESC`,
        [userId]
      ),
      pool.query(
        `SELECT model_key, COUNT(*)::int AS count FROM user_generation_log
         WHERE user_id = $1 AND model_key IS NOT NULL GROUP BY model_key ORDER BY count DESC LIMIT 5`,
        [userId]
      ),
      pool.query(
        `SELECT to_char(created_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
         FROM user_generation_log WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '14 days'
         GROUP BY day ORDER BY day ASC`,
        [userId]
      ),
    ]);

    res.json({
      thisMonth: monthRows[0],
      allTime: totalRows[0],
      byKind: byKindRows,
      topModels: byModelRows,
      last14Days: dailyRows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
