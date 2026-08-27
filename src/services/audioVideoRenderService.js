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
//
// v7 — تصحيح تصميمي تاني من العميل: الصور المولّدة بالذكاء الاصطناعي كانت "وحشة جدًا" —
// بدل التوليد، بقينا بندور على ملصق حقيقي من مكتبة أيقونات/إيموجي مجانية (Iconify) في
// audioVideoService.js. ده معناه رجعنا لملصق صغير مربّع (شفاف الخلفية) في نص الفريم على
// خلفية بيضاء، مش صورة تملا الفريم كامل — أيقونة حقيقية مالهاش "خلفية" لتملاها أصلاً.
// buildAnimatedClip فضلت زي ما هي بالظبط (عامة، بتاخد baseW/baseH بغض النظر عن الحجم)، بس
// السايز رجع مربّع صغير بدل W×H الفريم كامل، وprepareSceneImage اتبدلت بـprepareIconImage
// (contain-fit شفاف بدل cover-fit معتم).
//
// v8 — فيتشر جديد بطلب العميل: "مشاهد مركّبة" (Composite Scenes) — لفترة زمنية بتغطي عدة
// لقطات (زي مثال العميل: 11 مرحلة البرزخ)، الأدمن بيرفع صورة دايجرام واحدة ويحدد يدويًا نقاط
// زوم/pan (كل نقطة = مربع قص من الصورة + الوقت اللي المفروض توصل عنده) بدل التقسيم لملصقات
// منفصلة. buildCompositeSceneClip بيبني كليب واحد للفترة كلها بـ zoompan (نفس فلتر الـ pop
// بتاع buildAnimatedClip، بس هنا z/x/y بتتحرك بين نقاط الأدمن بـinterpolation خطي عبر
// buildPiecewiseExpr بدل نوسان مخمّد ثابت) — بيبدأ وينتهي دايمًا بعرض الصورة كاملة (bookend
// keyframes تلقائية). renderAudioVideoJob بيشيل أي لقطة عادية (ملصق/نص) بتتقاطع زمنيًا مع
// مشهد مركّب (المشهد المركّب بيغطي الفترة دي بالكامل بدالها)، وبيرتّب كل الكليبات (عادية +
// مركّبة) كرونولوجيًا بالـ startTime بتاعها قبل الـ concat.

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
// ✅ FIX (بلاغ العميل: مربعات tofu غريبة بدل بعض حروف عربي زي "لأ"/"لإ"): كان بياخد أول
// خط يرجعه "fc-list :lang=ar" من غير أي ترتيب أولوية — أي خط عشوائي على السيرفر ممكن يدّعي
// دعم لغة عربي في الـ metadata بتاعه من غير ما يغطي كل أشكال الحروف المركّبة (ligatures) زي
// لام+ألف-بهمزة، فيطلع مربع فاضي بدل الحرف. باقي الملفات في المشروع (renderService.js،
// mapVideoService.js، stabilityService.js) بتحل نفس المشكلة دي بتفضيل "Noto Naskh Arabic"
// صراحة الأول (خط شامل ومُختبر) — بنطبّق نفس المنطق هنا بدل الاعتماد على ترتيب fc-list العشوائي
const ARABIC_FONT_PRIORITY = [
  '/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf',
  '/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf',
  '/usr/share/fonts/opentype/noto/NotoNaskhArabic-Regular.otf',
  '/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.otf',
  '/usr/share/fonts/truetype/arabic/NotoNaskhArabic-Regular.ttf',
];
// ✅ FIX إضافي: لو مسارات ARABIC_FONT_PRIORITY المكتوبة يدويًا مش موجودة بالظبط على
// السيرفر الفعلي (توزيعة/نسخة مختلفة)، بندوّر بالاسم في قاعدة بيانات fontconfig نفسها
// (بتلاقي الخط أيًا كان مساره الحقيقي) قبل ما نرجع لأسلوب "أول نتيجة" العشوائي القديم
function findFontByFamilyName(pattern) {
  try {
    const result = execSync(`fc-list | grep -i "${pattern}" | grep -v '\\[' | head -1`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim().split(':')[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch { /* ignore, fallback below */ }
  return null;
}
function getFontPath(lang) {
  const dejaVu = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const base = normalizeLangBase(lang);
  if (base === 'ar') {
    const preferred = ARABIC_FONT_PRIORITY.find(f => fs.existsSync(f))
      || findFontByFamilyName('NotoNaskhArabic')
      || findFontByFamilyName('Noto Naskh Arabic')
      || findFontByFamilyName('NotoSansArabic')
      || findFontByFamilyName('Noto Sans Arabic');
    if (preferred) return preferred;
  }
  const langCode = { ar: 'ar', ja: 'ja', zh: 'zh', ko: 'ko', ru: 'ru' }[base];
  if (!langCode) return dejaVu;
  try {
    const result = execSync(`fc-list :lang=${langCode} | grep -v '\\[' | head -1`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      .trim().split(':')[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch { /* fallback below */ }
  return dejaVu;
}

// ✅ FIX (طلب العميل): رجعنا لملصق صغير شفاف الخلفية (contain-fit) بدل ما يملا الفريم كامل —
// دلوقتي الملصقات جايه من مكتبة Iconify (SVG حقيقي)، فلازم نرندرها بكثافة (density) عالية
// الأول عشان تطلع حادة/واضحة مش مبكسلة لما تتكبّر، وبعدين contain-fit على مربع شفاف
async function prepareIconImage(iconBuffer, size, outPath) {
  await sharp(iconBuffer, { density: 900 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

// ✅ NEW (طلب العميل — ملصقات مخصّصة بالجملة): الملصقات المرفوعة بالجملة أبعادها الأصلية
// بتتحفظ (imageWidth/imageHeight)، وعايزين نعرضها بنسبتها الأصلية بدل ما نفرض مربع تابت
// زي أيقونات Iconify العادية. لو الصورة قريبة من نسبة الفيديو نفسه (16:9 على فيديو 16:9
// مثلًا)، بتملا الفريم بالكامل زي ما طلب العميل بالظبط؛ غير كده (3:2، 1:1...)، بتتحط بأكبر
// حجم ممكن يحافظ على نسبتها الأصلية من غير أي تمدد/تكبير غير متناسب
function computeStickerDisplaySize(imgW, imgH, W, H) {
  const imgAspect = imgW / imgH;
  const frameAspect = W / H;
  if (Math.abs(imgAspect - frameAspect) / frameAspect < 0.05) {
    return { baseW: W, baseH: H };
  }
  const maxDim = Math.min(W, H) * 0.85;
  return imgAspect >= 1
    ? { baseW: maxDim, baseH: maxDim / imgAspect }
    : { baseW: maxDim * imgAspect, baseH: maxDim };
}
async function prepareCustomStickerImage(buffer, targetW, targetH, outPath) {
  await sharp(buffer, { density: 900 })
    .resize(Math.round(targetW), Math.round(targetH), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
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

// ✅ NEW (طلب العميل — "مشاهد مركّبة"): بيبني تعبير ffmpeg واحد بيعمل interpolation خطي
// (piecewise linear) بين قيمة كل keyframe والتالي له بمرور الوقت — نفس الأسلوب مستخدم 4 مرات
// (مركز-x، مركز-y، عرض، ارتفاع مربع القص) عشان نعمل زوم/pan ناعم بين نقاط الأدمن اليدوية.
// t قبل أول keyframe = قيمته ثابتة، وt بعد آخر keyframe = قيمته ثابتة (مفيش extrapolation)
function buildPiecewiseExpr(keyframes, valueFn, timeVar) {
  const n = keyframes.length;
  if (n === 1) return String(valueFn(keyframes[0]));
  let result = String(valueFn(keyframes[n - 1]));
  for (let i = n - 2; i >= 0; i--) {
    const v0 = valueFn(keyframes[i]), v1 = valueFn(keyframes[i + 1]);
    const t0 = keyframes[i].relTime, t1 = keyframes[i + 1].relTime;
    const dt = Math.max(0.001, t1 - t0);
    const interp = `(${v0}+(${v1}-${v0})*(${timeVar}-${t0})/${dt})`;
    result = `if(lt(${timeVar},${t1}),${interp},${result})`;
  }
  return `if(lt(${timeVar},${keyframes[0].relTime}),${valueFn(keyframes[0])},${result})`;
}

// ✅ NEW: كليب "مشهد مركّب" واحد يغطي الفترة الزمنية كلها (scene.startTime → scene.endTime)
// — صورة دايجرام ثابتة واحدة، بيتعمل عليها زوم/pan (zoompan) بين نقاط الأدمن اليدوية.
// بيبدأ وبينتهي دايمًا بعرض الصورة كاملة (الـ bookend keyframes) — مطابق لطلب العميل: الصورة
// تظهر كاملة، تزوم على كل مرحلة وقت ذكرها، وترجع تزوم آوت في الآخر
// ✅ durationOverride (اختياري): بيستخدم مدة مصحّحة بالفريم بدل endTime-startTime الخام —
// شوف تعليق "clipPlans" في renderAudioVideoJob لسبب التصحيح ده. الفرق أقل من فريم واحد
// (≤0.04 ثانية) فمالوش أي تأثير محسوس على توقيت الزوم/الـ pan نفسه
function buildCompositeSceneClip(scene, imagePath, W, H, outPath, durationOverride) {
  const duration = durationOverride ?? Math.max(0.5, scene.endTime - scene.startTime);
  const fadeSec = Math.min(0.4, Math.max(0.1, duration * 0.05));
  const imgW = scene.imageWidth, imgH = scene.imageHeight;

  const userKfs = (scene.keyframes || []).map(k => ({
    relTime: Math.max(0, Math.min(duration, k.time - scene.startTime)),
    cx: (k.x + k.width / 2) * imgW,
    cy: (k.y + k.height / 2) * imgH,
    cw: Math.max(1, k.width * imgW),
    ch: Math.max(1, k.height * imgH),
  }));
  const fullFrame = { cx: imgW / 2, cy: imgH / 2, cw: imgW, ch: imgH };
  const allKfs = [{ ...fullFrame, relTime: 0 }, ...userKfs, { ...fullFrame, relTime: duration }]
    .sort((a, b) => a.relTime - b.relTime);
  // ✅ إزالة أي keyframes متلاصقة جدًا في الوقت (فرق أقل من 50ms) عشان منوقعش في قسمة على رقم
  // قريب جدًا من صفر في الـ interpolation
  const kfs = [];
  for (const k of allKfs) {
    if (kfs.length && k.relTime - kfs[kfs.length - 1].relTime < 0.05) continue;
    kfs.push(k);
  }

  const tVar = `(on/${FPS})`;
  const cwExpr = buildPiecewiseExpr(kfs, k => k.cw.toFixed(2), tVar);
  const chExpr = buildPiecewiseExpr(kfs, k => k.ch.toFixed(2), tVar);
  const cxExpr = buildPiecewiseExpr(kfs, k => k.cx.toFixed(2), tVar);
  const cyExpr = buildPiecewiseExpr(kfs, k => k.cy.toFixed(2), tVar);
  // z = iw/cropWidth — مضمون دايمًا >= 1 (cw دايمًا <= imgW) وهو الشرط الوحيد اللي zoompan
  // بيحتاجه عشان يشتغل صح (زي ما اتوضح في buildAnimatedClip فوق)
  const zExpr = `(iw/(${cwExpr}))`;
  const xExpr = `((${cxExpr})-(${cwExpr})/2)`;
  const yExpr = `((${cyExpr})-(${chExpr})/2)`;

  const outStart = Math.max(0, duration - fadeSec);
  const vf = `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${W}x${H}:fps=${FPS},` +
    `fade=t=in:st=0:d=${fadeSec.toFixed(3)}:color=${BG_HEX},` +
    `fade=t=out:st=${outStart.toFixed(3)}:d=${fadeSec.toFixed(3)}:color=${BG_HEX}`;
  execSync(
    `ffmpeg -y -loop 1 -framerate ${FPS} -i "${imagePath}" -vf "${vf}" -t ${duration.toFixed(3)} -c:v libx264 -pix_fmt yuv420p "${outPath}"`,
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
  const fontSize = isVertical ? 140 : 128;
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

  // ✅ FIX (بلاغ متكرر: مربع فاضي بدل بعض الحروف العربي زي "لأ"/"لإ"): بغض النظر عن سبب
  // نقص glyph الـ ligature ده بالظبط (خط ناقص، أو محرك الشكل نفسه)، بنمنع تكوين الـ ligature
  // دي من الأساس بإدخال Zero-Width Non-Joiner (U+200C) بين "ل" وأي شكل ألف بعدها مباشرة —
  // ده بيخلي الخط يعرض الحرفين منفصلين (بس متصلين بصريًا زي الطبيعي) بدل ما يحاول يستبدلهم
  // بجليف الـ ligature المركّب (اللي هو المفقود). ده طبقة حماية إضافية فوق اختيار الفونت،
  // مش بديل عنه — بتشتغل أيًا كان السبب الحقيقي للمشكلة
  function disjoinArabicLigatures(s) {
    return String(s || '').replace(/ل(?=[اأإآ])/g, 'ل‌');
  }

  // ✅ FIX (طلب العميل): كل لقطة يا ملصق يا نص، مش الاتنين مع بعض — لقطات الملصق
  // (kind:'character'/'object') مالهاش سطر نص خالص هنا، النص بس للقطات text/quote
  const events = segments.filter(seg => seg.kind === 'text' || seg.kind === 'quote').map(seg => {
    const rawText = String(seg.text || seg.element || '').replace(/['"`\\{}|<>]/g, '').trim();
    const text = isRTL ? disjoinArabicLigatures(rawText) : rawText;
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
export async function renderAudioVideoJob(job, opts = {}) {
  const ratio = RATIO_DIMS[job.ratio] ? job.ratio : '16:9';
  const [W, H] = RATIO_DIMS[ratio];
  let elements = job.elements_json;
  const words = job.words_json;
  if (!elements || !elements.length) throw new Error('No elements to render');
  if (!words || !words.length) throw new Error('No transcript words to render');

  const workDir = path.join('temp', `audiovideo_render_${job.id}_${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    let audioDurationSec = words[words.length - 1].end + 0.3;
    // ✅ NEW (طلب العميل: فيديو whiteboard مجاني 30 ثانية للمستخدمين): opts.maxDurationSec
    // بيقفل طول الفيديو عند مدة معيّنة بغض النظر عن طول الصوت الأصلي الكامل (ممكن يكون
    // أطول بكتير، خصوصًا إن المستخدم بيكمله لاحقًا على دفعات) — أي لقطة تبدأ بعد الحد ده
    // بتتجاهل خالص. الصوت الحقيقي المرفوع لسه بيتحمّل كامل عند الـmux الأخير، لكن فلاج
    // -shortest الموجود بالفعل بيقصّه تلقائيًا لطول الفيديو الصامت المبني (المقفول هنا)
    if (opts.maxDurationSec && opts.maxDurationSec > 0) {
      audioDurationSec = Math.min(audioDurationSec, opts.maxDurationSec);
      elements = elements.filter(el => (Number(el.start) || 0) < audioDurationSec);
      if (!elements.length) throw new Error('No elements within the requested duration cap');
    }
    // ✅ اللقطة الأولى بتبدأ من t=0 مباشرة (مفيش "مقدمة" منفصلة دلوقتي بعد ما اتشالت
    // شخصية الشارح) — أي صمت قبل أول كلمة بيتغطى بملصق أول لقطة نفسه
    const segments = elements.map((el, i) => {
      const segStart = i === 0 ? 0 : el.start;
      const segEnd = i < elements.length - 1 ? elements[i + 1].start : audioDurationSec;
      return { ...el, segStart, segEnd, segDuration: Math.max(0.4, segEnd - segStart) };
    });

    // ✅ FIX (بلاغ العميل: الفيديو بيوصل "قبل معاده" بعد المشهد المركّب — يعني الصوت والصورة
    // بقوا مش متزامنين لباقي الفيديو): كان بيشيل أي لقطة عادية بتتقاطع زمنيًا مع مشهد مركّب
    // بالكامل، مهما كانت مدة التقاطع جزئية بس — يعني لو مشهد مركّب مدته ثانيتين (29→31) قاطع
    // لقطتين عاديتين مدتهم مجتمعة 6 ثواني (زي 26.9→30.1 و30.1→33.1)، كانت اللقطتين دول بيتشالوا
    // بالكامل ويتعوضوا بكليب المشهد المركّب اللي مدته ثانيتين بس — يعني 4 ثواني ضاعت من الفيديو
    // من غير ما تتعوض من الصوت (اللي فضل زي ما هو، طوله ثابت)، فكل حاجة بعد كده تتزاح 4 ثواني
    // قبل معادها الحقيقي في السكريبت. الحل الصح: نقص (trim) بس الجزء المتقاطع فعليًا من كل لقطة
    // عادية بدل ما نشيلها بالكامل — ده بيضمن الطول الكلي للفيديو يفضل مطابق تمامًا لطول الصوت
    // دايمًا، مهما كانت حدود المشهد المركّب متطابقة أو لأ مع حدود اللقطات
    const compositeScenes = Array.isArray(job.composite_scenes_json) ? job.composite_scenes_json : [];
    function subtractCompositeRange(span, cs) {
      if (span.segStart >= cs.endTime || span.segEnd <= cs.startTime) return [span];
      const pieces = [];
      if (span.segStart < cs.startTime) pieces.push({ ...span, segStart: span.segStart, segEnd: cs.startTime });
      if (span.segEnd > cs.endTime) pieces.push({ ...span, segStart: cs.endTime, segEnd: span.segEnd });
      return pieces.filter(p => p.segEnd - p.segStart >= 0.05);
    }
    let regularSegments = segments;
    for (const cs of compositeScenes) {
      regularSegments = regularSegments.flatMap(span => subtractCompositeRange(span, cs));
    }
    regularSegments = regularSegments.map(s => ({ ...s, segDuration: Math.max(0.1, s.segEnd - s.segStart) }));

    // ✅ FIX (بلاغ العميل: "الصوت بيسبق العناصر" تدريجيًا في الفيديوهات الطويلة): كل كليب
    // بيتبني لوحده بمدة (-t) وffmpeg بيقرّب المدة دي لأقرب فريم (اتأكد ده بتجربة محلية:
    // طلب 0.85s طلع 0.84s فعليًا، 2.3s طلع 2.32s...). الفرق صغير جدًا لكل كليب لوحده (أقل من
    // نص فريم غالبًا)، لكن مع عشرات/مئات الكليبات في فيديو طويل بيتراكم (لاحظنا +0.09 ثانية
    // زيادة على 10 كليبات بس في تجربة محلية) ويكبر أكتر كل ما الفيديو يطول — وده بالظبط سبب
    // "الصوت بيسبق العناصر" اللي العميل لاحظه: الفيديو الصامت بيطول شوية شوية عن الصوت الحقيقي.
    // الحل: نحسب "عدد الفريمات المستهدف التراكمي" لحد نهاية كل كليب (على التسلسل الزمني الكامل
    // للفيديو، ملصقات عادية + مشاهد مركّبة مع بعض)، وناخد فرق الفريمات بينه وبين اللي اتجمّع
    // لحد دلوقتي بس — كده أي خطأ تقريب بيتصحح تلقائيًا في الكليب اللي بعده، ومفيش تراكم خالص
    // (أقصى انحراف كلي عن الصوت الحقيقي = نص فريم بس، حتى لو الفيديو فيه مئات الكليبات)
    const clipPlans = [
      ...regularSegments.map((seg, i) => ({ kind: 'regular', seg, i, endTime: seg.segEnd, startTime: seg.segStart })),
      ...compositeScenes.map((cs, i) => ({ kind: 'composite', cs, i, endTime: cs.endTime, startTime: cs.startTime })),
    ].sort((a, b) => a.startTime - b.startTime);
    // ✅ FIX (بلاغ تاني من العميل: لسه فيه فرق ملحوظ حتى بعد التصحيح فوق، حتى في فيديو بسيط
    // من غير مشهد مركّب أو ملصقات): الكابشن (buildCaptionsAssFile) كان لسه بيستخدم segStart/
    // segEnd الخام (مش المصحّحة بالفريم) — يعني الملصق/الأيقونة بيتغيّر عند التوقيت المصحّح
    // (الصح)، لكن نص الكابشن كان بيتغيّر عند التوقيت الخام (غير المصحّح)، فبيحصل عدم اتساق
    // بين الاتنين يتراكم بنفس الطريقة بالظبط. بنسجّل بداية/نهاية كل كليب الفعلية (بالفريم
    // المصحّح) هنا عشان نستخدمها لبناء الكابشن كمان تحت، مش بس لبناء الكليبات نفسها
    let cumFrames = 0;
    for (const plan of clipPlans) {
      const frameStart = cumFrames;
      const targetFrames = Math.round(plan.endTime * FPS);
      plan.exactFrames = Math.max(1, targetFrames - cumFrames);
      plan.exactDuration = plan.exactFrames / FPS;
      plan.actualStart = frameStart / FPS;
      plan.actualEnd = (frameStart + plan.exactFrames) / FPS;
      cumFrames += plan.exactFrames;
    }
    // ✅ نسخة من regularSegments بتوقيت مصحّح بالفريم (بدل الخام) — للكابشن بس، عشان يتزامن
    // بالظبط مع نفس توقيت تغيّر الأيقونة/الملصق في الفيديو الفعلي
    const captionSegments = clipPlans.filter(p => p.kind === 'regular').map(p => ({
      ...p.seg, segStart: p.actualStart, segEnd: p.actualEnd,
    }));

    // ✅ FIX (طلب العميل): رجعنا لملصق صغير مربّع في نص الفريم بدل ما يملا الفريم كامل —
    // الملصقات دلوقتي من مكتبة أيقونات حقيقية، مش صور مولّدة تمثّل الفريم كله
    const iconSize = Math.round(Math.min(W, H) * 0.65);
    const timedClips = []; // { startTime, clipPath } — بيتترتب كرونولوجيًا في الآخر
    for (const plan of clipPlans) {
      if (plan.kind === 'composite') {
        const cs = plan.cs, i = plan.i;
        const imgRes = await fetch(cs.imageUrl);
        if (!imgRes.ok) throw new Error(`Could not download composite scene image (scene ${i + 1})`);
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        const imgPath = path.join(workDir, `composite_src_${i}.jpg`);
        fs.writeFileSync(imgPath, imgBuffer);
        const clipPath = path.join(workDir, `composite_${i}.mp4`);
        buildCompositeSceneClip(cs, imgPath, W, H, clipPath, plan.exactDuration);
        timedClips.push({ startTime: cs.startTime, clipPath });
        continue;
      }

      const seg = plan.seg, i = plan.i;
      const clipPath = path.join(workDir, `clip_${i}.mp4`);
      const duration = plan.exactDuration;
      // ✅ FIX: لقطات "quote"/"text" (آيات/أحاديث/إشارة لله أو نبي/جمل مجردة) مالهاش
      // imageUrl خالص — نص بس على الشاشة، من غير أي تحميل/توليد ملصق
      if (!seg.imageUrl) {
        buildAnimatedClip(null, W, H, iconSize, iconSize, duration, clipPath);
        timedClips.push({ startTime: seg.segStart, clipPath });
        continue;
      }
      const iconRes = await fetch(seg.imageUrl);
      if (!iconRes.ok) throw new Error(`Could not download element image: ${seg.element}`);
      const iconBuffer = Buffer.from(await iconRes.arrayBuffer());
      const iconPngPath = path.join(workDir, `icon_${i}.png`);
      // ✅ NEW (طلب العميل — ملصقات مخصّصة بالجملة): لو العنصر ده معاه أبعاد أصلية محفوظة
      // (imageWidth/imageHeight)، ده معناه ملصق مرفوع بالجملة ومحتاج يحافظ على نسبته
      // الأصلية بدل المربع التابت المستخدم لأيقونات Iconify/Tenor/GitHub العادية
      if (seg.imageWidth && seg.imageHeight) {
        const { baseW, baseH } = computeStickerDisplaySize(seg.imageWidth, seg.imageHeight, W, H);
        await prepareCustomStickerImage(iconBuffer, baseW, baseH, iconPngPath);
        buildAnimatedClip(iconPngPath, W, H, baseW, baseH, duration, clipPath);
      } else {
        await prepareIconImage(iconBuffer, iconSize, iconPngPath);
        buildAnimatedClip(iconPngPath, W, H, iconSize, iconSize, duration, clipPath);
      }
      timedClips.push({ startTime: seg.segStart, clipPath });
    }

    const clipPaths = timedClips.sort((a, b) => a.startTime - b.startTime).map(c => c.clipPath);
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
    // ✅ تشخيص (بلاغ متكرر عن مربعات غريبة في النص): بيوضح في اللوج بالظبط أي فونت اتختار
    // فعليًا لكل رندر — لو المشكلة رجعت تاني، اللوج ده هيوضح لو المشكلة في اختيار الفونت
    // نفسه (فونت غلط اتختار) أو في حاجة تانية (نفس الفونت الصح بس لسه فيه مشكلة)
    console.log(`[AudioVideo] Render font for language "${videoLanguage}": ${fontfile} (ASS name: ${fontName})`);
    // ✅ كابشن اللقطات العادية بس — المشاهد المركّبة مالهاش نص فوقها (الدايجرام نفسه هو
    // المحتوى البصري، والتسميات المفروض تكون مرسومة جوه الصورة نفسها)
    const assContent = buildCaptionsAssFile(captionSegments, videoLanguage, ratio, fontName, W, H);
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
