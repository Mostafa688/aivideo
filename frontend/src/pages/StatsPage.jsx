import { useState, useEffect, useMemo } from 'react';
import { BarChart3, Image as ImageIcon, Film, Wand2, Combine, ScanSearch, Coins, Zap, CalendarDays, Layers } from 'lucide-react';
import { PageShell, Stat, Skeletons, Empty } from '../components/PageKit.jsx';

const T = {
  ar: {
    eyebrow: 'نشاطي', heading: 'نشاطك على Erivion', sub: 'أرقام حقيقية عن استخدامك — الشهر ده وعلى مدار الوقت.',
    back: 'رجوع',
    thisMonth: 'الشهر ده', allTime: 'كل الوقت',
    generations: 'عملية توليد', creditsSpent: 'كريديت مصروف',
    byKind: 'حسب النوع', topModels: 'أكتر المحركات استخدامًا', activity: 'النشاط في آخر 14 يوم', peak: 'الأعلى',
    kinds: { image: 'صور', video: 'فيديو', edit: 'تعديل', merge: 'دمج', analyze: 'تحليل' },
    empty: 'لسه معملتش أي حاجة على النظام الجديد — أول توليد ليك هيبان هنا.',
    note: 'الإحصائيات دي بتبدأ من لحظة إطلاق الصفحة دي، مش بيانات تاريخية قبل كده.', noData: 'مفيش بيانات',
  },
  en: {
    eyebrow: 'My activity', heading: 'Your Activity on Erivion', sub: 'Real usage numbers — this month and all-time.',
    back: 'Back',
    thisMonth: 'This month', allTime: 'All time',
    generations: 'generations', creditsSpent: 'credits spent',
    byKind: 'By type', topModels: 'Top engines used', activity: 'Activity — last 14 days', peak: 'Peak',
    kinds: { image: 'Images', video: 'Video', edit: 'Edits', merge: 'Merges', analyze: 'Analysis' },
    empty: "You haven't generated anything on the new system yet — your first generation will show up here.",
    note: 'These stats start from when this page launched, not historical data before that.', noData: 'No data',
  },
};

const KIND = {
  image: { color: '#f472b6', Icon: ImageIcon },
  video: { color: '#a78bfa', Icon: Film },
  edit: { color: '#60a5fa', Icon: Wand2 },
  merge: { color: '#34d399', Icon: Combine },
  analyze: { color: '#fbbf24', Icon: ScanSearch },
};

const parseDay = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };

function BigStat({ label, count, credits, t, Icon, accent }) {
  return (
    <div className="pk-card" style={{ padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', insetInlineEnd: -18, top: -18, width: 90, height: 90, borderRadius: '50%', background: `${accent}1f`, filter: 'blur(2px)' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)', fontWeight: 600 }}><Icon size={14} color={accent} /> {label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.generations}</span>
      </div>
      <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>
        <Coins size={14} /> {credits} <span style={{ fontWeight: 500, color: 'var(--text2)', fontSize: 12.5 }}>{t.creditsSpent}</span>
      </div>
    </div>
  );
}

export default function StatsPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[isAr ? 'ar' : 'en'];
  const locale = isAr ? 'ar-EG' : 'en-US';

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const d = await (await fetch('/api/stats/me', { headers: token ? { Authorization: 'Bearer ' + token } : {} })).json();
        if (alive) setData(d);
      } catch (e) { console.error(e); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const hasAny = data && (data.allTime?.count > 0);
  const days = data?.last14Days || [];
  const maxDaily = Math.max(1, ...days.map(d => d.count));
  const kinds = data?.byKind || [];
  const kindTotal = kinds.reduce((a, k) => a + k.count, 0) || 1;
  const models = data?.topModels || [];
  const maxModel = Math.max(1, ...models.map(m => m.count));
  const peakIdx = useMemo(() => days.reduce((b, d, i) => (d.count > (days[b]?.count ?? -1) ? i : b), 0), [days]);

  return (
    <PageShell dir={dir} onBack={onBack} backLabel={t.back} eyebrow={t.eyebrow} Icon={BarChart3} accent="#a78bfa" title={t.heading} subtitle={t.sub} maxWidth={940}
      aside={hasAny && <><Stat value={data.thisMonth.count} label={t.thisMonth} /><Stat value={data.allTime.count} label={t.allTime} /></>}>
      <style>{`
        .st-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .st-bars{display:flex;align-items:flex-end;gap:6px;height:150px;padding-top:22px}
        .st-bar{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:6px;min-width:0}
        .st-bar i{display:block;width:100%;border-radius:6px 6px 3px 3px;background:linear-gradient(180deg,#c4b5fd,#7c3aed);transition:filter .15s}
        .st-bar:hover i{filter:brightness(1.25)}
        .st-bar small{font-size:10.5px;color:var(--text3);font-variant-numeric:tabular-nums}
        .st-meter{height:8px;border-radius:99px;background:rgba(255,255,255,.07);overflow:hidden}
        .st-meter i{display:block;height:100%;border-radius:99px}
        @media (max-width:720px){.st-grid2{grid-template-columns:1fr}.st-bar small:not(.keep){display:none}}
      `}</style>

      {loading && <Skeletons n={3} h={130} />}
      {data && !hasAny && <Empty Icon={BarChart3}>{t.empty}</Empty>}

      {data && hasAny && (
        <>
          <div className="st-grid2">
            <BigStat label={t.thisMonth} count={data.thisMonth.count} credits={data.thisMonth.credits} t={t} Icon={CalendarDays} accent="#a78bfa" />
            <BigStat label={t.allTime} count={data.allTime.count} credits={data.allTime.credits} t={t} Icon={Layers} accent="#60a5fa" />
          </div>

          <div className="pk-section-h">{t.activity}</div>
          <div className="pk-card" style={{ padding: '10px 20px 16px' }}>
            {days.length === 0 ? <div style={{ color: 'var(--text3)', padding: 24, textAlign: 'center' }}>{t.noData}</div> : (
              <div className="st-bars" role="img" aria-label={t.activity}>
                {days.map((d, i) => {
                  const dt = parseDay(d.day);
                  const h = d.count === 0 ? 3 : Math.max(8, (d.count / maxDaily) * 100);
                  return (
                    <div key={i} className="st-bar" title={`${dt ? dt.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : d.day}: ${d.count}`}>
                      {d.count > 0 && <small className={i === peakIdx ? 'keep' : ''} style={i === peakIdx ? { color: '#c4b5fd', fontWeight: 700 } : undefined}>{d.count}</small>}
                      <i style={{ height: `${h}%`, opacity: d.count === 0 ? 0.25 : 1 }} />
                      <small className="keep">{dt ? dt.getDate() : ''}</small>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="st-grid2" style={{ marginTop: 6 }}>
            <section>
              <div className="pk-section-h">{t.byKind}</div>
              <div className="pk-card" style={{ padding: 18, display: 'grid', gap: 16 }}>
                {kinds.map(k => {
                  const m = KIND[k.kind] || { color: '#a78bfa', Icon: Zap };
                  const pct = Math.round((k.count / kindTotal) * 100);
                  return (
                    <div key={k.kind}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, fontSize: 14 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 9, display: 'grid', placeItems: 'center', background: `${m.color}1f` }}><m.Icon size={14} color={m.color} /></span>
                        <span style={{ fontWeight: 600 }}>{t.kinds[k.kind] || k.kind}</span>
                        <span style={{ marginInlineStart: 'auto', color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}><b style={{ color: 'var(--text)' }}>{k.count}</b> · {pct}%</span>
                      </div>
                      <div className="st-meter"><i style={{ width: `${pct}%`, background: m.color }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section>
              <div className="pk-section-h">{t.topModels}</div>
              <div className="pk-card" style={{ padding: 18, display: 'grid', gap: 16 }}>
                {models.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13 }}>{t.noData}</div>}
                {models.map((m, i) => (
                  <div key={m.model_key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, fontSize: 13.5 }}>
                      <span style={{ width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,.06)', fontSize: 11.5, fontWeight: 700, color: 'var(--text2)' }}>{i + 1}</span>
                      <code style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.model_key}</code>
                      <b style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums' }}>{m.count}</b>
                    </div>
                    <div className="st-meter"><i style={{ width: `${(m.count / maxModel) * 100}%`, background: 'linear-gradient(90deg,#7c3aed,#c4b5fd)' }} /></div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {data && <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12.5, marginTop: 36 }}>{t.note}</p>}
    </PageShell>
  );
}
