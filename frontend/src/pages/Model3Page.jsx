import React, { useState, useRef, useEffect } from 'react';
import VoiceUpload from './VoiceUpload.jsx';

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
  { value: '30s',  label: '30 seconds', images: 3,  credits: 20 },
  { value: '1min', label: '1 minute',   images: 6,  credits: 40 },
  { value: '3min', label: '3 minutes',  images: 18, credits: 120 },
  { value: '5min', label: '5 minutes',  images: 30, credits: 200 },
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

export default function Model3Page({ onBack, model3Plan = 'm3_starter', model3Access = false, userPlan = 'free', onNavigate }) {
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
  const [creditCost, setCreditCost] = useState(5);
  const pollRef                     = useRef(null);

  // fetch credit cost when duration changes
  useEffect(() => {
    const dur = inputMode === 'script' ? getSmartDuration() : duration;
    fetch(`/api/model3/credit-cost?duration=${dur}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.json()).then(d => setCreditCost(d.creditCost || 5)).catch(() => {});
  }, [duration, inputMode, script]);

  const DURATIONS = ALL_DURATIONS;
  const selectedDuration = ALL_DURATIONS.find(d => d.value === duration);
  const imageCount       = selectedDuration?.images || 3;
  const selectedStyle    = VIDEO_STYLES.find(s => s.key === videoStyle);

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
    if (userPlan === 'free') { if (onNavigate) onNavigate('pricing'); return; }
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
      let sceneDurations = null;
      if (voiceAudioUrl) {
        audioUrl = voiceAudioUrl;
        setRenderStatus('Using your uploaded voice recording...');
        // ملحوظة: مفيش مدد حقيقية للمشاهد هنا لأن ده تسجيل صوتي واحد كامل من المستخدم، مش مقسّم لكل مشهد
      } else if (voice !== 'none') {
        // ✅ FIX: نولّد صوت لكل مشهد لوحده عشان نعرف مدته الحقيقية بالظبط ونضمن التزامن التام مع المشهد
        const voiceRes = await fetch('/api/generate-voice', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ scenes, voice, videoLanguage }) });
        const voiceData = await voiceRes.json();
        if (!voiceRes.ok) throw new Error(voiceData.error || 'Voiceover failed');
        audioUrl = voiceData.audioUrl;
        sceneDurations = voiceData.sceneDurations || null;
      }

      setRenderStatus('Starting AI image generation...');
      const renderRes = await fetch('/api/model3/render', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ scenes, audioUrl, ratio, captions, transitions: false, music, videoLanguage, duration: inputMode === 'script' ? getSmartDuration() : duration, videoStyle, styleSuffix: selectedStyle?.suffix || '', sceneDurations }) });
      const renderData = await renderRes.json();
      if (!renderRes.ok) {
        if (renderData.show_upgrade || renderData.error === 'subscribe_required' || renderData.error === 'no_access') {
          setStep('setup');
          setError('🔒 You need an active plan to generate this video. Go to Pricing to subscribe.');
          return;
        }
        if (renderData.reason === 'quota_exceeded' || renderData.error === 'quota_exceeded') {
          setStep('setup');
          const need = renderData.cost || creditCost;
          const have = renderData.remaining ?? 0;
          setError(`🪙 This video needs ${need} credits, but you only have ${have} left. Top up your credits from the Pricing page.`);
          return;
        }
        throw new Error(renderData.error || 'Render failed');
      }
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
            <button onClick={() => (onNavigate && onNavigate('pricing'))} style={{ padding:'8px 14px', borderRadius:10, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.6)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              💳 Pricing
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

        {/* Mode Tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:16 }}>
          {[['idea','💡','Idea'],['script','📝','Script'],['voice','🎙️','Voice']].map(([m,ic,label]) => {
            const active = inputMode === m;
            return (
              <button key={m} onClick={() => setInputMode(m)}
                style={{ flex:1, padding:'11px 8px', borderRadius:12, border:`1px solid ${active?'#f59e0b':'rgba(255,255,255,0.08)'}`, fontWeight:600, fontSize:13, cursor:'pointer', transition:'all 0.2s', background: active ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)', color: active ? '#f59e0b' : 'rgba(255,255,255,0.5)', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:16 }}>{ic}</span>
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
              const allowed = userPlan !== 'free';
              return (
                <div key={d.value} onClick={() => allowed ? setDuration(d.value) : (onNavigate && onNavigate('pricing'))}
                  style={{ padding:'16px', borderRadius:12, cursor:'pointer', textAlign:'center', border:'1px solid ' + (duration === d.value && allowed ? '#f59e0b' : 'var(--border)'), background: duration === d.value && allowed ? 'rgba(245,158,11,0.08)' : 'var(--bg3)', opacity: allowed ? 1 : 0.5, position:'relative' }}>
                  {!allowed && <div style={{ position:'absolute', top:8, right:8, fontSize:12 }}>🔒</div>}
                  <div style={{ fontSize:16, fontWeight:800, color: duration === d.value && allowed ? '#f59e0b' : allowed ? 'var(--text)' : 'var(--text3)', marginBottom:2 }}>{d.label}</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:4 }}>{d.images} AI images</div>
                  {allowed ? <div style={{ fontSize:10, color:'#a99bff', fontWeight:700 }}>🪙 {d.credits} credits</div> : <div style={{ fontSize:9, color:'#ef4444', fontWeight:700 }}>Subscribe to unlock</div>}
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

        {error && (
          <div style={{ padding:'12px 16px', borderRadius:10, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', fontSize:13, marginBottom:16 }}>
            <span>{error}</span>
            {(error.includes('credits') || error.includes('plan')) && (
              <button onClick={() => (onNavigate && onNavigate('pricing'))} style={{ display:'block', marginTop:8, background:'none', border:'none', color:'#f59e0b', cursor:'pointer', fontWeight:700, textDecoration:'underline', fontSize:13, padding:0 }}>Go to Pricing →</button>
            )}
          </div>
        )}

        {/* Credit cost badge */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:16 }}>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.3)', fontSize:12, fontWeight:700, color:'#f59e0b' }}>
            🪙 {creditCost} credits per video
          </div>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:600 }}>
            Model 3 · AI Images
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => userPlan === 'free' ? (onNavigate && onNavigate('pricing')) : generateScenes()} disabled={userPlan !== 'free' && (generating || !canSubmit || inputMode === 'voice')}
          style={{ width:'100%', padding:'16px', borderRadius:12, border:'none', background: (userPlan !== 'free' && (generating || !canSubmit)) ? 'var(--bg3)' : 'linear-gradient(135deg, #f59e0b, #ef4444)', color: (userPlan !== 'free' && (generating || !canSubmit)) ? 'var(--text3)' : '#fff', fontWeight:700, fontSize:15, cursor: (userPlan !== 'free' && (generating || !canSubmit)) ? 'not-allowed' : 'pointer', boxShadow: canSubmit ? '0 4px 20px rgba(245,158,11,0.3)' : 'none', transition:'all 0.15s' }}>
          {userPlan === 'free' ? '🔒 Subscribe to Generate →' : generating ? '⏳ Generating scenes...' : `✨ Generate ${imageCount} Scenes — ${creditCost} Credits →`}
        </button>

        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.2)', marginTop:12 }}>
          Grok Imagine · {selectedStyle?.emoji} {selectedStyle?.label} · Ken Burns zoom · FFmpeg render
        </p>
      </div>
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
        {videoUrl && (
          <div style={{ borderRadius:18, overflow:'hidden', border:'1px solid rgba(255,255,255,0.08)', marginBottom:20, background:'#000', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <video src={videoUrl} controls style={{ width:'100%', maxHeight:420, display:'block' }} />
          </div>
        )}
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          {videoUrl && <a href={videoUrl} download style={{ padding:'13px 28px', borderRadius:12, background:'linear-gradient(135deg,#22c55e,#16a34a)', color:'#fff', fontWeight:700, fontSize:14, textDecoration:'none', boxShadow:'0 4px 20px rgba(34,197,94,0.35)', display:'flex', alignItems:'center', gap:8 }}>⬇️ Download</a>}
          <button onClick={() => { setStep('setup'); setIdea(''); setScript(''); setScenes([]); setVideoUrl(null); setVoiceAudioUrl(null); }} style={{ padding:'13px 28px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.7)', fontWeight:600, fontSize:14, cursor:'pointer' }}>🔄 New Video</button>
        </div>
      </div>
    </div>
  );

  return null;
}