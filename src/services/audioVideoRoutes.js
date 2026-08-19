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

// ✅ FIX: كانت الخطوة دي متزامنة (الأدمن مستنّي الرد HTTP لحد ما تخلص) — مع التقسيم الكثيف
// الجديد (15-20+ صورة للـ job) وصبر أكبر على الـ 429 (fetchPollinationsImage ممكن تاخد لحد
// ~100 ثانية للصورة الواحدة في أسوأ حالة)، الخطوة كلها ممكن تاخد دقايق كتير — ده بيخاطر إن
// أي proxy/متصفح بينه وبين السيرفر يعمل timeout قبل ما الرد يوصل خالص. دلوقتي زي /render
// بالظبط: بترجع فورًا (202-style) والشغل بيحصل في الخلفية، والفرونت إند بيعمل poll على
// GET /jobs/:id لحد ما status يبقى elements_ready/failed.
router.post('/jobs/:id/extract', adminAuth, async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!job.words_json || !job.words_json.length) return res.status(400).json({ error: 'no_transcript' });

    const extractingJob = await updateAudioVideoJob(job.id, { status: 'extracting' });
    res.json({ job: extractingJob });

    (async () => {
      try {
        const elements = await extractVideoElements(job.words_json);
        if (!elements.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements extracted from transcript' });
          return;
        }

        // ✅ الصور بالترتيب (مش Promise.all) مع فاصل زمني بين كل نداء والتاني — Pollinations
        // فعليًا بترجع 429 لو النداءات جت ورا بعض بسرعة (اتأكد ده من لوجات حقيقية)، فبنبعد
        // عنه استباقيًا. fetchPollinationsImage نفسها كمان عندها إعادة محاولة تصاعدية طويلة.
        // ✅ شخصيات مسمّاة (kind:'character') بتتكرر بنفس الـ characterKey بتاخد نفس صورة
        // الملصق المولّدة أول مرة بس — من غير ما تولّد صورة جديدة (شكل مختلف) في كل ظهور،
        // عشان تفضل نفس الشخصية بصريًا زي ما طلب العميل، وكمان بيوفر نداءات فعليًا
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
        const characterImageCache = new Map(); // characterKey -> imageUrl
        const withImages = [];
        const failedElements = [];
        let generatedCount = 0;
        for (const el of elements) {
          // ✅ FIX (طلب العميل): آيات/أحاديث/أي إشارة لله أو نبي (kind:'quote') بتتحط كنص بس
          // على الشاشة من غير أي صورة/ملصق خالص — مفيش نداء لـ Pollinations أصلاً، ومفيش
          // استهلاك من فترات الانتظار بتاعة توليد الصور التانية
          if (el.kind === 'quote') {
            withImages.push({ ...el, imageUrl: null });
            continue;
          }
          if (el.kind === 'character' && el.characterKey && characterImageCache.has(el.characterKey)) {
            withImages.push({ ...el, imageUrl: characterImageCache.get(el.characterKey) });
            continue;
          }
          if (generatedCount > 0) await sleep(4000);
          generatedCount++;
          try {
            const buffer = await generateElementImage(el.imagePrompt);
            const imageUrl = await uploadElementImageToR2(buffer);
            withImages.push({ ...el, imageUrl });
            if (el.kind === 'character' && el.characterKey) characterImageCache.set(el.characterKey, imageUrl);
          } catch (e) {
            console.warn('[AudioVideo] Image generation failed for element:', el.element, e.message);
            failedElements.push(el);
          }
        }

        // ✅ جولة تانية للعناصر اللي فشلت بعد استراحة أطول — لو السبب كان rate limit مؤقت،
        // الوقت ده كافي غالبًا إن الحد يترفع تاني
        if (failedElements.length) {
          await sleep(20000);
          for (const el of failedElements) {
            if (el.kind === 'character' && el.characterKey && characterImageCache.has(el.characterKey)) {
              withImages.push({ ...el, imageUrl: characterImageCache.get(el.characterKey) });
              continue;
            }
            try {
              const buffer = await generateElementImage(el.imagePrompt);
              const imageUrl = await uploadElementImageToR2(buffer);
              withImages.push({ ...el, imageUrl });
              if (el.kind === 'character' && el.characterKey) characterImageCache.set(el.characterKey, imageUrl);
            } catch (e) {
              console.warn('[AudioVideo] Image generation retry also failed for element:', el.element, e.message);
            }
          }
        }

        // ✅ نرتب تاني حسب مكانها الأصلي في الكلام (الجولة التانية ممكن تضيف عناصر آخر القائمة)
        withImages.sort((a, b) => a.startIdx - b.startIdx);

        if (!withImages.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'Image generation failed for all elements' });
          return;
        }

        await updateAudioVideoJob(job.id, { elementsJson: withImages, status: 'elements_ready' });
      } catch (err) {
        console.error('[AudioVideo] Extract error:', err);
        await updateAudioVideoJob(job.id, { status: 'failed', error: err.message }).catch(() => {});
      }
    })();
  } catch (err) {
    console.error('[AudioVideo] Extract trigger error:', err);
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
