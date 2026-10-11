// ── characters.js ── شخصيات كارتون مرسومة بالكود (SVG): وش بيتكلم متزامن مع الكلام، رمش، تعبيرات، حركة دراعات
// نظام إحداثيات محلي: (0,0) = منتصف الوسط عند الخصر، الراس مركزها (0,-330)، الكتف على -165، وبيتكبّر بـ size/440
// style 'flat' = كارتون ثنائي الأبعاد بخطوط خارجية | '3d' = كارتون ثلاثي الأبعاد (تدرّجات إضاءة + ظلال + براليكس للوش)
import { f1, f2, lighten, darken, mix, uid, clamp01, easeOutCubic } from './design.js';

export const CAST = {
  sam: { label: 'Sam — young man, short dark hair, blue tee', skin: '#f1c27d', hair: '#3a2a22', hairStyle: 'short', shirt: '#3b82f6', shirtStyle: 'tee', beard: 'none', glasses: false },
  lina: { label: 'Lina — woman, long brown hair, coral sweater', skin: '#e8b98d', hair: '#5a3825', hairStyle: 'long', shirt: '#f4777f', shirtStyle: 'tee', beard: 'none', glasses: false },
  omar: { label: 'Omar — bearded man with glasses, green shirt', skin: '#c68a5e', hair: '#1f1713', hairStyle: 'short', shirt: '#2f9e6f', shirtStyle: 'tee', beard: 'full', glasses: true },
  noor: { label: 'Noor — woman in a plum hijab', skin: '#e8b98d', hair: '#3a2a22', hairStyle: 'hijab', shirt: '#7c3aed', shirtStyle: 'tee', beard: 'none', glasses: false, scarf: '#7c3aed' },
  kid: { label: 'Kid — boy in a red cap, yellow tee', skin: '#8d5a3b', hair: '#17110d', hairStyle: 'cap', shirt: '#fbbf24', shirtStyle: 'tee', beard: 'none', glasses: false, cap: '#ef4444', kid: true },
  prof: { label: 'Professor — older man, white hair, mustache, glasses, grey jacket', skin: '#f6d3b3', hair: '#ececec', hairStyle: 'bald', shirt: '#6b7280', shirtStyle: 'suit', beard: 'mustache', glasses: true, tie: '#b91c1c' },
  maya: { label: 'Maya — businesswoman, hair bun, navy blazer', skin: '#d79a6f', hair: '#16100d', hairStyle: 'bun', shirt: '#1e3a8a', shirtStyle: 'suit', beard: 'none', glasses: false, tie: '#f9fafb' },
  robo: { label: 'Robo — friendly robot', robot: true, skin: '#cbd5e1', hair: '#0ea5e9', shirt: '#475569', shirtStyle: 'tee', beard: 'none', glasses: false },
};
export const CAST_IDS = Object.keys(CAST);
export const EMOTIONS = ['neutral', 'happy', 'excited', 'surprised', 'sad', 'angry', 'think'];
export const POSES = ['rest', 'wave', 'point', 'up', 'shrug', 'hold', 'cheer'];

// ── محركات الحركة ──
const tokAt = (tokens, t) => { for (let i = 0; i < tokens.length; i++) { const k = tokens[i]; if (t >= k.start - 0.03 && t <= k.end + 0.05) return { k, i }; } return null; };
/** فتحة الفم (0..1) من توقيت الكلمات: بتفتح وتقفل مع نطق كل كلمة */
export function mouthAt(tokens, t) {
  const h = tokAt(tokens || [], t); if (!h) return 0;
  const len = Math.min(1, String(h.k.w).length / 6), ph = (t - h.k.start) * 17 + h.i * 1.3;
  const edge = Math.min(1, Math.max(0, (t - (h.k.start - 0.03)) / 0.05), Math.max(0, (h.k.end + 0.05 - t) / 0.06));
  return clamp01((0.28 + 0.72 * Math.abs(Math.sin(ph))) * (0.55 + 0.45 * len) * edge);
}
export const blinkAt = (t, seed = 0) => { const ph = (t + seed * 1.7) % 3.4; return ph < 0.15 ? Math.sin(Math.PI * ph / 0.15) : 0; };

const SEG = { up: 118, fo: 104 };
function poseAngles(name, t, armT) {
  const w = Math.sin(t * 9), e = (a, b) => a + (b - a) * armT;
  switch (name) {
    case 'wave': return [e(10, 112), e(8, 168 + 22 * w)];
    case 'point': return [e(10, 78), e(8, 82 + 3 * Math.sin(t * 3))];
    case 'up': return [e(10, 150), e(8, 176 + 4 * Math.sin(t * 4))];
    case 'shrug': return [e(10, 40), e(8, -150 + 6 * Math.sin(t * 3))];
    case 'hold': return [e(10, 34), e(8, -112 + 3 * Math.sin(t * 2.4))];
    case 'cheer': return [e(10, 148 + 6 * w), e(8, 172 + 10 * Math.sin(t * 9 + 1))];
    default: return [12 + 2 * Math.sin(t * 1.7), 8 + 2 * Math.sin(t * 1.7 + 0.8)];
  }
}

/**
 * يرسم شخصية. st: { t, mouth, blink, emotion, look(-1..1), armL, armR, armT(0..1) }
 * o: { x, y, size, flip, style: 'flat'|'3d', tag }
 */
export function drawCharacter(c, spec, st = {}, o = {}) {
  const { x = 0, y = 0, size = 440, flip = false, style = 'flat', tag = 'ch' } = o;
  const k = size / 440, ST = style === '3d';
  const t = st.t || 0, mouth = clamp01(st.mouth || 0), blink = clamp01(st.blink || 0), emo = EMOTIONS.includes(st.emotion) ? st.emotion : 'neutral';
  const look = Math.max(-1, Math.min(1, st.look || 0)), armT = easeOutCubic(clamp01(st.armT ?? 1));
  const defs = []; let gi = 0;
  const G = (col) => { if (!ST) return col; const id = uid(c, `${tag}g${gi++}`); defs.push(`<radialGradient id="${id}" cx="0.34" cy="0.28" r="0.9"><stop offset="0" stop-color="${lighten(col, 0.3)}"/><stop offset="0.55" stop-color="${col}"/><stop offset="1" stop-color="${darken(col, 0.32)}"/></radialGradient>`); return `url(#${id})`; };
  const LG = (col, x1 = 0, y1 = 0, x2 = 1, y2 = 1) => { if (!ST) return col; const id = uid(c, `${tag}l${gi++}`); defs.push(`<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${lighten(col, 0.22)}"/><stop offset="1" stop-color="${darken(col, 0.3)}"/></linearGradient>`); return `url(#${id})`; };
  const ol = (col) => (ST ? 'none' : darken(col, 0.5));
  const olw = ST ? 0 : 5;
  const stroke = (col) => (ST ? '' : ` stroke="${ol(col)}" stroke-width="${olw}" stroke-linejoin="round"`);

  const breath = 1 + 0.012 * Math.sin(t * 2.2), bob = Math.sin(t * 2.2) * 3.5 - mouth * 3;
  const tilt = Math.sin(t * 1.3) * 1.6 + Math.sin(t * 5.5) * 1.5 * mouth + look * 3;
  let o2 = '';

  if (spec.robot) o2 = drawRobot({ spec, t, mouth, blink, emo, look, st, armT, ST, G, LG, stroke, bob, tilt, breath });
  else o2 = drawHuman({ spec, t, mouth, blink, emo, look, st, armT, ST, G, LG, stroke, bob, tilt, breath });

  const shadow = ST ? `<ellipse cx="0" cy="6" rx="170" ry="16" fill="#000" opacity="0.18"/>` : '';
  return `<defs>${defs.join('')}</defs><g transform="translate(${f1(x)} ${f1(y)}) scale(${f2(flip ? -k : k)} ${f2(k)})">${shadow}${o2}</g>`;
}

// ── أدوات رسم مشتركة ──
function arm(side, st, armT, t, { sleeve, skin, ST, G, stroke, long }) {
  const name = side < 0 ? st.armL : st.armR; const [a1, a2] = poseAngles(name || 'rest', t + (side < 0 ? 0.4 : 0), armT);
  const S = [side * 132, -168], r1 = a1 * Math.PI / 180, r2 = a2 * Math.PI / 180;
  const E = [S[0] + side * SEG.up * Math.sin(r1), S[1] + SEG.up * Math.cos(r1)];
  const H = [E[0] + side * SEG.fo * Math.sin(r2), E[1] + SEG.fo * Math.cos(r2)];
  const seg = (A, B, col, wd) => `<path d="M${f1(A[0])} ${f1(A[1])} L${f1(B[0])} ${f1(B[1])}" stroke="${ST ? col : darken(col, 0.5)}" stroke-width="${wd + (ST ? 0 : 10)}" stroke-linecap="round" fill="none"/><path d="M${f1(A[0])} ${f1(A[1])} L${f1(B[0])} ${f1(B[1])}" stroke="${col}" stroke-width="${wd}" stroke-linecap="round" fill="none"/>`;
  const lightSeg = (A, B, wd) => (ST ? `<path d="M${f1(A[0] - 6)} ${f1(A[1] - 6)} L${f1(B[0] - 6)} ${f1(B[1] - 6)}" stroke="#fff" stroke-opacity="0.16" stroke-width="${wd * 0.35}" stroke-linecap="round" fill="none"/>` : '');
  let o = seg(S, E, sleeve, 58) + lightSeg(S, E, 58);
  o += seg(E, H, long ? sleeve : skin, long ? 52 : 42) + lightSeg(E, H, 42);
  const hid = `<circle cx="${f1(H[0])}" cy="${f1(H[1])}" r="${f1(31)}" fill="${G(skin)}"${stroke(skin)}/>`;
  const thumb = `<ellipse cx="${f1(H[0] + side * 22 * Math.cos(r2))}" cy="${f1(H[1] - 6)}" rx="10" ry="14" fill="${skin}" transform="rotate(${f1(side * 24)} ${f1(H[0])} ${f1(H[1])})"/>`;
  return o + thumb + hid;
}

function eyebrowPath(emo, side, bx, by) {
  // side: -1 شمال | +1 يمين — بنرسم من الخارج للداخل
  const out = bx + side * 34, inn = bx - side * 30;
  switch (emo) {
    case 'sad': return `M${out} ${by + 4} Q${bx} ${by - 4} ${inn} ${by - 16}`;
    case 'angry': return `M${out} ${by - 12} Q${bx} ${by - 4} ${inn} ${by + 10}`;
    case 'surprised': return `M${out} ${by - 16} Q${bx} ${by - 34} ${inn} ${by - 18}`;
    case 'happy': case 'excited': return `M${out} ${by - 4} Q${bx} ${by - 22} ${inn} ${by - 6}`;
    case 'think': return side < 0 ? `M${out} ${by - 4} Q${bx} ${by - 28} ${inn} ${by - 14}` : `M${out} ${by + 2} Q${bx} ${by - 6} ${inn} ${by + 2}`;
    default: return `M${out} ${by} Q${bx} ${by - 12} ${inn} ${by - 2}`;
  }
}

function mouthShape(emo, mouth, ST) {
  const cy = -262; const smile = emo === 'happy' || emo === 'excited' ? 1 : emo === 'sad' ? -1 : emo === 'angry' ? -0.5 : 0.35;
  if (mouth < 0.07) {
    const wd = 26 + (emo === 'happy' || emo === 'excited' ? 14 : 0), ctl = 16 * smile;
    return `<path d="M${-wd} ${cy} Q0 ${cy + ctl * 2} ${wd} ${cy}" fill="none" stroke="#6b2a2a" stroke-width="7" stroke-linecap="round"/>`;
  }
  const wd = 30 + 10 * mouth + (emo === 'happy' || emo === 'excited' ? 8 : 0), hh = 8 + 44 * mouth;
  const top = cy - hh * 0.25, bot = cy + hh * 0.9;
  let o = `<path d="M${-wd} ${top} Q0 ${top + (smile > 0 ? 14 : -4)} ${wd} ${top} Q${wd * 0.85} ${bot} 0 ${bot} Q${-wd * 0.85} ${bot} ${-wd} ${top} Z" fill="#7a1f2b"/>`;
  if (mouth > 0.3) o += `<path d="M${-wd * 0.8} ${top + 3} Q0 ${top + 13} ${wd * 0.8} ${top + 3} L${wd * 0.7} ${top + 12} Q0 ${top + 20} ${-wd * 0.7} ${top + 12} Z" fill="#fff"/>`;
  o += `<ellipse cx="0" cy="${bot - hh * 0.22}" rx="${wd * 0.5}" ry="${hh * 0.22}" fill="#ee6f7a"/>`;
  return o;
}

function drawHuman({ spec, t, mouth, blink, emo, look, st, armT, ST, G, LG, stroke, bob, tilt, breath }) {
  const skin = spec.skin, skinD = darken(skin, 0.16), hair = spec.hair, shirt = spec.shirt;
  const longSleeve = spec.shirtStyle === 'suit';
  let o = '';
  const hairBack = spec.hairStyle === 'long' ? `<path d="M-116 -330 C-130 -440 -60 -470 0 -470 C60 -470 130 -440 116 -330 L126 -150 Q0 -120 -126 -150 Z" fill="${G(hair)}"${stroke(hair)}/>` : '';
  const hijabBack = spec.hairStyle === 'hijab' ? `<path d="M-128 -320 C-135 -450 -60 -482 0 -482 C60 -482 135 -450 128 -320 C130 -250 150 -190 150 -150 L-150 -150 C-150 -190 -130 -250 -128 -320 Z" fill="${G(spec.scarf || '#7c3aed')}"${stroke(spec.scarf || '#7c3aed')}/>` : '';
  // الجسم
  const tor = `<g transform="scale(1 ${f2(breath)})"><path d="M-152 6 L-152 -125 Q-152 -196 -80 -206 L80 -206 Q152 -196 152 -125 L152 6 Z" fill="${LG(shirt, 0, 0, 1, 1)}"${stroke(shirt)}/>`;
  let torso = tor;
  if (spec.shirtStyle === 'suit') {
    torso += `<path d="M-60 -206 L0 -120 L60 -206 Z" fill="#f8fafc"${stroke('#f8fafc')}/>` + (spec.tie ? `<path d="M-14 -190 L14 -190 L22 -110 L0 -90 L-22 -110 Z" fill="${spec.tie}"${stroke(spec.tie)}/>` : '');
    torso += `<path d="M-60 -206 L-8 -118 L-62 -100 Z M60 -206 L8 -118 L62 -100 Z" fill="${darken(shirt, 0.14)}"${stroke(shirt)}/>`;
  } else torso += `<path d="M-52 -206 Q0 -160 52 -206 Q0 -186 -52 -206 Z" fill="${darken(shirt, 0.22)}"/>`;
  if (ST) torso += `<path d="M-152 -125 Q-152 -196 -80 -206 L-30 -206 Q-100 -170 -110 6 L-152 6 Z" fill="#fff" opacity="0.1"/><path d="M152 -125 Q152 -196 80 -206 L40 -206 Q110 -150 118 6 L152 6 Z" fill="#000" opacity="0.14"/>`;
  torso += '</g>';
  const scarfDrape = spec.hairStyle === 'hijab' ? `<path d="M-120 -215 Q0 -150 120 -215 L150 -150 L150 6 L-150 6 L-150 -150 Z" fill="${G(spec.scarf || '#7c3aed')}"${stroke(spec.scarf || '#7c3aed')} opacity="1"/>` : '';
  const neck = `<rect x="-34" y="-244" width="68" height="60" rx="14" fill="${G(skin)}"${stroke(skin)}/>${ST ? `<ellipse cx="0" cy="-232" rx="46" ry="16" fill="${skinD}" opacity="0.55"/>` : ''}`;
  const sleeve = shirt, kidK = spec.kid ? 0.9 : 1;
  const armsSvg = arm(-1, st, armT, t, { sleeve, skin, ST, G, stroke, long: longSleeve }) + arm(1, st, armT, t, { sleeve, skin, ST, G, stroke, long: longSleeve });

  // الراس
  const ex = look * 12; // بارالاكس للملامح (إحساس 3D)
  const hy = -330;
  let head = '';
  head += `<ellipse cx="-101" cy="${hy + 8}" rx="19" ry="25" fill="${G(skin)}"${stroke(skin)}/><ellipse cx="101" cy="${hy + 8}" rx="19" ry="25" fill="${G(skin)}"${stroke(skin)}/>`;
  head += `<ellipse cx="0" cy="${hy}" rx="100" ry="${f1(108 * kidK)}" fill="${G(skin)}"${stroke(skin)}/>`;
  if (ST) head += `<ellipse cx="40" cy="${hy + 20}" rx="56" ry="82" fill="#000" opacity="0.07"/><ellipse cx="-38" cy="${hy - 40}" rx="40" ry="26" fill="#fff" opacity="0.12"/>`;
  // وش
  let face = '';
  face += `<ellipse cx="-62" cy="${hy + 48}" rx="22" ry="13" fill="#ff7b8a" opacity="${ST ? 0.32 : 0.45}"/><ellipse cx="62" cy="${hy + 48}" rx="22" ry="13" fill="#ff7b8a" opacity="${ST ? 0.32 : 0.45}"/>`;
  const eyeY = hy - 8, ry = (emo === 'surprised' ? 30 : 24) * (1 - blink * 0.92), rx = emo === 'surprised' ? 23 : 20;
  for (const s of [-1, 1]) {
    const cx = s * 40 + ex * 0.4;
    face += `<ellipse cx="${f1(cx)}" cy="${eyeY}" rx="${rx}" ry="${f1(Math.max(1.5, ry))}" fill="#fff" stroke="${ST ? '#d8c9bd' : '#3a2a22'}" stroke-width="${ST ? 2 : 4}"/>`;
    if (blink < 0.6) {
      const px = cx + look * 8 + (emo === 'think' ? 3 : 0), py = eyeY + (emo === 'think' ? -7 : 2);
      face += `<circle cx="${f1(px)}" cy="${f1(py)}" r="${emo === 'surprised' ? 8 : 11}" fill="${ST ? G('#2b1d14') : '#2b1d14'}"/><circle cx="${f1(px - 3.5)}" cy="${f1(py - 4)}" r="3.6" fill="#fff"/>`;
    }
    face += `<path d="${eyebrowPath(emo, s, s * 40 + ex * 0.5, eyeY - 38)}" fill="none" stroke="${spec.hairStyle === 'bald' ? '#b9b9b9' : hair}" stroke-width="${spec.kid ? 8 : 10}" stroke-linecap="round"/>`;
  }
  face += `<ellipse cx="${f1(ex * 1.1)}" cy="${hy + 24}" rx="11" ry="${ST ? 13 : 10}" fill="${ST ? G(skin) : skinD}" ${ST ? '' : 'opacity="0.8"'}/>${ST ? `<ellipse cx="${f1(ex * 1.1 + 3)}" cy="${hy + 34}" rx="9" ry="4" fill="#000" opacity="0.1"/>` : ''}`;
  if (spec.beard === 'full') face += `<path d="M-100 ${hy + 6} C-104 ${hy + 90} -50 ${hy + 134} 0 ${hy + 134} C50 ${hy + 134} 104 ${hy + 90} 100 ${hy + 6} C90 ${hy + 36} 62 ${hy + 52} 30 ${hy + 44} Q0 ${hy + 34} -30 ${hy + 44} C-62 ${hy + 52} -90 ${hy + 36} -100 ${hy + 6} Z" fill="${G(hair)}"/>`;
  face += mouthShape(emo, mouth, ST).replace(/#6b2a2a/g, spec.beard === 'full' ? '#f1d6c4' : '#6b2a2a');
  if (spec.beard === 'mustache') face += `<path d="M0 ${hy + 56} C-20 ${hy + 40} -52 ${hy + 44} -60 ${hy + 62} C-40 ${hy + 56} -16 ${hy + 62} 0 ${hy + 62} C16 ${hy + 62} 40 ${hy + 56} 60 ${hy + 62} C52 ${hy + 44} 20 ${hy + 40} 0 ${hy + 56} Z" fill="${G(hair)}"/>`;
  if (spec.glasses) face += `<g fill="${ST ? 'rgba(255,255,255,0.12)' : 'none'}" stroke="#1f2937" stroke-width="7"><circle cx="${f1(-40 + ex * 0.4)}" cy="${eyeY}" r="35"/><circle cx="${f1(40 + ex * 0.4)}" cy="${eyeY}" r="35"/></g><path d="M${f1(-6 + ex * 0.4)} ${eyeY - 2} L${f1(6 + ex * 0.4)} ${eyeY - 2}" stroke="#1f2937" stroke-width="7"/><path d="M-75 ${eyeY - 4} L-100 ${eyeY - 12}M75 ${eyeY - 4} L100 ${eyeY - 12}" stroke="#1f2937" stroke-width="6"/>`;

  // الشعر (قدام)
  let hairF = '';
  switch (spec.hairStyle) {
    case 'short': hairF = `<path d="M-104 ${hy - 6} C-112 ${hy - 96} -56 ${hy - 128} 4 ${hy - 126} C70 ${hy - 124} 112 ${hy - 90} 104 ${hy - 6} C96 ${hy - 52} 64 ${hy - 70} 24 ${hy - 70} C-16 ${hy - 68} -66 ${hy - 64} -104 ${hy - 6} Z" fill="${G(hair)}"${stroke(hair)}/>`; break;
    case 'long': hairF = `<path d="M-108 ${hy + 10} C-120 ${hy - 100} -50 ${hy - 130} 0 ${hy - 128} C66 ${hy - 126} 120 ${hy - 90} 108 ${hy + 10} C104 ${hy - 34} 84 ${hy - 56} 44 ${hy - 70} C14 ${hy - 40} -40 ${hy - 56} -108 ${hy + 10} Z" fill="${G(hair)}"${stroke(hair)}/>`; break;
    case 'bun': hairF = `<circle cx="0" cy="${hy - 142}" r="38" fill="${G(hair)}"${stroke(hair)}/><path d="M-104 ${hy - 4} C-112 ${hy - 96} -56 ${hy - 124} 0 ${hy - 122} C60 ${hy - 122} 112 ${hy - 90} 104 ${hy - 4} C92 ${hy - 56} 50 ${hy - 76} 0 ${hy - 74} C-50 ${hy - 72} -92 ${hy - 54} -104 ${hy - 4} Z" fill="${G(hair)}"${stroke(hair)}/>`; break;
    case 'cap': hairF = `<path d="M-104 ${hy - 44} C-108 ${hy - 126} -50 ${hy - 144} 0 ${hy - 144} C56 ${hy - 144} 108 ${hy - 126} 104 ${hy - 44} Z" fill="${G(spec.cap || '#ef4444')}"${stroke(spec.cap || '#ef4444')}/><path d="M-30 ${hy - 58} Q60 ${hy - 76} 150 ${hy - 52} Q130 ${hy - 36} 20 ${hy - 40} Z" fill="${G(darken(spec.cap || '#ef4444', 0.18))}"${stroke(spec.cap || '#ef4444')}/>`; break;
    case 'bald': hairF = `<ellipse cx="-97" cy="${hy - 40}" rx="13" ry="30" fill="${G(hair)}"${stroke(hair)}/><ellipse cx="97" cy="${hy - 40}" rx="13" ry="30" fill="${G(hair)}"${stroke(hair)}/><path d="M-70 ${hy - 90} Q0 ${hy - 120} 70 ${hy - 90}" fill="none" stroke="${hair}" stroke-width="10" stroke-linecap="round" opacity="0.85"/>`; break;
    case 'hijab': hairF = `<path fill-rule="evenodd" d="M-128 ${hy + 10} C-135 ${hy - 120} -60 ${hy - 152} 0 ${hy - 152} C60 ${hy - 152} 135 ${hy - 120} 128 ${hy + 10} C130 ${hy + 90} 80 ${hy + 128} 0 ${hy + 130} C-80 ${hy + 128} -130 ${hy + 90} -128 ${hy + 10} Z M-84 ${hy - 6} C-86 ${hy - 70} -40 ${hy - 90} 0 ${hy - 90} C40 ${hy - 90} 86 ${hy - 70} 84 ${hy - 6} C86 ${hy + 60} 50 ${hy + 100} 0 ${hy + 102} C-50 ${hy + 100} -86 ${hy + 60} -84 ${hy - 6} Z" fill="${G(spec.scarf || '#7c3aed')}"${stroke(spec.scarf || '#7c3aed')}/>`; break;
    default: break;
  }
  if (ST && hairF) hairF += `<ellipse cx="-30" cy="${hy - 100}" rx="34" ry="12" fill="#fff" opacity="0.2"/>`;
  const headTf = `translate(${f1(look * 4)} ${f1(bob)}) rotate(${f1(tilt)} 0 -250)`;
  o = (hijabBack || hairBack ? `<g transform="${headTf}">${hijabBack || hairBack}</g>` : '') + neck + torso + scarfDrape + armsSvg + `<g transform="${headTf}">${head}${face}${hairF}</g>`;
  return o;
}

function drawRobot({ spec, t, mouth, blink, emo, look, st, armT, ST, G, LG, stroke, bob, tilt, breath }) {
  const metal = spec.skin, dark = '#1e293b', glow = spec.hair || '#0ea5e9';
  const arms = (side) => {
    const name = side < 0 ? st.armL : st.armR; const [a1, a2] = poseAngles(name || 'rest', t + (side < 0 ? 0.4 : 0), armT);
    const S = [side * 140, -160], r1 = a1 * Math.PI / 180, r2 = a2 * Math.PI / 180;
    const E = [S[0] + side * SEG.up * Math.sin(r1), S[1] + SEG.up * Math.cos(r1)], H = [E[0] + side * SEG.fo * Math.sin(r2), E[1] + SEG.fo * Math.cos(r2)];
    const tube = (A, B, wd) => `<path d="M${f1(A[0])} ${f1(A[1])} L${f1(B[0])} ${f1(B[1])}" stroke="${ST ? darken(metal, 0.3) : '#334155'}" stroke-width="${wd + (ST ? 0 : 8)}" stroke-linecap="round"/><path d="M${f1(A[0])} ${f1(A[1])} L${f1(B[0])} ${f1(B[1])}" stroke="${metal}" stroke-width="${wd}" stroke-linecap="round"/>`;
    return tube(S, E, 40) + `<circle cx="${f1(E[0])}" cy="${f1(E[1])}" r="26" fill="${G('#64748b')}"/>` + tube(E, H, 34) + `<circle cx="${f1(H[0])}" cy="${f1(H[1])}" r="30" fill="${G(glow)}"${stroke(glow)}/>`;
  };
  const body = `<g transform="scale(1 ${f2(breath)})"><rect x="-140" y="-220" width="280" height="230" rx="46" fill="${LG(spec.shirt, 0, 0, 1, 1)}"${stroke(spec.shirt)}/><rect x="-72" y="-170" width="144" height="90" rx="22" fill="${dark}"/><circle cx="-34" cy="-125" r="12" fill="${glow}" opacity="${f2(0.6 + 0.4 * Math.sin(t * 4))}"/><circle cx="6" cy="-125" r="12" fill="#facc15" opacity="${f2(0.6 + 0.4 * Math.sin(t * 4 + 2))}"/><circle cx="46" cy="-125" r="12" fill="#f43f5e" opacity="${f2(0.6 + 0.4 * Math.sin(t * 4 + 4))}"/></g>`;
  const neck = `<rect x="-30" y="-250" width="60" height="44" rx="10" fill="${darken(metal, 0.3)}"/>`;
  const ey = -330, eh = 26 * (1 - blink * 0.9), ex = look * 8;
  const mouthBars = Array.from({ length: 7 }, (_, i) => { const hgt = 6 + mouth * (14 + 24 * Math.abs(Math.sin(t * 22 + i * 1.7))); return `<rect x="${-66 + i * 19}" y="${-268 - hgt / 2}" width="12" height="${f1(hgt)}" rx="5" fill="${glow}"/>`; }).join('');
  const brow = emo === 'angry' ? `<path d="M-70 ${ey - 36} L-20 ${ey - 24}M70 ${ey - 36} L20 ${ey - 24}" stroke="${glow}" stroke-width="9" stroke-linecap="round"/>` : emo === 'sad' ? `<path d="M-70 ${ey - 24} L-20 ${ey - 38}M70 ${ey - 24} L20 ${ey - 38}" stroke="${glow}" stroke-width="9" stroke-linecap="round"/>` : emo === 'surprised' || emo === 'excited' ? `<path d="M-68 ${ey - 40} Q-45 ${ey - 54} -22 ${ey - 40}M68 ${ey - 40} Q45 ${ey - 54} 22 ${ey - 40}" fill="none" stroke="${glow}" stroke-width="8" stroke-linecap="round"/>` : '';
  const head = `<g transform="translate(${f1(look * 4)} ${f1(bob)}) rotate(${f1(tilt)} 0 -250)"><path d="M0 -440 L0 -474" stroke="#64748b" stroke-width="8"/><circle cx="0" cy="-482" r="14" fill="${glow}" opacity="${f2(0.7 + 0.3 * Math.sin(t * 5))}"/><circle cx="-108" cy="-330" r="20" fill="${G('#64748b')}"/><circle cx="108" cy="-330" r="20" fill="${G('#64748b')}"/><rect x="-98" y="-436" width="196" height="196" rx="48" fill="${G(metal)}"${stroke(metal)}/><rect x="-78" y="-404" width="156" height="150" rx="30" fill="${dark}"/>`
    + [-1, 1].map(s => `<rect x="${f1(s * 38 + ex - 18)}" y="${f1(ey - eh)}" width="36" height="${f1(eh * 2)}" rx="14" fill="${glow}"/>`).join('') + brow + mouthBars + '</g>';
  return neck + body + arms(-1) + arms(1) + head;
}
