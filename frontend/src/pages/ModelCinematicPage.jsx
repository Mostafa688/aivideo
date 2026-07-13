import React, { useState, useEffect, useRef } from 'react';
import RatingPrompt from './RatingPrompt.jsx';

const VIDEO_STYLES = [
  { key:'cinematic',  label:'Cinematic',  emoji:'🎬', desc:'Dramatic · Film-like',   suffix:'cinematic photography, dramatic lighting, film grain, shallow depth of field, professional color grading' },
  { key:'realistic',  label:'Realistic',  emoji:'📸', desc:'Real · Photographic',    suffix:'photorealistic, natural lighting, high detail, documentary style, authentic' },
  { key:'anime',      label:'Anime',      emoji:'🌸', desc:'Japanese · Illustrated', suffix:'anime style, vibrant colors, detailed illustration, studio ghibli inspired, cel shading' },
  { key:'cartoon',    label:'Cartoon',    emoji:'🎨', desc:'Animated · Colorful',    suffix:'cartoon style, bright vivid colors, 2D animation, fun and expressive, pixar inspired' },
  { key:'3d_cartoon', label:'3D Cartoon', emoji:'✨', desc:'3D · Rendered',          suffix:'3D rendered, cartoon style, smooth surfaces, colorful, pixar style 3D animation' },
  { key:'action',     label:'Action',     emoji:'⚡', desc:'Dynamic · Epic',         suffix:'action scene, dynamic motion blur, explosive energy, dramatic angles, high contrast' },
];

function authHeaders() {
  return { 'Content-Type':'application/json', Authorization:'Bearer '+localStorage.getItem('token') };
}


function SceneCard({ scene, index, onChange }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(scene.prompt);
  const save = () => { setEditing(false); if(local.trim()) onChange({...scene,prompt:local.trim()}); };
  return (
    <div style={{ background:'linear-gradient(135deg,rgba(225,29,72,0.06),rgba(0,0,0,0.4))', border:'1px solid rgba(225,29,72,0.12)', borderRadius:14, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ background:'linear-gradient(135deg,#e11d48,#9f1239)', color:'#fff', borderRadius:8, padding:'3px 12px', fontSize:12, fontWeight:800 }}>Scene {index+1}</span>
        <span style={{ fontSize:11, color:'#4b5563' }}>· 5 seconds</span>
      </div>
      {scene.text && <p style={{ fontSize:13, color:'#9ca3af', margin:'0 0 10px', lineHeight:1.5, fontStyle:'italic' }}>"{scene.text}"</p>}
      <div style={{ background:'rgba(0,0,0,0.3)', borderRadius:8, padding:'10px 12px', display:'flex', gap:8, alignItems:'flex-start' }}>
        <span style={{ fontSize:11, color:'#374151', flexShrink:0, marginTop:2 }}>🎬</span>
        {editing ? (
          <textarea value={local} onChange={e=>setLocal(e.target.value)} onBlur={save} autoFocus rows={3} style={{ flex:1, padding:'6px 8px', borderRadius:6, border:'1px solid rgba(225,29,72,0.3)', background:'rgba(225,29,72,0.05)', color:'#9ca3af', fontSize:11, fontFamily:'monospace', lineHeight:1.5, resize:'none', outline:'none' }} />
        ) : (
          <p onClick={()=>setEditing(true)} style={{ margin:0, fontSize:11, color:'#4b5563', fontFamily:'monospace', lineHeight:1.5, flex:1, cursor:'text' }}>{scene.prompt}</p>
        )}
        <button onClick={()=>{setLocal(scene.prompt);setEditing(!editing);}} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', color:'#6b7280', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, cursor:'pointer', flexShrink:0 }}>{editing?'Done':'Edit'}</button>
      </div>
    </div>
  );
}

export default function ModelCinematicPage({ onBack, model5Access, model5Plan, userPlan = 'free', onNavigate }) {
  const [step, setStep] = useState('input');
  const [showRating, setShowRating] = useState(true);
  const [genMode, setGenMode] = useState('idea'); // 'idea' | 'prompt'
  const [idea, setIdea] = useState('');
  const [rawPrompt, setRawPrompt] = useState('');
  // characters: { id, prompt, photo: base64|null, photoPreview: url|null }
  const [characters, setCharacters] = useState([{ id:1, prompt:'', photo:null, photoPreview:null }]);
  const [characterPhotos, setCharacterPhotos] = useState([]); // kept separately to survive scene step
  const [videoStyle, setVideoStyle] = useState('cinematic');
  const [duration, setDuration] = useState('15s');
  const [ratio, setRatio] = useState('9:16');
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [usage, setUsage] = useState(null);
  const [creditCost, setCreditCost] = useState(180);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const region = localStorage.getItem('erivion_region') || 'eg';

  useEffect(() => { fetchUsage(); }, []);
  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);
  useEffect(() => {
    const hasPhoto = characters.some(c => c.photo);
    fetch(`/api/model5/credit-cost?duration=${duration}&hasPhoto=${hasPhoto}`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setCreditCost(d.creditCost || 180)).catch(() => {});
  }, [duration, characters]);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/model5/usage', { headers:{ Authorization:'Bearer '+localStorage.getItem('token') } });
      if (res.ok) setUsage(await res.json());
    } catch {}
  };

  const addCharacter = () => { if(characters.length>=5) return; setCharacters([...characters,{id:Date.now(),prompt:'',photo:null,photoPreview:null}]); };
  const removeCharacter = (id) => setCharacters(characters.filter(c=>c.id!==id));
  const updateCharacter = (id, prompt) => setCharacters(characters.map(c=>c.id===id?{...c,prompt}:c));
  const updateCharacterPhoto = (id, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      setCharacters(prev => prev.map(c => c.id===id ? {...c, photo: base64, photoPreview: base64} : c));
      // Also store in separate array that persists to render step
      setCharacterPhotos(prev => {
        const idx = prev.findIndex(p => p.id === id);
        if (idx >= 0) return prev.map(p => p.id===id ? {...p, photo: base64} : p);
        return [...prev, { id, photo: base64 }];
      });
    };
    reader.readAsDataURL(file);
  };
  const selectedStyle = VIDEO_STYLES.find(s=>s.key===videoStyle);
  const sceneCount = genMode === 'prompt' ? 1 : (duration==='1min'?12:duration==='30s'?6:1);
  const switchMode = (m) => {
    setGenMode(m);
    if (m === 'prompt' && !['5s','10s','15s'].includes(duration)) setDuration('15s');
  };

  const handleGenerate = async () => {
    if (userPlan === 'free') { if (onNavigate) onNavigate('pricing'); return; }
    if (genMode === 'prompt' ? !rawPrompt.trim() : !idea.trim()) { setError(genMode === 'prompt' ? 'Please write your exact video prompt' : 'Please describe your video idea'); return; }
    setLoading(true); setError('');
    try {
      const validChars = characters
        .filter(c => c.prompt.trim() || c.photo)
        .map(c => ({ prompt: c.prompt, photo: c.photo || null }));
      const body = genMode === 'prompt'
        ? { promptMode: 'prompt', rawPrompt, characters: validChars, duration, styleSuffix: selectedStyle?.suffix || '' }
        : { idea, characters: validChars, duration, videoStyle, styleSuffix: selectedStyle?.suffix };
      const res = await fetch('/api/model5/generate-scenes', {
        method:'POST', headers:authHeaders(),
        body:JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(
        data.error === 'content_policy_violation' ? (region === 'eg' ? data.message_ar : data.message) :
        data.error === 'under_maintenance' ? (data.message || 'This model is currently under maintenance and will be back soon.') :
        (data.error||'Failed')
      );
      setScenes(data.scenes||[]); setStep('scenes');
    } catch(e){ setError(e.message); } finally { setLoading(false); }
  };

  const handleRender = async () => {
    setLoading(true); setError(''); setElapsed(0);
    try {
      const res = await fetch('/api/model5/render', { method:'POST', headers:authHeaders(), body:JSON.stringify({ scenes, ratio, duration, characterPhotos: characterPhotos.map(p => p.photo) }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'quota_exceeded') {
          const COST = { '5s':60, '10s':120, '15s':180, '30s':360, '1min':720 };
          const need = data.cost || COST[duration] || 15;
          const have = data.remaining ?? 0;
          setError(`🪙 This video needs ${need} credits, but you only have ${have} left. Top up your credits from the Pricing page.`);
          setLoading(false); return;
        }
        if (data.show_upgrade||data.error==='no_access') {
          setError('🔒 You need an active plan to generate this video. Go to Pricing to subscribe.');
          setLoading(false); return;
        }
        throw new Error(data.message||data.error||'Render failed');
      }
      setStep('render');
      timerRef.current = setInterval(()=>setElapsed(e=>e+1), 1000);
      pollRef.current = setInterval(async()=>{
        try {
          const sr = await fetch('/api/render-status/'+data.jobId, { headers:{ Authorization:'Bearer '+localStorage.getItem('token') } });
          const sd = await sr.json();
          if (sd.status==='done') { clearInterval(pollRef.current); clearInterval(timerRef.current); setVideoUrl(sd.videoUrl); setStep('done'); fetchUsage(); }
          else if (sd.status==='failed') { clearInterval(pollRef.current); clearInterval(timerRef.current); setError(sd.error||'Render failed'); setStep('scenes'); }
        } catch {}
      }, 5000);
    } catch(e){ setError(e.message); setStep('scenes'); } finally { setLoading(false); }
  };

  if (step==='done'&&videoUrl) return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(225,29,72,0.08) 0%, #060208 55%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      {showRating && <RatingPrompt modelUsed="Model 5 - Cinematic" onClose={()=>setShowRating(false)} />}
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes pop{0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div style={{ maxWidth:600, width:'100%', textAlign:'center', animation:'fadeUp 0.5s ease' }}>
        <div style={{ fontSize:60, marginBottom:14, animation:'pop 0.5s ease' }}>🎬</div>
        <h2 style={{ fontSize:30, fontWeight:900, color:'#fff', marginBottom:6, letterSpacing:'-0.5px' }}>Cinematic Video Ready!</h2>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:20 }}>
          <span style={{ padding:'4px 12px', borderRadius:999, background:'rgba(225,29,72,0.1)', border:'1px solid rgba(225,29,72,0.25)', fontSize:12, color:'#fb7185', fontWeight:700 }}>{selectedStyle?.emoji} {selectedStyle?.label}</span>
          <span style={{ padding:'4px 12px', borderRadius:999, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', fontSize:12, color:'rgba(255,255,255,0.5)', fontWeight:600 }}>{duration} · {sceneCount} scenes</span>
        </div>
        <div style={{ borderRadius:20, overflow:'hidden', border:'1px solid rgba(225,29,72,0.2)', marginBottom:20, background:'#000', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}>
          <video src={videoUrl} controls style={{ width:'100%', maxHeight:420, display:'block' }} />
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
          <a href={videoUrl} download style={{ background:'linear-gradient(135deg,#e11d48,#9f1239)', color:'#fff', padding:'13px 28px', borderRadius:12, fontWeight:700, fontSize:14, textDecoration:'none', boxShadow:'0 4px 20px rgba(225,29,72,0.4)' }}>⬇️ Download</a>
          <button onClick={()=>{ setStep('input'); setScenes([]); setVideoUrl(null); setIdea(''); setRawPrompt(''); }} style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.1)', padding:'13px 28px', borderRadius:12, fontWeight:600, fontSize:14, cursor:'pointer' }}>🔄 New Video</button>
        </div>
      </div>
    </div>
  );

  if (step==='render') {
    const mins=Math.floor(elapsed/60), secs=elapsed%60;
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at center, rgba(225,29,72,0.07) 0%, #060208 60%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ textAlign:'center', maxWidth:460, animation:'fadeUp 0.4s ease' }}>
          <div style={{ position:'relative', width:96, height:96, margin:'0 auto 32px' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid rgba(225,29,72,0.1)' }} />
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'#e11d48', animation:'spin 0.9s linear infinite' }} />
            <div style={{ position:'absolute', inset:8, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'rgba(225,29,72,0.4)', animation:'spin 1.5s linear infinite reverse' }} />
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30 }}>🎭</div>
          </div>
          <h2 style={{ fontSize:26, fontWeight:900, color:'#fff', marginBottom:8, letterSpacing:'-0.5px' }}>Creating Cinematic Video</h2>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:14, marginBottom:6 }}>Seedance AI — {sceneCount} scenes · {selectedStyle?.emoji} {selectedStyle?.label}</p>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:999, background:'rgba(225,29,72,0.1)', border:'1px solid rgba(225,29,72,0.25)', marginBottom:24 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#e11d48', animation:'pulse 1s ease infinite' }} />
            <span style={{ color:'#fb7185', fontSize:13, fontWeight:700, fontFamily:'monospace' }}>{mins>0?`${mins}m `:''}{secs}s</span>
          </div>
          <div style={{ background:'rgba(225,29,72,0.05)', border:'1px solid rgba(225,29,72,0.15)', borderRadius:14, padding:'14px 20px', fontSize:13, color:'rgba(255,255,255,0.3)', lineHeight:1.8 }}>
            <div>⏱ ~60 seconds per scene</div>
            <div>Character consistency across all {sceneCount} clips</div>
          </div>
          <p style={{ fontSize:12, color:'rgba(255,255,255,0.15)', marginTop:18, animation:'pulse 2s ease infinite' }}>Do not close this tab</p>
        </div>
      </div>
    );
  }

  if (step==='scenes') return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(225,29,72,0.06) 0%, #060208 50%)', padding:'clamp(24px,4vw,40px) clamp(16px,4vw,24px) 80px' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={{ maxWidth:700, margin:'0 auto', animation:'fadeUp 0.4s ease' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
          <button onClick={()=>setStep('input')} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Back</button>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ background:'rgba(225,29,72,0.1)', color:'#fb7185', borderRadius:999, padding:'5px 14px', fontSize:11, fontWeight:700, border:'1px solid rgba(225,29,72,0.25)' }}>{scenes.length} scenes · {selectedStyle?.emoji} {selectedStyle?.label}</span>
          </div>
        </div>
        <div style={{ marginBottom:20 }}>
          <h2 style={{ fontSize:24, fontWeight:900, color:'#fff', margin:'0 0 6px', letterSpacing:'-0.5px' }}>Review Cinematic Scenes</h2>
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', margin:0 }}>Each scene = {({'5s':5,'10s':10,'15s':15}[duration]) || 5} seconds of AI-generated video with character consistency.</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
          {scenes.map((scene,i) => <SceneCard key={i} scene={scene} index={i} onChange={updated=>setScenes(s=>s.map((sc,idx)=>idx===i?updated:sc))} />)}
        </div>
        {error && (
          <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:12, padding:14, marginBottom:16, color:'#ef4444', fontSize:13 }}>
            <span>{error}</span>
            {(error.includes('credits') || error.includes('plan')) && (
              <button onClick={()=>(onNavigate && onNavigate('pricing'))} style={{ display:'block', marginTop:8, background:'none', border:'none', color:'#fb7185', cursor:'pointer', fontWeight:700, textDecoration:'underline', fontSize:13, padding:0 }}>Go to Pricing →</button>
            )}
          </div>
        )}
        <button onClick={handleRender} disabled={loading} style={{ width:'100%', background:loading?'rgba(255,255,255,0.04)':'linear-gradient(135deg,#e11d48,#9f1239)', color:loading?'#4b5563':'#fff', border:'none', borderRadius:14, padding:'16px', fontWeight:800, fontSize:16, cursor:loading?'not-allowed':'pointer', boxShadow:!loading?'0 6px 24px rgba(225,29,72,0.4)':'none', transition:'all 0.2s' }}>
          {loading?'⏳ Starting...':'🎬 Generate Cinematic Video →'}
        </button>
        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.2)', marginTop:10 }}>Seedance v1 Pro · Character consistency · No voiceover</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(225,29,72,0.09) 0%, #060208 50%)', padding:'0 0 80px' }}>
      <style>{`
        @keyframes gradShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes pulse{0%,100%{opacity:0.5}50%{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .char-input:focus{border-color:rgba(225,29,72,0.5)!important;box-shadow:0 0 0 3px rgba(225,29,72,0.08)!important;outline:none}
        .style-card{transition:all 0.2s!important;cursor:pointer}
        .style-card:hover{border-color:rgba(225,29,72,0.4)!important;background:rgba(225,29,72,0.07)!important;transform:translateY(-2px)}
        .mc-section{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;margin-bottom:18px}
        .mc-section-label{font-size:10px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;display:flex;align-items:center;gap:8px}
        .mc-section-label::before{content:'';width:3px;height:12px;border-radius:2px;background:#e11d48;display:inline-block}
        @media(max-width:600px){
          .mc-style-grid{grid-template-columns:repeat(3,1fr)!important;gap:8px!important}
          .mc-dur-grid{grid-template-columns:repeat(3,1fr)!important}
          .mc-ratio-grid{grid-template-columns:repeat(3,1fr)!important}
          .mc-section{padding:14px!important}
        }
      `}</style>

      <div style={{ padding:'clamp(24px,4vw,36px) clamp(16px,4vw,24px) 20px', borderBottom:'1px solid rgba(225,29,72,0.08)', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 0%, rgba(225,29,72,0.1) 0%, transparent 65%)', pointerEvents:'none' }} />
        <div style={{ maxWidth:700, margin:'0 auto', position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Models</button>
            {usage?.access && <button onClick={()=>(onNavigate && onNavigate('pricing'))} style={{ fontSize:11, fontWeight:700, color:'#e11d48', background:'rgba(225,29,72,0.08)', border:'1px solid rgba(225,29,72,0.25)', borderRadius:8, padding:'6px 14px', cursor:'pointer' }}>+ Get More Videos</button>}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:56, height:56, borderRadius:18, background:'linear-gradient(135deg,#e11d48,#9f1239)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0, boxShadow:'0 8px 32px rgba(225,29,72,0.5)' }}>🎭</div>
            <div>
              <div style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'3px 12px', borderRadius:999, background:'rgba(225,29,72,0.15)', border:'1px solid rgba(225,29,72,0.3)', marginBottom:8 }}>
                <span style={{ width:5, height:5, borderRadius:'50%', background:'#e11d48', animation:'pulse 2s ease infinite' }} />
                <span style={{ fontSize:10, color:'#fb7185', fontWeight:800, letterSpacing:'0.1em' }}>ERIVION CINEMATIC</span>
              </div>
              <h1 style={{ fontSize:26, fontWeight:900, color:'#fff', margin:0 }}>
                <span style={{ background:'linear-gradient(90deg,#e11d48,#fb7185,#9f1239,#e11d48)', backgroundSize:'300% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradShift 4s ease infinite' }}>Cinematic</span> AI Video
              </h1>
              <p style={{ margin:'4px 0 0', fontSize:13, color:'#4b5563' }}>No voiceover · Character-consistent · Pure visual storytelling</p>
            </div>
          </div>

          {usage?.access && usage.credits_balance != null && (
            <div style={{ marginTop:16, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'#9ca3af' }}>💎 Credits balance: <strong style={{ color:'#fb7185' }}>{usage.credits_balance.toLocaleString()}</strong></span>
              <button onClick={()=>(onNavigate && onNavigate('pricing'))} style={{ fontSize:11, fontWeight:700, color:'#e11d48', background:'rgba(225,29,72,0.1)', border:'1px solid rgba(225,29,72,0.3)', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>+ Top Up</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth:700, margin:'0 auto', padding:'28px 20px 0' }}>

        {/* Pricing → dedicated Pricing page */}
        <div style={{ marginBottom:24 }}>
          <button onClick={()=>(onNavigate && onNavigate('pricing'))} style={{ width:'100%', background:'rgba(225,29,72,0.06)', border:'1px solid rgba(225,29,72,0.2)', borderRadius:14, padding:'14px 20px', color:'#fb7185', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>💎 View Plans & Pricing</span>
            <span>→</span>
          </button>
        </div>

        {/* Mode toggle: Idea to Video vs Prompt to Video */}
        <div style={{ marginBottom:22 }}>
          <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12, display:'block' }}>🧭 Generation Mode</label>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div onClick={()=>switchMode('idea')} style={{ borderRadius:12, padding:'14px 12px', textAlign:'center', cursor:'pointer', border:`2px solid ${genMode==='idea'?'#e11d48':'rgba(255,255,255,0.07)'}`, background:genMode==='idea'?'rgba(225,29,72,0.1)':'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:genMode==='idea'?'#fb7185':'#fff', marginBottom:3 }}>💡 Idea to Video</div>
              <div style={{ fontSize:10.5, color:'#4b5563' }}>Describe a topic — AI writes the scene prompts</div>
            </div>
            <div onClick={()=>switchMode('prompt')} style={{ borderRadius:12, padding:'14px 12px', textAlign:'center', cursor:'pointer', border:`2px solid ${genMode==='prompt'?'#e11d48':'rgba(255,255,255,0.07)'}`, background:genMode==='prompt'?'rgba(225,29,72,0.1)':'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize:13, fontWeight:800, color:genMode==='prompt'?'#fb7185':'#fff', marginBottom:3 }}>✍️ Prompt to Video</div>
              <div style={{ fontSize:10.5, color:'#4b5563' }}>Write the exact prompt yourself — renders as one 5-15s scene</div>
            </div>
          </div>
        </div>

        {/* Idea or Prompt */}
        {genMode === 'idea' ? (
          <div style={{ marginBottom:22 }}>
            <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, display:'block' }}>🎬 Video Idea / Story</label>
            <textarea value={idea} onChange={e=>setIdea(e.target.value)} className="char-input"
              placeholder="A lone samurai walks through a misty bamboo forest at dawn, searching for his lost honor..." rows={4}
              style={{ width:'100%', padding:'14px 16px', borderRadius:14, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'#fff', fontSize:14, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.7, transition:'all 0.2s' }} />
            <p style={{ fontSize:11, color:'#374151', marginTop:6 }}>{idea.length} characters</p>
          </div>
        ) : (
          <div style={{ marginBottom:22 }}>
            <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, display:'block' }}>✍️ Exact Video Prompt</label>
            <p style={{ fontSize:12, color:'#4b5563', marginBottom:10 }}>Write the precise visual/motion description yourself — we'll only lightly polish grammar, never change your meaning.</p>
            <textarea value={rawPrompt} onChange={e=>setRawPrompt(e.target.value)} className="char-input"
              placeholder="[Image1] is the first frame. A red sports car parked on a cliff road at golden hour, camera slowly pulls back revealing the ocean below, cinematic lighting, gentle wind moving through nearby grass..." rows={4}
              style={{ width:'100%', padding:'14px 16px', borderRadius:14, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'#fff', fontSize:14, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.7, transition:'all 0.2s' }} />
            <p style={{ fontSize:11, color:'#374151', marginTop:6 }}>{rawPrompt.length} characters</p>
          </div>
        )}

        {/* Characters */}
        <div style={{ marginBottom:22 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em' }}>🎭 Characters <span style={{ color:'#374151', fontWeight:400, textTransform:'none', letterSpacing:0 }}>(Optional · Max 5)</span></label>
            {characters.length<5 && <button onClick={addCharacter} style={{ fontSize:12, fontWeight:700, color:'#e11d48', background:'rgba(225,29,72,0.08)', border:'1px solid rgba(225,29,72,0.25)', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>+ Add Character</button>}
          </div>
          <p style={{ fontSize:12, color:'#4b5563', marginBottom:12 }}>
            📸 <strong style={{ color:'#fb7185' }}>New:</strong> Upload a photo of each character — AI will keep their face/look consistent in every scene using image reference (FLUX Kontext).
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {characters.map((char,i) => (
              <div key={char.id} style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(225,29,72,0.15)', borderRadius:14, padding:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ flexShrink:0, width:26, height:26, borderRadius:8, background:'linear-gradient(135deg,rgba(225,29,72,0.2),rgba(159,18,57,0.2))', border:'1px solid rgba(225,29,72,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#fb7185' }}>{i+1}</div>
                  <span style={{ fontSize:12, fontWeight:700, color:'#fb7185' }}>Character {i+1}</span>
                  {characters.length>1 && <button onClick={()=>removeCharacter(char.id)} style={{ marginLeft:'auto', background:'none', border:'none', color:'#374151', cursor:'pointer', fontSize:16 }}>✕</button>}
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  {/* Photo upload */}
                  <label style={{ flexShrink:0, cursor:'pointer' }}>
                    <div style={{ width:64, height:64, borderRadius:12, border:`2px dashed ${char.photo ? '#22c55e' : 'rgba(225,29,72,0.3)'}`, background: char.photo ? 'none' : 'rgba(225,29,72,0.04)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', position:'relative' }}>
                      {char.photoPreview
                        ? <img src={char.photoPreview} alt="ref" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:10 }} />
                        : <div style={{ textAlign:'center' }}><div style={{ fontSize:20 }}>📷</div><div style={{ fontSize:9, color:'#6b7280', marginTop:2 }}>Photo</div></div>
                      }
                    </div>
                    <input type="file" accept="image/*" onChange={e=>updateCharacterPhoto(char.id, e.target.files[0])} style={{ display:'none' }} />
                  </label>
                  {/* Prompt */}
                  <textarea value={char.prompt} onChange={e=>updateCharacter(char.id,e.target.value)} className="char-input"
                    placeholder={`Describe Character ${i+1} (or upload photo above):\ne.g. "A tall warrior with dark hair, silver armor, serious expression"`}
                    rows={3} style={{ flex:1, padding:'10px 12px', borderRadius:12, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.03)', color:'#fff', fontSize:13, resize:'none', fontFamily:'inherit', boxSizing:'border-box', transition:'all 0.2s' }} />
                </div>
                {char.photo && <div style={{ marginTop:6, fontSize:11, color:'#22c55e', fontWeight:600 }}>✓ Photo uploaded — AI will reference this face in every scene</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Video Style */}
        <div style={{ marginBottom:22 }}>
          <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12, display:'block' }}>🎨 Video Style</label>
          <div className="mc-style-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {VIDEO_STYLES.map(s => (
              <div key={s.key} onClick={()=>setVideoStyle(s.key)} className="style-card"
                style={{ padding:'14px 10px', borderRadius:12, cursor:'pointer', textAlign:'center', border:`1px solid ${videoStyle===s.key?'rgba(225,29,72,0.6)':'rgba(255,255,255,0.07)'}`, background:videoStyle===s.key?'rgba(225,29,72,0.1)':'rgba(255,255,255,0.02)', transition:'all 0.15s', boxShadow:videoStyle===s.key?'0 0 16px rgba(225,29,72,0.2)':'none' }}>
                <div style={{ fontSize:22, marginBottom:6 }}>{s.emoji}</div>
                <div style={{ fontSize:12, fontWeight:700, color:videoStyle===s.key?'#fb7185':'#fff', marginBottom:3 }}>{s.label}</div>
                <div style={{ fontSize:10, color:'#4b5563', lineHeight:1.3 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Duration */}
        <div style={{ marginBottom:22 }}>
          <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12, display:'block' }}>⏱ Duration</label>
          <div className="mc-dur-grid" style={{ display:'grid', gridTemplateColumns: genMode==='prompt' ? '1fr 1fr 1fr' : '1fr 1fr', gap:12 }}>
            {(genMode==='prompt'
              ? [{value:'5s',label:'5 Seconds',scenes:1},{value:'10s',label:'10 Seconds',scenes:1},{value:'15s',label:'15 Seconds',scenes:1}]
              : [{value:'15s',label:'15 Seconds',scenes:3},{value:'30s',label:'30 Seconds',scenes:6},{value:'1min',label:'1 Minute',scenes:12}]
            ).map(d => {
              const allowed = userPlan !== 'free';
              return (
                <div key={d.value} onClick={()=>allowed ? setDuration(d.value) : (onNavigate && onNavigate('pricing'))}
                  style={{ borderRadius:14, padding:'18px 16px', textAlign:'center', cursor:'pointer', border:`2px solid ${duration===d.value&&allowed?'#e11d48':'rgba(255,255,255,0.07)'}`, background:duration===d.value&&allowed?'rgba(225,29,72,0.1)':'rgba(255,255,255,0.02)', opacity: allowed ? 1 : 0.4, transition:'all 0.15s', position:'relative', boxShadow:duration===d.value&&allowed?'0 0 20px rgba(225,29,72,0.2)':'none' }}>
                  {!allowed && <div style={{ position:'absolute', top:8, right:10, fontSize:12 }}>🔒</div>}
                  <p style={{ margin:'0 0 4px', fontSize:18, fontWeight:900, color:duration===d.value&&allowed?'#fb7185':'#fff' }}>{d.label}</p>
                  <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>{genMode==='prompt' ? 'single scene' : `${d.scenes} cinematic scenes`}</p>
                  {!allowed && <p style={{ margin:'4px 0 0', fontSize:9, color:'#ef4444', fontWeight:700 }}>Subscribe to unlock</p>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Ratio */}
        <div style={{ marginBottom:28 }}>
          <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, display:'block' }}>📐 Aspect Ratio</label>
          <div style={{ display:'flex', gap:10 }}>
            {['9:16','16:9','1:1'].map(r => (
              <button key={r} onClick={()=>setRatio(r)} style={{ flex:1, padding:'10px', borderRadius:10, border:`1px solid ${ratio===r?'#e11d48':'rgba(255,255,255,0.07)'}`, background:ratio===r?'rgba(225,29,72,0.15)':'transparent', color:ratio===r?'#fb7185':'#4b5563', fontSize:12, fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>{r}</button>
            ))}
          </div>
        </div>

        {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:14, marginBottom:16, color:'#ef4444', fontSize:13 }}>{error}</div>}

        {userPlan !== 'free' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:16 }}>
            <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(225,29,72,0.12)', border:'1px solid rgba(225,29,72,0.3)', fontSize:12, fontWeight:700, color:'#fb7185' }}>
              🪙 {creditCost} credits per video
            </div>
          </div>
        )}

        <button onClick={handleGenerate} disabled={userPlan !== 'free' && (loading||(genMode==='prompt'?!rawPrompt.trim():!idea.trim()))} style={{ width:'100%', background:(userPlan !== 'free' && (loading||(genMode==='prompt'?!rawPrompt.trim():!idea.trim())))?'rgba(255,255,255,0.04)':'linear-gradient(135deg,#e11d48,#9f1239)', color:(userPlan !== 'free' && (loading||(genMode==='prompt'?!rawPrompt.trim():!idea.trim())))?'#374151':'#fff', border:'none', borderRadius:14, padding:'17px', fontWeight:900, fontSize:17, cursor:(userPlan !== 'free' && (loading||(genMode==='prompt'?!rawPrompt.trim():!idea.trim())))?'not-allowed':'pointer', boxShadow:(genMode==='prompt'?rawPrompt.trim():idea.trim())?'0 6px 32px rgba(225,29,72,0.45)':'none', transition:'all 0.2s' }}>
          {userPlan === 'free' ? '🔒 Subscribe to Generate →' : loading?'⏳ Generating Scenes...':(genMode==='prompt' ? `🎬 Generate ${duration} Video — ${creditCost} Credits →` : `🎬 Generate ${sceneCount} Cinematic Scenes — ${creditCost} Credits →`)}
        </button>

        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.15)', marginTop:14 }}>Seedance v1 Pro · Groq AI · Character consistency · No voiceover</p>
      </div>

    </div>
  );
}