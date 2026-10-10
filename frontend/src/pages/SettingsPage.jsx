import React, { useState, useEffect } from 'react';
import {
  User, Bell, Lock, Plug, AlertTriangle, Settings as SettingsIcon, CreditCard,
  Globe, Mail, Monitor, LogOut, Key, Package, Trash2, Check, X, Copy, Film,
  Loader2, ImageIcon,
} from 'lucide-react';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

function Section({ title, icon, children, danger }) {
  return (
    <div className="s-section" style={{
      background: danger ? 'rgba(248,113,113,0.04)' : 'var(--bg2)',
      border: `1px solid ${danger ? 'rgba(248,113,113,0.25)' : 'var(--border)'}`,
      borderRadius: 16, padding: 24, marginBottom: 16,
    }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: danger ? '#f87171' : 'var(--text3)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 20px' }}>
        {icon} {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, desc, children, last }) {
  return (
    <div className="s-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '13px 0', borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div className="s-row-control" style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      style={{ width: 44, height: 24, borderRadius: 999, background: value ? 'var(--accent)' : 'var(--bg4)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
    </div>
  );
}

export default function SettingsPage({ onBack, user, onNavigate }) {
  const NAV = [
    { key: 'profile',       icon: User, label: 'Profile' },
    { key: 'notifications', icon: Bell, label: 'Notifications' },
    { key: 'security',      icon: Lock, label: 'Security' },
    { key: 'developer',     icon: Plug, label: 'API & MCP' },
    { key: 'danger',        icon: AlertTriangle, label: 'Danger Zone' },
  ];

  const [active, setActive]               = useState('profile');

  // Profile
  const [displayName, setDisplayName]     = useState(user?.name || '');
  const [nameStatus, setNameStatus]       = useState(''); // '' | 'loading' | 'success' | 'error'

  // Notifications
  // ✅ FIX (باج حقيقي: كانت بس بتتحفظ محليًا (localStorage) وبتفضل شكل بدون أي تأثير حقيقي
  // — الباك اند مبقاش يتأكد منها خالص قبل ما يبعت أي إيميل). localStorage هنا بقى بس
  // كاش سريع لأول عرض (يمنع "فلاش" من الديفولت)، والقيمة الحقيقية بتتحمل وبتتحفظ من/على
  // الباك اند دلوقتي (loadNotificationPrefs/saveNotificationPrefs تحت)
  const [emailNotif, setEmailNotif]       = useState(() => localStorage.getItem('erivion_notif_email') !== 'false');
  const [videoReady, setVideoReady]       = useState(() => localStorage.getItem('erivion_notif_video') !== 'false');
  const [newsletter, setNewsletter]       = useState(() => localStorage.getItem('erivion_notif_news') !== 'false');
  const [notifSaving, setNotifSaving]     = useState(false);

  // Region
  const [region, setRegion]               = useState(() => localStorage.getItem('erivion_region') || 'eg');

  // Password
  const [newPw, setNewPw]                 = useState('');
  const [confirmPw, setConfirmPw]         = useState('');
  const [pwStatus, setPwStatus]           = useState('');

  // Delete account
  const [deleteStep, setDeleteStep]       = useState('idle'); // 'idle' | 'confirm' | 'loading' | 'done'
  const [deleteInput, setDeleteInput]     = useState('');

  // ✅ NEW: API Keys (لـ MCP/استخدام خارجي)
  const [apiKeys, setApiKeys]             = useState([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [newKeyName, setNewKeyName]       = useState('');
  const [generatingKey, setGeneratingKey] = useState(false);
  const [freshKey, setFreshKey]           = useState(null); // المفتاح الكامل — بيبان مرة واحدة بس
  const [copiedKey, setCopiedKey]         = useState(false);
  const [copiedUrl, setCopiedUrl]         = useState(false);
  // ✅ NEW: رفع فيديو والحصول على رابط عام — عشان يستخدم في MCP (Claude مش بيقدر يرفع
  // ملفات فيديو مباشرة، بس يقدر ياخد رابط)
  const [videoLinkUploading, setVideoLinkUploading] = useState(false);
  const [videoLinkResult, setVideoLinkResult]       = useState(null); // { videoUrl, durationSec }
  const [videoLinkError, setVideoLinkError]         = useState('');
  const [videoLinkForSwap, setVideoLinkForSwap]     = useState(false); // فيديو لتبديل الشخصية: سقف 60 ثانية بدل 15
  const [copiedVideoLink, setCopiedVideoLink]       = useState(false);
  // ✅ NEW (طلب العميل: "حرك الصورة دي" لصورة مرفقة في Claude/MCP كان بيخترع فيديو تاني
  // بدل ما يقول محتاج رابط) — نفس فكرة رفع الفيديو فوق بالظبط، بس للصور
  const [imageLinkUploading, setImageLinkUploading] = useState(false);
  const [imageLinkResult, setImageLinkResult]       = useState(null); // { imageUrl }
  const [imageLinkError, setImageLinkError]         = useState('');
  const [copiedImageLink, setCopiedImageLink]       = useState(false);

  // persist region (اختيار محلي بحت — مفيش داعي للباك اند، بيتحكم في العملة/اللغة بس)
  useEffect(() => { localStorage.setItem('erivion_region', region); }, [region]);

  // ✅ FIX: نحمّل التفضيلات الحقيقية من الباك اند أول ما التاب يتفتح (localStorage كان
  // المصدر الوحيد قبل كده — دلوقتي بس كاش سريع لحد ما يوصل رد الباك اند)
  useEffect(() => {
    if (active !== 'notifications') return;
    (async () => {
      try {
        const res = await fetch('/api/auth/notification-prefs', { headers: authHeaders() });
        const data = await res.json();
        if (res.ok) {
          setEmailNotif(data.emailEnabled);
          setVideoReady(data.videoReady);
          setNewsletter(data.newsletter);
          localStorage.setItem('erivion_notif_email', data.emailEnabled);
          localStorage.setItem('erivion_notif_video', data.videoReady);
          localStorage.setItem('erivion_notif_news', data.newsletter);
        }
      } catch {}
    })();
  }, [active]);

  // ✅ FIX: أي تغيير في أي مفتاح بيتبعت للباك اند فورًا (مش بس localStorage) — ده اللي
  // بيخلي sendBroadcastEmail/sendDailyResultEmail يقدروا يتأكدوا منه فعليًا
  const saveNotificationPrefs = async (next) => {
    localStorage.setItem('erivion_notif_email', next.emailEnabled);
    localStorage.setItem('erivion_notif_video', next.videoReady);
    localStorage.setItem('erivion_notif_news', next.newsletter);
    setNotifSaving(true);
    try {
      await fetch('/api/auth/notification-prefs', { method: 'POST', headers: authHeaders(), body: JSON.stringify(next) });
    } catch {}
    setNotifSaving(false);
  };
  const updateEmailNotif = (v) => { setEmailNotif(v); saveNotificationPrefs({ emailEnabled: v, videoReady, newsletter }); };
  const updateVideoReady = (v) => { setVideoReady(v); saveNotificationPrefs({ emailEnabled: emailNotif, videoReady: v, newsletter }); };
  const updateNewsletter = (v) => { setNewsletter(v); saveNotificationPrefs({ emailEnabled: emailNotif, videoReady, newsletter: v }); };

  // ✅ NEW: نحمّل مفاتيح الـ API لما التاب يتفتح
  useEffect(() => { if (active === 'developer') loadApiKeys(); }, [active]);

  const loadApiKeys = async () => {
    setApiKeysLoading(true);
    try {
      const res = await fetch('/api/auth/api-key', { headers: authHeaders() });
      const data = await res.json();
      setApiKeys(data.keys || []);
    } catch {}
    setApiKeysLoading(false);
  };

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    setFreshKey(null);
    try {
      const res = await fetch('/api/auth/api-key/generate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ name: newKeyName.trim() || 'Default Key' }),
      });
      const data = await res.json();
      if (data.apiKey) { setFreshKey(data.apiKey); setNewKeyName(''); await loadApiKeys(); }
    } catch {}
    setGeneratingKey(false);
  };

  const handleRevokeKey = async (id) => {
    try {
      await fetch(`/api/auth/api-key/${id}`, { method: 'DELETE', headers: authHeaders() });
      await loadApiKeys();
    } catch {}
  };

  const MCP_URL = `${window.location.origin}/mcp`;
  const copyToClipboard = (text, setFlag) => {
    navigator.clipboard.writeText(text).then(() => { setFlag(true); setTimeout(() => setFlag(false), 2000); });
  };

  // ✅ NEW: رفع فيديو → رابط عام (أقصى 15 ثانية) — للاستخدام في MCP
  const handleVideoLinkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setVideoLinkError(''); setVideoLinkResult(null); setVideoLinkUploading(true);
    try {
      const form = new FormData();
      form.append('video', file, file.name || 'video.mp4');
      const res = await fetch(`/api/upload-video-link${videoLinkForSwap ? '?use=swap' : ''}`, { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body: form });
      const data = await res.json();
      if (!res.ok) { setVideoLinkError(data.error || 'Upload failed'); }
      else { setVideoLinkResult(data); }
    } catch (err) {
      setVideoLinkError(err.message || 'Upload failed');
    }
    setVideoLinkUploading(false);
    e.target.value = ''; // يسمح برفع نفس الملف تاني لو حبيت
  };

  // ✅ NEW: رفع صورة → رابط عام — نفس فكرة الفيديو فوق بالظبط، لاستخدام generate_video's
  // "imageUrl" في MCP
  const handleImageLinkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageLinkError(''); setImageLinkResult(null); setImageLinkUploading(true);
    try {
      const form = new FormData();
      form.append('image', file, file.name || 'image.jpg');
      const res = await fetch('/api/upload-image-link', { method: 'POST', headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }, body: form });
      const data = await res.json();
      if (!res.ok) { setImageLinkError(data.message || data.error || 'Upload failed'); }
      else { setImageLinkResult(data); }
    } catch (err) {
      setImageLinkError(err.message || 'Upload failed');
    }
    setImageLinkUploading(false);
    e.target.value = '';
  };

  // ── Save name ──
  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setNameStatus('loading');
    try {
      const res = await fetch('/api/auth/update-profile', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ name: displayName }),
      });
      setNameStatus(res.ok ? 'success' : 'error');
    } catch { setNameStatus('error'); }
    setTimeout(() => setNameStatus(''), 3000);
  };

  // ── Change password ──
  const handleChangePw = async () => {
    if (newPw.length < 6) return setPwStatus('error:Min. 6 characters');
    if (newPw !== confirmPw) return setPwStatus('error:Passwords do not match');
    setPwStatus('loading');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ newPassword: newPw }),
      });
      if (res.ok) { setPwStatus('success'); setNewPw(''); setConfirmPw(''); }
      else setPwStatus('error:Failed to update password');
    } catch { setPwStatus('error:Something went wrong'); }
  };

  // ── Delete account ──
  const handleDeleteAccount = async () => {
    if (deleteInput !== 'DELETE') return;
    setDeleteStep('loading');
    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'DELETE', headers: authHeaders(),
      });
      if (res.ok) {
        setDeleteStep('done');
        setTimeout(() => {
          localStorage.clear();
          window.location.href = '/';
        }, 3000);
      } else {
        setDeleteStep('confirm');
        alert('Failed to delete account. Please contact support.');
      }
    } catch {
      setDeleteStep('confirm');
      alert('Something went wrong. Please try again.');
    }
  };

  const btnStyle = (color = 'var(--accent)') => ({
    padding: '11px 20px', borderRadius: 10, background: color, color: '#fff',
    border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .s-content { animation: fadeIn 0.2s ease; }
        .s-nav-btn { transition: all 0.15s !important; }
        .s-nav-btn:hover { background: var(--bg3) !important; }

        /* Mobile nav: horizontal tabs instead of sidebar */
        @media (max-width: 600px) {
          .s-layout { flex-direction: column !important; padding: 12px !important; gap: 12px !important; }
          .s-sidebar { width: 100% !important; }
          .s-sidebar-inner { display: flex !important; flex-direction: row !important; overflow-x: auto !important; border-radius: 12px !important; scrollbar-width: none !important; }
          .s-sidebar-inner::-webkit-scrollbar { display: none; }
          /* ✅ FIX (باج حقيقي: كل تاب كان بياخد width:100% (inline، مقصودة للشريط الجانبي
             الرأسي بتاع الديسكتوب) — على الموبايل ده كان بيخلي كل زرار ياخد عرض الشاشة كله،
             فيبان "Profile" بس وكأنه الخيار الوحيد، وباقي التابات (زي "API & MCP") بتتطلب
             سحب شاشة كاملة بالظبط عشان تظهر من غير أي مؤشر إنها موجودة أصلًا) */
          .s-nav-btn { width: auto !important; flex-shrink: 0 !important; padding: 10px 14px !important; border-left: none !important; border-bottom: 3px solid transparent !important; white-space: nowrap !important; }
          .s-nav-btn-active { border-bottom-color: var(--accent) !important; border-left-color: transparent !important; }
          .s-row { flex-direction: column !important; align-items: flex-start !important; gap: 10px !important; }
          .s-row-control { width: 100% !important; }
          .s-region-btns { flex-direction: column !important; width: 100% !important; }
          .s-region-btns button { width: 100% !important; text-align: center !important; }
          .s-sub-row { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; }
          .s-sub-row button { width: 100% !important; }
          .s-name-row { flex-direction: column !important; }
          .s-name-row button { width: 100% !important; }
          .s-export-row { flex-direction: column !important; gap: 10px !important; }
          .s-export-row button { width: 100% !important; }
          .s-header { padding: 12px 14px !important; }
          .s-section { padding: 16px !important; }
        }
      `}</style>

      {/* Header */}
      <div className="s-header" style={{ borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg2)' }}>
        <button onClick={onBack} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: '7px 14px', fontWeight: 600, flexShrink: 0 }}>
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><SettingsIcon size={16} strokeWidth={2} /> Settings</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Manage your account & preferences</p>
        </div>
      </div>

      <div className="s-layout" style={{ display: 'flex', flex: 1, maxWidth: 960, margin: '0 auto', width: '100%', padding: '24px 20px', gap: 20, boxSizing: 'border-box' }}>

        {/* Sidebar */}
        <div className="s-sidebar" style={{ width: 190, flexShrink: 0 }}>
          <div className="s-sidebar-inner" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', position: 'sticky', top: 24 }}>
            {NAV.map(item => (
              <button key={item.key}
                className={`s-nav-btn${active === item.key ? ' s-nav-btn-active' : ''}`}
                onClick={() => setActive(item.key)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', background: active === item.key ? 'var(--accent-bg)' : 'transparent',
                  border: 'none', borderLeft: `3px solid ${active === item.key ? 'var(--accent)' : 'transparent'}`,
                  color: active === item.key ? 'var(--accent)' : 'var(--text3)',
                  cursor: 'pointer', fontSize: 13, fontWeight: active === item.key ? 700 : 500, textAlign: 'left',
                }}>
                <item.icon size={15} strokeWidth={2} /> {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }} className="s-content" key={active}>

          {/* ── PROFILE ── */}
          {active === 'profile' && (
            <div>
              <Section title="Profile Information" icon={<User size={14} strokeWidth={2} />}>
                {/* Avatar + info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--accent-bg)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                    {(displayName || user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{displayName || user?.name || 'No name set'}</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{user?.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 5, fontWeight: 700, background: 'var(--accent-bg)', display: 'inline-block', padding: '2px 10px', borderRadius: 999 }}>
                      {(user?.plan || 'FREE').toUpperCase()} Plan
                    </div>
                  </div>
                </div>

                {/* Display Name */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 7 }}>Display Name</label>
                  <div className="s-name-row" style={{ display: 'flex', gap: 10 }}>
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                      placeholder="Your name"
                      style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                    <button onClick={handleSaveName} disabled={nameStatus === 'loading' || !displayName.trim()}
                      style={{ ...btnStyle(nameStatus === 'success' ? '#22c55e' : nameStatus === 'error' ? '#ef4444' : 'var(--accent)'), opacity: !displayName.trim() ? 0.5 : 1, minWidth: 80 }}>
                      {nameStatus === 'loading' ? <Loader2 size={14} className="spinning" /> : nameStatus === 'success' ? 'Saved' : nameStatus === 'error' ? 'Failed' : 'Save'}
                    </button>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text3)', margin: '6px 0 0' }}>This name will appear on your profile across Erivion.</p>
                </div>

                {/* Email */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 7 }}>Email Address</label>
                  <div style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {user?.email}
                    <span style={{ fontSize: 11, background: 'var(--bg4)', padding: '2px 8px', borderRadius: 6, color: 'var(--text3)' }}>Read-only</span>
                  </div>
                </div>
              </Section>

              {/* Subscription */}
              <Section title="Subscription" icon={<CreditCard size={14} strokeWidth={2} />}>
                <div className="s-sub-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      {user?.plan ? user.plan.toUpperCase() : 'Free'} Plan
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                      {user?.plan_expires_at
                        ? `Expires: ${new Date(user.plan_expires_at).toLocaleDateString('en-GB')}`
                        : 'No active subscription'}
                    </div>
                  </div>
                  <button onClick={() => onNavigate && onNavigate('pricing')} style={btnStyle()}>
                    {user?.plan && user.plan !== 'free' ? 'Manage Plan' : 'Upgrade'}
                  </button>
                </div>
              </Section>

              {/* Pricing Region */}
              <Section title="Pricing Region" icon={<Globe size={14} strokeWidth={2} />}>
                <Row label="Your Region" desc="Affects which currency is shown on pricing pages" last>
                  <div className="s-region-btns" style={{ display: 'flex', gap: 8 }}>
                    {[{ key: 'eg', label: 'Egypt (EGP)' }, { key: 'intl', label: 'International (USD)' }].map(r => (
                      <button key={r.key} onClick={() => setRegion(r.key)}
                        style={{ padding: '8px 14px', borderRadius: 8, border: `2px solid ${region === r.key ? 'var(--accent)' : 'var(--border)'}`, background: region === r.key ? 'var(--accent-bg)' : 'var(--bg3)', color: region === r.key ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontSize: 12, fontWeight: region === r.key ? 700 : 500 }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </Row>
              </Section>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {active === 'notifications' && (
            <Section title="Notifications" icon={<Bell size={14} strokeWidth={2} />}>
              <Row label="Email Notifications" desc="Receive important account updates and alerts by email">
                <Toggle value={emailNotif} onChange={updateEmailNotif} />
              </Row>
              <Row label="Video Ready Alerts" desc="Get notified when your video finishes rendering">
                <Toggle value={videoReady} onChange={updateVideoReady} />
              </Row>
              <Row label="Product Updates" desc="News about new features, AI models, and improvements" last>
                <Toggle value={newsletter} onChange={updateNewsletter} />
              </Row>
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.15)', borderRadius: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <Mail size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} /> Notifications are sent to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>. Changes are saved automatically.
                </p>
              </div>
            </Section>
          )}

          {/* ── SECURITY ── */}
          {active === 'security' && (
            <div>
              <Section title="Change Password" icon={<Lock size={14} strokeWidth={2} />}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>New Password</label>
                    <input type="password" placeholder="Min. 6 characters" value={newPw} onChange={e => setNewPw(e.target.value)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Confirm Password</label>
                    <input type="password" placeholder="Repeat new password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {pwStatus.startsWith('error:') && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{pwStatus.slice(6)}</p>}
                  {pwStatus === 'success' && <p style={{ color: '#22c55e', fontSize: 13, margin: 0 }}>Password updated successfully!</p>}
                  <button onClick={handleChangePw} disabled={!newPw || !confirmPw || pwStatus === 'loading'}
                    style={{ ...btnStyle(), opacity: !newPw || !confirmPw ? 0.5 : 1 }}>
                    {pwStatus === 'loading' ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </Section>

              <Section title="Active Session" icon={<Monitor size={14} strokeWidth={2} />}>
                <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Current Session</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Browser — {new Date().toLocaleDateString('en-GB')}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>Active</span>
                </div>
                <button onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
                  style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <LogOut size={14} strokeWidth={2} /> Sign Out
                </button>
              </Section>
            </div>
          )}

          {active === 'developer' && (
            <div>
              <Section title="Connect via MCP (Claude, etc.)" icon={<Plug size={14} strokeWidth={2} />}>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, margin: '0 0 14px' }}>
                  Add Erivion as an MCP connector in Claude.ai, Claude Desktop, or Claude Code to generate videos directly from your conversations. Paste this URL when adding a custom connector, and use one of your API keys below for authentication.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input readOnly value={MCP_URL}
                    style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, fontFamily: 'monospace', outline: 'none' }} />
                  <button onClick={() => copyToClipboard(MCP_URL, setCopiedUrl)}
                    style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {copiedUrl ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />} {copiedUrl ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </Section>

              <Section title="Upload video, get link" icon={<Film size={14} strokeWidth={2} />}>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, margin: '0 0 14px' }}>
                  MCP tools (like in Claude) can't accept an uploaded file directly — they can only work with a public link. Upload your video here (max 15 seconds, or 60 seconds if you tick the character-swap option) to get a direct link, then paste that link when asking Claude to edit your video or to put a character into it.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', margin: '0 0 12px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={videoLinkForSwap} onChange={(e) => setVideoLinkForSwap(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                  This video is for a character swap (up to 60 seconds)
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {videoLinkUploading ? <Loader2 size={14} className="spinning" /> : <Film size={14} strokeWidth={2} />} {videoLinkUploading ? 'Uploading...' : 'Choose video file'}
                  <input type="file" accept="video/*" onChange={handleVideoLinkUpload} disabled={videoLinkUploading} style={{ display: 'none' }} />
                </label>

                {videoLinkError && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#f87171', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={14} strokeWidth={2} /> {videoLinkError}
                  </div>
                )}

                {videoLinkResult && (
                  <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#22c55e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} strokeWidth={2.5} /> Uploaded ({videoLinkResult.durationSec}s) — copy this link
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input readOnly value={videoLinkResult.videoUrl}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
                      <button onClick={() => copyToClipboard(videoLinkResult.videoUrl, setCopiedVideoLink)}
                        style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {copiedVideoLink ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />} {copiedVideoLink ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </Section>

              <Section title="Upload image, get link" icon={<ImageIcon size={14} strokeWidth={2} />}>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, margin: '0 0 14px' }}>
                  MCP tools (like in Claude) can't accept an attached photo directly — they can only work with a public link. Upload a photo here to get a direct link, then paste that link when asking Claude to animate it into a video.
                </p>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                  {imageLinkUploading ? <Loader2 size={14} className="spinning" /> : <ImageIcon size={14} strokeWidth={2} />} {imageLinkUploading ? 'Uploading...' : 'Choose image file'}
                  <input type="file" accept="image/*" onChange={handleImageLinkUpload} disabled={imageLinkUploading} style={{ display: 'none' }} />
                </label>

                {imageLinkError && (
                  <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#f87171', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={14} strokeWidth={2} /> {imageLinkError}
                  </div>
                )}

                {imageLinkResult && (
                  <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#22c55e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} strokeWidth={2.5} /> Uploaded — copy this link
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input readOnly value={imageLinkResult.imageUrl}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
                      <button onClick={() => copyToClipboard(imageLinkResult.imageUrl, setCopiedImageLink)}
                        style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {copiedImageLink ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />} {copiedImageLink ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </Section>

              <Section title="API Keys" icon={<Key size={14} strokeWidth={2} />}>
                <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, margin: '0 0 14px' }}>
                  API keys let external tools (like the MCP connector above) act on your Erivion account — generating videos and spending your credits. Treat them like passwords.
                </p>

                {freshKey && (
                  <div style={{ padding: '14px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, marginBottom: 16 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#22c55e', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} strokeWidth={2.5} /> Key created — copy it now, you won't see it again
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input readOnly value={freshKey}
                        style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 12.5, fontFamily: 'monospace', outline: 'none' }} />
                      <button onClick={() => copyToClipboard(freshKey, setCopiedKey)}
                        style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {copiedKey ? <Check size={13} strokeWidth={2.5} /> : <Copy size={13} strokeWidth={2} />} {copiedKey ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input placeholder="Key name (e.g. Claude Desktop)" value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                    style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
                  <button onClick={handleGenerateKey} disabled={generatingKey} style={{ ...btnStyle(), whiteSpace: 'nowrap' }}>
                    {generatingKey ? 'Generating...' : '+ Generate Key'}
                  </button>
                </div>

                {apiKeysLoading && <p style={{ fontSize: 13, color: 'var(--text3)' }}>Loading...</p>}
                {!apiKeysLoading && apiKeys.length === 0 && (
                  <p style={{ fontSize: 13, color: 'var(--text3)' }}>No API keys yet.</p>
                )}
                {apiKeys.map(k => (
                  <div key={k.id} style={{ padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{k.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2, fontFamily: 'monospace' }}>{k.key_prefix}</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        Created {new Date(k.created_at).toLocaleDateString()}
                        {k.last_used_at ? ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}` : ' · Never used'}
                      </div>
                    </div>
                    <button onClick={() => handleRevokeKey(k.id)}
                      style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#f87171', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      Revoke
                    </button>
                  </div>
                ))}
              </Section>
            </div>
          )}

          {/* ── DANGER ZONE ── */}
          {active === 'danger' && (
            <Section title="Danger Zone" icon={<AlertTriangle size={14} strokeWidth={2} />} danger>

              {/* Delete account — done state */}
              {deleteStep === 'done' ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', color: 'var(--text3)' }}><Check size={48} strokeWidth={1.5} /></div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Account Deleted</h3>
                  <p style={{ color: 'var(--text3)', fontSize: 14 }}>Your account has been permanently deleted. Redirecting...</p>
                </div>

              ) : (
                <>
                  {/* Export data */}
                  <div className="s-export-row" style={{ padding: 16, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}><Package size={14} strokeWidth={2} /> Export My Data</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Request a copy of all your account data</div>
                    </div>
                    <button onClick={() => window.location.href = `mailto:digidelight33@gmail.com?subject=Data Export Request&body=Email: ${user?.email}`}
                      style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      Request
                    </button>
                  </div>

                  {/* Delete account */}
                  <div style={{ padding: 16, background: 'rgba(248,113,113,0.05)', borderRadius: 12, border: '1px solid rgba(248,113,113,0.2)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Trash2 size={14} strokeWidth={2} /> Delete Account</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
                      This will permanently delete your account, all your videos, and all data. <strong style={{ color: '#f87171' }}>This cannot be undone.</strong>
                    </div>

                    {deleteStep === 'idle' && (
                      <button onClick={() => setDeleteStep('confirm')}
                        style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                        Delete My Account
                      </button>
                    )}

                    {deleteStep === 'confirm' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ padding: '12px 16px', background: 'rgba(248,113,113,0.08)', borderRadius: 10, border: '1px solid rgba(248,113,113,0.2)' }}>
                          <p style={{ fontSize: 13, color: '#f87171', margin: '0 0 4px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} strokeWidth={2} /> Are you absolutely sure?</p>
                          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Type <strong style={{ color: '#fff' }}>DELETE</strong> below to confirm permanently deleting your account.</p>
                        </div>
                        <input
                          value={deleteInput}
                          onChange={e => setDeleteInput(e.target.value)}
                          placeholder='Type "DELETE" to confirm'
                          style={{ padding: '11px 14px', borderRadius: 9, border: `1px solid ${deleteInput === 'DELETE' ? '#ef4444' : 'rgba(248,113,113,0.3)'}`, background: 'rgba(248,113,113,0.05)', color: '#f87171', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                        />
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => { setDeleteStep('idle'); setDeleteInput(''); }}
                            style={{ flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                            Cancel
                          </button>
                          <button
                            disabled={deleteInput !== 'DELETE' || deleteStep === 'loading'}
                            onClick={handleDeleteAccount}
                            style={{ flex: 1, padding: '11px', borderRadius: 9, border: 'none', background: deleteInput === 'DELETE' ? '#ef4444' : 'rgba(248,113,113,0.15)', color: deleteInput === 'DELETE' ? '#fff' : '#6b7280', cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 13, transition: 'all 0.2s' }}>
                            {deleteStep === 'loading' ? 'Deleting...' : 'Yes, Delete Forever'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Section>
          )}

        </div>
      </div>
    </div>
  );
}