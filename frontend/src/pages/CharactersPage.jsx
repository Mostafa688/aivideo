import React, { useState, useEffect, useRef } from 'react';

function authHeaders() {
  return { Authorization: 'Bearer ' + localStorage.getItem('token') };
}

const T = {
  ar: {
    title: 'شخصياتي',
    sub: 'ارفع صورة مرجعية لأي شخصية بتستخدمها في فيديوهات القصص/المغامرات (زي "لو عشت في زمن سيدنا نوح")، وهنستخدمها كمرجع عشان تفضل نفس الشخصية في كل مشاهد الفيديو.',
    addTitle: 'إضافة شخصية جديدة', label: 'اسم الشخصية (اختياري)', chooseImage: 'اختار صورة',
    add: 'إضافة الشخصية', adding: 'جاري الرفع...', yourCharacters: 'شخصياتك المحفوظة',
    noCharacters: 'لسه معملتش أي شخصية.', remove: 'حذف', addedToast: '✅ الشخصية اتضافت.',
  },
  en: {
    title: 'My Characters',
    sub: 'Upload a reference image for any character you use in story/adventure videos (like "what if you lived during Prophet Noah\'s time"), and it\'ll be used as a reference to keep the same character consistent across every scene.',
    addTitle: 'Add a new character', label: 'Character name (optional)', chooseImage: 'Choose image',
    add: 'Add character', adding: 'Uploading...', yourCharacters: 'Your saved characters',
    noCharacters: "You haven't added a character yet.", remove: 'Remove', addedToast: '✅ Character added.',
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
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  const load = () => {
    setLoading(true);
    fetch('/api/characters', { headers: authHeaders() }).then(r => r.json()).then(d => setCharacters(d.characters || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

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
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24 }}>
            {isAr ? '← رجوع' : '← Back'}
          </button>
        )}

        {toast && (
          <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span>{toast.text}</span>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎭</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t.title}</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 8, fontSize: 13.5, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>{t.sub}</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{t.addTitle}</div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t.label}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, marginBottom: 10, boxSizing: 'border-box' }} />
          <input ref={fileInputRef} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }} />

          {error && <p style={{ color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
          <button onClick={addCharacter} disabled={adding || !file}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: (adding || !file) ? 'rgba(124,106,247,0.3)' : '#7c6af7', color: '#fff', fontWeight: 700, fontSize: 14, cursor: (adding || !file) ? 'not-allowed' : 'pointer' }}>
            {adding ? t.adding : t.add}
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>{t.yourCharacters}</div>
        {loading ? null : characters.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>{t.noCharacters}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
            {characters.map(c => (
              <div key={c.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
                <img src={c.image_url} alt={c.label || 'character'} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>{c.label || '—'}</div>
                  <button onClick={() => removeCharacter(c.id)} style={{ width: '100%', padding: '5px 0', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>
                    {t.remove}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
