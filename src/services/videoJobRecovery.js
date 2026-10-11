// حفظ حالة توليد الفيديو (Replicate) في قاعدة البيانات عشان لو السيرفر اتعمله restart/deploy وسط التوليد
// (حالة العميل: Kling خد دقيقتين، السيرفر اتعمله deploy، والفرونت قال job_not_found والكريديت اتخصم من غير نتيجة)
// نكمّل نستعلم عن نفس الـprediction بعد ما السيرفر يرجع: لو نجح نحفظ الفيديو ونظهره للعميل، ولو فشل نرجّع الكريديت.
// بيشتغل بس على الطلبات البسيطة (من غير سرد/كابشن/موسيقى) — دول مفيهمش خطوات معالجة محلية بتضيع مع الـrestart.
import pkg from 'pg';
import crypto from 'crypto';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false });
const INSTANCE_ID = crypto.randomUUID();
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const HEARTBEAT_MS = 30_000;
const STALE_SECONDS = 90;          // job بدون heartbeat أكتر من كده = السيرفر اللي كان شغّال عليه مات
const MAX_AGE_MINUTES = 90;        // مش بنكمّل job أقدم من كده
const POLL_TIMEOUT_MS = 20 * 60 * 1000;

let tableReady = null;
function ensureTable() {
  if (!tableReady) {
    tableReady = pool.query(`CREATE TABLE IF NOT EXISTS video_gen_jobs (
      job_id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, model TEXT NOT NULL, prediction_id TEXT NOT NULL,
      credit_cost INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'running', video_url TEXT, error TEXT,
      instance_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).catch(e => { tableReady = null; throw e; });
  }
  return tableReady;
}

export async function trackJob({ jobId, userId, model, creditCost, predictionId }) {
  try {
    await ensureTable();
    await pool.query(`INSERT INTO video_gen_jobs (job_id,user_id,model,prediction_id,credit_cost,instance_id) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (job_id) DO UPDATE SET prediction_id=EXCLUDED.prediction_id, instance_id=EXCLUDED.instance_id, updated_at=NOW()`,
      [jobId, userId, model, predictionId, Math.round(creditCost || 0), INSTANCE_ID]);
  } catch (e) { console.warn('[VideoJobs] track failed:', e.message); }
}

export async function finishJob(jobId, { status, videoUrl = null, error = null }) {
  try {
    await ensureTable();
    await pool.query(`UPDATE video_gen_jobs SET status=$2, video_url=$3, error=$4, updated_at=NOW() WHERE job_id=$1`, [jobId, status, videoUrl, error]);
  } catch (e) { console.warn('[VideoJobs] finish failed:', e.message); }
}

/** حالة job اتفقد من الذاكرة/الملف (بعد restart) — بنرجّعها بنفس شكل render job اللي الفرونت إند بيستعلم عنه */
export async function getJobFromDb(jobId, userId) {
  try {
    await ensureTable();
    const { rows } = await pool.query(`SELECT * FROM video_gen_jobs WHERE job_id=$1 AND user_id=$2`, [jobId, userId]);
    const r = rows[0];
    if (!r) return null;
    if (r.status === 'done') return { status: 'done', videoUrl: r.video_url, creditCost: r.credit_cost, userId };
    if (r.status === 'failed') return { status: 'failed', error: r.error || 'Video generation failed, your credits were refunded.', userId };
    return { status: 'processing', userId };
  } catch { return null; }
}

async function pollPrediction(id) {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, { headers: { Authorization: `Bearer ${REPLICATE_API_TOKEN}` } });
    if (res.ok) {
      const d = await res.json();
      if (d.status === 'succeeded') return { ok: true, output: d.output };
      if (d.status === 'failed' || d.status === 'canceled') return { ok: false, error: d.error || (typeof d.logs === 'string' ? d.logs.trim().split('\n').slice(-3).join(' | ') : '') || d.status };
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  return { ok: false, error: 'timed out' };
}

async function recoverOne(row, { persistVideo, refund, onDone, friendlyError }) {
  console.log(`[VideoJobs] recovering ${row.job_id} (${row.model}, prediction ${row.prediction_id})`);
  try {
    const r = await pollPrediction(row.prediction_id);
    if (r.ok) {
      const url = Array.isArray(r.output) ? r.output[0] : r.output;
      const saved = await persistVideo(url, row.model);
      await finishJob(row.job_id, { status: 'done', videoUrl: saved });
      onDone?.(row, saved);
    } else {
      await refund(row.user_id, row.credit_cost);
      await finishJob(row.job_id, { status: 'failed', error: friendlyError(r.error) });
    }
  } catch (e) {
    console.warn(`[VideoJobs] recovery of ${row.job_id} failed:`, e.message);
    await pool.query(`UPDATE video_gen_jobs SET status='running', instance_id='orphan', updated_at=NOW() - INTERVAL '10 minutes' WHERE job_id=$1 AND status='recovering'`, [row.job_id]).catch(() => {});
  }
}

export function startVideoJobRecovery(deps) {
  const heartbeat = async () => {
    try { await ensureTable(); await pool.query(`UPDATE video_gen_jobs SET updated_at=NOW() WHERE status IN ('running','recovering') AND instance_id=$1`, [INSTANCE_ID]); } catch {}
  };
  const sweep = async () => {
    try {
      await ensureTable();
      // claim ذري: بس الـjobs اللي سيرفرها مات (مفيش heartbeat) — مفيش خطر ننافس سيرفر شغّال
      const { rows } = await pool.query(`UPDATE video_gen_jobs SET status='recovering', instance_id=$1, updated_at=NOW()
        WHERE status='running' AND instance_id<>$1 AND updated_at < NOW() - make_interval(secs => $2) AND created_at > NOW() - make_interval(mins => $3)
        RETURNING *`, [INSTANCE_ID, STALE_SECONDS, MAX_AGE_MINUTES]);
      for (const row of rows) recoverOne(row, deps);
    } catch (e) { console.warn('[VideoJobs] sweep failed:', e.message); }
  };
  setInterval(heartbeat, HEARTBEAT_MS).unref?.();
  setTimeout(sweep, 20_000).unref?.();
  setInterval(sweep, 2 * 60 * 1000).unref?.();
}
