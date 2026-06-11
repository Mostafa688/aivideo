import React, { useState, useEffect } from 'react';

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
    { key: 'profile',       icon: '👤', label: 'Profile' },
    { key: 'notifications', icon: '🔔', label: 'Notifications' },
    { key: 'security',      icon: '🔒', label: 'Security' },
    { key: 'danger',        icon: '⚠️',  label: 'Danger Zone' },
  ];

  const [active, setActive]               = useState('profile');

  // Profile
  const [displayName, setDisplayName]     = useState(user?.name || '');
  const [nameStatus, setNameStatus]       = useState(''); // '' | 'loading' | 'success' | 'error'

  // Notifications
  const [emailNotif, setEmailNotif]       = useState(() => localStorage.getItem('erivion_notif_email') !== 'false');
  const [videoReady, setVideoReady]       = useState(() => localStorage.getItem('erivion_notif_video') !== 'false');
  const [newsletter, setNewsletter]       = useState(() => localStorage.getItem('erivion_notif_news') === 'true');

  // Region
  const [region, setRegion]               = useState(() => localStorage.getItem('erivion_region') || 'eg');

  // Password
  const [newPw, setNewPw]                 = useState('');
  const [confirmPw, setConfirmPw]         = useState('');
  const [pwStatus, setPwStatus]           = useState('');

  // Delete account
  const [deleteStep, setDeleteStep]       = useState('idle'); // 'idle' | 'confirm' | 'loading' | 'done'
  const [deleteInput, setDeleteInput]     = useState('');

  // persist notifications & region
  useEffect(() => { localStorage.setItem('erivion_notif_email', emailNotif); }, [emailNotif]);
  useEffect(() => { localStorage.setItem('erivion_notif_video', videoReady); }, [videoReady]);
  useEffect(() => { localStorage.setItem('erivion_notif_news',  newsletter);  }, [newsletter]);
  useEffect(() => { localStorage.setItem('erivion_region', region); }, [region]);

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
          .s-nav-btn { flex-shrink: 0 !important; padding: 10px 14px !important; border-left: none !important; border-bottom: 3px solid transparent !important; white-space: nowrap !important; }
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
          <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>⚙️ Settings</h1>
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
                <span style={{ fontSize: 15 }}>{item.icon}</span> {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }} className="s-content" key={active}>

          {/* ── PROFILE ── */}
          {active === 'profile' && (
            <div>
              <Section title="Profile Information" icon="👤">
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
                      {nameStatus === 'loading' ? '⏳' : nameStatus === 'success' ? '✅ Saved' : nameStatus === 'error' ? '❌ Failed' : 'Save'}
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
              <Section title="Subscription" icon="💳">
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
                    {user?.plan && user.plan !== 'free' ? 'Manage Plan' : 'Upgrade ✨'}
                  </button>
                </div>
              </Section>

              {/* Pricing Region */}
              <Section title="Pricing Region" icon="🌍">
                <Row label="Your Region" desc="Affects which currency is shown on pricing pages" last>
                  <div className="s-region-btns" style={{ display: 'flex', gap: 8 }}>
                    {[{ key: 'eg', label: '🇪🇬 Egypt (EGP)' }, { key: 'intl', label: '🌐 International (USD)' }].map(r => (
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
            <Section title="Notifications" icon="🔔">
              <Row label="Email Notifications" desc="Receive important account updates and alerts by email">
                <Toggle value={emailNotif} onChange={setEmailNotif} />
              </Row>
              <Row label="Video Ready Alerts" desc="Get notified when your video finishes rendering">
                <Toggle value={videoReady} onChange={setVideoReady} />
              </Row>
              <Row label="Product Updates" desc="News about new features, AI models, and improvements" last>
                <Toggle value={newsletter} onChange={setNewsletter} />
              </Row>
              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.15)', borderRadius: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0, lineHeight: 1.6 }}>
                  📧 Notifications are sent to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>. Changes are saved automatically.
                </p>
              </div>
            </Section>
          )}

          {/* ── SECURITY ── */}
          {active === 'security' && (
            <div>
              <Section title="Change Password" icon="🔒">
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
                  {pwStatus.startsWith('error:') && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>❌ {pwStatus.slice(6)}</p>}
                  {pwStatus === 'success' && <p style={{ color: '#22c55e', fontSize: 13, margin: 0 }}>✅ Password updated successfully!</p>}
                  <button onClick={handleChangePw} disabled={!newPw || !confirmPw || pwStatus === 'loading'}
                    style={{ ...btnStyle(), opacity: !newPw || !confirmPw ? 0.5 : 1 }}>
                    {pwStatus === 'loading' ? '⏳ Updating...' : '🔒 Update Password'}
                  </button>
                </div>
              </Section>

              <Section title="Active Session" icon="🖥️">
                <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>🟢 Current Session</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Browser — {new Date().toLocaleDateString('en-GB')}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>Active</span>
                </div>
                <button onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
                  style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  🚪 Sign Out
                </button>
              </Section>
            </div>
          )}

          {/* ── DANGER ZONE ── */}
          {active === 'danger' && (
            <Section title="Danger Zone" icon="⚠️" danger>

              {/* Delete account — done state */}
              {deleteStep === 'done' ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: 56, marginBottom: 16 }}>👋</div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Account Deleted</h3>
                  <p style={{ color: 'var(--text3)', fontSize: 14 }}>Your account has been permanently deleted. Redirecting...</p>
                </div>

              ) : (
                <>
                  {/* Export data */}
                  <div className="s-export-row" style={{ padding: 16, background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>📦 Export My Data</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>Request a copy of all your account data</div>
                    </div>
                    <button onClick={() => window.location.href = `mailto:digidelight33@gmail.com?subject=Data Export Request&body=Email: ${user?.email}`}
                      style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                      Request
                    </button>
                  </div>

                  {/* Delete account */}
                  <div style={{ padding: 16, background: 'rgba(248,113,113,0.05)', borderRadius: 12, border: '1px solid rgba(248,113,113,0.2)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f87171', marginBottom: 4 }}>🗑️ Delete Account</div>
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
                          <p style={{ fontSize: 13, color: '#f87171', margin: '0 0 4px', fontWeight: 700 }}>⚠️ Are you absolutely sure?</p>
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
                            {deleteStep === 'loading' ? '⏳ Deleting...' : '🗑️ Yes, Delete Forever'}
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