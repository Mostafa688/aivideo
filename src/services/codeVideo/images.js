// ── images.js ── نمط Vox فقط: بيجيب صور حقيقية من الأرشيف/الستوك (نفس مصادر الأفلام الوثائقية + نفس فلتر الصلة الصارم للأشخاص والأماكن)
// وبيجهّزها لتتحط جوه الـSVG (JPEG صغير base64 + نسخة رمادي دافئ للصورة بملء الشاشة)
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { resolveAssets } from '../documentary/resolver.js';

// ── أسلوب الكولاج الورقي: الصورة بتتحوّل لطباعة (هاف تون نقط زي الجرايد للأشخاص، أو حفر/نقط حبر للأماكن والأشياء)
// على ورق دافئ، فتبان مرسومة ومتقصوصة من مجلة. بيتحسب مرة واحدة لكل صورة (مش كل إطار)
const INK = [28, 26, 24], PAPER = [244, 238, 224];
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

async function grayData(base, maxSide) {
  const { data, info } = await base.clone().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#fff' }).grayscale().normalise({ lower: 2, upper: 98 }).linear(1.18, -14).raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** هاف تون: شبكة نقط مايلة 45° حجم كل نقطة على قد غمق المكان (زي صور الجرايد) */
export function halftone({ data, w, h }, { cell = Math.max(6, Math.round(Math.max(w, h) / 115)), ink = INK, paper = PAPER } = {}) {
  const out = Buffer.alloc(w * h * 3), c = Math.SQRT1_2, half = cell / 2;
  const at = (x, y) => data[Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + y) * c, v = (y - x) * c;                     // إحداثيات مايلة
    const cu = Math.floor(u / cell) * cell + half, cv = Math.floor(v / cell) * cell + half;
    const cx = (cu - cv) * c, cy = (cu + cv) * c;                // مركز الخلية في الصورة
    const dark = 1 - at(cx, cy) / 255, r = half * 1.42 * Math.sqrt(dark);
    const d = Math.hypot(u - cu, v - cv), k = 1 - smooth(r - 0.7, r + 0.7, d);
    const o = (y * w + x) * 3;
    for (let j = 0; j < 3; j++) out[o + j] = paper[j] + (ink[j] - paper[j]) * k;
  }
  return out;
}

/** حفر/نقط حبر (stipple): نقط عشوائية ثابتة كثافتها على قد الغمق + خطوط الحواف — شكل رسم قلم حبر.
 *  الصورة بتتفتّح الأول (منحنى gamma) عشان الصور الغامقة متبقاش مليانة نقط */
export function engrave({ data, w, h }, { ink = INK, paper = PAPER } = {}) {
  const out = Buffer.alloc(w * h * 3);
  const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  let sum = 0, cnt = 0; for (let i = 0; i < data.length; i += 7) { sum += data[i]; cnt++; }
  const mean = sum / cnt / 255, gamma = mean < 0.5 ? Math.max(0.45, (mean / 0.5) * 0.9) : 1; // صورة غامقة → نفتّحها
  const g = (i) => Math.pow(data[i] / 255, gamma);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = g(i);
    const gx = g(i + (x < w - 1 ? 1 : 0)) - g(i - (x > 0 ? 1 : 0)), gy = g(y < h - 1 ? i + w : i) - g(y > 0 ? i - w : i);
    const edge = Math.min(1, Math.hypot(gx, gy) * 3);
    const dark = Math.pow(1 - v, 1.7);
    const k = Math.max(hash(x, y) < dark * 0.9 ? 0.9 : 0, smooth(0.28, 0.55, edge), v < 0.08 ? 1 : 0);
    const o = i * 3;
    for (let j = 0; j < 3; j++) out[o + j] = paper[j] + (ink[j] - paper[j]) * k;
  }
  return out;
}

const rawToUri = async (buf, w, h, { png = false } = {}) => {
  const img = sharp(buf, { raw: { width: w, height: h, channels: 3 } });
  const b = png ? await img.png({ palette: true, colors: 16, compressionLevel: 6 }).toBuffer() : await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return `data:image/${png ? 'png' : 'jpeg'};base64,${b.toString('base64')}`;
};

export async function toStoryImage(file) {
  // الصورة الملونة (إطارات/كولاج) صغيرة، والرمادي (ملء الشاشة) أكبر — فك الضغط كل إطار هو أغلى حاجة في الرندر
  const base = sharp(file, { failOn: 'none', limitInputPixels: 200e6 }).rotate();
  const color = await base.clone().resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const bw = await base.clone().resize({ width: 1700, height: 1700, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).grayscale().normalise().tint({ r: 236, g: 224, b: 200 }).jpeg({ quality: 74 }).toBuffer();
  // نسخ الكولاج الورقي: هاف تون للكروت، وحفر بالحبر بملء الشاشة
  const g1 = await grayData(base, 900), g2 = await grayData(base.clone().blur(0.6), 1500);
  const [uriHt, uriInk] = await Promise.all([rawToUri(halftone(g1), g1.w, g1.h, { png: true }), rawToUri(engrave(g2), g2.w, g2.h)]);
  return { uri: `data:image/jpeg;base64,${color.data.toString('base64')}`, uriBw: `data:image/jpeg;base64,${bw.toString('base64')}`, uriHt, uriInk, w: color.info.width, h: color.info.height };
}

/**
 * قصّ الخلفية بالكود (من غير AI): صور المنتجات/التماثيل "على خلفية بيضا/سادة" — بنملا الخلفية من حواف الصورة
 * (flood fill بسماحية لون) ونخلّيها شفافة، وبنقص على قد الجسم. لو الخلفية مش سادة → null (والمشهد بيعرض الصورة في كارت)
 * @returns {Promise<{ uriCut, cw, ch } | null>}
 */
export async function toCutout(file) {
  const { data, info } = await sharp(file, { failOn: 'none', limitInputPixels: 200e6 }).rotate().resize({ width: 760, height: 760, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const alpha = new Uint8Array(N);
  let transparent = 0; for (let i = 0; i < N; i++) { alpha[i] = data[i * 4 + 3]; if (alpha[i] < 20) transparent++; }
  if (transparent < N * 0.05) {
    // لون الخلفية = متوسط حواف الصورة، ولازم أغلب الحواف تبقى قريبة منه (خلفية سادة)
    const border = []; for (let x = 0; x < W; x++) border.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) border.push(y * W, y * W + W - 1);
    const med = [0, 1, 2].map(k => { const v = border.map(i => data[i * 4 + k]).sort((a, b) => a - b); return v[v.length >> 1]; });
    const dist = (i) => Math.abs(data[i * 4] - med[0]) + Math.abs(data[i * 4 + 1] - med[1]) + Math.abs(data[i * 4 + 2] - med[2]);
    const TOL = 54;
    if (border.filter(i => dist(i) < TOL).length < border.length * 0.82) return null;
    const bg = new Uint8Array(N), stack = [];
    for (const i of border) if (!bg[i] && dist(i) < TOL) { bg[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(), x = i % W, y = (i / W) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) if (j >= 0 && !bg[j] && dist(j) < TOL) { bg[j] = 1; stack.push(j); }
    }
    let fg = 0; for (let i = 0; i < N; i++) { alpha[i] = bg[i] ? 0 : 255; if (!bg[i]) fg++; }
    if (fg < N * 0.06 || fg > N * 0.9) return null;
    // حافة ناعمة: البكسلات اللي جنب الخلفية بتاخد نص شفافية
    const soft = Uint8Array.from(alpha);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!alpha[i]) continue; const n = (alpha[i - 1] ? 0 : 1) + (alpha[i + 1] ? 0 : 1) + (alpha[i - W] ? 0 : 1) + (alpha[i + W] ? 0 : 1); if (n) soft[i] = 255 - n * 48; }
    alpha.set(soft);
  }
  // قص على قد الجسم
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 - x0 < 40 || y1 - y0 < 40) return null;
  const out = Buffer.from(data); for (let i = 0; i < N; i++) out[i * 4 + 3] = alpha[i];
  const png = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png({ compressionLevel: 6 }).toBuffer({ resolveWithObject: true });
  return { uriCut: `data:image/png;base64,${png.data.toString('base64')}`, cw: png.info.width, ch: png.info.height };
}

/**
 * slots: [{ key, text, query, named, caption?, cutout? }] — key فريد لكل صورة
 * named = شخص/مكان/حدث بعينه → مسار اللوحة الصارم (لازم الصورة تحمل الاسم + تحقق LLM) وإلا الخانة بتتشال | غير كده ستوك عام بالترتيب العادي
 * @returns {{ images: Record<string,{uri,uriBw,w,h}>, credits: string[], missing: Set<string> }}
 */
export async function resolveVoxImages({ slots, ratio = '16:9', assetsDir, onProgress = () => {} }, deps = {}) {
  const images = {}, missing = new Set();
  if (!slots.length) return { images, credits: [], missing };
  const beats = slots.map((s, i) => ({ i, text: s.text || s.query, dur: 4 }));
  const plans = slots.map(s => (s.named
    ? { visual: 'text', queries: [s.query], kind: 'image', template: { name: 'photo_board', data: { photos: [{ query: s.query, caption: s.caption || '' }] } } }
    : { visual: 'stock', queries: [s.query, s.query.split(/\s+/).slice(0, 2).join(' ')].filter(Boolean), kind: 'image' }));
  const res = await (deps.resolveAssets || resolveAssets)({ beats, plans, ratio, assetsDir, onProgress: (p) => onProgress(p.total ? p.done / p.total : 0), brief: null }, deps.resolverDeps || {});
  const credits = [...(res.credits || [])];
  for (let i = 0; i < slots.length; i++) {
    const a = slots[i].named ? res.boards?.[i]?.[0] : res.assets?.[i];
    if (!a || a.kind === 'video' || !a.file || !fs.existsSync(a.file)) { missing.add(slots[i].key); continue; }
    try { images[slots[i].key] = await toStoryImage(a.file); if (slots[i].cutout) Object.assign(images[slots[i].key], await toCutout(a.file).catch(() => null) || {}); } catch (e) { console.warn(`[CodeVideo/images] ${slots[i].key}: ${e.message}`); missing.add(slots[i].key); }
  }
  try { fs.rmSync(assetsDir, { recursive: true, force: true }); } catch { /* temp */ }
  return { images, credits, missing };
}
