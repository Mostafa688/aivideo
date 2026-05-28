import React, { useState, useRef } from 'react';

const SUPPORTED_FORMATS = ['mp3', 'mp4', 'm4a', 'wav', 'webm', 'ogg', 'flac'];
const MAX_SIZE_MB = 25;

/**
 * VoiceUpload Component
 * Props:
 * - onTranscribed(text, audioUrl): called when done
 * - accentColor, accentBg, videoLanguage
 */
export default function VoiceUpload({
  onTranscribed,
  accentColor = '#7c6af7',
  accentBg = 'rgba(124,106,247,0.1)',
  videoLanguage = 'en',
}) {
  const [file, setFile]                   = useState(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [loading, setLoading]             = useState(false);
  const [progress, setProgress]           = useState('');
  const [error, setError]                 = useState('');
  const inputRef                          = useRef(null);

  function validateFile(f) {
    if (!f) return 'No file selected';
    const ext = f.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_FORMATS.includes(ext)) return `Unsupported format. Use: ${SUPPORTED_FORMATS.join(', ')}`;
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return `File too large. Max size is ${MAX_SIZE_MB}MB.`;
    return null;
  }

  function handleFileSelect(f) {
    setError('');
    const err = validateFile(f);
    if (err) { setError(err); return; }
    setFile(f);
  }

  function onDrop(e) {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  async function handleTranscribe() {
    if (!file) { setError('Please select an audio file first'); return; }
    setLoading(true); setError(''); setProgress('Uploading audio...');
    try {
      const formData = new FormData();
      formData.append('audio', file);
      if (videoLanguage && videoLanguage !== 'auto') formData.append('language', videoLanguage);

      setProgress('Transcribing with Groq Whisper AI...');

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transcription failed');

      setProgress('Done! Generating scenes...');

      // ✅ بعد الـ transcription مباشرة نبعت النص والـ audioUrl للـ parent
      // الـ parent هيعمل submit تلقائي بدون ما المستخدم يضغط حاجة
      onTranscribed(data.text, data.audioUrl);

    } catch (e) {
      setError(e.message); setProgress('');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null); setError(''); setProgress('');
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div style={{ width: '100%' }}>
      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => !loading && inputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? accentColor : file ? accentColor : 'var(--border)'}`,
          borderRadius: 14, padding: '28px 20px', textAlign: 'center',
          cursor: loading ? 'default' : 'pointer',
          background: isDragging || file ? accentBg : 'var(--bg3)',
          transition: 'all 0.2s', marginBottom: 14,
        }}
      >
        <input ref={inputRef} type="file" accept=".mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac"
          style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files[0])} />
        {file ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎙️</div>
            <p style={{ fontSize: 14, fontWeight: 700, color: accentColor, margin: 0 }}>{file.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 0' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            {!loading && (
              <button onClick={e => { e.stopPropagation(); handleReset(); }}
                style={{ marginTop: 8, fontSize: 11, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                × Remove
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🎤</div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 }}>Drop your audio here or click to browse</p>
            <p style={{ fontSize: 11, color: 'var(--text3)', margin: '6px 0 0' }}>MP3, MP4, M4A, WAV, WebM, OGG, FLAC · Max {MAX_SIZE_MB}MB</p>
          </>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', fontSize: 12, color: '#86efac', marginBottom: 14, lineHeight: 1.6 }}>
        💡 Your voice recording will be used as the video's audio. AI will generate matching scenes automatically.
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: accentBg, border: `1px solid ${accentColor}44`, fontSize: 13, color: accentColor, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display:'inline-block', width:14, height:14, border:`2px solid ${accentColor}44`, borderTop:`2px solid ${accentColor}`, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          {progress || 'Processing...'}
        </div>
      )}

      <button onClick={handleTranscribe} disabled={!file || loading} style={{
        width: '100%', padding: '13px', borderRadius: 12, border: 'none',
        background: !file || loading ? 'var(--bg3)' : `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`,
        color: !file || loading ? 'var(--text3)' : '#fff',
        fontWeight: 700, fontSize: 14, cursor: !file || loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
      }}>
        {loading ? `⏳ ${progress || 'Processing...'}` : '🎙️ Transcribe & Generate Scenes →'}
      </button>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}