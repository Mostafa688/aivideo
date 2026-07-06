import React, { useState, useEffect } from 'react';

const INSTAPAY_NUMBER = import.meta.env.VITE_INSTAPAY_NUMBER || '01091917832';
const EGP_PER_CREDIT = 0.5;
const SLIDER_MIN = 600;
const SLIDER_MAX = 10000;

// ── الباقات الدولية الثابتة (مرتبطة بمنتجات Gumroad حقيقية — دفعة واحدة) ──
const GUMROAD_PACKAGES = [
  { key: 'credits_starter', name: 'Starter', credits: 600,   usd: 12,  url: 'https://digiwhirl23.gumroad.com/l/ukgdl',  color: '#7c6af7', icon: '🎬' },
  { key: 'credits_creator', name: 'Creator', credits: 1400,  usd: 28,  url: 'https://digiwhirl23.gumroad.com/l/gohhdt', color: '#a855f7', icon: '⭐', popular: true },
  { key: 'credits_studio',  name: 'Studio',  credits: 3000,  usd: 60,  url: 'https://digiwhirl23.gumroad.com/l/dnkam',  color: '#e11d48', icon: '🏆' },
];
const GUMROAD_MORE_PACKAGES = [
  { key: 'credits_team',    name: 'Team',    credits: 6000,  usd: 120, url: 'https://digiwhirl23.gumroad.com/l/vmzubx', color: '#0891b2', icon: '👥' },
  { key: 'credits_agency',  name: 'Agency',  credits: 12000, usd: 240, url: 'https://digiwhirl23.gumroad.com/l/ckvlgo', color: '#f59e0b', icon: '🏢' },
];

// ── جدول تكلفة الكريديت لكل موديل (مرجعي — لعرض "كام فيديو تقدر تعمل") ──
const MODEL_COST_REFERENCE = [
  { name: 'Model 1/2', example: '30s = 5cr · 1min = 10cr' },
  { name: 'Model 3',   example: '30s = 20cr · 1min = 40cr' },
  { name: 'Model 4',   example: '30s = 100cr · 1min = 200cr' },
  { name: 'Model 5 / Ads', example: '15s = 65-75cr · 30s = 130-160cr' },
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
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>💳 شحن {credits.toLocaleString()} كريديت</h3>
            <p style={{ fontSize: 15, color: '#7c6af7', margin: '4px 0 0', fontWeight: 700 }}>{amountEgp.toLocaleString()} جنيه</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22 }}>✕</button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, marginBottom: 18 }}>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 10px' }}>حوّل المبلغ عن طريق InstaPay على الرقم:</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>{INSTAPAY_NUMBER}</span>
            <button onClick={copyNumber} style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.35)', color: '#a99bff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? '✅ اتنسخ' : '📋 نسخ'}</button>
          </div>
        </div>

        <label style={{ display: 'block', fontSize: 13, color: '#d1d5db', fontWeight: 700, marginBottom: 8 }}>ارفع صورة إيصال التحويل:</label>
        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '2px dashed rgba(124,106,247,0.35)', borderRadius: 14, padding: preview ? 8 : 24, cursor: 'pointer', marginBottom: 18, background: 'rgba(124,106,247,0.03)' }}>
          <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          {preview ? (
            <img src={preview} alt="receipt" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 10 }} />
          ) : (
            <>
              <span style={{ fontSize: 28 }}>📎</span>
              <span style={{ fontSize: 13, color: '#9ca3af' }}>دوس هنا لرفع الصورة</span>
            </>
          )}
        </label>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 14 }}>{error}</p>}

        <button onClick={submit} disabled={loading} style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: loading ? 'rgba(124,106,247,0.3)' : 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? '⏳ جاري الإرسال...' : 'إرسال طلب الشحن ✅'}
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
  const [step, setStep] = useState('info');

  const handlePaid = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/credits/intl-request', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ packageKey: pkg.key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStep('pending');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0a0a18', border: `1px solid ${pkg.color}44`, borderRadius: 24, width: '100%', maxWidth: 460, padding: 28 }}>
        {step === 'pending' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>⏳</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Request Submitted!</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
              We'll verify your Gumroad payment and add <strong style={{ color: pkg.color }}>{pkg.credits.toLocaleString()} credits</strong> within <strong style={{ color: '#22c55e' }}>24 hours</strong>.
            </p>
            <button onClick={() => { onClose(); onSuccess(); }} style={{ background: pkg.color, color: '#fff', border: 'none', borderRadius: 12, padding: '13px 36px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Got it! 🚀</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>{pkg.icon} {pkg.name}</h3>
                <p style={{ fontSize: 13, color: pkg.color, margin: '4px 0 0', fontWeight: 700 }}>${pkg.usd} — {pkg.credits.toLocaleString()} credits</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#d1d5db', margin: '0 0 14px' }}>💳 How to purchase:</p>
              {['Click "Pay on Gumroad" below', 'Complete payment with your card', 'Come back here and click "I\'ve Paid"', "We'll verify and add your credits within 24h"].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: `${pkg.color}22`, border: `1px solid ${pkg.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: pkg.color, flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: '#d1d5db' }}>{s}</span>
                </div>
              ))}
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <a href={pkg.url} target="_blank" rel="noreferrer"
              style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 12, background: `linear-gradient(135deg, ${pkg.color}, ${pkg.color}bb)`, color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
              🔗 Pay on Gumroad — ${pkg.usd}
            </a>
            <button onClick={handlePaid} disabled={loading}
              style={{ width: '100%', padding: '13px', borderRadius: 12, border: `1px solid ${pkg.color}44`, background: 'rgba(255,255,255,0.04)', color: pkg.color, fontWeight: 700, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ Submitting...' : "✅ I've Paid — Notify Admin"}
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
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 12 }}>طلبك قيد المراجعة</h2>
        <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 28 }}>هنراجع الإيصال ونضيف الكريديت لحسابك خلال 24 ساعة.</p>
        <button onClick={onSkip} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: 'rgba(124,106,247,0.15)', color: '#a99bff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>الرجوع للموقع</button>
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
  const quickJump = (val) => setSliderCredits(val);

  if (egPending) return <EgPendingScreen onNavigate={onNavigate} onSkip={() => { if (onSkip) onSkip(); }} />;

  // ── شاشة اختيار المنطقة ──
  if (!region) {
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #1a0f3d 0%, #0a0a0f 50%, #000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <style>{`
          @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
          @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
          .region-selector-wrap { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
        `}</style>
        <div className="region-selector-wrap" style={{ maxWidth: 560, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16, animation: 'pulse 2s ease infinite' }}>🌍</div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Where are you from?</h2>
          <p style={{ color: '#9ca3af', fontSize: 15, marginBottom: 40 }}>We'll show you the right pricing for your region.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { setRegion('eg'); if (onRegionSelect) onRegionSelect('eg'); localStorage.setItem('erivion_region', 'eg'); }}
              style={{ flex: '1 1 200px', maxWidth: 240, padding: '32px 24px', borderRadius: 20, background: 'linear-gradient(135deg, #1a1a2e, #0f0f1a)', border: '1px solid rgba(124,106,247,0.3)', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🇪🇬</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>Egyptian</div>
              <div style={{ display: 'inline-block', padding: '4px 14px', background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 999, fontSize: 12, color: '#a5b4fc', fontWeight: 600 }}>Prices in EGP</div>
            </button>
            <button onClick={() => { setRegion('intl'); if (onRegionSelect) onRegionSelect('intl'); localStorage.setItem('erivion_region', 'intl'); }}
              style={{ flex: '1 1 200px', maxWidth: 240, padding: '32px 24px', borderRadius: 20, background: 'linear-gradient(135deg, #0a1a0a, #050f05)', border: '1px solid rgba(34,197,94,0.3)', cursor: 'pointer', textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🌐</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginBottom: 6 }}>International</div>
              <div style={{ display: 'inline-block', padding: '4px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 999, fontSize: 12, color: '#86efac', fontWeight: 600 }}>Prices in USD</div>
            </button>
          </div>
          {onSkip && <button onClick={onSkip} style={{ marginTop: 28, background: 'none', border: 'none', color: '#4b5563', fontSize: 13, cursor: 'pointer' }}>Skip and continue with Free plan</button>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,106,247,0.08) 0%, transparent 60%), #050508', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(32px,5vw,64px) clamp(16px,4vw,24px) 80px', opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <button onClick={() => setRegion(null)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>← Change region</button>
          {onSkip && <button onClick={onSkip} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Skip →</button>}
        </div>

        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 10px' }}>💎 Erivion Credits</h1>
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>كريديت واحد يشتغل على كل الموديلات — يتشحن مرة واحدة وميتجددش أسبوعيًا</p>
          {balance != null && (
            <div style={{ display: 'inline-block', marginTop: 14, padding: '6px 18px', borderRadius: 999, background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.3)', color: '#a99bff', fontSize: 13, fontWeight: 700 }}>
              رصيدك الحالي: {balance.toLocaleString()} كريديت
            </div>
          )}
        </div>

        {/* ══════════════ مصري: سلايدر مرن ══════════════ */}
        {region === 'eg' && (
          <>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(124,106,247,0.25)', borderRadius: 24, padding: 'clamp(24px,4vw,36px)', marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
                {[{ label: 'Starter', val: 600 }, { label: 'Creator', val: 1400 }, { label: 'Studio', val: 3000 }].map(q => (
                  <button key={q.label} onClick={() => quickJump(q.val)}
                    style={{ padding: '8px 18px', borderRadius: 999, border: sliderCredits === q.val ? '1px solid #7c6af7' : '1px solid rgba(255,255,255,0.12)', background: sliderCredits === q.val ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.03)', color: sliderCredits === q.val ? '#a99bff' : '#9ca3af', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {q.label} · {q.val.toLocaleString()}cr
                  </button>
                ))}
              </div>

              <div style={{ textAlign: 'center', marginBottom: 22 }}>
                <div style={{ fontSize: 42, fontWeight: 900, color: '#fff', marginBottom: 4 }}>{sliderCredits.toLocaleString()} <span style={{ fontSize: 18, color: '#7c6af7', fontWeight: 700 }}>كريديت</span></div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{amountEgp.toLocaleString()} جنيه</div>
              </div>

              <input type="range" min={SLIDER_MIN} max={SLIDER_MAX} step={100} value={sliderCredits} onChange={e => setSliderCredits(parseInt(e.target.value, 10))}
                style={{ width: '100%', accentColor: '#7c6af7', height: 8, marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 26 }}>
                <span>{SLIDER_MIN.toLocaleString()}</span>
                <span>{SLIDER_MAX.toLocaleString()}+</span>
              </div>

              <button onClick={() => setEgModalOpen(true)} style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 8px 24px rgba(124,106,247,0.35)' }}>
                اشحن {sliderCredits.toLocaleString()} كريديت — {amountEgp.toLocaleString()} جنيه
              </button>
            </div>
          </>
        )}

        {/* ══════════════ دولي: باقات Gumroad ══════════════ */}
        {region === 'intl' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 18 }}>
              {GUMROAD_PACKAGES.map(pkg => (
                <div key={pkg.key} style={{ position: 'relative', background: 'rgba(255,255,255,0.03)', border: pkg.popular ? `2px solid ${pkg.color}` : '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, textAlign: 'center', transform: pkg.popular ? 'scale(1.03)' : 'none' }}>
                  {pkg.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', borderRadius: 999, background: pkg.color, fontSize: 10, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap' }}>MOST POPULAR</div>}
                  <div style={{ fontSize: 32, marginBottom: 10 }}>{pkg.icon}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{pkg.name}</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: pkg.color, marginBottom: 4 }}>${pkg.usd}</div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 18 }}>{pkg.credits.toLocaleString()} credits</div>
                  <button onClick={() => setIntlModalPkg(pkg)} style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${pkg.color},${pkg.color}bb)`, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Get {pkg.name} →</button>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginBottom: showMore ? 18 : 0 }}>
              <button onClick={() => setShowMore(v => !v)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999, padding: '8px 20px', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {showMore ? '▲ Hide' : '▼ More Plans'}
              </button>
            </div>

            {showMore && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16, marginBottom: 18 }}>
                {GUMROAD_MORE_PACKAGES.map(pkg => (
                  <div key={pkg.key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, textAlign: 'center' }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>{pkg.icon}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginBottom: 6 }}>{pkg.name}</div>
                    <div style={{ fontSize: 28, fontWeight: 900, color: pkg.color, marginBottom: 4 }}>${pkg.usd}</div>
                    <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 18 }}>{pkg.credits.toLocaleString()} credits</div>
                    <button onClick={() => setIntlModalPkg(pkg)} style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${pkg.color},${pkg.color}bb)`, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Get {pkg.name} →</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── جدول مرجعي: كام فيديو تقريبًا ── */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20, marginTop: 8 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', margin: '0 0 12px' }}>💡 تكلفة الكريديت التقريبية لكل موديل:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {MODEL_COST_REFERENCE.map(m => (
              <div key={m.name} style={{ fontSize: 12, color: '#6b7280' }}>
                <strong style={{ color: '#d1d5db' }}>{m.name}:</strong> {m.example}
              </div>
            ))}
          </div>
        </div>
      </div>

      {egModalOpen && (
        <EgPaymentModal credits={sliderCredits} amountEgp={amountEgp} onClose={() => setEgModalOpen(false)}
          onSuccess={() => { setEgModalOpen(false); setEgPending(true); }} />
      )}
      {intlModalPkg && (
        <IntlPaymentModal pkg={intlModalPkg} onClose={() => setIntlModalPkg(null)} onSuccess={() => {}} />
      )}
    </div>
  );
}