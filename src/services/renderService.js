import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = 'temp';
const FONT_PATH = 'C\\:/Windows/Fonts/arial.ttf';
const FONT_BOLD_PATH = 'C\\:/Windows/Fonts/arialbd.ttf';

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
    fontsize: 40, fontcolor: 'white', borderw: 2, bordercolor: 'black',
    box: 1, boxcolor: '0x00000088', getY: () => 'h-text_h-80', maxChars: 70,
  },
  bold_yellow: {
    fontsize: 52, fontcolor: 'yellow', borderw: 4, bordercolor: 'black',
    box: 0, boxcolor: '0x00000000', getY: () => 'h*0.85', maxChars: 50,
    fontfile: 'C\\:/Windows/Fonts/arialbd.ttf',
  },
  center_box: {
    fontsize: 44, fontcolor: 'white', borderw: 0, bordercolor: 'black',
    box: 1, boxcolor: '0x0a0a2ecc', getY: () => 'h*0.85', maxChars: 60,
  },
  documentary: {
    fontsize: 36, fontcolor: '0x00ff88', borderw: 2, bordercolor: '0x003322',
    box: 1, boxcolor: '0x00000099', getY: () => 'h-text_h-60', maxChars: 75,
  },
  clean_white: {
    fontsize: 46, fontcolor: 'white', borderw: 3, bordercolor: '0x00000077',
    box: 0, boxcolor: '0x00000000', getY: () => 'h-text_h-100', maxChars: 65,
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
        '-an',
        '-r', '30',
        '-c:v', 'libx264',
        '-crf', '23',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
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
    '-f', 'lavfi',
    '-i', `color=c=${color}:size=${w}x${h}:rate=30`,
    '-t', String(duration),
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'ultrafast',
    '-profile:v', 'baseline',
    '-level', '3.1',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y', output,
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
        '-c:v', 'libx264',
        '-crf', '23',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
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

    try {
      execSync(
        `ffmpeg -i "${current}" -i "${slideFiles[i]}"` +
        ` -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=${offset}[v]"` +
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

function mixAudio(videoFile, audioFile, output) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoFile).input(audioFile)
      .outputOptions([
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
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
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-shortest',
        '-af', `volume=${musicVolume}`,
        '-movflags', '+faststart',
      ])
      .output(output).on('end', resolve).on('error', reject).run();
  });
}

function mixAudioAndMusic(videoFile, voiceFile, musicFile, output, musicVolume = 0.07) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(videoFile).input(voiceFile).input(musicFile)
      .complexFilter([
        `[2:a]volume=${musicVolume}[music]`,
        '[1:a][music]amix=inputs=2:duration=longest[aout]',
      ])
      .outputOptions([
        '-map', '0:v',
        '-map', '[aout]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
      ])
      .output(output).on('end', resolve).on('error', reject).run();
  });
}

function addCaptionsWithTiming(videoFile, scenes, output, sceneDurations, videoType = 'education', captionStyle = null) {
  const styleName = captionStyle || DEFAULT_CAPTION_STYLE[videoType] || 'classic';
  const style = CAPTION_STYLES[styleName] || CAPTION_STYLES.classic;
  const fontfile = style.fontfile || FONT_PATH;

  let currentTime = 0;
  const filters = scenes.map((scene, i) => {
    const start = currentTime;
    const sceneDur = sceneDurations[i] || 7;
    const end = start + sceneDur;
    currentTime = end;

    const text = scene.text
      .substring(0, style.maxChars)
      .replace(/[':]/g, '')
      .replace(/\\/g, '')
      .replace(/\n/g, ' ')
      .trim();
    const yExpr = style.getY();

    return `drawtext=fontfile='${fontfile}'`
      + `:text='${text}'`
      + `:fontsize=${style.fontsize}`
      + `:fontcolor=${style.fontcolor}`
      + `:borderw=${style.borderw}`
      + `:bordercolor=${style.bordercolor}`
      + (style.box ? `:box=1:boxcolor=${style.boxcolor}:boxborderw=10` : '')
      + `:x=(w-text_w)/2`
      + `:y=${yExpr}`
      + `:enable='between(t,${start.toFixed(3)},${end.toFixed(3)})'`;
  }).join(',');

  return new Promise((resolve, reject) => {
    ffmpeg(videoFile)
      .videoFilters(filters)
      .outputOptions([
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-crf', '23',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(output)
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
  return new Promise((resolve, reject) => {
    ffmpeg(videoFile)
      .videoFilters(filter)
      .outputOptions([
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-crf', '23',
        '-preset', 'ultrafast',
        '-profile:v', 'baseline',
        '-level', '3.1',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
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

// ✅ WATERMARK FUNCTION - بتضيف Erivion watermark على كل الفيديوهات
function addWatermark(inputFile, outputFile) {
  const watermarkText = 'Erivion';

  // بنستخدم execSync مباشرة عشان نتحكم في الـ filter بدقة
  // بدون angle عشان بيسبب مشاكل في بعض versions الـ FFmpeg
  const filterStr = [
    // نص كبير في النص - شفافية 18% ثابت طول الفيديو
    `drawtext=fontfile='${FONT_BOLD_PATH}'` +
    `:text='${watermarkText}'` +
    `:fontsize=90` +
    `:fontcolor=white@0.18` +
    `:x=(w-text_w)/2` +
    `:y=(h-text_h)/2` +
    `:borderw=2` +
    `:bordercolor=black@0.10`,

    // نص صغير © Erivion في أعلى يمين - شفافية 65%
    `drawtext=fontfile='${FONT_PATH}'` +
    `:text='© ${watermarkText}'` +
    `:fontsize=26` +
    `:fontcolor=white@0.65` +
    `:x=w-text_w-24` +
    `:y=20` +
    `:borderw=1` +
    `:bordercolor=black@0.40`,
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

function finalizeVideo(inputFile, output, audioDuration = null) {
  return new Promise((resolve, reject) => {
    // ✅ FIX: trim to audio duration to prevent last frame freeze
    const durationOpts = audioDuration ? ['-t', String(audioDuration)] : [];
    ffmpeg(inputFile)
      .outputOptions([
        ...durationOpts,
        '-c', 'copy',
        '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', resolve)
      .on('error', (err) => {
        ffmpeg(inputFile)
          .outputOptions([
            ...durationOpts,
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-crf', '23',
            '-preset', 'ultrafast',
            '-profile:v', 'baseline',
            '-level', '3.1',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
          ])
          .output(output)
          .on('end', resolve)
          .on('error', reject)
          .run();
      })
      .run();
  });
}

export async function renderVideo({
  scenes,
  audioUrl,
  ratio = '16:9',
  jobId,
  duration = 'auto',
  music = false,
  captions = false,
  transitions = false,
  soundEffects = false,
  videoType = 'education',
  captionStyle = null,
  musicVolume = 0.07,
  sfxVolume = 0.4,
  videoEffect = 'none',
  applyWatermark = true,
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

  const { concatFile, slideFiles, secPerScene } = await buildVideoFromScenes(
    scenes, audioDuration, w, h, id, transitions
  );

  const step3 = path.join(TEMP_DIR, `step3_${id}.mp4`);
  const musicPath = music ? findMusicFile() : null;

  if (audioPath && musicPath) {
    await mixAudioAndMusic(concatFile, audioPath, musicPath, step3, musicVolume);
  } else if (audioPath) {
    await mixAudio(concatFile, audioPath, step3);
  } else if (musicPath) {
    await addMusicOnly(concatFile, musicPath, step3, musicVolume);
  } else {
    fs.copyFileSync(concatFile, step3);
  }

  const step4 = path.join(TEMP_DIR, `step4_${id}.mp4`);
  if (soundEffects) {
    const introSound = findSoundFile('intro');
    const outroSound  = findSoundFile('outro');
    const whooshSound = findSoundFile('whoosh');
    await addSoundEffects(step3, introSound, outroSound, whooshSound, scenes, step4, sfxVolume);
  } else {
    fs.copyFileSync(step3, step4);
  }

  const step5 = path.join(TEMP_DIR, `step5_${id}.mp4`);
  if (videoEffect && videoEffect !== 'none') {
    await applyVideoEffect(step4, step5, videoEffect);
  } else {
    fs.copyFileSync(step4, step5);
  }

  // ✅ WATERMARK STEP - بيتضاف بس للـ free plan
  const step6 = path.join(TEMP_DIR, `step6_${id}.mp4`);

  if (captions) {
    const captionTemp = path.join(TEMP_DIR, `captions_${id}.mp4`);
    // ✅ FIX: use actual audio duration for caption timing, not estimated
    const totalDur = audioDuration || (secPerScene * scenes.length);
    const perScene = totalDur / scenes.length;
    const sceneDurations = scenes.map(() => perScene);
    await addCaptionsWithTiming(step5, scenes, captionTemp, sceneDurations, videoType, captionStyle);
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
      await addWatermark(step5, step6);
      console.log('[Watermark] Applied (free plan)');
    } else {
      fs.copyFileSync(step5, step6);
      console.log('[Watermark] Skipped (paid plan)');
    }
  }

  // الـ output النهائي من step6
  await finalizeVideo(step6, outputPath, audioDuration);

  // ✅ Cleanup بعد دقيقة
  setTimeout(() => {
    [...slideFiles, concatFile, step3, step4, step5, step6].forEach(f => {
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