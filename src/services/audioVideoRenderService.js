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
//
// v4 — ملاحظات حقيقية على v3 (فيديو حقيقي اتعمل وظهرت فيه مشاكل واضحة):
// - الخلفية بقت أبيض صريح بدل الكريمي الدافئ (طلب صريح من العميل).
// - كل ملصق/مشهد دلوقتي بيدخل بحركة "pop" (يبدأ صغير، يكبر لحد ما يزيد شوية عن حجمه
//   الطبيعي، ويرجع يستقر) بدل الزوم البطيء اللي كان قبل كده — تقريبًا زي bounce خفيف.
// - النص بقى في نص الشاشة فعليًا (Alignment=5) مش لاصق تحت زي كابشن، وبقى ليه نفس حركة
//   الـ pop (يكبر شوية لحد ما يستقر) بدل fade بس.
// - الملصق نفسه اتحرك لأعلى الفريم شوية عشان يسيب مساحة للنص في النص من غير تراكب كبير.
//
// v5 — تصحيح تصميمي حقيقي من العميل بعد تجربة v4: كل لقطة كانت بتاخد ملصق + نص مع بعض
// دايمًا، ومش كل جملة محتاجة ملصق أصلًا — العميل طلب صراحةً إن كل لقطة تبقى يا ملصق يا نص،
// مش الاتنين مع بعض، وإن اللي مالوش تصور بصري واضح يتكتب كنص بس:
// - kind الجديدة "text" (بجانب "character"/"object"/"quote" الموجودين) — بتتقرر لكل لقطة في
//   audioVideoService.js نفسه (مش هنا)، مش كل لقطة لازم ملصق.
// - buildCaptionsAssFile بقى بيتجاهل لقطات character/object خالص (ملصق بس، مفيش نص فوقه).
// - الملصق رجع لنص الشاشة بالظبط (مش 30% ارتفاع زي v4) وكبر حجمه — مفيش نص تاني بيشاركه
//   نفس اللقطة يستاهل نسيب مساحة له.
//
// v6 — تصحيح تاني من العميل: المشهد (لقطات character/object) بقى يملا الفريم كامل (16:9)
// بدل ما يبقى ملصق صغير على خلفية بيضاء — يعني مفيش داعي لخلفية بيضاء ولا إزالة خلفية خالص،
// الصورة نفسها هي الفريم. حركة الـ pop اتعممت من "مربع صغير في النص" لـ"مستطيل الفريم كامل"
// (baseW×baseH بدل baseSize مربع واحد) — نفس معادلة النوسان المخمّد، بس على أبعاد الفريم
// كله. لقطات text/quote لسه بخلفية بيضاء عادية (مفيش مشهد أصلًا يملاها).

import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { uploadFinalVideoToR2 } from './audioVideoService.js';

const FPS = 25;
const RATIO_DIMS = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080] };
const BG_COLOR = '#ffffff'; // ✅ FIX: خلفية بيضاء صريحة (كان كريمي دافئ) — طلب صريح من العميل
const BG_HEX = '0xffffff'; // نفس اللون بصيغة hex لفلتر fade بتاع ffmpeg

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

// ✅ FIX (طلب العميل): المشهد بقى بيملا الفريم كامل بدل ما يبقى ملصق صغير على خلفية بيضاء —
// بنعمل resize بـ fit:'cover' لمقاس الفيديو بالظبط (W×H)، بيقص الزيادة بدل ما يسيب حواف
// فاضية، ومفيش داعي لشفافية (opaque بالكامل، الصورة نفسها هي الفريم كله)
async function prepareSceneImage(iconBuffer, W, H, outPath) {
  await sharp(iconBuffer)
    .resize(W, H, { fit: 'cover' })
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

// ✅ FIX: حركة "pop" حقيقية بدل الزوم البطيء اللي كان قبل كده. ملحوظة مهمة: zoompan (اللي
// كان مستخدم قبل كده) بيعمل "زوم على الفريم كله" (يقص جزء من الصورة ويكبّره) ومش مصمم أصلًا
// إنه "يصغّر" (zoom<1 مش سلوك مدعوم فيه) — فمينفعش نستخدمه لعمل تأثير "يبدأ صغير ويكبر".
// بدل كده، المشهد دلوقتي طبقة صورة منفصلة (input تاني) بيتكبّر فعليًا بـ scale filter بحجم
// بيتغيّر كل فريم (eval=frame)، وبيتحط فوق خلفية ثابتة اللون بـ overlay في نص الفريم بالظبط
// (أفقيًا ورأسيًا). معادلة نوسان مخمّد (damped oscillation) على أبعاد الفريم كله (baseW×baseH
// — 16:9 كامل، مش مربع صغير زي قبل كده):
// size(t) = base · (1 - 0.4·e^(-16·t)·cos(20·t)) — تبدأ 60% من الحجم عند t=0، تكبر بسرعة
// وتعدّي 100% شوية (overshoot/bounce)، وتستقر عند الحجم الطبيعي (يملا الفريم بالكامل) خلال
// أقل من نص ثانية. fade-in/out (بلون الخلفية نفسه) فضل موجود فوقها عشان دخول/خروج ناعم.
// ✅ FIX (طلب العميل): آيات/أحاديث/أي إشارة لله أو نبي (kind:'quote')، وكمان لقطات text
// المجردة، مالهاش مشهد خالص — iconPngPath بيبقى null، فبنبني كليب خلفية بيضاء بس (بدون طبقة
// مشهد/overlay) مع نفس الـ fade-in/out — النص نفسه بيتحط عليه بعدين زي أي لقطة تانية
// (buildCaptionsAssFile)
function buildAnimatedClip(iconPngPath, W, H, baseW, baseH, durationSec, outPath) {
  const fadeSec = Math.min(0.25, Math.max(0.06, durationSec * 0.2));
  const outStart = Math.max(0, durationSec - fadeSec);

  if (!iconPngPath) {
    const vf = `fade=t=in:st=0:d=${fadeSec.toFixed(3)}:color=${BG_HEX},` +
      `fade=t=out:st=${outStart.toFixed(3)}:d=${fadeSec.toFixed(3)}:color=${BG_HEX}`;
    execSync(
      `ffmpeg -y -f lavfi -i "color=c=${BG_HEX}:s=${W}x${H}:d=${durationSec.toFixed(3)}:r=${FPS}" ` +
      `-vf "${vf}" -t ${durationSec.toFixed(3)} -c:v libx264 -pix_fmt yuv420p "${outPath}"`,
      { stdio: 'pipe' }
    );
    return;
  }

  const popExprW = `${baseW}*(1-0.4*exp(-16*t)*cos(20*t))`;
  const popExprH = `${baseH}*(1-0.4*exp(-16*t)*cos(20*t))`;
  const filterComplex =
    `[1:v]scale=w='${popExprW}':h='${popExprH}':eval=frame[icon];` +
    `[0:v][icon]overlay=x='(main_w-overlay_w)/2':y='(main_h-overlay_h)/2'[ov];` +
    `[ov]fade=t=in:st=0:d=${fadeSec.toFixed(3)}:color=${BG_HEX},` +
    `fade=t=out:st=${outStart.toFixed(3)}:d=${fadeSec.toFixed(3)}:color=${BG_HEX}[outv]`;
  execSync(
    `ffmpeg -y -f lavfi -i "color=c=${BG_HEX}:s=${W}x${H}:d=${durationSec.toFixed(3)}:r=${FPS}" ` +
    `-loop 1 -framerate ${FPS} -i "${iconPngPath}" ` +
    `-filter_complex "${filterComplex}" -map "[outv]" -t ${durationSec.toFixed(3)} -c:v libx264 -pix_fmt yuv420p "${outPath}"`,
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

// ✅ نص متحرك لكل لقطة — سطر ASS واحد لكل لقطة (مش لكل كلمة) بنفس توقيتها بالظبط. كبير
// وبخط واضح غامق (Outline تقيل، من غير صندوق كابشن رفيع خلفه) — إحساس "نص فيديو شرح"
// احترافي مش كابشن آلي.
// ✅ FIX (شكوى حقيقية: "مش عايز كابشن، عايز نص في النص بانيميشن pop"):
// - Alignment اتغيّر من 2 (تحت-في-النص، زي أي كابشن) لـ5 (نص الشاشة فعليًا) — عند
//   Alignment 4/5/6 اللي هو الصف الأوسط، ASS بيتجاهل MarginV تلقائيًا ويحط النص في نص
//   الفريم بالظبط بغض النظر عن قيمته.
// - كل سطر بقى معاه \fscx/\fscy + \t transform بتعمل نفس حركة الـ pop بتاعة الملصق
//   (يبدأ أصغر من حجمه الطبيعي، يكبر ويعدّي 100% شوية، ويستقر) بدل \fad وبس.
function buildCaptionsAssFile(segments, videoLanguage, ratio, fontName, W, H) {
  const isRTL = ['ar', 'he', 'fa', 'ur'].includes(normalizeLangBase(videoLanguage));
  const isVertical = ratio === '9:16' || ratio === '1:1';
  // ✅ FIX (شكوى حقيقية: النص طالع صغير في الفيديو الحقيقي): رفعنا الحجم بشكل واضح — ده المفروض
  // "نص فيديو" كبير بارز، مش تفصيلة صغيرة تحت الملصق
  const fontSize = isVertical ? 120 : 108;
  const marginV = isVertical ? 170 : 100;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Text,${fontName},${fontSize},&H00181818,&H000000FF,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,5,30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // ✅ FIX (طلب العميل): كل لقطة يا ملصق يا نص، مش الاتنين مع بعض — لقطات الملصق
  // (kind:'character'/'object') مالهاش سطر نص خالص هنا، النص بس للقطات text/quote
  const events = segments.filter(seg => seg.kind === 'text' || seg.kind === 'quote').map(seg => {
    const text = String(seg.text || seg.element || '').replace(/['"`\\{}|<>]/g, '').trim();
    if (!text) return null;
    const dispText = isRTL ? `‏${text}` : text;
    const durMs = Math.max(1, (seg.segEnd - seg.segStart) * 1000);
    const fadeMs = Math.round(Math.min(280, durMs * 0.25));
    const popMidMs = Math.min(150, Math.round(durMs * 0.5));
    const popEndMs = Math.max(popMidMs + 20, Math.min(280, Math.round(durMs * 0.85)));
    return `Dialogue: 0,${toAssTime(seg.segStart)},${toAssTime(seg.segEnd)},Text,,0,0,0,,{\\fad(${fadeMs},${fadeMs})\\fscx55\\fscy55\\t(0,${popMidMs},\\fscx115\\fscy115)\\t(${popMidMs},${popEndMs},\\fscx100\\fscy100)}${dispText}`;
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
      const clipPath = path.join(workDir, `clip_${i}.mp4`);
      // ✅ FIX: لقطات "quote"/"text" (آيات/أحاديث/إشارة لله أو نبي/جمل مجردة) مالهاش
      // imageUrl خالص — نص بس على الشاشة، من غير أي تحميل/توليد مشهد
      if (!seg.imageUrl) {
        buildAnimatedClip(null, W, H, W, H, seg.segDuration, clipPath);
        clipPaths.push(clipPath);
        continue;
      }
      const iconRes = await fetch(seg.imageUrl);
      if (!iconRes.ok) throw new Error(`Could not download element image: ${seg.element}`);
      const iconBuffer = Buffer.from(await iconRes.arrayBuffer());
      const iconPngPath = path.join(workDir, `icon_${i}.jpg`);
      // ✅ FIX (طلب العميل): المشهد بقى بيملا الفريم كامل (W×H) بدل ملصق صغير مربع
      await prepareSceneImage(iconBuffer, W, H, iconPngPath);
      buildAnimatedClip(iconPngPath, W, H, W, H, seg.segDuration, clipPath);
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
