import express from 'express';
import fetch from 'node-fetch';
import {
  signUp, verifyCode, login, verifyToken,
  getUserVideos, saveVideo, getUserCredits, getUserById,
  createPaymentRequest, sendPaymentRequestEmail, activateUserPlan,
  loginOrCreateGoogleUser, PLANS,
} from './authService.js';

const router = express.Router();

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = verifyToken(auth.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
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
    res.redirect(`${frontendUrl}?google_token=${authData.token}&email=${encodeURIComponent(authData.email)}&plan=${authData.plan}&name=${encodeURIComponent(authData.name || '')}`);
  } catch (err) {
    console.error('[Google OAuth] Error:', err.message);
    res.redirect(`${frontendUrl}?auth_error=${encodeURIComponent(err.message)}`);
  }
});

router.get('/videos', authMiddleware, async (req, res) => {
  const videos = await getUserVideos(req.user.userId);
  res.json({ videos });
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
    const credits = await getUserCredits(req.user.userId);
    res.json(credits);
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

router.get('/admin/approve', async (req, res) => {
  const { email, plan, billing, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (!email || !plan) return res.status(400).send('Missing fields');
  try {
    const result = await activateUserPlan(email, plan, billing || 'monthly');
    const planData = PLANS[plan];
    const planName = planData?.name || plan;
    const expiresFormatted = new Date(result.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const frontendUrl = process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app';

    // Send approval email via Resend
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

router.get('/admin/reject', async (req, res) => {
  const { email, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');
  if (email) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion <noreply@erivion.net>',
          to: email,
          subject: 'Your payment request could not be verified',
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">❌</div><h2 style="color:#ef4444;font-size:22px;margin:0 0 8px">Payment Not Verified</h2></div><div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:24px"><p style="color:#d1d5db;font-size:14px;line-height:1.7;margin:0">We could not verify your payment. Please contact us at <a href="mailto:digidelight33@gmail.com" style="color:#7c6af7">digidelight33@gmail.com</a></p></div></div>`,
        }),
      });
    } catch (mailErr) {
      console.error('[Reject] Email error:', mailErr.message);
    }
  }
  res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">❌</div><h2 style="color:#ef4444;margin-bottom:8px">Request Rejected</h2><p style="color:#9ca3af">${email || 'Unknown user'}</p></div></body></html>`);
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

router.post('/referral', authMiddleware, async (req, res) => {
  res.json({ ok: true });
});

export default router;