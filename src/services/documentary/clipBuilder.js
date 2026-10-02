// ── clipBuilder.js ───────────────────────────────────────────────────────────
// بيبني مقطع فيديو واحد (لقطة/beat) بمدة محددة: قاعدة (لقطة فيديو | صورة بحركة Ken Burns | خلفية ستايل)
// + تدرّج لوني + طبقات قوالب موشن جرافيك (قوالب SVG متحركة) + دخول (cut/dip/flash). بدون صوت — الصوت
// بيتركّب على الفيديو الكامل في آخر مرحلة. كل المقاطع بنفس إعدادات التشفير عشان تتدمج بـconcat من غير إعادة تشفير.
import path from 'path';
import { ffmpeg } from './ff.js';
import { renderOverlay, FPS } from './overlayRenderer.js';
import { gradeFilter, getTheme } from './themes.js';

export const ENCODE_ARGS = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-an', '-movflags', '+faststart'];

// تعبير الزوم لـzoompan: انجراف أساسي + "punch" (نبضة زوم سريعة على كلمة مهمة)
function zoomExpr({ motion = 'in', amount = 0.14, dur, punches = [] }) {
  const total = Math.max(1, Math.round(dur * FPS));
  const rate = amount / total;
  let base;
  if (motion === 'out') base = `${(1 + amount).toFixed(4)}-${rate.toFixed(6)}*on`;
  else if (motion === 'still' || motion === 'pan_left' || motion === 'pan_right') base = `${(1 + (motion === 'still' ? 0 : amount)).toFixed(4)}`;
  else base = `1+${rate.toFixed(6)}*on`;
  const bumps = punches.map(t => `0.07*max(0,1-abs(on/${FPS}-${Number(t).toFixed(3)})/0.22)`).join('+');
  return bumps ? `${base}+${bumps}` : base;
}

function panExprX(motion, amount, dur) {
  const total = Math.max(1, Math.round(dur * FPS));
  if (motion === 'pan_left') return `(iw-iw/zoom)*(1-on/${total})`;
  if (motion === 'pan_right') return `(iw-iw/zoom)*(on/${total})`;
  return 'iw/2-(iw/zoom/2)';
}

/**
 * @param beat { dur, visual:{kind:'video'|'image'|'background', file, grade, motion, startOffset, punches}, overlays:[{template,data,at,dur}], transitionIn }
 * @returns مسار mp4 للمقطع
 */
export async function buildBeatClip({ beat, w, h, theme, bgPath, lang = 'en', rtl = false, workDir, index = 0 }) {
  const dur = Math.max(0.4, Number(beat.dur) || 3);
  const v = beat.visual || { kind: 'background' };
  const out = path.join(workDir, `clip_${String(index).padStart(4, '0')}.mp4`);
  const th = typeof theme === 'string' ? getTheme(theme) : theme;
  const grade = gradeFilter(v.grade || (v.kind === 'background' ? null : null));
  const motion = v.motion || (v.kind === 'video' ? 'push' : 'in');
  const punches = v.punches || [];

  const inputs = [];
  const filters = [];
  let label;

  if (v.kind === 'video') {
    if (v.startOffset > 0) inputs.push('-ss', String(v.startOffset));
    inputs.push('-stream_loop', '-1', '-i', v.file);
    // لقطة فيديو: قص لنفس الأبعاد + حركة بسيطة اختيارية + تدرّج
    let f = `[0:v]fps=${FPS},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
    if (motion === 'push' || punches.length) {
      f += `,scale=${Math.round(w * 1.5)}:${Math.round(h * 1.5)},zoompan=z='${zoomExpr({ motion: motion === 'push' ? 'in' : 'still', amount: 0.06, dur, punches })}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${w}x${h}:fps=${FPS}`;
    }
    filters.push(f + (grade ? `,${grade}` : '') + '[base]');
  } else {
    // صورة (أو خلفية ستايل): إطار واحد → مركّب (مع خلفية مغبّشة لو النسبة مختلفة) → zoompan بحركة Ken Burns
    const file = v.kind === 'background' ? bgPath : v.file;
    inputs.push('-i', file);
    const fit = v.kind === 'background' ? 'cover' : (v.fit || 'auto');
    const W2 = Math.round(w * 1.5), H2 = Math.round(h * 1.5);
    let comp;
    if (fit === 'cover') {
      comp = `[0:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},setsar=1`;
    } else {
      // blur-fill: خلفية مغبّشة + الصورة كاملة في النص (لو نسبتها قريبة من نسبة الفيديو بتملا الإطار)
      comp = `[0:v]split[a][b];[a]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},boxblur=40:6,eq=brightness=-0.18:saturation=0.9[bgb];[b]scale=${W2}:${H2}:force_original_aspect_ratio=decrease[fg];[bgb][fg]overlay=(W-w)/2:(H-h)/2,setsar=1`;
    }
    const amount = v.kind === 'background' ? 0.05 : (v.amount || 0.16);
    const m = v.kind === 'background' ? 'in' : motion;
    const total = Math.max(1, Math.round(dur * FPS));
    filters.push(`${comp},zoompan=z='${zoomExpr({ motion: m, amount, dur, punches })}':x='${panExprX(m, amount, dur)}':y='ih/2-(ih/zoom/2)':d=${total}:s=${w}x${h}:fps=${FPS}${grade ? `,${grade}` : ''}[base]`);
  }

  // تعتيم خفيف تحت النصوص الكبيرة لما القاعدة لقطة/صورة حقيقية (القراءة أولوية)
  const TEXT_HEAVY = new Set(['quote', 'kinetic_text', 'title_card', 'counter', 'bullet_panel', 'evidence_board', 'bar_chart', 'donut_chart', 'timeline', 'route_diagram']);
  const needsDim = v.kind !== 'background' && (beat.dim ?? (beat.overlays || []).some(o => TEXT_HEAVY.has(o.template)));
  if (needsDim) {
    const last = filters.pop();
    filters.push(last.replace(/\[base\]$/, ',eq=brightness=-0.24:contrast=0.96[base]'));
  }

  // طبقات الموشن جرافيك
  let cur = 'base';
  const overlays = beat.overlays || [];
  let inputIndex = 1;
  for (let i = 0; i < overlays.length; i++) {
    const ov = overlays[i];
    const odur = Math.min(ov.dur || dur - (ov.at || 0), dur - (ov.at || 0));
    if (odur < 0.5) continue;
    const at = Math.max(0, ov.at || 0);
    const r = await renderOverlay({ template: ov.template, data: ov.data, dur: odur, w, h, theme: th, themeName: theme, lang, rtl, dir: path.join(workDir, `ov_${index}_${i}`) });
    const iIn = inputIndex++, iHold = inputIndex++, iOut = inputIndex++;
    inputs.push('-itsoffset', at.toFixed(3), '-framerate', String(FPS), '-start_number', '0', '-i', r.inPattern);
    inputs.push('-itsoffset', (at + r.tHold).toFixed(3), '-loop', '1', '-framerate', String(FPS), '-t', (r.tOut - r.tHold + 0.04).toFixed(3), '-i', r.holdFile);
    inputs.push('-itsoffset', (at + r.tOut).toFixed(3), '-framerate', String(FPS), '-start_number', '0', '-i', r.outPattern);
    const a = `ov${i}a`, b = `ov${i}b`, c = `ov${i}c`;
    filters.push(`[${cur}][${iIn}:v]overlay=format=auto:eof_action=pass[${a}]`);
    filters.push(`[${a}][${iHold}:v]overlay=format=auto:eof_action=pass[${b}]`);
    filters.push(`[${b}][${iOut}:v]overlay=format=auto:eof_action=pass[${c}]`);
    cur = c;
  }

  // دخول المقطع
  let tail = `[${cur}]`;
  const tin = beat.transitionIn || 'cut';
  let post = '';
  if (tin === 'dip') post = 'fade=t=in:st=0:d=0.22';
  else if (tin === 'flash') post = 'fade=t=in:st=0:d=0.14:color=white';
  filters.push(`${tail}${post ? post + ',' : ''}format=yuv420p[vout]`);

  await ffmpeg([...inputs, '-filter_complex', filters.join(';'), '-map', '[vout]', '-t', dur.toFixed(3), '-r', String(FPS), ...ENCODE_ARGS, out]);
  return out;
}
