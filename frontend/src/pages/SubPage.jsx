import React, { useState } from 'react';
import { AppFooter } from './LandingPage.jsx';

// ✅ NEW: كل Section بقى كارت واضح بحدود خفيفة، ورقم دائري لو العنوان مبدوء بـ "N. " —
// بيتقرا تلقائي من نص العنوان نفسه (زي "1. Acceptance of Terms") من غير ما نلمس أي مكان
// بينادي Section، فكل الصفحات (Terms/Privacy/Refund/About) بتستفيد من الشكل الجديد أوتوماتيك
function Section({ title, children }) {
  const match = String(title).match(/^(\d+)\.\s*(.+)$/);
  const num = match ? match[1] : null;
  const heading = match ? match[2] : title;
  const anchorId = 'sec-' + (num || String(heading).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  return (
    <div id={anchorId} style={{
      marginBottom: 14,
      padding: '20px 22px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      scrollMarginTop: 96,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {num && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 26, height: 26, borderRadius: '50%',
            background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 800,
            flexShrink: 0,
          }}>{num}</span>
        )}
        <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{heading}</h3>
      </div>
      <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.85, margin: 0, whiteSpace: 'pre-line' }}>{children}</p>
    </div>
  );
}

// ✅ NEW: قائمة "على هذه الصفحة" — شبكة أزرار صغيرة بتنط لأي قسم لما تدوس عليه، بدل ما
// العميل يعمل scroll يدوي في صفحة طويلة. بتظهر بس للصفحات الطويلة (Terms/Privacy)
function TableOfContents({ items }) {
  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <div style={{
      marginBottom: 28, padding: '16px 18px',
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        On this page
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map((label, i) => {
          const n = i + 1;
          return (
            <button key={n} onClick={() => scrollTo('sec-' + n)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 999,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text2)', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: 16, height: 16, borderRadius: '50%',
                background: 'var(--accent)', color: '#fff', fontSize: 9.5, fontWeight: 800,
              }}>{n}</span>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TERMS_TOC = [
  'Acceptance of Terms', 'Description of Service', 'User Accounts', 'Acceptable Use & Prohibited Content',
  'Payments & Subscriptions', 'Cancellation & Refund Policy', 'Advertising', 'Intellectual Property',
  'AI-Generated Content Disclaimer', 'Fair Use & Service Availability', 'Data & Video Retention',
  'Disclaimers & Limitation of Liability', 'Termination', 'Governing Law', 'Changes to Terms', 'Contact Us',
];

const PRIVACY_TOC = [
  'Introduction', 'Information We Collect', 'How We Use Your Information', 'Ad-Free Platform',
  'Gumroad (International Payments)', 'Cookies & Tracking', 'Third-Party Services',
  'Data Storage & Security', 'Your Rights', 'Contact Us',
];

function TermsContent() {
  return <>
    <Section title="1. Acceptance of Terms">By accessing or using Erivion ("the Service", "the Platform"), you confirm that you are at least 13 years of age and agree to be legally bound by these Terms of Service. If you do not agree to these Terms, you must not use the Service. Continued use of the Service after any changes constitutes your acceptance of the revised Terms.</Section>
    <Section title="2. Description of Service">Erivion is an AI-powered video creation platform that allows users to generate videos from text ideas, scripts, or product photos (including AI video ads). The Service uses third-party AI and media providers including Groq, Pexels, Stability AI, Seedance, FLUX, and Google Gemini to deliver its functionality.</Section>
    <Section title="3. User Accounts">You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must notify us immediately of any unauthorized use at digidelight33@gmail.com.</Section>
    <Section title="4. Acceptable Use & Prohibited Content">You agree not to use the Service to create, distribute, or promote content that: (a) is sexually explicit, pornographic, or adult in nature; (b) depicts, glorifies, instructs, or incites graphic violence, murder, killing, or serious physical harm to real people or groups; (c) promotes racism, hatred, or discrimination based on race, ethnicity, religion, gender, nationality, sexual orientation, or disability; (d) facilitates illegal activities including fraud, piracy, or drug use; (e) constitutes misinformation, deepfakes intended to deceive, or impersonation; (f) involves or is directed at minors in an inappropriate or harmful manner; (g) infringes on third-party intellectual property rights. Erivion applies automated AI-based content screening to every generation request, in addition to manual review, to detect and block prohibited content before a video is created. Violations will result in immediate account suspension or termination without refund, and may be reported to relevant authorities where required by law.</Section>
    <Section title="5. Payments & Subscriptions">Paid plans and credit top-ups are billed on a one-time or recurring basis depending on the option selected. For Egyptian users, credit purchases are activated manually after InstaPay payment verification. For international users, payments are processed via Gumroad which handles payment processing.</Section>
    <Section title="6. Cancellation & Refund Policy">Egyptian users (InstaPay): you may request cancellation and a refund within 4 hours of your purchase being approved only. Requests submitted after this 4-hour window will not be honored, except in verified cases of technical failure on our end. Refunds are NOT granted for dissatisfaction with AI-generated video quality, style, or output — this is not a valid refund reason. Refund requests must be submitted exclusively through the Support page.

International users (Gumroad): there is currently no refund system available for international purchases. This is a temporary limitation while we build out our international payment infrastructure, and we are actively working to make refunds available to international users soon. If you experience a verified technical failure on our end, contact support and we will assess your case individually.</Section>
    <Section title="7. Advertising">Erivion does not display third-party advertisements. The platform is entirely ad-free. Your experience will never be interrupted by ads.</Section>
    <Section title="8. Intellectual Property">The Erivion platform, brand, and underlying technology are owned by Erivion and protected by intellectual property laws. Videos generated by users using their own original inputs are owned by the respective users, subject to these Terms and applicable law. Users grant Erivion a non-exclusive license to process submitted content solely for the purpose of delivering the Service.</Section>
    <Section title="9. AI-Generated Content Disclaimer">Videos are generated using third-party AI models and may occasionally contain inaccuracies, visual artifacts, or unexpected results. Erivion does not guarantee the factual accuracy, appropriateness for a specific audience, or suitability of AI-generated content for any particular purpose. You are solely responsible for reviewing generated content before publishing, broadcasting, or otherwise distributing it.</Section>
    <Section title="10. Fair Use & Service Availability">Erivion reserves the right to throttle, queue, rate-limit, or temporarily suspend access during periods of high demand or maintenance, and to suspend or terminate accounts exhibiting abusive, automated (bot), or fraudulent usage patterns inconsistent with normal individual use.</Section>
    <Section title="11. Data & Video Retention">Generated videos and related job data are retained on our servers for a limited period. We recommend downloading and backing up any videos you wish to keep. Videos and associated data may be deleted after extended account inactivity (12 months or more) without further notice.</Section>
    <Section title="12. Disclaimers & Limitation of Liability">The Service is provided "as is" without warranties of any kind. Erivion is not liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability to you shall not exceed the amounts you paid to Erivion in the 12 months preceding the claim.</Section>
    <Section title="13. Termination">Erivion reserves the right to suspend or terminate your account at any time for violation of these Terms, without prior notice. You may terminate your account by contacting us at digidelight33@gmail.com.</Section>
    <Section title="14. Governing Law">These Terms are governed by applicable law. Disputes shall be resolved through good-faith negotiation before any legal proceedings.</Section>
    <Section title="15. Changes to Terms">We may update these Terms at any time. We will notify users of significant changes via email or a prominent notice on the platform. Continued use after changes constitutes acceptance.</Section>
    <Section title="16. Contact Us">For any questions about these Terms, please contact us at digidelight33@gmail.com or through the Support page on the platform.</Section>
  </>;
}

function PrivacyContent() {
  return <>
    <Section title="1. Introduction">Erivion ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. By using Erivion, you consent to the practices described in this Policy.</Section>
    <Section title="2. Information We Collect">We collect: (a) Account Information — email address, name, and password; (b) Profile Data — avatar and name from Google OAuth; (c) Usage Data — videos created, features used, credits consumed; (d) Technical Data — IP address, browser type, device information; (e) Payment Information — plan type and payment confirmation (we do not store card numbers).</Section>
    <Section title="3. How We Use Your Information">We use your information to provide and maintain the Service; process authentication; send transactional emails; monitor compliance; analyze usage patterns; and communicate service updates.</Section>
    <Section title="4. Ad-Free Platform">Erivion is completely ad-free. We do not use any advertising network, track users for advertising purposes, or share your data with advertising companies.</Section>
    <Section title="5. Gumroad (International Payments)">For international users, payments are processed by Gumroad. We receive only transaction confirmation — no card details are shared with us.</Section>
    <Section title="6. Cookies & Tracking">We use essential cookies for login session management and analytics cookies to understand usage. You can control cookie preferences through your browser settings.</Section>
    <Section title="7. Third-Party Services">Erivion integrates with: Google OAuth, Groq AI, Pexels, Stability AI, Replicate (Seedance, FLUX), Google Gemini, and Gumroad. Each has their own privacy policies.</Section>
    <Section title="8. Data Storage & Security">Your data is stored on secure servers with industry-standard encryption and HTTPS connections. We do not sell, rent, or trade your personal information.</Section>
    <Section title="9. Your Rights">You have the right to access, correct, or delete your personal data. Contact us at digidelight33@gmail.com.</Section>
    <Section title="10. Contact Us">digidelight33@gmail.com or through the Support page on the platform.</Section>
  </>;
}

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
      icon: '🎯',
      title: 'اختر الموديل المناسب',
      color: '#7c6af7',
      content: 'الموقع عنده 7 موديلات مختلفة، كل واحد ليه مميزاته:',
      items: [
        { name: 'AI Slices (Model 1)', desc: 'صور AI مع Ken Burns zoom - مثالي للمحتوى التعليمي والقصصي' },
        { name: 'Real Footage (Model 2)', desc: 'فيديوهات حقيقية من Pexels - مثالي للمحتوى الوثائقي' },
        { name: 'AI Images (Model 3)', desc: 'صور AI عالية الجودة لكل مشهد - مثالي للقصص الاحترافية' },
        { name: 'Seedance AI (Model 4)', desc: 'كليبات فيديو AI حقيقية - مثالي للمحتوى السينمائي' },
        { name: 'Cinematic AI (Model 5)', desc: 'شخصيات ثابتة عبر المشاهد، مع وضعين: فكرة أو برومبت مباشر - مثالي للقصص ذات الشخصيات' },
        { name: 'Map Video (Model 6)', desc: 'خرائط جغرافية متحركة - مثالي للمحتوى الجغرافي والتاريخي' },
        { name: 'Ads Creator (Model 7)', desc: 'ارفع صورة منتجك واحصل على إعلان فيديو احترافي كامل مع صوت' },
      ]
    },
    {
      icon: '✍️',
      title: 'اكتب فكرتك بشكل صح',
      color: '#06b6d4',
      content: 'أهم خطوة - كيف تكتب فكرة قوية تطلع فيديو احترافي:',
      items: [
        { name: '✅ مثال ممتاز', desc: '"فيديو تحفيزي عن رحلة رائد أعمال مصري بدأ بـ500 جنيه وبنى إمبراطورية تجارية في 5 سنين"' },
        { name: '✅ مثال ممتاز', desc: '"قصة اكتشاف كنز في مقبرة فرعونية - من منظور عالم آثار مصري"' },
        { name: '❌ مثال ضعيف', desc: '"فيديو عن النجاح" - مبهم جداً' },
        { name: '❌ مثال ضعيف', desc: '"اعمل فيديو جميل" - مفيش تفاصيل' },
        { name: '💡 نصيحة', desc: 'كلما كانت الفكرة محددة وفيها تفاصيل، كلما طلع الفيديو أحسن وأكثر احترافية' },
        { name: '💡 نصيحة', desc: 'اذكر: الشخصية الرئيسية + الحدث + المكان + النتيجة' },
      ]
    },
    {
      icon: '⚙️',
      title: 'اضبط الإعدادات',
      color: '#f59e0b',
      content: 'الإعدادات بتأثر على جودة الفيديو:',
      items: [
        { name: 'اللغة', desc: 'اختار لغة الفيديو - الصوت والكابشن هيبقوا بنفس اللغة' },
        { name: 'مقاس الفيديو', desc: '9:16 للموبايل وتيك توك ورييلز | 16:9 لليوتيوب | 1:1 للإنستجرام' },
        { name: 'المدة', desc: 'ابدأ بـ 30 ثانية أو دقيقة للتجربة، وزود لما تتأكد من الجودة' },
        { name: 'الصوت', desc: 'اختار الصوت المناسب للمحتوى - الصوت الحكيم للتعليم، الشاب للتحفيز' },
        { name: 'الكابشن', desc: 'شغّل دايماً - بيزيد المشاهدات بشكل كبير' },
        { name: 'الموسيقى', desc: 'بتضيف جو على الفيديو - اختار الـ volume المناسب في صفحة الرندر' },
      ]
    },
    {
      icon: '🎬',
      title: 'راجع المشاهد وعدّل',
      color: '#22c55e',
      content: 'بعد توليد المشاهد، عندك صلاحيات:',
      items: [
        { name: 'Edit النص', desc: 'قدر تعدل نص أي مشهد قبل ما تعمل رندر' },
        { name: 'Keywords', desc: 'في Model 1 و2 قدر تعدل كلمات البحث عشان تغير الصور والفيديوهات' },
        { name: 'ترتيب المشاهد', desc: 'قدر ترفع وتنزل المشاهد بالأسهم' },
        { name: 'حذف مشهد', desc: 'لو مشهد مش مناسب، احذفه من الـ X' },
        { name: 'Caption Style', desc: 'اختار شكل الكابشن في صفحة الرندر' },
        { name: 'Video Effect', desc: 'أضف Cinematic أو Grayscale أو غيرهم' },
      ]
    },
    {
      icon: '✨',
      title: 'Edit بعد الرندر',
      color: '#e11d48',
      content: 'بعد ما الفيديو يطلع عندك خيارين:',
      items: [
        { name: 'Edit with AI', desc: 'اكتب أمر زي "احذف الكابشن" أو "اجعل النص أكثر حماساً" وهيتعمل re-render تلقائي' },
        { name: 'Edit Manual', desc: 'قص الفيديو، غير السرعة، ارفع موسيقى خارجية' },
        { name: 'Download', desc: 'نزّل الفيديو بجودة عالية جاهز للنشر' },
        { name: 'My Videos', desc: 'كل فيديوهاتك محفوظة في My Videos' },
      ]
    },
  ];

  const tips = [
    { icon: '🔥', text: 'جرب أكثر من فكرة - الفيديوهات المجانية في Model 1 و2 كافية للتجربة' },
    { icon: '📱', text: 'للتيك توك والرييلز دايماً استخدم 9:16 مع كابشن مفعّل' },
    { icon: '🎯', text: 'أفضل مدة للمحتوى العربي على السوشيال ميديا: 30 ثانية - دقيقة' },
    { icon: '💡', text: 'لو الكلمات بتبحث عنها في Pexels مش بتطلع نتائج كويسة، جرب كلمات إنجليزية مختلفة' },
    { icon: '🎨', text: 'Model 3 أحسن جودة للمحتوى التاريخي والقصصي المتخيل' },
    { icon: '⚡', text: 'Credits بتتجدد كل أسبوع - استخدمهم كلهم!' },
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
            <div style={{ width:40, height:40, borderRadius:12, background:`${step.color}18`, border:`1px solid ${step.color}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
              {step.icon}
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
        <h3 style={{ fontSize:15, fontWeight:700, color:'#a78bfa', marginBottom:14 }}>💎 نصائح من فريق Erivion</h3>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {tips.map((tip, i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <span style={{ fontSize:16, flexShrink:0 }}>{tip.icon}</span>
              <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, margin:0 }}>{tip.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutContent() {
  return <>
    <Section title="Who We Are">Erivion is proudly Egyptian-founded — and built from day one for a global audience. We're not a local-only product; creators and businesses use Erivion worldwide, in 8+ languages.</Section>
    <Section title="Our Mission">To make professional video creation accessible to everyone — no expensive software or editing experience required.</Section>
    <Section title="What We Do">Erivion is an AI-powered video generation platform. Provide an idea, a script, or a product photo, and we handle scenes, footage, character-consistent video, voiceovers, captions, music, and effects — including full AI video ads from a single product image.</Section>
    <Section title="Our Technology">State-of-the-art language models for scripting, image and video generation models for visuals, neural text-to-speech for voiceovers, and a professional rendering pipeline built on FFmpeg. Supporting 8+ languages.</Section>
    <Section title="Content Standards">We strictly prohibit sexually explicit, racist, or violent/harmful content. Every generation request passes through automated AI-based content screening in addition to manual review before a video is created.</Section>
    <Section title="Contact">digidelight33@gmail.com — we read every message.</Section>
  </>;
}

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
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>Message Sent!</h3>
      <p style={{ color: 'var(--text3)' }}>We'll get back to you within 24 hours.</p>
    </div>
  );

  return (
    <div>
      <div style={{ background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
        <p style={{ color: '#7c6af7', fontWeight: 600, fontSize: 14, margin: '0 0 6px' }}>💡 Refund & Cancellation Requests</p>
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
          {status === 'loading' ? '⏳ Sending...' : 'Send Message →'}
        </button>
      </div>
    </div>
  );
}

const PAGE_CONFIG = {
  terms:      { title: 'Terms of Service',        icon: '📄', lastUpdated: 'August 2026' },
  privacy:    { title: 'Privacy Policy',           icon: '🔒', lastUpdated: 'August 2026' },
  refund:     { title: 'Refund & Cancellation',    icon: '💰' },
  about:      { title: 'About Erivion',            icon: 'ℹ️' },
  support:    { title: 'Support',                  icon: '🛟' },
  howto:      { title: 'كيفية الاستخدام',          icon: '📖' },
};

export default function SubPage({ page, onBack }) {
  const config = PAGE_CONFIG[page] || { title: page, icon: '📄' };
  const toc = page === 'terms' ? TERMS_TOC : page === 'privacy' ? PRIVACY_TOC : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, marginBottom: 32, padding: 0 }}>
          ← Back
        </button>
        <div style={{ marginBottom: config.lastUpdated ? 12 : 36 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 0, letterSpacing: '-0.5px', color: 'var(--text)' }}>
            {config.icon} {config.title}
          </h1>
        </div>
        {config.lastUpdated && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 28,
            padding: '5px 12px', borderRadius: 999,
            background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)',
            color: 'var(--accent2)', fontSize: 12, fontWeight: 600,
          }}>
            🕒 Last updated: {config.lastUpdated}
          </div>
        )}
        {toc && <TableOfContents items={toc} />}
        {page === 'terms'   && <TermsContent />}
        {page === 'privacy' && <PrivacyContent />}
        {page === 'refund'  && <RefundContent />}
        {page === 'about'   && <AboutContent />}
        {page === 'support' && <SupportContent />}
        {page === 'howto'   && <HowToUseContent />}
      </div>
    </div>
  );
}