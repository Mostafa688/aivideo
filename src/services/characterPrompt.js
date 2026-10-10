// ── characterPrompt.js ── بناء برومبت الشخصية المتولدة بالذكاء الاصطناعي (Nano Banana 2.1) — مصدر واحد مشترك بين الموقع والـMCP
// pure JS من غير أي اعتماديات، فبيتستورد في الفرونت (Vite) وفي السيرفر بنفس الشكل.
// القاعدة: الخلفية بيضاء سادة والشخصية من غير أي حاجة في إيدها أو عليها إكسسوار — مهما كان الوصف طويل —
// إلا لو العميل ذكر صراحة خلفية/مكان (فنلتزم بيه) أو شيء/إكسسوار (فنضيفه). كل واحدة مستقلة عن التانية.
// المطابقة بكلمات كاملة (مع إسقاط بادئات العربي ال/و/ب/ف/ل) عشان "كابتن" متتحسبش "كاب" و"address" متتحسبش "dress".
const norm = (w) => w.toLowerCase().replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const BG_WORDS = new Set(['خلفيه', 'ملعب', 'مكتب', 'شارع', 'غابه', 'شاطي', 'غرفه', 'مطبخ', 'مدينه', 'صحرا', 'صحراء', 'مستشفي', 'مدرسه', 'سياره', 'بحر', 'جبل', 'سماء', 'خارج', 'داخل', 'حديقه', 'مشهد', 'background', 'backdrop', 'street', 'office', 'beach', 'forest', 'room', 'court', 'stadium', 'city', 'desert', 'kitchen', 'outdoors', 'indoors', 'outdoor', 'indoor', 'park', 'garden', 'scene', 'setting', 'landscape']);
const PROP_WORDS = new Set(['شنطه', 'حقيبه', 'يحمل', 'تحمل', 'حامل', 'حامله', 'ماسك', 'ماسكه', 'نظاره', 'نظارات', 'نظارتين', 'قبعه', 'كاب', 'خوذه', 'ساعه', 'سلاح', 'سيف', 'عصا', 'جيتار', 'هاتف', 'موبايل', 'مظله', 'ميكروفون', 'كاميرا', 'كتاب', 'قلم', 'كوب', 'سماعات', 'holding', 'holds', 'hold', 'carrying', 'carries', 'bag', 'backpack', 'handbag', 'glasses', 'sunglasses', 'hat', 'cap', 'helmet', 'watch', 'sword', 'weapon', 'umbrella', 'guitar', 'phone', 'microphone', 'camera', 'book', 'headphones', 'accessories', 'props']);
const mentions = (d, set) => d.trim().split(/[\s,.،؛:!?؟()"'-]+/).filter(Boolean).some((w) => {
  const n = norm(w);
  if (set.has(n)) return true;
  const stripped = n.replace(/^(ال|و|ب|ف|ل)+/, '');
  return stripped.length > 1 && set.has(stripped);
});

export function buildCharacterPrompt(kind, style, desc) {
  const subject = { person: 'a person', animal: 'an animal character', cartoon: 'a cartoon character', mascot: 'a brand mascot character', other: 'a character' }[kind] || 'a character';
  const look = {
    realistic: 'Photorealistic studio portrait photograph',
    cartoon3d: 'High-quality 3D animated feature-film style render (Pixar-like)',
    anime: 'Clean modern anime illustration',
    illustration: 'Polished digital illustration, soft shading',
  }[style] || 'Photorealistic studio portrait photograph';
  const d = desc.trim();
  // الإطار ثابت دايمًا (جسم كامل، الوش واضح) عشان الصورة تنفع مرجع
  const frame = 'Full-body standing pose, the entire body visible from head to feet, centred in the frame, front-facing and looking at the camera, arms relaxed at the sides slightly away from the body, the head in the top 15-20% of the image, relaxed neutral expression, the face sharp and clearly visible';
  const bg = mentions(d, BG_WORDS)
    ? 'the background and setting exactly as the description says'
    : 'isolated on a pure clean white studio background with no scenery and nothing else in the frame';
  const props = mentions(d, PROP_WORDS)
    ? 'include the held items and accessories the description mentions, and nothing else'
    : 'no bags, no backpacks, no accessories, no props, no ball or equipment, nothing held in the hands (a profession or sport only suggests the clothing, never a location or equipment)';
  return `${look} of ${subject}: ${d}. ${frame}, ${bg}, ${props}, soft even lighting, high detail, no text, no watermark, no other people.`;
}
