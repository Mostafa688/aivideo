import React, { useState, useRef, useEffect } from 'react';

// ── Plans ──────────────────────────────────────────────────────────────────
const ERIVION_PLANS = {
  ev_plan1: { name: 'Starter', nameAr: 'ستارتر', price: 500, price_usd: 10, videos_5s: 20, videos_30s: 5, videos_1min: 2, videos_5min: 0, videos_8min: 0, badge: null },
  ev_plan2: { name: 'Creator', nameAr: 'كريتور', price: 1200, price_usd: 25, videos_5s: 0, videos_30s: 20, videos_1min: 10, videos_5min: 2, videos_8min: 0, badge: 'Most Popular' },
  ev_plan3: { name: 'Pro', nameAr: 'برو', price: 2500, price_usd: 50, videos_5s: 0, videos_30s: 10, videos_1min: 10, videos_5min: 5, videos_8min: 2, badge: 'Best Value' },
};

const DURATION_CONFIG = {
  '5s':   { scenes: 1,  label: '5 seconds',  labelAr: '5 ثواني',   sublabel: '1 scene, no voiceover' },
  '30s':  { scenes: 6,  label: '30 seconds', labelAr: '30 ثانية',  sublabel: '6 scenes + voiceover' },
  '1min': { scenes: 12, label: '1 minute',   labelAr: 'دقيقة',     sublabel: '12 scenes + voiceover' },
  '5min': { scenes: 60, label: '5 minutes',  labelAr: '5 دقائق',   sublabel: '60 scenes + voiceover' },
  '8min': { scenes: 96, label: '8 minutes',  labelAr: '8 دقائق',   sublabel: '96 scenes + voiceover' },
};

const ASPECT_RATIOS = {
  '16:9': { width: 832, height: 480, label: '16:9 Landscape' },
  '9:16': { width: 480, height: 832, label: '9:16 Portrait' },
};

const VOICES_AR = [
  { id: 'ar-EG-SalmaNeural', label: 'سلمى (مصري)', lang: 'ar' },
  { id: 'ar-EG-ShakirNeural', label: 'شاكر (مصري)', lang: 'ar' },
  { id: 'ar-SA-ZariyahNeural', label: 'زارية (خليجي)', lang: 'ar' },
  { id: 'ar-SA-HamedNeural', label: 'حامد (خليجي)', lang: 'ar' },
];
const VOICES_EN = [
  { id: 'en-US-JennyNeural', label: 'Jenny (US)', lang: 'en' },
  { id: 'en-US-GuyNeural', label: 'Guy (US)', lang: 'en' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia (UK)', lang: 'en' },
];

// ── Payment Modal ──────────────────────────────────────────────────────────
function PaymentModal({ onClose, userRegion }) {
  const [selectedPlan, setSelectedPlan] = useState('ev_plan1');
  const [step, setStep] = useState('select');
  const [screenshot, setScreenshot] = useState(null);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef();
  const selected = ERIVION_PLANS[selectedPlan];
  const isAr = userRegion === 'eg';

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
      const res = await fetch('/api/wan-video/payment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ plan: selectedPlan, planName: selected.name, amount: isAr ? selected.price : selected.price_usd, userEmail: email, screenshot }),
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
            <p style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>We'll activate your plan within a few hours.</p>
            <button onClick={onClose} style={{ background: '#a855f7', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Got it!</button>
          </div>
        ) : step === 'select' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#fff' }}>Choose Your Plan</h2>
                <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>Erivion — WAN AI Video</p>
              </div>
              <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {['eg', 'intl'].map(r => (
                <button key={r} style={{ flex: 1, padding: '8px', borderRadius: 8, border: `1px solid ${userRegion === r ? '#a855f7' : 'rgba(255,255,255,0.1)'}`, background: userRegion === r ? 'rgba(168,85,247,0.1)' : 'transparent', color: userRegion === r ? '#c084fc' : '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  {r === 'eg' ? '🇪🇬 EGP' : '🌍 USD'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              {Object.entries(ERIVION_PLANS).map(([key, plan]) => (
                <div key={key} onClick={() => setSelectedPlan(key)}
                  style={{ border: `2px solid ${selectedPlan === key ? '#a855f7' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', background: selectedPlan === key ? 'rgba(168,85,247,0.08)' : 'transparent', position: 'relative' }}>
                  {plan.badge && <div style={{ position: 'absolute', top: -10, right: 14, padding: '2px 10px', borderRadius: 999, background: '#a855f7', fontSize: 10, fontWeight: 700, color: '#fff' }}>{plan.badge}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, color: selectedPlan === key ? '#c084fc' : '#fff' }}>{isAr ? plan.nameAr : plan.name}</span>
                    <div>
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#22c55e' }}>{isAr ? plan.price : plan.price_usd}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}> {isAr ? 'EGP' : 'USD'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {plan.videos_5s > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 20 }}>🎬 {plan.videos_5s}×5s</span>}
                    {plan.videos_30s > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 20 }}>🎬 {plan.videos_30s}×30s</span>}
                    {plan.videos_1min > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 20 }}>🎬 {plan.videos_1min}×1min</span>}
                    {plan.videos_5min > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 20 }}>🎬 {plan.videos_5min}×5min</span>}
                    {plan.videos_8min > 0 && <span style={{ fontSize: 11, color: '#9ca3af', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 20 }}>🎬 {plan.videos_8min}×8min</span>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setStep('pay')} style={{ width: '100%', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
              Subscribe to {isAr ? ERIVION_PLANS[selectedPlan].nameAr : ERIVION_PLANS[selectedPlan].name} →
            </button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <button onClick={() => setStep('select')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 }}>← Back</button>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff' }}>Complete Payment</h2>
                <p style={{ margin: 0, fontSize: 12, color: '#a855f7' }}>{selected.name} — {isAr ? selected.price + ' EGP' : '$' + selected.price_usd}</p>
              </div>
            </div>
            {isAr ? (
              <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', margin: '0 0 12px' }}>💳 خطوات الدفع</p>
                {['افتح تطبيق InstaPay', `حول ${selected.price} جنيه إلى:`, 'خذ screenshot للتحويل', 'ارفعه أدناه ⬇️'].map((s, i) => (
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
            ) : (
              <div style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#c084fc', margin: '0 0 8px' }}>💳 Pay via Gumroad</p>
                <a href="https://erivion.gumroad.com" target="_blank" rel="noreferrer"
                  style={{ display: 'block', width: '100%', textAlign: 'center', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', borderRadius: 10, padding: '12px', fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 8 }}>
                  Pay ${selected.price_usd} on Gumroad →
                </a>
                <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>After payment, upload your receipt screenshot below.</p>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <input type="email" placeholder="Your email address *" value={email} onChange={e => setEmail(e.target.value)}
                style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
              <div onClick={() => fileRef.current?.click()}
                style={{ border: `2px dashed ${screenshotPreview ? '#22c55e' : 'rgba(168,85,247,0.3)'}`, borderRadius: 12, padding: 24, textAlign: 'center', cursor: 'pointer' }}>
                {screenshotPreview
                  ? <img src={screenshotPreview} alt="receipt" style={{ maxHeight: 120, borderRadius: 8, maxWidth: '100%' }} />
                  : <><div style={{ fontSize: 32, marginBottom: 8 }}>📎</div><p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Click to upload payment screenshot</p></>}
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

// ── Scene Card ─────────────────────────────────────────────────────────────
function SceneCard({ scene, index, onChange }) {
  const [editPrompt, setEditPrompt] = useState(false);
  const [editText, setEditText] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(scene.prompt);
  const [localText, setLocalText] = useState(scene.text || '');

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16, marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>#{index + 1}</span>
        {scene.status === 'done' && <span style={{ fontSize: 11, color: '#22c55e' }}>✓ Done</span>}
        {scene.status === 'generating' && <span style={{ fontSize: 11, color: '#f59e0b' }}>⏳ Generating...</span>}
        {scene.status === 'error' && <span style={{ fontSize: 11, color: '#ef4444' }}>✗ Failed</span>}
      </div>

      {/* Voiceover text */}
      {localText && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>📝 Voiceover text</div>
          {editText ? (
            <textarea value={localText} onChange={e => setLocalText(e.target.value)}
              onBlur={() => { setEditText(false); onChange({ ...scene, text: localText }); }}
              autoFocus rows={2}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.07)', color: '#fff', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          ) : (
            <p onClick={() => setEditText(true)} style={{ fontSize: 13, color: '#d1d5db', margin: 0, lineHeight: 1.6, cursor: 'text', padding: '4px 0' }}>{localText}</p>
          )}
        </div>
      )}

      {/* Video prompt */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>🎬 Video prompt</span>
          <button onClick={() => setEditPrompt(!editPrompt)} style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 11 }}>
            {editPrompt ? 'Save' : '✏️ Edit'}
          </button>
        </div>
        {editPrompt ? (
          <textarea value={localPrompt} onChange={e => setLocalPrompt(e.target.value)}
            onBlur={() => { setEditPrompt(false); onChange({ ...scene, prompt: localPrompt }); }}
            rows={3}
            style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.4)', background: 'rgba(168,85,247,0.07)', color: '#fff', fontSize: 12, resize: 'none', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        ) : (
          <p onClick={() => setEditPrompt(true)} style={{ fontSize: 12, color: '#9ca3af', margin: 0, lineHeight: 1.5, cursor: 'text', fontStyle: 'italic' }}>{localPrompt}</p>
        )}
      </div>

      {/* Video preview */}
      {scene.videoUrl && (
        <video src={scene.videoUrl} controls style={{ width: '100%', borderRadius: 8, marginTop: 10 }} />
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ModelErivionPage({ onBack, erivionPlan, erivionAccess, onNavigate }) {
  const [mode, setMode] = useState(null); // 'idea' | 'script' | 'voice'
  const [step, setStep] = useState('setup'); // 'setup' | 'generating' | 'scenes' | 'rendering' | 'done'
  const [showPayment, setShowPayment] = useState(false);
  const [userRegion] = useState(localStorage.getItem('erivion_region') || 'intl');
  const isAr = userRegion === 'eg';

  // Setup form
  const [duration, setDuration] = useState('30s');
  const [language, setLanguage] = useState('ar');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [voice, setVoice] = useState('ar-EG-SalmaNeural');
  const [withCaptions, setWithCaptions] = useState(true);
  const [withMusic, setWithMusic] = useState(true);
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [voiceFile, setVoiceFile] = useState(null);

  // Characters (up to 5)
  const [characters, setCharacters] = useState([{ name: '', description: '' }]);

  // Scenes
  const [scenes, setScenes] = useState([]);
  const [generatingScenes, setGeneratingScenes] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);
  const [error, setError] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const voiceFileRef = useRef();

  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  const durationConfig = DURATION_CONFIG[duration];
  const voices = language === 'ar' ? VOICES_AR : VOICES_EN;

  useEffect(() => {
    if (language === 'ar') setVoice('ar-EG-SalmaNeural');
    else setVoice('en-US-JennyNeural');
  }, [language]);

  const addCharacter = () => {
    if (characters.length < 5) setCharacters([...characters, { name: '', description: '' }]);
  };

  const updateCharacter = (i, field, val) => {
    const updated = [...characters];
    updated[i][field] = val;
    setCharacters(updated);
  };

  const removeCharacter = (i) => {
    setCharacters(characters.filter((_, idx) => idx !== i));
  };

  const generateScenes = async () => {
    if (!erivionAccess) { setShowPayment(true); return; }
    if (mode === 'idea' && !idea.trim()) { setError('Please enter your idea'); return; }
    if (mode === 'script' && !script.trim()) { setError('Please enter your script'); return; }

    setGeneratingScenes(true);
    setError('');
    setStep('generating');

    try {
      const validChars = characters.filter(c => c.name.trim() && c.description.trim());
      const body = {
        mode,
        duration,
        language,
        aspectRatio,
        idea: mode === 'idea' ? idea : undefined,
        script: mode === 'script' ? script : undefined,
        characters: validChars,
        sceneCount: durationConfig.scenes,
      };

      const res = await fetch('/api/wan-video/generate-scenes', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to generate scenes');
      const data = await res.json();
      setScenes(data.scenes);
      setStep('scenes');
    } catch (e) {
      setError(e.message);
      setStep('setup');
    } finally {
      setGeneratingScenes(false);
    }
  };

  const renderVideo = async () => {
    if (!erivionAccess) { setShowPayment(true); return; }
    setGeneratingVideo(true);
    setStep('rendering');
    setProgress(0);
    setError('');

    try {
      const body = {
        scenes,
        duration,
        language,
        aspectRatio,
        voice: duration === '5s' ? null : voice,
        withCaptions: duration === '5s' ? false : withCaptions,
        withMusic,
        characters: characters.filter(c => c.name.trim()),
      };

      const res = await fetch('/api/wan-video/render', { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || 'Render failed');

      const { jobId } = await res.json();

      // Poll
      let attempts = 0;
      while (attempts < 200) {
        await new Promise(r => setTimeout(r, 5000));
        const statusRes = await fetch(`/api/wan-video/status/${jobId}`, { headers });
        const statusData = await statusRes.json();

        if (statusData.progress) setProgress(statusData.progress);
        if (statusData.statusMsg) setStatusMsg(statusData.statusMsg);
        if (statusData.scenes) setScenes(statusData.scenes);

        if (statusData.status === 'done') {
          setFinalVideoUrl(statusData.videoUrl);
          setStep('done');
          break;
        }
        if (statusData.status === 'error') {
          throw new Error(statusData.error || 'Render failed');
        }
        attempts++;
      }
    } catch (e) {
      setError(e.message);
      setStep('scenes');
    } finally {
      setGeneratingVideo(false);
    }
  };

  const inputStyle = { padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 12, color: '#9ca3af', marginBottom: 6, display: 'block' };
  const sectionStyle = { marginBottom: 20 };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', padding: '24px 16px', fontFamily: 'inherit' }}>
      <style>{`
        .ev-tab { padding: 10px 18px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: #6b7280; cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
        .ev-tab.active { background: rgba(168,85,247,0.15); border-color: rgba(168,85,247,0.4); color: #c084fc; }
        .ev-tab:hover:not(.active) { background: rgba(255,255,255,0.04); color: #fff; }
        .ev-toggle { width: 40px; height: 22px; border-radius: 11px; border: none; cursor: pointer; position: relative; transition: background 0.2s; }
        .ev-toggle-thumb { position: absolute; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left 0.2s; }
      `}</style>

      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: '#9ca3af', cursor: 'pointer', fontSize: 13 }}>← Back</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 22 }}>🎬</span>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#fff' }}>Erivion <span style={{ background: 'linear-gradient(135deg, #a855f7, #7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>WAN AI</span></h1>
              <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', fontSize: 11, color: '#c084fc', fontWeight: 700 }}>Model 7</span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#6b7280' }}>Open-source text-to-video · Cinematic quality</p>
          </div>
          {!erivionAccess && (
            <button onClick={() => setShowPayment(true)} style={{ marginLeft: 'auto', padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
              Subscribe
            </button>
          )}
        </div>

        {/* Step: Setup */}
        {step === 'setup' && (
          <>
            {/* Mode Selection */}
            <div style={{ ...sectionStyle, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
              <p style={{ ...labelStyle, fontSize: 13, marginBottom: 14 }}>Choose your input method</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { key: 'idea', icon: '💡', label: 'Idea to Video', labelAr: 'فكرة إلى فيديو' },
                  { key: 'script', icon: '📝', label: 'Script to Video', labelAr: 'سكريبت إلى فيديو' },
                  { key: 'voice', icon: '🎙️', label: 'Voice to Video', labelAr: 'صوت إلى فيديو' },
                ].map(m => (
                  <button key={m.key} className={`ev-tab${mode === m.key ? ' active' : ''}`} onClick={() => setMode(m.key)}>
                    {m.icon} {isAr ? m.labelAr : m.label}
                  </button>
                ))}
              </div>
            </div>

            {mode && (
              <>
                {/* Input */}
                <div style={{ ...sectionStyle, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
                  {mode === 'idea' && (
                    <>
                      <label style={labelStyle}>💡 {isAr ? 'اكتب فكرتك' : 'Describe your video idea'}</label>
                      <textarea value={idea} onChange={e => setIdea(e.target.value)} rows={4} placeholder={isAr ? 'مثال: فيديو عن رحلة استكشافية في الصحراء...' : 'Example: A cinematic journey through the desert at sunset...'}
                        style={{ ...inputStyle, resize: 'vertical' }} />
                    </>
                  )}
                  {mode === 'script' && (
                    <>
                      <label style={labelStyle}>📝 {isAr ? 'اكتب السكريبت كاملاً' : 'Write your full script'}</label>
                      <textarea value={script} onChange={e => setScript(e.target.value)} rows={8} placeholder={isAr ? 'اكتب السكريبت هنا...' : 'Write your script here...'}
                        style={{ ...inputStyle, resize: 'vertical' }} />
                    </>
                  )}
                  {mode === 'voice' && (
                    <>
                      <label style={labelStyle}>🎙️ {isAr ? 'ارفع ملف الصوت' : 'Upload your voice file'}</label>
                      <div onClick={() => voiceFileRef.current?.click()} style={{ border: `2px dashed ${voiceFile ? '#22c55e' : 'rgba(168,85,247,0.3)'}`, borderRadius: 12, padding: 32, textAlign: 'center', cursor: 'pointer' }}>
                        {voiceFile ? <p style={{ color: '#22c55e', margin: 0 }}>✓ {voiceFile.name}</p> : <>
                          <div style={{ fontSize: 36, marginBottom: 8 }}>🎙️</div>
                          <p style={{ color: '#6b7280', margin: 0, fontSize: 13 }}>MP3, WAV, M4A (max 25MB)</p>
                        </>}
                        <input ref={voiceFileRef} type="file" accept="audio/*" onChange={e => setVoiceFile(e.target.files[0])} style={{ display: 'none' }} />
                      </div>
                    </>
                  )}
                </div>

                {/* Characters */}
                <div style={{ ...sectionStyle, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <label style={{ ...labelStyle, margin: 0 }}>👤 {isAr ? 'الشخصيات (اختياري، حتى 5)' : 'Characters (optional, up to 5)'}</label>
                    {characters.length < 5 && (
                      <button onClick={addCharacter} style={{ background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 8, padding: '4px 12px', color: '#c084fc', cursor: 'pointer', fontSize: 12 }}>+ Add</button>
                    )}
                  </div>
                  {characters.map((char, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input value={char.name} onChange={e => updateCharacter(i, 'name', e.target.value)}
                          placeholder={isAr ? `اسم الشخصية ${i + 1}` : `Character ${i + 1} name`}
                          style={{ ...inputStyle }} />
                        <textarea value={char.description} onChange={e => updateCharacter(i, 'description', e.target.value)}
                          placeholder={isAr ? 'وصف الشخصية: المظهر، الملابس، العمر...' : 'Description: appearance, clothes, age...'}
                          rows={2} style={{ ...inputStyle, resize: 'none' }} />
                      </div>
                      {characters.length > 1 && (
                        <button onClick={() => removeCharacter(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, padding: '8px', marginTop: 2 }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Settings */}
                <div style={{ ...sectionStyle, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
                  <p style={{ ...labelStyle, fontSize: 13, marginBottom: 16 }}>⚙️ {isAr ? 'إعدادات الفيديو' : 'Video Settings'}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    {/* Duration */}
                    <div>
                      <label style={labelStyle}>⏱️ {isAr ? 'المدة' : 'Duration'}</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {Object.entries(DURATION_CONFIG).map(([key, cfg]) => (
                          <button key={key} onClick={() => setDuration(key)}
                            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${duration === key ? '#a855f7' : 'rgba(255,255,255,0.08)'}`, background: duration === key ? 'rgba(168,85,247,0.12)' : 'transparent', color: duration === key ? '#c084fc' : '#9ca3af', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left' }}>
                            {isAr ? cfg.labelAr : cfg.label}
                            {key === '5s' && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 4 }}>(no voiceover)</span>}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Aspect Ratio + Language */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label style={labelStyle}>📐 {isAr ? 'نسبة العرض' : 'Aspect Ratio'}</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {Object.keys(ASPECT_RATIOS).map(r => (
                            <button key={r} onClick={() => setAspectRatio(r)}
                              style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${aspectRatio === r ? '#a855f7' : 'rgba(255,255,255,0.08)'}`, background: aspectRatio === r ? 'rgba(168,85,247,0.12)' : 'transparent', color: aspectRatio === r ? '#c084fc' : '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                              {r}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label style={labelStyle}>🌐 {isAr ? 'اللغة' : 'Language'}</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {[{ key: 'ar', label: 'عربي' }, { key: 'en', label: 'English' }].map(l => (
                            <button key={l.key} onClick={() => setLanguage(l.key)}
                              style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${language === l.key ? '#a855f7' : 'rgba(255,255,255,0.08)'}`, background: language === l.key ? 'rgba(168,85,247,0.12)' : 'transparent', color: language === l.key ? '#c084fc' : '#9ca3af', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                              {l.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Voice */}
                      {duration !== '5s' && (
                        <div>
                          <label style={labelStyle}>🎙️ {isAr ? 'الصوت' : 'Voice'}</label>
                          <select value={voice} onChange={e => setVoice(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                            {voices.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Toggles */}
                  {duration !== '5s' && (
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {[
                        { key: 'captions', label: isAr ? 'كابشن' : 'Captions', val: withCaptions, set: setWithCaptions },
                        { key: 'music', label: isAr ? 'موسيقى' : 'Music', val: withMusic, set: setWithMusic },
                      ].map(t => (
                        <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button className="ev-toggle" onClick={() => t.set(!t.val)}
                            style={{ background: t.val ? '#a855f7' : 'rgba(255,255,255,0.1)' }}>
                            <div className="ev-toggle-thumb" style={{ left: t.val ? 21 : 3 }} />
                          </button>
                          <span style={{ fontSize: 13, color: '#d1d5db' }}>{t.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {error && <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{error}</div>}

                <button onClick={generateScenes} disabled={generatingScenes}
                  style={{ width: '100%', padding: '16px', borderRadius: 14, background: generatingScenes ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', color: generatingScenes ? '#4b5563' : '#fff', fontSize: 16, fontWeight: 800, cursor: generatingScenes ? 'not-allowed' : 'pointer', boxShadow: generatingScenes ? 'none' : '0 4px 20px rgba(168,85,247,0.4)' }}>
                  {generatingScenes ? '⏳ Generating scenes...' : `✨ ${isAr ? 'توليد المشاهد' : 'Generate Scenes'} (${durationConfig.scenes} scenes)`}
                </button>
              </>
            )}
          </>
        )}

        {/* Step: Generating */}
        {step === 'generating' && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✨</div>
            <h2 style={{ color: '#fff', marginBottom: 8 }}>{isAr ? 'جاري توليد المشاهد...' : 'Generating scenes...'}</h2>
            <p style={{ color: '#6b7280', fontSize: 14 }}>{isAr ? 'Groq AI يكتب السكريبت والـ prompts' : 'Groq AI is writing your script and prompts'}</p>
          </div>
        )}

        {/* Step: Scenes */}
        {step === 'scenes' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: '#fff', fontSize: 18 }}>{isAr ? 'مشاهدك جاهزة!' : 'Your scenes are ready!'}</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{scenes.length} {isAr ? 'مشهد — يمكنك تعديل أي مشهد قبل الريندر' : 'scenes — edit any scene before rendering'}</p>
              </div>
              <button onClick={() => setStep('setup')} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', color: '#6b7280', cursor: 'pointer', fontSize: 12 }}>← Back</button>
            </div>

            <div style={{ marginBottom: 20 }}>
              {scenes.map((scene, i) => (
                <SceneCard key={i} scene={scene} index={i} onChange={(updated) => {
                  const newScenes = [...scenes];
                  newScenes[i] = updated;
                  setScenes(newScenes);
                }} />
              ))}
            </div>

            {error && <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{error}</div>}

            <button onClick={renderVideo} disabled={generatingVideo}
              style={{ width: '100%', padding: '16px', borderRadius: 14, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 20px rgba(168,85,247,0.4)' }}>
              🎬 {isAr ? 'ابدأ الريندر' : 'Start Rendering'}
            </button>
          </>
        )}

        {/* Step: Rendering */}
        {step === 'rendering' && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎬</div>
            <h2 style={{ color: '#fff', marginBottom: 8 }}>{isAr ? 'جاري إنشاء الفيديو...' : 'Rendering your video...'}</h2>
            <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 24 }}>{statusMsg || (isAr ? 'Erivion AI يولد المشاهد واحداً تلو الآخر' : 'Erivion AI is generating scenes one by one')}</p>
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '10px 16px', maxWidth: 420, margin: '0 auto 20px' }}>
              <p style={{ color: '#f59e0b', fontSize: 13, margin: 0 }}>
                {isAr ? '⚠️ المشهد الأول قد يأخذ من 10 إلى 15 دقيقة لتحميل الذكاء الاصطناعي — المشاهد التالية ستكون أسرع بكثير' : '⚠️ The first scene may take 10–15 minutes to load the AI model — following scenes will be much faster'}
              </p>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 99, height: 8, overflow: 'hidden', maxWidth: 400, margin: '0 auto 12px' }}>
              <div style={{ height: '100%', width: progress + '%', background: 'linear-gradient(90deg, #a855f7, #7c3aed)', borderRadius: 99, transition: 'width 0.5s' }} />
            </div>
            <p style={{ color: '#9ca3af', fontSize: 13 }}>{progress}%</p>

            {/* Scene progress */}
            {scenes.length > 0 && (
              <div style={{ maxWidth: 500, margin: '24px auto 0', textAlign: 'left' }}>
                {scenes.slice(0, 6).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>{s.status === 'done' ? '✅' : s.status === 'generating' ? '⏳' : s.status === 'error' ? '❌' : '⬜'}</span>
                    <span style={{ fontSize: 12, color: '#9ca3af' }}>Scene {i + 1}</span>
                  </div>
                ))}
                {scenes.length > 6 && <p style={{ fontSize: 12, color: '#6b7280' }}>+{scenes.length - 6} more scenes...</p>}
              </div>
            )}
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && finalVideoUrl && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ color: '#22c55e', marginBottom: 8 }}>{isAr ? 'الفيديو جاهز!' : 'Your video is ready!'}</h2>
            <video src={finalVideoUrl} controls style={{ width: '100%', maxWidth: 600, borderRadius: 16, marginBottom: 20, boxShadow: '0 0 40px rgba(168,85,247,0.3)' }} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href={finalVideoUrl} download style={{ padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 15 }}>
                ⬇️ {isAr ? 'تحميل' : 'Download'}
              </a>
              <button onClick={() => { setStep('setup'); setMode(null); setScenes([]); setFinalVideoUrl(null); setProgress(0); }}
                style={{ padding: '12px 28px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
                🔄 {isAr ? 'فيديو جديد' : 'New Video'}
              </button>
            </div>
          </div>
        )}

      </div>

      {showPayment && <PaymentModal onClose={() => setShowPayment(false)} userRegion={userRegion} />}
    </div>
  );
}