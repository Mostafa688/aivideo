import React, { useState, useRef, useEffect } from 'react';
import RatingPrompt from './RatingPrompt.jsx';
import { EgPaymentModal, IntlPaymentModal, EG_PACKAGES, ALL_GUMROAD_PACKAGES } from './PricingPage.jsx';
import {
  ShoppingBag, Clapperboard, FileText, GraduationCap, ImageIcon, Mic, Film, Sparkles,
  Camera, Swords, Map as MapIcon, Check, X, Lock, Construction, Video, Send,
  CheckCircle2, Download, AlertTriangle, Plus, Box, Volume2, Square,
  ArrowLeft, LayoutGrid, Images, PanelRightClose, PanelRightOpen,
} from 'lucide-react';
import ShimmerLoader from '../components/ShimmerLoader.jsx';

const LOGO = '/logo.png';

// ✅ FIX (طلب العميل: "احذف اي ايموجي، خليك ذكي وشوف المواقع الكبيرة بتعمل اي واعمل زيهم"):
// كل الإيموجي في واجهة الشات اتشالت واتبدلت بأيقونات lucide-react حقيقية

// ✅ NEW: نفس الـ 3 فيديوهات مثال بتتعرض داخل الشات (كل واحد رسالة لوحده) لما الايجنت
// يحس إن العميل مذبذب بخصوص الاشتراك — بيديله دليل فعلي بدل ما يوصفله بس
const SHOWCASE_VIDEO_URLS = [
  'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/templates/tpl_1780696103015.mp4',
  'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/templates/tpl_1784902642064.mp4',
  'https://pub-e44d8497276f4a3e9139b814466baf3d.r2.dev/templates/%D8%A6%D8%A6.mp4',
];

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
      { icon: ShoppingBag, label: 'إعلان منتج', text: 'عايز أعمل إعلان لمنتجي' },
      { icon: Clapperboard, label: 'فيديو قصير', text: 'عايز أعمل فيديو قصير لسوشيال ميديا' },
      { icon: FileText, label: 'استخدم سكريبتي', text: 'عندي سكريبت جاهز وعايز أحوله لفيديو' },
      { icon: GraduationCap, label: 'فيديو تعليمي', text: 'عايز أعمل فيديو تعليمي بأسلوب سينمائي' },
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
    uploadCharacterFirst: 'ارفع صورة الشخصية من زر رفع الصورة تحت، أو اكتب وصف شكلها في رسالتك',
    stop: 'إيقاف',
    stopped: 'تم الإيقاف — الفيديو مستمر في الخلفية وسيتم خصم الكريديت',
    backToProjects: 'المشاريع',
    canvasEmptyTitle: 'ابدأ إنشاء الوسائط',
    canvasEmptySub: 'كل صورة وفيديو تولّده مع الايجنت هيظهر هنا.',
    allMedia: 'كل الوسائط',
    imagesTab: 'صور',
    videosTab: 'فيديوهات',
    collapse: 'تصغير',
    expand: 'توسيع',
  },
  en: {
    heroTitle: 'What video do you have in mind?',
    heroSub: "Tell me your idea — I'll pick the right model, calculate the credits, and make the video right here in chat.",
    placeholder: 'Describe your video idea, or paste a script...',
    chips: [
      { icon: ShoppingBag, label: 'Product Ad', text: 'I want to make an ad for my product' },
      { icon: Clapperboard, label: 'Short video', text: 'I want a short video for social media' },
      { icon: FileText, label: 'Use my script', text: 'I have a script ready, turn it into a video' },
      { icon: GraduationCap, label: 'Explainer video', text: 'I want a cinematic explainer video' },
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
    uploadCharacterFirst: 'Upload the character photo with the button below, or describe what they look like in your message',
    stop: 'Stop',
    stopped: 'Stopped watching — the video keeps rendering in the background and credits will still be deducted',
    backToProjects: 'Projects',
    canvasEmptyTitle: 'Start creating media',
    canvasEmptySub: 'Every image and video you generate with the Agent will show up here.',
    allMedia: 'All Media',
    imagesTab: 'Images',
    videosTab: 'Videos',
    collapse: 'Collapse',
    expand: 'Expand',
  },
};

const RATIO_BOX = { '9:16': { w: 152, h: 270 }, '16:9': { w: 270, h: 152 }, '1:1': { w: 200, h: 200 } };
const MODEL_STYLE_DEFAULTS = { 3: 'cinematic', 4: 'cinematic', 5: 'cinematic', 8: 'cinematic' };
// ✅ FIX: كانت styleSuffix بتتبعت فاضية للباك إند في كل مكان في الملف ده — يعني الستايل
// اللي الإيجنت أو العميل بيختاره (videoStyle) كان بيوصل كـ اسم بس من غير أي وصف فعلي، فالسيرفر
// كان دايمًا بيرجع للـ default العام بتاعه بدل الستايل الحقيقي. الجدول ده بيحوّل كل مفتاح
// ستايل لنص الوصف الحقيقي (نفس النصوص المستخدمة في Model4Page.jsx/Model8Page.jsx بالظبط)
const STYLE_SUFFIXES = {
  cinematic:   'cinematic photography, dramatic lighting, film grain, shallow depth of field, professional color grading',
  realistic:   'photorealistic, natural lighting, high detail, documentary style, authentic',
  historical:  'historical epic, ancient world, dramatic atmosphere, oil painting style, cinematic, period-accurate',
  anime:       'anime style, vibrant colors, detailed illustration, studio ghibli inspired, cel shading',
  cartoon:     'cartoon style, bright vivid colors, 2D animation, fun and expressive, pixar inspired',
  '3d_cartoon': '3D rendered cartoon style, smooth colorful surfaces, pixar style 3D animation',
  action:      'action scene, dynamic motion blur, explosive energy, dramatic angles, high contrast',
  documentary: 'documentary style, natural lighting, photorealistic, journalistic photography, authentic atmosphere',
};
function styleSuffixFor(styleKey) {
  return STYLE_SUFFIXES[styleKey] || '';
}
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22c55e', fontWeight: 700 }}><CheckCircle2 size={13} strokeWidth={2.25} /> {t.done} {job.cost || ''} {t.credits}</span>
          <a href={job.videoUrl} download style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent2)', fontWeight: 700, textDecoration: 'none' }}><Download size={13} strokeWidth={2.25} /> {t.download}</a>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#ef4444', marginBottom: job.creditError ? 8 : 0 }}><AlertTriangle size={14} strokeWidth={2.25} /> {job.error || t.failed}</div>
        {job.creditError && (
          <button onClick={() => onNavigate && onNavigate('pricing')} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontWeight: 700, textDecoration: 'underline', fontSize: 12, padding: 0 }}>{t.goToPricing}</button>
        )}
      </div>
    );
  }

  const statusLabel = job.status === 'queued' ? t.queued : job.status === 'scenes' ? t.generating : t.rendering;
  return (
    <div style={{ width: box.w + 20 }}>
      <ShimmerLoader
        ratio={job.ratio}
        label={statusLabel}
        style={{ width: box.w, height: box.h }}
      />
      <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>
        {statusLabel}
        {job.elapsed > 0 && <span> · {Math.floor(job.elapsed / 60)}:{String(job.elapsed % 60).padStart(2, '0')}</span>}
      </div>
    </div>
  );
}

// ✅ NEW (طلب العميل: "اربط ده بالايجنت... يظهر في شات الايجنت كمّل الفيديو"): كارت فيديو
// الـwhiteboard المجاني جوه الشات — بيعمل poll لحالته لوحده لحد ما يخلص، وبعد كده بيظهر
// زرار "كمّل الفيديو" بيحفظ الـjob id في localStorage وينقل المستخدم لصفحة الـwhiteboard
// العامة، اللي بتقرأه وتكمل عليه (بدل ما تبدأ رفع صوت جديد من الصفر)
function WhiteboardCard({ job: initialJob, lang, onNavigate }) {
  const tt = lang === 'ar'
    ? { transcribing: 'بيسمع الصوت...', extracting: 'بيحلل المحتوى...', rendering: 'بيبني الفيديو...', continueLabel: 'كمّل الفيديو', failed: 'حصلت مشكلة في بناء الفيديو' }
    : { transcribing: 'Listening to your audio...', extracting: 'Analyzing content...', rendering: 'Building the video...', continueLabel: 'Continue Video', failed: 'Something went wrong building the video' };
  const [job, setJob] = useState(initialJob);
  const pollRef = useRef(null);

  useEffect(() => {
    if (['done', 'failed'].includes(job.status)) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/whiteboard-video/jobs/${job.id}`, { headers: tokenHeader() });
        const d = await r.json();
        if (r.ok && d.job) {
          setJob(d.job);
          if (['done', 'failed'].includes(d.job.status)) clearInterval(pollRef.current);
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [job.status, job.id]);

  const goContinue = () => {
    // ✅ FIX (طلب العميل: "لما ادوس كمل الفيديو المفروض يدخلني على التيم لاين علطول مش
    // يدخلني على الموديل وبعد كده ادوس كمل الفيديو تاني"): علم إضافي بيقول لصفحة الـ
    // whiteboard تدخل على التايم لاين على طول من غير الشاشة البسيطة (فيديو + زرار) اللي
    // كانت بتحتاج ضغطة تانية
    try {
      localStorage.setItem('erivion_resume_whiteboard_job', String(job.id));
      localStorage.setItem('erivion_resume_whiteboard_edit', '1');
    } catch { /* ignore */ }
    onNavigate?.('whiteboard');
  };

  if (job.status === 'failed') {
    return (
      <div style={{ maxWidth: 280, padding: '12px 16px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#ef4444' }}><AlertTriangle size={14} strokeWidth={2.25} /> {job.error || tt.failed}</div>
      </div>
    );
  }

  if (job.status === 'done') {
    return (
      <div style={{ width: 240 }}>
        <video src={job.video_url} controls playsInline style={{ width: 240, borderRadius: 14, display: 'block', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
        <button onClick={goContinue} className="btn-primary" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, width: '100%', fontSize: 13, padding: '8px 12px' }}>
          <Plus size={14} strokeWidth={2.5} /> {tt.continueLabel}
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: 240, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(124,106,247,0.18), rgba(0,0,0,0.6))', border: '1px solid rgba(124,106,247,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="spinning" style={{ display: 'inline-block', fontSize: 18 }}>◐</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff' }}><FileText size={14} strokeWidth={2} /> {tt[job.status] || tt.transcribing}</span>
      </div>
    </div>
  );
}

// ✅ NEW (Phase 3 — new image-generation models): كارت توليد صور مستقل جوه شات الايجنت
// (مش فيديو) — بيعرض شبكة الصور بمجرد ما توليدها يخلص، مفيش poll هنا لأن الطلب نفسه
// بيستنى الرد كامل (backend بيستخدم Prefer: wait + polling داخلي)
function ImageBatchCard({ job, lang }) {
  const tt = lang === 'ar'
    ? { generating: 'بيولّد الصور...', done: 'تم! تم خصم', credits: 'كريديت', download: 'تحميل', failed: 'حصلت مشكلة أثناء توليد الصور' }
    : { generating: 'Generating images...', done: 'Done! Deducted', credits: 'credits', download: 'Download', failed: 'Something went wrong generating the images' };

  if (job.status === 'failed') {
    return (
      <div style={{ maxWidth: 280, padding: '12px 16px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#ef4444' }}><AlertTriangle size={14} strokeWidth={2.25} /> {job.error || tt.failed}</div>
      </div>
    );
  }

  if (job.status === 'done') {
    const cols = job.images.length > 4 ? 4 : job.images.length > 1 ? 2 : 1;
    return (
      <div style={{ width: Math.min(cols * 150 + (cols - 1) * 8, 616) }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
          {job.images.map((url, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 12, background: '#000', border: '1px solid rgba(255,255,255,0.1)', display: 'block' }} />
              <a href={url} download target="_blank" rel="noreferrer" style={{ position: 'absolute', bottom: 6, right: 6, width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textDecoration: 'none' }}>
                <Download size={13} strokeWidth={2.25} />
              </a>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22c55e', fontWeight: 700, marginTop: 8 }}><CheckCircle2 size={13} strokeWidth={2.25} /> {tt.done} {job.cost || ''} {tt.credits}</div>
      </div>
    );
  }

  return (
    <div style={{ width: 240, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(124,106,247,0.18), rgba(0,0,0,0.6))', border: '1px solid rgba(124,106,247,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="spinning" style={{ display: 'inline-block', fontSize: 18 }}>◐</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff' }}><ImageIcon size={14} strokeWidth={2} /> {tt.generating}</span>
      </div>
    </div>
  );
}

export default function AgentPage({ onNavigate, onSwitchToModels, activeProject }) {
  const region = localStorage.getItem('erivion_region') || 'eg';
  const lang = region === 'eg' ? 'ar' : 'en';
  const t = T[lang];

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voiceFile, setVoiceFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]); // ✅ FIX: كانت صورة واحدة بس (imageFile) — دلوقتي مصفوفة بتقبل لحد صورتين في نفس الرسالة
  const [inputFocused, setInputFocused] = useState(false); // ✅ لعرض توهج الحدود لما الكتابة تكون فاعلة
  const [limits, setLimits] = useState({ MAX_AUDIO_SEC: 120, MAX_AUDIO_MB: 10, MAX_IMAGE_MB: 5 });
  const [lastUploadedPhotos, setLastUploadedPhotos] = useState([]); // ✅ FIX: كانت صورة واحدة بس — دلوقتي مصفوفة بتتراكم لحد صورتين عبر رسائل متتالية (موديل 5)
  const [uploadedVideoFile, setUploadedVideoFile] = useState(null); // ✅ NEW: فيديو العميل بتاعه هو، لتعديل video-to-video (أقصى 15 ثانية)
  const [uploadedVideoDurationSec, setUploadedVideoDurationSec] = useState(null);
  const [videoSentOnce, setVideoSentOnce] = useState(false); // ✅ FIX: بعد أول رسالة اتبعت بيها الفيديو، نخفي الـ chip من شريط الكتابة (كان فاضل ظاهر هناك للأبد وبيبان "عالق")
  const [lastUploadedVoiceUrl, setLastUploadedVoiceUrl] = useState(null);
  const [lastUploadedTranscript, setLastUploadedTranscript] = useState(null);
  // ✅ NEW: المشاهد المستخرجة بكود عادي (regex) من سكريبت متقسم بمشاهد جاهزة — مش من رد الايجنت
  // نفسه، عشان نضمن دقة 100% وميحصلش تلخيص/إسقاط مشاهد زي ما كان بيحصل لما كنا بنعتمد على الـ LLM
  const [lastParsedStructuredScenes, setLastParsedStructuredScenes] = useState(null);
  const [lastParsedAdsScenePlan, setLastParsedAdsScenePlan] = useState(null); // ✅ NEW: خطة إعلان جاهزة (Time/Visual/Voiceover) مستخرجة بالكود
  const [lastM12Video, setLastM12Video] = useState(null); // ✅ NEW: آخر فيديو موديل 1/2 كامل — لازم نحفظه عشان نقدر نعدّل مشهد فيه لاحقًا من غير إعادة توليد كامل
  const [lastM345Video, setLastM345Video] = useState(null); // ✅ NEW: نفس الفكرة لموديل 3/4/5 (مش map-video) — { model, ...editContext, videoUrl }
  const [subscribeModal, setSubscribeModal] = useState(null); // ✅ NEW: { type: 'eg'|'intl', ...pkg } — الايجنت بيفتحها لما العميل يحدد الباقة اللي عايزها
  const [myClonedVoice, setMyClonedVoice] = useState(null);
  const [savingVoice, setSavingVoice] = useState(false);
  const voiceCloneInputRef = useRef();
  const voiceInputRef = useRef();
  const imageInputRef = useRef();
  const videoInputRef = useRef();
  const scrollRef = useRef();
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const activeJobRef = useRef(null); // الكارت الحالي اللي بيتولد — للـ Stop

  const started = messages.length > 0;

  useEffect(() => {
    fetch('/api/agent/limits', { headers: tokenHeader() }).then(r => r.json()).then(setLimits).catch(() => {});
    fetch('/api/voice-clone/mine', { headers: tokenHeader() }).then(r => r.json()).then(d => setMyClonedVoice(d.voice || null)).catch(() => {});
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

  // ✅ NEW: فويس كلون — عينة صوت دائمة تُحفظ مرة واحدة (مش مرتبطة برسالة شات)، بتتبعت
  // مباشرة لـ /api/voice-clone من غير ما تعدي على مسار الشات العادي خالص
  const handleVoiceCloneFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setSavingVoice(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/voice-clone', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ audioBase64: base64 }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMyClonedVoice(data.voice);
      setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'اتحفظ صوتك! تقدر تطلب مني أي فيديو بصوتك بدل ما تختار صوت جاهز.' : "Your voice is saved! You can now ask me for any video using your own cloned voice instead of a preset one." }]);
    } catch (e) {
      setError(lang === 'ar' ? `فشل حفظ الصوت: ${e.message}` : `Failed to save voice: ${e.message}`);
    } finally {
      setSavingVoice(false);
    }
  };

  const handleImageFile = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 2 - imageFiles.length); // ✅ مايتخطاش صورتين في نفس الرسالة
    if (!files.length) {
      if (e.target.files?.length) setError(t.maxTwoPhotos || 'This chat accepts up to 2 photos per message.');
      return;
    }
    setError('');
    for (const file of files) {
      if (file.size > limits.MAX_IMAGE_MB * 1024 * 1024) { setError(t.imageTooBig(limits.MAX_IMAGE_MB)); continue; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImageFiles(prev => prev.length >= 2 ? prev : [...prev, ev.target.result]);
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
    }
  };

  // ✅ NEW: رفع فيديو العميل الخاص لتعديل video-to-video — لازم يتحقق من المدة (أقصى 15
  // ثانية) وحجم الملف قبل ما يتقبل، بنفس أسلوب فحص الصوت (metadata check)
  const MAX_VIDEO_UPLOAD_MB = 50;
  const MAX_VIDEO_UPLOAD_SEC = 15;
  const handleVideoFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    if (file.size > MAX_VIDEO_UPLOAD_MB * 1024 * 1024) { setError(lang === 'ar' ? `الفيديو أكبر من ${MAX_VIDEO_UPLOAD_MB}MB` : `Video is larger than ${MAX_VIDEO_UPLOAD_MB}MB`); return; }
    // ✅ FIX: كنا بنستنى فحص المدة (async، بياخد جزء من الثانية) قبل ما نحفظ الفيديو في
    // الـ state — لو المستخدم كتب نص وبعت بسرعة قبل ما الفحص يخلص، الفيديو مكنش موجود
    // في الرسالة خالص. دلوقتي الفيديو بيتقبل فورًا (sync)، والفحص بيحصل في الخلفية —
    // لو طلع أطول من المسموح، بنشيله ونعرض الخطأ وقتها بس
    setUploadedVideoFile(file);
    setUploadedVideoDurationSec(null); // هيتحدث لما الفحص يخلص
    setVideoSentOnce(false);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      if (video.duration > MAX_VIDEO_UPLOAD_SEC + 0.5) {
        setError(lang === 'ar' ? `الفيديو ${video.duration.toFixed(1)} ثانية — أقصى مدة مسموحة ${MAX_VIDEO_UPLOAD_SEC} ثانية` : `Video is ${video.duration.toFixed(1)}s — max allowed is ${MAX_VIDEO_UPLOAD_SEC}s`);
        setUploadedVideoFile(null);
        setUploadedVideoDurationSec(null);
        return;
      }
      setUploadedVideoDurationSec(Math.round(video.duration));
    };
    video.src = URL.createObjectURL(file);
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const sendMessage = async (overrideText) => {
    const textToSend = overrideText !== undefined ? overrideText : input;
    if (!textToSend.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile) return;
    if (loading || activeJobRef.current) return; // ✅ FIX: منع إرسال رسالة تانية لحد ما الحالية تخلص، عشان محدش يبعت "ابدأ" مرتين ويعمل تضارب رندر
    setError('');
    const attachmentLabel = voiceFile
      ? (lang === 'ar' ? 'رسالة صوتية' : 'Voice message')
      : imageFiles.length
      ? (lang === 'ar' ? (imageFiles.length > 1 ? 'صور مرفوعة' : 'صورة مرفوعة') : (imageFiles.length > 1 ? 'Uploaded photos' : 'Uploaded photo'))
      : uploadedVideoFile
      ? (lang === 'ar' ? 'فيديو مرفوع للتعديل' : 'Uploaded video to edit')
      : '';
    const userMsg = { role: 'user', content: textToSend.trim() || attachmentLabel, hasVoice: !!voiceFile, imagePreview: imageFiles[0], imagePreviews: imageFiles };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    const currentVoice = voiceFile, currentImages = imageFiles;
    setInput(''); setVoiceFile(null); setImageFiles([]);
    if (uploadedVideoFile) setVideoSentOnce(true);
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
        videoAlreadyUploaded: !!uploadedVideoFile,
        videoDurationSec: uploadedVideoDurationSec || undefined,
        hasStructuredScript: !!lastParsedStructuredScenes,
        hasAdsScenePlan: !!lastParsedAdsScenePlan,
        styleHint: selectedStyle || undefined,
        hasClonedVoice: !!myClonedVoice,
      };
      if (currentVoice) body.voiceBase64 = await fileToBase64(currentVoice);
      // ✅ FIX: بتبعت مصفوفة صور دلوقتي (لحد 2) بدل صورة واحدة بس — كمان بيبعت imageBase64
      // (أول صورة) للتوافق مع أي كود قديم لسه بيتوقع حقل مفرد
      if (currentImages.length) { body.imagesBase64 = currentImages; body.imageBase64 = currentImages[0]; }

      abortRef.current = new AbortController();
      const res = await fetch('/api/agent/chat', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), signal: abortRef.current.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
      if (data.uploadedVoiceUrl) setLastUploadedVoiceUrl(data.uploadedVoiceUrl);
      if (data.transcript) setLastUploadedTranscript(data.transcript);
      if (Array.isArray(data.structuredScenes) && data.structuredScenes.length) setLastParsedStructuredScenes(data.structuredScenes);
      if (data.adsScenePlan?.scenes?.length) setLastParsedAdsScenePlan(data.adsScenePlan);

      // ✅ NEW: الايجنت قرر يفتح شاشة الدفع (مصري أو دولي) بعد ما العميل حدد الباقة اللي عايزها
      if (data.subscribe?.region === 'eg') {
        const pkg = EG_PACKAGES.find(p => p.key === data.subscribe.packageKey) || EG_PACKAGES[0];
        setSubscribeModal({ type: 'eg', credits: pkg.credits, amountEgp: pkg.egp });
      } else if (data.subscribe?.region === 'intl') {
        const pkg = ALL_GUMROAD_PACKAGES.find(p => p.key === data.subscribe.packageKey) || ALL_GUMROAD_PACKAGES[0];
        setSubscribeModal({ type: 'intl', pkg });
      }

      // ✅ NEW: 3 فيديوهات مثال — كل واحد بيتعرض كرسالة منفصلة (مش لينك) عشان يقنع العميل
      if (data.showcaseVideos) {
        setMessages(m => [...m, ...SHOWCASE_VIDEO_URLS.map(url => ({ role: 'assistant', type: 'video', videoUrl: url }))]);
      }

      if (data.ready) {
        // ✅ FIX: موديل 5 كان بيرفض يكمل من غير صورة حتى لو العميل وصف الشخصية بالنص —
        // دلوقتي وصف نصي (characterDescriptions) بديل كامل للصورة، مش بس الصورة اللي بتشيل الشرط
        const hasCharacterInfo = lastUploadedPhotos.length > 0 || (data.ready.characterDescriptions && data.ready.characterDescriptions.length > 0);
        const needsPhoto = (data.ready.model === 5 && data.ready.needsCharacterPhoto && !hasCharacterInfo) || (data.ready.model === 7 && data.ready.needsProductPhoto && !lastUploadedPhotos.length);
        if (needsPhoto) {
          setMessages(m => [...m, { role: 'assistant', content: t.uploadCharacterFirst }]);
        } else {
          startGeneration(data.ready);
        }
      } else if (data.editScene) {
        // ✅ NEW: تعديل مشهد واحد بس — بقى مدعوم لموديل 1/2/3/4/5 (مش map-video ومش ads)
        const em = data.editScene.model;
        const hasSource = (em === 1 || em === 2) ? !!lastM12Video : (lastM345Video && lastM345Video.model === em);
        if (hasSource) {
          startSceneEdit(data.editScene);
        } else {
          setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'معنديش فيديو سابق في المحادثة دي أقدر أعدّل فيه — لازم نعمل فيديو الأول.' : "I don't have a previous video in this chat to edit — let's make one first." }]);
        }
      } else if (data.videoEdit) {
        // ✅ NEW: تعديل video-to-video لفيديو العميل الخاص اللي رفعه هو بنفسه
        if (uploadedVideoFile) {
          startVideoEdit(data.videoEdit);
        } else {
          setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'معنديش فيديو مرفوع في المحادثة دي أقدر أعدّله — ارفع الفيديو الأول.' : "I don't have an uploaded video in this chat to edit — please upload one first." }]);
        }
      } else if (data.generateImage) {
        startImageGeneration(data.generateImage);
      }

      // ✅ NEW (طلب العميل: "اربط ده بالايجنت... يظهر في شات الايجنت كمّل الفيديو"): فيديو
      // whiteboard مجاني اتعمل من صوت اتصوّر في نفس الرسالة — بيظهر كارت منفصل بيعمل poll
      // لحالته، وبعد ما يخلص بيظهر زرار "كمّل الفيديو" بيودّي لصفحة Whiteboard العامة
      if (data.whiteboardVideo?.job) {
        setMessages(m => [...m, { role: 'assistant', type: 'whiteboard', job: data.whiteboardVideo.job }]);
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

  // ✅ NEW (Phase 3 — new image-generation models): توليد صور مستقل، مش فيديو — مفيش
  // job طويل بيحتاج poll، الطلب نفسه بيستنى الصور جاهزة (backend بيعمل Prefer: wait)
  const startImageGeneration = async (gen) => {
    const jobUid = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'generating' };
    setMessages(m => [...m, { role: 'assistant', type: 'imageBatch', job }]);
    const updateJob = (patch) => {
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.type === 'imageBatch' && x.job?.uid === jobUid);
        if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
        return copy;
      });
    };
    try {
      const res = await fetch('/api/images/generate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          model: gen.model, prompt: gen.prompt, aspectRatio: gen.aspectRatio || '9:16', count: gen.count || 1,
          referenceImageUrls: Array.isArray(gen.referenceImageUrls) ? gen.referenceImageUrls : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        updateJob({ status: 'failed', error: data.message || data.error });
      } else {
        updateJob({ status: 'done', images: data.images, cost: data.creditCost });
      }
    } catch (e) {
      updateJob({ status: 'failed', error: e.message });
    }
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
    // ✅ FIX: كان بيعتمد بس على lastUploadedTranscript (صوت مرفوع)، فلو العميل لصق سكريبت كامل
    // كنص في الشات (من غير ما يرفع صوت)، الايجنت كان بيلخّصه في 6 كلمات جوه "idea" وبيضيع النص
    // الأصلي كله — فالفويس أوفر يطلع بيقول كلام مختلف تمامًا عن اللي العميل كتبه. دلوقتي بنستخدم
    // نفس آلية السكريبت الحقيقية سواء جت من صوت مرفوع (transcript) أو من نص العميل نفسه (ready.script).
    const typedScript = (ready.script || '').trim();
    const hasStructuredScenes = Array.isArray(lastParsedStructuredScenes) && lastParsedStructuredScenes.length > 0;
    const structuredNarration = hasStructuredScenes ? lastParsedStructuredScenes.map(s => String(s?.text || '')).join(' ') : '';
    const scriptText = lastUploadedTranscript || typedScript || structuredNarration || null;
    // ✅ FIX: كان بيثق في "videoLanguage" اللي الايجنت (LLM) قرره — وده افتراضيًا "en" إلا لو
    // العميل قال صراحة "الفيديو بالعربي". لكن لو العميل رفع تسجيل صوتي بالمصري (Voice-to-Video)
    // أو لصق سكريبت عربي كنص، الصوت نفسه عربي أكيد، فمفروض الكابشن يتطابق معاه تلقائيًا — مش
    // يفضل يعتمد على تخمين الموديل. ده كان سبب ظهور الكابشن مربعات بس من خلال الايجنت (الصفحة
    // المباشرة عندها اختيار لغة صريح بيدّي القيمة الصح دايمًا، فمكانتش بتقع في المشكلة دي).
    const hasUploadedScriptForLang = ready.model !== 5 && !!scriptText;
    const transcriptIsArabic = hasUploadedScriptForLang && isArabic(scriptText);
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
        form.append('style', ready.style || '');
        if (lastParsedAdsScenePlan) form.append('scenePlan', JSON.stringify(lastParsedAdsScenePlan));
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
            updateJob({ status: 'failed', creditError: true, error: renderData.message || (lang === 'ar' ? 'محتاج خطة فعالة عشان تعمل الفيديو ده' : 'You need an active plan for this video') });
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
      // ✅ NEW: Model 5 Map Video — مفيش scenes، مفيش صوت، مفيش صور شخصيات خالص. Seedance بيعمل
      // كل حاجة من برومبت واحد على السيرفر. بنتخطى توليد المشاهد والصوت بالكامل ونروح على طول للرندر
      const isMapVideo = ready.model === 5 && ready.isMapVideo === true;

      // ✅ Voice-to-Video / Typed Script / Structured Scenes: لو فيه صوت مرفوع، سكريبت مكتوب،
      // أو تقسيم مشاهد جاهز من العميل، نستخدمهم زي ما هم بدل ما نولّد محتوى جديد بعيد عنهم
      const hasUploadedScript = ready.model !== 5 && !!scriptText;

      if (!isMapVideo) {
      if (isM12) {
        // موديل 1/2: توليد السكريبت أولاً عبر SSE
        // ✅ FIX: كنا بنحوّل "30s" غلط لـ "auto" وده كان بيولّد 8 مشاهد (حجم دقيقة) بدل 4 (حجم 30 ثانية فعليًا)
        const { scenes: gotScenes } = await readSSE('/api/generate-scenes', hasStructuredScenes
          ? { idea: null, script: null, structuredScenes: lastParsedStructuredScenes, duration: ready.duration, mode: 'structured', videoLanguage: videoLang }
          : hasUploadedScript
          ? { idea: null, script: scriptText, tone: ready.tone || 'motivational', duration: ready.duration, mode: 'script', videoLanguage: videoLang }
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
          scenesBody = hasStructuredScenes
            ? { structuredScenes: lastParsedStructuredScenes, videoLanguage: videoLang, ratio: ready.ratio, videoStyle: style, styleSuffix: styleSuffixFor(style) }
            : hasUploadedScript
            ? { idea: null, script: scriptText, inputMode: 'script', imageCount: MODEL3_IMAGE_COUNT[ready.duration] || 6, videoLanguage: videoLang, ratio: ready.ratio, videoStyle: style, styleSuffix: styleSuffixFor(style) }
            : { idea: ready.idea, script: null, inputMode: 'idea', imageCount: MODEL3_IMAGE_COUNT[ready.duration] || 6, videoLanguage: videoLang, ratio: ready.ratio, videoStyle: style, styleSuffix: styleSuffixFor(style) };
        } else if (ready.model === 4) {
          scenesBody = hasStructuredScenes
            ? { structuredScenes: lastParsedStructuredScenes, videoLanguage: videoLang, videoStyle: style, styleSuffix: styleSuffixFor(style) }
            : hasUploadedScript
            ? { idea: null, script: scriptText, inputMode: 'script', sceneCount: MODEL4_SCENE_COUNT[ready.duration] || 8, videoLanguage: videoLang, videoStyle: style, styleSuffix: styleSuffixFor(style) }
            : { idea: ready.idea, script: undefined, inputMode: 'idea', sceneCount: MODEL4_SCENE_COUNT[ready.duration] || 8, videoLanguage: videoLang, videoStyle: style, styleSuffix: styleSuffixFor(style) };
        } else if (ready.model === 8) {
          // ✅ موديل 8 — نفس محرك كتابة السيناريو بتاع موديل 4 بالظبط، وبيدعم خطة عميل جاهزة
          // كمان (كل مشهد بمدته الخاصة بيه لو محددة، حتى لو مش من ضمن أزرار 5/10/15/20 الجاهزة)
          if (hasStructuredScenes) {
            scenesBody = { structuredScenes: lastParsedStructuredScenes, videoLanguage: videoLang, videoStyle: style, styleSuffix: styleSuffixFor(style) };
          } else {
          const m8SceneDur = ready.sceneDurationSec || 5;
          // ✅ FIX: لو الايجنت قال عدد المشاهد صراحة (sceneCount)، ده بيبقى مصدر الحقيقة —
          // مش نعتمد على قسمة totalDurationSec÷sceneDurationSec اللي كانت بتنهار لمشهد واحد
          // لو totalDurationSec جالنا خطأ (أو الايجنت اتلخبط وحط نفس رقم المدة الكلية)
          const m8TotalDur = ready.totalDurationSec || 30;
          const m8SceneCount = ready.sceneCount ? Math.max(1, Math.round(ready.sceneCount)) : Math.max(1, Math.round(m8TotalDur / m8SceneDur));
          scenesBody = hasUploadedScript
            ? { idea: null, script: scriptText, inputMode: 'script', sceneCount: m8SceneCount, videoLanguage: videoLang, videoStyle: style, styleSuffix: styleSuffixFor(style) }
            : { idea: ready.idea, script: undefined, inputMode: 'idea', sceneCount: m8SceneCount, videoLanguage: videoLang, videoStyle: style, styleSuffix: styleSuffixFor(style) };
          }
        } else {
          // ✅ NEW: خطة عميل جاهزة لموديل 5 (مش map-video) — بتاخد الأولوية على أي وضع تاني
          if (hasStructuredScenes) {
            const allChars5 = lastUploadedPhotos.length
              ? lastUploadedPhotos.map(p => ({ prompt: '', photo: p }))
              : (ready.characterDescriptions || []).map(desc => ({ prompt: desc, photo: null }));
            scenesBody = { structuredScenes: lastParsedStructuredScenes, characters: allChars5, duration: ready.duration };
          } else {
          // ✅ FIX: لو مفيش صور مرفوعة بس الأجنت جابله وصف نصي للشخصية، نستخدم الوصف بدل ما نمنع
          // التوليد — الباك إند أصلاً بيدعم وصف الشخصية بالنص (characterDescs) من غير أي صورة خالص
          const characters = lastUploadedPhotos.length
            ? lastUploadedPhotos.map(p => ({ prompt: '', photo: p }))
            : (ready.characterDescriptions || []).map(desc => ({ prompt: desc, photo: null }));
          scenesBody = ready.promptMode === 'image'
            ? { promptMode: 'image', characters: lastUploadedPhotos.length ? [{ prompt: '', photo: lastUploadedPhotos[0] }] : characters, duration: ready.duration, rawPrompt: ready.rawPrompt || undefined }
            : ready.promptMode === 'prompt'
            ? { promptMode: 'prompt', rawPrompt: ready.rawPrompt || ready.idea, characters, duration: ready.duration, styleSuffix: styleSuffixFor(style) }
            : { idea: ready.idea, characters, duration: ready.duration, videoStyle: style, styleSuffix: styleSuffixFor(style), stickmanStyle: ready.stickmanStyle || undefined };
          }
        }
        const scenesEndpoint = ready.model === 8 ? '/api/model4/generate-scenes' : `/api/model${ready.model}/generate-scenes`;
        const scenesRes = await fetch(scenesEndpoint, { method: 'POST', headers: authHeaders(), body: JSON.stringify(scenesBody) });
        const scenesData = await scenesRes.json();
        if (!scenesRes.ok) throw new Error(
          scenesData.error === 'content_policy_violation' ? (region === 'eg' ? scenesData.message_ar : scenesData.message) :
          scenesData.error === 'under_maintenance' ? (scenesData.message || (lang === 'ar' ? 'الموديل ده تحت الصيانة حاليًا، هيرجع قريب' : 'This model is under maintenance and will be back soon')) :
          (scenesData.error || 'Scene generation failed')
        );
        scenes = scenesData.scenes || [];
      }
      } // end !isMapVideo

      if (!activeJobRef.current) return;

      // ✅ Voice-to-Video حقيقي: لو العميل رفع تسجيل صوتي، نستخدمه هو نفسه كـ narration في الفيديو
      // من غير ما نولّد صوت صناعي جديد — بالظبط زي ما بيحصل في صفحة الموديل العادية
      let audioUrl = null;
      if (![5, 8].includes(ready.model) && lastUploadedVoiceUrl) {
        audioUrl = lastUploadedVoiceUrl;
      } else if (![5, 8].includes(ready.model) && scenes.length) {
        const fullText = scenes.map(s => s.text).join(' ');
        // ✅ NEW: فويس كلون — لو العميل طلب صوته المحفوظ، نستخدم /api/voice-clone/narrate بدل الصوت الجاهز
        if (ready.useMyVoice && myClonedVoice) {
          try {
            const cloneRes = await fetch('/api/voice-clone/narrate', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ text: fullText, videoLanguage: videoLang }) });
            const cloneData = await cloneRes.json();
            if (cloneRes.ok) audioUrl = cloneData.audioUrl;
          } catch { /* لو فشل الاستنساخ، هيكمل بالصوت الجاهز تحت */ }
        }
        if (!audioUrl) {
          // مفيش صوت مرفوع/مستنسخ — نولّد صوت صناعي بنفس الطريقة اللي صفحة الموديل نفسها بتستخدمها بالظبط
          try {
            const voiceRes = await fetch('/api/generate-voice', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ text: fullText, voice: voiceKey, videoLanguage: videoLang }) });
            const voiceData = await voiceRes.json();
            if (voiceRes.ok) audioUrl = voiceData.audioUrl;
          } catch { /* لو فشل التعليق الصوتي، هيكمل الفيديو من غير صوت */ }
        }
      }
      if (!activeJobRef.current) return;

      updateJob({ status: 'rendering' });
      timerRef.current = setInterval(() => updateJob({ elapsed: (job.elapsed || 0) + 1 }), 1000);

      let renderUrl, renderBody;
      const wantCaptions = ready.captions !== false; // default true
      const wantMusic = ready.music === true; // default false
      if (isMapVideo) {
        renderUrl = '/api/model5/map-video';
        renderBody = {
          topic: ready.mapVideoTopic || ready.idea,
          ratio: ready.ratio || '16:9',
          openingCaption: ready.mapVideoOpeningCaption || '',
          closingCaption: ready.mapVideoClosingCaption || '',
          narrationScript: ready.mapVideoScript || '',
        };
      } else if (isM12) {
        renderUrl = '/api/render';
        renderBody = { scenes, audioUrl, ratio: ready.ratio, duration: ready.duration, music: wantMusic, captions: wantCaptions, transitions: true, videoType: VIDEO_TYPE_BY_MODEL[ready.model], videoLanguage: videoLang };
      } else if (ready.model === 3) {
        renderUrl = '/api/model3/render';
        renderBody = { scenes, audioUrl, ratio: ready.ratio, captions: wantCaptions, transitions: false, music: wantMusic, videoLanguage: videoLang, duration: ready.duration, videoStyle: style, styleSuffix: styleSuffixFor(style) };
      } else if (ready.model === 4) {
        renderUrl = '/api/model4/render';
        renderBody = { scenes, audioUrl, ratio: ready.ratio, captions: wantCaptions, music: wantMusic, videoLanguage: videoLang, duration: ready.duration, inputMode: 'idea', videoStyle: style, styleSuffix: styleSuffixFor(style) };
      } else if (ready.model === 8) {
        renderUrl = '/api/model8/render';
        renderBody = { scenes, ratio: ready.ratio, sceneDurationSec: ready.sceneDurationSec || 5, audioMode: ready.audioMode || 'none', voiceKey: ready.voiceKey || 'male_wise', videoLanguage: videoLang, captions: wantCaptions, characterPhoto: lastUploadedPhotos[0] || undefined, useMyVoice: !!(ready.useMyVoice && myClonedVoice) };
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
          updateJob({ status: 'failed', creditError: true, error: renderData.message || (lang === 'ar' ? 'محتاج خطة فعالة عشان تعمل الفيديو ده' : 'You need an active plan for this video') });
          return;
        }
        if (renderData.error === 'under_maintenance') {
          updateJob({ status: 'failed', creditError: true, error: renderData.message || (lang === 'ar' ? 'الموديل ده تحت الصيانة حاليًا، هيرجع قريب' : 'This model is under maintenance and will be back soon') });
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
            } else if ([3, 4, 5, 8].includes(ready.model) && !isMapVideo && sd.editContext) {
              // ✅ NEW: نفس الفكرة لموديل 3/4/5 (مش map-video) — الـ editContext راجع من
              // السيرفر نفسه (فيه sceneImageUrls/sceneClipUrls الجاهزة لإعادة الاستخدام)
              setLastM345Video({ model: ready.model, ...sd.editContext, videoUrl: sd.videoUrl });
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
    const em = editScene.model;
    const isOldM12 = em === 1 || em === 2;
    // ✅ NEW: نحدد مصدر الفيديو المحفوظ والـ endpoint الصح حسب الموديل اللي بيتعدّل
    const sourceVideo = isOldM12 ? lastM12Video : (lastM345Video && lastM345Video.model === em ? lastM345Video : null);
    if (!sourceVideo || activeJobRef.current) return;
    const endpoint = isOldM12 ? '/api/edit-scene' : `/api/model${em}/edit-scene`;

    const jobUid = `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'rendering', ratio: sourceVideo.ratio || '9:16', elapsed: 0 };
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
      const res = await fetch(endpoint, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ ...sourceVideo, sceneIndex: editScene.sceneIndex, newDescription: editScene.description, mode: editScene.editMode || 'text', referenceImageBase64: editScene.editMode === 'reference' ? lastUploadedPhotos[lastUploadedPhotos.length - 1] : undefined }),
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
            // ✅ الفيديو المعدّل بقى هو "آخر فيديو" — لو عايز يعدّل مشهد تاني بعده يبني على ده.
            // لموديل 3/4/5 بنحدّث الـ editContext كامل (روابط الصور/الكليبات الجديدة) عشان
            // تعديلات متتالية تفضل شغالة صح من غير ما تفقد المشاهد اللي اتعدّلت قبل كده
            if (isOldM12) {
              setLastM12Video(v => v ? { ...v, videoUrl: sd.videoUrl } : v);
            } else {
              setLastM345Video(v => v ? { ...v, ...sd.editContext, videoUrl: sd.videoUrl } : v);
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
      clearInterval(timerRef.current);
      if (activeJobRef.current) updateJob({ status: 'failed', error: e.message });
      activeJobRef.current = null;
    }
  };

  // ✅ NEW: تعديل video-to-video لفيديو العميل الخاص اللي رفعه هو بنفسه (مش متولّد من المنصة)
  const startVideoEdit = async (videoEdit) => {
    if (!uploadedVideoFile || activeJobRef.current) return;
    const jobUid = `videoedit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'rendering', ratio: '9:16', elapsed: 0 };
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
      const form = new FormData();
      form.append('video', uploadedVideoFile, uploadedVideoFile.name || 'video.mp4');
      form.append('editPrompt', videoEdit.editPrompt || '');
      form.append('addVoiceover', String(!!videoEdit.addVoiceover));
      form.append('voiceoverText', videoEdit.voiceoverText || '');
      form.append('addCaptions', String(!!videoEdit.addCaptions));
      form.append('videoLanguage', lang);
      form.append('ratio', '9:16');

      const res = await fetch('/api/video-edit', { method: 'POST', headers: tokenHeader(), body: form });
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

  // ✅ NEW (Workspace redesign, Phase 2): تبويب فلترة الوسائط في اللوحة اليمين + طي/فرد اللوحة
  const [rightTab, setRightTab] = useState('all');
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);

  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  // ✅ NEW: زرار اختيار ستايل اختياري جنب زرار الإرفاق — بيدّي الإيجنت تلميح عن الستايل
  // البصري المطلوب (anime/3D cartoon/action/realistic/cinematic/map video) قبل ما يكتب البرومبت،
  // اختياري بالكامل ومش شرط، وبيفضل مختار (persistent) لحد ما تغيّره أو تلغيه بنفسك
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [styleMenuOpen, setStyleMenuOpen] = useState(false);
  const STYLE_OPTIONS = [
    { key: 'anime',      icon: Sparkles,     label: lang === 'ar' ? 'أنمي' : 'Anime' },
    { key: '3d_cartoon', icon: Box,          label: lang === 'ar' ? 'كرتون 3D' : '3D Cartoon' },
    { key: 'action',     icon: Swords,       label: lang === 'ar' ? 'أكشن' : 'Action' },
    { key: 'realistic',  icon: Camera,       label: lang === 'ar' ? 'واقعي' : 'Realistic' },
    { key: 'cinematic',  icon: Clapperboard, label: lang === 'ar' ? 'سينمائي' : 'Cinematic' },
    { key: 'map_video',  icon: MapIcon,      label: lang === 'ar' ? 'فيديو خريطة' : 'Map Video' },
  ];

  const StylePickerButton = () => (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setStyleMenuOpen(v => !v)}
        title={lang === 'ar' ? 'اختر ستايل بصري (اختياري)' : 'Pick a visual style (optional)'}
        style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: selectedStyle ? 'rgba(124,106,247,0.18)' : (styleMenuOpen ? 'var(--accent-bg)' : 'rgba(255,255,255,0.05)'),
          border: `1px solid ${selectedStyle || styleMenuOpen ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.08)'}`,
          color: selectedStyle ? 'var(--accent2)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 15, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s' }}>
        {selectedStyle
          ? (() => { const SelIcon = STYLE_OPTIONS.find(s => s.key === selectedStyle)?.icon; return SelIcon ? <SelIcon size={16} strokeWidth={2} /> : null; })()
          : '▾'}
      </button>
      {styleMenuOpen && (
        <>
          <div onClick={() => setStyleMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', bottom: 46, left: 0, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: 6, minWidth: 190, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {STYLE_OPTIONS.map(opt => (
              <button key={opt.key}
                onClick={() => { setSelectedStyle(v => v === opt.key ? null : opt.key); setStyleMenuOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
                  background: selectedStyle === opt.key ? 'rgba(124,106,247,0.15)' : 'none', border: 'none',
                  color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: lang === 'ar' ? 'right' : 'left' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = selectedStyle === opt.key ? 'rgba(124,106,247,0.15)' : 'none'}>
                <opt.icon size={16} strokeWidth={2} />{opt.label}
                {selectedStyle === opt.key && <Check size={14} strokeWidth={3} style={{ marginLeft: 'auto', color: 'var(--accent2)' }} />}
              </button>
            ))}
            {selectedStyle && (
              <button onClick={() => { setSelectedStyle(null); setStyleMenuOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 2, paddingTop: 10, color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: lang === 'ar' ? 'right' : 'left' }}
                onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
                <X size={14} strokeWidth={2.5} /> {lang === 'ar' ? 'إلغاء الاختيار' : 'Clear selection'}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const AttachBar = () => (
    <div style={{ position: 'relative' }}>
      <input ref={voiceInputRef} type="file" accept="audio/*" onChange={(e) => { handleVoiceFile(e); setAttachMenuOpen(false); }} style={{ display: 'none' }} />
      <input ref={voiceCloneInputRef} type="file" accept="audio/*" onChange={(e) => { handleVoiceCloneFile(e); setAttachMenuOpen(false); }} style={{ display: 'none' }} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={(e) => { handleImageFile(e); setAttachMenuOpen(false); }} style={{ display: 'none' }} />
      <input ref={videoInputRef} type="file" accept="video/*" onChange={(e) => { handleVideoFile(e); setAttachMenuOpen(false); }} style={{ display: 'none' }} />
      <button onClick={() => setAttachMenuOpen(v => !v)} title={t.attachTitle}
        style={{ width: 38, height: 38, borderRadius: 10, background: attachMenuOpen ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${attachMenuOpen ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.08)'}`, color: attachMenuOpen ? 'var(--accent2)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s', transform: attachMenuOpen ? 'rotate(45deg)' : 'none' }}>+</button>

      {attachMenuOpen && (
        <>
          <div onClick={() => setAttachMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', bottom: 46, left: 0, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: 6, minWidth: 190, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={() => { voiceInputRef.current?.click(); }} title={t.voiceTitle(limits.MAX_AUDIO_SEC / 60)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: isArabic(t.attachTitle) ? 'right' : 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <Mic size={16} strokeWidth={2} />{t.attachVoice}
            </button>
            <button onClick={() => { imageInputRef.current?.click(); }} title={t.imageTitle}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: isArabic(t.attachTitle) ? 'right' : 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <ImageIcon size={16} strokeWidth={2} />{t.attachPhoto}
            </button>
            <button onClick={() => { videoInputRef.current?.click(); }} title={lang === 'ar' ? `ارفع فيديو للتعديل (أقصى ${MAX_VIDEO_UPLOAD_SEC} ثانية)` : `Upload a video to edit (max ${MAX_VIDEO_UPLOAD_SEC}s)`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: isArabic(t.attachTitle) ? 'right' : 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <Film size={16} strokeWidth={2} />{lang === 'ar' ? 'ارفع فيديو للتعديل' : 'Upload video to edit'}
            </button>
            <button onClick={() => { voiceCloneInputRef.current?.click(); }} disabled={savingVoice}
              title={lang === 'ar' ? `احفظ صوتك مرة واحدة (موصى بيها 10 ثواني، أقصى دقيقة) واستخدمه في أي فيديو جاي` : `Save your voice once (10s recommended, max 1 minute) and use it in any future video`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: savingVoice ? 'wait' : 'pointer', textAlign: isArabic(t.attachTitle) ? 'right' : 'left' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <Volume2 size={16} strokeWidth={2} />{savingVoice ? (lang === 'ar' ? 'جاري الحفظ...' : 'Saving...') : (myClonedVoice ? (lang === 'ar' ? 'تحديث صوتي المحفوظ' : 'Update my saved voice') : (lang === 'ar' ? 'احفظ صوتي' : 'Save my voice'))}
            </button>
          </div>
        </>
      )}
    </div>
  );

  // ✅ NEW (Workspace redesign, Phase 2): الشات بقى شريط جانبي نص فقط — أي ميديا متولدة
  // (فيديو/whiteboard/دفعة صور) بتتشال من قائمة رسائل الشات وتتعرض في canvas النص بدل كده
  const MEDIA_TYPES = ['render', 'whiteboard', 'imageBatch'];
  const mediaItems = messages
    .map((m, i) => ({ ...m, _i: i }))
    .filter(m => MEDIA_TYPES.includes(m.type));
  const visibleMedia = rightTab === 'images' ? mediaItems.filter(m => m.type === 'imageBatch')
    : rightTab === 'videos' ? mediaItems.filter(m => m.type === 'render' || m.type === 'whiteboard')
    : mediaItems;

  const RIGHT_TABS = [
    { key: 'all', label: t.allMedia, icon: LayoutGrid },
    { key: 'images', label: t.imagesTab, icon: Images },
    { key: 'videos', label: t.videosTab, icon: Video },
  ];

  return (
    <div style={{ height: 'calc(100vh - 74px)', display: 'flex', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        .agent-bubble{animation:fadeUp 0.25s ease}
        .agent-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;animation:bounce 1s ease infinite}
        .agent-models-btn:hover{background:rgba(124,106,247,0.16) !important;border-color:rgba(124,106,247,0.45) !important;}
        .agent-icon-btn:hover{background:var(--bg3) !important;color:var(--text) !important;}
        .agent-tab-btn:hover{background:var(--bg3) !important;}
      `}</style>

      {/* ── Left: Agent chat sidebar ─────────────────────────────────────────── */}
      <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', borderInlineEnd: '1px solid var(--border)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 100% 30% at 50% -10%, rgba(124,106,247,0.08) 0%, transparent 70%)' }} />

        <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', position: 'relative', flexShrink: 0 }}>
          <button className="agent-icon-btn" onClick={() => onNavigate?.('dashboard')} title={t.backToProjects}
            style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', color: 'var(--text2)', flexShrink: 0, transition: 'all 0.15s' }}>
            <ArrowLeft size={15} strokeWidth={2} />
          </button>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            {activeProject ? (
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{activeProject.name}</span>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Erivion Agent</span>
            )}
          </div>
          <button className="agent-icon-btn" onClick={onSwitchToModels} title={t.models}
            style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent2)', flexShrink: 0, transition: 'all 0.15s' }}>
            <Clapperboard size={15} strokeWidth={2} />
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, position: 'relative' }}>
          {!started ? (
            <div style={{ margin: 'auto 0', textAlign: 'center' }}>
              <img src={LOGO} alt="Erivion" style={{ width: 34, height: 34, objectFit: 'contain', marginBottom: 14 }} />
              <h1 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.01em', fontFamily: 'var(--font-display)', direction: isArabic(t.heroTitle) ? 'rtl' : 'ltr' }}>{t.heroTitle}</h1>
              <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 20px', lineHeight: 1.7, direction: isArabic(t.heroSub) ? 'rtl' : 'ltr' }}>{t.heroSub}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {t.chips.map((c, i) => (
                  <button key={i} onClick={() => { setInput(c.text); }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-bg)'; e.currentTarget.style.borderColor = 'rgba(124,106,247,0.35)'; e.currentTarget.style.color = 'var(--text)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--border2)'; e.currentTarget.style.color = 'var(--text2)'; }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all 0.18s ease', textAlign: isArabic(c.label) ? 'right' : 'left' }}>
                    <c.icon size={14} strokeWidth={2} />{c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => {
              if (MEDIA_TYPES.includes(m.type)) return null;
              if (m.type === 'video') {
                return (
                  <div key={i} className="agent-bubble" style={{ alignSelf: 'flex-start' }}>
                    <video src={m.videoUrl} controls playsInline style={{ width: 200, maxWidth: '100%', borderRadius: 14, display: 'block', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
                  </div>
                );
              }
              const ar = isArabic(m.content);
              return (
                <div key={i} className="agent-bubble" style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '92%', padding: '12px 16px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    background: m.role === 'user' ? 'linear-gradient(135deg,#7c6af7,#9d4edd)' : 'rgba(255,255,255,0.045)',
                    border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.09)',
                    boxShadow: m.role === 'user' ? '0 4px 16px rgba(124,106,247,0.25)' : '0 2px 10px rgba(0,0,0,0.15)',
                    color: '#fff', fontSize: 13.5, lineHeight: 1.7, direction: ar ? 'rtl' : 'ltr', textAlign: ar ? 'right' : 'left',
                  }}>
                    {m.imagePreviews?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {m.imagePreviews.map((src, idx) => <img key={idx} src={src} alt="upload" style={{ maxWidth: 120, borderRadius: 10, display: 'block' }} />)}
                      </div>
                    )}
                    {m.hasVoice && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, opacity: 0.8, marginBottom: 6 }}><Mic size={12} strokeWidth={2} /> {t.voiceAttached}</div>}
                    {m.content}
                  </div>
                </div>
              );
            })
          )}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 16px', borderRadius: '16px 16px 16px 4px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', alignSelf: 'flex-start' }}>
              <span className="agent-dot" style={{ animationDelay: '0s' }} />
              <span className="agent-dot" style={{ animationDelay: '0.15s' }} />
              <span className="agent-dot" style={{ animationDelay: '0.3s' }} />
            </div>
          )}
        </div>

        <div style={{ padding: '10px 14px 14px', flexShrink: 0, position: 'relative' }}>
          {error && <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</div>}

          {(voiceFile || imageFiles.length > 0 || (uploadedVideoFile && !videoSentOnce)) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {voiceFile && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: 'var(--accent2)' }}><Mic size={13} strokeWidth={2} /> {voiceFile.name.slice(0, 20)} <button onClick={() => setVoiceFile(null)} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontWeight: 700 }}><X size={13} strokeWidth={2.5} /></button></div>}
              {imageFiles.map((_, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: 'var(--accent2)' }}><ImageIcon size={13} strokeWidth={2} /> {t.imageAttached}{imageFiles.length > 1 ? ` ${idx + 1}` : ''} <button onClick={() => setImageFiles(prev => prev.filter((_, i) => i !== idx))} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontWeight: 700 }}><X size={13} strokeWidth={2.5} /></button></div>
              ))}
              {uploadedVideoFile && !videoSentOnce && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: 'var(--accent2)' }}><Film size={13} strokeWidth={2} /> {uploadedVideoFile.name.slice(0, 20)} ({uploadedVideoDurationSec != null ? uploadedVideoDurationSec + 's' : '...'}) <button onClick={() => { setUploadedVideoFile(null); setUploadedVideoDurationSec(null); setVideoSentOnce(false); }} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontWeight: 700 }}><X size={13} strokeWidth={2.5} /></button></div>}
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
            <StylePickerButton />
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
                style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s ease' }}><Square size={14} strokeWidth={2} fill="currentColor" /></button>
            ) : (
              <button onClick={() => sendMessage()} disabled={!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile}
                onMouseEnter={e => { if (input.trim() || voiceFile || imageFiles.length || uploadedVideoFile) e.currentTarget.style.filter = 'brightness(1.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#7c6af7,#9d4edd)', border: 'none', color: '#fff', cursor: (!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile) ? 'default' : 'pointer', flexShrink: 0, transition: 'filter 0.15s ease', boxShadow: (!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile) ? 'none' : '0 3px 10px rgba(124,106,247,0.3)' }}><Send size={15} strokeWidth={2.25} /></button>
            )}
          </div>
          <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>{t.onlyVideo}</p>
        </div>
      </div>

      {/* ── Center: Media canvas ──────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)', letterSpacing: '-0.2px' }}>
            {activeProject?.name || t.backToProjects}
          </span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {visibleMedia.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg2)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                <Images size={28} strokeWidth={1.5} color="var(--text3)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t.canvasEmptyTitle}</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 320, lineHeight: 1.7 }}>{t.canvasEmptySub}</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18 }}>
              {visibleMedia.map(m => (
                <div key={m._i} className="agent-bubble">
                  {m.type === 'render' && <RenderCard job={m.job} lang={lang} onNavigate={onNavigate} />}
                  {m.type === 'whiteboard' && <WhiteboardCard job={m.job} lang={lang} onNavigate={onNavigate} />}
                  {m.type === 'imageBatch' && <ImageBatchCard job={m.job} lang={lang} />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Organize panel ─────────────────────────────────────────────── */}
      <div style={{ width: rightPanelCollapsed ? 56 : 176, flexShrink: 0, borderInlineStart: '1px solid var(--border)', display: 'flex', flexDirection: 'column', transition: 'width 0.15s ease', overflow: 'hidden' }}>
        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          {RIGHT_TABS.map(tabItem => (
            <button key={tabItem.key} className="agent-tab-btn" onClick={() => setRightTab(tabItem.key)}
              title={tabItem.label}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, background: rightTab === tabItem.key ? 'var(--accent-bg)' : 'transparent', color: rightTab === tabItem.key ? 'var(--accent2)' : 'var(--text2)', fontSize: 12.5, fontWeight: 600, justifyContent: rightPanelCollapsed ? 'center' : 'flex-start', transition: 'background 0.15s ease', whiteSpace: 'nowrap' }}>
              <tabItem.icon size={15} strokeWidth={2} style={{ flexShrink: 0 }} />
              {!rightPanelCollapsed && tabItem.label}
            </button>
          ))}
        </div>
        <div style={{ padding: 10, borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button className="agent-tab-btn" onClick={() => setRightPanelCollapsed(v => !v)} title={rightPanelCollapsed ? t.expand : t.collapse}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: rightPanelCollapsed ? 'center' : 'flex-start', gap: 9, padding: '9px 10px', borderRadius: 9, background: 'transparent', color: 'var(--text2)', fontSize: 12.5, fontWeight: 600, transition: 'background 0.15s ease' }}>
            {rightPanelCollapsed ? <PanelRightOpen size={15} strokeWidth={2} /> : <PanelRightClose size={15} strokeWidth={2} />}
            {!rightPanelCollapsed && t.collapse}
          </button>
        </div>
      </div>

      {subscribeModal?.type === 'eg' && (
        <EgPaymentModal credits={subscribeModal.credits} amountEgp={subscribeModal.amountEgp}
          onClose={() => setSubscribeModal(null)}
          onSuccess={() => {
            setSubscribeModal(null);
            setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'تم إرسال طلب الاشتراك! هيتم مراجعته وإضافة الكريديت خلال 24 ساعة.' : 'Subscription request sent! It will be reviewed and credits added within 24 hours.' }]);
          }} />
      )}
      {subscribeModal?.type === 'intl' && (
        <IntlPaymentModal pkg={subscribeModal.pkg}
          onClose={() => setSubscribeModal(null)}
          onSuccess={() => {
            setSubscribeModal(null);
            setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'تم إرسال طلب الاشتراك! هيتم مراجعته وإضافة الكريديت خلال 24 ساعة.' : 'Subscription request sent! It will be reviewed and credits added within 24 hours.' }]);
          }} />
      )}
    </div>
  );
}