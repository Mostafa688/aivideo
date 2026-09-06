import React, { useState, useEffect, useRef } from 'react';
import { downloadRemoteFile } from '../utils/download.js';

const STYLE_COLORS = {
  dark:     { bg: '#1a1a2e', land: '#2d3561', border: '#1a1a2e', highlight: '#e11d48', secondary: '#f59e0b', ocean: '#0f0f1f' },
  classic:  { bg: '#4a90d9', land: '#f5e6c8', border: '#c8a96e', highlight: '#e74c3c', secondary: '#27ae60', ocean: '#4a90d9' },
  military: { bg: '#1a2a1a', land: '#2d4a2d', border: '#1a2a1a', highlight: '#ff6b00', secondary: '#ffd700', ocean: '#0d1a0d' },
  clean:    { bg: '#e8f4f8', land: '#ffffff',  border: '#ccc',    highlight: '#3498db', secondary: '#e74c3c', ocean: '#e8f4f8' },
};

export default function MapVideoPage({ formData, onBack }) {
  const [status, setStatus]   = useState('idle'); // idle | generating | done | error
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [logLines, setLogLines] = useState([]);
  const pollRef = useRef(null);

  const colors = STYLE_COLORS[formData?.mapStyle || 'dark'];

  const handleGenerate = async () => {
    setStatus('generating');
    setProgress(5);
    setLogLines(['🗺️ Analyzing your story...']);

    try {
      const res = await fetch('/api/map-video/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + localStorage.getItem('token'),
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      const { jobId } = await res.json();
      setLogLines(prev => [...prev, '✅ Story parsed — building timeline...']);
      setProgress(15);

      // Poll for progress
      pollRef.current = setInterval(async () => {
        try {
          const poll = await fetch(`/api/map-video/status/${jobId}`, {
            headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
          });
          const data = await poll.json();

          if (data.log) setLogLines(data.log);
          if (data.progress) setProgress(data.progress);

          if (data.status === 'done') {
            clearInterval(pollRef.current);
            setVideoUrl(data.videoUrl);
            setStatus('done');
            setProgress(100);
          } else if (data.status === 'error') {
            clearInterval(pollRef.current);
            setErrorMsg(data.error || 'Something went wrong');
            setStatus('error');
          }
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 3000);

    } catch (e) {
      setErrorMsg(e.message);
      setStatus('error');
    }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(24px,4vw,48px) clamp(12px,4vw,16px) 60px', background: 'radial-gradient(ellipse at top, rgba(16,185,129,0.06) 0%, transparent 50%)' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes progress { from{width:0} to{width:100%} }
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        .log-line { animation: fadeUp 0.3s ease both; font-family: monospace; font-size: 12px; }
      `}</style>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, animation: 'fadeUp 0.4s ease' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: 0 }}>← Back</button>
        <div style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}>🗺️ Atlas — Map Video</div>
      </div>

      {/* Summary card */}
      <div style={{ width: '100%', maxWidth: 700, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '24px 28px', marginBottom: 24, animation: 'fadeUp 0.5s ease 0.05s both' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { label: 'Mode', val: formData?.mode === 'idea' ? '💡 Idea' : formData?.mode === 'voice' ? '🎙️ Voice' : '📝 Script' },
            { label: 'Duration', val: formData?.duration },
            { label: 'Ratio', val: formData?.ratio },
            { label: 'Style', val: formData?.mapStyle?.charAt(0).toUpperCase() + formData?.mapStyle?.slice(1) },
          ].map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.07em', marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{s.val}</div>
            </div>
          ))}
        </div>

        {/* Map style preview */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: `${colors.ocean}40`, border: `1px solid ${colors.ocean}60` }}>
          <div style={{ width: 60, height: 36, borderRadius: 6, background: colors.ocean, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ position: 'absolute', bottom: 4, left: 8, width: 20, height: 14, borderRadius: 3, background: colors.land }} />
            <div style={{ position: 'absolute', top: 4, right: 6, width: 12, height: 10, borderRadius: 3, background: colors.highlight }} />
            <div style={{ position: 'absolute', top: 10, left: 6, width: 8, height: 6, borderRadius: 2, background: colors.secondary }} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{formData?.mapStyle?.charAt(0).toUpperCase() + formData?.mapStyle?.slice(1)} Style</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Countries auto-highlighted based on your story</div>
          </div>
        </div>
      </div>

      {/* Main action area */}
      {status === 'idle' && (
        <div style={{ width:'100%', maxWidth:700, textAlign:'center', animation:'fadeUp 0.5s ease 0.1s both' }}>
          <div style={{ width:80, height:80, borderRadius:24, background:'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(5,150,105,0.1))', border:'1px solid rgba(16,185,129,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 20px', boxShadow:'0 8px 32px rgba(16,185,129,0.2)' }}>🗺️</div>
          <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:10, letterSpacing:'-0.5px' }}>Ready to generate</h2>
          <p style={{ fontSize:14, color:'rgba(255,255,255,0.4)', marginBottom:32, maxWidth:480, margin:'0 auto 32px', lineHeight:1.7 }}>
            AI analyzes your story, identifies countries and events, then creates an animated map with zoom, pan, and color highlights.
          </p>
          <button onClick={handleGenerate}
            style={{ padding:'16px 48px', background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff', border:'none', borderRadius:14, fontWeight:700, fontSize:17, cursor:'pointer', boxShadow:'0 6px 28px rgba(16,185,129,0.45)', transition:'all 0.2s' }}>
            🗺️ Generate Map Video →
          </button>
          <p style={{ fontSize:12, color:'rgba(255,255,255,0.2)', marginTop:14 }}>AI-powered · SVG map · Auto zoom & pan</p>
        </div>
      )}

      {status === 'generating' && (
        <div style={{ width: '100%', maxWidth: 700, animation: 'fadeUp 0.4s ease' }}>
          {/* Progress bar */}
          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 999, height: 6, marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg,#10b981,#34d399)', borderRadius: 999, transition: 'width 0.5s ease', boxShadow: '0 0 12px rgba(16,185,129,0.5)' }} />
          </div>

          {/* Log */}
          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 16, padding: '20px 24px', minHeight: 200, fontFamily: 'monospace' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', marginBottom: 16, letterSpacing: '0.08em' }}>ATLAS RENDERER</div>
            {logLines.map((line, i) => (
              <div key={i} className="log-line" style={{ color: line.startsWith('❌') ? '#ef4444' : line.startsWith('✅') ? '#34d399' : 'rgba(255,255,255,0.6)', marginBottom: 6, animationDelay: `${i * 0.05}s` }}>
                {line}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', animation: 'pulse 1s ease infinite' }} />
              <span style={{ fontSize: 11, color: '#34d399', animation: 'pulse 1.5s ease infinite' }}>Processing... {progress}%</span>
            </div>
          </div>
        </div>
      )}

      {status === 'done' && videoUrl && (
        <div style={{ width:'100%', maxWidth:700, animation:'fadeUp 0.5s ease' }}>
          <div style={{ textAlign:'center', marginBottom:20 }}>
            <div style={{ fontSize:52, marginBottom:12 }}>🎉</div>
            <h2 style={{ fontSize:26, fontWeight:800, color:'#fff', marginBottom:6, letterSpacing:'-0.5px' }}>Map video ready!</h2>
            <p style={{ fontSize:14, color:'rgba(255,255,255,0.4)' }}>Your animated geographic story is complete</p>
          </div>
          <div style={{ borderRadius:18, overflow:'hidden', border:'1px solid rgba(16,185,129,0.2)', marginBottom:16, background:'#000', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <video controls style={{ width:'100%', maxHeight:420, display:'block' }} src={videoUrl} />
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => downloadRemoteFile(videoUrl, 'erivion-map-video.mp4')} style={{ flex:1, padding:'14px', background:'linear-gradient(135deg,#10b981,#059669)', color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:15, cursor:'pointer', textAlign:'center', fontFamily:'inherit', boxShadow:'0 4px 20px rgba(16,185,129,0.4)' }}>
              ⬇️ Download
            </button>
            <button onClick={onBack} style={{ flex:1, padding:'14px', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, fontWeight:600, fontSize:15, cursor:'pointer' }}>
              🔄 Make Another
            </button>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div style={{ width:'100%', maxWidth:700, textAlign:'center', animation:'fadeUp 0.4s ease' }}>
          <div style={{ width:64, height:64, borderRadius:20, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 16px' }}>❌</div>
          <h2 style={{ fontSize:22, fontWeight:700, color:'#ef4444', marginBottom:8 }}>Generation failed</h2>
          <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:'12px 20px', marginBottom:24 }}>
            <p style={{ fontSize:13, color:'rgba(255,255,255,0.5)', margin:0, lineHeight:1.6 }}>{errorMsg}</p>
          </div>
          <button onClick={() => { setStatus('idle'); setProgress(0); setLogLines([]); }}
            style={{ padding:'12px 32px', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.7)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, fontWeight:600, fontSize:15, cursor:'pointer' }}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}