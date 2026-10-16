// ── sound.js ── تصميم صوت قوي: مؤثرات متولّدة بـffmpeg (طبقات: ضربة + ذيل + شقّة) متزامنة مع حركة المشاهد، + خلط مع الصوت والموسيقى
import fs from 'fs';
import path from 'path';
import { ffmpeg } from '../documentary/ff.js';
import { ensureSfx } from '../documentary/sfx.js';
import { mixAudio } from '../documentary/audioMix.js';
import { appearTimes } from './art.js';

// كل مؤثر = وسائط ffmpeg كاملة (lavfi) → wav ستيريو 44.1k
const noise = (d, color = 'pink') => ['-f', 'lavfi', '-i', `anoisesrc=d=${d}:c=${color}:r=44100`];
const expr = (e, d) => ['-f', 'lavfi', '-i', `aevalsrc='${e}':d=${d}:s=44100`];
const SPECS = {
  // ضربات
  impact_big: [...expr('0.95*sin(2*PI*(38+80*exp(-7*t))*t)*exp(-2.6*t)+0.4*(random(0)-0.5)*exp(-16*t)+0.25*sin(2*PI*(180-120*t)*t)*exp(-9*t)', 2.2), '-af', 'lowpass=f=2400,acompressor=threshold=0.3:ratio=4,volume=1.0'],
  hit: [...expr('0.9*sin(2*PI*(95+320*exp(-32*t))*t)*exp(-9*t)+0.3*(random(0)-0.5)*exp(-38*t)', 0.5), '-af', 'volume=0.95'],
  slam: [...expr('0.95*sin(2*PI*(55+140*exp(-22*t))*t)*exp(-6*t)+0.5*(random(0)-0.5)*exp(-26*t)', 0.9), '-af', 'lowpass=f=3200,volume=1.0'],
  // وشّات (ضجيج بغلاف جرس + مسح نغمة)
  whoosh_s: [...noise(0.7), '-af', "highpass=f=350,lowpass=f=7000,volume='0.9*sin(PI*min(1,t/0.7))':eval=frame,afade=t=out:st=0.45:d=0.25,volume=2.4,alimiter=limit=0.95"],
  whoosh_l: [...noise(1.3), '-af', "highpass=f=180,lowpass=f=5200,volume='0.95*pow(sin(PI*min(1,t/1.3)),1.4)':eval=frame,afade=t=out:st=0.9:d=0.4,volume=2.3,alimiter=limit=0.95"],
  sweep_up: [...expr('0.38*sin(2*PI*(260+5200*t*t/0.8)*t)*sin(PI*min(1,t/0.8))', 0.8), '-af', 'lowpass=f=9000,volume=1.9,alimiter=limit=0.95'],
  sweep_down: [...expr('0.38*sin(2*PI*(3600-3000*t/0.7)*t)*sin(PI*min(1,t/0.7))', 0.7), '-af', 'lowpass=f=9000,volume=1.8,alimiter=limit=0.95'],
  riser_l: [...noise(3.0, 'white'), '-af', "highpass=f=500,lowpass=f=8000,volume='0.15+0.85*pow(t/3,2.2)':eval=frame,afade=t=out:st=2.9:d=0.1"],
  // نغمات
  ding: [...expr('0.5*sin(2*PI*1320*t)*exp(-5*t)+0.3*sin(2*PI*1980*t)*exp(-6.5*t)+0.15*sin(2*PI*2640*t)*exp(-8*t)', 1.2), '-af', 'volume=0.9'],
  shimmer: [...expr('0.35*(sin(2*PI*1046*t)*exp(-4*t)+sin(2*PI*1318*max(0,t-0.07))*exp(-4*max(0,t-0.07))*gte(t,0.07)+sin(2*PI*1568*max(0,t-0.14))*exp(-4*max(0,t-0.14))*gte(t,0.14)+sin(2*PI*2093*max(0,t-0.21))*exp(-4*max(0,t-0.21))*gte(t,0.21))', 1.4), '-af', 'volume=0.95'],
  zap: [...expr('0.5*sin(2*PI*(2400-1900*t/0.28)*t)*exp(-9*t)', 0.32), '-af', 'volume=0.85'],
  cheer: [...noise(2.4, 'pink'), '-af', "bandpass=f=1500:width_type=h:w=2200,tremolo=f=7:d=0.6,volume='min(1,t/0.25)*exp(-0.9*t)*2.4':eval=frame,alimiter=limit=0.95"],
  splash: [...noise(1.0, 'white'), '-af', "highpass=f=900,lowpass=f=9000,volume='1.7*exp(-4*t)':eval=frame,alimiter=limit=0.95"],
  sizzle: [...noise(1.4, 'white'), '-af', "highpass=f=3500,tremolo=f=28:d=0.7,volume='0.9*min(1,t/0.1)*exp(-1.2*t)':eval=frame"],
  // ورق: حفيف ورقة بتترمي/بتتسحب، شخبطة قلم، ختم مطاطي
  paper: [...noise(0.55, 'white'), '-af', "highpass=f=1800,lowpass=f=9000,tremolo=f=34:d=0.8,volume='1.5*sin(PI*min(1,t/0.55))':eval=frame,alimiter=limit=0.95"],
  scribble: [...noise(0.6, 'pink'), '-af', "bandpass=f=3200:width_type=h:w=2600,tremolo=f=11:d=0.9,volume='0.9*min(1,t/0.05)*exp(-1.6*t)':eval=frame"],
  stamp: [...expr('0.95*sin(2*PI*(70+90*exp(-30*t))*t)*exp(-14*t)+0.45*(random(0)-0.5)*exp(-40*t)', 0.45), '-af', 'lowpass=f=2600,volume=1.0'],
  rumble: [...noise(2.0, 'brown'), '-af', "lowpass=f=140,volume='1.6*sin(PI*min(1,t/2.0))':eval=frame"],
};
export const CV_SFX_TYPES = Object.keys(SPECS);

export async function ensureCvSfx(dir) {
  const base = await ensureSfx(dir); // whoosh, impact, tick, pop, swish, boom, glitch, click, riser
  for (const [name, args] of Object.entries(SPECS)) {
    const file = path.join(dir, `${name}.wav`);
    if (!fs.existsSync(file)) await ffmpeg([...args.slice(0, args.indexOf('-af')), '-af', args[args.indexOf('-af') + 1], '-ar', '44100', '-ac', '2', file]);
    base[name] = file;
  }
  return base;
}

// ── أحداث الصوت لكل نوع مشهد (t نسبة لبداية المشهد) ──
const E = (t, type, vol) => ({ t, type, vol });
// وقت أول كلمة مهمة في المشهد (عشان صوت الختم/الشخبطة ييجي مع رسمها بالظبط — نفس منطق scenesV)
const cleanW = (x) => String(x || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function emphAt(sc, d) {
  const want = new Set((d.emphasis || []).map(cleanW).filter(Boolean));
  const hit = (sc?.tokens || []).find(x => want.has(cleanW(x.w)));
  return hit ? hit.start : null;
}
export const SCENE_SFX = {
  title: (d) => [E(0.02, 'whoosh_l', 0.7), E(0.28, 'impact_big', 0.75), E(0.95, 'shimmer', 0.45)],
  kinetic: (d, sc) => {
    const ev = [E(0.02, 'whoosh_s', 0.45)];
    const emph = new Set((d.emphasis || []).map(x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
    (sc.tokens || []).forEach((tk, i) => {
      const clean = String(tk.w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      if (emph.has(clean)) ev.push(E(Math.max(0, tk.start - 0.04), 'hit', 0.7), E(Math.max(0, tk.start - 0.04), 'zap', 0.4));
      else if (i % 3 === 0 && i > 0) ev.push(E(Math.max(0, tk.start - 0.03), 'tick', 0.32));
    });
    return ev;
  },
  bigword: () => [E(0.0, 'sweep_up', 0.6), E(0.25, 'slam', 1.0), E(0.25, 'impact_big', 0.7), E(0.7, 'shimmer', 0.35)],
  quote: () => [E(0.05, 'whoosh_s', 0.45), E(0.45, 'ding', 0.4)],
  outro: () => [E(0.0, 'riser_l', 0.5), E(0.9, 'impact_big', 0.7), E(1.15, 'shimmer', 0.6)],
  stat: () => [E(0.15, 'riser_l', 0.55), E(1.9, 'impact_big', 0.75), E(2.0, 'ding', 0.5)],
  bars: (d) => [E(0.2, 'whoosh_s', 0.5), ...d.items.slice(0, 6).map((_, i) => E(0.4 + i * 0.18, 'pop', 0.55)), E(1.4 + d.items.length * 0.18, 'ding', 0.4)],
  donut: (d) => [E(0.2, 'sweep_up', 0.55), ...d.items.slice(0, 5).map((_, i) => E(0.7 + i * 0.16, 'pop', 0.5)), E(1.9, 'ding', 0.45)],
  line: (d) => [E(0.25, 'riser_l', 0.45), ...d.points.slice(0, 8).map((_, i, a) => E(0.3 + 1.7 * (i / Math.max(1, a.length - 1)), 'tick', 0.5)), E(2.1, 'impact_big', 0.55)],
  list: (d) => [E(0.2, 'whoosh_s', 0.5), ...d.items.slice(0, 5).map((_, i) => E(0.3 + i * 0.5, 'pop', 0.6))],
  compare: () => [E(0.2, 'whoosh_s', 0.55), E(0.45, 'whoosh_s', 0.55), E(0.8, 'slam', 0.8)],
  timeline: (d) => [E(0.2, 'whoosh_l', 0.45), ...d.events.slice(0, 6).map((_, i, a) => E(0.35 + Math.min(2.4, 0.5 + a.length * 0.45) * (i / Math.max(1, a.length - 1)), 'pop', 0.55))],
  icons: (d) => d.items.slice(0, 6).flatMap((_, i) => [E(0.3 + i * 0.28, 'pop', 0.6), E(0.45 + i * 0.28, 'shimmer', 0.18)]),
  steps: (d) => d.steps.slice(0, 5).flatMap((_, i) => [E(0.3 + i * 0.4, 'pop', 0.6), E(0.55 + i * 0.4, 'whoosh_s', 0.25)]),
  gridstats: (d) => [E(0.2, 'whoosh_s', 0.5), ...d.items.slice(0, 4).map((_, i) => E(0.35 + i * 0.22, 'pop', 0.55)), E(2.1, 'ding', 0.45)],
  globe: (d) => [E(0.1, 'whoosh_l', 0.5), ...(d.pins || []).slice(0, 4).map((_, i) => E(0.9 + i * 0.5, 'ding', 0.5))],
  network: (d) => [E(0.15, 'whoosh_s', 0.5), ...d.nodes.slice(0, 6).map((_, i) => E(0.5 + i * 0.3, 'pop', 0.55))],
  // كارتون
  char_say: (d, sc) => {
    const ev = [E(0.02, 'whoosh_s', 0.45), E(0.3, 'pop', 0.65)];
    const emph = new Set((d.emphasis || []).map(x => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
    (sc.tokens || []).forEach((tk) => { if (emph.has(String(tk.w).toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))) ev.push(E(Math.max(0, tk.start - 0.04), 'pop', 0.6), E(Math.max(0, tk.start - 0.04), 'shimmer', 0.22)); });
    return ev;
  },
  char_prop: () => [E(0.02, 'whoosh_s', 0.5), E(0.3, 'pop', 0.65), E(0.34, 'shimmer', 0.45), E(0.8, 'ding', 0.4)],
  char_duo: (d, sc) => { const tk = sc.tokens || []; const half = tk.length ? tk[Math.floor(tk.length / 2)].start : 2; return [E(0.02, 'whoosh_s', 0.45), E(0.14, 'pop', 0.6), E(0.3, 'pop', 0.55), E(Math.max(0.5, half - 0.05), 'pop', 0.55)]; },
  // رسم حر: whoosh + pop عند ظهور أجزاء الرسمة
  art: (d, sc) => {
    const dur = (sc.end - sc.start) || 4, ev = [E(0.03, 'whoosh_s', 0.5)]; let last = -1;
    for (const tm of appearTimes(d.elements || [], dur)) { if (tm - last >= 0.22 && ev.length < 9) { ev.push(E(tm + 0.05, 'pop', 0.5)); last = tm; } }
    ev.push(E(Math.min(dur * 0.7, last + 0.5), 'shimmer', 0.35));
    return ev;
  },
  // عالم 3D: مؤثرات من حركات الشخصيات والأغراض
  world: (d, sc) => {
    const dur = (sc.end - sc.start) || 4, ev = [];
    for (const a of d.actors || []) for (const t of a.tracks) {
      const s = t.at * dur, len = t.dur * dur;
      switch (t.act) {
        case 'kick': ev.push(E(s + 0.55 * len, 'hit', 0.8)); break;
        case 'pass': ev.push(E(s + 0.55 * len, 'hit', 0.45)); break;
        case 'throw': ev.push(E(s + 0.55 * len, 'whoosh_s', 0.4)); break;
        case 'dive': ev.push(E(s + 0.85 * len, 'slam', 0.55)); break;
        case 'fall': ev.push(E(s + 0.7 * len, 'slam', 0.55)); break;
        case 'celebrate': case 'cheer': ev.push(E(s, 'cheer', 0.4)); break;
        case 'jump': ev.push(E(s + 0.1 * len, 'pop', 0.4)); break;
        case 'chop': ev.push(E(s + 0.1, 'tick', 0.4), E(s + 0.65, 'tick', 0.4)); break;
        case 'stir': ev.push(E(s, 'sizzle', 0.22)); break;
        case 'swing': ev.push(E(s + 0.65 * len, 'hit', 0.6)); break;
        case 'clap': ev.push(E(s + 0.1, 'tick', 0.4), E(s + 0.6, 'tick', 0.4)); break;
        default: break;
      }
    }
    for (const p of d.props || []) for (const m of p.moves || []) { if (m.arc > 0) ev.push(E(Math.min(dur - 0.05, (m.at + m.dur) * dur), 'hit', 0.4)); }
    for (const x of (d.sfx || []).slice(0, 3)) ev.push(E(x.at * dur, x.type, 0.6));
    return ev;
  },
  // Vox
  photo: (d, sc) => { const te = emphAt(sc, d); return [E(0.05, 'paper', 0.7), E(0.5, 'click', 0.45), ...(d.caption ? [E(0.95, 'scribble', 0.45)] : []), ...(te != null ? [E(te, 'scribble', 0.5)] : [])]; },
  fullphoto: (d, sc) => [E(0.0, 'paper', 0.5), E(0.2, 'click', 0.4), E(emphAt(sc, d) ?? Math.min((sc.end - sc.start) * 0.4, 1.4), 'stamp', 0.75)],
  collage: () => [E(0.1, 'paper', 0.6), E(0.5, 'paper', 0.6), E(0.9, 'paper', 0.6), E(0.75, 'scribble', 0.4), E(1.6, 'scribble', 0.4)],
  logo: (d, sc) => { const te = emphAt(sc, d); return [E(0.05, 'paper', 0.7), E(0.5, 'paper', 0.45), ...(d.rank ? [E(0.4, 'stamp', 0.8)] : []), ...(te != null ? [E(te, 'scribble', 0.5)] : [])]; },
  papermap: (d) => [E(0.0, 'paper', 0.55), E(0.2, 'whoosh_l', 0.45), ...(d.places || []).slice(0, 4).map((_, i) => E(1.3 + i * 0.55 + 0.3, 'click', 0.75)), ...(d.route ? [E(1.9, 'scribble', 0.4)] : [])],
  headline: (d) => [E(0.05, 'paper', 0.65), E(0.45, 'click', 0.4), ...(d.emphasis?.length ? [E(1.0, 'scribble', 0.45)] : [])],
};
// صوت الانتقالات (عند حدّ المشهد)
export const TRANSITION_SFX = {
  slide: [['whoosh_s', 0.7]], slideup: [['whoosh_s', 0.7]], zoom: [['whoosh_l', 0.7]], wipe: [['sweep_up', 0.55]],
  iris: [['sweep_down', 0.5]], paper: [['paper', 0.75]], flash: [['boom', 0.8]], glitch: [['glitch', 0.7]], cut: [],
};
// أولوية الصوت: لما المؤثرات تتزاحم بنسيب الأهم ونشيل الباقي (من غير ما يبقى فيه صوت بيتكرر بشكل غريب)
const PRI = { stamp: 8, paper: 3, scribble: 2, impact_big: 9, slam: 9, boom: 9, hit: 8, cheer: 8, splash: 7, ding: 6, zap: 6, glitch: 6, shimmer: 5, riser_l: 5, rumble: 4, sweep_up: 4, sweep_down: 4, whoosh_l: 4, whoosh_s: 3, swish: 3, pop: 3, click: 3, sizzle: 2, tick: 1 };
const SAME_GAP = { paper: 0.35, scribble: 0.6, tick: 0.55, pop: 0.7, click: 0.6, whoosh_s: 1.6, whoosh_l: 3, sweep_up: 2.5, sweep_down: 2.5, sizzle: 4, cheer: 3, shimmer: 2.5, ding: 2, default: 1.0 };
/** حاكم كثافة المؤثرات: فجوة دنيا بين أي صوتين، فجوة أكبر لنفس النوع، وحد أقصى لكل نافذة 10 ثواني */
export function governSfx(events, { minGap = 0.34, window = 10, maxPerWindow = 7 } = {}) {
  const order = events.map((e, i) => ({ ...e, i })).sort((a, b) => (PRI[b.type] || 2) - (PRI[a.type] || 2) || a.t - b.t);
  const kept = [];
  for (const e of order) {
    const same = SAME_GAP[e.type] ?? SAME_GAP.default;
    if (kept.some(k => Math.abs(k.t - e.t) < minGap && !((PRI[k.type] || 2) >= 8 && (PRI[e.type] || 2) <= 5 && Math.abs(k.t - e.t) < 0.1))) continue; // نفس اللحظة: الأهم بس (إلا طبقة خفيفة تحت ضربة قوية)
    if (kept.some(k => k.type === e.type && Math.abs(k.t - e.t) < same)) continue;
    if (kept.filter(k => Math.abs(k.t - e.t) < window / 2).length >= maxPerWindow) continue;
    kept.push(e);
  }
  return kept.sort((a, b) => a.t - b.t).map(({ i, ...rest }) => rest);
}

export function collectSfx(scenes) {
  const ev = [];
  scenes.forEach((sc, i) => {
    const fn = SCENE_SFX[sc.type] || SCENE_SFX.kinetic;
    for (const e of fn(sc.data || {}, sc)) ev.push({ t: sc.start + e.t, type: e.type, vol: e.vol });
    if (i > 0) for (const [type, vol] of TRANSITION_SFX[sc.trKind] || []) ev.push({ t: Math.max(0, sc.start - (type.startsWith('whoosh') || type.startsWith('sweep') ? 0.18 : 0.02)), type, vol });
  });
  return governSfx(ev.filter(e => e.t >= 0));
}

export async function mixCodeVideoAudio({ narrationFile, musicFile, scenes, duration, workDir, outFile, musicVolume = 0.2, sfxGain = 1 }) {
  const sfxFiles = await ensureCvSfx(path.join(workDir, 'sfx'));
  const events = collectSfx(scenes).map(e => ({ ...e, vol: Math.min(1, e.vol * sfxGain) })).filter(e => sfxFiles[e.type]);
  // نخفّف المؤثرات المتزاحمة جدًا (نفس النوع خلال 90ms) عشان ما تتلخبطش
  const lastAt = {}; const kept = [];
  for (const e of events) { if (lastAt[e.type] != null && e.t - lastAt[e.type] < 0.09) continue; lastAt[e.type] = e.t; kept.push(e); }
  await mixAudio({ narrationFile, musicFile, musicVolume, sfxEvents: kept, sfxFiles, duration, outFile });
  return { events: kept.length };
}
