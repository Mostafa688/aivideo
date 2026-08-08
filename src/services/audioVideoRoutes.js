// ── audioVideoRoutes.js ──────────────────────────────────────────────────────
// راوتس أدمن-فقط لمصنع فيديو الصوت. المرحلة 1: رفع + تفريغ (Whisper). المراحل الجاية
// (استخراج عناصر، صور، رندر الفيديو) هتتضاف كإندبوينتس إضافية على نفس الـ job.

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { transcribeAudioWithTimestamps, uploadAudioVideoSourceToR2, tmpAudioPath } from './audioVideoService.js';
import { createAudioVideoJob, getAudioVideoJobById, listAudioVideoJobsForAdmin } from './authService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'erivion_admin_2026';
  if (!secret || secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

router.post('/transcribe', adminAuth, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });
  const tmpPath = tmpAudioPath(req.file.originalname);
  fs.writeFileSync(tmpPath, req.file.buffer);
  try {
    const ext = tmpPath.split('.').pop();
    const audioUrl = await uploadAudioVideoSourceToR2(req.file.buffer, ext);
    const { text, words } = await transcribeAudioWithTimestamps(tmpPath);
    const job = await createAudioVideoJob({ audioUrl, transcriptText: text, wordsJson: words, status: 'transcribed' });
    res.json({ job });
  } catch (err) {
    console.error('[AudioVideo] Transcribe error:', err);
    res.status(500).json({ error: err.message || 'Transcription failed' });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
});

router.get('/jobs', adminAuth, async (req, res) => {
  try {
    const jobs = await listAudioVideoJobsForAdmin();
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:id', adminAuth, async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
