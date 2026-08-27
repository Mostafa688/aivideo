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
      if (e.buttons !== 1 || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const tt = Math.max(0, Math.min(audioDuration, (e.clientX - rect.left) / pxPerSec));
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
  }, [dragBoundaryIdx, audioDuration, pxPerSec]);

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
        {/* Preview */}
        <div style={{ background: '#000', textAlign: 'center' }}>
          {job.video_url ? (
            <video ref={videoRef} src={job.video_url} style={{ maxWidth: '100%', maxHeight: 640, width: '100%', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
          ) : (
            <div style={{ padding: '60px 0', color: 'var(--text3)', fontSize: 13 }}>
              {t('مفيش معاينة لسه — احفظ وأعد البناء عشان تشوف الفيديو', 'No preview yet — save & rebuild to see the video')}
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
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t('آخر نسخة محفوظة', 'Last saved version')}</span>
          <div style={{ flex: 1 }} />
          <button className="pte-zoom-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
          <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 32, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button className="pte-zoom-btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>+</button>
        </div>

        {/* Filmstrip */}
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.6 }}>
              {t('دوس على أي خلية تعدّلها، اسحب الحد بين خليتين تقصّر/تطوّل.', 'Click any cell to edit it, drag the border between two cells to trim.')}
            </div>
            <button className="btn-primary" onClick={() => setShowStickerSearch(true)} style={{ padding: '6px 12px', fontSize: 12, flexShrink: 0 }}>
              🔍 {t('دور وضيف ملصق', 'Find & add sticker')}
            </button>
          </div>

          <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
            <div ref={trackRef} style={{ position: 'relative', width: trackWidth, userSelect: 'none' }}>
              {/* ruler */}
              <div style={{ position: 'relative', height: 18 }}>
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
                        onClick={() => setSelectedIdx(i)}
                        title={seg.element}
                        style={{
                          width: w, height: '100%', flexShrink: 0,
                          background: seg.imageUrl ? '#0d0d18' : 'var(--bg3)',
                          borderRight: i < segments.length - 1 ? '1px solid rgba(0,0,0,0.5)' : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
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

                {/* drag handles between cells */}
                {elements.map((el, i) => i === 0 ? null : (
                  <div
                    key={`b${i}`}
                    className="pte-handle"
                    onMouseDown={(e) => { e.stopPropagation(); setDragBoundaryIdx(i); }}
                    style={{
                      position: 'absolute', top: 0, left: (Number(el.start) || 0) * pxPerSec - 4, width: 8, height: '100%',
                      cursor: 'col-resize', zIndex: 5, background: dragBoundaryIdx === i ? 'var(--accent)' : 'transparent',
                    }}
                  />
                ))}

                {/* playhead */}
                {playheadLeft != null && (
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: playheadLeft, width: 2, background: '#fff', boxShadow: '0 0 6px rgba(255,255,255,0.8)', zIndex: 6, pointerEvents: 'none' }} />
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
