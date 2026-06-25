import React, { useState, useEffect, useRef } from 'react';
import SubPage from './SubPage.jsx';

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
            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
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
            <div style={{ display:'flex', gap:12, marginTop:20 }}>
              {['TikTok','YouTube','Instagram'].map(s=>(
                <div key={s} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', fontSize:11, color:'#6b7280', cursor:'pointer' }}>{s}</div>
              ))}
            </div>
          </div>
          {[
            { title:'Product', links:[{label:'Get Started',action:()=>onGetStarted?.()},{label:'Pricing',action:()=>onGetStarted?.()},{label:'Templates',action:()=>onNavigate?.('templates')}] },
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
          <span style={{ fontSize:12, color:'#374151' }}>Made with ❤️ for creators worldwide</span>
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
        {img ? <img src={img} alt={title} style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0, opacity:0.7 }} /> : null}
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

// ─── Real Video Card ──────────────────────────────────────────────────────────
function RealVideoCard({ src, label, tag, delay }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && videoRef.current) {
        videoRef.current.play().catch(()=>{});
        setPlaying(true);
      } else if (videoRef.current) {
        videoRef.current.pause();
        setPlaying(false);
      }
    }, { threshold: 0.4 });
    if (cardRef.current) io.observe(cardRef.current);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={cardRef} className="ev-reveal" data-delay={delay}
      style={{ borderRadius:20, overflow:'hidden', position:'relative', cursor:'pointer', background:'#0d0d14', border:'1px solid rgba(255,255,255,0.06)', aspectRatio:'9/16', maxHeight:480 }}
      onMouseEnter={() => { if(videoRef.current) videoRef.current.play(); }}
      onMouseLeave={() => { if(videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime=0; } }}>
      <video ref={videoRef} src={src} muted loop playsInline
        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
      {/* Overlay */}
      <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(5,5,8,0.8) 0%, transparent 50%)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', top:12, left:12, padding:'4px 10px', borderRadius:8, background:'rgba(124,106,247,0.85)', backdropFilter:'blur(8px)', fontSize:9, fontWeight:700, color:'#fff', letterSpacing:'0.1em' }}>{tag}</div>
      <div style={{ position:'absolute', bottom:16, left:16, right:16 }}>
        <p style={{ fontSize:13, fontWeight:600, color:'#fff', margin:0 }}>{label}</p>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#7c6af7', animation:'glow 2s ease infinite' }} />
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Made with Erivion</span>
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

  const VIDEO_SHOWCASE = [
    { title:'How Rome Changed the World', tag:'HISTORY', color:'#f59e0b', duration:'1:00', views:'124K', img:null },
    { title:'The Power of Daily Discipline', tag:'MOTIVATION', color:'#7c6af7', duration:'0:45', views:'89K', img:null },
    { title:'Secrets of the Deep Ocean', tag:'SCIENCE', color:'#06b6d4', duration:'1:30', views:'203K', img:null },
    { title:'Why Rich People Think Differently', tag:'BUSINESS', color:'#10b981', duration:'0:30', views:'67K', img:null },
    { title:'The Ottoman Empire Rise', tag:'HISTORY', color:'#a855f7', duration:'2:00', views:'341K', img:null },
    { title:'How AI is Changing Everything', tag:'TECH', color:'#e11d48', duration:'1:15', views:'156K', img:null },
    { title:'The Human Brain Explained', tag:'SCIENCE', color:'#06b6d4', duration:'0:45', views:'92K', img:null },
  ];

  const MODELS = [
    { key:'model2', tag:'MODEL 2', name:'Real Footage', icon:'🎬', desc:'HD stock footage matched to your script. Documentary-quality output instantly.', color:'#818cf8', tags:['Real HD clips','8+ languages','Captions & Music','Fast render'] },
    { key:'model3', tag:'MODEL 3', name:'AI Images', icon:'🖼️', desc:'Unique AI-generated image per scene with cinematic Ken Burns effects.', color:'#f59e0b', tags:['Stable Diffusion','6 visual styles','Ken Burns zoom','Premium quality'] },
    { key:'model4', tag:'MODEL 4', name:'Seedance Video', icon:'🎞️', desc:'Real AI-generated video clips. Not images — true cinematic motion.', color:'#a855f7', tags:['Seedance v1 Pro','Real AI video','Any idea or script','Captions & Music'] },
    { key:'model5', tag:'CINEMATIC', name:'Character AI', icon:'🎭', desc:'Upload your character photos. AI keeps them consistent across every scene.', color:'#e11d48', tags:['Photo reference','5 characters','Seedance 2.0','No voiceover'] },
    { key:'model6', tag:'ATLAS', name:'Map Videos', icon:'🗺️', desc:'Animated geographic maps — countries highlight and zoom with your story.', color:'#a78bfa', tags:['170+ countries','Auto zoom','Dynamic colors','Free to use'] },
  ];

  const FEATURES = [
    { icon:'🧠', title:'Idea to Video in Minutes', desc:'Type any topic and watch AI transform it into a fully produced video — script, visuals, voice, music, captions.' },
    { icon:'🎙️', title:'8+ Languages & Voices', desc:'Generate videos in English, Arabic (Egyptian/Gulf/Formal), French, German, Spanish, Russian, Japanese, and more.' },
    { icon:'🎬', title:'5 Powerful AI Models', desc:'Real footage, AI images, Seedance video, character consistency, and animated maps — all in one platform.' },
    { icon:'📱', title:'Any Format, Any Platform', desc:'9:16 for TikTok & Reels, 16:9 for YouTube, 1:1 for Instagram. Export-ready for every platform.' },
    { icon:'✂️', title:'Scene-by-Scene Control', desc:'Review and edit every scene before rendering. Full creative control with AI doing the heavy lifting.' },
    { icon:'⚡', title:'Production-Ready Output', desc:'Auto-synced captions, background music, sound effects, video transitions, and cinematic color grading.' },
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
          {[['home','Home'],['templates','Templates'],['pricing','Pricing'],['faq','FAQ'],['support','Support']].map(([k,l]) => (
            <button key={k} className="ev-nav-link" onClick={() => {
              if (k === 'support') { onNavigate?.(k); return; }
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
            Get Started Free
          </button>
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'120px 24px 80px', position:'relative', textAlign:'center' }}>
        {/* Background glows */}
        <div style={{ position:'absolute', top:'10%', left:'50%', transform:'translateX(-50%)', width:800, height:500, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,106,247,0.12) 0%, transparent 70%)', pointerEvents:'none', filter:'blur(40px)' }} />
        <div style={{ position:'absolute', top:'30%', left:'20%', width:400, height:400, borderRadius:'50%', background:'radial-gradient(circle, rgba(6,182,212,0.06) 0%, transparent 70%)', pointerEvents:'none', filter:'blur(60px)' }} />
        <div style={{ position:'absolute', top:'20%', right:'15%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(225,29,72,0.05) 0%, transparent 70%)', pointerEvents:'none', filter:'blur(50px)' }} />

        {/* Grid */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize:'64px 64px', maskImage:'radial-gradient(ellipse at 50% 50%, black 20%, transparent 80%)', pointerEvents:'none' }} />

        {/* Badge */}
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:999, border:'1px solid rgba(124,106,247,0.3)', background:'rgba(124,106,247,0.08)', marginBottom:28, animation:'fadeUp 0.6s ease both' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#7c6af7', animation:'glow 2s ease infinite' }} />
          <span style={{ fontSize:12, fontWeight:600, color:'#a78bfa', letterSpacing:'0.05em' }}>5 AI Video Models · New: Character Reference</span>
        </div>

        {/* Headline */}
        <h1 className="ev-hero-h1" style={{ fontSize:'clamp(48px,7vw,88px)', fontWeight:900, letterSpacing:'-3px', lineHeight:1.0, marginBottom:24, animation:'fadeUp 0.7s ease 0.1s both', fontFamily:"'Bricolage Grotesque', sans-serif", maxWidth:900 }}>
          Turn Any Idea Into a{' '}
          <span style={{ display:'inline-block', position:'relative' }}>
            <span style={{ background:'linear-gradient(135deg,#7c6af7 0%,#a78bfa 40%,#06b6d4 100%)', backgroundSize:'200%', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', animation:'gradMove 4s ease infinite' }}>
              Viral Video
            </span>
          </span>
        </h1>

        {/* Subhead */}
        <p style={{ fontSize:'clamp(16px,2.5vw,20px)', color:'#6b7280', maxWidth:600, lineHeight:1.7, marginBottom:48, animation:'fadeUp 0.7s ease 0.2s both', fontWeight:400 }}>
          AI writes the script, generates the visuals, adds voiceover in 8+ languages, and renders a production-ready video — in minutes.
        </p>

        {/* Prompt Input */}
        <div style={{ width:'100%', maxWidth:620, marginBottom:20, animation:'fadeUp 0.7s ease 0.3s both' }}>
          <div style={{ display:'flex', alignItems:'center', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:18, padding:'8px 8px 8px 20px', boxShadow:'0 8px 40px rgba(0,0,0,0.4)', backdropFilter:'blur(12px)', transition:'border-color 0.2s' }}
            onFocus={e=>e.currentTarget.style.borderColor='rgba(124,106,247,0.5)'}
            onBlur={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.1)'}>
            <div style={{ flex:1, position:'relative', minWidth:0 }}>
              <input placeholder="" style={{ width:'100%', background:'transparent', border:'none', outline:'none', color:'#fff', fontSize:15, padding:'8px 0', fontFamily:'inherit' }} onFocus={e=>e.currentTarget.parentElement.parentElement.style.borderColor='rgba(124,106,247,0.5)'} onBlur={e=>e.currentTarget.parentElement.parentElement.style.borderColor='rgba(255,255,255,0.1)'} onKeyDown={e=>e.key==='Enter'&&onGetStarted?.()} />
              <div style={{ position:'absolute', top:'50%', left:0, transform:'translateY(-50%)', pointerEvents:'none', display:'flex', alignItems:'center' }}>
                <span style={{ fontSize:15, color:'rgba(255,255,255,0.25)' }}>{typed}</span>
                <span style={{ width:2, height:18, background:'rgba(124,106,247,0.7)', display:'inline-block', animation:'blink 1s ease infinite', marginLeft:1, borderRadius:1 }} />
              </div>
            </div>
            <button onClick={() => onGetStarted?.()} style={{ padding:'12px 24px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#7c6af7,#6d28d9)', color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', whiteSpace:'nowrap', boxShadow:'0 4px 20px rgba(124,106,247,0.5)', fontFamily:'inherit', transition:'all 0.2s' }}
              onMouseEnter={e=>e.target.style.transform='scale(1.03)'} onMouseLeave={e=>e.target.style.transform='scale(1)'}>
              Generate →
            </button>
          </div>
        </div>

        <p style={{ fontSize:12, color:'rgba(255,255,255,0.2)', animation:'fadeUp 0.6s ease 0.4s both' }}>
          No credit card required · Free plan available · 5 AI models
        </p>

        {/* Social proof */}
        <div style={{ display:'flex', alignItems:'center', gap:24, marginTop:32, animation:'fadeUp 0.6s ease 0.5s both', flexWrap:'wrap', justifyContent:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex' }}>
              {['#7c6af7','#06b6d4','#f59e0b','#e11d48','#10b981'].map((c,i) => (
                <div key={i} style={{ width:28, height:28, borderRadius:'50%', border:'2px solid #050508', background:`linear-gradient(135deg,${c},${c}88)`, marginLeft:i?-8:0, zIndex:5-i }} />
              ))}
            </div>
            <span style={{ fontSize:13, color:'#6b7280' }}>Loved by <strong style={{ color:'#9ca3af' }}>10,000+</strong> creators</span>
          </div>
          <div style={{ display:'flex', gap:2 }}>
            {[1,2,3,4,5].map(i => <span key={i} style={{ color:'#f59e0b', fontSize:16 }}>★</span>)}
          </div>
          <span style={{ fontSize:13, color:'#6b7280' }}>4.9/5 rating</span>
        </div>
      </section>

      {/* ── REAL VIDEO SHOWCASE ──────────────────────────────────────────────── */}
      <section style={{ padding:'0 24px 100px', maxWidth:1200, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ textAlign:'center', marginBottom:48 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#a78bfa', textTransform:'uppercase', marginBottom:12 }}>Made with Erivion</div>
          <h2 style={{ fontSize:'clamp(28px,4vw,44px)', fontWeight:900, letterSpacing:'-1.5px', fontFamily:"'Bricolage Grotesque', sans-serif", color:'#fff' }}>
            Real videos, real results
          </h2>
          <p style={{ fontSize:15, color:'#6b7280', marginTop:12 }}>Every video below was created using Erivion — no editing skills required.</p>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
          {[
            { src:'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/templates/tpl_1780696103015.mp4', label:'Historical · Arabic', tag:'MODEL 2' },
            { src:'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/templates/tpl_1780699995271.mp4', label:'Educational · English', tag:'MODEL 2' },
            { src:'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/templates/tpl_1780956846973.mp4', label:'Motivational · Arabic', tag:'MODEL 2' },
          ].map((v,i) => (
            <RealVideoCard key={i} {...v} delay={i*100} />
          ))}
        </div>

        <div style={{ textAlign:'center', marginTop:36 }}>
          <button onClick={() => onGetStarted?.()} style={{ padding:'13px 32px', borderRadius:12, border:'1px solid rgba(124,106,247,0.3)', background:'rgba(124,106,247,0.08)', color:'#a78bfa', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s' }}
            onMouseEnter={e=>{e.target.style.background='rgba(124,106,247,0.15)';e.target.style.color='#fff'}}
            onMouseLeave={e=>{e.target.style.background='rgba(124,106,247,0.08)';e.target.style.color='#a78bfa'}}>
            Create your own video →
          </button>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────────────────────────────── */}
      <section style={{ padding:'0 24px 80px' }}>
        <div className="ev-reveal" style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4,1fr)', borderRadius:24, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)', overflow:'hidden' }}>
          <StatCard value="10000+" label="Videos Generated" color="#7c6af7" />
          <StatCard value="8+" label="Languages Supported" color="#06b6d4" />
          <StatCard value="5" label="AI Models" color="#f59e0b" />
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

      {/* ── AI MODELS SECTION ──────────────────────────────────────────────── */}
      <section style={{ padding:'80px 24px', maxWidth:1200, margin:'0 auto' }}>
        <div className="ev-reveal" style={{ textAlign:'center', marginBottom:60 }}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.15em', color:'#7c6af7', textTransform:'uppercase', marginBottom:16 }}>AI Models</div>
          <h2 style={{ fontSize:'clamp(32px,5vw,52px)', fontWeight:900, letterSpacing:'-2px', fontFamily:"'Bricolage Grotesque', sans-serif", lineHeight:1.1 }}>Five ways to create<br />your perfect video</h2>
          <p style={{ fontSize:16, color:'#6b7280', marginTop:16, maxWidth:500, margin:'16px auto 0' }}>Each model is purpose-built for a different creative style. Use one or combine them all.</p>
        </div>

        <div className="ev-models-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
          {MODELS.map((m,i) => (
            <div key={m.key} className="ev-reveal ev-model-card" data-delay={i*80}
              onClick={() => onGetStarted?.()}
              onMouseEnter={() => setHovModel(m.key)}
              onMouseLeave={() => setHovModel(null)}
              style={{ borderRadius:20, border:`1px solid ${hovModel===m.key?m.color+'44':'rgba(255,255,255,0.06)'}`, background: hovModel===m.key?`linear-gradient(160deg,${m.color}0d,rgba(5,5,8,0.95))`:'rgba(255,255,255,0.02)', padding:'28px 24px', position:'relative', overflow:'hidden', boxShadow:hovModel===m.key?`0 20px 48px ${m.color}18`:'none' }}>
              <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:`radial-gradient(circle,${m.color}18,transparent 70%)`, pointerEvents:'none' }} />
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:`linear-gradient(135deg,${m.color}cc,${m.color}66)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, boxShadow:`0 4px 16px ${m.color}40` }}>{m.icon}</div>
                <div>
                  <div style={{ fontSize:9, fontWeight:700, color:m.color, letterSpacing:'0.12em', opacity:0.8 }}>{m.tag}</div>
                  <div style={{ fontSize:17, fontWeight:800, color:'#fff', fontFamily:"'Bricolage Grotesque', sans-serif", letterSpacing:'-0.3px' }}>{m.name}</div>
                </div>
              </div>
              <p style={{ fontSize:13, color:'#6b7280', lineHeight:1.7, marginBottom:20 }}>{m.desc}</p>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {m.tags.map(t => (
                  <span key={t} style={{ padding:'3px 10px', borderRadius:999, fontSize:10, fontWeight:600, background:`${m.color}12`, border:`1px solid ${m.color}28`, color:m.color }}>{t}</span>
                ))}
              </div>
              <div style={{ marginTop:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ fontSize:12, fontWeight:700, color:m.color, opacity: hovModel===m.key?1:0, transition:'opacity 0.2s' }}>Try this model →</span>
                <div style={{ width:32, height:32, borderRadius:10, background:`${m.color}18`, border:`1px solid ${m.color}28`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>→</div>
              </div>
            </div>
          ))}

          {/* CTA Card */}
          <div className="ev-reveal ev-model-card" data-delay={400}
            onClick={() => onGetStarted?.()}
            style={{ borderRadius:20, border:'1px dashed rgba(124,106,247,0.3)', background:'rgba(124,106,247,0.04)', padding:'28px 24px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', gap:16 }}>
            <div style={{ width:56, height:56, borderRadius:16, border:'2px dashed rgba(124,106,247,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>+</div>
            <div>
              <h3 style={{ fontSize:16, fontWeight:800, color:'#fff', marginBottom:6, fontFamily:"'Bricolage Grotesque', sans-serif" }}>More coming soon</h3>
              <p style={{ fontSize:12, color:'#4b5563', lineHeight:1.6 }}>We're building new AI models and features every week. Stay tuned.</p>
            </div>
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
              <div style={{ fontSize:32, marginBottom:16 }}>{f.icon}</div>
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
            { name:'Omar T.', role:'Digital Marketing Agency', text:'We use Model 4 for client content. The AI video quality looks genuinely cinematic. Clients are amazed we produce this in-house.', color:'#f59e0b' },
            { name:'Khalid A.', role:'Islamic History Channel · 45K subs', text:'Creating historical videos used to take me days. Now I produce a full episode in under an hour. The quality is incredible for the price.', color:'#10b981' },
            { name:'Nour H.', role:'Freelance Video Producer', text:'I offer AI video services to clients using Erivion. It\'s been a game changer for my business — clients get premium quality fast.', color:'#e11d48' },
            { name:'Ramy S.', role:'Motivational Content Creator', text:'The Arabic Egyptian voiceover sounds completely natural. My audience can\'t believe it\'s AI. Best investment I\'ve made for my channel.', color:'#a855f7' },
          ].map((t,i) => (
            <div key={i} className="ev-reveal" data-delay={i*100}
              style={{ padding:'28px 24px', borderRadius:18, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)' }}>
              <div style={{ display:'flex', gap:2, marginBottom:16 }}>
                {[1,2,3,4,5].map(s=><span key={s} style={{ color:'#f59e0b', fontSize:14 }}>★</span>)}
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
            { id:'viral-historical', title:'How to Create Viral Historical Videos with AI in 2025', tag:'Tutorial', read:'5 min', img:'https://images.unsplash.com/photo-1461360370896-922624d12aa1?w=600&q=80', color:'#f59e0b' },
            { id:'arabic-voiceover', title:'The Complete Guide to Arabic AI Voiceover for YouTube', tag:'Guide', read:'7 min', img:'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=600&q=80', color:'#a855f7' },
            { id:'video-hooks', title:'10 Video Hooks That Get Millions of Views on TikTok', tag:'Strategy', read:'4 min', img:'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=600&q=80', color:'#06b6d4' },
            { id:'seedance-vs-stock', title:'Seedance vs Stock Footage: Which Makes Better Videos?', tag:'Comparison', read:'6 min', img:'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=600&q=80', color:'#e11d48' },
            { id:'make-money-ai', title:'How to Make $5,000/Month Selling AI Videos Online', tag:'Business', read:'8 min', img:'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=600&q=80', color:'#10b981' },
            { id:'content-strategy', title:'The Ultimate Content Strategy for YouTube Creators in 2025', tag:'Strategy', read:'9 min', img:'https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=600&q=80', color:'#7c6af7' },
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

      {/* ── CTA BANNER ─────────────────────────────────────────────────────── */}
      <section style={{ padding:'80px 24px' }}>
        <div className="ev-reveal" style={{ maxWidth:900, margin:'0 auto', borderRadius:28, background:'linear-gradient(135deg, rgba(124,106,247,0.15) 0%, rgba(6,182,212,0.08) 100%)', border:'1px solid rgba(124,106,247,0.2)', padding:'64px 48px', textAlign:'center', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:'-50%', left:'50%', transform:'translateX(-50%)', width:600, height:400, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(124,106,247,0.12),transparent 70%)', pointerEvents:'none' }} />
          <h2 style={{ fontSize:'clamp(32px,5vw,56px)', fontWeight:900, letterSpacing:'-2px', marginBottom:16, fontFamily:"'Bricolage Grotesque', sans-serif", position:'relative' }}>
            Start creating today.<br />
            <span style={{ background:'linear-gradient(135deg,#7c6af7,#06b6d4)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Your first video is free.</span>
          </h2>
          <p style={{ fontSize:17, color:'#9ca3af', marginBottom:40, position:'relative' }}>No credit card required. No design skills needed. Just an idea.</p>
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

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <AppFooter onNavigate={(p) => { if(p==='support'){setSubPage('support');return;} if(p==='terms'){setSubPage('terms');return;} if(p==='privacy'){setSubPage('privacy');return;} onNavigate?.(p); }} onGetStarted={onGetStarted} />
    </div>
  );
}