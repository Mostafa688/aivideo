// ── scenesEd.js ── مشهد "بوستر تحريري" (editorial poster) زي فيديوهات الشورتس الحديثة:
// سطر صغير (kicker) + كلمة بطل ضخمة بخط مجلات (سيريف/مضغوط/مايل مدوّر) بتظهر حرف حرف بـblur حركة، شريط لون بكلمة تانية،
// صدى رمادي للكلمة، ورقة ممزّقة، خط رسم بياني بيترسم، شكل 3D (بازل/لمعة/مثلث...) أو صورة حقيقية متقصوصة بظل.
// كل كلمة على الشاشة متزامنة مع وقت نطقها في الصوت.
import { f1, f2, clamp01, easeOutCubic, easeInOutCubic, seg, rand, uid, esc } from './design.js';
import { paperCard, MONO } from './paper.js';
import { glyphs, measure, canPath, fitSize, line } from './typeset.js';
import { object3d } from './objects3d.js';

export const POSTER_LAYOUTS = ['stack', 'blur', 'round', 'echo'];
const INKC = '#141414';
const ACCENTS = { indigo: '#3b2a98', red: '#b3303a', blue: '#2b2fd6', purple: '#7b2ff7', green: '#1f8a5b' };
const LAYOUT_FONT = { stack: 'serif', blur: 'condensed', round: 'round', echo: 'serif' };
const LAYOUT_KICK = { stack: 'sans', blur: 'serifItalic', round: 'sansItalic', echo: 'serifItalic' };
const LAYOUT_ACCENT = { stack: 'indigo', blur: 'purple', round: 'red', echo: 'indigo' };

const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]/gu, '');
/** وقت نطق أول كلمة من العبارة (أو fb) */
export function phraseTime(tokens, phrase, fb) {
  const first = norm(String(phrase || '').split(/\s+/)[0]); if (!first) return fb;
  const hit = (tokens || []).find(x => { const a = norm(x.w); return a === first || (a.length >= 4 && first.length >= 4 && (a.startsWith(first.slice(0, 4)) || first.startsWith(a.slice(0, 4)))); });
  return hit ? hit.start : fb;
}

// ── الخلفية: ورق كريمي بمربعات أو أبيض بشبكة + خط قطري باهت + علامات صغيرة في الأركان ──
function ground(c, variant, seed, label) {
  const { w, h, s } = c; const X = -w * 0.08, Y = -h * 0.08, W = w * 1.16, H = h * 1.16;
  const cream = variant !== 'white', gap = (cream ? 92 : 104) * s;
  let d = '';
  for (let x = gap * 0.5; x < w; x += gap) d += `M${f1(x)} ${f1(Y)}V${f1(Y + H)}`;
  for (let y = gap * 0.5; y < h; y += gap) d += `M${f1(X)} ${f1(y)}H${f1(X + W)}`;
  let o = `<rect x="${f1(X)}" y="${f1(Y)}" width="${f1(W)}" height="${f1(H)}" fill="${cream ? '#f1ede3' : '#fbfbfa'}"/>`
    + `<path d="${d}" stroke="${cream ? '#b9b2a1' : '#c9cbd2'}" stroke-width="${f1(1.4 * s)}" opacity="${cream ? 0.45 : 0.55}" fill="none"/>`
    + `<path d="M${f1(w * 0.05)} ${f1(h * 0.97)}L${f1(w * 1.02)} ${f1(h * 0.12)}" stroke="#8c8577" stroke-width="${f1(2 * s)}" opacity="0.18"/>`;
  const fs = 20 * s, m = w * 0.075;
  o += `<g font-family="${MONO}" font-size="${f1(fs)}" fill="#5d574b" opacity="0.75" letter-spacing="${f1(fs * 0.08)}">`
    + `<text x="${f1(m)}" y="${f1(h * 0.055)}">${esc(label.left)}</text><text x="${f1(w - m)}" y="${f1(h * 0.055)}" text-anchor="end">${esc(label.right)}</text>`
    + `<text x="${f1(w - m * 0.9)}" y="${f1(h * 0.17)}" text-anchor="end">${String(2 + (seed % 7)).padStart(2, '0')}</text><text x="${f1(m)}" y="${f1(h * 0.965)}">${String(seed % 9).padStart(2, '0')}</text></g>`;
  return o;
}

/** حروف بتظهر واحد ورا التاني بـblur حركة أفقي (بنجمّع الحروف في 4 مستويات blur عشان الفلاتر تبقى قليلة) */
function blurLetters(c, key, text, x0, y, size, t, at, { fill = INKC, stagger = 0.05, dur = 0.42, track = 0, dir = 1, id = 'bl' } = {}) {
  const gs = glyphs(key, text, x0, y, size, { track });
  const levels = [[], [], [], []]; let sharp = '';
  gs.forEach((g, i) => {
    const p = easeOutCubic(seg(t, at + i * stagger, at + i * stagger + dur));
    if (p <= 0) return;
    const dx = (1 - p) * size * 0.35 * dir;
    const lv = p > 0.92 ? -1 : p > 0.66 ? 0 : p > 0.4 ? 1 : p > 0.18 ? 2 : 3;
    const path = `<path d="${g.d}" transform="translate(${f1(dx)} 0)" opacity="${f2(Math.min(1, p * 1.6))}"/>`;
    if (lv < 0) sharp += path; else levels[lv].push(path);
  });
  const sd = [3, 7, 12, 18].map(v => v * c.s);
  let o = `<g fill="${fill}">${sharp}</g>`;
  levels.forEach((arr, k) => { if (!arr.length) return; const fid = uid(c, `${id}${k}`); o += `<defs><filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f1(sd[k])} ${f1(sd[k] * 0.12)}"/></filter></defs><g fill="${fill}" filter="url(#${fid})">${arr.join('')}</g>`; });
  return o;
}

/** كلمة/سطر عربي (أو أي نص مش في الخط) بيدخل كله بـblur */
function blurBlock(c, key, text, cx, y, size, t, at, { fill = INKC, widths = null, id = 'bb', anchor = 'middle' } = {}) {
  const p = easeOutCubic(seg(t, at, at + 0.45)); if (p <= 0) return '';
  const k = p > 0.9 ? -1 : p > 0.6 ? 0 : p > 0.3 ? 1 : 2, sd = [4, 9, 16][Math.max(0, k)] * c.s;
  const body = line(c, key, text, cx + (1 - p) * size * 0.3 * (c.rtl ? -1 : 1), y, size, { anchor, fill, opacity: Math.min(1, p * 1.5), widths });
  if (k < 0) return body;
  const fid = uid(c, id);
  return `<defs><filter id="${fid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f1(sd)} ${f1(sd * 0.15)}"/></filter></defs><g filter="url(#${fid})">${body}</g>`;
}

/** نص بطل: لاتيني حرف حرف، عربي كتلة واحدة. align: start|middle|end */
function hero(c, key, text, x, y, size, t, at, o = {}) {
  const align = o.align || 'middle', widths = o.widths;
  if (!canPath(key, text)) {
    const ax = align === 'start' ? x + measure(key, text, size, { widths }) / 2 : align === 'end' ? x - measure(key, text, size, { widths }) / 2 : x;
    return blurBlock(c, key, text, ax, y, size, t, at, { ...o, anchor: 'middle' });
  }
  const wd = measure(key, text, size, { track: o.track || 0 });
  const x0 = align === 'middle' ? x - wd / 2 : align === 'end' ? x - wd : x;
  return blurLetters(c, key, text, x0, y, size, t, at, o);
}

/** خط رسم بياني متعرّج بيترسم (ديكور) */
function chartLine(c, x, y, w, h, p, seed, accent) {
  if (p <= 0) return '';
  const n = 22; const pts = [];
  for (let i = 0; i <= n; i++) pts.push([x + (w * i) / n, y + h * (0.45 + (rand(i, seed) - 0.5) * 0.9 + Math.sin(i * 0.7) * 0.12)]);
  const cut = Math.max(1, Math.round(n * p));
  const dPath = (a, b) => 'M' + pts.slice(a, b + 1).map(q => `${f1(q[0])} ${f1(q[1])}`).join('L');
  const mid = Math.round(n * 0.62);
  return `<path d="${dPath(0, Math.min(cut, mid))}" fill="none" stroke="#2a2a2a" stroke-width="${f1(3 * c.s)}" stroke-linejoin="round" opacity="0.8"/>`
    + (cut > mid ? `<path d="${dPath(mid, cut)}" fill="none" stroke="${accent}" stroke-width="${f1(6 * c.s)}" stroke-linejoin="round"/>` : '');
}

/** صورة متقصوصة (من غير خلفية) بظل ناعم */
export function cutoutImg(c, img, cx, cy, maxW, maxH, t, at, seed) {
  if (!img?.uriCut) return '';
  const p = easeOutCubic(seg(t, at, at + 0.6)); if (p <= 0) return '';
  const ar = img.cw / img.ch; let iw = maxW, ih = maxW / ar; if (ih > maxH) { ih = maxH; iw = maxH * ar; }
  const drift = Math.sin(t * 0.6 + seed) * 6 * c.s, sc = 0.9 + 0.1 * p, y = cy + (1 - p) * 160 * c.s + drift;
  const fid = uid(c, `cs${seed}`);
  return `<g opacity="${f2(Math.min(1, p * 1.4))}" transform="translate(${f1(cx)} ${f1(y)}) scale(${f2(sc)})">`
    + `<defs><filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f1(22 * c.s)}"/></filter></defs>`
    + `<ellipse cx="${f1(iw * 0.04)}" cy="${f1(ih / 2 - ih * 0.02)}" rx="${f1(iw * 0.42)}" ry="${f1(ih * 0.05 + 10 * c.s)}" fill="#000" opacity="0.28" filter="url(#${fid})"/>`
    + `<image href="${img.uriCut}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" preserveAspectRatio="xMidYMid meet"/>`
    + '</g>';
}

/** بديل لما الخلفية متتشالش: الصورة في كارت بزوايا مدوّرة وظل */
export function framedImg(c, img, cx, cy, maxW, maxH, t, at, seed) {
  const p = easeOutCubic(seg(t, at, at + 0.55)); if (p <= 0) return '';
  const ar = img.w / img.h; let iw = maxW, ih = maxW / ar; if (ih > maxH) { ih = maxH; iw = maxH * ar; }
  const r = 26 * c.s, cid = uid(c, `fr${seed}`), y = cy + (1 - p) * 140 * c.s, rot = (seed % 2 ? 2.5 : -2.5) * p;
  return `<g opacity="${f2(Math.min(1, p * 1.4))}" transform="translate(${f1(cx)} ${f1(y)}) rotate(${f1(rot)})">`
    + `<rect x="${f1(-iw / 2 + 12 * c.s)}" y="${f1(-ih / 2 + 22 * c.s)}" width="${f1(iw)}" height="${f1(ih)}" rx="${f1(r)}" fill="#000" opacity="0.18"/>`
    + `<defs><clipPath id="${cid}"><rect x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" rx="${f1(r)}"/></clipPath></defs>`
    + `<image href="${img.uri}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${cid})"/>`
    + '</g>';
}

const up = (c, key, s) => (canPath(key, s) ? String(s).toUpperCase() : s);

/**
 * poster: { kicker?, hero, bar?, tail?, layout?, accent?, object?, img?, chart? }
 */
export function poster(c, d, t, dur, sc) {
  const { w, h, s, portrait, rtl } = c; let o = '';
  const idx = sc?.index || 0, seed = idx * 7 + 3;
  const layout = POSTER_LAYOUTS.includes(d.layout) ? d.layout : POSTER_LAYOUTS[idx % POSTER_LAYOUTS.length];
  const accent = ACCENTS[d.accent] || ACCENTS[LAYOUT_ACCENT[layout]];
  const widths = d._w || null, tokens = sc?.tokens || [];
  const img = d.img && c.images ? c.images[d.img] : null;
  const hasVisual = !!(img || (d.object && (layout !== 'stack' || !portrait)));
  const fKey = LAYOUT_FONT[layout], kKey = LAYOUT_KICK[layout];
  const heroTxt = layout === 'stack' || layout === 'echo' ? up(c, fKey, d.hero) : d.hero;
  const tK = phraseTime(tokens, d.kicker, 0.05), tH = Math.max(tK + 0.25, phraseTime(tokens, d.hero, Math.min(0.6, dur * 0.2)));
  const tB = d.bar ? Math.max(tH + 0.35, phraseTime(tokens, d.bar, tH + 0.6)) : 0, tT = d.tail ? Math.max(tH + 0.3, phraseTime(tokens, d.tail, tH + 0.7)) : 0;
  o += ground(c, layout === 'blur' || layout === 'round' ? 'white' : 'cream', seed, { left: `${String(idx + 1).padStart(2, '0')}${canPath('sans', d.hero) ? ` // ${String(d.hero).toUpperCase().slice(0, 18)}` : ''}`, right: d.kicker && canPath('sans', d.kicker) ? String(d.kicker).toUpperCase().slice(0, 26) : '' });

  // منطقة الكلام والمنطقة البصرية
  const colW = portrait ? w * 0.84 : (hasVisual ? w * 0.5 : w * 0.8);
  const cx = portrait ? w / 2 : (hasVisual ? (rtl ? w * 0.68 : w * 0.32) : w / 2);
  const left = layout === 'stack' && !rtl; // الستاك بيتصف شمال (عربي يمين)
  const ax = left ? cx - colW / 2 : layout === 'stack' && rtl ? cx + colW / 2 : cx, align = left ? 'start' : layout === 'stack' && rtl ? 'end' : 'middle';
  const top = portrait ? h * (hasVisual || layout === 'stack' ? 0.17 : 0.3) : h * (hasVisual ? 0.24 : 0.26);
  const hMax = layout === 'round' ? 230 : layout === 'blur' ? 260 : 300;
  const heroTxt0 = layout === 'stack' || layout === 'echo' ? up(c, LAYOUT_FONT[layout], d.hero) : d.hero;
  const hs = fitSize(fKey, heroTxt0, colW, { max: hMax * s * (portrait ? 1 : 0.9), min: 50 * s, widths });
  const heroW = measure(fKey, heroTxt0, hs, { widths });

  let y = top;
  // kicker
  if (d.kicker) {
    const track = kKey === 'sans' ? 0.32 : 0;
    const kText = kKey === 'sans' ? up(c, kKey, d.kicker) : d.kicker;
    const ks = rtl ? Math.min(78 * s, fitSize(kKey, kText, colW, { max: 200, widths })) : kKey === 'sans' ? Math.min(70 * s, fitSize(kKey, kText, Math.max(heroW, colW * 0.5), { max: 200, track, widths })) : Math.min((portrait ? 58 : 54) * s, fitSize(kKey, kText, colW, { max: 200, track, widths }));
    const ko = easeOutCubic(seg(t, tK - 0.05, tK + 0.35));
    if (ko > 0) o += `<g opacity="${f2(ko)}" transform="translate(0 ${f1((1 - ko) * 18 * s)})">` + line(c, kKey, kText, ax, y + ks, ks, { anchor: align, fill: '#1c1c1c', track, widths }) + '</g>';
    y += ks * 1.45;
  }
  // البطل
  const heroCol = layout === 'round' ? accent : INKC;
  const hy = y + hs * (layout === 'blur' ? 0.95 : 0.82);
  if (layout === 'echo') { // صدى رمادي فوق وتحت الكلمة
    const ep = easeOutCubic(seg(t, tH - 0.1, tH + 0.5));
    if (ep > 0) {
      o += `<g opacity="${f2(0.32 * ep)}">` + line(c, fKey, d.hero, ax + (1 - ep) * -40 * s, hy - hs * 0.78, hs * 0.92, { anchor: align, fill: '#7b7b80', widths }) + '</g>';
      o += `<g opacity="${f2(0.3 * ep)}">` + line(c, 'serifItalic', d.bar || d.hero, ax + (1 - ep) * 40 * s, hy + hs * (d.bar ? 1.75 : 0.95), hs * 0.92, { anchor: align, fill: '#7b7b80', widths }) + '</g>';
    }
  }
  const scale = layout === 'round' ? 1 + 0.25 * (1 - easeOutCubic(seg(t, tH, tH + 0.5))) : 1;
  o += `<g transform="translate(${f1(ax)} ${f1(hy)}) scale(${f2(scale)}) translate(${f1(-ax)} ${f1(-hy)})">` + hero(c, fKey, heroTxt, ax, hy, hs, t, tH, { fill: heroCol, align, widths, id: 'h', dir: rtl ? -1 : 1, stagger: layout === 'blur' ? 0.07 : 0.045 }) + '</g>';
  y = hy + hs * 0.25;

  // شريط لون بكلمة (ومعاه ورقة ممزقة في ستايل stack)
  if (d.bar) {
    const bp = easeOutCubic(seg(t, tB - 0.05, tB + 0.35));
    const bKey = layout === 'echo' ? 'serif' : 'clean';
    const bText = up(c, bKey, d.bar);
    const bs = Math.min(hs * (layout === 'echo' ? 0.82 : 0.7), fitSize(bKey, bText, colW * 0.86, { max: 260 * s, widths }));
    const bw = measure(bKey, bText, bs, { widths }) + bs * 0.5, bh = bs * 1.18;
    const bx = align === 'start' ? ax : align === 'end' ? ax - bw : ax - bw / 2, by = y + bs * 0.25;
    if (layout === 'stack' && bp > 0) o += `<g transform="translate(0 ${f1((1 - bp) * 60 * s)})" opacity="${f2(bp)}">` + paperCard(c, { x: -w * 0.05, y: by - bh * 0.45, w: w * 1.1, h: bh * 1.9, seed, fill: '#ecebe6', jag: 12, shadow: 0.18 }) + '</g>';
    if (layout === 'stack' && portrait && d.object && bp > 0) o += object3d(c, d.object, cx, by + bh * 0.5 + Math.min(colW * 0.8, 520 * s) * 0.2, Math.min(colW * 0.8, 520 * s), { t, at: tB - 0.1, color: '#d8d5cd', rot: 0, depth: 0.12, float: false });
    if (bp > 0) {
      const cid = uid(c, 'barclip');
      o += `<defs><clipPath id="${cid}"><rect x="${f1(rtl ? bx + bw * (1 - bp) : bx)}" y="${f1(by)}" width="${f1(bw * bp)}" height="${f1(bh)}"/></clipPath></defs>`
        + `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(bh)}" fill="${accent}" clip-path="url(#${cid})"/>`
        + `<g clip-path="url(#${cid})">` + line(c, bKey, bText, bx + bw / 2, by + bh * 0.8, bs, { anchor: 'middle', fill: '#ffffff', widths }) + '</g>';
    }
    y = by + bh + bs * 0.3;
  }
  // ذيل: كلمات بعد البطل بتدخل blur تحت بعض
  if (d.tail) {
    const tKey = layout === 'round' ? 'round' : layout === 'blur' ? 'condensed' : 'serifItalic';
    const ts = Math.min(hs * 0.8, fitSize(tKey, d.tail, colW, { max: 220 * s, widths }));
    o += hero(c, tKey, d.tail, ax, y + ts * 0.9, ts, t, tT, { fill: layout === 'round' ? accent : '#2a2a2a', align, widths, id: 'tl', dir: rtl ? -1 : 1 });
    y += ts * 1.2;
  }

  // البصري: صورة متقصوصة أو شكل 3D، وديكور حسب الستايل
  const vx = portrait ? w / 2 : (rtl ? w * 0.24 : w * 0.76), vTop = portrait ? Math.max(y + 40 * s, h * 0.52) : h * 0.18;
  const vH = portrait ? h * 0.93 - vTop : h * 0.68, vy = vTop + vH / 2;
  if (img?.uriCut) o += cutoutImg(c, img, vx, vy, portrait ? w * 0.82 : w * 0.36, vH, t, Math.min(tH + 0.2, dur * 0.4), seed);
  else if (img?.uri) o += framedImg(c, img, vx, vy, portrait ? w * 0.74 : w * 0.38, vH * 0.86, t, Math.min(tH + 0.2, dur * 0.4), seed);
  else if (d.object && (layout !== 'stack' || !portrait)) o += object3d(c, d.object, portrait ? w * 0.56 : vx, portrait ? vy : h * 0.55, Math.min(portrait ? w * 0.42 : w * 0.24, vH * 0.7), { t, at: Math.min(tH + 0.3, dur * 0.5), color: layout === 'blur' ? ACCENTS.purple : null });
  if (layout === 'blur') o += object3d(c, 'sparkle', w * (rtl ? 0.12 : 0.86), h * (portrait ? 0.1 : 0.16), (portrait ? 230 : 190) * s, { t, at: 0.15, color: '#b23de8', rot: 12 });
  if (layout === 'stack' || d.chart) {
    const cp = easeInOutCubic(seg(t, tH + 0.2, tH + 2.2));
    const cy0 = portrait ? (img ? h * 0.9 : h * 0.72) : h * 0.82;
    o += chartLine(c, w * 0.08, cy0, w * (portrait ? 0.84 : 0.42), h * 0.1, cp, seed, accent);
  }
  return o;
}

export const SCENES_ED = { poster };
