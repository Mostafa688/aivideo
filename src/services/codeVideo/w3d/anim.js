// ── w3d/anim.js ── حركات إجرائية (من غير ملفات أنيميشن): كل حركة بترجّع زوايا المفاصل بالراديان
// الزوايا: f = لقدّام (موجب)، out = للخارج، bend = ثني الكوع/الركبة | lean موجب = ميل للأمام
import { clamp, smooth, lerp } from './math.js';

export const ACTS = ['idle', 'walk', 'run', 'jog', 'kick', 'pass', 'throw', 'celebrate', 'cheer', 'dive', 'fall', 'lie', 'sit', 'stir', 'chop', 'wave', 'point', 'talk', 'dance', 'carry', 'hold', 'sad', 'angry', 'swing', 'jump', 'pickup', 'ready', 'eat', 'clap'];
export const MOVING_ACTS = new Set(['walk', 'run', 'jog', 'dance', 'carry', 'hold']);
const A = (f = 0, out = 0, bend = 0) => ({ f, out, bend });
const blank = () => ({ y: 0, pitch: 0, roll: 0, yaw: 0, lean: 0, twist: 0, headYaw: 0, headPitch: 0, aL: A(), aR: A(), lL: A(), lR: A() });
const TAU = Math.PI * 2;

function cycle(pose, t, freq, o) { // دورة مشي/جري
  const ph = t * TAU * freq, sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
  const kn = (s, off) => o.knee * Math.max(0, Math.sin(ph + off) * 0.9 + 0.1);
  pose.lL = A(o.leg * sL, 0, o.knee * Math.max(0, Math.cos(ph)));
  pose.lR = A(o.leg * sR, 0, o.knee * Math.max(0, Math.cos(ph + Math.PI)));
  pose.aL = A(-o.arm * sL, 0.06, o.bend); pose.aR = A(-o.arm * sR, 0.06, o.bend);
  pose.y = Math.abs(Math.sin(ph)) * o.bounce; pose.lean = o.lean; pose.twist = sL * o.twist;
}

/** @param act اسم الحركة  @param t الوقت المطلق بالثواني (للدورات)  @param p تقدّم الحركة 0..1 (للحركات اللحظية)  @param o { moving, dir } */
export function poseFor(act, t, p = 0, o = {}) {
  const s = blank(), e = smooth(p);
  const moving = !!o.moving;
  switch (act) {
    case 'walk': cycle(s, t, 0.95, { leg: 0.55, knee: 0.7, arm: 0.5, bend: 0.25, bounce: 0.02, lean: 0.05, twist: 0.06 }); break;
    case 'jog': cycle(s, t, 1.3, { leg: 0.8, knee: 1.0, arm: 0.8, bend: 0.9, bounce: 0.045, lean: 0.14, twist: 0.1 }); break;
    case 'run': cycle(s, t, 1.6, { leg: 1.0, knee: 1.35, arm: 1.0, bend: 1.4, bounce: 0.08, lean: 0.3, twist: 0.14 }); s.headPitch = -0.15; break;
    case 'idle': { const b = Math.sin(t * 2.2); s.lean = 0.02 + b * 0.015; s.aL = A(0.05, 0.1 + b * 0.02, 0.1); s.aR = A(0.05, 0.1 - b * 0.02, 0.1); s.headYaw = Math.sin(t * 0.7) * 0.25; s.y = b * 0.005; break; }
    case 'ready': s.lean = 0.18; s.y = -0.1; s.lL = A(0.15, 0.3, 0.5); s.lR = A(0.15, 0.3, 0.5); s.aL = A(0.9, 0.7, 0.9); s.aR = A(0.9, 0.7, 0.9); s.twist = Math.sin(t * 3) * 0.1; break;
    case 'kick': case 'pass': { const big = act === 'kick' ? 1 : 0.6;
      const back = smooth(p / 0.4), fwd = smooth((p - 0.4) / 0.22), rec = smooth((p - 0.65) / 0.35);
      const leg = (-0.9 * back * big) + (1.3 * big + 0.9 * big) * fwd - (1.3 * big) * rec;
      s.lR = A(leg, 0, 1.1 * back * (1 - fwd) + 0.15); s.lL = A(0.05, 0.05, 0.25); s.lean = -0.12 * fwd * big + 0.08; s.twist = -0.25 * fwd;
      s.aL = A(-0.4 * fwd, 0.8, 0.5); s.aR = A(0.5 * fwd, 0.7, 0.4); s.y = 0.02; break; }
    case 'throw': { const w = smooth(p / 0.4), r = smooth((p - 0.4) / 0.25), rc = smooth((p - 0.65) / 0.35);
      s.aR = A(-1.0 * w + 3.4 * r - 2.4 * rc, 0.4, 1.4 * w * (1 - r) + 0.2); s.aL = A(0.8, 0.5, 0.6); s.twist = 0.5 * w - 0.8 * r + 0.3 * rc; s.lean = 0.2 * r; s.lR = A(0.2 * w, 0, 0.2); s.lL = A(-0.1, 0, 0.1); break; }
    case 'celebrate': { const j = Math.abs(Math.sin(t * 5)); s.y = 0.32 * j; s.aL = A(2.9, 0.5, 0.2 + 0.3 * Math.sin(t * 9)); s.aR = A(2.9, 0.5, 0.2 + 0.3 * Math.sin(t * 9 + 1)); s.headPitch = -0.3; s.lL = A(0.1, 0.1, 0.5 * (1 - j)); s.lR = A(-0.1, 0.1, 0.5 * (1 - j)); s.lean = -0.05; break; }
    case 'cheer': s.aL = A(2.7, 0.5, 0.3 + 0.4 * Math.sin(t * 8)); s.aR = A(2.7, 0.5, 0.3 + 0.4 * Math.sin(t * 8 + 2)); s.headPitch = -0.25; s.y = Math.abs(Math.sin(t * 4)) * 0.08; break;
    case 'dive': { const d = o.dir || 1, up = Math.sin(clamp(p, 0, 1) * Math.PI * 0.85), fl = smooth(p / 0.7);
      s.roll = -d * 1.45 * fl; s.y = 0.15 + 0.55 * up - 0.45 * smooth((p - 0.8) / 0.2) * 0 ; s.aL = A(3.0, 0.2, 0); s.aR = A(3.0, 0.2, 0); s.lL = A(0.1, 0.3, 0.1); s.lR = A(0.1, 0.5, 0.1); s.lean = 0.1; break; }
    case 'fall': { const f = smooth(p / 0.75); s.pitch = 1.5 * f; s.y = -0.62 * f; s.aL = A(2.1 * f, 0.4, 0.3); s.aR = A(2.1 * f, 0.4, 0.3); s.lL = A(-0.3 * f, 0.1, 0.2); s.lR = A(-0.3 * f, 0.1, 0.2); s.headPitch = -0.7 * f; break; }
    case 'lie': s.pitch = 1.5; s.y = -0.62; s.aL = A(2.1, 0.4, 0.3); s.aR = A(2.1, 0.4, 0.3); s.headPitch = -0.7; break;
    case 'sit': s.y = -0.46; s.lL = A(1.5, 0.08, 1.5); s.lR = A(1.5, 0.08, 1.5); s.aL = A(0.5, 0.1, 0.9); s.aR = A(0.5, 0.1, 0.9); s.lean = 0.05; s.headYaw = Math.sin(t * 0.8) * 0.25; break;
    case 'stir': s.lean = 0.14; s.headPitch = 0.3; s.aR = A(1.1 + 0.12 * Math.sin(t * 6), 0.15 + 0.2 * Math.cos(t * 6), 1.3); s.aL = A(0.7, 0.3, 1.1); s.twist = 0.1 * Math.sin(t * 6); s.lL = A(0, 0.08, 0); s.lR = A(0, 0.08, 0); break;
    case 'chop': s.lean = 0.2; s.headPitch = 0.4; s.aR = A(1.0, 0.1, 0.5 + 0.9 * (0.5 + 0.5 * Math.sin(t * 9))); s.aL = A(1.25, 0.15, 0.9); s.lL = A(0, 0.1, 0); s.lR = A(0, 0.1, 0); break;
    case 'wave': s.aR = A(2.6, 0.6, 0.4 + 0.6 * Math.sin(t * 8)); s.aL = A(0.05, 0.1, 0.1); s.headYaw = Math.sin(t * 1.2) * 0.2; s.y = Math.sin(t * 2) * 0.006; break;
    case 'point': s.aR = A(1.55, 0.05, 0.05); s.aL = A(0.05, 0.1, 0.1); s.lean = 0.05; s.headYaw = 0.1; break;
    case 'talk': s.aR = A(0.7 + 0.3 * Math.sin(t * 3), 0.2, 1.0); s.aL = A(0.5 + 0.3 * Math.sin(t * 2.3 + 1), 0.25, 1.0); s.headYaw = Math.sin(t * 1.3) * 0.2; s.headPitch = Math.sin(t * 4) * 0.06; s.lean = 0.03; break;
    case 'dance': { const b = Math.sin(t * 7); s.y = Math.abs(b) * 0.07; s.twist = Math.sin(t * 3.5) * 0.4; s.aL = A(1.6 + 1.2 * Math.sin(t * 3.5), 0.6, 0.6); s.aR = A(1.6 - 1.2 * Math.sin(t * 3.5), 0.6, 0.6); s.lL = A(0.5 * Math.sin(t * 3.5), 0.15, 0.3 + 0.4 * Math.max(0, b)); s.lR = A(-0.5 * Math.sin(t * 3.5), 0.15, 0.3 + 0.4 * Math.max(0, -b)); s.headYaw = Math.sin(t * 3.5) * 0.3; break; }
    case 'carry': s.aL = A(1.25, 0.15, 0.9); s.aR = A(1.25, 0.15, 0.9); s.lean = -0.05; break;
    case 'hold': s.aR = A(0.9, 0.12, 1.15); s.aL = A(0.05, 0.1, 0.1); break;
    case 'sad': s.headPitch = 0.55; s.lean = 0.14; s.aL = A(0.05, 0.05, 0.1); s.aR = A(0.05, 0.05, 0.1); s.y = -0.03; break;
    case 'angry': s.lean = 0.12; s.headPitch = 0.1; s.aL = A(0.3, 0.3, 1.5); s.aR = A(0.3, 0.3, 1.5); s.twist = Math.sin(t * 9) * 0.05; break;
    case 'swing': { const w = smooth(p / 0.45), r = smooth((p - 0.45) / 0.2); s.aR = A(2.5 * w - 2.3 * r, 0.3, 0.6 * (1 - r)); s.aL = A(0.6, 0.4, 0.6); s.twist = 0.5 * w - 0.9 * r; s.lean = 0.2 * r; s.lR = A(-0.2, 0.1, 0.2); s.lL = A(0.3, 0.1, 0.3); break; }
    case 'jump': { const j = Math.sin(clamp(p, 0, 1) * Math.PI); s.y = 0.55 * j; s.aL = A(2.4 * j, 0.5, 0.3); s.aR = A(2.4 * j, 0.5, 0.3); s.lL = A(0.4 * j, 0.1, 0.9 * j); s.lR = A(0.4 * j, 0.1, 0.9 * j); break; }
    case 'pickup': { const k = Math.sin(clamp(p, 0, 1) * Math.PI); s.lean = 1.1 * k; s.y = -0.2 * k; s.lL = A(0.5 * k, 0.1, 0.8 * k); s.lR = A(0.5 * k, 0.1, 0.8 * k); s.aL = A(1.4 * k, 0.1, 0.2); s.aR = A(1.4 * k, 0.1, 0.2); break; }
    case 'eat': { const b = 0.5 + 0.5 * Math.sin(t * 4); s.aR = A(0.9 + 0.9 * b, 0.1, 1.0 + 1.0 * b); s.aL = A(0.05, 0.1, 0.1); s.headPitch = 0.1 * b; s.lean = 0.05; break; }
    case 'clap': { const b = 0.5 + 0.5 * Math.sin(t * 9); s.aL = A(1.3, 0.35 - 0.3 * b, 0.9); s.aR = A(1.3, 0.35 - 0.3 * b, 0.9); s.y = 0.0; break; }
    default: return poseFor('idle', t, p, o);
  }
  return s;
}

/** لو الشخصية بتتحرك وحركتها مش من حركات المشي: بنأخد الرجلين من المشي ونحتفظ بالدراعات */
export function mergeMoving(pose, t, speed = 'walk') {
  const base = poseFor(speed, t, 0);
  return { ...pose, lL: base.lL, lR: base.lR, y: pose.y + base.y * 0.7 };
}
