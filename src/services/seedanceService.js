import { addRealCaptionsForModel, addCaptionsWithTimingForModel } from './renderService.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const RATIOS = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720,  h: 1280 },
  '1:1':  { w: 720,  h: 720  },
};

// ── توزيع نسبي لمدة كل مشهد حسب طول الكلام فيه (بدل تثبيت مدة واحدة لكل الكليبات) ──
// ده بيمنع إن الصوت يسبق المشهد أو المشهد يسبق الصوت، وبيمنع تكرار/قطع الفيديو كله عشان يطابق الصوت
function computeProportionalDurations(scenes, totalDuration, minSec = 3.5, maxSec = 14) {
  const wordCounts = scenes.map(s => Math.max((s.text || '').trim().split(/\s+/).filter(Boolean).length, 1));
  const totalWords = wordCounts.reduce((a, b) => a + b, 0) || scenes.length;
  let durations = wordCounts.map(wc => Math.min(Math.max((wc / totalWords) * totalDuration, minSec), maxSec));
  const sum = durations.reduce((a, b) => a + b, 0);
  const scale = sum > 0 ? totalDuration / sum : 1;
  return durations.map(d => Math.max(Math.min(d * scale, maxSec), minSec));
}

async function generateSeedanceClip(prompt, ratio = '16:9') {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');

  const headers = {
    'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'wait',
  };

  const submitRes = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-1-pro-fast/predictions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: { prompt, aspect_ratio: ratio, resolution: '720p', duration: 5, fps: 24, camera_fixed: false },
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Replicate submit error ${submitRes.status}: ${err}`);
  }

  const prediction = await submitRes.json();

  if (prediction.status === 'succeeded' && prediction.output) {
    const videoUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    console.log(`[Seedance] Done immediately: ${videoUrl}`);
    return videoUrl;
  }

  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`No prediction ID: ${JSON.stringify(prediction)}`);
  console.log(`[Seedance] Job submitted: ${predictionId}`);

  const maxWait = 180_000;
  const pollInterval = 5_000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!statusRes.ok) { console.warn(`[Seedance] Poll ${statusRes.status}, retry...`); continue; }
    const statusData = await statusRes.json();
    const status = statusData.status;
    console.log(`[Seedance] Status: ${status} (${Math.round((Date.now() - startTime) / 1000)}s)`);
    if (status === 'succeeded') {
      const videoUrl = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
      if (!videoUrl) throw new Error('No video URL in output');
      return videoUrl;
    }
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Replicate failed: ${statusData.error || 'unknown'}`);
    }
  }
  throw new Error('Replicate timed out after 3 minutes');
}

async function downloadVideo(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

// ✅ NEW FIX: كان بيبعت الصور الخام (base64) مباشرة جوه الـ JSON body لـ Seedance في حالة
// أكتر من صورة (multi-character) — الحمولة الضخمة دي كانت بترفض/تتجاهل بصمت من غير أي رسالة
// خطأ، فمصفوفة "images" كانت بتوصل فاضية فعليًا. الحل: نرفع كل صورة كملف حقيقي على
// Replicate's Files API الأول ونستخدم الرابط القصير الناتج (بنفس منطق حالة الصورة الواحدة
// اللي بترفع عن طريق FLUX وبترجع رابط https://replicate.delivery/... قصير وشغال).
async function uploadImageToReplicate(photoBase64) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const b64 = photoBase64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(b64, 'base64');
  // ✅ نبني multipart/form-data يدويًا بدل الاعتماد على FormData/Blob العالميين، عشان نضمن
  // التوافق مع node-fetch (v2) المستخدمة في المشروع من غير أي مفاجآت
  const boundary = `----aivideoBoundary${Date.now().toString(16)}`;
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="content"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, tail]);
  const res = await fetch('https://api.replicate.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Replicate file upload failed ${res.status}: ${err}`);
  }
  const data = await res.json();
  const url = data?.urls?.get || data?.url;
  if (!url) throw new Error('Replicate file upload returned no URL');
  return url;
}

// ✅ NEW: دمج صورتين شخصيتين في صورة واحدة موحدة (نفس المكان/الوضعية) باستخدام موديل FLUX
// المخصص لده على Replicate. ده بيقبل صورتين بس (قيد رسمي من Replicate نفسها)، فبنبنيه
// كخطوة أساسية وبعدين نكرره في شجرة ثنائية عشان يغطي أي عدد شخصيات (لحد 5).
async function combineTwoImages(urlA, urlB, mergePrompt) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const inputPayload = {
    input_image_1: urlA,
    input_image_2: urlB,
    prompt: mergePrompt || 'Combine these two people into one single cohesive photo, standing together naturally side by side, keep each person\'s exact face, identity, hairstyle, and outfit completely unchanged from their own original photo, plain clean white background, consistent lighting across both, full body visible, front-facing, no other objects',
    aspect_ratio: 'match_input_image',
  };
  const res = await fetch('https://api.replicate.com/v1/models/flux-kontext-apps/multi-image-kontext-max/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({ input: inputPayload }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`FLUX multi-image merge failed ${res.status}: ${err.slice(0, 200)}`);
  }
  let data = await res.json();
  if (data.error) throw new Error(`FLUX multi-image merge error: ${data.error}`);
  if (data.status !== 'succeeded') {
    const predictionId = data.id;
    const headers = { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` };
    const maxWait = 120_000, pollInterval = 3_000, startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
      if (!statusRes.ok) continue;
      data = await statusRes.json();
      if (data.status === 'succeeded') break;
      if (data.status === 'failed' || data.status === 'canceled') throw new Error(`FLUX multi-image merge ${data.status}: ${data.error || 'unknown'}`);
    }
  }
  const out = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!out) throw new Error('FLUX multi-image merge returned no output');
  return out;
}

// ✅ NEW: شجرة دمج ثنائية — بتدمج كل صورتين مع بعض على التوازي، وبعدين نتايج الدمج دي مع
// بعض، وهكذا لحد ما يفضل صورة واحدة بس تجمع كل الشخصيات بالتساوي تقريبًا (بدل ما شخصية
// واحدة "تتخفف" أكتر من غيرها في دمج تسلسلي طويل). لو عدد الصور فردي، آخر واحدة بتتنقل
// للمستوى الجاي من غير دمج لحد ما تلاقي زوج ليها.
async function mergeCharacterPhotosTree(urls, mergePrompt) {
  let current = [...urls];
  while (current.length > 1) {
    console.log(`[Model5] Merging ${current.length} images into ${Math.ceil(current.length / 2)}...`);
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(await combineTwoImages(current[i], current[i + 1], mergePrompt));
      } else {
        next.push(current[i]); // فردي — تتنقل من غير دمج
      }
    }
    current = next;
  }
  return current[0];
}

// ── FLUX Kontext Dev: generate reference image from character photo ──────────
// Cheapest Replicate model for character reference (~$0.01-0.02/image)
async function generateReferenceImage(photoBase64OrUrl, scenePrompt, ratio = '9:16') {
  if (!REPLICATE_API_TOKEN) return null;
  try {
    // ✅ FIX: بتقبل دلوقتي رابط https مباشر (لصورة المجموعة المدمجة) بجانب base64 العادي
    const isUrl = /^https?:\/\//i.test(photoBase64OrUrl);
    let imageDataUrl;
    if (isUrl) {
      imageDataUrl = photoBase64OrUrl;
    } else {
      const b64 = photoBase64OrUrl.replace(/^data:image\/\w+;base64,/, '');
      imageDataUrl = `data:image/jpeg;base64,${b64}`;
    }

    const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-kontext-dev/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait',
      },
      body: JSON.stringify({
        input: {
          input_image: imageDataUrl,
          prompt: `${scenePrompt}, keep every person visible in the reference image exactly as they are — same faces, same identities, same facial features, same number of people, none added or removed, none replaced`,
          aspect_ratio: ratio, // ✅ FIX: كان ثابت '9:16' دايمًا حتى لو الفيديو المطلوب 16:9 أو 1:1 — ده كان بيعمل صورة مرجعية بنسبة أبعاد مختلفة عن الفيديو، فـ Seedance كان بيرفضها فعليًا كـ "أول فريم" ويرجع يولّد من الصفر بدل ما يحركها
          output_format: 'webp',
          guidance: 3.5,
          num_inference_steps: 28,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn(`[Model5] FLUX Kontext error ${res.status}: ${err.slice(0, 100)}`);
      return null;
    }

    const data = await res.json();
    if (data.error) { console.warn('[Model5] FLUX Kontext prediction error:', data.error); return null; }

    // If not done yet (no Prefer:wait support), poll once
    if (data.status !== 'succeeded') {
      if (!data.id) return null;
      let attempts = 0;
      while (attempts < 24) { // max ~2 min
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, {
          headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
        });
        const pollData = await pollRes.json();
        if (pollData.status === 'succeeded') {
          return Array.isArray(pollData.output) ? pollData.output[0] : pollData.output;
        }
        if (pollData.status === 'failed' || pollData.status === 'canceled') {
          console.warn('[Model5] FLUX Kontext failed:', pollData.error);
          return null;
        }
        attempts++;
      }
      return null;
    }

    return Array.isArray(data.output) ? data.output[0] : data.output;
  } catch (e) {
    console.warn('[Model5] generateReferenceImage error:', e.message);
    return null;
  }
}

// ── Seedance 2.0 Fast for Model 5 ────────────────────────────────────────
// imageUrls: null | string | string[] — reference/character image(s) for this clip.
//   - 1 image   → real image-to-video: that exact image is locked as the first frame.
//   - 2-5 images → multimodal reference: all characters must appear TOGETHER in one scene.
// ✅ REAL FIX (verified against Replicate's actual schema for bytedance/seedance-2.0-fast):
// this model has NO "first_frame_image" field — it's a unified multimodal model whose only
// image input is the "images" array (up to 9). Whether an image is used as "the first frame"
// vs "a character reference" is decided ENTIRELY by how the prompt talks about [Image1]/[Image2]/etc,
// not by a separate parameter. Sending first_frame_image (an unknown field) was being silently
// ignored by Replicate, so the model fell back to pure text-to-video — which matches the bug reported.
async function generateSeedance2Clip(basePrompt, ratio = '9:16', duration = 5, imageUrls = null) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const headers = {
    'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
    'Prefer': 'wait',
  };

  const urls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : (imageUrls ? [imageUrls] : []);
  let prompt = basePrompt;

  // ✅ REAL FIX #2 (confirmed via actual Replicate JSON payload comparison against the working
  // Ads flow): Seedance 2.0 Fast's schema has TWO SEPARATE fields — a singular "image" (true
  // first-frame lock, animated forward exactly like Ads' seedance-1-pro-fast "image" field) and
  // a plural "images" array (loose multi-character/style reference, NOT a first-frame lock —
  // the model is free to compose a brand new scene around the identity). We were putting the
  // single-photo case into "images" (the loose array) instead of "image" (the strict lock),
  // which is exactly why one uploaded photo wasn't being animated — the model correctly treated
  // it as a loose reference, not a frame to continue from.
  if (urls.length === 1) {
    prompt = `The exact photo provided is the first frame of this video — its composition, framing, subject and background must stay completely unchanged in the opening instant, then animate forward from it. ${basePrompt}`;
    console.log(`[Model5] Seedance I2V — single reference image locked as first frame (using singular "image" field)`);
  } else if (urls.length > 1) {
    const tags = urls.map((_, i) => `[Image${i + 1}]`).join(', ');
    prompt = `${tags} are reference photos of the different characters in this story. All of them must appear together in this single unified scene, interacting with each other, each one keeping their exact face and identity from their own reference photo. ${basePrompt}`;
    console.log(`[Model5] Seedance multi-character reference — ${urls.length} characters combined into one scene`);
  }

  const input = { prompt, aspect_ratio: ratio, resolution: '480p', duration, fps: 24 };
  if (urls.length === 1) {
    input.image = urls[0]; // ✅ singular field = strict first-frame lock (matches Ads' working approach)
  } else if (urls.length > 1) {
    input.images = urls; // plural field = multi-character loose reference (correct use for this case)
  }

  const submitRes = await fetch('https://api.replicate.com/v1/models/bytedance/seedance-2.0-fast/predictions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
  });
  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Seedance2 error ${submitRes.status}: ${err}`);
  }
  const prediction = await submitRes.json();
  if (prediction.status === 'succeeded' && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`No prediction ID`);
  const maxWait = 300_000;
  const pollInterval = 5_000;
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!statusRes.ok) continue;
    const statusData = await statusRes.json();
    console.log(`[Model5] Status: ${statusData.status} (${Math.round((Date.now()-startTime)/1000)}s)`);
    if (statusData.status === 'succeeded') {
      const url = Array.isArray(statusData.output) ? statusData.output[0] : statusData.output;
      if (!url) throw new Error('No video URL');
      return url;
    }
    if (statusData.status === 'failed' || statusData.status === 'canceled') {
      throw new Error(`Seedance2 failed: ${statusData.error || 'unknown'}`);
    }
  }
  throw new Error('Seedance2 timed out');
}

function slowDownClip(inputPath, outputPath, targetDuration) {
  let originalDur = 5;
  try {
    originalDur = parseFloat(execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`,
      { encoding: 'utf8' }
    ).trim()) || 5;
  } catch {}
  const pts = targetDuration / originalDur;
  try {
    execSync(
      `ffmpeg -i "${inputPath}" -vf "setpts=${pts.toFixed(4)}*PTS" ` +
      `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
      `-pix_fmt yuv420p -movflags +faststart -an -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    fs.copyFileSync(inputPath, outputPath);
  }
}

function addCaptions(videoPath, scenes, outputPath, ratio, videoLanguage = 'ar', secPerScene = 7) {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(String(videoLanguage || 'en').split('_')[0].toLowerCase()); // ✅ FIX: يدعم ar_eg/ar_gulf
  let FONT_PATH;
  if (process.platform === 'win32') {
    FONT_PATH = 'C\\:/Windows/Fonts/arial.ttf';
  } else {
    if (isRTL) {
      let found = null;
      try {
        const fc = execSync('fc-list :lang=ar | head -1', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim();
        if (fc) found = fc.split(':')[0].trim();
      } catch {}
      const fonts = [
        '/run/current-system/sw/share/X11/fonts/NotoNaskhArabic-Regular.ttf',
        '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
        '/usr/share/fonts/noto/NotoSansArabic-Regular.ttf',
      ];
      FONT_PATH = found || fonts.find(f => fs.existsSync(f)) || '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    } else {
      FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
    }
  }

  let totalVideoDuration = 0;
  try {
    const dur = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8' }
    ).trim();
    totalVideoDuration = parseFloat(dur) || 0;
  } catch {}
  const actualSecPerScene = totalVideoDuration > 0 ? totalVideoDuration / scenes.length : secPerScene;

  const sanitize = t => t.replace(/['"`:;\\<>{}|]/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const chunkWords = (text, n = 4) => {
    const w = sanitize(text).split(/\s+/).filter(Boolean);
    const out = [];
    for (let i = 0; i < w.length; i += n) out.push(w.slice(i, i + n).join(' '));
    return out.filter(Boolean);
  };

  const filters = [];
  let t = 0;
  const yExpr = ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-60';

  scenes.forEach(scene => {
    const start = t; t += actualSecPerScene;
    const ch = chunkWords(scene.text, 4);
    const chDur = actualSecPerScene / Math.max(ch.length, 1);
    ch.forEach((c, j) => {
      const cs = start + j * chDur, ce = cs + chDur;
      filters.push(
        `drawtext=fontfile='${FONT_PATH}':text='${c}':fontsize=28:fontcolor=white` +
        `:borderw=2:bordercolor=black:box=1:boxcolor=0x00000088:boxborderw=8` +
        `:x=(w-text_w)/2:y=${yExpr}:enable='between(t,${cs.toFixed(3)},${ce.toFixed(3)})'`
      );
    });
  });

  try {
    execSync(
      `ffmpeg -i "${videoPath}" -vf "${filters.join(',')}" ` +
      `-c:a copy -c:v libx264 -crf 23 -preset ultrafast ` +
      `-profile:v baseline -level 3.1 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    fs.copyFileSync(videoPath, outputPath);
  }
}

// ── Pipeline Model 4 ───────────────────────────────────────────────────────
export async function renderModel4Video({
  scenes,
  audioUrl,
  ratio = '16:9',
  jobId,
  music = false,
  captions = false,
  videoLanguage = 'ar',
  captionStyle = 'classic',
  onProgress = null,
  videoStyle = 'cinematic',
  styleSuffix = '',
  sceneDurations: realSceneDurations = null,
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['16:9'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);
  const total = scenes.length;

  console.log(`[Model4] START | ${total} scenes | ${ratio} | style: ${videoStyle}`);

  // ✅ FIX: مدة كل كليب بقت نسبية لطول كلام المشهد بدل ثابتة 7 ثواني للكل
  // أولاً نحسب مدة الصوت الكلي (لو موجود) عشان نوزع المدد عليه بدل تخمين
  let earlyAudioDur = null;
  if (audioUrl) {
    const c = path.join(OUTPUTS_DIR, path.basename(audioUrl));
    if (fs.existsSync(c) && fs.statSync(c).size > 1000) {
      try {
        earlyAudioDur = parseFloat(execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${c}"`,
          { encoding: 'utf8' }
        ).trim());
      } catch {}
    }
  }
  const targetTotalDuration = (earlyAudioDur || (total * 7)) + 1;
  const sceneDurations = (Array.isArray(realSceneDurations) && realSceneDurations.length === total)
    ? realSceneDurations
    : computeProportionalDurations(scenes, targetTotalDuration);
  console.log(`[Model4] Total target: ${targetTotalDuration.toFixed(1)}s | per-scene durations (${realSceneDurations ? 'REAL measured' : 'proportional estimate'}): ${sceneDurations.map(d => d.toFixed(1)).join(', ')}`);

  const rawPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const rawPath = path.join(TEMP_DIR, `m4_raw_${id}_${i}.mp4`);
    try {
      if (onProgress) onProgress({ step: 'generating', current: i + 1, total });
      console.log(`[Model4] Generating clip ${i + 1}/${total}`);
      // Build prompt: scene prompt + style suffix appended
      const basePrompt = scenes[i].prompt
        || (scenes[i].visual ? `${scenes[i].visual}, cinematic motion, professional video` : null)
        || scenes[i].text;
      const seedPrompt = styleSuffix
        ? `${basePrompt}, ${styleSuffix}`
        : basePrompt;
      const url = await generateSeedanceClip(seedPrompt, ratio);
      await downloadVideo(url, rawPath);
    } catch (e) {
      console.error(`[Model4] Clip ${i + 1} failed:`, e.message);
      execSync(
        `ffmpeg -f lavfi -i color=c=0x1a1a2e:size=${w}x${h}:rate=24 -t 5 ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-pix_fmt yuv420p -movflags +faststart -y "${rawPath}"`,
        { stdio: 'pipe' }
      );
    }
    rawPaths.push(rawPath);
  }

  const slowPaths = [];
  for (let i = 0; i < rawPaths.length; i++) {
    const slowPath = path.join(TEMP_DIR, `m4_slow_${id}_${i}.mp4`);
    if (onProgress) onProgress({ step: 'processing', current: i + 1, total });
    slowDownClip(rawPaths[i], slowPath, sceneDurations[i]);
    slowPaths.push(slowPath);
  }

  if (onProgress) onProgress({ step: 'merging', current: 1, total: 1 });
  const mergedPath = path.join(TEMP_DIR, `m4_merged_${id}.mp4`);
  const listFile = path.join(TEMP_DIR, `m4_list_${id}.txt`);
  fs.writeFileSync(listFile, slowPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
  execSync(
    `ffmpeg -f concat -safe 0 -i "${listFile}" ` +
    `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
    `-pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
    { stdio: 'pipe' }
  );

  let audioPath = null;
  if (audioUrl) {
    const c = path.join(OUTPUTS_DIR, path.basename(audioUrl));
    if (fs.existsSync(c) && fs.statSync(c).size > 1000) audioPath = c;
  }

  const withAudioPath = path.join(TEMP_DIR, `m4_audio_${id}.mp4`);

  if (audioPath) {
    // ✅ FIX: مبقناش محتاجين نمط/نكرر الفيديو كله عشان يطابق الصوت — المشاهد بقت متزامنة من الأساس
    // بس بنعمل هامش أمان صغير جدًا (±0.3s) لو فيه اختلاف بسيط بين مجموع مدد المشاهد ومدة الصوت الفعلية بعد المعالجة
    const videoExtended = mergedPath;

    const musicDir = path.join(process.cwd(), 'assets', 'music');
    const musicFiles = music && fs.existsSync(musicDir)
      ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
      : [];

    if (music && musicFiles.length > 0) {
      const mf = path.join(musicDir, musicFiles[Math.floor(Math.random() * musicFiles.length)]);
      try {
        execSync(
          `ffmpeg -i "${videoExtended}" -i "${audioPath}" -i "${mf}" ` +
          `-filter_complex "[2:a]volume=0.07[music];[1:a][music]amix=inputs=2:duration=longest[aout]" ` +
          `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart -y "${withAudioPath}"`,
          { stdio: 'pipe' }
        );
      } catch {
        execSync(
          `ffmpeg -i "${videoExtended}" -i "${audioPath}" -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart -y "${withAudioPath}"`,
          { stdio: 'pipe' }
        );
      }
    } else {
      execSync(
        `ffmpeg -i "${videoExtended}" -i "${audioPath}" -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart -y "${withAudioPath}"`,
        { stdio: 'pipe' }
      );
    }
    try { if (fs.existsSync(videoExtended)) fs.unlinkSync(videoExtended); } catch {}
  } else {
    fs.copyFileSync(mergedPath, withAudioPath);
  }

  const withCaptionsPath = path.join(TEMP_DIR, `m4_captions_${id}.mp4`);
  if (captions) {
    if (audioPath && process.env.GROQ_API_KEY) {
      console.log('[Model4] Using Groq Whisper for real captions');
      await addRealCaptionsForModel(withAudioPath, audioPath, withCaptionsPath, captionStyle, ratio, videoLanguage);
    } else {
      await addCaptionsWithTimingForModel(withAudioPath, scenes, withCaptionsPath, null, captionStyle, ratio, videoLanguage);
    }
  } else {
    fs.copyFileSync(withAudioPath, withCaptionsPath);
  }

  try {
    execSync(`ffmpeg -i "${withCaptionsPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' });
  } catch {
    fs.copyFileSync(withCaptionsPath, outputPath);
  }

  setTimeout(() => {
    [...rawPaths, ...slowPaths, mergedPath, withAudioPath, withCaptionsPath, listFile].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
  }, 60000);

  console.log(`[Model4] DONE → ${outputPath}`);
  return outputFile;
}

// ── Pipeline Model 5 (Cinematic) — Seedance 2.0 Fast, with audio ──────────
// Duration: 15s (3 clips), 30s (6 clips), 1min (12 clips) — each clip = 5s
export async function renderModel5Video({
  scenes,
  ratio = '9:16',
  jobId,
  duration = '30s',
  music = true,
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIOS[ratio] || RATIOS['9:16'];
  const id = jobId || Date.now();
  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);
  const total = scenes.length;
  const CLIP_SEC = { '5s': 5, '10s': 10, '15s': 15 }[duration] || 5;

  console.log(`[Model5] START | ${total} scenes | ${ratio} | ${duration} | Seedance 2.0`);

  // ✅ NEW: لو أكتر من شخصية واتفقنا على دمجهم بشجرة ثنائية (FLUX) في صورة واحدة موحدة —
  // ده بيتعمل مرة واحدة بس هنا (مش لكل مشهد لوحده) لأن نفس الصور بتتكرر في كل المشاهد،
  // فتوفير حقيقي في التكلفة والوقت. الصورة الموحدة الناتجة بعد كده بتتعامل بالظبط زي حالة
  // "صورة شخصية واحدة" (بتتركّب في كل مشهد لوحده عن طريق generateReferenceImage، وبعدين
  // بتتحرك بحقل "image" المفرد الصارم بدل "images" الجمع الحر).
  let mergedGroupPhotoUrl = null;
  const firstScenePhotos = Array.isArray(scenes[0]?.characterPhotos) ? scenes[0].characterPhotos.filter(Boolean) : [];
  if (firstScenePhotos.length > 1) {
    console.log(`[Model5] Merging ${firstScenePhotos.length} character photos into one group photo (one-time, reused for all scenes)...`);
    try {
      const uploadedUrls = await Promise.all(firstScenePhotos.map(p => uploadImageToReplicate(p)));
      mergedGroupPhotoUrl = await mergeCharacterPhotosTree(uploadedUrls);
      console.log(`[Model5] ✅ Group photo merge succeeded`);
    } catch (e) {
      console.error(`[Model5] ⚠️ Group photo merge failed, falling back to loose multi-image reference:`, e.message);
      // Fallback: لو الدمج فشل لأي سبب (مشكلة شبكة، حد استخدام)، منوقفش الفيديو بالكامل —
      // نرجع للطريقة القديمة (images الجمع) بدل ما نفشل تمامًا
    }
  }

  // Step 1: Generate clips بـ Seedance 2.0 مع الصوت الأصلي
  const rawPaths = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const rawPath = path.join(TEMP_DIR, `m5_raw_${id}_${i}.mp4`);
    try {
      console.log(`[Model5] Clip ${i + 1}/${total}: ${(scene.prompt || '').slice(0, 60)}...`);
      const basePrompt = scene.prompt
        || (scene.visual ? `${scene.visual}, cinematic motion, professional video` : null)
        || scene.text;
      // ✅ FIX: لو معانا مدد حقيقية مقاسة فعليًا من الصوت (لكل مشهد لوحده)، نستخدمها كأساس
      // ⚠️ Seedance موثّق رسميًا إنه ممكن "يقطع" لقطات مختلفة تلقائيًا في التوليدة الواحدة الطويلة —
      // ده كان بيخلي الفيديو يبعد عن الصورة المرجعية بعد أول لحظة. لازم نمنع ده صراحة في البرومبت
      const seed2Prompt = `${basePrompt}, single continuous unbroken shot, no cuts, no scene transitions, no camera cuts, clearly visible continuous motion throughout, dynamic camera movement, no static frames, no background music — layered ambient sound and specific sound effects appropriate to this exact scene only (e.g. footsteps, wind, cloth movement, distant crowd murmur, water, fire crackle — whatever genuinely fits what is shown), no music of any kind.`;

      // ── Reference image(s): character photos uploaded by the user for this video ──
      // scene.characterPhotos = array of ALL uploaded character photos (up to 5), same for every scene,
      // so that when more than one character was uploaded they appear TOGETHER, linked in one scene —
      // not one different character per scene like before.
      const rawPhotos = Array.isArray(scene.characterPhotos) ? scene.characterPhotos.filter(Boolean)
        : (scene.characterPhoto ? [scene.characterPhoto] : []);

      let refImageUrls = [];
      if (scene.directAnimate && rawPhotos.length === 1) {
        // ✅ NEW: وضع "Image to Video" — الصورة كلها (مش شخصية بس) لازم تتحرك زي ما هي بالظبط،
        // من غير أي تركيب/إعادة توليد عن طريق FLUX Kontext. نرفعها لـ Replicate كملف واخدين
        // رابطها المباشر، وبعدين generateSeedance2Clip بيستخدمها كـ "image" مفرد = قفل الفريم الأول.
        console.log(`[Model5] Direct image-to-video for clip ${i + 1} — skipping FLUX Kontext composition`);
        const directUrl = await uploadImageToReplicate(rawPhotos[0]);
        refImageUrls = [directUrl];
      } else if (scene.referenceImageUrl) {
        // Pre-generated single reference (legacy path from generate-scenes)
        refImageUrls = [scene.referenceImageUrl];
      } else if (mergedGroupPhotoUrl) {
        // ✅ NEW: عندنا صورة موحدة لكل الشخصيات مع بعض (اتعملت مرة واحدة قبل اللوب) —
        // نتعامل معاها بالظبط زي صورة شخصية واحدة: تتركّب في مكان المشهد ده عن طريق FLUX،
        // وبعدين تتحرك بحقل "image" المفرد الصارم — نفس المسار المضمون اللي شغال فعليًا.
        console.log(`[Model5] Compositing merged group photo into scene ${i + 1}...`);
        const refUrl = await generateReferenceImage(mergedGroupPhotoUrl, seed2Prompt, ratio);
        if (!refUrl) {
          throw new Error('Failed to process the merged group photo (reference image generation failed). Please try again.');
        }
        refImageUrls = [refUrl];
      } else if (rawPhotos.length === 1) {
        // ── Single character: compose them into the scene's location via FLUX Kontext first,
        // then that ONE composed image is animated as a true locked first frame ──
        console.log(`[Model5] Generating single-character reference image for clip ${i + 1}...`);
        const refUrl = await generateReferenceImage(rawPhotos[0], seed2Prompt, ratio);
        if (!refUrl) {
          throw new Error('Failed to process the uploaded character photo (reference image generation failed). Please try again or use a different photo.');
        }
        refImageUrls = [refUrl];
      } else if (rawPhotos.length > 1) {
        // ── Fallback ONLY if the one-time group-photo merge above failed for some reason:
        // upload raw photos and use Seedance's looser multimodal "images" reference mode ──
        console.log(`[Model5] (fallback) Uploading ${rawPhotos.length} character photos for clip ${i + 1}...`);
        refImageUrls = await Promise.all(rawPhotos.map(p => uploadImageToReplicate(p)));
      }

      const url = await generateSeedance2Clip(seed2Prompt, ratio, CLIP_SEC, refImageUrls);
      await downloadVideo(url, rawPath);
    } catch (e) {
      console.error(`[Model5] Clip ${i + 1} failed:`, e.message);
      execSync(
        `ffmpeg -f lavfi -i color=c=0x060208:size=${w}x${h}:rate=24 -t ${CLIP_SEC} ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-pix_fmt yuv420p -movflags +faststart -y "${rawPath}"`,
        { stdio: 'pipe' }
      );
    }
    rawPaths.push(rawPath);
  }

  // Step 2: Concat with crossfade transitions
  const mergedPath = path.join(TEMP_DIR, `m5_merged_${id}.mp4`);

  if (rawPaths.length === 1) {
    fs.copyFileSync(rawPaths[0], mergedPath);
  } else {
    // Build xfade (video) + acrossfade (audio) filter chain — FIX: preserve audio from Seedance
    // listFile declared here (outer scope) so setTimeout cleanup can reference it
    const listFile = path.join(TEMP_DIR, `m5_list_${id}.txt`);
    try {
      const FADE_DUR = 0.5;
      const CLIP_DURATION = CLIP_SEC - FADE_DUR;

      const inputs = rawPaths.map(f => `-i "${f}"`).join(' ');

      let filterComplex = '';
      if (rawPaths.length === 2) {
        filterComplex =
          `[0:v][1:v]xfade=transition=fade:duration=${FADE_DUR}:offset=${CLIP_DURATION.toFixed(2)}[vout];` +
          `[0:a][1:a]acrossfade=d=${FADE_DUR}[aout]`;
      } else {
        let lastVLabel = '[0:v]';
        let lastALabel = '[0:a]';
        for (let i = 1; i < rawPaths.length; i++) {
          const offset = (CLIP_DURATION * i).toFixed(2);
          const isLast = i === rawPaths.length - 1;
          const vNext = isLast ? '[vout]' : `[v${i}]`;
          const aNext = isLast ? '[aout]' : `[a${i}]`;
          filterComplex += `${lastVLabel}[${i}:v]xfade=transition=fade:duration=${FADE_DUR}:offset=${offset}${vNext};`;
          filterComplex += `${lastALabel}[${i}:a]acrossfade=d=${FADE_DUR}${aNext};`;
          lastVLabel = `[v${i}]`;
          lastALabel = `[a${i}]`;
        }
        filterComplex = filterComplex.replace(/;$/, '');
      }

      execSync(
        `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
        { stdio: 'pipe' }
      );
      console.log('[Model5] ✅ Crossfade transitions applied (video + audio)');
    } catch (e) {
      console.warn('[Model5] Transitions failed, using simple concat:', e.message.slice(0, 80));
      fs.writeFileSync(listFile, rawPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
      execSync(
        `ffmpeg -f concat -safe 0 -i "${listFile}" ` +
        `-c:v libx264 -crf 18 -preset fast -profile:v high -level 4.1 ` +
        `-c:a aac -b:a 192k -pix_fmt yuv420p -movflags +faststart -y "${mergedPath}"`,
        { stdio: 'pipe' }
      );
    }
  }

  // Step 3: Final output — دمج موسيقى خلفية ثابتة من assets/music مع صوت المؤثرات الأصلي
  // (Seedance بقى بيولّد مؤثرات صوتية بس من غير موسيقى، حسب تعليمات البرومبت، والموسيقى بتتضاف هنا)
  const musicDir = path.join(process.cwd(), 'assets', 'music');
  const musicFiles = fs.existsSync(musicDir)
    ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'))
    : [];

  if (music && musicFiles.length > 0) {
    const mf = path.join(musicDir, musicFiles[Math.floor(Math.random() * musicFiles.length)]);
    try {
      execSync(
        `ffmpeg -i "${mergedPath}" -stream_loop -1 -i "${mf}" ` +
        `-filter_complex "[1:a]volume=0.15[music];[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${outputPath}"`,
        { stdio: 'pipe' }
      );
      console.log('[Model5] ✅ Background music mixed in');
    } catch (e) {
      console.warn('[Model5] Music mixing failed, using original audio:', e.message.slice(0, 80));
      try { execSync(`ffmpeg -i "${mergedPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' }); }
      catch { fs.copyFileSync(mergedPath, outputPath); }
    }
  } else {
    try {
      execSync(`ffmpeg -i "${mergedPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' });
    } catch {
      fs.copyFileSync(mergedPath, outputPath);
    }
  }

  setTimeout(() => {
    [...rawPaths, mergedPath, listFile].forEach(f => {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    });
  }, 60000);

  console.log(`[Model5] DONE → ${outputPath}`);
  return outputFile;
}