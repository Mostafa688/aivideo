import { useState, useEffect } from 'react';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

const T = {
  ar: {
    heading: 'كورسات Erivion', sub: 'دروس هتساعدك تتقن صناعة الفيديوهات واستخدام كل موديل في Erivion.',
    back: '← رجوع', free: 'مجاني', locked: '🔒 للمشتركين بس', videos: (n) => `${n} فيديو`,
    empty: 'لسه مفيش كورسات مضافة.', loading: 'جاري التحميل...',
    loginRequired: 'سجّل دخولك عشان تقدر تشوف تفاصيل الكورس ده.',
    subscribeCta: 'اشترك عشان تفتح الكورس ده', watchAttachment: 'تحميل الملف المرفق',
    trailer: 'فيديو تعريفي', questionTitle: 'عايز تسأل حاجة قبل ما تشترك؟',
    questionSub: 'الايجنت أو فريق الدعم جاهزين يساعدوك دلوقتي', contactSupport: 'تواصل مع الدعم',
  },
  en: {
    heading: 'Erivion Courses', sub: 'Lessons to help you master video creation and every Erivion model.',
    back: '← Back', free: 'Free', locked: '🔒 Subscribers only', videos: (n) => `${n} video${n === 1 ? '' : 's'}`,
    empty: 'No courses added yet.', loading: 'Loading...',
    loginRequired: 'Log in to see this course.',
    subscribeCta: 'Subscribe to unlock this course', watchAttachment: 'Download attachment',
    trailer: 'Trailer', questionTitle: 'Have a question before subscribing?',
    questionSub: 'The Agent or our support team can help right now', contactSupport: 'Contact Support',
  },
};

export default function CoursesPage({ onBack, onNavigate, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const language = isAr ? 'ar' : 'en';
  const dir = isAr ? 'rtl' : 'ltr';
  const t = T[language];

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [intro, setIntro] = useState(null);

  const [openId, setOpenId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [detailError, setDetailError] = useState({});

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingCourses(true);
      try {
        const r = await fetch(`/api/courses?language=${language}`);
        const d = await r.json();
        if (alive) setCourses(d.courses || []);
      } catch (e) { console.error(e); }
      if (alive) setLoadingCourses(false);
    })();
    (async () => {
      try {
        const r = await fetch(`/api/courses/intro-video?language=${language}`);
        const d = await r.json();
        if (alive) setIntro(d.intro || null);
      } catch (e) { console.error(e); }
    })();
    return () => { alive = false; };
  }, [language]);

  const toggleCourse = async (course) => {
    if (openId === course.id) { setOpenId(null); return; }
    setOpenId(course.id);
    if (detailCache[course.id] || detailError[course.id]) return;
    const token = localStorage.getItem('token');
    if (!token) { setDetailError(p => ({ ...p, [course.id]: 'login_required' })); return; }
    setLoadingDetailId(course.id);
    try {
      const r = await fetch(`/api/courses/${course.id}`, { headers: authHeaders() });
      if (r.status === 401) { setDetailError(p => ({ ...p, [course.id]: 'login_required' })); setLoadingDetailId(null); return; }
      const d = await r.json();
      setDetailCache(p => ({ ...p, [course.id]: d }));
    } catch (e) {
      setDetailError(p => ({ ...p, [course.id]: 'error' }));
    }
    setLoadingDetailId(null);
  };

  const cardStyle = (open) => ({
    background: open ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.03)',
    border: `1px solid ${open ? 'rgba(124,58,237,0.3)' : 'rgba(255,255,255,0.07)'}`,
    borderRadius: 14, overflow: 'hidden', transition: 'all 0.2s',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #fff)', fontFamily: "'DM Sans', sans-serif", padding: '40px 20px', direction: dir }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {onBack && (
          <button onClick={onBack} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {t.back}
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎓</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg,#a78bfa,#7c3aed)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {t.heading}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8, fontSize: 14, maxWidth: 460, marginInline: 'auto', lineHeight: 1.7 }}>
            {t.sub}
          </p>
        </div>

        {/* Free intro video — open to everyone, no subscription needed */}
        {intro?.video_url && (
          <div style={{ marginBottom: 28, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 16, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 999, padding: '3px 10px' }}>{t.free}</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{intro.title}</span>
            </div>
            <video controls poster={intro.thumbnail_url || undefined} src={intro.video_url} style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000' }} />
            {intro.description && <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 10, lineHeight: 1.7 }}>{intro.description}</p>}
          </div>
        )}

        {loadingCourses && <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.loading}</div>}
        {!loadingCourses && courses.length === 0 && (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', padding: '20px 0' }}>{t.empty}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {courses.map(c => {
            const open = openId === c.id;
            const detail = detailCache[c.id];
            const err = detailError[c.id];
            return (
              <div key={c.id} style={cardStyle(open)}>
                <button onClick={() => toggleCourse(c)}
                  style={{ width: '100%', padding: '16px 20px', background: 'none', border: 'none', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: isAr ? 'right' : 'left', direction: dir, fontFamily: "'DM Sans', sans-serif", gap: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {c.thumbnail_url
                      ? <img src={c.thumbnail_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                      : <span style={{ fontSize: 20 }}>🎬</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: c.is_free ? '#4ade80' : '#c4b5fd', background: c.is_free ? 'rgba(34,197,94,0.12)' : 'rgba(124,106,247,0.12)', border: `1px solid ${c.is_free ? 'rgba(34,197,94,0.3)' : 'rgba(124,106,247,0.3)'}` }}>
                      {c.is_free ? t.free : t.locked}
                    </span>
                    <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.3)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}>⌄</span>
                  </span>
                </button>
                {open && (
                  <div style={{ padding: '0 20px 18px', color: 'rgba(255,255,255,0.65)', fontSize: 13.5, lineHeight: 1.8, direction: dir }}>
                    {c.description && <p style={{ margin: '0 0 14px' }}>{c.description}</p>}

                    {loadingDetailId === c.id && <div style={{ color: 'rgba(255,255,255,0.4)' }}>{t.loading}</div>}

                    {err === 'login_required' && (
                      <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 13 }}>
                        {t.loginRequired}
                      </div>
                    )}

                    {detail && (
                      <>
                        {detail.locked && detail.course?.intro_video_url && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, color: '#a78bfa', marginBottom: 6 }}>{t.trailer}</div>
                            <video controls src={detail.course.intro_video_url} style={{ width: '100%', borderRadius: 10, display: 'block', background: '#000' }} />
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: detail.locked ? 14 : 0 }}>
                          {(detail.videos || []).map(v => (
                            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                              {v.thumbnail_url && <img src={v.thumbnail_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{detail.locked ? '🔒 ' : '▶ '}{v.title}</div>
                                {v.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{v.description}</div>}
                                {!detail.locked && v.video_url && (
                                  <video controls poster={v.thumbnail_url || undefined} src={v.video_url} style={{ width: '100%', borderRadius: 8, marginTop: 8, background: '#000' }} />
                                )}
                                {!detail.locked && v.attachment_url && (
                                  <a href={v.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: '#a78bfa' }}>
                                    📎 {v.attachment_label || t.watchAttachment}
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {!detail.locked && detail.course?.attachment_url && (
                          <a href={detail.course.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 12, fontSize: 12.5, color: '#a78bfa' }}>
                            📎 {detail.course.attachment_label || t.watchAttachment}
                          </a>
                        )}

                        {detail.locked && (
                          <button onClick={() => onNavigate?.('pricing')}
                            style={{ display: 'inline-block', marginTop: 4, padding: '10px 20px', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', border: 'none', borderRadius: 999, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                            {t.subscribeCta}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 40, padding: '24px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 20, marginBottom: 8 }}>💬</div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t.questionTitle}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 }}>{t.questionSub}</div>
          <a href="mailto:support@erivion.net"
            style={{ display: 'inline-block', padding: '10px 24px', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', borderRadius: 999, color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
            {t.contactSupport}
          </a>
        </div>

      </div>
    </div>
  );
}
