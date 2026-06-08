import { useState } from 'react';

const faqs = [
  {
    category: '🎬 إنشاء الفيديو',
    questions: [
      {
        q: 'كيف أصنع فيديو؟',
        a: 'اكتب فكرتك أو نصك في صفحة الإنشاء، اختر المدة والصوت، ثم اضغط "Generate Script". بعدها راجع المشاهد واضغط "Render Video" لتوليد الفيديو النهائي.',
      },
      {
        q: 'كام مدة أقصى للنص؟',
        a: 'الحد الأقصى هو 1200 كلمة (ما يعادل ~10 دقائق فيديو). إذا تجاوزت هذا الحد ستظهر لك رسالة تنبيه وزر الإنشاء سيتعطل حتى تقلل النص.',
      },
      {
        q: 'كام وقت يستغرق تصيير الفيديو؟',
        a: 'يعتمد على مدة الفيديو:\n• 30 ثانية – 1 دقيقة: حوالي 1–3 دقائق\n• 3–5 دقائق: حوالي 5–15 دقيقة\n• 8–10 دقائق: قد يصل إلى 30–60 دقيقة\nإذا ظهرت رسالة "Render taking longer than expected"، تحقق من صفحة "My Videos" ستجد الفيديو هناك.',
      },
      {
        q: 'الفيديو لم يظهر بعد انتهاء التصيير، أين هو؟',
        a: 'اذهب إلى "My Videos" من القائمة العلوية. قد يحتاج الفيديو بعض الوقت الإضافي لرفعه على السيرفر، خاصةً للفيديوهات الطويلة.',
      },
      {
        q: 'هل يمكنني إنشاء أكثر من فيديو في نفس الوقت؟',
        a: 'حالياً السيرفر يعالج فيديو واحداً في كل مرة للحفاظ على الجودة. إذا كان هناك فيديو آخر يُعالج ستظهر لك رسالة "في الطابور" وسيبدأ فيديوك تلقائياً فور انتهاء الأول.',
      },
      {
        q: 'ما الفرق بين النماذج (Model 3, 4, 5)؟',
        a: '• Model 3: يستخدم صور AI ثابتة – سريع وأقل تكلفة بالكريديت\n• Model 4: فيديو حقيقي بالذكاء الاصطناعي (Seedance) – جودة عالية\n• Model 5 (Cinematic): فيديو سينمائي بجودة احترافية\n• Model 6 (Atlas): خرائط وإنفوجرافيك\n• Model 7: فيديو مفتوح المصدر – تجريبي',
      },
    ],
  },
  {
    category: '💳 الكريديت والباقات',
    questions: [
      {
        q: 'ما هو الكريديت وكيف يُحسب؟',
        a: 'الكريديت هو وحدة قياس استخدام المنصة. كل مشهد في فيديوك يستهلك عدداً معيناً من الكريديت حسب الباقة والنموذج المستخدم.',
      },
      {
        q: 'متى يُجدَّد الكريديت؟',
        a: 'يتجدد الكريديت تلقائياً كل أسبوع (يوم السبت). إذا احتجت تجديداً فورياً يمكنك التواصل مع الدعم.',
      },
      {
        q: 'ما الفرق بين الباقات؟',
        a: '• Pro (80 جنيه): كريديت أسبوعي أساسي، مناسب للاستخدام الخفيف\n• Plus (180 جنيه): كريديت أعلى، مناسب للمحتوى المنتظم\n• Max (400 جنيه): أعلى كريديت، مناسب للاستخدام المكثف والمحترفين',
      },
      {
        q: 'كيف أدفع؟',
        a: 'يمكنك الدفع عبر:\n• InstaPay (للمصريين): أرسل المبلغ ثم أرسل لقطة شاشة للدعم للموافقة اليدوية\n• Gumroad: للدفع الدولي بالبطاقة',
      },
      {
        q: 'هل هناك نسخة مجانية؟',
        a: 'نعم، الباقة المجانية تتيح لك تجربة المنصة بعدد محدود من الكريديت أسبوعياً.',
      },
      {
        q: 'هل باقة Max تفتح كل النماذج؟',
        a: 'لا، باقة Max تمنحك أعلى كريديت أسبوعي وتفتح Model 1 و Model 2 (Pexels Clips) فقط بشكل تلقائي.\n\nالنماذج الأخرى لها اشتراك منفصل:\n• Model 3 (AI Image): له خطط خاصة\n• Model 4 (Real Video): له خطط خاصة\n• Model 5 (Cinematic): له خطط خاصة\n\nكل نموذج له تسعيرة مستقلة لأن تكلفة توليده تختلف.',
      },
    ],
  },
  {
    category: '🔊 الصوت والترجمة',
    questions: [
      {
        q: 'كيف أختار صوت الفيديو؟',
        a: 'في صفحة الإنشاء، قسم "Voice"، اختر الصوت المناسب من القائمة. يمكنك الفلترة بين الأصوات الذكورية والأنثوية والعربية والإنجليزية.',
      },
      {
        q: 'هل تدعم المنصة اللغة العربية؟',
        a: 'نعم، تدعم المنصة اللغة العربية بالكامل بما في ذلك أصوات عربية متعددة وترجمة (كابشن) من اليمين لليسار.',
      },
      {
        q: 'يمكنني استخدام صوتي الخاص؟',
        a: 'نعم، اختر "Voice Upload" في صفحة الإنشاء وارفع ملف صوتك MP3 أو WAV.',
      },
      {
        q: 'الصوت لم يتولد مع الفيديو، ما الحل؟',
        a: 'اضغط "Render Video" مباشرةً — المنصة الآن تولد الصوت تلقائياً قبل التصيير إذا لم يكن جاهزاً. إذا استمرت المشكلة تواصل مع الدعم.',
      },
    ],
  },
  {
    category: '⚙️ مشاكل تقنية',
    questions: [
      {
        q: 'الموقع بطيء أو لا يستجيب',
        a: 'قد يكون هناك فيديو يُعالج حالياً على السيرفر. انتظر بضع دقائق وأعد تحميل الصفحة. إذا استمرت المشكلة تواصل مع الدعم.',
      },
      {
        q: 'الفيديو توقف أثناء التصيير وظهرت رسالة خطأ',
        a: 'تحقق أولاً من "My Videos" — قد يكون الفيديو اكتمل. إذا لم تجده انتظر 10 دقائق وتحقق مجدداً. في حالة الفشل الكامل تواصل مع الدعم وسنعيد الكريديت.',
      },
      {
        q: 'لا أستطيع تسجيل الدخول',
        a: 'تأكد من تفعيل بريدك الإلكتروني (تحقق من Spam). إذا نسيت كلمة المرور استخدم "Forgot Password". للمشاكل الأخرى تواصل مع الدعم.',
      },
      {
        q: 'الكريديت لا يُحسب بشكل صحيح',
        a: 'جدد الصفحة أولاً. إذا استمرت المشكلة تواصل مع الدعم مع ذكر البريد الإلكتروني والمشكلة بالتفصيل.',
      },
    ],
  },
  {
    category: '🤝 الشراكة والعمولة',
    questions: [
      {
        q: 'ما هو برنامج الشراكة؟',
        a: 'يمكنك كسب عمولة 50% متكررة على كل اشتراك يأتي عبر رابط الإحالة الخاص بك. العمولة تُدفع شهرياً طالما المستخدم مشترك.',
      },
      {
        q: 'كيف أحصل على رابط الإحالة؟',
        a: 'اذهب إلى "Affiliate Program" من القائمة الجانبية. رابطك الخاص موجود هناك ويمكنك نسخه ومشاركته مباشرةً.',
      },
    ],
  },
];

export default function FAQPage({ onBack }) {
  const [openItem, setOpenItem] = useState(null);
  const [search, setSearch]   = useState('');

  const filtered = faqs.map(cat => ({
    ...cat,
    questions: cat.questions.filter(
      q => !search || q.q.includes(search) || q.a.includes(search)
    ),
  })).filter(cat => cat.questions.length > 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Back button */}
        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ← رجوع
          </button>
        )}

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>❓</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            الأسئلة الشائعة
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14 }}>كل ما تحتاج معرفته عن Erivion</p>
        </div>

        {/* Search */}
        <div style={{ marginBottom: 32 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 ابحث في الأسئلة..."
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 14, outline: 'none',
              boxSizing: 'border-box', direction: 'rtl',
            }}
          />
        </div>

        {/* FAQ Categories */}
        {filtered.map((cat, ci) => (
          <div key={ci} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 12, letterSpacing: 1 }}>
              {cat.category}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cat.questions.map((item, qi) => {
                const key  = `${ci}-${qi}`;
                const open = openItem === key;
                return (
                  <div
                    key={qi}
                    style={{
                      background: open ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${open ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: 12, overflow: 'hidden', transition: 'all 0.2s',
                    }}
                  >
                    <button
                      onClick={() => setOpenItem(open ? null : key)}
                      style={{
                        width: '100%', padding: '16px 20px', background: 'none', border: 'none',
                        color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        textAlign: 'right', direction: 'rtl', fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      <span>{item.q}</span>
                      <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginRight: 12, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
                    </button>
                    {open && (
                      <div style={{
                        padding: '0 20px 18px', color: 'rgba(255,255,255,0.65)', fontSize: 13.5,
                        lineHeight: 1.8, direction: 'rtl', whiteSpace: 'pre-line',
                      }}>
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
          <div style={{ fontWeight: 700, marginBottom: 6 }}>لم تجد إجابتك؟</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>فريق الدعم جاهز لمساعدتك</div>
          <a
            href="mailto:support@erivion.net"
            style={{
              display: 'inline-block', padding: '10px 24px', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
              borderRadius: 999, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none',
            }}
          >
            تواصل مع الدعم
          </a>
        </div>

      </div>
    </div>
  );
}
