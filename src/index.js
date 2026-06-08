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
import { generateVoiceover, VOICE_OPTIONS } from './services/voiceService.js';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join as pathJoin } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── renderVideoInWorker: runs FFmpeg in a separate process ─────────────────
function renderVideoInWorker(job) {
  return new Promise((resolve, reject) => {
    const worker = fork(pathJoin(__dirname, 'renderWorker.js'), [], {
      stdio: 'inherit',   // worker logs go to same Railway log stream
      execArgPath: process.execPath,
    });
    worker.on('message', (msg) => {
      if (msg.success) resolve(msg.videoPath);
      else reject(new Error(msg.error || 'Worker render failed'));
    });
    worker.on('error', (err) => reject(err));
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
    worker.send(job);
  });
}
import { generateAllAIScenes } from './services/aiVideoService.js';
import { renderModel3Video } from './services/stabilityService.js';
import { renderModel4Video, renderModel5Video } from './services/seedanceService.js';
import authRouter, { authMiddleware } from './services/authRoutes.js';
import { getUserById, PLANS, canUserRender, getUserCredits, canUserMakeModel3Video, incrementModel3Video, canUserMakeModel4Video, incrementModel4Video, getModel4Usage, MODEL4_PLANS, markModel4TrialUsed, markModel3TrialUsed, canUserMakeModel5Video, incrementModel5Video, getModel5Usage, MODEL5_PLANS } from './services/authService.js';
import adminRouter from './services/adminRoutes.js';
import { transcribeAudio } from './services/transcribeService.js';
import affiliateRouter from './services/affiliateRoutes.js';
import mapVideoRouter from './services/mapVideoRoutes.js';
import wanVideoRouter from './services/wanVideoRoutes.js';
import pgPkg from 'pg';
const { Pool: _TPool } = pgPkg;

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const renderJobs = new Map();

// ── Concurrent Render Limiter ─────────────────────────────────────────────────
const MAX_CONCURRENT_RENDERS = 1;
let activeRenderCount = 0;

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
app.use('/outputs/templates', express.static(join(process.cwd(), 'outputs', 'templates')));
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin', adminRouter);

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const { rows } = await pool.query(
      `UPDATE users
       SET weekly_credits_used = 0,
           videos_this_week = 0,
           last_reset_at = NOW()
       WHERE email = $1
       RETURNING email, plan`,
      [email]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    console.log(`[Admin] Credits reset for ${email} by admin ${adminUser.email}`);
    res.json({ success: true, message: `Credits reset for ${rows[0].email}` });
  } catch (err) {
    console.error('[Admin] Reset credits error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/affiliate', affiliateRouter);
app.use('/api/map-video', mapVideoRouter);
app.use('/api/wan-video', wanVideoRouter);

// ── Transcribe ─────────────────────────────────────────────────────────────
app.post('/api/transcribe', authMiddleware, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Audio file required' });
  const MAX_SIZE = 25 * 1024 * 1024;
  if (req.file.size > MAX_SIZE) return res.status(400).json({ error: 'File too large. Max size is 25MB.' });
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
  try {
    const user = await getUserById(req.user.userId);
    const planData = PLANS[user?.plan || 'free'];
    const DURATION_LIMITS = {
      free: ['30s', 'auto'],
      pro:  ['30s', 'auto', '1min', '2min'],
      plus: ['30s', 'auto', '1min', '2min', '3min', '4min', '5min'],
      max:  ['30s', 'auto', '1min', '2min', '3min', '4min', '5min', '8min', '10min'],
    };
    const allowedDurations = DURATION_LIMITS[user?.plan || 'free'] || DURATION_LIMITS.free;
    if (duration && !allowedDurations.includes(duration)) {
      return res.status(403).json({ error: `Your plan does not support ${duration} duration.` });
    }
    if (!planData.all_languages && videoLanguage) {
      const allowed = planData.languages || ['en', 'ar'];
      if (!allowed.includes(videoLanguage)) {
        return res.status(403).json({ error: `Your plan only supports: ${allowed.join(', ')}.` });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check plan: ' + err.message });
  }
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
  const { text, voice, videoType, speed, videoLanguage } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const audioPath = await generateVoiceover(text, voice || 'male_american', videoType || 'education', speed || 0, videoLanguage || 'en');
    res.json({ audioUrl: '/outputs/' + audioPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, audioUrl, ratio, jobId, duration, music, captions, transitions, soundEffects, videoType, captionStyle, musicVolume, sfxVolume, videoEffect } = req.body;
  const renderJobId = String(jobId || Date.now());
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  try {
    const user = await getUserById(req.user.userId);
    const planData = PLANS[user?.plan || 'free'];
    const renderCheck = await canUserRender(req.user.userId);
    if (!renderCheck.allowed) {
      const credits = await getUserCredits(req.user.userId);
      const now = new Date();
      const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
      const nextSat = new Date(now);
      nextSat.setDate(now.getDate() + daysUntilSat);
      const resetDate = nextSat.toLocaleDateString('en-GB', { weekday: 'long', month: 'long', day: 'numeric' });
      const isMaxPlan = user?.plan === 'max';
      const planName = planData.name;
      if (renderCheck.reason === 'credits_exhausted') {
        if (isMaxPlan) return res.status(403).json({ error: 'credits_exhausted', message: `You've used all your ${credits.limit.toLocaleString()} credits this week. Resets on ${resetDate}.`, reset_date: resetDate, action: 'resubscribe', plan: user?.plan });
        return res.status(403).json({ error: 'credits_exhausted', message: `You've used all your weekly credits on the ${planName} plan. Resets on ${resetDate}.`, reset_date: resetDate, action: 'upgrade_or_wait', plan: user?.plan });
      }
      if (renderCheck.reason === 'videos_limit_reached') {
        if (isMaxPlan) return res.status(403).json({ error: 'videos_limit_reached', message: `You've reached your video limit this week. Resets on ${resetDate}.`, reset_date: resetDate, action: 'resubscribe', plan: user?.plan });
        return res.status(403).json({ error: 'videos_limit_reached', message: `You've reached your ${credits.videos_limit} videos/week limit on the ${planName} plan.`, reset_date: resetDate, action: 'upgrade_or_wait', plan: user?.plan });
      }
    }
    if (soundEffects && !planData.sound_effects) return res.status(403).json({ error: 'Sound effects require Plus plan or higher.' });
    if (videoEffect && videoEffect !== 'none' && !planData.video_effects) return res.status(403).json({ error: 'Video effects require Max plan.' });
    const applyWatermark = planData.watermark !== false;
    // ── Concurrency Check ────────────────────────────────────────────────────
    if (activeRenderCount >= MAX_CONCURRENT_RENDERS) {
      return res.status(429).json({ error: 'server_busy', message: 'السيرفر مشغول بفيديو آخر حالياً. انتظر دقيقة وحاول مرة أخرى.' });
    }

    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing' });
    (async () => {
      activeRenderCount++;
      console.log(`[Render] Active renders: ${activeRenderCount}`);
      try {
        const videoPath = await renderVideoInWorker({ scenes, audioUrl, ratio, jobId: renderJobId, duration, music, captions, transitions, soundEffects, videoType: videoType || 'education', captionStyle: captionStyle || null, musicVolume: typeof musicVolume === 'number' ? musicVolume : 0.07, sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.4, videoEffect: videoEffect || 'none', applyWatermark, videoLanguage: req.body.videoLanguage || 'en' });
        setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
      } catch (jobErr) {
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
      } finally {
        activeRenderCount--;
        console.log(`[Render] Active renders after finish: ${activeRenderCount}`);
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
  let locationLock = '';
  if (isIdeaMode && idea) {
    try {
      const extractRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', max_tokens: 300, temperature: 0.3,
          messages: [
            { role: 'system', content: 'Extract visual consistency info. Output ONLY JSON: {"characters":"...","location":"..."}. English only. Be concise.' },
            { role: 'user', content: `Video idea: "${idea}"\n\nExtract:\n- characters: physical appearance of main characters (clothing, age, look) max 25 words\n- location: main setting/environment max 15 words\nIf generic topic with no specific character/place, use ""\n\nJSON only:` }
          ]
        }),
      });
      const extractData = await extractRes.json();
      const extractRaw = (extractData.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      try { const ex = JSON.parse(extractRaw); characterLock = ex.characters || ''; locationLock = ex.location || ''; } catch {}
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
        const charBlock = characterLock ? `\nCHARACTER (include in EVERY prompt verbatim): ${characterLock}` : '';
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

        systemPrompt = `You are an elite documentary scriptwriter and visual director. You write professional narration with perfect story flow, zero repetition, and cinematic visual direction. Output ONLY a raw JSON array. "prompt" MUST be English only. No markdown, no extra text.`;

        userPrompt = `VIDEO TOPIC: "${idea}"
VISUAL STYLE: ${styleHint}${charBlock}${locBlock}
TOTAL SCENES: ${imageCount} | THIS BATCH: scenes ${batchStart}–${batchEnd}
${allScenes.length > 0 ? `STORY SO FAR — DO NOT REPEAT ANY OF THESE IDEAS:\n` + allScenes.map(s => `Scene ${s.index}: ${s.text}`).join('\n') + `\n\nCONTINUE chronologically from where scene ${batchStart - 1} ended. Cover NEW story events only.` : ''}

SCENE TYPE RULES:
${typeRules.join('\n')}
${hookGuide}
"text" RULES (spoken narration in ${lang === 'ar' ? 'Arabic — فصيح وسلس، أسلوب وثائقي احترافي' : lang === 'ar_eg' ? 'Egyptian Arabic — اكتب بالعامية المصرية، كلمات زي: إيه ده دي عشان بقى أهو يعني' : lang === 'ar_gulf' ? 'Gulf Arabic — اكتب باللهجة الخليجية، كلمات زي: وش كيف ليش زين هالشي ترا' : lang}):
- What a documentary narrator SAYS OUT LOUD — full emotional sentences
- Each scene ADVANCES the story — never repeat what was said before
- Historical content: maintain CORRECT chronological order
- Build emotional arc: curiosity → engagement → climax → resolution
- NEVER describe the image — TELL the story

"prompt" RULES (English only, 40-55 words):
- Cinematic AI image generation: subject + action + environment + lighting + camera angle + style
${characterLock ? `- MUST include character: "${characterLock}"` : ''}
${locationLock ? `- MUST include location: "${locationLock}"` : ''}
- Each prompt visually DISTINCT from others — show progression
- Be specific and vivid, no abstract words

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

        systemPrompt = `You are an expert video scene splitter. Split the script faithfully into scenes. Output ONLY a raw JSON array. "prompt" MUST be English only.`;

        userPrompt = `SCRIPT PORTION:
"${portion}"

VISUAL STYLE: ${styleHint}
SPLIT INTO EXACTLY ${batchCount} SCENES (numbered ${batchStart} to ${batchEnd})

"text": EXACT script text for this scene — preserve original language (${lang}), do NOT paraphrase or summarize
"prompt": English ONLY, 40-55 words — cinematic AI image generation prompt
  - subject + action + environment + lighting + camera angle + ${styleHint}
  - Match the scene content visually
  - Each scene prompt visually distinct

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
  const { scenes, audioUrl, ratio, captions, music, videoLanguage, duration } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const quotaCheck = await canUserMakeModel3Video(req.user.userId, duration || '1min');
  if (!quotaCheck.allowed) {
    return res.status(403).json({
      error: quotaCheck.reason,
      message: quotaCheck.reason === 'quota_exceeded'
        ? `You've used all your ${duration} videos (${quotaCheck.used}/${quotaCheck.quota}). Subscribe again to continue.`
        : quotaCheck.reason === 'no_access'
        ? 'subscribe_required'
        : `${duration} is not available on your plan.`,
      show_upgrade: true,
    });
  }
  const renderJobId = String(Date.now());
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing', is_trial: quotaCheck.is_trial || false });
  (async () => {
    try {
      const videoPath = await renderModel3Video({ scenes, audioUrl, ratio: ratio || '16:9', jobId: renderJobId, duration: duration || '1min', captions: captions || false, transitions: false, music: music || false, videoLanguage: videoLanguage || 'en' });
      if (quotaCheck.is_trial) {
        await markModel3TrialUsed(req.user.userId);
      } else {
        await incrementModel3Video(req.user.userId, duration || '1min');
      }
      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), is_trial: quotaCheck.is_trial || false });
    } catch (jobErr) {
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
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
  const { idea, script, inputMode, sceneCount, videoLanguage } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });
  const lang = videoLanguage || 'en';
  const styleHint = 'cinematic, photorealistic, dramatic lighting, no text overlays, no watermarks';
  const BATCH_SIZE = 5;
  const allScenes = [];
  const totalBatches = Math.ceil(sceneCount / BATCH_SIZE);

  // استخلاص وصف الشخصيات والأماكن من الـ idea تلقائياً
  let characterLock = '';
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
            { role: 'system', content: 'Extract visual consistency info. Output ONLY JSON: {"characters":"...","location":"..."}. English only. Be concise.' },
            { role: 'user', content: `Video idea: "${idea}"\n\nExtract:\n- characters: physical appearance of main characters (clothing, age, look) max 25 words\n- location: main setting/environment max 15 words\nIf generic topic with no specific character/place, use ""\n\nJSON only:` }
          ]
        }),
      });
      const extractData = await extractRes.json();
      const extractRaw = (extractData.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
      try { const ex = JSON.parse(extractRaw); characterLock = ex.characters || ''; locationLock = ex.location || ''; } catch {}
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
        const charBlock = characterLock ? `\nCHARACTER (include in EVERY prompt verbatim): ${characterLock}` : '';
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

        systemPrompt = `You are an elite documentary scriptwriter and cinematic video director. You write professional narration with perfect story flow, zero repetition, and vivid cinematic direction for AI video generation. Output ONLY a raw JSON array. "prompt" MUST be English only. No markdown, no extra text.`;

        userPrompt = `VIDEO TOPIC: "${idea}"
VISUAL STYLE: ${styleHint}${charBlock}${locBlock}
TOTAL SCENES: ${sceneCount} | THIS BATCH: scenes ${batchStart}–${batchEnd}
${allScenes.length > 0 ? `STORY SO FAR — DO NOT REPEAT ANY OF THESE IDEAS:\n` + allScenes.map(s => `Scene ${s.index}: ${s.text}`).join('\n') + `\n\nCONTINUE chronologically from where scene ${batchStart - 1} ended. Cover NEW story events only.` : ''}

SCENE TYPE RULES:
${typeRules.join('\n')}
${hookGuide}
"text" RULES (spoken narration in ${lang === 'ar' ? 'Arabic — فصيح وسلس، أسلوب وثائقي احترافي' : lang === 'ar_eg' ? 'Egyptian Arabic — اكتب بالعامية المصرية، كلمات زي: إيه ده دي عشان بقى أهو يعني' : lang === 'ar_gulf' ? 'Gulf Arabic — اكتب باللهجة الخليجية، كلمات زي: وش كيف ليش زين هالشي ترا' : lang}):
- What a documentary narrator SAYS OUT LOUD — full emotional sentences
- Each scene ADVANCES the story — never repeat what was said before
- Historical content: maintain CORRECT chronological order of events
- Build emotional arc: curiosity → engagement → climax → resolution
- NEVER describe visuals — TELL the story

"prompt" RULES (English only, 30-45 words — for AI VIDEO generation):
- Describe a MOVING SCENE: subject + action/motion + environment + lighting + camera movement
- ${styleHint}
${characterLock ? `- MUST include character: "${characterLock}"` : ''}
${locationLock ? `- MUST include location: "${locationLock}"` : ''}
- Each prompt visually DISTINCT — show story progression through motion
- Think: camera slowly pans, character walks, wind moves trees — dynamic not static
- No text, no watermarks, no UI elements in scene

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

        systemPrompt = `You are an expert video scene splitter for AI video generation. Split script faithfully. Output ONLY a raw JSON array. "prompt" MUST be English only.`;

        userPrompt = `SCRIPT PORTION:
"${portion}"

SPLIT INTO EXACTLY ${batchCount} SCENES (numbered ${batchStart} to ${batchEnd})

"text": EXACT script text for this scene — preserve original language (${lang}), do NOT paraphrase
"prompt": English ONLY, 30-45 words — cinematic AI VIDEO generation prompt
  - Describe MOTION/ACTION: subject + movement + environment + lighting + camera
  - ${styleHint}
  - Match scene content visually, each prompt distinct

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
  const { scenes, audioUrl, ratio, captions, music, videoLanguage, duration, inputMode } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const quotaCheck = await canUserMakeModel4Video(req.user.userId, duration || '30s');
  if (!quotaCheck.allowed) {
    return res.status(403).json({
      error: quotaCheck.reason,
      message: quotaCheck.reason === 'quota_exceeded'
        ? `You've used all your videos for this plan. Please subscribe to a new plan to continue.`
        : quotaCheck.reason === 'plan_not_support'
        ? `${duration} videos are not available on your plan. Upgrade to unlock.`
        : 'subscribe_required',
      show_upgrade: true,
    });
  }
  const renderJobId = String(Date.now());
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing' });
  (async () => {
    try {
      let finalAudioUrl = audioUrl;
      if (!audioUrl && scenes?.length > 0) {
        try {
          const fullText = scenes.map(s => s.text).filter(Boolean).join(' ');
          if (fullText.trim()) {
            const voiceKey = videoLanguage === 'ar' ? 'male_arabic' : 'male_american';
            const maxAudioSeconds = (scenes.length * 7) - 2;
            const maxWords = Math.floor(maxAudioSeconds * 2.5);
            const words = fullText.trim().split(/\s+/);
            const trimmedText = words.length > maxWords ? words.slice(0, maxWords).join(' ') : fullText.trim();
            console.log(`[Model4] Text: ${words.length} words trimmed to ${trimmedText.split(/\s+/).length} (max ${maxWords} for ${maxAudioSeconds}s)`);
            const audioFilename = await generateVoiceover(trimmedText, voiceKey, 'education', 0, videoLanguage || 'en');
            if (audioFilename) {
              finalAudioUrl = '/outputs/' + audioFilename;
              console.log(`[Model4] Voiceover generated: ${audioFilename}`);
            }
          }
        } catch (voiceErr) {
          console.warn('[Model4] Voiceover failed, continuing without audio:', voiceErr.message);
        }
      }
      const videoPath = await renderModel4Video({ scenes, audioUrl: finalAudioUrl, ratio: ratio || '16:9', jobId: renderJobId, captions: captions || false, music: music || false, videoLanguage: videoLanguage || 'en' });
      await incrementModel4Video(req.user.userId, duration || '30s');
      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
    } catch (jobErr) {
      console.error('[Model4 Render] Failed:', jobErr.message);
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
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
    const user = await getUserById(req.user.userId);
    const trialUsed = user?.model4_trial_used || 0;
    if (!user?.model4_access) return res.json({ access: false, trial_used: trialUsed });
    const usage = await getModel4Usage(req.user.userId);
    const plan = user.model4_plan || 'm4_plan1';
    const planData = MODEL4_PLANS[plan];
    res.json({ access: true, plan, planData, trial_used: trialUsed, usage: { videos_30s: usage.videos_30s || 0, videos_1min: usage.videos_1min || 0, videos_3min: usage.videos_3min || 0 }, quota: { videos_30s: planData?.videos_30s || 0, videos_1min: planData?.videos_1min || 0, videos_3min: planData?.videos_3min || 0 } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── Model 5 (Cinematic) Routes ────────────────────────────────────────────
app.post('/api/model5/generate-scenes', authMiddleware, async (req, res) => {
  const { idea, characters, duration, videoStyle, styleSuffix } = req.body;
  if (!idea) return res.status(400).json({ error: 'idea required' });
  const sceneCount = duration === '1min' ? 12 : duration === '30s' ? 6 : 3;

  // بناء وصف الشخصيات بشكل مفصل وثابت
  const characterDescs = (characters || []).filter(c => c.prompt?.trim());
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
⚠️ CRITICAL: Every single prompt MUST include the FULL character description above. Never abbreviate or omit it.` : '';

    const userPrompt = `CINEMATIC VIDEO: "${idea}"
STYLE: ${styleInstruction}${charSection}

Generate EXACTLY ${sceneCount} scenes. Each scene = 5 seconds of AI video, NO voiceover, pure visual storytelling.

PROMPT RULES (English only, 45-65 words per prompt):
1. STRUCTURE: [Character full description] + [specific action/motion] + [environment/setting] + [camera movement] + [lighting] + [style]
2. MOTION: Always describe movement — "slowly walks", "camera pulls back", "wind moves through hair", "turns and looks at camera"
3. CINEMATIC: Use film techniques — "rack focus", "slow motion", "golden hour light", "volumetric fog", "anamorphic lens flare"
4. CONSISTENCY: ${characterDescs.length > 0 ? 'Copy the EXACT character description from above into EVERY prompt without shortening' : 'Keep the same location/environment across all scenes'}
5. PROGRESSION: Each scene advances the story visually — show change, emotion, action building up
6. NO TEXT in frame, no watermarks, no UI elements

SCENE STRUCTURE:
- Scene 1: Establishing shot — introduce character/location dramatically
${sceneCount > 3 ? `- Scenes 2-${sceneCount - 1}: Action/story unfolds — build tension/emotion progressively` : '- Scenes 2+: Story unfolds with visual progression'}
- Scene ${sceneCount}: Powerful closing shot — memorable final image

"text": SHORT scene title (3-6 words, English), describes what happens visually

Output ONLY JSON array (${sceneCount} items):
[{"index":N,"prompt":"[Full cinematic Seedance prompt 45-65 words with character+action+setting+camera+lighting+style]","text":"Short scene title"},...]`;

    const scenes = await groqBatch(systemPrompt, userPrompt);
    if (!scenes || scenes.length === 0) throw new Error('No scenes generated');
    res.json({ scenes: scenes.slice(0, sceneCount) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/model5/render', authMiddleware, renderLimiter, async (req, res) => {
  const { scenes, ratio, duration } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const quotaCheck = await canUserMakeModel5Video(req.user.userId, duration || '30s');
  if (!quotaCheck.allowed) {
    return res.status(403).json({
      error: quotaCheck.reason,
      message: quotaCheck.reason === 'quota_exceeded'
        ? `You've used all your ${duration} videos for this plan.`
        : quotaCheck.reason === 'plan_not_support'
        ? `${duration} is not available on your plan.`
        : 'subscribe_required',
      show_upgrade: true,
    });
  }
  const renderJobId = String(Date.now());
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing' });
  (async () => {
    try {
      const videoPath = await renderModel5Video({ scenes, ratio: ratio || '9:16', jobId: renderJobId, duration: duration || '15s' });
      await incrementModel5Video(req.user.userId, duration || '30s');
      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
    } catch (jobErr) {
      setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
    } finally {
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
    const user = await getUserById(req.user.userId);
    if (!user?.model5_access) return res.json({ access: false });
    const usage = await getModel5Usage(req.user.userId);
    const plan = user.model5_plan || 'mc_starter';
    const planData = MODEL5_PLANS[plan];
    res.json({ access: true, plan, planData, usage: { videos_15s: usage.videos_15s || 0, videos_30s: usage.videos_30s || 0, videos_1min: usage.videos_1min || 0 }, quota: { videos_15s: planData?.videos_15s || 0, videos_30s: planData?.videos_30s || 0, videos_1min: planData?.videos_1min || 0 } });
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


app.listen(PORT, () => {
  console.log('AI Video Backend running on http://localhost:' + PORT);
});