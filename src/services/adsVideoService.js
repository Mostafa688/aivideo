// ── adsVideoService.js ────────────────────────────────────────────────────────
// Pipeline:
//   1. FLUX kontext-dev  → صور reference (كل scene منفصلة)
//   2. تحميل الصورة من Replicate → رفعها على R2 → URL عام
//   3. Seedance (بـ URL عام) → تحريك كل صورة
//   4. FFmpeg → دمج + اسم المنتج (لو اختاره المستخدم) + fade

import fetch from 'node-fetch';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { generateVoiceover } from './voiceService.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

// R2 client لرفع الصور المؤقتة
const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── Scene configs ─────────────────────────────────────────────────────────────
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image, preserve all details. Place it centered on a sleek dark gradient background. ${desc}. Dramatic studio lighting from above, photorealistic commercial photography, 8K, luxury feel, sharp focus, advertisement quality.`,
    motion: `The product slowly rotates 20 degrees clockwise, subtle light reflection shimmers across the surface, cinematic slow motion, elegant product reveal, professional advertisement`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Show it in a modern bright lifestyle setting appropriate for: ${desc}. Natural warm sunlight, aspirational scene, professional commercial photography, photorealistic.`,
    motion: `Gentle parallax motion, camera slowly zooms out revealing the elegant lifestyle scene, warm bokeh light particles floating, cinematic atmosphere`,
  },
  {
    id: 'closeup',
    label: 'Close-up',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Extreme close-up macro shot showing fine texture and premium material detail. ${desc}. Shallow depth of field, beautiful bokeh background, ultra sharp detail, luxury product photography.`,
    motion: `Ultra slow macro push-in, product details emerge in ultra detail, very subtle camera drift left to right, luxury cinematic feel`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Photographed at a dynamic 45-degree angle on a sleek reflective dark surface. ${desc}. Dramatic side lighting creating depth and long shadow, high-end brand photography, commercial advertisement style.`,
    motion: `Slow cinematic dolly move from left to right, dramatic shadow sweeps elegantly across the surface, refined product motion`,
  },
  {
    id: 'minimal',
    label: 'Minimal White',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Pure white background, clean minimal shadows below, flat lay style. ${desc}. Modern minimal aesthetic, Apple-style product photography, high contrast, crisp clean look.`,
    motion: `Product gently levitates upward 10px and returns, clean crisp motion, modern minimal bounce, subtle soft shadow pulse`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image. Show it being used in an ideal real-world scenario. ${desc}. Dynamic composition, aspirational quality, professional commercial photography, cinematic atmosphere.`,
    motion: `Dynamic energetic camera arc around the product, aspirational lifestyle energy, cinematic depth of field shift, professional advertisement`,
  },
];

// ── Ad script templates ───────────────────────────────────────────────────────
const SCRIPT_TEMPLATES = {
  ar: (productName, desc, hook) =>
    `${hook || `هل تعرف سر ${productName}؟`}\n\n${desc}\n\nصُنع بدقة. صُمم لك.\n\n${productName} — لأنك تستحق الأفضل.`,
  en: (productName, desc, hook) =>
    `${hook || `What if one product could change everything?`}\n\nIntroducing ${productName}.\n\n${desc}\n\nCrafted with precision. Designed for you.\n\n${productName} — Because you deserve the best.`,
};

// ── Helper: download buffer from URL ─────────────────────────────────────────
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Helper: download file to disk ─────────────────────────────────────────────
async function downloadFile(url, destPath) {
  const buf = await fetchBuffer(url);
  fs.writeFileSync(destPath, buf);
  return destPath;
}

// ── Helper: رفع صورة على R2 وإرجاع URL عام ──────────────────────────────────
async function uploadImageToR2(imageBuffer, filename) {
  const bucket = process.env.R2_BUCKET_NAME || 'aivideo';
  const key = `ads_tmp/${filename}`;
  await r2.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: imageBuffer,
    ContentType: 'image/jpeg',
  }));
  const publicUrl = process.env.R2_PUBLIC_URL || `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev/${bucket}`;
  return `${publicUrl}/${key}`;
}

// ── Helper: poll Replicate ────────────────────────────────────────────────────
async function pollReplicate(predictionId, timeoutMs = 300000, label = '') {
  const headers = { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!res.ok) { console.warn(`[AdsService] Poll ${res.status}, retry...`); continue; }
    const data = await res.json();
    console.log(`[AdsService] ${label} → ${data.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`Replicate ${data.status}: ${data.error || 'unknown'}`);
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
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error('No prediction ID from FLUX');
  return await pollReplicate(data.id, 180000, `FLUX "${sceneConfig.label}"`);
}

// ── Step 2: تحميل الصورة من Replicate ورفعها R2 → URL عام ───────────────────
async function reuploadImageForSeedance(replicateUrl, jobId, sceneId) {
  try {
    console.log(`[AdsService] Re-uploading scene image to R2: ${sceneId}`);
    const buf = await fetchBuffer(replicateUrl);
    const filename = `${jobId}_${sceneId}_${Date.now()}.jpg`;
    const publicUrl = await uploadImageToR2(buf, filename);
    console.log(`[AdsService] ✓ R2 URL: ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.warn(`[AdsService] R2 upload failed, using Replicate URL directly: ${err.message}`);
    return replicateUrl; // fallback: جرّب الـ URL مباشرة
  }
}

// ── Step 3: Seedance → تحريك الصورة ──────────────────────────────────────────
async function animateSceneImage(imageUrl, motionPrompt, hasVoiceover, ratio) {
  const aspectRatio = ratio === '9:16' ? '9:16' : '16:9';
  const duration = hasVoiceover ? 5 : 6;
  let modelPath, input;

  if (hasVoiceover) {
    // seedance-1-pro-fast → first_frame_image
    modelPath = 'bytedance/seedance-1-pro-fast';
    input = { prompt: motionPrompt, aspect_ratio: aspectRatio, resolution: '480p', duration, fps: 24, first_frame_image: imageUrl };
  } else {
    // seedance-2.0-fast → image array + [Image1] في الـ prompt
    modelPath = 'bytedance/seedance-2.0-fast';
    input = { prompt: `[Image1] ${motionPrompt}`, aspect_ratio: aspectRatio, resolution: '480p', duration, image: [imageUrl] };
  }

  const res = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Seedance error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Seedance: ${data.error}`);
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error('No prediction ID from Seedance');
  return await pollReplicate(data.id, 420000, `Seedance "${modelPath}"`);
}

// ── Step 4: FFmpeg compose ────────────────────────────────────────────────────
async function composeAdVideo({ animatedScenes, productName, showTitle, audioPath, ratio, outputDir, jobId }) {
  const [W, H] = ratio === '9:16' ? [1080, 1920] : [1920, 1080];
  const tmpDir = join(outputDir, `ads_tmp_${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // تحميل الكليبات
  const clipPaths = [];
  for (let i = 0; i < animatedScenes.length; i++) {
    const clipPath = join(tmpDir, `clip_${i}.mp4`);
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
    '/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  ];
  const isArabic = /[\u0600-\u06FF]/.test(productName);
  if (isArabic) { for (const f of arabicFonts) { if (fs.existsSync(f)) { fontFile = f; break; } } }

  const inputArgs = clipPaths.flatMap(p => ['-i', p]);
  if (hasAudio) inputArgs.push('-i', audioPath);

  const filterParts = [];

  // Scale كل كليب
  for (let i = 0; i < numClips; i++) {
    filterParts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[sv${i}]`
    );
  }

  // Concat
  const concatIn = clipPaths.map((_, i) => `[sv${i}]`).join('');
  filterParts.push(`${concatIn}concat=n=${numClips}:v=1:a=0[vconcat]`);

  if (showTitle && productName.trim()) {
    // عنوان احترافي مع box شفاف + خط بولد + border glow
    const safeProductName = productName.trim()
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\u2019')
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

    const fontSize = ratio === '9:16' ? 72 : 60;
    const boxH = ratio === '9:16' ? 240 : 200;
    const boxY = Math.floor((H - boxH) / 2);
    const shadowOffset = 3;

    // طبقات: shadow + نص أساسي + glow effect
    filterParts.push(
      `[vconcat]` +
      // خلفية شبه شفافة
      `drawbox=x=0:y=${boxY}:w=${W}:h=${boxH}:color=black@0.55:t=fill:enable='between(t,0,3.5)',` +
      // خط أبيض رفيع فوق وتحت الـ box
      `drawbox=x=0:y=${boxY}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',` +
      `drawbox=x=0:y=${boxY+boxH-3}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',` +
      // shadow النص
      `drawtext=fontfile=${fontFile}:text='${safeProductName}':fontcolor=black@0.5:fontsize=${fontSize}:x=(w-text_w)/2+${shadowOffset}:y=(h-text_h)/2+${shadowOffset}:enable='between(t,0,3.5)',` +
      // النص الأساسي أبيض
      `drawtext=fontfile=${fontFile}:text='${safeProductName}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,3.5)'` +
      `[vtitled]`
    );
  } else {
    filterParts.push(`[vconcat]null[vtitled]`);
  }

  // Fade in/out
  const totalDur = numClips * (hasAudio ? 5.5 : 6.5);
  filterParts.push(
    `[vtitled]fade=t=in:st=0:d=0.6,fade=t=out:st=${(totalDur - 1.2).toFixed(1)}:d=1.0[vfinal]`
  );

  const filterComplex = filterParts.join(';');
  const outputPath = join(outputDir, `ad_${jobId}.mp4`);

  const ffmpegArgs = [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[vfinal]',
  ];

  if (hasAudio) {
    ffmpegArgs.push('-map', `${numClips}:a`, '-c:a', 'aac', '-b:a', '128k', '-shortest');
  }

  ffmpegArgs.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', outputPath);

  console.log('[AdsService] Running FFmpeg...');
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
  showTitle,    // boolean — اختياري من المستخدم
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

  const count = Math.min(Math.max(parseInt(sceneCount) || 5, 3), SCENE_CONFIGS.length);
  const selectedScenes = SCENE_CONFIGS.slice(0, count);

  // ── 1. FLUX: توليد الصور ──────────────────────────────────────────────────
  progress('scenes', `Generating ${count} product scene images...`);
  const sceneImages = [];

  for (const sceneConfig of selectedScenes) {
    try {
      console.log(`[AdsService] Generating scene: ${sceneConfig.label}`);
      const replicateUrl = await generateAdSceneImage(
        productImageBase64, productName, productDesc.trim(), sceneConfig, ratio
      );
      // تحميل الصورة ورفعها على R2 عشان Seedance يقدر يوصلها
      const publicImageUrl = await reuploadImageForSeedance(replicateUrl, jobId, sceneConfig.id);
      sceneImages.push({ ...sceneConfig, imageUrl: publicImageUrl });
      console.log(`[AdsService] ✓ Scene "${sceneConfig.label}"`);
    } catch (err) {
      console.error(`[AdsService] ✗ Scene "${sceneConfig.label}" failed: ${err.message}`);
    }
  }

  if (sceneImages.length === 0) throw new Error('All FLUX scene generation attempts failed');
  console.log(`[AdsService] ${sceneImages.length}/${count} scenes ready`);

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

  // ── 3. Seedance: تحريك الصور ──────────────────────────────────────────────
  progress('animate', `Animating ${sceneImages.length} scenes with Seedance...`);
  const animatedScenes = [];

  for (const scene of sceneImages) {
    try {
      console.log(`[AdsService] Animating: ${scene.label}`);
      const videoUrl = await animateSceneImage(scene.imageUrl, scene.motion, hasVoiceover, ratio);
      animatedScenes.push({ ...scene, videoUrl });
      console.log(`[AdsService] ✓ Animated: ${scene.label}`);
    } catch (err) {
      console.error(`[AdsService] ✗ Animate "${scene.label}" failed: ${err.message}`);
    }
  }

  if (animatedScenes.length === 0) throw new Error('All Seedance animation attempts failed');
  console.log(`[AdsService] ${animatedScenes.length} scenes animated`);

  // ── 4. FFmpeg: compose ────────────────────────────────────────────────────
  progress('compose', 'Composing final ad video...');
  const outputPath = await composeAdVideo({
    animatedScenes,
    productName,
    showTitle: showTitle !== false, // default true لو مش محدد
    audioPath,
    ratio,
    outputDir,
    jobId,
  });

  progress('done', 'Ad video ready!');
  return { outputPath, sceneCount: animatedScenes.length };
}

export function buildAdScript(productName, productDesc, language, customHook = '') {
  const lang = language?.startsWith('ar') ? 'ar' : 'en';
  return SCRIPT_TEMPLATES[lang](productName, productDesc || '', customHook);
}