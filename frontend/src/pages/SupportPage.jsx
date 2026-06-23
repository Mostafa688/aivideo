import { useState, useEffect, useRef } from 'react';

// ─── FAQ Quick Answers (from FAQPage) ─────────────────────────────────────────
const FAQ_AR = [
  { q: 'كيف أصنع فيديو؟', a: 'اكتب فكرتك أو نصك في صفحة الإنشاء، اختر المدة والصوت، ثم اضغط "Generate Scenes". بعدها راجع المشاهد واضغط "Render Video" لتوليد الفيديو النهائي.' },
  { q: 'كام وقت يستغرق التصيير؟', a: '30 ثانية – 1 دقيقة: حوالي 1–3 دقائق • 3–5 دقائق: حوالي 5–15 دقيقة • 8–10 دقائق: قد يصل إلى 30–60 دقيقة. إذا ظهرت رسالة تأخير، تحقق من صفحة "My Videos".' },
  { q: 'الفيديو لم يظهر بعد التصيير', a: 'اذهب إلى "My Videos" من القائمة العلوية. قد يحتاج الفيديو بعض الوقت الإضافي للرفع، خاصةً للفيديوهات الطويلة.' },
  { q: 'ما الفرق بين الموديلات؟', a: 'Model 2: فيديو من مقاطع حقيقية Pexels — مجاني • Model 3: صور AI بتأثير Ken Burns — مدفوع • Model 4: فيديو AI حقيقي Seedance — مدفوع • Model 5: فيديو سينمائي بشخصيات ثابتة — مدفوع' },
  { q: 'متى يُجدَّد الكريديت؟', a: 'يتجدد الكريديت تلقائياً كل أسبوع. إذا احتجت تجديداً فورياً تواصل مع الدعم.' },
  { q: 'كيف أدفع؟', a: 'للمصريين: عبر InstaPay وارسل لقطة للدعم. للدولي: عبر Gumroad ببطاقتك مباشرة.' },
  { q: 'هل Max تفتح كل الموديلات؟', a: 'لا، Max تمنحك أعلى كريديت أسبوعي لـ Model 1 & 2 فقط. Models 3 و4 و5 لها اشتراكات منفصلة.' },
  { q: 'الفيديو توقف وظهرت رسالة خطأ', a: 'تحقق أولاً من "My Videos". إذا لم تجد الفيديو انتظر 10 دقائق. في حالة الفشل الكامل تواصل معنا وسنعيد الكريديت.' },
];

const FAQ_EN = [
  { q: 'How do I create a video?', a: 'Type your idea or script, choose duration and voice, then click "Generate Scenes". Review scenes and click "Render Video" to produce your final video.' },
  { q: 'How long does rendering take?', a: '30s–1min: about 1–3 minutes • 3–5min: about 5–15 minutes • 8–10min: up to 30–60 minutes. If you see a delay message, check "My Videos".' },
  { q: 'My video didn\'t appear after rendering', a: 'Go to "My Videos" from the top menu. Videos may need extra time to upload, especially longer ones.' },
  { q: 'What\'s the difference between models?', a: 'Model 2: Real Pexels footage — free • Model 3: AI images with Ken Burns — paid • Model 4: Real Seedance AI video — paid • Model 5: Cinematic with consistent characters — paid' },
  { q: 'When do credits renew?', a: 'Credits renew automatically every week. For immediate top-up, contact support.' },
  { q: 'How do I pay?', a: 'Egyptians: via InstaPay, then send a screenshot. International: via Gumroad with your card directly.' },
  { q: 'Does Max unlock all models?', a: 'No, Max gives the highest weekly credits for Model 1 & 2 only. Models 3, 4 & 5 have separate subscriptions.' },
  { q: 'My video stopped with an error', a: 'First check "My Videos". If not found, wait 10 minutes. If completely failed, contact us and we\'ll restore your credits.' },
];

// ─── Support Page ─────────────────────────────────────────────────────────────
export default function SupportPage({ onBack, onNavigate }) {
  const region = localStorage.getItem('erivion_region') || 'eg';
  const isAr = region !== 'intl';
  const dir = isAr ? 'rtl' : 'ltr';
  const faqs = isAr ? FAQ_AR : FAQ_EN;

  const [view, setView] = useState('home'); // 'home' | 'faq' | 'chat'
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [chatStarted, setChatStarted] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [chatId, setChatId] = useState(null);
  const [faqOpen, setFaqOpen] = useState(null);
  const messagesEndRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for admin replies
  useEffect(() => {
    if (!chatId) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/support/messages/${chatId}`);
        const d = await r.json();
        if (d.messages) setMessages(d.messages);
      } catch {}
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [chatId]);

  const startChat = async () => {
    if (!name.trim() || !email.trim()) return;
    setSending(true);
    try {
      const r = await fetch('/api/support/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, language: isAr ? 'ar' : 'en' }),
      });
      const d = await r.json();
      if (d.chatId) {
        setChatId(d.chatId);
        setChatStarted(true);
        setMessages([{
          role: 'system',
          text: isAr
            ? `مرحباً ${name}! سيرد عليك أحد أعضاء فريقنا قريباً. يمكنك إرسال رسالتك الآن.`
            : `Hi ${name}! A team member will reply to you shortly. Feel free to send your message now.`,
          time: new Date().toISOString(),
        }]);
      }
    } catch {}
    setSending(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || !chatId) return;
    const msg = { role: 'user', text: input.trim(), time: new Date().toISOString() };
    setMessages(prev => [...prev, msg]);
    setInput('');
    setSending(true);
    try {
      await fetch('/api/support/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text: msg.text, role: 'user' }),
      });
    } catch {}
    setSending(false);
  };

  const sendFaqAsMessage = async (faq) => {
    setView('chat');
    if (!chatStarted) return;
    const msg = { role: 'user', text: faq.q, time: new Date().toISOString() };
    const ans = { role: 'admin', text: faq.a, time: new Date().toISOString() };
    setMessages(prev => [...prev, msg, ans]);
    try {
      await fetch('/api/support/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, text: faq.q, role: 'user', autoAnswer: faq.a }),
      });
    } catch {}
  };

  const T = {
    title:      isAr ? 'مركز الدعم' : 'Support Center',
    subtitle:   isAr ? 'كيف يمكننا مساعدتك؟' : 'How can we help you?',
    faqBtn:     isAr ? '❓ الأسئلة الشائعة' : '❓ FAQ',
    faqDesc:    isAr ? 'ابحث في إجابات جاهزة' : 'Browse quick answers',
    chatBtn:    isAr ? '💬 تحدث مع الدعم' : '💬 Chat with Support',
    chatDesc:   isAr ? 'تحدث مع فريقنا مباشرة' : 'Talk to our team directly',
    back:       isAr ? '← رجوع' : '← Back',
    quickQ:     isAr ? 'أسئلة سريعة — اضغط لترى الإجابة فوراً' : 'Quick answers — tap to see instantly',
    talkBtn:    isAr ? 'تحدث مع خدمة العملاء' : 'Talk to a real person',
    nameLabel:  isAr ? 'اسمك' : 'Your name',
    emailLabel: isAr ? 'بريدك الإلكتروني' : 'Your email',
    startBtn:   isAr ? 'ابدأ المحادثة →' : 'Start Chat →',
    typeMsg:    isAr ? 'اكتب رسالتك...' : 'Type your message...',
    send:       isAr ? 'إرسال' : 'Send',
    chatNote:   isAr ? 'سيصلك رد خلال دقائق' : 'You\'ll get a reply within minutes',
    youLabel:   isAr ? 'أنت' : 'You',
    supportLbl: isAr ? 'الدعم' : 'Support',
  };

  // ── HOME ──────────────────────────────────────────────────────────────────
  if (view === 'home') return (
    <div style={{ minHeight:'100vh', background:'#050508', color:'#fff', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px', fontFamily:"'DM Sans',sans-serif", direction:dir }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .sp-card { transition:all 0.25s cubic-bezier(0.16,1,0.3,1); cursor:pointer; }
        .sp-card:hover { transform:translateY(-6px); border-color:rgba(124,106,247,0.4) !important; }
      `}</style>
      {onBack && <button onClick={onBack} style={{ position:'absolute', top:80, [isAr?'right':'left']:24, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'7px 14px', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13 }}>{T.back}</button>}

      <div style={{ textAlign:'center', marginBottom:48, animation:'fadeUp 0.5s ease both' }}>
        <div style={{ width:64, height:64, borderRadius:20, background:'linear-gradient(135deg,#7c6af7,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 20px', boxShadow:'0 8px 32px rgba(124,106,247,0.4)' }}>💬</div>
        <h1 style={{ fontSize:'clamp(28px,5vw,42px)', fontWeight:900, letterSpacing:'-1px', marginBottom:10, fontFamily:"'Bricolage Grotesque',sans-serif" }}>{T.title}</h1>
        <p style={{ fontSize:16, color:'#6b7280' }}>{T.subtitle}</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:16, maxWidth:480, width:'100%', animation:'fadeUp 0.5s ease 0.1s both' }}>
        {/* FAQ Card */}
        <div className="sp-card" onClick={() => setView('faq')}
          style={{ padding:'28px 24px', borderRadius:20, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.03)', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>❓</div>
          <h3 style={{ fontSize:16, fontWeight:800, marginBottom:6, fontFamily:"'Bricolage Grotesque',sans-serif" }}>{T.faqBtn.replace('❓ ','')}</h3>
          <p style={{ fontSize:12, color:'#6b7280', lineHeight:1.6 }}>{T.faqDesc}</p>
        </div>
        {/* Chat Card */}
        <div className="sp-card" onClick={() => setView('chat')}
          style={{ padding:'28px 24px', borderRadius:20, border:'1px solid rgba(124,106,247,0.25)', background:'rgba(124,106,247,0.06)', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>💬</div>
          <h3 style={{ fontSize:16, fontWeight:800, marginBottom:6, fontFamily:"'Bricolage Grotesque',sans-serif", color:'#a78bfa' }}>{T.chatBtn.replace('💬 ','')}</h3>
          <p style={{ fontSize:12, color:'#6b7280', lineHeight:1.6 }}>{T.chatDesc}</p>
        </div>
      </div>

      {/* Quick FAQ preview */}
      <div style={{ maxWidth:480, width:'100%', marginTop:32, animation:'fadeUp 0.5s ease 0.2s both' }}>
        <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:12, textAlign:'center' }}>{T.quickQ}</p>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {faqs.slice(0,4).map((f,i) => (
            <div key={i} onClick={() => { setFaqOpen(faqOpen===i?null:i); setView('faq'); }}
              style={{ padding:'12px 16px', borderRadius:12, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)', cursor:'pointer', fontSize:13, color:'rgba(255,255,255,0.7)', transition:'all 0.2s' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(124,106,247,0.3)'}
              onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>
              {f.q}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── FAQ ───────────────────────────────────────────────────────────────────
  if (view === 'faq') return (
    <div style={{ minHeight:'100vh', background:'#050508', color:'#fff', padding:'80px 20px 40px', fontFamily:"'DM Sans',sans-serif", direction:dir }}>
      <div style={{ maxWidth:680, margin:'0 auto' }}>
        <button onClick={() => setView('home')} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'7px 14px', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:13, marginBottom:28 }}>{T.back}</button>

        <h2 style={{ fontSize:28, fontWeight:900, letterSpacing:'-0.5px', marginBottom:8, fontFamily:"'Bricolage Grotesque',sans-serif" }}>
          {isAr ? 'الأسئلة الشائعة' : 'Frequently Asked Questions'}
        </h2>
        <p style={{ color:'#6b7280', marginBottom:32, fontSize:14 }}>{isAr ? 'اضغط على أي سؤال لرؤية الإجابة' : 'Tap any question to see the answer'}</p>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {faqs.map((f,i) => (
            <div key={i} style={{ borderRadius:14, border:`1px solid ${faqOpen===i?'rgba(124,106,247,0.35)':'rgba(255,255,255,0.07)'}`, background:faqOpen===i?'rgba(124,106,247,0.07)':'rgba(255,255,255,0.02)', overflow:'hidden', transition:'all 0.2s' }}>
              <button onClick={() => setFaqOpen(faqOpen===i?null:i)}
                style={{ width:'100%', padding:'16px 18px', background:'none', border:'none', color:'#fff', fontSize:14, fontWeight:600, cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', textAlign:isAr?'right':'left', direction:dir, fontFamily:"'DM Sans',sans-serif", gap:12 }}>
                <span style={{ flex:1 }}>{f.q}</span>
                <span style={{ flexShrink:0, fontSize:16, color:'rgba(255,255,255,0.3)', transition:'transform 0.2s', transform:faqOpen===i?'rotate(180deg)':'none', display:'inline-block' }}>⌄</span>
              </button>
              {faqOpen===i && (
                <div style={{ padding:'0 18px 16px', color:'rgba(255,255,255,0.65)', fontSize:13.5, lineHeight:1.8 }}>{f.a}</div>
              )}
            </div>
          ))}
        </div>

        {/* CTA to chat */}
        <div style={{ marginTop:32, padding:'20px 24px', borderRadius:16, border:'1px solid rgba(124,106,247,0.2)', background:'rgba(124,106,247,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>{isAr?'لم تجد إجابتك؟':'Didn\'t find your answer?'}</div>
            <div style={{ fontSize:12, color:'#6b7280' }}>{isAr?'تحدث مع فريق الدعم مباشرة':'Talk directly with our support team'}</div>
          </div>
          <button onClick={() => setView('chat')}
            style={{ padding:'10px 20px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#7c6af7,#a855f7)', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit' }}>
            {T.chatBtn} →
          </button>
        </div>
      </div>
    </div>
  );

  // ── CHAT ──────────────────────────────────────────────────────────────────
  if (view === 'chat') return (
    <div style={{ minHeight:'100vh', background:'#050508', color:'#fff', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',sans-serif", direction:dir }}>
      {/* Header */}
      <div style={{ position:'sticky', top:56, zIndex:10, background:'rgba(5,5,8,0.95)', backdropFilter:'blur(20px)', borderBottom:'1px solid rgba(255,255,255,0.07)', padding:'16px 20px', display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => setView('home')} style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 12px', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:12 }}>{T.back}</button>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:12, background:'linear-gradient(135deg,#7c6af7,#a855f7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>💬</div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{isAr?'دعم Erivion':'Erivion Support'}</div>
            <div style={{ fontSize:11, color:'#22c55e', display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e' }} />
              {isAr?'متصل الآن':'Online now'}
            </div>
          </div>
        </div>
      </div>

      {!chatStarted ? (
        // ── Start Chat Form ──
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px' }}>
          <div style={{ maxWidth:420, width:'100%' }}>
            <h2 style={{ fontSize:24, fontWeight:900, marginBottom:8, fontFamily:"'Bricolage Grotesque',sans-serif" }}>
              {isAr?'ابدأ المحادثة':'Start a conversation'}
            </h2>
            <p style={{ fontSize:14, color:'#6b7280', marginBottom:28, lineHeight:1.6 }}>
              {isAr?'أدخل بياناتك وسيرد عليك أحد أعضاء فريقنا خلال دقائق.':'Enter your details and a team member will reply within minutes.'}
            </p>

            {/* Quick FAQ before chat */}
            <div style={{ marginBottom:24 }}>
              <p style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>{T.quickQ}</p>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {faqs.slice(0,4).map((f,i) => (
                  <div key={i}
                    style={{ padding:'10px 14px', borderRadius:10, border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)', cursor:'pointer', fontSize:12.5, color:'rgba(255,255,255,0.65)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, transition:'all 0.15s' }}
                    onClick={() => { setFaqOpen(i); setView('faq'); }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(124,106,247,0.3)'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='rgba(255,255,255,0.07)'}>
                    <span>{f.q}</span>
                    <span style={{ color:'#7c6af7', fontSize:11, flexShrink:0 }}>{isAr?'إجابة ←':'answer ←'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height:1, background:'rgba(255,255,255,0.06)', marginBottom:24 }} />

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.4)', display:'block', marginBottom:6 }}>{T.nameLabel}</label>
                <input value={name} onChange={e=>setName(e.target.value)} placeholder={isAr?'اسمك الكريم...':'Your name...'}
                  style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:14, outline:'none', boxSizing:'border-box', direction:dir }} />
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.4)', display:'block', marginBottom:6 }}>{T.emailLabel}</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@example.com"
                  style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.04)', color:'#fff', fontSize:14, outline:'none', boxSizing:'border-box', direction:'ltr' }} />
              </div>
              <button onClick={startChat} disabled={!name.trim()||!email.trim()||sending}
                style={{ padding:'14px', borderRadius:12, border:'none', background:!name.trim()||!email.trim()?'rgba(255,255,255,0.06)':'linear-gradient(135deg,#7c6af7,#a855f7)', color:!name.trim()||!email.trim()?'#374151':'#fff', fontWeight:700, fontSize:15, cursor:!name.trim()||!email.trim()?'not-allowed':'pointer', boxShadow:name.trim()&&email.trim()?'0 4px 20px rgba(124,106,247,0.4)':'none', transition:'all 0.2s', fontFamily:'inherit' }}>
                {sending?'⏳ ...':T.startBtn}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // ── Chat Messages ──
        <>
          <div style={{ flex:1, overflowY:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:12 }}>
            {messages.map((m,i) => {
              const align = m.role==='user' ? (isAr?'flex-start':'flex-end') : m.role==='admin' ? (isAr?'flex-end':'flex-start') : 'center';
              const timeStyle = isAr ? { fontSize:10, color:'rgba(255,255,255,0.2)', marginTop:3, marginRight:8 } : { fontSize:10, color:'rgba(255,255,255,0.2)', marginTop:3, marginLeft:8 };
              const labelStyle = isAr ? { fontSize:10, color:'rgba(255,255,255,0.25)', marginBottom:4, marginRight:8 } : { fontSize:10, color:'rgba(255,255,255,0.25)', marginBottom:4, marginLeft:8 };
              return (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: align }}>
                {m.role === 'system' ? (
                  <div style={{ padding:'8px 16px', borderRadius:20, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', fontSize:12, color:'rgba(255,255,255,0.4)', textAlign:'center', maxWidth:320 }}>{m.text}</div>
                ) : (
                  <>
                    <div style={labelStyle}>
                      {m.role==='user'?T.youLabel:T.supportLbl}
                    </div>
                    <div style={{ maxWidth:'75%', padding:'12px 16px', borderRadius:16, fontSize:13.5, lineHeight:1.7, whiteSpace:'pre-line',
                      background: m.role==='user' ? 'linear-gradient(135deg,#7c6af7,#a855f7)' : 'rgba(255,255,255,0.07)',
                      color: m.role==='user' ? '#fff' : 'rgba(255,255,255,0.85)',
                      border: m.role==='admin' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                      borderBottomRightRadius: m.role==='user'&&!isAr ? 4 : 16,
                      borderBottomLeftRadius: m.role==='user'&&isAr ? 4 : m.role==='admin'&&!isAr ? 4 : 16,
                    }}>{m.text}</div>
                    <div style={timeStyle}>
                      {new Date(m.time).toLocaleTimeString(isAr?'ar':'en', {hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </>
                )}
              </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div style={{ borderTop:'1px solid rgba(255,255,255,0.07)', padding:'12px 16px', background:'rgba(5,5,8,0.95)', backdropFilter:'blur(20px)', display:'flex', gap:10, alignItems:'flex-end' }}>
            <textarea value={input} onChange={e=>setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }}
              placeholder={T.typeMsg} rows={1}
              style={{ flex:1, padding:'11px 14px', borderRadius:12, border:'1px solid rgba(255,255,255,0.1)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:14, outline:'none', resize:'none', fontFamily:'inherit', direction:dir, lineHeight:1.5, maxHeight:120, overflowY:'auto' }} />
            <button onClick={sendMessage} disabled={!input.trim()||sending}
              style={{ flexShrink:0, width:44, height:44, borderRadius:12, border:'none', background:input.trim()?'linear-gradient(135deg,#7c6af7,#a855f7)':'rgba(255,255,255,0.06)', color:input.trim()?'#fff':'#374151', fontSize:18, cursor:input.trim()?'pointer':'not-allowed', display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>
              {sending?'⏳':'→'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}