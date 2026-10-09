import DocSetupCard from '../components/DocSetupCard.jsx';
import React, { useState, useRef, useEffect } from 'react';
import RatingPrompt from './RatingPrompt.jsx';
import { EgPaymentModal, IntlPaymentModal, EG_PACKAGES, ALL_GUMROAD_PACKAGES } from './PricingPage.jsx';
import { egPrice, getPromo } from '../promo.js';
import {
  ShoppingBag, Clapperboard, FileText, GraduationCap, ImageIcon, Mic, Film, Sparkles,
  Camera, Swords, Map as MapIcon, Check, X, Lock, Construction, Video, Send,
  CheckCircle2, Download, AlertTriangle, Plus, Box, Volume2, Square,
  ArrowLeft, LayoutGrid, Images, PanelRightClose, PanelRightOpen,
  MoreVertical, Heart, RotateCcw, Copy, Pencil, Share2, Flag, Trash2, Maximize2,
  ChevronLeft, ChevronRight, Scissors,
} from 'lucide-react';
import ShimmerLoader from '../components/ShimmerLoader.jsx';
import { downloadRemoteFile, fetchRemoteBlob } from '../utils/download.js';

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

// ✅ FIX (باج حقيقي: توليد فيديو طويل بيرجع "Unexpected token '<', "<!DOCTYPE "... is not
// valid JSON" للعميل بدل رسالة مفهومة — الفيديو كان فعلاً بينعمل صح على Replicate، بس
// اتصال الـ HTTP الطويل (دقايق) بيتقطع من بروكسي/gateway في النص فيرجع صفحة HTML بدل JSON):
// أي حاجة مش JSON حقيقي بترجع رسالة عربي/إنجليزي مفهومة بدل ما تفشل بخطأ JS خام
async function safeJson(res, lang) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(lang === 'ar'
      ? 'الاتصال انقطع أثناء التوليد (استغرق وقت طويل) — جرّب تاني بعد شوية، ولو اتخصم كريديت من غير نتيجة كلم الدعم.'
      : 'The connection dropped during generation (it took too long) — please try again, and contact support if credits were charged with no result.');
  }
  return res.json();
}

// \u2705 NEW (fix "\u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0646\u0642\u0637\u0639 \u0623\u062B\u0646\u0627\u0621 \u0627\u0644\u062A\u0648\u0644\u064A\u062F" \u0645\u0639 seedance 1.5 pro/\u062A\u0648\u0644\u064A\u062F\u0627\u062A \u0637\u0648\u064A\u0644\u0629): \u0627\u0644\u0628\u0627\u0643 \u0625\u0646\u062F \u0628\u0642\u0649
// \u0628\u064A\u0631\u062F \u0641\u0648\u0631\u064B\u0627 \u0628\u0640jobId (202) \u0628\u062F\u0644 \u0645\u0627 \u064A\u0633\u062A\u0646\u0649 \u0627\u0644\u062A\u0648\u0644\u064A\u062F \u0643\u0627\u0645\u0644 \u0639\u0644\u0649 \u0646\u0641\u0633 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0627\u0644\u0637\u0648\u064A\u0644 (\u0646\u0641\u0633 \u0641\u0643\u0631\u0629
// /api/render \u0627\u0644\u0642\u062F\u064A\u0645 \u0628\u0627\u0644\u0638\u0628\u0637) \u2014 \u0627\u0644\u062F\u0627\u0644\u0629 \u062F\u064A \u0628\u062A\u0639\u0645\u0644 poll \u0639\u0644\u0649 \u062D\u0627\u0644\u0629 \u0627\u0644\u0640job \u0644\u062D\u062F \u0645\u0627 \u064A\u062E\u0644\u0635 (done/failed)
function pollGenerationJob(kind, jobId, lang) {
  const statusUrl = kind === 'image' ? `/api/images/generate-status/${jobId}` : kind === 'video-merge' ? `/api/videos/merge-status/${jobId}` : kind === 'video-analysis' ? `/api/videos/analyze-status/${jobId}` : `/api/videos/generate-status/${jobId}`;
  return new Promise((resolve) => {
    const iv = setInterval(async () => {
      try {
        const sr = await fetch(statusUrl, { headers: tokenHeader() });
        const sd = await safeJson(sr, lang);
        if (sd.status === 'done' || sd.status === 'failed') {
          clearInterval(iv);
          resolve(sd);
        }
      } catch {}
    }, 4000);
  });
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
    onlyVideo: 'قد يخطئ الايجنت أحيانًا — راجع الفيديو أو الصورة قبل التحميل.',
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
    favoritesTab: 'المفضّلة',
    favoritesEmpty: 'مفيش حاجة في المفضّلة لسه — دوس على القلب فوق أي صورة أو فيديو عشان تضيفه هنا.',
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
    onlyVideo: 'The Agent can make mistakes — review your video or image before downloading.',
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
    favoritesTab: 'Favorites',
    favoritesEmpty: "Nothing in Favorites yet — click the heart on any image or video to add it here.",
    collapse: 'Collapse',
    expand: 'Expand',
  },
};

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
  // ✅ FIX (طلب العميل: "ليه الصور والفيديوهات بتطلع في المديا ضغيره كده") — كانت الكروت
  // بتاخد عرض بكسل ثابت صغير (RATIO_BOX) بدل ما تملا مساحة الـ grid cell المتاحة (اللي
  // بقت أكبر دلوقتي بعد تكبير الـ minmax)، فكانت الصورة/الفيديو دايمًا صغيرة بصرف النظر عن
  // حجم الشاشة. دلوقتي بتاخد 100% من عرض الكارت وترتفع/تعرض حسب aspect-ratio الحقيقي
  const cssAspectRatio = (job.ratio || '9:16').replace(':', ' / ');
  const t = T[lang];
  const [showRating, setShowRating] = useState(true);

  if (job.status === 'done') {
    return (
      <div style={{ width: '100%' }}>
        {showRating && <RatingPrompt modelUsed={`Agent - Model ${job.model || ''}`} onClose={() => setShowRating(false)} lang={lang} />}
        <video src={job.videoUrl} controls autoPlay muted style={{ width: '100%', aspectRatio: cssAspectRatio, borderRadius: 14, objectFit: 'cover', background: '#000', border: '1px solid rgba(255,255,255,0.1)', display: 'block' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22c55e', fontWeight: 700 }}><CheckCircle2 size={13} strokeWidth={2.25} /> {t.done} {job.cost || ''} {t.credits}</span>
          <button onClick={() => downloadRemoteFile(job.videoUrl, `erivion-video-${job.uid || Date.now()}.mp4`)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent2)', fontWeight: 700, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}><Download size={13} strokeWidth={2.25} /> {t.download}</button>
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
    <div style={{ width: '100%' }}>
      <ShimmerLoader
        ratio={job.ratio}
        label={statusLabel}
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

// ✅ NEW (طلب العميل: "اقدر اقول للايجنت اعمل فيديو وانشره على القناة دلوقتي وهو بيدا ويعمل
// كل حاجه ... ويقولي عمل اي وكده وتكلفة الكريديت"): كارت تشغيلة قناة حقيقية بدأها الايجنت من
// الشات (channelSchedulerService.js's triggerChannelRunNow) — نفس فكرة WhiteboardCard فوق
// بالظبط (poll لحد done/failed)، بس بيتابع daily_video_runs مش audio_video_jobs، وبيوريّ
// التكلفة الحقيقية النهائية + لينك يوتيوب لو اترفع تلقائي
// كارت مهمة الاستوديو (مونتاج/فيلم وثائقي/مونتاج ذكي) جوه الشات: بيعمل poll لحالة المهمة وبيعرض الفيديو لما يخلص
function DocJobCard({ job: initial, lang, onNavigate }) {
  const ar = lang === 'ar';
  const tt = ar
    ? { working: 'بيشتغل على الفيديو دلوقتي...', failed: 'حصلت مشكلة — الكريديت اترجّع', done: 'الفيديو جاهز!', studio: 'افتحه في الاستوديو (حزمة النشر، الترجمة...)', stages: { queued: 'في الطابور', transcribe: 'بيفهم الفيديوهات ويفرّغ الكلام', cut: 'بيقص ويركّب اللقطات', finish: 'انتقالات وكابشن وموسيقى', script: 'كتابة السكريبت', narration: 'التعليق الصوتي', plan: 'تخطيط المشاهد', assets: 'جلب اللقطات', render: 'مونتاج ورسم', upload: 'رفع الفيديو' } }
    : { working: 'Working on your video...', failed: 'Something went wrong — your credits were refunded', done: 'Your video is ready!', studio: 'Open in Studio (upload package, subtitles…)', stages: { queued: 'Queued', transcribe: 'Understanding the videos and transcribing', cut: 'Cutting and arranging', finish: 'Transitions, captions and music', script: 'Writing the script', narration: 'Narration', plan: 'Planning scenes', assets: 'Finding footage', render: 'Editing and rendering', upload: 'Uploading' } };
  const [job, setJob] = useState({ ...initial, status: 'queued', progress: 0 });
  useEffect(() => {
    if (['done', 'failed'].includes(job.status)) return undefined;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/documentary/jobs/${initial.jobId}`, { headers: tokenHeader() });
        if (!r.ok) return;
        const d = await r.json();
        setJob(prev => ({ ...prev, status: d.status, stage: d.stage, progress: d.progress, videoUrl: d.videoUrl, error: d.error }));
        if (['done', 'failed'].includes(d.status)) clearInterval(id);
      } catch { /* retry */ }
    }, 3000);
    return () => clearInterval(id);
  }, [job.status, initial.jobId]);
  if (job.status === 'failed') return <div style={{ maxWidth: 300, padding: '12px 16px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 13, color: '#ef4444' }}><AlertTriangle size={14} strokeWidth={2.25} style={{ verticalAlign: -2 }} /> {job.error || tt.failed}</div>;
  if (job.status === 'done' && job.videoUrl) {
    return (
      <div style={{ width: 300 }}>
        <video src={job.videoUrl} controls playsInline style={{ width: 300, borderRadius: 14, display: 'block', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={13} color="#22c55e" /> {tt.done}</div>
          <button onClick={() => downloadRemoteFile(job.videoUrl, `erivion-${job.kind || 'video'}-${initial.jobId}.mp4`)} style={{ fontSize: 11.5, color: '#fff', background: 'linear-gradient(135deg,#7c6af7,#9d4edd)', border: 'none', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}><Download size={12} /> {ar ? 'تنزيل' : 'Download'}</button>
          <button onClick={() => onNavigate?.('documentary')} style={{ fontSize: 11.5, color: '#a78bfa', background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>{tt.studio}</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ width: 280, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(124,106,247,0.18), rgba(0,0,0,0.6))', border: '1px solid rgba(124,106,247,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="spinning" style={{ display: 'inline-block', fontSize: 18 }}>◐</span>
        <span style={{ fontSize: 13, color: '#fff' }}>{tt.working}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 999, overflow: 'hidden', marginTop: 10 }}><div style={{ width: `${Math.max(4, job.progress || 0)}%`, height: '100%', background: 'linear-gradient(90deg,#7c6af7,#9d4edd)', transition: 'width .6s' }} /></div>
      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>{tt.stages[job.stage] || tt.stages.queued} · {job.progress || 0}%</div>
    </div>
  );
}

function ChannelRunCard({ job: initialJob, lang, onNavigate }) {
  const tt = lang === 'ar'
    ? { generating: 'بيعمل الفيديو دلوقتي...', failed: 'حصلت مشكلة وأنا بعمل الفيديو', done: 'خلص! جاهز للمراجعة', cost: 'كريديت', goReview: 'روح راجعه وانشره' }
    : { generating: 'Making the video now...', failed: 'Something went wrong making the video', done: 'Done! Ready for review', cost: 'credits', goReview: 'Go review & publish it' };
  const [job, setJob] = useState(initialJob);
  const pollRef = useRef(null);

  useEffect(() => {
    if (['done', 'failed'].includes(job.status)) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/channels/runs/${job.runId}/status`, { headers: tokenHeader() });
        const d = await r.json();
        if (r.ok && d.run) {
          setJob(prev => ({ ...prev, status: d.run.status, videoUrl: d.run.videoUrl, error: d.run.error, creditsCharged: d.run.creditsCharged }));
          if (['done', 'failed'].includes(d.run.status)) clearInterval(pollRef.current);
        }
      } catch { /* keep polling */ }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [job.status, job.runId]);

  if (job.status === 'failed') {
    return (
      <div style={{ maxWidth: 280, padding: '12px 16px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#ef4444' }}><AlertTriangle size={14} strokeWidth={2.25} /> {job.error || tt.failed}</div>
      </div>
    );
  }

  // ✅ FIX (طلب العميل: "العميل يراجع الفيديو الأول وبعد كده يوافق على النشر او لا" — قبل
  // كده الكارت ده كان بيوريّ لينك يوتيوب هنا كأنه اترفع تلقائي): مفيش نشر تلقائي تاني —
  // الكارت الحقيقي القابل للمراجعة/النشر (ChannelReviewCard) بيتضاف لمشروع القناة الدائم،
  // مش هنا في المحادثة اللي طلب فيها العميل الفيديو (ممكن تبقى محادثة تانية خالص)
  if (job.status === 'done') {
    return (
      <div style={{ width: 240 }}>
        <video src={job.videoUrl} controls playsInline style={{ width: 240, borderRadius: 14, display: 'block', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircle2 size={13} color="#22c55e" /> {tt.done}</div>
          {job.ideaTitle && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>{job.ideaTitle}</div>}
          {job.creditsCharged != null && <div style={{ fontSize: 11.5, color: '#a78bfa' }}>{job.creditsCharged} {tt.cost}</div>}
          <button onClick={() => onNavigate?.('dashboard')}
            style={{ marginTop: 4, fontSize: 11.5, color: '#a78bfa', background: 'rgba(124,106,247,0.1)', border: '1px solid rgba(124,106,247,0.25)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, width: 'fit-content' }}>
            <LayoutGrid size={12} /> {tt.goReview}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: 240, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(124,106,247,0.18), rgba(0,0,0,0.6))', border: '1px solid rgba(124,106,247,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="spinning" style={{ display: 'inline-block', fontSize: 18 }}>◐</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff' }}><Clapperboard size={14} strokeWidth={2} /> {tt.generating}</span>
      </div>
      {job.ideaTitle && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>{job.ideaTitle}</div>}
    </div>
  );
}

// ✅ NEW (طلب العميل: "العميل يراجع الفيديو الأول وبعد كده يوافق على النشر او لا... زر تمت
// المراجعة وبعد كده زر نشر الان"): كارت المراجعة/النشر الحقيقي — بيعيش في مشروع القناة
// الدائم (مش في المحادثة اللي طلب فيها العميل الفيديو)، وبيظهر سواء العميل فتح المشروع من
// الداشبورد أو من لينك المشروع في الإيميل. فيديو حقيقي قابل للعب + زرارين حقيقيين: "تمت
// المراجعة" (تأكيد بس، من غير نشر) و"نشر الآن" (رفع فعلي على يوتيوب). كل تحديث بيتحفظ في
// نفس مشروع المحادثة (onUpdateJob) عشان لو العميل قفل وفتح المشروع تاني يلاقي الحالة الصح
function ChannelReviewCard({ job, lang, onUpdateJob, onMessage }) {
  const ar = lang === 'ar';
  const tt = ar
    ? { cost: 'كريديت', reviewedBadge: 'تمت المراجعة', publishedBadge: 'منشور على يوتيوب', reviewBtn: 'تمت المراجعة', publishBtn: 'نشر الآن', notConnected: 'القناة مش متربطة بيوتيوب', watchYoutube: 'شوفه على يوتيوب',
        pkgTitle: 'جاهز للرفع على قناتك', titleL: 'العنوان', descL: 'الوصف', tagsL: 'الكلمات المفتاحية', thumbL: 'الصورة المصغرة', copy: 'نسخ', copied: 'اتنسخ ✓', dlVideo: 'تحميل الفيديو', dlThumb: 'تحميل الصورة',
        aiNote: 'وانت بترفع، اختار "المحتوى ده اتعدّل أو اتولّد بالذكاء الاصطناعي" في يوتيوب.',
        lastTryFailed: 'آخر محاولة للتكملة فشلت:', partialTitleErr: 'الفيديو ده ناقص — مشهد فشل في التوليد', partialHowErr: 'كريديت المشهد اللي فشل اتردّ. دوس "كمّل الفيديو" وهيعيد المحاولة من نفس المشهد بنفس الموديلات والترتيب.',
        partialTitle: 'الفيديو ده ناقص — الكريديت خلص قبل ما يكتمل', partialDone: (d, t) => `اتعمل ${d} مشهد من ${t}. ده الفيديو المنتج لحد دلوقتي.`,
        partialHow: 'عشان تكمّله: اشحن كريديت أو اشترك في خطة أكبر، وبعدين دوس "كمّل الفيديو" — بيكمّل من نفس المشهد بنفس الموديلات والترتيب.',
        partialNeed: (n, b) => `محتاج حوالي ${n} كريديت${b != null ? ` (رصيدك ${b})` : ''}.`, continueBtn: 'كمّل الفيديو', resuming: 'بيكمّل الفيديو دلوقتي... هيتحدّث هنا أول ما يخلص.' }
    : { cost: 'credits', reviewedBadge: 'Reviewed', publishedBadge: 'Published on YouTube', reviewBtn: 'Mark Reviewed', publishBtn: 'Publish Now', notConnected: 'This channel is not connected to YouTube', watchYoutube: 'Watch on YouTube',
        pkgTitle: 'Ready to upload to your channel', titleL: 'Title', descL: 'Description', tagsL: 'Tags', thumbL: 'Thumbnail', copy: 'Copy', copied: 'Copied ✓', dlVideo: 'Download video', dlThumb: 'Download thumbnail',
        aiNote: 'When uploading, turn on "Altered or synthetic content" in YouTube.',
        lastTryFailed: 'The last attempt to continue failed:', partialTitleErr: 'This video is unfinished — a scene failed', partialHowErr: 'The credits for the failed scene were refunded. Press "Continue video" to retry from the same scene, same models and order.',
        partialTitle: 'This video is unfinished — credits ran out', partialDone: (d, t) => `${d} of ${t} scenes were made. This is the video so far.`,
        partialHow: 'To finish it: top up credits or move to a bigger plan, then press "Continue video" — it carries on from the same scene, same models and order.',
        partialNeed: (n, b) => `Needs about ${n} credits${b != null ? ` (your balance ${b})` : ''}.`, continueBtn: 'Continue video', resuming: 'Finishing the video now... this card updates when it is done.' };
  const [busy, setBusy] = useState(null);
  const [pkg, setPkg] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    if (!job.runId) return;
    let alive = true;
    fetch(`/api/channels/runs/${job.runId}/package`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d) setPkg(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [job.runId]);

  const publishEnabled = !!pkg?.publishEnabled;
  const copyText = async (key, text) => {
    try { await navigator.clipboard.writeText(text || ''); setCopiedKey(key); setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 1500); } catch {}
  };
  const tagsText = (pkg?.tags || []).join(', ');
  const isPartial = job.reviewState === 'partial';
  const isResuming = job.reviewState === 'resuming';

  const continueVideo = async () => {
    setBusy('resume');
    try {
      const r = await fetch(`/api/channels/runs/${job.runId}/resume`, { method: 'POST', headers: authHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || d.error || 'Failed');
      onUpdateJob({ reviewState: 'resuming', resumeError: null });
    } catch (e) {
      onMessage?.((ar ? 'مقدرتش أكمّل الفيديو: ' : 'Could not continue the video: ') + e.message);
    } finally { setBusy(null); }
  };

  // بعد ما بدأنا الاستكمال: نتابع الحالة لحد ما يخلص (أو يقف تاني) ونحدّث الكارت
  useEffect(() => {
    if (!isResuming || !job.runId) return undefined;
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`/api/channels/runs/${job.runId}/status`, { headers: authHeaders() });
        const d = (await r.json())?.run;
        if (d && d.reviewState && d.reviewState !== 'resuming') {
          onUpdateJob({ reviewState: d.reviewState, videoUrl: d.videoUrl || job.videoUrl, partial: d.reviewState === 'awaiting_review' ? null : job.partial });
          if (d.reviewState === 'awaiting_review') fetch(`/api/channels/runs/${job.runId}/package`, { headers: authHeaders() }).then(x => (x.ok ? x.json() : null)).then(pk => pk && setPkg(pk)).catch(() => {});
        }
      } catch {}
    }, 8000);
    return () => clearInterval(iv);
  }, [isResuming, job.runId]);

  const markReviewed = async () => {
    setBusy('review');
    try {
      const r = await fetch(`/api/channels/runs/${job.runId}/review`, { method: 'POST', headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed');
      onUpdateJob({ reviewState: 'reviewed' });
      onMessage?.(publishEnabled
        ? (ar ? 'تمام، اتسجل إنك راجعت الفيديو — تقدر تنشره على يوتيوب في أي وقت من هنا.' : "Got it — marked as reviewed. You can publish it to YouTube anytime from here.")
        : (ar ? 'تمام، اتسجل إنك راجعت الفيديو — حمّله وارفعه على قناتك بالعنوان والوصف الجاهزين.' : 'Got it — marked as reviewed. Download it and upload it to your channel with the ready title and description.'));
    } catch (e) {
      onMessage?.((ar ? 'حصلت مشكلة: ' : 'Something went wrong: ') + e.message);
    } finally { setBusy(null); }
  };

  const publishNow = async () => {
    setBusy('publish');
    onMessage?.(ar ? 'تمام، بينشر الفيديو دلوقتي على يوتيوب...' : 'On it — publishing the video to YouTube now...');
    try {
      const r = await fetch(`/api/channels/runs/${job.runId}/publish`, { method: 'POST', headers: authHeaders() });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      onUpdateJob({ reviewState: 'published', youtubeVideoId: d.youtubeVideoId });
      onMessage?.((ar ? 'تم النشر ✅ ' : 'Published ✅ ') + (d.youtubeVideoId ? `https://youtube.com/watch?v=${d.youtubeVideoId}` : ''));
    } catch (e) {
      onMessage?.((ar ? 'فشل النشر: ' : 'Publish failed: ') + e.message);
    } finally { setBusy(null); }
  };

  const smallBtn = { fontSize: 11, padding: '4px 9px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#d1d5db', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' };
  const field = (key, label, text, multiline) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: 0.4 }}>{label}</span>
        <button onClick={() => copyText(key, text)} style={smallBtn}><Copy size={11} /> {copiedKey === key ? tt.copied : tt.copy}</button>
      </div>
      <div style={{ fontSize: 12, color: '#e5e7eb', lineHeight: 1.55, whiteSpace: multiline ? 'pre-wrap' : 'normal', wordBreak: 'break-word', maxHeight: multiline ? 110 : 'none', overflowY: multiline ? 'auto' : 'visible', padding: '6px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>{text}</div>
    </div>
  );

  return (
    <div style={{ width: 280 }}>
      <video src={job.videoUrl} controls playsInline style={{ width: 280, borderRadius: 14, display: 'block', background: '#000', border: '1px solid rgba(255,255,255,0.1)' }} />
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {job.ideaTitle && <div style={{ fontSize: 12.5, color: '#fff', fontWeight: 700 }}>{job.ideaTitle}</div>}
        {job.creditsCharged != null && <div style={{ fontSize: 11.5, color: '#a78bfa' }}>{job.creditsCharged} {tt.cost}</div>}
        {job.videoUrl && (
          <a href={job.videoUrl} download target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, width: 'fit-content' }}><Download size={12} /> {tt.dlVideo}</a>
        )}
        {(isPartial || isResuming) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)' }}>
            <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>{isResuming ? tt.resuming : (job.partial?.reason === 'error' ? tt.partialTitleErr : tt.partialTitle)}</div>
            {!isResuming && (
              <>
                {job.partial && <div style={{ fontSize: 12, color: '#e5e7eb', lineHeight: 1.6 }}>{tt.partialDone(job.partial.scenesDone, job.partial.scenesTotal)} {job.partial.estimatedRemaining ? tt.partialNeed(job.partial.estimatedRemaining, job.partial.balance) : ''}</div>}
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>{job.partial?.reason === 'error' ? tt.partialHowErr : tt.partialHow}</div>
                {job.resumeError && <div style={{ fontSize: 11.5, color: '#fca5a5' }}>{tt.lastTryFailed} {job.resumeError}</div>}
                <button onClick={continueVideo} disabled={!!busy}
                  style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: 'none', background: '#f59e0b', color: '#111', fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', width: 'fit-content', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {busy === 'resume' ? <span className="spinning" style={{ display: 'inline-block' }}>◐</span> : tt.continueBtn}
                </button>
              </>
            )}
            {isResuming && <span className="spinning" style={{ display: 'inline-block', width: 'fit-content' }}>◐</span>}
          </div>
        )}
        {pkg && !publishEnabled && !isPartial && !isResuming && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 12, background: 'rgba(124,106,247,0.07)', border: '1px solid rgba(124,106,247,0.25)' }}>
            <div style={{ fontSize: 12, color: '#c4b5fd', fontWeight: 700 }}>{tt.pkgTitle}</div>
            {pkg.thumbnailUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', fontWeight: 700, letterSpacing: 0.4 }}>{tt.thumbL}</span>
                <img src={pkg.thumbnailUrl} alt="" style={{ width: '100%', borderRadius: 8, display: 'block', border: '1px solid rgba(255,255,255,0.1)' }} />
                <a href={pkg.thumbnailUrl} download target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, width: 'fit-content' }}><Download size={11} /> {tt.dlThumb}</a>
              </div>
            )}
            {pkg.title && field('title', tt.titleL, pkg.title, false)}
            {pkg.description && field('desc', tt.descL, pkg.description, true)}
            {tagsText && field('tags', tt.tagsL, tagsText, false)}
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{tt.aiNote}</div>
          </div>
        )}
        {!isPartial && !isResuming && (<>
        {publishEnabled && job.reviewState === 'published' ? (
          <div style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <CheckCircle2 size={13} /> {tt.publishedBadge}
            {job.youtubeVideoId && (
              <a href={`https://youtube.com/watch?v=${job.youtubeVideoId}`} target="_blank" rel="noopener noreferrer" style={{ color: '#ef4444', textDecoration: 'none' }}>{tt.watchYoutube}</a>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {job.reviewState === 'reviewed' ? (
              <div style={{ fontSize: 11.5, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={12} color="#22c55e" /> {tt.reviewedBadge}</div>
            ) : (
              <button onClick={markReviewed} disabled={!!busy}
                style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#d1d5db', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {busy === 'review' ? <span className="spinning" style={{ display: 'inline-block' }}>◐</span> : tt.reviewBtn}
              </button>
            )}
            {publishEnabled && (
              <button onClick={publishNow} disabled={!!busy || !job.canPublish} title={!job.canPublish ? tt.notConnected : ''}
                style={{ fontSize: 12, padding: '7px 12px', borderRadius: 8, border: 'none', background: job.canPublish ? 'linear-gradient(135deg,#ef4444,#b91c1c)' : 'rgba(239,68,68,0.2)', color: '#fff', cursor: (busy || !job.canPublish) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                {busy === 'publish' ? <span className="spinning" style={{ display: 'inline-block' }}>◐</span> : tt.publishBtn}
              </button>
            )}
          </div>
        )}
        </>)}
      </div>
    </div>
  );
}

// ✅ NEW (Flow-style context menu — طلب العميل: "ضيف موضوع النقط الي كان في flow"): قائمة
// نقط (⋮) عامة تتستخدم فوق أي عنصر ميديا (صورة مفردة جوه دفعة، أو كارت فيديو) — إضافة
// للمفضلة، إعادة استخدام البرومبت، تحريك (صور بس)، تحميل، نسخ البرومبت، إعادة تسمية،
// مشاركة، إبلاغ، ونقل للمهملات. "ضبط غلاف المشروع" مش موجودة هنا — محتاجة تعديل جدول
// المشاريع نفسه (عمود cover_url) ولسه معمولة، فبقت مؤجلة لمرحلة تانية
function MediaActionsMenu({ lang, isFavorited, onToggleFavorite, onReusePrompt, onAnimate, onDownload, onCopyPrompt, onRename, onShare, onReport, onTrash, onToast }) {
  const [open, setOpen] = useState(false);
  const tt = lang === 'ar'
    ? { favorite: 'إضافة إلى المفضّلة', unfavorite: 'إزالة من المفضّلة', reuse: 'إعادة استخدام الطلب', animate: 'تحريك', download: 'تحميل', copy: 'نسخ البرومبت', rename: 'إعادة تسمية', share: 'مشاركة', report: 'الإبلاغ عن الناتج', trash: 'نقل إلى المهملات' }
    : { favorite: 'Add to Favorites', unfavorite: 'Remove from Favorites', reuse: 'Reuse prompt', animate: 'Animate', download: 'Download', copy: 'Copy prompt', rename: 'Rename', share: 'Share', report: 'Report content', trash: 'Move to trash' };
  const item = (icon, label, onClick, danger, toastMsg) => (
    <button onClick={() => { onClick(); if (toastMsg) onToast?.(toastMsg); setOpen(false); }}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 11px', borderRadius: 8, background: 'none', border: 'none', color: danger ? '#f87171' : '#e5e7eb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: lang === 'ar' ? 'right' : 'left' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
      {icon}{label}
    </button>
  );
  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(v => !v)} style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.6)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', padding: 0 }}>
        <MoreVertical size={14} strokeWidth={2.25} />
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div style={{ position: 'absolute', top: 30, insetInlineEnd: 0, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: 6, minWidth: 190, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', zIndex: 70, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {item(<Heart size={14} strokeWidth={2} fill={isFavorited ? 'currentColor' : 'none'} style={{ color: isFavorited ? '#f472b6' : undefined }} />, isFavorited ? tt.unfavorite : tt.favorite, onToggleFavorite)}
            {onReusePrompt && item(<RotateCcw size={14} strokeWidth={2} />, tt.reuse, onReusePrompt)}
            {onAnimate && item(<Film size={14} strokeWidth={2} />, tt.animate, onAnimate)}
            {item(<Download size={14} strokeWidth={2} />, tt.download, onDownload)}
            {onCopyPrompt && item(<Copy size={14} strokeWidth={2} />, tt.copy, onCopyPrompt, false, lang === 'ar' ? 'تم نسخ البرومبت' : 'Prompt copied')}
            {onRename && item(<Pencil size={14} strokeWidth={2} />, tt.rename, onRename)}
            {onShare && item(<Share2 size={14} strokeWidth={2} />, tt.share, onShare, false, lang === 'ar' ? 'تم نسخ الرابط' : 'Link copied')}
            {onReport && item(<Flag size={14} strokeWidth={2} />, tt.report, onReport, false, lang === 'ar' ? 'تم إرسال البلاغ' : 'Report sent')}
            {onTrash && item(<Trash2 size={14} strokeWidth={2} />, tt.trash, onTrash, true)}
          </div>
        </>
      )}
    </div>
  );
}

// ✅ NEW (Phase 3 — new image-generation models): كارت توليد صور مستقل جوه شات الايجنت
// (مش فيديو) — بيعرض شبكة الصور بمجرد ما توليدها يخلص، مفيش poll هنا لأن الطلب نفسه
// بيستنى الرد كامل (backend بيستخدم Prefer: wait + polling داخلي)
function ImageBatchCard({ job, lang, onUpdateJob, onRemoveImage, onReusePrompt, onAnimate, onReport, onOpenDetail, onToast }) {
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
    // ✅ FIX (باج حقيقي: "ليه الصور في المديا صغيرة جدًا" — سكرين شوت العميل): الفيكس القديم
    // فوق حل مشكلة مختلفة (عرض ثابت بالبكسل)، بس سابت مشكلة تانية: عدد الأعمدة (cols) كان
    // ثابت على عدد الصور بس (4 عمود لأي دفعة أكبر من 4)، من غير أي اعتبار لعرض الكارت الفعلي
    // المتاح — دفعة 5-20 صورة (زي طلب "5 مشاهد") كانت بتتقسم دايمًا على 4 أعمدة حتى لو الكارت
    // نفسه ضيق (زي لوحة الميديا/الكانفاس)، فكل صورة كانت بتطلع صغيرة جدًا (~70-90px). الحل:
    // grid متجاوب حقيقي (auto-fill + minmax) بدل عدد أعمدة ثابت — كل صورة تاخد 150px كحد أدنى
    // مضمون، والصفوف تزيد تلقائيًا لو الكارت ضيق بدل ما تتكوم في 4 أعمدة ثابتة
    // ✅ FIX (باج حقيقي: الصورة كانت بتتعرض مربّعة دايمًا بصرف النظر عن النسبة الحقيقية
    // اللي اتولدت بيها — لما العميل يطلب 16:9 مثلاً، الملف المنزّل كان صح بس المعاينة
    // في الشات كانت مقصوصة مربّع، حاجة تلخبط وتوهم إن في مشكلة): بنستخدم نسبة العرض
    // للارتفاع الحقيقية اللي اتطلبت بدل ما نفرض مربع دايمًا
    const cssAspectRatio = (job.aspectRatio || '9:16').replace(':', ' / ');
    return (
      <div style={{ width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {job.images.map((url, i) => {
            const meta = job.imageMeta?.[i] || {};
            const setMeta = (patch) => {
              const imageMeta = [...(job.imageMeta || [])];
              imageMeta[i] = { ...imageMeta[i], ...patch };
              onUpdateJob?.({ imageMeta });
            };
            return (
              <div key={i} style={{ position: 'relative' }}>
                <img src={url} alt="" onClick={() => onOpenDetail?.(i)} style={{ width: '100%', aspectRatio: cssAspectRatio, objectFit: 'cover', borderRadius: 12, background: '#000', border: '1px solid rgba(255,255,255,0.1)', display: 'block', cursor: 'pointer' }} />
                {meta.title && (
                  <div style={{ position: 'absolute', bottom: 6, left: 6, insetInlineEnd: 36, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{meta.title}</div>
                )}
                <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6, display: 'flex', gap: 6 }}>
                  {/* ✅ NEW (طلب العميل: قلب واضح على الصورة مباشرة، مش مدفون جوه منيو الـ⋮) */}
                  <button onClick={() => setMeta({ favorited: !meta.favorited })}
                    title={lang === 'ar' ? (meta.favorited ? 'إزالة من المفضّلة' : 'إضافة إلى المفضّلة') : (meta.favorited ? 'Remove from Favorites' : 'Add to Favorites')}
                    style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.6)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.favorited ? '#f472b6' : '#fff', cursor: 'pointer', padding: 0 }}>
                    <Heart size={14} strokeWidth={2.25} fill={meta.favorited ? 'currentColor' : 'none'} />
                  </button>
                  <MediaActionsMenu
                    lang={lang}
                    isFavorited={!!meta.favorited}
                    onToggleFavorite={() => setMeta({ favorited: !meta.favorited })}
                    onReusePrompt={() => onReusePrompt?.(job.prompts?.[i] || job.prompt)}
                    onAnimate={() => onAnimate?.(url)}
                    onDownload={() => downloadRemoteFile(url, `erivion-image-${i + 1}.jpg`)}
                    onCopyPrompt={() => navigator.clipboard?.writeText(job.prompts?.[i] || job.prompt || '')}
                    onRename={() => { const v = window.prompt(lang === 'ar' ? 'اسم الصورة:' : 'Image name:', meta.title || ''); if (v !== null) setMeta({ title: v.trim() || null }); }}
                    onShare={() => navigator.clipboard?.writeText(url)}
                    onReport={() => onReport?.(url, job.prompts?.[i] || job.prompt)}
                    onTrash={() => onRemoveImage?.(i)}
                    onToast={onToast}
                  />
                </div>
              </div>
            );
          })}
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

// ✅ NEW (new standalone video-generation models — Veo/Kling/Seedance/Luma): كارت واحد بيعرض
// فيديو مولّد بموديل مستقل — نفس منطق ImageBatchCard فوق (مفيش poll، الطلب نفسه بيستنى
// الفيديو جاهز لأن backend بيستخدم Prefer: wait + polling داخلي في newVideoModelsService.js)
function VideoModelCard({ job, lang, onUpdateJob, onRemove, onReusePrompt, onReport, onOpenDetail, onToast }) {
  const tt = lang === 'ar'
    ? { generating: 'بيولّد الفيديو...', done: 'تم! تم خصم', credits: 'كريديت', failed: 'حصلت مشكلة أثناء توليد الفيديو' }
    : { generating: 'Generating video...', done: 'Done! Deducted', credits: 'credits', failed: 'Something went wrong generating the video' };

  if (job.status === 'failed') {
    return (
      <div style={{ maxWidth: 280, padding: '12px 16px', borderRadius: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#ef4444' }}><AlertTriangle size={14} strokeWidth={2.25} /> {job.error || tt.failed}</div>
      </div>
    );
  }

  if (job.status === 'done') {
    const cssAspectRatio = (job.aspectRatio || '16:9').replace(':', ' / ');
    return (
      <div style={{ width: '100%', position: 'relative' }}>
        <video src={job.videoUrl} controls style={{ width: '100%', aspectRatio: cssAspectRatio, objectFit: 'cover', borderRadius: 12, background: '#000', border: '1px solid rgba(255,255,255,0.1)', display: 'block' }} />
        {/* ✅ زرار تكبير منفصل عن الفيديو نفسه — عشان مايتعارضش مع أزرار التشغيل الأصلية بتاعته */}
        <button onClick={() => onOpenDetail?.()} title={lang === 'ar' ? 'تكبير' : 'Expand'} style={{ position: 'absolute', top: 6, insetInlineStart: 6, width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.6)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', padding: 0 }}>
          <Maximize2 size={13} strokeWidth={2.25} />
        </button>
        {job.title && (
          <div style={{ position: 'absolute', top: 6, left: 6, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11 }}>{job.title}</div>
        )}
        <div style={{ position: 'absolute', top: 6, insetInlineEnd: 6, display: 'flex', gap: 6 }}>
          {/* ✅ NEW (طلب العميل: قلب واضح على الفيديو مباشرة، مش مدفون جوه منيو الـ⋮) */}
          <button onClick={() => onUpdateJob?.({ favorited: !job.favorited })}
            title={lang === 'ar' ? (job.favorited ? 'إزالة من المفضّلة' : 'إضافة إلى المفضّلة') : (job.favorited ? 'Remove from Favorites' : 'Add to Favorites')}
            style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.6)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: job.favorited ? '#f472b6' : '#fff', cursor: 'pointer', padding: 0 }}>
            <Heart size={14} strokeWidth={2.25} fill={job.favorited ? 'currentColor' : 'none'} />
          </button>
          <MediaActionsMenu
            lang={lang}
            isFavorited={!!job.favorited}
            onToggleFavorite={() => onUpdateJob?.({ favorited: !job.favorited })}
            onReusePrompt={() => onReusePrompt?.(job.prompt)}
            onDownload={() => downloadRemoteFile(job.videoUrl, `erivion-video-${job.model || 'clip'}.mp4`)}
            onCopyPrompt={() => navigator.clipboard?.writeText(job.prompt || '')}
            onRename={() => { const v = window.prompt(lang === 'ar' ? 'اسم الفيديو:' : 'Video name:', job.title || ''); if (v !== null) onUpdateJob?.({ title: v.trim() || null }); }}
            onShare={() => navigator.clipboard?.writeText(job.videoUrl)}
            onReport={() => onReport?.(job.videoUrl, job.prompt)}
            onTrash={() => onRemove?.()}
            onToast={onToast}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#22c55e', fontWeight: 700 }}><CheckCircle2 size={13} strokeWidth={2.25} /> {tt.done} {job.cost || ''} {tt.credits}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: 240, padding: '14px 16px', borderRadius: 14, background: 'linear-gradient(135deg, rgba(124,106,247,0.18), rgba(0,0,0,0.6))', border: '1px solid rgba(124,106,247,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="spinning" style={{ display: 'inline-block', fontSize: 18 }}>◐</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#fff' }}><Film size={14} strokeWidth={2} /> {tt.generating}</span>
      </div>
    </div>
  );
}

// ✅ NEW (طلب العميل: "لازم يقدر يدوس على الصورة/الفيديو ويخش صفحة زي الي في الصورة دي
// ويكتب التغييرات الي هو عايزها"): عرض كبير لصورة/فيديو معين بملء الشاشة — للصور بيدعم تعديل
// حقيقي (image-to-image): بتكتب التغيير المطلوب، وبتتولد نسخة جديدة باستخدام الصورة الحالية
// كمرجع بصري (نفس آلية referenceImageUrls المستخدمة أصلاً للشخصيات)، وبتتضاف كصورة جديدة في
// نفس الدفعة (job.images) — مفيش موديل بيانات جديد، ومفيش رسم منفصل، فقط نفس التوليد العادي
// بسعره الحقيقي. الفيديو مش بيدعم تعديل حاليًا (مفيش موديل video-to-video متوصل)، بس بيتفتح
// بمعاينة كبيرة برضو
function MediaDetailModal({ lang, kind, job, imgIndex, onChangeIndex, editingImage, onClose, onUpdateJob, onRemoveImage, onRemove, onReport, onEditSubmit, onToast }) {
  const tt = lang === 'ar'
    ? { done: 'تم', download: 'تحميل', deleteLabel: 'حذف', share: 'مشاركة', editPlaceholder: 'ما هي التغييرات المطلوبة؟', editHintImage: 'تعديل الصورة بالذكاء الاصطناعي', editHintVideo: 'تعديل الفيديو بالذكاء الاصطناعي' }
    : { done: 'Done', download: 'Download', deleteLabel: 'Delete', share: 'Share', editPlaceholder: 'What changes do you want?', editHintImage: 'AI edit this image', editHintVideo: 'AI edit this video' };
  const isImage = kind === 'imageBatch';
  const isVideo = kind === 'videoModel';
  const canEdit = isImage || isVideo;
  const images = isImage ? (job.images || []) : null;
  const activeIdx = isImage ? Math.min(imgIndex || 0, images.length - 1) : 0;
  const currentUrl = isImage ? images[activeIdx] : job.videoUrl;
  const meta = isImage ? (job.imageMeta?.[activeIdx] || {}) : job;
  const [editText, setEditText] = useState('');

  const setMeta = (patch) => {
    if (isImage) {
      const imageMeta = [...(job.imageMeta || [])];
      imageMeta[activeIdx] = { ...imageMeta[activeIdx], ...patch };
      onUpdateJob?.({ imageMeta });
    } else {
      onUpdateJob?.(patch);
    }
  };

  const submitEdit = () => {
    if (!editText.trim() || editingImage || !canEdit) return;
    onEditSubmit?.(editText.trim(), currentUrl);
    setEditText('');
  };

  const iconBtn = { width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.08)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,5,8,0.96)', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', flexShrink: 0 }}>
        <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 20, background: '#fff', color: '#000', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tt.done}</button>
        <div style={{ flex: 1 }} />
        <button onClick={() => downloadRemoteFile(currentUrl, `erivion-${kind}-${activeIdx + 1}.${isImage ? 'jpg' : 'mp4'}`)} title={tt.download} style={iconBtn}><Download size={16} strokeWidth={2} /></button>
        <button onClick={() => { if (isImage) onRemoveImage?.(activeIdx); else onRemove?.(); onClose(); }} title={tt.deleteLabel} style={iconBtn}><Trash2 size={16} strokeWidth={2} /></button>
        <button onClick={() => { navigator.clipboard?.writeText(currentUrl); onToast?.(lang === 'ar' ? 'تم نسخ الرابط' : 'Link copied'); }} title={tt.share} style={iconBtn}><Share2 size={16} strokeWidth={2} /></button>
        <button onClick={() => setMeta({ favorited: !meta.favorited })} title="Favorite" style={iconBtn}><Heart size={16} strokeWidth={2} fill={meta.favorited ? 'currentColor' : 'none'} color={meta.favorited ? '#f472b6' : '#fff'} /></button>
      </div>

      {isImage && images.length > 1 && (
        <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px', overflowX: 'auto', flexShrink: 0 }}>
          {images.map((url, i) => (
            <img key={i} src={url} alt="" onClick={() => onChangeIndex?.(i)}
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', flexShrink: 0, border: i === activeIdx ? '2px solid var(--accent2)' : '2px solid transparent', opacity: i === activeIdx ? 1 : 0.55 }} />
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px', minHeight: 0 }}>
        {isImage ? (
          <img src={currentUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12 }} />
        ) : (
          <video src={currentUrl} controls autoPlay style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} />
        )}
      </div>

      <div style={{ padding: '16px 20px 22px', flexShrink: 0 }}>
        {(isImage ? (job.prompts?.[activeIdx] || job.prompt) : job.prompt) && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', marginBottom: 12, maxWidth: 640, marginInline: 'auto', textAlign: 'center' }}>{isImage ? (job.prompts?.[activeIdx] || job.prompt) : job.prompt}</div>}
        {canEdit && (
          <div style={{ display: 'flex', gap: 8, maxWidth: 640, marginInline: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 7 }}>
            <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitEdit()}
              placeholder={tt.editPlaceholder} disabled={editingImage} title={isVideo ? tt.editHintVideo : tt.editHintImage}
              style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: 14, padding: '8px 10px', outline: 'none' }} />
            <button onClick={submitEdit} disabled={!editText.trim() || editingImage}
              style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent)', border: 'none', color: '#fff', cursor: editText.trim() && !editingImage ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: editText.trim() && !editingImage ? 1 : 0.5 }}>
              {editingImage ? <span className="spinning" style={{ display: 'inline-block' }}>◐</span> : <Send size={16} strokeWidth={2} />}
            </button>
          </div>
        )}
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
  // ✅ NEW (طلب العميل: الخروج من المشروع لازم يبقى له أنيميشن زي الدخول بالظبط): بنأخر
  // النداء الفعلي لـonNavigate شوية عشان الأنيميشن (workspaceExit في global.css) يظهر
  // فعليًا قبل ما الكومبوننت يتشال من الشاشة تمامًا
  const [leavingWorkspace, setLeavingWorkspace] = useState(false);
  const handleLeaveWorkspace = () => {
    setLeavingWorkspace(true);
    setTimeout(() => onNavigate?.('dashboard'), 220);
  };
  // ✅ NEW: اختيار يدوي (اختياري) لموديل الصورة/الفيديو — فاضل زي ما هو (auto) لحد ما
  // العميل يختار بنفسه، وبيفضل مختار (persistent) لحد ما يغيّره أو يلغيه، زي selectedStyle
  const [imageModelOptions, setImageModelOptions] = useState([]);
  const [videoModelOptions, setVideoModelOptions] = useState([]);
  const [forcedModel, setForcedModel] = useState(null); // { type: 'image'|'video', key, label } | null
  // ✅ NEW: عرض تفاصيل/تعديل صورة أو فيديو بملء الشاشة — { jobUid, kind, imgIndex } | null
  const [detailView, setDetailView] = useState(null);
  const [editingImageJob, setEditingImageJob] = useState(false);
  // ✅ FIX (باج حقيقي: أزرار زي "نسخ البرومبت"/"مشاركة"/"الإبلاغ" كانت بتنفّذ فعليًا بس من
  // غير أي تأكيد مرئي، فالعميل كان حاسس إنها "مش شغالة" رغم إنها بتشتغل فعلاً): توست بسيط
  // بيظهر تأكيد مرئي واضح بعد أي إجراء من قائمة النقط
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  };
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [voiceFile, setVoiceFile] = useState(null);
  const [imageFiles, setImageFiles] = useState([]); // ✅ FIX: كانت صورة واحدة بس (imageFile) — دلوقتي مصفوفة بتقبل لحد صورتين في نفس الرسالة
  const [inputFocused, setInputFocused] = useState(false); // ✅ لعرض توهج الحدود لما الكتابة تكون فاعلة
  const [limits, setLimits] = useState({ MAX_AUDIO_SEC: 120, MAX_AUDIO_MB: 10, MAX_IMAGE_MB: 5 });
  const [lastUploadedPhotos, setLastUploadedPhotos] = useState([]); // ✅ FIX: كانت صورة واحدة بس — دلوقتي مصفوفة بتتراكم لحد صورتين عبر رسائل متتالية (موديل 5)
  const [montageAssets, setMontageAssets] = useState([]); // فيديوهات المونتاج الذكي (بتترفع فورًا للسيرفر): { key, id, name, durationSec, status, progress, error }
  const montageInputRef = useRef(null);
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
  const textareaRef = useRef(null); // ✅ FIX (طلب العميل: "الخانة ضيقة جدًا ومش بتكبر لو نص كبير، عكس باقي المنصات زي flow" — النص كان بينزل تحت جوه صندوق ثابت الارتفاع بدل ما الصندوق نفسه يكبر) — auto-grow حقيقي بارتفاع المحتوى الفعلي
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const abortRef = useRef(null);
  const activeJobRef = useRef(null); // الكارت الحالي اللي بيتولد — للـ Stop

  const started = messages.length > 0;

  useEffect(() => {
    fetch('/api/agent/limits', { headers: tokenHeader() }).then(r => r.json()).then(setLimits).catch(() => {});
    fetch('/api/voice-clone/mine', { headers: tokenHeader() }).then(r => r.json()).then(d => setMyClonedVoice(d.voice || null)).catch(() => {});
    // ✅ NEW (طلب العميل: سهم زي Google Flow لاختيار موديل الصورة/الفيديو يدويًا): قايمة
    // الموديلات الحقيقية بسعرها — بتتحمل مرة واحدة هنا، مش هاردكودد في الفرونت إند
    fetch('/api/images/models', { headers: tokenHeader() }).then(r => r.json()).then(d => setImageModelOptions(d.models || [])).catch(() => {});
    fetch('/api/videos/models', { headers: tokenHeader() }).then(r => r.json()).then(d => setVideoModelOptions(d.models || [])).catch(() => {});
    return () => { clearInterval(pollRef.current); clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // ✅ FIX (باج حقيقي: خانة الكتابة كانت ثابتة الارتفاع، فالنص الطويل كان بينزل ويتقص بدل
  // ما الصندوق يكبر معاه زي flow وباقي المنصات) — بيكبّر الصندوق مع المحتوى الفعلي لحد سقف
  // معقول (160px)، وبعدها بيرجع للـscroll العادي جوه الصندوق نفسه
  const TEXTAREA_MAX_HEIGHT = 160;
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT);
    el.style.height = next + 'px';
    el.style.overflowY = el.scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
  }, [input]);

  // ✅ FIX (باج حقيقي: العميل بيخرج من المشروع ويرجع يلاقي الشات والصور والفيديوهات كلها
  // اختفت): محادثة الايجنت كانت state في الفرونت إند بس، تتمسح لما الكومبوننت يتشال من
  // الشاشة (تنقل لصفحة تانية). دلوقتي بتتحمل من الداتابيز لما مشروع يتفتح، وبتتحفظ
  // (debounced) كل ما تتغيّر — أي جوب لسه شغال (لسه بيولّد) وقت الحفظ بيتحول لحالة "توقف"
  // بدل ما يفضل سبينر واهم بيدور للأبد بعد إعادة التحميل (مفيش آلية استئناف بولينج حقيقية له)
  const messagesHydratedRef = useRef(false);
  const saveDebounceRef = useRef(null);

  // ✅ FIX (باج حقيقي — طلب العميل: "لازم ينفذ طلبات في مشاريع قديمة زي ما بتعمل مواقع
  // زي Flow"): تجميد job لسه بيولّد لحالة "failed" لما المشروع يتقفل مبكر (فوق) كان بيمسح
  // رابط الصورة/الفيديو الحقيقي نهائيًا من الذاكرة، حتى لو التوليد خلص فعلاً بنجاح على
  // السيرفر ثانية بعد كده — فلما العميل يرجع للمشروع القديم ده ويطلب من الايجنت يكمل (مثلاً
  // "اعمليها كمان")، الايجنت بيلاقي نفسه من غير أي رابط صورة حقيقي يقدر يرجع له في المحادثة
  // (extractKnownUrls في الباك إند بيرفض أي رابط الايجنت "يخترعه" مش موجود حرفيًا في
  // التاريخ)، فبيفضل يعتذر بدل ما ينفذ. الحل: أي job اتجمد كده (أو لسه status:'generating'
  // من قبل ما نقفل الصفحة قبل أول حفظ) وليه backendJobId حقيقي محفوظ، بنتأكد من حالته
  // الحقيقية فعليًا عند فتح المشروع (endpoint الـstatus بيفضل شغال لمدة ساعة بعد التوليد)
  // قبل ما نصدق التجميد أو نستسلم — تمامًا زي ما مواقع زي Flow بتكمل شغل على مشاريع قديمة
  const FROZEN_ERROR_MARKERS = ['اتقفل قبل ما يخلص', 'Closed before finishing'];
  const reconcileStaleJobs = async (msgs) => {
    const candidates = [];
    msgs.forEach((m, idx) => {
      const isImg = m.type === 'imageBatch';
      const isVid = m.type === 'videoModel';
      if ((!isImg && !isVid) || !m.job?.backendJobId) return;
      const wasFrozen = m.job.status === 'failed' && typeof m.job.error === 'string' && FROZEN_ERROR_MARKERS.some(marker => m.job.error.includes(marker));
      const stillGenerating = m.job.status === 'generating';
      if (wasFrozen || stillGenerating) candidates.push({ idx, kind: isImg ? 'image' : 'video', jobId: m.job.backendJobId });
    });
    if (!candidates.length) return msgs;
    const results = await Promise.all(candidates.map(async (c) => {
      try {
        const url = c.kind === 'image' ? `/api/images/generate-status/${c.jobId}` : `/api/videos/generate-status/${c.jobId}`;
        const r = await fetch(url, { headers: tokenHeader() });
        if (r.status === 404) return { ...c, sd: { status: 'expired' } };
        const sd = await r.json();
        return { ...c, sd };
      } catch { return { ...c, sd: null }; }
    }));
    const copy = [...msgs];
    for (const r of results) {
      if (!r.sd) continue;
      if (r.sd.status === 'done') {
        copy[r.idx] = { ...copy[r.idx], job: { ...copy[r.idx].job, status: 'done', error: undefined, cost: r.sd.creditCost ?? copy[r.idx].job.cost,
          ...(r.kind === 'image' ? { images: r.sd.images } : { videoUrl: r.sd.videoUrl }) } };
      } else if (r.sd.status === 'processing') {
        // لسه فعلاً شغال على السيرفر — نستأنف الـpolling الحقيقي بدل ما نفتكره خلص أو فشل
        copy[r.idx] = { ...copy[r.idx], job: { ...copy[r.idx].job, status: 'generating', error: undefined } };
        pollGenerationJob(r.kind, r.jobId, lang).then(sd2 => {
          setMessages(mm => {
            const c2 = [...mm];
            const idx2 = c2.findIndex(x => x.job?.backendJobId === r.jobId);
            if (idx2 === -1) return mm;
            c2[idx2] = sd2.status === 'failed'
              ? { ...c2[idx2], job: { ...c2[idx2].job, status: 'failed', error: sd2.error } }
              : { ...c2[idx2], job: { ...c2[idx2].job, status: 'done', cost: sd2.creditCost, ...(r.kind === 'image' ? { images: sd2.images } : { videoUrl: sd2.videoUrl }) } };
            return c2;
          });
        }).catch(() => {});
      } else {
        // فشل حقيقي، أو انتهت مهلة الـstatus (ساعة) — رسالة صريحة بدل التجميد الصامت القديم
        copy[r.idx] = { ...copy[r.idx], job: { ...copy[r.idx].job, status: 'failed', error: r.sd.error || (lang === 'ar' ? 'انتهت مهلة التوليد ده — جرب تاني' : 'This generation expired — please try again') } };
      }
    }
    return copy;
  };

  useEffect(() => {
    messagesHydratedRef.current = false;
    if (!activeProject?.id) { setMessages([]); messagesHydratedRef.current = true; return; }
    fetch(`/api/projects/${activeProject.id}/messages`, { headers: tokenHeader() })
      .then(r => r.json())
      .then(async d => {
        const loaded = Array.isArray(d.messages) ? d.messages : [];
        setMessages(await reconcileStaleJobs(loaded));
      })
      .catch(() => setMessages([]))
      .finally(() => { messagesHydratedRef.current = true; });
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject?.id || !messagesHydratedRef.current) return;
    clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(() => {
      const toSave = messages.map(m => {
        // ✅ الصور المرفوعة (base64) تقيلة ومش محتاجة تتخزن — النص والميديا المتولدة كفاية
        const { imagePreview, imagePreviews, ...rest } = m;
        if (rest.job && ['render', 'imageBatch', 'videoModel'].includes(rest.type)) {
          const nonTerminal = rest.type === 'render'
            ? ['scenes', 'rendering'].includes(rest.job.status)
            : rest.job.status === 'generating';
          if (nonTerminal) {
            const frozenStatus = rest.type === 'render' ? 'stopped' : 'failed';
            return { ...rest, job: { ...rest.job, status: frozenStatus, error: lang === 'ar' ? 'اتقفل قبل ما يخلص — جرب تاني' : 'Closed before finishing — try again' } };
          }
        }
        return rest;
      });
      fetch(`/api/projects/${activeProject.id}/messages`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify({ messages: toSave }),
      }).catch(() => {});
    }, 900);
    return () => clearTimeout(saveDebounceRef.current);
  }, [messages, activeProject?.id, lang]);

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

  // ✅ FIX: رفعناها من 2 لـ6 — طلب العميل: يرفع أكتر من صورة (منتجات/شخصيات مختلفة) في نفس
  // الرسالة عشان كل واحدة تتحرك بالبرومبت الخاص بيها هي (راجع "ANIMATING MULTIPLE UPLOADED
  // PHOTOS" في agentService.js)
  const MAX_MSG_PHOTOS = 6;
  const handleImageFile = (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_MSG_PHOTOS - imageFiles.length);
    if (!files.length) {
      if (e.target.files?.length) setError(t.maxTwoPhotos || `This chat accepts up to ${MAX_MSG_PHOTOS} photos per message.`);
      return;
    }
    setError('');
    for (const file of files) {
      if (file.size > limits.MAX_IMAGE_MB * 1024 * 1024) { setError(t.imageTooBig(limits.MAX_IMAGE_MB)); continue; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImageFiles(prev => prev.length >= MAX_MSG_PHOTOS ? prev : [...prev, ev.target.result]);
        // ✅ لسه لحد صورتين بس هنا تحديدًا — ده مرجع الشخصية القديم لموديل 5 بالذات (بيدعم
        // شخص واحد أو اتنين حسب تصميمه الأصلي)، مش كل صور الرسالة العامة (imageFiles فوق،
        // اللي دلوقتي بتقبل لحد 6 للاستخدام الجديد — كل صورة بفيديو تحريك منفصل بالبرومبت بتاعها)
        setLastUploadedPhotos(prev => prev.length >= 2 ? prev : [...prev, ev.target.result]);
      };
      reader.readAsDataURL(file);
    }
  };

  // ✅ NEW: رفع فيديو العميل الخاص لتعديل video-to-video — لازم يتحقق من المدة (أقصى 15
  // ثانية) وحجم الملف قبل ما يتقبل، بنفس أسلوب فحص الصوت (metadata check)
  const MAX_VIDEO_UPLOAD_MB = 50;
  const MAX_VIDEO_UPLOAD_SEC = 60; // سقف نقل الأداء (prunaai_p_video_animate)؛ تعديل الفيديو العادي (/api/video-edit) سقفه الأقصر بيتفحص في السيرفر
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

  // ✅ NEW: رفع عدة فيديوهات للمونتاج الذكي — كل ملف بيترفع لوحده (XHR عشان نسبة التقدّم) والسيرفر بيحلله (وصف + كلام)
  const uploadMontageFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setError('');
    const room = 20 - montageAssets.filter(x => x.kind === 'video').length;
    const baseSeq = Date.now() * 100;
    let vids = 0;
    files.forEach((file, fi) => {
      const isAudio = (file.type || '').startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|opus|flac)$/i.test(file.name);
      const isImage = (file.type || '').startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
      if (!isAudio && !isImage && vids++ >= Math.max(0, room)) return;
      const key = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      if (file.size > 400 * 1024 * 1024) { setError(lang === 'ar' ? `${file.name}: أكبر من 400MB` : `${file.name}: larger than 400MB`); return; }
      setMontageAssets(a => [...a.filter(x => !(isAudio && x.kind === 'audio')), { key, name: file.name, kind: isAudio ? 'audio' : (isImage ? 'image' : 'video'), status: 'uploading', progress: 0 }]);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/agent/montage-upload');
      xhr.setRequestHeader('Authorization', 'Bearer ' + localStorage.getItem('token'));
      xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setMontageAssets(a => a.map(x => (x.key === key ? { ...x, progress: Math.round((ev.loaded / ev.total) * 100) } : x))); };
      xhr.onload = () => {
        let d = {}; try { d = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300 && d.id) setMontageAssets(a => a.map(x => (x.key === key ? { ...x, id: d.id, durationSec: d.durationSec, hasAudio: d.hasAudio, status: 'ready', progress: 100 } : x)));
        else { setMontageAssets(a => a.filter(x => x.key !== key)); setError(d.message || (lang === 'ar' ? 'فشل رفع الفيديو' : 'Video upload failed')); }
      };
      xhr.onerror = () => { setMontageAssets(a => a.filter(x => x.key !== key)); setError(lang === 'ar' ? 'فشل رفع الفيديو' : 'Video upload failed'); };
      const fd = new FormData(); fd.append('seq', String(baseSeq + fi)); fd.append('video', file, file.name);
      xhr.send(fd);
    });
  };
  const removeMontageAsset = (item) => {
    setMontageAssets(a => a.filter(x => x.key !== item.key));
    if (item.id) fetch(`/api/agent/montage-assets/${item.id}`, { method: 'DELETE', headers: tokenHeader() }).catch(() => {});
  };

  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // ✅ FIX (باج حقيقي — "الايجنت غبي"): رسايل الميديا (render/whiteboard/imageBatch) مالهاش
  // "content" نصي خالص — كانت بتوصل للـ history اللي بيتبعت للأجنت كـ undefined، يعني الأجنت
  // فعليًا كان بينسى إن أي فيديو أو صورة اتولدت أصلاً. أي طلب متابعة زي "حرك الصورة اللي عملناها"
  // كان مفيش قدامه أي دليل إن صورة اتعملت، فكان بيبدأ فيديو جديد من الصفر بدل ما يحرك الصورة الحقيقية.
  // الدالة دي بتبني وصف نصي حقيقي بديل لأي رسالة ميديا (يشمل روابط الصور لو اتولدت) عشان الـ
  // history يبقى فيه ذاكرة حقيقية لكل حاجة اتولدت في المحادثة دي
  // ✅ FIX (باج حقيقي: العميل رجع لنفس المشروع بعد ما فيديو فشل وحاول يطلب من الايجنت يعمله
  // تاني — الايجنت كان بيرفض/بيتجاهل الطلب وكأن فيه توليد شغال بالفعل): كل أنواع الجوب هنا
  // كانت بترجع "قيد التوليد/قيد الإنشاء" لأي status غير 'done' — يعني حتى لو الجوب فشل
  // فعليًا (status:'failed') أو اتقفل قبل ما يخلص، الايجنت كان شايف نفس النص الموحي إن
  // التوليد "لسه شغال" في كل رسالة جايه بعد كده، فيرفض يبدأ توليد جديد لنفس الطلب حتى لو
  // العميل قاله "ابدأ"/"جرب تاني" صراحة. دلوقتي كل نوع بيميّز 'failed' عن 'generating' بوضوح
  const failedNote = (label) => `[${label} — ${lang === 'ar' ? 'مفيش أي نتيجة اتعملت، لو العميل طلب يعيد المحاولة ابدأ توليد جديد فورًا (ماركر جديد)، متقولش إن فيه توليد شغال بالفعل.' : 'nothing was produced — if the customer asks to retry, start a fresh generation immediately (a new marker), never say one is already in progress.'}]`;
  const historyContentFor = (m) => {
    if (m.content) {
      // ✅ NEW: لو الرسالة دي حصل فيها رفع صورة اتخزن ليها رابط دائم (R2)، بنضيف الرابط في
      // نص الرسالة نفسها عشان يفضل قابل للاستشهاد بيه في أي رسالة جاية (مش بس اللحظة دي)
      // ✅ FIX: نفس ترقيم "Photo 1/Photo 2" المستخدم في ملاحظة الباك إند وقت الرفع — عشان
      // يفضل ثابت عبر المحادثة كلها (مش بس أول رسالة) ويسهّل ربط كل صورة بتعليمة التحريك بتاعتها
      // ✅ FIX (باج حقيقي: صورة العميل 16:9 طلعت فيديو 9:16): بنضيف "(aspect ratio: X)" جنب كل
      // صورة — نفس التاج بالظبط المستخدم لصور الايجنت، عشان حاجز الكود القائم (اللي بيقرا
      // النص ده من الـ history) يفرض النسبة الصح هنا كمان، مش بس للصور اللي بيولدها الايجنت
      const ratioTag = (i) => m.uploadedPhotoRatios?.[i] ? ` (aspect ratio: ${m.uploadedPhotoRatios[i]})` : '';
      const uploadNote = Array.isArray(m.uploadedPhotoUrls) && m.uploadedPhotoUrls.length
        ? ` [Uploaded photo URL${m.uploadedPhotoUrls.length > 1 ? 's' : ''}: ${m.uploadedPhotoUrls.length > 1 ? m.uploadedPhotoUrls.map((u, i) => `Photo ${i + 1}: ${u}${ratioTag(i)}`).join(', ') : `${m.uploadedPhotoUrls[0]}${ratioTag(0)}`}]`
        : '';
      return m.content + uploadNote;
    }
    if (m.type === 'render') {
      // ✅ FIX (طلب العميل: "جمع الفيديوهات اللي عملناها في فيديو واحد" — الايجنت مش عارف
      // يعمل ده لفيديوهات الموديلات القديمة 1-8 لأن رابطها مكنش موجود في الـ history خالص،
      // بعكس videoModel اللي بالفعل بيبعت رابطه): بنبعت الرابط الحقيقي هنا كمان
      if (m.job?.status === 'done') {
        return `[${lang === 'ar' ? 'تم إنشاء فيديو بنجاح بموديل' : 'A video was successfully generated with model'} ${m.job.model || ''} — ${lang === 'ar' ? 'رابط الفيديو' : 'video URL'}: ${m.job.videoUrl || ''}]`;
      }
      if (['failed', 'stopped'].includes(m.job?.status)) {
        return failedNote(lang === 'ar' ? 'فيديو سابق فشل في التوليد ولم يكتمل' : 'A previous video generation FAILED and did not complete');
      }
      return `[${lang === 'ar' ? 'فيديو قيد الإنشاء' : 'A video is currently being generated'}]`;
    }
    if (m.type === 'whiteboard') {
      return `[${lang === 'ar' ? 'تم إنشاء فيديو whiteboard' : 'A whiteboard video was generated'}]`;
    }
    if (m.type === 'docSetup') return `[${lang === 'ar' ? (m.started ? 'بطاقة إعدادات الفيلم الوثائقي ظهرت للعميل في الشات وهو ملأها وبدأ الفيلم' : 'بطاقة إعدادات الفيلم الوثائقي ظاهرة للعميل في الشات (بيختار منها المقاس والصوت والمدة والستايل والكابشن والموسيقى بنفسه)') : (m.started ? 'The documentary settings card was shown in the chat and the customer filled it in and started the film' : 'The documentary settings card is shown in the chat (the customer picks ratio, voice, length, style, captions and music there)')}]`;
    if (m.type === 'docJob') return `[${lang === 'ar' ? 'مهمة فيديو (مونتاج/وثائقي) اتبدأت وبتظهر في المحادثة' : 'A video job (montage/documentary) was started and is shown in the chat'}]`;
    if (m.type === 'channelRun') {
      if (m.job?.status === 'done') {
        const costTag = m.job.creditsCharged != null ? `, cost: ${m.job.creditsCharged} credits` : '';
        return `[${lang === 'ar' ? 'تم عمل فيديو القناة بنجاح، جاهز للمراجعة ومعاه حزمة الرفع (العنوان والوصف والكلمات والصورة المصغرة) — العميل هو اللي بيرفعه على يوتيوب' : 'The channel video was successfully made and is ready for the user\'s review with its upload package (title, description, tags, thumbnail) — the user uploads it to YouTube themselves'} — "${m.job.ideaTitle || ''}" — ${lang === 'ar' ? 'رابط الفيديو' : 'video URL'}: ${m.job.videoUrl || ''}${costTag}]`;
      }
      if (m.job?.status === 'failed') {
        return failedNote(lang === 'ar' ? 'فيديو قناة سابق فشل في التوليد ولم يكتمل' : 'A previous channel video FAILED and did not complete');
      }
      return `[${lang === 'ar' ? 'فيديو قناة قيد الإنشاء دلوقتي' : "A channel video is currently being generated"}]`;
    }
    if (m.type === 'channelReview') {
      if (m.job?.reviewState === 'published') {
        return `[${lang === 'ar' ? 'العميل وافق ونشر فيديو القناة على يوتيوب' : 'The user approved and published this channel video to YouTube'} — "${m.job.ideaTitle || ''}"${m.job.youtubeVideoId ? `, https://youtube.com/watch?v=${m.job.youtubeVideoId}` : ''}]`;
      }
      if (m.job?.reviewState === 'reviewed') {
        return `[${lang === 'ar' ? 'العميل راجع فيديو القناة ده بس لسه ما نشرهوش' : 'The user reviewed this channel video but has not published it yet'} — "${m.job.ideaTitle || ''}"]`;
      }
      return `[${lang === 'ar' ? 'فيديو قناة جاهز ومستني مراجعة العميل قبل النشر' : "A channel video is ready and awaiting the user's review before publishing"} — "${m.job.ideaTitle || ''}"]`;
    }
    if (m.type === 'imageBatch') {
      if (m.job?.status === 'done') {
        // ✅ FIX (باج حقيقي: صورة اتعملت 16:9، والعميل قال "حرّك الصورة دي" من غير ما يكرر
        // النسبة، فالفيديو الناتج طلع 9:16 — لأن الايجنت مالوش أي طريقة يعرف بيها نسبة الصورة
        // الأصلية أصلاً، مكانتش موجودة في الـ note ده خالص، فكان بيخمّن نسبة افتراضية بتاعته
        // هو مش نسبة الصورة الحقيقية): بنضيف النسبة الحقيقية هنا عشان "حرّك الصورة دي" يبقى
        // افتراضيًا بنفس نسبة الصورة نفسها إلا لو العميل طلب نسبة مختلفة صراحة
        const ratioTag = m.job.aspectRatio ? ` (aspect ratio: ${m.job.aspectRatio})` : '';
        // ✅ NEW: لو كانت دفعة مشاهد مختلفة (job.prompts)، بنسيب كل صورة مربوطة بالبرومبت
        // بتاعها في نفس النص — ده اللي بيخلي الايجنت يقدر يفرق "صورة السيف" عن "صورة القلعة"
        // لما العميل يطلب يحرك واحدة بعينها لاحقًا
        if (Array.isArray(m.job.prompts) && m.job.prompts.length >= 2) {
          const pairs = (m.job.images || []).map((u, i) => `"${m.job.prompts[i] || ''}" → ${u}`).join(' | ');
          return lang === 'ar'
            ? `[تم توليد ${m.job.images?.length || 0} صورة مشاهد مختلفة بنجاح بموديل ${m.job.model || ''}${ratioTag} — كل مشهد وصورته: ${pairs}]`
            : `[Successfully generated ${m.job.images?.length || 0} distinct-scene image(s) with model ${m.job.model || ''}${ratioTag} — each scene and its image: ${pairs}]`;
        }
        const urls = (m.job.images || []).join(', ');
        return lang === 'ar'
          ? `[تم توليد ${m.job.images?.length || 0} صورة بنجاح بموديل ${m.job.model || ''}${ratioTag} — روابط الصور: ${urls}]`
          : `[Successfully generated ${m.job.images?.length || 0} image(s) with model ${m.job.model || ''}${ratioTag} — image URLs: ${urls}]`;
      }
      if (m.job?.status === 'failed') {
        return failedNote(lang === 'ar' ? 'دفعة صور سابقة فشلت في التوليد ولم تكتمل' : 'A previous image batch FAILED and did not complete');
      }
      return `[${lang === 'ar' ? 'صور قيد التوليد' : 'Image(s) are currently being generated'}]`;
    }
    if (m.type === 'videoModel') {
      if (m.job?.status === 'done') {
        const ratioTag = m.job.aspectRatio ? ` (aspect ratio: ${m.job.aspectRatio})` : '';
        return `[${lang === 'ar' ? 'تم توليد فيديو بنجاح بموديل' : 'A video was successfully generated with model'} ${m.job.model || ''}${ratioTag} — ${lang === 'ar' ? 'رابط الفيديو' : 'video URL'}: ${m.job.videoUrl || ''}]`;
      }
      if (m.job?.status === 'failed') {
        return failedNote(lang === 'ar' ? 'فيديو سابق فشل في التوليد ولم يكتمل' : 'A previous video generation FAILED and did not complete');
      }
      return `[${lang === 'ar' ? 'فيديو قيد التوليد' : 'A video is currently being generated'}]`;
    }
    if (m.type === 'video') return `[${lang === 'ar' ? 'فيديو مثال' : 'Example video'}]`;
    if (m.type === 'videoAnalysis') {
      if (m.job?.status === 'done') {
        const analysisText = typeof m.job.analysis === 'string' ? m.job.analysis : JSON.stringify(m.job.analysis ?? {});
        // ✅ NEW (طلب العميل: أداة تحليل الفيديو): "media_path" في الرد الحقيقي على الأرجح
        // فيديو تصور مرئي لنتيجة الكشف (مربعات حوالين اللي بيتكلم) — مفيد نديه للعميل كدليل
        // حقيقي مش بس نص، فبنسيبه معروف في الملاحظة عشان الايجنت يقدر يعرضه لو حابب
        const mediaNote = Array.isArray(m.job.mediaUrls) && m.job.mediaUrls.length
          ? ` — ${lang === 'ar' ? 'ملفات ناتجة' : 'output media'}: ${m.job.mediaUrls.join(', ')}`
          : '';
        return `[${lang === 'ar' ? 'نتيجة تحليل الفيديو' : 'Video analysis result'} (${m.job.videoUrl || ''}): ${analysisText.slice(0, 2000)}${mediaNote}]`;
      }
      if (m.job?.status === 'failed') {
        return failedNote(lang === 'ar' ? 'تحليل فيديو سابق فشل ولم يكتمل' : 'A previous video analysis FAILED and did not complete');
      }
      return `[${lang === 'ar' ? 'جاري تحليل الفيديو' : 'A video is currently being analyzed'}]`;
    }
    return '';
  };

  // ✅ NEW (باج حقيقي خطير — سبب حقيقي لـ"مش قادر أبدأ التوليد" في مشروع طويل الأمد): الـ
  // history المبعوت تحت بيتقطع لآخر 16 رسالة بس. في مشروع طويل، أي صورة/فيديو اتولد قبل كده
  // بكتير ("استخدم الصورة اللي عملناها قبل كده") بيختفي تمامًا من الـ context اللي بيوصل
  // للايجنت، فمش بيلاقي رابط حقيقي يستخدمه (وممنوع يلفّق واحد)، فمابيحطش أي ماركر خالص ويفضل
  // يكرر "هبدأ دلوقتي" من غير ما يعمل حاجة. بنبني هنا دفتر مختصر بكل صورة/فيديو اتولد في
  // المشروع من الأول للآخر (مش بس آخر 16 رسالة) ونبعته منفصل تمامًا عن نافذة الـ history
  const buildMediaLedger = (allMsgs) => {
    const lines = [];
    let imgIdx = 0, vidIdx = 0;
    for (const m of allMsgs) {
      if (m.role === 'user' && Array.isArray(m.uploadedPhotoUrls) && m.uploadedPhotoUrls.length) {
        // ✅ FIX: باج حقيقي — العميل ميّز صراحة بين صورتين مرفوعتين ("استخدم الي فيها المنتج
        // بلغة عربي") والايجنت استخدم التانية غلط، لأن الدفتر كان بس بيسرد الرابط من غير أي
        // وصف يميّزه. بنضيف نص رسالة العميل نفسها (اللي غالبًا بتوصف الصورة) كسياق مميّز
        const descNote = m.content ? ` — customer's own words when uploading: "${m.content.slice(0, 150)}"` : '';
        const ratioTag = (i) => m.uploadedPhotoRatios?.[i] ? ` (aspect ratio: ${m.uploadedPhotoRatios[i]})` : '';
        const indexedUrls = m.uploadedPhotoUrls.length > 1
          ? m.uploadedPhotoUrls.map((u, i) => `Photo ${i + 1}: ${u}${ratioTag(i)}`).join(', ')
          : `${m.uploadedPhotoUrls[0]}${ratioTag(0)}`;
        lines.push(`[UPLOADED photo by customer, real physical product/character — not AI-generated${descNote}] ${indexedUrls}`);
      } else if (m.type === 'imageBatch' && m.job?.status === 'done' && m.job.images?.length) {
        imgIdx++;
        const ratioTag = m.job.aspectRatio ? ` ratio=${m.job.aspectRatio}` : '';
        if (Array.isArray(m.job.prompts) && m.job.prompts.length >= 2) {
          const pairs = m.job.images.map((u, i) => `"${(m.job.prompts[i] || '').slice(0, 80)}"->${u}`).join(' | ');
          lines.push(`[IMG#${imgIdx} model=${m.job.model || ''}${ratioTag}] ${pairs}`);
        } else {
          // ✅ FIX: نفس الفكرة — وضع "prompt" الحقيقي هنا كمان (كان مفقود في وضع النسخ
          // المتطابقة) عشان لو اتعمل أكتر من دفعة منفصلة بنفس الموديل، الايجنت يقدر يميّز
          // بينهم لاحقًا بدل ما يشوف روابط عارية من غير أي وصف خالص
          const promptTag = m.job.prompt ? ` prompt="${m.job.prompt.slice(0, 100)}"` : '';
          lines.push(`[IMG#${imgIdx} model=${m.job.model || ''}${ratioTag}${promptTag}] ${m.job.images.join(', ')}`);
        }
      } else if (m.type === 'videoModel' && m.job?.status === 'done' && m.job.videoUrl) {
        vidIdx++;
        const ratioTag = m.job.aspectRatio ? ` ratio=${m.job.aspectRatio}` : '';
        lines.push(`[VID#${vidIdx} model=${m.job.model || ''}${ratioTag}] ${m.job.videoUrl}`);
      } else if (m.type === 'render' && m.job?.status === 'done' && m.job.videoUrl) {
        vidIdx++;
        lines.push(`[VID#${vidIdx} model=${m.job.model || ''}] ${m.job.videoUrl}`);
      }
    }
    if (!lines.length) return undefined;
    const MAX_LEDGER_CHARS = 8000;
    // لو الدفتر كله كبير جدًا (مشروع فيه عشرات الدفعات)، بنفضّل نسيب الأحدث (الأقرب لطلب
    // العميل الحالي غالبًا) بدل ما نقطع أي رابط نص نص
    while (lines.join('\n').length > MAX_LEDGER_CHARS && lines.length > 1) lines.shift();
    return lines.join('\n');
  };

  // رفع ملف واحد كأصل مونتاج (فيديو/صورة ستايل) بـfetch عادي ويرجّع بيانات الأصل — للحالة اللي العميل بيرفع فيها الفيديو بزرار "رفع فيديو" العادي ويطلب مونتاج
  const registerMontageAsset = async (blob, name, seq) => {
    const fd = new FormData(); fd.append('seq', String(seq)); fd.append('video', blob, name);
    const r = await fetch('/api/agent/montage-upload', { method: 'POST', headers: tokenHeader(), body: fd });
    let d = {}; try { d = await r.json(); } catch { /* ignore */ }
    if (!r.ok || !d.id) throw new Error(d.message || d.error || 'upload failed');
    return { key: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, id: d.id, name, durationSec: d.durationSec, hasAudio: d.hasAudio, status: 'ready', progress: 100 };
  };
  // data: URL → Blob من غير fetch (الـCSP بتاعة الموقع بتمنع fetch لـdata:)
  const dataUrlToBlob = (u) => { const m = /^data:([^;]+);base64,(.*)$/.exec(String(u)); if (!m) throw new Error('bad image'); const bin = atob(m[2]); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: m[1] }); };
  const MONTAGE_INTENT = /مونتاج|montage|موشن|motion ?graphic|جرافيك|انتقالات|transitions?|كابشن|captions?/i;

  const sendMessage = async (overrideText) => {
    const textToSend = overrideText !== undefined ? overrideText : input;
    let readyMontage = montageAssets.filter(x => x.status === 'ready' && x.id);
    if (montageAssets.some(x => x.status === 'uploading')) { setError(lang === 'ar' ? 'استنى لحد ما الفيديوهات تخلص رفع' : 'Wait until the videos finish uploading'); return; }
    if (!textToSend.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile && !readyMontage.length) return;
    if (loading || activeJobRef.current) return; // ✅ FIX: منع إرسال رسالة تانية لحد ما الحالية تخلص، عشان محدش يبعت "ابدأ" مرتين ويعمل تضارب رندر
    setError('');
    // العميل رفع الفيديو بزرار "رفع فيديو" العادي (مش زرار المونتاج) وطلب مونتاج/موشن جرافيكس: بنسجّل الفيديو (والصور المرفقة كمراجع ستايل) كأصول مونتاج
    // قبل الإرسال، عشان الايجنت يشوفها ويحلّلها ويقدر يبدأ المونتاج بدل ما يلف في أسئلة
    let styleRegistered = false, videoRegistered = false;
    if (uploadedVideoFile && MONTAGE_INTENT.test(textToSend) && !readyMontage.some(x => x.name === (uploadedVideoFile.name || 'video.mp4'))) {
      setLoading(true);
      try {
        const base = Date.now() * 100;
        const added = [await registerMontageAsset(uploadedVideoFile, uploadedVideoFile.name || 'video.mp4', base)];
        videoRegistered = true;
        if (imageFiles.length) {
          for (let i = 0; i < Math.min(4, imageFiles.length); i++) {
            try { added.push(await registerMontageAsset(dataUrlToBlob(imageFiles[i]), `style_${i + 1}.png`, base + 1 + i)); styleRegistered = true; } catch { /* صورة فاشلة: بتتبعت كصورة عادية */ }
          }
        }
        setMontageAssets(a => [...a, ...added.map(x => ({ ...x, kind: /^style_/.test(x.name) ? 'image' : 'video' }))]);
        readyMontage = [...readyMontage, ...added];
      } catch (e) {
        setLoading(false);
        setError(lang === 'ar' ? 'مقدرتش أرفع الفيديو للمونتاج — جرب تاني أو استخدم زرار "رفع فيديوهات للمونتاج".' : 'Could not upload the video for the montage — try again or use the "Upload videos for montage" button.');
        return;
      }
    }
    const attachmentLabel = voiceFile
      ? (lang === 'ar' ? 'رسالة صوتية' : 'Voice message')
      : imageFiles.length
      ? (lang === 'ar' ? (imageFiles.length > 1 ? 'صور مرفوعة' : 'صورة مرفوعة') : (imageFiles.length > 1 ? 'Uploaded photos' : 'Uploaded photo'))
      : uploadedVideoFile
      ? (lang === 'ar' ? 'فيديو مرفوع للتعديل' : 'Uploaded video to edit')
      : '';
    // ✅ NEW: uid ثابت للرسالة دي — لازم عشان نقدر نلحقها بعدين برابط R2 الدائم لأي صورة
    // اترفعت فيها (uploadedPhotoUrls من رد السيرفر)، حتى لو المستخدم بعت رسايل تانية قبل ما الرد يرجع
    const msgUid = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const userMsg = { role: 'user', content: textToSend.trim() || attachmentLabel, hasVoice: !!voiceFile, imagePreview: imageFiles[0], imagePreviews: imageFiles, uid: msgUid, montageItems: readyMontage.length ? readyMontage.map(x => ({ name: x.name, kind: x.kind || (/^style_/.test(x.name || '') ? 'image' : 'video'), durationSec: x.durationSec })) : undefined };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    const currentVoice = voiceFile, currentImages = styleRegistered ? [] : imageFiles; // صور الستايل اتسجّلت كمراجع مونتاج — مش بتتبعت كصور عادية كمان
    setInput(''); setVoiceFile(null); setImageFiles([]);
    if (readyMontage.length) setMontageAssets([]); // الفيديوهات اتبعتت جوه الرسالة (بتظهر في الشات) — السيرفر محتفظ بيها 3 ساعات والايجنت بيشوفها في كل رسالة
    if (videoRegistered) { setUploadedVideoFile(null); setUploadedVideoDurationSec(null); setVideoSentOnce(false); }
    else if (uploadedVideoFile) setVideoSentOnce(true);
    setLoading(true);

    try {
      const body = {
        message: textToSend.trim() || (readyMontage.length ? (lang === 'ar' ? 'رفعت فيديوهات وعايز أعملها مونتاج' : 'I uploaded videos and want a montage') : (lang === 'ar' ? 'من الصوت/الصورة المرفوعة' : 'from the attached voice/image')),
        montageAssetIds: readyMontage.length ? readyMontage.map(x => x.id) : undefined,
        // ✅ FIX: كانت -6 (3 تبادلات بس) وده كان بيخلي الايجنت ينسى تفاصيل قديمة في المحادثة — رفعناها لـ 16 لتغطي محادثة كاملة
        history: nextMessages.slice(0, -1).slice(-16).map(m => ({ role: m.role, content: historyContentFor(m) })),
        // ✅ NEW: دفتر كامل بكل صور/فيديوهات المشروع من الأول للآخر — منفصل عن نافذة الـ16
        // رسالة فوق، عشان رابط قديم يفضل متاح للايجنت حتى لو خرج بره الـhistory المرسل
        mediaLedger: buildMediaLedger(nextMessages),
        // ✅ FIX: نفضل نفكّر الباك إند إن صورة/صوت اترفعوا قبل كده في الجلسة دي حتى لو خرجوا بره الـ history،
        // عشان الايجنت مايطلبش رفعهم تاني بعد كام رسالة
        photoAlreadyUploaded: !!lastUploadedPhotos.length,
        voiceAlreadyUploaded: !!lastUploadedVoiceUrl,
        lastVoiceUrl: lastUploadedVoiceUrl || undefined,
        videoAlreadyUploaded: !!uploadedVideoFile && !videoRegistered,
        videoDurationSec: uploadedVideoDurationSec || undefined,
        hasStructuredScript: !!lastParsedStructuredScenes,
        hasAdsScenePlan: !!lastParsedAdsScenePlan,
        styleHint: selectedStyle || undefined,
        forcedImageModel: forcedModel?.type === 'image' ? forcedModel.key : undefined,
        forcedVideoModel: forcedModel?.type === 'video' ? forcedModel.key : undefined,
        hasClonedVoice: !!myClonedVoice,
      };
      if (currentVoice) body.voiceBase64 = await fileToBase64(currentVoice);
      // ✅ FIX: بتبعت مصفوفة صور دلوقتي (لحد 2) بدل صورة واحدة بس — كمان بيبعت imageBase64
      // (أول صورة) للتوافق مع أي كود قديم لسه بيتوقع حقل مفرد
      if (currentImages.length) { body.imagesBase64 = currentImages; body.imageBase64 = currentImages[0]; }

      abortRef.current = new AbortController();
      const res = await fetch('/api/agent/chat', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body), signal: abortRef.current.signal });
      // ✅ FIX (باج حقيقي: العميل شاف "Unexpected token '<', "<!DOCTYPE "... is not valid
      // JSON" خام في الشات): الشات نفسه (بعكس توليد الصور/الفيديوهات) كان بيستخدم res.json()
      // خام من غير الحماية اللي باقي المسارات بتستخدمها — لو بروكسي/gateway قطع اتصال طويل
      // ورجّع صفحة HTML بدل JSON (احتمال زاد بعد إضافة محاولات إعادة تلقائية للايجنت لما مبيبعتش
      // ماركر)، كان الخطأ الخام بيوصل للعميل زي ما هو بدل رسالة مفهومة
      const data = await safeJson(res, lang);
      if (!res.ok) throw new Error(data.error || 'Failed');
      // ✅ NEW (طلب العميل: زرار سريع "ابدأ/لأ" بدل الكتابة اليدوية كل مرة): لو الرد سؤال
      // تأكيد قبل التوليد، بنعلّم الرسالة عشان نعرض أزرار سريعة تحتها
      setMessages(m => [...m, { role: 'assistant', content: data.reply, awaitingConfirmation: !!data.awaitingConfirmation }]);
      if (data.uploadedVoiceUrl) setLastUploadedVoiceUrl(data.uploadedVoiceUrl);
      // ✅ NEW: بنحفظ الرابط الدائم (R2) لأي صورة اترفعت في الرسالة دي جوه الرسالة نفسها —
      // كده تفضل قابلة للاستشهاد بيها في history/mediaLedger في أي رسالة جاية، مش بس دلوقتي
      if (Array.isArray(data.uploadedPhotoUrls) && data.uploadedPhotoUrls.length) {
        setMessages(m => m.map(x => x.uid === msgUid ? { ...x, uploadedPhotoUrls: data.uploadedPhotoUrls, uploadedPhotoRatios: data.uploadedPhotoRatios } : x));
      }
      if (data.transcript) setLastUploadedTranscript(data.transcript);
      if (Array.isArray(data.structuredScenes) && data.structuredScenes.length) setLastParsedStructuredScenes(data.structuredScenes);
      if (data.adsScenePlan?.scenes?.length) setLastParsedAdsScenePlan(data.adsScenePlan);

      // ✅ NEW: الايجنت قرر يفتح شاشة الدفع (مصري أو دولي) بعد ما العميل حدد الباقة اللي عايزها
      if (data.subscribe?.region === 'eg') {
        const pkg = EG_PACKAGES.find(p => p.key === data.subscribe.packageKey) || EG_PACKAGES[0];
        setSubscribeModal({ type: 'eg', credits: pkg.credits, amountEgp: egPrice(pkg.credits, getPromo()) });
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
      } else if (data.generateVideo) {
        startVideoModelGeneration(data.generateVideo);
      } else if (data.mergeVideos) {
        startVideoMerge(data.mergeVideos);
      } else if (data.analyzeVideo) {
        startVideoAnalysis(data.analyzeVideo);
      }

      // ✅ NEW (طلب العميل: "اربط ده بالايجنت... يظهر في شات الايجنت كمّل الفيديو"): فيديو
      // whiteboard مجاني اتعمل من صوت اتصوّر في نفس الرسالة — بيظهر كارت منفصل بيعمل poll
      // لحالته، وبعد ما يخلص بيظهر زرار "كمّل الفيديو" بيودّي لصفحة Whiteboard العامة
      if (data.whiteboardVideo?.job) {
        setMessages(m => [...m, { role: 'assistant', type: 'whiteboard', job: data.whiteboardVideo.job }]);
      }

      // ✅ NEW (طلب العميل: "اقدر اقول للايجنت اعمل فيديو وانشره على القناة دلوقتي"): بنفس
      // فكرة كارت الـwhiteboard فوق بالظبط — بيعمل poll لحالة تشغيلة القناة الحقيقية اللي
      // بدأت في الخلفية (channelSchedulerService.js's triggerChannelRunNow) لحد ما تخلص
      if (data.docSetup) setMessages(m => [...m, { role: 'assistant', type: 'docSetup', setup: data.docSetup, started: false }]);
      if (data.docJob?.jobId) {
        setMessages(m => [...m, { role: 'assistant', type: 'docJob', job: data.docJob }]);
        setMontageAssets([]); // الفيديوهات اتستهلكت في المهمة
      }
      if (data.channelGenerate?.runId) {
        setMessages(m => [...m, { role: 'assistant', type: 'channelRun', job: { ...data.channelGenerate, status: 'generating' } }]);
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

  // ✅ NEW (Flow-style context menu — طلب العميل: "ضيف موضوع النقط الي كان في flow"): دوال
  // عامة تستخدمها MediaActionsMenu من أي كارت ميديا (صورة/فيديو) — بتحدّث/تمسح الرسالة في
  // نفس الـ messages state اللي بيتحفظ فعليًا في المشروع (نفس آلية الحفظ الموجودة بالفعل)
  const updateJobByUid = (uid, patch) => {
    setMessages(m => {
      const copy = [...m];
      const idx = copy.findIndex(x => x.job?.uid === uid);
      if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
      return copy;
    });
  };
  const removeMessageByJobUid = (uid) => {
    setMessages(m => m.filter(x => x.job?.uid !== uid));
  };
  // ✅ NEW: نفس فكرة updateJobByUid فوق بالظبط، بس مفتاحها runId (daily_video_runs) مش uid —
  // مستخدمة لكارت مراجعة/نشر فيديو القناة (ChannelReviewCard) عشان ضغطة "تمت المراجعة"/"نشر
  // الآن" تتحفظ فعليًا في المشروع (نفس آلية الحفظ الموجودة بالفعل لأي رسالة تانية)
  const updateJobByRunId = (runId, patch) => {
    setMessages(m => {
      const copy = [...m];
      const idx = copy.findIndex(x => x.job?.runId === runId);
      if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
      return copy;
    });
  };
  // ✅ صورة واحدة جوه دفعة (batch) — لو دي آخر صورة في الدفعة، نمسح الرسالة كلها بدل ما نسيبها فاضية
  const removeImageFromBatch = (uid, idx) => {
    setMessages(m => {
      const copy = [...m];
      const i = copy.findIndex(x => x.job?.uid === uid);
      if (i === -1) return m;
      const images = (copy[i].job.images || []).filter((_, ii) => ii !== idx);
      const imageMeta = (copy[i].job.imageMeta || []).filter((_, ii) => ii !== idx);
      if (!images.length) return copy.filter((_, ii) => ii !== i);
      copy[i] = { ...copy[i], job: { ...copy[i].job, images, imageMeta } };
      return copy;
    });
  };
  const reusePromptIntoComposer = (promptText) => {
    if (promptText) setInput(promptText);
  };
  // ✅ "تحريك الصورة" من قائمة النقط — بيعيد استخدام بالظبط نفس مسار "صورة مرفوعة" العادي
  // (يحوّل الرابط لـ base64 ويحطه في imageFiles، والايجنت بيقرر موديل 5 image-to-video تلقائيًا
  // لأنه شايف صورة مرفقة) بدل ما نكرر منطق التوليد بتاع موديل 5 من الصفر هنا
  const attachImageUrlToComposer = async (url) => {
    try {
      const blob = await fetchRemoteBlob(url);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      setImageFiles(prev => (prev.length >= MAX_MSG_PHOTOS ? prev : [...prev, base64]));
      setLastUploadedPhotos(prev => (prev.length >= 2 ? prev : [...prev, base64]));
      return true;
    } catch (e) {
      console.warn('[Agent] Failed to attach image for reuse:', e.message);
      return false;
    }
  };
  const animateImageFromMenu = async (url) => {
    const ok = await attachImageUrlToComposer(url);
    if (ok) { setInput(lang === 'ar' ? 'حرك الصورة دي' : 'Animate this image'); setTimeout(() => sendMessage(lang === 'ar' ? 'حرك الصورة دي' : 'Animate this image'), 50); }
  };
  const reportMedia = (mediaUrl, prompt) => {
    fetch('/api/agent/report-content', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ mediaUrl, prompt, reason: 'user_reported' }) }).catch(() => {});
  };

  // ✅ NEW (media detail view — image editing): بتولّد صورة جديدة باستخدام الصورة الحالية
  // كمرجع بصري + التعديل المطلوب كبرومبت، وبتضيفها في نفس دفعة الصور (job.images) — نفس
  // مسار /api/images/generate العادي بسعره وخصمه الحقيقي، مفيش موديل بيانات جديد
  // ✅ NEW (باج حقيقي: العميل كتب تعليمة التعديل بالعربي، وبقت التعليمة دي حرفيًا (عربي خام)
  // هي الـprompt اللي اتبعت لـReplicate — المربع ده مالوش أي علاقة بالايجنت، فمكانش فيه أي
  // ترجمة/تحسين زي أي برومبت تاني بيكتبه الايجنت. بننادي نقطة النهاية الخفيفة دي أولاً عشان
  // نترجم/نحسّن التعليمة للإنجليزي قبل ما نبعتها فعليًا — لو فشلت الترجمة لأي سبب، نستخدم
  // النص الخام زي ما هو بدل ما نوقف التعديل كله
  const refineEditPrompt = async (rawText) => {
    try {
      const res = await fetch('/api/agent/refine-edit-prompt', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ text: rawText }) });
      const data = await safeJson(res, lang);
      return data.refined || rawText;
    } catch {
      return rawText;
    }
  };

  const submitImageEdit = async (editPromptRaw, referenceUrl) => {
    if (!detailView || detailView.kind !== 'imageBatch' || editingImageJob) return;
    const msg = messages.find(m => m.job?.uid === detailView.jobUid);
    if (!msg) return;
    setEditingImageJob(true);
    try {
      const editPrompt = await refineEditPrompt(editPromptRaw);
      const res = await fetch('/api/images/generate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          model: 'nano_banana_pro', prompt: editPrompt, aspectRatio: msg.job.aspectRatio || '9:16',
          count: 1, tier: '2K', referenceImageUrls: [referenceUrl],
        }),
      });
      const data = await safeJson(res, lang);
      if (!res.ok) { setError(data.message || data.error || 'Failed'); return; }
      const sd = await pollGenerationJob('image', data.jobId, lang);
      if (sd.status === 'failed') { setError(sd.error || 'Failed'); return; }
      let newIdx = 0;
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.job?.uid === detailView.jobUid);
        if (idx !== -1) {
          const images = [...(copy[idx].job.images || []), ...sd.images];
          newIdx = images.length - 1;
          copy[idx] = { ...copy[idx], job: { ...copy[idx].job, images } };
        }
        return copy;
      });
      setDetailView(v => (v ? { ...v, imgIndex: newIdx } : v));
    } catch (e) {
      setError(e.message);
    } finally {
      setEditingImageJob(false);
    }
  };

  // ✅ NEW (Gemini Omni 1.1 Flash — أول موديل video-to-video حقيقي عندنا): تعديل فيديو موجود
  // مباشرة من نافذة التفاصيل، بنفس فكرة تعديل الصور فوق — بيستبدل رابط الفيديو في نفس الـ
  // job (مفيش "تاريخ نسخ" للفيديو زي الصور، النسخة الجديدة بس هي اللي بتفضل)
  const submitVideoEdit = async (editPromptRaw, referenceUrl) => {
    if (!detailView || detailView.kind !== 'videoModel' || editingImageJob) return;
    const msg = messages.find(m => m.job?.uid === detailView.jobUid);
    if (!msg) return;
    setEditingImageJob(true);
    try {
      const editPrompt = await refineEditPrompt(editPromptRaw);
      const res = await fetch('/api/videos/generate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          model: 'omni_flash_1_1', prompt: editPrompt, aspectRatio: msg.job.aspectRatio || '16:9',
          durationSec: 5, tier: '720p', sourceVideoUrl: referenceUrl,
        }),
      });
      const data = await safeJson(res, lang);
      if (!res.ok) { setError(data.message || data.error || 'Failed'); return; }
      const sd = await pollGenerationJob('video', data.jobId, lang);
      if (sd.status === 'failed') { setError(sd.error || 'Failed'); return; }
      updateJobByUid(detailView.jobUid, { videoUrl: sd.videoUrl, cost: (msg.job.cost || 0) + (data.creditCost || 0) });
    } catch (e) {
      setError(e.message);
    } finally {
      setEditingImageJob(false);
    }
  };
  const submitMediaEdit = (editPrompt, referenceUrl) => {
    if (detailView?.kind === 'videoModel') return submitVideoEdit(editPrompt, referenceUrl);
    return submitImageEdit(editPrompt, referenceUrl);
  };

  // ✅ NEW (Phase 3 — new image-generation models): توليد صور مستقل، مش فيديو — مفيش
  // job طويل بيحتاج poll، الطلب نفسه بيستنى الصور جاهزة (backend بيعمل Prefer: wait)
  const startImageGeneration = async (gen) => {
    const jobUid = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // ✅ NEW: لو الايجنت طلب مشاهد مختلفة دفعة واحدة (gen.prompts)، بنعرض أول برومبت كنص
    // الوصف تحت الكارت، وبنسيب job.prompts عشان "إعادة الاستخدام/نسخ" لكل صورة تاخد
    // البرومبت بتاعها هي مش برومبت صورة تانية
    const distinctPrompts = Array.isArray(gen.prompts) ? gen.prompts.filter(p => typeof p === 'string' && p.trim()) : [];
    // ✅ NEW (طلب العميل: "لازم يكون في ذكاء" — كل مشهد يقرر مرجعه الخاص): "scenes" شكل بديل
    // لـ"prompts" — كل عنصر معاه referenceImageUrls/useScenesAsReference خاصة بيه. بنستخرج
    // نص البرومبتات بس هنا لعرض/إعادة استخدام كل صورة (job.prompts زي أي دفعة تانية)، والشكل
    // الكامل (gen.scenes) بيتبعت زي ما هو للباك إند تحت
    const distinctScenes = Array.isArray(gen.scenes) ? gen.scenes.filter(s => s && typeof s.prompt === 'string' && s.prompt.trim()) : [];
    const usingScenes = distinctScenes.length >= 2;
    const usingPrompts = !usingScenes && distinctPrompts.length >= 2;
    const displayPrompts = usingScenes ? distinctScenes.map(s => s.prompt) : usingPrompts ? distinctPrompts : null;
    const job = { uid: jobUid, status: 'generating', model: gen.model, prompt: displayPrompts ? displayPrompts[0] : gen.prompt, prompts: displayPrompts, aspectRatio: gen.aspectRatio || '9:16', tier: gen.tier || null };
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
          model: gen.model, prompt: gen.prompt, prompts: usingPrompts ? distinctPrompts : undefined, scenes: usingScenes ? distinctScenes : undefined, aspectRatio: gen.aspectRatio || '9:16', count: gen.count || 1,
          referenceImageUrls: Array.isArray(gen.referenceImageUrls) ? gen.referenceImageUrls : undefined,
          tier: gen.tier || undefined,
        }),
      });
      const data = await safeJson(res, lang);
      if (!res.ok) {
        updateJob({ status: 'failed', error: data.message || data.error });
      } else {
        // ✅ FIX (باج حقيقي: العميل يعمل صورة في مشروع، يقفل قبل ما تخلص، يرجع للمشروع تاني —
        // الايجنت بيلاقي نفسه من غير رابط صورة حقيقي يقدر يشتغل عليه لأن jobId الحقيقي بتاع
        // السيرفر مكانش بيتخزن في الـmessage خالص (كان بس متغير محلي جوه الدالة دي)، فمفيش
        // إمكانية نتأكد من حالته الحقيقية بعد إعادة التحميل. دلوقتي بنخزنه في الـjob نفسه —
        // يتحفظ مع باقي المحادثة، ويتستخدم في reconcileStaleJobs لما المشروع يتفتح تاني
        updateJob({ backendJobId: data.jobId });
        const sd = await pollGenerationJob('image', data.jobId, lang);
        if (sd.status === 'failed') updateJob({ status: 'failed', error: sd.error });
        else updateJob({ status: 'done', images: sd.images, cost: data.creditCost });
      }
    } catch (e) {
      updateJob({ status: 'failed', error: e.message });
    }
  };

  // ✅ NEW (new standalone video-generation models — Veo/Kling/Seedance/Luma): نفس نمط
  // startImageGeneration بالظبط — طلب واحد بيستنى الفيديو جاهز (backend بيعمل Prefer: wait)
  const startVideoModelGeneration = async (gen) => {
    // نقل الأداء: محتاج فيديو العميل المرفوع + صورة الشخصية — الفيديو بيترفع هنا لرابط عام قبل التوليد
    const isPerf = gen.model === 'prunaai_p_video_animate';
    if (isPerf && !gen.sourceVideoUrl && !uploadedVideoFile) {
      setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'محتاج الفيديو الأصلي (اللي فيه الحركة والكلام) — ارفعه من زرار + وبعدين كمّل.' : 'I need the source video (the one with the movements and speech) — upload it with the + button, then continue.' }]);
      return;
    }
    if (isPerf && !gen.imageUrl) {
      setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'محتاج صورة الشخصية الجديدة — ارفعها أو اطلب مني أعملها، وبعدين كمّل.' : 'I need the new character image — upload one or ask me to create it, then continue.' }]);
      return;
    }
    const jobUid = `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'generating', model: gen.model, prompt: gen.prompt, aspectRatio: gen.aspectRatio || '16:9' };
    setMessages(m => [...m, { role: 'assistant', type: 'videoModel', job }]);
    const updateJob = (patch) => {
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.type === 'videoModel' && x.job?.uid === jobUid);
        if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
        return copy;
      });
    };
    try {
      let sourceVideoUrl = gen.sourceVideoUrl || undefined;
      if (isPerf && !sourceVideoUrl) {
        const form = new FormData();
        form.append('video', uploadedVideoFile, uploadedVideoFile.name || 'video.mp4');
        const up = await fetch('/api/videos/upload-source', { method: 'POST', headers: tokenHeader(), body: form });
        const upData = await safeJson(up, lang);
        if (!up.ok || !upData.url) { updateJob({ status: 'failed', error: upData.message || upData.error || 'Upload failed' }); return; }
        sourceVideoUrl = upData.url;
      }
      const res = await fetch('/api/videos/generate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          model: gen.model, prompt: gen.prompt, imageUrl: gen.imageUrl || undefined,
          sourceVideoUrl,
          referenceImageUrls: gen.referenceImageUrls?.length ? gen.referenceImageUrls : undefined,
          referenceVideoUrls: gen.referenceVideoUrls?.length ? gen.referenceVideoUrls : undefined,
          lastFrameUrl: gen.lastFrameUrl || undefined,
          aspectRatio: gen.aspectRatio || '16:9', durationSec: gen.durationSec || 5, tier: gen.tier || undefined,
          narrationScript: gen.narrationScript || undefined, voiceKey: gen.voiceKey || undefined,
          narrationLanguage: gen.narrationLanguage || undefined, addCaptions: gen.addCaptions || undefined,
          musicStyle: gen.musicStyle || undefined, musicMood: gen.musicMood || undefined,
          generateAudio: gen.generateAudio === false ? false : undefined,
        }),
      });
      const data = await safeJson(res, lang);
      if (!res.ok) {
        updateJob({ status: 'failed', error: data.message || data.error });
      } else {
        // ✅ FIX: نفس فكرة startImageGeneration فوق — نخزن jobId الحقيقي بتاع السيرفر في
        // الـjob نفسه عشان reconcileStaleJobs يقدر يتأكد من حالته الحقيقية بعد إعادة التحميل
        updateJob({ backendJobId: data.jobId });
        const sd = await pollGenerationJob('video', data.jobId, lang);
        if (sd.status === 'failed') updateJob({ status: 'failed', error: sd.error });
        else updateJob({ status: 'done', videoUrl: sd.videoUrl, cost: data.creditCost });
      }
    } catch (e) {
      updateJob({ status: 'failed', error: e.message });
    }
  };

  // ✅ NEW (طلب العميل: "جمع الفيديوهات اللي عملناها في فيديو واحد"): بيعيد استخدام نفس كارت
  // عرض الفيديو (VideoModelCard) اللي بيعرض أي job فيه videoUrl/prompt/cost، بغض النظر إن
  // ده فيديو متولد بموديل ولا فيديو مدموج بـ ffmpeg
  const startVideoMerge = async (merge) => {
    const jobUid = `merge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'generating', model: 'merged', prompt: lang === 'ar' ? `دمج ${merge.videoUrls.length} فيديو` : `Merged ${merge.videoUrls.length} videos` };
    setMessages(m => [...m, { role: 'assistant', type: 'videoModel', job }]);
    const updateJob = (patch) => {
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.type === 'videoModel' && x.job?.uid === jobUid);
        if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
        return copy;
      });
    };
    try {
      const res = await fetch('/api/videos/merge', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          videoUrls: merge.videoUrls,
          narrationScript: merge.narrationScript || undefined, voiceKey: merge.voiceKey || undefined,
          narrationLanguage: merge.narrationLanguage || undefined, addCaptions: merge.addCaptions || undefined,
          musicStyle: merge.musicStyle || undefined, musicMood: merge.musicMood || undefined,
        }),
      });
      const data = await safeJson(res, lang);
      if (!res.ok) {
        updateJob({ status: 'failed', error: data.message || data.error });
      } else {
        const sd = await pollGenerationJob('video-merge', data.jobId, lang);
        if (sd.status === 'failed') updateJob({ status: 'failed', error: sd.error });
        else updateJob({ status: 'done', videoUrl: sd.videoUrl, cost: data.creditCost });
      }
    } catch (e) {
      updateJob({ status: 'failed', error: e.message });
    }
  };

  // ✅ NEW (طلب العميل: أداة تحليل فيديو مستقلة — zsxkib/talknet-asd، "مين بيتكلم إمتى" —
  // متاحة كخاصية مستقلة، وكمان خطوة تمهيدية قبل مونتاج فيديو أطول من 10 ثواني). ⚠️ شكل
  // "output" الحقيقي الراجع من الموديل ده لسه مش مؤكد (سكرين شوت الـschema مش موجود عندنا
  // زي باقي الموديلات) — بنخزنه زي ما هو ونعرضه كنص خام في ملاحظة الـhistory لحد ما يتأكد حي
  const startVideoAnalysis = async (analyze) => {
    const jobUid = `analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = { uid: jobUid, status: 'generating', videoUrl: analyze.videoUrl };
    setMessages(m => [...m, { role: 'assistant', type: 'videoAnalysis', job }]);
    const updateJob = (patch) => {
      setMessages(m => {
        const copy = [...m];
        const idx = copy.findIndex(x => x.type === 'videoAnalysis' && x.job?.uid === jobUid);
        if (idx !== -1) copy[idx] = { ...copy[idx], job: { ...copy[idx].job, ...patch } };
        return copy;
      });
    };
    try {
      const res = await fetch('/api/videos/analyze', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ videoUrl: analyze.videoUrl }),
      });
      const data = await safeJson(res, lang);
      if (!res.ok) {
        updateJob({ status: 'failed', error: data.message || data.error });
      } else {
        const sd = await pollGenerationJob('video-analysis', data.jobId, lang);
        if (sd.status === 'failed') updateJob({ status: 'failed', error: sd.error });
        else updateJob({ status: 'done', analysis: sd.analysis, mediaUrls: sd.mediaUrls || [], cost: sd.creditCost ?? data.creditCost });
      }
    } catch (e) {
      updateJob({ status: 'failed', error: e.message });
    }
  };

  const startGeneration = async (ready) => {
    // ✅ FIX: منع بدء رندر جديد لو فيه واحد شغال بالفعل — كان بيحصل تضارب لو الأجنت
    // حاول يبدأ مرتين قريبين من بعض، وكل جوب كان بيحدّث آخر كارت في الشات بغض النظر عن صاحبه
    if (activeJobRef.current) return;

    // ✅ NEW (fix "حرك الصورة اللي عملناها" — الايجنت كان بيبدأ فيديو جديد من الصفر بدل ما
    // يحرك الصورة المتولدة فعليًا): لو الايجنت قرر إن العميل عايز يحرك صورة اتولدت قبل كده في
    // نفس المحادثة (مش صورة رفعها العميل بنفسه)، نجيب رابط آخر صورة اتولدت بنجاح ونحولها
    // base64 عشان نستخدمها بنفس مسار "صورة مرفوعة" الشغال فعليًا (Model 5 image-to-video / directAnimate)
    // ✅ FIX: كان شرط تفعيل ده معلّق بالكامل على إن الأجنت (نموذج LLM) ينجح يحط
    // "animateLastGeneratedImage":true في الماركر بتاعه — ده مش مضمون مع كل نموذج/كل مرة
    // (باج حقيقي شوفناه: الماركر مكنش بيتحط، فكان بيوصل للباك إند من غير صورة خالص ويفشل
    // بـ"photo required"). دلوقتي مش شرط أساسي — أي طلب image-to-video من غير صورة مرفوعة
    // ومن غير وصف شخصية نصي بيجرّب يستخدم آخر صورة اتولدت تلقائيًا، بصرف النظر عن الماركر
    let resolvedAnimatePhoto = null;
    if (ready.model === 5 && ready.promptMode === 'image' && !lastUploadedPhotos.length && !ready.characterDescriptions?.length) {
      // ✅ FIX (طلب العميل: "لازم يكون عارف هيختار انهي صورة يحركها عشان لو العميل عامل صور
      // كتير مش يحرم اي صورة"): لو الايجنت حدد "animateImageUrl" بنفسه (رابط دقيق نسخه من
      // الـ history نفسه)، ده بيبقى المصدر الوحيد — مش أي heuristic تاني. ده بيحل مشكلة إن
      // "آخر صورة اتولدت" كانت دايمًا هي اللي بتتحرك حتى لو العميل قصد صورة تانية من دفعة سابقة
      const targetUrl = ready.animateImageUrl || [...messages].reverse().find(m => m.type === 'imageBatch' && m.job?.status === 'done' && m.job.images?.length)?.job.images[0];
      if (targetUrl) {
        try {
          const blob = await fetchRemoteBlob(targetUrl);
          resolvedAnimatePhoto = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          console.warn('[Agent] Failed to fetch image to animate:', e.message);
        }
      }
      if (!resolvedAnimatePhoto) {
        setMessages(m => [...m, { role: 'assistant', content: lang === 'ar' ? 'معنديش صورة سابقة أقدر أحركها دلوقتي — جرب تولّد صورة الأول أو ترفعها يدوي.' : "I don't have a previous generated image to animate right now — try generating one first or upload a photo." }]);
        return;
      }
    }

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
            ? { promptMode: 'image', characters: lastUploadedPhotos.length ? [{ prompt: '', photo: lastUploadedPhotos[0] }] : resolvedAnimatePhoto ? [{ prompt: '', photo: resolvedAnimatePhoto }] : characters, duration: ready.duration, rawPrompt: ready.rawPrompt || undefined }
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

  // ✅ FIX (طلب العميل: "بدلا من ان يكون فيه سهمين لا اجمع كل حاجه في علامة + ... كله بلغة
  // الانجليزية"): كان فيه 3 أزرار منفصلة (+ للإرفاق، ▾ للستايل، ▾ لفرض موديل معيّن) — دلوقتي
  // كله جوه علامة "+" واحدة، بقائمة رئيسية (رفع ملف/إنشاء صورة/إنشاء فيديو/ستايل) وقوائم فرعية
  // (Back) لكل خيار — نفس منطق forcedModel/selectedStyle القديم بالظبط، بس واجهة موحّدة، وكل
  // نصوص القائمة دي تحديدًا بالإنجليزي زي ما اتطلب صراحة
  const [selectedStyle, setSelectedStyle] = useState(null);
  const STYLE_OPTIONS = [
    { key: 'anime',      icon: Sparkles,     label: 'Anime' },
    { key: '3d_cartoon', icon: Box,          label: '3D Cartoon' },
    { key: 'action',     icon: Swords,       label: 'Action' },
    { key: 'realistic',  icon: Camera,       label: 'Realistic' },
    { key: 'cinematic',  icon: Clapperboard, label: 'Cinematic' },
    { key: 'map_video',  icon: MapIcon,      label: 'Map Video' },
  ];
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [plusMenuView, setPlusMenuView] = useState('main'); // 'main' | 'createImage' | 'createVideo' | 'style'
  const closePlusMenu = () => { setPlusMenuOpen(false); setPlusMenuView('main'); };
  const plusItemStyle = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' };
  const plusItemHover = (e, on) => { e.currentTarget.style.background = on ? 'rgba(255,255,255,0.06)' : 'none'; };

  const PlusMenu = () => (
    <div style={{ position: 'relative' }}>
      <input ref={voiceInputRef} type="file" accept="audio/*" onChange={(e) => { handleVoiceFile(e); closePlusMenu(); }} style={{ display: 'none' }} />
      <input ref={voiceCloneInputRef} type="file" accept="audio/*" onChange={(e) => { handleVoiceCloneFile(e); closePlusMenu(); }} style={{ display: 'none' }} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={(e) => { handleImageFile(e); closePlusMenu(); }} style={{ display: 'none' }} />
      <input ref={videoInputRef} type="file" accept="video/*" onChange={(e) => { handleVideoFile(e); closePlusMenu(); }} style={{ display: 'none' }} />
      <input ref={montageInputRef} type="file" accept="video/*,audio/*,image/png,image/jpeg,image/webp" multiple onChange={(e) => { uploadMontageFiles(e.target.files); e.target.value = ''; closePlusMenu(); }} style={{ display: 'none' }} />
      <button onClick={() => (plusMenuOpen ? closePlusMenu() : setPlusMenuOpen(true))} title="Attach, create, or set a style"
        style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (plusMenuOpen || forcedModel || selectedStyle) ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.05)', border: `1px solid ${(plusMenuOpen || forcedModel || selectedStyle) ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.08)'}`, color: (plusMenuOpen || forcedModel || selectedStyle) ? 'var(--accent2)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 18, fontWeight: 700, flexShrink: 0, transition: 'all 0.15s', transform: plusMenuOpen ? 'rotate(45deg)' : 'none' }}>+</button>

      {plusMenuOpen && (
        <>
          <div onClick={closePlusMenu} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', bottom: 46, left: 0, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 12, padding: 6, minWidth: 230, maxHeight: 360, overflowY: 'auto', boxShadow: '0 8px 28px rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', flexDirection: 'column', gap: 2 }}>

            {plusMenuView === 'main' && (
              <>
                <button onClick={() => imageInputRef.current?.click()} style={plusItemStyle} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}>
                  <ImageIcon size={16} strokeWidth={2} /> Upload photo
                </button>
                <button onClick={() => videoInputRef.current?.click()} style={plusItemStyle} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)} title={`Upload a video to edit (max ${MAX_VIDEO_UPLOAD_SEC}s)`}>
                  <Film size={16} strokeWidth={2} /> Upload video to edit
                </button>
                <button onClick={() => montageInputRef.current?.click()} style={plusItemStyle} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)} title={lang === 'ar' ? 'ارفع فيديو أو أكتر (لحد 20) + تعليق صوتي اختياري + صورة موشن جرافيك مرجعية (مثلاً من Pinterest)، والايجنت يعمل لها مونتاج' : 'Upload one or more videos (up to 20) + an optional voiceover + a motion-graphics reference image (e.g. from Pinterest), and the agent edits them into one'}>
                  <Scissors size={16} strokeWidth={2} /> {lang === 'ar' ? 'ارفع فيديوهات (وصوت) للمونتاج' : 'Upload videos (+ voiceover) for montage'}
                </button>
                <button onClick={() => voiceInputRef.current?.click()} style={plusItemStyle} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)} title={t.voiceTitle(limits.MAX_AUDIO_SEC / 60)}>
                  <Mic size={16} strokeWidth={2} /> Record voice message
                </button>
                <button onClick={() => voiceCloneInputRef.current?.click()} disabled={savingVoice} style={{ ...plusItemStyle, cursor: savingVoice ? 'wait' : 'pointer' }} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}
                  title="Save your voice once (10s recommended, max 1 minute) and use it in any future video">
                  <Volume2 size={16} strokeWidth={2} /> {savingVoice ? 'Saving...' : (myClonedVoice ? 'Update my saved voice' : 'Save my voice')}
                </button>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 2px' }} />
                <button onClick={() => setPlusMenuView('createImage')} style={plusItemStyle} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}>
                  <ImageIcon size={16} strokeWidth={2} /> Create image <ChevronRight size={14} strokeWidth={2} style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.35)' }} />
                </button>
                <button onClick={() => setPlusMenuView('createVideo')} style={plusItemStyle} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}>
                  <Film size={16} strokeWidth={2} /> Create video <ChevronRight size={14} strokeWidth={2} style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.35)' }} />
                </button>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 2px' }} />
                <button onClick={() => setPlusMenuView('style')} style={plusItemStyle} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}>
                  {(() => { const SelIcon = STYLE_OPTIONS.find(s => s.key === selectedStyle)?.icon || Sparkles; return <SelIcon size={16} strokeWidth={2} />; })()}
                  Visual style{selectedStyle ? `: ${STYLE_OPTIONS.find(s => s.key === selectedStyle)?.label}` : ''}
                  <ChevronRight size={14} strokeWidth={2} style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.35)' }} />
                </button>
                {(forcedModel || selectedStyle) && (
                  <button onClick={() => { setForcedModel(null); setSelectedStyle(null); }}
                    style={{ ...plusItemStyle, borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 2, paddingTop: 10, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ef4444'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}>
                    <X size={14} strokeWidth={2.5} /> Clear engine/style selection
                  </button>
                )}
              </>
            )}

            {plusMenuView === 'createImage' && (
              <>
                <button onClick={() => setPlusMenuView('main')} style={{ ...plusItemStyle, color: 'rgba(255,255,255,0.5)', fontSize: 12 }} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}>
                  <ChevronLeft size={14} strokeWidth={2} /> Back
                </button>
                {imageModelOptions.map(opt => (
                  <button key={opt.key}
                    onClick={() => { setForcedModel({ type: 'image', key: opt.key, label: opt.label }); closePlusMenu(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                      background: forcedModel?.type === 'image' && forcedModel.key === opt.key ? 'rgba(124,106,247,0.15)' : 'none', border: 'none',
                      color: '#e5e7eb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = forcedModel?.type === 'image' && forcedModel.key === opt.key ? 'rgba(124,106,247,0.15)' : 'none'}>
                    <ImageIcon size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{opt.creditCostPerImage}cr</span>
                    {forcedModel?.type === 'image' && forcedModel.key === opt.key && <Check size={13} strokeWidth={3} style={{ color: 'var(--accent2)', flexShrink: 0 }} />}
                  </button>
                ))}
              </>
            )}

            {plusMenuView === 'createVideo' && (
              <>
                <button onClick={() => setPlusMenuView('main')} style={{ ...plusItemStyle, color: 'rgba(255,255,255,0.5)', fontSize: 12 }} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}>
                  <ChevronLeft size={14} strokeWidth={2} /> Back
                </button>
                {videoModelOptions.map(opt => (
                  <button key={opt.key}
                    onClick={() => { setForcedModel({ type: 'video', key: opt.key, label: opt.label }); closePlusMenu(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                      background: forcedModel?.type === 'video' && forcedModel.key === opt.key ? 'rgba(124,106,247,0.15)' : 'none', border: 'none',
                      color: '#e5e7eb', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = forcedModel?.type === 'video' && forcedModel.key === opt.key ? 'rgba(124,106,247,0.15)' : 'none'}>
                    <Film size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                    {opt.performanceTransfer && <span title={lang === 'ar' ? 'بياخد فيديو + صورة شخصية' : 'Takes a video + a character image'} style={{ fontSize: 10, color: 'var(--accent2)', border: '1px solid rgba(124,106,247,0.4)', borderRadius: 6, padding: '1px 5px', flexShrink: 0 }}>{lang === 'ar' ? 'فيديو + صورة' : 'video + image'}</span>}
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{opt.creditCostPerSecond}cr/s</span>
                    {forcedModel?.type === 'video' && forcedModel.key === opt.key && <Check size={13} strokeWidth={3} style={{ color: 'var(--accent2)', flexShrink: 0 }} />}
                  </button>
                ))}
              </>
            )}

            {plusMenuView === 'style' && (
              <>
                <button onClick={() => setPlusMenuView('main')} style={{ ...plusItemStyle, color: 'rgba(255,255,255,0.5)', fontSize: 12 }} onMouseEnter={e => plusItemHover(e, true)} onMouseLeave={e => plusItemHover(e, false)}>
                  <ChevronLeft size={14} strokeWidth={2} /> Back
                </button>
                {STYLE_OPTIONS.map(opt => (
                  <button key={opt.key}
                    onClick={() => { setSelectedStyle(v => v === opt.key ? null : opt.key); closePlusMenu(); }}
                    style={{ ...plusItemStyle, background: selectedStyle === opt.key ? 'rgba(124,106,247,0.15)' : 'none' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = selectedStyle === opt.key ? 'rgba(124,106,247,0.15)' : 'none'}>
                    <opt.icon size={16} strokeWidth={2} />{opt.label}
                    {selectedStyle === opt.key && <Check size={14} strokeWidth={3} style={{ marginLeft: 'auto', color: 'var(--accent2)' }} />}
                  </button>
                ))}
              </>
            )}

          </div>
        </>
      )}
    </div>
  );

  // ✅ NEW (Workspace redesign, Phase 2): الشات بقى شريط جانبي نص فقط — أي ميديا متولدة
  // (فيديو/whiteboard/دفعة صور) بتتشال من قائمة رسائل الشات وتتعرض في canvas النص بدل كده
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 860px)');
    const on = () => setIsMobile(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const MEDIA_TYPES = ['render', 'whiteboard', 'imageBatch', 'videoModel', 'videoAnalysis', 'channelRun', 'channelReview', 'docJob'];
  const mediaItems = messages
    .map((m, i) => ({ ...m, _i: i }))
    .filter(m => MEDIA_TYPES.includes(m.type));
  // ✅ NEW (طلب العميل: تاب "المفضّلة" جوه المشروع): بيفحص كل ميديا في المشروع ده — صورة
  // واحدة مفضّلة جوه دفعة صور تكفي عشان الكارت كله يظهر في التاب ده (الفلترة الحقيقية على
  // مستوى الصورة نفسها بتحصل جوه ImageBatchCard زي ما هي)
  const isMediaFavorited = (m) => {
    if (m.type === 'imageBatch') return (m.job?.imageMeta || []).some(meta => meta?.favorited);
    return !!m.job?.favorited;
  };
  const visibleMedia = rightTab === 'images' ? mediaItems.filter(m => m.type === 'imageBatch')
    : rightTab === 'videos' ? mediaItems.filter(m => m.type === 'render' || m.type === 'whiteboard' || m.type === 'videoModel' || m.type === 'videoAnalysis' || m.type === 'channelRun' || m.type === 'channelReview' || m.type === 'docJob')
    : rightTab === 'favorites' ? mediaItems.filter(isMediaFavorited)
    : mediaItems;

  const RIGHT_TABS = [
    { key: 'all', label: t.allMedia, icon: LayoutGrid },
    { key: 'images', label: t.imagesTab, icon: Images },
    { key: 'videos', label: t.videosTab, icon: Video },
    { key: 'favorites', label: t.favoritesTab, icon: Heart },
  ];

  // كارت الميديا (نفسه في الكانفاس على الكمبيوتر وجوه الشات على الموبايل)
  const renderMediaCard = (m) => (
    <>
    {m.type === 'render' && <RenderCard job={m.job} lang={lang} onNavigate={onNavigate} />}
    {m.type === 'whiteboard' && <WhiteboardCard job={m.job} lang={lang} onNavigate={onNavigate} />}
    {m.type === 'docJob' && <DocJobCard job={m.job} lang={lang} onNavigate={onNavigate} />}
    {m.type === 'channelRun' && <ChannelRunCard job={m.job} lang={lang} onNavigate={onNavigate} />}
    {m.type === 'channelReview' && <ChannelReviewCard job={m.job} lang={lang}
      onUpdateJob={(patch) => updateJobByRunId(m.job.runId, patch)}
      onMessage={(text) => setMessages(mm => [...mm, { role: 'assistant', content: text }])}
    />}
    {m.type === 'imageBatch' && <ImageBatchCard job={m.job} lang={lang}
      onUpdateJob={(patch) => updateJobByUid(m.job.uid, patch)}
      onRemoveImage={(idx) => removeImageFromBatch(m.job.uid, idx)}
      onReusePrompt={reusePromptIntoComposer}
      onAnimate={animateImageFromMenu}
      onReport={reportMedia}
      onOpenDetail={(idx) => setDetailView({ jobUid: m.job.uid, kind: 'imageBatch', imgIndex: idx })}
      onToast={showToast}
    />}
    {m.type === 'videoModel' && <VideoModelCard job={m.job} lang={lang}
      onUpdateJob={(patch) => updateJobByUid(m.job.uid, patch)}
      onRemove={() => removeMessageByJobUid(m.job.uid)}
      onReusePrompt={reusePromptIntoComposer}
      onReport={reportMedia}
      onOpenDetail={() => setDetailView({ jobUid: m.job.uid, kind: 'videoModel' })}
      onToast={showToast}
    />}
    {m.type === 'videoAnalysis' && (
      <div style={{ padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', fontSize: 13, color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontWeight: 700 }}>
          <Mic size={14} strokeWidth={2} />
          {lang === 'ar' ? 'تحليل الفيديو' : 'Video Analysis'}
        </div>
        {m.job?.status === 'generating' && <div style={{ color: 'var(--text2)' }}>{lang === 'ar' ? 'جاري التحليل...' : 'Analyzing...'}</div>}
        {m.job?.status === 'failed' && <div style={{ color: '#ef4444' }}>{m.job.error || (lang === 'ar' ? 'فشل التحليل' : 'Analysis failed')}</div>}
        {m.job?.status === 'done' && (
          <>
            {/* ✅ NEW: "media_path" على الأرجح فيديو تصور مرئي (مربعات حوالين
                اللي بيتكلم/مش بيتكلم) — نعرضه كفيديو حقيقي مش مجرد رابط نصي */}
            {Array.isArray(m.job.mediaUrls) && m.job.mediaUrls.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {m.job.mediaUrls.map((u, idx) => (
                  <video key={idx} src={u} controls playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />
                ))}
              </div>
            )}
            <div style={{ color: 'var(--text2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 160, overflowY: 'auto' }}>
              {typeof m.job.analysis === 'string' ? m.job.analysis : JSON.stringify(m.job.analysis, null, 2)}
            </div>
          </>
        )}
      </div>
    )}
    </>
  );

  return (
    <div className={`agent-3col${leavingWorkspace ? ' workspace-exiting' : ''}${mediaItems.length ? ' agent-has-media' : ''}`} style={{ height: 'calc(100vh - 74px)', display: 'flex', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        .agent-bubble{animation:fadeUp 0.25s ease}
        .agent-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block;animation:bounce 1s ease infinite}
        .agent-models-btn:hover{background:rgba(124,106,247,0.16) !important;border-color:rgba(124,106,247,0.45) !important;}
        .agent-icon-btn:hover{background:var(--bg3) !important;color:var(--text) !important;}
        .agent-tab-btn:hover{background:var(--bg3) !important;}
        .agent-mobile-tabs{display:none;}
        .agent-mobile-only{display:none;}
        /* ✅ FIX (طلب العميل: "ظبط شكل الموقع على الهاتف"): الشكل بتاع 3 أعمدة (شات + كانفاس +
           تنظيم) كان عرضه ثابت بالبكسل من غير أي تعديل للهاتف خالص — على شاشة صغيرة ده كان
           بيطلع مقصوص/متلخبط. دلوقتي على الهاتف الأعمدة بتترتب فوق بعض (شات فوق، كانفاس تحت)،
           عمود "التنظيم" الجانبي بيختفي ومكانه شريط تابات أفقي بسيط فوق الكانفاس نفسه */
        @media (max-width: 860px) {
          /* الموبايل: شكل شات زي واتساب — الميديا جوه المحادثة نفسها والكانفاس المنفصل مخفي، وخانة الكتابة ثابتة تحت */
          .agent-3col{flex-direction:column;height:calc(100vh - 74px) !important;height:calc(100dvh - 74px) !important;overflow:hidden !important;}
          .agent-panel-chat{width:100% !important;flex:1 1 0 !important;flex-shrink:1 !important;min-height:0 !important;height:auto !important;border-inline-end:none !important;}
          .agent-panel-canvas{display:none !important;}
          .agent-panel-organize{display:none !important;}
        }
      `}</style>

      {/* ── Left: Agent chat sidebar ─────────────────────────────────────────── */}
      <div className="agent-panel-chat" style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', borderInlineEnd: '1px solid var(--border)', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 100% 30% at 50% -10%, rgba(124,106,247,0.08) 0%, transparent 70%)' }} />

        <div className="agent-chat-head" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border)', position: 'relative', flexShrink: 0 }}>
          <button className="agent-icon-btn" onClick={handleLeaveWorkspace} title={t.backToProjects}
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
              if (MEDIA_TYPES.includes(m.type)) {
                // الموبايل: الميديا جوه الشات نفسه زي أي محادثة (مفيش كانفاس منفصل)
                return isMobile ? <div key={i} className="agent-bubble" style={{ alignSelf: 'stretch', width: '100%' }}>{renderMediaCard(m)}</div> : null;
              }
              if (m.type === 'docSetup') {
                return (
                  <div key={i} className="agent-bubble" style={{ alignSelf: 'stretch' }}>
                    <DocSetupCard setup={m.setup} lang={lang} started={!!m.started}
                      onStarted={(job) => setMessages(ms => [...ms.map((x, idx) => (idx === i ? { ...x, started: true } : x)), { role: 'assistant', type: 'docJob', job }])} />
                  </div>
                );
              }
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
                    {m.montageItems?.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                        {m.montageItems.map((it, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.14)', fontSize: 12 }}>
                            {it.kind === 'audio' ? <Mic size={12} strokeWidth={2} /> : it.kind === 'image' ? <ImageIcon size={12} strokeWidth={2} /> : <Film size={12} strokeWidth={2} />} {String(it.name || '').slice(0, 22)}{it.durationSec ? ` · ${Math.floor(it.durationSec / 60)}:${String(Math.round(it.durationSec % 60)).padStart(2, '0')}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                    {m.hasVoice && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, opacity: 0.8, marginBottom: 6 }}><Mic size={12} strokeWidth={2} /> {t.voiceAttached}</div>}
                    {m.content}
                  </div>
                  {/* ✅ NEW (طلب العميل: زرار سريع "ابدأ/لأ" بدل ما يكتبهم يدويًا في كل مرة) —
                      بيظهر بس تحت آخر رسالة من الايجنت لو كانت سؤال تأكيد فعلاً، وبيختفي أول
                      ما العميل يبعت أي رسالة تانية (مش آخر رسالة بقى) */}
                  {m.role === 'assistant' && m.awaitingConfirmation && i === messages.length - 1 && !loading && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => sendMessage(lang === 'ar' ? 'ابدأ' : 'Yes')}
                        style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#9d4edd)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        {lang === 'ar' ? 'ابدأ' : 'Yes'}
                      </button>
                      <button onClick={() => sendMessage(lang === 'ar' ? 'لأ' : 'No')}
                        style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: 'var(--text2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        {lang === 'ar' ? 'لأ' : 'No'}
                      </button>
                    </div>
                  )}
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

          {(voiceFile || imageFiles.length > 0 || (uploadedVideoFile && !videoSentOnce) || forcedModel || montageAssets.length > 0) && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              {forcedModel && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: 'var(--accent2)' }}>{forcedModel.type === 'image' ? <ImageIcon size={13} strokeWidth={2} /> : <Film size={13} strokeWidth={2} />} {forcedModel.label} <button onClick={() => setForcedModel(null)} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontWeight: 700 }}><X size={13} strokeWidth={2.5} /></button></div>}
              {voiceFile && <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: 'var(--accent2)' }}><Mic size={13} strokeWidth={2} /> {voiceFile.name.slice(0, 20)} <button onClick={() => setVoiceFile(null)} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontWeight: 700 }}><X size={13} strokeWidth={2.5} /></button></div>}
              {imageFiles.map((_, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: 'var(--accent2)' }}><ImageIcon size={13} strokeWidth={2} /> {t.imageAttached}{imageFiles.length > 1 ? ` ${idx + 1}` : ''} <button onClick={() => setImageFiles(prev => prev.filter((_, i) => i !== idx))} style={{ display: 'flex', background: 'none', border: 'none', color: 'var(--accent2)', cursor: 'pointer', fontWeight: 700 }}><X size={13} strokeWidth={2.5} /></button></div>
              ))}
              {montageAssets.map((it) => (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid rgba(124,106,247,0.3)', fontSize: 12, color: 'var(--accent2)' }}>
                  {it.kind === 'audio' ? <Mic size={13} strokeWidth={2} /> : it.kind === 'image' ? <ImageIcon size={13} strokeWidth={2} /> : <Film size={13} strokeWidth={2} />} {it.name.slice(0, 18)}{it.status === 'uploading' ? ` · ${it.progress}%` : (it.durationSec ? ` · ${Math.floor(it.durationSec / 60)}:${String(it.durationSec % 60).padStart(2, '0')}` : '')}
                  <button onClick={() => removeMontageAsset(it)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>✕</button>
                </div>
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
            <PlusMenu />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={t.placeholder}
              rows={1}
              style={{ flex: 1, resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit', padding: '9px 6px', direction: isArabic(input) ? 'rtl' : 'ltr', overflowY: 'hidden' }}
            />
            {(loading || activeJobRef.current) ? (
              <button onClick={stopEverything} title={t.stop}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.24)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s ease' }}><Square size={14} strokeWidth={2} fill="currentColor" /></button>
            ) : (
              <button onClick={() => sendMessage()} disabled={!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile && !montageAssets.length}
                onMouseEnter={e => { if (input.trim() || voiceFile || imageFiles.length || uploadedVideoFile) e.currentTarget.style.filter = 'brightness(1.12)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: (!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile) ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#7c6af7,#9d4edd)', border: 'none', color: '#fff', cursor: (!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile) ? 'default' : 'pointer', flexShrink: 0, transition: 'filter 0.15s ease', boxShadow: (!input.trim() && !voiceFile && !imageFiles.length && !uploadedVideoFile) ? 'none' : '0 3px 10px rgba(124,106,247,0.3)' }}><Send size={15} strokeWidth={2.25} /></button>
            )}
          </div>
          <p style={{ textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8 }}>{t.onlyVideo}</p>
        </div>
      </div>

      {/* ── Center: Media canvas ──────────────────────────────────────────────── */}
      <div className={`agent-panel-canvas${mediaItems.length === 0 ? ' agent-canvas-none' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="agent-canvas-head" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {/* على الموبايل الميديا فوق، فزرار الرجوع والموديلات بيتنقلوا هنا */}
          <button className="agent-icon-btn agent-mobile-only" onClick={handleLeaveWorkspace} title={t.backToProjects}
            style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', color: 'var(--text2)', flexShrink: 0 }}>
            <ArrowLeft size={15} strokeWidth={2} />
          </button>
          <span className="agent-canvas-title" style={{ fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {activeProject?.name || t.backToProjects}
          </span>
          <button className="agent-icon-btn agent-mobile-only" onClick={onSwitchToModels} title={t.models}
            style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent2)', flexShrink: 0 }}>
            <Clapperboard size={15} strokeWidth={2} />
          </button>
        </div>
        {/* ✅ NEW: نفس تابات "التنظيم" الجانبية بالظبط، بس شريط أفقي — بيظهر بس على الهاتف
            (العمود الجانبي بيختفي هناك) عشان يفضل ممكن تفلتر الكانفاس بين الكل/صور/فيديوهات */}
        <div className="agent-mobile-tabs" style={{ padding: '10px 16px 0', gap: 8 }}>
          {RIGHT_TABS.map(tabItem => (
            <button key={tabItem.key} onClick={() => setRightTab(tabItem.key)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, background: rightTab === tabItem.key ? 'var(--accent-bg)' : 'var(--bg2)', color: rightTab === tabItem.key ? 'var(--accent2)' : 'var(--text2)', fontSize: 12.5, fontWeight: 600, border: '1px solid var(--border2)', whiteSpace: 'nowrap' }}>
              <tabItem.icon size={13} strokeWidth={2} /> {tabItem.label}
            </button>
          ))}
        </div>
        <div className="agent-canvas-scroll" style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {visibleMedia.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg2)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                {rightTab === 'favorites' ? <Heart size={28} strokeWidth={1.5} color="var(--text3)" /> : <Images size={28} strokeWidth={1.5} color="var(--text3)" />}
              </div>
              {rightTab === 'favorites' ? (
                <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 320, lineHeight: 1.7 }}>{t.favoritesEmpty}</div>
              ) : (
                <>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t.canvasEmptyTitle}</div>
                  <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 320, lineHeight: 1.7 }}>{t.canvasEmptySub}</div>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
              {visibleMedia.map(m => (
                <div key={m._i} className="agent-bubble">
                  {renderMediaCard(m)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Organize panel ─────────────────────────────────────────────── */}
      <div className="agent-panel-organize" style={{ width: rightPanelCollapsed ? 56 : 176, flexShrink: 0, borderInlineStart: '1px solid var(--border)', display: 'flex', flexDirection: 'column', transition: 'width 0.15s ease', overflow: 'hidden' }}>
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
      {detailView && (() => {
        const msg = messages.find(x => x.job?.uid === detailView.jobUid);
        if (!msg) return null;
        return (
          <MediaDetailModal
            lang={lang} kind={detailView.kind} job={msg.job} imgIndex={detailView.imgIndex}
            onChangeIndex={(i) => setDetailView(v => (v ? { ...v, imgIndex: i } : v))}
            editingImage={editingImageJob}
            onClose={() => setDetailView(null)}
            onUpdateJob={(patch) => updateJobByUid(detailView.jobUid, patch)}
            onRemoveImage={(idx) => removeImageFromBatch(detailView.jobUid, idx)}
            onRemove={() => removeMessageByJobUid(detailView.jobUid)}
            onReport={reportMedia}
            onEditSubmit={submitMediaEdit}
            onToast={showToast}
          />
        );
      })()}
      {toast && (
        <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', borderRadius: 24, background: 'rgba(20,20,26,0.95)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={15} strokeWidth={2.25} color="#22c55e" /> {toast}
        </div>
      )}
    </div>
  );
}