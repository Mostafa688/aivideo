import React, { useState, useEffect, useRef, useCallback } from 'react';

// ✅ NEW: جرس الإشعارات — بيجيب الإشعارات النشطة (آخر 24 ساعة، بيفلترها السيرفر نفسه)
// كل 60 ثانية، وبيقارن أعلى ID شافه العميل قبل كده (محفوظ في localStorage) عشان يحدد
// عدد الإشعارات "الجديدة" ويعرضها كـ badge رقمي. لما يفتح القائمة، بيعتبر كل حاجة "متشافة".
export default function NotificationBell({ token }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/notifications', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
    } catch {}
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // كل دقيقة
    return () => clearInterval(interval);
  }, [load]);

  // إغلاق القائمة لو دست بره المربع
  useEffect(() => {
    const handleClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const lastSeenId = parseInt(localStorage.getItem('erivion_last_seen_notif_id') || '0', 10);
  const unreadCount = notifications.filter(n => n.id > lastSeenId).length;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && notifications.length) {
      const maxId = Math.max(...notifications.map(n => n.id));
      localStorage.setItem('erivion_last_seen_notif_id', String(maxId));
    }
  };

  const timeAgo = (iso) => {
    const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.round(diffMin / 60)}h ago`;
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button onClick={handleToggle} title="Notifications" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: '50%',
        background: open ? 'rgba(124,106,247,0.16)' : 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', position: 'relative',
      }}>
        <span style={{ fontSize: 16 }}>🔔</span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            minWidth: 16, height: 16, padding: '0 3px', borderRadius: 8,
            background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--bg, #0a0a12)',
          }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, width: 320, maxHeight: 400, overflowY: 'auto',
          background: '#12121e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14,
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)', zIndex: 200, padding: 8,
        }}>
          <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
              No notifications right now
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{
                padding: '10px 12px', borderRadius: 10, marginBottom: 4,
                background: n.id > lastSeenId ? 'rgba(124,106,247,0.08)' : 'transparent',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{n.title}</div>
                  <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{timeAgo(n.created_at)}</div>
                </div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)', marginTop: 3, lineHeight: 1.6 }}>{n.message}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
