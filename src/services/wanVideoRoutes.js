import express from 'express';
import { generateWanVideo } from './wanVideoService.js';
import { authMiddleware } from './authRoutes.js';
import { createPaymentRequest } from './authService.js';

const router = express.Router();

const qualityMap = {
  '16:9': { width: 832, height: 480 },
  '9:16': { width: 480, height: 832 },
};

// Payment request
router.post('/payment-request', authMiddleware, async (req, res) => {
  try {
    const { plan, planName, amount, userEmail, screenshot } = req.body;
    if (!plan || !amount || !userEmail || !screenshot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    await createPaymentRequest(req.user.id, userEmail, `erivion_${plan}`, 'monthly', amount, screenshot);
    res.json({ success: true, message: 'Payment request submitted' });
  } catch (error) {
    console.error('WAN payment error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate scenes via Groq
router.post('/generate-scenes', authMiddleware, async (req, res) => {
  try {
    const { mode, language, idea, script, characters = [], sceneCount } = req.body;

    const Groq = (await import('groq-sdk')).default;
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const charDesc = characters.length > 0
      ? characters.map(c => `- ${c.name}: ${c.description}`).join('\n')
      : '';

    const isAr = language === 'ar';
    const inputText = mode === 'idea' ? idea : script;

    const systemPrompt = isAr
      ? `أنت كاتب سيناريو محترف. ولّد ${sceneCount} مشهداً لفيديو. لكل مشهد: نص التعليق الصوتي بالعربي، وvideo prompt بالإنجليزي سينمائي ومفصل.${charDesc ? `\nالشخصيات:\n${charDesc}\nاستخدم وصف الشخصية بالضبط عند ظهورها.` : ''}\nأجب بـ JSON فقط: {"scenes": [{"text": "...", "prompt": "..."}]}`
      : `You are a professional screenwriter. Generate ${sceneCount} scenes. For each scene: voiceover text in English, and a detailed cinematic video prompt in English.${charDesc ? `\nCharacters:\n${charDesc}\nUse exact character description when they appear.` : ''}\nReply with JSON only: {"scenes": [{"text": "...", "prompt": "..."}]}`;

    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: inputText }
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    let content = completion.choices[0].message.content.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(content);
    const scenes = parsed.scenes.map(s => ({ ...s, status: 'pending' }));
    res.json({ success: true, scenes });

  } catch (error) {
    console.error('Generate scenes error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Start render job
router.post('/render', authMiddleware, async (req, res) => {
  try {
    const { scenes, aspectRatio = '16:9', voice, withCaptions, withMusic, language } = req.body;
    const jobId = `wan_${Date.now()}_${req.user.id}`;

    global.wanJobs = global.wanJobs || {};
    global.wanJobs[jobId] = {
      status: 'processing', progress: 0,
      scenes: scenes.map(s => ({ ...s, status: 'pending' })),
      error: null, videoUrl: null
    };

    processWanJob(jobId, scenes, { aspectRatio, voice, withCaptions, withMusic, language }).catch(console.error);

    res.json({ success: true, jobId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Job status
router.get('/status/:jobId', authMiddleware, async (req, res) => {
  const job = global.wanJobs?.[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// Single 5s video (no voiceover)
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, negative_prompt = '', aspectRatio = '16:9' } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const { width, height } = qualityMap[aspectRatio] || qualityMap['16:9'];
    const result = await generateWanVideo({ prompt, negative_prompt, num_frames: 33, width, height });
    res.json({ success: true, videoUrl: result.videoUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function processWanJob(jobId, scenes, options) {
  const job = global.wanJobs[jobId];
  const { aspectRatio = '16:9' } = options;
  const { width, height } = qualityMap[aspectRatio] || qualityMap['16:9'];

  try {
    const videoUrls = [];

    for (let i = 0; i < scenes.length; i++) {
      job.scenes[i].status = 'generating';
      job.statusMsg = `Generating scene ${i + 1} of ${scenes.length}...`;

      const result = await generateWanVideo({
        prompt: scenes[i].prompt,
        num_frames: 33,
        width, height,
      });

      job.scenes[i].status = 'done';
      job.scenes[i].videoUrl = result.videoUrl;
      videoUrls.push(result.videoUrl);
      job.progress = Math.round(((i + 1) / scenes.length) * 100);
    }

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