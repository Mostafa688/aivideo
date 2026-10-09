import { useState, useEffect, useMemo } from 'react';
import { Map as MapIcon, ChevronUp, Hammer, CircleDashed, CheckCircle2, Lock } from 'lucide-react';
import { PageShell, Stat, Skeletons, Empty } from '../components/PageKit.jsx';

const T = {
  ar: {
    eyebrow: 'الخطة القادمة', heading: 'إيه الجاي في Erivion', sub: 'صوّت على أكتر ميزة عايز نبنيها بعد كده — الأصوات هي اللي بترتّب أولوياتنا فعلًا.',
    back: 'رجوع', empty: 'لسه مفيش عناصر مضافة.', emptyCol: 'مفيش حاجة هنا دلوقتي',
    votes: 'صوت', loginToVote: 'سجّل دخولك عشان تصوّت', loginHint: 'سجّل دخولك عشان تصوّت على الميزات',
    cols: { in_progress: 'شغالين عليه', planned: 'مخطط له', done: 'خلص' },
  },
  en: {
    eyebrow: 'Roadmap', heading: "What's Coming to Erivion", sub: 'Vote on the next feature you want built — votes genuinely decide our priorities.',
    back: 'Back', empty: 'No items added yet.', emptyCol: 'Nothing here right now',
    votes: 'votes', loginToVote: 'Log in to vote', loginHint: 'Log in to vote on features',
    cols: { in_progress: 'In progress', planned: 'Planned', done: 'Done' },
  },
};

const COLS = [
  { key: 'in_progress', color: '#60a5fa', Icon: Hammer },
  { key: 'planned', color: '#a78bfa', Icon: CircleDashed },
  { key: 'done', color: '#34d399', Icon: CheckCircle2 },
];

export default function RoadmapPage({ onBack, userRegion, isLoggedIn, onRequireLogin }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const language = isAr ? 'ar' : 'en';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[language];

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState(null);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: 'Bearer ' + token } : {};
  };

  const load = async () => {
    setLoading(true);
    try {
      const d = await (await fetch(`/api/roadmap?language=${language}`, { headers: authHeaders() })).json();
      setItems(d.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [language]);

  const handleVote = async (item) => {
    if (!isLoggedIn) { onRequireLogin?.(); return; }
    setVotingId(item.id);
    try {
      const r = await fetch(`/api/roadmap/${item.id}/vote`, { method: 'POST', headers: authHeaders() });
      const d = await r.json();
      if (r.ok) setItems(prev => prev.map(it => it.id === item.id ? { ...it, voted: d.voted, voteCount: d.voteCount } : it));
    } catch (e) { console.error(e); }
    setVotingId(null);
  };

  const byCol = useMemo(() => Object.fromEntries(COLS.map(c => [c.key, items.filter(i => (i.status || 'planned') === c.key).sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0))])), [items]);
  const totalVotes = items.reduce((a, i) => a + (i.voteCount || 0), 0);

  return (
    <PageShell dir={dir} onBack={onBack} backLabel={t.back} eyebrow={t.eyebrow} Icon={MapIcon} accent="#60a5fa" title={t.heading} subtitle={t.sub} maxWidth={1120}
      aside={items.length > 0 && <>
        <Stat value={items.length} label={isAr ? 'ميزة' : 'features'} />
        <Stat value={totalVotes} label={t.votes} />
      </>}>
      <style>{`
        .rm-board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
        .rm-col{display:grid;gap:12px;padding:12px;border-radius:20px;background:rgba(255,255,255,.02);border:1px solid var(--border)}
        .rm-col-h{display:flex;align-items:center;gap:8px;padding:6px 6px 4px;font-weight:700;font-size:13.5px}
        .rm-col-h span.n{margin-inline-start:auto;font-size:12px;color:var(--text2);font-variant-numeric:tabular-nums}
        .rm-vote{flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:48px;min-height:52px;border-radius:12px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;transition:all .15s;color:var(--text2);background:rgba(255,255,255,.04);border:1px solid var(--border2)}
        .rm-vote:hover:not(:disabled){color:#fff;border-color:var(--pk-accent-line)}
        .rm-vote[aria-pressed=true]{color:#fff;background:var(--pk-accent-bg);border-color:var(--pk-accent)}
        .rm-vote:disabled{cursor:default;opacity:.55}
        @media (max-width:900px){.rm-board{grid-template-columns:1fr}}
      `}</style>

      {!isLoggedIn && items.length > 0 && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', marginBottom: 18 }}><Lock size={14} /> {t.loginHint}</div>
      )}
      {loading && <Skeletons n={3} h={120} />}
      {!loading && items.length === 0 && <Empty Icon={MapIcon}>{t.empty}</Empty>}

      {!loading && items.length > 0 && (
        <div className="rm-board">
          {COLS.map(c => (
            <section key={c.key} className="rm-col" aria-label={t.cols[c.key]}>
              <div className="rm-col-h"><c.Icon size={16} color={c.color} /> {t.cols[c.key]} <span className="n">{byCol[c.key].length}</span></div>
              {byCol[c.key].length === 0 && <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12.5, padding: '22px 8px' }}>{t.emptyCol}</div>}
              {byCol[c.key].map(item => (
                <article key={item.id} className="pk-card pk-hover" style={{ padding: '16px 16px 16px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', opacity: c.key === 'done' ? 0.85 : 1 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 15, lineHeight: 1.55, fontWeight: 700 }}>{item.title}</h3>
                    {item.description && <p style={{ color: 'var(--text2)', fontSize: 13.3, margin: '6px 0 0', lineHeight: 1.8 }}>{item.description}</p>}
                  </div>
                  <button className="rm-vote" aria-pressed={!!item.voted} onClick={() => handleVote(item)} disabled={votingId === item.id || item.status === 'done'}
                    title={!isLoggedIn ? t.loginToVote : undefined} aria-label={`${t.votes}: ${item.voteCount || 0}`}>
                    <ChevronUp size={16} strokeWidth={2.6} />
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{item.voteCount || 0}</span>
                  </button>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
