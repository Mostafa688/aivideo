// ── docVideoRoutes.js ── "من PDF لفيديو": رفع المستند (بيتطلّع النص بس — الملف مش بيتخزن)، تسعير، وبدء الفيديو.
// متابعة الوظيفة نفسها من /api/documentary/jobs/:id (نفس طابور الأفلام والأنيميشن)
import express from 'express';
import multer from 'multer';
import { authMiddleware } from './authRoutes.js';
import { extractDocumentText, DOC_EXTS, DOC_MAX_BYTES } from './documentText.js';
import { DOC_TEXT_MAX_CHARS, suggestSeconds } from './codeVideo/docScript.js';
import { detectLang } from './codeVideo/narration.js';
import { docVideoMaxSeconds, getUserById, getCreditsBalance } from './authService.js';
import { quoteDocVideo, startDocumentVideo, DOC_VIDEO_LOOKS } from './documentary/documentaryService.js';
import { VOICE_CATALOG } from './voiceCatalog.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: DOC_MAX_BYTES } });

router.post('/extract', authMiddleware, (req, res, next) => upload.single('file')(req, res, (err) => {
  if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'upload_failed', message: err.code === 'LIMIT_FILE_SIZE' ? `The file is too large (max ${Math.round(DOC_MAX_BYTES / 1048576)}MB).` : 'Upload failed.' });
  next();
}), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file_required', message: 'Upload a PDF, Word or text file.' });
    const r = await extractDocumentText(req.file.buffer, req.file.originalname, { maxChars: DOC_TEXT_MAX_CHARS });
    const maxSeconds = await docVideoMaxSeconds(req.user.userId);
    const language = detectLang(r.text, 'en') || 'en';
    const suggested = suggestSeconds(r.text, maxSeconds, language);
    const words = r.text.split(/\s+/).filter(Boolean).length;
    res.json({
      name: String(req.file.originalname || 'document').slice(0, 120), text: r.text, chars: r.chars, words, pages: r.pages || null, truncated: r.truncated,
      language, suggestedSeconds: suggested, maxSeconds,
      quotes: Object.fromEntries(DOC_VIDEO_LOOKS.map(l => [l, quoteDocVideo({ seconds: suggested, look: l }).cost])),
    });
  } catch (e) {
    const code = e.code || 'failed';
    res.status(400).json({ error: code, message: code === 'unsupported_type' ? `Supported files: ${DOC_EXTS.join(', ')}` : code === 'empty_document' ? 'No readable text was found in this file (scanned PDFs are images — export a text PDF).' : 'Could not read this file.' });
  }
});

router.get('/limits', authMiddleware, async (req, res) => {
  const [maxSeconds, user, credits] = await Promise.all([docVideoMaxSeconds(req.user.userId), getUserById(req.user.userId).catch(() => null), getCreditsBalance(req.user.userId).catch(() => null)]);
  res.json({ maxSeconds, paid: !!user && (user.plan || 'free') !== 'free', credits, looks: DOC_VIDEO_LOOKS });
});

router.get('/voices', authMiddleware, (req, res) => res.json({ voices: VOICE_CATALOG }));

router.post('/estimate', authMiddleware, express.json({ limit: '10kb' }), (req, res) => {
  const look = DOC_VIDEO_LOOKS.includes(req.body?.look) ? req.body.look : 'vox';
  res.json(quoteDocVideo({ seconds: Number(req.body?.seconds) || 180, look }));
});

router.post('/start', authMiddleware, express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const r = await startDocumentVideo(req.user.userId, req.body || {});
    if (!r.ok) return res.status(r.status).json({ error: r.error, message: r.message, cost: r.cost, remaining: r.remaining, maxSeconds: r.maxSeconds });
    res.status(202).json({ jobId: r.job.id, cost: r.cost, seconds: r.seconds, remaining: r.remaining });
  } catch (e) {
    console.error('[DocVideo] start failed:', e.message);
    res.status(500).json({ error: 'failed', message: 'Could not start the video.' });
  }
});

export default router;
