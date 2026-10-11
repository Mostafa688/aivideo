// ── scenesV.js ── مشاهد نمط Vox: صور أرشيفية مؤطرة (ورق + شريط لاصق + ظل)، صورة بملء الشاشة بتدرّج رمادي، كولاج، وقصاصة جريدة بعنوان
// الصور بتيجي من الأرشيف عن طريق produce.js وبتتحط في c.images[id] = { uri, uriBw, w, h }
import { f1, f2, clamp01, easeOutCubic, easeInOutCubic, seg, spring, rgba, darken, txt, uid, wrapText, fitText, lerp } from './design.js';
import { ent, layoutWords } from './common.js';
import { kinetic } from './scenesA.js';

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

/** صورة مؤطرة كورقة: ظل + إطار أبيض + شريط لاصق + كين بيرنز داخلي + تسمية اختيارية */
function framedImage(c, img, { cx, cy, fw, fh, rot = 0, t, dur, at = 0.1, caption = '', tag = 'f', shape = 'paper' }) {
  const { s, pal } = c; let o = '';
  const e = ent(t, at, 0.6), sc = 0.7 + 0.3 * Math.min(1.1, e.p), dy = (1 - Math.min(1, e.p)) * 80 * s;
  const b = 20 * s, capH = caption ? 70 * s : 0, W = fw + b * 2, H = fh + b * 2 + capH;
  const id = uid(c, `${tag}c`);
  const kb = 1.04 + 0.12 * easeInOutCubic(clamp01(t / Math.max(1, dur))), px = (c.rtl ? -1 : 1) * 26 * s * (clamp01(t / Math.max(1, dur)) - 0.5);
  const ar = img.w / img.h, far = fw / fh;
  const iw = ar > far ? fh * ar : fw, ih = ar > far ? fh : fw / ar;
  o += `<g opacity="${f2(e.o)}" transform="translate(${f1(cx)} ${f1(cy + dy)}) rotate(${f1(rot * (0.4 + 0.6 * Math.min(1, e.p)))}) scale(${f2(sc)})">`;
  if (shape === 'circle') {
    const r = Math.min(fw, fh) / 2;
    o += `<circle cx="${f1(10 * s)}" cy="${f1(18 * s)}" r="${f1(r + b)}" fill="#000" opacity="0.22"/><circle r="${f1(r + b)}" fill="#fff"/>`;
    o += `<defs><clipPath id="${id}"><circle r="${f1(r)}"/></clipPath></defs><g clip-path="url(#${id})"><image href="${img.uri}" x="${f1(-iw / 2 + px)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}" transform="scale(${f2(kb)})"/></g>`;
    o += `<circle r="${f1(r)}" fill="none" stroke="${pal.a1}" stroke-width="${f1(8 * s)}"/>`;
  } else {
    o += `<rect x="${f1(-W / 2 + 12 * s)}" y="${f1(-H / 2 + 20 * s)}" width="${f1(W)}" height="${f1(H)}" fill="#000" opacity="0.22"/>`;
    o += `<rect x="${f1(-W / 2)}" y="${f1(-H / 2)}" width="${f1(W)}" height="${f1(H)}" fill="#fdfbf5"/>`;
    o += `<defs><clipPath id="${id}"><rect x="${f1(-fw / 2)}" y="${f1(-H / 2 + b)}" width="${f1(fw)}" height="${f1(fh)}"/></clipPath></defs>`;
    o += `<g clip-path="url(#${id})"><g transform="translate(0 ${f1(-H / 2 + b + fh / 2)}) scale(${f2(kb)})"><image href="${img.uri}" x="${f1(-iw / 2 + px)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}"/></g></g>`;
    o += `<rect x="${f1(-fw / 2)}" y="${f1(-H / 2 + b)}" width="${f1(fw)}" height="${f1(fh)}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="${f1(2 * s)}"/>`;
    if (caption) o += txt(c, caption, 0, H / 2 - 26 * s, Math.min(44 * s, (W - 40 * s) / Math.max(6, caption.length) * 1.55), { weight: 800, fill: '#2b2b2b', spacing: 1 * s });
    o += `<rect x="${f1(-70 * s)}" y="${f1(-H / 2 - 18 * s)}" width="${f1(140 * s)}" height="${f1(40 * s)}" fill="${pal.mark || pal.a2}" opacity="0.82" transform="rotate(-4)"/>`;
  }
  return o + '</g>';
}

// ── صورة أرشيفية مؤطرة + نص متزامن ──
export function photo(c, d, t, dur, sc) {
  const img = imgOf(c, d.img); if (!img) return kinetic(c, d, t, dur, sc);
  const { w, h, s, pal, portrait } = c; let o = '';
  const side = d.side === 'right' ? 'right' : d.side === 'left' ? 'left' : (sc.index % 2 ? 'right' : 'left');
  const ar = img.w / img.h;
  let fw, fh, cx, cy, box;
  if (portrait) {
    fw = Math.min(w * 0.78, h * 0.34 * Math.max(0.8, Math.min(1.5, ar))); fh = Math.min(h * 0.36, fw / Math.max(0.7, Math.min(1.6, ar)));
    cx = w / 2; cy = h * 0.27; box = { x: w * 0.07, y: h * 0.52, w: w * 0.86, h: h * 0.38 };
  } else {
    fw = w * 0.4; fh = Math.min(h * 0.62, fw / Math.max(0.75, Math.min(1.7, ar)));
    cx = side === 'left' ? w * 0.26 : w * 0.74; cy = h * 0.46; box = { x: side === 'left' ? w * 0.5 : w * 0.06, y: h * 0.14, w: w * 0.44, h: h * 0.7 };
  }
  o += framedImage(c, img, { cx, cy, fw, fh, rot: side === 'left' ? -3.2 : 3.2, t, dur, caption: d.caption || '', tag: `ph${sc.index}`, shape: d.shape === 'circle' ? 'circle' : 'paper' });
  o += inkWords(c, sc.tokens, t, box, { emphasis: d.emphasis, startSize: portrait ? 84 : 86 });
  return o;
}

// ── صورة بملء الشاشة (رمادي دافئ) + كلام كبير ──
export function fullphoto(c, d, t, dur, sc) {
  const img = imgOf(c, d.img); if (!img) return kinetic(c, d, t, dur, sc);
  const { w, h, s, pal, portrait } = c; let o = '';
  const p = clamp01(t / Math.max(1, dur)), e = easeInOutCubic(p), kb = 1.08 + 0.16 * e;
  const ar = img.w / img.h, far = w / h;
  const iw = ar > far ? h * ar : w, ih = ar > far ? h : w / ar;
  const id = uid(c, 'fpg'), gid = uid(c, 'fpv');
  o += `<defs><clipPath id="${id}"><rect width="${w}" height="${h}"/></clipPath><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.15"/><stop offset="0.45" stop-color="#000" stop-opacity="0.1"/><stop offset="1" stop-color="#000" stop-opacity="0.82"/></linearGradient></defs>`;
  o += `<g clip-path="url(#${id})"><g transform="translate(${f1(w / 2 + (c.rtl ? -1 : 1) * (e - 0.5) * 70 * s)} ${f1(h / 2)}) scale(${f2(kb)})"><image href="${img.uriBw || img.uri}" x="${f1(-iw / 2)}" y="${f1(-ih / 2)}" width="${f1(iw)}" height="${f1(ih)}"/></g></g>`;
  o += `<rect width="${w}" height="${h}" fill="url(#${gid})"/>`;
  o += `<rect x="0" y="0" width="${w}" height="${h}" fill="${pal.a1}" opacity="0.07"/>`;
  const fade = ent(t, 0, 0.35).o;
  o += `<g opacity="${f2(fade)}">` + inkWords(c, sc.tokens, t, { x: w * 0.07, y: h * (portrait ? 0.56 : 0.58), w: w * 0.86, h: h * (portrait ? 0.34 : 0.34) }, { emphasis: d.emphasis, onDark: true, color: '#fff', startSize: portrait ? 104 : 100, maxLines: 4 }) + '</g>';
  if (d.caption) { const ce = ent(t, 0.3, 0.5); o += `<g opacity="${f2(ce.o)}"><rect x="${f1(w * 0.07)}" y="${f1(h * 0.07)}" width="${f1(Math.min(w * 0.7, d.caption.length * 30 * s + 60 * s))}" height="${f1(60 * s)}" fill="${pal.mark || pal.a2}"/>${txt(c, d.caption, w * 0.07 + 30 * s, h * 0.07 + 43 * s, 34 * s, { weight: 900, fill: '#16161a', anchor: 'start' })}</g>`; }
  return o;
}

// ── كولاج صور (2-3) + عنوان بهايلايت ──
export function collage(c, d, t, dur, sc) {
  const imgs = (d.imgs || []).map(id => imgOf(c, id)).filter(Boolean);
  if (imgs.length < 2) return kinetic(c, d, t, dur, sc);
  const { w, h, s, pal, portrait } = c; let o = '';
  const slots = portrait
    ? [{ cx: w * 0.34, cy: h * 0.2, fw: w * 0.52, fh: h * 0.2, rot: -5 }, { cx: w * 0.66, cy: h * 0.42, fw: w * 0.52, fh: h * 0.2, rot: 4 }, { cx: w * 0.36, cy: h * 0.63, fw: w * 0.5, fh: h * 0.17, rot: -3 }]
    : [{ cx: w * 0.2, cy: h * 0.34, fw: w * 0.26, fh: h * 0.34, rot: -5 }, { cx: w * 0.5, cy: h * 0.4, fw: w * 0.28, fh: h * 0.38, rot: 3 }, { cx: w * 0.8, cy: h * 0.32, fw: w * 0.26, fh: h * 0.34, rot: -2.5 }];
  imgs.slice(0, 3).forEach((im, i) => { const sl = slots[(imgs.length === 2 && !portrait) ? [0, 2][i] : i]; o += framedImage(c, im, { ...sl, t, dur, at: 0.15 + i * 0.35, tag: `co${sc.index}_${i}` }); });
  if (d.headline) {
    const he = ent(t, 0.15 + imgs.length * 0.35 + 0.2, 0.6), size = (portrait ? 88 : 96) * s;
    const fit = fitText(String(d.headline).toUpperCase(), w * 0.84, h * (portrait ? 0.18 : 0.2), { max: size, min: 40 * s, maxLines: 2, lineGap: 1.1 });
    const y0 = h * (portrait ? 0.84 : 0.8) - (fit.lines.length - 1) * fit.size * 0.55;
    fit.lines.forEach((ln, i) => {
      const tw = Math.min(w * 0.9, ln.length * fit.size * 0.62 + fit.size * 0.8);
      o += `<g opacity="${f2(he.o)}" transform="translate(0 ${f1((1 - Math.min(1, he.p)) * 40 * s)})"><rect x="${f1(w / 2 - tw / 2)}" y="${f1(y0 + i * fit.size * 1.1 - fit.size * 0.85)}" width="${f1(tw * easeOutCubic(seg(t, 0.8, 1.3)))}" height="${f1(fit.size * 1.05)}" fill="${pal.mark || pal.a2}" transform="rotate(-1 ${f1(w / 2)} ${f1(y0)})"/>${txt(c, ln, w / 2, y0 + i * fit.size * 1.1, fit.size, { weight: 900, fill: '#16161a' })}</g>`;
    });
  }
  return o;
}

// ── قصاصة جريدة بعنوان (من الكلام) ──
export function headline(c, d, t, dur, sc) {
  const { w, h, s, pal, portrait } = c; let o = '';
  const e = ent(t, 0.05, 0.6), pw = w * (portrait ? 0.84 : 0.62), ph = h * (portrait ? 0.56 : 0.72), cx = w / 2, cy = h * (portrait ? 0.46 : 0.5);
  o += `<g opacity="${f2(e.o)}" transform="translate(${f1(cx)} ${f1(cy + (1 - Math.min(1, e.p)) * 90 * s)}) rotate(${f1(-2.2 * Math.min(1, e.p))}) scale(${f2(0.85 + 0.15 * Math.min(1.1, e.p))})">`;
  o += `<rect x="${f1(-pw / 2 + 14 * s)}" y="${f1(-ph / 2 + 22 * s)}" width="${f1(pw)}" height="${f1(ph)}" fill="#000" opacity="0.2"/><rect x="${f1(-pw / 2)}" y="${f1(-ph / 2)}" width="${f1(pw)}" height="${f1(ph)}" fill="#f7f3e8" stroke="rgba(0,0,0,0.25)" stroke-width="${f1(2 * s)}"/>`;
  o += `<rect x="${f1(-pw / 2 + 36 * s)}" y="${f1(-ph / 2 + 34 * s)}" width="${f1(pw - 72 * s)}" height="${f1(8 * s)}" fill="#1b1b1b"/><rect x="${f1(-pw / 2 + 36 * s)}" y="${f1(-ph / 2 + 54 * s)}" width="${f1(pw - 72 * s)}" height="${f1(3 * s)}" fill="#1b1b1b"/>`;
  const fit = fitText(d.headline, pw - 90 * s, ph * 0.46, { max: (portrait ? 92 : 96) * s, min: 38 * s, maxLines: 4, lineGap: 1.12 });
  const top = -ph / 2 + 150 * s, total = fit.lines.length * fit.size * 1.12;
  const emphWords = new Set((d.emphasis || []).map(x => String(x).toLowerCase()));
  fit.lines.forEach((ln, i) => {
    const le = ent(t, 0.4 + i * 0.22, 0.5), yy = top + fit.size * 0.9 + i * fit.size * 1.12;
    const hit = [...emphWords].some(wd => wd && ln.toLowerCase().includes(wd));
    if (hit) o += `<rect x="${f1(-pw / 2 + 40 * s)}" y="${f1(yy - fit.size * 0.8)}" width="${f1((pw - 80 * s) * easeOutCubic(seg(t, 0.9 + i * 0.2, 1.4 + i * 0.2)))}" height="${f1(fit.size * 0.98)}" fill="${pal.mark || pal.a2}" opacity="0.85"/>`;
    o += txt(c, ln, 0, yy + (1 - Math.min(1, le.p)) * 20 * s, fit.size, { weight: 900, fill: '#141414', opacity: le.o });
  });
  // أعمدة نص رمادية (ديكور)
  const gy0 = top + total + 40 * s;
  for (let col = 0; col < (portrait ? 2 : 3); col++) {
    const cw = (pw - 100 * s) / (portrait ? 2 : 3) - 14 * s, gx = -pw / 2 + 40 * s + col * (cw + 22 * s);
    for (let r = 0; gy0 + r * 26 * s < ph / 2 - 40 * s; r++) o += `<rect x="${f1(gx)}" y="${f1(gy0 + r * 26 * s)}" width="${f1(cw * (r % 4 === 3 ? 0.6 : 1))}" height="${f1(9 * s)}" fill="#1b1b1b" opacity="${f2(0.13 * ent(t, 0.8 + r * 0.04, 0.4).o)}"/>`;
  }
  o += `<rect x="${f1(-90 * s)}" y="${f1(-ph / 2 - 20 * s)}" width="${f1(180 * s)}" height="${f1(44 * s)}" fill="${pal.mark || pal.a2}" opacity="0.8" transform="rotate(3)"/>`;
  return o + '</g>';
}

export const SCENES_V = { photo, fullphoto, collage, headline };
