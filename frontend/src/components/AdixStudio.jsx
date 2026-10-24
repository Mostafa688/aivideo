// ── AdixStudio.jsx ── Adix: إعلان منتج بيعمله Claude Opus 5.5 — نافذة الطلب (صور المنتج + الفكرة) وكارت متابعة الطلب
// (تحليل → خطة + سعر بالتكلفة → موافقة → توليد → مراجعة → مونتاج وموشن → مراجعة نهائية → الإعلان)
import React, { useEffect, useRef, useState } from 'react';
import { Megaphone, X, ImagePlus, CheckCircle2, AlertTriangle, Download, Sparkles, Eye, Wand2, Film, Clapperboard, ShieldCheck, Camera, ChevronDown, Volume2, Type } from 'lucide-react';

const auth = () => ({ Authorization: 'Bearer ' + localStorage.getItem('token') });
const MAX_PHOTOS = 10;
const ACC = '#ff4d8d'; const ACC2 = '#ffb547';

const T = {
  ar: {
    title: 'Adix', sub: 'إعلان احترافي لمنتجك — Claude Opus 5.5 بيحلل المنتج ويختار أقوى موديل فيديو ويخرج ويونتج ويراجع',
    photos: 'صور المنتج', photosHint: 'لحد 10 صور من زوايا مختلفة — كل ما الصور أوضح، المنتج يطلع مطابق أكتر',
    idea: 'فكرة الإعلان', ideaPh: 'مثلاً: إعلان سينمائي لمشروب طاقة، العلبة بتطلع من تلج وبتنفجر بطاقة زرقا… الجمهور شباب الجيم',
    aspect: 'المقاس', length: 'المدة', auto: 'Opus يحدد', model: 'موديل الفيديو', modelAuto: 'Opus يختار الأنسب',
    brand: 'اسم البراند', price: 'السعر / العرض', cta: 'جملة الطلب', optional: 'اختياري',
    start: 'حلّل المنتج واعمل الخطة', sending: 'بيرفع الصور…',
    noteCost: 'كل خطوة بتتخصم بالتكلفة الفعلية بالظبط من غير أي هامش ربح. التحليل والخطة بتتخصم أول (كريديتات قليلة)، والتنفيذ مش بيبدأ غير لما توافق على السعر.',
    stages: { analyze: 'Opus بيشوف صور المنتج', concept: 'بيكتب الفكرة ويختار الموديل', generate: 'توليد الإعلان', review: 'Opus بيراجع الفيديو فريم فريم', inserts: 'توليد لقطات إضافية', compose: 'المونتاج والموشن جرافيك', final_review: 'مراجعة نهائية قبل ما تشوفه', fix: 'تصليح ملاحظات المراجعة', upload: 'تجهيز الإعلان', done: 'الإعلان جاهز' },
    plan: 'خطة الإعلان', product: 'المنتج', concept: 'الفكرة', hook: 'أول ثانية', modelPick: 'الموديل', why: 'ليه', shots: 'اللقطات', dialogue: 'الكلام',
    quote: 'السعر بالتكلفة', items: { video: 'توليد الفيديو', review: 'مراجعات Opus (أولى + نهائية + تصليح)', inserts: 'لقطات إضافية (حد أقصى)', render: 'مونتاج ورندر' },
    maxNote: 'ده حجز بالحد الأقصى — اللي مايتصرفش بيرجع لرصيدك تلقائي.', approve: 'وافق وابدأ', cancel: 'إلغاء', credits: 'كريديت', alt: 'بدائل', current: 'المختار',
    working: 'تقدر تقفل الصفحة وترجع — الشغل مكمل.', failed: 'الإعلان وقف — اللي ماتصرفش رجع لرصيدك.', canceled: 'اتلغى.',
    spent: 'التكلفة الفعلية', refunded: 'رجعلك', download: 'تحميل', reviewNote: 'ملاحظات Opus', breakdown: 'تفاصيل التكلفة', noCredits: 'رصيدك مش كفاية', planning: 'Opus بيحلل…', audioTitle: 'الصوت والنص (قرار Opus)', speech: { none: 'من غير كلام — سينمائي', voiceover: 'تعليق صوتي', on_screen: 'حد بيتكلم في الإعلان' }, textS: { none: 'من غير نص على الشاشة', minimal: 'كلمات قليلة جدًا', key: 'نصوص في اللحظات المهمة' }, sent: 'الطلب اتبعت لـ Opus — الإعلان تحت', decisions: 'قرارات المونتاج (Opus)', kinds: { cut: 'قص', insert: 'لقطة إضافية', punch: 'زووم', motion: 'موشن' },
  },
  en: {
    title: 'Adix', sub: 'A premium ad for your product — Claude Opus 5.5 studies the product, picks the strongest video model, directs, edits and reviews',
    photos: 'Product photos', photosHint: 'Up to 10 photos from different angles — clearer photos = a more faithful product',
    idea: 'Ad idea', ideaPh: 'e.g. a cinematic energy-drink ad: the can bursts out of ice with blue energy… audience: gym-goers',
    aspect: 'Format', length: 'Length', auto: 'Opus decides', model: 'Video model', modelAuto: 'Opus picks the best',
    brand: 'Brand name', price: 'Price / offer', cta: 'Call to action', optional: 'optional',
    start: 'Analyze & plan', sending: 'Uploading photos…',
    noteCost: 'Every step is charged at the exact provider cost — no profit margin. Analysis & plan are charged first (a few credits); production only starts after you approve the price.',
    stages: { analyze: 'Opus is studying your photos', concept: 'Writing the concept & picking the model', generate: 'Generating the ad', review: 'Opus is reviewing frame by frame', inserts: 'Generating extra shots', compose: 'Editing & motion graphics', final_review: 'Final review before you see it', fix: 'Applying review fixes', upload: 'Finishing', done: 'Your ad is ready' },
    plan: 'Ad plan', product: 'Product', concept: 'Concept', hook: 'First second', modelPick: 'Model', why: 'Why', shots: 'Shots', dialogue: 'Spoken lines',
    quote: 'Price at cost', items: { video: 'Video generation', review: 'Opus reviews (first + final + fix)', inserts: 'Extra shots (max)', render: 'Editing & render' },
    maxNote: 'This is a maximum hold — anything unused is refunded automatically.', approve: 'Approve & start', cancel: 'Cancel', credits: 'credits', alt: 'Alternatives', current: 'Selected',
    working: 'You can close this page — it keeps going.', failed: 'The ad stopped — unused credits were refunded.', canceled: 'Canceled.',
    spent: 'Actual cost', refunded: 'refunded', download: 'Download', reviewNote: "Opus's notes", breakdown: 'Cost breakdown', noCredits: 'Not enough credits', planning: 'Opus is analyzing…', audioTitle: "Sound & text (Opus's call)", speech: { none: 'No speech — pure cinema', voiceover: 'Voice-over', on_screen: 'Someone speaks on screen' }, textS: { none: 'No on-screen text', minimal: 'A word or two', key: 'Text on key moments' }, sent: 'Sent to Opus — your ad is below', decisions: "Opus's edit decisions", kinds: { cut: 'Cut', insert: 'Extra shot', punch: 'Zoom', motion: 'Motion' },
  },
};
const LANG_NAMES = { egypt: 'مصري', gulf: 'خليجي', levant: 'شامي', msa: 'فصحى', maghreb: 'مغاربي', en: 'English' };

// اختيار موديل الفيديو: الكارت المختار ظاهر، ولما تفتحه تشوف كل الموديلات بمميزاتها ومدتها وسعرها
function ModelPicker({ lang, models, value, onChange }) {
  const ar = lang === 'ar'; const [open, setOpen] = useState(false);
  const cards = [{ key: 'auto' }, ...models];
  const minCps = (m) => Math.min(...Object.values(m.creditsPerSec || { x: 0 }));
  const Card = ({ m, selected, onClick, compact }) => {
    const auto = m.key === 'auto';
    return (
      <button type="button" onClick={onClick} style={{ textAlign: 'start', display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', borderRadius: 12, cursor: 'pointer', width: '100%', boxSizing: 'border-box',
        border: `1px solid ${selected ? ACC : 'rgba(255,255,255,0.1)'}`, background: selected ? 'linear-gradient(90deg, rgba(255,77,141,0.14), rgba(255,181,71,0.06))' : 'rgba(255,255,255,0.03)', color: '#fff' }}>
        <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: auto ? `linear-gradient(135deg, ${ACC}, ${ACC2})` : 'rgba(255,255,255,0.07)' }}>
          {auto ? <Sparkles size={15} color="#1a0b12" /> : <Film size={15} color={selected ? ACC2 : 'rgba(255,255,255,0.7)'} />}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 800 }}>{auto ? (ar ? 'Opus يختار الأنسب' : 'Opus picks the best') : m.label}</span>
            {auto && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,181,71,0.16)', color: ACC2 }}>{ar ? 'مُنصح به' : 'Recommended'}</span>}
            {!auto && (m.ui?.[ar ? 'tags_ar' : 'tags_en'] || []).map((tg) => <span key={tg} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)' }}>{tg}</span>)}
          </div>
          {!compact && <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>{auto ? (ar ? 'بيحلل المنتج وفكرتك ويختار الموديل والدقة اللي تطلّع أحسن إعلان بأقل تكلفة' : 'Studies the product and your idea and picks the model and resolution that make the best ad for the lowest cost') : m.ui?.[ar ? 'ar' : 'en']}</div>}
          {!auto && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
            <span>{ar ? `لحد ${m.maxSec}ث للقطة` : `up to ${m.maxSec}s / shot`}</span>
            <span>{ar ? `من ${minCps(m)} كريديت/ث` : `from ${minCps(m)} credits/s`}</span>
            <span>{m.tiers?.join(' · ')}</span>
            {m.audio && <span style={{ color: ACC2 }}>{ar ? '♪ صوت' : '♪ audio'}</span>}
          </div>}
        </div>
        {compact && <ChevronDown size={16} style={{ alignSelf: 'center', color: 'rgba(255,255,255,0.5)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
      </button>
    );
  };
  const cur = cards.find((c) => c.key === value) || cards[0];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Card m={cur} selected compact onClick={() => setOpen((v) => !v)} />
      {open && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', alignItems: 'start', gap: 6, padding: 6, borderRadius: 14, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {cards.map((m) => <Card key={m.key} m={m} selected={m.key === value} onClick={() => { onChange(m.key); setOpen(false); }} />)}
      </div>}
    </div>
  );
}

const field = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 13.5, outline: 'none', fontFamily: 'inherit' };
const label = { fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', display: 'flex', gap: 6, alignItems: 'baseline' };
const chip = (on) => ({ padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: `1px solid ${on ? ACC : 'rgba(255,255,255,0.14)'}`, background: on ? 'rgba(255,77,141,0.16)' : 'transparent', color: on ? '#fff' : 'rgba(255,255,255,0.7)' });

// كارت الطلب جوه الشات نفسه (بدل نافذة منفصلة) — بعد الإرسال بيتقفل ويظهر كارت الإعلان تحته
export function AdixSetupCard({ lang, started, onClose, onCreated }) {
  const t = T[lang === 'ar' ? 'ar' : 'en'];
  if (started) {
    return (
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 14, border: '1px solid rgba(255,77,141,0.22)', background: 'rgba(255,77,141,0.06)' }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${ACC}, ${ACC2})` }}><Megaphone size={14} color="#1a0b12" strokeWidth={2.5} /></div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Adix</span>
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 5 }}><CheckCircle2 size={14} color="#22c55e" /> {t.sent}</span>
      </div>
    );
  }
  return <AdixModal lang={lang} onClose={onClose} onCreated={onCreated} inline />;
}

export function AdixModal({ lang, onClose, onCreated, inline = false }) {
  const t = T[lang === 'ar' ? 'ar' : 'en'];
  const [files, setFiles] = useState([]);
  const [idea, setIdea] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [length, setLength] = useState('auto');
  const [model, setModel] = useState('auto');
  const [models, setModels] = useState([]);
  const [brand, setBrand] = useState(''); const [price, setPrice] = useState(''); const [cta, setCta] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { fetch('/api/adix/models', { headers: auth() }).then((r) => r.json()).then((d) => setModels(d.models || [])).catch(() => {}); }, []);
  const previews = React.useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const addFiles = (list) => setFiles((cur) => [...cur, ...[...list].filter((f) => /^image\//.test(f.type))].slice(0, MAX_PHOTOS));

  const submit = async () => {
    if (!files.length || busy) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('photos', f));
      Object.entries({ idea, aspect, length, uiLang: lang === 'ar' ? 'ar' : 'en', model, brand, price, cta }).forEach(([k, v]) => fd.append(k, v));
      const r = await fetch('/api/adix/plan', { method: 'POST', headers: auth(), body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error === 'quota_exceeded' ? t.noCredits : (d.message || d.error || 'Error')); return; }
      window.dispatchEvent(new Event('erivion:credits'));
      onCreated?.(d.jobId);
    } catch (e) { setErr(String(e.message || e)); } finally { setBusy(false); }
  };

  // نفس المحتوى: جوه الشات (inline) أو نافذة — من غير مكوّن wrapper عشان الحقول ماتتعملش remount مع كل حرف
  const panel = (
      <div onClick={(e) => e.stopPropagation()} dir={lang === 'ar' ? 'rtl' : 'ltr'} style={inline
        ? { width: '100%', maxWidth: 620, boxSizing: 'border-box', borderRadius: 16, background: 'linear-gradient(180deg, rgba(255,77,141,0.07), rgba(255,181,71,0.02))', border: '1px solid rgba(255,77,141,0.28)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }
        : { width: 'min(620px, 100%)', maxHeight: '92vh', overflowY: 'auto', borderRadius: 18, background: 'linear-gradient(180deg,#17121f,#0e0b14)', border: '1px solid rgba(255,77,141,0.28)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${ACC}, ${ACC2})` }}><Megaphone size={21} color="#1a0b12" strokeWidth={2.4} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 19, fontWeight: 900, color: '#fff', letterSpacing: 0.3 }}>{t.title} <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(255,181,71,0.16)', color: ACC2, verticalAlign: 'middle' }}>OPUS 5.5</span></div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginTop: 2 }}>{t.sub}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={label}>{t.photos} <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>{files.length}/{MAX_PHOTOS}</span></div>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 8 }}>
            {previews.map((u, i) => (
              <div key={u} style={{ position: 'relative', aspectRatio: '1', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#000' }}>
                <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span style={{ position: 'absolute', top: 4, insetInlineStart: 4, fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: 'rgba(0,0,0,0.7)', color: '#fff' }}>#{i + 1}</span>
                <button onClick={() => setFiles((c) => c.filter((_, k) => k !== i))} style={{ position: 'absolute', top: 3, insetInlineEnd: 3, width: 20, height: 20, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,0.7)', color: '#fff', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
              </div>
            ))}
            {files.length < MAX_PHOTOS && (
              <button onClick={() => inputRef.current?.click()} style={{ aspectRatio: '1', borderRadius: 10, border: `1.5px dashed ${files.length ? 'rgba(255,255,255,0.2)' : ACC}`, background: 'rgba(255,77,141,0.05)', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, fontWeight: 700 }}>
                <ImagePlus size={20} color={ACC} /> {lang === 'ar' ? 'أضف' : 'Add'}
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>{t.photosHint}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={label}>{t.idea}</div>
          <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} maxLength={1500} placeholder={t.ideaPh} style={{ ...field, resize: 'vertical', lineHeight: 1.6 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={label}>{t.aspect}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['9:16', '16:9'].map((a) => <button key={a} onClick={() => setAspect(a)} style={chip(aspect === a)}>{a}</button>)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={label}>{t.length}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{['auto', '10', '15', '30'].map((l) => <button key={l} onClick={() => setLength(l)} style={chip(length === l)}>{l === 'auto' ? t.auto : `${l}s`}</button>)}</div>
          </div>
        </div>


        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={label}>{t.model}</div>
          <ModelPicker lang={lang} models={models} value={model} onChange={setModel} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          {[[t.brand, brand, setBrand, 40], [t.price, price, setPrice, 30], [t.cta, cta, setCta, 30]].map(([l, v, set, max]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={label}>{l} <span style={{ fontWeight: 500, color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{t.optional}</span></div>
              <input value={v} onChange={(e) => set(e.target.value)} maxLength={max} style={field} />
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, padding: '9px 11px', borderRadius: 10, background: 'rgba(255,181,71,0.07)', border: '1px solid rgba(255,181,71,0.18)' }}>{t.noteCost}</div>
        {err && <div style={{ fontSize: 12.5, color: '#ff6b6b', display: 'flex', gap: 6, alignItems: 'center' }}><AlertTriangle size={14} /> {err}</div>}
        <button onClick={submit} disabled={!files.length || busy}
          style={{ padding: '13px 16px', borderRadius: 12, border: 'none', cursor: files.length && !busy ? 'pointer' : 'not-allowed', opacity: files.length && !busy ? 1 : 0.5, background: `linear-gradient(90deg, ${ACC}, ${ACC2})`, color: '#1a0b12', fontSize: 14.5, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Sparkles size={17} /> {busy ? t.sending : t.start}
        </button>
      </div>
  );
  if (inline) return panel;
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(5,4,10,0.72)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>{panel}</div>;
}

const STAGE_ORDER = ['analyze', 'concept', 'generate', 'review', 'inserts', 'compose', 'final_review', 'upload'];
const STAGE_ICON = { analyze: Eye, concept: Wand2, generate: Film, review: Eye, inserts: Sparkles, compose: Clapperboard, final_review: ShieldCheck, fix: Wand2, upload: Download };

export function AdixCard({ job, lang, onUpdateJob }) {
  const t = T[lang === 'ar' ? 'ar' : 'en'];
  const [d, setD] = useState(null); const [pick, setPick] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [showCost, setShowCost] = useState(false);
  const status = d?.status || job?.status;
  useEffect(() => {
    if (!job?.jobId) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/adix/jobs/${job.jobId}`, { headers: auth() });
        if (r.ok) { const x = await r.json(); if (!stop) { setD(x); if (x.status !== job.status || x.videoUrl !== job.videoUrl) onUpdateJob?.({ status: x.status, videoUrl: x.videoUrl, thumbnailUrl: x.thumbnailUrl, aspectRatio: x.plan?.aspect || x.input?.aspect }); } }
      } catch { /* retry */ }
    };
    tick();
    const live = !['done', 'failed', 'canceled'].includes(status);
    const h = live ? setInterval(tick, status === 'awaiting' ? 15000 : 5000) : null;
    return () => { stop = true; if (h) clearInterval(h); };
  }, [job?.jobId, status]);

  const act = async (path, body) => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/adix/jobs/${job.jobId}/${path}`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error === 'quota_exceeded' ? `${t.noCredits} (${x.cost} ${t.credits})` : (x.error || 'Error')); return; }
      window.dispatchEvent(new Event('erivion:credits'));
      setD((cur) => ({ ...(cur || {}), status: path === 'cancel' ? 'canceled' : 'running', stage: path === 'cancel' ? 'canceled' : 'generate', progress: 3 }));
    } finally { setBusy(false); }
  };

  const box = { display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 16, background: 'linear-gradient(180deg, rgba(255,77,141,0.08), rgba(255,181,71,0.03))', border: '1px solid rgba(255,77,141,0.26)', width: '100%', boxSizing: 'border-box' };
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `linear-gradient(135deg, ${ACC}, ${ACC2})` }}><Megaphone size={14} color="#1a0b12" strokeWidth={2.5} /></div>
      <div style={{ fontSize: 13.5, fontWeight: 900, color: '#fff' }}>Adix</div>
      {d?.plan?.concept?.title && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {d.plan.concept.title}</div>}
    </div>
  );
  if (!d) return <div style={box}>{head}<div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{t.planning}</div></div>;

  if (d.status === 'awaiting' && d.plan) {
    const p = d.plan; const sel = pick || { model: p.model, tier: p.tier, label: p.modelLabel };
    const changed = sel.model !== p.model || sel.tier !== p.tier;
    const total = (p.quoteBreakdown || []).reduce((a, x) => a + x.credits, 0);
    return (
      <div style={box} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {head}
        <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, alignItems: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>{(d.input?.photos || []).slice(0, 4).map((u) => <img key={u} src={u} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 5 }} />)}</div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.65 }}>
            <b style={{ color: '#fff' }}>{p.product?.name}</b>{p.product?.category ? ` — ${p.product.category}` : ''}
            {p.product?.benefits?.length ? <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11.5 }}>{p.product.benefits.join(' · ')}</div> : null}
          </div>
        </div>
        <Section title={t.concept}>{p.concept?.story}{p.concept?.hook && <div style={{ marginTop: 4 }}><b style={{ color: ACC2 }}>{t.hook}:</b> {p.concept.hook}</div>}</Section>
        <Section title={`${t.shots} · ${p.seconds}s`}>
          <ol style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>{(p.shots || []).map((s, i) => {
            const c = s.camera || {}; const cam = [c.move, c.lens, c.angle].filter(Boolean).join(' · ');
            return (
              <li key={i}>{s.summary || '—'} <span style={{ color: 'rgba(255,255,255,0.4)' }}>({s.seconds}s)</span>
                {cam && <div dir="ltr" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, display: 'flex', gap: 5, alignItems: 'flex-start' }}><Camera size={12} style={{ flexShrink: 0, marginTop: 2, color: ACC2 }} /><span>{cam}{c.start_framing && c.end_framing ? ` — ${c.start_framing} → ${c.end_framing}` : ''}</span></div>}
              </li>
            );
          })}</ol>
        </Section>
        {p.audio && <Section title={t.audioTitle}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={chip(true)}><Volume2 size={12} style={{ verticalAlign: -2 }} /> {t.speech[p.audio.speech] || p.audio.speech}</span>
            <span style={chip(true)}><Type size={12} style={{ verticalAlign: -2 }} /> {t.textS[p.audio.text] || p.audio.text}</span>
            {(p.audio.speech !== 'none' || p.audio.text !== 'none') && <span style={chip(false)}>{LANG_NAMES[p.audio.lang] || p.audio.lang}</span>}
          </div>
          {p.audio.why && <div style={{ color: 'rgba(255,255,255,0.65)' }}>{p.audio.why}</div>}
        </Section>}
        {p.dialogue && <Section title={t.dialogue}><span style={{ fontStyle: 'italic' }}>"{p.dialogue}"</span></Section>}
        <Section title={t.modelPick}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            {[{ model: p.model, tier: p.tier, label: p.modelLabel, why: p.reason, main: true }, ...(p.alternatives || [])].map((a) => {
              const on = sel.model === a.model && sel.tier === a.tier;
              return <button key={`${a.model}_${a.tier}`} onClick={() => setPick(a)} style={chip(on)}>{a.label} · {a.tier}{a.main ? ` ★` : ''}</button>;
            })}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)' }}>{(sel.model === p.model ? p.reason : (p.alternatives || []).find((x) => x.model === sel.model)?.why) || ''}</div>
        </Section>
        <Section title={t.quote}>
          {changed ? <div style={{ color: 'rgba(255,255,255,0.6)' }}>{lang === 'ar' ? 'السعر هيتحسب على الموديل ده لما توافق.' : 'The price is recalculated for this model when you approve.'}</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {(p.quoteBreakdown || []).map((x) => <div key={x.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{t.items[x.key] || x.key}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{x.credits}</span></div>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4, marginTop: 2, fontWeight: 900, color: '#fff' }}><span>{lang === 'ar' ? 'الإجمالي (حد أقصى)' : 'Total (max)'}</span><span>{total} {t.credits}</span></div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{t.maxNote}</div>
            </div>
          )}
        </Section>
        {err && <div style={{ fontSize: 12, color: '#ff6b6b' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy} onClick={() => act('approve', changed ? { model: sel.model, tier: sel.tier } : {})} style={{ flex: 1, padding: '11px 14px', borderRadius: 11, border: 'none', cursor: busy ? 'wait' : 'pointer', background: `linear-gradient(90deg, ${ACC}, ${ACC2})`, color: '#1a0b12', fontWeight: 900, fontSize: 13.5 }}>{t.approve}</button>
          <button disabled={busy} onClick={() => act('cancel')} style={{ padding: '11px 14px', borderRadius: 11, border: '1px solid rgba(255,255,255,0.14)', background: 'transparent', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>{t.cancel}</button>
        </div>
      </div>
    );
  }

  if (d.status === 'done' && d.videoUrl) {
    const refund = Math.max(0, (d.reserved || 0) + (d.ledger?.find((x) => x.step === 'plan')?.credits || 0) - (d.spent || 0));
    return (
      <div style={box} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        {head}
        <video src={d.videoUrl} controls playsInline poster={d.thumbnailUrl || undefined} style={{ width: '100%', maxHeight: 560, aspectRatio: (d.plan?.aspect || '9:16').replace(':', ' / '), borderRadius: 12, background: '#000', objectFit: 'contain' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#22c55e', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={14} /> {t.stages.done}</span>
          <button onClick={() => setShowCost((v) => !v)} style={{ background: 'none', border: 'none', padding: 0, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline dotted' }}>{t.spent}: {d.spent} {t.credits}{refund > 0 ? ` · ${t.refunded} ${refund}` : ''}</button>
          <a href={d.videoUrl} download style={{ marginInlineStart: 'auto', color: ACC2, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}><Download size={14} /> {t.download}</a>
        </div>
        {showCost && <Section title={t.breakdown}>{(d.ledger || []).map((x, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{x.step.replace(/_/g, ' ')}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>${x.usd.toFixed(3)}</span></div>)}</Section>}
        {(d.finalNote || d.review) && <Section title={t.reviewNote}>{d.finalNote || d.review}</Section>}
        {d.decisions?.length > 0 && <Section title={t.decisions}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{d.decisions.map((x, i) => <div key={i} style={{ display: 'flex', gap: 8 }}><span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: ACC2, fontWeight: 800, minWidth: 38 }}>{x.at}s</span><span><b style={{ color: '#fff' }}>{t.kinds[x.kind] || x.kind}</b> — {x.why}</span></div>)}</div>
        </Section>}
      </div>
    );
  }

  if (d.status === 'failed' || d.status === 'canceled') {
    return <div style={box}>{head}<div style={{ fontSize: 12.5, color: d.status === 'failed' ? '#ff6b6b' : 'rgba(255,255,255,0.55)', display: 'flex', gap: 6, alignItems: 'center' }}>{d.status === 'failed' && <AlertTriangle size={14} />}{d.status === 'failed' ? t.failed : t.canceled}</div></div>;
  }

  // شغال: مراحل
  const cur = d.stage === 'fix' ? 'final_review' : d.stage;
  const idx = Math.max(0, STAGE_ORDER.indexOf(cur));
  const pct = Math.max(3, Math.min(100, d.progress || 0));
  return (
    <div style={box} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {head}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {STAGE_ORDER.filter((s) => d.status === 'planning' ? ['analyze', 'concept'].includes(s) : !['analyze', 'concept'].includes(s)).map((s) => {
          const i = STAGE_ORDER.indexOf(s); const doneS = i < idx; const now = i === idx; const Ico = STAGE_ICON[s] || Sparkles;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: now ? '#fff' : doneS ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)', fontWeight: now ? 800 : 600 }}>
              {doneS ? <CheckCircle2 size={14} color="#22c55e" /> : <Ico size={14} color={now ? ACC : 'currentColor'} className={now ? 'spinning-soft' : undefined} />}
              {now && d.stage === 'fix' ? t.stages.fix : t.stages[s]}
            </div>
          );
        })}
      </div>
      <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}><div style={{ width: `${d.status === 'planning' ? Math.min(90, pct) : pct}%`, height: '100%', background: `linear-gradient(90deg, ${ACC}, ${ACC2})`, transition: 'width .6s ease' }} /></div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{t.working}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 11px', borderRadius: 11, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>{title}</div>
      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.82)', lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}
