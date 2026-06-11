import React, { useState, useEffect } from 'react';
import InputPage from './pages/InputPage.jsx';
import MapVideoPage from './pages/MapVideoPage.jsx';
import ScenesPage from './pages/ScenesPage.jsx';
import RenderPage from './pages/RenderPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import VideosPage from './pages/VideosPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import UserMenu from './pages/UserMenu.jsx';
import LandingPage from './pages/LandingPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import SubPage from './pages/SubPage.jsx';
import BlogPostPage from './pages/BlogPostPage.jsx';
import Model3Page from './pages/Model3Page.jsx';
import Model4Page from './pages/Model4Page.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AffiliatePage from './pages/AffiliatePage.jsx';
import ModelCinematicPage from './pages/ModelCinematicPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import ModelErivionPage from './pages/ModelErivionPage.jsx';
import FAQPage from './pages/FAQPage.jsx';

const LOGO = '/logo.png';
const APP_VERSION = 'v4.0'; // build:1780005744

// ── Model Welcome Modal ──────────────────────────────────────────────────────
function ModelWelcomeModal({ modelKey, userRegion, onContinue }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 50); }, []);

  const isAr = userRegion === 'eg';

  const content = {
    model1: {
      ar: {
        title: 'موديل 1 — AI Slices',
        icon: '🖼️',
        body: 'عميلنا العزيز! قبل أن تدخل على استخدام الموديل نحب أن نعرفك على كيفية استخدامه. بعد أن تقوم بكتابة الفكرة أو السكريبت وتتبع الخطوات، وعندما تصل إلى صفحة الريندر يجب أن تضغط أولاً «Generate Voice» ثم «Render» كي يصدر الفيديو بطريقة جيدة وبصوت احترافي.',
        btn: 'حسناً، سأبدأ الآن ←',
      },
      en: {
        title: 'Model 1 — AI Slices',
        icon: '🖼️',
        body: 'Dear user! Before entering the model, we want you to know how to use it correctly. After writing your idea or script and following the steps, when you reach the Render page you must first press «Generate Voice» then «Render» so your video exports with great quality and a professional voice.',
        btn: 'Got it, let\'s start →',
      },
    },
    model2: {
      ar: {
        title: 'موديل 2 — Real Footage',
        icon: '🎥',
        body: 'عميلنا العزيز! قبل أن تدخل على استخدام الموديل نحب أن نعرفك على كيفية استخدامه. بعد أن تقوم بكتابة الفكرة أو السكريبت وتتبع الخطوات، وعندما تصل إلى صفحة الريندر يجب أن تضغط أولاً «Generate Voice» ثم «Render» كي يصدر الفيديو بطريقة جيدة وبصوت احترافي.',
        btn: 'حسناً، سأبدأ الآن ←',
      },
      en: {
        title: 'Model 2 — Real Footage',
        icon: '🎥',
        body: 'Dear user! Before entering the model, we want you to know how to use it correctly. After writing your idea or script and following the steps, when you reach the Render page you must first press «Generate Voice» then «Render» so your video exports with great quality and a professional voice.',
        btn: 'Got it, let\'s start →',
      },
    },
  };

  const c = content[modelKey]?.[isAr ? 'ar' : 'en'];
  if (!c) { onContinue(); return null; }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20, backdropFilter: 'blur(8px)', opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }}>
      <div style={{ background: '#09090f', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 24, padding: '36px 32px', width: '100%', maxWidth: 480, boxShadow: '0 32px 80px rgba(0,0,0,0.8)', transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(16px)', transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>{c.icon}</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>{c.title}</h2>
        </div>
        <div style={{ background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 14, padding: '18px 20px', marginBottom: 24, fontSize: 14, color: '#d1d5db', lineHeight: 1.8, direction: isAr ? 'rtl' : 'ltr', textAlign: isAr ? 'right' : 'left' }}>
          {c.body}
        </div>
        <button onClick={onContinue} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,106,247,0.4)' }}>
          {c.btn}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('input');
  const [formData, setFormData] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showVideos, setShowVideos] = useState(false);
  const [credits, setCredits] = useState(null);
  const [showPricing, setShowPricing] = useState(false);
  const [userPlan, setUserPlan] = useState('free');
  const [planSelected, setPlanSelected] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [blogPostId, setBlogPostId] = useState(null);
  const [model3Access, setModel3Access] = useState(false);
  const [model3Plan, setModel3Plan] = useState('m3_starter');
  const [model4Access, setModel4Access] = useState(false);
  const [model4Plan, setModel4Plan] = useState('m4_plan1');
  const [model4TrialUsed, setModel4TrialUsed] = useState(false);
  const [model5Access, setModel5Access] = useState(false);
  const [model6Access, setModel6Access] = useState(true);
  const [model5Plan, setModel5Plan] = useState('mc_starter');
  const [erivionAccess, setErivionAccess] = useState(false);
  const [erivionPlan, setErivionPlan] = useState(null);
  const [userAvatar, setUserAvatar] = useState(null);
  const [userRegion, setUserRegion] = useState(null);
  const [pendingModelKey, setPendingModelKey] = useState(null); // for welcome modal
  const [pendingModelAction, setPendingModelAction] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref) {
      localStorage.setItem('erivion_ref', ref);
      fetch('/api/affiliate/click', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref_code: ref }),
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleToken = params.get('google_token');
    const googleEmail = params.get('email');
    const googlePlan  = params.get('plan');
    const googleAvatar = params.get('avatar');
    const authError   = params.get('auth_error');

    if (window.location.pathname === '/login') {
      window.history.replaceState({}, '', '/');
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('email');
      if (token && email) { setUser({ token, email }); setUserPlan(localStorage.getItem('plan') || 'free'); setPlanSelected(true); }
      else { setShowAuth(true); }
      setAuthChecked(true); return;
    }
    if (window.location.pathname === '/terms') { window.history.replaceState({}, '', '/terms'); setPage('terms'); setAuthChecked(true); return; }
    if (window.location.pathname === '/privacy') { window.history.replaceState({}, '', '/privacy'); setPage('privacy'); setAuthChecked(true); return; }
    if (window.location.pathname === '/refund') { window.history.replaceState({}, '', '/refund'); setPage('refund'); setAuthChecked(true); return; }
    if (window.location.pathname === '/affiliate') { setPage('affiliate'); setAuthChecked(true); return; }
    if (window.location.pathname === '/pricing') {
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('email');
      if (token && email) { setUser({ token, email }); setUserPlan(localStorage.getItem('plan') || 'free'); setPlanSelected(true); setShowPricing(true); }
      else { setShowPricing(true); setShowAuth(true); }
      setAuthChecked(true); return;
    }
    if (['/model1', '/model2', '/model3', '/model4', '/model5', '/cinematic'].includes(window.location.pathname)) {
      const targetModel = window.location.pathname.replace('/', '');
      const token = localStorage.getItem('token');
      const email = localStorage.getItem('email');
      window.history.replaceState({}, '', '/');
      if (token && email) {
        setUser({ token, email });
        setUserPlan(localStorage.getItem('plan') || 'free');
        setPlanSelected(true);
        if (targetModel === 'model3') setPage('model3');
        else if (targetModel === 'model4') setPage('model4');
        else if (targetModel === 'model5' || targetModel === 'cinematic') setPage('model5');
        else setPage('input');
      } else { setShowAuth(true); }
      setAuthChecked(true); return;
    }
    if (params.get('admin') === '1') { window.history.replaceState({}, '', '/'); setPage('admin'); setAuthChecked(true); return; }
    if (googleToken || authError) window.history.replaceState({}, '', '/');
    if (authError) { setShowAuth(true); setAuthChecked(true); return; }
    if (googleToken && googleEmail) {
      localStorage.setItem('token', googleToken);
      localStorage.setItem('email', googleEmail);
      localStorage.setItem('plan', googlePlan || 'free');
      if (googleAvatar) localStorage.setItem('avatar', googleAvatar);
      const termsAccepted = localStorage.getItem('termsAccepted') === 'true';
      const planChosenBefore = localStorage.getItem('planSelected') === 'true';
      setUser({ token: googleToken, email: googleEmail });
      setUserPlan(googlePlan || 'free');
      setUserAvatar(googleAvatar || null);
      if (!termsAccepted) { setShowAuth(true); }
      else { setPlanSelected(planChosenBefore); if (!planChosenBefore) setShowPricing(true); }
      setAuthChecked(true); return;
    }
    const token = localStorage.getItem('token');
    const email = localStorage.getItem('email');
    const plan  = localStorage.getItem('plan') || 'free';
    const planChosenBefore = localStorage.getItem('planSelected') === 'true';
    const savedAvatar = localStorage.getItem('avatar');
    if (token && email) {
      setUser({ token, email });
      setUserPlan(plan);
      setPlanSelected(planChosenBefore);
      if (savedAvatar) setUserAvatar(savedAvatar);
      if (!planChosenBefore) setShowPricing(true);
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchCredits();
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/auth/credits', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
        if (!res.ok) return;
        const data = await res.json();
        setCredits(data);
        setUserPlan(data.plan || 'free');
        setModel3Access(data.model3_access === 1 || data.model3_access === true);
        setModel4Access(data.model4_access === 1 || data.model4_access === true);
        setModel5Access(data.model5_access === 1 || data.model5_access === true);
        setErivionAccess(data.erivion_access === 1 || data.erivion_access === true);
        setErivionPlan(data.erivion_plan || null);
        if (data.avatar) { setUserAvatar(data.avatar); localStorage.setItem('avatar', data.avatar); }
      } catch {}
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchCredits = async () => {
    try {
      const res = await fetch('/api/auth/credits', { headers: { Authorization: 'Bearer ' + localStorage.getItem('token') } });
      if (res.ok) {
        const data = await res.json();
        setCredits(data);
        setUserPlan(data.plan || 'free');
        setModel3Access(data.model3_access === 1 || data.model3_access === true);
        setModel3Plan(data.model3_plan || 'm3_starter');
        setModel4Access(data.model4_access === 1 || data.model4_access === true);
        setModel4Plan(data.model4_plan || 'm4_plan1');
        setModel4TrialUsed(data.model4_trial_used === 1 || data.model4_trial_used === true);
        setModel5Access(data.model5_access === 1 || data.model5_access === true);
        setModel5Plan(data.model5_plan || 'mc_starter');
        setErivionAccess(data.erivion_access === 1 || data.erivion_access === true);
        setErivionPlan(data.erivion_plan || null);
        localStorage.setItem('plan', data.plan || 'free');
        if (data.avatar) { setUserAvatar(data.avatar); localStorage.setItem('avatar', data.avatar); }
      }
    } catch (e) { console.warn('Could not fetch credits'); }
  };

  const handleLogout = () => {
    localStorage.removeItem('token'); localStorage.removeItem('email');
    localStorage.removeItem('plan'); localStorage.removeItem('planSelected');
    localStorage.removeItem('avatar');
    setUser(null); setPage('input'); setFormData(null); setScenes([]);
    setCredits(null); setShowPricing(false); setPlanSelected(false); setShowAuth(false);
    setUserAvatar(null);
  };

  const handleNavigate = (key) => {
    switch (key) {
      case 'affiliate':  setPage('affiliate'); break;
      case 'model3':     setPage('model3'); break;
      case 'model4':     setPage('model4'); break;
      case 'model5':     setPage('model5'); break;
      case 'pricing':    setShowPricing(true); break;
      case 'settings':   setPage('settings'); break;
      case 'terms':      setPage('terms'); break;
      case 'privacy':    setPage('privacy'); break;
      case 'refund':     setPage('refund'); break;
      case 'support':    setPage('support'); break;
      case 'about':      setPage('about'); break;
      case 'faq':        setPage('faq'); break;
      case 'howto':      setPage('howto'); break;
      case 'templates':  setPage('templates'); break;
      case 'home':       setPage('input'); break;
      default:           setPage('input'); break;
    }
  };

  // ── Model welcome modal trigger ──────────────────────────────────────────
  const goToModelWithWelcome = (modelKey, action) => {
    const shownKey = `welcome_shown_${modelKey}`;
    if (localStorage.getItem(shownKey) === 'true') {
      action();
    } else {
      setPendingModelKey(modelKey);
      setPendingModelAction(() => action);
    }
  };

  if (!authChecked) return null;
  if (page === 'admin') return <AdminPage />;
  if (page === 'affiliate') return <AffiliatePage onBack={() => { setPage('input'); window.history.pushState({}, '', '/'); }} />;
  if (['terms','privacy','refund'].includes(page) && !user) return <SubPage page={page} onBack={() => { setPage('input'); window.history.replaceState({}, '', '/'); }} />;

  if (!user) {
    if (showAuth) return <AuthPage onAuth={(data) => {
      localStorage.setItem('token', data.token); localStorage.setItem('email', data.email); localStorage.setItem('plan', data.plan || 'free');
      setUser({ token: data.token, email: data.email }); setUserPlan(data.plan || 'free'); setShowAuth(false);
      const planChosenBefore = localStorage.getItem('planSelected') === 'true';
      if (!planChosenBefore) setShowPricing(true);
    }} />;
    if (blogPostId) return <BlogPostPage postId={blogPostId} onBack={() => setBlogPostId(null)} />;
    return <LandingPage onGetStarted={() => setShowAuth(true)} onOpenBlog={(id) => setBlogPostId(id)} />;
  }

  if (showAuth) return <AuthPage onAuth={(data) => {
    localStorage.setItem('token', data.token); localStorage.setItem('email', data.email); localStorage.setItem('plan', data.plan || 'free');
    setUser({ token: data.token, email: data.email }); setUserPlan(data.plan || 'free'); setShowAuth(false);
    const planChosenBefore = localStorage.getItem('planSelected') === 'true';
    if (!planChosenBefore) setShowPricing(true);
  }} />;

  if (showPricing) return <PricingPage
    currentPlan={userPlan}
    onSelectPlan={(plan) => {
      setUserPlan(plan); setShowPricing(false); setPlanSelected(true);
      localStorage.setItem('plan', plan); localStorage.setItem('planSelected', 'true');
      fetchCredits();
      if (window.location.pathname === '/pricing') window.history.pushState({}, '', '/');
    }}
    onSkip={() => {
      setShowPricing(false); setPlanSelected(true); localStorage.setItem('planSelected', 'true');
      if (window.location.pathname === '/pricing') window.history.pushState({}, '', '/');
    }}
    onNavigate={handleNavigate}
    onRegionSelect={(r) => setUserRegion(r)}
  />;

  const creditsColor = () => {
    if (!credits) return 'var(--text3)';
    if (credits.percentage >= 80) return '#ef4444';
    if (credits.percentage >= 50) return '#f59e0b';
    return '#22c55e';
  };
  const formatNumber = (n) => { if (!n && n !== 0) return '–'; if (n >= 1000) return (n / 1000).toFixed(1) + 'k'; return n; };
  const PLAN_COLORS = { free: '#6b7280', pro: '#7c6af7', plus: '#06b6d4', max: '#f59e0b' };
  const planColor = PLAN_COLORS[userPlan] || '#6b7280';

  const NAV_ITEMS = [
    { key: 'home', label: 'Home' },
    { key: 'pricing', label: 'Pricing' },
    { key: 'templates', label: 'Templates' },
    { key: 'about', label: 'About Us' },
    { key: 'support', label: 'Support' },
  ];

  const Header = () => (
    <div className="app-header" style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: 'var(--bg)', borderBottom: '1px solid var(--border)', padding: '0 16px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <style>{`
        .nav-link { color: #9ca3af; font-size: 13px; font-weight: 500; background: none; border: none; cursor: pointer; padding: 6px 10px; border-radius: 8px; transition: all 0.15s; }
        .nav-link:hover { color: #fff; background: rgba(255,255,255,0.06); }
        .nav-link.active { color: #fff; background: rgba(124,106,247,0.15); }
        .header-credits-label { display: inline; }
        .header-credits-sep { display: inline; }
        @media(max-width:768px) {
          .header-nav { display: none !important; }
          .header-credits-label { display: none; }
          .header-credits-sep { display: none; }
          .header-plan-badge { display: none; }
          .header-model-badge { display: none !important; }
        }
        .mobile-nav { display: none; }
        @media(max-width:768px) {
          .mobile-nav { display: flex !important; }
        }
      `}</style>

      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setPage('input')}>
        <img src={LOGO} alt="Erivion" style={{ width: 32, height: 32, objectFit: 'contain' }} />
        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.3px' }}>Erivion</span>
      </div>

      {/* Center: Nav */}
      <nav className="header-nav" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {NAV_ITEMS.map(item => (
          <button
            key={item.key}
            className={`nav-link${page === item.key || (item.key === 'pricing' && showPricing) ? ' active' : ''}`}
            onClick={() => handleNavigate(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Right: Credits + Models + My Videos + Plan + Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {credits && (
          <button onClick={fetchCredits} title="Click to refresh"
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
            <span className="header-credits-label" style={{ fontSize: 11, color: 'var(--text3)' }}>Credits:</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: creditsColor() }}>{formatNumber(credits.remaining)}</span>
            <span className="header-credits-sep" style={{ fontSize: 10, color: 'var(--text3)' }}>/ {formatNumber(credits.limit)}</span>
          </button>
        )}
        {/* Model video counters */}
        {credits && model3Access && (
          <div className="header-model-badge" style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(245,158,11,0.1)', border:'1px solid rgba(245,158,11,0.3)', borderRadius:8, padding:'4px 8px', fontSize:11, color:'#f59e0b', fontWeight:700 }}>
            <span>✨</span><span>{credits.model3_usage !== undefined ? (credits.model3_quotas?.videos_per_month || 0) - (credits.model3_usage || 0) : '–'}</span>
          </div>
        )}
        {credits && model4Access && (
          <div className="header-model-badge" style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(168,85,247,0.1)', border:'1px solid rgba(168,85,247,0.3)', borderRadius:8, padding:'4px 8px', fontSize:11, color:'#a855f7', fontWeight:700 }}>
            <span>🎬</span><span>{credits.model4_usage !== undefined ? (credits.model4_plan_data?.videos_per_month || 0) - (credits.model4_usage || 0) : '–'}</span>
          </div>
        )}
        {credits && model5Access && (
          <div className="header-model-badge" style={{ display:'flex', alignItems:'center', gap:4, background:'rgba(225,29,72,0.1)', border:'1px solid rgba(225,29,72,0.3)', borderRadius:8, padding:'4px 8px', fontSize:11, color:'#e11d48', fontWeight:700 }}>
            <span>🎭</span><span>{credits.model5_usage !== undefined ? (credits.model5_plan_data?.videos_per_month || 0) - (credits.model5_usage || 0) : '–'}</span>
          </div>
        )}

        <div className="header-plan-badge" style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: `${planColor}22`, border: `1px solid ${planColor}55`, color: planColor, letterSpacing: '0.04em' }}>
          {userPlan.toUpperCase()}
        </div>
        <UserMenu user={user} plan={userPlan} onLogout={handleLogout} onNavigate={handleNavigate} model3Access={model3Access} model4Access={model4Access} model5Access={model5Access} model6Access={model6Access} avatar={userAvatar} />
      </div>
    </div>
  );

  return (
    <>
      <Header />
      {showVideos && <VideosPage onClose={() => setShowVideos(false)} />}

      {/* Model Welcome Modal */}
      {pendingModelKey && (
        <ModelWelcomeModal
          modelKey={pendingModelKey}
          userRegion={userRegion || localStorage.getItem('erivion_region') || 'intl'}
          onContinue={() => {
            localStorage.setItem(`welcome_shown_${pendingModelKey}`, 'true');
            const action = pendingModelAction;
            setPendingModelKey(null);
            setPendingModelAction(null);
            if (action) action();
          }}
        />
      )}

      {/* ── Mobile Bottom Nav ── */}
      <div className="mobile-nav" style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:99, background:'var(--bg)', borderTop:'1px solid var(--border)', padding:'6px 8px', display:'none', alignItems:'center', justifyContent:'space-around' }}>
        <button onClick={() => handleNavigate('home')} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, background:'none', border:'none', cursor:'pointer', color: page==='input'?'#a78bfa':'#6b7280', fontSize:10, fontWeight:600, padding:'4px 8px' }}>
          <span style={{ fontSize:18 }}>🏠</span><span>Home</span>
        </button>
        <button onClick={() => handleNavigate('templates')} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, background:'none', border:'none', cursor:'pointer', color: page==='templates'?'#a78bfa':'#6b7280', fontSize:10, fontWeight:600, padding:'4px 8px' }}>
          <span style={{ fontSize:18 }}>🎬</span><span>Templates</span>
        </button>

        <button onClick={() => setShowPricing(true)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, background:'none', border:'none', cursor:'pointer', color:'#6b7280', fontSize:10, fontWeight:600, padding:'4px 8px' }}>
          <span style={{ fontSize:18 }}>💎</span><span>Pricing</span>
        </button>
        <button onClick={() => handleNavigate('support')} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, background:'none', border:'none', cursor:'pointer', color: page==='support'?'#a78bfa':'#6b7280', fontSize:10, fontWeight:600, padding:'4px 8px' }}>
          <span style={{ fontSize:18 }}>💬</span><span>Support</span>
        </button>
      </div>

      <div style={{ paddingTop: 54, paddingBottom: 60 }}>
        {page === 'scenes' && <ScenesPage formData={formData} onBack={() => setPage('input')} onRender={(finalScenes, voiceOptions) => { setScenes(finalScenes); if (voiceOptions) setFormData(prev => ({ ...prev, ...voiceOptions })); setPage('render'); }} onScenesGenerated={fetchCredits} />}
        {page === 'render' && <RenderPage scenes={scenes} formData={formData} user={user} onBack={() => setPage('scenes')} onReset={() => { setPage('input'); setFormData(null); setScenes([]); }} />}
        {page === 'input' && <InputPage
          onSubmit={(data) => {
            if (data.videoType === 'model3') { setPage('model3'); return; }
            if (data.videoType === 'model4') { setPage('model4'); return; }
            if (data.videoType === 'model5') { setPage('model5'); return; }
            if (data.videoType === 'model6') { setFormData(data); setPage('model6'); return; }
            if (data.videoType === 'model7') { setPage('model7'); return; }
            // model1 / model2 — show welcome modal
            const modelKey = data.videoType === 'model2' ? 'model2' : 'model1';
            goToModelWithWelcome(modelKey, () => { setFormData(data); setPage('scenes'); });
          }}
          model3Access={model3Access} model4Access={model4Access} model5Access={model5Access}
        />}
        {page === 'model3' && <Model3Page onBack={() => setPage('input')} model3Plan={model3Plan} model3Access={model3Access} onNavigate={handleNavigate} />}
        {page === 'model4' && <Model4Page onBack={() => { setPage('input'); fetchCredits(); }} model4Plan={model4Plan} model4Access={model4Access} onNavigate={handleNavigate} />}
        {page === 'model5' && <ModelCinematicPage onBack={() => { setPage('input'); fetchCredits(); }} model5Plan={model5Plan} model5Access={model5Access} onNavigate={handleNavigate} />}
        {page === 'model6' && <MapVideoPage formData={formData} onBack={() => setPage('input')} />}
        {page === 'model7' && <ModelErivionPage onBack={() => { setPage('input'); fetchCredits(); }} erivionPlan={erivionPlan} erivionAccess={erivionAccess} onNavigate={handleNavigate} />}
        {page === 'affiliate' && <AffiliatePage onBack={() => { setPage('input'); window.history.pushState({}, '', '/'); }} />}
        {page === 'settings' && <SettingsPage onBack={() => setPage('input')} user={user} onNavigate={handleNavigate} />}
        {page === 'templates' && <TemplatesPage onNavigate={handleNavigate} userRegion={userRegion} />}
        {['terms','privacy','support','about','refund','howto'].includes(page) && <SubPage page={page} onBack={() => setPage('input')} />}
        {page === 'faq' && <FAQPage onBack={() => setPage('input')} onNavigate={handleNavigate} />}
      </div>
    </>
  );
}