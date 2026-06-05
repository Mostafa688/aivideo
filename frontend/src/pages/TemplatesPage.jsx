import React, { useState, useEffect, useRef } from 'react';

const MODELS = [
  { key: 'model1',    label: 'AI Slices',    icon: '🖼️', color: '#7c6af7' },
  { key: 'model2',    label: 'Real Footage', icon: '🎥', color: '#06b6d4' },
  { key: 'model3',    label: 'AI Images',    icon: '✨', color: '#f59e0b' },
  { key: 'model4',    label: 'Seedance AI',  icon: '🎬', color: '#a855f7' },
  { key: 'cinematic', label: 'Cinematic AI', icon: '🎭', color: '#e11d48' },
  { key: 'atlas',     label: 'Atlas Map',    icon: '🗺️', color: '#22c55e' },
];

const MODEL_NAV_MAP = {
  model1: 'home', model2: 'home', model3: 'model3',
  model4: 'model4', cinematic: 'model5', atlas: 'home',
};

export default function TemplatesPage({ onNavigate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeModel, setActiveModel] = useState('all');
  const [visible, setVisible]     = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    fetch('/api/templates')
      .then(r => r.json())
      .then(d => { setTemplates(d.templates || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleUse = (tpl) => {
    localStorage.setItem('erivion_template_prompt', tpl.prompt || tpl.description || '');
    localStorage.setItem('erivion_template_model', tpl.model_key);
    const nav = MODEL_NAV_MAP[tpl.model_key] || 'home';
    if (onNavigate) onNavigate(nav);
  };

  const filtered = activeModel === 'all' ? templates : templates.filter(t => t.model_key === activeModel);

  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, #0d0b1e 0%, #080810 60%, #000 100%)', padding:'clamp(24px,4vw,48px) clamp(16px,4vw,32px) 100px', opacity:visible?1:0, transform:visible?'translateY(0)':'translateY(20px)', transition:'all 0.5s cubic-bezier(0.16,1,0.3,1)' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .tpl-card { transition: all 0.3s cubic-bezier(0.16,1,0.3,1) !important; cursor: pointer; }
        .tpl-card:hover { transform: translateY(-6px) scale(1.01) !important; }
        .tpl-use-btn:hover { opacity: 0.88; transform: scale(1.02); }
        .tpl-use-btn { transition: all 0.2s ease !important; }
      `}</style>

      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:999, background:'rgba(124,106,247,0.1)', border:'1px solid rgba(124,106,247,0.25)', fontSize:11, color:'#a78bfa', fontWeight:700, letterSpacing:'0.1em', marginBottom:16 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', boxShadow:'0 0 6px #22c55e' }} /> VIDEO TEMPLATES
          </div>
          <h1 style={{ fontSize:'clamp(28px,4vw,44px)', fontWeight:800, color:'#fff', margin:'0 0 12px', letterSpacing:'-1px' }}>
            Ready-made <span style={{ background:'linear-gradient(135deg,#7c6af7,#a78bfa,#06b6d4)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Templates</span>
          </h1>
          <p style={{ color:'rgba(255,255,255,0.4)', fontSize:16, maxWidth:480, margin:'0 auto' }}>اختر قالباً وابدأ الإنشاء فوراً — Choose a template and start instantly</p>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:40, overflowX:'auto', paddingBottom:4, justifyContent:'center', flexWrap:'wrap' }}>
          <button onClick={() => setActiveModel('all')} style={{ padding:'8px 18px', borderRadius:999, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background:activeModel==='all'?'#7c6af7':'rgba(255,255,255,0.06)', color:activeModel==='all'?'#fff':'#9ca3af', transition:'all 0.2s' }}>🎯 All Models</button>
          {MODELS.map(m => (
            <button key={m.key} onClick={() => setActiveModel(m.key)} style={{ padding:'8px 18px', borderRadius:999, border:'none', cursor:'pointer', fontWeight:600, fontSize:13, background:activeModel===m.key?m.color:'rgba(255,255,255,0.06)', color:activeModel===m.key?'#fff':'#9ca3af', whiteSpace:'nowrap', transition:'all 0.2s' }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && <div style={{ textAlign:'center', padding:'80px 0', color:'#6b7280', fontSize:16 }}>⏳ Loading templates...</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>🎬</div>
            <h3 style={{ fontSize:20, fontWeight:700, color:'#fff', marginBottom:8 }}>Templates Coming Soon</h3>
            <p style={{ color:'#6b7280', fontSize:14 }}>No templates yet — check back soon!</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          activeModel === 'all' ? (
            MODELS.map(model => {
              const mt = templates.filter(t => t.model_key === model.key);
              if (!mt.length) return null;
              return (
                <div key={model.key} style={{ marginBottom:48 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:`${model.color}22`, border:`1px solid ${model.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{model.icon}</div>
                    <div>
                      <div style={{ fontSize:16, fontWeight:700, color:'#fff' }}>{model.label}</div>
                      <div style={{ fontSize:12, color:'#6b7280' }}>{mt.length} template{mt.length!==1?'s':''}</div>
                    </div>
                    <div style={{ flex:1, height:1, background:`linear-gradient(90deg, ${model.color}40, transparent)`, marginLeft:8 }} />
                  </div>
                  <TemplateGrid templates={mt} model={model} onUse={handleUse} />
                </div>
              );
            })
          ) : (
            <TemplateGrid templates={filtered} model={MODELS.find(m=>m.key===activeModel)||MODELS[0]} onUse={handleUse} />
          )
        )}
      </div>
    </div>
  );
}

function getYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function getGoogleDriveId(url) {
  if (!url) return null;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  return m ? m[1] : null;
}

function getStreamableId(url) {
  if (!url) return null;
  const m = url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

function getVimeoId(url) {
  if (!url) return null;
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

function VideoCard({ src, color, icon }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loaded, setLoaded] = useState(true);

  const youtubeId    = getYouTubeId(src);
  const driveId      = getGoogleDriveId(src);
  const streamableId = getStreamableId(src);
  const vimeoId      = getVimeoId(src);

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play().then(() => setPlaying(true)).catch(err => console.warn('[VideoCard] play failed:', err)); }
  };

  if (!src) {
    return (
      <div style={{ paddingTop:'56.25%', background:`linear-gradient(135deg, ${color}20, #0d0b1a)`, position:'relative', borderRadius:'12px 12px 0 0' }}>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:44 }}>{icon}</div>
      </div>
    );
  }

  if (youtubeId) {
    return (
      <div style={{ position:'relative', paddingTop:'56.25%', background:'#000', borderRadius:'12px 12px 0 0', overflow:'hidden' }}>
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1`}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (driveId) {
    return (
      <div style={{ position:'relative', paddingTop:'56.25%', background:'#000', borderRadius:'12px 12px 0 0', overflow:'hidden' }}>
        <iframe
          src={`https://drive.google.com/file/d/${driveId}/preview`}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
          allow="autoplay"
          allowFullScreen
        />
      </div>
    );
  }

  if (streamableId) {
    return (
      <div style={{ position:'relative', paddingTop:'56.25%', background:'#000', borderRadius:'12px 12px 0 0', overflow:'hidden' }}>
        <iframe
          src={`https://streamable.com/e/${streamableId}`}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
          allow="autoplay"
          allowFullScreen
        />
      </div>
    );
  }

  if (vimeoId) {
    return (
      <div style={{ position:'relative', paddingTop:'56.25%', background:'#000', borderRadius:'12px 12px 0 0', overflow:'hidden' }}>
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}?badge=0&autopause=0`}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none' }}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div style={{ position:'relative', paddingTop:'56.25%', background:'#000', borderRadius:'12px 12px 0 0', overflow:'hidden' }}>
      <video
        ref={videoRef}
        src={src}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}
        muted playsInline preload="auto"
        onLoadedData={() => setLoaded(true)} onCanPlay={() => setLoaded(true)}
        onEnded={() => setPlaying(false)}
        onError={(e) => console.warn('[VideoCard] load error:', src, e.target.error?.message)}
      />
      {!loaded && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:`linear-gradient(135deg, ${color}20, #0d0b1a)`, fontSize:44 }}>{icon}</div>
      )}
      <div onClick={togglePlay} style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background: playing ? 'transparent' : 'rgba(0,0,0,0.35)', transition:'background 0.2s', cursor:'pointer' }}>
        {!playing && (
          <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(255,255,255,0.15)', backdropFilter:'blur(8px)', border:'1px solid rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:18, color:'#fff', marginLeft:3 }}>▶</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateGrid({ templates, model, onUse }) {
  const color = model?.color || '#7c6af7';
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:20 }}>
      {templates.map((tpl, i) => (
        <div key={tpl.id||i} className="tpl-card"
          onMouseEnter={() => setHovered(tpl.id)} onMouseLeave={() => setHovered(null)}
          style={{ background:'#0d0b1a', border:`1px solid ${hovered===tpl.id ? color+'60' : 'rgba(255,255,255,0.07)'}`, borderRadius:16, overflow:'hidden', boxShadow:hovered===tpl.id?`0 16px 40px ${color}20`:'none', animation:`fadeUp 0.4s ease ${i*0.07}s both` }}>

          {/* Video */}
          <VideoCard src={tpl.video_url} color={color} icon={model?.icon} />

          {/* Label badge */}
          <div style={{ position:'relative' }}>
            <div style={{ position:'absolute', top:-16, left:12, background:`${color}dd`, borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:700, color:'#fff' }}>{model?.icon} {model?.label}</div>
          </div>

          {/* Content */}
          <div style={{ padding:'24px 16px 16px' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:6 }}>{tpl.title || 'Untitled'}</div>
            {tpl.description && <div style={{ fontSize:12, color:'#6b7280', lineHeight:1.6, marginBottom:8, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{tpl.description}</div>}
            {tpl.prompt && (
              <div style={{ fontSize:11, color:'#4b5563', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:8, padding:'8px 10px', marginBottom:12, lineHeight:1.6, display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                📝 {tpl.prompt}
              </div>
            )}
            <button className="tpl-use-btn" onClick={() => onUse(tpl)}
              style={{ width:'100%', padding:'11px', background:`linear-gradient(135deg, ${color}, ${color}cc)`, border:'none', borderRadius:10, color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', boxShadow:`0 4px 16px ${color}30` }}>
              ▶ Use this template
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}