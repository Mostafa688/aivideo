// ── motionScenes.js ── مشاهد موشن جرافيك كاملة بالكود (خلفية بعمق ثلاثي الأبعاد + مجسّمات + نص بارز) بتتحط بدل لقطة من الفيديو الأصلي (cutaway)
// بينما الصوت الأصلي بيكمّل من غير قطع. كل إطار = SVG محسوب من الزمن t (إسقاط منظور حقيقي للمكعّب والأعمدة الأيزومترية والأرضية) → PNG → فيديو.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { ffmpeg } from '../documentary/ff.js';
import { esc, wrapText, textWidth, fontStack } from '../documentary/textutil.js';
import { clamp01, lerp, easeOutCubic, easeOutBack, easeInOutCubic, seg } from '../documentary/easing.js';

export const SCENE_FPS = 30;
export const SCENE_TYPES = ['headline', 'keywords', 'list', 'stat', 'compare'];

// ── ألوان ──
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return [255, 255, 255]; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); };
const darken = (h, k) => mix(h, '#000000', k);
const lighten = (h, k) => mix(h, '#ffffff', k);
const rand = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

// ── ثلاثي الأبعاد ──
function rot(p, rx, ry, rz) {
  let [x, y, z] = p;
  let c = Math.cos(ry), s = Math.sin(ry); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rx); s = Math.sin(rx); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(rz); s = Math.sin(rz); [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
const proj = (p, cx, cy, size, d = 4.2) => { const k = d / (d + p[2]); return [cx + p[0] * size * k, cy + p[1] * size * k, p[2]]; };
const CUBE_V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]];
const CUBE_N = [[0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0]];

/** مكعّب زجاجي مضيء بيلف (وجوه متظلّلة + أحرف مضيئة + مكعّب صغير بيلف عكسه) */
function cube3d(c, t, cx, cy, size, { appear = 1 } = {}) {
  const { theme, s } = c;
  const ry = t * 0.95 + 0.5, rx = -0.55 + 0.22 * Math.sin(t * 1.3), rz = 0.18 * Math.sin(t * 0.8);
  const sz = size * (0.55 + 0.45 * easeOutBack(appear));
  const V = CUBE_V.map(v => proj(rot(v, rx, ry, rz), cx, cy, sz));
  const light = [0.35, -0.55, -0.75];
  const faces = CUBE_F.map((f, i) => {
    const n = rot(CUBE_N[i], rx, ry, rz);
    const pts = f.map(k => V[k]);
    return { i, n, pts, z: pts.reduce((a, p) => a + p[2], 0) / 4, vis: n[2] < 0.02 };
  }).filter(f => f.vis).sort((a, b) => b.z - a.z);
  let o = `<ellipse cx="${cx.toFixed(1)}" cy="${(cy + sz * 1.55).toFixed(1)}" rx="${(sz * 1.2).toFixed(1)}" ry="${(sz * 0.22).toFixed(1)}" fill="#000" opacity="0.28"/>`;
  for (const f of faces) {
    const lit = clamp01(-(f.n[0] * light[0] + f.n[1] * light[1] + f.n[2] * light[2]) * 0.8 + 0.25);
    const fill = mix(darken(theme.accent, 0.3), lighten(theme.accent2, 0.35), lit);
    o += `<polygon points="${f.pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')}" fill="${fill}" fill-opacity="0.96" stroke="rgba(255,255,255,0.6)" stroke-width="${(3 * s).toFixed(1)}" stroke-linejoin="round"/>`;
  }
  // مكعّب داخلي سلكي
  const iv = CUBE_V.map(v => proj(rot(v, -rx * 1.4 + 0.6, -ry * 1.7, rz), cx, cy, sz * 0.46));
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  o += `<g stroke="${lighten(theme.accent2, 0.35)}" stroke-width="${(3.2 * s).toFixed(1)}" stroke-linecap="round" opacity="0.95">${edges.map(([a, b]) => `<line x1="${iv[a][0].toFixed(1)}" y1="${iv[a][1].toFixed(1)}" x2="${iv[b][0].toFixed(1)}" y2="${iv[b][1].toFixed(1)}"/>`).join('')}</g>`;
  return o;
}

/** حلقة مدار مائلة بتلف حوالين المجسّم */
function orbitRing(c, t, cx, cy, rx, ry, tilt, speed = 1) {
  const { theme, s } = c;
  const dash = (28 * s).toFixed(1);
  return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" transform="rotate(${tilt} ${cx.toFixed(1)} ${cy.toFixed(1)})" fill="none" stroke="${theme.accent}" stroke-opacity="0.65" stroke-width="${(3 * s).toFixed(1)}" stroke-dasharray="${dash} ${(18 * s).toFixed(1)}" stroke-dashoffset="${(-t * 90 * speed * s).toFixed(1)}"/>`;
}

/** أعمدة أيزومترية (3 وجوه متظلّلة) بتطلع بالتتابع — زخرفة نمو/أرقام */
function isoBars(c, t, cx, baseY, n, width, maxH, { start = 0.2 } = {}) {
  const { theme, s } = c;
  const gap = width * 0.55, total = n * width + (n - 1) * gap, x0 = cx - total / 2;
  let o = '';
  for (let i = 0; i < n; i++) {
    const p = easeOutBack(seg(t, start + i * 0.14, start + 0.7 + i * 0.14));
    const target = maxH * (0.28 + 0.72 * ((i + 1) / n) ** 1.2);
    const hgt = Math.max(2, target * p);
    const x = x0 + i * (width + gap), dx = width * 0.5, dy = width * 0.28;
    const col = i === n - 1 ? theme.accent2 : theme.accent;
    const top = baseY - hgt;
    o += `<polygon points="${x},${baseY} ${x + width},${baseY} ${x + width},${top} ${x},${top}" fill="${darken(col, 0.18)}"/>`;
    o += `<polygon points="${x + width},${baseY} ${x + width + dx},${baseY - dy} ${x + width + dx},${top - dy} ${x + width},${top}" fill="${darken(col, 0.5)}"/>`;
    o += `<polygon points="${x},${top} ${x + width},${top} ${x + width + dx},${top - dy} ${x + dx},${top - dy}" fill="${lighten(col, 0.35)}"/>`;
  }
  return o;
}

// ── الخلفية: تدرّج + توهّج بيتحرك + أرضية بمنظور بتجري ناحية المشاهد + جزيئات ──
function backdrop(c, t) {
  const { w, h, s, theme } = c;
  const hor = h * 0.6, cx = w / 2;
  let o = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${theme.bgTop}"/><stop offset="1" stop-color="${theme.bgBottom}"/></linearGradient>
<radialGradient id="g1"><stop offset="0" stop-color="${theme.accent}" stop-opacity="0.5"/><stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/></radialGradient>
<radialGradient id="g2"><stop offset="0" stop-color="${theme.accent2}" stop-opacity="0.34"/><stop offset="1" stop-color="${theme.accent2}" stop-opacity="0"/></radialGradient>
<radialGradient id="vg" cx="0.5" cy="0.5" r="0.78"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient></defs>`;
  o += `<rect width="${w}" height="${h}" fill="url(#bg)"/>`;
  const R = Math.max(w, h) * 0.6;
  o += `<circle cx="${(w * (0.25 + 0.14 * Math.sin(t * 0.7))).toFixed(1)}" cy="${(h * (0.28 + 0.06 * Math.cos(t * 0.9))).toFixed(1)}" r="${R.toFixed(0)}" fill="url(#g1)"/>`;
  o += `<circle cx="${(w * (0.78 + 0.12 * Math.cos(t * 0.6))).toFixed(1)}" cy="${(h * (0.72 + 0.07 * Math.sin(t * 0.8))).toFixed(1)}" r="${(R * 0.85).toFixed(0)}" fill="url(#g2)"/>`;
  // أرضية بمنظور
  const phase = (t * 0.5) % 1;
  for (let i = 0; i < 15; i++) {
    const z = (i + phase) / 15, y = hor + (h - hor) * z ** 2.2;
    o += `<line x1="0" y1="${y.toFixed(1)}" x2="${w}" y2="${y.toFixed(1)}" stroke="${theme.accent}" stroke-opacity="${(0.04 + 0.3 * z).toFixed(3)}" stroke-width="${((1 + 2.4 * z) * s).toFixed(2)}"/>`;
  }
  for (let k = -9; k <= 9; k++) o += `<line x1="${(cx + k * w * 0.02).toFixed(1)}" y1="${hor.toFixed(1)}" x2="${(cx + k * w * 0.16).toFixed(1)}" y2="${h}" stroke="${theme.accent}" stroke-opacity="0.2" stroke-width="${(1.6 * s).toFixed(2)}"/>`;
  o += `<rect x="0" y="${(hor - 3 * s).toFixed(1)}" width="${w}" height="${(6 * s).toFixed(1)}" fill="${theme.accent2}" opacity="0.35"/>`;
  for (let i = 0; i < 30; i++) {
    const px = rand(i, 1) * w, sp = 0.04 + 0.1 * rand(i, 2), py = h - (((t * sp + rand(i, 3)) % 1) * h * 1.1);
    o += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${((2 + 5 * rand(i, 4)) * s).toFixed(1)}" fill="${i % 3 ? theme.accent2 : '#ffffff'}" opacity="${(0.12 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2 + i * 1.7))).toFixed(2)}"/>`;
  }
  o += `<rect width="${w}" height="${h}" fill="url(#vg)"/>`;
  return o;
}

// ── نص: عادي + "مُجسَّم" (طبقات إزاحة متدرّجة الغمق = إحساس سُمك ثلاثي الأبعاد) ──
const T = (c, text, x, y, size, { weight = 800, fill, anchor = 'middle', opacity = 1, stroke = true } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${c.ff}" font-size="${(size * c.s).toFixed(1)}" font-weight="${weight}" fill="${fill || c.theme.text}" text-anchor="${anchor}" opacity="${opacity.toFixed(3)}"${stroke ? ` stroke="rgba(0,0,0,0.45)" stroke-width="${Math.max(1.5, size * c.s * 0.045).toFixed(1)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(text)}</text>`;

function extruded(c, text, x, y, size, { opacity = 1, depth = 10 } = {}) {
  const { theme, s } = c;
  let o = '';
  for (let i = depth; i >= 1; i--) {
    const k = i / depth;
    o += `<text x="${(x + i * 0.9 * s).toFixed(1)}" y="${(y + i * 1.15 * s).toFixed(1)}" font-family="${c.ff}" font-size="${(size * s).toFixed(1)}" font-weight="900" fill="${darken(theme.accent, 0.35 + 0.5 * k)}" text-anchor="middle" opacity="${opacity.toFixed(3)}">${esc(text)}</text>`;
  }
  o += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${c.ff}" font-size="${(size * s).toFixed(1)}" font-weight="900" fill="${theme.text}" text-anchor="middle" opacity="${opacity.toFixed(3)}" stroke="rgba(0,0,0,0.35)" stroke-width="${(size * s * 0.03).toFixed(1)}" stroke-linejoin="round" paint-order="stroke">${esc(text)}</text>`;
  return o;
}

const chip = (c, label, x, y, scale, opacity) => {
  const { theme, s } = c;
  const size = 58 * scale, tw = textWidth(label, size * s, true), pw = tw + 70 * s * scale, ph = 98 * s * scale;
  return `<g opacity="${opacity.toFixed(3)}"><rect x="${(x - pw / 2).toFixed(1)}" y="${(y - ph / 2).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${(ph / 2).toFixed(1)}" fill="rgba(8,12,26,0.78)" stroke="${theme.accent2}" stroke-width="${(3 * s).toFixed(1)}"/>`
    + `<circle cx="${(x - pw / 2 + 36 * s * scale).toFixed(1)}" cy="${y.toFixed(1)}" r="${(10 * s * scale).toFixed(1)}" fill="${theme.accent2}"/>`
    + `<text x="${(x + 20 * s * scale).toFixed(1)}" y="${(y + size * s * 0.34).toFixed(1)}" font-family="${c.ff}" font-size="${(size * s).toFixed(1)}" font-weight="800" fill="${theme.text}" text-anchor="middle">${esc(label)}</text></g>`;
};

// ── أنواع المشاهد ──
function sceneHeadline(c, d, t) {
  const { w, h, s, theme } = c;
  const cubeY = h * (c.portrait ? 0.27 : 0.3);
  let o = orbitRing(c, t, w / 2, cubeY, 330 * s, 90 * s, -14) + cube3d(c, t, w / 2, cubeY, (c.portrait ? 150 : 135) * s, { appear: seg(t, 0, 0.6) });
  const size = (c.portrait ? 112 : 124);
  const lines = wrapText(d.text, w * 0.86, size * s, { maxLines: 4 });
  const lh = size * 1.14 * s, y0 = h * (c.portrait ? 0.56 : 0.6) - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => {
    const p = easeOutBack(seg(t, 0.25 + i * 0.2, 0.75 + i * 0.2));
    o += extruded(c, ln, w / 2, y0 + i * lh + (1 - p) * 70 * s, size * (0.9 + 0.1 * p), { opacity: clamp01(p * 1.4) });
  });
  const barW = Math.min(w * 0.5, 420 * s) * easeInOutCubic(seg(t, 0.6, 1.2));
  const by = y0 + (lines.length - 1) * lh + 58 * s;
  o += `<rect x="${(w / 2 - barW / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${(9 * s).toFixed(1)}" rx="${(4.5 * s).toFixed(1)}" fill="${theme.accent2}"/>`;
  if (d.sub) o += T(c, d.sub, w / 2, by + 86 * s, 46, { weight: 600, fill: theme.muted, opacity: easeOutCubic(seg(t, 0.9, 1.4)), stroke: false });
  return o;
}

function sceneKeywords(c, d, t) {
  const { w, h, s, theme } = c;
  const cx = w / 2, cy = h * (c.portrait ? 0.5 : 0.52), R = (c.portrait ? 0.36 : 0.28) * w;
  const items = d.items.slice(0, 5);
  const chips = items.map((it, i) => {
    const a = t * 0.75 + (i * 2 * Math.PI) / items.length - Math.PI / 2, depth = Math.sin(a);
    const appear = easeOutBack(seg(t, 0.35 + i * 0.12, 0.85 + i * 0.12));
    return { it, x: cx + Math.cos(a) * R, y: cy + depth * R * 0.34 - 10 * s * (1 - appear), z: depth, sc: (0.8 + 0.22 * depth) * (0.4 + 0.6 * appear), op: clamp01(appear * (0.72 + 0.28 * (depth + 1) / 2)) };
  }).sort((a, b) => a.z - b.z);
  let o = orbitRing(c, t, cx, cy, R * 1.05, R * 0.38, -8, 0.9);
  for (const k of chips.filter(x => x.z < 0)) o += chip(c, k.it, k.x, k.y, k.sc, k.op * 0.85);
  o += cube3d(c, t, cx, cy, (c.portrait ? 120 : 110) * s, { appear: seg(t, 0, 0.55) });
  for (const k of chips.filter(x => x.z >= 0)) o += chip(c, k.it, k.x, k.y, k.sc, k.op);
  if (d.title) o += extruded(c, d.title, cx, h * 0.14 + (1 - easeOutCubic(seg(t, 0.1, 0.6))) * 40 * s, c.portrait ? 84 : 92, { opacity: easeOutCubic(seg(t, 0.1, 0.6)), depth: 7 });
  return o;
}

function sceneList(c, d, t) {
  const { w, h, s, theme } = c;
  let o = '';
  const cardH = 150 * s, gap = 34 * s, n = d.items.length, cw = w * 0.84;
  const top = h * 0.5 - (n * cardH + (n - 1) * gap) / 2 + 60 * s;
  o += cube3d(c, t, w * 0.82, h * 0.15, 78 * s, { appear: seg(t, 0, 0.5) });
  if (d.title) o += extruded(c, d.title, w * (c.portrait ? 0.4 : 0.42), h * 0.17 + (1 - easeOutCubic(seg(t, 0.05, 0.5))) * 40 * s, c.portrait ? 70 : 82, { opacity: easeOutCubic(seg(t, 0.05, 0.5)), depth: 6 });
  d.items.forEach((it, i) => {
    const p = easeOutBack(seg(t, 0.3 + i * 0.22, 0.85 + i * 0.22));
    const y = top + i * (cardH + gap) + (1 - p) * 220 * s, x = (w - cw) / 2;
    const lines = wrapText(it, cw - 220 * s, 58 * s, { maxLines: 2 });
    o += `<g opacity="${clamp01(p * 1.3).toFixed(3)}" transform="translate(0 ${(0).toFixed(1)}) skewX(-5) translate(${(5 * y * 0.02).toFixed(1)} 0)">`
      + `<rect x="${x.toFixed(1)}" y="${(y + 12 * s).toFixed(1)}" width="${cw.toFixed(1)}" height="${cardH.toFixed(1)}" rx="${(30 * s).toFixed(1)}" fill="#000" opacity="0.35"/>`
      + `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${cw.toFixed(1)}" height="${cardH.toFixed(1)}" rx="${(30 * s).toFixed(1)}" fill="rgba(10,14,32,0.86)" stroke="${i % 2 ? theme.accent2 : theme.accent}" stroke-width="${(4 * s).toFixed(1)}"/>`
      + `<circle cx="${(x + 78 * s).toFixed(1)}" cy="${(y + cardH / 2).toFixed(1)}" r="${(42 * s).toFixed(1)}" fill="${i % 2 ? theme.accent2 : theme.accent}"/>`
      + `<text x="${(x + 78 * s).toFixed(1)}" y="${(y + cardH / 2 + 17 * s).toFixed(1)}" font-family="${c.ff}" font-size="${(48 * s).toFixed(1)}" font-weight="900" fill="#0b1020" text-anchor="middle">${i + 1}</text>`
      + lines.map((ln, k) => `<text x="${(x + 150 * s + (cw - 190 * s) / 2).toFixed(1)}" y="${(y + cardH / 2 + (lines.length === 1 ? 17 : k * 56 - 10) * s).toFixed(1)}" font-family="${c.ff}" font-size="${(58 * s).toFixed(1)}" font-weight="800" fill="${theme.text}" text-anchor="middle">${esc(ln)}</text>`).join('')
      + '</g>';
  });
  return o;
}

function sceneStat(c, d, t) {
  const { w, h, s, theme } = c;
  const cx = w / 2;
  let o = isoBars(c, t, cx, h * 0.8, 5, w * 0.1, h * 0.34, { start: 0.15 });
  const k = easeOutCubic(seg(t, 0.25, 1.4));
  const v = Number(d.value) * k;
  const shown = (Math.abs(Number(d.value)) >= 100 ? Math.round(v).toLocaleString('en-US') : (Number.isInteger(Number(d.value)) ? String(Math.round(v)) : v.toFixed(1)));
  const label = `${d.prefix || ''}${shown}${d.suffix || ''}`;
  const size = Math.min(230, (w * 0.86) / Math.max(1, label.length * 0.6) / s);
  const p = easeOutBack(seg(t, 0.15, 0.7));
  o += extruded(c, label, cx, h * 0.34 + (1 - p) * 60 * s, size, { opacity: clamp01(p * 1.4), depth: 12 });
  if (d.label) {
    const lines = wrapText(d.label, w * 0.82, 62 * s, { maxLines: 2 });
    lines.forEach((ln, i) => { o += T(c, ln, cx, h * 0.34 + 120 * s + i * 72 * s, 62, { weight: 700, fill: theme.text, opacity: easeOutCubic(seg(t, 0.8, 1.3)) }); });
  }
  return o;
}

function sceneCompare(c, d, t) {
  const { w, h, s, theme } = c;
  let o = '';
  const pw = c.portrait ? w * 0.84 : w * 0.38, ph = c.portrait ? h * 0.2 : h * 0.4;
  const slots = c.portrait
    ? [{ x: w / 2 - pw / 2, y: h * 0.26, from: -1 }, { x: w / 2 - pw / 2, y: h * 0.58, from: 1 }]
    : [{ x: w * 0.06, y: h * 0.3, from: -1 }, { x: w * 0.56, y: h * 0.3, from: 1 }];
  [d.left, d.right].forEach((txt, i) => {
    const p = easeOutBack(seg(t, 0.2 + i * 0.2, 0.85 + i * 0.2)), sl = slots[i];
    const dx = c.portrait ? (1 - p) * w * 0.7 * sl.from : (1 - p) * w * 0.5 * sl.from;
    const col = i ? theme.accent2 : theme.accent;
    const lines = wrapText(txt, pw - 80 * s, 76 * s, { maxLines: 3 });
    o += `<g opacity="${clamp01(p * 1.4).toFixed(3)}" transform="translate(${dx.toFixed(1)} 0)">`
      + `<rect x="${(sl.x + 14 * s).toFixed(1)}" y="${(sl.y + 18 * s).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${(34 * s).toFixed(1)}" fill="#000" opacity="0.35"/>`
      + `<rect x="${sl.x.toFixed(1)}" y="${sl.y.toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${(34 * s).toFixed(1)}" fill="rgba(10,14,32,0.88)" stroke="${col}" stroke-width="${(6 * s).toFixed(1)}"/>`
      + `<rect x="${sl.x.toFixed(1)}" y="${sl.y.toFixed(1)}" width="${(18 * s).toFixed(1)}" height="${ph.toFixed(1)}" rx="${(9 * s).toFixed(1)}" fill="${col}"/>`
      + lines.map((ln, k) => `<text x="${(sl.x + pw / 2 + 8 * s).toFixed(1)}" y="${(sl.y + ph / 2 + (k - (lines.length - 1) / 2) * 86 * s + 26 * s).toFixed(1)}" font-family="${c.ff}" font-size="${(76 * s).toFixed(1)}" font-weight="900" fill="${theme.text}" text-anchor="middle">${esc(ln)}</text>`).join('')
      + '</g>';
  });
  const vp = easeOutBack(seg(t, 0.7, 1.2));
  const vx = w / 2, vy = c.portrait ? h * 0.5 : h * 0.3 + ph / 2;
  o += `<g opacity="${clamp01(vp).toFixed(3)}"><circle cx="${vx}" cy="${vy.toFixed(1)}" r="${(80 * s * vp).toFixed(1)}" fill="${theme.accent2}" stroke="#fff" stroke-width="${(5 * s).toFixed(1)}"/><text x="${vx}" y="${(vy + 26 * s).toFixed(1)}" font-family="${c.ff}" font-size="${(76 * s).toFixed(1)}" font-weight="900" fill="#0b1020" text-anchor="middle">VS</text></g>`;
  return o;
}

const SCENES = { headline: sceneHeadline, keywords: sceneKeywords, list: sceneList, stat: sceneStat, compare: sceneCompare };

/** إطار واحد (SVG كامل) لمشهد عند الزمن t (ثواني من بداية المشهد) */
export function sceneFrameSvg(scene, t, dur, { w, h, theme, lang = 'en' }) {
  const s = Math.min(w, h) / 1080;
  const c = { w, h, s, theme, ff: fontStack(lang), portrait: h > w };
  const inP = easeOutCubic(seg(t, 0, 0.35)), outP = seg(t, dur - 0.16, dur);
  const content = (SCENES[scene.type] || sceneHeadline)(c, scene.data || {}, t);
  const scale = 0.955 + 0.045 * inP;
  const flash = 0.7 * (1 - seg(t, 0, 0.16));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${backdrop(c, t)}`
    + `<g opacity="${(inP * (1 - outP)).toFixed(3)}" transform="translate(${(w / 2 * (1 - scale)).toFixed(1)} ${(h / 2 * (1 - scale)).toFixed(1)}) scale(${scale.toFixed(4)})">${content}</g>`
    + (flash > 0.01 ? `<rect width="${w}" height="${h}" fill="#fff" opacity="${flash.toFixed(3)}"/>` : '') + '</svg>';
}

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const idx = i++; await fn(items[idx], idx); } }));
}

/** بيرندر إطارات المشهد PNG (بتتحوّل لفيديو في تركيب اللقطة). scale<1 = رندر بدقة أقل وتكبير لاحقًا (أسرع). */
export async function renderMotionScene({ scene, dur, w, h, theme, lang = 'en', dir, fps = SCENE_FPS, concurrency = 4, scale = 1 }) {
  fs.mkdirSync(dir, { recursive: true });
  const rw = Math.max(2, Math.round((w * scale) / 2) * 2), rh = Math.max(2, Math.round((h * scale) / 2) * 2);
  const n = Math.max(2, Math.round(dur * fps));
  await pool(Array.from({ length: n }, (_, i) => i), concurrency, async (i) => {
    const svg = sceneFrameSvg(scene, i / fps, dur, { w: rw, h: rh, theme, lang });
    await sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 1 }).toFile(path.join(dir, `f_${String(i).padStart(4, '0')}.png`));
  });
  return { pattern: path.join(dir, 'f_%04d.png'), fps, frames: n, w: rw, h: rh };
}

// ── تحقق من مشهد (من الـLLM أو الاحتياطي): النوع والبيانات + التأريض في الكلام الفعلي ──
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const toks = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1);
const stemHit = (a, said) => said.has(a) || [...said].some(b => a.length >= 4 && b.length >= 4 && (b.startsWith(a.slice(0, 4)) || a.startsWith(b.slice(0, 4))));
const grounded = (text, said, ratio = 0.6) => { const t = toks(text); if (!t.length) return false; return t.filter(x => stemHit(x, said)).length / t.length >= ratio; };
const clean = (s, max) => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** @returns {{type, data}|null} */
export function sanitizeScene(raw, spoken) {
  if (!raw || !SCENE_TYPES.includes(raw.type)) return null;
  const said = new Set(toks(spoken));
  const d = raw.data || {};
  switch (raw.type) {
    case 'headline': {
      const text = clean(d.text, 60); const n = text.split(/\s+/).length;
      if (!text || n < 1 || n > 7 || !grounded(text, said, 0.5)) return null;
      return { type: 'headline', data: { text, sub: clean(d.sub, 56) || undefined } };
    }
    case 'keywords': {
      const items = (Array.isArray(d.items) ? d.items : []).map(x => clean(x, 22)).filter(Boolean).slice(0, 5);
      if (items.length < 3 || items.filter(x => grounded(x, said, 0.5)).length < Math.ceil(items.length / 2)) return null;
      return { type: 'keywords', data: { title: clean(d.title, 34) || undefined, items } };
    }
    case 'list': {
      const items = (Array.isArray(d.items) ? d.items : []).map(x => clean(x, 48)).filter(Boolean).slice(0, 4);
      if (items.length < 2 || items.filter(x => grounded(x, said, 0.5)).length < Math.ceil(items.length / 2)) return null;
      return { type: 'list', data: { title: clean(d.title, 34) || undefined, items } };
    }
    case 'stat': {
      const value = Number(d.value);
      if (!Number.isFinite(value) || value <= 0) return null;
      const digits = String(spoken || '').replace(/[,٬]/g, '');
      if (!new RegExp(`(^|[^\\d])${String(Math.abs(value)).replace('.', '\\.')}([^\\d]|$)`).test(digits)) return null; // الرقم لازم يتقال في الكلام
      return { type: 'stat', data: { value, prefix: clean(d.prefix, 3) || undefined, suffix: clean(d.suffix, 6) || undefined, label: clean(d.label, 52) || undefined } };
    }
    case 'compare': {
      const left = clean(d.left, 40), right = clean(d.right, 40);
      if (!left || !right || !grounded(left, said, 0.5) || !grounded(right, said, 0.5)) return null;
      return { type: 'compare', data: { left, right } };
    }
    default: return null;
  }
}

/** جزء فيديو (مشهد موشن + صوت المصدر الأصلي لنفس الفترة) بنفس مواصفات باقي اللقطات عشان تتجمّع بـ-c copy من غير ما الصوت يتقطع */
export async function composeScenePart({ frames, src, srcStart, len, dest, W, H, enc }) {
  const fade = Math.min(0.03, len / 4);
  await ffmpeg(['-framerate', String(frames.fps), '-i', frames.pattern, '-ss', srcStart.toFixed(3), '-t', len.toFixed(3), '-i', src,
    '-filter_complex', `[0:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=30,format=yuv420p,trim=duration=${len.toFixed(3)},setpts=PTS-STARTPTS[v];[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=${fade},afade=t=out:st=${Math.max(0, len - fade).toFixed(3)}:d=${fade}[a]`,
    '-map', '[v]', '-map', '[a]', ...enc, '-c:a', 'aac', '-b:a', '160k', '-t', len.toFixed(3), dest]);
}
