import { useState } from 'react';

// ─── Arabic Content ────────────────────────────────────────────────────────
const faqs_ar = [
  {
    category: '🎬 إنشاء الفيديو',
    questions: [
      { q: 'كيف أصنع فيديو؟', a: 'اكتب فكرتك أو نصك في صفحة الإنشاء، اختر المدة والصوت، ثم اضغط "Generate Script". بعدها راجع المشاهد واضغط "Render Video" لتوليد الفيديو النهائي.' },
      { q: 'كام وقت يستغرق تصيير الفيديو؟', a: 'يعتمد على مدة الفيديو:\n• 30 ثانية – 1 دقيقة: حوالي 1–3 دقائق\n• 3–5 دقائق: حوالي 5–15 دقيقة\n• 8–10 دقائق: قد يصل إلى 30–60 دقيقة\nإذا ظهرت رسالة "Render taking longer than expected"، تحقق من صفحة "My Videos".' },
      { q: 'الفيديو لم يظهر بعد انتهاء التصيير، أين هو؟', a: 'اذهب إلى "My Videos" من القائمة العلوية. قد يحتاج الفيديو بعض الوقت الإضافي لرفعه على السيرفر، خاصةً للفيديوهات الطويلة.' },
      { q: 'هل يمكنني إنشاء أكثر من فيديو في نفس الوقت؟', a: 'حالياً السيرفر يعالج فيديو واحداً في كل مرة للحفاظ على الجودة. إذا كان هناك فيديو آخر يُعالج ستظهر لك رسالة "في الطابور" وسيبدأ فيديوك تلقائياً فور انتهاء الأول.' },
      { q: 'ما الفرق بين النماذج (Model 3, 4, 5)؟', a: '• Model 3: يستخدم صور AI ثابتة – سريع وأقل تكلفة\n• Model 4: فيديو حقيقي بالذكاء الاصطناعي (Seedance v1) – جودة عالية\n• Model 5 (Cinematic): فيديو سينمائي بشخصيات ثابتة وصوت أصلي' },
    ],
  },
  {
    category: '💳 الكريديت والباقات',
    questions: [
      { q: 'ما هو الكريديت وكيف يُحسب؟', a: 'الكريديت هو وحدة قياس استخدام المنصة. كل مشهد في فيديوك يستهلك عدداً معيناً من الكريديت حسب الباقة والنموذج المستخدم.' },
      { q: 'متى يُجدَّد الكريديت؟', a: 'يتجدد الكريديت تلقائياً كل أسبوع. إذا احتجت تجديداً فورياً يمكنك التواصل مع الدعم.' },
      { q: 'ما الفرق بين الباقات؟', a: '• Pro (100 جنيه): كريديت أسبوعي أساسي، مناسب للاستخدام الخفيف\n• Plus (220 جنيه): كريديت أعلى، مناسب للمحتوى المنتظم\n• Max (550 جنيه): أعلى كريديت، مناسب للاستخدام المكثف والمحترفين' },
      { q: 'كيف أدفع؟', a: 'يمكنك الدفع عبر:\n• InstaPay (للمصريين): أرسل المبلغ ثم أرسل لقطة شاشة للدعم للموافقة اليدوية\n• Gumroad: للدفع الدولي بالبطاقة' },
      { q: 'هل هناك نسخة مجانية؟', a: 'نعم، الباقة المجانية تتيح لك تجربة المنصة بعدد محدود من الكريديت أسبوعياً (1,600 كريديت).' },
      { q: 'هل باقة Max تفتح كل النماذج؟', a: 'لا، باقة Max تمنحك أعلى كريديت أسبوعي وتفتح Model 1 و Model 2 فقط. النماذج الأخرى (3، 4، 5) لها اشتراكات منفصلة لأن تكلفة توليدها مختلفة.' },
    ],
  },
  {
    category: '🔊 الصوت والترجمة',
    questions: [
      { q: 'كيف أختار صوت الفيديو؟', a: 'في صفحة الإنشاء، قسم "Voice"، اختر الصوت المناسب من القائمة. يمكنك الفلترة بين الأصوات الذكورية والأنثوية والعربية والإنجليزية.' },
      { q: 'هل تدعم المنصة اللغة العربية؟', a: 'نعم، تدعم المنصة اللغة العربية بالكامل بما في ذلك أصوات عربية متعددة وكابشن من اليمين لليسار.' },
      { q: 'يمكنني استخدام صوتي الخاص؟', a: 'نعم، اختر "Voice Upload" في صفحة الإنشاء وارفع ملف صوتك MP3 أو WAV.' },
    ],
  },
  {
    category: '⚙️ مشاكل تقنية',
    questions: [
      { q: 'الموقع بطيء أو لا يستجيب', a: 'قد يكون هناك فيديو يُعالج حالياً على السيرفر. انتظر بضع دقائق وأعد تحميل الصفحة. إذا استمرت المشكلة تواصل مع الدعم.' },
      { q: 'الفيديو توقف أثناء التصيير وظهرت رسالة خطأ', a: 'تحقق أولاً من "My Videos" — قد يكون الفيديو اكتمل. إذا لم تجده انتظر 10 دقائق. في حالة الفشل الكامل تواصل مع الدعم وسنعيد الكريديت.' },
      { q: 'لا أستطيع تسجيل الدخول', a: 'تأكد من تفعيل بريدك الإلكتروني (تحقق من Spam). إذا نسيت كلمة المرور استخدم "Forgot Password". للمشاكل الأخرى تواصل مع الدعم.' },
      { q: 'الكريديت لا يُحسب بشكل صحيح', a: 'جدد الصفحة أولاً. إذا استمرت المشكلة تواصل مع الدعم مع ذكر البريد الإلكتروني والمشكلة بالتفصيل.' },
    ],
  },
  {
    category: '🤝 الشراكة والعمولة',
    questions: [
      { q: 'ما هو برنامج الشراكة؟', a: 'يمكنك كسب عمولة 50% متكررة على كل اشتراك يأتي عبر رابط الإحالة الخاص بك. العمولة تُدفع شهرياً طالما المستخدم مشترك.' },
      { q: 'كيف أحصل على رابط الإحالة؟', a: 'اذهب إلى "Earn with Erivion" من القائمة الجانبية. رابطك الخاص موجود هناك ويمكنك نسخه ومشاركته مباشرةً.' },
    ],
  },
];

// ─── English Content ───────────────────────────────────────────────────────
const faqs_en = [
  {
    category: '🎬 Creating Videos',
    questions: [
      { q: 'How do I create a video?', a: 'Type your idea or script on the creation page, choose the duration and voice, then click "Generate Script". Review the scenes and click "Render Video" to generate your final video.' },
      { q: 'How long does rendering take?', a: 'It depends on video length:\n• 30s – 1min: about 1–3 minutes\n• 3–5min: about 5–15 minutes\n• 8–10min: up to 30–60 minutes\nIf you see "Render taking longer than expected", check "My Videos" — your video will be there.' },
      { q: 'My video didn\'t appear after rendering, where is it?', a: 'Go to "My Videos" from the top menu. Videos may need a little extra time to upload to the server, especially longer ones.' },
      { q: 'Can I create multiple videos at the same time?', a: 'Currently the server processes one video at a time to maintain quality. If another video is being processed, you\'ll see a "queue" message and your video will start automatically once the first one finishes.' },
      { q: 'What\'s the difference between models (Model 3, 4, 5)?', a: '• Model 3: Uses static AI images — fast and cost-efficient\n• Model 4: Real AI-generated video (Seedance v1 Pro) — high quality\n• Model 5 (Cinematic): Cinematic video with consistent characters and original audio' },
    ],
  },
  {
    category: '💳 Credits & Plans',
    questions: [
      { q: 'What are credits and how are they calculated?', a: 'Credits are the usage unit for the platform. Each scene in your video consumes a certain number of credits depending on your plan and the model used.' },
      { q: 'When do credits renew?', a: 'Credits renew automatically every week. If you need an immediate top-up, contact support.' },
      { q: 'What\'s the difference between plans?', a: '• Pro ($5/mo): Basic weekly credits, great for light use\n• Plus ($11/mo): More credits, ideal for regular content creators\n• Max ($18/mo): Highest credits, built for heavy users and professionals' },
      { q: 'How do I pay?', a: 'You can pay via Gumroad using any credit or debit card. After payment, click "I\'ve Paid" and we\'ll activate your plan within 24 hours.' },
      { q: 'Is there a free plan?', a: 'Yes, the free plan lets you try the platform with a limited number of credits per week (1,600 credits).' },
      { q: 'Does the Max plan unlock all models?', a: 'No, the Max plan gives you the highest weekly credits for Model 1 & 2 only. Models 3, 4, and 5 have separate subscriptions because their generation costs are different.' },
    ],
  },
  {
    category: '🔊 Voice & Captions',
    questions: [
      { q: 'How do I choose the video voice?', a: 'On the creation page, go to the "Voice" section and choose from the list. You can filter between male, female, Arabic, and English voices.' },
      { q: 'Does the platform support Arabic?', a: 'Yes, Erivion fully supports Arabic including multiple Arabic voices and right-to-left captions.' },
      { q: 'Can I use my own voice?', a: 'Yes, select "Voice Upload" on the creation page and upload your MP3 or WAV file.' },
    ],
  },
  {
    category: '⚙️ Technical Issues',
    questions: [
      { q: 'The site is slow or unresponsive', a: 'There may be a video being processed on the server. Wait a few minutes and reload the page. If the problem persists, contact support.' },
      { q: 'My video stopped rendering and showed an error', a: 'First check "My Videos" — it may have completed. If not found, wait 10 minutes and check again. In case of complete failure, contact support and we\'ll restore your credits.' },
      { q: 'I can\'t log in', a: 'Make sure your email is verified (check Spam). If you forgot your password, use "Forgot Password". For other issues, contact support.' },
      { q: 'My credits aren\'t calculating correctly', a: 'Refresh the page first. If the problem continues, contact support with your email and a detailed description of the issue.' },
    ],
  },
  {
    category: '🤝 Affiliate Program',
    questions: [
      { q: 'What is the affiliate program?', a: 'You can earn a recurring 50% commission on every subscription that comes through your referral link. Commission is paid monthly as long as the user stays subscribed.' },
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