import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'erivion_secret_2026';

// ✅ PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

export const PLANS = {
  free: {
    name: 'Free', price_monthly: 0, price_yearly: 0, credits_weekly: 1600, videos_weekly: 3,
    max_duration: '30s', watermark: true, captions: true, music: true, transitions: true,
    sound_effects: false, video_effects: false, edit_after_render: false, languages: ['en', 'ar'], all_languages: false,
  },
  pro: {
    name: 'Pro', price_monthly: 50, price_first_month: 25, price_yearly: 360, credits_weekly: 10000, videos_weekly: 5,
    max_duration: '2min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: false, video_effects: false, edit_after_render: true, languages: ['en', 'ar', 'de', 'fr'], all_languages: false,
  },
  plus: {
    name: 'Plus', price_monthly: 100, price_first_month: 75, price_yearly: 840, credits_weekly: 45000, videos_weekly: 8,
    max_duration: '5min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: true, video_effects: false, edit_after_render: true, languages: null, all_languages: true,
  },
  max: {
    name: 'Max', price_monthly: 250, price_first_month: 150, price_yearly: 1440, credits_weekly: 100000, videos_weekly: null,
    max_duration: '10min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: true, video_effects: true, edit_after_render: true, languages: null, all_languages: true,
  },
};

// ✅ Initialize tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      google_id TEXT,
      avatar TEXT,
      verified INTEGER DEFAULT 0,
      model3_access INTEGER DEFAULT 0,
      model3_plan TEXT DEFAULT NULL,
      plan TEXT DEFAULT 'free',
      plan_billing TEXT DEFAULT 'monthly',
      plan_expires_at TEXT,
      created_at TEXT DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS verification_codes (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      title TEXT,
      created_at TEXT DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      credits_used INTEGER DEFAULT 0,
      videos_this_week INTEGER DEFAULT 0,
      last_reset TEXT DEFAULT CURRENT_DATE,
      week_reset TEXT DEFAULT CURRENT_DATE
    );
    CREATE TABLE IF NOT EXISTS payment_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      user_email TEXT NOT NULL,
      plan TEXT NOT NULL,
      billing TEXT NOT NULL,
      amount INTEGER NOT NULL,
      screenshot_data TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS model3_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      videos_30s INTEGER DEFAULT 0,
      videos_1min INTEGER DEFAULT 0,
      videos_3min INTEGER DEFAULT 0,
      videos_5min INTEGER DEFAULT 0,
      last_reset TEXT DEFAULT CURRENT_DATE
    );
  `);
  console.log('[DB] PostgreSQL tables ready');
}

initDB().catch(err => console.error('[DB] Init error:', err.message));

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = (day + 1) % 7;
  const sat = new Date(now);
  sat.setDate(now.getDate() - diff);
  return sat.toISOString().split('T')[0];
}

async function checkPlanExpiry(userId) {
  const { rows } = await pool.query('SELECT id, email, plan, plan_billing, plan_expires_at FROM users WHERE id = $1', [userId]);
  const user = rows[0];
  if (!user || user.plan === 'free' || !user.plan_expires_at) return;
  if (new Date() > new Date(user.plan_expires_at)) {
    const oldPlan = user.plan;
    await pool.query("UPDATE users SET plan = 'free', plan_billing = 'monthly', plan_expires_at = NULL WHERE id = $1", [userId]);
    // ✅ بعت إيميل للمستخدم إن اشتراكه انتهى
    try {
      const planData = PLANS[oldPlan];
      const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: user.email,
          subject: `Your Erivion ${planData?.name || oldPlan} plan has expired`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px">
            <div style="text-align:center;margin-bottom:28px">
              <div style="font-size:56px;margin-bottom:12px">⏰</div>
              <h2 style="color:#f59e0b;font-size:22px;margin:0 0 8px">Your subscription has expired</h2>
              <p style="color:#9ca3af;font-size:14px;margin:0">Your ${planData?.name || oldPlan} plan has ended. You've been moved to the Free plan.</p>
            </div>
            <div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:24px">
              <p style="color:#d1d5db;font-size:14px;line-height:1.7;margin:0">
                To continue enjoying all features, renew your subscription and keep creating amazing videos with Erivion.
              </p>
            </div>
            <div style="text-align:center">
              <a href="${frontendUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Renew Subscription →</a>
            </div>
          </div>`,
        }),
      });
    } catch (e) {
      console.warn('[PlanExpiry] Email failed:', e.message);
    }
  }
}

async function checkAndResetUsage(userId) {
  await checkPlanExpiry(userId);
  const weekStart = getWeekStart();
  const { rows } = await pool.query('SELECT * FROM user_usage WHERE user_id = $1', [userId]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO user_usage (user_id, credits_used, videos_this_week, last_reset, week_reset) VALUES ($1, 0, 0, $2, $2)', [userId, weekStart]);
    return { credits_used: 0, videos_this_week: 0 };
  }
  const row = rows[0];
  if (row.week_reset !== weekStart) {
    await pool.query('UPDATE user_usage SET credits_used = 0, videos_this_week = 0, week_reset = $1, last_reset = $1 WHERE user_id = $2', [weekStart, userId]);
    return { credits_used: 0, videos_this_week: 0 };
  }
  return { credits_used: row.credits_used || 0, videos_this_week: row.videos_this_week || 0 };
}

export async function getUserById(userId) {
  const { rows } = await pool.query('SELECT id, email, name, avatar, plan, plan_billing, plan_expires_at, verified, model3_access, model3_plan, created_at FROM users WHERE id = $1', [userId]);
  return rows[0] || null;
}

export async function getUserCredits(userId) {
  const user = await getUserById(userId);
  const plan = PLANS[user?.plan || 'free'];
  const { credits_used, videos_this_week } = await checkAndResetUsage(userId);
  const weeklyLimit = plan.credits_weekly;
  const remaining = Math.max(0, weeklyLimit - credits_used);
  return {
    used: credits_used, remaining, limit: weeklyLimit,
    percentage: Math.round((credits_used / weeklyLimit) * 100),
    videos_this_week, videos_limit: plan.videos_weekly,
    plan: user?.plan || 'free', plan_data: plan,
  };
}

export async function addUserTokens(userId, tokensUsed) {
  await checkAndResetUsage(userId);
  await pool.query('UPDATE user_usage SET credits_used = credits_used + $1 WHERE user_id = $2', [tokensUsed, userId]);
}

export async function incrementVideoCount(userId) {
  await checkAndResetUsage(userId);
  await pool.query('UPDATE user_usage SET videos_this_week = videos_this_week + 1 WHERE user_id = $1', [userId]);
}

export async function canUserRender(userId) {
  const user = await getUserById(userId);
  const plan = PLANS[user?.plan || 'free'];
  const { credits_used, videos_this_week } = await checkAndResetUsage(userId);
  if (credits_used >= plan.credits_weekly) return { allowed: false, reason: 'credits_exhausted' };
  if (plan.videos_weekly !== null && videos_this_week >= plan.videos_weekly) return { allowed: false, reason: 'videos_limit_reached' };
  return { allowed: true };
}

async function sendVerificationEmail(email, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Erivion <noreply@erivion.net>',
      to: email,
      subject: 'Your Erivion verification code',
      html: `<div style="font-family:sans-serif;max-width:400px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#7c6af7">Erivion</h2><p>Your verification code is:</p><div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#7c6af7;margin:24px 0">${code}</div><p style="color:#888;font-size:13px">This code expires in 10 minutes.</p></div>`,
    }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error('Email send failed: ' + (err.message || JSON.stringify(err))); }
}

export async function sendPaymentRequestEmail(paymentData) {
  const { userEmail, plan, billing, amount, screenshotBase64 } = paymentData;
  const planData = PLANS[plan];
  const billingLabel = billing === 'yearly' ? 'Yearly' : 'Monthly';
  const backendUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app';
  const attachments = [];
  if (screenshotBase64) {
    const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const ext = screenshotBase64.includes('png') ? 'png' : 'jpg';
    attachments.push({ filename: `payment_${userEmail}_${Date.now()}.${ext}`, content: base64Data });
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Erivion Payments <noreply@erivion.net>',
      to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
      subject: `💰 Payment Request - ${planData.name} Plan - ${userEmail}`,
      html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#7c6af7">💰 New Payment Request</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">User Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#7c6af7;font-weight:700">${planData.name}</td></tr><tr><td style="color:#888;padding:8px 0">Billing</td><td style="color:#fff">${billingLabel}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr></table><p style="color:#888;font-size:13px">Please verify and approve or reject below.</p><div style="margin-top:24px;display:flex;gap:12px"><a href="${backendUrl}/api/auth/admin/approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&billing=${billing}&secret=${process.env.ADMIN_SECRET || ''}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a> <a href="${backendUrl}/api/auth/admin/reject?email=${encodeURIComponent(userEmail)}&secret=${process.env.ADMIN_SECRET || ''}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`,
      attachments: attachments.length > 0 ? attachments : undefined,
    }),
  });
  if (!res.ok) { const err = await res.json(); throw new Error('Payment email failed: ' + (err.message || JSON.stringify(err))); }
}

export async function activateUserPlan(email, plan, billing = 'monthly') {
  const expiresAt = new Date();
  if (billing === 'yearly') expiresAt.setFullYear(expiresAt.getFullYear() + 1);
  else expiresAt.setMonth(expiresAt.getMonth() + 1);
  await pool.query('UPDATE users SET plan = $1, plan_billing = $2, plan_expires_at = $3 WHERE email = $4', [plan, billing, expiresAt.toISOString(), email]);
  return { success: true, plan, expires_at: expiresAt.toISOString() };
}

export async function createPaymentRequest(userId, userEmail, plan, billing, amount, screenshotData) {
  const { rows } = await pool.query('INSERT INTO payment_requests (user_id, user_email, plan, billing, amount, screenshot_data, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [userId, userEmail, plan, billing, amount, screenshotData || null, 'pending']);
  return rows[0].id;
}

export async function signUp(email, password) {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length > 0) throw new Error('Email already registered');
  const hashed = await bcrypt.hash(password, 10);
  const code = generateCode();
  const expires = Date.now() + 10 * 60 * 1000;
  await pool.query('INSERT INTO users (email, password, plan) VALUES ($1, $2, $3)', [email, hashed, 'free']);
  await pool.query('DELETE FROM verification_codes WHERE email = $1', [email]);
  await pool.query('INSERT INTO verification_codes (email, code, expires_at) VALUES ($1, $2, $3)', [email, code, expires]);
  await sendVerificationEmail(email, code);
  return { message: 'Verification code sent' };
}

export async function verifyCode(email, code) {
  const { rows } = await pool.query('SELECT * FROM verification_codes WHERE email = $1 AND code = $2', [email, code.toUpperCase()]);
  if (rows.length === 0) throw new Error('Invalid code');
  if (Date.now() > rows[0].expires_at) throw new Error('Code expired');
  await pool.query('UPDATE users SET verified = 1 WHERE email = $1', [email]);
  await pool.query('DELETE FROM verification_codes WHERE email = $1', [email]);
  const { rows: users } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = users[0];
  await checkAndResetUsage(user.id);
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  return { token, email, plan: user.plan || 'free', isNewUser: true };
}

export async function login(email, password) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) throw new Error('Invalid email or password');
  const user = rows[0];
  if (!user.verified) throw new Error('Please verify your email first');
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error('Invalid email or password');
  await checkAndResetUsage(user.id);
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  return { token, email, plan: user.plan || 'free', isNewUser: false };
}

export async function loginOrCreateGoogleUser({ googleId, email, name, avatar }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  let user = rows[0];
  if (user) {
    if (!user.google_id) {
      await pool.query('UPDATE users SET google_id = $1, avatar = $2, verified = 1 WHERE id = $3', [googleId, avatar, user.id]);
    }
  } else {
    await pool.query('INSERT INTO users (email, password, name, google_id, avatar, verified, plan) VALUES ($1, $2, $3, $4, $5, 1, $6)', [email, 'GOOGLE_AUTH_NO_PASSWORD', name || email.split('@')[0], googleId, avatar || null, 'free']);
    const { rows: newRows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    user = newRows[0];
  }
  await checkAndResetUsage(user.id);
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  return { token, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan || 'free', isNewUser: false };
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function saveVideo(userId, filename, title) {
  await pool.query('INSERT INTO videos (user_id, filename, title) VALUES ($1, $2, $3)', [userId, filename, title || filename]);
}

export async function getUserVideos(userId) {
  const { rows } = await pool.query('SELECT * FROM videos WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows;
}

// ── Model 3 Usage Tracking ─────────────────────────────────────────────────
export const MODEL3_PLAN_QUOTAS = {
  m3_starter: { '30s': 5,  '1min': 10, '3min': 0,  '5min': 0  },
  m3_pro:     { '30s': 5,  '1min': 5,  '3min': 10, '5min': 0  },
  m3_max:     { '30s': 0,  '1min': 5,  '3min': 5,  '5min': 10 },
};

export async function getModel3Usage(userId) {
  const { rows } = await pool.query('SELECT * FROM model3_usage WHERE user_id = $1', [userId]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO model3_usage (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    return { videos_30s: 0, videos_1min: 0, videos_3min: 0, videos_5min: 0 };
  }
  return rows[0];
}

export async function incrementModel3Video(userId, duration) {
  const col = duration === '30s' ? 'videos_30s' : duration === '1min' ? 'videos_1min' : duration === '3min' ? 'videos_3min' : 'videos_5min';
  await pool.query(`INSERT INTO model3_usage (user_id, ${col}) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET ${col} = model3_usage.${col} + 1`, [userId]);
}

export async function canUserMakeModel3Video(userId, duration) {
  const user = await getUserById(userId);
  const plan = user?.model3_plan || 'm3_starter';
  const quotas = MODEL3_PLAN_QUOTAS[plan] || MODEL3_PLAN_QUOTAS.m3_starter;
  const quota = quotas[duration] || 0;
  if (quota === 0) return { allowed: false, reason: 'plan_not_support', quota: 0, used: 0 };
  const usage = await getModel3Usage(userId);
  const col = duration === '30s' ? 'videos_30s' : duration === '1min' ? 'videos_1min' : duration === '3min' ? 'videos_3min' : 'videos_5min';
  const used = usage[col] || 0;
  if (used >= quota) return { allowed: false, reason: 'quota_exceeded', quota, used };
  return { allowed: true, quota, used, remaining: quota - used };
}

export async function getAllPaymentRequests(status = null) {
  if (status) {
    const { rows } = await pool.query('SELECT * FROM payment_requests WHERE status = $1 ORDER BY created_at DESC', [status]);
    return rows;
  }
  const { rows } = await pool.query('SELECT * FROM payment_requests ORDER BY created_at DESC');
  return rows;
}
