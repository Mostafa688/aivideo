// ── editorService.js ── محرر المشاهد: عرض مشاهد الفيلم، بحث بدائل للقطة، رفع لقطة العميل، وتطبيق التعديلات
// (رندر المقاطع المتغيّرة فقط + دمج بالنسخ مع الصوت المحفوظ). التكلفة ثابتة صغيرة لكل "تطبيق" لحد 10 مشاهد.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ffmpeg, probeDuration, probeVideo, rmQuiet } from './ff.js';
import { searchCandidates, materialize, fetchAsset } from './sources/index.js';
import { buildBeatClip } from './clipBuilder.js';
import { renderBackground } from './background.js';
import { RATIO_SIZE, beatCaptionsAss } from './index.js';
import { measureCaptionWords } from './captions.js';
import { isRtlLang } from './textutil.js';
import { chargeCredits, addCreditsBalance } from '../authService.js';
import * as store from './store.js';
import { downloadTo, specWithAsset, patchSprite, deleteEditorFiles, EDIT_CREDITS, EDIT_MAX_CHANGES } from './editorStore.js';

const TEMP_ROOT = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

// ── كاش بحث/رفع مؤقت (في الذاكرة): العميل مبيبعتش روابط خارجية أبدًا — بس معرّفات من نتايج بحثنا أو رفعه ──
const searchCache = new Map(); // `${jobId}:${i}` → { at, list }
const uploads = new Map();     // uploadId → { jobId, i, file, kind, at }
const TTL = 30 * 60e3;
function gc() {
  const now = Date.now();
  for (const [k, v] of searchCache) if (now - v.at > TTL) searchCache.delete(k);
  for (const [k, v] of uploads) if (now - v.at > TTL) { rmQuiet(path.dirname(v.file)); uploads.delete(k); }
  if (searchCache.size > 200) searchCache.delete(searchCache.keys().next().value);
}

export function editorOf(job) {
  const ed = job?.meta?.editor;
  return ed && ed.version === 1 && Array.isArray(ed.clips) ? ed : null;
}

export function editorView(job) {
  const ed = editorOf(job);
  if (!ed) return { available: false, reason: job?.meta?.editorExpired ? 'expired' : (job?.duration_sec > 720 ? 'too_long' : 'unavailable') };
  return {
    available: true, editing: job.meta?.editing === true, editError: job.meta?.editError || null, revision: ed.revision, expiresAt: ed.expiresAt,
    ratio: ed.ratio, sprite: ed.sprite, cost: EDIT_CREDITS, maxChanges: EDIT_MAX_CHANGES,
    beats: ed.beats.map(b => ({ i: b.i, start: b.start, dur: b.dur, text: b.text, kind: b.kind, swappable: b.swappable, credit: b.credit, title: b.assetTitle })),
  };
}

/** بدائل للقطة (بحث بنفس كلمات المخطط أو كلمات العميل) — صور وفيديو بتراخيص مفتوحة بس */
export async function searchBeatCandidates(job, i, { query = '' } = {}) {
  const ed = editorOf(job);
  const beat = ed?.beats?.[i];
  if (!beat?.swappable) { const e = new Error('not_swappable'); e.code = 'not_swappable'; throw e; }
  const orientation = ed.ratio === '9:16' ? 'portrait' : 'landscape';
  const qs = query.trim() ? [query.trim().slice(0, 100)] : (beat.queries?.length ? beat.queries : [beat.text.slice(0, 80)]);
  const seen = new Set(); const list = [];
  const groups = beat.group === 'stock' ? ['stock'] : [beat.group, 'stock'];
  for (const q of qs) {
    for (const group of groups) {
      try {
        const r = await searchCandidates(q, { group, kinds: ['video', 'image'], orientation, limit: 8 });
        for (const c of r) if (!seen.has(c.id)) { seen.add(c.id); list.push(c); }
      } catch { /* مصدر واقع */ }
    }
    if (list.length >= 16) break;
  }
  gc();
  searchCache.set(`${job.id}:${i}`, { at: Date.now(), list });
  return list.slice(0, 24).map(c => ({ id: c.id, kind: c.kind, source: c.source, title: String(c.title || '').slice(0, 80), thumb: c.thumb || (c.kind === 'image' ? c.url : null), credit: c.credit, duration: c.duration || null }));
}

/** رفع لقطة من العميل (صورة/فيديو) لمشهد معيّن */
export async function saveBeatUpload(job, i, file, originalName) {
  const ed = editorOf(job);
  if (!ed?.beats?.[i]?.swappable) { rmQuiet(path.dirname(file)); const e = new Error('not_swappable'); e.code = 'not_swappable'; throw e; }
  const info = await probeVideo(file).catch(() => null);
  if (!info?.width) { rmQuiet(path.dirname(file)); const e = new Error('bad_file'); e.code = 'bad_file'; throw e; }
  const isImage = /\.(jpe?g|png|webp|gif|bmp)$/i.test(originalName || '') || !(info.duration > 0.1);
  const id = crypto.randomBytes(8).toString('hex');
  gc();
  uploads.set(id, { jobId: job.id, i, file, kind: isImage ? 'image' : 'video', at: Date.now() });
  return { uploadId: id, kind: isImage ? 'image' : 'video' };
}

/** يبدأ التعديل: تحقق → "حجز" ذري على الفيلم → خصم الكريديت → رجوع بالمهمة للطابور */
export async function prepareEdit(userId, job, changes) {
  const ed = editorOf(job);
  if (!ed) return { ok: false, status: 400, error: 'editor_unavailable', message: 'Editing is not available for this film.' };
  if (!Array.isArray(changes) || !changes.length || changes.length > EDIT_MAX_CHANGES) return { ok: false, status: 400, error: 'bad_changes', message: `Choose 1 to ${EDIT_MAX_CHANGES} scenes.` };
  const resolved = []; const seen = new Set();
  for (const c of changes) {
    const i = Number(c?.i);
    if (!Number.isInteger(i) || seen.has(i) || !ed.beats[i]?.swappable) return { ok: false, status: 400, error: 'bad_changes', message: 'Invalid scene.' };
    seen.add(i);
    if (c.uploadId) {
      const up = uploads.get(String(c.uploadId));
      if (!up || up.jobId !== job.id || up.i !== i || !fs.existsSync(up.file)) return { ok: false, status: 400, error: 'upload_expired', message: 'The uploaded file expired, please upload it again.' };
      resolved.push({ i, upload: up, uploadId: String(c.uploadId) });
    } else if (c.candidateId) {
      const hit = searchCache.get(`${job.id}:${i}`)?.list.find(x => x.id === c.candidateId);
      if (!hit) return { ok: false, status: 400, error: 'search_expired', message: 'The search results expired, please search again.' };
      resolved.push({ i, candidate: hit });
    } else return { ok: false, status: 400, error: 'bad_changes', message: 'Choose a replacement for every scene.' };
  }
  if (!(await store.claimEditing(job.id))) return { ok: false, status: 409, error: 'already_editing', message: 'This film is already being edited.' };
  const charge = await chargeCredits(userId, EDIT_CREDITS);
  if (!charge.success) { await store.releaseEditing(job.id); return { ok: false, status: 403, error: 'quota_exceeded', message: `Applying edits needs ${EDIT_CREDITS} credits, you have ${charge.remaining}.`, cost: EDIT_CREDITS, remaining: charge.remaining }; }
  await store.mergeMeta(job.id, { editCharged: EDIT_CREDITS, editError: null }).catch(() => {});
  return { ok: true, task: { kind: 'edit', id: job.id, userId, changes: resolved, charged: EDIT_CREDITS, input: {} }, remaining: charge.remaining };
}

/** تنفيذ التعديل (من طابور المهام) */
export async function runEditTask(task) {
  const { id, userId, changes } = task;
  const workDir = path.join(TEMP_ROOT, `doc_edit_${id}_${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  try {
    const job = await store.getJobAny(id);
    const ed = editorOf(job);
    if (!ed) throw new Error('editor data missing');
    const { w, h } = RATIO_SIZE[ed.ratio] || RATIO_SIZE['16:9'];
    const lang = ed.lang || 'en';
    const rtl = isRtlLang(lang);
    const clipsDir = path.join(workDir, 'clips'); fs.mkdirSync(clipsDir, { recursive: true });
    const rev = (ed.revision || 0) + 1;
    const base = `documentaries/${userId}/${id}/edit`;

    // المقاطع الحالية + الصوت
    const local = new Array(ed.clips.length);
    let k = 0;
    await Promise.all(Array.from({ length: Math.min(6, ed.clips.length) }, async () => {
      while (k < ed.clips.length) { const i = k++; local[i] = await downloadTo(ed.clips[i], path.join(clipsDir, `cur_${String(i).padStart(4, '0')}.mp4`)); }
    }));
    const audio = await downloadTo(ed.audioUrl, path.join(workDir, 'audio.m4a'));

    // مقاطع جديدة للمشاهد المتغيّرة
    const bgPath = path.join(workDir, 'bg.png');
    await renderBackground(ed.theme || 'blue', w, h, bgPath);
    const words = (ed.words || []).map(([wd, s, e]) => ({ w: wd, start: s, end: e }));
    const widths = words.length && rtl && ed.captionsStyle && ed.captionsStyle !== 'box' ? await measureCaptionWords(words, { lang, w, h }).catch(() => null) : null;
    const newClipUrls = {}; const creditByBeat = {};
    let sprite = ed.sprite.url;
    for (const ch of changes) {
      const beat = ed.beats[ch.i];
      let asset;
      if (ch.upload) {
        let file = ch.upload.file;
        if (ch.upload.kind === 'video') { /* الفيديو بيتقص جوه buildBeatClip (-stream_loop + -t) */ }
        asset = { file, kind: ch.upload.kind, credit: null };
      } else {
        const c = await materialize(ch.candidate);
        if (!c?.url) throw new Error('candidate could not be materialized');
        const a = await fetchAsset(c, path.join(workDir, `asset_${ch.i}`), { clipSeconds: Math.max(4, beat.dur) });
        asset = { file: a.file, kind: a.kind, credit: c.credit, title: c.title, license: c.license };
      }
      const spec = specWithAsset(beat.spec, asset, ch.i);
      const ass = ed.captionsStyle ? beatCaptionsAss({ words, start: beat.start, dur: beat.dur, style: ed.captionsStyle, w, h, lang, theme: ed.theme, widths, file: path.join(clipsDir, `cap_${ch.i}.ass`) }) : null;
      fs.mkdirSync(path.join(workDir, `new_${ch.i}`), { recursive: true });
      const clip = await buildBeatClip({ beat: spec, w, h, theme: ed.theme || 'blue', bgPath, lang, rtl, workDir: path.join(workDir, `new_${ch.i}`), index: ch.i, captionsAss: ass });
      local[ch.i] = clip;
      newClipUrls[ch.i] = await store.uploadFile(clip, `${base}/clip_${ch.i}_v${rev}.mp4`, 'video/mp4');
      creditByBeat[ch.i] = { credit: asset.credit, title: asset.title || null };
      const patched = await patchSprite(sprite, ch.i, clip, beat.dur, ed.ratio, workDir);
      sprite = await store.uploadFile(patched, `${base}/sprite_v${rev}_${ch.i}.jpg`, 'image/jpeg');
    }

    // دمج بالنسخ + الصوت المحفوظ
    const list = path.join(workDir, 'list.txt');
    fs.writeFileSync(list, local.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'));
    const video = path.join(workDir, 'video.mp4');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video]);
    const out = path.join(workDir, 'final.mp4');
    const total = ed.beats.reduce((a, b) => a + b.dur, 0);
    await ffmpeg(['-i', video, '-i', audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-t', total.toFixed(3), '-movflags', '+faststart', out]);
    const duration = await probeDuration(out);
    const videoUrl = await store.uploadFile(out, `documentaries/${userId}/${id}_v${rev}.mp4`, 'video/mp4');

    // تحديث الحالة + المصادر/التراخيص
    const fresh = await store.getJobAny(id);
    const meta = { ...(fresh.meta || {}) };
    const e2 = { ...editorOf(fresh), revision: rev, sprite: { ...ed.sprite, url: sprite } };
    e2.clips = ed.clips.map((u, i) => newClipUrls[i] || u);
    e2.beats = ed.beats.map(b => (creditByBeat[b.i] ? { ...b, credit: creditByBeat[b.i].credit, assetTitle: creditByBeat[b.i].title } : b));
    const credits = [...new Set([...(e2.beats.map(b => b.credit).filter(Boolean)), ...(e2.extraCredits || [])])];
    meta.editor = e2; meta.editing = false; meta.editCharged = 0; meta.editError = null; delete meta.package;
    await store.updateJob(id, { result_url: videoUrl, duration_sec: duration, credits_list: credits, meta });
  } catch (e) {
    console.error(`[Documentary/editor] edit of job ${id} failed:`, e.message);
    await addCreditsBalance(userId, task.charged).catch(() => {});
    const fresh = await store.getJobAny(id).catch(() => null);
    const meta = { ...(fresh?.meta || {}), editing: false, editCharged: 0, editError: 'The edit could not be applied, your credits were refunded.' };
    await store.updateJob(id, { meta }).catch(() => {});
  } finally {
    changes.forEach(c => { if (c.uploadId) { const u = uploads.get(c.uploadId); if (u) rmQuiet(path.dirname(u.file)); uploads.delete(c.uploadId); } });
    rmQuiet(workDir);
  }
}

/** مسح ملفات التعديل المنتهية (بتتشغّل عند الإقلاع وكل 6 ساعات) */
export async function sweepExpiredEditors() {
  try {
    const rows = await store.expiredEditors();
    for (const r of rows) {
      await deleteEditorFiles(r.id, r.user_id).catch(e => console.warn('[Documentary/editor] cleanup failed:', e.message));
      const meta = { ...(r.meta || {}), editorExpired: true }; delete meta.editor; delete meta.editing;
      await store.updateJob(r.id, { meta }).catch(() => {});
    }
    if (rows.length) console.log(`[Documentary/editor] cleaned ${rows.length} expired editor(s)`);
  } catch (e) { console.warn('[Documentary/editor] sweep skipped:', e.message); }
}
