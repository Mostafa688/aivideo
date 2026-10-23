// ── scenesA.js ── مشاهد النص: عنوان، نص متحرّك متزامن مع الكلام، كلمة ضخمة، اقتباس، ختام
import { f1, f2, esc, wrapText, textWidth, clamp01, lerp, easeOutCubic, easeOutBack, easeInOutCubic, easeOutExpo, seg, spring, fade, rgba, mix, lighten, darken, uid, txt, fitText, rand, icon } from './design.js';
import { ent, card, pill, glowCircle, gradientDef, layoutWords } from './common.js';
import { object3d, resolveObject } from './objects3d.js';
import { resolveIcon } from './design.js';

// ── عنوان ──
export function title(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = '';
  const cy = h * (portrait ? 0.45 : 0.47);
  o += glowCircle(c, 'tg', w / 2, cy, Math.max(w, h) * 0.42, pal.a1, 0.2 + 0.05 * Math.sin(t * 1.6));
  // أقواس زوايا بترسم نفسها
  const cp = easeOutCubic(seg(t, 0.05, 0.9)), L = 110 * s * cp, m = 64 * s;
  const corner = (x, y, dx, dy) => `<path d="M${f1(x)} ${f1(y + dy * L)} L${f1(x)} ${f1(y)} L${f1(x + dx * L)} ${f1(y)}" fill="none" stroke="${pal.a1}" stroke-width="${f1(7 * s)}" stroke-linecap="round" opacity="0.9"/>`;
  o += corner(m, m, 1, 1) + corner(w - m, m, -1, 1) + corner(m, h - m, 1, -1) + corner(w - m, h - m, -1, -1);
  // حلقة بتلف
  o += `<g transform="rotate(${f1(t * 14)} ${f1(w * (portrait ? 0.82 : 0.84))} ${f1(h * 0.2)})" opacity="0.5"><circle cx="${f1(w * (portrait ? 0.82 : 0.84))}" cy="${f1(h * 0.2)}" r="${f1(150 * s)}" fill="none" stroke="${pal.a2}" stroke-width="${f1(4 * s)}" stroke-dasharray="${f1(30 * s)} ${f1(24 * s)}"/></g>`;
  if (d.kicker) { const e = ent(t, 0.1, 0.5); o += pill(c, w / 2, cy - (portrait ? 360 : 290) * s + (1 - e.p) * 24 * s, d.kicker.toUpperCase(), 30 * s, { opacity: e.o }); }
  const fit = fitText(d.title, w * (portrait ? 0.86 : 0.8), h * (portrait ? 0.36 : 0.34), { max: (portrait ? 138 : 156) * s, min: 52 * s, maxLines: portrait ? 4 : 3, lineGap: 1.16 });
  const total = fit.lines.length * fit.size * 1.16, y0 = cy - total / 2 + fit.size * 0.9;
  fit.lines.forEach((ln, i) => {
    const e = ent(t, 0.25 + i * 0.14, 0.7);
    o += txt(c, ln, w / 2, y0 + i * fit.size * 1.16 + (1 - Math.min(1, e.p)) * 90 * s, fit.size, { weight: 900, glow: pal.a1, opacity: e.o });
  });
  const bw = Math.min(w * 0.34, 480 * s) * easeOutCubic(seg(t, 0.55, 1.1)), by = y0 + total - fit.size * 0.62 + 36 * s;
  o += gradientDef(c, 'tl', pal.a1, pal.a2) + `<rect x="${f1(w / 2 - bw / 2)}" y="${f1(by)}" width="${f1(bw)}" height="${f1(9 * s)}" rx="${f1(4.5 * s)}" fill="url(#${uid(c, 'tl')})"/>`;
  if (d.subtitle) { const e = ent(t, 0.95, 0.6), ss = (portrait ? 46 : 50) * s; wrapText(d.subtitle, w * 0.84, ss, { bold: false, maxLines: 2 }).forEach((ln, i) => { o += txt(c, ln, w / 2, by + 78 * s + i * ss * 1.3 + (1 - e.p) * 20 * s, ss, { weight: 600, fill: pal.muted, opacity: e.o }); }); }
  return o;
}

// ── نص متحرّك متزامن مع الكلام: كل كلمة بتظهر في وقت نطقها ──
export function kinetic(c, d, t, dur, sc) {
  const { w, h, s, pal, portrait, rtl } = c; let o = '';
  const toks = sc.tokens && sc.tokens.length ? sc.tokens : String(d.text || '').split(/\s+/).filter(Boolean).map((x, i, a) => ({ w: x, start: (i / a.length) * dur * 0.9, end: ((i + 1) / a.length) * dur * 0.9 }));
  const words = toks.map(x => ({ text: x.w, start: x.start, end: x.end }));
  const emph = new Set((d.emphasis || []).map(x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  // عنصر بصري متحرك جنب الكلام (شكل 3D أو أيقونة كبيرة بحلقات وحركة) — عشان المشهد ميبقاش نص بس
  const vObj = c.look === 'motion' || c.look === undefined ? resolveObject(d.object) : null, vIcon = !vObj && d.icon ? resolveIcon(d.icon) : null, hasVis = !!(vObj || vIcon);
  const maxW = w * (portrait ? 0.88 : hasVis ? 0.6 : 0.82), maxH = h * (portrait ? (hasVis ? 0.44 : 0.58) : 0.66);
  let size = (portrait ? 140 : 150) * s, lines = [];
  for (; size > 40 * s; size -= 4 * s) { lines = layoutWords(words, size, maxW, sc.mm, rtl); if (lines.length * size * 1.25 <= maxH && lines.length <= (portrait ? (hasVis ? 5 : 7) : 5)) break; }
  const tcx = hasVis && !portrait ? (rtl ? w * 0.62 : w * 0.38) : w / 2;
  const lh = size * 1.25, total = lines.length * lh, y0 = h * (portrait ? (hasVis ? 0.64 : 0.48) : 0.5) - total / 2 + size * 0.95;
  o += glowCircle(c, 'kg', w / 2, h * 0.5, Math.max(w, h) * 0.45, pal.a1, 0.14);
  if (hasVis) o += kineticVisual(c, { obj: vObj, ico: vIcon, cx: portrait ? w / 2 : (rtl ? w * 0.2 : w * 0.8), cy: portrait ? h * 0.25 : h * 0.5, R: portrait ? w * 0.2 : h * 0.24 }, t, dur, sc);
  lines.forEach((ln, li) => {
    const y = y0 + li * lh;
    for (const it of ln.items) {
      const wd = words[it.i], clean = String(wd.text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const st = wd.start - 0.05, e = ent(t, st, 0.42);
      if (t < st - 0.01) continue;
      const active = t >= wd.start - 0.02 && t <= wd.end + 0.12, isE = emph.has(clean);
      const sc2 = 0.78 + 0.22 * Math.min(1.12, e.p) + (active ? 0.05 : 0), dy = (1 - Math.min(1, e.p)) * 38 * s;
      const x = tcx + it.cx, yy = y + dy;
      // الكلمة المهمة: شريط ماركر مصمت بيتمد ورا الكلمة ولون النص متباين معاه (كان لون الكلمة قريب من لون المربع فمكانتش بتتقري)
      const hiCol = pal.emph || pal.a2, hiP = isE ? easeOutCubic(seg(t, st + 0.05, st + 0.4)) : 0;
      if (isE && hiP > 0.01) {
        const bw = (it.width + size * 0.3) * hiP, rtlW = c.rtl !== false && /[\u0600-\u06FF]/.test(wd.text);
        o += `<rect x="${f1(rtlW ? x + it.width / 2 + size * 0.15 - bw : x - it.width / 2 - size * 0.15)}" y="${f1(yy - size * 0.84)}" width="${f1(bw)}" height="${f1(size * 1.08)}" rx="${f1(size * 0.18)}" fill="${hiCol}" opacity="${f2(0.95 * e.o)}" transform="rotate(-1.5 ${f1(x)} ${f1(yy)})"/>`;
      } else if (active) o += `<rect x="${f1(x - it.width / 2 - size * 0.12)}" y="${f1(yy - size * 0.86)}" width="${f1(it.width + size * 0.24)}" height="${f1(size * 1.12)}" rx="${f1(size * 0.2)}" fill="${pal.a1}" opacity="0.24"/>`;
      o += `<g transform="translate(${f1(x)} ${f1(yy)}) scale(${f2(sc2)}) translate(${f1(-x)} ${f1(-yy)})">`
        + txt(c, wd.text, x, yy, size, { weight: 900, fill: isE ? (hiP > 0.5 ? onColor(hiCol) : hiCol) : pal.text, opacity: e.o }) + '</g>';
    }
  });
  return o;
}

// ── كلمة ضخمة (ضربة) ──
export function bigword(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = '';
  const e = ent(t, 0.05, 0.5), slam = t < 0.4 ? 1 + 1.4 * Math.pow(1 - t / 0.4, 2) : 1;
  const shake = t < 0.5 ? Math.sin(t * 90) * 14 * s * (1 - t / 0.5) : 0;
  const word = String(d.word || '').toUpperCase();
  const fit = fitText(word, w * 0.88, h * 0.4, { max: (portrait ? 230 : 260) * s, min: 70 * s, maxLines: 2, lineGap: 1.05 });
  const cy = h * 0.46;
  o += glowCircle(c, 'bwg', w / 2, cy, Math.max(w, h) * 0.5, pal.a2, 0.28);
  const tf = `translate(${f1(w / 2 + shake)} ${f1(cy)}) scale(${f2(slam)}) translate(${f1(-w / 2)} ${f1(-cy)})`;
  o += `<g transform="${tf}" opacity="${f2(Math.min(1, t / 0.12))}">`;
  const total = fit.lines.length * fit.size * 1.05, y0 = cy - total / 2 + fit.size * 0.88;
  fit.lines.forEach((ln, i) => { o += txt(c, ln, w / 2 + 7 * s, y0 + i * fit.size * 1.05 + 7 * s, fit.size, { weight: 900, fill: pal.a1, opacity: 0.8 }) + txt(c, ln, w / 2, y0 + i * fit.size * 1.05, fit.size, { weight: 900, fill: pal.text, glow: pal.a2, glowW: 0.05 }); });
  o += '</g>';
  const bw = w * 0.5 * easeOutCubic(seg(t, 0.3, 0.8));
  o += `<rect x="${f1(w / 2 - bw / 2)}" y="${f1(cy + total / 2 + 40 * s)}" width="${f1(bw)}" height="${f1(12 * s)}" rx="${f1(6 * s)}" fill="${pal.a2}"/>`;
  if (d.sub) { const e2 = ent(t, 0.7, 0.5), ss = (portrait ? 54 : 58) * s; wrapText(d.sub, w * 0.84, ss, { bold: true, maxLines: 2 }).forEach((ln, i) => { o += txt(c, ln, w / 2, cy + total / 2 + 150 * s + i * ss * 1.3 + (1 - e2.p) * 20 * s, ss, { weight: 700, fill: pal.muted, opacity: e2.o }); }); }
  const flash = t < 0.2 ? 0.8 * (1 - t / 0.2) : 0;
  if (flash > 0.01) o += `<rect width="${w}" height="${h}" fill="#fff" opacity="${f2(flash)}"/>`;
  return o;
}

// ── اقتباس ──
export function quote(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = '';
  const e = ent(t, 0.05, 0.6);
  o += glowCircle(c, 'qg', w / 2, h * 0.45, Math.max(w, h) * 0.4, pal.a2, 0.16);
  const fit = fitText(d.text, w * (portrait ? 0.82 : 0.72), h * (portrait ? 0.4 : 0.36), { max: (portrait ? 84 : 88) * s, min: 38 * s, maxLines: portrait ? 7 : 5, lineGap: 1.3, bold: false });
  const total = fit.lines.length * fit.size * 1.3, y0 = h * 0.5 - total / 2 + fit.size * 0.9 + 40 * s;
  const gy = y0 - fit.size * 0.9 - 40 * s + (1 - e.p) * 40 * s;
  o += txt(c, '“', w / 2, gy + 190 * s, 330 * s, { weight: 900, fill: pal.a1, opacity: 0.95 * e.o, rtl: false });
  fit.lines.forEach((ln, i) => { const e2 = ent(t, 0.4 + i * 0.22, 0.6); o += txt(c, ln, w / 2, y0 + i * fit.size * 1.3 + (1 - Math.min(1, e2.p)) * 40 * s, fit.size, { weight: 700, fill: pal.text, opacity: e2.o }); });
  if (d.author) {
    const e3 = ent(t, 0.4 + fit.lines.length * 0.22 + 0.2, 0.6), ay = y0 + fit.lines.length * fit.size * 1.3 + 40 * s;
    o += `<rect x="${f1(w / 2 - 70 * s * e3.x)}" y="${f1(ay - 34 * s)}" width="${f1(140 * s * e3.x)}" height="${f1(5 * s)}" rx="${f1(2.5 * s)}" fill="${pal.a1}"/>` + txt(c, d.author, w / 2, ay + 36 * s, 46 * s, { weight: 700, fill: pal.a1, opacity: e3.o });
  }
  return o;
}

// ── ختام ──
export function outro(c, d, t, dur, sc = {}) {
  const { w, h, s, pal, portrait } = c; let o = '';
  const vObj = resolveObject(d.object), vIcon = !vObj && d.icon ? resolveIcon(d.icon) : null, hasVis = !!(vObj || vIcon);
  if (hasVis) o += kineticVisual(c, { obj: vObj, ico: vIcon, cx: w / 2, cy: h * (portrait ? 0.24 : 0.25), R: Math.min(w, h) * (portrait ? 0.16 : 0.13) }, t, dur, { index: sc.index ?? 99 });
  const cy = h * (portrait ? (hasVis ? 0.52 : 0.42) : (hasVis ? 0.58 : 0.44));
  for (let i = 0; i < 4; i++) {
    const p = ((t * 0.55 + i / 4) % 1), r = (60 + p * Math.min(w, h) * 0.75) * 1;
    o += `<circle cx="${f1(w / 2)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" stroke="${i % 2 ? pal.a2 : pal.a1}" stroke-width="${f1(5 * s)}" opacity="${f2((1 - p) * 0.5)}"/>`;
  }
  const fit = fitText(d.headline, w * (portrait ? 0.88 : 0.8), h * (hasVis ? 0.26 : 0.32), { max: (portrait ? 140 : 160) * s, min: 56 * s, maxLines: 3, lineGap: 1.15 });
  const total = fit.lines.length * fit.size * 1.15, y0 = cy - total / 2 + fit.size * 0.88;
  fit.lines.forEach((ln, i) => { const e = ent(t, 0.02 + i * 0.1, 0.6); o += txt(c, ln, w / 2, y0 + i * fit.size * 1.15 + (1 - Math.min(1, e.p)) * 70 * s, fit.size, { weight: 900, glow: pal.dark ? pal.a1 : null, opacity: e.o }); });
  if (d.sub) { const e = ent(t, 0.45, 0.6); wrapText(d.sub, w * 0.84, 62 * s, { bold: false, maxLines: 2 }).forEach((ln, i) => { o += txt(c, ln, w / 2, y0 + total + 30 * s + i * 80 * s + (1 - e.p) * 20 * s, 62 * s, { weight: 700, fill: pal.muted, opacity: e.o }); }); }
  if (d.cta) {
    const e = ent(t, 0.75, 0.6), pulse = 1 + 0.05 * Math.sin(t * 5), py = y0 + total + (d.sub ? 210 : 130) * s;
    o += `<g transform="translate(${f1(w / 2)} ${f1(py)}) scale(${f2(e.p * pulse)}) translate(${f1(-w / 2)} ${f1(-py)})" opacity="${f2(e.o)}">` + pill(c, w / 2, py, d.cta, 54 * s, { fill: pal.a1, solid: true, padX: 1.2 }) + '</g>';
  }
  return o;
}

// لون نص مقروء فوق لون معيّن (أبيض أو كحلي غامق حسب سطوع اللون)
function onColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#ffffff';
  const n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0f172a' : '#ffffff';
}

// البطل البصري للمشهد: دخول بنطّة، حلقات نبض بتتمدد، حلقة متقطعة بتلف ونقط بتدور حواليه
function kineticVisual(c, { obj, ico, cx, cy, R }, t, dur, sc) {
  const { pal, s } = c; let o = '';
  const p = spring(clamp01((t - 0.05) / 0.7)), id = uid(c, 'kv' + sc.index);
  o += glowCircle(c, id + 'g', cx, cy, R * 1.9, pal.a2, 0.22 * Math.min(1, p));
  for (let k = 0; k < 2; k++) {
    const ph = ((t * 0.7 + k * 0.5) % 1);
    o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R * (1 + ph * 0.75) * p)}" fill="none" stroke="${pal.a1}" stroke-width="${f1(3 * s)}" opacity="${f2((1 - ph) * 0.45 * Math.min(1, p))}"/>`;
  }
  const rot = (t * 28 + sc.index * 40) % 360;
  o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R * 1.22 * p)}" fill="none" stroke="${pal.a2}" stroke-width="${f1(3.5 * s)}" stroke-dasharray="${f1(18 * s)} ${f1(22 * s)}" opacity="${f2(0.55 * Math.min(1, p))}" transform="rotate(${f1(rot)} ${f1(cx)} ${f1(cy)})"/>`;
  for (let k = 0; k < 3; k++) {
    const a = (t * (0.9 + k * 0.25) + k * 2.1) % (Math.PI * 2), rr = R * (1.38 + k * 0.12) * p;
    o += `<circle cx="${f1(cx + Math.cos(a) * rr)}" cy="${f1(cy + Math.sin(a) * rr)}" r="${f1((7 - k * 1.5) * s)}" fill="${[pal.a1, pal.a2, pal.a3 || pal.a1][k]}" opacity="${f2(0.9 * Math.min(1, p))}"/>`;
  }
  if (obj) {
    o += object3d(c, obj, cx, cy, R * 1.55, { t, at: 0.05, rot: -6 });
  } else {
    const gid = uid(c, 'kvb' + sc.index), bob = Math.sin(t * 2.2) * 6 * s;
    o += `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pal.a1}"/><stop offset="1" stop-color="${pal.a2}"/></linearGradient></defs>`;
    o += `<g transform="translate(${f1(cx)} ${f1(cy + bob)}) scale(${f2(p)}) translate(${f1(-cx)} ${f1(-cy)})"><circle cx="${f1(cx)}" cy="${f1(cy + R * 0.06)}" r="${f1(R)}" fill="#000" opacity="0.22"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}" fill="url(#${gid})"/><circle cx="${f1(cx - R * 0.3)}" cy="${f1(cy - R * 0.35)}" r="${f1(R * 0.32)}" fill="#fff" opacity="0.18"/>`
      + icon(c, ico, cx, cy, R * 1.05, { color: '#ffffff', sw: 6 }) + '</g>';
  }
  return o;
}

