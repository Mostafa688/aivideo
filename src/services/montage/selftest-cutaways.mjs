// تشغيل: node src/services/montage/selftest-cutaways.mjs [out.mp4] — مشاهد الموشن 3D اللي بتحل محل لقطات والصوت بيكمّل (LLM مُحاكى)
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { sanitizeScene } from './motionScenes.js';
import { sanitizeCutaways, fallbackCutaways, cutawayBudget, planCutaways } from './cutaways.js';
import { smartMontage } from './smartMontage.js';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'cutaways-selftest-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
const probe = (f, e) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-select_streams', e, '-show_entries', 'stream=duration', '-of', 'csv=p=0', f]).toString());

// ── كلام مُحاكى: 4 جمل على 32 ثانية ──
const sents = [
  [2.5, 6.5, 'We tested three tools and the winner saved 40 percent of the time'],
  [13, 17, 'There are three steps: plan, record, and publish'],
  [23, 27, 'Cheap tools versus premium tools makes a huge difference'],
  [28.5, 31, 'The key idea is consistency every single day'],
];
const words = []; const sentences = [];
for (const [a, b, t] of sents) { const ws = t.split(' '); const w = ws.map((x, k) => ({ w: x, start: a + (k * (b - a)) / ws.length, end: a + ((k + 1) * (b - a)) / ws.length - 0.03 })); words.push(...w); sentences.push({ start: a, end: b, words: w }); }
const clip = { name: 'talk.mp4', duration: 32, hasSpeech: true, words, sentences };

// ── وحدة: تأريض المشاهد في الكلام ──
const said = 'We tested three tools and the winner saved 40 percent of the time';
assert.equal(sanitizeScene({ type: 'stat', data: { value: 40, suffix: '%', label: 'time saved' } }, said)?.type, 'stat');
assert.equal(sanitizeScene({ type: 'stat', data: { value: 73, suffix: '%', label: 'invented' } }, said), null, 'a number nobody said is rejected');
assert.equal(sanitizeScene({ type: 'headline', data: { text: 'Quantum blockchain revolution' } }, said), null, 'ungrounded headline rejected');
assert.equal(sanitizeScene({ type: 'headline', data: { text: 'winner saved 40 percent' } }, said)?.type, 'headline');
assert.equal(sanitizeScene({ type: 'nope', data: {} }, said), null);

// ── وحدة: التوقيت والتباعد والحدود ──
const raw = [
  { clip: 'V1', start: 2.6, end: 6.4, scene: { type: 'stat', data: { value: 40, suffix: '%', label: 'time saved' } } },
  { clip: 'V1', start: 0.2, end: 3, scene: { type: 'headline', data: { text: 'We tested' } } }, // أول ثانيتين
  { clip: 'V1', start: 13.2, end: 16.8, scene: { type: 'list', data: { items: ['plan', 'record', 'publish'] } } },
  { clip: 'V1', start: 14, end: 17.5, scene: { type: 'headline', data: { text: 'three steps' } } }, // قريب جدًا
  { clip: 'V1', start: 23.1, end: 26.5, scene: { type: 'compare', data: { left: 'Cheap tools', right: 'premium tools' } } },
  { clip: 'V9', start: 23, end: 26, scene: { type: 'headline', data: { text: 'x' } } },
];
const ok = sanitizeCutaways(raw, [clip], { max: 8, gap: 6 });
console.log('sanitized:', ok.map(o => `${o.scene.type}@${o.start}-${o.end}`).join(' '));
assert.deepEqual(ok.map(o => o.scene.type), ['stat', 'list', 'compare']);
assert.ok(ok.every(o => o.end - o.start >= 1.8 && o.end - o.start <= 5.2 && o.start >= 2 && o.end <= 30.5));
assert.equal(cutawayBudget([{ hasSpeech: false, duration: 40 }]), 0, 'no speech → no cutaways');
assert.equal(cutawayBudget([clip]), 2); assert.equal(cutawayBudget([clip], { dense: true }), 4);

// ── وحدة: الخطة الاحتياطية بتطلع مشاهد صالحة من الكلام نفسه ──
const fb = fallbackCutaways([clip], { dense: true });
console.log('fallback:', fb.map(o => `${o.scene.type}@${o.start}-${o.end}`).join(' '));
assert.ok(fb.length >= 2 && fb.every(o => o.start >= 2 && o.end <= 30.5));
assert.ok(fb.some(o => o.scene.type === 'stat' && o.scene.data.value === 40), 'the spoken number becomes a stat scene');
const viaThrow = await planCutaways({ clips: [clip], ask: async () => { throw new Error('llm down'); } });
assert.ok(viaThrow.length >= 1, 'LLM failure → fallback');

// ── e2e: الصوت بيكمّل، الطول ثابت، الكابشن مخفي أثناء المشهد ──
ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=32', '-f', 'lavfi', '-i', `aevalsrc='0.4*sin(2*PI*220*t)':s=44100:d=32`, '-shortest', '-pix_fmt', 'yuv420p', `${D}/talk.mp4`);
const assets = [{ name: 'talk.mp4', file: `${D}/talk.mp4`, duration: 32, width: 1280, height: 720, hasAudio: true, analysis: { description: 'a person talking', hasSpeech: true } }];
const mkAsk = (cut) => async ({ system }) => (String(system).includes('REPLACED') ? { cutaways: cut } : { title: 'Talk', style: 'fast', musicMood: 'upbeat', segments: [{ clip: 'V1', start: 0, end: 32, audio: 'keep' }] });
const run = async (name, cut, options = {}) => smartMontage({ assets, workDir: path.join(D, name), instructions: 'professional', options: { captions: 'karaoke', language: 'en', ...options }, deps: { ask: mkAsk(cut), transcribe: async () => words } });
const r = await run('on', raw);
console.log('with scenes: dur', r.duration.toFixed(1), 'scenes', r.stats.scenes);
assert.equal(r.stats.scenes, 2, 'budget = speech/12s');
assert.ok(Math.abs(probe(r.file, 'a:0') - probe(r.file, 'v:0')) < 0.25, 'audio and video lengths match');
assert.ok(r.duration > 28 && r.duration < 36, `duration ${r.duration}`);
const off = await run('off', raw, { cutaways: false });
assert.equal(off.stats.scenes, 0, 'cutaways:false disables the scenes');
const tr = await run('tr', raw, { mode: 'transitions' });
assert.equal(tr.stats.scenes, 0, 'transitions mode never replaces footage');
if (process.argv[2]) fs.copyFileSync(r.file, process.argv[2]);
console.log('CUTAWAYS SELFTEST OK');
