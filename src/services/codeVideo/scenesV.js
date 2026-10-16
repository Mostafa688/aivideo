// ── scenesV.js ── مشاهد نمط Vox بأسلوب الكولاج الورقي: صور أرشيفية مطبوعة (هاف تون/حبر) على ورق متقطع بشريط لاصق،
// أسهم وكلام مرسوم باليد بيترسم مع الصوت، ختم، زوايا كاميرا، وحركة stop-motion
// الصور بتيجي من الأرشيف عن طريق produce.js وبتتحط في c.images[id] = { uri, uriBw, uriHt, uriInk, w, h }
import { f1, f2, clamp01, easeOutCubic, easeInOutCubic, seg, spring, rgba, darken, txt, uid, wrapText, fitText, lerp, esc } from './design.js';
import { ent, layoutWords } from './common.js';
import { kinetic } from './scenesA.js';
import { boil, paperCard, tape, handArrow, markerCircle, scribbleLine, starburst, corners, stamp, dashedLoop, toss, paperStrip, INK, DISPLAY, PAPER_WHITE } from './paper.js';

const imgOf = (c, id) => (c.images && id ? c.images[id] : null);

/** كلمات متزامنة بحبر على ورق (أو أبيض على صورة) مع هايلايت أصفر للكلمات المهمة */
export function inkWords(c, tokens, t, box, { emphasis = [], color = c.pal.text, onDark = false, align = 'center', maxLines = 6, startSize = 92 } = {}) {
  const { s, pal, rtl } = c; let o = '';
  const words = (tokens || []).map(x => ({ text: x.w, start: x.start, end: x.end }));
  if (!words.length) return '';
  let size = startSize * s, lines = [];
  for (; size > 34 * s; size -= 3 * s) { lines = layoutWords(words, size, box.w, c.mm, rtl); if (lines.length <= maxLines && lines.length * size * 1.28 <= box.h) break; }
  const lh = size * 1.28, total = lines.length * lh, y0 = box.y + (box.h - total) / 2 + size * 0.92;
  const emph = new Set((emphasis || []).map(x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  lines.forEach((ln, li) => {
    for (const it of ln.items) {
      const wd = words[it.i], clean = String(wd.text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const we = ent(t, wd.start - 0.04, 0.35);
      if (t < wd.start - 0.05) continue;
      const isE = emph.has(clean), x = box.x + box.w / 2 + it.cx, yy = y0 + li * lh + (1 - Math.min(1, we.p)) * 24 * s;
      if (isE) {
        const hw = it.width + size * 0.2 * 2, sweep = easeOutCubic(seg(t, wd.start - 0.02, wd.start + 0.3));
        o += `<rect x="${f1(x - it.width / 2 - size * 0.2)}" y="${f1(yy - size * 0.78)}" width="${f1(hw * sweep)}" height="${f1(size * 0.98)}" rx="${f1(size * 0.1)}" fill="${pal.mark || pal.a2}" opacity="${onDark ? 0.95 : 0.85}" transform="rotate(-1.2 ${f1(x)} ${f1(yy)})"/>`;
      }
      o += txt(c, wd.text, x, yy, size, { weight: 900, fill: isE ? (onDark ? '#16161a' : pal.text) : color, opacity: we.o, stroke: onDark && !isE ? 'rgba(0,0,0,0.55)' : null, strokeW: onDark && !isE ? size * 0.08 : 0 });
    }
  });
  return o;
}


const RED = '#d62828';
/** ارتفاع الكلام الفعلي بعد ما يتوزّع (عشان كارت الورق يبقى على قد الكلام مش أكبر) */
export function inkHeight(c, tokens, box, { maxLines = 6, startSize = 92 } = {}) {
  const words = (tokens || []).map(x => ({ text: x.w, start: x.start, end: x.end }));
  if (!words.length) return box.h;
  let size = startSize * c.s, lines = [];
  for (; size > 34 * c.s; size -= 3 * c.s) { lines = layoutWords(words, size, box.w, c.mm, c.rtl); if (lines.length <= maxLines && lines.length * size * 1.28 <= box.h) break; }
  return Math.min(box.h, lines.length * size * 1.28 + size * 0.3);
}


const printOf = (img, kind) => (kind === 'color' ? img.uri : kind === 'ink' ? (img.uriInk || img.uriBw || img.uri) : (img.uriHt || img.uriBw || img.uri));
const clean = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** وقت أول كلمة مهمة في المشهد (عشان السهم/الدايرة يترسموا في نفس لحظة نطقها) */
function emphTime(tokens, emphasis, fallback) {
  const want = new Set((emphasis || []).map(clean).filter(Boolean));
  const hit = (tokens || []).find(x => want.has(clean(x.w)));
  return hit ? hit.start : fallback;
}
/** أهم كلمة تتكتب كبيرة (من المبرَز أو أطول كلمة اتقالت) */
function bigWord(tokens, emphasis) {
  if (emphasis?.length) return String(emphasis[0]);
  const ws = (tokens || []).map(x => String(x.w).replace(/[^\p{L}\p{N}'-]/gu, '')).filter(Boolean);
  return ws.sort((a, b) => b.length - a.length)[0] || '';
}

/** صورة مطبوعة على كارت ورق متقطع بشريط لاصق، داخلة "مرمية" وبتهتز اهتزاز ورق */
function printCard(c, img, { cx, cy, fw, fh, rot = 0, t, dur, at = 0.1, from = 'bottom', tag = 'f', kind = 'ht', seed = 1, tapes = 2 }) {
  const { s } = c; let o = '';
  const tz = toss(t, at, { from, dist: 520, s, dur: 0.55 });
  if (!tz.o) return '';
  const bo = boil(t, seed, 1.4 * s), b = 18 * s, W = fw + b * 2, H = fh + b * 2;
  const id = uid(c, `${tag}c`);
  const kb = 1.03 + 0.08 * easeInOutCubic(clamp01(t / Math.max(1, dur)));
  const ar = img.w / img.h, far = fw / fh, iw = ar > far ? fh * ar : fw, ih = ar > far ? fh : fw / ar;
  o += `<g transform="translate(${f1(cx + tz.dx + bo.dx)} ${f1(cy + tz.dy + bo.dy)}) rotate(${f1(rot + tz.rot + bo.rot)})">`;
  o += paperCard(c, { x: -W / 2, y: -H / 2, w: W, h: H, seed, jag: 7 });
  o += `<defs><clipPath id="${id}"><rect x="${f1(-fw / 2)}" y="${f1(-fh / 2)}" width="${f1(fw)}" height="${f1(fh)}"/></clipPath></defs>`;
  o += `<g clip-path="url(#${id})"><g transform="scale(${f2(kb)})"><image href="${printOf(img, kind)}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" preserveAspectRatio="none"/></g></g>`;
  if (tapes >= 1) o += tape(c, -W * 0.36, -H / 2 + 2 * s, 130 * s, -38, seed);
  if (tapes >= 2) o += tape(c, W * 0.36, -H / 2 + 2 * s, 130 * s, 38, seed + 3);
  return o + '</g>';
}

/** تيكت ورق صغير عليه كلمة + سهم مرسوم بيشاور على الصورة */
function tagLabel(c, text, { x, y, toX, toY, t, at, seed = 5 }) {
  if (!text || t < at) return '';
  const { s } = c, size = 40 * s, tw = Math.min(c.w * 0.4, text.length * size * 0.56 + 60 * s), th = size * 1.9;
  const tz = toss(t, at, { from: 'bottom', dist: 200, s, dur: 0.4 }), bo = boil(t, seed, 1.2 * s);
  let o = `<g transform="translate(${f1(x + tz.dx + bo.dx)} ${f1(y + tz.dy + bo.dy)}) rotate(${f1(-4 + tz.rot)})">`;
  o += paperStrip(c, { x: -tw / 2, y: -th / 2, w: tw, h: th, seed, rot: 0 });
  o += `<circle cx="${f1(tw / 2 - 26 * s)}" cy="${f1(-th / 2 + 24 * s)}" r="${f1(9 * s)}" fill="none" stroke="${INK}" stroke-width="${f1(3 * s)}" opacity="0.6"/>`;
  o += txt(c, text, 0, size * 0.36, size, { weight: 800, fill: INK });
  o += '</g>';
  o += handArrow(c, { x1: x + (toX > x ? tw * 0.4 : -tw * 0.4), y1: y - th * 0.2, x2: toX, y2: toY, bend: toX > x ? -0.35 : 0.35, p: easeOutCubic(seg(t, at + 0.25, at + 0.85)), seed });
  return o;
}

// ── صورة مطبوعة على ورق + كلام متزامن + تيكت بسهم + دايرة ماركر وقت الكلمة المهمة ──
export function photo(c, d, t, dur, sc) {
  const img = imgOf(c, d.img); if (!img) return kinetic(c, d, t, dur, sc);
  const { w, h, s, portrait } = c; let o = '';
  const side = d.side === 'right' ? 'right' : d.side === 'left' ? 'left' : (sc.index % 2 ? 'right' : 'left');
  const ar = img.w / img.h, seed = sc.index * 3.7 + 1;
  let fw, fh, cx, cy, box;
  if (portrait) {
    fw = Math.min(w * 0.74, h * 0.32 * Math.max(0.8, Math.min(1.5, ar))); fh = Math.min(h * 0.34, fw / Math.max(0.7, Math.min(1.6, ar)));
    cx = w / 2; cy = h * 0.28; box = { x: w * 0.07, y: h * 0.55, w: w * 0.86, h: h * 0.36 };
  } else {
    fw = w * 0.36; fh = Math.min(h * 0.6, fw / Math.max(0.75, Math.min(1.7, ar)));
    cx = side === 'left' ? w * 0.27 : w * 0.73; cy = h * 0.47; box = { x: side === 'left' ? w * 0.52 : w * 0.05, y: h * 0.16, w: w * 0.43, h: h * 0.66 };
  }
  const rot = side === 'left' ? -3.5 : 3.5;
  o += printCard(c, img, { cx, cy, fw, fh, rot, t, dur, at: 0.05, from: side === 'left' ? 'left' : 'right', tag: `ph${sc.index}`, kind: d.print || (sc.index % 3 === 2 ? 'ink' : 'ht'), seed });
  // دايرة ماركر حوالين الصورة لحظة الكلمة المهمة
  const te = emphTime(sc.tokens, d.emphasis, null);
  if (te != null) o += markerCircle(c, { cx, cy, rx: fw * 0.62, ry: fh * 0.62, p: easeOutCubic(seg(t, te, te + 0.6)), seed });
  if (d.caption) {
    const lx = portrait ? w * 0.7 : (side === 'left' ? cx + fw * 0.2 : cx - fw * 0.2), ly = portrait ? h * 0.47 : h * 0.86;
    o += tagLabel(c, d.caption, { x: lx, y: ly, toX: cx + (lx > cx ? fw * 0.32 : -fw * 0.32), toY: cy + fh * 0.36, t, at: 0.7, seed: seed + 2 });
  }
  // الكلام على كارت ورق (بيتقري على أي خلفية: أحمر/أزرق/ورق)
  const ce = toss(t, 0.18, { from: side === 'left' ? 'right' : 'left', dist: 420, s, dur: 0.5 }), cb = boil(t, seed + 1, 1.1 * s);
  if (ce.o) {
    const pad = 34 * s, hh = inkHeight(c, sc.tokens, box, { startSize: 80 });
    box = { ...box, y: box.y + (box.h - hh) / 2, h: hh };
    o += `<g transform="translate(${f1(ce.dx + cb.dx)} ${f1(ce.dy + cb.dy)}) rotate(${f1((side === 'left' ? 1.4 : -1.4) + ce.rot * 0.3)} ${f1(box.x + box.w / 2)} ${f1(box.y + box.h / 2)})">`;
    o += paperCard(c, { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2, seed: seed + 8, fill: '#f3eee1', jag: 6 });
    o += inkWords(c, sc.tokens, t, box, { emphasis: d.emphasis, startSize: portrait ? 80 : 80, color: INK }) + '</g>';
  }
  return o;
}

// ── صورة بالحبر بملء الشاشة + زوايا كاميرا + كلمة كبيرة مضغوطة بختم + نجمة + كلام على شريط ورق ──
export function fullphoto(c, d, t, dur, sc) {
  const img = imgOf(c, d.img); if (!img) return kinetic(c, d, t, dur, sc);
  const { w, h, s, pal, portrait } = c; let o = '';
  const seed = sc.index * 5.3 + 2, p = clamp01(t / Math.max(1, dur)), e = easeInOutCubic(p), kb = 1.06 + 0.12 * e;
  const ar = img.w / img.h, far = w / h, iw = ar > far ? h * ar : w, ih = ar > far ? h : w / ar;
  const id = uid(c, 'fpg');
  o += `<defs><clipPath id="${id}"><rect width="${w}" height="${h}"/></clipPath></defs>`;
  o += `<g clip-path="url(#${id})"><g transform="translate(${f1(w / 2 + (c.rtl ? -1 : 1) * (e - 0.5) * 60 * s)} ${f1(h / 2)}) scale(${f2(kb)})"><image href="${printOf(img, d.print === 'ht' ? 'ht' : 'ink')}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" preserveAspectRatio="none"/></g></g>`;
  const m = 46 * s;
  o += corners(c, { x: m, y: m, w: w - m * 2, h: h - m * 2, len: 80, p: easeOutCubic(seg(t, 0.05, 0.45)) });
  // REC + عدّاد (ديكور كاميرا — مش معلومة)
  o += paperStrip(c, { x: m + 18 * s, y: m + 16 * s, w: 330 * s, h: 60 * s, seed: seed + 4, rot: -1 });
  if (Math.floor(t * 2) % 2 === 0) o += `<circle cx="${f1(m + 46 * s)}" cy="${f1(m + 46 * s)}" r="${f1(11 * s)}" fill="${RED}"/>`;
  const tc = `00:${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 24)).padStart(2, '0')}`;
  o += `<text x="${f1(m + 64 * s)}" y="${f1(m + 58 * s)}" font-family="'Noto Sans Mono', 'DejaVu Sans Mono', monospace" font-size="${f1(32 * s)}" font-weight="700" fill="${INK}">REC ${tc}</text>`;
  // نجمة انفجار في الركن + الكلمة الكبيرة (مضغوطة) بتنزل كختم
  const te = emphTime(sc.tokens, d.emphasis, Math.min(dur * 0.4, 1.4));
  const word = bigWord(sc.tokens, d.emphasis);
  o += starburst(c, { cx: portrait ? w * 0.82 : w * 0.12, cy: portrait ? h * 0.2 : h * 0.8, r: 90 * s, color: '#e85d5d', p: seg(t, te - 0.1, te + 0.3), rot: 0.2 });
  if (word) {
    const size = Math.min((portrait ? 150 : 170) * s, (w * 0.62) / Math.max(3, word.length * (c.rtl ? 0.62 : 0.5)));
    const k = clamp01(seg(t, te, te + 0.25)), sc2 = 1 + (1 - easeOutCubic(k)) * 0.7;
    const wx = portrait ? w / 2 : w - m - 30 * s, wy = portrait ? h * 0.47 : h * 0.62, anchor = portrait ? 'middle' : 'end';
    if (k > 0) {
      const disp = c.rtl ? word : word.toUpperCase(), ww = Math.min(w * 0.9, disp.length * size * (c.rtl ? 0.62 : 0.46) + size * 0.7), wh = size * 1.3;
      const x0 = anchor === 'end' ? -ww + size * 0.3 : -ww / 2;
      o += `<g opacity="${f2(Math.min(1, k * 2))}" transform="translate(${f1(wx)} ${f1(wy)}) scale(${f2(sc2)}) rotate(-2)">` + paperStrip(c, { x: x0, y: -size * 0.98, w: ww, h: wh, seed: seed + 6, rot: 0 })
        + (c.rtl ? txt(c, word, x0 + ww / 2, 0, size * 0.8, { weight: 700, fill: INK }) : `<text x="${f1((x0 + ww / 2) / 0.8)}" y="0" font-family="${DISPLAY}" font-size="${f1(size)}" font-weight="900" fill="${INK}" text-anchor="middle" transform="scale(0.8 1)">${esc(disp)}</text>`) + '</g>';
    }
  }
  // الكلام كله على شريط ورق تحت
  const bx = { x: w * 0.08, y: h * (portrait ? 0.66 : 0.74), w: w * (portrait ? 0.84 : 0.58), h: h * (portrait ? 0.24 : 0.17) };
  const se = toss(t, 0.15, { from: 'bottom', dist: 300, s, dur: 0.45 });
  if (se.o) {
    o += `<g transform="translate(${f1(se.dx)} ${f1(se.dy)})">` + paperStrip(c, { x: bx.x - 24 * s, y: bx.y - 16 * s, w: bx.w + 48 * s, h: bx.h + 32 * s, seed, rot: -1.2 });
    o += inkWords(c, sc.tokens, t, bx, { emphasis: d.emphasis, color: INK, startSize: portrait ? 72 : 64, maxLines: 3 }) + '</g>';
  }
  if (d.caption && clean(d.caption) !== clean(word)) o += stamp(c, { text: d.caption, cx: portrait ? w / 2 : w * 0.72, cy: portrait ? h * 0.12 : h * 0.17, size: 50 * s, rot: -6, color: RED, p: seg(t, 0.6, 0.9) });
  return o;
}

// ── كولاج: 2-3 صور مطبوعة بترتمي على ورق ملوّن، أسهم بتوصّل بينهم، وعنوان على شريط بماركر ──
export function collage(c, d, t, dur, sc) {
  const imgs = (d.imgs || []).map(id => imgOf(c, id)).filter(Boolean);
  if (imgs.length < 2) return kinetic(c, d, t, dur, sc);
  const { w, h, s, portrait } = c; let o = '';
  const slots = portrait
    ? [{ cx: w * 0.34, cy: h * 0.2, fw: w * 0.5, fh: h * 0.19, rot: -5, from: 'left' }, { cx: w * 0.66, cy: h * 0.42, fw: w * 0.5, fh: h * 0.19, rot: 4, from: 'right' }, { cx: w * 0.36, cy: h * 0.63, fw: w * 0.48, fh: h * 0.16, rot: -3, from: 'left' }]
    : [{ cx: w * 0.2, cy: h * 0.36, fw: w * 0.24, fh: h * 0.34, rot: -5, from: 'left' }, { cx: w * 0.5, cy: h * 0.4, fw: w * 0.26, fh: h * 0.38, rot: 3, from: 'top' }, { cx: w * 0.8, cy: h * 0.34, fw: w * 0.24, fh: h * 0.34, rot: -2.5, from: 'right' }];
  const used = imgs.slice(0, 3).map((im, i) => ({ im, sl: slots[(imgs.length === 2 && !portrait) ? [0, 2][i] : i], at: 0.1 + i * 0.4 }));
  used.forEach(({ im, sl, at }, i) => { o += printCard(c, im, { ...sl, t, dur, at, tag: `co${sc.index}_${i}`, kind: i % 2 ? 'ink' : 'ht', seed: sc.index * 7 + i, tapes: 1 }); });
  // أسهم بين الصور بالترتيب
  for (let i = 1; i < used.length; i++) {
    const a = used[i - 1].sl, b = used[i].sl, at = used[i].at + 0.45;
    const x1 = a.cx + (b.cx > a.cx ? a.fw * 0.45 : -a.fw * 0.45), y1 = a.cy + (portrait ? a.fh * 0.4 : -a.fh * 0.55), x2 = b.cx - (b.cx > a.cx ? b.fw * 0.48 : -b.fw * 0.48), y2 = b.cy + (portrait ? -b.fh * 0.4 : -b.fh * 0.55);
    o += handArrow(c, { x1, y1, x2, y2, bend: portrait ? 0.25 : -0.3, p: easeOutCubic(seg(t, at, at + 0.5)), width: 6, seed: i + sc.index });
  }
  if (d.headline) {
    const he = toss(t, 0.1 + used.length * 0.4 + 0.2, { from: 'bottom', dist: 260, s, dur: 0.45 }), size = (portrait ? 80 : 88) * s;
    const fit = fitText(c.rtl ? String(d.headline) : String(d.headline).toUpperCase(), w * 0.8, h * (portrait ? 0.16 : 0.18), { max: size, min: 40 * s, maxLines: 2, lineGap: 1.1 });
    const y0 = h * (portrait ? 0.84 : 0.81) - (fit.lines.length - 1) * fit.size * 0.55;
    if (he.o) {
      const bw = Math.min(w * 0.9, Math.max(...fit.lines.map(l => l.length)) * fit.size * 0.6 + fit.size * 1.2), bh = fit.lines.length * fit.size * 1.12 + fit.size * 0.7;
      o += `<g transform="translate(${f1(he.dx)} ${f1(he.dy)})">` + paperStrip(c, { x: w / 2 - bw / 2, y: y0 - fit.size * 1.05, w: bw, h: bh, seed: sc.index + 9, rot: -1.5 });
      fit.lines.forEach((ln, i) => { o += txt(c, ln, w / 2, y0 + i * fit.size * 1.1, fit.size, { weight: 900, fill: INK }); });
      o += scribbleLine(c, { x1: w / 2 - bw * 0.4, x2: w / 2 + bw * 0.4, y: y0 + (fit.lines.length - 1) * fit.size * 1.1 + fit.size * 0.28, p: easeOutCubic(seg(t, 0.9 + used.length * 0.4, 1.5 + used.length * 0.4)), seed: sc.index }) + '</g>';
    }
  }
  return o;
}

// ── عنوان: بالتبادل قصاصة جريدة، أو ورقة متقطعة (زي كارت ملاحظة) بأسهم دايرية منقطة وخط تحت الكلام ──
export function headline(c, d, t, dur, sc) {
  const { w, h, s, pal, portrait } = c; let o = '';
  const seed = sc.index * 4.1 + 3, note = Math.floor(sc.index / 2) % 2 === 1;
  const tz = toss(t, 0.05, { from: note ? 'right' : 'bottom', dist: 520, s, dur: 0.55 }), bo = boil(t, seed, 1.3 * s);
  const pw = w * (portrait ? 0.86 : 0.64), ph = h * (portrait ? 0.5 : 0.66), cx = w / 2, cy = h * (portrait ? 0.46 : 0.5);
  o += `<g transform="translate(${f1(cx + tz.dx + bo.dx)} ${f1(cy + tz.dy + bo.dy)}) rotate(${f1((note ? 1.6 : -2.2) + tz.rot + bo.rot)})">`;
  o += paperCard(c, { x: -pw / 2, y: -ph / 2, w: pw, h: ph, seed, fill: note ? '#ece6d6' : '#f7f3e8', jag: note ? 14 : 5 });
  const fit = fitText(d.headline, pw - 110 * s, ph * (note ? 0.62 : 0.46), { max: (portrait ? 96 : 104) * s, min: 38 * s, maxLines: 4, lineGap: 1.12 });
  const emphWords = new Set((d.emphasis || []).map(x => String(x).toLowerCase()));
  if (!note) o += `<rect x="${f1(-pw / 2 + 36 * s)}" y="${f1(-ph / 2 + 34 * s)}" width="${f1(pw - 72 * s)}" height="${f1(8 * s)}" fill="${INK}"/><rect x="${f1(-pw / 2 + 36 * s)}" y="${f1(-ph / 2 + 54 * s)}" width="${f1(pw - 72 * s)}" height="${f1(3 * s)}" fill="${INK}"/>`;
  const total = fit.lines.length * fit.size * 1.12, top = note ? -total / 2 - fit.size * 0.2 : -ph / 2 + 110 * s;
  fit.lines.forEach((ln, i) => {
    const le = ent(t, 0.4 + i * 0.22, 0.5), yy = top + fit.size * 0.9 + i * fit.size * 1.12;
    const hit = [...emphWords].some(wd => wd && ln.toLowerCase().includes(wd));
    if (hit && !note) o += `<rect x="${f1(-pw / 2 + 40 * s)}" y="${f1(yy - fit.size * 0.8)}" width="${f1((pw - 80 * s) * easeOutCubic(seg(t, 0.9 + i * 0.2, 1.4 + i * 0.2)))}" height="${f1(fit.size * 0.98)}" fill="${pal.mark || pal.a2}" opacity="0.85"/>`;
    o += txt(c, ln, 0, yy + (1 - Math.min(1, le.p)) * 20 * s, fit.size, { weight: 900, fill: INK, opacity: le.o });
    if (hit && note) { const lw = Math.min(pw * 0.8, ln.length * fit.size * 0.55); o += scribbleLine(c, { x1: -lw / 2, x2: lw / 2, y: yy + fit.size * 0.22, p: easeOutCubic(seg(t, 0.9 + i * 0.2, 1.5 + i * 0.2)), seed: seed + i }); }
  });
  if (!note) {
    const gy0 = top + total + 30 * s;
    for (let col = 0; col < (portrait ? 2 : 3); col++) {
      const cw = (pw - 100 * s) / (portrait ? 2 : 3) - 14 * s, gx = -pw / 2 + 40 * s + col * (cw + 22 * s);
      for (let r = 0; gy0 + r * 26 * s < ph / 2 - 40 * s; r++) o += `<rect x="${f1(gx)}" y="${f1(gy0 + r * 26 * s)}" width="${f1(cw * (r % 4 === 3 ? 0.6 : 1))}" height="${f1(9 * s)}" fill="${INK}" opacity="${f2(0.13 * ent(t, 0.8 + r * 0.04, 0.4).o)}"/>`;
    }
  }
  o += tape(c, 0, -ph / 2 + 4 * s, 180 * s, note ? 4 : -3, seed);
  o += '</g>';
  if (note) o += dashedLoop(c, { cx: cx + (c.rtl ? pw * 0.5 : -pw * 0.5), cy: cy + ph * 0.42, r: 90 * s, p: easeOutCubic(seg(t, 0.8, 1.5)), t: t * 0.4 });
  return o;
}

export const SCENES_V = { photo, fullphoto, collage, headline };
