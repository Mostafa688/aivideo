// ── uploadPackage.js ── حزمة النشر لفيلم الاستوديو: ملف ترجمة SRT، فصول يوتيوب، وصف فيه سطور المصادر
// والتراخيص، عنوان وكلمات مفتاحية (Groq)، وصورة مصغرة بنص جذّاب فوق لقطة من الفيلم نفسه.
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { llmJson } from './llm.js';
import { groupWords } from './captions.js';
import { esc, isRtlLang } from './textutil.js';

const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
export const srtTime = (s) => { s = Math.max(0, s); return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)},${pad(Math.round((s % 1) * 1000), 3).slice(0, 3)}`; };
export const ytTime = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`; };

/** words: [{w,start,end}] → نص SRT (أسطر قصيرة بنفس منطق تجميع الكابشن) */
export function buildSrt(words, { maxChars = 42 } = {}) {
  const groups = groupWords(words, { maxWords: 9, maxChars, maxDur: 4.5, gap: 0.7 });
  return groups.map((g, i) => `${i + 1}\n${srtTime(g[0].start)} --> ${srtTime(Math.max(g[g.length - 1].end, g[0].start + 0.4))}\n${g.map(x => x.w).join(' ')}\n`).join('\n');
}

/** فصول يوتيوب صالحة: أولها 0:00، 3 فصول على الأقل، كل فصل ≥ 10 ثواني — وإلا بنرجّع [] */
export function normalizeChapters(chapters, duration) {
  const list = (chapters || []).filter(c => c && c.title).map(c => ({ t: Math.max(0, c.t), title: String(c.title).slice(0, 80) })).sort((a, b) => a.t - b.t);
  if (!list.length) return [];
  if (list[0].t > 1) list.unshift({ t: 0, title: 'Intro' }); else list[0].t = 0;
  const out = [];
  for (const c of list) { if (!out.length || c.t - out[out.length - 1].t >= 10) out.push(c); }
  if (out.length && duration - out[out.length - 1].t < 10) out.pop();
  return out.length >= 3 ? out : [];
}

const SYSTEM = `You write the YouTube upload metadata for a finished documentary video. Return ONLY JSON: {"title":"<=90 chars, specific, keyword first, no clickbait lies","description":"3 short paragraphs for real viewers: a hook sentence containing the main keyword (it shows in search results), what the film covers, a soft call to subscribe — no hashtags, no timestamps, no credits (added separately)","tags":["8-15 specific search phrases a viewer would type, no hashtags, no duplicates, most important first"],"thumbnailText":"1-3 powerful words for the thumbnail (max 22 characters), same language as the title"}. Use the video's own language and dialect.`;

export async function buildPackage({ title, script, language, chapters, credits, duration, ask = llmJson }) {
  let meta;
  try {
    meta = await ask({ system: SYSTEM, user: `Language: ${language}\nWorking title: ${title}\nScript (excerpt):\n${String(script || '').slice(0, 5000)}`, maxTokens: 1500, temperature: 0.4 });
  } catch (e) {
    console.warn('[Documentary/package] LLM failed, using basic metadata:', e.message);
    meta = {};
  }
  const cleanTitle = String(meta.title || title || 'Documentary').trim().slice(0, 100);
  const tags = [...new Set((Array.isArray(meta.tags) ? meta.tags : []).map(t => String(t).replace(/^#/, '').trim()).filter(Boolean))].slice(0, 15);
  const thumbText = String(meta.thumbnailText || '').trim().slice(0, 22) || cleanTitle.split(/\s+/).slice(0, 3).join(' ');
  const blocks = [String(meta.description || cleanTitle).trim()];
  const ch = normalizeChapters(chapters, duration || 0);
  if (ch.length) blocks.push(ch.map(c => `${ytTime(c.t)} ${c.title}`).join('\n'));
  const creditLines = [...new Set((credits || []).map(String).filter(Boolean))];
  if (creditLines.length) {
    const nasa = creditLines.some(c => /nasa/i.test(c));
    blocks.push(`Footage & photo credits:\n${creditLines.slice(0, 40).join('\n')}${nasa ? '\n\nNASA media is used for informational purposes; NASA does not endorse this video.' : ''}`);
  }
  return { title: cleanTitle, description: blocks.join('\n\n'), tags, thumbnailText: thumbText, chapters: ch };
}

async function readImage(urlOrPath) {
  if (/^https?:\/\//i.test(urlOrPath)) {
    const res = await fetch(urlOrPath);
    if (!res.ok) throw new Error(`thumbnail fetch failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(path.join(process.cwd(), urlOrPath.replace(/^\//, '')));
}

/** صورة مصغرة 1280×720: لقطة من الفيلم + تدرّج غامق + نص كبير بحدود */
export async function composeThumbnail(srcUrl, text, { lang = 'en' } = {}) {
  const W = 1280, H = 720;
  const base = await sharp(await readImage(srcUrl), { failOn: 'none' }).resize(W, H, { fit: 'cover', position: 'attention' }).modulate({ saturation: 1.25, brightness: 0.95 }).toBuffer();
  const rtl = isRtlLang(lang);
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [words.join(' ')];
  const size = lines.length > 1 ? 150 : 180;
  const font = rtl ? "'Noto Naskh Arabic', sans-serif" : "'Noto Sans', sans-serif";
  const textSvg = lines.map((ln, i) => {
    const y = H - 200 - (lines.length - 1 - i) * (size * 1.05); // فوق منطقة الكابشن المحروق في اللقطة
    return `<text x="${rtl ? W - 60 : 60}" y="${y}" text-anchor="${rtl ? 'end' : 'start'}" font-family="${font}" font-size="${size}" font-weight="900" fill="${i === lines.length - 1 ? '#FFD60A' : '#FFFFFF'}" stroke="#000" stroke-width="14" stroke-linejoin="round" paint-order="stroke">${esc(ln.toUpperCase())}</text>`;
  }).join('');
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/>${textSvg}</svg>`);
  return sharp(base).composite([{ input: overlay }]).jpeg({ quality: 88 }).toBuffer();
}
