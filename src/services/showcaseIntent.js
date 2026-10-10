// ── showcaseIntent.js ── لما العميل يطلب يشوف أمثلة/نتائج شغل الموقع في شات الايجنت: بنعرض فيديوهات حقيقية (إعلان/سينمائي/كوميدي)،
// ولو طلب نتيجة فيلم وثائقي بنقوله يجرّبه مجانًا بصوت دقيقة. كشف بالكود (من غير LLM) عشان السلوك يبقى ثابت ومجاني.
import { showcaseFor, SHOWCASE_KINDS } from './showcaseVideos.js';

const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const SEE = /(ارني|اريني|ارينا|اروني|وريني|اوريني|ورينا|عايز اشوف|عاوز اشوف|عايزه اشوف|عاوزه اشوف|اشوف|اتفرج|شوف|show me|show us|let me see|can i see|could i see|i want to see|i wanna see|see some|see an?\b|view)/;
const NOUN = /(نتايج|نتيجه|نتائج|امثله|مثال|نماذج|نموذج|اعمالكم|شغلكم|شغل الموقع|اعمال الموقع|examples?|samples?|results?|demos?|portfolio|your work|previous work|made with)/;
const STRONG_NOUN = /(امثله|examples?|samples?|نماذج|portfolio|demos?)/;
const OWN = /(بتاعي|بتاعتي|عملته|عملتها|عملناه|my video|my own|my ad|my project|my last)/;
const DOC = /(وثايقي|وثائقي|documentar)/;
const AD = /(اعلان|اعلانات|\bads?\b|advert|commercial)/;
const CINEMATIC = /(سينمايي|سينمائي|سينما|cinematic|cinema|\bfilm\b|\bmovie\b)/;
const COMEDY = /(كوميدي|كوميدى|كوميديا|comedy|funny|مضحك|ضحك)/;

/** @returns {null | { kind: 'documentary' | 'ad' | 'cinematic' | 'comedy' | 'all' }} */
export function detectShowcaseIntent(message) {
  const t = norm(message);
  if (!t || t.length > 220 || OWN.test(t)) return null;
  const asks = (SEE.test(t) && NOUN.test(t)) || (STRONG_NOUN.test(t) && t.length < 90 && /(\?|؟|عندكم|فيه|في |هل|do you|are there|any|have you)/.test(t));
  if (!asks) return null;
  if (DOC.test(t)) return { kind: 'documentary' };
  if (AD.test(t)) return { kind: 'ad' };
  if (CINEMATIC.test(t)) return { kind: 'cinematic' };
  if (COMEDY.test(t)) return { kind: 'comedy' };
  return { kind: 'all' };
}

const hasArabic = (s) => /[؀-ۿ]/.test(String(s || ''));

/** بيبني رد الايجنت (نص + فيديوهات أو دعوة لتجربة الوثائقي المجانية) */
export function buildShowcaseReply(message, intent, { trialAvailable = true } = {}) {
  const ar = hasArabic(message);
  if (intent.kind === 'documentary') {
    return {
      reply: ar
        ? (trialAvailable
          ? 'الفيلم الوثائقي أحسن تجربه بنفسك — وأول دقيقة مجانية 🎬 سجّل صوت مدته دقيقة (قصة، درس، أو سكريبت) وارفعه هنا في الشات من زرار + أو في Documentary Studio، وأنا أبني لك الفيلم حوالين صوتك بلقطات حقيقية وكابشن وموشن جرافيك. الدقيقة المجانية عليها علامة مائية صغيرة.'
          : 'الفيلم الوثائقي أحسن تجربه بنفسك 🎬 جرّبت الدقيقة المجانية قبل كده، لكن تقدر تعمل أي فيلم وثائقي بالكريديت: ارفع صوتك أو ابعت الموضوع هنا في الشات أو في Documentary Studio، وأقولك السعر قبل ما نبدأ.')
        : (trialAvailable
          ? "A documentary is best tried yourself — and your first minute is free 🎬 Record a one-minute voiceover (a story, a lesson or a script) and upload it here in the chat with the + button, or in the Documentary Studio, and I'll build the film around your voice with real footage, captions and motion graphics. The free minute carries a small watermark."
          : "A documentary is best tried yourself 🎬 You've already used the free minute, but you can make any documentary with credits: upload your voiceover or send me the topic here or in the Documentary Studio, and I'll tell you the price before we start."),
      docCta: { label: ar ? 'افتح Documentary Studio' : 'Open the Documentary Studio' },
    };
  }
  const items = showcaseFor(intent.kind);
  const kindName = SHOWCASE_KINDS[intent.kind]?.[ar ? 'ar' : 'en'];
  return {
    reply: ar
      ? `دي ${intent.kind === 'all' ? 'نماذج حقيقية' : `نماذج ${kindName} حقيقية`} اتعملت بـ Erivion 👇 اضغط على أي فيديو عشان تشغّله بالصوت. عايز تعمل زيها؟ قولي فكرتك وأنا أبدأ معاك.`
      : `Here ${intent.kind === 'all' ? 'are real examples' : `are real ${kindName.toLowerCase()} examples`} made with Erivion 👇 Tap any video to play it with sound. Want to make one like these? Tell me your idea and I'll start.`,
    showcase: items.map(v => ({ id: v.id, kind: v.kind, url: v.url, title: v.title })),
  };
}
