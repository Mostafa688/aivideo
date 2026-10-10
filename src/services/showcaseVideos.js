// ── showcaseVideos.js ── فيديوهات النتائج الحقيقية اللي بنعرضها للزوار (الصفحة الرئيسية، تسجيل الدخول، وشات الايجنت لما العميل يطلب يشوف أمثلة)
// pure JS من غير أي اعتماديات: بيتستورد في الفرونت (Vite) وفي السيرفر بنفس الشكل. عدّل القايمة هنا بس.
const R2 = 'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev';

export const SHOWCASE_VIDEOS = [
  { id: 'ad-1', kind: 'ad', url: `${R2}/rkm6tt6y6xrmt0d13k39g0t488.mp4`, title: { ar: 'إعلان منتج', en: 'Product ad' } },
  { id: 'ad-2', kind: 'ad', url: `${R2}/erivion-video-wan_3.mp4`, title: { ar: 'إعلان بصوت وحركة', en: 'Ad with voice and motion' } },
  { id: 'cinematic-1', kind: 'cinematic', url: `${R2}/561gskfr79rmt0d0wjy9tq1ytc.mp4`, title: { ar: 'فيديو سينمائي', en: 'Cinematic video' } },
  { id: 'comedy-1', kind: 'comedy', url: `${R2}/Nibbles_teleporting_and_posing_20261010092817.mp4`, title: { ar: 'فيديو كوميدي', en: 'Comedy video' } },
];

export const SHOWCASE_KINDS = {
  ad: { ar: 'إعلانات', en: 'Ads' },
  cinematic: { ar: 'سينمائي', en: 'Cinematic' },
  comedy: { ar: 'كوميدي', en: 'Comedy' },
};

/** kind: 'ad' | 'cinematic' | 'comedy' | 'all' */
export const showcaseFor = (kind = 'all') => SHOWCASE_VIDEOS.filter(v => kind === 'all' || v.kind === kind);
