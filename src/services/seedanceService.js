import { addRealCaptionsForModel, addCaptionsWithTimingForModel } from './renderService.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const RATIOS = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720,  h: 1280 },
  '1:1':  { w: 720,  h: 720  },
};

// ── توزيع نسبي لمدة كل مشهد حسب طول الكلام فيه (بدل تثبيت مدة واحدة لكل الكليبات) ──
// ده بيمنع إن الصوت يسبق المشهد أو المشهد يسبق الصوت، وبيمنع تكرار/قطع الفيديو كله عشان يطابق الصوت
function computeProportionalDurations(scenes, totalDuration, minSec = 3.5, maxSec = 14) {
  const wordCounts = scenes.map(s => Math.max((s.text || '').trim().split(/\s+/).filter(Boolean).length, 1));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || scenes.length;
  let durations = wordCounts.map(wc => Math.min(Math.max((wc / totalWords) * totalDuration, minSec), maxSec));
  const sum = durations.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? totalDuration / sum : 1;
  return durations.map(d => Math.max(Math.min(d * scale, maxSec), minSec));
}

async function generateSeedanceClip(prompt, ratio = '16:9') {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');

  const headers = {
    'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'wait',
  };

  const submitRes = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-1-pro-fast/predictions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { prompt, aspect_ratio: ratio, resolution: '720p', duration: 5, fps: 24, camera_fixed: false },
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Replicate submit error ${submitRes.status}: ${err}`);
  }

  const prediction = await submitRes.json();

  if (prediction.status === 'succeeded' && prediction.output) {
    const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    console.log(`[Seedance] Done immediately: ${videoUrl}`);
    return videoUrl;
  }

  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`No prediction ID: ${JSON.stringify(prediction)}`);
  console.log(`[Seedance] Job submitted: ${predictionId}`);

  const maxWait = 180_000;
  const pollInterval = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!statusRes.ok) { console.warn(`[Seedance] Poll ${statusRes.status}, retry...`); continue; }
    const statusData = await statusRes.json();
    const status = statusData.status;
    console.log(`[Seedance] Status: ${status} (${Math.round((Date.now() - startTime) / 1000)}s)`);
    if (status === 'succeeded') {
      const videoUrl = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
      if (!videoUrl) throw new Error('No video URL in output');
      return videoUrl;
    }
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Replicate failed: ${statusData.error || 'unknown'}`);
    }
  }
  throw new Error('Replicate timed out after 3 minutes');
}

async function downloadVideo(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

// ── FLUX Kontext Dev: generate reference image from character photo ──────────
// Cheapest Replicate model for character reference (~$0.01-0.02/image)
async function generateReferenceImage(photoBase64, scenePrompt) {
  if (!REPLICATE_API_TOKEN) return null;
  try {
    // Accept both raw base64 and data URL
    const b64 = photoBase64.replace(/^data:image\/\w+;base64,/, '');
    const imageDataUrl = `data:image/jpeg;base64,${b64}`;

    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          image: imageDataUrl,
          prompt: `${scenePrompt}, keep the same person's face and identity from the reference image exactly, same facial features, same person`,
          aspect_ratio: '9:16',
          output_format: 'webp',
          guidance: 3.5,
          num_inference_steps: 28,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[Model5] FLUX Kontext error ${res.status}: ${err.slice(0, 100)}`);
      return null;
    }

    const data = await res.json();
    if (data.error) { console.warn('[Model5] FLUX Kontext prediction error:', data.error); return null; }

    // If not done yet (no Prefer:wait support), poll once
    if (data.status !== 'succeeded') {
      if (!data.id) return null;
      let attempts = 0;
      while (attempts < 24) { // max ~2 min
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
          headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
        });
        const pollData = await pollRes.json();
        if (pollData.status === 'succeeded') {
          return Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        }
        if (pollData.status === 'failed' || pollData.status === 'canceled') {
          console.warn('[Model5] FLUX Kontext failed:', pollData.error);
          return null;
        }
        attempts++;
      }
      return null;
    }

    return Array.isArray(data.output) ? data.output[0] : data.output;
  } catch (e) {
    console.warn('[Model5] generateReferenceImage error:', e.message);
    return null;
  }
}

// ── Seedance 2.0 Fast for Model 5 ────────────────────────────────────────
// imageUrl: optional — if provided, used as starting frame for image-to-video
async function generateSeedance2Clip(prompt, ratio = '9:16', duration = 5, imageUrl = null) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const headers = {
    'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'wait',
  };

  const input = { prompt, aspect_ratio: ratio, resolution: '480p', duration, fps: 24 };
  // If reference image provided, pass as first_frame for character consistency
  if (imageUrl) {
    input.first_frame_image = imageUrl;
    console.log(`[Model5] Using reference image for clip`);
  }

  const submitRes = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-2.0-fast/predictions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  });
  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Seedance2 error ${submitRes.status}: ${err}`);
  }
  const prediction = await submitRes.json();
  if (prediction.status === 'succeeded' && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`No prediction ID`);
  const maxWait = 300_000;
  const pollInterval = 5_000;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    console.log(`[Model5] Status: ${statusData.status} (${Math.round((Date.now()-startTime)/1000)}s)`);
    if (statusData.status === 'succeeded') {
      const url = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
      if (!url) throw new Error('No video URL');
      return url;
    }
    if (statusData.status === 'failed' || statusData.status === 'canceled') {
      throw new Error(`Seedance2 failed: ${statusData.error || 'unknown'}`);
    }
  }
  throw new Error('Seedance2 timed out');
}

function slowDownClip(inputPath, outputPath, targetDuration) {
  let originalDur = 5;
  try {
    originalDur = parseFloat(execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
      { encoding: 'utf8' }
    ).trim()) || 5;
  } catch {}
  const pts = targetDuration / originalDur;
  try {
    execSync(
      `ffmpeg -i "${inputPath}" -vf "setpts=${pts.toFixed(4)}*PTS" ` +
      `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
      `-pix_fmt yuv420p -movflags +faststart -an -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    fs.copyFileSync(inputPath, outputPath);
  }
}

function addCaptions(videoPath, scenes, outputPath, ratio, videoLanguage = 'ar', secPerScene = 7) {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(videoLanguage);
  let FONT_PATH;
  if (process.platform === 'win32') {
    FONT_PATH = 'C\\:/Windows/Fonts/arial.ttf';
  } else {
    if (isRTL) {
      let found = null;
      try {
        const fc = execSync('fc-list :lang=ar | head -1', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
        if (fc) found = fc.split(':')[0].trim();
      } catch {}
      const fonts = [
        '/run/current-system/sw/share/X11/fonts/NotoNaskhArabic-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
        '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
      ];
      FONT_PATH = found || fonts.find(f => fs.existsSync(f)) || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    } else {
      FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    }
  }

  let totalVideoDuration = 0;
  try {
    const dur = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8' }
    ).trim();
    totalVideoDuration = parseFloat(dur) || 0;
  } catch {}
  const actualSecPerScene = totalVideoDuration > 0 ? totalVideoDuration / scenes.length : secPerScene;

  const sanitize = t => t.replace(/['"`:;\\<>{}|]/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const chunkWords = (text, n = 4) => {
    const w = sanitize(text).split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < w.length; i += n) out.push(w.slice(i, i + n).join(' '));
    return out.filter(Boolean);
  };

  const filters = [];
  let t = 0;
  const yExpr = ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-60';

  scenes.forEach(scene => {
    const start = t; t += actualSecPerScene;
    const ch = chunkWords(scene.text, 4);
    const chDur = actualSecPerScene / Math.max(ch.length, 1);
    ch.forEach((c, j) => {
      const cs = start + j * chDur, ce = cs + chDur;
      filters.push(
        `drawtext=fontfile='${FONT_PATH}':text='${c}':fontsize=28:fontcolor=white` +
        `:borderw=2:bordercolor=black:box=1:boxcolor=0x00000088:boxborderw=8` +
        `:x=(w-text_w)/2:y=${yExpr}:enable='between(t,${cs.toFixed(3)},${ce.toFixed(3)})'`
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
  } catch {
    fs.copyFileSync(videoPath, outputPath);
  }
}

// ── Pipeline Model 4 ───────────────────────────────────────────────────────
export async function renderModel4Video({
  scenes,
  audioUrl,
  ratio = '16:9',
  jobId,
  music = false,
  captions = false,
  videoLanguage = 'ar',
  captionStyle = 'classic',
  onProgress = null,
  videoStyle = 'cinematic',
  styleSuffix = '',
  sceneDurations: realSceneDurations = null,
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['16:9'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);
  const total = scenes.length;

  console.log(`[Model4] START | ${total} scenes | ${ratio} | style: ${videoStyle}`);

  // ✅ FIX: مدة كل كليب بقت نسبية لطول كلام المشهد بدل ثابتة 7 ثواني للكل
  // أولاً نحسب مدة الصوت الكلي (لو موجود) عشان نوزع المدد عليه بدل تخمين
  let earlyAudioDur = null;
  if (audioUrl) {
    const c = path.join(OUTPUTS_DIR, path.basename(audioUrl));
    if (fs.existsSync(c) && fs.statSync(c).size > 1000) {
      try {
        earlyAudioDur = parseFloat(execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${c}"`,
          { encoding: 'utf8' }
        ).trim());
      } catch {}
    }
  }
  const targetTotalDuration = (earlyAudioDur || (total * 7)) + 1;
  const sceneDurations = (Array.isArray(realSceneDurations) && realSceneDurations.length === total)
    ? realSceneDurations
    : computeProportionalDurations(scenes, targetTotalDuration);
  console.log(`[Model4] Total target: ${targetTotalDuration.toFixed(1)}s | per-scene durations (${realSceneDurations ? 'REAL measured' : 'proportional estimate'}): ${sceneDurations.map(d => d.toFixed(1)).join(', ')}`);

  const rawPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const rawPath = path.join(TEMP_DIR, `m4_raw_${id}_${i}.mp4`);
    try {
      if (onProgress) onProgress({ step: 'generating', current: i + 1, total });
      console.log(`[Model4] Generating clip ${i + 1}/${total}`);
      // Build prompt: scene prompt + style suffix appended
      const basePrompt = scenes[i].prompt
        || (scenes[i].visual ? `${scenes[i].visual}, cinematic motion, professional video` : null)
        || scenes[i].text;
      const seedPrompt = styleSuffix
        ? `${basePrompt}, ${styleSuffix}`
        : basePrompt;
      const url = await generateSeedanceClip(seedPrompt, ratio);
      await downloadVideo(url, rawPath);
    } catch (e) {
      console.error(`[Model4] Clip ${i + 1} failed:`, e.message);
      execSync(
        `ffmpeg -f lavfi -i color=c=0x1a1a2e:size=${w}x${h}:rate=24 -t 5 ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-pix_fmt yuv420p -movflags +faststart -y "${rawPath}"`,
        { stdio: 'pipe' }
      );
    }
    rawPaths.push(rawPath);
  }

  const slowPaths = [];
  for (let i = 0; i < rawPaths.length; i++) {
    const slowPath = path.join(TEMP_DIR, `m4_slow_${id}_${i}.mp4`);
    if (onProgress) onProgress({ step: 'processing', current: i + 1, total });
    slowDownClip(rawPaths[i], slowPath, sceneDurations[i]);
    slowPaths.push(slowPath);
  }

  if (onProgress) onProgress({ step: 'merging', current: 1, total: 1 });
  const mergedPath = path.join(TEMP_DIR, `m4_merged_${id}.mp4`);
  const listFile = path.join(TEMP_DIR, `m4_list_${id}.txt`);
  fs.writeFileSync(listFile, slowPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
  execSync(
    `ffmpeg -f concat -safe 0 -i "${listFile}" ` +
    `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
    `-pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
    { stdio: 'pipe' }
  );

  let audioPath = null;
  if (audioUrl) {
    const c = path.join(OUTPUTS_DIR, path.basename(audioUrl));
    if (fs.existsSync(c) && fs.statSync(c).size > 1000) audioPath = c;
  }

  const withAudioPath = path.join(TEMP_DIR, `m4_audio_${id}.mp4`);

  if (audioPath) {
    // ✅ FIX: مبقناش محتاجين نمط/نكرر الفيديو كله عشان يطابق الصوت — المشاهد بقت متزامنة من الأساس
    // بس بنعمل هامش أمان صغير جدًا (±0.3s) لو فيه اختلاف بسيط بين مجموع مدد المشاهد ومدة الصوت الفعلية بعد المعالجة
    const videoExtended = mergedPath;

    const musicDir = path.join(process.cwd(), 'assets', 'music');
    const musicFiles = music && fs.existsSync(musicDir)
      ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
      : [];

    if (music && musicFiles.length > 0) {
      const mf = path.join(musicDir, musicFiles[Math.floor(Math.random() * musicFiles.length)]);
      try {
        execSync(
          `ffmpeg -i "${videoExtended}" -i "${audioPath}" -i "${mf}" ` +
          `-filter_complex "[2:a]volume=0.07[music];[1:a][music]amix=inputs=2:duration=longest[aout]" ` +
          `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart -y "${withAudioPath}"`,
          { stdio: 'pipe' }
        );
      } catch {
        execSync(
          `ffmpeg -i "${videoExtended}" -i "${audioPath}" -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart -y "${withAudioPath}"`,
          { stdio: 'pipe' }
        );
      }
    } else {
      execSync(
        `ffmpeg -i "${videoExtended}" -i "${audioPath}" -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart -y "${withAudioPath}"`,
        { stdio: 'pipe' }
      );
    }
    try { if (fs.existsSync(videoExtended)) fs.unlinkSync(videoExtended); } catch {}
  } else {
    fs.copyFileSync(mergedPath, withAudioPath);
  }

  const withCaptionsPath = path.join(TEMP_DIR, `m4_captions_${id}.mp4`);
  if (captions) {
    if (audioPath && process.env.GROQ_API_KEY) {
      console.log('[Model4] Using Groq Whisper for real captions');
      await addRealCaptionsForModel(withAudioPath, audioPath, withCaptionsPath, captionStyle, ratio, videoLanguage);
    } else {
      await addCaptionsWithTimingForModel(withAudioPath, scenes, withCaptionsPath, null, captionStyle, ratio, videoLanguage);
    }
  } else {
    fs.copyFileSync(withAudioPath, withCaptionsPath);
  }

  try {
    execSync(`ffmpeg -i "${withCaptionsPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' });
  } catch {
    fs.copyFileSync(withCaptionsPath, outputPath);
  }

  setTimeout(() => {
    [...rawPaths, ...slowPaths, mergedPath, withAudioPath, withCaptionsPath, listFile].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
  }, 60000);

  console.log(`[Model4] DONE → ${outputPath}`);
  return outputFile;
}

// ── Pipeline Model 5 (Cinematic) — Seedance 2.0 Fast, with audio ──────────
// Duration: 15s (3 clips), 30s (6 clips), 1min (12 clips) — each clip = 5s
export async function renderModel5Video({
  scenes,
  ratio = '9:16',
  jobId,
  duration = '30s',
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['9:16'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);
  const total = scenes.length;
  const CLIP_SEC = duration === '15s' ? 15 : 5;

  console.log(`[Model5] START | ${total} scenes | ${ratio} | ${duration} | Seedance 2.0`);

  // Step 1: Generate clips بـ Seedance 2.0 مع الصوت الأصلي
  const rawPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const rawPath = path.join(TEMP_DIR, `m5_raw_${id}_${i}.mp4`);
    try {
      console.log(`[Model5] Clip ${i + 1}/${total}: ${(scene.prompt || '').slice(0, 60)}...`);
      const seed2Prompt = scene.prompt
        || (scene.visual ? `${scene.visual}, cinematic motion, professional video` : null)
        || scene.text;

      // ── Reference image: generate with FLUX Kontext Dev if character photo exists ──
      let refImageUrl = scene.referenceImageUrl || null; // pre-generated in generate-scenes
      if (!refImageUrl && scene.characterPhoto) {
        // Fallback: generate reference image here if not already done
        console.log(`[Model5] Generating reference image for clip ${i + 1}...`);
        refImageUrl = await generateReferenceImage(scene.characterPhoto, seed2Prompt);
      }

      const url = await generateSeedance2Clip(seed2Prompt, ratio, CLIP_SEC, refImageUrl);
      await downloadVideo(url, rawPath);
    } catch (e) {
      console.error(`[Model5] Clip ${i + 1} failed:`, e.message);
      execSync(
        `ffmpeg -f lavfi -i color=c=0x060208:size=${w}x${h}:rate=24 -t ${CLIP_SEC} ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-pix_fmt yuv420p -movflags +faststart -y "${rawPath}"`,
        { stdio: 'pipe' }
      );
    }
    rawPaths.push(rawPath);
  }

  // Step 2: Concat with crossfade transitions
  const mergedPath = path.join(TEMP_DIR, `m5_merged_${id}.mp4`);

  if (rawPaths.length === 1) {
    fs.copyFileSync(rawPaths[0], mergedPath);
  } else {
    // Build xfade (video) + acrossfade (audio) filter chain — FIX: preserve audio from Seedance
    // listFile declared here (outer scope) so setTimeout cleanup can reference it
    const listFile = path.join(TEMP_DIR, `m5_list_${id}.txt`);
    try {
      const FADE_DUR = 0.5;
      const CLIP_DURATION = CLIP_SEC - FADE_DUR;

      const inputs = rawPaths.map(f => `-i "${f}"`).join(' ');

      let filterComplex = '';
      if (rawPaths.length === 2) {
        filterComplex =
          `[0:v][1:v]xfade=transition=fade:duration=${FADE_DUR}:offset=${CLIP_DURATION.toFixed(2)}[vout];` +
          `[0:a][1:a]acrossfade=d=${FADE_DUR}[aout]`;
      } else {
        let lastVLabel = '[0:v]';
        let lastALabel = '[0:a]';
        for (let i = 1; i < rawPaths.length; i++) {
          const offset = (CLIP_DURATION * i).toFixed(2);
          const isLast = i === rawPaths.length - 1;
          const vNext = isLast ? '[vout]' : `[v${i}]`;
          const aNext = isLast ? '[aout]' : `[a${i}]`;
          filterComplex += `${lastVLabel}[${i}:v]xfade=transition=fade:duration=${FADE_DUR}:offset=${offset}${vNext};`;
          filterComplex += `${lastALabel}[${i}:a]acrossfade=d=${FADE_DUR}${aNext};`;
          lastVLabel = `[v${i}]`;
          lastALabel = `[a${i}]`;
        }
        filterComplex = filterComplex.replace(/;$/, '');
      }

      execSync(
        `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
        { stdio: 'pipe' }
      );
      console.log('[Model5] ✅ Crossfade transitions applied (video + audio)');
    } catch (e) {
      console.warn('[Model5] Transitions failed, using simple concat:', e.message.slice(0, 80));
      fs.writeFileSync(listFile, rawPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
      execSync(
        `ffmpeg -f concat -safe 0 -i "${listFile}" ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
        { stdio: 'pipe' }
      );
    }
  }

  // Step 3: Final output — دمج موسيقى خلفية ثابتة من assets/music مع صوت المؤثرات الأصلي
  // (Seedance بقى بيولّد مؤثرات صوتية بس من غير موسيقى، حسب تعليمات البرومبت، والموسيقى بتتضاف هنا)
  const musicDir = path.join(process.cwd(), 'assets', 'music');
  const musicFiles = fs.existsSync(musicDir)
    ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
    : [];

  if (musicFiles.length > 0) {
    const mf = path.join(musicDir, musicFiles[Math.floor(Math.random() * musicFiles.length)]);
    try {
      execSync(
        `ffmpeg -i "${mergedPath}" -stream_loop -1 -i "${mf}" ` +
        `-filter_complex "[1:a]volume=0.15[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${outputPath}"`,
        { stdio: 'pipe' }
      );
      console.log('[Model5] ✅ Background music mixed in');
    } catch (e) {
      console.warn('[Model5] Music mixing failed, using original audio:', e.message.slice(0, 80));
      try { execSync(`ffmpeg -i "${mergedPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' }); }
      catch { fs.copyFileSync(mergedPath, outputPath); }
    }
  } else {
    try {
      execSync(`ffmpeg -i "${mergedPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' });
    } catch {
      fs.copyFileSync(mergedPath, outputPath);
    }
  }

  setTimeout(() => {
    [...rawPaths, mergedPath, listFile].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
  }, 60000);

  console.log(`[Model5] DONE → ${outputPath}`);
  return outputFile;
}