// ── siteAssets.js ── صور وفيديوهات حقيقية للمواقع اللي Claude بيبنيها في الشات:
// جوه بلوك ```html``` الموديل بيكتب مكان الصورة: {{pexels-image:QUERY}} أو {{pexels-video:QUERY}} (مجاني من Pexels)
// أو {{ai-image:PROMPT}} (صورة بالذكاء الاصطناعي بأرخص موديل، بالكريديت). السيرفر بيبدّلهم بروابط حقيقية قبل ما الرد يوصل للعميل.
import { searchPexels } from './documentary/sources/pexels.js';
import { generateNewModelImages } from './newImageModelsService.js';
import { getImageCreditCost } from './creditPricingEngine.js';

const AI_IMAGE_MODEL = 'grok_image'; // أرخص موديل صور حاليًا
export const MAX_AI_IMAGES_PER_MESSAGE = 6;
const TOKEN = /\{\{\s*(pexels-image|pexels-video|ai-image)\s*:\s*([^}]{2,300})\}\}/g;
const placeholder = (q) => `https://placehold.co/1200x800/1a1830/a99bff?text=${encodeURIComponent(String(q).slice(0, 40))}`;

/** بيبدّل الرموز جوه بلوكات HTML بس. budgetCredits = أقصى كريديت مسموح للصور الـAI في الرسالة دي */
export async function resolveSiteAssets(reply, { budgetCredits = 0, deps = {} } = {}) {
  const text = String(reply || '');
  if (!/```html[\s\S]*?\{\{\s*(pexels-image|pexels-video|ai-image)\s*:/i.test(text)) return { reply: text, aiImages: 0, aiCredits: 0 };
  const search = deps.searchPexels || searchPexels;
  const genImage = deps.generateImage || ((prompt) => generateNewModelImages({ modelKey: AI_IMAGE_MODEL, prompt, aspectRatio: '16:9', count: 1 }));
  const aiCost = getImageCreditCost(AI_IMAGE_MODEL, 1);
  const cache = new Map(); const used = new Map(); // query → نتايج، وعدّاد عشان نفس البحث مايرجعش نفس الصورة كل مرة
  let aiImages = 0, aiCredits = 0;

  const pick = async (kind, q) => {
    const key = `${kind}|${q.toLowerCase()}`;
    if (!cache.has(key)) cache.set(key, await search(q, { kinds: [kind === 'pexels-video' ? 'video' : 'image'], orientation: 'landscape', limit: 8 }).catch(() => []));
    const list = (cache.get(key) || []).filter(x => x.kind === (kind === 'pexels-video' ? 'video' : 'image'));
    const n = used.get(key) || 0; used.set(key, n + 1);
    return list.length ? list[n % list.length].url : null;
  };
  const resolveOne = async (kind, q) => {
    q = q.trim();
    if (kind === 'ai-image') {
      if (aiImages < MAX_AI_IMAGES_PER_MESSAGE && aiCredits + aiCost <= budgetCredits) {
        try {
          const out = await genImage(q);
          const url = Array.isArray(out) ? (typeof out[0] === 'string' ? out[0] : out[0]?.url) : null;
          if (url) { aiImages++; aiCredits += aiCost; return url; }
        } catch (e) { console.warn('[SiteAssets] AI image failed:', e.message); }
      }
      return (await pick('pexels-image', q)) || placeholder(q); // الرصيد مش كفاية أو فشل → صورة حقيقية من Pexels
    }
    return (await pick(kind, q)) || placeholder(q);
  };

  // بنعدّي على كل بلوك HTML بالترتيب (الصور الـAI بالتسلسل عشان الميزانية)
  const parts = text.split(/(```html[\s\S]*?```)/i);
  for (let i = 0; i < parts.length; i++) {
    if (!/^```html/i.test(parts[i])) continue;
    let block = parts[i];
    const tokens = [...block.matchAll(TOKEN)];
    for (const m of tokens) {
      const url = await resolveOne(m[1].toLowerCase(), m[2]);
      block = block.replace(m[0], url);
    }
    parts[i] = block;
  }
  return { reply: parts.join(''), aiImages, aiCredits };
}
