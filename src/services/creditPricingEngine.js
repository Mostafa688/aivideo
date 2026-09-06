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
//   2. USD_PER_CREDIT is the actual revenue per credit the business already
//      gets today, derived from the cheapest real package: $15 for 600 credits
//      (see CREDITS_PACKAGES.credits_starter in authService.js) = $0.025/credit.
//      This is deliberately NOT a live USD→EGP conversion — Replicate bills in
//      USD regardless of which region the customer is in, and Egyptian pricing
//      is an intentional PPP discount (420 EGP for the same 600 credits an
//      international customer pays $15 for) that must stay untouched. Anchoring
//      to the international USD price keeps margins correct in both currencies.
//   3. PROFIT_MULTIPLIER (3x) is applied on top of raw API cost before
//      converting to credits — it covers R2 storage, LLM script-writing calls,
//      payment-processor fees (InstaPay/Gumroad take a cut), and margin. 3x is
//      close to the ~2.8x already implied by Model 3's existing tuned price
//      (6.67 credits/image × $0.025 ÷ ~$0.06 real Grok Imagine cost), so new
//      models line up with how the rest of the app is already priced.
//
// IMPORTANT: third-party pricing aggregators drift constantly. Before wiring
// any model below into an actual generation endpoint, re-confirm its exact
// per-unit cost against Replicate's own model page for that exact slug.

export const USD_PER_CREDIT = 0.025;
export const PROFIT_MULTIPLIER = 3;

// Every model here charges per generated unit — most images are "per image",
// most video/audio models are "per second of output".
export const REPLICATE_MODEL_COSTS = {
  // ── Image generation ──────────────────────────────────────────────────────
  nano_banana:      { label: 'Nano Banana',        unit: 'image', usdCost: 0.039 },
  nano_banana_2:    { label: 'Nano Banana 2',      unit: 'image', usdCost: 0.100 },
  nano_banana_pro:  { label: 'Nano Banana Pro',    unit: 'image', usdCost: 0.180 }, // avg of 2K/4K tiers
  nano_banana_lite: { label: 'Nano Banana Lite',   unit: 'image', usdCost: 0.045 },
  grok_image:       { label: 'Grok Image',         unit: 'image', usdCost: 0.060 }, // avg of 1K/2K tiers
  gpt_image:        { label: 'GPT-Image',          unit: 'image', usdCost: 0.042 }, // "medium" quality tier
  seedream_4:       { label: 'Seedream 4',         unit: 'image', usdCost: 0.035 },
  seedream_5:       { label: 'Seedream 5',         unit: 'image', usdCost: 0.065 }, // avg of low/high-res tiers
  seedream_5_lite:  { label: 'Seedream 5 Lite',    unit: 'image', usdCost: 0.035 },

  // ── Video generation (per second of output) ──────────────────────────────
  // ✅ NEW: موديلات الفيديو دلوقتي بتدعم "tiers" (جودة/دقة مختلفة بسعر مختلف فعليًا، مش رقم
  // واحد متوسط زي الأول) — usdCost فضل موجود كـ fallback (متوسط الـ tiers) لأي كود قديم لسه
  // بيستخدم getPerSecondCreditCost بمفتاح الموديل لوحده من غير تحديد جودة. الأرقام دي من
  // Replicate نفسها/aggregator sites وقت الكتابة (Sept 2026) — تتأكد قبل الإطلاق الحقيقي،
  // خصوصًا Seedance 2.0 اللي مصادره اتضاربت (رقمين مختلفين ظهروا لنفس الموديل)
  veo3_fast:        { label: 'Veo 3 Fast',         unit: 'second', usdCost: 0.15, maxClipSec: 8,
                       tiers: { '720p': 0.15, '1080p': 0.15 } }, // ✅ نفس السعر للاتنين فعليًا (مؤكد من Google direct API)
  veo3_standard:    { label: 'Veo 3',              unit: 'second', usdCost: 0.40, maxClipSec: 8,
                       tiers: { '720p': 0.40, '1080p': 0.40 } }, // نفس السعر للاتنين فعليًا
  kling_2_1:        { label: 'Kling 2.1',          unit: 'second', usdCost: 0.045, maxClipSec: 10 }, // confirmed real model (kwaivgi/kling-v2.1, 720p/1080p, 5s/10s) — exact per-tier cost not found, using blended estimate
  kling_2_5:        { label: 'Kling 2.5',          unit: 'second', usdCost: 0.07, maxClipSec: 10 }, // مؤكد: $0.35/5s = $0.70/10s = $0.07/sec ثابت، مفيش فرق سعر لكل دقة لقيته
  seedance_1_5:     { label: 'Seedance 1.5',       unit: 'second', usdCost: 0.070, maxClipSec: 12 }, // confirmed real model (bytedance/seedance-1.5-pro) — exact pricing not found, using estimate
  seedance_2_0:     { label: 'Seedance 2.0',       unit: 'second', usdCost: 0.180, maxClipSec: 15,
                       tiers: { '480p': 0.0673, '720p': 0.151, '1080p': 0.35, '4k': 0.7776 } }, // ⚠ مصادر متضاربة — 480p و4K مؤكدين، 720p/1080p متوسط تقديري بينهم، يحتاج تأكيد نهائي
  seedance_2_5:     { label: 'Seedance 2.5',       unit: 'second', usdCost: 0.168, maxClipSec: 30,
                       tiers: { '480p': 0.1028, '720p': 0.2312 } }, // مؤكد من Replicate مباشرة. 1080p/4K مش native output حقيقي (upscale بس)، متضافين هنا
  luma_ray2_540p:   { label: 'Luma Ray 2 (540p)',   unit: 'second', usdCost: 0.035, maxClipSec: 9 }, // مؤكد: $0.15/5s=$0.03/s .. $0.45/10s=$0.045/s (استخدمنا متوسط)، أقصى مدة موثقة 9s
  luma_ray2_720p:   { label: 'Luma Ray 2 (720p)',   unit: 'second', usdCost: 0.075, maxClipSec: 9 }, // مؤكد: $0.30/5s=$0.06/s .. $0.90/10s=$0.09/s (استخدمنا متوسط)، أقصى مدة موثقة 9s

  // ── Audio ─────────────────────────────────────────────────────────────────
  gemini_flash_tts: { label: 'Gemini Flash TTS',   unit: 'second', usdCost: 0.00025 },
};

/**
 * Converts a real Replicate/provider USD cost into an in-app credit price,
 * applying the standard profit multiplier. Always at least 1 credit.
 */
export function usdToCredits(usdCost, { multiplier = PROFIT_MULTIPLIER } = {}) {
  return Math.max(1, Math.ceil((usdCost * multiplier) / USD_PER_CREDIT));
}

/** Credit cost for generating `count` images with the given model key. */
export function getImageCreditCost(modelKey, count = 1) {
  const model = REPLICATE_MODEL_COSTS[modelKey];
  if (!model || model.unit !== 'image') throw new Error(`Unknown image model: ${modelKey}`);
  return usdToCredits(model.usdCost) * Math.max(1, count);
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
