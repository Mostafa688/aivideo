import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'fs';
import { execSync } from 'child_process';
import { generateScenesStream, checkContentSafety, MODERATION_REJECTION_MESSAGE } from './services/scriptService.js';
import { fetchMediaForScene, resetUsedVideos, clearJobSet } from './services/mediaService.js';
import { generateVoiceover, generateVoiceoverPerScene, VOICE_OPTIONS } from './services/voiceService.js';
import { renderVideo } from './services/renderService.js';
import { generateAllAIScenes } from './services/aiVideoService.js';
import { renderModel3Video, generateReferenceEdit } from './services/stabilityService.js';
import { renderModel4Video, renderModel5Video, renderModel5MapVideo, generateStickmanCharacterImage, videoToVideoEdit, renderUserVideoEdit, downloadVideo } from './services/seedanceService.js';
import { renderModel8Video } from './services/pvideoService.js';
import mcpRouter from './services/mcpRoutes.js';
import oauthRouter from './services/oauthRoutes.js';
import channelRouter from './services/channelRoutes.js';
import { runDailyChannelCheck } from './services/channelSchedulerService.js';
import voiceCloneRouter from './services/voiceCloneRoutes.js';
import charactersRouter from './services/charactersRoutes.js';
import characterStudioRouter from './services/characterStudioRoutes.js';
import audioVideoRouter from './services/audioVideoRoutes.js';
import whiteboardVideoRouter from './services/whiteboardVideoRoutes.js';
import coursesRouter from './services/coursesRoutes.js';
import changelogRouter from './services/changelogRoutes.js';
import financeRouter from './services/financeRoutes.js';
import roadmapRouter from './services/roadmapRoutes.js';
import statusRouter from './services/statusRoutes.js';
import statsRouter, { logGeneration } from './services/statsRoutes.js';
import { trackJob, finishJob, getJobFromDb, startVideoJobRecovery } from './services/videoJobRecovery.js';
import teamRouter from './services/teamRoutes.js';
import authRouter, { authMiddleware } from './services/authRoutes.js';
import { getUserById, PLANS, getUserCredits, chargeCredits, getCreditsBalance, addCreditsBalance, MODEL12_CREDIT_COSTS, MODEL3_CREDIT_COSTS, MODEL4_CREDIT_COSTS, MODEL5_CREDIT_COSTS, MODEL5_CREDIT_COSTS_WITH_PHOTO, MODEL5_EXTRA_CREDITS_PER_PHOTO, getModel5CreditCost, ADS_CREDIT_COST, submitFeedbackRating, getAllFeedbackRatings, sendBroadcastEmail, getReferralSourceStats, getClonedVoiceForUser } from './services/authService.js';
import { generateNewModelImages, NEW_IMAGE_MODELS } from './services/newImageModelsService.js';
import { generateNewModelVideo, NEW_VIDEO_MODELS, getSuggestedDuration, measureVideoDurationSec, validateReferenceInputs, persistVideoToR2 as persistNewModelVideo } from './services/newVideoModelsService.js';
import { uploadUserSourceVideoToR2 } from './services/audioVideoService.js';
import { mergeVideos } from './services/videoMergeService.js';
import { finishVideos } from './services/montage/postProduction.js';
import { analyzeActiveSpeaker, estimateAnalysisCreditCost } from './services/videoAnalysisService.js';
import { synthesizeNarration, transcribeWithTimestamps, burnCaptions, getBackgroundMusicBuffer, composeVideoAudio } from './services/videoAudioService.js';
import { getImageCreditCost, getPerSecondCreditCost, getMaxClipSeconds, getMinClipSeconds, getFlatCreditCost, getQualityTiers, buildFullPricingTable, REPLICATE_MODEL_COSTS } from './services/creditPricingEngine.js';
// ✅ NEW: عدد المشاهد "العادي" لكل مدة — لازم يطابق نفس الجدول في AgentPage.jsx بالظبط،
// عشان نحسب صح لو خطة العميل عندها مشاهد أكتر من العدد الافتراضي لنفس المدة
const MODEL3_STANDARD_SCENE_COUNT = { '30s': 3, '1min': 6, '3min': 18, '5min': 30 };
const MODEL4_STANDARD_SCENE_COUNT = { '30s': 4, '1min': 8, '3min': 24 };
const MODEL5_STANDARD_SCENE_COUNT = { '30s': 6, '1min': 12 }; // 5s/10s/15s single-clip modes مالهمش جدول، مش بيتفرض عليهم سرشارج
// ✅ FIX (تصحيح تسعير من العميل): موديل 3 المشهد الزيادة عن أي مدة كان 20، الصح 10
const MODEL3_EXTRA_SCENE_COST = 10;
// ✅ FIX: موديل 4 مبقاش فيه فرق بين "مشهد جوه الباقة" و"مشهد زيادة" — كل مشهد (أيًا كان)
// بسعر ثابت 20 كريديت، مفيش خصم باقة خالص. استبدلنا الجدول (MODEL4_CREDIT_COSTS ~25/مشهد)
// والسرشارج القديم (35) بسعر موحّد واحد
const MODEL4_SCENE_COST = 20;
// ✅ FIX: موديل 5 مبقاش بيتحسب بجدول باقات + سرشارج زيادة — التسعير بقى بالثانية زي موديل 8
// بالظبط (12 كريديت/ثانية من غير صورة، 13 مع صورة شخصية واحدة). مشهد 5 ثواني = 60/65 كريديت
// (مطابق تمامًا لكلام العميل)، ومشهد أطول (10 أو 15 ثانية في وضع الكليب الواحد) بياخد سعره
// الحقيقي بالثانية من غير ما يتباع بسعر مشهد 5 ثواني بس. الزيادة (كريديت لكل صورة زيادة بعد
// الأولى) وسرشارج الستيك مان بقوا برضو بيتضاعفوا مع العدد الحقيقي للمشاهد مش بيتضافوا مرة
// واحدة بس على الفيديو كله (كان ده الباج: فيديو 10 مشاهد بصورة كان بيتحسب 605 بدل 650)
const MODEL5_CREDIT_PER_SECOND = 12;
const MODEL5_CREDIT_PER_SECOND_WITH_PHOTO = 13;
const MODEL5_DURATION_SECONDS = { '5s': 5, '10s': 10, '15s': 15, '30s': 30, '1min': 60 };
const MODEL5_STICKMAN_SURCHARGE_PER_SCENE = 20;
// ✅ NEW: تعديل video-to-video حقيقي (Lucy Edit 2) — أغلى بكتير من التعديل النصي العادي
// لأنه بيحافظ فعليًا على الحركة/التوقيت الأصلي بدل ما يولّد المشهد من الصفر
const VIDEO_EDIT_SCENE_COST_MODEL4 = 130; // لكل مشهد
const VIDEO_EDIT_SCENE_COST_MODEL5 = 180; // لكل مشهد
// فيديو العميل الخاص (مش متولّد من المنصة) — سعر لكل ثانية، أقصى مدة 15 ثانية
const VIDEO_EDIT_CREDIT_PER_SECOND = 25;
const VIDEO_EDIT_MAX_SECONDS = 15;
// ✅ NEW: تعديل صورة بمرجع (FLUX-2-Max) — موديل 3 بس، 30 كريديت لكل صورة
const REFERENCE_EDIT_COST_MODEL3 = 30;
// ✅ NEW: موديل 8 (p-video — أرخص بكتير من Seedance) — 4 كريديت/ثانية بدل ما نقفل على شرائح
// مدة ثابتة، لأن العميل بيحدد مدة كل مشهد ومدة الفيديو الكلية بحرية
const MODEL8_RATE_NONE = 4;      // بدون صوت: 4 كريديت/ثانية (5 ثواني = 20، 20 ثانية = 80)
const MODEL8_RATE_VOICEOVER = 5; // فويس أوفر Gemini: 5 كريديت/ثانية (5 ثواني = 25، 20 ثانية = 100)
const MODEL8_RATE_CINEMATIC = 6; // صوت متولّد مع الفيديو نفسه: 6 كريديت/ثانية (5 ثواني = 30، 20 ثانية = 120)
const MODEL8_EDIT_SCENE_COST = 15; // تعديل نصي لمشهد واحد (أرخص من موديل 4 لأن التوليد نفسه أرخص)
import adminRouter from './services/adminRoutes.js';
import { adminAuth } from './services/adminAuthMiddleware.js';
import supportRouter from './services/supportRoutes.js';
import projectRouter from './services/projectRoutes.js';
import { transcribeAudio } from './services/transcribeService.js';
import affiliateRouter from './services/affiliateRoutes.js';
import mapVideoRouter from './services/mapVideoRoutes.js';
import wanVideoRouter from './services/wanVideoRoutes.js';
import adsRouter from './services/adsRoutes.js';
import agentRouter from './services/agentRoutes.js';
import documentaryRouter from './services/documentary/documentaryRoutes.js';
import { recoverInterruptedJobs as recoverDocumentaryJobs } from './services/documentary/documentaryService.js';
import pgPkg from 'pg';
const { Pool: _TPool } = pgPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const renderJobs = new Map();

// رسالة فشل التوليد للعميل: فلتر الأمان بتاع المزوّد (Seedance E005 / P-Video safety checker / NSFW) له رسالة أوضح من "فشل" عام
function friendlyVideoError(msg) {
  return /E005|flagged as sensitive|sensitive content|safety (checker|filter)|nsfw|content policy/i.test(msg || '')
    ? 'The model\'s safety filter flagged the video or the character image (very realistic human faces are often flagged, even when AI-generated, and it can be the template video too). Try a stylized character (cartoon, anime or 3D) or another model such as Wan 2.2 Replace. Your credits were refunded.'
    : 'Video generation failed, your credits were refunded.';
}

// ── Render Limiter ────────────────────────────────────────────────────────────
let activeRenderCount = 0;
const MAX_CONCURRENT_RENDERS = 1;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ✅ NEW: رفع فيديو العميل بتاعه هو لتعديل video-to-video — حجم أكبر (فيديو أثقل من الصور)
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

const RENDER_JOBS_DIR = join(process.cwd(), 'outputs', 'render_jobs');
fs.mkdirSync(RENDER_JOBS_DIR, { recursive: true });

function getRenderJobFile(jobId) {
  return join(RENDER_JOBS_DIR, `${String(jobId)}.json`);
}

function setRenderJob(jobId, data) {
  const key = String(jobId);
  const nextJob = { ...renderJobs.get(key), ...data };
  renderJobs.set(key, nextJob);
  try {
    fs.writeFileSync(getRenderJobFile(key), JSON.stringify(nextJob, null, 2));
  } catch (err) {
    console.error('[Render Job] Could not persist state:', err.message);
  }
}

function getRenderJob(jobId) {
  const key = String(jobId);
  if (renderJobs.has(key)) return renderJobs.get(key);
  try {
    const file = getRenderJobFile(key);
    if (!fs.existsSync(file)) return null;
    const job = JSON.parse(fs.readFileSync(file, 'utf8'));
    renderJobs.set(key, job);
    return job;
  } catch (err) {
    console.error('[Render Job] Could not read persisted state:', err.message);
    return null;
  }
}

function scheduleRenderJobCleanup(jobId, delayMs = 60 * 60 * 1000) {
  setTimeout(() => {
    const key = String(jobId);
    renderJobs.delete(key);
    try {
      const file = getRenderJobFile(key);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (err) {
      console.error('[Render Job] Cleanup failed:', err.message);
    }
  }, delayMs);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
fontSrc: ["'self'", "data:", "https:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.pexels.com", "https://api.groq.com", "https://api.anthropic.com", "https://api.replicate.com"],
      mediaSrc: ["'self'", "blob:", "https://*.r2.dev", "https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev"],
      workerSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "data:", "https:"],
    }
  }
}));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 200,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a few minutes.' },
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 50,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
  skip: (req) => req.path === '/google/callback' || req.path === '/google',
});

const renderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Render limit reached. Please wait before rendering again.' },
});

const sceneLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 30,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Scene generation limit reached. Please wait.' },
});

// ✅ FIX (باج حقيقي خطير: "الموقع كله بقى شاشة سوداء حتى صفحة الأدمن"): كان مطبّق على كل
// طلب بلا استثناء (app.use(generalLimiter) بدون path)، من قبل static file serving بتاع
// الفرونت إند (dist) بكتير — يعني كل طلب لتحميل الصفحة نفسها (JS bundle, CSS, favicon,
// index.html) كان بيتحسب من نفس حد الـ 200 طلب/15 دقيقة المفروض يحمي الـ API بس. جلسة
// تصفح عادية (تحميل + إعادة تحميل + تنقل بين صفحات) بسهولة بتعدّي 200 طلب، وبمجرد ما
// الحد يتعدى، حتى تحميل ملف الـ JS الأساسي نفسه كان بيرجع 429 — يعني الموقع كله بيقف
// (شاشة سودة، مفيش React اتحمل خالص) لحد ما الـ 15 دقيقة تعدي. دلوقتي مقصور على /api بس
// (زي باقي الـ limiters التانية authLimiter/renderLimiter/sceneLimiter بالظبط)، فمينفعش
// يأثر على تحميل الموقع نفسه أبدًا، وبردو بيحمي كل الـ API endpoints زي ما كان المفروض له.
app.use('/api', generalLimiter);
app.use(cors({ origin: true, credentials: true }));
// ✅ FIX: كانت 10mb، وده كان بيرفض أي طلب فيه أكتر من صورة شخصية واحدة (موديل 5 بيسمح
// لحد 5 صور) لأن كل صورة base64 لوحدها ممكن تاخد 2-4 ميجا، فمجموعهم بسهولة بيعدي 10mb
// ويرجع "request entity too large" قبل ما يوصل لأي كود بتاعنا خالص.
// ✅ FIX: الحد كان 10mb بس، وده كافي لصورة واحدة (لحد 5MB زي MAX_IMAGE_MB) لكن لو العميل رفع
// أكتر من صورة شخصية مع بعض لموديل 5 (لحد 5 صور × 5MB = 25MB خام ≈ 33MB+ بعد base64)،
// حجم الـ JSON بيتخطى الحد القديم ويترفض الطلب بالكامل بـ "request entity too large" قبل
// ما يوصل لأي كود بتاعنا خالص. 50mb بيدّي هامش أمان كافي حتى لأقصى حالة (5 صور).
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api', (req, res, next) => {
  const isAdminRoute =
    req.path.includes('/admin/approve') ||
    req.path.includes('/admin/reject') ||
    req.path.includes('/model3-approve') ||
    req.path.includes('/model3-reject') ||
    req.path.includes('/model4-approve') ||
    req.path.includes('/model4-reject');
  if (isAdminRoute) return next();
  const originalSend = res.send.bind(res);
  res.send = (body) => {
    if (typeof body === 'string' && body.trim().startsWith('<!')) {
      console.error('[API JSON Fix] HTML response intercepted on:', req.path);
      res.setHeader('Content-Type', 'application/json');
      return originalSend(JSON.stringify({ error: 'Server error. Please try again.' }));
    }
    return originalSend(body);
  };
  next();
});

app.use('/outputs', express.static('outputs'));
app.use('/outputs/ads_img', express.static(join(process.cwd(), 'outputs', 'ads_img')));
app.use('/outputs/templates', express.static(join(process.cwd(), 'outputs', 'templates')));
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin', adminRouter);
// ✅ FIX: كانت 3 نسخ مكررة من sitemap.xml و robots.txt في الملف — Express بس بيستخدم
// أول واحد مسجّل، يعني النسخة الشاملة بتاعتنا (تحت في آخر الملف) كانت أبدًا ما بتشتغل!
// اتشالت النسخ القديمة المكررة دي، وهنسيب نسخة واحدة كاملة بس في الآخر.

app.use('/api/support', supportRouter);
app.use('/api/projects', projectRouter);


app.use('/api/affiliate', affiliateRouter);
app.use('/api/map-video', mapVideoRouter);
app.use('/api/wan-video', wanVideoRouter);
app.use('/api/ads', adsRouter);
app.use('/api/agent', agentRouter);
// ✅ NEW: استوديو الأفلام الوثائقية — إنشاء وظيفة بتتحدد بمعدل الرندر (20/ساعة) زي باقي مسارات التوليد
app.use(['/api/documentary/jobs', '/api/documentary/autoedit'], (req, res, next) => (req.method === 'POST' ? renderLimiter(req, res, next) : next()));
app.use('/api/documentary', documentaryRouter);
recoverDocumentaryJobs();
app.use('/api/channels', channelRouter);
app.use('/api/voice-clone', voiceCloneRouter);
app.use('/api/characters', charactersRouter);
app.use('/api/character-studio', characterStudioRouter);
app.use('/api/admin/audio-video', audioVideoRouter);
app.use('/api/whiteboard-video', whiteboardVideoRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/changelog', changelogRouter);
app.use('/api/finance', financeRouter);
app.use('/api/roadmap', roadmapRouter);
app.use('/api/system-status', statusRouter);
app.use('/api/stats', statsRouter);
app.use('/api/team', teamRouter);
app.use('/mcp', mcpRouter);
app.use(oauthRouter); // ✅ NEW: على الروت مباشرة — مسارات /.well-known و/oauth/* لازم تكون هنا

// ── Community API ──────────────────────────────────────────────────────────────
const cPool = new _TPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

// Create tables
cPool.query(`
  CREATE TABLE IF NOT EXISTS community_posts (
    id SERIAL PRIMARY KEY,
    author_email TEXT,
    author_name TEXT NOT NULL,
    avatar_letter TEXT,
    avatar_color TEXT DEFAULT '#7c6af7',
    plan TEXT DEFAULT 'Free',
    content TEXT NOT NULL,
    image_url TEXT,
    tag TEXT DEFAULT 'Showcase',
    likes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS community_comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
    author_email TEXT,
    author_name TEXT NOT NULL,
    avatar_letter TEXT,
    avatar_color TEXT DEFAULT '#7c6af7',
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS community_likes (
    post_id INTEGER REFERENCES community_posts(id) ON DELETE CASCADE,
    ip TEXT,
    user_email TEXT,
    PRIMARY KEY (post_id, ip)
  );
  CREATE TABLE IF NOT EXISTS admin_notifications (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`).catch(e => console.error('[Community] DB init error:', e.message));

// Migration: add moderation columns if they don't exist yet
cPool.query(`
  ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
  ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
`).catch(() => {});

// GET /api/community/posts — get all posts with comments
app.get('/api/community/posts', async (req, res) => {
  try {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';

    // Identify logged-in user (to show their own pending/rejected posts)
    let viewerEmail = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const { rows } = await cPool.query(`SELECT email FROM users WHERE token=$1 LIMIT 1`, [token]);
        if (rows[0]) viewerEmail = rows[0].email;
      } catch {}
    }

    const { rows: posts } = await cPool.query(`
      SELECT p.*,
        COALESCE(json_agg(
          json_build_object(
            'id', c.id,
            'author', c.author_name,
            'letter', c.avatar_letter,
            'color', c.avatar_color,
            'text', c.content,
            'created_at', c.created_at
          ) ORDER BY c.created_at ASC
        ) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments,
        EXISTS(SELECT 1 FROM community_likes l WHERE l.post_id = p.id AND l.ip = $1) AS user_liked
      FROM community_posts p
      LEFT JOIN community_comments c ON c.post_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [ip]);

    const formatted = posts
      .filter(p => {
        // Show approved posts to everyone
        // Show pending/rejected only to the author
        const st = p.status || 'approved';
        if (st === 'approved') return true;
        if (viewerEmail && p.author_email === viewerEmail) return true;
        return false;
      })
      .map(p => ({
        id: String(p.id),
        author: p.author_name,
        avatar_letter: p.avatar_letter || (p.author_name?.[0] || 'U').toUpperCase(),
        avatar_color: p.avatar_color || '#7c6af7',
        plan: p.plan || 'Free',
        content: p.content,
        image_url: p.image_url || null,
        tag: p.tag || 'Showcase',
        likes: parseInt(p.likes) || 0,
        liked: p.user_liked === true,
        comments: p.comments || [],
        created_at: p.created_at,
        status: p.status || 'approved',
        rejection_reason: p.rejection_reason || null,
        is_mine: viewerEmail ? (p.author_email === viewerEmail) : false,
        is_arabic: false, // frontend will determine from localStorage
      }));
    res.json({ posts: formatted });
  } catch (e) {
    console.error('[Community] GET posts error:', e.message);
    res.json({ posts: [] });
  }
});

// POST /api/community/posts — create post
app.post('/api/community/posts', async (req, res) => {
  try {
    const { content, tag, image_url } = req.body;
    if (!content || content.trim().length < 10) return res.status(400).json({ error: 'Content too short' });
    if (content.length > 1000) return res.status(400).json({ error: 'Content too long' });

    // Get user info from token if available
    let authorName = 'Anonymous';
    let authorEmail = null;
    let avatarLetter = 'A';
    let avatarColor = '#7c6af7';
    let plan = 'Free';
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const { rows } = await cPool.query(
          `SELECT email, plan FROM users WHERE token = $1 LIMIT 1`,
          [token]
        );
        if (rows[0]) {
          authorEmail = rows[0].email;
          authorName = rows[0].email.split('@')[0];
          avatarLetter = authorName[0].toUpperCase();
          plan = rows[0].plan ? (rows[0].plan.charAt(0).toUpperCase() + rows[0].plan.slice(1)) : 'Free';
          const colors = ['#7c6af7','#06b6d4','#f59e0b','#10b981','#e11d48','#a855f7'];
          avatarColor = colors[authorName.charCodeAt(0) % colors.length];
        }
      } catch {}
    }

    // Validate image (base64 images only, no mp4)
    let finalImageUrl = null;
    if (image_url) {
      if (image_url.includes('video') || image_url.includes('.mp4')) {
        return res.status(400).json({ error: 'Videos not allowed' });
      }
      // Accept base64 images or HTTPS image URLs
      if (image_url.startsWith('data:image/') || image_url.startsWith('https://')) {
        finalImageUrl = image_url.length > 5 * 1024 * 1024 ? null : image_url; // 5MB limit
      }
    }

    const validTags = ['Showcase', 'Tips', 'Question', 'Workflow', 'Success'];
    const finalTag = validTags.includes(tag) ? tag : 'Showcase';

    const { rows } = await cPool.query(
      `INSERT INTO community_posts (author_email, author_name, avatar_letter, avatar_color, plan, content, image_url, tag, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending') RETURNING id`,
      [authorEmail, authorName, avatarLetter, avatarColor, plan, content.trim(), finalImageUrl, finalTag]
    );
    res.json({ id: String(rows[0].id), success: true, status: 'pending' });
  } catch (e) {
    console.error('[Community] POST post error:', e.message);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// POST /api/community/posts/:id/like — toggle like
app.post('/api/community/posts/:id/like', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userEmail = null; // Could add auth check

    // Check if already liked
    const { rows: existing } = await cPool.query(
      `SELECT 1 FROM community_likes WHERE post_id=$1 AND ip=$2`,
      [postId, ip]
    );

    if (existing.length > 0) {
      // Unlike
      await cPool.query(`DELETE FROM community_likes WHERE post_id=$1 AND ip=$2`, [postId, ip]);
      await cPool.query(`UPDATE community_posts SET likes = GREATEST(0, likes-1) WHERE id=$1`, [postId]);
      res.json({ liked: false });
    } else {
      // Like
      await cPool.query(`INSERT INTO community_likes (post_id, ip) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [postId, ip]);
      await cPool.query(`UPDATE community_posts SET likes = likes+1 WHERE id=$1`, [postId]);
      res.json({ liked: true });
    }
  } catch (e) {
    console.error('[Community] Like error:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/community/posts/:id/comments — add comment
app.post('/api/community/posts/:id/comments', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });

    const { content } = req.body;
    if (!content || content.trim().length < 1) return res.status(400).json({ error: 'Empty comment' });
    if (content.length > 500) return res.status(400).json({ error: 'Comment too long' });

    let authorName = 'Anonymous';
    let avatarLetter = 'A';
    let avatarColor = '#7c6af7';
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const { rows } = await cPool.query(`SELECT email FROM users WHERE token=$1 LIMIT 1`, [token]);
        if (rows[0]) {
          authorName = rows[0].email.split('@')[0];
          avatarLetter = authorName[0].toUpperCase();
          const colors = ['#7c6af7','#06b6d4','#f59e0b','#10b981','#e11d48','#a855f7'];
          avatarColor = colors[authorName.charCodeAt(0) % colors.length];
        }
      } catch {}
    }

    const { rows } = await cPool.query(
      `INSERT INTO community_comments (post_id, author_name, avatar_letter, avatar_color, content)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at`,
      [postId, authorName, avatarLetter, avatarColor, content.trim()]
    );
    res.json({
      id: String(rows[0].id),
      author: authorName,
      letter: avatarLetter,
      color: avatarColor,
      text: content.trim(),
      created_at: rows[0].created_at,
    });
  } catch (e) {
    console.error('[Community] Comment error:', e.message);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// DELETE /api/community/posts/:id — delete post (owner or admin)
app.delete('/api/community/posts/:id', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: 'Invalid ID' });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

    const token = authHeader.slice(7);
    const { rows } = await cPool.query(`SELECT email, is_admin FROM users WHERE token=$1 LIMIT 1`, [token]);
    if (!rows[0]) return res.status(401).json({ error: 'Invalid token' });

    const { email, is_admin } = rows[0];
    const authorName = email.split('@')[0];

    // Check ownership
    const { rows: post } = await cPool.query(`SELECT author_name FROM community_posts WHERE id=$1`, [postId]);
    if (!post[0]) return res.status(404).json({ error: 'Post not found' });

    if (!is_admin && post[0].author_name !== authorName) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await cPool.query(`DELETE FROM community_posts WHERE id=$1`, [postId]);
    res.json({ success: true });
  } catch (e) {
    console.error('[Community] Delete error:', e.message);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// POST /api/community/posts/:id/ask-support — flag post for admin attention
app.post('/api/community/posts/:id/ask-support', async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: 'Invalid ID' });

    // Add a flag column if not exists
    await cPool.query(`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS needs_support BOOLEAN DEFAULT FALSE`).catch(()=>{});
    await cPool.query(`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS support_requested_at TIMESTAMPTZ`).catch(()=>{});

    await cPool.query(
      `UPDATE community_posts SET needs_support=TRUE, support_requested_at=NOW() WHERE id=$1`,
      [postId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Community] Ask support error:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// ── POST /api/feedback/rate — تقييم داخلي بعد أي فيديو (من أي عميل، مشترك أو لأ) ──
app.post('/api/feedback/rate', authMiddleware, async (req, res) => {
  try {
    const { rating, comment, modelUsed } = req.body;
    const r = parseInt(rating);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'rating must be 1-5' });
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const result = await submitFeedbackRating(req.user.userId, user.email, r, (comment || '').trim().slice(0, 1000), modelUsed || '');
    res.json({ success: true, showTrustpilotCTA: result.showTrustpilotCTA, trustpilotUrl: 'https://www.trustpilot.com/review/erivion.net' });
  } catch (err) {
    console.error('[Feedback Rate]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/ratings — كل التقييمات الداخلية (أدمن بس)
// ══════════════════════════════════════════════════════════════════════════
//  ✅ إشعار عام بيبعته الأدمن، بيبان لكل المستخدمين، وبيختفي تلقائيًا بعد 24 ساعة
//  (ملحوظة: الراوتس دي كانت موجودة قبل كده واتمسحت بالغلط في تعديل لاحق — رجّعناها)
// ══════════════════════════════════════════════════════════════════════════

app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const { rows } = await cPool.query(
      `SELECT id, title, message, created_at FROM admin_notifications
       WHERE created_at > NOW() - INTERVAL '24 hours' ORDER BY id DESC`
    );
    res.json({ notifications: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/notifications', adminAuth, async (req, res) => {
  try {
    const { rows } = await cPool.query(`SELECT id, title, message, created_at FROM admin_notifications ORDER BY id DESC LIMIT 100`);
    res.json({ notifications: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/notifications', adminAuth, async (req, res) => {
  try {
    const { title, message } = req.body;
    if (!title?.trim() || !message?.trim()) return res.status(400).json({ error: 'title and message are required' });
    const { rows } = await cPool.query(
      `INSERT INTO admin_notifications (title, message) VALUES ($1, $2) RETURNING id, title, message, created_at`,
      [title.trim(), message.trim()]
    );
    res.json({ notification: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/notifications/:id', adminAuth, async (req, res) => {
  try {
    await cPool.query(`DELETE FROM admin_notifications WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: رسالة جماعية بالإيميل لكل المستخدمين — منفصلة تمامًا عن الإشعار الداخلي (in-app)
// فوق. زرار مستقل في صفحة الأدمن، مش بيتحفظ في admin_notifications ولا بيظهر جوه الموقع
app.post('/api/admin/notifications/email-all', adminAuth, async (req, res) => {
  try {
    const { subject, message, html: customHtml, excludeEmails } = req.body;
    if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
    if (!customHtml?.trim() && !message?.trim()) return res.status(400).json({ error: 'message or html is required' });
    // ✅ NEW: لو الأدمن بعت HTML مخصص كامل (تصميم بالألوان/جدول أسعار/زرار)، بيتبعت زي ما هو
    // من غير ما نلفّه في القالب البسيط تحت — ده بس fallback لما مفيش HTML مخصص متبعت
    const html = customHtml?.trim()
      ? customHtml.trim()
      : `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#7c6af7;margin-top:0">${subject.trim()}</h2><div style="color:#d1d5db;font-size:14px;line-height:1.8;white-space:pre-wrap">${message.trim()}</div></div>`;
    // ✅ NEW: عشان لو broadcast سابق فشل في نصه (باج rate limit اتصلح النهاردة)، الأدمن يقدر
    // يستثني الإيميلات اللي وصلتها فعلًا بدل ما يتكرر عليهم الإيميل تاني
    const excludeList = Array.isArray(excludeEmails) ? excludeEmails : [];
    const result = await sendBroadcastEmail(subject.trim(), html, excludeList);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: أكتر المنصات اللي بيجي منها عملاء — لتاب "Answers" في صفحة الأدمن
app.get('/api/admin/referral-sources', adminAuth, async (req, res) => {
  try {
    const sources = await getReferralSourceStats();
    res.json({ sources });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/ratings', adminAuth, async (req, res) => {
  try {
    const ratings = await getAllFeedbackRatings();
    res.json({ ratings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/community-questions — get posts flagged for support (admin only)
app.get('/api/admin/community-questions', adminAuth, async (req, res) => {
  try {
    await cPool.query(`ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS needs_support BOOLEAN DEFAULT FALSE`).catch(()=>{});

    const { rows } = await cPool.query(`
      SELECT p.*,
        COALESCE(json_agg(
          json_build_object(
            'id', c.id,
            'author', c.author_name,
            'text', c.content,
            'created_at', c.created_at
          ) ORDER BY c.created_at ASC
        ) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments
      FROM community_posts p
      LEFT JOIN community_comments c ON c.post_id = p.id
      WHERE p.needs_support = TRUE
      GROUP BY p.id
      ORDER BY p.support_requested_at DESC
      LIMIT 50
    `);
    res.json({ questions: rows });
  } catch (e) {
    console.error('[Community] Admin get questions error:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/community-all — get ALL community posts for admin
app.get('/api/admin/community-all', adminAuth, async (req, res) => {
  try {
    const { rows } = await cPool.query(`
      SELECT p.*,
        COALESCE(json_agg(
          json_build_object(
            'id', c.id,
            'author', c.author_name,
            'text', c.content,
            'created_at', c.created_at
          ) ORDER BY c.created_at ASC
        ) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments
      FROM community_posts p
      LEFT JOIN community_comments c ON c.post_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 200
    `);
    res.json({ posts: rows });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/admin/community-reply — admin replies as comment on a post
app.post('/api/admin/community-reply', adminAuth, async (req, res) => {
  try {
    const { post_id, content } = req.body;
    if (!post_id || !content?.trim()) return res.status(400).json({ error: 'Missing fields' });

    const { rows } = await cPool.query(
      `INSERT INTO community_comments (post_id, author_name, avatar_letter, avatar_color, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [parseInt(post_id), '⚡ Erivion Support', 'E', '#7c6af7', content.trim()]
    );

    // Mark as resolved
    await cPool.query(`UPDATE community_posts SET needs_support=FALSE WHERE id=$1`, [parseInt(post_id)]);

    res.json({ success: true, comment_id: rows[0].id });
  } catch (e) {
    console.error('[Community] Admin reply error:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// DELETE /api/admin/community-post/:id — admin delete any post
app.delete('/api/admin/community-post/:id', adminAuth, async (req, res) => {
  try {
    await cPool.query(`DELETE FROM community_posts WHERE id=$1`, [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/community-pending — get posts awaiting moderation
app.get('/api/admin/community-pending', adminAuth, async (req, res) => {
  try {
    const { rows } = await cPool.query(`
      SELECT p.*,
        COALESCE(json_agg(
          json_build_object('id', c.id, 'author', c.author_name, 'text', c.content, 'created_at', c.created_at)
          ORDER BY c.created_at ASC
        ) FILTER (WHERE c.id IS NOT NULL), '[]') AS comments
      FROM community_posts p
      LEFT JOIN community_comments c ON c.post_id = p.id
      WHERE p.status = 'pending'
      GROUP BY p.id
      ORDER BY p.created_at ASC
    `);

    const posts = rows.map(p => ({
      id: String(p.id),
      author_name: p.author_name,
      author_email: p.author_email,
      avatar_letter: p.avatar_letter || (p.author_name?.[0] || 'U').toUpperCase(),
      plan: p.plan || 'Free',
      content: p.content,
      image_url: p.image_url || null,
      tag: p.tag || 'Showcase',
      status: p.status,
      created_at: p.created_at,
      comments: p.comments || [],
    }));
    res.json({ posts });
  } catch (e) {
    console.error('[Community] GET pending error:', e.message);
    res.status(500).json({ posts: [] });
  }
});

// POST /api/admin/community-post/:id/approve — approve a pending post
app.post('/api/admin/community-post/:id/approve', adminAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });
    await cPool.query(
      `UPDATE community_posts SET status='approved', rejection_reason=NULL WHERE id=$1`,
      [postId]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Community] Approve error:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/admin/community-post/:id/reject — reject a pending post with optional reason
app.post('/api/admin/community-post/:id/reject', adminAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ error: 'Invalid post ID' });
    const reason = (req.body.reason || '').trim() || null;
    await cPool.query(
      `UPDATE community_posts SET status='rejected', rejection_reason=$2 WHERE id=$1`,
      [postId, reason]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Community] Reject error:', e.message);
    res.status(500).json({ error: 'Failed' });
  }
});


app.post('/api/transcribe', authMiddleware, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Audio file required' });
  // model 4 = max 2.5 min (~8MB), model 3 = max 3 min (~10MB), default = 3 min
  const model = req.body.model || req.query.model || '';
  const MAX_SIZE = model === 'model4' ? 8 * 1024 * 1024 : 10 * 1024 * 1024;
  const MAX_LABEL = model === 'model4' ? '2 minutes 30 seconds' : '3 minutes';
  if (req.file.size > MAX_SIZE) return res.status(400).json({ error: `Audio too long. Maximum allowed is ${MAX_LABEL}.` });
  const ext = req.file.originalname.split('.').pop()?.toLowerCase();
  const allowedExts = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'flac'];
  const allowedTypes = ['audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg','audio/flac','video/mp4','audio/x-m4a','audio/mp3','audio/x-wav'];
  if (!allowedTypes.includes(req.file.mimetype) && !allowedExts.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported format. Use MP3, MP4, WAV, WebM, OGG, or FLAC.' });
  }
  try {
    const language = req.body.language || null;
    const text = await transcribeAudio(req.file.buffer, req.file.originalname, language);
    const audioFilename = `voice_upload_${req.user.userId}_${Date.now()}.${ext || 'mp3'}`;
    const audioSavePath = join(process.cwd(), 'outputs', audioFilename);
    fs.writeFileSync(audioSavePath, req.file.buffer);
    res.json({ text, audioUrl: '/outputs/' + audioFilename, filename: req.file.originalname });
  } catch (err) {
    console.error('[Transcribe]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/voices', (req, res) => res.json({ voices: VOICE_OPTIONS }));

app.post('/api/generate-scenes', authMiddleware, sceneLimiter, async (req, res) => {
  const { idea, script, tone, duration, mode, videoLanguage, structuredScenes } = req.body;
  // ✅ NEW: وضع الـ structured — العميل بيبعت مشاهد متقسمة جاهزة (Scene 1/2/3...) بدل idea/script عادي
  const hasStructured = Array.isArray(structuredScenes) && structuredScenes.length > 0;
  if (!idea && !script && !hasStructured) return res.status(400).json({ error: 'idea or script is required' });
  // ✅ فحص أمان المحتوى قبل أي توليد — رفض المحتوى الإباحي/العنصري/العنيف
  const moderationText = hasStructured
    ? structuredScenes.map(s => s?.text || '').join(' ').slice(0, 1500)
    : (idea || script);
  const modCheck = await checkContentSafety(moderationText);
  if (modCheck.unsafe) {
    return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck.category });
  }
  // ✅ نظام الكريديت الموحد: أي مدة أو لغة متاحة للجميع — الكريديت هو القيد الوحيد، بيتفحص وقت الرندر
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event, data) => { res.write('event: ' + event + '\n'); res.write('data: ' + JSON.stringify(data) + '\n\n'); };
  try {
    send('status', { message: 'Generating your script...' });
    await generateScenesStream({ idea, script, tone, duration, mode, userId: req.user.userId, videoLanguage, structuredScenes }, send);
    send('done', { message: 'Scene generation complete' });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

app.post('/api/fetch-media', authMiddleware, async (req, res) => {
  const { scenes, ratio, jobId } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const currentJobId = jobId || ('job_' + Date.now());
  resetUsedVideos(currentJobId);
  try {
    const enriched = [];
    for (const scene of scenes) {
      // ✅ FIX: كنا بنبعت الكلمات المفتاحية بس من غير النص الفعلي للمشهد — الكلمات دي
      // غالبًا عامة/قصيرة (زي "business", "meeting") وممكن تجيب فيديو بعيد تمامًا عن
      // معنى الجملة المنطوقة في المشهد. دلوقتي بنبعت نص المشهد نفسه كـ query أساسي أولى،
      // عشان البحث يبقى مبني على المعنى الفعلي مش بس تصنيف عام.
      const media = await fetchMediaForScene(scene.keywords, ratio || '16:9', currentJobId, scene.text || scene.visual || null);
      enriched.push({ ...scene, media });
    }
    setTimeout(() => clearJobSet(currentJobId), 5 * 60 * 1000);
    res.json({ scenes: enriched });
  } catch (err) {
    clearJobSet(currentJobId);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/generate-voice', authMiddleware, async (req, res) => {
  const { text, scenes, voice, videoType, speed, videoLanguage } = req.body;
  if (!text && !(Array.isArray(scenes) && scenes.length)) return res.status(400).json({ error: 'text or scenes is required' });
  try {
    // ✅ FIX: لو اتبعتلنا scenes (بدل نص واحد مجمّع)، نولّد صوت لكل مشهد لوحده
    // ونقيس مدته الحقيقية عشان الصوت يتزامن مع كل مشهد بالظبط
    if (Array.isArray(scenes) && scenes.length) {
      const result = await generateVoiceoverPerScene(scenes, voice || 'male_american', videoType || 'education', speed || 0, videoLanguage || 'en');
      if (!result) return res.status(500).json({ error: 'Voice generation failed' });
      return res.json({ audioUrl: '/outputs/' + result.filename, sceneDurations: result.sceneDurations });
    }
    const audioPath = await generateVoiceover(text, voice || 'male_american', videoType || 'education', speed || 0, videoLanguage || 'en');
    res.json({ audioUrl: '/outputs/' + audioPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MODEL12_CREDIT_COSTS imported from authService.js
const _MODEL12_TMP = {
  '30s':   3,
  'auto':  3,
  '1min':  6,
  '2min':  12,
  '3min':  18,
  '4min':  24,
  '5min':  30,
  '8min':  48,
  '10min': 60,
};

// ── GET credit cost for a given duration (model 1&2) ─────────────────────────
app.get('/api/credit-cost', authMiddleware, (req, res) => {
  const { duration } = req.query;
  const cost = MODEL12_CREDIT_COSTS[duration] || 3;
  res.json({ creditCost: cost, duration });
});

// ✅ NEW: تعديل مشهد واحد بس من فيديو موجود (موديل 1/2 حاليًا) — بيحافظ على نفس الصوت،
// نفس باقي المشاهد، ونفس المدة، وبيغيّر مشهد واحد بس ثم يعيد الدمج النهائي فقط، بدل ما
// يعيد توليد الفيديو بالكامل من الصفر زي ما كان بيحصل قبل كده (وهو أغلى وأبطأ وبيغيّر
// حتى المشاهد اللي العميل مطلبش تغييرها).
const EDIT_SCENE_CREDIT_COST = 2; // أرخص بكتير من فيديو كامل لأنه بيعيد جلب مشهد واحد بس
// ✅ NEW: تكلفة تعديل مشهد بالنص لموديل 3/4/5 — كل موديل له سعره حسب تكلفة توليد المشهد
// الحقيقية (Model 3: صورة واحدة، Model 4: كليب Seedance، Model 5: كليب Seedance مع مرجع شخصية)
const EDIT_SCENE_MODEL3_COST = 10;
const EDIT_SCENE_MODEL4_COST = 30;
const EDIT_SCENE_MODEL5_COST = 70;

app.post('/api/edit-scene', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, sceneIndex, newDescription, audioUrl, ratio, duration, music, captions, videoType, videoLanguage, sceneDurations, jobId } = req.body;
  const renderJobId = String(jobId || Date.now());
  if (!Array.isArray(scenes) || !scenes.length) return res.status(400).json({ error: 'scenes required' });
  const idx = parseInt(sceneIndex, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= scenes.length) return res.status(400).json({ error: 'Invalid sceneIndex' });
  if (!newDescription?.trim()) return res.status(400).json({ error: 'newDescription required' });
  if (!audioUrl) return res.status(400).json({ error: 'audioUrl required — editing only supported for videos with existing audio/timing' });

  try {
    const user = await getUserById(req.user.userId);
    const balance = await getCreditsBalance(req.user.userId);
    if (balance < EDIT_SCENE_CREDIT_COST) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${EDIT_SCENE_CREDIT_COST} credits, you have ${balance}.`, cost: EDIT_SCENE_CREDIT_COST, remaining: balance });
    }
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }

    // ✅ فحص أمان المحتوى على الوصف الجديد بس (باقي المشاهد اتفحصت أصلاً وقت التوليد الأول)
    const modCheckEdit = await checkContentSafety(newDescription);
    if (modCheckEdit.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckEdit.category });
    }

    // ✅ NEW: الخصم فور بدء التعديل مش بعد الانتهاء
    const editCharge = await chargeCredits(req.user.userId, EDIT_SCENE_CREDIT_COST);
    if (!editCharge.success) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${EDIT_SCENE_CREDIT_COST} credits, you have ${editCharge.remaining}.`, cost: EDIT_SCENE_CREDIT_COST, remaining: editCharge.remaining });
    }

    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: EDIT_SCENE_CREDIT_COST });

    (async () => {
      try {
        // ── نجيب ميديا جديدة للمشهد المطلوب تغييره بس — الوصف الجديد نفسه هو أهم إشارة بحث ──
        const editJobId = 'edit_' + renderJobId;
        resetUsedVideos(editJobId);
        const newMedia = await fetchMediaForScene(
          newDescription.trim().split(/\s+/).slice(0, 4), // كلمات مفتاحية بسيطة من الوصف الجديد
          ratio || '16:9',
          editJobId,
          newDescription.trim()
        );
        clearJobSet(editJobId);

        // ── نبني نسخة معدّلة من نفس مصفوفة المشاهد، بتغيير المشهد المطلوب بس ──
        const updatedScenes = scenes.map((scene, i) =>
          i === idx ? { ...scene, text: newDescription.trim(), media: newMedia } : scene
        );

        // ── نفس الصوت، نفس باقي المشاهد، نفس التوقيتات — التغيير الوحيد هو مشهد واحد ──
        const videoPath = await renderVideo({
          scenes: updatedScenes, audioUrl, ratio: ratio || '16:9', jobId: renderJobId,
          duration: duration || '30s', music: !!music, captions: captions !== false, transitions: true,
          videoType: videoType || 'pexels_clips', videoLanguage: videoLanguage || 'en',
          sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null,
        });

        setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: EDIT_SCENE_CREDIT_COST });
      } catch (jobErr) {
        console.error('[EditScene] Failed:', jobErr.message);
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Scene edit failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
      }
    })();
  } catch (err) {
    console.error('[EditScene] Error:', err.message);
    res.status(500).json({ error: err.message || 'Scene edit failed.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: تعديل مشهد محدد بالنص — موديل 3، موديل 4، موديل 5 (مش map-video ومش ads،
//  زي ما اتفقنا). نفس مبدأ /api/edit-scene بتاع موديل 1/2 بالظبط: بنبني نسخة من نفس
//  مصفوفة المشاهد، المشهد المطلوب تغييره بوصف جديد (يتولّد من جديد)، وكل باقي المشاهد
//  بتاخد رابط الصورة/الكليب الجاهز من الرندر الأصلي (existingImageUrl/existingClipUrl)
//  عشان تتعاد زي ما هي بالظبط من غير أي توليد أو تكلفة إضافية.
// ══════════════════════════════════════════════════════════════════════════

app.post('/api/model3/edit-scene', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, sceneImageUrls, sceneIndex, newDescription, audioUrl, ratio, duration, music, captions, videoLanguage, sceneDurations, jobId, mode, referenceImageBase64 } = req.body;
  const renderJobId = String(jobId || Date.now());
  const isReferenceMode = mode === 'reference'; // ✅ NEW: تعديل بتوجيه من صورة مرجعية (FLUX-2-Max)
  const editCost = isReferenceMode ? REFERENCE_EDIT_COST_MODEL3 : EDIT_SCENE_MODEL3_COST;
  if (!Array.isArray(scenes) || !scenes.length) return res.status(400).json({ error: 'scenes required' });
  const idx = parseInt(sceneIndex, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= scenes.length) return res.status(400).json({ error: 'Invalid sceneIndex' });
  if (!newDescription?.trim()) return res.status(400).json({ error: 'newDescription required' });
  if (isReferenceMode && !referenceImageBase64) return res.status(400).json({ error: 'referenceImageBase64 is required for reference-mode edits' });
  if (isReferenceMode && !sceneImageUrls?.[idx]) return res.status(400).json({ error: 'No existing image found for this scene — reference edit needs the original render\'s scene image.' });
  try {
    const balance = await getCreditsBalance(req.user.userId);
    if (balance < editCost) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${editCost} credits, you have ${balance}.`, cost: editCost, remaining: balance });
    }
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }
    const modCheckEdit = await checkContentSafety(newDescription);
    if (modCheckEdit.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckEdit.category });
    }
    const editCharge = await chargeCredits(req.user.userId, editCost);
    if (!editCharge.success) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${editCost} credits, you have ${editCharge.remaining}.`, cost: editCost, remaining: editCharge.remaining });
    }
    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: editCost });
    (async () => {
      try {
        let updatedScenes;
        if (isReferenceMode) {
          // ✅ الصورة الأصلية بتتحول لـ base64 data URI (بدل ما نعتمد على رابط عام)، وبتتبعت
          // مع صورة المرجع مع بعض لـ FLUX-2-Max — الصورة الناتجة بتاخد مكان صورة المشهد زي ما هي
          const baseImagePath = sceneImageUrls[idx].startsWith('http')
            ? null
            : join(process.cwd(), sceneImageUrls[idx].replace(/^\//, ''));
          let baseImageDataUri;
          if (baseImagePath && fs.existsSync(baseImagePath)) {
            const b64 = fs.readFileSync(baseImagePath).toString('base64');
            baseImageDataUri = `data:image/jpeg;base64,${b64}`;
          } else {
            baseImageDataUri = sceneImageUrls[idx]; // already an absolute URL
          }
          const editedBuffer = await generateReferenceEdit(baseImageDataUri, referenceImageBase64, newDescription.trim(), ratio || '16:9');
          const editedFilename = `${renderJobId}_${idx}_refedit.jpg`;
          const editedLocalPath = join(process.cwd(), 'outputs', 'scene_cache', editedFilename);
          fs.mkdirSync(join(process.cwd(), 'outputs', 'scene_cache'), { recursive: true });
          fs.writeFileSync(editedLocalPath, editedBuffer);
          updatedScenes = scenes.map((scene, i) => i === idx
            ? { ...scene, existingImageUrl: `/outputs/scene_cache/${editedFilename}` }
            : { ...scene, existingImageUrl: sceneImageUrls?.[i] || scene.existingImageUrl });
        } else {
          updatedScenes = scenes.map((scene, i) => i === idx
            ? { ...scene, text: newDescription.trim(), prompt: newDescription.trim(), visual: newDescription.trim(), existingImageUrl: undefined }
            : { ...scene, existingImageUrl: sceneImageUrls?.[i] || scene.existingImageUrl });
        }
        const { outputFile: videoPath, sceneImageUrls: newSceneImageUrls } = await renderModel3Video({
          scenes: updatedScenes, audioUrl, ratio: ratio || '16:9', jobId: renderJobId,
          duration: duration || '1min', music: !!music, captions: captions !== false, transitions: false,
          videoLanguage: videoLanguage || 'en', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null,
        });
        setRenderJob(renderJobId, {
          status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: editCost,
          editContext: { scenes: updatedScenes, sceneImageUrls: newSceneImageUrls, audioUrl, ratio: ratio || '16:9', duration: duration || '1min', captions: captions !== false, music: !!music, videoLanguage: videoLanguage || 'en', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null },
        });
      } catch (jobErr) {
        console.error('[Model3 EditScene] Failed:', jobErr.message);
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Scene edit failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
      }
    })();
  } catch (err) {
    console.error('[Model3 EditScene] Error:', err.message);
    res.status(500).json({ error: err.message || 'Scene edit failed.' });
  }
});

app.post('/api/model4/edit-scene', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, sceneClipUrls, sceneIndex, newDescription, audioUrl, ratio, music, captions, videoLanguage, videoStyle, styleSuffix, sceneDurations, jobId, mode } = req.body;
  const renderJobId = String(jobId || Date.now());
  const isVideoMode = mode === 'video'; // ✅ NEW: تعديل video-to-video حقيقي (Lucy Edit 2) بدل إعادة التوليد من الصفر
  const editCost = isVideoMode ? VIDEO_EDIT_SCENE_COST_MODEL4 : EDIT_SCENE_MODEL4_COST;
  if (!Array.isArray(scenes) || !scenes.length) return res.status(400).json({ error: 'scenes required' });
  const idx = parseInt(sceneIndex, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= scenes.length) return res.status(400).json({ error: 'Invalid sceneIndex' });
  if (!newDescription?.trim()) return res.status(400).json({ error: 'newDescription required' });
  if (isVideoMode && !sceneClipUrls?.[idx]) return res.status(400).json({ error: 'No existing clip found for this scene — video-to-video edit needs the original render\'s scene clip.' });
  try {
    const balance = await getCreditsBalance(req.user.userId);
    if (balance < editCost) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${editCost} credits, you have ${balance}.`, cost: editCost, remaining: balance });
    }
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }
    const modCheckEdit = await checkContentSafety(newDescription);
    if (modCheckEdit.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckEdit.category });
    }
    const editCharge = await chargeCredits(req.user.userId, editCost);
    if (!editCharge.success) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${editCost} credits, you have ${editCharge.remaining}.`, cost: editCost, remaining: editCharge.remaining });
    }
    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: editCost });
    (async () => {
      try {
        let updatedScenes;
        if (isVideoMode) {
          const sourceClipUrl = sceneClipUrls[idx];
          const absoluteSourceUrl = sourceClipUrl.startsWith('http') ? sourceClipUrl : `${process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net'}${sourceClipUrl}`;
          const editedClipUrl = await videoToVideoEdit(absoluteSourceUrl, newDescription.trim());
          const editedLocalPath = join(process.cwd(), 'outputs', 'scene_cache', `${renderJobId}_${idx}_videoedit.mp4`);
          await downloadVideo(editedClipUrl, editedLocalPath);
          updatedScenes = scenes.map((scene, i) => i === idx
            ? { ...scene, existingClipUrl: `/outputs/scene_cache/${renderJobId}_${idx}_videoedit.mp4` }
            : { ...scene, existingClipUrl: sceneClipUrls?.[i] || scene.existingClipUrl });
        } else {
          updatedScenes = scenes.map((scene, i) => i === idx
            ? { ...scene, text: newDescription.trim(), prompt: newDescription.trim(), visual: newDescription.trim(), existingClipUrl: undefined }
            : { ...scene, existingClipUrl: sceneClipUrls?.[i] || scene.existingClipUrl });
        }
        const { outputFile: videoPath, sceneClipUrls: newSceneClipUrls } = await renderModel4Video({
          scenes: updatedScenes, audioUrl, ratio: ratio || '16:9', jobId: renderJobId,
          captions: captions !== false, music: !!music, videoLanguage: videoLanguage || 'en',
          videoStyle: videoStyle || 'cinematic', styleSuffix: styleSuffix || '',
          sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null,
        });
        setRenderJob(renderJobId, {
          status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: editCost,
          editContext: { scenes: updatedScenes, sceneClipUrls: newSceneClipUrls, audioUrl, ratio: ratio || '16:9', captions: captions !== false, music: !!music, videoLanguage: videoLanguage || 'en', videoStyle: videoStyle || 'cinematic', styleSuffix: styleSuffix || '', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null },
        });
      } catch (jobErr) {
        console.error('[Model4 EditScene] Failed:', jobErr.message);
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Scene edit failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
      }
    })();
  } catch (err) {
    console.error('[Model4 EditScene] Error:', err.message);
    res.status(500).json({ error: err.message || 'Scene edit failed.' });
  }
});

// ✅ موديل 5 — بس النمط العادي (idea/prompt/image بالشخصيات)، مش map-video (15 ثانية) ومش ads
app.post('/api/model5/edit-scene', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, sceneClipUrls, sceneIndex, newDescription, ratio, duration, music, jobId, mode } = req.body;
  const renderJobId = String(jobId || Date.now());
  const isVideoMode = mode === 'video';
  const editCost = isVideoMode ? VIDEO_EDIT_SCENE_COST_MODEL5 : EDIT_SCENE_MODEL5_COST;
  if (!Array.isArray(scenes) || !scenes.length) return res.status(400).json({ error: 'scenes required' });
  const idx = parseInt(sceneIndex, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= scenes.length) return res.status(400).json({ error: 'Invalid sceneIndex' });
  if (!newDescription?.trim()) return res.status(400).json({ error: 'newDescription required' });
  if (isVideoMode && !sceneClipUrls?.[idx]) return res.status(400).json({ error: 'No existing clip found for this scene — video-to-video edit needs the original render\'s scene clip.' });
  try {
    const balance = await getCreditsBalance(req.user.userId);
    if (balance < editCost) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${editCost} credits, you have ${balance}.`, cost: editCost, remaining: balance });
    }
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }
    const modCheckEdit = await checkContentSafety(newDescription);
    if (modCheckEdit.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckEdit.category });
    }
    const editCharge = await chargeCredits(req.user.userId, editCost);
    if (!editCharge.success) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${editCost} credits, you have ${editCharge.remaining}.`, cost: editCost, remaining: editCharge.remaining });
    }
    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: editCost });
    (async () => {
      try {
        // ✅ ملحوظة: في الوضع النصي (mode !== 'video')، المشهد المعاد توليده بيفقد أي مرجع شخصية
        // كان عليه (characterPhotos) لأنه بقى وصف جديد بالكامل. في وضع الـ video-to-video، الشخصية
        // بتفضل زي ما هي تلقائيًا لأننا مش بنعيد التوليد أصلًا، بس بنعدّل الكليب الموجود.
        let updatedScenes;
        if (isVideoMode) {
          const sourceClipUrl = sceneClipUrls[idx];
          const absoluteSourceUrl = sourceClipUrl.startsWith('http') ? sourceClipUrl : `${process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net'}${sourceClipUrl}`;
          const editedClipUrl = await videoToVideoEdit(absoluteSourceUrl, newDescription.trim());
          const editedLocalPath = join(process.cwd(), 'outputs', 'scene_cache', `${renderJobId}_${idx}_videoedit.mp4`);
          await downloadVideo(editedClipUrl, editedLocalPath);
          updatedScenes = scenes.map((scene, i) => i === idx
            ? { ...scene, existingClipUrl: `/outputs/scene_cache/${renderJobId}_${idx}_videoedit.mp4` }
            : { ...scene, existingClipUrl: sceneClipUrls?.[i] || scene.existingClipUrl });
        } else {
          updatedScenes = scenes.map((scene, i) => i === idx
            ? { ...scene, text: newDescription.trim(), prompt: newDescription.trim(), visual: newDescription.trim(), existingClipUrl: undefined }
            : { ...scene, existingClipUrl: sceneClipUrls?.[i] || scene.existingClipUrl });
        }
        const { outputFile: videoPath, sceneClipUrls: newSceneClipUrls } = await renderModel5Video({
          scenes: updatedScenes, ratio: ratio || '9:16', jobId: renderJobId, duration: duration || '15s', music: music !== false,
        });
        setRenderJob(renderJobId, {
          status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: editCost,
          editContext: { scenes: updatedScenes, sceneClipUrls: newSceneClipUrls, ratio: ratio || '9:16', duration: duration || '15s', music: music !== false },
        });
      } catch (jobErr) {
        console.error('[Model5 EditScene] Failed:', jobErr.message);
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Scene edit failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
      }
    })();
  } catch (err) {
    console.error('[Model5 EditScene] Error:', err.message);
    res.status(500).json({ error: err.message || 'Scene edit failed.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: العميل بيرفع فيديو بتاعه هو (مش متولّد من المنصة) ويطلب مونتاج/تعديل
//  عليه بالـ AI (decart/lucy-edit-2 على Replicate) — أقصى مدة 15 ثانية، بيتحسب
//  السعر لكل ثانية فعلية من الفيديو المرفوع.
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/video-edit', authMiddleware, renderLimiter, videoUpload.single('video'), async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if ((user.plan || 'free') === 'free') {
      return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock video editing.', show_upgrade: true });
    }
    const videoFile = req.file;
    if (!videoFile) return res.status(400).json({ error: 'video file is required' });
    const { editPrompt, addVoiceover, voiceoverText, voiceKey, addCaptions, videoLanguage, ratio } = req.body;
    if (!editPrompt?.trim()) return res.status(400).json({ error: 'editPrompt is required' });

    const modCheckVE = await checkContentSafety(`${editPrompt} ${voiceoverText || ''}`);
    if (modCheckVE.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckVE.category });
    }

    // ── نحفظ الفيديو المرفوع مؤقتًا عشان نقيس مدته الحقيقية (ffprobe) قبل ما نحسب السعر ──
    const tmpUploadDir = join(process.cwd(), 'outputs', 'video_edit_tmp');
    fs.mkdirSync(tmpUploadDir, { recursive: true });
    const tmpUploadPath = join(tmpUploadDir, `upload_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
    fs.writeFileSync(tmpUploadPath, videoFile.buffer);
    // ✅ NEW: تشخيص حقيقي — لو الملف وصل فاضي أو صغير جدًا، المشكلة في الرفع نفسه مش في ffprobe
    const writtenSize = fs.statSync(tmpUploadPath).size;
    console.log(`[VideoEdit] Uploaded file: ${videoFile.originalname}, mimetype: ${videoFile.mimetype}, buffer: ${videoFile.buffer.length} bytes, written: ${writtenSize} bytes`);
    if (!writtenSize || writtenSize < 1000) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Upload failed — received only ${writtenSize} bytes. Please try uploading the video again.` });
    }

    let durationSec;
    try {
      const probeOut = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tmpUploadPath}"`,
        { encoding: 'utf8' }
      ).trim();
      durationSec = parseFloat(probeOut);
      if (!durationSec) console.error(`[VideoEdit] ffprobe returned empty/unparseable output: "${probeOut}"`);
    } catch (e) {
      // ✅ NEW: نسجّل الخطأ الحقيقي (stderr من ffprobe) بدل ما نبلعه في رسالة عامة —
      // ده اللي هيوريّنا فعليًا سبب الفشل الحقيقي في اللوجز في المرة الجاية
      const realError = e.stderr?.toString().trim() || e.message;
      console.error(`[VideoEdit] ffprobe failed on "${tmpUploadPath}" (${writtenSize} bytes, mimetype ${videoFile.mimetype}):`, realError);
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Could not read video file (${realError.slice(0, 150)}) — please make sure it's a valid MP4 and try again.` });
    }
    if (!durationSec || durationSec <= 0) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: 'Could not determine video duration.' });
    }
    if (durationSec > VIDEO_EDIT_MAX_SECONDS + 0.5) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Video is ${durationSec.toFixed(1)}s — max allowed is ${VIDEO_EDIT_MAX_SECONDS} seconds.` });
    }

    const veCreditCost = Math.ceil(durationSec) * VIDEO_EDIT_CREDIT_PER_SECOND;
    const veBalance = await getCreditsBalance(req.user.userId);
    if (veBalance < veCreditCost) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${veCreditCost} credits, you have ${veBalance}.`, cost: veCreditCost, remaining: veBalance });
    }
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }
    const veCharge = await chargeCredits(req.user.userId, veCreditCost);
    if (!veCharge.success) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${veCreditCost} credits, you have ${veCharge.remaining}.`, cost: veCreditCost, remaining: veCharge.remaining });
    }

    const renderJobId = String(Date.now());
    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: veCreditCost, durationSec: Math.round(durationSec) });

    (async () => {
      try {
        const videoPath = await renderUserVideoEdit({
          uploadedVideoPath: tmpUploadPath,
          editPrompt: editPrompt.trim(),
          addVoiceover: addVoiceover === 'true' || addVoiceover === true,
          voiceoverText: voiceoverText || '',
          voiceKey: voiceKey || 'male_wise',
          addCaptions: addCaptions === 'true' || addCaptions === true,
          videoLanguage: videoLanguage || 'en',
          ratio: ratio || '9:16',
          jobId: renderJobId,
        });
        setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: veCreditCost });
        logGeneration({ userId: req.user.userId, kind: 'edit', modelKey: 'decart_lucy_edit_2', creditCost: veCreditCost });
      } catch (jobErr) {
        console.error('[VideoEdit] Failed:', jobErr.message);
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Video edit failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
        try { if (fs.existsSync(tmpUploadPath)) fs.unlinkSync(tmpUploadPath); } catch {}
      }
    })();
  } catch (err) {
    console.error('[VideoEdit] Error:', err.message);
    res.status(500).json({ error: err.message || 'Video edit failed.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: رفع فيديو والحصول على رابط عام بس (من غير تعديل) — عشان العميل يقدر ياخد
//  اللينك ده ويستخدمه في أي مكان، وبالأخص لـ MCP (Claude مش بيقدر يرفع ملفات فيديو
//  مباشرة، بس يقدر ياخد رابط ويبعته للأداة).
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/upload-video-link', authMiddleware, renderLimiter, videoUpload.single('video'), async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if ((user.plan || 'free') === 'free') {
      return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock this feature.', show_upgrade: true });
    }
    const videoFile = req.file;
    if (!videoFile) return res.status(400).json({ error: 'video file is required' });

    const tmpUploadDir = join(process.cwd(), 'outputs', 'video_edit_tmp');
    fs.mkdirSync(tmpUploadDir, { recursive: true });
    const tmpUploadPath = join(tmpUploadDir, `linkcheck_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
    fs.writeFileSync(tmpUploadPath, videoFile.buffer);
    const writtenSize = fs.statSync(tmpUploadPath).size;
    if (!writtenSize || writtenSize < 1000) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Upload failed — received only ${writtenSize} bytes. Please try uploading the video again.` });
    }

    let durationSec;
    try {
      const probeOut = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tmpUploadPath}"`,
        { encoding: 'utf8' }
      ).trim();
      durationSec = parseFloat(probeOut);
    } catch (e) {
      const realError = e.stderr?.toString().trim() || e.message;
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Could not read video file (${realError.slice(0, 150)}) — please make sure it's a valid MP4 and try again.` });
    }
    if (!durationSec || durationSec <= 0) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: 'Could not determine video duration.' });
    }
    // ?use=swap: فيديو لتبديل الشخصية (P-Video Animate) — سقفه 60 ثانية بدل 15 بتاعة تعديل الفيديو
    const linkMaxSec = req.query.use === 'swap' ? (getMaxClipSeconds('wan_2_2_animate_replace') || 30) : VIDEO_EDIT_MAX_SECONDS;
    if (durationSec > linkMaxSec + 0.5) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Video is ${durationSec.toFixed(1)}s — max allowed for ${req.query.use === 'swap' ? 'character swap' : 'video-to-video editing'} is ${linkMaxSec} seconds.` });
    }

    // نحفظ نسخة دائمة (مش مؤقتة) في مكان عام — ده اللي هيبقى اللينك النهائي
    const publicDir = join(process.cwd(), 'outputs', 'user_uploads');
    fs.mkdirSync(publicDir, { recursive: true });
    const publicFilename = `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    fs.copyFileSync(tmpUploadPath, join(publicDir, publicFilename));
    fs.unlinkSync(tmpUploadPath);

    const siteUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net';
    res.json({ videoUrl: `${siteUrl}/outputs/user_uploads/${publicFilename}`, durationSec: Math.round(durationSec) });
  } catch (err) {
    console.error('[UploadVideoLink] Error:', err.message);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW (طلب العميل — سكرين شوت: قال "حرك الصورة دي" لصورة مرفقة في محادثة Claude/MCP،
//  ولقى الايجنت مقدرش يستخدمها فعليًا واخترع فيديو تاني بدل ما يقوله محتاج رابط): نفس فكرة
//  /api/upload-video-link فوق بالظبط، بس للصور — رابط عام دائم عشان يستخدم مع generate_video's
//  "imageUrl" على MCP، لأن الأداة مش بتقدر تستقبل ملف مرفق مباشرة من المحادثة.
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/upload-image-link', authMiddleware, renderLimiter, upload.single('image'), async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if ((user.plan || 'free') === 'free') {
      return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock this feature.', show_upgrade: true });
    }
    const imageFile = req.file;
    if (!imageFile) return res.status(400).json({ error: 'image file is required' });
    if (!/^image\//.test(imageFile.mimetype || '')) {
      return res.status(400).json({ error: 'File must be an image.' });
    }
    if (!imageFile.buffer || imageFile.buffer.length < 100) {
      return res.status(400).json({ error: `Upload failed — received only ${imageFile.buffer?.length || 0} bytes. Please try uploading the image again.` });
    }

    const ext = (imageFile.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg').slice(0, 4);
    const publicDir = join(process.cwd(), 'outputs', 'user_uploads');
    fs.mkdirSync(publicDir, { recursive: true });
    const publicFilename = `link_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    fs.writeFileSync(join(publicDir, publicFilename), imageFile.buffer);

    const siteUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net';
    res.json({ imageUrl: `${siteUrl}/outputs/user_uploads/${publicFilename}` });
  } catch (err) {
    console.error('[UploadImageLink] Error:', err.message);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// ✅ NEW: نفس تعديل الفيديو (Lucy Edit 2)، بس بيستقبل رابط فيديو جاهز بدل ملف مرفوع
// مباشرة — ده اللي MCP (Claude) بيستخدمه، لأن الأدوات مش بتقدر ترفع ملفات فيديو فعلية
app.post('/api/video-edit-by-url', authMiddleware, renderLimiter, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if ((user.plan || 'free') === 'free') {
      return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock video editing.', show_upgrade: true });
    }
    const { videoUrl, editPrompt, addVoiceover, voiceoverText, voiceKey, addCaptions, videoLanguage, ratio } = req.body;
    if (!videoUrl?.trim()) return res.status(400).json({ error: 'videoUrl is required' });
    if (!editPrompt?.trim()) return res.status(400).json({ error: 'editPrompt is required' });

    const modCheckVE = await checkContentSafety(`${editPrompt} ${voiceoverText || ''}`);
    if (modCheckVE.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckVE.category });
    }

    // ── نزّل الفيديو من اللينك المرسل ──
    const tmpUploadDir = join(process.cwd(), 'outputs', 'video_edit_tmp');
    fs.mkdirSync(tmpUploadDir, { recursive: true });
    const tmpUploadPath = join(tmpUploadDir, `urledit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
    try {
      const dlRes = await fetch(videoUrl);
      if (!dlRes.ok) throw new Error(`HTTP ${dlRes.status}`);
      const buf = Buffer.from(await dlRes.arrayBuffer());
      fs.writeFileSync(tmpUploadPath, buf);
    } catch (e) {
      return res.status(400).json({ error: `Could not download video from the given URL (${e.message}). Make sure it's a direct, publicly accessible link.` });
    }
    const writtenSize = fs.statSync(tmpUploadPath).size;
    if (!writtenSize || writtenSize < 1000) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Downloaded file is too small (${writtenSize} bytes) — the URL may not point directly to a video file.` });
    }

    let durationSec;
    try {
      const probeOut = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tmpUploadPath}"`,
        { encoding: 'utf8' }
      ).trim();
      durationSec = parseFloat(probeOut);
    } catch (e) {
      const realError = e.stderr?.toString().trim() || e.message;
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Could not read video file (${realError.slice(0, 150)}) — please make sure the URL points to a valid MP4.` });
    }
    if (!durationSec || durationSec <= 0) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: 'Could not determine video duration.' });
    }
    if (durationSec > VIDEO_EDIT_MAX_SECONDS + 0.5) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(400).json({ error: `Video is ${durationSec.toFixed(1)}s — max allowed is ${VIDEO_EDIT_MAX_SECONDS} seconds.` });
    }

    const veCreditCost = Math.ceil(durationSec) * VIDEO_EDIT_CREDIT_PER_SECOND;
    const veBalance = await getCreditsBalance(req.user.userId);
    if (veBalance < veCreditCost) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${veCreditCost} credits, you have ${veBalance}.`, cost: veCreditCost, remaining: veBalance });
    }
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }
    const veCharge = await chargeCredits(req.user.userId, veCreditCost);
    if (!veCharge.success) {
      fs.unlinkSync(tmpUploadPath);
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${veCreditCost} credits, you have ${veCharge.remaining}.`, cost: veCreditCost, remaining: veCharge.remaining });
    }

    const renderJobId = String(Date.now());
    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: veCreditCost, durationSec: Math.round(durationSec) });

    (async () => {
      try {
        const videoPath = await renderUserVideoEdit({
          uploadedVideoPath: tmpUploadPath,
          editPrompt: editPrompt.trim(),
          addVoiceover: addVoiceover === 'true' || addVoiceover === true,
          voiceoverText: voiceoverText || '',
          voiceKey: voiceKey || 'male_wise',
          addCaptions: addCaptions === 'true' || addCaptions === true,
          videoLanguage: videoLanguage || 'en',
          ratio: ratio || '9:16',
          jobId: renderJobId,
        });
        setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: veCreditCost });
        logGeneration({ userId: req.user.userId, kind: 'edit', modelKey: 'decart_lucy_edit_2', creditCost: veCreditCost });
      } catch (jobErr) {
        console.error('[VideoEditByUrl] Failed:', jobErr.message);
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Video edit failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
        try { if (fs.existsSync(tmpUploadPath)) fs.unlinkSync(tmpUploadPath); } catch {}
      }
    })();
  } catch (err) {
    console.error('[VideoEditByUrl] Error:', err.message);
    res.status(500).json({ error: err.message || 'Video edit failed.' });
  }
});

app.post('/api/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, audioUrl, ratio, jobId, duration, music, captions, transitions, soundEffects, videoType, captionStyle, musicVolume, sfxVolume, videoEffect, sceneDurations } = req.body;
  const renderJobId = String(jobId || Date.now());
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  try {
    const user = await getUserById(req.user.userId);
    const planData = PLANS[user?.plan || 'free'];
    // ✅ العميل على "free" (لسه ما شحنش رصيد حقيقي) مقصور على موديل 2 (Real Footage) بس
    if ((user?.plan || 'free') === 'free' && videoType !== 'pexels_clips') {
      return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock all models.', show_upgrade: true });
    }
    // ✅ العميل على "free" مقصور على مدة 30 ثانية بس لحد ما يشترك (نفس القفل الظاهر في الواجهة، بس هنا في السيرفر عشان محدش يتخطاه)
    if ((user?.plan || 'free') === 'free' && duration !== '30s' && duration !== 'auto') {
      return res.status(403).json({ error: 'no_access', message: 'Free plan is limited to 30-second videos. Top up credits to unlock all durations.', show_upgrade: true });
    }
    const creditCost = MODEL12_CREDIT_COSTS[duration] || 5;
    const currentBalance = await getCreditsBalance(req.user.userId);
    if (currentBalance < creditCost) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${creditCost} credits, you have ${currentBalance}.`, cost: creditCost, remaining: currentBalance });
    }
    if (soundEffects && !planData.sound_effects) return res.status(403).json({ error: 'Sound effects require Plus plan or higher.' });
    if (videoEffect && videoEffect !== 'none' && !planData.video_effects) return res.status(403).json({ error: 'Video effects require Max plan.' });
    const applyWatermark = planData.watermark !== false;
    // ── Concurrency Check ────────────────────────────────────────────────────
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }

    // ✅ NEW: الخصم بقى بيحصل فور بدء التوليد (قبل ما يتبعت أي طلب لـ Replicate/Groq) —
    // مش بعد الانتهاء. التكلفة الحقيقية عندنا بتتحمّل فور الإرسال بغض النظر عن النتيجة، فمنطقي
    // إن الخصم يحصل في نفس اللحظة، سواء العميل استنى أو دوس Stop أو الفيديو فشل بعد كده.
    const chargeResult = await chargeCredits(req.user.userId, creditCost);
    if (!chargeResult.success) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${creditCost} credits, you have ${chargeResult.remaining}.`, cost: creditCost, remaining: chargeResult.remaining });
    }

    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost });
    (async () => {
      try {
        const videoPath = await renderVideo({ scenes, audioUrl, ratio, jobId: renderJobId, duration, music, captions, transitions, soundEffects, videoType: videoType || 'education', captionStyle: captionStyle || null, musicVolume: typeof musicVolume === 'number' ? musicVolume : 0.07, sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.4, videoEffect: videoEffect || 'none', applyWatermark, videoLanguage: req.body.videoLanguage || 'en', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null });
        setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost });
      } catch (jobErr) {
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
      }
    })();
  } catch (err) {
    res.status(500).json({ error: err.message || 'Render failed.' });
  }
});

app.get('/api/render-status/:jobId', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const jobId = String(req.params.jobId);
  const videoUrl = '/outputs/' + `video_${jobId}.mp4`;
  const videoPath = join(process.cwd(), 'outputs', `video_${jobId}.mp4`);
  if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0) return res.json({ status: 'done', videoUrl });
  const job = getRenderJob(jobId);
  if (job && job.userId && job.userId !== req.user.userId) return res.status(404).json({ error: 'Render job not found' });
  if (job?.status === 'failed') return res.json({ status: 'failed', error: job.error || 'Render failed.' });
  if (job?.status === 'done') return res.json({ status: 'done', videoUrl: job.videoUrl || videoUrl });
  const createdAt = job?.createdAt || Date.now();
  const elapsedSeconds = Math.floor((Date.now() - createdAt) / 1000);
  res.json({ status: 'processing', elapsedSeconds });
});

app.post('/api/generate-ai-video', authMiddleware, async (req, res) => {
  const { scenes, ratio } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event, data) => { res.write('event: ' + event + '\n'); res.write('data: ' + JSON.stringify(data) + '\n\n'); };
  try {
    const results = await generateAllAIScenes(scenes, send, ratio || '16:9');
    send('done', { scenes: results });
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

app.post('/api/ai-edit', authMiddleware, async (req, res) => {
  const { scenes, prompt } = req.body;
  if (!scenes?.length || !prompt) return res.status(400).json({ error: 'scenes and prompt required' });
  try {
    const scenesText = scenes.map((s, i) => `Scene ${i + 1}: ${s.text}`).join('\n');
    const editPrompt = `You are a professional video script editor.\n\nCurrent scenes:\n${scenesText}\n\nUser instruction: ${prompt}\n\nReturn ONLY a valid JSON array, same number of scenes. Each scene: { "index": number, "type": "hook"|"body"|"ending", "text": string, "keywords": string[] }\n\nJSON array:`;
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', max_tokens: 6000, temperature: 0.7, reasoning_effort: 'low', messages: [{ role: 'user', content: editPrompt }] }),
    });
    const groqData = await groqRes.json();
    const textContent = groqData.choices?.[0]?.message?.content || '';
    let editedScenes;
    try {
      const cleaned = textContent.replace(/```json\n?|\n?```/g, '').trim();
      editedScenes = JSON.parse(cleaned);
    } catch {
      return res.json({ scenes });
    }
    const finalScenes = editedScenes.map((s, i) => ({ ...scenes[i], ...s, keywords: s.keywords || scenes[i]?.keywords || [] }));
    res.json({ scenes: finalScenes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/model3/credit-cost', authMiddleware, (req, res) => {
  const { duration } = req.query;
  res.json({ creditCost: MODEL3_CREDIT_COSTS[duration] || 5, duration });
});
app.get('/api/model4/credit-cost', authMiddleware, (req, res) => {
  const { duration } = req.query;
  // ✅ FIX: مفيش جدول باقات تاني، بس ده preview قبل ما المشاهد تتولد فعليًا فلسه بيعتمد على
  // تقدير عدد المشاهد "العادي" للمدة دي × سعر المشهد الثابت — التكلفة الحقيقية النهائية دايمًا
  // بتتحسب في /api/model4/render من العدد الحقيقي الفعلي للمشاهد
  const estScenes = MODEL4_STANDARD_SCENE_COUNT[duration] || 4;
  res.json({ creditCost: estScenes * MODEL4_SCENE_COST, duration });
});
app.get('/api/model5/credit-cost', authMiddleware, (req, res) => {
  const { duration, hasPhoto, photoCount, stickman } = req.query;
  // ✅ FIX: بيقبل دلوقتي عدد الصور الفعلي (photoCount) مش بس علم hasPhoto ثنائي —
  // عشان يعرض السعر الصحيح المتزايد مع كل صورة إضافية قبل ما العميل يأكد التوليد
  const count = photoCount ? parseInt(photoCount, 10) || 0 : (hasPhoto === 'true' ? 1 : 0);
  // ✅ FIX: نفس معادلة /api/model5/render بالظبط (بالثانية، مش جدول باقات) — ده preview قبل
  // التوليد الفعلي فبيقدّر عدد المشاهد من المدة (1 لأوضاع الكليب الواحد 5s/10s/15s، أو
  // MODEL5_STANDARD_SCENE_COUNT لوضع المشاهد المتعددة)
  const estScenes = MODEL5_STANDARD_SCENE_COUNT[duration] || 1;
  const totalSeconds = estScenes <= 1 ? (MODEL5_DURATION_SECONDS[duration] || 5) : estScenes * 5;
  const perSecondRate = count > 0 ? MODEL5_CREDIT_PER_SECOND_WITH_PHOTO : MODEL5_CREDIT_PER_SECOND;
  const extraPhotos = count > 1 ? MODEL5_EXTRA_CREDITS_PER_PHOTO * (count - 1) : 0;
  const stickmanSurcharge = (count === 0 && stickman === 'true') ? MODEL5_STICKMAN_SURCHARGE_PER_SCENE : 0;
  const creditCost = totalSeconds * perSecondRate + estScenes * (extraPhotos + stickmanSurcharge);
  res.json({ creditCost, duration, photoCount: count });
});

// ── Model 3 Routes ─────────────────────────────────────────────────────────
async function checkModel3Access(req, res, next) {
  try {
    const user = await getUserById(req.user.userId);
    if (!user || !user.model3_access) return res.status(403).json({ error: 'Model 3 access required.' });
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ── Stickman style rule — لو الستايل أو فكرة الفيديو نفسها بتطلب "stick man/stick figure"،
// الشخصية لازم يبقى ليها وش معبّر بتفاصيل واضحة (حواجب، عيون بحدقة، أنف، وفم بيعبّر عن الموقف)
// مش دايرة فاضية أو وش بسيط جدًا. والمشاهد لازم تكمل بعض كقصة واحدة متصلة مش لقطات منفصلة.
// الخلفية بقت مرنة: لو العميل مطلبش مكان معين، افتراضي بسيط (أبيض/رمادي فاتح) عشان التركيز
// يفضل على الحركة. لو العميل حدد مكان (غابة، صحراء، حرب، ...)، نحترم طلبه وناخد المكان ده
// لكن برضو نخلي التفاصيل بسيطة/مسطحة عشان يفضل متماشي مع أسلوب الرسم البسيط.
// بيتطبق في كل مكان بيتحدد فيه styleHint/styleInstruction (موديل 3، 4، 5)، وبيفحص نص الفكرة
// نفسها كمان لأن غالبًا العميل بيكتب "stickman" جوه فكرة الفيديو مش في خانة الستايل بس.

function applyStickmanStyleRule(styleText, ideaText = '') {
  const combined = `${styleText || ''} ${ideaText || ''}`;
  if (!/stick\s*-?\s*man|stick\s*-?\s*figure/i.test(combined)) return styleText;
  const hasCustomSetting = /forest|jungle|desert|beach|ocean|underwater|city|street|room|kitchen|bedroom|bathroom|war|battlefield|desert war|mountain|snow|space|school|classroom|office|park|cave|rooftop|garden|market|stadium|غابة|جنينة|صحراء|شارع|بيت|أوضة|حرب|معركة|جبل|ثلج|فضاء|مدرسة|مكتب|بحر|كهف|سطح|سوق|ملعب/i.test(combined);
  const backgroundInstruction = hasCustomSetting
    ? 'use the specific location/setting the user described, but keep it drawn in the same flat, simple, uncluttered line-art style (minimal background detail, flat colors, no photorealistic texture) so it still reads as the same cartoon world'
    : 'plain minimal off-white/dusty-grey-pink background (no clutter, no scenery) unless the user asked for a specific place';
  return `${styleText || 'simple line-drawing animation style'}, ${backgroundInstruction}. The stick figure character MUST have a clearly detailed, expressive face in every single scene: visible eyebrows showing emotion, eyes with pupils (not blank circles), a simple defined nose, and a mouth shape that matches the moment (shock, anger, fear, laughter, etc.) — think of the expressive style used by animators like @ricoanimations, never a blank/featureless head. Keep the exact same face design, proportions, and outfit for each character across every single scene of the video. CONTINUOUS STORY RULE: each scene must pick up directly from where the previous scene's action/emotion left off — the scenes are NOT independent moments, they are consecutive beats of ONE unfolding story or gag, like a comic strip; never reset the pose, location, or emotional state between scenes unless the story logically moves the character somewhere new.`;
}

app.post('/api/model3/generate-scenes', authMiddleware, async (req, res) => {
  const { idea, script, inputMode, imageCount, videoLanguage, styleSuffix, structuredScenes } = req.body;
  // ✅ NEW: خطة عميل جاهزة (Scene N / Visual Prompt / Narration) — بنستخدمها زي ما هي، مفيش
  // أي توليد بـ Groq خالص، وعدد المشاهد هو عدد بنود الخطة بالظبط مش imageCount الافتراضي
  if (Array.isArray(structuredScenes) && structuredScenes.length) {
    const total = structuredScenes.length;
    const scenes = structuredScenes.map((item, i) => {
      const index = i + 1;
      const type = index === 1 ? 'hook' : index === total ? 'ending' : 'body';
      const text = String(item.text || '').trim();
      const visualRaw = String(item.visual || item.prompt || text).trim();
      const keywords = visualRaw.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 6);
      return { index, type, text, keywords, visual: visualRaw.slice(0, 150), prompt: visualRaw, sceneDurationSec: item.sceneDurationSec || null };
    });
    return res.json({ scenes });
  }

  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });
  const modCheck3 = await checkContentSafety(idea || script);
  if (modCheck3.unsafe) {
    return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck3.category });
  }
  const isIdeaMode = inputMode === 'idea';
  const styleHint = styleSuffix || 'cinematic photography, dramatic lighting, photorealistic'; // ✅ ستيك مان بقى حصري لموديل 5 بس، شيلنا التطبيق هنا
  const lang = videoLanguage || 'en';
  const BATCH_SIZE = 5;
  const allScenes = [];
  const totalBatches = Math.ceil(imageCount / BATCH_SIZE);

  // استخلاص وصف الشخصيات والأماكن من الـ idea تلقائياً
  let characterLock = '';
  let outfitLock = '';
  let locationLock = '';
  if (isIdeaMode && idea) {
    try {
      const extractRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b', max_tokens: 300, temperature: 0.3, reasoning_effort: 'low',
          messages: [
            { role: 'system', content: 'Extract visual consistency info. Output ONLY JSON: {"characters":"...","outfit":"...","location":"..."}. English only. Be concise.' },
            { role: 'user', content: `Video idea: "${idea}"\n\nExtract:\n- characters: PERMANENT physical identity of main characters ONLY - face, body build, age, hair, skin tone, distinguishing features. Do NOT include clothing here. Max 20 words.\n- outfit: their DEFAULT starting outfit or clothing, max 15 words. This is a baseline only; the outfit MAY change later in the story if the narrative logically requires it (different day, event, role, or scene context), but the physical identity above must NEVER change.\n- location: main setting/environment max 15 words\nIf generic topic with no specific character/place, use ""\n\nJSON only:` }
          ]
        }),
      });
      const extractData = await extractRes.json();
      const extractRaw = (extractData.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      try { const ex = JSON.parse(extractRaw); characterLock = ex.characters || ''; outfitLock = ex.outfit || ''; locationLock = ex.location || ''; } catch {}
    } catch (e) { console.warn('[Model3] Extract failed:', e.message); }
  }

  async function groqBatch(systemPrompt, userPrompt) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', max_tokens: 3000, temperature: 0.7, reasoning_effort: 'low',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
      }),
    });
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/^[^[]*/, '').replace(/[^\]]*$/, '').trim();
    try { return JSON.parse(clean); } catch { const m = raw.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : []; }
  }

  try {
    for (let b = 0; b < totalBatches; b++) {
      const batchStart = b * BATCH_SIZE + 1;
      const batchEnd = Math.min((b + 1) * BATCH_SIZE, imageCount);
      const batchCount = batchEnd - batchStart + 1;
      let userPrompt, systemPrompt;

      if (isIdeaMode) {
        const charBlock = characterLock
          ? `\nCHARACTER IDENTITY (physical traits - include in EVERY prompt verbatim, NEVER changes): ${characterLock}`
            + (outfitLock ? `\nDEFAULT OUTFIT: ${outfitLock} (use this outfit unless the story's current scene logically calls for a different one - e.g. sleepwear at night, armor in battle, formal wear at an event; when it changes, state the new outfit clearly and keep it consistent across scenes in that same context)` : '')
          : '';
        const locBlock = locationLock ? `\nLOCATION (keep in EVERY prompt): ${locationLock}` : '';
        const typeRules = [];
        const isFirstBatch = batchStart === 1;
        const hookGuide = isFirstBatch ? `
HOOK WRITING RULES (scene 1 ONLY — this scene must grab attention in 3 seconds):
Use ONE of these proven techniques:
- SHOCKING FACT: "في 6 ساعات فقط، مات 50,000 إنسان" / "In just 6 hours, 50,000 people died"
- PARADOX: "الرجل الذي أنقذ الملايين لم يعرفه أحد" / "The man who saved millions was unknown to all"
- OPEN LOOP: "كيف استطاع رجل واحد أن يُسقط إمبراطورية؟" / "How did one man bring down an empire?"
- START FROM THE END: Begin at the climax moment, then go back
- DIRECT CHALLENGE: "ما ستسمعه الآن لن تصدقه" / "What you're about to hear will shock you"
NEVER start with "في هذا الفيديو" / "In this video we will" — instant viewer loss!
` : '';
        for (let i = batchStart; i <= batchEnd; i++) {
          if (i === 1) typeRules.push(`Scene ${i}: HOOK — powerful attention-grabbing opening (see HOOK WRITING RULES)`);
          else if (i === imageCount) typeRules.push(`Scene ${i}: ENDING — strong memorable conclusion`);
          else typeRules.push(`Scene ${i}: BODY — continues story logically from scene ${i - 1}`);
        }

        // ── تحديد هل الفيديو تاريخي ──
        const historicalKeywords = ['history','historical','ancient','empire','dynasty','war','battle','civilization','prophet','king','pharaoh','medieval','century','bc','ad','عصر','تاريخ','حضارة','إمبراطورية','معركة','نبي','خليفة','ملك','قرن','عهد','دولة','فتح','غزوة','صحابة','إسلام'];
        const isHistorical = historicalKeywords.some(kw => idea.toLowerCase().includes(kw));
        const historicalEraNote = isHistorical ? `\n⚠️ HISTORICAL VIDEO: ALL prompts MUST reflect the correct historical era. NO modern elements allowed:\n- NO: cars, electricity, phones, computers, modern buildings, modern clothing, modern weapons, skyscrapers, asphalt roads, neon signs, glasses (eyewear)\n- YES: period-accurate architecture, hand-crafted tools, torches/oil lamps, horses, camels, sailing ships, ancient weapons (swords/spears/bows), period clothing, mud-brick/stone structures\n- TIME PERIOD: Determine the era from the topic and stay consistent across ALL scenes` : '';

        systemPrompt = `You are an elite documentary scriptwriter and visual director specializing in sequential cinematic storytelling. Each scene MUST directly follow and continue from the previous scene — like chapters in a film, not isolated shots. Output ONLY a raw JSON array. "prompt" MUST be English only. No markdown, no extra text.`;

        userPrompt = `VIDEO TOPIC: "${idea}"
VISUAL STYLE: ${styleHint}${charBlock}${locBlock}
TOTAL SCENES: ${imageCount} | THIS BATCH: scenes ${batchStart}–${batchEnd}
${allScenes.length > 0 ? `STORY SO FAR — DO NOT REPEAT ANY OF THESE IDEAS:\n` + allScenes.map(s => `Scene ${s.index}: ${s.text}`).join('\n') + `\n\nCONTINUE the story DIRECTLY from scene ${batchStart - 1}. Each new scene must be a DIRECT continuation of the previous scene's action/event. Cover NEW story events only — never repeat.` : ''}
${historicalEraNote}

SCENE TYPE RULES:
${typeRules.join('\n')}
${hookGuide}
SEQUENTIAL STORY FLOW (CRITICAL):
- Scene N must DIRECTLY continue from scene N-1 (same storyline, next moment/event)
- Scenes flow like: Scene 1 → Scene 2 → ... → Scene ${imageCount} as one connected film
- Each scene shows the NEXT logical event in the story sequence
- Build drama progressively: setup → rising action → climax → resolution

"text" RULES (spoken narration in ${lang === 'ar' ? 'Arabic — فصيح وسلس، أسلوب وثائقي احترافي' : lang === 'ar_eg' ? 'Egyptian Arabic — اكتب بالعامية المصرية، كلمات زي: إيه ده دي عشان بقى أهو يعني' : lang === 'ar_gulf' ? 'Gulf Arabic — اكتب باللهجة الخليجية، كلمات زي: وش كيف ليش زين هالشي ترا' : lang}):
- What a documentary narrator SAYS OUT LOUD — full emotional sentences
- Each scene DIRECTLY continues the narration from the previous scene
- Historical content: strict CHRONOLOGICAL ORDER of events — no jumping in time
- Build emotional arc: curiosity → engagement → climax → resolution
- NEVER describe the image — TELL the story in sequence

"prompt" RULES (English only, 40-55 words):
- Cinematic AI image generation: subject + action + environment + lighting + camera angle + style
${characterLock ? `- MUST include character identity: "${characterLock}"` : ''}
${outfitLock ? `- Outfit: "${outfitLock}" by default, but change it if this scene's moment in the story logically requires a different outfit (keep the new outfit consistent across scenes in that same context)` : ''}
${locationLock ? `- MUST include location: "${locationLock}"` : ''}
- VISUALLY CONTINUES from the previous scene — show the NEXT moment/event
- Each prompt distinct but connected — shows story PROGRESSION
- Be specific, vivid, historically accurate if applicable${isHistorical ? '\n- STRICTLY no anachronistic modern elements' : ''}

Output ONLY JSON array (${batchCount} items):
[{"index":N,"prompt":"English cinematic image prompt 40-55 words","text":"Spoken narration in ${lang}"},...]`;

      } else {
        // Script mode: نقسم على مستوى الجمل
        const sentences = script.match(/[^.!?؟\n]+[.!?؟\n]*/g) || script.split('\n').filter(Boolean);
        const total = sentences.length;
        const s0 = Math.floor((batchStart - 1) / imageCount * total);
        const s1 = Math.floor(batchEnd / imageCount * total);
        const portion = sentences.slice(s0, s1).join(' ').trim() || script.slice(
          Math.floor((batchStart - 1) / imageCount * script.length),
          Math.floor(batchEnd / imageCount * script.length)
        );

        const historicalKeywordsScript = ['history','historical','ancient','empire','dynasty','war','battle','civilization','prophet','king','pharaoh','medieval','century','bc','ad','عصر','تاريخ','حضارة','إمبراطورية','معركة','نبي','خليفة','ملك','قرن','عهد','دولة','فتح'];
        const isHistoricalScript = historicalKeywordsScript.some(kw => (script||'').toLowerCase().includes(kw));
        const historicalNoteScript = isHistoricalScript ? `\n⚠️ HISTORICAL: ALL prompts must reflect the correct historical era. NO modern elements (cars, phones, electricity, modern buildings, modern clothes). Use period-accurate props, architecture, weapons, and clothing only.` : '';

        systemPrompt = `You are an expert video scene splitter specializing in sequential cinematic storytelling. Each scene's prompt must visually CONTINUE from the previous scene — connected like film chapters. Output ONLY a raw JSON array. "prompt" MUST be English only.`;

        userPrompt = `SCRIPT PORTION:
"${portion}"

VISUAL STYLE: ${styleHint}${historicalNoteScript}
SPLIT INTO EXACTLY ${batchCount} SCENES (numbered ${batchStart} to ${batchEnd})
${allScenes.length > 0 ? `\nPREVIOUS SCENES VISUAL CONTEXT (continue from these):\n` + allScenes.slice(-3).map(s => `Scene ${s.index}: ${s.prompt?.slice(0,60)}...`).join('\n') : ''}

"text": EXACT script text for this scene — preserve original language (${lang}), do NOT paraphrase
"prompt": English ONLY, 40-55 words — cinematic AI image generation prompt
  - subject + action + environment + lighting + camera angle + ${styleHint}
  - Each prompt CONTINUES visually from the previous scene (connected storyline)
  - Show PROGRESSION: each scene is the next moment in the sequence
  - Each scene visually distinct but part of the same continuous story${isHistoricalScript ? '\n  - Historically accurate — no anachronistic elements' : ''}

Output ONLY JSON array:
[{"index":N,"prompt":"English visual prompt 40-55 words","text":"exact script text"},...]`;
      }

      let batchScenes = [];
      try { batchScenes = await groqBatch(systemPrompt, userPrompt); } catch(e) { console.warn(`[Model3] Batch ${b+1} failed:`, e.message); }
      if (Array.isArray(batchScenes) && batchScenes.length > 0) allScenes.push(...batchScenes);
    }
    if (allScenes.length === 0) throw new Error('No scenes returned from AI');
    res.json({ scenes: allScenes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/model3/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, audioUrl, ratio, captions, music, videoLanguage, duration, videoStyle, styleSuffix, sceneDurations } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const m3User = await getUserById(req.user.userId);
  if ((m3User?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock Model 3.', show_upgrade: true });
  }
  // ✅ FIX: كان fallback الـ "عدد المشاهد القياسي" بيرجّع scenes.length نفسه لو المدة مش في
  // الجدول (30s/1min/2min/3min/5min بس)، فده كان بيخلي "المشاهد الزيادة" = صفر دايمًا مهما كان
  // العدد الحقيقي، والتكلفة الأساسية بترجع لرقم صغير ثابت (fallback 20) بدل ما تتحسب من عدد
  // المشاهد الفعلي. أي مدة برة الجدول دلوقتي بتتحسب بالسعر الحقيقي لكل مشهد إضافي
  // (MODEL3_EXTRA_SCENE_COST) على كل المشاهد، من غير أي سقف مدة — مفيش خصم "باقة" لمدة مش
  // معروفة، بس السعر لسه بيتحسب صح من عدد المشاهد الحقيقي
  const m3CreditCost = (MODEL3_CREDIT_COSTS[duration] || 0)
    + Math.max(0, scenes.length - (MODEL3_STANDARD_SCENE_COUNT[duration] || 0)) * MODEL3_EXTRA_SCENE_COST;
  const m3Balance = await getCreditsBalance(req.user.userId);
  if (m3Balance < m3CreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m3CreditCost} credits, you have ${m3Balance}.`, cost: m3CreditCost, remaining: m3Balance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
  }
  // ✅ NEW: الخصم فور بدء التوليد مش بعد الانتهاء
  const m3Charge = await chargeCredits(req.user.userId, m3CreditCost);
  if (!m3Charge.success) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m3CreditCost} credits, you have ${m3Charge.remaining}.`, cost: m3CreditCost, remaining: m3Charge.remaining });
  }
  const renderJobId = String(Date.now());
  activeRenderCount++;
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: m3CreditCost });
  (async () => {
    try {
      const { outputFile: videoPath, sceneImageUrls } = await renderModel3Video({ scenes, audioUrl, ratio: ratio || '16:9', jobId: renderJobId, duration: duration || '1min', captions: captions || false, transitions: false, music: music || false, videoLanguage: videoLanguage || 'en', videoStyle: videoStyle || 'cinematic', styleSuffix: styleSuffix || '', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null });
      setRenderJob(renderJobId, {
        status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(),
        editContext: { scenes, sceneImageUrls, audioUrl, ratio: ratio || '16:9', duration: duration || '1min', captions: captions || false, music: music || false, videoLanguage: videoLanguage || 'en', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null },
      });
    } catch (jobErr) {
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
      activeRenderCount--;
      scheduleRenderJobCleanup(renderJobId);
    }
  })();
});

app.post('/api/model3/payment-request', authMiddleware, async (req, res) => {
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
      body: JSON.stringify({ from: 'Erivion Model 3 <noreply@erivion.net>', to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com', subject: `🖼️ Model 3 Payment - ${planName} - ${userEmail}`, html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#f59e0b">🖼️ New Model 3 Payment</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#f59e0b;font-weight:700">${planName}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr></table><div style="margin-top:24px;display:flex;gap:12px"><a href="${backendUrl}/api/auth/model3-approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a><a href="${backendUrl}/api/auth/model3-reject?email=${encodeURIComponent(userEmail)}&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`, attachments: attachments.length > 0 ? attachments : undefined }),
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Model 4 Routes ─────────────────────────────────────────────────────────
app.post('/api/model4/generate-scenes', authMiddleware, async (req, res) => {
  const { idea, script, inputMode, sceneCount, videoLanguage, styleSuffix, videoStyle, structuredScenes } = req.body;
  // ✅ NEW: خطة عميل جاهزة — نفس المنطق المستخدم في موديل 3
  if (Array.isArray(structuredScenes) && structuredScenes.length) {
    const total = structuredScenes.length;

    // ✅ FIX: كل مشهد بيتبعت لـ Replicate في كول مستقل تمامًا (مفيش ذاكرة بين المشاهد ومفيش
    // صورة مرجعية إلا لو العميل رفع characterPhoto فعليًا). السكريبت المرفوع أحيانًا بيوصف
    // الشخصية كاملة في مشهد 1 بس، وبعدين بيستخدم إشارات غامضة زي "the same girl" / "still him"
    // في باقي المشاهد — الموديل مفيش عنده أي فكرة "نفس مين"، فبتطلع شخصية مختلفة كل مرة.
    // هنا بنستخرج وصف الشخصية/المكان مرة واحدة من كل نص السكريبت المرفوع، وبنلحقه في آخر
    // البرومبت الأصلي لكل مشهد — من غير ما نلمس أو نغيّر كلمة واحدة من نص العميل نفسه.
    let structuredCharacterLock = '';
    let structuredOutfitLock = '';
    let structuredLocationLock = '';
    try {
      const combinedText = structuredScenes
        .map((item, i) => `Scene ${i + 1}: ${String(item.visual || item.prompt || item.text || '').trim()}`)
        .join('\n')
        .slice(0, 4000);
      const extractRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b', max_tokens: 300, temperature: 0.3, reasoning_effort: 'low',
          messages: [
            { role: 'system', content: 'You read a scene-by-scene AI video script/plan. Some scenes describe the character/place fully; others refer to them vaguely (e.g. "the same girl", "still him", "same place as before") instead of repeating the description. Output ONLY JSON: {"characters":"...","outfit":"...","location":"..."}. English only. Be concise. Resolve vague references using the fullest description given anywhere in the script for that character/place.' },
            { role: 'user', content: `Script scenes:\n${combinedText}\n\nExtract:\n- characters: PERMANENT physical identity of the main character(s) - face, body build, age, hair, skin tone, distinguishing features. Max 20 words. Use "" if no specific recurring character is described anywhere.\n- outfit: their default/starting outfit, max 15 words. Use "" if it clearly varies a lot with no single default, or none is described.\n- location: main recurring setting/environment, max 15 words. Use "" if it changes per scene with no fixed default, or none is described.\n\nJSON only:` }
          ]
        }),
      });
      const extractData = await extractRes.json();
      const extractRaw = (extractData.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      const ex = JSON.parse(extractRaw);
      structuredCharacterLock = ex.characters || '';
      structuredOutfitLock = ex.outfit || '';
      structuredLocationLock = ex.location || '';
    } catch (e) {
      console.warn('[Model4/8] Structured-scenes consistency extraction failed, proceeding without it:', e.message);
    }

    const consistencySuffix = [
      structuredCharacterLock ? `Character identity (keep exactly consistent, never changes): ${structuredCharacterLock}.` : '',
      structuredOutfitLock ? `Default outfit: ${structuredOutfitLock}.` : '',
      structuredLocationLock ? `Location/setting (keep exactly consistent unless the scene itself clearly says otherwise): ${structuredLocationLock}.` : '',
    ].filter(Boolean).join(' ');

    const scenes = structuredScenes.map((item, i) => {
      const index = i + 1;
      const type = index === 1 ? 'hook' : index === total ? 'ending' : 'body';
      const text = String(item.text || '').trim();
      const visualRaw = String(item.visual || item.prompt || text).trim();
      const keywords = visualRaw.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2).slice(0, 6);
      // ✅ FIX: بنلحق وصف الاتساق بآخر البرومبت الأصلي بدل ما نسيبه زي ما هو — نص العميل
      // نفسه (visual/keywords المعروضين للعميل) فاضل زي ما هو تمامًا، الإضافة في "prompt" بس
      // (اللي فعليًا بيتبعت لموديل الفيديو).
      const finalPrompt = consistencySuffix ? `${visualRaw}. ${consistencySuffix}` : visualRaw;
      return { index, type, text, keywords, visual: visualRaw.slice(0, 150), prompt: finalPrompt, sceneDurationSec: item.sceneDurationSec || null };
    });
    return res.json({ scenes });
  }

  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });
  const modCheck4 = await checkContentSafety(idea || script);
  if (modCheck4.unsafe) {
    return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck4.category });
  }
  const lang = videoLanguage || 'en';
  const styleHint = styleSuffix || 'cinematic, photorealistic, dramatic lighting, no text overlays, no watermarks'; // ✅ ستيك مان بقى حصري لموديل 5 بس، شيلنا التطبيق هنا
  const BATCH_SIZE = 5;
  const allScenes = [];
  const totalBatches = Math.ceil(sceneCount / BATCH_SIZE);

  // استخلاص وصف الشخصيات والأماكن من الـ idea تلقائياً
  let characterLock = '';
  let outfitLock = '';
  let locationLock = '';
  const isIdeaMode = inputMode === 'idea';
  if (isIdeaMode && idea) {
    try {
      const extractRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b', max_tokens: 300, temperature: 0.3, reasoning_effort: 'low',
          messages: [
            { role: 'system', content: 'Extract visual consistency info. Output ONLY JSON: {"characters":"...","outfit":"...","location":"..."}. English only. Be concise.' },
            { role: 'user', content: `Video idea: "${idea}"\n\nExtract:\n- characters: PERMANENT physical identity of main characters ONLY - face, body build, age, hair, skin tone, distinguishing features. Do NOT include clothing here. Max 20 words.\n- outfit: their DEFAULT starting outfit or clothing, max 15 words. This is a baseline only; the outfit MAY change later in the story if the narrative logically requires it (different day, event, role, or scene context), but the physical identity above must NEVER change.\n- location: main setting/environment max 15 words\nIf generic topic with no specific character/place, use ""\n\nJSON only:` }
          ]
        }),
      });
      const extractData = await extractRes.json();
      const extractRaw = (extractData.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      try { const ex = JSON.parse(extractRaw); characterLock = ex.characters || ''; outfitLock = ex.outfit || ''; locationLock = ex.location || ''; } catch {}
    } catch (e) { console.warn('[Model4] Extract failed:', e.message); }
  }

  async function groqBatch(systemPrompt, userPrompt) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', max_tokens: 3000, temperature: 0.7, reasoning_effort: 'low',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
      }),
    });
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/^[^[]*/, '').replace(/[^\]]*$/, '').trim();
    try { return JSON.parse(clean); } catch { const m = raw.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : []; }
  }

  try {
    for (let b = 0; b < totalBatches; b++) {
      const batchStart = b * BATCH_SIZE + 1;
      const batchEnd = Math.min((b + 1) * BATCH_SIZE, sceneCount);
      const batchCount = batchEnd - batchStart + 1;
      let userPrompt, systemPrompt;

      if (isIdeaMode) {
        const charBlock = characterLock
          ? `\nCHARACTER IDENTITY (physical traits - include in EVERY prompt verbatim, NEVER changes): ${characterLock}`
            + (outfitLock ? `\nDEFAULT OUTFIT: ${outfitLock} (use this outfit unless the story's current scene logically calls for a different one - e.g. sleepwear at night, armor in battle, formal wear at an event; when it changes, state the new outfit clearly and keep it consistent across scenes in that same context)` : '')
          : '';
        const locBlock = locationLock ? `\nLOCATION (keep in EVERY prompt): ${locationLock}` : '';
        const typeRules = [];
        const isFirstBatch = batchStart === 1;
        const hookGuide = isFirstBatch ? `
HOOK WRITING RULES (scene 1 ONLY — this scene must grab attention in 3 seconds):
Use ONE of these proven techniques:
- SHOCKING FACT: "في 6 ساعات فقط، مات 50,000 إنسان" / "In just 6 hours, 50,000 people died"
- PARADOX: "الرجل الذي أنقذ الملايين لم يعرفه أحد" / "The man who saved millions was unknown to all"
- OPEN LOOP: "كيف استطاع رجل واحد أن يُسقط إمبراطورية؟" / "How did one man bring down an empire?"
- START FROM THE END: Begin at the climax moment, then go back
- DIRECT CHALLENGE: "ما ستسمعه الآن لن تصدقه" / "What you're about to hear will shock you"
NEVER start with "في هذا الفيديو" / "In this video we will" — instant viewer loss!
` : '';
        for (let i = batchStart; i <= batchEnd; i++) {
          if (i === 1) typeRules.push(`Scene ${i}: HOOK — powerful attention-grabbing opening (see HOOK WRITING RULES)`);
          else if (i === sceneCount) typeRules.push(`Scene ${i}: ENDING — strong memorable conclusion`);
          else typeRules.push(`Scene ${i}: BODY — continues story logically from scene ${i - 1}`);
        }

        // ── تحديد هل الفيديو تاريخي لموديل 4 ──
        const m4HistoricalKeywords = ['history','historical','ancient','empire','dynasty','war','battle','civilization','prophet','king','pharaoh','medieval','century','bc','ad','عصر','تاريخ','حضارة','إمبراطورية','معركة','نبي','خليفة','ملك','قرن','عهد','دولة','فتح','غزوة','صحابة','إسلام'];
        const m4IsHistorical = m4HistoricalKeywords.some(kw => idea.toLowerCase().includes(kw));
        const m4HistoricalEraNote = m4IsHistorical ? `\n⚠️ HISTORICAL VIDEO — STRICT ERA ACCURACY REQUIRED:\n- FORBIDDEN in prompts: cars, electricity, phones, computers, modern buildings, modern clothing, modern weapons, skyscrapers, asphalt roads, neon signs, glasses (eyewear), any modern technology\n- REQUIRED: period-accurate architecture, torches/oil lamps, horses, camels, sailing ships, ancient weapons (swords/spears/bows/shields), period clothing (robes/armor/turbans), mud-brick/stone structures, open-fire cooking\n- Determine the historical era from the topic and stay consistent across ALL scenes` : '';

        systemPrompt = `You are an elite documentary scriptwriter and cinematic video director specializing in sequential storytelling. Each scene MUST be a direct continuation of the previous scene — connected like frames in a film, not isolated clips. Output ONLY a raw JSON array. "prompt" MUST be English only. No markdown, no extra text.`;

        userPrompt = `VIDEO TOPIC: "${idea}"
VISUAL STYLE: ${styleHint}${charBlock}${locBlock}
TOTAL SCENES: ${sceneCount} | THIS BATCH: scenes ${batchStart}–${batchEnd}
${allScenes.length > 0 ? `STORY SO FAR — DO NOT REPEAT ANY OF THESE IDEAS:\n` + allScenes.map(s => `Scene ${s.index}: ${s.text}`).join('\n') + `\n\nCONTINUE the story DIRECTLY from scene ${batchStart - 1}. Next scene must begin where the last one left off. Cover NEW story events only.` : ''}
${m4HistoricalEraNote}

SCENE TYPE RULES:
${typeRules.join('\n')}
${hookGuide}
SEQUENTIAL CONTINUITY (CRITICAL):
- Scene N DIRECTLY continues from scene N-1 — same ongoing story, next moment
- Like a film: each scene is the next shot, not a new topic
- Build progressively: setup → rising action → climax → resolution

"text" RULES (spoken narration in ${lang === 'ar' ? 'Arabic — فصيح وسلس، أسلوب وثائقي احترافي' : lang === 'ar_eg' ? 'Egyptian Arabic — اكتب بالعامية المصرية، كلمات زي: إيه ده دي عشان بقى أهو يعني' : lang === 'ar_gulf' ? 'Gulf Arabic — اكتب باللهجة الخليجية، كلمات زي: وش كيف ليش زين هالشي ترا' : lang}):
- What a documentary narrator SAYS OUT LOUD — full emotional sentences
- Each scene DIRECTLY continues narration from the previous scene
- Historical content: strict CHRONOLOGICAL ORDER — no time jumps
- Build emotional arc: curiosity → engagement → climax → resolution
- NEVER describe visuals — TELL the story in sequence

"prompt" RULES (English only, 30-45 words — for AI VIDEO generation):
- Describe a MOVING SCENE continuing from the previous: subject + action/motion + environment + lighting + camera movement
- ${styleHint}
${characterLock ? `- MUST include character identity: "${characterLock}"` : ''}
${outfitLock ? `- Outfit: "${outfitLock}" by default, but change it if this scene's moment in the story logically requires a different outfit (keep the new outfit consistent across scenes in that same context)` : ''}
${locationLock ? `- MUST include location: "${locationLock}"` : ''}
- Each prompt shows the NEXT moment/event — visual story PROGRESSION
- Think: camera slowly pans, character walks forward, scene unfolds — dynamic
- No text, no watermarks, no UI elements${m4IsHistorical ? '\n- Historically accurate — ZERO modern elements' : ''}

Output ONLY JSON array (${batchCount} items):
[{"index":N,"prompt":"English cinematic VIDEO prompt 30-45 words","text":"Spoken narration in ${lang}"},...]`;

      } else {
        // Script mode
        const sentences = script.match(/[^.!?؟\n]+[.!?؟\n]*/g) || script.split('\n').filter(Boolean);
        const total = sentences.length;
        const s0 = Math.floor((batchStart - 1) / sceneCount * total);
        const s1 = Math.floor(batchEnd / sceneCount * total);
        const portion = sentences.slice(s0, s1).join(' ').trim() || script.slice(
          Math.floor((batchStart - 1) / sceneCount * script.length),
          Math.floor(batchEnd / sceneCount * script.length)
        );

        const m4HistoricalKwScript = ['history','historical','ancient','empire','dynasty','war','battle','civilization','prophet','king','pharaoh','medieval','century','bc','ad','عصر','تاريخ','حضارة','إمبراطورية','معركة','نبي','خليفة','ملك','قرن','عهد','دولة','فتح'];
        const m4IsHistScript = m4HistoricalKwScript.some(kw => (script||'').toLowerCase().includes(kw));
        const m4HistNoteScript = m4IsHistScript ? `\n⚠️ HISTORICAL: ALL prompts must reflect correct historical era. NO modern elements whatsoever. Use period-accurate clothing, weapons, architecture, lighting.` : '';

        systemPrompt = `You are an expert video scene splitter for AI video generation specializing in sequential cinematic storytelling. Each scene's prompt must CONTINUE from the previous — connected like film chapters. Output ONLY a raw JSON array. "prompt" MUST be English only.`;

        userPrompt = `SCRIPT PORTION:
"${portion}"

SPLIT INTO EXACTLY ${batchCount} SCENES (numbered ${batchStart} to ${batchEnd})
${allScenes.length > 0 ? `\nPREVIOUS SCENES (your prompts must continue visually from these):\n` + allScenes.slice(-3).map(s => `Scene ${s.index}: ${(s.prompt||'').slice(0,60)}...`).join('\n') : ''}${m4HistNoteScript}

"text": EXACT script text for this scene — preserve original language (${lang}), do NOT paraphrase
"prompt": English ONLY, 30-45 words — cinematic AI VIDEO generation prompt
  - Describe MOTION continuing from previous scene: subject + action + environment + lighting + camera
  - ${styleHint}
  - Each scene shows NEXT moment/event — visual PROGRESSION through the story
  - Connected but visually distinct${m4IsHistScript ? '\n  - Historically accurate — no anachronistic elements' : ''}

Output ONLY JSON array:
[{"index":N,"prompt":"English video prompt 30-45 words","text":"exact script text"},...]`;
      }

      let batchScenes = [];
      try { batchScenes = await groqBatch(systemPrompt, userPrompt); } catch (e) { console.warn(`[Model4] Batch ${b + 1} failed:`, e.message); }
      // ✅ FIX: Groq مش دايمًا بيلتزم بالعدد المطلوب في "Output ONLY JSON array (${batchCount} items)"
      // — لو طلبنا مشهدين ورجع مشهد واحد بس، مفيش أي تحقق قبل كده، فالفيديو الناتج كان بيطلع بعدد
      // مشاهد أقل من اللي المستخدم اختاره وحسب سعره فعليًا (مثلاً "2 مشهد" بيتحول لطلب واحد بس
      // لـ Replicate). دلوقتي: لو العدد الراجع ناقص، بنعيد المحاولة (مرتين كحد أقصى) ببرومبت أوضح
      // يفرض العد الصحيح، وكملاذ أخير (لو لسه ناقص) بنكمّل العدد بتكرار آخر مشهد راجع بفهرسة صحيحة
      // — عشان العدد النهائي يطابق طلب المستخدم بالظبط بدل ما فيديو أقصر يتسرب من غير أي تنبيه.
      let m4RetryCount = 0;
      while (Array.isArray(batchScenes) && batchScenes.length > 0 && batchScenes.length < batchCount && m4RetryCount < 2) {
        m4RetryCount++;
        console.warn(`[Model4] Batch ${b + 1} returned ${batchScenes.length}/${batchCount} scenes — retrying (${m4RetryCount}/2)`);
        try {
          const stricterUserPrompt = userPrompt + `\n\n⚠️ CRITICAL: your last answer had the WRONG number of scenes. You MUST output EXACTLY ${batchCount} scene objects in the array — not fewer, not more. Count them before answering.`;
          const retryScenes = await groqBatch(systemPrompt, stricterUserPrompt);
          if (Array.isArray(retryScenes) && retryScenes.length > batchScenes.length) batchScenes = retryScenes;
        } catch (e) { console.warn(`[Model4] Batch ${b + 1} retry ${m4RetryCount} failed:`, e.message); }
      }
      if (Array.isArray(batchScenes) && batchScenes.length > 0 && batchScenes.length < batchCount) {
        const lastScene = batchScenes[batchScenes.length - 1];
        while (batchScenes.length < batchCount) {
          batchScenes.push({ ...lastScene, index: batchStart + batchScenes.length });
        }
        console.warn(`[Model4] Batch ${b + 1} still short after retries — padded to ${batchCount} scenes`);
      }
      if (Array.isArray(batchScenes) && batchScenes.length > 0) allScenes.push(...batchScenes);
    }
    if (allScenes.length === 0) throw new Error('No scenes returned from AI');
    res.json({ scenes: allScenes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/model4/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, audioUrl, ratio, captions, music, videoLanguage, duration, inputMode, videoStyle, styleSuffix, sceneDurations } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const m4User = await getUserById(req.user.userId);
  if ((m4User?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock Model 4.', show_upgrade: true });
  }
  // ✅ FIX (تصحيح تسعير من العميل): مفيش تفرقة "مشهد جوه باقة" و"مشهد زيادة" تاني — كل
  // مشهد (أيًا كان عدد المشاهد أو المدة) بسعر ثابت MODEL4_SCENE_COST، فمفيش رقم صغير ثابت
  // بيرجع لأي مدة (زي الباج القديم اللي كان بيرجّع "100" لفيديو 120 مشهد)
  const m4CreditCost = scenes.length * MODEL4_SCENE_COST;
  const m4Balance = await getCreditsBalance(req.user.userId);
  if (m4Balance < m4CreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m4CreditCost} credits, you have ${m4Balance}.`, cost: m4CreditCost, remaining: m4Balance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
  }
  // ✅ NEW: الخصم فور بدء التوليد مش بعد الانتهاء
  const m4Charge = await chargeCredits(req.user.userId, m4CreditCost);
  if (!m4Charge.success) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m4CreditCost} credits, you have ${m4Charge.remaining}.`, cost: m4CreditCost, remaining: m4Charge.remaining });
  }
  const renderJobId = String(Date.now());
  activeRenderCount++;
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: m4CreditCost });
  (async () => {
    try {
      let finalAudioUrl = audioUrl;
      let finalSceneDurations = Array.isArray(sceneDurations) ? sceneDurations : null;
      // ✅ FIX: لو مفيش صوت متبعت من الفرونت إند، نولّد صوت لكل مشهد لوحده ونقيس مدته الحقيقية
      // بدل التخمين القديم اللي كان مبني على افتراض 7 ثواني ثابتة لكل مشهد (متشال دلوقتي)
      if (!audioUrl && scenes?.length > 0 && !finalSceneDurations) {
        try {
          const hasText = scenes.some(s => (s.text || '').trim());
          if (hasText) {
            const voiceKey = (videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_wise';
            const voiceResult = await generateVoiceoverPerScene(scenes, voiceKey, 'education', 0, videoLanguage || 'en');
            if (voiceResult) {
              finalAudioUrl = '/outputs/' + voiceResult.filename;
              finalSceneDurations = voiceResult.sceneDurations;
              console.log(`[Model4] Per-scene voiceover generated: ${voiceResult.filename}`);
            }
          }
        } catch (voiceErr) {
          console.warn('[Model4] Voiceover failed, continuing without audio:', voiceErr.message);
        }
      }
      const { outputFile: videoPath, sceneClipUrls } = await renderModel4Video({ scenes, audioUrl: finalAudioUrl, ratio: ratio || '16:9', jobId: renderJobId, captions: captions || false, music: music || false, videoLanguage: videoLanguage || 'en', videoStyle: videoStyle || 'cinematic', styleSuffix: styleSuffix || '', sceneDurations: finalSceneDurations });
      // ✅ NEW: بنحفظ كل حاجة محتاجينها لو العميل طلب بعدين تعديل مشهد واحد بس — بدل
      // ما يضطر يعيد توليد الفيديو كله من الصفر
      setRenderJob(renderJobId, {
        status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(),
        editContext: { scenes, sceneClipUrls, audioUrl: finalAudioUrl, ratio: ratio || '16:9', captions: captions || false, music: music || false, videoLanguage: videoLanguage || 'en', videoStyle: videoStyle || 'cinematic', styleSuffix: styleSuffix || '', sceneDurations: finalSceneDurations },
      });
    } catch (jobErr) {
      console.error('[Model4 Render] Failed:', jobErr.message);
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
      activeRenderCount--;
      scheduleRenderJobCleanup(renderJobId);
    }
  })();
});

app.post('/api/model4/payment-request', authMiddleware, async (req, res) => {
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
      attachments.push({ filename: `m4_payment_${userEmail}_${Date.now()}.${ext}`, content: base64Data });
    }
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Erivion Model 4 <noreply@erivion.net>', to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com', subject: `🎬 Model 4 Payment - ${planName} - ${userEmail}`, html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#a855f7">🎬 New Model 4 Payment</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Account</td><td style="color:#fff">${user.email}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#a855f7;font-weight:700">${planName}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr></table><div style="margin-top:24px;display:flex;gap:12px"><a href="${backendUrl}/api/auth/model4-approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a><a href="${backendUrl}/api/auth/model4-reject?email=${encodeURIComponent(userEmail)}&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`, attachments: attachments.length > 0 ? attachments : undefined }),
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/model4/usage', authMiddleware, async (req, res) => {
  try {
    // ✅ نظام الكريديت الموحد: الكل عنده access، القيد الوحيد هو رصيد الكريديت
    const balance = await getCreditsBalance(req.user.userId);
    res.json({ access: true, credits_balance: balance, costs: MODEL4_CREDIT_COSTS });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── Model 5 (Cinematic) Routes ────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: موديل 8 — سيناريو السيناريو الذكي بيتكتب بنفس /api/model4/generate-scenes
//  (نفس الجودة، مفيش داعي نكرره) — هنا بس الرندر الفعلي بموديل prunaai/p-video الأرخص
// ══════════════════════════════════════════════════════════════════════════
app.post('/api/model8/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, ratio, sceneDurationSec, audioMode, voiceKey, videoLanguage, captions, characterPhoto, useMyVoice, jobId } = req.body;
  const renderJobId = String(jobId || Date.now());
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const m8User = await getUserById(req.user.userId);
  // ✅ NEW: فويس كلون — بنجيب رابط عينة الصوت المحفوظة من السيرفر نفسه (مش من كلام العميل)
  // عشان محدش يقدر يبعت رابط صوت حد تاني كـ voiceCloneSampleUrl مباشرة
  let m8VoiceCloneSampleUrl = null;
  if (useMyVoice && audioMode === 'voiceover') {
    const savedVoice = await getClonedVoiceForUser(req.user.userId).catch(() => null);
    if (!savedVoice) return res.status(400).json({ error: 'no_saved_voice', message: 'No saved voice found — save one first via "My Voice".' });
    m8VoiceCloneSampleUrl = savedVoice.sample_url;
  }
  // ✅ فُتح لكل المستخدمين — نفس شرط موديل 4 بالظبط: لازم يكون شحن كريديت حقيقي مرة على الأقل
  // (plan!='free') قبل ما يقدر يستخدمه، زي باقي الموديلات المدفوعة كلها
  if ((m8User?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Top up credits to unlock Model 8 (Budget Cinematic).', show_upgrade: true });
  }
  const perSceneSec = Math.min(20, Math.max(1, Math.round(sceneDurationSec || 5)));
  // ✅ FIX: كان بيفرض نفس المدة على كل المشاهد إجباريًا حتى لو خطة العميل حددت مدة مختلفة
  // لكل مشهد (مثلاً مشهد 12 ثانية جنب مشهد 20 ثانية) — دلوقتي كل مشهد بياخد مدته الخاصة
  // بيه لو محددة (من parseStructuredScript)، وإلا بيرجع للمدة الموحدة الافتراضية
  const scenesWithDuration = scenes.map(s => ({
    ...s,
    sceneDurationSec: s.sceneDurationSec ? Math.min(20, Math.max(1, Math.round(s.sceneDurationSec))) : perSceneSec,
  }));
  const totalSeconds = scenesWithDuration.reduce((sum, s) => sum + s.sceneDurationSec, 0);
  const m8Rate = audioMode === 'voiceover' ? MODEL8_RATE_VOICEOVER : audioMode === 'cinematic' ? MODEL8_RATE_CINEMATIC : MODEL8_RATE_NONE;
  let m8CreditCost = totalSeconds * m8Rate;

  const m8Balance = await getCreditsBalance(req.user.userId);
  if (m8Balance < m8CreditCost) {
    return res.status(402).json({ error: 'quota_exceeded', message: `This video needs ${m8CreditCost} credits, you have ${m8Balance}.`, cost: m8CreditCost, remaining: m8Balance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
  }
  const m8Charge = await chargeCredits(req.user.userId, m8CreditCost);
  if (!m8Charge.success) {
    return res.status(402).json({ error: 'quota_exceeded', message: `This video needs ${m8CreditCost} credits, you have ${m8Charge.remaining}.`, cost: m8CreditCost, remaining: m8Charge.remaining });
  }

  activeRenderCount++;
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.json({ jobId: renderJobId, status: 'processing', creditCost: m8CreditCost });

  (async () => {
    try {
      const { outputFile: videoPath, sceneClipUrls, sceneDurations: actualDurations } = await renderModel8Video({
        scenes: scenesWithDuration, ratio: ratio || '16:9', audioMode: audioMode || 'none',
        voiceKey: voiceKey || 'male_wise', videoLanguage: videoLanguage || 'en', captions: captions !== false,
        characterPhoto: characterPhoto || null,
        voiceCloneSampleUrl: m8VoiceCloneSampleUrl,
        jobId: renderJobId,
      });
      setRenderJob(renderJobId, {
        status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: m8CreditCost,
        editContext: { scenes: scenesWithDuration, sceneClipUrls, ratio: ratio || '16:9', sceneDurationSec: perSceneSec, audioMode: audioMode || 'none', voiceKey: voiceKey || 'male_wise', videoLanguage: videoLanguage || 'en', captions: captions !== false, sceneDurations: actualDurations },
      });
    } catch (jobErr) {
      console.error('[Model8 Render] Failed:', jobErr.message);
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
      activeRenderCount--;
      scheduleRenderJobCleanup(renderJobId);
    }
  })();
});

app.post('/api/model8/edit-scene', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, sceneClipUrls, sceneIndex, newDescription, ratio, sceneDurationSec, audioMode, voiceKey, videoLanguage, captions, jobId } = req.body;
  const renderJobId = String(jobId || Date.now());
  if (!Array.isArray(scenes) || !scenes.length) return res.status(400).json({ error: 'scenes required' });
  const idx = parseInt(sceneIndex, 10);
  if (!Number.isInteger(idx) || idx < 0 || idx >= scenes.length) return res.status(400).json({ error: 'Invalid sceneIndex' });
  if (!newDescription?.trim()) return res.status(400).json({ error: 'newDescription required' });
  try {
    // ✅ فُتح لكل المستخدمين — نفس شرط موديل 4
    const m8EditUser = await getUserById(req.user.userId);
    if ((m8EditUser?.plan || 'free') === 'free') {
      return res.status(403).json({ error: 'no_access', message: 'Top up credits to unlock Model 8 (Budget Cinematic).', show_upgrade: true });
    }
    const balance = await getCreditsBalance(req.user.userId);
    if (balance < MODEL8_EDIT_SCENE_COST) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${MODEL8_EDIT_SCENE_COST} credits, you have ${balance}.`, cost: MODEL8_EDIT_SCENE_COST, remaining: balance });
    }
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
    }
    const modCheckEdit = await checkContentSafety(newDescription);
    if (modCheckEdit.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckEdit.category });
    }
    const editCharge = await chargeCredits(req.user.userId, MODEL8_EDIT_SCENE_COST);
    if (!editCharge.success) {
      return res.status(403).json({ error: 'quota_exceeded', message: `This edit needs ${MODEL8_EDIT_SCENE_COST} credits, you have ${editCharge.remaining}.`, cost: MODEL8_EDIT_SCENE_COST, remaining: editCharge.remaining });
    }
    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: MODEL8_EDIT_SCENE_COST });
    (async () => {
      try {
        const updatedScenes = scenes.map((scene, i) => i === idx
          ? { ...scene, text: newDescription.trim(), prompt: newDescription.trim(), existingClipUrl: undefined }
          : { ...scene, existingClipUrl: sceneClipUrls?.[i] || scene.existingClipUrl });
        const { outputFile: videoPath, sceneClipUrls: newSceneClipUrls, sceneDurations: actualDurations } = await renderModel8Video({
          scenes: updatedScenes, ratio: ratio || '16:9', audioMode: audioMode || 'none',
          voiceKey: voiceKey || 'male_wise', videoLanguage: videoLanguage || 'en', captions: captions !== false,
          jobId: renderJobId,
        });
        setRenderJob(renderJobId, {
          status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), creditCost: MODEL8_EDIT_SCENE_COST,
          editContext: { scenes: updatedScenes, sceneClipUrls: newSceneClipUrls, ratio: ratio || '16:9', sceneDurationSec, audioMode: audioMode || 'none', voiceKey: voiceKey || 'male_wise', videoLanguage: videoLanguage || 'en', captions: captions !== false, sceneDurations: actualDurations },
        });
      } catch (jobErr) {
        console.error('[Model8 EditScene] Failed:', jobErr.message);
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Scene edit failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        scheduleRenderJobCleanup(renderJobId);
      }
    })();
  } catch (err) {
    console.error('[Model8 EditScene] Error:', err.message);
    res.status(500).json({ error: err.message || 'Scene edit failed.' });
  }
});

app.post('/api/model5/generate-scenes', authMiddleware, async (req, res) => {
  // ✅ موديل 5 بقى متاح لكل المستخدمين (اتشال قفل الصيانة/admin-only بعد ما اتصلحت مشاكل
  // الصورة المرجعية والدمج المتعدد)
  const model5User = await getUserById(req.user.userId);
  if (!model5User) return res.status(401).json({ error: 'User not found' });

  const { idea, characters, duration, videoStyle, styleSuffix, promptMode, rawPrompt, stickmanStyle, structuredScenes } = req.body;

  // ✅ NEW: خطة عميل جاهزة (Scene N / Visual Prompt / Narration) — بتشتغل مع أوضاع موديل 5
  // العادية بس (مش map-video)، وعدد المشاهد هو عدد بنود الخطة بالظبط
  if (Array.isArray(structuredScenes) && structuredScenes.length) {
    const total = structuredScenes.length;
    const allChars5 = characters || [];
    const charsWithPhotos5 = allChars5.filter(c => c.photo).map(c => c.photo).filter(Boolean);
    const scenes = structuredScenes.map((item, i) => {
      const index = i + 1;
      const text = String(item.text || '').trim() || `Scene ${index}`;
      const visualRaw = String(item.visual || item.prompt || text).trim();
      const scene = { index, prompt: visualRaw, text: text.slice(0, 60) };
      if (charsWithPhotos5.length > 0) scene.characterPhotos = charsWithPhotos5;
      return scene;
    });
    return res.json({ scenes });
  }

  // ── وضع "Image to Video" الجديد: العميل بيرفع صورة بس (بدون برومبت خالص)، والصورة
  // بتتقفل كـ first frame وتتحرك مباشرة على Seedance 2.0 Fast — نفس تكلفة prompt-to-video
  // بالظبط لأن التكلفة أصلاً بتتحسب من duration + عدد الصور (getModel5CreditCost) مش من الوضع ──
  if (promptMode === 'image') {
    const allChars = characters || [];
    const photo = allChars.find(c => c.photo)?.photo;
    if (!photo) return res.status(400).json({ error: 'photo required for image-to-video mode' });
    if (!['5s', '10s', '15s'].includes(duration)) return res.status(400).json({ error: 'duration must be 5s, 10s, or 15s for image-to-video' });
    // ✅ NEW: motionPrompt اختياري — لو العميل كتب وصف للحركة اللي عايزها نستخدمه، ولو سابه
    // فاضي نرجع للوصف الافتراضي (حركة طبيعية بسيطة)
    const motionPrompt = (rawPrompt || '').trim();
    if (motionPrompt) {
      const modCheckImg = await checkContentSafety(motionPrompt);
      if (modCheckImg.unsafe) {
        return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheckImg.category });
      }
    }
    const scene = {
      index: 1,
      prompt: motionPrompt
        ? `The exact photo provided is the first frame — its composition, subject, and background stay unchanged in the opening instant, then this happens: ${motionPrompt}. No text overlays, no watermarks. Include 1-2 specific, concrete sound effects that genuinely match this exact scene.`
        : 'The subject and scene shown in the photo come naturally to life — subtle, realistic motion only (breathing, small natural movement, wind, shifting light), smooth gentle cinematic camera movement, nothing added or changed that is not already in the photo. No text overlays, no watermarks. Include 1-2 specific, concrete sound effects that genuinely match this exact scene.',
      text: 'Image to video',
      characterPhotos: [photo],
      directAnimate: true, // ✅ NEW: يقول لـ renderModel5Video ميعملش FLUX Kontext تركيب — يحرك الصورة الأصلية زي ما هي
    };
    return res.json({ scenes: [scene] });
  }

  // ── وضع "Prompt to Video" الجديد: العميل بيكتب البرومبت بالظبط، مفيش Groq بيكتب
  // مشاهد من فكرة — بس تحسين بسيط للصياغة (grammar/clarity) من غير ما يتغير المعنى ──
  if (promptMode === 'prompt') {
    if (!rawPrompt?.trim()) return res.status(400).json({ error: 'rawPrompt required for prompt-to-video mode' });
    if (!['5s', '10s', '15s'].includes(duration)) return res.status(400).json({ error: 'duration must be 5s, 10s, or 15s for prompt-to-video' });
    const modCheck5p = await checkContentSafety(rawPrompt);
    if (modCheck5p.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck5p.category });
    }

    const allChars = characters || [];
    const charsWithPhotos = allChars.filter(c => c.photo);
    const styleInstruction = applyStickmanStyleRule(styleSuffix || '', rawPrompt);
    const audioRule = 'No background music, no music of any kind. Include 1-3 specific, concrete sound effects that genuinely match this exact scene (never a generic phrase like "ambient sound").';

    let finalPrompt = `${rawPrompt.trim()}${styleInstruction ? `, ${styleInstruction}` : ''}. ${audioRule}`;
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b', max_tokens: 200, temperature: 0.3, reasoning_effort: 'low',
          messages: [
            { role: 'system', content: 'You lightly polish a user-written AI video prompt for grammar and clarity ONLY. Never add new visual elements, characters, or ideas they did not mention. Never remove anything they specified. Keep it in English. Output ONLY the polished prompt text, nothing else.' },
            { role: 'user', content: finalPrompt },
          ],
        }),
      });
      const data = await r.json();
      const polished = data.choices?.[0]?.message?.content?.trim();
      if (polished) finalPrompt = polished;
    } catch (e) { console.warn('[Model5 PromptToVideo] Groq polish failed, using raw prompt:', e.message); }

    const scene = { index: 1, prompt: finalPrompt, text: rawPrompt.trim().slice(0, 40) };
    if (charsWithPhotos.length > 0) scene.characterPhotos = charsWithPhotos.map(c => c.photo).filter(Boolean);
    return res.json({ scenes: [scene] });
  }

  if (!idea) return res.status(400).json({ error: 'idea required' });
  const modCheck5 = await checkContentSafety(idea);
  if (modCheck5.unsafe) {
    return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck5.category });
  }
  const sceneCount = duration === '1min' ? 12 : duration === '30s' ? 6 : 1;

  // Separate characters with photos vs prompt-only
  const allChars = characters || [];
  const characterDescs = allChars.filter(c => c.prompt?.trim());
  const charsWithPhotos = allChars.filter(c => c.photo);

  const characterBlock = characterDescs.length > 0
    ? characterDescs.map((c, i) => `CHARACTER_${i + 1}: ${c.prompt.trim()}`).join('\n')
    : '';

  // الـ style suffix الكامل
  const styleInstruction = applyStickmanStyleRule(styleSuffix || 'cinematic photography, dramatic lighting, film grain, shallow depth of field, professional color grading', idea);

  async function groqBatch(systemPrompt, userPrompt) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b', max_tokens: 3000, temperature: 0.7, reasoning_effort: 'low',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]
      }),
    });
    const data = await r.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const clean = raw.replace(/^[^[]*/, '').replace(/[^\]]*$/, '').trim();
    try { return JSON.parse(clean); } catch { const m = raw.match(/\[[\s\S]*\]/); return m ? JSON.parse(m[0]) : []; }
  }

  try {
    const systemPrompt = `You are a world-class cinematic AI video director inspired by the HiggsField YouTube channel style — immersive, atmospheric, visually stunning shorts with consistent characters and locations. You write Seedance AI video generation prompts that produce Hollywood-quality footage. Output ONLY a raw JSON array. All prompts MUST be in English only. No markdown, no extra text.`;

    const charSection = characterBlock ? `\n\nCHARACTERS — COPY EXACT DESCRIPTION INTO EVERY SCENE PROMPT:
${characterBlock}
⚠️ CRITICAL: Every single prompt MUST include the character's PHYSICAL IDENTITY (face, body, age, hair, skin) exactly as described above — this NEVER changes, especially since a reference photo is used for visual consistency. If the description mentions specific clothing, treat that as the DEFAULT outfit only — you may change the outfit in later scenes if the story's progression logically calls for it (different moment, event, or setting), but keep the outfit consistent across scenes that share the same context, and never touch the physical identity.` : '';

    const userPrompt = `CINEMATIC VIDEO: "${idea}"
STYLE: ${styleInstruction}${charSection}

Generate EXACTLY ${sceneCount} scenes. Each scene = 5 seconds of AI video, NO voiceover, pure visual storytelling.

PROMPT RULES (English only, 45-65 words per prompt):
1. STRUCTURE: [Character physical identity + current outfit] + [specific action/motion] + [environment/setting] + [camera movement] + [lighting] + [style]
2. MOTION: Always describe movement — "slowly walks", "camera pulls back", "wind moves through hair", "turns and looks at camera"
3. CINEMATIC: Use film techniques — "rack focus", "slow motion", "golden hour light", "volumetric fog", "anamorphic lens flare"
4. CONSISTENCY: ${characterDescs.length > 0 ? 'Copy the EXACT physical identity from above into EVERY prompt without shortening; keep the outfit consistent unless the story logically calls for a change' : 'Keep the same location/environment across all scenes'}
5. PROGRESSION: Each scene advances the story visually — show change, emotion, action building up
6. NO TEXT in frame, no watermarks, no UI elements
7. AUDIO: No background music, no music of any kind in the generated clip. Instead, explicitly describe 1-3 SPECIFIC, concrete sound effects that genuinely match what is happening in THIS exact scene (e.g. "footsteps on gravel", "wind rustling through robes", "distant camel bells", "crackling torch fire", "soft cloth movement", "muffled crowd murmur") — never a generic phrase like "ambient sound". Background music will be added separately in post-production for consistency across all scenes.

SCENE STRUCTURE:
- Scene 1: Establishing shot — introduce character/location dramatically
${sceneCount > 3 ? `- Scenes 2-${sceneCount - 1}: Action/story unfolds — build tension/emotion progressively` : '- Scenes 2+: Story unfolds with visual progression'}
- Scene ${sceneCount}: Powerful closing shot — memorable final image

"text": SHORT scene title (3-6 words, English), describes what happens visually

Output ONLY JSON array (${sceneCount} items):
[{"index":N,"prompt":"[Full cinematic Seedance prompt 45-65 words with character+action+setting+camera+lighting+style]","text":"Short scene title"},...]`;

    let scenes = await groqBatch(systemPrompt, userPrompt);
    if (!scenes || scenes.length === 0) throw new Error('No scenes generated');
    scenes = scenes.slice(0, sceneCount);

    // ── Attach ALL character photos to EVERY scene — reference images generated in seedanceService ──
    // ✅ FIX: كانت بتتحط صورة واحدة بس بالتناوب لكل مشهد (شخصية مختلفة في كل مشهد)، وده غلط —
    // المطلوب إن كل الشخصيات المرفوعة (لحد 5) تظهر مع بعض مربوطين في نفس المشهد الواحد.
    let stickmanGenerated = false;
    if (charsWithPhotos.length > 0) {
      const allPhotos = charsWithPhotos.map(c => c.photo).filter(Boolean);
      scenes = scenes.map((scene) => ({ ...scene, characterPhotos: allPhotos }));
      console.log(`[Model5] Attached all ${allPhotos.length} character photo(s) together to ${scenes.length} scenes`);
    } else if (/stick\s*-?\s*man|stick\s*-?\s*figure/i.test(`${idea} ${styleSuffix || ''}`)) {
      // ✅ NEW: "Idea to Video" فقط + مفيش صورة مرفوعة + المطلوب stickman → نولّد صورة مرجعية
      // للشخصية بـ Recraft V3 (ستايل خطوط واضح) بدل ما نسيب Seedance يفسّر "stickman" بنفسه
      // (كان بيطلع وش شبه واقعي 3D بدل ستيك مان حقيقي مسطح). الصورة دي بعدين بتتركّب في كل
      // مشهد بنفس آلية "صورة الشخصية" العادية (FLUX Kontext) عشان القصة تفضل متصلة بصريًا.
      try {
        console.log('[Model5] Generating stickman reference character via Recraft V3...');
        const stickmanImg = await generateStickmanCharacterImage(characterBlock, stickmanStyle === '2d' ? '2d' : 'bw');
        scenes = scenes.map((scene) => ({ ...scene, characterPhotos: [stickmanImg], stickmanGenerated: true }));
        stickmanGenerated = true;
        console.log('[Model5] ✅ Stickman reference character generated successfully');
      } catch (e) {
        console.warn('[Model5] Stickman reference generation failed, falling back to text-only Seedance interpretation:', e.message);
      }
    }

    res.json({ scenes, stickmanGenerated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/model5/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, ratio, duration, characterPhotos, music } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const m5User = await getUserById(req.user.userId);
  if (!m5User) return res.status(401).json({ error: 'User not found' });
  // ✅ موديل 5 بقى متاح لكل المستخدمين (اتشال قفل الصيانة/admin-only)
  if ((m5User?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock Model 5.', show_upgrade: true });
  }

  // ── Attach ALL character photos together to EVERY scene for reference image generation ──
  // ✅ FIX: كانت بتتحط صورة واحدة بس بالتناوب (photoIndex = i % photos.length) — شخصية
  // مختلفة في كل مشهد. المطلوب إن كل الشخصيات المرفوعة (لحد 5) يظهروا مع بعض مربوطين
  // في نفس المشهد الواحد حتى لو العميل رفع 5 صور مختلفة. seedanceService.js دلوقتي بيتعامل
  // مع array من الصور ويحطهم مع بعض في نفس المشهد لو كانوا أكتر من واحدة.
  const photos = Array.isArray(characterPhotos) ? characterPhotos.filter(Boolean) : [];
  const scenesWithPhotos = scenes.map((scene) => {
    if (photos.length === 0) return scene;
    return { ...scene, characterPhotos: photos };
  });
  if (photos.length > 0) {
    console.log(`[Model5] All ${photos.length} character photo(s) linked together in ${scenesWithPhotos.length} scenes`);
  }

  // ✅ FIX (تصحيح تسعير من العميل): مفيش جدول باقات + سرشارج زيادة تاني — التسعير بالثانية
  // الحقيقية للفيديو (زي موديل 8): وضع الكليب الواحد (image/prompt-to-video) فيه مشهد واحد
  // بس بطول 5/10/15 ثانية حسب duration، ووضع المشاهد المتعددة (idea) كل مشهد فيه 5 ثواني
  // بالظبط. وأي سرشارج زيادة (صور إضافية بعد الأولى، أو ستيك مان) بيتضاعف مع العدد الحقيقي
  // للمشاهد — مش بيتضاف مرة واحدة بس على الفيديو كله (ده كان الباج: فيديو 10 مشاهد بصورة كان
  // بيتحسب 605 بدل 650)
  const hasStickmanImage = scenes.some(s => s.stickmanGenerated);
  const m5TotalSeconds = scenes.length <= 1 ? (MODEL5_DURATION_SECONDS[duration] || 5) : scenes.length * 5;
  const m5PerSecondRate = photos.length > 0 ? MODEL5_CREDIT_PER_SECOND_WITH_PHOTO : MODEL5_CREDIT_PER_SECOND;
  const m5PerSceneExtraPhotos = photos.length > 1 ? MODEL5_EXTRA_CREDITS_PER_PHOTO * (photos.length - 1) : 0;
  const m5PerSceneStickman = hasStickmanImage ? MODEL5_STICKMAN_SURCHARGE_PER_SCENE : 0;
  const m5CreditCost = m5TotalSeconds * m5PerSecondRate + scenes.length * (m5PerSceneExtraPhotos + m5PerSceneStickman);
  const m5Balance = await getCreditsBalance(req.user.userId);
  if (m5Balance < m5CreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m5CreditCost} credits, you have ${m5Balance}.`, cost: m5CreditCost, remaining: m5Balance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
  }
  // ✅ NEW: الخصم فور بدء التوليد مش بعد الانتهاء
  const m5Charge = await chargeCredits(req.user.userId, m5CreditCost);
  if (!m5Charge.success) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m5CreditCost} credits, you have ${m5Charge.remaining}.`, cost: m5CreditCost, remaining: m5Charge.remaining });
  }

  const renderJobId = String(Date.now());
  activeRenderCount++;
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: m5CreditCost });
  (async () => {
    try {
      const { outputFile: videoPath, sceneClipUrls } = await renderModel5Video({ scenes: scenesWithPhotos, ratio: ratio || '9:16', jobId: renderJobId, duration: duration || '15s', music: music !== false });
      setRenderJob(renderJobId, {
        status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(),
        editContext: { scenes: scenesWithPhotos, sceneClipUrls, ratio: ratio || '9:16', duration: duration || '15s', music: music !== false },
      });
    } catch (jobErr) {
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
      activeRenderCount--;
      scheduleRenderJobCleanup(renderJobId);
    }
  })();
});

// ✅ NEW: Model 5 — MAP VIDEO (فيديو خريطة تاريخي/جيوسياسي/اقتصادي) — كليب واحد 15 ثانية
// بـ Seedance 2.0 Fast، كل حاجة (الخريطة، المونتاج، الكابشن، الفويس أوفر) بتتعمل جوه
// الموديل نفسه من برومبت هندسي واحد — مفيش scenes، مفيش صور شخصيات، مفيش معالجة إضافية.
app.post('/api/model5/map-video', authMiddleware, renderLimiter, async (req, res) => {
  const { topic, ratio, openingCaption, closingCaption, narrationScript } = req.body;
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'topic is required' });

  const mapUser = await getUserById(req.user.userId);
  if (!mapUser) return res.status(401).json({ error: 'User not found' });
  if ((mapUser?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock Model 5.', show_upgrade: true });
  }

  // ✅ فحص أمان المحتوى — نفس الفحص المستخدم في كل مكان تاني بيستقبل نص من العميل
  const modCheck = await checkContentSafety(String(topic).slice(0, 1500) + ' ' + String(narrationScript || '').slice(0, 500));
  if (modCheck.unsafe) {
    return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck.category });
  }

  // ✅ نفس معادلة تسعير موديل 5 العادي عند 15 ثانية وبدون صور (0 photos) — نفس التكلفة الحقيقية بالظبط
  const mapCreditCost = getModel5CreditCost('15s', 0);
  const mapBalance = await getCreditsBalance(req.user.userId);
  if (mapBalance < mapCreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${mapCreditCost} credits, you have ${mapBalance}.`, cost: mapCreditCost, remaining: mapBalance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
  }
  const mapCharge = await chargeCredits(req.user.userId, mapCreditCost);
  if (!mapCharge.success) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${mapCreditCost} credits, you have ${mapCharge.remaining}.`, cost: mapCreditCost, remaining: mapCharge.remaining });
  }

  const mapJobId = String(Date.now());
  activeRenderCount++;
  setRenderJob(mapJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: mapJobId, status: 'processing', creditCost: mapCreditCost });
  (async () => {
    try {
      const videoPath = await renderModel5MapVideo({ topic, ratio: ratio || '16:9', jobId: mapJobId, openingCaption, closingCaption, narrationScript });
      setRenderJob(mapJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
    } catch (jobErr) {
      setRenderJob(mapJobId, { status: 'failed', error: jobErr.message || 'Map video render failed.', completedAt: Date.now() });
    } finally {
      activeRenderCount--;
      scheduleRenderJobCleanup(mapJobId);
    }
  })();
});

app.post('/api/model5/payment-request', authMiddleware, async (req, res) => {
  try {
    const { plan, planName, amount, userEmail, screenshot } = req.body;
    if (!plan || !amount || !userEmail || !screenshot) return res.status(400).json({ error: 'Missing required fields' });
    const backendUrl = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app';
    const adminSecret = process.env.ADMIN_SECRET || '';
    const attachments = [];
    if (screenshot) {
      const base64Data = screenshot.replace(/^data:image\/\w+;base64,/, '');
      const ext = screenshot.includes('png') ? 'png' : 'jpg';
      attachments.push({ filename: `m5_payment_${userEmail}_${Date.now()}.${ext}`, content: base64Data });
    }
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Erivion Cinematic <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `🎬 Cinematic Payment - ${planName} - ${userEmail}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#e11d48">🎬 New Cinematic Payment</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#e11d48;font-weight:700">${planName}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr></table><div style="margin-top:24px;display:flex;gap:12px"><a href="${backendUrl}/api/auth/model5-approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a><a href="${backendUrl}/api/auth/model5-reject?email=${encodeURIComponent(userEmail)}&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/model5/usage', authMiddleware, async (req, res) => {
  try {
    // ✅ نظام الكريديت الموحد: الكل عنده access، القيد الوحيد هو رصيد الكريديت
    const balance = await getCreditsBalance(req.user.userId);
    res.json({ access: true, credits_balance: balance, costs: MODEL5_CREDIT_COSTS, costs_with_photo: MODEL5_CREDIT_COSTS_WITH_PHOTO, extra_credits_per_photo: 25 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── New Image Models Routes (Phase 3) ─────────────────────────────────────
app.get('/api/images/models', authMiddleware, (req, res) => {
  const models = Object.keys(NEW_IMAGE_MODELS).map(key => ({
    key,
    label: REPLICATE_MODEL_COSTS[key]?.label || key,
    creditCostPerImage: getImageCreditCost(key, 1),
    tiers: getQualityTiers(key),
    supportsReferenceImages: !NEW_IMAGE_MODELS[key].noReferenceImages,
  }));
  res.json({ models });
});

app.get('/api/images/credit-cost', authMiddleware, (req, res) => {
  const { model, count, tier } = req.query;
  if (!model || !NEW_IMAGE_MODELS[model]) return res.status(400).json({ error: 'unknown model' });
  const n = Math.min(Math.max(1, parseInt(count, 10) || 1), 20);
  try {
    res.json({ model, count: n, tier: tier || null, creditCost: getImageCreditCost(model, n, tier || null) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/images/generate', authMiddleware, renderLimiter, async (req, res) => {
  const { model, prompt, prompts, scenes, referenceImageUrls, aspectRatio, count, tier } = req.body;
  if (!model || !NEW_IMAGE_MODELS[model]) return res.status(400).json({ error: 'unknown model' });
  // ✅ NEW: "prompts" (مصفوفة برومبتات مختلفة لمشاهد مختلفة) بديل عن prompt+count لما العميل
  // يطلب صور مختلفة "مرة واحدة" — لو موجودة ومظبوطة بنستخدمها بدل الفحص العادي لـ prompt
  const distinctPrompts = Array.isArray(prompts) ? prompts.filter(p => typeof p === 'string' && p.trim()).slice(0, 20) : [];
  // ✅ NEW (طلب العميل: "لازم يكون في ذكاء" في مين محتاج مرجع ومين لأ): "scenes" شكل بديل
  // لـ"prompts" بيدي كل مشهد referenceImageUrls/useScenesAsReference خاصة بيه — راجع
  // newImageModelsService.js's generateNewModelImages للتفاصيل الكاملة
  const distinctScenes = Array.isArray(scenes)
    ? scenes.filter(s => s && typeof s.prompt === 'string' && s.prompt.trim()).slice(0, 20)
    : [];
  const usingScenes = distinctScenes.length >= 2;
  const usingPrompts = !usingScenes && distinctPrompts.length >= 2;
  if (!usingScenes && !usingPrompts && !prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });
  const imgUser = await getUserById(req.user.userId);
  if ((imgUser?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock image generation.', show_upgrade: true });
  }
  // ✅ فحص أمان المحتوى قبل أي توليد — نفس الفحص المستخدم في كل الموديلات التانية
  const contentToCheck = usingScenes ? distinctScenes.map(s => s.prompt).join(' \n ') : usingPrompts ? distinctPrompts.join(' \n ') : prompt;
  const modCheck = await checkContentSafety(contentToCheck);
  if (modCheck.unsafe) {
    return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck.category });
  }
  const n = usingScenes ? distinctScenes.length : usingPrompts ? distinctPrompts.length : Math.min(Math.max(1, parseInt(count, 10) || 1), 20);
  let imgCreditCost;
  try {
    imgCreditCost = getImageCreditCost(model, n, tier || null);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const imgBalance = await getCreditsBalance(req.user.userId);
  if (imgBalance < imgCreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This generation needs ${imgCreditCost} credits, you have ${imgBalance}.`, cost: imgCreditCost, remaining: imgBalance });
  }
  const imgCharge = await chargeCredits(req.user.userId, imgCreditCost);
  if (!imgCharge.success) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This generation needs ${imgCreditCost} credits, you have ${imgCharge.remaining}.`, cost: imgCreditCost, remaining: imgCharge.remaining });
  }
  // ✅ FIX (باج حقيقي متكرر: "الاتصال انقطع أثناء التوليد" — بروكسي/gateway بيقطع الاتصال
  // لو طال، بصرف النظر عن أي timeout إحنا حاطينه في الكود نفسه): بدل ما نستنى التوليد كامل
  // على نفس الاتصال (ممكن ياخد دقايق مع batch كبير)، بنرد فورًا بـjobId والفرونت إند بيستعلم
  // (poll) على الحالة — نفس النمط المستخدم فعليًا في /api/render القديم (setRenderJob/
  // getRenderJob)، ده بيمنع أي بروكسي من قطع الاتصال لأن مفيش اتصال طويل أصلاً
  const jobId = `newimg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  setRenderJob(jobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now() });
  res.status(202).json({ jobId, status: 'processing', creditCost: imgCreditCost, remaining: imgCharge.remaining });

  (async () => {
    try {
      const images = await generateNewModelImages({
        modelKey: model,
        prompt,
        prompts: usingPrompts ? distinctPrompts : null,
        scenes: usingScenes ? distinctScenes : null,
        referenceImageUrls: Array.isArray(referenceImageUrls) ? referenceImageUrls.slice(0, 14) : [],
        aspectRatio: aspectRatio || '9:16',
        count: n,
        tier: tier || null,
      });
      setRenderJob(jobId, { status: 'done', images, creditCost: imgCreditCost, completedAt: Date.now() });
      logGeneration({ userId: req.user.userId, kind: 'image', modelKey: model, creditCost: imgCreditCost });
    } catch (genErr) {
      console.error('[NewImageModels] generation failed:', genErr.message);
      await addCreditsBalance(req.user.userId, imgCreditCost);
      setRenderJob(jobId, { status: 'failed', error: 'Image generation failed, your credits were refunded.', completedAt: Date.now() });
    } finally {
      scheduleRenderJobCleanup(jobId);
    }
  })();
});

app.get('/api/images/generate-status/:jobId', authMiddleware, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const job = getRenderJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  if (job.userId && job.userId !== req.user.userId) return res.status(404).json({ error: 'job_not_found' });
  res.json(job);
});

// ── New Video Models Routes ────────────────────────────────────────────────
app.get('/api/videos/models', authMiddleware, (req, res) => {
  // نقل الأداء (prunaai_p_video_animate) ظاهر في القايمة بعلامة performanceTransfer: بياخد فيديو مصدر + صورة شخصية بدل برومبت (الشات بيطلبهم، والصفحات اللي بتولّد من برومبت بتفلتره)
  const models = Object.keys(NEW_VIDEO_MODELS).map(key => ({
    key,
    performanceTransfer: !!NEW_VIDEO_MODELS[key].performanceTransfer,
    swapMode: NEW_VIDEO_MODELS[key].swapMode || null,
    label: REPLICATE_MODEL_COSTS[key]?.label || key,
    tiers: getQualityTiers(key),
    maxClipSec: getMaxClipSeconds(key),
    supportsImageInput: !!NEW_VIDEO_MODELS[key].supportsImageInput,
    supportsVideoEdit: !!NEW_VIDEO_MODELS[key].supportsVideoEdit,
    referenceCaps: NEW_VIDEO_MODELS[key].refCaps || null,
    creditCostPerSecond: getPerSecondCreditCost(key, 1),
    creditCostPerSecondWithVideoIn: REPLICATE_MODEL_COSTS[key]?.videoInTiers ? getPerSecondCreditCost(key, 1, null, { videoIn: true }) : null,
  }));
  res.json({ models });
});

app.get('/api/videos/credit-cost', authMiddleware, (req, res) => {
  const { model, durationSec, tier, videoIn } = req.query;
  if (!model || !NEW_VIDEO_MODELS[model]) return res.status(400).json({ error: 'unknown model' });
  const sec = Math.max(1, parseInt(durationSec, 10) || 5);
  try {
    res.json({ model, durationSec: sec, tier: tier || null, creditCost: getPerSecondCreditCost(model, sec, tier || null, { videoIn: videoIn === 'true' }) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ✅ NEW: طلب العميل — النظام الجديد مكانش فيه فويس أوفر/كابشن/موسيقى خالص (الموديلات
// القديمة 1-8 كان فيها built-in). طبقة post-processing كاملة فوق أي فيديو بالنظام الجديد:
// narrationScript (Gemini TTS + مدة الفيديو بتتحدد حسب مدة السرد نفسه، مش العكس) →
// addCaptions (Whisper حقيقي + fictions-ai/autocaption لحرق الكابشن) → musicStyle
// ('youtube' = ملف حقيقي من assets/music/، غير كده = Freesound API، مقاطع CC0 فقط). كل خطوة اختيارية،
// وبتتحسب في التكلفة بس لو اتطلبت فعليًا.
const CAPTION_CREDIT_FLAT = getFlatCreditCost('autocaption');
// ✅ FIX (نفس قرار البزنس بتاع MERGE_CREDIT_PER_VIDEO فوق): كانت 10 كريديت ثابتة — معالجة
// ffmpeg داخلية بحتة (مصدر الموسيقى نفسه مجاني، Freesound/ملف محلي)، فبقت بتتحسب بهامش
// AUX_PROFIT_MULTIPLIER القريب من التكلفة بدل رقم ثابت مفصول عن أي مصدر حقيقة
const MUSIC_CREDIT_FLAT = getFlatCreditCost('compose_audio');

app.post('/api/videos/generate', authMiddleware, renderLimiter, async (req, res) => {
  let { model, prompt, imageUrl, sourceVideoUrl, aspectRatio, durationSec, tier, narrationScript, voiceKey, narrationLanguage, addCaptions, musicStyle, musicMood, lastFrameUrl, generateAudio } = req.body;
  if (!model || !NEW_VIDEO_MODELS[model]) return res.status(400).json({ error: 'unknown model' });
  // نقل الأداء (prunaai_p_video_animate): فيديو مصدر + صورة شخصية معًا، والبرومبت اختياري (توجيه إضافي بس)
  const isPerfTransfer = !!NEW_VIDEO_MODELS[model].performanceTransfer;
  const httpUrl = (u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim());
  if (isPerfTransfer) {
    if (!httpUrl(sourceVideoUrl) || !httpUrl(imageUrl)) return res.status(400).json({ error: 'performance_transfer_needs_inputs', message: 'This engine needs BOTH a source video (the motion + speech) and a character image.' });
    sourceVideoUrl = sourceVideoUrl.trim(); imageUrl = imageUrl.trim();
    prompt = typeof prompt === 'string' ? prompt : '';
  } else if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });
  // ✅ NEW: مدخلات مرجعية (صور/فيديوهات/صوت مرجعي + آخر فريم) للموديلات اللي الـschema بتاعها
  // بيدعمها فعلاً (seedance_2_5، omni_flash_1_1) — بتتحقق كلها هنا قبل أي خصم كريديت
  const cleanUrlList = (v) => (Array.isArray(v) ? v : []).filter(u => typeof u === 'string' && /^https?:\/\//i.test(u.trim())).map(u => u.trim()).filter((u, i, a) => a.indexOf(u) === i);
  const referenceImageUrls = cleanUrlList(req.body.referenceImageUrls);
  const referenceVideoUrls = cleanUrlList(req.body.referenceVideoUrls);
  const referenceAudioUrls = cleanUrlList(req.body.referenceAudioUrls);
  lastFrameUrl = typeof lastFrameUrl === 'string' && /^https?:\/\//i.test(lastFrameUrl.trim()) ? lastFrameUrl.trim() : null;
  if (!sourceVideoUrl) {
    const refError = validateReferenceInputs(model, { imageUrl, lastFrameUrl, referenceImageUrls, referenceVideoUrls, referenceAudioUrls });
    if (refError) return res.status(400).json({ error: 'invalid_reference_inputs', message: refError });
  }
  // مدة الفيديوهات المرجعية الحقيقية (الـschema: مجموعها لحد 30 ثانية) + سعر "video_in" الأعلى
  const hasReferenceVideos = !sourceVideoUrl && referenceVideoUrls.length > 0;
  if (hasReferenceVideos) {
    try {
      let total = 0;
      for (const u of referenceVideoUrls) total += await measureVideoDurationSec(u);
      if (model === 'seedance_2_5' && total < 3.7) return res.status(400).json({ error: 'invalid_reference_inputs', message: `Seedance needs a reference video of at least 4 seconds — yours is ${Math.round(total * 10) / 10}s.` });
      const maxTotal = NEW_VIDEO_MODELS[model].refCaps?.videoMaxTotalSec;
      if (maxTotal && total > maxTotal + 0.5) return res.status(400).json({ error: 'invalid_reference_inputs', message: `Reference videos add up to ${Math.round(total)}s — the limit is ${maxTotal}s combined.` });
    } catch (e) {
      return res.status(400).json({ error: 'reference_video_probe_failed', message: `Could not read a reference video: ${e.message}` });
    }
  }
  if (addCaptions && !narrationScript?.trim()) return res.status(400).json({ error: 'addCaptions requires narrationScript (captions are burned from the real narration audio)' });
  // ✅ NEW (طلب العميل: "لو عميل طلب مونتاج لفيديو اقل من 10 ثواني... يتعمل بـomni flash1.1
  // ولو اكتر يتعمل بـdecart/lucy-edit-2"): حاجز إضافي في الكود نفسه — مش بنثق في أي موديل جاي
  // من العميل/الايجنت لطلب تعديل فيديو، بنقيس مدته الحقيقية بـffprobe ونفرض الموديل الصح
  // بنفسنا (نفس مبدأ فرض النسبة/الموديل المستخدم في أماكن تانية في المشروع)
  let sourceVideoDurationSec = null;
  if (sourceVideoUrl) {
    try {
      sourceVideoDurationSec = await measureVideoDurationSec(sourceVideoUrl);
    } catch (e) {
      return res.status(400).json({ error: 'source_video_probe_failed', message: `Could not read the source video: ${e.message}` });
    }
    if (isPerfTransfer) {
      const maxPerf = getMaxClipSeconds(model);
      if (maxPerf && sourceVideoDurationSec > maxPerf + 0.5) return res.status(400).json({ error: 'source_video_too_long', message: `This engine supports source videos up to ${maxPerf} seconds — yours is ${Math.round(sourceVideoDurationSec)}s. Trim it and try again.` });
      const minPerf = getMinClipSeconds(model) || 1;
      if (sourceVideoDurationSec < minPerf - 0.3) return res.status(400).json({ error: 'source_video_too_short', message: `This engine needs a source video of at least ${minPerf} seconds — yours is ${Math.round(sourceVideoDurationSec * 10) / 10}s.` });
    } else model = sourceVideoDurationSec <= 10 ? 'omni_flash_1_1' : 'decart_lucy_edit_2';
    // ✅ NEW (طلب العميل: "الفيديو يكون أقل من 200 ميجا زي ما Replicate بيقول وتأكد من كده"):
    // decart/lucy-edit-2's الحد الحقيقي المعلن هو حجم الملف (200MB)، مش مدة زمنية — نتحقق
    // فعليًا بـHEAD request قبل ما نبدأ أي حاجة (تحصيل كريديت أو تحليل)، مش بس نذكره كلام
    if (!isPerfTransfer && model === 'decart_lucy_edit_2') {
      try {
        const headRes = await fetch(sourceVideoUrl, { method: 'HEAD' });
        const contentLength = parseInt(headRes.headers.get('content-length') || '0', 10);
        const MAX_LUCY_EDIT_BYTES = 200 * 1024 * 1024;
        if (contentLength > MAX_LUCY_EDIT_BYTES) {
          return res.status(400).json({
            error: 'source_video_too_large',
            message: `This video is ${(contentLength / (1024 * 1024)).toFixed(0)}MB — video editing for clips over 10s (Lucy Edit 2) only supports files up to 200MB.`,
          });
        }
      } catch {
        // فشل الـHEAD نفسه (شبكة متقطعة) — مش نمنع الطلب من أجله، هنكتشف أي مشكلة حقيقية
        // في التوليد نفسه لاحقًا؛ ده تحقق إضافي احترازي مش الحارس الوحيد
      }
    }
  }
  const vidUser = await getUserById(req.user.userId);
  if ((vidUser?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock this video model.', show_upgrade: true });
  }
  const modCheck = prompt?.trim() ? await checkContentSafety(prompt) : { unsafe: false };
  if (modCheck.unsafe) {
    return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck.category });
  }
  if (narrationScript?.trim()) {
    const scriptCheck = await checkContentSafety(narrationScript);
    if (scriptCheck.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: scriptCheck.category });
    }
  }

  // ✅ لو فيه سرد، لازم نولّده الأول عشان نعرف مدته الحقيقية ونولّد الفيديو بمدة كافية تسعه —
  // العكس (فيديو بمدة تقديرية ثم سرد يتقطع) كان المشكلة الأصلية اللي العميل لقاها
  let narration = null;
  if (narrationScript?.trim()) {
    try {
      narration = await synthesizeNarration(narrationScript, { voiceKey: voiceKey || 'male_wise', languageCode: narrationLanguage || null });
    } catch (e) {
      return res.status(500).json({ error: 'narration_failed', message: `Narration generation failed: ${e.message}` });
    }
  }
  // ✅ لطلب تعديل فيديو (sourceVideoUrl)، المدة الحقيقية للفيديو المصدر (متقاسة فوق بـffprobe)
  // هي المصدر الوحيد للحقيقة — التعديل بيغطي الفيديو كله زي ما هو، مش مدة نختارها أو نخمّنها
  const sec = sourceVideoDurationSec != null
    ? Math.min(sourceVideoDurationSec, getMaxClipSeconds(model) || sourceVideoDurationSec)
    : narration
      ? getSuggestedDuration(model, narration.durationSec)
      : Math.min(Math.max(1, parseInt(durationSec, 10) || 5), getMaxClipSeconds(model) || 30);

  let vidCreditCost;
  try {
    vidCreditCost = getPerSecondCreditCost(model, sec, tier || null, { videoIn: hasReferenceVideos });
    if (narration) vidCreditCost += getPerSecondCreditCost('gemini_flash_tts', Math.ceil(narration.durationSec));
    if (addCaptions) vidCreditCost += CAPTION_CREDIT_FLAT;
    if (musicStyle) vidCreditCost += MUSIC_CREDIT_FLAT;
  } catch (e) {
    if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
    return res.status(400).json({ error: e.message });
  }
  const vidBalance = await getCreditsBalance(req.user.userId);
  if (vidBalance < vidCreditCost) {
    if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${vidCreditCost} credits, you have ${vidBalance}.`, cost: vidCreditCost, remaining: vidBalance });
  }
  const vidCharge = await chargeCredits(req.user.userId, vidCreditCost);
  if (!vidCharge.success) {
    if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${vidCreditCost} credits, you have ${vidCharge.remaining}.`, cost: vidCreditCost, remaining: vidCharge.remaining });
  }
  // ✅ FIX (باج حقيقي متكرر — العميل واجهه أكتر من مرة، آخرها مع seedance 1.5 pro البطيء):
  // "الاتصال انقطع أثناء التوليد" — بروكسي/gateway (Railway/Cloudflare) بيقطع أي اتصال HTTP
  // طال كتير، بصرف النظر عن أي timeout إحنا حاطينه في كودنا إحنا. الحل الحقيقي (مش مجرد
  // زيادة رقم timeout محلي، ده مش هيأثر على قطع من طبقة تانية بره تحكمنا): نفس نمط /api/render
  // القديم بالظبط — نرد فورًا بـjobId (202)، والفرونت إند يستعلم (poll) على الحالة، فمفيش
  // اتصال طويل يتقطع من الأساس مهما طال التوليد الفعلي
  const jobId = `newvid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  setRenderJob(jobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now() });
  res.status(202).json({ jobId, status: 'processing', creditCost: vidCreditCost, remaining: vidCharge.remaining });

  (async () => {
    try {
      let videoUrl = await generateNewModelVideo({
        modelKey: model,
        prompt,
        imageUrl: imageUrl || null,
        sourceVideoUrl: sourceVideoUrl || null,
        aspectRatio: aspectRatio || '16:9',
        durationSec: sec,
        tier: tier || null,
        // (تعديل فيديو موجود = مسار منفصل، بيتجاهل أي مراجع)
        lastFrameUrl: sourceVideoUrl ? null : lastFrameUrl,
        referenceImageUrls: sourceVideoUrl ? [] : referenceImageUrls,
        referenceVideoUrls: sourceVideoUrl ? [] : referenceVideoUrls,
        referenceAudioUrls: sourceVideoUrl ? [] : referenceAudioUrls,
        generateAudio: typeof generateAudio === 'boolean' ? generateAudio : null,
        // الطلبات البسيطة (من غير سرد/كابشن/موسيقى) بنحفظ الـprediction في الداتابيز عشان نكمّل لو السيرفر اتعمله restart وسط التوليد
        onPrediction: (!narration && !addCaptions && !musicStyle) ? (predictionId) => trackJob({ jobId, userId: req.user.userId, model, creditCost: vidCreditCost, predictionId }) : null,
      });

      // ✅ مونتاج ffmpeg محلي (سرد + كابشن بنفس محرك الأفلام الوثائقية + موسيقى بتهدّى تحت الكلام) — بدل
      // fictions-ai/autocaption المدفوع. لو فشل لأي سبب: نرجع للسرد + الموسيقى القديمة من غير كابشن ونرجّع تكلفته
      if (narration || addCaptions || musicStyle) {
        const musicBuffer = musicStyle ? await getBackgroundMusicBuffer(musicStyle, musicMood || null) : null;
        try {
          videoUrl = await finishVideos({
            videoUrls: [videoUrl], narrationPath: narration?.audioPath || null, musicBuffer, transitions: 'none',
            captions: addCaptions ? { style: 'karaoke', lang: narrationLanguage || 'en', position: 'auto' } : null,
          });
        } catch (montageErr) {
          console.warn('[NewVideoModels] montage failed — falling back to plain audio compose without captions:', montageErr.message);
          if (narration) videoUrl = await composeVideoAudio({ videoUrl, narrationPath: narration.audioPath, modelKeyForNaming: model });
          if (musicBuffer) videoUrl = await composeVideoAudio({ videoUrl, musicBuffer, modelKeyForNaming: model });
          if (addCaptions) { await addCreditsBalance(req.user.userId, CAPTION_CREDIT_FLAT).catch(() => {}); vidCreditCost -= CAPTION_CREDIT_FLAT; }
        }
        if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
      }
      setRenderJob(jobId, { status: 'done', videoUrl, creditCost: vidCreditCost, completedAt: Date.now() });
      finishJob(jobId, { status: 'done', videoUrl });
      logGeneration({ userId: req.user.userId, kind: sourceVideoUrl ? 'edit' : 'video', modelKey: model, creditCost: vidCreditCost });
    } catch (genErr) {
      console.error('[NewVideoModels] generation failed:', genErr.message);
      if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
      await addCreditsBalance(req.user.userId, vidCreditCost);
      const failMsg = friendlyVideoError(genErr.message);
      setRenderJob(jobId, { status: 'failed', error: failMsg, completedAt: Date.now() });
      finishJob(jobId, { status: 'failed', error: failMsg });
    } finally {
      scheduleRenderJobCleanup(jobId);
    }
  })();
});

// رفع فيديو العميل كمصدر لنقل الأداء (prunaai_p_video_animate): بنقيس مدته، نتأكد من السقف، ونرفعه على R2 برابط عام
app.post('/api/videos/upload-source', authMiddleware, renderLimiter, videoUpload.single('video'), async (req, res) => {
  let tmp = null;
  try {
    const user = await getUserById(req.user.userId);
    if ((user?.plan || 'free') === 'free') return res.status(403).json({ error: 'no_access', message: 'Top up credits to unlock this video engine.', show_upgrade: true });
    if (!req.file?.buffer?.length || req.file.buffer.length < 1000) return res.status(400).json({ error: 'video file is required' });
    const dir = join(process.cwd(), 'outputs', 'video_edit_tmp');
    fs.mkdirSync(dir, { recursive: true });
    tmp = join(dir, `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
    fs.writeFileSync(tmp, req.file.buffer);
    let durationSec = 0;
    try { durationSec = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tmp}"`, { encoding: 'utf8' }).trim()); } catch { /* handled below */ }
    if (!durationSec) return res.status(400).json({ error: 'Could not read this video — try an MP4 file.' });
    // السقف حسب المحرك: نقل الأداء 60ث؛ seedance_2_5 (مرجع فيديو لتبديل أكتر من شخصية) مجموع الفيديوهات المرجعية فيه 30ث
    const capModel = typeof req.query.model === 'string' && NEW_VIDEO_MODELS[req.query.model] ? req.query.model : 'prunaai_p_video_animate';
    const maxSec = NEW_VIDEO_MODELS[capModel].refCaps?.videoMaxTotalSec || getMaxClipSeconds(capModel) || getMaxClipSeconds('prunaai_p_video_animate');
    if (maxSec && durationSec > maxSec + 0.5) return res.status(400).json({ error: `This video is ${Math.round(durationSec)}s — the limit for this engine is ${maxSec}s.` });
    let width = null, height = null;
    try { [width, height] = execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${tmp}"`, { encoding: 'utf8' }).trim().split('x').map(Number); } catch { /* الأبعاد اختيارية */ }
    const url = await uploadUserSourceVideoToR2(req.file.buffer);
    res.json({ url, durationSec: Math.round(durationSec * 10) / 10, width: width || null, height: height || null });
  } catch (e) {
    console.error('[UploadSource] failed:', e.message);
    res.status(500).json({ error: 'Upload failed — please try again.' });
  } finally { if (tmp) fs.rm(tmp, { force: true }, () => {}); }
});

app.get('/api/videos/generate-status/:jobId', authMiddleware, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  let job = getRenderJob(req.params.jobId);
  if (!job) job = await getJobFromDb(req.params.jobId, req.user.userId); // بعد restart/deploy: الحالة محفوظة في الداتابيز
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  if (job.userId && job.userId !== req.user.userId) return res.status(404).json({ error: 'job_not_found' });
  res.json(job);
});

// ✅ NEW (طلب العميل: أداة تحليل فيديو مستقلة — أي حد يرفع أي فيديو ويطلب تحليله (مين بيتكلم
// إمتى)، وكمان بتتستخدم كخطوة تمهيدية قبل مونتاج فيديو أطول من 10 ثواني عشان الايجنت يبني
// تعليمة تعديل أذكى من التوقيتات الحقيقية دي): zsxkib/talknet-asd — راجع
// videoAnalysisService.js لتفاصيل التسعير الآمن (تقدير سخي مقدمًا + رد الفرق من التكلفة
// الحقيقية بعد التشغيل، لأن الموديل ده مُسعّر بوقت GPU حقيقي متغير مش سعر ثابت)
app.post('/api/videos/analyze', authMiddleware, renderLimiter, async (req, res) => {
  const { videoUrl } = req.body;
  if (!videoUrl?.trim()) return res.status(400).json({ error: 'videoUrl is required' });
  let durationSec;
  try {
    durationSec = await measureVideoDurationSec(videoUrl);
  } catch (e) {
    return res.status(400).json({ error: 'video_probe_failed', message: `Could not read the video: ${e.message}` });
  }
  const estimatedCost = estimateAnalysisCreditCost(durationSec);
  const balance = await getCreditsBalance(req.user.userId);
  if (balance < estimatedCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This analysis needs up to ${estimatedCost} credits, you have ${balance}.`, cost: estimatedCost, remaining: balance });
  }
  const charge = await chargeCredits(req.user.userId, estimatedCost);
  if (!charge.success) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This analysis needs up to ${estimatedCost} credits, you have ${charge.remaining}.`, cost: estimatedCost, remaining: charge.remaining });
  }
  const jobId = `videoanalysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  setRenderJob(jobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now() });
  res.status(202).json({ jobId, status: 'processing', creditCost: estimatedCost, remaining: charge.remaining });

  (async () => {
    try {
      const { segments, mediaUrls, realCreditCost } = await analyzeActiveSpeaker(videoUrl);
      // ✅ نرجع أي فرق بين اللي حصّلناه مقدمًا واللي اتحسب فعليًا بعد التشغيل الحقيقي — لو
      // مقدرناش نقرا التكلفة الحقيقية (realCreditCost === null)، نسيب التقدير المسبق زي ما هو
      // (أفضل من نرجع فرق مبني على تخمين تاني فوق تخمين)
      let finalCreditCost = estimatedCost;
      if (realCreditCost != null && realCreditCost < estimatedCost) {
        const refund = estimatedCost - realCreditCost;
        await addCreditsBalance(req.user.userId, refund);
        finalCreditCost = realCreditCost;
      }
      setRenderJob(jobId, { status: 'done', analysis: segments, mediaUrls, creditCost: finalCreditCost, completedAt: Date.now() });
      logGeneration({ userId: req.user.userId, kind: 'analyze', modelKey: 'talknet_asd', creditCost: finalCreditCost });
    } catch (genErr) {
      console.error('[VideoAnalysis] analysis failed:', genErr.message);
      await addCreditsBalance(req.user.userId, estimatedCost);
      setRenderJob(jobId, { status: 'failed', error: 'Video analysis failed, your credits were refunded.', completedAt: Date.now() });
    } finally {
      scheduleRenderJobCleanup(jobId);
    }
  })();
});

app.get('/api/videos/analyze-status/:jobId', authMiddleware, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const job = getRenderJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  if (job.userId && job.userId !== req.user.userId) return res.status(404).json({ error: 'job_not_found' });
  res.json(job);
});

// ✅ NEW (طلب العميل: "جمع الفيديوهات اللي عملناها في فيديو واحد بـ ffmpeg"): دمج أي مجموعة
// فيديوهات اتعملت بالفعل (أي موديل) في فيديو واحد بالترتيب المطلوب. ده مش توليد AI جديد —
// معالجة على السيرفر نفسه بـ ffmpeg، فمفيش تكلفة API حقيقية زي باقي الموديلات.
// ✅ FIX (قرار بزنس صريح من العميل: "عايزين الكريديت يكون على قد التكلفة بالظبط او اعلى شوية"
// للعمليات دي بالتحديد — كانت 15 كريديت ثابتة هنا بهامش زيادة مش مبرر لعملية ffmpeg داخلية
// بحتة مفيهاش أي تكلفة API خارجية): بقت بتتحسب من creditPricingEngine.js's merge_videos entry
// بهامش AUX_PROFIT_MULTIPLIER (1.25x، قريب من التكلفة الحقيقية) بدل رقم ثابت مفصول عن أي مصدر حقيقة
const MERGE_CREDIT_PER_VIDEO = getFlatCreditCost('merge_videos');
// ✅ NEW (طلب العميل الصريح المتكرر: "اجمع الفيديوهات في فيديو واحد وحط عليه موسيقى وكابشن
// وفويس أوفر بسكريبت جديد" — قبل كده الايجنت كان بيحسب سعر السرد/الكابشن/الموسيقى ويوعد
// بعملهم فعلاً، لكن ماركر الدمج ماكانش بيقبل أي حقل غيرهم خالص، فمفيش أي حاجة كانت بتتعمل
// فعليًا غير الدمج نفسه — نفس الأدوات الحقيقية المستخدمة في /api/videos/generate (سرد
// Gemini + كابشن Whisper/autocaption + موسيقى) بتتطبق هنا بعد الدمج مباشرة): بيدعم دلوقتي
// نفس حقول narrationScript/voiceKey/narrationLanguage/addCaptions/musicStyle/musicMood
app.post('/api/videos/merge', authMiddleware, renderLimiter, async (req, res) => {
  const { videoUrls, narrationScript, voiceKey, narrationLanguage, addCaptions, musicStyle, musicMood } = req.body;
  if (!Array.isArray(videoUrls) || videoUrls.length < 2) return res.status(400).json({ error: 'at least 2 videoUrls are required' });
  if (videoUrls.length > 10) return res.status(400).json({ error: 'max 10 videos per merge' });
  if (addCaptions && !narrationScript?.trim()) return res.status(400).json({ error: 'addCaptions requires narrationScript (captions are burned from the real narration audio)' });
  const mergeUser = await getUserById(req.user.userId);
  if ((mergeUser?.plan || 'free') === 'free') {
    return res.status(403).json({ error: 'no_access', message: 'Top up credits to merge videos.', show_upgrade: true });
  }
  if (narrationScript?.trim()) {
    const modCheck = await checkContentSafety(narrationScript);
    if (modCheck.unsafe) {
      return res.status(400).json({ error: 'content_policy_violation', message: MODERATION_REJECTION_MESSAGE.en, message_ar: MODERATION_REJECTION_MESSAGE.ar, category: modCheck.category });
    }
  }
  // ✅ لازم نولّد السرد الأول عشان نعرف مدته الحقيقية (لحساب سعره) — مدة الفيديو المدموج
  // نفسها ثابتة (مجموع مدة الكليبات)، السرد بيتحط عليه زي ما هو (composeVideoAudio بيقصّ
  // الأطول على الأقصر لو فيه فرق، زي أي دمج صوت/فيديو عادي)
  let narration = null;
  if (narrationScript?.trim()) {
    try {
      narration = await synthesizeNarration(narrationScript, { voiceKey: voiceKey || 'male_wise', languageCode: narrationLanguage || null });
    } catch (e) {
      return res.status(500).json({ error: 'narration_failed', message: `Narration generation failed: ${e.message}` });
    }
  }
  // ✅ NEW (طلب العميل — ميزة تميّز للرابطين قنواتهم بالموقع): تجميع المشاهد + الفويس أوفر +
  // الموسيقى مجانيين تمامًا لطلبات الأتوبايلوت اليومي (channelRun claim من mintInternalToken،
  // مبني في التوكن نفسه فمينفعش أي عميل عادي يزوّره) — الكابشن لسه بكريديت لأن له تكلفة حقيقية
  // منفصلة (Whisper/transcription)، وتوليد الفيديو نفسه (قبل الدمج) لسه بيتحاسب زي أي حد تاني
  const isFreeChannelRun = !!req.user.channelRun;
  let mergeCreditCost = isFreeChannelRun ? 0 : MERGE_CREDIT_PER_VIDEO * videoUrls.length;
  if (narration && !isFreeChannelRun) mergeCreditCost += getPerSecondCreditCost('gemini_flash_tts', Math.ceil(narration.durationSec));
  if (addCaptions) mergeCreditCost += CAPTION_CREDIT_FLAT;
  if (musicStyle && !isFreeChannelRun) mergeCreditCost += MUSIC_CREDIT_FLAT;
  const mergeBalance = await getCreditsBalance(req.user.userId);
  if (mergeBalance < mergeCreditCost) {
    if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
    return res.status(403).json({ error: 'quota_exceeded', message: `This merge needs ${mergeCreditCost} credits, you have ${mergeBalance}.`, cost: mergeCreditCost, remaining: mergeBalance });
  }
  const mergeCharge = await chargeCredits(req.user.userId, mergeCreditCost);
  if (!mergeCharge.success) {
    if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
    return res.status(403).json({ error: 'quota_exceeded', message: `This merge needs ${mergeCreditCost} credits, you have ${mergeCharge.remaining}.`, cost: mergeCreditCost, remaining: mergeCharge.remaining });
  }
  // ✅ FIX: نفس نمط /api/videos/generate بالظبط — رد فوري بـjobId (202) بدل ما نستنى الدمج +
  // السرد + الكابشن + الموسيقى كامل على نفس الاتصال (ممكن ياخد دقايق مع فيديوهات كتير)
  const jobId = `mergevid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  setRenderJob(jobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now() });
  res.status(202).json({ jobId, status: 'processing', creditCost: mergeCreditCost, remaining: mergeCharge.remaining });

  (async () => {
    try {
      // ✅ مونتاج ffmpeg كامل: انتقالات متنوعة + مؤثرات عند القطعات + موسيقى بتهدّى تحت الكلام + كابشن محرك الأفلام
      // الوثائقية (تحت للفيديو الطويل، في النص بحركة للقصير). لو فشل: الدمج القديم البسيط (من غير كابشن) ونرجّع تكلفته
      let videoUrl;
      const musicBuffer = musicStyle ? await getBackgroundMusicBuffer(musicStyle, musicMood || null).catch(() => null) : null;
      try {
        videoUrl = await finishVideos({
          videoUrls, narrationPath: narration?.audioPath || null, musicBuffer, transitions: 'auto',
          captions: addCaptions ? { style: 'karaoke', lang: narrationLanguage || 'en', position: 'auto' } : null,
        });
      } catch (montageErr) {
        console.warn('[VideoMerge] montage failed — falling back to the simple merge:', montageErr.message);
        videoUrl = await mergeVideos(videoUrls);
        if (narration) videoUrl = await composeVideoAudio({ videoUrl, narrationPath: narration.audioPath, modelKeyForNaming: 'merged' });
        if (musicBuffer) videoUrl = await composeVideoAudio({ videoUrl, musicBuffer, modelKeyForNaming: 'merged' });
        if (addCaptions) { await addCreditsBalance(req.user.userId, CAPTION_CREDIT_FLAT).catch(() => {}); mergeCreditCost -= CAPTION_CREDIT_FLAT; }
      }
      if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
      setRenderJob(jobId, { status: 'done', videoUrl, creditCost: mergeCreditCost, completedAt: Date.now() });
      logGeneration({ userId: req.user.userId, kind: 'merge', modelKey: 'merge_videos', creditCost: mergeCreditCost });
    } catch (genErr) {
      console.error('[VideoMerge] merge failed:', genErr.message);
      if (narration) fs.rmSync(narration.workDir, { recursive: true, force: true });
      await addCreditsBalance(req.user.userId, mergeCreditCost);
      setRenderJob(jobId, { status: 'failed', error: 'Video merge failed, your credits were refunded.', completedAt: Date.now() });
    } finally {
      scheduleRenderJobCleanup(jobId);
    }
  })();
});

app.get('/api/videos/merge-status/:jobId', authMiddleware, (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const job = getRenderJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'job_not_found' });
  if (job.userId && job.userId !== req.user.userId) return res.status(404).json({ error: 'job_not_found' });
  res.json(job);
});

// ── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: err.message || 'Internal server error' });
  next(err);
});

app.get('/favicon.png', (req, res) => { res.sendFile(join(__dirname, '..', 'dist', 'favicon.png')); });
app.get('/manifest.json', (req, res) => {
  const fromDist = join(__dirname, '..', 'dist', 'manifest.json');
  const fromPublic = join(__dirname, '..', 'frontend', 'public', 'manifest.json');
  res.type('application/json');
  if (fs.existsSync(fromDist)) return res.sendFile(fromDist);
  res.sendFile(fromPublic);
});
app.get('/favicon.ico', (req, res) => { res.sendFile(join(__dirname, '..', 'dist', 'favicon.png')); });
app.get('/logo.png', (req, res) => {
  const fromDist = join(__dirname, '..', 'dist', 'logo.png');
  const fromPublic = join(__dirname, '..', 'frontend', 'public', 'logo.png');
  if (fs.existsSync(fromDist)) return res.sendFile(fromDist);
  res.sendFile(fromPublic);
});

// ── Templates API ──────────────────────────────────────────────────────────────
const tPool = new _TPool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});
tPool.query(`
  CREATE TABLE IF NOT EXISTS templates (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    prompt TEXT,
    script TEXT,
    model_key TEXT NOT NULL,
    video_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );
`).then(() =>
  tPool.query(`ALTER TABLE templates ADD COLUMN IF NOT EXISTS script TEXT;`)
).catch(e => console.error('[Templates] DB init error:', e.message));

// ✅ FIX (باج أمان خطير حقيقي): كان في سر ثابت (fallback هاردكودد 'Sosa6892Midbok' نفسه
// المكشوف في الفرونت إند القديم) مقارن بـ!== عادي — دلوقتي بيستخدم نفس adminAuth الموحّد
// (JWT، إيميل من قايمة محددة، مفيش أي سر بيتخزن في الفرونت إند) — راجع adminAuthMiddleware.js
const templateAdminAuth = adminAuth;

// ── Seed default templates (runs once on startup if table is empty) ─────────
await (async () => {
  try {
    const { rows } = await tPool.query('SELECT COUNT(*) AS count FROM templates');
    if (parseInt(rows[0].count, 10) === 0) {
      await tPool.query(
        `INSERT INTO templates (title, description, model_key) VALUES
          ($1, $2, $3),
          ($4, $5, $6),
          ($7, $8, $9)`,
        [
          'Beautiful Landscape', 'Stunning nature and landscape visuals', 'model1',
          'Product Showcase',    'Highlight your product with cinematic shots', 'model2',
          'AI Generated Images', 'Fully AI-generated imagery for any topic', 'model3',
        ]
      );
      console.log('[Templates] Seeded 3 default templates.');
    }
  } catch (e) {
    console.error('[Templates] Seed error:', e.message);
  }
})();

// GET /api/templates — public, returns all templates ordered by model
app.get('/api/templates', async (req, res) => {
  try {
    const { rows } = await tPool.query('SELECT * FROM templates ORDER BY model_key, created_at DESC');
    res.json({ templates: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/templates/debug/seed — debug: check count and seed if empty
app.get('/api/templates/debug/seed', async (req, res) => {
  try {
    const countResult = await tPool.query('SELECT COUNT(*) AS count FROM templates');
    const count = parseInt(countResult.rows[0].count, 10);
    let seeded = false;
    if (count === 0) {
      await tPool.query(
        `INSERT INTO templates (title, description, model_key) VALUES
          ($1, $2, $3),
          ($4, $5, $6),
          ($7, $8, $9)`,
        [
          'Beautiful Landscape', 'Stunning nature and landscape visuals', 'model1',
          'Product Showcase',    'Highlight your product with cinematic shots', 'model2',
          'AI Generated Images', 'Fully AI-generated imagery for any topic', 'model3',
        ]
      );
      seeded = true;
      console.log('[Templates] Debug seed: inserted 3 default templates.');
    }
    const afterCount = seeded
      ? 3
      : count;
    res.json({ count: afterCount, seeded });
  } catch (e) {
    console.error('[Templates] Debug seed error:', e.message);
    res.status(500).json({ count: 0, seeded: false, error: e.message });
  }
});

// GET /api/templates/debug/add-missing — inserts Product Showcase and AI Generated Images if absent
app.get('/api/templates/debug/add-missing', async (req, res) => {
  try {
    const { rows: existing } = await tPool.query('SELECT model_key FROM templates');
    const existingKeys = new Set(existing.map(r => r.model_key));
    let added = 0;

    if (!existingKeys.has('model2')) {
      await tPool.query(
        'INSERT INTO templates (title, description, model_key) VALUES ($1, $2, $3)',
        ['Product Showcase', 'Highlight your product with cinematic shots', 'model2']
      );
      added++;
      console.log('[Templates] Inserted missing template: Product Showcase (model2)');
    }

    if (!existingKeys.has('model3')) {
      await tPool.query(
        'INSERT INTO templates (title, description, model_key) VALUES ($1, $2, $3)',
        ['AI Generated Images', 'Fully AI-generated imagery for any topic', 'model3']
      );
      added++;
      console.log('[Templates] Inserted missing template: AI Generated Images (model3)');
    }

    const { rows: countRows } = await tPool.query('SELECT COUNT(*) AS count FROM templates');
    const count = parseInt(countRows[0].count, 10);
    res.json({ count, added });
  } catch (e) {
    console.error('[Templates] add-missing error:', e.message);
    res.status(500).json({ count: 0, added: 0, error: e.message });
  }
});

// POST /api/templates — admin only, create a new template
app.post('/api/templates', templateAdminAuth, async (req, res) => {
  const { title, description, prompt, script, model_key, video_url } = req.body;
  if (!title || !model_key) return res.status(400).json({ error: 'title and model_key required' });
  try {
    const { rows } = await tPool.query(
      'INSERT INTO templates (title, description, prompt, script, model_key, video_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, description || null, prompt || null, script || null, model_key, video_url || null]
    );
    res.status(201).json({ success: true, template: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/templates/:id — admin only, delete by id
app.delete('/api/templates/:id', templateAdminAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'valid id required' });
  try {
    await tPool.query('DELETE FROM templates WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/templates/add — admin only (legacy alias kept for AdminPage compatibility)
app.post('/api/templates/add', templateAdminAuth, async (req, res) => {
  const { title, description, prompt, script, model_key, video_url } = req.body;
  if (!title || !model_key) return res.status(400).json({ error: 'title and model_key required' });
  try {
    const { rows } = await tPool.query(
      'INSERT INTO templates (title, description, prompt, script, model_key, video_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, description || null, prompt || null, script || null, model_key, video_url || null]
    );
    res.json({ success: true, id: rows[0].id, template: rows[0] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/templates/upload-video — admin only, upload video to R2
const templateVideoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

app.post('/api/templates/upload-video', templateAdminAuth, templateVideoUpload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.S3_ENDPOINT_URL,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
    });
    const ext = req.file.originalname.split('.').pop();
    const key = `templates/tpl_${Date.now()}.${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET || 'erivion-videos',
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'video/mp4',
    }));
    const url = `${(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')}/${key}`;
    res.json({ url });
  } catch (e) {
    console.error('[Templates] R2 upload failed:', e.message);
    res.status(500).json({ error: 'Upload to R2 failed: ' + e.message });
  }
});

// POST /api/templates/delete — admin only (legacy alias kept for AdminPage compatibility)
app.post('/api/templates/delete', templateAdminAuth, async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  try {
    await tPool.query('DELETE FROM templates WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
//  SEO & AI CRAWLER SUPPORT
// ══════════════════════════════════════════════════════════════════════════
// ✅ المشكلة: الموقع Single Page App (React) — أي زائر عادي بيحمّل index.html
// فاضي وجافاسكريبت بيرسم المحتوى بعد كده. لكن أدوات زي ChatGPT's fetcher،
// GPTBot، Google-Extended (اللي بيغذي Gemini)، وحتى محركات بحث تقليدية أحيانًا
// بتعمل GET عادي وبتقرا الـ HTML الخام من غير ما تشغّل الجافاسكريبت خالص — فبيشوفوا
// صفحة فاضية إلا اللاندينج بيدج (اللي فيها محتوى ثابت أصلاً). الحل المعروف
// (Google نفسها كانت بتنصح بيه لسنين لمواقع الـ SPA) هو "Dynamic Rendering":
// نكتشف لو الطلب جاي من بوت معروف، ونرجّعله صفحة HTML ثابتة فيها المحتوى
// والعناوين والوصف الصح لنفس الرابط، بدل الـ SPA الفاضية.

const BOT_UA_REGEX = /bot|crawl|spider|slurp|GPTBot|ChatGPT-User|OAI-SearchBot|Google-Extended|Applebot|Bingbot|DuckDuckBot|Baiduspider|YandexBot|facebookexternalhit|Twitterbot|LinkedInBot|WhatsApp|Slackbot|Discordbot|TelegramBot|anthropic-ai|Claude-Web|ClaudeBot|PerplexityBot|Meta-ExternalAgent/i;

const SITE_URL = process.env.FRONTEND_URL || 'https://erivion.net';

// ✅ نسخة خفيفة من بيانات المقالات (id/title/summary بس) — لازم تتزامن يدويًا مع
// BLOG_POSTS في frontend/src/pages/BlogPostPage.jsx كل ما تتضاف مقالة جديدة، عشان
// كل مقال يكون له رابط حقيقي (/blog/{id}) يقدر جوجل والبوتات يفهرسوه لوحده.
const BLOG_ARTICLES = [
  { id: 'make-money-youtube-ai-videos-2026', title: 'How to Make Money on YouTube with AI Videos in 2026', summary: 'Step-by-step guide to creating faceless AI-generated YouTube channels that generate passive income.' },
  { id: 'ai-video-creation-complete-beginners-guide', title: 'AI Video Creation: The Complete Beginners Guide', summary: 'Everything you need to know about generating professional videos using artificial intelligence tools.' },
  { id: 'faceless-youtube-channel-ideas-5k-per-month', title: 'Faceless YouTube Channel Ideas That Make 5K Per Month', summary: 'Profitable niche ideas for building a faceless AI-generated YouTube channel.' },
  { id: 'repurpose-youtube-videos-facebook-tiktok', title: 'How to Repurpose YouTube Videos for Facebook and TikTok', summary: 'A multi-platform distribution strategy to get more reach from every video you create.' },
  { id: 'best-ai-video-niches-low-competition-2026', title: 'Best AI Video Niches with Low Competition in 2026', summary: 'Niches with the best combination of growth potential and low competition for AI-generated content.' },
  { id: 'grow-0-to-10k-subscribers-ai-videos', title: 'How to Grow from 0 to 10K Subscribers Using AI Videos', summary: 'A month-by-month roadmap to growing a YouTube channel powered by AI video generation.' },
  { id: 'product-photo-to-video-ad-2026', title: 'How to Turn One Product Photo Into a Complete Video Ad', summary: 'A step-by-step look at how AI can take a single product image and produce a fully animated, voiced video advertisement in minutes.' },
  { id: 'ai-agent-chat-video-creation-2026', title: "Erivion's AI Agent: Create a Video Just by Chatting", summary: 'How a conversational AI assistant can replace an entire video production workflow.' },
  { id: 'ai-video-ads-vs-traditional-production-cost-2026', title: 'AI Video Ads vs. Traditional Video Production: The Real Cost Difference', summary: 'A practical comparison of budget, turnaround time, and flexibility between traditional and AI video ad production.' },
];

const SEO_PAGES = {
  '/': {
    title: 'Erivion — منصة إنشاء فيديوهات بالذكاء الاصطناعي بالعربي',
    description: 'حوّل أي فكرة أو سكريبت أو صورة منتج إلى فيديو احترافي في دقائق، بأحدث محركات الذكاء الاصطناعي زي Veo 3، Seedance، Nano Banana، وKling. مساعد ذكي يتذكر طلباتك ويبحث عن معلومات حقيقية، وإدارة تلقائية لقناتك على يوتيوب. مدعوم بالعربي والإنجليزي.',
    h1: 'Erivion — إنشاء فيديوهات احترافية بالذكاء الاصطناعي',
    body: [
      'Erivion هي منصة عربية لإنشاء فيديوهات AI احترافية من فكرة نصية، سكريبت جاهز، أو صورة منتج — بدون خبرة مونتاج أو برامج معقدة.',
      'توليد الصور: محركات حقيقية زي Nano Banana 2، Nano Banana Pro، Seedream، وGPT-Image 2 — بتناسق بصري ثابت للشخصية أو المنتج عبر كل مشاهد الفيديو.',
      'تحريك الصور لفيديو سينمائي: محركات زي Veo 3، Seedance، Kling، PixVerse، وLuma Ray 2.',
      'تعديل فيديو موجود بالفعل بتعليمات نصية عادية (Gemini Omni Flash) — من غير ما تعيد توليد الفيديو من الصفر.',
      'أنواع محتوى جاهزة: فيديو من لقطات ستوك حقيقية، فيديو بشخصية ثابتة تعيش مغامرة كل حلقة، سكتش سبورة بيضاء، فيديوهات خرائط جغرافية متحركة، وإعلان فيديو كامل من صورة منتج واحدة.',
      'مساعد ذكي (AI Agent) يفهم فكرتك بالعربي أو الإنجليزي، يتذكر طلباتك السابقة، يقدر يبحث عن معلومات ومصادر حقيقية عن أي حدث أو موضوع، ويختار المحرك المناسب وينشئ الفيديو معك مباشرة في المحادثة.',
      'استنساخ الصوت (Voice Cloning): سجّل عينة صوتك مرة واحدة — متاح حاليًا على محركات التوليد الكلاسيكية.',
      'إدارة قناة يوتيوب تلقائية (My Channels): اربط قناتك، ويقترح Erivion فيديو جديد كل يوم بناءً على تحليل حقيقي للقناة (عن طريق VidIQ)، وينفذه بعد موافقتك، ويجهّز لك الفيديو والصورة المصغرة والعنوان والوصف والكلمات المفتاحية — وانت اللي بترفعها على قناتك بنفسك (Erivion مش بتنشر على يوتيوب نيابةً عنك).',
      'الموقع يوفر باقات كريديت مرنة للمستخدمين المصريين (InstaPay) والدوليين (Gumroad).',
      'استوديو الأفلام الوثائقية: فيلم وثائقي كامل من موضوع أو سكريبت أو تعليقك الصوتي، بلقطات أرشيفية وحقيقية من مصادر عامة (NASA، Wikimedia Commons، Internet Archive، Pexels)، وموشن جرافيك وخرائط ولوحات صور وكابشن — أفلام أفقية لحد 30 دقيقة وشورتس رأسي لحد 3 دقايق.',
      'مونتاج ذكي لفيديوهاتك: ارفع لحد 20 فيديو (وتعليق صوتي وصور أو فيديو كمرجع لستايل الموشن جرافيك) والمساعد يفهم كل مشهد ويرتّب المونتاج حسب خطتك ومزاجك: انتقالات بس، مشاهد متزامنة مع صوتك، أو مونتاج صنّاع محتوى بموشن جرافيك ومشاهد 3D بتحل مكان لقطات والصوت الأصلي بيكمّل، مع كابشن بلغة الكلام الفعلية ومستوى مؤثرات صوتية تختاره.',
      'إعلان منتج من صورة واحدة: ارفع صورة المنتج والمساعد يتعرف عليه ويقترح فكرة الإعلان ويرشّح لك محرك (Wan 3.0، Seedance 2.5، Gemini Omni Flash 1.1) بتعليق صوتي مدمج، وبيبدأ بعد موافقتك على الخطة والسعر.',
      'تحريك صورة بحركة فيديو (P-Video Animate): ارفع فيديو بحركة وكلام وصورة شخصية، وتطلع الشخصية بمكان صورتها بتعمل نفس الحركات وتقول نفس الكلام.',
      'استوديو الشخصيات: سجّل شخصيتك أو وجهك بصورة واحدة واستخدمها في أي فيديو من شات المساعد، واختار شخصيات جاهزة، أو بدّل الشخصية بشخصيتك في قوالب ترند جاهزة (رقص، كوميدي، سينمائي) بسعر واضح بالكريديت.',
      'في إدارة القنوات: فكرة يومية للقناة بعد موافقتك، وإيميل لما الفكرة والصورة المصغرة (بـNano Banana 2.1) والعنوان والوصف والكلمات المفتاحية تجهز في مشروع بنفس اسم القناة.',
    ],
  },
  '/pricing': {
    title: 'الأسعار والباقات — Erivion',
    description: 'باقات كريديت مرنة لكل الميزانيات. اشحن رصيدك واستخدمه على أي محرك فيديو أو صور بالذكاء الاصطناعي في المنصة — من Veo 3 وSeedance لحد Nano Banana وKling.',
    h1: 'أسعار وباقات Erivion',
    body: [
      'نظام كريديت موحّد يشتغل على كل محركات التوليد — اشتري رصيد مرة واحدة واستخدمه على أي محرك تحبه، والكريديت مبينتهيش.',
      'للمستخدمين المصريين: باقات بالجنيه المصري عن طريق InstaPay.',
      'للمستخدمين الدوليين: باقات ثابتة بالدولار عن طريق Gumroad (Starter, Creator, Studio, Team, Agency).',
      'خصومات دورية على باقات الكريديت للمستخدمين المصريين بتظهر على صفحة الأسعار بسعرها بعد الخصم.',
      'برنامج تسويق بالعمولة (Affiliate) متاح — اربح 20% من قيمة أي عملية شحن تتم من خلال رابطك.',
    ],
  },
  '/about': {
    title: 'من نحن — Erivion',
    description: 'Erivion منصة عربية لإنشاء فيديوهات بالذكاء الاصطناعي، هدفنا نخلي إنتاج الفيديو الاحترافي متاح لأي حد بدون خبرة أو معدات مكلفة.',
    h1: 'من نحن',
    body: [
      'مهمتنا: نخلي إنتاج الفيديو الاحترافي متاح لأي حد — بدون برامج مونتاج مكلفة أو خبرة سابقة.',
      'إيه اللي بنعمله: تديلنا فكرة، سكريبت، أو صورة منتج، وإحنا بنتولى المشاهد والفويس أوفر والكابشن والموسيقى والمؤثرات — شامل إعلانات فيديو كاملة من صورة منتج واحدة.',
      'التكنولوجيا: نماذج لغوية متقدمة لكتابة السكريبتات، نماذج توليد صور وفيديو، تحويل نص لصوت طبيعي، وخط إنتاج احترافي مبني على FFmpeg. بدعم أكتر من 8 لغات.',
      'استوديو الأفلام الوثائقية والمونتاج الذكي: حوّل سكريبت لفيلم وثائقي كامل، أو ارفع مقاطعك وسيب المونتاج الذكي يعدلها بانتقالات ومؤثرات وكابشن.',
      'استوديو الشخصيات: احفظ شخصية مرة واحدة (برفع صورة أو بإنشائها بالذكاء الاصطناعي) واستخدمها في أي فيديو، أو بدّلها في قوالب الترند. شخصياتك خاصة بحسابك: Erivion معندهاش أي أداة لتصفّحها ولا بتبيعها ولا بتستخدمها في تدريب نماذج الذكاء الاصطناعي.',
      'معايير المحتوى: بنمنع بشكل صارم أي محتوى إباحي أو عنصري أو عنيف، وكل طلب بيمر على فحص تلقائي بالذكاء الاصطناعي بالإضافة لمراجعة يدوية.',
      'تواصل معنا: digidelight33@gmail.com',
    ],
  },
  '/support': {
    title: 'الدعم — Erivion',
    description: 'محتاج مساعدة في استخدام Erivion؟ تواصل مع فريق الدعم عن أي استفسار خاص بالفيديوهات، الاشتراكات، أو الاسترداد.',
    h1: 'مركز الدعم',
    body: [
      'لو عندك أي استفسار عن استخدام الموقع، الموديلات المختلفة، أو مشكلة في فيديو، فريقنا جاهز يساعدك.',
      'للاستفسارات عن الدفع والاسترداد: راجع صفحة سياسة الاسترداد، أو تواصل معنا مباشرة.',
      'البريد الإلكتروني: digidelight33@gmail.com',
    ],
  },
  '/templates': {
    title: 'قوالب فيديو جاهزة — Erivion',
    description: 'مكتبة قوالب فيديو جاهزة تقدر تستخدمها كنقطة بداية سريعة لفيديوهاتك على Erivion.',
    h1: 'قوالب جاهزة',
    body: ['تصفح مجموعة من قوالب الفيديو الجاهزة عبر كل الموديلات، واستخدمها كأساس سريع لمشروعك بدل البدء من الصفر.'],
  },
  '/community': {
    title: 'مجتمع Erivion',
    description: 'شوف فيديوهات صنعها مستخدمين تانيين على Erivion، واتفاعل مع المجتمع.',
    h1: 'مجتمع Erivion',
    body: ['استكشف فيديوهات المستخدمين، شارك أعمالك، واتعلم من غيرك في مجتمع Erivion.'],
  },
  // ✅ FIX (باج حقيقي: الصفحات الخمس دي حقيقية وموجودة كروابط مباشرة (App.jsx's KNOWN_PATHS)
  // بس مكانتش مضافة لـSEO_PAGES خالص — يعني مكانتش هتظهر لا في sitemap.xml (بيتولّد من
  // Object.keys(SEO_PAGES) بس) ولا في المحتوى اللي بيتقدّم لأي crawler، فكانت عمليًا مخفية
  // تمامًا عن جوجل/الذكاء الاصطناعي رغم إنها صفحات عامة مفيدة)
  '/documentary': {
    title: 'استوديو الأفلام الوثائقية — Erivion',
    description: 'اعمل فيلم وثائقي كامل من موضوع أو سكريبت أو تعليقك الصوتي: لقطات حقيقية، موشن جرافيك، كابشن ومؤثرات صوتية — بالعربي والإنجليزي، بنسبة 16:9 أو 9:16.',
    h1: 'استوديو الأفلام الوثائقية',
    body: [
      'استوديو الأفلام الوثائقية في Erivion بيحوّل موضوعًا أو سكريبتًا جاهزًا أو تعليقًا صوتيًا سجّلته بنفسك إلى فيلم وثائقي كامل، من غير مونتاج يدوي.',
      'بيختار لقطات وصور حقيقية من مصادر عامة زي Pexels وPixabay وNASA وWikimedia Commons وInternet Archive، ويرتّبها على سردك الصوتي بتزامن دقيق مع الكلام.',
      'فيه موشن جرافيك متنوع: خرائط، لوحات صور، عدّادات، خطوط زمنية، سنين بتلف، أيقونات مرسومة، أختام، وقوائم بتطلع من تحت — مع كابشن بارز ومؤثرات صوتية وموسيقى خلفية.',
      'بيدعم العربي والإنجليزي، وأفلام أفقية 16:9 بأطوال لحد 30 دقيقة، وشورتس رأسي 9:16 لحد 3 دقايق بكابشن كبير كلمة كلمة، وللأفلام لحد 12 دقيقة تقدر تبدّل أي مشهد بعد الإنتاج من محرر المشاهد.',
      'كل حساب جديد له تجربة مجانية لمرة واحدة، والباقي بالكريديت حسب مدة الفيلم.',
      'مونتاج فيديو بتاعي: ارفع فيديوهاتك من الاستوديو أو من شات المساعد، والنظام يحلّل المشاهد ويقطع ويرتّب ويضيف انتقالات وكابشن وموشن جرافيك ومؤثرات صوتية حسب طلبك — مرة مجانية لكل حساب (لحد دقيقتين، بعلامة مائية).',
    ],
  },
  '/courses': {
    title: 'كورسات Erivion — اتعلم صناعة الفيديو بالذكاء الاصطناعي',
    description: 'دروس فيديو تساعدك تتقن صناعة الفيديوهات واستخدام محركات الذكاء الاصطناعي في Erivion — بعضها مجاني وبعضها حصري للمشتركين.',
    h1: 'كورسات Erivion',
    body: [
      'مكتبة دروس فيديو تعليمية تساعدك تتقن استخدام Erivion وصناعة الفيديو بالذكاء الاصطناعي عمومًا — من كتابة الفكرة لحد التصدير النهائي.',
      'بعض الكورسات متاحة مجانًا لكل الزوار، والباقي حصري لمشتركي باقات Erivion المدفوعة.',
    ],
  },
  '/changelog': {
    title: 'إيه الجديد — Erivion',
    description: 'كل التحديثات والتحسينات الجديدة على منصة Erivion، أول بأول.',
    h1: 'إيه الجديد في Erivion',
    body: [
      'بنطوّر المنصة باستمرار — من هنا تقدر تتابع كل ميزة جديدة أو تحسين بيضاف لـErivion أول بأول.',
      'آخر التحديثات: مشاهد موشن جرافيك 3D بتحل مكان لقطات في المونتاج، فيديو أو صورة كمرجع لستايل الموشن جرافيك، تحكم في مستوى المؤثرات الصوتية، P-Video Animate لنقل الأداء، إعلان منتج من صورة واحدة، أرشيف أكتر في الأفلام الوثائقية، وصورة مصغرة بالذكاء الاصطناعي لقنوات الأفلام الوثائقية.',
    ],
  },
  '/roadmap': {
    title: 'الخطة القادمة — Erivion',
    description: 'شوف الميزات الجاية على Erivion وصوّت على اللي عايزه يتعمل الأول.',
    h1: 'الخطة القادمة',
    body: ['قايمة حية بالميزات المخطط ليها أو قيد التنفيذ حاليًا على Erivion — وتقدر تصوّت على أكتر ميزة عايزها تتعمل الأول.'],
  },
  '/status': {
    title: 'حالة نظام Erivion',
    description: 'حالة حية للخدمات الأساسية في Erivion، وأي بلاغات عن مشاكل معروفة.',
    h1: 'حالة نظام Erivion',
    body: ['متابعة حية لحالة الخدمات الأساسية (قاعدة البيانات، تخزين الملفات، محركات التوليد، مساعد الشات) وأي بلاغات عطل معروفة.'],
  },
  '/affiliate': {
    title: 'برنامج الشراكة — Erivion',
    description: 'اربح 20% من أي شحن كريديت يتم من خلال رابط الإحالة الخاص بك على Erivion.',
    h1: 'برنامج الشراكة',
    body: ['شارك رابطك الخاص واربح 20% من قيمة أي عملية شحن كريديت تتم من خلاله، مع لوحة تتبع للإحالات والأرباح.'],
  },
  '/api-docs': {
    title: 'API و MCP — Erivion',
    description: 'اربط Erivion مباشرة بـ Claude أو أي أداة تدعم MCP، وولّد صور وفيديوهات حقيقية من جوه محادثتك.',
    h1: 'API و MCP',
    body: ['وثائق ربط Erivion كـMCP server مع Claude.ai أو Claude Desktop أو Claude Code — ولّد صور وفيديوهات حقيقية مباشرة من داخل محادثتك، بنفس أسعار الموقع بالظبط.'],
  },
  '/terms': { title: 'شروط الخدمة — Erivion', description: 'شروط استخدام منصة Erivion لإنشاء الفيديوهات بالذكاء الاصطناعي.', h1: 'شروط الخدمة', body: ['راجع شروط الخدمة الكاملة الخاصة باستخدام منصة Erivion.'] },
  '/privacy': { title: 'سياسة الخصوصية — Erivion', description: 'كيف تتعامل Erivion مع بياناتك الشخصية وخصوصيتك.', h1: 'سياسة الخصوصية', body: ['راجع سياسة الخصوصية الكاملة الخاصة بمنصة Erivion.', 'شخصياتك التي تنشئها أو ترفعها خاصة بحسابك: Erivion ليس لديها أي أداة لتصفّحها، ولا تبيعها ولا تشاركها ولا تستخدمها في تدريب نماذج الذكاء الاصطناعي.'] },
  '/refund': { title: 'سياسة الاسترداد — Erivion', description: 'شروط استرداد الأموال للمستخدمين المصريين والدوليين على Erivion.', h1: 'سياسة الاسترداد', body: ['المستخدمون المصريون: يمكن طلب الاسترداد خلال 4 ساعات من الشحن فقط. المستخدمون الدوليون: نظام الاسترداد غير متاح حاليًا وسيتم توفيره قريبًا.'] },
  '/blog': {
    title: 'مدونة Erivion — مقالات عن الفيديو والذكاء الاصطناعي',
    description: 'مقالات ودلائل عن إنشاء فيديوهات AI، إعلانات المنتجات، وتنمية المحتوى باستخدام الذكاء الاصطناعي.',
    h1: 'مدونة Erivion',
    body: BLOG_ARTICLES.map(a => `${a.title} — ${a.summary}`),
  },
  '/faq': {
    title: 'الأسئلة الشائعة — Erivion',
    description: 'إجابات على أكتر الأسئلة اللي بتتسأل عن استخدام Erivion، الكريديت، الموديلات المختلفة، الدفع، وبرنامج الشراكة.',
    h1: 'الأسئلة الشائعة',
    body: [
      'كيف أصنع فيديو؟ اكتب فكرتك أو نصك في صفحة الإنشاء، اختر المدة والصوت، ثم اضغط Generate Scenes. بعدها راجع المشاهد واضغط Render Video لتوليد الفيديو النهائي.',
      'كام وقت يستغرق تصيير الفيديو؟ يعتمد على مدة الفيديو ومدى ازدحام السيرفر — عادة من دقيقة لعدة دقائق حسب الموديل والمدة المختارة.',
      'ما الفرق بين النماذج المختلفة؟ كل موديل له طريقة توليد مختلفة: من صور AI ثابتة، لفيديو حقيقي بالذكاء الاصطناعي، لفيديو سينمائي بشخصيات ثابتة، وصولًا لإعلانات فيديو كاملة من صورة منتج.',
      'ما هو الكريديت وكيف يُحسب؟ الكريديت هو وحدة قياس استخدام المنصة، وبيتصرف على أي موديل تختاره حسب تكلفة كل فيديو.',
      'كيف أدفع؟ للمصريين عن طريق InstaPay، وللمستخدمين الدوليين عن طريق Gumroad بالبطاقة مباشرة.',
      'هل تدعم المنصة اللغة العربية؟ نعم، بالكامل — أصوات عربية متعددة (مصري، خليجي، فصحى) وكابشن من اليمين لليسار.',
      'ما هو برنامج الشراكة؟ اربح 20% من قيمة أي شحن كريديت يتم من خلال رابط الإحالة الخاص بك.',
      'هل فيه خطة مجانية؟ مفيش خطة مجانية دايمة، لكن فيه تجارب مجانية مرة واحدة لكل حساب: مونتاج مجاني لفيديوهاتك (لحد دقيقتين و6 فيديوهات بعلامة مائية)، وأول دقيقة من فيلم وثائقي بصوتك أنت.',
      'إيه هو استوديو الأفلام الوثائقية؟ بتديله موضوع أو سكريبت أو تعليق صوتي ويطلعلك فيلم وثائقي كامل بلقطات حقيقية وأرشيفية (NASA وWikimedia Commons وInternet Archive وPexels)، موشن جرافيك وخرائط وكابشن — أفلام أفقية لحد 30 دقيقة وشورتس رأسي لحد 3 دقايق.',
      'إزاي أعمل مونتاج لفيديوهاتي؟ من شات الايجنت ارفع لحد 20 فيديو (وتعليق صوتي وصور أو فيديو كمرجع لستايل الموشن جرافيك)، والايجنت يفهم المشاهد ويقترح خطة وسعر وبيبدأ بعد موافقتك — انتقالات بس، تزامن مع الصوت، أو مونتاج صنّاع محتوى بمشاهد موشن 3D، مع كابشن بلغة الكلام ومستوى مؤثرات صوتية تختاره.',
      'أقدر أعمل إعلان لمنتجي من صورة واحدة؟ أيوه، الايجنت يتعرف على المنتج ويقترح فكرة وموديل (Wan 3.0 أو Seedance 2.5 أو Gemini Omni Flash 1.1) بتعليق صوتي مدمج، وبيبدأ بعد موافقتك على الخطة والسعر.',
      'إيه هو P-Video Animate؟ تحريك صورة: فيديو فيه حركة وكلام وصورة شخصية، والناتج الشخصية (بمكان صورتها) بتعمل نفس الحركات وتقول نفس الكلام، مش بيبدّل شخص جوه الفيديو. موجود في زرار + ← Create video.',
      'إيه اللي بتعمله صفحة قنواتي؟ بتربط قناتك عن طريق VidIQ ويقترح عليك Erivion فيديو كل يوم، وبعد موافقتك بيجيلك إيميل لما الفكرة والصورة المصغرة والعنوان والوصف والكلمات المفتاحية تجهز — وانت اللي بترفعها على قناتك.',
    ],
    faqItems: [
      { q: 'هل فيه خطة مجانية؟', a: 'مفيش خطة مجانية دايمة، لكن فيه تجارب مجانية مرة واحدة لكل حساب: مونتاج مجاني لفيديوهاتك (لحد دقيقتين و6 فيديوهات بعلامة مائية)، وأول دقيقة من فيلم وثائقي بصوتك أنت.' },
      { q: 'إيه هو استوديو الأفلام الوثائقية؟', a: 'بتديله موضوع أو سكريبت أو تعليق صوتي ويطلعلك فيلم وثائقي كامل بلقطات حقيقية وأرشيفية (NASA وWikimedia Commons وInternet Archive وPexels)، موشن جرافيك وخرائط وكابشن — أفلام أفقية لحد 30 دقيقة وشورتس رأسي لحد 3 دقايق.' },
      { q: 'إزاي أعمل مونتاج لفيديوهاتي؟', a: 'من شات الايجنت ارفع لحد 20 فيديو (وتعليق صوتي وصور أو فيديو كمرجع لستايل الموشن جرافيك)، والايجنت يفهم المشاهد ويقترح خطة وسعر وبيبدأ بعد موافقتك — انتقالات بس، تزامن مع الصوت، أو مونتاج صنّاع محتوى بمشاهد موشن 3D، مع كابشن بلغة الكلام ومستوى مؤثرات صوتية تختاره.' },
      { q: 'أقدر أعمل إعلان لمنتجي من صورة واحدة؟', a: 'أيوه، الايجنت يتعرف على المنتج ويقترح فكرة وموديل (Wan 3.0 أو Seedance 2.5 أو Gemini Omni Flash 1.1) بتعليق صوتي مدمج، وبيبدأ بعد موافقتك على الخطة والسعر.' },
      { q: 'إيه هو P-Video Animate؟', a: 'تحريك صورة: فيديو فيه حركة وكلام وصورة شخصية، والناتج الشخصية (بمكان صورتها) بتعمل نفس الحركات وتقول نفس الكلام، مش بيبدّل شخص جوه الفيديو. موجود في زرار + ← Create video.' },
      { q: 'أقدر أبدّل الشخصية في فيديو صورته، وأبدّل أكتر من شخصية؟', a: 'فيه طريقتين: P-Video Animate بيخلّي الشخصية تعمل نفس حركات وكلام فيديوك (لحد 60 ثانية) في مكان صورتها هي؛ ولو عايز تبدّل الشخص جوه مشهد الفيديو وتحافظ على المكان والصوت الأصلي، انت بتختار من Wan 2.2 Animate Replace أو P-Video Replace أو Kling 3.0 Omni (شخص واحد، لحد 30 ثانية، وKling من 3 لـ 10 ثواني)، ولو أكتر من شخص أو تحوّل في الشكل بيستخدم Seedance 2.5 (الحركة قريبة مش مطابقة والأصوات بتتولد من جديد، والسعر أعلى).' },
      { q: 'إيه اللي بتعمله صفحة قنواتي؟', a: 'بتربط قناتك عن طريق VidIQ ويقترح عليك Erivion فيديو كل يوم، وبعد موافقتك بيجيلك إيميل لما الفكرة والصورة المصغرة والعنوان والوصف والكلمات المفتاحية تجهز — وانت اللي بترفعها على قناتك.' },
      { q: 'كيف أصنع فيديو؟', a: 'اكتب فكرتك أو نصك في صفحة الإنشاء، اختر المدة والصوت، ثم اضغط Generate Scenes. بعدها راجع المشاهد واضغط Render Video لتوليد الفيديو النهائي.' },
      { q: 'ما الفرق بين النماذج المختلفة؟', a: 'كل موديل له طريقة توليد مختلفة: من صور AI ثابتة، لفيديو حقيقي بالذكاء الاصطناعي، لفيديو سينمائي بشخصيات ثابتة، وصولًا لإعلانات فيديو كاملة من صورة منتج واحدة.' },
      { q: 'ما هو الكريديت وكيف يُحسب؟', a: 'الكريديت هو وحدة قياس استخدام المنصة الموحّدة، وبيتصرف على أي موديل تختاره حسب تكلفة توليد الفيديو.' },
      { q: 'كيف أدفع؟', a: 'المستخدمون المصريون يدفعون عن طريق InstaPay، والمستخدمون الدوليون عن طريق Gumroad بالبطاقة مباشرة.' },
      { q: 'هل تدعم المنصة اللغة العربية؟', a: 'نعم، Erivion تدعم اللغة العربية بالكامل، بأصوات متعددة (مصري، خليجي، فصحى) وكابشن من اليمين لليسار.' },
      { q: 'ما هو برنامج الشراكة؟', a: 'يمكنك ربح 20% من قيمة أي عملية شحن كريديت تتم من خلال رابط الإحالة الخاص بك.' },
    ],
  },
};

// ✅ FIX: وسوم التحقق من ملكية الدومين لازم تكون موجودة في الـHTML اللي بيشوفه البوت كمان — كروالر ميتا (facebookexternalhit /
// Meta-ExternalAgent) وبينج وTrustpilot بيعدّوا على الـUser-Agent regex اللي فوق فبياخدوا صفحة renderBotHTML مش index.html،
// ولو الوسوم دي مش فيها التحقق بيفشل ("لا يمكن التحقق من النطاق") مع إن الوسم موجود في index.html. بنقراها من نفس مصدر الحقيقة
// (frontend/index.html) عشان أي توكن يتغيّر هناك يتحدّث هنا لوحده.
const DOMAIN_VERIFICATION_METAS = (() => {
  for (const f of [['dist', 'index.html'], ['frontend', 'dist', 'index.html'], ['frontend', 'index.html']]) {
    try {
      const html = fs.readFileSync(join(__dirname, '..', ...f), 'utf8');
      const tags = (html.match(/<meta\s+name="(?:facebook-domain-verification|msvalidate\.01|trustpilot-one-time-domain-verification-id|google-site-verification)"[^>]*>/g) || []).join('\n');
      if (tags) return tags;
    } catch { /* جرّب المسار اللي بعده */ }
  }
  return '';
})();

function renderBotHTML(pageData, path) {
  const canonical = `${SITE_URL}${path === '/' ? '' : path}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Erivion',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: pageData.description,
    offers: { '@type': 'Offer', priceCurrency: 'USD', price: '0', description: 'Free trial credits on signup' },
  };
  const schemas = [jsonLd];
  if (pageData.faqItems?.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: pageData.faqItems.map(item => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    });
  }
  const bodyHtml = pageData.body.map(p => `<p>${p}</p>`).join('\n');
  const navLinks = Object.keys(SEO_PAGES).map(p => `<a href="${SITE_URL}${p === '/' ? '' : p}">${SEO_PAGES[p].h1}</a>`).join(' | ');
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${pageData.title}</title>
<meta name="description" content="${pageData.description}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${pageData.title}">
<meta property="og:description" content="${pageData.description}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Erivion">
<meta name="twitter:card" content="summary">
${DOMAIN_VERIFICATION_METAS}
${schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n')}
</head>
<body>
<h1>${pageData.h1}</h1>
${bodyHtml}
<nav>${navLinks}</nav>
</body>
</html>`;
}

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  const ua = req.headers['user-agent'] || '';
  if (!BOT_UA_REGEX.test(ua)) return next();
  if (SEO_PAGES[req.path]) {
    return res.type('html').send(renderBotHTML(SEO_PAGES[req.path], req.path));
  }
  // ── مقالات المدونة الفردية (/blog/{id}) ──
  const blogMatch = req.path.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch) {
    const article = BLOG_ARTICLES.find(a => a.id === blogMatch[1]);
    if (article) {
      return res.type('html').send(renderBotHTML({ title: `${article.title} — Erivion Blog`, description: article.summary, h1: article.title, body: [article.summary] }, req.path));
    }
  }
  next();
});

// robots.txt — بترحّب صراحة بكل بوتات الـ AI والبحث المعروفة
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml`);
});

// sitemap.xml — كل الصفحات الحقيقية + كل مقال مدونة لوحده، عشان جوجل يقدر يفهرسهم كلهم
// تاريخ آخر تحديث جوهري للموقع — حدّثه مع كل ميزة جديدة عشان جوجل يعيد الزحف
const SITE_LASTMOD = '2026-10-09';
const SITEMAP_PRIORITY = { '/': '1.0', '/pricing': '0.9', '/documentary': '0.9', '/faq': '0.8', '/blog': '0.8', '/changelog': '0.7', '/api-docs': '0.7' };
app.get('/sitemap.xml', (req, res) => {
  const entry = (loc, { priority = '0.6', freq = 'monthly' } = {}) => `  <url><loc>${loc}</loc><lastmod>${SITE_LASTMOD}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`;
  const FREQ = { '/': 'weekly', '/changelog': 'weekly', '/roadmap': 'weekly', '/status': 'daily', '/blog': 'weekly' };
  const staticUrls = Object.keys(SEO_PAGES).map(p => entry(`${SITE_URL}${p === '/' ? '' : p}`, { priority: SITEMAP_PRIORITY[p] || '0.6', freq: FREQ[p] || 'monthly' }));
  const blogUrls = BLOG_ARTICLES.map(a => entry(`${SITE_URL}/blog/${a.id}`, { priority: '0.6' }));
  const urls = [...staticUrls, ...blogUrls].join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
});

// ✅ NEW: llms.txt — معيار ناشئ لملخص موجّه لطبقات الذكاء الاصطناعي (Claude/ChatGPT/Gemini
// وغيرهم) اللي بتزحف على الموقع، منفصل عن robots.txt/sitemap.xml اللي هما أساسًا لمحركات
// البحث التقليدية. بيتحدث يدويًا هنا لما نضيف ميزة جوهرية جديدة — نفس فكرة SEO_PAGES بالظبط
app.get('/llms.txt', (req, res) => {
  res.type('text/plain').send(`# Erivion

> منصة عربية لإنشاء فيديوهات احترافية بالذكاء الاصطناعي من فكرة نصية، سكريبت جاهز، أو صورة منتج — بدون خبرة مونتاج.

Erivion (${SITE_URL}) موقع سعودي-مصري بيشغّل مساعد محادثة ذكي (AI Agent) يفهم طلب العميل بالعربي أو الإنجليزي، ويختار تلقائيًا أنسب محرك ذكاء اصطناعي حقيقي لكل خطوة (توليد صور، تحريك فيديو، تعديل فيديو، سرد صوتي، كابشن، موسيقى)، وينشئ الفيديو كامل معاه مباشرة داخل المحادثة.

## المحركات الحقيقية المستخدمة
- توليد الصور: Nano Banana 2، Nano Banana Pro، Seedream، GPT-Image 2، وغيرهم
- تحريك الصور لفيديو سينمائي: Veo 3، Seedance، Kling، PixVerse، Luma Ray 2
- تعديل فيديو موجود بتعليمات نصية: Gemini Omni Flash
- سرد صوتي حقيقي متزامن مع كل مشهد، كابشن تلقائي، وموسيقى خلفية بدون حقوق ملكية

## إدارة قنوات يوتيوب تلقائيًا (My Channels)
اربط قناة يوتيوب حقيقية عبر VidIQ واحصل على فكرة فيديو جديدة يوميًا مبنية على بيانات القناة الفعلية. أنواع محتوى متعددة (قصص برسوم بالذكاء الاصطناعي، لقطات واقعية، شخصية ثابتة تعيش مغامرة كل حلقة، سكتش سبورة بيضاء، فيديوهات خرائط/جغرافيا). العميل يختار موديل الصور والتحريك بنفسه ويشوف السعر قبل التوليد. مع كل فيديو بيتجهز: صورة مصغرة وعنوان ووصف وكلمات مفتاحية، وصاحب القناة هو اللي يرفعه بنفسه — Erivion مش بتنشر على يوتيوب نيابةً عنه.

## استوديو الأفلام الوثائقية والمونتاج
- فيلم وثائقي كامل من موضوع أو سكريبت أو تعليق صوتي: لقطات أرشيفية وحقيقية من مصادر عامة (NASA، Wikimedia Commons، Internet Archive، Pexels)، موشن جرافيك، خرائط، لوحات صور، وكابشن. أفلام أفقية لحد 30 دقيقة وشورتس رأسي لحد 3 دقايق (${SITE_URL}/documentary)
- مونتاج ذكي لفيديوهات العميل داخل شات المساعد: لحد 20 فيديو + تعليق صوتي + صور أو فيديو كمرجع لستايل الموشن جرافيك. المساعد يفهم المشاهد ويخطط المونتاج حسب رغبة العميل (انتقالات بس، تزامن مع الصوت، مونتاج صنّاع محتوى بجرافيكس ومشاهد 3D بتحل مكان لقطات والصوت الأصلي بيكمّل، مستوى مؤثرات صوتية، كابشن بلغة الكلام الفعلية)
- تحريك صورة بحركة فيديو (P-Video Animate): فيديو بحركة وكلام + صورة شخصية = الشخصية بمكان صورتها بنفس الأداء (مش بيبدّل شخص جوه الفيديو)
- استوديو الشخصيات: شخصيات محفوظة تُستخدم في أي فيديو من الشات، وشخصيات جاهزة، وقوالب ترند يبدّل فيها العميل الشخصية بشخصيته
- إعلان منتج من صورة واحدة: المساعد يتعرف على المنتج ويرشّح محرك (Wan 3.0، Seedance 2.5، Gemini Omni Flash 1.1) بتعليق صوتي مدمج بعد موافقة العميل على الخطة والسعر
- في My Channels: فكرة يومية بعد موافقة العميل، وإيميل لما الفكرة والصورة المصغرة (Nano Banana 2.1) والعنوان والوصف والكلمات المفتاحية تجهز

## ميزات إضافية
- مساعد ذكي بذاكرة (بيفتكر طلبات العميل السابقة) وبحث ويب حقيقي عن معلومات/أحداث بمصادر حقيقية
- استنساخ صوت العميل (Voice Cloning) — متاح حاليًا على محركات التوليد الكلاسيكية، مش مفعّل لسه على المحركات الجديدة فوق (Veo/Seedance/Kling)

## التسعير
نظام كريديت موحّد يشتغل على كل المحركات — باقات مرنة بالجنيه المصري (InstaPay) للمستخدمين المصريين، وباقات ثابتة بالدولار (Gumroad) للمستخدمين الدوليين. التفاصيل: ${SITE_URL}/pricing

## روابط أساسية
- الأسئلة الشائعة: ${SITE_URL}/faq
- الأسعار: ${SITE_URL}/pricing
- إيه الجديد: ${SITE_URL}/changelog
- الخطة القادمة: ${SITE_URL}/roadmap
- ربط MCP/API: ${SITE_URL}/api-docs
- المدونة: ${SITE_URL}/blog
- من نحن: ${SITE_URL}/about
- شروط الخدمة: ${SITE_URL}/terms
- سياسة الخصوصية: ${SITE_URL}/privacy
`);
});

app.use(express.static(join(__dirname, '..', 'dist')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API endpoint not found' });
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});


const server = app.listen(PORT, () => {
  console.log('AI Video Backend running on http://localhost:' + PORT);
});

// استكمال توليدات الفيديو اللي السيرفر القديم مات وسطها (deploy/restart): نفس الـprediction، ولو فشل نرجّع الكريديت
startVideoJobRecovery({
  persistVideo: persistNewModelVideo,
  refund: (userId, cost) => addCreditsBalance(userId, cost),
  friendlyError: friendlyVideoError,
  onDone: (row) => logGeneration({ userId: row.user_id, kind: 'video', modelKey: row.model, creditCost: row.credit_cost }),
});

// ── القناة اليومية: بنفحص كل ساعة مين مستحق (آخر تشغيل من أكتر من 20 ساعة) —
// نفس أسلوب setInterval المستخدم في باقي مهام التنظيف الدورية في المشروع ──────────
setTimeout(() => runDailyChannelCheck().catch(e => console.warn('[ChannelScheduler]', e.message)), 30_000);
setInterval(() => runDailyChannelCheck().catch(e => console.warn('[ChannelScheduler]', e.message)), 60 * 60 * 1000);

// ── Disable timeouts for long video renders ──────────────────────────────────
// Railway/reverse proxies have their own idle timeouts — we set Node's to 0
// (unlimited) so a 10-min render doesn't get cut mid-way.
server.timeout = 0;               // socket inactivity timeout
server.keepAliveTimeout = 0;      // keep-alive timeout
server.headersTimeout = 0;        // time to receive full headers