// ── whiteboardVideoRoutes.js ─────────────────────────────────────────────────
// ✅ NEW (طلب العميل): "الموقع بقى يقدر يعمل فيديو whiteboard 30 ثانية للناس كلها مجانًا
// بدون كريديت" — نفس محرك مصنع فيديو الصوت الأدمن بالظبط (audioVideoService.js/
// audioVideoRenderService.js)، بس هنا:
// - مصادقة مستخدم حقيقي (authMiddleware — JWT، مش x-admin-secret) بدل الأدمن.
// - Pipeline تلقائي بالكامل للفيديو الأول (المستخدم برفع صوت بس، والباقي بيحصل لوحده).
// - رصيد مجاني إجمالي 10 دقايق (600 ثانية) مدى الحياة لكل حساب (مش لكل فيديو).
//
// ✅ NEW ("Continue Video"): بعد أول 30 ثانية، المستخدم يقدر "يكمّل" الفيديو لحد الرصيد
// المجاني كله (10 دقايق)، بطريقتين:
// - AI: يرفع صوت إضافي، والنظام يستخرج/يحط العناصر تلقائي زي الأول (POST /jobs/:id/extend
//   mode=ai).
// - يدوي: يرفع صوت إضافي بس، من غير استخراج تلقائي — بيفتح نفس محرر التايم لاين (زي
//   الأدمن بالظبط، AudioVideoTimelineEditor.jsx) يضيف/يبحث عن ملصقات ونصوص بنفسه (POST
//   /jobs/:id/extend mode=manual، وبعدين نفس endpoints التايم لاين: /elements،
//   /element-image، /element-from-search، /render — كلهم هنا نسخة "مستخدم" من نفس
//   endpoints الأدمن في audioVideoRoutes.js، بنفس المنطق بالظبط).
//
// محاسبة الرصيد: بيتسجّل "rendered_seconds" لكل job (آخر مدة اتعمل لها رندر فعلي)، وأي
// رندر جديد (تكملة يدوي أو AI) بيخصم بس الفرق الجديد (rendered_seconds الجديد - القديم)
// من رصيد الحساب الإجمالي — مش الفيديو كله من الأول في كل مرة
import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { authMiddleware } from './authRoutes.js';
import { transcribeAudioWithTimestamps, uploadAudioVideoSourceToR2, uploadElementImageToR2, tmpAudioPath, extractVideoElements, resolveElementImages, searchStickerCandidates } from './audioVideoService.js';
import { renderAudioVideoJob } from './audioVideoRenderService.js';
import { createAudioVideoJob, updateAudioVideoJob, getAudioVideoJobForUser, listAudioVideoJobsForUser, getUserWhiteboardFreeSecondsUsed, addUserWhiteboardFreeSecondsUsed, WHITEBOARD_FREE_SECONDS_LIFETIME, getReferenceImagesMap } from './authService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ✅ أول فيديو مجاني بيتقفل عند 30 ثانية بالظبط — الباقي بيتغطى لاحقًا عبر "Continue Video"
const INITIAL_VIDEO_SECONDS = 30;

// ✅ بروتكشن IP إضافي فوق رصيد الـ10 دقايق/حساب نفسه — على العمليات المكلفة بس (إنشاء/تكملة/رندر)
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 15,
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many video creation attempts. Please wait before trying again.' },
});

function estimateWordsDurationSec(words) {
  return words.length ? words[words.length - 1].end + 0.3 : 0;
}

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

// ✅ نسخة "مستخدم" من بحث الملصقات — نفس audioVideoRoutes.js بالظبط، بس authMiddleware
// بدل adminAuth. مستخدمة في محرر التايم لاين لما apiBase = '/api/whiteboard-video'
router.get('/sticker-search', authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ results: [] });
    const results = await searchStickerCandidates(q, 16);
    res.json({ results });
  } catch (err) {
    console.error('[WhiteboardVideo] Sticker search error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Pipeline كامل (رفع → تفريغ → استخراج → رندر) في نداء واحد للفيديو الأول — بيرجع فورًا
// (async — الشغل بيحصل في الخلفية) والفرونت إند بيعمل poll على GET /jobs/:id
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
    const job = await createAudioVideoJob({ audioUrl, transcriptText: text, wordsJson: words, status: 'extracting', userId, ratio: req.body?.ratio || '16:9' });
    res.json({ job, thisVideoSeconds });

    (async () => {
      try {
        const windowWords = words.filter(w => w.start < thisVideoSeconds + 1);
        const elements = await extractVideoElements(windowWords);
        if (!elements.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements extracted from transcript' });
          return;
        }
        const referenceImages = await getReferenceImagesMap();
        const withImages = await resolveElementImages(elements, referenceImages);
        if (!withImages.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements could be processed' });
          return;
        }
        await updateAudioVideoJob(job.id, { elementsJson: withImages, status: 'rendering' });
        const renderJob = await getAudioVideoJobForUser(job.id, userId);
        const videoUrl = await renderAudioVideoJob(renderJob, { maxDurationSec: thisVideoSeconds });
        await updateAudioVideoJob(job.id, { status: 'done', videoUrl, renderedSeconds: thisVideoSeconds });
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

// ✅ NEW ("Continue Video"): بيرفع صوت إضافي، بيدمجه مع الصوت الأصلي (فلتر concat — نفس
// تقنية الأجزاء المتعددة في audioVideoRoutes.js)، وبيمدد الترانسكريبت (words_json) بتوقيت
// صحيح (offset = المدة الحقيقية للصوت القديم مقيسة بـffprobe، مش rendered_seconds، عشان
// مفيش كلمة تتكرر أو تضيع). mode=ai بيستخرج عناصر تلقائي للجزء الجديد بس ويرندر فورًا؛
// mode=manual بيمدد الترانسكريبت بس ويسيب الأدمن/المستخدم يضيف عناصر بنفسه من التايم لاين
router.post('/jobs/:id/extend', authMiddleware, createLimiter, upload.single('audio'), async (req, res) => {
  const userId = req.user.userId;
  const mode = req.body?.mode === 'manual' ? 'manual' : 'ai';
  let newTmpPath = null, oldTmpPath = null, mergedTmpPath = null;
  try {
    const job = await getAudioVideoJobForUser(req.params.id, userId);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded' });

    const usedSeconds = await getUserWhiteboardFreeSecondsUsed(userId);
    const remainingSeconds = WHITEBOARD_FREE_SECONDS_LIFETIME - usedSeconds;
    if (remainingSeconds <= 0) {
      return res.status(402).json({ error: 'free_budget_exhausted', usedSeconds, limitSeconds: WHITEBOARD_FREE_SECONDS_LIFETIME });
    }

    const currentDuration = Number(job.rendered_seconds) || 0;
    newTmpPath = tmpAudioPath(req.file.originalname);
    fs.writeFileSync(newTmpPath, req.file.buffer);

    // ✅ نحمّل الصوت الأصلي (القديم) عشان ندمجه محليًا — ffprobe/ffmpeg محتاجين ملف حقيقي
    const oldAudioRes = await fetch(job.audio_url);
    if (!oldAudioRes.ok) throw new Error('Could not download existing audio for merge');
    oldTmpPath = path.join('temp', `wb_old_${Date.now()}.mp3`);
    fs.mkdirSync('temp', { recursive: true });
    fs.writeFileSync(oldTmpPath, Buffer.from(await oldAudioRes.arrayBuffer()));

    const oldRealDuration = parseFloat(execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${oldTmpPath}"`,
      { encoding: 'utf8' }
    ).trim());

    mergedTmpPath = path.join('temp', `wb_merged_${Date.now()}.mp3`);
    execSync(
      `ffmpeg -y -i "${oldTmpPath}" -i "${newTmpPath}" -filter_complex "[0:a][1:a]concat=n=2:v=0:a=1[out]" -map "[out]" "${mergedTmpPath}"`,
      { stdio: 'pipe' }
    );
    const mergedBuffer = fs.readFileSync(mergedTmpPath);
    const mergedAudioUrl = await uploadAudioVideoSourceToR2(mergedBuffer, 'mp3');

    const { words: newWords } = await transcribeAudioWithTimestamps(newTmpPath);
    if (!newWords.length) return res.status(400).json({ error: 'Could not transcribe any speech from this audio' });
    const offsetNewWords = newWords.map(w => ({ word: w.word, start: w.start + oldRealDuration, end: w.end + oldRealDuration }));
    const mergedWords = [...(job.words_json || []), ...offsetNewWords];

    const naturalTotalDuration = oldRealDuration + estimateWordsDurationSec(newWords);
    const targetDuration = Math.min(naturalTotalDuration, currentDuration + remainingSeconds, WHITEBOARD_FREE_SECONDS_LIFETIME);
    if (targetDuration <= currentDuration + 0.5) {
      return res.status(402).json({ error: 'free_budget_exhausted', usedSeconds, limitSeconds: WHITEBOARD_FREE_SECONDS_LIFETIME });
    }

    await updateAudioVideoJob(job.id, { audioUrl: mergedAudioUrl, wordsJson: mergedWords });

    if (mode === 'manual') {
      // ✅ يدوي: مفيش استخراج تلقائي — بس نمدد الترانسكريبت ونسيب المستخدم يضيف عناصره
      // بنفسه من التايم لاين (نفس التايم لاين بتاع الأدمن، شوف /jobs/:id/render تحت)
      const updated = await updateAudioVideoJob(job.id, { status: 'elements_ready' });
      return res.json({ job: updated, targetDuration });
    }

    // ✅ AI: نستخرج عناصر للجزء الجديد بس (مش القديم اللي اتعمله رندر خلاص)
    res.json({ job: { ...job, status: 'extracting' }, targetDuration });
    (async () => {
      try {
        const windowWords = mergedWords.filter(w => w.start >= currentDuration && w.start < targetDuration + 1);
        const newElements = await extractVideoElements(windowWords);
        const referenceImages = await getReferenceImagesMap();
        const resolvedNew = newElements.length ? await resolveElementImages(newElements, referenceImages) : [];
        const mergedElements = [...(job.elements_json || []), ...resolvedNew];
        if (!mergedElements.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements extracted from the new audio' });
          return;
        }
        await updateAudioVideoJob(job.id, { elementsJson: mergedElements, status: 'rendering' });
        const renderJob = await getAudioVideoJobForUser(job.id, userId);
        const videoUrl = await renderAudioVideoJob(renderJob, { maxDurationSec: targetDuration });
        await updateAudioVideoJob(job.id, { status: 'done', videoUrl, renderedSeconds: targetDuration });
        await addUserWhiteboardFreeSecondsUsed(userId, targetDuration - currentDuration);
      } catch (err) {
        console.error('[WhiteboardVideo] Extend (AI) pipeline failed:', err);
        await updateAudioVideoJob(job.id, { status: 'failed', error: err.message }).catch(() => {});
      }
    })();
  } catch (err) {
    console.error('[WhiteboardVideo] Extend error:', err);
    res.status(500).json({ error: err.message || 'Could not extend video' });
  } finally {
    for (const p of [newTmpPath, oldTmpPath, mergedTmpPath]) {
      if (p) { try { fs.unlinkSync(p); } catch {} }
    }
  }
});

// ── نسخة "مستخدم" من endpoints محرر التايم لاين (نفس audioVideoRoutes.js بالظبط، بس
// authMiddleware + ملكية الـjob بدل adminAuth) — دول اللي AudioVideoTimelineEditor.jsx
// بيناديهم لما apiBase='/api/whiteboard-video' (وضع "تكملة يدوي") ──────────────────────
router.post('/jobs/:id/element-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const job = await getAudioVideoJobForUser(req.params.id, req.user.userId);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const imageUrl = await uploadElementImageToR2(req.file.buffer);
    res.json({ imageUrl });
  } catch (err) {
    console.error('[WhiteboardVideo] Element image upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs/:id/element-from-search', authMiddleware, async (req, res) => {
  try {
    const job = await getAudioVideoJobForUser(req.params.id, req.user.userId);
    if (!job) return res.status(404).json({ error: 'not_found' });
    const sourceUrl = String(req.body?.url || '').trim();
    if (!sourceUrl) return res.status(400).json({ error: 'url is required' });
    const srcRes = await fetch(sourceUrl);
    if (!srcRes.ok) return res.status(502).json({ error: 'Could not download the chosen sticker' });
    const buffer = Buffer.from(await srcRes.arrayBuffer());
    const imageUrl = await uploadElementImageToR2(buffer);
    res.json({ imageUrl });
  } catch (err) {
    console.error('[WhiteboardVideo] Element-from-search error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs/:id/elements', authMiddleware, async (req, res) => {
  try {
    const job = await getAudioVideoJobForUser(req.params.id, req.user.userId);
    if (!job) return res.status(404).json({ error: 'not_found' });
    const raw = Array.isArray(req.body?.elements) ? req.body.elements : [];
    const KNOWN_KINDS = ['character', 'object', 'text', 'quote'];
    const cleaned = raw
      .map(el => {
        const kind = KNOWN_KINDS.includes(el.kind) ? el.kind : 'text';
        const text = String(el.element ?? el.text ?? '').slice(0, 200).trim();
        return {
          element: text, text, kind,
          imagePrompt: kind === 'text' || kind === 'quote' ? null : (el.imagePrompt ? String(el.imagePrompt).slice(0, 300).trim() : null),
          characterKey: kind === 'character' && el.characterKey ? String(el.characterKey).toLowerCase().trim().slice(0, 60) : null,
          quoteSource: kind === 'quote' ? String(el.quoteSource || 'other').slice(0, 20) : null,
          imageUrl: (kind === 'character' || kind === 'object' || kind === 'quote') && el.imageUrl ? String(el.imageUrl) : null,
          imageWidth: el.imageWidth ? Math.max(0, Number(el.imageWidth) || 0) || null : null,
          imageHeight: el.imageHeight ? Math.max(0, Number(el.imageHeight) || 0) || null : null,
          start: Math.max(0, Number(el.start) || 0),
          end: Math.max(0, Number(el.end) || 0),
        };
      })
      .filter(el => el.element)
      .sort((a, b) => a.start - b.start);
    if (!cleaned.length) return res.status(400).json({ error: 'no_elements' });
    const updated = await updateAudioVideoJob(job.id, { elementsJson: cleaned });
    res.json({ job: updated });
  } catch (err) {
    console.error('[WhiteboardVideo] Save elements error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ رندر مربوط بمحاسبة الرصيد: بيقفل الطول عند (rendered_seconds الحالي + الباقي من
// الرصيد)، ويخصم بس الفرق الجديد المُضاف — عشان المستخدم يقدر يعيد الرندر بعد أي تعديل
// يدوي في التايم لاين من غير ما يتحصّل عليه رصيد زيادة عن الحقيقي
router.post('/jobs/:id/render', authMiddleware, createLimiter, async (req, res) => {
  const userId = req.user.userId;
  try {
    const job = await getAudioVideoJobForUser(req.params.id, userId);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!job.elements_json || !job.elements_json.length) return res.status(400).json({ error: 'no_elements' });

    const previousRendered = Number(job.rendered_seconds) || 0;
    const usedSeconds = await getUserWhiteboardFreeSecondsUsed(userId);
    const remainingSeconds = WHITEBOARD_FREE_SECONDS_LIFETIME - usedSeconds;
    const cap = Math.min(previousRendered + Math.max(0, remainingSeconds), WHITEBOARD_FREE_SECONDS_LIFETIME);
    if (cap <= 0.5) {
      return res.status(402).json({ error: 'free_budget_exhausted', usedSeconds, limitSeconds: WHITEBOARD_FREE_SECONDS_LIFETIME });
    }

    const ratio = req.body?.ratio || job.ratio || '16:9';
    const renderJob = await updateAudioVideoJob(job.id, { status: 'rendering', ratio });
    res.json({ job: renderJob });

    (async () => {
      try {
        const videoUrl = await renderAudioVideoJob(renderJob, { maxDurationSec: cap });
        const actualDuration = Math.min(estimateWordsDurationSec(renderJob.words_json || []), cap);
        await updateAudioVideoJob(job.id, { status: 'done', videoUrl, renderedSeconds: actualDuration });
        const increment = Math.max(0, actualDuration - previousRendered);
        if (increment > 0) await addUserWhiteboardFreeSecondsUsed(userId, increment);
      } catch (err) {
        console.error('[WhiteboardVideo] Render failed:', err);
        await updateAudioVideoJob(job.id, { status: 'failed', error: err.message });
      }
    })();
  } catch (err) {
    console.error('[WhiteboardVideo] Render trigger error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
