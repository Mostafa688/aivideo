// ✅ نشر فيديوهات على يوتيوب من Erivion مقفول افتراضيًا (قرار أمان: يوتيوب بيقيّد الرفع بالـAPI
// لمشاريع ما عدتش الـAudit، والعميل هو الأأمن يرفع بنفسه). Erivion بتجهّز الفيديو والعنوان
// والوصف والكلمات المفتاحية والصورة المصغرة، والعميل هو اللي يرفعهم. لتشغيله تاني بعد الـAudit:
// YOUTUBE_PUBLISH_ENABLED=true في بيئة التشغيل
export const YOUTUBE_PUBLISH_ENABLED = process.env.YOUTUBE_PUBLISH_ENABLED === 'true';
