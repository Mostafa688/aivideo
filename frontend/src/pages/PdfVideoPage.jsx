// ── PdfVideoPage.jsx ── "من PDF لفيديو": المدرس/الطالب/الشركة يرفع ملزمة أو كتاب أو ملف شرح → Erivion يكتب سكريبت شرح من المحتوى
// ويعمل فيديو أنيميشن بموشن جرافيكس (عناوين فصول، قوايم، خطوات، رسوم بيانية، خرايط للأماكن، صور حقيقية للأشخاص والأماكن).
// لحد 5 دقايق لأي باقة، و20 دقيقة لباقة Studio.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, UploadCloud, Loader2, CheckCircle2, XCircle, Download, Play, Pause, Sparkles, Coins, Film, Map as MapIcon, Image as ImageIcon, BarChart3, ListChecks } from 'lucide-react';
import { downloadRemoteFile } from '../utils/download.js';

const auth = (json = true) => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: 'Bearer ' + localStorage.getItem('token') });
const fmt = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; };

const T = {
  ar: {
    title: 'من PDF لفيديو', sub: 'ارفع ملزمة، كتاب، ملخص أو أي ملف شرح — وErivion يحوّله لفيديو شرح متحرك بموشن جرافيكس، عناوين، قوايم، رسوم بيانية، خرايط وصور حقيقية، من المحتوى المكتوب نفسه.',
    back: 'رجوع', drop: 'اسحب الملف هنا أو اضغط للاختيار', types: 'PDF، Word، أو ملف نصي — لحد 15 ميجا', reading: 'بيقرا الملف...',
    pages: 'صفحة', words: 'كلمة', change: 'غيّر الملف', truncated: 'الملف طويل جدًا — هنستخدم أول جزء كبير منه.',
    length: 'مدة الفيديو', limit: 'أقصى مدة على باقتك', studioHint: 'باقة Studio لحد 20 دقيقة',
    look: 'الستايل', lookVox: 'كولاج ورق (Vox)', lookVoxD: 'صور حقيقية، خرايط ورق، لوجوهات وكولاج — الأنسب للتاريخ والجغرافيا والعلوم',
    lookMotion: 'موشن جرافيكس', lookMotionD: 'نص متحرك، رسوم بيانية، أيقونات وخطوات — الأنسب للبزنس والتقنية',
    lookCartoon: 'كارتون 2D', lookCartoonD: 'شخصيات كارتون بتشرح — الأنسب للأطفال',
    lookCartoon3d: 'كارتون 3D', lookCartoon3dD: 'شخصيات 3D بتتكلم',
    ratio: 'الأبعاد', r169: '16:9 يوتيوب / شرح', r916: '9:16 شورتس',
    voice: 'صوت الراوي', captions: 'كابشن (ترجمة على الشاشة)', brief: 'توجيه إضافي (اختياري)', briefPh: 'مثلاً: ركّز على الفصل التاني، أو اشرح لطلاب ثانوي، أو خليه حماسي',
    cost: 'التكلفة', credits: 'كريديت', bal: 'رصيدك', start: 'اعمل الفيديو', starting: 'بيبدأ...', paidOnly: 'الميزة دي للباقات المدفوعة — اشحن رصيد عشان تبدأ.', topUp: 'اشحن رصيد',
    working: 'بيشتغل على الفيديو', st: { queued: 'في الطابور', script: 'بيقرا المستند ويكتب الشرح', narration: 'بيسجّل صوت الراوي', plan: 'بيخطط المشاهد', assets: 'بيجيب الصور والخرايط', render: 'بيرسم الفيديو', upload: 'بيرفع الفيديو', done: 'خلص' },
    longNote: 'الفيديوهات الطويلة بتاخد وقت (تقريبًا دقيقتين لكل دقيقة فيديو). تقدر تقفل الصفحة وترجع — الفيديو هيفضل في "استوديو الأفلام".',
    ready: 'الفيديو جاهز!', download: 'تنزيل', another: 'فيديو جديد', failed: 'حصلت مشكلة — الكريديت اترجّع',
    whatYouGet: 'هيتعمل في الفيديو', g1: 'عناوين فصول وقوايم وخطوات من الملف', g2: 'رسوم بيانية للأرقام', g3: 'خرايط للأماكن', g4: 'صور حقيقية للأشخاص والأماكن',
    editHint: 'بعد ما يخلص تقدر تعدّل عليه من الشات: "غيّر المشهد التالت" أو "شيل المزيكا".',
  },
  en: {
    title: 'PDF to Video', sub: 'Upload notes, a book chapter, a summary or any document — Erivion turns it into an animated explainer with motion graphics, titles, lists, charts, maps and real photos, built from what the document actually says.',
    back: 'Back', drop: 'Drop the file here or click to choose', types: 'PDF, Word or text — up to 15MB', reading: 'Reading the file...',
    pages: 'pages', words: 'words', change: 'Change file', truncated: 'Very long file — we will use the first large part of it.',
    length: 'Video length', limit: 'Max on your plan', studioHint: 'Studio plan: up to 20 minutes',
    look: 'Style', lookVox: 'Paper collage (Vox)', lookVoxD: 'Real photos, paper maps, logos and collage — best for history, geography and science',
    lookMotion: 'Motion graphics', lookMotionD: 'Kinetic text, charts, icons and steps — best for business and tech',
    lookCartoon: '2D cartoon', lookCartoonD: 'Cartoon characters explaining — best for kids',
    lookCartoon3d: '3D cartoon', lookCartoon3dD: 'Talking 3D characters',
    ratio: 'Format', r169: '16:9 YouTube / lessons', r916: '9:16 Shorts',
    voice: 'Narrator voice', captions: 'Captions on screen', brief: 'Extra direction (optional)', briefPh: 'e.g. focus on chapter 2, explain for high-school students, make it energetic',
    cost: 'Cost', credits: 'credits', bal: 'Your balance', start: 'Make the video', starting: 'Starting...', paidOnly: 'This feature is for paid plans — top up credits to start.', topUp: 'Top up',
    working: 'Working on your video', st: { queued: 'Queued', script: 'Reading the document and writing the explanation', narration: 'Recording the narrator', plan: 'Planning the scenes', assets: 'Fetching photos and maps', render: 'Drawing the video', upload: 'Uploading', done: 'Done' },
    longNote: 'Long videos take a while (about 2 minutes per video minute). You can close this page — the video stays in the Documentary Studio.',
    ready: 'Your video is ready!', download: 'Download', another: 'New video', failed: 'Something went wrong — your credits were refunded',
    whatYouGet: 'Your video will include', g1: 'Chapter titles, lists and steps from the file', g2: 'Charts for numbers', g3: 'Maps for places', g4: 'Real photos of people and places',
    editHint: 'When it is done you can edit it from the chat: "change scene 3" or "remove the music".',
  },
};

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 18, padding: 20 };
const label = { fontSize: 13, fontWeight: 700, color: 'var(--text2)', marginBottom: 10, display: 'block' };

export default function PdfVideoPage({ onBack, onNavigate }) {
  const lang = (localStorage.getItem('erivion_region') || 'eg') === 'eg' ? 'ar' : 'en';
  const t = T[lang]; const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [limits, setLimits] = useState(null);
  const [voices, setVoices] = useState([]);
  const [doc, setDoc] = useState(null);
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState('');
  const [seconds, setSeconds] = useState(180);
  const [look, setLook] = useState('vox');
  const [ratio, setRatio] = useState('16:9');
  const [voiceKey, setVoiceKey] = useState('Charon');
  const [captions, setCaptions] = useState(false);
  const [brief, setBrief] = useState('');
  const [quote, setQuote] = useState(null);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState(null);
  const [playing, setPlaying] = useState(null);
  const fileRef = useRef(null), audioRef = useRef(null);

  useEffect(() => {
    fetch('/api/doc-video/limits', { headers: auth(false) }).then(r => r.json()).then(setLimits).catch(() => {});
    fetch('/api/doc-video/voices', { headers: auth(false) }).then(r => r.json()).then(d => setVoices(d.voices || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!doc) return undefined;
    const id = setTimeout(() => fetch('/api/doc-video/estimate', { method: 'POST', headers: auth(), body: JSON.stringify({ seconds, look }) }).then(r => r.json()).then(setQuote).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [doc, seconds, look]);
  // متابعة الوظيفة
  useEffect(() => {
    if (!job?.id || ['done', 'failed'].includes(job.status)) return undefined;
    const id = setInterval(async () => {
      try { const r = await fetch(`/api/documentary/jobs/${job.id}`, { headers: auth(false) }); if (r.ok) { const d = await r.json(); setJob(j => ({ ...j, ...d })); } } catch { /* retry */ }
    }, 4000);
    return () => clearInterval(id);
  }, [job?.id, job?.status]);

  const maxSec = limits?.maxSeconds || 300;
  const pick = async (f) => {
    if (!f) return; setErr(''); setReading(true); setDoc(null);
    try {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/doc-video/extract', { method: 'POST', headers: auth(false), body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'error');
      setDoc(d); setSeconds(Math.min(d.maxSeconds || maxSec, d.suggestedSeconds || 180));
    } catch (e) { setErr(e.message); } finally { setReading(false); }
  };
  const start = async () => {
    if (!doc || starting) return; setErr(''); setStarting(true);
    try {
      const r = await fetch('/api/doc-video/start', { method: 'POST', headers: auth(), body: JSON.stringify({ text: doc.text, fileName: doc.name, title: doc.name.replace(/\.[a-z0-9]+$/i, ''), seconds, look, ratio, voiceKey, captions: captions ? 'karaoke' : 'none', brief, language: doc.language }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'error');
      setJob({ id: d.jobId, status: 'queued', stage: 'queued', progress: 0, cost: d.cost });
    } catch (e) { setErr(e.message); } finally { setStarting(false); }
  };
  const preview = (key) => {
    const a = audioRef.current; if (!a) return;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.src = `/api/agent/voice-preview/${encodeURIComponent(key)}?lang=${lang}&v=3`; a.play().then(() => setPlaying(key)).catch(() => setPlaying(null));
  };

  const looks = [['vox', t.lookVox, t.lookVoxD], ['motion', t.lookMotion, t.lookMotionD], ['cartoon', t.lookCartoon, t.lookCartoonD], ['cartoon3d', t.lookCartoon3d, t.lookCartoon3dD]];
  const lowBal = quote && limits?.credits != null && limits.credits < quote.cost;

  return (
    <div dir={dir} style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 80px' }}>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} style={{ display: 'none' }} />
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', color: 'var(--text2)', fontSize: 13, fontWeight: 600, marginBottom: 14 }}><ArrowLeft size={15} style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }} /> {t.back}</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#7c6af7,#22c1c3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={22} color="#fff" /></div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{t.title}</h1>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.8, maxWidth: 720, marginBottom: 22 }}>{t.sub}</p>

      {job ? (
        <div style={{ ...card, textAlign: 'center', padding: 28 }}>
          {job.status === 'done' ? (
            <>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 800, marginBottom: 14 }}><CheckCircle2 size={18} /> {t.ready}</div>
              <video src={job.videoUrl} controls style={{ width: '100%', maxWidth: ratio === '9:16' ? 360 : 820, borderRadius: 14, background: '#000' }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn-primary" onClick={() => downloadRemoteFile(job.videoUrl, `erivion-${(doc?.name || 'document').replace(/\.[a-z0-9]+$/i, '')}.mp4`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Download size={15} /> {t.download}</button>
                <button onClick={() => { setJob(null); setDoc(null); }} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--bg3)', color: 'var(--text)', fontWeight: 700 }}>{t.another}</button>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 12 }}>{t.editHint}</p>
            </>
          ) : job.status === 'failed' ? (
            <div style={{ color: '#f87171', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}><XCircle size={18} /> {job.error || t.failed}</div>
          ) : (
            <>
              <Loader2 size={28} className="spin" color="var(--accent2)" />
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 12 }}>{t.working}</div>
              <div style={{ fontSize: 13.5, color: 'var(--text2)', marginTop: 6 }}>{t.st[job.stage] || t.st.queued} — {job.progress || 0}%</div>
              <div style={{ height: 8, borderRadius: 99, background: 'var(--bg3)', overflow: 'hidden', maxWidth: 460, margin: '14px auto 0' }}><div style={{ width: `${job.progress || 2}%`, height: '100%', background: 'linear-gradient(90deg,#7c6af7,#22c1c3)', transition: 'width .6s ease' }} /></div>
              <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 14, lineHeight: 1.7 }}>{t.longNote}</p>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
          {/* 1) الملف */}
          <div style={card}>
            {!doc ? (
              <div onClick={() => fileRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
                style={{ border: '2px dashed var(--border2)', borderRadius: 14, padding: '34px 16px', textAlign: 'center', cursor: 'pointer' }}>
                {reading ? <Loader2 size={26} className="spin" color="var(--accent2)" /> : <UploadCloud size={30} color="var(--accent2)" />}
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginTop: 10 }}>{reading ? t.reading : t.drop}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>{t.types}</div>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.rtf" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <FileText size={26} color="var(--accent2)" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{doc.pages ? `${doc.pages} ${t.pages} · ` : ''}{doc.words.toLocaleString()} {t.words}</div>
                  {doc.truncated && <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>{t.truncated}</div>}
                </div>
                <button onClick={() => { setDoc(null); setTimeout(() => fileRef.current?.click(), 0); }} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--bg3)', color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{t.change}</button>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.rtf" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
              </div>
            )}
          </div>

          {doc && (
            <>
              {/* 2) المدة والستايل */}
              <div style={card}>
                <span style={label}>{t.length}: <span style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(seconds)}</span></span>
                <input type="range" min={45} max={Math.max(60, maxSec - 6)} step={15} value={seconds} onChange={e => setSeconds(Number(e.target.value))} style={{ width: '100%' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text3)', marginTop: 4 }}><span>{t.limit}: {fmt(maxSec)}</span>{maxSec < 1200 && <span>{t.studioHint}</span>}</div>

                <span style={{ ...label, marginTop: 18 }}>{t.look}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                  {looks.map(([k, n, dsc]) => (
                    <button key={k} onClick={() => setLook(k)} style={{ textAlign: 'start', padding: 12, borderRadius: 12, border: `1.5px solid ${look === k ? 'var(--accent)' : 'var(--border)'}`, background: look === k ? 'var(--accent-bg)' : 'var(--bg)', color: 'var(--text)' }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{n}</div><div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4, lineHeight: 1.6 }}>{dsc}</div>
                    </button>
                  ))}
                </div>

                <span style={{ ...label, marginTop: 18 }}>{t.ratio}</span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[['16:9', t.r169], ['9:16', t.r916]].map(([k, n]) => <button key={k} onClick={() => setRatio(k)} style={{ padding: '8px 14px', borderRadius: 10, border: `1.5px solid ${ratio === k ? 'var(--accent)' : 'var(--border)'}`, background: ratio === k ? 'var(--accent-bg)' : 'var(--bg)', color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{n}</button>)}
                </div>
              </div>

              {/* 3) الصوت */}
              <div style={card}>
                <span style={label}>{t.voice}</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                  {voices.map(v => { const m = v[lang] || v.en; const on = voiceKey === v.key; return (
                    <div key={v.key} onClick={() => setVoiceKey(v.key)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-bg)' : 'var(--bg)' }}>
                      <span style={{ width: 28, height: 28, borderRadius: 99, background: v.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{m.name}</div><div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.tone}</div></div>
                      <button onClick={e => { e.stopPropagation(); preview(v.key); }} style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--bg3)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{playing === v.key ? <Pause size={13} /> : <Play size={13} />}</button>
                    </div>); })}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13.5, color: 'var(--text)', cursor: 'pointer' }}><input type="checkbox" checked={captions} onChange={e => setCaptions(e.target.checked)} /> {t.captions}</label>
                <span style={{ ...label, marginTop: 14 }}>{t.brief}</span>
                <textarea value={brief} onChange={e => setBrief(e.target.value.slice(0, 400))} placeholder={t.briefPh} rows={2} style={{ width: '100%', borderRadius: 10, padding: 10, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }} />
              </div>

              {/* 4) الملخص */}
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 6 }}>{t.whatYouGet}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: 'var(--text2)' }}>
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><ListChecks size={14} /> {t.g1}</span>
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><BarChart3 size={14} /> {t.g2}</span>
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><MapIcon size={14} /> {t.g3}</span>
                    {look === 'vox' && <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><ImageIcon size={14} /> {t.g4}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'end' }}>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t.cost}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Coins size={16} color="#fbbf24" /> {quote?.cost ?? '…'} <span style={{ fontSize: 12, color: 'var(--text3)' }}>{t.credits}</span></div>
                    {limits?.credits != null && <div style={{ fontSize: 11.5, color: lowBal ? '#f87171' : 'var(--text3)' }}>{t.bal}: {limits.credits}</div>}
                  </div>
                  {limits && !limits.paid ? (
                    <button className="btn-primary" onClick={() => onNavigate?.('pricing')}>{t.topUp}</button>
                  ) : (
                    <button className="btn-primary" disabled={starting || lowBal} onClick={start} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 20px', fontSize: 14.5 }}>{starting ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} {starting ? t.starting : t.start}</button>
                  )}
                </div>
                {limits && !limits.paid && <div style={{ width: '100%', fontSize: 12.5, color: '#fbbf24' }}>{t.paidOnly}</div>}
              </div>
            </>
          )}
          {err && <div style={{ color: '#f87171', fontSize: 13.5, fontWeight: 600 }}>{err}</div>}
        </div>
      )}
      <div style={{ display: 'none' }}><Film /></div>
    </div>
  );
}
