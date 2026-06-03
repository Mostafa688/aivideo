import express from 'express';
import { generateWanVideo } from './wanVideoService.js';
import { generateVoiceover } from './voiceService.js';
import { authMiddleware } from './authRoutes.js';
import { createPaymentRequest, sendPaymentRequestEmail } from './authService.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { mkdir } from 'fs/promises';

const router = express.Router();

const qualityMap = {
  '16:9': { width: 832, height: 480 },
  '9:16': { width: 480, height: 832 },
};

// Download file from URL
async function downloadFile(url, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Payment request
router.post('/payment-request', authMiddleware, async (req, res) => {
  try {
    const { plan, planName, amount, userEmail, screenshot } = req.body;
    if (!plan || !amount || !userEmail || !screenshot) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    await createPaymentRequest(req.user.userId, userEmail, `erivion_${plan}`, 'monthly', amount, screenshot);
    try {
      await sendPaymentRequestEmail({ userEmail, plan: `erivion_${plan}`, planName, billing: 'monthly', amount, screenshotBase64: screenshot });
    } catch(emailErr) { console.error('Email error:', emailErr.message); }
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
      ? `أنت كاتب سيناريو محترف. ولّد ${sceneCount} مشهداً لفيديو. لكل مشهد: نص التعليق الصوتي بالعربي، وvideo prompt بالإنجليزي سينمائي ومفصل.${charDesc ? `\nالشخصيات:\n${charDesc}\nمهم جداً: استخدم وصف الشخصية بالضبط في كل مشهد تظهر فيه بدون تغيير.` : ''}\nأجب بـ JSON فقط: {"scenes": [{"text": "...", "prompt": "..."}]}`
      : `You are a professional screenwriter. Generate ${sceneCount} scenes. For each scene: voiceover text in English, and a detailed cinematic video prompt in English.${charDesc ? `\nCharacters:\n${charDesc}\nIMPORTANT: Use the exact character description word-for-word in every scene they appear in. Never change or summarize the character description.` : ''}\nReply with JSON only: {"scenes": [{"text": "...", "prompt": "..."}]}`;

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
    const jobId = `wan_${Date.now()}_${req.user.userId}`;

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
    const result = await generateWanVideo({ prompt, negative_prompt, num_frames: 121, width, height });
    res.json({ success: true, videoUrl: result.videoUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function processWanJob(jobId, scenes, options) {
  const job = global.wanJobs[jobId];
  const { aspectRatio = '16:9', voice = 'male_american', language = 'en' } = options;
  const { width, height } = qualityMap[aspectRatio] || qualityMap['16:9'];

  const tmpDir = `outputs/wan_tmp_${jobId}`;
  await mkdir(tmpDir, { recursive: true });

  try {
    const mergedScenes = [];

    for (let i = 0; i < scenes.length; i++) {
      job.scenes[i].status = 'generating';
      job.statusMsg = `Generating scene ${i + 1} of ${scenes.length}...`;

      // 1. توليد الفيديو
      const result = await generateWanVideo({
        prompt: scenes[i].prompt,
        num_frames: 121,
        width, height,
      });

      job.scenes[i].videoUrl = result.videoUrl;

      // 2. تحميل الفيديو محلياً
      const videoPath = path.join(tmpDir, `scene_${i}.mp4`);
      await downloadFile(result.videoUrl, videoPath);

      // 3. توليد الـ voiceover
      job.statusMsg = `Generating voiceover for scene ${i + 1}...`;
      const audioFile = await generateVoiceover(scenes[i].text, voice, 'storytelling', 0, language);
      const audioPath = audioFile ? path.join('outputs', audioFile) : null;

      // 4. دمج الفيديو مع الـ voiceover
      const mergedPath = path.join(tmpDir, `merged_${i}.mp4`);
      if (audioPath && fs.existsSync(audioPath)) {
        try {
          execSync(
            `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest -y "${mergedPath}"`,
            { stdio: 'pipe' }
          );
        } catch {
          // لو فشل الدمج استخدم الفيديو بدون صوت
          fs.copyFileSync(videoPath, mergedPath);
        }
        try { fs.unlinkSync(audioPath); } catch {}
      } else {
        fs.copyFileSync(videoPath, mergedPath);
      }

      mergedScenes.push(mergedPath);
      job.scenes[i].status = 'done';
      job.progress = Math.round(((i + 1) / scenes.length) * 80);
    }

    // 5. جمع كل المشاهد في فيديو واحد
    job.statusMsg = 'Merging all scenes...';
    const listFile = path.join(tmpDir, 'list.txt');
    const listContent = mergedScenes.map(f => `file '${path.resolve(f)}'`).join('\n');
    fs.writeFileSync(listFile, listContent);

    const finalPath = path.join('outputs', `wan_final_${jobId}.mp4`);
    execSync(
      `ffmpeg -f concat -safe 0 -i "${listFile}" -c copy -y "${finalPath}"`,
      { stdio: 'pipe' }
    );

    // 6. رفع الفيديو النهائي على R2
    job.statusMsg = 'Uploading final video...';
    const { default: boto3 } = await import('boto3').catch(() => ({ default: null }));
    
    // استخدم aws4 + fetch لرفع الفيديو على R2
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3Client = new S3Client({
      region: 'auto',
      endpoint: process.env.S3_ENDPOINT_URL,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
      },
    });

    const key = `wan-videos/final_${jobId}.mp4`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET || 'erivion-videos',
      Key: key,
      Body: fs.readFileSync(finalPath),
      ContentType: 'video/mp4',
    }));

    const publicUrl = `${(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')}/${key}`;

    // تنظيف الملفات المؤقتة
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    try { fs.unlinkSync(finalPath); } catch {}

    job.status = 'done';
    job.videoUrl = publicUrl;
    job.allVideoUrls = job.scenes.map(s => s.videoUrl);
    job.progress = 100;
    job.statusMsg = 'Done!';

  } catch (error) {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    job.status = 'error';
    job.error = error.message;
  }
}

export default router;