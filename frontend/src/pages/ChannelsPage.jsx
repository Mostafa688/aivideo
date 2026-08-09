import React, { useState, useEffect } from 'react';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

const T = {
  ar: {
    title: 'قنواتي', sub: 'وصّل قناتك بـ VidIQ وخلّي Erivion يقترحلك فيديو كل يوم، وانت توافق أو ترفض.',
    addTitle: 'إضافة قناة جديدة', label: 'اسم مميز للقناة (اختياري)', vidiqKey: 'مفتاح VidIQ الشخصي',
    vidiqHelp: 'جيبه من app.vidiq.com/account/settings/mcp — مفيش OAuth بضغطة زرار، لازم تلصق المفتاح بنفسك.',
    format: 'شكل الفيديوهات', formatAuto: 'تلقائي (حسب القناة)', formatLong: 'طويل', formatShort: 'قصير',
    voice: 'الحساب ده بيستخدم صوت في الفيديوهات؟', add: 'إضافة القناة', adding: 'جاري الإضافة...',
    yourChannels: 'قنواتك', noChannels: 'لسه معملتش أي قناة.', pause: 'إيقاف مؤقت', resume: 'تشغيل',
    remove: 'حذف', lastRun: 'آخر تشغيل', never: 'لسه معملش أي تشغيل',
    analytics: 'تحليلات الأداء', hideAnalytics: 'إخفاء التحليلات', noRuns: 'لسه مفيش فيديوهات اتعملت.',
    linkPlaceholder: 'الصق رابط اليوتيوب بعد الرفع', link: 'اربط', refreshStats: 'حدّث الأداء',
    views: 'مشاهدة', likes: 'لايك', comments: 'كومنت', avgView: 'متوسط وقت المشاهدة',
    notLinkedYet: 'لسه ما اترفعش/اترباط بيوتيوب', loadingStats: 'بيجيب الأداء...',
  },
  en: {
    title: 'My Channels', sub: "Connect your channel to VidIQ and let Erivion suggest a video every day — you approve or reject.",
    addTitle: 'Connect a new channel', label: 'A friendly label (optional)', vidiqKey: 'Your personal VidIQ API key',
    vidiqHelp: 'Get it from app.vidiq.com/account/settings/mcp — no one-click OAuth, paste the key yourself.',
    format: 'Video format', formatAuto: 'Auto (from channel)', formatLong: 'Long-form', formatShort: 'Short',
    voice: 'Does this channel use voice narration?', add: 'Connect channel', adding: 'Connecting...',
    yourChannels: 'Your channels', noChannels: "You haven't connected a channel yet.", pause: 'Pause', resume: 'Resume',
    remove: 'Remove', lastRun: 'Last run', never: 'Never run yet',
    analytics: 'Performance analytics', hideAnalytics: 'Hide analytics', noRuns: 'No videos made yet.',
    linkPlaceholder: 'Paste the YouTube link after uploading', link: 'Link', refreshStats: 'Refresh stats',
    views: 'views', likes: 'likes', comments: 'comments', avgView: 'avg. view duration',
    notLinkedYet: 'Not linked to a YouTube video yet', loadingStats: 'Loading stats...',
  },
};

function formatDuration(sec) {
  if (sec == null) return '–';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      style={{ width: 44, height: 24, borderRadius: 999, background: value ? '#7c6af7' : 'rgba(255,255,255,0.15)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  );
}

export default function ChannelsPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const t = T[isAr ? 'ar' : 'en'];
  const dir = isAr ? 'rtl' : 'ltr';

  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [vidiqKey, setVidiqKey] = useState('');
  const [formatPref, setFormatPref] = useState('auto');
  const [usesVoice, setUsesVoice] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const [expandedChannelId, setExpandedChannelId] = useState(null);
  const [runsByChannel, setRunsByChannel] = useState({});
  const [linkInputs, setLinkInputs] = useState({});
  const [performanceByRun, setPerformanceByRun] = useState({});

  const toggleAnalytics = async (channelId) => {
    if (expandedChannelId === channelId) { setExpandedChannelId(null); return; }
    setExpandedChannelId(channelId);
    if (!runsByChannel[channelId]) {
      try {
        const res = await fetch(`/api/channels/${channelId}/runs`, { headers: authHeaders() });
        const data = await res.json();
        setRunsByChannel(prev => ({ ...prev, [channelId]: data.runs || [] }));
      } catch { setRunsByChannel(prev => ({ ...prev, [channelId]: [] })); }
    }
  };

  const linkYoutube = async (channelId, runId) => {
    const url = (linkInputs[runId] || '').trim();
    if (!url) return;
    try {
      const res = await fetch(`/api/channels/runs/${runId}/link-youtube`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ youtubeUrl: url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setRunsByChannel(prev => ({ ...prev, [channelId]: prev[channelId].map(r => r.id === runId ? data.run : r) }));
      setLinkInputs(prev => ({ ...prev, [runId]: '' }));
    } catch (e) { alert(e.message); }
  };

  const refreshPerformance = async (runId) => {
    setPerformanceByRun(prev => ({ ...prev, [runId]: 'loading' }));
    try {
      const res = await fetch(`/api/channels/runs/${runId}/performance`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPerformanceByRun(prev => ({ ...prev, [runId]: data.performance }));
    } catch (e) {
      setPerformanceByRun(prev => ({ ...prev, [runId]: { error: e.message } }));
    }
  };

  const load = () => {
    setLoading(true);
    fetch('/api/channels', { headers: authHeaders() }).then(r => r.json()).then(d => setChannels(d.channels || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const addChannel = async () => {
    if (!vidiqKey.trim()) return;
    setAdding(true); setError('');
    try {
      const res = await fetch('/api/channels', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ label, vidiqApiKey: vidiqKey.trim(), formatPref, usesVoice }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setLabel(''); setVidiqKey(''); setFormatPref('auto'); setUsesVoice(false);
      load();
    } catch (e) { setError(e.message); } finally { setAdding(false); }
  };

  const toggleStatus = async (ch) => {
    await fetch(`/api/channels/${ch.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: ch.status === 'active' ? 'paused' : 'active' }) });
    load();
  };
  const removeChannel = async (id) => {
    await fetch(`/api/channels/${id}`, { method: 'DELETE', headers: authHeaders() });
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

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📺</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t.title}</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 8, fontSize: 13.5, maxWidth: 440, marginInline: 'auto', lineHeight: 1.7 }}>{t.sub}</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{t.addTitle}</div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t.label}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, marginBottom: 10, boxSizing: 'border-box' }} />
          <input value={vidiqKey} onChange={e => setVidiqKey(e.target.value)} placeholder={t.vidiqKey} type="password"
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, marginBottom: 6, boxSizing: 'border-box' }} />
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 0 14px', lineHeight: 1.6 }}>{t.vidiqHelp}</p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 13, color: '#d1d5db' }}>{t.format}</span>
            <select value={formatPref} onChange={e => setFormatPref(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}>
              <option value="auto">{t.formatAuto}</option>
              <option value="long">{t.formatLong}</option>
              <option value="short">{t.formatShort}</option>
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: '#d1d5db' }}>{t.voice}</span>
            <Toggle value={usesVoice} onChange={setUsesVoice} />
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: 12.5, marginBottom: 12 }}>{error}</p>}
          <button onClick={addChannel} disabled={adding || !vidiqKey.trim()}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: adding ? 'rgba(124,106,247,0.3)' : '#7c6af7', color: '#fff', fontWeight: 700, fontSize: 14, cursor: adding ? 'not-allowed' : 'pointer' }}>
            {adding ? t.adding : t.add}
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>{t.yourChannels}</div>
        {loading ? null : channels.length === 0 ? (
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>{t.noChannels}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {channels.map(ch => (
              <div key={ch.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{ch.label || ch.channel_id}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: ch.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: ch.status === 'active' ? '#22c55e' : '#f59e0b' }}>
                    {ch.status}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
                  {t.lastRun}: {ch.last_run_at ? new Date(ch.last_run_at).toLocaleString() : t.never} · {ch.format_pref} · {ch.uses_voice ? '🎙️' : '🔇'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleStatus(ch)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#d1d5db', fontSize: 12, cursor: 'pointer' }}>
                    {ch.status === 'active' ? t.pause : t.resume}
                  </button>
                  <button onClick={() => removeChannel(ch.id)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
                    {t.remove}
                  </button>
                  <button onClick={() => toggleAnalytics(ch.id)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(124,106,247,0.3)', background: 'rgba(124,106,247,0.08)', color: '#a78bfa', fontSize: 12, cursor: 'pointer', marginInlineStart: 'auto' }}>
                    {expandedChannelId === ch.id ? t.hideAnalytics : `📊 ${t.analytics}`}
                  </button>
                </div>

                {expandedChannelId === ch.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {!runsByChannel[ch.id] ? null : runsByChannel[ch.id].length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12.5, margin: 0 }}>{t.noRuns}</p>
                    ) : runsByChannel[ch.id].filter(r => r.status === 'done').map(run => {
                      const perf = performanceByRun[run.id];
                      return (
                        <div key={run.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{run.idea_title}</div>
                          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>{new Date(run.created_at).toLocaleDateString()}</div>

                          {!run.youtube_video_id ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input value={linkInputs[run.id] || ''} onChange={e => setLinkInputs(prev => ({ ...prev, [run.id]: e.target.value }))} placeholder={t.linkPlaceholder}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 11.5 }} />
                              <button onClick={() => linkYoutube(ch.id, run.id)} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: '#7c6af7', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{t.link}</button>
                            </div>
                          ) : !perf ? (
                            <button onClick={() => refreshPerformance(run.id)} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(124,106,247,0.3)', background: 'transparent', color: '#a78bfa', fontSize: 11.5, cursor: 'pointer' }}>{t.refreshStats}</button>
                          ) : perf === 'loading' ? (
                            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>{t.loadingStats}</span>
                          ) : perf.error ? (
                            <span style={{ fontSize: 11.5, color: '#ef4444' }}>{perf.error}</span>
                          ) : (
                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: '#d1d5db' }}>
                              <span>👁️ {perf.views ?? '–'} {t.views}</span>
                              <span>👍 {perf.likes ?? '–'} {t.likes}</span>
                              <span>💬 {perf.comments ?? '–'} {t.comments}</span>
                              <span>⏱️ {formatDuration(perf.avgViewDurationSec)} {t.avgView}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
