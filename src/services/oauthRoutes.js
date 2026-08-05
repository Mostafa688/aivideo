// ── oauthRoutes.js ───────────────────────────────────────────────────────────
// ✅ NEW: OAuth 2.1 server كامل (Dynamic Client Registration + Authorization
// Code + PKCE) — عشان الـ MCP connector في Claude.ai يشتغل بالطريقة الافتراضية
// (Claude بيحاول يعمل OAuth تلقائي لأي connector جديد، مش بس بيعتمد على مفتاح API
// يدوي). التوكن الناتج هنا (JWT طويل العمر) مقبول في mcpRoutes.js جنب مفاتيح الـ
// API العادية.

import express from 'express';
import crypto from 'crypto';
import { registerOAuthClient, getOAuthClient, verifyUserCredentials, mintOAuthAccessToken } from './authService.js';

const router = express.Router();
const SITE_URL = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net';

// ✅ أكواد التفويض قصيرة العمر جدًا (دقيقة واحدة) وبتُستخدم مرة واحدة بس — تخزين
// في الميموري كافي تمامًا، مفيش داعي لجدول DB لحاجة بتعيش ثواني معدودة
const authCodes = new Map(); // code -> { userId, email, clientId, redirectUri, codeChallenge, expiresAt }
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) if (data.expiresAt < now) authCodes.delete(code);
}, 60_000);

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Discovery: OAuth Authorization Server Metadata (RFC 8414) ─────────────────
router.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: SITE_URL,
    authorization_endpoint: `${SITE_URL}/oauth/authorize`,
    token_endpoint: `${SITE_URL}/oauth/token`,
    registration_endpoint: `${SITE_URL}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
  });
});

// ── Discovery: OAuth Protected Resource Metadata (RFC 9728) — بتاعت الـ MCP resource نفسه ──
router.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({
    resource: `${SITE_URL}/mcp`,
    authorization_servers: [SITE_URL],
  });
});
router.get('/.well-known/oauth-protected-resource/mcp', (req, res) => {
  res.json({
    resource: `${SITE_URL}/mcp`,
    authorization_servers: [SITE_URL],
  });
});

// ── Dynamic Client Registration (RFC 7591) ─────────────────────────────────────
router.post('/oauth/register', express.json(), async (req, res) => {
  try {
    const { redirect_uris, client_name } = req.body;
    if (!Array.isArray(redirect_uris) || !redirect_uris.length) {
      return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris is required' });
    }
    const clientId = await registerOAuthClient(redirect_uris, client_name);
    res.status(201).json({
      client_id: clientId,
      redirect_uris,
      client_name: client_name || 'MCP Client',
      token_endpoint_auth_method: 'none', // public client — PKCE بيحمينا بدل client secret
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
  } catch (e) {
    console.error('[OAuth] Register error:', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Authorization endpoint — بيفتح فورم لوجين بسيط للعميل ────────────────────
router.get('/oauth/authorize', async (req, res) => {
  const { client_id, redirect_uri, response_type, code_challenge, code_challenge_method, state } = req.query;
  if (response_type !== 'code') return res.status(400).send('Only response_type=code is supported.');
  if (!client_id || !redirect_uri) return res.status(400).send('client_id and redirect_uri are required.');

  const client = await getOAuthClient(client_id);
  if (!client) return res.status(400).send('Unknown client_id — please reconnect the MCP connector.');
  const allowedUris = client.redirect_uris || [];
  if (!allowedUris.includes(redirect_uri)) return res.status(400).send('redirect_uri does not match the registered client.');

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Erivion to Claude</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#0a0a12; font-family:'Plus Jakarta Sans',sans-serif; }
  .card { width:100%; max-width:400px; padding:36px 32px; background:#12121e; border:1px solid rgba(255,255,255,0.08); border-radius:18px; }
  h1 { color:#fff; font-size:22px; margin:0 0 6px; }
  p { color:rgba(255,255,255,0.5); font-size:13.5px; margin:0 0 24px; line-height:1.6; }
  input { width:100%; box-sizing:border-box; padding:12px 14px; margin-bottom:12px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:#1a1a28; color:#fff; font-size:14px; outline:none; }
  button { width:100%; padding:13px; border-radius:10px; border:none; background:linear-gradient(135deg,#7c6af7,#6d28d9); color:#fff; font-weight:700; font-size:14.5px; cursor:pointer; }
  .err { color:#f87171; font-size:13px; margin-bottom:12px; display:none; }
  .app { display:flex; align-items:center; gap:10px; margin-bottom:20px; padding:10px 14px; background:rgba(124,106,247,0.08); border:1px solid rgba(124,106,247,0.25); border-radius:10px; color:#a99bff; font-size:13px; }
</style></head>
<body>
  <div class="card">
    <div class="app">🔌 ${escapeHtml(client.client_name)} is requesting access to your Erivion account</div>
    <h1>Sign in to Erivion</h1>
    <p>This authorizes the app above to generate videos using your credits.</p>
    <div class="err" id="err"></div>
    <form id="f">
      <input type="email" id="email" placeholder="Email address" required>
      <input type="password" id="password" placeholder="Password" required>
      <button type="submit">Sign in & Authorize →</button>
    </form>
  </div>
  <script>
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const err = document.getElementById('err');
      err.style.display = 'none';
      try {
        const res = await fetch('/oauth/authorize/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            client_id: ${JSON.stringify(client_id)},
            redirect_uri: ${JSON.stringify(redirect_uri)},
            code_challenge: ${JSON.stringify(code_challenge || '')},
            code_challenge_method: ${JSON.stringify(code_challenge_method || '')},
            state: ${JSON.stringify(state || '')},
          }),
        });
        const data = await res.json();
        if (!res.ok) { err.textContent = data.error_description || 'Invalid email or password'; err.style.display = 'block'; return; }
        window.location.href = data.redirect;
      } catch (e2) { err.textContent = 'Something went wrong — please try again.'; err.style.display = 'block'; }
    };
  </script>
</body></html>`);
});

// ── معالجة تسجيل الدخول فعليًا وتوليد كود التفويض ─────────────────────────────
router.post('/oauth/authorize/submit', express.json(), async (req, res) => {
  try {
    const { email, password, client_id, redirect_uri, code_challenge, code_challenge_method, state } = req.body;
    const client = await getOAuthClient(client_id);
    if (!client || !(client.redirect_uris || []).includes(redirect_uri)) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Invalid client or redirect_uri.' });
    }
    let user;
    try {
      user = await verifyUserCredentials(email, password);
    } catch (e) {
      return res.status(401).json({ error: 'access_denied', error_description: e.message });
    }
    const code = base64url(crypto.randomBytes(24));
    authCodes.set(code, {
      userId: user.userId, email: user.email, clientId: client_id, redirectUri: redirect_uri,
      codeChallenge: code_challenge || null, codeChallengeMethod: code_challenge_method || null,
      expiresAt: Date.now() + 60_000,
    });
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', code);
    if (state) redirectUrl.searchParams.set('state', state);
    res.json({ redirect: redirectUrl.toString() });
  } catch (e) {
    console.error('[OAuth] Authorize submit error:', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ── Token endpoint — بتبديل كود التفويض بـ access token حقيقي ────────────────
router.post('/oauth/token', express.urlencoded({ extended: true }), express.json(), async (req, res) => {
  try {
    const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }
    const data = authCodes.get(code);
    if (!data || data.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired or invalid — please reconnect.' });
    }
    authCodes.delete(code); // ✅ الكود بيُستخدم مرة واحدة بس
    if (data.clientId !== client_id || data.redirectUri !== redirect_uri) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id or redirect_uri mismatch.' });
    }
    // ✅ التحقق من PKCE — لازم SHA256(code_verifier) يطابق الـ code_challenge المحفوظ
    if (data.codeChallenge) {
      if (!code_verifier) return res.status(400).json({ error: 'invalid_request', error_description: 'code_verifier is required.' });
      const computed = base64url(crypto.createHash('sha256').update(code_verifier).digest());
      if (computed !== data.codeChallenge) {
        return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed.' });
      }
    }
    const accessToken = mintOAuthAccessToken(data.userId, data.email);
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 60 * 60 * 24 * 90, // 90 يوم
    });
  } catch (e) {
    console.error('[OAuth] Token error:', e.message);
    res.status(500).json({ error: 'server_error' });
  }
});

export default router;
