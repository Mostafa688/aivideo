// ── sources/pexels.js ── لقطات وصور ستوك (ترخيص Pexels: استخدام تجاري حر، النسب مش مطلوب)
import fetch from 'node-fetch';
import { UA } from './common.js';

// ✅ حد Pexels (200 طلب في الساعة): فيلم طويل (300+ مشهد) كان بيستهلكه في أول ~10 دقايق من الفيلم وبعدها كل البحث بيرجع
// 429 والمشاهد تتحول لنص. دلوقتي: كاش للاستعلامات المتكررة، بنقرا هيدرز الحد ونوقف Pexels لحد ما يتجدد (والباقي بيروح لمصادر تانية)،
// ومفيش إعادة محاولة على 429، والصور بتتطلب بس لو الفيديوهات مكفّتش
const cache = new Map(); const TTL = 12 * 3600e3;
let blockedUntil = 0;
export const pexelsAvailable = () => !!process.env.PEXELS_API_KEY && Date.now() >= blockedUntil;
async function pexelsGet(url, headers) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.data;
  if (Date.now() < blockedUntil) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: ctrl.signal });
    const remaining = Number(res.headers.get('x-ratelimit-remaining'));
    const reset = Number(res.headers.get('x-ratelimit-reset')); // epoch بالثواني
    const until = reset > 1e9 ? reset * 1000 : Date.now() + 30 * 60e3;
    if (res.status === 429 || (Number.isFinite(remaining) && remaining <= 1)) {
      blockedUntil = Math.max(blockedUntil, until);
      console.warn(`[Documentary/pexels] rate limit reached — using other sources until ${new Date(blockedUntil).toISOString()}`);
      if (res.status === 429) return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    cache.set(url, { at: Date.now(), data });
    if (cache.size > 3000) for (const k of [...cache.keys()].slice(0, 1000)) cache.delete(k);
    return data;
  } catch (e) { console.warn(`[Documentary/pexels] ${e.message}`); return null; } finally { clearTimeout(t); }
}

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
  const get = deps.fetchJson || ((url, o) => pexelsGet(url, o.headers));
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
  // الصور بتتطلب بس لو الفيديوهات قليلة (نص عدد الطلبات)
  if (kinds.includes('image') && (!kinds.includes('video') || out.length < 3)) {
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
