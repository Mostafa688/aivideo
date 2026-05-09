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
import { renderVideo } from './services/renderService.js';
import { generateAllAIScenes } from './services/aiVideoService.js';
import { renderModel3Video } from './services/stabilityService.js';
import { renderModel4Video } from './services/seedanceService.js';
import authRouter, { authMiddleware } from './services/authRoutes.js';
import { getUserById, PLANS, canUserRender, getUserCredits, canUserMakeModel3Video, incrementModel3Video, canUserMakeModel4Video, incrementModel4Video, getModel4Usage, MODEL4_PLANS, markModel4TrialUsed } from './services/authService.js';
import adminRouter from './services/adminRoutes.js';
import { transcribeAudio } from './services/transcribeService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const renderJobs = new Map();

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
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://api.pexels.com", "https://api.groq.com", "https://api.anthropic.com", "https://api.replicate.com"],
      mediaSrc: ["'self'", "blob:"],
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
  // ✅ الـ fix: كل admin/approve routes مش بتتحول لـ JSON
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
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/admin', adminRouter);

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

app.get('/sitemap.xml', (req, res) => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://erivion.net/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url></urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(sitemap);
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
    setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
    res.status(202).json({ jobId: renderJobId, status: 'processing' });
    (async () => {
      try {
        const videoPath = await renderVideo({ scenes, audioUrl, ratio, jobId: renderJobId, duration, music, captions, transitions, soundEffects, videoType: videoType || 'education', captionStyle: captionStyle || null, musicVolume: typeof musicVolume === 'number' ? musicVolume : 0.07, sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.4, videoEffect: videoEffect || 'none', applyWatermark, videoLanguage: req.body.videoLanguage || 'en' });
        setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
      } catch (jobErr) {
        setRenderJob(renderJobId, { status: 'failed', error: jobErr.message || 'Render failed.', completedAt: Date.now() });
      } finally {
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
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 6000, messages: [{ role: 'user', content: editPrompt }] }),
    });
    const claudeData = await claudeRes.json();
    const textContent = claudeData.content?.find(c => c.type === 'text')?.text || '';
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

app.post('/api/model3/generate-scenes', authMiddleware, checkModel3Access, async (req, res) => {
  const { idea, script, inputMode, imageCount, videoLanguage, styleSuffix } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });
  const isIdeaMode = inputMode === 'idea';
  const styleHint = styleSuffix || 'cinematic photography, dramatic lighting, photorealistic';
  const BATCH_SIZE = 5;
  const allScenes = [];
  const totalBatches = Math.ceil(imageCount / BATCH_SIZE);
  async function groqBatch(batchPrompt) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 3000, temperature: 0.5, messages: [{ role: 'system', content: 'You are a JSON array generator. Output ONLY a raw JSON array. CRITICAL: "prompt" field MUST be in English only.' }, { role: 'user', content: batchPrompt }] }),
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
      let batchPrompt;
      if (isIdeaMode) {
        batchPrompt = `Video topic: "${idea}"\nStyle: ${styleHint}\n\nGenerate EXACTLY ${batchCount} scenes (numbered ${batchStart} to ${batchEnd}).\n- "index": starts from ${batchStart}\n- "prompt": ENGLISH ONLY, 30-50 words, style: ${styleHint}\n- "text": narration in ${videoLanguage}\n\nOutput ONLY JSON array:`;
      } else {
        const portion = script.slice(Math.floor((batchStart - 1) / imageCount * script.length), Math.floor(batchEnd / imageCount * script.length));
        batchPrompt = `Script: "${portion}"\nStyle: ${styleHint}\n\nSplit into EXACTLY ${batchCount} scenes (numbered ${batchStart} to ${batchEnd}).\n- "index": starts from ${batchStart}\n- "prompt": ENGLISH ONLY, 30-50 words\n- "text": from script, keep original language\n\nOutput ONLY JSON array:`;
      }
      let batchScenes = [];
      try { batchScenes = await groqBatch(batchPrompt); } catch(e) { console.warn(`[Model3] Batch ${b+1} failed:`, e.message); }
      if (Array.isArray(batchScenes) && batchScenes.length > 0) allScenes.push(...batchScenes);
    }
    if (allScenes.length === 0) throw new Error('No scenes returned from AI');
    res.json({ scenes: allScenes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/model3/render', authMiddleware, checkModel3Access, renderLimiter, async (req, res) => {
  const { scenes, audioUrl, ratio, captions, music, videoLanguage, duration } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });
  const quotaCheck = await canUserMakeModel3Video(req.user.userId, duration || '1min');
  if (!quotaCheck.allowed) {
    return res.status(403).json({
      error: quotaCheck.reason,
      message: quotaCheck.reason === 'quota_exceeded'
        ? `You've used all your ${duration} videos (${quotaCheck.used}/${quotaCheck.quota}).`
        : `${duration} is not available on your plan.`,
    });
  }
  const renderJobId = String(Date.now());
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing' });
  (async () => {
    try {
      const videoPath = await renderModel3Video({ scenes, audioUrl, ratio: ratio || '16:9', jobId: renderJobId, duration: duration || '1min', captions: captions || false, transitions: false, music: music || false, videoLanguage: videoLanguage || 'en' });
      await incrementModel3Video(req.user.userId, duration || '1min');
      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now() });
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
// بدون checkModel4Access — كل user يقدر يدخل، الـ canUserMakeModel4Video بتتحكم
app.post('/api/model4/generate-scenes', authMiddleware, async (req, res) => {
  const { idea, script, inputMode, sceneCount, videoLanguage } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });
  const styleHint = 'cinematic, photorealistic, dramatic lighting, no text';
  const BATCH_SIZE = 5;
  const allScenes = [];
  const totalBatches = Math.ceil(sceneCount / BATCH_SIZE);
  async function groqBatch(batchPrompt) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: 3000, temperature: 0.5, messages: [{ role: 'system', content: 'JSON array generator. CRITICAL: "prompt" MUST be English only.' }, { role: 'user', content: batchPrompt }] }),
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
      const isIdeaMode = inputMode === 'idea';
      let batchPrompt;
      if (isIdeaMode) {
        batchPrompt = `Video topic: "${idea}"\n\nGenerate EXACTLY ${batchCount} scenes (numbered ${batchStart} to ${batchEnd}).\n- "index": starts from ${batchStart}\n- "prompt": ENGLISH ONLY, cinematic video scene, no human faces, 20-40 words, style: ${styleHint}\n- "text": narration in ${videoLanguage || 'en'}\n\nOutput ONLY JSON array:`;
      } else {
        const portion = script.slice(Math.floor((batchStart - 1) / sceneCount * script.length), Math.floor(batchEnd / sceneCount * script.length));
        batchPrompt = `Script: "${portion}"\n\nSplit into EXACTLY ${batchCount} scenes (numbered ${batchStart} to ${batchEnd}).\n- "index": starts from ${batchStart}\n- "prompt": ENGLISH ONLY, 20-40 words, style: ${styleHint}\n- "text": from script, keep original language\n\nOutput ONLY JSON array:`;
      }
      let batchScenes = [];
      try { batchScenes = await groqBatch(batchPrompt); } catch (e) { console.warn(`[Model4] Batch ${b + 1} failed:`, e.message); }
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

  // التجربة المجانية = idea فقط — script و voice بتطلب اشتراك
  if (quotaCheck.is_trial && inputMode !== 'idea') {
    return res.status(403).json({
      error: 'trial_idea_only',
      message: 'Free trial is only available for Idea mode. Subscribe to use Script and Voice modes.',
      show_upgrade: true,
    });
  }

  const renderJobId = String(Date.now());
  setRenderJob(renderJobId, { status: 'processing', userId: req.user.userId, createdAt: Date.now(), error: null, videoUrl: null });
  res.status(202).json({ jobId: renderJobId, status: 'processing', is_trial: quotaCheck.is_trial || false });

  (async () => {
    try {
      // ── توليد الـ voiceover لو idea/script mode ────────────────────────
      let finalAudioUrl = audioUrl; // لو voice mode — استخدم الصوت المرفوع
      if (!audioUrl && scenes?.length > 0) {
        try {
          const fullText = scenes.map(s => s.text).filter(Boolean).join(' ');
          if (fullText.trim()) {
            const voiceKey = videoLanguage === 'ar' ? 'male_arabic' : 'male_american';

            // كل مشهد = 7 ثواني، الصوت max = (scenes × 7) - 2 ثانية
            // معدل الكلام ≈ 2.5 كلمة/ثانية
            const maxAudioSeconds = (scenes.length * 7) - 2;
            const maxWords = Math.floor(maxAudioSeconds * 2.5);
            const words = fullText.trim().split(/\s+/);
            const trimmedText = words.length > maxWords
              ? words.slice(0, maxWords).join(' ')
              : fullText.trim();
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

      const videoPath = await renderModel4Video({
        scenes,
        audioUrl: finalAudioUrl,
        ratio: ratio || '16:9',
        jobId: renderJobId,
        captions: captions || false,
        music: music || false,
        videoLanguage: videoLanguage || 'en',
      });

      if (quotaCheck.is_trial) {
        await markModel4TrialUsed(req.user.userId);
      } else {
        await incrementModel4Video(req.user.userId, duration || '30s');
      }

      setRenderJob(renderJobId, { status: 'done', videoUrl: '/outputs/' + videoPath, completedAt: Date.now(), is_trial: quotaCheck.is_trial || false });
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
      body: JSON.stringify({
        from: 'Erivion Model 4 <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `🎬 Model 4 Payment - ${planName} - ${userEmail}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#a855f7">🎬 New Model 4 Payment</h2><table style="width:100%;border-collapse:collapse;margin:20px 0"><tr><td style="color:#888;padding:8px 0">Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr><tr><td style="color:#888;padding:8px 0">Account</td><td style="color:#fff">${user.email}</td></tr><tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#a855f7;font-weight:700">${planName}</td></tr><tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr></table><div style="margin-top:24px;display:flex;gap:12px"><a href="${backendUrl}/api/auth/model4-approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a><a href="${backendUrl}/api/auth/model4-reject?email=${encodeURIComponent(userEmail)}&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a></div></div>`,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
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

    if (!user?.model4_access) {
      return res.json({ access: false, trial_used: trialUsed });
    }

    const usage = await getModel4Usage(req.user.userId);
    const plan = user.model4_plan || 'm4_plan1';
    const planData = MODEL4_PLANS[plan];
    res.json({
      access: true, plan, planData, trial_used: trialUsed,
      usage: { videos_30s: usage.videos_30s || 0, videos_1min: usage.videos_1min || 0, videos_3min: usage.videos_3min || 0 },
      quota: { videos_30s: planData?.videos_30s || 0, videos_1min: planData?.videos_1min || 0, videos_3min: planData?.videos_3min || 0 },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Credits endpoint ────────────────────────────────────────────────────────
// (موجود في authRoutes بس نضيف trial_used هنا للـ App.jsx)

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

app.use(express.static(join(__dirname, '..', 'dist')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API endpoint not found' });
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log('AI Video Backend running on http://localhost:' + PORT);
});