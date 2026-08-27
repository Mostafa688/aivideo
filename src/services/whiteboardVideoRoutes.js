// ── whiteboardVideoRoutes.js ─────────────────────────────────────────────────
// ✅ NEW (طلب العميل): "الموقع بقى يقدر يعمل فيديو whiteboard 30 ثانية للناس كلها مجانًا
// بدون كريديت" — نفس محرك مصنع فيديو الصوت الأدمن بالظبط (audioVideoService.js/
// audioVideoRenderService.js)، بس هنا:
// - مصادقة مستخدم حقيقي (authMiddleware — JWT، مش x-admin-secret) بدل الأدمن.
// - Pipeline تلقائي بالكامل (المستخدم برفع صوت بس، والباقي بيحصل لوحده — مفيش خطوات
//   يدوية زي لوحة الأدمن).
// - رصيد مجاني إجمالي 10 دقايق (600 ثانية) مدى الحياة لكل حساب (مش لكل فيديو) — أول فيديو
//   بياخد 30 ثانية بس من الصوت المرفوع (لو الصوت أطول، الباقي بيتحفظ للتكملة لاحقًا عبر
//   "Continue Video" — ميزة منفصلة لسه هتتبني).
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from './authRoutes.js';
import { transcribeAudioWithTimestamps, uploadAudioVideoSourceToR2, tmpAudioPath, extractVideoElements, resolveElementImages } from './audioVideoService.js';
import { renderAudioVideoJob } from './audioVideoRenderService.js';
import { createAudioVideoJob, updateAudioVideoJob, getAudioVideoJobForUser, listAudioVideoJobsForUser, getUserWhiteboardFreeSecondsUsed, addUserWhiteboardFreeSecondsUsed, WHITEBOARD_FREE_SECONDS_LIFETIME, getReferenceImagesMap } from './authService.js';
import fs from 'fs';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ✅ أول فيديو مجاني بيتقفل عند 30 ثانية بالظبط — الباقي (لو الصوت المرفوع أطول) بيتغطى
// لاحقًا في خطوة "Continue Video" (لسه هتتبني) من غير ما يحتاج المستخدم يرفع الصوت تاني
const INITIAL_VIDEO_SECONDS = 30;

// ✅ بروتكشن IP إضافي فوق رصيد الـ10 دقايق/حساب نفسه (اللي هو الحماية الحقيقية من إساءة
// الاستخدام) — على /create بس، مش على /jobs/:id اللي الفرونت إند بيعمله poll متكرر أثناء الرندر
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 15,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many video creation attempts. Please wait before trying again.' },
});

router.get('/budget', authMiddleware, async (req, res) => {
  try {
    const used = await getUserWhiteboardFreeSecondsUsed(req.user.userId);
    res.json({ usedSeconds: used, limitSeconds: WHITEBOARD_FREE_SECONDS_LIFETIME, remainingSeconds: Math.max(0, WHITEBOARD_FREE_SECONDS_LIFETIME - used) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs', authMiddleware, async (req, res) => {
  try {
    const jobs = await listAudioVideoJobsForUser(req.user.userId);
    res.json({ jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/jobs/:id', authMiddleware, async (req, res) => {
  try {
    const job = await getAudioVideoJobForUser(req.params.id, req.user.userId);
    if (!job) return res.status(404).json({ error: 'not_found' });
    res.json({ job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Pipeline كامل (رفع → تفريغ → استخراج → رندر) في نداء واحد، بيرجع فورًا (async — الشغل
// بيحصل في الخلفية) والفرونت إند بيعمل poll على GET /jobs/:id لحد ما status يبقى done/failed
// — بخلاف لوحة الأدمن، المستخدم العادي مش المفروض يشوف/يتحكم في خطوات وسيطة
router.post('/create', authMiddleware, createLimiter, upload.single('audio'), async (req, res) => {
  const userId = req.user.userId;
  let tmpPath = null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const usedSeconds = await getUserWhiteboardFreeSecondsUsed(userId);
    const remainingSeconds = WHITEBOARD_FREE_SECONDS_LIFETIME - usedSeconds;
    if (remainingSeconds <= 0) {
      return res.status(402).json({ error: 'free_budget_exhausted', usedSeconds, limitSeconds: WHITEBOARD_FREE_SECONDS_LIFETIME });
    }
    const thisVideoSeconds = Math.min(INITIAL_VIDEO_SECONDS, remainingSeconds);

    tmpPath = tmpAudioPath(req.file.originalname);
    fs.writeFileSync(tmpPath, req.file.buffer);
    const { text, words } = await transcribeAudioWithTimestamps(tmpPath);
    if (!words.length) return res.status(400).json({ error: 'Could not transcribe any speech from this audio' });

    const audioUrl = await uploadAudioVideoSourceToR2(req.file.buffer, (req.file.originalname.split('.').pop() || 'mp3'));
    // ✅ FIX (بلاغ العميل: الفيديو طلع 9:16 — فيديوهات whiteboard لازم تكون 16:9 دايمًا)
    const job = await createAudioVideoJob({ audioUrl, transcriptText: text, wordsJson: words, status: 'extracting', userId, ratio: req.body?.ratio || '16:9' });
    res.json({ job, thisVideoSeconds });

    (async () => {
      try {
        // ✅ الاستخراج هنا بيتقصر على الجزء المطلوب رندره فعليًا دلوقتي (+ ثانية هامش) —
        // مش كل الصوت المرفوع (ممكن يكون لحد 10 دقايق) — توفيرًا لتكلفة LLM/وقت غير مستخدَم
        // لو المستخدم مكملش الفيديو أصلًا. لو كمّل لاحقًا، هيتم استخراج الجزء التالي وقتها
        const windowWords = words.filter(w => w.start < thisVideoSeconds + 1);
        const elements = await extractVideoElements(windowWords);
        if (!elements.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements extracted from transcript' });
          return;
        }
        // ✅ FIX (بلاغ العميل: "العناصر مظهرتش") — كان ناقص هنا خالص: extractVideoElements
        // بترجع بس النص/النوع/كلمات البحث المقترحة، مش imageUrl فعلي. من غير الخطوة دي (نفسها
        // المستخدمة في أداة الأدمن)، كل عنصر character/object كان بيتحط في الرندر من غير أي
        // صورة، وبما إن الكابشن مش بيتحط على character/object أصلًا (بس على text/quote)،
        // الفيديو كان بيطلع فاضي تمامًا — لا ملصق ولا نص
        const referenceImages = await getReferenceImagesMap();
        const withImages = await resolveElementImages(elements, referenceImages);
        if (!withImages.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements could be processed' });
          return;
        }
        await updateAudioVideoJob(job.id, { elementsJson: withImages, status: 'rendering' });
        const renderJob = await getAudioVideoJobForUser(job.id, userId);
        const videoUrl = await renderAudioVideoJob(renderJob, { maxDurationSec: thisVideoSeconds });
        await updateAudioVideoJob(job.id, { status: 'done', videoUrl });
        await addUserWhiteboardFreeSecondsUsed(userId, thisVideoSeconds);
      } catch (err) {
        console.error('[WhiteboardVideo] Pipeline failed:', err);
        await updateAudioVideoJob(job.id, { status: 'failed', error: err.message }).catch(() => {});
      }
    })();
  } catch (err) {
    console.error('[WhiteboardVideo] Create error:', err);
    res.status(500).json({ error: err.message || 'Could not start video creation' });
  } finally {
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch {} }
  }
});

export default router;
