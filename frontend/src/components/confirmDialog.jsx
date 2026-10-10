// ── confirmDialog.jsx ── نافذة تأكيد بتصميم الموقع بدل window.confirm (اللي بتظهر "erivion.net says")
// الاستخدام:  if (!(await confirmDialog({ title, message, confirmText, cancelText, tone: 'danger', dir }))) return;
import { createRoot } from 'react-dom/client';
import { useEffect, useRef } from 'react';
import { Trash2, AlertTriangle, HelpCircle } from 'lucide-react';

const CSS = `
.cd-bg{position:fixed;inset:0;z-index:10100;display:grid;place-items:center;padding:20px;background:rgba(3,3,8,.66);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);animation:cd-fade .15s ease-out}
.cd-card{width:100%;max-width:400px;border-radius:22px;padding:26px 24px 20px;text-align:center;color:var(--text,#f0f0f6);font-family:var(--font-body,'DM Sans',system-ui,sans-serif);
  background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)),var(--bg2,#0d0d14);border:1px solid var(--border3,rgba(255,255,255,.14));box-shadow:0 30px 80px rgba(0,0,0,.65);animation:cd-pop .18s cubic-bezier(.2,.9,.3,1.2)}
.cd-ic{width:56px;height:56px;margin:0 auto 14px;border-radius:18px;display:grid;place-items:center;background:var(--cd-bg);border:1px solid var(--cd-line);color:var(--cd)}
.cd-card h3{margin:0 0 8px;font-family:var(--font-display,'Bricolage Grotesque',system-ui,sans-serif);font-size:19px;font-weight:800;line-height:1.4;text-wrap:balance}
.cd-card p{margin:0;color:var(--text2,#9898b0);font-size:14px;line-height:1.8}
.cd-row{display:flex;gap:10px;margin-top:22px}
.cd-row button{flex:1;padding:12px 14px;border-radius:13px;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;transition:filter .15s,background .15s,border-color .15s}
.cd-no{color:var(--text,#fff);background:rgba(255,255,255,.05);border:1px solid var(--border2,rgba(255,255,255,.14))}
.cd-no:hover{background:rgba(255,255,255,.09)}
.cd-yes{color:#fff;border:1px solid transparent;background:var(--cd-grad)}
.cd-yes:hover{filter:brightness(1.1)}
.cd-row button:focus-visible{outline:2px solid var(--cd);outline-offset:2px}
@keyframes cd-fade{from{opacity:0}to{opacity:1}}
@keyframes cd-pop{from{opacity:0;transform:translateY(8px) scale(.96)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.cd-bg,.cd-card{animation:none}}
`;

const TONES = {
  danger: { c: '#f87171', bg: 'rgba(248,113,113,.14)', line: 'rgba(248,113,113,.4)', grad: 'linear-gradient(135deg,#ef4444,#be123c)', Icon: Trash2 },
  warn: { c: '#fbbf24', bg: 'rgba(251,191,36,.14)', line: 'rgba(251,191,36,.4)', grad: 'linear-gradient(135deg,#f59e0b,#d97706)', Icon: AlertTriangle },
  default: { c: '#a08ff8', bg: 'rgba(124,106,247,.16)', line: 'rgba(124,106,247,.45)', grad: 'linear-gradient(135deg,#7c6af7,#5b46e0)', Icon: HelpCircle },
};

function Dialog({ title, message, confirmText, cancelText, tone, dir, done }) {
  const T = TONES[tone] || TONES.default;
  const yes = useRef(null), no = useRef(null);
  useEffect(() => {
    (tone === 'danger' ? no : yes).current?.focus(); // العمليات الخطرة: الفوكس على "إلغاء"
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      else if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === yes.current ? no : yes).current?.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [done, tone]);
  return (
    <div className="cd-bg" dir={dir} onMouseDown={(e) => { if (e.target === e.currentTarget) done(false); }}>
      <style>{CSS}</style>
      <div className="cd-card" role="alertdialog" aria-modal="true" aria-labelledby="cd-t" aria-describedby={message ? 'cd-m' : undefined}
        style={{ '--cd': T.c, '--cd-bg': T.bg, '--cd-line': T.line, '--cd-grad': T.grad }}>
        <div className="cd-ic"><T.Icon size={26} /></div>
        <h3 id="cd-t">{title}</h3>
        {message && <p id="cd-m">{message}</p>}
        <div className="cd-row">
          <button type="button" className="cd-no" ref={no} onClick={() => done(false)}>{cancelText}</button>
          <button type="button" className="cd-yes" ref={yes} onClick={() => done(true)}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export function confirmDialog({ title, message = '', confirmText, cancelText, tone = 'default', dir } = {}) {
  const ar = (localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const d = dir || (ar ? 'rtl' : 'ltr');
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let finished = false;
    const done = (v) => { if (finished) return; finished = true; resolve(v); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<Dialog title={title} message={message} tone={tone} dir={d}
      confirmText={confirmText || (ar ? 'تأكيد' : 'Confirm')} cancelText={cancelText || (ar ? 'إلغاء' : 'Cancel')} done={done} />);
  });
}
