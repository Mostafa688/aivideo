// ── fx.js ── خلفيات متحركة (من غير فلاتر تقيلة: تدرّجات شعاعية بس) + كاميرا + طبقات نهائية
import { f1, f2, rand, clamp01, lerp, easeInOutCubic, rgba, mix, lighten, darken, uid } from './design.js';
import { LOOK_BACKDROPS } from './fxLooks.js';

export const BACKDROPS = ['aurora', 'grid', 'particles', 'rays', 'waves', 'hex', 'bokeh', 'stripes', 'orbits'];

function baseGradient(c) {
  const [b1, b2, b3] = c.pal.bg;
  const id = uid(c, 'bg');
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0.55" y2="1"><stop offset="0" stop-color="${b1}"/><stop offset="0.55" stop-color="${b2}"/><stop offset="1" stop-color="${b3}"/></linearGradient></defs><rect width="${c.w}" height="${c.h}" fill="url(#${id})"/>`;
}
const blob = (c, name, col, op) => `<radialGradient id="${uid(c, name)}"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset="0.55" stop-color="${col}" stop-opacity="${f2(op * 0.35)}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient>`;

function aurora(c, t, seed) {
  const { w, h, pal } = c; const m = Math.max(w, h);
  const cols = [pal.a1, pal.a2, pal.a1, pal.a2, pal.a3];
  let defs = '<defs>', body = '';
  cols.forEach((col, i) => { defs += blob(c, `ab${i}`, col, (pal.dark ? 0.42 : 0.3) * (i === 4 ? 0.45 : 1)); });
  cols.forEach((col, i) => {
    const ph = seed * 1.3 + i * 1.7;
    const cx = w * (0.5 + 0.42 * Math.sin(t * 0.32 + ph)), cy = h * (0.5 + 0.38 * Math.cos(t * 0.27 + ph * 1.3));
    body += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(m * (0.5 + 0.12 * Math.sin(t * 0.5 + i)))}" fill="url(#${uid(c, `ab${i}`)})"/>`;
  });
  const bx = ((t * 60 + seed * 200) % (w * 2.4)) - w * 0.7;
  const bid = uid(c, 'band');
  defs += `<linearGradient id="${bid}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="${pal.dark ? 0.07 : 0.25}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>`;
  body += `<polygon points="${f1(bx)},0 ${f1(bx + w * 0.35)},0 ${f1(bx + w * 0.1)},${h} ${f1(bx - w * 0.25)},${h}" fill="url(#${bid})"/>`;
  return { soft: defs + body, crisp: dust(c, t, seed, 26) };
}

function dust(c, t, seed, n = 30, col = '#fff') {
  const { w, h, s } = c; let o = '';
  for (let i = 0; i < n; i++) {
    const sp = 6 + rand(i, seed) * 22, x = (rand(i, 1 + seed) * w + t * sp * (i % 2 ? 1 : -0.6) + w * 4) % w;
    const y = (rand(i, 2 + seed) * h - t * sp * 0.8 + h * 4) % h;
    const r = (1.2 + rand(i, 3) * 3.4) * s, tw = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + rand(i, 4)) + i));
    o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${col}" opacity="${f2((c.pal.dark ? 0.55 : 0.4) * tw * (0.4 + rand(i, 5) * 0.6))}"/>`;
  }
  return o;
}

function grid(c, t, seed) {
  const { w, h, s, pal } = c; const hy = h * (c.portrait ? 0.5 : 0.56);
  const gid = uid(c, 'sky'), sid = uid(c, 'sun');
  let o = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.bg[0]}"/><stop offset="1" stop-color="${mix(pal.bg[2], pal.a2, 0.25)}"/></linearGradient>${blob(c, 'sun', pal.a2, 0.85)}</defs>`;
  o += `<rect width="${w}" height="${hy.toFixed(1)}" fill="url(#${gid})"/><rect y="${hy.toFixed(1)}" width="${w}" height="${(h - hy).toFixed(1)}" fill="${pal.bg[0]}"/>`;
  let cr = '';
  for (let i = 0; i < 40; i++) cr += `<circle cx="${f1(rand(i, seed) * w)}" cy="${f1(rand(i, 7) * hy * 0.9)}" r="${f1((0.8 + rand(i, 8) * 1.8) * s)}" fill="#fff" opacity="${f2(0.2 + 0.6 * Math.abs(Math.sin(t * 0.8 + i)))}"/>`;
  o += `<circle cx="${w / 2}" cy="${hy.toFixed(1)}" r="${f1(Math.min(w, h) * 0.34)}" fill="url(#${sid})"/>`;
  const N = 16, off = (t * 0.55) % 1;
  for (let k = 0; k < N; k++) {
    const p = ((k + off) / N), y = hy + (h - hy) * Math.pow(p, 2.3);
    cr += `<line x1="0" y1="${f1(y)}" x2="${w}" y2="${f1(y)}" stroke="${pal.a1}" stroke-opacity="${f2(0.12 + 0.55 * p)}" stroke-width="${f1((1 + 3.5 * p) * s)}"/>`;
  }
  const J = 22;
  for (let j = -J / 2; j <= J / 2; j++) {
    const xb = w / 2 + j * (w / 6.5);
    cr += `<line x1="${f1(w / 2 + j * w * 0.012)}" y1="${f1(hy)}" x2="${f1(xb)}" y2="${h}" stroke="${pal.a1}" stroke-opacity="0.35" stroke-width="${f1(2.2 * s)}"/>`;
  }
  cr += `<rect y="${f1(hy - 3 * s)}" width="${w}" height="${f1(6 * s)}" fill="${pal.a2}" opacity="0.55"/>`;
  return { soft: o, crisp: cr };
}

function particles(c, t, seed) {
  const { w, h, s, pal } = c; const n = c.portrait ? 22 : 28;
  const pts = Array.from({ length: n }, (_, i) => ({
    x: w * (0.06 + 0.88 * (0.5 + 0.5 * Math.sin(t * (0.12 + rand(i, seed) * 0.2) + rand(i, 2) * 6.28))),
    y: h * (0.06 + 0.88 * (0.5 + 0.5 * Math.cos(t * (0.1 + rand(i, 3 + seed) * 0.18) + rand(i, 4) * 6.28))),
    r: (3 + rand(i, 5) * 6) * s, hue: i % 3,
  }));
  const maxD = Math.min(w, h) * 0.3; const soft = '<defs>' + blob(c, 'pn', pal.a1, 0.5) + '</defs>' + `<circle cx="${w * 0.2}" cy="${h * 0.25}" r="${Math.max(w, h) * 0.5}" fill="url(#${uid(c, 'pn')})" opacity="0.5"/>`; let o = '';
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    if (d < maxD) o += `<line x1="${f1(pts[i].x)}" y1="${f1(pts[i].y)}" x2="${f1(pts[j].x)}" y2="${f1(pts[j].y)}" stroke="${pal.a1}" stroke-opacity="${f2((1 - d / maxD) * 0.5)}" stroke-width="${f1(1.6 * s)}"/>`;
  }
  for (const p of pts) { const col = [pal.a1, pal.a2, pal.a3][p.hue]; o += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r)}" fill="${col}" opacity="0.9"/><circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="${f1(p.r * 2.6)}" fill="${col}" opacity="0.14"/>`; }
  return { soft, crisp: o };
}

function rays(c, t, seed) {
  const { w, h, pal } = c; const cx = w * (c.portrait ? 0.5 : 0.62), cy = h * 0.42, R = Math.hypot(w, h);
  const id = uid(c, 'ray');
  let o = `<defs><radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(R * 0.7)}"><stop offset="0" stop-color="${pal.a1}" stop-opacity="0.55"/><stop offset="0.7" stop-color="${pal.a2}" stop-opacity="0.12"/><stop offset="1" stop-color="${pal.a2}" stop-opacity="0"/></radialGradient></defs>`;
  const n = 18, rot = t * 0.06 + seed;
  for (let i = 0; i < n; i += 2) {
    const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
    o += `<polygon points="${f1(cx)},${f1(cy)} ${f1(cx + Math.cos(a0) * R)},${f1(cy + Math.sin(a0) * R)} ${f1(cx + Math.cos(a1) * R)},${f1(cy + Math.sin(a1) * R)}" fill="url(#${id})" opacity="0.65"/>`;
  }
  o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(Math.min(w, h) * 0.18)}" fill="${pal.a1}" opacity="0.18"/>`;
  return { soft: o, crisp: dust(c, t, seed, 18) };
}

function waves(c, t, seed) {
  const { w, h, pal } = c; let o = '';
  const layers = [[pal.a1, 0.2, 0.62, 0.9, 1], [pal.a2, 0.16, 0.7, 1.3, -1], [pal.a3, 0.2, 0.79, 1.7, 1], [pal.a1, 0.28, 0.88, 2.1, -1]];
  layers.forEach(([col, op, base, sp, dir], li) => {
    let d = `M0 ${h}`; const amp = h * 0.035 * (1 + li * 0.15);
    for (let x = 0; x <= w + 1; x += w / 40) d += ` L${f1(x)} ${f1(h * base + amp * Math.sin((x / w) * Math.PI * 2 * (1.3 + li * 0.4) + t * sp * dir + seed))}`;
    d += ` L${w} ${h} Z`;
    o += `<path d="${d}" fill="${col}" opacity="${op}"/>`;
  });
  return { soft: o, crisp: dust(c, t, seed, 22) };
}

function hex(c, t, seed) {
  const { w, h, s, pal } = c; const R = (c.portrait ? 74 : 84) * s; const dx = R * 1.5, dy = R * Math.sqrt(3);
  let o = '';
  for (let col = -1; col * dx < w + R; col++) for (let row = -1; row * dy < h + R; row++) {
    const x = col * dx, y = row * dy + (col % 2 ? dy / 2 : 0);
    const ph = rand(col * 13 + row * 7, seed) * 6.28, pulse = 0.5 + 0.5 * Math.sin(t * 0.9 + ph + (x + y) * 0.002);
    const pts = Array.from({ length: 6 }, (_, k) => `${f1(x + Math.cos(k * Math.PI / 3) * R * 0.92)},${f1(y + Math.sin(k * Math.PI / 3) * R * 0.92)}`).join(' ');
    const hot = pulse > 0.86;
    o += `<polygon points="${pts}" fill="${hot ? pal.a1 : 'none'}" fill-opacity="${hot ? f2((pulse - 0.86) * 3) : 0}" stroke="${pal.a1}" stroke-opacity="${f2(0.08 + 0.22 * pulse)}" stroke-width="${f1(2 * s)}"/>`;
  }
  return { soft: '', crisp: o };
}

function bokeh(c, t, seed) {
  const { w, h, pal } = c; let defs = '<defs>', o = '';
  [pal.a1, pal.a2, pal.a3].forEach((col, i) => { defs += blob(c, `bk${i}`, col, 0.55); });
  defs += '</defs>';
  for (let i = 0; i < 16; i++) {
    const r = Math.min(w, h) * (0.06 + rand(i, seed) * 0.16), x = ((rand(i, 2) * w * 1.2 + t * (8 + rand(i, 3) * 14) * (i % 2 ? 1 : -1)) % (w * 1.2) + w * 1.2) % (w * 1.2) - w * 0.1;
    const y = ((rand(i, 4) * h * 1.3 - t * (10 + rand(i, 5) * 20)) % (h * 1.3) + h * 1.3) % (h * 1.3) - h * 0.15;
    o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="url(#${uid(c, `bk${i % 3}`)})" opacity="${f2(0.5 + 0.4 * Math.sin(t + i))}"/>`;
  }
  return { soft: defs + o, crisp: '' };
}

function stripes(c, t, seed) {
  const { w, h, pal } = c; const gap = Math.min(w, h) * 0.22; let o = '';
  const off = (t * 40 + seed * 50) % (gap * 2);
  for (let k = -12; k < 24; k++) {
    const x = k * gap * 2 + off;
    o += `<polygon points="${f1(x)},0 ${f1(x + gap)},0 ${f1(x + gap - h * 0.45)},${h} ${f1(x - h * 0.45)},${h}" fill="${k % 3 === 0 ? pal.a1 : pal.a2}" opacity="${pal.dark ? 0.07 : 0.1}"/>`;
  }
  return { soft: o + `<rect y="${f1(h * 0.82)}" width="${w}" height="${f1(h * 0.18)}" fill="${pal.a1}" opacity="0.08"/>`, crisp: '' };
}

function orbits(c, t, seed) {
  const { w, h, s, pal } = c; const cx = w * (c.portrait ? 0.5 : 0.7), cy = h * (c.portrait ? 0.3 : 0.5); let o = '';
  for (let i = 1; i <= 6; i++) {
    const r = Math.min(w, h) * 0.12 * i, a = t * (0.4 / i) * (i % 2 ? 1 : -1) + seed * i;
    o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="none" stroke="${pal.a1}" stroke-opacity="${f2(0.28 - i * 0.03)}" stroke-width="${f1(2 * s)}" stroke-dasharray="${f1(10 * s)} ${f1(18 * s)}"/>`;
    o += `<circle cx="${f1(cx + Math.cos(a) * r)}" cy="${f1(cy + Math.sin(a) * r)}" r="${f1((5 + i) * s)}" fill="${[pal.a1, pal.a2, pal.a3][i % 3]}" opacity="0.95"/>`;
  }
  o += `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(16 * s)}" fill="${pal.a2}" opacity="0.9"/>`;
  return { soft: '', crisp: o };
}

const FNS = { aurora, grid, particles, rays, waves, hex, bokeh, stripes, orbits, ...LOOK_BACKDROPS };

const parallax = (c, cam, inner) => (cam ? `<g transform="translate(${f1(cam.x * 0.35)} ${f1(cam.y * 0.35)}) translate(${c.w / 2} ${c.h / 2}) scale(${f2(1 + (cam.z - 1) * 0.5)}) translate(${-c.w / 2} ${-c.h / 2})">${inner}</g>` : inner);

/** الطبقة الناعمة (تدرّج أساسي + توهّجات + vignette) — بتتحوّل لصورة منخفضة الدقة (plate) وبتتكبّر: أرخص بكتير من رسمها كاملة كل إطار */
export function backdropSoftSvg(c, t, variant = 'aurora', seed = 0, cam = null) {
  const fn = FNS[variant] || aurora; const layers = fn(c, t, seed);
  const gid = uid(c, 'cg');
  const glow = `<defs><radialGradient id="${gid}"><stop offset="0" stop-color="${c.pal.a1}" stop-opacity="${c.pal.dark ? 0.17 : 0.12}"/><stop offset="1" stop-color="${c.pal.a1}" stop-opacity="0"/></radialGradient></defs><circle cx="${f1(c.w / 2)}" cy="${f1(c.h * 0.46)}" r="${f1(Math.max(c.w, c.h) * 0.46)}" fill="url(#${gid})"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}" viewBox="0 0 ${c.w} ${c.h}">${baseGradient(c)}${parallax(c, cam, layers.soft)}${glow}${finish(c)}</svg>`;
}
/** الطبقة الحادة (خطوط/نقط/سداسيات) — بتتحط فوق الـplate بدقة كاملة */
export function backdropCrisp(c, t, variant = 'aurora', seed = 0, cam = null) {
  const fn = FNS[variant] || aurora; const layers = fn(c, t, seed);
  return parallax(c, cam, layers.crisp);
}

/** حركة كاميرا بطيئة للمحتوى: بترجّع {x,y,z} + transform string */
export function camera(c, kind, t, dur) {
  const p = clamp01(t / Math.max(0.5, dur)), e = easeInOutCubic(p), A = 0.045;
  let x = 0, y = 0, z = 1;
  switch (kind) {
    case 'push': z = 1 + A * e; break;
    case 'pull': z = 1 + A * (1 - e); break;
    case 'left': x = c.w * 0.025 * (0.5 - e); z = 1.03; break;
    case 'right': x = c.w * 0.025 * (e - 0.5); z = 1.03; break;
    case 'up': y = c.h * 0.02 * (0.5 - e); z = 1.03; break;
    case 'drift': x = c.w * 0.012 * Math.sin(t * 0.7); y = c.h * 0.01 * Math.cos(t * 0.5); z = 1.025; break;
    default: break;
  }
  const tf = `translate(${f1(c.w / 2 + x)} ${f1(c.h / 2 + y)}) scale(${f2(z)}) translate(${f1(-c.w / 2)} ${f1(-c.h / 2)})`;
  return { x, y, z, tf };
}

/** طبقة نهائية: vignette */
export function finish(c) {
  const { w, h, pal } = c; const id = uid(c, 'vg');
  return `<defs><radialGradient id="${id}" cx="0.5" cy="0.5" r="0.78"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${pal.dark ? 0.5 : 0.14}"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`;
}
