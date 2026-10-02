// تشغيل: node src/services/documentary/selftest.mjs [en|ar] [16:9|9:16] — بيبني فيلم قصير من أصول تركيبية
// (لقطة اختبار + صورة + سرد صناعي) ويتأكد إن كل القوالب والكابشن والصوت بيشتغلوا على الجهاز ده.
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { renderDocumentary } from './index.js';

const lang = process.argv[2] || 'en';
const ratio = process.argv[3] || '16:9';
const D = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-selftest-'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=6', '-pix_fmt', 'yuv420p', path.join(D, 'footage.mp4')]);
await sharp({ create: { width: 1800, height: 1200, channels: 3, background: '#556' } }).png().toFile(path.join(D, 'photo.png'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=f=220:d=12', '-ar', '44100', '-ac', '2', path.join(D, 'narr.wav')]);
const ar = lang === 'ar';
const text = ar ? 'هذا اختبار ذاتي لمحرك الأفلام الوثائقية يعمل بشكل سليم' : 'This is a self test of the documentary engine working properly';
const ws = text.split(' ');
const words = ws.map((w, i) => ({ w, start: (i * 12) / ws.length, end: ((i + 1) * 12) / ws.length - 0.05 }));
const timeline = {
  ratio, lang, theme: 'cinematic', narrationFile: path.join(D, 'narr.wav'), captions: { words, style: 'karaoke' },
  beats: [
    { dur: 3, visual: { kind: 'background' }, overlays: [{ template: 'title_card', data: { title: ar ? 'اختبار' : 'Self test' }, at: 0, dur: 3 }] },
    { dur: 3, visual: { kind: 'video', file: path.join(D, 'footage.mp4'), grade: 'warm' }, overlays: [{ template: 'lower_third', data: { name: ar ? 'اسم' : 'Name', role: ar ? 'وصف' : 'Role' }, at: 0.4, dur: 2.4 }], transitionIn: 'flash' },
    { dur: 3, visual: { kind: 'image', file: path.join(D, 'photo.png'), grade: 'bw_archive' }, overlays: [{ template: 'counter', data: { value: 1234 }, at: 0, dur: 3 }] },
    { dur: 3, visual: { kind: 'background' }, overlays: [{ template: 'bar_chart', data: { items: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }] }, at: 0, dur: 3 }] },
  ],
};
const r = await renderDocumentary({ timeline, workDir: path.join(D, 'work') });
console.log(`OK ${r.duration.toFixed(1)}s ${r.width}x${r.height} failures=${r.failures.length} → ${r.file}`);
if (r.failures.length) { console.error(r.failures); process.exit(1); }
