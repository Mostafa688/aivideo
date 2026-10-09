// تشغيل: node src/services/montage/selftest-stylevideo.mjs — فيديو مرجعي لستايل موشن جرافيك (قارئ فيديو مُحاكى) مش بيدخل كلقطة وبيأثر على الجرافيكس
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { smartMontage, styleFrom } from './smartMontage.js';
import { describeStyleVideo } from './styleVideo.js';
import { videoUnderstand } from '../visionService.js';
import { getVideoReadCreditCost } from '../creditPricingEngine.js';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'stylevid-selftest-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
// فيديو "ستايل": خلفية أحمر/برتقالي نابض (عشان البالِت تطلع حمراء مشبّعة)
ff('-f', 'lavfi', '-i', 'color=c=0xff2d55:s=640x360:d=6:r=25', '-vf', "drawbox=x='mod(t*200,640)':y=120:w=200:h=80:color=0xffb300:t=fill", '-pix_fmt', 'yuv420p', `${D}/style.mp4`);
ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=14', '-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*220*t)':s=44100:d=14", '-shortest', '-pix_fmt', 'yuv420p', `${D}/talk.mp4`);

assert.ok(getVideoReadCreditCost(20) >= 1 && getVideoReadCreditCost(20) <= 3, 'reader is cheap');

// قارئ الفيديو: النسخة اللي بتتبعت صغيرة وبدون صوت (_run بيحاكي استدعاء Replicate)
let sent = null;
const text = await videoUnderstand({ file: `${D}/talk.mp4`, prompt: 'p', _run: async (small) => { sent = { size: fs.statSync(small).size, streams: execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,height', '-of', 'csv=p=0', small]).toString() }; return 'ok'; } });
assert.equal(text, 'ok'); assert.ok(sent.streams.includes('video') && !sent.streams.includes('audio') && sent.streams.includes('480'), sent.streams);

// وصف ستايل من قارئ الفيديو
const read = async (file, prompt) => { assert.ok(prompt.includes('MOTION-GRAPHICS')); return '```json\n' + JSON.stringify({ summary: 'Bold red and amber slabs slide in fast with bouncy kinetic text', templates: ['kinetic_text', 'counter', 'nonsense'], text: 'WOW', energy: 'high', transitions: 'quick horizontal wipes' }) + '\n```'; };
const sv = await describeStyleVideo({ file: `${D}/style.mp4`, duration: 6, workDir: path.join(D, 'sv'), read });
assert.equal(sv.source, 'video-model'); assert.equal(sv.energy, 'high'); assert.ok(sv.palette.length > 0 && sv.description.includes('Transitions'));
// الفشل → إطارات
const sf = await describeStyleVideo({ file: `${D}/style.mp4`, duration: 6, workDir: path.join(D, 'sf'), read: async () => { throw new Error('boom'); }, ask: async () => ({ summary: 'red slabs', templates: ['stamp'] }) });
assert.equal(sf.source, 'frames'); assert.ok(sf.description.includes('red slabs'));
const st = styleFrom([], [sv]);
assert.deepEqual(st.templates, ['kinetic_text', 'counter']); assert.equal(st.energy, 'high');
const r0 = parseInt(st.theme.accent.slice(1, 3), 16); assert.ok(r0 > 200, 'accent takes the reference red/amber: ' + st.theme.accent);

// ── e2e: فيديو الستايل مش لقطة، والقارئ بيُستخدم، والـplanner بيشوف الوصف ──
const words = 'First we talk about the plan. Then we show how it works. Next comes the important detail.'.split(' ').map((w, i) => ({ w, start: 1 + i * 0.7, end: 1 + i * 0.7 + 0.6 }));
const assets = [
  { id: 'a'.repeat(16), name: 'talk.mp4', file: `${D}/talk.mp4`, duration: 14, width: 1280, height: 720, hasAudio: true, kind: 'video', analysis: { description: 'a person talking', hasSpeech: true } },
  { id: 'b'.repeat(16), name: 'style.mp4', file: `${D}/style.mp4`, duration: 6, width: 640, height: 360, hasAudio: false, kind: 'video', styleRef: true, analysis: null },
];
let plannerSaw = '';
const ask = async ({ system, user }) => { if (!String(system).includes('REPLACED')) plannerSaw += user; return String(system).includes('REPLACED') ? { cutaways: [] } : { title: 'T', style: 'fast', musicMood: 'upbeat', segments: [{ clip: 'V1', start: 0, end: 14, audio: 'keep' }] }; };
const run = (name, styleVideoRead) => smartMontage({ assets, workDir: path.join(D, name), instructions: 'like my reference', options: { captions: 'karaoke', language: 'en' }, deps: { ask, transcribe: async () => words, styleVideoRead, styleFrameAsk: async () => ({ summary: 'frame style', templates: ['stamp'] }) } });
const a1 = await run('paid', read);
console.log('paid:', a1.styleSource, a1.styleReaderUsed, 'clips', a1.clips.length);
assert.equal(a1.clips.length, 1, 'style video is not footage'); assert.equal(a1.styleReaderUsed, true); assert.equal(a1.styleSource, 'video');
assert.ok(plannerSaw.includes('slide in fast'), 'planner saw the style description');
const a2 = await run('free', null);
assert.equal(a2.styleReaderUsed, false); assert.equal(a2.styleSource, 'video'); assert.equal(a2.clips.length, 1);
const a3 = await run('broken', async () => { throw new Error('replicate down'); });
assert.equal(a3.styleReaderUsed, false, 'reader failure → frames fallback (fee refunded by the job)');
console.log('STYLE VIDEO SELFTEST OK');
