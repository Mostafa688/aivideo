import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { downloadRemoteFile } from '../utils/download.js';
import {
  ArrowLeft, Clapperboard, FileText, Wand2, Mic, UploadCloud, Loader2, CheckCircle2,
  XCircle, Download, Package, Scissors, Pencil, Music, Captions, Palette, Volume2, Coins, TriangleAlert, RefreshCw, Film,
} from 'lucide-react';

const authHeaders = (json = true) => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: 'Bearer ' + localStorage.getItem('token') });

const T = {
  ar: {
    title: 'استوديو الأفلام الوثائقية',
    sub: 'اكتب سكريبت أو موضوع أو ارفع تعليقك الصوتي — وErivion يبني فيلم وثائقي كامل: لقطات وصور حقيقية من مصادر مفتوحة، مونتاج، مؤثرات، موسيقى، كابشن متزامن ورسوم متحركة.',
    back: 'رجوع',
    s1: 'المحتوى', s2: 'الصوت واللغة', s3: 'الستايل', s4: 'الصوت والموسيقى',
    mScript: 'سكريبت جاهز', mTopic: 'موضوع (الذكاء الاصطناعي يكتب)', mVoice: 'تعليق صوتي مرفوع',
    scriptPh: 'الصق نص الفيلم هنا. كل فقرة بتبقى فصل. الأرقام والتواريخ والأسماء في النص هتتحول لرسوم وعدادات وخطوط زمنية أوتوماتيك.',
    words: 'كلمة', approx: 'مدة تقريبية', min: 'دقيقة',
    topicPh: 'مثلاً: مشروع أبولو وهبوط الإنسان على القمر', topicLen: 'مدة الفيلم', writeScript: 'اكتب لي السكريبت أولاً', writing: 'بيكتب السكريبت...',
    topicHint: 'ممكن تسيبه يكتب ويصنع الفيلم على طول، أو تضغط "اكتب لي السكريبت" عشان تراجعه وتعدّل عليه قبل الإنتاج.',
    scriptReady: 'السكريبت جاهز — راجعه وعدّل عليه قبل الإنتاج.',
    dirtyBanner: 'السكريبت فيه أوقات أو تقسيمات أو تعليمات (مشاهد، موسيقى، لقطات...).', cleanBtn: 'نظّفه بالذكاء الاصطناعي', cleaning: 'بيراجع السكريبت...',
    cleanedNote: 'اتنضّف: بقى نص التسجيل الصافي بس.', cleanNoChange: 'السكريبت أصلاً صافي.', undo: 'تراجع',
    trialChip: 'أول دقيقة مجانية', trialBanner: 'أول فيلم عندك مجاني! ارفع تعليقك الصوتي (لحد دقيقة) وErivion يبني الفيلم عليه من غير أي كريديت، وعليه علامة Erivion المائية. مرة واحدة لكل حساب.', trialTooLong: 'صوتك أطول من دقيقة، فالفيلم هيتحسب بالكريديت العادي.', free: 'مجاني',
    voiceHint: 'ارفع ملف صوتي (mp3 / wav / m4a) من 20 ثانية لحد 30 دقيقة. Erivion هيفرّغه ويطابق اللقطات مع كلامك بالظبط.',
    chooseFile: 'اختر ملف صوتي', fileDur: 'مدة الملف',
    language: 'لغة الفيلم', voice: 'صوت الراوي', voiceOwn: 'هتستخدم صوتك — مفيش حاجة تختارها هنا.',
    verticalNote: 'الفيلم الطولي (9:16) لحد 3 دقائق، وبكابشن كبير في النص كلمة كلمة.', verticalTooLong: 'الفيلم الطولي (9:16) أقصى مدة له 3 دقائق — قصّر الفيلم أو اختار 16:9.',
    theme: 'ستايل الفيلم', ratio: 'الأبعاد', r169: '16:9 (يوتيوب)', r916: '9:16 (شورتس / ريلز)',
    captions: 'الكابشن', cKaraoke: 'كاريوكي (الكلمة بتنوّر)', cBox: 'صندوق', cPop: 'بوب', cNone: 'بدون',
    motion: 'رسوم متحركة (عدادات، رسوم بيانية، خطوط زمنية، اقتباسات)',
    sources: 'مصادر اللقطات', srcAll: 'كل المصادر (Pexels, NASA, Wikimedia, Internet Archive)', srcStock: 'Stock فقط (Pexels)',
    music: 'موسيقى خلفية', mood: 'الجو العام', auto: 'تلقائي', track: 'مقطع محدد',
    sum: 'ملخص', sumMin: 'مدة الفيلم', sumCost: 'التكلفة', sumBal: 'رصيدك', credits: 'كريديت',
    start: 'ابدأ إنتاج الفيلم', starting: 'بيبدأ...',
    lowBal: 'رصيدك مش كفاية — محتاج', topUp: 'اشحن رصيد',
    refundNote: 'لو الفيلم طلع أقصر من المتوقع بنرجّعلك الفرق، ولو فشل بنرجّع الكريديت كامل.',
    attribution: 'الفيلم بيستخدم لقطات من مصادر مفتوحة الترخيص؛ هنكتبلك أسماء المصادر المطلوبة لتضعها في وصف الفيديو.',
    progress: 'بيتم إنتاج الفيلم', queued: 'في الطابور', pos: 'ترتيبك',
    stages: { queued: 'في الطابور', script: 'كتابة السكريبت', narration: 'تسجيل التعليق الصوتي', transcribe: 'تفريغ الصوت', cut: 'قص الصمت وتركيب اللقطات', finish: 'انتقالات وكابشن وموسيقى', plan: 'تخطيط المشاهد', assets: 'جلب اللقطات والصور', render: 'مونتاج ورسم وموسيقى', upload: 'رفع الفيلم', done: 'جاهز' },
    keepOpen: 'تقدر تقفل الصفحة — الفيلم هيفضل ظاهر في "أفلامي" تحت.',
    done: 'الفيلم جاهز!', download: 'تنزيل الفيلم', another: 'اعمل فيلم تاني', scriptOut: 'السكريبت', creditsOut: 'المصادر والتراخيص (حطها في وصف الفيديو)', copy: 'نسخ',
    failed: 'فشل الإنتاج', refunded: 'اترجّع لك الكريديت كامل.', retry: 'حاول تاني',
    myFilms: 'أفلامي', none: 'مفيش أفلام لسه.', open: 'فتح',
    errGeneric: 'حصلت مشكلة. جرّب تاني.',
    edBtn: 'تعديل المشاهد', edHint: 'غيّر أي لقطة مش عاجباك بلقطة تانية من نتائج البحث، أو ارفع لقطتك أنت. التعديل بيتطبق في ثواني من غير ما الفيلم كله يتعاد.',
    edChange: 'غيّر', edSearchPh: 'ابحث بكلمات تانية (اختياري)', edSearch: 'بحث', edUpload: 'ارفع لقطتك (صورة أو فيديو)', edPicked: 'اتختار بديل', edNoCand: 'مفيش نتائج — جرّب كلمات تانية.',
    edApply: 'طبّق التعديلات', edCost: 'التكلفة', edApplying: 'بيطبّق التعديلات...', edExpired: 'انتهت مدة التعديل لهذا الفيلم (30 يوم من الإنتاج).', edTooLong: 'التعديل متاح للأفلام لحد 12 دقيقة.',
    edClose: 'إغلاق', edClear: 'إلغاء', edScene: 'المشهد', edDone: 'اتطبّق!', edKinds: { video: 'فيديو', image: 'صورة', background: 'نص / رسم', board: 'لوحة' }, edLocked: 'بالرسوم/النص (مش بيتغيّر)',
    kDoc: 'فيلم وثائقي', kEdit: 'مونتاج فيديو بتاعي',
    eTitle: 'ارفع فيديو بيتكلم فيه شخص (فلوج، شرح، تسجيل شاشة) وErivion يعمله مونتاج احترافي لوحده',
    eBullets: ['قص الصمت والتلعثم (jump cuts)', 'زوم ديناميكي بيتبدّل بين اللقطات', 'انتقالات ومؤثرات صوتية بين الفقرات', 'كابشن متزامن مع الكلمات (في النص بحركة للقصير، وتحت للطويل)', 'موسيقى بتهدّى تحت صوتك + توحيد مستوى الصوت'],
    eUpload: 'اختر فيديو (لحد 20 دقيقة / 600 ميجا)', eFile: 'الفيديو', eDur: 'المدة', eLang: 'لغة الكلام في الفيديو', eOpts: 'اللي هيتعمل',
    eCut: 'قص الصمت', eZoom: 'زوم ديناميكي', eTrans: 'انتقالات بين الفقرات', eMusic: 'موسيقى خلفية', eStart: 'ابدأ المونتاج', eNoAudio: 'الفيديو ده مفيهوش صوت.',
    eNote: 'التكلفة بتتحسب على مدة الفيديو الأصلي.', eUnknownDur: 'مقدرناش نقرا مدة الفيديو في المتصفح، بس تقدر تكمّل — التكلفة هتتحسب بعد الرفع.',
    rightsNote: 'تنبيه حقوق: بنختار اللقطات من مصادر مجانية ومرخّصة (Pexels وPixabay وNASA وWikimedia وInternet Archive) لكن مش بنضمن 100% إنها خالية من حقوق الغير. راجع الفيلم قبل النشر، وانسخ الـcredits في وصف الفيديو لأن بعض التراخيص بتطلب ذكر المصدر. المسؤولية على الناشر (راجع الشروط، البند 16).',
    pkgBtn: 'جهّز حزمة النشر على يوتيوب', pkgBuilding: 'بيجهّز العنوان والوصف والصورة...', pkgTitle: 'العنوان', pkgDesc: 'الوصف (فيه الفصول والمصادر)', pkgTags: 'الكلمات المفتاحية', pkgThumb: 'الصورة المصغرة', pkgThumbDl: 'تنزيل الصورة', pkgSrt: 'تنزيل ملف الترجمة SRT', pkgRegen: 'جهّز تاني',
    tooShort: 'الفيلم هيطلع أقل من 25 ثانية — زوّد النص شوية.',
    errs: { script_too_short: 'السكريبت قصير جدًا — اكتب فقرتين على الأقل.', script_too_long: 'السكريبت طويل جدًا.', too_long_vertical: 'الفيلم الطولي (9:16) أقصى مدة له 3 دقائق.', too_short: 'الفيلم هيطلع أقل من 25 ثانية — زوّد النص شوية.', too_long: 'الحد الأقصى 30 دقيقة.', topic_required: 'اكتب الموضوع أولاً.', audio_required: 'ارفع الملف الصوتي أولاً.', bad_audio: 'الملف الصوتي مش صالح أو أقصر من 20 ثانية.', quota_exceeded: 'رصيدك مش كفاية لإنتاج الفيلم.', content_policy_violation: 'المحتوى ده مش مسموح بيه.', rate_limited: 'وصلت للحد الأقصى من توليد السكريبتات في الساعة.', video_required: 'اختر فيديو الأول.', bad_video: 'الملف ده مش فيديو صالح أو أقصر من 5 ثواني.', no_audio: 'الفيديو ده مفيهوش صوت.', file_too_large: 'الفيديو أكبر من 600 ميجا.', upload_failed: 'فشل الرفع، جرّب تاني.' },
    copied: 'اتنسخ',
  },
  en: {
    title: 'Documentary Studio',
    sub: 'Write a script, give a topic, or upload your own voiceover — Erivion builds a full documentary: real footage and photos from open archives, montage, sound effects, music, word-synced captions and motion graphics.',
    back: 'Back',
    s1: 'Content', s2: 'Voice & language', s3: 'Style', s4: 'Sound & music',
    mScript: 'My script', mTopic: 'A topic (AI writes it)', mVoice: 'Upload voiceover',
    scriptPh: 'Paste your film script here. Each paragraph becomes a chapter. Numbers, dates and names in the text turn into counters, charts and timelines automatically.',
    words: 'words', approx: 'About', min: 'min',
    topicPh: 'e.g. The Apollo program and the first Moon landing', topicLen: 'Film length', writeScript: 'Write the script first', writing: 'Writing the script...',
    topicHint: 'Skip ahead and let it write and produce in one go — or write the script first so you can review and edit it.',
    scriptReady: 'Script ready — review and edit it before producing.',
    dirtyBanner: 'The script has timestamps, scene breaks or directions (scenes, music, shots...).', cleanBtn: 'Clean it with AI', cleaning: 'Reviewing the script...',
    cleanedNote: 'Cleaned: only the narration text is left.', cleanNoChange: 'The script is already clean.', undo: 'Undo',
    trialChip: 'First minute free', trialBanner: 'Your first film is free! Upload your own voiceover (up to one minute) and Erivion builds the film on it with no credits, with a small Erivion watermark. Once per account.', trialTooLong: 'Your audio is longer than a minute, so this film is billed in normal credits.', free: 'Free',
    voiceHint: 'Upload an audio file (mp3 / wav / m4a), 20 seconds to 30 minutes. Erivion transcribes it and matches footage to what you say.',
    chooseFile: 'Choose audio file', fileDur: 'File length',
    language: 'Film language', voice: 'Narrator voice', voiceOwn: 'Your own voice is used — nothing to pick here.',
    verticalNote: 'Vertical (9:16) films run up to 3 minutes, with big centered word-by-word captions.', verticalTooLong: 'Vertical (9:16) films can be up to 3 minutes — shorten the film or choose 16:9.',
    theme: 'Film style', ratio: 'Aspect ratio', r169: '16:9 (YouTube)', r916: '9:16 (Shorts / Reels)',
    captions: 'Captions', cKaraoke: 'Karaoke (word highlight)', cBox: 'Box', cPop: 'Pop', cNone: 'None',
    motion: 'Motion graphics (counters, charts, timelines, quotes)',
    sources: 'Footage sources', srcAll: 'All sources (Pexels, NASA, Wikimedia, Internet Archive)', srcStock: 'Stock only (Pexels)',
    music: 'Background music', mood: 'Mood', auto: 'Auto', track: 'Specific track',
    sum: 'Summary', sumMin: 'Film length', sumCost: 'Cost', sumBal: 'Your balance', credits: 'credits',
    start: 'Produce the documentary', starting: 'Starting...',
    lowBal: "You don't have enough credits — need", topUp: 'Top up',
    refundNote: 'If the film comes out shorter than estimated we refund the difference; if it fails you get a full refund.',
    attribution: 'Footage comes from openly-licensed archives; the source credits you need to paste in your video description are listed when the film is done.',
    progress: 'Producing your documentary', queued: 'Queued', pos: 'Position',
    stages: { queued: 'Queued', script: 'Writing the script', narration: 'Recording the narration', transcribe: 'Transcribing audio', cut: 'Cutting silence and zooming', finish: 'Transitions, captions and music', plan: 'Planning scenes', assets: 'Finding footage and photos', render: 'Editing, animating and mixing', upload: 'Uploading', done: 'Done' },
    keepOpen: 'You can close this page — the film stays in "My films" below.',
    done: 'Your film is ready!', download: 'Download film', another: 'Make another', scriptOut: 'Script', creditsOut: 'Sources & licenses (paste in your video description)', copy: 'Copy',
    failed: 'Production failed', refunded: 'Your credits were fully refunded.', retry: 'Try again',
    myFilms: 'My films', none: 'No films yet.', open: 'Open',
    errGeneric: 'Something went wrong. Please try again.',
    edBtn: 'Edit scenes', edHint: 'Replace any shot you don\'t like with another from the search results, or upload your own. Edits apply in seconds — the whole film is not re-rendered.',
    edChange: 'Change', edSearchPh: 'Search with other words (optional)', edSearch: 'Search', edUpload: 'Upload your own (image or video)', edPicked: 'Replacement chosen', edNoCand: 'No results — try other words.',
    edApply: 'Apply edits', edCost: 'Cost', edApplying: 'Applying your edits...', edExpired: 'The editing window for this film has ended (30 days after production).', edTooLong: 'Editing is available for films up to 12 minutes.',
    edClose: 'Close', edClear: 'Cancel', edScene: 'Scene', edDone: 'Applied!', edKinds: { video: 'Video', image: 'Image', background: 'Text / graphic', board: 'Board' }, edLocked: 'Graphic/text scene (not replaceable)',
    kDoc: 'Documentary', kEdit: 'Edit my video',
    eTitle: 'Upload a video with someone talking (vlog, tutorial, screen recording) and Erivion edits it professionally on its own',
    eBullets: ['Cuts silences and dead air (jump cuts)', 'Dynamic zooms that alternate between shots', 'Transitions and sound effects between parts', 'Word-synced captions (centered with motion for short videos, at the bottom for long ones)', 'Music that ducks under your voice + loudness normalisation'],
    eUpload: 'Choose a video (up to 20 minutes / 600 MB)', eFile: 'Video', eDur: 'Length', eLang: 'Spoken language', eOpts: 'What it does',
    eCut: 'Cut silences', eZoom: 'Dynamic zoom', eTrans: 'Transitions between parts', eMusic: 'Background music', eStart: 'Start editing', eNoAudio: 'This video has no audio.',
    eNote: 'Billed on the length of the original video.', eUnknownDur: "We couldn't read the length in your browser, but you can continue — the cost is calculated after upload.",
    rightsNote: 'Rights notice: footage comes from free, licensed sources (Pexels, Pixabay, NASA, Wikimedia, Internet Archive), but we cannot guarantee 100% that it is free of third-party rights. Review the film before publishing and paste the credits into your video description — some licenses require attribution. The publisher is responsible (see the Terms, Section 16).',
    pkgBtn: 'Prepare the YouTube upload package', pkgBuilding: 'Preparing title, description and thumbnail...', pkgTitle: 'Title', pkgDesc: 'Description (with chapters and credits)', pkgTags: 'Tags', pkgThumb: 'Thumbnail', pkgThumbDl: 'Download thumbnail', pkgSrt: 'Download SRT subtitles', pkgRegen: 'Regenerate',
    tooShort: 'The film would be under 25 seconds — add more text.',
    errs: { script_too_short: 'The script is too short — write at least two paragraphs.', script_too_long: 'The script is too long.', too_short: 'The film would be under 25 seconds — add more text.', too_long: 'The maximum length is 30 minutes.', too_long_vertical: 'Vertical (9:16) films can be up to 3 minutes.', topic_required: 'Enter a topic first.', audio_required: 'Upload your voiceover first.', bad_audio: 'The audio file is invalid or shorter than 20 seconds.', quota_exceeded: "You don't have enough credits for this film.", content_policy_violation: 'This content is not allowed.', rate_limited: 'You reached the hourly limit for script generation.', video_required: 'Choose a video first.', bad_video: 'This file is not a readable video or is shorter than 5 seconds.', no_audio: 'This video has no audio.', file_too_large: 'The video is larger than 600 MB.', upload_failed: 'Upload failed, please try again.' },
    copied: 'Copied',
  },
};

const fmtMin = (m) => (m < 1 ? `${Math.round(m * 60)}s` : `${m.toFixed(1).replace(/\.0$/, '')} min`);
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;


// حزمة النشر: عنوان + وصف (فيه فصول ومصادر) + كلمات + صورة مصغرة + ملف ترجمة
function PackagePanel({ job, t }) {
  const [pkg, setPkg] = useState(job.package || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const build = async (refresh = false) => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/documentary/jobs/${job.id}/package`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ refresh }) });
      const j = await r.json();
      if (!r.ok) throw new Error(t.errs[j.error] || t.errGeneric);
      setPkg(j);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const copy = async (key, text) => { try { await navigator.clipboard.writeText(text); setCopiedKey(key); setTimeout(() => setCopiedKey(''), 1500); } catch { /* ignore */ } };
  const downloadSrt = async () => {
    try {
      const r = await fetch(`/api/documentary/jobs/${job.id}/srt`, { headers: authHeaders(false) });
      if (!r.ok) return;
      const blob = await r.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `documentary_${job.id}.srt`; a.click(); URL.revokeObjectURL(a.href);
    } catch { /* ignore */ }
  };
  if (!pkg) {
    return (
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => build(false)} style={{ borderRadius: 'var(--r-md)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {busy ? <Loader2 size={15} className="doc-spin" /> : <Package size={15} />}{busy ? t.pkgBuilding : t.pkgBtn}
        </button>
        {job.hasSrt && <button type="button" className="btn-ghost" onClick={downloadSrt} style={{ borderRadius: 'var(--r-md)' }}>{t.pkgSrt}</button>}
        {err && <span style={{ color: 'var(--red)', fontSize: 13 }}>{err}</span>}
        <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7, flexBasis: '100%' }}>{t.rightsNote}</div>
      </div>
    );
  }
  const row = (key, label, value, mono) => (
    <div>
      <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <button type="button" className="btn-ghost" style={{ padding: '2px 10px', fontSize: 12, borderRadius: 8 }} onClick={() => copy(key, value)}>{copiedKey === key ? t.copied : t.copy}</button>
      </div>
      <pre style={{ ...fieldStyle, whiteSpace: 'pre-wrap', margin: 0, maxHeight: key === 'desc' ? 240 : 120, overflow: 'auto', fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</pre>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      {pkg.thumbnailUrl && (
        <div>
          <div style={labelStyle}>{t.pkgThumb}</div>
          <img src={pkg.thumbnailUrl} alt="" style={{ width: '100%', maxWidth: 480, borderRadius: 'var(--r-md)', display: 'block' }} />
          <button type="button" className="btn-ghost" onClick={() => downloadRemoteFile(pkg.thumbnailUrl, `thumbnail_${job.id}.jpg`)} style={{ marginTop: 8, borderRadius: 8, fontSize: 13 }}>{t.pkgThumbDl}</button>
        </div>
      )}
      {row('title', t.pkgTitle, pkg.title)}
      {row('desc', t.pkgDesc, pkg.description)}
      {row('tags', t.pkgTags, (pkg.tags || []).join(', '))}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {job.hasSrt && <button type="button" className="btn-ghost" onClick={downloadSrt} style={{ borderRadius: 'var(--r-md)' }}>{t.pkgSrt}</button>}
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => build(true)} style={{ borderRadius: 'var(--r-md)' }}>{busy ? <Loader2 size={14} className="doc-spin" /> : t.pkgRegen}</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>{t.rightsNote}</div>
    </div>
  );
}


// مونتاج تلقائي لفيديو العميل: رفع + خيارات + ملخص التكلفة، وبعد البدء بيكمل في نفس شاشة التقدّم
function AutoEditForm({ t, opts, dir, onStarted, onBalance }) {
  const [file, setFile] = useState(null);
  const [dur, setDur] = useState(0);
  const [language, setLanguage] = useState(dir === 'rtl' ? 'ar' : 'en');
  const [captions, setCaptions] = useState('karaoke');
  const [cutSilence, setCutSilence] = useState(true);
  const [zoom, setZoom] = useState(true);
  const [transitions, setTransitions] = useState(true);
  const [music, setMusic] = useState(false);
  const [mood, setMood] = useState('');
  const [est, setEst] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [metaFailed, setMetaFailed] = useState(false);
  const fileRef = useRef(null);
  const pick = (f) => {
    setFile(f); setDur(0); setEst(null); setError(''); setMetaFailed(false);
    if (!f) return;
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { setDur(Number.isFinite(v.duration) ? v.duration : 0); URL.revokeObjectURL(url); };
    // المتصفح مقدرش يقرا مدة الفيديو (كودك مش مدعوم مثلاً HEVC) — مش مشكلة: السيرفر هو اللي بيقيس ويحسب التكلفة
    v.onerror = () => { URL.revokeObjectURL(url); setMetaFailed(true); };
    v.src = url;
  };
  useEffect(() => {
    if (!dur) return undefined;
    let alive = true;
    (async () => {
      try {
        const r = await fetch('/api/documentary/autoedit/estimate', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ durationSec: dur }) });
        if (r.ok && alive) { const j = await r.json(); setEst(j); onBalance?.(j.balance); }
      } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, [dur]);
  const tooLong = dur > opts.limits.maxMinutes * 60 + 5 && dur > 20 * 60;
  const short = est && est.balance != null && est.balance < est.cost;
  const start = async () => {
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('video', file);
      Object.entries({ language, captions, cutSilence, zoom, transitions, music, musicMood: mood }).forEach(([k, v]) => { if (v !== '' && v !== undefined) fd.append(k, String(v)); });
      const res = await fetch('/api/documentary/autoedit', { method: 'POST', headers: authHeaders(false), body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(t.errs[j.error] || t.errGeneric);
      onStarted({ id: j.jobId, status: 'queued', stage: 'queued', progress: 0, queuePosition: j.queuePosition || 0, creditsCharged: j.cost });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  return (
    <div className="doc-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Section icon={Scissors} title={t.kEdit}>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>{t.eTitle}</p>
          <ul style={{ margin: 0, paddingInlineStart: 20, color: 'var(--text2)', fontSize: 13.5, lineHeight: 1.9 }}>{t.eBullets.map((b) => <li key={b}>{b}</li>)}</ul>
          <input ref={fileRef} type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" hidden onChange={(e) => pick(e.target.files?.[0] || null)} />
          <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} style={{ borderRadius: 'var(--r-md)', padding: '18px 14px', borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <UploadCloud size={18} />{file ? file.name : t.eUpload}
          </button>
          {file && dur > 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t.eDur}: {fmt(dur)}</div>}
          {file && metaFailed && <div style={{ fontSize: 13, color: 'var(--text3)' }}>{t.eUnknownDur}</div>}
        </Section>
        <Section icon={Wand2} title={t.eOpts}>
          <div>
            <label style={labelStyle} htmlFor="ae-lang">{t.eLang}</label>
            <select id="ae-lang" value={language} onChange={(e) => setLanguage(e.target.value)} style={fieldStyle}>
              {Object.entries(opts.languages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Toggle on={cutSilence} onChange={setCutSilence} label={t.eCut} />
            <Toggle on={zoom} onChange={setZoom} label={t.eZoom} />
            <Toggle on={transitions} onChange={setTransitions} label={t.eTrans} />
          </div>
          <div>
            <span style={labelStyle}><Captions size={13} style={{ verticalAlign: -2 }} /> {t.captions}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['karaoke', t.cKaraoke], ['box', t.cBox], ['pop', t.cPop], ['none', t.cNone]].map(([k, l]) => <Chip key={k} active={captions === k} onClick={() => setCaptions(k)}>{l}</Chip>)}
            </div>
          </div>
          <Toggle on={music} onChange={setMusic} label={t.eMusic} />
          {music && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Chip active={!mood} onClick={() => setMood('')}>{t.auto}</Chip>
              {opts.moods.map((m) => <Chip key={m} active={mood === m} onClick={() => setMood(m)}>{m}</Chip>)}
            </div>
          )}
        </Section>
      </div>
      <aside className="doc-side">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontSize: 16 }}><Coins size={17} color="var(--accent2)" />{t.sum}</h3>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 14 }}>
            <dt style={{ color: 'var(--text2)' }}>{t.eDur}</dt>
            <dd style={{ margin: 0, textAlign: dir === 'rtl' ? 'left' : 'right' }}>{dur ? fmt(dur) : '—'}</dd>
            <dt style={{ color: 'var(--text2)' }}>{t.sumCost}</dt>
            <dd style={{ margin: 0, textAlign: dir === 'rtl' ? 'left' : 'right', fontWeight: 700 }}>{est ? `${est.cost} ${t.credits}` : '—'}</dd>
            <dt style={{ color: 'var(--text2)' }}>{t.sumBal}</dt>
            <dd style={{ margin: 0, textAlign: dir === 'rtl' ? 'left' : 'right' }}>{est?.balance != null ? `${est.balance} ${t.credits}` : (opts.balance != null ? `${opts.balance} ${t.credits}` : '—')}</dd>
          </dl>
          {short && <div style={{ background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 13 }}><TriangleAlert size={14} style={{ verticalAlign: -2 }} /> {t.lowBal} {est.cost - est.balance} {t.credits}</div>}
          {error && <div role="alert" style={{ background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 13 }}>{error}</div>}
          <button type="button" className="btn-primary" disabled={!file || !(dur || metaFailed) || busy || short || tooLong} onClick={start} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {busy ? <Loader2 size={16} className="doc-spin" /> : <Scissors size={16} />}{busy ? t.starting : t.eStart}
          </button>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>{t.eNote} {t.refundNote}</p>
        </div>
      </aside>
    </div>
  );
}


// محرر المشاهد: شبكة مشاهد (صورة مصغّرة + نص)، بدائل من البحث أو رفع لقطة، وتطبيق في ثواني
function EditorPanel({ job, t, onJobUpdate }) {
  const [view, setView] = useState(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState({}); // i → { kind:'candidate'|'upload', id, thumb, title }
  const [modal, setModal] = useState(null);   // { i, query, cands, loading }
  const [applying, setApplying] = useState(!!job.editing);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const pollRef = useRef(null);
  const loadView = useCallback(async () => {
    try { const r = await fetch(`/api/documentary/jobs/${job.id}/editor`, { headers: authHeaders() }); if (r.ok) setView(await r.json()); } catch { /* ignore */ }
  }, [job.id]);
  useEffect(() => { if (open && !view) loadView(); }, [open]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  const waitForEdit = () => {
    setApplying(true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/documentary/jobs/${job.id}`, { headers: authHeaders() });
        if (!r.ok) return;
        const j = await r.json();
        if (!j.editing) {
          clearInterval(pollRef.current); pollRef.current = null;
          setApplying(false); setPending({});
          if (j.editError) setErr(j.editError); else setMsg(t.edDone);
          onJobUpdate(j); loadView();
        }
      } catch { /* retry */ }
    }, 2000);
  };
  useEffect(() => { if (job.editing) waitForEdit(); }, []);
  const search = async (i, query = '') => {
    setModal({ i, query, cands: [], loading: true });
    try {
      const r = await fetch(`/api/documentary/jobs/${job.id}/editor/search`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ i, query }) });
      const j = await r.json();
      if (!r.ok) throw new Error(t.errs[j.error] || t.errGeneric);
      setModal({ i, query, cands: j.candidates || [], loading: false });
    } catch (e) { setErr(e.message); setModal(null); }
  };
  const upload = async (i, f) => {
    if (!f) return;
    setErr('');
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('i', String(i));
      const r = await fetch(`/api/documentary/jobs/${job.id}/editor/upload`, { method: 'POST', headers: authHeaders(false), body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message || t.errGeneric);
      setPending((p) => ({ ...p, [i]: { kind: 'upload', id: j.uploadId, thumb: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, title: f.name } }));
      setModal(null);
    } catch (e) { setErr(e.message); }
  };
  const apply = async () => {
    setErr(''); setMsg('');
    const changes = Object.entries(pending).map(([i, c]) => (c.kind === 'upload' ? { i: Number(i), uploadId: c.id } : { i: Number(i), candidateId: c.id }));
    try {
      const r = await fetch(`/api/documentary/jobs/${job.id}/editor/apply`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ changes }) });
      const j = await r.json();
      if (!r.ok) throw new Error(t.errs[j.error] || j.message || t.errGeneric);
      waitForEdit();
    } catch (e) { setErr(e.message); }
  };
  if (!job.editorAvailable) return null;
  if (!open) return <div><button type="button" className="btn-ghost" onClick={() => setOpen(true)} style={{ borderRadius: 'var(--r-md)', display: 'inline-flex', alignItems: 'center', gap: 8 }}><Pencil size={15} />{t.edBtn}</button></div>;
  const n = Object.keys(pending).length;
  const sp = view?.sprite;
  const scale = 1.25;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 15 }}>{t.edBtn}</h4>
        <button type="button" className="btn-ghost" style={{ padding: '2px 10px', fontSize: 12, borderRadius: 8 }} onClick={() => setOpen(false)}>{t.edClose}</button>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{t.edHint}</p>
      {view && !view.available && <div style={{ color: 'var(--yellow)', fontSize: 13 }}>{view.reason === 'expired' ? t.edExpired : view.reason === 'too_long' ? t.edTooLong : t.errGeneric}</div>}
      {applying && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent3)', fontSize: 14 }}><Loader2 size={16} className="doc-spin" />{t.edApplying}</div>}
      {msg && <div style={{ color: 'var(--green)', fontSize: 14 }}>{msg}</div>}
      {err && <div role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
      {view?.available && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflow: 'auto', opacity: applying ? 0.5 : 1, pointerEvents: applying ? 'none' : 'auto' }}>
          {view.beats.map((b) => {
            const pw = sp ? sp.tw * scale : 0, ph = sp ? sp.th * scale : 0;
            const pick = pending[b.i];
            return (
              <div key={b.i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 8, border: '1px solid ' + (pick ? 'var(--accent)' : 'var(--border)'), borderRadius: 'var(--r-md)', background: pick ? 'var(--accent-bg)' : 'transparent' }}>
                <div style={{ width: pw, height: ph, flexShrink: 0, borderRadius: 6, background: '#111', backgroundImage: sp ? `url(${sp.url})` : undefined, backgroundSize: sp ? `${sp.cols * pw}px auto` : undefined, backgroundPosition: sp ? `-${(b.i % sp.cols) * pw}px -${Math.floor(b.i / sp.cols) * ph}px` : undefined }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t.edScene} {b.i + 1} · {fmtDur(b.start)} · {t.edKinds[b.kind] || b.kind}{b.title ? ` · ${b.title}` : ''}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{b.text}</div>
                  {pick && <div style={{ fontSize: 12, color: 'var(--accent3)', marginTop: 2 }}>✓ {t.edPicked}: {pick.title}</div>}
                </div>
                {b.swappable ? (
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {pick && <button type="button" className="btn-ghost" style={{ padding: '3px 10px', fontSize: 12, borderRadius: 8 }} onClick={() => setPending((p) => { const c = { ...p }; delete c[b.i]; return c; })}>{t.edClear}</button>}
                    <button type="button" className="btn-ghost" style={{ padding: '3px 12px', fontSize: 12.5, borderRadius: 8 }} onClick={() => search(b.i)}>{t.edChange}</button>
                  </div>
                ) : <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, maxWidth: 90, textAlign: 'center' }}>{t.edLocked}</span>}
              </div>
            );
          })}
        </div>
      )}
      {n > 0 && !applying && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" onClick={apply} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Wand2 size={15} />{t.edApply} ({n})</button>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.edCost}: {view?.cost ?? 2} {t.credits}</span>
        </div>
      )}
      {modal && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setModal(null)}>
          <div className="card" style={{ maxWidth: 820, width: '100%', maxHeight: '88vh', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{t.edScene} {modal.i + 1}</strong>
              <button type="button" className="btn-ghost" style={{ padding: '2px 10px', fontSize: 12, borderRadius: 8 }} onClick={() => setModal(null)}>{t.edClose}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={modal.query} onChange={(e) => setModal({ ...modal, query: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') search(modal.i, modal.query); }} placeholder={t.edSearchPh} style={{ ...fieldStyle, flex: 1, minWidth: 200 }} maxLength={100} />
              <button type="button" className="btn-ghost" onClick={() => search(modal.i, modal.query)} style={{ borderRadius: 'var(--r-md)' }}>{t.edSearch}</button>
              <label className="btn-ghost" style={{ borderRadius: 'var(--r-md)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}>
                <UploadCloud size={15} />{t.edUpload}
                <input type="file" accept="image/*,video/*" hidden onChange={(e) => upload(modal.i, e.target.files?.[0])} />
              </label>
            </div>
            {modal.loading ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} className="doc-spin" />...</div>
              : modal.cands.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>{t.edNoCand}</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
                    {modal.cands.map((c) => (
                      <button type="button" key={c.id} onClick={() => { setPending((p) => ({ ...p, [modal.i]: { kind: 'candidate', id: c.id, thumb: c.thumb, title: c.title || c.source } })); setModal(null); }}
                        style={{ padding: 0, border: '1px solid var(--border2)', borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--bg3)', cursor: 'pointer', textAlign: 'start' }}>
                        <div style={{ height: 90, background: '#111', backgroundImage: c.thumb ? `url(${c.thumb})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                          <span style={{ position: 'absolute', top: 4, insetInlineStart: 4, background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 10.5, padding: '1px 6px', borderRadius: 4 }}>{c.kind === 'video' ? '▶' : '🖼'} {c.source}</span>
                        </div>
                        <div style={{ padding: '6px 8px', fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5, height: 36, overflow: 'hidden' }}>{c.title}</div>
                      </button>
                    ))}
                  </div>
                )}
          </div>
        </div>
      )}
    </div>
  );
}

// نفس فكرة الكشف في السيرفر (scriptCleaner.looksDirty) — بتظهر البانر وتشغّل التنضيف تلقائي عند اللصق
function looksDirtyClient(text) {
  const t = String(text || '');
  return /(^|[\s\[(])\d{1,2}:\d{2}(:\d{2})?\s*(-|–|—|to)\s*\d{1,2}:\d{2}/.test(t) || /[\[(【]\s*\d{1,2}:\d{2}/.test(t) || /^[ \t]*\d{1,2}:\d{2}/m.test(t)
    || /^\s{0,3}#{1,6}\s/m.test(t) || /\[[^\]\n]{1,200}\]/.test(t) || /\*\*[^*\n]+\*\*/.test(t)
    || /^[ \t]*[\[(*_]*(scene|shot|part|section|chapter|مشهد|المشهد|الفصل|الجزء)\s*\d+/im.test(t)
    || /^[ \t]*(narrator|voice[- ]?over|الراوي|المعلق)\s*[:：]/im.test(t) || /^[ \t]*(visuals?|audio|music|sfx|b-?roll|المرئيات|الصوت|الموسيقى)\s*[:：]/im.test(t);
}

function Section({ icon: Icon, title, children }) {
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700 }}>
        <Icon size={17} color="var(--accent2)" />{title}
      </h3>
      {children}
    </section>
  );
}

const fieldStyle = { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 'var(--r-md)', color: 'var(--text)', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit' };
const labelStyle = { fontSize: 12, color: 'var(--text2)', fontWeight: 600, marginBottom: 6, display: 'block' };

function Chip({ active, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      style={{
        padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border2)'),
        background: active ? 'var(--accent-bg)' : 'transparent', color: active ? 'var(--accent3)' : 'var(--text2)', opacity: disabled ? 0.5 : 1,
      }}>{children}</button>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
      {label}
    </label>
  );
}

export default function DocumentaryPage({ onBack, onNavigate }) {
  const lang = (localStorage.getItem('erivion_region') || 'eg') === 'eg' ? 'ar' : 'en';
  const [uiLang] = useState(lang);
  const t = T[uiLang];
  const dir = uiLang === 'ar' ? 'rtl' : 'ltr';

  const [opts, setOpts] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [mode, setMode] = useState('script');
  const [kind, setKind] = useState('doc');
  const [script, setScript] = useState('');
  const [topic, setTopic] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [file, setFile] = useState(null);
  const [fileDur, setFileDur] = useState(0);
  const [language, setLanguage] = useState(uiLang === 'ar' ? 'ar' : 'en');
  const [voiceKey, setVoiceKey] = useState('');
  const [theme, setTheme] = useState('cinematic');
  const [ratio, setRatio] = useState('16:9');
  const [captions, setCaptions] = useState('karaoke');
  const [motionGraphics, setMotionGraphics] = useState(true);
  const [sources, setSources] = useState('all');
  const [music, setMusic] = useState(true);
  const [mood, setMood] = useState('');
  const [track, setTrack] = useState('');
  const [est, setEst] = useState(null);
  const [writing, setWriting] = useState(false);
  const [scriptNote, setScriptNote] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [job, setJob] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);
  const fileRef = useRef(null);

  const loadJobs = useCallback(async () => {
    try { const r = await fetch('/api/documentary/jobs', { headers: authHeaders() }); if (r.ok) setJobs((await r.json()).jobs || []); } catch { /* ignore */ }
  }, []);

  // مثال جاهز من صفحة Templates: نملا الموضوع/السكريبت ونمسح المفاتيح
  useEffect(() => {
    try {
      const m = localStorage.getItem('erivion_template_model');
      if (m === 'documentary' || m === 'autoedit') {
        const prompt = localStorage.getItem('erivion_template_prompt') || '';
        const scr = localStorage.getItem('erivion_template_script') || '';
        if (m === 'autoedit') setKind('edit');
        else if (scr) { setScript(scr); setMode('script'); }
        else if (prompt) { setTopic(prompt.slice(0, 300)); setMode('topic'); }
        ['erivion_template_model', 'erivion_template_prompt', 'erivion_template_script'].forEach((k) => localStorage.removeItem(k));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/documentary/options', { headers: authHeaders() });
        if (!r.ok) throw new Error('options');
        const o = await r.json();
        setOpts(o);
        setVoiceKey('male_wise');
      } catch { setLoadErr(t.errGeneric); }
    })();
    loadJobs();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cost estimate — debounced for script text, immediate for other modes.
  useEffect(() => {
    if (!opts) return undefined;
    const body = mode === 'script' ? { script, language, ratio }
      : mode === 'topic' ? { minutes, language, ratio }
        : { audioDurationSec: fileDur || 0, language, ratio };
    if ((mode === 'script' && script.trim().length < 20) || (mode === 'voiceover' && !fileDur)) { setEst(null); return undefined; }
    const h = setTimeout(async () => {
      try {
        const r = await fetch('/api/documentary/estimate', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
        if (r.ok) setEst(await r.json());
      } catch { /* keep previous estimate */ }
    }, mode === 'script' ? 450 : 0);
    return () => clearTimeout(h);
  }, [opts, mode, script, minutes, fileDur, language, ratio]);

  const dirty = useMemo(() => looksDirtyClient(script), [script]);
  const [cleaning, setCleaning] = useState(false);
  const [beforeClean, setBeforeClean] = useState(null);
  const cleanNow = async (text, force = false) => {
    const src = text ?? script;
    if (src.trim().length < 20) return;
    setCleaning(true); setError('');
    try {
      const r = await fetch('/api/documentary/clean-script', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ script: src, force }) });
      const j = await r.json();
      if (!r.ok) throw new Error(t.errs[j.error] || t.errGeneric);
      if (j.changed) { setBeforeClean(src); setScript(j.script); setScriptNote(t.cleanedNote); } else setScriptNote(t.cleanNoChange);
    } catch (e) { setError(e.message); } finally { setCleaning(false); }
  };
  const trialOn = !!opts?.freeTrial?.available;
  const wordCount = useMemo(() => script.trim().split(/\s+/).filter(Boolean).length, [script]);

  const pickFile = (f) => {
    setFile(f); setFileDur(0); setError('');
    if (!f) return;
    const url = URL.createObjectURL(f);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { setFileDur(Number.isFinite(a.duration) ? a.duration : 0); URL.revokeObjectURL(url); };
    a.onerror = () => { URL.revokeObjectURL(url); setError(t.errGeneric); };
    a.src = url;
  };

  const writeScript = async () => {
    setError(''); setWriting(true);
    try {
      const r = await fetch('/api/documentary/script', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ topic, minutes, language }) });
      const j = await r.json();
      if (!r.ok) throw new Error(t.errs[j.error] || t.errGeneric);
      setScript(j.script || ''); setMode('script'); setScriptNote(t.scriptReady);
      if (j.title) setTopic((x) => x || j.title);
    } catch (e) { setError(e.message); } finally { setWriting(false); }
  };

  const watchJob = useCallback((id) => {
    if (pollRef.current) clearInterval(pollRef.current);
    const tick = async () => {
      try {
        const r = await fetch('/api/documentary/jobs/' + id, { headers: authHeaders() });
        if (!r.ok) return;
        const j = await r.json();
        setJob(j);
        if (j.status === 'done' || j.status === 'failed') { clearInterval(pollRef.current); pollRef.current = null; loadJobs(); }
      } catch { /* retry next tick */ }
    };
    tick();
    pollRef.current = setInterval(tick, 2500);
  }, [loadJobs]);

  const cost = est?.cost ?? (mode === 'topic' && opts ? Math.ceil(minutes * opts.pricing.perMinute) : null);
  const balance = est?.balance ?? opts?.balance ?? null;
  const short = cost != null && balance != null && balance < cost;
  const tooShortEst = mode === 'script' && est && est.minutes < 0.4;
  const verticalMax = opts?.limits?.maxVerticalMinutes || 3;
  const verticalTooLong = ratio === '9:16' && ((mode === 'topic' && minutes > verticalMax) || (mode !== 'topic' && !!est?.verticalTooLong));
  const ready = verticalTooLong ? false : mode === 'script' ? script.trim().length >= (opts?.limits.minScriptChars || 120) && !tooShortEst
    : mode === 'topic' ? topic.trim().length >= 3 : !!file && fileDur >= 20;

  const start = async () => {
    setError(''); setStarting(true);
    try {
      const common = { language, theme, ratio, captions, motionGraphics, sources, music, musicMood: mood || undefined, musicTrack: track || undefined, voiceKey, title: topic.trim().slice(0, 120) };
      let res;
      if (mode === 'voiceover') {
        const fd = new FormData();
        fd.append('audio', file);
        Object.entries(common).forEach(([k, v]) => { if (v !== undefined && v !== '') fd.append(k, String(v)); });
        res = await fetch('/api/documentary/jobs', { method: 'POST', headers: authHeaders(false), body: fd });
      } else {
        const body = mode === 'script' ? { ...common, mode, script } : { ...common, mode, topic, minutes };
        res = await fetch('/api/documentary/jobs', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(t.errs[j.error] || t.errGeneric);
      setJob({ id: j.jobId, status: 'queued', stage: 'queued', progress: 0, queuePosition: j.queuePosition || 0, creditsCharged: j.cost });
      watchJob(j.jobId);
    } catch (e) { setError(e.message); } finally { setStarting(false); }
  };

  const reset = () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; setJob(null); setError(''); };
  const copyCredits = async (text) => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };

  const shell = (children) => (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: '28px 16px 80px', direction: dir }}>
      <style>{`
        .doc-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;align-items:start}
        .doc-side{position:sticky;top:16px}
        .doc-themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}
        @media (max-width:860px){.doc-grid{grid-template-columns:minmax(0,1fr)}.doc-side{position:static}}
        .doc-spin{animation:docspin 1s linear infinite}@keyframes docspin{to{transform:rotate(360deg)}}
        @media (prefers-reduced-motion:reduce){.doc-spin{animation:none}}
      `}</style>
      <div style={{ maxWidth: 1060, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn-ghost" onClick={onBack} style={{ borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={15} style={dir === 'rtl' ? { transform: 'scaleX(-1)' } : undefined} />{t.back}
          </button>
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 26, display: 'flex', alignItems: 'center', gap: 10 }}><Clapperboard size={26} color="var(--accent2)" />{t.title}</h1>
            <p style={{ margin: '6px 0 0', color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, maxWidth: 720 }}>{t.sub}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );

  if (loadErr) return shell(<div className="card" style={{ color: 'var(--red)' }}>{loadErr}</div>);
  if (!opts) return shell(<div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Loader2 size={18} className="doc-spin" />...</div>);

  // ── Progress / result ──────────────────────────────────────────────────────
  if (job) {
    const running = job.status === 'queued' || job.status === 'running' || job.status === 'processing';
    const done = job.status === 'done';
    const failed = job.status === 'failed';
    const stageLabel = t.stages[job.stage] || job.stage || '';
    return shell(
      <div className="card animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
        {running && (<>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={18} className="doc-spin" color="var(--accent2)" />{t.progress}</h3>
          <div role="progressbar" aria-valuenow={job.progress || 0} aria-valuemin={0} aria-valuemax={100} style={{ height: 10, background: 'var(--bg4)', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(4, job.progress || 0)}%`, height: '100%', background: 'linear-gradient(90deg,#7c6af7,#9d4edd)', transition: 'width .6s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text2)' }}>
            <span>{job.status === 'queued' && job.queuePosition ? `${t.queued} — ${t.pos} ${job.queuePosition}` : stageLabel}</span>
            <span>{job.progress || 0}%</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>{t.keepOpen}</p>
        </>)}
        {done && (<>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)' }}><CheckCircle2 size={20} />{t.done}</h3>
          {job.videoUrl && <video src={job.videoUrl} poster={job.thumbnailUrl || undefined} controls playsInline style={{ width: '100%', maxHeight: 480, background: '#000', borderRadius: 'var(--r-lg)' }} />}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => downloadRemoteFile(job.videoUrl, `${(job.title || 'documentary').replace(/[^\w؀-ۿ-]+/g, '_')}.mp4`)}><Download size={16} />{t.download}</button>
            <button type="button" className="btn-ghost" style={{ borderRadius: 'var(--r-md)' }} onClick={reset}>{t.another}</button>
          </div>
          {(job.credits || []).length > 0 && (
            <div>
              <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
                <span>{t.creditsOut}</span>
                <button type="button" className="btn-ghost" style={{ padding: '2px 10px', fontSize: 12, borderRadius: 8 }} onClick={() => copyCredits(job.credits.join('\n'))}>{copied ? t.copied : t.copy}</button>
              </div>
              <pre dir="ltr" style={{ ...fieldStyle, whiteSpace: 'pre-wrap', fontSize: 12.5, margin: 0, maxHeight: 180, overflow: 'auto' }}>{job.credits.join('\n')}</pre>
            </div>
          )}
          <EditorPanel job={job} t={t} onJobUpdate={(j) => setJob(j)} />
          <PackagePanel job={job} t={t} />
          {job.script && (
            <details>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>{t.scriptOut}</summary>
              <pre style={{ ...fieldStyle, whiteSpace: 'pre-wrap', margin: '8px 0 0', maxHeight: 260, overflow: 'auto', fontFamily: 'inherit' }}>{job.script}</pre>
            </details>
          )}
        </>)}
        {failed && (<>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)' }}><XCircle size={20} />{t.failed}</h3>
          {job.error && <p style={{ margin: 0, fontSize: 14, color: 'var(--text2)' }}>{job.error}</p>}
          <p style={{ margin: 0, fontSize: 14 }}>{t.refunded}</p>
          <div><button type="button" className="btn-primary" onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><RefreshCw size={15} />{t.retry}</button></div>
        </>)}
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  const myFilmsSection = (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 16 }}>{t.myFilms}</h3>
      {jobs.length === 0 && <div style={{ color: 'var(--text3)', fontSize: 13.5 }}>{t.none}</div>}
      {jobs.slice(0, 12).map((j) => (
        <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{j.title || `#${j.id}`}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>
              {j.status === 'done' ? `${fmtDur(j.durationSec || 0)}` : j.status === 'failed' ? t.failed : `${t.stages[j.stage] || j.stage} ${j.progress || 0}%`}
              {' · '}{new Date(j.createdAt).toLocaleDateString()}
            </div>
          </div>
          {(j.status === 'done' || j.status === 'queued' || j.status === 'running' || j.status === 'processing') && (
            <button type="button" className="btn-ghost" style={{ borderRadius: 8, padding: '4px 12px', fontSize: 13 }} onClick={() => { setJob(j); watchJob(j.id); }}>{t.open}</button>
          )}
        </div>
      ))}
    </section>
  );
  const musicOff = !music;
  const kindTabs = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <Chip active={kind === 'doc'} onClick={() => setKind('doc')}><Clapperboard size={14} style={{ verticalAlign: -2, marginInlineEnd: 6 }} />{t.kDoc}</Chip>
      <Chip active={kind === 'edit'} onClick={() => setKind('edit')}><Scissors size={14} style={{ verticalAlign: -2, marginInlineEnd: 6 }} />{t.kEdit}</Chip>
    </div>
  );
  if (kind === 'edit') {
    return shell(<>
      {kindTabs}
      <AutoEditForm t={t} opts={opts} dir={dir} onStarted={(j) => { setJob(j); watchJob(j.id); }} />
      {myFilmsSection}
    </>);
  }
  return shell(<>
    {kindTabs}
    <div className="doc-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        <Section icon={FileText} title={t.s1}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip active={mode === 'script'} onClick={() => setMode('script')}>{t.mScript}</Chip>
            <Chip active={mode === 'topic'} onClick={() => setMode('topic')}>{t.mTopic}</Chip>
            <Chip active={mode === 'voiceover'} onClick={() => setMode('voiceover')}>{t.mVoice}{trialOn ? <span style={{ marginInlineStart: 8, background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 999, padding: '1px 8px', fontSize: 11 }}>🎁 {t.trialChip}</span> : null}</Chip>
          </div>

          {mode === 'script' && (<>
            {dirty && !cleaning && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--yellow-bg)', color: 'var(--yellow)', borderRadius: 'var(--r-md)', padding: '8px 12px', fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 200 }}>{t.dirtyBanner}</span>
                <button type="button" className="btn-ghost" style={{ borderRadius: 8, padding: '4px 12px', fontSize: 13, color: 'inherit' }} onClick={() => cleanNow()}>{t.cleanBtn}</button>
              </div>
            )}
            <textarea value={script} onChange={(e) => { setScript(e.target.value); setScriptNote(''); setBeforeClean(null); }} placeholder={t.scriptPh} rows={12} disabled={cleaning}
              onPaste={() => setTimeout(() => { const v = document.activeElement?.value; if (typeof v === 'string' && looksDirtyClient(v)) cleanNow(v); }, 0)}
              style={{ ...fieldStyle, lineHeight: 1.7, resize: 'vertical', minHeight: 220, opacity: cleaning ? 0.6 : 1 }} maxLength={opts.limits.maxScriptChars * 2} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--text3)', flexWrap: 'wrap', gap: 6 }}>
              <span>{wordCount} {t.words}{est && script.trim().length >= 20 ? ` · ${t.approx} ${fmtMin(est.minutes)}` : ''}</span>
              {cleaning && <span style={{ color: 'var(--accent3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="doc-spin" />{t.cleaning}</span>}
              {scriptNote && !cleaning && <span style={{ color: 'var(--green)' }}>{scriptNote}{beforeClean && <> · <button type="button" onClick={() => { setScript(beforeClean); setBeforeClean(null); setScriptNote(''); }} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>{t.undo}</button></>}</span>}
              {tooShortEst && <span style={{ color: 'var(--yellow)' }}>{t.tooShort}</span>}
            </div>
          </>)}

          {mode === 'topic' && (<>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t.topicPh} maxLength={300} style={fieldStyle} />
            <div>
              <label style={labelStyle} htmlFor="doc-min">{t.topicLen}: {minutes} {t.min}</label>
              <input id="doc-min" type="range" min={1} max={ratio === '9:16' ? (opts.limits.maxVerticalMinutes || 3) : opts.limits.maxMinutes} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)', lineHeight: 1.7 }}>{t.topicHint}</p>
            <div>
              <button type="button" className="btn-ghost" disabled={writing || topic.trim().length < 3} onClick={writeScript} style={{ borderRadius: 'var(--r-md)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {writing ? <Loader2 size={15} className="doc-spin" /> : <Wand2 size={15} />}{writing ? t.writing : t.writeScript}
              </button>
            </div>
          </>)}

          {mode === 'voiceover' && (<>
            {trialOn && (
              <div style={{ background: 'var(--green-bg)', color: 'var(--green)', borderRadius: 'var(--r-md)', padding: '9px 12px', fontSize: 13, lineHeight: 1.7 }}>
                🎁 {t.trialBanner}{file && fileDur > opts.freeTrial.maxSeconds ? <div style={{ color: 'var(--yellow)', marginTop: 4 }}>{t.trialTooLong}</div> : null}
              </div>
            )}
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.7 }}>{t.voiceHint}</p>
            <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,video/mp4" hidden onChange={(e) => pickFile(e.target.files?.[0] || null)} />
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} style={{ borderRadius: 'var(--r-md)', padding: '18px 14px', borderStyle: 'dashed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <UploadCloud size={18} />{file ? file.name : t.chooseFile}
            </button>
            {file && fileDur > 0 && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{t.fileDur}: {fmtDur(fileDur)}</div>}
          </>)}
        </Section>

        <Section icon={Mic} title={t.s2}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="doc-lang">{t.language}</label>
              <select id="doc-lang" value={language} onChange={(e) => setLanguage(e.target.value)} style={fieldStyle}>
                {Object.entries(opts.languages).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            {mode !== 'voiceover' && (
              <div>
                <label style={labelStyle} htmlFor="doc-voice">{t.voice}</label>
                <select id="doc-voice" value={voiceKey} onChange={(e) => setVoiceKey(e.target.value)} style={fieldStyle}>
                  {opts.voices.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                </select>
              </div>
            )}
          </div>
          {mode === 'voiceover' && <p style={{ margin: 0, fontSize: 13, color: 'var(--text3)' }}>{t.voiceOwn}</p>}
        </Section>

        <Section icon={Palette} title={t.s3}>
          <div className="doc-themes" role="radiogroup" aria-label={t.theme}>
            {opts.themes.map((th) => (
              <button type="button" key={th.key} role="radio" aria-checked={theme === th.key} onClick={() => setTheme(th.key)}
                style={{ padding: 0, borderRadius: 'var(--r-md)', overflow: 'hidden', cursor: 'pointer', textAlign: 'center', background: 'var(--bg3)', border: '2px solid ' + (theme === th.key ? 'var(--accent)' : 'var(--border2)') }}>
                <div style={{ height: 62, background: `linear-gradient(160deg, ${th.top}, ${th.bottom})`, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6 }}>
                  <span style={{ background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 10.5, padding: '2px 6px', borderRadius: 3 }}>Aa 1969</span>
                </div>
                <div style={{ padding: '6px 4px', fontSize: 12.5, fontWeight: 600, color: theme === th.key ? 'var(--accent3)' : 'var(--text2)' }}>{th.label}</div>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip active={ratio === '16:9'} onClick={() => setRatio('16:9')}>{t.r169}</Chip>
            <Chip active={ratio === '9:16'} onClick={() => { setRatio('9:16'); setMinutes(m => Math.min(m, opts?.limits?.maxVerticalMinutes || 3)); }}>{t.r916}</Chip>
          </div>
          {ratio === '9:16' && <div style={{ fontSize: 12, color: verticalTooLong ? 'var(--yellow)' : 'var(--text3)', lineHeight: 1.7 }}>{verticalTooLong ? t.verticalTooLong : t.verticalNote}</div>}
          <div>
            <span style={labelStyle}><Captions size={13} style={{ verticalAlign: -2 }} /> {t.captions}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['karaoke', t.cKaraoke], ['box', t.cBox], ['pop', t.cPop], ['none', t.cNone]].filter(([k]) => opts.captionStyles.includes(k)).map(([k, l]) => (
                <Chip key={k} active={captions === k} onClick={() => setCaptions(k)}>{l}</Chip>
              ))}
            </div>
          </div>
          <Toggle on={motionGraphics} onChange={setMotionGraphics} label={t.motion} />
          <div>
            <span style={labelStyle}><Film size={13} style={{ verticalAlign: -2 }} /> {t.sources}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Chip active={sources === 'all'} onClick={() => setSources('all')}>{t.srcAll}</Chip>
              <Chip active={sources === 'stock'} onClick={() => setSources('stock')}>{t.srcStock}</Chip>
            </div>
          </div>
        </Section>

        <Section icon={Volume2} title={t.s4}>
          <Toggle on={music} onChange={setMusic} label={t.music} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', opacity: musicOff ? 0.5 : 1 }}>
            <Chip disabled={musicOff} active={!mood} onClick={() => setMood('')}>{t.auto}</Chip>
            {opts.moods.map((m) => <Chip key={m} disabled={musicOff} active={mood === m && !track} onClick={() => { setMood(m); setTrack(''); }}>{m}</Chip>)}
          </div>
          {opts.music.length > 0 && (
            <div>
              <label style={labelStyle} htmlFor="doc-track"><Music size={13} style={{ verticalAlign: -2 }} /> {t.track}</label>
              <select id="doc-track" disabled={musicOff} value={track} onChange={(e) => setTrack(e.target.value)} style={fieldStyle}>
                <option value="">{t.auto}</option>
                {opts.music.map((m) => <option key={m.id} value={m.id}>{m.title}{m.artist ? ` — ${m.artist}` : ''}</option>)}
              </select>
            </div>
          )}
        </Section>
      </div>

      <aside className="doc-side">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontSize: 16 }}><Coins size={17} color="var(--accent2)" />{t.sum}</h3>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 14 }}>
            <dt style={{ color: 'var(--text2)' }}>{t.sumMin}</dt>
            <dd style={{ margin: 0, textAlign: dir === 'rtl' ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>{mode === 'topic' ? `~${minutes} ${t.min}` : est ? fmtMin(est.minutes) : '—'}</dd>
            <dt style={{ color: 'var(--text2)' }}>{t.sumCost}</dt>
            <dd style={{ margin: 0, textAlign: dir === 'rtl' ? 'left' : 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{cost != null ? (est?.trial && mode === 'voiceover' ? t.free : `${cost} ${t.credits}`) : '—'}</dd>
            <dt style={{ color: 'var(--text2)' }}>{t.sumBal}</dt>
            <dd style={{ margin: 0, textAlign: dir === 'rtl' ? 'left' : 'right', fontVariantNumeric: 'tabular-nums' }}>{balance != null ? `${balance} ${t.credits}` : '—'}</dd>
          </dl>
          {short && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 13 }}>
              <TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>{t.lowBal} {cost - balance} {t.credits}. {onNavigate && <button type="button" onClick={() => onNavigate('pricing')} style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>{t.topUp}</button>}</div>
            </div>
          )}
          {error && <div role="alert" style={{ background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 'var(--r-md)', padding: '10px 12px', fontSize: 13 }}>{error}</div>}
          <button type="button" className="btn-primary" disabled={!ready || starting || short} onClick={start} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {starting ? <Loader2 size={16} className="doc-spin" /> : <Clapperboard size={16} />}{starting ? t.starting : t.start}
          </button>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>{t.refundNote}</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text3)', lineHeight: 1.7 }}>{t.attribution}</p>
        </div>
      </aside>
    </div>

    {myFilmsSection}
  </>);
}
