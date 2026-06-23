import express from 'express';
import pool from './db.js';

const router = express.Router();

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
    // Auto-delete expired chats job (runs on startup)
    await pool.query(`DELETE FROM support_chats WHERE expires_at < NOW()`);
    console.log('[Support] Tables ready');
  } catch (e) { console.warn('[Support] Init error:', e.message); }
})();

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

    // Notify admin by email
    const isAr = language === 'ar';
    try {
      await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/auth/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
          subject: `💬 New Support Chat — ${name} (${language === 'ar' ? 'Arabic' : 'English'})`,
          html: `
            <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
              <h2 style="color:#a78bfa;margin:0 0 16px">💬 New Support Chat Started</h2>
              <table style="width:100%;border-collapse:collapse;margin:16px 0">
                <tr><td style="color:#888;padding:8px 0;width:100px">Name</td><td style="color:#fff;font-weight:600">${name}</td></tr>
                <tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff">${email}</td></tr>
                <tr><td style="color:#888;padding:8px 0">Language</td><td style="color:#fff">${language === 'ar' ? '🇸🇦 Arabic' : '🇺🇸 English'}</td></tr>
                <tr><td style="color:#888;padding:8px 0">Chat ID</td><td style="color:#7c6af7;font-family:monospace;font-size:12px">${chatId}</td></tr>
              </table>
              <p style="color:#888;font-size:13px">Reply to this customer from your Admin Panel → Support tab.</p>
              <div style="margin-top:20px;padding:12px;background:rgba(124,106,247,0.1);border-radius:8px;border:1px solid rgba(124,106,247,0.2)">
                <p style="color:#a78bfa;font-size:13px;margin:0">⚡ This chat will auto-delete in 24 hours.</p>
              </div>
            </div>
          `,
        }),
      });
    } catch (e) { console.warn('[Support] Email notify failed:', e.message); }

    res.json({ chatId, success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Send a message ────────────────────────────────────────────────────────────
router.post('/message', async (req, res) => {
  const { chatId, text, role, autoAnswer } = req.body;
  if (!chatId || !text || !role) return res.status(400).json({ error: 'chatId, text, role required' });
  try {
    await pool.query(
      `INSERT INTO support_messages (chat_id, role, text) VALUES ($1, $2, $3)`,
      [chatId, role, text.trim()]
    );
    // If there's an auto-answer (from FAQ), insert it as admin reply
    if (autoAnswer) {
      await pool.query(
        `INSERT INTO support_messages (chat_id, role, text) VALUES ($1, 'admin', $2)`,
        [chatId, autoAnswer]
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get messages for a chat ───────────────────────────────────────────────────
router.get('/messages/:chatId', async (req, res) => {
  const { chatId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT role, text, created_at as time FROM support_messages WHERE chat_id = $1 ORDER BY created_at ASC`,
      [chatId]
    );
    res.json({ messages: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Get all open chats (admin) ────────────────────────────────────────────────
router.get('/chats', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  try {
    const { rows } = await pool.query(`
      SELECT sc.*, 
        (SELECT text FROM support_messages WHERE chat_id = sc.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM support_messages WHERE chat_id = sc.id AND role = 'user') as user_msg_count,
        (SELECT COUNT(*) FROM support_messages WHERE chat_id = sc.id AND role = 'admin') as admin_msg_count
      FROM support_chats sc
      WHERE sc.expires_at > NOW()
      ORDER BY sc.created_at DESC
    `);
    res.json({ chats: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Admin reply ───────────────────────────────────────────────────────────────
router.post('/admin-reply', async (req, res) => {
  const secret = req.headers['x-admin-secret'] || req.body.secret;
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  const { chatId, text } = req.body;
  if (!chatId || !text) return res.status(400).json({ error: 'chatId and text required' });
  try {
    await pool.query(
      `INSERT INTO support_messages (chat_id, role, text) VALUES ($1, 'admin', $2)`,
      [chatId, text.trim()]
    );
    res.json({ success: true });
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
