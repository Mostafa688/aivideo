import React, { useState, useEffect, useRef } from 'react';

const MODEL4_PLANS = {
  m4_plan1: { name: 'Starter', price: 600, price_usd: 18, videos_30s: 10, videos_1min: 1, videos_3min: 0, badge: null },
  m4_plan2: { name: 'Creator', price: 1000, price_usd: 28, videos_30s: 3, videos_1min: 10, videos_3min: 0, badge: 'Most Popular' },
  m4_plan3: { name: 'Pro', price: 2800, price_usd: 72, videos_30s: 3, videos_1min: 3, videos_3min: 10, badge: 'Best Value' },
};

const MODEL4_GUMROAD = {
  m4_plan1: 'https://digiwhirl23.gumroad.com/l/hqsejc',
  m4_plan2: 'https://digiwhirl23.gumroad.com/l/ckvlgo',
  m4_plan3: 'https://digiwhirl23.gumroad.com/l/vmzubx',
};

const DURATION_CONFIG = {
  '30s':  { scenes: 4,  label: '30 seconds', sublabel: '4 AI video clips' },
  '1min': { scenes: 8,  label: '1 minute',   sublabel: '8 AI video clips' },
  '3min': { scenes: 24, label: '3 minutes',  sublabel: '24 AI video clips' },
};

// ── Usage Bar ──────────────────────────────────────────────────────────────
function UsageBar({ label, used, quota }) {
  if (quota === 0) return null;
  const pct = Math.min((used / quota) * 100, 100);
  const color = pct >= 100 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>{used} / {quota} used</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: `linear-gradient(90deg, ${color}, ${color}99)`, borderRadius: 99, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

// ── Payment Modal ──────────────────────────────────────────────────────────
function PaymentModal({ onClose }) {
  const [selectedPlan, setSelectedPlan] = useState('m4_plan1');
  const [step, setStep] = useState('select');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [intlDone, setIntlDone] = useState(false);
  const fileRef = useRef();
  const region = localStorage.getItem('erivion_region') || 'eg';
  const selected = MODEL4_PLANS[selectedPlan];

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setScreenshot(ev.target.result); setScreenshotPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText('01091917832');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!screenshot || !email) { setError('Please upload your screenshot and enter your email'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/model4/payment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ plan: selectedPlan, planName: selected.name, amount: selected.price_offer || selected.price, userEmail: email, screenshot }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setStep('done');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(6px)' }}>
      <div style={{ background: '#0d0d1a', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '92vh', overflowY: 'auto', padding: 28 }}>
        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>Request Submitted!</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>We'll review your payment and activate your plan within a few hours.<br />You'll receive a confirmation email.</p>
            <button onClick={onClose} style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Got it!</button>
          </div>
        ) : step === 'intl' ? (
          <div style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
              <button onClick={() => setStep('select')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20 }}>←</button>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: 0 }}>🎬 {selected.name} — International</h3>
                <p style={{ fontSize: 13, color: '#a855f7', margin: '2px 0 0', fontWeight: 700 }}>${selected.price_usd}/month</p>
              </div>
              <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20 }}>✕</button>
            </div>
            {intlDone ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>⏳</div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Request Submitted!</h3>
                <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>We'll verify your Gumroad payment and activate your plan within <strong style={{ color: '#22c55e' }}>24 hours</strong>.</p>
                <button onClick={onClose} style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: 12, padding: '13px 36px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Got it! 🚀</button>
              </div>
            ) : (
              <>
                <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14, padding: 18, marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', margin: '0 0 14px' }}>💳 How to subscribe:</p>
                  {['Click "Pay on Gumroad" below', 'Complete payment with your card', "Come back here and click \"I've Paid\"", "We'll verify and activate within 24h"].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#c084fc', flexShrink: 0 }}>{i + 1}</div>
                      <span style={{ fontSize: 13, color: '#d1d5db' }}>{s}</span>
                    </div>
                  ))}
                </div>
                <a href={MODEL4_GUMROAD[selectedPlan]} target="_blank" rel="noreferrer"
                  style={{ display: 'block', width: '100%', padding: '14px', borderRadius: 12, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
                  🔗 Pay on Gumroad — ${selected.price_usd}
                </a>
                <button onClick={async () => {
                  try {
                    const res = await fetch('/api/auth/intl-payment/request', {
                      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
                      body: JSON.stringify({ planKey: selectedPlan, planName: 'Model 4 ' + selected.name, usdPrice: selected.price_usd }),
                    });
                    if (res.ok) setIntlDone(true);
                  } catch (e) {}
                }}
                  style={{ width: '100%', padding: '13px', borderRadius: 12, border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(255,255,255,0.04)', color: '#c084fc', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                  ✅ I've Paid — Notify Admin
                </button>
              </>
            )}
          </div>
        ) : step === 'select' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#fff' }}>Choose Your Plan</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>Model 4 — Seedance AI Video</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {Object.entries(MODEL4_PLANS).map(([key, plan]) => (
                <div key={key} onClick={() => setSelectedPlan(key)}
                  style={{ border: `2px solid ${selectedPlan === key ? '#a855f7' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', background: selectedPlan === key ? 'rgba(168,85,247,0.08)' : 'transparent', transition: 'all 0.15s', position: 'relative' }}>
                  {plan.badge && <div style={{ position: 'absolute', top: -10, right: 14, padding: '2px 10px', borderRadius: 999, background: '#a855f7', fontSize: 10, fontWeight: 700, color: '#fff' }}>{plan.badge}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: selectedPlan === key ? '#c084fc' : '#fff' }}>{plan.name}</span>
                    <div>
                      {plan.price_offer && <span style={{ fontSize: 12, color: '#4b5563', textDecoration: 'line-through', marginRight: 6 }}>{plan.price} EGP</span>}
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#22c55e' }}>{region === 'intl' ? `$${plan.price_usd}` : (plan.price_offer || plan.price)}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>{region === 'intl' ? ' USD' : ' EGP'}</span>
                      {plan.price_offer && region !== 'intl' && <div style={{ fontSize: 10, color: '#f59e0b' }}>first month</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {plan.videos_30s > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 10px', borderRadius: 20 }}>📹 {plan.videos_30s} × 30s</span>}
                    {plan.videos_1min > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 10px', borderRadius: 20 }}>📹 {plan.videos_1min} × 1min</span>}
                    {plan.videos_3min > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 10px', borderRadius: 20 }}>📹 {plan.videos_3min} × 3min</span>}
                    <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 10px', borderRadius: 20 }}>✨ Captions + Music</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => region === 'intl' ? setStep('intl') : setStep('pay')}
              style={{ width: '100%', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 20px rgba(168,85,247,0.4)' }}>
              {region === 'intl' ? `Pay $${MODEL4_PLANS[selectedPlan].price_usd} — Gumroad →` : `Subscribe to ${MODEL4_PLANS[selectedPlan].name} →`}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <button onClick={() => setStep('select')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>← Back</button>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff' }}>Complete Payment</h2>
                <p style={{ margin: 0, fontSize: 12, color: '#a855f7' }}>{selected.name} — {selected.price_offer || selected.price} EGP</p>
              </div>
            </div>
            <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', margin: '0 0 12px' }}>💳 Payment Steps</p>
              {['Open InstaPay app', `Transfer ${selected.price_offer || selected.price} EGP to:`, 'Screenshot the transfer', 'Upload below ⬇️'].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(168,85,247,0.2)', border: '1px solid rgba(168,85,247,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#c084fc', flexShrink: 0 }}>{i + 1}</div>
                  <span style={{ fontSize: 13, color: '#d1d5db' }}>{s}</span>
                </div>
              ))}
              <div style={{ margin: '12px 0 0', padding: '12px 16px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 1 }}>01091917832</span>
                <button onClick={handleCopy} style={{ padding: '6px 14px', borderRadius: 8, background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(168,85,247,0.2)', border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(168,85,247,0.4)'}`, color: copied ? '#22c55e' : '#c084fc', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <input type="email" placeholder="Your email address *" value={email} onChange={e => setEmail(e.target.value)}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
              <div onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${screenshotPreview ? '#22c55e' : 'rgba(168,85,247,0.3)'}`, borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer' }}>
                {screenshotPreview
                  ? <img src={screenshotPreview} alt="receipt" style={{ maxHeight: 120, borderRadius: 8, maxWidth: '100%' }} />
                  : <><div style={{ fontSize: 32, marginBottom: 8 }}>📎</div><p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Click to upload transfer screenshot</p></>}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
              </div>
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

// ── Editable Scene Card ────────────────────────────────────────────────────
function EditableSceneCard({ scene, index, onChange }) {
  const [editingText, setEditingText] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [localText, setLocalText] = useState(scene.text);
  const [localPrompt, setLocalPrompt] = useState(scene.prompt);

  const saveText = () => {
    setEditingText(false);
    if (localText.trim()) onChange({ ...scene, text: localText.trim() });
  };

  const savePrompt = () => {
    setEditingPrompt(false);
    if (localPrompt.trim()) onChange({ ...scene, prompt: localPrompt.trim() });
  };

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
        <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>#{index + 1}</span>
        {editingText ? (
          <textarea
            value={localText}
            onChange={e => setLocalText(e.target.value)}
            onBlur={saveText}
            autoFocus
            rows={3}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.07)', color: '#fff', fontSize: 13, lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
          />
        ) : (
          <p
            onClick={() => setEditingText(true)}
            title="Click to edit"
            style={{ margin: 0, fontSize: 13, color: '#d1d5db', lineHeight: 1.6, flex: 1, cursor: 'text' }}
          >{scene.text}</p>
        )}
        <button
          onClick={() => { setLocalText(scene.text); setEditingText(!editingText); }}
          style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          {editingText ? 'Done' : 'Edit'}
        </button>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, color: '#4b5563', flexShrink: 0, marginTop: 2 }}>🎬</span>
        {editingPrompt ? (
          <textarea
            value={localPrompt}
            onChange={e => setLocalPrompt(e.target.value)}
            onBlur={savePrompt}
            autoFocus
            rows={3}
            style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)', color: '#9ca3af', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5, resize: 'none', outline: 'none' }}
          />
        ) : (
          <p
            onClick={() => setEditingPrompt(true)}
            title="Click to edit prompt"
            style={{ margin: 0, fontSize: 11, color: '#4b5563', fontFamily: 'monospace', lineHeight: 1.5, flex: 1, cursor: 'text' }}
          >{scene.prompt}</p>
        )}
        <button
          onClick={() => { setLocalPrompt(scene.prompt); setEditingPrompt(!editingPrompt); }}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          {editingPrompt ? 'Done' : 'Edit'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Model4Page({ onBack, model4Plan, model4Access, onNavigate }) {
  const [mode, setMode] = useState('idea');
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [duration, setDuration] = useState('30s');
  const [ratio, setRatio] = useState('9:16');
  const [videoLanguage, setVideoLanguage] = useState('en');
  const [captions, setCaptions] = useState(true);
  const [music, setMusic] = useState(true);
  const [scenes, setScenes] = useState([]);
  const [step, setStep] = useState('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);

  const [elapsed, setElapsed] = useState(0);
  const [usage, setUsage] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [voiceFile, setVoiceFile] = useState(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceAudioUrl, setVoiceAudioUrl] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const voiceRef = useRef();
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const planData = MODEL4_PLANS[model4Plan] || MODEL4_PLANS.m4_plan1;
  const durConfig = DURATION_CONFIG[duration];

  useEffect(() => { fetchUsage(); }, []);
  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/model4/usage', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
      if (res.ok) setUsage(await res.json());
    } catch {}
  };



  const handleVoiceUpload = async (file) => {
    if (!file) return;
    // Model 4 max: 2min 30sec ≈ 8MB
    if (file.size > 8 * 1024 * 1024) {
      setError('Audio too long. Maximum allowed for Model 4 is 2 minutes 30 seconds.');
      return;
    }
    setVoiceFile(file); setTranscribing(true); setError('');
    try {
      const fd = new FormData();
      fd.append('audio', file);
      fd.append('language', videoLanguage);
      fd.append('model', 'model4');
      const res = await fetch('/api/transcribe', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');
      setVoiceTranscript(data.text);
      setVoiceAudioUrl(data.audioUrl);
      // auto duration from voice chars
      const vChars = (data.text || '').trim().length;
      const vDur = vChars <= 300 ? '30s' : vChars <= 600 ? '1min' : '3min';
      setDuration(vDur);
    } catch (e) { setError(e.message); } finally { setTranscribing(false); }
  };

  const handleGenerateScenes = async () => {
    const inputText = mode === 'idea' ? idea : mode === 'script' ? script : voiceTranscript;
    if (!inputText?.trim()) { setError('Please enter your idea or script first'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/model4/generate-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ idea: mode === 'idea' ? inputText : undefined, script: mode !== 'idea' ? inputText : undefined, inputMode: mode === 'idea' ? 'idea' : 'script', sceneCount: mode === 'script' ? (DURATION_CONFIG[getSmartDuration()]?.scenes || durConfig.scenes) : durConfig.scenes, videoLanguage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setScenes(data.scenes || []);
      setStep('scenes');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleRender = async () => {
    setLoading(true); setError(''); setElapsed(0);
    try {
      const res = await fetch('/api/model4/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ scenes, audioUrl: mode === 'voice' ? voiceAudioUrl : null, ratio, captions, music, videoLanguage, duration: mode === 'script' ? getSmartDuration() : duration, inputMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.show_upgrade || data.error === 'subscribe_required' || data.error === 'no_access' || data.error === 'quota_exceeded') {
          setError(data.message || 'Please subscribe to continue.');
          setShowPayment(true); setLoading(false); return;
        }
        if (data.error === 'trial_idea_only') {
          setError('Free trial is for Idea mode only. Subscribe to use Script and Voice.');
          setShowPayment(true); setLoading(false); return;
        }
        throw new Error(data.message || data.error || 'Render failed');
      }

      setStep('render');
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch('/api/render-status/' + data.jobId, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
          const sd = await sr.json();
          if (sd.status === 'done') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            setVideoUrl(sd.videoUrl); setStep('done'); fetchUsage();
          } else if (sd.status === 'failed') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            setError(sd.error || 'Render failed'); setStep('scenes');
          }
        } catch {}
      }, 5000);
    } catch (e) { setError(e.message); setStep('scenes'); } finally { setLoading(false); }
  };

  const allowedDurations = model4Access
    ? Object.keys(DURATION_CONFIG).filter(d => {
        const k = d === '30s' ? 'videos_30s' : d === '1min' ? 'videos_1min' : 'videos_3min';
        return (planData[k] || 0) > 0;
      })
    : [];

  // ── Done ──────────────────────────────────────────────────────────────
  if (step === 'done' && videoUrl) {
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(168,85,247,0.07) 0%, #080810 55%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes pop{0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
        <div style={{ maxWidth:580, width:'100%', textAlign:'center', animation:'fadeUp 0.5s ease' }}>
          <div style={{ fontSize:60, marginBottom:14, animation:'pop 0.5s ease' }}>🎉</div>
          <h2 style={{ fontSize:28, fontWeight:800, color:'#fff', marginBottom:6, letterSpacing:'-0.5px' }}>Video Ready!</h2>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:14, marginBottom:20 }}>Seedance AI · {durConfig.scenes} clips · {durConfig.label}</p>
          <div style={{ borderRadius:18, overflow:'hidden', border:'1px solid rgba(168,85,247,0.2)', marginBottom:20, background:'#000', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <video src={videoUrl} controls style={{ width:'100%', maxHeight:420, display:'block' }} />
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
            <a href={videoUrl} download style={{ background:'linear-gradient(135deg,#a855f7,#7c3aed)', color:'#fff', padding:'13px 28px', borderRadius:12, fontWeight:700, fontSize:14, textDecoration:'none', boxShadow:'0 4px 20px rgba(168,85,247,0.4)' }}>⬇️ Download</a>
            <button onClick={() => { setStep('input'); setScenes([]); setVideoUrl(null); setIdea(''); setScript(''); }}
              style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.1)', padding:'13px 28px', borderRadius:12, fontWeight:600, fontSize:14, cursor:'pointer' }}>🔄 New Video</button>
          </div>
        </div>
        {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
      </div>
    );
  }

  // ── Render Loading ─────────────────────────────────────────────────────
  if (step === 'render') {
    const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at center, rgba(168,85,247,0.07) 0%, #080810 60%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ textAlign:'center', maxWidth:460, animation:'fadeUp 0.4s ease' }}>
          <div style={{ position:'relative', width:96, height:96, margin:'0 auto 32px' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid rgba(168,85,247,0.1)' }} />
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'#a855f7', animation:'spin 0.9s linear infinite' }} />
            <div style={{ position:'absolute', inset:8, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'rgba(168,85,247,0.4)', animation:'spin 1.5s linear infinite reverse' }} />
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30 }}>🎞️</div>
          </div>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:8, letterSpacing:'-0.5px' }}>Generating Your Video</h2>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:14, marginBottom:6 }}>Seedance AI is rendering {durConfig.scenes} video clips</p>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:999, background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.25)', marginBottom:24 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#a855f7', animation:'pulse 1s ease infinite' }} />
            <span style={{ color:'#c084fc', fontSize:13, fontWeight:700 }}>{mins > 0 ? `${mins}m ` : ''}{secs}s elapsed</span>
          </div>
          <div style={{ background:'rgba(168,85,247,0.05)', border:'1px solid rgba(168,85,247,0.15)', borderRadius:14, padding:'16px 20px', fontSize:13, color:'rgba(255,255,255,0.35)', lineHeight:1.8 }}>
            <div>⏱ ~60 seconds per scene</div>
            <div style={{ color:'rgba(255,255,255,0.2)' }}>Estimated: {durConfig.scenes} minutes total</div>
          </div>
          <p style={{ fontSize:12, color:'rgba(255,255,255,0.15)', marginTop:20, animation:'pulse 2s ease infinite' }}>Do not close this tab</p>
        </div>
      </div>
    );
  }

  // ── Scenes Review ──────────────────────────────────────────────────────
  if (step === 'scenes') {
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(168,85,247,0.06) 0%, #080810 50%)', padding:'clamp(24px,4vw,36px) clamp(16px,4vw,24px) 80px' }}>
        <div style={{ maxWidth:680, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
            <button onClick={() => setStep('input')} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Back</button>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ padding:'5px 12px', borderRadius:999, background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.25)', fontSize:11, color:'#c084fc', fontWeight:700 }}>{scenes.length} scenes · {durConfig.label}</span>
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', margin:'0 0 6px', letterSpacing:'-0.5px' }}>Review Scenes</h2>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', margin:0 }}>Each clip = ~7 seconds of real AI video. Edit text or prompts below.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {scenes.map((scene, i) => (
              <EditableSceneCard
                key={i}
                scene={scene}
                index={i}
                onChange={(updated) => setScenes(s => s.map((sc, idx) => idx === i ? updated : sc))}
              />
            ))}
          </div>
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 12, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>}
          <button onClick={handleRender} disabled={loading}
            style={{ width:'100%', background:loading?'rgba(255,255,255,0.04)':'linear-gradient(135deg,#a855f7,#7c3aed)', color:loading?'#4b5563':'#fff', border:'none', borderRadius:14, padding:'15px', fontWeight:800, fontSize:16, cursor:loading?'not-allowed':'pointer', boxShadow:!loading?'0 6px 24px rgba(168,85,247,0.4)':'none', transition:'all 0.2s' }}>
            {loading ? '⏳ Starting...' : `🎬 Generate ${durConfig.scenes} Video Clips →`}
          </button>
        </div>
        {showPayment && <PaymentModal onClose={() => setShowPayment(false)} />}
      </div>
    );
  }

  // ── Input Screen ───────────────────────────────────────────────────────
  const MAX_SCRIPT_CHARS = 1800; // max = 3min

  const getSmartDuration = () => {
    if (!script.trim()) return duration;
    const chars = script.trim().length;
    if (chars <= 300)  return '30s';
    if (chars <= 600)  return '1min';
    return '3min';
  };
  const scriptCharCount = script.length;
  const scriptOverLimit = mode === 'script' && scriptCharCount > MAX_SCRIPT_CHARS;
  // auto-set duration when script changes
  React.useEffect(() => {
    if (mode === 'script' && script.length > 20) {
      const chars = script.trim().length;
      const smart = chars <= 300 ? '30s' : chars <= 600 ? '1min' : '3min';
      setDuration(smart);
    }
  }, [script, mode]);

  const canGenerate = !loading && !scriptOverLimit && (
    mode === 'idea' ? idea.trim().length > 5 :
    mode === 'script' ? script.trim().length > 20 :
    voiceTranscript.trim().length > 0
  );

  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(168,85,247,0.08) 0%, #080810 50%)', padding:'0 0 80px' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes gradShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes pulse{0%,100%{opacity:0.5}50%{opacity:1}}
        .m4-dur{transition:all 0.2s!important}
        .m4-dur:hover{border-color:rgba(168,85,247,0.5)!important;background:rgba(168,85,247,0.06)!important}
        .m4-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;margin-bottom:16px}
      `}</style>

      {/* Header */}
      <div style={{ padding:'clamp(24px,4vw,36px) clamp(16px,4vw,24px) 20px', position:'relative', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.12) 0%, transparent 65%)', pointerEvents:'none' }} />
        <div style={{ maxWidth:680, margin:'0 auto', position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Models</button>
            {model4Access && <div style={{ padding:'6px 14px', borderRadius:999, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', fontSize:12, color:'#4ade80', fontWeight:700 }}>✓ {planData.name} Active</div>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:56, height:56, borderRadius:18, background:'linear-gradient(135deg,#a855f7,#7c3aed)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0, boxShadow:'0 6px 24px rgba(168,85,247,0.45)' }}>🎞️</div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#c084fc', letterSpacing:'0.1em', marginBottom:4 }}>MODEL 4 · SEEDANCE AI</div>
              <h1 style={{ fontSize:'clamp(20px,4vw,26px)', fontWeight:900, color:'#fff', margin:0, letterSpacing:'-0.5px', lineHeight:1.1 }}>
                <span style={{ background:'linear-gradient(90deg,#a855f7,#c084fc,#7c3aed,#a855f7)', backgroundSize:'300% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradShift 4s ease infinite' }}>Seedance</span> AI Video
              </h1>
              <p style={{ margin:'4px 0 0', fontSize:13, color:'rgba(255,255,255,0.35)' }}>Real AI video clips from text — not images</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'24px clamp(16px,4vw,24px) 0', animation:'fadeUp 0.4s ease' }}>

        {/* Usage Counter */}
        {usage && usage.access && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monthly Usage</p>
              <button onClick={() => setShowPayment(true)} style={{ fontSize: 11, fontWeight: 700, color: '#a855f7', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>+ Get More Videos</button>
            </div>
            <UsageBar label="30-second videos" used={usage.usage?.videos_30s || 0} quota={usage.quota?.videos_30s || 0} />
            <UsageBar label="1-minute videos" used={usage.usage?.videos_1min || 0} quota={usage.quota?.videos_1min || 0} />
            <UsageBar label="3-minute videos" used={usage.usage?.videos_3min || 0} quota={usage.quota?.videos_3min || 0} />
            {(() => {
              const q30 = usage.quota?.videos_30s || 0, q1 = usage.quota?.videos_1min || 0, q3 = usage.quota?.videos_3min || 0;
              const u30 = usage.usage?.videos_30s || 0, u1 = usage.usage?.videos_1min || 0, u3 = usage.usage?.videos_3min || 0;
              const allUsed = (q30 === 0 || u30 >= q30) && (q1 === 0 || u1 >= q1) && (q3 === 0 || u3 >= q3);
              if (!allUsed) return null;
              return (
                <div style={{ marginTop: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 600 }}>⚠️ All videos used for this plan</span>
                  <button onClick={() => setShowPayment(true)} style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Subscribe Again →</button>
                </div>
              );
            })()}
          </div>
        )}

        {/* Mode Tabs */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 4, marginBottom: 24 }}>
          {[{ key: 'idea', icon: '💡', label: 'Idea', needsSub: false }, { key: 'script', icon: '📝', label: 'Script', needsSub: true }, { key: 'voice', icon: '🎙️', label: 'Voice', needsSub: true }].map(m => {
            const locked = m.needsSub && !model4Access;
            return (
              <button key={m.key} onClick={() => { if (locked) { setShowPayment(true); return; } setMode(m.key); }} className="m4-tab"
                style={{ flex: 1, padding: '11px 8px', borderRadius: 10, border: 'none', background: mode === m.key ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent', color: mode === m.key ? '#fff' : locked ? '#374151' : '#4b5563', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', boxShadow: mode === m.key ? '0 2px 12px rgba(168,85,247,0.4)' : 'none' }}>
                {locked ? '🔒 ' : m.icon + ' '}{m.label}
              </button>
            );
          })}
        </div>

        {/* Input */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            {mode === 'idea' ? 'YOUR IDEA' : mode === 'script' ? 'YOUR SCRIPT' : 'VOICE RECORDING'}
          </p>
          {mode === 'idea' && (
            <>
              <textarea value={idea} onChange={e => setIdea(e.target.value)} placeholder="A cinematic video about the power of discipline and daily habits..." rows={4}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.65 }} />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#374151' }}>{idea.length} characters</p>
            </>
          )}
          {mode === 'script' && (
            <>
            <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="Paste your script here..." rows={6}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.65 }} />
            <p style={{ fontSize:11, color: scriptOverLimit ? '#f87171' : 'rgba(255,255,255,0.3)', marginTop:6, margin:'6px 0 0' }}>
              {scriptCharCount} / {MAX_SCRIPT_CHARS} chars{scriptOverLimit ? ' — Too long! Max 1800 chars (3 min)' : (mode === 'script' && script.length > 20 ? ` · Auto: ${getSmartDuration()}` : '')}
            </p>
            </>
          )}
          {mode === 'voice' && (
            <div>
              <div onClick={() => voiceRef.current?.click()} style={{ border: `2px dashed ${voiceFile ? '#a855f7' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(168,85,247,0.03)', marginBottom: 12 }}>
                {transcribing ? <p style={{ color: '#a855f7', fontWeight: 700, margin: 0 }}>⏳ Transcribing...</p>
                  : voiceFile ? <><div style={{ fontSize: 28, marginBottom: 6 }}>🎙️</div><p style={{ color: '#a855f7', fontWeight: 700, margin: 0 }}>{voiceFile.name}</p></>
                  : <><div style={{ fontSize: 36, marginBottom: 10 }}>🎙️</div><p style={{ color: '#6b7280', fontSize: 14, margin: 0, fontWeight: 600 }}>Upload voice recording</p><p style={{ color: '#374151', fontSize: 12, margin: '4px 0 0' }}>MP3, WAV, M4A — max 2:30</p></>}
                <input ref={voiceRef} type="file" accept="audio/*" onChange={e => handleVoiceUpload(e.target.files[0])} style={{ display: 'none' }} />
              </div>
              {voiceTranscript && (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 14 }}>
                  <p style={{ margin: '0 0 6px', fontSize: 11, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase' }}>Transcribed</p>
                  <p style={{ margin: 0, fontSize: 13, color: '#d1d5db', lineHeight: 1.7 }}>{voiceTranscript}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>DURATION & SCENES</p>
          {(mode === 'script' || mode === 'voice') && (mode === 'script' ? script.length > 20 : voiceTranscript.length > 20) && (
            <div style={{ padding:'10px 16px', borderRadius:10, background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.3)', fontSize:13, color:'#c084fc', marginBottom:12, fontWeight:600 }}>
              ✨ Auto-detected: <strong>{getSmartDuration()}</strong> based on script length
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, opacity: (mode === 'script' || mode === 'voice') && (mode === 'script' ? script.length > 20 : voiceTranscript.length > 20) ? 0.4 : 1, pointerEvents: (mode === 'script' || mode === 'voice') && (mode === 'script' ? script.length > 20 : voiceTranscript.length > 20) ? 'none' : 'auto' }}>
            {Object.entries(DURATION_CONFIG).map(([d, cfg]) => {
              const allowed = allowedDurations.includes(d);
              return (
                <div key={d} onClick={() => allowed && setDuration(d)} className={allowed ? 'm4-dur' : ''}
                  style={{ borderRadius: 14, padding: '16px 12px', textAlign: 'center', cursor: allowed ? 'pointer' : 'not-allowed', border: `2px solid ${duration === d && allowed ? '#a855f7' : 'rgba(255,255,255,0.07)'}`, background: duration === d && allowed ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)', opacity: allowed ? 1 : 0.35, transition: 'all 0.15s', position: 'relative' }}>
                  {!allowed && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10 }}>🔒</div>}
                  <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: duration === d && allowed ? '#c084fc' : '#fff' }}>{cfg.label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{cfg.sublabel}</p>

                </div>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>ASPECT RATIO</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {['9:16','16:9','1:1'].map(r => (
                <button key={r} onClick={() => setRatio(r)} style={{ flex: 1, padding: '9px 4px', borderRadius: 8, border: `1px solid ${ratio === r ? '#a855f7' : 'rgba(255,255,255,0.07)'}`, background: ratio === r ? 'rgba(168,85,247,0.15)' : 'transparent', color: ratio === r ? '#c084fc' : '#4b5563', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{r}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>LANGUAGE</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ v: 'en', l: '🇺🇸 EN' }, { v: 'ar', l: '🇸🇦 AR' }, { v: 'ar_eg', l: '🇪🇬 مصري' }, { v: 'ar_gulf', l: '🇦🇪 خليجي' }].map(lang => (
                <button key={lang.v} onClick={() => setVideoLanguage(lang.v)} style={{ flex: 1, padding: '9px 4px', borderRadius: 8, border: `1px solid ${videoLanguage === lang.v ? '#a855f7' : 'rgba(255,255,255,0.07)'}`, background: videoLanguage === lang.v ? 'rgba(168,85,247,0.15)' : 'transparent', color: videoLanguage === lang.v ? '#c084fc' : '#4b5563', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{lang.l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
          {[{ val: captions, set: setCaptions, icon: '💬', label: 'Captions', desc: 'Auto-synced subtitles' }, { val: music, set: setMusic, icon: '🎵', label: 'Background Music', desc: 'Ambient music mixed in' }].map(item => (
            <div key={item.label} onClick={() => item.set(!item.val)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', cursor: 'pointer', borderBottom: item.label === 'Captions' ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{item.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>{item.label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{item.desc}</p>
                </div>
              </div>
              <div style={{ width: 44, height: 24, borderRadius: 999, background: item.val ? '#a855f7' : 'rgba(255,255,255,0.1)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                <div style={{ position: 'absolute', top: 2.5, left: item.val ? 22 : 2.5, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
              </div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: 10, padding: '10px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#4b5563' }}>Scenes × 7 sec each</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#c084fc' }}>{durConfig.scenes} clips → {durConfig.label}</span>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 12, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>}

        {/* CTA */}
        {!model4Access ? (
          <button onClick={() => setShowPayment(true)} style={{ width: '100%', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 24px rgba(168,85,247,0.4)' }}>
            🚀 Subscribe to Get Started →
          </button>
        ) : (
          <button onClick={handleGenerateScenes} disabled={!canGenerate} style={{ width: '100%', background: !canGenerate ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg,#a855f7,#7c3aed)', color: !canGenerate ? '#374151' : '#fff', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 800, fontSize: 16, cursor: !canGenerate ? 'not-allowed' : 'pointer', boxShadow: canGenerate ? '0 4px 24px rgba(168,85,247,0.4)' : 'none', transition: 'all 0.2s' }}>
            {loading ? '⏳ Generating...' : '✨ Generate Scenes →'}
          </button>
        )}

        <p style={{ textAlign: 'center', fontSize: 11, color: '#1f2937', marginTop: 12 }}>Powered by Seedance v1 Pro · Replicate API · FFmpeg</p>
      </div>

      {showPayment && <PaymentModal onClose={() => { setShowPayment(false); fetchUsage(); }} />}
    </div>
  );
}