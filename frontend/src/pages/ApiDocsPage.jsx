const T = {
  ar: {
    heading: 'API و MCP', sub: 'اربط Erivion مباشرة بـ Claude (أو أي أداة تدعم MCP) وولّد صور وفيديوهات حقيقية من جوه محادثتك.',
    back: '← رجوع',
    connectTitle: 'إزاي تربط؟',
    connectSteps: [
      'روح لـ Settings → API & MCP جوه حسابك، وولّد مفتاح API جديد (أو استخدم رابط MCP الجاهز اللي هناك).',
      'في Claude.ai أو Claude Desktop أو Claude Code، ضيف Erivion كـ"Custom Connector"/MCP server بنفس الرابط.',
      'أول ما تحاول تستخدم أي أداة، هيطلب منك تسجيل الدخول بحسابك (OAuth) أو تدخل مفتاح الـAPI مباشرة.',
      'كده خلصت — قوللنا "ولّد فيديو لـ..." جوه محادثتك مع Claude وهيبدأ فعليًا.',
    ],
    settingsCta: '→ روح لصفحة Settings → API & MCP',
    toolsTitle: 'الأدوات المتاحة',
    tools: [
      { name: 'list_models', desc: 'يرجع كل محركات الصور والفيديو المتاحة دلوقتي بأسعارها الحقيقية.' },
      { name: 'check_credits', desc: 'يرجع رصيد الكريديت الحالي بتاعك.' },
      { name: 'generate_image', desc: 'يولّد صورة أو أكتر من برومبت نصي، وينتظر النتيجة تلقائيًا.' },
      { name: 'generate_video', desc: 'يولّد فيديو من برومبت نصي أو من صورة موجودة، مع دعم سرد صوتي وكابشن وموسيقى.' },
      { name: 'check_render_status', desc: 'يتابع حالة توليد بدأ قبل كده لو استغرق وقت أطول من المتوقع.' },
      { name: 'edit_video', desc: 'يعدّل تفصيلة في فيديو موجود (لحد 15 ثانية) من رابط عام، من غير ما يعيد توليده من الصفر.' },
      { name: 'list_characters', desc: 'يعرض شخصياتك المحفوظة في استوديو الشخصيات مع رابط الصورة المرجعية لكل واحدة.' },
      { name: 'create_character', desc: 'يعمل شخصية جديدة بالذكاء الاصطناعي (Nano Banana 2.1، جسم كامل على خلفية بيضاء) ويحفظها في حسابك.' },
      { name: 'swap_character_in_video', desc: 'يحط شخصية (أو أكتر) مكان اللي في فيديوك: شخصية واحدة بنفس الحركة والكلام الأصلي (لحد 60 ثانية)، وأكتر من شخصية بـ Seedance 2.5 (لحد 30 ثانية).' },
      { name: 'list_character_templates', desc: 'يعرض قوالب الترند اللي تقدر تبدّل فيها الشخصية بشخصيتك، مع السعر.' },
      { name: 'apply_character_template', desc: 'يعمل قالب ترند بشخصيتك: نفس حركات وصوت القالب بشخصيتك.' },
    ],
    exampleTitle: 'مثال',
    example: '"ولّد لي فيديو مدته 5 ثواني لقطة سينمائية لناطحة سحاب في الليل باستخدام veo3_fast"',
    noteTitle: 'ملحوظة',
    note: 'كل استخدام بيخصم من رصيدك الحقيقي بنفس أسعار الموقع بالظبط — مفيش استخدام مجاني إضافي عن طريق الـAPI.',
  },
  en: {
    heading: 'API & MCP', sub: 'Connect Erivion directly to Claude (or any MCP-compatible tool) and generate real images/videos from inside your conversation.',
    back: '← Back',
    connectTitle: 'How to connect',
    connectSteps: [
      'Go to Settings → API & MCP in your account, and generate a new API key (or use the ready MCP endpoint URL shown there).',
      'In Claude.ai, Claude Desktop, or Claude Code, add Erivion as a Custom Connector / MCP server using that same URL.',
      "The first time you use a tool, you'll be asked to log in with your account (OAuth) or enter your API key directly.",
      'That\'s it — just say "generate a video of..." inside your Claude conversation and it actually starts.',
    ],
    settingsCta: '→ Go to Settings → API & MCP',
    toolsTitle: 'Available Tools',
    tools: [
      { name: 'list_models', desc: 'Returns every currently available image and video engine with real pricing.' },
      { name: 'check_credits', desc: "Returns your account's current credit balance." },
      { name: 'generate_image', desc: 'Generates one or more images from a text prompt, waiting for the result automatically.' },
      { name: 'generate_video', desc: 'Generates a video from a text prompt or an existing image, with optional narration, captions, and music.' },
      { name: 'check_render_status', desc: 'Follows up on a generation that started earlier and took longer than expected.' },
      { name: 'edit_video', desc: 'Applies a precise edit to an existing video (max 15s) from a public URL, without regenerating it from scratch.' },
      { name: 'list_characters', desc: 'Lists your saved Character Studio characters with each one\'s reference image URL.' },
      { name: 'create_character', desc: 'Creates a new AI character (Nano Banana 2.1, full body on a white background) and saves it to your account.' },
      { name: 'swap_character_in_video', desc: 'Puts one or more characters into your video: one character keeps the original movements and speech (up to 60s); several characters use Seedance 2.5 (up to 30s).' },
      { name: 'list_character_templates', desc: 'Lists the trending templates where your character replaces the original, with prices.' },
      { name: 'apply_character_template', desc: 'Makes a trending template with your character: same movements and sound, performed by your character.' },
    ],
    exampleTitle: 'Example',
    example: '"Generate a 5-second cinematic shot of a skyscraper at night using veo3_fast"',
    noteTitle: 'Note',
    note: "Every use is charged from your real balance at the exact same rates as the website — there's no separate free API usage.",
  },
};

export default function ApiDocsPage({ onBack, onNavigate, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[isAr ? 'ar' : 'en'];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.back}
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔌</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heading}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 500, marginInline: 'auto', lineHeight: 1.7 }}>
            {t.sub}
          </p>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'rgba(255,255,255,0.75)' }}>{t.connectTitle}</h2>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {t.connectSteps.map((step, i) => (
              <li key={i} style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 1.8 }}>{step}</li>
            ))}
          </ol>
        </div>
        {onNavigate && (
          <button onClick={() => onNavigate('settings')} style={{ display: 'block', width: '100%', marginBottom: 36, padding: '13px', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 20px rgba(124,106,247,0.3)' }}>
            {t.settingsCta}
          </button>
        )}

        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: 'rgba(255,255,255,0.75)' }}>{t.toolsTitle}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {t.tools.map(tool => (
            <div key={tool.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '12px 18px' }}>
              <code style={{ fontSize: 13.5, fontWeight: 700, color: '#a78bfa', fontFamily: "'JetBrains Mono', monospace" }}>{tool.name}</code>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>{tool.desc}</p>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.75)' }}>{t.exampleTitle}</h2>
        <div style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.25)', borderRadius: 12, padding: '14px 18px', marginBottom: 28, fontSize: 13.5, color: '#d1d5db', fontStyle: 'italic', lineHeight: 1.7 }}>
          {t.example}
        </div>

        <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 12, padding: '14px 18px' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#f59e0b' }}>{t.noteTitle}: </span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>{t.note}</span>
        </div>

      </div>
    </div>
  );
}
