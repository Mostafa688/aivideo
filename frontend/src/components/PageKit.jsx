// ── PageKit.jsx ── هيكل موحّد لصفحات المحتوى (إيه الجديد / الخطة / الحالة / الشخصيات / القنوات): هيرو بخلفية متوهجة، شرائح، كروت وهيكل تحميل
// التصميم بيعتمد على متغيرات global.css (--bg, --text, --accent...) والخط --font-display للعناوين. كل الاتجاهات RTL/LTR جاهزة.
import { ArrowLeft } from 'lucide-react';

const CSS = `
.pk-root{min-height:100vh;background:var(--bg,#050508);color:var(--text,#f0f0f6);font-family:var(--font-body,'DM Sans',system-ui,sans-serif);position:relative;overflow-x:hidden}
.pk-glow{position:absolute;inset:0 0 auto 0;height:520px;pointer-events:none;background:radial-gradient(760px 320px at 50% -80px,var(--pk-accent-soft,rgba(124,106,247,.28)),transparent 70%),radial-gradient(420px 220px at 12% 8%,rgba(96,165,250,.08),transparent 70%)}
.pk-grid{position:absolute;inset:0 0 auto 0;height:420px;pointer-events:none;opacity:.5;background-image:linear-gradient(var(--border,rgba(255,255,255,.06)) 1px,transparent 1px),linear-gradient(90deg,var(--border,rgba(255,255,255,.06)) 1px,transparent 1px);background-size:44px 44px;-webkit-mask-image:linear-gradient(to bottom,#000,transparent);mask-image:linear-gradient(to bottom,#000,transparent)}
.pk-wrap{position:relative;margin:0 auto;padding:28px 20px 72px}
.pk-back{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.04);border:1px solid var(--border2,rgba(255,255,255,.1));color:var(--text2,#9898b0);border-radius:10px;padding:7px 14px;cursor:pointer;font:inherit;font-size:13px;transition:all .15s}
.pk-back:hover{color:var(--text,#fff);border-color:var(--border3,rgba(255,255,255,.16));background:rgba(255,255,255,.07)}
.pk-hero{display:flex;gap:28px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;padding:40px 0 30px}
.pk-hero-main{flex:1 1 380px;min-width:0}
.pk-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:5px 12px 5px 10px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:.04em;color:var(--pk-accent,#a08ff8);background:var(--pk-accent-bg,rgba(124,106,247,.12));border:1px solid var(--pk-accent-line,rgba(124,106,247,.3))}
.pk-title{font-family:var(--font-display,'Bricolage Grotesque',system-ui,sans-serif);font-weight:800;font-size:clamp(30px,5.2vw,48px);line-height:1.12;letter-spacing:-.02em;margin:16px 0 12px;text-wrap:balance}
.pk-sub{color:var(--text2,#9898b0);font-size:15.5px;line-height:1.8;max-width:58ch;margin:0}
.pk-aside{flex:0 1 auto;display:flex;gap:10px;flex-wrap:wrap}
.pk-stat{min-width:104px;padding:12px 16px;border-radius:14px;background:rgba(255,255,255,.035);border:1px solid var(--border2,rgba(255,255,255,.1))}
.pk-stat b{display:block;font-family:var(--font-display,system-ui);font-size:26px;line-height:1.1;font-weight:800;font-variant-numeric:tabular-nums}
.pk-stat span{display:block;margin-top:4px;font-size:11.5px;color:var(--text2,#9898b0)}
.pk-card{background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.02));border:1px solid var(--border2,rgba(255,255,255,.1));border-radius:16px;transition:border-color .18s,transform .18s,box-shadow .18s}
.pk-card.pk-hover:hover{border-color:var(--pk-accent-line,rgba(124,106,247,.4));transform:translateY(-1px);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.pk-pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 10px;white-space:nowrap}
.pk-chip{display:inline-flex;align-items:center;gap:7px;padding:7px 14px;border-radius:999px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;color:var(--text2,#9898b0);background:rgba(255,255,255,.035);border:1px solid var(--border2,rgba(255,255,255,.1));transition:all .15s}
.pk-chip:hover{color:var(--text,#fff);border-color:var(--border3,rgba(255,255,255,.16))}
.pk-chip[aria-pressed=true]{color:#fff;background:var(--pk-accent-bg,rgba(124,106,247,.2));border-color:var(--pk-accent-line,rgba(124,106,247,.5))}
.pk-chip small{font-size:11px;opacity:.7;font-variant-numeric:tabular-nums}
.pk-skel{border-radius:14px;background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04));background-size:200% 100%;animation:pk-shimmer 1.4s ease-in-out infinite}
@keyframes pk-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes pk-pulse{0%{box-shadow:0 0 0 0 var(--pk-pulse,rgba(52,211,153,.55))}70%{box-shadow:0 0 0 10px transparent}100%{box-shadow:0 0 0 0 transparent}}
.pk-dot-live{animation:pk-pulse 2s ease-out infinite}
.pk-empty{text-align:center;padding:44px 20px;border-radius:16px;border:1px dashed var(--border2,rgba(255,255,255,.1));color:var(--text2,#9898b0);font-size:14px}
.pk-section-h{display:flex;align-items:center;gap:12px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text2,#9898b0);margin:34px 0 14px}
.pk-section-h::after{content:'';flex:1;height:1px;background:var(--border2,rgba(255,255,255,.1))}
@media (max-width:640px){.pk-wrap{padding:20px 16px 56px}.pk-hero{padding:28px 0 22px}.pk-stat{min-width:92px;padding:10px 12px}}
@media (prefers-reduced-motion:reduce){.pk-skel,.pk-dot-live{animation:none}.pk-card.pk-hover:hover{transform:none}}
`;

/** accent = لون الصفحة (hex)؛ بنشتق منه الخلفيات والحدود */
export function accentVars(accent = '#7c6af7') {
  return {
    '--pk-accent': accent,
    '--pk-accent-soft': `${accent}47`,
    '--pk-accent-bg': `${accent}1f`,
    '--pk-accent-line': `${accent}59`,
    '--pk-pulse': `${accent}8c`,
  };
}

export function PageShell({ dir = 'rtl', onBack, backLabel = 'Back', eyebrow, Icon, accent = '#7c6af7', title, subtitle, aside, maxWidth = 1040, children, toast }) {
  return (
    <div className="pk-root" dir={dir} style={{ direction: dir, ...accentVars(accent) }}>
      <style>{CSS}</style>
      <div className="pk-glow" /><div className="pk-grid" />
      <div className="pk-wrap" style={{ maxWidth }}>
        {onBack && (
          <button className="pk-back" onClick={onBack}>
            <ArrowLeft size={14} style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }} /> {backLabel}
          </button>
        )}
        {toast}
        <header className="pk-hero">
          <div className="pk-hero-main">
            {eyebrow && <span className="pk-eyebrow">{Icon && <Icon size={14} strokeWidth={2.2} />} {eyebrow}</span>}
            <h1 className="pk-title">{title}</h1>
            {subtitle && <p className="pk-sub">{subtitle}</p>}
          </div>
          {aside && <div className="pk-aside">{aside}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export const Stat = ({ value, label }) => <div className="pk-stat"><b>{value}</b><span>{label}</span></div>;

export const Pill = ({ color, children, dot }) => (
  <span className="pk-pill" style={{ color, background: `${color}1c`, border: `1px solid ${color}47` }}>
    {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />}{children}
  </span>
);

export const Skeletons = ({ n = 3, h = 92 }) => (
  <div style={{ display: 'grid', gap: 12 }}>{Array.from({ length: n }).map((_, i) => <div key={i} className="pk-skel" style={{ height: h, animationDelay: `${i * 0.12}s` }} />)}</div>
);

export const Empty = ({ children, Icon }) => (
  <div className="pk-empty">{Icon && <Icon size={22} style={{ opacity: 0.5, marginBottom: 8 }} />}<div>{children}</div></div>
);
