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
  // نتنوع بين zoom in و zoom out وpan
  const effects = [
    // Zoom in from center
    `scale=iw*2:ih*2,zoompan=z='min(zoom+0.0015,1.5)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 30}:s=${w}x${h}`,
    // Zoom out
    `scale=iw*2:ih*2,zoompan=z='if(lte(zoom,1.0),1.5,max(1.0,zoom-0.0015))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${duration * 30}:s=${w}x${h}`,
    // Pan left to right
    `scale=iw*2:ih*2,zoompan=z=1.3:x='if(lte(on,1),0,x+1.5)':y='ih/2-(ih/zoom/2)':d=${duration * 30}:s=${w}x${h}`,
    // Pan right to left
    `scale=iw*2:ih*2,zoompan=z=1.3:x='if(lte(on,1),iw,x-1.5)':y='ih/2-(ih/zoom/2)':d=${duration * 30}:s=${w}x${h}`,
    // Zoom in top-left
    `scale=iw*2:ih*2,zoompan=z='min(zoom+0.001,1.4)':x='0':y='0':d=${duration * 30}:s=${w}x${h}`,
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
  const FONT_PATH = process.platform === 'win32'
    ? 'C\\:/Windows/Fonts/arial.ttf'
    : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(videoLanguage);

  function splitIntoChunks(text, wordsPerChunk = 4) {
    const words = text.replace(/[':]/g, '').replace(/\\/g, '').replace(/\n/g, ' ').trim().split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      let chunk = words.slice(i, i + wordsPerChunk);
      if (isRTL) chunk = chunk.reverse();
      chunks.push(chunk.join(' '));
    }
    return chunks.filter(Boolean);
  }

  const secPerScene = 5;
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
  const SEC_PER_IMAGE = 5;
  const totalImages = scenes.length;

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
      // fallback: static image as video
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
    // دمج الـ audio مع الفيديو
    let musicCmd = '';
    if (music) {
      const musicDir = path.join(process.cwd(), 'assets', 'music');
      if (fs.existsSync(musicDir)) {
        const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        if (files.length > 0) {
          const musicFile = path.join(musicDir, files[Math.floor(Math.random() * files.length)]);
          try {
            execSync(
              `ffmpeg -i "${mergedPath}" -i "${audioPath}" -i "${musicFile}" ` +
              `-filter_complex "[2:a]volume=0.07[music];[1:a][music]amix=inputs=2:duration=longest[aout]" ` +
              `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
              { stdio: 'pipe' }
            );
          } catch {
            execSync(
              `ffmpeg -i "${mergedPath}" -i "${audioPath}" ` +
              `-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
              { stdio: 'pipe' }
            );
          }
        } else {
          execSync(
            `ffmpeg -i "${mergedPath}" -i "${audioPath}" ` +
            `-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
            { stdio: 'pipe' }
          );
        }
      } else {
        execSync(
          `ffmpeg -i "${mergedPath}" -i "${audioPath}" ` +
          `-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
          { stdio: 'pipe' }
        );
      }
    } else {
      execSync(
        `ffmpeg -i "${mergedPath}" -i "${audioPath}" ` +
        `-c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`,
        { stdio: 'pipe' }
      );
    }
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
