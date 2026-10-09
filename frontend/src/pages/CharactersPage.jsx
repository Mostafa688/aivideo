import React, { useState, useEffect, useRef } from 'react';
import { Drama, CheckCircle2, ImagePlus, Trash2, Loader2, Users, X } from 'lucide-react';
import { PageShell, Stat, Skeletons } from '../components/PageKit.jsx';

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

  const canAdd = !!file && !adding;
  return (
    <PageShell dir={dir} onBack={onBack} backLabel={isAr ? 'رجوع' : 'Back'} eyebrow={isAr ? 'مكتبة الشخصيات' : 'Character library'} Icon={Drama} accent="#ec4899"
      title={t.title} subtitle={t.sub} maxWidth={1040}
      aside={characters.length > 0 && <Stat value={characters.length} label={isAr ? 'شخصية محفوظة' : 'saved characters'} />}
      toast={toast && (
        <div role="status" style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399', fontSize: 13.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} /> {toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="close" style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'grid' }}><X size={16} /></button>
        </div>
      )}>
      <style>{`
        .ch-layout{display:grid;grid-template-columns:minmax(0,340px) minmax(0,1fr);gap:22px;align-items:start}
        .ch-drop{width:100%;aspect-ratio:4/3;border-radius:16px;cursor:pointer;padding:0;overflow:hidden;position:relative;display:grid;place-items:center;font:inherit;color:var(--text2);transition:all .15s}
        .ch-drop:hover{border-color:rgba(236,72,153,.6)!important;background:rgba(236,72,153,.06)!important}
        .ch-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid var(--border2);background:rgba(255,255,255,.04);color:var(--text);font:inherit;font-size:14px;outline:none;transition:border-color .15s}
        .ch-input:focus{border-color:rgba(236,72,153,.6)}
        .ch-add{width:100%;padding:13px;border-radius:12px;border:none;font:inherit;font-weight:700;font-size:14.5px;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s}
        .ch-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:14px}
        .ch-card{overflow:hidden;position:relative}
        .ch-card img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;transition:transform .35s}
        .ch-card:hover img{transform:scale(1.04)}
        .ch-card .ch-rm{position:absolute;top:8px;inset-inline-end:8px;width:32px;height:32px;border-radius:10px;border:1px solid rgba(248,113,113,.45);background:rgba(10,10,14,.82);color:#f87171;cursor:pointer;display:grid;place-items:center;opacity:0;transition:opacity .15s;backdrop-filter:blur(6px)}
        .ch-card:hover .ch-rm,.ch-card .ch-rm:focus-visible{opacity:1}
        @media (hover:none){.ch-card .ch-rm{opacity:1}}
        @media (max-width:820px){.ch-layout{grid-template-columns:1fr}}
      `}</style>

      <div className="ch-layout">
        <section className="pk-card" style={{ padding: 20, position: 'sticky', top: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}><ImagePlus size={16} color="#ec4899" /> {t.addTitle}</h2>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          <button type="button" className="ch-drop" onClick={() => fileInputRef.current?.click()}
            style={{ border: previewUrl ? '1px solid rgba(236,72,153,0.4)' : '1.5px dashed rgba(255,255,255,0.18)', background: previewUrl ? 'transparent' : 'rgba(255,255,255,0.03)' }}>
            {previewUrl ? (
              <>
                <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <span style={{ position: 'absolute', insetInline: 0, bottom: 0, padding: '18px 10px 8px', fontSize: 12, fontWeight: 600, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,.7))' }}>{t.changeImage}</span>
              </>
            ) : (
              <span style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: 12, textAlign: 'center', fontSize: 13 }}>
                <span style={{ width: 44, height: 44, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(236,72,153,.12)' }}><ImagePlus size={22} color="#ec4899" strokeWidth={1.8} /></span>
                {t.dropHint}
              </span>
            )}
          </button>
          <input className="ch-input" value={label} onChange={e => setLabel(e.target.value)} placeholder={t.label} style={{ margin: '14px 0 12px' }} />
          {error && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '0 0 12px' }}>{error}</p>}
          <button className="ch-add" onClick={addCharacter} disabled={!canAdd}
            style={{ cursor: canAdd ? 'pointer' : 'not-allowed', background: canAdd ? 'linear-gradient(135deg,#ec4899,#be185d)' : 'rgba(236,72,153,0.22)', boxShadow: canAdd ? '0 8px 24px rgba(236,72,153,.28)' : 'none' }}>
            {adding ? <><Loader2 size={16} className="spinning" /> {t.adding}</> : t.add}
          </button>
        </section>

        <section aria-label={t.yourCharacters}>
          <div className="pk-section-h" style={{ marginTop: 0 }}>{t.yourCharacters}</div>
          {loading ? <Skeletons n={2} h={200} /> : characters.length === 0 ? (
            <div className="pk-empty"><Users size={24} style={{ opacity: 0.5, marginBottom: 8 }} /><div>{t.noCharacters}</div></div>
          ) : (
            <div className="ch-grid">
              {characters.map(c => (
                <figure key={c.id} className="pk-card pk-hover ch-card" style={{ margin: 0 }}>
                  <img src={c.image_url} alt={c.label || 'character'} loading="lazy" />
                  <button className="ch-rm" onClick={() => removeCharacter(c.id)} aria-label={t.remove} title={t.remove}><Trash2 size={15} /></button>
                  <figcaption style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Drama size={13} color="#ec4899" style={{ flexShrink: 0 }} /> {c.label || '—'}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
