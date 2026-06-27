// ── adsVideoService.js ────────────────────────────────────────────────────────
// Pipeline:
//   1. FLUX kontext-dev → صورة reference
//   2. seedance-2.0-fast I2V بـ [Image1] في الـ prompt (مدعوم على Replicate)
//   3. FFmpeg → دمج + عنوان + fade

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
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

// ── Scene configs — بدون "dark background" في أي prompt ──────────────────────
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc) =>
      `Professional product advertisement. The exact ${product} from the reference image — keep every detail. ${desc}. Best fitting professional environment for this exact product. Perfect studio lighting matching the product type, photorealistic 8K commercial photography.`,
    motion: (product) =>
      `[Image1] ${product} product slowly rotates revealing all sides, subtle light shimmer, cinematic slow motion product reveal, professional advertisement`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    buildPrompt: (product, desc) =>
      `Lifestyle advertisement. The exact ${product} from the reference image in its most natural real-world environment. ${desc}. Warm natural lighting, aspirational scene, photorealistic.`,
    motion: (product) =>
      `[Image1] ${product} in lifestyle setting, gentle parallax motion, slow zoom out revealing context, warm bokeh, aspirational advertisement`,
  },
  {
    id: 'closeup',
    label: 'Close-up',
    buildPrompt: (product, desc) =>
      `Macro product photo. The exact ${product} from the reference image — extreme close-up of finest details. ${desc}. Ultra-shallow depth of field, razor-sharp, luxury photography.`,
    motion: (product) =>
      `[Image1] ${product} ultra slow macro push-in, finest surface details emerge, barely perceptible camera drift, luxury cinematic`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc) =>
      `Commercial product photo. The exact ${product} at a dynamic 45-degree angle on a matching surface. ${desc}. Dramatic side lighting, long elegant shadow, high-end photography.`,
    motion: (product) =>
      `[Image1] ${product} slow cinematic dolly left to right, shadow glides across surface, spotlight follows product`,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    buildPrompt: (product, desc) =>
      `Minimalist ad. The exact ${product} on white seamless background, soft shadow below. ${desc}. Clean Apple-style aesthetic, crisp modern photography.`,
    motion: (product) =>
      `[Image1] ${product} gently levitates upward and settles, clean modern bounce, soft shadow pulse beneath`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc) =>
      `Product-in-use advertisement. The exact ${product} being elegantly used in ideal context. ${desc}. Aspirational energy, cinematic depth shift, commercial photography.`,
    motion: (product) =>
      `[Image1] ${product} in use, cinematic camera arc reveals product, dynamic depth of field shift, aspirational energy`,
  },
];

const SCRIPT_TEMPLATES = {
  ar: (n, d, h) => `${h||`هل تعرف سر ${n}؟`}\n\n${d}\n\nصُنع بدقة. صُمم لك.\n\n${n} — لأنك تستحق الأفضل.`,
  en: (n, d, h) => `${h||`What if one product could change everything?`}\n\nIntroducing ${n}.\n\n${d}\n\nCrafted with precision. Designed for you.\n\n${n} — Because you deserve the best.`,
};

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
  return destPath;
}

// ── poll helper ───────────────────────────────────────────────────────────────
async function pollPrediction(predictionId, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    console.log(`[AdsService] ${label} → ${data.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (data.status === 'succeeded') return Array.isArray(data.output) ? data.output[0] : data.output;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`${label} failed: ${data.error}`);
  }
  throw new Error(`${label} timed out`);
}

// ── Step 1: FLUX kontext-dev ──────────────────────────────────────────────────
async function generateAdSceneImage(productImageBase64, productName, productDesc, sceneConfig, ratio) {
  const b64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '');
  const prompt = sceneConfig.buildPrompt(productName, productDesc);

  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({
      input: {
        input_image: `data:image/jpeg;base64,${b64}`,
        prompt,
        aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
        output_format: 'webp',
        output_quality: 90,
        guidance: 3.5,
        num_inference_steps: 28,
      },
    }),
  });

  if (!res.ok) throw new Error(`FLUX ${res.status}: ${(await res.text()).slice(0,200)}`);
  const data = await res.json();
  if (data.error) throw new Error(`FLUX: ${data.error}`);
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error('No prediction ID from FLUX');
  return await pollPrediction(data.id, 180000, `FLUX "${sceneConfig.label}"`);
}

// ── Step 2: Seedance 2.0 Fast I2V via [Image1] ───────────────────────────────
async function animateWithSeedance2(imageUrl, motionPrompt, ratio) {
  // seedance-2.0-fast يقبل reference image عن طريق [Image1] في الـ prompt
  // ونحط الـ image URL في الـ images array
  const input = {
    prompt: motionPrompt,  // اللي فيه [Image1] بالفعل
    images: [imageUrl],    // ← الصورة المرفوعة
    aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
    resolution: '480p',
    duration: 5,
  };

  console.log(`[AdsService] Seedance 2.0 Fast I2V → ${imageUrl?.slice(0,80)}`);
  console.log(`[AdsService] Motion prompt: ${motionPrompt.slice(0,100)}`);

  const res = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-2.0-fast/predictions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) throw new Error(`Seedance ${res.status}: ${(await res.text()).slice(0,300)}`);
  const data = await res.json();
  console.log(`[AdsService] Seedance response: status=${data.status} error=${data.error||'none'}`);
  if (data.error) throw new Error(`Seedance: ${data.error}`);
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error(`No prediction ID from Seedance: ${JSON.stringify(data).slice(0,200)}`);
  return await pollPrediction(data.id, 420000, `Seedance 2.0 Fast`);
}

// ── Step 3: FFmpeg compose ────────────────────────────────────────────────────
async function composeAdVideo({ animatedScenes, productName, showTitle, audioPath, ratio, outputDir, jobId }) {
  const [W, H] = ratio === '9:16' ? [1080, 1920] : [1920, 1080];
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  const clipPaths = [];
  for (let i = 0; i < animatedScenes.length; i++) {
    const cp = join(TEMP_DIR, `ads_${jobId}_${i}.mp4`);
    await downloadFile(animatedScenes[i].videoUrl, cp);
    clipPaths.push(cp);
    console.log(`[AdsService] ✓ Clip ${i+1} downloaded`);
  }

  const numClips = clipPaths.length;
  const hasAudio = !!(audioPath && fs.existsSync(audioPath));

  let fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  if (/[\u0600-\u06FF]/.test(productName)) {
    for (const f of ['/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']) {
      if (fs.existsSync(f)) { fontFile = f; break; }
    }
  }

  const inputArgs = clipPaths.flatMap(p => ['-i', p]);
  if (hasAudio) inputArgs.push('-i', audioPath);

  const fp = [];
  for (let i = 0; i < numClips; i++) {
    fp.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24[sv${i}]`);
  }
  fp.push(`${clipPaths.map((_,i)=>`[sv${i}]`).join('')}concat=n=${numClips}:v=1:a=0[vconcat]`);

  if (showTitle && productName.trim()) {
    const safe = productName.trim()
      .replace(/\\/g,'\\\\').replace(/'/g,'\u2019')
      .replace(/:/g,'\\:').replace(/\[/g,'\\[').replace(/\]/g,'\\]');
    const fs2 = ratio==='9:16'?72:60;
    const bH = ratio==='9:16'?240:200;
    const bY = Math.floor((H-bH)/2);
    fp.push(
      `[vconcat]drawbox=x=0:y=${bY}:w=${W}:h=${bH}:color=black@0.55:t=fill:enable='between(t,0,3.5)',`+
      `drawbox=x=0:y=${bY}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',`+
      `drawbox=x=0:y=${bY+bH-3}:w=${W}:h=3:color=white@0.6:t=fill:enable='between(t,0,3.5)',`+
      `drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=black@0.5:fontsize=${fs2}:x=(w-text_w)/2+3:y=(h-text_h)/2+3:enable='between(t,0,3.5)',`+
      `drawtext=fontfile=${fontFile}:text='${safe}':fontcolor=white:fontsize=${fs2}:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,0,3.5)'[vtitled]`
    );
  } else {
    fp.push(`[vconcat]null[vtitled]`);
  }

  const totalDur = numClips * 5.5;
  fp.push(`[vtitled]fade=t=in:st=0:d=0.6,fade=t=out:st=${(totalDur-1.2).toFixed(1)}:d=1.0[vfinal]`);

  const outputPath = join(outputDir, `ad_${jobId}.mp4`);
  const args = [...inputArgs, '-filter_complex', fp.join(';'), '-map', '[vfinal]'];
  if (hasAudio) args.push('-map', `${numClips}:a`, '-c:a', 'aac', '-b:a', '128k', '-shortest');
  args.push('-c:v','libx264','-preset','fast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart','-y',outputPath);

  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 200*1024*1024 });
  } catch (err) {
    throw new Error('FFmpeg: ' + (err.stderr?.toString().slice(-600) || err.message));
  }

  setTimeout(() => { clipPaths.forEach(f => { try { fs.unlinkSync(f); } catch {} }); }, 60000);
  return outputPath;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
export async function renderAdVideo({
  productImageBase64, productName, productDesc,
  audioMode, uploadedAudioPath, aiVoiceKey,
  ratio, language, sceneCount, customHook, showTitle,
  outputDir, jobId, onProgress,
}) {
  const progress = (step, msg) => { console.log(`[AdsService][${jobId}] ${step}: ${msg}`); onProgress?.({ step, msg }); };

  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  if (!productDesc?.trim()) throw new Error('Product description is required');

  const count = Math.min(Math.max(parseInt(sceneCount)||5, 3), SCENE_CONFIGS.length);
  const selectedScenes = SCENE_CONFIGS.slice(0, count);
  console.log(`[AdsService] ${count} scenes: ${selectedScenes.map(s=>s.label).join(', ')}`);

  // ── 1. FLUX ───────────────────────────────────────────────────────────────
  progress('scenes', `Generating ${count} scenes with FLUX...`);
  const sceneImages = [];
  for (let i = 0; i < selectedScenes.length; i++) {
    const sc = selectedScenes[i];
    try {
      console.log(`[AdsService] [${i+1}/${count}] FLUX: ${sc.label}`);
      const imageUrl = await generateAdSceneImage(productImageBase64, productName, productDesc.trim(), sc, ratio);
      console.log(`[AdsService] ✓ FLUX ${i+1}: ${imageUrl}`);
      sceneImages.push({ ...sc, imageUrl });
      progress('scenes', `Scene ${i+1}/${count}: ${sc.label} ✓`);
      if (i < selectedScenes.length - 1) await new Promise(r => setTimeout(r, 11000));
    } catch (err) {
      console.error(`[AdsService] ✗ FLUX "${sc.label}": ${err.message}`);
    }
  }
  if (sceneImages.length === 0) throw new Error('All FLUX scene generation failed');

  // ── 2. Audio ──────────────────────────────────────────────────────────────
  let audioPath = null;
  if (audioMode === 'ai_voice') {
    progress('voice', 'Generating AI voiceover...');
    try {
      const lang = language?.startsWith('ar') ? 'ar' : 'en';
      const script = SCRIPT_TEMPLATES[lang](productName, productDesc.trim(), customHook||'');
      const af = await generateVoiceover(script, aiVoiceKey||'male_arabic', 'education', 0, language||'ar');
      audioPath = join(process.cwd(), 'outputs', af);
    } catch (err) { console.warn('[AdsService] Voiceover failed:', err.message); }
  } else if (audioMode === 'upload' && uploadedAudioPath) {
    audioPath = uploadedAudioPath;
  }

  // ── 3. Seedance 2.0 Fast I2V ──────────────────────────────────────────────
  progress('animate', `Animating ${sceneImages.length} scenes with Seedance 2.0...`);
  const animatedScenes = [];
  for (let i = 0; i < sceneImages.length; i++) {
    const scene = sceneImages[i];
    try {
      const motionPrompt = scene.motion(productName);
      console.log(`[AdsService] [${i+1}/${sceneImages.length}] Seedance: ${scene.label}`);
      const videoUrl = await animateWithSeedance2(scene.imageUrl, motionPrompt, ratio);
      animatedScenes.push({ ...scene, videoUrl });
      console.log(`[AdsService] ✓ Animated ${i+1}: ${scene.label}`);
      progress('animate', `Animated ${i+1}/${sceneImages.length}: ${scene.label} ✓`);
    } catch (err) {
      console.error(`[AdsService] ✗ Animate "${scene.label}": ${err.message}`);
    }
  }
  if (animatedScenes.length === 0) throw new Error('All animation attempts failed');

  // ── 4. FFmpeg ─────────────────────────────────────────────────────────────
  progress('compose', `Composing ${animatedScenes.length} clips...`);
  const outputPath = await composeAdVideo({
    animatedScenes, productName, showTitle: showTitle !== false,
    audioPath, ratio, outputDir, jobId,
  });

  progress('done', 'Ad video ready!');
  return { outputPath, sceneCount: animatedScenes.length };
}

export function buildAdScript(n, d, lang, h='') {
  return SCRIPT_TEMPLATES[lang?.startsWith('ar')?'ar':'en'](n, d||'', h);
}