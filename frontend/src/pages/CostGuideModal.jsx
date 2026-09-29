import React, { useEffect, useRef, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

// دليل تكلفة الفيديوهات الطويلة — نافذة إجبارية (مفيش إغلاق غير بـ"تم القراءة" بعد ما العميل
// يوصل لآخرها). الأسعار كلها بالكريديت الحقيقي من السيرفر (نفس أرقام الخصم الفعلي)،
// والتوصيات اقتراح بس: مفيش حاجة بتتغير في القناة غير لو العميل ضغط "طبّق" بنفسه.

const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('token') || '') });

const TXT = {
  ar: {
    title: 'قبل ما قناتك تبدأ تعمل فيديوهات طويلة',
    intro: (label) => `قناتك «${label}» بتعمل فيديوهات طويلة. الفيديو الطويل مشاهد كتير، وكل مشهد بيتحاسب بالثانية — فالموديل اللي بيتعمل بيه الفيديو بيفرق في التكلفة جدًا. اقرا الأسعار دي قبل ما نبدأ.`,
    scrollHint: 'مرّر لآخر النافذة عشان يتفعّل زرار "تم القراءة"',
    current: 'إعداد القناة الحالي', perVideo: 'التكلفة المتوقعة للفيديو الواحد', credits: 'كريديت', yourBalance: 'رصيدك',
    scenes: 'مشهد', secEach: 'ثانية للمشهد', imgModel: 'موديل الصور', animModel: 'موديل التحريك', defaultLabel: 'الافتراضي',
    lowBalance: 'رصيدك أقل من تكلفة فيديو كامل بالإعداد الحالي — لو الفيديو كمل بدون شحن، هيقف لما الكريديت يخلص ويتسلّم ناقص (وتكمّله بعد الشحن).',
    recTitle: 'اقتراحنا لتقليل التكلفة',
    recImage: 'للصور', recAnim: 'للتحريك',
    reasonImage: 'موديل اقتصادي جودته أحسن من Grok، وبيقبل صور مرجعية (عشان ثبات الشخصيات والمكان).',
    reason_ai_audio: 'بيولّد صوت تلقائي بالذكاء الاصطناعي مع الفيديو (ده غير الفويس أوفر).',
    reason_silent: 'الفيديو بيطلع بدون صوت.',
    reason_voiceover: 'قناتك بتستخدم فويس أوفر، فمش محتاجة الصوت اللي بيتولّد مع الفيديو — التحريك بيتم بدونه والفويس أوفر بيتركّب فوقه.',
    perSec: 'كريديت/ثانية', perImage: 'كريديت/صورة',
    withRec: 'التكلفة المتوقعة بالاقتراح', saves: 'توفير',
    apply: 'طبّق الاقتراح على القناة', applying: 'جاري التطبيق...', applied: 'اتطبّق على القناة ✓',
    tablesTitle: 'أسعار كل موديل', animTable: 'موديلات التحريك (الأرخص فوق)', imgTable: 'موديلات الصور (الأرخص فوق)',
    colModel: 'الموديل', colPrice: 'السعر', colMax: 'أقصى كليب', colQuality: 'حسب الجودة', colRef: 'صور مرجعية',
    sec: 'ث', yes: 'أيوه', no: 'لأ', inUse: 'مستخدم دلوقتي',
    qualityNote: 'فيديوهات القنوات بتتعمل بالجودة الافتراضية لكل موديل (الموضحة جنبه). أسعار الجودات التانية للمعلومية.',
    ranOutTitle: 'لو الكريديت خلص وسط الفيديو',
    ranOut: [
      'الموقع بيوقف عند آخر مشهد كمل، بيركّب المشاهد اللي اتعملت (بالصوت والموسيقى) ويسلّمهولك كفيديو ناقص، ويبعتلك إيميل بيوضح كام مشهد اتعمل.',
      'لتكملة الفيديو: اشحن كريديت أو اشترك في خطة أكبر، وبعدين دوس "كمّل الفيديو" (أو قول للأجنت "كمّل") — بيكمّل من نفس المشهد بنفس الموديلات والترتيب من غير خلط.',
      'وقبل ما أي فيديو يتعمل، هتشوف التكلفة المتوقعة ورصيدك في إيميل الموافقة اليومي وفي الموقع.',
    ],
    done: 'تم القراءة', loading: 'بيجهّز الدليل...', loadError: 'مقدرتش أحمّل الدليل — جرب تاني.', retry: 'حاول تاني',
  },
  en: {
    title: 'Before your channel starts making long videos',
    intro: (label) => `Your channel "${label}" makes long videos. A long video is many scenes, and every scene is billed per second — so the model used changes the cost a lot. Read these prices before we start.`,
    scrollHint: 'Scroll to the bottom to enable the "I have read this" button',
    current: 'Current channel setup', perVideo: 'Estimated cost per video', credits: 'credits', yourBalance: 'Your balance',
    scenes: 'scenes', secEach: 'sec per scene', imgModel: 'Image model', animModel: 'Animation model', defaultLabel: 'Default',
    lowBalance: 'Your balance is below the cost of a full video with the current setup — if the video runs on without a top-up it will stop when credits run out and be delivered unfinished (you can finish it after topping up).',
    recTitle: 'Our suggestion to lower the cost',
    recImage: 'Images', recAnim: 'Animation',
    reasonImage: 'An economical model with better quality than Grok that accepts reference images (for consistent characters and places).',
    reason_ai_audio: 'Generates automatic AI audio with the video (this is separate from voiceover).',
    reason_silent: 'The video comes out without sound.',
    reason_voiceover: 'Your channel uses a voiceover, so it doesn\'t need the audio generated with the video — the clip is animated without it and the voiceover is laid on top.',
    perSec: 'credits/sec', perImage: 'credits/image',
    withRec: 'Estimated cost with the suggestion', saves: 'saves',
    apply: 'Apply the suggestion to the channel', applying: 'Applying...', applied: 'Applied to the channel ✓',
    tablesTitle: 'Price of every model', animTable: 'Animation models (cheapest first)', imgTable: 'Image models (cheapest first)',
    colModel: 'Model', colPrice: 'Price', colMax: 'Max clip', colQuality: 'By quality', colRef: 'Reference images',
    sec: 's', yes: 'Yes', no: 'No', inUse: 'in use now',
    qualityNote: 'Channel videos are made at each model\'s default quality (shown next to it). Other quality prices are for information.',
    ranOutTitle: 'If your credits run out mid-video',
    ranOut: [
      'The site stops at the last finished scene, joins the scenes that were made (with voice and music) and delivers them as an unfinished video, plus an email saying how many scenes were made.',
      'To finish it: top up credits or move to a bigger plan, then press "Continue video" (or tell the Agent "continue") — it carries on from the same scene, same models, same order, with no mixing.',
      'And before any video is made, you will see the expected cost and your balance in the daily approval email and on the site.',
    ],
    done: 'I have read this', loading: 'Preparing the guide...', loadError: 'Could not load the guide — try again.', retry: 'Try again',
  },
};

export default function CostGuideModal({ channelId, isAr, onDone }) {
  const t = TXT[isAr ? 'ar' : 'en'];
  const [guide, setGuide] = useState(null);
  const [error, setError] = useState(false);
  const [atBottom, setAtBottom] = useState(false);
  const [animChoice, setAnimChoice] = useState(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef(null);

  const load = () => {
    setError(false);
    fetch(`/api/channels/${channelId}/cost-guide`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { setGuide(d); setAnimChoice(prev => prev || d.recommendations?.animation?.[0]?.key || null); })
      .catch(() => setError(true));
  };
  useEffect(load, [channelId]);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setAtBottom(true);
  };
  useEffect(() => { if (guide) setTimeout(checkScroll, 50); }, [guide]);

  const modelLabel = (list, key, fallback) => (key ? (list.find(m => m.key === key)?.label || key) : fallback);

  const apply = async () => {
    if (!guide) return;
    setApplying(true);
    try {
      const body = {};
      if (guide.recommendations.image) body.imageModel = guide.recommendations.image.key;
      if (animChoice) body.animationModel = animChoice;
      const r = await fetch(`/api/channels/${channelId}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) });
      if (!r.ok) throw new Error('failed');
      setApplied(true);
      load();
    } catch { setError(true); }
    finally { setApplying(false); }
  };

  const ack = async () => {
    setSaving(true);
    try { await fetch(`/api/channels/${channelId}/cost-ack`, { method: 'POST', headers: authHeaders() }); } catch {}
    onDone?.();
  };

  const card = { flexShrink: 0, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14 };
  const th = { textAlign: isAr ? 'right' : 'left', fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 700, padding: '6px 8px', letterSpacing: 0.3 };
  const td = { fontSize: 12, color: '#e5e7eb', padding: '7px 8px', borderTop: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' };

  const currentAnim = guide?.channel.animationModel;
  const currentImg = guide?.channel.imageModel;
  const est = guide?.currentEstimate;
  const recImg = guide?.recommendations?.image;
  const animPrice = (k) => guide?.animationModels.find(m => m.key === k);
  const imgPrice = (k) => guide?.imageModels.find(m => m.key === k);
  // تقدير السيرفر للاقتراح المختار (نفس معادلة الخصم الفعلي)
  const recTotal = guide?.recommendations?.animation?.find(a => a.key === animChoice)?.estimateTotal ?? guide?.recommendedEstimate?.total ?? null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }} dir={isAr ? 'rtl' : 'ltr'}>
      <div style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 22px 10px' }}>
          <h3 style={{ margin: 0, fontSize: 18, color: '#fff' }}>{t.title}</h3>
        </div>

        <div ref={scrollRef} onScroll={checkScroll} style={{ overflowY: 'auto', padding: '0 22px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ ...card, color: '#fca5a5', fontSize: 13 }}>
              {t.loadError} <button onClick={load} style={{ marginInlineStart: 8, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', cursor: 'pointer' }}>{t.retry}</button>
            </div>
          )}
          {!guide && !error && <div style={{ color: '#9ca3af', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={15} className="spinning" /> {t.loading}</div>}

          {guide && (
            <>
              <p style={{ margin: 0, fontSize: 13.5, color: '#d1d5db', lineHeight: 1.8 }}>{t.intro(guide.channel.label)}</p>

              <div style={card}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 8 }}>{t.current}</div>
                <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.9 }}>
                  {t.imgModel}: <strong>{modelLabel(guide.imageModels, currentImg, `Nano Banana 2 (${t.defaultLabel})`)}</strong><br />
                  {t.animModel}: <strong>{modelLabel(guide.animationModels, currentAnim, `Seedance 2.5 (${t.defaultLabel})`)}</strong>
                </div>
                {est && (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#e5e7eb' }}>
                    {t.perVideo}: <strong style={{ color: '#fff' }}>~{est.total} {t.credits}</strong>
                    <span style={{ color: 'rgba(255,255,255,0.45)' }}> ({est.sceneCount} {t.scenes} × {est.sceneDurationSec} {t.secEach})</span>
                    <br />{t.yourBalance}: <strong style={{ color: guide.balance >= est.total ? '#22c55e' : '#f59e0b' }}>{guide.balance} {t.credits}</strong>
                  </div>
                )}
                {est && guide.balance < est.total && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, color: '#fbbf24', lineHeight: 1.7 }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 3 }} /> {t.lowBalance}
                  </div>
                )}
              </div>

              {(recImg || guide.recommendations.animation.length > 0) && (
                <div style={{ ...card, borderColor: 'rgba(124,106,247,0.4)', background: 'rgba(124,106,247,0.07)' }}>
                  <div style={{ fontSize: 13, color: '#c4b5fd', fontWeight: 700, marginBottom: 10 }}>{t.recTitle}</div>
                  {recImg && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{t.recImage}: {imgPrice(recImg.key)?.label} — {imgPrice(recImg.key)?.perImageCredits} {t.perImage}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.7 }}>{t.reasonImage}</div>
                    </div>
                  )}
                  {guide.recommendations.animation.map(a => (
                    <label key={a.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, cursor: guide.recommendations.animation.length > 1 ? 'pointer' : 'default' }}>
                      {guide.recommendations.animation.length > 1 && <input type="radio" name="anim" checked={animChoice === a.key} onChange={() => setAnimChoice(a.key)} style={{ marginTop: 4 }} />}
                      <span>
                        <span style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{t.recAnim}: {animPrice(a.key)?.label} — {animPrice(a.key)?.perSecCredits} {t.perSec}</span><br />
                        <span style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.7 }}>{t[`reason_${a.reason}`]}</span>
                      </span>
                    </label>
                  ))}
                  {recTotal != null && est && (
                    <div style={{ fontSize: 13, color: '#e5e7eb', marginBottom: 10 }}>
                      {t.withRec}: <strong style={{ color: '#fff' }}>~{recTotal} {t.credits}</strong>
                      {recTotal < est.total && <span style={{ color: '#22c55e' }}> ({t.saves} ~{est.total - recTotal})</span>}
                    </div>
                  )}
                  <button onClick={apply} disabled={applying || applied}
                    style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: applied ? 'rgba(34,197,94,0.25)' : '#7c6af7', color: '#fff', fontSize: 13, fontWeight: 700, cursor: applying || applied ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {applied ? <><CheckCircle2 size={14} /> {t.applied}</> : applying ? <><Loader2 size={14} className="spinning" /> {t.applying}</> : t.apply}
                  </button>
                </div>
              )}

              <div style={{ fontSize: 13, color: '#fff', fontWeight: 700 }}>{t.tablesTitle}</div>
              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 700, padding: '10px 10px 2px' }}>{t.animTable}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                  <thead><tr><th style={th}>{t.colModel}</th><th style={th}>{t.colPrice}</th><th style={th}>{t.colMax}</th><th style={th}>{t.colQuality}</th></tr></thead>
                  <tbody>
                    {guide.animationModels.map(m => (
                      <tr key={m.key}>
                        <td style={td}>{m.label}{(currentAnim || 'seedance_2_5') === m.key && <span style={{ color: '#a78bfa', fontSize: 10.5 }}> · {t.inUse}</span>}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.perSecCredits} {t.perSec}{m.defaultResolution ? <span style={{ color: 'rgba(255,255,255,0.4)' }}> ({m.defaultResolution})</span> : null}</td>
                        <td style={td}>{m.maxClipSec ? `${m.maxClipSec}${t.sec}` : '—'}</td>
                        <td style={{ ...td, color: '#9ca3af' }}>{m.tiers.length ? m.tiers.map(x => `${x.tier}: ${x.perSecCredits}`).join(' · ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', padding: '6px 10px 10px', lineHeight: 1.6 }}>{t.qualityNote}</div>
              </div>

              <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 700, padding: '10px 10px 2px' }}>{t.imgTable}</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                  <thead><tr><th style={th}>{t.colModel}</th><th style={th}>{t.colPrice}</th><th style={th}>{t.colRef}</th><th style={th}>{t.colQuality}</th></tr></thead>
                  <tbody>
                    {guide.imageModels.map(m => (
                      <tr key={m.key}>
                        <td style={td}>{m.label}{(currentImg || 'nano_banana_2') === m.key && <span style={{ color: '#a78bfa', fontSize: 10.5 }}> · {t.inUse}</span>}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{m.perImageCredits} {t.perImage}</td>
                        <td style={td}>{m.supportsReference ? t.yes : t.no}</td>
                        <td style={{ ...td, color: '#9ca3af' }}>{m.tiers.length ? m.tiers.map(x => `${x.tier}: ${x.perImageCredits}`).join(' · ') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ ...card, borderColor: 'rgba(245,158,11,0.35)' }}>
                <div style={{ fontSize: 13, color: '#fbbf24', fontWeight: 700, marginBottom: 8 }}>{t.ranOutTitle}</div>
                <ul style={{ margin: 0, paddingInlineStart: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {t.ranOut.map((p, i) => <li key={i} style={{ fontSize: 12.5, color: '#d1d5db', lineHeight: 1.8 }}>{p}</li>)}
                </ul>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '12px 22px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)' }}>{guide && !atBottom ? t.scrollHint : ''}</span>
          <button onClick={ack} disabled={!guide || !atBottom || saving}
            style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: guide && atBottom ? '#22c55e' : 'rgba(34,197,94,0.25)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: guide && atBottom && !saving ? 'pointer' : 'not-allowed' }}>
            {saving ? '...' : t.done}
          </button>
        </div>
      </div>
    </div>
  );
}
