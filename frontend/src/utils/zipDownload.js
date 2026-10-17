// ── zipDownload.js ── تنزيل مجموعة صور/فيديوهات كملف ZIP واحد (في المتصفح، من غير ضغط إضافي —
// الصور والفيديوهات مضغوطة أصلاً، فبنخزّنها زي ما هي وده أسرع وأخف على الجهاز)
import { Zip, ZipPassThrough } from 'fflate';
import { fetchRemoteBlob } from './download.js';

const extOf = (url, fallback) => {
  const m = /\.([a-z0-9]{2,4})(?:\?|#|$)/i.exec(String(url || '').split('/').pop() || '');
  return m ? m[1].toLowerCase() : fallback;
};
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';

/**
 * files: [{ url, name, folder? }] — name من غير امتداد (الامتداد بيتاخد من الرابط)
 * onProgress(done, total)
 * @returns {{ ok: number, failed: number }}
 */
export async function downloadZip(files, zipName = 'erivion', onProgress = () => {}) {
  const list = files.filter(f => f?.url);
  if (!list.length) return { ok: 0, failed: 0 };
  const chunks = [];
  let zipErr = null;
  const zip = new Zip((err, data) => { if (err) zipErr = err; else if (data) chunks.push(data); });
  const used = new Set();
  let ok = 0, failed = 0, done = 0;
  // بنجيب كل ملف بالترتيب (ملف واحد في الذاكرة غير المضغوط في نفس الوقت)
  for (const f of list) {
    try {
      const blob = await fetchRemoteBlob(f.url);
      const buf = new Uint8Array(await blob.arrayBuffer());
      const ext = extOf(f.url, (blob.type || '').includes('video') ? 'mp4' : (blob.type || '').includes('png') ? 'png' : 'jpg');
      let base = `${f.folder ? safeName(f.folder) + '/' : ''}${safeName(f.name)}`, path = `${base}.${ext}`, k = 2;
      while (used.has(path)) path = `${base} (${k++}).${ext}`;
      used.add(path);
      const entry = new ZipPassThrough(path);
      zip.add(entry);
      entry.push(buf, true);
      ok++;
    } catch { failed++; }
    onProgress(++done, list.length);
  }
  zip.end();
  if (zipErr) throw zipErr;
  if (!ok) return { ok, failed };
  const url = URL.createObjectURL(new Blob(chunks, { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${safeName(zipName)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return { ok, failed };
}

/** ملفات الميديا اللي جوه رسالة من رسائل المشروع (صور دفعة / فيديو) */
export async function mediaFilesOfMessage(m, authHeader = {}) {
  const job = m?.job || {};
  const out = [];
  if (m.type === 'imageBatch') {
    (job.images || []).forEach((u, i) => { const url = typeof u === 'string' ? u : u?.url; if (url) out.push({ url, name: `image-${String(job.uid || '').slice(-6) || 'x'}-${i + 1}` }); });
    return out;
  }
  let url = job.videoUrl || job.video_url || null;
  try {
    if (!url && m.type === 'docJob' && job.jobId) { const r = await fetch(`/api/documentary/jobs/${job.jobId}`, { headers: authHeader }); if (r.ok) url = (await r.json()).videoUrl || null; }
    if (!url && m.type === 'whiteboard' && job.id) { const r = await fetch(`/api/whiteboard-video/jobs/${job.id}`, { headers: authHeader }); if (r.ok) { const d = await r.json(); url = d.job?.video_url || d.job?.videoUrl || null; } }
  } catch { /* بنتخطاه */ }
  if (url) out.push({ url, name: `video-${job.model || m.type}-${String(job.uid || job.jobId || job.id || job.runId || '').slice(-6) || Date.now()}` });
  return out;
}
