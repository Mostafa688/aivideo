import express from 'express';
import { authMiddleware } from './authRoutes.js';
import {
  createManagedChannel, listManagedChannelsForUser, updateManagedChannel, deleteManagedChannel,
  getDailyVideoRunByToken, updateDailyVideoRunStatus, getUserById, getManagedChannelById,
  listDailyVideoRunsForChannel, getDailyVideoRunById, linkYoutubeVideoToRun,
  getCharacterReferenceForUser, setChannelCharacter,
} from './authService.js';
import { verifyVidiqKey, getVideoPerformance } from './vidiqClientService.js';
import { triggerApprovedGeneration, sendDailyResultEmail, analyzeChannelAutomatically } from './channelSchedulerService.js';
import { getYoutubeConnectUrl, handleYoutubeOAuthCallback, disconnectYoutubeForChannel, uploadVideoToYoutube } from './youtubeUploadService.js';

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
    const { label, vidiqApiKey, formatPref, usesVoice, modelPref, setupMode } = req.body;
    if (!vidiqApiKey?.trim()) return res.status(400).json({ error: 'vidiqApiKey is required' });
    // ✅ نتأكد إن المفتاح شغال فعلاً قبل ما نحفظه — نطلع نجيب أول قناة مرتبطة بيه
    const verified = await verifyVidiqKey(vidiqApiKey.trim()).catch(e => { throw new Error('Could not verify VidIQ key: ' + e.message); });
    const channelId = verified?.channels?.[0]?.channelId || null;
    if (!channelId) return res.status(400).json({ error: `This VidIQ key is authenticated as ${verified?.authenticatedAs || 'an account'} with no linked YouTube channel — connect a channel to that VidIQ account first.` });
    const channel = await createManagedChannel(req.user.userId, {
      label: label || null, channelId, vidiqApiKey: vidiqApiKey.trim(),
      formatPref: formatPref || 'auto', usesVoice: !!usesVoice, modelPref: modelPref || 4,
      setupMode: setupMode === 'automatic' ? 'automatic' : 'manual',
    });
    res.json({ channel });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ✅ NEW: تحليل تلقائي للقناة (وضع "أوتوماتيك") — بيحدد نوع المحتوى/الستايل/هل فيه راوي/طول
// الفيديو المستهدف من بيانات القناة الحقيقية على يوتيوب+VidIQ، ويحفظهم على القناة عشان
// تتستخدم في كل تشغيلة يومية جاية (بدل ما نفترض قيم ثابتة لكل القنوات)
router.post('/:id/analyze', authMiddleware, async (req, res) => {
  try {
    const channel = await getManagedChannelById(req.params.id);
    if (!channel || channel.user_id !== req.user.userId) return res.status(404).json({ error: 'Channel not found' });
    const result = await analyzeChannelAutomatically(channel);
    res.json({ result });
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

// ✅ NEW: ربط قناة بشخصية محفوظة من مكتبة الشخصيات — لازم للـ"character_adventure" content
// style. نتأكد إن الشخصية دي بتاعة نفس العميل قبل ما نربطها (مش أي id عشوائي من عميل تاني)
router.post('/:id/character', authMiddleware, async (req, res) => {
  try {
    const { characterReferenceId } = req.body;
    if (characterReferenceId) {
      const character = await getCharacterReferenceForUser(characterReferenceId, req.user.userId);
      if (!character) return res.status(404).json({ error: 'Character not found or not yours' });
    }
    const channel = await setChannelCharacter(req.params.id, req.user.userId, characterReferenceId || null);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({ channel });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { label, formatPref, usesVoice, modelPref, status, contentStyle, contentBrief } = req.body;
    const patch = {};
    if (label !== undefined) patch.label = label;
    if (formatPref !== undefined) patch.format_pref = formatPref;
    if (usesVoice !== undefined) patch.uses_voice = usesVoice;
    if (modelPref !== undefined) patch.model_pref = modelPref;
    if (status !== undefined) patch.status = status;
    // ✅ NEW: اختيار يدوي لنوع المحتوى (بما فيه "character_adventure") — لو العميل في وضع
    // "يدوي" وعايز يحدد النوع بنفسه بدل ما ينتظر تحليل أوتوماتيك
    if (contentStyle !== undefined) patch.content_style = ['realistic', 'map', 'animated', 'character_adventure', 'whiteboard_sketch', ''].includes(contentStyle) ? (contentStyle || null) : undefined;
    // ✅ NEW: بريف حر بالنص من العميل (وضع يدوي) — وصف المحتوى/طريقة عمل الفيديو/الأدوات
    // المطلوبة، بيتضاف كتوجيه إضافي لكل فكرة يومية بتتعمل للقناة دي (راجع draftDailyIdea)
    if (contentBrief !== undefined) patch.content_brief = String(contentBrief || '').slice(0, 2000) || null;
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

// ══════════════════════════════════════════════════════════════════════════
//  ✅ NEW: الرفع التلقائي على يوتيوب — الحلقة الناقصة (راجع youtubeUploadService.js
//  للشرح الكامل). لسه مش هيشتغل فعليًا لأي عميل حقيقي لحد ما جوجل يوثّق صلاحية
//  youtube.upload — الكود جاهز وهيشتغل تلقائي أول ما التوثيق يخلص.
// ══════════════════════════════════════════════════════════════════════════
router.get('/:id/youtube-connect', authMiddleware, async (req, res) => {
  try {
    const channel = await getManagedChannelById(req.params.id);
    if (!channel || channel.user_id !== req.user.userId) return res.status(404).json({ error: 'Channel not found' });
    res.json({ url: getYoutubeConnectUrl(channel.id, req.user.userId) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ Google بيرجع هنا مباشرة (من غير Authorization header) — بنتحقق من هوية العميل/القناة
// من الـstate الموقّع بنفسنا (JWT) بدل authMiddleware العادي
router.get('/youtube-callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://erivion.net';
  const { code, state, error } = req.query;
  if (error || !code || !state) {
    return res.redirect(`${frontendUrl}?page=channels&youtube_error=${encodeURIComponent(error || 'missing_code')}`);
  }
  try {
    await handleYoutubeOAuthCallback(code, state);
    res.redirect(`${frontendUrl}?page=channels&youtube_connected=1`);
  } catch (e) {
    console.error('[ChannelRoutes] YouTube OAuth callback failed:', e.message);
    res.redirect(`${frontendUrl}?page=channels&youtube_error=${encodeURIComponent(e.message)}`);
  }
});

router.post('/:id/youtube-disconnect', authMiddleware, async (req, res) => {
  try {
    await disconnectYoutubeForChannel(req.params.id, req.user.userId);
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

// ✅ NEW: بيتابع حالة تشغيلة "دلوقتي" اللي الايجنت بدأها من الشات (راجع triggerChannelRunNow
// في channelSchedulerService.js) — نفس الـrow المستخدم في التشغيل اليومي العادي، بس هنا
// الفرونت إند (كارت في الشات، زي WhiteboardCard) بيعمله poll لحد ما يخلص أو يفشل
router.get('/runs/:runId/status', authMiddleware, async (req, res) => {
  try {
    const run = await getDailyVideoRunById(req.params.runId, req.user.userId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json({ run: {
      id: run.id, status: run.status, ideaTitle: run.idea_title, videoUrl: run.video_url,
      youtubeVideoId: run.youtube_video_id, error: run.error, creditsCharged: run.credits_charged,
    } });
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

      // ✅ NEW: لو القناة متربطة بيوتيوب (youtube-connect)، نرفع الفيديو تلقائي هنا —
      // بدل ما نسيب العميل يرفعه بإيده ويلصق اللينك. لو الرفع فشل لأي سبب (زي التوثيق
      // لسه ما خلصش من جوجل)، منوقفش حاجة — الفيديو خلص فعلاً والعميل لسه يقدر يرفعه
      // يدوي بنفس المسار القديم بالظبط، بس هيبان تحذير في اللوجز يوضح السبب
      try {
        const channel = await getManagedChannelById(run.channel_id);
        if (channel?.youtube_refresh_token) {
          const youtubeVideoId = await uploadVideoToYoutube(channel, { videoUrl, title: idea.title, description: idea.description || idea.brief || '', tags: idea.tags });
          await linkYoutubeVideoToRun(run.id, run.user_id, youtubeVideoId);
        }
      } catch (uploadErr) {
        console.warn(`[ChannelRoutes] Auto-upload to YouTube failed for run ${run.id} (customer can still upload manually):`, uploadErr.message);
      }

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
