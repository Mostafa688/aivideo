import express from 'express';
import fetch from 'node-fetch';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
const { Pool } = pkg;
import {
  signUp, verifyCode, login, verifyToken,
  getUserVideos, saveVideo, getUserCredits, getUserById,
  createPaymentRequest, sendPaymentRequestEmail, activateUserPlan,
  getLatestPaymentRequestForUser, markLatestPaymentRequestRejected,
  loginOrCreateGoogleUser, PLANS,
  getModel3Usage, canUserMakeModel3Video, MODEL3_PLAN_QUOTAS, MODEL3_PLAN_CREDITS,
  getModel3Credits, addModel3Credits,
  getModel4Usage, MODEL4_PLANS, getModel4Credits, addModel4Credits,
  getModel5Usage, MODEL5_PLANS, getModel5Credits, addModel5Credits,
  resetModel3Usage, resetModel4Usage, resetModel5Usage,
  EGP_PER_CREDIT, CREDITS_PACKAGES, getCreditsBalance, approveCreditsPayment,
  generateApiKey, listApiKeys, revokeApiKey,
} from './authService.js';
import { trackAffiliateSignup, trackAffiliatePayment } from './affiliateRoutes.js';

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(auth.slice(7));
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  // Check if user is banned
  pool.query('SELECT COALESCE(banned, 0) as banned FROM users WHERE id = $1', [req.user.userId])
    .then(({ rows }) => {
      if (rows[0]?.banned == 1) {
        return res.status(403).json({ error: 'account_banned', message: 'Your account has been suspended. Contact support.' });
      }
      next();
    })
    .catch(() => next()); // on DB error, allow through
}

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const result = await signUp(email, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/verify', async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
  try {
    const result = await verifyCode(email, code);
    // ── Affiliate tracking: لما حد يكمّل التسجيل ─────────────────────────
    if (result?.userId) {
      const refCode = req.body.ref_code || null;
      if (refCode) {
        trackAffiliateSignup(result.userId, email, refCode).catch(() => {});
      }
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const result = await login(email, password);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    const now = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: true });
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion Visitors <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `🔐 User Login — ${email}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:28px;background:#0f0f1a;color:#fff;border-radius:12px"><h3 style="color:#7c6af7;margin:0 0 16px">🔐 User Logged In</h3><table style="width:100%;border-collapse:collapse"><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Email</td><td style="color:#fff;font-weight:700;font-size:14px">${email}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Plan</td><td style="color:#7c6af7;font-weight:600;font-size:13px">${result.plan || 'free'}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Time (Cairo)</td><td style="color:#9ca3af;font-size:13px">${now}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">IP</td><td style="color:#9ca3af;font-size:13px">${ip}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Method</td><td style="color:#9ca3af;font-size:13px">Email & Password</td></tr></table></div>`,
      }),
    }).catch(() => {});
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL;
  const scope = 'openid email profile';
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=select_account`;
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app';
  if (error || !code) return res.redirect(`${frontendUrl}?auth_error=google_cancelled`);
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token received');
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const googleUser = await userRes.json();
    if (!googleUser.email) throw new Error('Could not get user email from Google');
    const authData = await loginOrCreateGoogleUser({ googleId: googleUser.id, email: googleUser.email, name: googleUser.name, avatar: googleUser.picture });
    // ── Affiliate tracking للـ Google signup ─────────────────────────────
    if (authData?.isNew && authData?.userId) {
      const refCode = req.query.state || null;
      if (refCode) {
        trackAffiliateSignup(authData.userId, authData.email, refCode).catch(() => {});
      }
    }
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    const now = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: true });
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion Visitors <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `🔐 User Login — ${authData.email}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:28px;background:#0f0f1a;color:#fff;border-radius:12px"><h3 style="color:#7c6af7;margin:0 0 16px">🔐 User Logged In</h3><table style="width:100%;border-collapse:collapse"><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Email</td><td style="color:#fff;font-weight:700;font-size:14px">${authData.email}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Name</td><td style="color:#d1d5db;font-size:13px">${authData.name || '—'}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Plan</td><td style="color:#7c6af7;font-weight:600;font-size:13px">${authData.plan || 'free'}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Time (Cairo)</td><td style="color:#9ca3af;font-size:13px">${now}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">IP</td><td style="color:#9ca3af;font-size:13px">${ip}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:13px">Method</td><td style="color:#9ca3af;font-size:13px">Google OAuth</td></tr></table></div>`,
      }),
    }).catch(() => {});
    res.redirect(`${frontendUrl}?google_token=${authData.token}&email=${encodeURIComponent(authData.email)}&plan=${authData.plan}&name=${encodeURIComponent(authData.name || '')}&avatar=${encodeURIComponent(authData.avatar || '')}`);
  } catch (err) {
    console.error('[Google OAuth] Error:', err.message);
    res.redirect(`${frontendUrl}?auth_error=${encodeURIComponent(err.message)}`);
  }
});

router.get('/videos', authMiddleware, async (req, res) => {
  const videos = await getUserVideos(req.user.userId);
  res.json({ videos });
});

router.get('/videos/debug/add-test', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'INSERT INTO videos (user_id, filename, title) VALUES ($1, $2, $3) RETURNING *',
      [req.user.userId, 'test_video.mp4', 'Test Video']
    );
    const video = {
      ...rows[0],
      ratio: '16:9',
      duration: '1:30',
      file_size: 5242880,
    };
    res.json({ video });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/save-video', authMiddleware, async (req, res) => {
  const { filename, title } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });
  try {
    await saveVideo(req.user.userId, filename, title);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    const balance = await getCreditsBalance(req.user.userId);
    res.json({
      plan: user?.plan || 'free',
      credits_balance: balance,
      avatar: user?.avatar || null,
      user_name: user?.name || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payment/request', authMiddleware, async (req, res) => {
  try {
    const { plan, billing, amount, screenshot } = req.body;
    if (!plan || !billing || !amount) return res.status(400).json({ error: 'Missing required fields' });
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const requestId = await createPaymentRequest(req.user.userId, user.email, plan, billing, amount, screenshot || null);
    await sendPaymentRequestEmail({ userEmail: user.email, plan, billing, amount, screenshotBase64: screenshot });
    res.json({ success: true, requestId });
  } catch (e) {
    console.error('[Payment] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/payment/status', authMiddleware, async (req, res) => {
  try {
    const latestRequest = await getLatestPaymentRequestForUser(req.user.userId);
    res.json({ request: latestRequest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// نظام الكريديت الموحد — رصيد واحد مشترك بين كل الموديلات
// ═══════════════════════════════════════════════════════════════════════════

router.get('/credits/balance', authMiddleware, async (req, res) => {
  try {
    const balance = await getCreditsBalance(req.user.userId);
    res.json({ balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── مصري: شحن كريديت مرن بالسلايدر + InstaPay + إيصال ─────────────────────
router.post('/credits/eg-request', authMiddleware, async (req, res) => {
  try {
    const { credits, screenshot } = req.body;
    const creditsNum = parseInt(credits, 10);
    if (!creditsNum || creditsNum < 100) return res.status(400).json({ error: 'Minimum 100 credits required' });
    if (!screenshot) return res.status(400).json({ error: 'Payment screenshot required' });
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const amountEgp = Math.round(creditsNum * EGP_PER_CREDIT);
    const requestId = await createPaymentRequest(req.user.userId, user.email, 'credits_custom', 'onetime', amountEgp, screenshot, creditsNum);

    const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://erivion.net';
    const adminSecret = process.env.ADMIN_SECRET || '';
    const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
    const ext = screenshot.includes('png') ? 'png' : 'jpg';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `💳 Credits Top-up — ${creditsNum} credits — ${user.email}`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
          <h2 style="color:#7c6af7">💳 New Credits Purchase (Egypt)</h2>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff;font-weight:600">${user.email}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Credits</td><td style="color:#7c6af7;font-weight:700">${creditsNum.toLocaleString()}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amountEgp} EGP</td></tr>
          </table>
          <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">
            <a href="${backendUrl}/api/auth/admin/approve?email=${encodeURIComponent(user.email)}&plan=credits_custom&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a>
            <a href="${backendUrl}/api/auth/admin/reject?email=${encodeURIComponent(user.email)}&plan=credits_custom&reason=incomplete_amount&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px">❌ Reject: Amount</a>
            <a href="${backendUrl}/api/auth/admin/reject?email=${encodeURIComponent(user.email)}&plan=credits_custom&reason=wrong_receipt&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px">❌ Reject: Receipt</a>
            <a href="${backendUrl}/api/auth/admin/reject?email=${encodeURIComponent(user.email)}&plan=credits_custom&reason=other&secret=${adminSecret}" style="background:#7f1d1d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px">❌ Reject: Other</a>
          </div>
        </div>`,
        attachments: [{ filename: `credits_payment_${user.email}_${Date.now()}.${ext}`, content: base64Data }],
      }),
    });
    res.json({ success: true, requestId, amountEgp, credits: creditsNum });
  } catch (e) {
    console.error('[Credits EG Request]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── دولي: باقة ثابتة عبر Gumroad — العميل يدفع هناك ثم يبلغنا هنا ─────────
router.post('/credits/intl-request', authMiddleware, async (req, res) => {
  try {
    const { packageKey } = req.body;
    const pkg = CREDITS_PACKAGES[packageKey];
    if (!pkg) return res.status(400).json({ error: 'Invalid package' });
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const requestId = await createPaymentRequest(req.user.userId, user.email, packageKey, 'onetime', pkg.usd, null, pkg.credits);

    const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://erivion.net';
    const adminSecret = process.env.ADMIN_SECRET || '';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `🌐 Credits Package (Gumroad) — ${pkg.name} — ${user.email}`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
          <h2 style="color:#22c55e">🌐 New International Credits Purchase</h2>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff;font-weight:600">${user.email}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Package</td><td style="color:#f59e0b;font-weight:700">${pkg.name} (${pkg.credits.toLocaleString()} credits)</td></tr>
            <tr><td style="color:#888;padding:8px 0">Price</td><td style="color:#22c55e;font-weight:700">$${pkg.usd} USD</td></tr>
            <tr><td style="color:#888;padding:8px 0">Payment</td><td style="color:#86efac">Gumroad (verify on dashboard)</td></tr>
          </table>
          <p style="color:#9ca3af;font-size:13px">Please check your Gumroad dashboard to verify payment, then approve or reject:</p>
          <div style="margin-top:20px;display:flex;gap:12px">
            <a href="${backendUrl}/api/auth/intl-approve?email=${encodeURIComponent(user.email)}&plan=${packageKey}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a>
            <a href="${backendUrl}/api/auth/intl-reject?email=${encodeURIComponent(user.email)}&plan=${packageKey}&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a>
          </div>
        </div>`,
      }),
    });

    // إيميل تأكيد للعميل
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: user.email,
        subject: `⏳ We received your ${pkg.name} purchase request`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#7c6af7">⏳ Request Received</h2><p style="color:#9ca3af;font-size:14px;line-height:1.7">We'll verify your Gumroad payment for <strong style="color:#22c55e">${pkg.name} (${pkg.credits.toLocaleString()} credits)</strong> and add your credits within 24 hours.</p></div>`,
      }),
    }).catch(() => {});

    res.json({ success: true, requestId });
  } catch (e) {
    console.error('[Credits Intl Request]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── أسعار الباقات للـ affiliate ───────────────────────────────────────────
const PLAN_PRICES    = { pro: 100, plus: 220, max: 550 };
const MODEL3_PRICES  = { m3_starter: 450, m3_pro: 1100, m3_max: 2000 };
const MODEL4_PRICES  = { m4_plan1: 600, m4_plan2: 1000, m4_plan3: 2800, m4_starter: 600, m4_creator: 1000, m4_pro: 2800 };
const MODEL5_PRICES = { mc_starter: 550, mc_pro: 1050, mc_max: 2200 };
router.get('/admin/approve', async (req, res) => {
  const { email, plan, billing, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (!email || !plan) return res.status(400).send('Missing fields');

  // ✅ نظام الكريديت الموحد — لو الطلب ده شحن كريديت (مصري بالسلايدر) بدل خطة أسبوعية
  if (plan === 'credits_custom' || plan.startsWith('credits_')) {
    try {
      const result = await approveCreditsPayment(email, plan);
      // ✅ FIX: تتبع عمولة المسوق كان مفقود تماماً لنظام الكريديت الموحد (المسار الأساسي دلوقتي)
      try {
        const amountEgp = Math.round(result.creditsAdded * EGP_PER_CREDIT);
        if (amountEgp > 0) trackAffiliatePayment(result.userId, email, plan, amountEgp).catch(() => {});
      } catch {}
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: email,
          subject: `🎉 ${result.creditsAdded.toLocaleString()} credits added to your account!`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center"><div style="font-size:56px;margin-bottom:12px">🎉</div><h2 style="color:#22c55e;font-size:22px;margin:0 0 8px">Credits Added!</h2><p style="color:#9ca3af;font-size:14px">Your new balance: <strong style="color:#7c6af7">${result.newBalance.toLocaleString()} credits</strong></p><a href="${process.env.FRONTEND_URL || 'https://erivion.net'}" style="display:inline-block;margin-top:20px;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700">Start Creating →</a></div></div>`,
        }),
      }).catch(() => {});
      return res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">✅</div><h2 style="color:#22c55e">Credits Added!</h2><p style="color:#9ca3af">${email}</p><p style="color:#7c6af7;font-weight:700;font-size:18px">+${result.creditsAdded.toLocaleString()} credits (balance: ${result.newBalance.toLocaleString()})</p></div></body></html>`);
    } catch (e) {
      return res.status(500).send('Error: ' + e.message);
    }
  }

  try {
    const result = await activateUserPlan(email, plan, billing || 'monthly');
    const planData = PLANS[plan];
    const planName = planData?.name || plan;
    const expiresFormatted = new Date(result.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const frontendUrl = process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app';

    // ── Affiliate payment tracking ─────────────────────────────────────
    try {
      const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRow.rows.length > 0) {
        const amountEgp = PLAN_PRICES[plan] || 0;
        if (amountEgp > 0) trackAffiliatePayment(userRow.rows[0].id, email, plan, amountEgp).catch(() => {});
      }
    } catch {}

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: email,
          subject: `🎉 Your ${planName} plan is now active!`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">🎉</div><h2 style="color:#22c55e;font-size:22px;margin:0 0 8px">Payment Approved!</h2><p style="color:#9ca3af;font-size:14px;margin:0">Your subscription has been activated</p></div><div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:24px"><table style="width:100%;border-collapse:collapse"><tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Plan</td><td style="color:#7c6af7;font-weight:700;font-size:16px;text-align:right">${planName}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Expires</td><td style="color:#fff;text-align:right;font-size:14px">${expiresFormatted}</td></tr><tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Credits / week</td><td style="color:#22c55e;font-weight:700;text-align:right;font-size:14px">${(planData?.credits_weekly || 0).toLocaleString()}</td></tr></table></div><div style="text-align:center"><a href="${frontendUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Start Creating Videos →</a></div></div>`,
        }),
      });
    } catch (mailErr) {
      console.error('[Approve] Email error:', mailErr.message);
    }
    res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">✅</div><h2 style="color:#22c55e;margin-bottom:8px">Plan Activated!</h2><p style="color:#9ca3af">${email}</p><p style="color:#7c6af7;font-weight:700;font-size:18px">${plan.toUpperCase()}</p><p style="color:#6b7280;font-size:13px">Expires: ${expiresFormatted}</p></div></body></html>`);
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ── أسباب الرفض الجاهزة — بتتحط في الإيميل اللي يوصل للعميل ──────────────
const REJECTION_REASONS = {
  incomplete_amount: 'The amount transferred does not match the credits/plan requested.',
  wrong_receipt: 'The payment receipt/screenshot could not be verified — it may be unclear, invalid, or for a different transaction.',
  duplicate: 'This request appears to be a duplicate of an already-processed request.',
  other: 'We were unable to verify your payment.',
};

router.get('/admin/reject', async (req, res) => {
  const { email, plan, billing, amount, secret, reason } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  const reasonText = REJECTION_REASONS[reason] || REJECTION_REASONS.other;
  if (email) {
    try { await markLatestPaymentRequestRejected(email); } catch (dbErr) { console.error('[Reject] DB error:', dbErr.message); }
  }
  if (email) {
    try {
      const planData = PLANS[plan] || null;
      const planName = planData?.name || plan || 'your selected plan';
      const billingLabel = billing === 'yearly' ? 'Yearly' : 'Monthly';
      const amountText = amount ? `${amount} EGP` : '';
      const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: email,
          subject: `Regarding your ${planName} subscription request`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">⚠️</div><h2 style="color:#f59e0b;font-size:22px;margin:0 0 8px">Subscription Request Update</h2><p style="color:#9ca3af;font-size:14px;margin:0">We were unable to approve your request</p></div><div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:20px"><table style="width:100%;border-collapse:collapse">${planName ? `<tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Plan Requested</td><td style="color:#7c6af7;font-weight:700;text-align:right">${planName}${billing ? ' · ' + billingLabel : ''}</td></tr>` : ''}${amountText ? `<tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Amount</td><td style="color:#fff;font-weight:600;text-align:right">${amountText}</td></tr>` : ''}<tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Status</td><td style="color:#ef4444;font-weight:700;text-align:right">Not Approved</td></tr></table></div><div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:14px 16px;margin-bottom:20px"><p style="color:#fca5a5;font-size:13px;margin:0"><strong>Reason:</strong> ${reasonText}</p></div><div style="text-align:center"><a href="${frontendUrl}/pricing" style="display:inline-block;background:#7c6af7;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Try Again →</a></div></div>`,
        }),
      });
    } catch (mailErr) {
      console.error('[Reject] Email error:', mailErr.message);
    }
  }
  res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">❌</div><h2 style="color:#ef4444;margin-bottom:8px">Request Rejected</h2><p style="color:#9ca3af">${email || 'Unknown user'}</p><p style="color:#6b7280;font-size:13px;margin-top:8px">Reason sent: ${reasonText}</p></div></body></html>`);
});

router.post('/support', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!email || !message) return res.status(400).json({ error: 'Email and message required' });
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion Support <noreply@erivion.net>',
        to: 'digidelight33@gmail.com',
        subject: `Support Request from ${name || email}`,
        html: `<div style="font-family:sans-serif;padding:24px;background:#0f0f1a;color:#fff"><h3 style="color:#7c6af7">New Support Message</h3><p><b>From:</b> ${name || 'Unknown'} (${email})</p><p><b>Message:</b></p><p style="white-space:pre-wrap;color:#ccc">${message}</p></div>`,
        reply_to: email,
      }),
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Support]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/intl-payment/request', authMiddleware, async (req, res) => {
  try {
    const { planKey, planName, usdPrice } = req.body;
    if (!planKey || !planName) return res.status(400).json({ error: 'Missing fields' });
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || 'https://erivion.net';
    const adminSecret = process.env.ADMIN_SECRET || '';

    // Email to admin
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: 'digidelight33@gmail.com',
        subject: `🌐 New International Payment Request — ${planName}`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
          <h2 style="color:#22c55e">🌐 International Payment Request</h2>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="color:#888;padding:8px 0">User Email</td><td style="color:#fff;font-weight:600">${user.email}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#f59e0b;font-weight:700">${planName}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Price</td><td style="color:#22c55e;font-weight:700">$${usdPrice} USD</td></tr>
            <tr><td style="color:#888;padding:8px 0">Payment</td><td style="color:#86efac">Gumroad (verify on dashboard)</td></tr>
          </table>
          <p style="color:#9ca3af;font-size:13px">Please check your Gumroad dashboard to verify payment, then approve or reject:</p>
          <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap">
            <a href="${backendUrl}/api/auth/intl-approve?email=${encodeURIComponent(user.email)}&plan=${planKey}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a>
            <a href="${backendUrl}/api/auth/intl-reject?email=${encodeURIComponent(user.email)}&plan=${planKey}&reason=incomplete_amount&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px">❌ Reject: Amount</a>
            <a href="${backendUrl}/api/auth/intl-reject?email=${encodeURIComponent(user.email)}&plan=${planKey}&reason=other&secret=${adminSecret}" style="background:#7f1d1d;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px">❌ Reject: Other</a>
          </div>
        </div>`,
      }),
    });

    // Email to user
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: user.email,
        subject: `⏳ Your ${planName} request is under review`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px">
          <div style="text-align:center;margin-bottom:28px">
            <div style="font-size:56px;margin-bottom:12px">⏳</div>
            <h2 style="color:#f59e0b;font-size:22px;margin:0 0 8px">Payment Under Review</h2>
            <p style="color:#9ca3af;font-size:14px;margin:0">We received your subscription request</p>
          </div>
          <div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:24px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Plan</td><td style="color:#f59e0b;font-weight:700;text-align:right">${planName}</td></tr>
              <tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Amount</td><td style="color:#22c55e;font-weight:700;text-align:right">$${usdPrice} USD</td></tr>
              <tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Status</td><td style="color:#f59e0b;font-weight:700;text-align:right">Under Review</td></tr>
            </table>
          </div>
          <p style="color:#9ca3af;font-size:13px;text-align:center">We'll verify your Gumroad payment and send you a confirmation email within <strong style="color:#fff">24 hours</strong>.</p>
        </div>`,
      }),
    });

    res.json({ success: true });
  } catch(e) {
    console.error('[IntlPayment]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/intl-approve', async (req, res) => {
  const { email, plan, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (!email || !plan) return res.status(400).send('Missing fields');

  // ✅ نظام الكريديت الموحد — باقة دولية ثابتة عبر Gumroad
  if (plan.startsWith('credits_')) {
    try {
      const result = await approveCreditsPayment(email, plan);
      // ✅ FIX: تتبع عمولة المسوق كان مفقود تماماً لنظام الكريديت الموحد (المسار الأساسي دلوقتي)
      try {
        const amountEgp = Math.round(result.creditsAdded * EGP_PER_CREDIT);
        if (amountEgp > 0) trackAffiliatePayment(result.userId, email, plan, amountEgp).catch(() => {});
      } catch {}
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: email,
          subject: `🎉 ${result.creditsAdded.toLocaleString()} credits added to your account!`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center"><div style="font-size:56px;margin-bottom:12px">🎉</div><h2 style="color:#22c55e;font-size:22px;margin:0 0 8px">Credits Added!</h2><p style="color:#9ca3af;font-size:14px">Your new balance: <strong style="color:#7c6af7">${result.newBalance.toLocaleString()} credits</strong></p><a href="${process.env.FRONTEND_URL || 'https://erivion.net'}" style="display:inline-block;margin-top:20px;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700">Start Creating →</a></div></div>`,
        }),
      }).catch(() => {});
      return res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">✅</div><h2 style="color:#22c55e">Credits Added!</h2><p style="color:#9ca3af">${email}</p><p style="color:#7c6af7;font-weight:700;font-size:18px">+${result.creditsAdded.toLocaleString()} credits (balance: ${result.newBalance.toLocaleString()})</p></div></body></html>`);
    } catch (e) {
      return res.status(500).send('Error: ' + e.message);
    }
  }

  try {
    await activateUserPlan(email, plan, 'monthly');
    // Reset usage for M3/M4/M5 plans
    try {
      const uRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (uRow.rows.length > 0) {
        const uid = uRow.rows[0].id;
        if (plan.startsWith('m3_')) { await pool.query('UPDATE users SET model3_access = 1, model3_plan = $1 WHERE id = $2', [plan, uid]); await resetModel3Usage(uid); }
        else if (plan.startsWith('m4_')) { await pool.query('UPDATE users SET model4_access = 1, model4_plan = $1 WHERE id = $2', [plan, uid]); await resetModel4Usage(uid); }
        else if (plan.startsWith('mc_')) { await pool.query('UPDATE users SET model5_access = 1, model5_plan = $1 WHERE id = $2', [plan, uid]); await resetModel5Usage(uid); }
      }
    } catch(re) { console.error('[IntlApprove] Reset error:', re.message); }
    const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: email,
        subject: `🎉 Your plan is now active!`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">🎉</div><h2 style="color:#22c55e;font-size:22px;margin:0 0 8px">Payment Approved!</h2><p style="color:#9ca3af;font-size:14px;margin:0">Your international subscription has been activated</p></div><div style="text-align:center"><a href="${frontendUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Start Creating Videos →</a></div></div>`,
      }),
    });
    res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">✅</div><h2 style="color:#22c55e">International Plan Activated!</h2><p style="color:#9ca3af">${email}</p><p style="color:#7c6af7;font-weight:700;font-size:18px">${plan.toUpperCase()}</p></div></body></html>`);
  } catch(e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/intl-reject', async (req, res) => {
  const { email, plan, secret, reason } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  const reasonText = REJECTION_REASONS[reason] || REJECTION_REASONS.other;
  if (email) {
    try { await markLatestPaymentRequestRejected(email); } catch (dbErr) { console.error('[IntlReject] DB error:', dbErr.message); }
  }
  if (email) {
    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: email,
          subject: `Regarding your subscription request`,
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">⚠️</div><h2 style="color:#f59e0b;font-size:22px;margin:0 0 8px">Payment Not Verified</h2><p style="color:#9ca3af;font-size:14px;margin:0">We could not verify your Gumroad payment</p></div><div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:10px;padding:14px 16px;margin-bottom:20px"><p style="color:#fca5a5;font-size:13px;margin:0"><strong>Reason:</strong> ${reasonText}</p></div><div style="text-align:center"><a href="${frontendUrl}/pricing" style="display:inline-block;background:#7c6af7;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Try Again →</a></div></div>`,
        }),
      });
    } catch(e) { console.error('[IntlReject]', e.message); }
  }
  res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">❌</div><h2 style="color:#ef4444">Request Rejected</h2><p style="color:#9ca3af">${email || ''}</p><p style="color:#6b7280;font-size:13px;margin-top:8px">Reason sent: ${reasonText}</p></div></body></html>`);
});

router.post('/gumroad-ping', async (req, res) => {
  try {
    const data = req.body;
    const sellerEmail = data?.email || data?.buyer_email || '';
    const productPermalink = data?.product_permalink || '';
    const refunded = data?.refunded === 'true' || data?.refunded === true;
    const subscriptionCancelled = data?.subscription_cancelled === 'true' || data?.subscription_cancelled === true;
    const subscriptionEnded = data?.subscription_ended === 'true' || data?.subscription_ended === true;

    console.log('[Gumroad Ping]', JSON.stringify(data));

    // Map Gumroad product permalink to plan key
    const PERMALINK_TO_PLAN = {
      sesmk: 'pro',
      skpwha: 'plus',
      kmiguq: 'max',
      osibu: 'm3_starter',
      zfdge: 'm3_pro',
      fgydww: 'm3_max',
      hqsejc: 'm4_plan1',
      ckvlgo: 'm4_plan2',
      vmzubx: 'm4_plan3',
      dnkam: 'mc_starter',
    };

    const planKey = PERMALINK_TO_PLAN[productPermalink];

    // Cancellation or refund → downgrade to free
    if ((subscriptionCancelled || subscriptionEnded || refunded) && sellerEmail) {
      try {
        await pool.query(
          'UPDATE users SET plan = $1, plan_expires_at = NULL WHERE email = $2',
          ['free', sellerEmail]
        );
        console.log(`[Gumroad] Downgraded ${sellerEmail} to free`);

        // Email to user
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Erivion <noreply@erivion.net>',
            to: sellerEmail,
            subject: 'Your Erivion subscription has ended',
            html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">👋</div><h2 style="color:#f59e0b;font-size:22px;margin:0 0 8px">Subscription Ended</h2><p style="color:#9ca3af;font-size:14px;margin:0">Your plan has been downgraded to Free</p></div><p style="color:#9ca3af;font-size:13px;text-align:center">You can resubscribe anytime from the <a href="${process.env.FRONTEND_URL || 'https://erivion.net'}/pricing" style="color:#7c6af7">pricing page</a>.</p></div>`,
          }),
        });
      } catch(e) { console.error('[Gumroad Ping] Downgrade error:', e.message); }
      return res.json({ ok: true });
    }

    // New sale → activate plan
    if (planKey && sellerEmail && !refunded) {
      try {
        await activateUserPlan(sellerEmail, planKey, 'monthly');
        console.log(`[Gumroad] Activated ${planKey} for ${sellerEmail}`);
        // Reset usage for M3/M4/M5 plans
        try {
          const uRow = await pool.query('SELECT id FROM users WHERE email = $1', [sellerEmail]);
          if (uRow.rows.length > 0) {
            const uid = uRow.rows[0].id;
            if (planKey.startsWith('m3_')) { await pool.query('UPDATE users SET model3_access = 1, model3_plan = $1 WHERE id = $2', [planKey, uid]); await resetModel3Usage(uid); }
            else if (planKey.startsWith('m4_')) { await pool.query('UPDATE users SET model4_access = 1, model4_plan = $1 WHERE id = $2', [planKey, uid]); await resetModel4Usage(uid); }
            else if (planKey.startsWith('mc_')) { await pool.query('UPDATE users SET model5_access = 1, model5_plan = $1 WHERE id = $2', [planKey, uid]); await resetModel5Usage(uid); }
          }
        } catch(re) { console.error('[GumroadPing] Reset error:', re.message); }

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Erivion <noreply@erivion.net>',
            to: sellerEmail,
            subject: '🎉 Your Erivion plan is now active!',
            html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">🎉</div><h2 style="color:#22c55e;font-size:22px;margin:0 0 8px">Plan Activated!</h2><p style="color:#9ca3af;font-size:14px;margin:0">Your Gumroad payment was verified</p></div><div style="text-align:center"><a href="${process.env.FRONTEND_URL || 'https://erivion.net'}" style="display:inline-block;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Start Creating Videos →</a></div></div>`,
          }),
        });
      } catch(e) { console.error('[Gumroad Ping] Activate error:', e.message); }
    }

    res.json({ ok: true });
  } catch(e) {
    console.error('[Gumroad Ping] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/referral', authMiddleware, async (req, res) => { res.json({ ok: true }); });

// ── Save onboarding survey answers ────────────────────────────────────────
router.post('/onboarding-answers', authMiddleware, async (req, res) => {
  try {
    const { source, content_type, style, budget } = req.body;
    await pool.query(`
      INSERT INTO user_onboarding (user_id, source, content_type, style, budget, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id) DO UPDATE SET source=$2, content_type=$3, style=$4, budget=$5
    `, [req.user.userId, source || null, content_type || null, style || null, budget || null]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/model3-usage', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    const usage = await getModel3Usage(req.user.userId);
    const plan = user?.model3_plan || 'm3_starter';
    const quotas = MODEL3_PLAN_QUOTAS[plan] || MODEL3_PLAN_QUOTAS.m3_starter;
    res.json({ usage, quotas, plan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/model3-payment', authMiddleware, async (req, res) => {
  try {
    const { plan, planName, amount, userEmail, screenshot } = req.body;
    if (!plan || !amount || !userEmail || !screenshot) return res.status(400).json({ error: 'Missing required fields' });
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const backendUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app';
    const adminSecret = process.env.ADMIN_SECRET || '';
    const attachments = [];
    if (screenshot) {
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
      const ext = screenshot.includes('png') ? 'png' : 'jpg';
      attachments.push({ filename: `m3_payment_${userEmail}_${Date.now()}.${ext}`, content: base64Data });
    }
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion Model 3 <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `🖼️ Model 3 Payment - ${planName} - ${userEmail}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#f59e0b">🖼️ New Model 3 Payment Request</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">User Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Account Email</td><td style="color:#fff">${user.email}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#f59e0b;font-weight:700">${planName}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr></table><div style="margin-top:24px;display:flex;gap:12px"><a href="${backendUrl}/api/auth/model3-approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a><a href="${backendUrl}/api/auth/model3-reject?email=${encodeURIComponent(userEmail)}&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });
    res.json({ success: true });
  } catch (e) {
    console.error('[Model3 Payment]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/model3-approve', async (req, res) => {
  const { email, plan, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (!email) return res.status(400).send('Missing email');
  try {
    const approvedPlan = plan || 'm3_starter';
    await pool.query('UPDATE users SET model3_access = 1, model3_plan = $2 WHERE email = $1', [email, approvedPlan]);
    // Charge credits for the plan
    try {
      const uRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (uRow.rows.length > 0) {
        const uid = uRow.rows[0].id;
        const creditsToAdd = MODEL3_PLAN_CREDITS[approvedPlan] || 125;
        await addModel3Credits(uid, creditsToAdd);
        await resetModel3Usage(uid);
      }
    } catch(e) { console.warn('[model3-approve] credits error:', e.message); }

    // ── Affiliate payment tracking ─────────────────────────────────────
    try {
      const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRow.rows.length > 0) {
        const amountEgp = MODEL3_PRICES[plan] || 800;
        trackAffiliatePayment(userRow.rows[0].id, email, plan || 'm3_starter', amountEgp).catch(() => {});
      }
    } catch {}

    try {
      const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: email,
          subject: '🎉 Model 3 Subscription Activated!',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:64px;margin-bottom:16px">🎉</div><h2 style="color:#f59e0b;font-size:22px">Your subscription is active!</h2><p style="color:#9ca3af;font-size:14px;line-height:1.8">Model 3 has been activated on your account. Start creating professional AI videos now!</p><a href="${frontendUrl}" style="display:inline-block;margin-top:24px;background:#f59e0b;color:#000;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Start Creating →</a></div>`,
        }),
      });
    } catch {}
    res.send('<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><div style="font-size:64px">✅</div><h2 style="color:#22c55e">Model 3 Activated!</h2><p style="color:#9ca3af">' + email + '</p></div></body></html>');
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

router.get('/model3-reject', async (req, res) => {
  const { email, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: email,
        subject: 'Your Model 3 Subscription Request',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:64px">❌</div><h2 style="color:#ef4444">We could not verify your payment</h2><p style="color:#9ca3af">Please contact us at digidelight33@gmail.com</p></div>`,
      }),
    });
  } catch {}
  res.send('<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center"><div style="font-size:64px">❌</div><h2 style="color:#ef4444">Rejected</h2></div></body></html>');
});

// ── Model 4 Approve ─────────────────────────────────────────────────────────
router.get('/model4-approve', async (req, res) => {
  const { email, plan, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (!email) return res.status(400).send('Missing email');
  try {
    const approvedPlan4 = plan || 'm4_plan1';
    await pool.query('UPDATE users SET model4_access = 1, model4_plan = $1 WHERE email = $2', [approvedPlan4, email]);
    try {
      const uRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (uRow.rows.length > 0) {
        const uid = uRow.rows[0].id;
        const creditsToAdd4 = (MODEL4_PLANS[approvedPlan4]?.credits) || 80;
        await addModel4Credits(uid, creditsToAdd4);
        await resetModel4Usage(uid);
      }
    } catch(e) { console.warn('[model4-approve] credits error:', e.message); }

    // ── Affiliate payment tracking ─────────────────────────────────────
    try {
      const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (userRow.rows.length > 0) {
        const amountEgp = MODEL4_PRICES[plan] || 600;
        trackAffiliatePayment(userRow.rows[0].id, email, plan || 'm4_plan1', amountEgp).catch(() => {});
      }
    } catch {}

    const planLabels = { m4_plan1: 'Plan 1 — 10 videos/30s', m4_plan2: 'Plan 2 — 10 videos/1min', m4_plan3: 'Plan 3 — 10 videos/3min' };
    const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: email,
        subject: '✅ Your Model 4 — Seedance AI subscription is active!',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">🎬</div><h2 style="color:#a855f7;font-size:22px;margin:0 0 8px">Model 4 Activated!</h2><p style="color:#9ca3af;font-size:14px;margin:0">${planLabels[plan] || plan}</p></div><div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:24px"><p style="color:#d1d5db;font-size:14px;line-height:1.8;margin:0">Your Model 4 subscription has been successfully activated. You can now generate real AI videos using Seedance.</p></div><div style="text-align:center"><a href="${frontendUrl}" style="display:inline-block;background:#a855f7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Start Generating Now →</a></div></div>`,
      }),
    });
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><h2 style="color:#22c55e">✅ Model 4 Approved!</h2><p style="color:#9ca3af">Activated for <strong>${email}</strong></p><p style="color:#a855f7;font-weight:700">${planLabels[plan] || plan}</p></body></html>`);
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ── Model 4 Reject ──────────────────────────────────────────────────────────
router.get('/model4-reject', async (req, res) => {
  const { email, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (!email) return res.status(400).send('Missing email');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: email,
        subject: '❌ Your Model 4 Subscription Request',
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px;margin-bottom:12px">❌</div><h2 style="color:#ef4444">Payment Not Verified</h2><p style="color:#9ca3af;font-size:14px;line-height:1.8">Unfortunately we could not verify your payment. Please contact us at <a href="mailto:digidelight33@gmail.com" style="color:#a855f7">digidelight33@gmail.com</a></p></div>`,
      }),
    });
  } catch {}
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><h2 style="color:#ef4444">❌ Rejected</h2><p style="color:#9ca3af">${email}</p></body></html>`);
});
router.get('/model5-approve', async (req, res) => {
  const { email, plan, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (!email) return res.status(400).send('Missing email');
  try {
    const approvedPlan5 = plan || 'mc_starter';
    await pool.query('UPDATE users SET model5_access = 1, model5_plan = $1 WHERE email = $2', [approvedPlan5, email]);
    try {
      const uRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (uRow.rows.length > 0) {
        const uid = uRow.rows[0].id;
        const creditsToAdd5 = (MODEL5_PLANS[approvedPlan5]?.credits) || 75;
        await addModel5Credits(uid, creditsToAdd5);
        await resetModel5Usage(uid);
      }
    } catch(e) { console.warn('[model5-approve] credits error:', e.message); }
    const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Erivion <noreply@erivion.net>', to: email, subject: '🎬 Erivion Cinematic Activated!', html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">🎬</div><h2 style="color:#e11d48">Cinematic Activated!</h2><p style="color:#9ca3af">Start creating cinematic AI videos now.</p><a href="${frontendUrl}" style="display:inline-block;margin-top:20px;background:#e11d48;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700">Start Creating →</a></div>` }),
    });
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><h2 style="color:#22c55e">✅ Cinematic Activated!</h2><p style="color:#9ca3af">${email}</p></body></html>`);
  } catch (e) { res.status(500).send('Error: ' + e.message); }
});

router.get('/model5-reject', async (req, res) => {
  const { email, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Erivion <noreply@erivion.net>', to: email, subject: '❌ Cinematic Payment Not Verified', html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">❌</div><h2 style="color:#ef4444">Payment Not Verified</h2><p style="color:#9ca3af">Contact us at digidelight33@gmail.com</p></div>` }),
    });
  } catch {}
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><h2 style="color:#ef4444">❌ Rejected</h2><p>${email}</p></body></html>`);
});
// ── Update display name ──────────────────────────────────────────────────
router.post('/update-profile', authMiddleware, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name.trim(), req.user.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update name' });
  }
});

// ── Change password ──────────────────────────────────────────────────────
router.post('/change-password', authMiddleware, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.userId]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// ── Delete account ───────────────────────────────────────────────────────
router.delete('/delete-account', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
    const email = rows[0]?.email;
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.userId]);
    // notify admin
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
          subject: '🗑️ Account Deleted — ' + email,
          html: `<div style="font-family:sans-serif;padding:24px;background:#0f0f1a;color:#fff;border-radius:12px"><h3 style="color:#f87171">Account Deleted</h3><p>Email: <strong>${email}</strong></p><p>Time: ${new Date().toISOString()}</p></div>`,
        }),
      });
    } catch {}
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: API Keys — للاستخدام الخارجي (زي MCP server في Claude). المفتاح الكامل
//  بيبان مرة واحدة بس وقت الإنشاء، بعد كده بس أول 13 حرف بيبانوا (key_prefix).
// ══════════════════════════════════════════════════════════════════════════
router.post('/api-key/generate', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const apiKey = await generateApiKey(req.user.userId, name);
    res.json({ apiKey }); // ⚠️ آخر مرة يترجع فيها المفتاح كامل
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api-key', authMiddleware, async (req, res) => {
  try {
    const keys = await listApiKeys(req.user.userId);
    res.json({ keys });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/api-key/:id', authMiddleware, async (req, res) => {
  try {
    await revokeApiKey(req.user.userId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;