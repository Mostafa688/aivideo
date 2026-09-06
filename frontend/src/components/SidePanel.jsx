import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// ✅ NEW (طلب العميل: "صفحة الدعم لازم تبقى نافذة جانبية مش صفحة كاملة"): drawer عام قابل
// لإعادة الاستخدام لأي صفحة ثانوية هتتحول لنافذة جانبية بدل صفحة منفصلة كاملة — أول استخدام
// له هو صفحة الدعم، والصفحات الباقية (Templates/Courses/Community/إلخ) هتستخدمه في مراحل جاية
export default function SidePanel({ open, onClose, title, width = 440, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20000 }}>
      <style>{`
        @keyframes sidePanelBackdropIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sidePanelSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', animation: 'sidePanelBackdropIn 0.2s ease' }} />
      <div style={{
        position: 'absolute', top: 0, insetInlineEnd: 0, height: '100%', width: `min(${width}px, 100vw)`,
        background: 'var(--bg)', borderInlineStart: '1px solid var(--border2)',
        boxShadow: '-16px 0 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column',
        animation: 'sidePanelSlideIn 0.25s cubic-bezier(0.16,1,0.3,1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>{title}</span>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--border2)', color: 'var(--text2)' }}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
