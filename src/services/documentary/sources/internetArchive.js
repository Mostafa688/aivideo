// ── sources/internetArchive.js ── أفلام أرشيفية (نشرات أخبار، أفلام حكومية...) — بنقبل بس اللي ترخيصه صريح ملك عام/CC0
// أو من مجموعات معروفة بإنها ملك عام (Prelinger وNASA). التنزيل بيتم بـffmpeg (قص الجزء المطلوب بس عن بُعد).
import { fetchJson, stripHtml, classifyLicense } from './common.js';

const PD_COLLECTIONS = new Set(['prelinger', 'nasa', 'nasaaudiovideo']);

export async function searchInternetArchive(query, { limit = 10 } = {}, deps = {}) {
  const get = deps.fetchJson || fetchJson;
  const q = `(${query}) AND mediatype:(movies)`;
  const url = 'https://archive.org/advancedsearch.php?' + new URLSearchParams({ q, rows: String(limit * 3), page: '1', output: 'json', sort: 'downloads desc' })
    + '&fl[]=identifier&fl[]=title&fl[]=description&fl[]=licenseurl&fl[]=collection&fl[]=year';
  const d = await get(url);
  const out = [];
  for (const doc of d?.response?.docs || []) {
    const cols = [].concat(doc.collection || []).map(x => String(x).toLowerCase());
    const lic = doc.licenseurl ? classifyLicense(doc.licenseurl) : { ok: false };
    const pdCol = cols.some(c => PD_COLLECTIONS.has(c));
    if (!(lic.ok || pdCol)) continue;
    out.push({
      source: 'archive', id: `archive:${doc.identifier}`, kind: 'video', title: stripHtml([].concat(doc.title || '')[0], 160), description: stripHtml([].concat(doc.description || '')[0]),
      thumb: `https://archive.org/services/img/${doc.identifier}`, identifier: doc.identifier,
      license: lic.ok ? lic : { ok: true, name: `Public domain collection (${cols.find(c => PD_COLLECTIONS.has(c))})`, attributionRequired: false },
      credit: `Internet Archive — ${[].concat(doc.title || '')[0] || doc.identifier}`, pageUrl: `https://archive.org/details/${doc.identifier}`, date: doc.year || null,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export async function materializeArchive(c, deps = {}) {
  const get = deps.fetchJson || fetchJson;
  const m = await get(`https://archive.org/metadata/${encodeURIComponent(c.identifier)}`);
  const files = (m?.files || []).filter(f => /\.mp4$/i.test(f.name || '') && (!f.size || Number(f.size) < 900 * 1024 * 1024));
  if (!files.length) return null;
  // نفضّل نسخة h.264 صغيرة نسبيًا
  files.sort((a, b) => (Number(a.size) || 1e12) - (Number(b.size) || 1e12));
  const f = files.find(x => /h\.?264|mpeg4/i.test(x.format || '')) || files[0];
  const dur = parseFloat(f.length) || null;
  return { ...c, url: `https://archive.org/download/${encodeURIComponent(c.identifier)}/${encodeURIComponent(f.name)}`, duration: dur, remote: true };
}
