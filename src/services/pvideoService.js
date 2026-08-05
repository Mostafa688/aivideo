// ── pvideoService.js ─────────────────────────────────────────────────────────
// ✅ NEW: موديل 8 — نفس فكرة موديل 4 (كليب فيديو لكل مشهد + تركيب ffmpeg) بس بموديل
// prunaai/p-video بدل Seedance: أرخص بكتير (20 كريديت/5 ثواني بدل 60)، مرونة كاملة في
// مدة كل مشهد (5 أو 10 ثواني)، ومدة الفيديو الكلية (لحد 10 دقايق)، وبيدعم صوت أصلي
// متولّد مع الفيديو نفسه (مش تعليق صوتي منفصل) للوضع "السينمائي".

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { addRealCaptionsForModel } from './renderService.js';
import { generateAdsVoiceover } from './adsVideoService.js'; // ✅ FIX: كان بيستخدم generateVoiceover (Edge TTS) — المفروض google/gemini-3.1-flash-tts زي موديل الإعلانات بالظبط
import { generateReferenceImage } from './seedanceService.js'; // ✅ NEW: نفس FLUX Kontext المستخدم في موديل 5 بالظبط — لرفرنس الشخصية

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = 'temp';

// ✅ اتأكد من الـ schema من تاب الـ API نفسه على Replicate — الحقول دي بالظبط
async function generatePVideoClipOnce({ prompt, duration = 5, imageUrl = null, generateAudio = true, aspectRatio = '16:9', resolution = '720p' }) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const headers = { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' };

  const input = {
    prompt,
    duration: Math.min(20, Math.max(1, Math.round(duration))),
    resolution,
    fps: 24,
    draft: true, // ✅ NEW: أرخص 4 أضعاف ($0.005 بدل $0.02 لكل ثانية على 720p) — نفس السعر اللي بنحصّله من العميل، هامش ربح أعلى
    save_audio: !!generateAudio, // ✅ ده اللي بيتحكم في الصوت الأصلي المتولّد مع الفيديو (وضع "سينمائي")
    prompt_upsampling: true,
    disable_safety_filter: false,
  };
  if (imageUrl) {
    input.image = imageUrl; // image-to-video — لما موجودة، aspect_ratio بيتجاهل ويتبع الصورة
  } else {
    input.aspect_ratio = aspectRatio;
  }

  const submitRes = await fetch('https://api.replicate.com/v1/models/prunaai/p-video/predictions', {
    method: 'POST', headers, body: JSON.stringify({ input }),
  });
  if (!submitRes.ok) throw new Error(`P-Video error ${submitRes.status}: ${(await submitRes.text()).slice(0, 300)}`);
  let prediction = await submitRes.json();
  if (prediction.status === 'succeeded' && prediction.output) {
    return Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  }
  const predictionId = prediction.id;
  if (!predictionId) throw new Error(`No prediction ID from P-Video: ${JSON.stringify(prediction).slice(0, 200)}`);
  const maxWait = 180_000, pollInterval = 4_000, startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));
    const statusRes = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, { headers });
    if (!statusRes.ok) continue;
    const data = await statusRes.json();
    if (data.status === 'succeeded') {
      const url = Array.isArray(data.output) ? data.output[0] : data.output;
      if (!url) throw new Error('No video URL from P-Video');
      return url;
    }
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`P-Video failed: ${data.error || 'unknown'}`);
  }
  throw new Error('P-Video timed out');
}

// ✅ NEW: نفس منطق إعادة المحاولة المستخدم في تعديل الفيديو — ريبليكيت بيرجع أحيانًا خطأ
// مؤقت من عندهم (E004 "Service is temporarily unavailable") مش له علاقة بالبرومبت، وبيعدي
// لو حاولنا تاني. مهم جدًا هنا تحديدًا لأن فيديو طويل ممكن يحتاج عشرات المشاهد المتتالية —
// لو مشهد واحد فشل بسبب مؤقت من غير إعادة محاولة، الفيديو كله هيفشل من غير داعي
const TRANSIENT_ERROR_PATTERNS = /temporarily unavailable|E004|E005|service unavailable|internal server error|ECONNRESET|ETIMEDOUT/i;
async function generatePVideoClip(params) {
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await generatePVideoClipOnce(params);
    } catch (e) {
      lastErr = e;
      const isTransient = TRANSIENT_ERROR_PATTERNS.test(e.message);
      console.warn(`[Model8] Clip attempt ${attempt}/${MAX_ATTEMPTS} failed (${isTransient ? 'transient, retrying' : 'non-transient'}): ${e.message}`);
      if (!isTransient || attempt === MAX_ATTEMPTS) throw e;
      await new Promise(r => setTimeout(r, 8000 * attempt)); // 8s, 16s
    }
  }
  throw lastErr;
}

async function downloadVideo(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}

// ══════════════════════════════════════════════════════════════════════════
//  ✅ الرندر الرئيسي — نفس البنية الموثوقة اللي موديل 4/5 بتستخدمها بالظبط: (1) توليد
//  كل مشهد لوحده (مع دعم إعادة استخدام مشاهد جاهزة لتعديل مستقبلي)، (2) تركيب بانتقالات
//  xfade حقيقية بمدد متغيرة لكل مشهد، (3) الصوت حسب المستوى المطلوب (بدون/فويس أوفر/سينمائي).
// ══════════════════════════════════════════════════════════════════════════
export async function renderModel8Video({
  scenes, // [{ index, prompt, text, imageUrl?, sceneDurationSec, existingClipUrl? }]
  ratio = '16:9',
  audioMode = 'none', // 'none' | 'voiceover' | 'cinematic'
  voiceKey = 'male_wise',
  videoLanguage = 'en',
  captions = false,
  characterPhoto = null, // ✅ NEW: صورة شخصية (base64 أو رابط) — بتتحول لمرجع FLUX لكل مشهد قبل التحريك
  jobId,
}) {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });
  const id = jobId || Date.now();
  const [W, H] = ratio === '9:16' ? [1080, 1920] : ratio === '1:1' ? [1080, 1080] : [1920, 1080];
  const aspectRatioForApi = ratio === '9:16' ? '9:16' : ratio === '1:1' ? '1:1' : '16:9';

  // ── Step 1: توليد كل مشهد ────────────────────────────────────────────────
  const rawPaths = [];
  const sceneClipUrls = [];
  const sceneDurations = [];
  const sceneCacheDir = path.join(OUTPUTS_DIR, 'scene_cache');
  fs.mkdirSync(sceneCacheDir, { recursive: true });
  const wantsCinematicAudio = audioMode === 'cinematic';

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const rawPath = path.join(TEMP_DIR, `m8_raw_${id}_${i}.mp4`);
    const targetSec = Math.min(20, Math.max(3, Math.round(scene.sceneDurationSec || 5)));
    try {
      if (scene.existingClipUrl) {
        console.log(`[Model8] Reusing existing clip ${i + 1}/${scenes.length}`);
        const srcPath = scene.existingClipUrl.startsWith('http') ? null : path.join(process.cwd(), scene.existingClipUrl.replace(/^\//, ''));
        if (srcPath && fs.existsSync(srcPath)) fs.copyFileSync(srcPath, rawPath);
        else await downloadVideo(scene.existingClipUrl, rawPath);
      } else {
        console.log(`[Model8] Generating clip ${i + 1}/${scenes.length} (${targetSec}s)`);
        // ✅ NEW: لو معانا صورة شخصية، نولّد صورة مرجعية للمشهد ده بالتحديد (نفس الوجه، وضعية
        // جديدة تناسب المشهد) بـ FLUX Kontext قبل ما نحرّكها — بالظبط زي موديل 5
        let sceneImageUrl = scene.imageUrl || null;
        if (!sceneImageUrl && characterPhoto) {
          try {
            sceneImageUrl = await generateReferenceImage(characterPhoto, scene.prompt || scene.text, aspectRatioForApi);
          } catch (e) {
            console.warn(`[Model8] Reference image generation failed for scene ${i + 1}, animating without it:`, e.message);
          }
        }
        const url = await generatePVideoClip({
          prompt: scene.prompt || scene.text,
          duration: targetSec,
          imageUrl: sceneImageUrl,
          generateAudio: wantsCinematicAudio,
          aspectRatio: aspectRatioForApi,
        });
        await downloadVideo(url, rawPath);
      }
    } catch (e) {
      console.error(`[Model8] Clip ${i + 1} failed:`, e.message);
      execSync(`ffmpeg -f lavfi -i color=c=0x1a1a2e:size=${W}x${H}:rate=24 -t ${targetSec} -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -movflags +faststart -y "${rawPath}"`, { stdio: 'pipe' });
    }
    rawPaths.push(rawPath);
    sceneDurations.push(targetSec);
    const cachePath = path.join(sceneCacheDir, `${id}_${i}.mp4`);
    try { fs.copyFileSync(rawPath, cachePath); sceneClipUrls.push('/outputs/scene_cache/' + `${id}_${i}.mp4`); }
    catch { sceneClipUrls.push(null); }
  }

  // ── Step 2: تطبيع كل كليب (نفس الأبعاد، مدته الحقيقية، fps موحّد) ──────────
  const normPaths = [];
  for (let i = 0; i < rawPaths.length; i++) {
    const np = path.join(TEMP_DIR, `m8_norm_${id}_${i}.mp4`);
    execSync(
      `ffmpeg -i "${rawPaths[i]}" -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=24" ` +
      `-t ${sceneDurations[i]} -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p ` +
      `${wantsCinematicAudio ? '-c:a aac -b:a 192k -ar 48000 -ac 2' : '-an'} -movflags +faststart -y "${np}"`,
      { stdio: 'pipe', maxBuffer: 200 * 1024 * 1024 }
    );
    normPaths.push(np);
  }

  // ── Step 3: دمج بانتقالات xfade — أوفست تراكمي حقيقي بمدد متغيرة ──────────
  const mergedPath = path.join(TEMP_DIR, `m8_merged_${id}.mp4`);
  const FADE_DUR = 0.5;
  const numClips = normPaths.length;
  if (numClips === 1) {
    fs.copyFileSync(normPaths[0], mergedPath);
  } else {
    try {
      const inputArgs = normPaths.flatMap(p => ['-i', p]);
      let filterComplex = '';
      const hasAudioTrack = wantsCinematicAudio;
      let lastV = '[0:v]', lastA = hasAudioTrack ? '[0:a]' : null;
      let acc = sceneDurations[0] - FADE_DUR;
      for (let i = 1; i < numClips; i++) {
        const isLast = i === numClips - 1;
        const vNext = isLast ? '[vout]' : `[v${i}]`;
        filterComplex += `${lastV}[${i}:v]xfade=transition=fade:duration=${FADE_DUR}:offset=${acc.toFixed(2)}${vNext};`;
        if (hasAudioTrack) {
          const aNext = isLast ? '[aout]' : `[a${i}]`;
          filterComplex += `${lastA}[${i}:a]acrossfade=d=${FADE_DUR}${aNext};`;
          lastA = `[a${i}]`;
        }
        lastV = `[v${i}]`;
        acc += sceneDurations[i] - FADE_DUR;
      }
      filterComplex = filterComplex.replace(/;$/, '');
      const mapArgs = hasAudioTrack ? ['-map', '[vout]', '-map', '[aout]'] : ['-map', '[vout]'];
      execSync(
        `ffmpeg ${inputArgs.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')} -filter_complex "${filterComplex}" ${mapArgs.join(' ')} ` +
        `-c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p ${hasAudioTrack ? '-c:a aac -b:a 192k' : ''} -movflags +faststart -y "${mergedPath}"`,
        { stdio: 'pipe', maxBuffer: 200 * 1024 * 1024 }
      );
    } catch (e) {
      console.warn('[Model8] Transitions failed, using simple concat fallback:', (e.stderr?.toString() || e.message).slice(-400));
      const listFile = path.join(TEMP_DIR, `m8_list_${id}.txt`);
      // ✅ FIX: ffmpeg's concat demuxer resolves relative paths inside the list file relative
      // to the list file's OWN directory (not process cwd). Since listFile already lives inside
      // TEMP_DIR and normPaths were also TEMP_DIR-prefixed, ffmpeg was doubling it into
      // "temp/temp/m8_norm_..._0.mp4" and failing with "Impossible to open". Using absolute
      // paths here makes resolution unambiguous regardless of where the list file sits.
      fs.writeFileSync(listFile, normPaths.map(f => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
      execSync(`ffmpeg -f concat -safe 0 -i "${listFile}" -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p ${wantsCinematicAudio ? '-c:a aac -b:a 192k' : '-an'} -movflags +faststart -y "${mergedPath}"`, { stdio: 'pipe' });
      try { fs.unlinkSync(listFile); } catch {}
    }
  }

  // ── Step 4: فويس أوفر (Gemini TTS) لو مطلوب، مقاس على مدة الفيديو الحقيقية ──
  let currentPath = mergedPath;
  let audioPathForCaptions = null;
  if (audioMode === 'voiceover') {
    try {
      const fullText = scenes.map(s => s.text).filter(Boolean).join(' ');
      if (fullText.trim()) {
        const totalDur = sceneDurations.reduce((a, b) => a + b, 0) - (numClips - 1) * FADE_DUR;
        // ✅ FIX: google/gemini-3.1-flash-tts بالظبط (نفس اللي موديل الإعلانات بيستخدمه) — مش
        // Edge TTS العام. الدالة دي بترجع مسار كامل جاهز، مش اسم ملف يتحتاج ينضم لمسار تاني
        const audioPath = await generateAdsVoiceover(fullText, voiceKey || 'male_wise', videoLanguage, totalDur, null);
        if (audioPath) {
          audioPathForCaptions = audioPath;
          const withAudioPath = path.join(TEMP_DIR, `m8_voice_${id}.mp4`);
          execSync(`ffmpeg -i "${currentPath}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart -y "${withAudioPath}"`, { stdio: 'pipe' });
          currentPath = withAudioPath;
        }
      }
    } catch (e) { console.warn('[Model8] Voiceover step failed:', e.message); }
  }

  // ── Step 5: كابشن اختياري (محتاج صوت حقيقي يتفرغ منه) ──────────────────────
  if (captions && audioPathForCaptions) {
    try {
      const withCaptionsPath = path.join(TEMP_DIR, `m8_captions_${id}.mp4`);
      await addRealCaptionsForModel(currentPath, audioPathForCaptions, withCaptionsPath, 'classic', ratio, videoLanguage);
      currentPath = withCaptionsPath;
    } catch (e) { console.warn('[Model8] Captions step failed:', e.message); }
  }

  const outputFile = 'video_' + id + '.mp4';
  const outputPath = path.join(OUTPUTS_DIR, outputFile);
  try { execSync(`ffmpeg -i "${currentPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' }); }
  catch { fs.copyFileSync(currentPath, outputPath); }

  setTimeout(() => {
    [...rawPaths, ...normPaths, mergedPath].forEach(f => { try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {} });
  }, 60000);

  console.log(`[Model8] DONE → ${outputPath}`);
  return { outputFile, sceneClipUrls, sceneDurations };
}