import React, { useState, useRef, useCallback } from 'react';

const VIDEO_EFFECTS = [
  { key: 'none',       label: 'None',      icon: '🎬' },
  { key: 'cinematic',  label: 'Cinematic', icon: '🎥' },
  { key: 'grayscale',  label: 'Grayscale', icon: '⬛' },
  { key: 'sepia',      label: 'Sepia',     icon: '🟫' },
  { key: 'vignette',   label: 'Vignette',  icon: '🔵' },
  { key: 'sharpen',    label: 'Sharpen',   icon: '✨' },
  { key: 'brightness', label: 'Bright',    icon: '☀️' },
  { key: 'blur',       label: 'Blur',      icon: '🌫️' },
];

const CAPTION_STYLES = [
  { key: 'classic',     label: 'Classic'     },
  { key: 'bold_yellow', label: 'Bold Yellow' },
  { key: 'center_box',  label: 'Center Box'  },
  { key: 'documentary', label: 'Documentary' },
  { key: 'clean_white', label: 'Clean White' },
];

const MAX_POLL_MINUTES = {
  '30s':  10, 'auto': 10, '1min': 20, '2min': 30,
  '3min': 45, '4min': 55, '5min': 70, '8min': 90, '10min': 120,
};

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') };
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
async function readJsonSafely(res) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch {
    throw new Error(/^\s*</.test(text) ? 'NON_JSON_RESPONSE' : 'INVALID_JSON_RESPONSE');
  }
}

function Slider({ label, value, onChange, min = 0, max = 1, step = 0.01, format }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
          {format ? format(value) : Math.round(value * 100) + '%'}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }} />
    </div>
  );
}

// ── AI Edit Modal ─────────────────────────────────────────────────────────────
function AIEditModal({ scenes, onClose, onApplyAndRender }) {
  const [prompt, setPrompt]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  const suggestions = [
    'احذف الكابشن من الفيديو',
    'اجعل النص أكثر حماساً',
    'اجعل النص أقصر وأكثر تأثيراً',
    'غير أسلوب الكلام ليكون رسمياً',
    'اجعل المقدمة أقوى',
  ];

  const handleAIEdit = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/ai-edit', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ scenes, prompt }),
      });
      const data = await res.json();
      if (data.scenes) setResult(data.scenes);
      else setError(data.error || 'فشل التعديل');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>✨ Edit with AI</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>اكتب التعديل اللي عايزه وهيتعدل ويتعمل re-render تلقائياً</p>

        {/* Suggestions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => setPrompt(s)}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text3)', cursor: 'pointer', transition: 'all 0.15s' }}>
              {s}
            </button>
          ))}
        </div>

        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="مثال: احذف الكابشن، اجعل النص أقصر، غير الأسلوب..."
          rows={4}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'none', marginBottom: 12, fontSize: 13, lineHeight: 1.6, boxSizing: 'border-box', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }} />

        {error && <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 12 }}>❌ {error}</p>}

        {result && (
          <div style={{ padding: '10px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--green)', margin: 0 }}>✓ تم تعديل {result.length} مشهد — سيتم عمل render تلقائياً</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>إلغاء</button>
          {result ? (
            <button className="btn-primary" style={{ flex: 2 }} onClick={() => onApplyAndRender(result)}>🎬 تطبيق وعمل Render</button>
          ) : (
            <button className="btn-primary" style={{ flex: 2 }} onClick={handleAIEdit} disabled={loading || !prompt.trim()}>
              {loading ? '⏳ جاري التعديل...' : '✨ عدّل'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Manual Editor Modal ───────────────────────────────────────────────────────
function ManualEditorModal({ videoUrl, onClose }) {
  const videoRef       = useRef(null);
  const [speed, setSpeed]           = useState(1);
  const [volume, setVolume]         = useState(1);
  const [trimStart, setTrimStart]   = useState(0);
  const [trimEnd, setTrimEnd]       = useState(100);
  const [duration, setDuration]     = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying]       = useState(false);
  const [extAudio, setExtAudio]     = useState(null);
  const extAudioRef = useRef(null);

  const onLoaded = () => { if (videoRef.current) setDuration(videoRef.current.duration); };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); extAudioRef.current?.pause(); }
    else {
      videoRef.current.currentTime = (trimStart / 100) * duration;
      videoRef.current.play();
      if (extAudioRef.current) { extAudioRef.current.currentTime = 0; extAudioRef.current.play(); }
    }
    setPlaying(p => !p);
  };

  const onTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime;
    setCurrentTime(ct);
    if (ct >= (trimEnd / 100) * duration) { videoRef.current.pause(); extAudioRef.current?.pause(); setPlaying(false); }
  };

  const handleExtAudio = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setExtAudio(URL.createObjectURL(file));
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const applySpeed  = () => { if (videoRef.current) videoRef.current.playbackRate = speed; };
  const applyVolume = () => { if (videoRef.current) videoRef.current.volume = volume; };

  const manualCSS = `
    .med-slider { width: 100%; accent-color: var(--accent); }
    .med-btn { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg3); color: var(--text); cursor: pointer; font-size: 13px; font-weight: 600; transition: all 0.15s; }
    .med-btn:hover { background: var(--accent-bg); border-color: var(--accent); color: var(--accent); }
    .med-section { background: var(--bg3); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
    .med-label { font-size: 11px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 10px; font-weight: 600; }
    .med-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    @media (max-width: 540px) { .med-row { flex-direction: column; align-items: stretch; } }
  `;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
      <style>{manualCSS}</style>
      <div style={{ background: 'var(--bg2)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 620, maxHeight: '95vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>✏️ Manual Editor</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {/* Video Preview */}
        <div style={{ borderRadius: 12, overflow: 'hidden', background: '#000', marginBottom: 16, position: 'relative' }}>
          <video ref={videoRef} src={videoUrl} style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block' }}
            onLoadedMetadata={onLoaded} onTimeUpdate={onTimeUpdate} />
          {extAudio && <audio ref={extAudioRef} src={extAudio} />}
        </div>

        {/* Timeline */}
        {duration > 0 && (
          <div className="med-section">
            <div className="med-label">⏱ Timeline — {fmt(currentTime)} / {fmt(duration)}</div>
            <div style={{ position: 'relative', height: 32, background: 'var(--bg2)', borderRadius: 8, marginBottom: 8 }}>
              <div style={{ position: 'absolute', left: `${trimStart}%`, right: `${100 - trimEnd}%`, top: 0, bottom: 0, background: 'rgba(124,106,247,0.25)', borderLeft: '3px solid var(--accent)', borderRight: '3px solid var(--accent)', borderRadius: 4 }} />
              <div style={{ position: 'absolute', left: `${(currentTime / duration) * 100}%`, top: 0, bottom: 0, width: 2, background: '#fff', borderRadius: 2 }} />
            </div>
            <div className="med-row" style={{ gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Start: {fmt((trimStart / 100) * duration)}</div>
                <input type="range" className="med-slider" min={0} max={trimEnd - 1} value={trimStart} onChange={e => setTrimStart(Number(e.target.value))} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>End: {fmt((trimEnd / 100) * duration)}</div>
                <input type="range" className="med-slider" min={trimStart + 1} max={100} value={trimEnd} onChange={e => setTrimEnd(Number(e.target.value))} />
              </div>
            </div>
          </div>
        )}

        {/* Playback Controls */}
        <div className="med-section">
          <div className="med-label">▶ Playback</div>
          <div className="med-row" style={{ justifyContent: 'center', gap: 12 }}>
            <button className="med-btn" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 5); } }}>⏪ -5s</button>
            <button className="med-btn" style={{ minWidth: 80 }} onClick={togglePlay}>{playing ? '⏸ Pause' : '▶ Play'}</button>
            <button className="med-btn" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 5); } }}>+5s ⏩</button>
          </div>
        </div>

        {/* Speed */}
        <div className="med-section">
          <div className="med-label">⚡ Speed — {speed}x</div>
          <div className="med-row">
            <input type="range" className="med-slider" style={{ flex: 1 }} min={0.25} max={3} step={0.25} value={speed} onChange={e => setSpeed(Number(e.target.value))} />
            <button className="med-btn" onClick={applySpeed}>Apply</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(s => (
              <button key={s} className="med-btn" style={{ fontSize: 11, padding: '4px 10px', background: speed === s ? 'var(--accent-bg)' : 'var(--bg2)', borderColor: speed === s ? 'var(--accent)' : 'var(--border)', color: speed === s ? 'var(--accent)' : 'var(--text3)' }}
                onClick={() => { setSpeed(s); if (videoRef.current) videoRef.current.playbackRate = s; }}>{s}x</button>
            ))}
          </div>
        </div>

        {/* Volume */}
        <div className="med-section">
          <div className="med-label">🔊 Volume — {Math.round(volume * 100)}%</div>
          <div className="med-row">
            <input type="range" className="med-slider" style={{ flex: 1 }} min={0} max={1} step={0.05} value={volume} onChange={e => setVolume(Number(e.target.value))} />
            <button className="med-btn" onClick={applyVolume}>Apply</button>
          </div>
        </div>

        {/* External Audio */}
        <div className="med-section">
          <div className="med-label">🎵 Add Music / Audio</div>
          <div className="med-row">
            <label style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px dashed var(--border)', color: 'var(--text3)', cursor: 'pointer', textAlign: 'center', fontSize: 13 }}>
              {extAudio ? '✅ Audio loaded' : '📤 Upload audio file (MP3, WAV)'}
              <input type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleExtAudio} />
            </label>
            {extAudio && <button className="med-btn" onClick={() => setExtAudio(null)}>✕ Remove</button>}
          </div>
          {extAudio && (
            <audio src={extAudio} controls style={{ width: '100%', marginTop: 10, borderRadius: 8 }} />
          )}
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, margin: '8px 0 0' }}>
            💡 Audio plays alongside the video during preview. For permanent merge, use the Render button.
          </p>
        </div>

        {/* Download */}
        <a href={videoUrl} download style={{ display: 'block', textAlign: 'center', background: 'var(--accent)', color: '#fff', padding: '13px', borderRadius: 10, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
          ⬇️ Download Video
        </a>
      </div>
    </div>
  );
}

// ── Main RenderPage ───────────────────────────────────────────────────────────
export default function RenderPage({ scenes: initialScenes, formData, user, onBack, onReset }) {
  const [scenes, setScenes]         = useState(initialScenes);
  const [status, setStatus]         = useState('idle');
  const [videoUrl, setVideoUrl]     = useState(null);
  const [error, setError]           = useState(null);
  const [progress, setProgress]     = useState('');
  const [captionStyle, setCaptionStyle] = useState('classic');
  const [videoEffect, setVideoEffect]   = useState('none');
  const [musicVolume, setMusicVolume]   = useState(formData?.musicVolume ?? 0.07);
  const [sfxVolume, setSfxVolume]       = useState(0.4);
  const [showAIEdit, setShowAIEdit]     = useState(false);
  const [showManual, setShowManual]     = useState(false);
  const videoRef = useRef(null);

  const ratio         = formData?.ratio         || '16:9';
  const music         = formData?.music         ?? true;
  const captions      = formData?.captions      ?? true;
  const soundEffects  = formData?.soundEffects  ?? false;
  const transitions   = formData?.transitions   ?? true;
  const tone          = formData?.tone          || 'motivational';
  const voice         = formData?.voice         || 'female';
  const duration      = formData?.duration      || '1min';
  const videoLanguage = formData?.videoLanguage || 'en';
  const isVoiceMode   = !!(formData?.uploadedAudioUrl);
  const uploadedAudio = formData?.uploadedAudioUrl || null;
  const [audioUrl, setAudioUrl] = useState(isVoiceMode ? uploadedAudio : null);

  const fullText = scenes.map(s => s.text).join(' ');
  const RATIO_STYLE = {
    '16:9': { maxWidth: 560, aspectRatio: '16/9' },
    '9:16': { maxWidth: 300, aspectRatio: '9/16' },
    '1:1':  { maxWidth: 400, aspectRatio: '1/1'  },
  };
  const ratioStyle = RATIO_STYLE[ratio] || RATIO_STYLE['16:9'];

  const handleGenerateVoice = async () => {
    setStatus('voice'); setProgress('Generating voiceover...'); setError(null);
    try {
      const res = await fetch('/api/generate-voice', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ text: fullText, voice, videoType: tone, videoLanguage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voice generation failed');
      setAudioUrl(data.audioUrl); setStatus('ready'); setProgress('');
    } catch (e) { setError(e.message); setStatus('idle'); }
  };

  const handleRender = useCallback(async (overrideScenes, overrideAudio) => {
    const renderScenes = overrideScenes || scenes;
    let renderAudio    = overrideAudio  || audioUrl;
    setError(null);

    // ── Auto-generate voice if not already done ──────────────────────────────
    if (!isVoiceMode && !renderAudio) {
      setStatus('voice');
      setProgress('🎙️ Generating voiceover...');
      try {
        const vRes = await fetch('/api/generate-voice', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ text: renderScenes.map(s => s.text).join(' '), voice, videoType: tone, videoLanguage }),
        });
        const vData = await vRes.json();
        if (!vRes.ok) throw new Error(vData.error || 'Voice generation failed');
        renderAudio = vData.audioUrl;
        setAudioUrl(vData.audioUrl);
      } catch (e) {
        setError(e.message);
        setStatus('idle');
        return;
      }
    }

    setStatus('rendering');
    setProgress('Rendering video... (this may take a few minutes)');
    let retryCount = 0;
    const MAX_QUEUE_RETRIES = 60;
    const jobId = Date.now();
    try {
      let res, data;
      // ── Queue loop: retry if server busy ─────────────────────────────────
      while (true) {
        res = await fetch('/api/render', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({
            scenes: renderScenes, audioUrl: renderAudio, ratio, jobId, duration,
            music, captions, transitions, soundEffects,
            videoType: tone, captionStyle, musicVolume, sfxVolume, videoEffect,
            sceneCount: renderScenes.length, videoLanguage,
          }),
        });
        data = await readJsonSafely(res);
        if (res.status === 429 && data.error === 'server_busy') {
          retryCount++;
          if (retryCount > MAX_QUEUE_RETRIES) throw new Error('Server is busy. Please try again later.');
          setProgress('⏳ Server is busy... waiting in queue');
          await delay(5000);
          continue;
        }
        break;
      }
      if (!res.ok) throw new Error(data.error || 'Render failed');

      const maxMinutes = MAX_POLL_MINUTES[duration] || 30;
      const maxWaitMs  = maxMinutes * 60 * 1000;
      const pollStart  = Date.now();
      const pollIntervalMs = ['5min', '8min', '10min'].includes(duration) ? 8000 : 5000;
      let transientFailures = 0;

      while (true) {
        await delay(pollIntervalMs);
        const elapsed = Date.now() - pollStart;
        if (elapsed > maxWaitMs) throw new Error(`Render taking longer than expected — check "My Videos" soon.`);
        const elapsedMin = Math.floor(elapsed / 60000);
        const elapsedSec = Math.floor((elapsed % 60000) / 1000);
        const timeStr = elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`;

        let statusRes, statusData;
        try {
          statusRes  = await fetch(`/api/render-status/${data.jobId}`, { headers: { ...authHeaders(), Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store' });
          statusData = await readJsonSafely(statusRes);
          transientFailures = 0;
        } catch {
          if (++transientFailures >= 10) throw new Error('Connection interrupted — check "My Videos" shortly.');
          setProgress(`Rendering... reconnecting (${timeStr})`);
          continue;
        }

        if (!statusRes.ok) { if (++transientFailures >= 10) throw new Error(statusData.error || 'Status check failed'); continue; }
        if (statusData.status === 'done')   { setVideoUrl(statusData.videoUrl); setStatus('done'); setProgress(''); break; }
        if (statusData.status === 'failed') throw new Error(statusData.error || 'Render failed');
        setProgress(`⏳ Rendering... ${timeStr} elapsed (up to ${maxMinutes} min)`);
      }
    } catch (e) { setError(e.message); setStatus('idle'); setProgress(''); }
  }, [scenes, audioUrl, ratio, duration, music, captions, transitions, soundEffects, tone, captionStyle, musicVolume, sfxVolume, videoEffect, videoLanguage]);

  const handleAIEditApply = (newScenes) => {
    setScenes(newScenes);
    setShowAIEdit(false);
    setVideoUrl(null);
    if (!isVoiceMode) setAudioUrl(null);
    setStatus('idle');
    // Re-render تلقائي بعد ثانية
    setTimeout(() => handleRender(newScenes, isVoiceMode ? uploadedAudio : null), 800);
  };

  const responsiveCSS = `
    .render-layout { display: grid; grid-template-columns: 1fr 280px; gap: 20px; align-items: start; }
    .render-sidebar { position: sticky; top: 80px; }
    .preview-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; background: var(--bg3); border-radius: 10px; padding: 32px 16px; color: var(--text3); font-size: 13px; text-align: center; }
    @media (max-width: 640px) { .render-layout { grid-template-columns: 1fr; } .render-sidebar { position: static; order: -1; } }
  `;

  return (
    <div style={{ minHeight: '100vh', maxWidth: 900, margin: '0 auto', padding: '24px 16px 80px' }}>
      <style>{responsiveCSS}</style>

      {showAIEdit && <AIEditModal scenes={scenes} onClose={() => setShowAIEdit(false)} onApplyAndRender={handleAIEditApply} />}
      {showManual && <ManualEditorModal videoUrl={videoUrl} onClose={() => setShowManual(false)} />}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '8px 14px', flexShrink: 0 }}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isVoiceMode ? '🎙️ Voice to Video — Render' : 'Render Video'}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {scenes.length} scenes · {ratio} · {duration} · {videoLanguage.toUpperCase()}
            {isVoiceMode ? ' · Your Voice' : ''}
          </p>
        </div>
      </div>

      {isVoiceMode && (
        <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎙️</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', margin: 0 }}>Your uploaded voice is ready</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>No new voiceover will be generated — click Render Video directly</p>
          </div>
          <audio src={uploadedAudio} controls style={{ height: 30, maxWidth: 180 }} />
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--red)', fontWeight: 500 }}>Error: {error}</p>
        </div>
      )}

      {progress && (
        <div style={{ padding: '12px 16px', background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pulsing" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: 'var(--accent2)' }}>{progress}</span>
        </div>
      )}

      <div className="render-layout">
        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {captions && (
            <div className="card" style={{ padding: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Caption Style</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {CAPTION_STYLES.map(s => (
                  <span key={s.key} className={`pill${captionStyle === s.key ? ' active' : ''}`} onClick={() => setCaptionStyle(s.key)}>{s.label}</span>
                ))}
              </div>
            </div>
          )}

          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Video Effect</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {VIDEO_EFFECTS.map(ef => (
                <div key={ef.key} onClick={() => setVideoEffect(ef.key)} style={{ padding: '10px 6px', borderRadius: 10, cursor: 'pointer', textAlign: 'center', border: '1px solid ' + (videoEffect === ef.key ? 'var(--accent)' : 'var(--border)'), background: videoEffect === ef.key ? 'var(--accent-bg)' : 'var(--bg2)', transition: 'all 0.15s' }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{ef.icon}</div>
                  <div style={{ fontSize: 10, color: videoEffect === ef.key ? 'var(--accent)' : 'var(--text3)', fontWeight: 500 }}>{ef.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Audio Levels</p>
            {music && <Slider label="🎵 Music Volume" value={musicVolume} onChange={setMusicVolume} min={0} max={0.5} step={0.01} />}
            {soundEffects && <Slider label="🔊 SFX Volume" value={sfxVolume} onChange={setSfxVolume} min={0} max={1} step={0.05} />}
            {!music && !soundEffects && <p style={{ fontSize: 13, color: 'var(--text3)' }}>Enable Music or Sound Effects to adjust volume.</p>}
          </div>

          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Summary</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Scenes', scenes.length], ['Ratio', ratio], ['Duration', duration],
                ['Voice', isVoiceMode ? '🎙️ Uploaded' : voice], ['Language', videoLanguage.toUpperCase()],
                ['Music', music ? `On (${Math.round(musicVolume * 100)}%)` : 'Off'],
                ['Captions', captions ? 'On' : 'Off'], ['Effect', videoEffect],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', padding: '7px 0' }}>
                  <span style={{ fontSize: 13, color: 'var(--text3)' }}>{k}</span>
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!isVoiceMode && audioUrl && !videoUrl && (
              <div style={{ padding: '10px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--green)', fontSize: 13, flexShrink: 0 }}>✓ Voice ready</span>
                <audio src={audioUrl} controls style={{ height: 30, flex: 1, minWidth: 0 }} />
              </div>
            )}

            <button className="btn-primary" onClick={() => handleRender()}
              disabled={status === 'rendering' || status === 'voice'}
              style={{ width: '100%', padding: 14, opacity: (status === 'rendering' || status === 'voice') ? 0.6 : 1 }}>
              {status === 'voice' ? '🎙️ Generating voice...' : status === 'rendering' ? '⏳ Rendering...' : isVoiceMode ? '🎙️ Render with My Voice' : '🎬 Render Video'}
            </button>

            {videoUrl && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={() => setShowAIEdit(true)}
                  style={{ padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.3)', color: 'var(--accent)' }}>
                  ✨ Edit with AI
                </button>
                <button onClick={() => setShowManual(true)}
                  style={{ padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: 'var(--green)' }}>
                  ✏️ Edit Manual
                </button>
              </div>
            )}

            {videoUrl && (
              <button onClick={onReset} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', padding: 12, borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>↺ New Video</button>
            )}
          </div>
        </div>

        {/* RIGHT: Preview */}
        <div className="render-sidebar">
          <div className="card" style={{ padding: 16 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Preview</p>
            {videoUrl ? (
              <>
                <div style={{ width: '100%', aspectRatio: ratioStyle.aspectRatio, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
                  <video ref={videoRef} controls playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain' }}>
                    <source src={videoUrl} type="video/mp4" />
                  </video>
                </div>
                <a href={videoUrl} download style={{ display: 'block', textAlign: 'center', marginTop: 12, background: 'var(--accent)', color: '#fff', padding: 12, borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>⬇️ Download Video</a>
              </>
            ) : (
              <div className="preview-placeholder">
                <span style={{ fontSize: 32 }}>{isVoiceMode ? '🎙️' : '🎬'}</span>
                <span>{isVoiceMode ? 'Click "Render with My Voice" to start' : 'Your video will appear here after rendering'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}