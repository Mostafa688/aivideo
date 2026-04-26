import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import { generateScenesStream } from './services/scriptService.js';
import { fetchMediaForScene, resetUsedVideos, clearJobSet } from './services/mediaService.js';
import { generateVoiceover, VOICE_OPTIONS } from './services/voiceService.js';
import { renderVideo } from './services/renderService.js';
import { generateAllAIScenes } from './services/aiVideoService.js';
import { renderModel3Video } from './services/stabilityService.js';
import authRouter, { authMiddleware } from './services/authRoutes.js';
import { getUserById, PLANS, canUserRender, getUserCredits } from './services/authService.js';

// ✅ FIX: __dirname و join لازم يتعرفوا هنا فوق قبل أي استخدام
const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;
const renderJobs = new Map();

// ✅ FIX: join متاحة دلوقتي
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
      connectSrc: ["'self'", "https://api.pexels.com", "https://api.groq.com", "https://api.anthropic.com"],
      mediaSrc: ["'self'", "blob:"],
      workerSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "data:", "https:"],
    }
  }
}));

// ✅ General limiter - 200 requests per 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a few minutes.' },
  skip: (req) => req.path === '/health',
});

// ✅ Auth limiter - stricter for login/signup only (not Google OAuth callback)
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
  skip: (req) => req.path === '/google/callback' || req.path === '/google',
});

// ✅ Render limiter - heavy endpoint
const renderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Render limit reached. Please wait before rendering again.' },
});

// ✅ Scene generation limiter
const sceneLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Scene generation limit reached. Please wait.' },
});

app.use(generalLimiter);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ FIX: Force all /api/* responses to be JSON (except admin HTML pages)
app.use('/api', (req, res, next) => {
  const isAdminRoute = req.path.includes('/admin/approve') || req.path.includes('/admin/reject');
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

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/voices', (req, res) => res.json({ voices: VOICE_OPTIONS }));

// ✅ Sitemap for Google Search Console
app.get('/sitemap.xml', (req, res) => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://erivion.net/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
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
      return res.status(403).json({ error: `Your plan does not support ${duration} duration. Upgrade to unlock longer videos.` });
    }
    if (!planData.all_languages && videoLanguage) {
      const allowed = planData.languages || ['en', 'ar'];
      if (!allowed.includes(videoLanguage)) {
        return res.status(403).json({ error: `Your plan only supports: ${allowed.join(', ')}. Upgrade to use more languages.` });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check plan: ' + err.message });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };

  try {
    send('status', { message: 'Generating your script...' });
    await generateScenesStream(
      { idea, script, tone, duration, mode, userId: req.user.userId, videoLanguage },
      send
    );
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
    const audioPath = await generateVoiceover(
      text,
      voice || 'male_american',
      videoType || 'education',
      speed || 0,
      videoLanguage || 'en',
    );
    res.json({ audioUrl: '/outputs/' + audioPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/render', authMiddleware, renderLimiter, async (req, res) => {
  const {
    scenes, audioUrl, ratio, jobId, duration,
    music, captions, transitions, soundEffects,
    videoType, captionStyle,
    musicVolume, sfxVolume, videoEffect,
  } = req.body;

  const renderJobId = String(jobId || Date.now());
  console.log('Render | Scenes:', scenes?.length, '| Ratio:', ratio, '| Duration:', duration, '| Effect:', videoEffect);
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
        if (isMaxPlan) {
          return res.status(403).json({
            error: 'credits_exhausted',
            message: `You've used all your ${credits.limit.toLocaleString()} credits this week. Your credits reset on ${resetDate}. You can re-subscribe to get credits immediately.`,
            reset_date: resetDate,
            action: 'resubscribe',
            plan: user?.plan,
          });
        }
        return res.status(403).json({
          error: 'credits_exhausted',
          message: `You've used all your ${credits.limit.toLocaleString()} weekly credits on the ${planName} plan. Your credits reset on ${resetDate}. Upgrade to a higher plan to get more credits now.`,
          reset_date: resetDate,
          action: 'upgrade_or_wait',
          plan: user?.plan,
        });
      }

      if (renderCheck.reason === 'videos_limit_reached') {
        if (isMaxPlan) {
          return res.status(403).json({
            error: 'videos_limit_reached',
            message: `You've reached your video limit this week. Your limit resets on ${resetDate}. You can re-subscribe to continue now.`,
            reset_date: resetDate,
            action: 'resubscribe',
            plan: user?.plan,
          });
        }
        return res.status(403).json({
          error: 'videos_limit_reached',
          message: `You've reached your ${credits.videos_limit} videos/week limit on the ${planName} plan. Your limit resets on ${resetDate}. Upgrade to a higher plan for more videos.`,
          reset_date: resetDate,
          action: 'upgrade_or_wait',
          plan: user?.plan,
        });
      }
    }

    if (soundEffects && !planData.sound_effects) {
      return res.status(403).json({ error: 'Sound effects require Plus plan or higher. Upgrade to unlock.' });
    }
    if (videoEffect && videoEffect !== 'none' && !planData.video_effects) {
      return res.status(403).json({ error: 'Video effects require Max plan. Upgrade to unlock.' });
    }

    const applyWatermark = planData.watermark !== false;

    setRenderJob(renderJobId, {
      status: 'processing',
      userId: req.user.userId,
      createdAt: Date.now(),
      error: null,
      videoUrl: null,
    });

    res.status(202).json({ jobId: renderJobId, status: 'processing' });

    (async () => {
      try {
        const videoPath = await renderVideo({
          scenes, audioUrl, ratio, jobId: renderJobId, duration,
          music, captions, transitions, soundEffects,
          videoType: videoType || 'education',
          captionStyle: captionStyle || null,
          musicVolume: typeof musicVolume === 'number' ? musicVolume : 0.07,
          sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.4,
          videoEffect: videoEffect || 'none',
          applyWatermark,
          videoLanguage: req.body.videoLanguage || 'en',
        });

        setRenderJob(renderJobId, {
          status: 'done',
          videoUrl: '/outputs/' + videoPath,
          completedAt: Date.now(),
        });
      } catch (jobErr) {
        console.error('[Render Job] Failed:', jobErr.message, jobErr.stack);
        setRenderJob(renderJobId, {
          status: 'failed',
          error: jobErr.message || 'Render failed. Please try again.',
          completedAt: Date.now(),
        });
      } finally {
        scheduleRenderJobCleanup(renderJobId);
      }
    })();

  } catch (err) {
    console.error('[Render] Unhandled error:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Render failed. Please try again.' });
  }
});

// ✅ FIX MAIN: رفعنا الـ timeout limit للفيديوهات الطويلة
// الـ status endpoint بيرجع معلومات إضافية عشان الفرونت إند يعرف يصبر
app.get('/api/render-status/:jobId', authMiddleware, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const jobId = String(req.params.jobId);
  const videoUrl = '/outputs/' + `video_${jobId}.mp4`;
  const videoPath = join(process.cwd(), 'outputs', `video_${jobId}.mp4`);

  if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0) {
    return res.json({ status: 'done', videoUrl });
  }

  const job = getRenderJob(jobId);
  if (job && job.userId && job.userId !== req.user.userId) {
    return res.status(404).json({ error: 'Render job not found' });
  }

  if (job?.status === 'failed') {
    return res.json({ status: 'failed', error: job.error || 'Render failed. Please try again.' });
  }

  if (job?.status === 'done') {
    return res.json({ status: 'done', videoUrl: job.videoUrl || videoUrl });
  }

  // ✅ FIX: بنرجع createdAt عشان الفرونت إند يعرف كام وقت فات
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

  const send = (event, data) => {
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  };

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
  if (!scenes?.length || !prompt) {
    return res.status(400).json({ error: 'scenes and prompt required' });
  }

  try {
    const scenesText = scenes.map((s, i) => `Scene ${i + 1}: ${s.text}`).join('\n');
    const editPrompt = `You are a professional video script editor. You understand both English and Arabic instructions.

Current scenes:
${scenesText}

User instruction (may be in English or Arabic): ${prompt}

TASK: Edit the scenes exactly as requested. Apply the instruction faithfully.

Rules:
- Return ONLY a valid JSON array, no markdown, no extra text
- Same number of scenes as input
- Each scene: { "index": number, "type": "hook"|"body"|"ending", "text": string, "keywords": string[] }
- Keywords must always be in English
- Scene text should match the language of the original scenes
- Apply the requested changes completely and accurately

JSON array:`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 6000,
        messages: [{ role: 'user', content: editPrompt }],
      }),
    });

    const claudeData = await claudeRes.json();
    const textContent = claudeData.content?.find(c => c.type === 'text')?.text || '';

    let editedScenes;
    try {
      const cleaned = textContent.replace(/```json\n?|\n?```/g, '').trim();
      editedScenes = JSON.parse(cleaned);
    } catch {
      console.warn('[AI Edit] Could not parse response, returning original scenes');
      return res.json({ scenes });
    }

    const finalScenes = editedScenes.map((s, i) => ({
      ...scenes[i],
      ...s,
      keywords: s.keywords || scenes[i]?.keywords || [],
    }));

    res.json({ scenes: finalScenes });
  } catch (err) {
    console.error('[AI Edit] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Model 3 Payment Route ──────────────────────────────────────────────────
app.post('/api/model3/payment-request', authMiddleware, async (req, res) => {
  try {
    const { plan, planName, amount, userEmail, screenshot } = req.body;
    if (!plan || !amount || !userEmail || !screenshot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
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
      body: JSON.stringify({
        from: 'Erivion Model 3 <noreply@erivion.net>',
        to: process.env.ADMIN_EMAIL || 'digidelight33@gmail.com',
        subject: `🖼️ Model 3 Payment - ${planName} - ${userEmail}`,
        html: `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
          <h2 style="color:#f59e0b">🖼️ New Model 3 Payment Request</h2>
          <table style="width:100%;border-collapse:collapse;margin:20px 0">
            <tr><td style="color:#888;padding:8px 0">User Email</td><td style="color:#fff;font-weight:600">${userEmail}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Account</td><td style="color:#fff">${user.email}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Plan</td><td style="color:#f59e0b;font-weight:700">${planName}</td></tr>
            <tr><td style="color:#888;padding:8px 0">Amount</td><td style="color:#22c55e;font-weight:700">${amount} EGP</td></tr>
          </table>
          <div style="margin-top:24px;display:flex;gap:12px">
            <a href="${backendUrl}/api/auth/model3-approve?email=${encodeURIComponent(userEmail)}&plan=${plan}&secret=${adminSecret}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Approve</a>
            <a href="${backendUrl}/api/auth/model3-reject?email=${encodeURIComponent(userEmail)}&secret=${adminSecret}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Reject</a>
          </div>
        </div>`,
        attachments: attachments.length > 0 ? attachments : undefined,
      }),
    });

    res.json({ success: true });
  } catch (e) {
    console.error('[Model3 Payment]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Model 3 Routes ─────────────────────────────────────────────────────────
async function checkModel3Access(req, res, next) {
  try {
    const user = await getUserById(req.user.userId);
    if (!user || !user.model3_access) {
      return res.status(403).json({ error: 'Model 3 access required. Please contact support to activate.' });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

app.post('/api/model3/generate-scenes', authMiddleware, checkModel3Access, async (req, res) => {
  const { idea, script, inputMode, imageCount, videoLanguage, styleSuffix } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script required' });

  const isIdeaMode = inputMode === 'idea';
  const styleHint  = styleSuffix || 'cinematic photography, dramatic lighting, photorealistic';
  const allScenes  = [];

  // نولد scene واحدة في كل request عشان Groq يرجع بالظبط واحدة
  async function generateOneScene(index, contextText) {
    const userPrompt = isIdeaMode
      ? `Video about: "${idea}" | Style: ${styleHint} | Language for text: ${videoLanguage}

Generate scene number ${index} of ${imageCount}.
Return a JSON object (NOT array) with:
- "index": ${index}
- "prompt": English only, cinematic image, no faces, 30-50 words, style: ${styleHint}
- "text": 1-2 sentence narration in ${videoLanguage}

Output ONLY the JSON object, nothing else:`
      : `Script: "${contextText}" | Style: ${styleHint}

Generate scene number ${index} of ${imageCount} from this script portion.
Return a JSON object (NOT array) with:
- "index": ${index}
- "prompt": English only, cinematic image matching script, no faces, 30-50 words
- "text": narration from script in original language

Output ONLY the JSON object, nothing else:`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 500,
        temperature: 0.4,
        messages: [
          { role: 'system', content: 'You output a single JSON object only. No markdown, no arrays, no explanation. Just the raw JSON object.' },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const startIdx = raw.indexOf('{');
    const endIdx = raw.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) return null;
    try {
      return JSON.parse(raw.slice(startIdx, endIdx + 1));
    } catch { return null; }
  }

  try {
    for (let i = 1; i <= imageCount; i++) {
      let contextText = '';
      if (!isIdeaMode) {
        const start = Math.floor((i - 1) / imageCount * script.length);
        const end   = Math.floor(i / imageCount * script.length);
        contextText = script.slice(start, end) || script.slice(0, 200);
      }

      let scene = null;
      let attempts = 0;
      while (!scene && attempts < 3) {
        attempts++;
        try { scene = await generateOneScene(i, contextText); } catch {}
      }

      if (scene) {
        allScenes.push({ index: i, prompt: scene.prompt || '', text: scene.text || '' });
      } else {
        // fallback scene
        allScenes.push({
          index: i,
          prompt: `Cinematic shot, scene ${i}, ${styleHint}, dramatic lighting, no people`,
          text: isIdeaMode ? idea.slice(0, 100) : (contextText.slice(0, 100) || `Scene ${i}`),
        });
      }
      console.log(`[Model3] Scene ${i}/${imageCount} done`);
    }

    console.log(`[Model3] Total: ${allScenes.length}/${imageCount} scenes`);
    res.json({ scenes: allScenes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/model3/render', authMiddleware, checkModel3Access, renderLimiter, async (req, res) => {
  const { scenes, audioUrl, ratio, captions, transitions, music, videoLanguage } = req.body;
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });

  const renderJobId = String(Date.now());

  setRenderJob(renderJobId, {
    status: 'processing',
    userId: req.user.userId,
    createdAt: Date.now(),
    error: null,
    videoUrl: null,
  });

  res.status(202).json({ jobId: renderJobId, status: 'processing' });

  (async () => {
    try {
      const videoPath = await renderModel3Video({
        scenes,
        audioUrl,
        ratio: ratio || '16:9',
        jobId: renderJobId,
        duration: duration || '1min',
        captions: captions || false,
        transitions: transitions !== false,
        music: music || false,
        videoLanguage: videoLanguage || 'en',
      });

      setRenderJob(renderJobId, {
        status: 'done',
        videoUrl: '/outputs/' + videoPath,
        completedAt: Date.now(),
      });
    } catch (jobErr) {
      console.error('[Model3 Render] Failed:', jobErr.message);
      setRenderJob(renderJobId, {
        status: 'failed',
        error: jobErr.message || 'Render failed.',
        completedAt: Date.now(),
      });
    } finally {
      scheduleRenderJobCleanup(renderJobId);
    }
  })();
});

app.listen(PORT, () => {
  console.log('AI Video Backend running on http://localhost:' + PORT);
});

// ✅ FIX: Global error handler - يرجع JSON دايماً مش HTML
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  if (req.path.startsWith('/api')) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
  next(err);
});

// ✅ Catch-all: أي route مش API يرجع الـ React app
app.use(express.static(join(__dirname, '..', 'dist')));

// ✅ Favicon fix: نرجع الملف مباشرة قبل ما الـ catch-all يمسكه
app.get('/favicon.png', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'favicon.png'));
});
app.get('/favicon.ico', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'favicon.png'));
});

// ✅ Logo fix: نرجع الـ logo من frontend/public مباشرة (مش من dist عشان هو في gitignore)
app.get('/logo.png', (req, res) => {
  const fromDist   = join(__dirname, '..', 'dist', 'logo.png');
  const fromPublic = join(__dirname, '..', 'frontend', 'public', 'logo.png');
  if (fs.existsSync(fromDist)) return res.sendFile(fromDist);
  res.sendFile(fromPublic);
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});