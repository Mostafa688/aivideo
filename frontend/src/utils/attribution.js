// مصدر العميل: بنلقط utm_source / utm_medium / utm_campaign من لينك الدخول أول ما الموقع يفتح (قبل أي redirect)
// ونحفظها في المتصفح لحد ما العميل يسجّل حساب، وبعدها بتتبعت مع التسجيل (إيميل أو جوجل)
const KEY = 'erivion_utm';
const clean = (v) => String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.\- ]/g, '').slice(0, 60);

export function captureAttribution() {
  try {
    const p = new URLSearchParams(window.location.search);
    const source = clean(p.get('utm_source') || p.get('source'));
    const medium = clean(p.get('utm_medium'));
    const campaign = clean(p.get('utm_campaign'));
    const prev = readAttribution();
    if (source) {
      // لينك حملة صريح بيكسب على أي حاجة محفوظة قبل كده (ما عدا لينك حملة تاني: الأول هو اللي بيفضل)
      if (!prev || prev.referrer_only) localStorage.setItem(KEY, JSON.stringify({ source, medium, campaign, at: Date.now() }));
      return;
    }
    // من غير utm: لو جاي من موقع تاني (جوجل، فيسبوك…) نسجّل الدومين كمصدر مؤقت
    if (!prev && document.referrer) {
      const host = new URL(document.referrer).hostname.replace(/^www\./, '');
      if (host && host !== window.location.hostname.replace(/^www\./, '')) {
        localStorage.setItem(KEY, JSON.stringify({ source: clean(host), medium: 'referral', campaign: '', referrer_only: true, at: Date.now() }));
      }
    }
  } catch { /* التخزين ممكن يكون مقفول — مش مشكلة */ }
}

export function readAttribution() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && v.source ? v : null;
  } catch { return null; }
}

export function clearAttribution() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** لينك بدء جوجل مع بيانات المصدر (السيرفر بيحطها في الـstate الموقّع) */
export function googleAuthUrl() {
  const a = readAttribution();
  if (!a) return '/api/auth/google';
  const q = new URLSearchParams({ utm_source: a.source, utm_medium: a.medium || '', utm_campaign: a.campaign || '' });
  return `/api/auth/google?${q}`;
}
