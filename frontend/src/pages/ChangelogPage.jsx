import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Wrench, Bug, Hourglass, Layers } from 'lucide-react';
import { PageShell, Stat, Pill, Skeletons, Empty } from '../components/PageKit.jsx';

const T = {
  ar: {
    eyebrow: 'سجل التحديثات', heading: 'إيه الجديد في Erivion', sub: 'بنطوّر المنتج كل أسبوع تقريبًا — هنا كل ميزة جديدة وتحسين وإصلاح، بالتاريخ.',
    back: 'رجوع', empty: 'لسه مفيش تحديثات مضافة.', emptyFilter: 'مفيش تحديثات من النوع ده.', all: 'الكل', latest: 'الأحدث',
    updates: 'تحديث', lastUpdate: 'آخر تحديث',
    tags: { new: 'جديد', improved: 'تحسين', fixed: 'إصلاح', coming_soon: 'قريبًا' },
  },
  en: {
    eyebrow: 'Changelog', heading: "What's New in Erivion", sub: 'We ship roughly every week — every new feature, improvement and fix, dated.',
    back: 'Back', empty: 'No updates added yet.', emptyFilter: 'No updates of this type.', all: 'All', latest: 'Latest',
    updates: 'updates', lastUpdate: 'Last update',
    tags: { new: 'New', improved: 'Improved', fixed: 'Fixed', coming_soon: 'Coming soon' },
  },
};

const TAG = {
  new: { color: '#a78bfa', Icon: Sparkles },
  improved: { color: '#60a5fa', Icon: Wrench },
  fixed: { color: '#34d399', Icon: Bug },
  coming_soon: { color: '#fbbf24', Icon: Hourglass },
};

const parseDate = (s) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? null : d; };

export default function ChangelogPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const language = isAr ? 'ar' : 'en';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[language];
  const locale = isAr ? 'ar-EG' : 'en-US';

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const d = await (await fetch(`/api/changelog?language=${language}`)).json();
        if (alive) setEntries(d.entries || []);
      } catch (e) { console.error(e); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [language]);

  const counts = useMemo(() => entries.reduce((a, e) => ({ ...a, [e.tag]: (a[e.tag] || 0) + 1 }), {}), [entries]);
  const visible = filter === 'all' ? entries : entries.filter(e => e.tag === filter);
  const groups = useMemo(() => {
    const out = [];
    for (const e of visible) {
      const d = parseDate(e.date);
      const key = d ? `${d.getFullYear()}-${d.getMonth()}` : 'x';
      const label = d ? d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : '';
      let g = out[out.length - 1];
      if (!g || g.key !== key) { g = { key, label, items: [] }; out.push(g); }
      g.items.push(e);
    }
    return out;
  }, [visible, locale]);
  const newest = entries[0];
  const newestId = newest?.id;
  const lastDate = parseDate(newest?.date);

  return (
    <PageShell dir={dir} onBack={onBack} backLabel={t.back} eyebrow={t.eyebrow} Icon={Layers} accent="#a78bfa" title={t.heading} subtitle={t.sub} maxWidth={920}
      aside={entries.length > 0 && <>
        <Stat value={entries.length} label={t.updates} />
        {lastDate && <Stat value={lastDate.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} label={t.lastUpdate} />}
      </>}>
      <style>{`
        .cl-row{display:grid;grid-template-columns:120px 1fr;gap:20px;position:relative}
        .cl-date{padding-top:18px;font-size:12.5px;color:var(--text2);font-variant-numeric:tabular-nums;text-align:end}
        .cl-date b{display:block;font-family:var(--font-display);font-size:24px;line-height:1;color:var(--text);margin-bottom:4px}
        .cl-rail{position:absolute;top:0;bottom:-14px;width:2px;background:var(--border2);inset-inline-start:140px}
        .cl-node{position:absolute;top:22px;inset-inline-start:134px;width:14px;height:14px;border-radius:50%;border:3px solid var(--bg);z-index:1}
        .cl-card{margin-inline-start:34px;padding:18px 22px}
        @media (max-width:640px){.cl-row{grid-template-columns:1fr;gap:0}.cl-date{text-align:start;padding:0 0 8px 0;display:flex;gap:8px;align-items:baseline}.cl-date b{font-size:18px;margin:0}.cl-rail,.cl-node{display:none}.cl-card{margin-inline-start:0}}
      `}</style>

      {entries.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <button className="pk-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t.all} <small>{entries.length}</small></button>
          {Object.keys(TAG).filter(k => counts[k]).map(k => {
            const { Icon, color } = TAG[k];
            return <button key={k} className="pk-chip" aria-pressed={filter === k} onClick={() => setFilter(k)}><Icon size={13} color={color} /> {t.tags[k]} <small>{counts[k]}</small></button>;
          })}
        </div>
      )}

      {loading && <div style={{ marginTop: 20 }}><Skeletons n={4} h={110} /></div>}
      {!loading && entries.length === 0 && <Empty Icon={Layers}>{t.empty}</Empty>}
      {!loading && entries.length > 0 && visible.length === 0 && <Empty>{t.emptyFilter}</Empty>}

      {groups.map(g => (
        <section key={g.key}>
          {g.label && <div className="pk-section-h">{g.label}</div>}
          <div style={{ display: 'grid', gap: 14 }}>
            {g.items.map(e => {
              const tag = TAG[e.tag] || TAG.new;
              const d = parseDate(e.date);
              const isNewest = e.id === newestId && filter === 'all';
              return (
                <article key={e.id} className="cl-row">
                  <div className="cl-date">
                    {d ? <><b>{d.getDate()}</b><span>{d.toLocaleDateString(locale, { month: 'short' })}</span></> : null}
                  </div>
                  <span className="cl-rail" /><span className="cl-node" style={{ background: tag.color, boxShadow: `0 0 0 4px ${tag.color}26` }} />
                  <div className="pk-card pk-hover cl-card" style={isNewest ? { borderColor: `${tag.color}66`, boxShadow: `0 0 0 1px ${tag.color}22, 0 12px 40px ${tag.color}14` } : undefined}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                      <Pill color={tag.color}><tag.Icon size={12} strokeWidth={2.4} /> {t.tags[e.tag] || t.tags.new}</Pill>
                      {isNewest && <Pill color="#34d399" dot>{t.latest}</Pill>}
                    </div>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.5, textWrap: 'balance' }}>{e.title}</h3>
                    {e.description && <p style={{ color: 'var(--text2)', fontSize: 14, margin: '8px 0 0', lineHeight: 1.85, whiteSpace: 'pre-line' }}>{e.description}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
