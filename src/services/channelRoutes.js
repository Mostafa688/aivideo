import express from 'express';
import { authMiddleware } from './authRoutes.js';
import {
  createManagedChannel, listManagedChannelsForUser, updateManagedChannel, deleteManagedChannel,
  getDailyVideoRunByToken, updateDailyVideoRunStatus, getUserById, getManagedChannelById,
  listDailyVideoRunsForChannel, getDailyVideoRunById, linkYoutubeVideoToRun,
} from './authService.js';
import { verifyVidiqKey, getVideoPerformance } from './vidiqClientService.js';
import { triggerApprovedGeneration, sendDailyResultEmail } from './channelSchedulerService.js';

const router = express.Router();

// ✅ بيقبل رابط يوتيوب كامل (watch/shorts/youtu.be) أو الـ video ID الخام (11 حرف) مباشرة
function extractYoutubeVideoId(input) {
  const s = String(input || '').trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { label, vidiqApiKey, formatPref, usesVoice, modelPref } = req.body;
    if (!vidiqApiKey?.trim()) return res.status(400).json({ error: 'vidiqApiKey is required' });
    // ✅ نتأكد إن المفتاح شغال فعلاً قبل ما نحفظه — نطلع نجيب أول قناة مرتبطة بيه
    const verified = await verifyVidiqKey(vidiqApiKey.trim()).catch(e => { throw new Error('Could not verify VidIQ key: ' + e.message); });
    const channelId = verified?.channels?.[0]?.channelId || null;
    if (!channelId) return res.status(400).json({ error: `This VidIQ key is authenticated as ${verified?.authenticatedAs || 'an account'} with no linked YouTube channel — connect a channel to that VidIQ account first.` });
    const channel = await createManagedChannel(req.user.userId, {
      label: label || null, channelId, vidiqApiKey: vidiqApiKey.trim(),
      formatPref: formatPref || 'auto', usesVoice: !!usesVoice, modelPref: modelPref || 4,
    });
    res.json({ channel });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  try {
    const channels = await listManagedChannelsForUser(req.user.userId);
    res.json({ channels });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { label, formatPref, usesVoice, modelPref, status } = req.body;
    const patch = {};
    if (label !== undefined) patch.label = label;
    if (formatPref !== undefined) patch.format_pref = formatPref;
    if (usesVoice !== undefined) patch.uses_voice = usesVoice;
    if (modelPref !== undefined) patch.model_pref = modelPref;
    if (status !== undefined) patch.status = status;
    const channel = await updateManagedChannel(req.params.id, req.user.userId, patch);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({ channel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await deleteManagedChannel(req.params.id, req.user.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── تحليلات الأداء — سجل فيديوهات القناة، ربط كل واحد بلينك اليوتيوب الحقيقي بعد الرفع
// اليدوي، وجلب أداءه الفعلي (مشاهدات/لايكات/كومنتات) من VidIQ عند الطلب ────────────────
router.get('/:id/runs', authMiddleware, async (req, res) => {
  try {
    const channel = await getManagedChannelById(req.params.id);
    if (!channel || channel.user_id !== req.user.userId) return res.status(404).json({ error: 'Channel not found' });
    const runs = await listDailyVideoRunsForChannel(req.params.id, req.user.userId);
    res.json({ runs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/runs/:runId/link-youtube', authMiddleware, async (req, res) => {
  try {
    const videoId = extractYoutubeVideoId(req.body.youtubeUrl);
    if (!videoId) return res.status(400).json({ error: 'Could not find a valid YouTube video ID in that link' });
    const run = await linkYoutubeVideoToRun(req.params.runId, req.user.userId, videoId);
    if (!run) return res.status(404).json({ error: 'Run not found, not yours, or not a completed video yet' });
    res.json({ run });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/runs/:runId/performance', authMiddleware, async (req, res) => {
  try {
    const run = await getDailyVideoRunById(req.params.runId, req.user.userId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (!run.youtube_video_id) return res.status(400).json({ error: 'No YouTube video linked to this run yet' });
    const channel = await getManagedChannelById(run.channel_id);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    const performance = await getVideoPerformance(channel.vidiq_api_key, run.youtube_video_id);
    if (!performance) return res.status(502).json({ error: 'VidIQ returned no data for this video yet — it may take a little while after upload' });
    res.json({ performance });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// ── الموافقة/الرفض بييجوا من لينك الإيميل — من غير تسجيل دخول، بالتوكن بس ──────────
router.get('/daily-approve', async (req, res) => {
  const { token } = req.query;
  const run = await getDailyVideoRunByToken(token).catch(() => null);
  if (!run) return res.status(404).send('Link not found or expired.');
  if (run.status !== 'pending') {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><h2>This request was already ${run.status}.</h2></body></html>`);
  }
  await updateDailyVideoRunStatus(run.id, 'generating', { decided: true });
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><div style="font-size:56px">🎬</div><h2 style="color:#22c55e">Got it — making your video now!</h2><p style="color:#9ca3af">You'll get an email when it's ready.</p></body></html>`);

  (async () => {
    const idea = JSON.parse(run.idea_brief || '{}');
    try {
      const videoUrl = await triggerApprovedGeneration(run);
      await updateDailyVideoRunStatus(run.id, 'done', { videoUrl });
      const user = await getUserById(run.user_id);
      await sendDailyResultEmail(user.email, idea, videoUrl, true);
    } catch (e) {
      console.error('[ChannelRoutes] Approved generation failed:', e.message);
      const isCredits = e.message.startsWith('insufficient_credits');
      const errorMsg = isCredits ? 'Not enough credits — please top up to keep your daily videos running.' : e.message;
      await updateDailyVideoRunStatus(run.id, 'failed', { error: errorMsg });
      const user = await getUserById(run.user_id);
      await sendDailyResultEmail(user.email, idea, null, false, errorMsg);
    }
  })();
});

router.get('/daily-reject', async (req, res) => {
  const { token } = req.query;
  const run = await getDailyVideoRunByToken(token).catch(() => null);
  if (!run) return res.status(404).send('Link not found or expired.');
  if (run.status === 'pending') await updateDailyVideoRunStatus(run.id, 'rejected', { decided: true });
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><div style="font-size:56px">👍</div><h2>No problem — skipped for today.</h2></body></html>`);
});

export default router;
