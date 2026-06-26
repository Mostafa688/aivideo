// ── adsRoutes.js ──────────────────────────────────────────────────────────────
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { authMiddleware } from './authRoutes.js';
import { getUserById, getModel7Credits, canUserMakeModel7Video, incrementModel7Video } from './authService.js';
import { renderAdVideo } from './adsVideoService.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

const ADS_CREDIT_COST = 10;

// ── multer for product image + optional voice audio ───────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'productImage') {
      const ok = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.mimetype);
      return cb(ok ? null : new Error('Only JPEG/PNG/WebP allowed'), ok);
    }
    if (file.fieldname === 'voiceAudio') {
      const ok = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'].includes(file.mimetype);
      return cb(ok ? null : new Error('Only MP3/WAV/M4A audio allowed'), ok);
    }
    cb(null, false);
  },
});

// ── Active jobs ───────────────────────────────────────────────────────────────
const adsJobs = new Map();

function getAdsJob(jobId) { return adsJobs.get(String(jobId)) || null; }
function setAdsJob(jobId, data) {
  const key = String(jobId);
  adsJobs.set(key, { ...(adsJobs.get(key) || {}), ...data });
}
function scheduleAdsCleanup(jobId) {
  setTimeout(() => adsJobs.delete(String(jobId)), 2 * 60 * 60 * 1000);
}

// ── POST /api/ads/render ──────────────────────────────────────────────────────
router.post('/render',
  authMiddleware,
  upload.fields([
    { name: 'productImage', maxCount: 1 },
    { name: 'voiceAudio',   maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const user = await getUserById(req.user.userId);
      if (!user) return res.status(401).json({ error: 'User not found' });

      // ── Access check ──
      if (!user.model7_access) {
        return res.status(403).json({ error: 'no_access', message: 'Ads Model subscription required' });
      }

      // ── Credit check ──
      const check = await canUserMakeModel7Video(req.user.userId);
      if (!check.allowed) {
        return res.status(402).json({
          error: 'insufficient_credits',
          required: ADS_CREDIT_COST,
          remaining: check.remaining || 0,
          reason: check.reason,
        });
      }

      // ── Validate inputs ──
      const productImage = req.files?.productImage?.[0];
      if (!productImage) return res.status(400).json({ error: 'Product image is required' });

      const { productName, productDesc, audioMode, aiVoiceKey, ratio, language, sceneCount, customHook, showTitle } = req.body;
      if (!productName?.trim()) return res.status(400).json({ error: 'Product name is required' });

      // ── Handle uploaded voice audio ──
      let uploadedAudioPath = null;
      const voiceAudioFile = req.files?.voiceAudio?.[0];
      if (audioMode === 'upload' && voiceAudioFile) {
        const audioDir = join(process.cwd(), 'outputs', 'ads_tmp');
        fs.mkdirSync(audioDir, { recursive: true });
        uploadedAudioPath = join(audioDir, `voice_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
        fs.writeFileSync(uploadedAudioPath, voiceAudioFile.buffer);
      }

      // ── Deduct credits immediately ──
      await incrementModel7Video(req.user.userId);

      // ── Create job ──
      const jobId = `ads_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const outputDir = join(process.cwd(), 'outputs', 'ads');
      fs.mkdirSync(outputDir, { recursive: true });

      setAdsJob(jobId, {
        status: 'processing',
        step: 'starting',
        msg: 'Initializing ad generation...',
        userId: req.user.userId,
        productName: productName.trim(),
        createdAt: Date.now(),
      });

      // ── Run async ──
      (async () => {
        try {
          const result = await renderAdVideo({
            productImageBase64: productImage.buffer.toString('base64'),
            productName: productName.trim(),
            productDesc: (productDesc || '').trim(),
            audioMode: audioMode || 'none',
            uploadedAudioPath,
            aiVoiceKey: aiVoiceKey || 'male_arabic',
            ratio: ratio || '16:9',
            language: language || 'ar',
            sceneCount: Math.min(Math.max(parseInt(sceneCount) || 5, 3), 6),
            customHook: customHook || '',
            showTitle: showTitle !== 'false',
            outputDir,
            jobId,
            onProgress: ({ step, msg }) => setAdsJob(jobId, { step, msg }),
          });

          // Build relative URL
          const relPath = result.outputPath.replace(join(process.cwd(), 'outputs'), '/outputs');
          setAdsJob(jobId, { status: 'done', step: 'done', msg: 'Ad video ready!', videoUrl: relPath });
          scheduleAdsCleanup(jobId);
        } catch (err) {
          console.error('[AdsRoutes] Job failed:', err.message);
          setAdsJob(jobId, { status: 'error', step: 'error', msg: err.message || 'Unknown error' });
          scheduleAdsCleanup(jobId);
        } finally {
          // Cleanup temp audio
          if (uploadedAudioPath && fs.existsSync(uploadedAudioPath)) {
            try { fs.unlinkSync(uploadedAudioPath); } catch {}
          }
        }
      })();

      res.json({ jobId, status: 'processing' });

    } catch (err) {
      console.error('[AdsRoutes] /render error:', err.message);
      res.status(500).json({ error: err.message || 'Server error' });
    }
  }
);

// ── GET /api/ads/status/:jobId ────────────────────────────────────────────────
router.get('/status/:jobId', authMiddleware, (req, res) => {
  const job = getAdsJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (String(job.userId) !== String(req.user.userId)) return res.status(403).json({ error: 'Forbidden' });
  res.json(job);
});

// ── GET /api/ads/credits ──────────────────────────────────────────────────────
router.get('/credits', authMiddleware, async (req, res) => {
  try {
    const credits = await getModel7Credits(req.user.userId);
    const remaining = Math.max(0, (credits.credits_total || 0) - (credits.credits_used || 0));
    res.json({ credits_total: credits.credits_total || 0, credits_used: credits.credits_used || 0, remaining, cost_per_video: ADS_CREDIT_COST });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;