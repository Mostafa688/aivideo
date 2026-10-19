// ── PdfVideoPage.jsx ── "من PDF لفيديو": المدرس/الطالب/الشركة يرفع ملزمة أو كتاب أو ملف شرح → Erivion يكتب سكريبت شرح من المحتوى
// ويعمل فيديو أنيميشن بموشن جرافيكس (عناوين فصول، قوايم، خطوات، رسوم بيانية، خرايط للأماكن، صور حقيقية للأشخاص والأماكن).
// الصوت: راوي جاهز (الذكاء الاصطناعي بيقرا الشرح) أو تسجيل العميل نفسه (الفيديو بيمشي على كلامه والمستند مرجع للصور والخرايط).
// لحد 5 دقايق لأي باقة، و20 دقيقة لباقة Studio.
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, UploadCloud, Loader2, CheckCircle2, XCircle, Download, Play, Pause, Sparkles, Coins, Map as MapIcon, Image as ImageIcon, BarChart3, ListChecks, Mic, Bot, Music2, Captions, Clock3, X } from 'lucide-react';
import { downloadRemoteFile } from '../utils/download.js';

const auth = (json = true) => ({ ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: 'Bearer ' + localStorage.getItem('token') });
const fmt = (sec) => { const m = Math.floor(sec / 60), s = Math.round(sec % 60); return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`; };
const AUDIO_ACCEPT = '.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac,audio/*';

const T = {
  ar: {
    title: 'من PDF لفيديو', sub: 'ارفع ملزمة أو كتاب أو ملخص — وErivion يحوّله لفيديو شرح متحرك من المحتوى المكتوب نفسه: عناوين، رسوم بيانية، خرايط وصور حقيقية.',
    back: 'رجوع', s1: 'الملف', s2: 'الصوت', s3: 'شكل الفيديو', s4: 'لمسات أخيرة',
    drop: 'اسحب الملف هنا أو اضغط للاختيار', types: 'PDF أو Word أو ملف نصي — لحد 15 ميجا', reading: 'بيقرا الملف...',
    pages: 'صفحة', words: 'كلمة', change: 'تغيير', truncated: 'الملف طويل جدًا — هنستخدم أول جزء كبير منه.',
    aiVoice: 'راوي جاهز', aiVoiceD: 'نكتب الشرح من الملف ونسجّله بصوت احترافي', ownVoice: 'صوتي أنا', ownVoiceD: 'ارفع تسجيلك — الفيديو يمشي على كلامك والملف مرجع للصور والخرايط',
    length: 'مدة الفيديو', suggested: 'مقترح لحجم الملف', limit: 'أقصى مدة على باقتك', studioHint: 'Studio لحد 20 دقيقة',
    audioDrop: 'ارفع تسجيل صوتك', audioTypes: 'MP3 أو WAV أو M4A — من 10 ثواني', audioLen: 'مدة التسجيل', audioTooLong: (m) => `التسجيل أطول من الحد المسموح على باقتك (${m}) — قصّره أو قسّمه.`,
    look: 'الستايل', lookVox: 'كولاج ورق (Vox)', lookVoxD: 'صور أرشيف، خرايط ورق ولوجوهات — للتاريخ والجغرافيا والعلوم',
    lookMotion: 'موشن جرافيكس', lookMotionD: 'نص متحرك ورسوم بيانية وخطوات — للبزنس والتقنية',
    lookCartoon: 'كارتون 2D', lookCartoonD: 'شخصيات بتشرح — مناسب للأطفال',
    lookCartoon3d: 'كارتون 3D', lookCartoon3dD: 'شخصيات 3D بتتكلم',
    ratio: 'الأبعاد', r169: 'عرضي 16:9', r169D: 'يوتيوب ودروس', r916: 'طولي 9:16', r916D: 'شورتس وريلز',
    voice: 'اختار الراوي', captions: 'كابشن على الشاشة', music: 'موسيقى خلفية', brief: 'توجيه إضافي', briefPh: 'مثلاً: ركّز على الفصل التاني، أو اشرح لطلاب ثانوي، أو خليه حماسي',
    summary: 'ملخص الطلب', cost: 'التكلفة', credits: 'كريديت', bal: 'رصيدك', start: 'اعمل الفيديو', starting: 'بيبدأ...', paidOnly: 'الميزة دي للباقات المدفوعة.', topUp: 'اشحن رصيد', needDoc: 'ارفع الملف الأول', needAudio: 'ارفع تسجيل صوتك',
    working: 'بنجهّز الفيديو', st: { queued: 'في الطابور', script: 'بيقرا المستند ويكتب الشرح', narration: 'بيجهّز الصوت', plan: 'بيخطط المشاهد', assets: 'بيجيب الصور والخرايط', render: 'بيرسم الفيديو', upload: 'بيرفع الفيديو', done: 'خلص' },
    longNote: 'الفيديوهات الطويلة بتاخد وقت (تقريبًا دقيقتين لكل دقيقة فيديو). تقدر تقفل الصفحة وترجع — الفيديو هيفضل في "استوديو الأفلام".',
    ready: 'الفيديو جاهز', download: 'تنزيل', another: 'فيديو جديد', failed: 'حصلت مشكلة — الكريديت اترجّع', tryAgain: 'جرّب تاني',
    whatYouGet: 'هيتعمل في الفيديو', g1: 'عناوين وقوايم وخطوات من الملف', g2: 'رسوم بيانية وعدادات للأرقام', g3: 'خرايط للأماكن', g4: 'صور حقيقية للأشخاص والأماكن', g5: 'مؤثرات صوتية وموسيقى',
    editHint: 'بعد ما يخلص تقدر تعدّل عليه من الشات: "غيّر المشهد التالت" أو "شيل المزيكا".',
    yes: 'آه', no: 'لأ', voiceRow: 'الصوت', lookRow: 'الستايل', lenRow: 'المدة', fmtRow: 'الأبعاد',
  },
  en: {
    title: 'PDF to Video', sub: 'Upload notes, a book chapter or a summary — Erivion turns it into an animated explainer built from what the document actually says: titles, charts, maps and real photos.',
    back: 'Back', s1: 'Document', s2: 'Voice', s3: 'Look', s4: 'Finishing touches',
    drop: 'Drop the file here or click to choose', types: 'PDF, Word or text — up to 15MB', reading: 'Reading the file...',
    pages: 'pages', words: 'words', change: 'Change', truncated: 'Very long file — we will use the first large part of it.',
    aiVoice: 'AI narrator', aiVoiceD: 'We write the explanation from the file and voice it professionally', ownVoice: 'My own voice', ownVoiceD: 'Upload your recording — the video follows your words, the file guides photos and maps',
    length: 'Video length', suggested: 'suggested for this file', limit: 'Max on your plan', studioHint: 'Studio: up to 20 min',
    audioDrop: 'Upload your voice recording', audioTypes: 'MP3, WAV or M4A — at least 10 seconds', audioLen: 'Recording length', audioTooLong: (m) => `The recording is longer than your plan allows (${m}) — trim it or split it.`,
    look: 'Style', lookVox: 'Paper collage (Vox)', lookVoxD: 'Archive photos, paper maps and logos — history, geography, science',
    lookMotion: 'Motion graphics', lookMotionD: 'Kinetic text, charts and steps — business and tech',
    lookCartoon: '2D cartoon', lookCartoonD: 'Characters explaining — great for kids',
    lookCartoon3d: '3D cartoon', lookCartoon3dD: 'Talking 3D characters',
    ratio: 'Format', r169: 'Landscape 16:9', r169D: 'YouTube & lessons', r916: 'Vertical 9:16', r916D: 'Shorts & Reels',
    voice: 'Pick the narrator', captions: 'On-screen captions', music: 'Background music', brief: 'Extra direction', briefPh: 'e.g. focus on chapter 2, explain for high-school students, make it energetic',
    summary: 'Summary', cost: 'Cost', credits: 'credits', bal: 'Your balance', start: 'Make the video', starting: 'Starting...', paidOnly: 'This feature is for paid plans.', topUp: 'Top up', needDoc: 'Upload the document first', needAudio: 'Upload your recording',
    working: 'Making your video', st: { queued: 'Queued', script: 'Reading the document and writing the explanation', narration: 'Preparing the voice', plan: 'Planning the scenes', assets: 'Fetching photos and maps', render: 'Drawing the video', upload: 'Uploading', done: 'Done' },
    longNote: 'Long videos take a while (about 2 minutes per video minute). You can close this page — the video stays in the Documentary Studio.',
    ready: 'Your video is ready', download: 'Download', another: 'New video', failed: 'Something went wrong — your credits were refunded', tryAgain: 'Try again',
    whatYouGet: 'Your video will include', g1: 'Titles, lists and steps from the file', g2: 'Charts and counters for numbers', g3: 'Maps for places', g4: 'Real photos of people and places', g5: 'Sound effects and music',
    editHint: 'When it is done you can edit it from the chat: "change scene 3" or "remove the music".',
    yes: 'Yes', no: 'No', voiceRow: 'Voice', lookRow: 'Style', lenRow: 'Length', fmtRow: 'Format',
  },
};

const CSS = `
.pv-wrap{max-width:1120px;margin:0 auto;padding:24px 16px 96px}
.pv-hero{position:relative;overflow:hidden;border-radius:22px;padding:26px 24px;margin-bottom:18px;border:1px solid var(--border);
  background:radial-gradient(120% 140% at 100% 0%,rgba(56,189,248,.16),transparent 55%),radial-gradient(90% 120% at 0% 100%,rgba(124,106,247,.18),transparent 60%),var(--bg2)}
.pv-hero h1{font-size:clamp(24px,3.4vw,32px);font-weight:800;color:var(--text);font-family:var(--font-display);margin:0;text-wrap:balance}
.pv-hero p{font-size:14px;color:var(--text2);line-height:1.85;max-width:640px;margin:8px 0 0}
.pv-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
.pv-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--text2);padding:6px 10px;border-radius:99px;background:rgba(255,255,255,.04);border:1px solid var(--border)}
.pv-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:18px;align-items:start}
@media (max-width:900px){.pv-grid{grid-template-columns:minmax(0,1fr)}.pv-side{position:static!important}}
.pv-sec{background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:20px}
.pv-sec + .pv-sec{margin-top:14px}
.pv-h{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.pv-n{width:26px;height:26px;border-radius:99px;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;background:var(--bg3);color:var(--text2);flex-shrink:0}
.pv-n.on{background:linear-gradient(135deg,#7c6af7,#38bdf8);color:#fff}
.pv-h h2{font-size:15.5px;font-weight:800;color:var(--text);margin:0}
.pv-drop{border:1.5px dashed var(--border2);border-radius:14px;padding:30px 16px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s}
.pv-drop:hover,.pv-drop.drag{border-color:#38bdf8;background:rgba(56,189,248,.05)}
.pv-opt{text-align:start;border-radius:14px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer;transition:border-color .15s,background .15s,transform .15s}
.pv-opt:hover{border-color:var(--border2)}
.pv-opt.on{border-color:#38bdf8;background:rgba(56,189,248,.07)}
.pv-opt:focus-visible,.pv-btn:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
.pv-looks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
@media (max-width:1100px){.pv-looks{grid-template-columns:repeat(2,minmax(0,1fr))}}
.pv-thumb{height:74px;border-radius:10px;margin-bottom:10px;position:relative;overflow:hidden}
.pv-range{width:100%;appearance:none;height:6px;border-radius:99px;outline:none;cursor:pointer}
.pv-range::-webkit-slider-thumb{appearance:none;width:20px;height:20px;border-radius:99px;background:#fff;border:4px solid #38bdf8;box-shadow:0 2px 8px rgba(0,0,0,.35)}
.pv-range::-moz-range-thumb{width:14px;height:14px;border-radius:99px;background:#fff;border:4px solid #38bdf8}
.pv-side{position:sticky;top:84px}
.pv-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border);color:var(--text2)}
.pv-row b{color:var(--text);font-weight:700;text-align:end}
.pv-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:12px;font-weight:800;cursor:pointer}
.pv-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:12px;background:var(--bg);border:1px solid var(--border);cursor:pointer;font-size:13.5px;color:var(--text);font-weight:600}
.pv-sw{width:38px;height:22px;border-radius:99px;background:var(--bg3);position:relative;transition:background .2s;flex-shrink:0}
.pv-sw::after{content:'';position:absolute;top:3px;inset-inline-start:3px;width:16px;height:16px;border-radius:99px;background:#fff;transition:inset-inline-start .2s}
.pv-sw.on{background:#38bdf8}.pv-sw.on::after{inset-inline-start:19px}
@media (max-width:560px){.pv-tick{display:none}.pv-sec{padding:16px}.pv-hero{padding:20px 16px}}
@media (prefers-reduced-motion:reduce){.pv-opt,.pv-sw,.pv-sw::after,.pv-drop{transition:none}}
`;

// معاينات مصغّرة مرسومة بـCSS لكل ستايل (عشان العميل يشوف الفرق قبل ما يختار)
function LookThumb({ k }) {
  if (k === 'vox') return (
    <div className="pv-thumb" style={{ background: '#c9a77c' }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,0,0,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.06) 1px,transparent 1px)', backgroundSize: '12px 12px' }} />
      <div style={{ position: 'absolute', left: '14%', top: 12, width: '44%', height: 52, background: '#f3efe6', transform: 'rotate(-4deg)', boxShadow: '0 3px 8px rgba(0,0,0,.25)' }}>
        <div style={{ margin: 6, height: 30, background: 'repeating-radial-gradient(circle at 30% 40%,#555 0 1.2px,#ddd 1.4px 3px)' }} />
      </div>
      <div style={{ position: 'absolute', left: '30%', top: 6, width: 26, height: 9, background: 'rgba(255,240,180,.85)', transform: 'rotate(-10deg)' }} />
      <div style={{ position: 'absolute', right: '12%', top: 22, width: 46, height: 30, border: '2.5px solid #e63946', borderRadius: '50%', transform: 'rotate(8deg)' }} />
      <div style={{ position: 'absolute', right: '10%', bottom: 10, padding: '2px 6px', border: '2px solid #1d3557', color: '#1d3557', fontSize: 9, fontWeight: 900, transform: 'rotate(-6deg)' }}>1869</div>
    </div>
  );
  if (k === 'motion') return (
    <div className="pv-thumb" style={{ background: 'linear-gradient(135deg,#0d1028,#1b1145)' }}>
      {[38, 58, 30, 70].map((hgt, i) => <div key={i} style={{ position: 'absolute', bottom: 12, left: `${14 + i * 12}%`, width: '8%', height: `${hgt}%`, borderRadius: 4, background: i === 3 ? 'linear-gradient(#38bdf8,#7c6af7)' : 'rgba(255,255,255,.18)' }} />)}
      <div style={{ position: 'absolute', right: '10%', top: 14, color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: -0.5 }}>12%</div>
      <div style={{ position: 'absolute', right: '10%', top: 44, width: 54, height: 4, borderRadius: 4, background: '#38bdf8' }} />
    </div>
  );
  if (k === 'cartoon') return (
    <div className="pv-thumb" style={{ background: 'linear-gradient(#bfe6ff,#e9f7ff)' }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 16, background: '#8fd18f' }} />
      <div style={{ position: 'absolute', bottom: 10, left: '22%', width: 34, height: 34, borderRadius: '50%', background: '#ffcf99', border: '2.5px solid #2b2b2b' }}>
        <div style={{ position: 'absolute', top: 11, left: 8, width: 4, height: 5, borderRadius: 4, background: '#2b2b2b', boxShadow: '12px 0 0 #2b2b2b' }} />
        <div style={{ position: 'absolute', bottom: 7, left: 10, width: 12, height: 5, borderRadius: '0 0 8px 8px', background: '#c0392b' }} />
      </div>
      <div style={{ position: 'absolute', top: 10, right: '10%', padding: '5px 9px', background: '#fff', border: '2px solid #2b2b2b', borderRadius: 12, fontSize: 10, fontWeight: 800, color: '#2b2b2b' }}>!</div>
    </div>
  );
  return (
    <div className="pv-thumb" style={{ background: 'linear-gradient(160deg,#ffd6e8,#d7e3ff)' }}>
      <div style={{ position: 'absolute', bottom: 8, left: '50%', marginLeft: -24, width: 48, height: 48, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#fff 0 6%,#ff9ec4 25%,#d65a8f 75%)', boxShadow: '0 10px 14px -6px rgba(120,40,80,.45)' }} />
      <div style={{ position: 'absolute', bottom: 4, left: '50%', marginLeft: -26, width: 52, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,.12)' }} />
    </div>
  );
}

export default function PdfVideoPage({ onBack, onNavigate }) {
  const lang = (localStorage.getItem('erivion_region') || 'eg') === 'eg' ? 'ar' : 'en';
  const t = T[lang]; const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const [limits, setLimits] = useState(null);
  const [voices, setVoices] = useState([]);
  const [doc, setDoc] = useState(null);
  const [reading, setReading] = useState(false);
  const [drag, setDrag] = useState('');
  const [err, setErr] = useState('');
  const [seconds, setSeconds] = useState(180);
  const [look, setLook] = useState('vox');
  const [ratio, setRatio] = useState('16:9');
  const [voiceMode, setVoiceMode] = useState('ai');
  const [voiceKey, setVoiceKey] = useState('Charon');
  const [audio, setAudio] = useState(null); // { file, url, duration }
  const [captions, setCaptions] = useState(false);
  const [music, setMusic] = useState(true);
  const [brief, setBrief] = useState('');
  const [quote, setQuote] = useState(null);
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState(null);
  const [playing, setPlaying] = useState(null);
  const fileRef = useRef(null), audioInRef = useRef(null), audioRef = useRef(null);

  useEffect(() => {
    fetch('/api/doc-video/limits', { headers: auth(false) }).then(r => r.json()).then(setLimits).catch(() => {});
    fetch('/api/doc-video/voices', { headers: auth(false) }).then(r => r.json()).then(d => setVoices(d.voices || [])).catch(() => {});
  }, []);
  useEffect(() => () => { if (audio?.url) URL.revokeObjectURL(audio.url); }, [audio?.url]);

  const own = voiceMode === 'own';
  const effSeconds = own ? (audio?.duration || 0) : seconds;
  useEffect(() => {
    if (!doc || (own && !audio)) { setQuote(null); return undefined; }
    const id = setTimeout(() => fetch('/api/doc-video/estimate', { method: 'POST', headers: auth(), body: JSON.stringify({ seconds: Math.max(10, effSeconds), look, userVoiceover: own }) }).then(r => r.json()).then(setQuote).catch(() => {}), 200);
    return () => clearTimeout(id);
  }, [doc, effSeconds, look, own, audio]);
  // متابعة الوظيفة
  useEffect(() => {
    if (!job?.id || ['done', 'failed'].includes(job.status)) return undefined;
    const id = setInterval(async () => {
      try { const r = await fetch(`/api/documentary/jobs/${job.id}`, { headers: auth(false) }); if (r.ok) { const d = await r.json(); setJob(j => ({ ...j, ...d })); } } catch { /* retry */ }
    }, 4000);
    return () => clearInterval(id);
  }, [job?.id, job?.status]);

  const maxSec = limits?.maxSeconds || 300;
  const sliderMax = Math.max(60, maxSec - 6);
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
  const pickAudio = (f) => {
    if (!f) return; setErr('');
    const url = URL.createObjectURL(f); const el = new Audio();
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      if (duration && duration < 10) { setErr(t.audioTypes); URL.revokeObjectURL(url); return; }
      setAudio({ file: f, url, duration });
    };
    el.onerror = () => setAudio({ file: f, url, duration: 0 });
    el.src = url;
  };
  const audioTooLong = own && audio?.duration > maxSec + 1;
  const start = async () => {
    if (!doc || starting || (own && (!audio || audioTooLong))) return; setErr(''); setStarting(true);
    const fields = { text: doc.text, fileName: doc.name, title: doc.name.replace(/\.[a-z0-9]+$/i, ''), look, ratio, voiceKey, captions: captions ? 'karaoke' : 'none', music, brief, language: doc.language };
    try {
      let r;
      if (own) {
        const fd = new FormData();
        Object.entries(fields).forEach(([k, v]) => fd.append(k, String(v)));
        fd.append('audio', audio.file, audio.file.name || 'voice.mp3');
        r = await fetch('/api/doc-video/start', { method: 'POST', headers: auth(false), body: fd });
      } else {
        r = await fetch('/api/doc-video/start', { method: 'POST', headers: auth(), body: JSON.stringify({ ...fields, seconds }) });
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'error');
      setJob({ id: d.jobId, status: 'queued', stage: 'queued', progress: 0, cost: d.cost });
    } catch (e) { setErr(e.message); } finally { setStarting(false); }
  };
  const preview = (key) => {
    const a = audioRef.current; if (!a) return;
    if (playing === key) { a.pause(); setPlaying(null); return; }
    a.src = key === '__own' ? audio?.url : `/api/agent/voice-preview/${encodeURIComponent(key)}?lang=${lang}&v=3`;
    a.play().then(() => setPlaying(key)).catch(() => setPlaying(null));
  };

  const looks = [['vox', t.lookVox, t.lookVoxD], ['motion', t.lookMotion, t.lookMotionD], ['cartoon', t.lookCartoon, t.lookCartoonD], ['cartoon3d', t.lookCartoon3d, t.lookCartoon3dD]];
  const lookName = Object.fromEntries(looks.map(([k, n]) => [k, n]));
  const lowBal = quote && limits?.credits != null && limits.credits < quote.cost;
  const pct = ((seconds - 45) / Math.max(1, sliderMax - 45)) * 100;
  const voiceName = own ? t.ownVoice : ((voices.find(v => v.key === voiceKey) || {})[lang]?.name || voiceKey);
  const blocker = !doc ? t.needDoc : own && !audio ? t.needAudio : null;
  const ticks = [60, 180, 300, 600, 900, 1200].filter(x => x <= sliderMax + 6);

  return (
    <div dir={dir} className="pv-wrap">
      <style>{CSS}</style>
      <audio ref={audioRef} onEnded={() => setPlaying(null)} style={{ display: 'none' }} />
      <button onClick={onBack} className="pv-btn" style={{ background: 'none', color: 'var(--text2)', fontSize: 13, fontWeight: 600, marginBottom: 12, padding: 0 }}><ArrowLeft size={15} style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }} /> {t.back}</button>

      <div className="pv-hero">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(135deg,#7c6af7,#38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={23} color="#fff" /></div>
          <h1>{t.title}</h1>
        </div>
        <p>{t.sub}</p>
        <div className="pv-chips">
          <span className="pv-chip"><ListChecks size={13} /> {t.g1}</span>
          <span className="pv-chip"><BarChart3 size={13} /> {t.g2}</span>
          <span className="pv-chip"><MapIcon size={13} /> {t.g3}</span>
          <span className="pv-chip"><ImageIcon size={13} /> {t.g4}</span>
        </div>
      </div>

      {job ? (
        <div className="pv-sec" style={{ textAlign: 'center', padding: 30 }}>
          {job.status === 'done' ? (
            <>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#22c55e', fontWeight: 800, marginBottom: 14, fontSize: 16 }}><CheckCircle2 size={19} /> {t.ready}</div>
              <video src={job.videoUrl} controls style={{ width: '100%', maxWidth: ratio === '9:16' ? 360 : 860, borderRadius: 14, background: '#000', display: 'block', margin: '0 auto' }} />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <button className="btn-primary pv-btn" onClick={() => downloadRemoteFile(job.videoUrl, `erivion-${(doc?.name || 'document').replace(/\.[a-z0-9]+$/i, '')}.mp4`)} style={{ padding: '11px 18px' }}><Download size={15} /> {t.download}</button>
                <button className="pv-btn" onClick={() => { setJob(null); setDoc(null); setAudio(null); }} style={{ padding: '11px 18px', background: 'var(--bg3)', color: 'var(--text)' }}>{t.another}</button>
              </div>
              <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 14 }}>{t.editHint}</p>
            </>
          ) : job.status === 'failed' ? (
            <>
              <div style={{ color: '#f87171', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}><XCircle size={18} /> {job.error || t.failed}</div>
              <div><button className="pv-btn" onClick={() => setJob(null)} style={{ marginTop: 14, padding: '10px 16px', background: 'var(--bg3)', color: 'var(--text)' }}>{t.tryAgain}</button></div>
            </>
          ) : (
            <>
              <Loader2 size={30} className="spin" color="#38bdf8" />
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', marginTop: 12 }}>{t.working}</div>
              <div style={{ fontSize: 13.5, color: 'var(--text2)', marginTop: 6 }}>{t.st[job.stage] || t.st.queued} — <span style={{ fontVariantNumeric: 'tabular-nums' }}>{job.progress || 0}%</span></div>
              <div style={{ height: 8, borderRadius: 99, background: 'var(--bg3)', overflow: 'hidden', maxWidth: 480, margin: '16px auto 0' }}><div style={{ width: `${Math.max(2, job.progress || 0)}%`, height: '100%', background: 'linear-gradient(90deg,#7c6af7,#38bdf8)', transition: 'width .6s ease' }} /></div>
              <p style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 16, lineHeight: 1.75, maxWidth: 520, marginInline: 'auto' }}>{t.longNote}</p>
            </>
          )}
        </div>
      ) : (
        <div className="pv-grid">
          <div>
            {/* 1) الملف */}
            <section className="pv-sec">
              <div className="pv-h"><span className={`pv-n${doc ? ' on' : ''}`}>1</span><h2>{t.s1}</h2></div>
              <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.rtf" style={{ display: 'none' }} onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
              {!doc ? (
                <div className={`pv-drop${drag === 'doc' ? ' drag' : ''}`} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()} onClick={() => fileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDrag('doc'); }} onDragLeave={() => setDrag('')} onDrop={e => { e.preventDefault(); setDrag(''); pick(e.dataTransfer.files?.[0]); }}>
                  {reading ? <Loader2 size={28} className="spin" color="#38bdf8" /> : <UploadCloud size={32} color="#38bdf8" />}
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginTop: 10 }}>{reading ? t.reading : t.drop}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>{t.types}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 42, height: 50, borderRadius: 8, background: 'linear-gradient(160deg,#fff,#e8eef5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6, flexShrink: 0 }}><span style={{ fontSize: 9, fontWeight: 900, color: '#e11d48' }}>{(doc.name.split('.').pop() || 'PDF').toUpperCase().slice(0, 4)}</span></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{doc.name}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{doc.pages ? `${doc.pages} ${t.pages} · ` : ''}{doc.words.toLocaleString()} {t.words}</div>
                    {doc.truncated && <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 4 }}>{t.truncated}</div>}
                  </div>
                  <button className="pv-btn" onClick={() => fileRef.current?.click()} style={{ padding: '8px 14px', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13 }}>{t.change}</button>
                </div>
              )}
            </section>

            {/* 2) الصوت */}
            <section className="pv-sec" style={{ opacity: doc ? 1 : 0.55, pointerEvents: doc ? 'auto' : 'none' }}>
              <div className="pv-h"><span className={`pv-n${doc && (!own || audio) ? ' on' : ''}`}>2</span><h2>{t.s2}</h2></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 10 }}>
                {[['ai', Bot, t.aiVoice, t.aiVoiceD], ['own', Mic, t.ownVoice, t.ownVoiceD]].map(([k, Icon, n, dsc]) => (
                  <button key={k} className={`pv-opt${voiceMode === k ? ' on' : ''}`} onClick={() => setVoiceMode(k)} style={{ display: 'flex', gap: 12, padding: 14, alignItems: 'flex-start' }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, background: voiceMode === k ? 'linear-gradient(135deg,#7c6af7,#38bdf8)' : 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={18} color={voiceMode === k ? '#fff' : 'var(--text2)'} /></span>
                    <span><span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{n}</span><span style={{ display: 'block', fontSize: 12, color: 'var(--text3)', marginTop: 3, lineHeight: 1.6 }}>{dsc}</span></span>
                  </button>
                ))}
              </div>

              {!own ? (
                <>
                  <div style={{ marginTop: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>{t.length}</span>
                      <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(seconds)}</span>
                    </div>
                    <input className="pv-range" type="range" min={45} max={sliderMax} step={15} value={Math.min(seconds, sliderMax)} onChange={e => setSeconds(Number(e.target.value))}
                      style={{ direction: 'ltr', background: `linear-gradient(90deg,#7c6af7,#38bdf8 ${pct}%,var(--bg3) ${pct}%)` }} aria-label={t.length} />
                    <div style={{ position: 'relative', height: 16, fontSize: 11.5, color: 'var(--text3)', marginTop: 8, direction: 'ltr', fontVariantNumeric: 'tabular-nums' }}>
                      <span style={{ position: 'absolute', left: 0 }}>0:45</span>
                      {ticks.filter(x => x > 60 && x < sliderMax - 60).map(x => { const p = ((x - 45) / (sliderMax - 45)) * 100; return p > 8 && p < 90 ? <span key={x} className="pv-tick" style={{ position: 'absolute', left: `${p}%`, transform: 'translateX(-50%)' }}>{fmt(x)}</span> : null; })}
                      <span style={{ position: 'absolute', right: 0 }}>{fmt(maxSec)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>
                      {doc?.suggestedSeconds ? <button className="pv-btn" onClick={() => setSeconds(doc.suggestedSeconds)} style={{ background: 'none', padding: 0, fontSize: 12, color: '#38bdf8', fontWeight: 600 }}><Clock3 size={12} /> {fmt(doc.suggestedSeconds)} {t.suggested}</button> : <span />}
                      <span>{t.limit}: {fmt(maxSec)}{maxSec < 1200 ? ` · ${t.studioHint}` : ''}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', margin: '20px 0 10px' }}>{t.voice}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(150px,100%),1fr))', gap: 8 }}>
                    {voices.map(v => { const m = v[lang] || v.en; const on = voiceKey === v.key; return (
                      <div key={v.key} className={`pv-opt${on ? ' on' : ''}`} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setVoiceKey(v.key)} onClick={() => setVoiceKey(v.key)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px' }}>
                        <span style={{ width: 30, height: 30, borderRadius: 99, background: v.color, flexShrink: 0, boxShadow: on ? '0 0 0 2px var(--bg), 0 0 0 4px #38bdf8' : 'none' }} />
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>{m.name}</div><div style={{ fontSize: 11, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.tone}</div></div>
                        <button className="pv-btn" aria-label="preview" onClick={e => { e.stopPropagation(); preview(v.key); }} style={{ width: 28, height: 28, borderRadius: 99, background: 'var(--bg3)', color: 'var(--text)', flexShrink: 0 }}>{playing === v.key ? <Pause size={13} /> : <Play size={13} />}</button>
                      </div>); })}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <input ref={audioInRef} type="file" accept={AUDIO_ACCEPT} style={{ display: 'none' }} onChange={e => { pickAudio(e.target.files?.[0]); e.target.value = ''; }} />
                  {!audio ? (
                    <div className={`pv-drop${drag === 'audio' ? ' drag' : ''}`} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && audioInRef.current?.click()} onClick={() => audioInRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); setDrag('audio'); }} onDragLeave={() => setDrag('')} onDrop={e => { e.preventDefault(); setDrag(''); pickAudio(e.dataTransfer.files?.[0]); }}>
                      <Mic size={28} color="#38bdf8" />
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)', marginTop: 8 }}>{t.audioDrop}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text3)', marginTop: 4 }}>{t.audioTypes} · {t.limit}: {fmt(maxSec)}</div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: 'var(--bg)', border: `1px solid ${audioTooLong ? '#f87171' : 'var(--border)'}` }}>
                      <button className="pv-btn" aria-label="play" onClick={() => preview('__own')} style={{ width: 40, height: 40, borderRadius: 99, background: 'linear-gradient(135deg,#7c6af7,#38bdf8)', color: '#fff', flexShrink: 0 }}>{playing === '__own' ? <Pause size={16} /> : <Play size={16} />}</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} dir="auto">{audio.file.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' }}>{t.audioLen}: {audio.duration ? fmt(audio.duration) : '—'}</div>
                      </div>
                      <button className="pv-btn" aria-label="remove" onClick={() => { if (playing === '__own') { audioRef.current?.pause(); setPlaying(null); } setAudio(null); }} style={{ width: 32, height: 32, borderRadius: 99, background: 'var(--bg3)', color: 'var(--text2)' }}><X size={15} /></button>
                    </div>
                  )}
                  {audioTooLong && <div style={{ fontSize: 12.5, color: '#f87171', marginTop: 8 }}>{t.audioTooLong(fmt(maxSec))}</div>}
                </div>
              )}
            </section>

            {/* 3) الشكل */}
            <section className="pv-sec" style={{ opacity: doc ? 1 : 0.55, pointerEvents: doc ? 'auto' : 'none' }}>
              <div className="pv-h"><span className={`pv-n${doc ? ' on' : ''}`}>3</span><h2>{t.s3}</h2></div>
              <div className="pv-looks">
                {looks.map(([k, n, dsc]) => (
                  <button key={k} className={`pv-opt${look === k ? ' on' : ''}`} onClick={() => setLook(k)} style={{ padding: 10 }}>
                    <LookThumb k={k} />
                    <div style={{ fontWeight: 800, fontSize: 13.5, padding: '0 2px' }}>{n}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 3, lineHeight: 1.6, padding: '0 2px' }}>{dsc}</div>
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', margin: '18px 0 10px' }}>{t.ratio}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[['16:9', t.r169, t.r169D, 34, 20], ['9:16', t.r916, t.r916D, 16, 28]].map(([k, n, dsc, w, h]) => (
                  <button key={k} className={`pv-opt${ratio === k ? ' on' : ''}`} onClick={() => setRatio(k)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', flex: '1 1 170px' }}>
                    <span style={{ width: 36, display: 'flex', justifyContent: 'center' }}><span style={{ width: w, height: h, borderRadius: 4, border: `2px solid ${ratio === k ? '#38bdf8' : 'var(--text3)'}` }} /></span>
                    <span><span style={{ display: 'block', fontWeight: 800, fontSize: 13.5 }}>{n}</span><span style={{ display: 'block', fontSize: 11.5, color: 'var(--text3)' }}>{dsc}</span></span>
                  </button>
                ))}
              </div>
            </section>

            {/* 4) لمسات */}
            <section className="pv-sec" style={{ opacity: doc ? 1 : 0.55, pointerEvents: doc ? 'auto' : 'none' }}>
              <div className="pv-h"><span className={`pv-n${doc ? ' on' : ''}`}>4</span><h2>{t.s4}</h2></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(220px,100%),1fr))', gap: 10 }}>
                <div className="pv-toggle" role="switch" aria-checked={captions} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setCaptions(c => !c)} onClick={() => setCaptions(c => !c)}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Captions size={16} /> {t.captions}</span><span className={`pv-sw${captions ? ' on' : ''}`} /></div>
                <div className="pv-toggle" role="switch" aria-checked={music} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setMusic(c => !c)} onClick={() => setMusic(c => !c)}><span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Music2 size={16} /> {t.music}</span><span className={`pv-sw${music ? ' on' : ''}`} /></div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', margin: '16px 0 8px' }}>{t.brief}</div>
              <textarea value={brief} onChange={e => setBrief(e.target.value.slice(0, 400))} placeholder={t.briefPh} rows={2} style={{ width: '100%', borderRadius: 12, padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical', fontSize: 13.5, lineHeight: 1.7 }} />
            </section>
          </div>

          {/* الملخص الجانبي */}
          <aside className="pv-side">
            <div className="pv-sec" style={{ padding: 18 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>{t.summary}</div>
              <div className="pv-row"><span>{t.s1}</span><b dir="auto" style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc?.name || '—'}</b></div>
              <div className="pv-row"><span>{t.voiceRow}</span><b>{voiceName}</b></div>
              <div className="pv-row"><span>{t.lenRow}</span><b style={{ fontVariantNumeric: 'tabular-nums' }}>{own ? (audio?.duration ? fmt(audio.duration) : '—') : fmt(seconds)}</b></div>
              <div className="pv-row"><span>{t.lookRow}</span><b>{lookName[look]}</b></div>
              <div className="pv-row" style={{ borderBottom: 'none' }}><span>{t.fmtRow}</span><b>{ratio}</b></div>

              <div style={{ marginTop: 12, padding: 14, borderRadius: 14, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--text3)' }}>{t.cost}</span>
                  <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Coins size={17} color="#fbbf24" /> {quote?.cost ?? '—'} <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600 }}>{t.credits}</span></span>
                </div>
                {limits?.credits != null && <div style={{ fontSize: 12, color: lowBal ? '#f87171' : 'var(--text3)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{t.bal}: {limits.credits.toLocaleString()}</div>}
              </div>

              {limits && !limits.paid ? (
                <>
                  <div style={{ fontSize: 12.5, color: '#fbbf24', margin: '12px 0 8px' }}>{t.paidOnly}</div>
                  <button className="btn-primary pv-btn" onClick={() => onNavigate?.('pricing')} style={{ width: '100%', padding: '13px 16px' }}>{t.topUp}</button>
                </>
              ) : lowBal ? (
                <button className="btn-primary pv-btn" onClick={() => onNavigate?.('pricing')} style={{ width: '100%', padding: '13px 16px', marginTop: 12 }}>{t.topUp}</button>
              ) : (
                <button className="btn-primary pv-btn" disabled={starting || !!blocker || audioTooLong} onClick={start} style={{ width: '100%', padding: '13px 16px', fontSize: 15, marginTop: 12, opacity: blocker || audioTooLong ? 0.55 : 1 }}>
                  {starting ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />} {starting ? t.starting : blocker || t.start}
                </button>
              )}
              {err && <div style={{ color: '#f87171', fontSize: 13, fontWeight: 600, marginTop: 10, lineHeight: 1.6 }}>{err}</div>}

              <div style={{ fontSize: 12, color: 'var(--text3)', margin: '16px 0 8px', fontWeight: 700 }}>{t.whatYouGet}</div>
              <div style={{ display: 'grid', gap: 7, fontSize: 12.5, color: 'var(--text2)' }}>
                <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><ListChecks size={14} color="#38bdf8" /> {t.g1}</span>
                <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><BarChart3 size={14} color="#38bdf8" /> {t.g2}</span>
                <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><MapIcon size={14} color="#38bdf8" /> {t.g3}</span>
                {look === 'vox' && <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><ImageIcon size={14} color="#38bdf8" /> {t.g4}</span>}
                <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><Music2 size={14} color="#38bdf8" /> {t.g5}</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
