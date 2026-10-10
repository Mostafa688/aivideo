import { useState, useEffect } from 'react';
import { Users, Mail, Crown, UserMinus, X, Send, LogOut, Coins, ShieldCheck, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { confirmDialog } from '../components/confirmDialog.jsx';
import { PageShell, Stat, Pill, Skeletons } from '../components/PageKit.jsx';

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
    eyebrow: 'الفريق', how: ['رصيد واحد للكل', 'كل عضو بحسابه الخاص', 'تشيل أي عضو في أي وقت'], howSub: ['كريديت الفريق بيتخصم منه أي توليد بيعمله الأعضاء.', 'كل واحد بيدخل بإيميله وبيشوف مشاريعه لوحده.', 'لما تشيله بيرجع لرصيده الخاص فورًا.'], members: 'عضو', pending: 'دعوة معلّقة',
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
    eyebrow: 'Team', how: ['One shared balance', 'Everyone has their own account', 'Remove anyone anytime'], howSub: ['Anything members generate is deducted from the team credits.', 'Each person signs in with their own email and keeps their own projects.', 'Removed members go back to their own balance immediately.'], members: 'members', pending: 'pending invites',
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
    if (!(await confirmDialog({ title: 'Remove this member?', message: 'They will lose access to your team credits right away.', confirmText: 'Remove', cancelText: 'Cancel', tone: 'danger', dir: 'ltr' }))) return;
    try {
      const r = await fetch(`/api/team/members/${userId}`, { method: 'DELETE', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Removed'); load(); }
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  const handleLeave = async () => {
    if (!(await confirmDialog({ title: 'Leave this team?', message: 'You will go back to your own credit balance.', confirmText: 'Leave', cancelText: 'Stay', tone: 'warn', dir: 'ltr' }))) return;
    try {
      const r = await fetch('/api/team/leave', { method: 'POST', headers: authHeaders() });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Left the team'); load(); }
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  const ok = toast.startsWith('✅');
  const list = data?.members || [];
  const initial = (e) => String(e || '?').trim()[0]?.toUpperCase() || '?';
  return (
    <PageShell dir={dir} onBack={onBack} backLabel={isAr ? 'رجوع' : 'Back'} eyebrow={t.eyebrow} Icon={Users} accent="#34d399" title={t.heading} subtitle={t.sub} maxWidth={860}
      aside={data?.isOwner && <><Stat value={list.length} label={t.members} />{(data.pendingInvites || []).length > 0 && <Stat value={data.pendingInvites.length} label={t.pending} />}</>}
      toast={toast && (
        <div role="status" style={{ position: 'fixed', top: 16, insetInlineEnd: 16, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, color: ok ? '#34d399' : '#f87171', background: ok ? 'rgba(10,30,22,0.95)' : 'rgba(40,14,14,0.95)', border: `1px solid ${ok ? 'rgba(52,211,153,.5)' : 'rgba(248,113,113,.5)'}`, boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>
          {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {toast.replace(/^[✅❌]\s*/, '')}
        </div>
      )}>
      <style>{`
        .tm-how{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .tm-row{display:flex;align-items:center;gap:14px;padding:14px 18px}
        .tm-avatar{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;font-weight:800;font-size:16px;flex-shrink:0;color:#fff}
        .tm-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 13px;border-radius:10px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;background:transparent;transition:all .15s}
        .tm-btn.danger{color:#f87171;border:1px solid rgba(248,113,113,.35)}.tm-btn.danger:hover{background:rgba(248,113,113,.1)}
        .tm-btn.quiet{color:var(--text2);border:1px solid var(--border2)}.tm-btn.quiet:hover{color:var(--text);border-color:var(--border3)}
        .tm-input{flex:1;min-width:0;background:rgba(255,255,255,.04);border:1px solid var(--border2);border-radius:12px;padding:13px 14px;color:var(--text);font:inherit;font-size:14.5px;outline:none;transition:border-color .15s,box-shadow .15s}
        .tm-input:focus{border-color:var(--pk-accent);box-shadow:0 0 0 3px var(--pk-accent-bg)}
        @media (max-width:720px){.tm-how{grid-template-columns:1fr}.tm-invite{flex-direction:column}}
      `}</style>

      {loading && <Skeletons n={3} h={84} />}

      {!loading && data && (
        <div className="tm-how" style={{ marginBottom: 26 }}>
          {[Coins, Users, ShieldCheck].map((Ico, i) => (
            <div key={i} className="pk-card" style={{ padding: '16px 18px' }}>
              <span style={{ width: 34, height: 34, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(52,211,153,.14)', marginBottom: 10 }}><Ico size={17} color="#34d399" /></span>
              <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 4 }}>{t.how[i]}</div>
              <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.75 }}>{t.howSub[i]}</div>
            </div>
          ))}
        </div>
      )}

      {data?.isMember && (
        <div className="pk-card" style={{ padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', borderColor: 'rgba(52,211,153,.35)' }}>
          <span className="tm-avatar" style={{ background: 'linear-gradient(135deg,#34d399,#059669)' }}><Crown size={20} /></span>
          <p style={{ flex: '1 1 260px', margin: 0, fontSize: 15, lineHeight: 1.8 }}>{t.memberView(data.ownerEmail)}</p>
          <button className="tm-btn danger" onClick={handleLeave}><LogOut size={14} /> {t.leaveBtn}</button>
        </div>
      )}

      {data?.none && <p style={{ color: 'var(--text2)', fontSize: 14, margin: '0 0 18px', lineHeight: 1.8 }}>{t.noneYet}</p>}

      {(data?.isOwner || data?.none) && (
        <section className="pk-card" style={{ padding: '20px 22px', marginBottom: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={16} color="#34d399" /> {t.inviteTitle}</h2>
          <div className="tm-invite" style={{ display: 'flex', gap: 10 }}>
            <input className="tm-input" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleInvite(); }} placeholder={t.emailPlaceholder} />
            <button onClick={handleInvite} disabled={inviting || !email.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 22px', minHeight: 46, borderRadius: 12, border: 'none', font: 'inherit', fontWeight: 700, fontSize: 14, color: '#06281c', cursor: inviting || !email.trim() ? 'not-allowed' : 'pointer', background: inviting || !email.trim() ? 'rgba(52,211,153,.35)' : 'linear-gradient(135deg,#6ee7b7,#34d399)' }}>
              <Send size={15} style={{ transform: isAr ? 'scaleX(-1)' : 'none' }} /> {inviting ? '...' : t.inviteBtn}
            </button>
          </div>
        </section>
      )}

      {data?.isOwner && (
        <>
          <div className="pk-section-h">{t.membersTitle}</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {list.map(m => (
              <div key={m.user_id} className="pk-card tm-row">
                <span className="tm-avatar" style={{ background: m.role === 'owner' ? 'linear-gradient(135deg,#a78bfa,#6d28d9)' : 'linear-gradient(135deg,#475569,#334155)' }}>{initial(m.email)}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">{m.email}</div>
                </div>
                {m.role === 'owner' ? <Pill color="#a78bfa"><Crown size={12} /> {t.owner}</Pill> : <Pill color="#94a3b8">{t.member}</Pill>}
                {m.role === 'member' && <button className="tm-btn danger" onClick={() => handleRemoveMember(m.user_id)}><UserMinus size={13} /> {t.remove}</button>}
              </div>
            ))}
          </div>

          {(data.pendingInvites || []).length > 0 && (
            <>
              <div className="pk-section-h">{t.pendingTitle}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.pendingInvites.map(inv => (
                  <div key={inv.id} className="pk-card tm-row">
                    <span className="tm-avatar" style={{ background: 'rgba(251,191,36,.14)', color: '#fbbf24' }}><Clock size={18} /></span>
                    <div style={{ minWidth: 0, flex: 1, fontSize: 14.5, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="ltr">{inv.email}</div>
                    <button className="tm-btn quiet" onClick={() => handleRevoke(inv.id)}><X size={13} /> {t.revoke}</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {data && !data.none && <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12.5, marginTop: 30 }}>{t.note}</p>}
    </PageShell>
  );
}
