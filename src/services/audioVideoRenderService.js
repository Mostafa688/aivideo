// ── audioVideoRenderService.js ───────────────────────────────────────────────
// مصنع فيديو الصوت (أدمن) — المرحلة الأخيرة: بناء الفيديو النهائي.
//
// v3 — بعد ملاحظات حقيقية على v2 (شكل مرجعي اتبعت لينا: فيديوهات "قصص وعبر" العربية
// المشهورة، ملصقات 2D كثيفة جدًا، مفيش شخصية شارح، النص كبير متحرك مش كابشن رفيع):
// - اتشالت شخصية الـ Stickman خالص.
// - كل "لقطة" (beat) دلوقتي كل 3-4 كلمات تقريبًا (مش موضوع كبير) — ملصق واحد كبير في
//   النص، بيظهر ويختفي بحركة fade+zoom خفيفة (مش زوم-قص جريد زي قبل كده).
// - الشخصيات المسمّاة (kind:'character') بتستخدم نفس صورة الملصق في كل ظهور — الاتساق ده
//   بيتضمن من مرحلة الاستخراج/توليد الصور في audioVideoService.js، هنا بس بنستخدم الرابط.
// - النص دلوقتي مرحلة واحدة لكل لقطة (مش كل كلمة لوحدها)، كبير وبخط واضح، بيظهر ويختفي
//   بانيميشن (ASS \fad) بدل كابشن ثابت.

import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { uploadFinalVideoToR2 } from './audioVideoService.js';

const FPS = 25;
const RATIO_DIMS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const BG_COLOR = '#fdfaf4'; // خلفية موحدة دافية (مش أبيض بارد) — نفسها في كل مشهد طول الفيديو
const BG_HEX = '0xfdfaf4'; // نفس اللون بصيغة hex لفلتر fade بتاع ffmpeg

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

// ✅ سلايد واحدة للقطة: خلفية موحدة + ملصق اللقطة كبير في النص — بسيطة عمدًا، الحركة كلها
// بتتضاف بعد كده في buildAnimatedClip (فصل الرسم عن الحركة أسهل صيانة وأدق توقيتًا)
async function buildElementSlide(iconBuffer, W, H, outPath) {
  const iconSize = Math.round(Math.min(W, H) * 0.62);
  const icon = await sharp(iconBuffer).resize(iconSize, iconSize, { fit: 'contain' }).png().toBuffer();
  const left = Math.round(W / 2 - iconSize / 2);
  const top = Math.round(H * 0.42 - iconSize / 2);
  await sharp({ create: { width: W, height: H, channels: 3, background: BG_COLOR } })
    .composite([{ input: icon, left, top }])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

// ✅ حركة كل لقطة: زوم بسيط جدًا طول المدة (شوية حياة/حركة) + fade-in/fade-out عند بداية
// ونهاية اللقطة — بما إن لون الـ fade هو نفس لون الخلفية بالظبط، اللي بيظهر ويختفي فعليًا
// هو الملصق بس (مش الفريم كله يسود) وده بيدّي إحساس "دخول/خروج" نضيف من غير تراكب ألفا معقّد
function buildAnimatedClip(slidePath, W, H, durationSec, outPath) {
  const fadeSec = Math.min(0.3, Math.max(0.08, durationSec * 0.25));
  const totalFrames = Math.max(2, Math.round(durationSec * FPS));
  const zoomTo = 1.05;
  const zExpr = `1+${(zoomTo - 1).toFixed(4)}*on/${totalFrames - 1}`;
  const xExpr = `(iw-(iw/(${zExpr})))/2`;
  const yExpr = `(ih-(ih/(${zExpr})))/2`;
  const outStart = Math.max(0, durationSec - fadeSec);
  const vf = `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${W}x${H}:fps=${FPS},` +
    `fade=t=in:st=0:d=${fadeSec.toFixed(3)}:color=${BG_HEX},` +
    `fade=t=out:st=${outStart.toFixed(3)}:d=${fadeSec.toFixed(3)}:color=${BG_HEX}`;
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

// ✅ نص متحرك لكل لقطة — سطر ASS واحد لكل لقطة (مش لكل كلمة) بنفس توقيتها بالظبط، وبتاعه
// \fad(in,out) بيدّي ظهور/اختفاء متدرّج بدل ظهور مفاجئ. كبير وبخط واضح غامق (Outline تقيل،
// من غير صندوق كابشن رفيع خلفه) — إحساس "نص فيديو شرح" احترافي مش كابشن آلي
function buildCaptionsAssFile(segments, videoLanguage, ratio, fontName, W, H) {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(normalizeLangBase(videoLanguage));
  const isVertical = ratio === '9:16' || ratio === '1:1';
  const fontSize = isVertical ? 88 : 74;
  const marginV = isVertical ? 170 : 100;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Text,${fontName},${fontSize},&H00181818,&H000000FF,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,2,30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = segments.map(seg => {
    const text = String(seg.text || seg.element || '').replace(/['"`\\{}|<>]/g, '').trim();
    if (!text) return null;
    const dispText = isRTL ? `‏${text}` : text;
    const durMs = Math.max(1, (seg.segEnd - seg.segStart) * 1000);
    const fadeMs = Math.round(Math.min(280, durMs * 0.25));
    return `Dialogue: 0,${toAssTime(seg.segStart)},${toAssTime(seg.segEnd)},Text,,0,0,0,,{\\fad(${fadeMs},${fadeMs})}${dispText}`;
  }).filter(Boolean);

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
    const audioDurationSec = words[words.length - 1].end + 0.3;
    // ✅ اللقطة الأولى بتبدأ من t=0 مباشرة (مفيش "مقدمة" منفصلة دلوقتي بعد ما اتشالت
    // شخصية الشارح) — أي صمت قبل أول كلمة بيتغطى بملصق أول لقطة نفسه
    const segments = elements.map((el, i) => {
      const segStart = i === 0 ? 0 : el.start;
      const segEnd = i < elements.length - 1 ? elements[i + 1].start : audioDurationSec;
      return { ...el, segStart, segEnd, segDuration: Math.max(0.4, segEnd - segStart) };
    });

    const clipPaths = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const iconRes = await fetch(seg.imageUrl);
      if (!iconRes.ok) throw new Error(`Could not download element image: ${seg.element}`);
      const iconBuffer = Buffer.from(await iconRes.arrayBuffer());
      const slidePath = path.join(workDir, `slide_${i}.jpg`);
      await buildElementSlide(iconBuffer, W, H, slidePath);
      const clipPath = path.join(workDir, `clip_${i}.mp4`);
      buildAnimatedClip(slidePath, W, H, seg.segDuration, clipPath);
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
    const assContent = buildCaptionsAssFile(segments, videoLanguage, ratio, fontName, W, H);
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
