import { useState, useEffect } from 'react';
import { Activity, CheckCircle2, AlertTriangle, XOctagon, RefreshCw, Server } from 'lucide-react';
import { PageShell, Pill, Skeletons, Empty } from '../components/PageKit.jsx';

const T = {
  ar: {
    eyebrow: 'حالة النظام', heading: 'حالة نظام Erivion', sub: 'حالة حية للخدمات الأساسية، وأي بلاغات عن مشاكل معروفة. بتتحدث تلقائيًا كل دقيقة.',
    back: 'رجوع',
    overall: { operational: 'كل الأنظمة شغالة', degraded: 'أداء أبطأ من المعتاد', outage: 'فيه عطل حاليًا' },
    overallSub: { operational: 'مفيش أي مشاكل معروفة دلوقتي.', degraded: 'بعض الخدمات أبطأ من المعتاد — بنتابعها.', outage: 'بعض الخدمات متعطلة حاليًا، وبنشتغل على حلها.' },
    component: { operational: 'شغال', degraded: 'أبطأ', outage: 'متعطل' },
    services: 'الخدمات', incidents: 'البلاغات الأخيرة', noIncidents: 'مفيش أي بلاغات — كل حاجة شغالة عادي.',
    resolved: 'اتحل', ongoing: 'مستمر', checked: 'آخر فحص', refresh: 'تحديث', failed: 'مقدرناش نجيب الحالة دلوقتي — جرّب تاني بعد شوية.',
  },
  en: {
    eyebrow: 'System status', heading: 'Erivion System Status', sub: 'Live status of the core services and any known issues. Refreshes automatically every minute.',
    back: 'Back',
    overall: { operational: 'All systems operational', degraded: 'Degraded performance', outage: 'Active outage' },
    overallSub: { operational: 'No known issues right now.', degraded: 'Some services are slower than usual — we are monitoring.', outage: 'Some services are down and we are working on it.' },
    component: { operational: 'Operational', degraded: 'Degraded', outage: 'Down' },
    services: 'Services', incidents: 'Recent incidents', noIncidents: 'No incidents reported — everything is running normally.',
    resolved: 'Resolved', ongoing: 'Ongoing', checked: 'Last checked', refresh: 'Refresh', failed: "We couldn't load the status right now — please try again shortly.",
  },
};

const STATUS = {
  operational: { color: '#34d399', Icon: CheckCircle2 },
  degraded: { color: '#fbbf24', Icon: AlertTriangle },
  outage: { color: '#f87171', Icon: XOctagon },
};
const SEVERITY_COLOR = { info: '#60a5fa', degraded: '#fbbf24', outage: '#f87171' };

function fmtDateTime(s, isAr) {
  if (!s) return '';
  try { return new Date(s).toLocaleString(isAr ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return s; }
}

export default function StatusPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const language = isAr ? 'ar' : 'en';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[language];

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [checkedAt, setCheckedAt] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await (await fetch(`/api/system-status?language=${language}`)).json();
        if (alive) { setData(d); setFailed(false); setCheckedAt(new Date()); }
      } catch (e) { console.error(e); if (alive) setFailed(true); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [language, tick]);
  useEffect(() => { const id = setInterval(() => setTick(x => x + 1), 60000); return () => clearInterval(id); }, []);

  const st = STATUS[data?.overall] || STATUS.operational;
  const comps = data?.components || [];

  return (
    <PageShell dir={dir} onBack={onBack} backLabel={t.back} eyebrow={t.eyebrow} Icon={Activity} accent={data ? st.color : '#34d399'} title={t.heading} subtitle={t.sub} maxWidth={860}
      aside={<button className="pk-chip" onClick={() => setTick(x => x + 1)}><RefreshCw size={13} /> {t.refresh}</button>}>
      {loading && <Skeletons n={4} h={72} />}
      {failed && !data && <Empty>{t.failed}</Empty>}

      {data && (
        <>
          <div className="pk-card" style={{ padding: '24px 26px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', borderColor: `${st.color}59`, background: `linear-gradient(135deg, ${st.color}1f, ${st.color}08)` }}>
            <span className={data.overall === 'operational' ? 'pk-dot-live' : ''} style={{ width: 52, height: 52, borderRadius: 16, display: 'grid', placeItems: 'center', background: `${st.color}26`, border: `1px solid ${st.color}66`, flexShrink: 0 }}>
              <st.Icon size={26} color={st.color} strokeWidth={2.2} />
            </span>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: st.color, lineHeight: 1.3 }}>{t.overall[data.overall] || t.overall.operational}</div>
              <div style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{t.overallSub[data.overall] || t.overallSub.operational}</div>
            </div>
            {checkedAt && <div style={{ fontSize: 12, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{t.checked}: {checkedAt.toLocaleTimeString(isAr ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</div>}
          </div>

          <div className="pk-section-h">{t.services}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
            {comps.map((c, i) => {
              const s = STATUS[c.status] || STATUS.operational;
              return (
                <div key={i} className="pk-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${s.color}1f`, flexShrink: 0 }}><Server size={17} color={s.color} /></span>
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14.5, lineHeight: 1.4 }}>{c.label}</span>
                  <Pill color={s.color} dot>{t.component[c.status] || t.component.operational}</Pill>
                </div>
              );
            })}
          </div>

          <div className="pk-section-h">{t.incidents}</div>
          {(data.incidents || []).length === 0 && <Empty Icon={CheckCircle2}>{t.noIncidents}</Empty>}
          <div style={{ display: 'grid', gap: 12 }}>
            {(data.incidents || []).map(inc => {
              const color = SEVERITY_COLOR[inc.severity] || SEVERITY_COLOR.degraded;
              return (
                <article key={inc.id} className="pk-card" style={{ padding: '16px 20px', borderInlineStart: `3px solid ${color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
                    <Pill color={inc.resolved ? '#34d399' : color} dot>{inc.resolved ? t.resolved : t.ongoing}</Pill>
                    <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700 }}>{inc.title}</h3>
                  </div>
                  {inc.description && <p style={{ color: 'var(--text2)', fontSize: 13.8, margin: '0 0 8px', lineHeight: 1.8 }}>{inc.description}</p>}
                  <div style={{ fontSize: 12, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtDateTime(inc.createdAt, isAr)}{inc.resolved && inc.resolvedAt ? ` → ${fmtDateTime(inc.resolvedAt, isAr)}` : ''}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}
