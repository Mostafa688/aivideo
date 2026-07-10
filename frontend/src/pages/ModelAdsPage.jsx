// ── ModelAdsPage.jsx ─────────────────────────────────────────────────────────
import React, { useState, useRef, useEffect } from 'react';

const ACCENT = '#f97316'; // orange — ads theme
const ACCENT_BG = 'rgba(249,115,22,0.10)';
const ACCENT_GLOW = 'rgba(249,115,22,0.35)';

const VOICE_OPTIONS = [
  { key: 'male_wise',       label: 'Wise Man',       emoji: '🧙', desc: 'Deep, authoritative' },
  { key: 'male_young',      label: 'Young Man',       emoji: '🧑', desc: 'Energetic, modern' },
  { key: 'male_american',   label: 'American Man',    emoji: '🇺🇸', desc: 'Clear, professional' },
  { key: 'male_arabic',     label: 'Arabic Man',      emoji: '🇸🇦', desc: 'Native Arabic voice' },
  { key: 'female_wise',     label: 'Wise Woman',      emoji: '👩‍🏫', desc: 'Calm, trustworthy' },
  { key: 'female_young',    label: 'Young Woman',     emoji: '👩', desc: 'Warm, expressive' },
  { key: 'female_american', label: 'American Woman',  emoji: '🇺🇸', desc: 'Clear, professional' },
  { key: 'female_arabic',   label: 'Arabic Woman',    emoji: '🇸🇦', desc: 'Native Arabic voice' },
];

const AD_LANGUAGES = [
  { code: 'ar',   label: 'عربي', flag: '🇸🇦' },
  { code: 'ar_eg',label: 'مصري', flag: '🇪🇬' },
  { code: 'en',   label: 'English', flag: '🇺🇸' },
];

const AD_RATIOS = ['16:9', '9:16'];

const STEP_LABELS = {
  starting:  { ar: 'جاري البدء...', en: 'Starting...' },
  scenes:    { ar: 'جاري توليد مشاهد الإعلان...', en: 'Generating ad scenes...' },
  voice:     { ar: 'جاري توليد الصوت...', en: 'Generating voiceover...' },
  animate:   { ar: 'جاري تحريك المشاهد...', en: 'Animating scenes...' },
  compose:   { ar: 'جاري تجميع الفيديو...', en: 'Composing final video...' },
  done:      { ar: 'الإعلان جاهز! 🎉', en: 'Ad video ready! 🎉' },
  error:     { ar: 'حدث خطأ', en: 'Error occurred' },
};

function Pill({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const isActive = (opt.code || opt) === value;
        return (
          <span key={opt.code || opt} onClick={() => onChange(opt.code || opt)}
            style={{ padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
              border: `1px solid ${isActive ? ACCENT : 'rgba(255,255,255,0.1)'}`,
              background: isActive ? ACCENT_BG : 'transparent',
              color: isActive ? ACCENT : 'rgba(255,255,255,0.45)',
            }}>
            {opt.flag ? `${opt.flag} ${opt.label}` : opt}
          </span>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>
      {children}
    </p>
  );
}

function Section({ children, style }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: 24, marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}

export default function ModelAdsPage({ onBack, userLanguage = 'ar', credits = 0 }) {
  const isAr = userLanguage?.startsWith('ar');

  // Form state
  const [productImage, setProductImage] = useState(null);
  const [productImagePreview, setProductImagePreview] = useState(null);
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [audioMode, setAudioMode] = useState('ai_voice'); // 'upload' | 'ai_voice' | 'none'
  const [uploadedAudio, setUploadedAudio] = useState(null);
  const [uploadedAudioName, setUploadedAudioName] = useState('');
  const [aiVoiceKey, setAiVoiceKey] = useState('male_arabic');
  const [ratio, setRatio] = useState('16:9');
  const [language, setLanguage] = useState('ar');
  const [sceneCount, setSceneCount] = useState(5);
  const [customHook, setCustomHook] = useState('');
  const [showTitle, setShowTitle] = useState(true);
  const [adsCosts, setAdsCosts] = useState({ costs_no_voice: {}, costs_voice: {} });

  useEffect(() => {
    fetch('/api/ads/credits', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.json()).then(d => setAdsCosts({ costs_no_voice: d.costs_no_voice || {}, costs_voice: d.costs_voice || {} })).catch(() => {});
  }, []);

  // Job state
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // processing | done | error
  const [jobStep, setJobStep] = useState('');
  const [jobMsg, setJobMsg] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const imageInputRef = useRef(null);
  const audioInputRef = useRef(null);
  const pollRef = useRef(null);

  // ── Image upload ─────────────────────────────────────────────────────────
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProductImage(file);
    const reader = new FileReader();
    reader.onload = ev => setProductImagePreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // ── Audio upload ─────────────────────────────────────────────────────────
  const handleAudioUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedAudio(file);
    setUploadedAudioName(file.name);
  };

  // ── Poll job status ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ads/status/${jobId}`, {
          headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        });
        const data = await res.json();
        setJobStep(data.step || '');
        setJobMsg(data.msg || '');
        setJobStatus(data.status);
        if (data.status === 'done') {
          setVideoUrl(data.videoUrl);
          clearInterval(pollRef.current);
          setLoading(false);
        } else if (data.status === 'error') {
          setError(data.msg || (isAr ? 'حدث خطأ أثناء المعالجة' : 'Processing error'));
          clearInterval(pollRef.current);
          setLoading(false);
        }
      } catch {}
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [jobId]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!productImage) {
      setError(isAr ? 'من فضلك ارفع صورة المنتج' : 'Please upload a product image');
      return;
    }
    if (!productName.trim()) {
      setError(isAr ? 'من فضلك ادخل اسم المنتج' : 'Please enter the product name');
      return;
    }
    if (audioMode === 'upload' && !uploadedAudio) {
      setError(isAr ? 'من فضلك ارفع ملف الصوت' : 'Please upload audio file');
      return;
    }

    setLoading(true);
    setError('');
    setVideoUrl(null);
    setJobId(null);
    setJobStatus('processing');

    try {
      const formData = new FormData();
      formData.append('productImage', productImage);
      formData.append('productName', productName.trim());
      formData.append('productDesc', productDesc.trim());
      formData.append('audioMode', audioMode);
      formData.append('aiVoiceKey', aiVoiceKey);
      formData.append('ratio', ratio);
      formData.append('language', language);
      formData.append('sceneCount', String(sceneCount));
      formData.append('customHook', customHook);
      formData.append('showTitle', String(showTitle));
      if (audioMode === 'upload' && uploadedAudio) {
        formData.append('voiceAudio', uploadedAudio);
      }

      const res = await fetch('/api/ads/render', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'quota_exceeded') {
          throw new Error(isAr ? `🪙 محتاج ${data.cost} كريدت ومعاك ${data.remaining} بس. اشحن رصيدك من صفحة الأسعار.` : `🪙 This video needs ${data.cost} credits, you have ${data.remaining}. Top up from Pricing.`);
        }
        if (data.error === 'no_access' || data.error === 'under_maintenance') {
          throw new Error(data.message || (isAr ? '🔒 محتاج خطة فعالة عشان تعمل الفيديو ده' : '🔒 You need an active plan for this video'));
        }
        throw new Error(data.error || 'Failed to start job');
      }
      setJobId(data.jobId);
    } catch (err) {
      setError(err.message);
      setLoading(false);
      setJobStatus(null);
    }
  };

  const canSubmit = productImage && productName.trim() && productDesc.trim() && !loading &&
    (audioMode !== 'upload' || uploadedAudio);

  const stepLabel = STEP_LABELS[jobStep]?.[isAr ? 'ar' : 'en'] || jobMsg;
  const progressSteps = ['scenes', 'voice', 'animate', 'compose', 'done'];
  const currentStepIdx = progressSteps.indexOf(jobStep);

  return (
    <div style={{ minHeight: '100vh', background: '#050508', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 16px 60px', position: 'relative', overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .ads-input { width:100%; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.09); border-radius:12px; color:#fff; font-family:'DM Sans',sans-serif; font-size:14px; padding:11px 14px; outline:none; box-sizing:border-box; transition:border-color 0.2s; resize:none; }
        .ads-input:focus { border-color:${ACCENT}55; }
        .ads-input::placeholder { color:rgba(255,255,255,0.2); }
        .voice-card { padding:12px 8px; border-radius:12px; border:1px solid rgba(255,255,255,0.07); background:rgba(255,255,255,0.02); text-align:center; cursor:pointer; transition:all 0.15s; }
        .voice-card:hover { border-color:${ACCENT}44; background:${ACCENT_BG}; }
        .voice-card.active { border-color:${ACCENT}; background:${ACCENT_BG}; }
        .ads-drop { border:2px dashed rgba(249,115,22,0.3); border-radius:16px; padding:32px; text-align:center; cursor:pointer; transition:all 0.2s; background:rgba(249,115,22,0.03); }
        .ads-drop:hover { border-color:${ACCENT}; background:${ACCENT_BG}; }
        .progress-step { width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; transition:all 0.3s; font-family:'DM Sans',sans-serif; }
      `}</style>

      {/* BG glow */}
      <div style={{ position: 'fixed', top: '-10%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 500, borderRadius: '50%', background: `radial-gradient(circle, ${ACCENT_BG} 0%, transparent 70%)`, pointerEvents: 'none', filter: 'blur(60px)' }} />

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 640, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, animation: 'fadeUp 0.4s ease' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>← {isAr ? 'رجوع' : 'Change model'}</button>
        <div style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: `${ACCENT_BG}`, border: `1px solid ${ACCENT}44`, color: ACCENT, fontFamily: "'DM Sans', sans-serif" }}>
          📢 {isAr ? 'موديل الإعلانات' : 'Ads Model'}
        </div>
      </div>

      <div style={{ width: '100%', maxWidth: 640, animation: 'fadeUp 0.45s ease 0.05s both' }}>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 'clamp(24px,5vw,36px)', fontWeight: 900, color: '#fff', fontFamily: "'Bricolage Grotesque', sans-serif", letterSpacing: '-0.5px', marginBottom: 8 }}>
            {isAr ? '🎬 أنشئ إعلانك الاحترافي' : '🎬 Create Your Pro Ad'}
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7 }}>
            {isAr
              ? 'ارفع صورة المنتج وهنعمل إعلان فيديو احترافي بالذكاء الاصطناعي'
              : 'Upload your product image and we\'ll create a professional AI video ad'}
          </p>
        </div>

        {/* ── RESULT ─────────────────────────────────────────────────────── */}
        {videoUrl && (
          <Section style={{ border: `1px solid ${ACCENT}44`, background: `${ACCENT_BG}` }}>
            <SectionLabel>{isAr ? 'إعلانك جاهز! 🎉' : 'Your Ad is Ready! 🎉'}</SectionLabel>
            <video src={videoUrl} controls style={{ width: '100%', borderRadius: 12, maxHeight: 400, background: '#000' }} />
            <a href={videoUrl} download style={{ display: 'block', marginTop: 14, padding: '12px', borderRadius: 12, background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center', textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 20px ${ACCENT_GLOW}` }}>
              ⬇️ {isAr ? 'تحميل الإعلان' : 'Download Ad'}
            </a>
          </Section>
        )}

        {/* ── PROCESSING ──────────────────────────────────────────────────── */}
        {loading && jobStatus === 'processing' && (
          <Section style={{ border: `1px solid ${ACCENT}33` }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${ACCENT}33`, borderTop: `3px solid ${ACCENT}`, borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.9s linear infinite' }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', fontFamily: "'DM Sans', sans-serif", margin: 0 }}>{stepLabel || (isAr ? 'جاري المعالجة...' : 'Processing...')}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 6, fontFamily: "'DM Sans', sans-serif" }}>
                {isAr ? 'ده ممكن ياخد من 3 لـ 8 دقائق' : 'This may take 3–8 minutes'}
              </p>
            </div>
            {/* Progress bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 }}>
              {progressSteps.slice(0, -1).map((step, i) => {
                const done = i < currentStepIdx;
                const active = i === currentStepIdx;
                return (
                  <React.Fragment key={step}>
                    <div className="progress-step" style={{ background: done ? ACCENT : active ? ACCENT_BG : 'rgba(255,255,255,0.06)', border: `2px solid ${done || active ? ACCENT : 'rgba(255,255,255,0.1)'}`, color: done || active ? (done ? '#fff' : ACCENT) : 'rgba(255,255,255,0.3)', animation: active ? 'pulse 1.5s ease-in-out infinite' : 'none' }}>
                      {done ? '✓' : i + 1}
                    </div>
                    {i < 3 && <div style={{ flex: 1, height: 2, background: done ? ACCENT : 'rgba(255,255,255,0.07)', maxWidth: 40, borderRadius: 2, transition: 'background 0.3s' }} />}
                  </React.Fragment>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── ERROR ───────────────────────────────────────────────────────── */}
        {error && (
          <div style={{ padding: '14px 18px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: '#f87171', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>⚠️ {error}</p>
          </div>
        )}

        {!loading && !videoUrl && (
          <>
            {/* ── STEP 1: Product Image ──────────────────────────────────── */}
            <Section>
              <SectionLabel>{isAr ? 'صورة المنتج (بخلفية بيضاء)' : 'Product Image (White Background)'}</SectionLabel>

              {/* Warning */}
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                <p style={{ fontSize: 12, color: '#fdba74', margin: 0, lineHeight: 1.6, fontFamily: "'DM Sans', sans-serif" }}>
                  {isAr
                    ? 'لازم صورة المنتج تكون على خلفية بيضاء نظيفة عشان الذكاء الاصطناعي يقدر يعمل reference صح للمنتج في المشاهد المختلفة.'
                    : 'Product image must have a clean white background so AI can correctly reference your product across different scenes.'}
                </p>
              </div>

              {productImagePreview ? (
                <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
                  <img src={productImagePreview} alt="product" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 12, background: '#fff', border: '1px solid rgba(255,255,255,0.08)' }} />
                  <button onClick={() => { setProductImage(null); setProductImagePreview(null); }}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: 28, height: 28, color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              ) : (
                <div className="ads-drop" onClick={() => imageInputRef.current?.click()}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: ACCENT, margin: '0 0 4px', fontFamily: "'DM Sans', sans-serif" }}>{isAr ? 'اضغط لرفع صورة المنتج' : 'Click to upload product image'}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>JPEG, PNG, WebP — Max 20MB</p>
                </div>
              )}
              <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} style={{ display: 'none' }} />
            </Section>

            {/* ── STEP 2: Product Info ───────────────────────────────────── */}
            <Section>
              <SectionLabel>{isAr ? 'معلومات المنتج' : 'Product Info'}</SectionLabel>
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{isAr ? 'اسم المنتج *' : 'Product Name *'}</p>
                <input className="ads-input" value={productName} onChange={e => setProductName(e.target.value)}
                  placeholder={isAr ? 'مثال: كريم العناية بالبشرة' : 'e.g. Premium Skincare Cream'} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{isAr ? 'وصف المنتج *' : 'Product Description *'}</p>
                <textarea className="ads-input" rows={3} value={productDesc} onChange={e => setProductDesc(e.target.value)}
                  placeholder={isAr ? 'اكتب وصف المنتج ومميزاته... (مطلوب — يساعد الذكاء الاصطناعي يفهم المنتج ويختار المشاهد المناسبة)' : 'Describe your product and its benefits... (required — helps AI choose the right scenes)'} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{isAr ? 'الجملة الافتتاحية (Hook) — اختياري' : 'Opening Hook — optional'}</p>
                <input className="ads-input" value={customHook} onChange={e => setCustomHook(e.target.value)}
                  placeholder={isAr ? 'مثال: هل تعرف سر البشرة المثالية؟' : 'e.g. What if you could transform your skin in 7 days?'} />
              </div>

              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
                    {isAr ? '🎬 إظهار اسم المنتج في بداية الفيديو' : '🎬 Show product name title at start'}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans', sans-serif", marginTop: 3 }}>
                    {isAr ? 'اختياري — يظهر اسم المنتج بشكل احترافي في أول 3.5 ثانية' : 'Optional — product name appears elegantly for 3.5s at start'}
                  </p>
                </div>
                <div onClick={() => setShowTitle(!showTitle)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: showTitle ? ACCENT : 'rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.2s', position: 'relative', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: showTitle ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                </div>
              </div>
            </Section>

            {/* ── STEP 3: Audio Mode ─────────────────────────────────────── */}
            <Section>
              <SectionLabel>{isAr ? 'الصوت' : 'Audio'}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {[
                  { key: 'ai_voice', icon: '🤖', label: isAr ? 'صوت AI تلقائي' : 'AI Voiceover', desc: isAr ? 'الذكاء الاصطناعي يكتب ويقرأ السكريبت' : 'AI writes and reads the ad script' },
                  { key: 'upload',   icon: '🎙️', label: isAr ? 'ارفع صوتك' : 'Upload Your Voice', desc: isAr ? 'ارفع ملف صوتي MP3/WAV' : 'Upload MP3/WAV audio file' },
                  { key: 'none',     icon: '🎵', label: isAr ? 'بدون فويس أوفر' : 'No Voiceover', desc: isAr ? 'فيديو بمؤثرات صوتية طبيعية بس' : 'Video with natural ambient sounds only' },
                ].map(opt => (
                  <div key={opt.key} onClick={() => setAudioMode(opt.key)}
                    style={{ padding: '14px 16px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${audioMode === opt.key ? ACCENT : 'rgba(255,255,255,0.07)'}`, background: audioMode === opt.key ? ACCENT_BG : 'rgba(255,255,255,0.015)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{opt.icon}</span>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: audioMode === opt.key ? ACCENT : '#fff', fontFamily: "'DM Sans', sans-serif" }}>{opt.label}</p>
                      <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{opt.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Voice picker */}
              {audioMode === 'ai_voice' && (
                <div>
                  <SectionLabel>{isAr ? 'اختار الصوت' : 'Choose Voice'}</SectionLabel>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                    {VOICE_OPTIONS.map(v => (
                      <div key={v.key} className={`voice-card${aiVoiceKey === v.key ? ' active' : ''}`} onClick={() => setAiVoiceKey(v.key)}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{v.emoji}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: aiVoiceKey === v.key ? ACCENT : '#fff', fontFamily: "'DM Sans', sans-serif" }}>{v.label}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>{v.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload audio */}
              {audioMode === 'upload' && (
                <div>
                  <SectionLabel>{isAr ? 'ارفع ملف الصوت' : 'Upload Audio File'}</SectionLabel>
                  {uploadedAudioName ? (
                    <div style={{ padding: '12px 16px', borderRadius: 12, background: ACCENT_BG, border: `1px solid ${ACCENT}44`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: ACCENT, fontFamily: "'DM Sans', sans-serif" }}>🎵 {uploadedAudioName}</span>
                      <button onClick={() => { setUploadedAudio(null); setUploadedAudioName(''); }} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                  ) : (
                    <div className="ads-drop" onClick={() => audioInputRef.current?.click()}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>🎙️</div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: ACCENT, margin: '0 0 4px', fontFamily: "'DM Sans', sans-serif" }}>{isAr ? 'اضغط لرفع الصوت' : 'Click to upload audio'}</p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>MP3, WAV, M4A — Max 50MB</p>
                    </div>
                  )}
                  <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioUpload} style={{ display: 'none' }} />
                </div>
              )}
            </Section>

            {/* ── STEP 4: Video Settings ─────────────────────────────────── */}
            <Section>
              <SectionLabel>{isAr ? 'إعدادات الفيديو' : 'Video Settings'}</SectionLabel>

              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>{isAr ? 'نسبة الشاشة' : 'Aspect Ratio'}</p>
                <Pill options={AD_RATIOS} value={ratio} onChange={setRatio} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>{isAr ? 'لغة الإعلان' : 'Ad Language'}</p>
                <Pill options={AD_LANGUAGES} value={language} onChange={setLanguage} />
              </div>

              <div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>
                  {isAr ? `عدد المشاهد: ${sceneCount}` : `Scene Count: ${sceneCount}`}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[3, 4, 5, 6].map(n => (
                    <span key={n} onClick={() => setSceneCount(n)}
                      style={{ padding: '7px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s', border: `1px solid ${sceneCount === n ? ACCENT : 'rgba(255,255,255,0.1)'}`, background: sceneCount === n ? ACCENT_BG : 'transparent', color: sceneCount === n ? ACCENT : 'rgba(255,255,255,0.45)' }}>
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            </Section>

            {/* ── Cost info ─────────────────────────────────────────────── */}
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Sans', sans-serif" }}>
                {isAr ? `💳 رصيدك: ${(credits?.credits_balance ?? credits ?? 0).toLocaleString()} كريدت` : `💳 Credits: ${(credits?.credits_balance ?? credits ?? 0).toLocaleString()}`}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: ACCENT, fontFamily: "'DM Sans', sans-serif" }}>
                {(() => {
                  const table = audioMode === 'none' ? adsCosts.costs_no_voice : adsCosts.costs_voice;
                  const cost = table?.[sceneCount] ?? '—';
                  return isAr ? `تكلفة: ${cost} كريدت` : `Cost: ${cost} Credits`;
                })()}
              </span>
            </div>

            {/* ── Submit button ──────────────────────────────────────────── */}
            <button onClick={handleSubmit} disabled={!canSubmit}
              style={{ width: '100%', padding: '16px', borderRadius: 14, border: 'none', fontWeight: 800, fontSize: 16, cursor: canSubmit ? 'pointer' : 'not-allowed', color: '#fff', fontFamily: "'DM Sans', sans-serif", transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)', background: canSubmit ? `linear-gradient(135deg, ${ACCENT}, #ea580c)` : 'rgba(255,255,255,0.07)', opacity: canSubmit ? 1 : 0.5, boxShadow: canSubmit ? `0 6px 28px ${ACCENT_GLOW}` : 'none' }}>
              {canSubmit
                ? (isAr ? '📢 أنشئ الإعلان ← 10 كريدت' : '📢 Generate Ad ← 10 Credits')
                : (isAr ? 'ارفع صورة المنتج واكتب الاسم والوصف' : 'Upload image, name, and description')}
            </button>
            <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.18)', marginTop: 12, fontFamily: "'DM Sans', sans-serif" }}>
              Powered by FLUX Kontext · Seedance AI · FFmpeg
            </p>
          </>
        )}
      </div>
    </div>
  );
}