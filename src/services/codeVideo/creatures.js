// ── creatures.js ── مخلوقات كارتون بتتصمم بمعاملات (حيوانات، طيور، كائنات "بلوب": وحوش/فضائيين/حوت/تميمة/فاكهة...) بنفس نظام الحركة بتاع الشخصيات:
// وش بيتكلم متزامن مع الصوت، رمش، تعبيرات، دراعات/زعانف. الـLLM بيرجّع وصف (spec) والكود بيتحقق منه ويرسم — مفيش كود من الـLLM بيتنفذ.
import { f1, f2, lighten, darken, mix, uid, clamp01, easeOutCubic } from './design.js';
import { drawCharacter, arm, eyebrowPath, mouthShape, EMOTIONS } from './characters.js';

export const CREATURE_KINDS = new Set(['animal', 'bird', 'blob']);
export const drawAny = (c, spec, st, o) => (CREATURE_KINDS.has(spec?.kind) ? drawCreature(c, spec, st, o) : drawCharacter(c, spec, st, o));

const hy = -330;

function eyesSvg({ kind, gap, ey, emo, blink, look, ST, G, P, browCol, brows, lidCol }) {
  let o = '';
  const bl = 1 - blink * 0.92;
  const eye = (cx, cy, rx, ry, pr) => {
    let e = '';
    if (kind === 'dots') {
      e += `<ellipse cx="${f1(cx + look * 4)}" cy="${f1(cy)}" rx="${f1(rx * 0.55)}" ry="${f1(Math.max(1.5, ry * 0.62 * bl))}" fill="#1b1410"/>`;
      if (blink < 0.5) e += `<circle cx="${f1(cx + look * 4 - 3)}" cy="${f1(cy - ry * 0.25)}" r="${f1(rx * 0.2)}" fill="#fff"/>`;
      return e;
    }
    e += `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(rx)}" ry="${f1(Math.max(1.5, ry * bl))}" fill="#fff" stroke="${ST ? '#d8c9bd' : '#3a2a22'}" stroke-width="${ST ? 2 : 4}"/>`;
    if (blink < 0.6) {
      const px = cx + look * rx * 0.4 + (emo === 'think' ? 3 : 0), py = cy + (emo === 'think' ? -7 : 2);
      e += `<circle cx="${f1(px)}" cy="${f1(py)}" r="${f1(pr)}" fill="#2b1d14"/><circle cx="${f1(px - pr * 0.32)}" cy="${f1(py - pr * 0.4)}" r="${f1(pr * 0.32)}" fill="#fff"/>`;
    }
    if (kind === 'sleepy') e += `<path d="M${f1(cx - rx - 3)} ${f1(cy)} L${f1(cx + rx + 3)} ${f1(cy)} L${f1(cx + rx + 3)} ${f1(cy - ry - 4)} L${f1(cx - rx - 3)} ${f1(cy - ry - 4)} Z" fill="${lidCol}"/><path d="M${f1(cx - rx)} ${f1(cy)} H${f1(cx + rx)}" stroke="#3a2a22" stroke-width="4"/>`;
    return e;
  };
  const big = kind === 'big', rx = big ? 28 : 20, ry = big ? 32 : (emo === 'surprised' ? 30 : 24), pr = big ? 14 : emo === 'surprised' ? 8 : 11;
  if (kind === 'cyclops') o += eye(0, ey, 44, 48, 22);
  else {
    o += eye(-gap, ey, rx, ry, pr) + eye(gap, ey, rx, ry, pr);
    if (kind === 'three') o += eye(0, ey - 62, 14, 16, 7);
  }
  if (brows !== false) for (const s of (kind === 'cyclops' ? [] : [-1, 1])) o += `<path d="${eyebrowPath(emo, s, s * gap, ey - 38)}" fill="none" stroke="${browCol}" stroke-width="9" stroke-linecap="round"/>`;
  return o;
}

function extrasSvg(list, { topY, ey, gap, P, A, S, G, stroke, ST, t, tag }) {
  let back = '', front = '';
  for (const ex of list) {
    switch (ex) {
      case 'crown': front += `<path d="M-62 ${topY + 8} L-62 ${topY - 44} L-32 ${topY - 16} L0 ${topY - 56} L32 ${topY - 16} L62 ${topY - 44} L62 ${topY + 8} Z" fill="${G('#fbbf24')}"${stroke('#fbbf24')}/><circle cx="0" cy="${topY - 30}" r="7" fill="#ef4444"/>`; break;
      case 'hat': front += `<rect x="-60" y="${topY - 104}" width="120" height="104" rx="8" fill="${G('#1f2937')}"${stroke('#1f2937')}/><rect x="-96" y="${topY - 8}" width="192" height="24" rx="12" fill="${G('#111827')}"${stroke('#111827')}/><rect x="-60" y="${topY - 36}" width="120" height="20" fill="${A}"/>`; break;
      case 'bow': front += `<g transform="translate(70 ${topY + 34}) rotate(18)"><path d="M0 0 L-44 -26 L-44 26 Z M0 0 L44 -26 L44 26 Z" fill="${G('#f472b6')}"${stroke('#f472b6')}/><circle r="12" fill="#ec4899"/></g>`; break;
      case 'horns': back += [-1, 1].map(s => `<path d="M${s * 46} ${topY + 16} Q${s * 96} ${topY - 16} ${s * 70} ${topY - 92} Q${s * 44} ${topY - 34} ${s * 18} ${topY + 6} Z" fill="${G('#f1e6c8')}"${stroke('#f1e6c8')}/>`).join(''); break;
      case 'antenna': back += `<path d="M0 ${topY + 6} Q${6 * Math.sin(t * 3)} ${topY - 40} ${10 * Math.sin(t * 3 + 1)} ${topY - 74}" stroke="${darken(P, 0.4)}" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="${f1(10 * Math.sin(t * 3 + 1))}" cy="${topY - 80}" r="15" fill="${G(A)}"${stroke(A)}/>`; break;
      case 'leaf': back += `<path d="M0 ${topY + 8} Q-70 ${topY - 20} -60 ${topY - 70} Q-6 ${topY - 52} 0 ${topY + 8} Z" fill="${G('#4ade80')}"${stroke('#4ade80')}/><path d="M0 ${topY + 8} Q70 ${topY - 30} 56 ${topY - 84} Q4 ${topY - 56} 0 ${topY + 8} Z" fill="${G('#22c55e')}"${stroke('#22c55e')}/>`; break;
      case 'spikes': back += [-80, -40, 0, 40, 80].map((x, i) => `<path d="M${x - 20} ${topY + 20 - Math.abs(x) * 0.18} L${x} ${topY - 54 + Math.abs(x) * 0.4} L${x + 20} ${topY + 20 - Math.abs(x) * 0.18} Z" fill="${G(A)}"${stroke(A)}/>`).join(''); break;
      case 'fin': back += `<path d="M-20 ${topY + 10} Q-8 ${topY - 70} 54 ${topY - 90} Q36 ${topY - 30} 40 ${topY + 10} Z" fill="${G(darken(P, 0.15))}"${stroke(P)}/>`; break;
      case 'spout': { for (let i = 0; i < 3; i++) { const ph = (t * 0.9 + i / 3) % 1, x = (i - 1) * 26 + Math.sin(ph * 3) * 8, y = topY - 20 - ph * 110; front += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(11 - ph * 5)}" fill="#bfe9ff" opacity="${f2(1 - ph * 0.8)}"/>`; } break; }
      case 'halo': front += `<ellipse cx="0" cy="${topY - 24}" rx="62" ry="16" fill="none" stroke="#fde047" stroke-width="9"/>`; break;
      case 'crest': back += [-30, 0, 30].map((x, i) => `<ellipse cx="${x}" cy="${topY - 14 - (i === 1 ? 24 : 0)}" rx="17" ry="${i === 1 ? 52 : 40}" transform="rotate(${(i - 1) * 22} ${x} ${topY + 20})" fill="${G(A)}"${stroke(A)}/>`).join(''); break;
      case 'glasses': front += `<g fill="${ST ? 'rgba(255,255,255,0.12)' : 'none'}" stroke="#1f2937" stroke-width="7"><circle cx="${-gap}" cy="${ey}" r="${gap > 0 ? 35 : 0}"/><circle cx="${gap}" cy="${ey}" r="35"/></g><path d="M-8 ${ey - 2}H8" stroke="#1f2937" stroke-width="7"/>`; break;
      case 'freckles': front += [[-34, 26], [-22, 36], [-46, 38], [34, 26], [22, 36], [46, 38]].map(([x, y]) => `<circle cx="${x}" cy="${ey + y}" r="4" fill="${darken(P, 0.35)}" opacity="0.7"/>`).join(''); break;
      default: break;
    }
  }
  return { back, front };
}

export function drawCreature(c, spec, st = {}, o = {}) {
  const { x = 0, y = 0, size = 440, flip = false, style = 'flat', tag = 'cr' } = o;
  const k = size / 440, ST = style === '3d';
  const t = st.t || 0, mouth = clamp01(st.mouth || 0), blink = clamp01(st.blink || 0), emo = EMOTIONS.includes(st.emotion) ? st.emotion : 'neutral';
  const look = Math.max(-1, Math.min(1, st.look || 0)), armT = easeOutCubic(clamp01(st.armT ?? 1));
  const defs = []; let gi = 0;
  const G = (col) => { if (!ST) return col; const id = uid(c, `${tag}g${gi++}`); defs.push(`<radialGradient id="${id}" cx="0.34" cy="0.28" r="0.9"><stop offset="0" stop-color="${lighten(col, 0.3)}"/><stop offset="0.55" stop-color="${col}"/><stop offset="1" stop-color="${darken(col, 0.32)}"/></radialGradient>`); return `url(#${id})`; };
  const LG = (col) => { if (!ST) return col; const id = uid(c, `${tag}l${gi++}`); defs.push(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${lighten(col, 0.22)}"/><stop offset="1" stop-color="${darken(col, 0.3)}"/></linearGradient>`); return `url(#${id})`; };
  const stroke = (col) => (ST ? '' : ` stroke="${darken(col, 0.5)}" stroke-width="5" stroke-linejoin="round"`);
  const P = spec.primary, S = spec.secondary, A = spec.accent, outfit = spec.outfit || 'none', OC = spec.outfitColor || A;
  const breath = 1 + 0.012 * Math.sin(t * 2.2), bob = Math.sin(t * 2.2) * 3.5 - mouth * 3, tilt = Math.sin(t * 1.3) * 1.6 + Math.sin(t * 5.5) * 1.5 * mouth + look * 3;
  const headTf = `translate(${f1(look * 4)} ${f1(bob)}) rotate(${f1(tilt)} 0 -250)`;
  const browCol = darken(P, 0.55), extras = Array.isArray(spec.extras) ? spec.extras : [];
  const armCol = outfit !== 'none' ? OC : P;
  const armsSvg = arm(-1, st, armT, t, { sleeve: armCol, skin: P, ST, G, stroke, long: outfit === 'suit' || outfit === 'labcoat' }) + arm(1, st, armT, t, { sleeve: armCol, skin: P, ST, G, stroke, long: outfit === 'suit' || outfit === 'labcoat' });
  const sh = ST ? (a, b, w, h) => `<ellipse cx="${a}" cy="${b}" rx="${w}" ry="${h}" fill="#fff" opacity="0.13"/>` : () => '';
  let out = '';

  if (spec.kind === 'blob') {
    const fy = -300, ey = fy - 12, topY = -430, gap = spec.eyes === 'cyclops' ? 0 : 46;
    const isFace = (e) => e === 'glasses' || e === 'freckles';
    const ex = extrasSvg(extras.filter(e => !isFace(e)), { topY, ey, gap: 46, P, A, S, G, stroke, ST, t, tag });
    const body = `<g transform="scale(1 ${f2(breath)})"><path d="M-152 6 C-176 -170 -152 -330 -92 -398 C-52 -446 52 -446 92 -398 C152 -330 176 -170 152 6 Z" fill="${G(P)}"${stroke(P)}/><ellipse cx="0" cy="-124" rx="98" ry="118" fill="${G(S)}"/>${ST ? `<path d="M120 -330 C170 -230 168 -110 148 6 L100 6 C130 -110 134 -230 100 -380 Z" fill="#000" opacity="0.1"/>` : ''}${sh(-60, -380, 46, 26)}</g>`;
    const patt = spec.pattern === 'spots' ? [[-60, -380, 14], [70, -350, 18], [-90, -230, 16], [96, -200, 12]].map(([a, b, r]) => `<circle cx="${a}" cy="${b}" r="${r}" fill="${darken(P, 0.2)}" opacity="0.8"/>`).join('') : spec.pattern === 'stripes' ? [-60, 0, 60].map(a => `<path d="M${a} -430 Q${a * 1.2} -330 ${a} -230" stroke="${darken(P, 0.22)}" stroke-width="22" fill="none" stroke-linecap="round"/>`).join('') : '';
    const ears = spec.ears === 'round' ? [-1, 1].map(s => `<circle cx="${s * 96}" cy="-418" r="40" fill="${G(P)}"${stroke(P)}/><circle cx="${s * 96}" cy="-418" r="22" fill="${S}"/>`).join('') : spec.ears === 'pointy' ? [-1, 1].map(s => `<path d="M${s * 40} -420 L${s * 108} -490 L${s * 112} -388 Z" fill="${G(P)}"${stroke(P)}/>`).join('') : '';
    const face = eyesSvg({ kind: spec.eyes, gap, ey, emo, blink, look, ST, G, P, browCol, brows: spec.eyes !== 'dots', lidCol: P })
      + (spec.cheeks === false ? '' : [-1, 1].map(s => `<ellipse cx="${s * (gap + 34)}" cy="${ey + 42}" rx="22" ry="13" fill="#ff7b8a" opacity="${ST ? 0.3 : 0.42}"/>`).join(''))
      + mouthShape(emo, mouth, ST, fy - 38 + 70).replace(/#6b2a2a/g, darken(P, 0.6));
    const ex2 = extrasSvg(extras.filter(isFace), { topY, ey, gap: spec.eyes === 'cyclops' ? 44 : 46, P, A, S, G, stroke, ST, t, tag });
    out = `<g transform="${headTf.replace('rotate(' + f1(tilt) + ' 0 -250)', 'rotate(' + f1(tilt * 0.5) + ' 0 -100)')}">${ex.back}${ears}</g>` + body + `<g transform="${headTf.replace('rotate(' + f1(tilt) + ' 0 -250)', 'rotate(' + f1(tilt * 0.5) + ' 0 -100)')}">${patt}${face}${ex2.front}${ex.front}</g>` + armsSvg;
    return `<defs>${defs.join('')}</defs><g transform="translate(${f1(x)} ${f1(y)}) scale(${f2(flip ? -k : k)} ${f2(k)})">${ST ? '<ellipse cx="0" cy="6" rx="170" ry="16" fill="#000" opacity="0.18"/>' : ''}${out}</g>`;
  }

  // ── حيوان / طائر: راس + جسم زي الشخصيات ──
  const gap = 40, ey = hy - 8, isBird = spec.kind === 'bird', topY = hy - (isBird ? 100 : 96);
  const ex = extrasSvg(extras, { topY, ey, gap, P, A, S, G, stroke, ST, t, tag });
  let earsSvg = '';
  if (!isBird) {
    const e = spec.ears;
    if (e === 'round') earsSvg = [-1, 1].map(s => `<circle cx="${s * 76}" cy="${hy - 84}" r="38" fill="${G(P)}"${stroke(P)}/><circle cx="${s * 76}" cy="${hy - 84}" r="22" fill="${S}"/>`).join('');
    else if (e === 'pointy') earsSvg = [-1, 1].map(s => `<path d="M${s * 28} ${hy - 80} L${s * 74} ${hy - 176} L${s * 98} ${hy - 56} Z" fill="${G(P)}"${stroke(P)}/><path d="M${s * 46} ${hy - 86} L${s * 74} ${hy - 144} L${s * 86} ${hy - 72} Z" fill="${S}"/>`).join('');
    else if (e === 'long') earsSvg = [-1, 1].map(s => `<g transform="rotate(${s * 8} ${s * 44} ${hy - 90})"><ellipse cx="${s * 44}" cy="${hy - 176}" rx="27" ry="96" fill="${G(P)}"${stroke(P)}/><ellipse cx="${s * 44}" cy="${hy - 170}" rx="12" ry="70" fill="${S}"/></g>`).join('');
    else if (e === 'floppy') earsSvg = [-1, 1].map(s => `<ellipse cx="${s * 104}" cy="${hy - 6}" rx="32" ry="72" transform="rotate(${s * 12} ${s * 104} ${hy - 40})" fill="${G(darken(P, 0.15))}"${stroke(P)}/>`).join('');
  }
  const mane = extras.includes('mane') ? `<circle cx="0" cy="${hy}" r="150" fill="${G(A)}"${stroke(A)}/>` : '';
  const headShape = isBird ? `<ellipse cx="0" cy="${hy}" rx="104" ry="100" fill="${G(P)}"${stroke(P)}/>` : `<ellipse cx="0" cy="${hy}" rx="104" ry="96" fill="${G(P)}"${stroke(P)}/>`;
  const dark = darken(P, 0.62);
  let patt = '';
  if (spec.pattern === 'mask') patt = [-1, 1].map(s => `<ellipse cx="${s * 42}" cy="${hy - 6}" rx="34" ry="44" transform="rotate(${-s * 22} ${s * 42} ${hy - 6})" fill="#1b1b22"/>`).join('');
  else if (spec.pattern === 'stripes') patt = [-36, 0, 36].map(a => `<path d="M${a} ${hy - 96} Q${a * 1.1} ${hy - 70} ${a * 0.8} ${hy - 44}" stroke="${darken(P, 0.3)}" stroke-width="14" fill="none" stroke-linecap="round"/>`).join('');
  else if (spec.pattern === 'spots') patt = [[-60, -50, 14], [56, -60, 18], [-20, -84, 11], [74, 10, 12]].map(([a, b, r]) => `<circle cx="${a}" cy="${hy + b}" r="${r}" fill="${darken(P, 0.25)}" opacity="0.85"/>`).join('');
  let snout = '', mouthY = hy + 64;
  if (isBird) {
    const open = mouth * 34;
    snout = `<path d="M-30 ${hy + 52 + open} L30 ${hy + 52 + open} L0 ${hy + 92 + open} Z" fill="${darken(A, 0.12)}"${stroke(A)}/><path d="M-36 ${hy + 24} L36 ${hy + 24} L0 ${hy + 66} Z" fill="${G(A)}"${stroke(A)}/>`;
  } else if (spec.snout === 'short') { snout = `<ellipse cx="0" cy="${hy + 50}" rx="58" ry="42" fill="${G(S)}"/><ellipse cx="0" cy="${hy + 28}" rx="15" ry="11" fill="${spec.noseColor || '#2b1d14'}"/>`; mouthY = hy + 66; }
  else if (spec.snout === 'long') { snout = `<ellipse cx="0" cy="${hy + 62}" rx="52" ry="58" fill="${G(S)}"/><ellipse cx="0" cy="${hy + 30}" rx="19" ry="13" fill="${spec.noseColor || '#2b1d14'}"/>`; mouthY = hy + 84; }
  else if (spec.snout === 'pig') { snout = `<ellipse cx="0" cy="${hy + 40}" rx="46" ry="32" fill="${G('#f9a8d4')}"${stroke('#f9a8d4')}/><ellipse cx="-15" cy="${hy + 40}" rx="6" ry="10" fill="#be185d"/><ellipse cx="15" cy="${hy + 40}" rx="6" ry="10" fill="#be185d"/>`; mouthY = hy + 80; }
  const whisk = extras.includes('whiskers') ? [-1, 1].map(s => `<path d="M${s * 40} ${hy + 44} L${s * 110} ${hy + 30}M${s * 40} ${hy + 54} L${s * 112} ${hy + 58}" stroke="#2b1d14" stroke-width="4" stroke-linecap="round"/>`).join('') : '';
  const mouthSvg = isBird ? '' : mouthShape(emo, mouth, ST, mouthY).replace(/#6b2a2a/g, '#3a1d1d');
  const face = patt + snout + eyesSvg({ kind: spec.eyes, gap: spec.eyes === 'cyclops' ? 0 : gap, ey, emo, blink, look, ST, G, P, browCol: spec.pattern === 'mask' ? '#fff' : browCol, brows: spec.eyes !== 'dots', lidCol: P })
    + (spec.cheeks === false ? '' : [-1, 1].map(s => `<ellipse cx="${s * 66}" cy="${hy + 46}" rx="20" ry="12" fill="#ff7b8a" opacity="${ST ? 0.28 : 0.38}"/>`).join('')) + mouthSvg + whisk;
  // الجسم
  let torso = `<g transform="scale(1 ${f2(breath)})"><path d="M-152 6 L-152 -125 Q-152 -196 -80 -206 L80 -206 Q152 -196 152 -125 L152 6 Z" fill="${LG(outfit !== 'none' ? OC : P)}"${stroke(outfit !== 'none' ? OC : P)}/>`;
  if (outfit === 'none') torso += `<ellipse cx="0" cy="-104" rx="94" ry="96" fill="${G(S)}"/>`;
  else if (outfit === 'suit') torso += `<path d="M-60 -206 L0 -120 L60 -206 Z" fill="#f8fafc"${stroke('#f8fafc')}/><path d="M-14 -190 L14 -190 L22 -110 L0 -90 L-22 -110 Z" fill="${A}"${stroke(A)}/>`;
  else if (outfit === 'hoodie') torso += `<path d="M-84 -206 Q0 -140 84 -206 Q0 -178 -84 -206 Z" fill="${darken(OC, 0.25)}"/><rect x="-70" y="-90" width="140" height="64" rx="18" fill="${darken(OC, 0.12)}"/>`;
  else if (outfit === 'apron') torso += `<path d="M-70 -206 L70 -206 L96 6 L-96 6 Z" fill="${G('#f8fafc')}"${stroke('#e2e8f0')}/><rect x="-46" y="-90" width="92" height="56" rx="10" fill="#e2e8f0"/>`;
  else if (outfit === 'labcoat') torso += `<path d="M-50 -206 L0 -90 L-24 6 L-152 6 L-152 -125 Q-152 -196 -80 -206 Z M50 -206 L0 -90 L24 6 L152 6 L152 -125 Q152 -196 80 -206 Z" fill="${G('#f8fafc')}"${stroke('#e2e8f0')}/>`;
  if (extras.includes('bowtie')) torso += `<path d="M0 -200 L-34 -222 L-34 -178 Z M0 -200 L34 -222 L34 -178 Z" fill="${G('#ef4444')}"${stroke('#ef4444')}/><circle cy="-200" r="9" fill="#b91c1c"/>`;
  if (ST) torso += `<path d="M-152 -125 Q-152 -196 -80 -206 L-30 -206 Q-100 -170 -110 6 L-152 6 Z" fill="#fff" opacity="0.1"/><path d="M152 -125 Q152 -196 80 -206 L40 -206 Q110 -150 118 6 L152 6 Z" fill="#000" opacity="0.14"/>`;
  torso += '</g>';
  const neck = `<rect x="-34" y="-244" width="68" height="60" rx="14" fill="${G(P)}"${stroke(P)}/>`;
  const scarf = extras.includes('scarf') ? `<path d="M-70 -214 Q0 -170 70 -214 L66 -184 Q0 -144 -66 -184 Z" fill="${G(A)}"${stroke(A)}/><path d="M30 -176 L58 -90 L28 -96 Z" fill="${G(darken(A, 0.12))}"${stroke(A)}/>` : '';
  const cape = extras.includes('cape') ? `<path d="M-130 -190 L-170 6 L170 6 L130 -190 Z" fill="${G(A)}"${stroke(A)}/>` : '';
  const fx = extrasSvg(extras.filter(e => e !== 'glasses' && e !== 'freckles'), { topY, ey, gap, P, A, S, G, stroke, ST, t, tag }), fx2 = extrasSvg(extras.filter(e => e === 'glasses' || e === 'freckles'), { topY, ey, gap, P, A, S, G, stroke, ST, t, tag });
  out = cape + `<g transform="${headTf}">${mane}${fx.back}${earsSvg}</g>` + neck + torso + scarf + armsSvg
    + `<g transform="${headTf}">${headShape}${ST ? `<ellipse cx="40" cy="${hy + 20}" rx="56" ry="76" fill="#000" opacity="0.07"/><ellipse cx="-38" cy="${hy - 40}" rx="40" ry="24" fill="#fff" opacity="0.12"/>` : ''}${face}${fx.front}${fx2.front}</g>`;
  return `<defs>${defs.join('')}</defs><g transform="translate(${f1(x)} ${f1(y)}) scale(${f2(flip ? -k : k)} ${f2(k)})">${ST ? '<ellipse cx="0" cy="6" rx="170" ry="16" fill="#000" opacity="0.18"/>' : ''}${out}</g>`;
}
