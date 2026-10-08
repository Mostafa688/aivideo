// ── WhiteboardVideoPage.jsx ──────────────────────────────────────────────────
// ✅ NEW (طلب العميل): فيديو Whiteboard مجاني للناس كلها بدون كريديت — المستخدم برفع صوت
// السرد، والموقع بيعمل الباقي لوحده (تفريغ → استخراج → رندر) باستخدام نفس محرك مصنع فيديو
// الصوت (audioVideoService.js/audioVideoRenderService.js)، من غير أي خطوات يدوية زي لوحة
// الأدمن. أول فيديو 30 ثانية بس، من رصيد مجاني إجمالي 10 دقايق (600 ثانية) مدى الحياة لكل
// حساب — بعد كده لازم اشتراك (Paywall — فيتشر منفصل هيتضاف لاحقًا).
//
// ✅ NEW ("Continue Video"): بعد الفيديو الأول، زر "كمّل الفيديو" بيفتح اختيار بين AI
// (يرفع صوت، والنظام يستخرج/يحط العناصر لوحده زي الأول) أو يدوي (يرفع صوت، وبعدين يفتح
// نفس محرر التايم لاين بتاع الأدمن — AudioVideoTimelineEditor.jsx، مشترك بينهم — عشان
// يضيف/يبحث عن ملصقات ونصوص بنفسه). لحد ما رصيد الـ10 دقايق يخلص.
import React, { useState, useEffect, useRef, useCallback } from 'react';
import PremiumTimelineEditor from '../components/PremiumTimelineEditor.jsx';
import { EgPaymentModal, IntlPaymentModal, EG_PACKAGES, GUMROAD_PACKAGES } from './PricingPage.jsx';
import { egPrice, usePromo } from '../promo.js';
import {
  PenLine, Sparkles, Gift, Check, Music, UploadCloud, Loader2, Plus, Frown,
  Bot, CheckCircle2, PartyPopper,
} from 'lucide-react';

function authHeaders() { return { Authorization: 'Bearer ' + localStorage.getItem('token') }; }
function jsonAuthHeaders() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') }; }

const STEP_ORDER = ['transcribing', 'extracting', 'rendering', 'done'];
const STEP_LABEL = {
  ar: { transcribing: 'بيسمع الصوت...', extracting: 'بيحلل المحتوى...', rendering: 'بيبني الفيديو...', done: 'خلص!' },
  en: { transcribing: 'Listening to your audio...', extracting: 'Analyzing content...', rendering: 'Building the video...', done: 'Done!' },
};

function formatMin(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return s ? `${m}m ${s}s` : `${m}m`;
}

// ✅ NEW (Task #5 — "professional paywall" once the 10-minute lifetime free budget runs
// out): reuses the platform's real pricing packages/payment modals (PricingPage.jsx) —
// same InstaPay-receipt flow for Egypt, same Gumroad checkout for international — so
// upgrading from here feels like a real plan, not a dead-end placeholder message.
function PaywallPanel({ lang, region, onPick }) {
  const { promo } = usePromo();
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const packages = region === 'eg' ? EG_PACKAGES : GUMROAD_PACKAGES;
  const features = lang === 'ar'
    ? ['كل موديلات الفيديو بالذكاء الاصطناعي', 'بدون أي علامة مائية', 'الكريديت ما يخلصش أبدًا', 'تصدير بجودة HD']
    : ['Access to every AI video model', 'No watermark on any video', 'HD export on every model'];
  return (
    <div className="card animate-in" style={{ textAlign: 'center', borderColor: 'var(--accent)', padding: '32px 22px' }}>
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}><PartyPopper size={36} strokeWidth={1.5} /></div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 21, color: 'var(--text)', marginBottom: 8 }}>
        {t('استخدمت رصيدك المجاني بالكامل!', "You've used your full free budget!")}
      </div>
      <div style={{ color: 'var(--text2)', fontSize: 13.5, lineHeight: 1.7, marginBottom: 22, maxWidth: 460, marginInline: 'auto' }}>
        {t(
          '10 دقايق فيديو Whiteboard المجانية خلصت — دلوقتي وقت ترقّي حسابك وتفتح كل موديلات الفيديو بالذكاء الاصطناعي، من غير أي حد على مدة الفيديو.',
          "You've used the full 10 minutes of free Whiteboard video. Time to unlock every AI video model on the platform, with no length limit."
        )}
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, marginInline: 'auto', textAlign: lang === 'ar' ? 'right' : 'left' }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)' }}>
            <Check size={14} strokeWidth={2.5} color="var(--accent)" style={{ flexShrink: 0 }} />{f}
          </li>
        ))}
      </ul>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, maxWidth: 560, marginInline: 'auto' }}>
        {packages.map(pkg => (
          <div
            key={pkg.key}
            className="card wb-paywall-pkg"
            style={{
              position: 'relative', padding: '18px 14px', cursor: 'pointer',
              borderColor: pkg.popular ? 'var(--accent)' : undefined,
              background: pkg.popular ? 'var(--accent-bg)' : undefined,
            }}
            onClick={() => onPick(pkg)}
          >
            {pkg.popular && (
              <div className="pill" style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', fontSize: 10, padding: '3px 10px', cursor: 'default' }}>
                {t('الأكثر طلبًا', 'Most popular')}
              </div>
            )}
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{pkg.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', margin: '2px 0 10px' }}>{pkg.tagline}</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--accent)' }}>{region === 'eg' ? `${egPrice(pkg.credits, promo)} ${t('ج.م', 'EGP')}` : `$${pkg.usd}`}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>{pkg.credits.toLocaleString()} {t('كريديت', 'credits')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WhiteboardVideoPage({ region, onBack, onNavigate }) {
  const { promo } = usePromo();
  const lang = region === 'eg' ? 'ar' : 'en';
  const t = (ar, en) => (lang === 'ar' ? ar : en);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const [budget, setBudget] = useState(null); // { usedSeconds, limitSeconds, remainingSeconds }
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Continue Video state ──
  // ✅ FIX (طلب العميل: "دوس تكملة الفيديو الأول، وبعد كده يخش على التايم لاين"): شاشة
  // نتيجة بسيطة (فيديو + زرار "كمّل الفيديو") هي الافتراضي بعد أول رندر — التايم لاين
  // الاحترافي (PremiumTimelineEditor) بيظهر بس لما يدوس الزرار ده (editing=true)، مش
  // تلقائي بمجرد ما الفيديو يخلص
  const [editing, setEditing] = useState(false);
  const [continueStep, setContinueStep] = useState(null); // null | 'choose' | 'upload'
  const [continueMode, setContinueMode] = useState('ai'); // 'ai' | 'manual'
  const [continueFile, setContinueFile] = useState(null);
  const [continueError, setContinueError] = useState('');
  const [continuing, setContinuing] = useState(false);
  const continueFileInputRef = useRef(null);

  // ── Paywall (Task #5) — shown once the 10-minute lifetime budget is exhausted,
  // either on the very first upload or mid "Continue Video" ──
  const [showContinuePaywall, setShowContinuePaywall] = useState(false);
  const [paywallModal, setPaywallModal] = useState(null); // { type: 'eg', credits, amountEgp } | { type: 'intl', pkg }
  const [paywallSuccess, setPaywallSuccess] = useState(false);
  const pickPaywallPackage = (pkg) => {
    if (region === 'eg') setPaywallModal({ type: 'eg', credits: pkg.credits, amountEgp: egPrice(pkg.credits, promo) });
    else setPaywallModal({ type: 'intl', pkg });
  };

  const fetchBudget = useCallback(async () => {
    try {
      const r = await fetch('/api/whiteboard-video/budget', { headers: authHeaders() });
      if (r.ok) setBudget(await r.json());
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  // ✅ NEW (طلب العميل: "لما العميل يضغط عليه [كمّل الفيديو من الشات] ينتقل الي صفحة time
  // line"): الايجنت بيحط job id في localStorage قبل ما ينقل المستخدم هنا (بدل ما تفتح
  // شاشة رفع صوت جديد من الصفر) — هنا بنقراه مرة واحدة عند الدخول ونجيب نفس الـjob
  useEffect(() => {
    let resumeId, resumeEdit;
    try {
      resumeId = localStorage.getItem('erivion_resume_whiteboard_job');
      resumeEdit = localStorage.getItem('erivion_resume_whiteboard_edit');
    } catch { /* ignore */ }
    if (!resumeId) return;
    try {
      localStorage.removeItem('erivion_resume_whiteboard_job');
      localStorage.removeItem('erivion_resume_whiteboard_edit');
    } catch { /* ignore */ }
    (async () => {
      try {
        const r = await fetch(`/api/whiteboard-video/jobs/${resumeId}`, { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok || !d.job) return;
        setJob(d.job);
        // ✅ FIX (طلب العميل: "لما ادوس كمل الفيديو المفروض يدخلني على التيم لاين علطول"):
        // لو جاي من زرار "كمّل الفيديو" في شات الايجنت، ادخل على التايم لاين على طول —
        // من غير ما يحتاج يدوس تاني على شاشة النتيجة البسيطة
        if (resumeEdit) setEditing(true);
        if (!['done', 'failed'].includes(d.job.status)) pollJob(d.job.id);
      } catch { /* ignore, falls back to fresh-upload screen */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pollJob = (jobId, onDone) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const rp = await fetch(`/api/whiteboard-video/jobs/${jobId}`, { headers: authHeaders() });
        const dp = await rp.json();
        if (!rp.ok) return;
        setJob(dp.job);
        if (['done', 'failed'].includes(dp.job.status)) {
          clearInterval(pollRef.current);
          if (dp.job.status === 'done') { fetchBudget(); onDone?.(); }
        }
      } catch { /* keep polling */ }
    }, 3000);
  };

  const pickFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('audio/')) { setError(t('محتاج ملف صوت (mp3, wav...)', 'Please choose an audio file (mp3, wav...)')); return; }
    setError(''); setFile(f);
  };

  const handleStart = async () => {
    if (!file) return;
    setStarting(true); setError('');
    try {
      const form = new FormData();
      form.append('audio', file);
      const r = await fetch('/api/whiteboard-video/create', { method: 'POST', headers: authHeaders(), body: form });
      const d = await r.json();
      if (r.status === 402) {
        setError(t('خلصت رصيدك المجاني (10 دقايق). محتاج تشترك عشان تكمل.', 'You\'ve used your free 10-minute budget. Please subscribe to continue.'));
        setBudget({ usedSeconds: d.usedSeconds, limitSeconds: d.limitSeconds, remainingSeconds: 0 });
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Failed to start');
      setJob(d.job);
      pollJob(d.job.id);
    } catch (e) {
      setError(e.message || t('حصل خطأ، حاول تاني', 'Something went wrong, please try again'));
    } finally {
      setStarting(false);
    }
  };

  const reset = () => { setJob(null); setFile(null); setError(''); setContinueStep(null); setEditing(false); setShowContinuePaywall(false); setPaywallSuccess(false); clearInterval(pollRef.current); };

  const pickContinueFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('audio/')) { setContinueError(t('محتاج ملف صوت', 'Please choose an audio file')); return; }
    setContinueError(''); setContinueFile(f);
  };

  const handleExtend = async () => {
    if (!continueFile || !job) return;
    setContinuing(true); setContinueError('');
    try {
      const form = new FormData();
      form.append('audio', continueFile);
      form.append('mode', continueMode);
      const r = await fetch(`/api/whiteboard-video/jobs/${job.id}/extend`, { method: 'POST', headers: authHeaders(), body: form });
      const d = await r.json();
      if (r.status === 402) {
        setContinueStep(null);
        setShowContinuePaywall(true);
        return;
      }
      if (!r.ok) throw new Error(d.error || 'Failed to extend');
      setJob(d.job);
      setContinueFile(null);
      setContinueStep(null);
      if (continueMode === 'ai') pollJob(job.id);
    } catch (e) {
      setContinueError(e.message || t('حصل خطأ، حاول تاني', 'Something went wrong, please try again'));
    } finally {
      setContinuing(false);
    }
  };

  const stepIdx = job ? STEP_ORDER.indexOf(job.status) : -1;
  // ✅ التايم لاين الاحترافي بيظهر بس بعد ما يدوس "كمّل الفيديو" صراحة (editing=true) —
  // أو تلقائي لو الحالة elements_ready (يعني لسه في نص تكملة يدوي، واضح إنه محتاج يعدّل)
  const isEditable = job && (editing || job.status === 'elements_ready');
  const isSimpleResult = job && job.status === 'done' && !editing;
  const isProcessing = job && !isEditable && !isSimpleResult && job.status !== 'failed';
  const budgetExhausted = budget && budget.remainingSeconds <= 0;
  const canContinue = budget && budget.remainingSeconds > 0;

  // ✅ FIX (طلب العميل — كرر الصورة المرجعية أكتر من مرة: "التايم لاين مش محصور في مربع،
  // بص عريض ازاي"): الصفحة كانت maxWidth:720 ثابت دايمًا (عرض مقال/نص عادي) — مناسب لمرحلة
  // الرفع والنتيجة البسيطة، لكن أداة تحرير حقيقية محتاجة تملا الشاشة عرضًا زي أي محرر فيديو
  // احترافي. العرض بقى واسع بس وإحنا في وضع التعديل (isEditable)، وضيّق زي ما كان لباقي الحالات
  const wide = isEditable;
  return (
    <div dir={dir} style={{ maxWidth: wide ? 'none' : 720, margin: '0 auto', padding: wide ? '24px 24px 60px' : '32px 16px 60px' }} className="animate-in">
      <style>{`
        @keyframes wb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        @keyframes wb-shimmer { 0% { background-position: -200px 0; } 100% { background-position: calc(200px + 100%) 0; } }
        @keyframes wb-glow { 0%,100% { box-shadow: 0 0 0 rgba(124,106,247,0); } 50% { box-shadow: 0 0 40px var(--accent-glow); } }
        @keyframes wb-pop { 0% { opacity: 0; transform: scale(0.92); } 100% { opacity: 1; transform: scale(1); } }
        .wb-hero-icon { animation: wb-float 3s ease-in-out infinite; display: inline-block; }
        .wb-dropzone { transition: all 0.25s cubic-bezier(0.16,1,0.3,1); }
        .wb-dropzone.drag { border-color: var(--accent) !important; background: var(--accent-bg) !important; transform: scale(1.01); }
        .wb-progress-track { background: var(--bg3); border-radius: 999px; height: 8px; overflow: hidden; position: relative; }
        .wb-progress-fill {
          height: 100%; border-radius: 999px;
          background: linear-gradient(90deg, var(--accent), var(--accent2), var(--accent));
          background-size: 200px 100%;
          animation: wb-shimmer 1.4s linear infinite;
          transition: width 0.6s ease;
        }
        .wb-step { display: flex; align-items: center; gap: 10px; padding: 10px 0; }
        .wb-step-dot { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; transition: all 0.3s cubic-bezier(0.16,1,0.3,1); }
        .wb-step-pop { animation: wb-pop 0.3s cubic-bezier(0.16,1,0.3,1); display: inline-block; }
        .wb-video-wrap { animation: wb-glow 2.5s ease-in-out infinite; border-radius: var(--r-xl); }
        .wb-choice-card { transition: all 0.2s cubic-bezier(0.16,1,0.3,1); cursor: pointer; text-align: center; }
        .wb-choice-card:hover { transform: translateY(-3px); border-color: var(--accent) !important; }
        .wb-choice-card.selected { border-color: var(--accent) !important; background: var(--accent-bg) !important; }
        .wb-modal-pop { animation: wb-pop 0.2s cubic-bezier(0.16,1,0.3,1); }
        .wb-paywall-pkg { transition: all 0.2s cubic-bezier(0.16,1,0.3,1); animation: wb-pop 0.35s cubic-bezier(0.16,1,0.3,1) backwards; }
        .wb-paywall-pkg:hover { transform: translateY(-4px); border-color: var(--accent) !important; box-shadow: 0 10px 28px rgba(0,0,0,0.28); }
        .wb-paywall-pkg:nth-of-type(1) { animation-delay: 0.05s; }
        .wb-paywall-pkg:nth-of-type(2) { animation-delay: 0.15s; }
        .wb-paywall-pkg:nth-of-type(3) { animation-delay: 0.25s; }
      `}</style>

      {/* Hero — مختصر أثناء التعديل (isEditable) عشان المحرر ياخد أكبر مساحة ممكنة فوق
          الصفحة، زي أي أداة تحرير حقيقية (مش صفحة تسويقية) */}
      <div style={{ textAlign: 'center', marginBottom: wide ? 14 : 28 }}>
        {!wide && (
          <div className="wb-hero-icon" style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', gap: 6, color: 'var(--accent)' }}>
            <PenLine size={34} strokeWidth={1.5} /><Sparkles size={28} strokeWidth={1.5} />
          </div>
        )}
        {!wide && (
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--text)', marginBottom: 6 }}>
            {t('فيديو Whiteboard مجاني', 'Free Whiteboard Video')}
          </div>
        )}
        {!wide && (
          <div style={{ color: 'var(--text2)', fontSize: 14.5, lineHeight: 1.7 }}>
            {t('ارفع صوت السرد بتاعك، وهنعمل لك فيديو احترافي تلقائي — مجانًا، من غير كريديت.', 'Upload your narration audio and we\'ll build a professional video automatically — free, no credits.')}
          </div>
        )}
        {budget && (
          <div className="pill" style={{ marginTop: 14, cursor: 'default', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Gift size={13} strokeWidth={2} /> {t(
              `${formatMin(budget.remainingSeconds)} متبقية من ${formatMin(budget.limitSeconds)} مجانية`,
              `${formatMin(budget.remainingSeconds)} left of ${formatMin(budget.limitSeconds)} free`
            )}
          </div>
        )}
      </div>

      {/* Exhausted budget — Task #5: a real paywall (packages + payment modals), not
          just a placeholder message */}
      {budgetExhausted && !job && (
        paywallSuccess ? (
          <div className="card animate-in" style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: 'var(--green)' }}><CheckCircle2 size={28} strokeWidth={1.75} /></div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t('تم إرسال طلب الاشتراك!', 'Subscription request sent!')}</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>
              {t('هيتم مراجعته وإضافة الكريديت خلال 24 ساعة.', 'It will be reviewed and credits added within 24 hours.')}
            </div>
          </div>
        ) : (
          <PaywallPanel lang={lang} region={region} onPick={pickPaywallPackage} />
        )
      )}

      {/* Upload (first video) */}
      {!job && !budgetExhausted && (
        <div className="animate-in">
          <div
            className={`wb-dropzone card${dragOver ? ' drag' : ''}`}
            style={{ borderStyle: 'dashed', borderWidth: 2, textAlign: 'center', padding: '40px 20px', cursor: 'pointer' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files[0]); }}
          >
            <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files[0])} />
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}>{file ? <Music size={30} strokeWidth={1.5} /> : <UploadCloud size={30} strokeWidth={1.5} />}</div>
            {file ? (
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{file.name}</div>
            ) : (
              <>
                <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  {t('اسحب ملف الصوت هنا أو دوس للاختيار', 'Drag your audio file here or click to choose')}
                </div>
                <div style={{ color: 'var(--text3)', fontSize: 12.5 }}>MP3, WAV, M4A...</div>
              </>
            )}
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 12, textAlign: 'center' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
            <button className="btn-primary" disabled={!file || starting} onClick={handleStart} style={{ minWidth: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              {starting ? <><Loader2 size={15} className="spinning" /> {t('بيبدأ...', 'Starting...')}</> : <><Sparkles size={15} strokeWidth={2} /> {t('اعمل الفيديو', 'Create Video')}</>}
            </button>
          </div>
        </div>
      )}

      {/* Processing */}
      {job && isProcessing && (
        <div className="card animate-in" style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 14, textAlign: 'center' }}>
            {STEP_LABEL[lang][job.status] || STEP_LABEL[lang].transcribing}
          </div>
          <div className="wb-progress-track">
            <div className="wb-progress-fill" style={{ width: `${Math.max(8, ((stepIdx + 1) / STEP_ORDER.length) * 100)}%` }} />
          </div>
          <div style={{ marginTop: 18 }}>
            {STEP_ORDER.slice(0, 3).map((s, i) => (
              <div key={s} className="wb-step">
                <div className="wb-step-dot" style={{
                  background: i < stepIdx ? 'var(--green)' : i === stepIdx ? 'var(--accent)' : 'var(--bg3)',
                  color: i <= stepIdx ? '#fff' : 'var(--text3)',
                  transform: i === stepIdx ? 'scale(1.1)' : 'scale(1)',
                }}>
                  <span key={i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'pending'} className="wb-step-pop">
                    {i < stepIdx ? <Check size={12} strokeWidth={2.5} /> : i === stepIdx ? <span className="spinning" style={{ display: 'inline-block' }}>◐</span> : (i + 1)}
                  </span>
                </div>
                <span style={{ fontSize: 13.5, color: i <= stepIdx ? 'var(--text)' : 'var(--text3)' }}>
                  {STEP_LABEL[lang][s]}
                </span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 12, marginTop: 14 }}>
            {t('ممكن ياخد كام دقيقة، متقفلش الصفحة...', 'This can take a few minutes, please keep this page open...')}
          </div>
        </div>
      )}

      {job && job.status === 'failed' && (
        <div className="card animate-in" style={{ marginTop: 8, textAlign: 'center' }}>
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center', color: 'var(--text3)' }}><Frown size={26} strokeWidth={1.5} /></div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('حصل خطأ في بناء الفيديو', 'Something went wrong building the video')}</div>
          <div style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>{job.error}</div>
          <button className="btn-ghost" onClick={reset}>{t('حاول تاني', 'Try again')}</button>
        </div>
      )}

      {/* ✅ نتيجة أول فيديو: شاشة بسيطة (فيديو + زرار "كمّل الفيديو" صريح) — دوس عليه عشان
          تدخل التايم لاين الاحترافي (مش تلقائي بمجرد ما الفيديو يخلص) */}
      {isSimpleResult && (
        <div className="card animate-in" style={{ marginTop: 8, textAlign: 'center' }}>
          <div className="wb-video-wrap" style={{ display: 'inline-block', maxWidth: '100%' }}>
            <video src={job.video_url} controls style={{ maxWidth: '100%', maxHeight: 480, borderRadius: 'var(--r-xl)', background: '#000' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn-primary" disabled={!canContinue} onClick={() => setEditing(true)} title={!canContinue ? t('خلص الرصيد المجاني', 'Free budget used up') : ''} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={15} strokeWidth={2.5} /> {t('كمّل الفيديو', 'Continue Video')}
            </button>
            <button className="btn-ghost" onClick={reset}>
              {t('اعمل فيديو جديد', 'Make another video')}
            </button>
          </div>
        </div>
      )}

      {/* ✅ التايم لاين الاحترافي (معاينة + شريط فيلم + "+" مدمج للتكملة) — بعد ما يدوس
          "كمّل الفيديو" فوق */}
      {job && isEditable && (
        <div className="animate-in" style={{ marginTop: 8 }}>
          <PremiumTimelineEditor
            job={job}
            onSaved={(updated) => {
              setJob(updated);
              if (updated.status === 'done') fetchBudget();
            }}
            apiBase="/api/whiteboard-video"
            authHeaders={jsonAuthHeaders()}
            lang={lang}
            onRequestExtend={() => setContinueStep('choose')}
            remainingBudgetSec={budget?.remainingSeconds ?? null}
          />
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="btn-ghost" onClick={reset}>{t('اعمل فيديو جديد', 'Make another video')}</button>
          </div>
        </div>
      )}

      {/* Continue Video hit the 402 budget-exhausted wall mid-flow — same paywall as
          the top-level one, shown as an overlay so it works from inside the editor too */}
      {showContinuePaywall && !paywallSuccess && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }} onClick={() => setShowContinuePaywall(false)}>
          <div style={{ width: 'min(640px, 100%)', margin: '24px 0' }} onClick={e => e.stopPropagation()}>
            <PaywallPanel lang={lang} region={region} onPick={pickPaywallPackage} />
          </div>
        </div>
      )}
      {showContinuePaywall && paywallSuccess && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => { setShowContinuePaywall(false); setPaywallSuccess(false); }}>
          <div className="card wb-modal-pop" style={{ width: 'min(420px, 100%)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'center', color: 'var(--green)' }}><CheckCircle2 size={28} strokeWidth={1.75} /></div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{t('تم إرسال طلب الاشتراك!', 'Subscription request sent!')}</div>
            <div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 6 }}>
              {t('هيتم مراجعته وإضافة الكريديت خلال 24 ساعة.', 'It will be reviewed and credits added within 24 hours.')}
            </div>
            <button className="btn-ghost" style={{ marginTop: 16 }} onClick={() => { setShowContinuePaywall(false); setPaywallSuccess(false); }}>{t('تمام', 'OK')}</button>
          </div>
        </div>
      )}

      {/* Continue Video: choose AI vs Manual */}
      {continueStep === 'choose' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setContinueStep(null)}>
          <div className="card wb-modal-pop" style={{ width: 'min(520px, 100%)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, textAlign: 'center' }}>
              {t('عايز تكمّل الفيديو إزاي؟', 'How do you want to continue?')}
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 12.5, textAlign: 'center', marginBottom: 18 }}>
              {t('في الحالتين هترفع صوت إضافي للجزء الجديد', 'Either way you\'ll upload extra audio for the new part')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className={`card wb-choice-card${continueMode === 'ai' ? ' selected' : ''}`} onClick={() => setContinueMode('ai')} style={{ padding: 18 }}>
                <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}><Bot size={24} strokeWidth={1.75} /></div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t('بالذكاء الاصطناعي', 'With AI')}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11.5, marginTop: 4 }}>{t('يحط الملصقات والنصوص لوحده', 'Auto-places stickers & text')}</div>
              </div>
              <div className={`card wb-choice-card${continueMode === 'manual' ? ' selected' : ''}`} onClick={() => setContinueMode('manual')} style={{ padding: 18 }}>
                <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}><PenLine size={24} strokeWidth={1.75} /></div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t('يدوي', 'Manual')}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11.5, marginTop: 4 }}>{t('تختار وتحط كل حاجة بنفسك', 'You pick and place everything yourself')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
              <button className="btn-primary" onClick={() => setContinueStep('upload')}>{t('التالي', 'Next')}</button>
              <button className="btn-ghost" onClick={() => setContinueStep(null)}>{t('إلغاء', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Continue Video: upload extra audio */}
      {continueStep === 'upload' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => !continuing && setContinueStep(null)}>
          <div className="card wb-modal-pop" style={{ width: 'min(480px, 100%)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14, textAlign: 'center' }}>
              {t('ارفع الصوت الإضافي', 'Upload the extra audio')}
            </div>
            <div
              className={`wb-dropzone card`}
              style={{ borderStyle: 'dashed', borderWidth: 2, textAlign: 'center', padding: '28px 16px', cursor: 'pointer' }}
              onClick={() => continueFileInputRef.current?.click()}
            >
              <input ref={continueFileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => pickContinueFile(e.target.files[0])} />
              <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}>{continueFile ? <Music size={24} strokeWidth={1.5} /> : <UploadCloud size={24} strokeWidth={1.5} />}</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{continueFile ? continueFile.name : t('دوس للاختيار', 'Click to choose')}</div>
            </div>
            {continueError && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>{continueError}</div>}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18 }}>
              <button className="btn-primary" disabled={!continueFile || continuing} onClick={handleExtend} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {continuing ? <><Loader2 size={14} className="spinning" /> {t('بيرفع...', 'Uploading...')}</> : t('كمّل', 'Continue')}
              </button>
              <button className="btn-ghost" disabled={continuing} onClick={() => setContinueStep(null)}>{t('إلغاء', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {paywallModal?.type === 'eg' && (
        <EgPaymentModal credits={paywallModal.credits} amountEgp={paywallModal.amountEgp}
          onClose={() => setPaywallModal(null)}
          onSuccess={() => { setPaywallModal(null); setPaywallSuccess(true); }} />
      )}
      {paywallModal?.type === 'intl' && (
        <IntlPaymentModal pkg={paywallModal.pkg}
          onClose={() => setPaywallModal(null)}
          onSuccess={() => { setPaywallModal(null); setPaywallSuccess(true); }} />
      )}
    </div>
  );
}
