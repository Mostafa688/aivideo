import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const ATLAS_API_KEY = process.env.ATLAS_CLOUD_API_KEY;
const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const RATIOS = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720,  h: 1280 },
  '1:1':  { w: 720,  h: 720  },
};

// ── توليد فيديو واحد 5 ثواني من Seedance v1.5 Fast ─────────────────────────
async function generateSeedanceClip(prompt, ratio = '16:9') {
  if (!ATLAS_API_KEY) throw new Error('ATLAS_CLOUD_API_KEY not set');

  const aspectMap = { '16:9': '16:9', '9:16': '9:16', '1:1': '1:1' };

  // 1) أرسل طلب التوليد
  const submitRes = await fetch('https://api.atlascloud.ai/v1/video/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ATLAS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'seedance-v1-5-lite-t2v-250428',
      prompt,
      duration: 5,
      aspect_ratio: aspectMap[ratio] || '16:9',
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Seedance submit error ${submitRes.status}: ${err}`);
  }

  const submitData = await submitRes.json();
  const requestId = submitData.request_id || submitData.id;
  if (!requestId) throw new Error('No request_id returned from Seedance API');

  console.log(`[Model4] Seedance job submitted: ${requestId}`);

  // 2) Polling حتى يخلص (max 3 دقائق)
  const maxWait = 180_000;
  const pollInterval = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const statusRes = await fetch(`https://api.atlascloud.ai/v1/video/status/${requestId}`, {
      headers: { 'Authorization': `Bearer ${ATLAS_API_KEY}` },
    });

    if (!statusRes.ok) continue;

    const statusData = await statusRes.json();
    const status = statusData.status;

    if (status === 'completed' || status === 'succeeded') {
      const videoUrl = statusData.video_url || statusData.output?.video_url || statusData.result?.video_url;
      if (!videoUrl) throw new Error('Seedance returned no video_url');
      console.log(`[Model4] Seedance done: ${videoUrl}`);
      return videoUrl;
    }

    if (status === 'failed' || status === 'error') {
      throw new Error(`Seedance generation failed: ${statusData.error || 'unknown'}`);
    }

    console.log(`[Model4] Seedance status: ${status} (${Math.round((Date.now() - startTime) / 1000)}s)`);
  }

  throw new Error('Seedance generation timed out after 3 minutes');
}

// ── تحميل الفيديو من URL وحفظه ──────────────────────────────────────────────
async function downloadVideo(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}

// ── FFmpeg: إبطاء الفيديو من 5 ثواني لـ 7 ثواني ────────────────────────────
function slowDownClip(inputPath, outputPath) {
  // setpts=1.4 يعني 5s * 1.4 = 7s
  try {
    execSync(
      `ffmpeg -i "${inputPath}" -vf "setpts=1.4*PTS" -af "atempo=0.714" ` +
      `-c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 ` +
      `-pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch (e) {
    // fallback بدون audio filter لو مفيش audio
    execSync(
      `ffmpeg -i "${inputPath}" -vf "setpts=1.4*PTS" ` +
      `-c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 ` +
      `-pix_fmt yuv420p -movflags +faststart -an -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  }
}

// ── إضافة captions ────────────────────────────────────────────────────────
function addCaptions(videoPath, scenes, outputPath, ratio, videoLanguage = 'en') {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(videoLanguage);

  let FONT_PATH;
  if (process.platform === 'win32') {
    FONT_PATH = 'C\\:/Windows/Fonts/arial.ttf';
  } else {
    if (isRTL) {
      let foundFont = null;
      try {
        const fcResult = execSync('fc-list :lang=ar | head -3', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
        if (fcResult) foundFont = fcResult.split('\n')[0].split(':')[0].trim();
      } catch {}
      const arabicFonts = [
        '/run/current-system/sw/share/X11/fonts/NotoNaskhArabic-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
        '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
      ];
      FONT_PATH = foundFont || arabicFonts.find(f => fs.existsSync(f)) || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    } else {
      FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    }
  }

  function sanitizeText(text) {
    return text.replace(/['"`:;\\<>{}|]/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  }

  function splitIntoChunks(text, wordsPerChunk = 4) {
    const words = sanitizeText(text).split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks.filter(Boolean);
  }

  // كل مشهد = 7 ثواني (بعد الـ slowdown)
  const secPerScene = 7;
  const filters = [];
  let currentTime = 0;

  scenes.forEach((scene) => {
    const start = currentTime;
    const end = start + secPerScene;
    currentTime = end;
    const chunks = splitIntoChunks(scene.text, 4);
    const chunkDur = secPerScene / Math.max(chunks.length, 1);
    const yExpr = ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-60';

    chunks.forEach((chunk, j) => {
      const chunkStart = start + j * chunkDur;
      const chunkEnd = chunkStart + chunkDur;
      filters.push(
        `drawtext=fontfile='${FONT_PATH}'` +
        `:text='${chunk}'` +
        `:fontsize=28:fontcolor=white:borderw=2:bordercolor=black` +
        `:box=1:boxcolor=0x00000088:boxborderw=8` +
        `:x=(w-text_w)/2:y=${yExpr}` +
        `:enable='between(t,${chunkStart.toFixed(3)},${chunkEnd.toFixed(3)})'`
      );
    });
  });

  try {
    execSync(
      `ffmpeg -i "${videoPath}" -vf "${filters.join(',')}" ` +
      `-c:a copy -c:v libx264 -crf 23 -preset ultrafast ` +
      `-profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch (e) {
    console.warn('[Model4] Captions failed, skipping:', e.message);
    fs.copyFileSync(videoPath, outputPath);
  }
}

// ── الـ Pipeline الرئيسي لـ Model 4 ───────────────────────────────────────
export async function renderModel4Video({
  scenes,
  audioUrl,
  ratio = '16:9',
  jobId,
  music = false,
  captions = false,
  videoLanguage = 'en',
  onProgress = null,
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['16:9'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);
  const totalScenes = scenes.length;

  console.log(`[Model4] START | ${totalScenes} scenes | ratio: ${ratio} | ${w}x${h}`);

  // ── Step 1: توليد كليبات Seedance (5 ثواني لكل مشهد) ──────────────────
  const rawClipPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const rawPath = path.join(TEMP_DIR, `m4_raw_${id}_${i}.mp4`);

    try {
      if (onProgress) onProgress({ step: 'generating', current: i + 1, total: totalScenes });
      console.log(`[Model4] Generating clip ${i + 1}/${totalScenes}`);

      const videoUrl = await generateSeedanceClip(scene.prompt || scene.text, ratio);
      await downloadVideo(videoUrl, rawPath);
      rawClipPaths.push(rawPath);
    } catch (e) {
      console.error(`[Model4] Clip ${i + 1} failed:`, e.message);
      // fallback: فيديو أسود
      execSync(
        `ffmpeg -f lavfi -i color=c=0x1a1a2e:size=${w}x${h}:rate=24 -t 5 ` +
        `-c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 ` +
        `-pix_fmt yuv420p -movflags +faststart -y "${rawPath}"`,
        { stdio: 'pipe' }
      );
      rawClipPaths.push(rawPath);
    }
  }

  // ── Step 2: إبطاء كل كليب من 5s لـ 7s ────────────────────────────────
  const slowClipPaths = [];
  for (let i = 0; i < rawClipPaths.length; i++) {
    const slowPath = path.join(TEMP_DIR, `m4_slow_${id}_${i}.mp4`);
    if (onProgress) onProgress({ step: 'processing', current: i + 1, total: totalScenes });
    console.log(`[Model4] Slowing down clip ${i + 1}/${totalScenes}`);
    try {
      slowDownClip(rawClipPaths[i], slowPath);
      slowClipPaths.push(slowPath);
    } catch (e) {
      console.warn(`[Model4] Slowdown ${i + 1} failed, using raw:`, e.message);
      slowClipPaths.push(rawClipPaths[i]);
    }
  }

  // ── Step 3: Concat (بدون transitions كما طلبت) ────────────────────────
  if (onProgress) onProgress({ step: 'merging', current: 1, total: 1 });
  console.log('[Model4] Concatenating clips...');

  const mergedPath = path.join(TEMP_DIR, `m4_merged_${id}.mp4`);
  const listContent = slowClipPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n');
  const listFile = path.join(TEMP_DIR, `m4_list_${id}.txt`);
  fs.writeFileSync(listFile, listContent);

  execSync(
    `ffmpeg -f concat -safe 0 -i "${listFile}" ` +
    `-c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 ` +
    `-pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
    { stdio: 'pipe' }
  );

  // ── Step 4: إضافة Audio ───────────────────────────────────────────────
  let audioPath = null;
  if (audioUrl) {
    const audioBasename = path.basename(audioUrl);
    const candidate = path.join(OUTPUTS_DIR, audioBasename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1000) {
      audioPath = candidate;
    }
  }

  const withAudioPath = path.join(TEMP_DIR, `m4_audio_${id}.mp4`);

  if (audioPath) {
    // احسب مدة الـ audio
    let audioDuration = null;
    try {
      const dur = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
        { encoding: 'utf8' }
      ).trim();
      audioDuration = parseFloat(dur);
    } catch {}

    // لو الـ audio أطول من الفيديو — loop الفيديو
    const videoExtended = path.join(TEMP_DIR, `m4_extended_${id}.mp4`);
    if (audioDuration && audioDuration > 0) {
      try {
        execSync(
          `ffmpeg -stream_loop -1 -i "${mergedPath}" -t ${audioDuration + 1} ` +
          `-c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 ` +
          `-pix_fmt yuv420p -movflags +faststart -y "${videoExtended}"`,
          { stdio: 'pipe' }
        );
      } catch {
        fs.copyFileSync(mergedPath, videoExtended);
      }
    } else {
      fs.copyFileSync(mergedPath, videoExtended);
    }

    // دمج مع music لو موجود
    const musicDir = path.join(process.cwd(), 'assets', 'music');
    const musicFiles = music && fs.existsSync(musicDir)
      ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
      : [];

    if (music && musicFiles.length > 0) {
      const musicFile = path.join(musicDir, musicFiles[Math.floor(Math.random() * musicFiles.length)]);
      try {
        execSync(
          `ffmpeg -i "${videoExtended}" -i "${audioPath}" -i "${musicFile}" ` +
          `-filter_complex "[2:a]volume=0.07[music];[1:a][music]amix=inputs=2:duration=longest[aout]" ` +
          `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
          { stdio: 'pipe' }
        );
      } catch {
        execSync(
          `ffmpeg -i "${videoExtended}" -i "${audioPath}" ` +
          `-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
          { stdio: 'pipe' }
        );
      }
    } else {
      execSync(
        `ffmpeg -i "${videoExtended}" -i "${audioPath}" ` +
        `-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
        { stdio: 'pipe' }
      );
    }
    try { if (fs.existsSync(videoExtended)) fs.unlinkSync(videoExtended); } catch {}
  } else {
    fs.copyFileSync(mergedPath, withAudioPath);
  }

  // ── Step 5: Captions ──────────────────────────────────────────────────
  const withCaptionsPath = path.join(TEMP_DIR, `m4_captions_${id}.mp4`);
  if (captions) {
    addCaptions(withAudioPath, scenes, withCaptionsPath, ratio, videoLanguage);
  } else {
    fs.copyFileSync(withAudioPath, withCaptionsPath);
  }

  // ── Step 6: Final output ──────────────────────────────────────────────
  try {
    execSync(
      `ffmpeg -i "${withCaptionsPath}" -c copy -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    fs.copyFileSync(withCaptionsPath, outputPath);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────
  setTimeout(() => {
    [...rawClipPaths, ...slowClipPaths, mergedPath, withAudioPath, withCaptionsPath, listFile].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
  }, 60000);

  console.log(`[Model4] DONE → ${outputPath}`);
  return outputFile;
}
