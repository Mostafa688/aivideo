import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const FONT_PATH = process.platform === 'win32'
  ? 'C\\:/Windows/Fonts/arial.ttf'
  : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

const FONT_BOLD_PATH = process.platform === 'win32'
  ? 'C\\:/Windows/Fonts/arialbd.ttf'
  : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

function getFontPath(videoLanguage) {
  if (process.platform === 'win32') return FONT_PATH;
  // Try Noto fonts first, fallback to DejaVu
  const notoArabic = '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf';
  const notoCJK    = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc';
  const dejaVu     = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  switch (videoLanguage) {
    case 'ar': return fs.existsSync(notoArabic) ? notoArabic : dejaVu;
    case 'ja':
    case 'zh':
    case 'ko': return fs.existsSync(notoCJK) ? notoCJK : dejaVu;
    default:   return dejaVu;
  }
}

const RATIOS = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1':  { w: 720, h: 720 },
};

export const RATIO_ORIENTATION = {
  '16:9': 'landscape',
  '9:16': 'portrait',
  '1:1':  'square',
};

const DURATION_SCENES = {
  '30s': 4, '1min': 8, '2min': 17, '3min': 25, '4min': 34,
  '5min': 42, '8min': 56, '10min': 70, 'auto': 8,
};

const CAPTION_STYLES = {
  classic: {
    fontsize: 28, fontcolor: 'white', borderw: 2, bordercolor: 'black',
    box: 1, boxcolor: '0x00000088',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-60',
    maxChars: 50,
  },
  bold_yellow: {
    fontsize: 32, fontcolor: 'yellow', borderw: 3, bordercolor: 'black',
    box: 0, boxcolor: '0x00000000',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h*0.82',
    maxChars: 40,
  },
  center_box: {
    fontsize: 30, fontcolor: 'white', borderw: 0, bordercolor: 'black',
    box: 1, boxcolor: '0x0a0a2ecc',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h*0.82',
    maxChars: 45,
  },
  documentary: {
    fontsize: 26, fontcolor: '0x00ff88', borderw: 2, bordercolor: '0x003322',
    box: 1, boxcolor: '0x00000099',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-50',
    maxChars: 55,
  },
  clean_white: {
    fontsize: 30, fontcolor: 'white', borderw: 2, bordercolor: '0x00000077',
    box: 0, boxcolor: '0x00000000',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-60',
    maxChars: 50,
  },
};

const DEFAULT_CAPTION_STYLE = {
  motivational: 'bold_yellow',
  storytelling: 'classic',
  education: 'classic',
};

const VIDEO_EFFECTS = {
  none:       null,
  grayscale:  'hue=s=0',
  sepia:      'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
  vignette:   'vignette=PI/4',
  sharpen:    'unsharp=5:5:1.5:5:5:0',
  blur:       'gblur=sigma=2',
  brightness: 'eq=brightness=0.1:contrast=1.1',
  cinematic:  'colorchannelmixer=.9:0:0:0:0:.9:0:0:0:0:.8:0,eq=contrast=1.1:saturation=0.85',
};

function findMusicFile() {
  const dir = path.join(process.cwd(), 'assets', 'music');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (!files.length) return null;
  return path.join(dir, files[Math.floor(Math.random() * files.length)]);
}

function findSoundFile(name) {
  const dir = path.join(process.cwd(), 'assets', 'sounds');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().includes(name));
  if (!files.length) return null;
  return path.join(dir, files[0]);
}

function downloadFile(url, dest) {
  return fetch(url).then(res => new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(dest);
    res.body.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
  }));
}

function trimAndScale(input, output, duration, w, h) {
  return new Promise((resolve, reject) => {
    const scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
    ffmpeg(input)
      .inputOptions(['-stream_loop', '-1'])
      .duration(duration)
      .videoFilters(scaleFilter)
      .outputOptions([
        '-an', '-r', '30',
        '-c:v', 'libx264', '-crf', '23', '-preset', 'ultrafast',
        '-profile:v', 'baseline', '-level', '3.1',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function generateColorSlide(scene, output, duration, w, h) {
  const colors = { hook: '0x1a1a2e', body: '0x16213e', ending: '0x0f3460' };
  const color = colors[scene.type] || colors.body;
  const args = [
    '-f', 'lavfi', '-i', `color=c=${color}:size=${w}x${h}:rate=30`,
    '-t', String(duration),
    '-c:v', 'libx264', '-crf', '23', '-preset', 'ultrafast',
    '-profile:v', 'baseline', '-level', '3.1',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', output,
  ];
  return new Promise((resolve, reject) => {
    try { execSync('ffmpeg ' + args.join(' '), { stdio: 'pipe' }); resolve(); }
    catch (err) { reject(err); }
  });
}

function concatVideos(listFile, output) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listFile)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c:v', 'libx264', '-crf', '23', '-preset', 'ultrafast',
        '-profile:v', 'baseline', '-level', '3.1',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

async function concatWithTransitions(slideFiles, output, id, secPerScene) {
  if (slideFiles.length === 1) {
    fs.copyFileSync(slideFiles[0], output);
    return;
  }
  let current = slideFiles[0];
  for (let i = 1; i < slideFiles.length; i++) {
    const transOut = path.join(TEMP_DIR, 'trans_' + id + '_' + i + '.mp4');
    let currentDuration = secPerScene;
    try {
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${current}"`,
        { encoding: 'utf8' }
      ).trim();
      currentDuration = parseFloat(result) || secPerScene;
    } catch {}
    const offset = Math.max(currentDuration - 0.5, 0.5);
    const transTypes = ['fade', 'slideleft', 'slideright', 'slideup', 'dissolve', 'wipeleft', 'wiperight', 'circlecrop'];
    const transType = transTypes[i % transTypes.length];
    try {
      execSync(
        `ffmpeg -i "${current}" -i "${slideFiles[i]}"` +
        ` -filter_complex "[0:v][1:v]xfade=transition=${transType}:duration=0.5:offset=${offset}[v]"` +
        ` -map "[v]" -r 30 -c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${transOut}"`,
        { stdio: 'pipe' }
      );
      current = transOut;
    } catch(e) {
      console.warn('Transition failed for scene', i, e.message);
      const fallbackOut = path.join(TEMP_DIR, 'fallback_' + id + '_' + i + '.mp4');
      const listContent = [
        `file '${path.resolve(current).replace(/\\/g, '/')}'`,
        `file '${path.resolve(slideFiles[i]).replace(/\\/g, '/')}'`,
      ].join('\n');
      const tmpList = path.join(TEMP_DIR, `fallback_list_${id}_${i}.txt`);
      fs.writeFileSync(tmpList, listContent);
      try {
        execSync(
          `ffmpeg -f concat -safe 0 -i "${tmpList}" -c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${fallbackOut}"`,
          { stdio: 'pipe' }
        );
        current = fallbackOut;
      } catch(e2) {
        console.warn('Fallback concat also failed for scene', i, e2.message);
      }
    }
  }
  fs.copyFileSync(current, output);
}

function mixAudio(videoFile, audioFile, output, audioDuration) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoFile).input(audioFile)
      .outputOptions([
        '-map', '0:v', '-map', '1:a',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-t', String(audioDuration),
        '-movflags', '+faststart',
      ])
      .output(output).on('end', resolve).on('error', reject).run();
  });
}

function addMusicOnly(videoFile, musicFile, output, musicVolume = 0.08) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoFile).input(musicFile)
      .outputOptions([
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-shortest', '-af', `volume=${musicVolume}`, '-movflags', '+faststart',
      ])
      .output(output).on('end', resolve).on('error', reject).run();
  });
}

function mixAudioAndMusic(videoFile, voiceFile, musicFile, output, musicVolume = 0.07, audioDuration) {
  return new Promise((resolve, reject) => {
    const durationOpts = audioDuration ? ['-t', String(audioDuration)] : [];
    ffmpeg()
      .input(videoFile).input(voiceFile).input(musicFile)
      .complexFilter([
        `[2:a]volume=${musicVolume}[music]`,
        '[1:a][music]amix=inputs=2:duration=longest[aout]',
      ])
      .outputOptions([
        ...durationOpts,
        '-map', '0:v', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
        '-shortest', '-movflags', '+faststart',
      ])
      .output(output).on('end', resolve).on('error', reject).run();
  });
}

function addCaptionsWithTiming(videoFile, scenes, output, sceneDurations, videoType = 'education', captionStyle = null, ratio = '16:9', videoLanguage = 'en') {
  const styleName = captionStyle || DEFAULT_CAPTION_STYLE[videoType] || 'classic';
  const style = CAPTION_STYLES[styleName] || CAPTION_STYLES.classic;
  const fontfile = getFontPath(videoLanguage);

  function splitIntoChunks(text, wordsPerChunk = 3) {
    const words = text.replace(/[':]/g, '').replace(/\\/g, '').replace(/\n/g, ' ').trim().split(/\s+/);
    const chunks = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks.filter(Boolean);
  }

  let currentTime = 0;
  const filters = [];

  scenes.forEach((scene, i) => {
    const start = currentTime;
    const sceneDur = sceneDurations[i] || 7;
    const end = start + sceneDur;
    currentTime = end;
    const chunks = splitIntoChunks(scene.text, 3);
    const chunkDur = sceneDur / chunks.length;
    const yExpr = style.getY(ratio);

    chunks.forEach((chunk, j) => {
      const chunkStart = start + j * chunkDur;
      const chunkEnd = chunkStart + chunkDur;
      const safeChunk = chunk.replace(/\\/g, '').replace(/'/g, '').replace(/:/g, '').trim();
      if (!safeChunk) return;
      filters.push(
        `drawtext=fontfile='${fontfile}'`
        + `:text='${safeChunk}'`
        + `:fontsize=${style.fontsize}`
        + `:fontcolor=${style.fontcolor}`
        + `:borderw=${style.borderw}`
        + `:bordercolor=${style.bordercolor}`
        + (style.box ? `:box=1:boxcolor=${style.boxcolor}:boxborderw=8` : '')
        + `:x=(w-text_w)/2`
        + `:y=${yExpr}`
        + `:enable='between(t,${chunkStart.toFixed(3)},${chunkEnd.toFixed(3)})'`
      );
    });
  });

  if (filters.length === 0) {
    fs.copyFileSync(videoFile, output);
    return Promise.resolve();
  }

  const filterStr = filters.join(',');
  const absOutput = path.resolve(output);

  return new Promise((resolve) => {
    ffmpeg(videoFile)
      .videoFilters(filterStr)
      .outputOptions([
        '-c:a', 'copy', '-c:v', 'libx264', '-crf', '23', '-preset', 'ultrafast',
        '-profile:v', 'baseline', '-level', '3.1',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      ])
      .output(absOutput)
      .on('end', resolve)
      .on('error', (err) => {
        console.warn('Captions failed:', err.message);
        fs.copyFileSync(videoFile, output);
        resolve();
      })
      .run();
  });
}

function applyVideoEffect(videoFile, output, effectName) {
  const filter = VIDEO_EFFECTS[effectName];
  if (!filter) {
    fs.copyFileSync(videoFile, output);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    ffmpeg(videoFile)
      .videoFilters(filter)
      .outputOptions([
        '-c:a', 'copy', '-c:v', 'libx264', '-crf', '23', '-preset', 'ultrafast',
        '-profile:v', 'baseline', '-level', '3.1',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', resolve)
      .on('error', (err) => {
        console.warn('Video effect failed:', err.message);
        fs.copyFileSync(videoFile, output);
        resolve();
      })
      .run();
  });
}

async function addSoundEffects(videoFile, introSound, outroSound, whooshSound, scenes, output, sfxVolume = 0.4) {
  try {
    let filterInputs = `-i "${videoFile}"`;
    let amixInputs = '[0:a]';
    let inputCount = 1;
    if (introSound) { filterInputs += ` -i "${introSound}"`; amixInputs += `[${inputCount}:a]`; inputCount++; }
    if (outroSound)  { filterInputs += ` -i "${outroSound}"`;  amixInputs += `[${inputCount}:a]`; inputCount++; }
    const cmd = `ffmpeg ${filterInputs}`
      + ` -filter_complex "${amixInputs}amix=inputs=${inputCount}:duration=first:weights=1 ${sfxVolume}[aout]"`
      + ` -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -y "${output}"`;
    execSync(cmd, { stdio: 'pipe' });
  } catch(e) {
    console.warn('Sound effects failed:', e.message);
    fs.copyFileSync(videoFile, output);
  }
}

function getAudioDuration(audioFile) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`,
      { encoding: 'utf8' }
    ).trim();
    return parseFloat(result) || null;
  } catch {
    return null;
  }
}

function addWatermark(inputFile, outputFile) {
  const watermarkText = 'Erivion';
  const filterStr = [
    `drawtext=fontfile='${FONT_BOLD_PATH}':text='${watermarkText}':fontsize=90:fontcolor=white@0.18:x=(w-text_w)/2:y=(h-text_h)/2:borderw=2:bordercolor=black@0.10`,
    `drawtext=fontfile='${FONT_PATH}':text='© ${watermarkText}':fontsize=26:fontcolor=white@0.65:x=w-text_w-24:y=20:borderw=1:bordercolor=black@0.40`,
  ].join(',');
  return new Promise((resolve) => {
    try {
      execSync(
        `ffmpeg -i "${inputFile}" -vf "${filterStr}" -c:a copy -c:v libx264 -crf 23 -preset ultrafast -profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${outputFile}"`,
        { stdio: 'pipe' }
      );
      console.log('[Watermark] ✅ Done');
      resolve();
    } catch (err) {
      console.warn('[Watermark] Failed, skipping:', err.message);
      fs.copyFileSync(inputFile, outputFile);
      resolve();
    }
  });
}

async function buildVideoFromScenes(scenes, audioDuration, w, h, id, transitions) {
  const sceneCount = scenes.length;
  const secPerScene = audioDuration / sceneCount;
  console.log(`[Render] ${sceneCount} scenes | audio: ${audioDuration.toFixed(1)}s | sec/scene: ${secPerScene.toFixed(2)}s`);

  const slideFiles = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const slideFile = path.join(TEMP_DIR, `slide_${id}_${i}.mp4`);
    if (scene.aiVideo) {
      const aiVideoPath = path.join(process.cwd(), scene.aiVideo.replace('/outputs/', 'outputs/'));
      if (fs.existsSync(aiVideoPath)) {
        await trimAndScale(aiVideoPath, slideFile, secPerScene, w, h);
      } else {
        await generateColorSlide(scene, slideFile, secPerScene, w, h);
      }
    } else if (scene.media?.type === 'video' && scene.media?.url) {
      const clipFile = path.join(TEMP_DIR, `clip_${id}_${i}.mp4`);
      try {
        await downloadFile(scene.media.url, clipFile);
        await trimAndScale(clipFile, slideFile, secPerScene, w, h);
      } catch(e) {
        console.warn(`[Render] Scene ${i} download failed, using color slide:`, e.message);
        await generateColorSlide(scene, slideFile, secPerScene, w, h);
      }
    } else {
      await generateColorSlide(scene, slideFile, secPerScene, w, h);
    }
    slideFiles.push(slideFile);
    console.log(`[Render] Scene ${i + 1}/${sceneCount} done (${secPerScene.toFixed(1)}s)`);
  }

  const concatFile = path.join(TEMP_DIR, `concat_${id}.mp4`);
  if (transitions && slideFiles.length > 1) {
    await concatWithTransitions(slideFiles, concatFile, id, secPerScene);
  } else {
    const listFile = path.join(TEMP_DIR, `list_${id}.txt`);
    const listContent = slideFiles.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(listFile, listContent);
    await concatVideos(listFile, concatFile);
  }

  return { concatFile, slideFiles, secPerScene };
}

function trimVideoToAudio(inputFile, output, audioDuration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .outputOptions([
        '-t', String(audioDuration),
        '-c', 'copy',
        '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

export async function renderVideo({
  scenes, audioUrl, ratio = '16:9', jobId, duration = 'auto',
  music = false, captions = false, transitions = false,
  soundEffects = false, videoType = 'education', captionStyle = null,
  musicVolume = 0.07, sfxVolume = 0.4, videoEffect = 'none',
  applyWatermark = true, videoLanguage = 'en',
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['16:9'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);

  console.log(`[Render] START | ${scenes.length} scenes | ${ratio} (${w}x${h}) | effect: ${videoEffect}`);

  let audioPath = null;
  if (audioUrl) {
    const audioBasename = path.basename(audioUrl);
    const candidate = path.join(OUTPUTS_DIR, audioBasename);
    if (fs.existsSync(candidate) && fs.statSync(candidate).size > 1000) {
      audioPath = candidate;
    }
  }

  let audioDuration = null;
  if (audioPath) {
    audioDuration = getAudioDuration(audioPath);
    console.log(`[Render] Audio duration: ${audioDuration?.toFixed(1)}s`);
  }
  if (!audioDuration) {
    const durationMap = {
      '30s': 30, '1min': 60, '2min': 120, '3min': 180,
      '4min': 240, '5min': 300, '8min': 480, '10min': 600, 'auto': 60,
    };
    audioDuration = durationMap[duration] || (scenes.length * 7);
    console.log(`[Render] No audio - using estimated duration: ${audioDuration}s`);
  }

  // Add transition duration compensation
  const transitionCompensation = transitions && scenes.length > 1 ? (scenes.length - 1) * 0.5 : 0;
  const adjustedDuration = audioDuration + transitionCompensation;

  const { concatFile, slideFiles, secPerScene } = await buildVideoFromScenes(
    scenes, adjustedDuration, w, h, id, transitions
  );

  // Step 3: Mix audio
  const step3 = path.join(TEMP_DIR, `step3_${id}.mp4`);
  const musicPath = music ? findMusicFile() : null;
  if (audioPath && musicPath) {
    await mixAudioAndMusic(concatFile, audioPath, musicPath, step3, musicVolume, audioDuration);
  } else if (audioPath) {
    await mixAudio(concatFile, audioPath, step3, audioDuration);
  } else if (musicPath) {
    await addMusicOnly(concatFile, musicPath, step3, musicVolume);
  } else {
    fs.copyFileSync(concatFile, step3);
  }

  // Step 4: Sound effects
  const step4 = path.join(TEMP_DIR, `step4_${id}.mp4`);
  if (soundEffects) {
    const introSound = findSoundFile('intro');
    const outroSound  = findSoundFile('outro');
    const whooshSound = findSoundFile('whoosh');
    await addSoundEffects(step3, introSound, outroSound, whooshSound, scenes, step4, sfxVolume);
  } else {
    fs.copyFileSync(step3, step4);
  }

  // Step 5: Video effect
  const step5 = path.join(TEMP_DIR, `step5_${id}.mp4`);
  if (videoEffect && videoEffect !== 'none') {
    await applyVideoEffect(step4, step5, videoEffect);
  } else {
    fs.copyFileSync(step4, step5);
  }

  // Step 5.5: copy step5 to step55
  const step55 = path.join(TEMP_DIR, `step55_${id}.mp4`);
  fs.copyFileSync(step5, step55);

  // Step 6: Captions + Watermark
  const step6 = path.join(TEMP_DIR, `step6_${id}.mp4`);
  if (captions) {
    const captionTemp = path.resolve(TEMP_DIR, `captions_${id}.mp4`);
    const perScene = audioDuration / scenes.length;
    const sceneDurations = scenes.map(() => perScene);
    await addCaptionsWithTiming(step55, scenes, captionTemp, sceneDurations, videoType, captionStyle, ratio, videoLanguage);
    if (applyWatermark) {
      await addWatermark(captionTemp, step6);
      console.log('[Watermark] Applied (free plan)');
    } else {
      fs.copyFileSync(captionTemp, step6);
      console.log('[Watermark] Skipped (paid plan)');
    }
    try { if (fs.existsSync(captionTemp)) fs.unlinkSync(captionTemp); } catch {}
  } else {
    if (applyWatermark) {
      await addWatermark(step55, step6);
      console.log('[Watermark] Applied (free plan)');
    } else {
      fs.copyFileSync(step55, step6);
      console.log('[Watermark] Skipped (paid plan)');
    }
  }

  // Final output
  fs.copyFileSync(step6, outputPath);

  // Cleanup
  setTimeout(() => {
    [...slideFiles, concatFile, step3, step4, step5, step55, step6].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
    slideFiles.forEach((_, i) => {
      const clipFile = path.join(TEMP_DIR, `clip_${id}_${i}.mp4`);
      try { if (fs.existsSync(clipFile)) fs.unlinkSync(clipFile); } catch {}
    });
  }, 60000);

  console.log(`[Render] DONE → ${outputPath}`);
  return outputFile;
}

export const VIDEO_EFFECT_OPTIONS = Object.keys(VIDEO_EFFECTS);