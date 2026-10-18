// ── scenesCollage.js ── كولاج بورتريه على طريقة فيديوهات Vox/الوثائقيات الحديثة: شخص/تمثال/مبنى متقصوص (أبيض وأسود)
// مع بلوكات لون صريحة (برتقاني/ليموني) وراه، ستيكر بحد ملوّن، عنوان على شريط لاصق، ختم، دايرة لون ورا التمثال،
// سطر آلة كاتبة بهايلايت، ورقم سنة كبير فوق صورة باهتة — كل حاجة بتدخل بحركة متزامنة مع الكلام.
import { f1, f2, clamp01, easeOutCubic, easeOutBack, easeInOutCubic, seg, rand, uid, esc, txt } from './design.js';
import { tornPath, paperCard, tape, stamp, scribbleLine, boil, MONO } from './paper.js';
import { line, measure, fitSize, canPath } from './typeset.js';
import { phraseTime } from './scenesEd.js';

export const COLLAGE_LAYOUTS = ['blocks', 'sticker', 'halo', 'year'];
const INK = '#141414';
const ACC = { orange: '#f26a21', lime: '#d7e93a', red: '#c8242b', blue: '#5b6fd6', mustard: '#d9a62e', yellow: '#f4c430' };
const LAYOUT_ACC = { blocks: 'orange', sticker: 'red', halo: 'yellow', year: 'blue' };

const imgOf = (c, d) => (c.images && d.img ? c.images[d.img] : null);

/** خلفية ورق كريمي بحبيبات خفيفة */
function ground(c, seed, tone = '#ece6da') {
  const { w, h, s } = c; let dots = '';
  for (let i = 0; i < 90; i++) dots += `M${f1(rand(i, seed) * w)} ${f1(rand(i, seed + 3) * h)}h${f1(1.6 * s)}`;
  return `<rect x="${f1(-w * 0.08)}" y="${f1(-h * 0.08)}" width="${f1(w * 1.16)}" height="${f1(h * 1.16)}" fill="${tone}"/><path d="${dots}" stroke="#6b604c" stroke-width="${f1(2 * s)}" opacity="0.25"/>`;
}

/** الصورة المتقصوصة (أبيض وأسود أو ملوّنة) بحد ستيكر اختياري + ظل */
function cutout(c, img, { cx, cy, maxW, maxH, t, at, color = false, outline = null, seed = 1, from = 'bottom' }) {
  const href = color ? img.uriCut : (img.uriCutBw || img.uriCut);
  if (!href) return '';
  const p = easeOutCubic(seg(t, at, at + 0.7)); if (p <= 0) return '';
  const ar = img.cw / img.ch; let iw = maxW, ih = maxW / ar; if (ih > maxH) { ih = maxH; iw = maxH * ar; }
  const dx = from === 'left' ? -(1 - p) * 220 * c.s : from === 'right' ? (1 - p) * 220 * c.s : 0, dy = from === 'bottom' ? (1 - p) * 180 * c.s : 0;
  const drift = Math.sin(t * 0.5 + seed) * 5 * c.s, sc = 0.94 + 0.06 * p + 0.012 * Math.sin(t * 0.4);
  const fid = uid(c, `co${seed}`);
  // حد الستيكر: صور الحدود متجهّزة مسبقًا (لون التمييز + أبيض) — تلوينها بفلتر flood رخيص
  let rings = '';
  if (outline && img.uriRingBig) {
    rings = `<defs><filter id="${fid}" x="0" y="0" width="100%" height="100%"><feFlood flood-color="${outline}"/><feComposite in2="SourceAlpha" operator="in"/></filter></defs>`
      + `<image href="${img.uriRingBig}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" filter="url(#${fid})" preserveAspectRatio="xMidYMid meet"/>`
      + `<image href="${img.uriRingSmall}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  const shadow = `<ellipse cx="${f1(iw * 0.06)}" cy="${f1(ih / 2)}" rx="${f1(iw * 0.4)}" ry="${f1(14 * c.s)}" fill="#000" opacity="0.18"/>`;
  return `<g opacity="${f2(Math.min(1, p * 1.5))}" transform="translate(${f1(cx + dx)} ${f1(cy + dy + drift)}) scale(${f2(sc)})">${shadow}${rings}<image href="${href}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" preserveAspectRatio="xMidYMid meet"/></g>`;
}

/** بلوك لون بيتمسح لجوه (wipe) */
function block(c, x, y, w, h, color, p, dir = 1) {
  if (p <= 0) return '';
  const ww = w * easeOutCubic(p), xx = dir > 0 ? x : x + w - ww;
  return `<rect x="${f1(xx)}" y="${f1(y)}" width="${f1(ww)}" height="${f1(h)}" fill="${color}"/>`;
}

/** شريط هاف تون مكسّر (glitch) زي اللي تحت المبنى */
function glitchStrip(c, x, y, w, h, seed, p) {
  if (p <= 0) return ''; let o = '';
  const n = 26;
  for (let i = 0; i < n; i++) { if (rand(i, seed) > p) continue; const bw = (w / n) * (0.6 + rand(i, seed + 1)); o += `<rect x="${f1(x + (w * i) / n)}" y="${f1(y + rand(i, seed + 2) * h * 0.4)}" width="${f1(bw)}" height="${f1(h * (0.3 + rand(i, seed + 3) * 0.7))}" fill="#3a3a3a" opacity="${f2(0.15 + rand(i, seed + 4) * 0.45)}"/>`; }
  let dots = ''; for (let i = 0; i < 40; i++) dots += `<circle cx="${f1(x + w * 0.3 + i * w * 0.018)}" cy="${f1(y + h * 1.25)}" r="${f1(2.2 * c.s)}" fill="#222" opacity="0.6"/>`;
  return o + (p > 0.6 ? dots : '');
}

/** عنوان على شريط لاصق (تيب مستردة) بخط مضغوط — "POWER TRANSFORMED" */
function tapeTitle(c, text, { x, y, maxW, t, at, color = ACC.mustard, rot = -2, widths, anchor = 'start' }) {
  const p = clamp01((t - at) / 0.35); if (p <= 0 || !text) return '';
  const key = 'condensed', str = canPath(key, text) ? String(text).toUpperCase() : text;
  const size = Math.min(110 * c.s, fitSize(key, str, maxW * 0.9, { max: 200 * c.s, widths }));
  const tw = measure(key, str, size, { widths }) + size * 0.7, th = size * 1.25;
  const sc = 1 + 0.25 * (1 - easeOutBack(p)), x0 = anchor === 'end' ? x - tw : x;
  return `<g transform="translate(${f1(x0 + tw / 2)} ${f1(y)}) rotate(${f1(rot)}) scale(${f2(sc)})" opacity="${f2(Math.min(1, p * 2))}">`
    + `<path d="${tornPath(-tw / 2, -th / 2, tw, th, 7, 5 * c.s, 14 * c.s)}" fill="${color}"/><path d="${tornPath(-tw / 2, -th / 2, tw, th, 7, 5 * c.s, 14 * c.s)}" fill="#000" opacity="0.06" transform="translate(${f1(6 * c.s)} ${f1(8 * c.s)})"/>`
    + line(c, key, str, 0, size * 0.36, size, { anchor: 'middle', fill: INK, widths }) + '</g>';
}

/** سطر آلة كاتبة بيتكتب حرف حرف، والكلمة المهمة عليها هايلايت */
function typed(c, text, { x, y, size, t, at, cps = 30, mark = null, anchor = 'start' }) {
  if (!text || t < at) return '';
  if (c.rtl || /[\u0600-\u06FF]/.test(text)) { // العربي: كلمة كلمة بخط عربي (الحروف المتصلة ماينفعش تتكتب حرف حرف)
    const ws = String(text).split(/\s+/), n = Math.min(ws.length, 1 + Math.floor((t - at) * 4));
    return txt(c, ws.slice(0, n).join(' '), x, y, size * 1.35, { weight: 500, fill: '#222', anchor, rtl: true });
  }
  const n = Math.min(text.length, Math.floor((t - at) * cps)), shown = text.slice(0, n);
  const fs = size, est = (s) => s.length * fs * 0.6;
  let o = '';
  if (mark) { const k = text.indexOf(mark); if (k >= 0 && n > k) { const mx = (anchor === 'end' ? x - est(text) : x) + est(text.slice(0, k)); o += `<rect x="${f1(mx - 4)}" y="${f1(y - fs * 0.85)}" width="${f1(est(text.slice(k, Math.min(n, k + mark.length))) + 8)}" height="${f1(fs * 1.1)}" fill="${ACC.yellow}" opacity="0.85"/>`; } }
  return o + `<text x="${f1(x)}" y="${f1(y)}" font-family="${MONO}" font-size="${f1(fs)}" fill="#222" text-anchor="${anchor}"${c.rtl ? ' direction="rtl"' : ''}>${esc(shown)}</text>`;
}

// ── المشهد ──
export function portrait(c, d, t, dur, sc) {
  const { w, h, s, portrait: vert, rtl } = c; let o = '';
  const idx = sc?.index || 0, seed = idx * 9 + 5, tokens = sc?.tokens || [], widths = d._w || null;
  const layout = COLLAGE_LAYOUTS.includes(d.layout) ? d.layout : COLLAGE_LAYOUTS[idx % COLLAGE_LAYOUTS.length];
  const acc = ACC[d.accent] || ACC[LAYOUT_ACC[layout]];
  const img = imgOf(c, d);
  const tT = phraseTime(tokens, d.title, 0.35), tS = d.sub ? Math.max(tT + 0.5, phraseTime(tokens, d.sub, tT + 0.9)) : 0;
  const bo = boil(t, seed, 1.1 * s);

  if (layout === 'year') {
    o += ground(c, seed, '#e9e7e2');
    if (img?.uriBw || img?.uri) { // صورة باهتة بعرض الشاشة + شبكة blueprint
      const ar = img.w / img.h, iw = Math.max(w, h * ar) * 1.08, ih = iw / ar, k = 1.04 + 0.05 * easeInOutCubic(clamp01(t / dur));
      const mid = uid(c, 'yrm');
      o += `<defs><linearGradient id="${mid}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="0.65" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${mid}m"><rect width="${w}" height="${h}" fill="url(#${mid})"/></mask></defs>`;
      o += `<g mask="url(#${mid}m)" opacity="0.9"><image href="${img.uriBw || img.uri}" x="${f1(w / 2 - (iw * k) / 2)}" y="${f1(h / 2 - (ih * k) / 2)}" width="${f1(iw * k)}" height="${f1(ih * k)}" preserveAspectRatio="xMidYMid slice"/></g>`;
    }
    let grid = ''; for (let x = w * 0.08; x < w; x += 120 * s) grid += `M${f1(x)} ${f1(h * 0.08)}V${f1(h * 0.92)}`; for (let y = h * 0.1; y < h; y += 120 * s) grid += `M${f1(w * 0.05)} ${f1(y)}H${f1(w * 0.95)}`;
    o += `<path d="${grid}" stroke="#4b6c8f" stroke-width="${f1(1.2 * s)}" opacity="${f2(0.25 * easeOutCubic(seg(t, 0, 0.8)))}" fill="none"/>`;
    const year = String(d.year || d.title || '');
    if (year) {
      const p = easeOutCubic(seg(t, tT - 0.1, tT + 0.6)), size = (vert ? 300 : 340) * s;
      const ox = vert ? w / 2 : w * 0.58, oy = vert ? h * 0.3 : h * 0.47;
      o += `<g opacity="${f2(p)}" transform="translate(${f1(ox + (1 - p) * 80 * s)} ${f1(oy)})">` + line(c, 'serif', year, 0, size * 0.35, size, { anchor: 'middle', fill: '#ffffff', widths, extra: ' stroke="#9aa7b4" stroke-width="2" paint-order="stroke"' }) + '</g>';
    }
    if (d.sub) o += typed(c, d.sub, { x: rtl ? w * 0.92 : w * 0.08, y: h * 0.86, size: 38 * s, t, at: tS, anchor: rtl ? 'end' : 'start' });
    return o;
  }

  o += ground(c, seed);
  const cx = vert ? w / 2 : (layout === 'halo' ? (rtl ? w * 0.28 : w * 0.7) : w / 2);
  const cy = vert ? h * (layout === 'halo' ? 0.62 : 0.55) : h * 0.56;
  const mW = vert ? w * 0.86 : w * (layout === 'blocks' ? 0.62 : 0.42), mH = vert ? h * 0.52 : h * 0.78;

  if (layout === 'blocks') { // مبنى/شخص أبيض وأسود + بلوكات لون صريحة ورا وتحت + شريط glitch
    const pb = seg(t, 0.15, 0.6);
    o += `<g transform="translate(${f1(bo.dx)} ${f1(bo.dy)})">` + block(c, cx + mW * 0.05, cy - mH * 0.32, mW * 0.42, mH * 0.36, acc, pb, rtl ? -1 : 1) + '</g>';
    if (img) o += cutout(c, img, { cx, cy, maxW: mW, maxH: mH, t, at: 0.05, seed });
    o += block(c, cx - mW * 0.48, cy + mH * 0.28, mW * 0.42, mH * 0.12, acc, seg(t, 0.45, 0.9), rtl ? 1 : -1);
    o += glitchStrip(c, cx - mW * 0.05, cy + mH * 0.3, mW * 0.5, mH * 0.1, seed, seg(t, 0.6, 1.3));
    if (d.title) o += tapeTitle(c, d.title, { x: rtl ? w * 0.92 : w * 0.07, anchor: rtl ? 'end' : 'start', y: vert ? h * 0.16 : h * 0.14, maxW: w * 0.8, t, at: tT, color: '#ffffff', rot: -1.5, widths });
  } else if (layout === 'sticker') { // ستيكر بحد ملوّن + عنوان على تيب + ختم + خط فرشاة أحمر + قصاصة ورق
    const cardX = vert ? w * 0.06 : w * 0.05, cardY = vert ? h * 0.2 : h * 0.24, cardW = vert ? w * 0.56 : w * 0.34, cardH = vert ? h * 0.2 : h * 0.4;
    const pc = easeOutCubic(seg(t, 0.1, 0.55));
    if (pc > 0) o += `<g opacity="${f2(pc)}" transform="translate(${f1((1 - pc) * -60 * s)} 0) rotate(-3 ${f1(cardX + cardW / 2)} ${f1(cardY + cardH / 2)})">` + paperCard(c, { x: cardX, y: cardY, w: cardW, h: cardH, seed, fill: '#d9d4c7', jag: 9 }) + `<path d="M${f1(cardX + 20 * s)} ${f1(cardY + cardH * 0.25)}h${f1(cardW * 0.8)}M${f1(cardX + 20 * s)} ${f1(cardY + cardH * 0.45)}h${f1(cardW * 0.6)}M${f1(cardX + 20 * s)} ${f1(cardY + cardH * 0.65)}h${f1(cardW * 0.7)}" stroke="#555" stroke-width="${f1(6 * s)}" opacity="0.25"/></g>`;
    if (img) o += cutout(c, img, { cx: vert ? w * 0.56 : (rtl ? w * 0.32 : w * 0.66), cy, maxW: vert ? w * 0.8 : w * 0.45, maxH: mH, t, at: 0.25, outline: acc, seed, from: rtl ? 'left' : 'right' });
    if (d.title) o += tapeTitle(c, d.title, { x: rtl ? w * 0.94 : w * 0.06, anchor: rtl ? 'end' : 'start', y: vert ? h * 0.13 : h * 0.18, maxW: vert ? w * 0.88 : w * 0.5, t, at: tT, widths });
    const tp = seg(t, tT + 0.5, tT + 1.0);
    o += scribbleLine(c, { x1: vert ? w * 0.08 : w * 0.06, x2: vert ? w * 0.7 : w * 0.45, y: vert ? h * 0.9 : h * 0.86, p: tp, seed, color: acc, width: 14 });
    if (d.sub && (c.rtl || /[\u0600-\u06FF]/.test(d.sub))) o += tapeTitle(c, d.sub, { x: vert ? w * 0.08 : w * 0.06, y: vert ? h * 0.44 : h * 0.72, maxW: vert ? w * 0.5 : w * 0.3, t, at: tS, color: '#ffffff', rot: 3, widths });
    else if (d.sub) o += stamp(c, { text: d.sub.slice(0, 22), cx: vert ? w * 0.3 : w * 0.2, cy: vert ? h * 0.44 : h * 0.72, size: 40 * s, rot: -8, color: INK, p: seg(t, tS, tS + 0.3) });
  } else { // halo: عنوان أسود ضخم + سطر آلة كاتبة + تمثال/شخص قدام دايرة لون + ورقة ملاحظات + شخبطة
    const tx = rtl ? w * 0.93 : w * 0.07, anchor = rtl ? 'end' : 'start', tw = vert ? w * 0.86 : w * 0.5;
    const p = easeOutCubic(seg(t, 0.2, 1.0));
    o += `<circle cx="${f1(cx)}" cy="${f1(cy - mH * 0.18)}" r="${f1(mH * 0.24 * p)}" fill="${acc}"/>`;
    o += `<g transform="translate(${f1(vert ? w * 0.86 : (rtl ? w * 0.05 : w * 0.9))} ${f1(h * 0.08)}) rotate(4)" opacity="${f2(seg(t, 0.4, 0.8))}">` + paperCard(c, { x: -60 * s, y: 0, w: 120 * s, h: h * 0.6, seed: seed + 2, fill: '#efe8d6', jag: 6 }) + '</g>';
    if (img) o += cutout(c, img, { cx, cy, maxW: mW, maxH: mH, t, at: 0.15, seed });
    if (d.title) {
      const words = String(d.title).split(/\s+/).slice(0, 4), key = 'condensed';
      const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [words.join(' ')];
      let y = vert ? h * 0.12 : h * 0.24;
      lines.forEach((ln, k) => {
        const str = canPath(key, ln) ? ln.toUpperCase() : ln, size = Math.min((vert ? 150 : 170) * s, fitSize(key, str, tw, { max: 240 * s, widths }));
        const pp = easeOutCubic(seg(t, tT + k * 0.25, tT + k * 0.25 + 0.4));
        if (pp > 0) o += `<g opacity="${f2(pp)}" transform="translate(${f1((1 - pp) * (rtl ? 40 : -40) * s)} 0)">` + line(c, key, str, tx, y + size * 0.85, size, { anchor, fill: INK, widths }) + '</g>';
        y += size * 1.02;
      });
      if (d.sub) o += typed(c, d.sub, { x: tx, y: y + 46 * s, size: 36 * s, t, at: tS, mark: d.mark || null, anchor });
    }
    o += scribbleLine(c, { x1: vert ? w * 0.08 : w * 0.06, x2: vert ? w * 0.3 : w * 0.2, y: vert ? h * 0.06 : h * 0.12, p: seg(t, 0.1, 0.6), seed: seed + 5, color: INK, width: 4 });
  }
  return o;
}

export const SCENES_COLLAGE = { portrait };
