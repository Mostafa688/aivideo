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
import sharp from 'sharp';
import { transcribeAudioWithTimestamps, uploadAudioVideoSourceToR2, tmpAudioPath, extractVideoElements, findLibraryIcon, uploadElementImageToR2, uploadReferenceImageToR2, uploadCompositeImageToR2 } from './audioVideoService.js';
import { renderAudioVideoJob } from './audioVideoRenderService.js';
import { createAudioVideoJob, updateAudioVideoJob, getAudioVideoJobById, listAudioVideoJobsForAdmin, upsertReferenceImage, listReferenceImages, getReferenceImagesMap, deleteReferenceImage } from './authService.js';

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
        // ملصق حقيقي من مكتبة Iconify المجانية. لقطات "text" (جملة مالهاش تصور بصري) بتتحط
        // كنص بس من الأول من غير أي بحث. لأي لقطة character/object، لو مفيش نتيجة مطابقة في
        // المكتبة، بتتحول لـ"نص" بدل ما تتلغى — بالظبط زي ما طلب العميل. الشخصيات المسمّاة
        // بتتكرر بنفس الملصق المتفق عليه أول مرة (مفيش بحث جديد في كل ظهور).
        // ✅ NEW (طلب العميل): لقطات "quote" (آية/حديث) بقى ليها صورة حقيقية لو الأدمن رفع
        // صورة مرجعية لنفس المصدر ده (قرآن/بخاري/مسلم) — بتتحط جنب النص نفسه (مش بدلاً منه)،
        // مش نص بس زي الافتراضي القديم
        const referenceImages = await getReferenceImagesMap();
        const characterImageCache = new Map(); // characterKey -> imageUrl
        const withImages = [];
        let llmTextCount = 0, iconFoundCount = 0, iconMissCount = 0;
        for (const el of elements) {
          if (el.kind === 'quote') {
            const refUrl = referenceImages[el.quoteSource] || referenceImages.other || null;
            if (refUrl) iconFoundCount++; else llmTextCount++;
            withImages.push({ ...el, imageUrl: refUrl });
            continue;
          }
          if (el.kind === 'text') {
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

// ── مشاهد مركّبة (Composite Scenes) ────────────────────────────────────────────────────
// ✅ NEW (طلب العميل): بدل ما فترة معيّنة من الفيديو (زي "11 مرحلة البرزخ") تتقسم لملصقات
// منفصلة، الأدمن بيرفع صورة دايجرام واحدة تغطي الفترة دي كلها، ويحدد يدويًا نقاط زوم/pan
// (كل نقطة = مربع قص من الصورة + الوقت اللي المفروض يوصل عنده) — الرندر (audioVideoRenderService.js)
// بيعمل زوم/pan ناعم بين النقاط دي، بيبدأ بصورة كاملة (pop) وينتهي برجوع لصورة كاملة (zoom out)
router.post('/jobs/:id/composite-image', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const meta = await sharp(req.file.buffer).metadata();
    const imageUrl = await uploadCompositeImageToR2(req.file.buffer, ext);
    res.json({ imageUrl, width: meta.width, height: meta.height });
  } catch (err) {
    console.error('[AudioVideo] Composite image upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW: أي مربع قص بيرسمه الأدمن على الصورة ممكن يكون بأي نسبة عرض/ارتفاع — لو استخدمناه
// زي ما هو في الرندر، الفريم النهائي هيتمدد/ينضغط (distortion) لأنه بيتحط في فريم 16:9 ثابت.
// بنعدّل المربع هنا (على نفس المركز) عشان يطابق نسبة فيديو الـ job بالظبط قبل ما نحفظه —
// ده بيضمن مفيش تمدد خالص في الرندر بغض النظر عن المربع اللي الأدمن رسمه فعليًا
function normalizeRectToAspect(k, imageWidth, imageHeight, targetAspect) {
  const cx = k.x + k.width / 2, cy = k.y + k.height / 2;
  let w = k.width, h = k.height;
  const pixelAspect = (w * imageWidth) / (h * imageHeight);
  if (pixelAspect > targetAspect) h = (w * imageWidth) / targetAspect / imageHeight;
  else w = (h * imageHeight) * targetAspect / imageWidth;
  if (w > 1) { const scale = 1 / w; w *= scale; h *= scale; }
  if (h > 1) { const scale = 1 / h; w *= scale; h *= scale; }
  const x = Math.max(0, Math.min(1 - w, cx - w / 2));
  const y = Math.max(0, Math.min(1 - h, cy - h / 2));
  return { x, y, width: w, height: h };
}
const RATIO_ASPECT = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };

// بيحفظ مصفوفة المشاهد المركّبة كاملة للـ job (بيستبدل القديم بالكامل — الفرونت إند بيبعت
// القائمة النهائية كل مرة، أبسط من endpoints جزئية للإضافة/التعديل/الحذف)
router.post('/jobs/:id/composite-scenes', adminAuth, async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    const targetAspect = RATIO_ASPECT[job.ratio] || RATIO_ASPECT['16:9'];
    const scenes = Array.isArray(req.body?.scenes) ? req.body.scenes : [];
    const cleaned = scenes
      .map((s, i) => {
        const imageWidth = Math.max(0, Number(s.imageWidth) || 0);
        const imageHeight = Math.max(0, Number(s.imageHeight) || 0);
        return {
          id: s.id || `scene_${Date.now()}_${i}`,
          imageUrl: String(s.imageUrl || ''),
          imageWidth, imageHeight,
          startTime: Math.max(0, Number(s.startTime) || 0),
          endTime: Math.max(0, Number(s.endTime) || 0),
          keyframes: Array.isArray(s.keyframes) && imageWidth > 0 && imageHeight > 0
            ? s.keyframes
                .map(k => {
                  const raw = {
                    x: Math.max(0, Math.min(1, Number(k.x) || 0)),
                    y: Math.max(0, Math.min(1, Number(k.y) || 0)),
                    width: Math.max(0.02, Math.min(1, Number(k.width) || 1)),
                    height: Math.max(0.02, Math.min(1, Number(k.height) || 1)),
                  };
                  const rect = normalizeRectToAspect(raw, imageWidth, imageHeight, targetAspect);
                  return { time: Math.max(0, Number(k.time) || 0), ...rect, label: String(k.label || '').slice(0, 100) };
                })
                .sort((a, b) => a.time - b.time)
            : [],
        };
      })
      .filter(s => s.imageUrl && s.imageWidth > 0 && s.imageHeight > 0 && s.endTime > s.startTime)
      .sort((a, b) => a.startTime - b.startTime);
    const updated = await updateAudioVideoJob(job.id, { compositeScenesJson: cleaned });
    res.json({ job: updated });
  } catch (err) {
    console.error('[AudioVideo] Save composite scenes error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── صور مرجعية ثابتة (القرآن الكريم، صحيح البخاري، صحيح مسلم...) ────────────────────────
// ✅ NEW (طلب العميل): الأدمن بيرفع صورة مرة واحدة لكل مصدر (ref_key)، وبتتستخدم تلقائيًا
// بعد كده في أي لقطة "quote" بنفس المصدر ده بدل ما تفضل نص بس
router.get('/reference-images', adminAuth, async (req, res) => {
  try {
    const images = await listReferenceImages();
    res.json({ images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reference-images', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const refKey = String(req.body?.ref_key || '').toLowerCase().trim();
    if (!refKey) return res.status(400).json({ error: 'ref_key is required' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const imageUrl = await uploadReferenceImageToR2(req.file.buffer, ext, refKey);
    const label = req.body?.label || refKey;
    const image = await upsertReferenceImage(refKey, label, imageUrl);
    res.json({ image });
  } catch (err) {
    console.error('[AudioVideo] Reference image upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/reference-images/:refKey', adminAuth, async (req, res) => {
  try {
    await deleteReferenceImage(req.params.refKey);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
