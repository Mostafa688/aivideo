import React, { useEffect, useRef, useState } from 'react';

const TYPE_COLORS = {
  hook:   { bg: 'rgba(124,106,247,0.1)', border: 'rgba(124,106,247,0.3)', label: '#a08ff8' },
  body:   { bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)',  label: '#34d399' },
  ending: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)',  label: '#fbbf24' },
};

function SceneCard({ scene, index, total, onChange, onRemove, onMove }) {
  const [editingText, setEditingText] = useState(false);
  const [localText, setLocalText] = useState(scene.text);
  const [newKeyword, setNewKeyword] = useState('');
  const colors = TYPE_COLORS[scene.type] || TYPE_COLORS.body;

  const saveText = () => {
    setEditingText(false);
    if (localText.trim()) onChange({ ...scene, text: localText.trim() });
  };

  const removeKeyword = (kw) => onChange({ ...scene, keywords: scene.keywords.filter(k => k !== kw) });
  const addKeyword = (e) => {
    if (e.key === 'Enter' && newKeyword.trim()) {
      onChange({ ...scene, keywords: [...scene.keywords, newKeyword.trim().toLowerCase()] });
      setNewKeyword('');
    }
  };

  return (
    <div className="animate-in" style={{ background: colors.bg, border: '1px solid ' + colors.border, borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: colors.label, textTransform: 'uppercase', letterSpacing: '0.07em', background: colors.border, padding: '2px 8px', borderRadius: 999 }}>{scene.type}</span>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>Scene {scene.index}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {index > 0 && <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => onMove(index, -1)}>↑</button>}
          {index < total - 1 && <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => onMove(index, 1)}>↓</button>}
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 13 }} onClick={() => setEditingText(!editingText)}>{editingText ? 'Done' : 'Edit'}</button>
          <button onClick={onRemove} style={{ background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', padding: '4px 10px', borderRadius: 8, fontSize: 13 }}>✕</button>
        </div>
      </div>
      {editingText ? (
        <textarea value={localText} onChange={e => setLocalText(e.target.value)} onBlur={saveText} rows={3} autoFocus style={{ width: '100%', resize: 'none', padding: '10px 12px', marginBottom: 12, lineHeight: 1.6, fontSize: 14 }} />
      ) : (
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, marginBottom: 12, cursor: 'text' }} onClick={() => setEditingText(true)}>{scene.text}</p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 500, marginRight: 2 }}>MEDIA:</span>
        {scene.keywords.map(kw => (
          <span key={kw} className="keyword-pill">{kw}<span onClick={() => removeKeyword(kw)} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 11, marginLeft: 2 }}>×</span></span>
        ))}
        <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={addKeyword} placeholder="+ keyword" style={{ background: 'transparent', border: 'none', padding: '2px 6px', fontSize: 12, color: 'var(--text2)', width: 90 }} />
      </div>
    </div>
  );
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
  };
}

export default function ScenesPage({ formData, onBack, onRender, onScenesGenerated }) {
  const [scenes, setScenes] = useState([]);
  const [status, setStatus] = useState('Connecting...');
  const [streaming, setStreaming] = useState(true);
  const [error, setError] = useState(null);
  const [fetchingMedia, setFetchingMedia] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiProgress, setAiProgress] = useState(null);

  // ✅ Voice to Video: خيارات الموسيقى والـ captions للصوت المرفوع
  const [voiceMusic, setVoiceMusic] = useState(true);
const [voiceRatio, setVoiceRatio] = useState(formData?.ratio || '9:16');
  const [voiceMusicVolume, setVoiceMusicVolume] = useState(0.07);
  const [voiceCaptions, setVoiceCaptions] = useState(true);

  const abortRef = useRef(null);

  // ✅ هل الجلسة دي voice to video؟
  const isVoiceMode = !!(formData?.uploadedAudioUrl);

  const EXPECTED_SCENES = {
    '30s': 4, '1min': 8, '2min': 17, '3min': 26, '4min': 34, '5min': 42, '8min': 56, '10min': 70, 'auto': 8,
  };
  const expectedCount = EXPECTED_SCENES[formData?.duration] || 8;

  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    (async () => {
      try {
        const res = await fetch('/api/generate-scenes', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(formData),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setError(errData.error || 'Server error. Is the backend running?');
          setStreaming(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const part of parts) {
            const lines = part.trim().split('\n');
            let event = 'message', data = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) event = line.slice(7);
              if (line.startsWith('data: ')) data = line.slice(6);
            }
            if (!data) continue;
            try {
              const parsed = JSON.parse(data);
              if (event === 'scene') setScenes(s => [...s, parsed]);
              if (event === 'status') setStatus(parsed.message);
              if (event === 'done') {
                setStreaming(false);
                setStatus('');
                if (onScenesGenerated) onScenesGenerated();
              }
              if (event === 'error') { setError(parsed.message); setStreaming(false); }
            } catch {}
          }
        }
        setStreaming(false);
      } catch (e) {
        if (e.name !== 'AbortError') setError(e.message);
        setStreaming(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const cancel = () => { abortRef.current?.abort(); setStreaming(false); };
  const updateScene = (i, updated) => setScenes(s => s.map((sc, idx) => idx === i ? updated : sc));
  const removeScene = (i) => setScenes(s => s.filter((_, idx) => idx !== i));
  const moveScene = (i, dir) => {
    const arr = [...scenes];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setScenes(arr);
  };

  const handleContinue = async () => {
    // ✅ Voice mode: نجيب الـ media الأول وبعدين نبعت الـ uploadedAudioUrl
    setFetchingMedia(true);
    try {
      const res = await fetch('/api/fetch-media', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ scenes, ratio: formData?.ratio || '16:9' }),
      });
      const data = await res.json();
      const enrichedScenes = data.scenes || scenes;

      if (isVoiceMode) {
        onRender(enrichedScenes, {
          audioUrl: formData.uploadedAudioUrl,
          music: voiceMusic,
          musicVolume: voiceMusicVolume,
          captions: voiceCaptions,
          videoLanguage: formData.videoLanguage || 'en',
          ratio: voiceRatio,
        });
      } else {
        onRender(enrichedScenes);
      }
    } catch (e) {
      if (isVoiceMode) {
        onRender(scenes, {
          audioUrl: formData.uploadedAudioUrl,
          music: voiceMusic,
          musicVolume: voiceMusicVolume,
          captions: voiceCaptions,
          videoLanguage: formData.videoLanguage || 'en',
          ratio: voiceRatio,
        });
      } else {
        onRender(scenes);
      }
    } finally {
      setFetchingMedia(false);
    }
  };

  const handleAIVideo = async () => {
    // ✅ Voice mode + AI slices: بنبعت الـ uploadedAudioUrl بعد generate AI scenes
    setGeneratingAI(true);
    setAiProgress({ current: 0, total: scenes.length });
    try {
      const res = await fetch('/api/generate-ai-video', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ scenes, ratio: formData?.ratio || '16:9' }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const lines = part.trim().split('\n');
          let event = 'message', data = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) event = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === 'ai_progress') setAiProgress({ current: parsed.index, total: parsed.total });
            if (event === 'done') {
              // ✅ لو voice mode نبعت الـ uploadedAudioUrl
              if (isVoiceMode) {
                onRender(parsed.scenes, {
                  audioUrl: formData.uploadedAudioUrl,
                  music: voiceMusic,
                  musicVolume: voiceMusicVolume,
                  captions: voiceCaptions,
                  videoLanguage: formData.videoLanguage || 'en',
                  ratio: formData?.ratio || '16:9',
                });
              } else {
                onRender(parsed.scenes);
              }
            }
            if (event === 'error') { setError(parsed.message); setGeneratingAI(false); }
          } catch {}
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingAI(false);
    }
  };

  const fullText = scenes.map(s => s.text).join(' ');

  // ✅ خيارات الـ captions للغات المتاحة في الموقع
  const CAPTION_LANGUAGES = {
    en: 'English', ar: 'العربية', de: 'Deutsch',
    fr: 'Français', es: 'Español', ru: 'Русский',
    ja: '日本語', pt: 'Português',
  };

  return (
    <div style={{ minHeight: '100vh', maxWidth: 680, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '8px 14px' }}>← Back</button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
            {isVoiceMode ? '🎙️ Voice to Video — Scene Preview' : 'Scene Preview'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>
            {isVoiceMode
              ? 'Scenes generated from your voice recording'
              : formData?.mode === 'idea'
              ? '"' + (formData?.idea || '').substring(0, 60) + '..."'
              : 'From your script'}
          </p>
        </div>
        {scenes.length > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: scenes.length >= expectedCount ? 'var(--green)' : 'var(--accent)' }}>
              {scenes.length}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>/ {expectedCount} scenes</div>
          </div>
        )}
      </div>

      {/* ✅ Voice mode banner */}
      {isVoiceMode && (
        <div style={{ padding: '12px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎙️</span>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', margin: 0 }}>Your uploaded voice will be used in the video</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>No new voiceover will be generated — your original recording is the audio track</p>
          </div>
        </div>
      )}

      {streaming && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 10, marginBottom: 20 }}>
          <div className="pulsing" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, color: 'var(--accent2)', flex: 1 }}>{status || 'Generating scenes...'}</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>{scenes.length} / {expectedCount}</span>
          <button className="btn-ghost" style={{ padding: '4px 12px', fontSize: 13 }} onClick={cancel}>Cancel</button>
        </div>
      )}

      {generatingAI && aiProgress && (
        <div style={{ padding: '12px 16px', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 10, marginBottom: 20 }}>
          <p style={{ fontSize: 14, color: 'var(--green)', marginBottom: 8 }}>Generating AI video scenes... {aiProgress.current}/{aiProgress.total}</p>
          <div style={{ background: 'var(--bg3)', borderRadius: 999, height: 6, overflow: 'hidden' }}>
            <div style={{ background: 'var(--green)', height: '100%', width: (aiProgress.current / aiProgress.total * 100) + '%', transition: 'width 0.3s' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '14px 16px', background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 10, marginBottom: 20 }}>
          <p style={{ fontSize: 14, color: 'var(--red)', fontWeight: 500 }}>Error: {error}</p>
        </div>
      )}

      {scenes.length === 0 && !streaming && !error && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>No scenes generated.</div>
      )}

      {scenes.map((scene, i) => (
        <SceneCard key={i} scene={scene} index={i} total={scenes.length}
          onChange={(updated) => updateScene(i, updated)}
          onRemove={() => removeScene(i)}
          onMove={(idx, dir) => moveScene(idx, dir)}
        />
      ))}

      {streaming && (
        <div style={{ height: 90, borderRadius: 12, border: '1px dashed var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="pulsing" style={{ fontSize: 13, color: 'var(--text3)' }}>
            Scene {scenes.length + 1} of {expectedCount} arriving...
          </span>
        </div>
      )}

      {scenes.length > 0 && !streaming && (
        <div style={{ marginTop: 24, padding: '20px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14 }}>
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 6 }}>
            {scenes.length} scenes · ~{Math.round(fullText.split(' ').length / 130)} min read
          </p>
          {scenes.length < expectedCount && (
            <p style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>
              ⚠️ Got {scenes.length} of {expectedCount} expected scenes. You can continue or go back and retry.
            </p>
          )}

          {/* ✅ Voice mode options: Music + Captions */}
          {isVoiceMode && (
            <div style={{ marginBottom: 16, padding: '16px', background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>🎙️ Voice Video Options</p>
<div style={{ marginBottom: 12 }}>
  <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8, fontWeight: 600 }}>📐 Video Size</p>
  <div style={{ display: 'flex', gap: 8 }}>
    {['9:16', '16:9', '1:1'].map(r => (
      <div key={r} onClick={() => setVoiceRatio(r)}
        style={{ flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
          border: '1px solid ' + (voiceRatio === r ? '#22c55e' : 'var(--border)'),
          background: voiceRatio === r ? 'rgba(34,197,94,0.08)' : 'var(--bg3)',
          fontSize: 13, fontWeight: 600,
          color: voiceRatio === r ? '#22c55e' : 'var(--text3)',
          transition: 'all 0.15s' }}>
        {r}
      </div>
    ))}
  </div>
</div>

              {/* Music Toggle */}
              <div onClick={() => setVoiceMusic(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10, marginBottom: 8, cursor: 'pointer', border: '1px solid ' + (voiceMusic ? 'rgba(34,197,94,0.3)' : 'transparent') }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>🎵 Background Music</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>Add ambient music behind your voice</p>
                </div>
                <div style={{ width: 42, height: 23, borderRadius: 999, background: voiceMusic ? '#22c55e' : 'var(--bg4)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 2.5, left: voiceMusic ? 21 : 2.5, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </div>
              </div>

              {/* Music Volume Slider */}
              {voiceMusic && (
                <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Music Volume</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', margin: 0 }}>{Math.round(voiceMusicVolume * 100)}%</p>
                  </div>
                  <input
                    type="range"
                    min={0.01} max={0.3} step={0.01}
                    value={voiceMusicVolume}
                    onChange={e => setVoiceMusicVolume(parseFloat(e.target.value))}
                    style={{ width: '100%', accentColor: '#22c55e' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>Very Low</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>Low</span>
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>Medium</span>
                  </div>
                </div>
              )}

              {/* Captions Toggle */}
              <div onClick={() => setVoiceCaptions(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg3)', borderRadius: 10, cursor: 'pointer', border: '1px solid ' + (voiceCaptions ? 'rgba(34,197,94,0.3)' : 'transparent') }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', margin: 0 }}>💬 Captions</p>
                  <p style={{ fontSize: 11, color: 'var(--text3)', margin: '2px 0 0' }}>
                    Auto-subtitles · {CAPTION_LANGUAGES[formData?.videoLanguage || 'en'] || 'English'}
                  </p>
                </div>
                <div style={{ width: 42, height: 23, borderRadius: 999, background: voiceCaptions ? '#22c55e' : 'var(--bg4)', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                  <div style={{ position: 'absolute', top: 2.5, left: voiceCaptions ? 21 : 2.5, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </div>
              </div>
            </div>
          )}

          {/* Model badge — زي ما هو */}
          {!isVoiceMode && (
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, padding:'10px 14px', borderRadius:10, background: formData?.videoType === 'ai_slices' ? 'var(--accent-bg)' : 'rgba(6,182,212,0.1)', border:'1px solid ' + (formData?.videoType === 'ai_slices' ? 'rgba(124,106,247,0.3)' : 'rgba(6,182,212,0.3)') }}>
              <span style={{ fontSize:18 }}>{formData?.videoType === 'ai_slices' ? '🎨' : '🎬'}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color: formData?.videoType === 'ai_slices' ? 'var(--accent)' : '#06b6d4' }}>
                  {formData?.videoType === 'ai_slices' ? 'Model 1 — AI Slices' : 'Model 2 — Pexels Clips'}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>Selected from previous step</div>
              </div>
            </div>
          )}

          <button
            onClick={formData?.videoType === 'ai_slices' ? handleAIVideo : handleContinue}
            disabled={fetchingMedia || generatingAI}
            style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 15, cursor: (fetchingMedia || generatingAI) ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
              background: isVoiceMode ? '#22c55e' : formData?.videoType === 'ai_slices' ? 'var(--accent)' : '#06b6d4',
              color: '#fff',
              opacity: (fetchingMedia || generatingAI) ? 0.7 : 1,
              boxShadow: '0 4px 14px ' + (isVoiceMode ? 'rgba(34,197,94,0.3)' : formData?.videoType === 'ai_slices' ? 'rgba(124,106,247,0.3)' : 'rgba(6,182,212,0.3)'),
            }}>
            {fetchingMedia ? '⏳ Fetching media...' :
             generatingAI ? '⏳ Generating AI scenes...' :
             isVoiceMode ? '🎙️ Render with My Voice →' :
             'Continue →'}
          </button>
        </div>
      )}
    </div>
  );
}