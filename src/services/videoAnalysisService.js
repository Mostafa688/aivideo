// ── videoAnalysisService.js ───────────────────────────────────────────────────
// طلب العميل: أداة تحليل فيديو حقيقية (zsxkib/talknet-asd — Active Speaker Detection: بتحدد
// "مين بيتكلم إمتى" في فيديو بتحليل الصوت + حركة الشفايف مع بعض) — تُستخدم في حالتين:
//   1. كأداة مستقلة: أي عميل يرفع أي فيديو ويطلب تحليله مباشرة.
//   2. كخطوة تمهيدية قبل مونتاج فيديو أطول من 10 ثواني (decart/lucy-edit-2) — نتيجة التحليل
//      بتدي الايجنت معلومات حقيقية (مين بيتكلم وإمتى) يقدر يبني منها تعليمة تعديل أذكى وأدق.
//
// ✅ CONFIRMED (سكرين شوت العميل الحقيقي لصفحة الـInput schema): الحقول الحقيقية هي "video"
// (uri — تخميننا الأول كان صح فعلاً)، "start" (integer — بداية التحليل بالثانية)، "duration"
// (integer — طول الجزء المُحلَّل، -1 = الفيديو كامل، ده الافتراضي)، "return_json" (bool،
// الافتراضي true — لازم يفضل true عشان نقدر نبني ملاحظة نصية مفهومة للايجنت من النتيجة)،
// وباقي الحقول (min_track/crop_scale/min_face_size/face_det_scale/num_failed_det/
// return_boundingbox_percentages) بتتحكم في دقة/حساسية الكشف نفسه — سايبينها بالافتراضي بتاعها
// (معقولة لحالتنا)، مش محتاجين bounding boxes (بس التوقيتات)
//
// ✅ تسعير آمن (طلب العميل الصريح: "أسعاره هتختلف كل مرة... لازم نعمل حساب عشان منخسرش"):
// الموديل ده مُسعّر بالوقت الحقيقي لمعالجة GPU (T4 hardware-time billing)، مش سعر مخرجات ثابت
// زي باقي موديلات الصور/الفيديو في المشروع — يعني التكلفة الحقيقية معروفة بعد التشغيل خلاص،
// مش قبله. الحل: نحصّل مقدمًا تقدير سخي (يغطي أسوأ سيناريو واقعي بهامش أمان حقيقي)، وبعد ما
// التشغيل الحقيقي يخلص، نقرا "metrics.predict_time" الحقيقي من رد Replicate نفسه ونرجّع أي
// فرق زيادة للعميل (رد جزئي) — كده مستحيل نخسر (السقف مغطّى مقدمًا) وميبقاش فيه مبالغة غير
// عادلة للعميل (بيرجعله الفرق لو التشغيل الفعلي كان أرخص من التقدير)
import fetch from 'node-fetch';
import { usdToCredits, PROFIT_MULTIPLIER } from './creditPricingEngine.js';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const T4_USD_PER_SEC = 0.000225; // سعر Replicate المعلن الحقيقي لهاردوير Nvidia T4 (مؤكد عبر بحث ويب)

function replicateHeaders() {
  return { Authorization: `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' };
}

/**
 * Conservative upfront cost estimate for analyzing a video of the given real
 * duration — used to pre-charge credits before the actual (variable) Replicate
 * run completes. Assumes a generous worst-case processing ratio (5x realtime,
 * i.e. 5 seconds of T4 compute per second of input video) plus fixed model-load
 * overhead, so under-charging should be rare; any excess gets refunded after
 * the real run using its actual reported `predict_time`.
 */
export function estimateAnalysisCreditCost(videoDurationSec) {
  const FIXED_OVERHEAD_SEC = 30;
  const WORST_CASE_RATIO = 5;
  const estimatedRuntimeSec = FIXED_OVERHEAD_SEC + Math.max(1, videoDurationSec) * WORST_CASE_RATIO;
  return usdToCredits(estimatedRuntimeSec * T4_USD_PER_SEC, { multiplier: PROFIT_MULTIPLIER });
}

/**
 * Runs zsxkib/talknet-asd on a video and returns its raw output plus the
 * REAL credit cost (computed from Replicate's own reported predict_time, not
 * the upfront estimate) so the caller can refund the difference from whatever
 * was pre-charged via estimateAnalysisCreditCost().
 */
export async function analyzeActiveSpeaker(videoUrl) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const res = await fetch('https://api.replicate.com/v1/models/zsxkib/talknet-asd/predictions', {
    method: 'POST',
    headers: { ...replicateHeaders(), Prefer: 'wait' },
    body: JSON.stringify({ input: { video: videoUrl, start: 0, duration: -1, return_json: true } }),
  });
  if (!res.ok) throw new Error(`talknet-asd ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let data = await res.json();
  if (data.error) throw new Error(`talknet-asd: ${data.error}`);

  const start = Date.now();
  while (data.status !== 'succeeded' && data.status !== 'failed' && data.status !== 'canceled' && Date.now() - start < 5 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 3000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, { headers: replicateHeaders() });
    if (poll.ok) data = await poll.json();
  }
  if (data.status !== 'succeeded') throw new Error(`talknet-asd failed: ${JSON.stringify(data.error || data.logs?.slice(-300))}`);

  // ✅ التكلفة الحقيقية من Replicate نفسها (predict_time بالثواني الفعلية اللي اتحسبت)، مش
  // تقديرنا المقدّم — لو مفيش metrics لأي سبب (رد غير متوقع)، نرجع للتقدير السخي كحد أقصى آمن
  // (منستخدمش رقم أقل قد يكون غير حقيقي)
  const realPredictTimeSec = data.metrics?.predict_time ?? null;
  const realCreditCost = realPredictTimeSec != null
    ? usdToCredits(realPredictTimeSec * T4_USD_PER_SEC, { multiplier: PROFIT_MULTIPLIER })
    : null; // null = مقدرناش نقرا التكلفة الحقيقية، الكولر يفضل محتفظ بالتقدير المسبق كامل

  return {
    output: data.output,
    realPredictTimeSec,
    realCreditCost,
  };
}
