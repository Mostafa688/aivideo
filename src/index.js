import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { generateScenesStream } from './services/scriptService.js';
import { fetchMediaForScene, resetUsedVideos, clearJobSet } from './services/mediaService.js';
import { generateVoiceover, VOICE_OPTIONS } from './services/voiceService.js';
import { renderVideo } from './services/renderService.js';
import { generateAllAIScenes } from './services/aiVideoService.js';
import authRouter, { authMiddleware } from './services/authRoutes.js';
import { getUserById, PLANS, canUserRender, getUserCredits } from './services/authService.js';

const app = express();
app.set('trust proxy', 1); // ✅ Required for Railway (reverse proxy)
const PORT = process.env.PORT || 3001;

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ✅ General limiter - 200 requests per 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again in a few minutes.' },
  skip: (req) => req.path === '/health', // skip health checks
});

// ✅ Auth limiter - stricter for login/signup
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later.' },
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
app.use('/outputs', express.static('outputs'));
app.use(express.static('dist'));
app.use('/api/auth', authLimiter, authRouter);

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/api/voices', (req, res) => res.json({ voices: VOICE_OPTIONS }));

app.post('/api/generate-scenes', authMiddleware, sceneLimiter, async (req, res) => {
  const { idea, script, tone, duration, mode, videoLanguage } = req.body;
  if (!idea && !script) return res.status(400).json({ error: 'idea or script is required' });

  // ✅ Plan enforcement
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

// ✅ FIX: بنبعت videoLanguage للـ voiceover عشان يختار الصوت الصح
app.post('/api/generate-voice', authMiddleware, async (req, res) => {
  const { text, voice, videoType, speed, videoLanguage } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const audioPath = await generateVoiceover(
      text,
      voice || 'male_american',
      videoType || 'education',
      speed || 0,
      videoLanguage || 'en',  // ✅ FIX: بنبعت اللغة
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

  console.log('Render | Scenes:', scenes?.length, '| Ratio:', ratio, '| Duration:', duration, '| Effect:', videoEffect);
  if (!scenes?.length) return res.status(400).json({ error: 'scenes required' });

  // ✅ Plan enforcement for render features
  const user = await getUserById(req.user.userId);
  const planData = PLANS[user?.plan || 'free'];

  // ✅ Credit & video limit check
  const renderCheck = await canUserRender(req.user.userId);
  if (!renderCheck.allowed) {
    const credits = await getUserCredits(req.user.userId);

    // حساب نهاية الأسبوع (السبت القادم)
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

  // watermark: always true for free, always false for paid
  const applyWatermark = planData.watermark !== false;

  try {
    const videoPath = await renderVideo({
      scenes, audioUrl, ratio, jobId, duration,
      music, captions, transitions, soundEffects,
      videoType: videoType || 'education',
      captionStyle: captionStyle || null,
      musicVolume: typeof musicVolume === 'number' ? musicVolume : 0.07,
      sfxVolume: typeof sfxVolume === 'number' ? sfxVolume : 0.4,
      videoEffect: videoEffect || 'none',
      applyWatermark,
    });
    res.json({ videoUrl: '/outputs/' + videoPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

// ✅ FIX 2: /api/ai-edit endpoint - كان مفقود وده كان بيخلي زر "Edit with AI" مش شغال
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

    // نحتفظ بالـ media data من المشاهد الأصلية
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

app.listen(PORT, () => {
  console.log('AI Video Backend running on http://localhost:' + PORT);
});

// ✅ Catch-all: أي route مش API يرجع الـ React app
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '..', 'dist', 'index.html'));
});