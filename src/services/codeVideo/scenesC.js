// ── scenesC.js ── مشاهد الكارتون (2D / 3D): شخصية بتتكلم في فقاعة كلام متزامنة مع الصوت، شخصية + عنصر (أيقونة)، حوار بين شخصيتين، ومذيع صغير فوق مشاهد الإنفوجرافيك
import { f1, f2, clamp01, easeOutCubic, seg, spring, rgba, darken, lighten, txt, icon, wrapText } from './design.js';
import { ent, layoutWords } from './common.js';
import { drawCharacter, CAST, mouthAt, blinkAt } from './characters.js';

const styleOf = (c) => (c.look === 'cartoon3d' ? '3d' : 'flat');
const specOf = (c, id) => CAST[id] || CAST[c.cast?.host] || CAST.sam;

const armsFor = (pose) => (['point', 'wave', 'up'].includes(pose) ? { armR: pose } : ['cheer', 'shrug', 'hold'].includes(pose) ? { armL: pose, armR: pose } : {});

/** شخصية واقفة ومتحركة في مشهد (دخول + كلام + رمش + حركة) — side: 'left' | 'right' (اللي على اليمين بتتقلب لتبص ناحية المحتوى) */
function figure(c, id, { t, tokens, side, size, cx, emotion = 'neutral', pose = 'rest', speaking = true, tag, enterAt = 0.02, seed = 0, lookAt = 0.55 }) {
  const { w, h } = c;
  const ep = spring((t - enterAt) * 0.6, { k: 9, d: 6 }), dx = (1 - Math.min(1.05, ep)) * (side === 'left' ? -1 : 1) * w * 0.3;
  const base = h + 8; // الخصر عند حافة الإطار السفلية (الشخصية "نصفية" ومقصوصة بالإطار)
  const st = { t, mouth: speaking ? mouthAt(tokens, t) : 0, blink: blinkAt(t, seed), emotion, look: lookAt, armT: clamp01((t - enterAt - 0.3) / 0.5), ...armsFor(pose) };
  return drawCharacter(c, specOf(c, id), st, { x: cx + dx, y: base, size, flip: side === 'right', style: styleOf(c), tag });
}

/** فقاعة كلام بكلمات متزامنة مع النطق. rect = {x,y,w,h}، tail = {x,y} (مكان فم الشخصية) */
function bubble(c, rect, tail, tokens, t, { emphasis = [], enterAt = 0.12, tag = 'b' } = {}) {
  const { s, pal, rtl } = c; let o = '';
  const e = ent(t, enterAt, 0.5), sc = 0.82 + 0.18 * Math.min(1.08, e.p);
  const cxm = rect.x + rect.w / 2, cym = rect.y + rect.h / 2;
  const words = (tokens || []).map(x => ({ text: x.w, start: x.start, end: x.end }));
  const pad = 46 * s, maxW = rect.w - pad * 2, maxH = rect.h - pad * 1.6;
  let size = (c.portrait ? 84 : 78) * s, lines = [];
  for (; size > 34 * s; size -= 3 * s) { lines = layoutWords(words, size, maxW, c.mm, rtl); if (lines.length * size * 1.32 <= maxH) break; }
  const lh = size * 1.32, total = lines.length * lh;
  o += `<g opacity="${f2(e.o)}" transform="translate(${f1(cxm)} ${f1(cym)}) scale(${f2(sc)}) translate(${f1(-cxm)} ${f1(-cym)})">`;
  const R = 52 * s;
  // الذيل: بيطلع من حافة الفقاعة اللي ناحية الشخصية
  const dx = tail.x - cxm, dy = tail.y - cym;
  const hit = Math.min((rect.w / 2) / Math.max(1e-6, Math.abs(dx)), (rect.h / 2) / Math.max(1e-6, Math.abs(dy)));
  let px = cxm + dx * hit, py = cym + dy * hit, nx = 0, ny = 0, tx0 = 0, ty0 = 0;
  if ((rect.w / 2) / Math.max(1e-6, Math.abs(dx)) < (rect.h / 2) / Math.max(1e-6, Math.abs(dy))) { nx = Math.sign(dx) || 1; tx0 = 0; ty0 = 1; py = Math.max(rect.y + R, Math.min(rect.y + rect.h - R, py)); px = nx > 0 ? rect.x + rect.w : rect.x; }
  else { ny = Math.sign(dy) || 1; tx0 = 1; ty0 = 0; px = Math.max(rect.x + R, Math.min(rect.x + rect.w - R, px)); py = ny > 0 ? rect.y + rect.h : rect.y; }
  const half = 36 * s, bx1 = px + tx0 * half, by1 = py + ty0 * half, bx2 = px - tx0 * half, by2 = py - ty0 * half;
  const vx = tail.x - px, vy = tail.y - py, vl = Math.hypot(vx, vy) || 1, tl = Math.min(vl, 130 * s), tipx = px + vx / vl * tl, tipy = py + vy / vl * tl;
  const fill = '#ffffff', stk = pal.text;
  o += `<rect x="${f1(rect.x + 7 * s)}" y="${f1(rect.y + 12 * s)}" width="${f1(rect.w)}" height="${f1(rect.h)}" rx="${f1(R)}" fill="#000" opacity="0.16"/>`;
  o += `<path d="M${f1(bx1)} ${f1(by1)} L${f1(tipx)} ${f1(tipy)} L${f1(bx2)} ${f1(by2)} Z" fill="${fill}" stroke="${stk}" stroke-width="${f1(7 * s)}" stroke-linejoin="round"/>`;
  o += `<rect x="${f1(rect.x)}" y="${f1(rect.y)}" width="${f1(rect.w)}" height="${f1(rect.h)}" rx="${f1(R)}" fill="${fill}" stroke="${stk}" stroke-width="${f1(7 * s)}"/>`;
  o += `<path d="M${f1(bx1 - tx0 * 6 * s - nx * 3 * s)} ${f1(by1 - ty0 * 6 * s - ny * 3 * s)} L${f1(bx2 + tx0 * 6 * s - nx * 3 * s)} ${f1(by2 + ty0 * 6 * s - ny * 3 * s)}" stroke="${fill}" stroke-width="${f1(11 * s)}"/>`;
  // الكلمات
  const emph = new Set((emphasis || []).map(x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  const y0 = cym - total / 2 + size * 0.9;
  lines.forEach((ln, li) => {
    for (const it of ln.items) {
      const wd = words[it.i], clean = String(wd.text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const we = ent(t, wd.start - 0.04, 0.35);
      if (t < wd.start - 0.05) continue;
      const active = t >= wd.start - 0.02 && t <= wd.end + 0.1, isE = emph.has(clean);
      const x = cxm + it.cx, yy = y0 + li * lh + (1 - Math.min(1, we.p)) * 26 * s;
      if (active) o += `<rect x="${f1(x - it.width / 2 - size * 0.1)}" y="${f1(yy - size * 0.86)}" width="${f1(it.width + size * 0.2)}" height="${f1(size * 1.1)}" rx="${f1(size * 0.22)}" fill="${pal.a2}" opacity="0.55"/>`;
      o += txt(c, wd.text, x, yy, size, { weight: 900, fill: isE ? pal.a1 : pal.text, opacity: we.o });
      if (isE) o += `<rect x="${f1(x - it.width / 2)}" y="${f1(yy + size * 0.13)}" width="${f1(it.width * easeOutCubic(seg(t, wd.start, wd.start + 0.35)))}" height="${f1(size * 0.07)}" rx="${f1(size * 0.035)}" fill="${pal.a1}"/>`;
    }
  });
  return o + '</g>';
}

const sideOf = (c, d, sc) => (d.side === 'right' || d.side === 'left' ? d.side : (sc.index % 2 ? 'right' : 'left'));

// ── شخصية بتتكلم في فقاعة ──
export function char_say(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c; const side = sideOf(c, d, sc);
  const size = portrait ? w * 1.0 : h * 0.82, cx = portrait ? w * 0.5 : (side === 'left' ? w * 0.22 : w * 0.78);
  const rect = portrait ? { x: w * 0.06, y: h * 0.07, w: w * 0.88, h: h * 0.34 } : { x: side === 'left' ? w * 0.44 : w * 0.04, y: h * 0.1, w: w * 0.52, h: h * 0.52 };
  const k = size / 440, headY = h + 8 - 330 * k;
  const mouthX = portrait ? w * 0.5 : cx + (side === 'left' ? 70 : -70) * k;
  let o = bubble(c, rect, { x: mouthX, y: headY - 90 * k }, sc.tokens, t, { emphasis: d.emphasis });
  o += figure(c, d.character, { t, tokens: sc.tokens, side: portrait ? 'left' : side, size, cx, emotion: d.emotion, pose: d.pose, tag: `cs${sc.index}`, seed: sc.index });
  return o;
}

// ── شخصية + عنصر كبير (أيقونة) ──
export function char_prop(c, d, t, dur, sc) {
  const { w, h, s, pal, portrait } = c; const side = sideOf(c, d, sc);
  const size = portrait ? w * 0.8 : h * 0.82, cx = portrait ? w * 0.5 : (side === 'left' ? w * 0.22 : w * 0.78);
  const pcx = portrait ? w * 0.5 : (side === 'left' ? w * 0.7 : w * 0.3), pcy = h * (portrait ? 0.25 : 0.4), R = (portrait ? 215 : 230) * s;
  let o = '';
  const pe = ent(t, 0.28, 0.6), bob = Math.sin(t * 2.4) * 10 * s;
  o += `<g transform="translate(${f1(pcx)} ${f1(pcy + bob)}) scale(${f2(Math.min(1.1, pe.p))}) translate(${f1(-pcx)} ${f1(-(pcy + bob))})" opacity="${f2(pe.o)}">`;
  o += `<circle cx="${f1(pcx + 8 * s)}" cy="${f1(pcy + bob + 16 * s)}" r="${f1(R)}" fill="#000" opacity="0.15"/><circle cx="${f1(pcx)}" cy="${f1(pcy + bob)}" r="${f1(R)}" fill="#fff" stroke="${pal.a1}" stroke-width="${f1(14 * s)}"/>`;
  o += `<circle cx="${f1(pcx)}" cy="${f1(pcy + bob)}" r="${f1(R * 0.84)}" fill="${rgba(pal.a2, 0.25)}"/>`;
  o += icon(c, d.icon || 'star', pcx, pcy + bob, R * 1.05, { color: pal.a1, sw: 6.5, fill: rgba(pal.a1, 0.12) });
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + t * 0.9, rr = R * (1.18 + 0.06 * Math.sin(t * 3 + i)); o += `<circle cx="${f1(pcx + Math.cos(a) * rr)}" cy="${f1(pcy + bob + Math.sin(a) * rr)}" r="${f1((8 + (i % 3) * 4) * s)}" fill="${[pal.a1, pal.a2, pal.a3][i % 3]}"/>`; }
  o += '</g>';
  if (d.label) {
    const le = ent(t, 0.7, 0.5), size2 = (portrait ? 70 : 64) * s, fit = wrapText(d.label, w * (portrait ? 0.8 : 0.4), size2, { maxLines: 2 });
    const ly = pcy + R + 80 * s;
    const bw = Math.min(w * (portrait ? 0.86 : 0.46), Math.max(...fit.map(l => l.length)) * size2 * 0.62 + 90 * s), bh = fit.length * size2 * 1.25 + 40 * s;
    o += `<g opacity="${f2(le.o)}" transform="translate(0 ${f1((1 - le.p) * 30 * s)})"><rect x="${f1(pcx - bw / 2)}" y="${f1(ly - size2 * 0.95)}" width="${f1(bw)}" height="${f1(bh)}" rx="${f1(28 * s)}" fill="${pal.a1}"/>`;
    fit.forEach((ln, i) => { o += txt(c, ln, pcx, ly + i * size2 * 1.25, size2, { weight: 900, fill: '#fff' }); });
    o += '</g>';
  }
  o += figure(c, d.character, { t, tokens: sc.tokens, side: portrait ? 'left' : side, size, cx, emotion: d.emotion, pose: d.pose || 'point', tag: `cp${sc.index}`, seed: sc.index });
  return o;
}

// ── شخصيتين: واحد بيشرح (فقاعة) والتاني بيتفاعل ──
export function char_duo(c, d, t, dur, sc) {
  const { w, h, s, portrait } = c;
  const toks = sc.tokens || [], half = toks.length ? toks[Math.floor(toks.length / 2)].start - 0.02 : dur / 2;
  const first = d.first === 'b' ? 'b' : 'a', second = first === 'a' ? 'b' : 'a';
  const speaker = t < half ? first : second;
  const sp = { a: d.a, b: d.b };
  const size = portrait ? w * 0.66 : h * 0.62, k = size / 440;
  const posA = portrait ? w * 0.26 : w * 0.2, posB = portrait ? w * 0.74 : w * 0.8;
  const spk = (id) => (id === 'a' ? posA : posB);
  const tkA = id => (speaker === id ? toks : []);
  const rect = portrait ? { x: w * 0.06, y: h * 0.08, w: w * 0.88, h: h * 0.36 } : { x: w * 0.12, y: h * 0.06, w: w * 0.76, h: h * 0.4 };
  const tail = { x: spk(speaker), y: h + 8 - 330 * k - 100 * k };
  let o = bubble(c, rect, tail, toks, t, { emphasis: d.emphasis });
  o += figure(c, sp.a, { t, tokens: tkA('a'), side: 'left', size, cx: posA, emotion: speaker === 'a' ? (d.emotionA || 'happy') : (d.emotionB || 'think'), pose: speaker === 'a' ? 'point' : 'rest', tag: `da${sc.index}`, seed: sc.index });
  o += figure(c, sp.b, { t, tokens: tkA('b'), side: 'right', size, cx: posB, emotion: speaker === 'b' ? (d.emotionB || 'happy') : (d.emotionA || 'think'), pose: speaker === 'b' ? 'point' : 'rest', tag: `db${sc.index}`, enterAt: 0.12, seed: sc.index + 3 });
  return o;
}

// ── المذيع الصغير فوق مشاهد الإنفوجرافيك (بيتكلم + بيتفاعل) ──
const HOST_EMO = { stat: ['surprised', 'up'], gridstats: ['excited', 'cheer'], bars: ['happy', 'point'], donut: ['happy', 'point'], line: ['excited', 'up'], compare: ['think', 'shrug'], list: ['happy', 'point'], steps: ['happy', 'point'], icons: ['happy', 'up'], timeline: ['neutral', 'point'], globe: ['surprised', 'point'], network: ['think', 'point'], title: ['happy', 'wave'], outro: ['excited', 'cheer'], quote: ['think', 'rest'], bigword: ['surprised', 'cheer'] };
export const HOST_TYPES = new Set(Object.keys(HOST_EMO));
export function hostOverlay(c, sc, t) {
  const { w, h, portrait } = c; const hostId = c.cast?.host || 'sam';
  const [emotion, pose] = HOST_EMO[sc.type] || ['happy', 'rest'];
  const size = portrait ? w * 0.46 : h * 0.34;
  const cx = portrait ? w * 0.5 : (c.rtl ? w * 0.07 : w * 0.93);
  const k = size / 440, ep = spring((t - 0.25) * 0.55, { k: 9, d: 6 });
  const rise = (1 - Math.min(1, ep)) * size * 0.8;
  const st = { t, mouth: mouthAt(sc.tokens, t), blink: blinkAt(t, sc.index), emotion, look: portrait ? 0 : (c.rtl ? 0.5 : -0.5), armT: clamp01((t - 0.55) / 0.5), ...armsFor(pose) };
  return drawCharacter(c, specOf(c, hostId), st, { x: cx, y: h + 8 + rise, size, flip: !portrait && !c.rtl, style: styleOf(c), tag: `hh${sc.index}` });
}

export const SCENES_C = { char_say, char_prop, char_duo };
