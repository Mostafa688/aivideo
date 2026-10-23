// ── compose.js ── تركيب إطار كامل: خلفية + كاميرا + مشهد (أو مشهدين في الانتقال) + طبقة نهائية
import { styleDecor } from './fxStyles.js';
import sharp from 'sharp';
import { makeCtx, f1, f2, clamp01, easeInOutCubic, easeOutCubic } from './design.js';
import { backdropSoftSvg, backdropCrisp, camera, finish } from './fx.js';
import { SCENES } from './scenes.js';
import { hostOverlay, HOST_TYPES } from './scenesC.js';
import { PAPER_TEXT } from './scenesPaper.js';

// الخلفية الناعمة بتترندر مرة كل 1/PLATE_FPS ثانية بدقة PLATE_K من الأصل وبتتكبّر داخل الإطار (أرخص بكتير)
export const PLATE_FPS = 15;
export const PLATE_K = 0.25;
export const plateKey = (sc, tLocal) => `${sc.index}:${Math.floor(Math.max(0, tLocal) * PLATE_FPS)}`;

/** المشاهد الظاهرة في اللحظة T (واحد، أو اتنين وقت الانتقال) */
export function visibleScenes(story, T) {
  const { scenes } = story;
  let i = scenes.findIndex(s => T >= s.start && T < s.end);
  if (i < 0) i = T < scenes[0].start ? 0 : scenes.length - 1;
  const sc = scenes[i], nxt = scenes[i + 1];
  const half = (nxt?.trDur || 0) / 2;
  if (nxt && nxt.trKind !== 'cut' && T > sc.end - half) {
    const p = clamp01((T - (sc.end - half)) / (half * 2));
    return { kind: 'transition', out: sc, inn: nxt, p, list: [{ sc, t: T - sc.start }, { sc: nxt, t: Math.max(0, T - nxt.start) }] };
  }
  return { kind: 'single', sc, list: [{ sc, t: T - sc.start }] };
}

export async function renderPlate(story, sc, tLocal) {
  const w = Math.round(story.w * PLATE_K), h = Math.round(story.h * PLATE_K);
  const c = { ...makeCtx({ w, h, palette: story.palette, lang: story.lang, id: `p${sc.index}` }) };
  const tq = Math.floor(Math.max(0, tLocal) * PLATE_FPS) / PLATE_FPS, dur = sc.end - sc.start;
  const cam = camera(c, sc.cam || 'push', tq, dur);
  const svg = backdropSoftSvg(c, tq, sc.bg || 'aurora', sc.seed || sc.index * 1.7, cam);
  const png = await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 1 }).toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** كل plate مطلوب للإطار T (مع كاش بيتشاركه كل الـworkers) */
export async function ensurePlates(story, T, cache) {
  const need = visibleScenes(story, T).list.filter(({ sc }) => sc.type !== 'world'); const out = new Map();
  await Promise.all(need.map(async ({ sc, t }) => {
    const key = plateKey(sc, t);
    let pr = cache.get(key);
    if (!pr) { pr = renderPlate(story, sc, t); cache.set(key, pr); if (cache.size > 90) for (const k of [...cache.keys()].slice(0, 45)) cache.delete(k); }
    out.set(key, await pr);
  }));
  return out;
}

/** مشهد واحد بكل طبقاته (id فريد لكل مشهد عشان تدرّجات SVG متتعارضش) */
export function sceneGroup(base, sc, tLocal, plates) {
  const c = { ...base, id: `s${sc.index}` };
  // أول مشهد: بنقدّم الحركة لحد أول كلمة (لحد 0.9 ثانية) عشان الفيديو ميبدأش بخلفية فاضية لحد ما الصوت يتكلم
  const tC = tLocal + (sc.index === 0 && base.look === 'motion' ? Math.min(0.9, Math.max(0, sc.tokens?.[0]?.start ?? 0)) : 0); // وقت المحتوى بس (الخلفية بوقتها)
  const dur = sc.end - sc.start;
  const cam = camera(c, sc.cam || 'push', tLocal, dur);
  const fn = (c.look === 'vox' && PAPER_TEXT[sc.type]) || SCENES[sc.type] || SCENES.kinetic; // Vox: مشاهد الكلام بنسختها الورقية
  let inner = fn(c, sc.data || {}, Math.max(0, tC), dur, { tokens: sc.tokens || [], mm: base.mm, index: sc.index });
  if ((c.look === 'cartoon' || c.look === 'cartoon3d') && c.cast?.host && HOST_TYPES.has(sc.type) && sc.host !== false) inner += hostOverlay(c, sc, Math.max(0, tLocal));
  const uri = plates?.get(plateKey(sc, tLocal));
  const bg = uri ? `<image href="${uri}" x="0" y="0" width="${c.w}" height="${c.h}" preserveAspectRatio="none"/>` : '';
  if (sc.type === 'world') return inner; // عالم 3D بيرسم سماه وأرضه بنفسه
  // الموشن: عناصر ديكور متحركة في أطراف الكادر (بتختلف حسب نظام التصميم) — المشهد ميبقاش فاضي حوالين المحتوى
  const decor = c.look === 'motion' ? styleDecor(c, Math.max(0, tLocal), sc.index) : '';
  return bg + backdropCrisp(c, tLocal, sc.bg || 'aurora', sc.seed || sc.index * 1.7, cam) + decor + `<g transform="${cam.tf}">${inner}</g>`;
}

export function frameSvg(story, T, plates = null) {
  const { w, h, palette, lang, mm } = story;
  const base = { ...makeCtx({ w, h, palette, lang, id: 'x' }), mm, look: story.look, cast: story.cast, images: story.images };
  const v = visibleScenes(story, T);
  const body = v.kind === 'transition' ? transition(base, v.out, v.inn, T, v.p, v.inn.trKind, plates) : sceneGroup(base, v.sc, T - v.sc.start, plates);
  return svgWrap(base, body); // الـvignette جوه الـplate
}

const svgWrap = (c, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}">${body}</svg>`;

// ── انتقالات: out = المشهد الخارج (بيكمّل وقته بعد نهايته)، in = الداخل (بيبدأ من t=0 عند الحدّ) ──
let clipSeq = 0;
function transition(base, out, inn, T, p, kind, plates) {
  const { w, h } = base; const e = easeInOutCubic(p);
  const A = sceneGroup(base, out, T - out.start, plates);
  const B = sceneGroup(base, inn, Math.max(0, T - inn.start), plates);
  const cid = `tc${++clipSeq % 1000}`;
  switch (kind) {
    case 'slide': {
      const dx = -w * e;
      return `<g transform="translate(${f1(dx)} 0)">${A}</g><g transform="translate(${f1(dx + w)} 0)">${B}</g>`;
    }
    case 'slideup': {
      const dy = -h * e;
      return `<g transform="translate(0 ${f1(dy)})">${A}</g><g transform="translate(0 ${f1(dy + h)})">${B}</g>`;
    }
    case 'zoom': {
      const sa = 1 + 0.9 * e, sb = 0.7 + 0.3 * e;
      return `<g opacity="${f2(1 - e)}" transform="translate(${w / 2} ${h / 2}) scale(${f2(sa)}) translate(${-w / 2} ${-h / 2})">${A}</g><g opacity="${f2(e)}" transform="translate(${w / 2} ${h / 2}) scale(${f2(sb)}) translate(${-w / 2} ${-h / 2})">${B}</g>`;
    }
    case 'wipe': {
      const x = w * 1.25 * e - w * 0.1;
      return `${A}<defs><clipPath id="${cid}"><polygon points="0,0 ${f1(x + h * 0.12)},0 ${f1(x - h * 0.12)},${h} 0,${h}"/></clipPath></defs><g clip-path="url(#${cid})">${B}</g><polygon points="${f1(x + h * 0.12 - 14)},0 ${f1(x + h * 0.12 + 14)},0 ${f1(x - h * 0.12 + 14)},${h} ${f1(x - h * 0.12 - 14)},${h}" fill="${base.pal.a1}" opacity="${f2(0.9 * (1 - Math.abs(e - 0.5) * 1.6))}"/>`;
    }
    case 'iris': {
      const r = Math.hypot(w, h) * 0.55 * e;
      return `${A}<defs><clipPath id="${cid}"><circle cx="${w / 2}" cy="${h / 2}" r="${f1(r)}"/></clipPath></defs><g clip-path="url(#${cid})">${B}</g><circle cx="${w / 2}" cy="${h / 2}" r="${f1(r)}" fill="none" stroke="${base.pal.a1}" stroke-width="${f1(8 * base.s)}" opacity="${f2(1 - e)}"/>`;
    }
    case 'paper': {
      // الورقة الجديدة بتتسحب فوق القديمة بحافة متقطعة وظل (زي كولاج بيتلزق ورقة فوق ورقة)
      const x = (w * 1.12) * (1 - e), jag = 22 * base.s, n = 26;
      let pts = `${f1(x)},0`;
      for (let k = 1; k <= n; k++) pts += ` ${f1(x + (Math.sin(k * 12.9898) * 43758.5453 % 1 + 1) % 1 * jag)},${f1((h * k) / n)}`;
      pts += ` ${w * 2},${h} ${w * 2},0`;
      return `${A}<defs><clipPath id="${cid}"><polygon points="${pts}"/></clipPath></defs><polygon points="${pts}" fill="#000" opacity="0.28" transform="translate(${f1(-16 * base.s)} 0)"/><g clip-path="url(#${cid})"><g transform="rotate(${f1(-2 * (1 - e))} ${f1(w / 2)} ${f1(h / 2)})">${B}</g></g>`;
    }
    case 'flash': {
      const up = p < 0.5 ? p * 2 : (1 - p) * 2;
      return `${p < 0.5 ? A : B}<rect width="${w}" height="${h}" fill="#fff" opacity="${f2(Math.min(1, up * 1.15))}"/>`;
    }
    case 'glitch': {
      const bands = 9, bh = h / bands; let o = ''; const src = p < 0.5 ? A : B;
      for (let k = 0; k < bands; k++) {
        const jit = (Math.sin(k * 12.9 + T * 40) * 0.5 + 0.5), dx = (jit - 0.5) * w * 0.12 * Math.sin(p * Math.PI);
        const use = (k + Math.floor(T * 30)) % 3 === 0 ? (p < 0.5 ? B : A) : src;
        o += `<defs><clipPath id="${cid}${k}"><rect x="0" y="${f1(k * bh)}" width="${w}" height="${f1(bh + 1)}"/></clipPath></defs><g clip-path="url(#${cid}${k})"><g transform="translate(${f1(dx)} 0)">${use}</g></g>`;
      }
      return o + `<rect width="${w}" height="${h}" fill="${base.pal.a2}" opacity="${f2(0.12 * Math.sin(p * Math.PI))}"/>`;
    }
    default:
      return p < 0.5 ? A : B;
  }
}

// مشاهد بتعرض كلام الراوي نفسه على الشاشة — الكابشن وقتها بيكرر نفس الكلمات تحت/فوق النص (شكوى حقيقية: "جعان؟ والساعة" + كابشن "والساعة")
export const WORDS_ON_SCREEN = new Set(['kinetic', 'art', 'char_say', 'char_duo', 'quote', 'poster', 'headline', 'bigword', 'title', 'outro', 'portrait']);
/** كلمات الكابشن بس في المشاهد اللي مش بتعرض الكلام (رسوم بيانية، قوايم، صور، خرايط، عالم 3D...) */
export function captionWords(tokens, scenes) {
  const hide = (scenes || []).filter(sc => WORDS_ON_SCREEN.has(sc.type)).map(sc => [sc.start, sc.end]);
  return (tokens || []).filter(t => { const mid = (t.start + t.end) / 2; return !hide.some(([a, b]) => mid >= a && mid < b); }).map(t => ({ w: t.w, start: t.start, end: t.end }));
}

