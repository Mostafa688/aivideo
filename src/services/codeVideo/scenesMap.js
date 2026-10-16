// ── scenesMap.js ── خريطة ورق قديمة (زي خرايط الأفلام الوثائقية): ورقة خريطة بحدود الدول وخطوط الطول والعرض وبوصلة ومقياس،
// الكاميرا بتقرّب على المكان، دبوس نحاس بينزل عليه واسمه على شريط لاصق، وخيط أحمر بيوصّل بين الأماكن، والكلام على شريط ورق
import fs from 'fs';
import { f1, f2, clamp01, easeOutCubic, easeInOutCubic, easeOutBack, seg, lerp, txt, uid, esc } from './design.js';
import { boil, tape, paperStrip, corners, INK, DISPLAY } from './paper.js';
import { inkWords } from './scenesV.js';
import { kinetic } from './scenesA.js';

const WORLD = JSON.parse(fs.readFileSync(new URL('../documentary/worldPaths.json', import.meta.url), 'utf8'));
export const MAP_CODES = new Set(Object.keys(WORLD));
const ALL_LAND = Object.values(WORLD).join('');
// نفس إسقاط خريطة الأفلام الوثائقية (equirectangular): درجة → وحدة خريطة
const mapX = (lon) => 2.4979 * lon + 500.8;
const mapY = (lat) => -2.551 * lat + 301.66;

const boxCache = new Map();
function regionBox(code) {
  if (boxCache.has(code)) return boxCache.get(code);
  const d = WORLD[code]; let out = null;
  if (d) {
    const polys = d.split(/(?=M)/).map(sub => [...sub.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map(m => [+m[1], +m[2]])).filter(a => a.length);
    const bx = (pts) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
    out = polys.map(bx).sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];
  }
  boxCache.set(code, out); return out;
}

function camera(c, pts, regions, t) {
  const k0 = Math.max(c.w / 1000, c.h / 560);
  const frame = [...pts];
  for (const code of regions) { const b = regionBox(code); if (b) frame.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }); }
  const xs = frame.map(p => p.x), ys = frame.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(60, maxX - minX), spanY = Math.max(40, maxY - minY);
  const kt = Math.min(Math.max(Math.min((c.w * (c.portrait ? 0.7 : 0.55)) / spanX, (c.h * (c.portrait ? 0.32 : 0.42)) / spanY), k0), k0 * 12);
  const cxT = (minX + maxX) / 2, cyT = (minY + maxY) / 2 + (c.portrait ? 18 : 10) * (k0 / kt); // المكان فوق شوية عشان شريط الكلام تحت
  const p = easeInOutCubic(seg(t, 0.15, 1.5));
  const k = Math.exp(lerp(Math.log(k0 * 1.02), Math.log(kt), p)) * (1 + 0.025 * clamp01(seg(t, 1.5, 6)));
  const cx = lerp(500, cxT, p), cy = lerp(270, cyT, p);
  return { k, tx: c.w / 2 - cx * k, ty: c.h * (c.portrait ? 0.4 : 0.44) - cy * k };
}

/** دبوس نحاس بينزل من فوق */
function pin(c, x, y, p, id) {
  if (p <= 0) return '';
  const { s } = c, k = easeOutBack(clamp01(p)), r = 26 * s, drop = (1 - clamp01(p * 1.4)) * 120 * s;
  return `<defs><radialGradient id="${id}" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#fff3c4"/><stop offset="0.45" stop-color="#c9a24a"/><stop offset="1" stop-color="#6e5317"/></radialGradient></defs>`
    + `<ellipse cx="${f1(x + 10 * s)}" cy="${f1(y + 8 * s)}" rx="${f1(r * 0.9 * k)}" ry="${f1(r * 0.45 * k)}" fill="#000" opacity="${f2(0.3 * clamp01(p))}"/>`
    + `<g transform="translate(${f1(x)} ${f1(y - drop)}) scale(${f2(k)})"><circle r="${f1(r)}" fill="url(#${id})" stroke="#5a4412" stroke-width="${f1(2 * s)}"/><circle cx="${f1(-r * 0.3)}" cy="${f1(-r * 0.35)}" r="${f1(r * 0.22)}" fill="#fff" opacity="0.6"/></g>`;
}

/** بوصلة (وردة الرياح) مرسومة بالحبر */
function compass(c, x, y, R) {
  const { s } = c; let o = `<g transform="translate(${f1(x)} ${f1(y)})" opacity="0.85">`;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, L = i % 2 ? R * 0.55 : R, wdt = R * 0.16;
    const tip = [Math.sin(a) * L, -Math.cos(a) * L], l = [Math.sin(a - Math.PI / 2) * wdt, -Math.cos(a - Math.PI / 2) * wdt];
    o += `<path d="M0 0L${f1(l[0])} ${f1(l[1])}L${f1(tip[0])} ${f1(tip[1])}Z" fill="${INK}"/><path d="M0 0L${f1(-l[0])} ${f1(-l[1])}L${f1(tip[0])} ${f1(tip[1])}Z" fill="#f4ecd6" stroke="${INK}" stroke-width="${f1(1.2 * s)}"/>`;
  }
  o += `<circle r="${f1(R * 0.62)}" fill="none" stroke="${INK}" stroke-width="${f1(1.4 * s)}"/>`;
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([n, d]) => { const a = (d * Math.PI) / 180; o += `<text x="${f1(Math.sin(a) * R * 1.22)}" y="${f1(-Math.cos(a) * R * 1.22 + 11 * s)}" font-family="${DISPLAY}" font-size="${f1(30 * s)}" font-weight="700" fill="${INK}" text-anchor="middle">${n}</text>`; });
  return o + '</g>';
}

// ── خريطة ورق: places = [{ name, lat, lon }] (لحد 4)، regions = أكواد دول (لحد 3)، route = خيط بين الأماكن ──
export function papermap(c, d, t, dur, sc) {
  const places = (d.places || []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)).slice(0, 4);
  const regions = (d.regions || []).filter(code => MAP_CODES.has(code)).slice(0, 3);
  if (!places.length && !regions.length) return kinetic(c, d, t, dur, sc);
  const { w, h, s, portrait } = c; let o = '';
  const pts = places.map(p => ({ x: mapX(p.lon), y: mapY(p.lat) }));
  const cam = camera(c, pts, regions, t), k = cam.k, sw = (v) => f1((v * s) / k);
  const hid = uid(c, 'mh');
  o += `<rect width="${w}" height="${h}" fill="#e7dcc0"/>`;
  o += `<defs><pattern id="${hid}" width="${f1(8 / k * s)}" height="${f1(8 / k * s)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${f1(8 / k * s)}" stroke="#c1121f" stroke-width="${sw(2.4)}" opacity="0.55"/></pattern></defs>`;
  o += `<g transform="translate(${f1(cam.tx)} ${f1(cam.ty)}) scale(${f2(k)})">`;
  // بحر بخطوط تموّج خفيفة + خطوط طول وعرض
  let grid = '';
  for (let lon = -180; lon <= 180; lon += 15) grid += `M${f1(mapX(lon))} ${f1(mapY(85))}V${f1(mapY(-60))}`;
  for (let lat = -60; lat <= 80; lat += 15) grid += `M${f1(mapX(-180))} ${f1(mapY(lat))}H${f1(mapX(180))}`;
  o += `<rect x="-200" y="-100" width="1400" height="800" fill="#d9e2d6"/><path d="${grid}" stroke="#6d6450" stroke-width="${sw(1)}" stroke-dasharray="${sw(6)} ${sw(5)}" opacity="0.35" fill="none"/>`;
  o += `<path d="${ALL_LAND}" fill="#efe3c3" stroke="#5b4a2f" stroke-width="${sw(1.3)}" stroke-linejoin="round"/>`;
  regions.forEach((code, i) => {
    const op = clamp01(seg(t, 1.1 + i * 0.3, 1.6 + i * 0.3));
    if (op > 0) o += `<path d="${WORLD[code]}" fill="#f2c9b4" opacity="${f2(op)}"/><path d="${WORLD[code]}" fill="url(#${hid})" stroke="#c1121f" stroke-width="${sw(3)}" opacity="${f2(op)}"/>`;
  });
  o += '</g>';
  // أماكن: دبوس + خيط أحمر + اسم على شريط لاصق (إحداثيات الشاشة عشان الحجم يفضل ثابت)
  const sp = pts.map(p => ({ x: cam.tx + p.x * k, y: cam.ty + p.y * k }));
  const pinAt = (i) => 1.3 + i * 0.55;
  if (d.route && sp.length >= 2) {
    for (let i = 1; i < sp.length; i++) {
      const a = sp[i - 1], b = sp[i], pr = easeOutCubic(seg(t, pinAt(i) - 0.1, pinAt(i) + 0.5));
      if (pr <= 0) continue;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - Math.hypot(b.x - a.x, b.y - a.y) * 0.25, n = 24; let dd = `M${f1(a.x)} ${f1(a.y)}`;
      for (let j = 1; j <= n * pr; j++) { const u = j / n; dd += `L${f1((1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * mx + u * u * b.x)} ${f1((1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * my + u * u * b.y)}`; }
      o += `<path d="${dd}" stroke="#c1121f" stroke-width="${f1(5 * s)}" fill="none" stroke-dasharray="${f1(16 * s)} ${f1(10 * s)}" stroke-linecap="round"/>`;
    }
  }
  sp.forEach((p, i) => {
    o += pin(c, p.x, p.y, seg(t, pinAt(i), pinAt(i) + 0.45), uid(c, `pin${i}`));
    const name = places[i].name;
    if (name && t > pinAt(i) + 0.25) {
      const size = (portrait ? 46 : 44) * s, nw = Math.min(w * 0.6, [...name].length * size * 0.6 + size), nh = size * 1.5;
      const right = p.x < w * 0.62, lx = Math.max(30 * s, Math.min(w - nw - 30 * s, right ? p.x + 40 * s : p.x - 40 * s - nw)), ly = p.y - nh - 16 * s, bo = boil(t, i + sc.index, 1 * s);
      o += `<g transform="translate(${f1(bo.dx)} ${f1(bo.dy)})">` + paperStrip(c, { x: lx, y: ly, w: nw, h: nh, seed: i + 3, rot: right ? -2 : 2 }) + tape(c, lx + nw / 2, ly, 80 * s, right ? -8 : 8, i + 7) + txt(c, name, lx + nw / 2, ly + nh * 0.66, size, { weight: 900, fill: INK }) + '</g>';
    }
  });
  // ديكور ثابت: بوصلة، مقياس، ثنيات الورقة، زوايا
  o += compass(c, portrait ? w * 0.82 : w * 0.08, portrait ? h * 0.08 : h * 0.14, (portrait ? 64 : 70) * s);
  o += `<path d="M${f1(w * 0.5)} 0V${h}M0 ${f1(h * 0.5)}H${w}" stroke="#000" stroke-width="${f1(3 * s)}" opacity="0.07"/><path d="M${f1(w * 0.5 + 3 * s)} 0V${h}" stroke="#fff" stroke-width="${f1(2 * s)}" opacity="0.12"/>`;
  o += corners(c, { x: 40 * s, y: 40 * s, w: w - 80 * s, h: h - 80 * s, len: 60, p: seg(t, 0, 0.4), width: 5 });
  // الكلام على شريط ورق تحت
  const bx = { x: w * 0.08, y: h * (portrait ? 0.72 : 0.76), w: w * (portrait ? 0.84 : 0.6), h: h * (portrait ? 0.18 : 0.15) };
  if (t > 0.2) o += paperStrip(c, { x: bx.x - 24 * s, y: bx.y - 16 * s, w: bx.w + 48 * s, h: bx.h + 32 * s, seed: sc.index + 5, rot: -1 }) + inkWords(c, sc.tokens, t, bx, { emphasis: d.emphasis, color: INK, startSize: portrait ? 64 : 58, maxLines: 3 });
  return o;
}

export const SCENES_MAP = { papermap };
