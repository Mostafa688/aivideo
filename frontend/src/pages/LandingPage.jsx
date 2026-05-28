import React, { useState, useEffect, useRef } from 'react';
import SubPage from './SubPage.jsx';

// ─── Sub-pages ────────────────────────────────────────────────────────────────

// Terms and Privacy now use SubPage component

function AboutPage({ onBack }) {
  return (
    <StaticPage title="About Erivion" onBack={onBack}>
      <Section title="Our Mission">
        Erivion was built with one goal: to make professional video creation accessible to everyone. Whether you're a content creator, educator, marketer, or storyteller — we believe great videos shouldn't require expensive software or years of editing experience.
      </Section>
      <Section title="What We Do">
        Erivion is an AI-powered video generation platform. You provide an idea or a script, and our platform handles everything else — generating scenes, matching them with relevant footage, adding voiceovers in multiple languages, and rendering a polished final video complete with captions, music, and visual effects.
      </Section>
      <Section title="Our Technology">
        We use state-of-the-art language models for script generation, neural text-to-speech for natural voiceovers, and a professional-grade rendering pipeline built on FFmpeg. Our platform supports 8+ languages and multiple video formats.
      </Section>
      <Section title="Content Standards">
        We are committed to responsible AI use. Erivion strictly prohibits the generation of harmful, explicit, or misleading content. Our platform includes both automated and manual review mechanisms to uphold these standards.
      </Section>
      <Section title="Contact Us">
        Have questions, feedback, or partnership inquiries? Reach us at digidelight33@gmail.com. We read every message.
      </Section>
    </StaticPage>
  );
}

function SupportPage({ onBack }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle');

  const handleSend = async () => {
    if (!email || !message) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/auth/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      });
      if (res.ok) setStatus('sent');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  return (
    <StaticPage title="Support" onBack={onBack}>
      <p style={{ color: 'var(--text2)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
        Having trouble or have a question? Fill out the form below and we'll get back to you as soon as possible. You can also reach us directly at <a href="mailto:digidelight33@gmail.com" style={{ color: 'var(--accent2)' }}>digidelight33@gmail.com</a>.
      </p>

      {status === 'sent' ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Message Sent!</h3>
          <p style={{ color: 'var(--text3)' }}>We'll get back to you within 24 hours.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
          <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
            style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
          <input type="email" placeholder="Your email address *" value={email} onChange={e => setEmail(e.target.value)}
            style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
          <textarea placeholder="Describe your issue or question in detail *" value={message} onChange={e => setMessage(e.target.value)} rows={6}
            style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          {status === 'error' && <p style={{ color: 'var(--red)', fontSize: 13 }}>Something went wrong. Please email us directly at digidelight33@gmail.com</p>}
          <button onClick={handleSend} disabled={!email || !message || status === 'loading'}
            style={{ padding: '13px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: (!email || !message) ? 'not-allowed' : 'pointer', opacity: (!email || !message) ? 0.6 : 1, alignSelf: 'flex-start' }}>
            {status === 'loading' ? '⏳ Sending...' : 'Send Message →'}
          </button>
        </div>
      )}
    </StaticPage>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StaticPage({ title, children, onBack }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, marginBottom: 40, padding: 0 }}>
          ← Back to Erivion
        </button>
        <h1 style={{ fontSize: 34, fontWeight: 800, marginBottom: 40, letterSpacing: '-0.5px', color: 'var(--text)' }}>{title}</h1>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>{children}</div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent2)', marginBottom: 8 }}>{title}</h3>
      <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.8 }}>{children}</p>
    </div>
  );
}

// ─── Main Landing Page ────────────────────────────────────────────────────────


const LOGO = '/logo.png';

// ✅ Exported footer — used in all pages
export function AppFooter({ onNavigate, onGetStarted }) {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: '40px 32px 32px', background: 'var(--bg)', marginTop: 'auto' }}>
      <style>{`
        .footer-link { color:var(--text3); font-size:13px; cursor:pointer; transition:color 0.15s; }
        .footer-link:hover { color:var(--text2); }
      `}</style>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 32, marginBottom: 36 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <img src={LOGO} alt="Erivion" style={{ width: 30, height: 30, objectFit: 'contain' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Erivion</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', maxWidth: 220, lineHeight: 1.6 }}>AI-powered video creation platform for creators, educators, and marketers.</p>
          </div>
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', marginBottom: 12 }}>PRODUCT</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="footer-link" onClick={() => onGetStarted?.()}>Get Started</span>
                <span className="footer-link" onClick={() => onGetStarted?.()}>Pricing</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', marginBottom: 12 }}>COMPANY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="footer-link" onClick={() => onNavigate?.('about')}>About Us</span>
                <span className="footer-link" onClick={() => onNavigate?.('support')}>Support</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', letterSpacing: '0.08em', marginBottom: 12 }}>LEGAL</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="footer-link" onClick={() => onNavigate?.('terms')}>Terms of Service</span>
                <span className="footer-link" onClick={() => onNavigate?.('privacy')}>Privacy Policy</span>
              </div>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>© 2026 Erivion. All rights reserved.</span>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>Content policy: No violence, explicit material, or harmful content permitted.</span>
        </div>
      </div>
    </footer>
  );
}

// ── Hero Prompt Box ──────────────────────────────────────────────────────────
const EXAMPLE_PROMPTS = [
  'The rise and fall of the Ottoman Empire...',
  'Why the human brain is more powerful than AI...',
  'How Elon Musk built 3 billion-dollar companies...',
  'The secrets of the deep ocean never explored...',
  'How ancient Rome changed the modern world...',
];

function HeroPromptBox({ onGetStarted }) {
  const [prompt, setPrompt] = useState('');
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [typing, setTyping] = useState(true);
  const [focused, setFocused] = useState(false);

  // Typewriter effect for placeholder
  React.useEffect(() => {
    const target = EXAMPLE_PROMPTS[placeholderIdx];
    let i = 0;
    setTyped('');
    setTyping(true);
    const interval = setInterval(() => {
      if (i < target.length) { setTyped(target.slice(0, ++i)); }
      else {
        clearInterval(interval);
        setTyping(false);
        setTimeout(() => setPlaceholderIdx(p => (p + 1) % EXAMPLE_PROMPTS.length), 2000);
      }
    }, 45);
    return () => clearInterval(interval);
  }, [placeholderIdx]);

  const handleTryNow = () => {
    onGetStarted?.();
  };

  return (
    <div style={{ marginTop: 40, maxWidth: 640, margin: '40px auto 0', animation: 'fadeUp 0.7s ease 0.45s both' }}>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid ${focused ? 'rgba(124,106,247,0.5)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 18,
        padding: '6px 6px 6px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: focused ? '0 0 0 4px rgba(124,106,247,0.12), 0 20px 40px rgba(0,0,0,0.3)' : '0 8px 32px rgba(0,0,0,0.3)',
        transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => e.key === 'Enter' && handleTryNow()}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 15, fontFamily: 'var(--lb)', padding: '10px 0',
            }}
          />
          {!prompt && (
            <div style={{ position: 'absolute', top: '50%', left: 0, transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{ fontSize: 15, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--lb)' }}>{typed}</span>
              {typing && <span style={{ width: 2, height: 18, background: 'rgba(124,106,247,0.6)', display: 'inline-block', animation: 'blink 1s ease infinite', marginLeft: 1, borderRadius: 1 }} />}
            </div>
          )}
        </div>
        <button onClick={handleTryNow}
          style={{
            padding: '12px 22px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #7c6af7, #6d28d9)',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            fontFamily: 'var(--lb)', whiteSpace: 'nowrap', flexShrink: 0,
            boxShadow: '0 4px 16px rgba(124,106,247,0.4)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => e.target.style.transform='scale(1.03)'}
          onMouseLeave={e => e.target.style.transform='scale(1)'}>
          Try Now →
        </button>
      </div>
      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 12, fontFamily: 'var(--lb)', textAlign: 'center' }}>
        Press Enter or click Try Now · No account required to preview
      </p>
    </div>
  );
}

export default function LandingPage({ onGetStarted, onOpenBlog }) {
  const [subPage, setSubPage] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Handle URL hash for direct links
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (['terms', 'privacy', 'about', 'support'].includes(hash)) setSubPage(hash);
  }, []);

  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll('.reveal, .reveal-left');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add('visible'), (e.target.dataset.delay || 0) * 1);
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [subPage]);

  if (subPage === 'terms')   return <SubPage page="terms"   onBack={() => setSubPage(null)} />;
  if (subPage === 'privacy') return <SubPage page="privacy" onBack={() => setSubPage(null)} />;
  if (subPage === 'about')   return <AboutPage   onBack={() => setSubPage(null)} />;
  if (subPage === 'support') return <SupportPage onBack={() => setSubPage(null)} />;

  const features = [
    { icon: '⚡', title: 'Idea to Video', desc: 'Type any idea and get a full script, scenes, and narration generated automatically.' },
    { icon: '📝', title: 'Script to Video', desc: 'Have a script ready? Paste it in and we handle the rest — footage, voiceover, edits.' },
    { icon: '🎙️', title: '8+ Languages', desc: 'Generate videos in English, Arabic, French, German, Spanish, Japanese, and more.' },
    { icon: '🎬', title: 'Pro Effects', desc: 'Captions, transitions, background music, sound effects, and cinematic video filters.' },
    { icon: '📐', title: 'Any Format', desc: 'Landscape 16:9, vertical 9:16 for Reels/TikTok, or square 1:1 — your choice.' },
    { icon: '🔒', title: 'Safe & Moderated', desc: 'Strict content policies. No violence, explicit material, or harmful content allowed.' },
  ];

  const steps = [
    { n: '01', title: 'Enter your idea', desc: 'Type a topic or paste your script. Choose tone, duration, and language.' },
    { n: '02', title: 'Review scenes', desc: 'AI generates scene-by-scene content. Edit any scene before rendering.' },
    { n: '03', title: 'Render & download', desc: 'One click renders your full HD video with voiceover, music, and captions.' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Clash+Display:wght@500;600;700&family=Cabinet+Grotesk:wght@400;500;700;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin:0; padding:0; }
        :root {
          --ld: 'Syne', sans-serif;
          --lb: 'Plus Jakarta Sans', sans-serif;
          --c1: #7c6af7;
          --c2: #a78bfa;
          --c3: #06b6d4;
        }

        /* ── Keyframes ── */
        @keyframes fadeUp   { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes float    { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-14px) rotate(1.5deg)} }
        @keyframes gradShift{ 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes shimmer  { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes orbit    { from{transform:rotate(0deg) translateX(180px) rotate(0deg)} to{transform:rotate(360deg) translateX(180px) rotate(-360deg)} }
        @keyframes orbit2   { from{transform:rotate(180deg) translateX(120px) rotate(-180deg)} to{transform:rotate(540deg) translateX(120px) rotate(-540deg)} }
        @keyframes glow     { 0%,100%{opacity:0.4;transform:scale(1)} 50%{opacity:0.8;transform:scale(1.05)} }
        @keyframes countUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn  { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes ripple   { 0%{transform:scale(0);opacity:1} 100%{transform:scale(4);opacity:0} }
        @keyframes typewriter { from{width:0} to{width:100%} }
        @keyframes cursor   { 0%,100%{border-color:var(--c1)} 50%{border-color:transparent} }
        @keyframes noise    { 0%,100%{transform:translate(0,0)} 10%{transform:translate(-1%,-1%)} 20%{transform:translate(1%,1%)} 30%{transform:translate(-1%,1%)} 40%{transform:translate(1%,-1%)} }
        @keyframes spinSlow { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        /* ── Nav ── */
        .lnav { transition: all 0.4s cubic-bezier(0.16,1,0.3,1); }
        .lnav.scrolled { background:rgba(8,8,14,0.85) !important; backdrop-filter:blur(24px) !important; border-bottom:1px solid rgba(255,255,255,0.06) !important; }
        .nav-link { color:rgba(255,255,255,0.5); font-size:14px; font-weight:500; transition:all 0.2s; cursor:pointer; font-family:var(--lb); position:relative; padding-bottom:2px; }
        .nav-link::after { content:''; position:absolute; bottom:0; left:0; width:0; height:1px; background:var(--c1); transition:width 0.3s; }
        .nav-link:hover { color:#fff; }
        .nav-link:hover::after { width:100%; }

        /* ── Hero ── */
        .hero-badge { animation: fadeUp 0.6s ease 0.1s both; }
        .hero-h1    { animation: fadeUp 0.7s ease 0.2s both; }
        .hero-p     { animation: fadeUp 0.7s ease 0.3s both; }
        .hero-btns  { animation: fadeUp 0.7s ease 0.4s both; }
        .hero-note  { animation: fadeUp 0.6s ease 0.5s both; }
        .hero-mock  { animation: fadeUp 0.8s ease 0.5s both; }

        /* ── Gradient text ── */
        .grad-text {
          background: linear-gradient(135deg, #fff 0%, var(--c1) 40%, var(--c2) 70%, var(--c3) 100%);
          background-size: 300% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: gradShift 5s ease infinite;
        }

        /* ── Shimmer text ── */
        .shimmer-text {
          background: linear-gradient(90deg, rgba(255,255,255,0.5) 0%, #fff 40%, rgba(255,255,255,0.5) 80%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 3s linear infinite;
        }

        /* ── Cards ── */
        .feature-card {
          transition: all 0.4s cubic-bezier(0.16,1,0.3,1);
          position: relative;
          overflow: hidden;
        }
        .feature-card::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: linear-gradient(135deg, rgba(124,106,247,0.08), transparent);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .feature-card:hover { transform: translateY(-6px) !important; box-shadow: 0 20px 48px rgba(124,106,247,0.15), 0 0 0 1px rgba(124,106,247,0.2) !important; }
        .feature-card:hover::before { opacity: 1; }

        /* ── Buttons ── */
        .cta-primary {
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1) !important;
          background: linear-gradient(135deg, #7c6af7, #a08ff8) !important;
          box-shadow: 0 4px 24px rgba(124,106,247,0.4), inset 0 1px 0 rgba(255,255,255,0.15);
        }
        .cta-primary::after {
          content: '';
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          background: linear-gradient(135deg, #7c6af7, #c084fc, #06b6d4);
          z-index: -1;
          opacity: 0;
          transition: opacity 0.3s;
          filter: blur(8px);
        }
        .cta-primary:hover { transform: translateY(-3px) scale(1.02) !important; box-shadow: 0 8px 40px rgba(124,106,247,0.6), inset 0 1px 0 rgba(255,255,255,0.2) !important; }
        .cta-primary:hover::after { opacity: 1; }

        .cta-secondary {
          transition: all 0.3s !important;
          position: relative;
          overflow: hidden;
        }
        .cta-secondary:hover { background: rgba(255,255,255,0.08) !important; border-color: rgba(255,255,255,0.3) !important; transform: translateY(-2px) !important; }

        /* ── Steps ── */
        .step-item { transition: all 0.3s; }
        .step-item:hover .step-num { box-shadow: 0 0 0 6px rgba(124,106,247,0.15), 0 0 24px rgba(124,106,247,0.3) !important; }

        /* ── Scroll reveal ── */
        .reveal { opacity: 0; transform: translateY(28px); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1); }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        .reveal-left { opacity: 0; transform: translateX(-28px); transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1); }
        .reveal-left.visible { opacity: 1; transform: translateX(0); }

        /* ── Grid noise overlay ── */
        .grid-overlay {
          background-image:
            linear-gradient(rgba(124,106,247,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(124,106,247,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        /* ── Footer ── */
        .footer-link { color:rgba(255,255,255,0.35); text-decoration:none; font-size:13px; transition:color 0.2s; cursor:pointer; font-family:var(--lb); }
        .footer-link:hover { color:rgba(255,255,255,0.8); }

        /* ── Stats ── */
        .stat-item { animation: countUp 0.6s ease both; }

        /* ── Responsive ── */
        @media (max-width: 768px) {
          .landing-nav-links { display: none !important; }
          .mobile-cta { display: block !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .footer-cols { flex-direction: column !important; gap: 24px !important; }
          .footer-links-group { display: flex !important; flex-wrap: wrap !important; gap: 16px !important; }
          .footer-link-col { min-width: 120px !important; }
          .stats-grid { grid-template-columns: repeat(2,1fr) !important; }
          .hero-mock-inner { width: 300px !important; height: 175px !important; }
        }
      `}</style>

      {/* ── Navbar ── */}
      <nav className={`lnav${scrolled ? ' scrolled' : ''}`} style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 40px', height: 64,
        background: 'transparent',
        animation: 'fadeIn 0.6s ease both',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #7c6af7, #a08ff8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 16px rgba(124,106,247,0.4)' }}>
            <img src={LOGO} alt="Erivion" style={{ width: 22, height: 22, objectFit: 'contain' }} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#fff', fontFamily: 'var(--ld)', letterSpacing: '-0.3px' }}>Erivion</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#7c6af7', background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.08em', fontFamily: 'var(--lb)' }}>BETA</span>
        </div>
        <div className="landing-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <span className="nav-link" onClick={() => setSubPage('about')}>About</span>
          <span className="nav-link" onClick={() => setSubPage('support')}>Support</span>
          <span className="nav-link" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({behavior:'smooth'})}>How it works</span>
          <button onClick={onGetStarted} className="cta-primary" style={{ padding: '9px 22px', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--lb)', letterSpacing: '0.02em' }}>
            Get Started →
          </button>
        </div>
        <button onClick={onGetStarted} className="mobile-cta cta-primary" style={{ padding: '8px 16px', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'none' }}>
          Start Free
        </button>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'clamp(100px,14vw,140px) clamp(16px,4vw,32px) 80px', position: 'relative', textAlign: 'center', overflow: 'hidden' }}>

        {/* Grid overlay */}
        <div className="grid-overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />

        {/* Orb 1 */}
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,106,247,0.18) 0%, transparent 60%)', pointerEvents: 'none', animation: 'float 10s ease-in-out infinite', filter: 'blur(40px)' }} />
        {/* Orb 2 */}
        <div style={{ position: 'absolute', bottom: '-5%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 60%)', pointerEvents: 'none', animation: 'float 13s ease-in-out infinite reverse', filter: 'blur(30px)' }} />
        {/* Orb 3 */}
        <div style={{ position: 'absolute', top: '40%', right: '10%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,132,252,0.1) 0%, transparent 60%)', pointerEvents: 'none', animation: 'float 8s ease-in-out infinite 2s', filter: 'blur(20px)' }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 820 }}>

          {/* Badge */}
          <div className="hero-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 18px', borderRadius: 999, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)', marginBottom: 32, backdropFilter: 'blur(8px)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 8px #22c55e', animation: 'glow 2s ease infinite' }} />
            <span style={{ fontSize: 12, color: 'rgba(167,139,250,1)', fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'var(--lb)' }}>AI-POWERED VIDEO GENERATION</span>
          </div>

          {/* H1 */}
          <h1 className="hero-h1" style={{ fontSize: 'clamp(44px, 7.5vw, 84px)', fontWeight: 800, lineHeight: 1.05, marginBottom: 28, letterSpacing: '-3px', fontFamily: 'var(--ld)', color: '#fff' }}>
            Turn any idea into<br />
            <span className="grad-text">stunning videos</span>
          </h1>

          {/* Sub */}
          <p className="hero-p" style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: 'rgba(255,255,255,0.55)', lineHeight: 1.75, marginBottom: 48, maxWidth: 580, margin: '0 auto 48px', fontFamily: 'var(--lb)', fontWeight: 400 }}>
            Professional HD videos from your ideas — AI voiceovers, footage, captions, and music. In minutes, not hours.
          </p>

          {/* Buttons */}
          <div className="hero-btns" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} className="cta-primary"
              style={{ padding: '16px 40px', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: 17, cursor: 'pointer', fontFamily: 'var(--lb)', letterSpacing: '-0.2px' }}>
              Start for Free →
            </button>
            <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="cta-secondary"
              style={{ padding: '16px 32px', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, fontWeight: 600, fontSize: 16, cursor: 'pointer', fontFamily: 'var(--lb)' }}>
              See how it works ↓
            </button>
          </div>

          {/* ── Prompt Box ── */}
          <HeroPromptBox onGetStarted={onGetStarted} />

          <p className="hero-note" style={{ marginTop: 22, fontSize: 12, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--lb)', letterSpacing: '0.02em' }}>
            Free to start · No credit card required · 3 videos/week on free plan
          </p>
        </div>

        {/* ── Mock UI ── */}
        <div className="hero-mock" style={{ marginTop: 72, position: 'relative', zIndex: 1 }}>
          {/* Glow behind mock */}
          <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(ellipse, rgba(124,106,247,0.2) 0%, transparent 70%)', pointerEvents: 'none', filter: 'blur(20px)' }} />

          <div className="hero-mock-inner" style={{ width: 560, height: 320, borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden', position: 'relative', boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,106,247,0.1)', animation: 'float 8s ease-in-out infinite', backdropFilter: 'blur(20px)' }}>

            {/* Window bar */}
            <div style={{ height: 36, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 6 }}>
              {['#ff5f57','#ffbd2e','#28c840'].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />)}
              <div style={{ flex: 1, margin: '0 12px', height: 18, background: 'rgba(255,255,255,0.06)', borderRadius: 4, display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--lb)' }}>erivion.net/create</span>
              </div>
            </div>

            {/* Content area */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Input area */}
              <div style={{ background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--lb)', flex: 1 }}>The history of ancient Egypt...</span>
                <div style={{ padding: '6px 14px', background: 'linear-gradient(135deg,#7c6af7,#a08ff8)', borderRadius: 6, fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: 'var(--lb)', flexShrink: 0 }}>Generate ✨</div>
              </div>

              {/* Scene cards */}
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { c: 'rgba(124,106,247,0.15)', b: 'rgba(124,106,247,0.3)', label: 'Scene 1', active: true },
                  { c: 'rgba(6,182,212,0.1)', b: 'rgba(6,182,212,0.2)', label: 'Scene 2', active: false },
                  { c: 'rgba(255,255,255,0.04)', b: 'rgba(255,255,255,0.08)', label: 'Scene 3', active: false },
                ].map((s, i) => (
                  <div key={i} style={{ flex: 1, height: 72, borderRadius: 8, background: s.c, border: `1px solid ${s.b}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <div style={{ width: 28, height: 20, borderRadius: 4, background: s.active ? 'linear-gradient(135deg,#7c6af7,#a08ff8)' : 'rgba(255,255,255,0.1)' }} />
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--lb)' }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '72%', background: 'linear-gradient(90deg,#7c6af7,#06b6d4)', borderRadius: 2, animation: 'shimmer 2s linear infinite', backgroundSize: '200% auto' }} />
                </div>
                <span style={{ fontSize: 10, color: '#7c6af7', fontWeight: 700, fontFamily: 'var(--lb)', flexShrink: 0 }}>72%</span>
              </div>
            </div>
          </div>

          {/* Floating badges */}
          <div style={{ position: 'absolute', top: -16, right: -20, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '8px 14px', backdropFilter: 'blur(12px)', animation: 'float 6s ease-in-out infinite 1s' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', fontFamily: 'var(--lb)' }}>✅ Video Ready!</span>
          </div>
          <div style={{ position: 'absolute', bottom: -14, left: -16, background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 10, padding: '8px 14px', backdropFilter: 'blur(12px)', animation: 'float 7s ease-in-out infinite 2s' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a78bfa', fontFamily: 'var(--lb)' }}>⚡ 2 min render</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="stats-grid" style={{ marginTop: 72, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, position: 'relative', zIndex: 1, width: '100%', maxWidth: 700, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
          {[
            { val: '10K+', label: 'Videos Created' },
            { val: '8+', label: 'Languages' },
            { val: '2 min', label: 'Avg. Render Time' },
            { val: '4', label: 'AI Models' },
          ].map((s, i) => (
            <div key={i} className="stat-item" data-delay={i * 80} style={{ padding: '20px 16px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: 'var(--ld)', letterSpacing: '-1px', marginBottom: 4 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--lb)', fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ padding: '100px 24px', maxWidth: 1140, margin: '0 auto' }}>
        <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{ display: 'inline-block', padding: '5px 16px', borderRadius: 999, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.2)', fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.08em', fontFamily: 'var(--lb)', marginBottom: 20 }}>FEATURES</div>
          <h2 style={{ fontSize: 'clamp(30px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-1.5px', marginBottom: 16, fontFamily: 'var(--ld)', color: '#fff', lineHeight: 1.1 }}>
            Everything you need<br />to create
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--lb)', maxWidth: 440, margin: '0 auto' }}>Professional video tools powered by AI, built for creators of all levels.</p>
        </div>
        <div className="features-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {features.map((f, i) => (
            <div key={i} className="feature-card reveal" data-delay={i * 60}
              style={{ padding: '32px 28px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>{f.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: '#fff', fontFamily: 'var(--ld)', letterSpacing: '-0.3px' }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.75, fontFamily: 'var(--lb)', fontWeight: 400 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" style={{ padding: '100px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent, rgba(124,106,247,0.04) 50%, transparent)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ display: 'inline-block', padding: '5px 16px', borderRadius: 999, background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)', fontSize: 11, fontWeight: 700, color: '#67e8f9', letterSpacing: '0.08em', fontFamily: 'var(--lb)', marginBottom: 20 }}>HOW IT WORKS</div>
            <h2 style={{ fontSize: 'clamp(30px, 4vw, 48px)', fontWeight: 800, letterSpacing: '-1.5px', fontFamily: 'var(--ld)', color: '#fff', lineHeight: 1.1 }}>
              Three steps to your<br />perfect video
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {steps.map((s, i) => (
              <div key={i} className="step-item reveal-left" data-delay={i * 120}
                style={{ display: 'flex', gap: 28, alignItems: 'flex-start', textAlign: 'left', position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div className="step-num" style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, rgba(124,106,247,0.2), rgba(6,182,212,0.1))', border: '1px solid rgba(124,106,247,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#a78bfa', fontFamily: 'var(--ld)', transition: 'box-shadow 0.3s' }}>{s.n}</div>
                  {i < steps.length - 1 && <div style={{ width: 2, height: 52, background: 'linear-gradient(180deg,rgba(124,106,247,0.4),rgba(124,106,247,0.05))', margin: '6px 0' }} />}
                </div>
                <div style={{ paddingBottom: i < steps.length - 1 ? 44 : 0, paddingTop: 12 }}>
                  <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: '#fff', fontFamily: 'var(--ld)', letterSpacing: '-0.5px' }}>{s.title}</h3>
                  <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8, fontFamily: 'var(--lb)', fontWeight: 400 }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Learn & Grow ── */}
      <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, letterSpacing: '-1px', marginBottom: 12, fontFamily: 'var(--landing-display)', color: 'var(--text)' }}>
            Learn &amp; Grow
          </h2>
          <p style={{ fontSize: 16, color: 'var(--text3)', fontFamily: 'var(--landing-body)' }}>Tips on AI video creation, YouTube growth, and monetization</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { id: 'make-money-youtube-ai-videos-2025', icon: '🎬', title: 'How to Make Money on YouTube with AI Videos in 2025', summary: 'Step-by-step guide to creating faceless AI-generated YouTube channels that generate passive income.', tags: ['#youtube monetization', '#ai video', '#faceless channel'], readTime: '8 min read' },
            { id: 'ai-video-creation-complete-beginners-guide', icon: '🤖', title: 'AI Video Creation: The Complete Beginners Guide', summary: 'Everything you need to know about generating professional videos using artificial intelligence tools.', tags: ['#ai video creation', '#automated videos', '#text to video'], readTime: '12 min read' },
            { id: 'faceless-youtube-channel-ideas-5k-per-month', icon: '💰', title: 'Faceless YouTube Channel Ideas That Make 5K Per Month', summary: 'Proven faceless channel niches with high monetization potential and step-by-step launch strategies.', tags: ['#faceless channel', '#youtube ideas', '#passive income'], readTime: '10 min read' },
            { id: 'repurpose-youtube-videos-facebook-tiktok', icon: '📱', title: 'How to Repurpose YouTube Videos for Facebook and TikTok', summary: 'Maximize your content reach by repurposing AI-generated YouTube videos across multiple platforms.', tags: ['#repurpose content', '#tiktok', '#facebook reels'], readTime: '7 min read' },
            { id: 'best-ai-video-niches-low-competition-2025', icon: '🎯', title: 'Best AI Video Niches with Low Competition in 2025', summary: 'Discover untapped YouTube niches where AI-generated content can dominate with minimal competition.', tags: ['#youtube niches', '#low competition', '#ai video'], readTime: '9 min read' },
            { id: 'grow-0-to-10k-subscribers-ai-videos', icon: '📈', title: 'How to Grow from 0 to 10K Subscribers with AI Videos', summary: 'A proven roadmap for building a loyal YouTube audience using AI-generated video content.', tags: ['#youtube growth', '#subscribers', '#ai content'], readTime: '11 min read' },
          ].map((post, i) => (
            <div key={post.id}
              onClick={() => onOpenBlog && onOpenBlog(post.id)}
              className="feature-card"
              style={{ padding: '28px 24px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, animation: `fadeUp 0.5s ease ${i * 0.07}s both` }}>
              <div style={{ fontSize: 32 }}>{post.icon}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--landing-display)', lineHeight: 1.35, margin: 0 }}>{post.title}</h3>
              <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.7, fontFamily: 'var(--landing-body)', margin: 0, flexGrow: 1 }}>{post.summary}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {post.tags.map((tag, j) => (
                  <span key={j} style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.2)', color: 'var(--text3)', fontSize: 11, fontFamily: 'var(--landing-body)' }}>{tag}</span>
                ))}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent2)', fontFamily: 'var(--landing-body)' }}>{post.readTime} →</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '100px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,106,247,0.12) 0%, transparent 65%)', pointerEvents: 'none', filter: 'blur(40px)' }} />
        <div className="reveal" style={{ maxWidth: 640, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-block', padding: '5px 16px', borderRadius: 999, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.2)', fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.08em', fontFamily: 'var(--lb)', marginBottom: 28 }}>GET STARTED TODAY</div>
          <h2 style={{ fontSize: 'clamp(32px, 4.5vw, 52px)', fontWeight: 800, letterSpacing: '-2px', marginBottom: 20, fontFamily: 'var(--ld)', color: '#fff', lineHeight: 1.08 }}>
            Ready to create your<br />first video?
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.45)', marginBottom: 40, fontFamily: 'var(--lb)', maxWidth: 440, margin: '0 auto 40px', lineHeight: 1.7 }}>
            Join thousands of creators using Erivion to produce professional videos in minutes.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={onGetStarted} className="cta-primary"
              style={{ padding: '17px 48px', color: '#fff', border: 'none', borderRadius: 14, fontWeight: 700, fontSize: 18, cursor: 'pointer', fontFamily: 'var(--lb)' }}>
              Get Started Free →
            </button>
          </div>
          <p style={{ marginTop: 18, fontSize: 12, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--lb)' }}>Free plan · No credit card · Cancel anytime</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <AppFooter onNavigate={setSubPage} onGetStarted={onGetStarted} />
    </div>
  );
}