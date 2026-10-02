// ── sources/nasa.js ── مكتبة NASA للصور والفيديو (ملك عام عمليًا — سياسة استخدام ناسا: مفيش حقوق نشر، بدون إيحاء بتأييد)
import { fetchJson, stripHtml } from './common.js';

const LICENSE = { ok: true, name: 'NASA media (public domain)', attributionRequired: false };

export async function searchNasa(query, { kinds = ['video', 'image'], limit = 8 } = {}, deps = {}) {
  const get = deps.fetchJson || fetchJson;
  const types = kinds.map(k => (k === 'video' ? 'video' : 'image')).join(',');
  const d = await get(`https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=${types}&page_size=${limit}`);
  const out = [];
  for (const item of d?.collection?.items || []) {
    const meta = item.data?.[0];
    if (!meta?.nasa_id) continue;
    // لو فيه حقوق لطرف تالت (نادر) بنستبعده
    if (/copyright|©|courtesy of (?!nasa)/i.test(`${meta.secondary_creator || ''} ${meta.description || ''}`) && !/nasa/i.test(meta.secondary_creator || '')) continue;
    out.push({
      source: 'nasa', id: `nasa:${meta.nasa_id}`, kind: meta.media_type === 'video' ? 'video' : 'image',
      title: meta.title || '', description: stripHtml(meta.description), thumb: item.links?.find(l => l.rel === 'preview')?.href || null,
      manifest: item.href, license: LICENSE, credit: `NASA${meta.center ? ' / ' + meta.center : ''}`, pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(meta.nasa_id)}`,
      date: meta.date_created || null,
    });
  }
  return out;
}

// بنجيب ملفات الأصل الفعلية (manifest) ونختار حجم معقول
export async function materializeNasa(c, deps = {}) {
  const get = deps.fetchJson || fetchJson;
  const files = await get(c.manifest);
  if (!Array.isArray(files)) return null;
  const pick = (re) => files.find(f => re.test(f));
  const url = c.kind === 'video'
    ? (pick(/~medium\.mp4$/i) || pick(/~large\.mp4$/i) || pick(/~mobile\.mp4$/i) || pick(/\.mp4$/i))
    : (pick(/~large\.jpg$/i) || pick(/~orig\.jpg$/i) || pick(/~medium\.jpg$/i) || pick(/\.jpe?g$/i));
  return url ? { ...c, url: url.replace(/^http:/, 'https:').replace(/ /g, '%20') } : null;
}
