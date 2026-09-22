import { useState, useEffect } from 'react';

const T = {
  ar: {
    heading: 'الفريق', sub: 'ادعُ زمايلك يشاركوك رصيد الكريديت بحسابهم الخاص.',
    back: '← رجوع', loading: 'جاري التحميل...',
    inviteTitle: 'ادعُ عضو جديد', emailPlaceholder: 'إيميل العضو...', inviteBtn: 'ابعت دعوة',
    membersTitle: 'الأعضاء', pendingTitle: 'دعوات مستنية رد',
    owner: 'صاحب الفريق', member: 'عضو', remove: 'شيل', revoke: 'إلغاء',
    memberView: (email) => `أنت عضو في فريق ${email} — بتشارك رصيد الكريديت بتاعه.`,
    leaveBtn: 'اسيب الفريق',
    noneYet: 'لسه معندكش فريق. ادعُ أول عضو تحت وهيتعمل تلقائيًا.',
    note: 'خطة/صلاحيات كل عضو بتفضل زي حسابه الأصلي — بس رصيد الكريديت المستخدم بيتشارك.',
  },
  en: {
    heading: 'Team', sub: 'Invite teammates to share your credit pool from their own account.',
    back: '← Back', loading: 'Loading...',
    inviteTitle: 'Invite a Member', emailPlaceholder: "Member's email...", inviteBtn: 'Send Invite',
    membersTitle: 'Members', pendingTitle: 'Pending Invites',
    owner: 'Owner', member: 'Member', remove: 'Remove', revoke: 'Revoke',
    memberView: (email) => `You're a member of ${email}'s team — sharing their credit pool.`,
    leaveBtn: 'Leave Team',
    noneYet: "You don't have a team yet. Invite your first member below and one will be created automatically.",
    note: "Each member keeps their own plan/permissions — only the credit balance they use is shared.",
  },
};

export default function TeamPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[isAr ? 'ar' : 'en'];

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState('');
  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/team', { headers: authHeaders() });
      const d = await r.json();
      setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const r = await fetch('/api/team/invite', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email: email.trim() }) });
      const d = await r.json();
      if (d.invite) { showToastMsg('✅ Invite sent'); setEmail(''); load(); }
      else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setInviting(false);
  };

  const handleRevoke = async (id) => {
    try {
      const r = await fetch(`/api/team/invite/${id}`, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Revoked'); load(); }
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('Remove this member from your team?')) return;
    try {
      const r = await fetch(`/api/team/members/${userId}`, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Removed'); load(); }
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  const handleLeave = async () => {
    if (!confirm('Leave this team? You will go back to your own credit balance.')) return;
    try {
      const r = await fetch('/api/team/leave', { method: 'POST', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Left the team'); load(); }
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.back}
          </button>
        )}

        {toast && (
          <div style={{ position: 'fixed', top: 16, insetInlineEnd: 16, background: toast.startsWith('✅') ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.startsWith('✅') ? '#22c55e' : '#ef4444'}`, borderRadius: 10, padding: '10px 18px', fontSize: 13, zIndex: 9999 }}>{toast}</div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤝</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heading}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>
            {t.sub}
          </p>
        </div>

        {loading && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.loading}</div>}

        {data?.isMember && (
          <div style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 16, padding: '20px 24px', textAlign: 'center' }}>
            <p style={{ fontSize: 14.5, color: '#d1d5db', marginBottom: 16 }}>{t.memberView(data.ownerEmail)}</p>
            <button onClick={handleLeave} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#f87171', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              {t.leaveBtn}
            </button>
          </div>
        )}

        {data?.none && (
          <>
            <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 13.5, marginBottom: 24 }}>{t.noneYet}</p>
          </>
        )}

        {(data?.isOwner || data?.none) && (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>{t.inviteTitle}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={t.emailPlaceholder}
                style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px', color: '#fff', fontSize: 13.5 }} />
              <button onClick={handleInvite} disabled={inviting} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {inviting ? '...' : t.inviteBtn}
              </button>
            </div>
          </div>
        )}

        {data?.isOwner && (
          <>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>{t.membersTitle}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
              {(data.members || []).map(m => (
                <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 16px' }}>
                  <div>
                    <span style={{ fontSize: 13.5 }}>{m.email}</span>
                    <span style={{ fontSize: 11, color: m.role === 'owner' ? '#a78bfa' : 'rgba(255,255,255,0.4)', marginInlineStart: 10 }}>{m.role === 'owner' ? t.owner : t.member}</span>
                  </div>
                  {m.role === 'member' && (
                    <button onClick={() => handleRemoveMember(m.user_id)} style={{ background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>{t.remove}</button>
                  )}
                </div>
              ))}
            </div>

            {(data.pendingInvites || []).length > 0 && (
              <>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.7)' }}>{t.pendingTitle}</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {data.pendingInvites.map(inv => (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 16px' }}>
                      <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)' }}>{inv.email}</span>
                      <button onClick={() => handleRevoke(inv.id)} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>{t.revoke}</button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {data && !data.none && (
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 11.5, marginTop: 20 }}>{t.note}</p>
        )}

      </div>
    </div>
  );
}
