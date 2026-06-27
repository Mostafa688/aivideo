// ── adsVideoService.js ────────────────────────────────────────────────────────
// Pipeline:
//   1. FLUX kontext-dev → صورة reference (input_image param)
//   2. bytedance/seedance-v1.5-pro/image-to-video-fast → I2V (image param)
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

// ── Scene configs ─────────────────────────────────────────────────────────────
const SCENE_CONFIGS = [
  {
    id: 'hero',
    label: 'Hero Shot',
    buildPrompt: (product, desc) =>
      `Product advertisement photography. The exact same ${product} from the reference image — keep every detail identical. ${desc}. Place it in a perfectly matching professional environment for this product type. Dramatic studio lighting, photorealistic 8K commercial photography, luxury advertisement quality.`,
    motion: `Slow elegant camera orbit around the product, subtle light shimmer across surface, cinematic product reveal, luxury advertisement`,
  },
  {
    id: 'lifestyle',
    label: 'Lifestyle',
    buildPrompt: (product, desc) =>
      `Lifestyle advertisement. The exact same ${product} from the reference image in its most natural real-world environment. ${desc}. Warm natural lighting, aspirational scene, photorealistic commercial photography.`,
    motion: `Gentle cinematic parallax, slow zoom out revealing lifestyle context, warm bokeh light, aspirational advertisement`,
  },
  {
    id: 'closeup',
    label: 'Close-up',
    buildPrompt: (product, desc) =>
      `Macro product photography. Extreme close-up of the exact same ${product} from the reference image. ${desc}. Ultra-shallow depth of field, razor-sharp detail, luxury product photography.`,
    motion: `Ultra-slow push-in macro, finest details emerge, barely perceptible camera drift, cinematic luxury`,
  },
  {
    id: 'angle45',
    label: '45 Angle',
    buildPrompt: (product, desc) =>
      `Commercial product photo. The exact same ${product} at 45-degree angle on reflective surface. ${desc}. Dramatic side lighting, long elegant shadow, high-end brand photography.`,
    motion: `Slow cinematic dolly left to right, shadow glides across surface, spotlight follows product`,
  },
  {
    id: 'minimal',
    label: 'Minimal',
    buildPrompt: (product, desc) =>
      `Minimalist advertisement. The exact same ${product} on white seamless background. ${desc}. Clean Apple-style aesthetic, crisp modern photography.`,
    motion: `Product levitates gently upward and settles, clean modern bounce, soft shadow pulse`,
  },
  {
    id: 'action',
    label: 'In Use',
    buildPrompt: (product, desc) =>
      `Product-in-use advertisement. The exact same ${product} in ideal usage context. ${desc}. Aspirational lifestyle energy, cinematic depth shift.`,
    motion: `Cinematic camera arc reveals product in use, dynamic depth of field shift, aspirational energy`,
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

// ── FLUX kontext-dev ──────────────────────────────────────────────────────────
async function generateAdSceneImage(productImageBase64, productName, productDesc, sceneConfig, ratio) {
  const b64 = productImageBase64.replace(/^data:image\/\w+;base64,/, '');
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

  const start = Date.now();
  while (Date.now() - start < 180000) {
    await new Promise(r => setTimeout(r, 5000));
    const p = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    const pd = await p.json();
    console.log(`[AdsService] FLUX "${sceneConfig.label}" → ${pd.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (pd.status === 'succeeded') return Array.isArray(pd.output) ? pd.output[0] : pd.output;
    if (pd.status === 'failed' || pd.status === 'canceled') throw new Error(`FLUX failed: ${pd.error}`);
  }
  throw new Error('FLUX timed out');
}

// ── Seedance 1.5 Pro Fast I2V ─────────────────────────────────────────────────
// model: bytedance/seedance-v1.5-pro/image-to-video-fast
// input params: image (URL or base64), prompt, aspect_ratio, resolution, duration
async function animateSceneImage(imageUrl, motionPrompt, ratio) {
  const input = {
    image: imageUrl,                    // ← الـ param الصح لـ seedance-v1.5-pro I2V
    prompt: motionPrompt,
    aspect_ratio: ratio === '9:16' ? '9:16' : '16:9',
    resolution: '480p',
    duration: 5,
  };

  console.log(`[AdsService] Seedance I2V → image: ${imageUrl?.slice(0,80)}`);

  const res = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-v1.5-pro/image-to-video-fast/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) throw new Error(`Seedance ${res.status}: ${(await res.text()).slice(0,300)}`);
  const data = await res.json();
  console.log(`[AdsService] Seedance response: status=${data.status} error=${data.error||'none'}`);
  if (data.error) throw new Error(`Seedance: ${data.error}`);
  if (data.status === 'succeeded' && data.output) return Array.isArray(data.output) ? data.output[0] : data.output;
  if (!data.id) throw new Error(`No prediction ID: ${JSON.stringify(data).slice(0,200)}`);

  // Poll
  const start = Date.now();
  while (Date.now() - start < 420000) {
    await new Promise(r => setTimeout(r, 5000));
    const sr = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    if (!sr.ok) continue;
    const sd = await sr.json();
    console.log(`[AdsService] Seedance → ${sd.status} (${Math.round((Date.now()-start)/1000)}s)`);
    if (sd.status === 'succeeded') {
      const url = Array.isArray(sd.output) ? sd.output[0] : sd.output;
      if (!url) throw new Error('No video URL in Seedance output');
      return url;
    }
    if (sd.status === 'failed' || sd.status === 'canceled') throw new Error(`Seedance failed: ${sd.error||'unknown'}`);
  }
  throw new Error('Seedance timed out');
}

// ── FFmpeg compose ────────────────────────────────────────────────────────────
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
    for (const f of ['/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']) {
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

  // 1. FLUX
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

  // 2. Audio
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

  // 3. Seedance I2V
  progress('animate', `Animating ${sceneImages.length} scenes...`);
  const animatedScenes = [];
  for (let i = 0; i < sceneImages.length; i++) {
    const scene = sceneImages[i];
    try {
      console.log(`[AdsService] [${i+1}/${sceneImages.length}] Seedance I2V: ${scene.label}`);
      const videoUrl = await animateSceneImage(scene.imageUrl, scene.motion, ratio);
      animatedScenes.push({ ...scene, videoUrl });
      console.log(`[AdsService] ✓ Animated ${i+1}: ${scene.label}`);
      progress('animate', `Animated ${i+1}/${sceneImages.length}: ${scene.label} ✓`);
    } catch (err) {
      console.error(`[AdsService] ✗ Animate "${scene.label}": ${err.message}`);
    }
  }
  if (animatedScenes.length === 0) throw new Error('All animation attempts failed');

  // 4. FFmpeg
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