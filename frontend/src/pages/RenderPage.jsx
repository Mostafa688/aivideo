import React, { useState, useRef } from 'react';

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
  '30s':   5,
  'auto':  5,
  '1min':  8,
  '2min':  12,
  '3min':  18,
  '4min':  22,
  '5min':  28,
  '8min':  40,
  '10min': 50,
};

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
  };
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readJsonSafely(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const isHtml = /^\s*</.test(text);
    throw new Error(isHtml ? 'NON_JSON_RESPONSE' : 'INVALID_JSON_RESPONSE');
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
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </div>
  );
}

function AIEditModal({ scenes, onClose, onApply }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleAIEdit = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai-edit', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ scenes, prompt }),
      });
      const data = await res.json();
      if (data.scenes) setResult(data.scenes);
    } catch (e) {
      console.error('AI Edit failed:', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
      <div style={{ background: 'var(--bg2)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>✨ Edit with AI</h3>
        <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16 }}>اكتب التعديل اللي عايزه على الفيديو وهيتعدل تلقائياً</p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="مثال: اجعل النص أكثر حماساً..." rows={4}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 10, resize: 'none', marginBottom: 16, fontSize: 13, lineHeight: 1.6, boxSizing: 'border-box' }} />
        {result && (
          <div style={{ padding: '10px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, marginBottom: 16 }}>
            <p style={{ fontSize: 13, color: 'var(--green)' }}>✓ تم تعديل {result.length} مشهد - اضغط تطبيق</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>إلغاء</button>
          {result ? (
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => onApply(result)}>✓ تطبيق التعديلات</button>
          ) : (
            <button className="btn-primary" style={{ flex: 1 }} onClick={handleAIEdit} disabled={loading || !prompt.trim()}>
              {loading ? '⏳ جاري التعديل...' : '✨ عدل'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RenderPage({ scenes: initialScenes, formData, user, onBack, onReset }) {
  const [scenes, setScenes] = useState(initialScenes);
  const [status, setStatus] = useState('idle');
  const [videoUrl, setVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [captionStyle, setCaptionStyle] = useState('classic');
  const [videoEffect, setVideoEffect] = useState('none');
  const [musicVolume, setMusicVolume] = useState(formData?.musicVolume ?? 0.07);
  const [sfxVolume, setSfxVolume] = useState(0.4);
  const [showAIEdit, setShowAIEdit] = useState(false);
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

  // ✅ Voice to Video: لو uploadedAudioUrl موجود نستخدمه مباشرة
  const isVoiceMode     = !!(formData?.uploadedAudioUrl);
  const uploadedAudio   = formData?.uploadedAudioUrl || null;

  // ✅ audioUrl: لو voice mode نبدأ بالـ uploaded audio، لو عادي نبدأ بـ null
  const [audioUrl, setAudioUrl] = useState(isVoiceMode ? uploadedAudio : null);

  const fullText = scenes.map(s => s.text).join(' ');

  const RATIO_STYLE = {
    '16:9': { maxWidth: 560, aspectRatio: '16/9' },
    '9:16': { maxWidth: 300, aspectRatio: '9/16' },
    '1:1':  { maxWidth: 400, aspectRatio: '1/1'  },
  };
  const ratioStyle = RATIO_STYLE[ratio] || RATIO_STYLE['16:9'];

  // ✅ generate voice — بس لو مش voice mode
  const handleGenerateVoice = async () => {
    setStatus('voice');
    setProgress('Generating voiceover...');
    setError(null);
    try {
      const res = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ text: fullText, voice, videoType: tone, videoLanguage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voice generation failed');
      setAudioUrl(data.audioUrl);
      setStatus('ready');
      setProgress('');
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  };

  const handleRender = async () => {
    setStatus('rendering');
    setProgress('Rendering video... (this may take a few minutes)');
    setError(null);
    try {
      const jobId = Date.now();
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          scenes, audioUrl, ratio, jobId, duration,
          music, captions, transitions, soundEffects,
          videoType: tone, captionStyle, musicVolume, sfxVolume, videoEffect,
          sceneCount: scenes.length, videoLanguage,
        }),
      });
      const data = await readJsonSafely(res);
      if (!res.ok) throw new Error(data.error || 'Render failed');

      const maxMinutes = MAX_POLL_MINUTES[duration] || 30;
      const maxWaitMs = maxMinutes * 60 * 1000;
      const pollStart = Date.now();
      const pollIntervalMs = ['5min', '8min', '10min'].includes(duration) ? 8000 : 5000;
      let transientFailures = 0;
      const maxTransientFailures = 10;

      while (true) {
        await delay(pollIntervalMs);
        const elapsed = Date.now() - pollStart;
        if (elapsed > maxWaitMs) {
          throw new Error(`Render is taking longer than expected (${maxMinutes} min). Your video may still be processing — check "My Videos" in a few minutes.`);
        }
        const elapsedMin = Math.floor(elapsed / 60000);
        const elapsedSec = Math.floor((elapsed % 60000) / 1000);
        const timeStr = elapsedMin > 0 ? `${elapsedMin}m ${elapsedSec}s` : `${elapsedSec}s`;

        let statusRes, statusData;
        try {
          statusRes = await fetch(`/api/render-status/${data.jobId}`, {
            headers: { ...authHeaders(), Accept: 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            cache: 'no-store',
          });
          statusData = await readJsonSafely(statusRes);
          transientFailures = 0;
        } catch (pollErr) {
          transientFailures += 1;
          if (transientFailures >= maxTransientFailures) throw new Error('Connection interrupted. Your video may still be rendering — check "My Videos" shortly.');
          setProgress(`Rendering video... reconnecting (${timeStr})`);
          continue;
        }

        if (!statusRes.ok) {
          transientFailures += 1;
          if (transientFailures >= maxTransientFailures) throw new Error(statusData.error || 'Render status check failed');
          setProgress(`Rendering video... waiting for status (${timeStr})`);
          continue;
        }

        if (statusData.status === 'done') { setVideoUrl(statusData.videoUrl); setStatus('done'); setProgress(''); break; }
        if (statusData.status === 'failed') throw new Error(statusData.error || 'Render failed');
        setProgress(`⏳ Rendering video... ${timeStr} elapsed (up to ${maxMinutes} min for ${duration})`);
      }
    } catch (e) {
      setError(e.message);
      setStatus('idle');
      setProgress('');
    }
  };

  const handleAIEditApply = (newScenes) => {
    setScenes(newScenes);
    setShowAIEdit(false);
    setVideoUrl(null);
    // ✅ لو voice mode نحتفظ بالـ uploadedAudio، لو عادي نمسح الـ audioUrl
    if (!isVoiceMode) setAudioUrl(null);
    setStatus('idle');
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

      {showAIEdit && <AIEditModal scenes={scenes} onClose={() => setShowAIEdit(false)} onApply={handleAIEditApply} />}

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

      {/* ✅ Voice mode banner */}
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

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 16 }}>
          <p style={{ fontSize: 14, color: 'var(--red)', fontWeight: 500 }}>Error: {error}</p>
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div style={{ padding: '12px 16px', background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 10, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pulsing" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: 'var(--accent2)' }}>{progress}</span>
        </div>
      )}

      <div className="render-layout">
        {/* LEFT: Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Caption Style */}
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

          {/* Video Effects */}
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

          {/* Audio Levels */}
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>Audio Levels</p>
            {music && <Slider label="🎵 Music Volume" value={musicVolume} onChange={setMusicVolume} min={0} max={0.5} step={0.01} />}
            {soundEffects && <Slider label="🔊 SFX Volume" value={sfxVolume} onChange={setSfxVolume} min={0} max={1} step={0.05} />}
            {!music && !soundEffects && <p style={{ fontSize: 13, color: 'var(--text3)' }}>Enable Music or Sound Effects to adjust volume.</p>}
          </div>

          {/* Summary */}
          <div className="card" style={{ padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Summary</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                ['Scenes',   scenes.length],
                ['Ratio',    ratio],
                ['Duration', duration],
                ['Voice',    isVoiceMode ? '🎙️ Uploaded' : voice],
                ['Language', videoLanguage.toUpperCase()],
                ['Music',    music ? `On (${Math.round(musicVolume * 100)}%)` : 'Off'],
                ['Captions', captions ? 'On' : 'Off'],
                ['Effect',   videoEffect],
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

            {/* ✅ Voice mode: مفيش زر generate voice — بس زر render مباشرة */}
            {!isVoiceMode && !audioUrl && (
              <button className="btn-primary" onClick={handleGenerateVoice} disabled={status !== 'idle'} style={{ width: '100%', padding: '14px' }}>
                {status === 'voice' ? 'Generating voice...' : '🎙️ Generate Voiceover'}
              </button>
            )}

            {/* Normal mode: voice ready indicator */}
            {!isVoiceMode && audioUrl && !videoUrl && (
              <div style={{ padding: '10px 14px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--green)', fontSize: 13, flexShrink: 0 }}>✓ Voice ready</span>
                <audio src={audioUrl} controls style={{ height: 30, flex: 1, minWidth: 0 }} />
              </div>
            )}

            <button className="btn-primary" onClick={handleRender}
              disabled={status === 'rendering' || status === 'voice'}
              style={{ width: '100%', padding: '14px', opacity: (status === 'rendering' || status === 'voice') ? 0.6 : 1 }}>
              {status === 'rendering' ? '⏳ Rendering...' : isVoiceMode ? '🎙️ Render with My Voice' : '🎬 Render Video'}
            </button>

            {videoUrl && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button onClick={() => setShowAIEdit(true)} style={{ padding: '12px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.3)', color: 'var(--accent)' }}>✨ Edit with AI</button>
                <button onClick={onBack} style={{ padding: '12px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: 'var(--green)' }}>✏️ Edit Manual</button>
              </div>
            )}

            {videoUrl && (
              <button onClick={onReset} style={{ width: '100%', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', padding: '12px', borderRadius: 10, cursor: 'pointer', fontSize: 14 }}>↺ New Video</button>
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
                <a href={videoUrl} download style={{ display: 'block', textAlign: 'center', marginTop: 12, background: 'var(--accent)', color: '#fff', padding: '12px', borderRadius: 8, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>⬇️ Download Video</a>
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