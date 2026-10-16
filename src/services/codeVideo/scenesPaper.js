// ── scenesPaper.js ── نسخ الكولاج الورقي لمشاهد الكلام في نمط Vox (عنوان، كلام، كلمة كبيرة، اقتباس، خاتمة):
// بدل نص على خلفية فاضية — ورقة لاصقة/صفحة كشكول/قصاصة متقطعة + ستيكر أيقونة ورق + أسهم وشخبطة بتترسم مع الكلام
import { f1, f2, clamp01, easeOutCubic, seg, txt, fitText, icon, esc } from './design.js';
import { ent } from './common.js';
import { boil, paperCard, tape, handArrow, scribbleLine, starburst, stamp, dashedLoop, toss, paperStrip, typeLines, INK, DISPLAY } from './paper.js';
import { inkWords, inkHeight } from './scenesV.js';

const RED = '#c1121f';
const clean = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const emphTime = (tokens, emphasis, fb) => { const want = new Set((emphasis || []).map(clean).filter(Boolean)); const hit = (tokens || []).find(x => want.has(clean(x.w))); return hit ? hit.start : fb; };

/** ستيكر أيقونة ورق (دايرة مقصوصة بحافة بيضا) */
function iconSticker(c, name, { cx, cy, r, t, at, seed, color = '#2f5ea8' }) {
  if (!name) return '';
  const { s } = c, tz = toss(t, at, { from: 'right', dist: 380, s, dur: 0.45 });
  if (!tz.o) return '';
  const bo = boil(t, seed, 1.3 * s);
  return `<g transform="translate(${f1(cx + tz.dx + bo.dx)} ${f1(cy + tz.dy + bo.dy)}) rotate(${f1(6 + tz.rot)})">`
    + `<circle r="${f1(r + 16 * s)}" fill="#000" opacity="0.26" transform="translate(${f1(8 * s)} ${f1(13 * s)})"/><circle r="${f1(r + 16 * s)}" fill="#fbf8f0"/><circle r="${f1(r)}" fill="${color}"/>`
    + icon(c, name, 0, 0, r * 1.2, { color: '#ffffff', sw: 6 }) + tape(c, 0, -r - 10 * s, 110 * s, -5, seed + 1) + '</g>';
}

// ── كلام: 3 أشكال بالتبادل (ورقة لاصقة صفرا / صفحة كشكول / قصاصة) + أيقونة + سهم وشخبطة وقت الكلمة المهمة ──
export function pKinetic(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c; let o = '';
  const v = sc.index % 3, seed = sc.index * 3.3 + 1;
  const hasIcon = !!d.icon;
  const cw = portrait ? w * 0.84 : w * (hasIcon ? 0.56 : 0.66), cx = portrait ? w / 2 : (hasIcon ? w * 0.4 : w / 2);
  const box0 = { x: cx - cw / 2 + 50 * s, y: portrait ? h * 0.36 : h * 0.2, w: cw - 100 * s, h: portrait ? h * 0.42 : h * 0.6 };
  const hh = inkHeight(c, sc.tokens, box0, { startSize: portrait ? 96 : 100 });
  const box = { ...box0, y: box0.y + (box0.h - hh) / 2, h: hh };
  const pad = 56 * s, card = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  const tz = toss(t, 0.02, { from: v === 1 ? 'left' : 'bottom', dist: 480, s, dur: 0.5 }), bo = boil(t, seed, 1.2 * s);
  const rot = [-2.2, 1.6, -1][v];
  o += `<g transform="translate(${f1(tz.dx + bo.dx)} ${f1(tz.dy + bo.dy)}) rotate(${f1(rot + tz.rot * 0.4)} ${f1(card.x + card.w / 2)} ${f1(card.y + card.h / 2)})">`;
  if (v === 0) { // ورقة لاصقة صفرا
    o += `<rect x="${f1(card.x + 10 * s)}" y="${f1(card.y + 16 * s)}" width="${f1(card.w)}" height="${f1(card.h)}" fill="#000" opacity="0.22"/><rect x="${f1(card.x)}" y="${f1(card.y)}" width="${f1(card.w)}" height="${f1(card.h)}" fill="#f7d354"/><path d="M${f1(card.x + card.w)} ${f1(card.y + card.h - 60 * s)}l${f1(-60 * s)} ${f1(60 * s)}h${f1(60 * s)}z" fill="#d9b23a"/>`;
    o += tape(c, card.x + card.w / 2, card.y + 2 * s, 170 * s, -4, seed);
  } else if (v === 1) { // صفحة كشكول بسطور وهامش أحمر
    o += paperCard(c, { x: card.x, y: card.y, w: card.w, h: card.h, seed, fill: '#fbfaf4', jag: 4 });
    let ln = ''; for (let y = card.y + 44 * s; y < card.y + card.h - 10 * s; y += 44 * s) ln += `M${f1(card.x + 8 * s)} ${f1(y)}H${f1(card.x + card.w - 8 * s)}`;
    const mx = c.rtl ? card.x + card.w - 40 * s : card.x + 40 * s;
    o += `<path d="${ln}" stroke="#7aa3c8" stroke-width="${f1(1.6 * s)}" opacity="0.45"/><path d="M${f1(mx)} ${f1(card.y)}V${f1(card.y + card.h)}" stroke="#d65a5a" stroke-width="${f1(2.4 * s)}" opacity="0.7"/>`;
    for (let i = 0; i < 3; i++) o += `<circle cx="${f1(c.rtl ? card.x + card.w - 18 * s : card.x + 18 * s)}" cy="${f1(card.y + card.h * (0.2 + i * 0.3))}" r="${f1(9 * s)}" fill="#e7dcc0"/>`;
  } else { // قصاصة ورق متقطعة
    o += paperCard(c, { x: card.x, y: card.y, w: card.w, h: card.h, seed, fill: '#efe7d3', jag: 13 });
    o += tape(c, card.x + 30 * s, card.y + 8 * s, 120 * s, -35, seed) + tape(c, card.x + card.w - 30 * s, card.y + card.h - 8 * s, 120 * s, -35, seed + 2);
  }
  o += inkWords(c, sc.tokens, t, box, { emphasis: d.emphasis, color: INK, startSize: portrait ? 96 : 100 });
  o += '</g>';
  const te = emphTime(sc.tokens, d.emphasis, null);
  if (te != null) {
    const p = easeOutCubic(seg(t, te, te + 0.55));
    o += scribbleLine(c, { x1: card.x + card.w * 0.15, x2: card.x + card.w * 0.85, y: card.y + card.h + 26 * s, p, seed, color: RED, width: 7 });
  }
  if (hasIcon) {
    const ix = portrait ? w * 0.74 : w * 0.82, iy = portrait ? h * 0.2 : h * 0.42, r = (portrait ? 110 : 120) * s;
    o += iconSticker(c, d.icon, { cx: ix, cy: iy, r, t, at: 0.35, seed: seed + 4, color: c.pal.a3 || '#2f5ea8' });
    o += handArrow(c, { x1: ix - (portrait ? 0 : r * 1.1), y1: iy + (portrait ? r * 1.25 : r * 0.6), x2: portrait ? w * 0.62 : card.x + card.w + 10 * s, y2: portrait ? card.y - 10 * s : iy + r * 0.9, bend: 0.3, p: easeOutCubic(seg(t, 0.75, 1.25)), seed });
  } else if (v !== 0) {
    o += dashedLoop(c, { cx: portrait ? w * 0.82 : w * 0.88, cy: portrait ? h * 0.24 : h * 0.22, r: 70 * s, p: easeOutCubic(seg(t, 0.6, 1.2)), t: t * 0.5 });
  }
  return o;
}

// ── عنوان: كارت ورق كبير متقطع + كلمة صغيرة على شريط أحمر + عنوان فرعي بآلة كاتبة + قصاصات حواليه ──
export function pTitle(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c; let o = '';
  const seed = 11 + (sc?.index || 0);
  const cw = w * (portrait ? 0.86 : 0.7), ch = h * (portrait ? 0.34 : 0.5), cx = w / 2, cy = h * (portrait ? 0.45 : 0.48);
  for (let i = 0; i < 3; i++) { const px = [0.12, 0.86, 0.2][i] * w, py = [0.2, 0.78, 0.84][i] * h, e = toss(t, 0.1 + i * 0.12, { from: i % 2 ? 'right' : 'left', dist: 400, s, dur: 0.45 }); if (e.o) o += `<g transform="translate(${f1(e.dx)} ${f1(e.dy)}) rotate(${f1(-10 + i * 12)} ${f1(px)} ${f1(py)})">` + paperStrip(c, { x: px - 120 * s, y: py - 50 * s, w: 240 * s, h: 100 * s, seed: seed + i, fill: ['#2f5ea8', '#e5762c', '#f0b43c'][i], rot: 0 }) + '</g>'; }
  const tz = toss(t, 0.05, { from: 'bottom', dist: 560, s, dur: 0.55 }), bo = boil(t, seed, 1.4 * s);
  o += `<g transform="translate(${f1(tz.dx + bo.dx)} ${f1(tz.dy + bo.dy)}) rotate(${f1(-1.5 + tz.rot * 0.4)} ${f1(cx)} ${f1(cy)})">`;
  o += paperCard(c, { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, seed, fill: '#f6f1e4', jag: 10 });
  const fit = fitText(d.title || '', cw - 120 * s, ch * 0.62, { max: (portrait ? 120 : 130) * s, min: 44 * s, maxLines: 3, lineGap: 1.1 });
  const top = cy - (fit.lines.length * fit.size * 1.1) / 2 + fit.size * 0.82 - (d.subtitle ? 24 * s : 0);
  fit.lines.forEach((ln, i) => { const le = ent(t, 0.35 + i * 0.15, 0.4); o += txt(c, ln, cx, top + i * fit.size * 1.1, fit.size, { weight: 900, fill: INK, opacity: le.o }); });
  o += tape(c, cx - cw * 0.38, cy - ch / 2 + 4 * s, 150 * s, -30, seed) + tape(c, cx + cw * 0.38, cy - ch / 2 + 4 * s, 150 * s, 30, seed + 1);
  if (d.subtitle) {
    const sy = top + fit.lines.length * fit.size * 1.1 + 6 * s;
    o += c.rtl ? txt(c, d.subtitle, cx, sy, 40 * s, { weight: 700, fill: '#5f594b', opacity: ent(t, 0.9, 0.4).o }) : typeLines(c, [d.subtitle], cx - Math.min(cw * 0.45, d.subtitle.length * 13 * s), sy, 34 * s, t, 0.9, 30, '#4b4435');
  }
  o += '</g>';
  if (d.kicker) o += stamp(c, { text: d.kicker, cx, cy: cy - ch / 2 - 40 * s, size: 46 * s, rot: -4, color: RED, p: seg(t, 0.6, 0.85) });
  return o;
}

// ── كلمة كبيرة: الكلمة بتنزل ضخمة مضغوطة على شريط ورق + نجمة انفجار + سطر صغير على شريط لاصق ──
export function pBigword(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c; let o = '';
  const word = String(d.word || ''), disp = c.rtl ? word : word.toUpperCase(), seed = (sc?.index || 0) * 2 + 5;
  const size = Math.min((portrait ? 230 : 260) * s, (w * 0.82) / Math.max(2, [...disp].length * (c.rtl ? 0.62 : 0.5)));
  const k = clamp01(seg(t, 0.15, 0.4)), sc2 = 1 + (1 - easeOutCubic(k)) * 0.8, cx = w / 2, cy = h * 0.47;
  o += starburst(c, { cx: cx + (portrait ? w * 0.28 : w * 0.3), cy: cy - size * 0.75, r: 120 * s, color: '#e85d5d', p: seg(t, 0.3, 0.6), rot: 0.4 });
  if (k > 0) {
    const ww = Math.min(w * 0.94, [...disp].length * size * (c.rtl ? 0.62 : 0.44) + size * 0.8), wh = size * 1.3;
    o += `<g opacity="${f2(Math.min(1, k * 2))}" transform="translate(${f1(cx)} ${f1(cy)}) scale(${f2(sc2)}) rotate(-2)">` + paperStrip(c, { x: -ww / 2, y: -size * 0.98, w: ww, h: wh, seed, rot: 0 })
      + (c.rtl ? txt(c, word, 0, 0, size * 0.8, { weight: 700, fill: INK }) : `<text x="0" y="0" font-family="${DISPLAY}" font-size="${f1(size)}" font-weight="900" fill="${INK}" text-anchor="middle" transform="scale(0.8 1)">${esc(disp)}</text>`) + '</g>';
  }
  if (d.sub) { const e = toss(t, 0.7, { from: 'bottom', dist: 200, s, dur: 0.4 }); if (e.o) { const sz = 46 * s, sw = Math.min(w * 0.86, [...d.sub].length * sz * 0.55 + sz); o += `<g transform="translate(${f1(e.dx)} ${f1(e.dy)})">` + paperStrip(c, { x: cx - sw / 2, y: cy + size * 0.55, w: sw, h: sz * 1.6, seed: seed + 1, rot: 1.5, fill: '#f7d354' }) + txt(c, d.sub, cx, cy + size * 0.55 + sz * 1.1, sz, { weight: 800, fill: INK }) + '</g>'; } }
  return o;
}

// ── اقتباس: كارت ملاحظة بعلامات تنصيص حمرا كبيرة + اسم القائل على شريط ──
export function pQuote(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c; let o = '';
  const seed = (sc?.index || 0) * 5 + 2, cw = w * (portrait ? 0.86 : 0.66), ch = h * (portrait ? 0.42 : 0.6), cx = w / 2, cy = h * 0.47;
  const tz = toss(t, 0.05, { from: 'left', dist: 500, s, dur: 0.5 }), bo = boil(t, seed, 1.2 * s);
  o += `<g transform="translate(${f1(tz.dx + bo.dx)} ${f1(tz.dy + bo.dy)}) rotate(${f1(1.5 + tz.rot * 0.4)} ${f1(cx)} ${f1(cy)})">` + paperCard(c, { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, seed, fill: '#f6f1e4', jag: 8 });
  o += `<text x="${f1(cx - cw / 2 + 50 * s)}" y="${f1(cy - ch / 2 + 150 * s)}" font-family="${DISPLAY}" font-size="${f1(200 * s)}" font-weight="900" fill="${RED}" opacity="0.85">“</text>`;
  const fit = fitText(d.text || '', cw - 160 * s, ch * 0.6, { max: (portrait ? 72 : 76) * s, min: 34 * s, maxLines: 6, lineGap: 1.2 });
  const top = cy - (fit.lines.length * fit.size * 1.2) / 2 + fit.size * 0.85;
  fit.lines.forEach((ln, i) => { const le = ent(t, 0.3 + i * 0.18, 0.4); o += txt(c, ln, cx, top + i * fit.size * 1.2, fit.size, { weight: 800, fill: INK, opacity: le.o }); });
  o += tape(c, cx, cy - ch / 2 + 2 * s, 170 * s, 3, seed) + '</g>';
  if (d.author) { const e = toss(t, 0.9, { from: 'bottom', dist: 200, s, dur: 0.4 }); if (e.o) { const sz = 44 * s, aw = [...d.author].length * sz * 0.58 + sz * 1.6; o += `<g transform="translate(${f1(e.dx)} ${f1(e.dy)})">` + paperStrip(c, { x: cx + cw * 0.42 - aw, y: cy + ch / 2 - 10 * s, w: aw, h: sz * 1.6, seed: seed + 1, rot: -2 }) + txt(c, `— ${d.author}`, cx + cw * 0.42 - aw / 2, cy + ch / 2 - 10 * s + sz * 1.1, sz, { weight: 800, fill: INK }) + '</g>'; } }
  return o;
}

// ── خاتمة: كارت متقطع بالعنوان + سطر + زرار المتابعة كختم أحمر ──
export function pOutro(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c; let o = '';
  const seed = 31, cw = w * (portrait ? 0.86 : 0.64), ch = h * (portrait ? 0.32 : 0.46), cx = w / 2, cy = h * 0.44;
  const tz = toss(t, 0.05, { from: 'top', dist: 520, s, dur: 0.5 }), bo = boil(t, seed, 1.3 * s);
  o += `<g transform="translate(${f1(tz.dx + bo.dx)} ${f1(tz.dy + bo.dy)}) rotate(${f1(-1.2 + tz.rot * 0.4)} ${f1(cx)} ${f1(cy)})">` + paperCard(c, { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch, seed, fill: '#f6f1e4', jag: 11 });
  const fit = fitText(d.headline || '', cw - 120 * s, ch * 0.55, { max: (portrait ? 100 : 104) * s, min: 40 * s, maxLines: 3, lineGap: 1.1 });
  const top = cy - (fit.lines.length * fit.size * 1.1) / 2 + fit.size * 0.8 - (d.sub ? 22 * s : 0);
  fit.lines.forEach((ln, i) => { o += txt(c, ln, cx, top + i * fit.size * 1.1, fit.size, { weight: 900, fill: INK, opacity: ent(t, 0.3 + i * 0.15, 0.4).o }); });
  if (d.sub) o += txt(c, d.sub, cx, top + fit.lines.length * fit.size * 1.1 + 10 * s, 40 * s, { weight: 700, fill: '#5f594b', opacity: ent(t, 0.8, 0.4).o });
  o += tape(c, cx - cw * 0.4, cy - ch / 2 + 4 * s, 140 * s, -28, seed) + tape(c, cx + cw * 0.4, cy - ch / 2 + 4 * s, 140 * s, 28, seed + 1) + '</g>';
  if (d.cta) o += stamp(c, { text: d.cta, cx, cy: cy + ch / 2 + 90 * s, size: 54 * s, rot: -6, color: RED, p: seg(t, 1.0, 1.25) });
  o += dashedLoop(c, { cx: portrait ? w * 0.18 : w * 0.12, cy: portrait ? h * 0.78 : h * 0.8, r: 70 * s, p: easeOutCubic(seg(t, 0.8, 1.4)), t: t * 0.5 });
  return o;
}

/** النوع الأصلي → نسخته الورقية (بتستخدم في نمط Vox بس) */
export const PAPER_TEXT = { title: pTitle, kinetic: pKinetic, bigword: pBigword, quote: pQuote, outro: pOutro };
