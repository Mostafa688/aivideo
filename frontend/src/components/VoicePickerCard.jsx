// ── VoicePickerCard ── كارت اختيار صوت الذكاء الاصطناعي في الشات: صورة المتكلم + اسمه + طابع صوته + عينة تسمعها + اختيار
import React, { useRef, useState } from 'react';
import { Play, Pause, Check, Loader2 } from 'lucide-react';

/** صورة متكلم مرسومة (راس + كتاف) بلون الصوت — نفس الشكل للراجل والست مع فرق الشعر */
function SpeakerAvatar({ color, gender, size = 46 }) {
  const female = gender === 'female';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="24" fill={color} />
      <circle cx="24" cy="24" r="22.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
      {female && <path d="M13 27c0-11 4-16 11-16s11 5 11 16c0 4-2 7-2 7H15s-2-3-2-7z" fill="rgba(0,0,0,0.28)" />}
      <circle cx="24" cy="20" r="8" fill="#fde7d4" />
      {!female && <path d="M16 18c0-6 4-8 8-8s8 2 8 8c-2-3-5-4-8-4s-6 1-8 4z" fill="rgba(0,0,0,0.35)" />}
      <path d="M9 44c1-8 7-13 15-13s14 5 15 13" fill="#fde7d4" />
      <path d="M9 44c1-8 7-13 15-13s14 5 15 13" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}

export default function VoicePickerCard({ voices = [], lang = 'ar', picked = null, onPick }) {
  const ar = lang === 'ar';
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(null);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const toggle = (key) => {
    setError('');
    const a = audioRef.current; if (!a) return;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.pause(); setLoading(key);
    a.src = `/api/agent/voice-preview/${encodeURIComponent(key)}?lang=${ar ? 'ar' : 'en'}&v=3`;
    a.play().then(() => { setPlaying(key); setLoading(null); }).catch(() => { setLoading(null); setError(ar ? 'العينة مش متاحة دلوقتي — جرّب تاني بعد شوية.' : 'Preview unavailable right now — try again shortly.'); });
  };

  return (
    <div dir={ar ? 'rtl' : 'ltr'} style={{ background: 'linear-gradient(180deg, rgba(124,106,247,0.10), rgba(255,255,255,0.02))', border: '1px solid rgba(124,106,247,0.28)', borderRadius: 16, padding: 14, maxWidth: 560 }}>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} style={{ display: 'none' }} />
      <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{ar ? 'اختار صوت الراوي' : 'Choose the narrator voice'}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 12 }}>{ar ? 'اسمع العينة ▶ وبعدين اختار الصوت اللي يناسب الفيديو' : 'Play a sample ▶ then pick the voice that fits your video'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
        {voices.map(v => {
          const meta = (ar ? v.ar : v.en) || v.en || {};
          const sel = picked === v.key, busy = loading === v.key, on = playing === v.key;
          return (
            <div key={v.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: sel ? 'rgba(124,106,247,0.22)' : 'rgba(255,255,255,0.04)', border: `1px solid ${sel ? 'rgba(124,106,247,0.6)' : 'rgba(255,255,255,0.08)'}` }}>
              <SpeakerAvatar color={v.color} gender={v.gender} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>{meta.name} <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap' }}>· {v.gender === 'female' ? (ar ? 'صوت ست' : 'female') : (ar ? 'صوت راجل' : 'male')}</span></div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{meta.tone}</div>
              </div>
              <button onClick={() => toggle(v.key)} title={ar ? 'اسمع عينة' : 'Play sample'} aria-label={ar ? 'اسمع عينة' : 'Play sample'}
                style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', background: on ? '#fff' : 'rgba(255,255,255,0.08)', color: on ? '#111' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                {busy ? <Loader2 size={14} className="spin" /> : on ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button disabled={!!picked} onClick={() => onPick?.(v, meta)}
                style={{ padding: '7px 12px', borderRadius: 10, border: 'none', background: sel ? 'var(--accent2, #a99bff)' : 'linear-gradient(135deg,#7c6af7,#9d4edd)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: picked ? 'default' : 'pointer', opacity: picked && !sel ? 0.35 : 1, flexShrink: 0 }}>
                {sel ? <Check size={14} /> : (ar ? 'اختار' : 'Pick')}
              </button>
            </div>
          );
        })}
      </div>
      {error && <div style={{ marginTop: 8, fontSize: 12, color: '#fca5a5' }}>{error}</div>}
    </div>
  );
}
