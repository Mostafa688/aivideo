import React, { useState, useRef, useEffect } from 'react';
import VoiceUpload from './VoiceUpload.jsx';

const MODEL3_PLANS_INFO = [
  { key: 'm3_starter', name: 'Starter', icon: '🚀', color: '#f59e0b', price: '450 EGP/month', price_usd: 14, quota: { '30s': 5, '1min': 10, '3min': 0, '5min': 0 }, features: ['5 × 30s videos', '10 × 1min videos'] },
  { key: 'm3_pro', name: 'Pro', icon: '⚡', color: '#7c6af7', price: '1,100 EGP/month', price_usd: 28, badge: 'Most Popular', quota: { '30s': 5, '1min': 5, '3min': 10, '5min': 0 }, features: ['5 × 30s videos', '5 × 1min videos', '10 × 3min videos'] },
  { key: 'm3_max', name: 'Max', icon: '👑', color: '#22c55e', price: '2,000 EGP/month', price_usd: 45, quota: { '30s': 0, '1min': 5, '3min': 5, '5min': 10 }, features: ['5 × 1min videos', '5 × 3min videos', '10 × 5min videos'] },
];

const MODEL3_GUMROAD = {
  m3_starter: 'https://digiwhirl23.gumroad.com/l/osibu',
  m3_pro:     'https://digiwhirl23.gumroad.com/l/zfdge',
  m3_max:     'https://digiwhirl23.gumroad.com/l/fgydww',
};

const INSTAPAY_NUMBER = '01091917832';

function PlansModal({ currentPlan, onClose, usage, quotas, onNavigate }) {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [step, setStep] = useState('plans');
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [intlDone, setIntlDone] = useState(false);
  const region = localStorage.getItem('erivion_region') || 'eg';
  const [copied, setCopied] = useState(false);

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
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ plan: selectedPlan.key, planName: selectedPlan.name, amount: selectedPlan.price, userEmail: email, screenshot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStep('pending');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:16 }}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ background:'#0a0a12', border:'1px solid rgba(124,106,247,0.3)', borderRadius:24, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', animation:'slideUp 0.3s ease' }}>
        {step === 'intl' ? (
          <div style={{ padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <button onClick={() => setStep('plans')} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:20 }}>←</button>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#fff', margin:0 }}>{selectedPlan?.icon} {selectedPlan?.name} — International</h3>
                <p style={{ fontSize:13, color:selectedPlan?.color, margin:'2px 0 0', fontWeight:700 }}>${selectedPlan?.price_usd}/month</p>
              </div>
              <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {intlDone ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:64, marginBottom:16 }}>⏳</div>
                <h3 style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:12 }}>Request Submitted!</h3>
                <p style={{ color:'#9ca3af', fontSize:14, lineHeight:1.8, marginBottom:24 }}>We'll verify your Gumroad payment and activate your plan within <strong style={{ color:'#22c55e' }}>24 hours</strong>.</p>
                <button onClick={onClose} style={{ background:selectedPlan?.color, color:'#fff', border:'none', borderRadius:12, padding:'13px 36px', fontWeight:700, fontSize:15, cursor:'pointer' }}>Got it! 🚀</button>
              </div>
            ) : (
              <>
                <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:14, padding:18, marginBottom:20 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#d1d5db', margin:'0 0 14px' }}>💳 How to subscribe:</p>
                  {['Click "Pay on Gumroad" below', 'Complete payment with your card', "Come back here and click \"I've Paid\"", "We'll verify and activate within 24h"].map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{ width:22, height:22, borderRadius:'50%', background:`${selectedPlan?.color}22`, border:`1px solid ${selectedPlan?.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:selectedPlan?.color, flexShrink:0 }}>{i+1}</div>
                      <span style={{ fontSize:13, color:'#d1d5db' }}>{s}</span>
                    </div>
                  ))}
                </div>
                <a href={MODEL3_GUMROAD[selectedPlan?.key]} target="_blank" rel="noreferrer"
                  style={{ display:'block', width:'100%', padding:'14px', borderRadius:12, background:`linear-gradient(135deg, ${selectedPlan?.color}, ${selectedPlan?.color}bb)`, color: selectedPlan?.color === '#f59e0b' || selectedPlan?.color === '#22c55e' ? '#000' : '#fff', fontWeight:700, fontSize:15, textAlign:'center', textDecoration:'none', marginBottom:10, boxSizing:'border-box' }}>
                  🔗 Pay on Gumroad — ${selectedPlan?.price_usd}
                </a>
                <button onClick={async () => {
                  try {
                    const res = await fetch('/api/auth/intl-payment/request', {
                      method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('token') },
                      body: JSON.stringify({ planKey: selectedPlan?.key, planName: 'Model 3 ' + selectedPlan?.name, usdPrice: selectedPlan?.price_usd }),
                    });
                    if (res.ok) setIntlDone(true);
                  } catch(e) {}
                }}
                  style={{ width:'100%', padding:'13px', borderRadius:12, border:`1px solid ${selectedPlan?.color}44`, background:'rgba(255,255,255,0.04)', color:selectedPlan?.color, fontWeight:700, fontSize:14, cursor:'pointer' }}>
                  ✅ I've Paid — Notify Admin
                </button>
              </>
            )}
          </div>
        ) : step === 'pending' ? (
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ fontSize:64, marginBottom:16 }}>⏳</div>
            <h3 style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:12 }}>Request Received!</h3>
            <p style={{ color:'#9ca3af', fontSize:14, lineHeight:1.8, marginBottom:24 }}>We'll review your transfer and activate your plan within a few hours.</p>
            <button onClick={onClose} style={{ padding:'12px 32px', borderRadius:10, background:'#7c6af7', color:'#fff', fontWeight:700, fontSize:14, border:'none', cursor:'pointer' }}>Got it!</button>
          </div>
        ) : step === 'payment' ? (
          <div style={{ padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <button onClick={() => setStep('plans')} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:20 }}>←</button>
              <div>
                <h3 style={{ fontSize:17, fontWeight:800, color:'#fff', margin:0 }}>{selectedPlan?.icon} Upgrade to {selectedPlan?.name}</h3>
                <p style={{ fontSize:12, color:selectedPlan?.color, margin:'2px 0 0', fontWeight:700 }}>{selectedPlan?.price}</p>
              </div>
              <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            <div style={{ background:'rgba(124,106,247,0.06)', border:'1px solid rgba(124,106,247,0.2)', borderRadius:12, padding:18, marginBottom:16 }}>
              <p style={{ fontSize:12, fontWeight:700, color:'#7c6af7', margin:'0 0 12px' }}>💳 Payment Steps</p>
              {['Open InstaPay app', `Transfer ${selectedPlan?.price} to:`, 'Take a screenshot', 'Upload it below ⬇️'].map((s, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <div style={{ width:20, height:20, borderRadius:'50%', background:'rgba(124,106,247,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#7c6af7', flexShrink:0 }}>{i+1}</div>
                  <span style={{ fontSize:12, color:'#d1d5db' }}>{s}</span>
                </div>
              ))}
              <div style={{ margin:'12px 0', padding:'10px 14px', background:'#1a1a2e', border:'1px solid rgba(124,106,247,0.3)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{INSTAPAY_NUMBER}</span>
                <button onClick={() => { navigator.clipboard?.writeText(INSTAPAY_NUMBER); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ padding:'5px 12px', borderRadius:6, background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(124,106,247,0.2)', border:`1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(124,106,247,0.4)'}`, color: copied ? '#22c55e' : '#7c6af7', cursor:'pointer', fontSize:11 }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <p style={{ fontSize:11, color:'#9ca3af', marginBottom:6, fontWeight:600 }}>📧 Your email</p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@gmail.com"
                style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.1)', background:'#111120', color:'#fff', fontSize:13, fontFamily:'inherit', outline:'none' }} />
            </div>
            <div style={{ marginBottom:14 }}>
              <p style={{ fontSize:11, color:'#9ca3af', marginBottom:6, fontWeight:600 }}>📎 Transfer screenshot</p>
              <label style={{ display:'block', border:'2px dashed rgba(124,106,247,0.3)', borderRadius:10, padding:16, textAlign:'center', cursor:'pointer', background:'rgba(124,106,247,0.03)' }}>
                {preview ? <img src={preview} alt="ss" style={{ maxWidth:'100%', maxHeight:140, borderRadius:6, objectFit:'contain' }} />
                  : <><div style={{ fontSize:28, marginBottom:6 }}>📷</div><p style={{ color:'#7c6af7', fontSize:12, margin:0 }}>Click to upload screenshot</p></>}
                <input type="file" accept="image/*" onChange={handleFile} style={{ display:'none' }} />
              </label>
            </div>
            {error && <p style={{ color:'#ef4444', fontSize:12, marginBottom:10 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading || !screenshot || !email}
              style={{ width:'100%', padding:'13px', borderRadius:10, border:'none', background: loading || !screenshot || !email ? '#374151' : selectedPlan?.color, color:'#fff', fontWeight:700, fontSize:14, cursor: loading || !screenshot || !email ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ Submitting...' : '✅ Submit Subscription Request'}
            </button>
          </div>
        ) : (
          <div style={{ padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:'#fff', margin:0 }}>🖼️ Model 3 Plans</h3>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {usage && quotas && (
              <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:14, marginBottom:18 }}>
                <p style={{ fontSize:11, color:'#6b7280', margin:'0 0 10px', fontWeight:600 }}>Current Usage</p>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {[['30s', usage.videos_30s, quotas['30s']], ['1min', usage.videos_1min, quotas['1min']], ['3min', usage.videos_3min, quotas['3min']], ['5min', usage.videos_5min, quotas['5min']]].filter(([, , q]) => q > 0).map(([dur, used, quota]) => (
                    <div key={dur} style={{ padding:'6px 12px', borderRadius:8, background:'rgba(255,255,255,0.05)', fontSize:12 }}>
                      <span style={{ color:'#9ca3af' }}>{dur}: </span>
                      <span style={{ color: used >= quota ? '#ef4444' : '#22c55e', fontWeight:700 }}>{used}/{quota}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {MODEL3_PLANS_INFO.map(plan => (
                <div key={plan.key} onClick={() => {
                  if (region === 'intl') { setSelectedPlan(plan); setStep('intl'); }
                  else { setSelectedPlan(plan); setStep('payment'); }
                }}
                  style={{ padding:'18px', borderRadius:14, cursor:'pointer', background: currentPlan === plan.key ? `rgba(${plan.color === '#22c55e' ? '34,197,94' : plan.color === '#7c6af7' ? '124,106,247' : '245,158,11'},0.1)` : '#111120', border:`1px solid ${plan.color}${currentPlan === plan.key ? '88' : '33'}`, transition:'all 0.2s', position:'relative' }}>
                  {plan.badge && <div style={{ position:'absolute', top:10, right:10, padding:'2px 8px', borderRadius:999, background:`${plan.color}22`, fontSize:10, fontWeight:700, color:plan.color }}>{plan.badge}</div>}
                  {currentPlan === plan.key && <div style={{ position:'absolute', top:10, left:10, padding:'2px 8px', borderRadius:999, background:'rgba(34,197,94,0.2)', fontSize:10, fontWeight:700, color:'#22c55e' }}>✓ Current Plan</div>}
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10, marginTop: currentPlan === plan.key ? 20 : 0 }}>
                    <span style={{ fontSize:22 }}>{plan.icon}</span>
                    <div>
                      <div style={{ fontSize:15, fontWeight:800, color:'#fff' }}>{plan.name}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:plan.color }}>{region === 'intl' ? `$${plan.price_usd}/month` : plan.price}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {plan.features.map((f, i) => <span key={i} style={{ fontSize:11, color:'#9ca3af' }}>✓ {f}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const VOICE_OPTIONS = [
  { key: 'male_american',   label: 'American Man',  emoji: '🇺🇸', gender: 'male' },
  { key: 'male_arabic',     label: 'Arabic Man',    emoji: '🇸🇦', gender: 'male' },
  { key: 'male_wise',       label: 'Wise Man',      emoji: '🧙',  gender: 'male' },
  { key: 'female_american', label: 'American Woman',emoji: '🇺🇸', gender: 'female' },
  { key: 'female_arabic',   label: 'Arabic Woman',  emoji: '🇸🇦', gender: 'female' },
  { key: 'none',            label: 'No Voice',      emoji: '🔇',  gender: 'none' },
];

const VIDEO_LANGUAGES = [
  { code: 'en',      label: 'English',         flag: '🇺🇸' },
  { code: 'ar',      label: 'Arabic (Formal)',  flag: '🇸🇦' },
  { code: 'ar_eg',   label: 'Arabic (Egyptian)',flag: '🇪🇬' },
  { code: 'ar_gulf', label: 'Arabic (Gulf)',    flag: '🇦🇪' },
  { code: 'de',      label: 'German',           flag: '🇩🇪' },
  { code: 'fr',      label: 'French',           flag: '🇫🇷' },
];

const RATIOS = ['9:16', '16:9', '1:1'];

const ALL_DURATIONS = [
  { value: '30s',  label: '30 seconds', images: 3,  plans: ['m3_starter','m3_pro','m3_max'] },
  { value: '1min', label: '1 minute',   images: 6,  plans: ['m3_starter','m3_pro','m3_max'] },
  { value: '3min', label: '3 minutes',  images: 18, plans: ['m3_pro','m3_max'] },
  { value: '5min', label: '5 minutes',  images: 30, plans: ['m3_max'] },
];

const VIDEO_STYLES = [
  { key: 'cinematic',   label: 'Cinematic',   emoji: '🎬', desc: 'Dramatic lighting, film grain',    suffix: 'cinematic photography, dramatic lighting, shallow depth of field, film grain, professional color grading' },
  { key: 'documentary', label: 'Documentary', emoji: '📹', desc: 'Real, natural, journalistic',       suffix: 'documentary style, natural lighting, photorealistic, journalistic photography, authentic atmosphere' },
  { key: 'fantasy',     label: 'Fantasy',     emoji: '✨', desc: 'Magical, ethereal, dreamlike',      suffix: 'fantasy art, magical atmosphere, ethereal lighting, mystical, highly detailed digital art' },
  { key: 'historical',  label: 'Historical',  emoji: '🏛️', desc: 'Ancient civilizations, epic',       suffix: 'historical epic, ancient world, dramatic atmosphere, oil painting style, cinematic' },
  { key: 'nature',      label: 'Nature',      emoji: '🌿', desc: 'Landscapes, wildlife',              suffix: 'nature photography, golden hour lighting, breathtaking landscape, National Geographic style' },
  { key: 'islamic',     label: 'Islamic',     emoji: '🕌', desc: 'Islamic architecture, spiritual',   suffix: 'Islamic architecture, golden light, spiritual atmosphere, detailed geometric patterns, cinematic' },
  { key: 'anime',       label: 'Anime',       emoji: '🌸', desc: 'Japanese animation style',          suffix: 'anime style, vibrant colors, detailed illustration, studio ghibli inspired, beautiful cel shading' },
  { key: 'cartoon',     label: 'Cartoon',     emoji: '🎨', desc: 'Animated, colorful, fun',           suffix: 'cartoon style, bright vivid colors, 2D animation, fun and expressive, pixar inspired illustration' },
  { key: '3d_cartoon',  label: '3D Cartoon',  emoji: '🎮', desc: '3D rendered, Pixar style',          suffix: '3D rendered cartoon style, smooth colorful surfaces, pixar style 3D animation, high detail render' },
];

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

function SceneEditor({ scenes, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {scenes.map((scene, i) => (
        <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ width:24, height:24, borderRadius:'50%', background:'linear-gradient(135deg,#f59e0b,#ef4444)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>{i+1}</span>
            <span style={{ fontSize:12, color:'var(--text3)', fontWeight:600 }}>Scene {i+1} — 5 seconds</span>
          </div>
          <div style={{ marginBottom:8 }}>
            <p style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>IMAGE PROMPT (English)</p>
            <textarea value={scene.prompt} onChange={e => { const u=[...scenes]; u[i]={...u[i],prompt:e.target.value}; onChange(u); }} rows={2}
              placeholder="Cinematic shot of a glowing desert at sunset..."
              style={{ width:'100%', resize:'none', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
          </div>
          <div>
            <p style={{ fontSize:11, color:'var(--text3)', marginBottom:4, fontWeight:600 }}>VOICEOVER TEXT</p>
            <textarea value={scene.text} onChange={e => { const u=[...scenes]; u[i]={...u[i],text:e.target.value}; onChange(u); }} rows={2}
              placeholder="The narration for this scene..."
              style={{ width:'100%', resize:'none', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Model3Page({ onBack, model3Plan = 'm3_starter', model3Access = false, onNavigate }) {
  const [step, setStep]             = useState('setup');
  const [inputMode, setInputMode]   = useState('idea');
  const [idea, setIdea]             = useState('');
  const [script, setScript]         = useState('');
  const [voiceAudioUrl, setVoiceAudioUrl] = useState(null);
  const [videoStyle, setVideoStyle] = useState('cinematic');
  const [duration, setDuration]     = useState('30s');
  const [ratio, setRatio]           = useState('9:16');
  const [voice, setVoice]           = useState('male_american');
  const [videoLanguage, setLang]    = useState('en');
  const [captions, setCaptions]     = useState(true);
  const [music, setMusic]           = useState(true);
  const [scenes, setScenes]         = useState([]);
  const [generating, setGenerating] = useState(false);
  const [renderStatus, setRenderStatus] = useState('');
  const [videoUrl, setVideoUrl]     = useState(null);
  const [error, setError]           = useState('');
  const [showPlans, setShowPlans]   = useState(false);
  const [usage, setUsage]           = useState(null);
  const [quotas, setQuotas]         = useState(null);
  const [trialUsed, setTrialUsed]   = useState(false);
  const [isTrial, setIsTrial]       = useState(false);
  const [creditCost, setCreditCost] = useState(5);
  const pollRef                     = useRef(null);

  useEffect(() => {
    fetch('/api/auth/credits', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.json())
      .then(d => {
        setUsage(d.model3_usage);
        setQuotas(d.model3_quotas);
        setTrialUsed(d.model3_trial_used === 1 || d.model3_trial_used === true);
      })
      .catch(() => {});
  }, []);

  // fetch credit cost when duration changes
  useEffect(() => {
    const dur = inputMode === 'script' ? getSmartDuration() : duration;
    fetch(`/api/model3/credit-cost?duration=${dur}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.json()).then(d => setCreditCost(d.creditCost || 5)).catch(() => {});
  }, [duration, inputMode, script]);

  const DURATIONS = ALL_DURATIONS.filter(d => d.plans.includes(model3Plan));
  const selectedDuration = ALL_DURATIONS.find(d => d.value === duration);
  const imageCount       = selectedDuration?.images || 3;
  const selectedStyle    = VIDEO_STYLES.find(s => s.key === videoStyle);

  // لو مش مشترك — بس 30s متاح للـ trial
  const hasAccess = model3Access === true || model3Access === 1;
  const canUseDuration = (d) => {
    if (hasAccess) return ALL_DURATIONS.find(dur => dur.value === d)?.plans.includes(model3Plan);
    return d === '30s' && !trialUsed; // trial = 30s only
  };

  const MAX_SCRIPT_CHARS = 3000; // max = 5min

  const getSmartDuration = () => {
    if (!script.trim()) return duration;
    const chars = script.trim().length;
    if (chars <= 300)  return '30s';
    if (chars <= 600)  return '1min';
    if (chars <= 1800) return '3min';
    return '5min';
  };
  const scriptCharCount = script.length;
  const scriptOverLimit = inputMode === 'script' && scriptCharCount > MAX_SCRIPT_CHARS;
  // auto-set duration when script changes
  React.useEffect(() => {
    if (inputMode === 'script' && script.length > 20) {
      setDuration(getSmartDuration());
    }
  }, [script, inputMode]);

  const canSubmit = (inputMode === 'idea'
    ? idea.trim().length > 10
    : inputMode === 'voice'
    ? false
    : script.trim().length > 30) && !scriptOverLimit;

  const generateScenes = async () => {
    setGenerating(true); setError('');
    try {
      const res = await fetch('/api/model3/generate-scenes', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ idea: inputMode === 'idea' ? idea : null, script: (inputMode === 'script' || inputMode === 'voice') ? script : null, inputMode: inputMode === 'voice' ? 'script' : inputMode, imageCount: ALL_DURATIONS.find(d => d.value === (inputMode === 'script' ? getSmartDuration() : duration))?.images || imageCount, videoLanguage, ratio, videoStyle, styleSuffix: selectedStyle?.suffix || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setScenes(data.scenes); setStep('scenes');
    } catch (e) { setError(e.message); } finally { setGenerating(false); }
  };

  const startRender = async () => {
    setStep('render'); setRenderStatus('Preparing voiceover...'); setError('');
    try {
      let audioUrl = null;
      if (voiceAudioUrl) {
        audioUrl = voiceAudioUrl;
        setRenderStatus('Using your uploaded voice recording...');
      } else if (voice !== 'none') {
        const fullText = scenes.map(s => s.text).join(' ');
        const voiceRes = await fetch('/api/generate-voice', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ text: fullText, voice, videoLanguage }) });
        const voiceData = await voiceRes.json();
        if (!voiceRes.ok) throw new Error(voiceData.error || 'Voiceover failed');
        audioUrl = voiceData.audioUrl;
      }

      setRenderStatus('Starting AI image generation...');
      const renderRes = await fetch('/api/model3/render', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ scenes, audioUrl, ratio, captions, transitions: false, music, videoLanguage, duration: inputMode === 'script' ? getSmartDuration() : duration, videoStyle, styleSuffix: selectedStyle?.suffix || '' }) });
      const renderData = await renderRes.json();
      if (!renderRes.ok) {
        if (renderData.show_upgrade || renderData.error === 'subscribe_required' || renderData.error === 'no_access') {
          setShowPlans(true); setStep('setup'); return;
        }
        throw new Error(renderData.error || 'Render failed');
      }
      setIsTrial(renderData.is_trial || false);
      const newJobId = renderData.jobId;
      setRenderStatus('AI is generating images... This takes 5-15 minutes.');

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/render-status/${newJobId}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
          const statusData = await statusRes.json();
          if (statusData.status === 'done') { clearInterval(pollRef.current); setVideoUrl(statusData.videoUrl); setStep('done'); }
          else if (statusData.status === 'failed') { clearInterval(pollRef.current); setError(statusData.error || 'Render failed'); setStep('scenes'); }
          else { const e = statusData.elapsedSeconds || 0; setRenderStatus(`Generating ${imageCount} AI images... ⏱ ${Math.floor(e/60)}m ${e%60}s`); }
        } catch {}
      }, 5000);
    } catch (e) { setError(e.message); setStep('scenes'); }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── SETUP ──────────────────────────────────────────────────────────────
  if (step === 'setup') return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', padding:'clamp(32px,5vw,56px) clamp(16px,4vw,24px) 80px', background:'radial-gradient(ellipse at top, rgba(245,158,11,0.06) 0%, transparent 55%)' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes glow{0%,100%{opacity:0.5}50%{opacity:1}}
        .m3-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:22px;margin-bottom:14px;transition:border-color 0.2s}
        .m3-card:focus-within{border-color:rgba(245,158,11,0.35)!important}
        .m3-sel{border:1px solid rgba(255,255,255,0.08);border-radius:12px;background:rgba(255,255,255,0.03);cursor:pointer;transition:all 0.18s}
        .m3-sel:hover{border-color:rgba(245,158,11,0.3);background:rgba(245,158,11,0.04)}
        .m3-sel.active{border-color:#f59e0b!important;background:rgba(245,158,11,0.08)!important}
        .m3-toggle{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;cursor:pointer;transition:all 0.15s;border:1px solid transparent}
        .m3-toggle:hover{background:rgba(255,255,255,0.04)}
        @media(max-width:600px){
          .m3-card{padding:16px!important;border-radius:14px!important}
          .m3-style-grid{grid-template-columns:repeat(3,1fr)!important;gap:8px!important}
          .m3-dur-grid{grid-template-columns:repeat(3,1fr)!important}
          .m3-lang-grid{grid-template-columns:repeat(4,1fr)!important;gap:6px!important}
          .m3-ratio-grid{grid-template-columns:repeat(3,1fr)!important}
        }
      `}</style>

      <div style={{ width:'100%', maxWidth:660, animation:'fadeUp 0.4s ease' }}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:32 }}>
          <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px', fontWeight:500 }}>← Models</button>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ padding:'6px 14px', borderRadius:999, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', fontSize:10, color:'#f59e0b', fontWeight:700, letterSpacing:'0.1em' }}>MODEL 3 · AI IMAGES</div>
            <button onClick={() => setShowPlans(true)} style={{ padding:'8px 14px', borderRadius:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Plans & Usage
            </button>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginBottom:32 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
            <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,#f59e0b,#ef4444)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, boxShadow:'0 4px 20px rgba(245,158,11,0.35)', flexShrink:0 }}>🖼️</div>
            <div>
              <h1 style={{ fontSize:'clamp(22px,4vw,30px)', fontWeight:800, color:'#fff', letterSpacing:'-0.5px', margin:0, lineHeight:1.1 }}>AI Image Video</h1>
              <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', margin:'4px 0 0', lineHeight:1.5 }}>Each scene = unique AI image + Ken Burns zoom. Highest quality output.</p>
            </div>
          </div>
        </div>

        {/* Trial Banners */}
        {!hasAccess && !trialUsed && (
          <div style={{ marginBottom:16, background:'linear-gradient(135deg,rgba(245,158,11,0.1),rgba(239,68,68,0.07))', border:'1px solid rgba(245,158,11,0.25)', borderRadius:14, padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:'rgba(245,158,11,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🎁</div>
            <div>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#f59e0b' }}>Free Trial Available</p>
              <p style={{ margin:'2px 0 0', fontSize:12, color:'rgba(255,255,255,0.4)' }}>Generate 1 free 30s video — no payment needed · Idea mode only</p>
            </div>
          </div>
        )}
        {!hasAccess && trialUsed && (
          <div style={{ marginBottom:16, background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:14, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:'rgba(239,68,68,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🔒</div>
              <div>
                <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#fff' }}>Trial Completed</p>
                <p style={{ margin:'2px 0 0', fontSize:12, color:'rgba(255,255,255,0.4)' }}>Subscribe to generate unlimited videos</p>
              </div>
            </div>
            <button onClick={() => setShowPlans(true)} style={{ background:'linear-gradient(135deg,#f59e0b,#ef4444)', color:'#fff', border:'none', borderRadius:10, padding:'9px 18px', fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 4px 12px rgba(245,158,11,0.3)' }}>Upgrade →</button>
          </div>
        )}

        {/* Mode Tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:16 }}>
          {[['idea','💡','Idea'],['script','📝','Script'],['voice','🎙️','Voice']].map(([m,ic,label]) => {
            const locked = !hasAccess && trialUsed && m !== 'idea';
            const active = inputMode === m;
            return (
              <button key={m} onClick={() => { if (locked) { setShowPlans(true); return; } setInputMode(m); }}
                style={{ flex:1, padding:'11px 8px', borderRadius:12, border:`1px solid ${active?'#f59e0b':'rgba(255,255,255,0.08)'}`, fontWeight:600, fontSize:13, cursor:'pointer', transition:'all 0.2s', background: active ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)', color: active ? '#f59e0b' : locked ? '#374151' : 'rgba(255,255,255,0.5)', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:16 }}>{locked?'🔒':ic}</span>
                <span style={{ fontSize:11 }}>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Input */}
        <div className="m3-card" style={{ marginBottom:14 }}>
          <p style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>
            {inputMode === 'idea' ? '💡 Your Idea' : inputMode === 'voice' ? '🎙️ Voice Recording' : '📝 Your Script'}
          </p>

          {inputMode === 'idea' && (
            <textarea value={idea} onChange={e => setIdea(e.target.value)}
              placeholder="A cinematic video about the rise of the Ottoman Empire..."
              rows={4} autoFocus
              style={{ width:'100%', resize:'vertical', padding:'12px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text)', fontSize:14, fontFamily:'inherit', outline:'none', lineHeight:1.65 }} />
          )}

          {inputMode === 'script' && (
            <textarea value={script} onChange={e => setScript(e.target.value)}
              placeholder={`Paste your full script here...\n\nThe model will split it into ${imageCount} scenes automatically.`}
              rows={7} autoFocus
              style={{ width:'100%', resize:'vertical', padding:'12px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text)', fontSize:14, fontFamily:'inherit', outline:'none', lineHeight:1.65 }} />
          )}

          {inputMode === 'voice' && (
            <VoiceUpload
              accentColor="#f59e0b"
              accentBg="rgba(245,158,11,0.1)"
              videoLanguage={videoLanguage}
              model="model3"
              maxSizeMb={10}
              onTranscribed={(text, audioUrl) => {
                setScript(text);
                setVoiceAudioUrl(audioUrl);
                setInputMode('script');
                setTimeout(() => {
                  // auto duration from voice transcript
                  const voiceChars = text.trim().length;
                  const smartDur = voiceChars <= 300 ? '30s' : voiceChars <= 600 ? '1min' : voiceChars <= 1800 ? '3min' : '5min';
                  const smartImages = ALL_DURATIONS.find(d => d.value === smartDur)?.images || imageCount;
                  setDuration(smartDur);
                  setGenerating(true);
                  setError('');
                  fetch('/api/model3/generate-scenes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
                    body: JSON.stringify({ idea: null, script: text, inputMode: 'script', imageCount: smartImages, videoLanguage, ratio, videoStyle, styleSuffix: VIDEO_STYLES.find(s => s.key === videoStyle)?.suffix || '' }),
                  })
                  .then(r => r.json())
                  .then(data => { if (data.error) throw new Error(data.error); setScenes(data.scenes); setStep('scenes'); })
                  .catch(e => setError(e.message))
                  .finally(() => setGenerating(false));
                }, 100);
              }}
            />
          )}

          {inputMode !== 'voice' && (
            <p style={{ fontSize:11, color: scriptOverLimit ? '#f87171' : 'var(--text3)', marginTop:6 }}>
              {inputMode === 'idea'
                ? `${idea.length} characters`
                : `${scriptCharCount} / ${MAX_SCRIPT_CHARS} chars${scriptOverLimit ? ' — Too long! Max 3000 chars (5 min)' : (script.length > 20 ? ` · Auto: ${getSmartDuration()}` : '')}`}
            </p>
          )}
        </div>

        {/* Duration */}
        <div className="m3-card">
          <p style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>⏱ Duration</p>
          {(inputMode === 'script' || inputMode === 'voice') && script.length > 20 && (
            <div style={{ padding:'10px 16px', borderRadius:10, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', fontSize:13, color:'#f59e0b', marginBottom:14, fontWeight:600 }}>
              ✨ Auto-detected: <strong>{getSmartDuration()}</strong> based on script length
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, opacity: (inputMode === 'script' || inputMode === 'voice') && script.length > 20 ? 0.4 : 1, pointerEvents: (inputMode === 'script' || inputMode === 'voice') && script.length > 20 ? 'none' : 'auto' }}>
            {ALL_DURATIONS.map(d => {
              const allowed = canUseDuration(d.value);
              const isTrial30 = !hasAccess && !trialUsed && d.value === '30s';
              return (
                <div key={d.value} onClick={() => allowed ? setDuration(d.value) : setShowPlans(true)}
                  style={{ padding:'16px', borderRadius:12, cursor: allowed ? 'pointer' : 'pointer', textAlign:'center', border:'1px solid ' + (duration === d.value && allowed ? '#f59e0b' : allowed ? 'var(--border)' : 'var(--border)'), background: duration === d.value && allowed ? 'rgba(245,158,11,0.08)' : 'var(--bg3)', opacity: allowed ? 1 : 0.4, position:'relative' }}>
                  {!allowed && <div style={{ position:'absolute', top:8, right:8, fontSize:12 }}>🔒</div>}
                  <div style={{ fontSize:16, fontWeight:800, color: duration === d.value && allowed ? '#f59e0b' : allowed ? 'var(--text)' : 'var(--text3)', marginBottom:2 }}>{d.label}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>{d.images} AI images</div>
                  {isTrial30 && <div style={{ fontSize:10, color:'#f59e0b', fontWeight:700 }}>FREE TRIAL</div>}
                  {!allowed && <div style={{ fontSize:10, color:'#ef4444', fontWeight:600 }}>Upgrade required</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Video Style */}
        <div className="m3-card">
          <p style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:14 }}>🎨 Visual Style</p>
          <div className="m3-style-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {VIDEO_STYLES.map(s => (
              <div key={s.key} onClick={() => setVideoStyle(s.key)} style={{ padding:'14px 10px', borderRadius:12, cursor:'pointer', textAlign:'center', border:'1px solid ' + (videoStyle===s.key ? '#f59e0b' : 'var(--border)'), background: videoStyle===s.key ? 'rgba(245,158,11,0.08)' : 'var(--bg3)', transition:'all 0.15s' }}>
                <div style={{ fontSize:24, marginBottom:6 }}>{s.emoji}</div>
                <div style={{ fontSize:12, fontWeight:700, color: videoStyle===s.key ? '#f59e0b' : 'var(--text)', marginBottom:3 }}>{s.label}</div>
                <div style={{ fontSize:10, color:'var(--text3)', lineHeight:1.3 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="m3-card">
          <p style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:18 }}>⚙️ Settings</p>

          <div style={{ marginBottom:18 }}>
            <p style={{ fontSize:11, color:'var(--text3)', marginBottom:8, fontWeight:600 }}>Language</p>
            <div style={{ display:'flex', gap:8 }}>
              {VIDEO_LANGUAGES.map(lang => (
                <div key={lang.code} onClick={() => setLang(lang.code)} style={{ flex:1, padding:'8px 4px', borderRadius:10, cursor:'pointer', textAlign:'center', border:'1px solid ' + (videoLanguage===lang.code ? '#f59e0b' : 'var(--border)'), background: videoLanguage===lang.code ? 'rgba(245,158,11,0.08)' : 'var(--bg3)', transition:'all 0.15s' }}>
                  <div style={{ fontSize:18, marginBottom:2 }}>{lang.flag}</div>
                  <div style={{ fontSize:10, color: videoLanguage===lang.code ? '#f59e0b' : 'var(--text3)', fontWeight:600 }}>{lang.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:18 }}>
            <p style={{ fontSize:11, color:'var(--text3)', marginBottom:8, fontWeight:600 }}>Aspect Ratio</p>
            <div style={{ display:'flex', gap:8 }}>
              {RATIOS.map(r => (
                <div key={r} onClick={() => setRatio(r)} style={{ flex:1, padding:'8px', borderRadius:10, cursor:'pointer', textAlign:'center', border:'1px solid ' + (ratio===r ? '#f59e0b' : 'var(--border)'), background: ratio===r ? 'rgba(245,158,11,0.08)' : 'var(--bg3)', fontSize:13, fontWeight:600, color: ratio===r ? '#f59e0b' : 'var(--text3)', transition:'all 0.15s' }}>{r}</div>
              ))}
            </div>
          </div>

          {inputMode !== 'voice' && (
            <div style={{ marginBottom:18 }}>
              <p style={{ fontSize:11, color:'var(--text3)', marginBottom:8, fontWeight:600 }}>Voice</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                {VOICE_OPTIONS.map(v => (
                  <div key={v.key} onClick={() => setVoice(v.key)} style={{ padding:'10px 8px', borderRadius:10, cursor:'pointer', textAlign:'center', border:'1px solid ' + (voice===v.key ? '#f59e0b' : 'var(--border)'), background: voice===v.key ? 'rgba(245,158,11,0.08)' : 'var(--bg3)', transition:'all 0.15s' }}>
                    <div style={{ fontSize:18, marginBottom:3 }}>{v.emoji}</div>
                    <div style={{ fontSize:10, fontWeight:600, color: voice===v.key ? '#f59e0b' : 'var(--text3)' }}>{v.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {inputMode === 'voice' && voiceAudioUrl && (
            <div style={{ marginBottom:18, padding:'10px 14px', borderRadius:10, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', fontSize:12, color:'#86efac' }}>
              🎙️ Your uploaded voice will be used as the video's audio track
            </div>
          )}

          {[
            { label:'💬 Captions', value:captions, onChange:setCaptions },
            { label:'🎵 Background Music', value:music, onChange:setMusic },
          ].map(({ label, value, onChange }) => (
            <div key={label} onClick={() => onChange(!value)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 14px', background:'var(--bg3)', borderRadius:10, marginBottom:8, cursor:'pointer', border:'1px solid ' + (value ? 'rgba(245,158,11,0.2)' : 'transparent') }}>
              <span style={{ fontSize:13, fontWeight:500, color:'var(--text)' }}>{label}</span>
              <div style={{ width:42, height:23, borderRadius:999, background: value ? '#f59e0b' : 'var(--bg4)', position:'relative', transition:'background 0.2s' }}>
                <div style={{ position:'absolute', top:2.5, left: value ? 21 : 2.5, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
              </div>
            </div>
          ))}
        </div>

        {error && <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', fontSize:13, marginBottom:16 }}>{error}</div>}

        {/* Quota / Trial status */}
        {hasAccess && usage && quotas && (() => {
          const col = duration === '30s' ? 'videos_30s' : duration === '1min' ? 'videos_1min' : duration === '3min' ? 'videos_3min' : 'videos_5min';
          const quota = quotas[duration] || 0;
          const used = usage[col] || 0;
          if (quota === 0) return <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', fontSize:13, marginBottom:16, textAlign:'center' }}>
            🔒 {duration} not available on your plan — <button onClick={() => setShowPlans(true)} style={{ background:'none', border:'none', color:'#f59e0b', cursor:'pointer', fontWeight:700, textDecoration:'underline', fontSize:13 }}>Upgrade now</button>
          </div>;
          if (used >= quota) return <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', fontSize:13, marginBottom:16, textAlign:'center' }}>
            ⚠️ Quota used ({used}/{quota} {duration} videos) — <button onClick={() => setShowPlans(true)} style={{ background:'none', border:'none', color:'#f59e0b', cursor:'pointer', fontWeight:700, textDecoration:'underline', fontSize:13 }}>Subscribe again or upgrade</button>
          </div>;
          return <div style={{ padding:'8px 14px', borderRadius:8, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', fontSize:12, color:'#22c55e', marginBottom:12, textAlign:'center' }}>
            Remaining: {quota - used} {duration} videos
          </div>;
        })()}

        {/* Credit cost badge */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:10 }}>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)', fontSize:12, fontWeight:700, color:'#f59e0b' }}>
            🪙 {creditCost} credits per video
          </div>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:600 }}>
            Model 3 · AI Images
          </div>
        </div>

        {/* CTA */}
        {!hasAccess && trialUsed ? (
          <button onClick={() => setShowPlans(true)} style={{ width:'100%', padding:'16px', borderRadius:12, border:'none', background:'linear-gradient(135deg, #f59e0b, #ef4444)', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', boxShadow:'0 4px 20px rgba(245,158,11,0.3)' }}>
            🚀 Subscribe to Generate More Videos →
          </button>
        ) : (
          <button onClick={generateScenes} disabled={generating || !canSubmit || inputMode === 'voice' || (() => {
            if (hasAccess && usage && quotas) {
              const col = duration === '30s' ? 'videos_30s' : duration === '1min' ? 'videos_1min' : duration === '3min' ? 'videos_3min' : 'videos_5min';
              return (quotas[duration] || 0) === 0 || (usage[col] || 0) >= (quotas[duration] || 0);
            }
            return false;
          })()} style={{ width:'100%', padding:'16px', borderRadius:12, border:'none', background: generating || !canSubmit ? 'var(--bg3)' : 'linear-gradient(135deg, #f59e0b, #ef4444)', color: generating || !canSubmit ? 'var(--text3)' : '#fff', fontWeight:700, fontSize:15, cursor: generating || !canSubmit ? 'not-allowed' : 'pointer', boxShadow: canSubmit ? '0 4px 20px rgba(245,158,11,0.3)' : 'none', transition:'all 0.15s' }}>
            {generating ? '⏳ Generating scenes...' : !hasAccess && !trialUsed ? `🎁 Try Free — Generate ${imageCount} Scenes →` : `✨ Generate ${imageCount} Scenes — ${creditCost} Credits →`}
          </button>
        )}

        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.2)', marginTop:12 }}>
          Stability AI · {selectedStyle?.emoji} {selectedStyle?.label} · Ken Burns zoom · FFmpeg render
        </p>
      </div>
      {showPlans && <PlansModal currentPlan={model3Plan} onClose={() => setShowPlans(false)} usage={usage} quotas={quotas} onNavigate={onNavigate} />}
    </div>
  );

  // ── SCENES ──────────────────────────────────────────────────────────────
  if (step === 'scenes') return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', padding:'clamp(32px,5vw,48px) clamp(16px,4vw,24px) 80px', background:'radial-gradient(ellipse at top, rgba(245,158,11,0.05) 0%, transparent 50%)' }}>
      <div style={{ width:'100%', maxWidth:660 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
          <button onClick={() => setStep('setup')} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Back</button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ padding:'5px 12px', borderRadius:999, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', fontSize:11, color:'#f59e0b', fontWeight:700 }}>{selectedStyle?.emoji} {selectedStyle?.label}</span>
            <span style={{ padding:'5px 12px', borderRadius:999, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', fontSize:11, color:'rgba(255,255,255,0.5)', fontWeight:600 }}>{scenes.length} scenes · {selectedDuration?.label}</span>
          </div>
        </div>
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontSize:24, fontWeight:800, color:'#fff', marginBottom:6, letterSpacing:'-0.5px' }}>Review & Edit Scenes</h2>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.4)', margin:0 }}>Each scene = 1 unique AI image + Ken Burns zoom. Edit prompts for better results.</p>
        </div>
        <SceneEditor scenes={scenes} onChange={setScenes} />
        {error && <div style={{ padding:'12px 16px', borderRadius:12, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', color:'#ef4444', fontSize:13, margin:'16px 0' }}>{error}</div>}
        <button onClick={startRender} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', marginTop:24, background:'linear-gradient(135deg,#f59e0b,#ef4444)', color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', boxShadow:'0 8px 24px rgba(245,158,11,0.35)', transition:'all 0.2s' }}>
          🚀 Generate Video →
        </button>
        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.25)', marginTop:10 }}>
          Generating {scenes.length} unique AI images · Ken Burns zoom · FFmpeg render
          {voiceAudioUrl ? ' · Your uploaded voice' : ''}
        </p>
      </div>
    </div>
  );

  // ── RENDER ──────────────────────────────────────────────────────────────
  if (step === 'render') return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 16px', background:'radial-gradient(ellipse at center, rgba(245,158,11,0.05) 0%, transparent 60%)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:0.5}50%{opacity:1}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ textAlign:'center', maxWidth:500, animation:'fadeUp 0.4s ease' }}>
        {/* Spinner */}
        <div style={{ position:'relative', width:96, height:96, margin:'0 auto 32px' }}>
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid rgba(245,158,11,0.1)' }} />
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'#f59e0b', animation:'spin 0.9s linear infinite' }} />
          <div style={{ position:'absolute', inset:8, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'rgba(245,158,11,0.4)', animation:'spin 1.4s linear infinite reverse' }} />
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🖼️</div>
        </div>
        <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:8, letterSpacing:'-0.5px' }}>Generating Your Video</h2>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.4)', marginBottom:24 }}>AI is crafting each scene — please keep this tab open</p>
        <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:14, padding:'16px 20px', marginBottom:24 }}>
          <p style={{ fontSize:14, color:'#f59e0b', lineHeight:1.7, margin:0, fontWeight:500 }}>{renderStatus}</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, textAlign:'left' }}>
          {[
            { label: voiceAudioUrl ? 'Voice Recording (uploaded)' : 'Voiceover generation', done:true },
            { label: `AI Images × ${imageCount} — ${selectedStyle?.emoji} ${selectedStyle?.label}`, done:false, active:true },
            { label: 'Ken Burns zoom & transitions', done:false },
            { label: 'Audio mix & captions', done:false },
          ].map((item, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', borderRadius:12, background: item.active ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.03)', border:`1px solid ${item.active ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.06)'}` }}>
              <div style={{ width:20, height:20, borderRadius:'50%', background: item.done ? 'rgba(34,197,94,0.2)' : item.active ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:10 }}>
                {item.done ? '✓' : item.active ? <div style={{ width:8,height:8,borderRadius:'50%',background:'#f59e0b',animation:'pulse 1s ease infinite' }} /> : ''}
              </div>
              <span style={{ fontSize:13, color: item.done ? '#22c55e' : item.active ? '#f59e0b' : 'rgba(255,255,255,0.3)', fontWeight: item.active ? 600 : 400 }}>{item.label}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize:12, color:'rgba(255,255,255,0.2)', marginTop:20, animation:'pulse 2s ease infinite' }}>May take 5–15 minutes · Do not close this tab</p>
      </div>
    </div>
  );

  // ── DONE ──────────────────────────────────────────────────────────────
  if (step === 'done') return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 16px', background:'radial-gradient(ellipse at top, rgba(34,197,94,0.06) 0%, transparent 55%)' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes pop{0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ textAlign:'center', maxWidth:560, width:'100%', animation:'fadeUp 0.5s ease' }}>
        <div style={{ fontSize:64, marginBottom:16, animation:'pop 0.5s ease' }}>🎉</div>
        <h2 style={{ fontSize:30, fontWeight:800, color:'#fff', marginBottom:6, letterSpacing:'-1px' }}>Video Ready!</h2>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:20 }}>
          <span style={{ padding:'4px 12px', borderRadius:999, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.25)', fontSize:12, color:'#f59e0b', fontWeight:600 }}>{selectedStyle?.emoji} {selectedStyle?.label}</span>
          <span style={{ padding:'4px 12px', borderRadius:999, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', fontSize:12, color:'rgba(255,255,255,0.5)', fontWeight:600 }}>{selectedDuration?.label}</span>
          <span style={{ padding:'4px 12px', borderRadius:999, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', fontSize:12, color:'rgba(255,255,255,0.5)', fontWeight:600 }}>{scenes.length} images</span>
        </div>
        {isTrial && (
          <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, padding:'12px 20px', marginBottom:20, fontSize:13, color:'#f59e0b', lineHeight:1.6 }}>
            ✨ Free trial video complete. Subscribe for unlimited creation.
          </div>
        )}
        {videoUrl && (
          <div style={{ borderRadius:18, overflow:'hidden', border:'1px solid rgba(255,255,255,0.08)', marginBottom:20, background:'#000', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <video src={videoUrl} controls style={{ width:'100%', maxHeight:420, display:'block' }} />
          </div>
        )}
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap', marginBottom: isTrial ? 14 : 0 }}>
          {videoUrl && <a href={videoUrl} download style={{ padding:'13px 28px', borderRadius:12, background:'linear-gradient(135deg,#22c55e,#16a34a)', color:'#fff', fontWeight:700, fontSize:14, textDecoration:'none', boxShadow:'0 4px 20px rgba(34,197,94,0.35)', display:'flex', alignItems:'center', gap:8 }}>⬇️ Download</a>}
          <button onClick={() => { setStep('setup'); setIdea(''); setScript(''); setScenes([]); setVideoUrl(null); setVoiceAudioUrl(null); }} style={{ padding:'13px 28px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.7)', fontWeight:600, fontSize:14, cursor:'pointer' }}>🔄 New Video</button>
        </div>
        {isTrial && (
          <button onClick={() => setShowPlans(true)} style={{ width:'100%', background:'linear-gradient(135deg,#f59e0b,#ef4444)', color:'#fff', border:'none', borderRadius:14, padding:'15px', fontWeight:800, fontSize:16, cursor:'pointer', boxShadow:'0 6px 24px rgba(245,158,11,0.4)', marginTop:4 }}>
            🚀 Subscribe to Create More →
          </button>
        )}
      </div>
      {showPlans && <PlansModal currentPlan={model3Plan} onClose={() => setShowPlans(false)} usage={usage} quotas={quotas} onNavigate={onNavigate} />}
    </div>
  );

  return null;
}