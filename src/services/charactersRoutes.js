// ── charactersRoutes.js ──────────────────────────────────────────────────────
// مكتبة الشخصيات — العميل بيرفع صورة مرجعية لشخصية (أو أكتر من واحدة)، بتتخزن على R2،
// وتُستخدم كمرجع تناسق (نفس الشخصية في كل مشاهد الفيديو) في محتوى القصص/المغامرات — زي
// "لو عشت في زمن سيدنا نوح عليه السلام" وما شابه. نفس نمط رفع الفويس كلون بالظبط (R2)
// بس هنا صور، ومفيش حد أقصى شخصية واحدة — العميل ممكن يحفظ أكتر من واحدة.

import express from 'express';
import multer from 'multer';
import { authMiddleware } from './authRoutes.js';
import { saveCharacterReference, listCharacterReferencesForUser, deleteCharacterReference, updateCharacterReference, setCharacterDescription } from './authService.js';
import { describeCharacterImage, getPresetById } from './characterStudioRoutes.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const router = express.Router();

const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// ✅ نفس نمط uploadVoiceSampleToR2 (voiceCloneService.js) بالظبط — نفس متغيرات البيئة،
// بس مفتاح characters/ بدل voices/
async function uploadCharacterImageToR2(buffer, ext, mimetype) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  const key = `characters/char_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: mimetype }));
  return `${R2_PUBLIC_URL}/${key}`;
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const characters = await listCharacterReferencesForUser(req.user.userId);
    res.json({ characters });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const imageFile = req.file;
    if (!imageFile) return res.status(400).json({ error: 'image file is required' });
    if (!/^image\//.test(imageFile.mimetype || '')) return res.status(400).json({ error: 'File must be an image.' });
    if (!imageFile.buffer || imageFile.buffer.length < 100) {
      return res.status(400).json({ error: `Upload failed — received only ${imageFile.buffer?.length || 0} bytes. Please try uploading the image again.` });
    }
    const ext = (imageFile.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg').slice(0, 4);
    const imageUrl = await uploadCharacterImageToR2(imageFile.buffer, ext, imageFile.mimetype);
    const kind = ['person', 'animal', 'cartoon', 'mascot', 'other'].includes(req.body.kind) ? req.body.kind : 'person';
    const character = await saveCharacterReference(req.user.userId, { label: String(req.body.label || '').trim().slice(0, 60) || null, imageUrl, kind });
    res.json({ character });
    // وصف مظهر الشخصية بيتعمل في الخلفية (الايجنت بيحطه في وصف أي فيديو بالشخصية) — لو فشل مفيش مشكلة
    describeCharacterImage(imageFile.buffer).then(d => d && setCharacterDescription(character.id, d)).catch(e => console.warn('[Characters] describe skipped:', e.message));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// تعديل اسم/نوع/وصف شخصية
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    const c = await updateCharacterReference(req.params.id, req.user.userId, {
      label: b.label !== undefined ? String(b.label).replace(/<[^>]*>/g, '').trim().slice(0, 60) : undefined,
      kind: ['person', 'animal', 'cartoon', 'mascot', 'other'].includes(b.kind) ? b.kind : undefined,
      description: b.description !== undefined ? String(b.description).replace(/<[^>]*>/g, '').trim().slice(0, 300) : undefined,
    });
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json({ character: c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// حفظ شخصية جاهزة (من الأدمن) في شخصياتي — بنفس الصورة (من غير رفع تاني)
router.post('/from-preset/:id', authMiddleware, async (req, res) => {
  try {
    const p = await getPresetById(req.params.id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    const lang = req.body?.language === 'en' ? 'en' : 'ar';
    const character = await saveCharacterReference(req.user.userId, { label: lang === 'en' ? p.name_en : p.name_ar, imageUrl: p.image_url, kind: p.category === 'influencer' ? 'person' : p.category, description: (lang === 'en' ? p.description_en : p.description_ar) || null });
    res.json({ character });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await deleteCharacterReference(req.params.id, req.user.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
