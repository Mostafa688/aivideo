import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Drama, Sparkles, Flame, Plus, Trash2, Loader2, Users, X, Pencil, Check, Play, Wand2, Download, Coins, UserRound, PawPrint, Smile, Bot, ImagePlus, Clapperboard, RefreshCw, Film, AlertCircle,
} from 'lucide-react';
import { PageShell, Stat, Pill, Skeletons, Empty } from '../components/PageKit.jsx';

const authHeaders = (json) => ({ Authorization: 'Bearer ' + localStorage.getItem('token'), ...(json ? { 'Content-Type': 'application/json' } : {}) });

const T = {
  ar: {
    eyebrow: 'استوديو الشخصيات', title: 'شخصياتي', sub: 'سجّل شخصيتك أو وجهك مرة واحدة واستخدمها في أي فيديو بعد كده — ومن القوالب الرائجة بدّل الشخصية بشخصيتك وطلّع فيديو ترند.',
    tabs: { mine: 'شخصياتي', presets: 'شخصيات جاهزة', templates: 'قوالب الترند' },
    add: 'إضافة شخصية', addTitle: 'شخصية جديدة', name: 'اسم الشخصية', namePh: 'مثلًا: نورا، كابتن سام...', kind: 'النوع',
    kinds: { person: 'شخص', animal: 'حيوان', cartoon: 'كرتون', mascot: 'ماسكوت', other: 'آخر' },
    modeUpload: 'ارفع صورة', modeAi: 'اعمل شخصية بالذكاء الاصطناعي',
    aiDesc: 'وصف الشخصية', aiDescPh: 'مثلًا: شاب مصري عنده 28 سنة، شعر أسود قصير، ذقن خفيفة، ابتسامة هادية، لابس قميص أبيض', aiStyle: 'الشكل',
    styles: { realistic: 'واقعي', cartoon3d: 'كرتون 3D', anime: 'أنمي', illustration: 'رسم' }, aiCount: 'عدد الخيارات', aiCost: 'التكلفة',
    aiGenerate: 'ولّد الشخصية', aiGenerating: 'بنرسم شخصيتك… ثواني', aiPick: 'اختار الأقرب ليك', aiAgain: 'ولّد تاني', aiHint: 'اوصف الوش والشعر والسن والبشرة. متكتبش أسماء مشاهير أو أشخاص حقيقيين. لو التوليد فشل الكريديت بيرجع.', aiFail: 'فشل التوليد',
    drop: 'اسحب الصورة هنا أو اضغط للاختيار', dropTip: 'أفضل نتيجة: وجه واضح وفي الاتجاه للكاميرا، إضاءة كويسة، شخص واحد في الصورة.',
    save: 'احفظ الشخصية', saving: 'جاري الحفظ...', cancel: 'إلغاء', remove: 'حذف', rename: 'تعديل الاسم', confirmRm: 'تحذف الشخصية دي؟',
    none: 'لسه معندكش شخصيات. أضف أول شخصية أو اختار واحدة جاهزة.', appearance: 'المظهر',
    useVideo: 'استخدمها في فيديو', useTpl: 'استخدمها في قالب', fromPreset: 'احفظها عندي', saved: 'اتحفظت في شخصياتك',
    all: 'الكل', cats: { person: 'أشخاص', influencer: 'مؤثرين', cartoon: 'كرتون', animal: 'حيوانات', mascot: 'ماسكوت', other: 'أخرى', dance: 'رقص', comedy: 'كوميدي', cinematic: 'سينمائي', talking: 'كلام', product: 'منتجات', viral: 'ترند' },
    noPresets: 'مفيش شخصيات جاهزة لسه — هتتضاف قريب.', noTemplates: 'مفيش قوالب لسه — أول قوالب الترند جاية قريب.',
    featured: 'مميز', sec: 'ث', from: 'من', cr: 'كريديت', makeTpl: 'اعمل الفيديو ده بشخصيتك',
    modalTitle: 'غيّر الشخصية في القالب', step1: '1. اختار الشخصية', step2: '2. الجودة', mineH: 'شخصياتي', presetH: 'جاهزة', uploadFace: 'ارفع وجه/صورة', uploading: 'جاري الرفع...',
    pickFirst: 'اختار شخصية الأول', cost: 'التكلفة', balance: 'رصيدك', generate: 'ابدأ التوليد', generating: 'بنجهّز الفيديو… ممكن ياخد من دقيقة لعدة دقايق', done: 'الفيديو جاهز', download: 'تحميل', another: 'جرّب شخصية تانية',
    failed: 'فشل التوليد', retry: 'حاول تاني', topup: 'اشحن كريديت', lowCredits: 'رصيدك مش كفاية', how: 'الناتج: نفس حركات وكلام القالب بشخصيتك. الكريديت بيرجع تلقائي لو التوليد فشل.',
  },
  en: {
    eyebrow: 'Character Studio', title: 'My Characters', sub: 'Register your character or face once and use it in any video — and swap yourself into trending templates to make viral videos.',
    tabs: { mine: 'My characters', presets: 'Ready-made', templates: 'Trend templates' },
    add: 'Add character', addTitle: 'New character', name: 'Character name', namePh: 'e.g. Nora, Captain Sam...', kind: 'Type',
    kinds: { person: 'Person', animal: 'Animal', cartoon: 'Cartoon', mascot: 'Mascot', other: 'Other' },
    modeUpload: 'Upload a photo', modeAi: 'Create with AI',
    aiDesc: 'Describe the character', aiDescPh: 'e.g. an Egyptian man in his late twenties, short black hair, light stubble, calm smile, white shirt', aiStyle: 'Look',
    styles: { realistic: 'Realistic', cartoon3d: '3D cartoon', anime: 'Anime', illustration: 'Illustration' }, aiCount: 'Options', aiCost: 'Cost',
    aiGenerate: 'Generate character', aiGenerating: 'Drawing your character… a few seconds', aiPick: 'Pick the one you like', aiAgain: 'Generate again', aiHint: 'Describe the face, hair, age and skin. Do not name celebrities or real people. If generation fails, your credits are refunded.', aiFail: 'Generation failed',
    drop: 'Drop an image here or click to choose', dropTip: 'Best results: a clear face looking at the camera, good light, one person in the picture.',
    save: 'Save character', saving: 'Saving...', cancel: 'Cancel', remove: 'Delete', rename: 'Rename', confirmRm: 'Delete this character?',
    none: "You don't have characters yet. Add your first one or pick a ready-made character.", appearance: 'Appearance',
    useVideo: 'Use in a video', useTpl: 'Use in a template', fromPreset: 'Save to mine', saved: 'Saved to your characters',
    all: 'All', cats: { person: 'People', influencer: 'Influencers', cartoon: 'Cartoon', animal: 'Animals', mascot: 'Mascots', other: 'Other', dance: 'Dance', comedy: 'Comedy', cinematic: 'Cinematic', talking: 'Talking', product: 'Product', viral: 'Viral' },
    noPresets: 'No ready-made characters yet — coming soon.', noTemplates: 'No templates yet — the first trend templates are coming soon.',
    featured: 'Featured', sec: 's', from: 'from', cr: 'credits', makeTpl: 'Make this video with your character',
    modalTitle: 'Swap the character in this template', step1: '1. Choose the character', step2: '2. Quality', mineH: 'Mine', presetH: 'Ready-made', uploadFace: 'Upload a face/photo', uploading: 'Uploading...',
    pickFirst: 'Choose a character first', cost: 'Cost', balance: 'Your balance', generate: 'Start generating', generating: 'Preparing your video… it can take from one minute to a few minutes', done: 'Your video is ready', download: 'Download', another: 'Try another character',
    failed: 'Generation failed', retry: 'Try again', topup: 'Top up credits', lowCredits: 'Not enough credits', how: 'Result: the same movements and speech as the template, with your character. Credits are refunded automatically if generation fails.',
  },
};
const KIND_ICON = { person: UserRound, animal: PawPrint, cartoon: Smile, mascot: Bot, other: Drama };
const KINDS = ['person', 'animal', 'cartoon', 'mascot', 'other'];

export default function CharactersPage({ onBack, onNavigate, userRegion }) {
  const isAr = (userRegion || localStorage.getItem('erivion_region') || 'eg') !== 'intl';
  const lang = isAr ? 'ar' : 'en';
  const t = T[lang];
  const dir = isAr ? 'rtl' : 'ltr';

  const [tab, setTab] = useState('mine');
  const [mine, setMine] = useState([]);
  const [presets, setPresets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catP, setCatP] = useState('all');
  const [catT, setCatT] = useState('all');
  const [toast, setToast] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tplModal, setTplModal] = useState(null); // { tpl, preselect? }
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const flash = (text, type = 'ok') => { setToast({ text, type }); setTimeout(() => setToast(null), 3500); };

  const loadMine = () => fetch('/api/characters', { headers: authHeaders() }).then(r => r.json()).then(d => setMine(d.characters || [])).catch(() => {});
  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadMine(),
      fetch(`/api/character-studio/presets?language=${lang}`).then(r => r.json()).then(d => setPresets(d.presets || [])).catch(() => {}),
      fetch(`/api/character-studio/templates?language=${lang}`).then(r => r.json()).then(d => setTemplates(d.templates || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [lang]);

  const removeCharacter = async (c) => {
    if (!confirm(t.confirmRm)) return;
    await fetch(`/api/characters/${c.id}`, { method: 'DELETE', headers: authHeaders() });
    loadMine();
  };
  const saveName = async (c) => {
    const label = editName.trim();
    setEditingId(null);
    if (!label || label === c.label) return;
    await fetch(`/api/characters/${c.id}`, { method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ label }) });
    loadMine();
  };
  const savePreset = async (p) => {
    try {
      const r = await fetch(`/api/characters/from-preset/${p.id}`, { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ language: lang }) });
      if (!r.ok) throw new Error('failed');
      flash(t.saved); loadMine();
    } catch { flash(t.failed, 'err'); }
  };
  const useInVideo = (c) => {
    try { localStorage.setItem('erivion_pending_character', JSON.stringify({ id: c.id, label: c.label, imageUrl: c.image_url, description: c.description || '' })); } catch { /* storage blocked */ }
    onNavigate?.('agent');
  };

  const presetCats = useMemo(() => ['all', ...new Set(presets.map(p => p.category))], [presets]);
  const tplCats = useMemo(() => ['all', ...new Set(templates.map(x => x.category))], [templates]);
  const shownPresets = presets.filter(p => catP === 'all' || p.category === catP);
  const shownTpl = templates.filter(x => catT === 'all' || x.category === catT);

  const tabBtn = (key, Icon, count) => (
    <button key={key} className="pk-chip" aria-pressed={tab === key} onClick={() => setTab(key)} style={{ padding: '9px 18px', fontSize: 14 }}>
      <Icon size={15} /> {t.tabs[key]} {count > 0 && <small>{count}</small>}
    </button>
  );

  return (
    <PageShell dir={dir} onBack={onBack} backLabel={isAr ? 'رجوع' : 'Back'} eyebrow={t.eyebrow} Icon={Drama} accent="#ec4899" title={t.title} subtitle={t.sub} maxWidth={1180}
      aside={<><Stat value={mine.length} label={isAr ? 'شخصياتي' : 'my characters'} /><Stat value={templates.length} label={isAr ? 'قالب ترند' : 'templates'} /></>}
      toast={toast && (
        <div role="status" style={{ position: 'fixed', top: 16, insetInlineEnd: 16, zIndex: 60, padding: '11px 16px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, color: toast.type === 'err' ? '#f87171' : '#34d399', background: 'rgba(12,12,18,.96)', border: `1px solid ${toast.type === 'err' ? 'rgba(248,113,113,.5)' : 'rgba(52,211,153,.5)'}`, boxShadow: '0 12px 30px rgba(0,0,0,.45)' }}>{toast.text}</div>
      )}>
      <style>{`
        .cs-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px}
        .cs-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}
        .cs-tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:18px}
        .cs-card{overflow:hidden;position:relative;display:flex;flex-direction:column}
        .cs-img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:#15151f}
        .cs-body{padding:12px 14px 14px;display:grid;gap:8px}
        .cs-act{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 10px;border-radius:10px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;border:1px solid var(--border2);background:rgba(255,255,255,.04);color:var(--text);transition:all .15s;width:100%}
        .cs-act:hover{border-color:var(--pk-accent-line);background:var(--pk-accent-bg)}
        .cs-act.primary{background:linear-gradient(135deg,#ec4899,#be185d);border:none;color:#fff}
        .cs-act.primary:hover{filter:brightness(1.1)}
        .cs-icon-btn{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;border:1px solid var(--border2);background:rgba(10,10,14,.75);color:var(--text2);cursor:pointer;backdrop-filter:blur(6px);transition:all .15s}
        .cs-icon-btn:hover{color:#fff;border-color:var(--border3)}
        .cs-tpl{cursor:pointer}
        .cs-tpl .cover{position:relative;aspect-ratio:3/4;background:#15151f;overflow:hidden}
        .cs-tpl .cover img,.cs-tpl .cover video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transition:transform .4s}
        .cs-tpl:hover .cover img,.cs-tpl:hover .cover video{transform:scale(1.04)}
        .cs-tpl .shade{position:absolute;inset:auto 0 0 0;padding:34px 12px 10px;background:linear-gradient(transparent,rgba(0,0,0,.82));display:flex;justify-content:space-between;align-items:flex-end;gap:6px}
        .cs-modal-bg{position:fixed;inset:0;background:rgba(3,3,8,.78);backdrop-filter:blur(6px);z-index:80;display:grid;place-items:center;padding:16px;overflow-y:auto}
        .cs-modal{width:100%;max-width:880px;background:var(--bg2,#0d0d14);border:1px solid var(--border3);border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.6);display:grid;grid-template-columns:minmax(0,320px) minmax(0,1fr);overflow:hidden;max-height:92vh}
        .cs-pick{position:relative;width:78px;flex-shrink:0;cursor:pointer;border-radius:14px;overflow:hidden;border:2px solid transparent;padding:0;background:none}
        .cs-pick img{width:78px;height:98px;object-fit:cover;display:block}
        .cs-pick[aria-pressed=true]{border-color:#ec4899;box-shadow:0 0 0 3px rgba(236,72,153,.25)}
        .cs-drop{width:100%;aspect-ratio:4/3;border-radius:16px;cursor:pointer;padding:0;overflow:hidden;position:relative;display:grid;place-items:center;font:inherit;color:var(--text2);transition:all .15s}
        .cs-drop:hover,.cs-drop.over{border-color:rgba(236,72,153,.7)!important;background:rgba(236,72,153,.07)!important}
        .cs-input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1px solid var(--border2);background:rgba(255,255,255,.04);color:var(--text);font:inherit;font-size:14px;outline:none}
        .cs-input:focus{border-color:rgba(236,72,153,.7)}
        @media (max-width:760px){.cs-modal{grid-template-columns:1fr}.cs-modal video.pv{max-height:260px}}
      `}</style>

      <div className="cs-tabs">
        {tabBtn('mine', Drama, mine.length)}
        {tabBtn('presets', Sparkles, presets.length)}
        {tabBtn('templates', Flame, templates.length)}
      </div>

      {loading && <Skeletons n={2} h={220} />}

      {/* ───────── شخصياتي ───────── */}
      {!loading && tab === 'mine' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="cs-act primary" style={{ width: 'auto', padding: '10px 18px', fontSize: 14 }} onClick={() => setShowAdd(true)}><Plus size={16} /> {t.add}</button>
          </div>
          {mine.length === 0 ? (
            <Empty Icon={Users}>{t.none}</Empty>
          ) : (
            <div className="cs-grid">
              {mine.map(c => {
                const KIcon = KIND_ICON[c.kind] || Drama;
                return (
                  <figure key={c.id} className="pk-card pk-hover cs-card" style={{ margin: 0 }}>
                    <div style={{ position: 'relative' }}>
                      <img className="cs-img" src={c.image_url} alt={c.label || ''} loading="lazy" />
                      <div style={{ position: 'absolute', top: 8, insetInlineEnd: 8, display: 'flex', gap: 6 }}>
                        <button className="cs-icon-btn" title={t.rename} aria-label={t.rename} onClick={() => { setEditingId(c.id); setEditName(c.label || ''); }}><Pencil size={14} /></button>
                        <button className="cs-icon-btn" title={t.remove} aria-label={t.remove} onClick={() => removeCharacter(c)} style={{ color: '#f87171' }}><Trash2 size={14} /></button>
                      </div>
                      <div style={{ position: 'absolute', bottom: 8, insetInlineStart: 8 }}><Pill color="#f472b6"><KIcon size={12} /> {t.kinds[c.kind] || t.kinds.person}</Pill></div>
                    </div>
                    <div className="cs-body">
                      {editingId === c.id ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input className="cs-input" autoFocus value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveName(c); if (e.key === 'Escape') setEditingId(null); }} style={{ padding: '8px 10px' }} />
                          <button className="cs-icon-btn" onClick={() => saveName(c)} aria-label="ok"><Check size={14} /></button>
                        </div>
                      ) : <figcaption style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label || '—'}</figcaption>}
                      {c.description && <div title={c.description} style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</div>}
                      <button className="cs-act primary" onClick={() => useInVideo(c)}><Clapperboard size={14} /> {t.useVideo}</button>
                      <button className="cs-act" onClick={() => { setTab('templates'); flash(isAr ? 'اختار قالب وهتلاقي شخصيتك جاهزة' : 'Pick a template — your character is ready to choose'); }}><Flame size={14} /> {t.useTpl}</button>
                    </div>
                  </figure>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───────── شخصيات جاهزة ───────── */}
      {!loading && tab === 'presets' && (
        <>
          {presetCats.length > 2 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>{presetCats.map(c => <button key={c} className="pk-chip" aria-pressed={catP === c} onClick={() => setCatP(c)}>{c === 'all' ? t.all : (t.cats[c] || c)}</button>)}</div>}
          {shownPresets.length === 0 ? <Empty Icon={Sparkles}>{t.noPresets}</Empty> : (
            <div className="cs-grid">
              {shownPresets.map(p => (
                <figure key={p.id} className="pk-card pk-hover cs-card" style={{ margin: 0 }}>
                  <img className="cs-img" src={p.imageUrl} alt={p.name} loading="lazy" />
                  <div className="cs-body">
                    <figcaption style={{ fontWeight: 700, fontSize: 15 }}>{p.name}</figcaption>
                    {p.description && <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text2)' }}>{p.description}</div>}
                    <button className="cs-act primary" onClick={() => savePreset(p)}><Plus size={14} /> {t.fromPreset}</button>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </>
      )}

      {/* ───────── قوالب الترند ───────── */}
      {!loading && tab === 'templates' && (
        <>
          {tplCats.length > 2 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>{tplCats.map(c => <button key={c} className="pk-chip" aria-pressed={catT === c} onClick={() => setCatT(c)}>{c === 'all' ? t.all : (t.cats[c] || c)}</button>)}</div>}
          {shownTpl.length === 0 ? <Empty Icon={Flame}>{t.noTemplates}</Empty> : (
            <div className="cs-tgrid">
              {shownTpl.map(x => {
                const minCost = Math.min(...Object.values(x.costs || {}).filter(Boolean));
                return (
                  <article key={x.id} className="pk-card pk-hover cs-card cs-tpl" onClick={() => setTplModal({ tpl: x })}
                    onMouseEnter={e => e.currentTarget.querySelector('video')?.play().catch(() => {})} onMouseLeave={e => { const v = e.currentTarget.querySelector('video'); if (v) { v.pause(); v.currentTime = 0; } }}>
                    <div className="cover">
                      {x.coverUrl && <img src={x.coverUrl} alt="" loading="lazy" />}
                      {x.previewUrl && <video src={x.previewUrl} muted loop playsInline preload="none" />}
                      <div style={{ position: 'absolute', top: 10, insetInlineStart: 10, display: 'flex', gap: 6 }}>
                        {x.featured && <Pill color="#fbbf24"><Sparkles size={11} /> {t.featured}</Pill>}
                      </div>
                      <div className="shade">
                        <span style={{ fontSize: 12, color: '#fff', fontWeight: 700 }}>{Math.round(x.durationSec)}{t.sec}</span>
                        {Number.isFinite(minCost) && <span style={{ fontSize: 12, fontWeight: 800, color: '#fde68a', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Coins size={12} /> {t.from} {minCost}</span>}
                      </div>
                    </div>
                    <div className="cs-body">
                      <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.5 }}>{x.title}</div>
                      {x.description && <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text2)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{x.description}</div>}
                      <button className="cs-act primary"><Wand2 size={14} /> {t.makeTpl}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {showAdd && <AddCharacterModal t={t} isAr={isAr} onClose={() => setShowAdd(false)} onDone={(c) => { setShowAdd(false); flash(t.saved); loadMine(); }} />}
      {tplModal && <TemplateModal t={t} isAr={isAr} lang={lang} tpl={tplModal.tpl} mine={mine} presets={presets} onClose={() => setTplModal(null)} onCharacterAdded={loadMine} onNavigate={onNavigate} />}
    </PageShell>
  );
}

// ═════════ إضافة شخصية (رفع صورة أو توليد بالذكاء الاصطناعي) ═════════
const AI_MODEL = 'nano_banana_2';
function buildCharacterPrompt(kind, style, desc) {
  const subject = { person: 'a person', animal: 'an animal character', cartoon: 'a cartoon character', mascot: 'a brand mascot character', other: 'a character' }[kind] || 'a character';
  const look = {
    realistic: 'Photorealistic studio portrait photograph',
    cartoon3d: 'High-quality 3D animated feature-film style render (Pixar-like)',
    anime: 'Clean modern anime illustration',
    illustration: 'Polished digital illustration, soft shading',
  }[style] || 'Photorealistic studio portrait photograph';
  return `${look} of ${subject}: ${desc.trim()}. Upper body, front-facing and looking at the camera, relaxed neutral expression, the face fully visible and sharp, clean plain light-grey studio background, soft even lighting, high detail, no text, no watermark, no other people.`;
}

function AddCharacterModal({ t, isAr, onClose, onDone }) {
  const [mode, setMode] = useState('upload'); // upload | ai
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('person');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);
  // توليد بالذكاء الاصطناعي
  const [desc, setDesc] = useState('');
  const [style, setStyle] = useState('realistic');
  const [count, setCount] = useState(2);
  const [costs, setCosts] = useState({});
  const [phase, setPhase] = useState('form'); // form | working | pick
  const [options, setOptions] = useState([]);
  const [chosen, setChosen] = useState(null);
  const inputRef = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  useEffect(() => { if (!file) { setPreview(null); return; } const u = URL.createObjectURL(file); setPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  useEffect(() => {
    [1, 2, 4].forEach(n => fetch(`/api/images/credit-cost?model=${AI_MODEL}&count=${n}`, { headers: authHeaders() }).then(r => r.json()).then(d => { if (d.creditCost != null) setCosts(c => ({ ...c, [n]: d.creditCost })); }).catch(() => {}));
  }, []);
  const pick = (f) => { if (f && /^image\//.test(f.type)) { setFile(f); setErr(''); } else if (f) setErr(isAr ? 'لازم تختار صورة' : 'Please choose an image'); };

  const submitUpload = async () => {
    if (!file) return;
    setSaving(true); setErr('');
    try {
      const fd = new FormData(); fd.append('image', file); fd.append('kind', kind); if (label.trim()) fd.append('label', label.trim());
      const res = await fetch('/api/characters', { method: 'POST', headers: authHeaders(), body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      onDone(d.character);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const generate = async () => {
    if (desc.trim().length < 8) { setErr(isAr ? 'اكتب وصف أطول شوية للشخصية' : 'Please write a slightly longer description'); return; }
    setErr(''); setPhase('working'); setOptions([]); setChosen(null);
    try {
      const gres = await fetch('/api/images/generate', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ model: AI_MODEL, prompt: buildCharacterPrompt(kind, style, desc), aspectRatio: '3:4', count }) });
      const g = await gres.json();
      if (!gres.ok) throw new Error(g.message || g.error || 'Failed');
      for (let i = 0; i < 90 && alive.current; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const sd = await fetch(`/api/images/generate-status/${g.jobId}`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({}));
        if (sd.status === 'done') {
          const urls = (sd.images || []).map(x => (typeof x === 'string' ? x : x?.url)).filter(Boolean);
          if (!urls.length) throw new Error(t.aiFail);
          setOptions(urls); setChosen(urls[0]); setPhase('pick'); return;
        }
        if (sd.status === 'failed') throw new Error(sd.error || t.aiFail);
      }
      throw new Error(t.aiFail);
    } catch (e) { if (alive.current) { setErr(e.message); setPhase('form'); } }
  };

  const saveAi = async () => {
    if (!chosen) return;
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/characters/from-url', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ imageUrl: chosen, label: label.trim(), kind, description: desc.trim() }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      onDone(d.character);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const CostLine = () => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, margin: '14px 0 12px' }}>
      <span style={{ color: 'var(--text2)' }}>{t.aiCost}</span>
      <b style={{ color: '#fde68a', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Coins size={14} /> {costs[count] ?? '—'} <small style={{ fontWeight: 500, color: 'var(--text2)' }}>{t.cr}</small></b>
    </div>
  );

  return (
    <div className="cs-modal-bg" onClick={phase === 'working' ? undefined : onClose}>
      <div className="pk-card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 500, padding: 22, background: 'var(--bg2,#0d0d14)', borderRadius: 22, maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{t.addTitle}</h2>
          {phase !== 'working' && <button className="cs-icon-btn" onClick={onClose} aria-label={t.cancel}><X size={15} /></button>}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" className="pk-chip" aria-pressed={mode === 'upload'} onClick={() => { setMode('upload'); setErr(''); }} disabled={phase === 'working'}><ImagePlus size={13} /> {t.modeUpload}</button>
          <button type="button" className="pk-chip" aria-pressed={mode === 'ai'} onClick={() => { setMode('ai'); setErr(''); }} disabled={phase === 'working'}><Sparkles size={13} /> {t.modeAi}</button>
        </div>

        {mode === 'upload' && (
          <>
            <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => pick(e.target.files?.[0])} />
            <button type="button" className={`cs-drop ${over ? 'over' : ''}`} onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
              style={{ border: preview ? '1px solid rgba(236,72,153,.45)' : '1.5px dashed rgba(255,255,255,.2)', background: preview ? 'transparent' : 'rgba(255,255,255,.03)' }}>
              {preview ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                <span style={{ display: 'grid', justifyItems: 'center', gap: 8, padding: 14, textAlign: 'center', fontSize: 13 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(236,72,153,.13)' }}><ImagePlus size={22} color="#ec4899" /></span>{t.drop}
                </span>
              )}
            </button>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.7, margin: '10px 0 14px' }}>{t.dropTip}</p>
          </>
        )}

        {mode === 'ai' && phase !== 'pick' && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{t.aiDesc}</div>
            <textarea className="cs-input" rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder={t.aiDescPh} maxLength={400} disabled={phase === 'working'} style={{ resize: 'vertical', lineHeight: 1.7 }} />
            <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.7, margin: '6px 0 12px' }}>{t.aiHint}</p>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>{t.aiStyle}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(t.styles).map(k => <button key={k} type="button" className="pk-chip" aria-pressed={style === k} onClick={() => setStyle(k)} disabled={phase === 'working'}>{t.styles[k]}</button>)}
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 8px' }}>{t.aiCount}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1, 2, 4].map(n => <button key={n} type="button" className="pk-chip" aria-pressed={count === n} onClick={() => setCount(n)} disabled={phase === 'working'}>{n} <small>{costs[n] != null ? `${costs[n]} ${t.cr}` : ''}</small></button>)}
            </div>
          </>
        )}

        {mode === 'ai' && phase === 'pick' && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{t.aiPick}</div>
            <div style={{ display: 'grid', gridTemplateColumns: options.length > 1 ? '1fr 1fr' : '1fr', gap: 10 }}>
              {options.map(u => (
                <button key={u} type="button" onClick={() => setChosen(u)} aria-pressed={chosen === u} style={{ padding: 0, border: chosen === u ? '2px solid #ec4899' : '2px solid transparent', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', background: 'none', boxShadow: chosen === u ? '0 0 0 3px rgba(236,72,153,.25)' : 'none' }}>
                  <img src={u} alt="" style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          </>
        )}

        {!(mode === 'ai' && phase === 'working') && (
          <>
            <div style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 6px' }}>{t.name}</div>
            <input className="cs-input" value={label} onChange={e => setLabel(e.target.value)} placeholder={t.namePh} maxLength={60} />
            <div style={{ fontSize: 12.5, fontWeight: 700, margin: '14px 0 8px' }}>{t.kind}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {KINDS.map(k => { const KI = KIND_ICON[k]; return <button key={k} type="button" className="pk-chip" aria-pressed={kind === k} onClick={() => setKind(k)}><KI size={13} /> {t.kinds[k]}</button>; })}
            </div>
          </>
        )}

        {mode === 'ai' && phase === 'working' && (
          <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center', padding: '28px 0' }}>
            <span style={{ width: 60, height: 60, borderRadius: 18, display: 'grid', placeItems: 'center', background: 'rgba(236,72,153,.14)' }}><Loader2 size={28} color="#ec4899" className="spinning" /></span>
            <div style={{ fontWeight: 700 }}>{t.aiGenerating}</div>
          </div>
        )}

        {err && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}

        {mode === 'upload' && (
          <button className="cs-act primary" onClick={submitUpload} disabled={!file || saving} style={{ marginTop: 18, padding: 13, fontSize: 14.5, opacity: !file || saving ? 0.5 : 1, cursor: !file || saving ? 'not-allowed' : 'pointer' }}>
            {saving ? <><Loader2 size={15} className="spinning" /> {t.saving}</> : t.save}
          </button>
        )}
        {mode === 'ai' && phase === 'form' && (
          <>
            <CostLine />
            <button className="cs-act primary" onClick={generate} style={{ padding: 13, fontSize: 14.5 }}><Sparkles size={15} /> {t.aiGenerate}</button>
          </>
        )}
        {mode === 'ai' && phase === 'pick' && (
          <div style={{ display: 'grid', gap: 8, marginTop: 18 }}>
            <button className="cs-act primary" onClick={saveAi} disabled={!chosen || saving} style={{ padding: 13, fontSize: 14.5, opacity: !chosen || saving ? 0.5 : 1 }}>
              {saving ? <><Loader2 size={15} className="spinning" /> {t.saving}</> : t.save}
            </button>
            <button className="cs-act" onClick={() => { setPhase('form'); setOptions([]); }} disabled={saving}><RefreshCw size={14} /> {t.aiAgain}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═════════ تبديل الشخصية في قالب ترند ═════════
function TemplateModal({ t, isAr, lang, tpl, mine, presets, onClose, onCharacterAdded, onNavigate }) {
  const [sel, setSel] = useState(null); // { imageUrl, label }
  const [tier, setTier] = useState(tpl.tiers?.[0] || '720p');
  const [phase, setPhase] = useState('pick'); // pick | working | done | failed
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [needsTopup, setNeedsTopup] = useState(false);
  const fileRef = useRef(null);
  const timer = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; clearInterval(timer.current); }, []);
  useEffect(() => { fetch('/api/auth/credits/balance', { headers: authHeaders() }).then(r => r.json()).then(d => { if (typeof d.balance === 'number') setBalance(d.balance); }).catch(() => {}); }, []);

  const cost = tpl.costs?.[tier];
  const enough = balance == null || cost == null || balance >= cost;

  const uploadFace = async (file) => {
    if (!file || !/^image\//.test(file.type)) return;
    setUploading(true); setErr('');
    try {
      const fd = new FormData(); fd.append('image', file); fd.append('kind', 'person');
      const res = await fetch('/api/characters', { method: 'POST', headers: authHeaders(), body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setSel({ face: d.character.image_url, imageUrl: d.character.generation_url || d.character.image_url, label: d.character.label || '' });
      onCharacterAdded?.();
    } catch (e) { setErr(e.message); }
    setUploading(false);
  };

  const start = async () => {
    if (!sel) return;
    setErr(''); setNeedsTopup(false); setPhase('working'); setElapsed(0);
    clearInterval(timer.current); const t0 = Date.now(); timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    try {
      const sres = await fetch(`/api/character-studio/templates/${tpl.id}/source`, { headers: authHeaders() });
      const src = await sres.json();
      if (!sres.ok) throw new Error(src.error || 'Template unavailable');
      let genImage = sel.imageUrl;
      if (sel.presetId) { // شخصية جاهزة: صورة التوليد هي أول صورة مخفية (كل الزوايا) لو الأدمن رفعها
        const rr = await fetch(`/api/character-studio/presets/${sel.presetId}/refs`, { headers: authHeaders() }).then(r => r.json()).catch(() => ({}));
        if (rr.imageUrl) genImage = rr.imageUrl;
      }
      const gres = await fetch('/api/videos/generate', { method: 'POST', headers: authHeaders(true), body: JSON.stringify({ model: src.model, imageUrl: genImage, sourceVideoUrl: src.sourceVideoUrl, tier, prompt: '' }) });
      const g = await gres.json();
      if (!gres.ok) { if (g.error === 'quota_exceeded' || g.error === 'no_access') setNeedsTopup(true); throw new Error(g.message || g.error || 'Failed'); }
      // استعلام عن الحالة لحد ما يخلص (نفس مسار الايجنت)
      for (let i = 0; i < 240 && alive.current; i++) {
        await new Promise(r => setTimeout(r, 4000));
        const sr = await fetch(`/api/videos/generate-status/${g.jobId}`, { headers: authHeaders() });
        const sd = await sr.json().catch(() => ({}));
        if (sd.status === 'done') { clearInterval(timer.current); setResult({ url: sd.videoUrl, cost: g.creditCost }); setPhase('done'); return; }
        if (sd.status === 'failed' || sr.status === 404) throw new Error(sd.error || 'Generation failed');
      }
      throw new Error(isAr ? 'استغرق وقت طويل — شوف النتيجة في "فيديوهاتي" بعد شوية' : 'It took too long — check My Videos in a moment');
    } catch (e) { clearInterval(timer.current); if (alive.current) { setErr(e.message); setPhase('failed'); } }
  };

  // img = الوش (اللي بيظهر للعميل)، gen = صورة التوليد الفعلية (أول صورة مخفية لو الشخصية فيها صور زوايا)، presetId = شخصية جاهزة (بتتجاب مراجعها وقت التوليد)
  const Pick = ({ img, label, gen, presetId }) => (
    <button type="button" className="cs-pick" aria-pressed={sel?.face === img} onClick={() => setSel({ face: img, imageUrl: gen || img, label, presetId })} title={label}><img src={img} alt={label || ''} /></button>
  );

  return (
    <div className="cs-modal-bg" onClick={phase === 'working' ? undefined : onClose}>
      <div className="cs-modal" onClick={e => e.stopPropagation()}>
        <div style={{ background: '#000', position: 'relative', minHeight: 240 }}>
          <video className="pv" src={result?.url || tpl.previewUrl || undefined} poster={tpl.coverUrl || undefined} controls={!!result} autoPlay={!result} muted={!result} loop={!result} playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
        <div style={{ padding: 22, overflowY: 'auto', display: 'grid', gap: 14, alignContent: 'start' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: '#ec4899', fontWeight: 700, marginBottom: 4 }}>{t.modalTitle}</div>
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, lineHeight: 1.4 }}>{tpl.title}</h2>
            </div>
            {phase !== 'working' && <button className="cs-icon-btn" onClick={onClose} aria-label={t.cancel}><X size={15} /></button>}
          </div>

          {phase === 'pick' && (
            <>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t.step1}</div>
                <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6 }}>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { uploadFace(e.target.files?.[0]); e.target.value = ''; }} />
                  <button type="button" className="cs-pick" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ border: '1.5px dashed rgba(255,255,255,.25)', display: 'grid', placeItems: 'center', width: 78, height: 98, color: 'var(--text2)', fontSize: 11, textAlign: 'center', padding: 6 }}>
                    {uploading ? <Loader2 size={18} className="spinning" /> : <span style={{ display: 'grid', gap: 4, justifyItems: 'center' }}><ImagePlus size={18} />{t.uploadFace}</span>}
                  </button>
                  {mine.map(c => <Pick key={`m${c.id}`} img={c.image_url} gen={c.generation_url} label={c.label} />)}
                  {presets.map(p => <Pick key={`p${p.id}`} img={p.imageUrl} presetId={p.id} label={p.name} />)}
                </div>
                {mine.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t.mineH} · {t.presetH}</div>}
              </div>
              {tpl.tiers?.length > 1 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t.step2}</div>
                  <div style={{ display: 'flex', gap: 8 }}>{tpl.tiers.map(x => <button key={x} className="pk-chip" aria-pressed={tier === x} onClick={() => setTier(x)}>{x} <small>{tpl.costs?.[x]} {t.cr}</small></button>)}</div>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid var(--border2)' }}>
                <span style={{ fontSize: 13, color: 'var(--text2)' }}>{t.cost}</span>
                <span style={{ fontWeight: 800, fontSize: 18, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fde68a', fontVariantNumeric: 'tabular-nums' }}><Coins size={16} /> {cost ?? '—'} <small style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{t.cr}</small></span>
              </div>
              {balance != null && <div style={{ fontSize: 12.5, color: enough ? 'var(--text2)' : '#f87171' }}>{t.balance}: {balance} {t.cr}{!enough && ` — ${t.lowCredits}`}</div>}
              <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.7, margin: 0 }}>{t.how}</p>
              {err && <p role="alert" style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{err}</p>}
              {enough ? (
                <button className="cs-act primary" onClick={start} disabled={!sel} style={{ padding: 13, fontSize: 15, opacity: sel ? 1 : 0.5, cursor: sel ? 'pointer' : 'not-allowed' }}><Wand2 size={16} /> {sel ? t.generate : t.pickFirst}</button>
              ) : (
                <button className="cs-act primary" onClick={() => onNavigate?.('pricing')} style={{ padding: 13, fontSize: 15 }}><Coins size={16} /> {t.topup}</button>
              )}
            </>
          )}

          {phase === 'working' && (
            <div style={{ display: 'grid', gap: 14, justifyItems: 'center', textAlign: 'center', padding: '24px 0' }}>
              <span style={{ width: 64, height: 64, borderRadius: 20, display: 'grid', placeItems: 'center', background: 'rgba(236,72,153,.14)' }}><Loader2 size={30} color="#ec4899" className="spinning" /></span>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.generating}</div>
              <div style={{ color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</div>
            </div>
          )}

          {phase === 'done' && result && (
            <div style={{ display: 'grid', gap: 12 }}>
              <Pill color="#34d399" dot>{t.done}</Pill>
              <a className="cs-act primary" href={result.url} download target="_blank" rel="noreferrer" style={{ textDecoration: 'none', padding: 13, fontSize: 15 }}><Download size={16} /> {t.download}</a>
              <button className="cs-act" onClick={() => { setResult(null); setPhase('pick'); }}><RefreshCw size={14} /> {t.another}</button>
            </div>
          )}

          {phase === 'failed' && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, color: '#f87171', fontSize: 14, lineHeight: 1.7 }}><AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} /> <span>{t.failed}: {err}</span></div>
              {needsTopup && <button className="cs-act primary" onClick={() => onNavigate?.('pricing')}><Coins size={15} /> {t.topup}</button>}
              <button className="cs-act" onClick={() => setPhase('pick')}><RefreshCw size={14} /> {t.retry}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
