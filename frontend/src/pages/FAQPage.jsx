import { useState } from 'react';

// ─── Arabic Content ────────────────────────────────────────────────────────
const faqs_ar = [
  {
    category: '🌟 عن Erivion',
    questions: [
      { q: 'ايه هي Erivion وبتقدم ايه بالظبط؟', a: 'Erivion منصة بتحول أي فكرة، سكريبت، أو حتى صورة، لفيديو جاهز بالذكاء الاصطناعي — صوت، موسيقى، وكابشن، من غير ما تحتاج خبرة مونتاج. عندك أكتر من موديل توليد (فوتيج حقيقي، صور AI فنية، فيديو AI بحركة حقيقية، سينمائي بشخصيات ثابتة، إعلانات منتجات) وايجنت ذكي بيعمل كل ده معاك في شات واحد.' },
      { q: 'هل فيه خطة مجانية؟', a: 'لأ، الخطة المجانية اتلغت. أي مستخدم جديد بيبدأ برصيد كريديت صفر، ولازم يشحن كريديت (مصري عن طريق InstaPay، أو دولي عن طريق Gumroad) قبل ما يقدر يعمل أي فيديو.' },
      { q: 'إمتى أستخدم الايجنت وإمتى أستخدم صفحة موديل معينة مباشرة؟', a: 'الايجنت هو أسهل طريق لو مش عارف تختار موديل أو عايز تتكلم بشكل طبيعي عن فكرتك. صفحات الموديلات المباشرة (Model 3، 4، 5، 7...) مفيدة لو عندك تفاصيل دقيقة عايز تتحكم فيها بنفسك (زي عدد المشاهد بالظبط أو إعدادات متقدمة).' },
    ],
  },
  {
    category: '🤖 الايجنت الذكي',
    questions: [
      { q: 'الايجنت بيفتكر طلباتي القديمة؟', a: 'أيوه — لو طلبت فيديو بطريقة أو خطة غير مألوفة (سكريبت بصيغة خاصة مثلاً)، الايجنت بيحفظ إزاي فهمها ونفذها. لو بعتّله نفس الخطة أو حاجة قريبة منها تاني، بيتعرف عليها ويقدر يتحرك أسرع من غير ما يعيد كل أسئلة التوضيح من الأول.' },
      { q: 'أقدر أطلب فيديو عن حدث حقيقي أو تاريخي؟', a: 'أيوه، وده بالظبط اللي الايجنت اتصمم عشانه — لما تطلب فيديو عن حدث حقيقي أو تاريخي، بيقدر يتأكد من المعلومات ببحث فعلي على الإنترنت قبل ما يكتب السكريبت، ولو سألته "مصادرك ايه؟" بيديك الروابط الحقيقية اللي استخدمها.' },
      { q: 'الايجنت يقدر يعدّل في بيانات حسابي؟', a: 'في حدود بسيطة وآمنة فقط، وبعد موافقتك الواضحة في المحادثة — زي تغيير اسمك المعروض، أو تحديد إن حسابك مصري ولا دولي. أي حاجة تخص الرصيد أو الخطة بتتم فقط عن طريق دفع حقيقي أو مراجعة الأدمن، مش من خلال الشات مباشرة.' },
      { q: 'أقدر أشترك من خلال الشات مباشرة؟', a: 'أيوه، قوله "عايز أشترك" وهو هيسألك (لو مش عارف) انت مصري ولا برة مصر، يوريك الباقات المناسبة، وبعدين يفتحلك شاشة الدفع هنا في نفس الشات (InstaPay للمصريين، Gumroad للدوليين) — من غير ما تتنقل لصفحة تانية.' },
    ],
  },
  {
    category: '💳 الاشتراك والدفع',
    questions: [
      { q: 'إزاي الكريديت شغال؟', a: 'رصيد كريديت واحد بيشتغل مع كل الموديلات — تشحن مرة واحدة والكريديت بيفضل في حسابك من غير ما ينتهي أو يتصفّر أسبوعيًا.' },
      { q: 'إزاي أدفع لو أنا في مصر؟', a: 'تحدد عدد الكريديت اللي عايزه، تحوّل المبلغ عن طريق InstaPay على رقم الموقع، ترفع صورة إيصال التحويل، وتدوس "تم الدفع" — طلبك بيتراجع من فريق Erivion خلال 24 ساعة ويتفعّل الكريديت.' },
      { q: 'إزاي أدفع لو أنا برة مصر؟', a: 'تختار الباقة المناسبة وتدفع مباشرة بالكارت عن طريق Gumroad، وبعدها تدوس "I\'ve Paid" — التفعيل بيتم بعد المراجعة.' },
      { q: 'هل فيه استرجاع فلوس؟', a: 'للمصريين (InstaPay): تقدر تطلب استرجاع خلال 4 ساعات فقط من وقت الموافقة على الدفع. بعد كده مفيش استرجاع إلا في حالة عطل تقني مؤكد من عندنا — عدم الرضا عن ستايل الفيديو مش سبب كافي للاسترجاع. التفاصيل الكاملة في صفحة "Refund Policy".' },
    ],
  },
  {
    category: '🎬 الموديلات والفيديوهات',
    questions: [
      { q: 'ايه الفرق بين الموديلات؟', a: '• Model 1/2: صور أو فوتيج حقيقي — أرخص خيار\n• Model 3: صور AI فنية\n• Model 4: فيديو AI بحركة حقيقية\n• Model 5 (Cinematic): شخصية ثابتة عبر كل المشاهد + وضع Map Video للفيديوهات التاريخية/الجغرافية\n• Model 7: إعلانات منتجات من صورة واحدة' },
      { q: 'كام وقت يستغرق تصيير الفيديو؟', a: 'من دقيقة لحد شوية دقايق حسب مدة الفيديو والموديل. لو اتأخر، هتلاقيه في صفحة "My Videos" حتى لو الشاشة قفلت.' },
      { q: 'أقدر أرفع سكريبت أو صوت جاهز؟', a: 'أيوه — تقدر تلصق سكريبت كامل (حتى مقسّم مشاهد) أو ترفع تسجيل صوتي وهيتحول لنارريشن حقيقي في الفيديو.' },
    ],
  },
  {
    category: '🎓 الكورسات',
    questions: [
      { q: 'فيه كورسات لتعلم صناعة الفيديوهات على Erivion؟', a: 'أيوه، فيه قسم "Courses" مخصص لده في القائمة العلوية بالموقع — هيحتوي دروس على إزاي تستخدم كل موديل وتعمل فيديوهات ناجحة. المحتوى بيتحدث تباعًا.' },
    ],
  },
  {
    category: '⚙️ مشاكل تقنية',
    questions: [
      { q: 'الفيديو توقف أثناء التصيير وظهرت رسالة خطأ', a: 'تحقق أولاً من "My Videos" — قد يكون الفيديو اكتمل. في حالة الفشل الكامل تواصل مع الدعم وسنعيد الكريديت.' },
      { q: 'لا أستطيع تسجيل الدخول', a: 'تأكد من تفعيل بريدك الإلكتروني (تحقق من Spam). للمشاكل الأخرى تواصل مع الدعم.' },
    ],
  },
  {
    category: '🤝 الشراكة والعمولة',
    questions: [
      { q: 'ما هو برنامج الشراكة؟', a: 'تقدر تكسب عمولة 20% على كل شحنة كريديت تتم عن طريق رابط الإحالة الخاص بك، بتترحل مباشرة لـ InstaPay بتاعك.' },
      { q: 'كيف أحصل على رابط الإحالة؟', a: 'اذهب إلى "Earn with Erivion" من القائمة الجانبية. رابطك الخاص موجود هناك ويمكنك نسخه ومشاركته مباشرةً.' },
    ],
  },
];

// ─── English Content ───────────────────────────────────────────────────────
const faqs_en = [
  {
    category: '🌟 About Erivion',
    questions: [
      { q: 'What is Erivion and what does it actually offer?', a: 'Erivion turns any idea, script, or even a single photo into a finished AI-generated video — voiceover, music, and captions included, no editing experience required. You get several generation models (real stock footage, artistic AI images, real AI motion video, cinematic with consistent characters, product ads) plus a smart Agent that can do all of it for you in one chat.' },
      { q: 'Is there a free plan?', a: "No, the free plan has been discontinued. Every new account starts at 0 credits and needs to top up (Egypt via InstaPay, international via Gumroad) before generating any video." },
      { q: 'When should I use the Agent vs. a specific model page directly?', a: "The Agent is the easiest path if you're unsure which model fits or just want to describe your idea naturally. The direct model pages (Model 3, 4, 5, 7...) are better when you want fine control over specific settings yourself." },
    ],
  },
  {
    category: '🤖 AI Agent',
    questions: [
      { q: 'Does the Agent remember my past requests?', a: "Yes — if you request a video in an unusual way (a custom script format, a specific structured plan), the Agent remembers how it understood and handled it. If you or another customer send a similar request later, it recognizes the pattern and can move faster instead of re-asking every clarifying question from scratch." },
      { q: 'Can I ask for a video about a real historical or current event?', a: 'Yes — that\'s exactly what the Agent is built to handle. For real historical/current-event videos, it can verify facts with an actual web search before writing the script, and if you ask "where did you get this from?", it will give you the real source links it used.' },
      { q: 'Can the Agent make changes to my account?', a: "Only within safe, limited bounds, and only after you clearly agree in the conversation — like updating your display name or setting whether you're an Egypt or international customer. Anything involving your credit balance or plan only ever happens through a real payment or admin review, never directly through chat." },
      { q: 'Can I subscribe directly through the chat?', a: 'Yes — just tell it "I want to subscribe" and it will ask (if it doesn\'t already know) whether you\'re in Egypt or international, show you the right packages, and open the actual payment screen right there in the chat (InstaPay for Egypt, Gumroad for international) — no need to navigate anywhere else.' },
    ],
  },
  {
    category: '💳 Subscription & Payment',
    questions: [
      { q: 'How do credits work?', a: 'One credit balance works across every model — you top up once and the balance stays in your account, no weekly expiry or reset.' },
      { q: 'How do I pay if I\'m in Egypt?', a: 'Pick how many credits you want, transfer the amount via InstaPay to the site\'s number, upload a screenshot of the receipt, and tap "I\'ve Paid" — the Erivion team reviews it within 24 hours and activates your credits.' },
      { q: 'How do I pay if I\'m outside Egypt?', a: 'Choose the package that fits, pay directly by card via Gumroad, then click "I\'ve Paid" — activation follows after review.' },
      { q: 'Is there a refund?', a: "Egypt (InstaPay): you can request a refund only within 4 hours of the payment being approved. After that, no refunds except for a confirmed technical failure on our side — not liking the video's style isn't a valid reason. Full details are on the Refund Policy page." },
    ],
  },
  {
    category: '🎬 Models & Videos',
    questions: [
      { q: "What's the difference between the models?", a: '• Model 1/2: images or real stock footage — the cheapest option\n• Model 3: artistic AI images\n• Model 4: real AI motion video\n• Model 5 (Cinematic): consistent character across every scene + Map Video mode for historical/geographic videos\n• Model 7: product ads from a single photo' },
      { q: 'How long does rendering take?', a: "From under a minute to a few minutes depending on video length and model. If it's taking a while, check the \"My Videos\" page — it'll be there even if you closed the screen." },
      { q: 'Can I upload a ready-made script or voice recording?', a: "Yes — you can paste a full script (even scene-by-scene) or upload a voice recording and it becomes the video's actual narration." },
    ],
  },
  {
    category: '🎓 Courses',
    questions: [
      { q: 'Are there courses to learn video creation on Erivion?', a: 'Yes, there\'s a dedicated "Courses" section in the top navigation — it covers how to use each model and make videos that perform well. Content is being added over time.' },
    ],
  },
  {
    category: '⚙️ Technical Issues',
    questions: [
      { q: 'My video stopped rendering and showed an error', a: "First check \"My Videos\" — it may have completed. In case of complete failure, contact support and we'll restore your credits." },
      { q: "I can't log in", a: 'Make sure your email is verified (check Spam). For other issues, contact support.' },
    ],
  },
  {
    category: '🤝 Affiliate Program',
    questions: [
      { q: 'What is the affiliate program?', a: 'You earn a 20% commission on every credit purchase that comes through your referral link, paid straight to your InstaPay.' },
      { q: 'How do I get my referral link?', a: 'Go to "Earn with Erivion" from the side menu. Your personal link is there and you can copy and share it directly.' },
    ],
  },
];

export default function FAQPage({ onBack }) {
  const region   = localStorage.getItem('erivion_region') || 'eg';
  const isAr     = region !== 'intl';
  const faqs     = isAr ? faqs_ar : faqs_en;
  const dir      = isAr ? 'rtl' : 'ltr';

  const [openItem, setOpenItem] = useState(null);
  const [search, setSearch]     = useState('');

  const filtered = faqs.map(cat => ({
    ...cat,
    questions: cat.questions.filter(
      q => !search || q.q.includes(search) || q.a.includes(search)
    ),
  })).filter(cat => cat.questions.length > 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Back */}
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {isAr ? '← رجوع' : '← Back'}
          </button>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❓</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14 }}>
            {isAr ? 'كل ما تحتاج معرفته عن Erivion' : 'Everything you need to know about Erivion'}
          </p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 32 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? '🔍 ابحث في الأسئلة...' : '🔍 Search questions...'}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: '#fff',
              fontSize: 14, outline: 'none', boxSizing: 'border-box',
              direction: dir,
            }}
          />
        </div>

        {/* FAQ Categories */}
        {filtered.map((cat, ci) => (
          <div key={ci} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: isAr ? 0 : 1 }}>
              {cat.category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cat.questions.map((item, qi) => {
                const key  = `${ci}-${qi}`;
                const open = openItem === key;
                return (
                  <div key={qi} style={{ background: open ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${open ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s' }}>
                    <button
                      onClick={() => setOpenItem(open ? null : key)}
                      style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: isAr ? 'right' : 'left', direction: dir, fontFamily: "'DM Sans', sans-serif" }}>
                      <span>{item.q}</span>
                      <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginRight: isAr ? 12 : 0, marginLeft: isAr ? 0 : 12, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
                    </button>
                    {open && (
                      <div style={{ padding: '0 20px 18px', color: 'rgba(255,255,255,0.65)', fontSize: 13.5, lineHeight: 1.8, direction: dir, whiteSpace: 'pre-line' }}>
                        {item.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Contact */}
        <div style={{ marginTop: 40, padding: '24px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>💬</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {isAr ? 'لم تجد إجابتك؟' : "Didn't find your answer?"}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>
            {isAr ? 'فريق الدعم جاهز لمساعدتك' : 'Our support team is ready to help'}
          </div>
          <a href="mailto:support@erivion.net"
            style={{ display: 'inline-block', padding: '10px 24px', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', borderRadius: 999, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            {isAr ? 'تواصل مع الدعم' : 'Contact Support'}
          </a>
        </div>

      </div>
    </div>
  );
}