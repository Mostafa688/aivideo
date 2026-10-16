// ── sources/pixabay.js ── مصدر ستوك تاني (اختياري — بيشتغل بس لو PIXABAY_API_KEY موجود). ترخيص Pixabay: استخدام تجاري حر
import fetch from 'node-fetch';
import { UA } from './common.js';
import { cacheGet, cacheSet } from './cache.js';

// شروط Pixabay: كاش 24 ساعة إجباري (على الديسك) + 100 طلب في الدقيقة. بنمشي تحت الحد (90/دقيقة) ونقرا الهيدرز:
// لو الباقي في الدقيقة قرّب يخلص بنستنى لحد ما الشباك يتجدد بدل ما نترفض
const WINDOW = 60e3, MAX_PER_MIN = 90;
let stamps = [], pausedUntil = 0;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function slot() {
  for (let i = 0; i < 30; i++) {
    const now = Date.now();
    stamps = stamps.filter(x => now - x < WINDOW);
    if (now >= pausedUntil && stamps.length < MAX_PER_MIN) { stamps.push(now); return true; }
    await sleep(Math.max(250, Math.min(5000, now < pausedUntil ? pausedUntil - now : WINDOW - (now - stamps[0]) + 50)));
  }
  return false;
}
async function pixabayGet(url) {
  const hit = cacheGet(url);
  if (hit !== undefined) return hit;
  if (!(await slot())) return null;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    const remaining = Number(res.headers.get('x-ratelimit-remaining')), reset = Number(res.headers.get('x-ratelimit-reset')); // reset = ثواني فاضلة
    if (res.status === 429 || (Number.isFinite(remaining) && remaining <= 2)) pausedUntil = Date.now() + (Number.isFinite(reset) && reset > 0 ? Math.min(60, reset) : 60) * 1000;
    if (!res.ok) { if (res.status === 429) console.warn('[Documentary/pixabay] rate limit — pausing'); return null; }
    const data = await res.json();
    cacheSet(url, data);
    return data;
  } catch (e) { console.warn(`[Documentary/pixabay] ${e.message}`); return null; } finally { clearTimeout(t); }
}

const LICENSE = { ok: true, name: 'Pixabay Content License', attributionRequired: false };

export async function searchPixabay(query, { kinds = ['video', 'image'], orientation = 'landscape', limit = 8 } = {}, deps = {}) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return [];
  const get = deps.fetchJson || pixabayGet;
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
