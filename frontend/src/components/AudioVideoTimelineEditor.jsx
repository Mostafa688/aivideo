// ── AudioVideoTimelineEditor.jsx ─────────────────────────────────────────────
// ✅ NEW: اتفصل من AdminPage.jsx (كان اسمه TimelineEditor، تعريف محلي جوه ملف الأدمن) لملف
// مستقل قابل لإعادة الاستخدام — أول خطوة عشان نفس محرر التايم لاين (زي CapCut) يستخدم في
// صفحة عامة للمستخدمين مش بس في لوحة الأدمن. بياخد apiBase وheaders كـ props بدل ما يفترض
// مسار/مفتاح الأدمن مباشرة، عشان صفحة عامة تقدر تمرر مسار API ومصادقة مختلفة (سيشن يوزر
// بدل ADMIN_SECRET) من غير ما تلمس الكود الداخلي خالص.
//
// ✅ إضافة جديدة هنا (مش موجودة قبل كده حتى في أداة الأدمن): "🔍 دور وضيف ملصق" — خانة بحث
// حقيقية بترجع نتائج فعلية من 4 مصادر (Iconify/Tenor/Giphy/GitHub emoji) يختار الأدمن/
// المستخدم منها بنفسه بدل ما الذكاء الاصطناعي يختار تلقائي أثناء الاستخراج. النتيجة
// المختارة بتتحمّل وتترفع على R2 بتاعنا (مش رابط خارجي مباشر) وتتضاف كلقطة جديدة.
//
// ⚠️ حد معروف (خارج نطاق التعديل ده عمدًا): الرندر الحالي (audioVideoRenderService.js)
// بيحط كل ملصق في نص الفريم بالظبط بحركة pop ثابتة — مفيش "اسحبه لأي مكان على الشاشة" ولا
// "اختار نوع أنيميشن مختلف لكل عنصر" لسه. ده تغيير أكبر في محرك الرندر نفسه (مواقع x/y حرة
// + أنواع حركة متعددة)، هيتعمل في مرحلة لاحقة لو اتطلب صراحة.
import React, { useState, useEffect } from 'react';

const TIMELINE_PX_PER_SEC = 42;
const TIMELINE_KIND_COLOR = { character: '#3b82f6', object: '#22c55e', text: '#6b7280', quote: '#a855f7' };
const TIMELINE_KIND_LABEL = { character: '👤 شخصية', object: '🖼️ ملصق', text: '📝 نص', quote: '📖 آية/حديث' };
const SOURCE_LABEL = { iconify: 'Iconify', tenor: 'Tenor', giphy: 'Giphy', github: 'GitHub' };

// ✅ NEW: لوحة بحث/إضافة ملصق يدوي — منفصلة كمكوّن فرعي عشان تفضل مستقلة وسهلة إعادة الاستخدام
function StickerSearchPanel({ apiBase, authHeaders, jobId, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(null); // index of result being adopted
  const [err, setErr] = useState('');

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setSearching(true); setErr(''); setResults([]);
    try {
      const r = await fetch(`${apiBase}/sticker-search?q=${encodeURIComponent(q.trim())}`, { headers: authHeaders });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Search failed');
      setResults(d.results || []);
    } catch (e2) {
      setErr('❌ ' + e2.message);
    } finally {
      setSearching(false);
    }
  };

  const pick = async (result, idx) => {
    setAdding(idx); setErr('');
    try {
      const r = await fetch(`${apiBase}/jobs/${jobId}/element-from-search`, {
        method: 'POST', headers: authHeaders, body: JSON.stringify({ url: result.url }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not add sticker');
      onPick(d.imageUrl);
    } catch (e2) {
      setErr('❌ ' + e2.message);
    } finally {
      setAdding(null);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#12121f', border: '1px solid #2d2d4a', borderRadius: 12, padding: 18, width: 'min(520px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>🔍 دور وضيف ملصق</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="اكتب كلمة بحث بالإنجليزي (مثلاً: book, mosque, happy man)..."
            style={{ flex: 1, background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: '8px 10px', fontSize: 13 }}
          />
          <button type="submit" disabled={searching} style={{ background: '#7c6af7', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {searching ? '⏳' : 'بحث'}
          </button>
        </form>
        {err && <div style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
          {results.map((r, i) => (
            <button
              key={i} onClick={() => pick(r, i)} disabled={adding != null}
              title={`${r.label} (${SOURCE_LABEL[r.source] || r.source})`}
              style={{
                background: '#fff', border: adding === i ? '2px solid #7c6af7' : '1px solid #2d2d4a', borderRadius: 8,
                padding: 6, cursor: adding != null ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}
            >
              <img src={r.url} alt={r.label} style={{ width: 60, height: 60, objectFit: 'contain' }} />
              <span style={{ fontSize: 9, color: '#6b7280' }}>{SOURCE_LABEL[r.source] || r.source}</span>
            </button>
          ))}
        </div>
        {!searching && results.length === 0 && q.trim() && !err && (
          <div style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', padding: 12 }}>مفيش نتائج — جرب كلمة تانية بالإنجليزي</div>
        )}
      </div>
    </div>
  );
}

export default function TimelineEditor({ job, onSaved, apiBase = '/api/admin/audio-video', authHeaders }) {
  const headers = authHeaders || { 'Content-Type': 'application/json', 'x-admin-secret': import.meta.env.VITE_ADMIN_SECRET || 'Sosa6892Midbok' };
  const fileHeaders = { 'x-admin-secret': headers['x-admin-secret'] };

  const words = job.words_json || [];
  const audioDuration = words.length ? words[words.length - 1].end + 0.3 : 60;
  const compositeScenes = job.composite_scenes_json || [];

  const [elements, setElements] = useState(job.elements_json || []);
  useEffect(() => { setElements(job.elements_json || []); }, [job.id, job.elements_json]);

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [dragBoundaryIdx, setDragBoundaryIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [showStickerSearch, setShowStickerSearch] = useState(false);
  const [err, setErr] = useState('');
  const trackRef = React.useRef(null);
  const pollRef = React.useRef(null);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const segments = elements.map((el, i) => ({
    ...el,
    segStart: i === 0 ? 0 : Number(el.start) || 0,
    segEnd: i < elements.length - 1 ? Number(elements[i + 1].start) || 0 : audioDuration,
  }));
  const trackWidth = Math.max(600, audioDuration * TIMELINE_PX_PER_SEC);

  useEffect(() => {
    if (dragBoundaryIdx == null) return;
    const handleMove = (e) => {
      if (e.buttons !== 1 || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const t = Math.max(0, Math.min(audioDuration, (e.clientX - rect.left) / TIMELINE_PX_PER_SEC));
      setElements(els => {
        const prevStart = dragBoundaryIdx > 0 ? (Number(els[dragBoundaryIdx - 1].start) || 0) : 0;
        const nextStart = dragBoundaryIdx < els.length - 1 ? (Number(els[dragBoundaryIdx + 1].start) || 0) : audioDuration;
        const clamped = Math.max(prevStart + 0.1, Math.min(nextStart - 0.1, t));
        return els.map((el, i) => i === dragBoundaryIdx ? { ...el, start: clamped } : el);
      });
    };
    const handleUp = () => setDragBoundaryIdx(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { window.removeEventListener('mousemove', handleMove); window.removeEventListener('mouseup', handleUp); };
  }, [dragBoundaryIdx, audioDuration]);

  const updateElement = (idx, patch) => setElements(els => els.map((el, i) => i === idx ? { ...el, ...patch } : el));

  const handleKindChange = (idx, newKind) => {
    if (newKind === 'text' || newKind === 'quote') {
      updateElement(idx, { kind: newKind, imageUrl: null, imagePrompt: null, characterKey: null, quoteSource: newKind === 'quote' ? (elements[idx].quoteSource || 'other') : null });
    } else {
      updateElement(idx, { kind: newKind });
    }
  };

  const handleDelete = (idx) => {
    setElements(els => els.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const insertNewElement = (patch) => {
    const idx = selectedIdx != null ? selectedIdx : elements.length - 1;
    const seg = segments[idx] || { segStart: 0, segEnd: audioDuration };
    const mid = (seg.segStart + seg.segEnd) / 2;
    const newEl = { element: 'عنصر جديد', text: 'عنصر جديد', kind: 'text', imagePrompt: null, characterKey: null, quoteSource: null, imageUrl: null, start: mid, end: mid, ...patch };
    setElements(els => {
      const next = [...els];
      next.splice(idx + 1, 0, newEl);
      return next;
    });
    setSelectedIdx(idx + 1);
  };

  const handleAddAfter = (idx) => insertNewElement({});

  // ✅ NEW: نتيجة بحث الملصق اتحمّلت وترفعت (imageUrl بتاعنا) — بنضيفها كعنصر جديد "ملصق"
  // (kind:'object') بعد اللقطة المختارة حاليًا، بنفس منطق "+ عنصر جديد" الموجود
  const handleStickerPicked = (imageUrl) => {
    insertNewElement({ kind: 'object', element: 'ملصق', text: 'ملصق', imageUrl });
    setShowStickerSearch(false);
  };

  const handleUploadCustomImage = async (e) => {
    const file = e.target.files[0];
    const inputEl = e.target;
    if (!file || selectedIdx == null) return;
    setUploadingImg(true); setErr('');
    try {
      const form = new FormData();
      form.append('image', file);
      const r = await fetch(`${apiBase}/jobs/${job.id}/element-image`, {
        method: 'POST', headers: fileHeaders, body: form,
      });
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

  const saveElements = async () => {
    const r = await fetch(`${apiBase}/jobs/${job.id}/elements`, {
      method: 'POST', headers, body: JSON.stringify({ elements }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Save failed');
    return d.job;
  };

  const handleSave = async () => {
    setSaving(true); setErr('');
    try { onSaved(await saveElements()); } catch (e) { setErr('❌ ' + e.message); } finally { setSaving(false); }
  };

  const handleSaveAndRerender = async () => {
    setSaving(true); setErr('');
    try {
      const savedJob = await saveElements();
      onSaved(savedJob);
      setRendering(true);
      const r = await fetch(`${apiBase}/jobs/${job.id}/render`, {
        method: 'POST', headers, body: JSON.stringify({ ratio: job.ratio || '16:9' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Render trigger failed');
      onSaved(d.job);
      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const rp = await fetch(`${apiBase}/jobs/${job.id}`, { headers });
          const dp = await rp.json();
          if (!rp.ok) return;
          onSaved(dp.job);
          if (['done', 'failed'].includes(dp.job.status)) { clearInterval(pollRef.current); setRendering(false); }
        } catch (e2) { console.error(e2); }
      }, 4000);
    } catch (e) {
      setErr('❌ ' + e.message);
      setRendering(false);
    } finally {
      setSaving(false);
    }
  };

  if (!elements.length) return null;
  const ticks = [];
  for (let t = 0; t <= audioDuration; t += 10) ticks.push(t);
  const sel = selectedIdx != null ? segments[selectedIdx] : null;

  return (
    <div style={{ border: '1px solid #2d2d4a', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: '#fff', fontSize: 13 }}>🎞️ تايم لاين تعديل الفيديو</div>
        <button onClick={() => setShowStickerSearch(true)} style={{ background: '#1a1a2e', border: '1px solid #7c6af7', color: '#a78bfa', borderRadius: 6, padding: '5px 10px', fontSize: 11.5, cursor: 'pointer' }}>
          🔍 دور وضيف ملصق
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: '#9ca3af', marginBottom: 10, lineHeight: 1.7 }}>
        اضغط على أي لقطة عشان تعدّل نصها أو ملصقها أو تحذفها، اسحب الحد الفاصل بين لقطتين عشان تقصّر/تطوّل واحدة منهم، دوس "+ عنصر جديد" لتقسيم لقطة لحتتين، أو "🔍 دور وضيف ملصق" عشان تدور بنفسك على ملصق حقيقي وتضيفه. لما تخلص، احفظ وأعد بناء الفيديو.
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid #1a1a2e', borderRadius: 8, background: '#0d0d18' }}>
        <div ref={trackRef} style={{ position: 'relative', width: trackWidth, height: 74, userSelect: 'none' }}>
          {ticks.map(t => (
            <div key={t} style={{ position: 'absolute', left: t * TIMELINE_PX_PER_SEC, top: 0, bottom: 0, borderRight: '1px solid #1f1f38', fontSize: 9.5, color: '#565676', paddingRight: 3 }}>{t}s</div>
          ))}
          {segments.map((seg, i) => (
            <div
              key={i}
              onClick={() => setSelectedIdx(i)}
              style={{
                position: 'absolute', top: 14, left: seg.segStart * TIMELINE_PX_PER_SEC,
                width: Math.max(2, (seg.segEnd - seg.segStart) * TIMELINE_PX_PER_SEC - 2), height: 44,
                background: TIMELINE_KIND_COLOR[seg.kind] || '#6b7280', opacity: selectedIdx === i ? 1 : 0.72,
                border: selectedIdx === i ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)',
                borderRadius: 5, cursor: 'pointer', boxSizing: 'border-box', overflow: 'hidden',
                display: 'flex', alignItems: 'center', gap: 4, padding: '0 4px',
              }}
              title={seg.element}
            >
              {seg.imageUrl && <img src={seg.imageUrl} alt="" style={{ width: 20, height: 20, objectFit: 'contain', background: '#fff', borderRadius: 3, flexShrink: 0 }} />}
              <span style={{ fontSize: 10, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{seg.element}</span>
            </div>
          ))}
          {elements.map((el, i) => i === 0 ? null : (
            <div
              key={`b${i}`}
              onMouseDown={(e) => { e.stopPropagation(); setDragBoundaryIdx(i); }}
              style={{
                position: 'absolute', top: 14, left: (Number(el.start) || 0) * TIMELINE_PX_PER_SEC - 4, width: 8, height: 44,
                cursor: 'col-resize', zIndex: 5, background: dragBoundaryIdx === i ? 'rgba(255,255,255,0.5)' : 'transparent',
              }}
            />
          ))}
          {compositeScenes.map((cs, i) => (
            <div key={`cs${i}`} style={{
              position: 'absolute', bottom: 2, left: cs.startTime * TIMELINE_PX_PER_SEC,
              width: Math.max(2, (cs.endTime - cs.startTime) * TIMELINE_PX_PER_SEC), height: 8,
              background: '#f59e0b', borderRadius: 3, opacity: 0.85,
            }} title={`مشهد مركّب: ${cs.startTime}s–${cs.endTime}s`} />
          ))}
        </div>
      </div>

      {sel && (
        <div style={{ marginTop: 14, padding: 12, border: '1px solid #2d2d4a', borderRadius: 8, background: '#12121f' }}>
          <div style={{ fontSize: 12, color: '#a78bfa', marginBottom: 8 }}>
            تعديل اللقطة #{selectedIdx + 1} · {sel.segStart.toFixed(1)}s–{sel.segEnd.toFixed(1)}s
          </div>
          <textarea
            value={elements[selectedIdx].element}
            onChange={e => updateElement(selectedIdx, { element: e.target.value, text: e.target.value })}
            rows={2}
            style={{ width: '100%', background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: 8, fontSize: 13, marginBottom: 8, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <select value={elements[selectedIdx].kind} onChange={e => handleKindChange(selectedIdx, e.target.value)} style={{ background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}>
              {Object.entries(TIMELINE_KIND_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
            {selectedIdx > 0 && (
              <input
                type="number" title="ثانية بداية اللقطة دي (من بداية الفيديو كله) — بيغيّر تلقائيًا نهاية اللي قبلها"
                value={elements[selectedIdx].start}
                onChange={e => {
                  const t = Math.max(0, Number(e.target.value) || 0);
                  const prevStart = selectedIdx > 1 ? (Number(elements[selectedIdx - 1].start) || 0) : 0;
                  const nextStart = selectedIdx < elements.length - 1 ? (Number(elements[selectedIdx + 1].start) || 0) : audioDuration;
                  updateElement(selectedIdx, { start: Math.max(prevStart + 0.1, Math.min(nextStart - 0.1, t)) });
                }}
                style={{ width: 100, background: '#0d0d18', color: '#fff', border: '1px solid #2d2d4a', borderRadius: 6, padding: '5px 8px', fontSize: 12.5 }}
              />
            )}
          </div>
          {(elements[selectedIdx].kind === 'object' || elements[selectedIdx].kind === 'character') && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              {elements[selectedIdx].imageUrl
                ? <img src={elements[selectedIdx].imageUrl} alt="" style={{ width: 50, height: 50, objectFit: 'contain', background: '#fff', borderRadius: 6, border: '1px solid #2d2d4a' }} />
                : <div style={{ width: 50, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', borderRadius: 6, border: '1px dashed #2d2d4a', fontSize: 9, color: '#6b7280', textAlign: 'center' }}>بدون ملصق</div>}
              <input type="file" accept="image/*" onChange={handleUploadCustomImage} disabled={uploadingImg} style={{ fontSize: 12, color: '#d1d5db' }} />
              {uploadingImg && <span style={{ color: '#7c6af7', fontSize: 12 }}>⏳ بيترفع...</span>}
              {elements[selectedIdx].imageUrl && (
                <button onClick={() => updateElement(selectedIdx, { imageUrl: null, kind: 'text', imagePrompt: null, characterKey: null })} style={{ background: 'none', border: '1px solid #2d2d4a', color: '#f87171', borderRadius: 6, padding: '4px 10px', fontSize: 11.5, cursor: 'pointer' }}>امسح الملصق (يتحول نص)</button>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleAddAfter(selectedIdx)} style={{ background: '#1a1a2e', border: '1px solid #2d2d4a', color: '#a78bfa', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>+ عنصر جديد بعد ده</button>
            <button onClick={() => handleDelete(selectedIdx)} style={{ background: 'none', border: '1px solid #2d2d4a', color: '#f87171', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>🗑️ احذف اللقطة دي</button>
          </div>
        </div>
      )}

      {err && <div style={{ color: '#f87171', fontSize: 12, marginTop: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button onClick={handleSave} disabled={saving || rendering} style={{ background: saving ? '#1a1a2e' : '#374151', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 12.5, fontWeight: 700, cursor: (saving || rendering) ? 'not-allowed' : 'pointer' }}>
          {saving && !rendering ? '⏳ بيحفظ...' : '💾 احفظ التعديلات بس'}
        </button>
        <button onClick={handleSaveAndRerender} disabled={saving || rendering} style={{ background: rendering ? '#1a1a2e' : '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 12.5, fontWeight: 700, cursor: (saving || rendering) ? 'not-allowed' : 'pointer' }}>
          {rendering ? '⏳ بيبني الفيديو من تاني... (ممكن ياخد كام دقيقة)' : '💾🎬 احفظ وأعد بناء الفيديو'}
        </button>
      </div>

      {showStickerSearch && (
        <StickerSearchPanel
          apiBase={apiBase} authHeaders={headers} jobId={job.id}
          onPick={handleStickerPicked} onClose={() => setShowStickerSearch(false)}
        />
      )}
    </div>
  );
}
