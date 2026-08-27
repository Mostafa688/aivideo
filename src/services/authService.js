import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { deleteAudioVideoFileFromR2 } from './audioVideoService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'erivion_secret_2026';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

// ── Credit costs per duration — نظام الكريديت الموحد (نفس الرصيد لكل الموديلات) ──
export const MODEL12_CREDIT_COSTS = {
  '30s': 5, 'auto': 5, '1min': 10, '2min': 20,
  '3min': 30, '4min': 40, '5min': 50, '8min': 80, '10min': 100,
};

export const MODEL3_CREDIT_COSTS = { '30s': 20, '1min': 40, '2min': 80, '3min': 120, '5min': 200 };
export const MODEL4_CREDIT_COSTS = { '30s': 100, '1min': 200, '2min': 400, '3min': 600 };
// موديل 5: أرخص لو من النص، أعلى شوية لو فيه صورة شخصية (رفرنس صورة لكل مشهد)
export const MODEL5_CREDIT_COSTS = { '5s': 60, '10s': 120, '15s': 180, '30s': 360, '1min': 720 };
export const MODEL5_CREDIT_COSTS_WITH_PHOTO = { '5s': 65, '10s': 125, '15s': 185, '30s': 390, '1min': 780 };
// ✅ NEW: كل صورة إضافية بتزود تكلفة حقيقية على Replicate (دمج FLUX لكل صورة زيادة) —
// +25 كريديت لكل صورة إضافية بعد الأولى، بنفس القيمة في كل مدة (5s/10s/15s/30s/1min) —
// مطابق تمامًا لجدول التكلفة اللي اتفقنا عليه: 1 صورة=الأساس، 2=+25، 3=+50، 4=+75، 5=+100
export const MODEL5_EXTRA_CREDITS_PER_PHOTO = 25;
// ✅ FIX: كان fallback الأساس بيرجّع رقم ثابت (180/185) لأي "duration" مش موجودة في الجدول
// (الجدول بيغطي بس 5s/10s/15s/30s/1min) — ده كان بيضيف رسم أساسي وهمي فوق سرشارج المشاهد
// الإضافية اللي بيتحسب في index.js لأي مدة كلية مخصصة برة الجدول (مفيش سقف مدة أصلًا).
// دلوقتي 0 لأي مدة مش معروفة، والتكلفة كلها بتيجي من عدد المشاهد الحقيقي × السعر الإضافي
export function getModel5CreditCost(duration, photoCount = 0) {
  const base = photoCount > 0 ? (MODEL5_CREDIT_COSTS_WITH_PHOTO[duration] || 0) : (MODEL5_CREDIT_COSTS[duration] || 0);
  const extra = photoCount > 1 ? MODEL5_EXTRA_CREDITS_PER_PHOTO * (photoCount - 1) : 0;
  return base + extra;
}

export const PLANS = {
  free: {
    name: 'Free', price_monthly: 0, price_yearly: 0,
    credits_weekly: 10,   // 10 credits/week → ~3 videos of 30s (3cr each)
    videos_weekly: null,  // no video cap — credit cap governs
    max_duration: '30s', watermark: true, captions: true, music: true, transitions: true,
    sound_effects: false, video_effects: false, edit_after_render: false,
    languages: ['en', 'ar'], all_languages: false,
  },
  pro: {
    name: 'Pro', price_monthly: 100, price_first_month: 25, price_yearly: 720,
    credits_weekly: 400,  // 400 credits/week → ~133 × 30s or ~66 × 1min
    videos_weekly: null,
    max_duration: '2min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: false, video_effects: false, edit_after_render: true,
    languages: ['en', 'ar', 'de', 'fr'], all_languages: false,
  },
  plus: {
    name: 'Plus', price_monthly: 220, price_first_month: 75, price_yearly: 1584,
    credits_weekly: 60,   // 60 credits/week → ~20 × 30s or ~10 × 1min
    videos_weekly: null,
    max_duration: '5min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: true, video_effects: false, edit_after_render: true,
    languages: null, all_languages: true,
  },
  max: {
    name: 'Max', price_monthly: 550, price_first_month: 150, price_yearly: 3960,
    credits_weekly: 600,  // 600 credits/week → ~200 × 30s or ~10 × 10min
    videos_weekly: null,
    max_duration: '10min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: true, video_effects: true, edit_after_render: true,
    languages: null, all_languages: true,
  },
  // ── يتفعّل تلقائيًا أول ما العميل يشحن أي رصيد كريديت حقيقي ──
  // بيفتح كل الموديلات (1-5) ويشيل العلامة المائية — قبل كده العميل على "free" مقصور على موديل 2 بس + علامة مائية
  paid: {
    name: 'Paid', price_monthly: 0, price_yearly: 0,
    credits_weekly: null, videos_weekly: null,
    max_duration: '10min', watermark: false, captions: true, music: true, transitions: true,
    sound_effects: true, video_effects: true, edit_after_render: true,
    languages: null, all_languages: true,
  },
};

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
    ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS paid_out INTEGER DEFAULT 0;
    ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS paid_out_at TEXT DEFAULT NULL;
    ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS credits_purchased INTEGER DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_balance INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trustpilot_prompted INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS free_credits_week_reset TEXT DEFAULT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS upgrade_email_week TEXT DEFAULT NULL;
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      name TEXT DEFAULT 'Default Key',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS oauth_clients (
      id SERIAL PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      redirect_uris JSONB NOT NULL DEFAULT '[]',
      client_name TEXT DEFAULT 'MCP Client',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS feedback_ratings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      user_email TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      model_used TEXT,
      created_at TEXT DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_email TEXT,
      plan TEXT,
      user_message TEXT,
      agent_reply TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS model4_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      videos_30s INTEGER DEFAULT 0,
      videos_1min INTEGER DEFAULT 0,
      videos_3min INTEGER DEFAULT 0,
      last_reset TEXT DEFAULT CURRENT_DATE
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model4_access INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model3_trial_used INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model4_plan TEXT DEFAULT NULL`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model4_trial_used INTEGER DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      email TEXT,
      method TEXT DEFAULT 'password',
      created_at TEXT DEFAULT NOW()
    );
  `);
  // ✅ FIX: getUserById بيقرأ العمودين دول من زمان بس مفيش أي CREATE/ALTER بينشئهم — ده كان
  // بيكسر أي SELECT عادي على قاعدة بيانات جديدة (column does not exist)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS erivion_access INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS erivion_plan TEXT DEFAULT NULL`);
  // ✅ NEW: منطقة العميل (مصري/دولي) — كانت بتتضاف بس lazy جوه GET /admin/users، دلوقتي
  // migration حقيقي عشان أي مكان تاني في الكود (زي الايجنت) يقدر يقرأها/يكتبها بأمان
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS region TEXT DEFAULT NULL`);
  // ✅ FIX: كان endpoint /api/auth/onboarding-answers بيعمل INSERT في الجدول ده من غير ما
  // يكون معمول له CREATE أصلاً — ده كان هيفشل (relation does not exist) على أي قاعدة بيانات جديدة
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_onboarding (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      source TEXT,
      content_type TEXT,
      style TEXT,
      budget TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // ── ذاكرة الايجنت — بيحفظ طلبات فيديو "غير عادية" اتفهمت واتنفذت قبل كده، عشان لو نفس
  // العميل (أو عميل تاني) بعت طلب مشابه تاني، الايجنت يتعرف عليه ويطبّق نفس الفهم تلقائيًا
  // من غير ما يعيد كل الأسئلة التوضيحية من الأول ──────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_request_memory (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      fingerprint TEXT NOT NULL,
      raw_request TEXT NOT NULL,
      resolved_config JSONB NOT NULL,
      model INTEGER,
      hits INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_used_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // pg_trgm بيدّي بحث "شبه/similarity" حقيقي بدل ما نتقيد بمطابقة نص حرفية — لو الإضافة
  // مش متاحة على السيرفر (صلاحيات مثلاً)، بنكمل عادي وبنرجع لـ ILIKE كـ fallback وقت البحث
  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_agent_request_memory_trgm ON agent_request_memory USING gin (fingerprint gin_trgm_ops)`);
  } catch (e) {
    console.warn('[DB] pg_trgm extension unavailable, agent memory will use plain-text fallback matching:', e.message);
  }
  // ── فويس كلون — عينة صوت العميل المحفوظة (Replicate/chatterbox-multilingual) — بيتسجل
  // مرة واحدة، وبعدين أي فيديو بصوت مستنسخ بيستخدم نفس العينة دي من غير ما يترفع تاني ────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cloned_voices (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT,
      sample_url TEXT NOT NULL,
      duration_sec NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // ── إدارة قناة العميل يوميًا: مفتاح VidIQ الشخصي بتاعه + تفضيلاته، وسجل كل يوم
  // اقترحنا فيه فكرة وانتظرنا موافقته قبل ما نعمل الفيديو ────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS managed_channels (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT DEFAULT 'youtube',
      label TEXT,
      channel_id TEXT,
      vidiq_api_key TEXT NOT NULL,
      format_pref TEXT DEFAULT 'auto',
      uses_voice INTEGER DEFAULT 0,
      voice_id TEXT DEFAULT NULL,
      model_pref INTEGER DEFAULT 4,
      status TEXT DEFAULT 'active',
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS daily_video_runs (
      id SERIAL PRIMARY KEY,
      channel_id INTEGER NOT NULL REFERENCES managed_channels(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idea_title TEXT,
      idea_brief TEXT,
      format TEXT,
      approve_token TEXT UNIQUE,
      status TEXT DEFAULT 'pending',
      video_url TEXT,
      youtube_video_id TEXT,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      decided_at TIMESTAMPTZ
    );
  `);
  await pool.query('ALTER TABLE daily_video_runs ADD COLUMN IF NOT EXISTS youtube_video_id TEXT').catch(() => {});
  // ── مصنع فيديو الصوت الأدمن — رفع فويس أوفر جاهز، والموقع يفرّغه (Whisper) ويستخرج
  // العناصر (LLM) ويجيب/يولّد صورهم ويعمل الفيديو النهائي. Pipeline بمراحل، كل مرحلة
  // بتحدث نفس الـ job بحالتها الجديدة عشان الأدمن يشوف التقدم ─────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audio_video_jobs (
      id SERIAL PRIMARY KEY,
      audio_url TEXT NOT NULL,
      transcript_text TEXT,
      words_json JSONB,
      elements_json JSONB,
      video_url TEXT,
      ratio TEXT DEFAULT '16:9',
      status TEXT DEFAULT 'transcribing',
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // ✅ NEW (طلب العميل): "مشاهد مركّبة" — صورة واحدة (زي دايجرام 11 مرحلة) بيرفعها الأدمن
  // لفترة زمنية معيّنة في الفيديو، مع نقاط زوم/pan محددة يدويًا (كل نقطة = مربع قص من
  // الصورة + وقت توصل فيه) بدل ما تتقسم لملصقات منفصلة زي باقي الفيديو
  await pool.query('ALTER TABLE audio_video_jobs ADD COLUMN IF NOT EXISTS composite_scenes_json JSONB').catch(() => {});
  // ✅ NEW (طلب العميل): الفيديو النهائي يتحذف تلقائيًا من R2 بعد 24 ساعة من التصيير عشان
  // التخزين مايتجمعش — محتاجين نعرف امتى بالظبط الفيديو بقى جاهز (مش وقت إنشاء الـ job نفسه)
  await pool.query('ALTER TABLE audio_video_jobs ADD COLUMN IF NOT EXISTS video_ready_at TIMESTAMPTZ').catch(() => {});
  // ✅ NEW (طلب العميل): لما الصوت بيتقسم لأكتر من ملف، بنسجّل حدود كل جزء (اسمه الأصلي +
  // من/لحد ثانية جوه التايم لاين المدموج) — ده اللي بيخلي الأدمن يقدر يحدد "ثانية X جوه
  // الصوت رقم N" بدل ما يحسب الثانية المطلقة يدويًا لأي نقطة زوم/تقسيم
  await pool.query('ALTER TABLE audio_video_jobs ADD COLUMN IF NOT EXISTS audio_parts_json JSONB').catch(() => {});
  // ✅ NEW (طلب العميل: "فيديو whiteboard مجاني للناس كلها"): مصنع الصوت-للفيديو ده كان
  // أدمن-فقط بالكامل (jobs مجهولة الهوية، بيتشافوا بس من لوحة الأدمن) — دلوقتي محتاجينه
  // يبقى منتج عام لكل مستخدم مسجّل، فمحتاج يتربط بحساب المستخدم صاحبه عشان يقدر يشوف
  // فيديوهاته بعدين ويكملها (زر "Continue Video")
  await pool.query('ALTER TABLE audio_video_jobs ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id)').catch(() => {});
  // ✅ NEW ("Continue Video"): بيسجّل آخر مدة (بالثانية) اتعمل لها رندر فعلي لنفس الـjob ده —
  // لازم نعرفها عشان أي "تكملة" لاحقة (AI أو يدوي) تعرف: (1) تحسب الوقت الجديد من غير ما
  // تتكرر مع القديم، (2) تخصم من رصيد الـ10 دقايق بس الفرق الجديد المُضاف، مش الفيديو كله
  // تاني من الأول في كل مرة
  await pool.query('ALTER TABLE audio_video_jobs ADD COLUMN IF NOT EXISTS rendered_seconds NUMERIC DEFAULT 0').catch(() => {});
  // ✅ NEW: رصيد الفيديو المجاني (whiteboard) — 10 دقايق (600 ثانية) مدى الحياة لكل حساب،
  // بيتوزع على أي عدد فيديوهات/تكملات، مش لكل فيديو لوحده (اتفقنا مع العميل على كده صراحة)
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS whiteboard_free_seconds_used INTEGER DEFAULT 0').catch(() => {});
  // ✅ FIX: حالة "extracting"/"rendering" كانت بتعيش في ذاكرة الـ process بس (fire-and-forget
  // async IIFE) — لو السيرفر اترستارت في نص الشغل (ديبلوي جديد، كراش، صيانة Railway)، الشغل
  // بيتقفل من غير ما حد يحدّث حالة الـ job، فيفضل عالق على "extracting" للأبد من غير أي طريقة
  // يتعافى بيها لوحده. بنعمل تنظيف مرة واحدة عند كل bootstrap: أي job كان لسه شغال وقت ما
  // السيرفر القديم اتقفل يتحول لـ "failed" برسالة واضحة، عشان الأدمن يقدر يعيد المحاولة
  await pool.query(
    `UPDATE audio_video_jobs SET status = 'failed', error = 'Interrupted by a server restart — please retry'
     WHERE status IN ('extracting', 'rendering')`
  ).catch(e => console.warn('[DB] Could not clean up stuck audio_video_jobs:', e.message));
  // ✅ NEW (طلب العميل): صور مرجعية ثابتة بيرفعها الأدمن مرة واحدة (مش لكل job) — القرآن
  // الكريم، صحيح البخاري، صحيح مسلم، إلخ — بتتستخدم تلقائيًا لأي لقطة "quote" (آية/حديث)
  // بدل ما تفضل نص بس من غير أي صورة، لو الأدمن رفع صورة لنفس المصدر ده
  await pool.query(`
    CREATE TABLE IF NOT EXISTS audio_video_reference_images (
      id SERIAL PRIMARY KEY,
      ref_key TEXT UNIQUE NOT NULL,
      label TEXT,
      image_url TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[DB] PostgreSQL tables ready');
}

initDB().catch(err => console.error('[DB] Init error:', err.message));

// ── Agent chat logging (admin monitoring) ───────────────────────────────────
// كل تبادل (رسالة عميل + رد الايجنت) بيتسجل هنا عشان الأدمن يقدر يراجع مشاكل العملاء
// من غير ما يستنى حد يشتكي. بيتمسح تلقائيًا بعد 24 ساعة (privacy + مساحة).
export async function logAgentConversation(userId, userEmail, plan, userMessage, agentReply) {
  try {
    await pool.query(
      `INSERT INTO agent_conversations (user_id, user_email, plan, user_message, agent_reply) VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, userEmail || null, plan || null, (userMessage || '').slice(0, 6000), (agentReply || '').slice(0, 6000)]
    );
  } catch (e) {
    console.warn('[Agent Log] insert failed:', e.message);
  }
}

export async function getRecentAgentConversations(hours = 24) {
  const { rows } = await pool.query(
    `SELECT id, user_id, user_email, plan, user_message, agent_reply, created_at
     FROM agent_conversations
     WHERE created_at >= NOW() - ($1 || ' hours')::interval
     ORDER BY created_at DESC
     LIMIT 500`,
    [String(hours)]
  );
  return rows;
}

export async function cleanupExpiredAgentConversations() {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM agent_conversations WHERE created_at < NOW() - INTERVAL '24 hours'`
    );
    if (rowCount) console.log(`[Agent Log] 🧹 auto-deleted ${rowCount} conversation row(s) older than 24h`);
  } catch (e) {
    console.warn('[Agent Log] cleanup failed:', e.message);
  }
}

// بتتنضف كل ساعة عشان الجدول ميفضلش يكبر، وبرضو بنفلتر بـ 24 ساعة وقت القراءة كحماية إضافية
setInterval(() => { cleanupExpiredAgentConversations(); }, 60 * 60 * 1000);

// ✅ NEW (طلب العميل): الفيديو النهائي بتاع مصنع الصوت-لفيديو يتحذف تلقائيًا من R2 بعد 24
// ساعة من التصيير عشان التخزين مايتجمعش — الأدمن لازم ينزّله لو عايز يحتفظ بيه قبل كده.
// بنمسح ملف R2 نفسه الأول، وبعدين نصفّر video_url ونحوّل الحالة لـ"expired" في نفس الصف
// (مش بنمسح الـ job كله — الترانسكريبت/العناصر بتفضل موجودة للمرجعية)
export async function cleanupExpiredAudioVideoRenders() {
  try {
    const { rows } = await pool.query(
      `SELECT id, video_url FROM audio_video_jobs
       WHERE status = 'done' AND video_url IS NOT NULL AND video_ready_at < NOW() - INTERVAL '24 hours'`
    );
    for (const row of rows) {
      await deleteAudioVideoFileFromR2(row.video_url);
      await pool.query(`UPDATE audio_video_jobs SET video_url = NULL, status = 'expired' WHERE id = $1`, [row.id]);
    }
    if (rows.length) console.log(`[AudioVideo] 🧹 expired ${rows.length} render(s) older than 24h`);
  } catch (e) {
    console.warn('[AudioVideo] Expired render cleanup failed:', e.message);
  }
}
setInterval(() => { cleanupExpiredAudioVideoRenders(); }, 60 * 60 * 1000);

// ✅ Secure random code using crypto
function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
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
          html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:36px;background:#0f0f1a;color:#fff;border-radius:16px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:56px;margin-bottom:12px">⏰</div><h2 style="color:#f59e0b;font-size:22px;margin:0 0 8px">Your subscription has expired</h2></div><div style="text-align:center"><a href="${frontendUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Renew Subscription →</a></div></div>`,
        }),
      });
    } catch (e) { console.warn('[PlanExpiry] Email failed:', e.message); }
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

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: نظام API Keys — للمستخدمين اللي عايزين يستخدموا Erivion من خارج الموقع
//  (زي MCP server في Claude). المفتاح نفسه بيتخزن مجزأ (hash) زي الباسورد بالظبط —
//  بيبان كامل مرة واحدة بس وقت الإنشاء، بعدها مفيش أي طريقة نرجعه تاني.
// ══════════════════════════════════════════════════════════════════════════
function hashApiKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export async function generateApiKey(userId, name = 'Default Key') {
  const raw = 'eriv_' + crypto.randomBytes(24).toString('hex');
  const hash = hashApiKey(raw);
  const prefix = raw.slice(0, 13) + '…';
  await pool.query(
    'INSERT INTO api_keys (user_id, key_hash, key_prefix, name) VALUES ($1, $2, $3, $4)',
    [userId, hash, prefix, (name || 'Default Key').trim().slice(0, 60)]
  );
  return raw; // ⚠️ آخر مرة يتشاف المفتاح كامل — الـ caller لازم يعرضه للمستخدم فورًا ويحذّره إنه مش هيتكرر
}

export async function listApiKeys(userId) {
  const { rows } = await pool.query(
    'SELECT id, key_prefix, name, created_at, last_used_at FROM api_keys WHERE user_id = $1 ORDER BY id DESC',
    [userId]
  );
  return rows;
}

export async function revokeApiKey(userId, keyId) {
  await pool.query('DELETE FROM api_keys WHERE id = $1 AND user_id = $2', [keyId, userId]);
}

// ✅ بيتنادى من mcpRoutes.js في كل طلب — بيرجع userId لو المفتاح صحيح ومفعّل، وإلا null
export async function verifyApiKey(raw) {
  if (!raw || !raw.startsWith('eriv_')) return null;
  const hash = hashApiKey(raw);
  const { rows } = await pool.query('SELECT id, user_id FROM api_keys WHERE key_hash = $1', [hash]);
  if (!rows.length) return null;
  pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [rows[0].id]).catch(() => {});
  return rows[0].user_id;
}

// ✅ بيتنادى من mcpRoutes.js عشان يبني JWT قصير العمر (10 دقايق) للمستخدم اللي معاه API key
// صحيح، عشان يقدر يستخدم نفس الـ REST endpoints الداخلية الموجودة أصلاً (authMiddleware
// بيتعامل مع الـ JWT ده زي أي JWT عادي) — من غير ما نكرر منطق الكريديت/الفحص من الصفر
export function mintInternalToken(userId, email) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '10m' });
}

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: OAuth 2.1 server كامل عشان الـ MCP connector يشتغل زي أي connector تاني
//  في Claude.ai (Dynamic Client Registration + Authorization Code + PKCE) — بدل
//  ما نعتمد بس على ميزة الـ "Request headers" اللي لسه في beta ومش وصلة لكل حساب.
// ══════════════════════════════════════════════════════════════════════════

// تحقق من الإيميل/الباسورد من غير أي side-effects (إيميلات، تسجيل دخول، إلخ) — للاستخدام
// في صفحة موافقة الـ OAuth بس
export async function verifyUserCredentials(email, password) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) throw new Error('Invalid email or password');
  const user = rows[0];
  if (!user.verified) throw new Error('Please verify your email first');
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error('Invalid email or password');
  return { userId: user.id, email: user.email, name: user.name || email.split('@')[0] };
}

// تسجيل عميل OAuth جديد (Dynamic Client Registration، RFC 7591) — Claude.ai بيعمل
// النداء ده تلقائيًا أول مرة يحاول يضيف الـ connector
export async function registerOAuthClient(redirectUris, clientName) {
  const clientId = 'client_' + crypto.randomBytes(16).toString('hex');
  await pool.query(
    'INSERT INTO oauth_clients (client_id, redirect_uris, client_name) VALUES ($1, $2, $3)',
    [clientId, JSON.stringify(redirectUris || []), clientName || 'MCP Client']
  );
  return clientId;
}

export async function getOAuthClient(clientId) {
  const { rows } = await pool.query('SELECT * FROM oauth_clients WHERE client_id = $1', [clientId]);
  return rows[0] || null;
}

// توكن دخول طويل العمر (90 يوم) للـ MCP — منفصل عن mintInternalToken قصير العمر،
// عشان الـ MCP client (Claude) بيحتفظ بيه ويستخدمه لفترة طويلة، مش نداء واحد بس
export function mintOAuthAccessToken(userId, email) {
  return jwt.sign({ userId, email, scope: 'mcp' }, JWT_SECRET, { expiresIn: '90d' });
}

// ✅ للتحقق من توكن الـ OAuth في mcpRoutes.js من غير ما نصدّر الـ JWT_SECRET نفسه للخارج
export function verifyOAuthToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export async function logLoginEvent(userId, email, method = 'password') {
  try {
    await pool.query('INSERT INTO login_events (user_id, email, method) VALUES ($1, $2, $3)', [userId, email, method]);
  } catch (e) { console.warn('[LoginEvent] failed:', e.message); }
}

// ══════════════════════════════════════════════════════════════════════════
//  ❌ CANCELLED: الفري تريال والـ 15 كريديت الأسبوعية للمستخدم "الفري" اتلغوا بالكامل
//  بقرار إداري. الدالة دي كانت بترفع رصيد أي مستخدم على باقة "free" لـ 15 كريديت
//  (SIGNUP_BONUS_CREDITS) أول ما يدخل الموقع بعد بداية أسبوع جديد — دلوقتي no-op تمامًا:
//  مفيش أي رصيد مجاني بيترجّع أو بيتجدد لمستخدمين الـ free. الدالة اتسابت (بدل ما تتشال
//  خالص) لأن verifyCode / login / loginOrCreateGoogleUser لسه بينادوها — عشان منلمسش
//  الدوال دي. لو حبينا نرجّع الميزة يومًا ما، اللوجيك القديم موجود في الـ git history.
export async function maybeRenewFreeWeeklyCredits(userId) {
  return; // Free trial cancelled — no weekly credit renewal for free-plan users.
}

export async function getUserById(userId) {
  const { rows } = await pool.query(
    'SELECT id, email, name, avatar, plan, plan_billing, plan_expires_at, verified, model3_access, model3_plan, model3_trial_used, model4_access, model4_plan, model4_trial_used, model5_access, model5_plan, erivion_access, erivion_plan, model7_access, model7_plan, created_at FROM users WHERE id = $1',
    [userId]
  );
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

  let refCode = null;
  try {
    const { rows } = await pool.query('SELECT ref_code FROM users WHERE email = $1', [userEmail]);
    refCode = rows[0]?.ref_code || null;
  } catch {}

  const attachments = [];
  if (screenshotBase64) {
    const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');
    const ext = screenshotBase64.includes('png') ? 'png' : 'jpg';
    attachments.push({ filename: `payment_${userEmail}_${Date.now()}.${ext}`, content: base64Data });
  }

  const affiliateRow = refCode
    ? `<tr><td style="color:#888;padding:8px 0">🤝 Affiliate</td><td style="color:#f59e0b;font-weight:700">${refCode}</td></tr>`
    : '';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Erivion Payments <noreply@erivion.net>',
      to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
      subject: `💰 Payment Request - ${planData.name} Plan - ${userEmail}`,
      html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#7c6af7">💰 New Payment Request</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">User</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#7c6af7;font-weight:700">${planData.name}</td></tr><tr><td style="color:#888;padding:8px 0">Billing</td><td style="color:#fff">${billingLabel}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr>${affiliateRow}</table><div style="margin-top:24px;display:flex;gap:12px"><a href="${backendUrl}/api/auth/admin/approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&billing=${billing}&secret=${process.env.ADMIN_SECRET || ''}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a><a href="${backendUrl}/api/auth/admin/reject?email=${encodeURIComponent(userEmail)}&secret=${process.env.ADMIN_SECRET || ''}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`,
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
  await pool.query("UPDATE payment_requests SET status = 'approved' WHERE user_email = $1 AND plan = $2 AND status = 'pending'", [email, plan]);
  return { success: true, plan, expires_at: expiresAt.toISOString() };
}

// ═══════════════════════════════════════════════════════════════════════════
// نظام الكريديت الموحد — رصيد واحد مشترك بين كل الموديلات، من غير تجديد أسبوعي
// ═══════════════════════════════════════════════════════════════════════════

// سعر الكريديت للمصريين (شحن مرن بالسلايدر)
export const EGP_PER_CREDIT = 0.7;

// باقات ثابتة للدوليين (مرتبطة بمنتجات Gumroad — دفعة واحدة، مش اشتراك)
export const CREDITS_PACKAGES = {
  credits_starter: { name: 'Starter', credits: 600,   usd: 15  },
  credits_creator: { name: 'Creator', credits: 1400,  usd: 35  },
  credits_studio:  { name: 'Studio',  credits: 3000,  usd: 84  },
  credits_team:    { name: 'Team',    credits: 6000,  usd: 168 },
  credits_agency:  { name: 'Agency',  credits: 12000, usd: 336 },
};

export async function getCreditsBalance(userId) {
  await maybeRenewFreeWeeklyCredits(userId);
  const { rows } = await pool.query('SELECT COALESCE(credits_balance, 0) as balance FROM users WHERE id = $1', [userId]);
  return rows[0]?.balance || 0;
}

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: إيميل تحفيزي للاشتراك — رسالة واحدة بس، بلغتين (عربي + إنجليزي مع بعض) وبكل
//  الأسعار (جنيه ودولار مع بعض)، بتتبعت بس عند تسجيل الدخول (مش أي حدث تاني)، وبس لمستخدمين
//  "free" (المشترك مالوش داعي حد يحفزه يشترك تاني)، ومرة واحدة بالأسبوع بالكتير لكل مستخدم
//  (عشان مايبقاش spam ويستهلك كوتة Resend). الأسعار بتتاخد مباشرة من CREDITS_PACKAGES/
//  EGP_PER_CREDIT الحقيقيين — لو الأسعار اتغيرت هناك، الإيميل هيعرض الجديد تلقائيًا.
// ══════════════════════════════════════════════════════════════════════════
async function sendWelcomeUpgradeEmail(email, name) {
  // ✅ FIX: كان بيفضّل SITE_URL الأول — ده غالبًا دومين الباك إند/الـ API مش دومين الموقع
  // نفسه اللي المستخدم مسجل دخول فيه، فالرابط كان بيوديه لأوريجن مختلف مفيهوش الـ token
  // المحفوظ في localStorage، فيطلب تسجيل دخول تاني. دلوقتي FRONTEND_URL الأول زي كل روابط
  // اللوجين التانية في الكود، عشان يفضل نفس الدومين اللي فيه الجلسة بالظبط.
  const siteUrl = process.env.FRONTEND_URL || process.env.SITE_URL || 'https://erivion.net';
  const pricingUrl = `${siteUrl}/pricing`;
  const firstName = (name || '').split(' ')[0] || email.split('@')[0];

  // ✅ NEW: بدل مقارنة أسماء منافسين، إثبات ثقة حقيقي من تقييمات عملائنا الفعليين (نفس
  // الأرقام الظاهرة في صفحة الأدمن Ratings) — بيتحسب لايف من نفس الجدول، مش رقم ثابت
  let ratingLine_ar = '', ratingLine_en = '';
  try {
    const { rows } = await pool.query('SELECT ROUND(AVG(rating)::numeric, 1) as avg, COUNT(*) as total FROM feedback_ratings');
    const avg = rows[0]?.avg;
    const total = parseInt(rows[0]?.total || 0);
    if (avg && total >= 10) { // ✅ مانعرضش الإحصائية إلا لو فيه عدد تقييمات محترم (مصداقية)
      ratingLine_ar = `<p style="font-size:13.5px;line-height:1.8;color:#9ca3af;margin:0">⭐ تقييم ${avg} من 5، من ${total} تقييم حقيقي من عملائنا.</p>`;
      ratingLine_en = `<p style="font-size:13.5px;line-height:1.8;color:#9ca3af;margin:0">⭐ Rated ${avg}/5 by ${total} real customers.</p>`;
    }
  } catch (e) { console.warn('[UpgradeEmail] rating stats query failed:', e.message); }

  // ✅ أرخص 3 باقات بس عشان الإيميل يفضل مختصر ومقنع، مش قايمة أسعار كاملة مملة
  const topPackages = Object.values(CREDITS_PACKAGES).slice(0, 3);
  const rows = topPackages.map(p =>
    `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #24243a;color:#fff;font-weight:600">${p.name}</td>
      <td style="padding:10px 0;border-bottom:1px solid #24243a;color:#9ca3af;font-size:13px">${p.credits} ${'كريديت / credits'}</td>
      <td style="padding:10px 8px;border-bottom:1px solid #24243a;color:#7c6af7;font-weight:700;text-align:center">${Math.round(p.credits * EGP_PER_CREDIT)} ${'ج.م'}</td>
      <td style="padding:10px 0 10px 12px;border-bottom:1px solid #24243a;border-left:1px solid #33334d;color:#7c6af7;font-weight:700;text-align:center">$${p.usd}</td>
    </tr>`
  ).join('');

  const subject = `🎬 ${firstName}، الـ 15 كريديت مش هتكفي شغلك الجاد / Your free credits won't cut it for real work`;
  const html = `<div style="font-family:'Segoe UI',Tahoma,-apple-system,sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px">
    <h2 style="color:#7c6af7;margin:0 0 4px">Erivion 🎬</h2>
    <p style="color:#9ca3af;font-size:13px;margin:0 0 24px">منصة فيديو بالذكاء الاصطناعي، مصرية وعالمية &nbsp;|&nbsp; Egyptian-founded, built for the world</p>

    <div dir="rtl" style="margin-bottom:22px">
      <p style="font-size:16px;line-height:1.8;margin:0 0 10px">أهلًا ${firstName}! 👋</p>
      <p style="font-size:14.5px;line-height:1.9;color:#d1d5db;margin:0 0 12px">الـ 15 كريديت المجانية بتخلص بسرعة — كفاية بس تجرب، مش كفاية إنك تبني محتوى بجد أو تسوّق لمشروعك بشكل مستمر. وكل أسبوع بتقعد تستنى التجديد بدل ما تكمل شغلك على طول.</p>
      <p style="font-size:14.5px;line-height:1.9;color:#d1d5db;margin:0 0 12px"><b style="color:#fff">مع باقة مدفوعة هتقدر:</b></p>
      <ul style="margin:0 0 12px;padding-right:20px;padding-left:0;color:#d1d5db;font-size:14px;line-height:2">
        <li>تعمل فيديوهات إعلانية احترافية لمشروعك من صورة منتج واحدة بس</li>
        <li>تحافظ على نفس الشخصية بثبات عبر كل مشاهد الفيديو</li>
        <li>تنتج محتوى ديني/تعليمي/ترفيهي بانتظام من غير ما تستنى تجديد أسبوعي</li>
        <li>توفر فلوس برامج المونتاج والموشن جرافيكس تمامًا</li>
      </ul>
      ${ratingLine_ar}
    </div>

    <div style="margin-bottom:20px;border-top:1px solid #24243a;padding-top:20px">
      <p style="font-size:14.5px;line-height:1.9;color:#d1d5db;margin:0 0 12px">Your free 15 credits are great for a first try — but not enough for real, consistent work. Every week you wait on the renewal instead of just creating.</p>
      <p style="font-size:14.5px;line-height:1.9;color:#d1d5db;margin:0 0 12px"><b style="color:#fff">With a paid package you can:</b></p>
      <ul style="margin:0 0 12px;padding-left:20px;color:#d1d5db;font-size:14px;line-height:2">
        <li>Generate full AI ad videos from a single product photo</li>
        <li>Keep the same character consistent across every scene</li>
        <li>Produce content regularly without waiting on a weekly reset</li>
        <li>Skip expensive editing software and motion design entirely</li>
      </ul>
      ${ratingLine_en}
    </div>

    <div style="background:#1a1a2e;border-radius:12px;padding:16px;margin:24px 0">
      <table style="width:100%;border-collapse:collapse;font-size:13.5px">
        <tr>
          <td colspan="4" style="padding-bottom:10px;color:#7c6af7;font-weight:700;font-size:13px">أشهر الباقات &nbsp;|&nbsp; Popular Packages 🔥</td>
        </tr>
        <tr>
          <td style="color:#6b7280;font-size:11px;padding-bottom:6px">الباقة / Plan</td>
          <td style="color:#6b7280;font-size:11px;padding-bottom:6px">الكمية / Amount</td>
          <td style="color:#6b7280;font-size:11px;padding-bottom:6px;text-align:center">🇪🇬 EGP</td>
          <td style="color:#6b7280;font-size:11px;padding-bottom:6px;text-align:center;border-left:1px solid #33334d;padding-left:12px">🌍 USD</td>
        </tr>
        ${rows}
      </table>
    </div>

    <div style="text-align:center;margin:28px 0">
      <a href="${pricingUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c6af7,#9333ea);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;box-shadow:0 4px 14px rgba(124,106,247,.4)">🚀 اشترك دلوقتي / Subscribe Now</a>
      <p style="color:#6b7280;font-size:11px;margin-top:10px">بدون التزام طويل — كريديت بيتصرف زي ما تحتاج / No long commitment — spend credits as you go</p>
    </div>
  </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Erivion <noreply@erivion.net>', to: email, subject, html }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error('Upgrade email failed: ' + (err.message || JSON.stringify(err))); }
}

// ✅ Throttle: بس مستخدم "free"، وبس مرة كل أسبوع (نفس منطق getWeekStart المستخدم في تجديد
// الكريديت). الدالة دي هي اللي المفروض تتنادى من مسار تسجيل الدخول بس — مش أي حدث تاني.
export async function maybeSendUpgradeEmail(userId, email, name) {
  try {
    const weekStart = getWeekStart();
    const { rows } = await pool.query('SELECT plan, upgrade_email_week FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user || user.plan !== 'free') return; // مشترك — منبعتلوش الإيميل ده خالص
    if (user.upgrade_email_week === weekStart) return; // اتبعتله الأسبوع ده خلاص
    await pool.query('UPDATE users SET upgrade_email_week = $1 WHERE id = $2', [weekStart, userId]);
    await sendWelcomeUpgradeEmail(email, name);
    console.log(`[UpgradeEmail] Sent to ${email} (week ${weekStart})`);
  } catch (e) {
    console.warn('[UpgradeEmail] Failed to send:', e.message);
  }
}

export async function addCreditsBalance(userId, amount) {
  const { rows } = await pool.query('UPDATE users SET credits_balance = COALESCE(credits_balance, 0) + $1 WHERE id = $2 RETURNING credits_balance', [amount, userId]);
  return rows[0]?.credits_balance || 0;
}

export async function deductCreditsBalance(userId, amount) {
  const current = await getCreditsBalance(userId);
  if (current < amount) return { success: false, balance: current };
  const { rows } = await pool.query('UPDATE users SET credits_balance = credits_balance - $1 WHERE id = $2 RETURNING credits_balance', [amount, userId]);
  return { success: true, balance: rows[0]?.credits_balance || 0 };
}

// ── اعتماد عملية شراء كريديت (مصري بالسلايدر أو دولي بباقة ثابتة) ─────────
// بيدور على أحدث طلب pending لنفس الإيميل والخطة، يضيف الكريديت المسجلة فيه، ويعتمد الطلب
export async function approveCreditsPayment(email, plan) {
  const userRow = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (userRow.rows.length === 0) throw new Error('User not found');
  const userId = userRow.rows[0].id;

  const reqRow = await pool.query(
    "SELECT id, credits_purchased FROM payment_requests WHERE user_email = $1 AND plan = $2 AND status = 'pending' ORDER BY created_at DESC LIMIT 1",
    [email, plan]
  );
  if (reqRow.rows.length === 0) throw new Error('No pending credits request found');
  const { id: requestId, credits_purchased: creditsToAdd } = reqRow.rows[0];
  if (!creditsToAdd || creditsToAdd <= 0) throw new Error('Invalid credits amount on this request');

  const newBalance = await addCreditsBalance(userId, creditsToAdd);
  // ✅ أول ما العميل يشحن رصيد حقيقي، يتفتحله كل الموديلات وتتشال العلامة المائية تلقائيًا
  await pool.query("UPDATE users SET plan = 'paid' WHERE id = $1 AND plan = 'free'", [userId]);
  await pool.query("UPDATE payment_requests SET status = 'approved' WHERE id = $1", [requestId]);
  return { userId, creditsAdded: creditsToAdd, newBalance };
}


// ── ✅ NEW: اعتماد/رفض طلب دفع محدد بالـ ID (بيستخدمها زر الأدمن في الصفحة مباشرة،
// بدل ما تكون مقصورة على لينكات الإيميل بس) ──────────────────────────────
export async function approveCreditsPaymentById(requestId) {
  const reqRow = await pool.query(
    "SELECT id, user_id, user_email, credits_purchased, status FROM payment_requests WHERE id = $1",
    [requestId]
  );
  if (reqRow.rows.length === 0) throw new Error('Payment request not found');
  const { user_id: userId, credits_purchased: creditsToAdd, status } = reqRow.rows[0];
  if (status !== 'pending') throw new Error(`Request already ${status}`);
  if (!creditsToAdd || creditsToAdd <= 0) throw new Error('Invalid credits amount on this request');

  const newBalance = await addCreditsBalance(userId, creditsToAdd);
  await pool.query("UPDATE users SET plan = 'paid' WHERE id = $1 AND plan = 'free'", [userId]);
  await pool.query("UPDATE payment_requests SET status = 'approved' WHERE id = $1", [requestId]);
  return { userId, creditsAdded: creditsToAdd, newBalance };
}

export async function rejectPaymentRequestById(requestId, reason = 'other') {
  const { rows } = await pool.query(
    "UPDATE payment_requests SET status = 'rejected' WHERE id = $1 AND status = 'pending' RETURNING *",
    [requestId]
  );
  if (rows.length === 0) throw new Error('Payment request not found or already processed');
  return rows[0];
}

// ── ✅ NEW: مسح طلبات pending اللي عدى عليها أكتر من 48 ساعة من غير رد —
// عشان الجدول ميتراكمش ويكلف مساحة على Railway. الـ approved/rejected بيفضلوا (تاريخ/سجل) ──
export async function deleteExpiredPendingPayments(hours = 48) {
  const { rowCount } = await pool.query(
    `DELETE FROM payment_requests WHERE status = 'pending' AND created_at::timestamp < NOW() - INTERVAL '${hours} hours'`
  );
  if (rowCount > 0) console.log(`[Payments] Auto-deleted ${rowCount} expired pending request(s) (>${hours}h old)`);
  return rowCount;
}

export async function createPaymentRequest(userId, userEmail, plan, billing, amount, screenshotData, creditsPurchased = null) {
  const { rows } = await pool.query('INSERT INTO payment_requests (user_id, user_email, plan, billing, amount, screenshot_data, status, credits_purchased) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id', [userId, userEmail, plan, billing, amount, screenshotData || null, 'pending', creditsPurchased]);
  return rows[0].id;
}

export async function getLatestPaymentRequestForUser(userId) {
  const { rows } = await pool.query('SELECT id, plan, billing, amount, status, created_at FROM payment_requests WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]);
  return rows[0] || null;
}

// ══════════════════════════════════════════════════════════════════════════
//  Feedback Ratings — تقييم داخلي بعد كل فيديو + دعوة Trustpilot لمرة واحدة بس
// ══════════════════════════════════════════════════════════════════════════
// ✅ التقييم الداخلي (نجوم + تعليق) بيتحفظ في كل مرة ويوصل للأدمن — حتى لو
// العميل مش مشترك (free plan). لكن دعوة "قيّمنا على Trustpilot" لازم تظهر
// مرة واحدة بس طول عمر الحساب، عشان العميل مايتسألش يقيّم مرتين.
export async function submitFeedbackRating(userId, userEmail, rating, comment, modelUsed) {
  await pool.query(
    'INSERT INTO feedback_ratings (user_id, user_email, rating, comment, model_used) VALUES ($1, $2, $3, $4, $5)',
    [userId, userEmail, rating, comment || null, modelUsed || null]
  );
  const { rows } = await pool.query('SELECT trustpilot_prompted FROM users WHERE id = $1', [userId]);
  const alreadyPrompted = !!rows[0]?.trustpilot_prompted;
  // ✅ دعوة Trustpilot بس لو: تقييم عالي (4-5 نجوم) ولسه ما اتعرضتش عليه قبل كده
  const showTrustpilotCTA = rating >= 4 && !alreadyPrompted;
  if (showTrustpilotCTA) {
    await pool.query('UPDATE users SET trustpilot_prompted = 1 WHERE id = $1', [userId]);
  }
  return { showTrustpilotCTA };
}

export async function getAllFeedbackRatings(limit = 200) {
  const { rows } = await pool.query(
    'SELECT id, user_id, user_email, rating, comment, model_used, created_at FROM feedback_ratings ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows;
}

export async function markLatestPaymentRequestRejected(email) {
  await pool.query("UPDATE payment_requests SET status = 'rejected' WHERE id = (SELECT id FROM payment_requests WHERE user_email = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 1)", [email]);
}

export async function signUp(email, password) {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length > 0) throw new Error('Email already registered');
  const hashed = await bcrypt.hash(password, 10);
  const code = generateCode();
  const expires = Date.now() + 10 * 60 * 1000;
  // ❌ Free trial cancelled: مفيش 15 كريديت مجانية عند التسجيل بعد كده — يبدأ برصيد 0
  await pool.query('INSERT INTO users (email, password, plan, credits_balance) VALUES ($1, $2, $3, $4)', [email, hashed, 'free', 0]);
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
  await maybeRenewFreeWeeklyCredits(user.id);
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  return { token, email, plan: user.plan || 'free', isNewUser: true, userId: user.id };
}

export async function login(email, password) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (rows.length === 0) throw new Error('Invalid email or password');
  const user = rows[0];
  if (!user.verified) throw new Error('Please verify your email first');
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error('Invalid email or password');
  await checkAndResetUsage(user.id);
  await maybeRenewFreeWeeklyCredits(user.id);
  const token = jwt.sign({ userId: user.id, email }, JWT_SECRET, { expiresIn: '30d' });
  const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
  const userName = user.name || email.split('@')[0];
  const currentPlan = user.plan || 'free';
  const isOnFree = currentPlan === 'free';
  // ✅ FIX: كان بيبعت رسالة عامة بسيطة لكل مستخدم فري في كل لوجين — دلوقتي رسالة واحدة
  // تحفيزية حقيقية بلغتين (عربي+إنجليزي) وبكل الأسعار (جنيه ودولار)، بس مرة كل أسبوع
  // بالكتير (maybeSendUpgradeEmail بيتولى الـ throttle ده لوحده)
  if (isOnFree) {
    maybeSendUpgradeEmail(user.id, email, userName).catch(() => {});
  } else {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion <noreply@erivion.net>',
        to: email,
        subject: `Welcome back, ${userName} — keep creating! 🎬`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:40px 36px;background:#0f0f1a;color:#fff;border-radius:18px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:52px;margin-bottom:12px">🎬</div><h2 style="color:#22c55e;font-size:22px;margin:0 0 8px">Welcome back, ${userName}!</h2></div><div style="text-align:center"><a href="${frontendUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Go to Dashboard →</a></div></div>`,
      }),
    }).catch(e => console.warn('[Login] Marketing email failed:', e.message));
  }
  logLoginEvent(user.id, email, 'password').catch(() => {});
  return { token, email, plan: user.plan || 'free', isNewUser: false };
}

export async function loginOrCreateGoogleUser({ googleId, email, name, avatar }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  let user = rows[0];
  if (user) {
    if (!user.google_id) await pool.query('UPDATE users SET google_id = $1, avatar = $2, verified = 1 WHERE id = $3', [googleId, avatar, user.id]);
  } else {
    // ❌ Free trial cancelled: مفيش 15 كريديت مجانية لتسجيل جوجل الجديد كمان — رصيد 0
    await pool.query('INSERT INTO users (email, password, name, google_id, avatar, verified, plan, credits_balance) VALUES ($1, $2, $3, $4, $5, 1, $6, $7)', [email, 'GOOGLE_AUTH_NO_PASSWORD', name || email.split('@')[0], googleId, avatar || null, 'free', 0]);
    const { rows: newRows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    user = newRows[0];
  }
  await checkAndResetUsage(user.id);
  await maybeRenewFreeWeeklyCredits(user.id);
  const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
  if ((user.plan || 'free') === 'free') {
    maybeSendUpgradeEmail(user.id, user.email, user.name).catch(() => {});
  }
  logLoginEvent(user.id, user.email, 'google').catch(() => {});
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

// ── Model 3 ────────────────────────────────────────────────────────────────
// Credit pools per plan (one-time purchase, not weekly)
export const MODEL3_PLAN_CREDITS = {
  m3_starter: 125,
  m3_pro:     375,
  m3_max:     700,
};

// Kept for backwards compat (used by canUserMakeModel3Video quota display)
export const MODEL3_PLAN_QUOTAS = {
  m3_starter: { '30s': 25, '1min': 12, '3min': 4,  '5min': 2  }, // 125cr ÷ cost
  m3_pro:     { '30s': 75, '1min': 37, '3min': 12, '5min': 7  }, // 375cr ÷ cost
  m3_max:     { '30s':140, '1min': 70, '3min': 23, '5min': 14 }, // 700cr ÷ cost
};

// Init model3_credits table (credit pool per user, separate from usage count)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS model3_credits (
        user_id INTEGER PRIMARY KEY REFERENCES users(id),
        credits_total INTEGER DEFAULT 0,
        credits_used  INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT NOW()
      );
    `);
  } catch(e) { console.warn('[DB] model3_credits init:', e.message); }
})();

export async function getModel3Credits(userId) {
  const { rows } = await pool.query('SELECT * FROM model3_credits WHERE user_id = $1', [userId]);
  if (rows.length === 0) return { credits_total: 0, credits_used: 0 };
  return rows[0];
}

export async function addModel3Credits(userId, amount) {
  await pool.query(
    `INSERT INTO model3_credits (user_id, credits_total, credits_used)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id) DO UPDATE
     SET credits_total = model3_credits.credits_total + $2, updated_at = NOW()`,
    [userId, amount]
  );
}

export async function getModel3Usage(userId) {
  const { rows } = await pool.query('SELECT * FROM model3_usage WHERE user_id = $1', [userId]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO model3_usage (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    return { videos_30s: 0, videos_1min: 0, videos_3min: 0, videos_5min: 0 };
  }
  return rows[0];
}

export async function incrementModel3Video(userId, duration) {
  // Deduct credits
  const cost = MODEL3_CREDIT_COSTS[duration] || 5;
  await pool.query(
    `INSERT INTO model3_credits (user_id, credits_total, credits_used)
     VALUES ($1, 0, $2)
     ON CONFLICT (user_id) DO UPDATE SET credits_used = model3_credits.credits_used + $2, updated_at = NOW()`,
    [userId, cost]
  );
  // Also track video count for display
  const col = duration === '30s' ? 'videos_30s' : duration === '1min' ? 'videos_1min' : duration === '3min' ? 'videos_3min' : 'videos_5min';
  await pool.query(`INSERT INTO model3_usage (user_id, ${col}) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET ${col} = model3_usage.${col} + 1`, [userId]);
}

export async function resetModel3Usage(userId) {
  await pool.query(
    `INSERT INTO model3_usage (user_id, videos_30s, videos_1min, videos_3min, videos_5min)
     VALUES ($1, 0, 0, 0, 0)
     ON CONFLICT (user_id) DO UPDATE SET
       videos_30s = 0, videos_1min = 0, videos_3min = 0, videos_5min = 0`,
    [userId]
  );
}

export async function canUserMakeModel3Video(userId, duration) {
  const user = await getUserById(userId);
  // ❌ Free trial cancelled: مفيش 30s مجاني قبل الاشتراك بعد كده — لازم model3_access دايمًا زي Model 4
  if (!user || !user.model3_access) return { allowed: false, reason: 'no_access' };
  const plan = user?.model3_plan || 'm3_starter';
  const totalCredits = MODEL3_PLAN_CREDITS[plan] || 125;
  const cost = MODEL3_CREDIT_COSTS[duration] || 5;
  const credits = await getModel3Credits(userId);
  const remaining = (credits.credits_total || 0) - (credits.credits_used || 0);
  if (remaining < cost) return { allowed: false, reason: 'quota_exceeded', remaining, cost };
  return { allowed: true, remaining, cost };
}

export async function markModel3TrialUsed(userId) {
  // kept for compatibility, trial disabled
}

export async function getAllPaymentRequests(status = null) {
  if (status) {
    const { rows } = await pool.query('SELECT * FROM payment_requests WHERE status = $1 ORDER BY created_at DESC', [status]);
    return rows;
  }
  const { rows } = await pool.query('SELECT * FROM payment_requests ORDER BY created_at DESC');
  return rows;
}

// ── حساب الربح التقديري لكل عملية دفع ──────────────────────────────────────
// نسبة تكلفة تقديرية بناءً على متوسط استخدام متوقع عبر كل الموديلات (نسبة محافظة، مش أسوأ سيناريو)
// أسوأ سيناريو (كل الكريديت على موديل 5) هامشه ~46%، وأحسن سيناريو (موديل 2 بس) هامشه ~92% —
// النسبة دي بتاخد نقطة وسط منطقية للتخطيط، مش رقم فعلي دقيق 100% لأن التكلفة الحقيقية بتتحدد
// بس لما العميل يستهلك الكريديت فعليًا على موديل معين
const ESTIMATED_COST_RATIO = 0.28; // ≈ 72% هامش ربح تقديري بالمتوسط

export function estimatePaymentProfit(amount) {
  const costEstimate = Math.round(amount * ESTIMATED_COST_RATIO * 100) / 100;
  const profitEstimate = Math.round((amount - costEstimate) * 100) / 100;
  return { costEstimate, profitEstimate, marginPercent: Math.round((1 - ESTIMATED_COST_RATIO) * 100) };
}

export async function markPaymentPaidOut(paymentId) {
  const { rows } = await pool.query(
    "UPDATE payment_requests SET paid_out = 1, paid_out_at = NOW()::text WHERE id = $1 RETURNING *",
    [paymentId]
  );
  return rows[0] || null;
}

export async function unmarkPaymentPaidOut(paymentId) {
  const { rows } = await pool.query(
    "UPDATE payment_requests SET paid_out = 0, paid_out_at = NULL WHERE id = $1 RETURNING *",
    [paymentId]
  );
  return rows[0] || null;
}

// ── Model 4 ────────────────────────────────────────────────────────────────
export const MODEL4_PLANS = {
  m4_plan1: { name: 'Starter', price: 600,  credits: 80  },
  m4_plan2: { name: 'Creator', price: 1000, credits: 230 },
  m4_plan3: { name: 'Pro',     price: 2800, credits: 690 },
};

// Init model4_credits table
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS model4_credits (
        user_id INTEGER PRIMARY KEY REFERENCES users(id),
        credits_total INTEGER DEFAULT 0,
        credits_used  INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT NOW()
      );
    `);
  } catch(e) { console.warn('[DB] model4_credits init:', e.message); }
})();

export async function getModel4Credits(userId) {
  const { rows } = await pool.query('SELECT * FROM model4_credits WHERE user_id = $1', [userId]);
  if (rows.length === 0) return { credits_total: 0, credits_used: 0 };
  return rows[0];
}

export async function addModel4Credits(userId, amount) {
  await pool.query(
    `INSERT INTO model4_credits (user_id, credits_total, credits_used)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id) DO UPDATE
     SET credits_total = model4_credits.credits_total + $2, updated_at = NOW()`,
    [userId, amount]
  );
}

export async function getModel4Usage(userId) {
  const { rows } = await pool.query('SELECT * FROM model4_usage WHERE user_id = $1', [userId]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO model4_usage (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    return { videos_30s: 0, videos_1min: 0, videos_3min: 0 };
  }
  return rows[0];
}

export async function incrementModel4Video(userId, duration) {
  const cost = MODEL4_CREDIT_COSTS[duration] || 10;
  await pool.query(
    `INSERT INTO model4_credits (user_id, credits_total, credits_used)
     VALUES ($1, 0, $2)
     ON CONFLICT (user_id) DO UPDATE SET credits_used = model4_credits.credits_used + $2, updated_at = NOW()`,
    [userId, cost]
  );
  const col = duration === '30s' ? 'videos_30s' : duration === '1min' ? 'videos_1min' : 'videos_3min';
  await pool.query(
    `INSERT INTO model4_usage (user_id, ${col}) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET ${col} = model4_usage.${col} + 1`,
    [userId]
  );
}

export async function resetModel4Usage(userId) {
  await pool.query(
    `INSERT INTO model4_usage (user_id, videos_30s, videos_1min, videos_3min)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (user_id) DO UPDATE SET
       videos_30s = 0, videos_1min = 0, videos_3min = 0`,
    [userId]
  );
}

export async function canUserMakeModel4Video(userId, duration) {
  const user = await getUserById(userId);
  if (!user || !user.model4_access) return { allowed: false, reason: 'no_access' };
  const plan = user.model4_plan || 'm4_plan1';
  const planData = MODEL4_PLANS[plan];
  if (!planData) return { allowed: false, reason: 'invalid_plan' };
  const cost = MODEL4_CREDIT_COSTS[duration] || 10;
  const credits = await getModel4Credits(userId);
  const remaining = (credits.credits_total || 0) - (credits.credits_used || 0);
  if (remaining < cost) return { allowed: false, reason: 'quota_exceeded', remaining, cost };
  return { allowed: true, remaining, cost };
}

export async function markModel4TrialUsed(userId) {
  // kept for compatibility, trial disabled
}
// ── Model 5 (Cinematic) ────────────────────────────────────────────────────
export const MODEL5_PLANS = {
  mc_starter: { name: 'Starter', price: 550,  credits: 75  },
  mc_pro:     { name: 'Pro',     price: 1050, credits: 150 },
  mc_max:     { name: 'Max',     price: 2200, credits: 300 },
};

export async function initModel5DB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS model5_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      videos_15s INTEGER DEFAULT 0,
      videos_30s INTEGER DEFAULT 0,
      videos_1min INTEGER DEFAULT 0,
      last_reset TEXT DEFAULT CURRENT_DATE
    );
  `);
  await pool.query(`ALTER TABLE model5_usage ADD COLUMN IF NOT EXISTS videos_15s INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model5_access INTEGER DEFAULT 0`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model5_plan TEXT DEFAULT NULL`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS model5_credits (
      user_id INTEGER PRIMARY KEY REFERENCES users(id),
      credits_total INTEGER DEFAULT 0,
      credits_used  INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT NOW()
    );
  `);
  console.log('[DB] Model 5 tables ready');
}

initModel5DB().catch(err => console.error('[DB] Model 5 init error:', err.message));

export async function getModel5Credits(userId) {
  const { rows } = await pool.query('SELECT * FROM model5_credits WHERE user_id = $1', [userId]);
  if (rows.length === 0) return { credits_total: 0, credits_used: 0 };
  return rows[0];
}

export async function addModel5Credits(userId, amount) {
  await pool.query(
    `INSERT INTO model5_credits (user_id, credits_total, credits_used)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id) DO UPDATE
     SET credits_total = model5_credits.credits_total + $2, updated_at = NOW()`,
    [userId, amount]
  );
}

export async function getModel5Usage(userId) {
  const { rows } = await pool.query('SELECT * FROM model5_usage WHERE user_id = $1', [userId]);
  if (rows.length === 0) {
    await pool.query('INSERT INTO model5_usage (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    return { videos_15s: 0, videos_30s: 0, videos_1min: 0 };
  }
  return rows[0];
}

export async function incrementModel5Video(userId, duration) {
  const cost = MODEL5_CREDIT_COSTS[duration] || 180;
  await pool.query(
    `INSERT INTO model5_credits (user_id, credits_total, credits_used)
     VALUES ($1, 0, $2)
     ON CONFLICT (user_id) DO UPDATE SET credits_used = model5_credits.credits_used + $2, updated_at = NOW()`,
    [userId, cost]
  );
  const col = duration === '15s' ? 'videos_15s' : duration === '30s' ? 'videos_30s' : 'videos_1min';
  await pool.query(
    `INSERT INTO model5_usage (user_id, ${col}) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET ${col} = model5_usage.${col} + 1`,
    [userId]
  );
}

export async function resetModel5Usage(userId) {
  await pool.query(
    `INSERT INTO model5_usage (user_id, videos_15s, videos_30s, videos_1min)
     VALUES ($1, 0, 0, 0)
     ON CONFLICT (user_id) DO UPDATE SET
       videos_15s = 0, videos_30s = 0, videos_1min = 0`,
    [userId]
  );
}

export async function canUserMakeModel5Video(userId, duration) {
  const user = await getUserById(userId);
  if (!user || !user.model5_access) return { allowed: false, reason: 'no_access' };
  const plan = user.model5_plan || 'mc_starter';
  const planData = MODEL5_PLANS[plan];
  if (!planData) return { allowed: false, reason: 'invalid_plan' };
  const cost = MODEL5_CREDIT_COSTS[duration] || 180;
  const credits = await getModel5Credits(userId);
  const remaining = (credits.credits_total || 0) - (credits.credits_used || 0);
  if (remaining < cost) return { allowed: false, reason: 'quota_exceeded', remaining, cost };
  return { allowed: true, remaining, cost };
}
// ── Model 7 (Ads) ──────────────────────────────────────────────────────────
export const MODEL7_PLANS = {
  ads_starter: { name: 'Starter', price: 400,  credits: 15  },
  ads_pro:     { name: 'Pro',     price: 900,  credits: 40  },
  ads_max:     { name: 'Max',     price: 1800, credits: 100 },
};

// ✅ نظام كريديت متدرج حسب عدد المشاهد (كل مشهد = 5 ثواني) وحسب وجود صوت:
// - "no voice" (seedance-2.0-fast، نفس موديل 5 بالظبط) → نفس معدل موديل 5 (~12 كريديت/ثانية)
// - "with voice" (seedance-1-pro-fast، أرخص + صوت Gemini TTS) → أرخص شوية زي ما اتفقنا
export const ADS_CREDIT_COSTS_NO_VOICE = { 3: 180, 4: 240, 5: 300, 6: 360 };
export const ADS_CREDIT_COSTS_VOICE    = { 3: 150, 4: 200, 5: 250, 6: 300 };

// دالة مساعدة لحساب التكلفة حسب عدد المشاهد ووجود صوت من عدمه
export function getAdsCreditCost(sceneCount, hasVoice) {
  const table = hasVoice ? ADS_CREDIT_COSTS_VOICE : ADS_CREDIT_COSTS_NO_VOICE;
  const n = Math.min(Math.max(parseInt(sceneCount) || 3, 3), 6);
  return table[n] || (hasVoice ? 150 : 180);
}

// ⚠️ الاسم القديم متسيب هنا بس كـ fallback لأي كود قديم لسه بينادي عليه — استخدم
// getAdsCreditCost() في أي كود جديد. القيمة دي بقت غير دقيقة (كانت تكلفة ثابتة لكل الحالات).
export const ADS_CREDIT_COST = 240;

// ── خصم موحد من رصيد الكريديت — تستخدمه كل الموديلات (1 لحد 5 + Ads) ──────
// بيتأكد إن الرصيد كافي، يخصم، ويرجع النتيجة. لو الرصيد مش كافي بيرجع remaining
// عشان الفرونت إند يقدر يقول للعميل "محتاج X كريديت ومعاك Y بس"
export async function chargeCredits(userId, cost) {
  const balance = await getCreditsBalance(userId);
  if (balance < cost) return { success: false, reason: 'quota_exceeded', remaining: balance, cost };
  const { rows } = await pool.query('UPDATE users SET credits_balance = credits_balance - $1 WHERE id = $2 RETURNING credits_balance', [cost, userId]);
  return { success: true, remaining: rows[0]?.credits_balance ?? (balance - cost), cost };
}

// ── رصيد ترحيبي بسيط لأول مرة بس (مش بيتجدد) — يكفي فيديو أو اتنين قصار للتجربة ──
export const SIGNUP_BONUS_CREDITS = 15;



(async () => {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model7_access INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS model7_plan TEXT DEFAULT NULL`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS model7_credits (
        user_id       INTEGER PRIMARY KEY REFERENCES users(id),
        credits_total INTEGER DEFAULT 0,
        credits_used  INTEGER DEFAULT 0,
        updated_at    TEXT DEFAULT NOW()
      );
    `);
    console.log('[DB] Model 7 (Ads) tables ready');
  } catch (e) { console.warn('[DB] Model 7 init:', e.message); }
})();

export async function getModel7Credits(userId) {
  const { rows } = await pool.query('SELECT * FROM model7_credits WHERE user_id = $1', [userId]);
  if (rows.length === 0) return { credits_total: 0, credits_used: 0 };
  return rows[0];
}

export async function addModel7Credits(userId, amount) {
  await pool.query(
    `INSERT INTO model7_credits (user_id, credits_total, credits_used)
     VALUES ($1, $2, 0)
     ON CONFLICT (user_id) DO UPDATE
     SET credits_total = model7_credits.credits_total + $2, updated_at = NOW()`,
    [userId, amount]
  );
}

export async function canUserMakeModel7Video(userId) {
  const user = await getUserById(userId);
  if (!user || !user.model7_access) return { allowed: false, reason: 'no_access' };
  const credits = await getModel7Credits(userId);
  const remaining = (credits.credits_total || 0) - (credits.credits_used || 0);
  if (remaining < ADS_CREDIT_COST) return { allowed: false, reason: 'quota_exceeded', remaining, cost: ADS_CREDIT_COST };
  return { allowed: true, remaining, cost: ADS_CREDIT_COST };
}

export async function incrementModel7Video(userId) {
  await pool.query(
    `INSERT INTO model7_credits (user_id, credits_total, credits_used)
     VALUES ($1, 0, $2)
     ON CONFLICT (user_id) DO UPDATE
     SET credits_used = model7_credits.credits_used + $2, updated_at = NOW()`,
    [userId, ADS_CREDIT_COST]
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// إدارة قنوات العملاء — VidIQ (مفتاح شخصي لكل عميل) + دورة "اقتراح يومي → موافقة/رفض"
// ═══════════════════════════════════════════════════════════════════════════
export async function createManagedChannel(userId, { label, channelId, vidiqApiKey, platform = 'youtube', formatPref = 'auto', usesVoice = false, modelPref = 4 }) {
  const { rows } = await pool.query(
    `INSERT INTO managed_channels (user_id, platform, label, channel_id, vidiq_api_key, format_pref, uses_voice, model_pref)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, label, channel_id, format_pref, uses_voice, model_pref, status, created_at`,
    [userId, platform, label || null, channelId || null, vidiqApiKey, formatPref, usesVoice ? 1 : 0, modelPref]
  );
  return rows[0];
}

export async function listManagedChannelsForUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, platform, label, channel_id, format_pref, uses_voice, voice_id, model_pref, status, last_run_at, created_at
     FROM managed_channels WHERE user_id = $1 ORDER BY id DESC`,
    [userId]
  );
  return rows;
}

export async function getManagedChannelById(id) {
  const { rows } = await pool.query('SELECT * FROM managed_channels WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function updateManagedChannel(id, userId, patch) {
  const allowed = ['label', 'channel_id', 'format_pref', 'uses_voice', 'voice_id', 'model_pref', 'status'];
  const sets = [], params = [];
  let idx = 1;
  for (const key of allowed) {
    if (patch[key] !== undefined) { sets.push(`${key} = $${idx++}`); params.push(key === 'uses_voice' ? (patch[key] ? 1 : 0) : patch[key]); }
  }
  if (!sets.length) return getManagedChannelById(id);
  params.push(id, userId);
  const { rows } = await pool.query(
    `UPDATE managed_channels SET ${sets.join(', ')} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
    params
  );
  return rows[0] || null;
}

export async function deleteManagedChannel(id, userId) {
  await pool.query('DELETE FROM managed_channels WHERE id = $1 AND user_id = $2', [id, userId]);
}

// قنوات "مستحقة" اليوم — آخر تشغيل من أكتر من 20 ساعة (أو معملهاش أول مرة أصلاً)
export async function getDueManagedChannels() {
  const { rows } = await pool.query(
    `SELECT mc.*, u.email as user_email, u.name as user_name
     FROM managed_channels mc JOIN users u ON u.id = mc.user_id
     WHERE mc.status = 'active' AND (mc.last_run_at IS NULL OR mc.last_run_at < NOW() - INTERVAL '20 hours')`
  );
  return rows;
}

export async function markManagedChannelRun(id) {
  await pool.query('UPDATE managed_channels SET last_run_at = NOW() WHERE id = $1', [id]);
}

export async function createDailyVideoRun({ channelId, userId, ideaTitle, ideaBrief, format, approveToken }) {
  const { rows } = await pool.query(
    `INSERT INTO daily_video_runs (channel_id, user_id, idea_title, idea_brief, format, approve_token)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [channelId, userId, ideaTitle, ideaBrief, format, approveToken]
  );
  return rows[0].id;
}

export async function getDailyVideoRunByToken(token) {
  const { rows } = await pool.query('SELECT * FROM daily_video_runs WHERE approve_token = $1', [token]);
  return rows[0] || null;
}

export async function updateDailyVideoRunStatus(id, status, extra = {}) {
  const sets = ['status = $2'], params = [id, status];
  let idx = 3;
  if (extra.videoUrl !== undefined) { sets.push(`video_url = $${idx++}`); params.push(extra.videoUrl); }
  if (extra.error !== undefined) { sets.push(`error = $${idx++}`); params.push(extra.error); }
  if (extra.decided) sets.push('decided_at = NOW()');
  await pool.query(`UPDATE daily_video_runs SET ${sets.join(', ')} WHERE id = $1`, params);
}

// ✅ العميل نفسه (مش الأدمن) — سجل فيديوهات القناة بتاعته، عشان يقدر يربط كل واحد بلينك
// اليوتيوب الحقيقي بتاعه (بعد الرفع اليدوي) ويشوف أداءه الحقيقي
export async function listDailyVideoRunsForChannel(channelId, userId) {
  const { rows } = await pool.query(
    `SELECT id, idea_title, idea_brief, format, status, video_url, youtube_video_id, error, created_at, decided_at
     FROM daily_video_runs WHERE channel_id = $1 AND user_id = $2 ORDER BY id DESC LIMIT 100`,
    [channelId, userId]
  );
  return rows;
}

export async function getDailyVideoRunById(runId, userId) {
  const { rows } = await pool.query('SELECT * FROM daily_video_runs WHERE id = $1 AND user_id = $2', [runId, userId]);
  return rows[0] || null;
}

export async function linkYoutubeVideoToRun(runId, userId, youtubeVideoId) {
  const { rows } = await pool.query(
    `UPDATE daily_video_runs SET youtube_video_id = $1 WHERE id = $2 AND user_id = $3 AND status = 'done' RETURNING *`,
    [youtubeVideoId, runId, userId]
  );
  return rows[0] || null;
}

export async function listManagedChannelsForAdmin() {
  const { rows } = await pool.query(
    `SELECT mc.id, mc.label, mc.channel_id, mc.format_pref, mc.uses_voice, mc.model_pref, mc.status, mc.last_run_at, mc.created_at, u.email as user_email
     FROM managed_channels mc JOIN users u ON u.id = mc.user_id ORDER BY mc.id DESC LIMIT 200`
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// فويس كلون — عينة صوت واحدة محفوظة لكل عميل (بيستبدلها لو رفع عينة جديدة)
// ═══════════════════════════════════════════════════════════════════════════
export async function saveClonedVoice(userId, { label, sampleUrl, durationSec }) {
  await pool.query('DELETE FROM cloned_voices WHERE user_id = $1', [userId]); // عينة واحدة بس لكل عميل
  const { rows } = await pool.query(
    `INSERT INTO cloned_voices (user_id, label, sample_url, duration_sec) VALUES ($1, $2, $3, $4) RETURNING id, label, sample_url, duration_sec, created_at`,
    [userId, label || null, sampleUrl, durationSec || null]
  );
  return rows[0];
}

export async function getClonedVoiceForUser(userId) {
  const { rows } = await pool.query('SELECT * FROM cloned_voices WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [userId]);
  return rows[0] || null;
}

export async function deleteClonedVoice(userId) {
  await pool.query('DELETE FROM cloned_voices WHERE user_id = $1', [userId]);
}

export async function listClonedVoicesForAdmin() {
  const { rows } = await pool.query(
    `SELECT cv.id, cv.label, cv.sample_url, cv.duration_sec, cv.created_at, u.email as user_email
     FROM cloned_voices cv JOIN users u ON u.id = cv.user_id ORDER BY cv.id DESC LIMIT 200`
  );
  return rows;
}

export async function listRecentDailyRunsForAdmin(limit = 100) {
  const { rows } = await pool.query(
    `SELECT dvr.id, dvr.idea_title, dvr.format, dvr.status, dvr.video_url, dvr.error, dvr.created_at, dvr.decided_at, u.email as user_email, mc.label as channel_label
     FROM daily_video_runs dvr JOIN users u ON u.id = dvr.user_id JOIN managed_channels mc ON mc.id = dvr.channel_id
     ORDER BY dvr.id DESC LIMIT $1`,
    [limit]
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// المنطقة (مصري/دولي) — الايجنت بيسأل عنها لو مش معروفة وقت الاشتراك، وبتتحفظ
// على حساب العميل عشان مايتسألش تاني في المحادثات الجاية
// ═══════════════════════════════════════════════════════════════════════════
export async function updateUserName(userId, name) {
  const clean = String(name || '').trim().slice(0, 80);
  if (!clean) throw new Error('name is required');
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [clean, userId]);
  return clean;
}

export async function setUserRegion(userId, region) {
  const clean = region === 'eg' ? 'eg' : region === 'intl' ? 'intl' : null;
  if (!clean) throw new Error('region must be "eg" or "intl"');
  await pool.query('UPDATE users SET region = $1 WHERE id = $2', [clean, userId]);
  return clean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ذاكرة الايجنت — طلبات فيديو "غير مألوفة" (خطة/سكريبت بصيغة خاصة) بتتحفظ بعد أول
// مرة تتفهم وتتنفذ فيها بنجاح، عشان طلب مشابه لاحقًا (لنفس العميل أو عميل تاني) يتحل
// ذاتيًا من الذاكرة بدل ما الايجنت يعيد يسأل نفس أسئلة التوضيح من الأول
// ═══════════════════════════════════════════════════════════════════════════
export async function rememberAgentRequest(userId, fingerprint, rawRequest, resolvedConfig, model) {
  try {
    await pool.query(
      `INSERT INTO agent_request_memory (user_id, fingerprint, raw_request, resolved_config, model)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, fingerprint.slice(0, 500), rawRequest.slice(0, 4000), JSON.stringify(resolvedConfig), model || null]
    );
    // كل مستخدم بياخد آخر 30 نمط بس — مش أرشيف لا نهائي
    if (userId) {
      await pool.query(
        `DELETE FROM agent_request_memory WHERE id IN (
           SELECT id FROM agent_request_memory WHERE user_id = $1
           ORDER BY created_at DESC OFFSET 30
         )`,
        [userId]
      );
    }
  } catch (e) { console.warn('[Agent Memory] remember failed:', e.message); }
}

export async function findSimilarAgentRequest(userId, fingerprint) {
  const clean = fingerprint.slice(0, 500);
  try {
    // أولوية لنفس العميل الأول (هو الأكثر دقة لطلباته هو بالذات)، وبعدين أي عميل تاني
    // بعتب مشابه (عتبة أعلى شوية عشان مانطبقش حل عميل على طلب عميل تاني إلا لو قريب جدًا)
    if (userId) {
      const own = await pool.query(
        `SELECT raw_request, resolved_config, model, similarity(fingerprint, $2) AS sim
         FROM agent_request_memory WHERE user_id = $1 AND similarity(fingerprint, $2) > 0.35
         ORDER BY sim DESC LIMIT 1`,
        [userId, clean]
      );
      if (own.rows[0]) return own.rows[0];
    }
    const anyUser = await pool.query(
      `SELECT raw_request, resolved_config, model, similarity(fingerprint, $1) AS sim
       FROM agent_request_memory WHERE similarity(fingerprint, $1) > 0.55
       ORDER BY sim DESC LIMIT 1`,
      [clean]
    );
    return anyUser.rows[0] || null;
  } catch (e) {
    // pg_trgm مش متاح — رجوع لمطابقة نصية بسيطة بدل البحث الذكي
    try {
      const params = userId ? [userId, `%${clean.slice(0, 60)}%`] : [`%${clean.slice(0, 60)}%`];
      const q = userId
        ? `SELECT raw_request, resolved_config, model FROM agent_request_memory WHERE user_id = $1 AND fingerprint ILIKE $2 ORDER BY created_at DESC LIMIT 1`
        : `SELECT raw_request, resolved_config, model FROM agent_request_memory WHERE fingerprint ILIKE $1 ORDER BY created_at DESC LIMIT 1`;
      const { rows } = await pool.query(q, params);
      return rows[0] || null;
    } catch { return null; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// تحليل مصدر العملاء (أونبوردنج) — أكتر منصة بيجي منها عملاء، لصفحة الأدمن
// ═══════════════════════════════════════════════════════════════════════════
export async function getReferralSourceStats() {
  const { rows } = await pool.query(
    `SELECT COALESCE(source, 'unknown') as source, COUNT(*)::int as count
     FROM user_onboarding GROUP BY source ORDER BY count DESC`
  );
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// رسالة جماعية بالإيميل لكل المستخدمين — منفصلة عن الإشعار الداخلي (in-app)
// ═══════════════════════════════════════════════════════════════════════════
// ✅ FIX: كان بيبعت كل الـ chunks ورا بعض من غير أي فاصل زمني — Resend عنده rate limit
// (رسالتين في الثانية على الخطط العادية)، فأول chunk بس كان بينجح والباقي بيرجع 429 ويتحذف
// بصمت (نفس نمط باج Pollinations اللي اتصلح النهاردة). دلوقتي فيه فاصل زمني بين كل chunk
// وريتراي مع backoff تصاعدي لو رجع 429 بالذات، فباقي المستخدمين يوصلهم الإيميل فعلًا
export async function sendBroadcastEmail(subject, html, excludeEmails = []) {
  const { rows } = await pool.query('SELECT email FROM users WHERE email IS NOT NULL');
  const excludeSet = new Set(excludeEmails.map(e => String(e).toLowerCase().trim()));
  const emails = rows.map(r => r.email).filter(Boolean).filter(e => !excludeSet.has(e.toLowerCase().trim()));
  const CHUNK = 100; // Resend بيقبل لحد 100 عنوان في نداء batch واحد
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function sendChunk(chunk, attempt = 1) {
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(to => ({ from: 'Erivion <noreply@erivion.net>', to, subject, html }))),
    });
    if (res.status === 429 && attempt <= 3) {
      await sleep(attempt * 3000);
      return sendChunk(chunk, attempt + 1);
    }
    if (!res.ok) {
      console.warn('[Broadcast Email] chunk failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  }

  let sent = 0;
  for (let i = 0; i < emails.length; i += CHUNK) {
    if (i > 0) await sleep(700); // ✅ تحت حد Resend (2 نداء/ثانية) بأمان
    const chunk = emails.slice(i, i + CHUNK);
    try {
      if (await sendChunk(chunk)) sent += chunk.length;
    } catch (e) { console.warn('[Broadcast Email] chunk error:', e.message); }
  }
  return { total: emails.length, sent };
}

// ═══════════════════════════════════════════════════════════════════════════
// مصنع فيديو الصوت (أدمن) — job واحد بيتحدث بمراحله (transcribing → extracting →
// rendering → done/failed) عشان الأدمن يشوف التقدم من غير polling معقد
// ═══════════════════════════════════════════════════════════════════════════
export async function createAudioVideoJob({ audioUrl, transcriptText = null, wordsJson = null, ratio = '16:9', status = 'transcribing', audioPartsJson = null, userId = null }) {
  const { rows } = await pool.query(
    `INSERT INTO audio_video_jobs (audio_url, transcript_text, words_json, ratio, status, audio_parts_json, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [audioUrl, transcriptText, wordsJson ? JSON.stringify(wordsJson) : null, ratio, status, audioPartsJson ? JSON.stringify(audioPartsJson) : null, userId]
  );
  return rows[0];
}

export async function updateAudioVideoJob(id, fields) {
  const cols = [];
  const vals = [];
  let i = 1;
  for (const [key, value] of Object.entries(fields)) {
    const col = { transcriptText: 'transcript_text', wordsJson: 'words_json', elementsJson: 'elements_json', videoUrl: 'video_url', status: 'status', error: 'error', ratio: 'ratio', compositeScenesJson: 'composite_scenes_json', audioUrl: 'audio_url', renderedSeconds: 'rendered_seconds' }[key];
    if (!col) continue;
    cols.push(`${col} = $${i}`);
    vals.push((key === 'wordsJson' || key === 'elementsJson' || key === 'compositeScenesJson') && value != null ? JSON.stringify(value) : value);
    i++;
  }
  // ✅ NEW: نسجّل وقت جهوزية الفيديو بالظبط لما الحالة تتحول لـ"done" مع رابط فيديو —
  // ده اللي بنقيس منه الـ24 ساعة قبل الحذف التلقائي من R2، مش وقت إنشاء الـ job نفسه
  if (fields.status === 'done' && fields.videoUrl) {
    cols.push('video_ready_at = NOW()');
  }
  if (!cols.length) return getAudioVideoJobById(id);
  vals.push(id);
  const { rows } = await pool.query(`UPDATE audio_video_jobs SET ${cols.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return rows[0];
}

export async function getAudioVideoJobById(id) {
  const { rows } = await pool.query('SELECT * FROM audio_video_jobs WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function listAudioVideoJobsForAdmin(limit = 50) {
  const { rows } = await pool.query('SELECT * FROM audio_video_jobs ORDER BY id DESC LIMIT $1', [limit]);
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// فيديو Whiteboard المجاني (عام لكل المستخدمين) — نفس محرك مصنع فيديو الصوت فوق، بس
// بيربط كل job بحساب مستخدم حقيقي، وبيتتبّع رصيد مجاني إجمالي مدى الحياة (10 دقايق/600
// ثانية لكل حساب، بيتوزع على أي عدد فيديوهات/تكملات — مش لكل فيديو لوحده)
// ═══════════════════════════════════════════════════════════════════════════
export const WHITEBOARD_FREE_SECONDS_LIFETIME = 600;

export async function listAudioVideoJobsForUser(userId, limit = 20) {
  const { rows } = await pool.query(
    'SELECT * FROM audio_video_jobs WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
    [userId, limit]
  );
  return rows;
}

export async function getAudioVideoJobForUser(id, userId) {
  const { rows } = await pool.query('SELECT * FROM audio_video_jobs WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] || null;
}

export async function getUserWhiteboardFreeSecondsUsed(userId) {
  const { rows } = await pool.query('SELECT COALESCE(whiteboard_free_seconds_used, 0) AS used FROM users WHERE id = $1', [userId]);
  return rows[0]?.used || 0;
}

// ✅ زيادة ذرّية (atomic) — نفس نمط credits_balance فوق، عشان مفيش سباق (race) لو المستخدم
// عمل أكتر من فيديو في نفس اللحظة تقريبًا
export async function addUserWhiteboardFreeSecondsUsed(userId, seconds) {
  const { rows } = await pool.query(
    'UPDATE users SET whiteboard_free_seconds_used = COALESCE(whiteboard_free_seconds_used, 0) + $1 WHERE id = $2 RETURNING whiteboard_free_seconds_used',
    [Math.max(0, Math.round(seconds)), userId]
  );
  return rows[0]?.whiteboard_free_seconds_used || 0;
}

// ── صور مرجعية ثابتة (القرآن الكريم، صحيح البخاري، صحيح مسلم...) ────────────────────────
export async function upsertReferenceImage(refKey, label, imageUrl) {
  const { rows } = await pool.query(
    `INSERT INTO audio_video_reference_images (ref_key, label, image_url) VALUES ($1, $2, $3)
     ON CONFLICT (ref_key) DO UPDATE SET label = $2, image_url = $3
     RETURNING *`,
    [refKey, label, imageUrl]
  );
  return rows[0];
}

export async function listReferenceImages() {
  const { rows } = await pool.query('SELECT * FROM audio_video_reference_images ORDER BY ref_key');
  return rows;
}

export async function getReferenceImagesMap() {
  const rows = await listReferenceImages();
  const map = {};
  for (const r of rows) map[r.ref_key] = r.image_url;
  return map;
}

export async function deleteReferenceImage(refKey) {
  await pool.query('DELETE FROM audio_video_reference_images WHERE ref_key = $1', [refKey]);
}