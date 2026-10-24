// ── adix/musicBeats.js ── مكتبة الموسيقى بالإيقاع: سرعة كل تراك (BPM) ومكان أول بيت، عشان Opus يقطع ويحرّك على البيت
// (إعلانات fast-paced). التحليل بيتعمل مرة واحدة لكل تراك (ffmpeg → عيّنات → onset envelope → autocorrelation) ويتخزن.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';

const DIR = path.join(process.cwd(), 'assets', 'music');
const CACHE = path.join(os.tmpdir(), 'adix_music_beats_v2.json');
const SR = 11025, HOP = 256, WIN = 1024;
export const TRACK_TAGS = {
  'American Frontiers - Aaron Kenny.mp3': ['adventure', 'hopeful', 'journey', 'travel'],
  'Chase The Sun - Bel Tempo.mp3': ['upbeat', 'energetic', 'uplifting', 'positive'],
  'Civic - The Grey Room & Density & Time.mp3': ['tense', 'corporate', 'modern', 'serious'],
  'Claim of Thrones - RKVC.mp3': ['epic', 'grand', 'royal', 'dramatic'],
  'Defying Gravity - Density & Time.mp3': ['epic', 'uplifting', 'triumphant', 'motivational'],
  'Duty Calls - Rod Kim.mp3': ['dramatic', 'determined', 'action', 'serious'],
  'Final Boss - Myuu.mp3': ['intense', 'dark', 'battle', 'aggressive'],
  'Final Soliloquy - Asher Fulero.mp3': ['emotional', 'piano', 'reflective', 'calm'],
  'How To Train Your Dragnet - Ezra Lipp.mp3': ['playful', 'quirky', 'comedic', 'funny'],
  'Images of Tomorrow - Unicorn Heads.mp3': ['futuristic', 'tech', 'inspiring', 'modern'],
  'Lullabye No.108 - The Mini Vandals.mp3': ['calm', 'gentle', 'soft', 'relaxing'],
  'Monument - TrackTribe.mp3': ['epic', 'cinematic', 'majestic', 'luxury'],
  'Oceans, Rivers, Canyons - ELPHNT.mp3': ['nature', 'ambient', 'calm', 'organic'],
  'On The Flip - The Grey Room _ Density & Time.mp3': ['mysterious', 'suspense', 'dark', 'cool'],
  'Standoff - Density & Time.mp3': ['tense', 'dramatic', 'action', 'suspense'],
  'The Dance Before - Nathan Moore.mp3': ['light', 'fun', 'cheerful', 'playful'],
  "We'll Meet Again - Jeremy Blake.mp3": ['nostalgic', 'warm', 'emotional', 'hopeful'],
};

function decode(file, seconds = 75) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-t', String(seconds), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 }, (err, out) => {
      if (err) return reject(err);
      resolve(new Float32Array(out.buffer, out.byteOffset, Math.floor(out.length / 4)));
    });
  });
}

/** BPM + أول بيت (ثانية) */
export async function analyzeBeats(file) {
  const x = await decode(file);
  const n = Math.floor((x.length - WIN) / HOP); if (n < 50) return null;
  // طاقة كل فريم بعد فلتر بسيط يبرز الضربات (فرق العينات = high-pass)، وبعدين الزيادة الموجبة = onset
  const env = new Float32Array(n);
  let prevE = 0;
  for (let i = 0; i < n; i++) {
    let e = 0; const o = i * HOP;
    for (let k = 1; k < WIN; k++) { const d = x[o + k] - x[o + k - 1]; e += d * d; }
    e = Math.log1p(e * 50);
    env[i] = Math.max(0, e - prevE); prevE = e;
  }
  const mean = env.reduce((a, v) => a + v, 0) / n;
  for (let i = 0; i < n; i++) env[i] = Math.max(0, env[i] - mean);
  const fps = SR / HOP;
  let best = { score: -1, lag: 0 };
  for (let bpm = 70; bpm <= 180; bpm += 0.25) {
    const lag = (60 / bpm) * fps; let s = 0;
    for (let i = 0; i + lag * 4 < n; i++) { const a = env[i]; s += a * (env[Math.round(i + lag)] + 0.5 * env[Math.round(i + lag * 2)] + 0.25 * env[Math.round(i + lag * 4)]); }
    // تفضيل خفيف لسرعات الإعلانات الشائعة (90–140)
    s *= bpm >= 90 && bpm <= 140 ? 1.06 : 1;
    if (s > best.score) best = { score: s, lag, bpm };
  }
  let ph = { s: -1, p: 0 };
  for (let p = 0; p < best.lag; p++) { let s = 0; for (let i = p; i < n; i += best.lag) s += env[Math.round(i)] || 0; if (s > ph.s) ph = { s, p }; }
  // الفريم i بيبدأ يشوف الضربة لما نهاية نافذته توصلها → الوقت الحقيقي = بداية الفريم + طول النافذة تقريبًا
  const period = 60 / best.bpm;
  return { bpm: best.bpm, firstBeat: +(((ph.p / fps) + (WIN * 0.9) / SR) % period).toFixed(3) };
}

let memo = null;
/** كل التراكات بتحليلها (مع كاش) */
export async function musicLibrary() {
  if (memo) return memo;
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { /* أول مرة */ }
  const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.mp3')) : [];
  const out = [];
  for (const f of files) {
    if (!cache[f]) { try { cache[f] = await analyzeBeats(path.join(DIR, f)); } catch (e) { cache[f] = null; console.warn('[Adix] beat analysis failed:', f, e.message); } }
    if (cache[f]) out.push({ file: f, name: f.replace(/\.mp3$/i, ''), tags: TRACK_TAGS[f] || [], ...cache[f] });
  }
  try { fs.writeFileSync(CACHE, JSON.stringify(cache)); } catch { /* مش مهم */ }
  memo = out; return out;
}
export const musicPath = (file) => path.join(DIR, path.basename(file));

/** أوقات البيتس داخل الإعلان (لو الموسيقى بتبدأ من الثانية from في التراك) */
export function beatTimes(track, from = 0, duration = 30) {
  const step = 60 / track.bpm; const out = [];
  let t = track.firstBeat; while (t < from) t += step;
  for (; t - from <= duration && out.length < 200; t += step) out.push(+(t - from).toFixed(2));
  return out;
}
