// ── audioMix.js ── خلط الصوت: سرد + موسيقى (بتهدّى تحت الكلام بـsidechain) + مؤثرات، مع ضبط علو الصوت
import fs from 'fs';
import path from 'path';
import { ffmpegGraph, rmQuiet } from './ff.js';

// الأفلام الطويلة (30 دقيقة ≈ 300+ مشهد = مئات المؤثرات): خلط كل المؤثرات في graph واحد كان بيكسر حد لينكس (spawn E2BIG)
// وبطيء جدًا (amix بمئات المداخل). بنبني "تراك مؤثرات" على دفعات صغيرة، وبعدين بيدخل الخلط النهائي كمدخل واحد
const SFX_BATCH = 48;
async function buildSfxBed({ events, sfxFiles, duration, outFile }) {
  const dir = outFile + '.parts'; fs.mkdirSync(dir, { recursive: true });
  try {
    const parts = [];
    for (let b = 0; b < events.length; b += SFX_BATCH) {
      const batch = events.slice(b, b + SFX_BATCH);
      const t0 = Math.max(0, Math.min(...batch.map(e => e.t)) - 0.05);
      const types = [...new Set(batch.map(e => e.type))];
      const inputs = [];
      types.forEach(t => inputs.push('-i', sfxFiles[t]));
      const g = [], labels = [];
      types.forEach((t, si) => {
        const evs = batch.filter(e => e.type === t);
        const outs = evs.map((_, k) => `s${si}_${k}`);
        g.push(evs.length === 1 ? `[${si}:a]anull[${outs[0]}]` : `[${si}:a]asplit=${evs.length}${outs.map(o => `[${o}]`).join('')}`);
        evs.forEach((e, k) => {
          const ms = Math.max(0, Math.round((e.t - t0) * 1000));
          g.push(`[${outs[k]}]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms},volume=${(e.vol ?? 0.5).toFixed(2)}[f${si}_${k}]`);
          labels.push(`f${si}_${k}`);
        });
      });
      // كل دفعة ملف قصير (من أول مؤثر فيها لآخره) وبيتحط في مكانه في الخلط النهائي — مش ملف بطول الفيلم كله
      g.push(`${labels.map(l => `[${l}]`).join('')}amix=inputs=${labels.length}:duration=longest:normalize=0[o]`);
      const part = path.join(dir, `p${parts.length}.wav`);
      await ffmpegGraph(inputs, g.join(';'), ['-map', '[o]', '-ar', '44100', '-ac', '2', part]);
      parts.push({ file: part, t0 });
    }
    const ins = parts.flatMap(p => ['-i', p.file]);
    const g = parts.map((p, i) => { const ms = Math.round(p.t0 * 1000); return `[${i}:a]adelay=${ms}|${ms}[d${i}]`; });
    g.push(`${parts.map((_, i) => `[d${i}]`).join('')}amix=inputs=${parts.length}:duration=longest:normalize=0,apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)}[o]`);
    await ffmpegGraph(ins, g.join(';'), ['-map', '[o]', '-ar', '44100', '-ac', '2', outFile]);
    return outFile;
  } finally { rmQuiet(dir); }
}

export async function mixAudio({ narrationFile, musicFile = null, musicVolume = 0.15, sfxEvents = [], sfxFiles = {}, duration, outFile }) {
  const inputs = ['-i', narrationFile];
  const parts = [];
  let idx = 1;
  const labels = ['narr'];
  parts.push(`[0:a]aformat=sample_rates=44100:channel_layouts=stereo,apad=whole_dur=${duration.toFixed(3)},atrim=0:${duration.toFixed(3)},asplit=2[narr][narrsc]`);
  if (musicFile) {
    inputs.push('-stream_loop', '-1', '-i', musicFile);
    const mi = idx++;
    const fo = Math.max(0, duration - 3);
    parts.push(`[${mi}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${duration.toFixed(3)},asetpts=PTS-STARTPTS,volume=${musicVolume},afade=t=in:d=2,afade=t=out:st=${fo.toFixed(3)}:d=3[mus]`);
    parts.push('[mus][narrsc]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=700:makeup=1[duck]');
    labels.push('duck');
  } else {
    parts[0] = parts[0].replace('asplit=2[narr][narrsc]', 'anull[narr]');
  }
  // مؤثرات: كل ملف بيتحمّل مرة وبيتوزّع بـasplit على عدد استخداماته
  const valid = sfxEvents.filter(e => sfxFiles[e.type] && e.t < duration - 0.1).sort((a, b) => a.t - b.t);
  let bed = null;
  if (valid.length > SFX_BATCH) {
    bed = await buildSfxBed({ events: valid, sfxFiles, duration, outFile: outFile + '.sfx.wav' });
    inputs.push('-i', bed);
    labels.push(`${idx++}:a`);
  }
  const byType = {};
  if (!bed) valid.forEach(e => { (byType[e.type] ||= []).push(e); });
  for (const [type, evs] of Object.entries(byType)) {
    inputs.push('-i', sfxFiles[type]);
    const si = idx++;
    const n = evs.length;
    const outs = evs.map((_, k) => `s${si}_${k}`);
    parts.push(n === 1 ? `[${si}:a]anull[${outs[0]}]` : `[${si}:a]asplit=${n}${outs.map(o => `[${o}]`).join('')}`);
    evs.forEach((e, k) => {
      const ms = Math.max(0, Math.round(e.t * 1000));
      parts.push(`[${outs[k]}]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${ms}|${ms},volume=${(e.vol ?? 0.5).toFixed(2)}[sf${si}_${k}]`);
      labels.push(`sf${si}_${k}`);
    });
  }
  parts.push(`${labels.map(l => `[${l}]`).join('')}amix=inputs=${labels.length}:duration=longest:normalize=0,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:${duration.toFixed(3)}[mix]`);
  try {
    await ffmpegGraph(inputs, parts.join(';'), ['-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', outFile]);
  } finally { if (bed) rmQuiet(bed); }
  return outFile;
}
