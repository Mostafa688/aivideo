import React, { useState } from 'react';
import { AppFooter } from './LandingPage.jsx';
import {
  Target, PenLine, Settings as SettingsIcon, Clapperboard, Sparkles, Flame,
  Smartphone, Lightbulb, Palette, Zap, Gem, CheckCircle2, FileText, Lock,
  DollarSign, Info, LifeBuoy, BookOpen, Clock,
} from 'lucide-react';

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
  'YouTube API Services & Google User Data', 'Data Storage & Security', 'Your Rights', 'Contact Us',
];

function TermsContent() {
  return <>
    <Section title="1. Acceptance of Terms">By accessing or using Erivion ("the Service", "the Platform"), you confirm that you are at least 13 years of age and agree to be legally bound by these Terms of Service. If you do not agree to these Terms, you must not use the Service. Continued use of the Service after any changes constitutes your acceptance of the revised Terms.</Section>
    <Section title="2. Description of Service">Erivion is an AI-powered video creation platform that allows users to generate videos from text ideas, scripts, voice recordings, or product photos (including AI video ads). The Service uses third-party AI and media providers including Groq, Pexels, Stability AI, Seedance, FLUX, Google Gemini, and ElevenLabs to deliver its functionality. The Service also includes an AI Agent (chat assistant) that can plan, refine, and generate videos on your behalf, help you subscribe or top up credits, make limited account changes at your explicit request (see Section 3), and — when you request a video about a real historical or current event — perform a live web search to verify facts before writing a script and provide you with the sources it used.</Section>
    <Section title="3. User Accounts">You must provide accurate and complete information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must notify us immediately of any unauthorized use at digidelight33@gmail.com. Through the AI Agent, you may ask for a small set of safe, limited account changes (such as updating your display name or your Egypt/international region) — these are only ever made after your explicit request in that conversation, and never include changes to your credit balance, plan, or billing, which always require a real payment or manual admin approval.</Section>
    <Section title="4. Acceptable Use & Prohibited Content">You agree not to use the Service to create, distribute, or promote content that: (a) is sexually explicit, pornographic, or adult in nature; (b) depicts, glorifies, instructs, or incites graphic violence, murder, killing, or serious physical harm to real people or groups; (c) promotes racism, hatred, or discrimination based on race, ethnicity, religion, gender, nationality, sexual orientation, or disability; (d) facilitates illegal activities including fraud, piracy, or drug use; (e) constitutes misinformation, deepfakes intended to deceive, or impersonation; (f) involves or is directed at minors in an inappropriate or harmful manner; (g) infringes on third-party intellectual property rights. Erivion applies automated AI-based content screening to every generation request, in addition to manual review, to detect and block prohibited content before a video is created. Violations will result in immediate account suspension or termination without refund, and may be reported to relevant authorities where required by law.</Section>
    <Section title="5. Payments & Subscriptions">Erivion does not offer a free plan — every account starts with a zero credit balance and must purchase credits before generating videos. Credit top-ups are one-time purchases (not a recurring subscription) and never expire. For Egyptian users, credit purchases are made via InstaPay and activated manually after payment verification, including a receipt screenshot. For international users, payments are processed via Gumroad, which handles card payment processing. You can complete either flow directly on the Pricing page or through the AI Agent chat, which will ask your region if unknown and open the matching payment flow for you.</Section>
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
    <Section title="2. Information We Collect">We collect: (a) Account Information — email address, name, and password; (b) Profile Data — avatar and name from Google OAuth; (c) Usage Data — videos created, features used, credits consumed, and your Egypt/international region if provided; (d) Technical Data — IP address, browser type, device information; (e) Payment Information — plan type and payment confirmation (we do not store card numbers); (f) Agent Conversations — messages you send to the AI Agent and its replies are temporarily stored (kept for a maximum of 24 hours) so our support team can review issues; if a request required unusual or custom handling, an anonymized summary of how it was resolved may be kept longer to help the Agent handle similar future requests faster, without storing your raw message indefinitely; (g) How You Heard About Us — if you tell us during onboarding, so we can understand which channels bring us customers.</Section>
    <Section title="3. How We Use Your Information">We use your information to provide and maintain the Service; process authentication; send transactional emails (including payment approvals and, occasionally, a platform-wide announcement email sent to all users); monitor compliance; analyze usage patterns including which channels bring us customers; and communicate service updates.</Section>
    <Section title="4. Ad-Free Platform">Erivion is completely ad-free. We do not use any advertising network, track users for advertising purposes, or share your data with advertising companies.</Section>
    <Section title="5. Gumroad (International Payments)">For international users, payments are processed by Gumroad. We receive only transaction confirmation — no card details are shared with us.</Section>
    <Section title="6. Cookies & Tracking">We use essential cookies for login session management and analytics cookies to understand usage. You can control cookie preferences through your browser settings.</Section>
    <Section title="7. Third-Party Services">Erivion integrates with: Google OAuth, Groq AI, Pexels, Stability AI, Replicate (Seedance, FLUX), Google Gemini, ElevenLabs (voice generation), Tavily (live web search used by the AI Agent to verify facts for real historical/current-event videos), and Gumroad. Each has their own privacy policies.</Section>
    <Section title="8. YouTube API Services & Google User Data">If you choose to connect a YouTube channel (in the Channels page), Erivion uses the YouTube Data API and requests two Google OAuth scopes: (a) read-only access to your channel's basic info (channel name, ID, and thumbnail) so we can confirm which channel is connected and show it in your dashboard, and (b) upload access, used only to publish the videos Erivion generates for you to that channel — only when you have explicitly enabled auto-upload for that channel, and only for that channel. We never read, modify, or delete your existing videos, comments, playlists, or subscriber data, and we never post, comment, or take any other action on your behalf beyond uploading the videos you asked Erivion to create. Your Google OAuth tokens are stored encrypted and are used solely to perform these actions; you can revoke access at any time from the Channels page ("Disconnect") or directly from your Google Account's third-party access settings, which immediately deletes the stored tokens from our servers. Erivion's use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Google API Services User Data Policy</a>, including the Limited Use requirements.</Section>
    <Section title="9. Data Storage & Security">Your data is stored on secure servers with industry-standard encryption and HTTPS connections. We do not sell, rent, or trade your personal information.</Section>
    <Section title="10. Your Rights">You have the right to access, correct, or delete your personal data. Contact us at digidelight33@gmail.com.</Section>
    <Section title="11. Contact Us">digidelight33@gmail.com or through the Support page on the platform.</Section>
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
  terms:      { title: 'Terms of Service',        icon: FileText, lastUpdated: 'August 2026' },
  privacy:    { title: 'Privacy Policy',           icon: Lock, lastUpdated: 'August 2026' },
  refund:     { title: 'Refund & Cancellation',    icon: DollarSign },
  about:      { title: 'About Erivion',            icon: Info },
  support:    { title: 'Support',                  icon: LifeBuoy },
  howto:      { title: 'كيفية الاستخدام',          icon: BookOpen },
};

export default function SubPage({ page, onBack }) {
  const config = PAGE_CONFIG[page] || { title: page, icon: FileText };
  const toc = page === 'terms' ? TERMS_TOC : page === 'privacy' ? PRIVACY_TOC : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '40px 20px 80px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14, marginBottom: 32, padding: 0 }}>
          ← Back
        </button>
        <div style={{ marginBottom: config.lastUpdated ? 12 : 36 }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 0, letterSpacing: '-0.5px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <config.icon size={26} strokeWidth={1.75} /> {config.title}
          </h1>
        </div>
        {config.lastUpdated && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 28,
            padding: '5px 12px', borderRadius: 999,
            background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)',
            color: 'var(--accent2)', fontSize: 12, fontWeight: 600,
          }}>
            <Clock size={13} strokeWidth={2} /> Last updated: {config.lastUpdated}
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