import { useState, useEffect } from 'react';

const T = {
  ar: {
    heading: 'إيه الجديد في Erivion', sub: 'بنطور المنتج باستمرار — دي آخر التحديثات والإضافات وإيه اللي جاي.',
    back: '← رجوع', loading: 'جاري التحميل...', empty: 'لسه مفيش تحديثات مضافة.',
    tags: { new: 'جديد', improved: 'تحسين', fixed: 'إصلاح', coming_soon: 'قريبًا' },
  },
  en: {
    heading: "What's New in Erivion", sub: "We're constantly improving the product — here's the latest updates and what's coming next.",
    back: '← Back', loading: 'Loading...', empty: 'No updates added yet.',
    tags: { new: 'New', improved: 'Improved', fixed: 'Fixed', coming_soon: 'Coming Soon' },
  },
};

const TAG_COLOR = {
  new: '#7c3aed',
  improved: '#3b82f6',
  fixed: '#22c55e',
  coming_soon: '#f59e0b',
};

function fmtDate(dateStr, isAr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

export default function ChangelogPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const language = isAr ? 'ar' : 'en';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[language];

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/changelog?language=${language}`);
        const d = await r.json();
        if (alive) setEntries(d.entries || []);
      } catch (e) { console.error(e); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [language]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.back}
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📰</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heading}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>
            {t.sub}
          </p>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.loading}</div>}
        {!loading && entries.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.empty}</div>
        )}

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {entries.length > 0 && (
            <div style={{ position: 'absolute', top: 8, bottom: 8, [isAr ? 'right' : 'left']: 5, width: 2, background: 'rgba(255,255,255,0.08)' }} />
          )}
          {entries.map(e => {
            const color = TAG_COLOR[e.tag] || TAG_COLOR.new;
            return (
              <div key={e.id} style={{ position: 'relative', [isAr ? 'paddingRight' : 'paddingLeft']: 28 }}>
                <div style={{ position: 'absolute', top: 5, [isAr ? 'right' : 'left']: 0, width: 12, height: 12, borderRadius: '50%', background: color, boxShadow: `0 0 0 4px ${color}22` }} />
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>{fmtDate(e.date, isAr)}</div>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}1a`, border: `1px solid ${color}4d`, borderRadius: 999, padding: '3px 10px' }}>
                      {t.tags[e.tag] || t.tags.new}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{e.title}</span>
                  </div>
                  {e.description && <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13.5, margin: 0, lineHeight: 1.7 }}>{e.description}</p>}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
