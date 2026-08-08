// ── audioVideoRenderService.js ───────────────────────────────────────────────
// مصنع فيديو الصوت (أدمن) — المرحلة الأخيرة: بناء الفيديو النهائي.
//
// الفكرة (v2 — بعد ملاحظات حقيقية على v1): بدل "جريد صور + زوم-قص جزء منه" (كان طالع
// انيميشن مقطّع وغير متسق)، كل مشهد دلوقتي "سلايد" واحدة مركّبة بالكامل مسبقًا (sharp):
// نفس الخلفية الموحدة + نفس شخصية الشارح الثابتة (Stickman، نفس الرسمة بالظبط في كل مشهد)
// + أيقونة العنصر الحالي (بخلفية شفافة حقيقية بعد إزالة الخلفية) — وبعدين حركة واحدة موحدة
// (Ken Burns: زوم بطيء متمركز) على كل سلايد بنفس المعادلة بالظبط، طول مدتها = مدة كلام
// الصوت عن العنصر ده فعليًا. كابشنز كل كلمة في توقيتها الحقيقي، بس دلوقتي أكبر وألوان أوضح
// (مش شكل سترة كابشن رفيعة).

import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { uploadFinalVideoToR2, generateStickmanCharacterPng } from './audioVideoService.js';

const FPS = 25;
const RATIO_DIMS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const BG_COLOR = '#fdfaf4'; // خلفية موحدة دافية (مش أبيض بارد) — نفسها في كل مشهد طول الفيديو

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

// ✅ سلايد واحدة لعنصر: خلفية موحدة + أيقونة العنصر (شفافة) في النص + الشخصية الثابتة تحت
// يمين، بنفس التخطيط بالظبط في كل مرة — ده اللي بيدّي إحساس "انيميشن واحد متسق" طول الفيديو
async function buildElementSlide(iconBuffer, stickmanBuffer, W, H, outPath) {
  const iconSize = Math.round(Math.min(W, H) * 0.5);
  const icon = await sharp(iconBuffer).resize(iconSize, iconSize, { fit: 'contain' }).png().toBuffer();
  const stickSize = Math.round(Math.min(W, H) * 0.22);
  const stick = await sharp(stickmanBuffer).resize(stickSize, stickSize, { fit: 'contain' }).png().toBuffer();

  const iconLeft = Math.round(W / 2 - iconSize / 2);
  const iconTop = Math.round(H * 0.5 - iconSize / 2 - H * 0.06);
  const stickLeft = Math.round(W * 0.5 + iconSize * 0.18);
  const stickTop = Math.round(iconTop + iconSize - stickSize * 0.35);

  await sharp({ create: { width: W, height: H, channels: 3, background: BG_COLOR } })
    .composite([
      { input: icon, left: iconLeft, top: iconTop },
      { input: stick, left: Math.min(stickLeft, W - stickSize - 20), top: Math.min(stickTop, H - stickSize - 20) },
    ])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

// ✅ سلايد المقدمة — نفس الخلفية والشخصية بس من غير أيقونة عنصر (لسه محدش اتذكر)، لنفس
// إحساس "استمرارية" الشخصية من أول لحظة في الفيديو
async function buildIntroSlide(stickmanBuffer, W, H, outPath) {
  const stickSize = Math.round(Math.min(W, H) * 0.32);
  const stick = await sharp(stickmanBuffer).resize(stickSize, stickSize, { fit: 'contain' }).png().toBuffer();
  await sharp({ create: { width: W, height: H, channels: 3, background: BG_COLOR } })
    .composite([{ input: stick, left: Math.round(W / 2 - stickSize / 2), top: Math.round(H / 2 - stickSize / 2) }])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

// ✅ حركة واحدة موحدة لكل السلايدز (Ken Burns: زوم بطيء متمركز في نص الفريم) — نفس
// المعادلة بالظبط لكل مشهد، ده اللي بيحل مشكلة "الانيميشن متخلف/مقطّع" الأصلية (كانت بسبب
// القص الحاد لخانة من جريد مزدحم، مش زوم نضيف على سلايد واحدة بسيطة زي دلوقتي)
function buildKenBurnsClip(slidePath, W, H, durationSec, outPath, zoomTo = 1.07) {
  const totalFrames = Math.max(2, Math.round(durationSec * FPS));
  const zExpr = `1+${(zoomTo - 1).toFixed(4)}*on/${totalFrames - 1}`;
  const xExpr = `(iw-(iw/(${zExpr})))/2`;
  const yExpr = `(ih-(ih/(${zExpr})))/2`;
  const vf = `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${W}x${H}:fps=${FPS}`;
  execSync(
    `ffmpeg -y -loop 1 -framerate ${FPS} -i "${slidePath}" -vf "${vf}" -t ${durationSec.toFixed(3)} -c:v libx264 -pix_fmt yuv420p "${outPath}"`,
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

// ✅ كابشنز على مستوى الكلمة الواحدة — سطر ASS منفصل لكل كلمة بتوقيتها الحقيقي من Whisper.
// كبيرة وبألوان واضحة عمدًا (Outline تقيل، من غير صندوق شفاف خلفها) — إحساس "نص فيديو
// شرح" مش شكل ترجمة/كابشن رفيعة. الكلمة اللي جوه مدى عنصر حالي بلون ذهبي مميز والباقي أبيض
function buildCaptionsAssFile(words, segments, videoLanguage, ratio, fontName, W, H) {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(normalizeLangBase(videoLanguage));
  const isVertical = ratio === '9:16' || ratio === '1:1';
  const wordSize = isVertical ? 100 : 86;
  const keywordSize = isVertical ? 112 : 96;
  const labelSize = isVertical ? 70 : 60;
  const marginV = isVertical ? 220 : 140;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,${fontName},${wordSize},&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,0,2,20,20,${marginV},1
Style: Keyword,${fontName},${keywordSize},&H0000D7FF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,7,0,2,20,20,${marginV},1
Style: Label,${fontName},${labelSize},&H0000D7FF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,8,20,20,40,1

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

// ✅ الأوركسترا الكاملة — من الـ job (فيه words_json + elements_json جاهزين، والعناصر
// الحساسة دينيًا اتشالت خالص من المرحلة اللي قبل كده) لحد رابط الفيديو النهائي على R2
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
    const stickmanBuffer = await generateStickmanCharacterPng(600);

    const audioDurationSec = words[words.length - 1].end + 0.3;
    const introDuration = Math.max(0, elements[0].start);
    const segments = elements.map((el, i) => {
      const segStart = el.start;
      const segEnd = i < elements.length - 1 ? elements[i + 1].start : audioDurationSec;
      return { ...el, segStart, segEnd, segDuration: Math.max(0.5, segEnd - segStart) };
    });

    const clipPaths = [];

    if (introDuration >= 0.3) {
      const introSlidePath = path.join(workDir, 'slide_intro.jpg');
      await buildIntroSlide(stickmanBuffer, W, H, introSlidePath);
      const introClipPath = path.join(workDir, 'clip_intro.mp4');
      buildKenBurnsClip(introSlidePath, W, H, introDuration, introClipPath, 1.04);
      clipPaths.push(introClipPath);
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const iconRes = await fetch(seg.imageUrl);
      if (!iconRes.ok) throw new Error(`Could not download element image: ${seg.element}`);
      const iconBuffer = Buffer.from(await iconRes.arrayBuffer());
      const slidePath = path.join(workDir, `slide_${i}.jpg`);
      await buildElementSlide(iconBuffer, stickmanBuffer, W, H, slidePath);
      const clipPath = path.join(workDir, `clip_${i}.mp4`);
      buildKenBurnsClip(slidePath, W, H, seg.segDuration, clipPath);
      clipPaths.push(clipPath);
    }

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
