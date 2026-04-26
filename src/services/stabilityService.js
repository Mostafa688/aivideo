import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const STABILITY_API_KEY = process.env.STABILITY_API_KEY;
const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const RATIOS = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1':  { w: 720, h: 720 },
};

// ── توليد صورة واحدة من Stability AI ──────────────────────────────────────
async function generateImage(prompt, ratio = '16:9') {
  if (!STABILITY_API_KEY) throw new Error('STABILITY_API_KEY not set in environment');

  const { w, h } = RATIOS[ratio] || RATIOS['16:9'];

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STABILITY_API_KEY}`,
      Accept: 'image/*',
    },
    body: (() => {
      const form = new FormData();
      form.append('prompt', prompt);
      form.append('output_format', 'jpeg');
      form.append('aspect_ratio', ratio === '16:9' ? '16:9' : ratio === '9:16' ? '9:16' : '1:1');
      return form;
    })(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Stability API error ${response.status}: ${errText}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

// ── Ken Burns zoom effect على صورة واحدة ──────────────────────────────────
function applyKenBurns(imagePath, outputPath, duration, w, h, index) {
  const frames = duration * 30;
  const W = w, H = h;

  // كل effect بيستخدم scale + crop مع تحريك تدريجي — بدون zoompan عشان مفيش freeze
  const effects = [
    // Zoom in from center
    `scale=${W*2}:${H*2},crop=${W}:${H}:'(iw-${W})/2+(iw-${W})/2*on/${frames}':'(ih-${H})/2+(ih-${H})/2*on/${frames}',scale=${W}:${H}`,
    // Zoom out to center
    `scale=${W*2}:${H*2},crop=${W}:${H}:'(iw-${W})/2-(iw-${W})/2*on/${frames}':'(ih-${H})/2-(ih-${H})/2*on/${frames}',scale=${W}:${H}`,
    // Pan left to right
    `scale=${W*2}:${H*2},crop=${W}:${H}:'on/${frames}*(iw-${W})':${H/2},scale=${W}:${H}`,
    // Pan right to left
    `scale=${W*2}:${H*2},crop=${W}:${H}:'(iw-${W})-(on/${frames}*(iw-${W}))':${H/2},scale=${W}:${H}`,
    // Pan top to bottom
    `scale=${W*2}:${H*2},crop=${W}:${H}:${W/2}:'on/${frames}*(ih-${H})',scale=${W}:${H}`,
  ];

  const effect = effects[index % effects.length];

  execSync(
    `ffmpeg -loop 1 -i "${imagePath}" -vf "${effect},setsar=1" ` +
    `-t ${duration} -r 30 -c:v libx264 -crf 23 -preset ultrafast ` +
    `-profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
    { stdio: 'pipe' }
  );
}

// ── Transition بين كليبين ──────────────────────────────────────────────────
function applyTransition(clip1, clip2, outputPath, duration1, transitionDuration = 0.5) {
  const offset = Math.max(duration1 - transitionDuration, transitionDuration);
  const transTypes = ['fade', 'slideleft', 'slideright', 'dissolve', 'wipeleft', 'wiperight'];
  const transType = transTypes[Math.floor(Math.random() * transTypes.length)];

  try {
    execSync(
      `ffmpeg -i "${clip1}" -i "${clip2}" ` +
      `-filter_complex "[0:v][1:v]xfade=transition=${transType}:duration=${transitionDuration}:offset=${offset}[v]" ` +
      `-map "[v]" -r 30 -c:v libx264 -crf 23 -preset ultrafast ` +
      `-profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch (e) {
    // fallback: concat بدون transition
    const listContent = [
      `file '${path.resolve(clip1).replace(/\\/g, '/')}'`,
      `file '${path.resolve(clip2).replace(/\\/g, '/')}'`,
    ].join('\n');
    const tmpList = outputPath + '_list.txt';
    fs.writeFileSync(tmpList, listContent);
    execSync(
      `ffmpeg -f concat -safe 0 -i "${tmpList}" -c:v libx264 -crf 23 -preset ultrafast ` +
      `-profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
    try { fs.unlinkSync(tmpList); } catch {}
  }
}

// ── إضافة captions على الفيديو ────────────────────────────────────────────
function addCaptions(videoPath, scenes, outputPath, ratio, videoLanguage = 'en') {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(videoLanguage);

  // اختيار الفونت المناسب للغة
  let FONT_PATH;
  if (process.platform === 'win32') {
    FONT_PATH = isRTL ? 'C\\:/Windows/Fonts/arial.ttf' : 'C\\:/Windows/Fonts/arial.ttf';
  } else {
    if (isRTL) {
      // Noto fonts للعربي على Railway (nixpacks)
      const arabicFonts = [
        '/run/current-system/sw/share/X11/fonts/NotoNaskhArabic-Regular.ttf',
        '/run/current-system/sw/share/X11/fonts/NotoSansArabic-Regular.ttf',
        '/run/current-system/sw/share/X11/fonts/NotoSans-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
        '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
        '/usr/share/fonts/noto/NotoNaskhArabic-Regular.ttf',
      ];
      // ابحث عن الـ font بـ fc-list
      let foundFont = null;
      try {
        const fcResult = execSync('fc-list :lang=ar | head -3', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
        if (fcResult) {
          foundFont = fcResult.split('\n')[0].split(':')[0].trim();
        }
      } catch {}
      FONT_PATH = foundFont || arabicFonts.find(f => fs.existsSync(f)) || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
      console.log('[Model3] Arabic font:', FONT_PATH);
    } else {
      FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    }
  }

  function sanitizeText(text) {
    return text
      .replace(/['"`:;\\<>{}|]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80); // max 80 chars per chunk
  }

  function splitIntoChunks(text, wordsPerChunk = 4) {
    const clean = sanitizeText(text);
    const words = clean.split(/\s+/).filter(Boolean);
    const chunks = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const chunk = words.slice(i, i + wordsPerChunk).join(' ');
      chunks.push(chunk);
    }
    return chunks.filter(Boolean);
  }

  const secPerScene = 10;
  const filters = [];
  let currentTime = 0;

  scenes.forEach((scene, i) => {
    const start = currentTime;
    const end = start + secPerScene;
    currentTime = end;
    const chunks = splitIntoChunks(scene.text, 4);
    const chunkDur = secPerScene / chunks.length;

    chunks.forEach((chunk, j) => {
      const chunkStart = start + j * chunkDur;
      const chunkEnd = chunkStart + chunkDur;
      const yExpr = ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-60';

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
    console.warn('[Model3] Captions failed, skipping:', e.message);
    fs.copyFileSync(videoPath, outputPath);
  }
}

// ── الـ Pipeline الرئيسي لـ Model 3 ───────────────────────────────────────
export async function renderModel3Video({
  scenes,
  audioUrl,
  ratio = '16:9',
  jobId,
  duration = '1min',
  music = false,
  captions = false,
  transitions = true,
  videoLanguage = 'en',
  onProgress = null,
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['16:9'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);
  const totalImages = scenes.length;
  const DURATION_MAP = { '30s': 30, '1min': 60, '3min': 180, '5min': 300 };
  const targetVideoDuration = DURATION_MAP[duration] || (totalImages * 10);
  console.log(`[Model3] Target: ${targetVideoDuration}s | ${totalImages} images`);

  console.log(`[Model3] START | ${totalImages} images | ratio: ${ratio} | ${w}x${h}`);

  // ── Step 1: توليد الصور ───────────────────────────────────────────────
  const imagePaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const imagePath = path.join(TEMP_DIR, `m3_img_${id}_${i}.jpg`);

    try {
      if (onProgress) onProgress({ step: 'generating', current: i + 1, total: totalImages });
      console.log(`[Model3] Generating image ${i + 1}/${totalImages}: ${scene.prompt?.slice(0, 60)}...`);

      const imageBuffer = await generateImage(scene.prompt || scene.text, ratio);
      fs.writeFileSync(imagePath, imageBuffer);
      imagePaths.push(imagePath);
    } catch (e) {
      console.error(`[Model3] Image ${i + 1} failed:`, e.message);
      // fallback: صورة سوداء
      execSync(
        `ffmpeg -f lavfi -i color=c=0x1a1a2e:size=${w}x${h}:rate=1 -vframes 1 -y "${imagePath}"`,
        { stdio: 'pipe' }
      );
      imagePaths.push(imagePath);
    }
  }

  // ── Step 1.5: احسب مدة الـ audio الأول عشان نحدد SEC_PER_IMAGE ──────────
  let audioPathEarly = null;
  if (audioUrl) {
    const audioBasename = path.basename(audioUrl);
    const candidate = path.join(OUTPUTS_DIR, audioBasename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1000) {
      audioPathEarly = candidate;
    }
  }

  let audioDurationEarly = null;
  if (audioPathEarly) {
    try {
      const dur = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPathEarly}"`,
        { encoding: 'utf8' }
      ).trim();
      audioDurationEarly = parseFloat(dur);
    } catch {}
  }

  // نستخدم مدة الـ audio لو موجودة، وإلا نستخدم الـ target
  const actualDuration = audioDurationEarly || targetVideoDuration;
  const SEC_PER_IMAGE = Math.ceil((actualDuration + 1) / totalImages);
  console.log(`[Model3] Audio: ${audioDurationEarly?.toFixed(1) || 'none'}s | SEC_PER_IMAGE: ${SEC_PER_IMAGE}s`);

  // ── Step 2: Ken Burns على كل صورة ────────────────────────────────────
  const clipPaths = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const clipPath = path.join(TEMP_DIR, `m3_clip_${id}_${i}.mp4`);
    if (onProgress) onProgress({ step: 'kenburns', current: i + 1, total: totalImages });
    console.log(`[Model3] Ken Burns ${i + 1}/${totalImages}`);

    try {
      applyKenBurns(imagePaths[i], clipPath, SEC_PER_IMAGE, w, h, i);
      clipPaths.push(clipPath);
    } catch (e) {
      console.error(`[Model3] Ken Burns ${i + 1} failed:`, e.message);
      execSync(
        `ffmpeg -loop 1 -i "${imagePaths[i]}" -t ${SEC_PER_IMAGE} -r 30 ` +
        `-vf "scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1" ` +
        `-c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 ` +
        `-pix_fmt yuv420p -movflags +faststart -y "${clipPath}"`,
        { stdio: 'pipe' }
      );
      clipPaths.push(clipPath);
    }
  }

  // ── Step 3: Transitions أو Concat ────────────────────────────────────
  if (onProgress) onProgress({ step: 'merging', current: 1, total: 1 });
  console.log('[Model3] Merging clips...');

  const mergedPath = path.join(TEMP_DIR, `m3_merged_${id}.mp4`);

  if (transitions && clipPaths.length > 1) {
    let current = clipPaths[0];
    for (let i = 1; i < clipPaths.length; i++) {
      const transOut = path.join(TEMP_DIR, `m3_trans_${id}_${i}.mp4`);
      applyTransition(current, clipPaths[i], transOut, SEC_PER_IMAGE);
      current = transOut;
    }
    fs.copyFileSync(current, mergedPath);
  } else {
    const listContent = clipPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n');
    const listFile = path.join(TEMP_DIR, `m3_list_${id}.txt`);
    fs.writeFileSync(listFile, listContent);
    execSync(
      `ffmpeg -f concat -safe 0 -i "${listFile}" ` +
      `-c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 ` +
      `-pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
      { stdio: 'pipe' }
    );
  }

  // ── Step 4: إضافة الـ Audio ──────────────────────────────────────────
  let audioPath = null;
  if (audioUrl) {
    const audioBasename = path.basename(audioUrl);
    const candidate = path.join(OUTPUTS_DIR, audioBasename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1000) {
      audioPath = candidate;
    }
  }

  const withAudioPath = path.join(TEMP_DIR, `m3_audio_${id}.mp4`);

  if (audioPath) {
    // احسب مدة الـ audio الحقيقية
    let audioDuration = null;
    try {
      const dur = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
        { encoding: 'utf8' }
      ).trim();
      audioDuration = parseFloat(dur);
    } catch {}

    // لو الـ audio أطول من الفيديو — نطول الفيديو بثانية زيادة
    const videoExtended = path.join(TEMP_DIR, `m3_extended_${id}.mp4`);
    if (audioDuration && audioDuration > 0) {
      const targetDuration = audioDuration + 1;
      try {
        execSync(
          `ffmpeg -stream_loop -1 -i "${mergedPath}" -t ${targetDuration} ` +
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

    // دمج الـ audio مع الفيديو المطول
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

  // ── Step 5: Captions ─────────────────────────────────────────────────
  const withCaptionsPath = path.join(TEMP_DIR, `m3_captions_${id}.mp4`);
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

  // ── Cleanup ──────────────────────────────────────────────────────────
  setTimeout(() => {
    [...imagePaths, ...clipPaths, mergedPath, withAudioPath, withCaptionsPath].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
    // cleanup transition files
    for (let i = 1; i < clipPaths.length; i++) {
      const tf = path.join(TEMP_DIR, `m3_trans_${id}_${i}.mp4`);
      try { if (fs.existsSync(tf)) fs.unlinkSync(tf); } catch {}
    }
  }, 60000);

  console.log(`[Model3] DONE → ${outputPath}`);
  return outputFile;
}