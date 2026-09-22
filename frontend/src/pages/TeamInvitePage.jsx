import { useState, useEffect } from 'react';

const T = {
  ar: {
    loading: 'جاري التحميل...', notFound: 'الدعوة دي مش موجودة.',
    expired: 'الدعوة دي خلصت صلاحيتها.', accepted: 'الدعوة دي اتقبلت خلاص.',
    title: (name) => `دعوة للانضمام لـ "${name}"`,
    body: (owner, email) => `${owner} دعاك (${email}) تنضم لفريقه على Erivion — هتشارك رصيد الكريديت بتاعه.`,
    loginFirst: 'سجّل دخولك (أو اعمل حساب) بنفس الإيميل ده الأول عشان تقدر تقبل الدعوة.',
    goLogin: 'تسجيل الدخول / إنشاء حساب', accept: 'قبول الدعوة', accepting: 'جاري القبول...',
    wrongEmail: (invited) => `الدعوة دي بس للإيميل ${invited} — سجّل دخولك بنفس الإيميل ده.`,
    success: 'تم! أنت دلوقتي عضو في الفريق.', goDashboard: 'روح للوحة التحكم',
  },
  en: {
    loading: 'Loading...', notFound: "This invite doesn't exist.",
    expired: 'This invite has expired.', accepted: 'This invite was already accepted.',
    title: (name) => `Invite to join "${name}"`,
    body: (owner, email) => `${owner} invited (${email}) to join their team on Erivion — you'll share their credit pool.`,
    loginFirst: 'Log in (or sign up) with that exact email first to accept this invite.',
    goLogin: 'Log in / Sign up', accept: 'Accept Invite', accepting: 'Accepting...',
    wrongEmail: (invited) => `This invite is only for ${invited} — log in with that exact email.`,
    success: "Done! You're now part of the team.", goDashboard: 'Go to Dashboard',
  },
};

export default function TeamInvitePage({ token, isLoggedIn, currentUserEmail, onRequireLogin, onAccepted, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[isAr ? 'ar' : 'en'];

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/team/invite/${token}`);
        const d = await r.json();
        if (alive) setInvite(r.ok ? d : { error: d.error });
      } catch (e) { if (alive) setInvite({ error: e.message }); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError('');
    try {
      const authHeader = { Authorization: 'Bearer ' + localStorage.getItem('token') };
      const r = await fetch(`/api/team/invite/${token}/accept`, { method: 'POST', headers: authHeader });
      const d = await r.json();
      if (d.success) { setDone(true); }
      else setError(d.error || 'Failed');
    } catch (e) { setError(e.message); }
    setAccepting(false);
  };

  const wrapper = (children) => (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '36px 32px' }}>
        {children}
      </div>
    </div>
  );

  if (loading) return wrapper(<p style={{ color: 'rgba(255,255,255,0.4)' }}>{t.loading}</p>);

  if (done) return wrapper(<>
    <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
    <p style={{ fontSize: 15, marginBottom: 20 }}>{t.success}</p>
    <button onClick={onAccepted} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{t.goDashboard}</button>
  </>);

  if (invite?.error || !invite) return wrapper(<p style={{ color: '#f87171' }}>{t.notFound}</p>);
  if (invite.status === 'expired') return wrapper(<p style={{ color: '#f59e0b' }}>{t.expired}</p>);
  if (invite.status === 'accepted') return wrapper(<p style={{ color: 'rgba(255,255,255,0.5)' }}>{t.accepted}</p>);

  const emailMismatch = isLoggedIn && currentUserEmail && currentUserEmail.toLowerCase() !== invite.email.toLowerCase();

  return wrapper(<>
    <div style={{ fontSize: 44, marginBottom: 12 }}>🤝</div>
    <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>{t.title(invite.teamName)}</h1>
    <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 24 }}>{t.body(invite.ownerEmail, invite.email)}</p>

    {!isLoggedIn && (
      <>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>{t.loginFirst}</p>
        <button onClick={onRequireLogin} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>{t.goLogin}</button>
      </>
    )}

    {isLoggedIn && emailMismatch && (
      <p style={{ fontSize: 13, color: '#f87171' }}>{t.wrongEmail(invite.email)}</p>
    )}

    {isLoggedIn && !emailMismatch && (
      <>
        {error && <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12 }}>{error}</p>}
        <button onClick={handleAccept} disabled={accepting} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {accepting ? t.accepting : t.accept}
        </button>
      </>
    )}
  </>);
}
