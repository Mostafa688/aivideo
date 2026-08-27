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

export default function WhiteboardVideoPage({ region, onBack, onNavigate }) {
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

  const fetchBudget = useCallback(async () => {
    try {
      const r = await fetch('/api/whiteboard-video/budget', { headers: authHeaders() });
      if (r.ok) setBudget(await r.json());
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => { fetchBudget(); }, [fetchBudget]);
  useEffect(() => () => clearInterval(pollRef.current), []);

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

  const reset = () => { setJob(null); setFile(null); setError(''); setContinueStep(null); setEditing(false); clearInterval(pollRef.current); };

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
        setContinueError(t('خلصت رصيدك المجاني (10 دقايق).', 'You\'ve used your free 10-minute budget.'));
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

  return (
    <div dir={dir} style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 60px' }} className="animate-in">
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
        .wb-step-dot { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; transition: all 0.3s; }
        .wb-video-wrap { animation: wb-glow 2.5s ease-in-out infinite; border-radius: var(--r-xl); }
        .wb-choice-card { transition: all 0.2s cubic-bezier(0.16,1,0.3,1); cursor: pointer; text-align: center; }
        .wb-choice-card:hover { transform: translateY(-3px); border-color: var(--accent) !important; }
        .wb-choice-card.selected { border-color: var(--accent) !important; background: var(--accent-bg) !important; }
        .wb-modal-pop { animation: wb-pop 0.2s cubic-bezier(0.16,1,0.3,1); }
      `}</style>

      {/* Hero */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div className="wb-hero-icon" style={{ fontSize: 44, marginBottom: 10 }}>📝✨</div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, color: 'var(--text)', marginBottom: 6 }}>
          {t('فيديو Whiteboard مجاني', 'Free Whiteboard Video')}
        </div>
        <div style={{ color: 'var(--text2)', fontSize: 14.5, lineHeight: 1.7 }}>
          {t('ارفع صوت السرد بتاعك، وهنعمل لك فيديو احترافي تلقائي — مجانًا، من غير كريديت.', 'Upload your narration audio and we\'ll build a professional video automatically — free, no credits.')}
        </div>
        {budget && (
          <div className="pill" style={{ marginTop: 14, cursor: 'default' }}>
            🎁 {t(
              `${formatMin(budget.remainingSeconds)} متبقية من ${formatMin(budget.limitSeconds)} مجانية`,
              `${formatMin(budget.remainingSeconds)} left of ${formatMin(budget.limitSeconds)} free`
            )}
          </div>
        )}
      </div>

      {/* Exhausted budget */}
      {budgetExhausted && !job && (
        <div className="card animate-in" style={{ textAlign: 'center', borderColor: 'var(--accent)' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
            {t('خلصت رصيدك المجاني', 'Your free budget is used up')}
          </div>
          <div style={{ color: 'var(--text2)', fontSize: 13.5, marginBottom: 18 }}>
            {t('استخدمت 10 دقايق المجانية بالكامل. اشترك عشان تكمل تعمل فيديوهات.', 'You\'ve used the full 10 minutes of free video. Subscribe to keep creating.')}
          </div>
          <button className="btn-primary" onClick={() => onNavigate?.('pricing')}>
            {t('شوف الخطط', 'View plans')}
          </button>
        </div>
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
            <div style={{ fontSize: 36, marginBottom: 10 }}>{file ? '🎵' : '⬆️'}</div>
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
            <button className="btn-primary" disabled={!file || starting} onClick={handleStart} style={{ minWidth: 180 }}>
              {starting ? t('⏳ بيبدأ...', '⏳ Starting...') : t('✨ اعمل الفيديو', '✨ Create Video')}
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
                }}>
                  {i < stepIdx ? '✓' : i === stepIdx ? <span className="spinning" style={{ display: 'inline-block' }}>◐</span> : (i + 1)}
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
          <div style={{ fontSize: 28, marginBottom: 8 }}>😕</div>
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
            <button className="btn-primary" disabled={!canContinue} onClick={() => setEditing(true)} title={!canContinue ? t('خلص الرصيد المجاني', 'Free budget used up') : ''}>
              ➕ {t('كمّل الفيديو', 'Continue Video')}
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
                <div style={{ fontSize: 28, marginBottom: 6 }}>🤖</div>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t('بالذكاء الاصطناعي', 'With AI')}</div>
                <div style={{ color: 'var(--text3)', fontSize: 11.5, marginTop: 4 }}>{t('يحط الملصقات والنصوص لوحده', 'Auto-places stickers & text')}</div>
              </div>
              <div className={`card wb-choice-card${continueMode === 'manual' ? ' selected' : ''}`} onClick={() => setContinueMode('manual')} style={{ padding: 18 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>✍️</div>
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
              <div style={{ fontSize: 28, marginBottom: 6 }}>{continueFile ? '🎵' : '⬆️'}</div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{continueFile ? continueFile.name : t('دوس للاختيار', 'Click to choose')}</div>
            </div>
            {continueError && <div style={{ color: 'var(--red)', fontSize: 12.5, marginTop: 10, textAlign: 'center' }}>{continueError}</div>}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18 }}>
              <button className="btn-primary" disabled={!continueFile || continuing} onClick={handleExtend}>
                {continuing ? t('⏳ بيرفع...', '⏳ Uploading...') : t('كمّل', 'Continue')}
              </button>
              <button className="btn-ghost" disabled={continuing} onClick={() => setContinueStep(null)}>{t('إلغاء', 'Cancel')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
