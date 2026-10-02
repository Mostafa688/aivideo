// ── store.js ── جدول الوظائف (documentary_jobs) + رفع الملفات (R2 أو مجلد outputs محليًا)
import pkg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

export const ready = (async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documentary_jobs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      stage TEXT,
      progress INTEGER DEFAULT 0,
      title TEXT,
      input JSONB,
      script TEXT,
      result_url TEXT,
      thumbnail_url TEXT,
      duration_sec REAL,
      credits_charged INTEGER DEFAULT 0,
      credits_refunded INTEGER DEFAULT 0,
      credits_list JSONB,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query('ALTER TABLE documentary_jobs ADD COLUMN IF NOT EXISTS error_detail TEXT');
  await pool.query('ALTER TABLE documentary_jobs ADD COLUMN IF NOT EXISTS meta JSONB');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_documentary_jobs_user ON documentary_jobs(user_id, id DESC)');
})().catch(e => { console.warn('[Documentary] DB init failed:', e.message); });

export async function createJob({ userId, input, title, creditsCharged }) {
  await ready;
  const { rows } = await pool.query(
    'INSERT INTO documentary_jobs (user_id, input, title, credits_charged) VALUES ($1, $2, $3, $4) RETURNING *',
    [userId, JSON.stringify(input), title || null, creditsCharged]
  );
  return rows[0];
}

const COLS = new Set(['status', 'stage', 'progress', 'title', 'script', 'result_url', 'thumbnail_url', 'duration_sec', 'credits_refunded', 'credits_list', 'error', 'error_detail', 'meta']);
export async function updateJob(id, patch) {
  const keys = Object.keys(patch).filter(k => COLS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const vals = keys.map(k => (k === 'credits_list' || k === 'meta' ? JSON.stringify(patch[k]) : patch[k]));
  await pool.query(`UPDATE documentary_jobs SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, [id, ...vals]);
}

export async function getJob(id, userId) {
  await ready;
  const { rows } = await pool.query('SELECT * FROM documentary_jobs WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

export async function getJobAny(id) {
  const { rows } = await pool.query('SELECT * FROM documentary_jobs WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listJobs(userId, limit = 30) {
  await ready;
  const { rows } = await pool.query(
    'SELECT id, status, stage, progress, title, result_url, thumbnail_url, duration_sec, credits_charged, credits_refunded, error, created_at FROM documentary_jobs WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
    [userId, limit]
  );
  return rows;
}

// وظايف كانت شغالة وقت إعادة تشغيل السيرفر (الحالة في الذاكرة ضاعت) — بتتعلّم فاشلة وبيترد كريديتها
export async function claimStuckJobs() {
  await ready;
  const { rows } = await pool.query(
    `UPDATE documentary_jobs SET status = 'failed', error = 'Interrupted by a server restart — credits refunded.', updated_at = NOW()
     WHERE status IN ('queued','processing') RETURNING id, user_id, credits_charged, credits_refunded, meta`
  );
  return rows;
}

// ── رفع ──
const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

export async function uploadFile(file, key, contentType) {
  if (S3_ENDPOINT_URL && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && R2_PUBLIC_URL) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'auto', endpoint: S3_ENDPOINT_URL, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: fs.createReadStream(file), ContentType: contentType, ContentLength: fs.statSync(file).size }));
    return `${R2_PUBLIC_URL}/${key}`;
  }
  // بدون R2 (بيئة تطوير): نسخة محلية بيخدمها /outputs
  const rel = path.join('documentary', key.replace(/^documentaries\//, ''));
  const dest = path.join(process.cwd(), 'outputs', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(file, dest);
  return '/outputs/' + rel.replace(/\\/g, '/');
}

// دمج حقول في meta (الحزمة المولّدة مثلاً) من غير ما نمسح الباقي
export async function mergeMeta(id, patch) {
  await pool.query("UPDATE documentary_jobs SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1", [id, JSON.stringify(patch)]);
}

// إحصائيات للأدمن: أرقام عامة + أسباب الفشل + آخر الوظائف
export async function adminStats({ days = 30 } = {}) {
  await ready;
  const since = `NOW() - INTERVAL '${Math.max(1, Math.min(365, Number(days) || 30))} days'`;
  const q = (t, p) => pool.query(t, p).then(r => r.rows);
  const [totals] = await q(`SELECT COUNT(*)::int AS jobs,
      COUNT(*) FILTER (WHERE status='done')::int AS done, COUNT(*) FILTER (WHERE status='failed')::int AS failed,
      COUNT(*) FILTER (WHERE status IN ('queued','processing'))::int AS active,
      COALESCE(SUM(credits_charged),0)::int AS charged, COALESCE(SUM(credits_refunded),0)::int AS refunded,
      COALESCE(AVG(duration_sec) FILTER (WHERE status='done'),0)::float AS avg_duration,
      COALESCE(SUM(duration_sec) FILTER (WHERE status='done'),0)::float AS total_duration,
      COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status='done'),0)::float AS avg_wall_secs,
      COUNT(DISTINCT user_id)::int AS users
    FROM documentary_jobs WHERE created_at > ${since}`);
  const byMode = await q(`SELECT COALESCE(input->>'mode','?') AS mode, COUNT(*)::int AS jobs, COUNT(*) FILTER (WHERE status='failed')::int AS failed FROM documentary_jobs WHERE created_at > ${since} GROUP BY 1 ORDER BY 2 DESC`);
  const failuresByStage = await q(`SELECT COALESCE(stage,'?') AS stage, COUNT(*)::int AS n FROM documentary_jobs WHERE status='failed' AND created_at > ${since} GROUP BY 1 ORDER BY 2 DESC`);
  const perDay = await q(`SELECT to_char(created_at::date,'YYYY-MM-DD') AS day, COUNT(*)::int AS jobs, COUNT(*) FILTER (WHERE status='failed')::int AS failed FROM documentary_jobs WHERE created_at > ${since} GROUP BY 1 ORDER BY 1 DESC LIMIT 31`);
  const recentFailures = await q(`SELECT j.id, j.stage, j.error_detail, j.credits_charged, j.created_at, u.email FROM documentary_jobs j LEFT JOIN users u ON u.id = j.user_id WHERE j.status='failed' ORDER BY j.id DESC LIMIT 25`);
  const recent = await q(`SELECT j.id, j.status, j.stage, j.progress, j.title, j.duration_sec, j.credits_charged, j.credits_refunded, j.created_at, u.email FROM documentary_jobs j LEFT JOIN users u ON u.id = j.user_id ORDER BY j.id DESC LIMIT 25`);
  return { days: Number(days) || 30, totals, byMode, failuresByStage, perDay, recentFailures, recent };
}

// ── دقيقة مجانية لأول فيلم (بصوت العميل المرفوع بس): علامة على الحساب، بتتاخد بشكل ذري ──
let trialColReady = null;
function ensureTrialCol() {
  trialColReady ||= pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS free_doc_trial_used BOOLEAN DEFAULT FALSE').catch(e => { trialColReady = null; throw e; });
  return trialColReady;
}
export async function trialAvailable(userId) {
  await ensureTrialCol();
  const { rows } = await pool.query('SELECT COALESCE(free_doc_trial_used, FALSE) AS used FROM users WHERE id = $1', [userId]);
  return rows[0] ? !rows[0].used : false;
}
export async function claimTrial(userId) {
  await ensureTrialCol();
  const { rowCount } = await pool.query('UPDATE users SET free_doc_trial_used = TRUE WHERE id = $1 AND COALESCE(free_doc_trial_used, FALSE) = FALSE', [userId]);
  return rowCount === 1;
}
export async function releaseTrial(userId) {
  await ensureTrialCol();
  await pool.query('UPDATE users SET free_doc_trial_used = FALSE WHERE id = $1', [userId]);
}
