// تشغيل: node src/services/montage/selftest-autoedit.mjs — فيديو تركيبي فيه كلام (نغمات) وفجوات صمت، بتفريغ مُحاكى
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { autoEditVideo, splitSentences, planCuts, zoomPlan } from './autoEdit.js';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'autoedit-selftest-'));
// الكلام: [بداية، نهاية] بالثواني — بينهم فجوات 0.8 / 2.0 / 0.5 / 3.0
const spans = [[1.0, 4.0], [4.8, 8.0], [10.0, 14.0], [14.5, 18.0], [21.0, 26.0]];
const total = 28;
const tone = spans.map(([a, b], i) => `sin(2*PI*${200 + i * 40}*t)*between(t,${a},${b})`).join('+');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=25:duration=${total}`, '-f', 'lavfi', '-i', `aevalsrc='0.4*(${tone})':s=44100:d=${total}`, '-shortest', '-pix_fmt', 'yuv420p', `${D}/in.mp4`]);
const text = ['First we cover the basics.', 'Then comes the interesting part of it.', 'Now a new topic starts here.', 'It has two clear steps to follow.', 'Finally we wrap everything up nicely.'];
const fake = [];
spans.forEach(([a, b], i) => { const ws = text[i].split(' '); ws.forEach((w, k) => fake.push({ w, start: a + (k * (b - a)) / ws.length, end: a + ((k + 1) * (b - a)) / ws.length - 0.03 })); });

const sentences = splitSentences(fake);
assert.equal(sentences.length, 5);
const cuts = planCuts(sentences, total);
assert.ok(cuts.length >= 3 && cuts.length <= 5, 'silence ≥0.35s cut: ' + cuts.length);
assert.equal(planCuts(sentences, total, { cutSilence: false }).length, 1);
assert.equal(zoomPlan(4, true)[1][0], 1.14);

const progress = [];
const r = await autoEditVideo({ file: `${D}/in.mp4`, workDir: path.join(D, 'w'), language: 'en', options: { captions: 'karaoke', transitions: true }, deps: { transcribe: async () => fake }, onProgress: (p) => progress.push(p.stage) });
console.log('stats', JSON.stringify(r.stats), 'words', r.words.length, 'chapters', r.chapters.length);
assert.ok(r.stats.finalSec < total - 3, 'silence removed');
assert.equal(r.words.length, fake.length);
assert.ok(r.words.every((w, i) => i === 0 || w.start >= r.words[i - 1].start - 0.001), 'words monotonic');
assert.ok(r.words[r.words.length - 1].end <= r.duration + 0.05);
assert.ok(r.chapters.length >= 2);
const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', r.file]).toString();
assert.ok(streams.includes('video') && streams.includes('audio'));
fs.copyFileSync(r.file, process.argv[2] || path.join(D, 'out.mp4'));
console.log('AUTOEDIT SELFTEST PASSED', r.file);
