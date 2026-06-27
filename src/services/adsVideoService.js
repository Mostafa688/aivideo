// ── adsVideoService.js ────────────────────────────────────────────────────────
import fetch from 'node-fetch';
import fs from 'fs';
import { execFile, execSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateVoiceover } from './voiceService.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

// ── Scene configs — prompts ذكية حسب نوع المنتج ──────────────────────────────
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc) =>
      `Product photography advertisement. The exact same ${product} from the reference photo — keep every detail identical. Placed on a sleek dark gradient surface with dramatic overhead studio lighting, perfect reflections, 8K commercial photography, luxury advertisement quality. ${desc}.`,
    motion: `Camera slowly orbits the product 20 degrees clockwise, subtle specular light shimmer across surface, cinematic slow motion product reveal, luxury advertisement`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle Scene',
    buildPrompt: (product, desc) =>
      `Lifestyle advertisement photo. The exact same ${product} from the reference photo placed in a perfectly matching real-world environment for this type of product: ${desc}. Warm natural side lighting, aspirational elegant scene, shallow depth of field background, commercial photography style, photorealistic.`,
    motion: `Gentle cinematic parallax, slow zoom out revealing elegant lifestyle context, warm bokeh particles float softly, aspirational advertisement feel`,
  },
  {
    id: 'closeup',
    label: 'Close-up Detail',
    buildPrompt: (product, desc) =>
      `Macro product photography. Extreme close-up of the exact same ${product} from the reference photo revealing exquisite material texture and craftsmanship. ${desc}. Ultra-shallow depth of field with smooth bokeh, razor-sharp product detail, luxury product photography, cinematic.`,
    motion: `Ultra-slow push-in macro, microscopic product surface details emerge, barely perceptible camera drift left, cinematic luxury feel`,
  },
  {
    id: 'angle45',
    label: '45° Angle',
    buildPrompt: (product, desc) =>
      `Commercial product photo. The exact same ${product} from the reference photo shot from a dynamic 45-degree angle on a reflective dark marble surface. ${desc}. Dramatic Rembrandt-style side lighting creating a long elegant shadow, high-end brand photography, luxury advertisement.`,
    motion: `Slow cinematic dolly left to right, dramatic shadow glides across marble, spotlight follows the product, elegant refined motion`,
  },
  {
    id: 'minimal',
    label: 'Minimal White',
    buildPrompt: (product, desc) =>
      `Minimalist product advertisement. The exact same ${product} from the reference photo on a perfectly white seamless background with a soft natural shadow beneath. ${desc}. Clean Apple-style aesthetic, high contrast, crisp modern commercial photography, premium brand feel.`,
    motion: `Product levitates gently upward 8px and settles back, clean minimal bounce, crisp modern motion, soft shadow pulses beneath`,
  },
  {
    id: 'action',
    label: 'Action / In Use',
    buildPrompt: (product, desc) =>
      `Dynamic product-in-use advertisement. The exact same ${product} from the reference photo shown being elegantly used in its ideal context. ${desc}. Motion implied, cinematic depth shift, aspirational lifestyle energy, dramatic lighting, professional commercial photography.`,
    motion: `Cinematic camera arc reveals product in use, dynamic depth of field shift, aspirational energy, professional advertisement motion`,
  },
];

const SCRIPT_TEMPLATES = {
  ar: (name, desc, hook) => `${hook || `هل تعرف سر ${name}؟`}\n\n${desc}\n\nصُنع بدقة. صُمم لك.\n\n${name} — لأنك تستحق الأفضل.`,
  en: (name, desc, hook) => `${hook || `What if one product could change everything?`}\n\nIntroducing ${name}.\n\n${desc}\n\nCrafted with precision. Designed for you.\n\n${name} — Because you deserve the best.`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} - ${url}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
  return destPath;
}

// ── Upload product image to Replicate Files API (returns URL) ─────────────────
async function uploadImageToReplicate(base64Data) {
  const b64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(b64, 'base64');

  const res = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'image/jpeg',
      'Content-Length': String(buffer.length),
    },
    body: buffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Replicate file upload failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data.urls?.get || data.url;
  if (!url) throw new Error('No URL returned from Replicate file upload');
  console.log(`[AdsService] Product image uploaded to Replicate: ${url}`);
  return url;
}

// ── FLUX kontext-dev ──────────────────────────────────────────────────────────
async function generateAdSceneImage(productImageUrl, productName, productDesc, sceneConfig, ratio) {
  const prompt = sceneConfig.buildPrompt(productName, productDesc);

  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        image: productImageUrl,   // ← URL مش base64
        prompt,
        aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
        output_format: 'webp',
        output_quality: 90,
        guidance: 3.5,
        num_inference_steps: 28,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FLUX error ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`FLUX: ${data.error}`);

  if (data.status === 'succeeded' && data.output) {
    return Array.isArray(data.output) ? data.output[0] : data.output;
  }

  // Poll
  if (!data.id) throw new Error('No prediction ID from FLUX');
  const maxWait = 180000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    const pollData = await pollRes.json();
    console.log(`[AdsService] FLUX "${sceneConfig.label}" → ${pollData.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (pollData.status === 'succeeded') return Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
    if (pollData.status === 'failed' || pollData.status === 'canceled') throw new Error(`FLUX failed: ${pollData.error}`);
  }
  throw new Error('FLUX timed out');
}

// ── Seedance 1-pro-fast ───────────────────────────────────────────────────────
async function animateSceneImage(fluxImageUrl, motionPrompt, ratio, jobId, sceneIndex) {
  // حمّل صورة FLUX محلياً وارفعها على Railway عشان Seedance يقدر يوصلها
  const framesDir = join(process.cwd(), 'outputs', 'ads_frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const frameFilename = `frame_${jobId}_${sceneIndex}.jpg`;
  const framePath = join(framesDir, frameFilename);

  await downloadFile(fluxImageUrl, framePath);

  const RAILWAY_URL = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : (process.env.BASE_URL || 'http://localhost:3000');
  const frameUrl = `${RAILWAY_URL}/outputs/ads_frames/${frameFilename}`;
  console.log(`[AdsService] Frame URL for Seedance: ${frameUrl}`);

  const input = {
    prompt: motionPrompt,
    aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
    resolution: '720p',
    duration: 5,
    fps: 24,
    camera_fixed: false,
    first_frame_image: frameUrl,
  };

  const submitRes = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-1-pro-fast/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({ input }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    try { fs.unlinkSync(framePath); } catch {}
    throw new Error(`Seedance error ${submitRes.status}: ${err.slice(0, 200)}`);
  }

  const prediction = await submitRes.json();
  console.log(`[AdsService] Seedance status: ${prediction.status}, error: ${prediction.error || 'none'}`);

  if (prediction.status === 'succeeded' && prediction.output) {
    try { fs.unlinkSync(framePath); } catch {}
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }

  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`No prediction ID from Seedance: ${JSON.stringify(prediction)}`);

  const maxWait = 300000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    console.log(`[AdsService] Seedance status: ${statusData.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (statusData.status === 'succeeded') {
      const url = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
      if (!url) throw new Error('No video URL in Seedance output');
      try { fs.unlinkSync(framePath); } catch {}
      return url;
    }
    if (statusData.status === 'failed' || statusData.status === 'canceled') {
      try { fs.unlinkSync(framePath); } catch {}
      throw new Error(`Seedance failed: ${statusData.error || 'unknown'}`);
    }
  }
  try { fs.unlinkSync(framePath); } catch {}
  throw new Error('Seedance timed out after 5 minutes');
}

// ── FFmpeg compose ────────────────────────────────────────────────────────────
async function composeAdVideo({ animatedScenes, productName, showTitle, audioPath, ratio, outputDir, jobId }) {
  const [W, H] = ratio === '9:16' ? [1080, 1920] : [1920, 1080];
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // تحميل الكليبات
  const clipPaths = [];
  for (let i = 0; i < animatedScenes.length; i++) {
    const clipPath = join(TEMP_DIR, `ads_clip_${jobId}_${i}.mp4`);
    console.log(`[AdsService] Downloading clip ${i+1}/${animatedScenes.length}`);
    await downloadFile(animatedScenes[i].videoUrl, clipPath);
    clipPaths.push(clipPath);
  }

  const numClips = clipPaths.length;
  const hasAudio = !!(audioPath && fs.existsSync(audioPath));

  // فونت
  let fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const arabicFonts = [
    '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
    '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ];
  if (/[\u0600-\u06FF]/.test(productName)) {
    for (const f of arabicFonts) { if (fs.existsSync(f)) { fontFile = f; break; } }
  }

  const inputArgs = clipPaths.flatMap(p => ['-i', p]);
  if (hasAudio) inputArgs.push('-i', audioPath);

  const filterParts = [];
  for (let i = 0; i < numClips; i++) {
    filterParts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[sv${i}]`
    );
  }
  const concatIn = clipPaths.map((_, i) => `[sv${i}]`).join('');
  filterParts.push(`${concatIn}concat=n=${numClips}:v=1:a=0[vconcat]`);

  if (showTitle && productName.trim()) {
    const safe = productName.trim()
      .replace(/\\/g, '\\\\').replace(/'/g, '\u2019')
      .replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const fs2 = ratio === '9:16' ? 72 : 60;
    const bH = ratio === '9:16' ? 240 : 200;
    const bY = Math.floor((H - bH) / 2);
    filterParts.push(
      `[vconcat]` +
      `drawbox=x=0:y=${bY}:w=${W}:h=${bH}:color=black@0.55:t=fill:enable='between(t,0,3.5)',` +
      `drawbox=x=0:y=${bY}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',` +
      `drawbox=x=0:y=${bY+bH-3}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',` +
      `drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=black@0.5:fontsize=${fs2}:x=(w-text_w)/2+3:y=(h-text_h)/2+3:enable='between(t,0,3.5)',` +
      `drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=white:fontsize=${fs2}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,3.5)'` +
      `[vtitled]`
    );
  } else {
    filterParts.push(`[vconcat]null[vtitled]`);
  }

  const totalDur = numClips * 5.5;
  filterParts.push(`[vtitled]fade=t=in:st=0:d=0.6,fade=t=out:st=${(totalDur-1.2).toFixed(1)}:d=1.0[vfinal]`);

  const outputPath = join(outputDir, `ad_${jobId}.mp4`);
  const ffmpegArgs = [...inputArgs, '-filter_complex', filterParts.join(';'), '-map', '[vfinal]'];
  if (hasAudio) ffmpegArgs.push('-map', `${numClips}:a`, '-c:a', 'aac', '-b:a', '128k', '-shortest');
  ffmpegArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outputPath);

  console.log(`[AdsService] FFmpeg composing ${numClips} clips...`);
  try {
    await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 200 * 1024 * 1024 });
  } catch (err) {
    const stderr = err.stderr?.toString().slice(-1000) || err.message;
    console.error('[AdsService] FFmpeg stderr:', stderr);
    throw new Error('FFmpeg failed: ' + stderr);
  }

  // Cleanup clips
  setTimeout(() => {
    clipPaths.forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
  }, 60000);

  console.log(`[AdsService] ✓ Final video: ${outputPath}`);
  return outputPath;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function renderAdVideo({
  productImageBase64, productName, productDesc,
  audioMode, uploadedAudioPath, aiVoiceKey,
  ratio, language, sceneCount, customHook, showTitle,
  outputDir, jobId, onProgress,
}) {
  const progress = (step, msg) => {
    console.log(`[AdsService][${jobId}] ${step}: ${msg}`);
    onProgress?.({ step, msg });
  };

  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  if (!productDesc?.trim()) throw new Error('Product description is required');

  const count = Math.min(Math.max(parseInt(sceneCount) || 5, 3), SCENE_CONFIGS.length);
  const selectedScenes = SCENE_CONFIGS.slice(0, count);
  console.log(`[AdsService] Generating ${count} scenes: ${selectedScenes.map(s=>s.label).join(', ')}`);

  // ── 1. رفع صورة المنتج على Replicate مرة واحدة ───────────────────────────
  progress('scenes', 'Uploading product image...');
  const productImageUrl = await uploadImageToReplicate(productImageBase64);

  // ── 2. FLUX ───────────────────────────────────────────────────────────────
  progress('scenes', `Generating ${count} product scenes with FLUX...`);
  const sceneImages = [];

  for (let i = 0; i < selectedScenes.length; i++) {
    const sc = selectedScenes[i];
    try {
      console.log(`[AdsService] [${i+1}/${count}] FLUX scene: ${sc.label}`);
      const imageUrl = await generateAdSceneImage(
        productImageUrl, productName, productDesc.trim(), sc, ratio
      );
      console.log(`[AdsService] ✓ Scene ${i+1} URL: ${imageUrl}`);
      sceneImages.push({ ...sc, imageUrl });
      progress('scenes', `Scene ${i+1}/${count} done: ${sc.label}`);
    } catch (err) {
      console.error(`[AdsService] ✗ Scene "${sc.label}" FAILED: ${err.message}`);
    }
  }

  if (sceneImages.length === 0) throw new Error('All FLUX scene generation attempts failed. Check REPLICATE_API_TOKEN.');
  console.log(`[AdsService] ${sceneImages.length}/${count} scenes generated`);

  // ── 2. الصوت ──────────────────────────────────────────────────────────────
  let audioPath = null;
  if (audioMode === 'ai_voice') {
    progress('voice', 'Generating AI voiceover...');
    try {
      const lang = language?.startsWith('ar') ? 'ar' : 'en';
      const script = SCRIPT_TEMPLATES[lang](productName, productDesc.trim(), customHook || '');
      const audioFilename = await generateVoiceover(script, aiVoiceKey || 'male_arabic', 'education', 0, language || 'ar');
      audioPath = join(process.cwd(), 'outputs', audioFilename);
    } catch (err) { console.warn('[AdsService] Voiceover failed:', err.message); }
  } else if (audioMode === 'upload' && uploadedAudioPath) {
    audioPath = uploadedAudioPath;
  }

  // ── 3. Seedance ───────────────────────────────────────────────────────────
  progress('animate', `Animating ${sceneImages.length} scenes...`);
  const animatedScenes = [];

  for (let i = 0; i < sceneImages.length; i++) {
    const scene = sceneImages[i];
    try {
      console.log(`[AdsService] [${i+1}/${sceneImages.length}] Animating: ${scene.label} → ${scene.imageUrl}`);
      const videoUrl = await animateSceneImage(scene.imageUrl, scene.motion, ratio, jobId, i);
      animatedScenes.push({ ...scene, videoUrl });
      console.log(`[AdsService] ✓ Animated ${i+1}: ${scene.label}`);
      progress('animate', `Animated ${i+1}/${sceneImages.length}: ${scene.label}`);
    } catch (err) {
      console.error(`[AdsService] ✗ Animate "${scene.label}" FAILED: ${err.message}`);
    }
  }

  if (animatedScenes.length === 0) throw new Error('All Seedance animation attempts failed');
  console.log(`[AdsService] ${animatedScenes.length} scenes animated`);

  // ── 4. FFmpeg ─────────────────────────────────────────────────────────────
  progress('compose', `Composing ${animatedScenes.length} clips...`);
  const outputPath = await composeAdVideo({
    animatedScenes, productName,
    showTitle: showTitle !== false,
    audioPath, ratio, outputDir, jobId,
  });

  progress('done', 'Ad video ready!');
  return { outputPath, sceneCount: animatedScenes.length };
}

export function buildAdScript(productName, productDesc, language, customHook = '') {
  const lang = language?.startsWith('ar') ? 'ar' : 'en';
  return SCRIPT_TEMPLATES[lang](productName, productDesc || '', customHook);
}