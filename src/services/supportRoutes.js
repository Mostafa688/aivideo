import express from 'express';
import pkg from 'pg';
import fs from 'fs';
import path from 'path';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const router = express.Router();

// ✅ NEW: حفظ ميديا (صورة/فيديو) مرفوعة في شات الدعم على الديسك وإرجاع رابطها
const SUPPORT_MEDIA_DIR = path.join(process.cwd(), 'outputs', 'support_media');
const MAX_IMAGE_MB = 8;
const MAX_VIDEO_MB = 40;
function saveSupportMedia(base64, mediaType) {
  if (!base64) return null;
  const isVideo = mediaType === 'video';
  const b64 = base64.replace(/^data:[\w/]+;base64,/, '');
  const sizeMb = (b64.length * 0.75) / (1024 * 1024);
  const limit = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (sizeMb > limit) throw new Error(`${isVideo ? 'Video' : 'Image'} too large — max ${limit}MB`);
  if (!fs.existsSync(SUPPORT_MEDIA_DIR)) fs.mkdirSync(SUPPORT_MEDIA_DIR, { recursive: true });
  const ext = isVideo ? 'mp4' : 'jpg';
  const filename = `support_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  fs.writeFileSync(path.join(SUPPORT_MEDIA_DIR, filename), Buffer.from(b64, 'base64'));
  return `/outputs/support_media/${filename}`;
}

// ── Init support_chats table ──────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_chats (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        language TEXT DEFAULT 'en',
        status TEXT DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES support_chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // ✅ NEW: أعمدة الميديا (صورة/فيديو) والرد على رسالة محددة
    await pool.query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS media_url TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS media_type TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE support_messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES support_messages(id) ON DELETE SET NULL`).catch(()=>{});
    // Auto-delete expired chats job (runs on startup)
    await pool.query(`DELETE FROM support_chats WHERE expires_at < NOW()`);
    console.log('[Support] Tables ready');
  } catch (e) { console.warn('[Support] Init error:', e.message); }
})();

// ✅ NEW: دالة مشتركة لإرسال إيميل "عندك رد جديد" للعميل — بتتستخدم من admin-reply
// (رد عادي على شات فتحه العميل بنفسه) ومن admin-start-chat (الأدمن هو اللي بدأ)
async function sendCustomerNotifyEmail({ email, name, language, text, chatId }) {
  if (!process.env.RESEND_API_KEY || !email) return;
  try {
    const appUrl = process.env.APP_URL || 'https://erivion.net';
    const chatUrl = `${appUrl}/support?openSupportChat=${chatId}`;
    const isAr = language !== 'en';
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion Support <support@erivion.net>',
        to: [email],
        subject: isAr ? '💬 تم الرد على رسالتك — فريق دعم Erivion' : '💬 You got a reply — Erivion Support',
        html: `<div dir="${isAr ? 'rtl' : 'ltr'}" style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
          <h2 style="color:#a78bfa;margin:0 0 16px">💬 ${isAr ? `تم الرد على رسالتك يا ${name || ''}` : `You got a reply, ${name || ''}`}</h2>
          <p style="color:#9ca3af;font-size:13px;margin:0 0 16px">${isAr ? 'رد فريق الدعم:' : "Our support team's reply:"}</p>
          <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:0 0 20px;color:#e5e7eb;line-height:1.7;white-space:pre-line">${(text || '').trim() || (isAr ? '(مرفق ملف)' : '(attachment)')}</div>
          <a href="${chatUrl}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:linear-gradient(135deg,#7c6af7,#a855f7);color:#fff;text-decoration:none;font-weight:700;font-size:14px">${isAr ? 'افتح المحادثة ←' : 'Open Chat →'}</a>
          <p style="color:#6b7280;font-size:11px;margin-top:24px">${isAr ? 'أو انسخ الرابط ده في المتصفح:' : 'Or paste this link in your browser:'}<br><span style="color:#7c6af7">${chatUrl}</span></p>
        </div>`,
      }),
    });
  } catch (e) { console.warn('[Support] Customer notify email failed:', e.message); }
}

// ── Start a new chat ──────────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  const { name, email, language } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'name and email required' });
  try {
    const chatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    await pool.query(
      `INSERT INTO support_chats (id, name, email, language) VALUES ($1, $2, $3, $4)`,
      [chatId, name.trim(), email.trim(), language || 'en']
    );

    // Notify admin by email via Resend
    try {
      if (process.env.RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Erivion Support <support@erivion.net>',
            to: [process.env.ADMIN_EMAIL || 'digidelight33@gmail.com'],
            subject: `💬 New Support Chat — ${name} (${language === 'ar' ? 'Arabic' : 'English'})`,
            html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#a78bfa;margin:0 0 16px">💬 New Support Chat Started</h2><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="color:#888;padding:8px 0;width:100px">Name</td><td style="color:#fff;font-weight:600">${name}</td></tr><tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff">${email}</td></tr><tr><td style="color:#888;padding:8px 0">Language</td><td style="color:#fff">${language === 'ar' ? '🇸🇦 Arabic' : '🇺🇸 English'}</td></tr><tr><td style="color:#888;padding:8px 0">Chat ID</td><td style="color:#7c6af7;font-family:monospace;font-size:12px">${chatId}</td></tr></table><p style="color:#888;font-size:13px">Reply from Admin Panel → Support tab.</p></div>`,
          }),
        });
      }
    } catch (e) { console.warn('[Support] Email notify failed:', e.message); }

    res.json({ chatId, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Send a message ────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  const { chatId, text, role, autoAnswer, mediaBase64, mediaType, replyToId } = req.body;
  if (!chatId || !role) return res.status(400).json({ error: 'chatId and role required' });
  if (!text?.trim() && !mediaBase64) return res.status(400).json({ error: 'text or media required' });
  try {
    let mediaUrl = null;
    if (mediaBase64) {
      try { mediaUrl = saveSupportMedia(mediaBase64, mediaType); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    }
    const { rows } = await pool.query(
      `INSERT INTO support_messages (chat_id, role, text, media_url, media_type, reply_to_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [chatId, role, (text || '').trim(), mediaUrl, mediaUrl ? (mediaType === 'video' ? 'video' : 'image') : null, replyToId || null]
    );
    // If there's an auto-answer (from FAQ), insert it as admin reply
    if (autoAnswer) {
      await pool.query(
        `INSERT INTO support_messages (chat_id, role, text) VALUES ($1, 'admin', $2)`,
        [chatId, autoAnswer]
      );
    }
    // ✅ FIX (باج حقيقي — رسالة عميل وصلت للداتابيز بس الأدمن معرفش خالص): الإشعار بالإيميل
    // كان بيحصل بس أول ما الشات يتفتح (/start) — أي رسالة عميل تانية بعد كده في نفس الشات
    // كانت بتتحفظ من غير أي إشعار للأدمن خالص، فكان ممكن تفضل من غير رد لحد ما الأدمن يفتح
    // لوحة التحكم بنفسه بالصدفة ويلاقيها
    if (role === 'user' && !autoAnswer && process.env.RESEND_API_KEY) {
      pool.query(`SELECT name, email, language FROM support_chats WHERE id = $1`, [chatId]).then(({ rows: chatRows }) => {
        if (!chatRows[0]) return;
        const appUrl = process.env.APP_URL || 'https://erivion.net';
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Erivion Support <support@erivion.net>',
            to: [process.env.ADMIN_EMAIL || 'digidelight33@gmail.com'],
            subject: `New message from ${chatRows[0].name || 'a customer'} — Erivion Support`,
            html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#a78bfa;margin:0 0 16px">New Support Message</h2><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="color:#888;padding:8px 0;width:100px">From</td><td style="color:#fff;font-weight:600">${chatRows[0].name || ''}</td></tr><tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff">${chatRows[0].email || ''}</td></tr><tr><td style="color:#888;padding:8px 0">Chat ID</td><td style="color:#7c6af7;font-family:monospace;font-size:12px">${chatId}</td></tr></table><div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:16px 0;color:#e5e7eb;line-height:1.7;white-space:pre-line">${(text || '').trim() || '(attachment)'}</div><p style="color:#888;font-size:13px">Reply from Admin Panel → Support tab.</p></div>`,
          }),
        }).catch(e => console.warn('[Support] Admin notify email failed:', e.message));
      }).catch(() => {});
    }
    res.json({ success: true, id: rows[0]?.id, mediaUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get messages for a chat ───────────────────────────────────────────────────
router.get('/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  try {
    // ✅ NEW: بنرجع كمان الميديا وبيانات الرسالة اللي بيترد عليها (لو موجودة) عشان الواجهة
    // تعرض quote preview فوق الرسالة الرادة
    const { rows } = await pool.query(
      `SELECT m.id, m.role, m.text, m.created_at as time, m.media_url, m.media_type, m.reply_to_id,
              r.text as reply_to_text, r.role as reply_to_role
       FROM support_messages m
       LEFT JOIN support_messages r ON r.id = m.reply_to_id
       WHERE m.chat_id = $1 ORDER BY m.created_at ASC`,
      [chatId]
    );
    res.json({ messages: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get customer's own active chat(s) by email — عشان العميل يقدر يرجع لشاته ──
// ✅ NEW: بدل ما شات العميل يتمسح من عنده لو خرج وسابه، بنسمحله يدوّر على شاته
// المفتوحة بالإيميل ويرجعله مباشرة، بدل ما يضطر يفتح شات جديد في كل مرة
router.get('/my-chats', async (req, res) => {
  const email = (req.query.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });
  try {
    const { rows } = await pool.query(`
      SELECT sc.id, sc.name, sc.created_at, sc.expires_at,
        (SELECT text FROM support_messages WHERE chat_id = sc.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM support_messages WHERE chat_id = sc.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM support_chats sc
      WHERE sc.email = $1 AND sc.expires_at > NOW()
      ORDER BY sc.created_at DESC
      LIMIT 10
    `, [email]);
    res.json({ chats: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get all open chats (admin) ────────────────────────────────────────────────
router.get('/chats', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    // Add read_at column if not exists
    await pool.query(`ALTER TABLE support_chats ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL`).catch(()=>{});
    const { rows } = await pool.query(`
      SELECT sc.*,
        (SELECT text FROM support_messages WHERE chat_id = sc.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM support_messages WHERE chat_id = sc.id ORDER BY created_at DESC LIMIT 1) as last_message_at,
        (SELECT COUNT(*) FROM support_messages WHERE chat_id = sc.id AND role = 'user') as user_msg_count,
        (SELECT COUNT(*) FROM support_messages WHERE chat_id = sc.id AND role = 'admin') as admin_msg_count,
        (SELECT COUNT(*) FROM support_messages WHERE chat_id = sc.id AND role = 'user'
          AND created_at > COALESCE(sc.read_at, '2000-01-01')) as unread_count
      FROM support_chats sc
      WHERE sc.expires_at > NOW()
      ORDER BY sc.created_at DESC
    `);
    res.json({ chats: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Mark chat as read ─────────────────────────────────────────────────────────
router.post('/mark-read', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.body.secret;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  const { chatId } = req.body;
  try {
    await pool.query(`UPDATE support_chats SET read_at = NOW() WHERE id = $1`, [chatId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin reply ───────────────────────────────────────────────────────────────
router.post('/admin-reply', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.body.secret;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  const { chatId, text, mediaBase64, mediaType, replyToId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });
  if (!text?.trim() && !mediaBase64) return res.status(400).json({ error: 'text or media required' });
  try {
    let mediaUrl = null;
    if (mediaBase64) {
      try { mediaUrl = saveSupportMedia(mediaBase64, mediaType); }
      catch (e) { return res.status(400).json({ error: e.message }); }
    }
    const { rows } = await pool.query(
      `INSERT INTO support_messages (chat_id, role, text, media_url, media_type, reply_to_id) VALUES ($1, 'admin', $2, $3, $4, $5) RETURNING id`,
      [chatId, (text || '').trim(), mediaUrl, mediaUrl ? (mediaType === 'video' ? 'video' : 'image') : null, replyToId || null]
    );
    // ✅ FIX: كان مفيش أي إشعار للعميل خالص لما الأدمن يرد على شات هو بدأه بنفسه — العميل
    // كان لازم يفضل فاتح الصفحة عشان يشوف الرد. دلوقتي بنبعتله إيميل فيه رد الأدمن وزرار
    // يفتحله نفس المحادثة مباشرة، بالظبط زي admin-start-chat بس هنا للرد العادي.
    const { rows: chatRows } = await pool.query(`SELECT name, email, language FROM support_chats WHERE id = $1`, [chatId]);
    if (chatRows[0]?.email) {
      sendCustomerNotifyEmail({ email: chatRows[0].email, name: chatRows[0].name, language: chatRows[0].language, text, chatId }).catch(() => {});
    }
    res.json({ success: true, id: rows[0]?.id, mediaUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin starts (or continues) a chat with a customer who never opened support ──
// ✅ NEW: بيسمح للأدمن إنه يبعت رسالة لعميل من صفحة الأدمن حتى لو العميل ميعملش "Start Chat"
// أصلاً — بيدور على تشات مفتوح للإيميل ده ويستخدمه، أو يعمل واحد جديد لو مفيش. بعدها بيبعت
// إيميل للعميل فيه الرسالة + زرار "افتح المحادثة" برابط بيوديه على نفس الشات مباشرة.
router.post('/admin-start-chat', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.body.secret;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  const { email, name, text, language } = req.body;
  if (!email || !text || !text.trim()) return res.status(400).json({ error: 'email and text required' });
  const lang = language === 'en' ? 'en' : 'ar';
  const cleanEmail = email.trim();
  try {
    // لو فيه تشات مفتوح (لسه ماخلصتش صلاحيته) لنفس الإيميل، استخدمه بدل ما نعمل واحد جديد كل مرة
    const { rows: existing } = await pool.query(
      `SELECT id FROM support_chats WHERE email = $1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail]
    );
    let chatId;
    if (existing.length) {
      chatId = existing[0].id;
      // نمدد الصلاحية 24 ساعة كمان لأن دلوقتي فيه نشاط جديد على التشات ده
      await pool.query(`UPDATE support_chats SET expires_at = NOW() + INTERVAL '24 hours' WHERE id = $1`, [chatId]);
    } else {
      chatId = `chat_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      await pool.query(
        `INSERT INTO support_chats (id, name, email, language) VALUES ($1, $2, $3, $4)`,
        [chatId, (name || cleanEmail.split('@')[0]).trim(), cleanEmail, lang]
      );
    }

    await pool.query(
      `INSERT INTO support_messages (chat_id, role, text) VALUES ($1, 'admin', $2)`,
      [chatId, text.trim()]
    );

    // إبعت إيميل للعميل فيه رسالة الأدمن + زرار يفتحله الشات مباشرة (بدون فورم اسم/إيميل)
    try {
      if (process.env.RESEND_API_KEY) {
        const appUrl = process.env.APP_URL || 'https://erivion.net';
        const chatUrl = `${appUrl}/support?openSupportChat=${chatId}`; // ✅ /support ليها route جاهز في App.jsx وبيسيب الـ query string زي ما هي
        const isAr = lang === 'ar';
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Erivion Support <support@erivion.net>',
            to: [cleanEmail],
            subject: isAr ? '💬 عندك رسالة جديدة من فريق دعم Erivion' : '💬 New message from Erivion Support',
            html: `<div dir="${isAr ? 'rtl' : 'ltr'}" style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
              <h2 style="color:#a78bfa;margin:0 0 16px">💬 ${isAr ? 'عندك رسالة جديدة من فريق الدعم' : 'You have a new message from our support team'}</h2>
              <p style="color:#9ca3af;font-size:13px;margin:0 0 16px">${isAr ? 'محتاجين نتأكد إن كل حاجة تمام معاك، رسالتنا:' : 'We wanted to check in with you. Our message:'}</p>
              <div style="background:rgba(255,255,255,0.06);border-radius:10px;padding:16px;margin:0 0 20px;color:#e5e7eb;line-height:1.7;white-space:pre-line">${text.trim()}</div>
              <a href="${chatUrl}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:linear-gradient(135deg,#7c6af7,#a855f7);color:#fff;text-decoration:none;font-weight:700;font-size:14px">${isAr ? 'افتح المحادثة ←' : 'Open Chat →'}</a>
              <p style="color:#6b7280;font-size:11px;margin-top:24px">${isAr ? 'أو انسخ الرابط ده في المتصفح:' : 'Or paste this link in your browser:'}<br><span style="color:#7c6af7">${chatUrl}</span></p>
            </div>`,
          }),
        });
      }
    } catch (e) { console.warn('[Support] Admin-start-chat email failed:', e.message); }

    res.json({ success: true, chatId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Close / delete a chat ─────────────────────────────────────────────────────
router.delete('/chat/:chatId', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    await pool.query(`DELETE FROM support_chats WHERE id = $1`, [req.params.chatId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Cleanup job (call periodically or on startup) ─────────────────────────────
router.post('/cleanup', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM support_chats WHERE expires_at < NOW()`);
    res.json({ deleted: rowCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;