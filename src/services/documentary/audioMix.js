// ── audioMix.js ── خلط الصوت: سرد + موسيقى (بتهدّى تحت الكلام بـsidechain) + مؤثرات، مع ضبط علو الصوت
import { ffmpeg } from './ff.js';

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
  const byType = {};
  sfxEvents.forEach(e => { if (sfxFiles[e.type] && e.t < duration - 0.1) (byType[e.type] ||= []).push(e); });
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
  await ffmpeg([...inputs, '-filter_complex', parts.join(';'), '-map', '[mix]', '-c:a', 'aac', '-b:a', '192k', outFile]);
  return outFile;
}
