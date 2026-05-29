import React, { useState, useEffect } from 'react';

const INSTAPAY_NUMBER = import.meta.env.VITE_INSTAPAY_NUMBER || '01091917832';

// ─── Model 1 & 2 Plans ────────────────────────────────────────────────────
const PLANS = [
  {
    key: 'free',
    name: 'Free',
    icon: '🆓',
    price_monthly: 0,
    price_first_month: null,
    price_yearly: 0,
    color: '#6b7280',
    gradient: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
    border: 'rgba(107,114,128,0.4)',
    popular: false,
    features: [
      { text: '3 videos / week', included: true },
      { text: '30s max duration', included: true },
      { text: 'Captions', included: true },
      { text: 'Music', included: true },
      { text: 'Transitions', included: true },
      { text: 'English & Arabic only', included: true },
      { text: '1,600 credits / week', included: true },
      { text: 'Watermark on videos', included: false, note: 'always' },
      { text: 'Sound Effects', included: false, badge: 'PRO' },
      { text: 'Video Effects', included: false, badge: 'PRO' },
      { text: 'Edit after render', included: false, badge: 'PRO' },
      { text: 'Longer durations', included: false, badge: 'PRO' },
    ],
    credits: '1,600 / week',
    videos: '3 / week',
  },
  {
    key: 'pro',
    name: 'Pro',
    icon: '⚡',
    price_monthly: 80,
    price_first_month: 40,
    price_yearly: 600,
    price_yearly_monthly: 50,
    // TODO: Set international prices
    price_usd_monthly: null,
    price_usd_yearly: null,
    color: '#7c6af7',
    gradient: 'linear-gradient(135deg, #2d1b69 0%, #1a0f3d 100%)',
    border: 'rgba(124,106,247,0.5)',
    popular: true,
    features: [
      { text: '5 videos / week', included: true },
      { text: '2min max duration', included: true },
      { text: 'No watermark', included: true },
      { text: 'Captions', included: true },
      { text: 'Music', included: true },
      { text: 'Transitions', included: true },
      { text: 'Edit after render', included: true },
      { text: 'EN, AR, DE, FR', included: true },
      { text: '10,000 credits / week', included: true },
      { text: 'Sound Effects', included: false, badge: 'PLUS' },
      { text: 'Video Effects', included: false, badge: 'PLUS' },
      { text: 'Longer durations', included: false, badge: 'PLUS' },
    ],
    credits: '10,000 / week',
    videos: '5 / week',
  },
  {
    key: 'plus',
    name: 'Plus',
    icon: '🚀',
    price_monthly: 180,
    price_first_month: 150,
    price_yearly: 1800,
    price_yearly_monthly: 150,
    // TODO: Set international prices
    price_usd_monthly: null,
    price_usd_yearly: null,
    color: '#06b6d4',
    gradient: 'linear-gradient(135deg, #0c3a4a 0%, #061a22 100%)',
    border: 'rgba(6,182,212,0.5)',
    popular: false,
    features: [
      { text: '8 videos / week', included: true },
      { text: '5min max duration', included: true },
      { text: 'No watermark', included: true },
      { text: 'Captions', included: true },
      { text: 'Music', included: true },
      { text: 'Transitions', included: true },
      { text: 'Sound Effects', included: true },
      { text: 'Edit after render', included: true },
      { text: 'All languages', included: true },
      { text: '45,000 credits / week', included: true },
      { text: 'Video Effects', included: false, badge: 'MAX' },
      { text: 'Longer durations', included: false, badge: 'MAX' },
    ],
    credits: '45,000 / week',
    videos: '8 / week',
  },
  {
    key: 'max',
    name: 'Max',
    icon: '👑',
    price_monthly: 400,
    price_first_month: 350,
    price_yearly: 3600,
    price_yearly_monthly: 300,
    // TODO: Set international prices
    price_usd_monthly: null,
    price_usd_yearly: null,
    color: '#f59e0b',
    gradient: 'linear-gradient(135deg, #451a03 0%, #1c0a00 100%)',
    border: 'rgba(245,158,11,0.5)',
    popular: false,
    features: [
      { text: 'Unlimited videos (until credits run out)', included: true },
      { text: '10min max duration', included: true },
      { text: 'No watermark', included: true },
      { text: 'Captions', included: true },
      { text: 'Music', included: true },
      { text: 'Transitions', included: true },
      { text: 'Sound Effects', included: true },
      { text: 'Video Effects', included: true },
      { text: 'Edit after render', included: true },
      { text: 'All languages', included: true },
      { text: '100,000 credits / week', included: true },
    ],
    credits: '100,000 / week',
    videos: 'Unlimited',
  },
];

// ─── Model 3 Plans ────────────────────────────────────────────────────────
const MODEL3_PLANS = [
  {
    key: 'm3_starter',
    name: 'Starter',
    icon: '🚀',
    color: '#f59e0b',
    price_egp: 300,
    // TODO: Set international price
    price_usd: null,
    badge: null,
    features: ['5 × 30s AI videos', '10 × 1min AI videos', 'Cinematic Ken Burns zoom', 'All video styles'],
  },
  {
    key: 'm3_pro',
    name: 'Pro',
    icon: '⚡',
    color: '#7c6af7',
    price_egp: 750,
    // TODO: Set international price
    price_usd: null,
    badge: 'Most Popular',
    features: ['5 × 30s AI videos', '5 × 1min AI videos', '10 × 3min AI videos', 'All video styles'],
  },
  {
    key: 'm3_max',
    name: 'Max',
    icon: '👑',
    color: '#22c55e',
    price_egp: 1400,
    // TODO: Set international price
    price_usd: null,
    badge: null,
    features: ['5 × 1min AI videos', '5 × 3min AI videos', '10 × 5min AI videos', 'All video styles'],
  },
];

// ─── Model 4 Plans ────────────────────────────────────────────────────────
const MODEL4_PLANS_LIST = [
  {
    key: 'm4_plan1',
    name: 'Starter',
    icon: '🎬',
    color: '#a855f7',
    price_egp: 450,
    // TODO: Set international price
    price_usd: null,
    badge: null,
    features: ['10 × 30s AI videos', '1 × 1min AI video', 'Seedance v1 Pro', 'Captions + Music'],
  },
  {
    key: 'm4_plan2',
    name: 'Creator',
    icon: '🎥',
    color: '#a855f7',
    price_egp: 800,
    // TODO: Set international price
    price_usd: null,
    badge: 'Most Popular',
    features: ['3 × 30s AI videos', '10 × 1min AI videos', 'Seedance v1 Pro', 'Captions + Music'],
  },
  {
    key: 'm4_plan3',
    name: 'Pro',
    icon: '🏆',
    color: '#a855f7',
    price_egp: 2250,
    // TODO: Set international price
    price_usd: null,
    badge: 'Best Value',
    features: ['3 × 30s AI videos', '3 × 1min AI videos', '10 × 3min AI videos', 'Seedance v1 Pro'],
  },
];


// ─── Model 5 Cinematic Plans ──────────────────────────────────────────────
const MC_PLANS_LIST = [
  {
    key: 'mc_starter',
    name: 'Starter',
    icon: '🎭',
    color: '#e11d48',
    price_egp: 400,
    price_usd: null,
    badge: null,
    features: ['5 × 15s cinematic videos', 'Up to 5 characters', 'Seedance 2.0 Fast', 'Original audio'],
  },
  {
    key: 'mc_pro',
    name: 'Pro',
    icon: '🎥',
    color: '#e11d48',
    price_egp: 750,
    price_usd: null,
    badge: 'Most Popular',
    features: ['5 × 30s cinematic videos', 'Up to 5 characters', 'Seedance 2.0 Fast', 'Original audio'],
  },
  {
    key: 'mc_max',
    name: 'Max',
    icon: '🏆',
    color: '#e11d48',
    price_egp: 1500,
    price_usd: null,
    badge: null,
    features: ['5 × 1min cinematic videos', 'Up to 5 characters', 'Seedance 2.0 Fast', 'Original audio'],
  },
];

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + localStorage.getItem('token'),
  };
}

// ─── Gumroad Links ────────────────────────────────────────────────────────
const GUMROAD_LINKS = {
  pro:        'https://digiwhirl23.gumroad.com/l/sesmk',
  plus:       'https://digiwhirl23.gumroad.com/l/skpwha',
  max:        'https://digiwhirl23.gumroad.com/l/kmiguq',
  m3_starter: 'https://digiwhirl23.gumroad.com/l/osibu',
  m3_pro:     'https://digiwhirl23.gumroad.com/l/zfdge',
  m3_max:     'https://digiwhirl23.gumroad.com/l/fgydww',
  m4_plan1:   'https://digiwhirl23.gumroad.com/l/hqsejc',
  m4_plan2:   'https://digiwhirl23.gumroad.com/l/ckvlgo',
  m4_plan3:   'https://digiwhirl23.gumroad.com/l/vmzubx',
  mc_starter: 'https://digiwhirl23.gumroad.com/l/dnkam',
  mc_pro:     'https://digiwhirl23.gumroad.com/l/gohhdt',
  mc_max:     'https://digiwhirl23.gumroad.com/l/ukgdl',
};

const USD_PRICES = {
  pro:        { monthly: 6,  yearly: 45  },
  plus:       { monthly: 13, yearly: 130 },
  max:        { monthly: 28, yearly: 270 },
  m3_starter: 12, m3_pro: 20, m3_max: 32,
  m4_plan1:   15, m4_plan2: 25, m4_plan3: 55,
  mc_starter: 20, mc_pro: 35, mc_max: 65,
};

// ─── International Gumroad Modal ──────────────────────────────────────────
function IntlPaymentModal({ planKey, planName, planIcon, planColor, usdPrice, gumroadUrl, onClose }) {
  const [step, setStep] = React.useState('info');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handlePaid = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/intl-payment/request', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ planKey, planName, usdPrice }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setStep('pending');
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:4000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#0a0a18', border:`1px solid ${planColor}44`, borderRadius:24, width:'100%', maxWidth:460, padding:28, animation:'intlFadeIn 0.3s ease' }}>
        <style>{`@keyframes intlFadeIn { from{opacity:0;transform:translateY(-12px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }`}</style>
        {step === 'pending' ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>⏳</div>
            <h3 style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:12 }}>Request Submitted!</h3>
            <p style={{ color:'#9ca3af', fontSize:14, lineHeight:1.8, marginBottom:8 }}>
              We'll verify your Gumroad payment and activate your <strong style={{ color: planColor }}>{planName}</strong> plan within <strong style={{ color:'#22c55e' }}>24 hours</strong>.
            </p>
            <p style={{ color:'#6b7280', fontSize:12, marginBottom:24 }}>You'll receive a confirmation email once approved.</p>
            <button onClick={onClose} style={{ background: planColor, color:'#fff', border:'none', borderRadius:12, padding:'13px 36px', fontWeight:700, fontSize:15, cursor:'pointer' }}>Got it! 🚀</button>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div>
                <h3 style={{ fontSize:18, fontWeight:800, color:'#fff', margin:0 }}>{planIcon} {planName}</h3>
                <p style={{ fontSize:13, color: planColor, margin:'4px 0 0', fontWeight:700 }}>${usdPrice}</p>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:22 }}>✕</button>
            </div>
            <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:18, marginBottom:20 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#d1d5db', margin:'0 0 14px' }}>💳 How to subscribe:</p>
              {['Click "Pay on Gumroad" below','Complete payment with your card',"Come back here and click \"I've Paid\"",'We\'ll verify and activate within 24h'].map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:`${planColor}22`, border:`1px solid ${planColor}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color: planColor, flexShrink:0 }}>{i+1}</div>
                  <span style={{ fontSize:13, color:'#d1d5db' }}>{s}</span>
                </div>
              ))}
            </div>
            {error && <p style={{ color:'#ef4444', fontSize:13, marginBottom:12 }}>{error}</p>}
            <a href={gumroadUrl} target="_blank" rel="noreferrer"
              style={{ display:'block', width:'100%', padding:'14px', borderRadius:12, background:`linear-gradient(135deg, ${planColor}, ${planColor}bb)`, color:'#fff', fontWeight:700, fontSize:15, textAlign:'center', textDecoration:'none', marginBottom:10, boxSizing:'border-box' }}>
              🔗 Pay on Gumroad — ${usdPrice}
            </a>
            <button onClick={handlePaid} disabled={loading}
              style={{ width:'100%', padding:'13px', borderRadius:12, border:`1px solid ${planColor}44`, background:'rgba(255,255,255,0.04)', color: planColor, fontWeight:700, fontSize:14, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ Submitting...' : "✅ I've Paid — Notify Admin"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}


// ─── InstaPay Modal (Model 1 & 2) ─────────────────────────────────────────
function PaymentModal({ plan, billing, onClose, onSuccess }) {
  const [step, setStep] = useState('info');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const amount = billing === 'yearly' ? plan.price_yearly : (plan.price_first_month || plan.price_monthly);
  const isFirstMonth = billing === 'monthly' && plan.price_first_month;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setScreenshot(ev.target.result); setScreenshotPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!screenshot) { setError('Please upload payment screenshot'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/payment/request', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ plan: plan.key, billing, amount, screenshot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: '#0f0f1a', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 20, padding: 32, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}>
        {step === 'pending' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>⏳</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Request Submitted!</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Your payment screenshot has been sent for review. We'll activate your <strong style={{ color: plan.color }}>{plan.name}</strong> plan within a few hours.
            </p>
            <button onClick={onClose} style={{ background: plan.color, color: '#fff', border: 'none', padding: '12px 32px', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>Got it!</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{plan.icon} Upgrade to {plan.name}</h3>
                <p style={{ fontSize: 13, color: '#9ca3af' }}>
                  {billing === 'yearly' ? 'Yearly' : 'Monthly'} · {amount} EGP
                  {isFirstMonth && <span style={{ color: '#22c55e', marginLeft: 6 }}>🎉 First month offer!</span>}
                </p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
            <div style={{ background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#7c6af7', marginBottom: 12 }}>📱 Payment Instructions</p>
              <ol style={{ color: '#d1d5db', fontSize: 13, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
                <li>Open <strong style={{ color: '#fff' }}>InstaPay</strong> app</li>
                <li>Send <strong style={{ color: '#22c55e', fontSize: 15 }}>{amount} EGP</strong> to:</li>
              </ol>
              <div style={{ background: '#1a1a2e', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 10, padding: '12px 16px', margin: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 18, color: '#fff', letterSpacing: 1 }}>{INSTAPAY_NUMBER}</span>
                <button onClick={() => navigator.clipboard?.writeText(INSTAPAY_NUMBER)} style={{ background: 'rgba(124,106,247,0.2)', border: '1px solid rgba(124,106,247,0.3)', color: '#7c6af7', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Copy</button>
              </div>
              <ol start={3} style={{ color: '#d1d5db', fontSize: 13, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
                <li>Take a screenshot of the transfer confirmation</li>
                <li>Upload it below ⬇️</li>
              </ol>
            </div>
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#9ca3af', marginBottom: 10 }}>📎 Upload payment screenshot</p>
              <label style={{ display: 'block', border: '2px dashed rgba(124,106,247,0.3)', borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer', background: screenshotPreview ? 'transparent' : 'rgba(124,106,247,0.04)' }}>
                {screenshotPreview ? (
                  <img src={screenshotPreview} alt="screenshot" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'contain' }} />
                ) : (
                  <>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                    <p style={{ color: '#7c6af7', fontSize: 13, fontWeight: 600 }}>Click to upload screenshot</p>
                    <p style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>JPG, PNG supported</p>
                  </>
                )}
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              </label>
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading || !screenshot}
              style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: loading || !screenshot ? '#374151' : plan.color, color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading || !screenshot ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ Submitting...' : '✅ Submit Payment Request'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Model 3 Payment Modal ────────────────────────────────────────────────
function Model3PaymentModal({ plan, onClose }) {
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const amount = plan.price_egp_offer || plan.price_egp;

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setScreenshot(ev.target.result); setPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Please enter your email'); return; }
    if (!screenshot) { setError('Please upload your transfer screenshot'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/auth/model3-payment', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ plan: plan.key, planName: plan.name, amount, userEmail: email, screenshot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setDone(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#0a0a12', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>⏳</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Request Received!</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>We'll review your transfer and activate your Model 3 plan within a few hours.</p>
            <button onClick={onClose} style={{ padding: '12px 32px', borderRadius: 10, background: '#f59e0b', color: '#000', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>Got it!</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: 0 }}>{plan.icon} Model 3 — {plan.name}</h3>
                <p style={{ fontSize: 13, color: plan.color, margin: '4px 0 0', fontWeight: 700 }}>{amount} EGP/month</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', margin: '0 0 12px' }}>💳 Payment Steps</p>
              {['Open InstaPay app', `Transfer ${amount} EGP to:`, 'Take a screenshot', 'Upload it below ⬇️'].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#f59e0b', flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 12, color: '#d1d5db' }}>{s}</span>
                </div>
              ))}
              <div style={{ margin: '12px 0 0', padding: '10px 14px', background: '#1a1a2e', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{INSTAPAY_NUMBER}</span>
                <button onClick={() => { navigator.clipboard?.writeText(INSTAPAY_NUMBER); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  style={{ padding: '5px 12px', borderRadius: 6, background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)', border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`, color: copied ? '#22c55e' : '#f59e0b', cursor: 'pointer', fontSize: 11 }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>📧 Your email</p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@gmail.com"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: '#111120', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <p style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>📎 Transfer screenshot</p>
              <label style={{ display: 'block', border: '2px dashed rgba(245,158,11,0.3)', borderRadius: 10, padding: 16, textAlign: 'center', cursor: 'pointer', background: 'rgba(245,158,11,0.03)' }}>
                {preview ? <img src={preview} alt="ss" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 6, objectFit: 'contain' }} />
                  : <><div style={{ fontSize: 28, marginBottom: 6 }}>📷</div><p style={{ color: '#f59e0b', fontSize: 12, margin: 0 }}>Click to upload screenshot</p></>}
                <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
              </label>
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading || !screenshot || !email}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: loading || !screenshot || !email ? '#374151' : plan.color, color: loading || !screenshot || !email ? '#6b7280' : '#000', fontWeight: 700, fontSize: 14, cursor: loading || !screenshot || !email ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ Submitting...' : '✅ Submit Subscription Request'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Model 4 Payment Modal ────────────────────────────────────────────────

// ─── InstaPay Modal (Model 5 Cinematic) ──────────────────────────────────
function MCPaymentModal({ plan, onClose }) {
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = React.useRef();
  const INSTAPAY = '01091917832';

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setScreenshot(ev.target.result); setPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!email || !screenshot) { setError('Please fill all fields'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/model5/payment-request', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ plan: plan.key, planName: plan.name, amount: plan.price_egp, userEmail: email, screenshot }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setDone(true);
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#0a0208', border:'1px solid rgba(225,29,72,0.3)', borderRadius:24, width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
        {done ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>🎬</div>
            <h3 style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:12 }}>Request Submitted!</h3>
            <p style={{ color:'#9ca3af', fontSize:14, lineHeight:1.8, marginBottom:24 }}>We'll activate your Cinematic plan within a few hours.</p>
            <button onClick={onClose} style={{ background:'linear-gradient(135deg,#e11d48,#9f1239)', color:'#fff', border:'none', borderRadius:12, padding:'13px 36px', fontWeight:700, fontSize:15, cursor:'pointer' }}>Got it! 🚀</button>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div>
                <h2 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:0 }}>🎭 Cinematic {plan.name}</h2>
                <p style={{ fontSize:13, color:'#fb7185', margin:'4px 0 0', fontWeight:700 }}>{plan.price_egp} EGP</p>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:22 }}>✕</button>
            </div>
            <div style={{ background:'rgba(225,29,72,0.06)', border:'1px solid rgba(225,29,72,0.2)', borderRadius:14, padding:18, marginBottom:18 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#fb7185', margin:'0 0 12px' }}>💳 خطوات الدفع</p>
              {['افتح تطبيق InstaPay', `حول ${plan.price_egp} جنيه على الرقم:`, 'خد screenshot للتحويل', 'ارفعه هنا تحت ⬇️'].map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(225,29,72,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fb7185', flexShrink:0 }}>{i+1}</div>
                  <span style={{ fontSize:13, color:'#d1d5db' }}>{s}</span>
                </div>
              ))}
              <div style={{ margin:'14px 0 0', padding:'12px 16px', background:'rgba(0,0,0,0.4)', border:'1px solid rgba(225,29,72,0.3)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:1 }}>{INSTAPAY}</span>
                <button onClick={()=>{ navigator.clipboard?.writeText(INSTAPAY); setCopied(true); setTimeout(()=>setCopied(false),2000); }} style={{ padding:'6px 14px', borderRadius:8, background:copied?'rgba(34,197,94,0.2)':'rgba(225,29,72,0.2)', border:`1px solid ${copied?'rgba(34,197,94,0.4)':'rgba(225,29,72,0.4)'}`, color:copied?'#22c55e':'#fb7185', cursor:'pointer', fontSize:12, fontWeight:600 }}>
                  {copied?'✓ تم النسخ':'نسخ'}
                </button>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
              <input type="email" placeholder="إيميلك *" value={email} onChange={e=>setEmail(e.target.value)} style={{ padding:'12px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit' }} />
              <div onClick={()=>fileRef.current?.click()} style={{ border:`2px dashed ${preview?'#22c55e':'rgba(225,29,72,0.3)'}`, borderRadius:12, padding:24, textAlign:'center', cursor:'pointer' }}>
                {preview?<img src={preview} alt="receipt" style={{ maxHeight:120, borderRadius:8, maxWidth:'100%' }} />:<><div style={{ fontSize:32, marginBottom:8 }}>📎</div><p style={{ color:'#6b7280', fontSize:13, margin:0 }}>اضغط لرفع صورة التحويل</p></>}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display:'none' }} />
              </div>
            </div>
            {error && <p style={{ color:'#ef4444', fontSize:13, marginBottom:12 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading||!screenshot||!email} style={{ width:'100%', background:loading||!screenshot||!email?'rgba(255,255,255,0.05)':'linear-gradient(135deg,#e11d48,#9f1239)', color:loading||!screenshot||!email?'#4b5563':'#fff', border:'none', borderRadius:12, padding:'14px', fontWeight:700, fontSize:15, cursor:loading||!screenshot||!email?'not-allowed':'pointer' }}>
              {loading?'⏳ جاري الإرسال...':'✅ إرسال طلب الاشتراك'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Model4PaymentModal({ plan, onClose }) {
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const amount = plan.price_egp_offer || plan.price_egp;

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setScreenshot(ev.target.result); setPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!email.trim()) { setError('Please enter your email'); return; }
    if (!screenshot) { setError('Please upload your transfer screenshot'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/model4/payment-request', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ plan: plan.key, planName: plan.name, amount, userEmail: email, screenshot }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setDone(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#0d0d1a', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>Request Submitted!</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>We'll review your payment and activate your Model 4 plan within a few hours.</p>
            <button onClick={onClose} style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Got it!</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: 0 }}>{plan.icon} Model 4 — {plan.name}</h3>
                <p style={{ fontSize: 13, color: '#a855f7', margin: '4px 0 0', fontWeight: 700 }}>{amount} EGP</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14, padding: 18, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', margin: '0 0 12px' }}>💳 Payment Steps</p>
              {['Open InstaPay app', `Transfer ${amount} EGP to:`, 'Screenshot the transfer', 'Upload below ⬇️'].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#c084fc', flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: '#d1d5db' }}>{s}</span>
                </div>
              ))}
              <div style={{ margin: '12px 0 0', padding: '12px 16px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>{INSTAPAY_NUMBER}</span>
                <button onClick={() => { navigator.clipboard?.writeText(INSTAPAY_NUMBER); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  style={{ padding: '6px 14px', borderRadius: 8, background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(168,85,247,0.2)', border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(168,85,247,0.4)'}`, color: copied ? '#22c55e' : '#c084fc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <input type="email" placeholder="Your email address *" value={email} onChange={e => setEmail(e.target.value)}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
              <label style={{ border: `2px dashed ${preview ? '#22c55e' : 'rgba(168,85,247,0.3)'}`, borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer', display: 'block' }}>
                {preview ? <img src={preview} alt="receipt" style={{ maxHeight: 120, borderRadius: 8, maxWidth: '100%' }} />
                  : <><div style={{ fontSize: 32, marginBottom: 8 }}>📎</div><p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Click to upload transfer screenshot</p></>}
                <input type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
              </label>
            </div>
            {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading || !screenshot || !email}
              style={{ width: '100%', background: loading || !screenshot || !email ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #a855f7, #7c3aed)', color: loading || !screenshot || !email ? '#4b5563' : '#fff', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 700, fontSize: 15, cursor: loading || !screenshot || !email ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ Submitting...' : '✅ Submit Payment Request'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── SEO Structured Data ──────────────────────────────────────────────────
function PricingSEO() {
  useEffect(() => {
    // Update URL to /pricing for SEO without full reload
    if (window.location.pathname !== '/pricing') {
      window.history.pushState({}, '', '/pricing');
    }

    // Inject structured data
    const existingScript = document.getElementById('pricing-structured-data');
    if (existingScript) existingScript.remove();

    const allOffers = [
      ...PLANS.filter(p => p.key !== 'free').map(p => ({
        '@type': 'Offer',
        name: `Erivion ${p.name} Plan`,
        price: p.price_monthly,
        priceCurrency: 'EGP',
        description: `${p.videos} videos, ${p.credits} credits`,
      })),
      ...MODEL3_PLANS.map(p => ({
        '@type': 'Offer',
        name: `Erivion Model 3 ${p.name}`,
        price: p.price_egp,
        priceCurrency: 'EGP',
        description: p.features.join(', '),
      })),
      ...MODEL4_PLANS_LIST.map(p => ({
        '@type': 'Offer',
        name: `Erivion Model 4 ${p.name}`,
        price: p.price_egp,
        priceCurrency: 'EGP',
        description: p.features.join(', '),
      })),
    ];

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Erivion AI Video Generator',
      description: 'AI-powered video generation platform — the first Arabic alternative to InVideo. Create professional videos with AI images, stock footage, and real AI-generated video clips.',
      url: 'https://erivion.net/pricing',
      brand: { '@type': 'Brand', name: 'Erivion' },
      offers: allOffers,
    };

    const script = document.createElement('script');
    script.id = 'pricing-structured-data';
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(structuredData);
    document.head.appendChild(script);

    // Update meta tags
    document.title = 'Erivion Pricing — AI Video Generator Plans | Start Free';
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) { metaDesc = document.createElement('meta'); metaDesc.name = 'description'; document.head.appendChild(metaDesc); }
    metaDesc.content = 'Choose your Erivion plan. Free, Pro, Plus, and Max plans for AI video generation. Also AI image videos (Model 3) and real AI video clips (Model 4 — Seedance). Starting from 0 EGP.';

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.appendChild(canonical); }
    canonical.href = 'https://erivion.net/pricing';

    return () => {
      // Restore when leaving pricing page
      const s = document.getElementById('pricing-structured-data');
      if (s) s.remove();
      window.history.pushState({}, '', '/');
      document.title = 'Erivion — AI Video Generator';
    };
  }, []);

  return null;
}

// ─── Main PricingPage ─────────────────────────────────────────────────────
export default function PricingPage({ currentPlan = 'free', onSelectPlan, onSkip, onNavigate, onRegionSelect }) {
  const [billing, setBilling] = useState('monthly');
  const [activeTab, setActiveTab] = useState('main'); // 'main' | 'more'
  const [selectedPlan, setSelectedPlan] = useState(null);       // M1/M2
  const [selectedM3Plan, setSelectedM3Plan] = useState(null);   // M3
  const [selectedM4Plan, setSelectedM4Plan] = useState(null);
  const [selectedMCPlan, setSelectedMCPlan] = useState(null);   // M4
  const [visible, setVisible] = useState(false);
  const [hoveredPlan, setHoveredPlan] = useState(null);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [region, setRegion] = useState(null); // null | 'eg' | 'intl'
  const [intlModal, setIntlModal] = useState(null); // { planKey, planName, planIcon, planColor, usdPrice, gumroadUrl }

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    const savedRegion = localStorage.getItem('erivion_region');
    if (savedRegion) setRegion(savedRegion);
  }, []);

  useEffect(() => {
    if (currentPlan !== 'free') { setPendingRequest(null); return; }
    let ignore = false;
    fetch('/api/auth/payment/status', { headers: authHeaders() })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || ignore) return;
        setPendingRequest(data.request?.status === 'pending' ? data.request : null);
      })
      .catch(() => { if (!ignore) setPendingRequest(null); });
    return () => { ignore = true; };
  }, [currentPlan]);

  const openPlan = (planKey, planName, planIcon, planColor, usdPrice) => {
    const url = GUMROAD_LINKS[planKey];
    if (region === 'intl') {
      if (!url) { alert("International payment coming soon for this plan!"); return; }
      setIntlModal({ planKey, planName, planIcon, planColor, usdPrice, gumroadUrl: url });
    } else {
      // handled by existing setSelected* pattern
    }
  };

  const handleSelect = (plan) => {
    if (plan.key === 'free') { onSelectPlan('free'); return; }
    setSelectedPlan(plan);
  };

  const getPrice = (plan) => {
    if (plan.key === 'free') return 'Free';
    if (region === 'intl') {
      const usd = USD_PRICES[plan.key];
      if (usd) return '$' + (billing === 'yearly' ? usd.yearly + '/yr' : usd.monthly + '/mo');
    }
    if (billing === 'yearly') return plan.price_yearly_monthly + ' EGP/mo';
    return plan.price_monthly + ' EGP/mo';
  };

  const getOffer = (plan) => {
    if (region === 'intl') return null;
    if (plan.key === 'free' || billing === 'yearly') return null;
    if (plan.price_first_month) return `First month: ${plan.price_first_month} EGP 🎉`;
    return null;
  };

  // ── Pending payment screen ──
  if (pendingRequest) {
    const sp = PLANS.find(p => p.key === pendingRequest.plan);
    return (
      <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #1a0f3d 0%, #0a0a0f 50%, #000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
        <PricingSEO />
        <div style={{ maxWidth: 520, width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 24, padding: '48px 36px' }}>
          <div style={{ fontSize: 72, marginBottom: 20 }}>⏳</div>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Payment Under Review</h2>
          <p style={{ color: '#9ca3af', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
            Your payment request for the <strong style={{ color: sp ? sp.color : '#7c6af7' }}>{sp ? sp.name : pendingRequest.plan}</strong> plan has been received. Our team will review and activate within <strong style={{ color: '#22c55e' }}>24 hours</strong>.
          </p>
          <button onClick={() => { if (onNavigate) onNavigate('support'); }} style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(124,106,247,0.3)', background: 'rgba(124,106,247,0.1)', color: '#7c6af7', fontWeight: 600, fontSize: 14, cursor: 'pointer', marginBottom: 12 }}>Contact Support</button>
          <button onClick={() => { if (onSkip) onSkip(); }} style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: 'transparent', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Return to Dashboard</button>
        </div>
      </div>
    );
  }

  // ── Region selector screen ──
  if (!region) {
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, #1a0f3d 0%, #0a0a0f 50%, #000 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
        <style>{`
          @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
          @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
          .region-selector-wrap { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) both; }
          @media(max-width:600px) {
            .region-cards { flex-direction: row !important; flex-wrap: nowrap !important; }
            .region-card { flex: 1 1 0 !important; min-width: 0 !important; max-width: none !important; padding: 20px 12px !important; }
          }
        `}</style>
        <PricingSEO />
        <div className="region-selector-wrap" style={{ maxWidth:560, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:52, marginBottom:16, animation:'pulse 2s ease infinite' }}>🌍</div>
          <h2 style={{ fontSize:28, fontWeight:800, color:'#fff', marginBottom:8 }}>Where are you from?</h2>
          <p style={{ color:'#9ca3af', fontSize:15, marginBottom:40 }}>We'll show you the right pricing for your region.</p>
          <div className="region-cards" style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap' }}>
            <button className="region-card" onClick={() => { setRegion('eg'); if(onRegionSelect) onRegionSelect('eg'); localStorage.setItem('erivion_region','eg'); }}
              style={{
                flex:'1 1 200px', maxWidth:240, padding:'32px 24px', borderRadius:20,
                background:'linear-gradient(135deg, #1a1a2e, #0f0f1a)',
                border:'1px solid rgba(124,106,247,0.3)',
                cursor:'pointer', textAlign:'center',
                transition:'all 0.3s cubic-bezier(0.16,1,0.3,1)',
              }}
              onMouseEnter={e => { e.currentTarget.style.border='1px solid rgba(124,106,247,0.8)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 20px 40px rgba(124,106,247,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.border='1px solid rgba(124,106,247,0.3)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🇪🇬</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:6 }}>Egyptian</div>

              <div style={{ display:'inline-block', padding:'4px 14px', background:'rgba(124,106,247,0.15)', border:'1px solid rgba(124,106,247,0.3)', borderRadius:999, fontSize:12, color:'#a5b4fc', fontWeight:600 }}>Prices in EGP</div>
            </button>
            <button className="region-card" onClick={() => { setRegion('intl'); if(onRegionSelect) onRegionSelect('intl'); localStorage.setItem('erivion_region','intl'); }}
              style={{
                flex:'1 1 200px', maxWidth:240, padding:'32px 24px', borderRadius:20,
                background:'linear-gradient(135deg, #0a1a0a, #050f05)',
                border:'1px solid rgba(34,197,94,0.3)',
                cursor:'pointer', textAlign:'center',
                transition:'all 0.3s cubic-bezier(0.16,1,0.3,1)',
              }}
              onMouseEnter={e => { e.currentTarget.style.border='1px solid rgba(34,197,94,0.8)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 20px 40px rgba(34,197,94,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.border='1px solid rgba(34,197,94,0.3)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🌐</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:6 }}>International</div>

              <div style={{ display:'inline-block', padding:'4px 14px', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:999, fontSize:12, color:'#86efac', fontWeight:600 }}>Prices in USD</div>
            </button>
          </div>
          {onSkip && (
            <button onClick={onSkip} style={{ marginTop:28, background:'none', border:'none', color:'#4b5563', fontSize:13, cursor:'pointer' }}>Skip and continue with Free plan</button>
          )}
        </div>
      </div>
    );
  }


  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #1a0f3d 0%, #0a0a0f 55%, #000 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 'clamp(32px,5vw,56px) clamp(16px,4vw,24px) 80px',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(30px)',
      transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <style>{`
        @keyframes gradShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes glow{0%,100%{opacity:0.5}50%{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .pc-card{transition:transform 0.3s cubic-bezier(0.16,1,0.3,1),box-shadow 0.3s ease,border-color 0.2s ease!important}
        .pc-card:hover{transform:translateY(-8px)!important}
        .pc-popular{transform:scale(1.03)!important}
        .pc-popular:hover{transform:scale(1.03) translateY(-6px)!important}
        .pc-btn{transition:all 0.2s ease!important}
        .pc-btn:hover{opacity:0.9!important;transform:scale(1.02)!important}
      `}</style>
      <PricingSEO />

      {onSkip && (
        <div style={{ width: '100%', maxWidth: 1100, display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
          <button onClick={onSkip} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 18px', color: '#d1d5db', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Skip and continue with Free plan
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign:'center', marginBottom:40, animation:'fadeUp 0.5s ease' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:18, flexWrap:'wrap' }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', background:'rgba(124,106,247,0.1)', border:'1px solid rgba(124,106,247,0.25)', borderRadius:999, fontSize:11, color:'#a78bfa', fontWeight:700, letterSpacing:'0.1em' }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#22c55e', display:'inline-block', boxShadow:'0 0 8px #22c55e', animation:'glow 2s ease infinite' }} />
            CHOOSE YOUR PLAN
          </div>
          <button onClick={() => setRegion(null)}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', background:region==='eg'?'rgba(124,106,247,0.08)':'rgba(34,197,94,0.08)', border:region==='eg'?'1px solid rgba(124,106,247,0.25)':'1px solid rgba(34,197,94,0.25)', borderRadius:999, fontSize:12, color:region==='eg'?'#a5b4fc':'#86efac', fontWeight:600, cursor:'pointer' }}>
            {region==='eg'?'🇪🇬 Egypt — EGP':'🌐 International — USD'} <span style={{ opacity:0.5, fontSize:10 }}>↩ Change</span>
          </button>
        </div>
        <h1 style={{ fontSize:'clamp(28px,5vw,52px)', fontWeight:800, color:'#fff', marginBottom:12, lineHeight:1.1, letterSpacing:'-1px' }}>
          Simple, transparent{' '}
          <span style={{ background:'linear-gradient(135deg,#7c6af7,#a78bfa,#06b6d4)', backgroundSize:'200% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradShift 4s ease infinite' }}>pricing</span>
        </h1>
        <p style={{ color:'rgba(255,255,255,0.4)', fontSize:16, maxWidth:480, margin:'0 auto', lineHeight:1.7 }}>
          Pick the plan that fits your creative output. Change anytime.
        </p>
      </div>

      {/* Tab Switcher */}
      <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:4, marginBottom:36 }}>
        {[
          { key:'main', label:'Video Plans', icon:'🎬', badge:null },
          { key:'more', label:'AI Models', icon:'✨', badge:'NEW' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding:'11px 28px', borderRadius:12, border:'none', cursor:'pointer', fontWeight:700, fontSize:14, transition:'all 0.2s', background:activeTab===tab.key?'linear-gradient(135deg,#7c6af7,#6d28d9)':'transparent', color:activeTab===tab.key?'#fff':'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', gap:8, boxShadow:activeTab===tab.key?'0 4px 16px rgba(124,106,247,0.35)':'none' }}>
            {tab.icon} {tab.label}
            {tab.badge && <span style={{ background:'rgba(245,158,11,0.2)', border:'1px solid rgba(245,158,11,0.35)', color:'#f59e0b', fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:999 }}>{tab.badge}</span>}
          </button>
        ))}
      </div>

      {/* ── TAB: Main Plans (Model 1 & 2) ── */}
      {activeTab === 'main' && (
        <>
          {/* Billing Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '6px' }}>
            {['monthly', 'yearly'].map(b => (
              <button key={b} onClick={() => setBilling(b)}
                style={{ padding: '8px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, transition: 'all 0.2s', background: billing === b ? '#7c6af7' : 'transparent', color: billing === b ? '#fff' : '#9ca3af' }}>
                {b === 'monthly' ? 'Monthly' : 'Yearly'}
                {b === 'yearly' && <span style={{ marginLeft: 6, fontSize: 11, color: billing === 'yearly' ? '#a5f3fc' : '#06b6d4' }}>Save 40%</span>}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, width: '100%', maxWidth: 1100 }}>
            {PLANS.map((plan, idx) => {
              const isCurrentPlan = currentPlan === plan.key;
              const isHovered = hoveredPlan === plan.key;
              return (
                <div key={plan.key}
                  className={`pc-card${plan.popular?' pc-popular':''}`}
                  onMouseEnter={() => setHoveredPlan(plan.key)}
                  onMouseLeave={() => setHoveredPlan(null)}
                  style={{
                    background: plan.gradient,
                    border: `1px solid ${isHovered || plan.popular ? plan.border : 'rgba(255,255,255,0.07)'}`,
                    borderRadius: 20, padding: '0', position: 'relative', cursor: 'pointer', overflow: 'hidden',
                    opacity: visible ? 1 : 0,
                    transition: `opacity 0.5s ease ${idx * 0.08}s`,
                    boxShadow: plan.popular ? `0 8px 40px ${plan.color}33, 0 0 0 1px ${plan.color}22` : 'none',
                  }}>
                  {/* Top color line */}
                  <div style={{ height:3, background:`linear-gradient(90deg,${plan.color},${plan.color}66,transparent)`, opacity: isHovered || plan.popular ? 1 : 0.4, transition:'opacity 0.3s' }} />
                  <div style={{ padding:'28px 24px' }}>
                  {plan.popular && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #7c6af7, #06b6d4)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 16px', borderRadius: 999, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>⭐ MOST POPULAR</div>
                  )}
                  {isCurrentPlan && (
                    <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(34,197,94,0.2)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', fontSize: 11, fontWeight: 600, padding: '2px 10px', borderRadius: 999 }}>Current</div>
                  )}
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 32 }}>{plan.icon}</span>
                    <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>{plan.name}</h3>
                    <div style={{ fontSize: 28, fontWeight: 800, color: plan.color }}>{getPrice(plan)}</div>
                    {billing === 'yearly' && plan.key !== 'free' && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{plan.price_yearly} EGP / year</div>}
                    {getOffer(plan) && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4, fontWeight: 600 }}>{getOffer(plan)}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: plan.color }}>{plan.videos}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>videos</div>
                    </div>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: plan.color }}>{plan.credits}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>credits</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                    {plan.features.map((feat, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14, flexShrink: 0 }}>{feat.included ? '✅' : '❌'}</span>
                        <span style={{ fontSize: 13, color: feat.included ? '#d1d5db' : '#4b5563', flex: 1 }}>{feat.text}</span>
                        {feat.badge && (
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: feat.badge === 'PRO' ? 'rgba(124,106,247,0.2)' : feat.badge === 'PLUS' ? 'rgba(6,182,212,0.2)' : 'rgba(245,158,11,0.2)', color: feat.badge === 'PRO' ? '#7c6af7' : feat.badge === 'PLUS' ? '#06b6d4' : '#f59e0b', letterSpacing: '0.04em' }}>{feat.badge}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <button className="pc-btn" onClick={() => {
                    if (region === 'intl' && plan.key !== 'free') {
                      const usd = USD_PRICES[plan.key];
                      openPlan(plan.key, plan.name, plan.icon, plan.color, billing === 'yearly' ? usd.yearly + '/yr' : '$' + usd.monthly + '/mo');
                    } else { handleSelect(plan); }
                  }}
                    style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background:isCurrentPlan?'rgba(255,255,255,0.08)':plan.key==='free'?'rgba(255,255,255,0.1)':plan.color, color:isCurrentPlan?'#6b7280':'#fff', fontWeight:700, fontSize:14, cursor:isCurrentPlan?'default':'pointer', boxShadow:!isCurrentPlan&&plan.key!=='free'?`0 4px 20px ${plan.color}44`:'none' }}>
                    {isCurrentPlan ? '✓ Current Plan' : plan.key === 'free' ? 'Continue for Free' : region === 'intl' ? `Pay $${USD_PRICES[plan.key]?.[billing] || ''} →` : `Get ${plan.name} →`}
                  </button>
                  </div>{/* end inner padding */}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── TAB: More Plans (Model 3 & 4) ── */}
      {activeTab === 'more' && (
        <div style={{ width: '100%', maxWidth: 1100 }}>

          {/* Model 3 Section */}
          <div style={{ marginBottom: 60 }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 700, letterSpacing: '0.06em' }}>MODEL 3 — AI IMAGES</span>
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>🖼️ AI Image Videos</h2>
              <p style={{ color: '#9ca3af', fontSize: 15, maxWidth: 500, margin: '0 auto' }}>
                Generate stunning videos from AI-generated images. Powered by Stability AI with cinematic Ken Burns zoom effects.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              {MODEL3_PLANS.map((plan, idx) => (
                <div key={plan.key}
                  onMouseEnter={() => setHoveredPlan('m3_' + plan.key)}
                  onMouseLeave={() => setHoveredPlan(null)}
                  style={{
                    background: 'linear-gradient(135deg, #1a1200 0%, #0a0800 100%)',
                    border: `1px solid ${hoveredPlan === 'm3_' + plan.key ? 'rgba(245,158,11,0.5)' : 'rgba(245,158,11,0.15)'}`,
                    borderRadius: 20, padding: '28px 24px', position: 'relative',
                    transform: visible ? (hoveredPlan === 'm3_' + plan.key ? 'translateY(-6px)' : 'translateY(0)') : 'translateY(40px)',
                    opacity: visible ? 1 : 0,
                    transition: `all 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s`,
                    boxShadow: hoveredPlan === 'm3_' + plan.key ? '0 20px 40px rgba(245,158,11,0.15)' : 'none',
                  }}>
                  {plan.badge && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: plan.color, color: '#000', fontSize: 11, fontWeight: 700, padding: '4px 16px', borderRadius: 999, whiteSpace: 'nowrap' }}>⭐ {plan.badge}</div>
                  )}
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 32 }}>{plan.icon}</span>
                    <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>{plan.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      {plan.price_egp_offer && region !== 'intl' && <span style={{ fontSize: 14, color: '#4b5563', textDecoration: 'line-through' }}>{plan.price_egp} EGP</span>}
                      <span style={{ fontSize: 26, fontWeight: 800, color: plan.color }}>{region === 'intl' ? `$${USD_PRICES[plan.key]}` : `${plan.price_egp_offer || plan.price_egp} EGP`}</span>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>/month</span>
                    </div>
                    {plan.price_egp_offer && <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginTop: 2 }}>🎉 First month offer!</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                    {plan.features.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: plan.color, fontSize: 14, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: '#d1d5db' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => {
                    if (region === 'intl') { openPlan(plan.key, 'Model 3 ' + plan.name, plan.icon, plan.color, USD_PRICES[plan.key]); }
                    else { setSelectedM3Plan(plan); }
                  }}
                    style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: plan.color, color: plan.color === '#f59e0b' || plan.color === '#22c55e' ? '#000' : '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s', boxShadow: `0 4px 20px ${plan.color}44` }}>
                    {region === 'intl' ? `Pay $${USD_PRICES[plan.key]} →` : `Get ${plan.name} →`}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 60 }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
            <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Model 4 Section */}
          <div>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', marginBottom: 12 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#a855f7', display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 700, letterSpacing: '0.06em' }}>MODEL 4 — REAL AI VIDEO</span>
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>🎬 Seedance AI Video</h2>
              <p style={{ color: '#9ca3af', fontSize: 15, maxWidth: 500, margin: '0 auto' }}>
                Real AI-generated video clips — not images. Powered by Seedance v1 Pro. The most advanced model on Erivion.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              {MODEL4_PLANS_LIST.map((plan, idx) => (
                <div key={plan.key}
                  onMouseEnter={() => setHoveredPlan('m4_' + plan.key)}
                  onMouseLeave={() => setHoveredPlan(null)}
                  style={{
                    background: 'linear-gradient(135deg, #0d0518 0%, #060310 100%)',
                    border: `1px solid ${hoveredPlan === 'm4_' + plan.key ? 'rgba(168,85,247,0.5)' : 'rgba(168,85,247,0.15)'}`,
                    borderRadius: 20, padding: '28px 24px', position: 'relative',
                    transform: visible ? (hoveredPlan === 'm4_' + plan.key ? 'translateY(-6px)' : 'translateY(0)') : 'translateY(40px)',
                    opacity: visible ? 1 : 0,
                    transition: `all 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s`,
                    boxShadow: hoveredPlan === 'm4_' + plan.key ? '0 20px 40px rgba(168,85,247,0.15)' : 'none',
                  }}>
                  {plan.badge && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 16px', borderRadius: 999, whiteSpace: 'nowrap' }}>⭐ {plan.badge}</div>
                  )}
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 32 }}>{plan.icon}</span>
                    <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>{plan.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      {plan.price_egp_offer && region !== 'intl' && <span style={{ fontSize: 14, color: '#4b5563', textDecoration: 'line-through' }}>{plan.price_egp} EGP</span>}
                      <span style={{ fontSize: 26, fontWeight: 800, color: '#c084fc' }}>{region === 'intl' ? `$${USD_PRICES[plan.key]}` : `${plan.price_egp_offer || plan.price_egp} EGP`}</span>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>/month</span>
                    </div>
                    {plan.price_egp_offer && <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginTop: 2 }}>🎉 First month offer!</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                    {plan.features.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#a855f7', fontSize: 14, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: '#d1d5db' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => {
                    if (region === 'intl') { openPlan(plan.key, 'Model 4 ' + plan.name, plan.icon, '#a855f7', USD_PRICES[plan.key]); }
                    else { setSelectedM4Plan(plan); }
                  }}
                    style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 20px rgba(168,85,247,0.4)' }}>
                    {region === 'intl' ? `Pay $${USD_PRICES[plan.key]} →` : `Get ${plan.name} →`}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Model 5 Cinematic Section */}
          <div style={{ marginTop: 60 }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(225,29,72,0.1)', border: '1px solid rgba(225,29,72,0.3)', marginBottom: 12 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#e11d48', display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: '#fb7185', fontWeight: 700, letterSpacing: '0.06em' }}>ERIVION CINEMATIC</span>
              </div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>🎭 Cinematic AI Video</h2>
              <p style={{ color: '#9ca3af', fontSize: 15, maxWidth: 500, margin: '0 auto' }}>
                Character-consistent cinematic videos with original audio. No voiceover — pure visual storytelling. Powered by Seedance 2.0 Fast.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              {MC_PLANS_LIST.map((plan, idx) => (
                <div key={plan.key}
                  onMouseEnter={() => setHoveredPlan('mc_' + plan.key)}
                  onMouseLeave={() => setHoveredPlan(null)}
                  style={{
                    background: 'linear-gradient(135deg, #0d0508 0%, #060208 100%)',
                    border: `1px solid ${hoveredPlan === 'mc_' + plan.key ? 'rgba(225,29,72,0.5)' : 'rgba(225,29,72,0.15)'}`,
                    borderRadius: 20, padding: '28px 24px', position: 'relative',
                    transform: visible ? (hoveredPlan === 'mc_' + plan.key ? 'translateY(-6px)' : 'translateY(0)') : 'translateY(40px)',
                    opacity: visible ? 1 : 0,
                    transition: `all 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.1}s`,
                    boxShadow: hoveredPlan === 'mc_' + plan.key ? '0 20px 40px rgba(225,29,72,0.15)' : 'none',
                  }}>
                  {plan.badge && (
                    <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg, #e11d48, #9f1239)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 16px', borderRadius: 999, whiteSpace: 'nowrap' }}>⭐ {plan.badge}</div>
                  )}
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: 32 }}>{plan.icon}</span>
                    <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '8px 0 4px' }}>{plan.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, color: '#fb7185' }}>{region === 'intl' ? `$${USD_PRICES[plan.key]}` : `${plan.price_egp} EGP`}</span>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>/month</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                    {plan.features.map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: '#e11d48', fontSize: 14, flexShrink: 0 }}>✓</span>
                        <span style={{ fontSize: 13, color: '#d1d5db' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => {
                    if (region === 'intl') { openPlan(plan.key, 'Cinematic ' + plan.name, plan.icon, '#e11d48', USD_PRICES[plan.key]); }
                    else { setSelectedMCPlan(plan); }
                  }}
                    style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #e11d48, #9f1239)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 20px rgba(225,29,72,0.4)' }}>
                    {region === 'intl' ? `Pay $${USD_PRICES[plan.key]} →` : `Get ${plan.name} →`}
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Modals */}
      {selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          billing={billing}
          onClose={() => setSelectedPlan(null)}
          onSuccess={() => {
            setPendingRequest({ plan: selectedPlan.key, billing, status: 'pending' });
            setSelectedPlan(null);
          }}
        />
      )}
      {selectedM3Plan && (
        <Model3PaymentModal
          plan={selectedM3Plan}
          onClose={() => setSelectedM3Plan(null)}
        />
      )}
      {selectedM4Plan && (
        <Model4PaymentModal
          plan={selectedM4Plan}
          onClose={() => setSelectedM4Plan(null)}
        />
      )}
      {selectedMCPlan && (
        <MCPaymentModal
          plan={selectedMCPlan}
          onClose={() => setSelectedMCPlan(null)}
        />
      )}

      {intlModal && (
        <IntlPaymentModal
          planKey={intlModal.planKey}
          planName={intlModal.planName}
          planIcon={intlModal.planIcon}
          planColor={intlModal.planColor}
          usdPrice={intlModal.usdPrice}
          gumroadUrl={intlModal.gumroadUrl}
          onClose={() => setIntlModal(null)}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');

        @keyframes fadeInDown { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeUp     { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer    { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes gradShift  { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes float      { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes glow       { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes cardReveal { from{opacity:0;transform:translateY(24px) scale(0.98)} to{opacity:1;transform:translateY(0) scale(1)} }

        .plan-card {
          transition: all 0.4s cubic-bezier(0.16,1,0.3,1) !important;
          position: relative;
        }
        .plan-card::before {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          background: linear-gradient(135deg, transparent, rgba(255,255,255,0.05), transparent);
          opacity: 0;
          transition: opacity 0.3s;
          pointer-events: none;
        }
        .plan-card:hover { transform: translateY(-8px) scale(1.01) !important; }
        .plan-card:hover::before { opacity: 1; }

        .billing-toggle {
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1) !important;
        }
        .billing-toggle:hover { opacity: 0.85; }

        .region-btn {
          transition: all 0.35s cubic-bezier(0.16,1,0.3,1) !important;
          position: relative;
          overflow: hidden;
        }
        .region-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(255,255,255,0.04), transparent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .region-btn:hover::after { opacity: 1; }

        .tab-pill {
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1) !important;
        }
        .tab-pill:hover { opacity: 0.85; }

        .pricing-bg {
          background: radial-gradient(ellipse at top, rgba(124,106,247,0.07) 0%, transparent 50%),
                      radial-gradient(ellipse at bottom right, rgba(6,182,212,0.05) 0%, transparent 50%);
        }
      `}</style>
    </div>
  );
}