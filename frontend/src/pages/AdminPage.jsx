import React, { useState, useEffect, useCallback } from 'react';

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || 'Sosa6892Midbok';

const MOBILE_CSS = `
  @media (max-width: 768px) {
    .admin-stats { flex-direction: column !important; }
    .admin-stat-card { min-width: unset !important; width: 100% !important; }
    .admin-grid-2 { grid-template-columns: 1fr !important; }
    .admin-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .admin-table { min-width: 600px; }
    .admin-header { padding: 0 10px !important; }
    .admin-header-title { font-size: 14px !important; }
    .admin-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; white-space: nowrap; }
    .admin-tab { padding: 8px 12px !important; font-size: 12px !important; }
    .admin-main { padding: 12px !important; }
    .admin-user-actions { flex-direction: column !important; gap: 4px !important; }
    .admin-btn { padding: 6px 10px !important; font-size: 11px !important; }
    .admin-search { width: 100% !important; }
    .admin-filter-row { flex-direction: column !important; gap: 8px !important; }
  }
`;

const headers = {
  'Content-Type': 'application/json',
  'x-admin-secret': ADMIN_SECRET,
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null) return '–';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
};

const PLAN_COLOR = {
  free:  { bg: '#1f2937', text: '#9ca3af', border: '#374151' },
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
  return (
    <div style={{
      background: '#0f0f1a', border: '1px solid #1f2937', borderRadius: 12,
      padding: '16px 20px', flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || '#fff' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>{sub}</div>}
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

// ── Login Screen ───────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const handle = () => {
    if (secret === ADMIN_SECRET) { sessionStorage.setItem('erivion_admin_ok', '1'); onLogin(); }
    else setError('Wrong secret');
  };
  return (
    <div style={{ minHeight: '100vh', background: '#080810', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0f0f1a', border: '1px solid #1f2937', borderRadius: 16, padding: '40px 36px', width: 340, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🔐</div>
        <h2 style={{ color: '#7c6af7', margin: '0 0 24px', fontSize: 20 }}>Erivion Admin</h2>
        <input type="password" placeholder="Admin secret" value={secret}
          onChange={e => setSecret(e.target.value)} onKeyDown={e => e.key === 'Enter' && handle()}
          style={{ width: '100%', background: '#1a1a2e', border: '1px solid #2d2d4a', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button onClick={handle} style={{ width: '100%', background: '#7c6af7', border: 'none', borderRadius: 8, padding: '11px', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Enter</button>
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

      <div style={s.topbar}>
        <div style={s.title}>🤝 المسوقين — Affiliates</div>
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
          <table style={s.table}>
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
              <table style={s.table}>
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
        headers: { 'x-admin-secret': ADMIN_SECRET },
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
          <table style={s.table}>
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

export default function AdminPage() {
  const [authed, setAuthed] = useState(sessionStorage.getItem('erivion_admin_ok') === '1');
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [editUser, setEditUser] = useState(null);
  const [editPlan, setEditPlan] = useState('free');
  const [saving, setSaving] = useState(false);
  const [editM3, setEditM3] = useState(false);
  const [editM3Plan, setEditM3Plan] = useState('m3_starter');
  const [editM4, setEditM4] = useState(false);
  const [editM4Plan, setEditM4Plan] = useState('m4_plan1');
  const [editM5, setEditM5] = useState(false);
  const [editM5Plan, setEditM5Plan] = useState('mc_starter');
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadStats    = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/admin/stats', { headers }); const d = await r.json(); setStats(d); } catch (e) { console.error(e); } setLoading(false); }, []);
  const loadPayments = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/admin/payments', { headers }); const d = await r.json(); setPayments(d.payments || []); } catch (e) { console.error(e); } setLoading(false); }, []);
  const loadVideos   = useCallback(async () => { setLoading(true); try { const r = await fetch('/api/admin/videos', { headers }); const d = await r.json(); setVideos(d.videos || []); } catch (e) { console.error(e); } setLoading(false); }, []);
  const loadUsers    = useCallback(async () => { setLoading(true); try { const params = new URLSearchParams(); if (planFilter) params.set('plan', planFilter); if (search) params.set('search', search); const r = await fetch('/api/admin/users?' + params, { headers }); const d = await r.json(); setUsers(d.users || []); } catch (e) { console.error(e); } setLoading(false); }, [planFilter, search]);

  useEffect(() => {
    const saveModelAccess = async (model, access, plan) => {
    if (!editUser) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/user/${model}`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: editUser.email, access: access ? 1 : 0, plan }),
      });
      const d = await r.json();
      if (d.success) { showToast(`✅ Model ${model} updated`); loadUsers(); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ Error: ' + e.message); }
    setSaving(false);
  };

  if (!authed) return;
    if (tab === 'overview') loadStats();
    else if (tab === 'users') loadUsers();
    else if (tab === 'payments') loadPayments();
    else if (tab === 'videos') loadVideos();
  }, [authed, tab, loadStats, loadUsers, loadPayments, loadVideos]);

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

  const saveModelAccess = async (model, access, plan) => {
    if (!editUser) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/user/${model}`, {
        method: 'POST', headers,
        body: JSON.stringify({ email: editUser.email, access: access ? 1 : 0, plan }),
      });
      const d = await r.json();
      if (d.success) { showToast(`✅ Model ${model} updated`); loadUsers(); }
      else showToast('❌ ' + d.error);
    } catch (e) { showToast('❌ Error: ' + e.message); }
    setSaving(false);
  };

  if (!authed) return <LoginScreen onLogin={() => setAuthed(true)} />;

  const s = {
    root: { minHeight: '100vh', background: '#080810', color: '#e5e7eb', fontFamily: 'system-ui, sans-serif', display: 'flex' },
    sidebar: { width: 200, background: '#0f0f1a', borderRight: '1px solid #1a1a2e', padding: '20px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 },
    logo: { fontSize: 16, fontWeight: 700, color: '#7c6af7', padding: '4px 12px 20px', borderBottom: '1px solid #1a1a2e', marginBottom: 8 },
    navItem: (active) => ({ padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: active ? '#fff' : '#6b7280', background: active ? '#1a1a2e' : 'transparent', border: active ? '1px solid #2d2d4a' : '1px solid transparent', fontWeight: active ? 600 : 400 }),
    main: { flex: 1, padding: '24px 28px', overflow: 'auto' },
    topbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    title: { fontSize: 18, fontWeight: 600, color: '#fff' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
    th: { textAlign: 'left', padding: '8px 12px', color: '#6b7280', fontWeight: 500, borderBottom: '1px solid #1a1a2e' },
    td: { padding: '10px 12px', borderBottom: '1px solid #0f0f1a', color: '#d1d5db', verticalAlign: 'middle' },
    card: { background: '#0f0f1a', border: '1px solid #1a1a2e', borderRadius: 12, padding: '20px 24px', marginBottom: 16 },
    btn: (color) => ({ background: color || '#7c6af7', border: 'none', borderRadius: 7, padding: '6px 14px', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }),
    input: { background: '#1a1a2e', border: '1px solid #2d2d4a', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' },
  };

  const tabs = [
    { key: 'overview',   label: '📊 Overview'   },
    { key: 'users',      label: '👥 Users'       },
    { key: 'payments',   label: '💰 Payments'    },
    { key: 'videos',     label: '🎬 Videos'      },
    { key: 'affiliates', label: '🤝 Affiliates'  },
    { key: 'templates', label: '🎬 Templates'   },  // ← جديد
  ];

  return (
    <div style={s.root}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: '#1a1a2e', border: '1px solid #2d2d4a', borderRadius: 10, padding: '12px 20px', fontSize: 14, color: '#fff', zIndex: 9999, boxShadow: '0 4px 20px #0008' }}>{toast}</div>
      )}

      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.logo}>⚡ Erivion Admin</div>
        {tabs.map(t => (
          <div key={t.key} style={s.navItem(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</div>
        ))}
        <div style={{ marginTop: 'auto' }}>
          <div style={{ ...s.navItem(false), color: '#ef4444' }}
            onClick={() => { sessionStorage.removeItem('erivion_admin_ok'); setAuthed(false); }}>
            🚪 Logout
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={s.main}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            <div style={s.topbar}><div style={s.title}>Overview</div><button style={s.btn()} onClick={loadStats}>🔄 Refresh</button></div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            {stats && <>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                <StatCard label="Total Users" value={fmt(stats.overview.total_users)} sub={`${stats.overview.verified_users} verified`} />
                <StatCard label="Weekly Signups" value={fmt(stats.overview.weekly_signups)} color="#22c55e" />
                <StatCard label="Total Videos" value={fmt(stats.overview.total_videos)} />
                <StatCard label="Revenue (EGP)" value={fmt(stats.overview.total_revenue_egp)} color="#f59e0b" />
                <StatCard label="Pending Payments" value={stats.overview.pending_payments} color={stats.overview.pending_payments > 0 ? '#ef4444' : '#9ca3af'} />
                <StatCard label="Model 3 Users" value={stats.overview.model3_users} color="#7c6af7" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={s.card}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Recent users</div>
                  <table style={s.table}><thead><tr><th style={s.th}>Email</th><th style={s.th}>Plan</th><th style={s.th}>Joined</th></tr></thead>
                    <tbody>{stats.recent_users.slice(0, 8).map(u => (<tr key={u.id}><td style={s.td}>{u.email}</td><td style={s.td}><span style={planStyle(u.plan)}>{u.plan}</span></td><td style={s.td}>{new Date(u.created_at).toLocaleDateString()}</td></tr>))}</tbody>
                  </table>
                </div>
                <div style={s.card}>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>Top video creators</div>
                  <table style={s.table}><thead><tr><th style={s.th}>Email</th><th style={s.th}>Plan</th><th style={s.th}>Videos</th></tr></thead>
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
            <div style={s.topbar}>
              <div style={s.title}>Users ({users.length})</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={{ ...s.input, width: 180 }} placeholder="Search email..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadUsers()} />
                <select style={s.input} value={planFilter} onChange={e => setPlanFilter(e.target.value)}>
                  <option value="">All plans</option><option value="free">Free</option><option value="pro">Pro</option><option value="plus">Plus</option><option value="max">Max</option><option value="m3_starter">M3 Starter</option><option value="m3_pro">M3 Pro</option><option value="m3_max">M3 Max</option>
                </select>
                <button style={s.btn()} onClick={loadUsers}>🔍 Search</button>
              </div>
            </div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            <div style={s.card}>
              <table style={s.table}>
                <thead><tr><th style={s.th}>Email</th><th style={s.th}>Plan</th><th style={s.th}>Credits Used</th><th style={s.th}>Videos</th><th style={s.th}>M3</th><th style={s.th}>M4</th><th style={s.th}>M5</th><th style={s.th}>Ref</th><th style={s.th}>Joined</th><th style={s.th}>Actions</th></tr></thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={s.td}><div>{u.email}</div>{u.name && <div style={{ fontSize: 11, color: '#4b5563' }}>{u.name}</div>}</td>
                      <td style={s.td}><span style={planStyle(u.plan)}>{u.plan}</span></td>
                      <td style={s.td}>{fmt(u.credits_used)}</td>
                      <td style={s.td}>{u.total_videos}</td>
                      <td style={s.td}>{u.model3_access == 1 ? '✅' : '–'}</td>
                      <td style={s.td}>{u.model4_access == 1 ? '✅' : '–'}</td>
                      <td style={s.td}>{u.model5_access == 1 ? '✅' : '–'}</td>
                      <td style={{ ...s.td, fontSize: 11, color: '#7c6af7', fontFamily: 'monospace' }}>{u.ref_code || '–'}</td>
                      <td style={s.td}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={s.td}><button style={s.btn('#374151')} onClick={() => { 
                          setEditUser(u); 
                          setEditPlan(u.plan);
                          setEditM3(u.model3_access == 1);
                          setEditM3Plan(u.model3_plan || 'm3_starter');
                          setEditM4(u.model4_access == 1);
                          setEditM4Plan(u.model4_plan || 'm4_plan1');
                          setEditM5(u.model5_access == 1);
                          setEditM5Plan(u.model5_plan || 'mc_starter');
                        }}>Edit</button></td>
                    </tr>
                  ))}
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
                      <option value="free">Free</option>
                      <option value="pro">Pro — 50 EGP / $4</option>
                      <option value="plus">Plus — 100 EGP / $8</option>
                      <option value="max">Max — 250 EGP / $13</option>
                    </select>
                  </div>
                  {/* Model 3 */}
                  <div style={{ marginBottom: 12, paddingTop: 12, borderTop: '1px solid #1f2937' }}>
                    <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 6, fontWeight: 700 }}>🖼️ Model 3 — AI Images</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <button onClick={() => setEditM3(!editM3)} style={{ ...s.btn(editM3 ? '#22c55e' : '#374151'), fontSize: 12, padding: '4px 12px' }}>{editM3 ? '✅ Active' : '❌ Inactive'}</button>
                      {editM3 && <select style={{ ...s.input, flex: 1, fontSize: 12 }} value={editM3Plan} onChange={e => setEditM3Plan(e.target.value)}>
                        <option value="m3_starter">Starter — 300 EGP / $12</option>
                        <option value="m3_pro">Pro — 750 EGP / $20</option>
                        <option value="m3_max">Max — 1400 EGP / $32</option>
                      </select>}
                    </div>
                    <button style={{ ...s.btn('#f59e0b'), fontSize: 11, padding: '4px 10px' }} onClick={() => saveModelAccess('model3', editM3, editM3Plan)} disabled={saving}>Save Model 3</button>
                  </div>

                  {/* Model 4 */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: '#a855f7', marginBottom: 6, fontWeight: 700 }}>🎬 Model 4 — Seedance AI</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <button onClick={() => setEditM4(!editM4)} style={{ ...s.btn(editM4 ? '#22c55e' : '#374151'), fontSize: 12, padding: '4px 12px' }}>{editM4 ? '✅ Active' : '❌ Inactive'}</button>
                      {editM4 && <select style={{ ...s.input, flex: 1, fontSize: 12 }} value={editM4Plan} onChange={e => setEditM4Plan(e.target.value)}>
                        <option value="m4_plan1">Starter — 450 EGP / $15</option>
                        <option value="m4_plan2">Creator — 800 EGP / $25</option>
                        <option value="m4_plan3">Pro — 2250 EGP / $55</option>
                      </select>}
                    </div>
                    <button style={{ ...s.btn('#a855f7'), fontSize: 11, padding: '4px 10px' }} onClick={() => saveModelAccess('model4', editM4, editM4Plan)} disabled={saving}>Save Model 4</button>
                  </div>

                  {/* Model 5 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: '#e11d48', marginBottom: 6, fontWeight: 700 }}>🎭 Cinematic — Seedance 2.0</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <button onClick={() => setEditM5(!editM5)} style={{ ...s.btn(editM5 ? '#22c55e' : '#374151'), fontSize: 12, padding: '4px 12px' }}>{editM5 ? '✅ Active' : '❌ Inactive'}</button>
                      {editM5 && <select style={{ ...s.input, flex: 1, fontSize: 12 }} value={editM5Plan} onChange={e => setEditM5Plan(e.target.value)}>
                        <option value="mc_starter">Starter — 5×15s — 400 EGP / $20</option>
                        <option value="mc_pro">Pro — 5×30s — 750 EGP / $35</option>
                        <option value="mc_max">Max — 5×1min — 1500 EGP / $65</option>
                      </select>}
                    </div>
                    <button style={{ ...s.btn('#e11d48'), fontSize: 11, padding: '4px 10px' }} onClick={() => saveModelAccess('model5', editM5, editM5Plan)} disabled={saving}>Save Cinematic</button>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                    <button style={s.btn()} onClick={savePlan} disabled={saving}>{saving ? 'Saving...' : 'Save Plan'}</button>
                    <button style={s.btn('#374151')} onClick={() => setEditUser(null)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── PAYMENTS ── */}
        {tab === 'payments' && (
          <>
            <div style={s.topbar}><div style={s.title}>Payment Requests</div><button style={s.btn()} onClick={loadPayments}>🔄 Refresh</button></div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            <div style={s.card}>
              <table style={s.table}>
                <thead><tr><th style={s.th}>Email</th><th style={s.th}>Plan</th><th style={s.th}>Billing</th><th style={s.th}>Amount</th><th style={s.th}>Status</th><th style={s.th}>Date</th></tr></thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td style={s.td}>{p.user_email}</td>
                      <td style={s.td}><span style={planStyle(p.plan)}>{p.plan}</span></td>
                      <td style={s.td}>{p.billing}</td>
                      <td style={{ ...s.td, color: '#22c55e', fontWeight: 700 }}>{p.amount} EGP</td>
                      <td style={s.td}><span style={{ color: p.status === 'approved' ? '#22c55e' : p.status === 'rejected' ? '#ef4444' : '#f59e0b', fontWeight: 600, fontSize: 12 }}>{p.status === 'approved' ? '✅ Approved' : p.status === 'rejected' ? '❌ Rejected' : '⏳ Pending'}</span></td>
                      <td style={s.td}>{new Date(p.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── VIDEOS ── */}
        {tab === 'videos' && (
          <>
            <div style={s.topbar}><div style={s.title}>Recent Videos</div><button style={s.btn()} onClick={loadVideos}>🔄 Refresh</button></div>
            {loading && <div style={{ color: '#6b7280' }}>Loading...</div>}
            <div style={s.card}>
              <table style={s.table}>
                <thead><tr><th style={s.th}>User</th><th style={s.th}>Plan</th><th style={s.th}>Title</th><th style={s.th}>Filename</th><th style={s.th}>Date</th></tr></thead>
                <tbody>
                  {videos.map(v => (
                    <tr key={v.id}>
                      <td style={s.td}>{v.email}</td>
                      <td style={s.td}><span style={planStyle(v.plan)}>{v.plan}</span></td>
                      <td style={s.td}>{v.title || '–'}</td>
                      <td style={{ ...s.td, fontSize: 11, color: '#4b5563' }}>{v.filename}</td>
                      <td style={s.td}>{new Date(v.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── AFFILIATES ── */}
        {tab === 'affiliates' && <AffiliatesTab s={s} />}

        {/* ── TEMPLATES ── */}
        {tab === 'templates' && <TemplatesTab s={s} />}

      </div>
    </div>
  );
}