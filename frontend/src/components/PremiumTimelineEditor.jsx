// ── PremiumTimelineEditor.jsx ────────────────────────────────────────────────
// ✅ NEW (طلب العميل: "ده بسيط أوي، عايز زي اللي وريتهولك في الصورة"): نسخة مصمّمة بشكل
// احترافي من محرر التايم لاين، مخصّصة للصفحة العامة (فيديو Whiteboard) — نفس المنطق/الـAPI
// بالظبط بتاع AudioVideoTimelineEditor.jsx (الأدمن)، بس شكل مختلف تمامًا: مشغّل فيديو
// حقيقي فوق (آخر نسخة محفوظة)، كروت لقطات كبيرة بصورة/إيموجي بارز بدل شرايط لون رفيعة،
// لوحة تعديل بتاعمل slide-in بانيميشن، أزرار وأيقونات بستايل الموقع نفسه (btn-primary/
// btn-ghost/card من global.css) بدل مربعات رمادية بسيطة
import React, { useState, useEffect } from 'react';
import { StickerSearchPanel } from './AudioVideoTimelineEditor.jsx';

const TIMELINE_PX_PER_SEC = 56;
const KIND_META = {
  character: { color: '#3b82f6', icon: '👤', label: { ar: 'شخصية', en: 'Character' } },
  object:    { color: '#22c55e', icon: '🖼️', label: { ar: 'ملصق', en: 'Sticker' } },
  text:      { color: '#6b7280', icon: '📝', label: { ar: 'نص', en: 'Text' } },
  quote:     { color: '#a855f7', icon: '📖', label: { ar: 'آية/حديث', en: 'Quote' } },
};

export default function PremiumTimelineEditor({ job, onSaved, apiBase = '/api/admin/audio-video', authHeaders, lang = 'ar', onRequestExtend, remainingBudgetSec = null }) {
  const headers = authHeaders || { 'Content-Type': 'application/json' };
  const fileHeaders = Object.fromEntries(Object.entries(headers).filter(([k]) => k.toLowerCase() !== 'content-type'));
  const t = (ar, en) => (lang === 'ar' ? ar : en);

  const words = job.words_json || [];
  const audioDuration = words.length ? words[words.length - 1].end + 0.3 : 60;

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
  const showExtendCard = typeof onRequestExtend === 'function' && (remainingBudgetSec == null || remainingBudgetSec > 0);
  const trackWidth = Math.max(600, audioDuration * TIMELINE_PX_PER_SEC) + (showExtendCard ? 130 : 0);

  useEffect(() => {
    if (dragBoundaryIdx == null) return;
    const handleMove = (e) => {
      if (e.buttons !== 1 || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const tt = Math.max(0, Math.min(audioDuration, (e.clientX - rect.left) / TIMELINE_PX_PER_SEC));
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

  const handleDelete = (idx) => { setElements(els => els.filter((_, i) => i !== idx)); setSelectedIdx(null); };

  const insertNewElement = (patch) => {
    const idx = selectedIdx != null ? selectedIdx : elements.length - 1;
    const seg = segments[idx] || { segStart: 0, segEnd: audioDuration };
    const mid = (seg.segStart + seg.segEnd) / 2;
    const newEl = { element: t('عنصر جديد', 'New element'), text: t('عنصر جديد', 'New element'), kind: 'text', imagePrompt: null, characterKey: null, quoteSource: null, imageUrl: null, start: mid, end: mid, ...patch };
    setElements(els => { const next = [...els]; next.splice(idx + 1, 0, newEl); return next; });
    setSelectedIdx(idx + 1);
  };

  const handleStickerPicked = (imageUrl) => { insertNewElement({ kind: 'object', element: t('ملصق', 'Sticker'), text: t('ملصق', 'Sticker'), imageUrl }); setShowStickerSearch(false); };

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

  const saveElements = async () => {
    const r = await fetch(`${apiBase}/jobs/${job.id}/elements`, { method: 'POST', headers, body: JSON.stringify({ elements }) });
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
      const r = await fetch(`${apiBase}/jobs/${job.id}/render`, { method: 'POST', headers, body: JSON.stringify({ ratio: job.ratio || '16:9' }) });
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
      }, 3000);
    } catch (e) {
      setErr('❌ ' + e.message);
      setRendering(false);
    } finally {
      setSaving(false);
    }
  };

  if (!elements.length) return null;
  const ticks = [];
  for (let ti = 0; ti <= audioDuration; ti += 5) ticks.push(ti);
  const sel = selectedIdx != null ? segments[selectedIdx] : null;

  return (
    <div>
      <style>{`
        @keyframes pte-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .pte-card { transition: all 0.18s cubic-bezier(0.16,1,0.3,1); cursor: pointer; }
        .pte-card:hover { transform: translateY(-2px); }
        button.pte-card:hover { border-color: var(--accent) !important; background: var(--accent-bg) !important; }
        .pte-card.selected { box-shadow: 0 0 0 2px var(--accent), 0 8px 24px rgba(124,106,247,0.3); }
        .pte-panel { animation: pte-in 0.2s cubic-bezier(0.16,1,0.3,1); }
        .pte-kind-pill { transition: all 0.15s; cursor: pointer; }
        .pte-kind-pill:hover { transform: translateY(-1px); }
        .pte-handle { transition: background 0.15s; }
      `}</style>

      {/* Preview player — last saved render, for context while editing the draft below */}
      <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 16 }}>
        {job.video_url ? (
          <>
            <video src={job.video_url} controls style={{ maxWidth: '100%', maxHeight: 380, borderRadius: 'var(--r-lg)', background: '#000' }} />
            <div style={{ color: 'var(--text3)', fontSize: 11.5, marginTop: 8 }}>
              {t('آخر نسخة محفوظة — احفظ وأعد البناء عشان تشوف التعديلات', 'Last saved version — save & rebuild to see your edits')}
            </div>
          </>
        ) : (
          <div style={{ padding: '40px 0', color: 'var(--text3)', fontSize: 13 }}>
            {t('مفيش معاينة لسه — احفظ وأعد البناء عشان تشوف الفيديو', 'No preview yet — save & rebuild to see the video')}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>🎞️ {t('التايم لاين', 'Timeline')}</div>
          <button className="btn-primary" onClick={() => setShowStickerSearch(true)} style={{ padding: '7px 14px', fontSize: 12.5 }}>
            🔍 {t('دور وضيف ملصق', 'Find & add a sticker')}
          </button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.7 }}>
          {t('دوس على أي لقطة تعدّلها، اسحب الخط الفاصل بين لقطتين تقصّر/تطوّل، أو ضيف عنصر/ملصق جديد.',
             'Click any card to edit it, drag the divider between two cards to trim, or add a new element/sticker.')}
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div ref={trackRef} style={{ position: 'relative', width: trackWidth, height: 118, userSelect: 'none' }}>
            {ticks.map(tk => (
              <div key={tk} style={{ position: 'absolute', left: tk * TIMELINE_PX_PER_SEC, top: 0, bottom: 0, borderRight: '1px dashed var(--border2)', fontSize: 10, color: 'var(--text3)', paddingLeft: 4 }}>{tk}s</div>
            ))}
            {segments.map((seg, i) => {
              const meta = KIND_META[seg.kind] || KIND_META.text;
              const w = Math.max(60, (seg.segEnd - seg.segStart) * TIMELINE_PX_PER_SEC - 6);
              return (
                <div
                  key={i}
                  className={`card pte-card${selectedIdx === i ? ' selected' : ''}`}
                  onClick={() => setSelectedIdx(i)}
                  style={{
                    position: 'absolute', top: 16, left: seg.segStart * TIMELINE_PX_PER_SEC, width: w, height: 86,
                    padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    borderTop: `3px solid ${meta.color}`, overflow: 'hidden',
                  }}
                  title={seg.element}
                >
                  {seg.imageUrl
                    ? <img src={seg.imageUrl} alt="" style={{ width: 34, height: 34, objectFit: 'contain', background: '#fff', borderRadius: 6 }} />
                    : <span style={{ fontSize: 22 }}>{meta.icon}</span>}
                  <span style={{ fontSize: 10.5, color: 'var(--text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{seg.element}</span>
                </div>
              );
            })}
            {elements.map((el, i) => i === 0 ? null : (
              <div
                key={`b${i}`}
                className="pte-handle"
                onMouseDown={(e) => { e.stopPropagation(); setDragBoundaryIdx(i); }}
                style={{
                  position: 'absolute', top: 16, left: (Number(el.start) || 0) * TIMELINE_PX_PER_SEC - 5, width: 10, height: 86,
                  cursor: 'col-resize', zIndex: 5, background: dragBoundaryIdx === i ? 'var(--accent)' : 'transparent', borderRadius: 4,
                }}
              />
            ))}
            {/* ✅ NEW (طلب العميل: "+" جنب الفيديو زي الصورة اللي وريتهولي) — كارت "+" في آخر
                التايم لاين، مش داخل مدة الفيديو الحالية — بيفتح تدفق "تكملة الفيديو" (رفع
                صوت إضافي + AI/يدوي) بدل ما يكون زرار منفصل برّه التايم لاين خالص */}
            {showExtendCard && (
              <button
                onClick={onRequestExtend}
                className="pte-card"
                style={{
                  position: 'absolute', top: 16, left: audioDuration * TIMELINE_PX_PER_SEC + 14, width: 100, height: 86,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
                  background: 'transparent', border: '2px dashed var(--border3)', borderRadius: 'var(--r-lg)', color: 'var(--accent2)',
                }}
                title={t('كمّل الفيديو', 'Continue video')}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>➕</span>
                <span style={{ fontSize: 10.5, fontWeight: 600 }}>{t('كمّل الفيديو', 'Continue')}</span>
              </button>
            )}
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
            <button className="btn-ghost" onClick={() => handleDelete(selectedIdx)} style={{ color: 'var(--red)', fontSize: 12.5 }}>🗑️ {t('احذف اللقطة', 'Delete scene')}</button>
          </div>
        </div>
      )}

      {err && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
        <button className="btn-ghost" disabled={saving || rendering} onClick={handleSave}>
          {saving && !rendering ? t('⏳ بيحفظ...', '⏳ Saving...') : `💾 ${t('احفظ بس', 'Save only')}`}
        </button>
        <button className="btn-primary" disabled={saving || rendering} onClick={handleSaveAndRerender}>
          {rendering ? t('⏳ بيبني الفيديو من تاني...', '⏳ Rebuilding video...') : `🎬 ${t('احفظ وأعد بناء الفيديو', 'Save & rebuild video')}`}
        </button>
      </div>

      {showStickerSearch && (
        <StickerSearchPanel apiBase={apiBase} authHeaders={headers} jobId={job.id} onPick={handleStickerPicked} onClose={() => setShowStickerSearch(false)} />
      )}
    </div>
  );
}
