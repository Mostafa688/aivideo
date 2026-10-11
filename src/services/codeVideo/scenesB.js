// ── scenesB.js ── مشاهد البيانات والرسوم: رقم، أعمدة، دونات، خط، قائمة، مقارنة، خط زمني، أيقونات، خطوات، شبكة أرقام، كرة أرضية، شبكة
import { f1, f2, esc, wrapText, textWidth, clamp01, lerp, easeOutCubic, easeOutBack, easeInOutCubic, easeOutExpo, seg, spring, rgba, mix, lighten, darken, uid, txt, fitText, rand, icon, resolveIcon } from './design.js';
import { ent, card, pill, glowCircle, gradientDef, sceneTitle, num, decimalsOf } from './common.js';

const polar = (cx, cy, r, a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
const arcPath = (cx, cy, r, a0, a1) => {
  const [x0, y0] = polar(cx, cy, r, a0), [x1, y1] = polar(cx, cy, r, a1);
  return `M${f1(x0)} ${f1(y0)} A${f1(r)} ${f1(r)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`;
};
const colorsOf = (c) => [c.pal.a1, c.pal.a2, c.pal.a3, mix(c.pal.a1, c.pal.a2, 0.5), lighten(c.pal.a1, 0.35), lighten(c.pal.a2, 0.35)];
const areaTop = (c, d) => c.h * (d.title ? (c.portrait ? 0.25 : 0.27) : (c.portrait ? 0.17 : 0.14));

// ── رقم واحد ضخم ──
export function stat(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = '';
  const val = Number(d.value), dec = decimalsOf(d.value);
  const p = easeOutExpo(seg(t, 0.2, 1.9)), cur = val * p;
  const text = `${d.prefix || ''}${num(cur, dec)}${d.suffix || ''}`;
  const isPct = /%/.test(d.suffix || '') && val <= 100;
  const cy = h * (portrait ? 0.38 : 0.41);
  o += glowCircle(c, 'sg', w / 2, cy, Math.max(w, h) * 0.4, pal.a1, 0.2);
  const RR = Math.min(w, h) * (portrait ? 0.28 : 0.25);
  if (d.icon) { const e = ent(t, 0.05, 0.5); o += icon(c, d.icon, w / 2, isPct ? cy - RR * 0.58 : cy - 230 * s, isPct ? RR * 0.3 : 90 * s, { color: pal.a2, opacity: e.o, sw: 5 }); }
  if (isPct) {
    const R = RR, sw = 34 * s, C = 2 * Math.PI * R;
    o += `<circle cx="${f1(w / 2)}" cy="${f1(cy)}" r="${f1(R)}" fill="none" stroke="${pal.muted}" stroke-opacity="0.22" stroke-width="${f1(sw)}"/>`;
    o += gradientDef(c, 'sring', pal.a1, pal.a2, { x1: 0, y1: 0, x2: 1, y2: 1 });
    o += `<circle cx="${f1(w / 2)}" cy="${f1(cy)}" r="${f1(R)}" fill="none" stroke="url(#${uid(c, 'sring')})" stroke-width="${f1(sw)}" stroke-linecap="round" stroke-dasharray="${f1(C)}" stroke-dashoffset="${f1(C * (1 - (cur / 100)))}" transform="rotate(-90 ${f1(w / 2)} ${f1(cy)})"/>`;
    const size = Math.min(R * 1.25, (R * 1.5) / Math.max(2.4, text.length * 0.62)) * 1.0;
    o += txt(c, text, w / 2, cy + size * 0.36 + (d.icon ? R * 0.16 : 0), size, { weight: 900, glow: pal.a1, rtl: false });
  } else {
    const size = Math.min((portrait ? 250 : 270) * s, (w * 0.9) / Math.max(2.2, text.length * 0.64));
    const e = ent(t, 0.1, 0.5);
    o += txt(c, text, w / 2, cy + size * 0.36, size, { weight: 900, glow: pal.a1, opacity: e.o, rtl: false });
    const bw = Math.min(w * 0.5, 620 * s) * easeOutCubic(seg(t, 0.4, 1.4));
    o += gradientDef(c, 'sbar', pal.a1, pal.a2) + `<rect x="${f1(w / 2 - bw / 2)}" y="${f1(cy + size * 0.36 + 44 * s)}" width="${f1(bw)}" height="${f1(12 * s)}" rx="${f1(6 * s)}" fill="url(#${uid(c, 'sbar')})"/>`;
    // انفجار حلقة عند وصول الرقم
    const b = seg(t, 1.8, 2.5);
    if (b > 0 && b < 1) o += `<circle cx="${f1(w / 2)}" cy="${f1(cy)}" r="${f1(60 * s + b * Math.min(w, h) * 0.5)}" fill="none" stroke="${pal.a2}" stroke-width="${f1(8 * s * (1 - b))}" opacity="${f2(1 - b)}"/>`;
  }
  if (d.label) {
    const fit = fitText(d.label, w * 0.84, h * 0.2, { max: (portrait ? 64 : 66) * s, min: 34 * s, maxLines: 3, lineGap: 1.25, bold: false });
    const e = ent(t, 0.9, 0.6), ly = isPct ? cy + RR + 118 * s : h * (portrait ? 0.69 : 0.73);
    fit.lines.forEach((ln, i) => { o += txt(c, ln, w / 2, ly + i * fit.size * 1.25 + (1 - e.p) * 24 * s, fit.size, { weight: 700, fill: pal.text, opacity: e.o }); });
  }
  if (d.sub) { const e = ent(t, 1.3, 0.6); o += txt(c, d.sub, w / 2, h * (portrait ? 0.82 : 0.86), 40 * s, { weight: 600, fill: pal.muted, opacity: e.o }); }
  return o;
}

// ── أعمدة أفقية ──
export function bars(c, d, t, dur) {
  const { w, h, s, pal, portrait, rtl } = c; let o = sceneTitle(c, d.title, t);
  const items = d.items.slice(0, 6), n = items.length, max = Math.max(...items.map(i => i.value)) || 1;
  const yT = areaTop(c, d), yB = h * 0.9, rowH = Math.min((yB - yT) / n, 190 * s);
  const total = rowH * n, y0 = yT + ((yB - yT) - total) / 2;
  const mx = w * 0.08, barMax = w - mx * 2 - (portrait ? 150 : 210) * s, labSize = Math.min(48 * s, rowH * 0.3), barH = Math.min(rowH * 0.36, 64 * s);
  const cols = colorsOf(c);
  items.forEach((it, i) => {
    const e = ent(t, 0.25 + i * 0.18, 0.55), grow = easeOutCubic(seg(t, 0.35 + i * 0.18, 1.3 + i * 0.18));
    const y = y0 + i * rowH + (1 - Math.min(1, e.p)) * 30 * s, isMax = it.value === max;
    const lab = wrapText(it.label, w * 0.8, labSize, { maxLines: 1 })[0];
    const x0 = rtl ? w - mx : mx, dir = rtl ? -1 : 1, bl = barMax * (it.value / max) * grow;
    o += txt(c, lab, x0, y + labSize, labSize, { weight: 700, fill: pal.text, anchor: rtl ? 'end' : 'start', opacity: e.o });
    const by = y + labSize + 14 * s;
    o += `<rect x="${f1(rtl ? x0 - barMax : x0)}" y="${f1(by)}" width="${f1(barMax)}" height="${f1(barH)}" rx="${f1(barH / 2)}" fill="${pal.muted}" opacity="0.14"/>`;
    const bx = rtl ? x0 - bl : x0;
    o += `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(Math.max(2, bl))}" height="${f1(barH)}" rx="${f1(barH / 2)}" fill="${isMax ? pal.a2 : pal.a1}" opacity="${f2(e.o)}"/>`;
    o += `<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(Math.max(2, bl))}" height="${f1(barH * 0.38)}" rx="${f1(barH * 0.19)}" fill="#fff" opacity="0.2"/>`;
    const vtxt = `${d.prefix || ''}${num(it.value * grow, decimalsOf(it.value))}${d.unit || ''}`;
    o += txt(c, vtxt, rtl ? bx - 16 * s : bx + bl + 16 * s, by + barH * 0.5 + 15 * s, Math.min(46 * s, barH * 0.85), { weight: 800, fill: isMax ? pal.a2 : pal.text, anchor: rtl ? 'end' : 'start', opacity: e.o, rtl: false });
  });
  return o;
}

// ── دونات ──
export function donut(c, d, t, dur) {
  const { w, h, s, pal, portrait, rtl } = c; let o = sceneTitle(c, d.title, t);
  const items = d.items.slice(0, 5), sum = items.reduce((a, b) => a + b.value, 0) || 1, cols = colorsOf(c);
  const R = Math.min(w, h) * (portrait ? 0.2 : 0.25), cx = portrait ? w / 2 : w * (rtl ? 0.7 : 0.3), cy = portrait ? h * 0.4 : h * 0.55, sw = R * 0.42;
  const prog = easeOutCubic(seg(t, 0.25, 1.9));
  o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}" fill="none" stroke="${pal.muted}" stroke-opacity="0.15" stroke-width="${f1(sw)}"/>`;
  let a = -Math.PI / 2; const gap = 0.02;
  items.forEach((it, i) => {
    const span = (it.value / sum) * Math.PI * 2, startA = a, endA = a + span;
    const vis = clamp01((prog * Math.PI * 2 - (startA + Math.PI / 2)) / Math.max(1e-6, span));
    if (vis > 0) o += `<path d="${arcPath(cx, cy, R, startA + gap, startA + gap + Math.max(0.001, (span - gap * 2) * vis))}" fill="none" stroke="${cols[i]}" stroke-width="${f1(sw)}" stroke-linecap="butt"/>`;
    a = endA;
  });
  const big = items.reduce((m, it) => (it.value > m.value ? it : m), items[0]);
  const pct = Math.round((big.value / sum) * 100 * prog);
  o += txt(c, `${pct}%`, cx, cy + R * 0.18, R * 0.62, { weight: 900, glow: pal.a1, rtl: false });
  o += txt(c, wrapText(big.label, R * 1.4, R * 0.2, { maxLines: 1 })[0], cx, cy + R * 0.5, R * 0.2, { weight: 600, fill: pal.muted });
  // وسيلة إيضاح
  const lx = portrait ? w * 0.12 : w * (rtl ? 0.08 : 0.55), ly0 = portrait ? h * 0.62 : h * 0.34, rowH = Math.min((portrait ? 120 : 130) * s, (h * 0.9 - ly0) / items.length);
  items.forEach((it, i) => {
    const e = ent(t, 0.6 + i * 0.16, 0.5), y = ly0 + i * rowH, lw = portrait ? w * 0.76 : w * 0.37;
    const right = rtl ? lx + lw : lx;
    o += `<g opacity="${f2(e.o)}" transform="translate(${f1((1 - Math.min(1, e.p)) * 50 * s * (rtl ? -1 : 1))} 0)"><rect x="${f1(right - (rtl ? 22 * s : 0))}" y="${f1(y + 4 * s)}" width="${f1(22 * s)}" height="${f1(22 * s)}" rx="${f1(7 * s)}" fill="${cols[i]}"/>`
      + txt(c, wrapText(it.label, lw - 120 * s, 44 * s, { maxLines: 1 })[0], rtl ? right - 40 * s : right + 40 * s, y + 25 * s, 44 * s, { weight: 700, anchor: rtl ? 'end' : 'start' })
      + txt(c, `${Math.round((it.value / sum) * 100)}%`, rtl ? lx : lx + lw, y + 25 * s, 44 * s, { weight: 800, fill: cols[i], anchor: rtl ? 'start' : 'end', rtl: false }) + '</g>';
  });
  return o;
}

// ── خط بياني ──
export function line(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = sceneTitle(c, d.title, t);
  const pts = d.points.slice(0, 8), n = pts.length, vals = pts.map(p => p.value);
  const mn = Math.min(...vals), mxv = Math.max(...vals), lo = Math.min(0, mn), span = (mxv - lo) || 1;
  const x0 = w * 0.1, x1 = w * 0.9, yT = areaTop(c, d) + 60 * s, yB = h * (portrait ? 0.72 : 0.78);
  const X = (i) => x0 + ((x1 - x0) * i) / Math.max(1, n - 1), Y = (v) => yB - ((v - lo) / span) * (yB - yT);
  for (let k = 0; k <= 4; k++) { const y = yT + ((yB - yT) * k) / 4; o += `<line x1="${f1(x0 - 20 * s)}" y1="${f1(y)}" x2="${f1(x1 + 20 * s)}" y2="${f1(y)}" stroke="${pal.muted}" stroke-opacity="0.18" stroke-width="${f1(2 * s)}"/>`; }
  const prog = easeInOutCubic(seg(t, 0.3, 2.0)), cw = (x1 - x0 + 60 * s) * prog;
  let path = '', area = '';
  pts.forEach((p, i) => { path += `${i ? ' L' : 'M'}${f1(X(i))} ${f1(Y(p.value))}`; });
  area = `${path} L${f1(X(n - 1))} ${f1(yB)} L${f1(X(0))} ${f1(yB)} Z`;
  const cid = uid(c, 'lc'), gid = uid(c, 'lg');
  o += `<defs><clipPath id="${cid}"><rect x="${f1(x0 - 40 * s)}" y="0" width="${f1(cw)}" height="${c.h}"/></clipPath><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.a1}" stop-opacity="0.42"/><stop offset="1" stop-color="${pal.a1}" stop-opacity="0"/></linearGradient></defs>`;
  o += `<g clip-path="url(#${cid})"><path d="${area}" fill="url(#${gid})"/><path d="${path}" fill="none" stroke="${pal.a1}" stroke-width="${f1(11 * s)}" stroke-linecap="round" stroke-linejoin="round"/><path d="${path}" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="${f1(3 * s)}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  pts.forEach((p, i) => {
    const reach = (X(i) - (x0 - 40 * s)) / (x1 - x0 + 60 * s), e = ent(t, 0.3 + 1.7 * Math.max(0, reach) - 0.05, 0.5);
    if (prog < reach - 0.001) return;
    const last = i === n - 1;
    o += `<circle cx="${f1(X(i))}" cy="${f1(Y(p.value))}" r="${f1((last ? 20 : 14) * s * Math.min(1.2, e.p))}" fill="${last ? pal.a2 : pal.bg[0]}" stroke="${last ? '#fff' : pal.a1}" stroke-width="${f1(6 * s)}"/>`;
    if (n <= 6 || last) o += txt(c, `${d.prefix || ''}${num(p.value, decimalsOf(p.value))}${d.unit || ''}`, X(i), Y(p.value) - 34 * s, 42 * s, { weight: 800, fill: last ? pal.a2 : pal.text, opacity: e.o, rtl: false });
    const lab = wrapText(p.label, (x1 - x0) / Math.max(1, n - 1) * 0.95, 34 * s, { maxLines: 2 });
    lab.forEach((ln, k) => { o += txt(c, ln, X(i), yB + 56 * s + k * 38 * s, 34 * s, { weight: 600, fill: pal.muted, opacity: e.o }); });
  });
  return o;
}

// ── قائمة ──
export function list(c, d, t, dur) {
  const { w, h, s, pal, portrait, rtl } = c; let o = sceneTitle(c, d.title, t);
  const items = d.items.slice(0, 5), n = items.length;
  const yT = areaTop(c, d), yB = h * 0.9, gap = 26 * s, rowH = Math.min((yB - yT - gap * (n - 1)) / n, 200 * s);
  const total = rowH * n + gap * (n - 1), y0 = yT + ((yB - yT) - total) / 2, cw = w * (portrait ? 0.86 : 0.74), cx0 = (w - cw) / 2;
  const cols = colorsOf(c);
  items.forEach((it, i) => {
    const at = 0.3 + i * Math.min(0.55, (dur * 0.5) / n), e = ent(t, at, 0.6), y = y0 + i * (rowH + gap), dx = (1 - Math.min(1, e.p)) * w * 0.35 * (rtl ? 1 : -1);
    o += `<g transform="translate(${f1(dx)} 0)" opacity="${f2(e.o)}">` + card(c, cx0, y, cw, rowH, { r: 34, accent: cols[i % cols.length] });
    const br = rowH * 0.3, bx = rtl ? cx0 + cw - rowH * 0.62 : cx0 + rowH * 0.62;
    o += `<circle cx="${f1(bx)}" cy="${f1(y + rowH / 2)}" r="${f1(br)}" fill="${cols[i % cols.length]}"/>`;
    if (it.icon) o += icon(c, it.icon, bx, y + rowH / 2, br * 1.15, { color: c.pal.dark ? '#06070f' : '#fff', sw: 7 });
    else o += txt(c, String(i + 1), bx, y + rowH / 2 + br * 0.36, br * 1.05, { weight: 900, fill: c.pal.dark ? '#06070f' : '#fff', rtl: false });
    const tx0 = rtl ? cx0 + cw - rowH * 1.1 : cx0 + rowH * 1.1, tw = cw - rowH * 1.35;
    const fit = fitText(it.text, tw, rowH * 0.78, { max: 56 * s, min: 28 * s, maxLines: 2, lineGap: 1.2, bold: true });
    const th = fit.lines.length * fit.size * 1.2, ty = y + rowH / 2 - th / 2 + fit.size * 0.9;
    fit.lines.forEach((ln, k) => { o += txt(c, ln, tx0, ty + k * fit.size * 1.2, fit.size, { weight: 800, anchor: rtl ? 'end' : 'start' }); });
    o += '</g>';
  });
  return o;
}

// ── مقارنة ──
export function compare(c, d, t, dur) {
  const { w, h, s, pal, portrait, rtl } = c; let o = sceneTitle(c, d.title, t);
  const L = typeof d.left === 'string' ? { title: d.left, points: [] } : d.left, Rr = typeof d.right === 'string' ? { title: d.right, points: [] } : d.right;
  const yT = areaTop(c, d), yB = h * 0.9;
  const pw = portrait ? w * 0.86 : w * 0.41, ph = portrait ? Math.min((yB - yT - 110 * s) / 2, 520 * s) : Math.min(yB - yT - 30 * s, 560 * s);
  const slots = portrait
    ? [{ x: (w - pw) / 2, y: yT + ((yB - yT) - (ph * 2 + 110 * s)) / 2, from: -1, v: 'y' }, { x: (w - pw) / 2, y: yT + ((yB - yT) - (ph * 2 + 110 * s)) / 2 + ph + 110 * s, from: 1, v: 'y' }]
    : [{ x: w * 0.045, y: yT + ((yB - yT) - ph) / 2, from: -1 }, { x: w - w * 0.045 - pw, y: yT + ((yB - yT) - ph) / 2, from: 1 }];
  const sides = [L, Rr], cols = [pal.a1, pal.a2];
  sides.forEach((sd, i) => {
    const sl = slots[rtl && !portrait ? 1 - i : i], e = ent(t, 0.2 + i * 0.25, 0.7), off = (1 - Math.min(1, e.p));
    const dx = portrait ? 0 : off * w * 0.5 * sl.from, dy = portrait ? off * h * 0.3 * sl.from : 0;
    o += `<g transform="translate(${f1(dx)} ${f1(dy)})" opacity="${f2(e.o)}">` + card(c, sl.x, sl.y, pw, ph, { r: 38, stroke: cols[i] });
    o += `<rect x="${f1(sl.x)}" y="${f1(sl.y)}" width="${f1(pw)}" height="${f1(14 * s)}" rx="${f1(7 * s)}" fill="${cols[i]}"/>`;
    const tfit = fitText(sd.title, pw * 0.86, ph * 0.28, { max: 72 * s, min: 36 * s, maxLines: 2, lineGap: 1.15 });
    let ty = sl.y + 46 * s + tfit.size;
    tfit.lines.forEach((ln, k) => { o += txt(c, ln, sl.x + pw / 2, ty + k * tfit.size * 1.15, tfit.size, { weight: 900, fill: cols[i] }); });
    ty += tfit.lines.length * tfit.size * 1.15;
    (sd.points || []).slice(0, 3).forEach((pt, k) => {
      const pe = ent(t, 0.8 + i * 0.25 + k * 0.22, 0.5), py = ty + 30 * s + k * 78 * s;
      const px = rtl ? sl.x + pw - 60 * s : sl.x + 60 * s;
      o += `<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(11 * s)}" fill="${cols[i]}" opacity="${f2(pe.o)}"/>` + txt(c, wrapText(pt, pw - 160 * s, 38 * s, { maxLines: 1 })[0], rtl ? px - 28 * s : px + 28 * s, py + 13 * s, 38 * s, { weight: 600, anchor: rtl ? 'end' : 'start', opacity: pe.o });
    });
    o += '</g>';
  });
  const vp = ent(t, 0.75, 0.6), vx = w / 2, vy = portrait ? slots[1].y - 55 * s : slots[0].y + ph / 2;
  o += `<g opacity="${f2(vp.o)}"><circle cx="${f1(vx)}" cy="${f1(vy)}" r="${f1(70 * s * Math.min(1.15, vp.p))}" fill="${pal.bg[0]}" stroke="#fff" stroke-width="${f1(6 * s)}"/><circle cx="${f1(vx)}" cy="${f1(vy)}" r="${f1(70 * s * Math.min(1.15, vp.p) - 12 * s)}" fill="${pal.a3}"/>` + txt(c, 'VS', vx, vy + 22 * s, 62 * s, { weight: 900, fill: '#06070f', rtl: false }) + '</g>';
  return o;
}

// ── خط زمني ──
export function timeline(c, d, t, dur) {
  const { w, h, s, pal, portrait, rtl } = c; let o = sceneTitle(c, d.title, t);
  const ev = d.events.slice(0, 6), n = ev.length, cols = colorsOf(c);
  const prog = easeInOutCubic(seg(t, 0.25, 0.25 + Math.min(2.4, 0.5 + n * 0.45)));
  if (!portrait) {
    const x0 = w * 0.16, x1 = w * 0.84, y = h * 0.56;
    o += `<line x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x1)}" y2="${f1(y)}" stroke="${pal.muted}" stroke-opacity="0.25" stroke-width="${f1(8 * s)}" stroke-linecap="round"/><line x1="${f1(x0)}" y1="${f1(y)}" x2="${f1(x0 + (x1 - x0) * prog)}" y2="${f1(y)}" stroke="${pal.a1}" stroke-width="${f1(8 * s)}" stroke-linecap="round"/>`;
    ev.forEach((e0, i) => {
      const x = x0 + ((x1 - x0) * (n === 1 ? 0.5 : i / (n - 1))), reach = (x - x0) / (x1 - x0), e = ent(t, 0.25 + Math.min(2.4, 0.5 + n * 0.45) * reach, 0.5);
      if (prog < reach - 0.01) return;
      const up = i % 2 === 0, bw = Math.min((x1 - x0) / n * 1.7, 420 * s);
      o += `<line x1="${f1(x)}" y1="${f1(y)}" x2="${f1(x)}" y2="${f1(up ? y - 90 * s * e.x : y + 90 * s * e.x)}" stroke="${cols[i % 6]}" stroke-width="${f1(4 * s)}"/>`;
      o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(22 * s * Math.min(1.2, e.p))}" fill="${cols[i % 6]}" stroke="#fff" stroke-width="${f1(6 * s)}"/>`;
      const ty = up ? y - 120 * s : y + 130 * s;
      o += txt(c, e0.date, x, ty, 52 * s, { weight: 900, fill: cols[i % 6], opacity: e.o, rtl: false });
      wrapText(e0.label, bw, 36 * s, { maxLines: 3, bold: false }).forEach((ln, k) => { o += txt(c, ln, x, ty + 50 * s + k * 42 * s, 36 * s, { weight: 600, opacity: e.o }); });
    });
  } else {
    const xl = rtl ? w * 0.82 : w * 0.18, yT = areaTop(c, d), yB = h * 0.9;
    o += `<line x1="${f1(xl)}" y1="${f1(yT)}" x2="${f1(xl)}" y2="${f1(yB)}" stroke="${pal.muted}" stroke-opacity="0.25" stroke-width="${f1(8 * s)}" stroke-linecap="round"/><line x1="${f1(xl)}" y1="${f1(yT)}" x2="${f1(xl)}" y2="${f1(yT + (yB - yT) * prog)}" stroke="${pal.a1}" stroke-width="${f1(8 * s)}" stroke-linecap="round"/>`;
    ev.forEach((e0, i) => {
      const y = yT + ((yB - yT - 60 * s) * (n === 1 ? 0.5 : i / (n - 1))) + 30 * s, reach = (y - yT) / (yB - yT), e = ent(t, 0.25 + Math.min(2.4, 0.5 + n * 0.45) * reach, 0.5);
      if (prog < reach - 0.01) return;
      const tx = rtl ? xl - 60 * s : xl + 60 * s;
      o += `<circle cx="${f1(xl)}" cy="${f1(y)}" r="${f1(22 * s * Math.min(1.2, e.p))}" fill="${cols[i % 6]}" stroke="#fff" stroke-width="${f1(6 * s)}"/>`;
      o += txt(c, e0.date, tx, y - 4 * s, 54 * s, { weight: 900, fill: cols[i % 6], anchor: rtl ? 'end' : 'start', opacity: e.o, rtl: false });
      wrapText(e0.label, w * 0.62, 38 * s, { maxLines: 2, bold: false }).forEach((ln, k) => { o += txt(c, ln, tx, y + 46 * s + k * 42 * s, 38 * s, { weight: 600, anchor: rtl ? 'end' : 'start', opacity: e.o }); });
    });
  }
  return o;
}

// ── أيقونات ──
export function icons(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = sceneTitle(c, d.title, t);
  const items = d.items.slice(0, 6), n = items.length, cols = colorsOf(c);
  const cols_n = portrait ? (n <= 2 ? 1 : 2) : (n <= 4 ? n : 3), rows_n = Math.ceil(n / cols_n);
  const yT = areaTop(c, d) + 20 * s, yB = h * 0.9, cellW = (w * 0.86) / cols_n, cellH = Math.min((yB - yT) / rows_n, 520 * s);
  const R = Math.min(cellW * 0.3, cellH * 0.32, 160 * s), gx = w * 0.07;
  items.forEach((it, i) => {
    const r = Math.floor(i / cols_n), k = i % cols_n, rowCount = Math.min(cols_n, n - r * cols_n);
    const off = (cols_n - rowCount) * cellW / 2;
    const cx = gx + off + cellW * (k + 0.5), cy = yT + (yB - yT - cellH * rows_n) / 2 + cellH * (r + 0.5) - 24 * s;
    const e = ent(t, 0.3 + i * 0.28, 0.65), sc = Math.min(1.15, e.p), col = cols[i % 3];
    o += `<g opacity="${f2(e.o)}" transform="translate(${f1(cx)} ${f1(cy)}) scale(${f2(sc)}) rotate(${f1((1 - Math.min(1, e.p)) * -25)}) translate(${f1(-cx)} ${f1(-cy)})">`;
    o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R * 1.18)}" fill="${col}" opacity="0.14"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R)}" fill="${rgba(col, 0.2)}" stroke="${col}" stroke-width="${f1(6 * s)}"/>`;
    o += icon(c, it.icon, cx, cy, R * 1.05, { color: col, sw: 6 }) + '</g>';
    const fit = fitText(it.label, cellW * 0.9, cellH * 0.3, { max: 50 * s, min: 28 * s, maxLines: 2, lineGap: 1.2 });
    fit.lines.forEach((ln, q) => { o += txt(c, ln, cx, cy + R * 1.18 + 56 * s + q * fit.size * 1.2, fit.size, { weight: 800, opacity: ent(t, 0.5 + i * 0.28, 0.5).o }); });
  });
  return o;
}

// ── خطوات ──
export function steps(c, d, t, dur) {
  const { w, h, s, pal, portrait, rtl } = c; let o = sceneTitle(c, d.title, t);
  const st = d.steps.slice(0, 5), n = st.length, cols = colorsOf(c);
  if (!portrait) {
    const x0 = w * 0.1, x1 = w * 0.9, y = h * 0.52, step = (x1 - x0) / n, R = Math.min(70 * s, step * 0.2);
    st.forEach((it, i) => {
      const idx = rtl ? n - 1 - i : i, cx = x0 + step * (idx + 0.5), e = ent(t, 0.3 + i * 0.4, 0.6), col = cols[i % 3];
      if (i < n - 1) {
        const nx = x0 + step * ((rtl ? n - 2 - i : i + 1) + 0.5), p = easeOutCubic(seg(t, 0.55 + i * 0.4, 1.0 + i * 0.4));
        o += `<line x1="${f1(cx + (rtl ? -R : R) * 1.2)}" y1="${f1(y)}" x2="${f1(cx + (nx - cx) * p - (rtl ? -R : R) * 1.2 * p)}" y2="${f1(y)}" stroke="${col}" stroke-width="${f1(6 * s)}" stroke-dasharray="${f1(14 * s)} ${f1(12 * s)}" stroke-linecap="round"/>`;
      }
      o += `<g opacity="${f2(e.o)}" transform="translate(${f1(cx)} ${f1(y)}) scale(${f2(Math.min(1.15, e.p))}) translate(${f1(-cx)} ${f1(-y)})"><circle cx="${f1(cx)}" cy="${f1(y)}" r="${f1(R * 1.25)}" fill="${col}" opacity="0.18"/><circle cx="${f1(cx)}" cy="${f1(y)}" r="${f1(R)}" fill="${col}"/>${txt(c, String(i + 1), cx, y + R * 0.36, R * 1.0, { weight: 900, fill: pal.dark ? '#06070f' : '#fff', rtl: false })}</g>`;
      const fit = fitText(it.label, step * 0.92, h * 0.2, { max: 46 * s, min: 28 * s, maxLines: 3, lineGap: 1.2 });
      fit.lines.forEach((ln, q) => { o += txt(c, ln, cx, y + R * 1.25 + 62 * s + q * fit.size * 1.2, fit.size, { weight: 800, opacity: e.o }); });
    });
  } else {
    const yT = areaTop(c, d), yB = h * 0.9, step = (yB - yT) / n, R = Math.min(62 * s, step * 0.28), xc = rtl ? w * 0.84 : w * 0.16;
    st.forEach((it, i) => {
      const cy = yT + step * (i + 0.5), e = ent(t, 0.3 + i * 0.4, 0.6), col = cols[i % 3];
      if (i < n - 1) { const p = easeOutCubic(seg(t, 0.55 + i * 0.4, 1.0 + i * 0.4)); o += `<line x1="${f1(xc)}" y1="${f1(cy + R * 1.2)}" x2="${f1(xc)}" y2="${f1(cy + R * 1.2 + (step - R * 2.4) * p)}" stroke="${col}" stroke-width="${f1(6 * s)}" stroke-dasharray="${f1(14 * s)} ${f1(12 * s)}" stroke-linecap="round"/>`; }
      o += `<g opacity="${f2(e.o)}" transform="translate(${f1(xc)} ${f1(cy)}) scale(${f2(Math.min(1.15, e.p))}) translate(${f1(-xc)} ${f1(-cy)})"><circle cx="${f1(xc)}" cy="${f1(cy)}" r="${f1(R * 1.25)}" fill="${col}" opacity="0.18"/><circle cx="${f1(xc)}" cy="${f1(cy)}" r="${f1(R)}" fill="${col}"/>${txt(c, String(i + 1), xc, cy + R * 0.36, R, { weight: 900, fill: pal.dark ? '#06070f' : '#fff', rtl: false })}</g>`;
      const tx = rtl ? xc - R * 1.7 : xc + R * 1.7, fit = fitText(it.label, w * 0.62, step * 0.8, { max: 54 * s, min: 28 * s, maxLines: 3, lineGap: 1.2 });
      const th = fit.lines.length * fit.size * 1.2;
      fit.lines.forEach((ln, q) => { o += txt(c, ln, tx, cy - th / 2 + fit.size * 0.9 + q * fit.size * 1.2, fit.size, { weight: 800, anchor: rtl ? 'end' : 'start', opacity: e.o }); });
    });
  }
  return o;
}

// ── شبكة أرقام ──
export function gridstats(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = sceneTitle(c, d.title, t);
  const items = d.items.slice(0, 4), n = items.length, cols = colorsOf(c);
  const cn = portrait ? (n <= 2 ? 1 : 2) : (n <= 3 ? n : 2), rn = Math.ceil(n / cn);
  const yT = areaTop(c, d), yB = h * 0.9, gap = 34 * s, cw = (w * 0.86 - gap * (cn - 1)) / cn, chh = Math.min((yB - yT - gap * (rn - 1)) / rn, portrait ? 380 * s : 400 * s);
  const x0 = w * 0.07, y0 = yT + ((yB - yT) - (chh * rn + gap * (rn - 1))) / 2;
  items.forEach((it, i) => {
    const r = Math.floor(i / cn), k = i % cn, rowCount = Math.min(cn, n - r * cn), off = (cn - rowCount) * (cw + gap) / 2;
    const x = x0 + off + k * (cw + gap), y = y0 + r * (chh + gap), e = ent(t, 0.25 + i * 0.22, 0.6), col = cols[i % 3];
    const p = easeOutExpo(seg(t, 0.4 + i * 0.22, 1.9 + i * 0.22)), val = Number(it.value) * p;
    o += `<g opacity="${f2(e.o)}" transform="translate(0 ${f1((1 - Math.min(1, e.p)) * 50 * s)})">` + card(c, x, y, cw, chh, { r: 36 });
    o += `<rect x="${f1(x + cw * 0.12)}" y="${f1(y + 26 * s)}" width="${f1(cw * 0.76)}" height="${f1(8 * s)}" rx="${f1(4 * s)}" fill="${col}"/>`;
    const text = `${it.prefix || ''}${num(val, decimalsOf(it.value))}${it.suffix || ''}`, size = Math.min(150 * s, (cw * 0.86) / Math.max(2, text.length * 0.64), chh * 0.36);
    o += txt(c, text, x + cw / 2, y + chh * 0.46 + size * 0.2, size, { weight: 900, fill: col, rtl: false });
    const fit = fitText(it.label, cw * 0.86, chh * 0.26, { max: 46 * s, min: 26 * s, maxLines: 2, lineGap: 1.2 });
    fit.lines.forEach((ln, q) => { o += txt(c, ln, x + cw / 2, y + chh * 0.46 + size * 0.2 + 60 * s + q * fit.size * 1.2, fit.size, { weight: 700, fill: pal.text }); });
    o += '</g>';
  });
  return o;
}

// ── كرة أرضية منقّطة بتلف ──
let GLOBE_PTS = null;
const globePts = () => { if (GLOBE_PTS) return GLOBE_PTS; const n = 520, ga = Math.PI * (3 - Math.sqrt(5)); GLOBE_PTS = Array.from({ length: n }, (_, i) => { const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i; return [Math.cos(th) * r, y, Math.sin(th) * r]; }); return GLOBE_PTS; };
export function globe(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = sceneTitle(c, d.title, t);
  const R = Math.min(w, h) * (portrait ? 0.34 : 0.32), cx = w / 2, cy = h * (portrait ? 0.5 : 0.53);
  const pin0 = (d.pins || [])[0], e = ent(t, 0.1, 0.8), rot = pin0 ? -(pin0.lon * Math.PI / 180) - 0.9 + t * 0.5 : t * 0.55 + 0.8, tilt = 0.38;
  o += glowCircle(c, 'gg', cx, cy, R * 1.7, pal.a1, 0.3 * e.o);
  o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R * e.p)}" fill="${pal.bg[0]}" fill-opacity="0.65" stroke="${pal.a1}" stroke-opacity="0.5" stroke-width="${f1(3 * s)}"/>`;
  const rotate = (p) => { const x1 = p[0] * Math.cos(rot) + p[2] * Math.sin(rot), z1 = -p[0] * Math.sin(rot) + p[2] * Math.cos(rot); const y2 = p[1] * Math.cos(tilt) - z1 * Math.sin(tilt), z2 = p[1] * Math.sin(tilt) + z1 * Math.cos(tilt); return [x1, y2, z2]; };
  // النقط في 4 مسارات حسب العمق (نقطة مدوّرة = lineCap round بطول صفر) — أسرع بكتير من 800 عنصر
  const buckets = [[], [], [], []];
  for (const p of globePts()) { const [x, y, z] = rotate(p); if (z < -0.02) continue; buckets[Math.min(3, Math.floor(Math.max(0, z) * 4))].push(`M${f1(cx + x * R * e.p)} ${f1(cy - y * R * e.p)}h0`); }
  buckets.forEach((b, k) => { if (b.length) o += `<path d="${b.join('')}" stroke="${pal.a1}" stroke-width="${f1((5 + k * 2.2) * s)}" stroke-linecap="round" opacity="${f2(0.3 + k * 0.23)}" fill="none"/>`; });
  (d.pins || []).slice(0, 4).forEach((pin, i) => {
    const lat = pin.lat * Math.PI / 180, lon = pin.lon * Math.PI / 180, p0 = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    const [x, y, z] = rotate(p0), pe = ent(t, 0.9 + i * 0.5, 0.5);
    if (z < 0.05) return;
    const px = cx + x * R, py = cy - y * R, pr = ((t * 0.9 + i * 0.3) % 1);
    o += `<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1((14 + pr * 48) * s)}" fill="none" stroke="${pal.a2}" stroke-width="${f1(4 * s)}" opacity="${f2((1 - pr) * pe.o)}"/><circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(13 * s * Math.min(1.2, pe.p))}" fill="${pal.a2}" stroke="#fff" stroke-width="${f1(4 * s)}"/>`;
    if (pin.label) o += pill(c, px, py - 62 * s, pin.label, 30 * s, { fill: pal.a2, opacity: pe.o });
  });
  return o;
}

// ── شبكة (محور + عقد) ──
export function network(c, d, t, dur) {
  const { w, h, s, pal, portrait } = c; let o = sceneTitle(c, d.title, t);
  const nodes = d.nodes.slice(0, 6), n = nodes.length, cols = colorsOf(c);
  const cx = w / 2, cy = h * (portrait ? 0.56 : 0.6), RX = w * (portrait ? 0.34 : 0.3), RY = h * (portrait ? 0.22 : 0.24);
  const he = ent(t, 0.15, 0.6);
  nodes.forEach((nd, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2, nx = cx + Math.cos(a) * RX, ny = cy + Math.sin(a) * RY, e = ent(t, 0.5 + i * 0.3, 0.6), lp = easeOutCubic(seg(t, 0.4 + i * 0.3, 0.9 + i * 0.3));
    o += `<line x1="${f1(cx)}" y1="${f1(cy)}" x2="${f1(cx + (nx - cx) * lp)}" y2="${f1(cy + (ny - cy) * lp)}" stroke="${cols[i % 3]}" stroke-opacity="0.7" stroke-width="${f1(5 * s)}" stroke-dasharray="${f1(16 * s)} ${f1(10 * s)}"/>`;
    const r = Math.min(72 * s, RX * 0.22);
    o += `<g opacity="${f2(e.o)}" transform="translate(${f1(nx)} ${f1(ny)}) scale(${f2(Math.min(1.12, e.p))}) translate(${f1(-nx)} ${f1(-ny)})"><circle cx="${f1(nx)}" cy="${f1(ny)}" r="${f1(r * 1.3)}" fill="${cols[i % 3]}" opacity="0.16"/><circle cx="${f1(nx)}" cy="${f1(ny)}" r="${f1(r)}" fill="${rgba(cols[i % 3], 0.22)}" stroke="${cols[i % 3]}" stroke-width="${f1(5 * s)}"/>`
      + (nd.icon ? icon(c, nd.icon, nx, ny, r * 1.1, { color: cols[i % 3], sw: 6 }) : '') + '</g>';
    const fit = fitText(nd.label, w * 0.26, h * 0.1, { max: 40 * s, min: 24 * s, maxLines: 2, lineGap: 1.15 });
    const ly = ny + (Math.sin(a) > 0.3 ? r + 52 * s : -r - 28 * s - (fit.lines.length - 1) * fit.size * 1.15);
    fit.lines.forEach((ln, q) => { o += txt(c, ln, nx, ly + q * fit.size * 1.15, fit.size, { weight: 800, opacity: e.o }); });
  });
  const pr = 1 + 0.04 * Math.sin(t * 4), R0 = Math.min(110 * s, RX * 0.32);
  o += `<g opacity="${f2(he.o)}"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R0 * 1.45 * pr)}" fill="${pal.a1}" opacity="0.18"/><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R0 * Math.min(1.1, he.p))}" fill="${pal.a1}"/>`;
  const fit = fitText(d.center, R0 * 1.7, R0 * 1.3, { max: 44 * s, min: 22 * s, maxLines: 2, lineGap: 1.12 });
  fit.lines.forEach((ln, q) => { o += txt(c, ln, cx, cy + fit.size * 0.34 - ((fit.lines.length - 1) * fit.size * 1.12) / 2 + q * fit.size * 1.12, fit.size, { weight: 900, fill: pal.dark ? '#06070f' : '#fff' }); });
  return o + '</g>';
}

export const SCENES_B = { stat, bars, donut, line, list, compare, timeline, icons, steps, gridstats, globe, network };
