// ── MarqueeSelect.jsx ── تحديد مجموعة عناصر بالسحب (مربع التحديد زي سطح المكتب في ويندوز) + علامة اختيار على كل كارت
// + شريط أوامر (تنزيل ZIP / حذف). العنصر القابل للتحديد لازم يكون عليه data-select-id="..."
// - اسحب من مكان فاضي جوه الشبكة → مربع شفاف، وأي كارت يلمسه يتحدد (Ctrl/Shift = إضافة للتحديد الحالي)
// - Ctrl/⌘ + كليك على كارت = تحديد/إلغاء، ولما يكون فيه تحديد الكليك العادي بيبدّل التحديد بدل ما يفتح
// - كليك في مكان فاضي أو Esc = إلغاء التحديد، Ctrl/⌘ + A = تحديد الكل
// - على الموبايل: دايرة الاختيار اللي في ركن كل كارت
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, Trash2, X, Loader2, CheckSquare } from 'lucide-react';

const INTERACTIVE = 'button, a, input, textarea, select, video, audio, label, [contenteditable="true"], [data-select-ignore]';

export function useMarqueeSelect({ containerRef, scrollRef = null, enabled = true }) {
  const [selected, setSelected] = useState(() => new Set());
  const [box, setBox] = useState(null);
  const drag = useRef(null);
  const justDragged = useRef(false);
  const selRef = useRef(selected); selRef.current = selected;

  const scrollEl = () => scrollRef?.current || document.scrollingElement || document.documentElement;
  const offs = () => { const el = scrollEl(); return { x: el.scrollLeft || 0, y: el.scrollTop || 0 }; };
  const allIds = () => [...(containerRef.current?.querySelectorAll('[data-select-id]') || [])].map(n => n.getAttribute('data-select-id'));
  const clear = useCallback(() => setSelected(new Set()), []);
  const toggle = useCallback((id) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);

  useEffect(() => {
    const root = containerRef.current; if (!root || !enabled) return undefined;
    const hitTest = (rect) => {
      const out = [];
      root.querySelectorAll('[data-select-id]').forEach(n => {
        const r = n.getBoundingClientRect();
        if (r.right >= rect.left && r.left <= rect.right && r.bottom >= rect.top && r.top <= rect.bottom) out.push(n.getAttribute('data-select-id'));
      });
      return out;
    };
    let raf = 0, lastPt = null;
    const update = () => {
      const d = drag.current; if (!d || !lastPt) return;
      const o = offs();
      const x1 = d.sx - o.x, y1 = d.sy - o.y, x2 = lastPt.x, y2 = lastPt.y;
      const rect = { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) };
      if (!d.active && Math.hypot(x2 - (d.sx - o.x), y2 - (d.sy - o.y)) < 5) return;
      d.active = true;
      setBox({ left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top });
      const n = new Set(d.base); hitTest(rect).forEach(id => n.add(id)); setSelected(n);
      // سحب لتحت/لفوق قرب حافة الشاشة = سكرول
      const el = scrollEl(), vr = scrollRef?.current ? scrollRef.current.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      if (y2 > vr.bottom - 40) el.scrollTop += 14; else if (y2 < vr.top + 40) el.scrollTop -= 14;
    };
    const onMove = (e) => { if (!drag.current) return; lastPt = { x: e.clientX, y: e.clientY }; if (drag.current.active) e.preventDefault(); cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    const onUp = () => {
      const d = drag.current; drag.current = null; cancelAnimationFrame(raf);
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (d?.active) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0); }
      else if (d && !d.additive && d.onEmpty) setSelected(new Set()); // كليك في مكان فاضي
      setBox(null);
    };
    const onDown = (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      if (e.target.closest(INTERACTIVE)) return;
      const onCard = !!e.target.closest('[data-select-id]');
      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
      if (onCard && !additive) return; // السحب بيبدأ من مكان فاضي (زي ويندوز)، أو من فوق كارت مع Ctrl/Shift
      const o = offs();
      drag.current = { sx: e.clientX + o.x, sy: e.clientY + o.y, base: additive ? new Set(selRef.current) : new Set(), additive, active: false, onEmpty: !onCard };
      lastPt = { x: e.clientX, y: e.clientY };
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove, { passive: false }); window.addEventListener('pointerup', onUp);
    };
    // كليك على كارت: Ctrl/⌘ أو وجود تحديد = تبديل التحديد بدل فتح الكارت
    const onClickCapture = (e) => {
      if (justDragged.current) { e.stopPropagation(); e.preventDefault(); return; }
      const card = e.target.closest('[data-select-id]'); if (!card || !root.contains(card)) return;
      if (e.target.closest(INTERACTIVE)) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || selRef.current.size > 0) { e.stopPropagation(); e.preventDefault(); toggle(card.getAttribute('data-select-id')); }
    };
    const onKey = (e) => {
      const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
      if (e.key === 'Escape' && selRef.current.size) setSelected(new Set());
      else if (!typing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && root.offsetParent !== null && allIds().length) { e.preventDefault(); setSelected(new Set(allIds())); }
    };
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('click', onClickCapture, true);
    window.addEventListener('keydown', onKey);
    return () => { root.removeEventListener('pointerdown', onDown); root.removeEventListener('click', onClickCapture, true); window.removeEventListener('keydown', onKey); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [containerRef, scrollRef, enabled, toggle]);

  // لو عنصر اتشال من الشبكة يتشال من التحديد
  const prune = useCallback((ids) => setSelected(s => { const keep = new Set(ids.map(String)); const n = new Set([...s].filter(x => keep.has(x))); return n.size === s.size ? s : n; }), []);
  const selectAll = useCallback(() => setSelected(new Set(allIds())), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { selected, setSelected, toggle, clear, prune, selectAll, box };
}

/** المربع الشفاف نفسه (بيترسم فوق الصفحة) */
export function MarqueeBox({ box }) {
  if (!box) return null;
  return <div aria-hidden="true" style={{ position: 'fixed', left: box.left, top: box.top, width: box.width, height: box.height, background: 'rgba(124,106,247,0.16)', border: '1px solid rgba(150,135,255,0.85)', borderRadius: 3, pointerEvents: 'none', zIndex: 300 }} />;
}

/** دايرة الاختيار في ركن الكارت (بتبان مع الهوفر، وعلى طول لما يكون فيه تحديد) */
export function SelectCheck({ id, selected, anySelected, onToggle, lang = 'ar' }) {
  return (
    <button type="button" data-select-ignore onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(id); }}
      className={`mq-check${selected ? ' on' : ''}${anySelected ? ' show' : ''}`}
      aria-pressed={selected} aria-label={lang === 'ar' ? (selected ? 'إلغاء التحديد' : 'تحديد') : (selected ? 'Deselect' : 'Select')}
      style={{ position: 'absolute', top: 10, insetInlineStart: 10, zIndex: 5, width: 26, height: 26, borderRadius: 999, border: selected ? 'none' : '2px solid rgba(255,255,255,0.85)', background: selected ? 'var(--accent, #7c6af7)' : 'rgba(0,0,0,0.35)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.35)', padding: 0 }}>
      {selected && <Check size={15} strokeWidth={3} />}
    </button>
  );
}

/** إطار التحديد حوالين الكارت */
export const selectedRing = (on) => (on ? { outline: '2.5px solid var(--accent, #7c6af7)', outlineOffset: 2 } : null);

/** CSS مشترك: الدايرة بتظهر مع الهوفر */
export const MARQUEE_CSS = `.mq-check{opacity:0;transition:opacity .15s ease, transform .15s ease}.mq-item:hover .mq-check,.mq-check.show,.mq-check.on,.mq-check:focus-visible{opacity:1}@media (hover:none){.mq-check{opacity:1}}`;

/** شريط الأوامر تحت الشاشة لما يكون فيه عناصر متحددة */
export function SelectionBar({ count, lang = 'ar', onDownload, onDelete, onClear, onSelectAll, busy = null, deleteLabel = null }) {
  if (!count && !busy) return null;
  const ar = lang === 'ar';
  const btn = { display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', fontFamily: 'inherit' };
  return (
    <div dir={ar ? 'rtl' : 'ltr'} data-select-ignore style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 310, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 16, background: 'rgba(18,18,26,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 12px 40px rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)', maxWidth: 'calc(100vw - 24px)', flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', padding: '0 8px', fontVariantNumeric: 'tabular-nums' }}>
        {busy ? busy : (ar ? `${count} متحدد` : `${count} selected`)}
      </span>
      {onSelectAll && <button onClick={onSelectAll} disabled={!!busy} style={{ ...btn, background: 'rgba(255,255,255,0.08)', color: '#fff' }}><CheckSquare size={15} /> {ar ? 'تحديد الكل' : 'Select all'}</button>}
      {onDownload && <button onClick={onDownload} disabled={!!busy} style={{ ...btn, background: 'linear-gradient(135deg,#7c6af7,#9d4edd)', color: '#fff', opacity: busy ? 0.6 : 1 }}>{busy ? <Loader2 size={15} className="spin" /> : <Download size={15} />} {ar ? 'تنزيل ZIP' : 'Download ZIP'}</button>}
      {onDelete && <button onClick={onDelete} disabled={!!busy} style={{ ...btn, background: 'rgba(248,113,113,0.14)', color: '#f87171' }}><Trash2 size={15} /> {deleteLabel || (ar ? 'حذف' : 'Delete')}</button>}
      <button onClick={onClear} disabled={!!busy} title={ar ? 'إلغاء التحديد' : 'Clear selection'} style={{ ...btn, padding: 9, background: 'transparent', color: 'rgba(255,255,255,0.7)' }}><X size={16} /></button>
    </div>
  );
}
