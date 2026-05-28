import React, { useState, useEffect, useRef } from 'react';

const PLAN_META = {
  free:  { color: '#6b7280', glow: 'rgba(107,114,128,0.3)',  icon: '○',  label: 'Free',  ring: '#374151' },
  pro:   { color: '#7c6af7', glow: 'rgba(124,106,247,0.35)', icon: '⚡', label: 'Pro',   ring: '#4c3d99' },
  plus:  { color: '#06b6d4', glow: 'rgba(6,182,212,0.35)',   icon: '🚀', label: 'Plus',  ring: '#0e5f7a' },
  max:   { color: '#f59e0b', glow: 'rgba(245,158,11,0.35)',  icon: '♛',  label: 'Max',   ring: '#92400e' },
};

function AffiliateModal({ user, onClose }) {
  const [step, setStep] = useState('form');
  const [email, setEmail] = useState(user?.email || '');
  const [instapay, setInstapay] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    if (!email || !instapay) { setError('من فضلك أكمل جميع الحقول'); return; }
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/affiliate/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, instapay }),
      });
      const d = await r.json();
      if (d.success) { setResult(d); setStep('success'); }
      else setError(d.error || 'حدث خطأ، حاول تاني');
    } catch { setError('حدث خطأ في الاتصال'); }
    setLoading(false);
  };

  const copyLink = () => result?.ref_link && navigator.clipboard.writeText(result.ref_link);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:99999, padding:16 }}>
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.94) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      <div style={{ background:'#09090f', border:'1px solid rgba(124,106,247,0.25)', borderRadius:24, padding:32, width:'100%', maxWidth:420, boxShadow:'0 32px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(124,106,247,0.08)', animation:'modalIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:28 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#22c55e', letterSpacing:'0.1em', marginBottom:6 }}>AFFILIATE PROGRAM</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#fff', letterSpacing:'-0.5px' }}>Earn with Erivion</div>
            <div style={{ fontSize:13, color:'#4b5563', marginTop:4 }}>50% of every subscription you refer</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'#6b7280', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
        </div>

        {step === 'form' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:24 }}>
              {[['Pro','22 EGP'],['Plus','47 EGP'],['Max','122 EGP'],['M3 Max','175 EGP']].map(([plan,earn]) => (
                <div key={plan} style={{ background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.12)', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>{plan}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#22c55e' }}>{earn}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
              {[['📧 Email','email','your@email.com',email,setEmail],['📱 InstaPay','text','رقم التليفون',instapay,setInstapay]].map(([label,type,ph,val,setter]) => (
                <div key={label}>
                  <div style={{ fontSize:11, color:'#4b5563', fontWeight:600, marginBottom:6 }}>{label}</div>
                  <input type={type} value={val} onChange={e=>setter(e.target.value)} placeholder={ph}
                    style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'11px 14px', color:'#fff', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'inherit', transition:'border-color 0.2s' }}
                    onFocus={e=>e.target.style.borderColor='rgba(124,106,247,0.4)'}
                    onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.08)'} />
                </div>
              ))}
            </div>

            {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px', color:'#ef4444', fontSize:13, marginBottom:16 }}>{error}</div>}

            <button onClick={handleSubmit} disabled={loading}
              style={{ width:'100%', background:loading?'#1f1f2e':'linear-gradient(135deg,#7c6af7,#6d28d9)', border:'none', borderRadius:12, padding:'14px', color:'#fff', fontWeight:700, fontSize:15, cursor:loading?'not-allowed':'pointer', transition:'all 0.2s', boxShadow:loading?'none':'0 4px 20px rgba(124,106,247,0.3)' }}>
              {loading ? '⏳ Registering...' : '🚀 Get My Referral Link →'}
            </button>
          </>
        )}

        {step === 'success' && result && (
          <div>
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ width:64, height:64, borderRadius:20, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 16px' }}>🎉</div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4 }}>{result.already_exists?'Welcome back!':'You\'re in!'}</div>
              <div style={{ fontSize:13, color:'#4b5563' }}>Share your link and start earning</div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
              <div style={{ fontSize:10, color:'#4b5563', fontWeight:700, letterSpacing:'0.08em', marginBottom:8 }}>YOUR REFERRAL LINK</div>
              <div style={{ fontSize:12, color:'#7c6af7', fontFamily:'monospace', wordBreak:'break-all', marginBottom:12 }}>{result.ref_link}</div>
              <button onClick={copyLink} style={{ width:'100%', background:'rgba(124,106,247,0.1)', border:'1px solid rgba(124,106,247,0.2)', borderRadius:8, padding:'9px', color:'#a78bfa', fontWeight:600, fontSize:13, cursor:'pointer' }}>📋 Copy Link</button>
            </div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:11, color:'#4b5563', marginBottom:4 }}>YOUR CODE</div>
              <div style={{ fontSize:24, fontWeight:800, color:'#f59e0b', fontFamily:'monospace', letterSpacing:'0.15em' }}>{result.ref_code}</div>
            </div>
            <button onClick={onClose} style={{ width:'100%', background:'linear-gradient(135deg,#22c55e,#16a34a)', border:'none', borderRadius:12, padding:'12px', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer' }}>
              ✅ Start Marketing!
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UserMenu({ user, plan = 'free', onLogout, onNavigate, model3Access = false, model4Access = false, model5Access = false, model6Access = false, avatar = null }) {
  const [open, setOpen] = useState(false);
  const [showAffiliate, setShowAffiliate] = useState(false);
  const [hovered, setHovered] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const meta = PLAN_META[plan] || PLAN_META.free;
  const firstLetter = (user?.name || user?.email || 'U')[0].toUpperCase();

  const groups = [
    {
      items: [
        ...(model3Access ? [{ icon: '🖼️', label: 'AI Image Video', sub: 'Model 3', key: 'model3', accent: '#f59e0b' }] : []),
        { icon: '💰', label: 'Earn with Erivion', sub: 'Affiliate — 50% commission', key: 'affiliate', accent: '#22c55e', badge: 'EARN' },
      ]
    },
    {
      items: [
        { icon: '⚙️', label: 'Settings', key: 'settings' },
        { icon: '💳', label: 'Pricing & Plans', key: 'pricing' },
        { icon: '🛟', label: 'Support', key: 'support' },
        { icon: 'ℹ️', label: 'About Us', key: 'about' },
      ]
    },
    {
      items: [
        { icon: '📄', label: 'Terms of Service', key: 'terms' },
        { icon: '🔒', label: 'Privacy Policy', key: 'privacy' },
        { icon: '💸', label: 'Refund Policy', key: 'refund' },
      ]
    },
  ];

  const handleItemClick = (key) => {
    setOpen(false);
    if (key === 'affiliate') setShowAffiliate(true);
    else onNavigate?.(key);
  };

  return (
    <>
      <style>{`
        @keyframes menuSlide {
          from { opacity:0; transform:translateY(-12px) scale(0.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .um-item { transition: all 0.15s ease !important; }
        .um-item:hover { background: rgba(255,255,255,0.05) !important; }
        .um-item-accent:hover { background: rgba(34,197,94,0.08) !important; }
        .um-avatar { transition: all 0.2s ease; }
        .um-avatar:hover { transform: scale(1.08); }
      `}</style>

      <div ref={menuRef} style={{ position:'relative' }}>

        {/* Avatar button */}
        <button className="um-avatar" onClick={() => setOpen(o => !o)} style={{
          width:36, height:36, borderRadius:'50%', cursor:'pointer',
          background: avatar ? 'transparent' : `linear-gradient(135deg, ${meta.color}22, ${meta.color}44)`,
          border:`2px solid ${meta.color}`,
          color:'#fff', fontWeight:800, fontSize:14,
          display:'flex', alignItems:'center', justifyContent:'center',
          boxShadow:`0 0 0 4px ${meta.glow}, 0 2px 8px rgba(0,0,0,0.4)`,
          position:'relative', overflow: 'hidden', padding: 0,
        }}>
          {avatar
            ? <img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} onError={e => { e.target.style.display='none'; }} />
            : firstLetter
          }
          {/* Plan indicator dot */}
          <div style={{ position:'absolute', bottom:-1, right:-1, width:12, height:12, borderRadius:'50%', background:meta.color, border:'2px solid var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:6 }}>
            {plan !== 'free' && <span style={{ color:'#fff' }}>✓</span>}
          </div>
        </button>

        {/* Dropdown */}
        {open && (
          <div style={{
            position:'fixed', top:58, right:12, zIndex:9999,
            background:'#09090f',
            border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:18, overflow:'hidden',
            width:256,
            boxShadow:'0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)',
            animation:'menuSlide 0.2s cubic-bezier(0.16,1,0.3,1)',
          }}>

            {/* User header */}
            <div style={{ padding:'16px 16px 14px', background:'rgba(255,255,255,0.02)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:12, background: avatar ? 'transparent' : `linear-gradient(135deg, ${meta.color}33, ${meta.color}66)`, border:`1px solid ${meta.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'#fff', flexShrink:0, overflow:'hidden', padding:0 }}>
                  {avatar ? <img src={avatar} alt="avatar" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:12 }} onError={e => { e.target.style.display='none'; }} /> : firstLetter}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color:'#fff', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user?.email}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:meta.color, boxShadow:`0 0 6px ${meta.color}` }} />
                    <span style={{ fontSize:11, color:meta.color, fontWeight:700, letterSpacing:'0.04em' }}>{meta.label} Plan</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Groups */}
            <div style={{ padding:'6px' }}>
              {groups.map((group, gi) => (
                <div key={gi}>
                  {gi > 0 && <div style={{ height:1, background:'rgba(255,255,255,0.05)', margin:'4px 0' }} />}
                  {group.items.map(item => (
                    <button key={item.key}
                      className={item.accent ? 'um-item um-item-accent' : 'um-item'}
                      onMouseEnter={() => setHovered(item.key)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => handleItemClick(item.key)}
                      style={{
                        width:'100%', display:'flex', alignItems:'center', gap:10,
                        padding:'9px 10px', borderRadius:10, border:'none',
                        background: item.accent && item.key === 'affiliate' ? 'rgba(34,197,94,0.06)' : 'transparent',
                        color: item.accent ? item.accent : '#9ca3af',
                        cursor:'pointer', fontSize:13, fontWeight: item.accent ? 600 : 500,
                        textAlign:'left',
                      }}>
                      <span style={{ fontSize:15, width:22, textAlign:'center', flexShrink:0 }}>{item.icon}</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight: item.accent ? 600 : 500, color: item.accent ? item.accent : '#d1d5db', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</div>
                        {item.sub && <div style={{ fontSize:10, color: item.accent ? `${item.accent}99` : '#4b5563', marginTop:1 }}>{item.sub}</div>}
                      </div>
                      {item.badge && (
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,0.15)', color:'#22c55e', letterSpacing:'0.06em', border:'1px solid rgba(34,197,94,0.2)' }}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Sign out */}
            <div style={{ padding:'6px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              <button onClick={() => { setOpen(false); onLogout?.(); }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:10, border:'none', background:'transparent', color:'#6b7280', cursor:'pointer', fontSize:13, fontWeight:500, textAlign:'left', transition:'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(239,68,68,0.08)'; e.currentTarget.style.color='#ef4444'; }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='#6b7280'; }}>
                <span style={{ fontSize:15, width:22, textAlign:'center' }}>→</span>
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {showAffiliate && <AffiliateModal user={user} onClose={() => setShowAffiliate(false)} />}
    </>
  );
}