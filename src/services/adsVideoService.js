// ── adsVideoService.js ────────────────────────────────────────────────────────
// Pipeline:
//   1. FLUX kontext-dev  → صورة reference لكل scene
//   2. حفظ الصورة على Railway /outputs/ads_img/ مؤقتاً (URL عام)
//   3. Seedance (بـ URL عام من Railway) → يحرك الصورة فعلاً
//   4. FFmpeg → دمج + عنوان المنتج الاحترافي (اختياري) + fade
//   * الصور المؤقتة تتمسح تلقائياً بعد 24 ساعة

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
const SITE_URL = (process.env.SITE_URL || process.env.FRONTEND_URL || 'https://aivideo-production-557f.up.railway.app').replace(/\/$/, '');

// مجلد الصور المؤقتة
const ADS_IMG_DIR = join(process.cwd(), 'outputs', 'ads_img');
fs.mkdirSync(ADS_IMG_DIR, { recursive: true });

// ── Auto-cleanup: مسح الصور الأقدم من 24 ساعة ────────────────────────────────
function scheduleImageCleanup(filePath) {
  setTimeout(() => {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
  }, 24 * 60 * 60 * 1000); // 24 ساعة
}

// تشغيل cleanup عند startup للملفات القديمة
function cleanupOldImages() {
  try {
    const files = fs.readdirSync(ADS_IMG_DIR);
    const now = Date.now();
    for (const file of files) {
      const fp = join(ADS_IMG_DIR, file);
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(fp);
        console.log(`[AdsService] Cleaned up old image: ${file}`);
      }
    }
  } catch {}
}
cleanupOldImages();

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
      `Keep the exact same ${product} product from the reference image, preserve all details. Show it in a modern elegant lifestyle setting perfectly suited for: ${desc}. Natural warm sunlight coming from the side, aspirational scene, professional commercial photography, photorealistic, cinematic.`,
    motion: `Gentle parallax motion, camera slowly zooms out revealing the elegant lifestyle scene, warm bokeh light particles floating in air, cinematic atmosphere`,
  },
  {
    id: 'closeup',
    label: 'Close-up',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image, preserve all details. Extreme close-up macro shot showing the finest texture and premium material detail. ${desc}. Shallow depth of field, beautiful creamy bokeh background, ultra sharp detail on product, luxury product photography.`,
    motion: `Ultra slow macro push-in toward the product, finest details emerge, very subtle camera drift left to right, luxury cinematic feel`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image, preserve all details. Photographed at a dynamic 45-degree angle on a sleek dark reflective marble surface. ${desc}. Dramatic side lighting creating depth and a long elegant shadow, high-end luxury brand photography, commercial advertisement.`,
    motion: `Slow cinematic dolly move from left to right, dramatic shadow sweeps elegantly across the marble surface, refined luxury product motion`,
  },
  {
    id: 'minimal',
    label: 'Minimal White',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image, preserve all details. Pure white seamless background, clean minimal soft shadow below the product. ${desc}. Modern minimal aesthetic, Apple-style luxury product photography, high contrast, crisp and clean.`,
    motion: `Product gently levitates upward slightly and returns with a soft bounce, clean crisp modern motion, subtle soft shadow pulse beneath`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc) =>
      `Keep the exact same ${product} product from the reference image, preserve all details. Show it being elegantly used or interacted with in an ideal aspirational scenario. ${desc}. Dynamic composition, cinematic depth of field, professional commercial photography, beautiful atmosphere.`,
    motion: `Dynamic cinematic camera arc slowly around the product, aspirational lifestyle energy, depth of field shifts to reveal the product, professional advertisement feel`,
  },
];

// ── Ad script templates ───────────────────────────────────────────────────────
const SCRIPT_TEMPLATES = {
  ar: (productName, desc, hook) =>
    `${hook || `هل تعرف سر ${productName}؟`}\n\n${desc}\n\nصُنع بدقة. صُمم لك.\n\n${productName} — لأنك تستحق الأفضل.`,
  en: (productName, desc, hook) =>
    `${hook || `What if one product could change everything?`}\n\nIntroducing ${productName}.\n\n${desc}\n\nCrafted with precision. Designed for you.\n\n${productName} — Because you deserve the best.`,
};

// ── Helper: download buffer ───────────────────────────────────────────────────
async function fetchBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} - ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Helper: download file to disk ────────────────────────────────────────────
async function downloadFile(url, destPath) {
  const buf = await fetchBuffer(url);
  fs.writeFileSync(destPath, buf);
  return destPath;
}

// ── Helper: حفظ الصورة على Railway وإرجاع URL عام ────────────────────────────
async function saveImageToRailway(imageBuffer, filename) {
  const filePath = join(ADS_IMG_DIR, filename);
  fs.writeFileSync(filePath, imageBuffer);
  scheduleImageCleanup(filePath);
  const publicUrl = `${SITE_URL}/outputs/ads_img/${filename}`;
  console.log(`[AdsService] Image saved locally, public URL: ${publicUrl}`);
  return publicUrl;
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
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`Replicate ${data.status}: ${data.error || 'unknown'}`);
    }
  }
  throw new Error(`Replicate timed out after ${timeoutMs/1000}s`);
}

// ── Step 1: FLUX kontext-dev → صورة reference ────────────────────────────────
async function generateAdSceneImage(productImageBase64, productName, productDesc, sceneConfig, ratio) {
  const prompt = sceneConfig.buildPrompt(productName, productDesc);
  console.log(`[AdsService] FLUX prompt for "${sceneConfig.label}": ${prompt.slice(0, 80)}...`);

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

  let replicateImageUrl;
  if (data.status === 'succeeded' && data.output) {
    replicateImageUrl = Array.isArray(data.output) ? data.output[0] : data.output;
  } else {
    if (!data.id) throw new Error('No prediction ID from FLUX');
    replicateImageUrl = await pollReplicate(data.id, 180000, `FLUX "${sceneConfig.label}"`);
  }

  // تحميل الصورة من Replicate وحفظها على Railway
  console.log(`[AdsService] Downloading FLUX image: ${replicateImageUrl}`);
  const imageBuffer = await fetchBuffer(replicateImageUrl);
  const filename = `flux_${Date.now()}_${sceneConfig.id}.jpg`;
  const publicUrl = await saveImageToRailway(imageBuffer, filename);

  return publicUrl;
}

// ── Step 2: Seedance → تحريك الصورة (بـ URL من Railway) ──────────────────────
async function animateSceneImage(railwayImageUrl, motionPrompt, hasVoiceover, ratio) {
  const aspectRatio = ratio === '9:16' ? '9:16' : '16:9';
  const duration = hasVoiceover ? 5 : 6;

  // كلا الموديلين بيستخدموا first_frame_image
  // seedance-1-pro-fast أكثر استقراراً للـ image-to-video
  const modelPath = 'bytedance/seedance-1-pro-fast';
  const input = {
    prompt: motionPrompt,
    aspect_ratio: aspectRatio,
    resolution: '480p',
    duration,
    fps: 24,
    first_frame_image: railwayImageUrl,
  };

  console.log(`[AdsService] Seedance input image: ${railwayImageUrl}`);

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
    throw new Error(`Seedance error ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(`Seedance: ${data.error}`);

  if (data.status === 'succeeded' && data.output) {
    return Array.isArray(data.output) ? data.output[0] : data.output;
  }
  if (!data.id) throw new Error('No prediction ID from Seedance');
  return await pollReplicate(data.id, 420000, `Seedance "${modelPath}"`);
}

// ── Step 3: FFmpeg compose ────────────────────────────────────────────────────
async function composeAdVideo({ animatedScenes, productName, showTitle, audioPath, ratio, outputDir, jobId }) {
  const [W, H] = ratio === '9:16' ? [1080, 1920] : [1920, 1080];
  const tmpDir = join(outputDir, `ads_tmp_${jobId}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // تحميل الكليبات
  const clipPaths = [];
  for (let i = 0; i < animatedScenes.length; i++) {
    const clipPath = join(tmpDir, `clip_${i}.mp4`);
    console.log(`[AdsService] Downloading clip ${i+1}/${animatedScenes.length}: ${animatedScenes[i].videoUrl}`);
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

  if (showTitle && productName.trim()) {
    const safeProductName = productName.trim()
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\u2019')
      .replace(/:/g, '\\:')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]');

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

  console.log('[AdsService] Running FFmpeg compose...');
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

  const count = Math.min(Math.max(parseInt(sceneCount) || 5, 3), SCENE_CONFIGS.length);
  const selectedScenes = SCENE_CONFIGS.slice(0, count);

  // ── 1. FLUX: توليد الصور وحفظها على Railway ───────────────────────────────
  progress('scenes', `Generating ${count} product scenes with FLUX...`);
  const sceneImages = [];

  for (const sceneConfig of selectedScenes) {
    try {
      console.log(`[AdsService] Generating scene: ${sceneConfig.label}`);
      const railwayImageUrl = await generateAdSceneImage(
        productImageBase64, productName, productDesc.trim(), sceneConfig, ratio
      );
      sceneImages.push({ ...sceneConfig, imageUrl: railwayImageUrl });
      console.log(`[AdsService] ✓ Scene ready: ${sceneConfig.label} → ${railwayImageUrl}`);
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
      console.log(`[AdsService] ✓ Voiceover ready: ${audioFilename}`);
    } catch (err) {
      console.warn('[AdsService] Voiceover failed, continuing without audio:', err.message);
    }
  } else if (audioMode === 'upload' && uploadedAudioPath) {
    audioPath = uploadedAudioPath;
    hasVoiceover = true;
  }

  // ── 3. Seedance: تحريك الصور بـ Railway URLs ──────────────────────────────
  progress('animate', `Animating ${sceneImages.length} scenes with Seedance...`);
  const animatedScenes = [];

  for (const scene of sceneImages) {
    try {
      console.log(`[AdsService] Animating: ${scene.label} using ${scene.imageUrl}`);
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
    showTitle: showTitle !== false,
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