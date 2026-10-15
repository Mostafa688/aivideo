// ── ff.js ────────────────────────────────────────────────────────────────────
// أدوات ffmpeg/ffprobe: بنشغّل بـexecFile (مصفوفة args، مفيش shell) عشان مفيش مشاكل اقتباس مع
// مسارات/نصوص عربية، وبنرجّع stderr كاملاً في رسالة الخطأ عشان أي فشل يتشخّص.
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MAX_BUFFER = 64 * 1024 * 1024;

export function run(bin, args, { timeoutMs = 20 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: MAX_BUFFER, timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        const tail = String(stderr || '').split('\n').slice(-12).join('\n');
        return reject(new Error(`${bin} failed: ${err.message.split('\n')[0]}\n${tail}`));
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

export const ffmpeg = (args, opts) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], opts);

// ffmpeg بـfilter_complex كبير (فيلم فيه مئات المشاهد = مئات المؤثرات): لينكس بيرفض أي argument أكبر من 128KB
// (spawn E2BIG)، فالـgraph الكبير بيتكتب في ملف مؤقت وffmpeg بيقراه منه. -filter_complex_script موجود لحد ffmpeg 6 ومتشال/مستبدل بـ-/filter_complex في 7+
const GRAPH_INLINE_MAX = 30000;
export async function ffmpegGraph(inputs, graph, outArgs, opts) {
  if (graph.length <= GRAPH_INLINE_MAX) return ffmpeg([...inputs, '-filter_complex', graph, ...outArgs], opts);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffgraph-'));
  const file = path.join(dir, 'graph.txt');
  fs.writeFileSync(file, graph);
  try {
    try { return await ffmpeg([...inputs, '-filter_complex_script', file, ...outArgs], opts); }
    catch (e) { if (!/Unrecognized option|Option not found/i.test(e.message)) throw e; }
    return await ffmpeg([...inputs, '-/filter_complex', file, ...outArgs], opts);
  } finally { rmQuiet(dir); }
}

export async function probeDuration(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = parseFloat(stdout.trim());
  return Number.isFinite(d) ? d : 0;
}

export async function probeVideo(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', file]);
  const s = JSON.parse(stdout).streams?.[0] || {};
  return { width: s.width || 0, height: s.height || 0, duration: parseFloat(s.duration) || 0 };
}

export async function hasAudio(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]);
  return stdout.trim().length > 0;
}

export function rmQuiet(p) { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} }
