import express from 'express';
import pkg from 'pg';
import { adminAuth } from './adminAuthMiddleware.js';
const { Pool } = pkg;

const router = express.Router();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

// ── التكاليف الحقيقية لكل خطة (EGP) ──────────────────────────────────────
const PLAN_COSTS = {
  // Model 1 & 2 (تكلفة بسيطة جداً - Groq مجاني + Pexels)
  pro:   5,
  plus:  5,
  max:   5,
  // Model 3 (Stability AI - 5 credits/صورة، $10/1000 credits)
  m3_starter: 190,  // 5×30s(3img) + 10×1min(6img) = 75img × 0.05$ × 50EGP ≈ 190 EGP
  m3_pro:     560,  // 5×30s + 5×1min + 10×3min(18img) = 225img × 0.05$ × 50EGP ≈ 560 EGP
  m3_max:    1050,  // 5×1min + 5×3min + 10×5min(30img) = 420img × 0.05$ × 50EGP ≈ 1050 EGP
  // Model 4 (Seedance - 30s=$0.5, 1min=$1, 3min=$3)
  m4_plan1:   300,  // 10×30s($5) + 1×1min($1) = $6 × 50 = 300 EGP
  m4_plan2:   575,  // 3×30s($1.5) + 10×1min($10) = $11.5 × 50 = 575 EGP
  m4_plan3:  1725,  // 3×30s($1.5) + 3×1min($3) + 10×3min($30) = $34.5 × 50 = 1725 EGP
  // أسماء بديلة
  model3_starter: 190,
  model3_pro:     560,
  model3_max:    1050,
  model4_starter:  300,
  model4_creator:  575,
  model4_pro:     1725,
};

// ── أسعار الخطط (EGP) ────────────────────────────────────────────────────
const PLAN_PRICES = {
  pro:   50,
  plus:  100,
  max:   250,
  m3_starter:  300,
  m3_pro:      750,
  m3_max:     1400,
  m4_plan1:    450,
  m4_plan2:    800,
  m4_plan3:   2250,
  model3_starter:  300,
  model3_pro:      750,
  model3_max:     1400,
  model4_starter:  450,
  model4_creator:  800,
  model4_pro:     2250,
};

// ── نظام الكريديت الموحد (credits_starter...credits_agency، والشحن المصري بالسلايدر) ──
// مفيش تكلفة ثابتة نقدر نحسب هامش ربح منها هنا، لأن الكريديت ممكن يتصرف على أي موديل
// (موديل 1 رخيص جدًا، موديل 5/الإعلانات أغلى بكتير) — فبدل حساب هامش، بنستخدم نسبة
// عمولة ثابتة من قيمة الشحنة نفسها. غيّر الرقم ده لو عايز نسبة مختلفة.
const CREDIT_PACK_COMMISSION_RATE = 0.20; // 20% من قيمة أي شحن كريديت (مصري أو دولي)

// ── حساب العمولة = 50% من هامش الربح (للخطط القديمة الثابتة) ────────────
function calculateCommission(planKey, amountEgp) {
  // ✅ شحن كريديت موحد (أي موديل، بما فيهم موديل الإعلانات دلوقتي) → نسبة ثابتة من قيمة الشحن
  if (planKey === 'credits_custom' || String(planKey || '').startsWith('credits_')) {
    return parseFloat(((amountEgp || 0) * CREDIT_PACK_COMMISSION_RATE).toFixed(2));
  }
  const cost = PLAN_COSTS[planKey] || 0;
  const price = amountEgp || PLAN_PRICES[planKey] || 0;
  const profit = Math.max(0, price - cost);
  return parseFloat((profit * 0.50).toFixed(2));
}

// ── توليد ref_code فريد ───────────────────────────────────────────────────
function generateRefCode(email) {
  const base = email.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}${rand}`;
}

// ══════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ══════════════════════════════════════════════════════════════════════════

router.post('/register', async (req, res) => {
  try {
    const { email, instapay } = req.body;
    if (!email || !instapay) return res.status(400).json({ error: 'Email and InstaPay required' });

    const existing = await pool.query('SELECT * FROM affiliates WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      const aff = existing.rows[0];
      return res.json({
        success: true, already_exists: true,
        ref_code: aff.ref_code,
        ref_link: `${process.env.FRONTEND_URL || 'https://erivion.net'}?ref=${aff.ref_code}`,
      });
    }

    let ref_code = generateRefCode(email);
    const codeCheck = await pool.query('SELECT id FROM affiliates WHERE ref_code = $1', [ref_code]);
    if (codeCheck.rows.length > 0) ref_code = ref_code + Math.floor(Math.random() * 100);

    await pool.query('INSERT INTO affiliates (email, instapay, ref_code) VALUES ($1, $2, $3)', [email, instapay, ref_code]);

    res.json({
      success: true, ref_code,
      ref_link: `${process.env.FRONTEND_URL || 'https://erivion.net'}?ref=${ref_code}`,
    });
  } catch (err) {
    console.error('[Affiliate Register]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/:ref_code', async (req, res) => {
  try {
    const { ref_code } = req.params;
    const aff = await pool.query('SELECT * FROM affiliates WHERE ref_code = $1', [ref_code]);
    if (!aff.rows.length) return res.status(404).json({ error: 'Not found' });
    const a = aff.rows[0];

    const referrals = await pool.query(`
      SELECT event, user_email, plan, amount_egp, commission_egp, paid_out, created_at
      FROM affiliate_referrals WHERE ref_code = $1 ORDER BY created_at DESC LIMIT 50
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

router.post('/click', async (req, res) => {
  try {
    const { ref_code } = req.body;
    if (!ref_code) return res.json({ ok: true });
    const aff = await pool.query('SELECT id FROM affiliates WHERE ref_code = $1 AND status = $2', [ref_code, 'active']);
    if (!aff.rows.length) return res.json({ ok: true });
    await pool.query('INSERT INTO affiliate_referrals (affiliate_id, ref_code, event) VALUES ($1, $2, $3)', [aff.rows[0].id, ref_code, 'click']);
    await pool.query('UPDATE affiliates SET total_clicks = total_clicks + 1 WHERE ref_code = $1', [ref_code]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Affiliate Click]', err.message);
    res.json({ ok: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  INTERNAL FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════

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
    await pool.query('UPDATE users SET ref_code = $1 WHERE id = $2', [refCode, userId]);
  } catch (err) {
    console.error('[Affiliate Signup Track]', err.message);
  }
}

export async function trackAffiliatePayment(userId, userEmail, planKey, amountEgp) {
  try {
    const user = await pool.query('SELECT ref_code FROM users WHERE id = $1', [userId]);
    const refCode = user.rows[0]?.ref_code;
    if (!refCode) return;

    const aff = await pool.query('SELECT id FROM affiliates WHERE ref_code = $1', [refCode]);
    if (!aff.rows.length) return;

    // ✅ العمولة من هامش الربح مش من السعر الكامل
    const commission = calculateCommission(planKey, amountEgp);

    await pool.query(
      `INSERT INTO affiliate_referrals 
       (affiliate_id, ref_code, user_id, user_email, event, plan, amount_egp, commission_egp)
       VALUES ($1, $2, $3, $4, 'payment', $5, $6, $7)`,
      [aff.rows[0].id, refCode, userId, userEmail, planKey, amountEgp, commission]
    );

    await pool.query(`
      UPDATE affiliates 
      SET total_paid_users = total_paid_users + 1, total_earned = total_earned + $1
      WHERE ref_code = $2
    `, [commission, refCode]);
  } catch (err) {
    console.error('[Affiliate Payment Track]', err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════════════════════════════════════

router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM affiliates ORDER BY total_earned DESC');
    res.json({ affiliates: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/referrals/:ref_code', adminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM affiliate_referrals WHERE ref_code = $1 ORDER BY created_at DESC', [req.params.ref_code]);
    res.json({ referrals: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/payout', adminAuth, async (req, res) => {
  try {
    const { ref_code, amount } = req.body;
    if (!ref_code || !amount) return res.status(400).json({ error: 'ref_code and amount required' });
    await pool.query('UPDATE affiliates SET total_paid = total_paid + $1 WHERE ref_code = $2', [amount, ref_code]);
    await pool.query('UPDATE affiliate_referrals SET paid_out = TRUE WHERE ref_code = $1 AND paid_out = FALSE AND event = $2', [ref_code, 'payment']);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/suspend', adminAuth, async (req, res) => {
  try {
    const { ref_code, status } = req.body;
    await pool.query('UPDATE affiliates SET status = $1 WHERE ref_code = $2', [status, ref_code]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;