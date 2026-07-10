import React, { useState, useEffect, useRef } from 'react';

const DURATION_CONFIG = {
  '30s':  { scenes: 4,  label: '30 seconds', sublabel: '4 AI video clips' },
  '1min': { scenes: 8,  label: '1 minute',   sublabel: '8 AI video clips' },
  '3min': { scenes: 24, label: '3 minutes',  sublabel: '24 AI video clips' },
};

const VIDEO_STYLES_M4 = [
  { key: 'cinematic',   label: 'Cinematic',   emoji: '🎬', desc: 'Dramatic · Film-like',    suffix: 'cinematic photography, dramatic lighting, film grain, shallow depth of field, professional color grading' },
  { key: 'realistic',   label: 'Realistic',   emoji: '📸', desc: 'Real · Photographic',     suffix: 'photorealistic, natural lighting, high detail, documentary style, authentic' },
  { key: 'historical',  label: 'Historical',  emoji: '🏛️', desc: 'Ancient · Epic',           suffix: 'historical epic, ancient world, dramatic atmosphere, oil painting style, cinematic, period-accurate' },
  { key: 'anime',       label: 'Anime',       emoji: '🌸', desc: 'Japanese · Animated',     suffix: 'anime style, vibrant colors, detailed illustration, studio ghibli inspired, cel shading' },
  { key: 'cartoon',     label: 'Cartoon',     emoji: '🎨', desc: 'Animated · Colorful',     suffix: 'cartoon style, bright vivid colors, 2D animation, fun and expressive, pixar inspired' },
  { key: '3d_cartoon',  label: '3D Cartoon',  emoji: '🎮', desc: '3D · Rendered',            suffix: '3D rendered cartoon style, smooth colorful surfaces, pixar style 3D animation' },
  { key: 'action',      label: 'Action',      emoji: '⚡', desc: 'Dynamic · Epic',           suffix: 'action scene, dynamic motion blur, explosive energy, dramatic angles, high contrast' },
  { key: 'documentary', label: 'Documentary', emoji: '📹', desc: 'Real · Journalistic',      suffix: 'documentary style, natural lighting, photorealistic, journalistic photography, authentic atmosphere' },
];

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
export default function Model4Page({ onBack, model4Plan, model4Access, userPlan = 'free', onNavigate }) {
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
  const [creditCost, setCreditCost] = useState(10);
  const [videoStyle, setVideoStyle] = useState('cinematic');
  const [voiceFile, setVoiceFile] = useState(null);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceAudioUrl, setVoiceAudioUrl] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const voiceRef = useRef();
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const durConfig = DURATION_CONFIG[duration];

  useEffect(() => { fetchUsage(); }, []);
  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);
  useEffect(() => {
    fetch(`/api/model4/credit-cost?duration=${duration}`, { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } })
      .then(r => r.json()).then(d => setCreditCost(d.creditCost || 10)).catch(() => {});
  }, [duration]);
  useEffect(() => {
    if (mode === 'script' && script.length > 20) {
      const chars = script.trim().length;
      const smart = chars <= 300 ? '30s' : chars <= 600 ? '1min' : '3min';
      setDuration(smart);
    }
  }, [script, mode]);

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
    if (userPlan === 'free') { if (onNavigate) onNavigate('pricing'); return; }
    const inputText = mode === 'idea' ? idea : mode === 'script' ? script : voiceTranscript;
    if (!inputText?.trim()) { setError('Please enter your idea or script first'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/model4/generate-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ idea: mode === 'idea' ? inputText : undefined, script: mode !== 'idea' ? inputText : undefined, inputMode: mode === 'idea' ? 'idea' : 'script', sceneCount: mode === 'script' ? (DURATION_CONFIG[getSmartDuration()]?.scenes || durConfig.scenes) : durConfig.scenes, videoLanguage, videoStyle, styleSuffix: VIDEO_STYLES_M4.find(s=>s.key===videoStyle)?.suffix || '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error === 'content_policy_violation' ? ((localStorage.getItem('erivion_region') || 'eg') === 'eg' ? data.message_ar : data.message) : (data.error || 'Failed'));
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
        body: JSON.stringify({ scenes, audioUrl: mode === 'voice' ? voiceAudioUrl : null, ratio, captions, music, videoLanguage, duration: mode === 'script' ? getSmartDuration() : duration, inputMode: mode, videoStyle, styleSuffix: VIDEO_STYLES_M4.find(s=>s.key===videoStyle)?.suffix || '' }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'quota_exceeded') {
          const need = data.cost || creditCost;
          const have = data.remaining ?? 0;
          setError(`🪙 This video needs ${need} credits, but you only have ${have} left. Top up your credits from the Pricing page.`);
          setLoading(false); return;
        }
        if (data.show_upgrade || data.error === 'subscribe_required' || data.error === 'no_access') {
          setError(data.message || '🔒 You need an active plan to generate this video. Go to Pricing to subscribe.');
          setLoading(false); return;
        }
        if (data.error === 'trial_idea_only') {
          setError('Free trial is for Idea mode only. Subscribe to use Script and Voice.');
          setLoading(false); return;
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

  // ✅ الموديل ده مش من ضمن اللي المجاني يقدر يستخدمه — كل المدد مقفولة، الصفحة تفضل مفتوحة يتصفحها
  const allowedDurations = userPlan === 'free' ? [] : Object.keys(DURATION_CONFIG);

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

  const canGenerate = userPlan !== 'free' && !loading && !scriptOverLimit && (
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
        .m4-section-label{font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;display:flex;align-items:center;gap:8px}
        .m4-section-label::before{content:'';width:3px;height:12px;border-radius:2px;background:#a855f7;display:inline-block}
        @media(max-width:600px){
          .m4-style-grid{grid-template-columns:repeat(4,1fr)!important;gap:6px!important}
          .m4-dur-grid{grid-template-columns:repeat(3,1fr)!important}
          .m4-settings-grid{grid-template-columns:1fr!important}
          .m4-lang-row{flex-wrap:wrap!important}
          .m4-ratio-row{flex-wrap:nowrap!important}
        }
      `}</style>

      {/* Header */}
      <div style={{ padding:'clamp(24px,4vw,36px) clamp(16px,4vw,24px) 20px', position:'relative', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 0%, rgba(168,85,247,0.12) 0%, transparent 65%)', pointerEvents:'none' }} />
        <div style={{ maxWidth:680, margin:'0 auto', position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Models</button>
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

        {/* Mode Tabs */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 4, marginBottom: 24 }}>
          {[{ key: 'idea', icon: '💡', label: 'Idea' }, { key: 'script', icon: '📝', label: 'Script' }, { key: 'voice', icon: '🎙️', label: 'Voice' }].map(m => (
            <button key={m.key} onClick={() => setMode(m.key)} className="m4-tab"
              style={{ flex: 1, padding: '11px 8px', borderRadius: 10, border: 'none', background: mode === m.key ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent', color: mode === m.key ? '#fff' : '#4b5563', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', boxShadow: mode === m.key ? '0 2px 12px rgba(168,85,247,0.4)' : 'none' }}>
              {m.icon} {m.label}
            </button>
          ))}
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

        {/* Video Style */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>🎨 VIDEO STYLE</p>
          <div className="m4-style-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {VIDEO_STYLES_M4.map(s => (
              <div key={s.key} onClick={() => setVideoStyle(s.key)}
                style={{ padding: '10px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'center', border: `1px solid ${videoStyle===s.key ? '#a855f7' : 'rgba(255,255,255,0.07)'}`, background: videoStyle===s.key ? 'rgba(168,85,247,0.12)' : 'rgba(255,255,255,0.02)', transition: 'all 0.15s' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{s.emoji}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: videoStyle===s.key ? '#c084fc' : '#fff' }}>{s.label}</div>
                <div style={{ fontSize: 9, color: '#374151', marginTop: 2 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>DURATION & SCENES</p>
          {(mode === 'script' || mode === 'voice') && (mode === 'script' ? script.length > 20 : voiceTranscript.length > 20) && (
            <div style={{ padding:'10px 16px', borderRadius:10, background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.3)', fontSize:13, color:'#c084fc', marginBottom:12, fontWeight:600 }}>
              ✨ Auto-detected: <strong>{getSmartDuration()}</strong> based on script length
            </div>
          )}
          <div className="m4-dur-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, opacity: (mode === 'script' || mode === 'voice') && (mode === 'script' ? script.length > 20 : voiceTranscript.length > 20) ? 0.4 : 1, pointerEvents: (mode === 'script' || mode === 'voice') && (mode === 'script' ? script.length > 20 : voiceTranscript.length > 20) ? 'none' : 'auto' }}>
            {Object.entries(DURATION_CONFIG).map(([d, cfg]) => {
              const allowed = allowedDurations.includes(d);
              return (
                <div key={d} onClick={() => allowed ? setDuration(d) : (onNavigate && onNavigate('pricing'))} className={allowed ? 'm4-dur' : ''}
                  style={{ borderRadius: 14, padding: '16px 12px', textAlign: 'center', cursor: 'pointer', border: `2px solid ${duration === d && allowed ? '#a855f7' : 'rgba(255,255,255,0.07)'}`, background: duration === d && allowed ? 'rgba(168,85,247,0.1)' : 'rgba(255,255,255,0.02)', opacity: allowed ? 1 : 0.35, transition: 'all 0.15s', position: 'relative' }}>
                  {!allowed && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 10 }}>🔒</div>}
                  <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: duration === d && allowed ? '#c084fc' : '#fff' }}>{cfg.label}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>{cfg.sublabel}</p>

                </div>
              );
            })}
          </div>
        </div>

        {/* Settings */}
        <div className="m4-settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
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

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 12, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            <span>{error}</span>
            {(error.includes('credits') || error.includes('plan')) && (
              <button onClick={() => (onNavigate && onNavigate('pricing'))} style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', color: '#c084fc', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontSize: 13, padding: 0 }}>Go to Pricing →</button>
            )}
          </div>
        )}

        {/* Credit cost badge */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:10 }}>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(168,85,247,0.12)', border:'1px solid rgba(168,85,247,0.3)', fontSize:12, fontWeight:700, color:'#c084fc' }}>
            🪙 {creditCost} credits per video
          </div>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:600 }}>
            Model 4 · Seedance AI
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => userPlan === 'free' ? (onNavigate && onNavigate('pricing')) : handleGenerateScenes()} disabled={userPlan !== 'free' && !canGenerate} style={{ width: '100%', background: (userPlan !== 'free' && !canGenerate) ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg,#a855f7,#7c3aed)', color: (userPlan !== 'free' && !canGenerate) ? '#374151' : '#fff', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 800, fontSize: 16, cursor: (userPlan !== 'free' && !canGenerate) ? 'not-allowed' : 'pointer', boxShadow: canGenerate ? '0 4px 24px rgba(168,85,247,0.4)' : 'none', transition: 'all 0.2s' }}>
          {userPlan === 'free' ? '🔒 Subscribe to Generate →' : loading ? '⏳ Generating...' : `✨ Generate Scenes — ${creditCost} Credits →`}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#1f2937', marginTop: 12 }}>Powered by Seedance v1 Pro · Replicate API · FFmpeg</p>
      </div>

    </div>
  );
}