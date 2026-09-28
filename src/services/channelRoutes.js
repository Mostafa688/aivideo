import express from 'express';
import { authMiddleware } from './authRoutes.js';
import {
  createManagedChannel, listManagedChannelsForUser, updateManagedChannel, deleteManagedChannel,
  getDailyVideoRunByToken, updateDailyVideoRunStatus, getUserById, getManagedChannelById,
  claimDailyVideoRunForGeneration, claimRunForPublishing, releasePublishingClaim, acknowledgeYoutubePublish,
  listDailyVideoRunsForChannel, getDailyVideoRunById, linkYoutubeVideoToRun,
  getCharacterReferenceForUser, setChannelCharacter, getDailyVideoRunByReviewToken,
} from './authService.js';
import { verifyVidiqKey, getVideoPerformance } from './vidiqClientService.js';
import { YOUTUBE_PUBLISH_ENABLED } from './featureFlags.js';
import { triggerApprovedGeneration, sendDailyResultEmail, analyzeChannelAutomatically, finalizeChannelRunAfterGeneration, resolveChannelRunReviewAction } from './channelSchedulerService.js';
import { getYoutubeConnectUrl, handleYoutubeOAuthCallback, disconnectYoutubeForChannel } from './youtubeUploadService.js';
import { NEW_IMAGE_MODELS } from './newImageModelsService.js';
import { NEW_VIDEO_MODELS } from './newVideoModelsService.js';

// ✅ NEW (طلب العميل: يختار بنفسه أي موديل يتحرك/يترسم بيه بدل ما يتفاجئ بأغلى موديل تحريك
// اتخصم منه بصمت) — بس الموديلات اللي فعلاً بتقبل صورة كمدخل (مش موديلات تعديل فيديو بحتة
// زي decart_lucy_edit_2) صالحة كـ"موديل تحريك" هنا، لأن البايبلاين بيبعتلها صورة مشهد كمدخل
const ALLOWED_IMAGE_MODELS = new Set(Object.keys(NEW_IMAGE_MODELS));
const ALLOWED_ANIMATION_MODELS = new Set(Object.keys(NEW_VIDEO_MODELS).filter(k => NEW_VIDEO_MODELS[k].supportsImageInput));

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
    res.json({ channels, youtubePublishEnabled: YOUTUBE_PUBLISH_ENABLED });
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
    const { label, formatPref, usesVoice, modelPref, status, contentStyle, contentBrief, imageModel, animationModel, targetSceneCount, captionsEnabled } = req.body;
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
    // ✅ NEW (طلب العميل: يختار بنفسه أي موديل صور/تحريك يتستخدم بدل ما الموقع يفرض الأغلى
    // دايمًا) — فاضي/null = يرجع للافتراضي القديم (nano_banana_2/seedance_2_5)
    if (imageModel !== undefined) patch.image_model = ALLOWED_IMAGE_MODELS.has(imageModel) ? imageModel : null;
    if (animationModel !== undefined) patch.animation_model = ALLOWED_ANIMATION_MODELS.has(animationModel) ? animationModel : null;
    // ✅ NEW (طلب العميل: عايز يضمن عدد مشاهد محدد بالظبط، مش بس توجيه لطيف في content_brief
    // ممكن الـAI يتجاهله) — رقم فاضي/0 = يرجع لتقدير الشكل الافتراضي (SHORT_FORM/LONG_FORM)
    // زي ما كان. الحد الأقصى 20 نفس MAX_SCENES في channelSchedulerService.js، والحد الأدنى 2
    // (توليد مشهد واحد بس بيترفض أصلاً في generate-scenes)
    if (targetSceneCount !== undefined) {
      const n = parseInt(targetSceneCount, 10);
      patch.target_scene_count = (Number.isInteger(n) && n >= 2 && n <= 20) ? n : null;
    }
    // ✅ NEW (طلب العميل: مش عايز كابشن على فيديو الديمو — captions كان بيتحط تلقائي على أي
    // قناة بتستخدم صوت، مفيش toggle مستقل قبل كده)
    if (captionsEnabled !== undefined) patch.captions_enabled = captionsEnabled ? 1 : 0;
    const channel = await updateManagedChannel(req.params.id, req.user.userId, patch);
    if (!channel) return res.status(404).json({ error: 'Channel not found' });
    res.json({ channel });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ موافقة صريحة (مرة واحدة لكل قناة) على إن النشر على يوتيوب عن طريق Erivion بمسؤولية العميل —
// بدونها النشر (من الإيميل/الداشبورد/MCP) مرفوض
router.post('/:id/publish-ack', authMiddleware, async (req, res) => {
  try {
    const ok = await acknowledgeYoutubePublish(req.params.id, req.user.userId);
    if (!ok) return res.status(404).json({ error: 'Channel not found' });
    res.json({ ok: true });
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
    if (!YOUTUBE_PUBLISH_ENABLED) return res.status(403).json({ error: 'YouTube publishing from Erivion is turned off.' });
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

// ✅ NEW (طلب العميل: "تمت المراجعة"/"نشر الآن" لازم تكون موجودة جوه الموقع نفسه كمان،
// مش بس في الإيميل، "عشان قوة المصداقية والمراجعة الدقيقة") — نفس فعل resolveChannelRunReviewAction
// المستخدم في مسار التوكن (/review-action تحت)، بس هنا العميل داخل حسابه فعلاً
// ✅ حزمة الرفع الجاهزة لفيديو قناة: العنوان والوصف والكلمات المفتاحية والصورة المصغرة والفيديو
router.get('/runs/:runId/package', authMiddleware, async (req, res) => {
  try {
    const run = await getDailyVideoRunById(req.params.runId, req.user.userId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const idea = JSON.parse(run.idea_brief || '{}');
    res.json({
      title: idea.title || '', description: idea.description || idea.brief || '',
      tags: Array.isArray(idea.tags) ? idea.tags : [], language: idea.videoLanguage || null,
      thumbnailUrl: run.thumbnail_url || null, videoUrl: run.video_url || null,
      publishEnabled: YOUTUBE_PUBLISH_ENABLED,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/runs/:runId/review', authMiddleware, async (req, res) => {
  try {
    const run = await getDailyVideoRunById(req.params.runId, req.user.userId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const result = await resolveChannelRunReviewAction(run, 'reviewed');
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/runs/:runId/publish', authMiddleware, async (req, res) => {
  try {
    const run = await getDailyVideoRunById(req.params.runId, req.user.userId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    const result = await resolveChannelRunReviewAction(run, 'publish');
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ error: e.message });
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
  // ✅ FIX (باج حقيقي: سباق بين طلبين متزامنين على نفس اللينك — مثلًا email link-scanner بيعمل
  // prefetch للينك، أو العميل يضغط مرتين بسرعة — كان بيولّد الفيديو مرتين ويخصم كريديت مرتين
  // لموافقة واحدة بس. claimDailyVideoRunForGeneration بتعمل UPDATE...WHERE status='pending'
  // ذرّي حقيقي بدل فحص run.status في الكود؛ لو حد تاني كسب السباق، مفيش صف يرجع فنوقف هنا
  const claimed = await claimDailyVideoRunForGeneration(run.id);
  if (!claimed) {
    return res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><h2>This request was already handled.</h2></body></html>`);
  }
  res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><div style="font-size:56px">🎬</div><h2 style="color:#22c55e">Got it — making your video now!</h2><p style="color:#9ca3af">You'll get an email when it's ready.</p></body></html>`);

  (async () => {
    const run = claimed;
    const idea = JSON.parse(run.idea_brief || '{}');
    try {
      const videoUrl = await triggerApprovedGeneration(run);
      // ✅ FIX (طلب العميل: "العميل يراجع الفيديو الأول وبعد كده يوافق على النشر او لا"):
      // مفيش رفع تلقائي فوري ليوتيوب هنا تاني — finalizeChannelRunAfterGeneration بتحط
      // التشغيلة في حالة "محتاجة مراجعة"، تضيفها كفيديو حقيقي في مشروع القناة، وتبعت إيميل
      // مراجعة فيه زرارين ("تمت المراجعة"/"نشر الآن") — نفس الدالة المستخدمة في المسار
      // التاني (triggerChannelRunNow، الشات) عشان المسارين يفضلوا متطابقين
      const channel = await getManagedChannelById(run.channel_id);
      await finalizeChannelRunAfterGeneration(run, channel, idea, videoUrl, null);
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

// ✅ NEW: "تمت المراجعة"/"نشر الآن" من زرارين الإيميل — من غير تسجيل دخول، بتوكن مراجعة
// منفصل عن approve_token (راجع review_token في authService.js وsendDailyResultEmail فوق)
router.get('/review-action', async (req, res) => {
  const { token, action } = req.query;
  const run = await getDailyVideoRunByReviewToken(token).catch(() => null);
  if (!run) return res.status(404).send('Link not found or expired.');
  if (!['reviewed', 'publish'].includes(action)) return res.status(400).send('Invalid action.');
  try {
    const result = await resolveChannelRunReviewAction(run, action);
    const html = action === 'publish'
      ? `<div style="font-size:56px">🚀</div><h2 style="color:#22c55e">Published!</h2><p style="color:#9ca3af">Your video is now live on YouTube${result.youtubeVideoId ? `: <a href="https://youtube.com/watch?v=${result.youtubeVideoId}" style="color:#7c6af7">watch it</a>` : ''}.</p>`
      : `<div style="font-size:56px">✅</div><h2 style="color:#22c55e">Marked as reviewed</h2><p style="color:#9ca3af">You can publish it to YouTube anytime from the video's project on Erivion.</p>`;
    res.send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff">${html}</body></html>`);
  } catch (e) {
    res.status(400).send(`<html><body style="font-family:sans-serif;text-align:center;padding:60px;background:#0f0f1a;color:#fff"><div style="font-size:56px">⚠️</div><h2 style="color:#ef4444">Couldn't do that</h2><p style="color:#9ca3af">${e.message}</p></body></html>`);
  }
});

export default router;
