// ── sources/pexels.js ── لقطات وصور ستوك (ترخيص Pexels: استخدام تجاري حر، النسب مش مطلوب)
import { fetchJson } from './common.js';

const LICENSE = { ok: true, name: 'Pexels License', attributionRequired: false };

function bestVideoFile(files = [], orientation) {
  const mp4 = files.filter(f => f.file_type === 'video/mp4' && f.link);
  const want = orientation === 'portrait' ? (f) => f.height >= f.width : (f) => f.width >= f.height;
  const pool = (mp4.filter(want).length ? mp4.filter(want) : mp4).filter(f => (f.width || 0) >= 1280 || (f.height || 0) >= 1280);
  const use = pool.length ? pool : mp4;
  // أقرب لـ1080 (مش 4K — تنزيل أخف ومعالجة أسرع)
  return use.sort((a, b) => Math.abs((a.height || 0) - 1080) - Math.abs((b.height || 0) - 1080))[0] || null;
}

export async function searchPexels(query, { kinds = ['video', 'image'], orientation = 'landscape', limit = 8 } = {}, deps = {}) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];
  const get = deps.fetchJson || fetchJson;
  const headers = { Authorization: key };
  const out = [];
  const q = encodeURIComponent(query);
  if (kinds.includes('video')) {
    const d = await get(`https://api.pexels.com/videos/search?query=${q}&per_page=${limit}&orientation=${orientation}`, { headers });
    for (const v of d?.videos || []) {
      const f = bestVideoFile(v.video_files, orientation);
      if (!f) continue;
      out.push({
        source: 'pexels', id: `pexels:v:${v.id}`, kind: 'video', title: slugTitle(v.url), description: '', url: f.link, thumb: v.image,
        width: f.width, height: f.height, duration: v.duration, license: LICENSE, credit: v.user?.name ? `Video by ${v.user.name} on Pexels` : 'Pexels', pageUrl: v.url,
      });
    }
  }
  if (kinds.includes('image')) {
    const d = await get(`https://api.pexels.com/v1/search?query=${q}&per_page=${limit}&orientation=${orientation}`, { headers });
    for (const p of d?.photos || []) {
      const url = p.src?.large2x || p.src?.large || p.src?.original;
      if (!url) continue;
      out.push({
        source: 'pexels', id: `pexels:p:${p.id}`, kind: 'image', title: p.alt || slugTitle(p.url), description: p.alt || '', url, thumb: p.src?.medium,
        width: p.width, height: p.height, license: LICENSE, credit: p.photographer ? `Photo by ${p.photographer} on Pexels` : 'Pexels', pageUrl: p.url,
      });
    }
  }
  return out;
}

// رابط Pexels فيه وصف كلامي (…/video/man-walking-on-the-beach-1234567/) بنستخدمه كعنوان للمطابقة
function slugTitle(url) {
  const m = String(url || '').match(/\/(?:video|photo)\/([^/]+?)-?\d*\/?$/);
  return m ? m[1].replace(/-/g, ' ') : '';
}
