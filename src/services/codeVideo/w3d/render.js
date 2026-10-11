// ── w3d/render.js ── رندر مجسمات low-poly بمنظور حقيقي إلى SVG: كاميرا، back-face culling، قص near-plane، إضاءة مسطّحة (Lambert + هيميسفير)، ضباب، ظلال بقعية، ترتيب بالعمق
import { sub, cross, dot, norm, add, scl, len, apply } from './math.js';
import { hexRgb } from '../design.js';

const f1 = (n) => (Math.round(n * 10) / 10).toString();
const colCache = new Map();
const rgbOf = (h) => { let v = colCache.get(h); if (!v) { v = hexRgb(h); colCache.set(h, v); } return v; };
const hex2 = (v) => { v = v < 0 ? 0 : v > 255 ? 255 : v; return (v | 0).toString(16).padStart(2, '0'); };

export function makeCamera({ pos, target, fov = 45, w, h }) {
  const f = norm(sub(target, pos)); let r = cross(f, [0, 1, 0]); if (len(r) < 1e-6) r = [1, 0, 0]; r = norm(r);
  const u = cross(r, f);
  return { pos, f, r, u, w, h, cx: w / 2, cy: h / 2, F: (h / 2) / Math.tan(fov * Math.PI / 360), fov };
}
const toCam = (cam, p) => { const d = sub(p, cam.pos); return [dot(d, cam.r), dot(d, cam.u), dot(d, cam.f)]; };

function clipNear(poly, near) { // poly: [[x,y,z]] بإحداثيات الكاميرا
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ina = a[2] >= near, inb = b[2] >= near;
    if (ina) out.push(a);
    if (ina !== inb) { const k = (near - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, near]); }
  }
  return out;
}

/**
 * parts: [{ mesh, T (affine), color, layer (0 أرضية/خلفية، 2 عادي), emissive, double, noFog }]
 * opts: { light:{dir,ambient,warm,cool}, fog:{color,near,far,max}, shadows:[{x,z,rx,rz,rot,op}], near }
 */
export function renderParts(parts, cam, opts = {}) {
  const light = { dir: norm(opts.light?.dir || [-0.45, 0.85, -0.35]), ambient: opts.light?.ambient ?? 0.6, gain: opts.light?.gain ?? 1.12, warm: opts.light?.warm || [1.04, 1.0, 0.92], cool: opts.light?.cool || [0.86, 0.92, 1.04] };
  const fog = opts.fog || null, near = opts.near || 0.2, fogRgb = fog ? rgbOf(fog.color) : null;
  const layers = [[], [], []]; let nPoly = 0;
  const { w, h, cx, cy, F } = cam, M = 40;
  for (const p of parts) {
    const m = p.mesh, V = m.verts.map(v => apply(p.T, v));
    const base = rgbOf(p.color), layer = p.layer ?? 2;
    const C = V.map(v => toCam(cam, v));
    // مركز الجزء للـdouble-sided
    for (const face of m.faces) {
      const a = V[face[0]], b = V[face[1]], c = V[face[2]];
      let n = cross(sub(b, a), sub(c, a)); const nl = len(n); if (nl < 1e-9) continue; n = [n[0] / nl, n[1] / nl, n[2] / nl];
      const toCamV = sub(cam.pos, a), facing = dot(n, toCamV);
      if (facing <= 0) { if (!p.double) continue; n = [-n[0], -n[1], -n[2]]; }
      let poly = face.map(i => C[i]);
      if (poly.every(q => q[2] < near)) continue;
      if (poly.some(q => q[2] < near)) { poly = clipNear(poly, near); if (poly.length < 3) continue; }
      const pts = poly.map(q => [cx + F * q[0] / q[2], cy - F * q[1] / q[2]]);
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, area = 0;
      for (let i = 0; i < pts.length; i++) { const q = pts[i], q2 = pts[(i + 1) % pts.length]; if (q[0] < minx) minx = q[0]; if (q[0] > maxx) maxx = q[0]; if (q[1] < miny) miny = q[1]; if (q[1] > maxy) maxy = q[1]; area += q[0] * q2[1] - q2[0] * q[1]; }
      if (maxx < -M || minx > w + M || maxy < -M || miny > h + M || Math.abs(area) < 0.6) continue;
      const depth = poly.reduce((s, q) => s + q[2], 0) / poly.length;
      let r, g, bl;
      if (p.emissive) { r = base[0]; g = base[1]; bl = base[2]; }
      else {
        const diff = Math.max(0, dot(n, light.dir)), k = light.ambient + (1 - light.ambient) * diff, up = 0.94 + 0.06 * n[1];
        const t = diff, tr = light.cool[0] + (light.warm[0] - light.cool[0]) * t, tg = light.cool[1] + (light.warm[1] - light.cool[1]) * t, tb = light.cool[2] + (light.warm[2] - light.cool[2]) * t;
        const gk = k * up * light.gain; r = base[0] * gk * tr; g = base[1] * gk * tg; bl = base[2] * gk * tb;
      }
      if (fog && !p.noFog && layer !== 0) { const f = Math.max(0, Math.min(1, (depth - fog.near) / (fog.far - fog.near))) * (fog.max ?? 1); r += (fogRgb[0] - r) * f; g += (fogRgb[1] - g) * f; bl += (fogRgb[2] - bl) * f; }
      const col = `#${hex2(r)}${hex2(g)}${hex2(bl)}`;
      layers[layer].push({ depth, svg: `<polygon points="${pts.map(q => `${f1(q[0])},${f1(q[1])}`).join(' ')}" fill="${col}" stroke="${col}" stroke-width="0.7" stroke-linejoin="round"/>` });
      nPoly++;
    }
  }
  let out = '';
  const flush = (arr) => { arr.sort((a, b) => b.depth - a.depth); for (const x of arr) out += x.svg; };
  flush(layers[0]);
  // ضباب الأرض بيتعمل كتدرّج في مساحة الشاشة (الأرض مستوية: المسافة بتتحسب من زاوية النزول تحت الأفق) — أدق بكتير من تضبيب كل مضلع حسب مركزه
  if (fog) {
    const Hc = Math.max(0.2, cam.pos[1]), pitchDown = -Math.asin(Math.max(-1, Math.min(1, cam.f[1]))), yH = cy - F * Math.tan(-pitchDown);
    const stops = []; const y0 = Math.max(0, Math.min(h, yH - h * 0.03));
    for (let i = 0; i <= 14; i++) {
      const y = y0 + (h - y0) * (i / 14), alpha = pitchDown + Math.atan((y - cy) / F);
      const d = alpha > 0.0005 ? Hc / Math.tan(alpha) : 1e9, ff = Math.max(0, Math.min(1, (d - fog.near) / (fog.far - fog.near))) * (fog.max ?? 1);
      stops.push(`<stop offset="${(i / 14).toFixed(3)}" stop-color="${fog.color}" stop-opacity="${(y < yH - 2 ? 0 : ff).toFixed(3)}"/>`);
    }
    out += `<defs><linearGradient id="hz${opts.hazeId || 0}" gradientUnits="userSpaceOnUse" x1="0" y1="${f1(y0)}" x2="0" y2="${f1(h)}">${stops.join('')}</linearGradient></defs><rect x="0" y="${f1(y0)}" width="${w}" height="${f1(h - y0)}" fill="url(#hz${opts.hazeId || 0})"/>`;
  }
  // ظلال بقعية على الأرض (شكل واحد معتم بالكامل جوه group واحد بشفافية → مفيش تغميق مضاعف عند التداخل)
  if (opts.shadows?.length) {
    let sh = '';
    for (const s of opts.shadows) {
      const pts = []; let ok = true;
      for (let i = 0; i < 14 && ok; i++) {
        const a = Math.PI * 2 * i / 14, lx = Math.cos(a) * s.rx, lz = Math.sin(a) * s.rz, cr = Math.cos(s.rot || 0), sr = Math.sin(s.rot || 0);
        const q = toCam(cam, [s.x + lx * cr - lz * sr, 0.02, s.z + lx * sr + lz * cr]);
        if (q[2] < near) { ok = false; break; }
        pts.push([cx + F * q[0] / q[2], cy - F * q[1] / q[2]]);
      }
      if (ok) sh += `<polygon points="${pts.map(q => `${f1(q[0])},${f1(q[1])}`).join(' ')}"/>`;
    }
    out += `<g fill="#0b1a10" opacity="${opts.shadowOpacity ?? 0.3}">${sh}</g>`;
  }
  flush(layers[1]); flush(layers[2]);
  return { svg: out, polys: nPoly };
}
