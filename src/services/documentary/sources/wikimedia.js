// ── sources/wikimedia.js ── Wikimedia Commons: صور تاريخية وشخصيات وأماكن (ترخيص لكل ملف: بنقبل PD/CC0/CC BY بس)
import { fetchJson, stripHtml, classifyLicense } from './common.js';

async function searchWikimediaImages(query, { limit = 12 } = {}, deps = {}) {
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

// ── فيديوهات Commons: أفلام أرشيفية بترخيص ملك عام/CC (نشرات، أفلام حكومية، ناسا...) — بنقص الجزء المطلوب عن بُعد بـffmpeg ──
async function searchWikimediaVideos(query, { limit = 8 } = {}, deps = {}) {
  const get = deps.fetchJson || fetchJson;
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:video`, gsrnamespace: '6', gsrlimit: String(limit),
    prop: 'imageinfo', iiprop: 'url|size|mime|mediatype|extmetadata', origin: '*',
  });
  const d = await get(url);
  const out = [];
  for (const p of Object.values(d?.query?.pages || {})) {
    const ii = p.imageinfo?.[0];
    if (!ii || String(ii.mediatype || '').toUpperCase() !== 'VIDEO' || !/^(video\/(webm|ogg|mp4)|application\/ogg)$/.test(ii.mime || '')) continue;
    const dur = Number(ii.duration) || null;
    if (dur != null && dur < 3) continue;
    if (ii.size && Number(ii.size) > 3 * 1024 * 1024 * 1024) continue;
    const em = ii.extmetadata || {};
    const lic = classifyLicense(em.LicenseShortName?.value || em.License?.value || '');
    if (!lic.ok) continue;
    const artist = stripHtml(em.Artist?.value, 120);
    const title = String(p.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
    out.push({
      source: 'wikimedia', id: `wikimedia:${p.pageid}`, kind: 'video', title, description: stripHtml(em.ImageDescription?.value),
      url: ii.url, thumb: ii.url, width: ii.width || null, height: ii.height || null, duration: dur, remote: true,
      license: lic, credit: `${artist ? artist + ' · ' : ''}${lic.name} · Wikimedia Commons`, pageUrl: ii.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      date: stripHtml(em.DateTimeOriginal?.value, 40) || null,
    });
  }
  return out;
}

/** صور (دايمًا لو kinds فيها image) + فيديوهات أرشيفية (لو kinds فيها video) */
export async function searchWikimedia(query, { limit = 12, kinds = ['video', 'image'] } = {}, deps = {}) {
  const wantImg = !kinds || kinds.includes('image'), wantVid = !kinds || kinds.includes('video');
  const [imgs, vids] = await Promise.all([
    wantImg ? searchWikimediaImages(query, { limit }, deps).catch(() => []) : [],
    wantVid ? searchWikimediaVideos(query, { limit: Math.min(limit, 8) }, deps).catch(() => []) : [],
  ]);
  return [...vids, ...imgs];
}
