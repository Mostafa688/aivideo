import React, { useState, useEffect } from 'react';
import {
  Tv, ArrowLeft, ExternalLink, KeyRound, Bot, Pencil, Mic, MicOff, RefreshCw, Search,
  Sparkles, Drama, Play, CheckCircle2, XCircle, Pause, PlayCircle, Trash2, BarChart3,
  ChevronDown, Link2, Eye, ThumbsUp, MessageSquare, Clock, Loader2, TriangleAlert,
} from 'lucide-react';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

const T = {
  ar: {
    title: 'قنواتي', sub: 'وصّل قناتك بـ VidIQ وخلّي Erivion يقترحلك فيديو كل يوم، وانت توافق أو ترفض.',
    howTitle: 'إزاي تربط قناتك؟ (3 خطوات وخلصت)',
    step1Title: '1. اعمل حساب VidIQ (لو مالكش واحد)',
    step1Desc: 'VidIQ هو اللي بيوصّل Erivion بقناتك على يوتيوب وبيجيب الإحصائيات والأفكار الحقيقية. لو لسه معملتش حساب، اعمله من هنا (فيه خطة مجانية):',
    step1Btn: 'افتح vidiq.com',
    step2Title: '2. جيب مفتاح الـAPI الشخصي بتاعك',
    step2Desc: 'بعد ما تسجّل دخول في VidIQ، افتح الرابط ده وانسخ المفتاح اللي هيظهر لك — ده مفتاحك الخاص، مش هيشوفه غيرك:',
    step2Btn: 'افتح صفحة المفتاح',
    step3Title: '3. الصق المفتاح تحت وضيف القناة',
    step3Desc: 'هنتأكد إن المفتاح شغال ومربوط بقناتك على يوتيوب أوتوماتيك. وبعد ما تضيف القناة، تقدر (اختياري) تضغط "اربط يوتيوب" عشان الرفع يبقى تلقائي بالكامل من غير ما تلمس حاجة.',
    addTitle: 'إضافة قناة جديدة', label: 'اسم مميز للقناة (اختياري)', vidiqKey: 'مفتاح VidIQ الشخصي',
    vidiqHelp: 'جيبه من app.vidiq.com/account/settings/mcp — مفيش OAuth بضغطة زرار، لازم تلصق المفتاح بنفسك.',
    format: 'شكل الفيديوهات', formatAuto: 'تلقائي (حسب القناة)', formatLong: 'طويل', formatShort: 'قصير',
    voice: 'الحساب ده بيستخدم صوت في الفيديوهات؟', add: 'إضافة القناة', adding: 'جاري الإضافة...',
    yourChannels: 'قنواتك', noChannels: 'لسه معملتش أي قناة.', pause: 'إيقاف مؤقت', resume: 'تشغيل',
    remove: 'حذف', lastRun: 'آخر تشغيل', never: 'لسه معملش أي تشغيل',
    analytics: 'تحليلات الأداء', hideAnalytics: 'إخفاء التحليلات', noRuns: 'لسه مفيش فيديوهات اتعملت.',
    linkPlaceholder: 'الصق رابط اليوتيوب بعد الرفع', link: 'اربط', refreshStats: 'حدّث الأداء',
    views: 'مشاهدة', likes: 'لايك', comments: 'كومنت', avgView: 'متوسط وقت المشاهدة',
    notLinkedYet: 'لسه ما اترفعش/اترباط بيوتيوب', loadingStats: 'بيجيب الأداء...',
    connectYoutube: 'اربط يوتيوب (النشر بعد مراجعتك)', connectedAs: 'متصل — جاهز للنشر بعد ما تراجع كل فيديو',
    disconnect: 'فصل الربط', youtubeConnectedToast: 'تم ربط يوتيوب بنجاح! هتراجع كل فيديو وتوافق على نشره بنفسك.',
    channelAddedToast: 'تمام! القناة اتضافت — تقدر تشوفها تحت في "قنواتك".',
    setupModeLabel: 'طريقة إعداد القناة', setupAuto: 'أوتوماتيك', setupManual: 'يدوي',
    setupAutoDesc: 'الموقع يحلل قناتك من يوتيوب و VidIQ ويحدد نوع المحتوى والستايل وهل فيه راوي وطول الفيديو بنفسه.',
    setupManualDesc: 'انت اللي تحدد كل التفاصيل بنفسك — الأدق لو عايز تحكم كامل.',
    autoDetected: 'هيتحدد تلقائيًا بعد التحليل',
    analyzing: 'بيحلل القناة دلوقتي...', reanalyze: 'إعادة التحليل', analyzeNow: 'حلل القناة دلوقتي',
    analysisLabel: 'نتيجة التحليل التلقائي', contentStyleL: 'نوع المحتوى', videoStyleL: 'الستايل البصري',
    usesVoiceL: 'راوي/صوت', targetDurationL: 'الطول المستهدف', yes: 'نعم', no: 'لأ',
    analysisFailedToast: 'التحليل التلقائي فشل — تقدر تحاول تاني أو تختار يدوي.',
    contentStyleLabel: 'نوع المحتوى', contentStyleAuto: 'تلقائي (يتحدد يوميًا)', contentStyleRealistic: 'واقعي (لقطات حقيقية)',
    contentStyleMap: 'خرائط/جغرافيا', contentStyleAnimated: 'قصص/رسوم بالذكاء الاصطناعي',
    contentStyleCharacter: 'شخصية واحدة تعيش مغامرة',
    contentStyleWhiteboard: 'سكتش على سبورة بيضاء',
    characterPickLabel: 'اختار الشخصية', characterPickNone: 'لسه معملتش أي شخصية —',
    characterPickLink: 'روح لمكتبة الشخصيات وضيف واحدة الأول', characterRequired: 'لازم تختار شخصية عشان النوع ده يشتغل',
    contentBriefLabel: 'وصف المحتوى وطريقة العمل (اختياري)',
    contentBriefPlaceholder: 'اكتب هنا أي تفاصيل عايز الفيديوهات تلتزم بيها: نوع المحتوى بالظبط، طريقة السرد، الأدوات/الموديلات اللي عايز تتستخدم، حاجات تتجنبها... أي حاجة هتساعد الايجنت يفهم إزاي تحب فيديوهاتك تتعمل.',
    contentBriefSaved: 'اتحفظ.', save: 'حفظ',
    imageModelLabel: 'موديل توليد الصور', animationModelLabel: 'موديل تحريك المشاهد',
    modelDefaultOption: 'افتراضي (أفضل جودة)', perImage: 'كريديت/صورة', perSecond: 'كريديت/ثانية',
    contentStyleChangedToast: 'اتغيّر نوع المحتوى', noModelsForStyle: 'النوع ده بيستخدم لقطات جاهزة مش موديلات صور/تحريك، عشان كده مفيش اختيار موديلات. لو عايز تختار الموديلات، غيّر نوع المحتوى لـ«قصص/رسوم بالذكاء الاصطناعي» أو غيره من فوق.',
    modelChangedToast: 'اتحفظ اختيار الموديل.',
    sceneCountLabel: 'عدد المشاهد المستهدف (اختياري)', sceneCountPlaceholder: 'افتراضي حسب الشكل (قصير/طويل)',
    sceneCountSaved: 'اتحفظ عدد المشاهد.', captionsLabel: 'كابشن على الفيديو',
  },
  en: {
    title: 'My Channels', sub: "Connect your channel to VidIQ and let Erivion suggest a video every day — you approve or reject.",
    howTitle: 'How to connect your channel (3 quick steps)',
    step1Title: '1. Create a VidIQ account (if you don’t have one)',
    step1Desc: 'VidIQ is what links Erivion to your YouTube channel and pulls real stats and video ideas. If you don’t have an account yet, create one here (there’s a free plan):',
    step1Btn: 'Open vidiq.com',
    step2Title: '2. Get your personal API key',
    step2Desc: 'After logging into VidIQ, open this link and copy the key shown there — it’s your own private key, no one else can see it:',
    step2Btn: 'Open the key page',
    step3Title: '3. Paste the key below and connect',
    step3Desc: 'We’ll verify the key works and is linked to a real YouTube channel automatically. After connecting, you can optionally click "Connect YouTube" so future videos upload fully automatically.',
    addTitle: 'Connect a new channel', label: 'A friendly label (optional)', vidiqKey: 'Your personal VidIQ API key',
    vidiqHelp: 'Get it from app.vidiq.com/account/settings/mcp — no one-click OAuth, paste the key yourself.',
    format: 'Video format', formatAuto: 'Auto (from channel)', formatLong: 'Long-form', formatShort: 'Short',
    voice: 'Does this channel use voice narration?', add: 'Connect channel', adding: 'Connecting...',
    yourChannels: 'Your channels', noChannels: "You haven't connected a channel yet.", pause: 'Pause', resume: 'Resume',
    remove: 'Remove', lastRun: 'Last run', never: 'Never run yet',
    analytics: 'Performance analytics', hideAnalytics: 'Hide analytics', noRuns: 'No videos made yet.',
    linkPlaceholder: 'Paste the YouTube link after uploading', link: 'Link', refreshStats: 'Refresh stats',
    views: 'views', likes: 'likes', comments: 'comments', avgView: 'avg. view duration',
    notLinkedYet: 'Not linked to a YouTube video yet', loadingStats: 'Loading stats...',
    connectYoutube: 'Connect YouTube (publish after your review)', connectedAs: 'Connected — ready to publish after you review each video',
    disconnect: 'Disconnect', youtubeConnectedToast: "YouTube connected! You'll review and approve each video before it publishes.",
    channelAddedToast: 'Done! Your channel was added — check it below under "Your channels".',
    setupModeLabel: 'Channel setup mode', setupAuto: 'Automatic', setupManual: 'Manual',
    setupAutoDesc: 'Erivion analyzes your channel from YouTube and VidIQ to figure out content style, visual style, whether it uses narration, and video length on its own.',
    setupManualDesc: "You set every detail yourself — most precise if you want full control.",
    autoDetected: 'Will be detected automatically after analysis',
    analyzing: 'Analyzing your channel...', reanalyze: 'Re-analyze', analyzeNow: 'Analyze channel now',
    analysisLabel: 'Automatic analysis result', contentStyleL: 'Content style', videoStyleL: 'Visual style',
    usesVoiceL: 'Narration/voice', targetDurationL: 'Target length', yes: 'Yes', no: 'No',
    analysisFailedToast: 'Automatic analysis failed — you can try again or switch to manual.',
    contentStyleLabel: 'Content style', contentStyleAuto: 'Auto (decided daily)', contentStyleRealistic: 'Realistic (stock footage)',
    contentStyleMap: 'Map/Geography', contentStyleAnimated: 'Story/AI-animated',
    contentStyleCharacter: 'Single character adventure',
    contentStyleWhiteboard: 'Whiteboard sketch',
    characterPickLabel: 'Choose the character', characterPickNone: "You haven't added a character yet —",
    characterPickLink: 'go to the Characters library and add one first', characterRequired: 'You must pick a character for this content style to work',
    contentBriefLabel: 'Content description & how to make it (optional)',
    contentBriefPlaceholder: "Write any details you want every video to follow: the exact type of content, narration style, tools/models you want used, things to avoid... anything that helps the Agent understand how you want your videos made.",
    contentBriefSaved: 'Saved.', save: 'Save',
    imageModelLabel: 'Image generation model', animationModelLabel: 'Scene animation model',
    modelDefaultOption: 'Default (best quality)', perImage: 'credits/image', perSecond: 'credits/sec',
    contentStyleChangedToast: 'Content style updated', noModelsForStyle: "This style uses stock footage, not AI image/animation models, so there are no models to pick. To choose models, switch the content style above to 'Story/AI-animated' or another AI style.",
    modelChangedToast: 'Model choice saved.',
    sceneCountLabel: 'Target scene count (optional)', sceneCountPlaceholder: 'Default based on format (short/long)',
    sceneCountSaved: 'Scene count saved.', captionsLabel: 'Video captions',
  },
};

function formatDuration(sec) {
  if (sec == null) return '–';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function Toggle({ value, onChange }) {
  return (
    <div onClick={() => onChange(!value)}
      style={{ width: 44, height: 24, borderRadius: 999, background: value ? '#7c6af7' : 'rgba(255,255,255,0.15)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: value ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  );
}

export default function ChannelsPage({ onBack, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const t = T[isAr ? 'ar' : 'en'];
  const dir = isAr ? 'rtl' : 'ltr';

  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [vidiqKey, setVidiqKey] = useState('');
  const [formatPref, setFormatPref] = useState('auto');
  const [usesVoice, setUsesVoice] = useState(false);
  const [setupMode, setSetupMode] = useState('manual');
  const [contentStyle, setContentStyle] = useState('');
  const [contentBrief, setContentBrief] = useState('');
  const [characterReferenceId, setCharacterReferenceId] = useState('');
  const [characters, setCharacters] = useState([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [analyzingIds, setAnalyzingIds] = useState({});
  const [briefDrafts, setBriefDrafts] = useState({});
  const [savingBriefId, setSavingBriefId] = useState(null);
  // ✅ NEW (طلب العميل: عايز يضمن عدد مشاهد محدد بالظبط قبل تسجيل ديمو، مش بس توجيه نصي
  // ممكن الـAI يتجاهله) — راجع channelRoutes.js's PATCH handler لتفاصيل الحد الأقصى/الأدنى
  const [sceneCountDrafts, setSceneCountDrafts] = useState({});
  // ✅ NEW (طلب العميل: شاف Seedance 2.5 بيكلف $3.01 لكليب وسأل ليه التحريك بأغلى الموديلات —
  // اقترح إن كل موديلات الصور/التحريك وأسعارها تتعرض عليه وهو يختار بنفسه) — نجيب قايمة
  // الموديلات مرة واحدة من نفس الراوتات الموجودة فعلاً (/api/images/models، /api/videos/models)
  const [imageModels, setImageModels] = useState([]);
  const [videoModels, setVideoModels] = useState([]);

  useEffect(() => {
    fetch('/api/characters', { headers: authHeaders() }).then(r => r.json()).then(d => setCharacters(d.characters || [])).catch(() => {});
    fetch('/api/images/models', { headers: authHeaders() }).then(r => r.json()).then(d => setImageModels(d.models || [])).catch(() => {});
    // بس الموديلات اللي بتقبل صورة كمدخل صالحة كـ"موديل تحريك" هنا (البايبلاين بيبعتلها صورة
    // مشهد)، ومرتبة بالأرخص الأول عشان يبان الفرق في السعر بسهولة
    fetch('/api/videos/models', { headers: authHeaders() }).then(r => r.json())
      .then(d => setVideoModels((d.models || []).filter(m => m.supportsImageInput).sort((a, b) => a.creditCostPerSecond - b.creditCostPerSecond)))
      .catch(() => {});
  }, []);

  const [expandedChannelId, setExpandedChannelId] = useState(null);
  const [runsByChannel, setRunsByChannel] = useState({});
  const [linkInputs, setLinkInputs] = useState({});
  const [performanceByRun, setPerformanceByRun] = useState({});
  const [toast, setToast] = useState(null);
  const [connectingId, setConnectingId] = useState(null);
  const [connectUrls, setConnectUrls] = useState({});

  // ✅ NEW: بعد ما العميل يوافق (أو يلغي) ربط يوتيوب، App.jsx بيحط علامة هنا قبل ما
  // يوجهنا للصفحة دي — نقراها مرة واحدة بس ونمسحها
  useEffect(() => {
    const flag = sessionStorage.getItem('erivion_youtube_toast');
    if (!flag) return;
    sessionStorage.removeItem('erivion_youtube_toast');
    if (flag === 'connected') setToast({ type: 'success', text: t.youtubeConnectedToast });
    else if (flag.startsWith('error:')) setToast({ type: 'error', text: flag.slice(6) || 'Connection failed' });
  }, []);

  // ✅ بيجيب رابط ربط يوتيوب مقدمًا (مش وقت الكليك) — المتصفحات الصارمة (خصوصًا Safari
  // على الموبايل) بتلغي صلاحية "user gesture" لو حصل await قبل تغيير location.href، يعني
  // الريدايركت لجوجل بيفشل صامت من غير أي error وحتى من غير أي تغيير في اللينك. الحل إننا
  // نجيب اللينك من الأول من غير أي انتظار وقت الضغطة نفسها.
  const prefetchConnectUrl = (channelId) => {
    fetch(`/api/channels/${channelId}/youtube-connect`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { if (data.url) setConnectUrls(prev => ({ ...prev, [channelId]: data.url })); })
      .catch(() => {});
  };

  const connectYoutube = (channelId) => {
    const url = connectUrls[channelId];
    if (url) { window.location.href = url; return; }
    // ✅ fallback نادر لو الرابط لسه ما جهزش (مثلاً القناة اتضافت لتوها) — هنا لازم await
    // فبيفضل احتمال ضعيف إن المتصفح يلغي الـgesture، لكن ده أفضل من عدم عمل حاجة خالص
    setConnectingId(channelId);
    fetch(`/api/channels/${channelId}/youtube-connect`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => {
        if (!data.url) throw new Error(data.error || 'Failed');
        window.location.href = data.url;
      })
      .catch(e => { setToast({ type: 'error', text: e.message }); setConnectingId(null); });
  };

  const disconnectYoutube = async (channelId) => {
    try {
      await fetch(`/api/channels/${channelId}/youtube-disconnect`, { method: 'POST', headers: authHeaders() });
      load();
    } catch (e) { setToast({ type: 'error', text: e.message }); }
  };

  const toggleAnalytics = async (channelId) => {
    if (expandedChannelId === channelId) { setExpandedChannelId(null); return; }
    setExpandedChannelId(channelId);
    if (!runsByChannel[channelId]) {
      try {
        const res = await fetch(`/api/channels/${channelId}/runs`, { headers: authHeaders() });
        const data = await res.json();
        setRunsByChannel(prev => ({ ...prev, [channelId]: data.runs || [] }));
      } catch { setRunsByChannel(prev => ({ ...prev, [channelId]: [] })); }
    }
  };

  const linkYoutube = async (channelId, runId) => {
    const url = (linkInputs[runId] || '').trim();
    if (!url) return;
    try {
      const res = await fetch(`/api/channels/runs/${runId}/link-youtube`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ youtubeUrl: url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setRunsByChannel(prev => ({ ...prev, [channelId]: prev[channelId].map(r => r.id === runId ? data.run : r) }));
      setLinkInputs(prev => ({ ...prev, [runId]: '' }));
    } catch (e) { alert(e.message); }
  };

  const refreshPerformance = async (runId) => {
    setPerformanceByRun(prev => ({ ...prev, [runId]: 'loading' }));
    try {
      const res = await fetch(`/api/channels/runs/${runId}/performance`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setPerformanceByRun(prev => ({ ...prev, [runId]: data.performance }));
    } catch (e) {
      setPerformanceByRun(prev => ({ ...prev, [runId]: { error: e.message } }));
    }
  };

  const load = () => {
    setLoading(true);
    fetch('/api/channels', { headers: authHeaders() }).then(r => r.json()).then(d => {
      const chs = d.channels || [];
      setChannels(chs);
      chs.filter(ch => !ch.youtube_channel_title).forEach(ch => prefetchConnectUrl(ch.id));
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const assignCharacter = async (channelId, charId) => {
    try {
      await fetch(`/api/channels/${channelId}/character`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ characterReferenceId: charId || null }) });
      load();
    } catch (e) { setToast({ type: 'error', text: e.message }); }
  };

  // ✅ NEW: يحفظ فورًا لما العميل يغيّر اختيار الموديل (زي assignCharacter بالظبط) — مفيش
  // زرار حفظ منفصل هنا، القيمة فاضية = رجوع للافتراضي القديم (راجع channelRoutes.js's PATCH)
  const changeContentStyle = async (channelId, value) => {
    try {
      const res = await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ contentStyle: value }) });
      if (!res.ok) throw new Error('Failed');
      setToast({ type: 'success', text: t.contentStyleChangedToast });
      load();
    } catch (e) { setToast({ type: 'error', text: e.message }); }
  };

  const assignModel = async (channelId, field, value) => {
    try {
      await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ [field]: value || null }) });
      setToast({ type: 'success', text: t.modelChangedToast });
      load();
    } catch (e) { setToast({ type: 'error', text: e.message }); }
  };

  const saveBrief = async (channelId) => {
    setSavingBriefId(channelId);
    try {
      await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ contentBrief: (briefDrafts[channelId] || '').trim() }) });
      setToast({ type: 'success', text: t.contentBriefSaved });
      load();
    } catch (e) { setToast({ type: 'error', text: e.message }); } finally { setSavingBriefId(null); }
  };

  // ✅ NEW: بيتحفظ لما العميل يخرج من الخانة (onBlur) — مش على كل ضغطة كيبورد زي textarea
  // البريف (رقم واحد بس، مفيش داعي لزرار حفظ منفصل)
  const saveSceneCount = async (channelId, value) => {
    try {
      await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ targetSceneCount: value === '' ? null : value }) });
      setToast({ type: 'success', text: t.sceneCountSaved });
      load();
    } catch (e) { setToast({ type: 'error', text: e.message }); }
  };

  const toggleCaptions = async (channelId, value) => {
    try {
      await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ captionsEnabled: value }) });
      load();
    } catch (e) { setToast({ type: 'error', text: e.message }); }
  };

  const analyzeChannel = async (channelId) => {
    setAnalyzingIds(prev => ({ ...prev, [channelId]: true }));
    try {
      const res = await fetch(`/api/channels/${channelId}/analyze`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      load();
    } catch (e) {
      setToast({ type: 'error', text: t.analysisFailedToast + ' (' + e.message + ')' });
    } finally {
      setAnalyzingIds(prev => ({ ...prev, [channelId]: false }));
    }
  };

  const addChannel = async () => {
    if (!vidiqKey.trim()) return;
    if (setupMode === 'manual' && contentStyle === 'character_adventure' && !characterReferenceId) {
      setError(t.characterRequired); return;
    }
    setAdding(true); setError('');
    try {
      const res = await fetch('/api/channels', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ label, vidiqApiKey: vidiqKey.trim(), formatPref, usesVoice, setupMode }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const newChannelId = data.channel?.id;
      // ✅ في وضع "يدوي" فقط — لو العميل اختار نوع محتوى بنفسه (مش سايبها تلقائي)، نحفظه
      // فورًا بعد إنشاء القناة، ولو اختار "شخصية واحدة تعيش مغامرة" نربطها بالشخصية المختارة
      if (setupMode === 'manual' && newChannelId) {
        if (contentStyle) {
          await fetch(`/api/channels/${newChannelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ contentStyle }) }).catch(() => {});
          if (contentStyle === 'character_adventure' && characterReferenceId) {
            await fetch(`/api/channels/${newChannelId}/character`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ characterReferenceId }) }).catch(() => {});
          }
        }
        if (contentBrief.trim()) {
          await fetch(`/api/channels/${newChannelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ contentBrief: contentBrief.trim() }) }).catch(() => {});
        }
      }
      setLabel(''); setVidiqKey(''); setFormatPref('auto'); setUsesVoice(false); setContentStyle(''); setContentBrief(''); setCharacterReferenceId('');
      setToast({ type: 'success', text: t.channelAddedToast });
      load();
      // ✅ لو اختار أوتوماتيك، نشغّل التحليل فورًا من غير ما يحتاج يدوس زرار تاني
      if (setupMode === 'automatic' && newChannelId) analyzeChannel(newChannelId);
      setSetupMode('manual');
    } catch (e) { setError(e.message); } finally { setAdding(false); }
  };

  const toggleStatus = async (ch) => {
    await fetch(`/api/channels/${ch.id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ status: ch.status === 'active' ? 'paused' : 'active' }) });
    load();
  };
  const removeChannel = async (id) => {
    await fetch(`/api/channels/${id}`, { method: 'DELETE', headers: authHeaders() });
    load();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: '#fff', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {onBack && (
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24 }}>
            <ArrowLeft size={13} style={{ transform: isAr ? 'scaleX(-1)' : 'none' }} /> {isAr ? 'رجوع' : 'Back'}
          </button>
        )}

        {toast && (
          <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: toast.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, color: toast.type === 'success' ? '#22c55e' : '#f87171', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {toast.type === 'success' ? <CheckCircle2 size={15} /> : <XCircle size={15} />} {toast.text}
            </span>
            <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 18, margin: '0 auto 16px', background: 'linear-gradient(135deg,rgba(124,106,247,0.18),rgba(124,106,247,0.05))', border: '1px solid rgba(124,106,247,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Tv size={26} color="#a78bfa" strokeWidth={1.75} />
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t.title}</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', marginTop: 8, fontSize: 13.5, maxWidth: 440, marginInline: 'auto', lineHeight: 1.7 }}>{t.sub}</p>
        </div>

        <div style={{ background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.18)', borderRadius: 16, padding: 22, marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 18, color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={15} /> {t.howTitle}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { title: t.step1Title, desc: t.step1Desc, href: 'https://vidiq.com', btn: t.step1Btn },
              { title: t.step2Title, desc: t.step2Desc, href: 'https://app.vidiq.com/account/settings/mcp', btn: t.step2Btn },
              { title: t.step3Title, desc: t.step3Desc },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(124,106,247,0.15)', border: '1px solid rgba(124,106,247,0.3)', color: '#a78bfa', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
                  <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)', margin: s.href ? '0 0 8px' : 0, lineHeight: 1.7 }}>{s.desc}</p>
                  {s.href && (
                    <a href={s.href} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '6px 14px', borderRadius: 8, background: 'rgba(124,106,247,0.15)', color: '#a78bfa', textDecoration: 'none', border: '1px solid rgba(124,106,247,0.3)' }}>
                      {i === 0 ? <ExternalLink size={12} /> : <KeyRound size={12} />} {s.btn}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tv size={15} color="#a78bfa" /> {t.addTitle}
          </div>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder={t.label}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, marginBottom: 10, boxSizing: 'border-box' }} />
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <KeyRound size={14} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', [isAr ? 'right' : 'left']: 14 }} />
            <input value={vidiqKey} onChange={e => setVidiqKey(e.target.value)} placeholder={t.vidiqKey} type="password"
              style={{ width: '100%', padding: isAr ? '11px 38px 11px 14px' : '11px 14px 11px 38px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, boxSizing: 'border-box' }} />
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 0 18px', lineHeight: 1.6 }}>{t.vidiqHelp}</p>

          <div style={{ padding: '14px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 10, fontWeight: 600 }}>{t.setupModeLabel}</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[['manual', Pencil, t.setupManual], ['automatic', Bot, t.setupAuto]].map(([mode, Ico, label2]) => (
                <button key={mode} type="button" onClick={() => setSetupMode(mode)}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    border: setupMode === mode ? '1px solid #7c6af7' : '1px solid rgba(255,255,255,0.1)',
                    background: setupMode === mode ? 'rgba(124,106,247,0.15)' : 'rgba(255,255,255,0.03)',
                    color: setupMode === mode ? '#c4b5fd' : '#9ca3af' }}>
                  <Ico size={14} /> {label2}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.6 }}>
              {setupMode === 'automatic' ? t.setupAutoDesc : t.setupManualDesc}
            </p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 13, color: '#d1d5db' }}>{t.format}</span>
            <select value={formatPref} onChange={e => setFormatPref(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}>
              <option value="auto">{t.formatAuto}</option>
              <option value="long">{t.formatLong}</option>
              <option value="short">{t.formatShort}</option>
            </select>
          </div>
          {setupMode === 'automatic' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 18 }}>
              <span style={{ fontSize: 13, color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 7 }}><Mic size={13} /> {t.voice}</span>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>{t.autoDetected}</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 13, color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 7 }}>{usesVoice ? <Mic size={13} /> : <MicOff size={13} />} {t.voice}</span>
                <Toggle value={usesVoice} onChange={setUsesVoice} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 13, color: '#d1d5db' }}>{t.contentStyleLabel}</span>
                <select value={contentStyle} onChange={e => setContentStyle(e.target.value)}
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }}>
                  <option value="">{t.contentStyleAuto}</option>
                  <option value="realistic">{t.contentStyleRealistic}</option>
                  <option value="map">{t.contentStyleMap}</option>
                  <option value="animated">{t.contentStyleAnimated}</option>
                  <option value="character_adventure">{t.contentStyleCharacter}</option>
                  <option value="whiteboard_sketch">{t.contentStyleWhiteboard}</option>
                </select>
              </div>
              {contentStyle === 'character_adventure' && (
                <div style={{ padding: '12px 12px', marginTop: 8, borderRadius: 10, background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.18)', marginBottom: 18 }}>
                  <div style={{ fontSize: 12.5, color: '#f0abfc', marginBottom: 8, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Drama size={13} /> {t.characterPickLabel}</div>
                  {characters.length === 0 ? (
                    <p style={{ fontSize: 11.5, color: '#f59e0b', margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}><TriangleAlert size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {t.characterPickNone} <span style={{ textDecoration: 'underline', cursor: 'default' }}>{t.characterPickLink}</span></p>
                  ) : (
                    <select value={characterReferenceId} onChange={e => setCharacterReferenceId(e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '9px 10px', fontSize: 12.5, boxSizing: 'border-box' }}>
                      <option value="">—</option>
                      {characters.map(c => <option key={c.id} value={c.id}>{c.label || `#${c.id}`}</option>)}
                    </select>
                  )}
                </div>
              )}
              <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', marginBottom: 18 }}>
                <div style={{ fontSize: 13, color: '#d1d5db', marginBottom: 8 }}>{t.contentBriefLabel}</div>
                <textarea value={contentBrief} onChange={e => setContentBrief(e.target.value)} placeholder={t.contentBriefPlaceholder} rows={4} maxLength={2000}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 10, padding: '10px 12px', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6 }} />
              </div>
              {contentStyle !== 'character_adventure' && <div style={{ marginBottom: 18 }} />}
            </>
          )}

          {error && <p style={{ color: '#ef4444', fontSize: 12.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}><TriangleAlert size={13} /> {error}</p>}
          <button onClick={addChannel} disabled={adding || !vidiqKey.trim()}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: (adding || !vidiqKey.trim()) ? 'rgba(124,106,247,0.3)' : 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: (adding || !vidiqKey.trim()) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {adding ? <><Loader2 size={15} className="spinning" /> {t.adding}</> : t.add}
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'rgba(255,255,255,0.6)' }}>{t.yourChannels}</div>
        {loading ? null : channels.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <Tv size={22} color="rgba(255,255,255,0.25)" style={{ marginBottom: 8 }} />
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: 0 }}>{t.noChannels}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {channels.map(ch => (
              <div key={ch.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Tv size={14} color="rgba(255,255,255,0.4)" /> {ch.label || ch.channel_id}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 5, background: ch.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: ch.status === 'active' ? '#22c55e' : '#f59e0b' }}>
                    {ch.status === 'active' ? <PlayCircle size={11} /> : <Pause size={11} />} {ch.status}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Clock size={11} /> {t.lastRun}: {ch.last_run_at ? new Date(ch.last_run_at).toLocaleString() : t.never} · {ch.format_pref} · {ch.uses_voice ? <Mic size={11} /> : <MicOff size={11} />}
                </div>

                {ch.setup_mode === 'automatic' && (
                  <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(124,106,247,0.06)', border: '1px solid rgba(124,106,247,0.15)' }}>
                    {analyzingIds[ch.id] ? (
                      <span style={{ fontSize: 11.5, color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="spinning" /> {t.analyzing}</span>
                    ) : ch.auto_analyzed_at ? (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Bot size={12} /> {t.analysisLabel}</div>
                        <div style={{ fontSize: 11, color: '#d1d5db', display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                          <span>{t.contentStyleL}: {ch.content_style || '–'}</span>
                          <span>{t.videoStyleL}: {ch.video_style || '–'}</span>
                          <span>{t.usesVoiceL}: {ch.uses_voice ? t.yes : t.no}</span>
                          <span>{t.targetDurationL}: {ch.target_duration_sec ? `${ch.target_duration_sec}s (${ch.target_scene_count} scenes)` : '–'}</span>
                        </div>
                        <button onClick={() => analyzeChannel(ch.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(124,106,247,0.3)', background: 'transparent', color: '#a78bfa', fontSize: 10.5, cursor: 'pointer' }}>
                          <RefreshCw size={10} /> {t.reanalyze}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => analyzeChannel(ch.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(124,106,247,0.3)', background: 'rgba(124,106,247,0.1)', color: '#a78bfa', fontSize: 11.5, cursor: 'pointer' }}>
                        <Search size={12} /> {t.analyzeNow}
                      </button>
                    )}
                  </div>
                )}

                {ch.content_style === 'character_adventure' && (
                  <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.18)' }}>
                    {ch.character_reference_id ? (
                      <span style={{ fontSize: 11.5, color: '#ec4899', display: 'flex', alignItems: 'center', gap: 6 }}><Drama size={13} /> {ch.character_label || `#${ch.character_reference_id}`}</span>
                    ) : characters.length === 0 ? (
                      <p style={{ fontSize: 11, color: '#f59e0b', margin: 0, display: 'flex', alignItems: 'flex-start', gap: 6 }}><TriangleAlert size={12} style={{ flexShrink: 0, marginTop: 1 }} /> {t.characterPickNone} {t.characterPickLink}</p>
                    ) : (
                      <div>
                        <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}><Drama size={12} /> {t.characterPickLabel}</div>
                        <select onChange={e => assignCharacter(ch.id, e.target.value)} defaultValue=""
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                          <option value="">—</option>
                          {characters.map(c => <option key={c.id} value={c.id}>{c.label || `#${c.id}`}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* ✅ FIX: نوع المحتوى كان بيتحدد وقت إضافة القناة بس (أو بالتحليل التلقائي) وبعدها نص للقراءة
                    فقط — فلو التحليل اختار "realistic" اختيار الموديلات كان بيختفي بالكامل من غير أي طريقة
                    ترجّعه. دلوقتي نوع المحتوى قابل للتغيير من كارت القناة نفسه في أي وقت */}
                <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 6 }}>{t.contentStyleLabel}</div>
                  <select value={ch.content_style || ''} onChange={e => changeContentStyle(ch.id, e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                    <option value="">{t.contentStyleAuto}</option>
                    <option value="realistic">{t.contentStyleRealistic}</option>
                    <option value="map">{t.contentStyleMap}</option>
                    <option value="animated">{t.contentStyleAnimated}</option>
                    <option value="character_adventure">{t.contentStyleCharacter}</option>
                    <option value="whiteboard_sketch">{t.contentStyleWhiteboard}</option>
                  </select>
                  {['realistic', 'map'].includes(ch.content_style) && (
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '8px 0 0', lineHeight: 1.6 }}>{t.noModelsForStyle}</p>
                  )}
                </div>

                {!['realistic', 'map'].includes(ch.content_style) && (imageModels.length > 0 || videoModels.length > 0) && (
                  <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {imageModels.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 6 }}>{t.imageModelLabel}</div>
                        <select value={ch.image_model || ''} onChange={e => assignModel(ch.id, 'imageModel', e.target.value)}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                          <option value="">{t.modelDefaultOption}</option>
                          {imageModels.map(m => <option key={m.key} value={m.key}>{m.label} — {m.creditCostPerImage} {t.perImage}</option>)}
                        </select>
                      </div>
                    )}
                    {!['whiteboard_sketch'].includes(ch.content_style) && videoModels.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 6 }}>{t.animationModelLabel}</div>
                        <select value={ch.animation_model || ''} onChange={e => assignModel(ch.id, 'animationModel', e.target.value)}
                          style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12 }}>
                          <option value="">{t.modelDefaultOption}</option>
                          {videoModels.map(m => <option key={m.key} value={m.key}>{m.label} — {m.creditCostPerSecond} {t.perSecond}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 6 }}>{t.sceneCountLabel}</div>
                      <input type="number" min={2} max={20} step={1}
                        value={sceneCountDrafts[ch.id] !== undefined ? sceneCountDrafts[ch.id] : (ch.target_scene_count || '')}
                        onChange={e => setSceneCountDrafts(prev => ({ ...prev, [ch.id]: e.target.value }))}
                        onBlur={e => {
                          const raw = e.target.value.trim();
                          const n = raw === '' ? '' : Math.min(20, Math.max(2, parseInt(raw, 10) || 2));
                          setSceneCountDrafts(prev => ({ ...prev, [ch.id]: n }));
                          saveSceneCount(ch.id, n);
                        }}
                        placeholder={t.sceneCountPlaceholder}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 12, boxSizing: 'border-box' }} />
                    </div>
                    {ch.uses_voice && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ fontSize: 12 }}>{t.captionsLabel}</span>
                        <Toggle value={ch.captions_enabled !== 0} onChange={v => toggleCaptions(ch.id, v)} />
                      </div>
                    )}
                  </div>
                )}

                {ch.setup_mode !== 'automatic' && (
                  <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(124,106,247,0.05)', border: '1px solid rgba(124,106,247,0.12)' }}>
                    <div style={{ fontSize: 11, color: '#d1d5db', marginBottom: 6 }}>{t.contentBriefLabel}</div>
                    <textarea
                      value={briefDrafts[ch.id] !== undefined ? briefDrafts[ch.id] : (ch.content_brief || '')}
                      onChange={e => setBriefDrafts(prev => ({ ...prev, [ch.id]: e.target.value }))}
                      placeholder={t.contentBriefPlaceholder} rows={3} maxLength={2000}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.6, marginBottom: 8 }} />
                    <button onClick={() => saveBrief(ch.id)} disabled={savingBriefId === ch.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(124,106,247,0.3)', background: 'rgba(124,106,247,0.1)', color: '#a78bfa', fontSize: 11.5, cursor: savingBriefId === ch.id ? 'not-allowed' : 'pointer' }}>
                      {savingBriefId === ch.id ? <Loader2 size={11} className="spinning" /> : <CheckCircle2 size={11} />} {t.save}
                    </button>
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  {ch.youtube_channel_title ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={13} /> {t.connectedAs} ({ch.youtube_channel_title})</span>
                      <button onClick={() => disconnectYoutube(ch.id)} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>
                        {t.disconnect}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => connectYoutube(ch.id)} disabled={connectingId === ch.id}
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#ff6b6b', fontSize: 12, cursor: connectingId === ch.id ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {connectingId === ch.id ? <Loader2 size={13} className="spinning" /> : <Play size={13} />} {connectingId === ch.id ? '...' : t.connectYoutube}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => toggleStatus(ch)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#d1d5db', fontSize: 12, cursor: 'pointer' }}>
                    {ch.status === 'active' ? <><Pause size={12} /> {t.pause}</> : <><PlayCircle size={12} /> {t.resume}</>}
                  </button>
                  <button onClick={() => removeChannel(ch.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>
                    <Trash2 size={12} /> {t.remove}
                  </button>
                  <button onClick={() => toggleAnalytics(ch.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(124,106,247,0.3)', background: 'rgba(124,106,247,0.08)', color: '#a78bfa', fontSize: 12, cursor: 'pointer', marginInlineStart: 'auto' }}>
                    {expandedChannelId === ch.id ? <>{t.hideAnalytics}</> : <><BarChart3 size={12} /> {t.analytics}</>}
                    <ChevronDown size={12} style={{ transform: expandedChannelId === ch.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>
                </div>

                {expandedChannelId === ch.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {!runsByChannel[ch.id] ? null : runsByChannel[ch.id].length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12.5, margin: 0 }}>{t.noRuns}</p>
                    ) : runsByChannel[ch.id].filter(r => r.status === 'done').map(run => {
                      const perf = performanceByRun[run.id];
                      return (
                        <div key={run.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{run.idea_title}</div>
                          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>{new Date(run.created_at).toLocaleDateString()}</div>

                          {!run.youtube_video_id ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input value={linkInputs[run.id] || ''} onChange={e => setLinkInputs(prev => ({ ...prev, [run.id]: e.target.value }))} placeholder={t.linkPlaceholder}
                                style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 11.5 }} />
                              <button onClick={() => linkYoutube(ch.id, run.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: 'none', background: '#7c6af7', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}><Link2 size={11} /> {t.link}</button>
                            </div>
                          ) : !perf ? (
                            <button onClick={() => refreshPerformance(run.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(124,106,247,0.3)', background: 'transparent', color: '#a78bfa', fontSize: 11.5, cursor: 'pointer' }}><RefreshCw size={11} /> {t.refreshStats}</button>
                          ) : perf === 'loading' ? (
                            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="spinning" /> {t.loadingStats}</span>
                          ) : perf.error ? (
                            <span style={{ fontSize: 11.5, color: '#ef4444' }}>{perf.error}</span>
                          ) : (
                            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, color: '#d1d5db' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Eye size={12} /> {perf.views ?? '–'} {t.views}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><ThumbsUp size={12} /> {perf.likes ?? '–'} {t.likes}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MessageSquare size={12} /> {perf.comments ?? '–'} {t.comments}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> {formatDuration(perf.avgViewDurationSec)} {t.avgView}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
