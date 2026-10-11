import React, { useState, useEffect, useCallback } from 'react';
import TimelineEditor from '../components/AudioVideoTimelineEditor.jsx';
import { downloadRemoteFile } from '../utils/download.js';

// ✅ FIX (باج أمان خطير حقيقي): كان في سر أدمن ثابت (VITE_ADMIN_SECRET أو fallback هاردكودد
// 'Sosa6892Midbok') متضمّن حرفيًا هنا — أي متغيّر بادئته VITE_ بيتحط كنص خام جوه ملف الـJS
// النهائي اللي بيوصل لأي زائر عادي (view-source/devtools)، يعني أي حد يقدر يجيب السر الحقيقي
// المستخدم على الموقع الحي ويدخل صفحة الأدمن كاملة. دلوقتي مفيش أي سر حقيقي متخزن في
// الفرونت إند خالص — بس توكن جلسة (JWT) قصير العمر بيتصدر من السيرفر بعد تسجيل دخول حقيقي
// بإيميل (من قايمة أدمن محددة) + باسورد، راجع adminAuthMiddleware.js في الباك إند للتفاصيل
let adminToken = null;
try { adminToken = sessionStorage.getItem('erivion_admin_token') || null; } catch { /* ignore */ }

// ✅ FIX (طلب العميل: "حسّن من شكل الصفحة"): كانت MOBILE_CSS معرّفة بس مش متعرضة في أي مكان
// خالص (مفيش <style>{MOBILE_CSS}</style> في الـJSX) — يعني كل قواعد الموبايل دي كانت كود ميت
// من يوم ما اتكتبت، وده سبب حقيقي وراء إن صفحة الأدمن كانت شكلها متكسر على الموبايل. دلوقتي
// بتتعرض فعليًا (دور على ADMIN_CSS تحت)، مع تحسينات شكل عامة (hover/focus/scrollbar) وألوان
// وخطوط متسقة مع نظام التصميم الحقيقي المستخدم في باقي الموقع (frontend/src/styles/global.css)
const ADMIN_CSS = `
  .admin-root button:not(:disabled) { cursor: pointer; transition: filter .15s ease, transform .05s ease; }
  .admin-root button:not(:disabled):hover { filter: brightness(1.14); }
  .admin-root button:not(:disabled):active { transform: scale(0.96); }
  .admin-root button:disabled { cursor: not-allowed; }

  .admin-root input, .admin-root select, .admin-root textarea {
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  .admin-root input:focus, .admin-root select:focus, .admin-root textarea:focus {
    border-color: var(--accent) !important;
    box-shadow: 0 0 0 3px var(--accent-bg);
    outline: none;
  }

  .admin-root table tbody tr td { transition: background .1s ease; }
  .admin-root table tbody tr:hover td { background: rgba(255,255,255,0.025) !important; }

  .admin-nav-item { transition: background .15s ease, color .15s ease; }
  .admin-nav-item:not([data-active="true"]):hover { background: var(--bg4) !important; color: var(--text) !important; }

  .admin-root ::-webkit-scrollbar { width: 10px; height: 10px; }
  .admin-root ::-webkit-scrollbar-track { background: transparent; }
  .admin-root ::-webkit-scrollbar-thumb { background: var(--bg5); border-radius: 6px; }
  .admin-root ::-webkit-scrollbar-thumb:hover { background: var(--border3); }
  .admin-root ::selection { background: var(--accent-glow); color: #fff; }

  @media (max-width: 900px) {
    .admin-root { flex-direction: column !important; }
    .admin-sidebar-wrap { width: 100% !important; flex-direction: row !important; align-items: center; overflow-x: auto; -webkit-overflow-scrolling: touch; border-right: none !important; border-bottom: 1px solid var(--border); padding: 10px 12px !important; gap: 6px !important; }
    .admin-sidebar-wrap .admin-logo { display: none !important; }
    .admin-nav-item { white-space: nowrap; }
    .admin-sidebar-footer { margin-top: 0 !important; margin-left: auto !important; }
    .admin-main { padding: 14px !important; }
    .admin-stats { flex-direction: column !important; }
    .admin-stat-card { min-width: unset !important; width: 100% !important; }
    .admin-grid-2 { grid-template-columns: 1fr !important; }
    .admin-table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .admin-table th, .admin-table td { white-space: nowrap; }
    .admin-header { flex-wrap: wrap; gap: 10px; }
  }
`;

// ✅ بنسيب نفس اسم "headers" وبنعدّل الخاصيات جوّاه (mutation) بدل ما نستبدل الـobject نفسه —
// عشرات الأماكن في الملف ده بتستخدم { headers } بالإشارة لنفس الـobject ده، فتحديث الخاصية
// هنا بيوصل لكل حتة تلقائيًا من غير ما نلمس كل استخدام لوحده
const headers = { 'Content-Type': 'application/json' };
function applyAdminToken(token) {
  adminToken = token;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    try { sessionStorage.setItem('erivion_admin_token', token); } catch { /* ignore */ }
  } else {
    delete headers['Authorization'];
    try { sessionStorage.removeItem('erivion_admin_token'); } catch { /* ignore */ }
  }
}
if (adminToken) applyAdminToken(adminToken); // إعادة تفعيل الهيدر من توكن محفوظ من جلسة سابقة

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null) return '–';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
};

const PLAN_COLOR = {
  free:  { bg: '#1f2937', text: '#9ca3af', border: '#374151' },
  paid:  { bg: '#2e1a4d', text: '#c4b5fd', border: '#7c6af7' },
  pro:   { bg: '#1e1b4b', text: '#a5b4fc', border: '#4338ca' },
  plus:  { bg: '#164e63', text: '#67e8f9', border: '#0e7490' },
  max:   { bg: '#451a03', text: '#fbbf24', border: '#d97706' },
};

const planStyle = (plan) => {
  const c = PLAN_COLOR[plan] || PLAN_COLOR.free;
  return {
    background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700,
    letterSpacing: '0.04em', display: 'inline-block',
  };
};

// ── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  const accent = color || 'var(--accent)';
  return (
    <div className="admin-stat-card" style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
      padding: '16px 20px', flex: 1, minWidth: 150, position: 'relative', overflow: 'hidden',
      boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: accent, opacity: 0.85 }} />
      <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-display)', color: color || 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Mini Bar Chart ─────────────────────────────────────────────────────────
function BarChart({ data }) {
  if (!data?.length) return <div style={{ color: '#4b5563', fontSize: 13 }}>No data</div>;
  const max = Math.max(...data.map(d => parseInt(d.count)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{
            width: '100%', borderRadius: '3px 3px 0 0',
            background: i === data.length - 1 ? '#7c6af7' : '#2d2d4a',
            height: `${Math.max(8, (parseInt(d.count) / max) * 72)}px`,
          }} />
          <span style={{ fontSize: 9, color: '#4b5563' }}>
            {d.day ? new Date(d.day).toLocaleDateString('en', { weekday: 'short' }) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Monthly Subscriptions Bar Chart ───────────────────────────────────────
function MonthlyBarChart({ data }) {
  if (!data?.length) return <div style={{ color: '#4b5563', fontSize: 13 }}>No data</div>;
  const max = Math.max(...data.map(d => parseInt(d.count)), 1);
  const bestMonth = data.reduce((best, d) => parseInt(d.count) > parseInt(best.count) ? d : best, data[0]);
  const monthLabel = (m) => {
    const [y, mo] = m.split('-');
    return new Date(y, mo - 1, 1).toLocaleDateString('en', { month: 'short' });
  };
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
        {data.map((d, i) => {
          const isBest = d.month === bestMonth.month && parseInt(d.count) > 0;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: isBest ? '#22c55e' : '#6b7280', fontWeight: isBest ? 700 : 400 }}>{d.count}</span>
              <div style={{
                width: '100%', borderRadius: '3px 3px 0 0',
                background: isBest ? '#22c55e' : '#7c6af7',
                height: `${Math.max(8, (parseInt(d.count) / max) * 72)}px`,
              }} />
              <span style={{ fontSize: 9, color: '#4b5563' }}>{monthLabel(d.month)}</span>
            </div>
          );
        })}
      </div>
      {parseInt(bestMonth.count) > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: '#22c55e' }}>
          🏆 أفضل شهر: <strong>{monthLabel(bestMonth.month)}</strong> — {bestMonth.count} اشتراك ({fmt(bestMonth.revenue)} EGP)
        </div>
      )}
    </div>
  );
}

// ── Range Chart (28/90/365 days — طلب العميل) ───────────────────────────────
function formatPeriodLabel(period, bucket) {
  if (bucket === 'month') {
    const [y, m] = period.split('-');
    return new Date(y, m - 1, 1).toLocaleDateString('en', { month: 'short', year: '2-digit' });
  }
  if (bucket === 'week') {
    const [, wk] = period.split('-'); // ISO "IYYY-IW"
    return `W${parseInt(wk, 10)}`;
  }
  return new Date(period).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

function RangeBarChart({ data, bucket, color = '#7c6af7' }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!data?.length) return <div style={{ color: '#4b5563', fontSize: 13 }}>No data yet for this range</div>;
  const counts = data.map(d => parseInt(d.count, 10) || 0);
  const max = Math.max(...counts, 1);
  const peakIdx = counts.indexOf(Math.max(...counts));
  // ✅ مفيش تسمية تحت كل عمود لو الأعمدة كتير (365 يوم مثلاً) عشان النص مايتزاحمش على بعضه
  const labelEvery = data.length > 40 ? Math.ceil(data.length / 20) : data.length > 16 ? 2 : 1;
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 60 ? 2 : 4, height: 90 }}>
        {data.map((d, i) => {
          const count = counts[i];
          const isPeak = i === peakIdx && count > 0;
          return (
            <div key={i}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(h => (h === i ? null : h))}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 2 }}>
              <div style={{
                width: '100%', borderRadius: '3px 3px 0 0',
                background: isPeak ? '#22c55e' : color,
                opacity: hoverIdx === null || hoverIdx === i ? 1 : 0.5,
                height: `${Math.max(3, (count / max) * 80)}px`,
                transition: 'opacity 0.15s',
              }} />
              {i % labelEvery === 0 && (
                <span style={{ fontSize: 9, color: '#4b5563', whiteSpace: 'nowrap' }}>{formatPeriodLabel(d.period, bucket)}</span>
              )}
            </div>
          );
        })}
      </div>
      {hoverIdx != null && (
        <div style={{
          position: 'absolute', bottom: '100%', left: `${((hoverIdx + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)',
          marginBottom: 6, background: '#1a1a2e', border: '1px solid #2d2d4a', borderRadius: 8,
          padding: '6px 10px', fontSize: 11, color: '#fff', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10,
          boxShadow: '0 4px 12px #0006',
        }}>
          <strong>{counts[hoverIdx]}</strong> — {formatPeriodLabel(data[hoverIdx].period, bucket)}
        </div>
      )}
    </div>
  );
}

// ── Login Screen ───────────────────────────────────────────────────────────
// ✅ FIX: بقى تسجيل دخول حقيقي (إيميل + باسورد) ضد /api/admin/login — السيرفر هو اللي بيتحقق
// إن الإيميل من قايمة أدمن محددة والباسورد صح، وبيرجع توكن جلسة قصير العمر. مفيش أي مقارنة
// أو سر بيتخزن في الفرونت إند خالص بعد كده
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    if (!email.trim() || !password) return;
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Wrong email or password');
        return;
      }
      applyAdminToken(data.token);
      try { sessionStorage.setItem('erivion_admin_ok', '1'); } catch { /* ignore */ }
      onLogin();
    } catch (e) {
      setError('Connection error — try again');
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="admin-root" style={{ minHeight: '100vh', background: 'radial-gradient(900px 500px at 50% -10%, var(--accent-bg), transparent 60%), var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-body)' }}>
      <style>{`
        .admin-login-input:focus { border-color: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-bg); outline: none; }
        .admin-login-btn:not(:disabled):hover { filter: brightness(1.12); }
        .admin-login-btn:not(:disabled):active { transform: scale(0.98); }
      `}</style>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '40px 36px', width: 340, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 16, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg, var(--accent), var(--accent2))', boxShadow: '0 8px 24px var(--accent-glow)', fontSize: 24,
        }}>🔐</div>
        <h2 style={{ color: 'var(--text)', margin: '0 0 4px', fontSize: 21, fontFamily: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.02em' }}>Erivion Admin</h2>
        <p style={{ color: 'var(--text3)', fontSize: 12, margin: '0 0 24px' }}>Authorized personnel only</p>
        <input type="email" placeholder="Admin email" value={email} autoComplete="username" className="admin-login-input"
          onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handle()}
          style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--text)', fontSize: 14, marginBottom: 10, boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s' }} />
        <input type="password" placeholder="Password" value={password} autoComplete="current-password" className="admin-login-input"
          onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handle()}
          style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', padding: '10px 14px', color: 'var(--text)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', transition: 'border-color .15s, box-shadow .15s' }} />
        {error && <div style={{ color: 'var(--red)', background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 'var(--r-sm)', padding: '8px 10px', fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
        <button onClick={handle} disabled={loading} className="admin-login-btn" style={{ width: '100%', background: 'var(--accent)', border: 'none', borderRadius: 'var(--r-sm)', padding: '11px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'filter .15s, transform .05s' }}>{loading ? 'Checking…' : 'Enter'}</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  AFFILIATE TAB COMPONENT
// ══════════════════════════════════════════════════════════════════════════
function AffiliatesTab({ s }) {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [refLoading, setRefLoading] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/affiliate/admin/list', { headers });
      const d = await r.json();
      setAffiliates(d.affiliates || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadReferrals = async (aff) => {
    setSelected(aff);
    setReferrals([]);
    setRefLoading(true);
    try {
      const r = await fetch(`/api/affiliate/admin/referrals/${aff.ref_code}`, { headers });
      const d = await r.json();
      setReferrals(d.referrals || []);
    } catch (e) { console.error(e); }
    setRefLoading(false);
  };

  const handlePayout = async () => {
    if (!selected || !payoutAmount) return;
    try {
      const r = await fetch('/api/affiliate/admin/payout', {
        method: 'POST', headers,
        body: JSON.stringify({ ref_code: selected.ref_code, amount: parseFloat(payoutAmount) }),
      });
      const d = await r.json();
      if (d.success) {
        showToast(`✅ تم تسجيل دفع ${payoutAmount} EGP لـ ${selected.email}`);
        setPayoutAmount('');
        load();
        loadReferrals(selected);
      }
    } catch (e) { showToast('❌ Error: ' + e.message); }
  };

  const handleSuspend = async (aff) => {
    const newStatus = aff.status === 'active' ? 'suspended' : 'active';
    try {
      await fetch('/api/affiliate/admin/suspend', {
        method: 'POST', headers,
        body: JSON.stringify({ ref_code: aff.ref_code, status: newStatus }),
      });
      showToast(`✅ تم تغيير حالة ${aff.email} إلى ${newStatus}`);
      load();
    } catch (e) { showToast('❌ Error'); }
  };

  const pending = (aff) => parseFloat(aff.total_earned) - parseFloat(aff.total_paid);

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#1a1a2e', border: '1px solid #2d2d4a', borderRadius: 10, padding: '12px 20px', fontSize: 14, color: '#fff', zIndex: 9999 }}>{toast}</div>
      )}

      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">🤝 المسوقين — Affiliates</div>
        <button style={s.btn()} onClick={load}>🔄 Refresh</button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="إجمالي المسوقين" value={affiliates.length} color="#7c6af7" />
        <StatCard label="إجمالي الأرباح المستحقة (EGP)"
          value={fmt(affiliates.reduce((s, a) => s + pending(a), 0).toFixed(0))}
          color="#f59e0b" />
        <StatCard label="إجمالي ما اتدفع (EGP)"
          value={fmt(affiliates.reduce((s, a) => s + parseFloat(a.total_paid), 0).toFixed(0))}
          color="#22c55e" />
        <StatCard label="إجمالي المستخدمين المحولين"
          value={affiliates.reduce((s, a) => s + a.total_paid_users, 0)}
          color="#06b6d4" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 16 }}>

        {/* قائمة المسوقين */}
        <div style={s.card}>
          {loading && <div style={{ color: '#6b7280', marginBottom: 12 }}>Loading...</div>}
          <table style={s.table} className="admin-table">
            <thead>
              <tr>
                <th style={s.th}>المسوق</th>
                <th style={s.th}>InstaPay</th>
                <th style={s.th}>Clicks</th>
                <th style={s.th}>Signups</th>
                <th style={s.th}>مدفوعين</th>
                <th style={s.th}>مستحق (EGP)</th>
                <th style={s.th}>الحالة</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map(aff => (
                <tr key={aff.id} style={{ cursor: 'pointer', background: selected?.id === aff.id ? '#1a1a2e' : 'transparent' }}
                  onClick={() => loadReferrals(aff)}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{aff.email}</div>
                    <div style={{ fontSize: 11, color: '#7c6af7', fontFamily: 'monospace' }}>ref: {aff.ref_code}</div>
                  </td>
                  <td style={{ ...s.td, fontSize: 12, color: '#9ca3af' }}>{aff.instapay}</td>
                  <td style={s.td}>{aff.total_clicks}</td>
                  <td style={s.td}>{aff.total_referrals}</td>
                  <td style={{ ...s.td, color: '#22c55e', fontWeight: 700 }}>{aff.total_paid_users}</td>
                  <td style={{ ...s.td, color: pending(aff) > 0 ? '#f59e0b' : '#4b5563', fontWeight: 700 }}>
                    {pending(aff).toFixed(0)} EGP
                  </td>
                  <td style={s.td}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      background: aff.status === 'active' ? '#052e16' : '#2d1515',
                      color: aff.status === 'active' ? '#22c55e' : '#ef4444',
                      border: `1px solid ${aff.status === 'active' ? '#166534' : '#7f1d1d'}`,
                    }}>{aff.status === 'active' ? '✅ Active' : '🚫 Suspended'}</span>
                  </td>
                  <td style={s.td}>
                    <button style={s.btn(aff.status === 'active' ? '#7f1d1d' : '#166534')}
                      onClick={(e) => { e.stopPropagation(); handleSuspend(aff); }}>
                      {aff.status === 'active' ? 'Suspend' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && affiliates.length === 0 && (
                <tr><td colSpan={8} style={{ ...s.td, textAlign: 'center', color: '#4b5563' }}>لا يوجد مسوقين بعد</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* تفاصيل المسوق المختار */}
        {selected && (
          <div style={s.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, color: '#fff', marginBottom: 4 }}>{selected.email}</div>
                <div style={{ fontSize: 12, color: '#7c6af7', fontFamily: 'monospace' }}>
                  erivion.net?ref={selected.ref_code}
                </div>
              </div>
              <button style={s.btn('#374151')} onClick={() => setSelected(null)}>✕ Close</button>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                { label: 'إجمالي كسب', value: parseFloat(selected.total_earned).toFixed(0) + ' EGP', color: '#f59e0b' },
                { label: 'اتدفعله', value: parseFloat(selected.total_paid).toFixed(0) + ' EGP', color: '#22c55e' },
                { label: 'متبقي', value: pending(selected).toFixed(0) + ' EGP', color: pending(selected) > 0 ? '#ef4444' : '#4b5563' },
                { label: 'InstaPay', value: selected.instapay, color: '#9ca3af' },
              ].map((item, i) => (
                <div key={i} style={{ background: '#0a0a18', borderRadius: 8, padding: '10px 14px', border: '1px solid #1a1a2e' }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{item.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: item.color, marginTop: 4 }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Payout */}
            {pending(selected) > 0 && (
              <div style={{ background: '#0a1a0a', border: '1px solid #166534', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 600, marginBottom: 10 }}>
                  💸 تسجيل دفع — InstaPay: {selected.instapay}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    style={{ ...s.input, flex: 1 }}
                    type="number"
                    placeholder={`المبلغ (متبقي: ${pending(selected).toFixed(0)} EGP)`}
                    value={payoutAmount}
                    onChange={e => setPayoutAmount(e.target.value)}
                  />
                  <button style={s.btn('#166534')} onClick={handlePayout}>✅ سجّل الدفع</button>
                </div>
              </div>
            )}

            {/* Referrals Table */}
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>آخر النشاطات</div>
            {refLoading && <div style={{ color: '#4b5563', fontSize: 13 }}>Loading...</div>}
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table style={s.table} className="admin-table">
                <thead>
                  <tr>
                    <th style={s.th}>Event</th>
                    <th style={s.th}>User</th>
                    <th style={s.th}>Plan</th>
                    <th style={s.th}>Commission</th>
                    <th style={s.th}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {referrals.map(r => (
                    <tr key={r.id}>
                      <td style={s.td}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                          background: r.event === 'payment' ? '#052e16' : r.event === 'signup' ? '#1e1b4b' : '#1a1a2e',
                          color: r.event === 'payment' ? '#22c55e' : r.event === 'signup' ? '#a5b4fc' : '#6b7280',
                        }}>
                          {r.event === 'payment' ? '💰 Payment' : r.event === 'signup' ? '✅ Signup' : '👁 Click'}
                        </span>
                      </td>
                      <td style={{ ...s.td, fontSize: 12 }}>{r.user_email || '–'}</td>
                      <td style={s.td}>{r.plan ? <span style={planStyle(r.plan)}>{r.plan}</span> : '–'}</td>
                      <td style={{ ...s.td, color: '#22c55e', fontWeight: 700 }}>
                        {r.commission_egp > 0 ? `+${r.commission_egp} EGP` : '–'}
                      </td>
                      <td style={{ ...s.td, fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!refLoading && referrals.length === 0 && (
                    <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#4b5563' }}>لا يوجد نشاط بعد</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  RATINGS TAB COMPONENT
// ══════════════════════════════════════════════════════════════════════════
function NotificationsTab({ s }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailUseHtml, setEmailUseHtml] = useState(false);
  const [emailHtml, setEmailHtml] = useState('');
  const [emailExclude, setEmailExclude] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState(null);
  // ✅ NEW (طلب العميل: "إيميل التسجيل الجديد مش بيوصل، مش عارف ليه") — endpoint التشخيص ده
  // كان موجود أصلاً في الباك إند (notify-status) بس مفيش زرار في صفحة الأدمن بيكلمه، فمكانش
  // في طريقة سهلة للعميل يتأكد بنفسه هل RESEND_API_KEY متظبط ولا نطاق erivion.net مش
  // verified في حساب Resend نفسه — ده السبب الأشهر لإرسال صامت بيفشل من غير أي error ظاهر
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailCheckResult, setEmailCheckResult] = useState(null);
  const checkEmailDelivery = async () => {
    setCheckingEmail(true); setEmailCheckResult(null);
    try {
      const r = await fetch('/api/support/notify-status', { headers });
      const d = await r.json();
      setEmailCheckResult(d);
    } catch (e) { setEmailCheckResult({ error: e.message }); }
    setCheckingEmail(false);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/notifications', { headers });
      const d = await r.json();
      setNotifications(d.notifications || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      await fetch('/api/admin/notifications', { method: 'POST', headers, body: JSON.stringify({ title: title.trim(), message: message.trim() }) });
      setTitle(''); setMessage('');
      await load();
    } catch (e) { console.error(e); }
    setSending(false);
  };

  const remove = async (id) => {
    try {
      await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE', headers });
      await load();
    } catch (e) { console.error(e); }
  };

  const sendEmailAll = async () => {
    const bodyText = emailUseHtml ? emailHtml : emailMessage;
    if (!emailSubject.trim() || !bodyText.trim()) return;
    setEmailSending(true); setEmailResult(null);
    try {
      const excludeEmails = emailExclude.split(/[\n,]/).map(e => e.trim()).filter(Boolean);
      const payload = emailUseHtml
        ? { subject: emailSubject.trim(), html: emailHtml.trim(), excludeEmails }
        : { subject: emailSubject.trim(), message: emailMessage.trim(), excludeEmails };
      const r = await fetch('/api/admin/notifications/email-all', { method: 'POST', headers, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setEmailResult(`✅ اتبعت لـ ${d.sent} من ${d.total} مستخدم`);
      setEmailSubject(''); setEmailMessage(''); setEmailHtml(''); setEmailExclude('');
    } catch (e) { setEmailResult(`❌ ${e.message}`); }
    setEmailSending(false);
  };

  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">🔔 الإشعارات — Notifications</div>
        <button style={s.btn()} onClick={load}>🔄 Refresh</button>
      </div>

      <div style={{ ...s.card, borderColor: emailCheckResult?.sendSucceeded ? '#166534' : emailCheckResult ? '#7f1d1d' : undefined }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>📬 اختبار وصول إيميلات الإشعارات (تسجيل جديد، دخول، الخ)</div>
        <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>بيبعت إيميل اختباري حقيقي فورًا للإيميل المتظبط في ADMIN_EMAIL، ويقولك بالظبط لو المشكلة إن المفتاح مش متظبط أو النطاق مش verified في Resend.</p>
        <button style={s.btn('#7c6af7')} onClick={checkEmailDelivery} disabled={checkingEmail}>
          {checkingEmail ? '⏳ جاري الفحص...' : '📨 ابعت إيميل اختبار دلوقتي'}
        </button>
        {emailCheckResult && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: '#0a0a14', border: '1px solid #1f2937', fontSize: 12, color: '#d1d5db', lineHeight: 1.7 }}>
            <div style={{ fontWeight: 700, color: emailCheckResult.sendSucceeded ? '#4ade80' : '#f87171', marginBottom: 4 }}>
              {emailCheckResult.message || emailCheckResult.error || 'حصل خطأ غير متوقع'}
            </div>
            {emailCheckResult.adminEmail && <div style={{ color: '#6b7280' }}>الإيميل المستهدف: <span style={{ color: '#fff' }}>{emailCheckResult.adminEmail}</span></div>}
            {emailCheckResult.resendError && (
              <pre style={{ marginTop: 6, fontSize: 10.5, color: '#f87171', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(emailCheckResult.resendError, null, 2)}</pre>
            )}
          </div>
        )}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>بعت إشعار جديد لكل المستخدمين (داخل الموقع فقط)</div>
        <input style={{ ...s.input, width: '100%', marginBottom: 8, boxSizing: 'border-box' }} placeholder="العنوان — Title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea style={{ ...s.input, width: '100%', minHeight: 70, marginBottom: 8, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} placeholder="نص الرسالة — Message" value={message} onChange={e => setMessage(e.target.value)} />
        <button style={s.btn()} disabled={sending || !title.trim() || !message.trim()} onClick={send}>
          {sending ? '⏳ جاري الإرسال...' : '📤 إرسال داخل الموقع'}
        </button>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>الإشعار بيبان لكل المستخدمين تلقائيًا ويختفي بعد 24 ساعة.</div>
      </div>

      <div style={s.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>📧 بعت إيميل جماعي لكل المستخدمين</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#9ca3af', cursor: 'pointer' }}>
            <input type="checkbox" checked={emailUseHtml} onChange={e => setEmailUseHtml(e.target.checked)} />
            🎨 HTML مخصص بدل النص البسيط
          </label>
        </div>
        <input style={{ ...s.input, width: '100%', marginBottom: 8, boxSizing: 'border-box' }} placeholder="عنوان الإيميل — Subject" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
        {emailUseHtml ? (
          <>
            <textarea style={{ ...s.input, width: '100%', minHeight: 180, marginBottom: 8, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'monospace', fontSize: 11.5 }} placeholder="الصق كود الـ HTML الكامل للإيميل هنا" value={emailHtml} onChange={e => setEmailHtml(e.target.value)} />
            {emailHtml.trim() && (
              <a
                href={`data:text/html;charset=utf-8,${encodeURIComponent(emailHtml)}`}
                target="_blank" rel="noreferrer"
                style={{ display: 'inline-block', fontSize: 11.5, color: '#7c6af7', marginBottom: 8 }}
              >👁️ معاينة الشكل في تاب جديد</a>
            )}
          </>
        ) : (
          <textarea style={{ ...s.input, width: '100%', minHeight: 90, marginBottom: 8, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} placeholder="نص الإيميل — Message" value={emailMessage} onChange={e => setEmailMessage(e.target.value)} />
        )}
        <textarea style={{ ...s.input, width: '100%', minHeight: 44, marginBottom: 8, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: 11.5 }} placeholder="استثناء إيميلات (اختياري — سطر أو فاصلة لكل إيميل، مفيد لو broadcast سابق فشل في نصه وعايز متكررش على اللي وصلهم فعلًا)" value={emailExclude} onChange={e => setEmailExclude(e.target.value)} />
        <button style={s.btn('#7c6af7')} disabled={emailSending || !emailSubject.trim() || !(emailUseHtml ? emailHtml : emailMessage).trim()} onClick={sendEmailAll}>
          {emailSending ? '⏳ جاري الإرسال...' : '📧 إرسال إيميل لكل المستخدمين'}
        </button>
        {emailResult && <div style={{ fontSize: 12, color: emailResult.startsWith('✅') ? '#22c55e' : '#ef4444', marginTop: 8 }}>{emailResult}</div>}
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>ده منفصل تمامًا عن الإشعار الداخلي فوق — بيروح فعليًا على إيميل كل مستخدم مسجل.</div>
      </div>

      <div style={s.card}>
        {loading && <div style={{ color: '#6b7280', marginBottom: 12 }}>Loading...</div>}
        {notifications.length === 0 && !loading && <div style={{ color: '#6b7280' }}>مفيش إشعارات لسه</div>}
        {notifications.map(n => (
          <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: '1px solid #1a1a2e' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13.5 }}>{n.title}</div>
              <div style={{ color: '#9ca3af', fontSize: 12.5, marginTop: 3 }}>{n.message}</div>
              <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</div>
            </div>
            <button style={s.btn('#ef4444')} onClick={() => remove(n.id)}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelsTab({ s }) {
  const [channels, setChannels] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cr, rr] = await Promise.all([
        fetch('/api/admin/channels', { headers }),
        fetch('/api/admin/daily-runs', { headers }),
      ]);
      const cd = await cr.json(); setChannels(cd.channels || []);
      const rd = await rr.json(); setRuns(rd.runs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleDeleteChannel = async (c) => {
    if (!confirm(`Delete channel "${c.label || c.channel_id}" (${c.user_email})? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/admin/channels/${c.id}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Failed');
      setChannels(prev => prev.filter(ch => ch.id !== c.id));
    } catch (e) { alert('❌ ' + e.message); }
  };

  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">📺 Managed Channels (VidIQ)</div>
        <button style={s.btn()} onClick={load}>🔄 Refresh</button>
      </div>
      {loading && <div style={{ color: '#6b7280', marginBottom: 12 }}>Loading...</div>}

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Connected channels ({channels.length})</div>
        {channels.length === 0 && <div style={{ color: '#6b7280', fontSize: 12.5 }}>No channels connected yet.</div>}
        {channels.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #1a1a2e', fontSize: 12.5 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#fff' }}>{c.label || c.channel_id} <span style={{ color: '#6b7280', fontWeight: 400 }}>— {c.user_email}</span></div>
              <div style={{ color: '#6b7280', marginTop: 2 }}>{c.format_pref} · {c.uses_voice ? '🎙️ voice' : '🔇 no voice'} · model {c.model_pref} · last run: {c.last_run_at ? new Date(c.last_run_at).toLocaleString() : 'never'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: c.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: c.status === 'active' ? '#22c55e' : '#f59e0b' }}>{c.status}</span>
              <button onClick={() => handleDeleteChannel(c)} style={{ ...s.btn('#7f1d1d'), fontSize: 11, padding: '5px 10px' }}>🗑️ Delete</button>
            </div>
          </div>
        ))}
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>Recent daily runs ({runs.length})</div>
        {runs.length === 0 && <div style={{ color: '#6b7280', fontSize: 12.5 }}>No runs yet.</div>}
        {runs.map(r => (
          <div key={r.id} style={{ padding: '9px 0', borderBottom: '1px solid #1a1a2e', fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: '#fff' }}>{r.idea_title}</span>
              <span style={{ fontWeight: 700, color: r.status === 'done' ? '#22c55e' : r.status === 'failed' ? '#ef4444' : r.status === 'rejected' ? '#6b7280' : '#f59e0b' }}>{r.status}</span>
            </div>
            <div style={{ color: '#6b7280', marginTop: 2 }}>{r.channel_label || ''} · {r.user_email} · {new Date(r.created_at).toLocaleString()}{r.error ? ` · ${r.error}` : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoicesTab({ s }) {
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/voice-clones', { headers });
      const d = await r.json();
      setVoices(d.voices || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">🗣️ Cloned Voices</div>
        <button style={s.btn()} onClick={load}>🔄 Refresh</button>
      </div>
      {loading && <div style={{ color: '#6b7280', marginBottom: 12 }}>Loading...</div>}
      <div style={s.card}>
        {voices.length === 0 && !loading && <div style={{ color: '#6b7280', fontSize: 12.5 }}>No saved voices yet.</div>}
        {voices.map(v => (
          <div key={v.id} style={{ padding: '10px 0', borderBottom: '1px solid #1a1a2e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>{v.user_email}</span>
              <span style={{ color: '#6b7280', fontSize: 11.5 }}>{v.duration_sec ? `${Number(v.duration_sec).toFixed(1)}s` : ''} · {new Date(v.created_at).toLocaleString()}</span>
            </div>
            <audio controls src={v.sample_url} style={{ width: '100%', height: 32 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const AUDIOVIDEO_STATUS_LABEL = {
  transcribing: '⏳ بيتفرّغ...',
  transcribed: '✅ اتفرّغ',
  extracting: '⏳ بيستخرج العناصر ويولّد الصور...',
  elements_ready: '✅ العناصر والصور جاهزة',
  rendering: '⏳ بيبني الفيديو النهائي...',
  done: '🎉 خلص',
  failed: '❌ فشل',
  expired: '🗑️ الفيديو اتحذف من التخزين بعد 24 ساعة',
};

function AnalyticsTab({ s }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/admin/analytics/overview', { headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || d.error || 'Failed');
      setOverview(d.overview);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const fmtDuration = (sec) => { const m = Math.floor(sec / 60), s2 = Math.round(sec % 60); return `${m}:${String(s2).padStart(2, '0')}`; };

  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">📈 Google Analytics</div>
        <button style={s.btn()} onClick={load}>🔄 Refresh</button>
      </div>

      {loading && <div style={{ color: '#6b7280', fontSize: 12.5 }}>Loading...</div>}

      {!loading && error && (
        <div style={s.card}>
          <div style={{ color: '#f87171', fontSize: 13, marginBottom: 8 }}>❌ {error}</div>
          {error.includes('not_configured') || error.includes('GA4_') ? (
            <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.8 }}>
              محتاج تضيف على Railway: <code style={{ color: '#a78bfa' }}>GA4_PROPERTY_ID</code> (من GA4 Admin → Property Settings)
              و <code style={{ color: '#a78bfa' }}>GA4_SERVICE_ACCOUNT_JSON</code> (محتوى ملف الـ Service Account كامل)،
              وتضيف إيميل الـ Service Account كـ Viewer في GA4 Admin → Property Access Management.
            </div>
          ) : null}
        </div>
      )}

      {!loading && overview && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }} className="admin-stats">
            {[
              { label: 'زوار (7 أيام)', value: fmt(overview.last7d.activeUsers) },
              { label: 'جلسات (7 أيام)', value: fmt(overview.last7d.sessions) },
              { label: 'مشاهدات صفحات (7 أيام)', value: fmt(overview.last7d.pageViews) },
              { label: 'متوسط مدة الجلسة', value: fmtDuration(overview.last7d.avgSessionDurationSec) },
              { label: 'نسبة الارتداد', value: `${(overview.last7d.bounceRate * 100).toFixed(1)}%` },
              { label: 'زوار (30 يوم)', value: fmt(overview.last30d.activeUsers) },
            ].map((c, i) => (
              <div key={i} className="admin-stat-card" style={{ ...s.card, flex: 1, minWidth: 140, marginBottom: 0, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#a78bfa' }}>{c.value}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={s.card}>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 10 }}>أكتر صفحات (7 أيام)</div>
              {overview.topPages.length === 0 && <div style={{ color: '#6b7280', fontSize: 12 }}>لا بيانات.</div>}
              {overview.topPages.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a2e', fontSize: 12 }}>
                  <span style={{ color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{p.path}</span>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>{fmt(p.views)}</span>
                </div>
              ))}
            </div>
            <div style={s.card}>
              <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 10 }}>مصادر الزيارات (7 أيام)</div>
              {overview.topSources.length === 0 && <div style={{ color: '#6b7280', fontSize: 12 }}>لا بيانات.</div>}
              {overview.topSources.map((src, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #1a1a2e', fontSize: 12 }}>
                  <span style={{ color: '#d1d5db' }}>{src.channel}</span>
                  <span style={{ color: '#a78bfa', fontWeight: 700 }}>{fmt(src.sessions)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AudioVideoTab({ s }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [ratio, setRatio] = useState('16:9');
  const [error, setError] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const fileRef = React.useRef(null);
  const pollRef = React.useRef(null);

  // ✅ NEW (طلب العميل): صور مرجعية ثابتة (القرآن الكريم، صحيح البخاري، صحيح مسلم...) —
  // بتتستخدم تلقائيًا مع لقطات "quote" بدل ما تفضل نص بس
  const [refImages, setRefImages] = useState([]);
  const [refUploading, setRefUploading] = useState(false);
  const [refKeyInput, setRefKeyInput] = useState('quran');
  const refFileRef = React.useRef(null);

  const loadRefImages = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/audio-video/reference-images', { headers });
      const d = await r.json();
      setRefImages(d.images || []);
    } catch (e) { console.error(e); }
  }, []);

  const handleRefUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !refKeyInput.trim()) return;
    setRefUploading(true);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('ref_key', refKeyInput.trim().toLowerCase());
      const r = await fetch('/api/admin/audio-video/reference-images', {
        method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` }, body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      loadRefImages();
    } catch (e) {
      setError('❌ ' + e.message);
    } finally {
      setRefUploading(false);
      if (refFileRef.current) refFileRef.current.value = '';
    }
  };

  const handleRefDelete = async (refKey) => {
    try {
      await fetch(`/api/admin/audio-video/reference-images/${refKey}`, { method: 'DELETE', headers });
      loadRefImages();
    } catch (e) { console.error(e); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/audio-video/jobs', { headers });
      const d = await r.json();
      setJobs(d.jobs || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); loadRefImages(); }, [load, loadRefImages]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  // ✅ stopStatuses/onStop معمّمة عشان نفس الـ poller يخدم كل من الاستخراج (elements_ready/
  // failed) والرندر (done/failed) — كل واحد له endpoint async مختلف بس نفس شكل الـ polling
  const pollJob = (jobId, stopStatuses, onStop) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/admin/audio-video/jobs/${jobId}`, { headers });
        const d = await r.json();
        if (!r.ok) return;
        setActiveJob(d.job);
        if (stopStatuses.includes(d.job.status)) {
          clearInterval(pollRef.current);
          onStop();
          load();
        }
      } catch (e) { console.error(e); }
    }, 4000);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError(''); setUploading(true); setActiveJob(null);
    try {
      const form = new FormData();
      files.forEach(f => form.append('audio', f));
      const r = await fetch('/api/admin/audio-video/transcribe', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Transcription failed');
      setActiveJob(d.job);
      load();
    } catch (e) {
      setError('❌ ' + e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleExtract = async () => {
    if (!activeJob) return;
    setError(''); setExtracting(true);
    try {
      const r = await fetch(`/api/admin/audio-video/jobs/${activeJob.id}/extract`, { method: 'POST', headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Extraction failed');
      setActiveJob(d.job);
      pollJob(activeJob.id, ['elements_ready', 'failed'], () => setExtracting(false));
    } catch (e) {
      setError('❌ ' + e.message);
      setExtracting(false);
    }
  };

  const handleRender = async () => {
    if (!activeJob) return;
    setError(''); setRendering(true);
    try {
      const r = await fetch(`/api/admin/audio-video/jobs/${activeJob.id}/render`, {
        method: 'POST', headers, body: JSON.stringify({ ratio }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Render trigger failed');
      setActiveJob(d.job);
      pollJob(activeJob.id, ['done', 'failed'], () => setRendering(false));
    } catch (e) {
      setError('❌ ' + e.message);
      setRendering(false);
    }
  };

  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">🎬 Audio → Video (Voiceover → فيديو كامل تلقائيًا)</div>
        <button style={s.btn()} onClick={load}>🔄 Refresh</button>
      </div>

      <div style={s.card}>
        <div style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 12 }}>
          الخطوة 1: ارفع ملف صوتي (mp3/wav) — هيترفع لـ R2 ويتفرّغ بتوقيت دقيق على مستوى الكلمة الواحدة (Groq Whisper). لو الصوت مقسّم لأكتر من ملف (فيديو طويل)، اختار كل الملفات دفعة واحدة بنفس الترتيب اللي بيتقالوا بيه — هيتفرّغوا كل واحد لوحده وبعدين يتدمجوا في تايم لاين واحد متصل.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          multiple
          onChange={handleUpload}
          disabled={uploading}
          style={{ fontSize: 13, color: '#d1d5db' }}
        />
        {uploading && <div style={{ color: '#7c6af7', fontSize: 12.5, marginTop: 10 }}>⏳ بيترفع ويتفرّغ... ممكن ياخد شوية ثواني</div>}
        {error && <div style={{ color: '#f87171', fontSize: 12.5, marginTop: 10 }}>{error}</div>}
      </div>

      <div style={s.card}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 8 }}>📖 صور مرجعية (القرآن الكريم / صحيح البخاري / صحيح مسلم)</div>
        <div style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 12 }}>
          ارفع صورة مرة واحدة لكل مصدر — بتتستخدم تلقائيًا لأي لقطة آية/حديث بنفس المصدر ده بدل ما تفضل نص بس. المفاتيح المعروفة: quran, bukhari, muslim, other (احتياطي لأي مصدر تاني).
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <select value={refKeyInput} onChange={e => setRefKeyInput(e.target.value)} style={{ background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 8, padding: '6px 10px', fontSize: 12.5 }}>
            <option value="quran">quran — القرآن الكريم</option>
            <option value="bukhari">bukhari — صحيح البخاري</option>
            <option value="muslim">muslim — صحيح مسلم</option>
            <option value="other">other — احتياطي لأي مصدر تاني</option>
          </select>
          <input ref={refFileRef} type="file" accept="image/*" onChange={handleRefUpload} disabled={refUploading} style={{ fontSize: 12.5, color: '#d1d5db' }} />
          {refUploading && <span style={{ color: '#7c6af7', fontSize: 12 }}>⏳ بيترفع...</span>}
        </div>
        {refImages.length > 0 && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {refImages.map(img => (
              <div key={img.ref_key} style={{ width: 100, textAlign: 'center' }}>
                <img src={img.image_url} alt={img.ref_key} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8, border: '1px solid #2d2d4a' }} />
                <div style={{ fontSize: 11, color: '#d1d5db', marginTop: 4 }}>{img.label || img.ref_key}</div>
                <button onClick={() => handleRefDelete(img.ref_key)} style={{ marginTop: 4, background: 'none', border: '1px solid #2d2d4a', color: '#f87171', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>حذف</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <BulkStickerUploader job={activeJob} onSaved={setActiveJob} onNewJob={load} />

      {activeJob && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>Job #{activeJob.id}</div>
            <span style={{ fontSize: 12, color: '#a78bfa' }}>{AUDIOVIDEO_STATUS_LABEL[activeJob.status] || activeJob.status}</span>
          </div>
          <audio controls src={activeJob.audio_url} style={{ width: '100%', height: 32, marginBottom: 12 }} />
          <div style={{ fontSize: 12.5, color: '#d1d5db', marginBottom: 12, lineHeight: 1.7 }}>{activeJob.transcript_text}</div>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #1a1a2e', borderRadius: 8, marginBottom: 16 }}>
            <table style={s.table} className="admin-table">
              <thead><tr><th style={s.th}>#</th><th style={s.th}>Word</th><th style={s.th}>Start (s)</th><th style={s.th}>End (s)</th></tr></thead>
              <tbody>
                {(activeJob.words_json || []).map((w, i) => (
                  <tr key={i}>
                    <td style={s.td}>{i + 1}</td>
                    <td style={s.td}>{w.word}</td>
                    <td style={s.td}>{Number(w.start).toFixed(2)}</td>
                    <td style={s.td}>{Number(w.end).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <CompositeSceneEditor job={activeJob} onSaved={setActiveJob} />

          {/* الخطوة 2: استخراج العناصر + توليد الصور — زرار "أعد الاستخراج" فاضل ظاهر حتى
              لو العناصر موجودة بالفعل، عشان تقدر تعيد التوليد على نفس الـ job (بعد أي تعديل
              على منطق الاستخراج/الصور) من غير ما تحتاج ترفع الصوت تاني من الصفر */}
          <button style={{ ...s.btn(extracting ? '#1a1a2e' : '#7c6af7'), opacity: extracting ? 0.6 : 1, marginBottom: activeJob.elements_json ? 12 : 0 }} onClick={handleExtract} disabled={extracting}>
            {extracting ? '⏳ بيستخرج العناصر ويولّد الصور... (ممكن ياخد كذا دقيقة، العدد كبير دلوقتي)' : activeJob.elements_json ? '🔄 أعد الاستخراج والصور' : '🧩 استخرج العناصر وولّد الصور'}
          </button>

          {activeJob.elements_json && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>{activeJob.elements_json.length} عنصر اتستخرجوا:</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                {activeJob.elements_json.map((el, i) => (
                  <div key={i} style={{ width: 110, textAlign: 'center' }}>
                    {el.imageUrl
                      ? <img src={el.imageUrl} alt={el.element} style={{ width: 110, height: 110, objectFit: 'contain', background: '#fff', borderRadius: 8, border: '1px solid #2d2d4a' }} />
                      /* ✅ FIX: عناصر kind:'quote' (آيات/أحاديث/إشارة لله أو نبي) مالهاش
                         imageUrl خالص عن قصد — نص بس بدون صورة. كان <img src={null}> بيطلع
                         أيقونة "صورة مكسورة" مربكة، دلوقتي بتوضح إنه نص بس بشكل واضح */
                      : <div style={{ width: 110, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 8, border: '1px dashed #2d2d4a', fontSize: 11, color: '#6b7280', padding: 6, boxSizing: 'border-box' }}>📝 نص بس (بدون صورة)</div>}
                    <div style={{ fontSize: 11, color: '#d1d5db', marginTop: 4 }}>{el.element}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{Number(el.start).toFixed(1)}s–{Number(el.end).toFixed(1)}s</div>
                  </div>
                ))}
              </div>

              <TimelineEditor job={activeJob} onSaved={setActiveJob} authHeaders={headers} />

              {/* الخطوة 3+4: بناء الفيديو النهائي — الزرار فاضل ظاهر حتى لو الفيديو خلص قبل
                  كده، عشان تقدر تعيد البناء بعد أي تعديل من التايم لاين فوق من غير ما تحتاج
                  تنزل لزرار "احفظ وأعد بناء الفيديو" جوه التايم لاين نفسه */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['16:9', '9:16'].map(r => (
                    <button key={r} style={{ ...s.btn(ratio === r ? '#7c6af7' : '#1a1a2e'), border: `1px solid ${ratio === r ? '#7c6af7' : '#2d2d4a'}`, fontSize: 12 }} onClick={() => setRatio(r)} disabled={rendering}>{r}</button>
                  ))}
                </div>
                <button style={{ ...s.btn(rendering ? '#1a1a2e' : '#059669'), opacity: rendering ? 0.6 : 1 }} onClick={handleRender} disabled={rendering}>
                  {rendering ? '⏳ بيبني الفيديو... (ممكن ياخد كام دقيقة)' : activeJob.status === 'done' ? '🔁 أعد بناء الفيديو' : '🎬 ابني الفيديو النهائي'}
                </button>
              </div>

              {activeJob.status === 'done' && activeJob.video_url && (
                <div style={{ marginTop: 8 }}>
                  <video controls src={activeJob.video_url} style={{ width: '100%', maxWidth: 480, borderRadius: 10, background: '#000' }} />
                </div>
              )}
              {activeJob.status === 'failed' && activeJob.error && (
                <div style={{ color: '#f87171', fontSize: 12.5, marginTop: 8 }}>❌ {activeJob.error}</div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={s.card}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 10 }}>Jobs سابقة</div>
        {loading && <div style={{ color: '#6b7280', fontSize: 12.5 }}>Loading...</div>}
        {!loading && jobs.length === 0 && <div style={{ color: '#6b7280', fontSize: 12.5 }}>لا يوجد بعد.</div>}
        {jobs.map(j => (
          <div key={j.id} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a2e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setActiveJob(j)}>
            <span style={{ fontSize: 12.5, color: '#d1d5db' }}>#{j.id} · {AUDIOVIDEO_STATUS_LABEL[j.status] || j.status}</span>
            <span style={{ fontSize: 11.5, color: '#6b7280' }}>{new Date(j.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ✅ NEW (طلب العميل — "ملصقات مخصّصة بالجملة"): رفع أي عدد من الصور/الملصقات الجاهزة
// دفعة واحدة (ممكن يكون فيها نص مكتوب أصلًا) — الباك إند بيقرا كل صورة بموديل رؤية Groq
// مجاني (نفس مفتاح GROQ_API_KEY، مفيش تسجيل جديد)، وبعدين نداء LLM واحد بيحدد لكل صورة
// أنسب لحظة في الترانسكريبت. بيتحطوا كعناصر عادية في نفس التايم لاين تحت (imageWidth/
// imageHeight بيتسجّلوا معاهم عشان الرندر يحافظ على نسبتهم الأصلية) — راجع/عدّل نتيجة
// المطابقة من التايم لاين لو الـ AI حط أي صورة في مكان غلط
function BulkStickerUploader({ job, onSaved, onNewJob }) {
  const [audioFiles, setAudioFiles] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [timingFile, setTimingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null); // { total, done, stage }
  const audioRef = React.useRef(null);
  const imagesRef = React.useRef(null);
  const timingRef = React.useRef(null);

  // ✅ NEW (طلب العميل): الأدمن يقدر يرفع الصوت من هنا مباشرة (يبدأ Job جديد بالكامل) بدل
  // ما يحتاج ينزل لقسم الرفع فوق الأول — لو مفيش صوت متختار، بيستخدم الـ Job الحالي زي ما هو
  const handleSubmit = async () => {
    if (!audioFiles.length && !job) { setErr('❌ لازم ترفع صوت الأول (مفيش Job حاليًا) — من هنا أو من قسم الرفع فوق'); return; }
    if (!imageFiles.length) { setErr('❌ اختار صورة واحدة على الأقل'); return; }
    setUploading(true); setErr(''); setResult(null);
    try {
      let targetJob = job;
      if (audioFiles.length) {
        const audioForm = new FormData();
        audioFiles.forEach(f => audioForm.append('audio', f));
        const ar = await fetch('/api/admin/audio-video/transcribe', {
          method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` }, body: audioForm,
        });
        const ad = await ar.json();
        if (!ar.ok) throw new Error(ad.error || 'Transcription failed');
        targetJob = ad.job;
        onSaved(targetJob);
        if (onNewJob) onNewJob();
      }
      if (!targetJob?.words_json?.length) throw new Error('لسه مفيش ترانسكريبت للـ Job ده');

      const form = new FormData();
      imageFiles.forEach(f => form.append('images', f));
      // ✅ NEW (طلب العميل): ملف تقسيم يدوي اختياري — سطر لكل صورة (بنفس ترتيب رفعها)،
      // إما ثانية صريحة (يتستخدم زي ما هو) أو سطر فاضي (سيب الـ AI يقرر). بنقراه في المتصفح
      // ونبعت محتواه كنص عادي، مش كملف منفصل، أبسط في السيرفر
      if (timingFile) form.append('manualTimes', await timingFile.text());
      const r = await fetch(`/api/admin/audio-video/jobs/${targetJob.id}/bulk-stickers`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` }, body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');

      // ✅ FIX (بلاغ العميل: "Unexpected field" + الموقع بيعلّق مع دفعات كبيرة من الصور):
      // العملية بقت async في الباك إند (بترجع فورًا وتكمل في الخلفية) — بنعمل poll على
      // تقدّمها بدل ما ننتظر رد واحد طويل ممكن يعلّق المتصفح أو يضرب timeout
      const targetJobId = targetJob.id;
      await new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const pr = await fetch(`/api/admin/audio-video/jobs/${targetJobId}/bulk-stickers/progress`, { headers });
            const pd = await pr.json();
            const p = pd.progress;
            if (!p) return;
            setProgress(p);
            if (p.finished) {
              clearInterval(poll);
              if (p.error) { reject(new Error(p.error)); return; }
              const jr = await fetch(`/api/admin/audio-video/jobs/${targetJobId}`, { headers });
              const jd = await jr.json();
              if (jr.ok) onSaved(jd.job);
              setResult({ matched: p.matchedCount, total: p.total });
              resolve();
            }
          } catch (e3) { clearInterval(poll); reject(e3); }
        }, 2000);
      });

      setAudioFiles([]); setImageFiles([]); setTimingFile(null);
      if (audioRef.current) audioRef.current.value = '';
      if (imagesRef.current) imagesRef.current.value = '';
      if (timingRef.current) timingRef.current.value = '';
    } catch (e2) {
      setErr('❌ ' + e2.message);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <div style={{ border: '1px solid #2d2d4a', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: '#fff', fontSize: 13, marginBottom: 8 }}>📚 رفع ملصقات بالجملة (AI بيطابقهم مع الصوت تلقائيًا)</div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 10, lineHeight: 1.7 }}>
        ارفع أي عدد من الصور/الملصقات دفعة واحدة (ممكن يكون فيها نص مكتوب أصلًا) — الذكاء الاصطناعي بيقرا كل صورة وبيحدد بنفسه أنسب لحظة في الفيديو على حسب الكلام المنطوق وقتها، وبيحطهم بحركة pop سريعة بنسبتها الأصلية (16:9 بتملا الفريم، 1:1/3:2 بتتحط بحجمها المتناسب من غير أي تمدد). عايز تحدد التوقيت بنفسك بدل الـ AI؟ استخدم ملف التقسيم اليدوي تحت. لو الـ AI حط أي صورة في مكان غلط، عدّل من التايم لاين تحت.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11.5, color: '#a78bfa', marginBottom: 4 }}>1) صوت (اختياري — لبدء Job جديد من هنا مباشرة؛ لو سبته فاضي هيستخدم الـ Job الحالي). لو الصوت مقسّم لأكتر من ملف، اختارهم كلهم دفعة واحدة بنفس الترتيب</div>
          <input ref={audioRef} type="file" accept="audio/*" multiple onChange={e => setAudioFiles(Array.from(e.target.files || []))} disabled={uploading} style={{ fontSize: 12.5, color: '#d1d5db' }} />
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: '#a78bfa', marginBottom: 4 }}>2) الصور/الملصقات (مطلوب)</div>
          <input ref={imagesRef} type="file" accept="image/*" multiple onChange={e => setImageFiles(Array.from(e.target.files || []))} disabled={uploading} style={{ fontSize: 12.5, color: '#d1d5db' }} />
        </div>
        <div>
          <div style={{ fontSize: 11.5, color: '#a78bfa', marginBottom: 4 }}>
            3) تقسيم يدوي (اختياري) — ملف .txt، سطر لكل صورة بنفس ترتيب رفعها فوق: اكتب ثانية الظهور (مطلقة من بداية الفيديو)، أو "رقم الصوت:ثانية جواه" لو الصوت متقسّم لأكتر من ملف (مثلاً 2:8.5 يعني الثانية 8.5 جوه الصوت رقم 2)، أو سيب السطر فاضي عشان الـ AI يقرر بنفسه
          </div>
          <input ref={timingRef} type="file" accept=".txt,text/plain" onChange={e => setTimingFile(e.target.files[0] || null)} disabled={uploading} style={{ fontSize: 12.5, color: '#d1d5db' }} />
          {(job?.audio_parts_json?.length > 1) && (
            <div style={{ fontSize: 10.5, color: '#565676', marginTop: 4 }}>
              الصوت الحالي متقسّم لـ{job.audio_parts_json.length} أجزاء: {job.audio_parts_json.map(p => `صوت ${p.index} (${p.offsetSec.toFixed(1)}s–${(p.offsetSec + p.durationSec).toFixed(1)}s)`).join(' · ')}
            </div>
          )}
        </div>
        <button onClick={handleSubmit} disabled={uploading} style={{ background: uploading ? '#1a1a2e' : '#7c6af7', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 12.5, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', alignSelf: 'flex-start' }}>
          {uploading ? '⏳ بيرفع ويطابق...' : '⬆️ ارفع وطابق'}
        </button>
      </div>

      {uploading && (
        <div style={{ color: '#7c6af7', fontSize: 12, marginTop: 8 }}>
          {progress
            ? (progress.stage === 'captioning' ? `⏳ بيحلل الصورة ${progress.done} من ${progress.total}...` : `⏳ بيطابق ${progress.total} صورة مع الصوت...`)
            : '⏳ بيبدأ الرفع...'}
        </div>
      )}
      {result && <div style={{ color: '#22c55e', fontSize: 12, marginTop: 8 }}>✅ اتطابق {result.matched} من {result.total} صورة. راجعهم في التايم لاين تحت.</div>}
      {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// ✅ NEW (طلب العميل — "مشاهد مركّبة"): محرر بسيط لرفع صورة دايجرام واحدة (زي مراحل مرقّمة)
// وتحديد نقاط زوم/pan يدويًا عليها — كل نقطة = مربع بيتحدد بالسحب على الصورة + ثانية يتقال
// فيها الكلام المطابق. الرندر (audioVideoRenderService.js) بيعمل زوم/pan ناعم بين النقط دي.
// ✅ NEW (طلب العميل): لو الصوت مقسّم لأكتر من ملف، بدل ما تحسب الثانية المطلقة يدويًا،
// اختار رقم الصوت واكتب الثانية جواه، واضغط "احسب" — هيملا الحقل المطلوب بالثانية المطلقة
// الصح تلقائيًا (باستخدام offsetSec المسجّل لكل جزء وقت التفريغ)
function AudioPartTimeHelper({ audioParts, onCompute }) {
  const [partIdx, setPartIdx] = useState(audioParts[0]?.index || 1);
  const [localSec, setLocalSec] = useState('');
  if (!audioParts.length) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <select value={partIdx} onChange={e => setPartIdx(Number(e.target.value))} style={{ background: '#0d0d18', color: '#a78bfa', border: '1px solid #2d2d4a', borderRadius: 5, fontSize: 11, padding: '3px 4px' }}>
        {audioParts.map(p => <option key={p.index} value={p.index}>صوت {p.index}</option>)}
      </select>
      <input type="number" placeholder="ثانية جواه" value={localSec} onChange={e => setLocalSec(e.target.value)} style={{ width: 70, background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 5, fontSize: 11, padding: '3px 5px' }} />
      <button
        onClick={() => {
          const part = audioParts.find(p => p.index === partIdx);
          if (!part || !localSec.trim()) return;
          onCompute(part.offsetSec + Number(localSec));
        }}
        style={{ background: '#1a1a2e', border: '1px solid #2d2d4a', color: '#22c55e', borderRadius: 5, fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
      >احسب</button>
    </span>
  );
}

function CompositeSceneEditor({ job, onSaved }) {
  const [scenes, setScenes] = useState(job.composite_scenes_json || []);
  useEffect(() => { setScenes(job.composite_scenes_json || []); }, [job.id, job.composite_scenes_json]);
  const audioParts = Array.isArray(job.audio_parts_json) ? job.audio_parts_json : [];

  const [showNew, setShowNew] = useState(false);
  const [csImage, setCsImage] = useState(null); // { url, width, height }
  const [csUploading, setCsUploading] = useState(false);
  const [csStart, setCsStart] = useState('');
  const [csEnd, setCsEnd] = useState('');
  const [csKeyframes, setCsKeyframes] = useState([]); // { time, x, y, width, height, label }
  const [csKeyTime, setCsKeyTime] = useState('');
  const [csKeyLabel, setCsKeyLabel] = useState('');
  const [drag, setDrag] = useState(null); // { startX, startY, curX, curY } — نسب 0-1 من الصورة
  const imgWrapRef = React.useRef(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsUploading(true); setErr('');
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await fetch(`/api/admin/audio-video/jobs/${job.id}/composite-image`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${adminToken}` }, body: form,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      setCsImage({ url: d.imageUrl, width: d.width, height: d.height });
    } catch (e) {
      setErr('❌ ' + e.message);
    } finally {
      setCsUploading(false);
    }
  };

  const getRelPos = (e) => {
    const rect = imgWrapRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };
  const handleMouseDown = (e) => { const p = getRelPos(e); setDrag({ startX: p.x, startY: p.y, curX: p.x, curY: p.y }); };
  // ✅ FIX (لخبطة بلاغها العميل: "مش فاهم أحدد المرحلة ازاي"): كان مفيش أي تتبع لحالة "الماوس
  // لسه مضغوط"، فالمربع كان فاضل بيتحرك مع الماوس حتى بعد ما تسيب الزرار — أي تحريك بسيط
  // للماوس فوق الصورة (حتى بالغلط وانت رايح تكتب في الحقول) كان بيغيّر حجم/مكان المربع من
  // غير ما تكون ضاغط. دلوقتي بنتأكد إن زرار الماوس لسه مضغوط فعليًا (e.buttons === 1) قبل
  // ما نكمل تحديث المربع، فالمربع بيستقر فورًا لما تسيب الزرار
  const handleMouseMove = (e) => { if (!drag || e.buttons !== 1) return; const p = getRelPos(e); setDrag(d => ({ ...d, curX: p.x, curY: p.y })); };

  const addKeyframe = () => {
    if (!drag || !csKeyTime.trim()) return;
    const x = Math.min(drag.startX, drag.curX);
    const y = Math.min(drag.startY, drag.curY);
    const width = Math.abs(drag.curX - drag.startX);
    const height = Math.abs(drag.curY - drag.startY);
    if (width < 0.02 || height < 0.02) { setErr('❌ حدد مربع أكبر على الصورة الأول (اسحب بالماوس)'); return; }
    const time = Number(csKeyTime);
    if (csStart.trim() && csEnd.trim() && (time < Number(csStart) || time > Number(csEnd))) {
      setErr(`❌ الثانية دي (${time}) برة نطاق المشهد (${csStart} إلى ${csEnd}) — لازم تكون ثانية من بداية الفيديو، جوه النطاق ده`);
      return;
    }
    setErr('');
    setCsKeyframes(kfs => [...kfs, { time: Number(csKeyTime), x, y, width, height, label: csKeyLabel.trim() }].sort((a, b) => a.time - b.time));
    setCsKeyTime(''); setCsKeyLabel(''); setDrag(null);
  };
  const removeKeyframe = (idx) => setCsKeyframes(kfs => kfs.filter((_, i) => i !== idx));

  const resetDraft = () => { setCsImage(null); setCsStart(''); setCsEnd(''); setCsKeyframes([]); setDrag(null); setErr(''); };

  const saveScenes = async (nextScenes) => {
    const r = await fetch(`/api/admin/audio-video/jobs/${job.id}/composite-scenes`, {
      method: 'POST', headers, body: JSON.stringify({ scenes: nextScenes }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Save failed');
    setScenes(d.job.composite_scenes_json || []);
    onSaved(d.job);
  };

  const handleSaveNewScene = async () => {
    if (!csImage || !csStart.trim() || !csEnd.trim() || csKeyframes.length === 0) {
      setErr('❌ لازم صورة + من/لحد ثانية + نقطة واحدة على الأقل قبل الحفظ');
      return;
    }
    // ✅ FIX (بلاغ العميل: "ليه معملش زوم"): لو ثانية أي نقطة برة نطاق "من/لحد ثانية"
    // المشهد (زي لو حد كتب رقم المرحلة بدل ثانية الفيديو فعليًا)، كانت بتتحسب في الرندر
    // بس بتتقص (clamp) لبداية/نهاية المشهد من غير أي تنبيه — ولو كل النقط وقعت على نفس
    // القيمة المقصوصة، كل الزوم كان بيتلغي بصمت والفيديو يفضل على الصورة كاملة طول المدة
    const start = Number(csStart), end = Number(csEnd);
    const outOfRange = csKeyframes.filter(k => k.time < start || k.time > end);
    if (outOfRange.length) {
      setErr(`❌ ثانية النقطة لازم تكون بين ${start} و${end} (نطاق المشهد نفسه) — النقط دي برة النطاق: ${outOfRange.map(k => k.time).join('، ')}`);
      return;
    }
    setSaving(true); setErr('');
    try {
      const newScene = {
        imageUrl: csImage.url, imageWidth: csImage.width, imageHeight: csImage.height,
        startTime: Number(csStart), endTime: Number(csEnd), keyframes: csKeyframes,
      };
      await saveScenes([...scenes, newScene]);
      setShowNew(false);
      resetDraft();
    } catch (e) {
      setErr('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteScene = async (idx) => {
    try { await saveScenes(scenes.filter((_, i) => i !== idx)); } catch (e) { console.error(e); }
  };

  return (
    <div style={{ border: '1px solid #2d2d4a', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>🖼️ مشاهد مركّبة (Composite Scenes)</div>
        <button
          style={{ background: 'none', border: '1px solid #2d2d4a', color: '#a78bfa', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
          onClick={() => { setShowNew(v => !v); if (showNew) resetDraft(); }}
        >
          {showNew ? 'إلغاء' : '+ مشهد جديد'}
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 10, lineHeight: 1.7 }}>
        صورة دايجرام واحدة (زي مراحل مرقّمة) بتغطي فترة معيّنة من الفيديو بدل ما تتقسم لملصقات منفصلة — بيتعمل زوم/pan تلقائي بين النقاط اللي تحددها، وبيبدأ/بينتهي بعرض الصورة كاملة.
      </div>

      {scenes.length > 0 && (
        <div style={{ marginBottom: showNew ? 14 : 0 }}>
          {scenes.map((sc, i) => (
            <div key={sc.id || i} style={{ padding: '6px 0', borderBottom: '1px solid #1a1a2e' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={sc.imageUrl} alt="" style={{ width: 50, height: 30, objectFit: 'cover', borderRadius: 4 }} />
                <span style={{ fontSize: 12, color: '#d1d5db' }}>{Number(sc.startTime).toFixed(1)}s–{Number(sc.endTime).toFixed(1)}s · {(sc.keyframes || []).length} نقطة</span>
                <button onClick={() => handleDeleteScene(i)} style={{ marginRight: 'auto', background: 'none', border: '1px solid #2d2d4a', color: '#f87171', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>حذف</button>
              </div>
              {/* ✅ NEW: عرض ثانية كل نقطة صراحة (كان بيوريك العدد بس) — عشان تقدر تتأكد بنفسك
                  إن كل نقطة فعلاً جوه نطاق المشهد، وعشان يبقى سهل تبعتلي سكرين شوت واضح لو فيه مشكلة */}
              {(sc.keyframes || []).length > 0 && (
                <div style={{ fontSize: 11, color: '#7c7c9a', marginTop: 4, paddingRight: 60 }}>
                  {sc.keyframes.map((k, ki) => `${Number(k.time).toFixed(1)}s${k.label ? ` (${k.label})` : ''}`).join(' · ')}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div>
          {!csImage ? (
            <div>
              <input type="file" accept="image/*" onChange={handleImageUpload} disabled={csUploading} style={{ fontSize: 12.5, color: '#d1d5db' }} />
              {csUploading && <span style={{ color: '#7c6af7', fontSize: 12, marginRight: 10 }}>⏳ بيترفع...</span>}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="number" placeholder="من ثانية" value={csStart} onChange={e => setCsStart(e.target.value)} style={{ width: 100, background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }} />
                {audioParts.length > 1 && <AudioPartTimeHelper audioParts={audioParts} onCompute={t => setCsStart(String(t))} />}
                <input type="number" placeholder="لحد ثانية" value={csEnd} onChange={e => setCsEnd(e.target.value)} style={{ width: 100, background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }} />
                {audioParts.length > 1 && <AudioPartTimeHelper audioParts={audioParts} onCompute={t => setCsEnd(String(t))} />}
              </div>
              {audioParts.length > 1 && (
                <div style={{ fontSize: 10.5, color: '#565676', marginBottom: 6 }}>
                  الصوت ده متقسّم لـ{audioParts.length} أجزاء: {audioParts.map(p => `صوت ${p.index} (${p.offsetSec.toFixed(1)}s–${(p.offsetSec + p.durationSec).toFixed(1)}s)`).join(' · ')}
                </div>
              )}
              <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 6, lineHeight: 1.8 }}>
                <b style={{ color: '#c4b5fd' }}>1)</b> اضغط وأنت ماسك زرار الماوس واسحب على الصورة لحد ما تعمل مربع حوالين المرحلة اللي عايزها (سيبه لما توصل للحجم المناسب).<br />
                <b style={{ color: '#c4b5fd' }}>2)</b> بص لجدول الكلمات فوق ودوّر على الكلمة اللي بتتقال فيها المرحلة دي بالظبط، واكتب "ثانية" اللي جنبها (الرقم في العمود التاني) في خانة "ثانية النقطة دي" تحت — دي ثانية من بداية الفيديو كله، مش من بداية المشهد ده.<br />
                <b style={{ color: '#c4b5fd' }}>3)</b> اضغط "+ أضف نقطة". المربع الأخضر المتقطع هيفضل ظاهر يفكّرك إنك حددت النقطة دي. كرّر 1-2-3 لكل مرحلة من الـ 11 مرحلة.
              </div>
              <div
                ref={imgWrapRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={() => {}}
                onMouseLeave={() => {}}
                style={{ position: 'relative', width: '100%', maxWidth: 560, cursor: 'crosshair', userSelect: 'none' }}
              >
                <img src={csImage.url} alt="" draggable={false} style={{ width: '100%', display: 'block', borderRadius: 8, border: '1px solid #2d2d4a' }} />
                {drag && (
                  <div style={{
                    position: 'absolute',
                    left: `${Math.min(drag.startX, drag.curX) * 100}%`,
                    top: `${Math.min(drag.startY, drag.curY) * 100}%`,
                    width: `${Math.abs(drag.curX - drag.startX) * 100}%`,
                    height: `${Math.abs(drag.curY - drag.startY) * 100}%`,
                    border: '2px solid #7c6af7', background: 'rgba(124,106,247,0.2)', pointerEvents: 'none', boxSizing: 'border-box',
                  }} />
                )}
                {csKeyframes.map((k, i) => (
                  <div key={i} style={{
                    position: 'absolute', left: `${k.x * 100}%`, top: `${k.y * 100}%`,
                    width: `${k.width * 100}%`, height: `${k.height * 100}%`,
                    border: '1.5px dashed #22c55e', pointerEvents: 'none', boxSizing: 'border-box',
                  }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <input type="number" placeholder="ثانية النقطة (من بداية الفيديو)" title="الثانية من بداية الفيديو كله اللي المفروض الزوم يوصل عندها للمربع اللي حددته — شوف جدول الكلمات فوق" value={csKeyTime} onChange={e => setCsKeyTime(e.target.value)} style={{ width: 190, background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }} />
                {audioParts.length > 1 && <AudioPartTimeHelper audioParts={audioParts} onCompute={t => setCsKeyTime(String(t))} />}
                <input type="text" placeholder="تسمية (اختياري)" value={csKeyLabel} onChange={e => setCsKeyLabel(e.target.value)} style={{ width: 140, background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }} />
                <button onClick={addKeyframe} disabled={!drag} style={{ background: drag ? '#7c6af7' : '#1a1a2e', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12.5, cursor: drag ? 'pointer' : 'not-allowed' }}>+ أضف نقطة</button>
              </div>

              {csKeyframes.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {csKeyframes.map((k, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#d1d5db', padding: '4px 0' }}>
                      <span>{k.time}s {k.label ? `— ${k.label}` : ''}</span>
                      <button onClick={() => removeKeyframe(i)} style={{ marginRight: 'auto', background: 'none', border: 'none', color: '#f87171', fontSize: 11, cursor: 'pointer' }}>حذف</button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={handleSaveNewScene} disabled={saving} style={{ marginTop: 14, background: saving ? '#1a1a2e' : '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? '⏳ بيحفظ...' : '💾 احفظ المشهد المركّب'}
              </button>
            </div>
          )}
          {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10 }}>{err}</div>}
        </div>
      )}
    </div>
  );
}

// TimelineEditor extracted to ../components/AudioVideoTimelineEditor.jsx (shared, reusable component)

function RatingsTab({ s }) {
  const [ratings, setRatings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterStars, setFilterStars] = useState(0); // 0 = all

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/ratings', { headers });
      const d = await r.json();
      setRatings(d.ratings || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterStars ? ratings.filter(r => r.rating === filterStars) : ratings;
  const avg = ratings.length ? (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(2) : '—';
  const counts = [5, 4, 3, 2, 1].map(n => ratings.filter(r => r.rating === n).length);

  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">⭐ التقييمات — Ratings</div>
        <button style={s.btn()} onClick={load}>🔄 Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="متوسط التقييم" value={avg} color="#fbbf24" />
        <StatCard label="إجمالي التقييمات" value={ratings.length} color="#7c6af7" />
        <StatCard label="5 نجوم" value={counts[0]} color="#22c55e" />
        <StatCard label="نجمة واحدة" value={counts[4]} color="#ef4444" />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button style={s.btn(filterStars === 0 ? '#7c6af7' : '#2d2d4a')} onClick={() => setFilterStars(0)}>الكل ({ratings.length})</button>
        {[5, 4, 3, 2, 1].map((n, i) => (
          <button key={n} style={s.btn(filterStars === n ? '#7c6af7' : '#2d2d4a')} onClick={() => setFilterStars(n)}>
            {'⭐'.repeat(n)} ({counts[i]})
          </button>
        ))}
      </div>

      <div style={s.card}>
        {loading && <div style={{ color: '#6b7280', marginBottom: 12 }}>Loading...</div>}
        <table style={s.table} className="admin-table">
          <thead>
            <tr>
              <th style={s.th}>العميل</th>
              <th style={s.th}>التقييم</th>
              <th style={s.th}>التعليق</th>
              <th style={s.th}>الموديل</th>
              <th style={s.th}>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td style={s.td}>{r.user_email}</td>
                <td style={{ ...s.td, color: r.rating >= 4 ? '#22c55e' : r.rating === 3 ? '#f59e0b' : '#ef4444', fontWeight: 700 }}>
                  {'⭐'.repeat(r.rating)}
                </td>
                <td style={{ ...s.td, maxWidth: 320, whiteSpace: 'pre-wrap' }}>{r.comment || <span style={{ color: '#4b5563' }}>—</span>}</td>
                <td style={{ ...s.td, fontSize: 12, color: '#9ca3af' }}>{r.model_used || '—'}</td>
                <td style={{ ...s.td, fontSize: 12, color: '#6b7280' }}>{new Date(r.created_at).toLocaleString('ar-EG')}</td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#6b7280', padding: 30 }}>مفيش تقييمات لسه</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  STUDIO TAB — Admin Personal Batch Video Generator
// ══════════════════════════════════════════════════════════════════════════
function StudioTab({ s }) {
  const [sceneCount, setSceneCount] = useState(3);
  const [prompts, setPrompts] = useState(Array(3).fill(''));
  const [ratio, setRatio] = useState('16:9');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const timerRef = React.useRef(null);

  const handleSceneCount = (n) => {
    const count = Math.min(Math.max(1, n), 20);
    setSceneCount(count);
    setPrompts(prev => {
      const next = [...prev];
      while (next.length < count) next.push('');
      return next.slice(0, count);
    });
  };

  const startTimer = () => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  };
  const stopTimer = () => { clearInterval(timerRef.current); };

  const handleGenerate = async () => {
    const filled = prompts.filter(p => p.trim());
    if (filled.length === 0) { setError('ادخل prompt واحد على الأقل'); return; }
    if (filled.length < sceneCount) { setError(`في ${sceneCount - filled.length} مشاهد فاضية — اكملهم أو قلل العدد`); return; }
    setError(''); setResult(null); setLoading(true);
    setProgress(`⏳ بيولّد ${sceneCount} مشاهد... (كل مشهد ~30-60 ثانية)`);
    startTimer();
    try {
      const r = await fetch('/api/admin/studio/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompts: prompts.filter(p => p.trim()), ratio }),
      });
      const d = await r.json();
      stopTimer();
      if (d.success) { setProgress(''); setResult(d); }
      else { setError('❌ ' + (d.error || 'Generation failed')); setProgress(''); }
    } catch (e) {
      stopTimer();
      setError('❌ ' + e.message);
      setProgress('');
    }
    setLoading(false);
  };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">🎥 My Studio — Batch Video Generator</div>
        <span style={{ fontSize: 12, color: '#4b5563' }}>Seedance 1 Pro Fast · 5s per scene</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>

        {/* LEFT — prompts */}
        <div style={s.card}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>عدد المشاهد</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button style={{ ...s.btn('#1a1a2e'), width: 32, height: 32, fontSize: 18, padding: 0, border: '1px solid #2d2d4a' }} onClick={() => handleSceneCount(sceneCount - 1)} disabled={loading}>−</button>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#7c6af7', minWidth: 32, textAlign: 'center' }}>{sceneCount}</span>
                <button style={{ ...s.btn('#1a1a2e'), width: 32, height: 32, fontSize: 18, padding: 0, border: '1px solid #2d2d4a' }} onClick={() => handleSceneCount(sceneCount + 1)} disabled={loading}>+</button>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>النسبة</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['16:9', '9:16', '1:1'].map(r => (
                  <button key={r} style={{ ...s.btn(ratio === r ? '#7c6af7' : '#1a1a2e'), border: `1px solid ${ratio === r ? '#7c6af7' : '#2d2d4a'}`, fontSize: 12 }} onClick={() => setRatio(r)} disabled={loading}>{r}</button>
                ))}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <button
                style={{ ...s.btn(loading ? '#1a1a2e' : '#7c6af7'), padding: '10px 28px', fontSize: 14, opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer', border: loading ? '1px solid #2d2d4a' : 'none' }}
                onClick={handleGenerate} disabled={loading}
              >
                {loading ? `⏳ جاري التوليد... ${formatTime(elapsed)}` : `🚀 Generate ${sceneCount} Scenes`}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {prompts.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#1a1a2e', border: '1px solid #2d2d4a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#7c6af7', fontWeight: 700, flexShrink: 0, marginTop: 6 }}>{i + 1}</div>
                <textarea
                  value={p}
                  onChange={e => { const next = [...prompts]; next[i] = e.target.value; setPrompts(next); }}
                  placeholder={`Scene ${i + 1} prompt... (e.g. "cinematic aerial shot of desert at golden hour, slow pan right")`}
                  disabled={loading}
                  style={{ ...s.input, flex: 1, minHeight: 72, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, fontSize: 13, opacity: loading ? 0.5 : 1 }}
                />
              </div>
            ))}
          </div>

          {progress && (
            <div style={{ marginTop: 16, background: '#0a0a18', border: '1px solid #2d2d4a', borderRadius: 10, padding: '14px 18px', color: '#a5b4fc', fontSize: 13 }}>
              {progress}
              <div style={{ marginTop: 8, height: 3, background: '#1a1a2e', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 2, backgroundImage: 'linear-gradient(90deg, #7c6af7 0%, #a78bfa 50%, #7c6af7 100%)', backgroundSize: '200% 100%', animation: 'studioShimmer 2s infinite' }} />
              </div>
              <style>{`@keyframes studioShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
            </div>
          )}
          {error && (
            <div style={{ marginTop: 16, background: '#1c0a0a', border: '1px solid #7f1d1d', borderRadius: 10, padding: '12px 16px', color: '#fca5a5', fontSize: 13 }}>{error}</div>
          )}
        </div>

        {/* RIGHT — result + info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {result && (
            <div style={{ ...s.card, border: '1px solid #166534' }}>
              <div style={{ fontSize: 13, color: '#22c55e', fontWeight: 700, marginBottom: 12 }}>✅ الفيديو جاهز! ({result.scenes} مشاهد)</div>
              <video src={result.url} controls style={{ width: '100%', borderRadius: 8, background: '#000', marginBottom: 12 }} />
              <button onClick={() => downloadRemoteFile(result.url, result.filename)} style={{ ...s.btn('#22c55e'), display: 'block', width: '100%', textAlign: 'center', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '10px' }}>⬇️ تحميل الفيديو</button>
              <div style={{ fontSize: 11, color: '#4b5563', marginTop: 8, fontFamily: 'monospace' }}>{result.filename}</div>
            </div>
          )}
          <div style={{ ...s.card, background: '#0a0a18' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c6af7', marginBottom: 12 }}>📋 معلومات</div>
            {[
              { label: 'Model', value: 'Seedance 1 Pro Fast' },
              { label: 'مدة كل مشهد', value: '5 ثواني' },
              { label: 'الجودة', value: '720p / 24fps' },
              { label: 'الحد الأقصى', value: '20 مشهد' },
              { label: '5 مشاهد ≈', value: '~4 دقائق' },
              { label: '10 مشاهد ≈', value: '~8 دقائق' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 5 ? '1px solid #1a1a2e' : 'none' }}>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{item.label}</span>
                <span style={{ fontSize: 12, color: '#d1d5db', fontWeight: 600 }}>{item.value}</span>
              </div>
            ))}
          </div>
          <div style={{ ...s.card, background: '#0a0a18' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#7c6af7', marginBottom: 10 }}>💡 أمثلة سريعة</div>
            {[
              'Cinematic aerial shot of ancient desert ruins at golden hour, slow dolly forward',
              'Close-up of a luxury watch on marble surface, soft studio lighting, subtle rotation',
              'Dramatic ocean waves crashing against rocky cliffs at sunset, wide establishing shot',
              'Dense forest with rays of light piercing through trees, mystical atmosphere, slow tilt up',
            ].map((example, i) => (
              <div key={i}
                onClick={() => { if (loading) return; const next = [...prompts]; const idx = next.findIndex(p => !p.trim()); if (idx !== -1) { next[idx] = example; setPrompts(next); } }}
                style={{ fontSize: 11, color: '#6b7280', padding: '6px 10px', marginBottom: 4, background: '#111122', borderRadius: 6, cursor: loading ? 'default' : 'pointer', border: '1px solid #1a1a2e', lineHeight: 1.4 }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.color = '#a5b4fc'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; }}
              >{example}</div>
            ))}
            <div style={{ fontSize: 10, color: '#374151', marginTop: 6 }}>اضغط على أي مثال لإضافته لأول مشهد فاضي</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════

// ── Templates Tab ──────────────────────────────────────────────────────────────
const TEMPLATE_MODELS = [
  { key: 'model1', label: 'Model 1 — AI Slices' },
  { key: 'model2', label: 'Model 2 — Real Footage' },
  { key: 'model3', label: 'Model 3 — AI Images' },
  { key: 'model4', label: 'Model 4 — Seedance AI' },
  { key: 'cinematic', label: 'Cinematic AI (Model 5)' },
  { key: 'atlas', label: 'Atlas Map (Model 6)' },
  { key: 'documentary', label: 'Documentary Studio' },
  { key: 'autoedit', label: 'Auto-edit' },
];

function TemplatesTab({ s }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', description: '', model_key: 'model1', prompt: '', video_url: '' });
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);

  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleVideoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('video', file);
      const r = await fetch('/api/templates/upload-video', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: fd,
      });
      const d = await r.json();
      if (d.url) {
        setAddForm(p => ({ ...p, video_url: d.url }));
        showToastMsg('✅ Video uploaded!');
      } else {
        showToastMsg('❌ ' + (d.error || 'Upload failed'));
      }
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setUploading(false);
  };
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/templates', { headers });
      const d = await r.json();
      setTemplates(d.templates || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleAdd = async () => {
    if (!addForm.title.trim() || !addForm.model_key) { showToastMsg('❌ Title and model are required'); return; }
    setAdding(true);
    try {
      const r = await fetch('/api/templates/add', {
        method: 'POST',
        headers,
        body: JSON.stringify(addForm),
      });
      const d = await r.json();
      if (d.success) {
        showToastMsg('✅ Template added successfully!');
        setAddForm({ title: '', description: '', model_key: 'model1', prompt: '', video_url: '' });
        setShowForm(false);
        loadTemplates();
      } else {
        showToastMsg('❌ ' + (d.error || 'Failed to add template'));
      }
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setAdding(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this template?')) return;
    try {
      const r = await fetch('/api/templates/delete', { method: 'POST', headers, body: JSON.stringify({ id }) });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Deleted'); loadTemplates(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.startsWith('✅') ? '#166534' : '#7f1d1d', border: '1px solid ' + (toast.startsWith('✅') ? '#22c55e' : '#ef4444'), borderRadius: 10, padding: '12px 20px', color: '#fff', fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>🎬 Video Templates</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn()} onClick={loadTemplates}>🔄 Refresh</button>
          <button style={s.btn('#22c55e')} onClick={() => setShowForm(v => !v)}>{showForm ? '✕ Cancel' : '+ Add Template'}</button>
        </div>
      </div>

      {/* Add Form */}
      {showForm && (
        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#7c6af7', marginBottom: 20 }}>➕ Add New Template</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title *</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={addForm.title} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} placeholder="Template title..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Model *</div>
              <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={addForm.model_key} onChange={e => setAddForm(p => ({ ...p, model_key: e.target.value }))}>
                {TEMPLATE_MODELS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (optional)</div>
            <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} placeholder="Short description..." />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Prompt / Script *</div>
            <textarea style={{ ...s.input, width: '100%', boxSizing: 'border-box', minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }} value={addForm.prompt} onChange={e => setAddForm(p => ({ ...p, prompt: e.target.value }))} placeholder="The prompt or script the user will get when using this template..." />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Video (optional — for preview)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...s.btn('#7c6af7'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {uploading ? '⏳ Uploading...' : '📤 Upload Video'}
                <input type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoUpload} disabled={uploading} />
              </label>
              <span style={{ color: '#4b5563', fontSize: 12 }}>or paste URL below</span>
            </div>
            <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={addForm.video_url} onChange={e => setAddForm(p => ({ ...p, video_url: e.target.value }))} placeholder="https://youtube.com/... or https://vimeo.com/..." />
            {addForm.video_url && <div style={{ fontSize: 11, color: '#22c55e', marginTop: 4 }}>✅ Video ready: {addForm.video_url.slice(0, 60)}...</div>}
          </div>
          <button style={s.btn('#22c55e')} onClick={handleAdd} disabled={adding}>
            {adding ? '⏳ Adding...' : '✅ Add Template'}
          </button>
        </div>
      )}

      {/* Templates List */}
      {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
      <div style={s.card}>
        {templates.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563' }}>No templates yet. Add the first one above.</div>
        ) : (
          <table style={s.table} className="admin-table">
            <thead>
              <tr>
                <th style={s.th}>Title</th>
                <th style={s.th}>Model</th>
                <th style={s.th}>Description</th>
                <th style={s.th}>Video</th>
                <th style={s.th}>Date</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id}>
                  <td style={s.td}><div style={{ fontWeight: 600, color: '#fff' }}>{t.title}</div></td>
                  <td style={s.td}><span style={{ background: '#1a1a2e', border: '1px solid #2d2d4a', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#7c6af7' }}>{t.model_key}</span></td>
                  <td style={{ ...s.td, maxWidth: 200, fontSize: 12, color: '#6b7280' }}>{t.description || '–'}</td>
                  <td style={s.td}>{t.video_url ? <a href={t.video_url} target="_blank" rel="noreferrer" style={{ color: '#7c6af7', fontSize: 12 }}>▶ View</a> : '–'}</td>
                  <td style={s.td}>{new Date(t.created_at).toLocaleDateString()}</td>
                  <td style={s.td}><button style={s.btn('#7f1d1d')} onClick={() => handleDelete(t.id)}>🗑 Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Courses Tab ──────────────────────────────────────────────────────────────
// ✅ NEW: نظام كورسات حقيقي — كورسات مقفولة للمشتركين بس (plan != 'free')، ماعدا فيديو
// تعريفي واحد بيشرح الموقع نفسه متاح للكل. كل كورس ممكن يحتوي على أكتر من فيديو، وكل
// كورس/فيديو له عنوان/وصف/صورة مصغرة/ملف مرفق خاص بيه. لإضافة نفس الكورس بلغة تانية،
// استخدم "Add translation of an existing course" بدل "New course".
// ✅ استوديو الشخصيات: شخصيات جاهزة (presets) + قوالب ترند (فيديو حركة/كلام يبدّل العميل شخصيته فيه)
function CharacterStudioTab({ s }) {
  const [section, setSection] = useState('templates');
  const [presets, setPresets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [cats, setCats] = useState({ presets: [], templates: [] });
  const [toast, setToast] = useState('');
  const showToastMsg = (m) => { setToast(m); setTimeout(() => setToast(''), 3500); };
  const emptyPreset = { name_ar: '', name_en: '', description_ar: '', description_en: '', image_url: '', category: 'person', hidden_refs: [] };
  const emptyTpl = { title_ar: '', title_en: '', description_ar: '', description_en: '', category: 'viral', cover_url: '', preview_url: '', source_video_url: '', duration_sec: 0, is_featured: false, engine: 'wan_2_2_animate_replace', prompt: '', aspect: '' };
  const [pForm, setPForm] = useState(emptyPreset);
  const [tForm, setTForm] = useState(emptyTpl);
  const [busy, setBusy] = useState('');
  const base = '/api/character-studio/admin';

  const load = async () => {
    try {
      const [a, b] = await Promise.all([fetch(`${base}/presets`, { headers }).then(r => r.json()), fetch(`${base}/templates`, { headers }).then(r => r.json())]);
      setPresets(a.presets || []); setTemplates(b.templates || []); setCats({ presets: a.categories || [], templates: b.categories || [] });
    } catch (e) { console.error(e); }
  };
  useEffect(() => { load(); }, []);

  const upload = async (file, field, setForm) => {
    setBusy(field);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch(`${base}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fd });
      const d = await r.json();
      if (!d.url) { showToastMsg('❌ ' + (d.error || 'Upload failed')); setBusy(''); return; }
      setForm(f => ({
        ...f, [field]: d.url,
        ...(field === 'source_video_url' ? { duration_sec: d.durationSec || f.duration_sec, aspect: d.aspect || f.aspect, preview_url: f.preview_url || d.url, cover_url: f.cover_url || d.coverUrl || '' } : {}),
      }));
      showToastMsg('✅ Uploaded');
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setBusy('');
  };
  // رفع صورة واحدة وإرجاع الرابط (لصور الزوايا المخفية)
  const uploadRaw = async (file) => {
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch(`${base}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fd });
    const d = await r.json();
    if (!d.url) throw new Error(d.error || 'Upload failed');
    if (d.looksLikeSheet) showToastMsg('⚠️ This image looks like a multi-angle sheet (very wide). It is kept as an extra reference but is never used as the single character image — make sure at least one image shows ONE person.');
    return d.url;
  };
  const addHidden = async (files, current, apply) => {
    const list = [...current];
    setBusy('hidden_refs');
    try {
      for (const f of Array.from(files)) { if (list.length >= 6) { showToastMsg('⚠️ Max 6 hidden images'); break; } list.push(await uploadRaw(f)); }
      await apply(list);
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setBusy('');
  };
  const send = async (url, method, body, ok) => {
    try {
      const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json();
      if (r.ok) { showToastMsg('✅ ' + ok); load(); return true; }
      showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    return false;
  };

  const Up = ({ label, accept, field, form, setForm }) => (
    <label style={{ ...s.btn('#374151'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '6px 12px' }}>
      {busy === field ? '⏳ Uploading...' : (form[field] ? '✅ ' : '📤 ') + label}
      <input type="file" accept={accept} style={{ display: 'none' }} disabled={!!busy} onChange={e => { const f = e.target.files[0]; if (f) upload(f, field, setForm); e.target.value = ''; }} />
    </label>
  );
  const Field = ({ label, children }) => <div><div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</div>{children}</div>;
  const inp = { ...s.input, width: '100%', boxSizing: 'border-box' };

  return (
    <div>
      {toast && <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, background: toast.startsWith('✅') ? '#166534' : '#7f1d1d', border: '1px solid ' + (toast.startsWith('✅') ? '#22c55e' : '#ef4444'), borderRadius: 10, padding: '10px 16px', color: '#fff', fontSize: 13 }}>{toast}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>🎭 Character Studio</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn(section === 'templates' ? '#7c3aed' : '#374151')} onClick={() => setSection('templates')}>🔥 Trend templates ({templates.length})</button>
          <button style={s.btn(section === 'presets' ? '#7c3aed' : '#374151')} onClick={() => setSection('presets')}>🧑 Preset characters ({presets.length})</button>
        </div>
      </div>

      {section === 'templates' && (
        <>
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#c4b5fd', marginBottom: 4 }}>➕ New trend template</div>
            <p style={{ fontSize: 11.5, color: '#6b7280', margin: '0 0 14px' }}>ارفع الفيديو اللي فيه الحركة والكلام. العميل يختار شخصيته، وبتتعمل بواحد من محركين: Wan 2.2 Animate Replace بيبدّل الشخص اللي في الفيديو (لازم شخص واحد) ويحافظ على المشهد والصوت الأصلي (أقصى 30 ثانية، رخيص)، أو Seedance 2.5 بيعيد بناء المشهد وبيقدر يغيّر الشكل زي لون الشعر والعضلات (أقصى 30 ثانية، أغلى). السعر بيتحسب لوحده من مدة الفيديو.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
              <Field label="Title (Arabic)"><input style={inp} value={tForm.title_ar} onChange={e => setTForm(f => ({ ...f, title_ar: e.target.value }))} placeholder="رقصة الترند..." /></Field>
              <Field label="Title (English)"><input style={inp} value={tForm.title_en} onChange={e => setTForm(f => ({ ...f, title_en: e.target.value }))} placeholder="Trending dance..." /></Field>
              <Field label="Description (Arabic)"><input style={inp} value={tForm.description_ar} onChange={e => setTForm(f => ({ ...f, description_ar: e.target.value }))} /></Field>
              <Field label="Description (English)"><input style={inp} value={tForm.description_en} onChange={e => setTForm(f => ({ ...f, description_en: e.target.value }))} /></Field>
              <Field label="Category">
                <select style={inp} value={tForm.category} onChange={e => setTForm(f => ({ ...f, category: e.target.value }))}>{(cats.templates.length ? cats.templates : ['viral']).map(c => <option key={c} value={c}>{c}</option>)}</select>
              </Field>
              <Field label="Duration (auto from the video)"><input style={inp} value={tForm.duration_sec || ''} readOnly placeholder="—" /></Field>
              <Field label="Engine">
                <select style={inp} value={tForm.engine} onChange={e => setTForm(f => ({ ...f, engine: e.target.value }))}>
                  <option value="wan_2_2_animate_replace">Wan 2.2 Animate Replace — REPLACES the person in the video with the character and keeps the video scene + original audio (video must have ONE person), up to 30s, cheap (480p $0.02/s, 720p $0.05/s)</option>
                  <option value="seedance_2_5">Seedance 2.5 — keeps the video scene and replaces the person (can also change looks: hair/eyes colour, muscles, effects), up to 30s, much pricier</option>
                </select>
              </Field>
              <Field label={tForm.engine === 'seedance_2_5' ? 'Prompt — describe the transformation/effects (English)' : 'Prompt (not used by Wan Replace)'}>
                <textarea style={{ ...inp, minHeight: 74, fontFamily: 'inherit' }} value={tForm.prompt || ''} maxLength={800} onChange={e => setTForm(f => ({ ...f, prompt: e.target.value }))}
                  placeholder={tForm.engine === 'seedance_2_5' ? 'e.g. At the peak of the scream his muscles swell, his hair turns spiky golden-yellow and his eyes glow yellow, golden lightning around him.' : 'e.g. Keep the same expressions and lip-sync.'} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <Up label="Source video (motion + speech)" accept="video/*" field="source_video_url" form={tForm} setForm={setTForm} />
              <Up label="Preview video (optional)" accept="video/*" field="preview_url" form={tForm} setForm={setTForm} />
              <Up label="Cover image (optional)" accept="image/*" field="cover_url" form={tForm} setForm={setTForm} />
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={tForm.is_featured} onChange={e => setTForm(f => ({ ...f, is_featured: e.target.checked }))} /> Featured</label>
              {tForm.cover_url && <img src={tForm.cover_url} alt="" style={{ height: 44, borderRadius: 6 }} />}
            </div>
            <button style={s.btn('#22c55e')} disabled={!tForm.source_video_url || !tForm.title_ar.trim() || !tForm.title_en.trim()} onClick={async () => { if (await send(`${base}/templates`, 'POST', tForm, 'Template added')) setTForm(emptyTpl); }}>Add template</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
            {templates.map(t => (
              <div key={t.id} style={{ ...s.card, padding: 10, margin: 0, opacity: t.is_published ? 1 : 0.55 }}>
                {t.cover_url ? <img src={t.cover_url} alt="" style={{ width: '100%', aspectRatio: '9/12', objectFit: 'cover', borderRadius: 8 }} /> : <div style={{ height: 120, background: '#111', borderRadius: 8 }} />}
                <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', margin: '8px 0 2px' }}>{t.title_en} {t.is_featured ? '⭐' : ''}</div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: t.engine === 'seedance_2_5' ? '#fbbf24' : '#34d399', margin: '0 0 2px' }}>{t.engine === 'seedance_2_5' ? 'Seedance 2.5 (re-creates the scene, can change looks)' : t.engine === 'wan_2_2_animate_replace' ? 'Wan 2.2 Animate Replace (replaces the person, keeps scene + audio)' : '⚠️ Old engine — pick Wan Replace or Seedance'}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{t.category} · {Math.round(t.duration_sec)}s · {Object.entries(t.costs || {}).map(([k, v]) => `${k}: ${v}cr`).join(' · ')} · used {t.uses_count}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  <button style={{ ...s.btn('#374151'), fontSize: 11, padding: '4px 9px' }} onClick={() => send(`${base}/templates/${t.id}`, 'PUT', { is_published: !t.is_published }, t.is_published ? 'Hidden' : 'Published')}>{t.is_published ? 'Hide' : 'Publish'}</button>
                  <button style={{ ...s.btn('#374151'), fontSize: 11, padding: '4px 9px' }} onClick={() => send(`${base}/templates/${t.id}`, 'PUT', { is_featured: !t.is_featured }, 'Updated')}>{t.is_featured ? 'Unfeature' : 'Feature'}</button>
                  <select value={t.engine === 'prunaai_p_video_animate' ? '' : t.engine} style={{ ...s.btn('#374151'), fontSize: 11, padding: '4px 6px' }} onChange={e => send(`${base}/templates/${t.id}`, 'PUT', { engine: e.target.value }, 'Engine changed')}>
                    <option value="wan_2_2_animate_replace">Wan Replace</option>
                    {t.engine === 'prunaai_p_video_animate' && <option value="" disabled>Pick a new engine…</option>}
                    <option value="seedance_2_5">Seedance 2.5</option>
                  </select>
                  <button style={{ ...s.btn('#7f1d1d'), fontSize: 11, padding: '4px 9px' }} onClick={() => confirm('Delete this template?') && send(`${base}/templates/${t.id}`, 'DELETE', null, 'Deleted')}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {section === 'presets' && (
        <>
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#c4b5fd', marginBottom: 4 }}>➕ New preset character</div>
            <p style={{ fontSize: 11.5, color: '#6b7280', margin: '0 0 14px' }}>شخصية جاهزة (صورة واضحة للوجه/الجسم) العميل يستخدمها في قوالب الترند وفي أي فيديو، أو يحفظها في شخصياته.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
              <Field label="Name (Arabic)"><input style={inp} value={pForm.name_ar} onChange={e => setPForm(f => ({ ...f, name_ar: e.target.value }))} /></Field>
              <Field label="Name (English)"><input style={inp} value={pForm.name_en} onChange={e => setPForm(f => ({ ...f, name_en: e.target.value }))} /></Field>
              <Field label="Description (Arabic)"><input style={inp} value={pForm.description_ar} onChange={e => setPForm(f => ({ ...f, description_ar: e.target.value }))} /></Field>
              <Field label="Description (English)"><input style={inp} value={pForm.description_en} onChange={e => setPForm(f => ({ ...f, description_en: e.target.value }))} /></Field>
              <Field label="Category"><select style={inp} value={pForm.category} onChange={e => setPForm(f => ({ ...f, category: e.target.value }))}>{(cats.presets.length ? cats.presets : ['person']).map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
              <Up label="Face image (shown to customers)" accept="image/*" field="image_url" form={pForm} setForm={setPForm} />
              {pForm.image_url && <img src={pForm.image_url} alt="" style={{ height: 56, borderRadius: 8 }} />}
            </div>
            <div style={{ border: '1px dashed #4b5563', borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fbbf24', marginBottom: 4 }}>🔒 Hidden reference images (all angles — never shown to customers)</div>
              <p style={{ fontSize: 11, color: '#6b7280', margin: '0 0 10px' }}>ارفع لحد 6 صور (وش من الجنب، الضهر، جسم كامل، أو character sheet فيه كل الزوايا). العميل مش بيشوفها في الموقع، بتتستخدم داخليًا في التوليد: الصور دي (مش صورة الوش) هي اللي بتتبعت للموديلات. أول صورة هي صورة التوليد لما الموديل بياخد صورة واحدة (قوالب الترند، Wan 3...)، فخليها صورة واضحة للشخصية (جسم كامل أو وش 3/4)، مش character sheet فيه كذا زاوية في صورة واحدة. باقي الصور بتتبعت كمراجع للموديلات اللي بتقبل أكتر من صورة.</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ ...s.btn('#374151'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '6px 12px' }}>
                  {busy === 'hidden_refs' ? '⏳ Uploading...' : `🔒 Add hidden images (${(pForm.hidden_refs || []).length}/6)`}
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={!!busy} onChange={e => { if (e.target.files.length) addHidden(e.target.files, pForm.hidden_refs || [], async (list) => setPForm(f => ({ ...f, hidden_refs: list }))); e.target.value = ''; }} />
                </label>
                {(pForm.hidden_refs || []).map((u, i) => (
                  <span key={u} style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={u} alt="" style={{ height: 52, borderRadius: 6, opacity: 0.85 }} />
                    <button onClick={() => setPForm(f => ({ ...f, hidden_refs: f.hidden_refs.filter((_, j) => j !== i) }))} style={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, borderRadius: '50%', border: 'none', background: '#7f1d1d', color: '#fff', fontSize: 11, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            </div>
            <button style={s.btn('#22c55e')} disabled={!pForm.image_url || !pForm.name_ar.trim() || !pForm.name_en.trim()} onClick={async () => { if (await send(`${base}/presets`, 'POST', pForm, 'Preset added')) setPForm(emptyPreset); }}>Add preset</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
            {presets.map(p => (
              <div key={p.id} style={{ ...s.card, padding: 10, margin: 0, opacity: p.is_published ? 1 : 0.55 }}>
                <img src={p.image_url} alt="" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', borderRadius: 8 }} />
                <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', margin: '8px 0 2px' }}>{p.name_en}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.category} · 🔒 {(p.hidden_refs || []).length} hidden</div>
                {(p.hidden_refs || []).length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>{p.hidden_refs.map(u => <img key={u} src={u} alt="" style={{ height: 30, borderRadius: 4, opacity: 0.8 }} />)}</div>}
                <label style={{ ...s.btn('#374151'), cursor: 'pointer', display: 'inline-flex', fontSize: 11, padding: '4px 9px', marginTop: 8 }}>
                  {busy === 'hidden_refs' ? '⏳' : '🔒 Hidden images'}
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={!!busy} onChange={e => { if (e.target.files.length) addHidden(e.target.files, p.hidden_refs || [], (list) => send(`${base}/presets/${p.id}`, 'PUT', { hidden_refs: list }, 'Hidden images saved')); e.target.value = ''; }} />
                </label>
                {(p.hidden_refs || []).length > 0 && <button style={{ ...s.btn('#374151'), fontSize: 11, padding: '4px 9px', marginTop: 6, marginInlineStart: 6 }} onClick={() => send(`${base}/presets/${p.id}`, 'PUT', { hidden_refs: [] }, 'Hidden images cleared')}>Clear</button>}
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button style={{ ...s.btn('#374151'), fontSize: 11, padding: '4px 9px' }} onClick={() => send(`${base}/presets/${p.id}`, 'PUT', { is_published: !p.is_published }, 'Updated')}>{p.is_published ? 'Hide' : 'Publish'}</button>
                  <button style={{ ...s.btn('#7f1d1d'), fontSize: 11, padding: '4px 9px' }} onClick={() => confirm('Delete this preset?') && send(`${base}/presets/${p.id}`, 'DELETE', null, 'Deleted')}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CoursesTab({ s }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const emptyAddForm = { mode: 'new', translateGroupKey: '', language: 'ar', title: '', description: '', thumbnail_url: '', intro_video_url: '', attachment_url: '', attachment_label: '', is_free: false, sort_order: 0 };
  const [showForm, setShowForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyAddForm);
  const [adding, setAdding] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);

  const loadCourses = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/courses/admin/list', { headers });
      const d = await r.json();
      setCourses(d.courses || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadCourses(); }, []);

  const uploadCourseFile = async (file, onUrl) => {
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/courses/admin/upload', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fd });
      const d = await r.json();
      if (d.url) { onUrl(d.url); showToastMsg('✅ Uploaded'); }
      else showToastMsg('❌ ' + (d.error || 'Upload failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  const handleAdd = async () => {
    if (!addForm.title.trim()) { showToastMsg('❌ Title is required'); return; }
    if (addForm.mode === 'translation' && !addForm.translateGroupKey) { showToastMsg('❌ Pick which course this is a translation of'); return; }
    setAdding(true);
    try {
      const body = { ...addForm, group_key: addForm.mode === 'translation' ? addForm.translateGroupKey : '' };
      const r = await fetch('/api/courses/admin', { method: 'POST', headers, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.course) {
        showToastMsg('✅ Course added');
        setAddForm(emptyAddForm);
        setShowForm(false);
        loadCourses();
      } else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setAdding(false);
  };

  const handleDeleteCourse = async (id) => {
    if (!confirm('Delete this course and all its videos?')) return;
    try {
      const r = await fetch(`/api/courses/admin/${id}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Deleted'); loadCourses(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  // ── إدارة فيديوهات كل كورس ──
  const [expandedId, setExpandedId] = useState(null);
  const [videosByCourse, setVideosByCourse] = useState({});
  const emptyVideoForm = { title: '', description: '', thumbnail_url: '', video_url: '', attachment_url: '', attachment_label: '', sort_order: 0 };
  const [videoForm, setVideoForm] = useState(emptyVideoForm);
  const [addingVideo, setAddingVideo] = useState(false);

  const loadVideos = async (courseId) => {
    try {
      const r = await fetch(`/api/courses/admin/${courseId}/videos`, { headers });
      const d = await r.json();
      setVideosByCourse(m => ({ ...m, [courseId]: d.videos || [] }));
    } catch (e) { console.error(e); }
  };

  const toggleExpand = (courseId) => {
    if (expandedId === courseId) { setExpandedId(null); return; }
    setExpandedId(courseId);
    setVideoForm(emptyVideoForm);
    if (!videosByCourse[courseId]) loadVideos(courseId);
  };

  const handleAddVideo = async (courseId) => {
    if (!videoForm.title.trim() || !videoForm.video_url.trim()) { showToastMsg('❌ Title and video are required'); return; }
    setAddingVideo(true);
    try {
      const r = await fetch(`/api/courses/admin/${courseId}/videos`, { method: 'POST', headers, body: JSON.stringify(videoForm) });
      const d = await r.json();
      if (d.video) {
        showToastMsg('✅ Video added');
        setVideoForm(emptyVideoForm);
        loadVideos(courseId);
        loadCourses();
      } else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setAddingVideo(false);
  };

  const handleDeleteVideo = async (courseId, videoId) => {
    if (!confirm('Delete this video?')) return;
    try {
      const r = await fetch(`/api/courses/admin/videos/${videoId}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Deleted'); loadVideos(courseId); loadCourses(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  // ── الفيديو التعريفي المجاني بتاع الموقع نفسه (singleton) ──
  const [intro, setIntro] = useState({ title_ar: '', title_en: '', description_ar: '', description_en: '', thumbnail_url: '', video_url: '' });
  const [savingIntro, setSavingIntro] = useState(false);

  const loadIntro = async () => {
    try {
      const r = await fetch('/api/courses/admin/intro-video', { headers });
      const d = await r.json();
      if (d.intro) setIntro(p => ({ ...p, ...d.intro }));
    } catch (e) { console.error(e); }
  };
  useEffect(() => { loadIntro(); }, []);

  const saveIntro = async () => {
    setSavingIntro(true);
    try {
      const r = await fetch('/api/courses/admin/intro-video', { method: 'PUT', headers, body: JSON.stringify(intro) });
      const d = await r.json();
      if (d.intro) showToastMsg('✅ Intro video saved');
      else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setSavingIntro(false);
  };

  const distinctGroups = [];
  const seenGroups = new Set();
  for (const c of courses) {
    if (!seenGroups.has(c.group_key)) { seenGroups.add(c.group_key); distinctGroups.push(c); }
  }

  const UploadBtn = ({ label, accept, uploading, onFile }) => (
    <label style={{ ...s.btn('#374151'), cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '6px 12px' }}>
      {uploading ? '⏳ Uploading...' : label}
      <input type="file" accept={accept} style={{ display: 'none' }} disabled={uploading}
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); e.target.value = ''; }} />
    </label>
  );

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.startsWith('✅') ? '#166534' : '#7f1d1d', border: '1px solid ' + (toast.startsWith('✅') ? '#22c55e' : '#ef4444'), borderRadius: 10, padding: '12px 20px', color: '#fff', fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>🎓 Courses</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn()} onClick={loadCourses}>🔄 Refresh</button>
          <button style={s.btn('#22c55e')} onClick={() => setShowForm(v => !v)}>{showForm ? '✕ Cancel' : '+ Add Course'}</button>
        </div>
      </div>

      {/* Free site intro video — singleton, open to everyone without a subscription */}
      <div style={{ ...s.card, borderColor: '#166534' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>🎬 Free Intro Video (open to everyone, no subscription needed)</div>
        <p style={{ fontSize: 11, color: '#4b5563', margin: '0 0 16px' }}>فيديو واحد بس بيشرح الموقع نفسه — بيظهر للزوار كلهم قبل أي كورس مقفول.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (Arabic)</div>
            <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={intro.title_ar || ''} onChange={e => setIntro(p => ({ ...p, title_ar: e.target.value }))} placeholder="عنوان الفيديو..." />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (English)</div>
            <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={intro.title_en || ''} onChange={e => setIntro(p => ({ ...p, title_en: e.target.value }))} placeholder="Video title..." />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (Arabic)</div>
            <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={intro.description_ar || ''} onChange={e => setIntro(p => ({ ...p, description_ar: e.target.value }))} placeholder="وصف قصير..." />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (English)</div>
            <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={intro.description_en || ''} onChange={e => setIntro(p => ({ ...p, description_en: e.target.value }))} placeholder="Short description..." />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <UploadBtn label="📤 Upload Thumbnail" accept="image/*" onFile={f => uploadCourseFile(f, url => setIntro(p => ({ ...p, thumbnail_url: url })))} />
          {intro.thumbnail_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅ thumbnail ready</span>}
          <UploadBtn label="📤 Upload Video" accept="video/*" onFile={f => uploadCourseFile(f, url => setIntro(p => ({ ...p, video_url: url })))} />
          {intro.video_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅ video ready</span>}
        </div>
        <button style={s.btn('#166534')} onClick={saveIntro} disabled={savingIntro}>{savingIntro ? 'Saving...' : '💾 Save Intro Video'}</button>
      </div>

      {/* Add Course Form */}
      {showForm && (
        <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#7c6af7', marginBottom: 20 }}>➕ Add New Course</div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Type</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#d1d5db', cursor: 'pointer' }}>
                <input type="radio" checked={addForm.mode === 'new'} onChange={() => setAddForm(p => ({ ...p, mode: 'new' }))} /> New course
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#d1d5db', cursor: 'pointer' }}>
                <input type="radio" checked={addForm.mode === 'translation'} onChange={() => setAddForm(p => ({ ...p, mode: 'translation' }))} /> Add translation of an existing course
              </label>
            </div>
          </div>

          {addForm.mode === 'translation' && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Which course is this a translation of? *</div>
              <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={addForm.translateGroupKey} onChange={e => setAddForm(p => ({ ...p, translateGroupKey: e.target.value }))}>
                <option value="">— Select —</option>
                {distinctGroups.map(c => <option key={c.group_key} value={c.group_key}>{c.title} ({c.language})</option>)}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title *</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={addForm.title} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} placeholder="Course title..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Language *</div>
              <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={addForm.language} onChange={e => setAddForm(p => ({ ...p, language: e.target.value }))}>
                <option value="ar">🇸🇦 Arabic</option>
                <option value="en">🇺🇸 English</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description</div>
            <textarea style={{ ...s.input, width: '100%', boxSizing: 'border-box', minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} placeholder="What this course covers..." />
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <UploadBtn label="📤 Thumbnail" accept="image/*" onFile={f => uploadCourseFile(f, url => setAddForm(p => ({ ...p, thumbnail_url: url })))} />
            {addForm.thumbnail_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅ ready</span>}
            <UploadBtn label="📤 Intro/Trailer Video (optional)" accept="video/*" onFile={f => uploadCourseFile(f, url => setAddForm(p => ({ ...p, intro_video_url: url })))} />
            {addForm.intro_video_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅ ready</span>}
          </div>

          <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <UploadBtn label="📎 Course-wide Attachment (optional)" accept="*/*" onFile={f => uploadCourseFile(f, url => setAddForm(p => ({ ...p, attachment_url: url })))} />
            {addForm.attachment_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅ ready</span>}
            <input style={{ ...s.input, width: 220 }} value={addForm.attachment_label} onChange={e => setAddForm(p => ({ ...p, attachment_label: e.target.value }))} placeholder="Attachment label (e.g. Workbook PDF)" />
          </div>

          <div style={{ marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#d1d5db', cursor: 'pointer' }}>
              <input type="checkbox" checked={addForm.is_free} onChange={e => setAddForm(p => ({ ...p, is_free: e.target.checked }))} /> Free (no subscription required)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#6b7280' }}>Sort order</span>
              <input type="number" style={{ ...s.input, width: 70 }} value={addForm.sort_order} onChange={e => setAddForm(p => ({ ...p, sort_order: e.target.value }))} />
            </div>
          </div>

          <button style={s.btn('#22c55e')} onClick={handleAdd} disabled={adding}>{adding ? '⏳ Adding...' : '✅ Add Course'}</button>
        </div>
      )}

      {/* Courses List */}
      {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
      <div style={s.card}>
        {courses.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563' }}>No courses yet. Add the first one above.</div>
        ) : (
          <table style={s.table} className="admin-table">
            <thead>
              <tr>
                <th style={s.th}>Title</th>
                <th style={s.th}>Lang</th>
                <th style={s.th}>Access</th>
                <th style={s.th}>Videos</th>
                <th style={s.th}>Group</th>
                <th style={s.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map(c => (
                <React.Fragment key={c.id}>
                  <tr>
                    <td style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {c.thumbnail_url && <img src={c.thumbnail_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />}
                        <div style={{ fontWeight: 600, color: '#fff' }}>{c.title}</div>
                      </div>
                    </td>
                    <td style={s.td}>{c.language === 'en' ? '🇺🇸 EN' : '🇸🇦 AR'}</td>
                    <td style={s.td}>{c.is_free ? <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 700 }}>Free</span> : <span style={{ color: '#c4b5fd', fontSize: 11, fontWeight: 700 }}>Subscribers only</span>}</td>
                    <td style={s.td}>{c.video_count}</td>
                    <td style={{ ...s.td, fontSize: 10, color: '#4b5563' }}>{c.group_key.slice(0, 16)}…</td>
                    <td style={{ ...s.td, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button style={s.btn('#374151')} onClick={() => toggleExpand(c.id)}>{expandedId === c.id ? '▲ Hide Videos' : '▼ Manage Videos'}</button>
                      <button style={s.btn('#7f1d1d')} onClick={() => handleDeleteCourse(c.id)}>🗑 Delete</button>
                    </td>
                  </tr>
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0, borderBottom: '1px solid #1a1a2e' }}>
                        <div style={{ background: '#0a0a14', padding: 20 }}>
                          {(videosByCourse[c.id] || []).length === 0 ? (
                            <div style={{ fontSize: 12, color: '#4b5563', marginBottom: 16 }}>No videos in this course yet.</div>
                          ) : (
                            <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {(videosByCourse[c.id] || []).map(v => (
                                <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 8, padding: '8px 12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {v.thumbnail_url && <img src={v.thumbnail_url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 5 }} />}
                                    <div>
                                      <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 600 }}>{v.title}</div>
                                      {v.attachment_url && <div style={{ fontSize: 10, color: '#7c6af7' }}>📎 {v.attachment_label || 'attachment'}</div>}
                                    </div>
                                  </div>
                                  <button style={{ ...s.btn('#7f1d1d'), fontSize: 11, padding: '4px 10px' }} onClick={() => handleDeleteVideo(c.id, v.id)}>🗑</button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#7c6af7', marginBottom: 10 }}>+ Add Video to this Course</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }} className="admin-grid-2">
                            <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={videoForm.title} onChange={e => setVideoForm(p => ({ ...p, title: e.target.value }))} placeholder="Video title..." />
                            <input type="number" style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={videoForm.sort_order} onChange={e => setVideoForm(p => ({ ...p, sort_order: e.target.value }))} placeholder="Sort order" />
                          </div>
                          <textarea style={{ ...s.input, width: '100%', boxSizing: 'border-box', minHeight: 50, resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }} value={videoForm.description} onChange={e => setVideoForm(p => ({ ...p, description: e.target.value }))} placeholder="Video description..." />
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                            <UploadBtn label="📤 Thumbnail" accept="image/*" onFile={f => uploadCourseFile(f, url => setVideoForm(p => ({ ...p, thumbnail_url: url })))} />
                            {videoForm.thumbnail_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅</span>}
                            <UploadBtn label="📤 Video *" accept="video/*" onFile={f => uploadCourseFile(f, url => setVideoForm(p => ({ ...p, video_url: url })))} />
                            {videoForm.video_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                            <UploadBtn label="📎 Attachment (optional)" accept="*/*" onFile={f => uploadCourseFile(f, url => setVideoForm(p => ({ ...p, attachment_url: url })))} />
                            {videoForm.attachment_url && <span style={{ fontSize: 11, color: '#22c55e' }}>✅</span>}
                            <input style={{ ...s.input, width: 200 }} value={videoForm.attachment_label} onChange={e => setVideoForm(p => ({ ...p, attachment_label: e.target.value }))} placeholder="Attachment label" />
                          </div>
                          <button style={s.btn('#22c55e')} onClick={() => handleAddVideo(c.id)} disabled={addingVideo}>{addingVideo ? '⏳ Adding...' : '✅ Add Video'}</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Changelog Tab ─────────────────────────────────────────────────────────────
// ✅ NEW (طلب العميل: صفحة "إيه الجديد"/changelog عامة زي المواقع الكبيرة): كل تحديث بعنوان/وصف
// ثنائي اللغة (نفس نمط الكورسات فوق)، تاج بيوصف نوعه، وتاريخ — بيظهر في /changelog للكل
const CHANGELOG_TAGS = [
  { key: 'new', label: '🟣 New', color: '#7c3aed' },
  { key: 'improved', label: '🔵 Improved', color: '#3b82f6' },
  { key: 'fixed', label: '🟢 Fixed', color: '#22c55e' },
  { key: 'coming_soon', label: '🟠 Coming Soon', color: '#f59e0b' },
];

function DocumentaryTab({ s }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const r = await fetch(`/api/documentary/admin/stats?days=${days}`, { headers });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setData(d);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, [days]);
  useEffect(() => { load(); }, [load]);
  const publishExample = async (id) => {
    if (!confirm(`Publish film #${id} on the public Templates page as an example?`)) return;
    try {
      const r = await fetch('/api/documentary/admin/publish-example', { method: 'POST', headers, body: JSON.stringify({ jobId: id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      alert('✅ Published — it now appears on the Templates page.');
    } catch (e) { alert('❌ ' + e.message); }
  };
  const T = data?.totals;
  const fmtDate = (x) => (x ? new Date(x).toLocaleString() : '');
  const stat = (label, value, color) => (
    <div style={{ background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 10, padding: '12px 14px', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color || '#fff' }}>{value}</div>
    </div>
  );
  return (
    <div>
      <div style={s.topbar} className="admin-header">
        <div style={s.title} className="admin-header-title">🎞️ Documentary Studio</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={days} onChange={e => setDays(Number(e.target.value))} style={s.input}>
            {[7, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button style={s.btn()} onClick={load}>🔄 Refresh</button>
        </div>
      </div>
      {loading && <div style={{ color: '#6b7280', marginBottom: 12 }}>Loading...</div>}
      {err && <div style={{ color: '#f87171', marginBottom: 12 }}>❌ {err}</div>}
      {T && (<>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          {stat('Films', T.jobs)}
          {stat('Done', T.done, '#22c55e')}
          {stat('Failed', T.failed, T.failed ? '#f87171' : '#fff')}
          {stat('In progress', T.active, '#f59e0b')}
          {stat('Success rate', T.done + T.failed ? `${Math.round((T.done / (T.done + T.failed)) * 100)}%` : '—')}
          {stat('Users', T.users)}
          {stat('Credits charged', T.charged)}
          {stat('Credits refunded', T.refunded, '#f59e0b')}
          {stat('Net credits', T.charged - T.refunded, '#22c55e')}
          {stat('Film minutes made', (T.total_duration / 60).toFixed(1))}
          {stat('Avg film length', `${Math.round(T.avg_duration)}s`)}
          {stat('Avg time to finish', `${Math.round(T.avg_wall_secs)}s`)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 12, marginBottom: 16 }}>
          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>By input mode</div>
            {data.byMode.length === 0 && <div style={{ color: '#6b7280', fontSize: 12.5 }}>No data.</div>}
            {data.byMode.map(m => <div key={m.mode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}><span>{m.mode}</span><span style={{ color: '#9ca3af' }}>{m.jobs} films · <span style={{ color: m.failed ? '#f87171' : '#6b7280' }}>{m.failed} failed</span></span></div>)}
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Where failures happen</div>
            {data.failuresByStage.length === 0 && <div style={{ color: '#22c55e', fontSize: 12.5 }}>No failures 🎉</div>}
            {data.failuresByStage.map(f => <div key={f.stage} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}><span>{f.stage}</span><span style={{ color: '#f87171' }}>{f.n}</span></div>)}
          </div>
          <div style={s.card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Per day</div>
            {data.perDay.slice(0, 8).map(d => <div key={d.day} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}><span>{d.day}</span><span style={{ color: '#9ca3af' }}>{d.jobs} <span style={{ color: d.failed ? '#f87171' : '#6b7280' }}>({d.failed} failed)</span></span></div>)}
          </div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Recent failures</div>
          {data.recentFailures.length === 0 && <div style={{ color: '#6b7280', fontSize: 12.5 }}>None.</div>}
          {data.recentFailures.map(f => (
            <div key={f.id} style={{ padding: '8px 0', borderBottom: '1px solid #1a1a2e', fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span><strong>#{f.id}</strong> · {f.email || 'user'} · stage <span style={{ color: '#f59e0b' }}>{f.stage || '?'}</span></span>
                <span style={{ color: '#6b7280' }}>{fmtDate(f.created_at)} · refunded {f.credits_charged}</span>
              </div>
              <div style={{ color: '#f87171', marginTop: 3, wordBreak: 'break-word' }}>{f.error_detail || '—'}</div>
            </div>
          ))}
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 10 }}>Latest films</div>
          {data.recent.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '7px 0', borderBottom: '1px solid #1a1a2e', fontSize: 12.5 }}>
              <span><strong>#{r.id}</strong> {r.title || ''} <span style={{ color: '#6b7280' }}>· {r.email || 'user'}</span></span>
              <span style={{ color: r.status === 'done' ? '#22c55e' : r.status === 'failed' ? '#f87171' : '#f59e0b' }}>{r.status}{r.status === 'processing' ? ` ${r.progress}%` : ''} · {r.duration_sec ? Math.round(r.duration_sec) + 's' : '—'} · {r.credits_charged - r.credits_refunded} cr · {fmtDate(r.created_at)}
                {r.status === 'done' && <button style={{ ...s.btn('#14532d'), fontSize: 11, padding: '3px 9px', marginInlineStart: 8 }} onClick={() => publishExample(r.id)}>⭐ Publish as example</button>}
              </span>
            </div>
          ))}
        </div>
      </>)}
    </div>
  );
}

function ChangelogTab({ s }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const emptyForm = { id: null, entry_date: new Date().toISOString().slice(0, 10), tag: 'new', title_ar: '', title_en: '', description_ar: '', description_en: '', is_published: true, sort_order: 0 };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/changelog/admin/list', { headers });
      const d = await r.json();
      setEntries(d.entries || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadEntries(); }, []);

  const handleSave = async () => {
    if (!form.title_ar.trim() || !form.title_en.trim()) { showToastMsg('❌ Title (AR + EN) is required'); return; }
    setSaving(true);
    try {
      const url = form.id ? `/api/changelog/admin/${form.id}` : '/api/changelog/admin';
      const method = form.id ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers, body: JSON.stringify(form) });
      const d = await r.json();
      if (d.entry) {
        showToastMsg(form.id ? '✅ Entry updated' : '✅ Entry added');
        setForm(emptyForm);
        setShowForm(false);
        loadEntries();
      } else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setSaving(false);
  };

  const handleEdit = (entry) => {
    setForm({
      id: entry.id, entry_date: (entry.entry_date || '').slice(0, 10), tag: entry.tag || 'new',
      title_ar: entry.title_ar || '', title_en: entry.title_en || '',
      description_ar: entry.description_ar || '', description_en: entry.description_en || '',
      is_published: entry.is_published !== 0, sort_order: entry.sort_order || 0,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this changelog entry?')) return;
    try {
      const r = await fetch(`/api/changelog/admin/${id}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Deleted'); loadEntries(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.startsWith('✅') ? '#166534' : '#7f1d1d', border: '1px solid ' + (toast.startsWith('✅') ? '#22c55e' : '#ef4444'), borderRadius: 10, padding: '12px 20px', color: '#fff', fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>📰 Changelog</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn()} onClick={loadEntries}>🔄 Refresh</button>
          <button style={s.btn('#22c55e')} onClick={() => { setForm(emptyForm); setShowForm(v => !v); }}>{showForm ? '✕ Cancel' : '+ Add Entry'}</button>
        </div>
      </div>

      {showForm && (
        <div style={s.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Date</div>
              <input type="date" style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.entry_date} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Tag</div>
              <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.tag} onChange={e => setForm(p => ({ ...p, tag: e.target.value }))}>
                {CHANGELOG_TAGS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (Arabic)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.title_ar} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} placeholder="عنوان قصير..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (English)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.title_en} onChange={e => setForm(p => ({ ...p, title_en: e.target.value }))} placeholder="Short title..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (Arabic)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.description_ar} onChange={e => setForm(p => ({ ...p, description_ar: e.target.value }))} placeholder="وصف قصير (اختياري)..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (English)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.description_en} onChange={e => setForm(p => ({ ...p, description_en: e.target.value }))} placeholder="Short description (optional)..." />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_published} onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))} />
            Published (visible on the public /changelog page)
          </label>
          <button style={s.btn('#166534')} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : (form.id ? '💾 Save Changes' : '💾 Add Entry')}</button>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '20px 0', color: '#4b5563' }}>Loading...</div>}
      {!loading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563' }}>No entries yet. Add the first one above.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(en => {
          const tagInfo = CHANGELOG_TAGS.find(t => t.key === en.tag) || CHANGELOG_TAGS[0];
          return (
            <div key={en.id} style={{ ...s.card, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: tagInfo.color, background: `${tagInfo.color}22`, border: `1px solid ${tagInfo.color}55`, borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>{tagInfo.label}</span>
                <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>{(en.entry_date || '').slice(0, 10)}</span>
                <span style={{ fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{en.title_en}</span>
                {!en.is_published && <span style={{ fontSize: 11, color: '#f59e0b', flexShrink: 0 }}>(draft)</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button style={s.btn('#374151')} onClick={() => handleEdit(en)}>✏️ Edit</button>
                <button style={s.btn('#7f1d1d')} onClick={() => handleDelete(en.id)}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Terms Agreements Tab ──────────────────────────────────────────────────
// موافقات العملاء على الشروط والخصوصية: ✓ + الـid + الإيميل + وقت الموافقة + نسخة الشروط + الـIP (الـid رقم داخلي بس — الصفحة دي للأدمن فقط)
function TermsTab({ s }) {
  const [data, setData] = useState({ users: [], total: 0, agreed: 0, missing: 0 });
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ status, search, limit: '1000' });
      const r = await fetch(`/api/admin/terms-agreements?${qs}`, { headers });
      const d = await r.json();
      if (r.ok) setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [status, search]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);
  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['agreed', 'id', 'email', 'name', 'agreed_at', 'terms_version', 'ip'], ...data.users.map(u => [u.terms_accepted_at ? 'yes' : 'no', u.id, u.email, u.name || '', u.terms_accepted_at || '', u.terms_version || '', u.terms_accepted_ip || ''])];
    const blob = new Blob(['\ufeff' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `erivion-terms-agreements-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  const chip = (key, label) => (
    <button key={key} onClick={() => setStatus(key)} style={{ ...s.btn(status === key ? '#4f46e5' : '#1f2937'), border: `1px solid ${status === key ? '#6366f1' : '#374151'}` }}>{label}</button>
  );
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 6 }}>✅ Terms & Privacy agreements</div>
      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14, lineHeight: 1.7 }}>
        Every customer who ticked "I Agree" on sign-up is recorded here with the time, the terms version and the IP. Accounts created before agreement tracking was added are marked ✓ "legacy": they went through the sign-up flow where the agreement step was mandatory, but the exact click time/IP was not recorded (the time shown is their registration time).
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ ...s.card, padding: '10px 16px', marginBottom: 0 }}><div style={{ fontSize: 11, color: '#9ca3af' }}>Customers</div><div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{data.total}</div></div>
        <div style={{ ...s.card, padding: '10px 16px', marginBottom: 0 }}><div style={{ fontSize: 11, color: '#9ca3af' }}>Agreed</div><div style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{data.agreed}</div></div>
        <div style={{ ...s.card, padding: '10px 16px', marginBottom: 0 }}><div style={{ fontSize: 11, color: '#9ca3af' }}>No record</div><div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{data.missing}</div></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {chip('all', 'All')}{chip('agreed', '✓ Agreed')}{chip('missing', '✗ No record')}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search email, name or ID…" style={{ ...s.input, minWidth: 220 }} />
        <button onClick={exportCsv} style={s.btn('#065f46')}>⬇ Export CSV</button>
        {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>
            <th style={s.th}>Agreed</th><th style={s.th}>ID</th><th style={s.th}>Email</th><th style={s.th}>Name</th><th style={s.th}>Agreed at</th><th style={s.th}>Version</th><th style={s.th}>IP</th>
          </tr></thead>
          <tbody>
            {data.users.map(u => (
              <tr key={u.id}>
                <td style={s.td}>{u.terms_accepted_at ? <span style={{ color: '#22c55e', fontSize: 18, fontWeight: 800 }}>✓</span> : <span style={{ color: '#ef4444', fontSize: 16, fontWeight: 800 }}>✗</span>}</td>
                <td style={{ ...s.td, fontVariantNumeric: 'tabular-nums', color: '#a5b4fc' }}>{u.id}</td>
                <td style={s.td}>{u.email}</td>
                <td style={{ ...s.td, color: '#9ca3af' }}>{u.name || '–'}</td>
                <td style={s.td}>{u.terms_accepted_at ? new Date(u.terms_accepted_at).toLocaleString() : '–'}</td>
                <td style={s.td}>{u.terms_version === 'legacy' ? <span style={{ color: '#f59e0b' }} title="Account created before agreement tracking; it passed the sign-up flow where the agreement step was mandatory. Exact time/IP not recorded.">legacy</span> : (u.terms_version ? `v${u.terms_version}` : '–')}</td>
                <td style={{ ...s.td, color: '#9ca3af' }}>{u.terms_accepted_ip || '–'}</td>
              </tr>
            ))}
            {data.users.length === 0 && <tr><td colSpan={7} style={{ ...s.td, textAlign: 'center', color: '#6b7280' }}>{loading ? 'Loading…' : 'No customers match.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Finance Tab ───────────────────────────────────────────────────────────────
// ✅ NEW (طلب العميل: "عايز اعمل نظام يحدد المصروفات والمدخولات... عشان لما اسجل الموقع
// تجاري" — دفتر حسابات يدوي بحت، أدمن بس مفيش صفحة عامة): كل حركة (مصروف زي Replicate، أو
// دخل زي InstaPay/Gumroad) بتاريخها وفئتها ومبلغها وعملتها، مع إيصال مرفق اختياري. الملخص
// بيتحسب لكل عملة لوحدها (مفيش تحويل بسعر صرف ثابت هيبقى غلط بمرور الوقت)
function FinanceTab({ s }) {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const [filter, setFilter] = useState({ from: '', to: '', type: '' });

  const emptyForm = { id: null, entry_date: new Date().toISOString().slice(0, 10), type: 'expense', category: '', amount: '', currency: 'EGP', notes: '', receipt_url: '' };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const queryString = () => {
    const p = new URLSearchParams();
    if (filter.from) p.set('from', filter.from);
    if (filter.to) p.set('to', filter.to);
    if (filter.type) p.set('type', filter.type);
    return p.toString();
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const qs = queryString();
      const [er, sr] = await Promise.all([
        fetch(`/api/finance/admin/list?${qs}`, { headers }),
        fetch(`/api/finance/admin/summary?${qs}`, { headers }),
      ]);
      const ed = await er.json();
      const sd = await sr.json();
      setEntries(ed.entries || []);
      setSummary(sd.summary || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadAll(); }, [filter.from, filter.to, filter.type]);

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = queryString();
      const r = await fetch(`/api/finance/admin/export?${qs}`, { headers: { Authorization: `Bearer ${adminToken}` } });
      if (!r.ok) { const d = await r.json().catch(() => ({})); showToastMsg('❌ ' + (d.error || 'Export failed')); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erivion-finance-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setExporting(false);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/finance/admin/upload-receipt', { method: 'POST', headers: { Authorization: `Bearer ${adminToken}` }, body: fd });
      const d = await r.json();
      if (d.url) { setForm(p => ({ ...p, receipt_url: d.url })); showToastMsg('✅ Receipt uploaded'); }
      else showToastMsg('❌ ' + (d.error || 'Upload failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setUploading(false);
  };

  const handleSave = async () => {
    if (!form.category.trim()) { showToastMsg('❌ Category is required'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { showToastMsg('❌ Amount must be a positive number'); return; }
    setSaving(true);
    try {
      const url = form.id ? `/api/finance/admin/${form.id}` : '/api/finance/admin';
      const method = form.id ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers, body: JSON.stringify(form) });
      const d = await r.json();
      if (d.entry) {
        showToastMsg(form.id ? '✅ Entry updated' : '✅ Entry added');
        setForm(emptyForm);
        setShowForm(false);
        loadAll();
      } else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setSaving(false);
  };

  const handleEdit = (entry) => {
    setForm({
      id: entry.id, entry_date: (entry.entry_date || '').slice(0, 10), type: entry.type || 'expense',
      category: entry.category || '', amount: String(entry.amount ?? ''), currency: entry.currency || 'EGP',
      notes: entry.notes || '', receipt_url: entry.receipt_url || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try {
      const r = await fetch(`/api/finance/admin/${id}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Deleted'); loadAll(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.startsWith('✅') ? '#166534' : '#7f1d1d', border: '1px solid ' + (toast.startsWith('✅') ? '#22c55e' : '#ef4444'), borderRadius: 10, padding: '12px 20px', color: '#fff', fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>🧾 Finance</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn()} onClick={loadAll}>🔄 Refresh</button>
          <button style={s.btn('#374151')} onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting...' : '⬇️ Export Excel'}</button>
          <button style={s.btn('#22c55e')} onClick={() => { setForm(emptyForm); setShowForm(v => !v); }}>{showForm ? '✕ Cancel' : '+ Add Entry'}</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {summary.length === 0 && !loading && <div style={{ color: '#4b5563', fontSize: 13 }}>No entries in this range yet.</div>}
        {summary.map(c => (
          <div key={c.currency} style={{ ...s.card, marginBottom: 0, minWidth: 220, flex: '1 1 220px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', marginBottom: 8 }}>{c.currency}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: '#6b7280' }}>Income</span><span style={{ color: '#22c55e', fontWeight: 700 }}>+{c.income.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
              <span style={{ color: '#6b7280' }}>Expense</span><span style={{ color: '#ef4444', fontWeight: 700 }}>-{c.expense.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px solid #27272a', paddingTop: 8 }}>
              <span style={{ color: '#d1d5db', fontWeight: 600 }}>Net</span>
              <span style={{ color: c.net >= 0 ? '#22c55e' : '#ef4444', fontWeight: 800 }}>{c.net >= 0 ? '+' : ''}{c.net.toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>From</div>
          <input type="date" style={s.input} value={filter.from} onChange={e => setFilter(p => ({ ...p, from: e.target.value }))} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>To</div>
          <input type="date" style={s.input} value={filter.to} onChange={e => setFilter(p => ({ ...p, to: e.target.value }))} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Type</div>
          <select style={s.input} value={filter.type} onChange={e => setFilter(p => ({ ...p, type: e.target.value }))}>
            <option value="">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        {(filter.from || filter.to || filter.type) && (
          <button style={s.btn('#374151')} onClick={() => setFilter({ from: '', to: '', type: '' })}>✕ Clear filters</button>
        )}
      </div>

      {showForm && (
        <div style={s.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Date</div>
              <input type="date" style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.entry_date} onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Type</div>
              <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Category</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Replicate, Railway hosting, InstaPay payment..." />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Amount</div>
                <input type="number" step="0.01" style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
              </div>
              <div style={{ width: 100 }}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Currency</div>
                <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))}>
                  <option value="EGP">EGP</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Notes (optional)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any extra detail..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Receipt / Invoice (optional)</div>
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} disabled={uploading} />
              {uploading && <span style={{ fontSize: 12, color: '#9ca3af', marginInlineStart: 8 }}>Uploading...</span>}
              {form.receipt_url && <a href={form.receipt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3b82f6', marginInlineStart: 8 }}>📎 View uploaded receipt</a>}
            </div>
          </div>
          <button style={s.btn('#166534')} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : (form.id ? '💾 Save Changes' : '💾 Add Entry')}</button>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '20px 0', color: '#4b5563' }}>Loading...</div>}
      {!loading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563' }}>No entries yet. Add the first one above.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(en => (
          <div key={en.id} style={{ ...s.card, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: en.type === 'income' ? '#22c55e' : '#ef4444', background: en.type === 'income' ? '#22c55e22' : '#ef444422', border: `1px solid ${en.type === 'income' ? '#22c55e55' : '#ef444455'}`, borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>
                {en.type === 'income' ? '↑ Income' : '↓ Expense'}
              </span>
              <span style={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>{(en.entry_date || '').slice(0, 10)}</span>
              <span style={{ fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{en.category}</span>
              <span style={{ fontWeight: 700, color: en.type === 'income' ? '#22c55e' : '#ef4444', flexShrink: 0 }}>{en.type === 'income' ? '+' : '-'}{Number(en.amount).toLocaleString()} {en.currency}</span>
              {en.receipt_url && <a href={en.receipt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3b82f6', flexShrink: 0 }}>📎 Receipt / Invoice</a>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button style={s.btn('#374151')} onClick={() => handleEdit(en)}>✏️ Edit</button>
              <button style={s.btn('#7f1d1d')} onClick={() => handleDelete(en.id)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Roadmap Tab ───────────────────────────────────────────────────────────────
// ✅ NEW (طلب العميل: صفحة "الجاي" عامة بتصويت حقيقي من العملاء): عكس الـchangelog، الأدمن هنا
// بيتحكم في الحالة (مخطط له/شغالين عليه/خلص) بس، وعدد الأصوات بيتحسب أوتوماتيك من تصويت
// العملاء الحقيقي (مش قابل للتعديل يدويًا هنا)
const ROADMAP_STATUSES = [
  { key: 'planned', label: '⚪ Planned', color: '#6b7280' },
  { key: 'in_progress', label: '🔵 In Progress', color: '#3b82f6' },
  { key: 'done', label: '🟢 Done', color: '#22c55e' },
];

function RoadmapTab({ s }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const emptyForm = { id: null, status: 'planned', title_ar: '', title_en: '', description_ar: '', description_en: '', is_published: true, sort_order: 0 };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const loadItems = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/roadmap/admin/list', { headers });
      const d = await r.json();
      setItems(d.items || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadItems(); }, []);

  const handleSave = async () => {
    if (!form.title_ar.trim() || !form.title_en.trim()) { showToastMsg('❌ Title (AR + EN) is required'); return; }
    setSaving(true);
    try {
      const url = form.id ? `/api/roadmap/admin/${form.id}` : '/api/roadmap/admin';
      const method = form.id ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers, body: JSON.stringify(form) });
      const d = await r.json();
      if (d.item) {
        showToastMsg(form.id ? '✅ Item updated' : '✅ Item added');
        setForm(emptyForm);
        setShowForm(false);
        loadItems();
      } else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setSaving(false);
  };

  const handleEdit = (item) => {
    setForm({
      id: item.id, status: item.status || 'planned',
      title_ar: item.title_ar || '', title_en: item.title_en || '',
      description_ar: item.description_ar || '', description_en: item.description_en || '',
      is_published: item.is_published !== 0, sort_order: item.sort_order || 0,
    });
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this roadmap item (and all its votes)?')) return;
    try {
      const r = await fetch(`/api/roadmap/admin/${id}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Deleted'); loadItems(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.startsWith('✅') ? '#166534' : '#7f1d1d', border: '1px solid ' + (toast.startsWith('✅') ? '#22c55e' : '#ef4444'), borderRadius: 10, padding: '12px 20px', color: '#fff', fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>🗺️ Roadmap</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn()} onClick={loadItems}>🔄 Refresh</button>
          <button style={s.btn('#22c55e')} onClick={() => { setForm(emptyForm); setShowForm(v => !v); }}>{showForm ? '✕ Cancel' : '+ Add Item'}</button>
        </div>
      </div>

      {showForm && (
        <div style={s.card}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Status</div>
              <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                {ROADMAP_STATUSES.map(st => <option key={st.key} value={st.key}>{st.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Sort Order</div>
              <input type="number" style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.sort_order} onChange={e => setForm(p => ({ ...p, sort_order: e.target.value }))} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (Arabic)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.title_ar} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} placeholder="عنوان قصير..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (English)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.title_en} onChange={e => setForm(p => ({ ...p, title_en: e.target.value }))} placeholder="Short title..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (Arabic)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.description_ar} onChange={e => setForm(p => ({ ...p, description_ar: e.target.value }))} placeholder="وصف قصير (اختياري)..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (English)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.description_en} onChange={e => setForm(p => ({ ...p, description_en: e.target.value }))} placeholder="Short description (optional)..." />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#9ca3af', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_published} onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))} />
            Published (visible on the public /roadmap page)
          </label>
          <button style={s.btn('#166534')} onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : (form.id ? '💾 Save Changes' : '💾 Add Item')}</button>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '20px 0', color: '#4b5563' }}>Loading...</div>}
      {!loading && items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563' }}>No items yet. Add the first one above.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(it => {
          const statusInfo = ROADMAP_STATUSES.find(st => st.key === it.status) || ROADMAP_STATUSES[0];
          return (
            <div key={it.id} style={{ ...s.card, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: statusInfo.color, background: `${statusInfo.color}22`, border: `1px solid ${statusInfo.color}55`, borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>{statusInfo.label}</span>
                <span style={{ fontSize: 12, color: '#a78bfa', flexShrink: 0 }}>▲ {it.vote_count}</span>
                <span style={{ fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title_en}</span>
                {!it.is_published && <span style={{ fontSize: 11, color: '#f59e0b', flexShrink: 0 }}>(draft)</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button style={s.btn('#374151')} onClick={() => handleEdit(it)}>✏️ Edit</button>
                <button style={s.btn('#7f1d1d')} onClick={() => handleDelete(it.id)}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Status Incidents Tab ─────────────────────────────────────────────────────
// ✅ NEW (طلب العميل: صفحة "System Status" عامة زي المواقع الكبيرة): الأدمن هنا بس بيدير
// بلاغات الأعطال اليدوية — الفحوصات الحية (DB/تخزين/محركات AI) بتتحسب تلقائي من غير تدخل هنا
const INCIDENT_SEVERITIES = [
  { key: 'info', label: 'ℹ️ Info', color: '#3b82f6' },
  { key: 'degraded', label: '🟡 Degraded', color: '#f59e0b' },
  { key: 'outage', label: '🔴 Outage', color: '#ef4444' },
];

function StatusIncidentsTab({ s }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const emptyForm = { severity: 'degraded', title_ar: '', title_en: '', description_ar: '', description_en: '' };
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [posting, setPosting] = useState(false);

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/system-status/admin/list', { headers });
      const d = await r.json();
      setIncidents(d.incidents || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadIncidents(); }, []);

  const handlePost = async () => {
    if (!form.title_ar.trim() || !form.title_en.trim()) { showToastMsg('❌ Title (AR + EN) is required'); return; }
    setPosting(true);
    try {
      const r = await fetch('/api/system-status/admin', { method: 'POST', headers, body: JSON.stringify(form) });
      const d = await r.json();
      if (d.incident) {
        showToastMsg('✅ Incident posted');
        setForm(emptyForm);
        setShowForm(false);
        loadIncidents();
      } else showToastMsg('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToastMsg('❌ ' + e.message); }
    setPosting(false);
  };

  const handleResolve = async (id) => {
    try {
      const r = await fetch(`/api/system-status/admin/${id}/resolve`, { method: 'PUT', headers });
      const d = await r.json();
      if (d.incident) { showToastMsg('✅ Marked resolved'); loadIncidents(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this incident permanently?')) return;
    try {
      const r = await fetch(`/api/system-status/admin/${id}`, { method: 'DELETE', headers });
      const d = await r.json();
      if (d.success) { showToastMsg('✅ Deleted'); loadIncidents(); }
      else showToastMsg('❌ ' + d.error);
    } catch (e) { showToastMsg('❌ ' + e.message); }
  };

  return (
    <div>
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, background: toast.startsWith('✅') ? '#166534' : '#7f1d1d', border: '1px solid ' + (toast.startsWith('✅') ? '#22c55e' : '#ef4444'), borderRadius: 10, padding: '12px 20px', color: '#fff', fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>📡 System Status</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={s.btn()} onClick={loadIncidents}>🔄 Refresh</button>
          <button style={s.btn('#f59e0b')} onClick={() => { setForm(emptyForm); setShowForm(v => !v); }}>{showForm ? '✕ Cancel' : '+ Post Incident'}</button>
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>
        The public /status page's component checks (Database, Media Storage, AI Generation Engines, Agent Chat) run live automatically — nothing to manage here. This tab is only for posting/resolving manual incident reports.
      </p>

      {showForm && (
        <div style={s.card}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Severity</div>
            <select style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
              {INCIDENT_SEVERITIES.map(sv => <option key={sv.key} value={sv.key}>{sv.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }} className="admin-grid-2">
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (Arabic)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.title_ar} onChange={e => setForm(p => ({ ...p, title_ar: e.target.value }))} placeholder="مثال: بطء في توليد الفيديوهات" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Title (English)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.title_en} onChange={e => setForm(p => ({ ...p, title_en: e.target.value }))} placeholder="e.g. Slower video generation" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (Arabic)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.description_ar} onChange={e => setForm(p => ({ ...p, description_ar: e.target.value }))} placeholder="تفاصيل (اختياري)..." />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Description (English)</div>
              <input style={{ ...s.input, width: '100%', boxSizing: 'border-box' }} value={form.description_en} onChange={e => setForm(p => ({ ...p, description_en: e.target.value }))} placeholder="Details (optional)..." />
            </div>
          </div>
          <button style={s.btn('#f59e0b')} onClick={handlePost} disabled={posting}>{posting ? 'Posting...' : '📢 Post Incident'}</button>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: '20px 0', color: '#4b5563' }}>Loading...</div>}
      {!loading && incidents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#4b5563' }}>No incidents ever posted. Good sign.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {incidents.map(inc => {
          const sevInfo = INCIDENT_SEVERITIES.find(sv => sv.key === inc.severity) || INCIDENT_SEVERITIES[1];
          return (
            <div key={inc.id} style={{ ...s.card, marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: sevInfo.color, background: `${sevInfo.color}22`, border: `1px solid ${sevInfo.color}55`, borderRadius: 999, padding: '3px 10px', flexShrink: 0 }}>{sevInfo.label}</span>
                <span style={{ fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inc.title_en}</span>
                {inc.resolved ? <span style={{ fontSize: 11, color: '#22c55e', flexShrink: 0 }}>✓ resolved</span> : <span style={{ fontSize: 11, color: '#ef4444', flexShrink: 0 }}>● ongoing</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {!inc.resolved && <button style={s.btn('#166534')} onClick={() => handleResolve(inc.id)}>✓ Resolve</button>}
                <button style={s.btn('#7f1d1d')} onClick={() => handleDelete(inc.id)}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminPage() {
  // ✅ محتاجين الاتنين (فلاج + توكن حقيقي فعلاً موجود) — لو الجلسة قديمة وفيها الفلاج بس
  // التوكن خلص/اتشال، مينفعش نعتبره "داخل" وهو أي طلب API هيرجعله 401
  const [authed, setAuthed] = useState(sessionStorage.getItem('erivion_admin_ok') === '1' && !!adminToken);
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [videos, setVideos] = useState([]);
  const [agentChats, setAgentChats] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [referralSources, setReferralSources] = useState([]);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityQuestions, setCommunityQuestions] = useState([]);
  const [communityPending, setCommunityPending] = useState([]);
  const [communityView, setCommunityView] = useState('pending'); // 'pending' | 'questions' | 'all'
  const [communityReply, setCommunityReply] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectingPostId, setRejectingPostId] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [resetingCredits, setResetingCredits] = useState(null); // email being reset
  const [editPlan, setEditPlan] = useState('free');
  const [saving, setSaving] = useState(false);
  const [creditsDelta, setCreditsDelta] = useState('');
  const [toast, setToast] = useState('');
  const [addCreditsEmail, setAddCreditsEmail] = useState('');
  const [addCreditsAmount, setAddCreditsAmount] = useState('');
  const [rechargeEmail, setRechargeEmail] = useState('');
  const [rechargeAmount, setRechargeAmount] = useState('');
  // ✅ NEW: إدارة الوصول/الباقة/شحن الكريديت لتيرات الموديلات المدفوعة (3/4/5) — الـbackend
  // endpoints دي كانت موجودة أصلاً (recharge-m3/m4/m5, user/model3/4/5) بس صفحة الأدمن
  // مكنتش بتستخدمهم خالص، فكان لازم الدخول لقاعدة البيانات يدويًا عشان تدير عميل مشترك فيهم
  const [modelAccess, setModelAccess] = useState({
    model3: { access: false, plan: 'm3_starter' },
    model4: { access: false, plan: 'm4_plan1' },
    model5: { access: false, plan: 'mc_starter' },
  });
  const [modelRecharge, setModelRecharge] = useState({ model3: '', model4: '', model5: '' });
  const [savingModel, setSavingModel] = useState(null); // 'model3' | 'model4' | 'model5' | null
  // ✅ NEW (طلب العميل): الموقع بقى كله شغال بخطة واحدة موحدة (اشترك مرة واحدة وكل حاجة
  // تفتح) — نظام model3/4/5_access ده باقي من قبل التوحيد، لعملاء قدامى اشتروا موديل واحد
  // لوحده بس، مش الطريقة اللي بيتباع بيها الاشتراك دلوقتي. هيتصفّى تدريجيًا، فمقفول افتراضيًا
  // في المودال عشان محدش يفتكر إنه جزء من نظام الاشتراك الحالي
  const [showLegacyModels, setShowLegacyModels] = useState(false);
  const [supportChats, setSupportChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [adminReply, setAdminReply] = useState('');
  const [adminAttachment, setAdminAttachment] = useState(null); // { base64, preview, type }
  const [adminReplyTo, setAdminReplyTo] = useState(null); // { id, text, role }
  const adminFileInputRef = React.useRef(null);
  const [supportPoll, setSupportPoll] = useState(null);
  const totalUnread = supportChats.reduce((sum, c) => sum + (parseInt(c.unread_count)||0), 0);
  // ✅ NEW: مودال "ابعت رسالة" لعميل من تبويب Users حتى لو ماعملش Start Chat أصلاً
  const [messageUser, setMessageUser] = useState(null); // { email, name }
  const [messageText, setMessageText] = useState('');
  const [messageLang, setMessageLang] = useState('ar');
  const [sendingMessage, setSendingMessage] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const [statsRange, setStatsRange] = useState(28); // ✅ NEW: 28/90/365 يوم لرسم بياني الموقع
  const loadStats    = useCallback(async (range) => { setLoading(true); try { const r = await fetch(`/api/admin/stats?range=${range || statsRange}`, { headers }); const d = await r.json(); setStats(d); } catch (e) { console.error(e); } setLoading(false); }, [statsRange]);
  // ✅ NEW (طلب العميل: "تضيف خانة اني اقدر اشوف مشاريع وصور وفيديوهات العملاء"): تصفح كل
  // مشروع اتعمل بالنظام الجديد مع ميديا العميل الحقيقية، فلترة بالإيميل
  const [customerProjects, setCustomerProjects] = useState([]);
  const [customerProjectsEmail, setCustomerProjectsEmail] = useState('');
  const loadCustomerProjects = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '30' });
      if (customerProjectsEmail.trim()) params.set('email', customerProjectsEmail.trim());
      const r = await fetch('/api/admin/customer-projects?' + params, { headers });
      const d = await r.json();
      setCustomerProjects(d.projects || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [customerProjectsEmail]);
  const loadPayments = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/admin/payments', { headers }); const d = await r.json(); setPayments(d.payments || []); } catch (e) { console.error(e); } setLoading(false); }, []);
  const markPaid = useCallback(async (id, paid) => {
    try {
      const url = `/api/admin/payments/${id}/${paid ? 'mark-paid' : 'unmark-paid'}`;
      const r = await fetch(url, { method: 'POST', headers });
      const d = await r.json();
      if (d.payment) setPayments(ps => ps.map(p => p.id === id ? { ...p, ...d.payment } : p));
    } catch (e) { console.error(e); }
  }, []);
  // ✅ NEW: اعتماد/رفض طلب الاشتراك مباشرة من الصفحة (تحديث فوري للحالة محليًا بدل انتظار رفرش)
  const approvePayment = useCallback(async (id) => {
    if (!window.confirm('اعتماد طلب الاشتراك ده وإضافة الكريديت للعميل؟')) return;
    try {
      const r = await fetch(`/api/admin/payments/${id}/approve`, { method: 'POST', headers });
      const d = await r.json();
      if (!r.ok) { showToast('❌ ' + (d.error || 'فشل الاعتماد')); return; }
      setPayments(ps => ps.map(p => p.id === id ? { ...p, status: 'approved' } : p));
      showToast('✅ اتعمد وضيفت الكريديت للعميل');
    } catch (e) { showToast('❌ ' + e.message); }
  }, []);
  const rejectPayment = useCallback(async (id) => {
    const reason = window.prompt('سبب الرفض (اختياري):', 'wrong_receipt') || 'other';
    try {
      const r = await fetch(`/api/admin/payments/${id}/reject`, { method: 'POST', headers, body: JSON.stringify({ reason }) });
      const d = await r.json();
      if (!r.ok) { showToast('❌ ' + (d.error || 'فشل الرفض')); return; }
      setPayments(ps => ps.map(p => p.id === id ? { ...p, status: 'rejected' } : p));
      showToast('❌ اترفض الطلب');
    } catch (e) { showToast('❌ ' + e.message); }
  }, []);
  const [receiptPreview, setReceiptPreview] = useState(null); // lightbox لصورة الإيصال
  const loadVideos   = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/admin/videos', { headers }); const d = await r.json(); setVideos(d.videos || []); } catch (e) { console.error(e); } setLoading(false); }, []);
  // ✅ NEW: شات الايجينت مع العملاء (مشتركين أو لأ) — بيتمسح تلقائيًا بعد 24 ساعة من السيرفر،
  // فده بيعرض آخر يوم بس عشان اكتشاف مشاكل العملاء بدري
  const loadAgentChats = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/admin/agent-chats', { headers }); const d = await r.json(); setAgentChats(d.chats || []); } catch (e) { console.error(e); } setLoading(false); }, []);
  const loadAnswers  = useCallback(async () => {
    setLoading(true);
    try {
      const [r, rs] = await Promise.all([
        fetch('/api/admin/onboarding-answers', { headers }),
        fetch('/api/admin/referral-sources', { headers }),
      ]);
      const d = await r.json(); setAnswers(d.answers || []);
      const ds = await rs.json(); setReferralSources(ds.sources || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  const loadCommunity = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, aRes, pRes] = await Promise.all([
        fetch('/api/admin/community-questions', { headers }),
        fetch('/api/admin/community-all', { headers }),
        fetch('/api/admin/community-pending', { headers }),
      ]);
      const qData = await qRes.json();
      const aData = await aRes.json();
      const pData = await pRes.json();
      setCommunityQuestions(qData.questions || []);
      setCommunityPosts(aData.posts || []);
      setCommunityPending(pData.posts || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);
  const handleResetCredits = async (email) => {
    if (!confirm(`Reset weekly credits for ${email}?`)) return;
    setResetingCredits(email);
    try {
      const r = await fetch('/api/admin/reset-credits', { method: 'POST', headers, body: JSON.stringify({ email }) });
      const d = await r.json();
      if (d.success) { showToast('✅ Credits reset successfully'); loadUsers(); }
      else showToast('❌ ' + (d.error || 'Failed'));
    } catch (e) { showToast('❌ ' + e.message); }
    setResetingCredits(null);
  };

  const handleBan = async (user) => {
    const newBanned = !user.banned || user.banned == 0;
    if (!confirm(`${newBanned ? 'Ban' : 'Unban'} ${user.email}?`)) return;
    try {
      const r = await fetch('/api/admin/user/ban', { method: 'POST', headers, body: JSON.stringify({ email: user.email, banned: newBanned }) });
      const d = await r.json();
      if (d.success) { showToast(`✅ User ${newBanned ? 'banned' : 'unbanned'}`); loadUsers(); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const handleDelete = async (user) => {
    if (!confirm(`⚠️ PERMANENTLY DELETE account for ${user.email}? This cannot be undone!`)) return;
    if (!confirm(`Are you 100% sure? All data for ${user.email} will be deleted.`)) return;
    try {
      const r = await fetch('/api/admin/user/delete', { method: 'POST', headers, body: JSON.stringify({ email: user.email }) });
      const d = await r.json();
      if (d.success) { showToast('✅ User deleted'); loadUsers(); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const handleRecharge = async () => {
    if (!rechargeEmail || !rechargeAmount) return;
    try {
      const r = await fetch('/api/admin/user/credits', { method: 'POST', headers, body: JSON.stringify({ email: rechargeEmail, delta: parseInt(rechargeAmount) }) });
      const d = await r.json();
      if (d.success) { showToast(`✅ New balance: ${d.credits_balance}`); setRechargeEmail(''); setRechargeAmount(''); loadUsers(); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const MODEL_PLAN_OPTIONS = {
    model3: [{ value: 'm3_starter', label: 'Starter' }, { value: 'm3_pro', label: 'Pro' }, { value: 'm3_max', label: 'Max' }],
    model4: [{ value: 'm4_plan1', label: 'Starter' }, { value: 'm4_plan2', label: 'Creator' }, { value: 'm4_plan3', label: 'Pro' }],
    model5: [{ value: 'mc_starter', label: 'Starter' }, { value: 'mc_pro', label: 'Pro' }, { value: 'mc_max', label: 'Max' }],
  };
  const MODEL_ENDPOINT_SUFFIX = { model3: '3', model4: '4', model5: '5' };

  const saveModelAccess = async (modelKey) => {
    if (!editUser) return;
    setSavingModel(modelKey);
    try {
      const { access, plan } = modelAccess[modelKey];
      const r = await fetch(`/api/admin/user/${modelKey}`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: editUser.email, access, plan }),
      });
      const d = await r.json();
      if (d.success) { showToast(`✅ ${d.message}`); loadUsers(); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ ' + e.message); }
    setSavingModel(null);
  };

  const rechargeModelCredits = async (modelKey) => {
    if (!editUser) return;
    const amount = modelRecharge[modelKey];
    if (!amount) return;
    setSavingModel(modelKey);
    try {
      const suffix = MODEL_ENDPOINT_SUFFIX[modelKey];
      const r = await fetch(`/api/admin/user/recharge-m${suffix}`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: editUser.email, amount: parseInt(amount, 10) }),
      });
      const d = await r.json();
      if (d.success) { showToast(`✅ ${d.message}`); setModelRecharge(m => ({ ...m, [modelKey]: '' })); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ ' + e.message); }
    setSavingModel(null);
  };

  const loadSupport = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/support/chats', { headers });
      const d = await r.json();
      setSupportChats(d.chats || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  // Auto-refresh support every 30s
  useEffect(() => {
    if (!authed) return;
    const iv = setInterval(() => loadSupport(), 30000);
    return () => clearInterval(iv);
  }, [authed, loadSupport]);

  const markChatRead = async (chatId) => {
    try {
      await fetch('/api/support/mark-read', {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId }),
      });
      setSupportChats(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c));
    } catch {}
  };

  const loadChatMessages = async (chatId) => {
    try {
      const r = await fetch(`/api/support/messages/${chatId}`);
      const d = await r.json();
      if (d.messages) setChatMessages(d.messages);
    } catch {}
  };

  const sendAdminReply = async () => {
    if (!adminReply.trim() && !adminAttachment) return;
    if (!activeChat) return;
    try {
      await fetch('/api/support/admin-reply', {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId: activeChat.id, text: adminReply.trim(), mediaBase64: adminAttachment?.base64 || null, mediaType: adminAttachment?.type || null, replyToId: adminReplyTo?.id || null }),
      });
      setAdminReply(''); setAdminAttachment(null); setAdminReplyTo(null);
      await loadChatMessages(activeChat.id);
      await markChatRead(activeChat.id);
    } catch (e) { showToast('❌ ' + e.message); }
  };

  const handleAdminAttachmentPick = (file) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    if (file.size > (isVideo ? 40 : 8) * 1024 * 1024) {
      showToast(`❌ File too large (max ${isVideo ? 40 : 8}MB)`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAdminAttachment({ base64: ev.target.result, preview: ev.target.result, type: isVideo ? 'video' : 'image' });
    reader.readAsDataURL(file);
  };

  const deleteChat = async (chatId) => {
    if (!confirm('Delete this chat?')) return;
    try {
      await fetch(`/api/support/chat/${chatId}`, { method: 'DELETE', headers });
      setSupportChats(prev => prev.filter(c => c.id !== chatId));
      if (activeChat?.id === chatId) { setActiveChat(null); setChatMessages([]); }
      showToast('✅ Chat deleted');
    } catch (e) { showToast('❌ ' + e.message); }
  };

  // ✅ NEW: يبعت رسالة استباقية لعميل من تبويب Users — بينشئ/يستخدم تشات دعم ليه ويبعتله إيميل فيه زرار يفتح الشات مباشرة
  const sendUserMessage = async () => {
    if (!messageUser?.email || !messageText.trim()) return;
    setSendingMessage(true);
    try {
      const r = await fetch('/api/support/admin-start-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: messageUser.email, name: messageUser.name, text: messageText.trim(), language: messageLang }),
      });
      const d = await r.json();
      if (d.success) {
        showToast('✅ Message sent — email delivered');
        setMessageUser(null); setMessageText('');
        if (tab === 'support') loadSupport();
      } else {
        showToast('❌ ' + (d.error || 'Failed to send'));
      }
    } catch (e) { showToast('❌ ' + e.message); }
    setSendingMessage(false);
  };

  const loadUsers = useCallback(async () => { setLoading(true); try { const params = new URLSearchParams(); if (planFilter) params.set('plan', planFilter); if (search) params.set('search', search); const r = await fetch('/api/admin/users?' + params, { headers }); const d = await r.json(); setUsers(d.users || []); } catch (e) { console.error(e); } setLoading(false); }, [planFilter, search]);

  useEffect(() => {
    if (!authed) return;
    if (tab === 'overview') loadStats();
    else if (tab === 'users') loadUsers();
    else if (tab === 'payments') loadPayments();
    else if (tab === 'videos') loadAgentChats();
    else if (tab === 'support') { loadSupport(); }
    else if (tab === 'community') { loadCommunity(); }
    else if (tab === 'customerProjects') { loadCustomerProjects(); }
  }, [authed, tab, loadStats, loadUsers, loadPayments, loadAgentChats, loadSupport, loadCommunity, loadCustomerProjects]);

  // Poll support messages when chat is open
  useEffect(() => {
    if (activeChat) {
      loadChatMessages(activeChat.id);
      const iv = setInterval(() => loadChatMessages(activeChat.id), 5000);
      return () => clearInterval(iv);
    }
  }, [activeChat]);

  const savePlan = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/user/plan', { method: 'POST', headers, body: JSON.stringify({ email: editUser.email, plan: editPlan }) });
      const d = await r.json();
      if (d.success) { showToast('✅ Updated successfully'); setEditUser(null); loadUsers(); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ Error: ' + e.message); }
    setSaving(false);
  };

  const saveCreditsAdjust = async (delta) => {
    if (!editUser || !delta) return;
    setSaving(true);
    try {
      const r = await fetch('/api/admin/user/credits', {
        method: 'POST', headers,
        body: JSON.stringify({ email: editUser.email, delta: parseInt(delta, 10) }),
      });
      const d = await r.json();
      if (d.success) {
        showToast(`✅ Credits updated — new balance: ${d.credits_balance}`);
        setEditUser(u => u ? { ...u, credits_balance: d.credits_balance } : u);
        setCreditsDelta('');
        loadUsers();
      } else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ Error: ' + e.message); }
    setSaving(false);
  };

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  // ✅ FIX (طلب العميل: "حسّن من شكل الصفحة"): كانت الألوان/الخطوط هنا أرقام hex منفصلة تمامًا
  // عن نظام التصميم الحقيقي المستخدم في باقي الموقع (frontend/src/styles/global.css)، فصفحة
  // الأدمن كانت شكلها مختلف عن هوية الموقع. دلوقتي بتستخدم نفس الـCSS variables (--bg/--text/
  // --accent/--font-display/--font-body...) عشان تبقى متسقة بصريًا مع باقي المنتج
  const s = {
    root: { minHeight: '100vh', background: 'radial-gradient(1100px 560px at 12% -8%, var(--accent-bg), transparent 60%), var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-body)', display: 'flex' },
    sidebar: { width: 210, background: 'var(--bg2)', borderRight: '1px solid var(--border)', padding: '20px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 },
    logo: { fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', color: 'var(--accent)', padding: '4px 12px 20px', borderBottom: '1px solid var(--border)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 },
    navItem: (active) => ({ padding: '9px 12px', borderRadius: 'var(--r-sm)', cursor: 'pointer', fontSize: 13, color: active ? '#fff' : 'var(--text2)', background: active ? 'var(--bg4)' : 'transparent', borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent', fontWeight: active ? 600 : 400 }),
    main: { flex: 1, padding: '24px 28px', overflow: 'auto' },
    topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    title: { fontSize: 19, fontWeight: 800, fontFamily: 'var(--font-display)', letterSpacing: '-0.01em', color: 'var(--text)' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '8px 12px', color: 'var(--text2)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid var(--border)' },
    td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: '#d1d5db', verticalAlign: 'middle' },
    card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.18)' },
    btn: (color) => ({ background: color || 'var(--accent)', border: 'none', borderRadius: 'var(--r-sm)', padding: '6px 14px', color: '#fff', fontWeight: 600, fontSize: 12 }),
    input: { background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r-sm)', padding: '8px 12px', color: 'var(--text)', fontSize: 13, outline: 'none' },
  };

  const tabs = [
    { key: 'overview',   label: '📊 Overview'   },
    { key: 'users',      label: '👥 Users'       },
    { key: 'payments',   label: '💰 Payments'    },
    { key: 'videos',     label: '🤖 Agent Chats' },
    { key: 'customerProjects', label: '🗂️ Customer Projects' },
    { key: 'support',    label: `💬 Support${totalUnread > 0 ? ` 🔴${totalUnread}` : supportChats.length > 0 ? ` (${supportChats.length})` : ''}` },
    { key: 'affiliates', label: '🤝 Affiliates'  },
    { key: 'ratings',    label: '⭐ Ratings'      },
    { key: 'notifications', label: '🔔 Notifications' },
    { key: 'templates',  label: '🎬 Templates'   },
    { key: 'courses',    label: '🎓 Courses'     },
    { key: 'characterStudio', label: '🎭 Character Studio' },
    { key: 'terms',      label: '✅ Terms'        },
    { key: 'finance',    label: '🧾 Finance'     },
    { key: 'changelog',  label: '📰 Changelog'   },
    { key: 'roadmap',    label: '🗺️ Roadmap'     },
    { key: 'statusIncidents', label: '📡 Status' },
    { key: 'answers',    label: '📋 Answers'     },
    { key: 'community',  label: '🌍 Community'   },
    { key: 'channels',   label: '📺 Channels'    },
    { key: 'documentary', label: '🎞️ Documentary' },
    { key: 'voices',     label: '🗣️ Voices'      },
    { key: 'audiovideo', label: '🎬 Audio→Video' },
    { key: 'analytics',  label: '📈 Analytics'    },
    { key: 'studio',     label: '🎞️ My Studio'    },
  ];

  return (
    <div style={s.root} className="admin-root">
      <style>{ADMIN_CSS}</style>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 'var(--r-md)', padding: '12px 20px', fontSize: 14, color: '#fff', zIndex: 9999, boxShadow: '0 8px 28px rgba(0,0,0,0.4)' }}>{toast}</div>
      )}

      {/* Sidebar */}
      <div style={s.sidebar} className="admin-sidebar-wrap">
        <div style={s.logo} className="admin-logo"><span>⚡</span> Erivion Admin</div>
        {tabs.map(t => (
          <div key={t.key} className="admin-nav-item" data-active={tab === t.key} style={s.navItem(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</div>
        ))}
        <div style={{ marginTop: 'auto' }} className="admin-sidebar-footer">
          <div className="admin-nav-item" style={{ ...s.navItem(false), color: '#f87171' }}
            onClick={() => { sessionStorage.removeItem('erivion_admin_ok'); applyAdminToken(null); setAuthed(false); }}>
            🚪 Logout
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main} className="admin-main">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <div style={s.topbar} className="admin-header"><div style={s.title} className="admin-header-title">Overview</div><button style={s.btn()} onClick={() => loadStats()}>🔄 Refresh</button></div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            {stats && <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }} className="admin-stats">
                <StatCard label="Total Users" value={fmt(stats.overview.total_users)} sub={`${stats.overview.verified_users} verified`} />
                <StatCard label="Signups Today" value={fmt(stats.overview.signups_today)} color="#22c55e" />
                <StatCard label="Logins Today" value={fmt(stats.overview.logins_today)} color="#06b6d4" />
                <StatCard label="Weekly Signups" value={fmt(stats.overview.weekly_signups)} color="#22c55e" />
                <StatCard label="Total Videos" value={fmt(stats.overview.total_videos)} />
                <StatCard label="Revenue (EGP)" value={fmt(stats.overview.total_revenue_egp)} color="#f59e0b" />
                <StatCard label="Est. Cost (EGP)" value={fmt(stats.overview.total_cost_estimate_egp)} color="#ef4444" />
                <StatCard label="Est. Profit (EGP)" value={fmt(stats.overview.total_profit_estimate_egp)} color="#22c55e" />
                <StatCard label="Pending Payments" value={stats.overview.pending_payments} color={stats.overview.pending_payments > 0 ? '#ef4444' : '#9ca3af'} />
                <StatCard label="Legacy Model 3 Users" value={stats.overview.model3_users} color="#7c6af7" />
                <StatCard label="Legacy Model 4 Users" value={stats.overview.model4_users} color="#c084fc" />
                <StatCard label="Legacy Model 5 Users" value={stats.overview.model5_users} color="#06b6d4" />
              </div>
              <div style={s.card}>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Subscriptions per month — last 12 months</div>
                <MonthlyBarChart data={stats.monthly_subscriptions} />
              </div>
              {/* ✅ NEW (طلب العميل: "الرسم البياني لاحصائيات الموقع اخر 28 و 90 و 365 يوم") */}
              <div style={s.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Site activity — last {stats.range_days || statsRange} days ({stats.period_bucket === 'month' ? 'by month' : stats.period_bucket === 'week' ? 'by week' : 'by day'})</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[28, 90, 365].map(r => (
                      <button key={r} onClick={() => { setStatsRange(r); loadStats(r); }}
                        style={{ ...s.btn(statsRange === r ? '#7c6af7' : '#1a1a2e'), color: statsRange === r ? '#fff' : '#9ca3af' }}>
                        {r}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 10 }}>Videos generated</div>
                    <RangeBarChart data={stats.videos_per_period} bucket={stats.period_bucket} color="#7c6af7" />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#4b5563', marginBottom: 10 }}>New signups</div>
                    <RangeBarChart data={stats.signups_per_period} bucket={stats.period_bucket} color="#06b6d4" />
                  </div>
                </div>
              </div>
              <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
                <div style={s.card}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Videos generated — last 7 days</div>
                  <BarChart data={stats.videos_per_day} />
                </div>
                <div style={s.card}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Plan distribution</div>
                  {stats.plan_distribution.map(p => {
                    const total = stats.overview.total_users || 1;
                    const pct = Math.round((parseInt(p.count) / total) * 100);
                    return (
                      <div key={p.plan} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={planStyle(p.plan)}>{p.plan?.toUpperCase()}</span>
                          <span style={{ fontSize: 13, color: '#9ca3af' }}>{p.count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 4, background: '#1a1a2e', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: pct + '%', background: '#7c6af7', borderRadius: 2 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="admin-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={s.card}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Recent users</div>
                  <table style={s.table} className="admin-table"><thead><tr><th style={s.th}>Email</th><th style={s.th}>Plan</th><th style={s.th}>Joined</th></tr></thead>
                    <tbody>{stats.recent_users.slice(0, 8).map(u => (<tr key={u.id}><td style={s.td}>{u.email}</td><td style={s.td}><span style={planStyle(u.plan)}>{u.plan}</span></td><td style={s.td}>{new Date(u.created_at).toLocaleDateString()}</td></tr>))}</tbody>
                  </table>
                </div>
                <div style={s.card}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Top video creators</div>
                  <table style={s.table} className="admin-table"><thead><tr><th style={s.th}>Email</th><th style={s.th}>Plan</th><th style={s.th}>Videos</th></tr></thead>
                    <tbody>{stats.top_users.map((u, i) => (<tr key={i}><td style={s.td}>{u.email}</td><td style={s.td}><span style={planStyle(u.plan)}>{u.plan}</span></td><td style={{ ...s.td, color: '#7c6af7', fontWeight: 700 }}>{u.video_count}</td></tr>))}</tbody>
                  </table>
                </div>
              </div>
            </>}
          </>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <>
            <div style={s.topbar} className="admin-header">
              <div style={s.title} className="admin-header-title">Users ({users.length})</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input style={{ ...s.input, width: 180 }} placeholder="Search email..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadUsers()} />
                <select style={s.input} value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
                  <option value="">All plans</option><option value="free">Free</option><option value="paid">Paid</option>
                </select>
                <button style={s.btn()} onClick={loadUsers}>🔍 Search</button>
              </div>
            </div>
            {/* Recharge Credits Panel */}
            <div style={{ display:'flex', gap:8, marginBottom:16, background:'#0f0f1a', border:'1px solid #1a1a2e', borderRadius:10, padding:'12px 16px', alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>💎 Adjust Credits:</span>
              <input style={{ ...s.input, width:200 }} placeholder="user@email.com" value={rechargeEmail} onChange={e=>setRechargeEmail(e.target.value)} />
              <input style={{ ...s.input, width:100 }} type="number" placeholder="±amount" value={rechargeAmount} onChange={e=>setRechargeAmount(e.target.value)} />
              <button style={s.btn('#22c55e')} onClick={handleRecharge}>Apply</button>
            </div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            <div style={{ ...s.card, overflowX:'auto' }}>
              <table style={s.table} className="admin-table">
                <thead><tr>
                  <th style={s.th}>Email</th>
                  <th style={s.th}>Plan</th>
                  <th style={s.th}>Legacy Models</th>
                  <th style={s.th}>Region</th>
                  <th style={s.th}>Credits Balance</th>
                  <th style={s.th}>Videos</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Joined</th>
                  <th style={s.th}>Actions</th>
                </tr></thead>
                <tbody>
                  {users.map(u => {
                    return (
                      <tr key={u.id} style={{ background: u.banned==1 ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                        <td style={s.td}>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            {u.banned==1 && <span style={{ fontSize:10 }}>🚫</span>}
                            <div>
                              <div style={{ fontSize:12 }}>{u.email}</div>
                              {u.name && <div style={{ fontSize:10, color:'#4b5563' }}>{u.name}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={s.td}><span style={planStyle(u.plan)}>{u.plan}</span>
                          {u.plan_expires_at && <div style={{ fontSize:9, color:'#4b5563' }}>exp: {new Date(u.plan_expires_at).toLocaleDateString()}</div>}
                        </td>
                        <td style={s.td}>
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            {u.model3_access ? <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:5, background:'rgba(124,106,247,0.12)', color:'#a78bfa', border:'1px solid rgba(124,106,247,0.3)' }}>M3 · {u.model3_plan || '–'}</span> : null}
                            {u.model4_access ? <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:5, background:'rgba(192,132,252,0.12)', color:'#c084fc', border:'1px solid rgba(192,132,252,0.3)' }}>M4 · {u.model4_plan || '–'}</span> : null}
                            {u.model5_access ? <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:5, background:'rgba(6,182,212,0.12)', color:'#06b6d4', border:'1px solid rgba(6,182,212,0.3)' }}>M5 · {u.model5_plan || '–'}</span> : null}
                            {!u.model3_access && !u.model4_access && !u.model5_access && <span style={{ fontSize:11, color:'#4b5563' }}>–</span>}
                          </div>
                        </td>
                        <td style={s.td}>
                          <span style={{ fontSize:12, padding:'2px 8px', borderRadius:6, background: u.region==='eg'?'rgba(34,197,94,0.1)':'rgba(6,182,212,0.1)', color: u.region==='eg'?'#22c55e':'#06b6d4', border:`1px solid ${u.region==='eg'?'rgba(34,197,94,0.3)':'rgba(6,182,212,0.3)'}`, fontWeight:700 }}>
                            {u.region==='eg' ? '🇪🇬 EG' : u.region==='intl' ? '🌐 Intl' : '–'}
                          </span>
                        </td>
                        <td style={s.td}>
                          <span style={{ fontSize:13, fontWeight:700, color: (u.credits_balance||0)===0 ? '#ef4444' : '#a99bff' }}>💎 {u.credits_balance || 0}</span>
                        </td>
                        <td style={s.td}>{u.total_videos}</td>
                        <td style={s.td}>
                          <span style={{ fontSize:11, fontWeight:700, color:u.banned==1?'#ef4444':'#22c55e' }}>
                            {u.banned==1 ? '🚫 Banned' : '✅ Active'}
                          </span>
                        </td>
                        <td style={s.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td style={{ ...s.td, display:'flex', gap:4, flexWrap:'wrap' }}>
                          <button style={s.btn('#374151')} title="Edit" onClick={() => {
                            setEditUser(u);
                            setEditPlan(u.plan);
                            setModelAccess({
                              model3: { access: !!u.model3_access, plan: u.model3_plan || 'm3_starter' },
                              model4: { access: !!u.model4_access, plan: u.model4_plan || 'm4_plan1' },
                              model5: { access: !!u.model5_access, plan: u.model5_plan || 'mc_starter' },
                            });
                            setModelRecharge({ model3: '', model4: '', model5: '' });
                            setShowLegacyModels(false);
                          }}>✏️</button>
                          <button style={s.btn('#312e81')} title="Send message" onClick={() => { setMessageUser({ email: u.email, name: u.name }); setMessageText(''); setMessageLang(u.region==='intl'?'en':'ar'); }}>✉️</button>
                          <button style={s.btn('#1e3a2f')} disabled={resetingCredits===u.email} title="Reset M1&2 credits" onClick={() => handleResetCredits(u.email)}>
                            {resetingCredits===u.email ? '...' : '🔄'}
                          </button>
                          <button style={s.btn(u.banned==1?'#166534':'#7f1d1d')} title={u.banned==1?'Unban':'Ban'} onClick={() => handleBan(u)}>
                            {u.banned==1 ? '✅' : '🚫'}
                          </button>
                          <button style={s.btn('#450a0a')} title="Delete account" onClick={() => handleDelete(u)}>🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {editUser && (
              <div style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                <div style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', borderRadius: 16, padding: '32px', width: 360 }}>
                  <h3 style={{ margin: '0 0 16px', color: '#fff' }}>Edit User</h3>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>{editUser.email}</div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Plan</div>
                    <select style={{ ...s.input, width: '100%' }} value={editPlan} onChange={e => setEditPlan(e.target.value)}>
                      <option value="free">Free (10 credits/week, watermark)</option>
                      <option value="pro">Pro (400 credits/week)</option>
                      <option value="plus">Plus (60 credits/week, no watermark)</option>
                      <option value="max">Max (600 credits/week, full features)</option>
                      <option value="paid">Paid (legacy — unlocks Models 1-5, no watermark)</option>
                    </select>
                  </div>

                  {/* Credits Balance Adjuster */}
                  <div style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid #1f2937' }}>
                    <div style={{ fontSize: 12, color: '#a99bff', marginBottom: 8, fontWeight: 700 }}>💎 Credits Balance: {editUser.credits_balance || 0}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="number" placeholder="e.g. 100 or -50" style={{ ...s.input, flex: 1 }} value={creditsDelta} onChange={e => setCreditsDelta(e.target.value)} />
                      <button style={{ ...s.btn('#7c6af7'), fontSize: 12, padding: '6px 14px' }} onClick={() => saveCreditsAdjust(creditsDelta)} disabled={saving || !creditsDelta}>Apply</button>
                    </div>
                    <p style={{ fontSize: 10, color: '#4b5563', margin: '6px 0 0' }}>موجب = إضافة كريديت، سالب = خصم كريديت</p>
                  </div>

                  {/* ✅ إدارة وصول موديلات 3/4/5 القديمة — نظام منفصل قبل توحيد الخطة الحالية،
                      باقي بس لعملاء قدامى لسه عندهم وصول من قبل التوحيد. مقفول افتراضيًا هنا
                      عشان محدش يفتكر إنه جزء من الاشتراك الحالي (اللي بقى خطة واحدة تفتح كل حاجة) */}
                  <div style={{ marginBottom: 16, paddingTop: 12, borderTop: '1px solid #1f2937' }}>
                    <button
                      onClick={() => setShowLegacyModels(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: showLegacyModels ? 10 : 0 }}
                    >
                      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>🕰️ Legacy Model 3/4/5 Access</span>
                      <span style={{ fontSize: 11, color: '#4b5563' }}>{showLegacyModels ? '▲ Hide' : '▼ Show'}</span>
                    </button>
                    {showLegacyModels && <>
                    <p style={{ fontSize: 10, color: '#4b5563', margin: '0 0 10px' }}>
                      نظام قديم من قبل ما الاشتراك بقى خطة واحدة موحدة تفتح كل حاجة — استخدمه بس لعميل قديم عنده وصول من زمان. مش الطريقة اللي بيتباع بيها الاشتراك دلوقتي.
                    </p>
                    {[
                      { key: 'model3', label: 'Model 3 — AI Images' },
                      { key: 'model4', label: 'Model 4 — Seedance AI' },
                      { key: 'model5', label: 'Model 5 — Cinematic' },
                    ].map(({ key, label }) => (
                      <div key={key} style={{ marginBottom: 10, padding: '10px', background: '#0a0a14', border: '1px solid #1f2937', borderRadius: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#d1d5db', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={modelAccess[key].access}
                              onChange={e => setModelAccess(m => ({ ...m, [key]: { ...m[key], access: e.target.checked } }))}
                            />
                            {label}
                          </label>
                          <select
                            style={{ ...s.input, fontSize: 11, padding: '3px 6px', width: 90 }}
                            value={modelAccess[key].plan}
                            onChange={e => setModelAccess(m => ({ ...m, [key]: { ...m[key], plan: e.target.value } }))}
                          >
                            {MODEL_PLAN_OPTIONS[key].map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            style={{ ...s.btn('#374151'), fontSize: 11, padding: '4px 10px' }}
                            onClick={() => saveModelAccess(key)}
                            disabled={savingModel === key}
                          >{savingModel === key ? '...' : 'Save Access'}</button>
                          <input
                            type="number"
                            placeholder="+credits"
                            style={{ ...s.input, fontSize: 11, padding: '4px 8px', width: 80 }}
                            value={modelRecharge[key]}
                            onChange={e => setModelRecharge(m => ({ ...m, [key]: e.target.value }))}
                          />
                          <button
                            style={{ ...s.btn('#166534'), fontSize: 11, padding: '4px 10px' }}
                            onClick={() => rechargeModelCredits(key)}
                            disabled={savingModel === key || !modelRecharge[key]}
                          >Recharge</button>
                        </div>
                      </div>
                    ))}
                    </>}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <button style={s.btn()} onClick={savePlan} disabled={saving}>{saving ? 'Saving...' : 'Save Plan'}</button>
                    <button style={s.btn('#374151')} onClick={() => setEditUser(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* ✅ NEW: مودال إرسال رسالة استباقية للعميل — بيوصله إيميل فيه الرسالة + زرار يفتح الشات مباشرة */}
            {messageUser && (
              <div style={{ position: 'fixed', inset: 0, background: '#000a', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
                <div style={{ background: '#0f0f1a', border: '1px solid #2d2d4a', borderRadius: 16, padding: '32px', width: 420 }}>
                  <h3 style={{ margin: '0 0 6px', color: '#fff' }}>✉️ Send Message</h3>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 20 }}>{messageUser.email}</div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Language</div>
                    <select style={{ ...s.input, width: '100%' }} value={messageLang} onChange={e => setMessageLang(e.target.value)}>
                      <option value="ar">🇸🇦 Arabic</option>
                      <option value="en">🇺🇸 English</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Message</div>
                    <textarea
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      placeholder={messageLang === 'ar' ? 'اكتب رسالتك للعميل هنا...' : 'Type your message to the customer...'}
                      rows={5}
                      dir={messageLang === 'ar' ? 'rtl' : 'ltr'}
                      style={{ ...s.input, width: '100%', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />
                  </div>
                  <p style={{ fontSize: 11, color: '#4b5563', margin: '0 0 16px' }}>
                    📧 هيوصله إيميل فيه الرسالة دي + زرار "افتح المحادثة" يوديه على شات الدعم مباشرة (من غير ما يحتاج يعمل Start Chat بنفسه).
                  </p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={s.btn('#7c6af7')} onClick={sendUserMessage} disabled={sendingMessage || !messageText.trim()}>
                      {sendingMessage ? 'Sending...' : 'Send →'}
                    </button>
                    <button style={s.btn('#374151')} onClick={() => { setMessageUser(null); setMessageText(''); }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PAYMENTS ── */}
        {tab === 'payments' && (
          <>
            <div style={s.topbar} className="admin-header"><div style={s.title} className="admin-header-title">Payment Requests</div><button style={s.btn()} onClick={loadPayments}>🔄 Refresh</button></div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
              💡 التكلفة والربح تقديريان بناءً على متوسط هامش ربح ~72% — القيمة الفعلية بتختلف حسب الموديل اللي العميل هيستخدمه فعليًا
            </div>
            <div style={s.card}>
              <table style={s.table} className="admin-table">
                <thead><tr><th style={s.th}>Email</th><th style={s.th}>Plan</th><th style={s.th}>Billing</th><th style={s.th}>Amount</th><th style={s.th}>Est. Cost</th><th style={s.th}>Est. Profit</th><th style={s.th}>Receipt</th><th style={s.th}>Status</th><th style={s.th}>Date</th><th style={s.th}>Action</th><th style={s.th}>Cost Paid?</th></tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td style={s.td}>{p.user_email}</td>
                      <td style={s.td}><span style={planStyle(p.plan)}>{p.plan}</span></td>
                      <td style={s.td}>{p.billing}</td>
                      <td style={{ ...s.td, color: '#22c55e', fontWeight: 700 }}>{p.amount} EGP</td>
                      <td style={{ ...s.td, color: '#ef4444' }}>{p.costEstimate} EGP</td>
                      <td style={{ ...s.td, color: '#7c6af7', fontWeight: 700 }}>{p.profitEstimate} EGP</td>
                      <td style={s.td}>
                        {p.screenshot_data ? (
                          <img
                            src={p.screenshot_data}
                            alt="receipt"
                            onClick={() => setReceiptPreview(p.screenshot_data)}
                            style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)' }}
                          />
                        ) : <span style={{ color: '#4b5563', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={s.td}><span style={{ color: p.status === 'approved' ? '#22c55e' : p.status === 'rejected' ? '#ef4444' : '#f59e0b', fontWeight: 600, fontSize: 12 }}>{p.status === 'approved' ? '✅ Approved' : p.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}</span></td>
                      <td style={s.td}>{new Date(p.created_at).toLocaleDateString()}</td>
                      <td style={s.td}>
                        {p.status === 'pending' ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => approvePayment(p.id)} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>✅ اعتماد</button>
                            <button onClick={() => rejectPayment(p.id)} style={{ padding: '5px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', color: '#ef4444', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>❌ رفض</button>
                          </div>
                        ) : <span style={{ color: '#4b5563', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={s.td}>
                        {p.status !== 'approved' ? (
                          <span style={{ color: '#4b5563', fontSize: 11 }}>—</span>
                        ) : p.paid_out ? (
                          <button onClick={() => markPaid(p.id, false)} style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>✅ تم</button>
                        ) : (
                          <button onClick={() => markPaid(p.id, true)} style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.35)', color: '#f59e0b', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>وضع تم</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* ✅ NEW: لايتبوكس لعرض صورة الإيصال بحجم كامل */}
            {receiptPreview && (
              <div onClick={() => setReceiptPreview(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, cursor: 'zoom-out' }}>
                <img src={receiptPreview} alt="receipt full" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10 }} />
              </div>
            )}
          </>
        )}

        {/* ── VIDEOS ── */}
        {tab === 'videos' && (
          <>
            <div style={s.topbar} className="admin-header">
              <div style={s.title} className="admin-header-title">🤖 Agent Chats <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>(آخر 24 ساعة بس — بتتمسح تلقائي بعد كده)</span></div>
              <button style={s.btn()} onClick={loadAgentChats}>🔄 Refresh</button>
            </div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            {!loading && agentChats.length === 0 && <div style={{ color: '#6b7280' }}>مفيش محادثات في آخر 24 ساعة.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agentChats.map(c => (
                <div key={c.id} style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12, color: '#6b7280' }}>
                    <span>{c.user_email || '(guest)'} {c.plan && <span style={planStyle(c.plan)}>{c.plan}</span>}</span>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 6 }}><b style={{ color: '#d1d5db' }}>Customer:</b> {c.user_message}</div>
                  <div style={{ fontSize: 13, color: '#9ca3af' }}><b style={{ color: '#7c6af7' }}>Agent:</b> {c.agent_reply}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── CUSTOMER PROJECTS (طلب العميل: "اقدر اشوف مشاريع وصور وفيديوهات العملاء عشان
        اعرف بيشتكوا من ايه") ── */}
        {tab === 'customerProjects' && (
          <>
            <div style={s.topbar} className="admin-header">
              <div style={s.title} className="admin-header-title">🗂️ Customer Projects ({customerProjects.length})</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...s.input, width: 220 }} placeholder="Filter by customer email..." value={customerProjectsEmail} onChange={e => setCustomerProjectsEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadCustomerProjects()} />
                <button style={s.btn()} onClick={loadCustomerProjects}>🔍 Search</button>
              </div>
            </div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            {!loading && customerProjects.length === 0 && <div style={{ color: '#6b7280' }}>مفيش مشاريع لسه، أو الفلتر مافيهوش نتيجة.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {customerProjects.map(p => (
                <div key={p.id} style={s.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{p.user_email}</span>
                        {p.user_plan && <span style={planStyle(p.user_plan)}>{p.user_plan}</span>}
                        <span>· {p.message_count} messages · updated {new Date(p.updated_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#4b5563', whiteSpace: 'nowrap' }}>{p.images.length} images · {p.videos.length} videos</div>
                  </div>
                  {(p.images.length > 0 || p.videos.length > 0) ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {p.images.map((url, i) => (
                        <a key={'img' + i} href={url} target="_blank" rel="noreferrer" title="Open full size">
                          <img src={url} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #1a1a2e', display: 'block' }} />
                        </a>
                      ))}
                      {p.videos.map((url, i) => (
                        <video key={'vid' + i} src={url} controls style={{ width: 130, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid #1a1a2e', background: '#000' }} />
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#4b5563' }}>مفيش ميديا اتولدت في المشروع ده لسه.</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── AFFILIATES ── */}
        {tab === 'affiliates' && <AffiliatesTab s={s} />}
        {tab === 'ratings' && <RatingsTab s={s} />}
        {tab === 'notifications' && <NotificationsTab s={s} />}
        {tab === 'channels' && <ChannelsTab s={s} />}
        {tab === 'documentary' && <DocumentaryTab s={s} />}
        {tab === 'voices' && <VoicesTab s={s} />}
        {tab === 'audiovideo' && <AudioVideoTab s={s} />}
        {tab === 'analytics' && <AnalyticsTab s={s} />}

        {/* ── TEMPLATES ── */}
        {tab === 'templates' && <TemplatesTab s={s} />}
        {tab === 'courses' && <CoursesTab s={s} />}
        {tab === 'characterStudio' && <CharacterStudioTab s={s} />}
        {tab === 'terms' && <TermsTab s={s} />}
        {tab === 'finance' && <FinanceTab s={s} />}
        {tab === 'changelog' && <ChangelogTab s={s} />}
        {tab === 'roadmap' && <RoadmapTab s={s} />}
        {tab === 'statusIncidents' && <StatusIncidentsTab s={s} />}

        {/* ── STUDIO ── */}
        {/* ── ANSWERS ── */}
        {tab === 'answers' && (
          <>
            <div style={s.topbar} className="admin-header">
              <div style={s.title} className="admin-header-title">📋 User Onboarding Answers</div>
              <button style={s.btn()} onClick={loadAnswers}>🔄 Load Answers</button>
            </div>
            {loading && <div style={{ color: '#6b7280', fontSize: 13 }}>Loading...</div>}
            {!loading && answers.length === 0 && (
              <div style={{ color: '#6b7280', fontSize: 13, padding: '20px 0' }}>اضغط "Load Answers" عشان تجيب الإجابات.</div>
            )}
            {referralSources.length > 0 && (
              <div style={s.card}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 12 }}>📊 أكتر المنصات اللي بيجي منها عملاء</div>
                {(() => { const max = Math.max(...referralSources.map(r => r.count), 1); return referralSources.map(r => (
                  <div key={r.source} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#d1d5db', marginBottom: 4 }}>
                      <span style={{ textTransform: 'capitalize' }}>{r.source}</span>
                      <span style={{ fontWeight: 700, color: '#a99bff' }}>{r.count}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: '#1a1a2e', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(r.count / max) * 100}%`, background: 'linear-gradient(90deg,#7c6af7,#a99bff)' }} />
                    </div>
                  </div>
                )); })()}
              </div>
            )}
            {answers.length > 0 && (
              <div style={s.card}>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>{answers.length} user(s) answered the onboarding survey</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table} className="admin-table">
                    <thead>
                      <tr>
                        <th style={s.th}>Email</th>
                        <th style={s.th}>Plan</th>
                        <th style={s.th}>Source (من فين؟)</th>
                        <th style={s.th}>Content Type</th>
                        <th style={s.th}>Style</th>
                        <th style={s.th}>Budget</th>
                        <th style={s.th}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {answers.map((a, i) => (
                        <tr key={i}>
                          <td style={s.td}>{a.email}</td>
                          <td style={s.td}><span style={planStyle(a.plan)}>{a.plan}</span></td>
                          <td style={s.td}>{a.source || '—'}</td>
                          <td style={s.td}>{a.content_type || '—'}</td>
                          <td style={s.td}>{a.style || '—'}</td>
                          <td style={s.td}>{a.budget || '—'}</td>
                          <td style={s.td}>{a.answered_at ? new Date(a.answered_at).toLocaleDateString('en-GB') : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'studio' && <StudioTab s={s} />}

        {/* ── Community Tab ── */}
        {tab === 'community' && (
          <div>
            <div style={s.topbar} className="admin-header">
              <div style={s.title} className="admin-header-title">
                🌍 Community
                {communityPending.length > 0 && (
                  <span style={{ marginLeft:10, padding:'2px 10px', borderRadius:999, background:'rgba(239,68,68,0.15)', border:'1px solid rgba(239,68,68,0.3)', color:'#ef4444', fontSize:12, fontWeight:700 }}>
                    {communityPending.length} pending
                  </span>
                )}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button style={s.btn(communityView==='pending'?'#ef4444':'')} onClick={() => setCommunityView('pending')}>
                  📋 Post Moderation {communityPending.length > 0 ? `(${communityPending.length})` : ''}
                </button>
                <button style={s.btn(communityView==='questions'?'#7c6af7':'')} onClick={() => setCommunityView('questions')}>❓ Support Requests</button>
                <button style={s.btn(communityView==='all'?'#7c6af7':'')} onClick={() => setCommunityView('all')}>📂 All Posts</button>
                <button style={s.btn()} onClick={loadCommunity}>🔄 Refresh</button>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign:'center', padding:40, color:'#6b7280' }}>Loading...</div>
            ) : (
              <div>

                {/* ── Pending Moderation ── */}
                {communityView === 'pending' && (
                  <div>
                    {communityPending.length === 0 ? (
                      <div style={{ textAlign:'center', padding:60, color:'#4b5563' }}>
                        <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                        <p>No posts pending review</p>
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:900 }}>
                        {communityPending.map(post => (
                          <div key={post.id} style={{ background:'#0f0f1a', border:'1px solid rgba(245,158,11,0.35)', borderRadius:16, padding:20 }}>

                            {/* Post header */}
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c6af7,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                                  {post.avatar_letter || post.author_name?.[0] || 'U'}
                                </div>
                                <div>
                                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{post.author_name}</div>
                                  <div style={{ fontSize:11, color:'#4b5563' }}>
                                    {new Date(post.created_at).toLocaleString()} ·{' '}
                                    <span style={{ color:'#7c6af7' }}>{post.tag}</span>
                                    <span style={{ color:'#f59e0b', marginLeft:8 }}>⏳ Pending Review</span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Post content */}
                            <div style={{ fontSize:14, color:'#d1d5db', lineHeight:1.7, marginBottom:16, padding:'12px 16px', background:'rgba(255,255,255,0.03)', borderRadius:10 }}>
                              {post.content}
                            </div>

                            {post.image_url && (
                              <img src={post.image_url} alt="post" style={{ maxWidth:'100%', maxHeight:200, borderRadius:10, marginBottom:16, objectFit:'cover' }} />
                            )}

                            {/* Approve / Reject buttons */}
                            <div style={{ display:'flex', gap:10, alignItems:'flex-start', flexWrap:'wrap' }}>
                              <button onClick={async () => {
                                await fetch(`/api/admin/community-post/${post.id}/approve`, { method:'POST', headers });
                                showToast('✅ Post approved');
                                loadCommunity();
                              }} style={{ ...s.btn('#14532d'), fontSize:13, padding:'8px 20px' }}>✅ Approve</button>

                              {rejectingPostId === post.id ? (
                                <div style={{ display:'flex', gap:8, flex:1, flexWrap:'wrap', alignItems:'center' }}>
                                  <input
                                    value={rejectionReason}
                                    onChange={e => setRejectionReason(e.target.value)}
                                    placeholder="Reason for rejection (optional)..."
                                    style={{ flex:1, minWidth:200, ...s.input, fontSize:13 }}
                                  />
                                  <button onClick={async () => {
                                    await fetch(`/api/admin/community-post/${post.id}/reject`, {
                                      method:'POST',
                                      headers: { ...headers, 'Content-Type':'application/json' },
                                      body: JSON.stringify({ reason: rejectionReason }),
                                    });
                                    showToast('❌ Post rejected');
                                    setRejectingPostId(null);
                                    setRejectionReason('');
                                    loadCommunity();
                                  }} style={{ ...s.btn('#7f1d1d'), fontSize:13, padding:'8px 18px' }}>Confirm Reject</button>
                                  <button onClick={() => { setRejectingPostId(null); setRejectionReason(''); }}
                                    style={{ ...s.btn(), fontSize:13, padding:'8px 14px' }}>Cancel</button>
                                </div>
                              ) : (
                                <button onClick={() => { setRejectingPostId(post.id); setRejectionReason(''); }}
                                  style={{ ...s.btn('#7f1d1d'), fontSize:13, padding:'8px 20px' }}>❌ Reject</button>
                              )}

                              <button onClick={async () => {
                                if (!confirm('Delete this post?')) return;
                                await fetch(`/api/admin/community-post/${post.id}`, { method:'DELETE', headers });
                                showToast('Post deleted');
                                loadCommunity();
                              }} style={{ ...s.btn('#374151'), fontSize:12, padding:'8px 14px', marginLeft:'auto' }}>🗑️ Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Support Requests ── */}
                {communityView === 'questions' && (
                  <div>
                    {communityQuestions.length === 0 ? (
                      <div style={{ textAlign:'center', padding:60, color:'#4b5563' }}>
                        <div style={{ fontSize:36, marginBottom:12 }}>✅</div>
                        <p>No pending support requests</p>
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:900 }}>
                        {communityQuestions.map(post => (
                          <div key={post.id} style={{ background:'#0f0f1a', border:`1px solid ${post.needs_support?'rgba(245,158,11,0.4)':'#1a1a2e'}`, borderRadius:16, padding:20 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c6af7,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                                  {post.avatar_letter || post.author_name?.[0] || 'U'}
                                </div>
                                <div>
                                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{post.author_name}</div>
                                  <div style={{ fontSize:11, color:'#4b5563' }}>{new Date(post.created_at).toLocaleString()} · <span style={{ color: post.tag==='Question'?'#f59e0b':'#7c6af7' }}>{post.tag}</span>{post.needs_support && <span style={{ color:'#f59e0b', marginLeft:8 }}>⚠️ Needs Support</span>}</div>
                                </div>
                              </div>
                              <button onClick={async () => {
                                if (!confirm('Delete this post?')) return;
                                await fetch(`/api/admin/community-post/${post.id}`, { method:'DELETE', headers });
                                loadCommunity();
                                showToast('Post deleted');
                              }} style={{ ...s.btn('#7f1d1d'), fontSize:12 }}>🗑️ Delete</button>
                            </div>
                            <div style={{ fontSize:14, color:'#d1d5db', lineHeight:1.7, marginBottom:14, padding:'12px 16px', background:'rgba(255,255,255,0.03)', borderRadius:10 }}>
                              {post.content}
                            </div>
                            {post.comments && post.comments.length > 0 && (
                              <div style={{ marginBottom:14 }}>
                                <div style={{ fontSize:11, color:'#4b5563', marginBottom:8, fontWeight:700 }}>COMMENTS ({post.comments.length})</div>
                                {post.comments.map((c, ci) => (
                                  <div key={ci} style={{ padding:'8px 12px', background: c.author==='⚡ Erivion Support'?'rgba(124,106,247,0.08)':'rgba(255,255,255,0.02)', borderRadius:8, marginBottom:6, borderLeft:`3px solid ${c.author==='⚡ Erivion Support'?'#7c6af7':'#1a1a2e'}` }}>
                                    <span style={{ fontSize:12, fontWeight:700, color: c.author==='⚡ Erivion Support'?'#a78bfa':'#9ca3af' }}>{c.author}: </span>
                                    <span style={{ fontSize:12, color:'#9ca3af' }}>{c.text}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{ display:'flex', gap:8 }}>
                              <textarea
                                value={replyingTo === post.id ? communityReply : ''}
                                onChange={e => { setReplyingTo(post.id); setCommunityReply(e.target.value); }}
                                placeholder="Reply as ⚡ Erivion Support..."
                                rows={2}
                                style={{ flex:1, ...s.input, resize:'none', fontFamily:'inherit', fontSize:13 }}
                              />
                              <button
                                disabled={replyingTo !== post.id || !communityReply.trim()}
                                onClick={async () => {
                                  if (!communityReply.trim()) return;
                                  try {
                                    const r = await fetch('/api/admin/community-reply', {
                                      method:'POST',
                                      headers: { ...headers, 'Content-Type':'application/json' },
                                      body: JSON.stringify({ post_id: post.id, content: communityReply }),
                                    });
                                    if (r.ok) {
                                      showToast('Reply posted ✅');
                                      setCommunityReply('');
                                      setReplyingTo(null);
                                      loadCommunity();
                                    }
                                  } catch (e) { showToast('Error posting reply'); }
                                }}
                                style={{ ...s.btn(), padding:'0 18px', opacity: replyingTo===post.id && communityReply.trim() ? 1 : 0.4, alignSelf:'flex-end' }}>
                                Reply →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── All Posts ── */}
                {communityView === 'all' && (
                  <div>
                    {communityPosts.length === 0 ? (
                      <div style={{ textAlign:'center', padding:60, color:'#4b5563' }}>
                        <div style={{ fontSize:36, marginBottom:12 }}>📭</div>
                        <p>No community posts yet</p>
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:16, maxWidth:900 }}>
                        {communityPosts.map(post => (
                          <div key={post.id} style={{ background:'#0f0f1a', border:`1px solid #1a1a2e`, borderRadius:16, padding:20 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#7c6af7,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:'#fff' }}>
                                  {post.avatar_letter || post.author_name?.[0] || 'U'}
                                </div>
                                <div>
                                  <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{post.author_name}</div>
                                  <div style={{ fontSize:11, color:'#4b5563' }}>
                                    {new Date(post.created_at).toLocaleString()} · <span style={{ color:'#7c6af7' }}>{post.tag}</span>
                                    <span style={{ marginLeft:8, padding:'1px 8px', borderRadius:999, fontSize:10, fontWeight:700,
                                      background: post.status==='approved' ? 'rgba(34,197,94,0.1)' : post.status==='rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                      color: post.status==='approved' ? '#22c55e' : post.status==='rejected' ? '#ef4444' : '#f59e0b',
                                      border: `1px solid ${post.status==='approved' ? 'rgba(34,197,94,0.3)' : post.status==='rejected' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
                                    }}>
                                      {post.status==='approved' ? '✅ Approved' : post.status==='rejected' ? '❌ Rejected' : '⏳ Pending'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <button onClick={async () => {
                                if (!confirm('Delete this post?')) return;
                                await fetch(`/api/admin/community-post/${post.id}`, { method:'DELETE', headers });
                                loadCommunity();
                                showToast('Post deleted');
                              }} style={{ ...s.btn('#7f1d1d'), fontSize:12 }}>🗑️ Delete</button>
                            </div>
                            <div style={{ fontSize:14, color:'#d1d5db', lineHeight:1.7, padding:'12px 16px', background:'rgba(255,255,255,0.03)', borderRadius:10 }}>
                              {post.content}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {/* ── Support Chat Tab ── */}
        {tab === 'support' && (
          <div>
            <div style={s.topbar} className="admin-header">
              <div style={s.title} className="admin-header-title">💬 Support Chats ({supportChats.length})</div>
              <div style={{ display:'flex', gap:8 }}>
                <button style={s.btn('#374151')} onClick={async () => { await fetch('/api/support/cleanup', {method:'POST'}); loadSupport(); }}>🗑️ Cleanup Expired</button>
                <button style={s.btn('#7c6af7')} onClick={async () => {
                  const r = await fetch('/api/support/notify-status', { headers });
                  const d = await r.json();
                  alert(d.message + (d.resendError ? '\n\n' + JSON.stringify(d.resendError) : ''));
                }}>✉️ Test Email Notifications</button>
                <button style={s.btn()} onClick={loadSupport}>🔄 Refresh</button>
              </div>
            </div>

            {supportChats.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', color:'#4b5563' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
                <p>No active support chats.</p>
                <p style={{ fontSize:12, marginTop:6 }}>Chats auto-delete after 24 hours.</p>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:activeChat?'280px 1fr':'1fr', gap:16, height:'calc(100vh - 180px)' }}>
                {/* Chat List */}
                <div style={{ display:'flex', flexDirection:'column', gap:8, overflowY:'auto' }}>
                  {supportChats.map(chat => {
                    const unread = parseInt(chat.unread_count) || 0;
                    return (
                    <div key={chat.id}
                      onClick={() => {
                        setActiveChat(chat);
                        if (unread > 0) markChatRead(chat.id);
                      }}
                      style={{ padding:'14px 16px', borderRadius:12, border:`1px solid ${activeChat?.id===chat.id?'rgba(124,106,247,0.5)':unread>0?'rgba(34,197,94,0.3)':'#1a1a2e'}`, background:activeChat?.id===chat.id?'rgba(124,106,247,0.1)':unread>0?'rgba(34,197,94,0.04)':'#0f0f1a', cursor:'pointer', transition:'all 0.15s', position:'relative' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:'#fff' }}>{chat.name}</div>
                          {unread > 0 && (
                            <div style={{ minWidth:18, height:18, borderRadius:999, background:'#22c55e', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff', padding:'0 5px' }}>
                              {unread}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize:10, padding:'2px 8px', borderRadius:999, background:chat.language==='ar'?'rgba(52,211,153,0.15)':'rgba(6,182,212,0.15)', color:chat.language==='ar'?'#34d399':'#06b6d4', fontWeight:700 }}>
                          {chat.language==='ar'?'🇸🇦 AR':'🇺🇸 EN'}
                        </div>
                      </div>
                      <div style={{ fontSize:11, color:'#6b7280', marginBottom:4 }}>{chat.email}</div>
                      {chat.last_message && <div style={{ fontSize:11, color: unread>0 ? '#9ca3af' : '#4b5563', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontWeight: unread>0 ? 600 : 400 }}>{chat.last_message}</div>}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
                        <div style={{ fontSize:10, color:'#374151' }}>
                          {chat.last_message_at ? new Date(chat.last_message_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : new Date(chat.created_at).toLocaleString()}
                        </div>
                        <div style={{ display:'flex', gap:8, fontSize:10, color:'#6b7280' }}>
                          <span>👤 {chat.user_msg_count}</span>
                          <span>💬 {chat.admin_msg_count}</span>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Chat Window */}
                {activeChat && (
                  <div style={{ display:'flex', flexDirection:'column', background:'#0f0f1a', border:'1px solid #1a1a2e', borderRadius:16, overflow:'hidden' }}>
                    {/* Chat Header */}
                    <div style={{ padding:'14px 18px', borderBottom:'1px solid #1a1a2e', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color:'#fff' }}>{activeChat.name}</div>
                        <div style={{ fontSize:12, color:'#6b7280' }}>{activeChat.email} · {activeChat.language==='ar'?'Arabic':'English'}</div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button style={s.btn('#1e3a2f')} onClick={() => { window.location.href=`mailto:${activeChat.email}`; }}>📧 Email</button>
                        <button style={s.btn('#7f1d1d')} onClick={() => deleteChat(activeChat.id)}>🗑️ Delete</button>
                        <button style={{ ...s.btn('#374151') }} onClick={() => { setActiveChat(null); setChatMessages([]); }}>✕</button>
                      </div>
                    </div>

                    {/* Messages */}
                    <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
                      {chatMessages.map((m,i) => {
                        const align = m.role==='user' ? 'flex-start' : m.role==='admin' ? 'flex-end' : 'center';
                        return (
                        <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: align }}>
                          {m.role==='system' ? (
                            <div style={{ alignSelf:'center', padding:'6px 14px', borderRadius:20, background:'rgba(255,255,255,0.05)', fontSize:11, color:'rgba(255,255,255,0.4)' }}>{m.text}</div>
                          ) : (
                            <>
                              <div style={{ fontSize:10, color:'#4b5563', marginBottom:3 }}>{m.role==='user'?activeChat.name:'You (Admin)'}</div>
                              {(m.reply_to_id || m.reply_to_text) && (
                                <div style={{ fontSize:10.5, color:'#6b7280', background:'rgba(255,255,255,0.04)', borderLeft:'2px solid #7c6af7', borderRadius:6, padding:'3px 8px', marginBottom:3, maxWidth:'75%' }}>
                                  {(m.reply_to_role==='user'?activeChat.name:'Admin')}: {(m.reply_to_text||'').slice(0,70)}
                                </div>
                              )}
                              <div onClick={() => setAdminReplyTo({ id: m.id, text: m.text || (m.media_type==='video'?'🎥':'🖼️'), role: m.role })}
                                style={{ maxWidth:'75%', padding:'10px 14px', borderRadius:14, fontSize:13, lineHeight:1.7, whiteSpace:'pre-line', cursor:'pointer',
                                background:m.role==='user'?'rgba(255,255,255,0.07)':'linear-gradient(135deg,#7c6af7,#a855f7)',
                                color:'#e5e7eb', border:m.role==='user'?'1px solid #1a1a2e':'none' }}>
                                {m.media_url && m.media_type === 'image' && <img src={m.media_url} alt="" style={{ maxWidth:'100%', maxHeight:220, borderRadius:8, display:'block', marginBottom: m.text ? 6 : 0 }} />}
                                {m.media_url && m.media_type === 'video' && <video src={m.media_url} controls style={{ maxWidth:'100%', maxHeight:220, borderRadius:8, display:'block', marginBottom: m.text ? 6 : 0 }} />}
                                {m.text}
                              </div>
                              <div style={{ fontSize:10, color:'#374151', marginTop:2 }}>{new Date(m.time).toLocaleTimeString()}</div>
                            </>
                          )}
                        </div>
                        );
                      })}
                    </div>

                    {/* Reply / Attachment preview bar */}
                    {(adminReplyTo || adminAttachment) && (
                      <div style={{ padding:'6px 16px', borderTop:'1px solid #1a1a2e', display:'flex', alignItems:'center', gap:10 }}>
                        {adminReplyTo && (
                          <div style={{ flex:1, fontSize:11, color:'#6b7280', borderLeft:'2px solid #7c6af7', paddingLeft:8 }}>
                            Replying to: {adminReplyTo.text?.slice(0,60)}
                          </div>
                        )}
                        {adminAttachment && (
                          adminAttachment.type === 'video'
                            ? <video src={adminAttachment.preview} style={{ height:36, borderRadius:6 }} />
                            : <img src={adminAttachment.preview} alt="" style={{ height:36, borderRadius:6 }} />
                        )}
                        <button onClick={() => { setAdminReplyTo(null); setAdminAttachment(null); }} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:14 }}>✕</button>
                      </div>
                    )}

                    {/* Reply Input */}
                    <div style={{ padding:'12px 16px', borderTop:'1px solid #1a1a2e', display:'flex', gap:8 }}>
                      <input ref={adminFileInputRef} type="file" accept="image/*,video/*" style={{ display:'none' }} onChange={e => { handleAdminAttachmentPick(e.target.files[0]); e.target.value=''; }} />
                      <button onClick={() => adminFileInputRef.current?.click()} style={{ ...s.btn('#374151'), padding:'0 14px' }}>📎</button>
                      <textarea value={adminReply} onChange={e=>setAdminReply(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAdminReply();} }}
                        placeholder={activeChat.language==='ar'?'اكتب ردك هنا...':'Type your reply...'}
                        rows={2}
                        style={{ flex:1, ...s.input, resize:'none', fontFamily:'inherit', fontSize:13, direction:activeChat.language==='ar'?'rtl':'ltr' }} />
                      <button onClick={sendAdminReply} disabled={!adminReply.trim() && !adminAttachment}
                        style={{ ...s.btn(), padding:'0 18px', opacity:(adminReply.trim()||adminAttachment)?1:0.4 }}>
                        Send →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}