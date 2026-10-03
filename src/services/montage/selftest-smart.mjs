// تشغيل: node src/services/montage/selftest-smart.mjs [out.mp4] — 3 فيديوهات تركيبية (كلام + b-roll + طولي) بمخطط وتفريغ مُحاكيين
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { smartMontage, sanitizePlan, fallbackPlan, describeForPlanner } from './smartMontage.js';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'smart-selftest-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const tone = [[1, 5], [6, 11], [13, 19], [21, 27]].map(([a, b], i) => `sin(2*PI*${200 + i * 30}*t)*between(t,${a},${b})`).join('+');
ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=30', '-f', 'lavfi', '-i', `aevalsrc='0.4*(${tone})':s=44100:d=30`, '-shortest', '-pix_fmt', 'yuv420p', `${D}/talk.mp4`);
ff('-f', 'lavfi', '-i', 'mandelbrot=size=1280x720:rate=24', '-t', '20', '-pix_fmt', 'yuv420p', `${D}/broll.mp4`);
ff('-f', 'lavfi', '-i', 'smptebars=size=720x1280:rate=30:duration=12', '-f', 'lavfi', '-i', 'sine=f=300:d=12', '-shortest', '-pix_fmt', 'yuv420p', `${D}/vertical.mp4`);
const text = ['First we talk about the plan.', 'Then we show how it works.', 'Next comes the important detail.', 'And finally we wrap it up.'];
const spans = [[1, 5], [6, 11], [13, 19], [21, 27]];
const fake = []; spans.forEach(([a, b], i) => text[i].split(' ').forEach((w, k, arr) => fake.push({ w, start: a + (k * (b - a)) / arr.length, end: a + ((k + 1) * (b - a)) / arr.length - 0.03 })));
const assets = [
  { name: 'talk.mp4', file: `${D}/talk.mp4`, duration: 30, width: 1280, height: 720, hasAudio: true, analysis: { description: 'a person talking to the camera', hasSpeech: true } },
  { name: 'broll.mp4', file: `${D}/broll.mp4`, duration: 20, width: 1280, height: 720, hasAudio: false, analysis: { description: 'abstract fractal animation', hasSpeech: false } },
  { name: 'vertical.mp4', file: `${D}/vertical.mp4`, duration: 12, width: 720, height: 1280, hasAudio: true, analysis: { description: 'color bars, ambient tone', hasSpeech: false } },
];

// وحدة: تنظيف الخطة
const clipsStub = assets.map(a => ({ ...a, sentences: null }));
const bad = sanitizePlan({ segments: [{ clip: 'V9', start: 0, end: 5 }, { clip: 'V2', start: -3, end: 500, audio: 'keep', speed: 9 }, { clip: 'V1', start: 2, end: 2.2 }, { clip: 'V3', start: 1, end: 6, audio: 'mute', speed: 1.3 }] }, clipsStub);
assert.equal(bad.segments.length, 2); assert.equal(bad.segments[0].end, 20, 'clamped to clip length'); assert.equal(bad.segments[0].keep, false, 'no audio → cannot keep'); assert.ok(bad.segments[0].speed <= 1.5);
assert.equal(sanitizePlan({ segments: [] }, clipsStub), null);
assert.ok(fallbackPlan(clipsStub.map(c => ({ ...c, hasSpeech: !!c.analysis.hasSpeech }))).segments.length >= 3);
assert.ok(describeForPlanner([{ ...assets[0], hasSpeech: true, sentences: [{ start: 1, end: 5, words: fake.slice(0, 6) }] }]).includes('HAS SPEECH'));

const plan = { title: 'My day', style: 'fast', musicMood: 'upbeat', segments: [{ clip: 'V2', start: 3, end: 8, audio: 'mute', speed: 1.25 }, { clip: 'V1', start: 0.8, end: 27.4, audio: 'keep' }, { clip: 'V3', start: 0, end: 6, audio: 'keep' }, { clip: 'V2', start: 12, end: 17, audio: 'mute' }] };
for (const [name, ask] of [['ai-plan', async () => plan], ['fallback', async () => { throw new Error('llm down'); }]]) {
  const prog = [];
  const r = await smartMontage({ assets, workDir: path.join(D, name), instructions: 'make it energetic', options: { captions: 'karaoke', language: 'en' }, onProgress: (p) => prog.push(p.stage), deps: { ask, transcribe: async (wav) => (String(wav).includes('src_0') ? fake : []) } });
  console.log(name, 'plan source', r.plan.source, 'dur', r.duration.toFixed(1), 'segments', r.stats.segments, 'subs', r.stats.subs, 'words', r.words.length, 'speechShare', r.stats.speechShare);
  assert.ok(r.duration > 12 && r.duration < 70, `duration ${r.duration}`);
  assert.ok(r.words.length > 10, 'captions words mapped');
  assert.ok(r.words.every((w, i) => i === 0 || w.start >= r.words[i - 1].start - 0.01));
  const s = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'csv=p=0', r.file]).toString();
  assert.ok(s.includes('video') && s.includes('audio'));
  assert.ok(['ai', 'fallback'].includes(r.plan.source));
  if (process.argv[2] && name === 'ai-plan') fs.copyFileSync(r.file, process.argv[2]);
}
console.log('SMART MONTAGE SELFTEST PASSED');
