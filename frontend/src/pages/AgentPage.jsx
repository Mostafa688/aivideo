import React, { useState, useRef, useEffect } from 'react';
import RatingPrompt from './RatingPrompt.jsx';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}
function tokenHeader() {
  return { Authorization: 'Bearer ' + localStorage.getItem('token') };
}

const isArabic = (text) => /[\u0600-\u06FF]/.test(text || '');

// ✅ FIX: fetch() على data: URI ممكن يفشل بـ"Failed to fetch" تحت بعض إعدادات
// الـ CSP — التحويل اليدوي ده موثوق 100% ومش محتاج أي طلب شبكة خالص
function dataURLtoBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

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
    queued: 'السيرفر مشغول بفيديو تاني، هيبدأ فيديوك تلقائيًا حالًا...',
    attachTitle: 'إضافة مرفق',
    attachVoice: 'تسجيل صوتي',
    attachPhoto: 'صورة (شخصية / منتج)',
    done: 'تم! تم خصم',
    credits: 'كريديت',
    download: 'تحميل',
    failed: 'حصلت مشكلة أثناء إنشاء الفيديو',
    goToPricing: 'اذهب لصفحة الأسعار →',
    uploadCharacterFirst: 'ارفع صورة الشخصية الأول من زر 🖼️ تحت',
    stop: 'إيقاف',
    stopped: '⏹️ تم الإيقاف — الفيديو مستمر في الخلفية وسيتم خصم الكريديت',
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
    queued: 'Server is busy with another video — yours will start automatically shortly...',
    attachTitle: 'Add attachment',
    attachVoice: 'Voice recording',
    attachPhoto: 'Photo (character / product)',
    done: 'Done! Deducted',
    credits: 'credits',
    download: 'Download',
    failed: 'Something went wrong generating the video',
    goToPricing: 'Go to Pricing →',
    uploadCharacterFirst: 'Upload the character photo first with the 🖼️ button below',
    stop: 'Stop',
    stopped: '⏹️ Stopped watching — the video keeps rendering in the background and credits will still be deducted',
  },
};

const RATIO_BOX = { '9:16': { w: 152, h: 270 }, '16:9': { w: 270, h: 152 }, '1:1': { w: 200, h: 200 } };
const MODEL_STYLE_DEFAULTS = { 3: 'cinematic', 4: 'cinematic', 5: 'cinematic' };
const MODEL3_IMAGE_COUNT = { '30s': 3, '1min': 6, '3min': 18, '5min': 30 };
const MODEL4_SCENE_COUNT = { '30s': 4, '1min': 8, '3min': 24 };
const VIDEO_TYPE_BY_MODEL = { 1: 'ai_slices', 2: 'pexels_clips' };

function RenderCard({ job, lang, onNavigate }) {
  const box = RATIO_BOX[job.ratio] || RATIO_BOX['9:16'];
  const t = T[lang];
  const [showRating, setShowRating] = useState(true);

  if (job.status === 'done') {
    return (
      <div style={{ width: box.w + 20 }}>
        {showRating && <RatingPrompt modelUsed={`Agent - Model ${job.model || ''}`} onClose={() => setShowRating(false)} lang={lang} />}
        <video src={job.videoUrl} controls autoPlay muted style={{ width: box.w, height: box.h, borderRadius: 14, objectFit: 'cover', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>✅ {t.done} {job.cost || ''} {t.credits}</span>
          <a href={job.videoUrl} download style={{ fontSize: 11, color: '#a99bff', fontWeight: 700, textDecoration: 'none' }}>⬇️ {t.download}</a>
        </div>
      </div>
    );
  }

  if (job.status === 'stopped') {
    return (
      <div style={{ maxWidth: 280, padding: '12px 16px', borderRadius: 14, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <div style={{ fontSize: 13, color: '#f59e0b' }}>{t.stopped}</div>
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
        {job.status === 'queued' ? t.queued : job.status === 'scenes' ? t.generating : t.rendering}
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
  const [inputFocused, setInputFocused] = useState(false); // ✅ لعرض توهج الحدود لما الكتابة تكون فاعلة
  const [imagePreview, setImagePreview] = useState(null);
  const [limits, setLimits] = useState({ MAX_AUDIO_SEC: 120, MAX_AUDIO_MB: 10, MAX_IMAGE_MB: 5 });
  const [lastUploadedPhotos, setLastUploadedPhotos] = useState([]); // ✅ FIX: كانت صورة واحدة بس — دلوقتي مصفوفة بتتراكم لحد صورتين عبر رسائل متتالية (موديل 5)
  const [lastUploadedVoiceUrl, setLastUploadedVoiceUrl] = useState(null);
  const [lastUploadedTranscript, setLastUploadedTranscript] = useState(null);
  const [lastM12Video, setLastM12Video] = useState(null); // ✅ NEW: آخر فيديو موديل 1/2 كامل — لازم نحفظه عشان نقدر نعدّل مشهد فيه لاحقًا من غير إعادة توليد كامل
  const voiceInputRef = useRef();
  const imageInputRef = useRef();
  const scrollRef = useRef();
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const activeJobRef = useRef(null); // الكارت الحالي اللي بيتولد — للـ Stop

  const started = messages.length > 0;

  useEffect(() => {
    fetch('/api/agent/limits', { headers: tokenHeader() }).then(r => r.json()).then(setLimits).catch(() => {});
    return () => { clearInterval(pollRef.current); clearInterval(timerRef.current); };
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
    reader.onload = (ev) => {
      setImageFile(ev.target.result);
      setImagePreview(ev.target.result);
      // ✅ FIX: بتتراكم (مش تستبدل) لحد صورتين — الشات بيقبل شخصية واحدة أو اتنين لموديل 5
      setLastUploadedPhotos(prev => {
        if (prev.length >= 2) {
          setError(t.maxTwoPhotos || 'This chat accepts up to 2 character photos — use the Models page directly for more.');
          return prev;
        }
        return [...prev, ev.target.result];
      });
    };
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
    if (loading || activeJobRef.current) return; // ✅ FIX: منع إرسال رسالة تانية لحد ما الحالية تخلص، عشان محدش يبعت "ابدأ" مرتين ويعمل تضارب رندر
    setError('');
    const attachmentLabel = voiceFile
      ? (lang === 'ar' ? '🎙️ رسالة صوتية' : '🎙️ Voice message')
      : imageFile
      ? (lang === 'ar' ? '🖼️ صورة مرفوعة' : '🖼️ Uploaded photo')
      : '';
    const userMsg = { role: 'user', content: textToSend.trim() || attachmentLabel, hasVoice: !!voiceFile, imagePreview };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    const currentVoice = voiceFile, currentImage = imageFile;
    setInput(''); setVoiceFile(null); setImageFile(null); setImagePreview(null);
    setLoading(true);

    try {
      const body = {
        message: textToSend.trim() || (lang === 'ar' ? 'من الصوت/الصورة المرفوعة' : 'from the attached voice/image'),
        // ✅ FIX: كانت -6 (3 تبادلات بس) وده كان بيخلي الايجنت ينسى تفاصيل قديمة في المحادثة — رفعناها لـ 16 لتغطي محادثة كاملة
        history: nextMessages.slice(0, -1).slice(-16).map(m => ({ role: m.role, content: m.content })),
        // ✅ FIX: نفضل نفكّر الباك إند إن صورة/صوت اترفعوا قبل كده في الجلسة دي حتى لو خرجوا بره الـ history،
        // عشان الايجنت مايطلبش رفعهم تاني بعد كام رسالة
        photoAlreadyUploaded: !!lastUploadedPhotos.length,
        voiceAlreadyUploaded: !!lastUploadedVoiceUrl,
      };
      if (currentVoice) body.voiceBase64 = await fileToBase64(currentVoice);
      if (currentImage) body.imageBase64 = currentImage;

      abortRef.current = new AbortController();
      const res = await fetch('/api/agent/chat', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), signal: abortRef.current.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
      if (data.uploadedVoiceUrl) setLastUploadedVoiceUrl(data.uploadedVoiceUrl);
      if (data.transcript) setLastUploadedTranscript(data.transcript);

      if (data.ready) {
        const needsPhoto = (data.ready.model === 5 && data.ready.needsCharacterPhoto) || (data.ready.model === 7 && data.ready.needsProductPhoto);
        if (needsPhoto && !lastUploadedPhotos.length) {
          setMessages(m => [...m, { role: 'assistant', content: t.uploadCharacterFirst }]);
        } else {
          startGeneration(data.ready);
        }
      } else if (data.editScene) {
        // ✅ NEW: تعديل مشهد واحد بس — لو مفيش فيديو موديل 1/2 سابق محفوظ، منقدرش ننفذها فعليًا
        if (lastM12Video) {
          startSceneEdit(data.editScene);
        } else {
          setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'معنديش فيديو موديل 1/2 سابق في المحادثة دي أقدر أعدّل فيه — لازم نعمل فيديو الأول.' : "I don't have a previous Model 1/2 video in this chat to edit — let's make one first." }]);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── إيقاف — سواء كان الأجنت لسه بيفكر، أو فيديو قيد الإنشاء ─────────────
  const stopEverything = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    if (activeJobRef.current) {
      clearInterval(pollRef.current); clearInterval(timerRef.current);
      const activeUid = activeJobRef.current.uid;
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.type === 'render' && x.job?.uid === activeUid);
        if (idx !== -1 && (copy[idx].job.status === 'scenes' || copy[idx].job.status === 'rendering')) {
          copy[idx] = { ...copy[idx], job: { ...copy[idx].job, status: 'stopped' } };
        }
        return copy;
      });
      activeJobRef.current = null;
    }
    setLoading(false);
  };

  const startGeneration = async (ready) => {
    // ✅ FIX: منع بدء رندر جديد لو فيه واحد شغال بالفعل — كان بيحصل تضارب لو الأجنت
    // حاول يبدأ مرتين قريبين من بعض، وكل جوب كان بيحدّث آخر كارت في الشات بغض النظر عن صاحبه
    if (activeJobRef.current) return;

    const jobUid = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'scenes', ratio: ready.ratio || '9:16', elapsed: 0, model: ready.model };
    setMessages(m => [...m, { role: 'assistant', type: 'render', job }]);
    const updateJob = (patch) => {
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.type === 'render' && x.job?.uid === jobUid);
        if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
        return copy;
      });
      Object.assign(job, patch);
    };
    activeJobRef.current = job;

    const style = ready.videoStyle || MODEL_STYLE_DEFAULTS[ready.model];
    const isM12 = ready.model === 1 || ready.model === 2;
    // ✅ FIX: كان بيثق في "videoLanguage" اللي الايجنت (LLM) قرره — وده افتراضيًا "en" إلا لو
    // العميل قال صراحة "الفيديو بالعربي". لكن لو العميل رفع تسجيل صوتي بالمصري (Voice-to-Video)،
    // الصوت نفسه عربي أكيد، فمفروض الكابشن يتطابق معاه تلقائيًا — مش يفضل يعتمد على تخمين الموديل.
    // ده كان سبب ظهور الكابشن مربعات بس من خلال الايجنت (الصفحة المباشرة عندها اختيار لغة صريح
    // بيدّي القيمة الصح دايمًا، فمكانتش بتقع في المشكلة دي).
    const hasUploadedScriptForLang = ready.model !== 5 && !!lastUploadedTranscript;
    const transcriptIsArabic = hasUploadedScriptForLang && isArabic(lastUploadedTranscript);
    // ✅ لغة الفيديو وصوته بييجوا من فهم الأجنت لطلب العميل، مش من لغة واجهة الموقع —
    // افتراضيًا إنجليزي + صوت "wise man" إلا لو العميل حدد غير كده صراحة، إلا لو فيه تسجيل
    // صوتي مرفوع بالعربي — ساعتها اللغة الفعلية للصوت هي الأساس دايمًا
    const videoLang = transcriptIsArabic ? 'ar' : (ready.videoLanguage || 'en');
    const voiceKey = ready.voice || (videoLang.startsWith('ar') ? 'male_arabic' : 'male_wise');

    // ── موديل 7 (الإعلانات): multipart/form-data + endpoint استطلاع خاص بيه، منفصل تمامًا
    // عن الـ JSON flow المشترك لباقي الموديلات — بيتعامل هنا لوحده وبيرجع بدري ──────────
    if (ready.model === 7) {
      updateJob({ status: 'rendering' });
      timerRef.current = setInterval(() => updateJob({ elapsed: (job.elapsed || 0) + 1 }), 1000);
      try {
        const form = new FormData();
        const productBlob = dataURLtoBlob(lastUploadedPhotos[0]);
        form.append('productImage', productBlob, 'product.jpg');
        form.append('productName', ready.productName || 'Product');
        form.append('productDesc', ready.productDesc || '');
        form.append('audioMode', ready.adsAudioMode || 'none');
        form.append('ratio', ready.ratio || '9:16');
        form.append('language', videoLang);
        const seconds = parseInt(ready.duration) || 15;
        const sceneCount = Math.min(Math.max(Math.round(seconds / 5), 3), 6);
        form.append('sceneCount', String(sceneCount));
        form.append('customHook', ready.customHook || '');
        form.append('captions', String(!!ready.captions && ready.adsAudioMode === 'ai_voice'));
        form.append('productLink', ready.productLink || '');
        if (ready.adsAudioMode === 'ai_voice') form.append('aiVoiceKey', voiceKey);
        if (ready.adsAudioMode === 'upload' && lastUploadedVoiceUrl) {
          const voiceBlob = await (await fetch(lastUploadedVoiceUrl)).blob();
          form.append('voiceAudio', voiceBlob, 'voice.mp3');
        }

        const renderRes = await fetch('/api/ads/render', { method: 'POST', headers: tokenHeader(), body: form });
        const renderData = await renderRes.json();
        if (!activeJobRef.current) return;

        if (!renderRes.ok) {
          clearInterval(timerRef.current);
          if (renderData.error === 'quota_exceeded') {
            updateJob({ status: 'failed', creditError: true, error: lang === 'ar' ? `محتاج ${renderData.cost} كريديت ومعاك ${renderData.remaining} بس` : `Needs ${renderData.cost} credits, you have ${renderData.remaining}` });
          } else if (renderData.error === 'no_access' || renderData.error === 'under_maintenance') {
            updateJob({ status: 'failed', creditError: true, error: renderData.message || (lang === 'ar' ? '🔒 محتاج خطة فعالة عشان تعمل الفيديو ده' : '🔒 You need an active plan for this video') });
          } else {
            updateJob({ status: 'failed', error: renderData.error || 'Failed' });
          }
          activeJobRef.current = null;
          return;
        }

        const jobId = renderData.jobId;
        pollRef.current = setInterval(async () => {
          try {
            const sr = await fetch(`/api/ads/status/${jobId}`, { headers: tokenHeader() });
            const sd = await sr.json();
            if (sd.status === 'done') {
              clearInterval(pollRef.current); clearInterval(timerRef.current);
              updateJob({ status: 'done', videoUrl: sd.videoUrl, cost: sd.cost });
              activeJobRef.current = null;
            } else if (sd.status === 'error') {
              clearInterval(pollRef.current); clearInterval(timerRef.current);
              updateJob({ status: 'failed', error: sd.msg });
              activeJobRef.current = null;
            }
          } catch {}
        }, 5000);
      } catch (e) {
        clearInterval(timerRef.current);
        if (activeJobRef.current) updateJob({ status: 'failed', error: e.message });
        activeJobRef.current = null;
      }
      return;
    }

    // ── قارئ بسيط لـ Server-Sent Events فوق fetch عادي (موديل 1 و2 بيرجعوا SSE) ──
    async function readSSE(url, body) {
      const res = await fetch(url, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error === 'content_policy_violation' ? (region === 'eg' ? d.message_ar : d.message) : (d.error || 'Request failed')); }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const collected = [];
      let doneData = null, errorMsg = null;
      while (true) {
        if (!activeJobRef.current) break; // اتوقف من الـ Stop
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        for (const part of parts) {
          const evMatch = part.match(/^event: (.+)$/m);
          const dataMatch = part.match(/^data: (.+)$/m);
          if (!dataMatch) continue;
          const ev = evMatch ? evMatch[1] : 'message';
          let data; try { data = JSON.parse(dataMatch[1]); } catch { continue; }
          if (ev === 'scene') collected.push(data);
          else if (ev === 'done') doneData = data;
          else if (ev === 'error') errorMsg = data.message;
        }
      }
      if (errorMsg && !collected.length && !doneData) throw new Error(errorMsg);
      return { scenes: collected, done: doneData };
    }

    try {
      let scenes = [];

      // ✅ Voice-to-Video: لو فيه صوت مرفوع، نبعت السكريبت الكامل (مش ملخص 6 كلمات) عشان
      // المشاهد تتولد مطابقة فعليًا لكلام العميل، مش موضوع عام بعيد عن الصوت الحقيقي
      const hasUploadedScript = ready.model !== 5 && !!lastUploadedTranscript;

      if (isM12) {
        // موديل 1/2: توليد السكريبت أولاً عبر SSE
        // ✅ FIX: كنا بنحوّل "30s" غلط لـ "auto" وده كان بيولّد 8 مشاهد (حجم دقيقة) بدل 4 (حجم 30 ثانية فعليًا)
        const { scenes: gotScenes } = await readSSE('/api/generate-scenes', hasUploadedScript
          ? { idea: null, script: lastUploadedTranscript, tone: ready.tone || 'motivational', duration: ready.duration, mode: 'script', videoLanguage: videoLang }
          : { idea: ready.idea, script: null, tone: ready.tone || 'motivational', duration: ready.duration, mode: 'idea', videoLanguage: videoLang }
        );
        if (!activeJobRef.current) return;
        scenes = gotScenes;
        if (!scenes.length) throw new Error('Scene generation failed');

        if (ready.model === 1) {
          // موديل 1: توليد صور/مشاهد AI عبر SSE
          const { done: aiDone } = await readSSE('/api/generate-ai-video', { scenes, ratio: ready.ratio });
          if (!activeJobRef.current) return;
          scenes = aiDone?.scenes || scenes;
        } else {
          // موديل 2: جلب فيديوهات ستوك حقيقية
          const mediaRes = await fetch('/api/fetch-media', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ scenes, ratio: ready.ratio, jobId: 'agent_' + Date.now() }) });
          const mediaData = await mediaRes.json();
          if (!mediaRes.ok) throw new Error(mediaData.error || 'Media fetch failed');
          scenes = mediaData.scenes || scenes;
        }
      } else {
        // موديل 3/4/5: JSON عادي
        let scenesBody;
        if (ready.model === 3) {
          scenesBody = hasUploadedScript
            ? { idea: null, script: lastUploadedTranscript, inputMode: 'script', imageCount: MODEL3_IMAGE_COUNT[ready.duration] || 6, videoLanguage: videoLang, ratio: ready.ratio, videoStyle: style, styleSuffix: '' }
            : { idea: ready.idea, script: null, inputMode: 'idea', imageCount: MODEL3_IMAGE_COUNT[ready.duration] || 6, videoLanguage: videoLang, ratio: ready.ratio, videoStyle: style, styleSuffix: '' };
        } else if (ready.model === 4) {
          scenesBody = hasUploadedScript
            ? { idea: null, script: lastUploadedTranscript, inputMode: 'script', sceneCount: MODEL4_SCENE_COUNT[ready.duration] || 8, videoLanguage: videoLang, videoStyle: style, styleSuffix: '' }
            : { idea: ready.idea, script: undefined, inputMode: 'idea', sceneCount: MODEL4_SCENE_COUNT[ready.duration] || 8, videoLanguage: videoLang, videoStyle: style, styleSuffix: '' };
        } else {
          scenesBody = ready.promptMode === 'prompt'
            ? { promptMode: 'prompt', rawPrompt: ready.rawPrompt || ready.idea, characters: lastUploadedPhotos.map(p => ({ prompt: '', photo: p })), duration: ready.duration, styleSuffix: '' }
            : { idea: ready.idea, characters: lastUploadedPhotos.map(p => ({ prompt: '', photo: p })), duration: ready.duration, videoStyle: style, styleSuffix: '' };
        }
        const scenesRes = await fetch(`/api/model${ready.model}/generate-scenes`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(scenesBody) });
        const scenesData = await scenesRes.json();
        if (!scenesRes.ok) throw new Error(
          scenesData.error === 'content_policy_violation' ? (region === 'eg' ? scenesData.message_ar : scenesData.message) :
          scenesData.error === 'under_maintenance' ? (scenesData.message || (lang === 'ar' ? '🚧 الموديل ده تحت الصيانة حاليًا، هيرجع قريب' : '🚧 This model is under maintenance and will be back soon')) :
          (scenesData.error || 'Scene generation failed')
        );
        scenes = scenesData.scenes || [];
      }

      if (!activeJobRef.current) return;

      // ✅ Voice-to-Video حقيقي: لو العميل رفع تسجيل صوتي، نستخدمه هو نفسه كـ narration في الفيديو
      // من غير ما نولّد صوت صناعي جديد — بالظبط زي ما بيحصل في صفحة الموديل العادية
      let audioUrl = null;
      if (ready.model !== 5 && lastUploadedVoiceUrl) {
        audioUrl = lastUploadedVoiceUrl;
      } else if (ready.model !== 5 && scenes.length) {
        // مفيش صوت مرفوع — نولّد صوت صناعي بنفس الطريقة اللي صفحة الموديل نفسها بتستخدمها بالظبط
        try {
          const fullText = scenes.map(s => s.text).join(' ');
          const voiceRes = await fetch('/api/generate-voice', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ text: fullText, voice: voiceKey, videoLanguage: videoLang }) });
          const voiceData = await voiceRes.json();
          if (voiceRes.ok) audioUrl = voiceData.audioUrl;
        } catch { /* لو فشل التعليق الصوتي، هيكمل الفيديو من غير صوت */ }
      }
      if (!activeJobRef.current) return;

      updateJob({ status: 'rendering' });
      timerRef.current = setInterval(() => updateJob({ elapsed: (job.elapsed || 0) + 1 }), 1000);

      let renderUrl, renderBody;
      const wantCaptions = ready.captions !== false; // default true
      const wantMusic = ready.music === true; // default false
      if (isM12) {
        renderUrl = '/api/render';
        renderBody = { scenes, audioUrl, ratio: ready.ratio, duration: ready.duration, music: wantMusic, captions: wantCaptions, transitions: true, videoType: VIDEO_TYPE_BY_MODEL[ready.model], videoLanguage: videoLang };
      } else if (ready.model === 3) {
        renderUrl = '/api/model3/render';
        renderBody = { scenes, audioUrl, ratio: ready.ratio, captions: wantCaptions, transitions: false, music: wantMusic, videoLanguage: videoLang, duration: ready.duration, videoStyle: style, styleSuffix: '' };
      } else if (ready.model === 4) {
        renderUrl = '/api/model4/render';
        renderBody = { scenes, audioUrl, ratio: ready.ratio, captions: wantCaptions, music: wantMusic, videoLanguage: videoLang, duration: ready.duration, inputMode: 'idea', videoStyle: style, styleSuffix: '' };
      } else {
        renderUrl = '/api/model5/render';
        renderBody = { scenes, ratio: ready.ratio, duration: ready.duration, characterPhotos: lastUploadedPhotos, music: wantMusic };
      }

      // ── لو السيرفر مشغول بفيديو عميل تاني، نستنى ونعيد المحاولة تلقائيًا ────
      // (نفس نظام "server busy" اللي شغال في صفحات الموديل العادية — عميل واحد بيرندر في وقت واحد بس)
      let renderRes, renderData;
      const RETRY_DELAY_MS = 8000;
      const MAX_RETRIES = 60; // يعني نستنى لحد حوالي 8 دقايق قبل ما نستسلم
      let retries = 0;
      while (true) {
        renderRes = await fetch(renderUrl, { method: 'POST', headers: authHeaders(), body: JSON.stringify(renderBody) });
        renderData = await renderRes.json();
        if (!activeJobRef.current) return;
        if (renderRes.status === 429 && renderData.error === 'server_busy' && retries < MAX_RETRIES) {
          retries++;
          updateJob({ status: 'queued', queuePosition: retries });
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          if (!activeJobRef.current) return;
          updateJob({ status: 'rendering' });
          continue;
        }
        break;
      }

      if (!renderRes.ok) {
        clearInterval(timerRef.current);
        if (renderData.error === 'quota_exceeded' || renderData.reason === 'quota_exceeded' || renderData.error === 'credits_exhausted') {
          const need = renderData.cost;
          const have = renderData.remaining ?? 0;
          updateJob({ status: 'failed', creditError: true, error: need ? (lang === 'ar' ? `محتاج ${need} كريديت ومعاك ${have} بس` : `Needs ${need} credits, you have ${have}`) : (renderData.message || renderData.error) });
          return;
        }
        if (renderData.show_upgrade || renderData.error === 'no_access' || renderData.error === 'subscribe_required') {
          updateJob({ status: 'failed', creditError: true, error: renderData.message ? `🔒 ${renderData.message}` : (lang === 'ar' ? '🔒 محتاج خطة فعالة عشان تعمل الفيديو ده' : '🔒 You need an active plan for this video') });
          return;
        }
        if (renderData.error === 'under_maintenance') {
          updateJob({ status: 'failed', creditError: true, error: renderData.message || (lang === 'ar' ? '🚧 الموديل ده تحت الصيانة حاليًا، هيرجع قريب' : '🚧 This model is under maintenance and will be back soon') });
          return;
        }
        throw new Error(renderData.error || renderData.message || 'Render failed');
      }

      const jobId = renderData.jobId;
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/render-status/${jobId}`, { headers: tokenHeader() });
          const sd = await sr.json();
          if (sd.status === 'done') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            updateJob({ status: 'done', videoUrl: sd.videoUrl, cost: renderData.creditCost || renderData.cost });
            // ✅ NEW: لو ده فيديو موديل 1/2، نحفظ كل بياناته عشان نقدر نعدّل مشهد فيه بعد كده
            // من غير ما نعيد توليد الفيديو بالكامل
            if (isM12) {
              setLastM12Video({ ...renderBody, videoUrl: sd.videoUrl });
            }
            activeJobRef.current = null;
          } else if (sd.status === 'failed') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            updateJob({ status: 'failed', error: sd.error });
            activeJobRef.current = null;
          }
        } catch {}
      }, 5000);
    } catch (e) {
      if (activeJobRef.current) updateJob({ status: 'failed', error: e.message });
      activeJobRef.current = null;
    }
  };

  // ✅ NEW: تعديل مشهد واحد بس من آخر فيديو موديل 1/2 — بيحافظ على نفس الصوت وباقي
  // المشاهد والمدة، ويغيّر مشهد واحد بس، بدل ما يعيد توليد الفيديو بالكامل من الصفر
  const startSceneEdit = async (editScene) => {
    if (!lastM12Video || activeJobRef.current) return;
    const jobUid = `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'rendering', ratio: lastM12Video.ratio || '9:16', elapsed: 0 };
    setMessages(m => [...m, { role: 'assistant', type: 'render', job }]);
    const updateJob = (patch) => {
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.type === 'render' && x.job?.uid === jobUid);
        if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
        return copy;
      });
      Object.assign(job, patch);
    };
    activeJobRef.current = job;
    timerRef.current = setInterval(() => updateJob({ elapsed: (job.elapsed || 0) + 1 }), 1000);

    try {
      const res = await fetch('/api/edit-scene', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...lastM12Video, sceneIndex: editScene.sceneIndex, newDescription: editScene.description }),
      });
      const data = await res.json();
      if (!activeJobRef.current) return;
      if (!res.ok) {
        clearInterval(timerRef.current);
        if (data.error === 'quota_exceeded') {
          updateJob({ status: 'failed', creditError: true, error: lang === 'ar' ? `محتاج ${data.cost} كريديت ومعاك ${data.remaining} بس` : `Needs ${data.cost} credits, you have ${data.remaining}` });
        } else {
          updateJob({ status: 'failed', error: data.error === 'content_policy_violation' ? (region === 'eg' ? data.message_ar : data.message) : (data.error || 'Failed') });
        }
        activeJobRef.current = null;
        return;
      }
      const jobId = data.jobId;
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/render-status/${jobId}`, { headers: tokenHeader() });
          const sd = await sr.json();
          if (sd.status === 'done') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            updateJob({ status: 'done', videoUrl: sd.videoUrl, cost: data.creditCost });
            // ✅ الفيديو المعدّل بقى هو "آخر فيديو" — لو عايز يعدّل مشهد تاني بعده يبني على ده
            setLastM12Video(v => v ? { ...v, videoUrl: sd.videoUrl } : v);
            activeJobRef.current = null;
          } else if (sd.status === 'failed') {
            clearInterval(pollRef.current); clearInterval(timerRef.current);
            updateJob({ status: 'failed', error: sd.error });
            activeJobRef.current = null;
          }
        } catch {}
      }, 5000);
    } catch (e) {
      clearInterval(timerRef.current);
      if (activeJobRef.current) updateJob({ status: 'failed', error: e.message });
      activeJobRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const [attachMenuOpen, setAttachMenuOpen] = useState(false);

  const AttachBar = () => (
    <div style={{ position: 'relative' }}>
      <input ref={voiceInputRef} type="file" accept="audio/*" onChange={(e) => { handleVoiceFile(e); setAttachMenuOpen(false); }} style={{ display: 'none' }} />
      <input ref={imageInputRef} type="file" accept="image/*" onChange={(e) => { handleImageFile(e); setAttachMenuOpen(false); }} style={{ display: 'none' }} />
      <button onClick={() => setAttachMenuOpen(v => !v)} title={t.attachTitle}
        style={{ width: 38, height: 38, borderRadius: 10, background: attachMenuOpen ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${attachMenuOpen ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.08)'}`, color: attachMenuOpen ? '#a99bff' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s', transform: attachMenuOpen ? 'rotate(45deg)' : 'none' }}>+</button>

      {attachMenuOpen && (
        <>
          <div onClick={() => setAttachMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', bottom: 46, left: 0, background: '#141420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 6, minWidth: 190, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={() => { voiceInputRef.current?.click(); }} title={t.voiceTitle(limits.MAX_AUDIO_SEC / 60)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: isArabic(t.attachTitle) ? 'right' : 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ fontSize: 16 }}>🎙️</span>{t.attachVoice}
            </button>
            <button onClick={() => { imageInputRef.current?.click(); }} title={t.imageTitle}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: isArabic(t.attachTitle) ? 'right' : 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <span style={{ fontSize: 16 }}>🖼️</span>{t.attachPhoto}
            </button>
          </div>
        </>
      )}
    </div>
  );

  if (!started) {
    return (
      <div style={{ minHeight: 'calc(100vh - 74px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', position: 'relative', overflow: 'hidden' }}>
        {/* ✅ خلفية طبقتين هادية بدل تدرّج واحد مسطح — عمق أكتر من غير ما تلفت النظر */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 60% 45% at 50% -8%, rgba(124,106,247,0.14) 0%, transparent 65%), radial-gradient(ellipse 40% 35% at 85% 90%, rgba(217,167,116,0.05) 0%, transparent 70%)' }} />
        <div style={{ width: '100%', maxWidth: 680, position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <button onClick={onSwitchToModels} style={{ padding: '9px 16px', borderRadius: 10, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', color: '#a99bff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              🎬 {t.models} →
            </button>
          </div>

          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ marginBottom: 18 }}>
              <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: '0.02em', fontFamily: "'Georgia', 'Times New Roman', serif", color: '#fff', textShadow: '0 1px 0 rgba(255,255,255,0.15), 0 0 32px rgba(124,106,247,0.4)' }}>Erivion</span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.01em', direction: isArabic(t.heroTitle) ? 'rtl' : 'ltr' }}>{t.heroTitle}</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7, direction: isArabic(t.heroSub) ? 'rtl' : 'ltr' }}>{t.heroSub}</p>
          </div>

          {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12, marginBottom: 14 }}>{error}</div>}

          <div style={{
            background: 'rgba(255,255,255,0.035)',
            border: `1px solid ${inputFocused ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 20, padding: 16,
            transition: 'border-color 0.2s ease',
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
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
                onMouseEnter={e => { if (input.trim() || voiceFile || imageFile) e.currentTarget.style.filter = 'brightness(1.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                style={{ width: 40, height: 40, borderRadius: 12, background: (!input.trim() && !voiceFile && !imageFile) ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg,#7c6af7,#6d28d9)', border: 'none', color: '#fff', cursor: (!input.trim() && !voiceFile && !imageFile) ? 'default' : 'pointer', fontSize: 16, transition: 'filter 0.15s ease', boxShadow: (!input.trim() && !voiceFile && !imageFile) ? 'none' : '0 4px 14px rgba(124,106,247,0.35)' }}>➤</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
            {t.chips.map((c, i) => (
              <button key={i} onClick={() => { setInput(c.text); }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,106,247,0.1)'; e.currentTarget.style.borderColor = 'rgba(124,106,247,0.35)'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.75)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s ease' }}>
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
        .agent-models-btn:hover{background:rgba(124,106,247,0.16) !important;border-color:rgba(124,106,247,0.45) !important;}
      `}</style>
      <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', flex: 1 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: '0.02em', fontFamily: "'Georgia', 'Times New Roman', serif", color: '#fff', textShadow: '0 1px 0 rgba(255,255,255,0.15), 0 0 20px rgba(124,106,247,0.35)' }}>Erivion</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>Agent</span>
          </div>
          <button className="agent-models-btn" onClick={onSwitchToModels} style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.3)', color: '#a99bff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background 0.15s ease, border-color 0.15s ease' }}>
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
                  background: m.role === 'user' ? 'linear-gradient(135deg,#7c6af7,#6d28d9)' : 'rgba(255,255,255,0.045)',
                  border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.09)',
                  boxShadow: m.role === 'user' ? '0 4px 16px rgba(124,106,247,0.25)' : '0 2px 10px rgba(0,0,0,0.15)',
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

        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: 8,
          background: 'rgba(255,255,255,0.035)',
          border: `1px solid ${inputFocused ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 16, padding: 8,
          transition: 'border-color 0.2s ease',
        }}>
          <AttachBar />
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={t.placeholder}
            rows={1}
            style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit', padding: '9px 6px', direction: isArabic(input) ? 'rtl' : 'ltr', maxHeight: 100 }}
          />
          {(loading || activeJobRef.current) ? (
            <button onClick={stopEverything} title={t.stop}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.24)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
              style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', cursor: 'pointer', fontSize: 14, flexShrink: 0, transition: 'background 0.15s ease' }}>⏹️</button>
          ) : (
            <button onClick={() => sendMessage()} disabled={!input.trim() && !voiceFile && !imageFile}
              onMouseEnter={e => { if (input.trim() || voiceFile || imageFile) e.currentTarget.style.filter = 'brightness(1.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
              style={{ width: 38, height: 38, borderRadius: 10, background: (!input.trim() && !voiceFile && !imageFile) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#7c6af7,#6d28d9)', border: 'none', color: '#fff', cursor: (!input.trim() && !voiceFile && !imageFile) ? 'default' : 'pointer', fontSize: 15, flexShrink: 0, transition: 'filter 0.15s ease', boxShadow: (!input.trim() && !voiceFile && !imageFile) ? 'none' : '0 3px 10px rgba(124,106,247,0.3)' }}>➤</button>
          )}
        </div>
        <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>{t.onlyVideo}</p>
      </div>
    </div>
  );
}