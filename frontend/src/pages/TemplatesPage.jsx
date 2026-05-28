import React, { useState, useEffect } from 'react';

const MODELS = [
  { key: 'model1', label: 'AI Slices', icon: '🖼️', color: '#7c6af7', desc: 'Model 1' },
  { key: 'model2', label: 'Real Footage', icon: '🎥', color: '#06b6d4', desc: 'Model 2' },
  { key: 'model3', label: 'AI Images', icon: '✨', color: '#f59e0b', desc: 'Model 3 — Premium' },
  { key: 'model4', label: 'Seedance AI', icon: '🎬', color: '#a855f7', desc: 'Model 4 — AI Video' },
  { key: 'cinematic', label: 'Cinematic AI', icon: '🎭', color: '#e11d48', desc: 'Cinematic' },
  { key: 'atlas', label: 'Atlas Map', icon: '🗺️', color: '#22c55e', desc: 'Atlas' },
];

export default function TemplatesPage({ onNavigate, userRegion }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeModel, setActiveModel] = useState('all');
  const [visible, setVisible] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (e) {
      console.warn('Templates fetch failed, showing empty state');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = activeModel === 'all' ? templates : templates.filter(t => t.model_key === activeModel);

  const MODEL_NAV_MAP = {
    model1: 'home',
    model2: 'home',
    model3: 'model3',
    model4: 'model4',
    cinematic: 'model5',
    atlas: 'home',
  };

  const handleUseTemplate = (template) => {
    localStorage.setItem('erivion_template_prompt', template.prompt || template.script || '');
    localStorage.setItem('erivion_template_model', template.model_key);
    const nav = MODEL_NAV_MAP[template.model_key] || 'home';
    if (onNavigate) onNavigate(nav);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d0b1e 0%, #080810 60%, #000 100%)', padding: 'clamp(24px,4vw,48px) clamp(16px,4vw,32px) 80px', opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: 'all 0.5s cubic-bezier(0.16,1,0.3,1)' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        .tpl-card { transition: all 0.3s cubic-bezier(0.16,1,0.3,1) !important; }
        .tpl-card:hover { transform: translateY(-6px) scale(1.01) !important; }
        .tpl-tab { transition: all 0.2s ease !important; }
        .tpl-tab:hover { opacity: 0.85; }
        .tpl-use-btn { transition: all 0.2s ease !important; }
        .tpl-use-btn:hover { opacity: 0.9; transform: scale(1.02); }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)', fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.1em', marginBottom: 16 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px #22c55e' }} />
            VIDEO TEMPLATES
          </div>
          <h1 style={{ fontSize: 'clamp(28px,4vw,44px)', fontWeight: 800, color: '#fff', margin: '0 0 12px', letterSpacing: '-1px', lineHeight: 1.1 }}>
            Ready-made{' '}
            <span style={{ background: 'linear-gradient(135deg,#7c6af7,#a78bfa,#06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundSize: '200% auto' }}>
              Templates
            </span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, maxWidth: 480, margin: '0 auto' }}>
            اختر قالباً جاهزاً وابدأ الإنشاء فوراً — Choose a template and start creating instantly
          </p>
        </div>

        {/* Model Filter Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 40, overflowX: 'auto', paddingBottom: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="tpl-tab" onClick={() => setActiveModel('all')}
            style={{ padding: '8px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeModel === 'all' ? '#7c6af7' : 'rgba(255,255,255,0.06)', color: activeModel === 'all' ? '#fff' : '#9ca3af', whiteSpace: 'nowrap' }}>
            🎯 All Models
          </button>
          {MODELS.map(m => (
            <button key={m.key} className="tpl-tab" onClick={() => setActiveModel(m.key)}
              style={{ padding: '8px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: activeModel === m.key ? m.color : 'rgba(255,255,255,0.06)', color: activeModel === m.key ? '#fff' : '#9ca3af', whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>

        {/* Templates Grid — grouped by model */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#6b7280', fontSize: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12, animation: 'spin 1s linear infinite' }}>⏳</div>
            Loading templates...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎬</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Templates Coming Soon</h3>
            <p style={{ color: '#6b7280', fontSize: 14 }}>
              {activeModel === 'all'
                ? 'No templates yet — they will be added soon by the admin.'
                : `No templates for this model yet. Check back soon!`}
            </p>
          </div>
        ) : (
          <>
            {/* Render grouped by model if "all" selected */}
            {activeModel === 'all' ? (
              MODELS.map(model => {
                const modelTemplates = templates.filter(t => t.model_key === model.key);
                if (modelTemplates.length === 0) return null;
                return (
                  <div key={model.key} style={{ marginBottom: 48 }}>
                    {/* Model section header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${model.color}22`, border: `1px solid ${model.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{model.icon}</div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{model.label}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{model.desc} · {modelTemplates.length} templates</div>
                      </div>
                      <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${model.color}40, transparent)`, marginLeft: 8 }} />
                    </div>
                    <TemplateGrid templates={modelTemplates} model={model} onUse={handleUseTemplate} hoveredCard={hoveredCard} setHoveredCard={setHoveredCard} />
                  </div>
                );
              })
            ) : (
              <TemplateGrid templates={filtered} model={MODELS.find(m => m.key === activeModel)} onUse={handleUseTemplate} hoveredCard={hoveredCard} setHoveredCard={setHoveredCard} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TemplateGrid({ templates, model, onUse, hoveredCard, setHoveredCard }) {
  const color = model?.color || '#7c6af7';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
      {templates.map((tpl, i) => (
        <div key={tpl.id || i} className="tpl-card"
          onMouseEnter={() => setHoveredCard(tpl.id || i)}
          onMouseLeave={() => setHoveredCard(null)}
          style={{ background: '#0d0b1a', border: `1px solid ${hoveredCard === (tpl.id || i) ? color + '60' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, overflow: 'hidden', boxShadow: hoveredCard === (tpl.id || i) ? `0 16px 40px ${color}20` : 'none', animation: `fadeUp 0.4s ease ${i * 0.06}s both` }}>

          {/* Video / Thumbnail */}
          {tpl.video_url ? (
            <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
              <video src={tpl.video_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} muted loop playsInline
                onMouseEnter={e => e.target.play()} onMouseLeave={e => { e.target.pause(); e.target.currentTime = 0; }} />
              <div style={{ position: 'absolute', top: 10, left: 10, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700, color }}>
                {model?.icon} {model?.label}
              </div>
            </div>
          ) : (
            <div style={{ paddingTop: '56.25%', background: `linear-gradient(135deg, ${color}15, transparent)`, position: 'relative' }}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>{model?.icon}</div>
              <div style={{ position: 'absolute', top: 10, left: 10, background: `${color}22`, border: `1px solid ${color}44`, borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 700, color }}>
                {model?.icon} {model?.label}
              </div>
            </div>
          )}

          {/* Content */}
          <div style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6, lineHeight: 1.4 }}>{tpl.title || 'Untitled Template'}</div>
            {tpl.description && (
              <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 12, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {tpl.description}
              </div>
            )}
            <button className="tpl-use-btn" onClick={() => onUse(tpl)}
              style={{ width: '100%', padding: '10px', background: `linear-gradient(135deg, ${color}, ${color}cc)`, border: 'none', borderRadius: 10, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: `0 4px 16px ${color}30` }}>
              ▶ Use this template
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
