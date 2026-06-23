import React, { useState, useEffect, useRef } from 'react';

const INSTAPAY_NUMBER = import.meta.env.VITE_INSTAPAY_NUMBER || '01091917832';

const MC_PLANS = [
  { key:'mc_starter', name:'Starter', icon:'🎬', price_egp:550, price_usd:22, videos_15s:5, videos_30s:0, videos_1min:0, color:'#fb7185', glow:'rgba(251,113,133,0.3)', features:['5 × 15s cinematic videos','Up to 5 characters','Seedance 2.0 Fast','With original audio'] },
  { key:'mc_pro', name:'Pro', icon:'🎥', price_egp:1050, price_usd:38, videos_15s:0, videos_30s:5, videos_1min:0, badge:'Most Popular', color:'#e11d48', glow:'rgba(225,29,72,0.35)', features:['5 × 30s cinematic videos','Up to 5 characters','Seedance 2.0 Fast','With original audio'] },
  { key:'mc_max', name:'Max', icon:'🏆', price_egp:2200, price_usd:72, videos_15s:0, videos_30s:0, videos_1min:5, color:'#9f1239', glow:'rgba(159,18,57,0.3)', features:['5 × 1min cinematic videos','Up to 5 characters','Seedance 2.0 Fast','With original audio'] },
];

const MC_GUMROAD = {
  mc_starter: 'https://digiwhirl23.gumroad.com/l/dnkam',
  mc_pro:     'https://digiwhirl23.gumroad.com/l/gohhdt',
  mc_max:     'https://digiwhirl23.gumroad.com/l/ukgdl',
};

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

function PaymentModal({ onClose, fetchUsage }) {
  const [selectedPlan, setSelectedPlan] = useState('mc_pro');
  const [step, setStep] = useState('select');
  const [email, setEmail] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [intlDone, setIntlDone] = useState(false);
  const fileRef = useRef();
  const region = localStorage.getItem('erivion_region') || 'eg';
  const plan = MC_PLANS.find(p=>p.key===selectedPlan);

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setScreenshot(ev.target.result); setPreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!email||!screenshot) { setError('Please fill all fields'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/model5/payment-request', { method:'POST', headers:authHeaders(), body:JSON.stringify({ plan:plan.key, planName:plan.name, amount:plan.price_egp, userEmail:email, screenshot }) });
      if (!res.ok) throw new Error((await res.json()).error||'Failed');
      setStep('done');
    } catch(e){ setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, backdropFilter:'blur(8px)' }}>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      <div style={{ background:'linear-gradient(135deg,#0d0508,#100308)', border:'1px solid rgba(225,29,72,0.25)', borderRadius:24, width:'100%', maxWidth:500, maxHeight:'92vh', overflowY:'auto', animation:'modalIn 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        {step==='done' ? (
          <div style={{ padding:48, textAlign:'center' }}>
            <div style={{ fontSize:72, marginBottom:20 }}>🎬</div>
            <h3 style={{ fontSize:24, fontWeight:900, color:'#fff', marginBottom:12 }}>Request Submitted!</h3>
            <p style={{ color:'#9ca3af', fontSize:14, lineHeight:1.8, marginBottom:28 }}>We'll activate your Cinematic plan within a few hours.</p>
            <button onClick={()=>{ onClose(); if(fetchUsage) fetchUsage(); }} style={{ background:'linear-gradient(135deg,#e11d48,#9f1239)', color:'#fff', border:'none', borderRadius:12, padding:'13px 36px', fontWeight:700, fontSize:15, cursor:'pointer' }}>Got it! 🚀</button>
          </div>
        ) : step==='intl' ? (
          <div style={{ padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <button onClick={()=>setStep('select')} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:18 }}>←</button>
              <div>
                <h2 style={{ fontSize:18, fontWeight:900, margin:0, color:'#fff' }}>{plan?.icon} {plan?.name} — International</h2>
                <p style={{ margin:0, fontSize:12, color:plan?.color }}>${plan?.price_usd}/month</p>
              </div>
              <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>
            {intlDone ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:64, marginBottom:16 }}>⏳</div>
                <h3 style={{ fontSize:20, fontWeight:800, color:'#fff', marginBottom:12 }}>Request Submitted!</h3>
                <p style={{ color:'#9ca3af', fontSize:14, lineHeight:1.8, marginBottom:24 }}>We'll verify your Gumroad payment and activate your plan within <strong style={{ color:'#22c55e' }}>24 hours</strong>.</p>
                <button onClick={onClose} style={{ background:'linear-gradient(135deg,#e11d48,#9f1239)', color:'#fff', border:'none', borderRadius:12, padding:'13px 36px', fontWeight:700, fontSize:15, cursor:'pointer' }}>Got it! 🚀</button>
              </div>
            ) : (
              <>
                <div style={{ background:'rgba(225,29,72,0.06)', border:'1px solid rgba(225,29,72,0.2)', borderRadius:14, padding:18, marginBottom:20 }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#fb7185', margin:'0 0 14px' }}>💳 How to subscribe:</p>
                  {['Click "Pay on Gumroad" below','Complete payment with your card',"Come back here and click \"I've Paid\"","We'll verify and activate within 24h"].map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                      <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(225,29,72,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fb7185', flexShrink:0 }}>{i+1}</div>
                      <span style={{ fontSize:13, color:'#d1d5db' }}>{s}</span>
                    </div>
                  ))}
                </div>
                <a href={MC_GUMROAD[selectedPlan]} target="_blank" rel="noreferrer"
                  style={{ display:'block', width:'100%', padding:'14px', borderRadius:12, background:'linear-gradient(135deg,#e11d48,#9f1239)', color:'#fff', fontWeight:700, fontSize:15, textAlign:'center', textDecoration:'none', marginBottom:10, boxSizing:'border-box' }}>
                  🔗 Pay on Gumroad — ${plan?.price_usd}
                </a>
                <button onClick={async()=>{
                  try {
                    const res = await fetch('/api/auth/intl-payment/request', {
                      method:'POST', headers:authHeaders(),
                      body:JSON.stringify({ planKey:selectedPlan, planName:'Cinematic '+plan?.name, usdPrice:plan?.price_usd }),
                    });
                    if(res.ok) setIntlDone(true);
                  } catch(e){}
                }}
                  style={{ width:'100%', padding:'13px', borderRadius:12, border:'1px solid rgba(225,29,72,0.4)', background:'rgba(255,255,255,0.04)', color:'#fb7185', fontWeight:700, fontSize:14, cursor:'pointer' }}>
                  ✅ I've Paid — Notify Admin
                </button>
              </>
            )}
          </div>
        ) : step==='select' ? (
          <div style={{ padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:28 }}>
              <div>
                <h2 style={{ fontSize:20, fontWeight:900, color:'#fff', margin:0 }}>🎬 Erivion Cinematic</h2>
                <p style={{ fontSize:12, color:'#6b7280', margin:'4px 0 0' }}>Choose your plan</p>
              </div>
              <button onClick={onClose} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#6b7280', cursor:'pointer', fontSize:13, padding:'6px 12px' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:24 }}>
              {MC_PLANS.map(p => (
                <div key={p.key} onClick={()=>setSelectedPlan(p.key)}
                  style={{ border:`2px solid ${selectedPlan===p.key?p.color:'rgba(255,255,255,0.07)'}`, borderRadius:16, padding:'18px 20px', cursor:'pointer', background:selectedPlan===p.key?`${p.color}12`:'transparent', transition:'all 0.15s', position:'relative', boxShadow:selectedPlan===p.key?`0 0 24px ${p.glow}`:'none' }}>
                  {p.badge && <div style={{ position:'absolute', top:-10, right:16, padding:'2px 12px', borderRadius:999, background:p.color, fontSize:10, fontWeight:800, color:'#fff' }}>{p.badge}</div>}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <span style={{ fontWeight:900, fontSize:17, color:selectedPlan===p.key?p.color:'#fff' }}>{p.icon} {p.name}</span>
                    <span style={{ fontSize:22, fontWeight:900, color:'#22c55e' }}>
                      {region === 'intl' ? `$${p.price_usd}` : p.price_egp}
                      <span style={{ fontSize:11, color:'#6b7280', fontWeight:400 }}>{region === 'intl' ? ' USD' : ' EGP'}</span>
                    </span>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {p.videos_15s>0 && <span style={{ fontSize:11, color:'#9ca3af', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', padding:'2px 10px', borderRadius:20 }}>🎬 {p.videos_15s}×15s</span>}
                    {p.videos_30s>0 && <span style={{ fontSize:11, color:'#9ca3af', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', padding:'2px 10px', borderRadius:20 }}>🎬 {p.videos_30s}×30s</span>}
                    {p.videos_1min>0 && <span style={{ fontSize:11, color:'#9ca3af', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', padding:'2px 10px', borderRadius:20 }}>🎬 {p.videos_1min}×1min</span>}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={()=> region === 'intl' ? setStep('intl') : setStep('pay')} style={{ width:'100%', background:`linear-gradient(135deg,#e11d48,#9f1239)`, color:'#fff', border:'none', borderRadius:12, padding:'15px', fontWeight:800, fontSize:16, cursor:'pointer', boxShadow:`0 4px 24px ${plan?.glow}` }}>
              {region === 'intl' ? `Pay $${plan?.price_usd} — Gumroad →` : `Subscribe to ${plan?.name} — ${plan?.price_egp} EGP →`}
            </button>
          </div>
        ) : (
          <div style={{ padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <button onClick={()=>setStep('select')} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:18 }}>←</button>
              <div>
                <h2 style={{ fontSize:18, fontWeight:900, margin:0, color:'#fff' }}>Complete Payment</h2>
                <p style={{ margin:0, fontSize:12, color:plan?.color }}>{plan?.name} — {plan?.price_egp} EGP</p>
              </div>
            </div>
            <div style={{ background:'rgba(225,29,72,0.06)', border:'1px solid rgba(225,29,72,0.2)', borderRadius:14, padding:18, marginBottom:18 }}>
              <p style={{ fontSize:13, fontWeight:700, color:'#fb7185', margin:'0 0 12px' }}>💳 Payment Steps</p>
              {['Open InstaPay app',`Transfer ${plan?.price_egp} EGP to:`,'Screenshot the transfer','Upload below ⬇️'].map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:'rgba(225,29,72,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fb7185', flexShrink:0 }}>{i+1}</div>
                  <span style={{ fontSize:13, color:'#d1d5db' }}>{s}</span>
                </div>
              ))}
              <div style={{ margin:'14px 0 0', padding:'12px 16px', background:'rgba(0,0,0,0.4)', border:'1px solid rgba(225,29,72,0.3)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:1 }}>{INSTAPAY_NUMBER}</span>
                <button onClick={()=>{ navigator.clipboard?.writeText(INSTAPAY_NUMBER); setCopied(true); setTimeout(()=>setCopied(false),2000); }} style={{ padding:'6px 14px', borderRadius:8, background:copied?'rgba(34,197,94,0.2)':'rgba(225,29,72,0.2)', border:`1px solid ${copied?'rgba(34,197,94,0.4)':'rgba(225,29,72,0.4)'}`, color:copied?'#22c55e':'#fb7185', cursor:'pointer', fontSize:12, fontWeight:600 }}>
                  {copied?'✓ Copied':'Copy'}
                </button>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:16 }}>
              <input type="email" placeholder="Your email address *" value={email} onChange={e=>setEmail(e.target.value)} style={{ padding:'12px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:14, outline:'none', fontFamily:'inherit' }} />
              <div onClick={()=>fileRef.current?.click()} style={{ border:`2px dashed ${preview?'#22c55e':'rgba(225,29,72,0.3)'}`, borderRadius:12, padding:24, textAlign:'center', cursor:'pointer' }}>
                {preview?<img src={preview} alt="receipt" style={{ maxHeight:120, borderRadius:8, maxWidth:'100%' }} />:<><div style={{ fontSize:32, marginBottom:8 }}>📎</div><p style={{ color:'#6b7280', fontSize:13, margin:0 }}>Click to upload transfer screenshot</p></>}
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display:'none' }} />
              </div>
            </div>
            {error && <p style={{ color:'#ef4444', fontSize:13, marginBottom:12 }}>{error}</p>}
            <button onClick={handleSubmit} disabled={loading||!screenshot||!email} style={{ width:'100%', background:loading||!screenshot||!email?'rgba(255,255,255,0.05)':'linear-gradient(135deg,#e11d48,#9f1239)', color:loading||!screenshot||!email?'#4b5563':'#fff', border:'none', borderRadius:12, padding:'14px', fontWeight:700, fontSize:15, cursor:loading||!screenshot||!email?'not-allowed':'pointer' }}>
              {loading?'⏳ Submitting...':'✅ Submit Payment Request'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
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

export default function ModelCinematicPage({ onBack, model5Access, model5Plan, onNavigate }) {
  const [step, setStep] = useState('input');
  const [idea, setIdea] = useState('');
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
  const [showPayment, setShowPayment] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const region = localStorage.getItem('erivion_region') || 'eg';

  useEffect(() => { fetchUsage(); }, []);
  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);

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
  const sceneCount = duration==='1min'?12:duration==='30s'?6:1;

  const handleGenerate = async () => {
    if (!idea.trim()) { setError('Please describe your video idea'); return; }
    setLoading(true); setError('');
    try {
      const validChars = characters
        .filter(c => c.prompt.trim() || c.photo)
        .map(c => ({ prompt: c.prompt, photo: c.photo || null }));
      const res = await fetch('/api/model5/generate-scenes', {
        method:'POST', headers:authHeaders(),
        body:JSON.stringify({ idea, characters:validChars, duration, videoStyle, styleSuffix:selectedStyle?.suffix })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||'Failed');
      setScenes(data.scenes||[]); setStep('scenes');
    } catch(e){ setError(e.message); } finally { setLoading(false); }
  };

  const handleRender = async () => {
    setLoading(true); setError(''); setElapsed(0);
    try {
      const res = await fetch('/api/model5/render', { method:'POST', headers:authHeaders(), body:JSON.stringify({ scenes, ratio, duration, characterPhotos: characterPhotos.map(p => p.photo) }) });
      const data = await res.json();
      if (!res.ok) {
        if (data.show_upgrade||data.error==='no_access') { setShowPayment(true); setLoading(false); return; }
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
          <button onClick={()=>{ setStep('input'); setScenes([]); setVideoUrl(null); setIdea(''); }} style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.1)', padding:'13px 28px', borderRadius:12, fontWeight:600, fontSize:14, cursor:'pointer' }}>🔄 New Video</button>
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
          <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', margin:0 }}>Each scene = {duration === '15s' ? '15' : '5'} seconds of AI-generated video with character consistency.</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:24 }}>
          {scenes.map((scene,i) => <SceneCard key={i} scene={scene} index={i} onChange={updated=>setScenes(s=>s.map((sc,idx)=>idx===i?updated:sc))} />)}
        </div>
        {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:12, padding:14, marginBottom:16, color:'#ef4444', fontSize:13 }}>{error}</div>}
        <button onClick={handleRender} disabled={loading} style={{ width:'100%', background:loading?'rgba(255,255,255,0.04)':'linear-gradient(135deg,#e11d48,#9f1239)', color:loading?'#4b5563':'#fff', border:'none', borderRadius:14, padding:'16px', fontWeight:800, fontSize:16, cursor:loading?'not-allowed':'pointer', boxShadow:!loading?'0 6px 24px rgba(225,29,72,0.4)':'none', transition:'all 0.2s' }}>
          {loading?'⏳ Starting...':'🎬 Generate Cinematic Video →'}
        </button>
        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.2)', marginTop:10 }}>Seedance v1 Pro · Character consistency · No voiceover</p>
      </div>
      {showPayment && <PaymentModal onClose={()=>setShowPayment(false)} fetchUsage={fetchUsage} />}
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
            {usage?.access && <button onClick={()=>setShowPayment(true)} style={{ fontSize:11, fontWeight:700, color:'#e11d48', background:'rgba(225,29,72,0.08)', border:'1px solid rgba(225,29,72,0.25)', borderRadius:8, padding:'6px 14px', cursor:'pointer' }}>+ Get More Videos</button>}
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

          {usage?.access && (
            <div style={{ marginTop:16, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'12px 16px', display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
              {[{label:'15s',used:usage.usage?.videos_15s||0,quota:usage.quota?.videos_15s||0},{label:'30s',used:usage.usage?.videos_30s||0,quota:usage.quota?.videos_30s||0},{label:'1min',used:usage.usage?.videos_1min||0,quota:usage.quota?.videos_1min||0}].filter(u=>u.quota>0).map(u=>{
                const pct=Math.min((u.used/u.quota)*100,100);
                const color=pct>=100?'#ef4444':pct>=70?'#f59e0b':'#22c55e';
                return (
                  <div key={u.label} style={{ flex:1, minWidth:100 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:11, color:'#6b7280' }}>{u.label} videos</span>
                      <span style={{ fontSize:11, fontWeight:700, color }}>{u.used}/{u.quota}</span>
                    </div>
                    <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:99, overflow:'hidden' }}>
                      <div style={{ width:pct+'%', height:'100%', background:`linear-gradient(90deg,${color},${color}88)`, borderRadius:99 }} />
                    </div>
                  </div>
                );
              })}
              <button onClick={()=>setShowPayment(true)} style={{ fontSize:11, fontWeight:700, color:'#e11d48', background:'rgba(225,29,72,0.1)', border:'1px solid rgba(225,29,72,0.3)', borderRadius:8, padding:'5px 12px', cursor:'pointer' }}>+ Get More</button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth:700, margin:'0 auto', padding:'28px 20px 0' }}>

        {/* Pricing Toggle */}
        <div style={{ marginBottom:24 }}>
          <button onClick={()=>setShowPricing(!showPricing)} style={{ width:'100%', background:'rgba(225,29,72,0.06)', border:'1px solid rgba(225,29,72,0.2)', borderRadius:14, padding:'14px 20px', color:'#fb7185', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>💎 Plans & Pricing</span>
            <span style={{ transition:'transform 0.2s', transform:showPricing?'rotate(180deg)':'none', display:'inline-block' }}>⌄</span>
          </button>
          {showPricing && (
            <div style={{ marginTop:12, display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {MC_PLANS.map(p => (
                <div key={p.key} style={{ background:'linear-gradient(135deg,rgba(225,29,72,0.08),rgba(0,0,0,0.5))', border:`1px solid ${p.color}33`, borderRadius:14, padding:16, textAlign:'center', position:'relative' }}>
                  {p.badge && <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', padding:'2px 10px', borderRadius:999, background:p.color, fontSize:9, fontWeight:800, color:'#fff', whiteSpace:'nowrap' }}>{p.badge}</div>}
                  <div style={{ fontSize:22, marginBottom:6 }}>{p.icon}</div>
                  <div style={{ fontSize:14, fontWeight:800, color:'#fff', marginBottom:6 }}>{p.name}</div>
                  <div style={{ fontSize:20, fontWeight:900, color:p.color, marginBottom:8 }}>
                    {region === 'intl' ? `$${p.price_usd}` : p.price_egp}
                    <span style={{ fontSize:10, color:'#6b7280' }}>{region === 'intl' ? ' USD' : ' EGP'}</span>
                  </div>
                  {p.videos_15s>0 && <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>{p.videos_15s} × 15s</div>}
                  {p.videos_30s>0 && <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>{p.videos_30s} × 30s</div>}
                  {p.videos_1min>0 && <div style={{ fontSize:11, color:'#6b7280', marginBottom:8 }}>{p.videos_1min} × 1min</div>}
                  <button onClick={()=>setShowPayment(true)} style={{ width:'100%', background:`linear-gradient(135deg,${p.color},${p.color}88)`, color:'#fff', border:'none', borderRadius:8, padding:'8px', fontWeight:700, fontSize:12, cursor:'pointer' }}>Subscribe →</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Idea */}
        <div style={{ marginBottom:22 }}>
          <label style={{ fontSize:11, fontWeight:800, color:'#fb7185', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10, display:'block' }}>🎬 Video Idea / Story</label>
          <textarea value={idea} onChange={e=>setIdea(e.target.value)} className="char-input"
            placeholder="A lone samurai walks through a misty bamboo forest at dawn, searching for his lost honor..." rows={4}
            style={{ width:'100%', padding:'14px 16px', borderRadius:14, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', color:'#fff', fontSize:14, resize:'vertical', fontFamily:'inherit', boxSizing:'border-box', lineHeight:1.7, transition:'all 0.2s' }} />
          <p style={{ fontSize:11, color:'#374151', marginTop:6 }}>{idea.length} characters</p>
        </div>

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
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[{value:'15s',label:'15 Seconds',scenes:3},{value:'30s',label:'30 Seconds',scenes:6},{value:'1min',label:'1 Minute',scenes:12}].map(d => {
              const allowed = model5Access?(d.value==='15s'?(usage?.quota?.videos_15s||0)>0:d.value==='30s'?(usage?.quota?.videos_30s||0)>0:(usage?.quota?.videos_1min||0)>0):d.value==='15s';
              return (
                <div key={d.value} onClick={()=>allowed&&setDuration(d.value)}
                  style={{ borderRadius:14, padding:'18px 16px', textAlign:'center', cursor:allowed?'pointer':'not-allowed', border:`2px solid ${duration===d.value&&allowed?'#e11d48':'rgba(255,255,255,0.07)'}`, background:duration===d.value&&allowed?'rgba(225,29,72,0.1)':'rgba(255,255,255,0.02)', opacity:allowed?1:0.35, transition:'all 0.15s', position:'relative', boxShadow:duration===d.value&&allowed?'0 0 20px rgba(225,29,72,0.2)':'none' }}>
                  {!allowed && <div style={{ position:'absolute', top:8, right:10, fontSize:12 }}>🔒</div>}
                  <p style={{ margin:'0 0 4px', fontSize:18, fontWeight:900, color:duration===d.value&&allowed?'#fb7185':'#fff' }}>{d.label}</p>
                  <p style={{ margin:0, fontSize:11, color:'#4b5563' }}>{d.scenes} cinematic scenes</p>
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

        {!model5Access ? (
          <button onClick={()=>setShowPayment(true)} style={{ width:'100%', background:'linear-gradient(135deg,#e11d48,#9f1239)', color:'#fff', border:'none', borderRadius:14, padding:'17px', fontWeight:900, fontSize:17, cursor:'pointer', boxShadow:'0 6px 32px rgba(225,29,72,0.45)' }}>
            🎬 Subscribe to Get Started →
          </button>
        ) : (
          <button onClick={handleGenerate} disabled={loading||!idea.trim()} style={{ width:'100%', background:loading||!idea.trim()?'rgba(255,255,255,0.04)':'linear-gradient(135deg,#e11d48,#9f1239)', color:loading||!idea.trim()?'#374151':'#fff', border:'none', borderRadius:14, padding:'17px', fontWeight:900, fontSize:17, cursor:loading||!idea.trim()?'not-allowed':'pointer', boxShadow:idea.trim()?'0 6px 32px rgba(225,29,72,0.45)':'none', transition:'all 0.2s' }}>
            {loading?'⏳ Generating Scenes...':`🎬 Generate ${sceneCount} Cinematic Scenes →`}
          </button>
        )}

        <p style={{ textAlign:'center', fontSize:11, color:'rgba(255,255,255,0.15)', marginTop:14 }}>Seedance v1 Pro · Groq AI · Character consistency · No voiceover</p>
      </div>

      {showPayment && <PaymentModal onClose={()=>{ setShowPayment(false); fetchUsage(); }} fetchUsage={fetchUsage} />}
    </div>
  );
}