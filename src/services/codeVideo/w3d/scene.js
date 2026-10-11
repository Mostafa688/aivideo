// ── w3d/scene.js ── مشهد "world": عالم 3D كامل (بيئة + شخصيات متحركة + أغراض + كاميرا سينمائية) بيتحط في إطار الفيديو + كابشن كبير متزامن
import { renderParts, makeCamera } from './render.js';
import { getEnv, SKIES, put } from './envs.js';
import { buildHumanoid, buildQuadruped } from './rig.js';
import { poseFor, mergeMoving, MOVING_ACTS } from './anim.js';
import { buildRuntime, actorAt } from './world.js';
import { customPrim, PROPS } from './props.js';
import { place } from './build.js';
import { lerp, clamp, smooth, dot, sub, len } from './math.js';
import { f1, f2, txt, uid, easeOutCubic, seg, rand } from '../design.js';
import { layoutWords, ent } from '../common.js';
import { mouthAt } from '../characters.js';

const rtCache = new WeakMap();
const LEG_ACTS = new Set(['walk', 'run', 'jog', 'dance']);
const SHADOW_PROPS = new Set(['tree', 'pine', 'house', 'tent', 'car', 'table', 'chair', 'sofa', 'bed', 'boat', 'snowman', 'barrel', 'crate', 'chest', 'rocket', 'stove', 'fridge']);

function skyFor(env, time) { const key = env.sky === 'day' ? time : env.sky; return { key, colors: SKIES[key] || SKIES.day }; }

function propState(p, t, dur, actors, rtPos) {
  // مواضع: ثابت → أحداث (إمساك/حركة) بالترتيب
  let pos = [p.at[0], p.y, p.at[1]], roll = 0, yaw = p.yaw, held = null;
  const evs = [...p.hold.map(h => ({ type: 'hold', s: h.from * dur, e: h.to * dur, h })), ...p.moves.map(m => ({ type: 'move', s: m.at * dur, e: Math.min(dur, (m.at + m.dur) * dur), m }))].sort((a, b) => a.s - b.s);
  let travelled = 0, moveYaw = null;
  for (const ev of evs) {
    if (t < ev.s) break;
    if (ev.type === 'hold') {
      const a = actors.get(ev.h.actor); if (!a) continue;
      if (t <= ev.e) { held = { a, hand: ev.h.hand }; const fw = ev.h.hand === 'foot' ? 0.42 : 0.3; pos = [a.x + Math.sin(a.yaw) * fw, ev.h.hand === 'foot' ? p.y : ev.h.hand === 'head' ? p.y + 1.75 : p.y + 1.0, a.z + Math.cos(a.yaw) * fw]; break; }
      const f = [Math.sin(a.yaw) * 0.45, Math.cos(a.yaw) * 0.45]; pos = [a.x + f[0], p.y, a.z + f[1]]; // بعد ما يسيبه: ينزل قدّام اللاعب
    } else {
      const m = ev.m, to = m.to.ref ? (rtPos(m.to.ref) || pos) : m.to, k = clamp((t - ev.s) / Math.max(0.05, ev.e - ev.s), 0, 1);
      const from = pos, nx = lerp(from[0], to[0], k), nz = lerp(from[2], to[1], k);
      const d = Math.hypot(to[0] - from[0], to[1] - from[2]); travelled += d * k; if (d > 0.01) moveYaw = Math.atan2(to[0] - from[0], to[1] - from[2]);
      if (k < 1) { pos = [nx, p.y + m.arc * Math.sin(Math.PI * k), nz]; break; }
      pos = [to[0], p.y, to[1]];
    }
  }
  if (moveYaw != null) yaw = moveYaw;
  roll = travelled / 0.115;
  return { pos, roll, yaw, held };
}

export function world(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c;
  const env = getEnv(d.env), cam0 = env.cam, aspectK = portrait ? 1.55 : 1;
  const camDef = d.camera || {};
  const a0 = ((camDef.angle ?? cam0.angle) * Math.PI) / 180;
  let rt = rtCache.get(d);
  if (!rt) { rt = buildRuntime(d, dur, { camPos: [Math.sin(a0) * (camDef.dist ?? cam0.dist), -Math.cos(a0) * (camDef.dist ?? cam0.dist)] }); rtCache.set(d, rt); }
  // 1) حالة الممثلين (مرحلتين: الأولى من غير أهداف ديناميكية، التانية لما حد بيبص على ممثل/غرض)
  const stateMap = new Map();
  const posOf = (id) => { const st = stateMap.get(id); if (st) return [st.x, st.z]; return rt.entStart.get(id) || null; };
  rt.actors.forEach(a => stateMap.set(a.id, actorAt(a, t, null)));
  rt.actors.forEach(a => { if (a.segs.some(sg => sg.faceRef)) stateMap.set(a.id, actorAt(a, t, posOf)); });
  const propPos = (id) => { const p = d.props.find(x => x.id === id); if (!p) return null; const st = propState(p, t, dur, stateMap, () => null); return [st.pos[0], st.pos[2]]; };
  // 2) الأجزاء
  const parts = [...env.parts], shadows = []; const tick = Math.floor(t * 30) / 30;
  const talkMouth = mouthAt(sc.tokens || [], t) > 0.3;
  const hands = new Map();
  rt.actors.forEach((ra, i) => {
    const st = stateMap.get(ra.id), act = st.act;
    const speedScale = st.moving ? clamp(st.speed / (act === 'run' ? 4 : 1.5), 0.7, 1.8) : 1;
    let pose = poseFor(act, t * speedScale + i * 0.37, st.p, { dir: st.dir });
    if (st.moving && !LEG_ACTS.has(act)) pose = mergeMoving(pose, t * speedScale, st.speed > 2.8 ? 'run' : 'walk');
    if (act === 'talk' || act === 'cheer' || act === 'celebrate' || (act === 'idle' && false)) pose.mouth = act === 'talk' ? talkMouth : Math.sin(t * 12) > 0;
    const r = ra.spec.kind === 'animal' ? buildQuadruped(ra.spec, { x: st.x, z: st.z, yaw: st.yaw, pose, t, moving: st.moving, run: st.speed > 2.8 }) : buildHumanoid(ra.spec, { x: st.x, z: st.z, yaw: st.yaw, pose });
    parts.push(...r.parts); shadows.push(r.shadow); hands.set(ra.id, r.hands);
  });
  for (const p of d.props) {
    const st = propState(p, t, dur, stateMap, propPos);
    let pos = st.pos, yaw = st.yaw;
    if (st.held) {
      const hnd = hands.get(st.held.a.id || '') || null; const rtA = rt.actors.find(x => stateMap.get(x.id) === st.held.a); const hh = rtA ? hands.get(rtA.id) : null;
      const which = st.held.hand, a = st.held.a;
      if (which === 'foot') pos = [a.x + Math.sin(a.yaw) * 0.42, p.y, a.z + Math.cos(a.yaw) * 0.42];
      else if (which === 'head') pos = [a.x, p.y + 1.75, a.z];
      else if (hh && hh[which === 'l' ? 'l' : 'r']) { const hp = hh[which === 'l' ? 'l' : 'r']; pos = [hp[0], hp[1] - 0.02, hp[2]]; }
      yaw = a.yaw;
    }
    const f = PROPS[p.type]; if (!f) continue;
    parts.push(...f(place(pos[0], pos[1], pos[2], yaw, st.roll && p.type === 'ball' ? 0 : 0, 0), p.color, p.scale, { t: tick }));
    if (SHADOW_PROPS.has(p.type) || p.type === 'ball') shadows.push({ x: pos[0], z: pos[2], rx: p.type === 'ball' ? 0.14 : 0.9 * p.scale, rz: p.type === 'ball' ? 0.14 : 0.8 * p.scale, op: 0.2 });
  }
  for (const e of d.custom) parts.push(customPrim(e));
  // 3) الكاميرا
  const prog = clamp(t / Math.max(0.5, dur), 0, 1), e = smooth(prog);
  let target;
  const lagT = Math.max(0, t - 0.25);
  const entAt = (ref, tt) => { const ra = rt.actors.find(x => x.id === ref); if (ra) { const st = actorAt(ra, tt, null); return [st.x, st.z]; } const p = d.props.find(x => x.id === ref); if (p) { const st = propState(p, tt, dur, new Map(rt.actors.map(x => [x.id, actorAt(x, tt, null)])), () => null); return [st.pos[0], st.pos[2]]; } return null; };
  if (camDef.target?.ref) target = entAt(camDef.target.ref, camDef.follow === false ? 0 : lagT);
  else if (camDef.target?.pt) target = camDef.target.pt;
  if (!target) { const ps = rt.actors.map(a => { const st = stateMap.get(a.id); return [st.x, st.z]; }); if (!ps.length) ps.push([0, 0]); target = [ps.reduce((q, p) => q + p[0], 0) / ps.length, ps.reduce((q, p) => q + p[1], 0) / ps.length]; }
  const spread = Math.max(0, ...rt.actors.map(a => { const st = stateMap.get(a.id); return Math.hypot(st.x - target[0], st.z - target[1]); }));
  const auto = Math.max(cam0.dist * 0.55, spread * 1.5 + 5);
  const dist = lerp(camDef.dist ?? auto, camDef.dist2 ?? camDef.dist ?? auto, e) * aspectK, height = lerp(camDef.height ?? cam0.height, camDef.height2 ?? camDef.height ?? cam0.height, e) * (portrait ? 1.1 : 1);
  const ang = ((camDef.angle ?? cam0.angle) + (camDef.sweep || 0) * prog) * Math.PI / 180;
  let sh = 0; if (camDef.shake) sh = camDef.shake * 0.08 * Math.sin(t * 40) * Math.max(0, 1 - ((t * 3) % 1));
  let cx = target[0] + Math.sin(ang) * dist + sh, cz = target[1] - Math.cos(ang) * dist;
  if (cam0.bounds) { cx = clamp(cx, cam0.bounds[0], cam0.bounds[1]); cz = clamp(cz, cam0.bounds[2], cam0.bounds[3]); }
  const camera = makeCamera({ pos: [cx, height + sh * 0.5, cz], target: [target[0], 0.95, target[1]], fov: camDef.fov ?? 42, w, h });
  // 4) الإضاءة والسما
  const sky = skyFor(env, d.time || 'day'), night = sky.key === 'night', dusk = sky.key === 'dusk';
  const light = { ...(env.light || {}), ...(night ? { ambient: 0.4, cool: [0.7, 0.8, 1.1], warm: [0.9, 0.95, 1.1], gain: 1.0 } : dusk ? { ambient: 0.5, warm: [1.15, 0.95, 0.8], cool: [0.8, 0.82, 1.05] } : {}) };
  const fogColor = env.sky === 'day' ? sky.colors[1] : env.fog;
  const r = renderParts(parts, camera, { light, fog: { color: fogColor, near: 18, far: 120, max: 0.95 }, shadows: shadows.map(q => ({ ...q, rot: q.rot || 0 })), shadowOpacity: night ? 0.4 : 0.3, hazeId: sc.index });
  const gid = uid(c, 'wsky');
  let o = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky.colors[0]}"/><stop offset="1" stop-color="${sky.colors[1]}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${gid})"/>`;
  const horizon = h / 2 - camera.F * (camera.f[1] / Math.max(0.05, Math.hypot(camera.f[0], camera.f[2]))) ;
  if (env.sky !== 'indoor') {
    if (night || env.sky === 'space') for (let i = 0; i < 40; i++) o += `<circle cx="${f1(rand(i, 3) * w)}" cy="${f1(rand(i, 4) * Math.max(10, horizon))}" r="${f1((0.8 + rand(i, 5) * 1.8) * s)}" fill="#fff" opacity="${f2(0.4 + rand(i, 6) * 0.6)}"/>`;
    else { const sx = w * (0.8 - (camDef.angle || 0) * 0.002 + 0.05 * Math.sin(prog)), sy = Math.max(h * 0.1, horizon - h * 0.28);
      o += `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(120 * s)}" fill="${dusk ? '#ffd2a1' : '#fff6c9'}" opacity="0.35"/><circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(54 * s)}" fill="${dusk ? '#ff9f5a' : '#ffe27a'}"/>`;
      for (let i = 0; i < 4; i++) { const cx = ((rand(i, 7) * w * 1.4 + t * (6 + i * 3)) % (w * 1.4)) - w * 0.2, cy = Math.max(h * 0.05, horizon - h * (0.1 + rand(i, 8) * 0.25)), rr = (34 + rand(i, 9) * 30) * s; o += `<g fill="#fff" opacity="${dusk ? 0.55 : 0.85}"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rr)}"/><circle cx="${f1(cx + rr * 0.9)}" cy="${f1(cy + rr * 0.15)}" r="${f1(rr * 0.75)}"/><circle cx="${f1(cx - rr * 0.9)}" cy="${f1(cy + rr * 0.2)}" r="${f1(rr * 0.65)}"/><rect x="${f1(cx - rr * 1.5)}" y="${f1(cy + rr * 0.2)}" width="${f1(rr * 3)}" height="${f1(rr * 0.75)}" rx="${f1(rr * 0.37)}"/></g>`; }
    }
  }
  o += r.svg;
  const vg = uid(c, 'wvg');
  o += `<defs><radialGradient id="${vg}" cx="0.5" cy="0.5" r="0.75"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${night ? 0.5 : 0.22}"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#${vg})"/>`;
  if (d.caption !== false) o += captionStamp(c, sc.tokens || [], t, d.emphasis || []);
  return o;
}

/** كابشن كبير على طريقة الفيديوهات الرياضية: كلمات بيضاء بحد غامق + الكلمات المهمة في صندوق أصفر */
function captionStamp(c, tokens, t, emphasis) {
  if (!tokens.length) return '';
  const { w, h, s, pal, portrait, rtl } = c;
  const words = tokens.map(x => ({ text: x.w, start: x.start, end: x.end }));
  const clean = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const emph = new Set((emphasis || []).map(clean)), lastIdx = new Set(emph.size ? [] : [words.length - 1, words.length - 2].filter(k => k >= 0));
  const maxW = w * (portrait ? 0.9 : 0.8), box = { y: h * 0.045, h: h * (portrait ? 0.25 : 0.28) };
  let size = (portrait ? 120 : 104) * s, lines = [];
  for (; size > 36 * s; size -= 4 * s) { lines = layoutWords(words, size, maxW, c.mm, rtl); if (lines.length <= 3 && lines.length * size * 1.3 <= box.h) break; }
  const lh = size * 1.3, y0 = box.y + size * 0.95; let o = '';
  lines.forEach((ln, li) => {
    for (const it of ln.items) {
      const wd = words[it.i], e = ent(t, wd.start - 0.04, 0.3); if (t < wd.start - 0.05) continue;
      const x = w / 2 + it.cx, y = y0 + li * lh + (1 - Math.min(1, e.p)) * 22 * s, isE = emph.has(clean(wd.text)) || lastIdx.has(it.i);
      if (isE) o += `<rect x="${f1(x - it.width / 2 - size * 0.16)}" y="${f1(y - size * 0.86)}" width="${f1(it.width + size * 0.32)}" height="${f1(size * 1.12)}" rx="${f1(size * 0.14)}" fill="#ffd23f" opacity="${f2(e.o)}" transform="rotate(-1 ${f1(x)} ${f1(y)})"/>`;
      o += txt(c, wd.text, x, y, size, { weight: 900, fill: isE ? '#16161a' : '#ffffff', opacity: e.o, stroke: isE ? null : 'rgba(10,12,20,0.8)', strokeW: isE ? 0 : size * 0.1 });
    }
  });
  return o;
}
