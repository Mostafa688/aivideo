// ── w3d/build.js ── مساعدات بناء أجزاء المشهد
import { MESHES } from './mesh.js';
import { mul, chain, T, S, RX, RY, RZ } from './math.js';

/** جزء: kind = box|sph|cyl|cone|plane — size = [sx,sy,sz] (أو رقم) — W = تحويل العالم (affine) */
export function prim(kind, color, size, W = null, o = {}) {
  const sz = Array.isArray(size) ? size : [size, size, size];
  const mesh = kind === 'box' ? MESHES.box(o.k || 1) : kind === 'sph' ? MESHES.sph(o.seg || 8, o.ring || 5) : kind === 'cyl' ? MESHES.cyl(o.n || 8) : kind === 'cone' ? MESHES.cone(o.n || 8) : MESHES.plane(o.k || 1);
  const L = S(sz[0], sz[1], sz[2]);
  return { mesh, T: W ? mul(W, L) : L, color, layer: o.layer ?? 2, emissive: !!o.emissive, double: !!o.double, noFog: !!o.noFog };
}
/** تحويل من موضع + دوران (yaw,pitch,roll بالراديان) */
export const place = (x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0) => chain(T(x, y, z), RY(yaw), RX(pitch), RZ(roll));
