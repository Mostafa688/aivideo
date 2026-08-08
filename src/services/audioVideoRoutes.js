// ── audioVideoRoutes.js ──────────────────────────────────────────────────────
// راوتس أدمن-فقط لمصنع فيديو الصوت — Pipeline كامل على نفس الـ job:
//   POST /transcribe            → رفع + تفريغ Whisper (متزامن، سريع)
//   POST /jobs/:id/extract      → استخراج العناصر بالـ LLM + توليد صورهم (متزامن)
//   POST /jobs/:id/render       → بناء الفيديو النهائي بـ ffmpeg (async — بيرجع فورًا،
//                                  الشغل بيحصل في الخلفية، والفرونت إند بيعمل poll على
//                                  GET /jobs/:id لحد ما status يبقى done/failed)

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { transcribeAudioWithTimestamps, uploadAudioVideoSourceToR2, tmpAudioPath, extractVideoElements, generateElementImage, uploadElementImageToR2 } from './audioVideoService.js';
import { renderAudioVideoJob } from './audioVideoRenderService.js';
import { createAudioVideoJob, updateAudioVideoJob, getAudioVideoJobById, listAudioVideoJobsForAdmin } from './authService.js';

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

router.post('/jobs/:id/extract', adminAuth, async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!job.words_json || !job.words_json.length) return res.status(400).json({ error: 'no_transcript' });

    await updateAudioVideoJob(job.id, { status: 'extracting' });
    const elements = await extractVideoElements(job.words_json);
    if (!elements.length) {
      await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements extracted from transcript' });
      return res.status(422).json({ error: 'no_elements_found' });
    }

    // ✅ الصور بالترتيب (مش Promise.all) — Pollinations مفيش ليه rate-limit موثّق، بس أفضل
    // نتجنب ضغط عدد كبير من النداءات المتوازية على خدمة مجانية من غير API key
    const withImages = [];
    for (const el of elements) {
      try {
        const buffer = await generateElementImage(el.imagePrompt);
        const imageUrl = await uploadElementImageToR2(buffer);
        withImages.push({ ...el, imageUrl });
      } catch (e) {
        console.warn('[AudioVideo] Image generation failed for element:', el.element, e.message);
      }
    }
    if (!withImages.length) {
      await updateAudioVideoJob(job.id, { status: 'failed', error: 'Image generation failed for all elements' });
      return res.status(502).json({ error: 'image_generation_failed' });
    }

    const updated = await updateAudioVideoJob(job.id, { elementsJson: withImages, status: 'elements_ready' });
    res.json({ job: updated });
  } catch (err) {
    console.error('[AudioVideo] Extract error:', err);
    await updateAudioVideoJob(req.params.id, { status: 'failed', error: err.message }).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs/:id/render', adminAuth, async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!job.elements_json || !job.elements_json.length) return res.status(400).json({ error: 'no_elements' });

    const ratio = req.body?.ratio || job.ratio || '16:9';
    const renderJob = await updateAudioVideoJob(job.id, { status: 'rendering', ratio });
    res.json({ job: renderJob });

    (async () => {
      try {
        const videoUrl = await renderAudioVideoJob(renderJob);
        await updateAudioVideoJob(job.id, { status: 'done', videoUrl });
      } catch (err) {
        console.error('[AudioVideo] Render failed:', err);
        await updateAudioVideoJob(job.id, { status: 'failed', error: err.message });
      }
    })();
  } catch (err) {
    console.error('[AudioVideo] Render trigger error:', err);
    res.status(500).json({ error: err.message });
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
