// تشغيل: node src/services/montage/selftest-modes.mjs — وضع "انتقالات بس" + فيديو طويل بمشاهد مكتشفة مع فويس-أوفر (مخطط وتفريغ مُحاكيين)
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { smartMontage, sanitizeVoicePlan, planVoiceover, sfxConfig } from './smartMontage.js';
import { analyzeScenes } from './assets.js';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'modes-selftest-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);

// ── 1) انتقالات بس: 3 مقاطع بصوتها، من غير قص/زوم/جرافيكس/كابشن، بنفس الترتيب والطول ──
const lens = [6, 5, 4];
['a', 'b', 'c'].forEach((n, i) => ff('-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30:duration=${lens[i]}`, '-f', 'lavfi', '-i', `sine=f=${300 + i * 100}:d=${lens[i]}`, '-shortest', '-pix_fmt', 'yuv420p', `${D}/${n}.mp4`));
const assets = ['a', 'b', 'c'].map((n, i) => ({ name: `${n}.mp4`, file: `${D}/${n}.mp4`, duration: lens[i], width: 1280, height: 720, hasAudio: true, kind: 'video', analysis: { description: `clip ${n}`, hasSpeech: false } }));
let asked = false;
const r = await smartMontage({ assets, workDir: path.join(D, 't'), instructions: 'just transitions', options: { mode: 'transitions', captions: 'none', cutSilence: false, zoom: false, motionGraphics: false, language: 'en' }, deps: { ask: async () => { asked = true; return {}; }, transcribe: async () => [] } });
console.log('transitions: plan', r.plan.source, 'dur', r.duration.toFixed(1), 'segments', r.stats.segments, 'punchIns', r.stats.punchIns, 'graphics', r.stats.graphics);
assert.equal(r.plan.source, 'transitions'); assert.equal(asked, false, 'no LLM planning in transitions mode');
assert.equal(r.stats.segments, 3); assert.equal(r.stats.punchIns, 0); assert.equal(r.stats.graphics, 0);
assert.ok(r.duration > 12 && r.duration <= 15.2, `duration ${r.duration}`);

// ── 1b) مستوى المؤثرات الصوتية بيتغيّر مع رغبة العميل: none / light / normal / heavy بيدّوا صوت مختلف ──
assert.deepEqual(sfxConfig('none'), { level: 'none', on: false, gain: 1 }); assert.equal(sfxConfig('heavy').gain, 1.35); assert.equal(sfxConfig('whatever').level, 'normal');
const audioHash = (f) => execFileSync('sh', ['-c', `ffmpeg -v error -i "${f}" -vn -f s16le -ac 1 -ar 22050 - | md5sum`]).toString().split(' ')[0];
const hashes = {};
for (const lvl of ['none', 'light', 'normal', 'heavy']) {
  const rr = await smartMontage({ assets, workDir: path.join(D, 'sfx_' + lvl), instructions: 'just transitions', options: { mode: 'transitions', captions: 'none', cutSilence: false, zoom: false, motionGraphics: false, language: 'en', sfx: lvl, musicFile: null }, deps: { ask: async () => ({}), transcribe: async () => [] } });
  hashes[lvl] = audioHash(rr.file);
}
console.log('sfx levels distinct:', new Set(Object.values(hashes)).size);
assert.equal(new Set(Object.values(hashes)).size, 4, 'each sound-effects level renders different audio');

// ── 2) فيديو طويل بمشاهد + فويس-أوفر: المشاهد بتتكتشف والمخطط يشوفها والبداية بتتظبط على بداية مشهد ──
ff('-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=3:r=25', '-f', 'lavfi', '-i', 'testsrc2=s=320x240:d=4:r=25', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=2:r=25', '-f', 'lavfi', '-i', 'mandelbrot=s=320x240:r=25',
  '-filter_complex', '[3:v]trim=duration=3,setpts=PTS-STARTPTS[m];[0:v][1:v][2:v][m]concat=n=4:v=1:a=0,format=yuv420p', `${D}/long.mp4`);
const scenes = await analyzeScenes(`${D}/long.mp4`, 12, { sceneVision: async (urls, use) => JSON.stringify({ scenes: use.map((_, i) => ({ i, what: ['a red intro card', 'a test pattern with a moving ball', 'a blue card', 'a fractal zoom'][i] })) }) });
assert.equal(scenes.length, 4);
const VD = 14;
ff('-f', 'lavfi', '-i', `aevalsrc='0.35*sin(2*PI*180*t)*between(mod(t,4),0,3.1)':s=44100:d=${VD}`, '-c:a', 'libmp3lame', `${D}/voice.mp3`);
const words = []; for (let i = 0; i < 28; i++) words.push({ w: ['this', 'is', 'the', 'story', 'now'][i % 5], start: 0.2 + i * 0.48, end: 0.2 + i * 0.48 + 0.4 });
const narr = { words, duration: VD, sentences: [{ start: 0, end: 7, words: words.slice(0, 14) }, { start: 7, end: VD, words: words.slice(14) }] };
const clip = { name: 'long.mp4', file: `${D}/long.mp4`, duration: 12, width: 320, height: 240, hasAudio: false, analysis: { description: 'a video made of several scenes', scenes } };
let seen = '';
const plan = await planVoiceover({ clips: [clip], narr, ask: async ({ user }) => { seen = user; return { style: 'fast', shots: [{ clip: 'V1', start: 3.4, until: 4.9 }, { clip: 'V1', start: 7.2, until: 9.6 }, { clip: 'V1', start: 9.1, until: VD }] }; } });
console.log('planner saw scenes:', seen.includes('4 scenes') && seen.includes('fractal zoom'), '| starts', plan.shots.map(s => s.start));
assert.ok(seen.includes('a fractal zoom')); assert.equal(plan.source, 'ai');
assert.equal(plan.shots[0].start, 3.05, 'start snapped to the scene start'); assert.equal(plan.shots[1].start, 7.05);
const vr = await smartMontage({ assets: [{ ...clip, kind: 'video' }, { kind: 'audio', name: 'voice.mp3', file: `${D}/voice.mp3`, duration: VD, hasAudio: true, analysis: { words: words.map(w => [w.w, w.start, w.end]) } }], workDir: path.join(D, 'v'), options: { captions: 'none', language: 'en', graphicsLevel: 'high' }, deps: { ask: async () => ({ style: 'fast', shots: [{ clip: 'V1', start: 3.4, until: 7 }, { clip: 'V1', start: 0, until: VD }] }), transcribe: async () => words } });
console.log('long video + voiceover: dur', vr.duration.toFixed(1), 'plan', vr.plan.source);
assert.ok(Math.abs(vr.duration - VD) < 1.0, `duration ${vr.duration}`);
console.log('MODES SELFTEST PASSED'); process.exit(0);
