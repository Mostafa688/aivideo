import React, { useState, useEffect } from 'react';

const INSTAPAY_NUMBER = import.meta.env.VITE_INSTAPAY_NUMBER || '01091917832';
const EGP_PER_CREDIT = 0.7;
const SLIDER_MIN = 600;
const SLIDER_MAX = 10000;

// ── الباقات الدولية الثابتة (مرتبطة بمنتجات Gumroad حقيقية — دفعة واحدة) ──
const GUMROAD_PACKAGES = [
  { key: 'credits_starter', name: 'Starter', tagline: 'Getting started', credits: 600,   usd: 15,  url: 'https://digiwhirl23.gumroad.com/l/ukgdl',  color: '#7c6af7', icon: '🎬' },
  { key: 'credits_creator', name: 'Creator', tagline: 'For regular creators', credits: 1400,  usd: 35,  url: 'https://digiwhirl23.gumroad.com/l/gohhdt', color: '#a855f7', icon: '⭐', popular: true },
  { key: 'credits_studio',  name: 'Studio',  tagline: 'For heavy usage', credits: 3000,  usd: 84,  url: 'https://digiwhirl23.gumroad.com/l/dnkam',  color: '#e11d48', icon: '🏆' },
];
const GUMROAD_MORE_PACKAGES = [
  { key: 'credits_team',    name: 'Team',    tagline: 'For teams and bulk usage', credits: 6000,  usd: 168, url: 'https://digiwhirl23.gumroad.com/l/vmzubx', color: '#0891b2', icon: '👥' },
  { key: 'credits_agency',  name: 'Agency',  tagline: 'For agencies at scale', credits: 12000, usd: 336, url: 'https://digiwhirl23.gumroad.com/l/ckvlgo', color: '#f59e0b', icon: '🏢' },
];

// ── باقات مصر الثابتة (بنفس سعر الكريديت 0.7 ج.م) — تُعرض كخطط منفصلة زي الدولي ──
const EG_PACKAGES = [
  { key: 'starter', name: 'Starter', tagline: 'للبداية والتجربة', credits: 600,  egp: 420 },
  { key: 'creator', name: 'Creator', tagline: 'لصنّاع المحتوى المنتظمين', credits: 1400, egp: 980, popular: true },
  { key: 'studio',  name: 'Studio',  tagline: 'للاستخدام المكثف', credits: 3000, egp: 2100 },
];

// ── حساب "الرصيد ده يكفي لعمل كام فيديو" — موديل رخيص (2) وموديل مميز (4) كمرجع ──
function videoEquivalents(credits) {
  return {
    model2: Math.floor(credits / 5),   // 30s @ 5cr
    model4: Math.floor(credits / 100), // 30s @ 100cr
  };
}

const FEATURE_LIST = [
  'Access to all 5 AI video models',
  'No watermark on any video',
  'Credits never expire',
  'HD export on every model',
  'Priority email support',
];

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── قائمة مميزات بسيطة تحت أي كارت سعر ────────────────────────────────────
function FeatureList({ color }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '18px 0 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {FEATURE_LIST.map((f, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#9ca3af' }}>
          <span style={{ color, fontSize: 13, flexShrink: 0 }}>✓</span>{f}
        </li>
      ))}
    </ul>
  );
}

// ─── سطرين "يكفي لعمل" لأي كمية كريديت ───────────────────────────────────
function EnoughForLines({ credits, lang = 'en' }) {
  const eq = videoEquivalents(credits);
  const label = lang === 'ar'
    ? { title: `${credits.toLocaleString()} كريديت يكفي لـ:`, m2: `${eq.model2} فيديو (Model 2, 30 ثانية)`, m4: `${eq.model4} فيديو (Model 4, 30 ثانية)` }
    : { title: `${credits.toLocaleString()} credits is enough for:`, m2: `${eq.model2} videos (Model 2, 30s)`, m4: `${eq.model4} videos (Model 4, 30s)` };
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
      <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>{label.title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={{ fontSize: 13, color: '#d1d5db' }}>• {label.m2}</span>
        <span style={{ fontSize: 13, color: '#d1d5db' }}>• {label.m4}</span>
      </div>
    </div>
  );
}

// ─── مودال الدفع المصري (InstaPay + إيصال) ──────────────────────────────────
function EgPaymentModal({ credits, amountEgp, onClose, onSuccess }) {
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScreenshot(file);
    setPreview(URL.createObjectURL(file));
  };

  const copyNumber = () => {
    navigator.clipboard.writeText(INSTAPAY_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submit = async () => {
    if (!screenshot) { setError('من فضلك ارفع صورة إيصال الدفع'); return; }
    setLoading(true); setError('');
    try {
      const base64 = await fileToBase64(screenshot);
      const res = await fetch('/api/auth/credits/eg-request', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ credits, screenshot: base64 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال');
      onSuccess();
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0a0a18', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 24, width: '100%', maxWidth: 460, padding: 28, maxHeight: '90vh', overflowY: 'auto', direction: 'rtl' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>شحن {credits.toLocaleString()} كريديت</h3>
            <p style={{ fontSize: 15, color: '#7c6af7', margin: '4px 0 0', fontWeight: 700 }}>{amountEgp.toLocaleString()} جنيه</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22 }}>✕</button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 10px' }}>حوّل المبلغ عن طريق InstaPay على الرقم:</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>{INSTAPAY_NUMBER}</span>
            <button onClick={copyNumber} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.35)', color: '#a99bff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? 'اتنسخ' : 'نسخ'}</button>
          </div>
        </div>

        <label style={{ display: 'block', fontSize: 13, color: '#d1d5db', fontWeight: 700, marginBottom: 8 }}>ارفع صورة إيصال التحويل:</label>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '2px dashed rgba(124,106,247,0.35)', borderRadius: 14, padding: preview ? 8 : 24, cursor: 'pointer', marginBottom: 18, background: 'rgba(124,106,247,0.03)' }}>
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          {preview ? (
            <img src={preview} alt="receipt" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10 }} />
          ) : (
            <>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>دوس هنا لرفع الصورة</span>
            </>
          )}
        </label>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 14 }}>{error}</p>}

        <button onClick={submit} disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'rgba(124,106,247,0.3)' : '#7c6af7', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'جاري الإرسال...' : 'إرسال طلب الشحن'}
        </button>
        <p style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 12 }}>هيتم مراجعة طلبك وإضافة الكريديت خلال 24 ساعة</p>
      </div>
    </div>
  );
}

// ─── مودال الدفع الدولي (Gumroad) ────────────────────────────────────────────
function IntlPaymentModal({ pkg, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePaid = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/credits/intl-request', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ packageKey: pkg.key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onClose();
      onSuccess();
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0a0a18', border: `1px solid ${pkg.color}44`, borderRadius: 24, width: '100%', maxWidth: 460, padding: 28 }}>
        {(
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>{pkg.icon} {pkg.name}</h3>
                <p style={{ fontSize: 13, color: pkg.color, margin: '4px 0 0', fontWeight: 700 }}>${pkg.usd} — {pkg.credits.toLocaleString()} credits</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#d1d5db', margin: '0 0 14px' }}>How to purchase:</p>
              {['Click "Pay on Gumroad" below', 'Complete payment with your card', 'Come back here and click "I\'ve Paid"', "We'll verify and add your credits within 24h"].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${pkg.color}22`, border: `1px solid ${pkg.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: pkg.color, flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: '#d1d5db' }}>{s}</span>
                </div>
              ))}
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <a href={pkg.url} target="_blank" rel="noreferrer"
              style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 12, background: pkg.color, color: '#fff', fontWeight: 600, fontSize: 14.5, textAlign: 'center', textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
              Pay on Gumroad — ${pkg.usd}
            </a>
            <button onClick={handlePaid} disabled={loading}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: `1px solid ${pkg.color}44`, background: 'rgba(255,255,255,0.04)', color: pkg.color, fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Submitting...' : "I've Paid — Notify Admin"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── شاشة نجاح إرسال الطلب (مصري) ───────────────────────────────────────────
function EgPendingScreen({ onNavigate, onSkip }) {
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #1a0f3d 0%, #0a0a0f 50%, #000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 24, padding: '48px 36px' }}>
        <div style={{ fontSize: 72, marginBottom: 20 }}>⏳</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 12, lineHeight: 1.5 }}>سيقوم فريق Erivion بمراجعة طلب الاشتراك خلال 24 ساعة</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 28 }}>شكرًا لانتظاركم 🙏</p>
        <button onClick={onSkip} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'rgba(124,106,247,0.15)', color: '#a99bff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}>الرجوع للموقع</button>
        <button onClick={() => onNavigate && onNavigate('support')} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#9ca3af', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Contact Support</button>
      </div>
    </div>
  );
}

export default function PricingPage({ onSkip, onNavigate, onRegionSelect }) {
  const [region, setRegion] = useState(null);
  const [visible, setVisible] = useState(false);
  const [sliderCredits, setSliderCredits] = useState(1000);
  const [egModalOpen, setEgModalOpen] = useState(false);
  const [egPending, setEgPending] = useState(false);
  const [intlModalPkg, setIntlModalPkg] = useState(null);
  const [studioSliderCredits, setStudioSliderCredits] = useState(3000);
  const [showMore, setShowMore] = useState(false);
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    const savedRegion = localStorage.getItem('erivion_region');
    if (savedRegion) setRegion(savedRegion);
    fetch('/api/auth/credits/balance', { headers: authHeaders() })
      .then(r => r.json()).then(d => setBalance(d.balance ?? null)).catch(() => {});
  }, []);

  const amountEgp = Math.round(sliderCredits * EGP_PER_CREDIT);

  if (egPending) return <EgPendingScreen onNavigate={onNavigate} onSkip={() => { if (onSkip) onSkip(); }} />;

  // ── شاشة اختيار المنطقة ──
  if (!region) {
    return (
      <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <style>{`
          @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
          .region-selector-wrap { animation: fadeUp 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        `}</style>
        <div className="region-selector-wrap" style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <h2 style={{ fontSize: 26, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>Select your region</h2>
          <p style={{ color: '#8b8b96', fontSize: 14, marginBottom: 36 }}>Pricing and payment method depend on where you are.</p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { setRegion('eg'); if (onRegionSelect) onRegionSelect('eg'); localStorage.setItem('erivion_region', 'eg'); }}
              style={{ flex: '1 1 190px', maxWidth: 220, padding: '28px 20px', borderRadius: 16, background: '#0e0e16', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,106,247,0.5)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>🇪🇬 Egypt</div>
              <div style={{ fontSize: 12, color: '#8b8b96' }}>Prices in EGP · InstaPay</div>
            </button>
            <button onClick={() => { setRegion('intl'); if (onRegionSelect) onRegionSelect('intl'); localStorage.setItem('erivion_region', 'intl'); }}
              style={{ flex: '1 1 190px', maxWidth: 220, padding: '28px 20px', borderRadius: 16, background: '#0e0e16', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(34,197,94,0.5)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>🌐 International</div>
              <div style={{ fontSize: 12, color: '#8b8b96' }}>Prices in USD · Card</div>
            </button>
          </div>
          {onSkip && <button onClick={onSkip} style={{ marginTop: 24, background: 'none', border: 'none', color: '#4b5563', fontSize: 13, cursor: 'pointer' }}>Continue with free plan</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(32px,5vw,56px) clamp(16px,4vw,24px) 80px', opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}>
      <div style={{ width: '100%', maxWidth: 920 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <button onClick={() => setRegion(null)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>← Region</button>
          {onSkip && <button onClick={onSkip} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Skip →</button>}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>Credits</h1>
          <p style={{ color: '#8b8b96', fontSize: 14, margin: 0, maxWidth: 380, marginInline: 'auto', lineHeight: 1.6 }}>
            One credit balance works across every model. Pay once — credits never expire or reset.
          </p>
          {balance != null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 16, padding: '6px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#d1d5db', fontSize: 13 }}>
              Current balance: <strong style={{ color: '#a99bff' }}>{balance.toLocaleString()}</strong>
            </div>
          )}
        </div>

        {/* ══════════════ مصري: 3 خطط كبيرة، آخر واحدة فيها سلايدر مدمج للزيادة ══════════════ */}
        {region === 'eg' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            {EG_PACKAGES.map(pkg => {
              const isLast = pkg.key === 'studio';
              const displayCredits = isLast ? studioSliderCredits : pkg.credits;
              const displayEgp = isLast ? Math.round(studioSliderCredits * EGP_PER_CREDIT) : pkg.egp;
              return (
                <div key={pkg.key} style={{ position: 'relative', background: '#0e0e16', border: pkg.popular ? '1px solid #7c6af7' : '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '30px 26px', display: 'flex', flexDirection: 'column' }}>
                  {pkg.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 999, background: '#7c6af7', fontSize: 10.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>الأكثر طلبًا</div>}
                  <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{pkg.name}</div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 22 }}>{pkg.tagline}</div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{displayEgp.toLocaleString()}</span>
                    <span style={{ fontSize: 14, color: '#9ca3af' }}>ج.م</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 20 }}>دفعة واحدة · لا يتجدد</div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: isLast ? 16 : 22 }}>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>{displayCredits.toLocaleString()} كريديت يكفي لـ:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ fontSize: 13, color: '#d1d5db' }}>• {Math.floor(displayCredits / 5)} فيديو (Model 2, 30 ثانية)</span>
                      <span style={{ fontSize: 13, color: '#d1d5db' }}>• {Math.floor(displayCredits / 100)} فيديو (Model 4, 30 ثانية)</span>
                    </div>
                  </div>

                  {isLast && (
                    <div style={{ marginBottom: 22 }}>
                      <input type="range" min={3000} max={12000} step={100} value={studioSliderCredits} onChange={e => setStudioSliderCredits(parseInt(e.target.value, 10))}
                        style={{ width: '100%', accentColor: '#7c6af7', height: 6, marginBottom: 6 }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#4b5563' }}>
                        <span>3,000</span>
                        <span>12,000+</span>
                      </div>
                    </div>
                  )}

                  <button onClick={() => { setSliderCredits(displayCredits); setEgModalOpen(true); }} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: pkg.popular ? '#7c6af7' : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 24 }}>
                    اشترك في {pkg.name}
                  </button>

                  <FeatureList color={pkg.popular ? '#7c6af7' : '#9ca3af'} />
                </div>
              );
            })}
          </div>
        )}

        {/* ══════════════ دولي: باقات Gumroad — أسعار ثابتة (Gumroad ملوش سعر متغير) ══════════════ */}
        {region === 'intl' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 20 }}>
              {GUMROAD_PACKAGES.map(pkg => (
                <div key={pkg.key} style={{ position: 'relative', background: '#0e0e16', border: pkg.popular ? `1px solid ${pkg.color}` : '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '30px 26px', display: 'flex', flexDirection: 'column' }}>
                  {pkg.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 999, background: pkg.color, fontSize: 10.5, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>MOST POPULAR</div>}
                  <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{pkg.name}</div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 22 }}>{pkg.tagline}</div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 2 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>${pkg.usd}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 20 }}>one-time · never expires</div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: 22 }}>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>{pkg.credits.toLocaleString()} credits is enough for:</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span style={{ fontSize: 13, color: '#d1d5db' }}>• {Math.floor(pkg.credits / 5)} videos (Model 2, 30s)</span>
                      <span style={{ fontSize: 13, color: '#d1d5db' }}>• {Math.floor(pkg.credits / 100)} videos (Model 4, 30s)</span>
                    </div>
                  </div>

                  <button onClick={() => setIntlModalPkg(pkg)} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: pkg.popular ? pkg.color : 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 24 }}>
                    Get {pkg.name}
                  </button>

                  <FeatureList color={pkg.popular ? pkg.color : '#9ca3af'} />
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginBottom: showMore ? 20 : 0 }}>
              <button onClick={() => setShowMore(v => !v)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 999, padding: '8px 20px', color: '#8b8b96', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                {showMore ? 'Hide larger plans' : 'More Plans — Team & Agency'}
              </button>
            </div>

            {showMore && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
                {GUMROAD_MORE_PACKAGES.map(pkg => (
                  <div key={pkg.key} style={{ background: '#0e0e16', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '30px 26px', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{pkg.name}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 22 }}>{pkg.tagline}</div>
                    <div style={{ fontSize: 34, fontWeight: 800, color: '#fff', marginBottom: 2, letterSpacing: '-0.02em' }}>${pkg.usd}</div>
                    <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 20 }}>one-time · never expires</div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px', marginBottom: 22 }}>
                      <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 8px', fontWeight: 600 }}>{pkg.credits.toLocaleString()} credits is enough for:</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{ fontSize: 13, color: '#d1d5db' }}>• {Math.floor(pkg.credits / 5)} videos (Model 2, 30s)</span>
                        <span style={{ fontSize: 13, color: '#d1d5db' }}>• {Math.floor(pkg.credits / 100)} videos (Model 4, 30s)</span>
                      </div>
                    </div>
                    <button onClick={() => setIntlModalPkg(pkg)} style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 24 }}>
                      Get {pkg.name}
                    </button>
                    <FeatureList color="#9ca3af" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {egModalOpen && (
        <EgPaymentModal credits={sliderCredits} amountEgp={amountEgp} onClose={() => setEgModalOpen(false)}
          onSuccess={() => { setEgModalOpen(false); setEgPending(true); }} />
      )}
      {intlModalPkg && (
        <IntlPaymentModal pkg={intlModalPkg} onClose={() => setIntlModalPkg(null)} onSuccess={() => { setIntlModalPkg(null); setEgPending(true); }} />
      )}
    </div>
  );
}