import React, { useState, useEffect } from 'react';
import {
  DollarSign, Smartphone, Rocket, Zap, UserPlus, Link2, CreditCard, Wallet,
  Lightbulb, Mail, Loader2, Check, MousePointerClick, Clock, RefreshCw,
} from 'lucide-react';

// ── جدول العمولة الحقيقي — نظام الكريديت الموحد (نفس الرصيد بيتصرف على كل
// الموديلات بما فيهم موديل الإعلانات دلوقتي). العمولة = 20% ثابتة من قيمة أي شحن.
const CREDIT_PACK_COMMISSION_RATE = 0.20;
const EGP_PER_CREDIT = 0.7;
const COMMISSION_TABLE = [
  { plan: 'Starter',  price: '600 credits · $15',    value: '420 EGP',   commission: '84 EGP' },
  { plan: 'Creator',  price: '1,400 credits · $35',  value: '980 EGP',   commission: '196 EGP' },
  { plan: 'Studio',   price: '3,000 credits · $84',  value: '2,100 EGP', commission: '420 EGP' },
  { plan: 'Team',     price: '6,000 credits · $168', value: '4,200 EGP', commission: '840 EGP' },
  { plan: 'Agency',   price: '12,000 credits · $336', value: '8,400 EGP', commission: '1,680 EGP' },
];
// نفس النسبة (20%) بتتطبق على أي شحن مصري بالسلايدر بالظبط بنفس الحساب (قيمة الشحن × 0.20)

export default function AffiliatePage({ onBack }) {
  const [step, setStep] = useState('landing');
  const [email, setEmail] = useState('');
  const [instapay, setInstapay] = useState('');
  const [refCode, setRefCode] = useState('');
  const [lookupCode, setLookupCode] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setTimeout(() => setVisible(true), 50);
    const saved = localStorage.getItem('affiliate_ref_code');
    if (saved) { setRefCode(saved); setStep('dashboard'); fetchStats(saved); }
  }, []);

  const fetchStats = async (code) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/affiliate/stats/${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Not found');
      setStats(data);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    if (!email.trim() || !instapay.trim()) { setError('All fields required'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/affiliate/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, instapay }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      localStorage.setItem('affiliate_ref_code', data.ref_code);
      setRefCode(data.ref_code);
      setStep('dashboard');
      fetchStats(data.ref_code);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleLookup = async () => {
    if (!lookupCode.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/affiliate/stats/${lookupCode.trim()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Code not found');
      localStorage.setItem('affiliate_ref_code', lookupCode.trim());
      setRefCode(lookupCode.trim());
      setStats(data);
      setStep('dashboard');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(stats?.ref_link || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── LANDING ──────────────────────────────────────────────────────────
  if (step === 'landing') return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #0d1a0d 0%, #0a0a0f 50%, #000 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px 80px', opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease' }}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {onBack && (
        <div style={{ width: '100%', maxWidth: 900, marginBottom: 20 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>← Back</button>
        </div>
      )}

      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 64, animation: 'fadeUp 0.5s ease', maxWidth: 700 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 999, fontSize: 12, color: '#22c55e', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 20 }}>
          <DollarSign size={13} strokeWidth={2.5} /> AFFILIATE PROGRAM
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: 20, letterSpacing: '-1px' }}>
          Earn Commission<br />
          <span style={{ background: 'linear-gradient(135deg, #22c55e, #86efac)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>From Every Sale</span>
        </h1>
        <p style={{ color: '#9ca3af', fontSize: 17, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 16px' }}>
          Share Erivion with your audience and earn <strong style={{ color: '#22c55e' }}>20% of every credit pack sale</strong> — credits work across every model, including Ads Creator. Paid directly to your InstaPay.
        </p>
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '12px 20px', marginBottom: 32, display: 'inline-block', maxWidth: 500 }}>
          <p style={{ color: '#86efac', fontSize: 13, margin: 0, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <Lightbulb size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} /> <span><strong>How commission works:</strong> Whenever someone you referred buys credits — a fixed pack or an Egyptian InstaPay top-up — you get 20% of that sale, paid straight to your InstaPay. Simple and transparent.</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setStep('register')}
            style={{ padding: '15px 36px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer', boxShadow: '0 4px 24px rgba(34,197,94,0.4)' }}>
            Join Now — It's Free →
          </button>
          <button onClick={() => setStep('lookup')}
            style={{ padding: '15px 36px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#d1d5db', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>
            I have a code
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, width: '100%', maxWidth: 900, marginBottom: 64 }}>
        {[
          { value: '20%', label: 'Of Every Sale', icon: DollarSign, color: '#22c55e' },
          { value: 'EGP', label: 'Paid via InstaPay', icon: Smartphone, color: '#7c6af7' },
          { value: '∞', label: 'No Earning Limit', icon: Rocket, color: '#f59e0b' },
          { value: '24h', label: 'Fast Payouts', icon: Zap, color: '#06b6d4' },
        ].map((s, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: s.color }}><s.icon size={24} strokeWidth={1.75} /></div>
            <div style={{ fontSize: 32, fontWeight: 900, color: s.color, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ width: '100%', maxWidth: 900, marginBottom: 64 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 32 }}>How It Works</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {[
            { step: '01', icon: UserPlus, title: 'Register', desc: 'Sign up with your email and InstaPay number. Get your unique referral link instantly.' },
            { step: '02', icon: Link2, title: 'Share', desc: 'Share your link on YouTube, Facebook, TikTok, or anywhere your audience is.' },
            { step: '03', icon: CreditCard, title: 'They Subscribe', desc: 'When someone subscribes through your link, we track the sale automatically.' },
            { step: '04', icon: Wallet, title: 'Get Paid', desc: 'You earn 20% of every credit pack sale. Paid to InstaPay.' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '24px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', padding: '3px 8px', borderRadius: 6 }}>{s.step}</span>
                <s.icon size={20} strokeWidth={1.75} color="#22c55e" />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Commission Table */}
      <div style={{ width: '100%', maxWidth: 900, marginBottom: 64 }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: 8 }}>Your Earnings Per Sale</h2>
        <p style={{ color: '#6b7280', fontSize: 14, textAlign: 'center', marginBottom: 32 }}>Commission = 20% of every credit pack sale — credits work across every model, including Ads Creator</p>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['Pack', 'Price', 'EGP Value', 'Your Commission'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMMISSION_TABLE.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#d1d5db', fontWeight: 600 }}>{row.plan}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{row.price}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>{row.value}</td>
                  <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 800, color: '#22c55e' }}>{row.commission}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#4b5563', fontSize: 12, textAlign: 'center', marginTop: 12 }}>
          * Same 20% rate applies to Egyptian InstaPay top-ups too (any amount, not just the packs above).
        </p>
      </div>

      {/* CTA */}
      <div style={{ textAlign: 'center' }}>
        <button onClick={() => setStep('register')}
          style={{ padding: '16px 48px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 800, fontSize: 18, cursor: 'pointer', boxShadow: '0 4px 32px rgba(34,197,94,0.4)' }}>
          Start Earning Today →
        </button>
        <p style={{ color: '#4b5563', fontSize: 13, marginTop: 12 }}>Free to join. No hidden fees.</p>
      </div>
    </div>
  );

  // ── LOOKUP ────────────────────────────────────────────────────────────
  if (step === 'lookup') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 32 }}>
        <button onClick={() => setStep('landing')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, marginBottom: 20 }}>← Back</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Enter Your Code</h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>Already have a referral code? Enter it to view your stats.</p>
        <input value={lookupCode} onChange={e => setLookupCode(e.target.value)} placeholder="e.g. ahmed4x7k"
          style={{ width: '100%', padding: '13px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 15, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
        {error && <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</p>}
        <button onClick={handleLookup} disabled={loading}
          style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          {loading ? 'Loading...' : 'View My Stats →'}
        </button>
      </div>
    </div>
  );

  // ── REGISTER ──────────────────────────────────────────────────────────
  if (step === 'register') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 480, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 24, padding: '36px 32px' }}>
        <button onClick={() => setStep('landing')} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, marginBottom: 24 }}>← Back</button>
        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 12, color: '#22c55e' }}><DollarSign size={36} strokeWidth={1.5} /></div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Join as Affiliate</h2>
          <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>Get your unique link and start earning 20% of every credit pack sale.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={13} strokeWidth={2} /> Email Address</p>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
              style={{ width: '100%', padding: '13px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}><Smartphone size={13} strokeWidth={2} /> InstaPay Number <span style={{ color: '#6b7280', fontWeight: 400 }}>(for payouts)</span></p>
            <input type="text" value={instapay} onChange={e => setInstapay(e.target.value)} placeholder="01xxxxxxxxx"
              style={{ width: '100%', padding: '13px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
        </div>
        {error && <p style={{ color: '#ef4444', fontSize: 13, margin: '12px 0 0' }}>{error}</p>}
        <button onClick={handleRegister} disabled={loading}
          style={{ width: '100%', marginTop: 20, padding: '14px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 20px rgba(34,197,94,0.3)' }}>
          {loading ? 'Creating account...' : 'Get My Referral Link →'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#4b5563', marginTop: 16 }}>
          Already have a code? <button onClick={() => setStep('lookup')} style={{ background: 'none', border: 'none', color: '#22c55e', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Enter it here</button>
        </p>
      </div>
    </div>
  );

  // ── DASHBOARD ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><DollarSign size={20} strokeWidth={2} color="#22c55e" /> Affiliate Dashboard</h1>
            <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0' }}>Your code: <span style={{ color: '#22c55e', fontWeight: 700, fontFamily: 'monospace' }}>{refCode}</span></p>
          </div>
          <button onClick={() => { localStorage.removeItem('affiliate_ref_code'); setStep('landing'); setStats(null); setRefCode(''); }}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b7280', cursor: 'pointer', fontSize: 12, padding: '6px 12px' }}>
            Logout
          </button>
        </div>

        {loading && !stats ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Loading your stats...</div>
        ) : stats ? (
          <>
            {/* Ref Link */}
            <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 16, padding: '20px 24px', marginBottom: 24 }}>
              <p style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}><Link2 size={13} strokeWidth={2} /> Your Referral Link</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '10px 14px', color: '#86efac', fontSize: 13, wordBreak: 'break-all' }}>
                  {stats.ref_link}
                </code>
                <button onClick={copyLink}
                  style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: copied ? '#22c55e' : 'rgba(34,197,94,0.2)', color: copied ? '#fff' : '#22c55e', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {copied ? <Check size={14} strokeWidth={2.5} /> : null} {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>

            {/* Commission Note */}
            <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '12px 18px', marginBottom: 20 }}>
              <p style={{ color: '#f59e0b', fontSize: 13, margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <Lightbulb size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} /> <span>Your commission is <strong>20% of every credit pack sale</strong> — no platform-cost deductions, no fine print. See the earnings table on the main page for details.</span>
              </p>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Total Clicks', value: stats.stats.total_clicks, icon: MousePointerClick, color: '#7c6af7' },
                { label: 'Signups', value: stats.stats.total_referrals, icon: UserPlus, color: '#06b6d4' },
                { label: 'Paid Users', value: stats.stats.total_paid_users, icon: CreditCard, color: '#f59e0b' },
                { label: 'Total Earned', value: stats.stats.total_earned + ' EGP', icon: DollarSign, color: '#22c55e' },
                { label: 'Paid Out', value: stats.stats.total_paid + ' EGP', icon: Check, color: '#22c55e' },
                { label: 'Pending', value: stats.stats.pending_payout + ' EGP', icon: Clock, color: '#f59e0b' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 16px', textAlign: 'center' }}>
                  <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center', color: s.color }}><s.icon size={19} strokeWidth={1.75} /></div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Conversion Rate */}
            {stats.stats.total_clicks > 0 && (
              <div style={{ background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#9ca3af' }}>Conversion Rate (clicks → signups)</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#7c6af7' }}>
                  {((stats.stats.total_referrals / stats.stats.total_clicks) * 100).toFixed(1)}%
                </span>
              </div>
            )}

            {/* Recent Activity */}
            {stats.recent_referrals?.length > 0 && (
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 14 }}>Recent Activity</h3>
                <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
                  {stats.recent_referrals.filter(r => r.event !== 'click').slice(0, 10).map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: i < 9 ? '1px solid rgba(255,255,255,0.05)' : 'none', flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {r.event === 'signup' ? <UserPlus size={16} strokeWidth={1.75} color="#06b6d4" /> : <CreditCard size={16} strokeWidth={1.75} color="#f59e0b" />}
                        <div>
                          <div style={{ fontSize: 13, color: '#d1d5db', fontWeight: 600 }}>
                            {r.event === 'signup' ? 'New Signup' : `Payment — ${r.plan}`}
                          </div>
                          <div style={{ fontSize: 11, color: '#4b5563' }}>{r.user_email || '—'} · {new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {r.commission_egp && <div style={{ fontSize: 15, fontWeight: 800, color: '#22c55e' }}>+{r.commission_egp} EGP</div>}
                        {r.paid_out && <div style={{ fontSize: 10, color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}><Check size={11} strokeWidth={2.5} /> Paid</div>}
                        {r.commission_egp && !r.paid_out && <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}><Clock size={11} strokeWidth={2} /> Pending</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <button onClick={() => fetchStats(refCode)} disabled={loading}
                style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b7280', cursor: 'pointer', fontSize: 13, padding: '8px 20px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {loading ? <Loader2 size={13} className="spinning" /> : <RefreshCw size={13} strokeWidth={2} />} {loading ? 'Refreshing...' : 'Refresh Stats'}
              </button>
            </div>
          </>
        ) : (
          error && <p style={{ color: '#ef4444', textAlign: 'center', padding: 40 }}>{error}</p>
        )}
      </div>
    </div>
  );
}