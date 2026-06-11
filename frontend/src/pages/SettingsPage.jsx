import React, { useState, useEffect } from 'react';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

function SettingSection({ title, icon, children }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 16 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, color = '#7c6af7' }) {
  return (
    <div onClick={() => onChange(!value)}
      style={{ width: 44, height: 24, borderRadius: 999, background: value ? color : 'var(--bg4)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
    </div>
  );
}

function SettingRow({ label, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: desc ? 2 : 0 }}>{label}</div>
        {desc && <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function SettingsPage({ onBack, user, onNavigate }) {
  // Password
  const [newPassword, setNewPassword]     = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwStatus, setPwStatus]           = useState('');

  // Profile
  const [displayName, setDisplayName]     = useState(user?.name || '');
  const [nameStatus, setNameStatus]       = useState('');

  // Appearance
  const [theme, setTheme]                 = useState(() => localStorage.getItem('erivion_theme') || 'dark');
  const [accentColor, setAccentColor]     = useState(() => localStorage.getItem('erivion_accent') || '#7c6af7');

  // Language
  const [uiLang, setUiLang]               = useState(() => localStorage.getItem('erivion_ui_lang') || 'en');

  // Notifications
  const [emailNotif, setEmailNotif]       = useState(() => localStorage.getItem('erivion_notif_email') !== 'false');
  const [videoReady, setVideoReady]       = useState(() => localStorage.getItem('erivion_notif_video') !== 'false');
  const [newsletter, setNewsletter]       = useState(() => localStorage.getItem('erivion_notif_news') === 'true');

  // Video Defaults
  const [defRatio, setDefRatio]           = useState(() => localStorage.getItem('erivion_def_ratio') || '9:16');
  const [defLang, setDefLang]             = useState(() => localStorage.getItem('erivion_def_lang') || 'ar-eg');
  const [defCaptions, setDefCaptions]     = useState(() => localStorage.getItem('erivion_def_captions') !== 'false');
  const [defMusic, setDefMusic]           = useState(() => localStorage.getItem('erivion_def_music') !== 'false');

  // Region
  const [region, setRegion]               = useState(() => localStorage.getItem('erivion_region') || 'eg');

  // Danger
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDelete, setShowDelete]       = useState(false);

  // Active section (sidebar nav)
  const [activeSection, setActiveSection] = useState('profile');

  // ── Persist to localStorage ──
  useEffect(() => { localStorage.setItem('erivion_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('erivion_accent', accentColor); }, [accentColor]);
  useEffect(() => { localStorage.setItem('erivion_ui_lang', uiLang); }, [uiLang]);
  useEffect(() => { localStorage.setItem('erivion_notif_email', emailNotif); }, [emailNotif]);
  useEffect(() => { localStorage.setItem('erivion_notif_video', videoReady); }, [videoReady]);
  useEffect(() => { localStorage.setItem('erivion_notif_news', newsletter); }, [newsletter]);
  useEffect(() => { localStorage.setItem('erivion_def_ratio', defRatio); }, [defRatio]);
  useEffect(() => { localStorage.setItem('erivion_def_lang', defLang); }, [defLang]);
  useEffect(() => { localStorage.setItem('erivion_def_captions', defCaptions); }, [defCaptions]);
  useEffect(() => { localStorage.setItem('erivion_def_music', defMusic); }, [defMusic]);
  useEffect(() => { localStorage.setItem('erivion_region', region); }, [region]);

  // ── Handlers ──
  const handleChangePassword = async () => {
    if (newPassword.length < 6) return setPwStatus('error:Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return setPwStatus('error:Passwords do not match');
    setPwStatus('loading');
    try {
      const res = await fetch('/api/auth/change-password', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ newPassword }) });
      if (res.ok) { setPwStatus('success'); setNewPassword(''); setConfirmPassword(''); }
      else setPwStatus('error:Failed to update password');
    } catch { setPwStatus('error:Something went wrong'); }
  };

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setNameStatus('loading');
    try {
      const res = await fetch('/api/auth/update-profile', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: displayName }) });
      if (res.ok) setNameStatus('success');
      else setNameStatus('error');
    } catch { setNameStatus('error'); }
    setTimeout(() => setNameStatus(''), 3000);
  };

  // ── Nav items ──
  const NAV = [
    { key: 'profile',       icon: '👤', label: 'Profile' },
    { key: 'appearance',    icon: '🎨', label: 'Appearance' },
    { key: 'language',      icon: '🌐', label: 'Language & Region' },
    { key: 'notifications', icon: '🔔', label: 'Notifications' },
    { key: 'video',         icon: '🎬', label: 'Video Defaults' },
    { key: 'security',      icon: '🔒', label: 'Security' },
    { key: 'danger',        icon: '⚠️', label: 'Danger Zone' },
  ];

  const ACCENTS = ['#7c6af7', '#06b6d4', '#22c55e', '#f59e0b', '#e11d48', '#8b5cf6', '#ec4899', '#f97316'];

  const SelectBox = ({ value, onChange, options }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, outline: 'none', cursor: 'pointer', minWidth: 140 }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .settings-content { animation: fadeIn 0.25s ease; }
        .nav-item { transition: all 0.15s ease !important; }
        .nav-item:hover { background: var(--bg3) !important; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, background: 'var(--bg2)' }}>
        <button onClick={onBack} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text3)', cursor: 'pointer', fontSize: 13, padding: '7px 14px', fontWeight: 600 }}>
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>⚙️ Settings</h1>
          <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Manage your account & preferences</p>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, maxWidth: 1000, margin: '0 auto', width: '100%', padding: '24px 20px', gap: 24 }}>

        {/* Sidebar */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', position: 'sticky', top: 24 }}>
            {NAV.map(item => (
              <button key={item.key} className="nav-item"
                onClick={() => setActiveSection(item.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: activeSection === item.key ? 'var(--accent-bg)' : 'transparent', border: 'none', borderLeft: `3px solid ${activeSection === item.key ? 'var(--accent)' : 'transparent'}`, color: activeSection === item.key ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontSize: 13, fontWeight: activeSection === item.key ? 700 : 500, textAlign: 'left' }}>
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }} className="settings-content" key={activeSection}>

          {/* ── PROFILE ── */}
          {activeSection === 'profile' && (
            <div>
              <SettingSection title="Profile Information" icon="👤">
                {/* Avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent-bg)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{user?.name || 'No name set'}</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{user?.email}</div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 600, background: 'var(--accent-bg)', display: 'inline-block', padding: '2px 10px', borderRadius: 999 }}>
                      {user?.plan ? user.plan.toUpperCase() : 'FREE'} Plan
                    </div>
                  </div>
                </div>

                {/* Display Name */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>Display Name</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name"
                      style={{ flex: 1, padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
                    <button onClick={handleSaveName} disabled={nameStatus === 'loading'}
                      style={{ padding: '11px 20px', borderRadius: 10, background: nameStatus === 'success' ? '#22c55e' : 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {nameStatus === 'loading' ? '⏳' : nameStatus === 'success' ? '✅ Saved' : nameStatus === 'error' ? '❌ Failed' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Email (read-only) */}
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 8 }}>Email Address</label>
                  <div style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)', fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {user?.email}
                    <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg4)', padding: '2px 8px', borderRadius: 6 }}>Read-only</span>
                  </div>
                </div>
              </SettingSection>

              {/* Subscription */}
              <SettingSection title="Subscription" icon="💳">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                      {user?.plan ? user.plan.toUpperCase() : 'Free'} Plan
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                      {user?.plan_expires_at ? `Expires: ${new Date(user.plan_expires_at).toLocaleDateString('en-GB')}` : 'No active subscription'}
                    </div>
                  </div>
                  <button onClick={() => onNavigate && onNavigate('pricing')}
                    style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                    {user?.plan && user.plan !== 'free' ? 'Manage Plan' : 'Upgrade ✨'}
                  </button>
                </div>
              </SettingSection>
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {activeSection === 'appearance' && (
            <SettingSection title="Appearance" icon="🎨">
              {/* Theme */}
              <SettingRow label="Theme" desc="Choose the overall look of the interface">
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ key: 'dark', label: '🌙 Dark' }, { key: 'light', label: '☀️ Light' }].map(t => (
                    <button key={t.key} onClick={() => setTheme(t.key)}
                      style={{ padding: '8px 16px', borderRadius: 8, border: `2px solid ${theme === t.key ? 'var(--accent)' : 'var(--border)'}`, background: theme === t.key ? 'var(--accent-bg)' : 'var(--bg3)', color: theme === t.key ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontSize: 13, fontWeight: theme === t.key ? 700 : 500 }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </SettingRow>

              {/* Accent Color */}
              <SettingRow label="Accent Color" desc="Personalize your interface color">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ACCENTS.map(c => (
                    <button key={c} onClick={() => setAccentColor(c)}
                      style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: `3px solid ${accentColor === c ? '#fff' : 'transparent'}`, cursor: 'pointer', outline: accentColor === c ? `2px solid ${c}` : 'none', transition: 'all 0.15s' }} />
                  ))}
                </div>
              </SettingRow>

              {/* Preview */}
              <div style={{ marginTop: 16, padding: 16, background: 'var(--bg3)', borderRadius: 12, border: '1px solid var(--border)' }}>
                <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 10px', fontWeight: 600 }}>PREVIEW</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button style={{ padding: '9px 18px', borderRadius: 8, background: accentColor, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'default' }}>Primary Button</button>
                  <button style={{ padding: '9px 18px', borderRadius: 8, background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}44`, fontWeight: 700, fontSize: 13, cursor: 'default' }}>Secondary</button>
                </div>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 14, fontStyle: 'italic' }}>
                💡 Full theme switching coming soon — preferences are saved now.
              </p>
            </SettingSection>
          )}

          {/* ── LANGUAGE & REGION ── */}
          {activeSection === 'language' && (
            <div>
              <SettingSection title="Language & Region" icon="🌐">
                <SettingRow label="Interface Language" desc="Language for menus, buttons, and labels">
                  <SelectBox value={uiLang} onChange={setUiLang} options={[
                    { value: 'en',    label: '🇺🇸 English' },
                    { value: 'ar',    label: '🇸🇦 العربية' },
                    { value: 'ar-eg', label: '🇪🇬 العربية (مصري)' },
                    { value: 'fr',    label: '🇫🇷 Français' },
                    { value: 'de',    label: '🇩🇪 Deutsch' },
                  ]} />
                </SettingRow>

                <SettingRow label="Pricing Region" desc="Affects which currency is shown on pricing pages">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ key: 'eg', label: '🇪🇬 Egypt (EGP)' }, { key: 'intl', label: '🌐 International (USD)' }].map(r => (
                      <button key={r.key} onClick={() => setRegion(r.key)}
                        style={{ padding: '8px 14px', borderRadius: 8, border: `2px solid ${region === r.key ? 'var(--accent)' : 'var(--border)'}`, background: region === r.key ? 'var(--accent-bg)' : 'var(--bg3)', color: region === r.key ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontSize: 12, fontWeight: region === r.key ? 700 : 500 }}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="Time Zone" desc="Used for scheduling and timestamps">
                  <SelectBox value="africa/cairo" onChange={() => {}} options={[
                    { value: 'africa/cairo',   label: '🕐 Cairo (GMT+2)' },
                    { value: 'europe/london',  label: '🕐 London (GMT+0)' },
                    { value: 'america/new_york', label: '🕐 New York (GMT-5)' },
                    { value: 'asia/dubai',     label: '🕐 Dubai (GMT+4)' },
                  ]} />
                </SettingRow>
              </SettingSection>

              <SettingSection title="Content Language" icon="🗣️">
                <SettingRow label="Default Video Language" desc="Pre-selected language when creating videos">
                  <SelectBox value={defLang} onChange={setDefLang} options={[
                    { value: 'ar-eg', label: '🇪🇬 Egyptian Arabic' },
                    { value: 'ar',    label: '🇸🇦 Arabic (Gulf)' },
                    { value: 'en',    label: '🇺🇸 English (US)' },
                    { value: 'en-gb', label: '🇬🇧 English (UK)' },
                    { value: 'fr',    label: '🇫🇷 French' },
                    { value: 'de',    label: '🇩🇪 German' },
                  ]} />
                </SettingRow>
              </SettingSection>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {activeSection === 'notifications' && (
            <SettingSection title="Notifications" icon="🔔">
              <SettingRow label="Email Notifications" desc="Receive important account updates by email">
                <Toggle value={emailNotif} onChange={setEmailNotif} />
              </SettingRow>
              <SettingRow label="Video Ready Alerts" desc="Get notified when your video finishes rendering">
                <Toggle value={videoReady} onChange={setVideoReady} />
              </SettingRow>
              <SettingRow label="Product Updates" desc="News about new features, models, and improvements">
                <Toggle value={newsletter} onChange={setNewsletter} color="#22c55e" />
              </SettingRow>

              <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.15)', borderRadius: 10 }}>
                <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0, lineHeight: 1.6 }}>
                  📧 Notifications are sent to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>. Preferences are saved automatically.
                </p>
              </div>
            </SettingSection>
          )}

          {/* ── VIDEO DEFAULTS ── */}
          {activeSection === 'video' && (
            <div>
              <SettingSection title="Video Defaults" icon="🎬">
                <SettingRow label="Default Aspect Ratio" desc="Pre-selected ratio when creating a new video">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['9:16', '16:9', '1:1'].map(r => (
                      <button key={r} onClick={() => setDefRatio(r)}
                        style={{ padding: '7px 14px', borderRadius: 8, border: `2px solid ${defRatio === r ? 'var(--accent)' : 'var(--border)'}`, background: defRatio === r ? 'var(--accent-bg)' : 'var(--bg3)', color: defRatio === r ? 'var(--accent)' : 'var(--text3)', cursor: 'pointer', fontSize: 13, fontWeight: defRatio === r ? 700 : 500 }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </SettingRow>

                <SettingRow label="Auto-enable Captions" desc="Captions will be on by default for every new video">
                  <Toggle value={defCaptions} onChange={setDefCaptions} />
                </SettingRow>

                <SettingRow label="Auto-enable Music" desc="Background music will be on by default">
                  <Toggle value={defMusic} onChange={setDefMusic} />
                </SettingRow>
              </SettingSection>

              <SettingSection title="Storage & Usage" icon="💾">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[
                    { label: 'Video History', desc: 'Your generated videos are stored for 30 days', icon: '🎬' },
                    { label: 'Auto-save Drafts', desc: 'Scenes and scripts are saved automatically', icon: '📝' },
                    { label: 'Clear Cache', desc: 'Remove locally stored preferences and temp data', icon: '🗑️', action: () => { ['erivion_theme','erivion_accent','erivion_ui_lang'].forEach(k => localStorage.removeItem(k)); alert('Cache cleared!'); } },
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{item.icon} {item.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{item.desc}</div>
                      </div>
                      {item.action && (
                        <button onClick={item.action} style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Clear</button>
                      )}
                    </div>
                  ))}
                </div>
              </SettingSection>
            </div>
          )}

          {/* ── SECURITY ── */}
          {activeSection === 'security' && (
            <div>
              <SettingSection title="Change Password" icon="🔒">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>New Password</label>
                    <input type="password" placeholder="Min. 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', display: 'block', marginBottom: 6 }}>Confirm New Password</label>
                    <input type="password" placeholder="Repeat password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {pwStatus.startsWith('error:') && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>❌ {pwStatus.slice(6)}</p>}
                  {pwStatus === 'success' && <p style={{ color: '#22c55e', fontSize: 13, margin: 0 }}>✅ Password updated successfully!</p>}
                  <button onClick={handleChangePassword} disabled={!newPassword || !confirmPassword || pwStatus === 'loading'}
                    style={{ padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (!newPassword || !confirmPassword) ? 0.6 : 1 }}>
                    {pwStatus === 'loading' ? '⏳ Updating...' : '🔒 Update Password'}
                  </button>
                </div>
              </SettingSection>

              <SettingSection title="Active Sessions" icon="🖥️">
                <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>🟢 Current Session</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Browser — {new Date().toLocaleDateString('en-GB')}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>Active</span>
                </div>
                <button onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}
                  style={{ width: '100%', marginTop: 12, padding: '11px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                  🚪 Sign Out of All Sessions
                </button>
              </SettingSection>

              <SettingSection title="Connected Accounts" icon="🔗">
                <div style={{ padding: '14px 16px', background: 'var(--bg3)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 24 }}>🔵</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Google Account</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{user?.google_id ? user.email : 'Not connected'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: user?.google_id ? '#22c55e' : 'var(--text3)', background: user?.google_id ? 'rgba(34,197,94,0.1)' : 'var(--bg4)', padding: '3px 10px', borderRadius: 999, fontWeight: 700 }}>
                    {user?.google_id ? 'Connected' : 'Not linked'}
                  </span>
                </div>
              </SettingSection>
            </div>
          )}

          {/* ── DANGER ZONE ── */}
          {activeSection === 'danger' && (
            <div style={{ background: 'rgba(248,113,113,0.04)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 16, padding: 24 }}>
              <h3 style={{ fontSize: 11, fontWeight: 700, color: '#f87171', marginBottom: 20, textTransform: 'uppercase', letterSpacing: '0.08em' }}>⚠️ Danger Zone</h3>

              {/* Export Data */}
              <div style={{ padding: '16px', background: 'var(--bg2)', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>📦 Export My Data</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Download all your account data and videos</div>
                </div>
                <button onClick={() => window.location.href = 'mailto:digidelight33@gmail.com?subject=Data Export Request'}
                  style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  Request Export
                </button>
              </div>

              {/* Delete Account */}
              <div style={{ padding: '16px', background: 'rgba(248,113,113,0.05)', borderRadius: 12, border: '1px solid rgba(248,113,113,0.25)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#f87171', marginBottom: 4 }}>🗑️ Delete Account</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
                  Permanently delete your account and all associated data. This action cannot be undone.
                </div>
                {!showDelete ? (
                  <button onClick={() => setShowDelete(true)}
                    style={{ padding: '10px 20px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                    Delete My Account
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>Type <strong>DELETE</strong> to confirm:</p>
                    <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} placeholder="Type DELETE here"
                      style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.05)', color: '#f87171', fontSize: 13, outline: 'none' }} />
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setShowDelete(false)}
                        style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Cancel
                      </button>
                      <button disabled={deleteConfirm !== 'DELETE'}
                        onClick={() => window.location.href = 'mailto:digidelight33@gmail.com?subject=Account Deletion Request&body=Please delete my account: ' + user?.email}
                        style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: deleteConfirm === 'DELETE' ? '#ef4444' : 'rgba(248,113,113,0.2)', color: deleteConfirm === 'DELETE' ? '#fff' : '#6b7280', cursor: deleteConfirm === 'DELETE' ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700 }}>
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}