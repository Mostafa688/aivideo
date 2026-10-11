// ── fxLooks.js ── خلفيات أنماط الكارتون (سما/أوضة/ستوديو/مدينة) وفوكس (ورق/حبر) — نفس شكل خلفيات fx.js: { soft, crisp }
import { f1, f2, rand, rgba, mix, lighten, darken, uid } from './design.js';

export const CARTOON_BACKDROPS = ['sky', 'room', 'studio', 'city'];
export const VOX_BACKDROPS = ['paper', 'ink'];

const circ = (cx, cy, r) => `M${f1(cx - r)} ${f1(cy)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0z`;
const cloud = (x, y, r, op = 0.95) => `<g opacity="${op}" fill="#fff"><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/><circle cx="${f1(x + r * 0.9)}" cy="${f1(y + r * 0.15)}" r="${f1(r * 0.78)}"/><circle cx="${f1(x - r * 0.95)}" cy="${f1(y + r * 0.2)}" r="${f1(r * 0.7)}"/><rect x="${f1(x - r * 1.5)}" y="${f1(y + r * 0.2)}" width="${f1(r * 3)}" height="${f1(r * 0.75)}" rx="${f1(r * 0.37)}"/></g>`;

function sky(c, t, seed) {
  const { w, h, s, pal } = c; let o = '';
  const sx = w * (c.portrait ? 0.78 : 0.82), sy = h * (c.portrait ? 0.14 : 0.2);
  o += `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(120 * s)}" fill="${pal.a2}" opacity="0.28"/><circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(78 * s)}" fill="${pal.a2}"/>`;
  for (let i = 0; i < 4; i++) {
    const sp = 14 + i * 7, r = (46 + rand(i, seed) * 40) * s, x = ((rand(i, 3) * w * 1.4 + t * sp) % (w * 1.4)) - w * 0.2, y = h * (0.1 + rand(i, 5) * (c.portrait ? 0.34 : 0.3));
    o += cloud(x, y, r, 0.92);
  }
  const hill = (base, amp, col, ph, k) => { let d = `M0 ${h}`; for (let x = 0; x <= w; x += w / 24) d += ` L${f1(x)} ${f1(h * base - amp * Math.sin(x / w * 5 + ph + t * 0.05 * k))}`; return `<path d="${d} L${w} ${h} Z" fill="${col}"/>`; };
  o += hill(0.72, 36 * s, mix(pal.a3, '#ffffff', 0.45), 1.2, 1) + hill(0.82, 44 * s, mix(pal.a3, '#ffffff', 0.15), 3.1, -1) + hill(0.92, 30 * s, darken(pal.a3, 0.12), 0.4, 0.6);
  return { soft: '', crisp: o };
}

function room(c, t, seed) {
  const { w, h, s, pal } = c; let o = '';
  const wall = pal.bg[1], floorY = h * 0.84;
  o += `<rect x="0" y="${f1(h * 0.62)}" width="${w}" height="${f1(h * 0.38)}" fill="${darken(wall, 0.07)}"/><rect x="0" y="${f1(h * 0.62 - 7 * s)}" width="${w}" height="${f1(14 * s)}" fill="${lighten(pal.a1, 0.35)}" opacity="0.8"/>`;
  o += `<rect x="0" y="${f1(floorY)}" width="${w}" height="${f1(h - floorY)}" fill="${mix(pal.a2, '#8a5a2b', 0.5)}" opacity="0.55"/>`;
  const wx = c.portrait ? w * 0.12 : w * 0.06, wy = h * (c.portrait ? 0.1 : 0.14), ww = (c.portrait ? 360 : 380) * s, wh = (c.portrait ? 330 : 320) * s;
  o += `<rect x="${f1(wx - 14 * s)}" y="${f1(wy - 14 * s)}" width="${f1(ww + 28 * s)}" height="${f1(wh + 28 * s)}" rx="${f1(16 * s)}" fill="#fff"/><rect x="${f1(wx)}" y="${f1(wy)}" width="${f1(ww)}" height="${f1(wh)}" rx="${f1(8 * s)}" fill="${mix(pal.a3, '#9ad7ff', 0.7)}"/>`;
  o += cloud(wx + ww * (0.3 + 0.2 * Math.sin(t * 0.25)), wy + wh * 0.35, 38 * s, 0.9);
  o += `<path d="M${f1(wx + ww / 2)} ${f1(wy)}V${f1(wy + wh)}M${f1(wx)} ${f1(wy + wh / 2)}H${f1(wx + ww)}" stroke="#fff" stroke-width="${f1(10 * s)}"/>`;
  const fx = c.portrait ? w * 0.62 : w * 0.64, fy = h * (c.portrait ? 0.12 : 0.16);
  o += `<rect x="${f1(fx)}" y="${f1(fy)}" width="${f1(210 * s)}" height="${f1(150 * s)}" rx="${f1(10 * s)}" fill="#fff" stroke="${pal.a1}" stroke-width="${f1(10 * s)}"/><path d="M${f1(fx + 24 * s)} ${f1(fy + 118 * s)} L${f1(fx + 86 * s)} ${f1(fy + 50 * s)} L${f1(fx + 126 * s)} ${f1(fy + 92 * s)} L${f1(fx + 154 * s)} ${f1(fy + 66 * s)} L${f1(fx + 188 * s)} ${f1(fy + 118 * s)} Z" fill="${pal.a3}" opacity="0.85"/><circle cx="${f1(fx + 150 * s)}" cy="${f1(fy + 38 * s)}" r="${f1(16 * s)}" fill="${pal.a2}"/>`;
  return { soft: '', crisp: o };
}

function studio(c, t, seed) {
  const { w, h, s, pal } = c; let o = '';
  const cols = [pal.a1, pal.a2, pal.a3];
  for (let i = 0; i < 16; i++) {
    const x = ((rand(i, seed) * w * 1.1 + t * (10 + rand(i, 2) * 14) * (i % 2 ? 1 : -1)) % (w * 1.1) + w * 1.1) % (w * 1.1) - w * 0.05;
    const y = ((rand(i, 3) * h * 1.2 - t * (8 + rand(i, 4) * 12)) % (h * 1.2) + h * 1.2) % (h * 1.2) - h * 0.1;
    const r = (14 + rand(i, 5) * 36) * s, col = cols[i % 3], rot = t * 20 * (i % 2 ? 1 : -1) + i * 30, k = i % 4;
    const shape = k === 0 ? `<circle r="${f1(r)}" fill="${col}"/>` : k === 1 ? `<rect x="${f1(-r)}" y="${f1(-r)}" width="${f1(r * 2)}" height="${f1(r * 2)}" rx="${f1(r * 0.25)}" fill="${col}"/>` : k === 2 ? `<path d="M0 ${f1(-r * 1.1)} L${f1(r)} ${f1(r * 0.8)} L${f1(-r)} ${f1(r * 0.8)} Z" fill="${col}"/>` : `<path d="M${f1(-r)} 0H${f1(r)}M0 ${f1(-r)}V${f1(r)}" stroke="${col}" stroke-width="${f1(10 * s)}" stroke-linecap="round"/>`;
    o += `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)})">${shape}</g>`;
  }
  o = `<g opacity="0.2">${o}</g>`;
  o += `<rect y="${f1(h * 0.9)}" width="${w}" height="${f1(h * 0.1)}" fill="${pal.a1}" opacity="0.18"/>`;
  return { soft: '', crisp: o };
}

function city(c, t, seed) {
  const { w, h, s, pal } = c; let o = '';
  o += `<circle cx="${f1(w * 0.2)}" cy="${f1(h * 0.2)}" r="${f1(90 * s)}" fill="${pal.a2}" opacity="0.9"/>`;
  const layer = (n, hmin, hmax, col, speed, lit) => {
    let x = -((t * speed) % (w / n * 2)) - 40, k = 0, bd = '', wd = '';
    for (; x < w + 80; k++) {
      const ww = (w / n) * (0.8 + rand(k, seed) * 0.7), hh = h * (hmin + rand(k + 9, seed) * (hmax - hmin));
      bd += `M${f1(x)} ${f1(h - hh)}h${f1(ww)}v${f1(hh)}h${f1(-ww)}z`;
      if (lit) for (let wy = h - hh + 30 * s; wy < h - 30 * s; wy += 44 * s) for (let wx = x + 16 * s; wx < x + ww - 22 * s; wx += 34 * s) if (rand(wx + wy, k) > 0.55) wd += `M${f1(wx)} ${f1(wy)}h${f1(16 * s)}v${f1(22 * s)}h${f1(-16 * s)}z`;
      x += ww + 6 * s;
    }
    o += `<path d="${bd}" fill="${col}"/>` + (wd ? `<path d="${wd}" fill="${pal.a2}" opacity="0.85"/>` : '');
  };
  layer(7, 0.22, 0.46, mix(pal.a3, '#ffffff', 0.55), 6, false);
  layer(5, 0.14, 0.34, mix(pal.a3, '#1f2a44', 0.35), 14, true);
  return { soft: '', crisp: o };
}

function paper(c, t, seed) {
  const { w, h, s, pal } = c; let lines = '', dots = '', specks = '';
  const gap = 64 * s;
  for (let x = gap; x < w; x += gap) lines += `M${f1(x)} 0V${h}`;
  for (let y = gap; y < h; y += gap) lines += `M0 ${f1(y)}H${w}`;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9 - i; j++) dots += circ(w - 44 * s - i * 34 * s, 44 * s + j * 34 * s, (15 - i * 0.9 - j * 0.9) * s * 0.6);
  for (let i = 0; i < 40; i++) specks += circ(rand(i, seed) * w, rand(i, seed + 3) * h, (1 + rand(i, 8) * 2.4) * s);
  return { soft: '', crisp: `<path d="${lines}" stroke="${pal.text}" stroke-width="${f1(1.2 * s)}" opacity="0.05" fill="none"/><path d="${dots}" fill="${pal.a1}" opacity="0.2"/><path d="${specks}" fill="${pal.text}" opacity="0.09"/>` };
}

function ink(c, t, seed) {
  const { w, h, s, pal } = c; let lines = '', dots = '';
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10 - i; j++) dots += circ(44 * s + i * 36 * s, h - 44 * s - j * 36 * s, (16 - i - j) * s * 0.55);
  const gap = 90 * s;
  for (let x = gap; x < w; x += gap) lines += `M${f1(x)} 0V${h}`;
  return { soft: '', crisp: `<path d="${dots}" fill="${pal.a1}" opacity="0.18"/><path d="${lines}" stroke="#fff" stroke-width="${f1(1.2 * s)}" opacity="0.05" fill="none"/>` };
}

export const LOOK_BACKDROPS = { sky, room, studio, city, paper, ink };
