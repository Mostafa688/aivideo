// ── sources/pixabay.js ── مصدر ستوك تاني (اختياري — بيشتغل بس لو PIXABAY_API_KEY موجود). ترخيص Pixabay: استخدام تجاري حر
import { fetchJson } from './common.js';

const LICENSE = { ok: true, name: 'Pixabay Content License', attributionRequired: false };

export async function searchPixabay(query, { kinds = ['video', 'image'], orientation = 'landscape', limit = 8 } = {}, deps = {}) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const get = deps.fetchJson || fetchJson;
  const q = encodeURIComponent(query);
  const out = [];
  if (kinds.includes('video')) {
    const d = await get(`https://pixabay.com/api/videos/?key=${key}&q=${q}&per_page=${Math.max(3, limit)}&safesearch=true`);
    for (const v of d?.hits || []) {
      const f = v.videos?.large?.url ? v.videos.large : (v.videos?.medium?.url ? v.videos.medium : null);
      if (!f) continue;
      out.push({ source: 'pixabay', id: `pixabay:v:${v.id}`, kind: 'video', title: v.tags || '', description: v.tags || '', url: f.url, thumb: v.userImageURL || null, width: f.width, height: f.height, duration: v.duration, license: LICENSE, credit: `Video by ${v.user} on Pixabay`, pageUrl: v.pageURL });
    }
  }
  if (kinds.includes('image')) {
    const d = await get(`https://pixabay.com/api/?key=${key}&q=${q}&image_type=photo&orientation=${orientation === 'portrait' ? 'vertical' : 'horizontal'}&per_page=${Math.max(3, limit)}&safesearch=true`);
    for (const p of d?.hits || []) {
      const url = p.largeImageURL || p.webformatURL;
      if (!url) continue;
      out.push({ source: 'pixabay', id: `pixabay:p:${p.id}`, kind: 'image', title: p.tags || '', description: p.tags || '', url, thumb: p.previewURL, width: p.imageWidth, height: p.imageHeight, license: LICENSE, credit: `Photo by ${p.user} on Pixabay`, pageUrl: p.pageURL });
    }
  }
  return out;
}
