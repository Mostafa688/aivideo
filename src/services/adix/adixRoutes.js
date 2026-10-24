// ── adix/adixRoutes.js ── /api/adix: رفع صور المنتج + الفكرة → خطة Opus وعرض سعر → موافقة → متابعة التنفيذ
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authMiddleware } from '../authRoutes.js';
import { uploadBufferToR2 } from '../audioVideoService.js';
import { createAdixJob, approveAdixJob, cancelAdixJob, getAdixJob, listAdixJobs, ADIX_LIMITS, ADIX_VIDEO_MODELS } from './adixService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: ADIX_LIMITS.maxPhotos } });

const quotaError = (res, e) => res.status(402).json({ error: 'quota_exceeded', cost: e.cost, remaining: e.remaining, message: 'Not enough credits.', show_upgrade: true });

router.get('/models', authMiddleware, (req, res) => {
  res.json({ models: Object.entries(ADIX_VIDEO_MODELS).map(([key, m]) => ({ key, label: m.label, tiers: m.tiers })), limits: ADIX_LIMITS });
});

router.post('/plan', authMiddleware, (req, res, next) => upload.array('photos', ADIX_LIMITS.maxPhotos)(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? 'too_many_photos' : 'upload_failed' });
  next();
}), async (req, res) => {
  try {
    const files = (req.files || []).filter((f) => /^image\//.test(f.mimetype));
    if (!files.length) return res.status(400).json({ error: 'no_photos', message: 'Upload at least one product photo.' });
    // صور المنتج: تدوير صح + أقصى 2048px، وبعدين R2 (روابط عامة الموديلات بتقراها)
    const stamp = Date.now();
    const photos = await Promise.all(files.map(async (f, i) => {
      const buf = await sharp(f.buffer, { failOn: 'none' }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
      return uploadBufferToR2(buf, `adix/u${req.user.userId}/${stamp}_${i}.jpg`, 'image/jpeg');
    }));
    const b = req.body || {};
    const r = await createAdixJob(req.user.userId, { photos, idea: b.idea, aspect: b.aspect, length: b.length, dialect: b.dialect, model: b.model, brand: b.brand, price: b.price, cta: b.cta });
    res.json(r);
  } catch (e) {
    if (e.message === 'quota_exceeded') return quotaError(res, e);
    if (e.message === 'content_policy_violation') return res.status(400).json({ error: 'content_policy_violation', message: 'This request is not allowed by our content policy.' });
    console.error('[Adix] plan failed:', e.message);
    res.status(500).json({ error: 'plan_failed', message: 'Could not start the ad plan.' });
  }
});

router.get('/jobs', authMiddleware, async (req, res) => {
  try { res.json({ jobs: await listAdixJobs(req.user.userId) }); } catch { res.json({ jobs: [] }); }
});

router.get('/jobs/:id', authMiddleware, async (req, res) => {
  const j = await getAdixJob(req.params.id, req.user.userId).catch(() => null);
  if (!j) return res.status(404).json({ error: 'not_found' });
  res.json(j);
});

router.post('/jobs/:id/approve', authMiddleware, async (req, res) => {
  try {
    const r = await approveAdixJob(req.params.id, req.user.userId, { model: req.body?.model, tier: req.body?.tier });
    res.json(r);
  } catch (e) {
    if (e.message === 'quota_exceeded') return quotaError(res, e);
    if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    if (e.message === 'not_awaiting') return res.status(409).json({ error: 'not_awaiting' });
    console.error('[Adix] approve failed:', e.message);
    res.status(500).json({ error: 'approve_failed' });
  }
});

router.post('/jobs/:id/cancel', authMiddleware, async (req, res) => {
  res.json({ ok: await cancelAdixJob(req.params.id, req.user.userId).catch(() => false) });
});

export default router;
