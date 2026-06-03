import express from 'express';
import { generateWanVideo } from './wanVideoService.js';
import { authMiddleware } from './authRoutes.js';
import { pool } from './authService.js';

const router = express.Router();

const framesMap = { 5: 33, 10: 65, 15: 97 };
const qualityMap = {
  '480p': { width: 832, height: 480 },
  '720p': { width: 1280, height: 720 }
};

// Payment request
router.post('/payment-request', authMiddleware, async (req, res) => {
  try {
    const { plan, planName, amount, userEmail, screenshot } = req.body;
    if (!plan || !amount || !userEmail || !screenshot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await pool.query(
      `INSERT INTO payment_requests (user_id, user_email, model, plan, amount, screenshot, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
      [req.user.id, userEmail, 'erivion_wan', plan, amount, screenshot]
    );

    res.json({ success: true, message: 'Payment request submitted' });
  } catch (error) {
    console.error('WAN payment error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate scenes
router.post('/generate-scenes', authMiddleware, async (req, res) => {
  try {
    const { mode, duration, language, aspectRatio, idea, script, characters = [], sceneCount } = req.body;

    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const charDesc = characters.length > 0
      ? `\nCharacters:\n${characters.map(c => `- ${c.name}: ${c.description}`).join('\n')}`
      : '';

    const isAr = language === 'ar';
    const inputText = mode === 'idea' ? idea : script;

    const systemPrompt = isAr
      ? `أنت كاتب سيناريو محترف. مهمتك توليد ${sceneCount} مشهد لفيديو. لكل مشهد:
1. نص التعليق الصوتي (جملة أو جملتين بالعربي)
2. وصف بصري بالإنجليزي للفيديو (video prompt) - سينمائي ومفصل
${charDesc ? `\nإذا ظهرت شخصية في المشهد، استخدم وصفها المحدد:\n${charDesc}` : ''}
أجب بـ JSON فقط: {"scenes": [{"text": "...", "prompt": "..."}]}`
      : `You are a professional screenwriter. Generate ${sceneCount} scenes for a video. For each scene:
1. Voiceover text (1-2 sentences)
2. English video prompt - cinematic and detailed
${charDesc ? `\nIf a character appears, use their exact description:\n${charDesc}` : ''}
Reply with JSON only: {"scenes": [{"text": "...", "prompt": "..."}]}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: inputText }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    let content = completion.choices[0].message.content.trim();
    content = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(content);

    const scenes = parsed.scenes.map(s => ({ ...s, status: 'pending' }));
    res.json({ success: true, scenes });

  } catch (error) {
    console.error('Generate scenes error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Render video
router.post('/render', authMiddleware, async (req, res) => {
  try {
    const { scenes, duration, language, aspectRatio, voice, withCaptions, withMusic } = req.body;
    const jobId = `wan_${Date.now()}_${req.user.id}`;

    // Store job
    global.wanJobs = global.wanJobs || {};
    global.wanJobs[jobId] = { status: 'processing', progress: 0, scenes: scenes.map(s => ({ ...s, status: 'pending' })), error: null };

    // Process async
    processWanJob(jobId, scenes, { duration, language, aspectRatio, voice, withCaptions, withMusic }).catch(console.error);

    res.json({ success: true, jobId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Status
router.get('/status/:jobId', authMiddleware, async (req, res) => {
  const job = global.wanJobs?.[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Generate single 5s video (no voiceover)
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, negative_prompt = '', duration = 5, quality = '480p' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const num_frames = framesMap[duration] || 33;
    const { width, height } = qualityMap[quality] || qualityMap['480p'];

    const result = await generateWanVideo({ prompt, negative_prompt, num_frames, width, height });
    res.json({ success: true, videoUrl: result.videoUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function processWanJob(jobId, scenes, options) {
  const job = global.wanJobs[jobId];
  const { aspectRatio = '16:9' } = options;
  const dims = aspectRatio === '9:16' ? { width: 480, height: 832 } : { width: 832, height: 480 };

  try {
    const videoUrls = [];

    for (let i = 0; i < scenes.length; i++) {
      job.scenes[i].status = 'generating';
      job.statusMsg = `Generating scene ${i + 1} of ${scenes.length}...`;

      const result = await generateWanVideo({
        prompt: scenes[i].prompt,
        num_frames: 33,
        width: dims.width,
        height: dims.height,
      });

      job.scenes[i].status = 'done';
      job.scenes[i].videoUrl = result.videoUrl;
      videoUrls.push(result.videoUrl);
      job.progress = Math.round(((i + 1) / scenes.length) * 100);
    }

    // For now return first video URL (full merge needs FFmpeg - coming soon)
    job.status = 'done';
    job.videoUrl = videoUrls[0];
    job.allVideoUrls = videoUrls;
    job.progress = 100;
    job.statusMsg = 'Done!';

  } catch (error) {
    job.status = 'error';
    job.error = error.message;
  }
}

export default router;