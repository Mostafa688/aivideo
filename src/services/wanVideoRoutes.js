import express from 'express';
import { generateWanVideo } from './wanVideoService.js';
import { authMiddleware } from './authRoutes.js';

const router = express.Router();

const framesMap = { 5: 33, 10: 65, 15: 97 };
const qualityMap = {
  '480p': { width: 832, height: 480 },
  '720p': { width: 1280, height: 720 }
};

router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { prompt, negative_prompt = '', duration = 5, quality = '480p' } = req.body;

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

    const num_frames = framesMap[duration] || 33;
    const { width, height } = qualityMap[quality] || qualityMap['480p'];

    console.log(`WAN video generation started - User: ${req.user.id}`);

    const result = await generateWanVideo({ prompt, negative_prompt, num_frames, width, height });

    res.json({ success: true, videoUrl: result.videoUrl });

  } catch (error) {
    console.error('WAN route error:', error.message);
    res.status(500).json({ error: error.message || 'Video generation failed' });
  }
});

export default router;