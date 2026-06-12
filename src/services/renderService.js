import ffmpeg from 'fluent-ffmpeg';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';
const FONT_PATH = process.platform === 'win32' ? 'C\\:/Windows/Fonts/arial.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_BOLD_PATH = process.platform === 'win32' ? 'C\\:/Windows/Fonts/arialbd.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

function getFontPath(videoLanguage) {
  if (process.platform === 'win32') return FONT_PATH;
  const dejaVu = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const langCode = { ar:'ar', ja:'ja', zh:'zh', ko:'ko', ru:'ru', de:'de', fr:'fr', es:'es', pt:'pt' }[videoLanguage];
  if (!langCode) return dejaVu;
  try {
    const result = execSync(
      `fc-list :lang=${langCode} | grep -v '\\[' | head -1`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim().split(':')[0].trim();
    if (result && fs.existsSync(result)) {
      console.log('[Font] Using:', result);
      return result;
    }
  } catch (e) {
    console.warn('[Font] fc-list failed:', e.message);
  }
  console.warn('[Font] Fallback DejaVu for:', videoLanguage);
  return dejaVu;
}

const RATIOS = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1':  { w: 1080, h: 1080 },
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
    fontsize: 34, fontcolor: 'white', borderw: 3, bordercolor: 'black',
    box: 1, boxcolor: '0x000000aa',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-80',
    maxChars: 50,
  },
  bold_yellow: {
    fontsize: 38, fontcolor: 'yellow', borderw: 4, bordercolor: 'black',
    box: 0, boxcolor: '0x00000000',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-70',
    maxChars: 40,
  },
  center_box: {
    fontsize: 34, fontcolor: 'white', borderw: 0, bordercolor: 'black',
    box: 1, boxcolor: '0x0a0a2eee',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-70',
    maxChars: 45,
  },
  documentary: {
    fontsize: 32, fontcolor: '0x00ff88', borderw: 2, bordercolor: '0x003322',
    box: 1, boxcolor: '0x000000bb',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-80',
    maxChars: 55,
  },
  clean_white: {
    fontsize: 36, fontcolor: 'white', borderw: 3, bordercolor: '0x00000099',
    box: 0, boxcolor: '0x00000000',
    getY: (ratio) => ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-80',
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

const TRANSITION_DURATION = 0.5;

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
        '-threads', '2',
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
    '-crf', '18',
    '-preset', 'fast',
    '-profile:v', 'high',
    '-level', '4.1',
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
        '-crf', '16',
        '-preset', 'fast',
        '-profile:v', 'high',
        '-level', '4.1',
        '-b:v', '4M',
        '-maxrate', '6M',
        '-bufsize', '8M',
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

    const offset = Math.max(currentDuration - TRANSITION_DURATION, TRANSITION_DURATION);

    const transTypes = ['fade', 'slideleft', 'slideright', 'slideup', 'dissolve', 'wipeleft', 'wiperight', 'circlecrop', 'rectcrop', 'distance'];
    const transType = transTypes[i % transTypes.length];
    try {
      execSync(
        `ffmpeg -i "${current}" -i "${slideFiles[i]}"` +
        ` -filter_complex "[0:v][1:v]xfade=transition=${transType}:duration=${TRANSITION_DURATION}:offset=${offset}[v]"` +
        ` -map "[v]" -r 30 -c:v libx264 -crf 18 -preset fast -profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${transOut}"`,
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
          `ffmpeg -f concat -safe 0 -i "${tmpList}" -c:v libx264 -crf 18 -preset fast -profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${fallbackOut}"`,
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
        '-shortest',
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
        '-shortest',
        '-movflags', '+faststart',
      ])
      .output(output).on('end', resolve).on('error', reject).run();
  });
}

// ✅ FIX: إضافة videoLanguage parameter عشان يختار الفونت الصح
function addCaptionsWithTiming(videoFile, scenes, output, sceneDurations, videoType = 'education', captionStyle = null, ratio = '16:9', videoLanguage = 'en', applyWm = false) {
  const styleName = captionStyle || DEFAULT_CAPTION_STYLE[videoType] || 'classic';
  const style = CAPTION_STYLES[styleName] || CAPTION_STYLES.classic;
  const fontfile = style.fontfile || getFontPath(videoLanguage);
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(videoLanguage);

  // بنبني الـ chunks مع timestamps
  const chunks = [];
  let currentTime = 0;
  const WORDS_PER_CHUNK = isRTL ? 3 : 4;

  scenes.forEach((scene, i) => {
    const sceneDur = sceneDurations[i] || 7;
    const words = scene.text
      .replace(/[':]/g, '').replace(/\\/g, '').replace(/\n/g, ' ')
      .trim().split(/\s+/).filter(Boolean);
    const chunkCount = Math.ceil(words.length / WORDS_PER_CHUNK);
    const chunkDur = sceneDur / Math.max(chunkCount, 1);

    for (let j = 0; j < chunkCount; j++) {
      const slice = words.slice(j * WORDS_PER_CHUNK, (j + 1) * WORDS_PER_CHUNK);
      const text = slice.join(' ');
      chunks.push({
        text,
        start: currentTime + j * chunkDur,
        end: currentTime + (j + 1) * chunkDur,
      });
    }
    currentTime += sceneDur;
  });

  // للعربي: ASS subtitles عشان RTL صح
  if (isRTL) {
    const assFile = path.join(TEMP_DIR, `captions_timing_${Date.now()}.ass`);
    const fontName = fontfile.includes('Naskh') ? 'Noto Naskh Arabic' :
                     fontfile.includes('Noto') ? 'Noto Sans Arabic' : 'DejaVu Sans';
    try {
      const assContent = buildAssFile(chunks, style, ratio, videoLanguage, fontName);
      fs.writeFileSync(assFile, assContent, 'utf8');
      const safeAss = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
      return new Promise((resolve) => {
        ffmpeg(videoFile)
          .outputOptions([
            '-vf', `subtitles='${safeAss}':fontsdir='${path.dirname(fontfile)}',${applyWm ? getWatermarkFilter() : 'null'}`.replace(',null',''),
            '-c:a', 'copy',
            '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
            '-profile:v', 'high', '-level', '4.1',
            '-b:v', '4M', '-maxrate', '6M', '-bufsize', '8M',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          ])
          .output(path.resolve(output))
          .on('end', () => { try { fs.unlinkSync(assFile); } catch {} resolve(); })
          .on('error', (err) => {
            console.warn('[Captions] ASS failed:', err.message.slice(0, 80));
            try { fs.unlinkSync(assFile); } catch {}
            fs.copyFileSync(videoFile, output); resolve();
          })
          .run();
      });
    } catch (e) {
      console.warn('[Captions] ASS build failed:', e.message);
      fs.copyFileSync(videoFile, output);
      return Promise.resolve();
    }
  }

  // LTR: drawtext مع شكل أحسن
  const yExpr = style.getY(ratio);
  const filters = chunks.map(chunk => {
    const safeText = chunk.text
      .replace(/['"`:\\<>{}|]/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    return `drawtext=fontfile='${fontfile}'`
      + `:text='${safeText}'`
      + `:fontsize=${style.fontsize}`
      + `:fontcolor=${style.fontcolor}`
      + `:borderw=${style.borderw}`
      + `:bordercolor=${style.bordercolor}`
      + (style.box ? `:box=1:boxcolor=${style.boxcolor}:boxborderw=10` : '')
      + `:x=(w-text_w)/2`
      + `:y=${yExpr}`
      + `:enable='between(t,${chunk.start.toFixed(3)},${chunk.end.toFixed(3)})'`;
  });

  const ltrFilters = applyWm ? [...filters, getWatermarkFilter()] : filters;
  return new Promise((resolve) => {
    ffmpeg(videoFile)
      .videoFilters(ltrFilters.join(','))
      .outputOptions([
        '-c:a', 'copy',
        '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
        '-profile:v', 'high', '-level', '4.1',
        '-b:v', '4M', '-maxrate', '6M', '-bufsize', '8M',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      ])
      .output(path.resolve(output))
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
        '-crf', '18',
        '-preset', 'fast',
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
      + ` -map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 320k -movflags +faststart -y "${output}"`;
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

function getWatermarkFilter() {
  const watermarkText = 'Erivion';
  return [
    `drawtext=fontfile='${FONT_BOLD_PATH}'` +
    `:text='${watermarkText}'` +
    `:fontsize=90` +
    `:fontcolor=white@0.18` +
    `:x=(w-text_w)/2` +
    `:y=(h-text_h)/2` +
    `:borderw=2` +
    `:bordercolor=black@0.10`,
    `drawtext=fontfile='${FONT_PATH}'` +
    `:text='© ${watermarkText}'` +
    `:fontsize=26` +
    `:fontcolor=white@0.65` +
    `:x=w-text_w-24` +
    `:y=20` +
    `:borderw=1` +
    `:bordercolor=black@0.40`,
  ].join(',');
}

function addWatermark(inputFile, outputFile) {
  const filterStr = getWatermarkFilter();
  return new Promise((resolve) => {
    try {
      execSync(
        `ffmpeg -i "${inputFile}" -vf "${filterStr}" -c:a copy -c:v libx264 -crf 18 -preset fast -profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${outputFile}"`,
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
  const videoDuration = audioDuration + 3;
  const totalTransitionOverlap = transitions && sceneCount > 1
    ? (sceneCount - 1) * TRANSITION_DURATION
    : 0;
  const secPerScene = (videoDuration + totalTransitionOverlap) / sceneCount;
  console.log(`[Render] ${sceneCount} scenes | audio: ${audioDuration.toFixed(1)}s | video: ${videoDuration.toFixed(1)}s | sec/scene: ${secPerScene.toFixed(2)}s`);

  // ── Sequential scene processing ──────────────────────────────────────────
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
    await concatVideos(listFile, concatFile);  }

  return { concatFile, slideFiles, secPerScene };
}

function finalizeVideo(inputFile, output) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputFile)
      .outputOptions([
        '-c', 'copy',
        '-movflags', '+faststart',
      ])
      .output(output)
      .on('end', resolve)
      .on('error', (err) => {
        ffmpeg(inputFile)
          .outputOptions([
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


// ── Groq Whisper: Real Captions with word-level timing ──────────────────────
async function transcribeWithWhisper(audioPath) {
  try {
    const { default: fetch } = await import('node-fetch');
    const { default: FormData } = await import('form-data');
    const audioBuffer = fs.readFileSync(audioPath);
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.GROQ_API_KEY,
        ...formData.getHeaders(),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn('[Whisper] Failed:', err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    console.log(`[Whisper] Transcribed ${data.words?.length || 0} words`);
    return data.words || null;
  } catch (e) {
    console.warn('[Whisper] Error:', e.message);
    return null;
  }
}

// ── توليد ملف ASS للـ subtitles ────────────────────────────────────────────
function buildAssFile(chunks, style, ratio, videoLanguage, fontName) {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(videoLanguage);
  const fs_size = Math.round((style.fontsize || 34) * 1.2); // أكبر شوية في ASS
  const color = style.fontcolor === 'white' ? '&H00FFFFFF' :
                style.fontcolor === 'yellow' ? '&H0000FFFF' :
                style.fontcolor.startsWith('0x') ? `&H00${style.fontcolor.slice(2).toUpperCase()}` : '&H00FFFFFF';
  const outline = style.borderw || 2;
  const shadow = style.box ? 1 : 0;
  const backColor = '&H88000000';
  // نحدد الـ alignment: 2=bottom center, 5=middle center
  const alignment = (ratio === '9:16' || ratio === '1:1') ? 5 : 2;
  const marginV = (ratio === '9:16' || ratio === '1:1') ? 0 : 60;

  const toAssTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const cs = Math.round((s % 1) * 100);
    return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  };

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fs_size},${color},&H000000FF,&H00000000,${backColor},-1,0,0,0,100,100,0,0,1,${outline},${shadow},${alignment},10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = chunks.map(chunk => {
    let text = chunk.text.replace(/['"`\\{}|<>]/g, '').replace(/\n/g, ' ').trim();
    // للـ RTL: نضيف override للـ alignment حسب الـ ratio
    if (isRTL) {
      const anCode = (ratio === '9:16' || ratio === '1:1') ? 5 : 2;
      text = `{\\an${anCode}}‏${text}`;
    }
    return `Dialogue: 0,${toAssTime(chunk.start)},${toAssTime(chunk.end)},Default,,0,0,0,,${text}`;
  }).join('\n');

  return header + events;
}

// ── Real Captions using Whisper word timestamps ────────────────────────────
async function addRealCaptions(videoFile, audioPath, output, captionStyle, ratio, videoLanguage, applyWm = false) {
  const styleName = captionStyle || 'classic';
  const style = CAPTION_STYLES[styleName] || CAPTION_STYLES.classic;
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(videoLanguage);
  const fontfile = getFontPath(videoLanguage);

  // Try Whisper first
  const words = await transcribeWithWhisper(audioPath);

  if (!words || words.length === 0) {
    console.warn('[Captions] Whisper failed, no captions added');
    fs.copyFileSync(videoFile, output);
    return;
  }

  // Group words into chunks
  const WORDS_PER_CHUNK = isRTL ? 3 : 4;
  const chunks = [];
  for (let i = 0; i < words.length; i += WORDS_PER_CHUNK) {
    const group = words.slice(i, i + WORDS_PER_CHUNK);
    const text = group.map(w => w.word).join(' ').trim();
    const start = group[0].start;
    const end = group[group.length - 1].end;
    if (text) chunks.push({ text, start, end });
  }

  console.log(`[Captions] ${chunks.length} chunks from ${words.length} words | RTL: ${isRTL}`);

  if (chunks.length === 0) {
    fs.copyFileSync(videoFile, output);
    return;
  }

  // للعربي: نستخدم ASS subtitles عشان تدعم RTL صح
  if (isRTL) {
    const assFile = path.join(TEMP_DIR, `captions_${Date.now()}.ass`);
    // نحدد اسم الفونت من المسار
    const fontName = fontfile.includes('Naskh') ? 'Noto Naskh Arabic' :
                     fontfile.includes('Noto') ? 'Noto Sans Arabic' :
                     fontfile.includes('DejaVu') ? 'DejaVu Sans' : 'Arial';
    try {
      const assContent = buildAssFile(chunks, style, ratio, videoLanguage, fontName);
      fs.writeFileSync(assFile, assContent, 'utf8');
      // نستخدم subtitles filter مع force_style لـ RTL
      await new Promise((resolve) => {
        const safeAssFile = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
        ffmpeg(videoFile)
          .outputOptions([
            '-vf', `subtitles='${safeAssFile}':fontsdir='${path.dirname(fontfile)}',${applyWm ? getWatermarkFilter() : 'null'}`.replace(',null',''),
            '-c:a', 'copy',
            '-c:v', 'libx264',
            '-crf', '18',
            '-preset', 'fast',
            '-profile:v', 'high',
            '-level', '4.1',
            '-b:v', '4M',
            '-maxrate', '6M',
            '-bufsize', '8M',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
          ])
          .output(path.resolve(output))
          .on('end', () => {
            try { fs.unlinkSync(assFile); } catch {}
            console.log('[Captions] ✅ RTL ASS captions + watermark merged');
            resolve();
          })
          .on('error', (err) => {
            console.warn('[Captions] ASS failed, trying drawtext:', err.message.slice(0, 80));
            try { fs.unlinkSync(assFile); } catch {}
            fs.copyFileSync(videoFile, output);
            resolve();
          })
          .run();
      });
      return;
    } catch (e) {
      console.warn('[Captions] ASS build failed:', e.message);
    }
  }

  // للـ LTR: نستخدم drawtext العادي
  const yExpr = style.getY(ratio);
  const filters = chunks.map(chunk => {
    const safeText = chunk.text
      .replace(/['"`:\\<>{}|]/g, '')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return `drawtext=fontfile='${fontfile}'`
      + `:text='${safeText}'`
      + `:fontsize=${style.fontsize}`
      + `:fontcolor=${style.fontcolor}`
      + `:borderw=${style.borderw}`
      + `:bordercolor=${style.bordercolor}`
      + (style.box ? `:box=1:boxcolor=${style.boxcolor}:boxborderw=8` : '')
      + `:x=(w-text_w)/2`
      + `:y=${yExpr}`
      + `:enable='between(t,${chunk.start.toFixed(3)},${chunk.end.toFixed(3)})'`;
  });

  if (filters.length === 0) {
    fs.copyFileSync(videoFile, output);
    return;
  }

  const allFilters = applyWm ? [...filters, getWatermarkFilter()] : filters;

  return new Promise((resolve) => {
    ffmpeg(videoFile)
      .videoFilters(allFilters.join(','))
      .outputOptions([
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-crf', '18',
        '-preset', 'fast',
        '-profile:v', 'high',
        '-level', '4.1',
        '-b:v', '4M',
        '-maxrate', '6M',
        '-bufsize', '8M',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
      ])
      .output(path.resolve(output))
      .on('end', () => { console.log('[Captions] ✅ LTR captions + watermark merged'); resolve(); })
      .on('error', (err) => {
        console.warn('[Captions] Failed:', err.message.slice(0, 100));
        fs.copyFileSync(videoFile, output);
        resolve();
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
  videoLanguage = 'en',
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['16:9'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);

  console.log(`[Render] START | ${scenes.length} scenes | ${ratio} (${w}x${h}) | effect: ${videoEffect} | lang: ${videoLanguage}`);

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

  const step6 = path.join(TEMP_DIR, `step6_${id}.mp4`);

  // ── Captions + Watermark merged in ONE pass ──────────────────────────────
  if (captions) {
    await mkdir(TEMP_DIR, { recursive: true });
    if (audioPath && process.env.GROQ_API_KEY) {
      console.log('[Captions] Using Groq Whisper for real captions');
      await addRealCaptions(step5, audioPath, step6, captionStyle, ratio, videoLanguage, applyWatermark);
    } else {
      const totalDur = audioDuration || (secPerScene * scenes.length);
      const perScene = totalDur / scenes.length;
      const sceneDurations = scenes.map(() => perScene);
      await addCaptionsWithTiming(step5, scenes, step6, sceneDurations, videoType, captionStyle, ratio, videoLanguage, applyWatermark);
    }
    console.log(`[Watermark] ${applyWatermark ? 'Merged with captions' : 'Skipped (paid plan)'}`);
  } else {
    if (applyWatermark) {
      await addWatermark(step5, step6);
      console.log('[Watermark] Applied (free plan)');
    } else {
      fs.copyFileSync(step5, step6);
      console.log('[Watermark] Skipped (paid plan)');
    }
  }

  await finalizeVideo(step6, outputPath);

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
// Export alias for Model 3/4/5
export { addRealCaptions as addRealCaptionsForModel };
export { addCaptionsWithTiming as addCaptionsWithTimingForModel };