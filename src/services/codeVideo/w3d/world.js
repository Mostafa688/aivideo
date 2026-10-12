// ── w3d/world.js ── وصف مشهد 3D (JSON من الـLLM) → تحقق صارم (قوائم بيضاء + حدود) → تقييم زمني (مواقع الشخصيات والأغراض والكاميرا لكل لحظة)
// الـLLM مش بينفّذ كود: بيحدد بيئة + شخصيات + مسارات حركة (tracks) + أغراض + كاميرا، والكود هو اللي بيحرّك ويرسم.
import { ACTS } from './anim.js';
import { ENV_NAMES, getEnv } from './envs.js';
import { PROP_TYPES } from './props.js';
import { HAIR_STYLES, ACCESSORIES } from './rig.js';
import { clamp, smooth, angDiff, lerp } from './math.js';

const HEX = /^#[0-9a-f]{6}$/i, HEX3 = /^#[0-9a-f]{3}$/i;
const col = (v, d) => { const s = String(v ?? '').trim(); if (HEX.test(s)) return s.toLowerCase(); if (HEX3.test(s)) return '#' + s.slice(1).split('').map(x => x + x).join('').toLowerCase(); return d; };
const one = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
const slug = (v, d) => { const s = String(v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12); return s || d; };

export const ANIMALS = {
  dog: { body: '#c68a5e', belly: '#f1d6b8', ears: 'floppy', snout: 0.12, size: 1 }, cat: { body: '#f59e0b', belly: '#fde68a', ears: 'pointy', snout: 0.05, size: 0.7, legLen: 0.25, bodyLen: 0.5, bodyH: 0.24, headSize: 0.24 },
  horse: { body: '#8a5a2b', belly: '#a8693a', ears: 'pointy', snout: 0.3, size: 2.3, ear: '#6b4423', legLen: 0.4, neck: 0.3 }, cow: { neck: 0.1, body: '#f8fafc', belly: '#e5e7eb', ears: 'floppy', snout: 0.14, size: 1.9, legColor: '#f8fafc', ear: '#1f2937', horns: true },
  sheep: { neck: 0.06, body: '#f1f5f9', belly: '#e2e8f0', ears: 'floppy', snout: 0.1, size: 1.2, legColor: '#334155', snoutColor: '#334155' }, pig: { body: '#f9a8d4', belly: '#fbcfe8', ears: 'pointy', snout: 0.1, size: 1.2, snoutColor: '#f472b6' },
  rabbit: { body: '#e5e7eb', belly: '#f8fafc', ears: 'long', snout: 0.05, size: 0.55, legLen: 0.2, bodyLen: 0.45, bodyH: 0.24 }, bear: { neck: 0.08, body: '#7a4a2b', belly: '#a8693a', ears: 'pointy', snout: 0.12, size: 2.2, bodyLen: 0.8, bodyH: 0.5, legLen: 0.3 },
};
export const DEFAULT_HUMAN = { kind: 'human', skin: '#e8b98d', hair: '#3a2a22', hairStyle: 'short', top: '#3b82f6', bottom: '#334155', bottomStyle: 'pants', shoes: '#1f2937', sleeve: 'short', height: 'adult' };

/** وصف شخصية/حيوان → spec آمن (بيدمج فوق base) */
export function sanitizeLook(raw, base = DEFAULT_HUMAN) {
  if (!raw || typeof raw !== 'object') return { ...base };
  const animal = raw.animal && ANIMALS[String(raw.animal).toLowerCase()];
  if (animal) { const a = ANIMALS[String(raw.animal).toLowerCase()]; return { kind: 'animal', ...a, ...(raw.color && HEX.test(String(raw.color)) ? { body: raw.color.toLowerCase() } : {}), ...(raw.belly ? { belly: col(raw.belly, a.belly) } : {}), size: num(raw.size, 0.4, 3, a.size) }; }
  const b = base.kind === 'animal' ? DEFAULT_HUMAN : base;
  const acc = Array.isArray(raw.accessories) ? raw.accessories.map(x => String(x).toLowerCase()).filter(x => ACCESSORIES.includes(x)).slice(0, 3) : (b.accessories || []);
  return {
    kind: 'human', skin: col(raw.skin, b.skin), hair: col(raw.hair, b.hair), hairStyle: one(raw.hairStyle, HAIR_STYLES, b.hairStyle || 'short'), top: col(raw.top, b.top), bottom: col(raw.bottom, b.bottom),
    bottomStyle: one(raw.bottomStyle, ['shorts', 'pants', 'skirt'], b.bottomStyle || 'pants'), sleeve: one(raw.sleeve, ['short', 'long', 'none'], b.sleeve || 'short'), socks: raw.socks ? col(raw.socks, b.socks) : b.socks, shoes: col(raw.shoes, b.shoes || '#1f2937'),
    height: one(raw.height, ['kid', 'adult', 'tall', 'big'], b.height || 'adult'), beard: one(raw.beard, ['none', 'full', 'mustache'], b.beard || 'none'), accessories: acc, accColor: col(raw.accColor, b.accColor), hat: col(raw.hat, b.hat), gloves: raw.gloves ? col(raw.gloves, undefined) : b.gloves,
    scale: num(raw.scale, 0.8, 1.3, b.scale || 1),
  };
}

const pt = (v, anchors) => {
  if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) return [clamp(v[0], -60, 60), clamp(v[1], -60, 60)];
  if (typeof v === 'string' && anchors[v]) return [...anchors[v]];
  return null;
};

/** @returns {object|null} عالم نضيف: { env, actors, props, custom, camera, sfx } */
export function sanitizeWorld(raw, { castSpecs = {}, envName = 'studio' } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const env = ENV_NAMES.includes(raw.env) ? raw.env : (ENV_NAMES.includes(envName) ? envName : 'studio'), anchors = getEnv(env).anchors;
  const ids = new Set(); const uniq = (v, d) => { let s = slug(v, d); while (ids.has(s)) s = (s + 'x').slice(0, 12) + ids.size; ids.add(s); return s; };
  const actors = [];
  for (const a of (Array.isArray(raw.actors) ? raw.actors : []).slice(0, 12)) {
    if (!a || typeof a !== 'object') continue;
    const castId = slug(a.cast || a.id, ''), base = castSpecs[castId] || castSpecs[slug(a.id, '')] || null;
    const spec = a.look ? sanitizeLook(a.look, base || DEFAULT_HUMAN) : (base ? { ...base } : sanitizeLook({}, DEFAULT_HUMAN));
    const id = uniq(a.id, `a${actors.length + 1}`);
    const at = pt(a.at, anchors) || [(actors.length - 1) * 1.6, 0];
    const tracks = [];
    for (const t of (Array.isArray(a.tracks) ? a.tracks : []).slice(0, 12)) {
      if (!t || typeof t !== 'object') continue;
      const act = one(String(t.act || '').toLowerCase(), ACTS, null); if (!act) continue;
      const to = typeof t.to === 'string' && !anchors[t.to] ? { ref: slug(t.to, '') } : pt(t.to, anchors);
      const face = typeof t.face === 'number' ? { deg: clamp(t.face, -360, 360) } : (typeof t.face === 'string' ? (anchors[t.face] ? { pt: [...anchors[t.face]] } : { ref: slug(t.face, '') }) : (Array.isArray(t.face) ? (pt(t.face, anchors) ? { pt: pt(t.face, anchors) } : null) : null));
      tracks.push({ at: num(t.at, 0, 0.98, 0), dur: num(t.dur, 0.03, 1, 0.3), act, to, face, dir: t.dir === -1 ? -1 : 1 });
    }
    tracks.sort((x, y) => x.at - y.at);
    const faceRaw = a.face; const face0 = typeof faceRaw === 'number' ? { deg: clamp(faceRaw, -360, 360) } : (typeof faceRaw === 'string' ? (anchors[faceRaw] ? { pt: [...anchors[faceRaw]] } : { ref: slug(faceRaw, '') }) : null);
    actors.push({ id, spec, at, face: face0, tracks });
  }
  const props = [];
  for (const p of (Array.isArray(raw.props) ? raw.props : []).slice(0, 14)) {
    if (!p || typeof p !== 'object' || !PROP_TYPES.includes(p.type)) continue;
    const id = uniq(p.id || p.type, p.type);
    const hold = (Array.isArray(p.hold) ? p.hold : (p.hold && typeof p.hold === 'object' ? [p.hold] : [])).slice(0, 4).map(h => ({ actor: slug(h?.actor, ''), hand: one(h?.hand, ['r', 'l', 'foot', 'head'], 'r'), from: num(h?.from, 0, 1, 0), to: num(h?.to, 0, 1, 1) })).filter(h => h.actor && h.to > h.from);
    const moves = (Array.isArray(p.moves) ? p.moves : []).slice(0, 6).map(m => ({ at: num(m?.at, 0, 0.98, 0), dur: num(m?.dur, 0.03, 1, 0.25), to: typeof m?.to === 'string' && !anchors[m.to] ? { ref: slug(m.to, '') } : pt(m?.to, anchors), arc: num(m?.arc, 0, 8, 0) })).filter(m => m.to);
    props.push({ id, type: p.type, at: pt(p.at, anchors) || [0, 0], y: num(p.y, 0, 12, 0), color: p.color ? col(p.color, null) : null, scale: num(p.scale, 0.2, 4, 1), yaw: num(p.yaw, -360, 360, 0) * Math.PI / 180, hold, moves: moves.sort((a, b) => a.at - b.at) });
  }
  const custom = (Array.isArray(raw.custom) ? raw.custom : []).slice(0, 24).map(e => {
    if (!e || typeof e !== 'object' || !['box', 'sph', 'cyl', 'cone'].includes(e.shape) || !Array.isArray(e.pos) || e.pos.length !== 3) return null;
    const size = Array.isArray(e.size) ? e.size.slice(0, 3).map(v => num(v, 0.02, 40, 1)) : [num(e.size, 0.02, 40, 1)]; while (size.length < 3) size.push(size[0]);
    return { shape: e.shape, x: num(e.pos[0], -60, 60, 0), y: num(e.pos[1], -2, 40, 0), z: num(e.pos[2], -60, 60, 0), size, color: col(e.color, '#9ca3af'), ry: num(e.ry, -360, 360, 0) * Math.PI / 180, rx: num(e.rx, -360, 360, 0) * Math.PI / 180, rz: num(e.rz, -360, 360, 0) * Math.PI / 180 };
  }).filter(Boolean);
  if (!actors.length && !props.length && !custom.length) return null;
  const c = raw.camera && typeof raw.camera === 'object' ? raw.camera : {};
  const tgt = typeof c.target === 'string' && !anchors[c.target] ? { ref: slug(c.target, '') } : (pt(c.target, anchors) ? { pt: pt(c.target, anchors) } : null);
  const camFields = (c) => {
    const tg = typeof c.target === 'string' && !anchors[c.target] ? { ref: slug(c.target, '') } : (pt(c.target, anchors) ? { pt: pt(c.target, anchors) } : null);
    return { target: tg, dist: c.dist == null ? null : num(c.dist, 2, 60, 10), dist2: c.dist2 == null ? null : num(c.dist2, 2, 60, 10), height: c.height == null ? null : num(c.height, 0.3, 40, 3.5), height2: c.height2 == null ? null : num(c.height2, 0.3, 40, 3.5), angle: num(c.angle, -180, 180, 20), side: ['front', 'left', 'right'].includes(c.side) ? c.side : null, sweep: num(c.sweep, -360, 360, 0), fov: num(c.fov, 25, 70, 42), follow: c.follow !== false, shake: num(c.shake, 0, 1, 0) };
  };
  const shots = (Array.isArray(c.shots) ? c.shots : []).slice(0, 4).filter(q => q && typeof q === 'object').map(q => ({ at: num(q.at, 0, 0.95, 0), ...camFields(q) }));
  const camera = { ...camFields(c), shots, _x: 0 };
  const sfx = (Array.isArray(raw.sfx) ? raw.sfx : []).slice(0, 12).map(s => ({ at: num(s?.at, 0, 1, 0), type: one(s?.type, ['hit', 'whoosh', 'pop', 'cheer', 'boom', 'ding', 'splash', 'sizzle', 'slam', 'shimmer'], null) })).filter(s => s.type);
  const time = one(raw.time, ['day', 'dusk', 'night'], 'day');
  return { env, time, actors, props, custom, camera, sfx };
}

// ── التقييم الزمني ──
const HOLD_AFTER = new Set(['lie', 'sit']);
const yawTo = (dx, dz) => Math.atan2(dx, dz);

/** يبني مقاطع حركة كل ممثل (مواقع بداية/نهاية + زوايا) — بيتعمل مرة لكل مشهد */
export function buildRuntime(world, dur, { camPos = null } = {}) {
  const entStart = new Map(); world.actors.forEach(a => entStart.set(a.id, a.at)); world.props.forEach(p => entStart.set(p.id, p.at));
  const resolve = (v) => (v && v.ref ? (entStart.get(v.ref) || null) : (Array.isArray(v) ? v : null));
  const actors = world.actors.map((a) => {
    const segs = []; let pos = [...a.at];
    const defaultYaw = a.face?.deg != null ? a.face.deg * Math.PI / 180 : a.face?.pt ? yawTo(a.face.pt[0] - pos[0], a.face.pt[1] - pos[1]) : (camPos ? yawTo(camPos[0] - pos[0], camPos[1] - pos[1]) : Math.PI);
    let yaw = defaultYaw;
    for (const t of a.tracks) {
      const s = t.at * dur, e = Math.min(dur, s + t.dur * dur), to = resolve(t.to);
      const from = [...pos], target = to ? [...to] : [...pos], dx = target[0] - from[0], dz = target[1] - from[1], dist = Math.hypot(dx, dz), moving = dist > 0.08;
      let faceYaw = yaw;
      if (moving) faceYaw = yawTo(dx, dz);
      else if (t.face?.deg != null) faceYaw = t.face.deg * Math.PI / 180;
      else if (t.face?.pt) faceYaw = yawTo(t.face.pt[0] - from[0], t.face.pt[1] - from[1]);
      else if (t.face?.ref) { const q = resolve({ ref: t.face.ref }); if (q) faceYaw = yawTo(q[0] - from[0], q[1] - from[1]); }
      const speed = moving ? dist / Math.max(0.2, e - s) : 0;
      let act = t.act; if (moving && act === 'walk' && speed > 2.8) act = 'run'; else if (moving && act === 'run' && speed < 1.7) act = 'walk';
      segs.push({ s, e, from, to: target, moving, act, yaw0: yaw, yaw: faceYaw, speed, faceRef: !moving && t.face?.ref ? t.face.ref : null, dir: t.dir, hold: HOLD_AFTER.has(t.act) || t.act === 'fall' });
      pos = target; yaw = faceYaw;
    }
    return { id: a.id, spec: a.spec, at: a.at, defaultYaw, segs };
  });
  return { world, dur, actors, entStart };
}

/** حالة ممثل في لحظة t: { x, z, yaw, act, p (تقدّم), moving, speed, t } */
export function actorAt(ra, t, posOf = null) {
  let seg = null; for (const sg of ra.segs) { if (t >= sg.s) seg = sg; else break; }
  if (!seg) return { x: ra.at[0], z: ra.at[1], yaw: ra.defaultYaw, act: 'idle', p: 0, moving: false, speed: 0 };
  const dur = Math.max(0.05, seg.e - seg.s), p = clamp((t - seg.s) / dur, 0, 1);
  let x, z, act = seg.act, moving = false, pp = p;
  if (t <= seg.e) { const k = seg.moving ? p : 0; x = lerp(seg.from[0], seg.to[0], k); z = lerp(seg.from[1], seg.to[1], k); moving = seg.moving; }
  else { x = seg.to[0]; z = seg.to[1]; if (seg.hold) { pp = 1; act = seg.act === 'fall' ? 'lie' : seg.act; } else { act = 'idle'; pp = 0; } }
  let target = seg.yaw;
  if (seg.faceRef && posOf) { const q = posOf(seg.faceRef); if (q) target = yawTo(q[0] - x, q[1] - z); }
  const yaw = seg.yaw0 + angDiff(seg.yaw0, target) * smooth((t - seg.s) / 0.25);
  return { x, z, yaw, act, p: pp, moving, speed: moving ? seg.speed : 0, dir: seg.dir };
}
