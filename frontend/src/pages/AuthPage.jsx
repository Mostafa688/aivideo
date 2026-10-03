import React, { useState, useEffect, useRef } from 'react';
import { TERMS_EN, PRIVACY_EN, TERMS_VERSION } from '../data/legalContent.js';
import LegalNotice from '../components/LegalNotice.jsx';

// التنبيه الأحمر مخفي مؤقتًا في صفحة تسجيل الدخول (شاشة الموافقة ونوافذ الشروط/الخصوصية) لحد ما الموقع يتسجّل — غيّرها لـtrue لإظهاره
const SHOW_AUTH_NOTICE = false;
import {
  ClipboardList, Check, Users, Search, Camera, Music, Play, Sparkles, Globe,
  GraduationCap, BookOpen, Megaphone, Drama, ImageIcon, Bot, Clapperboard,
  Gift, Coins, Gem, Target, Map, Mail,
} from 'lucide-react';

const LOGO = 'https://i.ibb.co/xK4Sq6fP/Chat-GPT-Image-19-2026-09-08-47-Photoroom.png';

// ✅ NEW: كاروسيل فيديوهات صفحة اللوجين — بيتبادل بين فيديوهين، وبينهم أنيميشن تحميل باللوجو.
// شغال بس على الديسكتوب لأنه جوه .auth-branding اللي أصلاً بيتخفي على الموبايل (مفيش مكان له هناك).
const SHOWCASE_VIDEOS = [
  { url: 'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/202608042037.mp4', prompt: 'A hooded warrior battles a colossal shadow beast, cinematic Hollywood action, photorealistic, 8K.' },
  { url: 'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/video_1778958974987.mp4', prompt: 'An explorer was born in his tomb and discovered a huge treasure' },
];

function LoginVideoCarousel() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState('loading'); // 'loading' | 'playing'
  // ✅ FIX (طلب العميل: "خلي صوتها شغال لانه مقفول"): المتصفحات بترفض autoplay لفيديو غير
  // مكتوم خالص (ده مش باج عندنا، سياسة أمان في كل المتصفحات) — فبنسيب autoplay مكتوم زي ما
  // هو (عشان يفضل يشتغل لوحده من غير ما يحتاج ضغطة أول)، وبنضيف زرار صوت واضح يقدر يفعّله
  // بنفسه لو عايز يسمع البرومبت
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (phase !== 'loading') return;
    const t = setTimeout(() => setPhase('playing'), 1500);
    return () => clearTimeout(t);
  }, [phase, index]);

  const handleEnded = () => {
    setPhase('loading');
    setIndex(i => (i + 1) % SHOWCASE_VIDEOS.length);
  };

  const current = SHOWCASE_VIDEOS[index];

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{
        // ✅ FIX (طلب العميل: "كبر حجم الفيديوهات... لانها صغيره"): 380px → أكبر بكتير ومتجاوب
        // (clamp بيكبر مع عرض الشاشة لحد سقف معقول، بدل رقم ثابت صغير)
        position: 'relative', width: '100%', maxWidth: 'clamp(380px, 34vw, 620px)', aspectRatio: '16/9', margin: '0 auto',
        borderRadius: 18, overflow: 'hidden', background: '#0a0a14',
        border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
      }}>
        {phase === 'loading' ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div className="login-carousel-logo" style={{
              width: 52, height: 52, borderRadius: 15,
              background: 'linear-gradient(135deg,#7c6af7,#a08ff8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 24px rgba(124,106,247,0.5)',
            }}>
              <img src={LOGO} alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Generating with Erivion...
            </div>
          </div>
        ) : (
          <>
            <video
              key={current.url}
              src={current.url}
              autoPlay
              muted={muted}
              playsInline
              onEnded={handleEnded}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <button
              onClick={() => setMuted(m => !m)}
              title={muted ? 'Unmute' : 'Mute'}
              style={{
                position: 'absolute', bottom: 10, insetInlineEnd: 10, width: 32, height: 32, borderRadius: 10,
                background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15,
              }}
            >{muted ? '🔇' : '🔊'}</button>
          </>
        )}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, fontStyle: 'italic', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        "{current.prompt}"
      </div>
      <style>{`
        @keyframes loginCarouselLogoPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        .login-carousel-logo { animation: loginCarouselLogoPulse 1.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

// ─── Section helper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent2)', marginBottom: 6 }}>{title}</h3>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.8, margin: 0 }}>{children}</p>
    </div>
  );
}

// ─── Terms Agreement Step ─────────────────────────────────────────────────────
function TermsStep({ onAgree }) {
  const [scrolled, setScrolled] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [visible, setVisible] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleScroll = (e) => {
    const el = e.target;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setScrolled(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      backdropFilter: 'blur(8px)',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.4s ease',
    }}>
      <div style={{
        background: 'var(--bg)',
        border: '1px solid rgba(124,106,247,0.3)',
        borderRadius: 20,
        width: '100%', maxWidth: 600,
        display: 'flex', flexDirection: 'column',
        maxHeight: '88vh',
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,106,247,0.1)',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.97)',
        transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(124,106,247,0.08) 0%, transparent 60%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #7c6af7, #a08ff8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', boxShadow: '0 4px 14px rgba(124,106,247,0.4)',
            }}><ClipboardList size={18} strokeWidth={1.75} /></div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.3px' }}>Terms of Service</h2>
              <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Please read and agree before continuing</p>
            </div>
          </div>
          {!scrolled && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.2)',
              fontSize: 12, color: 'var(--accent2)', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>↓</span> Scroll to the bottom to enable the agree button
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div ref={scrollRef} onScroll={handleScroll} style={{
          overflowY: 'auto', flex: 1,
          padding: '24px 28px',
          display: 'flex', flexDirection: 'column', gap: 20,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(124,106,247,0.3) transparent',
        }}>
          {SHOW_AUTH_NOTICE && <LegalNotice lang="both" />}
          {TERMS_EN.map(s => <Section key={s.title} title={s.title}>{s.body}</Section>)}
          <div style={{ height: 8 }} />
        </div>

        {/* Footer */}
        <div style={{ padding: '20px 28px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 12, cursor: scrolled ? 'pointer' : 'not-allowed',
            marginBottom: 16, opacity: scrolled ? 1 : 0.5, transition: 'opacity 0.3s',
          }}>
            <div
              onClick={() => scrolled && setAgreed(a => !a)}
              style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${agreed ? '#7c6af7' : 'var(--border)'}`,
                background: agreed ? '#7c6af7' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                boxShadow: agreed ? '0 0 0 4px rgba(124,106,247,0.2)' : 'none',
              }}
            >
              {agreed && <Check size={13} strokeWidth={3} color="#fff" />}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              I have read and agree to the <strong style={{ color: 'var(--accent2)' }}>Terms of Service</strong> and <strong style={{ color: 'var(--accent2)' }}>Privacy Policy</strong>. I understand that generating sexually explicit, racist, or violent/harmful content will result in immediate account termination.
            </span>
          </label>

          <button
            onClick={() => agreed && onAgree()}
            disabled={!agreed}
            style={{
              width: '100%', padding: '13px',
              background: agreed ? 'linear-gradient(135deg, #7c6af7, #a08ff8)' : 'var(--bg2)',
              color: agreed ? '#fff' : 'var(--text3)',
              border: agreed ? 'none' : '1px solid var(--border)',
              borderRadius: 12, fontWeight: 700, fontSize: 15,
              cursor: agreed ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
              boxShadow: agreed ? '0 4px 20px rgba(124,106,247,0.4)' : 'none',
              transform: agreed ? 'scale(1)' : 'scale(0.99)',
            }}
          >
            {agreed ? 'I Agree & Continue →' : 'Read the terms above to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Referral Survey Step ─────────────────────────────────────────────────────
const SOURCES = [
  { id: 'facebook',  label: 'Facebook',  icon: Users, color: '#1877f2' },
  { id: 'google',    label: 'Google',    icon: Search, color: '#4285f4' },
  { id: 'instagram', label: 'Instagram', icon: Camera, color: '#e1306c' },
  { id: 'tiktok',    label: 'TikTok',    icon: Music, color: '#69c9d0' },
  { id: 'youtube',   label: 'YouTube',   icon: Play,  color: '#ff0000' },
  { id: 'friend',    label: 'A Friend',  icon: Users, color: '#22c55e' },
  { id: 'other',     label: 'Other',     icon: Sparkles, color: '#9ca3af' },
];

function SurveyStep({ onContinue }) {
  const [selected, setSelected] = useState(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
      backdropFilter: 'blur(8px)',
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.35s ease',
    }}>
      <div style={{
        background: 'var(--bg)',
        border: '1px solid rgba(124,106,247,0.25)',
        borderRadius: 24,
        width: '100%', maxWidth: 520,
        padding: '36px 32px',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,106,247,0.08)',
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(28px) scale(0.96)',
        transition: 'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative glow */}
        <div style={{
          position: 'absolute', top: -80, left: '50%', transform: 'translateX(-50%)',
          width: 300, height: 200,
          background: 'radial-gradient(circle, rgba(124,106,247,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Icon & title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, rgba(124,106,247,0.2), rgba(160,143,248,0.1))',
            border: '1px solid rgba(124,106,247,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#a99bff',
            animation: 'bounceIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}><Globe size={28} strokeWidth={1.5} /></div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
            How did you hear about us?
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0, lineHeight: 1.6 }}>
            Help us understand how you found Erivion.
          </p>
        </div>

        {/* Options grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
          {SOURCES.map((src, i) => {
            const isSelected = selected === src.id;
            const isLast = i === SOURCES.length - 1 && SOURCES.length % 2 !== 0;
            return (
              <button
                key={src.id}
                onClick={() => setSelected(src.id)}
                onMouseEnter={() => setHovered(src.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  padding: '14px 16px',
                  borderRadius: 14,
                  border: isSelected ? `2px solid ${src.color}` : '2px solid var(--border)',
                  background: isSelected ? `${src.color}18` : hovered === src.id ? 'var(--bg2)' : 'var(--bg)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'all 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                  transform: isSelected ? 'scale(1.03)' : hovered === src.id ? 'scale(1.01)' : 'scale(1)',
                  boxShadow: isSelected ? `0 4px 16px ${src.color}30` : 'none',
                  animation: `fadeUp 0.4s ease ${i * 0.06}s both`,
                  gridColumn: isLast ? 'span 2' : 'span 1',
                }}
              >
                <src.icon size={19} strokeWidth={2} color={src.color} />
                <span style={{
                  fontSize: 14, fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? 'var(--text)' : 'var(--text2)',
                  transition: 'color 0.2s', flex: 1, textAlign: 'left',
                }}>{src.label}</span>
                {isSelected && (
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: src.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'bounceIn 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards',
                    flexShrink: 0,
                  }}>
                    <Check size={12} strokeWidth={3} color="#fff" />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => selected && onContinue(selected)}
          disabled={!selected}
          style={{
            width: '100%', padding: '14px',
            background: selected ? 'linear-gradient(135deg, #7c6af7, #a08ff8)' : 'var(--bg2)',
            color: selected ? '#fff' : 'var(--text3)',
            border: selected ? 'none' : '1px solid var(--border)',
            borderRadius: 12, fontWeight: 700, fontSize: 15,
            cursor: selected ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
            boxShadow: selected ? '0 4px 20px rgba(124,106,247,0.4)' : 'none',
            transform: selected ? 'scale(1)' : 'scale(0.99)',
            marginBottom: 10,
          }}
        >
          {selected
            ? `Continue with ${SOURCES.find(s => s.id === selected)?.label} →`
            : 'Select an option to continue'}
        </button>
        <button
          onClick={() => onContinue('skipped')}
          style={{
            width: '100%', padding: '10px',
            background: 'transparent', border: 'none',
            color: 'var(--text3)', fontSize: 13, cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => e.target.style.color = 'var(--text2)'}
          onMouseLeave={e => e.target.style.color = 'var(--text3)'}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}


// ─── Legal Modal (for Terms/Privacy links in footer) ──────────────────────────
function LegalModal({ type, onClose }) {
  if (!type) return null;
  const isTerms = type === 'terms';
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{isTerms ? 'Terms of Service' : 'Privacy Policy'}</h2>
          <button onClick={onClose} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text3)', cursor: 'pointer', fontSize: 18, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {isTerms ? (
            <>
              {SHOW_AUTH_NOTICE && <LegalNotice lang="both" />}
              {TERMS_EN.map(s => <Section key={s.title} title={s.title}>{s.body}</Section>)}
            </>
          ) : (
            <>
              {SHOW_AUTH_NOTICE && <LegalNotice lang="both" />}
              {PRIVACY_EN.map(s => <Section key={s.title} title={s.title}>{s.body}</Section>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main AuthPage ────────────────────────────────────────────────────────────
export default function AuthPage({ onAuth, googlePendingData, onBrowseCourses, resetToken }) {
  const [mode, setMode]           = useState('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [code, setCode]           = useState('');
  const [step, setStep]           = useState(googlePendingData ? 'terms' : (resetToken ? 'reset' : 'form'));
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetDone, setResetDone] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  const [pendingAuthData, setPendingAuthData] = useState(googlePendingData || null);

  useEffect(() => {
    // لو البيانات اتبعتت من App.jsx مباشرة، مش محتاجين نشوف الـ URL
    if (googlePendingData) return;

    const params      = new URLSearchParams(window.location.search);
    const googleToken = params.get('google_token');
    const googleEmail = params.get('email');
    const googlePlan  = params.get('plan');
    const googleName  = params.get('name');
    const authError   = params.get('auth_error');

    if (authError) {
      setError('Google sign-in was cancelled. Please try again.');
      window.history.replaceState({}, '', '/');
      return;
    }

    if (googleToken && googleEmail) {
      localStorage.setItem('token', googleToken);
      localStorage.setItem('email', googleEmail);
      localStorage.setItem('plan', googlePlan || 'free');
      window.history.replaceState({}, '', '/');

      const authData = { token: googleToken, email: googleEmail, plan: googlePlan || 'free', name: googleName };
      const termsAccepted = localStorage.getItem('termsAccepted') === 'true';

      if (termsAccepted) {
        // مستخدم قديم — يدخل مباشرة زي التسجيل العادي
        onAuth(authData);
      } else {
        // مستخدم جديد — يعرض Terms ثم Survey ثم Recommend
        setPendingAuthData(authData);
        setStep('terms');
      }
    }
  }, []);

  const handleSubmit = async () => {
    setError(''); setLoading(true);
    try {
      if (mode === 'signup') {
        const res  = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setStep('verify');
      } else {
        const res  = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        localStorage.setItem('token', data.token);
        localStorage.setItem('email', data.email);
        onAuth(data);
      }
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleVerify = async () => {
    setError(''); setLoading(true);
    try {
      const res  = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code, ref_code: localStorage.getItem('erivion_ref') || null }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      localStorage.setItem('token', data.token);
      localStorage.setItem('email', data.email);
      // ✅ NEW (طلب العميل: رسالة ترحيبية توديه لصفحة الكورسات لأي حد يسجل جديد) — بتتقرا
      // في ProjectsDashboardPage.jsx أول ما المستخدم يوصل لصفحة المشاريع بعد التسجيل
      localStorage.setItem('erivion_show_courses_welcome', '1');
      setPendingAuthData(data);
      setStep('terms');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    setError(''); setLoading(true);
    try {
      const res  = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setForgotSent(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleResetPassword = async () => {
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetDone(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const authHeader = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + (pendingAuthData?.token || localStorage.getItem('token')) });

  const handleTermsAgree = () => {
    localStorage.setItem('termsAccepted', 'true');
    // موافقة العميل بتتسجّل في الداتابيز (التاريخ + نسخة الشروط) وبتظهر في صفحة الأدمن
    fetch('/api/auth/accept-terms', { method: 'POST', headers: authHeader(), body: JSON.stringify({ version: TERMS_VERSION }) }).catch(() => {});
    setStep('survey');
  };

  // السؤال الوحيد بعد الشروط: عرفت Erivion منين؟ — وبعدها العميل يدخل مباشرة
  const handleSurveyDone = (source) => {
    if (source !== 'skipped') {
      fetch('/api/auth/referral', { method: 'POST', headers: authHeader(), body: JSON.stringify({ source }) }).catch(() => {});
    }
    localStorage.removeItem('erivion_ref');
    onAuth(pendingAuthData);
  };

  return (
    <>
      {step === 'terms'  && <TermsStep  onAgree={handleTermsAgree} />}
      {step === 'survey' && <SurveyStep onContinue={handleSurveyDone} />}
      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />

      <div style={{ minHeight: '100vh', display: 'flex', background: 'radial-gradient(ellipse at top left, #0d0b1e 0%, #080810 50%, #000 100%)', position: 'relative', overflow: 'hidden' }}>
        {/* Background effects */}
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,106,247,0.16) 0%, transparent 65%)', pointerEvents: 'none', filter: 'blur(60px)', animation: 'float 12s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.1) 0%, transparent 65%)', pointerEvents: 'none', filter: 'blur(40px)', animation: 'float 15s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', top: '40%', right: '30%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(192,132,252,0.08) 0%, transparent 65%)', pointerEvents: 'none', filter: 'blur(30px)', animation: 'float 9s ease-in-out infinite 3s' }} />
        {/* Grid overlay */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(124,106,247,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(124,106,247,0.025) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />
        <div className="scan-line" />

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
          @keyframes fadeUp    { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
          @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
          @keyframes bounceIn  { from{opacity:0;transform:scale(0.5)} to{opacity:1;transform:scale(1)} }
          @keyframes shimmer   { 0%{background-position:-200% center} 100%{background-position:200% center} }
          @keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
          @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
          @keyframes glow      { 0%,100%{opacity:0.5} 50%{opacity:1} }
          @keyframes scanMove  { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }

          .auth-card { animation: fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards; }

          .auth-input {
            background: rgba(255,255,255,0.04) !important;
            border: 1px solid rgba(255,255,255,0.1) !important;
            color: #fff !important;
            border-radius: 12px !important;
            padding: 13px 16px !important;
            font-size: 14px !important;
            font-family: 'Plus Jakarta Sans', sans-serif !important;
            transition: all 0.2s !important;
            width: 100% !important;
          }
          .auth-input::placeholder { color: rgba(255,255,255,0.25) !important; }
          .auth-input:focus {
            border-color: rgba(124,106,247,0.6) !important;
            box-shadow: 0 0 0 3px rgba(124,106,247,0.15), 0 0 20px rgba(124,106,247,0.1) !important;
            outline: none !important;
            background: rgba(124,106,247,0.06) !important;
          }

          .social-btn {
            transition: all 0.25s cubic-bezier(0.16,1,0.3,1) !important;
            background: rgba(255,255,255,0.95) !important;
          }
          .social-btn:hover { transform: translateY(-2px) !important; box-shadow: 0 8px 24px rgba(0,0,0,0.3) !important; }

          .submit-btn {
            transition: all 0.25s cubic-bezier(0.16,1,0.3,1) !important;
            background: linear-gradient(135deg, #7c6af7, #a08ff8) !important;
            box-shadow: 0 4px 20px rgba(124,106,247,0.4) !important;
            position: relative;
            overflow: hidden;
          }
          .submit-btn::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, transparent, rgba(255,255,255,0.1));
            opacity: 0;
            transition: opacity 0.2s;
          }
          .submit-btn:hover:not(:disabled) { transform: translateY(-2px) !important; box-shadow: 0 8px 32px rgba(124,106,247,0.5) !important; }
          .submit-btn:hover::after { opacity: 1; }

          .mode-tab { transition: all 0.2s !important; position: relative; }
          .mode-tab.active::after { content:''; position:absolute; bottom:-1px; left:0; right:0; height:2px; background: linear-gradient(90deg,#7c6af7,#a08ff8); border-radius:2px 2px 0 0; }

          .feat-item { animation: fadeIn 0.5s ease both; }

          .auth-branding { display: flex; }
          .auth-form-panel { width: 100%; max-width: 520px; }

          /* Scanline effect */
          .scan-line {
            position: absolute;
            width: 100%;
            height: 2px;
            background: linear-gradient(90deg, transparent, rgba(124,106,247,0.3), transparent);
            animation: scanMove 6s linear infinite;
            pointer-events: none;
            z-index: 0;
          }

          @media (max-width: 768px) {
            .auth-branding { display: none !important; }
            .auth-form-panel { max-width: 100% !important; padding: 32px 20px !important; justify-content: flex-start !important; padding-top: 48px !important; }
            .auth-card { width: 100% !important; max-width: 100% !important; }
          }
        `}</style>

        {/* ── Left branding panel ───────────────────────────────────────── */}
        <div className="auth-branding" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 56px', borderRight: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 440, animation: 'fadeUp 0.7s ease 0.1s both' }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 56 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#7c6af7,#a08ff8)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(124,106,247,0.4)' }}>
                <img src={LOGO} alt="Erivion" style={{ width: 26, height: 26, objectFit: 'contain' }} />
              </div>
              <span style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px', fontFamily: "'Syne', sans-serif" }}>Erivion</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#7c6af7', background: 'rgba(124,106,247,0.12)', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.08em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>BETA</span>
            </div>

            {/* Headline */}
            <h1 style={{ fontSize: 'clamp(32px, 3vw, 44px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, letterSpacing: '-1.5px', color: '#fff', fontFamily: "'Syne', sans-serif" }}>
              Turn ideas into{' '}
              <span style={{ background: 'linear-gradient(135deg,#7c6af7,#a08ff8,#c084fc,#06b6d4)', backgroundSize: '300% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'gradShift 5s ease infinite' }}>
                stunning videos
              </span>
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, marginBottom: 48, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              AI-powered video creation. Generate professional videos from any idea or script in minutes.
            </p>

            {/* Video showcase carousel */}
            <LoginVideoCarousel />

            {/* Social proof */}
            <div style={{ marginTop: 36, padding: '14px 20px', borderRadius: 12, background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex' }}>
                {['#7c6af7','#06b6d4','#22c55e','#f59e0b'].map((c,i) => <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: '2px solid rgba(0,0,0,0.5)', marginLeft: i > 0 ? -8 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.85)' }}><Users size={13} strokeWidth={2} /></div>)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>10,000+ videos created</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>by creators worldwide</div>
              </div>
            </div>

            {onBrowseCourses && (
              <button onClick={onBrowseCourses} style={{ marginTop: 20, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: "'Plus Jakarta Sans', sans-serif", textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Just want to browse our courses first? →
              </button>
            )}
          </div>
        </div>

        {/* ── Right form panel ──────────────────────────────────────────── */}
        <div className="auth-form-panel" style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 40px', position: 'relative', zIndex: 1 }}>
          <div className="auth-card" style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: '36px 32px', backdropFilter: 'blur(20px)', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

            {/* ── Login / Signup form ── */}
            {step === 'form' && (
              <>
                <div style={{ marginBottom: 28 }}>
                  <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, color: '#fff', fontFamily: "'Syne', sans-serif", letterSpacing: '-0.5px' }}>
                    {mode === 'login' ? 'Welcome back' : 'Get started free'}
                  </h2>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                    {mode === 'login' ? 'Sign in to your Erivion account' : 'Create your account — no credit card required'}
                  </p>
                </div>

                <button className="social-btn" onClick={() => window.location.href = '/api/auth/google'}
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 11, border: '1px solid #e2e2e2', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#3c4043', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text3)' }}>or use email</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                <div style={{ display: 'flex', gap: 4, marginBottom: 18, background: 'var(--bg2)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
                  {['login', 'signup'].map(m => (
                    <button key={m} onClick={() => { setMode(m); setError(''); }}
                      style={{ flex: 1, padding: '8px', borderRadius: 7, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s', background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? '#fff' : 'var(--text3)', boxShadow: mode === m ? '0 2px 8px rgba(124,106,247,0.3)' : 'none' }}>
                      {m === 'login' ? 'Sign In' : 'Sign Up'}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} className="auth-input"
                    style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, transition: 'all 0.15s' }} />
                  <input type="password" placeholder="Password (min. 6 characters)" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} className="auth-input"
                    style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, transition: 'all 0.15s' }} />
                  {mode === 'login' && (
                    <button onClick={() => { setStep('forgot'); setError(''); setForgotSent(false); }}
                      style={{ alignSelf: 'flex-end', background: 'none', border: 'none', padding: 0, marginTop: -2, cursor: 'pointer', fontSize: 12.5, color: 'var(--text3)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                      Forgot password?
                    </button>
                  )}
                </div>

                {error && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}

                <button onClick={handleSubmit} disabled={loading} className="submit-btn"
                  style={{ width: '100%', marginTop: 16, padding: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s', opacity: loading ? 0.7 : 1, boxShadow: '0 2px 12px rgba(124,106,247,0.3)' }}>
                  {loading ? 'Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
                </button>

                <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 18, lineHeight: 1.7 }}>
                  By continuing, you agree to our{' '}
                  <a href="#" onClick={e => { e.preventDefault(); setLegalModal('terms'); }} style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Terms</a>
                  {' '}&amp;{' '}
                  <a href="#" onClick={e => { e.preventDefault(); setLegalModal('privacy'); }} style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Privacy Policy</a>.
                  Sexually explicit, racist, or violent/harmful content is strictly prohibited.
                </p>
</>
            )}

            {/* ── Verify email ── */}
            {step === 'verify' && (
              <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px', background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent2)' }}><Mail size={28} strokeWidth={1.5} /></div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Check your email</h2>
                  <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>We sent a 6-character code to<br /><strong style={{ color: 'var(--accent2)' }}>{email}</strong></p>
                </div>
                <input type="text" placeholder="A1B2C3" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} className="auth-input"
                  style={{ width: '100%', padding: '16px', borderRadius: 12, border: '2px solid var(--border)', background: 'var(--bg2)', color: 'var(--accent)', fontSize: 28, fontWeight: 800, textAlign: 'center', letterSpacing: 12, boxSizing: 'border-box', transition: 'all 0.15s' }} />
                {error && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}
                <button onClick={handleVerify} disabled={loading || code.length !== 6} className="submit-btn"
                  style={{ width: '100%', marginTop: 16, padding: '13px', background: code.length === 6 ? 'var(--accent)' : 'var(--bg3)', color: code.length === 6 ? '#fff' : 'var(--text3)', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: (loading || code.length !== 6) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                  {loading ? 'Verifying...' : 'Verify & Continue →'}
                </button>
                <button onClick={() => { setStep('form'); setError(''); setCode(''); }}
                  style={{ width: '100%', marginTop: 10, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer' }}>
                  ← Back to sign in
                </button>
              </div>
            )}

            {/* ── Forgot password ── */}
            {step === 'forgot' && (
              <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
                {!forgotSent ? (
                  <>
                    <div style={{ marginBottom: 24 }}>
                      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#fff', fontFamily: "'Syne', sans-serif" }}>Reset your password</h2>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>Enter your email and we'll send you a link to reset it.</p>
                    </div>
                    <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleForgotPassword()} className="auth-input"
                      style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }} />
                    {error && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}
                    <button onClick={handleForgotPassword} disabled={loading || !email} className="submit-btn"
                      style={{ width: '100%', marginTop: 16, padding: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                      {loading ? 'Sending...' : 'Send Reset Link →'}
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px', background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent2)' }}><Mail size={28} strokeWidth={1.5} /></div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#fff' }}>Check your email</h2>
                    <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>If an account exists for <strong style={{ color: 'var(--accent2)' }}>{email}</strong>, a reset link is on its way. The link works once and expires in 1 hour.</p>
                  </div>
                )}
                <button onClick={() => { setStep('form'); setError(''); setForgotSent(false); }}
                  style={{ width: '100%', marginTop: 16, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer' }}>
                  ← Back to sign in
                </button>
              </div>
            )}

            {/* ── Reset password (from emailed link) ── */}
            {step === 'reset' && (
              <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
                {!resetDone ? (
                  <>
                    <div style={{ marginBottom: 24 }}>
                      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: '#fff', fontFamily: "'Syne', sans-serif" }}>Set a new password</h2>
                      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Choose a new password for your account.</p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input type="password" placeholder="New password (min. 6 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="auth-input"
                        style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }} />
                      <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleResetPassword()} className="auth-input"
                        style={{ padding: '13px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14 }} />
                    </div>
                    {error && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}
                    <button onClick={handleResetPassword} disabled={loading} className="submit-btn"
                      style={{ width: '100%', marginTop: 16, padding: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
                      {loading ? 'Saving...' : 'Reset Password →'}
                    </button>
                  </>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#fff' }}>Password updated</h2>
                    <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 20 }}>You can now sign in with your new password.</p>
                    <button onClick={() => { window.history.replaceState({}, '', '/'); setMode('login'); setStep('form'); setPassword(''); setError(''); }} className="submit-btn"
                      style={{ width: '100%', padding: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
                      Go to Sign In →
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}