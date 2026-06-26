// ── adsVideoService.js ────────────────────────────────────────────────────────
// Pipeline:
//   1. flux-kontext-dev  → صور reference للمنتج (عدد المشاهد المطلوبة)
//   2. seedance-2.0-fast (بدون voice) / seedance-1-pro-fast (مع voice) → تحريك
//   3. FFmpeg → دمج + اسم المنتج في البداية + fade

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

// ── Scene configs ─────────────────────────────────────────────────────────────
// كل scene عندها prompt مختلف للمنتج وزاوية مختلفة
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc) =>
      `Keep the exact same product from the reference image. Place ${product} centered on a sleek gradient background with dramatic studio lighting from above. ${desc ? desc + '.' : ''} Photorealistic commercial photography, 8K, luxury feel, sharp focus, advertisement quality.`,
    motion: `The ${' product'} slowly rotates 20 degrees, subtle light reflection shimmer across the surface, cinematic slow motion, elegant product reveal`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    buildPrompt: (product, desc) =>
      `Keep the exact same product from the reference image. Show ${product} in a modern bright living room with natural warm sunlight. ${desc ? desc + '.' : ''} Aspirational lifestyle photography, people implied but not shown, commercial photography, photorealistic.`,
    motion: `Gentle parallax motion, camera slowly zooms out revealing the lifestyle scene, warm bokeh light particles, cinematic`,
  },
  {
    id: 'closeup',
    label: 'Close-up Detail',
    buildPrompt: (product, desc) =>
      `Keep the exact same product from the reference image. Extreme close-up macro shot of ${product} showing fine texture and premium material detail. ${desc ? desc + '.' : ''} Shallow depth of field, beautiful bokeh background, ultra sharp detail, luxury product photography.`,
    motion: `Ultra slow macro push-in, microscopic product details emerge, very subtle camera drift left to right, luxury feel cinematic`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc) =>
      `Keep the exact same product from the reference image. ${product} photographed at 45-degree angle on a sleek dark reflective surface. ${desc ? desc + '.' : ''} Dramatic side lighting creating depth and shadow, high-end brand photography, commercial advertisement style.`,
    motion: `Slow cinematic dolly move from left to right, dramatic shadow sweeps across product surface, elegant refined motion`,
  },
  {
    id: 'minimal',
    label: 'Minimal White',
    buildPrompt: (product, desc) =>
      `Keep the exact same product from the reference image. ${product} on a pure white background, clean minimal shadows. ${desc ? desc + '.' : ''} Flat lay style, modern minimal aesthetic, Apple-style product photography, high contrast, clean.`,
    motion: `Product gently floats upward and returns, clean crisp motion, modern minimal feel, subtle bounce`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc) =>
      `Keep the exact same product from the reference image. ${product} being used in an ideal real-world scenario. ${desc ? desc + '.' : ''} Dynamic composition, motion implied, aspirational quality, professional commercial photography, cinematic atmosphere.`,
    motion: `Dynamic energetic camera movement around product in use, aspirational lifestyle energy, cinematic motion blur`,
  },
];

// ── Ad script templates ───────────────────────────────────────────────────────
const SCRIPT_TEMPLATES = {
  ar: (productName, desc, hook) =>
    `${hook || `هل تعرف الفرق بين المنتج العادي و${productName}؟`}\n\n${productName}${desc ? ' — ' + desc : ''}\n\nصُنع بدقة. صُمم لك.\n\n${productName} — لأنك تستحق الأفضل.`,
  en: (productName, desc, hook) =>
    `${hook || `What if one product could change everything?`}\n\nIntroducing ${productName}.${desc ? '\n\n' + desc : ''}\n\nCrafted with precision. Designed for you.\n\n${productName} — Because you deserve the best.`,
};

// ── Helper: download file to disk ─────────────────────────────────────────────
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
  return destPath;
}

// ── Helper: poll Replicate until done ─────────────────────────────────────────
async function pollReplicate(predictionId, timeoutMs = 300000, label = '') {
  const headers = { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` };
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!res.ok) { console.warn(`[AdsService] Poll ${res.status}, retry...`); continue; }
    const data = await res.json();
    console.log(`[AdsService] ${label} status: ${data.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (data.status === 'succeeded') {
      return Array.isArray(data.output) ? data.output[0] : data.output;
    }
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate ${data.status}: ${data.error || 'unknown'}`);
    }
  }
  throw new Error(`Replicate timed out after ${timeoutMs/1000}s`);
}

// ── Step 1: flux-kontext-dev — توليد صور reference للمنتج ─────────────────────
async function generateAdSceneImage(productImageBase64, productName, productDesc, sceneConfig, ratio) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');

  const prompt = sceneConfig.buildPrompt(productName, productDesc);
  const aspectRatio = ratio === '9:16' ? '9:16' : '16:9';

  // flux-kontext-dev: image in → image out مع حفاظ على شكل المنتج
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
        aspect_ratio: aspectRatio,
        output_format: 'jpg',
        output_quality: 90,
        guidance: 3.5,
        num_inference_steps: 28,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`flux-kontext-dev error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`flux-kontext-dev: ${data.error}`);

  // إذا رجع فوراً
  if (data.status === 'succeeded' && data.output) {
    return Array.isArray(data.output) ? data.output[0] : data.output;
  }

  // polling
  if (!data.id) throw new Error('No prediction ID from flux-kontext-dev');
  return await pollReplicate(data.id, 180000, `FLUX scene "${sceneConfig.label}"`);
}

// ── Step 2: Seedance — تحريك الصورة ──────────────────────────────────────────
async function animateSceneImage(imageUrl, motionPrompt, hasVoiceover, ratio) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');

  // مع voice → seedance-1-pro-fast (أكثر استقراراً لمزامنة الصوت)
  // بدون voice → seedance-2.0-fast (صوت طبيعي مع الصورة)
  const modelPath = hasVoiceover
    ? 'bytedance/seedance-1-pro-fast'
    : 'bytedance/seedance-2.0-fast';

  const aspectRatio = ratio === '9:16' ? '9:16' : '16:9';
  const duration = hasVoiceover ? 5 : 6;

  const input = {
    prompt: motionPrompt,
    aspect_ratio: aspectRatio,
    resolution: '480p',
    duration,
    fps: 24,
    first_frame_image: imageUrl,  // ← الصورة Reference كـ first frame
  };

  const res = await fetch(`https://api.replicate.com/v1/models/${modelPath}/predictions`, {
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
    throw new Error(`Seedance error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`Seedance: ${data.error}`);

  if (data.status === 'succeeded' && data.output) {
    return Array.isArray(data.output) ? data.output[0] : data.output;
  }

  if (!data.id) throw new Error('No prediction ID from Seedance');
  return await pollReplicate(data.id, 360000, `Seedance animate`);
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function renderAdVideo({
  productImageBase64,
  productName,
  productDesc,
  audioMode,         // 'upload' | 'ai_voice' | 'none'
  uploadedAudioPath,
  aiVoiceKey,
  ratio,
  language,
  sceneCount,
  customHook,
  outputDir,
  jobId,
  onProgress,
}) {
  const progress = (step, msg) => {
    console.log(`[AdsService][${jobId}] ${step}: ${msg}`);
    onProgress?.({ step, msg });
  };

  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');

  // عدد المشاهد بين 3 و 6 بحد أقصى عدد الـ configs عندنا
  const count = Math.min(Math.max(sceneCount || 5, 3), SCENE_CONFIGS.length);
  const selectedScenes = SCENE_CONFIGS.slice(0, count);

  // ── 1. توليد صور reference ─────────────────────────────────────────────────
  progress('scenes', `Generating ${count} product scene images with FLUX...`);
  const sceneImages = [];

  for (const sceneConfig of selectedScenes) {
    try {
      console.log(`[AdsService] Generating scene: ${sceneConfig.label}`);
      const imageUrl = await generateAdSceneImage(
        productImageBase64, productName, productDesc || '', sceneConfig, ratio
      );
      sceneImages.push({ ...sceneConfig, imageUrl });
      console.log(`[AdsService] ✓ Scene "${sceneConfig.label}": ${imageUrl}`);
    } catch (err) {
      console.error(`[AdsService] ✗ Scene "${sceneConfig.label}" failed: ${err.message}`);
      // نكمّل بدون المشهد ده
    }
  }

  if (sceneImages.length === 0) throw new Error('All FLUX scene generation attempts failed');
  console.log(`[AdsService] ${sceneImages.length}/${count} scenes generated`);

  // ── 2. الصوت ──────────────────────────────────────────────────────────────
  let audioPath = null;
  let hasVoiceover = false;

  if (audioMode === 'ai_voice') {
    progress('voice', 'Generating AI voiceover...');
    try {
      const lang = language?.startsWith('ar') ? 'ar' : 'en';
      const script = SCRIPT_TEMPLATES[lang](productName, productDesc || '', customHook || '');
      const audioFilename = await generateVoiceover(script, aiVoiceKey || 'male_arabic', 'education', 0, language || 'ar');
      audioPath = join(process.cwd(), 'outputs', audioFilename);
      hasVoiceover = true;
      console.log(`[AdsService] ✓ Voiceover: ${audioFilename}`);
    } catch (err) {
      console.warn('[AdsService] Voiceover failed, continuing without audio:', err.message);
    }
  } else if (audioMode === 'upload' && uploadedAudioPath) {
    audioPath = uploadedAudioPath;
    hasVoiceover = true;
  }
  // audioMode === 'none' → hasVoiceover = false → seedance-2.0-fast مع صوت طبيعي

  // ── 3. تحريك الصور بـ Seedance ────────────────────────────────────────────
  progress('animate', `Animating ${sceneImages.length} scenes with Seedance...`);
  const animatedScenes = [];

  for (const scene of sceneImages) {
    try {
      console.log(`[AdsService] Animating scene: ${scene.label}`);
      const videoUrl = await animateSceneImage(scene.imageUrl, scene.motion, hasVoiceover, ratio);
      animatedScenes.push({ ...scene, videoUrl });
      console.log(`[AdsService] ✓ Animated "${scene.label}": ${videoUrl}`);
    } catch (err) {
      console.error(`[AdsService] ✗ Animate "${scene.label}" failed: ${err.message}`);
    }
  }

  if (animatedScenes.length === 0) throw new Error('All Seedance animation attempts failed');
  console.log(`[AdsService] ${animatedScenes.length} scenes animated`);

  // ── 4. FFmpeg compose ─────────────────────────────────────────────────────
  progress('compose', 'Composing final ad video...');
  const outputPath = await composeAdVideo({
    animatedScenes, productName, audioPath, ratio, outputDir, jobId,
  });

  progress('done', 'Ad video ready!');
  return { outputPath, sceneCount: animatedScenes.length };
}

// ── FFmpeg compose ─────────────────────────────────────────────────────────────
async function composeAdVideo({ animatedScenes, productName, audioPath, ratio, outputDir, jobId }) {
  const [W, H] = ratio === '9:16' ? [1080, 1920] : [1920, 1080];
  const tmpDir = join(outputDir, `ads_tmp_${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // تحميل الكليبات
  const clipPaths = [];
  for (let i = 0; i < animatedScenes.length; i++) {
    const clipPath = join(tmpDir, `clip_${i}.mp4`);
    console.log(`[AdsService] Downloading clip ${i + 1}/${animatedScenes.length}`);
    await downloadFile(animatedScenes[i].videoUrl, clipPath);
    clipPaths.push(clipPath);
  }

  const numClips = clipPaths.length;

  // ── تحديد فونت عربي أو إنجليزي ──
  let fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  const arabicFonts = [
    '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
    '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  const isArabic = /[\u0600-\u06FF]/.test(productName);
  if (isArabic) {
    for (const f of arabicFonts) {
      if (fs.existsSync(f)) { fontFile = f; break; }
    }
  }

  // ── Build input args ──
  const inputArgs = clipPaths.flatMap(p => ['-i', p]);
  if (audioPath && fs.existsSync(audioPath)) inputArgs.push('-i', audioPath);
  const hasAudio = audioPath && fs.existsSync(audioPath);

  // ── filter_complex ──
  const filterParts = [];

  // Scale + normalize كل كليب
  for (let i = 0; i < numClips; i++) {
    filterParts.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
      `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[sv${i}]`
    );
  }

  // Concat
  const concatIn = clipPaths.map((_, i) => `[sv${i}]`).join('');
  filterParts.push(`${concatIn}concat=n=${numClips}:v=1:a=0[vconcat]`);

  // اسم المنتج في أول 3 ثواني
  const safeProductName = productName
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\u2019")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
  const fontSize = ratio === '9:16' ? 64 : 52;

  filterParts.push(
    `[vconcat]` +
    `drawbox=x=0:y=(H-200)/2:w=W:h=200:color=black@0.7:t=fill:enable='between(t,0,3)',` +
    `drawtext=fontfile=${fontFile}:text='${safeProductName}':fontcolor=white:fontsize=${fontSize}` +
    `:x=(W-text_w)/2:y=(H-text_h)/2:enable='between(t,0,3)'` +
    `[vtitled]`
  );

  // Fade in/out
  const totalDur = numClips * 5.5;
  filterParts.push(
    `[vtitled]fade=t=in:st=0:d=0.5,fade=t=out:st=${(totalDur - 1).toFixed(1)}:d=0.8[vfinal]`
  );

  const filterComplex = filterParts.join(';');
  const outputPath = join(outputDir, `ad_${jobId}.mp4`);

  const ffmpegArgs = [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', '[vfinal]',
  ];

  if (hasAudio) {
    ffmpegArgs.push('-map', `${numClips}:a`);
    ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  }

  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  );

  console.log('[AdsService] Running FFmpeg...');
  try {
    await execFileAsync('ffmpeg', ffmpegArgs, { maxBuffer: 200 * 1024 * 1024 });
  } catch (err) {
    const stderr = err.stderr?.toString().slice(-800) || err.message;
    console.error('[AdsService] FFmpeg stderr:', stderr);
    throw new Error('FFmpeg composition failed: ' + stderr);
  }

  // Cleanup tmp
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

  console.log(`[AdsService] ✓ Final video: ${outputPath}`);
  return outputPath;
}

export function buildAdScript(productName, productDesc, language, customHook = '') {
  const lang = language?.startsWith('ar') ? 'ar' : 'en';
  return SCRIPT_TEMPLATES[lang](productName, productDesc || '', customHook);
}