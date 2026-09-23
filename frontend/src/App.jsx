import React, { useState, useEffect } from 'react';
import { ImageIcon, Video, Cookie, GraduationCap, Globe, HandCoins, Bot } from 'lucide-react';
import InputPage from './pages/InputPage.jsx';
import MapVideoPage from './pages/MapVideoPage.jsx';
import ScenesPage from './pages/ScenesPage.jsx';
import RenderPage from './pages/RenderPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import VideosPage from './pages/VideosPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import UserMenu, { HowToModal, AffiliateModal, PLAN_META } from './pages/UserMenu.jsx';
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
import SidePanel from './components/SidePanel.jsx';
import ProjectsDashboardPage from './pages/ProjectsDashboardPage.jsx';
import CoursesPage from './pages/CoursesPage.jsx';
import ChangelogPage from './pages/ChangelogPage.jsx';
import RoadmapPage from './pages/RoadmapPage.jsx';
import StatusPage from './pages/StatusPage.jsx';
import ApiDocsPage from './pages/ApiDocsPage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import TeamPage from './pages/TeamPage.jsx';
import TeamInvitePage from './pages/TeamInvitePage.jsx';
import ChannelsPage from './pages/ChannelsPage.jsx';
import WhiteboardVideoPage from './pages/WhiteboardVideoPage.jsx';

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
        icon: ImageIcon,
        body: 'عميلنا العزيز! قبل أن تدخل على استخدام الموديل نحب أن نعرفك على كيفية استخدامه. بعد أن تقوم بكتابة الفكرة أو السكريبت وتتبع الخطوات، وعندما تصل إلى صفحة الريندر يجب أن تضغط أولاً «Generate Voice» ثم «Render» كي يصدر الفيديو بطريقة جيدة وبصوت احترافي.',
        btn: 'حسناً، سأبدأ الآن ←',
      },
      en: {
        title: 'Model 1 — AI Slices',
        icon: ImageIcon,
        body: 'Dear user! Before entering the model, we want you to know how to use it correctly. After writing your idea or script and following the steps, when you reach the Render page you must first press «Generate Voice» then «Render» so your video exports with great quality and a professional voice.',
        btn: 'Got it, let\'s start →',
      },
    },
    model2: {
      ar: {
        title: 'موديل 2 — Real Footage',
        icon: Video,
        body: 'عميلنا العزيز! قبل أن تدخل على استخدام الموديل نحب أن نعرفك على كيفية استخدامه. بعد أن تقوم بكتابة الفكرة أو السكريبت وتتبع الخطوات، وعندما تصل إلى صفحة الريندر يجب أن تضغط أولاً «Generate Voice» ثم «Render» كي يصدر الفيديو بطريقة جيدة وبصوت احترافي.',
        btn: 'حسناً، سأبدأ الآن ←',
      },
      en: {
        title: 'Model 2 — Real Footage',
        icon: Video,
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
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center', color: 'var(--accent2)' }}><c.icon size={44} strokeWidth={1.5} /></div>
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

// ── Welcome Tour Modal (first-time onboarding, once per browser) ────────────
function WelcomeTourModal({ userRegion, onDone }) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => { setTimeout(() => setVisible(true), 50); }, []);
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';

  const steps = isAr ? [
    { icon: '👋', title: 'أهلاً بيك في Erivion', body: 'بنساعدك تحول أي فكرة لفيديو احترافي بالذكاء الاصطناعي في دقايق — من غير خبرة مونتاج أو تصوير.' },
    { icon: '💬', title: 'قوللنا فكرتك وبس', body: 'اكتب فكرتك أو الصق سكريبت جاهز في الشات، ارفق صورة أو تسجيل صوتي لو حابب، وسيبنا نكتب البرومبت الاحترافي ونختار أفضل موديل.' },
    { icon: '💰', title: 'التكلفة واضحة قبل ما تأكد', body: 'أي خطوة بتتم بتوريك تكلفتها بالكريديت الأول، ومفيش أي خصم من غير ما توافق صراحة.' },
    { icon: '🚀', title: 'جاهز تبدأ؟', body: 'دوس ابدأ وقوللنا أول فكرة عندك — إحنا هنا لو احتجت أي مساعدة في أي وقت.' },
  ] : [
    { icon: '👋', title: 'Welcome to Erivion', body: "We help you turn any idea into a professional AI video in minutes — no editing or filming experience needed." },
    { icon: '💬', title: 'Just tell us your idea', body: 'Type your idea or paste a ready script in the chat, attach a photo or voice recording if you like, and we write the expert prompt and pick the best engine for you.' },
    { icon: '💰', title: 'Cost is clear before you confirm', body: 'Every step shows its real credit cost upfront, and nothing is ever charged without your explicit confirmation.' },
    { icon: '🚀', title: 'Ready to start?', body: "Hit start and tell us your first idea — we're here if you need any help along the way." },
  ];
  const s = steps[step];
  const isLast = step === steps.length - 1;

  const finish = () => { localStorage.setItem('onboarding_tour_shown', 'true'); onDone?.(); };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 20, backdropFilter: 'blur(8px)', opacity: visible ? 1 : 0, transition: 'opacity 0.3s' }}>
      <div style={{ background: '#09090f', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 24, padding: '36px 32px', width: '100%', maxWidth: 460, boxShadow: '0 32px 80px rgba(0,0,0,0.8)', transform: visible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(16px)', transition: 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)', direction: isAr ? 'rtl' : 'ltr', textAlign: isAr ? 'right' : 'left' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>{s.icon}</div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 10px' }}>{s.title}</h2>
          <p style={{ fontSize: 14, color: '#d1d5db', lineHeight: 1.8, margin: 0 }}>{s.body}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i === step ? '#7c6af7' : 'rgba(255,255,255,0.15)', transition: 'all 0.3s' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {!isLast && (
            <button onClick={finish} style={{ flex: 1, padding: '13px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              {isAr ? 'تخطي' : 'Skip'}
            </button>
          )}
          <button onClick={() => (isLast ? finish() : setStep(v => v + 1))} style={{ flex: 2, padding: '13px', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,106,247,0.4)' }}>
            {isLast ? (isAr ? 'ابدأ ←' : 'Start →') : (isAr ? 'التالي' : 'Next')}
          </button>
        </div>
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
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, display: 'flex', gap: 8 }}>
        <Cookie size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>{isAr
          ? 'بنستخدم كوكيز أساسية وتحليلية عشان نحسّن تجربتك ونفهم استخدام الموقع. استمرارك في الاستخدام يعني موافقتك.'
          : 'We use essential and analytics cookies to improve your experience and understand site usage. By continuing, you agree to this.'}</span>
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

// ✅ NEW (طلب العميل: "بعد الاسئلة وقبل الدخول على صفحة الاسعار يكون شعار erivion موجود
// ويعمل حركة انيميشن حلوة وبعد كده يفتح صفحة الاسعار"): شاشة انتقال قصيرة بشعار متحرك بين
// نهاية أسئلة الـonboarding في AuthPage وفتح PricingPage — كانت قبل كده قفزة فورية من غير
// أي انتقال خالص
// ✅ FIX (طلب العميل: "حجمه كبير مناسب للكومبيوتر والهاتف ويتحرك بانيميشن") — كان اللوجو
// صغير بمقاس ثابت (76px) بصرف النظر عن حجم الشاشة، وبعد الدخول الأولي كانت الحركة بتوقف
// (glow بس بيفضل، مفيش حركة حقيقية مستمرة). دلوقتي المقاس بيكبر مع الشاشة (clamp) وفيه
// حركة عوم مستمرة (float) طول ما الشاشة دي ظاهرة، مش لحظة دخول بس
function LogoTransition({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1700);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }}>
      <style>{`
        @keyframes logoTransIn { 0% { opacity: 0; transform: scale(0.6) rotate(-8deg); } 60% { opacity: 1; transform: scale(1.1) rotate(2deg); } 100% { opacity: 1; transform: scale(1) rotate(0deg); } }
        @keyframes logoTransFloat { 0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 0 30px rgba(124,106,247,0.35); } 50% { transform: translateY(-10px) scale(1.04); box-shadow: 0 0 60px rgba(124,106,247,0.65); } }
        @keyframes logoTransFade { 0% { opacity: 0; transform: translateY(8px); } 100% { opacity: 1; transform: translateY(0); } }
        .logo-trans-badge { animation: logoTransIn 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards, logoTransFloat 2.2s ease-in-out infinite 0.55s; }
        .logo-trans-text { animation: logoTransFade 0.4s ease forwards; animation-delay: 0.5s; opacity: 0; }
      `}</style>
      <div style={{ textAlign: 'center' }}>
        <div className="logo-trans-badge" style={{ width: 'clamp(76px, 14vw, 150px)', height: 'clamp(76px, 14vw, 150px)', borderRadius: '28%', background: 'linear-gradient(135deg,#7c6af7,#a08ff8)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto clamp(18px, 2.5vw, 28px)' }}>
          <img src={LOGO} alt="Erivion" style={{ width: '55%', height: '55%', objectFit: 'contain' }} />
        </div>
        <div className="logo-trans-text" style={{ fontSize: 'clamp(15px, 2vw, 22px)', fontWeight: 700, color: 'var(--text2)', letterSpacing: '0.02em' }}>Erivion</div>
      </div>
    </div>
  );
}

export default function App() {
  // ✅ NEW (Projects workspace redesign): الداشبورد بقت أول حاجة تظهر بعد تسجيل الدخول
  // بدل الشات مباشرة — كل مشروع هيبقى مساحة عمل مستقلة، والايجنت بيتفتح جوه مشروع مختار
  const [page, setPage] = useState('dashboard');
  const [activeProject, setActiveProject] = useState(null);
  // ✅ NEW (طلب العميل: "صفحة الدعم لازم تبقى نافذة جانبية"): الدعم بقى panel جانبي بدل صفحة كاملة
  const [showSupportPanel, setShowSupportPanel] = useState(false);
  const [formData, setFormData] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [showVideos, setShowVideos] = useState(false);
  const [credits, setCredits] = useState(null);
  const [showPricing, setShowPricing] = useState(false);
  const [showLogoTransition, setShowLogoTransition] = useState(false);
  const [userPlan, setUserPlan] = useState('free');
  const [planSelected, setPlanSelected] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [blogPostId, setBlogPostId] = useState(null);
  const [teamInviteToken, setTeamInviteToken] = useState(null);
  const [resetToken, setResetToken] = useState(null);
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
  // ✅ NEW (طلب العميل: "onboarding تفاعلي لأول مرة" — جزء من "إيه الناقص عشان نبقى زي
  // المواقع الكبيرة"): جولة ترحيبية قصيرة (4 خطوات) تظهر مرة واحدة بس لكل متصفح، أول ما
  // العميل يدخل تجربة المنتج الحقيقية (بعد تسجيل الدخول) — نفس نمط "welcome_shown_" الموجود
  // بالفعل لكل موديل، بس مرة واحدة عامة للمنتج ككل مش لموديل بعينه
  const [showWelcomeTour, setShowWelcomeTour] = useState(false);
  useEffect(() => {
    if (user && localStorage.getItem('onboarding_tour_shown') !== 'true') {
      setShowWelcomeTour(true);
    }
  }, [user]);

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
        // ✅ FIX (طلب العميل: زرار الرجوع من أي صفحة لازم يرجع لصفحة المشاريع، مش الموديلات):
        // ده مؤثر بس على المستخدم المسجل دخوله (اللي مش مسجل بيشوف LandingPage دايمًا بصرف
        // النظر عن page — راجع "if (!user) return <LandingPage/>" تحت)، فتغييره هنا آمن تمامًا
        setPage('dashboard');
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
    if (window.location.pathname === '/reset-password') {
      setResetToken(params.get('token') || null);
      setShowAuth(true);
      setAuthChecked(true); return;
    }
    if (window.location.pathname === '/terms') { window.history.replaceState({}, '', '/terms'); setPage('terms'); setAuthChecked(true); return; }
    if (window.location.pathname === '/privacy') { window.history.replaceState({}, '', '/privacy'); setPage('privacy'); setAuthChecked(true); return; }
    if (window.location.pathname === '/refund') { window.history.replaceState({}, '', '/refund'); setPage('refund'); setAuthChecked(true); return; }
    if (window.location.pathname === '/about') { setPage('about'); setAuthChecked(true); return; }
    if (window.location.pathname === '/support') { setPage('support'); setAuthChecked(true); return; }
    if (window.location.pathname === '/faq') { setPage('faq'); setAuthChecked(true); return; }
    if (window.location.pathname === '/templates') { setPage('templates'); setAuthChecked(true); return; }
    if (window.location.pathname === '/courses') { setPage('courses'); setAuthChecked(true); return; }
    if (window.location.pathname === '/changelog') { setPage('changelog'); setAuthChecked(true); return; }
    if (window.location.pathname === '/roadmap') { setPage('roadmap'); setAuthChecked(true); return; }
    if (window.location.pathname === '/status') { setPage('status'); setAuthChecked(true); return; }
    if (window.location.pathname === '/api-docs') { setPage('api-docs'); setAuthChecked(true); return; }
    if (window.location.pathname === '/blog') { setAuthChecked(true); return; }
    const blogMatch = window.location.pathname.match(/^\/blog\/([a-z0-9-]+)$/);
    if (blogMatch) { setBlogPostId(blogMatch[1]); setAuthChecked(true); return; }
    const teamInviteMatch = window.location.pathname.match(/^\/team-invite\/([A-Za-z0-9_-]+)$/);
    if (teamInviteMatch) {
      setTeamInviteToken(teamInviteMatch[1]);
      const tiToken = localStorage.getItem('token');
      const tiEmail = localStorage.getItem('email');
      if (tiToken && tiEmail) {
        setUser({ token: tiToken, email: tiEmail });
        setUserPlan(localStorage.getItem('plan') || 'free');
        setPlanSelected(localStorage.getItem('planSelected') === 'true');
      }
      setAuthChecked(true); return;
    }
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
    const KNOWN_PATHS = ['/', '/login', '/reset-password', '/terms', '/privacy', '/refund', '/about', '/support', '/faq', '/templates', '/courses', '/changelog', '/roadmap', '/status', '/api-docs', '/blog', '/affiliate', '/community', '/pricing', '/model1', '/model2', '/model3', '/model4', '/model5', '/cinematic'];
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
        // ✅ NEW (طلب العميل: رسالة ترحيبية توديه لصفحة الكورسات لأي حد يسجل جديد): نفس
        // الفلاج المستخدم في AuthPage.jsx's handleVerify (تسجيل إيميل+باسورد)، هنا لمسار
        // جوجل الجديد بالظبط
        localStorage.setItem('erivion_show_courses_welcome', '1');
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
      case 'dashboard': setPage('dashboard'); break;
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
      case 'support':    setShowSupportPanel(true); break;
      case 'about':      setPage('about'); break;
      case 'faq':        setPage('faq'); break;
      case 'howto':      setPage('howto'); break;
      case 'templates':  setPage('templates'); break;
      case 'courses':    setPage('courses'); break;
      case 'changelog':  setPage('changelog'); break;
      case 'roadmap':    setPage('roadmap'); break;
      case 'status':     setPage('status'); break;
      case 'api-docs':   setPage('api-docs'); break;
      case 'stats':      setPage('stats'); break;
      case 'team':       setPage('team'); break;
      case 'channels':   setPage('channels'); break;
      case 'whiteboard': setPage('whiteboard'); break;
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
    if (showAuth) return <AuthPage googlePendingData={googlePendingData} resetToken={resetToken} onAuth={(data) => {
      localStorage.setItem('token', data.token); localStorage.setItem('email', data.email); localStorage.setItem('plan', data.plan || 'free');
      setUser({ token: data.token, email: data.email }); setUserPlan(data.plan || 'free'); setShowAuth(false); setGooglePendingData(null);
      // ✅ FIX (طلب العميل: "الغي الموضوع بتاع اني ارجع لصفحة الموديلات خالص — الرجوع للمشاريع"):
      // لو page كان لسه فاضل على قيمة قديمة من قبل تسجيل الدخول (مثلاً الزائر كان داخل صفحة
      // موديل معينة قبل ما يسجل)، أول ما يخلص التسجيل لازم يبدأ من صفحة المشاريع دايمًا
      setPage('dashboard');
      const planChosenBefore = localStorage.getItem('planSelected') === 'true';
      if (!planChosenBefore) setShowLogoTransition(true);
    }} onBrowseCourses={() => { setShowAuth(false); setPage('courses'); }} />;
    if (blogPostId) return <BlogPostPage postId={blogPostId} onBack={() => setBlogPostId(null)} />;
    if (teamInviteToken) return <TeamInvitePage token={teamInviteToken} isLoggedIn={false} onRequireLogin={() => setShowAuth(true)} userRegion={userRegion} />;
    if (page === 'community') return <CommunityPage onBack={() => setPage('input')} user={null} onNavigate={(k) => { if(k==='auth') setShowAuth(true); else if(k==='community') {} else setShowAuth(true); }} />;
    // ✅ FIX: صفحة الدعم أصلاً بتشتغل من غير تسجيل دخول (فورم اسم+إيميل بسيطة)، فلازم تبقى
    // استثناء زي الكوميونيتي بالظبط — قبل الفيكس ده، أي زائر مش مسجل دخول (زي عميل بيدوس على
    // رابط الشات من الإيميل من متصفح تاني) كان بيترجعله اللاندنج بيدج بدل الشات مباشرة
    if (page === 'support') return <SupportPage onBack={() => setPage('input')} onNavigate={(k) => { if(k==='community') setPage(k); else setShowAuth(true); }} />;
    // ✅ NEW (طلب العميل: لينك لصفحة الكورسات من اللاندنج بيدج/تسجيل الدخول): كتالوج الكورسات
    // نفسه متاح من غير تسجيل دخول أصلاً في الباك إند (/api/courses بلا Authorization header) —
    // نفس استثناء الكوميونيتي/الدعم فوق، عشان زائر مش مسجل دخول يقدر يتصفح الكورسات المتاحة
    // مباشرة (فتح تفاصيل كورس مقفول لسه بيطلب تسجيل دخول من جوه الصفحة نفسها)
    if (page === 'courses') return <CoursesPage onBack={() => setPage('input')} onNavigate={(k) => { if(k==='support'||k==='community'||k==='courses'||k==='changelog'||k==='roadmap'||k==='status'||k==='api-docs') setPage(k); else setShowAuth(true); }} userRegion={userRegion} />;
    // ✅ NEW (طلب العميل: صفحة "إيه الجديد" عامة زي الكورسات — تعرض التزامنا المستمر بتطوير
    // المنتج حتى لزائر مش مسجل دخول لسه)
    if (page === 'changelog') return <ChangelogPage onBack={() => setPage('input')} userRegion={userRegion} />;
    if (page === 'roadmap') return <RoadmapPage onBack={() => setPage('input')} userRegion={userRegion} isLoggedIn={false} onRequireLogin={() => setShowAuth(true)} />;
    if (page === 'status') return <StatusPage onBack={() => setPage('input')} userRegion={userRegion} />;
    if (page === 'api-docs') return <ApiDocsPage onBack={() => setPage('input')} userRegion={userRegion} onNavigate={() => setShowAuth(true)} />;
    return <LandingPage onGetStarted={() => setShowAuth(true)} onOpenBlog={(id) => setBlogPostId(id)} onNavigate={(k) => { if(k==='support'||k==='community'||k==='courses'||k==='changelog'||k==='roadmap'||k==='status'||k==='api-docs') setPage(k); else setShowAuth(true); }} />;
  }

  if (showAuth) return <AuthPage resetToken={resetToken} onAuth={(data) => {
    localStorage.setItem('token', data.token); localStorage.setItem('email', data.email); localStorage.setItem('plan', data.plan || 'free');
    setUser({ token: data.token, email: data.email }); setUserPlan(data.plan || 'free'); setShowAuth(false);
    // ✅ FIX (نفس الفيكس فوق): يضمن إن أي جلسة تسجيل دخول تبدأ من صفحة المشاريع دايمًا
    setPage('dashboard');
    const planChosenBefore = localStorage.getItem('planSelected') === 'true';
    if (!planChosenBefore) setShowLogoTransition(true);
  }} />;

  if (showLogoTransition) return <LogoTransition onDone={() => { setShowLogoTransition(false); setShowPricing(true); }} />;

  if (showPricing) return <PricingPage
    currentPlan={userPlan}
    onSelectPlan={(plan) => {
      setUserPlan(plan); setShowPricing(false); setPlanSelected(true);
      localStorage.setItem('plan', plan); localStorage.setItem('planSelected', 'true');
      fetchCredits();
      // ✅ FIX (طلب العميل): تأكيد إضافي إن اختيار باقة (مش بس Skip) بيودّي لصفحة المشاريع برضو
      setPage('dashboard');
      if (window.location.pathname === '/pricing') window.history.pushState({}, '', '/');
    }}
    onSkip={() => {
      setShowPricing(false); setPlanSelected(true); localStorage.setItem('planSelected', 'true');
      // ✅ FIX (طلب العميل: "دوست skip من صفحة الاسعار دخلني على الموديلات... الرجوع يكون
      // للمشاريع"): تأكيد إضافي هنا كمان (مش بس في onAuth) يضمن إن Skip يودّي للمشاريع دايمًا
      setPage('dashboard');
      if (window.location.pathname === '/pricing') window.history.pushState({}, '', '/');
    }}
    onNavigate={handleNavigate}
    onRegionSelect={(r) => setUserRegion(r)}
  />;

  if (teamInviteToken) return <TeamInvitePage
    token={teamInviteToken}
    isLoggedIn={true}
    currentUserEmail={user.email}
    onAccepted={() => { setTeamInviteToken(null); window.history.replaceState({}, '', '/'); setPage('team'); }}
    userRegion={userRegion}
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

  const Header = () => (
    <header className="app-header" style={{ gap:8, zIndex:10000 }}>
      {/* ✅ NEW (طلب العميل: حذف الشريط العلوي بالكامل ونقل كل حاجة لليوز منيو): الشريط
          العلوي بقى شعار بس + كريديت/إشعارات/يوز منيو — كل روابط التنقل (Home/Pricing/
          Templates/Courses/Community/About/Support/Affiliate) بقت جوه اليوز منيو نفسه
          (قسم "NAVIGATE") على كل أحجام الشاشات، مش الموبايل بس زي ما كانت */}
      <style>{`
        @media(max-width:640px){
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

      {/* Right side */}
      <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0, marginLeft:'auto' }}>

        {/* ✅ FIX (طلب العميل: "لازم يكون في علامة تقول انا على خطة اي" — مكانتش ظاهرة غير جوه
            المنيو بعد فتحها): بادچ صغير باسم الخطة الحقيقي، ظاهر دايمًا في الهيدر نفسه من غير
            ما يفتح حد المنيو أصلاً — نفس ألوان/تسميات PLAN_META المستخدمة في المنيو بالظبط */}
        {(() => {
          const headerPlanMeta = PLAN_META[userPlan] || PLAN_META.free;
          return (
            <div title={`${headerPlanMeta.label} Plan`}
              style={{ display:'flex', alignItems:'center', gap:5, background:`${headerPlanMeta.color}18`, border:`1px solid ${headerPlanMeta.color}44`, borderRadius:8, padding:'5px 10px' }}>
              <headerPlanMeta.Icon size={11} color={headerPlanMeta.color} strokeWidth={2.5} />
              <span style={{ fontSize:11, fontWeight:700, color:headerPlanMeta.color }}>{headerPlanMeta.label}</span>
            </div>
          );
        })()}

        {/* رصيد الكريديت الموحد — عداد واحد بس. مبيظهرش للمستخدمين "free" خالص (اتلغى الفري
            تريال) — بيظهر بس للمشتركين (plan !== 'free') عشان يشوفوا رصيدهم. */}
        {credits && userPlan !== 'free' && (
          <button onClick={fetchCredits} title="Click to refresh" className="header-credits header-credits-full"
            style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(124,106,247,0.08)', border:'1px solid rgba(124,106,247,0.25)', borderRadius:8, padding:'5px 12px', cursor:'pointer', transition:'all 0.15s' }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(124,106,247,0.14)'}
            onMouseLeave={e=>e.currentTarget.style.background='rgba(124,106,247,0.08)'}>
            <span style={{ fontSize:13, fontWeight:700, color:'#a99bff' }}>{(credits.credits_balance ?? 0).toLocaleString()}</span>
            <span style={{ fontSize:10, color:'var(--text3)' }}>credits</span>
          </button>
        )}

        {user?.token && <NotificationBell token={user.token} />}

        <UserMenu user={user} plan={userPlan} credits={credits} onLogout={handleLogout} onNavigate={handleNavigate}
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
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <Bot size={15} strokeWidth={2} /> Agent
        </button>
      )}

      {/* App-level modals — rendered outside header to avoid overflow issues */}
      {showHowToModal && <HowToModal onClose={() => setShowHowToModal(false)} />}
      <SidePanel open={showSupportPanel} onClose={() => setShowSupportPanel(false)} title="Support">
        <SupportPage embedded onNavigate={(k) => { setShowSupportPanel(false); handleNavigate(k); }} />
      </SidePanel>
      {showAffiliateModal && <AffiliateModal user={user} onClose={() => setShowAffiliateModal(false)} onNavigateAffiliate={() => { setShowAffiliateModal(false); handleNavigate('affiliate'); }} />}

      {/* First-time onboarding tour — once per browser, right after login */}
      {showWelcomeTour && (
        <WelcomeTourModal userRegion={userRegion} onDone={() => setShowWelcomeTour(false)} />
      )}

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
        {page === 'dashboard' && <div key="dashboard" className="workspace-transition"><ProjectsDashboardPage lang={(userRegion || localStorage.getItem('erivion_region') || 'eg') === 'eg' ? 'ar' : 'en'} onOpenProject={(project) => { setActiveProject(project); setPage('agent'); }} onNavigate={handleNavigate} /></div>}
        {page === 'agent' && <div key={`agent-${activeProject?.id || 'none'}`} className="workspace-transition"><AgentPage onNavigate={handleNavigate} onSwitchToModels={() => setPage('input')} activeProject={activeProject} /></div>}
        {page === 'input' && <InputPage
          onSubmit={(data) => {
            if (data.videoType === 'model3') { setPage('model3'); return; }
            if (data.videoType === 'model4') { setPage('model4'); return; }
            if (data.videoType === 'model8') { setPage('model8'); return; }
            if (data.videoType === 'model5') { setPage('model5'); return; }
            if (data.videoType === 'model6') { setFormData(data); setPage('model6'); return; }
            if (data.videoType === 'model7') { setPage('model7'); return; }
            if (data.videoType === 'whiteboard') { setPage('whiteboard'); return; }
            // model1 / model2 — show welcome modal
            const modelKey = data.videoType === 'model2' ? 'model2' : 'model1';
            goToModelWithWelcome(modelKey, () => { setFormData(data); setPage('scenes'); });
          }}
          model3Access={model3Access} model4Access={model4Access} model5Access={model5Access}
          userPlan={userPlan} credits={credits} onNavigate={handleNavigate}
        />}
        {page === 'model3' && <Model3Page onBack={() => setPage('dashboard')} model3Plan={model3Plan} model3Access={model3Access} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model4' && <Model4Page onBack={() => { setPage('dashboard'); fetchCredits(); }} model4Plan={model4Plan} model4Access={model4Access} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model8' && <Model8Page onBack={() => { setPage('dashboard'); fetchCredits(); }} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model5' && <ModelCinematicPage onBack={() => { setPage('dashboard'); fetchCredits(); }} model5Plan={model5Plan} model5Access={model5Access} userPlan={userPlan} onNavigate={handleNavigate} />}
        {page === 'model6' && <MapVideoPage formData={formData} onBack={() => setPage('dashboard')} />}
        {page === 'model7' && <ModelErivionPage onBack={() => { setPage('dashboard'); fetchCredits(); }} erivionPlan={erivionPlan} erivionAccess={erivionAccess} onNavigate={handleNavigate} />}
        {page === 'whiteboard' && <WhiteboardVideoPage region={userRegion || localStorage.getItem('erivion_region') || 'intl'} onBack={() => setPage('dashboard')} onNavigate={handleNavigate} />}
        {page === 'affiliate' && <AffiliatePage onBack={() => { setPage('dashboard'); window.history.pushState({}, '', '/'); }} />}
        {page === 'settings' && <SettingsPage onBack={() => setPage('dashboard')} user={user} onNavigate={handleNavigate} />}
        {page === 'templates' && <TemplatesPage onNavigate={handleNavigate} userRegion={userRegion} />}
        {page === 'courses' && <CoursesPage onBack={() => setPage('dashboard')} onNavigate={handleNavigate} userRegion={userRegion} />}
        {page === 'changelog' && <ChangelogPage onBack={() => setPage('dashboard')} userRegion={userRegion} />}
        {page === 'roadmap' && <RoadmapPage onBack={() => setPage('dashboard')} userRegion={userRegion} isLoggedIn={true} />}
        {page === 'status' && <StatusPage onBack={() => setPage('dashboard')} userRegion={userRegion} />}
        {page === 'api-docs' && <ApiDocsPage onBack={() => setPage('dashboard')} userRegion={userRegion} onNavigate={handleNavigate} />}
        {page === 'stats' && <StatsPage onBack={() => setPage('dashboard')} userRegion={userRegion} />}
        {page === 'team' && <TeamPage onBack={() => setPage('dashboard')} userRegion={userRegion} />}
        {page === 'channels' && <ChannelsPage onBack={() => setPage('dashboard')} userRegion={userRegion} />}
        {['terms','privacy','about','refund','howto'].includes(page) && <SubPage page={page} onBack={() => setPage('dashboard')} />}
        {page === 'community' && <CommunityPage onBack={() => setPage('dashboard')} user={user} onNavigate={handleNavigate} />}
        {page === 'faq' && <FAQPage onBack={() => setPage('dashboard')} onNavigate={handleNavigate} />}
        {page === 'notfound' && <NotFoundPage onNavigate={handleNavigate} />}
      </div>
      <CookieConsentBanner />
    </>
  );
}