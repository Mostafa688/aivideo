// ── adix/compose.js ── المونتاج النهائي لإعلان Adix من خطة التعديل (EDL) اللي Opus بيكتبها بعد ما يشوف الفيديو:
// 1) cuts: قص الأجزاء الضعيفة من الفيديو الأساسي (الصوت والصورة مع بعض)
// 2) inserts: لقطات إضافية (فيديو أو صورة بحركة كاميرا) بتغطي الصورة في وقت معيّن والصوت الأصلي مكمّل تحتها
// 3) punches: زووم مفاجئ (punch-in) على جزء من الكادر للتأكيد
// 4) overlays: موشن جرافيك (motionKit) في وقته بالظبط + مؤثرات صوتية متزامنة مع كل حركة
// 5) endCard: شاشة نهاية بالمنتج والبراند وزرار الطلب + موسيقى خفيفة اختيارية
// كل الأوقات في الـEDL بتتكتب على زمن الفيديو الأساسي (اللي Opus شافه)، وإحنا بنحوّلها بعد القص.
import fs from 'fs';
import path from 'path';
import { ffmpeg, ffmpegGraph, probeDuration, hasAudio, rmQuiet } from '../documentary/ff.js';
import { ensureCvSfx } from '../codeVideo/sound.js';
import { renderOverlay, renderEndCard, OVERLAY_TYPES } from './motionKit.js';

const FPS = 30;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const even = (x) => Math.max(2, Math.round(x / 2) * 2);
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS)];

/** تنضيف خطة التعديل اللي راجعة من الموديل (أرقام، حدود، أنواع) — أي حاجة مش مفهومة بتتشال */
export function sanitizeEdl(edl, { duration, insertFiles = {} } = {}) {
  const D = num(duration, 0); const e = edl && typeof edl === 'object' ? edl : {};
  const span = (x, minLen = 0.3) => {
    const s = clamp(num(x.start, -1), 0, D); const en = clamp(num(x.end, -1), 0, D);
    return en - s >= minLen ? { start: +s.toFixed(2), end: +en.toFixed(2) } : null;
  };
  const cuts = (Array.isArray(e.cuts) ? e.cuts : []).map((c) => span(c, 0.2)).filter(Boolean).slice(0, 6);
  const inserts = (Array.isArray(e.inserts) ? e.inserts : []).map((x) => {
    const sp = span(x, 0.6); if (!sp) return null;
    const file = insertFiles[x.id] || x.file; if (!file || !fs.existsSync(file)) return null;
    return { ...sp, end: Math.min(sp.end, sp.start + 6), id: x.id, file, kind: /\.(png|jpe?g|webp)$/i.test(file) ? 'image' : 'video', motion: ['in', 'out', 'left', 'right'].includes(x.motion) ? x.motion : 'in' };
  }).filter(Boolean).slice(0, 6);
  const punches = (Array.isArray(e.punches) ? e.punches : []).map((x) => {
    const sp = span(x, 0.4); if (!sp) return null;
    return { ...sp, end: Math.min(sp.end, sp.start + 3), zoom: clamp(num(x.zoom, 1.18), 1.06, 1.6), fx: clamp(num(x.x, 0.5), 0, 1), fy: clamp(num(x.y, 0.45), 0, 1) };
  }).filter(Boolean).slice(0, 10);
  const overlays = (Array.isArray(e.overlays) ? e.overlays : []).map((o) => {
    if (!OVERLAY_TYPES.includes(o?.type)) return null;
    const sp = span(o, o.type === 'flash' ? 0.1 : 0.8); if (!sp) return null;
    const clean = { ...o, ...sp };
    for (const k of ['text', 'sub', 'highlight']) if (clean[k] != null) clean[k] = String(clean[k]).slice(0, 90);
    if (Array.isArray(clean.items)) clean.items = clean.items.map((s) => String(s).slice(0, 40)).slice(0, 4);
    return clean;
  }).filter(Boolean).slice(0, 14);
  const ec = e.endCard && typeof e.endCard === 'object' ? e.endCard : null;
  const endCard = ec && (ec.brand || ec.cta) ? {
    brand: String(ec.brand || '').slice(0, 30), tagline: String(ec.tagline || '').slice(0, 60), cta: String(ec.cta || '').slice(0, 28),
    price: String(ec.price || '').slice(0, 24), seconds: clamp(num(ec.seconds, 2.6), 1.8, 4),
  } : null;
  return { cuts, inserts, punches, overlays, endCard, captions: !!e.captions, music: e.music === false ? false : (e.music || 'auto') };
}

// الأجزاء اللي فاضلة بعد القص + دالة تحويل الوقت من الفيديو الأصلي للفيديو بعد القص
function keepRanges(D, cuts) {
  const cs = [...cuts].sort((a, b) => a.start - b.start); const keeps = []; let t = 0;
  for (const c of cs) { if (c.start > t + 0.05) keeps.push([t, c.start]); t = Math.max(t, c.end); }
  if (D > t + 0.05) keeps.push([t, D]);
  const map = (x) => { let acc = 0; for (const [a, b] of keeps) { if (x < a) return null; if (x <= b) return acc + (x - a); acc += b - a; } return null; };
  const total = keeps.reduce((s, [a, b]) => s + (b - a), 0);
  return { keeps, map, total };
}

// مؤثرات صوت لكل عنصر موشن (t نسبةً لبداية العنصر)
function overlaySfx(o) {
  const ev = (t, type, vol) => ({ t, type, vol });
  switch (o.type) {
    case 'headline': return [ev(0, 'whoosh_s', 0.45), ev(0.35, 'hit', 0.3)];
    case 'callout': return [ev(0, 'pop', 0.5), ev(0.15, 'whoosh_s', 0.3)];
    case 'badge': return [ev(0.02, 'slam', 0.55), ev(0.3, 'shimmer', 0.35)];
    case 'lowerThird': return [ev(0, 'whoosh_s', 0.4)];
    case 'stat': return [ev(0.05, 'riser_l', 0.35), ev(Math.min(1.1, (o.end - o.start) * 0.5), 'ding', 0.45)];
    case 'checklist': { const n = (o.items || []).length || 3; const st = Math.min(0.45, (o.end - o.start - 1) / Math.max(1, n)); return Array.from({ length: n }, (_, i) => ev(0.25 + i * st, 'pop', 0.5)); }
    case 'flash': return [ev(0, 'impact_big', 0.5)];
    default: return [];
  }
}

/**
 * يركّب الإعلان النهائي.
 * baseVideo: الفيديو المولّد · edl: بعد sanitizeEdl · words: كلمات الكلام بتوقيت الفيديو الأصلي (للترجمة)
 * productPng: المنتج مقصوص (لشاشة النهاية) · musicFile: اختياري
 */
export async function composeAd({ baseVideo, workDir, edl, W, H, accent = '#ff3d6e', words = [], productPng = null, musicFile = null, onStage = () => {} }) {
  fs.mkdirSync(workDir, { recursive: true });
  const D0 = await probeDuration(baseVideo); const withAudio = await hasAudio(baseVideo).catch(() => false);
  const { keeps, map, total: D } = keepRanges(D0, edl.cuts || []);
  const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p`;

  // ── 1) القص + توحيد المقاس ──
  onStage('cut');
  const cutFile = path.join(workDir, 'cut.mp4');
  {
    const g = []; const segs = [];
    keeps.forEach(([a, b], i) => {
      g.push(`[0:v]trim=${a.toFixed(3)}:${b.toFixed(3)},setpts=PTS-STARTPTS,${norm}[v${i}]`);
      g.push(withAudio ? `[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=stereo[a${i}]` : `anullsrc=r=44100:cl=stereo,atrim=0:${(b - a).toFixed(3)}[a${i}]`);
      segs.push(`[v${i}][a${i}]`);
    });
    g.push(`${segs.join('')}concat=n=${keeps.length}:v=1:a=1[v][a]`);
    await ffmpegGraph(['-i', baseVideo], g.join(';'), ['-map', '[v]', '-map', '[a]', ...ENC, '-c:a', 'aac', '-b:a', '192k', cutFile], { timeoutMs: 10 * 60 * 1000 });
  }

  // نحوّل كل الأوقات لزمن الفيديو بعد القص (واللي وقع جوه جزء مقصوص بيتشال)
  const remap = (x) => { const s = map(x.start); const e = map(x.end); if (s == null) return null; const end = e == null ? Math.min(D, s + (x.end - x.start)) : e; return end - s >= 0.2 ? { ...x, start: s, end } : null; };
  const inserts = (edl.inserts || []).map(remap).filter(Boolean).sort((a, b) => a.start - b.start);
  const punches = (edl.punches || []).map(remap).filter(Boolean).sort((a, b) => a.start - b.start);
  const overlays = (edl.overlays || []).map(remap).filter(Boolean);
  const mappedWords = words.map((w) => { const s = map(w.start); const e = map(w.end); return s == null || e == null ? null : { w: w.w, start: s, end: e }; }).filter(Boolean);
  if (edl.captions && mappedWords.length && !overlays.some((o) => o.type === 'captions')) overlays.push({ type: 'captions', start: 0, end: D });

  // ── 2) خط الصورة: أجزاء متتالية (أصلي / punch / لقطة إضافية) من غير تداخل — اللقطات الإضافية لها الأولوية ──
  const marks = [];
  for (const x of inserts) marks.push({ ...x, kind: 'insert' });
  for (const p of punches) if (!inserts.some((x) => p.start < x.end && p.end > x.start)) marks.push({ ...p, kind: 'punch' });
  marks.sort((a, b) => a.start - b.start);
  const timeline = []; let t = 0;
  for (const m of marks) {
    if (m.start < t + 0.05) continue;
    timeline.push({ kind: 'base', start: t, end: m.start });
    timeline.push(m); t = m.end;
  }
  if (D > t + 0.03) timeline.push({ kind: 'base', start: t, end: D });

  onStage('motion');
  const inputs = ['-i', cutFile]; let idx = 1; const g = [];
  const vSegs = [];
  const baseUses = timeline.filter((s) => s.kind !== 'insert').length;
  g.push(`[0:v]split=${Math.max(1, baseUses)}${Array.from({ length: Math.max(1, baseUses) }, (_, i) => `[b${i}]`).join('')}`);
  let bi = 0;
  timeline.forEach((s, i) => {
    const len = s.end - s.start; const lbl = `s${i}`;
    if (s.kind === 'base') g.push(`[b${bi++}]trim=${s.start.toFixed(3)}:${s.end.toFixed(3)},setpts=PTS-STARTPTS[${lbl}]`);
    else if (s.kind === 'punch') {
      const zw = even(W * s.zoom), zh = even(H * s.zoom);
      g.push(`[b${bi++}]trim=${s.start.toFixed(3)}:${s.end.toFixed(3)},setpts=PTS-STARTPTS,scale=${zw}:${zh},crop=${W}:${H}:${Math.round((zw - W) * s.fx)}:${Math.round((zh - H) * s.fy)},setsar=1[${lbl}]`);
    } else {
      const k = idx++;
      if (/\.(png|jpe?g|webp)$/i.test(s.file)) {
        inputs.push('-loop', '1', '-framerate', String(FPS), '-t', (len + 0.1).toFixed(3), '-i', s.file);
        const n = Math.max(1, Math.round(len * FPS)); const z = `1+0.14*on/${n}`; const zo = `1.14-0.14*on/${n}`;
        const zexpr = s.motion === 'out' ? zo : s.motion === 'left' || s.motion === 'right' ? '1.12' : z;
        const xexpr = s.motion === 'left' ? `(iw-iw/zoom)*(1-on/${n})` : s.motion === 'right' ? `(iw-iw/zoom)*on/${n}` : 'iw/2-(iw/zoom/2)';
        g.push(`[${k}:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${zexpr}':x='${xexpr}':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},trim=0:${len.toFixed(3)},setpts=PTS-STARTPTS,setsar=1,format=yuv420p[${lbl}]`);
      } else {
        inputs.push('-i', s.file);
        g.push(`[${k}:v]${norm},tpad=stop_mode=clone:stop_duration=${len.toFixed(3)},trim=0:${len.toFixed(3)},setpts=PTS-STARTPTS[${lbl}]`);
      }
    }
    vSegs.push(`[${lbl}]`);
  });
  g.push(`${vSegs.join('')}concat=n=${vSegs.length}:v=1:a=0,format=yuv420p[vm0]`);

  // ── 3) الموشن جرافيك ──
  let cur = 'vm0'; const sfx = [];
  const busy = overlays.filter((o) => o.type === 'lowerThird' || (['checklist', 'stat', 'callout'].includes(o.type) && o.position === 'bottom')).map((o) => [o.start, o.end]);
  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i];
    const r = await renderOverlay(o, { W, H, accent, dir: path.join(workDir, `ov${i}`), ctx: { words: mappedWords, busy } }).catch((e) => { console.warn('[Adix] overlay failed:', o.type, e.message); return null; });
    if (!r) continue;
    const k = idx++;
    inputs.push('-itsoffset', o.start.toFixed(3), '-framerate', String(FPS), '-start_number', '0', '-i', r.pattern);
    g.push(`[${cur}][${k}:v]overlay=format=auto:eof_action=pass[vo${i}]`); cur = `vo${i}`;
    if (o.sfx !== false) for (const e of overlaySfx(o)) sfx.push({ ...e, t: o.start + e.t });
  }
  for (const x of inserts) sfx.push({ t: Math.max(0, x.start - 0.12), type: 'whoosh_s', vol: 0.4 });
  for (const p of punches) sfx.push({ t: p.start, type: 'hit', vol: 0.3 });

  // ── 4) شاشة النهاية ──
  let endSec = 0;
  if (edl.endCard) {
    onStage('endcard');
    const bgFile = path.join(workDir, 'endbg.jpg');
    await ffmpeg(['-ss', Math.max(0, D - 0.4).toFixed(3), '-i', cutFile, '-frames:v', '1', '-q:v', '3', bgFile]);
    const ec = await renderEndCard(edl.endCard, { W, H, accent, bgFile, productPng, dir: path.join(workDir, 'end'), seconds: edl.endCard.seconds });
    endSec = ec.seconds; const k = idx++;
    inputs.push('-framerate', String(FPS), '-start_number', '0', '-i', ec.pattern);
    g.push(`[${k}:v]setsar=1,format=yuv420p[ve]`);
    g.push(`[${cur}][ve]concat=n=2:v=1:a=0,format=yuv420p[vfin]`); cur = 'vfin';
    sfx.push({ t: D - 0.05, type: 'whoosh_l', vol: 0.4 }, { t: D + 0.35, type: 'impact_big', vol: 0.5 }, { t: D + 0.85, type: 'shimmer', vol: 0.35 });
  }
  const total = D + endSec;

  // ── 5) الصوت: الأصلي + المؤثرات + موسيقى (خفيفة تحت الكلام) ──
  onStage('mix');
  const sfxFiles = await ensureCvSfx(path.join(workDir, 'sfx'));
  const aIn = []; const usable = sfx.filter((e) => sfxFiles[e.type] && e.t >= 0 && e.t < total - 0.1).sort((a, b) => a.t - b.t).slice(0, 40);
  g.push(`[0:a]apad=whole_dur=${total.toFixed(3)}[a0]`); aIn.push('[a0]');
  usable.forEach((e, i) => {
    const k = idx++; inputs.push('-i', sfxFiles[e.type]);
    const ms = Math.round(e.t * 1000);
    g.push(`[${k}:a]aresample=44100,aformat=channel_layouts=stereo,volume=${e.vol.toFixed(2)},adelay=${ms}|${ms}[x${i}]`); aIn.push(`[x${i}]`);
  });
  if (musicFile && fs.existsSync(musicFile)) {
    const k = idx++; inputs.push('-stream_loop', '-1', '-i', musicFile);
    // لو الإعلان فيه كلام، الموسيقى بتوطى تحته (sidechain) وبتعلى في شاشة النهاية
    g.push(`[${k}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${total.toFixed(3)},volume=${withAudio ? 0.22 : 0.55},afade=t=in:d=0.6,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(3)}:d=1.2[mus]`);
    if (withAudio) { g.push(`[a0]asplit=2[a0m][a0k]`); aIn[0] = '[a0m]'; g.push(`[mus][a0k]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=350[musd]`); aIn.push('[musd]'); }
    else aIn.push('[mus]');
  }
  g.push(`${aIn.join('')}amix=inputs=${aIn.length}:normalize=0:duration=first,alimiter=limit=0.95[aout]`);

  const out = path.join(workDir, 'final.mp4');
  await ffmpegGraph(inputs, g.join(';'), ['-map', `[${cur}]`, '-map', '[aout]', '-t', total.toFixed(3), ...ENC, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { timeoutMs: 20 * 60 * 1000 });
  for (let i = 0; i < overlays.length; i++) rmQuiet(path.join(workDir, `ov${i}`));
  rmQuiet(path.join(workDir, 'end'));
  return { file: out, duration: total, cutDuration: D, timeline: timeline.map((s) => ({ kind: s.kind, start: +s.start.toFixed(2), end: +s.end.toFixed(2) })) };
}
