// ── audioVideoRenderService.js ───────────────────────────────────────────────
// مصنع فيديو الصوت (أدمن) — المرحلة الأخيرة: بناء الفيديو النهائي.
//
// الفكرة: صورة واحدة "جريد" فيها كل عناصر الفيديو مرتبة بجانب بعض على خلفية بيضاء. أول
// الفيديو بيعرض الجريد كامل ثابت (Intro). بعدين لكل عنصر بالترتيب، زوم-إن (zoompan) من نفس
// صورة الجريد على الخانة بتاعت العنصر ده لحد ما تملأ الشاشة، بالظبط طول المدة اللي الصوت
// بيتكلم فيها عن العنصر ده (ممتدة لحد أول العنصر اللي بعده عشان مفيش فريز/فجوة). فوقيها
// كابشنز كل كلمة تظهر في توقيتها الحقيقي (ASS subtitles، مش drawtext متعدد — أخف وأدق)،
// والكلمات اللي هي اسم العنصر الحالي بلون مختلف (ذهبي). في الآخر بيتضم الصوت الأصلي.

import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { uploadFinalVideoToR2 } from './audioVideoService.js';

const FPS = 25;
const RATIO_DIMS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };

// ✅ نفس منطق اختيار الفونت المستخدم فعليًا في renderService.js (fc-list ديناميكي حسب
// اللغة) — بننسخه هنا محليًا بدل ما نصدّره من renderService.js، عشان ملف الكابشن الأساسي
// بتاع باقي الموقع يفضل زي ما هو من غير أي تغيير في exports بتاعته
function normalizeLangBase(lang) {
  return String(lang || 'en').split('_')[0].toLowerCase();
}
function getFontPath(lang) {
  const dejaVu = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const base = normalizeLangBase(lang);
  const langCode = { ar: 'ar', ja: 'ja', zh: 'zh', ko: 'ko', ru: 'ru' }[base];
  if (!langCode) return dejaVu;
  try {
    const result = execSync(`fc-list :lang=${langCode} | grep -v '\\[' | head -1`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim().split(':')[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch { /* fallback below */ }
  return dejaVu;
}

// ✅ بيبني صورة "جريد" واحدة فيها كل صور العناصر مرتبة على خلفية بيضاء نقية، وبيرجّع
// إحداثيات خانة كل عنصر جوه الصورة دي (مستخدمة بعدين في الزوم)
async function buildGridImage(elements, ratio, outPath) {
  const [W, H] = RATIO_DIMS[ratio] || RATIO_DIMS['16:9'];
  const n = elements.length;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.floor(W / cols);
  const cellH = Math.floor(H / rows);
  const pad = Math.round(Math.min(cellW, cellH) * 0.08);

  const composites = [];
  const cellRects = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = col * cellW, y0 = row * cellH;
    cellRects.push({ x0, y0, w: cellW, h: cellH });

    const imgRes = await fetch(elements[i].imageUrl);
    if (!imgRes.ok) throw new Error(`Could not download element image: ${elements[i].element}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    const resized = await sharp(imgBuf)
      .resize(cellW - pad * 2, cellH - pad * 2, { fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
    composites.push({ input: resized, left: x0 + pad, top: y0 + pad });
  }

  await sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite(composites)
    .jpeg({ quality: 92 })
    .toFile(outPath);

  return { cellRects, W, H };
}

// ✅ الكليب الثابت (Intro) — نفس صورة الجريد من غير حركة، مدتها = الوقت قبل ما العنصر
// الأول يتذكر فعليًا في الصوت (زمن حقيقي، مش رقم ثابت مفروض)
function buildStaticClip(gridPath, W, H, durationSec, outPath) {
  execSync(
    `ffmpeg -y -loop 1 -framerate ${FPS} -i "${gridPath}" -vf "scale=${W}:${H},format=yuv420p" -t ${durationSec.toFixed(3)} -c:v libx264 -pix_fmt yuv420p "${outPath}"`,
    { stdio: 'pipe' }
  );
}

// ✅ زوم-إن على خانة عنصر معيّن جوه صورة الجريد، من الشكل الكامل (z=1) لحد ما يملأ
// الشاشة. بنستخدم "-framerate FPS -loop 1" + "d=1" (بدل الحيلة القديمة d=frameCount) —
// النمط ده أدق وأقل قابلية لمشاكل الـ jitter في zoompan لما المصدر صورة واحدة ثابتة
function buildZoomClip(gridPath, cellRect, W, H, durationSec, outPath) {
  const totalFrames = Math.max(2, Math.round(durationSec * FPS));
  const cx = cellRect.x0 + cellRect.w / 2;
  const cy = cellRect.y0 + cellRect.h / 2;
  const zTarget = Math.max(W / cellRect.w, H / cellRect.h);
  const zDelta = (zTarget - 1).toFixed(6);
  const zExpr = `1+${zDelta}*on/${totalFrames - 1}`;
  const xExpr = `min(max(${cx.toFixed(1)}-(iw/(${zExpr}))/2,0),iw-(iw/(${zExpr})))`;
  const yExpr = `min(max(${cy.toFixed(1)}-(ih/(${zExpr}))/2,0),ih-(ih/(${zExpr})))`;
  const vf = `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${W}x${H}:fps=${FPS}`;
  execSync(
    `ffmpeg -y -loop 1 -framerate ${FPS} -i "${gridPath}" -vf "${vf}" -t ${durationSec.toFixed(3)} -c:v libx264 -pix_fmt yuv420p "${outPath}"`,
    { stdio: 'pipe' }
  );
}

function toAssTime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.round((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

// ✅ كابشنز على مستوى الكلمة الواحدة — سطر ASS منفصل لكل كلمة بتوقيتها الحقيقي من
// Whisper (مش drawtext متعدد اللي بيبقى تقيل ومعقد التوقيت). الكلمة اللي جوه مدى عنصر
// حالي (startIdx..endIdx) بلون ذهبي مميز، والباقي أبيض عادي. + اسم العنصر ثابت فوق طول
// مدة عرضه (segStart..segEnd)
function buildCaptionsAssFile(words, segments, videoLanguage, ratio, fontName, W, H) {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(normalizeLangBase(videoLanguage));
  const marginV = (ratio === '9:16' || ratio === '1:1') ? 160 : 90;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,${fontName},58,&H00FFFFFF,&H000000FF,&H00000000,&H88000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,${marginV},1
Style: Keyword,${fontName},62,&H0000D7FF,&H000000FF,&H00000000,&H88000000,-1,0,0,0,100,100,0,0,1,3,1,2,10,10,${marginV},1
Style: Label,${fontName},48,&H00111111,&H000000FF,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,0,0,1,0,0,8,20,20,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordText = String(w.word || '').replace(/['"`\\{}|<>]/g, '').trim();
    if (!wordText) continue;
    const isKeyword = segments.some(seg => i >= seg.startIdx && i <= seg.endIdx);
    const styleName = isKeyword ? 'Keyword' : 'Word';
    const text = isRTL ? `‏${wordText}` : wordText;
    events.push(`Dialogue: 0,${toAssTime(w.start)},${toAssTime(w.end)},${styleName},,0,0,0,,${text}`);
  }
  for (const seg of segments) {
    const labelText = String(seg.element || '').replace(/['"`\\{}|<>]/g, '').trim();
    if (!labelText) continue;
    const text = isRTL ? `‏${labelText}` : labelText;
    events.push(`Dialogue: 0,${toAssTime(seg.segStart)},${toAssTime(seg.segEnd)},Label,,0,0,0,,${text}`);
  }

  return header + events.join('\n');
}

// ✅ الأوركسترا الكاملة — من الـ job (فيه words_json + elements_json جاهزين) لحد رابط
// الفيديو النهائي على R2
export async function renderAudioVideoJob(job) {
  const ratio = RATIO_DIMS[job.ratio] ? job.ratio : '16:9';
  const [W, H] = RATIO_DIMS[ratio];
  const elements = job.elements_json;
  const words = job.words_json;
  if (!elements || !elements.length) throw new Error('No elements to render');
  if (!words || !words.length) throw new Error('No transcript words to render');

  const workDir = path.join('temp', `audiovideo_render_${job.id}_${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    const gridPath = path.join(workDir, 'grid.jpg');
    const { cellRects } = await buildGridImage(elements, ratio, gridPath);

    const audioDurationSec = words[words.length - 1].end + 0.3;
    const introDuration = Math.max(0, elements[0].start);
    const segments = elements.map((el, i) => {
      const segStart = el.start;
      const segEnd = i < elements.length - 1 ? elements[i + 1].start : audioDurationSec;
      return { ...el, cellRect: cellRects[i], segStart, segEnd, segDuration: Math.max(0.5, segEnd - segStart) };
    });

    const clipPaths = [];
    if (introDuration >= 0.3) {
      const introPath = path.join(workDir, 'clip_intro.mp4');
      buildStaticClip(gridPath, W, H, introDuration, introPath);
      clipPaths.push(introPath);
    }
    segments.forEach((seg, i) => {
      const clipPath = path.join(workDir, `clip_${i}.mp4`);
      buildZoomClip(gridPath, seg.cellRect, W, H, seg.segDuration, clipPath);
      clipPaths.push(clipPath);
    });

    const listPath = path.join(workDir, 'concat_list.txt');
    fs.writeFileSync(listPath, clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n'));
    const silentPath = path.join(workDir, 'silent.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${silentPath}"`, { stdio: 'pipe' });

    // ✅ مفيش عمود لغة مخزّن للـ job — بنستنتج عربي/غير عربي من وجود حروف عربي فعلية في
    // النص المفرّغ، وده كل اللي محتاجينه فعليًا لاختيار الفونت واتجاه RTL
    const videoLanguage = /[؀-ۿ]/.test(job.transcript_text || '') ? 'ar' : 'en';
    const fontfile = getFontPath(videoLanguage);
    const fontName = fontfile.includes('Naskh') ? 'Noto Naskh Arabic' :
                      fontfile.includes('Noto') ? 'Noto Sans Arabic' :
                      fontfile.includes('DejaVu') ? 'DejaVu Sans' : 'Arial';
    const assContent = buildCaptionsAssFile(words, segments, videoLanguage, ratio, fontName, W, H);
    const assPath = path.join(workDir, 'captions.ass');
    fs.writeFileSync(assPath, assContent, 'utf8');
    const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const captionedPath = path.join(workDir, 'captioned.mp4');
    execSync(
      `ffmpeg -y -i "${silentPath}" -vf "subtitles='${safeAss}':fontsdir='${path.dirname(fontfile)}'" -c:v libx264 -pix_fmt yuv420p "${captionedPath}"`,
      { stdio: 'pipe' }
    );

    const audioExt = (job.audio_url.split('.').pop() || 'mp3').split('?')[0];
    const audioLocalPath = path.join(workDir, `audio_src.${audioExt}`);
    const audioRes = await fetch(job.audio_url);
    if (!audioRes.ok) throw new Error('Could not download source audio for final mux');
    fs.writeFileSync(audioLocalPath, Buffer.from(await audioRes.arrayBuffer()));

    fs.mkdirSync('outputs', { recursive: true });
    const finalPath = path.join('outputs', `audiovideo_${job.id}_${Date.now()}.mp4`);
    execSync(
      `ffmpeg -y -i "${captionedPath}" -i "${audioLocalPath}" -map 0:v -map 1:a -c:v copy -c:a aac -shortest "${finalPath}"`,
      { stdio: 'pipe' }
    );

    const videoBuffer = fs.readFileSync(finalPath);
    const videoUrl = await uploadFinalVideoToR2(videoBuffer);
    try { fs.unlinkSync(finalPath); } catch { /* best-effort cleanup */ }
    return videoUrl;
  } finally {
    setTimeout(() => { try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ } }, 5 * 60 * 1000);
  }
}
