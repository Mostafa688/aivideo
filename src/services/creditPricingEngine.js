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
  seedream_4:       { label: 'Seedream 4',         unit: 'image', usdCost: 0.030 },
  // ✅ FIX: تدرجات حقيقية حسب دقة الصورة، مؤكدة من صفحة الموديل مباشرة — مش رقم متوسط تقديري تاني
  seedream_5:       { label: 'Seedream 5',         unit: 'image', usdCost: 0.045, tiers: { '1K': 0.045, '2K': 0.090 } },
  seedream_5_lite:  { label: 'Seedream 5 Lite',    unit: 'image', usdCost: 0.035 },

  // ── Video generation (per second of output) ──────────────────────────────
  // كل موديل فيديو هنا بيسعّر حسب الدقة (وأحيانًا حسب معايير تانية زي وجود صوت أو صورة/فيديو
  // مدخل) — بنستخدم دايمًا السيناريو المطابق لاستخدامنا الفعلي (مثلاً: مفيش صوت اختياري
  // للعميل يقفله، فبنسعّر بسعر "مع صوت"؛ ومفيش فيديو-لفيديو غير في omni_flash_1_1 تحديدًا،
  // فباقي الموديلات بتتسعّر بسعر "من غير فيديو مدخل")
  veo3_fast:        { label: 'Veo 3 Fast',         unit: 'second', usdCost: 0.15, maxClipSec: 8,
                       tiers: { '720p': 0.15, '1080p': 0.15 } }, // مؤكد: with_audio=$0.15/s (without_audio=$0.10/s، مش مستخدم عندنا لأننا دايمًا بنولّد بصوت)
  veo3_standard:    { label: 'Veo 3',              unit: 'second', usdCost: 0.40, maxClipSec: 8,
                       tiers: { '720p': 0.40, '1080p': 0.40 } }, // مؤكد: with_audio=$0.40/s (without_audio=$0.20/s)
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
  // ✅ FIX: الاتنين مؤكدين من صفحة الموديل مباشرة دلوقتي (540p=$0.10/s، 720p=$0.18/s) — الترتيب
  // المنطقي اتظبط (دقة أعلى = سعر أعلى)، التناقض القديم كان بسبب رقم 720p القديم غير المؤكد
  luma_ray2_540p:   { label: 'Luma Ray 2 (540p)',   unit: 'second', usdCost: 0.10, maxClipSec: 9 },
  luma_ray2_720p:   { label: 'Luma Ray 2 (720p)',   unit: 'second', usdCost: 0.18, maxClipSec: 9 },
  // ✅ FIX (مؤكد من صفحة الموديل مباشرة، أعلى من التقدير القديم): سعر كل دقة، بدون تقسيم صوت/فيديو مدخل
  omni_flash_1_1:   { label: 'Gemini Omni 1.1 Flash', unit: 'second', usdCost: 0.15, maxClipSec: 10,
                       tiers: { '360p': 0.05, '720p': 0.15, '1080p': 0.23, '4k': 0.45 } },

  // ── Audio ─────────────────────────────────────────────────────────────────
  gemini_flash_tts: { label: 'Gemini Flash TTS',   unit: 'second', usdCost: 0.00025 },
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
    creditCost: usdToCredits(model.usdCost),
    maxClipSec: model.maxClipSec ?? null,
    tiers: model.tiers
      ? Object.fromEntries(Object.entries(model.tiers).map(([tier, usd]) => [tier, { usdCost: usd, creditCost: usdToCredits(usd) }]))
      : null,
  }));
}
