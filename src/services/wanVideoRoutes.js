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

// 1080p
const qualityMap = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

// LTX prompt builder - قصير ومركز
function buildLTXPrompt(rawPrompt) {
  let prompt = rawPrompt.trim();
  if (!prompt.toLowerCase().includes('camera') && !prompt.toLowerCase().includes('shot')) {
    prompt += ', cinematic shot, smooth motion';
  }
  return prompt;
}

// تقليل الـ voiceover عشان يتناسب مع مدة الفيديو
// 5 ثواني = أقصى 12 كلمة
function trimVoiceoverText(text) {
  const maxWords = 12;
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  // قطع عند آخر جملة قبل الـ limit
  const trimmed = words.slice(0, maxWords).join(' ');
  return trimmed.replace(/[,،]?\s*$/, '') + '.';
}

// Download file from URL
async function downloadFile(url, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
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

    const ltxGuide = `
LTX-Video prompt rules (MUST follow):
1. ONE single action or motion per scene only
2. Maximum 15 words per prompt
3. Format: [Subject + action], [lighting], [camera movement]
4. Example: "A knight rides a horse through flames, orange firelight, slow tracking shot"
5. NO multiple actions, NO sound descriptions, NO complex scenes
6. If character appears: include their exact appearance description in the subject`;

    const voiceGuide = `Voiceover rules:
- Maximum 10 words per scene (5 second clip)
- One short sentence only
- Example: "The knight rides into the heart of darkness."`;

    const charGuide = charDesc
      ? `\nCharacters (copy EXACTLY when they appear):\n${charDesc}`
      : '';

    const systemPrompt = isAr
      ? `أنت كاتب سيناريو AI محترف. ولّد ${sceneCount} مشهداً.\n${ltxGuide}\n${voiceGuide}${charGuide}\nنص الفويس أوفر: جملة واحدة، أقل من 10 كلمات عربية.\nأجب بـ JSON فقط: {"scenes": [{"text": "...", "prompt": "..."}]}`
      : `You are a professional AI screenwriter. Generate ${sceneCount} scenes.\n${ltxGuide}\n${voiceGuide}${charGuide}\nReply with JSON only: {"scenes": [{"text": "...", "prompt": "..."}]}`;

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
    const scenes = parsed.scenes.map(s => ({
      ...s,
      prompt: buildLTXPrompt(s.prompt),
      text: trimVoiceoverText(s.text),
      status: 'pending'
    }));
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
    const result = await generateWanVideo({ prompt: buildLTXPrompt(prompt), negative_prompt, num_frames: 121, width, height });
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
    const allAudioPaths = [];

    for (let i = 0; i < scenes.length; i++) {
      job.scenes[i].status = 'generating';
      job.statusMsg = `Generating scene ${i + 1} of ${scenes.length}...`;

      const result = await generateWanVideo({ prompt: scenes[i].prompt, num_frames: 121, width, height });
      job.scenes[i].videoUrl = result.videoUrl;

      const videoPath = path.join(tmpDir, `scene_${i}.mp4`);
      await downloadFile(result.videoUrl, videoPath);

      job.statusMsg = `Generating voiceover for scene ${i + 1}...`;
      const trimmedText = trimVoiceoverText(scenes[i].text);
      const audioFile = await generateVoiceover(trimmedText, voice, 'storytelling', 0, language);
      const audioPath = audioFile ? path.join('outputs', audioFile) : null;
      if (audioPath) allAudioPaths.push(audioPath);

      const mergedPath = path.join(tmpDir, `merged_${i}.mp4`);
      if (audioPath && fs.existsSync(audioPath)) {
        try {
          execSync(`ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest -y "${mergedPath}"`, { stdio: 'pipe' });
        } catch { fs.copyFileSync(videoPath, mergedPath); }
      } else {
        fs.copyFileSync(videoPath, mergedPath);
      }

      mergedScenes.push(mergedPath);
      job.scenes[i].status = 'done';
      job.progress = Math.round(((i + 1) / scenes.length) * 70);
    }

    job.statusMsg = 'Merging all scenes...';
    const listFile = path.join(tmpDir, 'list.txt');
    fs.writeFileSync(listFile, mergedScenes.map(f => `file '${path.resolve(f)}'`).join('\n'));
    const concatPath = path.join(tmpDir, 'concat.mp4');
    execSync(`ffmpeg -f concat -safe 0 -i "${listFile}" -c copy -y "${concatPath}"`, { stdio: 'pipe' });
    job.progress = 75;

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
        } catch(e) { console.warn('[WAN] Music failed:', e.message); }
      }
    }
    job.progress = 80;

    let finalVideoPath = videoWithMusic;
    if (withCaptions && allAudioPaths.length > 0 && process.env.GROQ_API_KEY) {
      job.statusMsg = 'Adding captions...';
      const allAudioList = path.join(tmpDir, 'audio_list.txt');
      fs.writeFileSync(allAudioList, allAudioPaths.map(f => `file '${path.resolve(f)}'`).join('\n'));
      const mergedAudioPath = path.join(tmpDir, 'merged_audio.mp3');
      try {
        execSync(`ffmpeg -f concat -safe 0 -i "${allAudioList}" -c copy -y "${mergedAudioPath}"`, { stdio: 'pipe' });
        const captionPath = path.join(tmpDir, 'with_captions.mp4');
        await addRealCaptionsForModel(videoWithMusic, mergedAudioPath, captionPath, 'classic', ratio, language);
        if (fs.existsSync(captionPath) && fs.statSync(captionPath).size > 1000) {
          finalVideoPath = captionPath;
        }
      } catch(e) { console.warn('[WAN] Captions failed:', e.message); }
    }
    job.progress = 90;

    job.statusMsg = 'Uploading final video...';
    const finalLocalPath = path.join('outputs', `wan_final_${jobId}.mp4`);
    fs.copyFileSync(finalVideoPath, finalLocalPath);
    const publicUrl = await uploadToR2(finalLocalPath, `wan-videos/final_${jobId}.mp4`);

    try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
    try { fs.unlinkSync(finalLocalPath); } catch {}
    allAudioPaths.forEach(p => { try { fs.unlinkSync(p); } catch {} });

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