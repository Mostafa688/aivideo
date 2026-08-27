// ── PremiumTimelineEditor.jsx ────────────────────────────────────────────────
// ✅ NEW (طلب العميل — تكرر أكتر من مرة، رافق صورة مرجعية من Google Flow): محرر تايم لاين
// احترافي حقيقي، مش صف كروت رمادية بسيطة. نفس المنطق/الـAPI بالظبط بتاع
// AudioVideoTimelineEditor.jsx (الأدمن)، بس شكل شريط فيلم حقيقي متلاصق (زي أي محرر فيديو
// حقيقي — CapCut/Google Flow): خلايا متلاصقة بصورة العنصر كخلفية كاملة، خط تشغيل (playhead)
// متحرك فوق الشريط متزامن مع الفيديو، شريط تحكّم مخصّص (تشغيل/إيقاف + وقت + زووم)، وزرار "+"
// دائري صغير مدمج في الشريط نفسه (مش كارت كبير منفصل) لإضافة/تكملة.
import React, { useState, useEffect, useRef } from 'react';
import { StickerSearchPanel } from './AudioVideoTimelineEditor.jsx';

const BASE_PX_PER_SEC = 50;
const KIND_META = {
  character: { color: '#3b82f6', icon: '👤', label: { ar: 'شخصية', en: 'Character' } },
  object:    { color: '#22c55e', icon: '🖼️', label: { ar: 'ملصق', en: 'Sticker' } },
  text:      { color: '#6b7280', icon: '📝', label: { ar: 'نص', en: 'Text' } },
  quote:     { color: '#a855f7', icon: '📖', label: { ar: 'آية/حديث', en: 'Quote' } },
};

function fmtTime(s) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ✅ FIX (طلب العميل: "الحركة بتاعته غريبة مش عارف احركه، المفروض يتحرك مع معايا بحركة
// الماوس لو على الكومبيوتر وباللمس لو على الموبايل"): بيسحب الـclientX من إيفنت الماوس أو
// اللمس، عشان كل السحب في المحرر (خط التشغيل، نقل اللقطات، تقصير/تطويل الحدود) يشتغل
// بنفس المنطق على الماوس والتاتش من غير تكرار كود
function clientXOf(e) {
  return (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
}

// ✅ FIX (اكتشفناها أثناء اختبار حقيقي للسحب-والإفلات): لو عنصر جديد اتحط بنفس ثانية
// بداية لقطة تانية بالظبط (مثلاً حط ملصق عند خط التشغيل وهو لسه واقف عند 0)، اللقطة
// الأصلية بتنكمش لعرض شبه صفري وتختفي عمليًا من الشريط. الدالة دي بتتأكد إن كل لقطة
// (غير الأولى، اللي دايمًا بتاخد وقت 0 في الفيديو بغض النظر عن قيمتها) لها فرق زمني
// معقول عن اللي قبلها بعد أي ترتيب/إدراج جديد
const MIN_SEG_SEC = 0.3;
function normalizeStarts(els) {
  const out = [...els];
  let prevEffective = 0; // اللقطة الأولى دايمًا بتُعامل كأنها بتبدأ عند 0
  for (let i = 1; i < out.length; i++) {
    const curStart = Number(out[i].start) || 0;
    const finalStart = Math.max(curStart, prevEffective + MIN_SEG_SEC);
    out[i] = { ...out[i], start: finalStart };
    prevEffective = finalStart;
  }
  return out;
}

export default function PremiumTimelineEditor({ job, onSaved, apiBase = '/api/admin/audio-video', authHeaders, lang = 'ar', onRequestExtend, remainingBudgetSec = null }) {
  const headers = authHeaders || { 'Content-Type': 'application/json' };
  const fileHeaders = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type'));
  const t = (ar, en) => (lang === 'ar' ? ar : en);

  const words = job.words_json || [];
  const audioDuration = words.length ? words[words.length - 1].end + 0.3 : 60;

  const [elements, setElements] = useState(job.elements_json || []);
  // ✅ FIX (طلب العميل: "المفروض التعديل يحصل تلقائي علطول من غير ما ادوس حفظ واعد"):
  // بعد أول تحميل، الـelements المحلية بقت مصدر الحقيقة الوحيد — من غير ما نعيد مزامنتها
  // من job.elements_json تاني (غير لو الجوب اتغيّر تمامًا لجوب تاني) — عشان ردود الـpolling
  // أثناء إعادة البناء (بترجع نفس الجوب بعناصر جديدة الشكل بس نفس المحتوى كل 3 ثواني)
  // متلخبطش أي تعديل بيحصل في نفس اللحظة (كان ممكن يمسح تعديل المستخدم لسه محفوظش)
  const lastSavedJsonRef = useRef(JSON.stringify(job.elements_json || []));
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  const savingRef = useRef(false);
  const pendingRerenderRef = useRef(false);
  useEffect(() => {
    const initial = job.elements_json || [];
    setElements(initial);
    lastSavedJsonRef.current = JSON.stringify(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [dragBoundaryIdx, setDragBoundaryIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [showStickerSearch, setShowStickerSearch] = useState(false);
  const [err, setErr] = useState('');
  const [zoom, setZoom] = useState(1);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const trackRef = useRef(null);
  const videoRef = useRef(null);
  const pollRef = useRef(null);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const pxPerSec = BASE_PX_PER_SEC * zoom;

  const segments = elements.map((el, i) => ({
    ...el,
    segStart: i === 0 ? 0 : Number(el.start) || 0,
    segEnd: i < elements.length - 1 ? Number(elements[i + 1].start) || 0 : audioDuration,
  }));
  const showExtendButton = typeof onRequestExtend === 'function' && (remainingBudgetSec == null || remainingBudgetSec > 0);
  const trackWidth = Math.max(600, audioDuration * pxPerSec) + 50;

  useEffect(() => {
    if (dragBoundaryIdx == null) return;
    const handleMove = (e) => {
      if (e.type === 'mousemove' && e.buttons !== 1) return;
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const tt = Math.max(0, Math.min(audioDuration, (clientXOf(e) - rect.left) / pxPerSec));
      setElements(els => {
        const prevStart = dragBoundaryIdx > 0 ? (Number(els[dragBoundaryIdx - 1].start) || 0) : 0;
        const nextStart = dragBoundaryIdx < els.length - 1 ? (Number(els[dragBoundaryIdx + 1].start) || 0) : audioDuration;
        const clamped = Math.max(prevStart + 0.1, Math.min(nextStart - 0.1, tt));
        return els.map((el, i) => i === dragBoundaryIdx ? { ...el, start: clamped } : el);
      });
    };
    const handleUp = () => setDragBoundaryIdx(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragBoundaryIdx, audioDuration, pxPerSec]);

  // ✅ NEW (طلب العميل: "مش عارف ابدل بين العناصر ولو عايز احركه الموضوع صعب"): سحب جسم
  // الخلية نفسها (مش بس الحد بينها وبين اللي جنبها) بيحرّك اللقطة لأي مكان على التايم لاين
  // بحرية — ولو اتحركت لبعد لقطة تانية، الترتيب بيتظبط لوحده (ترتيب تلقائي حسب وقت البداية
  // الجديد) وده اللي بيعمل "استبدال" بين لقطتين. لسه فيه فرق بين "دوس عادي" (يحدد اللقطة
  // بس) و"سحب" (يحركها) — بنفرّق بينهم بعتبة حركة بسيطة (4px) قبل ما نعتبرها سحب فعلي
  const moveDragRef = useRef({ x: 0, startTime: 0, moved: false, idx: null });
  const [movingIdx, setMovingIdx] = useState(null);

  const handleCellMouseDown = (i, e) => {
    // اللقطة الأولى دايمًا بتاخد وقت 0 بغض النظر عن start بتاعها (أول حاجة في الفيديو) —
    // سحبها مش هيغيّر حاجة فعليًا، فبنسمح بس بتحديدها
    if (i === 0) { setSelectedIdx(0); return; }
    e.stopPropagation();
    moveDragRef.current = { x: clientXOf(e), startTime: Number(elements[i].start) || 0, moved: false, idx: i };
    setMovingIdx(i);
  };

  useEffect(() => {
    if (movingIdx == null) return;
    const handleMove = (e) => {
      if (e.type === 'mousemove' && e.buttons !== 1) return;
      const dx = clientXOf(e) - moveDragRef.current.x;
      if (Math.abs(dx) > 4) moveDragRef.current.moved = true;
      if (!moveDragRef.current.moved) return;
      const newStart = Math.max(0.05, Math.min(audioDuration - 0.05, moveDragRef.current.startTime + dx / pxPerSec));
      setElements(els => els.map((el, i) => i === moveDragRef.current.idx ? { ...el, start: newStart } : el));
    };
    const handleUp = () => {
      const { moved, idx } = moveDragRef.current;
      if (moved && idx != null) {
        setElements(els => {
          const movedEl = els[idx];
          const rest = els.filter((_, i) => i !== idx);
          const sorted = [...rest, movedEl].sort((a, b) => (Number(a.start) || 0) - (Number(b.start) || 0));
          // ملحوظة: بنحسب مكان movedEl في sorted قبل التطبيع — التطبيع ممكن يرجّع أوبجكت
          // جديد (start اتغير) في نفس المكان، فمقارنة indexOf بالمرجع بعد التطبيع ممكن تفشل
          const idxInSorted = sorted.indexOf(movedEl);
          setSelectedIdx(idxInSorted);
          return normalizeStarts(sorted);
        });
      } else if (idx != null) {
        setSelectedIdx(idx);
      }
      setMovingIdx(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [movingIdx, audioDuration, pxPerSec]);

  // ✅ خط التشغيل (playhead) بيتزامن مع الفيديو الحقيقي فوق — تجربة محرر فيديو حقيقي
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurTime(v.currentTime);
    const onMeta = () => setDuration(v.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('loadedmetadata', onMeta);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [job.video_url]);

  const togglePlay = () => { const v = videoRef.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };
  const seekTo = (sec) => { const v = videoRef.current; if (v) v.currentTime = Math.max(0, Math.min(duration || sec, sec)); };

  // ✅ FIX (طلب العميل: "خط التشغيل حركته غريبة، مش عارف احركه، المفروض يتحرك مع معايا
  // بحركة الماوس... أو باللمس على الموبايل"): الرولر كان بيحدد المكان مرة واحدة بس لحظة
  // الدوس (onMouseDown)، ولو المستخدم فضل ماسك وسحب من غير ما يرفع إيده، خط التشغيل ماكانش
  // بيتحرك تاني — دلوقتي بيفضل يتابع الماوس/اللمس باستمرار طول ما لسه ماسك، بالظبط زي باقي
  // أنواع السحب التانية في المحرر (نقل اللقطات، تقصير/تطويل الحدود)
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);
  const startPlayheadDrag = (e) => {
    if (!job.video_url || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    seekTo((clientXOf(e) - rect.left) / pxPerSec);
    setDraggingPlayhead(true);
  };
  useEffect(() => {
    if (!draggingPlayhead) return;
    const handleMove = (e) => {
      if (e.type === 'mousemove' && e.buttons !== 1) return;
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      seekTo((clientXOf(e) - rect.left) / pxPerSec);
    };
    const handleEnd = () => setDraggingPlayhead(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: true });
    window.addEventListener('touchend', handleEnd);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [draggingPlayhead, pxPerSec, duration]);

  const updateElement = (idx, patch) => setElements(els => els.map((el, i) => i === idx ? { ...el, ...patch } : el));

  const handleKindChange = (idx, newKind) => {
    if (newKind === 'text' || newKind === 'quote') {
      updateElement(idx, { kind: newKind, imageUrl: null, imagePrompt: null, characterKey: null, quoteSource: newKind === 'quote' ? (elements[idx].quoteSource || 'other') : null });
    } else {
      updateElement(idx, { kind: newKind });
    }
  };

  const handleDelete = (idx) => { setElements(els => els.filter((_, i) => i !== idx)); setSelectedIdx(null); };

  const insertNewElement = (patch) => {
    const idx = selectedIdx != null ? selectedIdx : elements.length - 1;
    const seg = segments[idx] || { segStart: 0, segEnd: audioDuration };
    const mid = (seg.segStart + seg.segEnd) / 2;
    const newEl = { element: t('عنصر جديد', 'New element'), text: t('عنصر جديد', 'New element'), kind: 'text', imagePrompt: null, characterKey: null, quoteSource: null, imageUrl: null, start: mid, end: mid, ...patch };
    setElements(els => { const next = [...els]; next.splice(idx + 1, 0, newEl); return next; });
    setSelectedIdx(idx + 1);
  };

  // ✅ NEW (طلب العميل: "لما يبحث عن عنصر ويلاقيه ياخد العنصر ويحطه في المكان الي هو عايز"):
  // زي insertNewElement فوق، بس بيحسب مكان الإدراج من ثانية مطلقة (مكان الإفلات الفعلي على
  // التايم لاين) مش من اللقطة المختارة حاليًا — ده اللي بيخلي السحب-وإفلات ممكن
  const insertElementAtTime = (timeSec, patch) => {
    const clamped = Math.max(0, Math.min(audioDuration - 0.1, timeSec));
    let idx = segments.findIndex(s => clamped < s.segEnd);
    if (idx === -1) idx = segments.length - 1;
    const newEl = { element: t('ملصق', 'Sticker'), text: t('ملصق', 'Sticker'), kind: 'object', imagePrompt: null, characterKey: null, quoteSource: null, imageUrl: null, start: clamped, end: clamped, ...patch };
    setElements(els => { const next = [...els]; next.splice(idx + 1, 0, newEl); return normalizeStarts(next); });
    setSelectedIdx(idx + 1);
  };

  const [dragOverTime, setDragOverTime] = useState(null);
  const handleStripDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    setDragOverTime(Math.max(0, (e.clientX - rect.left) / pxPerSec));
  };
  const handleStripDragLeave = () => setDragOverTime(null);
  const handleStripDrop = async (e) => {
    e.preventDefault();
    const url = e.dataTransfer.getData('text/plain');
    setDragOverTime(null);
    if (!url || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const time = Math.max(0, (e.clientX - rect.left) / pxPerSec);
    try {
      const r = await fetch(`${apiBase}/jobs/${job.id}/element-from-search`, { method: 'POST', headers, body: JSON.stringify({ url }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not add sticker');
      insertElementAtTime(time, { imageUrl: d.imageUrl });
    } catch (e2) {
      setErr('❌ ' + e2.message);
    }
  };

  // ✅ FIX (طلب العميل: "بضغط عليه بينزل وخلاص كده في اي حته"): الدوس العادي (بدون سحب) كان
  // بيحط الملصق بعد اللقطة المختارة حاليًا — مكان غير متوقع لو مفيش لقطة محددة، ومختلف
  // تمامًا عن منطق السحب-وإفلات (اللي بيحط في مكان الإفلات بالظبط). دلوقتي الاتنين بيستخدموا
  // نفس المرجع: خط التشغيل (playhead) — الدوس بيحط الملصق بالظبط مكان الخط الأبيض اللي
  // شايفه على التايم لاين، بدل ما يحصل في مكان غير مفهوم
  const handleStickerPicked = (imageUrl) => { insertElementAtTime(curTime, { imageUrl }); setShowStickerSearch(false); };

  // ✅ NEW (طلب العميل: "خط نحدد بيه المكان اللي نقف فيه ونقص عنصر"): بيقسم اللقطة
  // المختارة لجزئين عند نقطة خط التشغيل (playhead) بالظبط — الجزء التاني بياخد نفس
  // النوع/الصورة/النص (المستخدم بعدين يعدّل نص كل جزء لوحده)
  const splitAtPlayhead = () => {
    if (selectedIdx == null || !sel) return;
    if (curTime <= sel.segStart + 0.1 || curTime >= sel.segEnd - 0.1) return;
    const orig = elements[selectedIdx];
    const newEl = { ...orig, start: curTime };
    setElements(els => { const next = [...els]; next.splice(selectedIdx + 1, 0, newEl); return next; });
    setSelectedIdx(selectedIdx + 1);
  };

  const handleUploadCustomImage = async (e) => {
    const file = e.target.files[0];
    const inputEl = e.target;
    if (!file || selectedIdx == null) return;
    setUploadingImg(true); setErr('');
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await fetch(`${apiBase}/jobs/${job.id}/element-image`, { method: 'POST', headers: fileHeaders, body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      const curKind = elements[selectedIdx].kind;
      updateElement(selectedIdx, { imageUrl: d.imageUrl, kind: (curKind === 'text' || curKind === 'quote') ? 'object' : curKind });
    } catch (e2) {
      setErr('❌ ' + e2.message);
    } finally {
      setUploadingImg(false);
      if (inputEl) inputEl.value = '';
    }
  };

  // ✅ FIX (طلب العميل: "لما اعمل اي تعديل يبقى تلقائي مش اعمل احفظ التعديلات واعد التوليد"):
  // مفيش أزرار "احفظ"/"احفظ وأعد البناء" تاني — أي تعديل بيتحفظ ويتبني الفيديو من جديد
  // لوحده بعد فترة هدوء قصيرة (debounce) عشان لو المستخدم بيعمل كذا تعديل سريع ورا بعض
  // (زي سحب عنصر بالماوس) تتجمع في عملية رندر واحدة بس. لو تعديل جديد حصل والرندر
  // السابق لسه شغال، بننتظر لحد ما يخلص وبعدين نطلق رندر تاني بأحدث نسخة (pendingRerenderRef)
  const runAutoSaveAndRerender = async () => {
    savingRef.current = true;
    setSaving(true); setErr('');
    try {
      const r = await fetch(`${apiBase}/jobs/${job.id}/elements`, { method: 'POST', headers, body: JSON.stringify({ elements: elementsRef.current }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      onSaved(d.job);
      setSaving(false);
      setRendering(true);
      const r2 = await fetch(`${apiBase}/jobs/${job.id}/render`, { method: 'POST', headers, body: JSON.stringify({ ratio: job.ratio || '16:9' }) });
      const d2 = await r2.json();
      if (!r2.ok) throw new Error(d2.error || 'Render trigger failed');
      onSaved(d2.job);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const rp = await fetch(`${apiBase}/jobs/${job.id}`, { headers });
          const dp = await rp.json();
          if (!rp.ok) return;
          onSaved(dp.job);
          if (['done', 'failed'].includes(dp.job.status)) {
            clearInterval(pollRef.current);
            setRendering(false);
            savingRef.current = false;
            if (pendingRerenderRef.current) { pendingRerenderRef.current = false; runAutoSaveAndRerender(); }
          }
        } catch (e2) { console.error(e2); }
      }, 3000);
    } catch (e) {
      setErr('❌ ' + e.message);
      setSaving(false);
      setRendering(false);
      savingRef.current = false;
      if (pendingRerenderRef.current) { pendingRerenderRef.current = false; runAutoSaveAndRerender(); }
    }
  };

  useEffect(() => {
    const currentJson = JSON.stringify(elements);
    if (currentJson === lastSavedJsonRef.current) return;
    const timer = setTimeout(() => {
      lastSavedJsonRef.current = currentJson;
      if (savingRef.current) { pendingRerenderRef.current = true; return; }
      runAutoSaveAndRerender();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  const hasPendingChanges = JSON.stringify(elements) !== lastSavedJsonRef.current;

  if (!elements.length) return null;
  const ticks = [];
  for (let ti = 0; ti <= audioDuration; ti += 5) ticks.push(ti);
  const sel = selectedIdx != null ? segments[selectedIdx] : null;
  const playheadLeft = job.video_url ? curTime * pxPerSec : null;

  return (
    <div>
      <style>{`
        @keyframes pte-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .pte-cell { transition: box-shadow 0.15s, filter 0.15s; cursor: pointer; position: relative; }
        .pte-cell:hover { filter: brightness(1.15); }
        .pte-cell.selected { box-shadow: inset 0 0 0 3px var(--accent), 0 0 16px rgba(124,106,247,0.5); z-index: 2; }
        .pte-panel { animation: pte-in 0.2s cubic-bezier(0.16,1,0.3,1); }
        .pte-kind-pill { transition: all 0.15s; cursor: pointer; }
        .pte-kind-pill:hover { transform: translateY(-1px); }
        .pte-handle { transition: background 0.15s; }
        .pte-handle:hover { background: rgba(255,255,255,0.35) !important; }
        .pte-transport-btn { width: 34px; height: 34px; border-radius: 50%; background: var(--bg3); border: 1px solid var(--border2); color: var(--text); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; flex-shrink: 0; }
        .pte-transport-btn:hover { background: var(--accent-bg); border-color: var(--accent); color: var(--accent2); }
        .pte-zoom-btn { width: 26px; height: 26px; border-radius: 6px; background: var(--bg3); border: 1px solid var(--border2); color: var(--text2); display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 13px; transition: all 0.15s; }
        .pte-zoom-btn:hover { color: var(--text); border-color: var(--border3); }
        .pte-add-btn { width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: #fff; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 18px; font-weight: 700; box-shadow: 0 4px 16px var(--accent-glow); transition: all 0.15s; }
        .pte-add-btn:hover { transform: scale(1.1); }
      `}</style>

      {/* ✅ FIX (طلب العميل، كرره أكتر من مرة: "التايم لاين محصور في مربع، عايزه ياخد الشاشة
          كلها"): شيلنا كلاس "card" (بورder + زوايا دائرية تقيلة + خلفية مختلفة) اللي كان
          مخلّي السطح كله يحس إنه widget صغير جوه صفحة — دلوقتي مساحة تحرير مستمرة full-bleed
          زي أي أداة فيديو حقيقية، بس فاصل خفيف جدًا (border-radius بسيط) عشان تفضل واضحة
          حدودها من غير ما تحس إنها "متحبسة" */}
      <div style={{ background: 'var(--bg2)', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
        {/* ✅ FIX (طلب العميل: "صغّر شاشة عرض الفيديو نفسها لكن التايم لاين زي ما هو") —
            المعاينة بقت بحجم متواضع (مش full-bleed زي قبل كده)، والتايم لاين تحتها فضل
            بعرضه الكامل من غير أي تغيير */}
        <div style={{ background: '#000', textAlign: 'center', padding: '16px 0' }}>
          {job.video_url ? (
            <video ref={videoRef} src={job.video_url} style={{ maxWidth: 420, maxHeight: 260, width: '100%', objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: 8 }} />
          ) : (
            <div style={{ padding: '60px 0', color: 'var(--text3)', fontSize: 13 }}>
              {t('مفيش معاينة لسه — عدّل أي عنصر وهيتبني الفيديو تلقائي', 'No preview yet — edit any element and the video will build automatically')}
            </div>
          )}
        </div>

        {/* Transport bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
          <button className="pte-transport-btn" onClick={togglePlay} disabled={!job.video_url}>
            {playing ? '⏸' : '▶'}
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums', minWidth: 78 }}>
            {fmtTime(curTime)} / {fmtTime(duration || audioDuration)}
          </span>
          <div style={{ flex: 1 }} />
          {/* ✅ FIX (طلب العميل: "التعديل يحصل تلقائي علطول"): مؤشر حالة الحفظ التلقائي —
              بيستبدل نص "آخر نسخة محفوظة" الثابت، وبيبقى المستخدم عارف بالظبط إيه اللي
              بيحصل من غير ما يحتاج يدوس أي زرار */}
          <span style={{ fontSize: 11, color: saving || rendering ? 'var(--accent2)' : hasPendingChanges ? 'var(--text3)' : 'var(--green)', display: 'flex', alignItems: 'center', gap: 5 }}>
            {saving ? <><span className="spinning" style={{ display: 'inline-block' }}>◐</span> {t('بيتحفظ...', 'Saving...')}</>
              : rendering ? <><span className="spinning" style={{ display: 'inline-block' }}>◐</span> {t('بيبني الفيديو تلقائي...', 'Auto-rebuilding video...')}</>
              : hasPendingChanges ? t('التعديل هيتحفظ تلقائي...', 'Change will autosave shortly...')
              : `✓ ${t('كل التعديلات محفوظة', 'All changes saved')}`}
          </span>
          <div style={{ flex: 1 }} />
          <button className="pte-zoom-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
          <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 32, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="pte-zoom-btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>+</button>
        </div>

        {/* Filmstrip */}
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.6 }}>
              {t('دوس على أي خلية تحددها، اسحبها لمكان تاني تحركها، اسحب الحد بين خليتين تقصّر/تطوّل.', 'Click a cell to select it, drag it to move, drag the border between two cells to trim.')}
            </div>
            <button className="btn-primary" onClick={() => setShowStickerSearch(true)} style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0 }}>
              🔍 {t('دور وضيف ملصق', 'Find & add sticker')}
            </button>
          </div>

          <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
            <div
              ref={trackRef} style={{ position: 'relative', width: trackWidth, userSelect: 'none' }}
              onDragOver={handleStripDragOver} onDragLeave={handleStripDragLeave} onDrop={handleStripDrop}
            >
              {/* ✅ NEW (طلب العميل: "خط نقدر نحدد بيه المكان اللي نقف فيه"): الرولر قابل
                  للدوس عليه/سحبه عشان يحدد مكان خط التشغيل (playhead) بدقة — ده اللي زرار
                  "✂️ قص هنا" تحت بيستخدمه كمرجع لتقسيم اللقطة عند نقطة محددة بالظبط.
                  ✅ FIX: بيفضل يتابع الماوس/اللمس باستمرار طول ما لسه ماسك (مش بس لحظة الدوس) */}
              <div
                style={{ position: 'relative', height: 18, cursor: job.video_url ? 'grab' : 'default', touchAction: 'none' }}
                onMouseDown={startPlayheadDrag}
                onTouchStart={startPlayheadDrag}
              >
                {ticks.map(tk => (
                  <div key={tk} style={{ position: 'absolute', left: tk * pxPerSec, top: 0, fontSize: 10, color: 'var(--text3)' }}>{tk}s</div>
                ))}
              </div>

              {/* contiguous filmstrip cells — خلفية محايدة غامقة (مش ألوان صريحة ملء
                  الخلية، كانت حاسّة "موقع أطفال") + مؤشر لون صغير في الزاوية بس بيدل على
                  النوع، والصورة/الأيقونة هي البطلة الأساسية زي أي فيلم-strip حقيقي */}
              <div style={{ position: 'relative', height: 104, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border2)' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
                  {segments.map((seg, i) => {
                    const meta = KIND_META[seg.kind] || KIND_META.text;
                    const w = Math.max(1, (seg.segEnd - seg.segStart) * pxPerSec);
                    return (
                      <div
                        key={i}
                        className={`pte-cell${selectedIdx === i ? ' selected' : ''}`}
                        onMouseDown={(e) => handleCellMouseDown(i, e)}
                        onTouchStart={(e) => handleCellMouseDown(i, e)}
                        title={i === 0 ? seg.element : `${seg.element} — ${t('اسحب عشان تحرّكه لمكان تاني', 'drag to move it elsewhere')}`}
                        style={{
                          width: w, height: '100%', flexShrink: 0,
                          background: seg.imageUrl ? '#0d0d18' : 'var(--bg3)',
                          borderRight: i < segments.length - 1 ? '1px solid rgba(0,0,0,0.5)' : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                          cursor: i === 0 ? 'pointer' : (movingIdx === i ? 'grabbing' : 'grab'), touchAction: 'none',
                          opacity: movingIdx === i && moveDragRef.current.moved ? 0.6 : 1,
                        }}
                      >
                        <div style={{ position: 'absolute', top: 5, insetInlineStart: 5, width: 7, height: 7, borderRadius: '50%', background: meta.color, zIndex: 1 }} />
                        {seg.imageUrl ? (
                          <img src={seg.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ fontSize: Math.min(34, w * 0.35), opacity: 0.9 }}>{meta.icon}</span>
                        )}
                        {/* caption scrim */}
                        <div style={{
                          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '4px 6px',
                          background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                          fontSize: 10, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {seg.element}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ✅ FIX (طلب العميل: "لو عايز ازود مدته الموضوع صعب شوية"): كان الحد اللي
                    نقدر نمسكه بس 8px — صعب تلقطه بدقة، وكمان مفيش أي مؤشر بصري يقول إن
                    فيه حاجة أصلًا هنا تتمسك. دلوقتي منطقة المسك أوسع (18px) ومعاها مقبض
                    مرئي (خط عمودي فاتح) يبان طول الوقت مش بس وقت الـhover */}
                {elements.map((el, i) => i === 0 ? null : (
                  <div
                    key={`b${i}`}
                    className="pte-handle"
                    onMouseDown={(e) => { e.stopPropagation(); setDragBoundaryIdx(i); }}
                    onTouchStart={(e) => { e.stopPropagation(); setDragBoundaryIdx(i); }}
                    title={t('اسحب عشان تقصّر/تطوّل اللقطتين', 'Drag to trim/extend the two scenes')}
                    style={{
                      position: 'absolute', top: 0, left: (Number(el.start) || 0) * pxPerSec - 9, width: 18, height: '100%',
                      cursor: 'col-resize', zIndex: 5, background: dragBoundaryIdx === i ? 'rgba(124,106,247,0.25)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none',
                    }}
                  >
                    <div style={{
                      width: 4, height: '46%', borderRadius: 3,
                      background: dragBoundaryIdx === i ? 'var(--accent)' : 'rgba(255,255,255,0.4)',
                      boxShadow: dragBoundaryIdx === i ? '0 0 8px var(--accent-glow)' : 'none',
                      pointerEvents: 'none',
                    }} />
                  </div>
                ))}

                {/* playhead — transition بسيط بيلمّس الحركة بين نبضات timeupdate (بتحصل
                    كذا مرة/ثانية) عشان تحس بحركة متصلة زي أي محرر فيديو حقيقي، من غير ما
                    تحس بتأخير محسوس لما تدوس عشان تحدد مكان جديد */}
                {playheadLeft != null && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: playheadLeft, width: 2, background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.8)', zIndex: 6, pointerEvents: 'none', transition: 'left 0.1s linear' }} />
                )}
                {/* ✅ مؤشر مكان الإفلات وقت سحب ملصق من لوحة البحث */}
                {dragOverTime != null && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: dragOverTime * pxPerSec, width: 3, background: 'var(--accent2)', boxShadow: '0 0 10px var(--accent-glow)', zIndex: 7, pointerEvents: 'none' }} />
                )}
              </div>

              {/* inline + to continue */}
              {showExtendButton && (
                <button
                  className="pte-add-btn"
                  onClick={onRequestExtend}
                  title={t('كمّل الفيديو', 'Continue video')}
                  style={{ position: 'absolute', top: 18 + 35, left: audioDuration * pxPerSec + 14 }}
                >
                  +
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit panel */}
      {sel && (
        <div className="card pte-panel" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, color: 'var(--accent2)', fontWeight: 700, marginBottom: 12 }}>
            {t('تعديل اللقطة', 'Editing scene')} #{selectedIdx + 1} · {sel.segStart.toFixed(1)}s–{sel.segEnd.toFixed(1)}s
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {Object.entries(KIND_META).map(([k, meta]) => (
              <div
                key={k} onClick={() => handleKindChange(selectedIdx, k)}
                className="pill pte-kind-pill"
                style={elements[selectedIdx].kind === k ? { background: 'var(--accent-bg)', borderColor: 'var(--accent)', color: 'var(--accent2)' } : {}}
              >
                {meta.icon} {t(meta.label.ar, meta.label.en)}
              </div>
            ))}
          </div>

          <textarea
            value={elements[selectedIdx].element}
            onChange={e => updateElement(selectedIdx, { element: e.target.value, text: e.target.value })}
            rows={2}
            style={{ width: '100%', padding: 10, fontSize: 14, marginBottom: 14, resize: 'vertical', boxSizing: 'border-box' }}
          />

          {(elements[selectedIdx].kind === 'object' || elements[selectedIdx].kind === 'character') && (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              {elements[selectedIdx].imageUrl
                ? <img src={elements[selectedIdx].imageUrl} alt="" style={{ width: 56, height: 56, objectFit: 'contain', background: '#fff', borderRadius: 10, border: '1px solid var(--border2)' }} />
                : <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)', borderRadius: 10, border: '1px dashed var(--border2)', fontSize: 20 }}>🖼️</div>}
              <label className="btn-ghost" style={{ display: 'inline-block', fontSize: 12 }}>
                {uploadingImg ? t('⏳ بيترفع...', '⏳ Uploading...') : t('📤 ارفع صورة', '📤 Upload image')}
                <input type="file" accept="image/*" onChange={handleUploadCustomImage} disabled={uploadingImg} style={{ display: 'none' }} />
              </label>
              <button className="btn-ghost" onClick={() => setShowStickerSearch(true)} style={{ fontSize: 12 }}>🔍 {t('دور ملصق', 'Search sticker')}</button>
              {elements[selectedIdx].imageUrl && (
                <button className="btn-ghost" onClick={() => updateElement(selectedIdx, { imageUrl: null, kind: 'text' })} style={{ color: 'var(--red)', fontSize: 12 }}>
                  {t('امسح', 'Remove')}
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={() => insertNewElement({})} style={{ fontSize: 12.5 }}>➕ {t('عنصر جديد بعد ده', 'New element after this')}</button>
            <button
              className="btn-ghost" onClick={splitAtPlayhead}
              disabled={!job.video_url || curTime <= sel.segStart + 0.1 || curTime >= sel.segEnd - 0.1}
              style={{ fontSize: 12.5 }}
              title={t('حرّك خط التشغيل جوه اللقطة دي الأول', 'Move the playhead inside this scene first')}
            >
              ✂️ {t(`قص هنا (${fmtTime(curTime)})`, `Split here (${fmtTime(curTime)})`)}
            </button>
            <button className="btn-ghost" onClick={() => handleDelete(selectedIdx)} style={{ color: 'var(--red)', fontSize: 12.5 }}>🗑️ {t('احذف اللقطة', 'Delete scene')}</button>
          </div>
        </div>
      )}

      {err && (
        <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
          {err}{' '}
          <button className="btn-ghost" style={{ fontSize: 12, padding: '2px 10px' }} onClick={() => { setErr(''); runAutoSaveAndRerender(); }}>
            {t('إعادة المحاولة', 'Retry')}
          </button>
        </div>
      )}

      {showStickerSearch && (
        <StickerSearchPanel
          apiBase={apiBase} authHeaders={headers} jobId={job.id} onPick={handleStickerPicked} onClose={() => setShowStickerSearch(false)}
          onDragStart={() => {}} lang={lang}
        />
      )}
    </div>
  );
}
