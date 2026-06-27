// ── adsVideoService.js ────────────────────────────────────────────────────────
// Pipeline:
//   1. FLUX kontext-dev  → صورة reference لكل scene (بيرجع URL من Replicate)
//   2. تحميل الصورة كـ buffer → تحويلها base64
//   3. Seedance بـ base64 مباشرة في first_frame_image (مش محتاج URL عام)
//   4. FFmpeg → دمج + عنوان احترافي (اختياري) + fade

import fetch from 'node-fetch';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateVoiceover } from './voiceService.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// ── Scene configs ─────────────────────────────────────────────────────────────
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image, preserve all details and shape. Place it centered on a sleek dark gradient background. ${desc}. Dramatic studio lighting from above, photorealistic commercial photography, 8K, luxury feel, sharp focus, advertisement quality.`,
    motion: `The product slowly rotates 20 degrees clockwise, subtle light reflection shimmers across the surface, cinematic slow motion, elegant product reveal, professional advertisement`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image, preserve all details. Show it in a modern elegant lifestyle setting perfectly suited for: ${desc}. Natural warm sunlight, aspirational scene, professional commercial photography, photorealistic.`,
    motion: `Gentle parallax motion, camera slowly zooms out revealing the elegant lifestyle scene, warm bokeh light particles, cinematic atmosphere`,
  },
  {
    id: 'closeup',
    label: 'Close-up',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Extreme close-up macro shot showing finest texture and premium material. ${desc}. Shallow depth of field, beautiful bokeh background, ultra sharp detail, luxury product photography.`,
    motion: `Ultra slow macro push-in, finest product details emerge, very subtle camera drift left to right, luxury cinematic feel`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. 45-degree angle on a sleek dark reflective surface. ${desc}. Dramatic side lighting creating depth and elegant shadow, high-end luxury brand photography.`,
    motion: `Slow cinematic dolly move from left to right, dramatic shadow sweeps elegantly across surface, refined luxury product motion`,
  },
  {
    id: 'minimal',
    label: 'Minimal White',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Pure white seamless background, clean minimal soft shadow. ${desc}. Modern minimal aesthetic, Apple-style product photography, high contrast, crisp and clean.`,
    motion: `Product gently levitates upward slightly and returns with soft bounce, clean modern motion, subtle shadow pulse beneath`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Show it elegantly in an ideal aspirational scenario. ${desc}. Dynamic composition, cinematic depth of field, professional commercial photography.`,
    motion: `Dynamic cinematic camera arc around product, aspirational lifestyle energy, depth of field shift, professional advertisement feel`,
  },
];

const SCRIPT_TEMPLATES = {
  ar: (productName, desc, hook) =>
    `${hook || `هل تعرف سر ${productName}؟`}\n\n${desc}\n\nصُنع بدقة. صُمم لك.\n\n${productName} — لأنك تستحق الأفضل.`,
  en: (productName, desc, hook) =>
    `${hook || `What if one product could change everything?`}\n\nIntroducing ${productName}.\n\n${desc}\n\nCrafted with precision. Designed for you.\n\n${productName} — Because you deserve the best.`,
};

// ── Helper: download file to disk ─────────────────────────────────────────────
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} - ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return destPath;
}

// ── Helper: download as base64 ────────────────────────────────────────────────
async function downloadAsBase64(url, mimeType = 'image/jpeg') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} - ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mimeType};base64,${buf.toString('base64')}`;
}

// ── Helper: poll Replicate ────────────────────────────────────────────────────
async function pollReplicate(predictionId, timeoutMs = 300000, label = '') {
  const headers = { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!res.ok) { console.warn(`[AdsService] Poll ${res.status}`); continue; }
    const data = await res.json();
    console.log(`[AdsService] ${label} → ${data.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate ${data.status}: ${data.error || 'unknown'}`);
    }
  }
  throw new Error(`Replicate timed out after ${timeoutMs/1000}s`);
}

// ── Step 1: FLUX kontext-dev → صورة reference ────────────────────────────────
async function generateAdSceneImage(productImageBase64, productName, productDesc, sceneConfig, ratio) {
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
        prompt,
        input_image: `data:image/jpeg;base64,${productImageBase64}`,
        aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
        output_format: 'jpg',
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

  let imageUrl;
  if (data.status === 'succeeded' && data.output) {
    imageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
  } else {
    if (!data.id) throw new Error('No prediction ID from FLUX');
    imageUrl = await pollReplicate(data.id, 180000, `FLUX "${sceneConfig.label}"`);
  }

  console.log(`[AdsService] FLUX image URL: ${imageUrl}`);

  // تحميل الصورة كـ base64 عشان نبعتها لـ Seedance مباشرة
  const base64DataUrl = await downloadAsBase64(imageUrl, 'image/jpeg');
  console.log(`[AdsService] Image downloaded as base64, size: ${Math.round(base64DataUrl.length/1024)}KB`);

  return { imageUrl, base64DataUrl };
}

// ── Step 2: Seedance → تحريك الصورة بـ base64 مباشرة ────────────────────────
async function animateSceneImage(imageBase64DataUrl, motionPrompt, ratio) {
  const aspectRatio = ratio === '9:16' ? '9:16' : '16:9';

  // seedance-1-pro-fast: يقبل base64 في first_frame_image
  const input = {
    prompt: motionPrompt,
    aspect_ratio: aspectRatio,
    resolution: '480p',
    duration: 5,
    fps: 24,
    first_frame_image: imageBase64DataUrl,  // base64 مباشرة ✅
  };

  console.log(`[AdsService] Sending to Seedance with base64 image...`);

  const res = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-1-pro-fast/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seedance error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  console.log(`[AdsService] Seedance response status: ${data.status}, error: ${data.error || 'none'}`);
  if (data.error) throw new Error(`Seedance: ${data.error}`);

  if (data.status === 'succeeded' && data.output) {
    return Array.isArray(data.output) ? data.output[0] : data.output;
  }
  if (!data.id) throw new Error('No prediction ID from Seedance');
  return await pollReplicate(data.id, 420000, `Seedance`);
}

// ── Step 3: FFmpeg compose ────────────────────────────────────────────────────
async function composeAdVideo({ animatedScenes, productName, showTitle, audioPath, ratio, outputDir, jobId }) {
  const [W, H] = ratio === '9:16' ? [1080, 1920] : [1920, 1080];
  const tmpDir = join(outputDir, `ads_tmp_${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const clipPaths = [];
  for (let i = 0; i < animatedScenes.length; i++) {
    const clipPath = join(tmpDir, `clip_${i}.mp4`);
    console.log(`[AdsService] Downloading clip ${i+1}/${animatedScenes.length}: ${animatedScenes[i].videoUrl}`);
    await downloadFile(animatedScenes[i].videoUrl, clipPath);
    clipPaths.push(clipPath);
  }

  const numClips = clipPaths.length;
  const hasAudio = !!(audioPath && fs.existsSync(audioPath));

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
    const safeProductName = productName.trim()
      .replace(/\\/g, '\\\\').replace(/'/g, '\u2019')
      .replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const fontSize = ratio === '9:16' ? 72 : 60;
    const boxH = ratio === '9:16' ? 240 : 200;
    const boxY = Math.floor((H - boxH) / 2);

    filterParts.push(
      `[vconcat]` +
      `drawbox=x=0:y=${boxY}:w=${W}:h=${boxH}:color=black@0.55:t=fill:enable='between(t,0,3.5)',` +
      `drawbox=x=0:y=${boxY}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',` +
      `drawbox=x=0:y=${boxY + boxH - 3}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',` +
      `drawtext=fontfile=${fontFile}:text='${safeProductName}':fontcolor=black@0.5:fontsize=${fontSize}:x=(w-text_w)/2+3:y=(h-text_h)/2+3:enable='between(t,0,3.5)',` +
      `drawtext=fontfile=${fontFile}:text='${safeProductName}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,3.5)'` +
      `[vtitled]`
    );
  } else {
    filterParts.push(`[vconcat]null[vtitled]`);
  }

  const totalDur = numClips * 5.5;
  filterParts.push(
    `[vtitled]fade=t=in:st=0:d=0.6,fade=t=out:st=${(totalDur - 1.2).toFixed(1)}:d=1.0[vfinal]`
  );

  const outputPath = join(outputDir, `ad_${jobId}.mp4`);
  const ffmpegArgs = [
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[vfinal]',
  ];
  if (hasAudio) {
    ffmpegArgs.push('-map', `${numClips}:a`, '-c:a', 'aac', '-b:a', '128k', '-shortest');
  }
  ffmpegArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outputPath);

  console.log(`[AdsService] FFmpeg composing ${numClips} clips...`);
  try {
    await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 200 * 1024 * 1024 });
  } catch (err) {
    const stderr = err.stderr?.toString().slice(-1000) || err.message;
    console.error('[AdsService] FFmpeg stderr:', stderr);
    throw new Error('FFmpeg failed: ' + stderr);
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  console.log(`[AdsService] ✓ Final video: ${outputPath}`);
  return outputPath;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function renderAdVideo({
  productImageBase64,
  productName,
  productDesc,
  audioMode,
  uploadedAudioPath,
  aiVoiceKey,
  ratio,
  language,
  sceneCount,
  customHook,
  showTitle,
  outputDir,
  jobId,
  onProgress,
}) {
  const progress = (step, msg) => {
    console.log(`[AdsService][${jobId}] ${step}: ${msg}`);
    onProgress?.({ step, msg });
  };

  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  if (!productDesc?.trim()) throw new Error('Product description is required');

  // عدد المشاهد صح — min 3, max 6
  const count = Math.min(Math.max(parseInt(sceneCount) || 5, 3), SCENE_CONFIGS.length);
  const selectedScenes = SCENE_CONFIGS.slice(0, count);
  console.log(`[AdsService] Will generate ${count} scenes: ${selectedScenes.map(s => s.label).join(', ')}`);

  // ── 1. FLUX: توليد الصور ──────────────────────────────────────────────────
  progress('scenes', `Generating ${count} product scene images...`);
  const sceneImages = [];

  for (let i = 0; i < selectedScenes.length; i++) {
    const sceneConfig = selectedScenes[i];
    try {
      console.log(`[AdsService] [${i+1}/${count}] Generating scene: ${sceneConfig.label}`);
      const { imageUrl, base64DataUrl } = await generateAdSceneImage(
        productImageBase64, productName, productDesc.trim(), sceneConfig, ratio
      );
      sceneImages.push({ ...sceneConfig, imageUrl, base64DataUrl });
      progress('scenes', `Scene ${i+1}/${count} ready: ${sceneConfig.label}`);
    } catch (err) {
      console.error(`[AdsService] ✗ Scene "${sceneConfig.label}" failed: ${err.message}`);
      // نكمل ولا نوقف — لو فضل صفر هنطلع error في الآخر
    }
  }

  if (sceneImages.length === 0) throw new Error('All FLUX scene generation attempts failed');
  console.log(`[AdsService] ${sceneImages.length}/${count} scenes ready for animation`);

  // ── 2. الصوت ──────────────────────────────────────────────────────────────
  let audioPath = null;
  let hasVoiceover = false;

  if (audioMode === 'ai_voice') {
    progress('voice', 'Generating AI voiceover...');
    try {
      const lang = language?.startsWith('ar') ? 'ar' : 'en';
      const script = SCRIPT_TEMPLATES[lang](productName, productDesc.trim(), customHook || '');
      const audioFilename = await generateVoiceover(script, aiVoiceKey || 'male_arabic', 'education', 0, language || 'ar');
      audioPath = join(process.cwd(), 'outputs', audioFilename);
      hasVoiceover = true;
    } catch (err) {
      console.warn('[AdsService] Voiceover failed:', err.message);
    }
  } else if (audioMode === 'upload' && uploadedAudioPath) {
    audioPath = uploadedAudioPath;
    hasVoiceover = true;
  }

  // ── 3. Seedance: تحريك الصور بـ base64 ───────────────────────────────────
  progress('animate', `Animating ${sceneImages.length} scenes...`);
  const animatedScenes = [];

  for (let i = 0; i < sceneImages.length; i++) {
    const scene = sceneImages[i];
    try {
      console.log(`[AdsService] [${i+1}/${sceneImages.length}] Animating: ${scene.label}`);
      const videoUrl = await animateSceneImage(scene.base64DataUrl, scene.motion, ratio);
      animatedScenes.push({ ...scene, videoUrl });
      progress('animate', `Animated ${i+1}/${sceneImages.length}: ${scene.label}`);
    } catch (err) {
      console.error(`[AdsService] ✗ Animate "${scene.label}" failed: ${err.message}`);
    }
  }

  if (animatedScenes.length === 0) throw new Error('All Seedance animation attempts failed');
  console.log(`[AdsService] ${animatedScenes.length} scenes animated successfully`);

  // ── 4. FFmpeg ─────────────────────────────────────────────────────────────
  progress('compose', `Composing ${animatedScenes.length} clips into final video...`);
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