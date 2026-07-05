import React, { useState, useRef, useEffect } from 'react';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}
function tokenHeader() {
  return { Authorization: 'Bearer ' + localStorage.getItem('token') };
}

const isArabic = (text) => /[\u0600-\u06FF]/.test(text || '');

const T = {
  ar: {
    heroTitle: 'إيه الفيديو اللي في بالك؟',
    heroSub: 'قولّي فكرتك، وأنا هختار الموديل المناسب، أحسبلك الكريديت، وأعمل الفيديو معاك هنا في الشات.',
    placeholder: 'اكتب فكرة الفيديو، أو سكريبت جاهز...',
    chips: [
      { icon: '🛍️', label: 'إعلان منتج', text: 'عايز أعمل إعلان لمنتجي' },
      { icon: '🎬', label: 'فيديو قصير', text: 'عايز أعمل فيديو قصير لسوشيال ميديا' },
      { icon: '📝', label: 'استخدم سكريبتي', text: 'عندي سكريبت جاهز وعايز أحوله لفيديو' },
      { icon: '🎓', label: 'فيديو تعليمي', text: 'عايز أعمل فيديو تعليمي بأسلوب سينمائي' },
    ],
    models: 'الموديلات',
    voiceTitle: (m) => `صوت (حتى ${m} دقيقة)`,
    imageTitle: 'رفع صورة (منتج/شخصية)',
    onlyVideo: 'هذا المساعد يجاوب فقط على أسئلة إنشاء الفيديوهات',
    voiceAttached: 'تسجيل صوتي مرفق',
    imageAttached: 'صورة مرفقة',
    voiceTooBig: (m) => `حجم الصوت أكبر من ${m}MB`,
    voiceTooLong: (m) => `التسجيل أطول من ${m} دقيقة`,
    imageTooBig: (m) => `حجم الصورة أكبر من ${m}MB`,
    generating: 'جاري تجهيز المشاهد...',
    rendering: 'جاري إنشاء الفيديو...',
    done: 'تم! تم خصم',
    credits: 'كريديت',
    download: 'تحميل',
    failed: 'حصلت مشكلة أثناء إنشاء الفيديو',
    goToPricing: 'اذهب لصفحة الأسعار →',
    uploadCharacterFirst: 'ارفع صورة الشخصية الأول من زر 🖼️ تحت',
  },
  en: {
    heroTitle: 'What video do you have in mind?',
    heroSub: "Tell me your idea — I'll pick the right model, calculate the credits, and make the video right here in chat.",
    placeholder: 'Describe your video idea, or paste a script...',
    chips: [
      { icon: '🛍️', label: 'Product Ad', text: 'I want to make an ad for my product' },
      { icon: '🎬', label: 'Short video', text: 'I want a short video for social media' },
      { icon: '📝', label: 'Use my script', text: 'I have a script ready, turn it into a video' },
      { icon: '🎓', label: 'Explainer video', text: 'I want a cinematic explainer video' },
    ],
    models: 'Models',
    voiceTitle: (m) => `Voice (up to ${m} min)`,
    imageTitle: 'Upload image (product/character)',
    onlyVideo: 'This assistant only answers video-creation questions',
    voiceAttached: 'Voice attached',
    imageAttached: 'Image attached',
    voiceTooBig: (m) => `Voice file exceeds ${m}MB`,
    voiceTooLong: (m) => `Recording longer than ${m} minutes`,
    imageTooBig: (m) => `Image exceeds ${m}MB`,
    generating: 'Preparing scenes...',
    rendering: 'Generating your video...',
    done: 'Done! Deducted',
    credits: 'credits',
    download: 'Download',
    failed: 'Something went wrong generating the video',
    goToPricing: 'Go to Pricing →',
    uploadCharacterFirst: 'Upload the character photo first with the 🖼️ button below',
  },
};

const RATIO_BOX = { '9:16': { w: 152, h: 270 }, '16:9': { w: 270, h: 152 }, '1:1': { w: 200, h: 200 } };
const MODEL_STYLE_DEFAULTS = { 3: 'cinematic', 4: 'cinematic', 5: 'cinematic' };
const MODEL3_IMAGE_COUNT = { '30s': 3, '1min': 6, '3min': 18, '5min': 30 };
const MODEL4_SCENE_COUNT = { '30s': 4, '1min': 8, '3min': 24 };

function RenderCard({ job, lang, onNavigate }) {
  const box = RATIO_BOX[job.ratio] || RATIO_BOX['9:16'];
  const t = T[lang];

  if (job.status === 'done') {
    return (
      <div style={{ width: box.w + 20 }}>
        <video src={job.videoUrl} controls autoPlay muted loop style={{ width: box.w, height: box.h, borderRadius: 14, objectFit: 'cover', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✅ {t.done} {job.cost || ''} {t.credits}</span>
          <a href={job.videoUrl} download style={{ fontSize: 11, color: '#a99bff', fontWeight: 700, textDecoration: 'none' }}>⬇️ {t.download}</a>
        </div>
      </div>
    );
  }

  if (job.status === 'failed') {
    return (
      <div style={{ maxWidth: 280, padding: '12px 16px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ fontSize: 13, color: '#ef4444', marginBottom: job.creditError ? 8 : 0 }}>⚠️ {job.error || t.failed}</div>
        {job.creditError && (
          <button onClick={() => onNavigate && onNavigate('pricing')} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontSize: 12, padding: 0 }}>{t.goToPricing}</button>
        )}
      </div>
    );
  }

  return (
    <div style={{ width: box.w + 20 }}>
      <div style={{
        width: box.w, height: box.h, borderRadius: 14, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, rgba(124,106,247,0.18), rgba(0,0,0,0.6))',
        border: '1px solid rgba(124,106,247,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <style>{`
          @keyframes shimmerMove{0%{background-position:-150px 0}100%{background-position:150px 0}}
          @keyframes pulseGlow{0%,100%{opacity:0.5}50%{opacity:1}}
        `}</style>
        <div style={{ fontSize: 28, animation: 'pulseGlow 1.6s ease infinite' }}>🎬</div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{ height: '100%', width: '60%', background: 'linear-gradient(90deg, transparent, #a99bff, transparent)', backgroundSize: '150px 100%', animation: 'shimmerMove 1.2s linear infinite' }} />
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        {job.status === 'scenes' ? t.generating : t.rendering}
        {job.elapsed > 0 && <span> ⏱ {Math.floor(job.elapsed / 60)}:{String(job.elapsed % 60).padStart(2, '0')}</span>}
      </div>
    </div>
  );
}

export default function AgentPage({ onNavigate, onSwitchToModels }) {
  const region = localStorage.getItem('erivion_region') || 'eg';
  const lang = region === 'eg' ? 'ar' : 'en';
  const t = T[lang];

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voiceFile, setVoiceFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [limits, setLimits] = useState({ MAX_AUDIO_SEC: 120, MAX_AUDIO_MB: 10, MAX_IMAGE_MB: 5 });
  const [lastUploadedPhoto, setLastUploadedPhoto] = useState(null);
  const voiceInputRef = useRef();
  const imageInputRef = useRef();
  const scrollRef = useRef();
  const pollRef = useRef(null);

  const started = messages.length > 0;

  useEffect(() => {
    fetch('/api/agent/limits', { headers: tokenHeader() }).then(r => r.json()).then(setLimits).catch(() => {});
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const handleVoiceFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    if (file.size > limits.MAX_AUDIO_MB * 1024 * 1024) { setError(t.voiceTooBig(limits.MAX_AUDIO_MB)); return; }
    const audio = new Audio(URL.createObjectURL(file));
    audio.onloadedmetadata = () => {
      if (audio.duration > limits.MAX_AUDIO_SEC) { setError(t.voiceTooLong(limits.MAX_AUDIO_SEC / 60)); return; }
      setVoiceFile(file);
    };
  };

  const handleImageFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    if (file.size > limits.MAX_IMAGE_MB * 1024 * 1024) { setError(t.imageTooBig(limits.MAX_IMAGE_MB)); return; }
    const reader = new FileReader();
    reader.onload = (ev) => { setImageFile(ev.target.result); setImagePreview(ev.target.result); setLastUploadedPhoto(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const sendMessage = async (overrideText) => {
    const textToSend = overrideText !== undefined ? overrideText : input;
    if (!textToSend.trim() && !voiceFile && !imageFile) return;
    setError('');
    const userMsg = { role: 'user', content: textToSend.trim() || (lang === 'ar' ? '🎙️ رسالة صوتية' : '🎙️ Voice message'), hasVoice: !!voiceFile, imagePreview };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    const currentVoice = voiceFile, currentImage = imageFile;
    setInput(''); setVoiceFile(null); setImageFile(null); setImagePreview(null);
    setLoading(true);

    try {
      const body = {
        message: textToSend.trim() || (lang === 'ar' ? 'من الصوت/الصورة المرفوعة' : 'from the attached voice/image'),
        history: nextMessages.slice(0, -1).slice(-6).map(m => ({ role: m.role, content: m.content })),
      };
      if (currentVoice) body.voiceBase64 = await fileToBase64(currentVoice);
      if (currentImage) body.imageBase64 = currentImage;

      const res = await fetch('/api/agent/chat', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);

      if (data.ready) {
        if (data.ready.model === 5 && !lastUploadedPhoto) {
          setMessages(m => [...m, { role: 'assistant', content: t.uploadCharacterFirst }]);
        } else {
          startGeneration(data.ready);
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startGeneration = async (ready) => {
    const job = { status: 'scenes', ratio: ready.ratio || '9:16', elapsed: 0, model: ready.model };
    setMessages(m => [...m, { role: 'assistant', type: 'render', job }]);
    const updateJob = (patch) => {
      setMessages(m => {
        const copy = [...m];
        const idx = copy.map(x => x.type).lastIndexOf('render');
        if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
        return copy;
      });
      Object.assign(job, patch);
    };

    const prefix = `model${ready.model}`;
    const style = ready.videoStyle || MODEL_STYLE_DEFAULTS[ready.model];

    try {
      let scenesBody;
      if (ready.model === 3) {
        scenesBody = { idea: ready.idea, script: null, inputMode: 'idea', imageCount: MODEL3_IMAGE_COUNT[ready.duration] || 6, videoLanguage: lang === 'ar' ? 'ar' : 'en', ratio: ready.ratio, videoStyle: style, styleSuffix: '' };
      } else if (ready.model === 4) {
        scenesBody = { idea: ready.idea, script: undefined, inputMode: 'idea', sceneCount: MODEL4_SCENE_COUNT[ready.duration] || 8, videoLanguage: lang === 'ar' ? 'ar' : 'en', videoStyle: style, styleSuffix: '' };
      } else {
        scenesBody = { idea: ready.idea, characters: lastUploadedPhoto ? [{ prompt: '', photo: lastUploadedPhoto }] : [], duration: ready.duration, videoStyle: style, styleSuffix: '' };
      }
      const scenesRes = await fetch(`/api/${prefix}/generate-scenes`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(scenesBody) });
      const scenesData = await scenesRes.json();
      if (!scenesRes.ok) throw new Error(scenesData.error || 'Scene generation failed');
      const scenes = scenesData.scenes || [];

      updateJob({ status: 'rendering' });
      const timer = setInterval(() => updateJob({ elapsed: (job.elapsed || 0) + 1 }), 1000);

      let renderBody;
      if (ready.model === 3) {
        renderBody = { scenes, audioUrl: null, ratio: ready.ratio, captions: true, transitions: false, music: false, videoLanguage: lang === 'ar' ? 'ar' : 'en', duration: ready.duration, videoStyle: style, styleSuffix: '' };
      } else if (ready.model === 4) {
        renderBody = { scenes, audioUrl: null, ratio: ready.ratio, captions: true, music: false, videoLanguage: lang === 'ar' ? 'ar' : 'en', duration: ready.duration, inputMode: 'idea', videoStyle: style, styleSuffix: '' };
      } else {
        renderBody = { scenes, ratio: ready.ratio, duration: ready.duration, characterPhotos: lastUploadedPhoto ? [lastUploadedPhoto] : [] };
      }
      const renderRes = await fetch(`/api/${prefix}/render`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(renderBody) });
      const renderData = await renderRes.json();
      if (!renderRes.ok) {
        clearInterval(timer);
        if (renderData.error === 'quota_exceeded' || renderData.reason === 'quota_exceeded') {
          const need = renderData.cost;
          const have = renderData.remaining ?? 0;
          updateJob({ status: 'failed', creditError: true, error: lang === 'ar' ? `محتاج ${need} كريديت ومعاك ${have} بس` : `Needs ${need} credits, you have ${have}` });
          return;
        }
        if (renderData.show_upgrade || renderData.error === 'no_access' || renderData.error === 'subscribe_required') {
          updateJob({ status: 'failed', creditError: true, error: lang === 'ar' ? '🔒 محتاج خطة فعالة عشان تعمل الفيديو ده' : '🔒 You need an active plan for this video' });
          return;
        }
        throw new Error(renderData.error || 'Render failed');
      }

      const jobId = renderData.jobId;
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/render-status/${jobId}`, { headers: tokenHeader() });
          const sd = await sr.json();
          if (sd.status === 'done') {
            clearInterval(pollRef.current); clearInterval(timer);
            updateJob({ status: 'done', videoUrl: sd.videoUrl, cost: renderData.cost });
          } else if (sd.status === 'failed') {
            clearInterval(pollRef.current); clearInterval(timer);
            updateJob({ status: 'failed', error: sd.error });
          }
        } catch {}
      }, 5000);
    } catch (e) {
      updateJob({ status: 'failed', error: e.message });
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const AttachBar = () => (
    <>
      <input ref={voiceInputRef} type="file" accept="audio/*" onChange={handleVoiceFile} style={{ display: 'none' }} />
      <input ref={imageInputRef} type="file" accept="image/*" onChange={handleImageFile} style={{ display: 'none' }} />
      <button onClick={() => voiceInputRef.current?.click()} title={t.voiceTitle(limits.MAX_AUDIO_SEC / 60)}
        style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>🎙️</button>
      <button onClick={() => imageInputRef.current?.click()} title={t.imageTitle}
        style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>🖼️</button>
    </>
  );

  if (!started) {
    return (
      <div style={{ minHeight: 'calc(100vh - 74px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', background: 'radial-gradient(ellipse at top, rgba(124,106,247,0.08) 0%, transparent 55%)' }}>
        <div style={{ width: '100%', maxWidth: 680 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <button onClick={onSwitchToModels} style={{ padding: '9px 16px', borderRadius: 10, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', color: '#a99bff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              🎬 {t.models} →
            </button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, margin: '0 auto 18px', boxShadow: '0 8px 28px rgba(124,106,247,0.4)' }}>🤖</div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 10px', direction: isArabic(t.heroTitle) ? 'rtl' : 'ltr' }}>{t.heroTitle}</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7, direction: isArabic(t.heroSub) ? 'rtl' : 'ltr' }}>{t.heroSub}</p>
          </div>

          {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12, marginBottom: 14 }}>{error}</div>}

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 16 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t.placeholder}
              rows={3}
              autoFocus
              style={{ width: '100%', resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 15, fontFamily: 'inherit', direction: isArabic(input) ? 'rtl' : 'ltr' }}
            />
            {(voiceFile || imagePreview) && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                {voiceFile && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: '#a99bff' }}>🎙️ {t.voiceAttached} <button onClick={() => setVoiceFile(null)} style={{ background: 'none', border: 'none', color: '#a99bff', cursor: 'pointer' }}>✕</button></div>}
                {imagePreview && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: '#a99bff' }}>🖼️ {t.imageAttached} <button onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ background: 'none', border: 'none', color: '#a99bff', cursor: 'pointer' }}>✕</button></div>}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 8 }}><AttachBar /></div>
              <button onClick={() => sendMessage()} disabled={!input.trim() && !voiceFile && !imageFile}
                style={{ width: 40, height: 40, borderRadius: 12, background: (!input.trim() && !voiceFile && !imageFile) ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#7c6af7,#6d28d9)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16 }}>➤</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
            {t.chips.map((c, i) => (
              <button key={i} onClick={() => { setInput(c.text); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                <span>{c.icon}</span>{c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: 'calc(100vh - 74px)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 90px' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        .agent-bubble{animation:fadeUp 0.25s ease}
        .agent-dot{width:6px;height:6px;border-radius:50%;background:#7c6af7;display:inline-block;animation:bounce 1s ease infinite}
      `}</style>
      <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', flex: 1 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Erivion Agent</span>
          </div>
          <button onClick={onSwitchToModels} style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', color: '#a99bff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            🎬 {t.models} →
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14, minHeight: 320 }}>
          {messages.map((m, i) => {
            if (m.type === 'render') {
              return <div key={i} className="agent-bubble" style={{ alignSelf: 'flex-start' }}><RenderCard job={m.job} lang={lang} onNavigate={onNavigate} /></div>;
            }
            const ar = isArabic(m.content);
            return (
              <div key={i} className="agent-bubble" style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%', padding: '12px 16px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user' ? 'linear-gradient(135deg,#7c6af7,#6d28d9)' : 'rgba(255,255,255,0.05)',
                  border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                  color: '#fff', fontSize: 14, lineHeight: 1.7, direction: ar ? 'rtl' : 'ltr', textAlign: ar ? 'right' : 'left',
                }}>
                  {m.imagePreview && <img src={m.imagePreview} alt="upload" style={{ maxWidth: 140, borderRadius: 10, marginBottom: 8, display: 'block' }} />}
                  {m.hasVoice && <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>🎙️ {t.voiceAttached}</div>}
                  {m.content}
                </div>
              </div>
            );
          })}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', alignSelf: 'flex-start' }}>
              <span className="agent-dot" style={{ animationDelay: '0s' }} />
              <span className="agent-dot" style={{ animationDelay: '0.15s' }} />
              <span className="agent-dot" style={{ animationDelay: '0.3s' }} />
            </div>
          )}
        </div>

        {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</div>}

        {(voiceFile || imageFile) && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {voiceFile && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: '#a99bff' }}>🎙️ {voiceFile.name.slice(0, 20)} <button onClick={() => setVoiceFile(null)} style={{ background: 'none', border: 'none', color: '#a99bff', cursor: 'pointer', fontWeight: 700 }}>✕</button></div>}
            {imagePreview && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: '#a99bff' }}>🖼️ {t.imageAttached} <button onClick={() => { setImageFile(null); setImagePreview(null); }} style={{ background: 'none', border: 'none', color: '#a99bff', cursor: 'pointer', fontWeight: 700 }}>✕</button></div>}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 8 }}>
          <AttachBar />
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t.placeholder}
            rows={1}
            style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit', padding: '9px 6px', direction: isArabic(input) ? 'rtl' : 'ltr', maxHeight: 100 }}
          />
          <button onClick={() => sendMessage()} disabled={loading || (!input.trim() && !voiceFile && !imageFile)}
            style={{ width: 38, height: 38, borderRadius: 10, background: loading || (!input.trim() && !voiceFile && !imageFile) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#7c6af7,#6d28d9)', border: 'none', color: '#fff', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, flexShrink: 0 }}>➤</button>
        </div>
        <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>{t.onlyVideo}</p>
      </div>
    </div>
  );
}
