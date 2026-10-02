// ── sources/wikimedia.js ── Wikimedia Commons: صور تاريخية وشخصيات وأماكن (ترخيص لكل ملف: بنقبل PD/CC0/CC BY بس)
import { fetchJson, stripHtml, classifyLicense } from './common.js';

export async function searchWikimedia(query, { limit = 12 } = {}, deps = {}) {
  const get = deps.fetchJson || fetchJson;
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1920', origin: '*',
  });
  const d = await get(url);
  const out = [];
  for (const p of Object.values(d?.query?.pages || {})) {
    const ii = p.imageinfo?.[0];
    if (!ii || !/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) continue;
    const em = ii.extmetadata || {};
    const lic = classifyLicense(em.LicenseShortName?.value || em.License?.value || '');
    if (!lic.ok) continue;
    const artist = stripHtml(em.Artist?.value, 120);
    const title = String(p.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
    out.push({
      source: 'wikimedia', id: `wikimedia:${p.pageid}`, kind: 'image', title, description: stripHtml(em.ImageDescription?.value),
      url: ii.thumburl || ii.url, thumb: ii.thumburl || ii.url, width: ii.thumbwidth || ii.width, height: ii.thumbheight || ii.height,
      license: lic, credit: `${artist ? artist + ' · ' : ''}${lic.name} · Wikimedia Commons`, pageUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      date: stripHtml(em.DateTimeOriginal?.value, 40) || null,
    });
  }
  return out;
}
