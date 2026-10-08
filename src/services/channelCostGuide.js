// ── channelCostGuide.js ──────────────────────────────────────────────────────
// بيانات "دليل تكلفة الفيديوهات الطويلة": أسعار كل موديل صور/تحريك (بالكريديت الحقيقي من
// creditPricingEngine.js — نفس أرقام الخصم الفعلي)، تكلفة الإعداد الحالي للقناة، وأرخص توصيات
// حسب هل القناة بتستخدم فويس أوفر. التوصيات مجرد اقتراح — مفيش حاجة بتتغير في القناة غير لو العميل
// ضغط "طبّق الموصى به" بنفسه (PATCH /api/channels/:id العادي).

import { NEW_IMAGE_MODELS, supportsReferenceImages } from './newImageModelsService.js';
import { NEW_VIDEO_MODELS } from './newVideoModelsService.js';
import { REPLICATE_MODEL_COSTS, getImageCreditCost, getPerSecondCreditCost } from './creditPricingEngine.js';
import { estimateChannelRunBreakdown } from './channelSchedulerService.js';

const RECOMMENDED_IMAGE = 'nano_banana_2_lite';
const P_VIDEO = 'prunaai_p_video';           // بيولّد صوت AI تلقائي مع الفيديو
const SILENT_CHEAP = 'seedance_1_pro_fast';   // فيديو من غير صوت

function defaultResolutionOf(modelKey) {
  try { return NEW_VIDEO_MODELS[modelKey].buildInput({ prompt: 'x' }).resolution || null; } catch { return null; }
}

export function buildChannelCostGuide(channel, balance) {
  const animationModels = Object.keys(NEW_VIDEO_MODELS)
    .filter(k => NEW_VIDEO_MODELS[k].supportsImageInput && !NEW_VIDEO_MODELS[k].performanceTransfer && REPLICATE_MODEL_COSTS[k]?.unit === 'second')
    .map(k => {
      const c = REPLICATE_MODEL_COSTS[k];
      return {
        key: k, label: c.label, maxClipSec: c.maxClipSec ?? null,
        perSecCredits: getPerSecondCreditCost(k, 1),
        defaultResolution: defaultResolutionOf(k),
        tiers: c.tiers ? Object.keys(c.tiers).map(t => ({ tier: t, perSecCredits: getPerSecondCreditCost(k, 1, t) })) : [],
      };
    })
    .sort((a, b) => a.perSecCredits - b.perSecCredits);

  const imageModels = Object.keys(NEW_IMAGE_MODELS)
    .filter(k => REPLICATE_MODEL_COSTS[k]?.unit === 'image')
    .map(k => ({
      key: k, label: REPLICATE_MODEL_COSTS[k].label, perImageCredits: getImageCreditCost(k, 1),
      supportsReference: supportsReferenceImages(k),
      tiers: REPLICATE_MODEL_COSTS[k].tiers ? Object.keys(REPLICATE_MODEL_COSTS[k].tiers).map(t => ({ tier: t, perImageCredits: getImageCreditCost(k, 1, t) })) : [],
    }))
    .sort((a, b) => a.perImageCredits - b.perImageCredits);

  const usesVoice = !!channel.uses_voice;
  const haveImg = imageModels.some(m => m.key === RECOMMENDED_IMAGE);
  const haveAnim = (k) => animationModels.some(m => m.key === k);
  const animation = usesVoice
    ? [{ key: SILENT_CHEAP, reason: 'voiceover' }]
    : [{ key: P_VIDEO, reason: 'ai_audio' }, { key: SILENT_CHEAP, reason: 'silent' }];
  const recommendations = {
    image: haveImg ? { key: RECOMMENDED_IMAGE, reason: 'cheapest_with_reference' } : null,
    animation: animation.filter(a => haveAnim(a.key)),
  };

  const asLong = { ...channel, uses_voice: usesVoice ? 1 : 0 };
  const current = estimateChannelRunBreakdown(asLong, 'long');
  // تقدير السيرفر (نفس معادلة الخصم الفعلي) لكل خيار تحريك مقترح مع موديل الصور المقترح
  recommendations.animation = recommendations.animation.map(a => ({
    ...a,
    estimateTotal: estimateChannelRunBreakdown({ ...asLong, image_model: recommendations.image?.key || channel.image_model, animation_model: a.key }, 'long')?.total ?? null,
  }));
  const recAnim = recommendations.animation[0]?.key;
  const recommended = (recommendations.image || recAnim)
    ? estimateChannelRunBreakdown({ ...asLong, image_model: recommendations.image?.key || channel.image_model, animation_model: recAnim || channel.animation_model }, 'long')
    : null;

  return {
    channel: {
      id: channel.id, label: channel.label || channel.channel_id, usesVoice,
      imageModel: channel.image_model || null, animationModel: channel.animation_model || null,
    },
    balance,
    animationModels, imageModels, recommendations,
    currentEstimate: current ? { total: current.total, sceneCount: current.sceneCount, sceneDurationSec: current.defaultSceneDurationSec, imageModel: current.imageModel, animationModel: current.animationModel, imagesCost: current.imagesCost, clips: current.clips, captions: current.captions } : null,
    recommendedEstimate: recommended ? { total: recommended.total, imageModel: recommended.imageModel, animationModel: recommended.animationModel } : null,
  };
}
