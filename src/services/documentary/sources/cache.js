// ── sources/cache.js ── كاش نتايج البحث في مصادر الستوك (Pexels/Pixabay) على الديسك لمدة 24 ساعة:
// Pixabay بيشترط كاش 24 ساعة، وPexels حده 200 طلب في الساعة — فنفس البحث (حتى من فيلم تاني أو بعد ريستارت) مش بيصرف طلب جديد
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DIR = path.join(process.cwd(), 'outputs', 'cache', 'stock');
const TTL = 24 * 3600e3;
const mem = new Map();
let lastSweep = 0;
// المفتاح مش بيحتوي على مفتاح الـAPI (Pixabay بيحطه في الرابط) — بنشيله قبل الهاش
const keyOf = (url) => crypto.createHash('sha1').update(String(url).replace(/([?&])key=[^&]+/, '$1')).digest('hex');

export function cacheGet(url) {
  const k = keyOf(url), now = Date.now();
  const m = mem.get(k);
  if (m && now - m.at < TTL) return m.data;
  try {
    const f = path.join(DIR, `${k}.json`);
    const st = fs.statSync(f);
    if (now - st.mtimeMs < TTL) { const data = JSON.parse(fs.readFileSync(f, 'utf8')); mem.set(k, { at: st.mtimeMs, data }); return data; }
  } catch { /* مش في الكاش */ }
  return undefined;
}

export function cacheSet(url, data) {
  const k = keyOf(url), now = Date.now();
  mem.set(k, { at: now, data });
  if (mem.size > 4000) for (const x of [...mem.keys()].slice(0, 1500)) mem.delete(x);
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, `${k}.json`), JSON.stringify(data)); } catch { /* الديسك مش متاح: كاش الذاكرة كفاية */ }
  if (now - lastSweep > 3600e3) { lastSweep = now; sweep(now); }
}

function sweep(now) {
  try { for (const f of fs.readdirSync(DIR)) { const p = path.join(DIR, f); try { if (now - fs.statSync(p).mtimeMs > TTL) fs.rmSync(p, { force: true }); } catch { /* */ } } } catch { /* */ }
}
