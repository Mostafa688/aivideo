import { useState, useEffect } from 'react';

const T = {
  ar: {
    heading: 'نشاطك على Erivion', sub: 'إحصائيات حقيقية لاستخدامك — الشهر ده وعلى مدار الوقت.',
    back: '← رجوع', loading: 'جاري التحميل...',
    thisMonth: 'الشهر ده', allTime: 'إجمالي كل الوقت',
    generations: 'عملية توليد', creditsSpent: 'كريديت مصروف',
    byKind: 'حسب النوع', topModels: 'أكتر المحركات استخدامًا', activity: 'النشاط في آخر 14 يوم',
    kinds: { image: 'صور', video: 'فيديو', edit: 'تعديل', merge: 'دمج', analyze: 'تحليل' },
    empty: 'لسه معملتش أي حاجة على النظام الجديد — أول توليد ليك هيبان هنا.',
    note: 'الإحصائيات دي بتبدأ من لحظة إطلاق الصفحة دي، مش بيانات تاريخية قبل كده.',
  },
  en: {
    heading: 'Your Activity on Erivion', sub: 'Real usage stats — this month and all-time.',
    back: '← Back', loading: 'Loading...',
    thisMonth: 'This Month', allTime: 'All-Time Total',
    generations: 'generations', creditsSpent: 'credits spent',
    byKind: 'By Type', topModels: 'Top Engines Used', activity: 'Activity — Last 14 Days',
    kinds: { image: 'Images', video: 'Video', edit: 'Edits', merge: 'Merges', analyze: 'Analysis' },
    empty: "You haven't generated anything on the new system yet — your first generation will show up here.",
    note: 'These stats start from when this page launched, not historical data before that.',
  },
};

export default function StatsPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[isAr ? 'ar' : 'en'];

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const r = await fetch('/api/stats/me', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
        const d = await r.json();
        if (alive) setData(d);
      } catch (e) { console.error(e); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const hasAny = data && (data.allTime?.count > 0);
  const maxDaily = data ? Math.max(1, ...(data.last14Days || []).map(d => d.count)) : 1;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.back}
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heading}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>
            {t.sub}
          </p>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.loading}</div>}

        {data && !hasAny && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '30px 0', fontSize: 14 }}>{t.empty}</div>
        )}

        {data && hasAny && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
              {[[t.thisMonth, data.thisMonth], [t.allTime, data.allTime]].map(([label, stat], i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 20px' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{stat.count}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{t.generations}</div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: '#a78bfa', fontVariantNumeric: 'tabular-nums' }}>{stat.credits} <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>{t.creditsSpent}</span></div>
                </div>
              ))}
            </div>

            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>{t.activity}</h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70, marginBottom: 28, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '10px 12px' }}>
              {(data.last14Days || []).length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, alignSelf: 'center' }}>—</div>}
              {(data.last14Days || []).map((d, i) => (
                <div key={i} title={`${d.day}: ${d.count}`} style={{ flex: 1, height: `${Math.max(6, (d.count / maxDaily) * 100)}%`, background: 'linear-gradient(180deg,#a78bfa,#7c3aed)', borderRadius: 3 }} />
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }} className="admin-grid-2">
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>{t.byKind}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(data.byKind || []).map(k => (
                    <div key={k.kind} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 14px', fontSize: 13 }}>
                      <span>{t.kinds[k.kind] || k.kind}</span>
                      <span style={{ fontWeight: 700, color: '#a78bfa' }}>{k.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>{t.topModels}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(data.topModels || []).length === 0 && <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>—</div>}
                  {(data.topModels || []).map(m => (
                    <div key={m.model_key} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '8px 14px', fontSize: 13 }}>
                      <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{m.model_key}</code>
                      <span style={{ fontWeight: 700, color: '#a78bfa' }}>{m.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {data && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11.5, marginTop: 32 }}>{t.note}</p>
        )}

      </div>
    </div>
  );
}
