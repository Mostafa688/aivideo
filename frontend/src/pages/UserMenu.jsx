import React, { useState, useEffect, useRef } from 'react';
import {
  Circle, Zap, Rocket, Crown, X, Check, Clapperboard, ImageIcon, Video, Drama, Coins,
  BookOpen, Tv, HandCoins, Settings as SettingsIcon, Info, FileText, Lock, Wallet, LogOut,
  Home, Gem, GraduationCap, Globe, MessageCircle, HelpCircle, Sparkles, Mail, Smartphone, Megaphone, Map, Activity, Plug, BarChart3,
  PartyPopper, Copy, ArrowRight, ChevronRight, Loader2,
} from 'lucide-react';

// ✅ FIX (طلب العميل: "احذف اي ايموجي، خليك ذكي وشوف المواقع الكبيرة بتعمل اي واعمل زيهم"):
// كل الإيموجي في الملف ده اتشالت واتبدلت بأيقونات حقيقية من lucide-react (مكتبة أيقونات
// SVG خفيفة) — نفس النمط اللي منصات احترافية زي Google/Notion/Linear بتستخدمه بدل الإيموجي
// ✅ FIX (باج حقيقي: عميل مشترك فعليًا كان شايف "Free Plan" رمادي في المنيو بتاعه — الباك
// إند مبيخزنش غير "free" أو "paid" بالظبط (مفيش خطط Pro/Plus/Max حقيقية دلوقتي)، بس المفتاح
// "paid" ماكانش موجود خالص في الجدول ده، فـ`PLAN_META[plan] || PLAN_META.free` كان بيرجع
// لـ"Free" تلقائيًا لأي مشترك حقيقي — أضفنا مفتاح "paid" الحقيقي عشان يتحل الباج ده تمامًا)
export const PLAN_META = {
  free:  { color: '#6b7280', Icon: Circle, label: 'Free',    ring: '#374151' },
  paid:  { color: '#7c6af7', Icon: Zap,    label: 'Premium', ring: '#4c3d99' },
  pro:   { color: '#7c6af7', Icon: Zap,    label: 'Pro',   ring: '#4c3d99' },
  plus:  { color: '#06b6d4', Icon: Rocket, label: 'Plus',  ring: '#0e5f7a' },
  max:   { color: '#f59e0b', Icon: Crown,  label: 'Max',   ring: '#92400e' },
};
Object.values(PLAN_META).forEach(m => { m.glow = `${m.color}55`; });

export function HowToModal({ onClose }) {
  const [activeTab, setActiveTab] = useState(0);

  const TABS = [
    {
      Icon: Clapperboard, title: 'Video Plans (Model 1 & 2)',
      steps: [
        { step: '1', title: 'Enter your idea', desc: 'Type a topic or paste a script. Erivion\'s AI will write the scenes, voiceover, and captions automatically.' },
        { step: '2', title: 'Choose duration & style', desc: 'Pick from 30s up to 10 minutes. Select aspect ratio (9:16, 16:9, 1:1) and video style.' },
        { step: '3', title: 'Review scenes', desc: 'Edit any scene prompt or voiceover text before rendering.' },
        { step: '4', title: 'Download your video', desc: 'Your video is ready in minutes with music, captions, and transitions.' },
      ],
    },
    {
      Icon: ImageIcon, title: 'AI Image Videos (Model 3)',
      steps: [
        { step: '1', title: 'Describe your video', desc: 'Enter an idea or script. AI generates unique images for every scene using Stability AI.' },
        { step: '2', title: 'Select duration', desc: 'Choose 30s, 1min, 3min, or 5min depending on your plan.' },
        { step: '3', title: 'Cinematic zoom effects', desc: 'Each image gets a smooth Ken Burns zoom effect for a cinematic look.' },
        { step: '4', title: 'Download & publish', desc: 'Full HD video with AI voiceover, captions, and background music.' },
      ],
    },
    {
      Icon: Video, title: 'Real AI Video (Model 4)',
      steps: [
        { step: '1', title: 'Write your script', desc: 'Describe your scenes. Each scene becomes a real AI-generated video clip powered by Seedance v1 Pro.' },
        { step: '2', title: 'Choose clip duration', desc: 'Pick 30s, 1min, or 3min videos. Each scene is ~7 seconds of real motion video.' },
        { step: '3', title: 'AI generates motion', desc: 'Real moving video — not just images with zoom. Characters, objects, and environments actually move.' },
        { step: '4', title: 'Get your video', desc: 'Download with full voiceover, Arabic/English captions, and music.' },
      ],
    },
    {
      Icon: Drama, title: 'Cinematic AI (Model 5)',
      steps: [
        { step: '1', title: 'Describe characters', desc: 'Define up to 5 characters with detailed descriptions for consistent appearance across all scenes.' },
        { step: '2', title: 'Write the story', desc: 'Describe your cinematic scene or story. No voiceover — pure visual storytelling.' },
        { step: '3', title: 'Seedance 2.0 renders it', desc: 'Character-consistent cinematic scenes with original ambient audio. No narration needed.' },
        { step: '4', title: 'Download your film', desc: 'Professional cinematic video in 15s, 30s, or 1min format.' },
      ],
    },
    {
      Icon: Coins, title: 'Credits System',
      steps: [
        { step: '', title: 'What are credits?', desc: 'One credit balance works across every model (1, 2, 3, 4, 5, 7) — no separate plan per model.' },
        { step: '', title: 'Pay once, no expiry', desc: 'Top up your credit balance once — it never expires or resets. Use it whenever you want, top up again anytime you need more.' },
        { step: '', title: 'Free plan', desc: 'Limited free credits to try Model 2 (Real Footage). Other models need a paid credit balance.' },
        { step: '', title: 'Credit costs', desc: 'Shorter/simpler videos use fewer credits; longer or more complex ones (more scenes, extra reference photos) use more.' },
      ],
    },
  ];

  const tab = TABS[activeTab];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:99999, padding:16 }}>
      <style>{`@keyframes htIn{from{opacity:0;transform:scale(0.95) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      <div style={{ background:'#09090f', border:'1px solid rgba(6,182,212,0.2)', borderRadius:24, width:'100%', maxWidth:520, maxHeight:'88vh', overflowY:'auto', boxShadow:'0 32px 80px rgba(0,0,0,0.9)', animation:'htIn 0.25s cubic-bezier(0.16,1,0.3,1)' }}>

        {/* Header */}
        <div style={{ padding:'24px 24px 0', display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#06b6d4', letterSpacing:'0.1em', marginBottom:4 }}>PLATFORM GUIDE</div>
            <h2 style={{ fontSize:22, fontWeight:800, color:'#fff', margin:0 }}>How to Use Erivion</h2>
            <p style={{ fontSize:13, color:'#4b5563', margin:'4px 0 0' }}>Everything you need to create amazing AI videos</p>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'#6b7280', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:6, padding:'16px 24px 0', overflowX:'auto', scrollbarWidth:'none' }}>
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:20, border:`1px solid ${activeTab===i ? 'rgba(6,182,212,0.5)' : 'rgba(255,255,255,0.07)'}`, background: activeTab===i ? 'rgba(6,182,212,0.1)' : 'transparent', color: activeTab===i ? '#06b6d4' : '#6b7280', cursor:'pointer', fontSize:12, fontWeight: activeTab===i ? 700 : 500, whiteSpace:'nowrap', flexShrink:0 }}>
              <t.Icon size={14} strokeWidth={2} /> {t.title.split(' ')[0]} {t.title.split(' ')[1] || ''}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding:24 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
            <tab.Icon size={18} strokeWidth={2} /> {tab.title}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {tab.steps.map((s, i) => (
              <div key={i} style={{ display:'flex', gap:14, padding:'14px 16px', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:'rgba(6,182,212,0.12)', border:'1px solid rgba(6,182,212,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'#06b6d4', flexShrink:0 }}>{s.step || <Sparkles size={13} />}</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:3 }}>{s.title}</div>
                  <div style={{ fontSize:13, color:'#6b7280', lineHeight:1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation buttons */}
          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            {activeTab > 0 && (
              <button onClick={() => setActiveTab(activeTab - 1)}
                style={{ flex:1, padding:'11px', borderRadius:10, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color:'#9ca3af', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Previous
              </button>
            )}
            {activeTab < TABS.length - 1 ? (
              <button onClick={() => setActiveTab(activeTab + 1)}
                style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#06b6d4,#0891b2)', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                Next <ArrowRight size={14} />
              </button>
            ) : (
              <button onClick={onClose}
                style={{ flex:1, padding:'11px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#22c55e,#16a34a)', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <Check size={15} /> Got it! Start Creating
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AffiliateModal({ user, onClose, onNavigateAffiliate }) {
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
            <div style={{ fontSize:13, color:'#4b5563', marginTop:4 }}>20% of every credit pack your referrals buy</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'#6b7280', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><X size={16} /></button>
        </div>

        {step === 'form' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:24 }}>
              {[['Starter','84 EGP'],['Creator','196 EGP'],['Studio','420 EGP'],['Gumroad (Intl)','20% of price']].map(([plan,earn]) => (
                <div key={plan} style={{ background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.12)', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>{plan}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:'#22c55e' }}>{earn}</div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12, marginBottom:20 }}>
              {[[Mail,'Email','email','your@email.com',email,setEmail],[Smartphone,'InstaPay','text','رقم التليفون',instapay,setInstapay]].map(([Ico,label,type,ph,val,setter]) => (
                <div key={label}>
                  <div style={{ fontSize:11, color:'#4b5563', fontWeight:600, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}><Ico size={13} /> {label}</div>
                  <input type={type} value={val} onChange={e=>setter(e.target.value)} placeholder={ph}
                    style={{ width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10, padding:'11px 14px', color:'#fff', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:'inherit', transition:'border-color 0.2s' }}
                    onFocus={e=>e.target.style.borderColor='rgba(124,106,247,0.4)'}
                    onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.08)'} />
                </div>
              ))}
            </div>

            {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'10px 14px', color:'#ef4444', fontSize:13, marginBottom:16 }}>{error}</div>}

            <button onClick={handleSubmit} disabled={loading}
              style={{ width:'100%', background:loading?'#1f1f2e':'linear-gradient(135deg,#7c6af7,#6d28d9)', border:'none', borderRadius:12, padding:'14px', color:'#fff', fontWeight:700, fontSize:15, cursor:loading?'not-allowed':'pointer', transition:'all 0.2s', boxShadow:loading?'none':'0 4px 20px rgba(124,106,247,0.3)', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {loading ? <><Loader2 size={16} className="spinning" /> Registering...</> : <>Get My Referral Link <ArrowRight size={15} /></>}
            </button>
          </>
        )}

        {step === 'success' && result && (
          <div>
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ width:64, height:64, borderRadius:20, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', color:'#22c55e' }}><PartyPopper size={28} /></div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', marginBottom:4 }}>{result.already_exists?'Welcome back!':'You\'re in!'}</div>
              <div style={{ fontSize:13, color:'#4b5563' }}>Share your link and start earning</div>
            </div>
            <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:12, padding:'14px 16px', marginBottom:12 }}>
              <div style={{ fontSize:10, color:'#4b5563', fontWeight:700, letterSpacing:'0.08em', marginBottom:8 }}>YOUR REFERRAL LINK</div>
              <div style={{ fontSize:12, color:'#7c6af7', fontFamily:'monospace', wordBreak:'break-all', marginBottom:12 }}>{result.ref_link}</div>
              <button onClick={copyLink} style={{ width:'100%', background:'rgba(124,106,247,0.1)', border:'1px solid rgba(124,106,247,0.2)', borderRadius:8, padding:'9px', color:'#a78bfa', fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Copy size={14} /> Copy Link</button>
            </div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:11, color:'#4b5563', marginBottom:4 }}>YOUR CODE</div>
              <div style={{ fontSize:24, fontWeight:800, color:'#f59e0b', fontFamily:'monospace', letterSpacing:'0.15em' }}>{result.ref_code}</div>
            </div>
            <button onClick={onClose} style={{ width:'100%', background:'linear-gradient(135deg,#22c55e,#16a34a)', border:'none', borderRadius:12, padding:'12px', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              <Check size={16} /> Start Marketing!
            </button>
            <button onClick={() => { onClose(); onNavigateAffiliate?.(); }} style={{ width:'100%', marginTop:8, background:'transparent', border:'1px solid rgba(34,197,94,0.3)', borderRadius:12, padding:'10px', color:'#22c55e', fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              View Full Dashboard <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UserMenu({ user, plan = 'free', credits = null, onLogout, onNavigate, model3Access = false, model4Access = false, model5Access = false, model6Access = false, avatar = null, currentPage = '', onShowHowTo, onShowAffiliate }) {
  const [open, setOpen] = useState(false);
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
        { Icon: BookOpen, label: 'How to Use Erivion', sub: 'Full platform guide', key: 'howto', accent: '#06b6d4', badge: 'NEW' },
        { Icon: Tv, label: 'My Channels', sub: 'Daily auto-video via VidIQ', key: 'channels', accent: '#7c6af7', badge: 'BETA' },
        { Icon: HandCoins, label: 'Earn with Erivion', sub: 'Affiliate — 20% commission', key: 'affiliate', accent: '#22c55e', badge: 'EARN' },
        ...(model3Access ? [{ Icon: ImageIcon, label: 'AI Image Video', sub: 'Model 3', key: 'model3', accent: '#f59e0b' }] : []),
      ]
    },
    {
      items: [
        { Icon: SettingsIcon, label: 'Settings', key: 'settings' },
        { Icon: FileText, label: 'Terms of Service', key: 'terms' },
        { Icon: Lock, label: 'Privacy Policy', key: 'privacy' },
        { Icon: Wallet, label: 'Refund Policy', key: 'refund' },
      ]
    },
  ];

  // ✅ NEW (طلب العميل: حذف الشريط العلوي بالكامل ونقل كل حاجة فيه لليوز منيو): القائمة دي
  // كانت خاصة بالموبايل بس (الشريط العلوي كان بيغطيها على الديسكتوب) — دلوقتي هي المكان
  // الوحيد لكل روابط التنقل الرئيسية، على كل أحجام الشاشات
  const SITE_NAV = [
    { key:'home', Icon: Home, label:'Home' }, { key:'stats', Icon: BarChart3, label:'My Activity' },
    { key:'pricing', Icon: Gem, label:'Pricing' },
    { key:'templates', Icon: Clapperboard, label:'Templates' }, { key:'courses', Icon: GraduationCap, label:'Courses' },
    { key:'changelog', Icon: Megaphone, label:"What's New" },
    { key:'roadmap', Icon: Map, label:'Roadmap' },
    { key:'status', Icon: Activity, label:'Status' },
    { key:'api-docs', Icon: Plug, label:'API & MCP' },
    { key:'community', Icon: Globe, label:'Community' }, { key:'about', Icon: Info, label:'About Us' },
    { key:'support', Icon: MessageCircle, label:'Support' }, { key:'faq', Icon: HelpCircle, label:'FAQ' },
    { key:'affiliate', Icon: HandCoins, label:'Affiliate' },
  ];

  const handleItemClick = (key) => {
    setOpen(false);
    if (key === 'affiliate') { onShowAffiliate?.(); }
    else if (key === 'howto') { onShowHowTo?.(); }
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
        .um-upgrade:hover { background: rgba(124,106,247,0.16) !important; }
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
          {/* ✅ FIX (طلب العميل: "لازم يكون في علامة على صورة البروفايل بتقول انا على خطة اي"):
              كانت مجرد نقطة صغيرة بعلامة صح مبهمة — دلوقتي أيقونة الخطة نفسها (meta.Icon) ظاهرة
              في نفس المكان، فأي خطة (Free/Premium) بتديك إشارة واضحة من غير ما تفتح المنيو */}
          <div title={`${meta.label} Plan`} style={{ position:'absolute', bottom:-2, right:-2, width:16, height:16, borderRadius:'50%', background:meta.color, border:'2px solid var(--bg)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <meta.Icon size={9} strokeWidth={2.75} color="#fff" />
          </div>
        </button>

        {/* Dropdown */}
        {open && (
          <div style={{
            position:'fixed', top:58, right:12, zIndex:9999,
            background:'#09090f',
            border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:18, overflow:'hidden',
            width:264,
            maxHeight:'calc(100vh - 70px)',
            overflowY:'auto',
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
                    <meta.Icon size={11} color={meta.color} strokeWidth={2.5} />
                    <span style={{ fontSize:11, color:meta.color, fontWeight:700, letterSpacing:'0.04em' }}>{meta.label} Plan</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ NEW (طلب العميل — بالصورة المرجعية): رصيد الكريديت + زرار ترقية واضح جوه
                المنيو نفسه، مش بس في الهيدر — بيظهر بس لو الرصيد اتحمّل فعليًا */}
            {credits && (
              <button
                className="um-item um-upgrade"
                onClick={() => handleItemClick('pricing')}
                style={{
                  width:'calc(100% - 12px)', margin:'8px 6px 2px', display:'flex', alignItems:'center', gap:10,
                  padding:'10px 12px', borderRadius:12, border:'1px solid rgba(124,106,247,0.25)',
                  background:'rgba(124,106,247,0.08)', cursor:'pointer', textAlign:'left',
                }}>
                <Coins size={16} color="#a08ff8" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:700, color:'#fff' }}>
                    {(credits.credits_balance ?? 0).toLocaleString()} credits
                  </div>
                </div>
                <span style={{ fontSize:11.5, fontWeight:700, color:'#a08ff8', display:'flex', alignItems:'center', gap:3 }}>
                  Upgrade <ChevronRight size={13} />
                </span>
              </button>
            )}

            {/* ✅ روابط التنقل الرئيسية — كانت قبل كده في شريط علوي منفصل على الديسكتوب، دلوقتي هنا بس */}
            <div style={{ padding:'6px 6px 0' }}>
              <div>
                <div style={{ fontSize:9, fontWeight:700, color:'#374151', letterSpacing:'0.1em', textTransform:'uppercase', padding:'4px 10px 6px' }}>NAVIGATE</div>
                {SITE_NAV.map(item=>(
                  <button key={item.key} onClick={()=>{setOpen(false); if(item.key==='affiliate'){onShowAffiliate?.();}else{onNavigate?.(item.key);}}} className="um-item"
                    style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:10,border:'none',background:currentPage===item.key?'rgba(124,106,247,0.1)':'transparent',color:item.key==='affiliate'?'#22c55e':currentPage===item.key?'#a78bfa':'#d1d5db',cursor:'pointer',fontSize:13,fontWeight:currentPage===item.key||item.key==='affiliate'?700:500,textAlign:'left'}}>
                    <item.Icon size={15} strokeWidth={2} />
                    <span>{item.label}</span>
                    {currentPage===item.key&&<div style={{marginLeft:'auto',width:5,height:5,borderRadius:'50%',background:'#a78bfa'}}/>}
                  </button>
                ))}
                <div style={{height:1,background:'rgba(255,255,255,0.05)',margin:'4px 0'}}/>
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
                      onClick={() => handleItemClick(item.key)}
                      style={{
                        width:'100%', display:'flex', alignItems:'center', gap:10,
                        padding:'9px 10px', borderRadius:10, border:'none',
                        background: item.key === 'affiliate' ? 'rgba(34,197,94,0.06)' : item.key === 'howto' ? 'rgba(6,182,212,0.06)' : 'transparent',
                        color: item.accent ? item.accent : '#9ca3af',
                        cursor:'pointer', fontSize:13, fontWeight: item.accent ? 600 : 500,
                        textAlign:'left',
                      }}>
                      <item.Icon size={15} strokeWidth={2} style={{ flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight: item.accent ? 600 : 500, color: item.accent ? item.accent : '#d1d5db', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</div>
                        {item.sub && <div style={{ fontSize:10, color: item.accent ? `${item.accent}99` : '#4b5563', marginTop:1 }}>{item.sub}</div>}
                      </div>
                      {item.badge && (
                        <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4,
                          background: item.key === 'howto' ? 'rgba(6,182,212,0.15)' : 'rgba(34,197,94,0.15)',
                          color: item.key === 'howto' ? '#06b6d4' : '#22c55e',
                          letterSpacing:'0.06em',
                          border: item.key === 'howto' ? '1px solid rgba(6,182,212,0.2)' : '1px solid rgba(34,197,94,0.2)',
                        }}>
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
                <LogOut size={15} strokeWidth={2} />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

    </>
  );
}
