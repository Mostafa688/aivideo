// ── sfx.js ── مؤثرات صوتية متولّدة محليًا بـffmpeg (مفيش ملفات خارجية = مفيش مشاكل ترخيص)
import fs from 'fs';
import path from 'path';
import { ffmpeg } from './ff.js';

const SPECS = {
  whoosh: ['anoisesrc=d=0.9:c=pink:r=44100', 'highpass=f=250,lowpass=f=5200,afade=t=in:d=0.4,afade=t=out:st=0.4:d=0.5,volume=0.7'],
  impact: ["aevalsrc='0.95*sin(2*PI*(46+44*exp(-9*t))*t)*exp(-4.2*t)':d=1.4:s=44100", 'lowpass=f=900,volume=1.0'],
  tick: ["aevalsrc='0.55*sin(2*PI*1900*t)*exp(-70*t)':d=0.12:s=44100", 'volume=0.8'],
  pop: ["aevalsrc='0.6*sin(2*PI*(520+1100*t)*t)*exp(-24*t)':d=0.2:s=44100", 'volume=0.8'],
  swish: ['anoisesrc=d=0.5:c=white:r=44100', 'highpass=f=1400,lowpass=f=9000,afade=t=in:d=0.16,afade=t=out:st=0.16:d=0.34,volume=0.55'],
  boom: ["aevalsrc='0.95*sin(2*PI*(36+64*exp(-7*t))*t)*exp(-3.2*t)+0.2*(random(0)-0.5)*exp(-10*t)':d=1.6:s=44100", 'lowpass=f=1100,volume=1.0'],
  glitch: ["aevalsrc='0.45*sin(2*PI*(700+2800*random(0))*t)*between(mod(t,0.07),0,0.035)*exp(-7*t)':d=0.32:s=44100", 'volume=0.8'],
  click: ["aevalsrc='0.5*sin(2*PI*3300*t)*exp(-110*t)':d=0.08:s=44100", 'volume=0.8'],
  riser: ['anoisesrc=d=1.8:c=white:r=44100', 'highpass=f=700,lowpass=f=7000,afade=t=in:d=1.7,afade=t=out:st=1.7:d=0.1,volume=0.5'],
};
export const SFX_TYPES = Object.keys(SPECS);

export async function ensureSfx(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const out = {};
  for (const [name, [src, af]] of Object.entries(SPECS)) {
    const file = path.join(dir, `${name}.wav`);
    if (!fs.existsSync(file)) await ffmpeg(['-f', 'lavfi', '-i', src, '-af', af, '-ar', '44100', '-ac', '2', file]);
    out[name] = file;
  }
  return out;
}

// أحداث المؤثرات لكل لقطة (t0 = زمن بداية اللقطة في الفيديو الكامل)
export function sfxForBeat(beat, t0) {
  const ev = [];
  const tin = beat.transitionIn || 'cut';
  if (tin === 'flash') ev.push({ t: Math.max(0, t0 - 0.06), type: 'whoosh', vol: 0.5 });
  if (beat.hook) { // الـhook: ضربة في أول لقطة + وشّة خفيفة عند كل قطعة سريعة
    if (t0 < 0.05) ev.push({ t: 0.04, type: 'impact', vol: 0.6 });
    else ev.push({ t: Math.max(0, t0 - 0.05), type: 'whoosh', vol: 0.32 });
  }
  for (const ov of beat.overlays || []) {
    const at = t0 + (ov.at || 0);
    switch (ov.template) {
      case 'title_card': ev.push({ t: at + 0.05, type: 'impact', vol: 0.55 }); break;
      case 'lower_third': ev.push({ t: at + 0.05, type: 'whoosh', vol: 0.35 }); break;
      case 'counter': ev.push({ t: at + 0.1, type: 'riser', vol: 0.4 }); break;
      case 'bullet_panel': case 'evidence_board':
        ev.push({ t: at + 0.05, type: 'whoosh', vol: 0.3 });
        (ov.data?.bullets || []).slice(0, 6).forEach((_, i) => ev.push({ t: at + 0.6 + i * 0.5, type: 'pop', vol: 0.4 }));
        break;
      case 'kinetic_text': {
        const n = String(ov.data?.text || '').split(/\s+/).filter(Boolean).length;
        for (let i = 0; i < Math.min(n, 12); i++) ev.push({ t: at + 0.15 + i * 0.22, type: 'tick', vol: 0.35 });
        break;
      }
      case 'icon_pop':
        (ov.data?.items || []).slice(0, 4).forEach((_, i) => ev.push({ t: at + 0.3 + i * 0.55, type: 'pop', vol: 0.45 }));
        ev.push({ t: at + 0.1, type: 'swish', vol: 0.3 });
        break;
      case 'date_card': ev.push({ t: at + 0.1, type: 'riser', vol: 0.35 }); ev.push({ t: at + 1.45, type: 'impact', vol: 0.5 }); break;
      case 'vs_card': ev.push({ t: at + 0.05, type: 'swish', vol: 0.45 }); ev.push({ t: at + 0.65, type: 'boom', vol: 0.55 }); break;
      case 'stamp': ev.push({ t: at + 0.3, type: 'boom', vol: 0.7 }); ev.push({ t: at + 0.3, type: 'click', vol: 0.4 }); break;
      case 'percent_ring': ev.push({ t: at + 0.15, type: 'riser', vol: 0.35 }); ev.push({ t: at + 1.7, type: 'pop', vol: 0.45 }); break;
      case 'bottom_sheet':
        ev.push({ t: at + 0.05, type: 'swish', vol: 0.4 });
        (ov.data?.items || []).slice(0, 4).forEach((_, i) => ev.push({ t: at + 0.55 + i * 0.5, type: 'pop', vol: 0.4 }));
        break;
      case 'side_note': ev.push({ t: at + 0.05, type: 'swish', vol: 0.35 }); break;
      case 'news_bar': ev.push({ t: at + 0.05, type: 'swish', vol: 0.35 }); ev.push({ t: at + 0.5, type: 'click', vol: 0.3 }); break;
      case 'wipe_bars': ev.push({ t: at, type: 'swish', vol: 0.5 }); break;
      case 'corner_frame': ev.push({ t: at + 0.05, type: 'click', vol: 0.35 }); break;
      case 'photo_board':
        (ov.data?.photos || []).slice(0, 4).forEach((_, i) => ev.push({ t: at + 0.4 + i * 0.5, type: 'pop', vol: 0.45 }));
        ev.push({ t: at + 0.1, type: 'whoosh', vol: 0.25 });
        break;
      case 'map_reveal':
        ev.push({ t: at + 0.2, type: 'whoosh', vol: 0.3 });
        (ov.data?.places || []).slice(0, 4).forEach((_, i) => ev.push({ t: at + 1.5 + i * 0.6, type: 'pop', vol: 0.4 }));
        break;
      case 'timeline': case 'route_diagram':
        (ov.data?.events || ov.data?.nodes || []).slice(0, 6).forEach((_, i) => ev.push({ t: at + 0.55 + i * 0.5, type: 'pop', vol: 0.4 }));
        break;
      default: ev.push({ t: at + 0.05, type: 'whoosh', vol: 0.3 });
    }
  }
  return ev;
}
