// ── LegalNotice.jsx ── تنبيه بارز (أحمر) أعلى الشروط والخصوصية: التسجيل/الموافقة = إقرار بالقراءة وتحمّل المسؤولية.
// lang: 'ar' | 'en' | 'both' (الصفحات الإنجليزي بس زي نافذة التسجيل بتعرض اللغتين)
const TEXT = {
  ar: {
    label: 'تنبيه هام جداً:',
    body: 'يُرجى قراءة الشروط والأحكام وسياسة الخصوصية بعناية قبل استخدام Erivion. بتسجيلك أو استخدامك للمنصة أو النقر على «أوافق»، فإنك تقر بأنك قرأتهما ووافقت عليهما بالكامل، وتتحمل المسؤولية الكاملة عن المحتوى الذي تنشئه وتنشره وعن استخدامك للفيديوهات الناتجة (بما فيها اللقطات والمواد الخارجية وحقوق النشر). وإذا لم توافق على أي بند، فيتعين عليك الامتناع عن استخدام المنصة فوراً.',
  },
  en: {
    label: 'Very important notice:',
    body: 'Please read these Terms of Service and the Privacy Policy carefully before using Erivion. By registering, using the platform, or clicking "I Agree", you confirm that you have read and fully agree to them, and that you take full responsibility for the content you create and publish and for how you use the resulting videos (including third-party footage, materials and copyright). If you do not agree with any clause, you must stop using the platform immediately.',
  },
};

function Block({ code }) {
  const t = TEXT[code];
  return (
    <p dir={code === 'ar' ? 'rtl' : 'ltr'} style={{ margin: 0, fontSize: 14, lineHeight: 1.95, color: '#f87171', textAlign: code === 'ar' ? 'right' : 'left' }}>
      <strong style={{ color: '#fff' }}>{t.label}</strong> {t.body}
    </p>
  );
}

export default function LegalNotice({ lang = 'both', style }) {
  const codes = lang === 'both' ? ['ar', 'en'] : [lang === 'ar' ? 'ar' : 'en'];
  return (
    <div role="note" style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 18px', margin: '0 0 20px', borderRadius: 10,
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderInlineStart: '4px solid #ef4444', ...style,
    }}>
      {codes.map(c => <Block key={c} code={c} />)}
    </div>
  );
}
