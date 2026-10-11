// ── w3d/mesh.js ── مجسمات أولية (low-poly) متمركزة في الأصل: box, sphere, cylinder, cone, plane — بتتولّد مرة وبتتكيّش
import { sub, cross, dot } from './math.js';

function orient(m) { // يضمن إن ترتيب الأوجه ناحية الخارج (المجسمات محدبة وحوالين الأصل)
  m.faces = m.faces.map(f => {
    const a = m.verts[f[0]], b = m.verts[f[1]], c = m.verts[f[2]];
    const n = cross(sub(b, a), sub(c, a));
    const cx = f.reduce((s, i) => s + m.verts[i][0], 0) / f.length, cy = f.reduce((s, i) => s + m.verts[i][1], 0) / f.length, cz = f.reduce((s, i) => s + m.verts[i][2], 0) / f.length;
    return dot(n, [cx, cy, cz]) < 0 ? [...f].reverse() : f;
  });
  return m;
}
const cache = new Map();
const memo = (key, fn) => { let v = cache.get(key); if (!v) { v = fn(); cache.set(key, v); } return v; };

/** صندوق 1×1×1، k = تقسيم كل وجه لـk×k (للأسطح الكبيرة عشان الترتيب بالعمق يطلع صح) */
export const boxMesh = (k = 1) => memo(`box${k}`, () => {
  const verts = [], faces = [];
  const faceDefs = [[[-.5, -.5, .5], [1, 0, 0], [0, 1, 0]], [[.5, -.5, -.5], [-1, 0, 0], [0, 1, 0]], [[-.5, -.5, -.5], [0, 0, 1], [0, 1, 0]], [[.5, -.5, .5], [0, 0, -1], [0, 1, 0]], [[-.5, .5, .5], [1, 0, 0], [0, 0, -1]], [[-.5, -.5, -.5], [1, 0, 0], [0, 0, 1]]];
  for (const [o, u, v] of faceDefs) {
    const base = verts.length;
    for (let j = 0; j <= k; j++) for (let i = 0; i <= k; i++) verts.push([o[0] + u[0] * i / k + v[0] * j / k, o[1] + u[1] * i / k + v[1] * j / k, o[2] + u[2] * i / k + v[2] * j / k]);
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const a = base + j * (k + 1) + i; faces.push([a, a + 1, a + k + 2, a + k + 1]); }
  }
  return orient({ verts, faces });
});

/** كورة قطرها 1 */
export const sphereMesh = (seg = 8, ring = 5) => memo(`sph${seg}_${ring}`, () => {
  const verts = [[0, .5, 0], [0, -.5, 0]], faces = [];
  for (let r = 1; r < ring; r++) { const phi = Math.PI * r / ring, y = Math.cos(phi) * .5, rr = Math.sin(phi) * .5; for (let s = 0; s < seg; s++) { const th = Math.PI * 2 * s / seg; verts.push([Math.cos(th) * rr, y, Math.sin(th) * rr]); } }
  const at = (r, s) => 2 + (r - 1) * seg + (s % seg);
  for (let s = 0; s < seg; s++) faces.push([0, at(1, s + 1), at(1, s)]);
  for (let r = 1; r < ring - 1; r++) for (let s = 0; s < seg; s++) faces.push([at(r, s), at(r, s + 1), at(r + 1, s + 1), at(r + 1, s)]);
  for (let s = 0; s < seg; s++) faces.push([1, at(ring - 1, s), at(ring - 1, s + 1)]);
  return orient({ verts, faces });
});

/** أسطوانة نصف قطرها .5 وطولها 1 على محور y */
export const cylMesh = (n = 8) => memo(`cyl${n}`, () => {
  const verts = [], faces = [];
  for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n; verts.push([Math.cos(a) * .5, .5, Math.sin(a) * .5], [Math.cos(a) * .5, -.5, Math.sin(a) * .5]); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i * 2, j * 2, j * 2 + 1, i * 2 + 1]); }
  faces.push(Array.from({ length: n }, (_, i) => i * 2), Array.from({ length: n }, (_, i) => i * 2 + 1));
  return orient({ verts, faces });
});

/** مخروط: قاعدة نصف قطرها .5 عند y=-.5 وقمة عند y=.5 */
export const coneMesh = (n = 8) => memo(`cone${n}`, () => {
  const verts = [[0, .5, 0]], faces = [];
  for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n; verts.push([Math.cos(a) * .5, -.5, Math.sin(a) * .5]); }
  for (let i = 0; i < n; i++) faces.push([0, 1 + i, 1 + (i + 1) % n]);
  faces.push(Array.from({ length: n }, (_, i) => 1 + i));
  return orient({ verts, faces });
});

/** مستوى أفقي 1×1 (y=0) بتقسيم k×k وبيبص لفوق */
export const planeMesh = (k = 1) => memo(`pl${k}`, () => {
  const verts = [], faces = [];
  for (let j = 0; j <= k; j++) for (let i = 0; i <= k; i++) verts.push([-.5 + i / k, 0, -.5 + j / k]);
  for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) { const a = j * (k + 1) + i; faces.push([a, a + k + 1, a + k + 2, a + 1]); }
  // الاتجاه: normal لفوق (+y)
  faces.forEach((f, i) => { const m = { verts }; const a = verts[f[0]], b = verts[f[1]], c = verts[f[2]]; if (cross(sub(b, a), sub(c, a))[1] < 0) faces[i] = [...f].reverse(); });
  return { verts, faces };
});

export const MESHES = { box: boxMesh, sph: sphereMesh, cyl: cylMesh, cone: coneMesh, plane: planeMesh };
