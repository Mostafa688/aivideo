import React, { useState, useEffect } from 'react';
import InputPage from './pages/InputPage.jsx';
import MapVideoPage from './pages/MapVideoPage.jsx';
import ScenesPage from './pages/ScenesPage.jsx';
import RenderPage from './pages/RenderPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import VideosPage from './pages/VideosPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import UserMenu, { HowToModal, AffiliateModal } from './pages/UserMenu.jsx';
import NotificationBell from './pages/NotificationBell.jsx';
import LandingPage from './pages/LandingPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import SubPage from './pages/SubPage.jsx';
import BlogPostPage from './pages/BlogPostPage.jsx';
import Model3Page from './pages/Model3Page.jsx';
import Model4Page from './pages/Model4Page.jsx';
import Model8Page from './pages/Model8Page.jsx';
import AdminPage from './pages/AdminPage.jsx';
import AffiliatePage from './pages/AffiliatePage.jsx';
import ModelCinematicPage from './pages/ModelCinematicPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import ModelErivionPage from './pages/ModelErivionPage.jsx';
import FAQPage from './pages/FAQPage.jsx';
import SupportPage from './pages/SupportPage.jsx';
import CommunityPage from './pages/CommunityPage.jsx';
import AgentPage from './pages/AgentPage.jsx';

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

// ── 404 Not Found Page ───────────────────────────────────────────────────────
function NotFoundPage({ onNavigate }) {
  const region = localStorage.getItem('erivion_region') || 'eg';
  const isAr = region !== 'intl';
  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at top, #1a0f2e 0%, #0a0a0f 55%, #000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: '0.05em', background: 'linear-gradient(135deg,#a78bfa,#7c6af7 50%,#6d28d9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', marginBottom: 8 }}>404</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 12 }}>
          {isAr ? 'الصفحة اللي بتدور عليها مش موجودة' : "This page doesn't exist"}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, lineHeight: 1.8, marginBottom: 32 }}>
          {isAr ? 'ممكن يكون الرابط اتغيّر أو مكتوب غلط. جرب ترجع للصفحة الرئيسية.' : 'The link might be broken or mistyped. Try heading back home.'}
        </p>
        <button onClick={() => { window.history.pushState({}, '', '/'); onNavigate('home'); }}
          style={{ padding: '13px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 6px 24px rgba(124,106,247,0.35)' }}>
          {isAr ? 'الرجوع للرئيسية' : 'Back to Home'}
        </button>
      </div>
    </div>
  );
}

// ── Cookie Consent Banner ────────────────────────────────────────────────────
function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const region = localStorage.getItem('erivion_region') || 'eg';
  const isAr = region !== 'intl';

  useEffect(() => {
    if (!localStorage.getItem('cookieConsent')) setTimeout(() => setVisible(true), 800);
  }, []);

  const accept = () => { localStorage.setItem('cookieConsent', 'accepted'); setVisible(false); };
  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', bottom: 16, insetInlineStart: 16, insetInlineEnd: 16, maxWidth: 460, margin: '0 auto', zIndex: 9998, background: '#0f0f1a', border: '1px solid rgba(124,106,247,0.25)', borderRadius: 16, padding: '18px 20px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', gap: 12, direction: isAr ? 'rtl' : 'ltr' }}>
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
        {isAr
          ? '🍪 بنستخدم كوكيز أساسية وتحليلية عشان نحسّن تجربتك ونفهم استخدام الموقع. استمرارك في الاستخدام يعني موافقتك.'
          : '🍪 We use essential and analytics cookies to improve your experience and understand site usage. By continuing, you agree to this.'}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={accept} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          {isAr ? 'موافق' : 'Accept'}
        </button>
        <a href="/privacy" style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.6)', fontSize: 13, textDecoration: 'none', textAlign: 'center' }}>
          {isAr ? 'التفاصيل' : 'Learn more'}
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState('agent');
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
  const [googlePendingData, setGooglePendingData] = useState(null); // for google new user onboarding

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

  const [showHowToModal, setShowHowToModal] = useState(false);
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);

  // ── Handle browser back/forward button ──────────────────────────────────
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/' || path === '') {
        setShowPricing(false);
        setShowAuth(false);
        setPage('input');
      } else if (path === '/pricing') {
        setShowPricing(true);
      } else if (path === '/affiliate') {
        setPage('affiliate');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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
    if (window.location.pathname === '/about') { setPage('about'); setAuthChecked(true); return; }
    if (window.location.pathname === '/support') { setPage('support'); setAuthChecked(true); return; }
    if (window.location.pathname === '/faq') { setPage('faq'); setAuthChecked(true); return; }
    if (window.location.pathname === '/templates') { setPage('templates'); setAuthChecked(true); return; }
    if (window.location.pathname === '/blog') { setAuthChecked(true); return; }
    const blogMatch = window.location.pathname.match(/^\/blog\/([a-z0-9-]+)$/);
    if (blogMatch) { setBlogPostId(blogMatch[1]); setAuthChecked(true); return; }
    if (window.location.pathname === '/affiliate') { setPage('affiliate'); setAuthChecked(true); return; }
    if (window.location.pathname === '/community') { setPage('community'); setAuthChecked(true); return; }
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
        else if (targetModel === 'model8') setPage('model8');
        else if (targetModel === 'model5' || targetModel === 'cinematic') setPage('model5');
        else setPage('input');
      } else { setShowAuth(true); }
      setAuthChecked(true); return;
    }
    if (params.get('admin') === '1') { window.history.replaceState({}, '', '/'); setPage('admin'); setAuthChecked(true); return; }
    // ✅ أي رابط مش معروف خالص (مش من القايمة دي) → صفحة 404 بدل ما يترجع للصفحة الرئيسية بصمت
    const KNOWN_PATHS = ['/', '/login', '/terms', '/privacy', '/refund', '/about', '/support', '/faq', '/templates', '/blog', '/affiliate', '/community', '/pricing', '/model1', '/model2', '/model3', '/model4', '/model5', '/cinematic'];
    if (!KNOWN_PATHS.includes(window.location.pathname) && !googleToken && !authError && params.get('admin') !== '1') {
      setPage('notfound'); setAuthChecked(true); return;
    }
    if (googleToken || authError) window.history.replaceState({}, '', '/');
    if (authError) { setShowAuth(true); setAuthChecked(true); return; }
    if (googleToken && googleEmail) {
      localStorage.setItem('token', googleToken);
      localStorage.setItem('email', googleEmail);
      localStorage.setItem('plan', googlePlan || 'free');
      if (googleAvatar) localStorage.setItem('avatar', googleAvatar);
      const termsAccepted = localStorage.getItem('termsAccepted') === 'true';
      const planChosenBefore = localStorage.getItem('planSelected') === 'true';
      if (!termsAccepted) {
        // مستخدم جديد — مش بنعمل setUser عشان يعرض AuthPage صح
        const pendingData = { token: googleToken, email: googleEmail, plan: googlePlan || 'free', name: decodeURIComponent(params.get('name') || '') };
        setGooglePendingData(pendingData);
        setShowAuth(true);
      } else {
        // مستخدم قديم — يدخل مباشرة
        setUser({ token: googleToken, email: googleEmail });
        setUserPlan(googlePlan || 'free');
        setUserAvatar(googleAvatar || null);
        setShowAuth(false);
        setPlanSelected(planChosenBefore);
        if (!planChosenBefore) setShowPricing(true);
      }
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
      case 'community': setPage('community'); break;
      case 'agent':      setPage('agent'); break;
      case 'models':     setPage('input'); break;
      case 'affiliate':  setPage('affiliate'); break;
      case 'model3':     setPage('model3'); break;
      case 'model4':     setPage('model4'); break;
      case 'model8':     setPage('model8'); break;
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
      case 'home':       setPage('agent'); break;
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
    if (showAuth) return <AuthPage googlePendingData={googlePendingData} onAuth={(data) => {
      localStorage.setItem('token', data.token); localStorage.setItem('email', data.email); localStorage.setItem('plan', data.plan || 'free');
      setUser({ token: data.token, email: data.email }); setUserPlan(data.plan || 'free'); setShowAuth(false); setGooglePendingData(null);
      const planChosenBefore = localStorage.getItem('planSelected') === 'true';
      if (!planChosenBefore) setShowPricing(true);
    }} />;
    if (blogPostId) return <BlogPostPage postId={blogPostId} onBack={() => setBlogPostId(null)} />;
    if (page === 'community') return <CommunityPage onBack={() => setPage('input')} user={null} onNavigate={(k) => { if(k==='auth') setShowAuth(true); else if(k==='community') {} else setShowAuth(true); }} />;
    // ✅ FIX: صفحة الدعم أصلاً بتشتغل من غير تسجيل دخول (فورم اسم+إيميل بسيطة)، فلازم تبقى
    // استثناء زي الكوميونيتي بالظبط — قبل الفيكس ده، أي زائر مش مسجل دخول (زي عميل بيدوس على
    // رابط الشات من الإيميل من متصفح تاني) كان بيترجعله اللاندنج بيدج بدل الشات مباشرة
    if (page === 'support') return <SupportPage onBack={() => setPage('input')} onNavigate={(k) => { if(k==='community') setPage(k); else setShowAuth(true); }} />;
    return <LandingPage onGetStarted={() => setShowAuth(true)} onOpenBlog={(id) => setBlogPostId(id)} onNavigate={(k) => { if(k==='support'||k==='community') setPage(k); else setShowAuth(true); }} />;
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
    { key: 'community', label: '🌍 Community' },
    { key: 'about', label: 'About Us' },
    { key: 'support', label: 'Support' },
    { key: 'affiliate', label: '💰 Affiliate' },
  ];

  const Header = () => (
    <header className="app-header" style={{ gap:8, zIndex:10000 }}>
      <style>{`
        @media(max-width:640px){
          .header-nav-desktop{display:none!important}
          .header-credits-full{display:none!important}
          .header-plan-badge{display:none!important}
          .header-model-badge{display:none!important}
        }
        @media(min-width:641px){
          .header-credits-mobile{display:none!important}
        }
      `}</style>

      {/* Logo */}
      <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', flexShrink:0 }} onClick={() => handleNavigate('home')}>
        <img src={LOGO} alt="Erivion" style={{ width:26, height:26, objectFit:'contain' }} />
        <span style={{ fontSize:16, fontWeight:800, color:'#fff', letterSpacing:'-0.4px', fontFamily:"'Bricolage Grotesque', sans-serif" }}>Erivion</span>
      </div>

      {/* Center Nav — desktop only */}
      <nav className="header-nav-desktop" style={{ display:'flex', alignItems:'center', gap:2, flex:1, justifyContent:'center' }}>
        {NAV_ITEMS.map(item => (
          <button key={item.key} className={`nav-link${page === item.key || (item.key === 'pricing' && showPricing) || (item.key === 'home' && page === 'agent') ? ' active' : ''}`}
            onClick={() => handleNavigate(item.key)}>{item.label}</button>
        ))}
      </nav>

      {/* Right side */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:'auto' }}>

        {/* رصيد الكريديت الموحد — عداد واحد بس */}
        {credits && (
          <button onClick={fetchCredits} title="Click to refresh" className="header-credits header-credits-full"
            style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(124,106,247,0.08)', border:'1px solid rgba(124,106,247,0.25)', borderRadius:8, padding:'5px 12px', cursor:'pointer', transition:'all 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(124,106,247,0.14)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(124,106,247,0.08)'}>
            <span style={{ fontSize:13, fontWeight:700, color:'#a99bff' }}>{(credits.credits_balance ?? 0).toLocaleString()}</span>
            <span style={{ fontSize:10, color:'var(--text3)' }}>credits</span>
          </button>
        )}

        {user?.token && <NotificationBell token={user.token} />}

        <UserMenu user={user} plan={userPlan} onLogout={handleLogout} onNavigate={handleNavigate}
          model3Access={model3Access} model4Access={model4Access} model5Access={model5Access} model6Access={model6Access}
          avatar={userAvatar} currentPage={page}
          onShowHowTo={() => setShowHowToModal(true)}
          onShowAffiliate={() => setShowAffiliateModal(true)} />
      </div>
    </header>
  );


  return (
    <>
      <Header />
      {showVideos && <VideosPage onClose={() => setShowVideos(false)} />}

      {/* Floating Agent toggle — visible on the Models grid page */}
      {page === 'input' && (
        <button onClick={() => setPage('agent')} style={{
          position: 'fixed', top: 66, insetInlineEnd: 16, zIndex: 500,
          padding: '9px 16px', borderRadius: 10, background: 'rgba(124,106,247,0.12)',
          border: '1px solid rgba(124,106,247,0.35)', color: '#a99bff', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,106,247,0.25)', backdropFilter: 'blur(8px)',
        }}>
          🤖 Agent →
        </button>
      )}

      {/* App-level modals — rendered outside header to avoid overflow issues */}
      {showHowToModal && <HowToModal onClose={() => setShowHowToModal(false)} />}
      {showAffiliateModal && <AffiliateModal user={user} onClose={() => setShowAffiliateModal(false)} onNavigateAffiliate={() => { setShowAffiliateModal(false); handleNavigate('affiliate'); }} />}

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

      <div id="app-main" style={{ paddingTop: 54, paddingBottom: 20 }}>
        {page === 'scenes' && <ScenesPage formData={formData} onBack={() => setPage('input')} onRender={(finalScenes, voiceOptions) => { setScenes(finalScenes); if (voiceOptions) setFormData(prev => ({ ...prev, ...voiceOptions })); setPage('render'); }} onScenesGenerated={fetchCredits} />}
        {page === 'render' && <RenderPage scenes={scenes} formData={formData} user={user} onBack={() => setPage('scenes')} onReset={() => { setPage('input'); setFormData(null); setScenes([]); }} />}
        {page === 'agent' && <AgentPage onNavigate={handleNavigate} onSwitchToModels={() => setPage('input')} />}
        {page === 'input' && <InputPage
          onSubmit={(data) => {
            if (data.videoType === 'model3') { setPage('model3'); return; }
            if (data.videoType === 'model4') { setPage('model4'); return; }
            if (data.videoType === 'model8') { setPage('model8'); return; }
            if (data.videoType === 'model5') { setPage('model5'); return; }
            if (data.videoType === 'model6') { setFormData(data); setPage('model6'); return; }
            if (data.videoType === 'model7') { setPage('model7'); return; }
            // model1 / model2 — show welcome modal
            const modelKey = data.videoType === 'model2' ? 'model2' : 'model1';
            goToModelWithWelcome(modelKey, () => { setFormData(data); setPage('scenes'); });
          }}
          model3Access={model3Access} model4Access={model4Access} model5Access={model5Access}
          userPlan={userPlan} credits={credits} onNavigate={handleNavigate}
        />}
        {page === 'model3' && <Model3Page onBack={() => setPage('input')} model3Plan={model3Plan} model3Access={model3Access} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model4' && <Model4Page onBack={() => { setPage('input'); fetchCredits(); }} model4Plan={model4Plan} model4Access={model4Access} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model8' && <Model8Page onBack={() => { setPage('input'); fetchCredits(); }} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model5' && <ModelCinematicPage onBack={() => { setPage('input'); fetchCredits(); }} model5Plan={model5Plan} model5Access={model5Access} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model6' && <MapVideoPage formData={formData} onBack={() => setPage('input')} />}
        {page === 'model7' && <ModelErivionPage onBack={() => { setPage('input'); fetchCredits(); }} erivionPlan={erivionPlan} erivionAccess={erivionAccess} onNavigate={handleNavigate} />}
        {page === 'affiliate' && <AffiliatePage onBack={() => { setPage('input'); window.history.pushState({}, '', '/'); }} />}
        {page === 'settings' && <SettingsPage onBack={() => setPage('input')} user={user} onNavigate={handleNavigate} />}
        {page === 'templates' && <TemplatesPage onNavigate={handleNavigate} userRegion={userRegion} />}
        {['terms','privacy','about','refund','howto'].includes(page) && <SubPage page={page} onBack={() => setPage('input')} />}
        {page === 'community' && <CommunityPage onBack={() => setPage('input')} user={user} onNavigate={handleNavigate} />}
        {page === 'support' && <SupportPage onBack={() => setPage('input')} onNavigate={handleNavigate} />}
        {page === 'faq' && <FAQPage onBack={() => setPage('input')} onNavigate={handleNavigate} />}
        {page === 'notfound' && <NotFoundPage onNavigate={handleNavigate} />}
      </div>
      <CookieConsentBanner />
    </>
  );
}