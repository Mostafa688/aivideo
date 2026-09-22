// ── teamRoutes.js ─────────────────────────────────────────────────────────────
// مساحة عمل جماعية (Team/Workspace) — طلب مباشر من العميل، جزء من "إيه الناقص عشان نبقى
// زي المواقع الكبيرة". قرار العميل الصريح: كل عضو بيدخل بحسابه الخاص (دعوة بإيميل)، مش نفس
// الإيميل/الباسورد لكل الفريق — أبسط وأقرب لنظام الشركات الحقيقي. النطاق بتاع النسخة دي:
// مشاركة رصيد الكريديت بس (عضو الفريق بيسحب من رصيد صاحب الفريق — راجع resolveBillingUserId
// في authService.js) — خطة/صلاحيات كل عضو تفضل زي حسابه الأصلي، من غير تغيير في نطاق النسخة دي.
import express from 'express';
import pkg from 'pg';
import crypto from 'crypto';
import { authMiddleware } from './authRoutes.js';
import { getUserById } from './authService.js';

const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'My Team',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Team] create teams error:', e.message));

// ✅ user_id UNIQUE هنا عمدًا — بيضمن إن أي حساب يقدر يكون عضو في فريق واحد بس في نفس الوقت
// (صاحب فريقه هو، أو عضو عند حد تاني)، عشان معني "رصيد الكريديت الفعلي" يفضل واضح من غير أي
// لبس (مفيش احتمال إنك عضو في فريقين وتسحب من مين بالظبط)
pool.query(`
  CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Team] create team_members error:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS team_invites (
    id SERIAL PRIMARY KEY,
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  )
`).catch(e => console.error('[Team] create team_invites error:', e.message));

const SITE_URL = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net';
const INVITE_EXPIRY_DAYS = 14;

async function sendInviteEmail(toEmail, inviterEmail, teamName, token) {
  if (!process.env.RESEND_API_KEY) return; // بيئة محلية/تجريبية من غير مفتاح — نتخطى الإرسال بهدوء
  const link = `${SITE_URL}/team-invite/${token}`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: toEmail,
        subject: `${inviterEmail} invited you to join their Erivion team`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center"><div style="font-size:48px;margin-bottom:12px">🤝</div><h2 style="color:#a78bfa;font-size:20px;margin:0 0 8px">You're invited to "${teamName}"</h2><p style="color:#9ca3af;font-size:14px;line-height:1.7">${inviterEmail} invited you to join their team on Erivion — you'll share their credit pool.</p><a href="${link}" style="display:inline-block;margin-top:20px;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700">View Invite →</a></div></div>`,
      }),
    });
  } catch (e) {
    console.error('[Team] invite email failed (non-fatal):', e.message);
  }
}

// ── GET /api/team — حالة الفريق الحالية للمستخدم (صاحب فريق / عضو / لا حاجة) ──────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const ownedTeam = await pool.query('SELECT * FROM teams WHERE owner_user_id = $1', [userId]);
    if (ownedTeam.rows.length) {
      const team = ownedTeam.rows[0];
      const { rows: members } = await pool.query(
        `SELECT tm.user_id, tm.role, tm.joined_at, u.email
         FROM team_members tm JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = $1 ORDER BY tm.joined_at ASC`,
        [team.id]
      );
      const { rows: invites } = await pool.query(
        `SELECT id, email, status, created_at, expires_at FROM team_invites WHERE team_id = $1 AND status = 'pending' ORDER BY created_at DESC`,
        [team.id]
      );
      return res.json({ isOwner: true, team, members, pendingInvites: invites });
    }
    const membership = await pool.query(
      `SELECT tm.*, t.name AS team_name, u.email AS owner_email
       FROM team_members tm JOIN teams t ON t.id = tm.team_id JOIN users u ON u.id = t.owner_user_id
       WHERE tm.user_id = $1`,
      [userId]
    );
    if (membership.rows.length) {
      return res.json({ isMember: true, team: { name: membership.rows[0].team_name }, ownerEmail: membership.rows[0].owner_email });
    }
    res.json({ none: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/team/invite — يدعو إيميل جديد، بينشئ فريق أول مرة لو مفيش ────────────
router.post('/invite', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return res.status(400).json({ error: 'A valid email is required' });

    const inviter = await getUserById(userId);
    if (email === inviter.email.toLowerCase()) return res.status(400).json({ error: "You can't invite yourself" });

    // ✅ لو العميل عضو عند حد تاني بالفعل، مينفعش يبقى صاحب فريق كمان (user_id UNIQUE في
    // team_members بيمنع التضارب ده على مستوى قاعدة البيانات، بس بنرجع رسالة واضحة هنا الأول)
    const alreadyMember = await pool.query(`SELECT 1 FROM team_members WHERE user_id = $1 AND role = 'member'`, [userId]);
    if (alreadyMember.rows.length) return res.status(400).json({ error: 'You are already a member of another team — leave it first.' });

    let team = (await pool.query('SELECT * FROM teams WHERE owner_user_id = $1', [userId])).rows[0];
    if (!team) {
      const created = await pool.query(
        `INSERT INTO teams (owner_user_id, name) VALUES ($1, $2) RETURNING *`,
        [userId, `${inviter.email.split('@')[0]}'s Team`]
      );
      team = created.rows[0];
      await pool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')`, [team.id, userId]);
    }

    // ✅ لو الإيميل ده بالفعل حساب مسجل وعضو في أي فريق (حتى فريق العميل نفسه)، منبعتش دعوة
    // تانية من غير داعي
    const existingUser = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (existingUser.rows.length) {
      const existingMembership = await pool.query('SELECT 1 FROM team_members WHERE user_id = $1', [existingUser.rows[0].id]);
      if (existingMembership.rows.length) return res.status(400).json({ error: 'This person is already part of a team.' });
    }
    const pendingDup = await pool.query(`SELECT 1 FROM team_invites WHERE team_id = $1 AND email = $2 AND status = 'pending'`, [team.id, email]);
    if (pendingDup.rows.length) return res.status(400).json({ error: 'An invite is already pending for this email.' });

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const { rows } = await pool.query(
      `INSERT INTO team_invites (team_id, email, token, expires_at) VALUES ($1,$2,$3,$4) RETURNING *`,
      [team.id, email, token, expiresAt]
    );
    await sendInviteEmail(email, inviter.email, team.name, token);
    res.json({ invite: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/invite/:id', authMiddleware, async (req, res) => {
  try {
    const team = (await pool.query('SELECT * FROM teams WHERE owner_user_id = $1', [req.user.userId])).rows[0];
    if (!team) return res.status(404).json({ error: 'You do not own a team' });
    await pool.query(`DELETE FROM team_invites WHERE id = $1 AND team_id = $2`, [req.params.id, team.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/members/:userId', authMiddleware, async (req, res) => {
  try {
    const team = (await pool.query('SELECT * FROM teams WHERE owner_user_id = $1', [req.user.userId])).rows[0];
    if (!team) return res.status(404).json({ error: 'You do not own a team' });
    const targetUserId = parseInt(req.params.userId, 10);
    if (targetUserId === req.user.userId) return res.status(400).json({ error: "You can't remove yourself as owner — delete the team instead." });
    await pool.query(`DELETE FROM team_members WHERE user_id = $1 AND team_id = $2 AND role = 'member'`, [targetUserId, team.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── يسمح لعضو إنه يسيب الفريق بنفسه في أي وقت ────────────────────────────────────
router.post('/leave', authMiddleware, async (req, res) => {
  try {
    await pool.query(`DELETE FROM team_members WHERE user_id = $1 AND role = 'member'`, [req.user.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── معاينة دعوة عامة (من غير تسجيل دخول) قبل ما تقبلها ───────────────────────────
router.get('/invite/:token', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ti.*, t.name AS team_name, u.email AS owner_email
       FROM team_invites ti JOIN teams t ON t.id = ti.team_id JOIN users u ON u.id = t.owner_user_id
       WHERE ti.token = $1`,
      [req.params.token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
    const invite = rows[0];
    const expired = invite.status === 'pending' && new Date(invite.expires_at) < new Date();
    res.json({
      email: invite.email, teamName: invite.team_name, ownerEmail: invite.owner_email,
      status: expired ? 'expired' : invite.status,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── قبول دعوة — لازم يكون مسجل دخول بنفس الإيميل المدعو بالظبط ───────────────────
router.post('/invite/:token/accept', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM team_invites WHERE token = $1', [req.params.token]);
    if (!rows.length) return res.status(404).json({ error: 'Invite not found' });
    const invite = rows[0];
    if (invite.status !== 'pending') return res.status(400).json({ error: `This invite is already ${invite.status}.` });
    if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'This invite has expired.' });

    const user = await getUserById(req.user.userId);
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({ error: `This invite was sent to ${invite.email} — log in with that email to accept it.` });
    }
    const alreadyInATeam = await pool.query('SELECT 1 FROM team_members WHERE user_id = $1', [req.user.userId]);
    if (alreadyInATeam.rows.length) return res.status(400).json({ error: 'You are already part of a team — leave it first.' });

    await pool.query(`INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'member')`, [invite.team_id, req.user.userId]);
    await pool.query(`UPDATE team_invites SET status = 'accepted' WHERE id = $1`, [invite.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
