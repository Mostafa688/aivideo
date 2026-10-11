// ── w3d/math.js ── رياضيات 3D خفيفة: تحويلات affine (3x4) + متجهات
// affine = [a00,a01,a02,tx, a10,a11,a12,ty, a20,a21,a22,tz] (صفوف)
export const ID = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
export const T = (x = 0, y = 0, z = 0) => [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z];
export const S = (x = 1, y = x, z = x) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0];
export const RX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; };
export const RY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; };
export const RZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; };
/** A∘B (بيطبّق B الأول) */
export function mul(A, B) {
  return [
    A[0] * B[0] + A[1] * B[4] + A[2] * B[8], A[0] * B[1] + A[1] * B[5] + A[2] * B[9], A[0] * B[2] + A[1] * B[6] + A[2] * B[10], A[0] * B[3] + A[1] * B[7] + A[2] * B[11] + A[3],
    A[4] * B[0] + A[5] * B[4] + A[6] * B[8], A[4] * B[1] + A[5] * B[5] + A[6] * B[9], A[4] * B[2] + A[5] * B[6] + A[6] * B[10], A[4] * B[3] + A[5] * B[7] + A[6] * B[11] + A[7],
    A[8] * B[0] + A[9] * B[4] + A[10] * B[8], A[8] * B[1] + A[9] * B[5] + A[10] * B[9], A[8] * B[2] + A[9] * B[6] + A[10] * B[10], A[8] * B[3] + A[9] * B[7] + A[10] * B[11] + A[11],
  ];
}
/** سلسلة تحويلات: chain(A,B,C) = A∘B∘C */
export const chain = (...ms) => ms.reduce((a, b) => mul(a, b));
export const apply = (A, p) => [A[0] * p[0] + A[1] * p[1] + A[2] * p[2] + A[3], A[4] * p[0] + A[5] * p[1] + A[6] * p[2] + A[7], A[8] * p[0] + A[9] * p[1] + A[10] * p[2] + A[11]];
export const origin = (A) => [A[3], A[7], A[11]];

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
/** أقصر فرق بين زاويتين */
export const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
