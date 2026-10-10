import React, { useState, useEffect, useRef } from 'react';
import SubPage from './SubPage.jsx';
import {
  CheckCircle2, ImageIcon, Film, Drama, Map, Mic,
  Smartphone, Scissors, Zap, Star, ShoppingBag, MessageSquare, Sparkles,
  Play, Volume2, VolumeX, X, Clapperboard, Wand2, Tv, Plug, ArrowRight, Gift, Upload,
} from 'lucide-react';
import { SHOWCASE_VIDEOS, SHOWCASE_KINDS, showcaseFor } from '../../../src/services/showcaseVideos.js';

// ─── Support Page ─────────────────────────────────────────────────────────────
function SupportPage({ onBack }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle');
  const handleSend = async () => {
    if (!email || !message) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, message }) });
      if (res.ok) setStatus('sent'); else setStatus('error');
    } catch { setStatus('error'); }
  };
  return (
    <div style={{ minHeight:'100vh', background:'#050508', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', padding:'40px 24px' }}>
      <div style={{ maxWidth:560, width:'100%' }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:14, marginBottom:32, display:'flex', alignItems:'center', gap:6 }}>← Back</button>
        <h1 style={{ fontSize:36, fontWeight:800, marginBottom:8, letterSpacing:'-1px' }}>Support</h1>
        <p style={{ color:'#6b7280', marginBottom:32 }}>Reach us at <a href="mailto:digidelight33@gmail.com" style={{ color:'#7c6af7' }}>digidelight33@gmail.com</a></p>
        {status === 'sent' ? (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ marginBottom:16, display:'flex', justifyContent:'center', color:'#34d399' }}><CheckCircle2 size={44} strokeWidth={1.75} /></div>
            <h3 style={{ fontSize:20, fontWeight:700, color:'#34d399' }}>Message Sent!</h3>
            <p style={{ color:'#6b7280', marginTop:8 }}>We'll get back to you within 24 hours.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <input placeholder="Your name" value={name} onChange={e=>setName(e.target.value)} style={{ padding:'13px 16px', borderRadius:12, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:14, outline:'none' }} />
            <input type="email" placeholder="Email *" value={email} onChange={e=>setEmail(e.target.value)} style={{ padding:'13px 16px', borderRadius:12, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:14, outline:'none' }} />
            <textarea placeholder="Your message *" value={message} onChange={e=>setMessage(e.target.value)} rows={5} style={{ padding:'13px 16px', borderRadius:12, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:14, outline:'none', resize:'vertical', fontFamily:'inherit' }} />
            {status === 'error' && <p style={{ color:'#f87171', fontSize:13 }}>Something went wrong. Email us directly.</p>}
            <button onClick={handleSend} disabled={!email||!message||status==='loading'} style={{ padding:'13px', background:'linear-gradient(135deg,#7c6af7,#6d28d9)', color:'#fff', border:'none', borderRadius:12, fontWeight:700, fontSize:15, cursor:'pointer', opacity:(!email||!message)?0.5:1 }}>
              {status==='loading'?'Sending...':'Send Message →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
export function AppFooter({ onNavigate, onGetStarted }) {
  return (
    <footer style={{ borderTop:'1px solid rgba(255,255,255,0.06)', padding:'60px 40px 40px', background:'#050508' }}>
      <div style={{ maxWidth:1200, margin:'0 auto' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:48, marginBottom:48, flexWrap:'wrap' }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <img src="/logo.png" alt="Erivion" style={{ width:32, height:32, objectFit:'contain' }} />
              <span style={{ fontSize:18, fontWeight:800, color:'#fff', letterSpacing:'-0.5px' }}>Erivion</span>
            </div>
            <p style={{ fontSize:13, color:'#4b5563', lineHeight:1.8, maxWidth:240 }}>AI-powered video creation for creators, educators, and storytellers worldwide.</p>
            <div style={{ display:'flex', gap:12, marginTop:20, flexWrap:'wrap' }}>
              {[
                { label:'TikTok', href:'https://www.tiktok.com/@erivion?is_from_webapp=1&sender_device=pc' },
                { label:'YouTube', href:'https://youtube.com/@erivionaivideocreator?si=GEaDYOSsXgzChXNX' },
                { label:'Instagram', href:'https://www.instagram.com/erivionai/' },
                { label:'Facebook', href:'https://www.facebook.com/profile.php?id=61589115720431' },
              ].map(s=>(
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', fontSize:11, color:'#6b7280', cursor:'pointer', textDecoration:'none', transition:'all 0.2s' }}
                  onMouseEnter={e=>{e.currentTarget.style.color='#fff';e.currentTarget.style.borderColor='rgba(255,255,255,0.2)'}}
                  onMouseLeave={e=>{e.currentTarget.style.color='#6b7280';e.currentTarget.style.borderColor='rgba(255,255,255,0.08)'}}>{s.label}</a>
              ))}
            </div>
          </div>
          {[
            { title:'Product', links:[{label:'Get Started',action:()=>onGetStarted?.()},{label:'Pricing',action:()=>onGetStarted?.()},{label:'Templates',action:()=>onNavigate?.('templates')},{label:'Courses',action:()=>onNavigate?.('courses')},{label:"What's New",action:()=>onNavigate?.('changelog')},{label:'Roadmap',action:()=>onNavigate?.('roadmap')},{label:'Status',action:()=>onNavigate?.('status')},{label:'API & MCP',action:()=>onNavigate?.('api-docs')},{label:'Community',action:()=>onNavigate?.('community')}] },
            { title:'Company', links:[{label:'About Us',action:()=>onNavigate?.('about')},{label:'Blog',action:()=>onNavigate?.('blog')},{label:'Support',action:()=>onNavigate?.('support')}] },
            { title:'Legal', links:[{label:'Terms of Service',action:()=>onNavigate?.('terms')},{label:'Privacy Policy',action:()=>onNavigate?.('privacy')},{label:'Refund Policy',action:()=>onNavigate?.('refund')}] },
          ].map(col=>(
            <div key={col.title}>
              <div style={{ fontSize:11, fontWeight:700, color:'#374151', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:16 }}>{col.title}</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {col.links.map(l=>(
                  <span key={l.label} onClick={l.action} style={{ fontSize:13, color:'#6b7280', cursor:'pointer', transition:'color 0.15s' }}
                    onMouseEnter={e=>e.target.style.color='#fff'} onMouseLeave={e=>e.target.style.color='#6b7280'}>{l.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:24, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <span style={{ fontSize:12, color:'#374151' }}>© 2026 Erivion. All rights reserved.</span>
          <span style={{ fontSize:12, color:'#374151' }}>Built for creators worldwide</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Video Preview Card ───────────────────────────────────────────────────────
function VideoCard({ title, tag, color, duration, views, img }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ flexShrink:0, width:200, borderRadius:16, overflow:'hidden', position:'relative', cursor:'pointer', transform:hov?'scale(1.04)':'scale(1)', transition:'transform 0.3s cubic-bezier(0.16,1,0.3,1)', boxShadow:hov?`0 20px 48px rgba(0,0,0,0.6), 0 0 0 1px ${color}44`:'0 4px 16px rgba(0,0,0,0.4)' }}>
      <div style={{ width:'100%', height:300, background:`linear-gradient(160deg, ${color}33 0%, #050508 60%)`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
        {img ? <img src={img} alt={title} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0, opacity:0.7 }} /> : null}
        <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, #050508 0%, transparent 50%)` }} />
        {hov && <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:48, height:48, borderRadius:'50%', background:'rgba(255,255,255,0.9)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>▶</div>}
        <div style={{ position:'absolute', top:10, left:10, padding:'3px 8px', borderRadius:6, background:color, fontSize:9, fontWeight:700, color:'#fff', letterSpacing:'0.08em' }}>{tag}</div>
        <div style={{ position:'absolute', top:10, right:10, padding:'3px 8px', borderRadius:6, background:'rgba(0,0,0,0.6)', fontSize:9, color:'rgba(255,255,255,0.7)' }}>{duration}</div>
      </div>
      <div style={{ padding:'10px 12px 12px', background:'#0d0d14' }}>
        <p style={{ fontSize:12, fontWeight:600, color:'#e5e7eb', margin:'0 0 4px', lineHeight:1.4 }}>{title}</p>
        <p style={{ fontSize:10, color:'#4b5563', margin:0 }}>{views} views</p>
      </div>
    </div>
  );
}

// ─── Showcase videos (real results) ───────────────────────────────────────────
const KIND_COLOR = { ad: '#10b981', cinematic: '#a855f7', comedy: '#f59e0b' };

// بيشغّل الفيديو وهو ظاهر بس (وبيوقفه لما يخرج من الشاشة) — وبيقيس شكله الحقيقي (طولي/عرضي) عشان الكارت ياخد نسبته
function AutoVideo({ src, onRatio, style, className, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) el.play().catch(() => {}); else el.pause(); }, { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [src]);
  return <video ref={ref} className={className} src={`${src}#t=0.1`} muted loop playsInline preload="metadata" style={style}
    onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth && onRatio) onRatio(v.videoWidth / v.videoHeight); }} {...rest} />;
}

function WallCard({ v, onOpen, delay = 0 }) {
  const [ratio, setRatio] = useState(9 / 16);
  const c = KIND_COLOR[v.kind] || '#7c6af7';
  const landscape = ratio > 1.1;
  return (
    <button type="button" className="ev-wall-card" onClick={() => onOpen(v)} aria-label={`Play: ${v.title.en}`}
      style={{ width: landscape ? 'calc(var(--ww) * 1.55)' : 'var(--ww)', aspectRatio: String(ratio), '--c': c, animationDelay: `${delay}ms` }}>
      <AutoVideo src={v.url} onRatio={setRatio} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <span className="ev-wall-shade" />
      <span className="ev-wall-chip" style={{ background: c }}>{SHOWCASE_KINDS[v.kind]?.en}</span>
      <span className="ev-wall-play"><Play size={16} fill="#fff" strokeWidth={0} /></span>
      <span className="ev-wall-title">{v.title.en}</span>
    </button>
  );
}

function VideoWall({ onOpen }) {
  const [a, b, c, d] = SHOWCASE_VIDEOS;
  return (
    <div className="ev-wall" aria-label="Videos made with Erivion">
      <div className="ev-wall-glow" />
      <div className="ev-wall-col"><WallCard v={a} onOpen={onOpen} delay={0} /><WallCard v={c} onOpen={onOpen} delay={120} /></div>
      <div className="ev-wall-col ev-wall-col-b"><WallCard v={b} onOpen={onOpen} delay={60} /><WallCard v={d} onOpen={onOpen} delay={180} /></div>
    </div>
  );
}

// نافذة تشغيل كاملة بصوت (الضغط = تفاعل من العميل، فالمتصفح بيسمح بالصوت)
function VideoLightbox({ v, onClose, onGetStarted }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  if (!v) return null;
  return (
    <div className="ev-lb" role="dialog" aria-modal="true" aria-label={v.title.en} onClick={onClose}>
      <button type="button" className="ev-lb-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
      <div className="ev-lb-body" onClick={(e) => e.stopPropagation()}>
        <video src={v.url} controls autoPlay playsInline loop style={{ maxWidth: '100%', maxHeight: '78vh', borderRadius: 18, background: '#000', display: 'block' }} />
        <div className="ev-lb-bar">
          <span><b>{v.title.en}</b> · Made with Erivion</span>
          <button type="button" className="ev-cta-btn" onClick={() => { onClose(); onGetStarted?.(); }} style={{ padding: '10px 20px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Make one like this <ArrowRight size={14} style={{ verticalAlign: -2 }} /></button>
        </div>
      </div>
    </div>
  );
}

// معرض النتائج: تبويبات حسب النوع + مشغّل كبير + قايمة (الضغط على أي فيديو بيشغّله بصوت)
function ShowcaseStage({ onGetStarted }) {
  const [kind, setKind] = useState('all');
  const [activeId, setActiveId] = useState(SHOWCASE_VIDEOS[0].id);
  const [sound, setSound] = useState(false);
  const [ratio, setRatio] = useState(16 / 9);
  const list = showcaseFor(kind);
  const active = list.find(v => v.id === activeId) || list[0];
  const mainRef = useRef(null);
  useEffect(() => { if (mainRef.current) { mainRef.current.muted = !sound; } }, [sound, active?.id]);
  const pick = (v) => { setActiveId(v.id); setSound(true); }; // الضغط تفاعل → الصوت مسموح
  const portrait = ratio < 0.9;
  return (
    <div>
      <div className="ev-tabs" role="tablist" aria-label="Video types">
        {[['all', 'All'], ...Object.entries(SHOWCASE_KINDS).map(([k, l]) => [k, l.en])].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className="ev-tab" onClick={() => { setKind(k); const first = showcaseFor(k)[0]; if (first) setActiveId(first.id); }}>{l}</button>
        ))}
      </div>
      <div className="ev-stage">
        <div className="ev-stage-main" style={{ '--c': KIND_COLOR[active?.kind] || '#7c6af7' }}>
          {active && (
            <div className="ev-stage-frame" style={{ aspectRatio: String(ratio), maxWidth: portrait ? 315 : '100%' }}>
              <video key={active.id} ref={mainRef} src={active.url} autoPlay muted={!sound} loop playsInline controls
                onLoadedMetadata={(e) => { const v = e.currentTarget; if (v.videoWidth) setRatio(v.videoWidth / v.videoHeight); v.muted = !sound; }}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }} />
              <button type="button" className="ev-snd" onClick={() => setSound(s => !s)} aria-pressed={sound}>{sound ? <Volume2 size={14} /> : <VolumeX size={14} />} {sound ? 'Sound on' : 'Tap for sound'}</button>
            </div>
          )}
        </div>
        <div className="ev-stage-list">
          {list.map(v => {
            const on = v.id === active?.id; const c = KIND_COLOR[v.kind];
            return (
              <button key={v.id} type="button" className="ev-stage-item" aria-pressed={on} onClick={() => pick(v)} style={{ '--c': c }}>
                <span className="ev-stage-thumb"><AutoVideo src={v.url} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', color: c, textTransform: 'uppercase' }}>{SHOWCASE_KINDS[v.kind]?.en}</span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: '#f3f4f6', marginTop: 2 }}>{v.title.en}</span>
                </span>
                <span className="ev-stage-go">{on ? <Volume2 size={15} /> : <Play size={15} />}</span>
              </button>
            );
          })}
          <button type="button" className="ev-cta-btn" onClick={() => onGetStarted?.()} style={{ marginTop: 6, padding: '14px 18px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 28px rgba(124,106,247,0.4)' }}>Create your own <ArrowRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Counter ─────────────────────────────────────────────────────────────
function StatCard({ value, label, color }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const target = parseInt(value.replace(/\D/g,''));
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0;
        const step = target / 60;
        const timer = setInterval(() => {
          start += step;
          if (start >= target) { setCount(target); clearInterval(timer); }
          else setCount(Math.floor(start));
        }, 16);
        io.disconnect();
      }
    }, { threshold: 0.5 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [target]);
  const suffix = value.replace(/[\d,]/g,'');
  return (
    <div ref={ref} style={{ textAlign:'center', padding:'32px 24px' }}>
      <div style={{ fontSize:48, fontWeight:900, letterSpacing:'-2px', background:`linear-gradient(135deg, #fff, ${color})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4, fontFamily:"'Bricolage Grotesque', sans-serif" }}>
        {count.toLocaleString()}{suffix}
      </div>
      <div style={{ fontSize:13, color:'#6b7280', fontWeight:500 }}>{label}</div>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────
export default function LandingPage({ onGetStarted, onNavigate, onOpenBlog }) {
  const [subPage, setSubPage] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  const [typed, setTyped] = useState('');
  const [promptIdx, setPromptIdx] = useState(0);
  const [hovModel, setHovModel] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const PROMPTS = [
    'The rise of the Ottoman Empire...',
    'Why discipline beats motivation every time...',
    'How Elon Musk thinks differently...',
    'The mystery of ancient civilizations...',
    'Why most people never reach their goals...',
  ];

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Typewriter
  useEffect(() => {
    const target = PROMPTS[promptIdx];
    let i = 0; setTyped('');
    const iv = setInterval(() => {
      if (i < target.length) setTyped(target.slice(0, ++i));
      else { clearInterval(iv); setTimeout(() => setPromptIdx(p=>(p+1)%PROMPTS.length), 2200); }
    }, 42);
    return () => clearInterval(iv);
  }, [promptIdx]);

  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll('.ev-reveal');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e,i) => {
        if (e.isIntersecting) { setTimeout(() => { e.target.style.opacity='1'; e.target.style.transform='translateY(0)'; }, (parseInt(e.target.dataset.delay)||0)); io.unobserve(e.target); }
      });
    }, { threshold:0.1 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [subPage]);

  if (subPage === 'terms')   return <SubPage page="terms"   onBack={() => setSubPage(null)} />;
  if (subPage === 'privacy') return <SubPage page="privacy" onBack={() => setSubPage(null)} />;
  if (subPage === 'support') return <SupportPage onBack={() => setSubPage(null)} />;
  // ✅ FIX (باج حقيقي رصدته مراجعة/اختبار الصفحة الجديدة): 'about' و'refund' كانوا مش
  // متعاملين معاهم هنا زي terms/privacy/support فوق، فكانوا بيسقطوا لـonNavigate بتاع
  // App.jsx اللي مش عارف يتعامل مع القيمتين دول، فبيفتح شاشة تسجيل الدخول بدل الصفحة —
  // يعني "About Us" و"Refund Policy" كانوا فعليًا مكسورين لأي زائر مش مسجل دخول، بالظبط
  // الجمهور اللي المفروض يقرأ صفحة "من نحن" قبل ما يسجل أصلاً
  if (subPage === 'about')   return <SubPage page="about"   onBack={() => setSubPage(null)} />;
  if (subPage === 'refund')  return <SubPage page="refund"  onBack={() => setSubPage(null)} />;

  const FEATURES = [
    { icon:MessageSquare, title:'One Agent, Full Production', desc:'Just chat what you want. The Agent writes the script, picks the right AI engine, and assembles the finished video for you.' },
    { icon:Mic, title:'8+ Languages & Voices', desc:'Generate videos in English, Arabic (Egyptian/Gulf/Formal), French, German, Spanish, Russian, Japanese, and more.' },
    { icon:Sparkles, title:'Multiple AI Engines, One Platform', desc:'Real cinematic motion, consistent characters, product ads, and animated maps — the Agent picks the right engine automatically.' },
    { icon:Smartphone, title:'Any Format, Any Platform', desc:'9:16 for TikTok & Reels, 16:9 for YouTube, 1:1 for Instagram. Export-ready for every platform.' },
    { icon:Scissors, title:'Scene-by-Scene Control', desc:'Review and edit every scene before rendering. Full creative control with AI doing the heavy lifting.' },
    { icon:Zap, title:'Production-Ready Output', desc:'Auto-synced captions, background music, sound effects, video transitions, and cinematic color grading.' },
  ];

  const STEPS = [
    { n:'1', title:'Describe Your Video', desc:'Type an idea, paste a script, or record your voice. Choose your language, format, and style.' },
    { n:'2', title:'Review AI Scenes', desc:'AI generates every scene with narration and visuals. Edit anything you want — full control.' },
    { n:'3', title:'Render & Download', desc:'One click produces your final video: voiceover, music, captions, effects — all included.' },
  ];

  return (
    <div style={{ background:'#050508', color:'#fff', overflowX:'hidden', fontFamily:"'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Inter:wght@300;400;500;600&display=swap');

        @keyframes fadeUp   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gradMove { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes float    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes scroll   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes glow     { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes spin     { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        .ev-reveal { opacity:0; transform:translateY(24px); transition:opacity 0.6s ease, transform 0.6s cubic-bezier(0.16,1,0.3,1); }

        .ev-model-card {
          transition: all 0.35s cubic-bezier(0.16,1,0.3,1);
          cursor: pointer;
        }
        .ev-model-card:hover { transform: translateY(-8px); }

        .ev-feature-card {
          transition: all 0.3s ease;
          cursor: default;
        }
        .ev-feature-card:hover { border-color: rgba(124,106,247,0.3) !important; background: rgba(124,106,247,0.05) !important; }

        .ev-cta-btn {
          position: relative; overflow: hidden;
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1) !important;
        }
        .ev-cta-btn::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          transform: translateX(-100%);
          transition: transform 0.5s ease;
        }
        .ev-cta-btn:hover::after { transform: translateX(100%); }
        .ev-cta-btn:hover { transform: translateY(-2px) !important; box-shadow: 0 12px 40px rgba(124,106,247,0.5) !important; }

        .ev-scroll-track { display:flex; gap:20px; animation: scroll 40s linear infinite; }
        .ev-scroll-track:hover { animation-play-state: paused; }

        .ev-nav-link {
          color: rgba(255,255,255,0.5); font-size:14px; font-weight:500;
          cursor:pointer; transition:color 0.2s; background:none; border:none;
          padding: 0; font-family: inherit;
        }
        .ev-nav-link:hover { color:#fff; }

        .ev-step-num {
          width:48px; height:48px; border-radius:14px; display:flex; align-items:center; justify-content:center;
          font-size:20px; font-weight:900; font-family:'Bricolage Grotesque', sans-serif;
          background: linear-gradient(135deg, #7c6af7, #06b6d4);
          color:#fff; flex-shrink:0;
          box-shadow: 0 8px 24px rgba(124,106,247,0.4);
        }

        /* hero */
        .ev-hero { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr); gap:48px; align-items:center; width:100%; max-width:1240px; margin:0 auto; position:relative; z-index:1; text-align:left; }
        .ev-hero-copy { display:flex; flex-direction:column; align-items:flex-start; }
        .ev-wall { --ww:178px; position:relative; display:flex; gap:16px; justify-content:center; align-items:flex-start; padding:12px 0; }
        .ev-wall-col { display:flex; flex-direction:column; gap:16px; align-items:center; }
        .ev-wall-col-b { margin-top:64px; }
        .ev-wall-glow { position:absolute; inset:-8% -4%; z-index:-1; background:radial-gradient(40% 40% at 28% 30%, rgba(124,106,247,.35), transparent 70%), radial-gradient(36% 36% at 78% 70%, rgba(6,182,212,.22), transparent 70%), radial-gradient(30% 30% at 60% 15%, rgba(225,29,72,.16), transparent 70%); filter:blur(30px); }
        .ev-wall-card { position:relative; padding:0; overflow:hidden; cursor:pointer; border-radius:22px; border:1px solid rgba(255,255,255,.12); background:#0d0d14; box-shadow:0 24px 60px rgba(0,0,0,.55); transition:transform .35s cubic-bezier(.16,1,.3,1), box-shadow .35s, border-color .35s; animation:evFloat 7s ease-in-out infinite; font:inherit; color:#fff; }
        .ev-wall-col-b .ev-wall-card { animation-duration:8.5s; animation-direction:alternate-reverse; }
        .ev-wall-card:hover { transform:scale(1.035) translateY(-4px); border-color:var(--c); box-shadow:0 30px 70px rgba(0,0,0,.6), 0 0 0 1px var(--c), 0 0 40px color-mix(in srgb, var(--c) 35%, transparent); animation-play-state:paused; }
        .ev-wall-card:focus-visible { outline:2px solid #fff; outline-offset:3px; }
        .ev-wall-shade { position:absolute; inset:0; background:linear-gradient(to top, rgba(5,5,8,.88) 0%, transparent 52%); pointer-events:none; }
        .ev-wall-chip { position:absolute; top:12px; left:12px; padding:4px 10px; border-radius:8px; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; color:#fff; }
        .ev-wall-play { position:absolute; top:10px; right:10px; width:30px; height:30px; border-radius:50%; display:grid; place-items:center; background:rgba(0,0,0,.55); backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,.25); }
        .ev-wall-title { position:absolute; left:14px; right:14px; bottom:12px; font-size:12.5px; font-weight:700; text-align:left; }
        @keyframes evFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
        /* showcase */
        .ev-tabs { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin-bottom:28px; }
        .ev-tab { padding:9px 20px; border-radius:999px; font:inherit; font-size:13px; font-weight:700; cursor:pointer; color:#9ca3af; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.1); transition:all .2s; }
        .ev-tab:hover { color:#fff; border-color:rgba(255,255,255,.22); }
        .ev-tab[aria-selected=true] { color:#fff; background:linear-gradient(135deg,#7c6af7,#6d28d9); border-color:transparent; box-shadow:0 6px 22px rgba(124,106,247,.4); }
        .ev-stage { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(0,.9fr); gap:28px; align-items:center; }
        .ev-stage-main { position:relative; display:flex; justify-content:center; padding:18px; border-radius:30px; background:radial-gradient(70% 70% at 50% 40%, color-mix(in srgb, var(--c) 18%, transparent), transparent 75%), rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.07); }
        .ev-stage-frame { position:relative; width:100%; max-height:560px; border-radius:20px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.12); background:#000; }
        .ev-snd { position:absolute; top:12px; left:12px; z-index:2; display:inline-flex; align-items:center; gap:7px; padding:8px 13px; border-radius:999px; font:inherit; font-size:12px; font-weight:700; color:#fff; cursor:pointer; background:rgba(0,0,0,.6); backdrop-filter:blur(8px); border:1px solid rgba(255,255,255,.22); }
        .ev-snd:hover { background:rgba(124,106,247,.85); }
        .ev-stage-list { display:flex; flex-direction:column; gap:10px; }
        .ev-stage-item { display:flex; align-items:center; gap:14px; padding:10px 14px 10px 10px; border-radius:16px; cursor:pointer; font:inherit; color:inherit; background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.07); transition:all .2s; }
        .ev-stage-item:hover { background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.18); }
        .ev-stage-item[aria-pressed=true] { background:color-mix(in srgb, var(--c) 12%, transparent); border-color:var(--c); }
        .ev-stage-thumb { width:64px; height:64px; border-radius:12px; overflow:hidden; flex-shrink:0; background:#0d0d14; }
        .ev-stage-go { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; flex-shrink:0; color:#fff; background:rgba(255,255,255,.08); }
        .ev-stage-item[aria-pressed=true] .ev-stage-go { background:var(--c); }
        /* lightbox */
        .ev-lb { position:fixed; inset:0; z-index:300; display:grid; place-items:center; padding:20px; background:rgba(3,3,8,.88); backdrop-filter:blur(10px); animation:fadeUp .2s ease both; }
        .ev-lb-x { position:absolute; top:18px; right:18px; width:40px; height:40px; border-radius:50%; display:grid; place-items:center; cursor:pointer; color:#fff; background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.2); }
        .ev-lb-body { display:flex; flex-direction:column; align-items:center; gap:14px; max-width:min(92vw,980px); }
        .ev-lb-bar { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; width:100%; font-size:13px; color:#9ca3af; }
        .ev-lb-bar b { color:#fff; }
        /* marquee */
        .ev-marquee { overflow:hidden; mask-image:linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); -webkit-mask-image:linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent); }
        .ev-marquee-track { display:flex; gap:14px; width:max-content; animation:scroll 38s linear infinite; }
        .ev-marquee:hover .ev-marquee-track { animation-play-state:paused; }
        .ev-pill { display:inline-flex; align-items:center; gap:9px; padding:11px 20px; border-radius:999px; font-size:14px; font-weight:700; color:#d1d5db; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.08); white-space:nowrap; }
        /* bento */
        .ev-bento { display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); gap:16px; }
        .ev-bento-card { display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; position:relative; overflow:hidden; padding:28px; border-radius:24px; background:linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.015)); border:1px solid rgba(255,255,255,.08); transition:transform .35s cubic-bezier(.16,1,.3,1), border-color .35s, box-shadow .35s; cursor:pointer; text-align:left; font:inherit; color:inherit; }
        .ev-bento-card:hover { transform:translateY(-6px); border-color:color-mix(in srgb, var(--c) 55%, transparent); box-shadow:0 24px 56px color-mix(in srgb, var(--c) 18%, transparent); }
        .ev-bento-card::before { content:''; position:absolute; top:-60px; right:-60px; width:200px; height:200px; border-radius:50%; background:radial-gradient(circle, color-mix(in srgb, var(--c) 28%, transparent), transparent 70%); pointer-events:none; }
        .ev-bento-ic { width:46px; height:46px; border-radius:14px; display:grid; place-items:center; color:#fff; margin-bottom:18px; background:linear-gradient(135deg, var(--c), color-mix(in srgb, var(--c) 45%, #000)); box-shadow:0 8px 22px color-mix(in srgb, var(--c) 40%, transparent); }
        .ev-bento-card h3 { font-family:'Bricolage Grotesque', sans-serif; font-size:21px; font-weight:800; letter-spacing:-.4px; margin:0 0 8px; }
        .ev-bento-card p { font-size:14px; color:#9ca3af; line-height:1.7; margin:0; }
        .ev-badge-free { display:inline-flex; align-items:center; gap:6px; padding:4px 11px; border-radius:999px; font-size:11px; font-weight:800; letter-spacing:.04em; color:#052e1d; background:#34d399; margin-bottom:14px; }
        .ev-chat-mock { margin-top:20px; display:grid; gap:8px; }
        .ev-bubble { max-width:86%; padding:10px 14px; border-radius:16px; font-size:13px; line-height:1.55; }
        .ev-bubble.u { justify-self:end; background:linear-gradient(135deg,#7c6af7,#9d4edd); color:#fff; border-bottom-right-radius:4px; }
        .ev-bubble.a { justify-self:start; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.09); color:#e5e7eb; border-bottom-left-radius:4px; }
        .ev-faces { display:flex; margin-top:18px; }
        .ev-faces i { width:46px; height:46px; border-radius:50%; border:3px solid #0b0b12; margin-left:-12px; display:block; }
        .ev-faces i:first-child { margin-left:0; }
        .ev-trial { display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:36px; align-items:center; padding:44px; border-radius:30px; position:relative; overflow:hidden; background:linear-gradient(135deg, rgba(52,211,153,.10), rgba(124,106,247,.10)); border:1px solid rgba(52,211,153,.25); }
        .ev-trial-step { display:flex; gap:14px; align-items:flex-start; padding:14px 16px; border-radius:16px; background:rgba(5,5,8,.5); border:1px solid rgba(255,255,255,.08); }
        .ev-trial-step b { font-family:'Bricolage Grotesque', sans-serif; width:30px; height:30px; border-radius:10px; display:grid; place-items:center; flex-shrink:0; background:#34d399; color:#052e1d; font-size:14px; }
        @media (prefers-reduced-motion:reduce) { .ev-wall-card, .ev-marquee-track { animation:none; } }
        @media (max-width:1024px) {
          .ev-hero { grid-template-columns:minmax(0,1fr); text-align:center; gap:40px; }
          .ev-hero-copy { align-items:center; }
          .ev-stage { grid-template-columns:minmax(0,1fr); }
          .ev-trial { grid-template-columns:minmax(0,1fr); padding:30px 22px; }
        }
        @media (max-width:600px) {
          .ev-wall { --ww:132px; gap:10px; }
          .ev-wall-col { gap:10px; }
          .ev-wall-col-b { margin-top:36px; }
          .ev-stage-main { padding:10px; border-radius:22px; }
        }
        @media (max-width:900px) {
          .ev-bento-card { grid-column:span 12 !important; }
        }
        @media (max-width:768px) {
          .ev-nav-links { display:none !important; }
          .ev-hero-h1 { font-size:clamp(36px,10vw,56px) !important; }
          .ev-models-grid { grid-template-columns:1fr !important; }
          .ev-features-grid { grid-template-columns:1fr !important; }
          .ev-steps { flex-direction:column !important; }
          .ev-stats-grid { grid-template-columns:repeat(2,1fr) !important; }
          .ev-footer-grid { grid-template-columns:1fr 1fr !important; }
        }
        @media (max-width:480px) {
          .ev-landing-nav { padding: 0 16px !important; }
          .ev-landing-nav-btns button { padding: 7px 12px !important; font-size: 12px !important; }
        }
      `}</style>

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav className="ev-landing-nav" style={{
        position:'fixed', top:0, left:0, right:0, zIndex:100,
        padding:'0 40px', height:64,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        background: scrollY > 40 ? 'rgba(5,5,8,0.9)' : 'transparent',
        backdropFilter: scrollY > 40 ? 'blur(20px)' : 'none',
        borderBottom: scrollY > 40 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition:'all 0.4s ease',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <img src="/logo.png" alt="Erivion" style={{ width:30, height:30, objectFit:'contain' }} />
          <span style={{ fontSize:18, fontWeight:800, letterSpacing:'-0.5px', color:'#fff' }}>Erivion</span>
        </div>
        <div className="ev-nav-links" style={{ display:'flex', alignItems:'center', gap:28 }}>
          {[['home','Home'],['templates','Templates'],['pricing','Pricing'],['courses','Courses'],['community','Community'],['faq','FAQ'],['support','Support']].map(([k,l]) => (
            <button key={k} className="ev-nav-link" onClick={() => {
              if (k === 'support') { onNavigate?.(k); return; }
              if (k === 'community') { onNavigate?.(k); return; }
              if (k === 'courses') { onNavigate?.(k); return; }
              onGetStarted?.();
            }}>{l}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={() => onNavigate?.('auth')} style={{ padding:'8px 16px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', color:'rgba(255,255,255,0.7)', fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.2s', fontFamily:'inherit', whiteSpace:'nowrap' }}
            onMouseEnter={e=>{e.target.style.background='rgba(255,255,255,0.06)';e.target.style.color='#fff'}}
            onMouseLeave={e=>{e.target.style.background='transparent';e.target.style.color='rgba(255,255,255,0.7)'}}>
            Log in
          </button>
          <button onClick={() => onGetStarted?.()} className="ev-cta-btn" style={{ padding:'8px 16px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#7c6af7,#6d28d9)', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow:'0 4px 20px rgba(124,106,247,0.4)', fontFamily:'inherit', whiteSpace:'nowrap' }}>
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'116px 24px 70px', position:'relative' }}>
        <div style={{ position:'absolute', top:'6%', left:'30%', transform:'translateX(-50%)', width:820, height:520, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,106,247,0.14) 0%, transparent 70%)', pointerEvents:'none', filter:'blur(40px)' }} />
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize:'64px 64px', maskImage:'radial-gradient(ellipse at 40% 45%, black 15%, transparent 75%)', WebkitMaskImage:'radial-gradient(ellipse at 40% 45%, black 15%, transparent 75%)', pointerEvents:'none' }} />

        <div className="ev-hero">
          <div className="ev-hero-copy">
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:999, border:'1px solid rgba(124,106,247,0.3)', background:'rgba(124,106,247,0.08)', marginBottom:26, animation:'fadeUp 0.6s ease both' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#7c6af7', animation:'glow 2s ease infinite' }} />
              <span style={{ fontSize:12, fontWeight:600, color:'#a78bfa', letterSpacing:'0.05em' }}>The AI Agent That Plans, Generates & Assembles Your Video</span>
            </div>

            <h1 className="ev-hero-h1" style={{ fontSize:'clamp(44px,6vw,80px)', fontWeight:900, letterSpacing:'-3px', lineHeight:1.0, marginBottom:22, animation:'fadeUp 0.7s ease 0.1s both', fontFamily:"'Bricolage Grotesque', sans-serif" }}>
              Turn any idea into{' '}
              <span style={{ background:'linear-gradient(135deg,#7c6af7 0%,#a78bfa 40%,#06b6d4 100%)', backgroundSize:'200%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradMove 4s ease infinite' }}>ads, films & viral clips</span>
            </h1>

            <p style={{ fontSize:'clamp(16px,2vw,19px)', color:'#9ca3af', maxWidth:560, lineHeight:1.7, marginBottom:34, animation:'fadeUp 0.7s ease 0.2s both' }}>
              Just chat. Erivion's Agent writes the script, picks the right AI engine, keeps your characters consistent, and delivers a finished video with real narration, captions and music — in 8+ languages.
            </p>

            <div style={{ width:'100%', maxWidth:560, marginBottom:18, animation:'fadeUp 0.7s ease 0.3s both' }}>
              <div style={{ display:'flex', alignItems:'center', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:18, padding:'8px 8px 8px 20px', boxShadow:'0 8px 40px rgba(0,0,0,0.45)', backdropFilter:'blur(12px)', transition:'border-color 0.2s' }}
                onFocus={e=>e.currentTarget.style.borderColor='rgba(124,106,247,0.6)'}
                onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'}>
                <div style={{ flex:1, position:'relative', minWidth:0 }}>
                  <input aria-label="Describe your video" placeholder="" style={{ width:'100%', background:'transparent', border:'none', outline:'none', color:'#fff', fontSize:15, padding:'8px 0', fontFamily:'inherit' }} onKeyDown={e=>e.key==='Enter'&&onGetStarted?.()} />
                  <div style={{ position:'absolute', top:'50%', left:0, transform:'translateY(-50%)', pointerEvents:'none', display:'flex', alignItems:'center' }}>
                    <span style={{ fontSize:15, color:'rgba(255,255,255,0.3)' }}>{typed}</span>
                    <span style={{ width:2, height:18, background:'rgba(124,106,247,0.8)', display:'inline-block', animation:'blink 1s ease infinite', marginLeft:1, borderRadius:1 }} />
                  </div>
                </div>
                <button onClick={() => onGetStarted?.()} className="ev-cta-btn" style={{ padding:'12px 24px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7c6af7,#6d28d9)', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(124,106,247,0.5)', fontFamily:'inherit' }}>Generate →</button>
              </div>
            </div>

            <p style={{ fontSize:12, color:'rgba(255,255,255,0.28)', animation:'fadeUp 0.6s ease 0.4s both', margin:'0 0 26px' }}>
              No credit card required to sign up · Powered by Nano Banana, Seedance & Gemini
            </p>

            <div style={{ display:'flex', alignItems:'center', gap:20, animation:'fadeUp 0.6s ease 0.5s both', flexWrap:'wrap', justifyContent:'inherit' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ display:'flex' }}>
                  {['#7c6af7','#06b6d4','#f59e0b','#e11d48','#10b981'].map((c,i) => (
                    <div key={i} style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #050508', background:`linear-gradient(135deg,${c},${c}88)`, marginLeft:i?-8:0, zIndex:5-i }} />
                  ))}
                </div>
                <span style={{ fontSize:13, color:'#6b7280' }}>Loved by <strong style={{ color:'#9ca3af' }}>10,000+</strong> creators</span>
              </div>
              <div style={{ display:'flex', gap:2 }}>
                {[1,2,3,4,5].map(i => <Star key={i} size={15} fill="#f59e0b" color="#f59e0b" />)}
              </div>
              <span style={{ fontSize:13, color:'#6b7280' }}>4.9/5 rating</span>
            </div>
          </div>

          <VideoWall onOpen={setLightbox} />
        </div>
      </section>

      {/* ── USE-CASE MARQUEE ───────────────────────────────────────────────── */}
      <section className="ev-reveal" aria-label="What you can make" style={{ padding:'0 0 90px' }}>
        <div className="ev-marquee">
          <div className="ev-marquee-track">
            {[0,1].flatMap(rep => [
              [Tv,'Product ads','#10b981'],[Film,'Cinematic scenes','#a855f7'],[Sparkles,'Comedy & viral clips','#f59e0b'],[Clapperboard,'Documentaries','#06b6d4'],
              [Drama,'Consistent characters','#e11d48'],[Wand2,'Trending templates','#ec4899'],[Scissors,'Smart montage','#60a5fa'],[Map,'Map explainers','#a78bfa'],[Mic,'Voiceovers in 8+ languages','#34d399'],
            ].map(([Icon,label,color],i) => (
              <span key={`${rep}-${i}`} className="ev-pill"><Icon size={16} color={color} strokeWidth={2} /> {label}</span>
            )))}
          </div>
        </div>
      </section>

      {/* ── REAL RESULTS ───────────────────────────────────────────────────── */}
      <section style={{ padding:'0 24px 110px', maxWidth:1200, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#a78bfa', textTransform:'uppercase', marginBottom:12 }}>Made with Erivion</div>
          <h2 style={{ fontSize:'clamp(30px,4.4vw,48px)', fontWeight:900, letterSpacing:'-1.8px', fontFamily:"'Bricolage Grotesque', sans-serif", color:'#fff', lineHeight:1.1 }}>
            Real videos, real results
          </h2>
          <p style={{ fontSize:15, color:'#6b7280', marginTop:12 }}>Ads, cinematic scenes and comedy — every clip below was made with Erivion. Tap one to hear it.</p>
        </div>
        <div className="ev-reveal"><ShowcaseStage onGetStarted={onGetStarted} /></div>
      </section>

      {/* ── STATS ──────────────────────────────────────────────────────────── */}
      <section style={{ padding:'0 24px 80px' }}>
        <div className="ev-reveal" style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderRadius:24, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', overflow:'hidden' }}>
          <StatCard value="10000+" label="Videos Generated" color="#7c6af7" />
          <StatCard value="8+" label="Languages Supported" color="#06b6d4" />
          <StatCard value="5" label="AI Engines" color="#f59e0b" />
          <StatCard value="50" label="Countries" color="#10b981" />
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 24px', maxWidth:1100, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ textAlign:'center', marginBottom:60 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#7c6af7', textTransform:'uppercase', marginBottom:16 }}>How It Works</div>
          <h2 style={{ fontSize:'clamp(32px,5vw,52px)', fontWeight:900, letterSpacing:'-2px', fontFamily:"'Bricolage Grotesque', sans-serif", lineHeight:1.1 }}>From idea to video<br />in three steps</h2>
        </div>
        <div className="ev-steps" style={{ display:'flex', gap:0, position:'relative' }}>
          <div style={{ position:'absolute', top:24, left:'16.6%', right:'16.6%', height:1, background:'linear-gradient(90deg, rgba(124,106,247,0.3), rgba(6,182,212,0.3), rgba(16,185,129,0.3))', zIndex:0 }} />
          {STEPS.map((s,i) => (
            <div key={i} className="ev-reveal" data-delay={i*120} style={{ flex:1, textAlign:'center', padding:'0 32px', position:'relative', zIndex:1 }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:24 }}>
                <div className="ev-step-num">{s.n}</div>
              </div>
              <h3 style={{ fontSize:18, fontWeight:800, marginBottom:10, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{s.title}</h3>
              <p style={{ fontSize:14, color:'#6b7280', lineHeight:1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHAT YOU CAN MAKE (bento) ───────────────────────────────────────── */}
      <section style={{ padding:'80px 24px', maxWidth:1200, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ textAlign:'center', marginBottom:56 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#7c6af7', textTransform:'uppercase', marginBottom:16 }}>One Agent, Every Kind of Video</div>
          <h2 style={{ fontSize:'clamp(32px,5vw,52px)', fontWeight:900, letterSpacing:'-2px', fontFamily:"'Bricolage Grotesque', sans-serif", lineHeight:1.1 }}>Just describe it.<br />The Agent builds it.</h2>
          <p style={{ fontSize:16, color:'#6b7280', maxWidth:540, margin:'16px auto 0' }}>No menus, no guesswork — the Agent picks the right AI engine for what you're making and tells you the price before it starts.</p>
        </div>

        <div className="ev-bento">
          <button type="button" className="ev-reveal ev-bento-card" data-delay={0} onClick={() => onGetStarted?.()} style={{ '--c':'#7c6af7', gridColumn:'span 7' }}>
            <div className="ev-bento-ic"><MessageSquare size={22} /></div>
            <h3>Chat. Review. Done.</h3>
            <p>Describe an idea, paste a script or upload a photo. The Agent plans every scene, generates the visuals and assembles the finished video — all inside one conversation.</p>
            <div className="ev-chat-mock">
              <div className="ev-bubble u">Make a 20-second ad for my coffee brand, vertical, with a friendly voiceover</div>
              <div className="ev-bubble a">Got it ☕ Seedance 2.5, 9:16, with narration — about 190 credits. Shall I start?</div>
            </div>
          </button>

          <button type="button" className="ev-reveal ev-bento-card" data-delay={80} onClick={() => onGetStarted?.()} style={{ '--c':'#06b6d4', gridColumn:'span 5' }}>
            <span className="ev-badge-free"><Gift size={12} /> First minute free</span>
            <div className="ev-bento-ic"><Clapperboard size={22} /></div>
            <h3>Documentary Studio</h3>
            <p>Turn a script or topic into a full documentary with real footage, narration, animated captions and motion graphics — horizontal or vertical, with a ready YouTube package.</p>
          </button>

          <button type="button" className="ev-reveal ev-bento-card" data-delay={0} onClick={() => onGetStarted?.()} style={{ '--c':'#e11d48', gridColumn:'span 4' }}>
            <div className="ev-bento-ic"><Drama size={22} /></div>
            <h3>Character Studio</h3>
            <p>Save a character once — or create one with AI — and use it in any video. Swap yourself into trending templates and keep the same moves and sound.</p>
            <div className="ev-faces" aria-hidden="true">{['#e11d48','#f59e0b','#7c6af7','#06b6d4'].map(c => <i key={c} style={{ background:`linear-gradient(135deg,${c},${c}77)` }} />)}</div>
          </button>

          <button type="button" className="ev-reveal ev-bento-card" data-delay={80} onClick={() => onGetStarted?.()} style={{ '--c':'#10b981', gridColumn:'span 4' }}>
            <div className="ev-bento-ic"><ShoppingBag size={22} /></div>
            <h3>Product & brand ads</h3>
            <p>One product photo in, a scroll-stopping ad out — voiceover, captions, transitions and a product link banner included.</p>
          </button>

          <button type="button" className="ev-reveal ev-bento-card" data-delay={160} onClick={() => onGetStarted?.()} style={{ '--c':'#60a5fa', gridColumn:'span 4' }}>
            <div className="ev-bento-ic"><Scissors size={22} /></div>
            <h3>Smart montage</h3>
            <p>Upload up to 20 clips and a voiceover — cuts that follow your voice, transitions, sound effects and captions, even in the style of a reference you give.</p>
          </button>

          <button type="button" className="ev-reveal ev-bento-card" data-delay={0} onClick={() => onNavigate?.('channels')} style={{ '--c':'#f59e0b', gridColumn:'span 6' }}>
            <div className="ev-bento-ic"><Zap size={22} /></div>
            <h3>Run a YouTube channel on autopilot</h3>
            <p>A trend-aware idea every day, a finished video, and a review email with title, description and thumbnail ready to upload — you stay in control of what goes public.</p>
          </button>

          <button type="button" className="ev-reveal ev-bento-card" data-delay={80} onClick={() => onNavigate?.('api-docs')} style={{ '--c':'#a855f7', gridColumn:'span 6' }}>
            <div className="ev-bento-ic"><Plug size={22} /></div>
            <h3>Works inside Claude & ChatGPT</h3>
            <p>Connect Erivion as an MCP connector and generate images, videos and character swaps from your own AI assistant — with your own credits.</p>
          </button>
        </div>
      </section>

      {/* ── FREE DOCUMENTARY TRIAL ─────────────────────────────────────────── */}
      <section style={{ padding:'20px 24px 90px', maxWidth:1200, margin:'0 auto' }}>
        <div className="ev-reveal ev-trial">
          <div>
            <span className="ev-badge-free"><Gift size={12} /> Try it free</span>
            <h2 style={{ fontSize:'clamp(28px,4vw,42px)', fontWeight:900, letterSpacing:'-1.5px', fontFamily:"'Bricolage Grotesque', sans-serif", lineHeight:1.1, margin:'0 0 14px' }}>Your first documentary minute is on us.</h2>
            <p style={{ fontSize:15, color:'#9ca3af', lineHeight:1.75, margin:'0 0 26px', maxWidth:460 }}>Record a one-minute voiceover, upload it to the Agent or the Documentary Studio, and Erivion builds the film around your voice — real footage, captions and motion graphics. The free minute carries a small watermark.</p>
            <button onClick={() => onGetStarted?.()} className="ev-cta-btn" style={{ padding:'14px 30px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#34d399,#059669)', color:'#052e1d', fontWeight:800, fontSize:15, cursor:'pointer', fontFamily:'inherit', boxShadow:'0 8px 28px rgba(52,211,153,0.35)' }}>Try the free minute →</button>
          </div>
          <div style={{ display:'grid', gap:12 }}>
            {[['Record','Speak for about a minute — your story, a lesson, a script.'],['Upload','Drop the audio into the Agent chat or the Documentary Studio.'],['Get your film','Footage, captions and music are added around your voice.']].map(([t,d],i) => (
              <div key={t} className="ev-trial-step"><b>{i+1}</b><div><div style={{ fontWeight:800, fontSize:15, marginBottom:2 }}>{t}</div><div style={{ fontSize:13, color:'#9ca3af', lineHeight:1.6 }}>{d}</div></div></div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES GRID ──────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 24px', maxWidth:1100, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ textAlign:'center', marginBottom:60 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#06b6d4', textTransform:'uppercase', marginBottom:16 }}>Everything Included</div>
          <h2 style={{ fontSize:'clamp(32px,5vw,52px)', fontWeight:900, letterSpacing:'-2px', fontFamily:"'Bricolage Grotesque', sans-serif" }}>Professional tools,<br />zero learning curve</h2>
        </div>
        <div className="ev-features-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {FEATURES.map((f,i) => (
            <div key={i} className="ev-reveal ev-feature-card" data-delay={i*80}
              style={{ padding:'28px 24px', borderRadius:18, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', transition:'all 0.3s ease' }}>
              <div style={{ marginBottom:16, color:'#a99bff' }}><f.icon size={28} strokeWidth={1.75} /></div>
              <h3 style={{ fontSize:16, fontWeight:800, marginBottom:10, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{f.title}</h3>
              <p style={{ fontSize:13, color:'#6b7280', lineHeight:1.7 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 24px', maxWidth:1100, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ textAlign:'center', marginBottom:60 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#f59e0b', textTransform:'uppercase', marginBottom:16 }}>Testimonials</div>
          <h2 style={{ fontSize:'clamp(32px,5vw,52px)', fontWeight:900, letterSpacing:'-2px', fontFamily:"'Bricolage Grotesque', sans-serif" }}>Creators love Erivion</h2>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {[
            { name:'Ahmed K.', role:'YouTube Creator · 120K subs', text:'I make 3 videos a week now instead of one. Erivion handles the heavy work while I focus on ideas. Genuinely changed my workflow.', color:'#7c6af7' },
            { name:'Sara M.', role:'Education Content Creator', text:'The Arabic voiceover quality is unmatched. My students love the videos and engagement went up 60% since I started using Erivion.', color:'#06b6d4' },
            { name:'Omar T.', role:'Digital Marketing Agency', text:'We use Erivion for client content now. The AI video quality looks genuinely cinematic. Clients are amazed we produce this in-house.', color:'#f59e0b' },
            { name:'Khalid A.', role:'Islamic History Channel · 45K subs', text:'Creating historical videos used to take me days. Now I produce a full episode in under an hour. The quality is incredible for the price.', color:'#10b981' },
            { name:'Nour H.', role:'Freelance Video Producer', text:'I offer AI video services to clients using Erivion. It\'s been a game changer for my business — clients get premium quality fast.', color:'#e11d48' },
            { name:'Ramy S.', role:'Motivational Content Creator', text:'The Arabic Egyptian voiceover sounds completely natural. My audience can\'t believe it\'s AI. Best investment I\'ve made for my channel.', color:'#a855f7' },
          ].map((t,i) => (
            <div key={i} className="ev-reveal" data-delay={i*100}
              style={{ padding:'28px 24px', borderRadius:18, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)' }}>
              <div style={{ display:'flex', gap:2, marginBottom:16 }}>
                {[1,2,3,4,5].map(s=><Star key={s} size={14} fill="#f59e0b" color="#f59e0b" />)}
              </div>
              <p style={{ fontSize:14, color:'#d1d5db', lineHeight:1.8, marginBottom:20, fontStyle:'italic' }}>"{t.text}"</p>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:'50%', background:`linear-gradient(135deg,${t.color},${t.color}66)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'#fff' }}>{t.name[0]}</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{t.name}</div>
                  <div style={{ fontSize:11, color:'#6b7280' }}>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>


      {/* ── BLOG / ARTICLES ─────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 24px', maxWidth:1100, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:48, flexWrap:'wrap', gap:16 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#a78bfa', textTransform:'uppercase', marginBottom:12 }}>Learn & Grow</div>
            <h2 style={{ fontSize:'clamp(28px,4vw,44px)', fontWeight:900, letterSpacing:'-1.5px', fontFamily:"'Bricolage Grotesque', sans-serif", color:'#fff', lineHeight:1.1 }}>Tips, guides &<br />creator stories</h2>
          </div>
          <button onClick={() => onNavigate?.('blog')} style={{ padding:'10px 22px', borderRadius:10, border:'1px solid rgba(124,106,247,0.3)', background:'rgba(124,106,247,0.08)', color:'#a78bfa', fontWeight:600, fontSize:13, cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s', whiteSpace:'nowrap' }}
            onMouseEnter={e=>{e.target.style.background='rgba(124,106,247,0.15)'}} onMouseLeave={e=>{e.target.style.background='rgba(124,106,247,0.08)'}}>
            View all articles →
          </button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
          {[
            { id:'make-money-youtube-ai-videos-2026', title:'How to Make Money on YouTube with AI Videos in 2026', tag:'Tutorial', read:'8 min', img:'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=600&q=80', color:'#f59e0b' },
            { id:'ai-video-creation-complete-beginners-guide', title:'AI Video Creation: The Complete Beginners Guide', tag:'Guide', read:'12 min', img:'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=600&q=80', color:'#a855f7' },
            { id:'faceless-youtube-channel-ideas-5k-per-month', title:'Faceless YouTube Channel Ideas That Make 5K Per Month', tag:'Strategy', read:'10 min', img:'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&q=80', color:'#06b6d4' },
            { id:'repurpose-youtube-videos-facebook-tiktok', title:'How to Repurpose YouTube Videos for Facebook and TikTok', tag:'Tips', read:'6 min', img:'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&q=80', color:'#e11d48' },
            { id:'best-ai-video-niches-low-competition-2026', title:'Best AI Video Niches with Low Competition in 2026', tag:'Research', read:'9 min', img:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&q=80', color:'#10b981' },
            { id:'grow-0-to-10k-subscribers-ai-videos', title:'How to Grow from 0 to 10K Subscribers Using AI Videos', tag:'Growth', read:'11 min', img:'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=600&q=80', color:'#7c6af7' },
            { id:'product-photo-to-video-ad-2026', title:'How to Turn One Product Photo Into a Complete Video Ad', tag:'Ads', read:'6 min', img:'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&q=80', color:'#f97316' },
            { id:'ai-agent-chat-video-creation-2026', title:"Erivion's AI Agent: Create a Video Just by Chatting", tag:'Feature', read:'5 min', img:'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=600&q=80', color:'#22c55e' },
            { id:'ai-video-ads-vs-traditional-production-cost-2026', title:'AI Video Ads vs. Traditional Production: The Real Cost Difference', tag:'Comparison', read:'7 min', img:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&q=80', color:'#06b6d4' },
          ].map((post,i) => (
            <div key={i} className="ev-reveal" data-delay={i*60}
              onClick={() => onOpenBlog?.(post.id)}
              style={{ borderRadius:18, overflow:'hidden', cursor:'pointer', border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', transition:'all 0.3s cubic-bezier(0.16,1,0.3,1)' }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-6px)'; e.currentTarget.style.borderColor='rgba(124,106,247,0.3)'; e.currentTarget.style.boxShadow='0 20px 48px rgba(0,0,0,0.4)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.06)'; e.currentTarget.style.boxShadow='none'; }}>
              <div style={{ height:180, position:'relative', overflow:'hidden' }}>
                <img src={post.img} alt={post.title} loading="lazy"
                  style={{ width:'100%', height:'100%', objectFit:'cover', filter:'brightness(0.7)' }} />
                <div style={{ position:'absolute', inset:0, background:`linear-gradient(to top, rgba(5,5,8,0.9) 0%, transparent 50%)` }} />
                <div style={{ position:'absolute', top:12, left:12, padding:'3px 10px', borderRadius:999, background:post.color, fontSize:9, fontWeight:700, color:'#fff', letterSpacing:'0.08em' }}>{post.tag.toUpperCase()}</div>
              </div>
              <div style={{ padding:'16px 18px 20px' }}>
                <h3 style={{ fontSize:14, fontWeight:700, color:'#e5e7eb', lineHeight:1.5, marginBottom:10, fontFamily:"'Bricolage Grotesque', sans-serif" }}>{post.title}</h3>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:20, height:20, borderRadius:'50%', background:`linear-gradient(135deg,${post.color},${post.color}88)`, fontSize:10, display:'flex', alignItems:'center', justifyContent:'center' }}>E</div>
                  <span style={{ fontSize:11, color:'#6b7280' }}>Erivion Blog</span>
                  <span style={{ fontSize:11, color:'#374151' }}>·</span>
                  <span style={{ fontSize:11, color:'#6b7280' }}>{post.read} read</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SEO KEYWORDS SECTION (hidden visually, for search engines) ─────── */}
      <section aria-label="Related topics" style={{ padding: '0 24px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 18, padding: '28px 32px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#374151', textTransform: 'uppercase', marginBottom: 16 }}>
            Also available on Erivion
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              'AI Video Generator', 'AI Video Maker', 'Text to Video AI', 'AI Video Creator',
              'Free AI Video Generator', 'AI Video Generator from Text', 'Arabic AI Video',
              'AI Voiceover Generator', 'Faceless YouTube Channel', 'AI Content Creator',
              'Seedance AI Video', 'Stability AI Images', 'YouTube Automation AI',
              'AI Script Generator', 'Video Generation AI', 'AI Video Editor Online',
              'AI Documentary Maker', 'Arabic Voiceover AI', 'AI YouTube Video Maker',
              'Automated Video Creation', 'AI Short Video Generator', 'Text to Speech Video',
              'AI Motivational Video', 'Historical Video AI', 'Educational Video AI',
              'AI Reels Generator', 'TikTok AI Video', 'AI Map Video Maker',
              'Cinematic AI Video', 'AI Character Video', 'No-Code Video AI',
            ].map(kw => (
              <span key={kw} style={{ padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 500, background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.12)', color: '#6b7280', cursor: 'default' }}>
                {kw}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA BANNER ─────────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 24px' }}>
        <div className="ev-reveal" style={{ maxWidth:900, margin:'0 auto', borderRadius:28, background:'linear-gradient(135deg, rgba(124,106,247,0.15) 0%, rgba(6,182,212,0.08) 100%)', border:'1px solid rgba(124,106,247,0.2)', padding:'64px 48px', textAlign:'center', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:'-50%', left:'50%', transform:'translateX(-50%)', width:600, height:400, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,106,247,0.12),transparent 70%)', pointerEvents:'none' }} />
          <h2 style={{ fontSize:'clamp(32px,5vw,56px)', fontWeight:900, letterSpacing:'-2px', marginBottom:16, fontFamily:"'Bricolage Grotesque', sans-serif", position:'relative' }}>
            Start creating today.<br />
            <span style={{ background:'linear-gradient(135deg,#7c6af7,#06b6d4)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>The Agent does the rest.</span>
          </h2>
          <p style={{ fontSize:17, color:'#9ca3af', marginBottom:40, position:'relative' }}>No credit card required to sign up. No design skills needed. Just an idea.</p>
          <div style={{ display:'flex', gap:16, justifyContent:'center', flexWrap:'wrap', position:'relative' }}>
            <button onClick={() => onGetStarted?.()} className="ev-cta-btn" style={{ padding:'16px 40px', borderRadius:14, border:'none', background:'linear-gradient(135deg,#7c6af7,#6d28d9)', color:'#fff', fontWeight:800, fontSize:16, cursor:'pointer', boxShadow:'0 8px 32px rgba(124,106,247,0.5)', fontFamily:'inherit' }}>
              Create Your First Video →
            </button>
            <button onClick={() => onNavigate?.('pricing')} style={{ padding:'16px 32px', borderRadius:14, border:'1px solid rgba(255,255,255,0.15)', background:'transparent', color:'rgba(255,255,255,0.8)', fontWeight:600, fontSize:16, cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s' }}
              onMouseEnter={e=>e.target.style.background='rgba(255,255,255,0.06)'}
              onMouseLeave={e=>e.target.style.background='transparent'}>
              View Pricing
            </button>
          </div>
        </div>
      </section>

      {lightbox && <VideoLightbox v={lightbox} onClose={() => setLightbox(null)} onGetStarted={onGetStarted} />}

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <AppFooter onNavigate={(p) => { if(p==='support'){setSubPage('support');return;} if(p==='terms'){setSubPage('terms');return;} if(p==='privacy'){setSubPage('privacy');return;} onNavigate?.(p); }} onGetStarted={onGetStarted} />
    </div>
  );
}