import express from 'express';
import { generateWanVideo } from './wanVideoService.js';
import { generateVoiceover } from './voiceService.js';
import { addRealCaptionsForModel, addCaptionsWithTimingForModel } from './renderService.js';
import { authMiddleware } from './authRoutes.js';
import { createPaymentRequest, sendPaymentRequestEmail } from './authService.js';
import { execSync } from 'child_process';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

// Upload to R2
async function uploadToR2(filePath, key) {
  const s3 = new S3Client({
    region: 'auto',
    endpoint: process.env.S3_ENDPOINT_URL,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY,
    },
  });
  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET || 'erivion-videos',
    Key: key,
    Body: fs.readFileSync(filePath),
    ContentType: 'video/mp4',
  }));
  return `${(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')}/${key}`;
}

// Find random music file
function findMusicFile() {
  const dir = path.join(process.cwd(), 'assets', 'music');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (!files.length) return null;
  return path.join(dir, files[Math.floor(Math.random() * files.length)]);
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
      ? `أنت كاتب سيناريو محترف. ولّد ${sceneCount} مشهداً لفيديو. لكل مشهد: نص التعليق الصوتي بالعربي، وvideo prompt بالإنجليزي سينمائي ومفصل.${charDesc ? `\nالشخصيات:\n${charDesc}\nمهم جداً: في كل مشهد تظهر فيه الشخصية، أضف وصفها الكامل بالضبط في الـ prompt بدون تغيير أو اختصار.` : ''}\nأجب بـ JSON فقط: {"scenes": [{"text": "...", "prompt": "..."}]}`
      : `You are a professional screenwriter. Generate ${sceneCount} scenes. For each scene: voiceover text in English, and a detailed cinematic video prompt in English.${charDesc ? `\nCharacters:\n${charDesc}\nCRITICAL: In every scene where a character appears, you MUST include their EXACT full description verbatim in the video prompt. Never paraphrase or shorten it.` : ''}\nReply with JSON only: {"scenes": [{"text": "...", "prompt": "..."}]}`;

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

// Single 5s video
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
  const { aspectRatio = '16:9', voice = 'male_american', language = 'en', withCaptions = false, withMusic = false } = options;
  const { width, height } = qualityMap[aspectRatio] || qualityMap['16:9'];
  const ratio = aspectRatio;

  const tmpDir = `outputs/wan_tmp_${jobId}`;
  await mkdir(tmpDir, { recursive: true });

  try {
    const mergedScenes = [];
    let lastAudioPath = null;

    for (let i = 0; i < scenes.length; i++) {
      job.scenes[i].status = 'generating';
      job.statusMsg = `Generating scene ${i + 1} of ${scenes.length}...`;

      // 1. توليد الفيديو
      const result = await generateWanVideo({ prompt: scenes[i].prompt, num_frames: 121, width, height });
      job.scenes[i].videoUrl = result.videoUrl;

      // 2. تحميل الفيديو محلياً
      const videoPath = path.join(tmpDir, `scene_${i}.mp4`);
      await downloadFile(result.videoUrl, videoPath);

      // 3. توليد الـ voiceover
      job.statusMsg = `Generating voiceover for scene ${i + 1}...`;
      const audioFile = await generateVoiceover(scenes[i].text, voice, 'storytelling', 0, language);
      const audioPath = audioFile ? path.join('outputs', audioFile) : null;
      if (audioPath) lastAudioPath = audioPath;

      // 4. دمج الفيديو مع الـ voiceover
      const mergedPath = path.join(tmpDir, `merged_${i}.mp4`);
      if (audioPath && fs.existsSync(audioPath)) {
        try {
          execSync(`ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest -y "${mergedPath}"`, { stdio: 'pipe' });
        } catch {
          fs.copyFileSync(videoPath, mergedPath);
        }
      } else {
        fs.copyFileSync(videoPath, mergedPath);
      }

      mergedScenes.push(mergedPath);
      job.scenes[i].status = 'done';
      job.progress = Math.round(((i + 1) / scenes.length) * 70);
    }

    // 5. جمع كل المشاهد في فيديو واحد
    job.statusMsg = 'Merging all scenes...';
    const listFile = path.join(tmpDir, 'list.txt');
    fs.writeFileSync(listFile, mergedScenes.map(f => `file '${path.resolve(f)}'`).join('\n'));
    const concatPath = path.join(tmpDir, 'concat.mp4');
    execSync(`ffmpeg -f concat -safe 0 -i "${listFile}" -c copy -y "${concatPath}"`, { stdio: 'pipe' });
    job.progress = 75;

    // 6. إضافة الموسيقى (اختياري)
    let videoWithMusic = concatPath;
    if (withMusic) {
      job.statusMsg = 'Adding music...';
      const musicFile = findMusicFile();
      if (musicFile) {
        const musicPath = path.join(tmpDir, 'with_music.mp4');
        try {
          execSync(
            `ffmpeg -i "${concatPath}" -i "${musicFile}" -filter_complex "[1:a]volume=0.07[music];[0:a][music]amix=inputs=2:duration=longest[aout]" -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 320k -shortest -y "${musicPath}"`,
            { stdio: 'pipe' }
          );
          videoWithMusic = musicPath;
        } catch(e) {
          console.warn('[WAN] Music mix failed:', e.message);
        }
      }
    }
    job.progress = 80;

    // 7. إضافة الكابشن (اختياري)
    let finalVideoPath = videoWithMusic;
    if (withCaptions && lastAudioPath && fs.existsSync(lastAudioPath) && process.env.GROQ_API_KEY) {
      job.statusMsg = 'Adding captions...';
      const captionPath = path.join(tmpDir, 'with_captions.mp4');
      try {
        await addRealCaptionsForModel(videoWithMusic, lastAudioPath, captionPath, 'classic', ratio, language);
        if (fs.existsSync(captionPath) && fs.statSync(captionPath).size > 1000) {
          finalVideoPath = captionPath;
        }
      } catch(e) {
        console.warn('[WAN] Captions failed:', e.message);
      }
    }
    job.progress = 90;

    // 8. رفع الفيديو النهائي على R2
    job.statusMsg = 'Uploading final video...';
    const finalLocalPath = path.join('outputs', `wan_final_${jobId}.mp4`);
    fs.copyFileSync(finalVideoPath, finalLocalPath);

    const publicUrl = await uploadToR2(finalLocalPath, `wan-videos/final_${jobId}.mp4`);

    // تنظيف
    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    try { fs.unlinkSync(finalLocalPath); } catch {}
    if (lastAudioPath) try { fs.unlinkSync(lastAudioPath); } catch {}

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
