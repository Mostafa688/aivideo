// ── editAnimation.js ── تعديل فيديو أنيميشن/فوكس جاهز ("غيّر المشهد ده"، "احذف الجزء ده"، "خلّي الألوان كذا") من غير ما يتعمل من الأول:
// بعد أي رندر بنحفظ "الوصفة" (المشاهد + الصور + التوقيت) والصوت والموسيقى؛ التعديل = مخطط (LLM) بيحوّل كلام العميل لعمليات
// على المشاهد → نطبّقها → رندر تاني بنفس الصوت (من غير صوت جديد ولا مخرج جديد) → أرخص وأسرع، والباقي زي ما هو بالظبط.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as store from '../documentary/store.js';
import { downloadTo } from '../documentary/editorStore.js';
import { ffmpeg, probeDuration } from '../documentary/ff.js';
import { llmJson } from '../documentary/llm.js';
import { sanitizeScene, buildSystem, trDuration, TRANSITIONS, LOOK_PALETTES, isCartoon } from './director.js';
import { pickPalette } from './design.js';
import { makeMeasurer } from './measure.js';
import { makeCastMap } from './cast.js';
import { renderCodeVideo, RATIO_SIZE } from './render.js';
import { resolveVoxImages } from './images.js';
import { findLogo } from './logos.js';
import { measureNonLatin } from './typeset.js';
import { designArt } from './art.js';
import { buildCaptionsAss } from '../documentary/captions.js';
import { getBackgroundMusicBuffer } from '../videoAudioService.js';
import { watermarkVideo } from '../watermark.js';
import { buildSrt } from '../documentary/uploadPackage.js';

export const ANIM_EDIT_RETENTION_DAYS = 30;
const MUSIC_MOODS = ['calm', 'chill', 'upbeat', 'epic', 'tension', 'happy', 'sad', 'inspiring'];

/** بعد أي رندر: حفظ "وصفة" الفيديو عشان يتعدّل بعد كده */
export async function persistAnimationBundle({ jobId, userId, story, castChars = [], narrationFile, musicFile = null, allTokens = [], input = {}, title = '', script = '', workDir }) {
  const dir = path.join(workDir, 'bundle'); fs.mkdirSync(dir, { recursive: true });
  const bundle = {
    v: 1, ratio: story.h > story.w ? '9:16' : '16:9', lang: story.lang, look: story.look, palette: story.palette?.name || null, title, script,
    duration: story.duration, scenes: story.scenes, castChars, host: story.cast?.host || null, images: story.images || {}, allTokens,
    captions: input.captions || null, watermark: !!input.watermark, music: !!musicFile, musicMood: input.musicMood || null,
  };
  const base = `documentaries/${userId}/${jobId}_anim`;
  const gz = path.join(dir, 'story.json.gz'); fs.writeFileSync(gz, zlib.gzipSync(JSON.stringify(bundle)));
  const nar = path.join(dir, 'narration.m4a'); await ffmpeg(['-i', narrationFile, '-c:a', 'aac', '-b:a', '128k', nar]);
  const [storyUrl, narrationUrl, musicUrl] = await Promise.all([
    store.uploadFile(gz, `${base}/story.json.gz`, 'application/gzip'),
    store.uploadFile(nar, `${base}/narration.m4a`, 'audio/mp4'),
    musicFile && fs.existsSync(musicFile) ? store.uploadFile(musicFile, `${base}/music.mp3`, 'audio/mpeg') : null,
  ]);
  return { version: 1, storyUrl, narrationUrl, musicUrl, duration: story.duration, look: story.look, scenes: story.scenes.length, expiresAt: Date.now() + ANIM_EDIT_RETENTION_DAYS * 86400e3 };
}

export const animEditorOf = (job) => { const e = job?.meta?.animEditor; return e && e.version === 1 && e.storyUrl && e.narrationUrl && (!e.expiresAt || e.expiresAt > Date.now()) ? e : null; };

// ── المخطط: كلام العميل → عمليات على المشاهد ──
const sceneSummary = (sc) => {
  const d = sc.data || {};
  const bits = ['title', 'subtitle', 'headline', 'hero', 'kicker', 'bar', 'tail', 'word', 'text', 'caption', 'brand', 'query', 'idea', 'label'].filter(k => typeof d[k] === 'string' && d[k]).map(k => `${k}="${String(d[k]).slice(0, 60)}"`);
  if (Array.isArray(d.items)) bits.push(`items=${d.items.length}`);
  if (d.layout) bits.push(`layout=${d.layout}`);
  return bits.join(' ');
};
function plannerSystem(look) {
  return `You EDIT an existing animated explainer video made by code. The customer watched it and asks for changes. You receive the current scenes (index, time range, the words spoken during it, its visual type and on-screen data). Turn the request into the SMALLEST set of operations — keep everything they did not mention exactly as it is.

Return ONLY JSON: {"ops":[...],"summary":"one short sentence in the customer's language saying what you changed","unsupported":"what you could NOT do, in the customer's language, or empty"}
Operations:
- {"op":"change","i":N,"type":"<scene type>","data":{...}} — replace the visual of scene N (same data schema as the scene catalog below). Use it for "غيّر المشهد/الصورة/الكلام اللي على الشاشة/خليه خريطة/حط لوجو/خلي النص أكبر وأوضح". On-screen words must come from that scene's narration or from the customer's own request.
- {"op":"delete","i":N} — remove scene N completely, INCLUDING its narration (only when they ask to delete/cut that part of the video).
- {"op":"palette","value":"<palette name>"} — colours (allowed: ${(LOOK_PALETTES[look] || []).join(', ')}).
- {"op":"music","value":"off|on|${MUSIC_MOODS.join('|')}"} — background music off, back on, or a different mood.
- {"op":"captions","value":"on|off"} — burned-in subtitles of the narration.
- {"op":"ratio","value":"16:9|9:16"} — change the format (the scenes re-layout automatically).
- {"op":"transition","i":N,"value":"${TRANSITIONS.join('|')}"} — transition INTO scene N.
Rules: identify scenes by what the customer describes (time "في الثانية 10", order "المشهد التالت/الأخير", or content "اللي فيه الخريطة"). Scene numbers the customer says are 1-based; "i" is 0-based. Never change the spoken narration text itself (only delete whole scenes) — if they want different spoken words, put that in "unsupported" (it needs a new voice-over). If nothing is clear, return {"ops":[],"summary":"","unsupported":"<a short question asking what exactly to change>"}.

Scene catalog (for "change"):
${buildSystem(look)}`;
}

export async function planAnimationEdit({ bundle, instruction }, deps = {}) {
  const lines = bundle.scenes.map((sc, i) => `[${i}] ${sc.start.toFixed(1)}-${sc.end.toFixed(1)}s type=${sc.type} spoken: "${(sc.tokens || []).map(t => t.w).join(' ').slice(0, 220)}" | on-screen: ${sceneSummary(sc)}`);
  const r = await (deps.llmJson || llmJson)({ system: plannerSystem(bundle.look), user: `Video look: ${bundle.look}. Language: ${bundle.lang}. Format: ${bundle.ratio}. Palette: ${bundle.palette}. Music: ${bundle.music ? 'on' : 'off'}. Captions: ${bundle.captions && bundle.captions !== 'none' ? 'on' : 'off'}.\nScenes:\n${lines.join('\n')}\n\nCustomer's request: ${String(instruction).slice(0, 1500)}`, maxTokens: 4000, temperature: 0.2 });
  return { ops: Array.isArray(r?.ops) ? r.ops.slice(0, 40) : [], summary: String(r?.summary || '').slice(0, 300), unsupported: String(r?.unsupported || '').slice(0, 300) };
}

/** قص أجزاء من الصوت (المشاهد المحذوفة) — ranges = الأجزاء اللي فاضلة */
async function cutAudio(src, ranges, out) {
  const parts = ranges.map(([a, b], k) => `[0:a]atrim=${a.toFixed(3)}:${b.toFixed(3)},asetpts=PTS-STARTPTS[a${k}]`).join(';');
  await ffmpeg(['-i', src, '-filter_complex', `${parts};${ranges.map((_, k) => `[a${k}]`).join('')}concat=n=${ranges.length}:v=0:a=1[out]`, '-map', '[out]', '-ar', '44100', '-ac', '2', out]);
  return out;
}

/** تطبيق التعديل كامل → فيديو جديد */
export async function produceAnimationEdit({ id, userId, input, workDir, prog }, deps = {}) {
  const src = await (deps.getJobAny || store.getJobAny)(input.sourceJobId);
  const ed = animEditorOf(src);
  if (!src || src.user_id !== userId || !ed) { const e = new Error('edit_unavailable'); e.code = 'edit_unavailable'; throw e; }
  fs.mkdirSync(workDir, { recursive: true });
  await prog('script', 0.3);
  const gz = await downloadTo(ed.storyUrl, path.join(workDir, 'story.json.gz'));
  const bundle = JSON.parse(zlib.gunzipSync(fs.readFileSync(gz)).toString('utf8'));
  let narrationFile = path.join(workDir, 'narration.wav');
  await ffmpeg(['-i', await downloadTo(ed.narrationUrl, path.join(workDir, 'narration.m4a')), '-ar', '44100', '-ac', '2', narrationFile]);
  await prog('script', 1);

  // 1) المخطط
  await prog('plan', 0.2);
  const plan = input.ops ? { ops: input.ops, summary: input.summary || '', unsupported: '' } : await (deps.planAnimationEdit || planAnimationEdit)({ bundle, instruction: input.instruction });
  await prog('plan', 1, {});
  const castMap = makeCastMap(bundle.castChars || []);
  let scenes = bundle.scenes.map(sc => ({ ...sc })), palette = bundle.palette, ratio = bundle.ratio, music = bundle.music ? 'keep' : 'off', captions = bundle.captions && bundle.captions !== 'none' ? bundle.captions : null;
  const changed = new Set(), deleted = new Set(), applied = [];
  for (const op of plan.ops) {
    const i = Number(op?.i);
    if (op?.op === 'change' && scenes[i]) {
      const spoken = `${(scenes[i].tokens || []).map(t => t.w).join(' ')} ${input.instruction || ''}`;
      const clean = sanitizeScene({ type: op.type, data: op.data || {} }, spoken, { look: bundle.look, host: bundle.host || 'sam', castMap });
      if (clean && clean.type !== 'world') { scenes[i] = { ...scenes[i], type: clean.type, data: clean.data, _new: true }; changed.add(i); applied.push(op); }
    } else if (op?.op === 'delete' && scenes[i] && scenes.length - deleted.size > 1) { deleted.add(i); applied.push(op); }
    else if (op?.op === 'palette' && (LOOK_PALETTES[bundle.look] || []).includes(op.value)) { palette = op.value; applied.push(op); }
    else if (op?.op === 'music' && (op.value === 'off' || op.value === 'on' || MUSIC_MOODS.includes(op.value))) { music = op.value === 'on' ? (bundle.music ? 'keep' : 'chill') : op.value; applied.push(op); }
    else if (op?.op === 'captions' && (op.value === 'on' || op.value === 'off')) { captions = op.value === 'on' ? (captions || 'karaoke') : null; applied.push(op); }
    else if (op?.op === 'ratio' && (op.value === '16:9' || op.value === '9:16')) { ratio = op.value; applied.push(op); }
    else if (op?.op === 'transition' && scenes[i] && i > 0 && TRANSITIONS.includes(op.value)) {
      const dur = scenes[i].end - scenes[i].start, prev = scenes[i - 1].end - scenes[i - 1].start;
      const trDur = op.value === 'cut' ? 0 : Math.min(trDuration(op.value), 0.35 * Math.min(dur, prev));
      scenes[i] = { ...scenes[i], trKind: trDur < 0.2 ? 'cut' : op.value, trDur: trDur < 0.2 ? 0 : trDur }; applied.push(op);
    }
  }
  if (!applied.length) { const e = new Error(plan.unsupported || 'nothing_to_change'); e.code = 'nothing_to_change'; e.userMessage = plan.unsupported; throw e; }

  // 2) حذف مشاهد = قص صوتها وإعادة ترتيب التوقيت
  let allTokens = bundle.allTokens || [];
  if (deleted.size) {
    const keep = scenes.map((sc, i) => (deleted.has(i) ? null : [sc.start, sc.end])).filter(Boolean);
    narrationFile = await cutAudio(narrationFile, keep, path.join(workDir, 'narration_cut.wav'));
    const shiftOf = (t) => { let shift = 0; for (const [i, sc] of scenes.entries()) { if (sc.start >= t) break; if (deleted.has(i)) shift += Math.min(sc.end, t) - sc.start; } return shift; };
    allTokens = allTokens.filter(tk => !scenes.some((sc, i) => deleted.has(i) && tk.start >= sc.start && tk.start < sc.end)).map(tk => ({ ...tk, start: tk.start - shiftOf(tk.start), end: tk.end - shiftOf(tk.start) }));
    let t = 0;
    scenes = scenes.filter((_, i) => !deleted.has(i)).map((sc, k) => { const d = sc.end - sc.start; const o = { ...sc, index: k, start: t, end: t + d }; t += d; return o; });
    if (scenes[0]) scenes[0] = { ...scenes[0], trKind: 'cut', trDur: 0 };
  }
  const duration = await probeDuration(narrationFile);
  if (scenes.length) scenes[scenes.length - 1].end = Math.max(duration, scenes[scenes.length - 1].end);
  scenes.forEach((sc, k) => { sc.index = k; });

  // 3) أصول المشاهد اللي اتغيّرت (صور أرشيف/لوجو/رسم حر/قياس عربي)
  await prog('assets', 0);
  const images = { ...(bundle.images || {}) };
  const idxOf = (sc) => scenes.indexOf(sc);
  const slots = [];
  for (const sc of scenes) {
    if (!sc._new) continue; // المشاهد اللي متغيّرتش بتفضل بأصولها زي ما هي
    const k = idxOf(sc), key = `e${id}_${k}`;
    if (sc.type === 'logo') { const L = await findLogo(sc.data.brand).catch(() => null); if (L) sc.data = { ...sc.data, logo: L }; else slots.push({ key, scene: k, text: sc.data.brand, query: `${sc.data.brand} logo`, named: true }); }
    else if (sc.type === 'photo' || sc.type === 'fullphoto') slots.push({ key, scene: k, text: (sc.tokens || []).map(t => t.w).join(' '), query: sc.data.query, named: sc.data.named, caption: sc.data.caption });
    else if (sc.type === 'collage') sc.data.slots.forEach((q, j) => slots.push({ key: `${key}_${j}`, scene: k, text: '', query: q.query, named: q.named }));
    else if (sc.type === 'poster' && sc.data.query) slots.push({ key, scene: k, text: '', query: `${sc.data.query} isolated on white background`, named: false, cutout: true });
    else if (sc.type === 'portrait') slots.push({ key, scene: k, text: '', query: sc.data.query, named: sc.data.named, cutout: sc.data.layout === 'year' ? false : 'model' });
    else if (sc.type === 'art') {
      const r = await (deps.designArt || designArt)({ idea: sc.data.idea, text: (sc.tokens || []).map(t => t.w).join(' '), language: bundle.lang, palette: pickPalette(palette), castMap: isCartoon(bundle.look) ? castMap : null, look: bundle.look, textOk: () => true }).catch(() => null);
      if (r) sc.data = { ...sc.data, bg: r.bg, elements: r.elements }; else { sc.type = 'kinetic'; sc.data = { emphasis: [] }; }
    }
    if (sc.type === 'poster' || sc.type === 'portrait') { try { sc.data._w = await measureNonLatin([sc.data.kicker, sc.data.hero, sc.data.bar, sc.data.tail, sc.data.title, sc.data.sub, sc.data.year]); } catch { /* تقدير */ } }
  }
  if (slots.length) {
    const res = await (deps.resolveVoxImages || resolveVoxImages)({ slots, ratio, assetsDir: path.join(workDir, 'images'), onProgress: (f) => prog('assets', f) });
    Object.assign(images, res.images);
    for (const sc of scenes) {
      const key = `e${id}_${idxOf(sc)}`;
      if (sc.type === 'photo' || sc.type === 'fullphoto') { if (images[key]) sc.data = { ...sc.data, img: key }; else { sc.type = 'kinetic'; sc.data = { emphasis: [] }; } }
      else if (sc.type === 'logo' && !sc.data.logo && images[key]) sc.data = { ...sc.data, img: key };
      else if (sc.type === 'poster' && sc.data.query && images[key]) sc.data = { ...sc.data, img: key };
      else if (sc.type === 'portrait') { const im = images[key]; if (im && (sc.data.layout === 'year' || im.uriCut)) sc.data = { ...sc.data, img: key }; else if (im) { sc.type = 'photo'; sc.data = { img: key, caption: sc.data.title, emphasis: [] }; } else { sc.type = 'kinetic'; sc.data = { emphasis: [] }; } }
      else if (sc.type === 'collage' && sc.data.slots) { const ids = sc.data.slots.map((_, j) => `${key}_${j}`).filter(x => images[x]); if (ids.length >= 2) sc.data = { imgs: ids, headline: sc.data.headline }; else if (ids.length === 1) { sc.type = 'photo'; sc.data = { img: ids[0], emphasis: [] }; } else { sc.type = 'kinetic'; sc.data = { emphasis: [] }; } }
    }
  }
  scenes.forEach(sc => { delete sc._new; });
  await prog('assets', 1);

  // 4) القصة + الموسيقى + الكابشن + الرندر
  const { w, h } = RATIO_SIZE[ratio];
  const rtl = ['ar', 'he', 'fa', 'ur'].includes(String(bundle.lang).split(/[-_]/)[0]);
  const mm = await makeMeasurer(allTokens.map(t => t.w), { rtl });
  const story = { w, h, palette: pickPalette(palette), lang: bundle.lang, scenes, mm, duration, look: bundle.look, cast: { host: bundle.host, map: castMap }, images };
  let musicFile = null;
  if (music === 'keep' && ed.musicUrl) musicFile = await downloadTo(ed.musicUrl, path.join(workDir, 'music.mp3')).catch(() => null);
  else if (music !== 'off' && music !== 'keep') { try { musicFile = path.join(workDir, 'music.mp3'); fs.writeFileSync(musicFile, await getBackgroundMusicBuffer('youtube', music)); } catch { musicFile = null; } }
  let assFile = null;
  if (captions) { try { assFile = path.join(workDir, 'captions.ass'); fs.writeFileSync(assFile, buildCaptionsAss({ words: allTokens.map(t => ({ w: t.w, start: t.start, end: t.end })), style: ratio === '9:16' ? 'word' : captions, w, h, lang: bundle.lang, theme: 'blue' })); } catch { assFile = null; } }
  const r = await renderCodeVideo({ story, narrationFile, musicFile, assFile, workDir: path.join(workDir, 'render'), outFile: path.join(workDir, 'animation.mp4'), onProgress: (stage, f) => prog('render', stage === 'frames' ? f * 0.9 : 0.9 + f * 0.1) });
  if (bundle.watermark) r.file = await (deps.watermarkVideo || watermarkVideo)(r.file);
  let editor = null;
  try { editor = await persistAnimationBundle({ jobId: id, userId, story, castChars: bundle.castChars, narrationFile, musicFile, allTokens, input: { captions, watermark: bundle.watermark }, title: bundle.title, script: bundle.script, workDir }); }
  catch (e) { console.warn('[AnimEdit] bundle not saved:', e.message); }
  return { file: r.file, duration: r.duration, credits: [], script: bundle.script, title: bundle.title, chapters: [], srt: buildSrt(allTokens.map(t => ({ w: t.w, start: t.start, end: t.end }))), animEditor: editor, editSummary: plan.summary, editUnsupported: plan.unsupported, sceneStats: { edit: true, ops: applied.length } };
}
