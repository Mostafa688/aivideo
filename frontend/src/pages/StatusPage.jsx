import { useState, useEffect } from 'react';

const T = {
  ar: {
    heading: 'حالة نظام Erivion', sub: 'حالة حية للخدمات الأساسية، وأي بلاغات عن مشاكل معروفة.',
    back: '← رجوع', loading: 'جاري التحميل...',
    overall: { operational: 'كل الأنظمة شغالة', degraded: 'أداء أبطأ من المعتاد', outage: 'فيه عطل حاليًا' },
    component: { operational: 'شغال', degraded: 'أبطأ', outage: 'متعطل' },
    noIncidents: 'مفيش أي بلاغات — كل حاجة شغالة عادي.',
    resolved: 'اتحل', ongoing: 'مستمر',
  },
  en: {
    heading: 'Erivion System Status', sub: 'Live status of core services, and any known issues.',
    back: '← Back', loading: 'Loading...',
    overall: { operational: 'All systems operational', degraded: 'Degraded performance', outage: 'Active outage' },
    component: { operational: 'Operational', degraded: 'Degraded', outage: 'Down' },
    noIncidents: 'No incidents reported — everything is running normally.',
    resolved: 'Resolved', ongoing: 'Ongoing',
  },
};

const STATUS_COLOR = { operational: '#22c55e', degraded: '#f59e0b', outage: '#ef4444' };
const SEVERITY_COLOR = { info: '#3b82f6', degraded: '#f59e0b', outage: '#ef4444' };

function fmtDateTime(s, isAr) {
  if (!s) return '';
  try { return new Date(s).toLocaleString(isAr ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return s; }
}

export default function StatusPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const language = isAr ? 'ar' : 'en';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[language];

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/system-status?language=${language}`);
        const d = await r.json();
        if (alive) setData(d);
      } catch (e) { console.error(e); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [language]);

  const overallColor = data ? STATUS_COLOR[data.overall] : '#6b7280';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.back}
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📡</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heading}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>
            {t.sub}
          </p>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.loading}</div>}

        {data && (
          <>
            <div style={{ background: `${overallColor}14`, border: `1px solid ${overallColor}55`, borderRadius: 16, padding: '18px 22px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: overallColor, boxShadow: `0 0 12px ${overallColor}` }} />
              <span style={{ fontWeight: 800, fontSize: 16, color: overallColor }}>{t.overall[data.overall]}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 36 }}>
              {(data.components || []).map((c, i) => {
                const color = STATUS_COLOR[c.status];
                return (
                  <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.label}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                      {t.component[c.status]}
                    </span>
                  </div>
                );
              })}
            </div>

            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'rgba(255,255,255,0.7)' }}>
              {language === 'ar' ? 'البلاغات الأخيرة' : 'Recent Incidents'}
            </h2>
            {(data.incidents || []).length === 0 && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0', fontSize: 13.5 }}>{t.noIncidents}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(data.incidents || []).map(inc => {
                const color = SEVERITY_COLOR[inc.severity] || SEVERITY_COLOR.degraded;
                return (
                  <div key={inc.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}1a`, border: `1px solid ${color}4d`, borderRadius: 999, padding: '3px 10px' }}>
                        {inc.resolved ? t.resolved : t.ongoing}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 14.5 }}>{inc.title}</span>
                    </div>
                    {inc.description && <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 6px', lineHeight: 1.7 }}>{inc.description}</p>}
                    <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.3)' }}>
                      {fmtDateTime(inc.createdAt, isAr)}{inc.resolved && inc.resolvedAt ? ` — ${fmtDateTime(inc.resolvedAt, isAr)}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
