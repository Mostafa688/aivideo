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

// ✅ Google OAuth - Step 1: redirect to Google
router.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback';
  const scope = 'openid email profile';
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=select_account`;
  res.redirect(url);
});

// ✅ Google OAuth - Step 2: handle callback
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error || !code) {
    return res.redirect(`${frontendUrl}?auth_error=google_cancelled`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback';

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error('No access token received');

    // Get user info from Google
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const googleUser = await userRes.json();

    if (!googleUser.email) throw new Error('Could not get user email from Google');

    // Login or create user
    const authData = loginOrCreateGoogleUser({
      googleId: googleUser.id,
      email: googleUser.email,
      name: googleUser.name,
      avatar: googleUser.picture,
    });

    // Redirect to frontend with token
    res.redirect(`${frontendUrl}?google_token=${authData.token}&email=${encodeURIComponent(authData.email)}&plan=${authData.plan}&name=${encodeURIComponent(authData.name || '')}`);
  } catch (err) {
    console.error('[Google OAuth] Error:', err.message);
    res.redirect(`${frontendUrl}?auth_error=${encodeURIComponent(err.message)}`);
  }
});

router.get('/videos', authMiddleware, (req, res) => {
  const videos = getUserVideos(req.user.userId);
  res.json({ videos });
});

router.post('/save-video', authMiddleware, (req, res) => {
  const { filename, title } = req.body;
  if (!filename) return res.status(400).json({ error: 'filename required' });
  try {
    saveVideo(req.user.userId, filename, title);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/credits', authMiddleware, (req, res) => {
  try {
    const credits = getUserCredits(req.user.userId);
    res.json(credits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/payment/request', authMiddleware, async (req, res) => {
  try {
    const { plan, billing, amount, screenshot } = req.body;
    if (!plan || !billing || !amount) return res.status(400).json({ error: 'Missing required fields' });
    const user = getUserById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const requestId = createPaymentRequest(req.user.userId, user.email, plan, billing, amount, screenshot || null);
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
    const result = activateUserPlan(email, plan, billing || 'monthly');
    const planData = PLANS[plan];
    const planName = planData?.name || plan;
    const expiresFormatted = new Date(result.expires_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // ✅ Send approval email to user
    try {
      const nodemailer = (await import('nodemailer')).default;
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      await transporter.sendMail({
        from: `"Erivion" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `🎉 Your ${planName} plan is now active!`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px">
          <div style="text-align:center;margin-bottom:28px">
            <div style="font-size:56px;margin-bottom:12px">🎉</div>
            <h2 style="color:#22c55e;font-size:22px;margin:0 0 8px">Payment Approved!</h2>
            <p style="color:#9ca3af;font-size:14px;margin:0">Your subscription has been activated</p>
          </div>
          <div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:24px">
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Plan</td><td style="color:#7c6af7;font-weight:700;font-size:16px;text-align:right">${planName}</td></tr>
              <tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Billing</td><td style="color:#fff;text-align:right;font-size:14px">${billing === 'yearly' ? 'Yearly' : 'Monthly'}</td></tr>
              <tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Expires</td><td style="color:#fff;text-align:right;font-size:14px">${expiresFormatted}</td></tr>
              <tr><td style="color:#6b7280;padding:7px 0;font-size:14px">Credits / week</td><td style="color:#22c55e;font-weight:700;text-align:right;font-size:14px">${(planData?.credits_weekly || 0).toLocaleString()}</td></tr>
            </table>
          </div>
          <div style="text-align:center">
            <a href="${frontendUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Start Creating Videos →</a>
          </div>
          <p style="text-align:center;color:#4b5563;font-size:12px;margin-top:24px">Questions? Contact us at digidelight33@gmail.com</p>
        </div>`,
      });
    } catch (mailErr) {
      console.error('[Approve] Failed to send user email:', mailErr.message);
    }

    res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">✅</div><h2 style="color:#22c55e;margin-bottom:8px">Plan Activated!</h2><p style="color:#9ca3af">${email}</p><p style="color:#7c6af7;font-weight:700;font-size:18px">${plan.toUpperCase()} · ${billing || 'monthly'}</p><p style="color:#6b7280;font-size:13px">Expires: ${expiresFormatted}</p><p style="color:#22c55e;font-size:13px;margin-top:8px">✉️ Confirmation email sent to user</p></div></body></html>`);
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

router.get('/admin/reject', async (req, res) => {
  const { email, secret } = req.query;
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) return res.status(403).send('Unauthorized');

  // ✅ Send rejection email to user
  if (email) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });
      await transporter.sendMail({
        from: `"Erivion" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: `Your payment request could not be verified`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px">
          <div style="text-align:center;margin-bottom:28px">
            <div style="font-size:56px;margin-bottom:12px">❌</div>
            <h2 style="color:#ef4444;font-size:22px;margin:0 0 8px">Payment Not Verified</h2>
            <p style="color:#9ca3af;font-size:14px;margin:0">We could not verify your payment screenshot</p>
          </div>
          <div style="background:#1a1a2e;border:1px solid #2d2d4a;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="color:#d1d5db;font-size:14px;line-height:1.7;margin:0">
              Unfortunately, we were unable to verify your payment. This may be because:<br><br>
              • The screenshot was unclear or incomplete<br>
              • The transfer amount did not match<br>
              • The payment was not sent to the correct number<br><br>
              <strong style="color:#fff">Your money will be refunded within 24–48 hours</strong> if the transfer was completed.
            </p>
          </div>
          <div style="background:#1c1a0a;border:1px solid #3d3010;border-radius:10px;padding:16px;margin-bottom:24px">
            <p style="color:#f59e0b;font-size:13px;margin:0;font-weight:600">💰 Refund Information</p>
            <p style="color:#9ca3af;font-size:13px;margin:8px 0 0;line-height:1.6">If you sent a payment, please contact us at <a href="mailto:digidelight33@gmail.com" style="color:#7c6af7">digidelight33@gmail.com</a> and we will process your refund promptly.</p>
          </div>
          <div style="text-align:center">
            <a href="mailto:digidelight33@gmail.com" style="display:inline-block;background:#374151;color:#fff;padding:12px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px">Contact Support</a>
          </div>
          <p style="text-align:center;color:#4b5563;font-size:12px;margin-top:24px">You can try subscribing again from the Erivion pricing page.</p>
        </div>`,
      });
    } catch (mailErr) {
      console.error('[Reject] Failed to send user email:', mailErr.message);
    }
  }

  res.send(`<html><body style="font-family:sans-serif;background:#0f0f1a;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0"><div style="text-align:center;padding:40px"><div style="font-size:64px;margin-bottom:16px">❌</div><h2 style="color:#ef4444;margin-bottom:8px">Request Rejected</h2><p style="color:#9ca3af">${email || 'Unknown user'}</p><p style="color:#6b7280;font-size:13px;margin-top:8px">✉️ Rejection email sent to user</p></div></body></html>`);
});

// ✅ Support email endpoint
router.post('/support', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!email || !message) return res.status(400).json({ error: 'Email and message required' });
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
    await transporter.sendMail({
      from: `"Erivion Support" <${process.env.EMAIL_USER}>`,
      to: 'digidelight33@gmail.com',
      subject: `Support Request from ${name || email}`,
      html: `<div style="font-family:sans-serif;padding:24px;background:#0f0f1a;color:#fff"><h3 style="color:#7c6af7">New Support Message</h3><p><b>From:</b> ${name || 'Unknown'} (${email})</p><p><b>Message:</b></p><p style="white-space:pre-wrap;color:#ccc">${message}</p></div>`,
      replyTo: email,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[Support]', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;