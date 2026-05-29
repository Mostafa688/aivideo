import React, { useState, useEffect } from 'react';
import VoiceUpload from './VoiceUpload.jsx';

const TONES = ['Motivational', 'Storytelling', 'Educational'];

const IDEA_PROMPTS = [
  { label: '💪 Motivation', text: 'A motivational video for people who feel stuck in life and need to take action today.' },
  { label: '📚 Education', text: 'An educational video explaining how the human brain works and how to improve memory.' },
  { label: '💼 Business', text: 'A video about the top 5 habits of highly successful entrepreneurs.' },
  { label: '🌍 History', text: 'A documentary-style video about the rise and fall of the Roman Empire.' },
  { label: '🏋️ Fitness', text: 'A motivational video about building discipline through daily exercise and healthy habits.' },
  { label: '🧠 Psychology', text: 'An educational video about how social media affects mental health and self-esteem.' },
  { label: '🚀 Tech', text: 'A video explaining how artificial intelligence is changing the future of work.' },
  { label: '🌱 Nature', text: 'A calming nature documentary about the Amazon rainforest and its biodiversity.' },
];

const SCRIPT_PROMPTS = [
  { label: '🎯 Sales Hook', text: `Hook: Are you tired of wasting time on tasks that don't move the needle?\n\nBody: Every successful entrepreneur knows that focus is their most valuable asset. You don't need 24 hours of hustle — you need 4 hours of deep work. Studies show that focused work sessions produce 5x more output than scattered multitasking.\n\nEnding: Choose focus over busyness. Start with one priority today, and watch your results transform.` },
  { label: '💡 Storytelling', text: `Hook: In 1994, a man quit his stable job to sell books online from his garage.\n\nBody: Everyone thought he was crazy. His friends warned him. His family worried. But Jeff Bezos had a vision that most people couldn't see yet. He believed the internet would change everything. So he drove across the country and started typing.\n\nEnding: The garage became Amazon. The crazy idea became a revolution. What idea are you not acting on?` },
  { label: '📖 Educational', text: `Hook: Did you know your brain produces electricity every single second?\n\nBody: The human brain contains 86 billion neurons, each connected to thousands of others. When you learn something new, your brain physically rewires itself — creating new pathways and strengthening existing ones. This process is called neuroplasticity, and it means you can literally change your brain at any age.\n\nEnding: You are not stuck with the brain you were born with. Every book you read, every skill you practice — you are reshaping your mind.` },
  { label: '🌟 Inspirational', text: `Hook: Most people overestimate what they can do in a day and underestimate what they can do in a year.\n\nBody: Small daily actions seem insignificant in the moment. One page a day becomes a book in a year. Ten minutes of exercise becomes a transformed body in six months. One kind word a day becomes a reputation for a lifetime.\n\nEnding: Don't wait for the big moment. The big moment is made of small ones. Start today.` },
];

const VOICE_OPTIONS = [
  { key: 'male_wise',       label: 'Wise Man',      emoji: '🧙', gender: 'male',   desc: 'Deep, authoritative' },
  { key: 'male_young',      label: 'Young Man',     emoji: '🧑', gender: 'male',   desc: 'Energetic, modern' },
  { key: 'male_american',   label: 'American Man',  emoji: '🇺🇸', gender: 'male',   desc: 'Clear, professional' },
  { key: 'male_arabic',     label: 'Arabic Man',    emoji: '🇸🇦', gender: 'male',   desc: 'Native Arabic voice' },
  { key: 'male_child',      label: 'Child Boy',     emoji: '👦', gender: 'male',   desc: 'Young, friendly' },
  { key: 'female_wise',     label: 'Wise Woman',    emoji: '👩‍🏫', gender: 'female', desc: 'Calm, trustworthy' },
  { key: 'female_young',    label: 'Young Woman',   emoji: '👩', gender: 'female', desc: 'Warm, expressive' },
  { key: 'female_american', label: 'American Woman',emoji: '🇺🇸', gender: 'female', desc: 'Clear, professional' },
  { key: 'female_arabic',   label: 'Arabic Woman',  emoji: '🇸🇦', gender: 'female', desc: 'Native Arabic voice' },
  { key: 'female_child',    label: 'Child Girl',    emoji: '👧', gender: 'female', desc: 'Young, playful' },
  { key: 'none',            label: 'No Voice',      emoji: '🔇', gender: 'none',   desc: 'Music only' },
];
const RATIOS = ['9:16', '16:9', '1:1'];
const VIDEO_LANGUAGES = [
  { code: 'en', label: 'English',    flag: '🇺🇸' },
  { code: 'ar', label: 'Arabic',     flag: '🇸🇦' },
  { code: 'de', label: 'German',     flag: '🇩🇪' },
  { code: 'fr', label: 'French',     flag: '🇫🇷' },
  { code: 'es', label: 'Spanish',    flag: '🇪🇸' },
  { code: 'ru', label: 'Russian',    flag: '🇷🇺' },
  { code: 'ja', label: 'Japanese',   flag: '🇯🇵' },
  { code: 'pt', label: 'Portuguese', flag: '🇧🇷' },
];

function Label({ children }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>{children}</p>;
}
function Field({ label, children }) {
  return <div style={{ marginBottom: 22 }}><Label>{label}</Label>{children}</div>;
}
function PillGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(opt => (
        <span key={opt} onClick={() => onChange(opt)} style={{
          padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
          border: '1px solid ' + (value === opt ? 'var(--accent)' : 'var(--border2)'),
          background: value === opt ? 'var(--accent-bg)' : 'transparent',
          color: value === opt ? 'var(--accent2)' : 'var(--text2)',
          cursor: 'pointer', transition: 'all 0.12s', userSelect: 'none',
        }}>{opt}</span>
      ))}
    </div>
  );
}
function Toggle({ label, value, onChange, description, locked }) {
  return (
    <div onClick={() => !locked && onChange(!value)} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '11px 14px', background: locked ? 'var(--bg2)' : 'var(--bg3)',
      borderRadius: 10, marginBottom: 8, cursor: locked ? 'not-allowed' : 'pointer',
      border: '1px solid ' + (value && !locked ? 'rgba(124,106,247,0.2)' : 'transparent'),
      opacity: locked ? 0.5 : 1, transition: 'all 0.15s',
    }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{label}</p>
        {description && <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>{locked ? '🔒 Upgrade to unlock' : description}</p>}
      </div>
      <div style={{ width: 42, height: 23, borderRadius: 999, background: value && !locked ? 'var(--accent)' : 'var(--bg4)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
        <div style={{ position: 'absolute', top: 2.5, left: value && !locked ? 21 : 2.5, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
    </div>
  );
}

// ── Model 3 Payment Modal ──────────────────────────────────────────────────
const MODEL3_PLANS = [
  {
    key: 'm3_starter', name: 'Starter', icon: '🚀', price: 300, priceLabel: '300 جنيه / شهر', color: '#f59e0b',
    features: ['5 فيديوهات مدة 30 ثانية','10 فيديو مدة 1 دقيقة','جميع أنماط الصور (6 أنماط)','Ken Burns zoom effects','Captions + Music'],
    quota: { '30s': 5, '1min': 10 },
  },
  {
    key: 'm3_pro', name: 'Pro', icon: '⚡', price: 750, priceLabel: '750 جنيه / شهر', color: '#7c6af7', badge: 'Most Popular',
    features: ['5 فيديوهات مدة 30 ثانية','5 فيديوهات مدة 1 دقيقة','10 فيديو مدة 3 دقائق','جميع أنماط الصور','Ken Burns + Transitions','Captions + Music'],
    quota: { '30s': 5, '1min': 5, '3min': 10 },
  },
  {
    key: 'm3_max', name: 'Max', icon: '👑', price: 1400, priceLabel: '1400 جنيه / شهر', color: '#22c55e',
    features: ['5 فيديوهات مدة 1 دقيقة','5 فيديوهات مدة 3 دقائق','10 فيديو مدة 5 دقائق','جميع أنماط الصور','أعلى جودة إنتاج','أولوية في المعالجة'],
    quota: { '1min': 5, '3min': 5, '5min': 10 },
  },
];

const INSTAPAY_NUMBER = '01091917832';

function Model3PaymentModal({ onClose, onSuccess }) {
  const [step, setStep] = useState('plans');
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setScreenshot(ev.target.result); setScreenshotPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(INSTAPAY_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!email.trim()) { setError('من فضلك ادخل إيميلك'); return; }
    if (!screenshot) { setError('من فضلك ارفع صورة التحويل'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/model3/payment-request', {
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
      <style>{`@keyframes slideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} } .m3-plan:hover { transform: translateY(-4px) !important; }`}</style>
      <div style={{ background:'#0a0a12', border:'1px solid rgba(245,158,11,0.3)', borderRadius:24, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto', animation:'slideUp 0.3s ease' }}>
        {step === 'pending' ? (
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ fontSize:72, marginBottom:16 }}>⏳</div>
            <h3 style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:12 }}>طلبك وصلنا!</h3>
            <p style={{ color:'#9ca3af', fontSize:14, lineHeight:1.8, marginBottom:24 }}>هنراجع التحويل وهنفعّلك الاشتراك خلال ساعات. هتوصلك إيميل لما يتفعّل.</p>
            <div style={{ padding:'16px', background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:12, marginBottom:24, fontSize:13, color:'#f59e0b' }}>📧 تأكد إن إيميلك صح: <strong>{email}</strong></div>
            <button onClick={onClose} style={{ padding:'12px 32px', borderRadius:10, background:'#f59e0b', color:'#000', fontWeight:700, fontSize:15, border:'none', cursor:'pointer' }}>تمام، شكراً!</button>
          </div>
        ) : step === 'plans' ? (
          <div style={{ padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
              <div>
                <h3 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:0 }}>🖼️ Model 3 — AI Image Video</h3>
                <p style={{ fontSize:12, color:'#6b7280', margin:'4px 0 0' }}>اختار الباقة المناسبة ليك</p>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:22 }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {MODEL3_PLANS.map((plan) => (
                <div key={plan.key} className="m3-plan" onClick={() => { setSelectedPlan(plan); setStep('payment'); }}
                  style={{ padding:'20px', borderRadius:16, cursor:'pointer', background:'#111120', border:`1px solid ${plan.color}44`, transition:'all 0.2s', position:'relative', overflow:'hidden' }}>
                  {plan.badge && <div style={{ position:'absolute', top:12, right:12, padding:'3px 10px', borderRadius:999, background:`${plan.color}22`, border:`1px solid ${plan.color}44`, fontSize:10, fontWeight:700, color:plan.color }}>{plan.badge}</div>}
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:`linear-gradient(135deg, ${plan.color}, ${plan.color}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{plan.icon}</div>
                    <div>
                      <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{plan.name}</div>
                      <div style={{ fontSize:18, fontWeight:800, color:plan.color }}>{plan.priceLabel}</div>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                    {plan.features.map((f, j) => <div key={j} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#9ca3af' }}><span style={{ color:plan.color }}>✓</span> {f}</div>)}
                  </div>
                  <div style={{ marginTop:14, padding:'8px 14px', borderRadius:8, background:`${plan.color}15`, border:`1px solid ${plan.color}33`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <span style={{ fontSize:12, color:plan.color, fontWeight:600 }}>اختار {plan.name}</span>
                    <span style={{ color:plan.color }}>→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <button onClick={() => setStep('plans')} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:20 }}>←</button>
              <div>
                <h3 style={{ fontSize:18, fontWeight:800, color:'#fff', margin:0 }}>{selectedPlan?.icon} باقة {selectedPlan?.name}</h3>
                <p style={{ fontSize:13, color:selectedPlan?.color, margin:'2px 0 0', fontWeight:700 }}>{selectedPlan?.priceLabel}</p>
              </div>
            </div>
            <div style={{ background:'rgba(245,158,11,0.06)', border:'1px solid rgba(245,158,11,0.2)', borderRadius:14, padding:20, marginBottom:20 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#f59e0b', margin:'0 0 14px' }}>📱 خطوات الدفع</p>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {['افتح تطبيق InstaPay', `حول ${selectedPlan?.price} جنيه على الرقم:`, 'خد screenshot للتحويل', 'ارفعه هنا تحت ⬇️'].map((s, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(245,158,11,0.2)', border:'1px solid rgba(245,158,11,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#f59e0b', flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontSize:13, color:'#d1d5db' }}>{s}</span>
                  </div>
                ))}
              </div>
              <div style={{ margin:'14px 0', padding:'12px 16px', background:'#1a1a2e', border:'1px solid rgba(245,158,11,0.3)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:1 }}>{INSTAPAY_NUMBER}</span>
                <button onClick={handleCopy} style={{ padding:'6px 14px', borderRadius:8, background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)', border:`1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`, color: copied ? '#22c55e' : '#f59e0b', cursor:'pointer', fontSize:12, fontWeight:600 }}>
                  {copied ? '✓ تم النسخ' : 'نسخ'}
                </button>
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              <p style={{ fontSize:12, color:'#9ca3af', marginBottom:8, fontWeight:600 }}>📧 إيميلك</p>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@gmail.com"
                style={{ width:'100%', padding:'11px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'#111120', color:'#fff', fontSize:14, fontFamily:'inherit', outline:'none' }} />
            </div>
            <div style={{ marginBottom:16 }}>
              <p style={{ fontSize:12, color:'#9ca3af', marginBottom:8, fontWeight:600 }}>📎 صورة التحويل</p>
              <label style={{ display:'block', border:'2px dashed rgba(245,158,11,0.3)', borderRadius:12, padding:20, textAlign:'center', cursor:'pointer' }}>
                {screenshotPreview ? <img src={screenshotPreview} alt="screenshot" style={{ maxWidth:'100%', maxHeight:160, borderRadius:8, objectFit:'contain' }} /> : <><div style={{ fontSize:32, marginBottom:8 }}>📷</div><p style={{ color:'#f59e0b', fontSize:13, fontWeight:600, margin:0 }}>اضغط لرفع الصورة</p></>}
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display:'none' }} />
              </label>
            </div>
            {error && <p style={{ color:'#ef4444', fontSize:13, marginBottom:12 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading || !screenshot || !email}
              style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background: loading || !screenshot || !email ? '#374151' : `linear-gradient(135deg, ${selectedPlan?.color}, ${selectedPlan?.color}99)`, color:'#fff', fontWeight:700, fontSize:15, cursor: loading || !screenshot || !email ? 'not-allowed' : 'pointer' }}>
              {loading ? '⏳ جاري الإرسال...' : '✅ إرسال طلب الاشتراك'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Model Selection Screen ──────────────────────────────────────────────────

// ── Model 6: Atlas Map Video Form ─────────────────────────────────────────
const MAP_DURATIONS = ['30s', '1min', '2min', '3min', '5min'];
const MAP_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ar', label: 'Arabic',  flag: '🇸🇦' },
  { code: 'fr', label: 'French',  flag: '🇫🇷' },
  { code: 'de', label: 'German',  flag: '🇩🇪' },
  { code: 'es', label: 'Spanish', flag: '🇪🇸' },
];
const MAP_STYLES = [
  { key: 'dark',    label: 'Dark',    desc: 'Dark ocean, light countries',   bg: '#1a1a2e', land: '#2d3561', highlight: '#e11d48' },
  { key: 'classic', label: 'Classic', desc: 'Beige land, blue ocean',         bg: '#4a90d9', land: '#f5e6c8', highlight: '#e74c3c' },
  { key: 'military',label: 'Military',desc: 'Green land, dark borders',       bg: '#1a2a1a', land: '#2d4a2d', highlight: '#ff6b00' },
  { key: 'clean',   label: 'Clean',   desc: 'White land, minimal borders',    bg: '#e8f4f8', land: '#ffffff', highlight: '#3498db' },
];

function MapVideoForm({ onSubmit, onBack }) {
  const [mode, setMode]         = useState('idea');
  const [idea, setIdea]         = useState('');
  const [script, setScript]     = useState('');
  const [voiceAudioUrl, setVoiceAudioUrl] = useState(null);
  const [duration, setDuration] = useState('2min');
  const [ratio, setRatio]       = useState('16:9');
  const [language, setLanguage] = useState('en');
  const [mapStyle, setMapStyle] = useState('dark');
  const [voice, setVoice]       = useState('male_american');

  const canSubmit = mode === 'idea' ? idea.trim().length > 5 : mode === 'voice' ? !!voiceAudioUrl : script.trim().length > 20;

  const handleSubmit = () => {
    onSubmit({
      videoType: 'model6',
      mode: mode === 'voice' ? 'script' : mode,
      idea, script,
      voice,
      duration, ratio, language, mapStyle,
      uploadedAudioUrl: mode === 'voice' ? voiceAudioUrl : null,
    });
  };

  return (
    <div style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', padding:'clamp(20px,4vw,40px) clamp(12px,4vw,16px) 60px', background:'radial-gradient(ellipse at top, rgba(16,185,129,0.06) 0%, transparent 50%)' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        .map-input:focus { border-color:#10b981 !important; box-shadow:0 0 0 3px rgba(16,185,129,0.12) !important; outline:none !important; background:rgba(16,185,129,0.04) !important; }
        .map-input { background:rgba(255,255,255,0.04) !important; border:1px solid rgba(255,255,255,0.08) !important; color:var(--text) !important; border-radius:12px !important; transition:all 0.2s !important; }
        .map-input::placeholder { color:rgba(255,255,255,0.2) !important; }
        .map-card { background:rgba(255,255,255,0.025); border:1px solid rgba(255,255,255,0.07); border-radius:18px; backdrop-filter:blur(10px); }
      `}</style>

      {/* Header */}
      <div style={{ width:'100%', maxWidth:600, display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28, animation:'fadeUp 0.4s ease' }}>
        <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:8, background:'transparent', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0 }}>← Change model</button>
        <div style={{ padding:'5px 14px', borderRadius:999, fontSize:12, fontWeight:700, background:'rgba(16,185,129,0.12)', border:'1px solid rgba(16,185,129,0.3)', color:'#34d399' }}>🗺️ Atlas — Map Video</div>
      </div>

      <div style={{ width:'100%', maxWidth:600, animation:'fadeUp 0.5s ease 0.05s both' }}>

        {/* Mode tabs */}
        <div style={{ display:'flex', gap:4, marginBottom:24, background:'rgba(255,255,255,0.04)', borderRadius:14, padding:5, border:'1px solid rgba(255,255,255,0.08)' }}>
          {[['idea','💡 Idea'],['script','📝 Script'],['voice','🎙️ Voice']].map(([m,label]) => (
            <button key={m} onClick={() => setMode(m)}
              style={{ flex:1, padding:'11px', borderRadius:10, border:'none', fontWeight:700, fontSize:13, cursor:'pointer', transition:'all 0.2s', background: mode===m ? 'linear-gradient(135deg,#10b981,#059669)' : 'transparent', color: mode===m ? '#fff' : 'rgba(255,255,255,0.4)', boxShadow: mode===m ? '0 4px 16px rgba(16,185,129,0.35)' : 'none' }}>{label}</button>
          ))}
        </div>

        {/* Input area */}
        <div className="map-card" style={{ padding:24, marginBottom:16 }}>
          {mode === 'idea' && (
            <div style={{ marginBottom:0 }}>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Your Idea</p>
              <textarea value={idea} onChange={e => setIdea(e.target.value)} className="map-input" placeholder="The rise and fall of the Roman Empire — how Rome conquered Europe and eventually collapsed..." rows={4} style={{ width:'100%', resize:'none', padding:'12px 14px', lineHeight:1.65, fontFamily:'inherit', fontSize:14, outline:'none' }} autoFocus />
              <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:6 }}>{idea.length > 0 ? `${idea.length} characters` : 'Describe your map story in 1–2 sentences'}</p>
            </div>
          )}
          {mode === 'script' && (
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Your Script</p>
              <textarea value={script} onChange={e => setScript(e.target.value)} className="map-input" placeholder="Write your full narration script here. Mention countries and regions — the AI will automatically highlight them on the map as your story unfolds..." rows={8} style={{ width:'100%', resize:'vertical', padding:'12px 14px', lineHeight:1.65, fontFamily:'inherit', fontSize:14, minHeight:180, outline:'none' }} autoFocus />
              <p style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:6 }}>{script.trim().split(/\s+/).filter(Boolean).length} words</p>
            </div>
          )}
          {mode === 'voice' && (
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Upload Voiceover</p>
              <VoiceUpload onTranscribed={(_text, url) => setVoiceAudioUrl(url)} />
              {voiceAudioUrl && <p style={{ fontSize:12, color:'#34d399', marginTop:10 }}>✅ Voice uploaded — the map will sync to your narration</p>}
            </div>
          )}
        </div>

        {/* Map Style */}
        <div className="map-card" style={{ padding:24, marginBottom:16 }}>
          <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:14 }}>Map Style</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {MAP_STYLES.map(s => (
              <div key={s.key} onClick={() => setMapStyle(s.key)}
                style={{ padding:'14px 16px', borderRadius:12, cursor:'pointer', border:`1px solid ${mapStyle===s.key ? '#10b981' : 'rgba(255,255,255,0.08)'}`, background: mapStyle===s.key ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.02)', transition:'all 0.2s', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:20, borderRadius:4, background:s.bg, border:'1px solid rgba(255,255,255,0.1)', flexShrink:0, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', bottom:2, left:4, width:12, height:8, borderRadius:2, background:s.land }} />
                  <div style={{ position:'absolute', top:2, right:3, width:8, height:6, borderRadius:2, background:s.highlight }} />
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color: mapStyle===s.key ? '#34d399' : 'var(--text)' }}>{s.label}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings row */}
        <div className="map-card" style={{ padding:24, marginBottom:16 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

            {/* Duration */}
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Duration</p>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {MAP_DURATIONS.map(d => (
                  <span key={d} onClick={() => setDuration(d)} style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', border:`1px solid ${duration===d ? '#10b981' : 'rgba(255,255,255,0.1)'}`, background: duration===d ? 'rgba(16,185,129,0.15)' : 'transparent', color: duration===d ? '#34d399' : 'rgba(255,255,255,0.5)', transition:'all 0.15s' }}>{d}</span>
                ))}
              </div>
            </div>

            {/* Ratio */}
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Ratio</p>
              <div style={{ display:'flex', gap:6 }}>
                {['16:9','9:16'].map(r => (
                  <span key={r} onClick={() => setRatio(r)} style={{ padding:'6px 12px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', border:`1px solid ${ratio===r ? '#10b981' : 'rgba(255,255,255,0.1)'}`, background: ratio===r ? 'rgba(16,185,129,0.15)' : 'transparent', color: ratio===r ? '#34d399' : 'rgba(255,255,255,0.5)', transition:'all 0.15s' }}>{r}</span>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Language</p>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {MAP_LANGUAGES.map(l => (
                  <span key={l.code} onClick={() => setLanguage(l.code)} style={{ padding:'6px 10px', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer', border:`1px solid ${language===l.code ? '#10b981' : 'rgba(255,255,255,0.1)'}`, background: language===l.code ? 'rgba(16,185,129,0.15)' : 'transparent', color: language===l.code ? '#34d399' : 'rgba(255,255,255,0.5)', transition:'all 0.15s' }}>{l.flag} {l.label}</span>
                ))}
              </div>
            </div>

            {/* Voice */}
            {mode !== 'voice' && (
              <div>
                <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Voice</p>
                <select value={voice} onChange={e => setVoice(e.target.value)} className="map-input" style={{ width:'100%', padding:'9px 12px', fontSize:13, cursor:'pointer', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, background:'rgba(255,255,255,0.04)', color:'var(--text)' }}>
                  <option value="male_american">🇺🇸 American Man</option>
                  <option value="male_wise">🧙 Wise Man</option>
                  <option value="male_arabic">🇸🇦 Arabic Man</option>
                  <option value="female_american">🇺🇸 American Woman</option>
                  <option value="female_wise">👩‍🏫 Wise Woman</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!canSubmit}
          style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', fontWeight:700, fontSize:16, cursor: canSubmit ? 'pointer' : 'not-allowed', color:'#fff', background: canSubmit ? 'linear-gradient(135deg,#10b981,#059669)' : 'rgba(255,255,255,0.08)', boxShadow: canSubmit ? '0 4px 24px rgba(16,185,129,0.4)' : 'none', opacity: canSubmit ? 1 : 0.5, transition:'all 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
          {canSubmit ? '🗺️ Generate Map Video →' : 'Enter your idea or script to continue'}
        </button>

      </div>
    </div>
  );
}

// ── Model Selector ──────────────────────────────────────────────────────────
function ModelSelector({ onSelect, model3Access, model4Access, model5Access, model6Access }) {
  const [hovered, setHovered] = useState(null);
  const [showModel3Modal, setShowModel3Modal] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const MODELS = [
    {
      key:'ai', tag:'MODEL 1', name:'AI Slices', icon:'🎨',
      color:'#7c6af7', glow:'rgba(124,106,247,0.3)', gradFrom:'rgba(124,106,247,0.15)', gradTo:'rgba(192,132,252,0.05)',
      desc:'AI-generated visuals with cinematic Ken Burns effects. Perfect for storytelling and educational content.',
      features:['AI-generated scene images','Ken Burns zoom & pan','Cinematic quality output','Best for storytelling'],
      badge:null, free:true, category:'free',
      accent: '#a78bfa',
    },
    {
      key:'pexels', tag:'MODEL 2', name:'Real Footage', icon:'🎬',
      color:'#06b6d4', glow:'rgba(6,182,212,0.3)', gradFrom:'rgba(6,182,212,0.12)', gradTo:'rgba(14,165,233,0.04)',
      desc:'Real HD stock footage from Pexels library. Matches scenes with professional clips for a documentary feel.',
      features:['Real HD stock footage','Smart keyword matching','Documentary style','Fast rendering'],
      badge:null, free:true, category:'free',
      accent: '#67e8f9',
    },
    {
      key:'model3', tag:'MODEL 3', name:'AI Images', icon:'🖼️',
      color:'#f59e0b', glow:'rgba(245,158,11,0.3)', gradFrom:'rgba(245,158,11,0.14)', gradTo:'rgba(239,68,68,0.05)',
      desc:'Professional AI images per scene with Ken Burns zoom. Highest quality — every frame is unique.',
      features:['Unique AI image per scene','6 visual styles','Ken Burns + transitions','Premium production quality'],
      badge:'PREMIUM', free:false, category:'premium',
      accent: '#fcd34d',
    },
    {
      key:'model4', tag:'MODEL 4', name:'Seedance AI', icon:'🎞️',
      color:'#a855f7', glow:'rgba(168,85,247,0.3)', gradFrom:'rgba(168,85,247,0.14)', gradTo:'rgba(139,92,246,0.05)',
      desc:'Real AI-generated video clips from text. Not images — full cinematic motion powered by Seedance.',
      features:['Real AI video clips','Idea / Script / Voice','Captions + Music','Seedance v1 Pro Fast'],
      badge:'AI VIDEO', free:false, category:'premium',
      accent: '#d8b4fe',
    },
    {
      key:'model5', tag:'CINEMATIC', name:'Cinematic AI', icon:'🎭',
      color:'#e11d48', glow:'rgba(225,29,72,0.3)', gradFrom:'rgba(225,29,72,0.14)', gradTo:'rgba(159,18,57,0.05)',
      desc:'Consistent characters across scenes. Pure visual storytelling with no voiceover needed.',
      features:['Up to 5 characters','Character consistency','Pure visual storytelling','Seedance v1 Pro'],
      badge:'CHARACTERS', free:false, category:'premium',
      accent: '#fda4af',
    },
    {
      key:'model6', tag:'ATLAS', name:'Map Video', icon:'🗺️',
      color:'#10b981', glow:'rgba(16,185,129,0.3)', gradFrom:'rgba(16,185,129,0.14)', gradTo:'rgba(5,150,105,0.05)',
      desc:'Animated geographic map videos. Countries highlight, zoom, and change color as your story unfolds.',
      features:['170+ countries','Dynamic highlighting','Auto zoom & pan','Voice / Script / Idea'],
      badge:'NEW', free:true, category:'free',
      accent: '#6ee7b7',
    },
  ];

  const filtered = activeFilter === 'all' ? MODELS : MODELS.filter(m => m.category === activeFilter);

  return (
    <div style={{
      minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center',
      padding:'clamp(48px,8vw,80px) clamp(16px,4vw,32px) 80px',
      position:'relative', overflow:'hidden',
      background:'#05050f',
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500&display=swap');

        @keyframes fadeUp    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulseGlow { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes scanline  { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes borderRot { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes cardIn    { from{opacity:0;transform:translateY(30px) scale(0.96)} to{opacity:1;transform:translateY(0) scale(1)} }

        .ms-card {
          transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s ease !important;
          cursor: pointer;
          position: relative;
        }
        .ms-card:hover { transform: translateY(-10px) scale(1.01) !important; }
        .ms-card:active { transform: scale(0.98) !important; }

        .ms-filter-btn {
          padding: 7px 18px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: rgba(255,255,255,0.4);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
          letter-spacing: 0.03em;
        }
        .ms-filter-btn:hover { border-color: rgba(255,255,255,0.25); color: rgba(255,255,255,0.7); }
        .ms-filter-btn.active { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.3); color: #fff; }

        .ms-noise {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E");
          opacity: 0.4;
        }

        @media (max-width: 640px) {
          .ms-grid { grid-template-columns: 1fr !important; }
          .ms-header h1 { letter-spacing: -1px !important; }
        }
        @media (max-width: 900px) {
          .ms-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>

      {/* Noise texture */}
      <div className="ms-noise" />

      {/* Background grid */}
      <div style={{
        position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
        backgroundImage:`
          linear-gradient(rgba(124,106,247,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(124,106,247,0.04) 1px, transparent 1px)
        `,
        backgroundSize:'60px 60px',
        maskImage:'radial-gradient(ellipse at center, black 30%, transparent 80%)',
      }} />

      {/* Ambient glows */}
      <div style={{ position:'fixed', top:'-20%', left:'-10%', width:700, height:700, borderRadius:'50%', background:'radial-gradient(circle, rgba(124,106,247,0.1) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(60px)', zIndex:0 }} />
      <div style={{ position:'fixed', bottom:'-15%', right:'-5%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(50px)', zIndex:0 }} />

      {/* ── Header ── */}
      <div className="ms-header" style={{ textAlign:'center', marginBottom:52, position:'relative', zIndex:1, animation:'fadeUp 0.5s ease both' }}>

        {/* Live badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:999, background:'rgba(124,106,247,0.08)', border:'1px solid rgba(124,106,247,0.18)', marginBottom:24, backdropFilter:'blur(12px)' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', boxShadow:'0 0 10px #22c55e', animation:'pulseGlow 2s ease-in-out infinite' }} />
          <span style={{ fontSize:10, color:'#a78bfa', fontWeight:700, letterSpacing:'0.15em', fontFamily:"'DM Sans', sans-serif" }}>SELECT YOUR GENERATION ENGINE</span>
        </div>

        <h1 style={{
          fontSize:'clamp(32px,5.5vw,58px)', fontWeight:800, color:'#fff',
          fontFamily:"'Bricolage Grotesque', sans-serif",
          letterSpacing:'-2px', lineHeight:1.05, marginBottom:16,
        }}>
          Choose how you want to{' '}
          <span style={{
            background:'linear-gradient(135deg, #7c6af7 0%, #a78bfa 40%, #06b6d4 100%)',
            WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent',
            backgroundClip:'text',
          }}>create</span>
        </h1>

        <p style={{ fontSize:15, color:'rgba(255,255,255,0.38)', maxWidth:460, margin:'0 auto 28px', fontFamily:"'DM Sans', sans-serif", lineHeight:1.75, fontWeight:300 }}>
          Six specialized engines. Each crafted for a different creative vision.
        </p>

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
          {['all','free','premium'].map(f => (
            <button key={f} className={`ms-filter-btn${activeFilter===f?' active':''}`}
              onClick={() => setActiveFilter(f)}>
              {f === 'all' ? '✦ All Models' : f === 'free' ? '⚡ Free' : '✦ Premium'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cards Grid ── */}
      <div className="ms-grid" style={{
        display:'grid',
        gridTemplateColumns:'repeat(3, 1fr)',
        gap:16, width:'100%', maxWidth:1020,
        position:'relative', zIndex:1,
      }}>
        {filtered.map((m, i) => {
          const isHov = hovered === m.key;
          return (
            <div key={m.key} className="ms-card"
              onClick={() => onSelect(m.key)}
              onMouseEnter={() => setHovered(m.key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                borderRadius:20, overflow:'hidden',
                background: isHov
                  ? `linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))`
                  : 'rgba(255,255,255,0.03)',
                border:`1px solid ${isHov ? m.color+'66' : 'rgba(255,255,255,0.07)'}`,
                boxShadow: isHov
                  ? `0 30px 80px ${m.glow}, 0 0 0 1px ${m.color}22, inset 0 1px 0 rgba(255,255,255,0.08)`
                  : '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
                animation:`cardIn 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 0.07}s both`,
                backdropFilter:'blur(16px)',
              }}>

              {/* Top accent line */}
              <div style={{
                height:2,
                background:`linear-gradient(90deg, transparent, ${m.color}, ${m.color}44, transparent)`,
                opacity: isHov ? 1 : 0.35,
                transition:'opacity 0.3s',
              }} />

              {/* Glow spot on hover */}
              {isHov && (
                <div style={{
                  position:'absolute', top:0, left:'50%', transform:'translateX(-50%)',
                  width:'80%', height:120,
                  background:`radial-gradient(ellipse at top, ${m.color}20, transparent 70%)`,
                  pointerEvents:'none',
                }} />
              )}

              {/* Card Header */}
              <div style={{ padding:'22px 22px 18px', background:`linear-gradient(160deg, ${m.gradFrom}, transparent 80%)` }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:11 }}>
                    {/* Icon */}
                    <div style={{
                      width:46, height:46, borderRadius:14,
                      background:`linear-gradient(135deg, ${m.color}dd, ${m.color}77)`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:20,
                      boxShadow:`0 6px 20px ${m.glow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
                    }}>{m.icon}</div>
                    <div>
                      <div style={{ fontSize:9, fontWeight:700, color:m.accent, letterSpacing:'0.12em', marginBottom:3, fontFamily:"'DM Sans', sans-serif", opacity:0.8 }}>{m.tag}</div>
                      <div style={{ fontSize:18, fontWeight:800, color:'#fff', fontFamily:"'Bricolage Grotesque', sans-serif", letterSpacing:'-0.5px', lineHeight:1.1 }}>{m.name}</div>
                    </div>
                  </div>
                  {m.badge && (
                    <span style={{
                      fontSize:8, fontWeight:700, padding:'3px 8px', borderRadius:6,
                      background:`${m.color}18`, color:m.accent,
                      border:`1px solid ${m.color}33`,
                      letterSpacing:'0.1em', whiteSpace:'nowrap', marginTop:2,
                      fontFamily:"'DM Sans', sans-serif",
                    }}>{m.badge}</span>
                  )}
                </div>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.7, fontFamily:"'DM Sans', sans-serif", margin:0, fontWeight:300 }}>{m.desc}</p>
              </div>

              {/* Divider */}
              <div style={{ height:1, background:`linear-gradient(90deg, transparent, ${m.color}22, transparent)`, margin:'0 22px' }} />

              {/* Features + CTA */}
              <div style={{ padding:'16px 22px 20px' }}>
                <div style={{ display:'flex', flexDirection:'column', gap:7, marginBottom:18 }}>
                  {m.features.map((f, fi) => (
                    <div key={fi} style={{ display:'flex', alignItems:'center', gap:9 }}>
                      <div style={{
                        width:16, height:16, borderRadius:5,
                        background:`${m.color}18`, border:`1px solid ${m.color}33`,
                        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                      }}>
                        <div style={{ width:4, height:4, borderRadius:'50%', background:m.accent }} />
                      </div>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontFamily:"'DM Sans', sans-serif", fontWeight:400 }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div style={{
                  padding:'10px 14px', borderRadius:12,
                  background: isHov
                    ? `linear-gradient(135deg, ${m.color}, ${m.color}bb)`
                    : `${m.color}14`,
                  border:`1px solid ${m.color}${isHov ? '00' : '2a'}`,
                  display:'flex', alignItems:'center', justifyContent:'space-between',
                  transition:'all 0.25s',
                  boxShadow: isHov ? `0 8px 24px ${m.glow}` : 'none',
                }}>
                  <span style={{
                    fontSize:12, fontWeight:700,
                    color: isHov ? '#fff' : m.accent,
                    fontFamily:"'DM Sans', sans-serif",
                    letterSpacing:'0.02em',
                  }}>
                    {m.free ? 'Start for free' : 'Get started'} →
                  </span>
                  <div style={{
                    width:26, height:26, borderRadius:8,
                    background: isHov ? 'rgba(255,255,255,0.2)' : `${m.color}20`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'all 0.25s',
                  }}>
                    <span style={{ fontSize:11, color: isHov ? '#fff' : m.accent }}>→</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showModel3Modal && <Model3PaymentModal onClose={() => setShowModel3Modal(false)} onSuccess={() => setShowModel3Modal(false)} />}

      <p style={{ marginTop:40, fontSize:11, color:'rgba(255,255,255,0.18)', textAlign:'center', fontFamily:"'DM Sans', sans-serif", letterSpacing:'0.05em' }}>
        Models 1 & 2 are free · Models 3, 4, Cinematic & Atlas require a plan
      </p>
    </div>
  );
}

// ── Main Form ───────────────────────────────────────────────────────────────
export default function InputPage({ onSubmit, model3Access = false, model4Access = false, model5Access = false, model6Access = false }) {
  const [selectedModel, setSelectedModel] = useState(null);
  const [mode, setMode] = useState('idea');
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [voiceAudioUrl, setVoiceAudioUrl] = useState(null);
  const [tone, setTone] = useState('Motivational');
  const [voice, setVoice] = useState('male_american');
  const [voiceGenderFilter, setVoiceGenderFilter] = useState('all');
  const [showIdeaPrompts, setShowIdeaPrompts] = useState(false);
  const [showScriptPrompts, setShowScriptPrompts] = useState(false);
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState('1min');
  const [music, setMusic] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [soundEffects, setSoundEffects] = useState(false);
  const [transitions, setTransitions] = useState(true);
  const [videoLanguage, setVideoLanguage] = useState('en');
  const [captionStyle, setCaptionStyle] = useState('classic');
  const [videoEffect, setVideoEffect] = useState('none');

  // ── Load template prompt if coming from Templates page ──
  useEffect(() => {
    const templatePrompt = localStorage.getItem('erivion_template_prompt');
    const templateModel = localStorage.getItem('erivion_template_model');
    if (templatePrompt) {
      if (templatePrompt.length > 100) {
        setMode('script');
        setScript(templatePrompt);
      } else {
        setMode('idea');
        setIdea(templatePrompt);
      }
      localStorage.removeItem('erivion_template_prompt');
      localStorage.removeItem('erivion_template_model');
    }
  }, []);

  if (!selectedModel) return (
    <ModelSelector
      onSelect={(model) => {
        if (model === 'model3') { onSubmit({ videoType: 'model3' }); return; }
        if (model === 'model4') { onSubmit({ videoType: 'model4' }); return; }
        if (model === 'model5') { onSubmit({ videoType: 'model5' }); return; }
        if (model === 'model6') { setSelectedModel('model6'); return; }
        setSelectedModel(model);
      }}
      model3Access={model3Access}
      model4Access={model4Access}
      model5Access={model5Access}
      model6Access={model6Access}
    />
  );

  // ── Model 6: Atlas Map Video Form ──
  if (selectedModel === 'model6') {
    return <MapVideoForm onSubmit={onSubmit} onBack={() => setSelectedModel(null)} />;
  }

  const isAI = selectedModel === 'ai';
  const accentColor = isAI ? 'var(--accent)' : '#06b6d4';
  const accentBg = isAI ? 'var(--accent-bg)' : 'rgba(6,182,212,0.1)';
  const modelLabel = isAI ? '🎨 Model 1 — AI Slices' : '🎬 Model 2 — Pexels Clips';

  const canSubmit = mode === 'idea' ? idea.trim().length > 5 : mode === 'voice' ? false : script.trim().length > 20;

  const getSmartDuration = () => {
    if ((mode !== 'script' && mode !== 'voice') || !script.trim()) return duration;
    const words = script.trim().split(/\s+/).length;
    const estimatedSeconds = Math.round(words / 2.5);
    if (estimatedSeconds <= 35) return '30s';
    if (estimatedSeconds <= 70) return '1min';
    if (estimatedSeconds <= 140) return '2min';
    if (estimatedSeconds <= 200) return '3min';
    if (estimatedSeconds <= 270) return '4min';
    if (estimatedSeconds <= 330) return '5min';
    if (estimatedSeconds <= 520) return '8min';
    return '10min';
  };

  const handleSubmit = () => {
    const smartDuration = (mode === 'script' || mode === 'voice') ? getSmartDuration() : duration;
    onSubmit({
      mode: mode === 'voice' ? 'script' : mode,
      idea, script,
      tone: tone.toLowerCase(),
      voice: voice.toLowerCase(),
      ratio, duration: smartDuration,
      music, captions, soundEffects, transitions,
      videoLanguage, captionStyle, videoEffect,
      videoType: isAI ? 'ai_slices' : 'pexels_clips',
      uploadedAudioUrl: mode === 'voice' ? voiceAudioUrl : null,
    });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(20px,4vw,40px) clamp(12px,4vw,16px) 60px', position: 'relative', background: 'radial-gradient(ellipse at top, rgba(124,106,247,0.06) 0%, transparent 50%)' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        @keyframes fadeUp   { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer  { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        @keyframes gradShift{ 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes pulse    { 0%,100%{box-shadow:0 0 0 0 ${isAI ? 'rgba(124,106,247,0.4)' : 'rgba(6,182,212,0.4)'}; } 50%{box-shadow:0 0 0 8px transparent;} }

        .input-field {
          background: rgba(255,255,255,0.04) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          color: var(--text) !important;
          font-family: 'Plus Jakarta Sans', sans-serif !important;
          transition: all 0.2s !important;
          border-radius: 12px !important;
        }
        .input-field:focus {
          border-color: ${accentColor} !important;
          box-shadow: 0 0 0 3px ${isAI ? 'rgba(124,106,247,0.12)' : 'rgba(6,182,212,0.12)'}, 0 0 20px ${isAI ? 'rgba(124,106,247,0.08)' : 'rgba(6,182,212,0.08)'} !important;
          background: rgba(255,255,255,0.06) !important;
          outline: none !important;
        }
        .input-field::placeholder { color: rgba(255,255,255,0.2) !important; }

        .card-section {
          background: rgba(255,255,255,0.025) !important;
          border: 1px solid rgba(255,255,255,0.07) !important;
          border-radius: 18px !important;
          backdrop-filter: blur(10px) !important;
          transition: border-color 0.2s !important;
        }
        .card-section:hover { border-color: rgba(255,255,255,0.11) !important; }

        .mode-btn-active { animation: pulse 2s ease infinite; }

        .submit-glow {
          background: linear-gradient(135deg, ${isAI ? '#7c6af7, #a08ff8' : '#06b6d4, #22d3ee'}) !important;
          box-shadow: 0 4px 24px ${isAI ? 'rgba(124,106,247,0.4)' : 'rgba(6,182,212,0.4)'} !important;
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1) !important;
          position: relative; overflow: hidden;
        }
        .submit-glow:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.01) !important;
          box-shadow: 0 8px 36px ${isAI ? 'rgba(124,106,247,0.55)' : 'rgba(6,182,212,0.55)'} !important;
        }
        .submit-glow:disabled { opacity: 0.45 !important; cursor: not-allowed !important; box-shadow: none !important; }

        .prompt-chip {
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1) !important;
        }
        .prompt-chip:hover { transform: translateY(-1px) !important; background: rgba(255,255,255,0.07) !important; border-color: rgba(255,255,255,0.15) !important; }

        .voice-card {
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1) !important;
        }
        .voice-card:hover { transform: translateY(-2px) !important; }
      `}</style>

      <div style={{ width:'100%', maxWidth:600, display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28, animation:'fadeUp 0.4s ease forwards' }}>
        <button onClick={() => setSelectedModel(null)} style={{ display:'flex', alignItems:'center', gap:8, background:'transparent', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:13, padding:0 }}>← Change model</button>
        <div style={{ padding:'5px 14px', borderRadius:999, fontSize:12, fontWeight:700, background: accentBg, border:`1px solid ${isAI ? 'rgba(124,106,247,0.3)' : 'rgba(6,182,212,0.3)'}`, color: accentColor }}>{modelLabel}</div>
      </div>

      <div style={{ width:'100%', maxWidth:600, animation:'fadeUp 0.5s ease 0.05s both' }}>
        <div style={{ display:'flex', gap:4, marginBottom:24, background:'rgba(255,255,255,0.04)', borderRadius:14, padding:5, border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(10px)' }}>
          {[['idea','💡 Idea'],['script','📝 Script'],['voice','🎙️ Voice']].map(([m,label]) => (
            <button key={m} onClick={() => setMode(m)}
              className={mode===m ? 'mode-btn-active' : ''}
              style={{ flex:1, padding:'11px', borderRadius:10, border:'none', fontWeight:700, fontSize:13, cursor:'pointer', transition:'all 0.2s cubic-bezier(0.16,1,0.3,1)', background: mode===m ? `linear-gradient(135deg, ${isAI ? '#7c6af7, #a08ff8' : '#06b6d4, #22d3ee'})` : 'transparent', color: mode===m ? '#fff' : 'rgba(255,255,255,0.4)', boxShadow: mode===m ? `0 4px 16px ${isAI ? 'rgba(124,106,247,0.35)' : 'rgba(6,182,212,0.35)'}` : 'none', fontFamily:"'Plus Jakarta Sans', sans-serif" }}>{label}</button>
          ))}
        </div>

        <div className="card-section" style={{ padding:24, marginBottom:16 }}>
          {mode === 'idea' && (
            <Field label="Your Idea">
              <textarea value={idea} onChange={e => setIdea(e.target.value)} className="input-field" placeholder="A motivational video for entrepreneurs about never giving up on their dreams..." rows={4} style={{ width:'100%', resize:'none', padding:'12px 14px', lineHeight:1.65, borderRadius:10, border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text)', fontSize:14, fontFamily:'inherit', outline:'none', transition:'all 0.15s' }} autoFocus />
              <p style={{ fontSize:11, color:'var(--text3)', marginTop:6 }}>{idea.length > 0 ? `${idea.length} characters` : 'Describe your video in 1–2 sentences'}</p>
              <div style={{ marginTop:10 }}>
                <button onClick={() => setShowIdeaPrompts(p => !p)} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', fontSize:12, color:'var(--text3)', cursor:'pointer' }}>{showIdeaPrompts ? '▲ Hide examples' : '✨ Show example ideas'}</button>
                {showIdeaPrompts && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
                    {IDEA_PROMPTS.map((p, i) => <button key={i} onClick={() => { setIdea(p.text); setShowIdeaPrompts(false); }} style={{ padding:'6px 12px', borderRadius:999, fontSize:12, fontWeight:600, border:`1px solid ${accentColor}44`, background: accentBg, color: accentColor, cursor:'pointer' }}>{p.label}</button>)}
                  </div>
                )}
              </div>
            </Field>
          )}
          {mode === 'script' && (
            <Field label="Your Script">
              <textarea value={script} onChange={e => setScript(e.target.value)} className="input-field" placeholder={"Hook: Have you ever felt like giving up?\n\nBody: Every great journey starts with a single step...\n\nEnding: Start today. The only limit is you."} rows={7} style={{ width:'100%', resize:'vertical', padding:'12px 14px', lineHeight:1.65, borderRadius:10, border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text)', fontSize:14, fontFamily:'inherit', outline:'none', transition:'all 0.15s' }} autoFocus />
              <div style={{ marginTop:10 }}>
                <button onClick={() => setShowScriptPrompts(p => !p)} style={{ background:'transparent', border:'1px solid var(--border)', borderRadius:8, padding:'5px 12px', fontSize:12, color:'var(--text3)', cursor:'pointer' }}>{showScriptPrompts ? '▲ Hide examples' : '✨ Show example scripts'}</button>
                {showScriptPrompts && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:10 }}>
                    {SCRIPT_PROMPTS.map((p, i) => <button key={i} onClick={() => { setScript(p.text); setShowScriptPrompts(false); }} style={{ padding:'6px 12px', borderRadius:999, fontSize:12, fontWeight:600, border:`1px solid ${accentColor}44`, background: accentBg, color: accentColor, cursor:'pointer' }}>{p.label}</button>)}
                  </div>
                )}
              </div>
            </Field>
          )}
          {mode === 'voice' && (
            <Field label="Voice Recording → Video">
              <VoiceUpload accentColor={accentColor} accentBg={accentBg} videoLanguage={videoLanguage}
                onTranscribed={(text, audioUrl) => {
                  setScript(text); setVoiceAudioUrl(audioUrl);
                  const words = text.trim().split(/\s+/).length;
                  const secs = Math.round(words / 2.5);
                  let smartDuration = '1min';
                  if (secs <= 35) smartDuration = '30s';
                  else if (secs <= 70) smartDuration = '1min';
                  else if (secs <= 140) smartDuration = '2min';
                  else if (secs <= 200) smartDuration = '3min';
                  else if (secs <= 270) smartDuration = '4min';
                  else if (secs <= 330) smartDuration = '5min';
                  else if (secs <= 520) smartDuration = '8min';
                  else smartDuration = '10min';
                  onSubmit({ mode:'script', idea:'', script:text, tone:tone.toLowerCase(), voice:'none', ratio, duration:smartDuration, music, captions, soundEffects, transitions, videoLanguage, captionStyle, videoEffect, videoType: isAI ? 'ai_slices' : 'pexels_clips', uploadedAudioUrl: audioUrl });
                }}
              />
            </Field>
          )}
        </div>

        {mode !== 'voice' && (
          <>
            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:24, marginBottom:16 }}>
              <Field label="Tone"><PillGroup options={TONES} value={tone} onChange={setTone} /></Field>
              <Field label="Video Language">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                  {VIDEO_LANGUAGES.map(lang => (
                    <div key={lang.code} onClick={() => setVideoLanguage(lang.code)} style={{ padding:'8px 4px', borderRadius:10, cursor:'pointer', textAlign:'center', border:'1px solid ' + (videoLanguage===lang.code ? accentColor : 'var(--border)'), background: videoLanguage===lang.code ? accentBg : 'var(--bg3)', transition:'all 0.15s' }}>
                      <div style={{ fontSize:18, marginBottom:2 }}>{lang.flag}</div>
                      <div style={{ fontSize:10, color: videoLanguage===lang.code ? accentColor : 'var(--text3)', fontWeight:600 }}>{lang.label}</div>
                    </div>
                  ))}
                </div>
              </Field>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20, marginBottom:22 }}>
                <div><Label>Aspect Ratio</Label><PillGroup options={RATIOS} value={ratio} onChange={setRatio} /></div>
                <div>
                  <Label>Duration {mode === 'script' && <span style={{ color:'var(--accent2)', fontWeight:600, fontSize:10 }}>· AUTO for script</span>}</Label>
                  {mode === 'script' && script.length > 20 && <div style={{ marginBottom:8, padding:'6px 10px', borderRadius:8, background:'var(--accent-bg)', border:'1px solid rgba(124,106,247,0.2)', fontSize:11, color:'var(--accent2)' }}>✨ Auto-detected: ~{getSmartDuration()}</div>}
                  <select value={mode === 'script' && script.length > 20 ? getSmartDuration() : duration} onChange={e => setDuration(e.target.value)} style={{ width:'100%', padding:'9px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg3)', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none' }}>
                    <option value="30s">30 seconds (4 scenes)</option>
                    <option value="1min">1 minute (8 scenes)</option>
                    <option value="2min">2 minutes (17 scenes)</option>
                    <option value="3min">3 minutes (26 scenes)</option>
                    <option value="4min">4 minutes (34 scenes)</option>
                    <option value="5min">5 minutes (42 scenes)</option>
                    <option value="8min">8 minutes (56 scenes)</option>
                    <option value="10min">10 minutes (70 scenes)</option>
                  </select>
                </div>
              </div>
              <Field label="Voice">
                <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                  {[['all','All'],['male','Male'],['female','Female']].map(([f,l]) => <button key={f} onClick={() => setVoiceGenderFilter(f)} style={{ padding:'5px 14px', borderRadius:999, fontSize:12, fontWeight:600, border:'none', cursor:'pointer', background: voiceGenderFilter===f ? accentColor : 'var(--bg3)', color: voiceGenderFilter===f ? '#fff' : 'var(--text3)' }}>{l}</button>)}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px,1fr))', gap:8 }}>
                  {VOICE_OPTIONS.filter(v => voiceGenderFilter === 'all' || v.gender === voiceGenderFilter || v.gender === 'none').map(v => (
                    <div key={v.key} onClick={() => setVoice(v.key)} style={{ padding:'10px 10px', borderRadius:10, cursor:'pointer', textAlign:'center', border:'1px solid ' + (voice===v.key ? accentColor : 'var(--border)'), background: voice===v.key ? accentBg : 'var(--bg3)', transition:'all 0.15s' }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{v.emoji}</div>
                      <div style={{ fontSize:11, fontWeight:700, color: voice===v.key ? accentColor : 'var(--text)', marginBottom:2 }}>{v.label}</div>
                      <div style={{ fontSize:9, color:'var(--text3)', lineHeight:1.3 }}>{v.desc}</div>
                    </div>
                  ))}
                </div>
              </Field>
            </div>

            <div style={{ background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:16, padding:24, marginBottom:16 }}>
              <Label>Video Options</Label>
              <Toggle label="🎵 Background Music" value={music} onChange={setMusic} description="Adds ambient music to your video" />
              <Toggle label="💬 Captions" value={captions} onChange={setCaptions} description="Adds subtitles synced to voiceover" />
              <Toggle label="🎬 Transitions" value={transitions} onChange={setTransitions} description="Smooth fade transitions between scenes" />
              <Toggle label="🔊 Sound Effects" value={soundEffects} onChange={setSoundEffects} description="Intro & outro sound effects" />
              {captions && (
                <div style={{ marginTop:14 }}>
                  <Label>Caption Style</Label>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                    {[{ id:'classic', label:'Classic', desc:'White on dark' },{ id:'bold_yellow', label:'Bold Yellow', desc:'High contrast' },{ id:'center_box', label:'Center Box', desc:'Boxed style' },{ id:'documentary', label:'Documentary', desc:'Green tint' },{ id:'clean_white', label:'Clean White', desc:'Minimal' }].map(s => (
                      <div key={s.id} onClick={() => setCaptionStyle(s.id)} style={{ padding:'10px', borderRadius:10, cursor:'pointer', textAlign:'center', border:'1px solid ' + (captionStyle===s.id ? accentColor : 'var(--border)'), background: captionStyle===s.id ? accentBg : 'var(--bg3)', transition:'all 0.15s' }}>
                        <div style={{ fontSize:12, fontWeight:600, color: captionStyle===s.id ? accentColor : 'var(--text)', marginBottom:2 }}>{s.label}</div>
                        <div style={{ fontSize:10, color:'var(--text3)' }}>{s.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ marginTop:16 }}>
                <Label>Video Effect</Label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {[{ id:'none', label:'None', emoji:'🎞️' },{ id:'cinematic', label:'Cinematic', emoji:'🎬' },{ id:'grayscale', label:'Grayscale', emoji:'⬛' },{ id:'sepia', label:'Sepia', emoji:'🟤' },{ id:'vignette', label:'Vignette', emoji:'🔲' },{ id:'brightness', label:'Bright', emoji:'☀️' }].map(e => (
                    <div key={e.id} onClick={() => setVideoEffect(e.id)} style={{ padding:'10px 8px', borderRadius:10, cursor:'pointer', textAlign:'center', border:'1px solid ' + (videoEffect===e.id ? accentColor : 'var(--border)'), background: videoEffect===e.id ? accentBg : 'var(--bg3)', transition:'all 0.15s' }}>
                      <div style={{ fontSize:16, marginBottom:3 }}>{e.emoji}</div>
                      <div style={{ fontSize:11, fontWeight:600, color: videoEffect===e.id ? accentColor : 'var(--text3)' }}>{e.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={handleSubmit} disabled={!canSubmit} style={{ width:'100%', padding:'15px', borderRadius:12, border:'none', fontWeight:700, fontSize:15, background: canSubmit ? accentColor : 'var(--bg3)', color: canSubmit ? '#fff' : 'var(--text3)', cursor: canSubmit ? 'pointer' : 'not-allowed', transition:'all 0.15s', boxShadow: canSubmit ? `0 4px 16px ${isAI ? 'rgba(124,106,247,0.35)' : 'rgba(6,182,212,0.35)'}` : 'none' }}>
              {canSubmit ? `Generate Scenes with ${isAI ? 'Model 1' : 'Model 2'} →` : (mode === 'idea' ? 'Enter your idea to continue' : 'Paste your script to continue')}
            </button>
            <p style={{ textAlign:'center', fontSize:11, color:'var(--text3)', marginTop:16 }}>Powered by Groq AI · {isAI ? 'AI Image Generation' : 'Pexels Stock Footage'} · FFmpeg</p>
          </>
        )}
      </div>
    </div>
  );
}