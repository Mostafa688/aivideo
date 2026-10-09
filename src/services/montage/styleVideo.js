// ── styleVideo.js ── فيديو مرجعي لستايل موشن جرافيك ("اعمللي زي ده"): ألوانه من إطاراته، ووصف الحركة/الخطوط/التحولات من قارئ فيديو (مدفوع، Replicate)
// أو — لو مش متاح/فشل/مونتاج مجاني — من إطارات بتتوصف كصور. الناتج بنفس شكل تحليل صورة الستايل عشان styleFrom تستخدمه.
import fs from 'fs';
import path from 'path';
import { ffmpeg, rmQuiet } from '../documentary/ff.js';
import { imagePalette, describeStyleImage } from './assets.js';

const POINTS = [0.08, 0.25, 0.42, 0.58, 0.75, 0.92];
const TEMPLATE_NAMES = 'kinetic_text, stack_text, marker_text, lower_third, bullet_panel, bottom_sheet, side_note, news_bar, counter, quote, icon_pop, stamp, percent_ring';
export const VIDEO_STYLE_PROMPT = `This video is a MOTION-GRAPHICS reference the customer wants their own video's graphics to look like. Watch how things MOVE. Return ONLY JSON: {"summary":"<=60 words: layout, shapes, typography (bold condensed, handwritten, outlined…), colours, effects (glow, grain, 3D), and how elements animate (slide, pop, bounce, zoom, wipe, kinetic text) and how fast","templates":["2-4 names, best first, from: ${TEMPLATE_NAMES}"],"text":"readable text in it, or empty","energy":"calm|medium|high (pace of the motion and cuts)","transitions":"<=12 words about the transitions between graphics"}`;

const parseJson = (raw) => { try { return JSON.parse(String(raw).replace(/^\s*```(?:json)?|```\s*$/g, '').trim()); } catch { const m = /\{[\s\S]*\}/.exec(String(raw)); if (m) { try { return JSON.parse(m[0]); } catch { /* مش JSON */ } } return null; } };

/** read(file, prompt) → text (القارئ المدفوع) أو null. ask(file) → وصف إطار (للاختبار). */
export async function describeStyleVideo({ file, duration, workDir, read = null, ask = undefined }) {
  fs.mkdirSync(workDir, { recursive: true });
  const frames = [];
  for (let i = 0; i < POINTS.length; i++) {
    const f = path.join(workDir, `style_${i}.jpg`);
    try { await ffmpeg(['-ss', String(Math.max(0, duration * POINTS[i])), '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', f]); frames.push(f); } catch { /* إطار فاشل */ }
  }
  const out = { description: 'Motion-graphics style reference video', templates: [], palette: [], text: '', energy: undefined, source: 'frames' };
  try {
    const pals = []; for (const f of frames) pals.push(...(await imagePalette(f)));
    out.palette = pals.sort((a, b) => b.n - a.n).slice(0, 24);
  } catch (e) { console.warn('[StyleVideo] palette failed:', e.message); }
  let done = false;
  if (read) {
    try {
      const j = parseJson(await read(file, VIDEO_STYLE_PROMPT));
      if (j?.summary) {
        out.description = `${String(j.summary).slice(0, 420)}${j.transitions ? ` Transitions: ${String(j.transitions).slice(0, 90)}` : ''}`;
        out.templates = (Array.isArray(j.templates) ? j.templates : []).map(String).slice(0, 4); out.text = String(j.text || '').slice(0, 120);
        if (['calm', 'medium', 'high'].includes(j.energy)) out.energy = j.energy;
        out.source = 'video-model'; done = true;
      }
    } catch (e) { console.warn('[StyleVideo] video reader failed, falling back to frames:', e.message); }
  }
  if (!done) {
    const picks = [frames[1], frames[3], frames[4]].filter(Boolean).slice(0, 2);
    const parts = [];
    for (const f of picks) { try { const r = await describeStyleImage(f, { ask }); if (r) parts.push(r); } catch (e) { console.warn('[StyleVideo] frame vision skipped:', e.message); } }
    if (parts.length) {
      out.description = parts.map(p => String(p.summary || '')).filter(Boolean).join(' / ').slice(0, 420) || out.description;
      out.templates = [...new Set(parts.flatMap(p => (Array.isArray(p.templates) ? p.templates : []).map(String)))].slice(0, 4);
      out.text = String(parts.find(p => p.text)?.text || '').slice(0, 120);
    }
  }
  for (const f of frames) rmQuiet(f);
  return out;
}
