import React, { useState, useEffect, useRef } from 'react';
import {
  Clapperboard, Camera, Landmark, Wand2, Palette, Gamepad2, Zap, Video,
  VolumeX, Mic, Volume2, Lightbulb, FileText, Wallet, User, MessageSquare,
  Coins, PartyPopper, Download, RefreshCw, Film,
} from 'lucide-react';

const VIDEO_STYLES_M8 = [
  { key: 'cinematic',   label: 'Cinematic',   icon: Clapperboard, desc: 'Dramatic · Film-like',    suffix: 'cinematic photography, dramatic lighting, film grain, shallow depth of field, professional color grading' },
  { key: 'realistic',   label: 'Realistic',   icon: Camera,       desc: 'Real · Photographic',     suffix: 'photorealistic, natural lighting, high detail, documentary style, authentic' },
  { key: 'historical',  label: 'Historical',  icon: Landmark,     desc: 'Ancient · Epic',           suffix: 'historical epic, ancient world, dramatic atmosphere, oil painting style, cinematic, period-accurate' },
  { key: 'anime',       label: 'Anime',       icon: Wand2,        desc: 'Japanese · Animated',     suffix: 'anime style, vibrant colors, detailed illustration, studio ghibli inspired, cel shading' },
  { key: 'cartoon',     label: 'Cartoon',     icon: Palette,      desc: 'Animated · Colorful',     suffix: 'cartoon style, bright vivid colors, 2D animation, fun and expressive, pixar inspired' },
  { key: '3d_cartoon',  label: '3D Cartoon',  icon: Gamepad2,     desc: '3D · Rendered',            suffix: '3D rendered cartoon style, smooth colorful surfaces, pixar style 3D animation' },
  { key: 'action',      label: 'Action',      icon: Zap,          desc: 'Dynamic · Epic',           suffix: 'action scene, dynamic motion blur, explosive energy, dramatic angles, high contrast' },
  { key: 'documentary', label: 'Documentary', icon: Video,        desc: 'Real · Journalistic',      suffix: 'documentary style, natural lighting, photorealistic, journalistic photography, authentic atmosphere' },
];

const AUDIO_MODES = [
  { key: 'none',      icon: VolumeX, label: 'Silent',    desc: '4 credits/sec', rate: 4 },
  { key: 'voiceover', icon: Mic,     label: 'Voiceover',  desc: 'AI narration (Gemini)', rate: 5 },
  { key: 'cinematic', icon: Volume2, label: 'Cinematic',  desc: 'Native scene audio',    rate: 6 },
];

// ── Editable Scene Card (same as Model 4) ─────────────────────────────────
function EditableSceneCard({ scene, index, onChange }) {
  const [editingText, setEditingText] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [localText, setLocalText] = useState(scene.text);
  const [localPrompt, setLocalPrompt] = useState(scene.prompt);

  const saveText = () => { setEditingText(false); if (localText.trim()) onChange({ ...scene, text: localText.trim() }); };
  const savePrompt = () => { setEditingPrompt(false); if (localPrompt.trim()) onChange({ ...scene, prompt: localPrompt.trim() }); };

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
        <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>#{index + 1}</span>
        {editingText ? (
          <textarea value={localText} onChange={e => setLocalText(e.target.value)} onBlur={saveText} autoFocus rows={3}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.07)', color: '#fff', fontSize: 13, lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', outline: 'none' }} />
        ) : (
          <p onClick={() => setEditingText(true)} title="Click to edit" style={{ margin: 0, fontSize: 13, color: '#d1d5db', lineHeight: 1.6, flex: 1, cursor: 'text' }}>{scene.text}</p>
        )}
        <button onClick={() => { setLocalText(scene.text); setEditingText(!editingText); }}
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          {editingText ? 'Done' : 'Edit'}
        </button>
      </div>
      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ color: '#4b5563', flexShrink: 0, marginTop: 2, display: 'flex' }}><Clapperboard size={13} strokeWidth={2} /></span>
        {editingPrompt ? (
          <textarea value={localPrompt} onChange={e => setLocalPrompt(e.target.value)} onBlur={savePrompt} autoFocus rows={3}
            style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)', color: '#9ca3af', fontSize: 11, fontFamily: 'monospace', lineHeight: 1.5, resize: 'none', outline: 'none' }} />
        ) : (
          <p onClick={() => setEditingPrompt(true)} title="Click to edit prompt" style={{ margin: 0, fontSize: 11, color: '#4b5563', fontFamily: 'monospace', lineHeight: 1.5, flex: 1, cursor: 'text' }}>{scene.prompt}</p>
        )}
        <button onClick={() => { setLocalPrompt(scene.prompt); setEditingPrompt(!editingPrompt); }}
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          {editingPrompt ? 'Done' : 'Edit'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Model8Page({ onBack, userPlan = 'free', onNavigate }) {
  const [mode, setMode] = useState('idea');
  const [idea, setIdea] = useState('');
  const [script, setScript] = useState('');
  const [sceneDurationSec, setSceneDurationSec] = useState(5); // 5 أو 10
  const [totalDurationSec, setTotalDurationSec] = useState(30); // لحد 600 (10 دقايق)
  const [ratio, setRatio] = useState('9:16');
  const [videoLanguage, setVideoLanguage] = useState('en');
  const [audioMode, setAudioMode] = useState('none');
  const [captions, setCaptions] = useState(true);
  const [videoStyle, setVideoStyle] = useState('cinematic');
  const [characterPhoto, setCharacterPhoto] = useState(null); // base64 data URL
  const photoRef = useRef();
  const [scenes, setScenes] = useState([]);
  const [step, setStep] = useState('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const pollRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => { clearInterval(pollRef.current); clearInterval(timerRef.current); }, []);

  // ✅ FIX: كان ممكن توصل لـ totalDurationSec == sceneDurationSec (طرف الـ slider) فيطلع
  // sceneCount = 1 من غير قصد — طلب واحد بس لـ Replicate، فيديو لقطة واحدة مستمرة بدل فيديو
  // مقسّم مشاهد. دلوقتي بنضمن مشهدين على الأقل دايمًا: لو المستخدم غيّر "SCENE LENGTH" وخلى
  // totalDurationSec الحالي أقل من ضعف القيمة الجديدة، بنرفعه تلقائيًا لأقل حد آمن.
  useEffect(() => {
    setTotalDurationSec(prev => Math.max(prev, sceneDurationSec * 2));
  }, [sceneDurationSec]);

  const sceneCount = Math.max(2, Math.round(totalDurationSec / sceneDurationSec));
  // ✅ نفس تسعير الباك إند بالظبط: 4 كريديت/ثانية + سرشارج الصوت — لو الرقمين اتغيروا في
  // index.js لازم يتحدثوا هنا كمان يدويًا (مفيش endpoint تسعير منفصل لموديل 8 حاليًا)
  const RATE_NONE = 4, RATE_VOICEOVER = 5, RATE_CINEMATIC = 6;
  const m8Rate = audioMode === 'voiceover' ? RATE_VOICEOVER : audioMode === 'cinematic' ? RATE_CINEMATIC : RATE_NONE;
  const creditCost = sceneCount * sceneDurationSec * m8Rate;

  const MAX_SCRIPT_CHARS = 6000; // فيديو أطول بكتير من موديل 4 (لحد 10 دقايق)
  const scriptCharCount = script.length;
  const scriptOverLimit = mode === 'script' && scriptCharCount > MAX_SCRIPT_CHARS;
  // ✅ الأدمن معفي من قيد "لازم مشترك" — عنده access كامل للموديل دايمًا طول ما هو تحت الصيانة
  const canGenerate = userPlan !== 'free' && !loading && !scriptOverLimit && (mode === 'idea' ? idea.trim().length > 5 : script.trim().length > 20);

  const handlePhotoUpload = (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setError('Photo too large — max 8MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setCharacterPhoto(reader.result);
    reader.readAsDataURL(file);
  };

  const handleGenerateScenes = async () => {
    if (userPlan === 'free') { if (onNavigate) onNavigate('pricing'); return; }
    const inputText = mode === 'idea' ? idea : script;
    if (!inputText?.trim()) { setError('Please enter your idea or script first'); return; }
    setLoading(true); setError('');
    try {
      // ✅ بيستخدم نفس محرك كتابة السيناريو بتاع موديل 4 بالظبط — الفرق كله في الرندر بعد كده
      const res = await fetch('/api/model4/generate-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({
          idea: mode === 'idea' ? inputText : undefined, script: mode !== 'idea' ? inputText : undefined,
          inputMode: mode === 'idea' ? 'idea' : 'script', sceneCount, videoLanguage, videoStyle,
          styleSuffix: VIDEO_STYLES_M8.find(s => s.key === videoStyle)?.suffix || '',
        }),
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
      const res = await fetch('/api/model8/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ scenes, ratio, sceneDurationSec, audioMode, videoLanguage, captions: audioMode === 'voiceover' ? captions : false, characterPhoto: characterPhoto || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'quota_exceeded') {
          setError(`This video needs ${data.cost || creditCost} credits, but you only have ${data.remaining ?? 0} left. Top up your credits from the Pricing page.`);
          setLoading(false); return;
        }
        if (data.show_upgrade || data.error === 'no_access') {
          setError(data.message || 'You need an active plan to generate this video. Go to Pricing to subscribe.');
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
            setVideoUrl(sd.videoUrl); setStep('done');
          } else if (sd.status === 'failed') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            setError(sd.error || 'Render failed'); setStep('scenes');
          }
        } catch {}
      }, 5000);
    } catch (e) { setError(e.message); setStep('scenes'); } finally { setLoading(false); }
  };

  const totalLabel = totalDurationSec >= 60 ? `${Math.round(totalDurationSec / 60)} min` : `${totalDurationSec}s`;

  // ── Done ──────────────────────────────────────────────────────────────
  if (step === 'done' && videoUrl) {
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(34,197,94,0.07) 0%, #080810 55%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes pop{0%{transform:scale(0.8);opacity:0}70%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
        <div style={{ maxWidth:580, width:'100%', textAlign:'center', animation:'fadeUp 0.5s ease' }}>
          <div style={{ marginBottom:14, display:'flex', justifyContent:'center', color:'#22c55e', animation:'pop 0.5s ease' }}><PartyPopper size={48} strokeWidth={1.5} /></div>
          <h2 style={{ fontSize:28, fontWeight:800, color:'#fff', marginBottom:6, letterSpacing:'-0.5px' }}>Video Ready!</h2>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:14, marginBottom:20 }}>{scenes.length} clips · {totalLabel}</p>
          <div style={{ borderRadius:18, overflow:'hidden', border:'1px solid rgba(34,197,94,0.2)', marginBottom:20, background:'#000', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <video src={videoUrl} controls style={{ width:'100%', maxHeight:420, display:'block' }} />
          </div>
          <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
            <a href={videoUrl} download style={{ background:'linear-gradient(135deg,#22c55e,#15803d)', color:'#fff', padding:'13px 28px', borderRadius:12, fontWeight:700, fontSize:14, textDecoration:'none', boxShadow:'0 4px 20px rgba(34,197,94,0.4)', display:'flex', alignItems:'center', gap:8 }}><Download size={15} strokeWidth={2} /> Download</a>
            <button onClick={() => { setStep('input'); setScenes([]); setVideoUrl(null); setIdea(''); setScript(''); }}
              style={{ background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.1)', padding:'13px 28px', borderRadius:12, fontWeight:600, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', gap:8 }}><RefreshCw size={14} strokeWidth={2} /> New Video</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render Loading ─────────────────────────────────────────────────────
  if (step === 'render') {
    const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at center, rgba(34,197,94,0.07) 0%, #080810 60%)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:0.4}50%{opacity:1}} @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>
        <div style={{ textAlign:'center', maxWidth:460, animation:'fadeUp 0.4s ease' }}>
          <div style={{ position:'relative', width:96, height:96, margin:'0 auto 32px' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid rgba(34,197,94,0.1)' }} />
            <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'#22c55e', animation:'spin 0.9s linear infinite' }} />
            <div style={{ position:'absolute', inset:8, borderRadius:'50%', border:'2px solid transparent', borderTopColor:'rgba(34,197,94,0.4)', animation:'spin 1.5s linear infinite reverse' }} />
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#22c55e' }}><Film size={28} strokeWidth={1.75} /></div>
          </div>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:8, letterSpacing:'-0.5px' }}>Generating Your Video</h2>
          <p style={{ color:'rgba(255,255,255,0.35)', fontSize:14, marginBottom:6 }}>Rendering {scenes.length} video clips</p>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:999, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', marginBottom:24 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', animation:'pulse 1s ease infinite' }} />
            <span style={{ color:'#4ade80', fontSize:13, fontWeight:700 }}>{mins > 0 ? `${mins}m ` : ''}{secs}s elapsed</span>
          </div>
          <div style={{ background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.15)', borderRadius:14, padding:'16px 20px', fontSize:13, color:'rgba(255,255,255,0.35)', lineHeight:1.8 }}>
            <div>~40-60 seconds per scene</div>
            <div style={{ color:'rgba(255,255,255,0.2)' }}>Longer videos take proportionally longer</div>
          </div>
          <p style={{ fontSize:12, color:'rgba(255,255,255,0.15)', marginTop:20, animation:'pulse 2s ease infinite' }}>Do not close this tab</p>
        </div>
      </div>
    );
  }

  // ── Scenes Review ──────────────────────────────────────────────────────
  if (step === 'scenes') {
    return (
      <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(34,197,94,0.06) 0%, #080810 50%)', padding:'clamp(24px,4vw,36px) clamp(16px,4vw,24px) 80px' }}>
        <div style={{ maxWidth:680, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
            <button onClick={() => setStep('input')} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Back</button>
            <span style={{ padding:'5px 12px', borderRadius:999, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', fontSize:11, color:'#4ade80', fontWeight:700 }}>{scenes.length} scenes · {totalLabel}</span>
          </div>
          <div style={{ marginBottom:20 }}>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', margin:'0 0 6px', letterSpacing:'-0.5px' }}>Review Scenes</h2>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.35)', margin:0 }}>Each clip = {sceneDurationSec} seconds. Edit text or prompts below.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {scenes.map((scene, i) => (
              <EditableSceneCard key={i} scene={scene} index={i} onChange={(updated) => setScenes(s => s.map((sc, idx) => idx === i ? updated : sc))} />
            ))}
          </div>
          {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 12, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>{error}</div>}
          <button onClick={handleRender} disabled={loading}
            style={{ width:'100%', background:loading?'rgba(255,255,255,0.04)':'linear-gradient(135deg,#22c55e,#15803d)', color:loading?'#4b5563':'#fff', border:'none', borderRadius:14, padding:'15px', fontWeight:800, fontSize:16, cursor:loading?'not-allowed':'pointer', boxShadow:!loading?'0 6px 24px rgba(34,197,94,0.4)':'none', transition:'all 0.2s' }}>
            {loading ? 'Starting...' : `Generate ${scenes.length} Video Clips — ${creditCost} Credits →`}
          </button>
        </div>
      </div>
    );
  }

  // ── Input Screen ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, rgba(34,197,94,0.08) 0%, #080810 50%)', padding:'0 0 80px' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes gradShift{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
        @keyframes pulse{0%,100%{opacity:0.5}50%{opacity:1}}
        .m8-opt{transition:all 0.2s!important}
        .m8-opt:hover{border-color:rgba(34,197,94,0.5)!important;background:rgba(34,197,94,0.06)!important}
        @media(max-width:600px){
          .m8-style-grid{grid-template-columns:repeat(4,1fr)!important;gap:6px!important}
          .m8-settings-grid{grid-template-columns:1fr!important}
        }
      `}</style>

      {/* Header */}
      <div style={{ padding:'clamp(24px,4vw,36px) clamp(16px,4vw,24px) 20px', position:'relative', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 0%, rgba(34,197,94,0.12) 0%, transparent 65%)', pointerEvents:'none' }} />
        <div style={{ maxWidth:680, margin:'0 auto', position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, padding:'8px 14px' }}>← Models</button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:56, height:56, borderRadius:18, background:'linear-gradient(135deg,#22c55e,#15803d)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', flexShrink:0, boxShadow:'0 6px 24px rgba(34,197,94,0.45)' }}><Wallet size={26} strokeWidth={1.75} /></div>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'#4ade80', letterSpacing:'0.1em', marginBottom:4 }}>MODEL 8 · BUDGET CINEMATIC</div>
              <h1 style={{ fontSize:'clamp(20px,4vw,26px)', fontWeight:900, color:'#fff', margin:0, letterSpacing:'-0.5px', lineHeight:1.1 }}>
                <span style={{ background:'linear-gradient(90deg,#22c55e,#4ade80,#15803d,#22c55e)', backgroundSize:'300% auto', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradShift 4s ease infinite' }}>Cheap</span> AI Video
              </h1>
              <p style={{ margin:'4px 0 0', fontSize:13, color:'rgba(255,255,255,0.35)' }}>4 credits/sec · flexible scenes · up to 10 minutes</p>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:680, margin:'0 auto', padding:'24px clamp(16px,4vw,24px) 0', animation:'fadeUp 0.4s ease' }}>

        {/* Mode Tabs */}
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 4, marginBottom: 24 }}>
          {[{ key: 'idea', icon: Lightbulb, label: 'Idea' }, { key: 'script', icon: FileText, label: 'Script' }].map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              style={{ flex: 1, padding: '11px 8px', borderRadius: 10, border: 'none', background: mode === m.key ? 'linear-gradient(135deg,#22c55e,#15803d)' : 'transparent', color: mode === m.key ? '#fff' : '#4b5563', fontWeight: 700, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', boxShadow: mode === m.key ? '0 2px 12px rgba(34,197,94,0.4)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <m.icon size={14} strokeWidth={2} /> {m.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            {mode === 'idea' ? 'YOUR IDEA' : 'YOUR SCRIPT'}
          </p>
          {mode === 'idea' ? (
            <>
              <textarea value={idea} onChange={e => setIdea(e.target.value)} placeholder="A cinematic video about the power of discipline and daily habits..." rows={4}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.65 }} />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#374151' }}>{idea.length} characters</p>
            </>
          ) : (
            <>
              <textarea value={script} onChange={e => setScript(e.target.value)} placeholder="Paste your script here..." rows={6}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', lineHeight: 1.65 }} />
              <p style={{ fontSize:11, color: scriptOverLimit ? '#f87171' : 'rgba(255,255,255,0.3)', margin:'6px 0 0' }}>
                {scriptCharCount} / {MAX_SCRIPT_CHARS} chars{scriptOverLimit ? ' — Too long!' : ''}
              </p>
            </>
          )}
        </div>

        {/* Video Style */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Palette size={12} strokeWidth={2} /> VIDEO STYLE</p>
          <div className="m8-style-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {VIDEO_STYLES_M8.map(s => (
              <div key={s.key} onClick={() => setVideoStyle(s.key)} className="m8-opt"
                style={{ padding: '10px 8px', borderRadius: 12, cursor: 'pointer', textAlign: 'center', border: `1px solid ${videoStyle===s.key ? '#22c55e' : 'rgba(255,255,255,0.07)'}`, background: videoStyle===s.key ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.02)' }}>
                <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center', color: videoStyle===s.key ? '#4ade80' : '#9ca3af' }}><s.icon size={17} strokeWidth={1.75} /></div>
                <div style={{ fontSize: 10, fontWeight: 700, color: videoStyle===s.key ? '#4ade80' : '#fff' }}>{s.label}</div>
                <div style={{ fontSize: 9, color: '#374151', marginTop: 2 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Character Photo — اختياري، بيتحرك بنفس FLUX Kontext المستخدم في موديل 5 */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><User size={12} strokeWidth={2} /> CHARACTER PHOTO (OPTIONAL)</p>
          <div onClick={() => photoRef.current?.click()}
            style={{ border: `2px dashed ${characterPhoto ? '#22c55e' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: characterPhoto ? 12 : '24px 20px', textAlign: 'center', cursor: 'pointer', background: 'rgba(34,197,94,0.03)' }}>
            {characterPhoto ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={characterPhoto} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover' }} />
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <p style={{ margin: 0, color: '#4ade80', fontWeight: 700, fontSize: 13 }}>Photo attached</p>
                  <p style={{ margin: '2px 0 0', color: '#4b5563', fontSize: 11 }}>The same face will appear in every scene</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setCharacterPhoto(null); }} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: '#6b7280', borderRadius: 8, padding: '6px 10px', fontSize: 11, cursor: 'pointer' }}>Remove</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: '#6b7280' }}><User size={26} strokeWidth={1.5} /></div>
                <p style={{ color: '#6b7280', fontSize: 13, margin: 0, fontWeight: 600 }}>Upload a photo to keep a consistent character</p>
                <p style={{ color: '#374151', fontSize: 11, margin: '4px 0 0' }}>JPG or PNG — max 8MB</p>
              </>
            )}
            <input ref={photoRef} type="file" accept="image/*" onChange={e => handlePhotoUpload(e.target.files[0])} style={{ display: 'none' }} />
          </div>
        </div>

        {/* Scene duration + total duration — الفرق الأساسي عن موديل 4 */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>SCENE LENGTH</p>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {[5, 10, 15, 20].map(sec => (
              <div key={sec} onClick={() => setSceneDurationSec(sec)} className="m8-opt"
                style={{ flex: 1, borderRadius: 12, padding: '12px', textAlign: 'center', cursor: 'pointer', border: `2px solid ${sceneDurationSec === sec ? '#22c55e' : 'rgba(255,255,255,0.07)'}`, background: sceneDurationSec === sec ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.02)' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: sceneDurationSec === sec ? '#4ade80' : '#fff' }}>{sec}s per scene</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>TOTAL VIDEO LENGTH — {totalLabel}</p>
          <input type="range" min={sceneDurationSec * 2} max={600} step={sceneDurationSec} value={totalDurationSec}
            onChange={e => setTotalDurationSec(parseInt(e.target.value, 10))}
            style={{ width: '100%', accentColor: '#22c55e' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#374151', marginTop: 4 }}>
            <span>{sceneDurationSec * 2}s</span>
            <span>{sceneCount} scenes</span>
            <span>10 min</span>
          </div>
        </div>
        {sceneCount === 2 && (
          <p style={{ fontSize: 12, color: '#fbbf24', marginTop: -12, marginBottom: 20 }}>
            Minimum is 2 scenes — a single-scene video isn't offered here since Model 8 is built for multi-shot cinematic sequences.
          </p>
        )}

        {/* Audio Mode */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Volume2 size={12} strokeWidth={2} /> AUDIO</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {AUDIO_MODES.map(a => (
              <div key={a.key} onClick={() => setAudioMode(a.key)} className="m8-opt"
                style={{ flex: 1, borderRadius: 12, padding: '12px 8px', textAlign: 'center', cursor: 'pointer', border: `2px solid ${audioMode === a.key ? '#22c55e' : 'rgba(255,255,255,0.07)'}`, background: audioMode === a.key ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.02)' }}>
                <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center', color: audioMode === a.key ? '#4ade80' : '#9ca3af' }}><a.icon size={17} strokeWidth={1.75} /></div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: audioMode === a.key ? '#4ade80' : '#fff' }}>{a.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#4b5563' }}>{a.rate} cr/sec</p>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div className="m8-settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>ASPECT RATIO</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {['9:16','16:9','1:1'].map(r => (
                <button key={r} onClick={() => setRatio(r)} style={{ flex: 1, padding: '9px 4px', borderRadius: 8, border: `1px solid ${ratio === r ? '#22c55e' : 'rgba(255,255,255,0.07)'}`, background: ratio === r ? 'rgba(34,197,94,0.15)' : 'transparent', color: ratio === r ? '#4ade80' : '#4b5563', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{r}</button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>LANGUAGE</p>
            <div style={{ display: 'flex', gap: 6 }}>
              {[{ v: 'en', l: 'EN' }, { v: 'ar', l: 'AR' }].map(lang => (
                <button key={lang.v} onClick={() => setVideoLanguage(lang.v)} style={{ flex: 1, padding: '9px 4px', borderRadius: 8, border: `1px solid ${videoLanguage === lang.v ? '#22c55e' : 'rgba(255,255,255,0.07)'}`, background: videoLanguage === lang.v ? 'rgba(34,197,94,0.15)' : 'transparent', color: videoLanguage === lang.v ? '#4ade80' : '#4b5563', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{lang.l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Captions toggle — بس متاح لو فيه فويس أوفر (محتاج صوت حقيقي يتفرغ منه) */}
        {audioMode === 'voiceover' && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 16, marginBottom: 20 }}>
            <div onClick={() => setCaptions(!captions)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MessageSquare size={16} strokeWidth={1.75} color="#9ca3af" />
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#d1d5db' }}>Captions</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#4b5563' }}>Auto-synced subtitles from the voiceover</p>
                </div>
              </div>
              <div style={{ width: 44, height: 24, borderRadius: 999, background: captions ? '#22c55e' : 'rgba(255,255,255,0.1)', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2.5, left: captions ? 22 : 2.5, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: 12, marginBottom: 16, color: '#ef4444', fontSize: 13 }}>
            <span>{error}</span>
            {(error.includes('credits') || error.includes('plan')) && (
              <button onClick={() => (onNavigate && onNavigate('pricing'))} style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontSize: 13, padding: 0 }}>Go to Pricing →</button>
            )}
          </div>
        )}

        {/* Credit cost badge */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:10 }}>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)', fontSize:12, fontWeight:700, color:'#4ade80', display:'flex', alignItems:'center', gap:6 }}>
            <Coins size={13} strokeWidth={2} /> {creditCost} credits per video
          </div>
          <div style={{ padding:'5px 14px', borderRadius:999, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:600 }}>
            Model 8 · Budget Engine
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => userPlan === 'free' ? (onNavigate && onNavigate('pricing')) : handleGenerateScenes()} disabled={userPlan !== 'free' && !canGenerate}
          style={{ width: '100%', background: (userPlan !== 'free' && !canGenerate) ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg,#22c55e,#15803d)', color: (userPlan !== 'free' && !canGenerate) ? '#374151' : '#fff', border: 'none', borderRadius: 12, padding: '15px', fontWeight: 800, fontSize: 16, cursor: (userPlan !== 'free' && !canGenerate) ? 'not-allowed' : 'pointer', boxShadow: canGenerate ? '0 4px 24px rgba(34,197,94,0.4)' : 'none', transition: 'all 0.2s' }}>
          {userPlan === 'free' ? 'Subscribe to Generate →' : loading ? 'Generating...' : `Generate Scenes — ${creditCost} Credits →`}
        </button>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#1f2937', marginTop: 12 }}>Powered by prunaai/p-video · Replicate API · FFmpeg</p>
      </div>
    </div>
  );
}