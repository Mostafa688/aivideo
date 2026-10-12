// ── w3d/envs.js ── بيئات 3D جاهزة (من أشكال أولية) + نقاط ارتكاز مسمّاة (anchors) عشان الـLLM يشاور عليها بالاسم
import { prim, place } from './build.js';
import { PROPS } from './props.js';
import { rand } from '../design.js';

const plane = (col, w, d, x, y, z, o = {}) => prim('plane', col, [w, 1, d], place(x, y, z, o.yaw || 0), { layer: o.layer ?? 0, k: o.k || 1 });
const box = (col, sx, sy, sz, x, y, z, o = {}) => prim('box', col, [sx, sy, sz], place(x, y, z, o.yaw || 0), o);
export const put = (type, x, z, o = {}) => { const f = PROPS[type]; return f ? f(place(x, o.y || 0, z, o.yaw || 0), o.color || null, o.scale || 1, o) : []; };

const SKY = { day: ['#69b7ee', '#d4ecff'], dusk: ['#5b6bd6', '#ffb88a'], night: ['#0b1030', '#2a3a7a'], indoor: ['#e8eef7', '#f5f7fb'], space: ['#02030a', '#0b1030'] };

function scatterTrees(parts, type, n, seed, keepOut, minR, maxR, colors) {
  for (let i = 0; i < n; i++) {
    const a = rand(i, seed) * Math.PI * 2, r = minR + rand(i, seed + 1) * (maxR - minR), x = Math.cos(a) * r * 1.4, z = Math.sin(a) * r;
    if (Math.hypot(x - keepOut[0], z - keepOut[1]) < keepOut[2]) continue;
    parts.push(...put(type, x, z, { scale: 0.8 + rand(i, seed + 2) * 0.7, color: colors ? colors[i % colors.length] : null }));
  }
}

export const ENVS = {
  pitch: () => {
    const parts = [plane('#3a4a3d', 800, 800, 0, 0, 0), plane('#3d9a4f', 28, 17, 0, 0.005, 0, { layer: 0 })];
    for (let i = 0; i < 9; i++) if (i % 2) parts.push(plane('#45a85a', 28 / 9, 17, -14 + 28 / 9 * (i + 0.5), 0.008, 0));
    const L = '#f4f7f2', ln = (w, d, x, z) => parts.push(plane(L, w, d, x, 0.012, z));
    ln(26, 0.12, 0, 7.5); ln(26, 0.12, 0, -7.5); ln(0.12, 15, 13, 0); ln(0.12, 15, -13, 0); ln(0.12, 15, 0, 0);
    for (const sx of [-1, 1]) { ln(0.12, 8, sx * 10, 0); ln(3, 0.12, sx * 11.5, 4); ln(3, 0.12, sx * 11.5, -4); }
    for (let i = 0; i < 20; i++) { const a = Math.PI * 2 * i / 20; parts.push(plane(L, 0.7, 0.12, Math.cos(a) * 2.2, 0.012, Math.sin(a) * 2.2, { yaw: -a + Math.PI / 2 })); }
    parts.push(...put('goal', 13, 0, { yaw: -Math.PI / 2 }), ...put('goal', -13, 0, { yaw: Math.PI / 2 }));
    const cols = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];
    for (let i = 0; i < 11; i++) { parts.push(box('#2d3340', 2.6, 2.8, 0.2, -14 + i * 2.8, 1.4, 9, { k: 2 }), box(cols[i % 4], 2.5, 0.5, 0.05, -14 + i * 2.8, 0.7, 8.85)); parts.push(box('#2d3340', 2.6, 2.8, 0.2, -14 + i * 2.8, 1.4, -9, { k: 2 })); }
    parts.push(box('#2d3340', 0.2, 2.8, 18, 14.8, 1.4, 0, { k: 3 }), box('#2d3340', 0.2, 2.8, 18, -14.8, 1.4, 0, { k: 3 }));
    for (const [x, z] of [[-13, 8], [13, 8], [-13, -8], [13, -8]]) parts.push(...put('lamppost', x, z));
    return { parts, sky: 'day', fog: '#d4ecff', anchors: { center: [0, 0], goalRight: [11.5, 0], goalLeft: [-11.5, 0], penaltyRight: [9.5, 0], penaltyLeft: [-9.5, 0], leftWing: [-5, -5], rightWing: [5, -5], leftWingTop: [-5, 5], rightWingTop: [5, 5], bench: [0, -9], midLeft: [-4, 0], midRight: [4, 0] }, cam: { dist: 9, height: 5.5, angle: 20, bounds: [-13.6, 13.6, -8.3, 8.3] } };
  },
  kitchen: () => {
    const parts = [plane('#f4efe6', 40, 40, 0, 0, 0)];
    for (let i = -4; i < 4; i++) for (let j = -3; j < 3; j++) if ((i + j) % 2 === 0) parts.push(plane('#dfe5ec', 2, 2, i * 2 + 1, 0.004, j * 2 + 1));
    parts.push(box('#fde9d0', 20, 5.2, 0.2, 0, 2.6, 4.2, { k: 4 }), box('#f7dcc0', 0.2, 5.2, 14, -9.6, 2.6, -2, { k: 4 }), box('#f7dcc0', 0.2, 5.2, 14, 9.6, 2.6, -2, { k: 4 }));
    for (const x of [-4, -2, 0, 2, 4]) parts.push(...put('counter', x, 3.7, {}));
    parts.push(...put('stove', 1, 3.65), ...put('fridge', -6.5, 3.6), ...put('counter', -6, 1.6, { yaw: Math.PI / 2 }));
    for (const x of [-4, -2, 0, 2, 4]) parts.push(box('#c2874a', 1.95, 0.9, 0.4, x, 3.6, 3.95));
    parts.push(box('#9bd1ff', 2.2, 1.3, 0.05, -2.5, 2.6, 4.08), box('#f8fafc', 2.4, 0.08, 0.1, -2.5, 3.28, 4.05));
    parts.push(...put('table', 5.2, -0.5, { scale: 1.1 }), ...put('chair', 3.9, -0.5, { yaw: Math.PI / 2 }), ...put('chair', 6.5, -0.5, { yaw: -Math.PI / 2 }));
    return { parts, sky: 'indoor', fog: '#f5f7fb', light: { ambient: 0.68 }, anchors: { center: [0, -1], openFloor: [0, 0.4], stove: [1, 2.9], counter: [-2, 2.9], fridge: [-6.5, 2.9], sink: [-3.5, 2.9], door: [7, -4], table: [5.2, -0.5], tableSeatLeft: [3.9, -0.5], tableSeatRight: [6.5, -0.5] }, cam: { dist: 8, height: 3, angle: 12, bounds: [-8.2, 8.2, -9, 2.5] } };
  },
  forest: () => {
    const parts = [plane('#5aa65a', 900, 900, 0, 0, 0), plane('#b98a56', 3, 60, 0, 0.003, 10, { layer: 0 })];
    scatterTrees(parts, 'tree', 26, 3, [0, 0, 7], 8, 40, ['#3a9d4f', '#2f8f4e', '#4bb25f']); scatterTrees(parts, 'pine', 20, 9, [0, 0, 8], 10, 45, null);
    for (let i = 0; i < 12; i++) parts.push(...put(i % 3 ? 'bush' : 'rock', Math.cos(i * 1.9) * (6 + (i % 5)), Math.sin(i * 1.9) * (5 + (i % 4)) + 2, { scale: 0.8 + (i % 3) * 0.3 }));
    parts.push(...put('mountain', -30, 70), ...put('mountain', 25, 85, { scale: 1.3 }), ...put('mountain', 70, 75, { scale: 1.1 }));
    for (let i = 0; i < 8; i++) parts.push(...put('flower', Math.cos(i * 2.7) * 4, Math.sin(i * 2.7) * 3 - 1, { color: ['#f472b6', '#fde047', '#a78bfa'][i % 3] }));
    return { parts, sky: 'day', fog: '#d4ecff', anchors: { center: [0, 0], campfire: [3, 2], path: [0, 6], treeLeft: [-6, 3], treeRight: [6, 3], clearing: [0, 3], far: [0, 14] }, cam: { dist: 10, height: 3.4, angle: 18 } };
  },
  village: () => {
    const parts = [plane('#7fbf6e', 900, 900, 0, 0, 0), plane('#8b919c', 60, 5, 0, 0.004, -2), plane('#f4f1e8', 60, 0.12, 0, 0.008, -2)];
    [[-9, 6, '#f2d9b0'], [-3, 7, '#f6c9a8'], [4, 6.5, '#e8d9f2'], [10, 7.5, '#cfe8f6']].forEach(([x, z, c], i) => parts.push(...put('house', x, z, { color: c, scale: 1.1, yaw: (i % 2) * 0.1 })));
    scatterTrees(parts, 'tree', 14, 5, [0, 0, 7], 12, 38, null);
    for (const x of [-12, -4, 4, 12]) parts.push(...put('lamppost', x, -4.8));
    parts.push(...put('bench', -5, -5.6), ...put('fence', 6, 3), ...put('fence', 9, 3), ...put('car', 7, -2.2, { yaw: Math.PI / 2, color: '#3b82f6' }), ...put('mountain', 20, 90, { scale: 1.4 }));
    return { parts, sky: 'day', fog: '#d4ecff', anchors: { center: [0, 0], road: [0, -2], houseDoor: [-3, 5], bench: [-5, -4.6], car: [7, -2.2] }, cam: { dist: 12, height: 3.6, angle: 20 } };
  },
  beach: () => {
    const parts = [plane('#4aa8de', 900, 900, 0, 0, 0), plane('#f0d9a0', 120, 38, 0, 0.01, -6)];
    for (let i = 0; i < 6; i++) parts.push(plane('#9bd6f0', 120, 0.35, 0, 0.012, 14 + i * 2.2 + Math.sin(i) * 0.3));
    parts.push(plane('#d9c07e', 120, 6, 0, 0.011, 13.2));
    [[-7, 4], [6, 6], [9, -2], [-10, -3]].forEach(([x, z], i) => parts.push(...put('palm', x, z, { scale: 1 + (i % 2) * 0.2 })));
    parts.push(...put('umbrella', -2, 3, { color: '#ef4444' }), ...put('umbrella', 3, 0, { color: '#f59e0b' }), ...put('boat', 6, 24, { yaw: 0.3 }), ...put('rock', -9, 8), ...put('mountain', -40, 90, { color: '#6b8f7a' }));
    return { parts, sky: 'day', fog: '#d4ecff', anchors: { center: [0, 0], shore: [0, 10], water: [0, 18], umbrella: [-2, 2.2], boat: [6, 22], palm: [-7, 3] }, cam: { dist: 11, height: 3.2, angle: 15 } };
  },
  desert: () => {
    const parts = [plane('#e6c27a', 900, 900, 0, 0, 0)];
    for (let i = 0; i < 9; i++) parts.push(prim('sph', i % 2 ? '#e9c987' : '#dcb468', [18 + rand(i, 4) * 14, 5 + rand(i, 5) * 4, 14], place(-60 + i * 16, -1.2, 30 + rand(i, 6) * 40), { seg: 8, ring: 4 }));
    for (let i = 0; i < 9; i++) parts.push(...put(i % 3 ? 'cactus' : 'rock', Math.cos(i * 2.3) * (7 + i % 4), Math.sin(i * 2.3) * 5 + 3, { scale: 0.9 + (i % 3) * 0.3 }));
    parts.push(prim('cone', '#e0b469', [28, 18, 28], place(-24, 9, 80), { n: 4 }), prim('cone', '#d9a95b', [20, 12, 20], place(14, 6, 70), { n: 4 }));
    return { parts, sky: 'day', fog: '#d4ecff', anchors: { center: [0, 0], cactus: [4, 3], rocks: [-5, 4], far: [0, 16] }, cam: { dist: 10, height: 3, angle: 14 } };
  },
  snow: () => {
    const parts = [plane('#eef4fb', 900, 900, 0, 0, 0)];
    scatterTrees(parts, 'pine', 26, 11, [0, 0, 6], 8, 40, ['#2d6a55', '#2f7d62']); parts.push(...put('snowman', -3, 3), ...put('mountain', -25, 80, { color: '#a9b8d0' }), ...put('mountain', 30, 90, { color: '#b6c4da', scale: 1.3 }));
    for (let i = 0; i < 10; i++) parts.push(prim('sph', '#f8fbff', [1 + rand(i, 3), 0.4, 1 + rand(i, 4)], place(Math.cos(i * 2.1) * 9, 0.1, Math.sin(i * 2.1) * 7 + 4), { seg: 6, ring: 3 }));
    return { parts, sky: 'day', fog: '#d4ecff', anchors: { center: [0, 0], snowman: [-3, 2], pine: [6, 4], far: [0, 14] }, cam: { dist: 10, height: 3, angle: 16 } };
  },
  room: () => {
    const parts = [plane('#d9c3a0', 40, 40, 0, 0, 0)];
    for (let i = -5; i < 5; i++) parts.push(plane(i % 2 ? '#cdb68f' : '#d9c3a0', 20, 0.9, 0, 0.004, i + 0.5, { layer: 0 }));
    parts.push(box('#eef2f9', 16, 5, 0.2, 0, 2.5, 5, { k: 4 }), box('#e6ebf4', 0.2, 5, 12, -8, 2.5, -1, { k: 4 }), box('#e6ebf4', 0.2, 5, 12, 8, 2.5, -1, { k: 4 }), plane('#a78bfa', 5, 3.5, 0, 0.01, -0.5));
    parts.push(...put('sofa', -4.5, 3.8), ...put('tv', 0, 4.8, { y: 0.4, scale: 1.5 }), ...put('bookshelf', 6.6, 4.5), ...put('lamp', -7, 4.2), ...put('table', 0.2, 0.2, { scale: 0.8 }), box('#9bd1ff', 2.2, 1.6, 0.05, 4, 2.6, 4.9), ...put('bed', 6, -3.5, { yaw: Math.PI / 2 }));
    return { parts, sky: 'indoor', fog: '#f5f7fb', light: { ambient: 0.7 }, anchors: { center: [0, -1], sofa: [-4.5, 2.8], tv: [0, 3.6], shelf: [6.4, 3.6], table: [0.2, 0.2], bed: [5.2, -3.5], door: [-6.5, -4] }, cam: { dist: 8, height: 3, angle: 12, bounds: [-6.8, 6.8, -9, 3.0] } };
  },
  studio: () => {
    const parts = [plane('#cdd7ea', 900, 900, 0, 0, 0), prim('cyl', '#eef2ff', [14, 0.12, 14], place(0, 0.06, 0), { n: 24 }), prim('cyl', '#a5b4fc', [14.4, 0.06, 14.4], place(0, 0.03, 0), { n: 24 })];
    return { parts, sky: 'indoor', fog: '#f5f7fb', light: { ambient: 0.66 }, anchors: { center: [0, 0], left: [-3, 0], right: [3, 0], front: [0, -3], back: [0, 3] }, cam: { dist: 9, height: 2.8, angle: 10 } };
  },
  moon: () => {
    const parts = [plane('#9aa0ad', 900, 900, 0, 0, 0)];
    for (let i = 0; i < 14; i++) parts.push(prim('cyl', '#80869a', [2 + rand(i, 2) * 3, 0.05, 1.5 + rand(i, 3) * 2.5], place(Math.cos(i * 2.4) * (4 + (i % 5) * 3), 0.03, Math.sin(i * 2.4) * (3 + (i % 4) * 3) + 3), { n: 10 }));
    parts.push(prim('sph', '#3b82f6', 14, place(30, 30, 90), { seg: 10, ring: 7, noFog: true }), prim('sph', '#22c55e', [6, 5, 5], place(28, 31, 89.5), { seg: 6, ring: 4, noFog: true }), ...put('rock', -6, 5), ...put('rock', 7, 3, { scale: 1.3 }), ...put('flag', 3, 2));
    return { parts, sky: 'space', fog: '#0b1030', light: { ambient: 0.5 }, anchors: { center: [0, 0], flag: [3, 1], rocks: [-6, 4], rocket: [-8, 6] }, cam: { dist: 10, height: 3, angle: 14 } };
  },
};
export const ENV_NAMES = Object.keys(ENVS);
export const SKIES = SKY;
const cache = new Map();
export function getEnv(name) { const n = ENVS[name] ? name : 'studio'; let e = cache.get(n); if (!e) { e = { name: n, ...ENVS[n]() }; cache.set(n, e); } return e; }
