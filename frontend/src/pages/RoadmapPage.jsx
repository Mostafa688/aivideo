import { useState, useEffect } from 'react';

const T = {
  ar: {
    heading: 'إيه الجاي في Erivion', sub: 'صوّت على أكتر فيتشر عايز نبنيه بعد كده — صوتك بيوجّه أولوياتنا فعليًا.',
    back: '← رجوع', loading: 'جاري التحميل...', empty: 'لسه مفيش عناصر مضافة.',
    vote: 'صوّت', voted: 'صوّتّ ✓', loginToVote: 'سجّل دخولك عشان تصوّت',
    statuses: { planned: 'مخطط له', in_progress: 'شغالين عليه', done: 'خلص' },
  },
  en: {
    heading: "What's Coming to Erivion", sub: 'Vote on the next feature you want built — your vote genuinely shapes our priorities.',
    back: '← Back', loading: 'Loading...', empty: 'No items added yet.',
    vote: 'Vote', voted: 'Voted ✓', loginToVote: 'Log in to vote',
    statuses: { planned: 'Planned', in_progress: 'In Progress', done: 'Done' },
  },
};

const STATUS_COLOR = {
  planned: '#6b7280',
  in_progress: '#3b82f6',
  done: '#22c55e',
};

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
      const r = await fetch(`/api/roadmap?language=${language}`, { headers: authHeaders() });
      const d = await r.json();
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
      if (r.ok) {
        setItems(prev => prev.map(it => it.id === item.id ? { ...it, voted: d.voted, voteCount: d.voteCount } : it));
      }
    } catch (e) { console.error(e); }
    setVotingId(null);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.back}
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heading}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>
            {t.sub}
          </p>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.loading}</div>}
        {!loading && items.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.empty}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => {
            const color = STATUS_COLOR[item.status] || STATUS_COLOR.planned;
            return (
              <div key={item.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}1a`, border: `1px solid ${color}4d`, borderRadius: 999, padding: '3px 10px' }}>
                      {t.statuses[item.status] || t.statuses.planned}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>{item.title}</span>
                  </div>
                  {item.description && <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13.5, margin: 0, lineHeight: 1.7 }}>{item.description}</p>}
                </div>
                <button
                  onClick={() => handleVote(item)}
                  disabled={votingId === item.id || item.status === 'done'}
                  title={!isLoggedIn ? t.loginToVote : undefined}
                  style={{
                    flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    minWidth: 56, padding: '8px 12px', borderRadius: 12, cursor: item.status === 'done' ? 'default' : 'pointer',
                    border: item.voted ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.12)',
                    background: item.voted ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                    color: item.voted ? '#a78bfa' : 'rgba(255,255,255,0.7)', fontWeight: 700, fontSize: 13,
                    opacity: item.status === 'done' ? 0.5 : 1,
                  }}>
                  <span style={{ fontSize: 16 }}>▲</span>
                  <span>{item.voteCount}</span>
                </button>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
