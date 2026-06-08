import express from 'express';
import pkg from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
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
// ── Reset User Weekly Credits ─────────────────────────────────────────────────
router.post('/reset-credits', adminAuth, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const { rows } = await pool.query(
      `UPDATE user_usage
       SET credits_used = 0,
           videos_this_week = 0
       WHERE user_id = (SELECT id FROM users WHERE email = $1)
       RETURNING user_id`,
      [email]
    );
    if (!rows.length) {
      await pool.query(
        `INSERT INTO user_usage (user_id, credits_used, videos_this_week)
         SELECT id, 0, 0 FROM users WHERE email = $1
         ON CONFLICT (user_id) DO UPDATE SET credits_used=0, videos_this_week=0`,
        [email]
      );
    }
    console.log('[Admin] Credits reset for ' + email);
    res.json({ success: true, message: 'Credits reset for ' + email });
  } catch (err) {
    console.error('[Admin] reset-credits error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Personal Studio — Batch Video Generator ─────────────────────────
const TEMP_DIR_ADMIN = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';
const OUTPUTS_DIR_ADMIN = 'outputs';

async function generateStudioClip(prompt, ratio = '16:9') {
  const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');

  const headers = {
    'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'wait',
  };

  const submitRes = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-1-pro-fast/predictions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { prompt, aspect_ratio: ratio, resolution: '720p', duration: 5, fps: 24, camera_fixed: false },
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Replicate error ${submitRes.status}: ${err}`);
  }

  const prediction = await submitRes.json();
  if (prediction.status === 'succeeded' && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }

  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`No prediction ID: ${JSON.stringify(prediction)}`);
  console.log(`[Studio] Job: ${predictionId}`);

  const maxWait = 300_000;
  const pollInterval = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!statusRes.ok) continue;
    const data = await statusRes.json();
    console.log(`[Studio] Status: ${data.status} (${Math.round((Date.now() - startTime) / 1000)}s)`);
    if (data.status === 'succeeded') {
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!url) throw new Error('No video URL in output');
      return url;
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate failed: ${data.error || 'unknown'}`);
    }
  }
  throw new Error('Timeout after 5 minutes');
}

async function downloadStudioClip(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

router.post('/studio/generate', adminAuth, async (req, res) => {
  const { prompts, ratio = '16:9' } = req.body;
  if (!prompts || !Array.isArray(prompts) || prompts.length === 0)
    return res.status(400).json({ error: 'prompts array required' });
  if (prompts.length > 20)
    return res.status(400).json({ error: 'Max 20 scenes' });

  const id = Date.now();
  const outputFile = `studio_${id}.mp4`;
  const outputPath = path.join(OUTPUTS_DIR_ADMIN, outputFile);

  try {
    await fs.promises.mkdir(TEMP_DIR_ADMIN, { recursive: true });
    await fs.promises.mkdir(OUTPUTS_DIR_ADMIN, { recursive: true });
    console.log(`[Studio] START — ${prompts.length} scenes, ratio: ${ratio}`);

    const clipPaths = [];
    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i].trim();
      if (!prompt) continue;
      const clipPath = path.join(TEMP_DIR_ADMIN, `studio_${id}_clip${i}.mp4`);
      console.log(`[Studio] Clip ${i + 1}/${prompts.length}: ${prompt.slice(0, 60)}`);
      try {
        const url = await generateStudioClip(prompt, ratio);
        await downloadStudioClip(url, clipPath);
        clipPaths.push(clipPath);
        console.log(`[Studio] ✅ Clip ${i + 1} done`);
      } catch (e) {
        console.error(`[Studio] ❌ Clip ${i + 1} failed: ${e.message}`);
        const { w, h } = ratio === '9:16' ? { w: 720, h: 1280 } : ratio === '1:1' ? { w: 720, h: 720 } : { w: 1280, h: 720 };
        try {
          execSync(
            `ffmpeg -f lavfi -i color=c=black:size=${w}x${h}:rate=24 -t 5 ` +
            `-c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -movflags +faststart -y "${clipPath}"`,
            { stdio: 'pipe' }
          );
          clipPaths.push(clipPath);
        } catch {}
      }
    }

    if (clipPaths.length === 0) return res.status(500).json({ error: 'All clips failed to generate' });

    if (clipPaths.length === 1) {
      fs.copyFileSync(clipPaths[0], outputPath);
    } else {
      const listFile = path.join(TEMP_DIR_ADMIN, `studio_${id}_list.txt`);
      fs.writeFileSync(listFile, clipPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
      execSync(
        `ffmpeg -f concat -safe 0 -i "${listFile}" ` +
        `-c:v libx264 -crf 16 -preset slow -profile:v high -level 4.1 ` +
        `-pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
        { stdio: 'pipe' }
      );
      try { fs.unlinkSync(listFile); } catch {}
    }

    setTimeout(() => {
      clipPaths.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
    }, 120_000);

    console.log(`[Studio] DONE → ${outputFile}`);
    res.json({ success: true, filename: outputFile, url: `/outputs/${outputFile}`, scenes: clipPaths.length });

  } catch (err) {
    console.error('[Studio] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;