import React, { useState, useEffect } from 'react';
import { AppFooter } from './LandingPage.jsx';
import {
  Target, PenLine, Settings as SettingsIcon, Clapperboard, Sparkles, Flame,
  Smartphone, Lightbulb, Palette, Zap, Gem, CheckCircle2, FileText, Lock,
  DollarSign, Info, LifeBuoy, BookOpen, Clock, Languages,
} from 'lucide-react';
import { TERMS_EN, TERMS_AR, PRIVACY_EN, PRIVACY_AR, ABOUT_EN, ABOUT_AR } from '../data/legalContent.js';

// ✅ NEW: كل Section بقى كارت واضح بحدود خفيفة، ورقم دائري لو العنوان مبدوء بـ "N. " —
// بيتقرا تلقائي من نص العنوان نفسه (زي "1. Acceptance of Terms") من غير ما نلمس أي مكان
// بينادي Section، فكل الصفحات (Terms/Privacy/Refund/About) بتستفيد من الشكل الجديد أوتوماتيك
function Section({ title, children, isHtml }) {
  const match = String(title).match(/^(\d+)\.\s*(.+)$/);
  const num = match ? match[1] : null;
  const heading = match ? match[2] : title;
  const anchorId = 'sec-' + (num || String(heading).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  return (
    <div id={anchorId} style={{
      marginBottom: 14,
      padding: '22px 24px',
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      scrollMarginTop: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {num && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 28, height: 28, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 800,
            flexShrink: 0,
          }}>{num}</span>
        )}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{heading}</h3>
      </div>
      {isHtml
        ? <p style={{ color: 'var(--text2)', fontSize: 14.5, lineHeight: 1.9, margin: 0, whiteSpace: 'pre-line' }} dangerouslySetInnerHTML={{ __html: children }} />
        : <p style={{ color: 'var(--text2)', fontSize: 14.5, lineHeight: 1.9, margin: 0, whiteSpace: 'pre-line' }}>{children}</p>}
    </div>
  );
}

// ✅ NEW: مصفوفة أقسام {title, body} → JSX أقسام + قائمة عناوين للـ TOC/الشريط الجانبي
function renderSections(list) {
  return list.map((s, i) => <Section key={i} title={s.title} isHtml={s.isHtml}>{s.body}</Section>);
}
function tocFromSections(list) {
  return list.map(s => String(s.title).replace(/^\d+\.\s*/, ''));
}

// ✅ NEW: الشريط الجانبي الاحترافي — ثابت (sticky) على الشاشات الكبيرة زي مواقع التوثيق
// الكبيرة، وبيتحول لقائمة أفقية قابلة للسحب على الموبايل (خلاص مفيش شريط جانبي في القراءة
// عليه). بيسلط الضوء على القسم اللي بتتصفحه دلوقتي (IntersectionObserver بسيط)
function SideNav({ items, activeIdx, onJump }) {
  return (
    <nav className="subpage-sidenav">
      <div className="subpage-sidenav-inner">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 4px 10px' }}>
          On this page
        </div>
        {items.map((label, i) => (
          <button key={i} onClick={() => onJump(i + 1)} className={`subpage-sidenav-item${activeIdx === i + 1 ? ' active' : ''}`}>
            <span className="subpage-sidenav-num">{i + 1}</span>
            <span className="subpage-sidenav-label">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

const TERMS_TOC = tocFromSections(TERMS_EN);
const PRIVACY_TOC = tocFromSections(PRIVACY_EN);
const ABOUT_TOC = tocFromSections(ABOUT_EN);
// ✅ FIX: الشريط الجانبي كان دايمًا بالإنجليزي حتى لو المحتوى اتحوّل عربي — نفس الترقيم
// والترتيب في اللغتين، فبس بنختار مصفوفة العناوين المناسبة حسب اللغة الحالية
const TOC_AR_BY_PAGE = {
  terms: tocFromSections(TERMS_AR),
  privacy: tocFromSections(PRIVACY_AR),
  about: tocFromSections(ABOUT_AR),
};

function TermsContent({ lang }) { return <>{renderSections(lang === 'ar' ? TERMS_AR : TERMS_EN)}</>; }
function PrivacyContent({ lang }) { return <>{renderSections(lang === 'ar' ? PRIVACY_AR : PRIVACY_EN)}</>; }

function RefundContent() {
  return <>
    <Section title="Overview">At Erivion, we want you to be satisfied with your purchase. This policy explains the conditions under which refunds are granted.</Section>
    <Section title="Egyptian Users (InstaPay)">You are eligible for a refund only if you request it within 4 hours of your credit purchase being approved. Requests after this 4-hour window are not eligible, except in verified cases of technical failure on our end.</Section>
    <Section title="International Users (Gumroad)">There is currently no refund system available for international purchases. This is temporary while we build out our international payment infrastructure — refunds for international users are coming soon. Verified technical failures on our end are assessed individually via Support.</Section>
    <Section title="How to Request a Refund">All requests must be submitted through the Support page on the platform. Include your account email, the amount/plan purchased, and your reason. We respond within 24 hours.</Section>
    <Section title="Non-Refundable Situations">Refunds are NOT granted for: requests submitted after the 4-hour window; accounts terminated for Terms violations; or dissatisfaction with the quality, style, or output of AI-generated videos — this is not considered a valid refund reason.</Section>
    <Section title="Contact">Use the Support page on the platform or email digidelight33@gmail.com.</Section>
  </>;
}

// ── How to Use Guide ──────────────────────────────────────────────────────────
function HowToUseContent() {
  const steps = [
    {
      icon: Target,
      title: 'قولّي فكرتك في الشات',
      color: '#7c6af7',
      content: 'مفيش موديل تختاره — تفتح مشروع جديد وتقول للايجنت اللي عايزه بشكل طبيعي، وهو بيبني الفيديو معاك:',
      items: [
        { name: 'فكرة حرة', desc: '"اعمل فيديو تحفيزي عن رائد أعمال بدأ بـ500 جنيه وبنى إمبراطورية" — الايجنت هيكتب السكريبت ويختار أفضل موديل صور وفيديو لكل مشهد بنفسه' },
        { name: 'سكريبت جاهز', desc: 'الصق سكريبت كامل (حتى مقسّم مشاهد) وهيحوله لفيديو حقيقي بنفس التقسيم' },
        { name: 'صورة منتج أو شخصية', desc: 'ارفع صورة وقوله "اعمل إعلان للمنتج ده" أو "خلي الشخصية دي تفضل زي ما هي في كل مشاهد الفيديو"' },
        { name: 'صوت مسجل', desc: 'ارفع تسجيل صوتي جاهز وهيتحول لنارريشن حقيقي في الفيديو' },
      ]
    },
    {
      icon: PenLine,
      title: 'اكتب فكرتك بشكل صح',
      color: '#06b6d4',
      content: 'أهم خطوة - كيف تكتب فكرة قوية تطلع فيديو احترافي:',
      items: [
        { name: 'مثال ممتاز', desc: '"فيديو تحفيزي عن رحلة رائد أعمال مصري بدأ بـ500 جنيه وبنى إمبراطورية تجارية في 5 سنين"' },
        { name: 'مثال ممتاز', desc: '"قصة اكتشاف كنز في مقبرة فرعونية - من منظور عالم آثار مصري"' },
        { name: 'مثال ضعيف', desc: '"فيديو عن النجاح" - مبهم جداً' },
        { name: 'مثال ضعيف', desc: '"اعمل فيديو جميل" - مفيش تفاصيل' },
        { name: 'نصيحة', desc: 'كلما كانت الفكرة محددة وفيها تفاصيل، كلما طلع الفيديو أحسن وأكثر احترافية' },
        { name: 'نصيحة', desc: 'اذكر: الشخصية الرئيسية + الحدث + المكان + النتيجة' },
      ]
    },
    {
      icon: SettingsIcon,
      title: 'الايجنت بيسألك في اللي محتاجه بس',
      color: '#f59e0b',
      content: 'مفيش صفحة إعدادات منفصلة — كل حاجة بتتحدد جوه المحادثة نفسها:',
      items: [
        { name: 'اللغة', desc: 'اكتب بأي لغة، والصوت والكابشن هيبقوا بنفس اللغة تلقائيًا' },
        { name: 'مقاس الفيديو', desc: '9:16 للموبايل وتيك توك ورييلز | 16:9 لليوتيوب — الايجنت هيسألك لو مش واضح من طلبك' },
        { name: 'المدة', desc: 'قول المدة اللي عايزها، أو سيبها للايجنت يقترح المناسبة لنوع الفيديو' },
        { name: 'الصوت والكابشن والموسيقى', desc: 'دلوقتي بتتضاف كطبقة بعد ما المشهد يتعمل — قول "عايز نارريشن بصوت كذا" أو "ضيف كابشن وموسيقى" في نفس الطلب' },
      ]
    },
    {
      icon: Clapperboard,
      title: 'الايجنت بيبني الفيديو خطوة بخطوة',
      color: '#22c55e',
      content: 'كل صورة وفيديو بيتولد بيظهر مباشرة في المشروع قدامك:',
      items: [
        { name: 'صورة مرجعية', desc: 'لو عندك شخصية أو منتج لازم يفضل ثابت في كل المشاهد، الايجنت بيعمل صورة مرجعية أول حاجة' },
        { name: 'صور المشاهد', desc: 'بعدها بيولّد صورة كل مشهد لوحده، وممكن تطلب تعديل على أي صورة قبل ما تتحرك' },
        { name: 'تحريك المشهد', desc: 'كل صورة بتتحول فيديو باستخدام أنسب موديل حركة لطبيعة المشهد (حوار، حركة سريعة، مشهد هادي...)' },
        { name: 'دمج المشاهد', desc: 'اطلب من الايجنت يجمع كل الفيديوهات في فيديو واحد نهائي لما تخلص' },
      ]
    },
    {
      icon: Sparkles,
      title: 'عدّل بعد ما يخلص',
      color: '#e11d48',
      content: 'مش محتاج تعمل الفيديو من الأول لو عايز تغيّر حاجة فيه:',
      items: [
        { name: 'تعديل فيديو حقيقي', desc: 'قوله "خلي السما بليل" أو "عدّل الفيديو ده يبقى فيه مطر" — بيعدّل الفيديو الموجود فعليًا، مش يعمل واحد جديد من الصفر' },
        { name: 'تعديل صورة', desc: 'اطلب تعديل على أي صورة قبل ما تتحول فيديو (تغيير لون، تفصيلة، خلفية...)' },
        { name: 'المفضلة', desc: 'اضغط على القلب فوق أي صورة أو فيديو عجبك عشان تلاقيه بسهولة في تاب المفضلة بالمشروع' },
        { name: 'التحميل', desc: 'نزّل أي صورة أو فيديو بجودة كاملة مباشرة من المشروع' },
      ]
    },
  ];

  const tips = [
    { icon: Flame, text: 'ابدأ بفكرة بسيطة وواضحة، وخلي التفاصيل الإضافية (الصوت، الموسيقى، الشخصية) تتضاف تدريجيًا في نفس المحادثة' },
    { icon: Smartphone, text: 'للتيك توك والرييلز دايماً اطلب مقاس 9:16 مع كابشن مفعّل' },
    { icon: Target, text: 'أفضل مدة للمحتوى العربي على السوشيال ميديا: 30 ثانية - دقيقة' },
    { icon: Lightbulb, text: 'عندك شخصية أو منتج هيفضل يتكرر في أكتر من مشهد؟ قول كده من الأول عشان الايجنت يعمل صورة مرجعية له' },
    { icon: Palette, text: 'مش لازم تعرف اسم الموديل — قول اللي عايزه بالظبط والايجنت هيختار الأنسب من كل موديلات الصور والفيديو المتاحة' },
    { icon: Zap, text: 'الكريديت بتاعك ميتصفرش ولا بيتجدد أسبوعيًا - بيفضل معاك لحد ما تستخدمه، وشغال على كل الموديلات' },
  ];

  return (
    <div>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .guide-step { animation: fadeUp 0.4s ease both; }
        .guide-item { transition: all 0.2s; }
        .guide-item:hover { background: rgba(255,255,255,0.04) !important; transform: translateX(4px); }
      `}</style>

      <p style={{ fontSize:15, color:'var(--text2)', lineHeight:1.8, marginBottom:32 }}>
        دليلك الكامل لاستخدام Erivion وإنشاء فيديوهات احترافية في دقائق.
      </p>

      {steps.map((step, i) => (
        <div key={i} className="guide-step" style={{ marginBottom:32, animationDelay:`${i*0.08}s` }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:`${step.color}18`, border:`1px solid ${step.color}33`, display:'flex', alignItems:'center', justifyContent:'center', color: step.color, flexShrink:0 }}>
              <step.icon size={19} strokeWidth={1.75} />
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:step.color, letterSpacing:'0.1em' }}>STEP {i+1}</span>
              </div>
              <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text)', margin:0 }}>{step.title}</h3>
            </div>
          </div>

          <p style={{ fontSize:13, color:'var(--text3)', marginBottom:12, paddingRight:4 }}>{step.content}</p>

          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {step.items.map((item, j) => (
              <div key={j} className="guide-item" style={{ display:'flex', gap:12, padding:'10px 14px', borderRadius:10, background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize:12, fontWeight:700, color:step.color, minWidth:140, flexShrink:0, paddingTop:1 }}>{item.name}</div>
                <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Tips */}
      <div style={{ background:`rgba(124,106,247,0.06)`, border:'1px solid rgba(124,106,247,0.15)', borderRadius:16, padding:20, marginTop:8 }}>
        <h3 style={{ fontSize:15, fontWeight:700, color:'#a78bfa', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}><Gem size={16} strokeWidth={1.75} /> نصائح من فريق Erivion</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {tips.map((tip, i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <tip.icon size={16} strokeWidth={1.75} style={{ flexShrink:0, color:'#a78bfa', marginTop:1 }} />
              <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, margin:0 }}>{tip.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutContent({ lang }) { return <>{renderSections(lang === 'ar' ? ABOUT_AR : ABOUT_EN)}</>; }

function SupportContent() {
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
      setStatus(res.ok ? 'sent' : 'error');
    } catch { setStatus('error'); }
  };

  if (status === 'sent') return (
    <div style={{ textAlign: 'center', padding: '40px 0' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center', color: 'var(--green)' }}><CheckCircle2 size={44} strokeWidth={1.75} /></div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Message Sent!</h3>
      <p style={{ color: 'var(--text3)' }}>We'll get back to you within 24 hours.</p>
    </div>
  );

  return (
    <div>
      <div style={{ background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
        <p style={{ color: '#7c6af7', fontWeight: 600, fontSize: 14, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6 }}><Lightbulb size={15} strokeWidth={2} /> Refund & Cancellation Requests</p>
        <p style={{ color: 'var(--text2)', fontSize: 13, margin: 0, lineHeight: 1.6 }}>
          If you'd like to cancel your subscription or request a refund, please use this form. Refund requests are only accepted within 4 hours of activation.
        </p>
      </div>
      <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
        Having trouble? Fill out the form below or email us at{' '}
        <a href="mailto:digidelight33@gmail.com" style={{ color: 'var(--accent2)' }}>digidelight33@gmail.com</a>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
        <input type="email" placeholder="Your email *" value={email} onChange={e => setEmail(e.target.value)}
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, outline: 'none' }} />
        <textarea placeholder="Describe your issue or refund request *" value={message} onChange={e => setMessage(e.target.value)} rows={5}
          style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
        {status === 'error' && <p style={{ color: 'var(--red)', fontSize: 13 }}>Something went wrong. Please email us directly.</p>}
        <button onClick={handleSend} disabled={!email || !message || status === 'loading'}
          style={{ padding: '12px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: (!email || !message) ? 'not-allowed' : 'pointer', opacity: (!email || !message) ? 0.6 : 1, alignSelf: 'flex-start' }}>
          {status === 'loading' ? 'Sending...' : 'Send Message →'}
        </button>
      </div>
    </div>
  );
}

const PAGE_CONFIG = {
  terms:      { title: 'Terms of Service',        titleAr: 'شروط الخدمة',         icon: FileText, lastUpdated: 'September 2026', bilingual: true },
  privacy:    { title: 'Privacy Policy',          titleAr: 'سياسة الخصوصية',      icon: Lock, lastUpdated: 'August 2026', bilingual: true },
  refund:     { title: 'Refund & Cancellation',    icon: DollarSign },
  about:      { title: 'About Erivion',           titleAr: 'عن Erivion',          icon: Info, bilingual: true },
  support:    { title: 'Support',                  icon: LifeBuoy },
  howto:      { title: 'كيفية الاستخدام',          icon: BookOpen },
};

// الصفحات الطويلة اللي بتاخد الشريط الجانبي + قائمة "On this page"
const TOC_BY_PAGE = { terms: TERMS_TOC, privacy: PRIVACY_TOC, about: ABOUT_TOC };

export default function SubPage({ page, onBack }) {
  const config = PAGE_CONFIG[page] || { title: page, icon: FileText };

  // ✅ NEW: لغة الصفحة — بس للصفحات ثنائية اللغة (terms/privacy/about). الديفولت بياخد
  // نفس منطقة العميل المحفوظة أصلاً (مصر → عربي، دولي → إنجليزي) بدل ديفولت ثابت واحد
  const [lang, setLang] = useState(() => {
    if (!config.bilingual) return 'en';
    return (localStorage.getItem('erivion_region') || 'eg') === 'eg' ? 'ar' : 'en';
  });
  const isRtl = config.bilingual && lang === 'ar';
  const toc = (lang === 'ar' ? TOC_AR_BY_PAGE[page] : TOC_BY_PAGE[page]) || null;

  // ✅ NEW: تتبّع القسم الظاهر دلوقتي في الشاشة عشان الشريط الجانبي يسلّط الضوء عليه —
  // IntersectionObserver بسيط، بيتصفّر كل ما الصفحة (page) أو اللغة تتغيّر (أقسام جديدة)
  const [activeIdx, setActiveIdx] = useState(1);
  useEffect(() => {
    if (!toc) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveIdx(Number(visible[0].target.id.replace('sec-', '')));
    }, { rootMargin: '-100px 0px -70% 0px' });
    const timer = setTimeout(() => {
      toc.forEach((_, i) => {
        const el = document.getElementById('sec-' + (i + 1));
        if (el) observer.observe(el);
      });
    }, 50);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [page, lang, toc]);

  const jumpTo = (n) => {
    const el = document.getElementById('sec-' + n);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <style>{`
        .subpage-shell { max-width: 1180px; margin: 0 auto; padding: 32px 24px 90px; display: flex; gap: 40px; align-items: flex-start; }
        .subpage-main { flex: 1; min-width: 0; max-width: 760px; }
        .subpage-sidenav { width: 240px; flex-shrink: 0; position: sticky; top: 32px; }
        .subpage-sidenav-inner { display: flex; flex-direction: column; gap: 2px; max-height: calc(100vh - 64px); overflow-y: auto; }
        .subpage-sidenav-item {
          display: flex; align-items: center; gap: 10px; text-align: ${isRtl ? 'right' : 'left'};
          padding: 8px 10px; border-radius: 9px; border: none; background: transparent;
          color: var(--text3); font-size: 13px; cursor: pointer; font-family: inherit; line-height: 1.4;
          transition: background 0.15s, color 0.15s;
        }
        .subpage-sidenav-item:hover { background: var(--bg3); color: var(--text2); }
        .subpage-sidenav-item.active { background: var(--accent-bg); color: var(--accent); font-weight: 700; }
        .subpage-sidenav-num {
          display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
          width: 18px; height: 18px; border-radius: 50%; font-size: 9.5px; font-weight: 800;
          background: var(--bg4); color: var(--text3);
        }
        .subpage-sidenav-item.active .subpage-sidenav-num { background: var(--accent); color: #fff; }
        @media (max-width: 880px) {
          .subpage-shell { flex-direction: column; padding: 20px 16px 70px; gap: 20px; }
          .subpage-sidenav { width: 100%; position: static; order: -1; }
          .subpage-sidenav-inner {
            flex-direction: row; overflow-x: auto; overflow-y: visible; max-height: none;
            padding: 4px 2px; scrollbar-width: none; gap: 6px;
          }
          .subpage-sidenav-inner::-webkit-scrollbar { display: none; }
          .subpage-sidenav-inner > div:first-child { display: none; }
          .subpage-sidenav-item { flex-shrink: 0; white-space: nowrap; }
        }
      `}</style>

      <div className="subpage-shell">
        <div className="subpage-main">
          <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, marginBottom: 32, padding: 0 }}>
            {isRtl ? '→' : '←'} {isRtl ? 'رجوع' : 'Back'}
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: config.lastUpdated ? 12 : 36, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.5px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <config.icon size={26} strokeWidth={1.75} /> {isRtl && config.titleAr ? config.titleAr : config.title}
            </h1>

            {/* ✅ NEW: مبدّل اللغة — يظهر بس للصفحات ثنائية اللغة (terms/privacy/about) */}
            {config.bilingual && (
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                {['en', 'ar'].map(l => (
                  <button key={l} onClick={() => setLang(l)} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                    background: lang === l ? 'var(--accent)' : 'var(--bg2)',
                    color: lang === l ? '#fff' : 'var(--text3)',
                    border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  }}>
                    {l === 'en' ? <Languages size={13} strokeWidth={2} /> : null} {l === 'en' ? 'English' : 'العربية'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {config.lastUpdated && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 28,
              padding: '5px 12px', borderRadius: 999,
              background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)',
              color: 'var(--accent2)', fontSize: 12, fontWeight: 600,
            }}>
              <Clock size={13} strokeWidth={2} /> {isRtl ? 'آخر تحديث' : 'Last updated'}: {config.lastUpdated}
            </div>
          )}

          {page === 'terms'   && <TermsContent lang={lang} />}
          {page === 'privacy' && <PrivacyContent lang={lang} />}
          {page === 'refund'  && <RefundContent />}
          {page === 'about'   && <AboutContent lang={lang} />}
          {page === 'support' && <SupportContent />}
          {page === 'howto'   && <HowToUseContent />}
        </div>

        {toc && <SideNav items={toc} activeIdx={activeIdx} onJump={jumpTo} />}
      </div>
    </div>
  );
}