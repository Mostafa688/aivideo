import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fs from 'fs';
import { generateScenesStream } from './services/scriptService.js';
import { fetchMediaForScene, resetUsedVideos, clearJobSet } from './services/mediaService.js';
import { generateVoiceover, generateVoiceoverPerScene, VOICE_OPTIONS } from './services/voiceService.js';
import { renderVideo } from './services/renderService.js';
import { generateAllAIScenes } from './services/aiVideoService.js';
import { renderModel3Video } from './services/stabilityService.js';
import { renderModel4Video, renderModel5Video } from './services/seedanceService.js';
import authRouter, { authMiddleware } from './services/authRoutes.js';
import { getUserById, PLANS, getUserCredits, chargeCredits, getCreditsBalance, MODEL12_CREDIT_COSTS, MODEL3_CREDIT_COSTS, MODEL4_CREDIT_COSTS, MODEL5_CREDIT_COSTS, MODEL5_CREDIT_COSTS_WITH_PHOTO, ADS_CREDIT_COST } from './services/authService.js';
import adminRouter from './services/adminRoutes.js';
import supportRouter from './services/supportRoutes.js';
import { transcribeAudio } from './services/transcribeService.js';
import affiliateRouter from './services/affiliateRoutes.js';
import mapVideoRouter from './services/mapVideoRoutes.js';
import wanVideoRouter from './services/wanVideoRoutes.js';
import adsRouter from './services/adsRoutes.js';
import agentRouter from './services/agentRoutes.js';
import pgPkg from 'pg';
const { Pool: _TPool } = pgPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const renderJobs = new Map();

// ── Render Limiter ────────────────────────────────────────────────────────────
let activeRenderCount = 0;
const MAX_CONCURRENT_RENDERS = 1;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
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
  skip: (req) => req.path === '/health',
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

app.use(generalLimiter);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
// ── sitemap.xml ───────────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://erivion.net/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://erivion.net/?page=pricing</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://erivion.net/?page=faq</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://erivion.net/?page=templates</loc><changefreq>weekly</changefreq><priority>0.7</priority></url>
</urlset>`);
});

// ── robots.txt ────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /outputs/

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: ClaudeBot
Allow: /

Sitemap: https://erivion.net/sitemap.xml`);
});

app.use('/api/support', supportRouter);


app.use('/api/affiliate', affiliateRouter);
app.use('/api/map-video', mapVideoRouter);
app.use('/api/wan-video', wanVideoRouter);
app.use('/api/ads', adsRouter);
app.use('/api/agent', agentRouter);

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

// GET /api/admin/community-questions — get posts flagged for support (admin only)
app.get('/api/admin/community-questions', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });

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
app.get('/api/admin/community-all', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });

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
app.post('/api/admin/community-reply', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });

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
app.delete('/api/admin/community-post/:id', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
    await cPool.query(`DELETE FROM community_posts WHERE id=$1`, [parseInt(req.params.id)]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/community-pending — get posts awaiting moderation
app.get('/api/admin/community-pending', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });

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
app.post('/api/admin/community-post/:id/approve', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
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
app.post('/api/admin/community-post/:id/reject', async (req, res) => {
  try {
    const secret = req.headers['x-admin-secret'];
    if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
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

// ── Sitemap ────────────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  const base = 'https://erivion.net';
  const now = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: `${base}/`,          priority: '1.0', changefreq: 'weekly'  },
    { loc: `${base}/pricing`,   priority: '0.9', changefreq: 'weekly'  },
    { loc: `${base}/login`,     priority: '0.8', changefreq: 'monthly' },
    { loc: `${base}/affiliate`, priority: '0.7', changefreq: 'monthly' },
    { loc: `${base}/cinematic`,  priority: '0.8', changefreq: 'weekly'  },
  ];
  const urlTags = urls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urlTags}
</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(sitemap);
});

// ── Robots.txt ─────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.header('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Allow: /pricing
Allow: /login
Allow: /affiliate
Allow: /cinematic
Disallow: /api/
Disallow: /outputs/
Disallow: /admin

Sitemap: https://erivion.net/sitemap.xml`);
});

app.post('/api/generate-scenes', authMiddleware, sceneLimiter, async (req, res) => {
  const { idea, script, tone, duration, mode, videoLanguage } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script is required' });
  // ✅ نظام الكريديت الموحد: أي مدة أو لغة متاحة للجميع — الكريديت هو القيد الوحيد، بيتفحص وقت الرندر
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (event, data) => { res.write('event: ' + event + '\n'); res.write('data: ' + JSON.stringify(data) + '\n\n'); };
  try {
    send('status', { message: 'Generating your script...' });
    await generateScenesStream({ idea, script, tone, duration, mode, userId: req.user.userId, videoLanguage }, send);
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
      const media = await fetchMediaForScene(scene.keywords, ratio || '16:9', currentJobId);
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

    activeRenderCount++;
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost });
    (async () => {
      try {
        const videoPath = await renderVideo({ scenes, audioUrl, ratio, jobId: renderJobId, duration, music, captions, transitions, soundEffects, videoType: videoType || 'education', captionStyle: captionStyle || null, musicVolume: typeof musicVolume === 'number' ? musicVolume : 0.07, sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.4, videoEffect: videoEffect || 'none', applyWatermark, videoLanguage: req.body.videoLanguage || 'en', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null });
        // ── خصم الكريديت من الرصيد الموحد بعد نجاح الفيديو ──
        try { await chargeCredits(req.user.userId, creditCost); } catch(e) { console.warn('[Render] Credit deduct failed:', e.message); }
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
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 6000, temperature: 0.7, messages: [{ role: 'user', content: editPrompt }] }),
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
  res.json({ creditCost: MODEL4_CREDIT_COSTS[duration] || 10, duration });
});
app.get('/api/model5/credit-cost', authMiddleware, (req, res) => {
  const { duration, hasPhoto } = req.query;
  const table = hasPhoto === 'true' ? MODEL5_CREDIT_COSTS_WITH_PHOTO : MODEL5_CREDIT_COSTS;
  res.json({ creditCost: table[duration] || 180, duration });
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

app.post('/api/model3/generate-scenes', authMiddleware, async (req, res) => {
  const { idea, script, inputMode, imageCount, videoLanguage, styleSuffix } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });
  const isIdeaMode = inputMode === 'idea';
  const styleHint = styleSuffix || 'cinematic photography, dramatic lighting, photorealistic';
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
          model: 'llama-3.3-70b-versatile', max_tokens: 300, temperature: 0.3,
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
        model: 'llama-3.3-70b-versatile', max_tokens: 3000, temperature: 0.7,
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
  const m3CreditCost = MODEL3_CREDIT_COSTS[duration] || 20;
  const m3Balance = await getCreditsBalance(req.user.userId);
  if (m3Balance < m3CreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m3CreditCost} credits, you have ${m3Balance}.`, cost: m3CreditCost, remaining: m3Balance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
  }
  const renderJobId = String(Date.now());
  activeRenderCount++;
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: m3CreditCost });
  (async () => {
    try {
      const videoPath = await renderModel3Video({ scenes, audioUrl, ratio: ratio || '16:9', jobId: renderJobId, duration: duration || '1min', captions: captions || false, transitions: false, music: music || false, videoLanguage: videoLanguage || 'en', videoStyle: videoStyle || 'cinematic', styleSuffix: styleSuffix || '', sceneDurations: Array.isArray(sceneDurations) ? sceneDurations : null });
      await chargeCredits(req.user.userId, m3CreditCost).catch(e => console.warn('[Model3] Credit deduct failed:', e.message));
      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
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
  const { idea, script, inputMode, sceneCount, videoLanguage, styleSuffix, videoStyle } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });
  const lang = videoLanguage || 'en';
  const styleHint = styleSuffix || 'cinematic, photorealistic, dramatic lighting, no text overlays, no watermarks';
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
          model: 'llama-3.3-70b-versatile', max_tokens: 300, temperature: 0.3,
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
        model: 'llama-3.3-70b-versatile', max_tokens: 3000, temperature: 0.7,
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
  const m4CreditCost = MODEL4_CREDIT_COSTS[duration] || 100;
  const m4Balance = await getCreditsBalance(req.user.userId);
  if (m4Balance < m4CreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m4CreditCost} credits, you have ${m4Balance}.`, cost: m4CreditCost, remaining: m4Balance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
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
      const videoPath = await renderModel4Video({ scenes, audioUrl: finalAudioUrl, ratio: ratio || '16:9', jobId: renderJobId, captions: captions || false, music: music || false, videoLanguage: videoLanguage || 'en', videoStyle: videoStyle || 'cinematic', styleSuffix: styleSuffix || '', sceneDurations: finalSceneDurations });
      await chargeCredits(req.user.userId, m4CreditCost).catch(e => console.warn('[Model4] Credit deduct failed:', e.message));
      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
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
app.post('/api/model5/generate-scenes', authMiddleware, async (req, res) => {
  const { idea, characters, duration, videoStyle, styleSuffix } = req.body;
  if (!idea) return res.status(400).json({ error: 'idea required' });
  const sceneCount = duration === '1min' ? 12 : duration === '30s' ? 6 : 1;

  // Separate characters with photos vs prompt-only
  const allChars = characters || [];
  const characterDescs = allChars.filter(c => c.prompt?.trim());
  const charsWithPhotos = allChars.filter(c => c.photo);

  const characterBlock = characterDescs.length > 0
    ? characterDescs.map((c, i) => `CHARACTER_${i + 1}: ${c.prompt.trim()}`).join('\n')
    : '';

  // الـ style suffix الكامل
  const styleInstruction = styleSuffix || 'cinematic photography, dramatic lighting, film grain, shallow depth of field, professional color grading';

  async function groqBatch(systemPrompt, userPrompt) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', max_tokens: 3000, temperature: 0.7,
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
    if (charsWithPhotos.length > 0) {
      const allPhotos = charsWithPhotos.map(c => c.photo).filter(Boolean);
      scenes = scenes.map((scene) => ({ ...scene, characterPhotos: allPhotos }));
      console.log(`[Model5] Attached all ${allPhotos.length} character photo(s) together to ${scenes.length} scenes`);
    }

    res.json({ scenes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/model5/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, ratio, duration, characterPhotos } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const m5User = await getUserById(req.user.userId);
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

  // ✅ نظام الكريديت الموحد: تكلفة أعلى شوية لو فيه صورة شخصية (رفرنس لكل مشهد)
  const costTable = photos.length > 0 ? MODEL5_CREDIT_COSTS_WITH_PHOTO : MODEL5_CREDIT_COSTS;
  const m5CreditCost = costTable[duration] || 65;
  const m5Balance = await getCreditsBalance(req.user.userId);
  if (m5Balance < m5CreditCost) {
    return res.status(403).json({ error: 'quota_exceeded', message: `This video needs ${m5CreditCost} credits, you have ${m5Balance}.`, cost: m5CreditCost, remaining: m5Balance });
  }
  if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
    return res.status(429).json({ error: 'server_busy', message: 'Server is busy rendering another video. Please wait a moment and try again.' });
  }

  const renderJobId = String(Date.now());
  activeRenderCount++;
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing', creditCost: m5CreditCost });
  (async () => {
    try {
      const videoPath = await renderModel5Video({ scenes: scenesWithPhotos, ratio: ratio || '9:16', jobId: renderJobId, duration: duration || '15s' });
      await chargeCredits(req.user.userId, m5CreditCost).catch(e => console.warn('[Model5] Credit deduct failed:', e.message));
      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
    } catch (jobErr) {
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
      activeRenderCount--;
      scheduleRenderJobCleanup(renderJobId);
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
    res.json({ access: true, credits_balance: balance, costs: MODEL5_CREDIT_COSTS, costs_with_photo: MODEL5_CREDIT_COSTS_WITH_PHOTO });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Global Error Handler ───────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: err.message || 'Internal server error' });
  next(err);
});

app.get('/favicon.png', (req, res) => { res.sendFile(join(__dirname, '..', 'dist', 'favicon.png')); });
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

const ADMIN_SECRET_TPL = process.env.ADMIN_SECRET || 'Sosa6892Midbok';

function templateAdminAuth(req, res, next) {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET_TPL) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

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

app.use(express.static(join(__dirname, '..', 'dist')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});


const server = app.listen(PORT, () => {
  console.log('AI Video Backend running on http://localhost:' + PORT);
});

// ── Disable timeouts for long video renders ──────────────────────────────────
// Railway/reverse proxies have their own idle timeouts — we set Node's to 0
// (unlimited) so a 10-min render doesn't get cut mid-way.
server.timeout = 0;               // socket inactivity timeout
server.keepAliveTimeout = 0;      // keep-alive timeout
server.headersTimeout = 0;        // time to receive full headers