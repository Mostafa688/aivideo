import React, { useState, useEffect, useRef } from 'react';
import { Drama, ArrowLeft, CheckCircle2, ImagePlus, Trash2, Loader2, Users } from 'lucide-react';

function authHeaders() {
  return { Authorization: 'Bearer ' + localStorage.getItem('token') };
}

const T = {
  ar: {
    title: 'شخصياتي',
    sub: 'ارفع صورة مرجعية لأي شخصية بتستخدمها في فيديوهات القصص/المغامرات (زي "لو عشت في زمن سيدنا نوح")، وهنستخدمها كمرجع عشان تفضل نفس الشخصية في كل مشاهد الفيديو.',
    addTitle: 'إضافة شخصية جديدة', label: 'اسم الشخصية (اختياري)', chooseImage: 'اختار صورة', dropHint: 'اضغط لاختيار صورة مرجعية',
    changeImage: 'تغيير الصورة',
    add: 'إضافة الشخصية', adding: 'جاري الرفع...', yourCharacters: 'شخصياتك المحفوظة',
    noCharacters: 'لسه معملتش أي شخصية.', remove: 'حذف', addedToast: 'الشخصية اتضافت.',
  },
  en: {
    title: 'My Characters',
    sub: 'Upload a reference image for any character you use in story/adventure videos (like "what if you lived during Prophet Noah\'s time"), and it\'ll be used as a reference to keep the same character consistent across every scene.',
    addTitle: 'Add a new character', label: 'Character name (optional)', chooseImage: 'Choose image', dropHint: 'Click to choose a reference image',
    changeImage: 'Change image',
    add: 'Add character', adding: 'Uploading...', yourCharacters: 'Your saved characters',
    noCharacters: "You haven't added a character yet.", remove: 'Remove', addedToast: 'Character added.',
  },
};

export default function CharactersPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const t = T[isAr ? 'ar' : 'en'];
  const dir = isAr ? 'rtl' : 'ltr';

  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    fetch('/api/characters', { headers: authHeaders() }).then(r => r.json()).then(d => setCharacters(d.characters || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const addCharacter = async () => {
    if (!file) return;
    setAdding(true); setError('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      if (label.trim()) formData.append('label', label.trim());
      const res = await fetch('/api/characters', { method: 'POST', headers: authHeaders(), body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLabel(''); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setToast({ type: 'success', text: t.addedToast });
      load();
    } catch (e) { setError(e.message); } finally { setAdding(false); }
  };

  const removeCharacter = async (id) => {
    await fetch(`/api/characters/${id}`, { method: 'DELETE', headers: authHeaders() });
    load();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: '#fff', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {onBack && (
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24 }}>
            <ArrowLeft size={13} style={{ transform: isAr ? 'scaleX(-1)' : 'none' }} /> {isAr ? 'رجوع' : 'Back'}
          </button>
        )}

        {toast && (
          <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={15} /> {toast.text}</span>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 16px', background: 'linear-gradient(135deg,rgba(236,72,153,0.18),rgba(236,72,153,0.05))', border: '1px solid rgba(236,72,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Drama size={26} color="#ec4899" strokeWidth={1.75} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#f0abfc,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t.title}</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 8, fontSize: 13.5, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>{t.sub}</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Drama size={15} color="#ec4899" /> {t.addTitle}
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{
                width: 96, height: 96, borderRadius: 14, flexShrink: 0, cursor: 'pointer', padding: 0, overflow: 'hidden',
                border: previewUrl ? '1px solid rgba(236,72,153,0.35)' : '1.5px dashed rgba(255,255,255,0.15)',
                background: previewUrl ? 'transparent' : 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              }}>
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                    <span style={{ fontSize: 10, color: '#fff', fontWeight: 600, textAlign: 'center', padding: '0 6px' }}>{t.changeImage}</span>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.35)' }}>
                  <ImagePlus size={22} strokeWidth={1.75} />
                </div>
              )}
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t.label}
                style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, marginBottom: 8, boxSizing: 'border-box' }} />
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.6 }}>{t.dropHint}</p>
            </div>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
          <button onClick={addCharacter} disabled={adding || !file}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: (adding || !file) ? 'rgba(236,72,153,0.25)' : 'linear-gradient(135deg,#ec4899,#be185d)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: (adding || !file) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {adding ? <><Loader2 size={15} className="spinning" /> {t.adding}</> : t.add}
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>{t.yourCharacters}</div>
        {loading ? null : characters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <Users size={22} color="rgba(255,255,255,0.25)" style={{ marginBottom: 8 }} />
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>{t.noCharacters}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {characters.map(c => (
              <div key={c.id} className="char-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden', position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <img src={c.image_url} alt={c.label || 'character'} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                  <button onClick={() => removeCharacter(c.id)} className="char-card-remove"
                    style={{ position: 'absolute', top: 6, [isAr ? 'left' : 'right']: 6, width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(17,17,20,0.85)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Drama size={11} color="#ec4899" /> {c.label || '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <style>{`.char-card:hover .char-card-remove { opacity: 1 !important; }`}</style>
      </div>
    </div>
  );
}
