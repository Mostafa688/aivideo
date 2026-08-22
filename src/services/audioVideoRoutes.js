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
import { transcribeAudioWithTimestamps, uploadAudioVideoSourceToR2, tmpAudioPath, extractVideoElements, findLibraryIcon, uploadElementImageToR2, uploadReferenceImageToR2, uploadCompositeImageToR2, uploadBulkStickerToR2, captionImageWithVision, matchStickersToTranscript } from './audioVideoService.js';
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
          // ✅ NEW (طلب العميل: "زود الملصقات"): بنجرب كل بديل بحث اقترحه الـ LLM على التوالي
          // (الأكثر تحديدًا الأول) لحد ما واحد يلاقي نتيجة — مش بس كلمة واحدة زي الأول
          const promptCandidates = Array.isArray(el.imagePromptCandidates) && el.imagePromptCandidates.length
            ? el.imagePromptCandidates
            : (el.imagePrompt ? [el.imagePrompt] : []);
          let buffer = null;
          for (const candidate of promptCandidates) {
            try {
              buffer = await findLibraryIcon(candidate);
            } catch (e) {
              console.warn('[AudioVideo] Icon lookup failed for candidate, trying next:', candidate, e.message);
            }
            if (buffer) break;
          }
          if (!buffer) {
            iconMissCount++;
            withImages.push({ ...el, kind: 'text', imageUrl: null, imagePrompt: null, imagePromptCandidates: [], characterKey: null });
            continue;
          }
          iconFoundCount++;
          const imageUrl = await uploadElementImageToR2(buffer);
          withImages.push({ ...el, imageUrl, imagePromptCandidates: undefined });
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

// ── تايم لاين تعديل العناصر (زي CapCut) — بعد ما الفيديو يتعمل، الأدمن يقدر يعدّل نص أي
// لقطة، يغيّر/يمسح/يرفع ملصق من عنده، يحذف لقطة، أو يضيف لقطة جديدة، من غير ما يعيد
// التفريغ/الاستخراج من الأول — بيحفظ elements_json المعدّل وبعدين يعيد /render عادي ─────
// ⚠️ ملحوظة مهمة عن التوقيت: مدة عرض كل عنصر على الشاشة في الرندر الفعلي هي [عنصر.start
// → العنصر اللي بعده.start) — مش عنصر.end (ده حقل قديم من الاستخراج مش مستخدم في الرندر
// خالص). يعني تعديل "start" لعنصر بيغيّر تلقائيًا مدة العنصر اللي قبله كمان (لأنه بينتهي
// عند بداية العنصر ده)، وده بالظبط اللي التايم لاين في الفرونت إند بيعرضه ويعتمد عليه
router.post('/jobs/:id/element-image', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
    const imageUrl = await uploadElementImageToR2(req.file.buffer);
    res.json({ imageUrl });
  } catch (err) {
    console.error('[AudioVideo] Custom element image upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/jobs/:id/elements', adminAuth, async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    const raw = Array.isArray(req.body?.elements) ? req.body.elements : [];
    const KNOWN_KINDS = ['character', 'object', 'text', 'quote'];
    const cleaned = raw
      .map(el => {
        const kind = KNOWN_KINDS.includes(el.kind) ? el.kind : 'text';
        const text = String(el.element ?? el.text ?? '').slice(0, 200).trim();
        return {
          element: text,
          text,
          kind,
          imagePrompt: kind === 'text' || kind === 'quote' ? null : (el.imagePrompt ? String(el.imagePrompt).slice(0, 300).trim() : null),
          characterKey: kind === 'character' && el.characterKey ? String(el.characterKey).toLowerCase().trim().slice(0, 60) : null,
          quoteSource: kind === 'quote' ? String(el.quoteSource || 'other').slice(0, 20) : null,
          imageUrl: (kind === 'character' || kind === 'object' || kind === 'quote') && el.imageUrl ? String(el.imageUrl) : null,
          // ✅ NEW: لو العنصر ده ملصق مخصّص (بلوك رفع بالجملة) وله أبعاد أصلية محفوظة،
          // لازم تفضل متسجّلة حتى بعد أي حفظ من التايم لاين — عشان الرندر يفضل محافظ على
          // نسبته الأصلية بدل ما يرجع يفرض مربع تابت زي الأيقونات العادية
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
    console.error('[AudioVideo] Save elements error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW (طلب العميل): رفع ملصقات/صور جاهزة بالجملة (ممكن يكون فيها نص مكتوب أصلًا) —
// النظام بيقرا كل صورة بموديل رؤية مجاني (نفس مفتاح Groq المستخدم أصلًا، مفيش تسجيل جديد)،
// وبعدين نداء LLM واحد بيحدد لكل صورة أنسب لحظة في الترانسكريبت تتحط عندها، وبيتحطوا
// كـ"عناصر" عادية (imageWidth/imageHeight بتتسجل معاهم عشان الرندر يحافظ على نسبتهم
// الأصلية 16:9/3:2/1:1... بدل ما يفرض مربع تابت زي أيقونات Iconify). متزامن (مش async
// polling) عشان التنفيذ أبسط — ممكن ياخد وقت لو عدد الصور كبير (نداء رؤية لكل صورة + نداء
// مطابقة واحد في الآخر)
router.post('/jobs/:id/bulk-stickers', adminAuth, upload.array('images', 20), async (req, res) => {
  try {
    const job = await getAudioVideoJobById(req.params.id);
    if (!job) return res.status(404).json({ error: 'not_found' });
    if (!req.files?.length) return res.status(400).json({ error: 'No images uploaded' });
    if (!job.words_json?.length) return res.status(400).json({ error: 'no_transcript' });

    // ✅ NEW (طلب العميل): بديل يدوي اختياري للمطابقة بالـ AI — سطر واحد لكل صورة (بنفس
    // ترتيب رفعها) في حقل نصي "manualTimes"، كل سطر إما فاضي (سيب الـ AI يحدد) أو رقم
    // ثانية صريح (استخدمه زي ما هو، من غير ما نستهلك نداء مطابقة عليه خالص)
    const manualLines = String(req.body.manualTimes || '').split(/\r?\n/);

    const uploaded = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const meta = await sharp(file.buffer).metadata();
      const ext = (file.originalname.split('.').pop() || 'png').toLowerCase();
      const imageUrl = await uploadBulkStickerToR2(file.buffer, ext);
      const caption = await captionImageWithVision(imageUrl);
      const manualLine = (manualLines[i] || '').trim();
      const manualTime = manualLine ? Number(manualLine) : NaN;
      uploaded.push({
        imageUrl, imageWidth: meta.width, imageHeight: meta.height,
        caption: caption || file.originalname.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '),
        manualTime: Number.isFinite(manualTime) ? Math.max(0, manualTime) : null,
      });
    }

    // ✅ بس الصور اللي معندهاش وقت يدوي هي اللي بتدخل نداء المطابقة بالـ AI — الباقي بياخد
    // وقته الصريح مباشرة من غير أي تخمين
    const needsAiMatch = uploaded.map((img, idx) => ({ ...img, idx })).filter(img => img.manualTime == null);
    const aiMatches = needsAiMatch.length ? await matchStickersToTranscript(job.words_json, needsAiMatch) : [];

    const results = uploaded.map((img, idx) => img.manualTime != null ? { idx, startTime: img.manualTime } : null);
    for (const m of aiMatches) {
      const orig = needsAiMatch[m.imageIndex];
      if (!orig) continue;
      results[orig.idx] = { idx: orig.idx, startTime: job.words_json[m.startIdx].start };
    }
    const finalResults = results.filter(Boolean);
    if (!finalResults.length) return res.status(500).json({ error: 'Could not place any uploaded image on the timeline' });

    const newElements = finalResults.map(r => {
      const img = uploaded[r.idx];
      return {
        element: img.caption, text: img.caption, kind: 'object',
        imagePrompt: null, characterKey: null, quoteSource: null,
        imageUrl: img.imageUrl, imageWidth: img.imageWidth, imageHeight: img.imageHeight,
        start: r.startTime, end: r.startTime,
      };
    });

    // ✅ أي عنصر قديم قريب جدًا (أقل من ثانية) من نقطة ملصق جديد بيتشال، عشان الملصق
    // المخصّص يحل محله مباشرة بدل ما يفضل عنصر قديم بمدة شبه صفرية قبله
    const existing = Array.isArray(job.elements_json) ? job.elements_json : [];
    const pruned = existing.filter(el => !newElements.some(ne => Math.abs((Number(el.start) || 0) - ne.start) < 1));
    const merged = [...pruned, ...newElements].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));

    const updated = await updateAudioVideoJob(job.id, { elementsJson: merged });
    res.json({ job: updated, matchedCount: newElements.length, totalUploaded: uploaded.length });
  } catch (err) {
    console.error('[AudioVideo] Bulk sticker upload error:', err);
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
        const startTime = Math.max(0, Number(s.startTime) || 0);
        const endTime = Math.max(0, Number(s.endTime) || 0);
        return {
          id: s.id || `scene_${Date.now()}_${i}`,
          imageUrl: String(s.imageUrl || ''),
          imageWidth, imageHeight,
          startTime, endTime,
          // ✅ FIX (بلاغ العميل: "ليه معملش زوم"): أي نقطة ثانيتها برة نطاق المشهد
          // (startTime→endTime) كانت بتتقص (clamp) بصمت في الرندر لحافة المشهد، ولو كل
          // النقط وقعت برة النطاق كلها كانت بتتلغي كلها (تتحول لبداية/نهاية الصورة الكاملة)
          // فيضيع الزوم كله من غير أي خطأ ظاهر للأدمن — دلوقتي بنرفض أي نقطة برة النطاق هنا
          // كمان (مش بس في الفرونت إند) عشان نضمن مفيش نقطة تضيع بصمت أيًا كان مصدر الطلب
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
                  const time = Math.max(0, Number(k.time) || 0);
                  return { time, ...rect, label: String(k.label || '').slice(0, 100) };
                })
                .filter(k => k.time >= startTime && k.time <= endTime)
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
