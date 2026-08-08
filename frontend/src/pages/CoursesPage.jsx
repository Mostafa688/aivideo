import { useState } from 'react';

// ─── محتوى الكورسات — هيكل جاهز فاضي للمحتوى الفعلي (فيديوهات/دروس) لاحقًا ──────────
// كل موديول له عنوان ووصف قصير بس، ومفيهوش لينكات فيديو حقيقية لسه — لما المحتوى الحقيقي
// يبقى جاهز، يتضاف "lessons: [{ title, videoUrl, durationMin }]" لكل موديول هنا
const MODULES_AR = [
  { icon: '🚀', title: 'أول خطوة على Erivion', desc: 'جولة سريعة على الموقع: إزاي تنشئ حسابك، تفهم نظام الكريديت، وتعمل أول فيديو ليك.' },
  { icon: '🤖', title: 'استخدام الايجنت الذكي', desc: 'إزاي تتكلم مع الايجنت زي ما بتتكلم مع مصمم حقيقي — تطلب فيديو بفكرة، بسكريبت جاهز، أو حتى بصورة، وهو يفهمك ويعمله.' },
  { icon: '🎬', title: 'Model 1 & 2 — فوتيج وصور', desc: 'إمتى تستخدم صور AI ثابتة (Model 1) وإمتى تستخدم فوتيج حقيقي (Model 2)، وإزاي تختار الصوت والكابشن المناسبين.' },
  { icon: '🖼️', title: 'Model 3 — صور AI فنية', desc: 'إزاي تعمل فيديو بستايل فني مميز باستخدام صور مولّدة بالذكاء الاصطناعي.' },
  { icon: '🎥', title: 'Model 4 — فيديو AI حقيقي', desc: 'إزاي تستخدم Seedance عشان تعمل مشاهد فيديو حقيقية بحركة كاملة، مش صور بس.' },
  { icon: '🎭', title: 'Model 5 — سينمائي بشخصيات ثابتة', desc: 'إزاي ترفع صورة شخصية وتخليها تفضل ثابتة في كل مشاهد الفيديو، وإزاي تستخدم وضع الـ Map Video.' },
  { icon: '📢', title: 'Model 7 — إعلانات المنتجات', desc: 'إزاي تحول صورة منتج لإعلان فيديو احترافي في دقايق.' },
  { icon: '💡', title: 'أفكار وسكريبتات تنجح', desc: 'أساسيات كتابة سكريبت يشد المشاهد من أول ثانية، وأفكار فيديوهات بتنجح في السوشيال ميديا.' },
];

const MODULES_EN = [
  { icon: '🚀', title: 'Getting Started with Erivion', desc: 'A quick tour of the platform: setting up your account, understanding credits, and making your first video.' },
  { icon: '🤖', title: 'Using the AI Agent', desc: 'How to talk to the Agent like a real designer — request a video by idea, ready script, or even a photo, and it builds it for you.' },
  { icon: '🎬', title: 'Model 1 & 2 — Footage & Images', desc: 'When to use static AI images (Model 1) vs. real stock footage (Model 2), and how to pick the right voice and captions.' },
  { icon: '🖼️', title: 'Model 3 — Artistic AI Images', desc: 'How to create a video with a distinctive artistic style using AI-generated images.' },
  { icon: '🎥', title: 'Model 4 — Real AI Video', desc: 'How to use Seedance to generate real motion video clips, not just static images.' },
  { icon: '🎭', title: 'Model 5 — Cinematic with Consistent Characters', desc: 'How to upload a character photo and keep it consistent across every scene, plus how Map Video mode works.' },
  { icon: '📢', title: 'Model 7 — Product Ads', desc: 'How to turn a product photo into a professional ad video in minutes.' },
  { icon: '💡', title: 'Ideas & Scripts That Work', desc: 'The basics of writing a script that hooks viewers from the first second, and video ideas that perform well on social media.' },
];

export default function CoursesPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const modules = isAr ? MODULES_AR : MODULES_EN;
  const dir = isAr ? 'rtl' : 'ltr';
  const [openItem, setOpenItem] = useState(null);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {isAr ? '← رجوع' : '← Back'}
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎓</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {isAr ? 'كورسات Erivion' : 'Erivion Courses'}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>
            {isAr ? 'دروس هتساعدك تتقن صناعة الفيديوهات واستخدام كل موديل في Erivion — قريبًا.' : "Lessons to help you master video creation and every Erivion model — coming soon."}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modules.map((m, i) => {
            const open = openItem === i;
            return (
              <div key={i} style={{ background: open ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${open ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, overflow: 'hidden', transition: 'all 0.2s' }}>
                <button onClick={() => setOpenItem(open ? null : i)}
                  style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: isAr ? 'right' : 'left', direction: dir, fontFamily: "'DM Sans', sans-serif", gap: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 20 }}>{m.icon}</span>{m.title}</span>
                  <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', flexShrink: 0, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
                </button>
                {open && (
                  <div style={{ padding: '0 20px 18px', color: 'rgba(255,255,255,0.65)', fontSize: 13.5, lineHeight: 1.8, direction: dir }}>
                    <p style={{ margin: '0 0 10px' }}>{m.desc}</p>
                    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: 11.5, fontWeight: 700 }}>
                      {isAr ? '⏳ قريبًا' : '⏳ Coming Soon'}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 40, padding: '24px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>💬</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>
            {isAr ? 'عايز تسأل حاجة قبل الكورسات؟' : 'Have a question before the courses launch?'}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>
            {isAr ? 'الايجنت أو فريق الدعم جاهزين يساعدوك دلوقتي' : 'The Agent or our support team can help right now'}
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
