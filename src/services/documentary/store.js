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

const COLS = new Set(['status', 'stage', 'progress', 'title', 'script', 'result_url', 'thumbnail_url', 'duration_sec', 'credits_refunded', 'credits_list', 'error']);
export async function updateJob(id, patch) {
  const keys = Object.keys(patch).filter(k => COLS.has(k));
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const vals = keys.map(k => (k === 'credits_list' ? JSON.stringify(patch[k]) : patch[k]));
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
     WHERE status IN ('queued','processing') RETURNING id, user_id, credits_charged, credits_refunded`
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
