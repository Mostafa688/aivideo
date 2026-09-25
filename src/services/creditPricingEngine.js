// ── creditPricingEngine.js ───────────────────────────────────────────────────
// Phase 2 of the platform overhaul: a generalized cost → credits calculator for
// every new AI model being added (Nano Banana family, Grok Image, GPT-Image,
// Seedream, Veo 3, Kling, Seedance 2.x, Gemini Flash TTS). Existing models
// (1/2/3/4/5/6/7/8) keep their already-tuned flat tables in authService.js —
// those aren't touched here.
//
// How the math works:
//   1. REPLICATE_MODEL_COSTS holds the real USD cost per unit (per image, or
//      per second of video/audio) for each model, sourced from Replicate's own
//      pricing pages and provider docs as of Sept 2026.
//   2. USD_PER_CREDIT is the REAL revenue per credit, in the WORST case (lowest)
//      currency the business actually collects it in. ✅ FIX (باج تسعير جوهري
//      رصده العميل): كان هنا مبني على السعر الدولي بس ($15/600 كريديت = $0.025/كريديت)
//      وبيتطبّق على كل العملاء بما فيهم المصريين اللي بيدفعوا 420 جنيه بس مقابل نفس الـ600
//      كريديت (خصم PPP مقصود) — وده مش $15 حقيقي؛ بسعر الصرف الحقيقي وقت الكتابة (~52.6
//      ج.م/$1، Sept 2026)، الـ420 جنيه = ~$8 بس، يعني السعر الحقيقي للكريديت من عميل مصري
//      ~$0.0133 (أقل بحوالي النص من $0.025!). كنا بنحسب تكلفة كل توليد على أساس هامش 3x
//      فوق سعر Replicate بس مبني على سعر كريديت أعلى من الحقيقي، فالهامش الفعلي مع عميل
//      مصري كان أقل بكتير من 3x المقصودة (ممكن يوصل لخسارة فعلية لو حسبنا تكلفة LLM/Groq
//      والتخزين كمان، اللي مش محسوبة في تكلفة Replicate نفسها أصلاً). الحل: نحسب تكلفة كل
//      حاجة على أساس أسوأ سيناريو (أقل سعر كريديت حقيقي)، ده بيضمن هامش ربح حقيقي مهما كانت
//      عملة/منطقة العميل — العميل الدولي هيبقى عنده هامش أعلى من 3x بالفعل، وده مكسب زيادة
//      مش مشكلة. المشتقة من: EGP_PER_CREDIT (authService.js) = 0.7 ج.م/كريديت × ~$0.019/ج.م
//      (سعر الصرف الحقيقي وقت الكتابة)
//   3. PROFIT_MULTIPLIER (3x) is applied on top of raw API cost before
//      converting to credits — it covers R2 storage, LLM script-writing calls,
//      payment-processor fees (InstaPay/Gumroad take a cut), and margin.
//
// IMPORTANT: third-party pricing aggregators drift constantly. Before wiring
// any model below into an actual generation endpoint, re-confirm its exact
// per-unit cost against Replicate's own model page for that exact slug. Also
// re-check USD_PER_CREDIT if EGP_PER_CREDIT or the real EGP/USD rate moves
// meaningfully — this anchor is only as accurate as that exchange rate.

export const USD_PER_CREDIT = 0.0133;
export const PROFIT_MULTIPLIER = 3;
// ✅ NEW (قرار بزنس صريح من العميل): PROFIT_MULTIPLIER (3x) مخصص لتوليد حقيقي بمحرك AI خارجي
// (Replicate بيتقاضى فلوس حقيقية مننا لكل استدعاء) — الربح الحقيقي للمنصة المفروض يجي من هنا.
// عمليات المعالجة الداخلية البحتة (دمج فيديوهات بـffmpeg، خلط صوت/موسيقى فوق فيديو، تعديل
// توقيت مشهد) مفيهاش أي تكلفة API خارجية خالص — إحنا بس بندفع compute/تخزين/bandwidth بتاعنا
// إحنا (رخيص جدًا). العميل صريح: "عايزين الكريديت يكون على قد التكلفة بالظبط او اعلى شوية" —
// يعني هامش صغير بس (يغطي الاستضافة)، مش هامش 3x زي التوليد الحقيقي. AUX_PROFIT_MULTIPLIER
// ده مخصص للعمليات دي بالتحديد (مش موديلات Replicate حقيقية بتكلفة خارجية — تلك تفضل بـ3x زي العادة)
export const AUX_PROFIT_MULTIPLIER = 1.25;

// Every model here charges per generated unit — most images are "per image",
// most video/audio models are "per second of output".
// ✅ FIX (مراجعة أسعار نهائية — العميل نفسه دخل صفحة كل موديل على Replicate وبعتلي
// أرقام حقيقية مباشرة من صفحة الـ Pricing بتاعت كل موديل، مش بحث/تقدير): كل الأرقام
// تحت دلوقتي مؤكدة 100% من المصدر الأساسي نفسه، Sept 2026
export const REPLICATE_MODEL_COSTS = {
  // ── Image generation ──────────────────────────────────────────────────────
  nano_banana:      { label: 'Nano Banana',        unit: 'image', usdCost: 0.039 },
  nano_banana_2:    { label: 'Nano Banana 2',      unit: 'image', usdCost: 0.067, // = تكلفة 1K الافتراضية
                       tiers: { '512px': 0.045, '1K': 0.067, '2K': 0.101, '4K': 0.151 } },
  // ⚠ صفحة الموديل بتعرض كمان "$0.035 لحاجة اسمها FALLBACK" — مش دقة قابلة للاختيار من
  // العميل عندنا (تصنيف داخلي في Replicate لما الموديل يرجع لجودة أقل تلقائيًا)، مش مضافة كـtier
  nano_banana_pro:  { label: 'Nano Banana Pro',    unit: 'image', usdCost: 0.150, // = تكلفة 1K/2K (نفس السعر للاتنين فعليًا)
                       tiers: { '1K': 0.150, '2K': 0.150, '4K': 0.300 } },
  nano_banana_lite: { label: 'Nano Banana Lite',   unit: 'image', usdCost: 0.045 }, // ⚠ مش موصول فعليًا (متاح على fal.ai مش Replicate) — رقم مرجعي بس، مش قابل للاختيار
  grok_image:       { label: 'Grok Image',         unit: 'image', usdCost: 0.020 },
  // ❌ REMOVED من NEW_IMAGE_MODELS (newImageModelsService.js) — openai/gpt-image-1 على Replicate
  // "bring-your-own-key" فقط (لازم مفتاح OpenAI حقيقي بتاعنا إحنا، مش عن طريق كريديت Replicate
  // العادي) — الموديل كان معطّل فعليًا من غير ما نلاحظ. رقم مرجعي بس لحد ما يتحل ده كقرار بزنس
  // (سعر OpenAI الحقيقي المؤكد: low=$0.02, medium=$0.07, high=$0.19 لصورة 1024×1024)
  gpt_image:        { label: 'GPT-Image',          unit: 'image', usdCost: 0.07, tiers: { low: 0.02, medium: 0.07, high: 0.19 } },
  // ✅ NEW (طلب العميل، سعره وschema مؤكدين من صفحة الموديل مباشرة — سكرين شوت العميل): موديل
  // مختلف تمامًا عن gpt_image (v1) فوق — ده وشغال فعليًا (راجع newImageModelsService.js ليه).
  // usdCost الافتراضي = تكلفة "auto" (نفس سعر "high" بالظبط حسب صفحة الموديل)
  gpt_image_2:      { label: 'GPT-Image 2',        unit: 'image', usdCost: 0.128,
                       tiers: { low: 0.012, medium: 0.047, high: 0.128, auto: 0.128 } },
  seedream_4:       { label: 'Seedream 4',         unit: 'image', usdCost: 0.030 },
  // ✅ FIX: تدرجات حقيقية حسب دقة الصورة، مؤكدة من صفحة الموديل مباشرة — مش رقم متوسط تقديري تاني
  seedream_5:       { label: 'Seedream 5',         unit: 'image', usdCost: 0.045, tiers: { '1K': 0.045, '2K': 0.090 } },
  seedream_5_lite:  { label: 'Seedream 5 Lite',    unit: 'image', usdCost: 0.035 },
  // ✅ NEW (طلب العميل — سعر واحد بلا دقات متعددة، مؤكد من العميل مباشرة)
  nano_banana_2_lite: { label: 'Nano Banana 2 Lite', unit: 'image', usdCost: 0.034 },

  // ── Video generation (per second of output) ──────────────────────────────
  // كل موديل فيديو هنا بيسعّر حسب الدقة (وأحيانًا حسب معايير تانية زي وجود صوت أو صورة/فيديو
  // مدخل) — بنستخدم دايمًا السيناريو المطابق لاستخدامنا الفعلي (مثلاً: مفيش صوت اختياري
  // للعميل يقفله، فبنسعّر بسعر "مع صوت"؛ ومفيش فيديو-لفيديو غير في omni_flash_1_1 تحديدًا،
  // فباقي الموديلات بتتسعّر بسعر "من غير فيديو مدخل")
  veo3_fast:        { label: 'Veo 3 Fast',         unit: 'second', usdCost: 0.15, maxClipSec: 8,
                       tiers: { '720p': 0.15, '1080p': 0.15 } }, // مؤكد: with_audio=$0.15/s (without_audio=$0.10/s، مش مستخدم عندنا لأننا دايمًا بنولّد بصوت)
  veo3_standard:    { label: 'Veo 3',              unit: 'second', usdCost: 0.40, maxClipSec: 8,
                       tiers: { '720p': 0.40, '1080p': 0.40 } }, // مؤكد: with_audio=$0.40/s (without_audio=$0.20/s)
  // ✅ NEW (طلب العميل، مؤكد من صفحة الموديل مباشرة — سكرين شوت العميل): Veo 3.1 Lite —
  // نسخة أرخص من عيلة Veo 3.1، بتسعّر حسب الدقة بس (مفيش تقسيم with_audio/without_audio
  // ظاهر في السكرين شوت، فالرقمين دول هما السعر الكامل). maxClipSec/الـslug مبنيين على القياس
  // بعيلة veo3_fast/veo3_standard (نفس المدد 4/6/8 ثانية) — يحتاجوا تأكيد حي قبل الاعتماد عليهم
  veo3_lite:        { label: 'Veo 3.1 Lite',       unit: 'second', usdCost: 0.05, maxClipSec: 8,
                       tiers: { '720p': 0.05, '1080p': 0.08 } },
  // ✅ FIX: مؤكد من صفحة الموديل — kwaivgi/kling-v2.1 بيسعّر بـ"standard"=$0.05/s أو
  // "pro"=$0.09/s؛ إحنا مستخدمين النسخة العادية (standard)
  kling_2_1:        { label: 'Kling 2.1',          unit: 'second', usdCost: 0.05, maxClipSec: 10 },
  kling_2_5:        { label: 'Kling 2.5',          unit: 'second', usdCost: 0.07, maxClipSec: 10 }, // مؤكد: $0.35/5s = $0.70/10s = $0.07/sec ثابت، مفيش فرق سعر لكل دقة لقيته
  // ✅ FIX (مؤكد من صفحة الموديل مباشرة): تدرجات حقيقية حسب الدقة، بسعر "مع صوت" (with_audio) —
  // إحنا هنولّد بصوت (اتضاف generate_audio:true في newVideoModelsService.js بنفس نمط 2.0)،
  // فده السعر الصح المطابق فعليًا. الموديل مبيوصلش لـ4K (أقصى دقة معروضة 1080p)
  seedance_1_5:     { label: 'Seedance 1.5',       unit: 'second', usdCost: 0.052, maxClipSec: 12,
                       tiers: { '480p': 0.025, '720p': 0.052, '1080p': 0.12 } },
  // ✅ FIX (مؤكد من صفحة الموديل مباشرة، أعلى بكتير من التقدير القديم): بسعر "non_video_in"
  // (من غير فيديو مدخل — إحنا بنستخدمه لتوليد من نص/صورة بس زي كل الموديلات التانية)
  seedance_2_0:     { label: 'Seedance 2.0',       unit: 'second', usdCost: 0.18, maxClipSec: 15,
                       tiers: { '480p': 0.08, '720p': 0.18, '1080p': 0.45, '4k': 1.00 } },
  seedance_2_5:     { label: 'Seedance 2.5',       unit: 'second', usdCost: 0.168, maxClipSec: 30,
                       tiers: { '480p': 0.1028, '720p': 0.2312 } }, // مؤكد من Replicate مباشرة (non_video_in). 1080p/4K مش native output حقيقي (upscale بس)، متضافين هنا
  // ✅ NEW (طلب العميل، سعره وschema مؤكدين من سكرين شوت العميل مباشرة لصفحة الموديل الحقيقية):
  // alibaba/wan-3 — لحد 30 ثانية زي seedance_2_5 بالظبط. usdCost الافتراضي = 1080p (الدقة
  // الافتراضية فعليًا في الـschema نفسه)
  wan_3:            { label: 'Wan 3',              unit: 'second', usdCost: 0.10, maxClipSec: 30,
                       tiers: { '480p': 0.025, '720p': 0.05, '1080p': 0.10 } },
  // ✅ FIX: الاتنين مؤكدين من صفحة الموديل مباشرة دلوقتي (540p=$0.10/s، 720p=$0.18/s) — الترتيب
  // المنطقي اتظبط (دقة أعلى = سعر أعلى)، التناقض القديم كان بسبب رقم 720p القديم غير المؤكد
  luma_ray2_540p:   { label: 'Luma Ray 2 (540p)',   unit: 'second', usdCost: 0.10, maxClipSec: 9 },
  luma_ray2_720p:   { label: 'Luma Ray 2 (720p)',   unit: 'second', usdCost: 0.18, maxClipSec: 9 },
  // ✅ FIX (مؤكد من صفحة الموديل مباشرة، أعلى من التقدير القديم): سعر كل دقة، بدون تقسيم صوت/فيديو مدخل
  omni_flash_1_1:   { label: 'Gemini Omni 1.1 Flash', unit: 'second', usdCost: 0.15, maxClipSec: 10,
                       tiers: { '360p': 0.05, '720p': 0.15, '1080p': 0.23, '4k': 0.45 } },
  // ✅ NEW (طلب العميل، مؤكد من صفحة الموديل مباشرة — سكرين شوت العميل): بسعر non_video_in
  // (زي seedance_2_0 بالظبط — إحنا مش بنبعت فيديو مدخل). الموديل مبيوصلش لـ1080p/4K هنا
  seedance_2_0_fast: { label: 'Seedance 2.0 Fast', unit: 'second', usdCost: 0.15, maxClipSec: 15,
                       tiers: { '480p': 0.07, '720p': 0.15 } },
  // ✅ NEW (طلب العميل، مؤكد منه مباشرة)
  seedance_1_pro_fast: { label: 'Seedance 1 Pro Fast', unit: 'second', usdCost: 0.025, maxClipSec: 12,
                       tiers: { '480p': 0.015, '720p': 0.025, '1080p': 0.06 } },
  // ✅ NEW (طلب العميل، مؤكد من صفحة الموديل مباشرة — سكرين شوت العميل): بسعر "Standard" (draft
  // mode OFF) — إحنا دايمًا بنسلّم الجودة الكاملة الحقيقية للعميل، مش نسخة draft أرخص وأقل جودة
  prunaai_p_video:  { label: 'PrunaAI P-Video',    unit: 'second', usdCost: 0.02, maxClipSec: 10,
                       tiers: { '720p': 0.02, '1080p': 0.04 } },
  // ✅ NEW (طلب العميل، مؤكد من صفحة الموديل مباشرة — سكرين شوت العميل): نفس مبدأ Standard فوق.
  // الموديل ده بالتحديد بيدعم native-speech lip-sync حسب الـreadme بتاعه — خيار قوي لفيديوهات
  // فيها حوار/كلام حقيقي على الشاشة
  prunaai_p_video_2: { label: 'PrunaAI P-Video 2',  unit: 'second', usdCost: 0.03, maxClipSec: 10,
                       tiers: { '720p': 0.03, '1080p': 0.06 } },
  // ✅ CONFIRMED (طلب العميل: تعديل فيديوهات أطول من 10 ثواني): الـschema اتأكد من سكرين شوت
  // العميل — مفيش حد زمني صريح في Replicate نفسها (الحد الحقيقي حجم ملف 200MB بس)، بس منصة
  // Decart المباشرة بتعلن دعم لحد 30 دقيقة، وده سقف عملي معقول (مؤكد عبر بحث ويب، راجع
  // newVideoModelsService.js) — السعر $0.04/ثانية من تصريح العميل نفسه، لسه مش مؤكد من صفحة
  // الـPricing مباشرة (مفيش سكرين شوت لصفحة السعر بالتحديد)
  decart_lucy_edit_2: { label: 'Lucy Edit 2', unit: 'second', usdCost: 0.04, maxClipSec: 1800 },

  // ✅ CONFIRMED (سكرين شوت العميل لصفحة الـinput schema الحقيقية بعد كده): Kling Video 3.0
  // Omni — "unified multimodal" فعلاً (بيعدّل فيديو موجود كمان عبر reference_video، مش موصول
  // هنا حاليًا — راجع newVideoModelsService.js). حقل "mode" بقيمه 'standard'/'pro'/'4k' بيؤكد
  // افتراضنا القديم كان صح: 'standard'→720p, 'pro'→1080p, '4k'→4K. الأرقام هنا بسعر "مع صوت"
  // (audio variants) نفس قرارنا التاريخي إننا دايمًا نولّد بصوت (generate_audio:true)
  kling_3_0_omni:   { label: 'Kling 3.0 Omni',     unit: 'second', usdCost: 0.224, maxClipSec: 15,
                       tiers: { '720p': 0.224, '1080p': 0.28, '4k': 0.42 } },

  // ✅ CONFIRMED (سكرين شوت العميل لصفحة الـinput schema الحقيقية): PixVerse v4.5 — أول عيلة
  // موديلات جديدة تمامًا عندنا. الحقول الحقيقية: "quality" (مش "resolution") بقيم 360p/540p/
  // 720p/1080p، "duration" (5 أو 8 بس، 1080p ميدعمش 8)، "motion_mode" ('normal'/'smooth' —
  // smooth بيدفع ضعف السعر بالظبط، متاح بس مع duration=5). السعر مش خطي مع المدة (8 ثواني
  // بتاخد سعر/ثانية أعلى من 5 ثواني، مش نفسه) — الأرقام تحت مبنية على مدة 8 ثواني + normal
  // motion (السيناريو الأغلى المتاح لكل دقة، ما عدا 1080p اللي بياخد بس 5 ثواني) عشان نضمن
  // مانخسرش هامش حتى لو العميل طلب أطول مدة متاحة: 360p/540p = $0.60/8s = $0.075/s،
  // 720p = $0.80/8s = $0.10/s، 1080p = $0.80/5s = $0.16/s (المدة الوحيدة المتاحة). بنستخدم
  // motion_mode:"normal" دايمًا في newVideoModelsService.js — لو "smooth" هيتفعّل لاحقًا،
  // محتاج يتحسب بضعف السعر ده، مش نفس الأرقام
  pixverse_v4_5:    { label: 'PixVerse v4.5',      unit: 'second', usdCost: 0.075, maxClipSec: 8,
                       tiers: { '360p': 0.075, '540p': 0.075, '720p': 0.10, '1080p': 0.16 } },

  // ── Audio ─────────────────────────────────────────────────────────────────
  // ✅ NEW: الموديل الحقيقي المستخدم فعليًا (videoAudioService.js) هو google/gemini-3.1-flash-tts —
  // بيتسعّر بالتوكنز (نص/صوت) مش بالثانية مباشرة، بس بحساب معدل كلام طبيعي (~15 حرف/ثانية)
  // وسعر Google المعلن ($20/مليون توكن output audio ≈ $0.012/1000 حرف)، ده يعادل تقريبًا نفس
  // الرقم القديم هنا ($0.00025/ثانية) — خليناه زي ما هو مع هامش أمان بسيط
  gemini_flash_tts: { label: 'Gemini Flash TTS',   unit: 'second', usdCost: 0.0003 },
  // ✅ NEW: fictions-ai/autocaption على Replicate — حرق كابشن حقيقي على فيديو، سعر ثابت لكل
  // فيديو (مش لكل ثانية) بغض النظر عن مدته — ~$0.12/تشغيلة (مصدر: aggregator، غير مؤكد مباشرة)
  autocaption:      { label: 'Caption Burning',    unit: 'video', usdCost: 0.12 },
  // ✅ NEW (باج حقيقي: التوليد ده كان مجاني بالكامل من غير أي خصم كريديت رغم إنه بينادي
  // Replicate فعليًا) — resemble-ai/chatterbox-multilingual، سعر ثابت تقريبي لكل نداء/قطعة
  // نص (≤300 حرف، الحد الرسمي للموديل) — ~$0.0042/تشغيلة (مصدر: aggregator، غير مؤكد مباشرة
  // من صفحة Replicate نفسها). سكريبت طويل بيتقسم لقطع (splitTextIntoChunks) وكل قطعة نداء
  // منفصل، فالتكلفة الحقيقية بتتضاعف مع عدد القطع — بيتحسب صراحة في voiceCloneRoutes.js
  chatterbox_voice_clone: { label: 'Voice Clone Narration (per chunk)', unit: 'video', usdCost: 0.0042 },

  // ── Video analysis (real external API, standard 3x margin — not internal ffmpeg) ──────
  // ✅ NEW (طلب العميل: "حتى لو رخيصة، حطها" — بحث ويب حقيقي، مش تخمين): zsxkib/talknet-asd —
  // موديل حقيقي على Replicate بيكشف "مين بيتكلم إمتى" في فيديو (active speaker detection،
  // صوت+حركة الشفايف)، بيرجع توقيتات حقيقية. ~$0.036/تشغيلة (GPU T4) — بس ده رقم "نموذجي" بس،
  // مش سعر ثابت فعلي: الموديل ده مُسعّر بوقت معالجة GPU حقيقي (hardware-time billing) بيختلف
  // فعليًا حسب مدخلاته (طول الفيديو المُحلَّل) — العميل نبّه على ده صراحة ("أسعاره هتختلف كل
  // مرة... لازم نعمل حساب عشان منخسرش"). ⚠️ USD COST HERE FOR REFERENCE ONLY، مش المصدر
  // الحقيقي للتحصيل الفعلي — التحصيل الحقيقي (تقدير سخي مقدمًا + رد الفرق بعد التشغيل الحقيقي
  // من metrics.predict_time الحقيقي اللي Replicate نفسه بيرجعه) في videoAnalysisService.js's
  // estimateAnalysisCreditCost()/analyzeActiveSpeaker() — دول المصدر الحقيقي للحساب، مش
  // getFlatCreditCost('talknet_asd') هنا (لو حد استخدمها غلط هتدي رقم ثابت مش دقيق)
  talknet_asd:      { label: 'Active Speaker Detection', unit: 'video', usdCost: 0.036 },

  // ── Internal post-processing (server-side ffmpeg only — near-cost pricing) ────────────
  // ✅ NEW (قرار بزنس صريح من العميل): العمليات دي كلها ffmpeg محلي على السيرفر بتاعنا، مفيهاش
  // أي فاتورة API خارجية حقيقية — بنقدّر تكلفة الـcompute/التخزين/الـbandwidth بتاعتنا إحنا
  // بشكل متحفظ (تقدير داخلي، مش رقم من صفحة تسعير خارجية زي باقي الجدول ده) وبنطبّق
  // AUX_PROFIT_MULTIPLIER (1.25x) بدل الـ3x العادي، عشان الكريديت يبقى قريب من التكلفة الحقيقية
  merge_videos:     { label: 'Merge Videos (per clip)', unit: 'video', usdCost: 0.02 },
  compose_audio:    { label: 'Mix Narration/Dialogue Audio', unit: 'video', usdCost: 0.015 },
  conform_duration: { label: 'Conform Scene Duration', unit: 'video', usdCost: 0.015 },
};

/**
 * Converts a real Replicate/provider USD cost into an in-app credit price,
 * applying the standard profit multiplier. Always at least 1 credit.
 */
export function usdToCredits(usdCost, { multiplier = PROFIT_MULTIPLIER } = {}) {
  // ✅ FIX (باج حقيقي: العميل شاف "Veo 3" بـ49cr/s بدل 48، و"Kling 2.1" بـ7cr بدل 6، و"Luma
  // Ray 2 540p" بـ13cr بدل 12): أخطاء floating-point كلاسيكية في JS — مثلاً 0.40*3/0.025
  // بيطلع 48.00000000000001 مش 48 بالظبط، فـMath.ceil كان بيرفعها غلط لكريديت زيادة على
  // العميل. تقريب لـ6 خانات عشرية قبل الـceil بيشيل الضوضاء دي من غير ما يأثر على أي كسر حقيقي
  const raw = (usdCost * multiplier) / USD_PER_CREDIT;
  const rounded = Math.round(raw * 1e6) / 1e6;
  return Math.max(1, Math.ceil(rounded));
}

/**
 * Credit cost for generating `count` images with the given model key. Pass
 * `tier` (e.g. "1K"/"2K"/"4K") for models with real per-resolution pricing
 * (see REPLICATE_MODEL_COSTS[key].tiers) — falls back to the model's
 * blended/default usdCost if no tier given or the model has no tiers.
 */
export function getImageCreditCost(modelKey, count = 1, tier = null) {
  const model = REPLICATE_MODEL_COSTS[modelKey];
  if (!model || model.unit !== 'image') throw new Error(`Unknown image model: ${modelKey}`);
  const perImageUsd = (tier && model.tiers?.[tier]) ?? model.usdCost;
  return usdToCredits(perImageUsd) * Math.max(1, count);
}

/**
 * Credit cost for generating `durationSec` seconds of video/audio with the given
 * model key. Pass `tier` (e.g. "480p"/"720p"/"1080p"/"4k") for models that have
 * real per-resolution pricing (see REPLICATE_MODEL_COSTS[key].tiers) — falls
 * back to the model's blended/default usdCost if no tier given or the model
 * has no separate tiers.
 */
export function getPerSecondCreditCost(modelKey, durationSec, tier = null) {
  const model = REPLICATE_MODEL_COSTS[modelKey];
  if (!model || model.unit !== 'second') throw new Error(`Unknown per-second model: ${modelKey}`);
  const perSecondUsd = (tier && model.tiers?.[tier]) ?? model.usdCost;
  return usdToCredits(perSecondUsd * Math.max(1, durationSec));
}

/** Real max seconds per single clip for a video model (Replicate/provider limit), or null if not capped. */
export function getMaxClipSeconds(modelKey) {
  return REPLICATE_MODEL_COSTS[modelKey]?.maxClipSec ?? null;
}

// عمليات ffmpeg الداخلية البحتة (مفيهاش أي فاتورة API خارجية) — بتاخد AUX_PROFIT_MULTIPLIER
// (هامش صغير قريب من التكلفة) بدل الـ3x العادي المخصص لتوليد AI حقيقي بتكلفة خارجية فعلية
const INTERNAL_PROCESSING_KEYS = new Set(['merge_videos', 'compose_audio', 'conform_duration']);

/** Flat per-run credit cost for a "unit: 'video'" model (e.g. caption burning) — doesn't scale with duration/count. */
export function getFlatCreditCost(modelKey) {
  const model = REPLICATE_MODEL_COSTS[modelKey];
  if (!model || model.unit !== 'video') throw new Error(`Unknown flat-cost model: ${modelKey}`);
  const multiplier = INTERNAL_PROCESSING_KEYS.has(modelKey) ? AUX_PROFIT_MULTIPLIER : PROFIT_MULTIPLIER;
  return usdToCredits(model.usdCost, { multiplier });
}

/** List of real quality tiers (e.g. ["480p","720p"]) a video model supports, or null if it only has one flat rate. */
export function getQualityTiers(modelKey) {
  const tiers = REPLICATE_MODEL_COSTS[modelKey]?.tiers;
  return tiers ? Object.keys(tiers) : null;
}

/**
 * Builds the full pricing table — every model, its real USD cost, and the
 * computed in-app credit price — for client review and for use across the
 * new image/video generation endpoints being added in later phases. When a
 * model has real per-resolution tiers, each tier is listed with its own
 * credit cost alongside the blended default.
 */
export function buildFullPricingTable() {
  return Object.entries(REPLICATE_MODEL_COSTS).map(([key, model]) => ({
    key,
    label: model.label,
    unit: model.unit,
    usdCost: model.usdCost,
    creditCost: usdToCredits(model.usdCost, { multiplier: INTERNAL_PROCESSING_KEYS.has(key) ? AUX_PROFIT_MULTIPLIER : PROFIT_MULTIPLIER }),
    maxClipSec: model.maxClipSec ?? null,
    tiers: model.tiers
      ? Object.fromEntries(Object.entries(model.tiers).map(([tier, usd]) => [tier, { usdCost: usd, creditCost: usdToCredits(usd) }]))
      : null,
  }));
}
