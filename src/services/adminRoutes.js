import express from 'express';
import pkg from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { estimatePaymentProfit, markPaymentPaidOut, unmarkPaymentPaidOut, approveCreditsPaymentById, rejectPaymentRequestById, deleteExpiredPendingPayments, getRecentAgentConversations, listManagedChannelsForAdmin, listRecentDailyRunsForAdmin } from './authService.js';
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
      signupsToday, loginsToday, monthlySubs,
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
      pool.query(`SELECT COUNT(*) FROM users WHERE DATE(created_at::timestamp) = CURRENT_DATE`),
      pool.query(`SELECT COUNT(*) FROM login_events WHERE DATE(created_at::timestamp) = CURRENT_DATE`).catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`
        SELECT TO_CHAR(created_at::timestamp, 'YYYY-MM') as month,
               COUNT(*) as count,
               COALESCE(SUM(amount), 0) as revenue
        FROM payment_requests
        WHERE status = 'approved' AND created_at::timestamp >= NOW() - INTERVAL '12 months'
        GROUP BY month
        ORDER BY month ASC
      `),
    ]);
    const totalRevenueEgp = parseInt(totalRevenue.rows[0].total);
    const revenueEstimate = estimatePaymentProfit(totalRevenueEgp);
    res.json({
      overview: {
        total_users: parseInt(totalUsers.rows[0].count),
        verified_users: parseInt(verifiedUsers.rows[0].count),
        total_videos: parseInt(totalVideos.rows[0].count),
        total_revenue_egp: totalRevenueEgp,
        total_cost_estimate_egp: revenueEstimate.costEstimate,
        total_profit_estimate_egp: revenueEstimate.profitEstimate,
        pending_payments: parseInt(pendingPayments.rows[0].count),
        weekly_signups: parseInt(weeklySignups.rows[0].count),
        model3_users: parseInt(model3Users.rows[0].count),
        signups_today: parseInt(signupsToday.rows[0].count),
        logins_today: parseInt(loginsToday.rows[0].count),
      },
      plan_distribution: planDist.rows,
      recent_users: recentUsers.rows,
      videos_per_day: videosPerDay.rows,
      top_users: topUsers.rows,
      monthly_subscriptions: monthlySubs.rows,
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
    // ✅ نحسب الربح والتكلفة التقديرية لكل عملية دفع مباشرة عشان الأدمن يشوفها من غير حسبة يدوية
    const payments = rows.map(p => ({ ...p, ...estimatePaymentProfit(p.amount) }));
    res.json({ payments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── تسجيل إن التكلفة اتدفعت فعليًا لمصدر الخدمة (Replicate/Groq/إلخ) لعملية دفع معينة ──
router.post('/payments/:id/mark-paid', adminAuth, async (req, res) => {
  try {
    const payment = await markPaymentPaidOut(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ payment: { ...payment, ...estimatePaymentProfit(payment.amount) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payments/:id/unmark-paid', adminAuth, async (req, res) => {
  try {
    const payment = await unmarkPaymentPaidOut(req.params.id);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    res.json({ payment: { ...payment, ...estimatePaymentProfit(payment.amount) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: اعتماد/رفض طلب دفع مباشرة من صفحة الأدمن (بدل ما يكون بس عن طريق لينك الإيميل)
router.post('/payments/:id/approve', adminAuth, async (req, res) => {
  try {
    const result = await approveCreditsPaymentById(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/payments/:id/reject', adminAuth, async (req, res) => {
  try {
    const payment = await rejectPaymentRequestById(req.params.id, req.body?.reason || 'other');
    res.json({ success: true, payment });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ✅ NEW: مسح تلقائي لطلبات الدفع المعلّقة (pending) بعد 48 ساعة من غير رد —
// عشان ميحصلش تراكم في جدول payment_requests يكلف مساحة/فلوس على Railway.
// بيشتغل مرة أول ما السيرفر يشتغل وبعدين كل ساعة.
deleteExpiredPendingPayments(48).catch(e => console.warn('[Payments Cleanup]', e.message));
setInterval(() => {
  deleteExpiredPendingPayments(48).catch(e => console.warn('[Payments Cleanup]', e.message));
}, 60 * 60 * 1000);

router.get('/users', adminAuth, async (req, res) => {
  try {
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS banned INTEGER DEFAULT 0').catch(() => {});
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS region TEXT DEFAULT NULL').catch(() => {});
    const { plan, search, limit = 50 } = req.query;
    let where = [], params = [], idx = 1;
    if (plan) { where.push(`plan = $${idx++}`); params.push(plan); }
    if (search) { where.push(`(email ILIKE $${idx++} OR name ILIKE $${idx - 1})`); params.push(`%${search}%`); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const { rows } = await pool.query(`
      SELECT u.id, u.email, u.name, u.plan, u.verified,
             COALESCE(u.credits_balance, 0) as credits_balance,
             u.model3_access, u.model3_plan, u.model4_access, u.model4_plan,
             u.model5_access, u.model5_plan, u.ref_code, u.created_at,
             u.plan_expires_at,
             COALESCE(u.banned, 0) as banned,
             COALESCE(u.region, 'unknown') as region,
             COALESCE(uu.credits_used, 0) as credits_used,
             COALESCE(uu.videos_this_week, 0) as videos_this_week,
             COUNT(v.id) as total_videos
      FROM users u
      LEFT JOIN user_usage uu ON uu.user_id = u.id
      LEFT JOIN videos v ON v.user_id = u.id
      ${whereClause}
      GROUP BY u.id, uu.credits_used, uu.videos_this_week
      ORDER BY u.id DESC
      LIMIT $${idx}
    `, [...params, parseInt(limit)]);
    res.json({ users: rows });
  } catch (err) {
    console.error('[Admin Users]', err.message);
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
// ── القنوات المُدارة (VidIQ) وسجل الفيديوهات اليومية — مراقبة الأدمن ──────────────
router.get('/channels', adminAuth, async (req, res) => {
  try {
    const channels = await listManagedChannelsForAdmin();
    res.json({ channels });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/daily-runs', adminAuth, async (req, res) => {
  try {
    const runs = await listRecentDailyRunsForAdmin(100);
    res.json({ runs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// چات الايجنت مع العملاء (مشتركين أو لا) — آخر 24 ساعة فقط، بيتمسح تلقائيًا بعد كده (support مراجعة المشاكل بدون ما العميل يشتكي)
router.get('/agent-chats', adminAuth, async (req, res) => {
  try {
    const rows = await getRecentAgentConversations(24);
    res.json({ chats: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// ── تعديل رصيد كريديت أي عميل يدويًا (دعم فني / مجاملة) ───────────────────
router.post('/user/credits', adminAuth, async (req, res) => {
  try {
    const { email, delta } = req.body;
    const deltaNum = parseInt(delta, 10);
    if (!email || !deltaNum) return res.status(400).json({ error: 'email and non-zero delta required' });
    const { rows } = await pool.query(
      'UPDATE users SET credits_balance = GREATEST(0, COALESCE(credits_balance, 0) + $1) WHERE email = $2 RETURNING credits_balance',
      [deltaNum, email]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, credits_balance: rows[0].credits_balance });
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

    const backendUrl = (process.env.SITE_URL || process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app').replace(/\/$/, '');
    console.log(`[Studio] DONE → ${outputFile}`);
    res.json({ success: true, filename: outputFile, url: `${backendUrl}/outputs/${outputFile}`, scenes: clipPaths.length });

  } catch (err) {
    console.error('[Studio] ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── User Onboarding Answers ────────────────────────────────────────────────
router.get('/onboarding-answers', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.email, u.plan, u.created_at as joined,
             o.source, o.content_type, o.style, o.budget, o.created_at as answered_at
      FROM users u
      LEFT JOIN user_onboarding o ON o.user_id = u.id
      WHERE o.user_id IS NOT NULL
      ORDER BY o.created_at DESC
      LIMIT 500
    `);
    res.json({ answers: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Recharge Credits ──────────────────────────────────────────────────────────
// Model 1&2: reset/add weekly credits
router.post('/user/add-credits', adminAuth, async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'email and amount required' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const uid = rows[0].id;
    await pool.query(
      `INSERT INTO user_usage (user_id, credits_used) VALUES ($1, 0)
       ON CONFLICT (user_id) DO UPDATE
       SET credits_used = GREATEST(0, user_usage.credits_used - $2)`,
      [uid, parseInt(amount)]
    );
    res.json({ success: true, message: `Added ${amount} credits (M1&2) to ${email}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Model 3: recharge credit pool
router.post('/user/recharge-m3', adminAuth, async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'email and amount required' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const uid = rows[0].id;
    await pool.query(
      `INSERT INTO model3_credits (user_id, credits_total, credits_used) VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO UPDATE
       SET credits_total = model3_credits.credits_total + $2`,
      [uid, parseInt(amount)]
    );
    res.json({ success: true, message: `Added ${amount} credits (M3) to ${email}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Model 4: recharge credit pool
router.post('/user/recharge-m4', adminAuth, async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'email and amount required' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const uid = rows[0].id;
    await pool.query(
      `INSERT INTO model4_credits (user_id, credits_total, credits_used) VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO UPDATE
       SET credits_total = model4_credits.credits_total + $2`,
      [uid, parseInt(amount)]
    );
    res.json({ success: true, message: `Added ${amount} credits (M4) to ${email}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Model 5: recharge credit pool
router.post('/user/recharge-m5', adminAuth, async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'email and amount required' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const uid = rows[0].id;
    await pool.query(
      `INSERT INTO model5_credits (user_id, credits_total, credits_used) VALUES ($1, $2, 0)
       ON CONFLICT (user_id) DO UPDATE
       SET credits_total = model5_credits.credits_total + $2`,
      [uid, parseInt(amount)]
    );
    res.json({ success: true, message: `Added ${amount} credits (M5) to ${email}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Ban / Unban User ──────────────────────────────────────────────────────────
router.post('/user/ban', adminAuth, async (req, res) => {
  try {
    const { email, banned } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS banned INTEGER DEFAULT 0');
    await pool.query('UPDATE users SET banned = $1 WHERE email = $2', [banned ? 1 : 0, email]);
    res.json({ success: true, message: `User ${email} is now ${banned ? 'banned' : 'unbanned'}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Delete User ────────────────────────────────────────────────────────────────
router.post('/user/delete', adminAuth, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    // Get user id first
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const uid = rows[0].id;
    // Delete related data
    await pool.query('DELETE FROM user_usage WHERE user_id = $1', [uid]);
    await pool.query('DELETE FROM model3_usage WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM model4_usage WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM model5_usage WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM model3_credits WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM model4_credits WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM model5_credits WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM payment_requests WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM videos WHERE user_id = $1', [uid]).catch(() => {});
    await pool.query('DELETE FROM verification_codes WHERE email = $1', [email]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    res.json({ success: true, message: `User ${email} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Add Credits to User (Model 1&2) ───────────────────────────────────────────
router.post('/user/add-credits', adminAuth, async (req, res) => {
  try {
    const { email, amount } = req.body;
    if (!email || !amount) return res.status(400).json({ error: 'email and amount required' });
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const uid = rows[0].id;
    // Decrease credits_used (effectively adding credits back)
    await pool.query(
      `INSERT INTO user_usage (user_id, credits_used) VALUES ($1, 0)
       ON CONFLICT (user_id) DO UPDATE
       SET credits_used = GREATEST(0, user_usage.credits_used - $2)`,
      [uid, parseInt(amount)]
    );
    res.json({ success: true, message: `Added ${amount} credits to ${email}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;