import { useState, useEffect } from 'react';
import { GraduationCap, ChevronDown, Lock, PlayCircle, Paperclip, MessageCircle, Sparkles, Film } from 'lucide-react';
import { PageShell, Stat, Pill, Skeletons, Empty } from '../components/PageKit.jsx';

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

const T = {
  ar: {
    eyebrow: 'الأكاديمية', heading: 'كورسات Erivion', sub: 'دروس هتساعدك تتقن صناعة الفيديوهات واستخدام كل موديل في Erivion.',
    back: 'رجوع', free: 'مجاني', locked: 'للمشتركين', videos: (n) => `${n} فيديو`,
    empty: 'لسه مفيش كورسات مضافة.', loading: 'جاري التحميل...',
    loginRequired: 'سجّل دخولك عشان تقدر تشوف تفاصيل الكورس ده.',
    subscribeCta: 'اشترك عشان تفتح الكورس ده', watchAttachment: 'تحميل الملف المرفق',
    trailer: 'فيديو تعريفي', questionTitle: 'عايز تسأل حاجة قبل ما تشترك؟',
    questionSub: 'الايجنت أو فريق الدعم جاهزين يساعدوك دلوقتي', contactSupport: 'تواصل مع الدعم',
  },
  en: {
    eyebrow: 'Academy', heading: 'Erivion Courses', sub: 'Lessons to help you master video creation and every Erivion model.',
    back: 'Back', free: 'Free', locked: 'Subscribers', videos: (n) => `${n} video${n === 1 ? '' : 's'}`,
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

  const freeCount = courses.filter(c => c.is_free).length;
  return (
    <PageShell dir={dir} onBack={onBack} backLabel={t.back} eyebrow={t.eyebrow} Icon={GraduationCap} accent="#fbbf24" title={t.heading} subtitle={t.sub} maxWidth={900}
      aside={courses.length > 0 && <><Stat value={courses.length} label={isAr ? 'كورس' : 'courses'} />{freeCount > 0 && <Stat value={freeCount} label={t.free} />}</>}>
      <style>{`
        .cr-feature{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:0;overflow:hidden;border-color:rgba(52,211,153,.35)!important}
        .cr-head{width:100%;display:flex;align-items:center;gap:16px;padding:16px 20px;background:none;border:none;color:inherit;font:inherit;cursor:pointer;text-align:start}
        .cr-thumb{width:64px;height:64px;border-radius:16px;flex-shrink:0;object-fit:cover;display:grid;place-items:center;background:linear-gradient(135deg,rgba(251,191,36,.2),rgba(124,106,247,.2));border:1px solid var(--border2)}
        .cr-chev{transition:transform .2s;color:var(--text2);flex-shrink:0}
        .cr-open .cr-chev{transform:rotate(180deg)}
        .cr-lesson{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--border)}
        .cr-cta{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:999px;border:none;font:inherit;font-weight:700;font-size:14px;color:#1a1204;cursor:pointer;background:linear-gradient(135deg,#fde68a,#fbbf24);box-shadow:0 8px 24px rgba(251,191,36,.25)}
        @media (max-width:720px){.cr-feature{grid-template-columns:1fr}.cr-thumb{width:52px;height:52px}}
      `}</style>

      {intro?.video_url && (
        <section className="pk-card cr-feature" style={{ marginBottom: 26 }}>
          <video controls poster={intro.thumbnail_url || undefined} src={intro.video_url} style={{ width: '100%', height: '100%', minHeight: 220, objectFit: 'cover', display: 'block', background: '#000' }} />
          <div style={{ padding: '24px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10 }}>
            <div><Pill color="#34d399" dot>{t.free}</Pill></div>
            <h2 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.4, fontWeight: 800 }}>{intro.title}</h2>
            {intro.description && <p style={{ margin: 0, color: 'var(--text2)', fontSize: 14, lineHeight: 1.85 }}>{intro.description}</p>}
          </div>
        </section>
      )}

      {loadingCourses && <Skeletons n={3} h={96} />}
      {!loadingCourses && courses.length === 0 && <Empty Icon={GraduationCap}>{t.empty}</Empty>}

      <div style={{ display: 'grid', gap: 14 }}>
        {courses.map(c => {
          const open = openId === c.id;
          const detail = detailCache[c.id];
          const err = detailError[c.id];
          const tone = c.is_free ? '#34d399' : '#c4b5fd';
          return (
            <article key={c.id} className={`pk-card ${open ? 'cr-open' : 'pk-hover'}`} style={open ? { borderColor: 'rgba(251,191,36,.45)' } : undefined}>
              <button className="cr-head" onClick={() => toggleCourse(c)} aria-expanded={open}>
                {c.thumbnail_url ? <img className="cr-thumb" src={c.thumbnail_url} alt="" loading="lazy" /> : <span className="cr-thumb"><Film size={26} color="#fbbf24" /></span>}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <Pill color={tone}>{c.is_free ? <Sparkles size={11} /> : <Lock size={11} />} {c.is_free ? t.free : t.locked}</Pill>
                    {typeof c.video_count === 'number' && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t.videos(c.video_count)}</span>}
                  </span>
                  <span style={{ display: 'block', fontSize: 16.5, fontWeight: 700, lineHeight: 1.5 }}>{c.title}</span>
                  {!open && c.description && <span style={{ marginTop: 4, color: 'var(--text2)', fontSize: 13.5, lineHeight: 1.7, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.description}</span>}
                </span>
                <ChevronDown className="cr-chev" size={20} />
              </button>

              {open && (
                <div style={{ padding: '0 20px 20px', color: 'var(--text2)', fontSize: 14, lineHeight: 1.85 }}>
                  {c.description && <p style={{ margin: '0 0 16px' }}>{c.description}</p>}
                  {loadingDetailId === c.id && <Skeletons n={2} h={64} />}
                  {err === 'login_required' && <div className="pk-empty" style={{ padding: 16 }}>{t.loginRequired}</div>}

                  {detail && (
                    <>
                      {detail.locked && detail.course?.intro_video_url && (
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24', marginBottom: 8 }}>{t.trailer}</div>
                          <video controls src={detail.course.intro_video_url} style={{ width: '100%', borderRadius: 12, display: 'block', background: '#000' }} />
                        </div>
                      )}
                      <div style={{ display: 'grid', gap: 10 }}>
                        {(detail.videos || []).map((v, vi) => (
                          <div key={v.id} className="cr-lesson">
                            {v.thumbnail_url ? <img src={v.thumbnail_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} /> :
                              <span style={{ width: 36, height: 36, borderRadius: 11, display: 'grid', placeItems: 'center', background: 'rgba(251,191,36,.12)', color: '#fbbf24', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{vi + 1}</span>}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 7 }}>
                                {detail.locked ? <Lock size={13} color="#94a3b8" /> : <PlayCircle size={15} color="#34d399" />} {v.title}
                              </div>
                              {v.description && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2, lineHeight: 1.7 }}>{v.description}</div>}
                              {!detail.locked && v.video_url && <video controls poster={v.thumbnail_url || undefined} src={v.video_url} style={{ width: '100%', borderRadius: 10, marginTop: 10, background: '#000' }} />}
                              {!detail.locked && v.attachment_url && (
                                <a href={v.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, color: '#fbbf24' }}><Paperclip size={13} /> {v.attachment_label || t.watchAttachment}</a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      {!detail.locked && detail.course?.attachment_url && (
                        <a href={detail.course.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 13.5, color: '#fbbf24' }}><Paperclip size={14} /> {detail.course.attachment_label || t.watchAttachment}</a>
                      )}
                      {detail.locked && <button className="cr-cta" style={{ marginTop: 16 }} onClick={() => onNavigate?.('pricing')}><Lock size={15} /> {t.subscribeCta}</button>}
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="pk-card" style={{ marginTop: 40, padding: '26px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', background: 'linear-gradient(135deg, rgba(251,191,36,.1), rgba(124,106,247,.08))' }}>
        <span style={{ width: 48, height: 48, borderRadius: 15, display: 'grid', placeItems: 'center', background: 'rgba(251,191,36,.16)', flexShrink: 0 }}><MessageCircle size={22} color="#fbbf24" /></span>
        <div style={{ flex: '1 1 240px' }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{t.questionTitle}</div>
          <div style={{ color: 'var(--text2)', fontSize: 13.5 }}>{t.questionSub}</div>
        </div>
        <button className="cr-cta" onClick={() => onNavigate ? onNavigate('support') : (window.location.href = 'mailto:support@erivion.net')}>{t.contactSupport}</button>
      </section>
    </PageShell>
  );
}
