// ── w3d/rig.js ── شخصيات 3D low-poly: بشر (ملابس/شعر/إكسسوارات) وحيوانات رباعية — بتتبني كل إطار من الهيكل والحركة
import { T, S, RX, RY, RZ, chain, origin, mul } from './math.js';
import { prim } from './build.js';
import { poseFor, mergeMoving, MOVING_ACTS } from './anim.js';

export const HAIR_STYLES = ['short', 'long', 'bun', 'ponytail', 'afro', 'bald', 'cap', 'chef', 'helmet', 'hijab', 'mohawk', 'curly'];
export const ACCESSORIES = ['glasses', 'backpack', 'cape', 'apron', 'scarf', 'headband', 'tie', 'goggles', 'crown', 'medal'];
const dk = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0'); return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`; };

const SCALE = { kid: 0.7, adult: 0.95, tall: 1.06, big: 1.12 };

/** st: { x, z, yaw, pose (من anim.poseFor) } → { parts, hands:{l,r}, head, shadow } */
export function buildHumanoid(spec, st) {
  const s = (SCALE[spec.height] || SCALE.adult) * (spec.scale || 1), pose = st.pose, parts = [];
  const skin = spec.skin, top = spec.top, bottom = spec.bottom, shoes = spec.shoes || '#222233';
  const long = spec.sleeve === 'long', bs = spec.bottomStyle || 'shorts', socks = spec.socks || skin;
  const H = chain(T(st.x, 0.9 * s + pose.y * s, st.z), RY(st.yaw + pose.yaw), RZ(pose.roll), RX(pose.pitch));
  const Tt = chain(H, T(0, 0.08 * s, 0), RY(pose.twist), RX(pose.lean));
  const box = (col, sz, W, o) => parts.push(prim('box', col, sz.map(v => v * s), W, o));
  const sph = (col, sz, W, o) => parts.push(prim('sph', col, Array.isArray(sz) ? sz.map(v => v * s) : sz * s, W, o));
  const cyl = (col, d, l, W, o) => parts.push(prim('cyl', col, [d * s, l * s, d * s], W, { n: 7, ...o }));
  const cone = (col, sz, W, o) => parts.push(prim('cone', col, sz.map(v => v * s), W, o));
  // الجسم
  box(bs === 'skirt' ? top : bottom, [0.32, 0.18, 0.2], H);
  box(top, [0.38, 0.46, 0.22], chain(Tt, T(0, 0.25 * s, 0)));
  if (bs === 'skirt') parts.push(prim('cyl', bottom, [0.4 * s, 0.22 * s, 0.3 * s], chain(H, T(0, -0.1 * s, 0)), { n: 8 }));
  // الراس
  const Th = chain(Tt, T(0, 0.52 * s, 0), RY(pose.headYaw), RX(pose.headPitch), S(1.16));
  cyl(skin, 0.1, 0.1, chain(Th, T(0, 0.03 * s, 0)));
  sph(skin, 0.3, chain(Th, T(0, 0.19 * s, 0)), { seg: 9, ring: 6 });
  const hy = spec.hairStyle || 'short', hc = spec.hair || '#3a2a22', Hh = (x, y, z) => chain(Th, T(x * s, y * s, z * s));
  for (const ex of [-0.056, 0.056]) { sph('#f8fafc', 0.056, Hh(ex, 0.205, 0.122), { seg: 6, ring: 4 }); sph('#1b1b22', 0.03, Hh(ex, 0.205, 0.15), { seg: 5, ring: 3 }); }
  sph(dk(skin, 0.93), 0.045, Hh(0, 0.17, 0.148), { seg: 6, ring: 4 });
  box(pose.mouth ? '#7a1f2b' : '#8a3a3a', [0.06, pose.mouth ? 0.035 : 0.014, 0.01], Hh(0, 0.115, 0.142));
  const capDome = (col) => parts.push(prim('sph', col, [0.335 * s, 0.18 * s, 0.34 * s], Hh(0, 0.285, -0.01), { seg: 9, ring: 5 }));
  switch (hy) {
    case 'short': case 'curly': parts.push(prim('sph', hc, [0.335 * s, 0.17 * s, 0.34 * s], Hh(0, 0.285, -0.012), { seg: 9, ring: 5 })); if (hy === 'curly') for (const [x, z] of [[-0.1, 0.05], [0.1, 0.05], [0, -0.1], [-0.12, -0.05], [0.12, -0.05]]) sph(hc, 0.1, Hh(x, 0.34, z)); break;
    case 'afro': sph(hc, 0.4, Hh(0, 0.32, -0.08), { seg: 9, ring: 6 }); break;
    case 'bun': parts.push(prim('sph', hc, [0.335 * s, 0.17 * s, 0.34 * s], Hh(0, 0.285, -0.012), { seg: 9, ring: 5 })); sph(hc, 0.12, Hh(0, 0.4, -0.06)); break;
    case 'ponytail': parts.push(prim('sph', hc, [0.335 * s, 0.17 * s, 0.34 * s], Hh(0, 0.285, -0.012), { seg: 9, ring: 5 })); parts.push(prim('cyl', hc, [0.06 * s, 0.22 * s, 0.06 * s], chain(Hh(0, 0.2, -0.2), RX(-0.4)), { n: 6 })); break;
    case 'long': parts.push(prim('sph', hc, [0.335 * s, 0.17 * s, 0.34 * s], Hh(0, 0.285, -0.012), { seg: 9, ring: 5 })); box(hc, [0.31, 0.42, 0.08], Hh(0, 0.1, -0.12)); break;
    case 'cap': capDome(spec.hat || '#ef4444'); box(spec.hat || '#ef4444', [0.26, 0.02, 0.17], chain(Hh(0, 0.245, 0.17), RX(-0.12))); break;
    case 'chef': cyl('#f8fafc', 0.24, 0.18, Hh(0, 0.43, 0)); sph('#f8fafc', [0.3, 0.14, 0.3], Hh(0, 0.53, 0)); break;
    case 'helmet': parts.push(prim('sph', spec.hat || '#fbbf24', [0.37 * s, 0.3 * s, 0.38 * s], Hh(0, 0.27, -0.01), { seg: 9, ring: 5 })); break;
    case 'hijab': parts.push(prim('sph', spec.hat || '#7c3aed', [0.38 * s, 0.36 * s, 0.38 * s], Hh(0, 0.18, -0.055), { seg: 9, ring: 6 })); box(spec.hat || '#7c3aed', [0.46, 0.14, 0.32], chain(Tt, T(0, 0.5 * s, 0))); break;
    case 'mohawk': box(hc, [0.05, 0.14, 0.28], Hh(0, 0.37, -0.02)); break;
    default: break;
  }
  if (spec.beard === 'full') sph(hc, [0.2, 0.15, 0.16], Hh(0, 0.1, 0.065), { seg: 7, ring: 4 });
  else if (spec.beard === 'mustache') box(hc, [0.1, 0.025, 0.03], Hh(0, 0.14, 0.15));
  const acc = new Set(spec.accessories || []), ac = spec.accColor || '#334155';
  if (acc.has('glasses')) box('#111827', [0.17, 0.045, 0.012], Hh(0, 0.205, 0.148));
  if (acc.has('goggles')) box('#38bdf8', [0.2, 0.06, 0.02], Hh(0, 0.205, 0.15));
  if (acc.has('headband')) cyl(ac, 0.315, 0.035, Hh(0, 0.245, 0));
  if (acc.has('crown')) cone('#fbbf24', [0.16, 0.14, 0.16], Hh(0, 0.42, 0), { n: 5 });
  if (acc.has('scarf')) cyl(ac, 0.2, 0.07, chain(Tt, T(0, 0.5 * s, 0)));
  if (acc.has('tie')) box(ac, [0.06, 0.28, 0.02], chain(Tt, T(0, 0.28 * s, 0.115 * s)));
  if (acc.has('apron')) box('#f8fafc', [0.32, 0.4, 0.025], chain(Tt, T(0, 0.2 * s, 0.12 * s)));
  if (acc.has('backpack')) box(ac, [0.26, 0.34, 0.13], chain(Tt, T(0, 0.27 * s, -0.17 * s)));
  if (acc.has('cape')) box(ac, [0.38, 0.66, 0.03], chain(Tt, T(0, 0.12 * s, -0.14 * s), RX(0.12)));
  if (acc.has('medal')) sph('#fbbf24', 0.06, chain(Tt, T(0, 0.34 * s, 0.12 * s)));
  // الدراعات
  const hands = {};
  for (const sx of [-1, 1]) {
    const a = sx < 0 ? pose.aL : pose.aR;
    const Ua = chain(Tt, T(sx * 0.23 * s, 0.43 * s, 0), RZ(sx * a.out), RX(-a.f));
    sph(top, 0.13, Ua);
    cyl(long ? top : (spec.sleeve === 'none' ? skin : top), 0.11, 0.3, chain(Ua, T(0, -0.15 * s, 0)));
    const Ue = chain(Ua, T(0, -0.3 * s, 0), RX(-a.bend));
    sph(long ? top : skin, 0.1, Ue);
    cyl(long ? top : skin, 0.095, 0.27, chain(Ue, T(0, -0.135 * s, 0)));
    const Uh = chain(Ue, T(0, -0.27 * s, 0));
    sph(spec.gloves || skin, 0.115, Uh, { seg: 7, ring: 4 });
    hands[sx < 0 ? 'l' : 'r'] = origin(Uh);
  }
  // الرجلين
  for (const sx of [-1, 1]) {
    const l = sx < 0 ? pose.lL : pose.lR;
    const Ul = chain(H, T(sx * 0.09 * s, 0, 0), RZ(sx * l.out), RX(-l.f));
    const pants = bs === 'pants', thighCol = bs === 'skirt' ? skin : bottom;
    cyl(thighCol, 0.15, bs === 'shorts' ? 0.3 : 0.43, chain(Ul, T(0, bs === 'shorts' ? -0.15 * s : -0.215 * s, 0)));
    if (bs === 'shorts' || bs === 'skirt') cyl(skin, 0.13, 0.15, chain(Ul, T(0, -0.36 * s, 0)));
    const Uk = chain(Ul, T(0, -0.43 * s, 0), RX(l.bend));
    sph(pants ? bottom : skin, 0.13, Uk, { seg: 6, ring: 4 });
    cyl(pants ? bottom : (spec.socks ? socks : skin), 0.125, 0.4, chain(Uk, T(0, -0.2 * s, 0)));
    const Ukl = chain(Uk, T(0, -0.4 * s, 0));
    box(shoes, [0.12, 0.075, 0.23], chain(Ukl, T(0, -0.025 * s, 0.05 * s)));
  }
  const ax = origin(H);
  return { parts, hands, head: origin(Th), shadow: { x: st.x, z: st.z, rx: 0.34 * s, rz: 0.26 * s }, h: ax };
}

/** حيوان رباعي: كلب/قطة/حصان/بقرة/خروف/خنزير... */
export function buildQuadruped(spec, st) {
  const s = (spec.size || 1) * (spec.scale || 1), t = st.t || 0, parts = [], mv = st.moving ? 1 : 0, run = st.run ? 1 : 0;
  const body = spec.body, belly = spec.belly || body, leg = spec.legColor || body, ear = spec.ear || body;
  const ph = t * Math.PI * 2 * (run ? 2.2 : 1.4), bob = mv * Math.abs(Math.sin(ph)) * 0.03 * s;
  const lh = (spec.legLen || 0.34) * s, bl = (spec.bodyLen || 0.62) * s, bh = (spec.bodyH || 0.3) * s;
  const H = chain(T(st.x, lh + bh / 2 + bob + (st.pose?.y || 0) * s, st.z), RY(st.yaw), RX(st.pose?.pitch || 0), RZ(st.pose?.roll || 0));
  const box = (col, sz, W) => parts.push(prim('box', col, sz.map(v => v * s), W));
  const sph = (col, sz, W, o) => parts.push(prim('sph', col, Array.isArray(sz) ? sz.map(v => v * s) : sz * s, W, o));
  box(body, [bh * 0.95, bh, bl / s], H); box(belly, [bh * 0.9, bh * 0.35, bl / s * 0.92], chain(H, T(0, -bh * 0.35, 0)));
  const nodY = Math.sin(t * 2) * 0.03, headPitch = (st.pose?.headPitch || 0);
  const neck = (spec.neck ?? 0.05) * s;
  if (neck > 0.08) box(body, [0.17, neck / s * 1.5, 0.22], chain(H, T(0, bh * 0.35 + neck * 0.5, bl * 0.5 - 0.03 * s), RX(-0.35)));
  const Th = chain(H, T(0, bh * 0.35 + neck, bl * 0.5 + neck * 0.35), RX(headPitch + nodY));
  sph(body, (spec.headSize || 0.28), chain(Th, T(0, 0.08 * s, 0.1 * s)), { seg: 8, ring: 5 });
  const snout = spec.snout ?? 0.12; if (snout) box(spec.snoutColor || belly, [0.14, 0.11, snout * 1.4], chain(Th, T(0, 0.04 * s, 0.26 * s)));
  sph('#1b1b22', 0.04, chain(Th, T(-0.07 * s, 0.13 * s, 0.22 * s)), { seg: 6, ring: 4 }); sph('#1b1b22', 0.04, chain(Th, T(0.07 * s, 0.13 * s, 0.22 * s)), { seg: 6, ring: 4 });
  sph('#1b1b22', 0.04, chain(Th, T(0, 0.075 * s, 0.33 * s)), { seg: 6, ring: 4 });
  for (const sx of [-1, 1]) {
    if (spec.ears === 'floppy') box(ear, [0.07, 0.2, 0.1], chain(Th, T(sx * 0.14 * s, 0.1 * s, 0.07 * s), RZ(sx * 0.2)));
    else if (spec.ears === 'long') box(ear, [0.07, 0.3, 0.07], chain(Th, T(sx * 0.06 * s, 0.32 * s, 0.05 * s), RZ(-sx * 0.12)));
    else parts.push(prim('cone', ear, [0.1 * s, 0.14 * s, 0.1 * s], chain(Th, T(sx * 0.09 * s, 0.26 * s, 0.05 * s)), { n: 4 }));
    if (spec.horns) parts.push(prim('cone', '#f1e6c8', [0.05 * s, 0.14 * s, 0.05 * s], chain(Th, T(sx * 0.1 * s, 0.29 * s, 0.1 * s), RZ(-sx * 0.5)), { n: 5 }));
  }
  if (spec.tail !== false) parts.push(prim('cyl', body, [0.06 * s, 0.3 * s, 0.06 * s], chain(H, T(0, bh * 0.3, -bl * 0.52), RX(0.9 + Math.sin(t * 6) * 0.25 * (mv ? 0.4 : 1))), { n: 5 }));
  for (const [fx, fz, off] of [[-1, 1, 0], [1, 1, Math.PI], [-1, -1, Math.PI], [1, -1, 0]]) {
    const sw = mv ? Math.sin(ph + off) * (run ? 0.8 : 0.5) : 0;
    const U = chain(H, T(fx * bh * 0.38, -bh * 0.4, fz * bl * 0.4), RX(-sw));
    parts.push(prim('cyl', leg, [0.085 * s, (lh + bh * 0.4) / s * s, 0.085 * s].map(v => v), chain(U, T(0, -(lh + bh * 0.4) / 2, 0)), { n: 6 }));
    box(dk(leg, 0.7), [0.1, 0.05, 0.13], chain(U, T(0, -(lh + bh * 0.4), 0.02 * s)));
  }
  return { parts, hands: {}, head: origin(Th), shadow: { x: st.x, z: st.z, rx: bl * 0.6, rz: bh * 0.7, rot: -st.yaw + Math.PI / 2 } };
}
