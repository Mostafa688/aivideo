import express from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from './authService.js';
import { renderMapVideo } from './mapVideoService.js';

const router = express.Router();

// In-memory job store
const jobs = {};

function updateStatus(jobId, update) {
  if (!jobs[jobId]) return;
  if (update.progress !== undefined) jobs[jobId].progress = update.progress;
  if (update.log) {
    if (Array.isArray(update.log)) {
      jobs[jobId].log = [...(jobs[jobId].log || []), ...update.log];
    } else {
      jobs[jobId].log = [...(jobs[jobId].log || []), update.log];
    }
  }
}

// POST /api/map-video/generate
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const formData = req.body;
    if (!formData) return res.status(400).json({ error: 'Missing form data' });

    const jobId = `mapvideo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jobDir = path.join(process.cwd(), 'tmp', 'map-jobs', jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    jobs[jobId] = { status: 'processing', progress: 5, log: ['🗺️ Job started...'] };

    // Run async
    (async () => {
      try {
        const outputPath = await renderMapVideo({ jobId, formData, jobDir, updateStatus });

        // Serve from /tmp/map-jobs or upload to cloud
        const publicPath = `/api/map-video/result/${jobId}/output.mp4`;
        jobs[jobId].status = 'done';
        jobs[jobId].progress = 100;
        jobs[jobId].videoUrl = publicPath;
        jobs[jobId].log.push('🎉 Done!');
      } catch (e) {
        console.error('[MapVideo] Error:', e.message);
        jobs[jobId].status = 'error';
        jobs[jobId].error = e.message;
        jobs[jobId].log = [...(jobs[jobId].log || []), `❌ Error: ${e.message}`];
      }
    })();

    res.json({ jobId });
  } catch (e) {
    console.error('[MapVideo] Start error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/map-video/status/:jobId
router.get('/status/:jobId', authMiddleware, (req, res) => {
  const job = jobs[req.params.jobId];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({
    status: job.status,
    progress: job.progress,
    log: job.log,
    videoUrl: job.videoUrl,
    error: job.error,
  });
});

// GET /api/map-video/result/:jobId/:file — serve the video file
router.get('/result/:jobId/:file', (req, res) => {
  const filePath = path.join(process.cwd(), 'tmp', 'map-jobs', req.params.jobId, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

export default router;
