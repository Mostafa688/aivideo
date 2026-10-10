// ── FancySelect.jsx ── قائمة اختيار مخصّصة بتصميم موحّد (بدل <select> الافتراضي للمتصفح) + أورب الصوت
// options: [{ value, label, sub?, orb?: seed, icon?: LucideIcon, badge? }]
// بتشتغل بالكيبورد (أسهم/Enter/Esc/كتابة حرف)، فيها بحث تلقائي لو الخيارات كتير، وبتتفتح لفوق لو مفيش مكان تحت.
import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

const CSS = `
.fs-btn{width:100%;display:flex;align-items:center;gap:11px;min-height:46px;padding:7px 12px;border-radius:14px;font:inherit;font-size:14px;color:var(--text,#f0f0f6);cursor:pointer;text-align:start;
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025)),var(--bg3,#141420);border:1px solid var(--border2,rgba(255,255,255,.12));transition:border-color .15s,box-shadow .15s,background .15s}
.fs-btn:hover:not(:disabled){border-color:var(--border3,rgba(255,255,255,.22))}
.fs-btn:focus-visible,.fs-btn[aria-expanded=true]{outline:none;border-color:var(--accent,#7c6af7);box-shadow:0 0 0 3px var(--accent-bg,rgba(124,106,247,.18))}
.fs-btn:disabled{opacity:.5;cursor:not-allowed}
.fs-val{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;line-height:1.35}
.fs-val b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fs-val small{font-size:11.5px;color:var(--text2,#9898b0);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fs-chev{flex-shrink:0;color:var(--text2,#9898b0);transition:transform .18s}
.fs-btn[aria-expanded=true] .fs-chev{transform:rotate(180deg)}
.fs-pop{position:fixed;z-index:10050;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;color:var(--text,#f0f0f6);
  background:rgba(17,17,28,.97);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid var(--border3,rgba(255,255,255,.14));box-shadow:0 24px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.03);animation:fs-in .14s ease-out}
.fs-pop[data-up=true]{transform-origin:bottom}
@keyframes fs-in{from{opacity:0;transform:translateY(-4px) scale(.985)}to{opacity:1;transform:none}}
.fs-search{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border2,rgba(255,255,255,.1));color:var(--text2,#9898b0)}
.fs-pop .fs-search input{flex:1;min-width:0;width:auto;background:none!important;border:none!important;box-shadow:none!important;outline:none!important;padding:0!important;border-radius:0!important;color:var(--text,#fff);font:inherit;font-size:13.5px}
.fs-list{overflow-y:auto;padding:6px;display:flex;flex-direction:column;gap:2px;overscroll-behavior:contain;scrollbar-width:thin}
.fs-opt{display:flex;align-items:center;gap:11px;padding:8px 10px;border-radius:11px;cursor:pointer;font-size:14px;line-height:1.35;transition:background .1s}
.fs-opt[data-active=true]{background:rgba(255,255,255,.07)}
.fs-opt[aria-selected=true]{background:var(--accent-bg,rgba(124,106,247,.18))}
.fs-opt .fs-val b{font-weight:600}
.fs-tick{flex-shrink:0;color:var(--accent2,#a08ff8)}
.fs-empty{padding:18px 12px;text-align:center;font-size:13px;color:var(--text3,#6b6b85)}
.fs-badge{flex-shrink:0;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;color:var(--text2,#9898b0);background:rgba(255,255,255,.07);letter-spacing:.03em}
.fs-icon{flex-shrink:0;width:30px;height:30px;border-radius:10px;display:grid;place-items:center;color:var(--accent2,#a08ff8);background:var(--accent-bg,rgba(124,106,247,.14))}
/* أورب الصوت: كرة متدرّجة ناعمة بتتحرّك ببطء */
.fs-orb{flex-shrink:0;position:relative;border-radius:50%;overflow:hidden;isolation:isolate;background:var(--o0)}
.fs-orb::before{content:'';position:absolute;inset:-35%;z-index:-1;background:conic-gradient(from 0deg,var(--o1),var(--o2),var(--o3),var(--o4),var(--o1));filter:blur(var(--ob,6px));animation:fs-spin 9s linear infinite}
.fs-orb::after{content:'';position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.55),transparent 46%),radial-gradient(circle at 70% 88%,rgba(0,0,0,.22),transparent 55%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.fs-orb[data-live=true]::before{animation-duration:3.2s}
@keyframes fs-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.fs-orb::before,.fs-pop{animation:none}.fs-chev{transition:none}}
`;

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

/** أورب صوت بألوان ثابتة مشتقّة من seed (كل صوت له لون مميّز) */
export function VoiceOrb({ seed = 'x', size = 30, live = false }) {
  const h = hash(seed) % 360;
  const st = {
    width: size, height: size, '--ob': `${Math.max(3, size / 6)}px`,
    '--o0': `hsl(${h} 85% 72%)`, '--o1': `hsl(${h} 95% 74%)`, '--o2': `hsl(${(h + 55) % 360} 90% 70%)`, '--o3': `hsl(${(h + 120) % 360} 90% 78%)`, '--o4': `hsl(${(h + 300) % 360} 88% 72%)`,
    boxShadow: `0 0 ${size * 0.5}px hsla(${h},90%,70%,.28)`,
  };
  return <span className="fs-orb" data-live={live} style={st} aria-hidden="true" />;
}

function Lead({ o, size = 30, live }) {
  if (o.orb) return <VoiceOrb seed={o.orb} size={size} live={live} />;
  if (o.icon) { const I = o.icon; return <span className="fs-icon" style={{ width: size, height: size }}><I size={Math.round(size * 0.52)} /></span>; }
  return null;
}

export default function FancySelect({ value, onChange, options, placeholder = '—', disabled, id, ariaLabel, searchPlaceholder = 'Search…', emptyText = 'No results', searchAt = 9, maxHeight = 320 }) {
  const uid = useId();
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef({ s: '', t: 0 });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);

  const searchable = options.length >= searchAt;
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(n)) : options;
  }, [options, q]);

  const place = useCallback(() => {
    const b = btnRef.current; if (!b) return;
    const r = b.getBoundingClientRect();
    const vh = window.innerHeight;
    const below = vh - r.bottom - 12, above = r.top - 12;
    const want = Math.min(maxHeight + (searchable ? 52 : 0), 56 * Math.max(1, shown.length) + 14 + (searchable ? 52 : 0));
    const up = below < Math.min(want, 220) && above > below;
    const room = Math.max(160, Math.min(want, up ? above : below));
    setPos({ left: r.left, width: r.width, maxHeight: room, up, top: up ? undefined : r.bottom + 6, bottom: up ? vh - r.top + 6 : undefined, dir: getComputedStyle(b).direction });
  }, [maxHeight, searchable, shown.length]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!popRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false); };
    const onScroll = (e) => { if (popRef.current?.contains(e.target)) return; place(); };
    document.addEventListener('mousedown', close); document.addEventListener('touchstart', close, { passive: true });
    window.addEventListener('resize', place); window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); window.removeEventListener('resize', place); window.removeEventListener('scroll', onScroll, true); };
  }, [open, place]);

  const openMenu = () => {
    if (disabled) return;
    setQ(''); setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true);
  };
  useEffect(() => { // يخلّي العنصر النشط ظاهر
    if (open) listRef.current?.querySelector('[data-active=true]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active, pos]);
  useEffect(() => { if (open && searchable) setTimeout(() => popRef.current?.querySelector('input')?.focus(), 0); }, [open, searchable]);

  const choose = (o) => { onChange(o.value); setOpen(false); btnRef.current?.focus(); };
  const onKey = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === 'Tab') setOpen(false);
    else if (!searchable && e.key.length === 1) { // كتابة حرف بتقفز لأول خيار بيبدأ بيه
      const now = Date.now(); typed.current.s = (now - typed.current.t > 700 ? '' : typed.current.s) + e.key.toLowerCase(); typed.current.t = now;
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.s)); if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <button type="button" ref={btnRef} id={id} className="fs-btn" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? uid : undefined} aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())} onKeyDown={onKey}>
        {selected && <Lead o={selected} live={open} />}
        <span className="fs-val"><b>{selected ? selected.label : placeholder}</b>{selected?.sub && <small>{selected.sub}</small>}</span>
        {selected?.badge && <span className="fs-badge">{selected.badge}</span>}
        <ChevronDown size={17} className="fs-chev" />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} className="fs-pop" data-up={pos.up} dir={pos.dir} style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }} onKeyDown={onKey}>
          {searchable && (
            <div className="fs-search"><Search size={15} /><input value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} placeholder={searchPlaceholder} aria-label={searchPlaceholder} /></div>
          )}
          <div className="fs-list" role="listbox" id={uid} ref={listRef}>
            {shown.length === 0 && <div className="fs-empty">{emptyText}</div>}
            {shown.map((o, i) => (
              <div key={String(o.value)} role="option" aria-selected={o.value === value} data-active={i === active} className="fs-opt"
                onMouseEnter={() => setActive(i)} onClick={() => choose(o)}>
                <Lead o={o} live={i === active} />
                <span className="fs-val"><b>{o.label}</b>{o.sub && <small>{o.sub}</small>}</span>
                {o.badge && <span className="fs-badge">{o.badge}</span>}
                {o.value === value && <Check size={16} className="fs-tick" />}
              </div>
            ))}
          </div>
        </div>, document.body)}
    </>
  );
}
