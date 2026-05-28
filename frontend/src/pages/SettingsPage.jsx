import React, { useState } from 'react';
import { AppFooter } from './LandingPage.jsx';

export default function SettingsPage({ onBack, user }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState('');

  const handleChangePassword = async () => {
    if (newPassword.length < 6) return setStatus('error:Password must be at least 6 characters');
    if (newPassword !== confirmPassword) return setStatus('error:Passwords do not match');
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') },
        body: JSON.stringify({ newPassword }),
      });
      if (res.ok) { setStatus('success'); setNewPassword(''); setConfirmPassword(''); }
      else setStatus('error:Failed to update password');
    } catch { setStatus('error:Something went wrong'); }
  };

  const isError = status.startsWith('error:');
  const errMsg = isError ? status.slice(6) : '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, marginBottom: 32, padding: 0 }}>
          ← Back
        </button>

        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>⚙️ Settings</h1>
        <p style={{ fontSize: 14, color: 'var(--text3)', marginBottom: 36 }}>Manage your account preferences</p>

        {/* Account Info */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>ACCOUNT</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
              {(user?.email || 'U')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{user?.email}</div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>Erivion Account</div>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>CHANGE PASSWORD</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" placeholder="New password (min. 6 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
            <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
            {isError && <p style={{ color: 'var(--red)', fontSize: 13 }}>{errMsg}</p>}
            {status === 'success' && <p style={{ color: 'var(--green)', fontSize: 13 }}>✅ Password updated successfully!</p>}
            <button onClick={handleChangePassword} disabled={!newPassword || !confirmPassword || status === 'loading'}
              style={{ padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: (!newPassword || !confirmPassword) ? 0.6 : 1 }}>
              {status === 'loading' ? '⏳ Updating...' : 'Update Password'}
            </button>
          </div>
        </div>

{/* Danger Zone */}
        <div style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 16, padding: 24 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, color: 'var(--red)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>DANGER ZONE</h3>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
            To delete your account or request your data, please contact us at <a href="mailto:digidelight33@gmail.com" style={{ color: 'var(--accent2)' }}>digidelight33@gmail.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}