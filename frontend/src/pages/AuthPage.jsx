import React, { useState, useEffect, useRef } from 'react';

const LOGO = 'https://i.ibb.co/xK4Sq6fP/Chat-GPT-Image-19-2026-09-08-47-Photoroom.png';

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
              fontSize: 18, boxShadow: '0 4px 14px rgba(124,106,247,0.4)',
            }}>📋</div>
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
          <Section title="1. Acceptance of Terms">By accessing or using Erivion ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</Section>
          <Section title="2. Prohibited Content">Users are strictly prohibited from generating content that includes: sexually explicit or adult material, graphic violence or gore, content that promotes hatred, discrimination, or harm toward any individual or group, content that facilitates illegal activities, misinformation or deceptive material, content involving minors in inappropriate contexts, or any content that violates applicable laws. Erivion uses automated and manual moderation to detect and remove prohibited content. Violations will result in immediate account termination.</Section>
          <Section title="3. Account Responsibilities">You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate information during registration.</Section>
          <Section title="4. Intellectual Property">Videos generated through Erivion using your original inputs are owned by you, subject to these Terms. Erivion retains rights to the platform, technology, and any pre-existing materials.</Section>
          <Section title="5. Service Availability">Erivion strives for high availability but does not guarantee uninterrupted access. We reserve the right to modify, suspend, or discontinue the Service at any time with reasonable notice.</Section>
          <Section title="6. Limitation of Liability">Erivion is not liable for indirect, incidental, or consequential damages arising from your use of the Service. Our total liability shall not exceed the amount you paid in the 12 months preceding the claim.</Section>
          <Section title="7. Payments & Refunds">Egyptian users pay via InstaPay (manual approval). International users pay via Gumroad. Refunds are available within 4 hours of subscription activation if no videos have been generated. After 4 hours, refunds are not issued except in cases of verified technical failure on our end.</Section>
          <Section title="8. Privacy">We collect your email and usage data to operate the Service. We do not sell your data. Erivion is completely ad-free. For full details, see our Privacy Policy at erivion.net/privacy.</Section>
          <Section title="9. Changes to Terms">We may update these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.</Section>
          <Section title="10. Contact">For questions about these Terms, contact us at digidelight33@gmail.com.</Section>
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
              {agreed && <span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
              I have read and agree to the <strong style={{ color: 'var(--accent2)' }}>Terms of Service</strong> and <strong style={{ color: 'var(--accent2)' }}>Privacy Policy</strong>. I understand that generating prohibited content will result in account termination.
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
  { id: 'facebook',  label: 'Facebook',  icon: '👥', color: '#1877f2' },
  { id: 'google',    label: 'Google',    icon: '🔍', color: '#4285f4' },
  { id: 'instagram', label: 'Instagram', icon: '📸', color: '#e1306c' },
  { id: 'tiktok',    label: 'TikTok',    icon: '🎵', color: '#69c9d0' },
  { id: 'youtube',   label: 'YouTube',   icon: '▶️',  color: '#ff0000' },
  { id: 'friend',    label: 'A Friend',  icon: '🤝', color: '#22c55e' },
  { id: 'other',     label: 'Other',     icon: '✨', color: '#9ca3af' },
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
            fontSize: 28,
            animation: 'bounceIn 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}>🌐</div>
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
                <span style={{ fontSize: 20 }}>{src.icon}</span>
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
                    <span style={{ color: '#fff', fontSize: 11, fontWeight: 900 }}>✓</span>
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


// ─── Model Recommendation Step ────────────────────────────────────────────────
const RECOMMEND_QUESTIONS = [
  {
    id: 'content_type',
    question: 'ما نوع المحتوى الذي تريد إنشاءه؟ / What content do you create?',
    options: [
      { id: 'educational', label: '📚 تعليمي / Educational', icon: '📚' },
      { id: 'storytelling', label: '📖 قصص وروايات / Storytelling', icon: '📖' },
      { id: 'marketing', label: '📢 تسويق / Marketing', icon: '📢' },
      { id: 'entertainment', label: '🎭 ترفيه / Entertainment', icon: '🎭' },
    ],
  },
  {
    id: 'style',
    question: 'ما الأسلوب المفضل لديك؟ / Preferred visual style?',
    options: [
      { id: 'realistic', label: '🎥 مقاطع حقيقية / Real footage', icon: '🎥' },
      { id: 'ai_images', label: '🖼️ صور ذكاء اصطناعي / AI images', icon: '🖼️' },
      { id: 'ai_video', label: '🤖 فيديو ذكاء اصطناعي / AI video', icon: '🤖' },
      { id: 'cinematic', label: '🎬 سينمائي / Cinematic', icon: '🎬' },
    ],
  },
  {
    id: 'budget',
    question: 'ما ميزانيتك الشهرية تقريباً؟ / Approximate monthly budget?',
    options: [
      { id: 'free', label: '🆓 مجاناً / Free', icon: '🆓' },
      { id: 'low', label: '💚 منخفضة / Low (≤100 EGP)', icon: '💚' },
      { id: 'medium', label: '💛 متوسطة / Medium (≤250 EGP)', icon: '💛' },
      { id: 'high', label: '💎 عالية / High (250+ EGP)', icon: '💎' },
    ],
  },
];

const MODEL_RECOMMENDATION = {
  'educational-realistic-free':   'model2',
  'educational-realistic-low':    'model2',
  'educational-realistic-medium': 'model2',
  'educational-ai_images-free':   'model1',
  'educational-ai_images-low':    'model1',
  'storytelling-ai_images-low':   'model1',
  'storytelling-ai_video-medium': 'model4',
  'storytelling-cinematic-high':  'cinematic',
  'marketing-realistic-medium':   'model2',
  'marketing-ai_images-medium':   'model3',
  'entertainment-cinematic-high': 'cinematic',
  'entertainment-ai_video-high':  'model4',
};

const MODEL_INFO = {
  model1:    { name: 'AI Slices (Model 1)',          icon: '🖼️', color: '#7c6af7', desc: 'صور ذكاء اصطناعي مع Ken Burns — مثالي للمحتوى التعليمي والتوثيقي' },
  model2:    { name: 'Real Footage (Model 2)',       icon: '🎥', color: '#06b6d4', desc: 'مقاطع حقيقية من Pexels — مثالي للمحتوى الاحترافي' },
  model3:    { name: 'AI Images (Model 3)',          icon: '✨', color: '#f59e0b', desc: 'صور ذكاء اصطناعي فريدة لكل مشهد — جودة احترافية عالية' },
  model4:    { name: 'Seedance AI (Model 4)',        icon: '🎬', color: '#a855f7', desc: 'مقاطع فيديو حقيقية بالذكاء الاصطناعي — حركة سينمائية مذهلة' },
  cinematic: { name: 'Cinematic AI (Model 5)',       icon: '🎭', color: '#e11d48', desc: 'شخصيات متسقة وقصص بصرية سينمائية بدون تعليق صوتي' },
  atlas:     { name: 'Atlas Map Video (Model 6)',    icon: '🗺️', color: '#22c55e', desc: 'خرائط جغرافية متحركة — مثالي للمحتوى الجغرافي والتاريخي' },
};

function getRecommendation(answers) {
  const key = `${answers.content_type}-${answers.style}-${answers.budget}`;
  if (MODEL_RECOMMENDATION[key]) return MODEL_RECOMMENDATION[key];
  // Fallback logic
  if (answers.style === 'cinematic') return 'cinematic';
  if (answers.style === 'ai_video') return 'model4';
  if (answers.style === 'ai_images') return answers.budget === 'free' || answers.budget === 'low' ? 'model1' : 'model3';
  if (answers.style === 'realistic') return 'model2';
  return 'model1';
}

function ModelRecommendStep({ onContinue }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [recommended, setRecommended] = useState(null);
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(null);

  useEffect(() => { const t = setTimeout(() => setVisible(true), 50); return () => clearTimeout(t); }, []);

  const handleAnswer = (optionId) => {
    const q = RECOMMEND_QUESTIONS[currentQ];
    const newAnswers = { ...answers, [q.id]: optionId };
    setAnswers(newAnswers);
    if (currentQ < RECOMMEND_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      const rec = getRecommendation(newAnswers);
      setRecommended(rec);
    }
  };

  const q = RECOMMEND_QUESTIONS[currentQ];
  const modelInfo = recommended ? MODEL_INFO[recommended] : null;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(0,0,0,0.88)', display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(8px)', opacity:visible?1:0, transition:'opacity 0.35s ease' }}>
      <div style={{ background:'var(--bg)', border:'1px solid rgba(124,106,247,0.25)', borderRadius:24, width:'100%', maxWidth:520, padding:'36px 32px', boxShadow:'0 32px 80px rgba(0,0,0,0.6)', transform:visible?'translateY(0) scale(1)':'translateY(28px) scale(0.96)', transition:'transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.35s ease', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', top:-80, left:'50%', transform:'translateX(-50%)', width:300, height:200, background:'radial-gradient(circle, rgba(124,106,247,0.12) 0%, transparent 70%)', pointerEvents:'none' }} />

        {!recommended ? (
          <>
            {/* Progress */}
            <div style={{ display:'flex', gap:6, marginBottom:28 }}>
              {RECOMMEND_QUESTIONS.map((_, i) => (
                <div key={i} style={{ flex:1, height:3, borderRadius:3, background: i <= currentQ ? '#7c6af7' : 'var(--border)', transition:'background 0.3s' }} />
              ))}
            </div>
            <div style={{ textAlign:'center', marginBottom:28 }}>
              <div style={{ width:56, height:56, borderRadius:16, margin:'0 auto 14px', background:'linear-gradient(135deg, rgba(124,106,247,0.2), rgba(160,143,248,0.1))', border:'1px solid rgba(124,106,247,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>🎯</div>
              <h2 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:'0 0 6px' }}>نرشح لك الموديل المناسب</h2>
              <p style={{ fontSize:13, color:'var(--text3)', margin:0 }}>We\'ll recommend the best model for you</p>
            </div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:16, textAlign:'center', lineHeight:1.5 }}>{q.question}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {q.options.map(opt => (
                <button key={opt.id} onClick={() => handleAnswer(opt.id)}
                  onMouseEnter={() => setHovered(opt.id)} onMouseLeave={() => setHovered(null)}
                  style={{ padding:'14px 12px', borderRadius:14, border: hovered===opt.id ? '2px solid #7c6af7' : '2px solid var(--border)', background: hovered===opt.id ? 'rgba(124,106,247,0.1)' : 'var(--bg)', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8, transition:'all 0.2s', transform: hovered===opt.id ? 'scale(1.02)' : 'scale(1)' }}>
                  <span style={{ fontSize:24 }}>{opt.icon}</span>
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--text2)', textAlign:'center' }}>{opt.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => onContinue(null)} style={{ width:'100%', padding:'10px', background:'transparent', border:'none', color:'var(--text3)', fontSize:13, cursor:'pointer' }}>
              تخطي / Skip
            </button>
          </>
        ) : (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:56, marginBottom:12 }}>{modelInfo?.icon}</div>
            <h2 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:'0 0 8px' }}>الموديل المناسب لك!</h2>
            <p style={{ fontSize:13, color:'#9ca3af', marginBottom:24 }}>Based on your answers, we recommend:</p>
            <div style={{ background:`${modelInfo?.color}15`, border:`1px solid ${modelInfo?.color}40`, borderRadius:16, padding:'20px 24px', marginBottom:28 }}>
              <div style={{ fontSize:18, fontWeight:800, color: modelInfo?.color, marginBottom:8 }}>{modelInfo?.name}</div>
              <div style={{ fontSize:14, color:'#d1d5db', lineHeight:1.6 }}>{modelInfo?.desc}</div>
            </div>
            <button onClick={() => onContinue(recommended, answers)} style={{ width:'100%', padding:'14px', background:'linear-gradient(135deg,#7c6af7,#a08ff8)', border:'none', borderRadius:12, color:'#fff', fontWeight:700, fontSize:15, cursor:'pointer', boxShadow:'0 4px 20px rgba(124,106,247,0.4)', marginBottom:10 }}>
              ابدأ الآن / Get Started →
            </button>
            <button onClick={() => onContinue(null, answers)} style={{ width:'100%', padding:'10px', background:'transparent', border:'none', color:'var(--text3)', fontSize:13, cursor:'pointer' }}>
              استكشف جميع الموديلات / Explore all models
            </button>
          </div>
        )}
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
              <Section title="1. Acceptance of Terms">By accessing or using Erivion ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</Section>
              <Section title="2. Prohibited Content">Users are strictly prohibited from generating content that includes: sexually explicit or adult material, graphic violence or gore, content that promotes hatred, discrimination, or harm, illegal activities, misinformation, content involving minors, or any content that violates applicable laws. Violations result in immediate account termination.</Section>
              <Section title="3. Account Responsibilities">You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must provide accurate information during registration.</Section>
              <Section title="4. Intellectual Property">Videos generated through Erivion using your original inputs are owned by you, subject to these Terms. Erivion retains rights to the platform, technology, and any pre-existing materials.</Section>
              <Section title="5. Payments">Egyptian users pay via InstaPay (manual approval within 24 hours). International users pay via Gumroad using a credit or debit card. Subscription plans renew automatically unless cancelled.</Section>
              <Section title="6. Refund Policy">Refunds are available within 4 hours of subscription activation if no videos have been generated. After 4 hours, refunds are not issued except in cases of verified technical failure. For full details, visit erivion.net/refund.</Section>
              <Section title="7. Service Availability">Erivion strives for high availability but does not guarantee uninterrupted access. We reserve the right to modify or discontinue the Service with reasonable notice.</Section>
              <Section title="8. Limitation of Liability">Erivion is not liable for indirect, incidental, or consequential damages. Our total liability shall not exceed the amount you paid in the 12 months preceding the claim.</Section>
              <Section title="9. Changes to Terms">We may update these Terms at any time. Continued use constitutes acceptance.</Section>
              <Section title="10. Contact">For questions, contact us at digidelight33@gmail.com.</Section>
            </>
          ) : (
            <>
              <Section title="1. Information We Collect">We collect information you provide directly (email, name, profile data), usage data (videos created, features used), and technical data (IP address, browser type) to operate and improve the Service.</Section>
              <Section title="2. How We Use Your Information">We use your information to provide and maintain the Service, send transactional emails (verification codes, payment confirmations), ensure compliance with our Terms, and communicate important updates. We do not use your data for advertising.</Section>
              <Section title="3. Data Storage & Security">Your data is stored securely on Railway servers. We use industry-standard encryption for sensitive data. We do not sell your personal information to third parties.</Section>
              <Section title="4. Ad-Free Platform">Erivion is completely ad-free. We do not use Google AdSense or any advertising network. We do not track you for advertising purposes.</Section>
              <Section title="5. Payments">Egyptian users pay via InstaPay. International users pay via Gumroad (gumroad.com/privacy). We never store card details — all payment processing is handled by these providers.</Section>
              <Section title="6. Third-Party Services">Erivion integrates with: Google OAuth (policies.google.com/privacy), Groq AI (groq.com/privacy), Pexels (pexels.com/privacy-policy), Stability AI (stability.ai/privacy-policy), Gumroad (gumroad.com/privacy).</Section>
              <Section title="7. Your Rights">You may request access to, correction of, or deletion of your personal data by contacting us at digidelight33@gmail.com.</Section>
              <Section title="8. Cookies">We use local storage only for login session management and preferences. No advertising or tracking cookies are used.</Section>
              <Section title="9. Contact">For privacy concerns, contact us at digidelight33@gmail.com or through the Support page.</Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main AuthPage ────────────────────────────────────────────────────────────
export default function AuthPage({ onAuth }) {
  const [mode, setMode]           = useState('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [code, setCode]           = useState('');
  const [step, setStep]           = useState('form'); // form | verify | terms | survey | recommend
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [legalModal, setLegalModal] = useState(null);
  const [pendingAuthData, setPendingAuthData] = useState(null);
  const [surveySource, setSurveySource] = useState(null);

  useEffect(() => {
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
        // مستخدم قديم — يدخل مباشرة
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
      setPendingAuthData(data);
      setStep('terms');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleTermsAgree = () => {
    localStorage.setItem('termsAccepted', 'true');
    setStep('survey');
  };

  const handleSurveyDone = (source) => {
    if (source !== 'skipped') {
      fetch('/api/auth/referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + (pendingAuthData?.token || localStorage.getItem('token')),
        },
        body: JSON.stringify({ source }),
      }).catch(() => {});
    }
    setSurveySource(source);
    localStorage.removeItem('erivion_ref');
    setStep('recommend');
  };

  const handleRecommendDone = (modelKey, answers) => {
    if (modelKey) localStorage.setItem('erivion_recommended_model', modelKey);
    // احفظ كل إجابات الـ onboarding في الـ DB
    fetch('/api/auth/onboarding-answers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + (pendingAuthData?.token || localStorage.getItem('token')),
      },
      body: JSON.stringify({ source: surveySource, ...(answers || {}) }),
    }).catch(() => {});
    onAuth(pendingAuthData);
  };

  return (
    <>
      {step === 'terms'  && <TermsStep  onAgree={handleTermsAgree} />}
      {step === 'survey' && <SurveyStep onContinue={handleSurveyDone} />}
      {step === 'recommend' && <ModelRecommendStep onContinue={handleRecommendDone} />}
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

            {/* Features */}
            {[
              { icon: '⚡', title: 'Instant Generation',  desc: 'Create HD videos in under 2 minutes', color: '#fbbf24' },
              { icon: '🎙️', title: 'Natural Voiceovers',  desc: '8+ languages, multiple voice styles',  color: '#34d399' },
              { icon: '🎬', title: 'Professional Quality',desc: 'Captions, music, transitions & effects', color: '#a78bfa' },
            ].map((f, i) => (
              <div key={i} className="feat-item" data-delay={i * 80}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20, padding: '14px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', transition: 'all 0.3s' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: `${f.color}18`, border: `1px solid ${f.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{f.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#fff', marginBottom: 3, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{f.desc}</div>
                </div>
              </div>
            ))}

            {/* Social proof */}
            <div style={{ marginTop: 36, padding: '14px 20px', borderRadius: 12, background: 'rgba(124,106,247,0.08)', border: '1px solid rgba(124,106,247,0.2)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex' }}>
                {['🟣','🔵','🟢','🟡'].map((c,i) => <div key={i} style={{ width: 28, height: 28, borderRadius: '50%', background: ['#7c6af7','#06b6d4','#22c55e','#f59e0b'][i], border: '2px solid rgba(0,0,0,0.5)', marginLeft: i > 0 ? -8 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>😊</div>)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>10,000+ videos created</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>by creators worldwide</div>
              </div>
            </div>
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
                    {mode === 'login' ? 'Welcome back 👋' : 'Get started free'}
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
                </div>

                {error && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}

                <button onClick={handleSubmit} disabled={loading} className="submit-btn"
                  style={{ width: '100%', marginTop: 16, padding: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.15s', opacity: loading ? 0.7 : 1, boxShadow: '0 2px 12px rgba(124,106,247,0.3)' }}>
                  {loading ? '⏳ Please wait...' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
                </button>

                <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 18, lineHeight: 1.7 }}>
                  By continuing, you agree to our{' '}
                  <a href="#" onClick={e => { e.preventDefault(); setLegalModal('terms'); }} style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Terms</a>
                  {' '}&amp;{' '}
                  <a href="#" onClick={e => { e.preventDefault(); setLegalModal('privacy'); }} style={{ color: 'var(--accent2)', textDecoration: 'none' }}>Privacy Policy</a>.
                  Content involving violence, explicit material, or harm is strictly prohibited.
                </p>
              </>
            )}

            {/* ── Verify email ── */}
            {step === 'verify' && (
              <div style={{ animation: 'fadeUp 0.4s ease forwards' }}>
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px', background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📧</div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>Check your email</h2>
                  <p style={{ fontSize: 13, color: 'var(--text3)', lineHeight: 1.6 }}>We sent a 6-character code to<br /><strong style={{ color: 'var(--accent2)' }}>{email}</strong></p>
                </div>
                <input type="text" placeholder="A1B2C3" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} className="auth-input"
                  style={{ width: '100%', padding: '16px', borderRadius: 12, border: '2px solid var(--border)', background: 'var(--bg2)', color: 'var(--accent)', fontSize: 28, fontWeight: 800, textAlign: 'center', letterSpacing: 12, boxSizing: 'border-box', transition: 'all 0.15s' }} />
                {error && <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--red)', fontSize: 13 }}>{error}</div>}
                <button onClick={handleVerify} disabled={loading || code.length !== 6} className="submit-btn"
                  style={{ width: '100%', marginTop: 16, padding: '13px', background: code.length === 6 ? 'var(--accent)' : 'var(--bg3)', color: code.length === 6 ? '#fff' : 'var(--text3)', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15, cursor: (loading || code.length !== 6) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}>
                  {loading ? '⏳ Verifying...' : 'Verify & Continue →'}
                </button>
                <button onClick={() => { setStep('form'); setError(''); setCode(''); }}
                  style={{ width: '100%', marginTop: 10, padding: '10px', background: 'transparent', border: 'none', color: 'var(--text3)', fontSize: 13, cursor: 'pointer' }}>
                  ← Back to sign in
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}