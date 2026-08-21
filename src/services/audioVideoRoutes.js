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
import { transcribeAudioWithTimestamps, uploadAudioVideoSourceToR2, tmpAudioPath, extractVideoElements, findLibraryIcon, uploadElementImageToR2 } from './audioVideoService.js';
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

// ✅ الاستخراج بقى async (بيرجع فورًا 202-style، والشغل الفعلي بيحصل في الخلفية، والفرونت
// إند بيعمل poll على GET /jobs/:id لحد ما status يبقى elements_ready/failed) — أصلًا مش
// محتاجينها بنفس القوة زي زمان (بحث Iconify سريع جدًا، مفيش انتظار توليد صور بالذكاء
// الاصطناعي تاني)، بس سايبينها زي ما هي لتبسيط الكود ومنع أي timeout نادر من الفرونت إند.
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

        // ✅ FIX (طلب العميل): بدل توليد صور بالذكاء الاصطناعي (كانت طالعة وحشة)، بندور على
        // ملصق حقيقي من مكتبة Iconify المجانية. آيات/أحاديث/إشارة لله أو نبي (kind:'quote')،
        // وكمان أي جملة مالهاش تصور بصري (kind:'text') بتتحط كنص بس من الأول من غير أي بحث.
        // لأي لقطة character/object، لو مفيش نتيجة مطابقة في المكتبة، بتتحول لـ"نص" بدل ما
        // تتلغى — بالظبط زي ما طلب العميل. الشخصيات المسمّاة بتتكرر بنفس الملصق المتفق عليه
        // أول مرة (مفيش بحث جديد في كل ظهور).
        const characterImageCache = new Map(); // characterKey -> imageUrl
        const withImages = [];
        let llmTextCount = 0, iconFoundCount = 0, iconMissCount = 0;
        for (const el of elements) {
          if (el.kind === 'quote' || el.kind === 'text') {
            llmTextCount++;
            withImages.push({ ...el, imageUrl: null });
            continue;
          }
          if (el.kind === 'character' && el.characterKey && characterImageCache.has(el.characterKey)) {
            iconFoundCount++;
            withImages.push({ ...el, imageUrl: characterImageCache.get(el.characterKey) });
            continue;
          }
          let buffer = null;
          try {
            buffer = await findLibraryIcon(el.imagePrompt);
          } catch (e) {
            console.warn('[AudioVideo] Icon lookup failed, falling back to text:', el.element, e.message);
          }
          if (!buffer) {
            iconMissCount++;
            withImages.push({ ...el, kind: 'text', imageUrl: null, imagePrompt: null, characterKey: null });
            continue;
          }
          iconFoundCount++;
          const imageUrl = await uploadElementImageToR2(buffer);
          withImages.push({ ...el, imageUrl });
          if (el.kind === 'character' && el.characterKey) characterImageCache.set(el.characterKey, imageUrl);
        }
        // ✅ تشخيص: لوج واضح يفرّق بين "الموديل نفسه قرر نص" و"طلب ملصق بس المكتبة مالقتش
        // نتيجة" — عشان نعرف بسرعة لو فيه باج في البحث نفسه (زي اللي كان فيه فلتر prefixes
        // غلط وبيلغي كل نتيجة) بدل ما نفترض إنه مجرد محتوى مجرد مالوش تصور بصري
        console.log(`[AudioVideo] Extract summary: ${elements.length} beats — LLM chose text/quote directly: ${llmTextCount}, icon found: ${iconFoundCount}, icon search came back empty (downgraded to text): ${iconMissCount}`);

        if (!withImages.length) {
          await updateAudioVideoJob(job.id, { status: 'failed', error: 'No elements could be processed' });
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
