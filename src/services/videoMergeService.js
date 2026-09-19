// ── videoMergeService.js ──────────────────────────────────────────────────────
// طلب العميل: "لو حد قاله جمع الفيديوهات اللي عملناها في فيديو واحد يجمعهم بـ ffmpeg عادي" —
// دمج أي مجموعة فيديوهات اتعملت على المنصة (أيًا كان الموديل اللي عملها) في فيديو واحد. الفيديوهات
// غالبًا مختلفة في الدقة/النسبة (موديل قديم 9:16 مع موديل فيديو جديد 16:9 مثلاً)، فمينفعش نستخدم
// concat demuxer العادي (بيحتاج نفس الكودك/الدقة بالظبط) — بنستخدم concat *filter* بدل كده، اللي
// بيسمح بعمل scale/pad لكل فيديو لنفس القياس المستهدف قبل الدمج، وبيتعامل مع فيديوهات من غير صوت
// خالص (بعض مخرجات Replicate مفيهاش مسار صوت) بإضافة صوت صامت بنفس المدة بدل ما ffmpeg يفشل.
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function uploadBufferToR2(buffer, key, contentType) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to download ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
}

function hasAudioStream(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

// ✅ FIX (باج حقيقي في الإنتاج: مشاهد اتعملت 9:16 (طولي)، والفيديو المدموج النهائي طلع 16:9
// (عرضي)): ffprobe's "width"/"height" fields بترجع أبعاد الفريم المشفّرة الخام، مش الأبعاد
// "المعروضة" الحقيقية — لو الفيديو فيه علامة دوران (rotation metadata، 90 أو 270 درجة، شائعة
// في فيديوهات معالجة/مولّدة بالذكاء الاصطناعي)، الفيديو ممكن يتشفّر أفقيًا (landscape) فعليًا
// بس يتعرض طولي (portrait) بفضل علامة الدوران دي — وأي مشغّل فيديو عادي بيحترمها فبيبين صح،
// لكن ffprobe (وبالتبعية getResolution القديمة هنا) كانت بتتجاهلها تمامًا وترجّع الأبعاد
// الخام المعكوسة. النتيجة: فيديو المرجع (أول فيديو في القائمة) اتقاس غلط كـ"عرضي" رغم إنه
// طولي فعليًا، فكل الفيديوهات في الدمج اتحطت غصب في قالب عرضي. دلوقتي بنقرا علامة الدوران
// (القديمة "rotate" tag، أو الحديثة "side_data_list[].rotation") ونبدّل العرض/الارتفاع لو
// الدوران 90 أو 270 درجة، عشان الأبعاد الحقيقية المعروضة تبقى هي المستخدمة فعلاً
function getResolution(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height:stream_tags=rotate:stream_side_data=rotation -of json "${filePath}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    const stream = JSON.parse(out)?.streams?.[0];
    if (!stream) return null;
    let w = parseInt(stream.width, 10);
    let h = parseInt(stream.height, 10);
    if (!(w > 0 && h > 0)) return null;
    const rotateTag = parseInt(stream.tags?.rotate || '0', 10) || 0;
    const sideDataRotation = stream.side_data_list?.find(s => typeof s.rotation === 'number')?.rotation || 0;
    const rotation = ((rotateTag || sideDataRotation) % 360 + 360) % 360;
    if (rotation === 90 || rotation === 270) { [w, h] = [h, w]; }
    return { w, h };
  } catch {
    return null;
  }
}

function getDuration(filePath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    return parseFloat(out) || 0;
  } catch {
    return 0;
  }
}

/**
 * Merges multiple already-generated video URLs (any model, any resolution/ratio)
 * into one file, in the given order, returning its permanent R2 URL.
 */
export async function mergeVideos(videoUrls) {
  if (!Array.isArray(videoUrls) || videoUrls.length < 2) throw new Error('at least 2 videoUrls are required');
  const jobId = `merge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const workDir = path.join(TEMP_DIR, jobId);
  await mkdir(workDir, { recursive: true });

  try {
    const localFiles = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const f = path.join(workDir, `in_${i}.mp4`);
      await downloadToFile(videoUrls[i], f);
      localFiles.push(f);
    }

    // الحجم المستهدف = حجم أول فيديو (أو 1080x1920 كافتراضي لو مقدرناش نقرأ أبعاده)
    const targetRes = getResolution(localFiles[0]) || { w: 1080, h: 1920 };
    const { w: W, h: H } = targetRes;

    // ✅ كل الفيديوهات الحقيقية بترقيم -i من 0..N-1 الأول، وبعدين أي صوت صامت اصطناعي
    // (anullsrc) للفيديوهات الناقصة صوت بيتضاف بعد كده بترتيب ثابت — عشان ترقيم المدخلات
    // الحقيقي في ffmpeg يتوقع بالظبط
    // ✅ FIX (باج حقيقي في الإنتاج — الدمج بيفشل، ffmpeg بيتقتل بـ"Killed" بعد "buffers queued
    // in out_#0:1, something may be wrong" متصاعدة لحد 100000): "anullsrc" (مصدر الصمت
    // الاصطناعي للفيديوهات اللي مالهاش صوت — شائع جدًا في فيديوهات Replicate المولّدة بالذكاء
    // الاصطناعي) هو مصدر lavfi **لا نهائي بطبيعته** لو من غير "-t" صريح — بيولّد صمت للأبد.
    // فيلتر concat بيحتاج كل مقطع (فيديو+صوت) يخلص عند نفس النقطة، فلو الفيديو انتهى (مدة
    // حقيقية محدودة) بينما الصوت الصامت المقابل له لسه بيطلّع frames للأبد، الـmuxer بيفضل
    // يستنى/يكدّس صوت مالوش نهاية طبيعية، والبفر بتاع مسار الصوت في المخرج بيكبر من غير حد لحد
    // ما الـprocess يتقتل. الحل: كل "anullsrc" بيتقيّد بمدة الفيديو الحقيقي المقابل له بالظبط
    // (بـffprobe)، مش لانهائي خالص
    const audioNeeds = localFiles.map(f => !hasAudioStream(f));
    const inputArgs = [];
    localFiles.forEach(f => { inputArgs.push('-i', f); });
    let silentCounter = localFiles.length;
    const silentIndexByVideo = {};
    audioNeeds.forEach((needsSilent, i) => {
      if (needsSilent) {
        const silentDurationSec = getDuration(localFiles[i]) || 30; // احتياطي محدود لو فشل القياس، مش لانهائي أبدًا
        inputArgs.push('-f', 'lavfi', '-t', silentDurationSec.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        silentIndexByVideo[i] = silentCounter;
        silentCounter++;
      }
    });

    const filterParts = [];
    const concatRefs = [];
    localFiles.forEach((f, i) => {
      filterParts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`);
      concatRefs.push(`[v${i}]`);
      concatRefs.push(audioNeeds[i] ? `[${silentIndexByVideo[i]}:a]` : `[${i}:a]`);
    });

    const filterComplex = `${filterParts.join(';')};${concatRefs.join('')}concat=n=${localFiles.length}:v=1:a=1[outv][outa]`;
    const outputFile = path.join(workDir, 'merged.mp4');
    const cmd = `ffmpeg ${inputArgs.map(a => (a.startsWith('-') ? a : `"${a}"`)).join(' ')} -filter_complex "${filterComplex}" -map "[outv]" -map "[outa]" -c:v libx264 -crf 20 -preset veryfast -pix_fmt yuv420p -movflags +faststart -y "${outputFile}"`;
    execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 * 50 });

    const buffer = fs.readFileSync(outputFile);
    const key = `generated-videos/merged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`;
    const url = await uploadBufferToR2(buffer, key, 'video/mp4');
    return url;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
