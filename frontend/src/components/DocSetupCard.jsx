// ── DocSetupCard.jsx ── بطاقة إعدادات الفيلم الوثائقي جوه شات الايجنت: العميل بيختار كل حاجة (مصدر السكريبت، المدة، المقاس،
// الصوت، الستايل، الكابشن، الموسيقى) ويشوف السعر لحظيًا ويبدأ الفيلم بزرار واحد — بنفس API استوديو الأفلام الوثائقية.
import { useEffect, useRef, useState } from 'react';
import { Film, Wand2, FileText, Mic, Play, Loader2, CheckCircle2, Upload } from 'lucide-react';

const tokenHeader = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') });
const MINUTES = [1, 2, 3, 5, 8, 10, 15, 20, 30];
const VERTICAL_MAX = 3; // الفيلم الطولي (9:16) لحد 3 دقائق

const TXT = {
  ar: {
    title: 'إعدادات الفيلم الوثائقي', source: 'السكريبت', mTopic: 'AI يكتب السكريبت', mScript: 'سكريبتي أنا', mVoice: 'صوتي المرفوع',
    topic: 'الموضوع', topicPh: 'عن إيه الفيلم؟', minutes: 'المدة', min: 'دقيقة', script: 'السكريبت', scriptPh: 'الصق السكريبت هنا (بيتنضّف تلقائيًا لو فيه علامات)…',
    voiceFile: 'ارفع تسجيلك الصوتي', voiceHint: 'الفيلم هيتبني على طول صوتك', language: 'اللغة', ratio: 'المقاس', wide: 'أفقي 16:9', tall: 'طولي 9:16',
    narrator: 'صوت المعلّق (AI)', style: 'الستايل', captions: 'الكابشن', music: 'موسيقى خلفية', motion: 'موشن جرافيك', on: 'شغّال', off: 'مقفول',
    karaoke: 'كاريوكي', box: 'صندوق', pop: 'بوب', none: 'بدون',
    price: 'السعر', free: 'مجاني (مرة واحدة + علامة مائية)', credits: 'كريديت', balance: 'رصيدك', start: 'ابدأ الفيلم', starting: 'بيبدأ…',
    started: 'الفيلم بدأ — هيظهر هنا أول ما يخلص', needTopic: 'اكتب الموضوع', needScript: 'الصق السكريبت الأول', needVoice: 'ارفع التسجيل الصوتي', notEnough: 'الرصيد مش كفاية',
    audioLen: 'طول التسجيل',
    vNote: 'الفيلم الطولي (9:16) لحد 3 دقائق، وبكابشن كبير في النص كلمة كلمة.', vTooLong: 'الفيلم الطولي أقصى مدة له 3 دقائق — قصّر الفيلم أو اختار 16:9.',
  },
  en: {
    title: 'Documentary settings', source: 'Script', mTopic: 'AI writes the script', mScript: 'My own script', mVoice: 'My voiceover',
    topic: 'Topic', topicPh: 'What is the film about?', minutes: 'Length', min: 'min', script: 'Script', scriptPh: 'Paste your script here (cleaned automatically if it has markers)…',
    voiceFile: 'Upload your voice recording', voiceHint: "The film is built on your voice's length", language: 'Language', ratio: 'Aspect ratio', wide: 'Wide 16:9', tall: 'Vertical 9:16',
    narrator: 'AI narrator voice', style: 'Style', captions: 'Captions', music: 'Background music', motion: 'Motion graphics', on: 'On', off: 'Off',
    karaoke: 'Karaoke', box: 'Box', pop: 'Pop', none: 'None',
    price: 'Price', free: 'Free (once, with watermark)', credits: 'credits', balance: 'Your balance', start: 'Start the film', starting: 'Starting…',
    started: 'Film started — it will appear here when it is ready', needTopic: 'Enter the topic', needScript: 'Paste the script first', needVoice: 'Upload the voice recording', notEnough: 'Not enough credits',
    audioLen: 'Recording length',
    vNote: 'Vertical (9:16) films run up to 3 minutes, with big centered word-by-word captions.', vTooLong: 'Vertical (9:16) films can be up to 3 minutes — shorten the film or choose 16:9.',
  },
};

const box = { padding: 12, borderRadius: 14, background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.09)', width: '100%', boxSizing: 'border-box' };
const label = { fontSize: 11.5, fontWeight: 700, color: 'var(--text2)', marginBottom: 5, display: 'block' };
const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 9, color: '#fff', fontSize: 13, padding: '8px 10px', fontFamily: 'inherit', outline: 'none' };

function Chip({ active, onClick, children, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ padding: '6px 11px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        background: active ? 'var(--accent-bg)' : 'rgba(255,255,255,0.04)', color: active ? 'var(--accent2)' : 'var(--text2)',
        border: `1px solid ${active ? 'rgba(124,106,247,0.55)' : 'rgba(255,255,255,0.1)'}` }}>
      {children}
    </button>
  );
}

const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return 0; const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const Row = ({ children, mt = 12 }) => <div style={{ marginTop: mt }}>{children}</div>;

export default function DocSetupCard({ setup = {}, lang = 'ar', started = false, onStarted }) {
  const ar = lang === 'ar';
  const t = TXT[ar ? 'ar' : 'en'];
  const [opts, setOpts] = useState(null);
  const [mode, setMode] = useState(setup.mode || 'topic');
  const [topic, setTopic] = useState(setup.topic || '');
  const [minutes, setMinutes] = useState(MINUTES.includes(setup.minutes) ? setup.minutes : (MINUTES.find(m => m >= (setup.minutes || 5)) || 5));
  const [script, setScript] = useState('');
  const [audio, setAudio] = useState(null);
  const [audioDur, setAudioDur] = useState(0);
  const [language, setLanguage] = useState(setup.language || (ar ? 'ar' : 'en'));
  const [ratio, setRatio] = useState('16:9');
  const [voiceKey, setVoiceKey] = useState('male_wise');
  const [theme, setTheme] = useState('blue');
  const [captions, setCaptions] = useState('karaoke');
  const [music, setMusic] = useState(true);
  const [motion, setMotion] = useState(true);
  const [est, setEst] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    let dead = false;
    fetch('/api/documentary/options', { headers: tokenHeader() }).then(r => r.json()).then(d => { if (!dead) setOpts(d); }).catch(() => {});
    return () => { dead = true; };
  }, []);

  // السعر لحظيًا (debounce)
  useEffect(() => {
    if (started) return undefined;
    const body = { language, ratio, minutes: mode === 'topic' ? minutes : undefined, script: mode === 'script' ? script : undefined, audioDurationSec: mode === 'voiceover' ? audioDur : undefined };
    if ((mode === 'script' && script.trim().length < 20) || (mode === 'voiceover' && !audioDur)) { setEst(null); return undefined; }
    const h = setTimeout(() => {
      fetch('/api/documentary/estimate', { method: 'POST', headers: { ...tokenHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(r => r.json()).then(setEst).catch(() => {});
    }, 400);
    return () => clearTimeout(h);
  }, [mode, minutes, script, audioDur, language, ratio, started]);

  const pickAudio = (file) => {
    setErr('');
    if (!file) return;
    setAudio(file);
    const a = new Audio(URL.createObjectURL(file));
    a.onloadedmetadata = () => setAudioDur(Number.isFinite(a.duration) ? Math.round(a.duration) : 0);
    a.onerror = () => setAudioDur(0);
  };

  const vTooLong = ratio === '9:16' && (mode === 'topic' ? minutes > VERTICAL_MAX : !!est?.verticalTooLong);
  const start = async () => {
    setErr('');
    if (vTooLong) return setErr(t.vTooLong);
    if (mode === 'topic' && topic.trim().length < 3) return setErr(t.needTopic);
    if (mode === 'script' && script.trim().length < 20) return setErr(t.needScript);
    if (mode === 'voiceover' && !audio) return setErr(t.needVoice);
    setBusy(true);
    try {
      const common = { language, ratio, theme, captions, music, motionGraphics: motion, voiceKey, title: topic.trim().slice(0, 120) };
      let res;
      if (mode === 'voiceover') {
        const fd = new FormData();
        fd.append('audio', audio, audio.name);
        Object.entries({ ...common, title: common.title || audio.name.replace(/\.[a-z0-9]+$/i, '') }).forEach(([k, v]) => fd.append(k, String(v)));
        res = await fetch('/api/documentary/jobs', { method: 'POST', headers: tokenHeader(), body: fd });
      } else {
        const body = mode === 'topic' ? { ...common, mode: 'topic', topic: topic.trim(), minutes } : { ...common, mode: 'script', script };
        res = await fetch('/api/documentary/jobs', { method: 'POST', headers: { ...tokenHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error === 'quota_exceeded' ? `${t.notEnough} (${d.cost} / ${d.remaining ?? 0})` : (d.message || 'Failed')); return; }
      onStarted?.({ jobId: d.jobId, kind: 'documentary', title: topic.trim() || audio?.name || 'Documentary' }, { cost: d.cost, trial: d.trial });
    } catch (e) {
      setErr(e.message || 'Failed');
    } finally { setBusy(false); }
  };

  const dir = ar ? 'rtl' : 'ltr';
  if (started) {
    return (
      <div style={{ ...box, direction: dir, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#fff' }}>
        <CheckCircle2 size={16} color="#22c55e" /> {t.started}
      </div>
    );
  }

  const themes = opts?.themes || [];
  const voices = (opts?.voices || []).slice(0, 12);
  const cost = est?.cost;
  const notEnough = est && est.enough === false;
  return (
    <div style={{ ...box, direction: dir, textAlign: ar ? 'right' : 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, fontSize: 14, color: '#fff' }}><Film size={16} /> {t.title}</div>

      <Row>
        <span style={label}>{t.source}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip active={mode === 'topic'} onClick={() => setMode('topic')}><Wand2 size={11} style={{ verticalAlign: -1 }} /> {t.mTopic}</Chip>
          <Chip active={mode === 'script'} onClick={() => setMode('script')}><FileText size={11} style={{ verticalAlign: -1 }} /> {t.mScript}</Chip>
          <Chip active={mode === 'voiceover'} onClick={() => setMode('voiceover')}><Mic size={11} style={{ verticalAlign: -1 }} /> {t.mVoice}</Chip>
        </div>
      </Row>

      {mode === 'topic' && (
        <>
          <Row><span style={label}>{t.topic}</span><input value={topic} onChange={e => setTopic(e.target.value)} placeholder={t.topicPh} maxLength={300} style={inputStyle} /></Row>
          <Row><span style={label}>{t.minutes}</span>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{MINUTES.map(m => <Chip key={m} active={minutes === m} disabled={ratio === '9:16' && m > VERTICAL_MAX} onClick={() => setMinutes(m)}>{m} {t.min}</Chip>)}</div>
          </Row>
        </>
      )}
      {mode === 'script' && (
        <Row><span style={label}>{t.script}</span><textarea value={script} onChange={e => setScript(e.target.value)} placeholder={t.scriptPh} rows={6} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }} /></Row>
      )}
      {mode === 'voiceover' && (
        <Row>
          <span style={label}>{t.voiceFile}</span>
          <input ref={fileRef} type="file" accept="audio/*,video/*" onChange={e => pickAudio(e.target.files?.[0])} style={{ display: 'none' }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: audio ? '#fff' : 'var(--text2)' }}>
            <Upload size={14} /> {audio ? audio.name.slice(0, 32) : t.voiceFile}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{audioDur ? `${t.audioLen}: ${Math.floor(audioDur / 60)}:${String(audioDur % 60).padStart(2, '0')} — ` : ''}{t.voiceHint}</div>
        </Row>
      )}

      <Row>
        <span style={label}>{t.language}</span>
        <select value={language} onChange={e => setLanguage(e.target.value)} style={inputStyle}>
          {Object.entries(opts?.languages || { ar: 'العربية', en: 'English' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Row>

      <Row>
        <span style={label}>{t.ratio}</span>
        <div style={{ display: 'flex', gap: 6 }}><Chip active={ratio === '16:9'} onClick={() => setRatio('16:9')}>{t.wide}</Chip><Chip active={ratio === '9:16'} onClick={() => { setRatio('9:16'); setMinutes(m => Math.min(m, VERTICAL_MAX)); }}>{t.tall}</Chip></div>
      {ratio === '9:16' && <div style={{ fontSize: 11, marginTop: 6, color: vTooLong ? '#f59e0b' : 'var(--text3)', lineHeight: 1.6 }}>{vTooLong ? t.vTooLong : t.vNote}</div>}
      </Row>

      {mode !== 'voiceover' && voices.length > 0 && (
        <Row>
          <span style={label}>{t.narrator}</span>
          <select value={voiceKey} onChange={e => setVoiceKey(e.target.value)} style={inputStyle}>{voices.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}</select>
        </Row>
      )}

      {themes.length > 0 && (
        <Row>
          <span style={label}>{t.style}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {themes.map(th => (
              <button type="button" key={th.key} onClick={() => setTheme(th.key)} title={th.label}
                style={{ padding: '5px 10px', borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: lum(th.top) > 0.6 ? '#12172b' : '#fff',
                  background: `linear-gradient(135deg, ${th.top}, ${th.bottom})`, border: `2px solid ${theme === th.key ? 'var(--accent2)' : 'rgba(255,255,255,0.15)'}` }}>{th.label}</button>
            ))}
          </div>
        </Row>
      )}

      <Row>
        <span style={label}>{t.captions}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['karaoke', 'box', 'pop', 'none'].map(c => <Chip key={c} active={captions === c} onClick={() => setCaptions(c)}>{t[c]}</Chip>)}</div>
      </Row>

      <Row>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <div><span style={label}>{t.music}</span><div style={{ display: 'flex', gap: 6 }}><Chip active={music} onClick={() => setMusic(true)}>{t.on}</Chip><Chip active={!music} onClick={() => setMusic(false)}>{t.off}</Chip></div></div>
          <div><span style={label}>{t.motion}</span><div style={{ display: 'flex', gap: 6 }}><Chip active={motion} onClick={() => setMotion(true)}>{t.on}</Chip><Chip active={!motion} onClick={() => setMotion(false)}>{t.off}</Chip></div></div>
        </div>
      </Row>

      <Row mt={14}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: 'var(--text2)' }}>
          <span>{t.price}: <b style={{ color: notEnough ? '#ef4444' : '#fff' }}>{est ? (est.trial ? t.free : `${cost} ${t.credits}`) : '—'}</b></span>
          {est?.balance != null && <span>{t.balance}: {est.balance}</span>}
        </div>
        {err && <div style={{ marginTop: 8, fontSize: 12, color: '#ef4444' }}>{err}</div>}
        <button type="button" onClick={start} disabled={busy}
          style={{ marginTop: 10, width: '100%', padding: '10px 14px', borderRadius: 11, border: 'none', cursor: busy ? 'default' : 'pointer', fontWeight: 800, fontSize: 13.5, color: '#fff', fontFamily: 'inherit',
            background: 'linear-gradient(135deg,#7c6af7,#9d4edd)', opacity: busy ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
          {busy ? <Loader2 size={15} className="spin" /> : <Play size={15} />} {busy ? t.starting : t.start}
        </button>
      </Row>
    </div>
  );
}
