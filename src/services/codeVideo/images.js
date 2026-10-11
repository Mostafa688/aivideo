// ── images.js ── نمط Vox فقط: بيجيب صور حقيقية من الأرشيف/الستوك (نفس مصادر الأفلام الوثائقية + نفس فلتر الصلة الصارم للأشخاص والأماكن)
// وبيجهّزها لتتحط جوه الـSVG (JPEG صغير base64 + نسخة رمادي دافئ للصورة بملء الشاشة)
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { resolveAssets } from '../documentary/resolver.js';

async function toStoryImage(file) {
  // الصورة الملونة (إطارات/كولاج) صغيرة، والرمادي (ملء الشاشة) أكبر — فك الضغط كل إطار هو أغلى حاجة في الرندر
  const base = sharp(file, { failOn: 'none', limitInputPixels: 200e6 }).rotate();
  const color = await base.clone().resize({ width: 1100, height: 1100, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const bw = await base.clone().resize({ width: 1700, height: 1700, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).grayscale().normalise().tint({ r: 236, g: 224, b: 200 }).jpeg({ quality: 74 }).toBuffer();
  return { uri: `data:image/jpeg;base64,${color.data.toString('base64')}`, uriBw: `data:image/jpeg;base64,${bw.toString('base64')}`, w: color.info.width, h: color.info.height };
}

/**
 * slots: [{ key, text, query, named, caption? }] — key فريد لكل صورة
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
    try { images[slots[i].key] = await toStoryImage(a.file); } catch (e) { console.warn(`[CodeVideo/images] ${slots[i].key}: ${e.message}`); missing.add(slots[i].key); }
  }
  try { fs.rmSync(assetsDir, { recursive: true, force: true }); } catch { /* temp */ }
  return { images, credits, missing };
}
