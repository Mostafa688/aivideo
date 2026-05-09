import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

// ── نسب العمولة لكل باقة (50% من السعر) ──────────────────────────────────
const COMMISSION_RATES = {
  // Model 1 & 2
  pro:   0.50,
  plus:  0.50,
  max:   0.50,
  // Model 3
  model3_starter: 0.50,
  model3_pro:     0.50,
  model3_max:     0.50,
  // Model 4
  model4_starter: 0.50,
  model4_creator: 0.50,
  model4_pro:     0.50,
};

// ── توليد ref_code فريد ───────────────────────────────────────────────────
function generateRefCode(email) {
  const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}${rand}`;
}

// ── Admin auth ─────────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!secret || secret !== (process.env.ADMIN_SECRET || 'erivion_admin_2026')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES (بدون auth)
// ══════════════════════════════════════════════════════════════════════════

// ── POST /api/affiliate/register ──────────────────────────────────────────
// المسوق بيسجل نفسه: email + instapay
router.post('/register', async (req, res) => {
  try {
    const { email, instapay } = req.body;
    if (!email || !instapay) {
      return res.status(400).json({ error: 'Email and InstaPay required' });
    }

    // شوف لو موجود بالفعل
    const existing = await pool.query('SELECT * FROM affiliates WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      const aff = existing.rows[0];
      return res.json({
        success: true,
        already_exists: true,
        ref_code: aff.ref_code,
        ref_link: `${process.env.FRONTEND_URL || 'https://erivion.net'}?ref=${aff.ref_code}`,
      });
    }

    // توليد كود فريد
    let ref_code = generateRefCode(email);
    // تأكد إنه مش موجود
    const codeCheck = await pool.query('SELECT id FROM affiliates WHERE ref_code = $1', [ref_code]);
    if (codeCheck.rows.length > 0) {
      ref_code = ref_code + Math.floor(Math.random() * 100);
    }

    await pool.query(
      'INSERT INTO affiliates (email, instapay, ref_code) VALUES ($1, $2, $3)',
      [email, instapay, ref_code]
    );

    res.json({
      success: true,
      ref_code,
      ref_link: `${process.env.FRONTEND_URL || 'https://erivion.net'}?ref=${ref_code}`,
    });
  } catch (err) {
    console.error('[Affiliate Register]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/affiliate/stats/:ref_code ────────────────────────────────────
// المسوق يشوف إحصائياته بكوده
router.get('/stats/:ref_code', async (req, res) => {
  try {
    const { ref_code } = req.params;
    const aff = await pool.query('SELECT * FROM affiliates WHERE ref_code = $1', [ref_code]);
    if (!aff.rows.length) return res.status(404).json({ error: 'Not found' });

    const a = aff.rows[0];

    // آخر الـ referrals
    const referrals = await pool.query(`
      SELECT event, user_email, plan, amount_egp, commission_egp, paid_out, created_at
      FROM affiliate_referrals
      WHERE ref_code = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [ref_code]);

    res.json({
      ref_code: a.ref_code,
      ref_link: `${process.env.FRONTEND_URL || 'https://erivion.net'}?ref=${a.ref_code}`,
      stats: {
        total_clicks:     a.total_clicks,
        total_referrals:  a.total_referrals,
        total_paid_users: a.total_paid_users,
        total_earned:     parseFloat(a.total_earned),
        total_paid:       parseFloat(a.total_paid),
        pending_payout:   parseFloat(a.total_earned) - parseFloat(a.total_paid),
      },
      recent_referrals: referrals.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/affiliate/click ─────────────────────────────────────────────
// Frontend بيبعت click لما حد يفتح الموقع برابط مسوق
router.post('/click', async (req, res) => {
  try {
    const { ref_code } = req.body;
    if (!ref_code) return res.json({ ok: true });

    const aff = await pool.query('SELECT id FROM affiliates WHERE ref_code = $1 AND status = $2', [ref_code, 'active']);
    if (!aff.rows.length) return res.json({ ok: true });

    // سجّل الـ click
    await pool.query(
      'INSERT INTO affiliate_referrals (affiliate_id, ref_code, event) VALUES ($1, $2, $3)',
      [aff.rows[0].id, ref_code, 'click']
    );

    // زوّد العداد
    await pool.query('UPDATE affiliates SET total_clicks = total_clicks + 1 WHERE ref_code = $1', [ref_code]);

    res.json({ ok: true });
  } catch (err) {
    console.error('[Affiliate Click]', err.message);
    res.json({ ok: true }); // مش هنوقف الموقع لو في error
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  INTERNAL FUNCTIONS (بتتاستخدم من authRoutes/adminRoutes)
// ══════════════════════════════════════════════════════════════════════════

// ── trackSignup: لما حد يسجل من رابط مسوق ───────────────────────────────
export async function trackAffiliateSignup(userId, userEmail, refCode) {
  try {
    if (!refCode) return;
    const aff = await pool.query('SELECT id FROM affiliates WHERE ref_code = $1 AND status = $2', [refCode, 'active']);
    if (!aff.rows.length) return;

    await pool.query(
      'INSERT INTO affiliate_referrals (affiliate_id, ref_code, user_id, user_email, event) VALUES ($1, $2, $3, $4, $5)',
      [aff.rows[0].id, refCode, userId, userEmail, 'signup']
    );
    await pool.query('UPDATE affiliates SET total_referrals = total_referrals + 1 WHERE ref_code = $1', [refCode]);

    // احفظ الـ ref_code على المستخدم
    await pool.query('UPDATE users SET ref_code = $1 WHERE id = $2', [refCode, userId]);
  } catch (err) {
    console.error('[Affiliate Signup Track]', err.message);
  }
}

// ── trackPayment: لما حد يدفع (بيتاستخدم من adminRoutes لما تعتمد الدفع) ─
export async function trackAffiliatePayment(userId, userEmail, planKey, amountEgp) {
  try {
    // شوف لو المستخدم جاء من مسوق
    const user = await pool.query('SELECT ref_code FROM users WHERE id = $1', [userId]);
    const refCode = user.rows[0]?.ref_code;
    if (!refCode) return;

    const aff = await pool.query('SELECT id FROM affiliates WHERE ref_code = $1', [refCode]);
    if (!aff.rows.length) return;

    const rate = COMMISSION_RATES[planKey] || 0.50;
    const commission = parseFloat((amountEgp * rate).toFixed(2));

    await pool.query(
      `INSERT INTO affiliate_referrals 
       (affiliate_id, ref_code, user_id, user_email, event, plan, amount_egp, commission_egp)
       VALUES ($1, $2, $3, $4, 'payment', $5, $6, $7)`,
      [aff.rows[0].id, refCode, userId, userEmail, planKey, amountEgp, commission]
    );

    await pool.query(`
      UPDATE affiliates 
      SET total_paid_users = total_paid_users + 1,
          total_earned = total_earned + $1
      WHERE ref_code = $2
    `, [commission, refCode]);
  } catch (err) {
    console.error('[Affiliate Payment Track]', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES (محتاج x-admin-secret)
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/affiliate/admin/list ─────────────────────────────────────────
router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM affiliates ORDER BY total_earned DESC
    `);
    res.json({ affiliates: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/affiliate/admin/referrals/:ref_code ──────────────────────────
router.get('/admin/referrals/:ref_code', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT * FROM affiliate_referrals
      WHERE ref_code = $1
      ORDER BY created_at DESC
    `, [req.params.ref_code]);
    res.json({ referrals: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/affiliate/admin/payout ─────────────────────────────────────
// لما تحول للمسوق، سجّل الدفع
router.post('/admin/payout', adminAuth, async (req, res) => {
  try {
    const { ref_code, amount } = req.body;
    if (!ref_code || !amount) return res.status(400).json({ error: 'ref_code and amount required' });

    await pool.query(
      'UPDATE affiliates SET total_paid = total_paid + $1 WHERE ref_code = $2',
      [amount, ref_code]
    );

    // علّم الـ referrals كمدفوعة
    await pool.query(
      'UPDATE affiliate_referrals SET paid_out = TRUE WHERE ref_code = $1 AND paid_out = FALSE AND event = $2',
      [ref_code, 'payment']
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/affiliate/admin/suspend ────────────────────────────────────
router.post('/admin/suspend', adminAuth, async (req, res) => {
  try {
    const { ref_code, status } = req.body; // status: 'active' | 'suspended'
    await pool.query('UPDATE affiliates SET status = $1 WHERE ref_code = $2', [status, ref_code]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
