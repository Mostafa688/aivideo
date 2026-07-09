// ── adsRoutes.js ──────────────────────────────────────────────────────────────
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { authMiddleware } from './authRoutes.js';
import { getUserById, getCreditsBalance, chargeCredits, getAdsCreditCost, ADS_CREDIT_COSTS_NO_VOICE, ADS_CREDIT_COSTS_VOICE } from './authService.js';
import { renderAdVideo } from './adsVideoService.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

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

      // ✅ موديل الإعلانات بقى متاح لكل المستخدمين (اتشال قفل الصيانة)

      // ✅ العميل على "free" (لسه ما شحنش رصيد حقيقي) مقصور على موديل 2 بس
      if ((user.plan || 'free') === 'free') {
        return res.status(403).json({ error: 'no_access', message: 'Free credits can only be used on Model 2 (Real Footage). Top up credits to unlock Ads.', show_upgrade: true });
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

      // ── تكلفة الكريديت حسب عدد المشاهد ووجود صوت من عدمه ──
      const finalSceneCount = Math.min(Math.max(parseInt(sceneCount) || 5, 3), 6);
      const hasVoiceMode = audioMode === 'ai_voice' || (audioMode === 'upload' && !!uploadedAudioPath);
      const adsCost = getAdsCreditCost(finalSceneCount, hasVoiceMode);

      // ── نظام الكريديت الموحد ──
      const balance = await getCreditsBalance(req.user.userId);
      if (balance < adsCost) {
        return res.status(402).json({
          error: 'quota_exceeded',
          message: `This video needs ${adsCost} credits, you have ${balance}.`,
          cost: adsCost,
          remaining: balance,
        });
      }

      // (الخصم بيحصل بعد نجاح الفيديو فعليًا — تحت في الـ async block)

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
            sceneCount: finalSceneCount,
            customHook: customHook || '',
            showTitle: showTitle !== 'false',
            outputDir,
            jobId,
            onProgress: ({ step, msg }) => setAdsJob(jobId, { step, msg }),
          });

          // Build relative URL
          const relPath = result.outputPath.replace(join(process.cwd(), 'outputs'), '/outputs');
          await chargeCredits(req.user.userId, adsCost).catch(e => console.warn('[AdsRoutes] Credit deduct failed:', e.message));
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
    const balance = await getCreditsBalance(req.user.userId);
    res.json({
      remaining: balance,
      costs_no_voice: ADS_CREDIT_COSTS_NO_VOICE,
      costs_voice: ADS_CREDIT_COSTS_VOICE,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;