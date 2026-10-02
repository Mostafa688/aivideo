// تشغيل: node src/services/montage/selftest.mjs — بيبني مقاطع تركيبية (أحجام مختلفة، بصوت وبدون) ويتأكد إن المونتاج
// (انتقالات + مؤثرات + موسيقى + كابشن إنجليزي/عربي) بيطلع بنفس المدة المتوقعة وبدون أخطاء.
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { montageVideos, planTransitions, captionPosition } from './index.js';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'montage-selftest-'));
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
ff('-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=f=330:d=6', '-shortest', '-pix_fmt', 'yuv420p', `${D}/c1.mp4`);
ff('-f', 'lavfi', '-i', 'smptebars=size=720x1280:rate=30:duration=5', '-pix_fmt', 'yuv420p', `${D}/c2.mp4`);
ff('-f', 'lavfi', '-i', 'mandelbrot=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=f=440:d=5', '-t', '5', '-pix_fmt', 'yuv420p', `${D}/c3.mp4`);
const files = ['c1', 'c2', 'c3'].map(n => `${D}/${n}.mp4`);
const total = 16;

assert.deepEqual(planTransitions([6, 5, 5], 'none'), { d: 0, types: [] });
assert.equal(planTransitions([0.6, 5, 5], 'auto').d, 0, 'tiny clip → hard cuts');
assert.equal(captionPosition(30), 'center'); assert.equal(captionPosition(300), 'bottom'); assert.equal(captionPosition(300, 'center'), 'center');

const mk = (text) => text.split(' ').map((w, i) => ({ w, start: 0.3 + i * 0.5, end: 0.3 + i * 0.5 + 0.42 }));
for (const [name, opt, words, lang] of [
  ['transitions-en', { transitions: 'auto' }, mk('Every scene needs a strong beginning and a clear ending'), 'en'],
  ['cuts-ar', { transitions: 'none' }, mk('كل مشهد يحتاج إلى بداية قوية ونهاية واضحة'), 'ar'],
]) {
  const r = await montageVideos({ files, workDir: path.join(D, name), ...opt, words, captions: { style: 'karaoke', lang }, sfx: true });
  assert.ok(Math.abs(r.duration - total) < 0.3, `${name}: duration ${r.duration}`);
  assert.equal(r.width, 1280); assert.equal(r.height, 720);
  const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', r.file]).toString();
  assert.ok(streams.includes('video') && streams.includes('audio'));
  console.log(`${name} ok ${r.duration.toFixed(2)}s cuts=${r.cuts.map(c => c.toFixed(1))}`);
}
console.log('MONTAGE SELFTEST PASSED');
