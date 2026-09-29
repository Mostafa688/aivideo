import express from 'express';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { authMiddleware } from './authRoutes.js';
import { agentChat, transcribeVoiceForAgent, validateAgentImage, analyzeSceneImage, refineEditInstruction, parseStructuredScript, parseAdsScenePlan, AGENT_LIMITS } from './agentService.js';
import { getUserById, logAgentConversation, setUserRegion, updateUserName, findSimilarAgentRequest, rememberAgentRequest, listManagedChannelsForUser, getManagedChannelById, getCreditsBalance } from './authService.js';
import { searchWeb, WEB_SEARCH_AVAILABLE } from './webSearchService.js';
import { getFreshChannelIdea, triggerChannelRunNow, estimateChannelRunCost, startResumeChannelRun } from './channelSchedulerService.js';
import { startWhiteboardVideoCreation } from './whiteboardVideoRoutes.js';
import { NEW_IMAGE_MODELS } from './newImageModelsService.js';
import { NEW_VIDEO_MODELS } from './newVideoModelsService.js';
import { getMaxClipSeconds } from './creditPricingEngine.js';

// ✅ FIX (باج حقيقي حصل مع عملاء حقيقيين على أكتر من موديل صور، مش موديل واحد بس): تأكد إن
// كل موديلات الصور فعليًا بتقبل حقل "aspect_ratio" بشكل صحيح (راجعنا الـ schema الحقيقي لكل
// واحد) — يبقى السبب الحقيقي مش اسم حقل غلط، لكن إن الايجنت (نموذج الذكاء الاصطناعي نفسه)
// أحيانًا مش بيحط قيمة "aspectRatio" صح في الماركر رغم طلب العميل الواضح — مشكلة التزام
// بالتعليمات (LLM compliance)، مش كود. الحل الحقيقي: حاجز إضافي في الكود نفسه بيقرأ رسالة
// العميل الخام (مش رد الايجنت) ولو فيها طلب نسبة/اتجاه صريح، يفرضه بغض النظر عمّا قاله
// الايجنت في الماركر — نفس مبدأ forcedImageModel/forcedVideoModel فوق بالظبط
// ✅ NEW (باج حقيقي: العميل رفع صورة منتجه الحقيقية في رسالة، واستخدمها الايجنت صح في نفس
// الرسالة دي بس بصيغة base64 مؤقتة — بعد كام رسالة لما طلب "استخدم صورة المنتج اللي رفعتها"
// تاني، الايجنت ملقاش أي رابط حقيقي لها خالص (الـ base64 كان جوه الطلب ده بس، ماتخزنش في أي
// history)، فاستبدلها بصورة تانية اتولدت في المحادثة (شكلها قريب بس مش نفس المنتج الحقيقي).
// الحل الجذري: أي صورة العميل يرفعها بترفع فورًا على R2 برابط دائم (زي أي صورة بيولدها
// الايجنت بالظبط)، والرابط ده بيترجع في الرد ويتحفظ مع رسالة العميل عشان يفضل قابل للاستشهاد
// بيه في أي رسالة جاية، مش بس نفس اللحظة اللي اترفعت فيها
const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function uploadUserPhotoToR2(base64DataUri) {
  if (!S3_ENDPOINT_URL || !S3_ACCESS_KEY || !S3_SECRET_KEY || !R2_PUBLIC_URL) return null;
  const match = /^data:(image\/\w+);base64,(.+)$/.exec(base64DataUri || '');
  if (!match) return null;
  try {
    const contentType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
    const key = `agent-uploads/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region: 'auto', endpoint: S3_ENDPOINT_URL, credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY } });
    await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
    return `${R2_PUBLIC_URL}/${key}`;
  } catch (e) {
    console.warn('[Agent] Failed to persist uploaded photo to R2:', e.message);
    return null;
  }
}

// ✅ NEW (باج حقيقي: العميل رفع صورة 16:9، وطلب يحرّكها فيديو — طلعت النسبة 9:16 غلط لأن
// الايجنت (الموديل نفسه) مالوش أي طريقة "يشوف" أبعاد الصورة الحقيقية، فبيخمّن نسبة افتراضية
// بدل ما ياخد أبعادها الحقيقية. نفس الباج اللي كان موجود قبل كده للصور اللي بيولدها الايجنت
// نفسه (اتصلح بحاجز في الكود يقرا "(aspect ratio: X)" من الـ history) — هنا مفيش نص زي ده
// خالص لصورة العميل نفسه، فبنقيس الأبعاد الحقيقية وقت الرفع (sharp) ونستخدمها كحاجز مماثل تحت
async function detectImageAspectRatioInfo(base64DataUri) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(base64DataUri || '');
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[1], 'base64');
    const { width, height } = await sharp(buffer).metadata();
    if (!width || !height) return null;
    const ratio = width / height;
    const bucket = ratio > 1.2 ? '16:9' : ratio < 0.83 ? '9:16' : '1:1'; // للصور — بتدعم 1:1 كمان
    const videoRatio = ratio >= 1 ? '16:9' : '9:16'; // الفيديو الجديد مالوش خيار 1:1 أصلاً
    return { bucket, videoRatio };
  } catch (e) {
    console.warn('[Agent] Failed to detect uploaded image aspect ratio:', e.message);
    return null;
  }
}

function detectExplicitAspectRatio(message) {
  if (!message) return null;
  const text = String(message).toLowerCase();
  const ratioMatch = /\b(21:9|16:9|9:16|4:3|3:4|3:2|2:3|1:1)\b/.exec(text);
  if (ratioMatch) return ratioMatch[1];
  if (/مربع|square/.test(text)) return '1:1';
  if (/طولي|عمودي|بورتريه|portrait|vertical|story|ريلز|reels/.test(text)) return '9:16';
  if (/عرضي|أفقي|افقي|widescreen|landscape|horizontal/.test(text)) return '16:9';
  return null;
}

// بيحوّل أي رسالة (عربي/إنجليزي/بأي تشكيل) لنص موحّد بسيط — عشان مقارنة "الشبه" بين
// طلب جديد وطلبات قديمة محفوظة في ذاكرة الايجنت تبقى مستقرة ومش حساسة لعلامات ترقيم/تشكيل
function normalizeFingerprint(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ً-ْ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ✅ NEW: بيدوّر على أي marker "ثانوي" (SET_REGION/SUBSCRIBE/ACCOUNT_ACTION) جوه نص الرد،
// بيشيله من النص البشري ويرجّع الـ JSON بتاعه منفصل — الماركرز دي بتيجي في آخر الرد
// (مش الأول زي READY/EDIT_SCENE) لأنها صغيرة وملهاش خطر قطع بسبب حد التوكنز
function extractTrailingMarker(text, markerName) {
  const idx = text.indexOf(markerName);
  if (idx === -1) return { text, payload: null };
  const before = text.slice(0, idx);
  const after = text.slice(idx + markerName.length);
  const { jsonText, restText } = extractJsonAndRest(after);
  try {
    return { text: (before + ' ' + restText).trim(), payload: JSON.parse(jsonText) };
  } catch {
    try {
      return { text: (before + ' ' + restText).trim(), payload: JSON.parse(repairTruncatedJson(jsonText)) };
    } catch {
      return { text: before.trim(), payload: null };
    }
  }
}

const router = express.Router();

// ✅ NEW: بيلاقي نهاية أول JSON object حقيقي جوه نص (بعدّ الأقواس/الاقتباسات) بدل ما
// يفترض إن الـ JSON هيكون في سطر لوحده — بيرجع الجزء الخاص بالـ JSON والباقي (رد الشات) منفصلين
function extractJsonAndRest(text) {
  const start = text.indexOf('{');
  if (start === -1) return { jsonText: text.trim(), restText: '' };
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { jsonText: text.slice(start, i + 1), restText: text.slice(i + 1) };
    }
  }
  // ✅ ماوصلناش لقفلة كاملة — يبقى الـ JSON اتقطع فعلاً، نرجع كل اللي لحد دلوقتي عشان نحاول نصلحه
  return { jsonText: text.slice(start), restText: '' };
}

// ✅ NEW: تصليح بسيط لـ JSON مقطوع (نص متسرب أو منقوص) — بيقفل أي string مفتوح وأي قوس مفتوح
// بالترتيب الصح. مش هيصلح كل حالة، بس بيحول جزء كبير من حالات القطع الشائعة لفيديو ناجح
// بدل ما يفشل الطلب كله من غير أي فيديو.
// ✅ NEW (باج حقيقي شفناه في الإنتاج): لما رد الموديل يتقطع (max_tokens) وسط كتابة رابط
// طويل (زي رابط R2 لصورة مرجعية)، الـ repairTruncatedJson فوق بتقفل الـ JSON صح نحويًا،
// بس الرابط نفسه بيفضل مبتور (مثلاً ينتهي بـ "grok_image_178" من غير باقي الاسم/الامتداد) —
// ده كان بيوصل زي ما هو لـ Replicate كصورة مرجعية فيفشل التوليد بـ 404، ويحرق كريديت العميل
// على طلب مضمون الفشل. أي حقل بيطلب من الايجنت "ينسخ رابط حقيقي من الـ history" (referenceImageUrls،
// animateImageUrl، sourceVideoUrl، imageUrl، videoUrls) عرضة لنفس المشكلة — الحل: نجمع كل رابط
// حقيقي فعلاً ظهر في الـ history (اللي إحنا كتبناه بنفسنا في notes زي "[...image URLs: ...]")
// في مجموعة، ونتحقق إن أي رابط الايجنت "نسخه" فعلاً موجود بالظبط في المجموعة دي — لو مش موجود
// (يبقى غالبًا مبتور أو مختلق)، نرفضه بدل ما نبعته لـ API مدفوع مضمون يفشل
// ✅ FIX: بعد ما بقينا نبعت "دفتر" منفصل بكل روابط الميديا في المشروع (mediaLedger — عشان
// روابط قديمة برة نافذة آخر 16 رسالة تفضل متاحة للايجنت)، كان لازم الرابط ده يتضاف لمجموعة
// "الروابط المعروفة" هنا كمان — وإلا الحارس ده كان هيرفض أي رابط الايجنت ينقله من الدفتر
// (يشوفه "مش معروف" ويعتبره مختلق) حتى بعد ما بقى شايفه فعليًا في الـ prompt

// ✅ FIX (باج حقيقي: العميل قال "بدون فويس أوفر" في الشات والقناة ولّدت صوت — Gemini TTS ×4 على
// Replicate). كان الاعتماد كله على إن الـLLM يضيف حقل في الماركر، ومفيش حقل للصوت أصلاً. دلوقتي
// الكود نفسه بيقرا رسائل العميل: أحدث رسالة بتذكر الصوت (بدون/مع) هي اللي بتحسم، من غير ما
// نعتمد على التزام الـLLM. بيرجّع false = "من غير صوت"، true = "بصوت"، null = العميل ماذكرش
const NO_VOICE_RE = /(بدون|من\s*غير|مفيش|بلا|مش\s*عايز|ماعايزش|ما\s*عايزش|بلاش|ولا)\s*(?:اي\s*)?(فويس|فويز|صوت|تعليق\s*صوتي|نارريشن|راوي|سرد)|بدون\s*تعليق|\b(no|without|skip)\s+(the\s+)?(voice|voiceover|voice-over|narration|narrator)\b|\bsilent\b/i;
const WITH_VOICE_RE = /(مع|بـ|بصوت|عايز|اضف|ضيف)\s*(فويس|فويز|صوت|تعليق\s*صوتي|نارريشن|راوي)|\b(with|add|include)\s+(a\s+)?(voice|voiceover|voice-over|narration|narrator)/i;
function detectVoiceRequest(message, history) {
  const userTexts = [];
  if (typeof message === 'string') userTexts.push(message);
  if (Array.isArray(history)) {
    for (let i = history.length - 1; i >= 0 && userTexts.length < 8; i--) {
      const m = history[i];
      if (m?.role === 'user' && typeof m.content === 'string') userTexts.push(m.content);
    }
  }
  for (const t of userTexts) { // الأحدث أولاً
    if (NO_VOICE_RE.test(t)) return false;
    if (WITH_VOICE_RE.test(t)) return true;
  }
  return null;
}

function extractKnownUrls(history, extraText = null) {
  const set = new Set();
  const urlRegex = /https?:\/\/[^\s\]"',]+/g;
  if (Array.isArray(history)) {
    for (const m of history) {
      const content = typeof m?.content === 'string' ? m.content : '';
      const matches = content.match(urlRegex);
      if (matches) matches.forEach(u => set.add(u.replace(/[.,;)\]]+$/, '')));
    }
  }
  if (typeof extraText === 'string' && extraText) {
    const matches = extraText.match(urlRegex);
    if (matches) matches.forEach(u => set.add(u.replace(/[.,;)\]]+$/, '')));
  }
  return set;
}

// ✅ FIX (باج حقيقي: العميل شاف رسالة غريبة في الشات بتبدأ بـ"###GENERATE_VIDEO###" متبوعة
// بـJSON خام): بيحصل لما رد الموديل يحتوي على أكتر من ماركر تقني واحد في نفس الرد (مثلاً
// ###GENERATE_IMAGE###{...} ملي ###GENERATE_VIDEO###{...} في نفس الرسالة، رغم إن البرومبت
// بيمنع ده صراحة — الموديل مش دايمًا بيلتزم). الكود فوق بيعالج الماركر الأول بس، وأي ماركر
// تاني كان بيفضل موجود حرفيًا (JSON خام وكله) جوه "reply" النهائي اللي بيوصل للعميل زي ما هو.
// الدالة دي بتشيل أي بقايا ماركر+JSON تاني (بنفس منطق عدّ الأقواس/الاقتباسات اللي بيفصل
// JSON عن نص عادي) قبل ما الرد يوصل للعميل خالص — حماية إضافية بصرف النظر عن التزام الموديل
const ALL_MARKER_NAMES = ['###READY###', '###EDIT_SCENE###', '###VIDEO_EDIT###', '###GENERATE_IMAGE###', '###GENERATE_VIDEO###', '###MERGE_VIDEOS###'];
function stripStrayMarkers(text) {
  let out = text;
  for (const marker of ALL_MARKER_NAMES) {
    let idx;
    while ((idx = out.indexOf(marker)) !== -1) {
      const before = out.slice(0, idx);
      const after = out.slice(idx + marker.length).trimStart();
      const { restText } = extractJsonAndRest(after);
      out = `${before.trim()} ${restText.trim()}`.trim();
    }
  }
  return out;
}

// ✅ NEW (باج حقيقي متكرر في الإنتاج — شكاوى عملاء متكررة رغم قواعد صريحة "ممنوع تمامًا"
// في البرومبت): تعليمات البرومبت وحدها إثبتت إنها مش موثوق فيها 100% — الايجنت لسه بيذكر
// "Model 8"/"موديل ٥" وأسماء موديلات قديمة تانية للعميل صراحة، وبيسيب "**نجمتين**" ماركداون
// خام في الرد رغم قاعدة "NO MARKDOWN" الصريحة. الحل الحاسم: حارس حتمي في الكود نفسه (regex)
// بيشيل أي ذكر لموديل قديم بالاسم/الرقم وأي ماركداون خام من الرد النهائي قبل ما يوصل للعميل
// خالص — بغض النظر عن التزام الموديل بالتعليمات من عدمه، هذا يضمن العميل محيشوفش الحاجات دي تاني
function stripLegacyModelMentions(text) {
  if (!text) return text;
  let out = text;
  // ✅ NEW (طلب العميل: بدل ما نمسح ذكر الموديلات ونسيب فراغ، نستبدلها بعبارة "النظام الجديد"
  // اللي بتوصف نظام توليد الصور/الفيديوهات الجديد ككل — مفيدة بالذات لما نشرح لحساب مجاني قديم
  // ليه الموديلات القديمة مش ظاهرة له تاني، من غير ما نسمي أي موديل بعينه)
  const REPLACEMENT = 'النظام الجديد';
  // "Model 8" / "model no. 5" / "Model5" / "Model 1/2" (إنجليزي، أي رقم من 1 لـ8، مع دعم صيغة
  // "1/2" المدمجة اللي بيتشارك فيها موديلين نفس الكريديت — من غير كده كان بيسيب "/2" يتيمة)
  out = out.replace(/\b(the\s+)?model\s*(no\.?|number|#)?\s*[1-8](?:\s*\/\s*[1-8])?\b/gi, REPLACEMENT);
  // "موديل 8" / "موديل رقم 5" / "موديل 1/2" / أرقام عربية
  out = out.replace(/موديل\s*(رقم\s*)?[١-٨1-8](?:\s*\/\s*[١-٨1-8])?/g, REPLACEMENT);
  // "الموديل الثامن" / "الموديل التاني" وكل الصيغ الترتيبية
  out = out.replace(/الموديل\s*(ال)?(أول|أولى|تاني|ثاني|ثانية|تالت|ثالث|ثالثة|رابع|رابعة|خامس|خامسة|سادس|سادسة|سابع|سابعة|تامن|ثامن|ثامنة)/g, REPLACEMENT);
  // ✅ NEW (باج حقيقي شافه العميل: "نوع المحرك (Model)" وصلت للعميل — مفيش رقم قديم هنا خالص،
  // بس قاعدة العميل صريحة: "ممنوع ذكر الموديلات للعميل خالص" مش بس الأرقام القديمة، أي ذكر
  // لكلمة "Model/موديل" كمصطلح داخلي (حتى كـ"توضيح" بين قوسين) ممنوع يوصل للعميل خالص) — هنا
  // القوس نفسه زيادة عن الحاجة (زي "المحرك (Model)")، فبنمسحه بالكامل بدل الاستبدال
  out = out.replace(/\(\s*(ai\s+)?models?\s*\)/gi, '');
  // ✅ NEW (طلب العميل: مش بس كلمة "Model" ممنوعة — أسماء النظام القديم الوصفية نفسها زي
  // "AI Images"/"Cinematic"/"Budget Cinematic"/"Real Footage"/"AI Slices"/"AI Video clips"
  // كانت لسه بتوصل للعميل كـ"توضيح" بين قوسين حتى بعد ما اتشال رقم الموديل منها — دول
  // بالظبط أسماء الموديلات 1-8 القديمة الوصفية، لازم يتشالوا زيها بالظبط)
  out = out.replace(/\(\s*(ai\s+)?(images|video\s*clips|slices|budget\s*cinematic|cinematic|real\s*footage|seedance\s*video|atlas\s*map\s*video)\b[^)]*\)/gi, '');
  out = out.replace(/\bmodels?\b/gi, REPLACEMENT);
  // ⚠️ باج حقيقي كان هنا: "موديلات?" بيخلي الـ"ا" إجبارية والـ"?" بتنطبق بس على الـ"ت" ("ات?" =
  // "ا" إجبارية + "ت" اختيارية) — يعني "موديل" المفردة من غير أي لاحقة كانت بتفوت من غير ما
  // تتستبدل خالص. الصح: "(ات)?" بقوسين عشان اللاحقة كلها اختيارية زي المفروض
  out = out.replace(/(ال)?موديل(ات)?(\s*القديم[ةه]?)?/g, REPLACEMENT);
  // تكرار "النظام الجديد" جنب بعضه (لو جملة فيها أكتر من ذكر قريب) بيتلم في ذكر واحد
  out = out.replace(new RegExp(`(${REPLACEMENT})(\\s+\\1)+`, 'g'), '$1');
  // تنضيف أي فراغات مزدوجة/أقواس فاضية/فواصل يتيمة نتجت عن الحذف فوق
  out = out.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').replace(/\s+([.,،؟!:])/g, '$1').trim();
  return out;
}

// ✅ NEW (نفس السبب فوق): "NO MARKDOWN FORMATTING" قاعدة موجودة صراحة في البرومبت من زمان،
// بس الرد لسه بيوصل فيه "**نجمتين**" خام أحيانًا — حارس حتمي بديل بدل الاعتماد على الالتزام بس
function stripMarkdownFormatting(text) {
  if (!text) return text;
  let out = text;
  // ✅ NEW (باج حقيقي شافه العميل: جدول ماركداون خام بالكامل — سطور "|...|...|" وسطر فاصل
  // "---|---|---" وصلوا للعميل زي ما هم، حرفيًا، بنفس مشكلة "**نجمتين**" القديمة بس بصيغة جدول.
  // الشات ده plain text بس، مفيش رندر جداول خالص — نحول أي جدول لسطور عادية مقروءة قبل أي حاجة تانية)
  out = out.split('\n')
    .filter(line => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) // سطر الفاصل "|---|---|"
    .map(line => {
      if (!line.includes('|')) return line;
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      return cells.join(' — ');
    })
    .join('\n');
  out = out.replace(/\*\*(.+?)\*\*/g, '$1'); // **bold**
  out = out.replace(/^#{1,6}\s+/gm, ''); // # headings
  out = out.replace(/^[*-]\s+/gm, ''); // - bullets / * bullets في أول السطر
  return out;
}

// ✅ NEW (باج حقيقي في الإنتاج): repairTruncatedJson القديمة كانت بتقفل أي string/قوس مفتوح
// وتخلي الطلب "ينجح" حتى لو اللي اتقطع كان نفس محتوى الـ"prompt" — يعني بروبمت العميل بيوصل
// مبتور نص كلمة/نص جملة لـReplicate من غير أي تحذير، فالصورة بتطلع غلط تمامًا (باج شافه
// العميل بنفسه: بروبمت طويل مفصّل اتقطع فجأة عند "no fingers detailed)." وسط الوصف، والصورة
// طلعت مش مطابقة للوصف الكامل خالص). الحل: نتتبع كمان آخر "key" JSON كانت قيمته لسه مفتوحة
// وقت القطع (curKey — بيتحدّث كل مرة نقرا string متبوعة بـ":" باعتبارها مفتاح جديد؛ لو مفيش
// ":" بعدها فهي value عادية والمفتاح الحالي فاضل زي ما هو، وده بالظبط اللي بيخلي عناصر مصفوفة
// زي "prompts" تفضل مرتبطة بمفتاحها "prompts" طول ما إحنا جواها). لو القطع حصل والمفتاح
// المفتوح وقتها كان حقل محتوى حقيقي طويل (prompt/prompts/rawPrompt/description/editPrompt/
// script)، الكود اللي بينادي الدالة دي بيرفض يكمل بدل ما يبعت بروبمت مبتور لموديل مدفوع
function repairTruncatedJsonWithInfo(text) {
  let inString = false, escape = false;
  const stack = [];
  let curKey = null;
  let keyBuf = '';
  let collectingKey = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; if (collectingKey) keyBuf += ch; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') {
      if (!inString) { inString = true; collectingKey = true; keyBuf = ''; }
      else {
        inString = false;
        // لو اللي قفل دلوقتي string متبوعة بـ":" (بعد أي مسافات) يبقى كانت مفتاح، مش قيمة
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (text[j] === ':') curKey = keyBuf;
        collectingKey = false;
      }
      continue;
    }
    if (inString) { if (collectingKey) keyBuf += ch; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }
  let repaired = text;
  if (inString) repaired += '"';
  for (let i = stack.length - 1; i >= 0; i--) repaired += stack[i] === '{' ? '}' : ']';
  return { repaired, truncatedField: inString ? curKey : null };
}

function repairTruncatedJson(text) {
  return repairTruncatedJsonWithInfo(text).repaired;
}

// حقول محتوى حقيقي (وصف/بروبمت) بتتقطع بشكل خطير لو القيمة بتاعتها اتقطعت نص الكتابة —
// لازم نرفض الطلب بدل ما نكمله ببروبمت مبتور مضمون يفشل/يطلع غلط
const CONTENT_FIELDS_UNSAFE_IF_TRUNCATED = new Set(['prompt', 'prompts', 'scenes', 'rawPrompt', 'description', 'editPrompt', 'script', 'mapVideoTopic']);

// ✅ NEW: منطق فصل الأمر التقني (###READY###/###EDIT_SCENE###/###GENERATE_IMAGE###/...) عن
// رسالة الشات نفسها — اتنقل هنا كدالة مستقلة (كان جوه الراوت مباشرة) عشان نقدر نعيد استخدامه
// في محاولة تانية (retry) لو رد الموديل الأول وعد بالتوليد من غير ما يبعت أي ماركر فعلي
// (باج حقيقي متكرر يسبب شكاوى عملاء: "تمام هبدأ دلوقتي" وبعدين مفيش أي حاجة بتتعمل خالص)
function parseAgentMarkers(rawReply) {
  let reply = rawReply;
  let ready = null;
  let editScene = null;
  let videoEdit = null;
  let generateImage = null;
  let generateVideo = null;
  let mergeVideosPayload = null;
  const isEditMarker = rawReply.includes('###EDIT_SCENE###');
  const isVideoEditMarker = !isEditMarker && rawReply.includes('###VIDEO_EDIT###');
  const isImageGenMarker = !isEditMarker && !isVideoEditMarker && rawReply.includes('###GENERATE_IMAGE###');
  const isVideoGenMarker = !isEditMarker && !isVideoEditMarker && !isImageGenMarker && rawReply.includes('###GENERATE_VIDEO###');
  const isMergeVideosMarker = !isEditMarker && !isVideoEditMarker && !isImageGenMarker && !isVideoGenMarker && rawReply.includes('###MERGE_VIDEOS###');
  const markerName = isEditMarker ? '###EDIT_SCENE###' : isVideoEditMarker ? '###VIDEO_EDIT###' : isImageGenMarker ? '###GENERATE_IMAGE###' : isVideoGenMarker ? '###GENERATE_VIDEO###' : isMergeVideosMarker ? '###MERGE_VIDEOS###' : '###READY###';
  const markerIdx = rawReply.indexOf(markerName);
  if (markerIdx !== -1) {
    const afterMarker = rawReply.slice(markerIdx + markerName.length).trimStart();
    // ✅ نلاقي نهاية الـ JSON الحقيقية بعدّ الأقواس (مش بس أول سطر جديد) عشان لو الرد
    // البشري بعد الـ JSON مالوش سطر فاصل واضح، برضو نقدر نفصلهم صح
    const { jsonText, restText } = extractJsonAndRest(afterMarker);
    reply = restText.trim();
    try {
      const parsed = JSON.parse(jsonText);
      // ✅ NEW: لو الـ JSON اتقرا صح لغويًا بس مستوفيش الشروط تحت (زي موديل مش معروف، أو
      // "prompt"/"prompts" ناقصين)، كان بيتم تجاهله بصمت تام — من غير ولا سطر لوج واحد، عكس
      // فشل JSON.parse نفسه اللي بيتسجل. ده باج حقيقي منفصل تمامًا عن أي حاجة اتصلحت قبل كده:
      // الموديل ممكن يكون فعلاً حط الماركر زي ما المفروض، بس بحقل ناقص/غلط، فالنتيجة بره كانت
      // مطابقة تمامًا لما لو مفيش ماركر خالص (رسالة الاعتذار الجاهزة) من غير أي دليل نقدر نشوفه
      // في الـ logs يوضح ليه. بنسجل الـ payload الخام هنا في كل حالة رفض عشان نقدر نشخّص فعليًا.
      if (isEditMarker) {
        if (Number.isInteger(parsed.sceneIndex) && typeof parsed.description === 'string') editScene = parsed;
        else console.warn('[Agent] EDIT_SCENE marker parsed but failed validation:', JSON.stringify(parsed).slice(0, 500));
      } else if (isVideoEditMarker) {
        if (typeof parsed.editPrompt === 'string' && parsed.editPrompt.trim()) videoEdit = parsed;
        else console.warn('[Agent] VIDEO_EDIT marker parsed but failed validation:', JSON.stringify(parsed).slice(0, 500));
      } else if (isImageGenMarker) {
        const hasDistinctPrompts = Array.isArray(parsed.prompts) && parsed.prompts.filter(p => typeof p === 'string' && p.trim()).length >= 2;
        // ✅ NEW: "scenes" — شكل بديل بيدي كل مشهد تحكم مستقل في مرجعه الخاص (راجع تعليق
        // "لازم يكون في ذكاء" تحت)، بدل مصفوفة برومبتات فلات كلها بتاخد نفس المرجع
        const hasDistinctScenes = Array.isArray(parsed.scenes) && parsed.scenes.filter(s => s && typeof s.prompt === 'string' && s.prompt.trim()).length >= 2;
        if (typeof parsed.model === 'string' && NEW_IMAGE_MODELS[parsed.model] && ((typeof parsed.prompt === 'string' && parsed.prompt.trim()) || hasDistinctPrompts || hasDistinctScenes)) generateImage = parsed;
        else console.warn('[Agent] GENERATE_IMAGE marker parsed but failed validation (missing/invalid model, or no usable prompt/prompts/scenes):', JSON.stringify(parsed).slice(0, 800));
      } else if (isVideoGenMarker) {
        if (typeof parsed.model === 'string' && NEW_VIDEO_MODELS[parsed.model] && typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
          const maxSec = getMaxClipSeconds(parsed.model);
          if (maxSec && (!Number.isFinite(parsed.durationSec) || parsed.durationSec > maxSec)) parsed.durationSec = maxSec;
          generateVideo = parsed;
        } else {
          console.warn('[Agent] GENERATE_VIDEO marker parsed but failed validation (missing/invalid model, or no usable prompt):', JSON.stringify(parsed).slice(0, 800));
        }
      } else if (isMergeVideosMarker) {
        if (Array.isArray(parsed.videoUrls) && parsed.videoUrls.length >= 2 && parsed.videoUrls.every(u => typeof u === 'string' && u.trim())) {
          mergeVideosPayload = {
            videoUrls: parsed.videoUrls.slice(0, 10),
            narrationScript: parsed.narrationScript, voiceKey: parsed.voiceKey, narrationLanguage: parsed.narrationLanguage,
            addCaptions: parsed.addCaptions, musicStyle: parsed.musicStyle, musicMood: parsed.musicMood,
          };
        } else {
          console.warn('[Agent] MERGE_VIDEOS marker parsed but failed validation (need >=2 real videoUrls):', JSON.stringify(parsed).slice(0, 500));
        }
      } else if ([1, 2, 3, 4, 5, 7, 8].includes(parsed.model)) {
        ready = parsed;
      } else {
        // ✅ FIX: كان بيتم تجاهل ###READY### بصمت تام لو "model" مش رقم من القايمة القديمة —
        // من غير ولا سطر لوج واحد، عكس كل الماركرات التانية فوق. الماركر ده متقاعد فعليًا (الرد
        // الافتراضي الجديد بيمر بـGENERATE_IMAGE/GENERATE_VIDEO)، بس لو الموديل حطه غلط بدل
        // كده لازم نشوف ده في اللوجز عشان نفرّقه عن حالة "مفيش ماركر خالص"
        console.warn('[Agent] READY marker parsed but "model" is not a recognized legacy model number:', JSON.stringify(parsed).slice(0, 500));
      }
    } catch (e) {
      // ✅ FIX: كان بيسيب الطلب كله يفشل من غير فيديو ولا رسالة خطأ واضحة لو الموديل
      // قطع الـ JSON في النص (خصوصًا مع reasoning models زي gpt-oss اللي بتاخد جزء من
      // التوكنز في تفكير مش ظاهر). دلوقتي بنحاول نصلّح الـ JSON المقطوع قبل ما نستسلم.
      console.warn(`[Agent] Could not parse ${markerName} marker, attempting repair:`, e.message);
      try {
        const { repaired: repairedText, truncatedField } = repairTruncatedJsonWithInfo(jsonText);
        if (truncatedField && CONTENT_FIELDS_UNSAFE_IF_TRUNCATED.has(truncatedField)) {
          throw new Error(`unsafe repair — "${truncatedField}" content was cut off mid-value, refusing to send a truncated prompt`);
        }
        const repaired = JSON.parse(repairedText);
        if (isEditMarker) {
          if (Number.isInteger(repaired.sceneIndex) && typeof repaired.description === 'string') {
            editScene = repaired;
            console.warn('[Agent] ✅ Repaired truncated EDIT_SCENE JSON successfully');
          }
        } else if (isVideoEditMarker) {
          if (typeof repaired.editPrompt === 'string' && repaired.editPrompt.trim()) {
            videoEdit = repaired;
            console.warn('[Agent] ✅ Repaired truncated VIDEO_EDIT JSON successfully');
          }
        } else if (isImageGenMarker) {
          const hasDistinctPrompts = Array.isArray(repaired.prompts) && repaired.prompts.filter(p => typeof p === 'string' && p.trim()).length >= 2;
          const hasDistinctScenes = Array.isArray(repaired.scenes) && repaired.scenes.filter(s => s && typeof s.prompt === 'string' && s.prompt.trim()).length >= 2;
          if (typeof repaired.model === 'string' && NEW_IMAGE_MODELS[repaired.model] && ((typeof repaired.prompt === 'string' && repaired.prompt.trim()) || hasDistinctPrompts || hasDistinctScenes)) {
            generateImage = repaired;
            console.warn('[Agent] ✅ Repaired truncated GENERATE_IMAGE JSON successfully');
          }
        } else if (isVideoGenMarker) {
          if (typeof repaired.model === 'string' && NEW_VIDEO_MODELS[repaired.model] && typeof repaired.prompt === 'string' && repaired.prompt.trim()) {
            const maxSec = getMaxClipSeconds(repaired.model);
            if (maxSec && (!Number.isFinite(repaired.durationSec) || repaired.durationSec > maxSec)) repaired.durationSec = maxSec;
            generateVideo = repaired;
            console.warn('[Agent] ✅ Repaired truncated GENERATE_VIDEO JSON successfully');
          }
        } else if (isMergeVideosMarker) {
          if (Array.isArray(repaired.videoUrls) && repaired.videoUrls.length >= 2 && repaired.videoUrls.every(u => typeof u === 'string' && u.trim())) {
            mergeVideosPayload = {
              videoUrls: repaired.videoUrls.slice(0, 10),
              narrationScript: repaired.narrationScript, voiceKey: repaired.voiceKey, narrationLanguage: repaired.narrationLanguage,
              addCaptions: repaired.addCaptions, musicStyle: repaired.musicStyle, musicMood: repaired.musicMood,
            };
            console.warn('[Agent] ✅ Repaired truncated MERGE_VIDEOS JSON successfully');
          }
        } else if ([1, 2, 3, 4, 5, 7, 8].includes(repaired.model)) {
          ready = repaired;
          console.warn('[Agent] ✅ Repaired truncated JSON successfully');
        }
      } catch (e2) {
        console.warn('[Agent] Repair also failed, no video will start this turn:', e2.message);
        if (!reply) reply = 'تمام، بس حصلت مشكلة بسيطة وأنا بجهز التفاصيل — ممكن تقول "ابدأ" تاني؟';
      }
    }
  }
  return { reply, ready, editScene, videoEdit, generateImage, generateVideo, mergeVideosPayload };
}

// بسيط جدًا — حماية إضافية ضد إساءة الاستخدام (spam) بدون تعقيد
const lastRequestAt = new Map(); // userId -> timestamp
const MIN_INTERVAL_MS = 1500;

router.post('/chat', authMiddleware, async (req, res) => {
  // ✅ NEW: لوج فوري أول ما الطلب يوصل — قبل أي معالجة خالص — عشان نتأكد فورًا هل الطلب
  // بتاع الصورتين بيوصل للسيرفر أصلاً ولا بيتوقف قبل كده (مشكلة حجم/بروكسي مثلاً)
  try {
    const bodySize = JSON.stringify(req.body || {}).length;
    console.log(`[Agent Chat] 📥 Request received — body size: ${(bodySize / 1024 / 1024).toFixed(2)}MB, hasImages: ${Array.isArray(req.body?.imagesBase64) ? req.body.imagesBase64.length : (req.body?.imageBase64 ? 1 : 0)}, hasVoice: ${!!req.body?.voiceBase64}`);
  } catch (e) { console.warn('[Agent Chat] Could not log request size:', e.message); }
  try {
    const userId = req.user.userId;
    const now = Date.now();
    const last = lastRequestAt.get(userId) || 0;
    if (now - last < MIN_INTERVAL_MS) {
      return res.status(429).json({ error: 'Please wait a moment before sending another message.' });
    }
    lastRequestAt.set(userId, now);

    const { message, history, voiceBase64, imageBase64, imagesBase64, photoAlreadyUploaded, voiceAlreadyUploaded, videoAlreadyUploaded, videoDurationSec, hasStructuredScript: clientHasStructuredScript, hasAdsScenePlan: clientHasAdsScenePlan, styleHint, hasClonedVoice, forcedImageModel, forcedVideoModel, mediaLedger } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    // ✅ NEW: فحص بكود عادي (مفيش أي AI) — هل الرسالة فيها تقسيم مشاهد جاهز (Scene 1/Visual
    // Prompt/Narration...)؟ لو أيوه، بنستخرج المشاهد هنا بالـ regex ونديها للإيجنت كـ "حقيقة
    // جاهزة" بدل ما نطلب منه ينسخها بنفسه (اللي اتضح إنه بيلخّصها ويسقط مشاهد أحيانًا).
    const parsedScript = parseStructuredScript(message);
    let structuredScenesResult = null;
    let structuredNote = null;
    if (parsedScript) {
      structuredScenesResult = parsedScript.scenes;
      const durLabel = parsedScript.durationSec ? `${parsedScript.durationSec}s` : 'unspecified';
      structuredNote = `The user pasted a pre-divided scene breakdown with EXACTLY ${parsedScript.scenes.length} scenes, already parsed and captured exactly as written by the system (not by you) — you must NOT reproduce, retype, or summarize the scene text yourself, and must NOT include a "structuredScenes" field anywhere (the system already has the real content). Stated/implied total duration ≈ ${durLabel}. Voice style hint from the user: "${parsedScript.voiceHint || 'none given'}". Music requested: ${parsedScript.hasMusic ? 'yes' : 'no'}. Your job now: build this via the NEW pipeline (see the retired-models rule at the very top of this prompt) — treat each of these ${parsedScript.scenes.length} already-parsed scenes as one entry in a ###GENERATE_IMAGE### "prompts" array (with a shared reference image generated first via its own ###GENERATE_IMAGE### call if a consistent character/subject is described across scenes), then animate each resulting scene image via ###GENERATE_VIDEO### — the real scene count you generate MUST be exactly ${parsedScript.scenes.length}, never fewer (collapsing a multi-scene plan into fewer scenes is a real production bug, do not repeat it). Pick aspect ratio (ask if unclear). Narration is real per-clip now (see GENERATE_VIDEO's "narrationScript" field) — if the plan's voice hint implies spoken narration, write each scene's own narration line into that scene's own GENERATE_VIDEO call's "narrationScript" (matching what that scene is about), and set "musicStyle" too if music was requested.`;
    }
    const hasStructuredScript = !!parsedScript || !!clientHasStructuredScript;

    // ✅ NEW: نفس الفكرة، لخطة إعلان بصيغة جدول (Time | Visual | Voiceover) — لو مفيش
    // تقسيم "Scene N" اتلقط فوق، نجرب صيغة الجدول دي كمان بنفس الأسلوب (كود عادي، مفيش AI)
    let adsScenePlanResult = null;
    let adsScenePlanNote = null;
    if (!parsedScript) {
      const parsedAdsPlan = parseAdsScenePlan(message);
      if (parsedAdsPlan) {
        adsScenePlanResult = parsedAdsPlan;
        const styleLabel = parsedAdsPlan.style || (parsedAdsPlan.styleRaw ? `"${parsedAdsPlan.styleRaw}" (map to closest of action/cinematic/calm)` : 'unspecified');
        adsScenePlanNote = `The user pasted a ready-made AD PLAN with a Time/Visual/Voiceover table — EXACTLY ${parsedAdsPlan.scenes.length} scenes, already parsed and captured exactly as written by the system (not by you), each with its own real duration and its own exact voiceover line — you must NOT reproduce, retype, or summarize any scene content yourself, and must NOT include an "adsScenePlan" field anywhere (the system already has it). Total planned duration ≈ ${parsedAdsPlan.totalDurationSec}s. Style from the plan: ${styleLabel}. Music hint: "${parsedAdsPlan.musicHint || 'none given'}"（informational only). ${parsedAdsPlan.hasOnScreenText ? 'The plan includes "On-Screen Text" — mention once that this platform doesn\'t render separate on-screen text overlays.' : ''} Your job now: build this via the NEW pipeline (see the retired-models rule at the very top of this prompt) — use the uploaded product photo as the reference image if given (or generate one via ###GENERATE_IMAGE### from the plan's visuals if not), treat each of these ${parsedAdsPlan.scenes.length} planned scenes as one entry in a ###GENERATE_IMAGE### "prompts" array referencing that product image, then animate each via ###GENERATE_VIDEO###. Pick aspect ratio (ask if unclear), mention the running credit cost as you go. Narration is real per-clip now (see GENERATE_VIDEO's "narrationScript" field) — write each scene's own exact voiceover line from the plan into that scene's own GENERATE_VIDEO call's "narrationScript", and set "musicStyle" if the plan's music hint implies background music.`;
      }
    }
    const hasAdsScenePlan = !!adsScenePlanResult || !!clientHasAdsScenePlan;

    // ✅ FIX: بيقبل دلوقتي مصفوفة صور (لحد 6) في نفس الرسالة، مش صورتين بس كان الحد الأقصى —
    // طلب العميل: يرفع أكتر من صورة (منتجات/شخصيات مختلفة) في نفس الرسالة عشان يحركهم كل واحدة
    // بالبرومبت بتاعها هي، مش بس الحالة القديمة (صورتين لدمجهم كشخصية واحدة في موديل 5) —
    // imageBase64 (مفرد) لسه متاح للتوافق مع أي كود قديم، بس imagesBase64 (جمع) هو الأساس دلوقتي
    const images = Array.isArray(imagesBase64) && imagesBase64.length
      ? imagesBase64.slice(0, 6)
      : (imageBase64 ? [imageBase64] : []);

    const styleHintNote = styleHint
      ? (styleHint === 'map_video'
          ? `The user selected "Map Video" from the style picker — this means they specifically want a historical/geopolitical map-documentary style video for this next request; write the scene prompt(s) through the normal GENERATE_IMAGE/GENERATE_VIDEO pipeline in that map-documentary style, unless the topic they describe clearly can't work as one, in which case briefly clarify with them.`
          : `The user selected the "${styleHint.replace('_', ' ')}" visual style from the style picker before describing their idea — weave this style genuinely into the prompt(s) you write for GENERATE_IMAGE/GENERATE_VIDEO. This is optional context they chose to make their intent clearer, not a separate request — don't mention the picker itself, just naturally apply the style.`)
      : null;
    // ✅ NEW (طلب العميل: زرار سهم يدوي لاختيار موديل الصورة/الفيديو بنفسه — زي Google Flow):
    // المستخدم اختار موديل معيّن يدويًا من قائمة قبل ما يبعت الرسالة — لازم الايجنت يستخدمه
    // بالظبط بدل ما يختار هو، ويقول السعر الصح المرتبط بيه (بعده كمان في الكود فيه حاجز إضافي
    // بيفرض نفس الاختيار حتى لو الموديل تجاهل التعليمة دي)
    const forcedModelNote = forcedImageModel && NEW_IMAGE_MODELS[forcedImageModel]
      ? `The user manually selected the image engine "${forcedImageModel}" from a picker before sending this message — you MUST use exactly this model for any image generation in this turn (do not pick a different one, do not ask which model), and state its real credit cost from the price list above.`
      : forcedVideoModel && NEW_VIDEO_MODELS[forcedVideoModel]
      ? `The user manually selected the video engine "${forcedVideoModel}" from a picker before sending this message — you MUST use exactly this engine for ANY video generation in this turn, INCLUDING animating a generated image (if they ask to animate/move a picture right now, use the ###GENERATE_VIDEO### marker with model:"${forcedVideoModel}" and "imageUrl" set to the exact image URL from history — do NOT silently switch to a different engine for this turn, that would ignore their explicit choice). Do not pick a different engine, do not ask which one, and state its real credit cost from the price list above.`
      : null;
    let attachmentNote = [structuredNote, adsScenePlanNote, styleHintNote, forcedModelNote].filter(Boolean).join(' ') || null;
    let transcript = null;
    let uploadedVoiceUrl = null;

    if (voiceBase64) {
      try {
        const result = await transcribeVoiceForAgent(voiceBase64);
        transcript = result.text;
        uploadedVoiceUrl = result.audioUrl;
        attachmentNote = `User uploaded a voice recording (${Math.round(result.duration)}s). Transcript of what they said: "${transcript.slice(0, 500)}". Unless this is for the WHITEBOARD VIDEO mode (which uses the real recording audio as-is), use this transcript's content directly as the video's "narrationScript" in GENERATE_VIDEO/MERGE_VIDEOS — note the narration will be freshly synthesized (TTS) reading their words, not their literal recorded voice, so if they specifically expect their own voice to be reused as-is, say so honestly rather than implying it will sound identical. Do NOT ask the user to type a separate script — you already have it from their recording.`;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    let uploadedPhotoUrls = [];
    // ✅ NEW: خريطة رابط → معلومة النسبة الحقيقية (من sharp) — بتتستخدم تحت كحاجز إضافي
    // بالكود يفرض النسبة الصح على أي فيديو بيحرّك الصورة دي بالظبط، بدل ما نعتمد على تخمين
    // الايجنت (راجع تعليق detectImageAspectRatioInfo فوق)
    const uploadedPhotoRatioByUrl = new Map();
    if (images.length) {
      try {
        for (const img of images) validateAgentImage(img);
        // ✅ NEW: بنرفع الصور المرفقة على R2 فورًا برابط دائم — لو نجح، الرابط ده بيتحفظ مع
        // رسالة العميل (الفرونت إند بيخزنه) عشان يفضل قابل للاستشهاد بيه في referenceImageUrls
        // في أي رسالة جاية، مش بس دلوقتي وهو لسه base64 جوه الطلب الحالي
        const uploadResults = await Promise.all(images.map(async (img) => ({
          url: await uploadUserPhotoToR2(img),
          ratioInfo: await detectImageAspectRatioInfo(img),
        })));
        for (const r of uploadResults) if (r.url && r.ratioInfo) uploadedPhotoRatioByUrl.set(r.url, r.ratioInfo);
        uploadedPhotoUrls = uploadResults.filter(r => r.url).map(r => r.url);
        if (uploadedPhotoUrls.length) {
          // ✅ FIX: لو أكتر من صورة، بنرقّم كل واحدة صراحة ("Photo 1: url, Photo 2: url") —
          // مش مجرد قائمة روابط مجمّعة من غير ترقيم — عشان الايجنت يقدر يربط كل صورة بالبرومبت
          // بتاعها بالترتيب الصح لو العميل وصف تحريك مختلف لكل صورة (راجع الحاجز الإضافي تحت)
          // ✅ FIX: بنضيف النسبة الحقيقية جنب كل صورة كمان (زي ملاحظات الصور اللي بيولدها
          // الايجنت بالظبط) — عشان لو الايجنت هو نفسه فاكر يستخدمها صح، مع إن الكود تحت
          // بيفرضها بغض النظر عن التزامه بالتعليمة دي
          const labelFor = (u) => `${u}${uploadedPhotoRatioByUrl.has(u) ? ` (aspect ratio: ${uploadedPhotoRatioByUrl.get(u).bucket})` : ''}`;
          const indexedUrls = uploadedPhotoUrls.length > 1
            ? uploadedPhotoUrls.map((u, i) => `Photo ${i + 1}: ${labelFor(u)}`).join(', ')
            : labelFor(uploadedPhotoUrls[0]);
          attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + `The photo(s) just uploaded are now permanently available at ${uploadedPhotoUrls.length > 1 ? 'these exact URLs, numbered in the exact order they were uploaded' : 'this exact URL'}: ${indexedUrls} — you may use ${uploadedPhotoUrls.length > 1 ? 'them' : 'it'} directly in "referenceImageUrls"/"imageUrl" right now, and ${uploadedPhotoUrls.length > 1 ? 'each of these URLs' : 'this same URL'} will remain valid to cite in ANY future message in this conversation (see the MEDIA LEDGER note if present) if the customer later asks to reuse this exact uploaded photo — never substitute a different, previously-generated image instead of this real uploaded one. If animating one of these photos directly, match "aspectRatio" to that exact photo's own stated ratio above, never a generic default.`;
        }
        // ✅ NEW: لو العميل رفع صورة مشهد وقال "اعملي نفس المشهد ده" أو أي صيغة مشابهة،
        // نحلل الصورة بالـ vision model ونطلع منها rawPrompt جاهز بدل ما نطلب منه يوصف بنفسه
        const sameSceneIntent = images.length === 1 && /same\s*scene|recreate this|make (a|the) same|make this (a|into a) video|animate this photo|نفس\s*المشهد|زي\s*(الصورة|المشهد)\s*ده|كأنه\s*المشهد|حرك\s*(الصورة|المشهد)\s*دي?/i.test(message || '');
        if (sameSceneIntent) {
          try {
            const sceneDescription = await analyzeSceneImage(images[0]);
            attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + `The user uploaded a photo of a scene and wants a new AI video that recreates it. Here is a detailed analysis of the photo, ready to use directly as the "prompt": "${sceneDescription}". Use this AS THE prompt in ###GENERATE_VIDEO### (with "imageUrl" set to that photo's own uploaded URL) — light grammar polish only, never change its meaning, and do NOT ask the user to describe the scene themselves, you already have it. Only ask them for duration if they have not already told you anywhere in the conversation — if they already gave a duration, skip straight to confirming and generating.`;
          } catch (e) {
            console.warn('[Agent] Scene image analysis failed:', e.message);
            attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + 'User uploaded a photo and wants the same scene recreated as a video, but automatic analysis of the photo failed — ask them to briefly describe in a sentence what is happening in the photo themselves so you can write the GENERATE_VIDEO prompt instead.';
          }
        } else {
          // ✅ FIX (طلب العميل: رفع أكتر من صورة عشان تتحرك كل واحدة بالبرومبت بتاعها هي، مش
          // بس حالة "شخصين لموديل 5" القديمة): لو العميل وصف صراحة إنه عايز موديل 5 بشخصين
          // (نادر دلوقتي، الخط القديم متقاعد)، لسه ممكن يحصل — لكن الافتراض الجديد لأكتر من
          // صورة هو الحالة الأشيع بكتير: كل صورة عندها موضوعها الخاص وهتتحرك لوحدها بفيديو
          // منفصل (GENERATE_VIDEO) بالبرومبت الخاص بيها هي، بنفس ترتيب الرفع بالظبط
          const note = images.length > 1
            ? `User just uploaded ${images.length} photos in this one message, numbered above in upload order (Photo 1, Photo 2, ...). Unless the customer explicitly says these are multiple people to merge into ONE combined reference (in which case use "referenceImageUrls" with all of them on a single GENERATE_IMAGE/GENERATE_VIDEO call), assume each photo is its own separate subject that needs its OWN separate animation — see the "ANIMATING MULTIPLE UPLOADED PHOTOS" rule below for exactly how to sequence this (one ###GENERATE_VIDEO### per turn, in upload order, using each photo's own numbered URL). If the customer already described a distinct motion/scene for each photo (in this same message or already earlier), match instruction 1 to Photo 1, instruction 2 to Photo 2, and so on in the exact order both were given — never mix up which instruction belongs to which photo.`
            : 'User just uploaded a photo. This satisfies the required product/character reference photo for whatever they\'re generating — OR, if they just want the photo animated directly with no scene description at all, use ###GENERATE_VIDEO### with "imageUrl" set to it and no "prompt" (natural default motion), or a "prompt" too if they described specific motion. Treat the photo requirement as met right now, do not ask for it again, and proceed toward confirming and generating if you already have the other required details.';
          attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + note;
        }
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const user = await getUserById(userId).catch(() => null);
    const userPlan = user?.plan || 'free';
    const userRegion = user?.region || null;
    // ✅ FIX (باج حقيقي: عميل سأل الايجنت "أنا على أي خطة؟" ورد "معنديش وصول لتفاصيل حسابك،
    // روح صفحة الإعدادات" — بينما الايجنت أصلاً بيعرف الخطة، بس مكانش عنده رصيد الكريديت
    // خالص عشان يجاوب بثقة على سؤال زي ده). بنجيب الرصيد الحقيقي هنا ونبعته للـ system prompt
    const userCredits = await getCreditsBalance(userId).catch(() => null);
    // ⚠️ Model 8 تحت الصيانة — بس الأدمن يقدر يستخدمه من خلال الايجنت كمان
    const isAdminUser = (user?.email || '').toLowerCase() === (process.env.ADMIN_EMAIL || 'digidelight33@gmail.com').toLowerCase();
    // ✅ NEW: القنوات اللي العميل ربطها بـ VidIQ (My Channels) — الايجنت لازم يكون عارفها
    const userChannels = await listManagedChannelsForUser(userId).catch(() => []);

    // ── ذاكرة الايجنت: هل فيه طلب مشابه اتفهم واتنفذ قبل كده؟ لو أيوه، بنمرر ملخصه
    // كـ "MEMORY" للنموذج عشان يقدر "يحل ذاتيًا" بدل ما يعيد كل أسئلة التوضيح من الأول
    const fingerprint = normalizeFingerprint(message);
    let memoryNote = null;
    if (fingerprint.length > 12) {
      const similar = await findSimilarAgentRequest(userId, fingerprint).catch(() => null);
      if (similar) {
        memoryNote = `A similar past request ("${String(similar.raw_request || '').slice(0, 250)}") was previously understood and resolved with this configuration: ${JSON.stringify(similar.resolved_config).slice(0, 900)}.`;
      }
    }

    let rawReply = await agentChat({
      message, history, attachmentNote, userPlan, isAdminUser,
      hasPhoto: images.length > 0 || !!photoAlreadyUploaded,
      hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
      hasVideo: !!videoAlreadyUploaded,
      videoDurationSec: videoDurationSec || null,
      hasStructuredScript,
      hasAdsScenePlan,
      userRegion,
      memoryNote,
      userChannels,
      hasClonedVoice,
      userCredits,
      mediaLedger,
    });

    // ── RESEARCH: لو الايجنت طلب تحقق حقيقي من معلومة (حدث تاريخي/حقيقي) قبل ما يرد،
    // بنعمل بحث فعلي على الإنترنت (Tavily) وبعدين نديله النتائج في جولة ثانية عشان يكتب
    // رد نهائي مبني عليها، مع مصادر حقيقية يقدر يديها للعميل لو سأل "مصادرك ايه؟" ──────
    if (rawReply.includes('###RESEARCH###')) {
      const afterMarker = rawReply.slice(rawReply.indexOf('###RESEARCH###') + '###RESEARCH###'.length);
      const { jsonText } = extractJsonAndRest(afterMarker);
      try {
        const { query } = JSON.parse(jsonText);
        if (query && WEB_SEARCH_AVAILABLE) {
          const search = await searchWeb(query).catch(e => ({ error: e.message }));
          const researchNote = search.error
            ? `You asked to verify "${query}" but the web search failed (${search.error}) — proceed using your own knowledge, and be upfront with the user that live verification wasn't available this time if they ask about sources.`
            : `Web search results for "${query}":\n${search.results.map(r => `- ${r.title} — ${r.url}\n  ${r.content}`).join('\n')}\n${search.answer ? `Summary: ${search.answer}\n` : ''}Use this to write an accurate reply/script now, and remember these exact source URLs in case the user asks where the information came from.`;
          rawReply = await agentChat({
            message, history, attachmentNote: (attachmentNote ? attachmentNote + ' ' : '') + researchNote, userPlan, isAdminUser,
            hasPhoto: images.length > 0 || !!photoAlreadyUploaded,
            hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
            hasVideo: !!videoAlreadyUploaded,
            videoDurationSec: videoDurationSec || null,
            hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits, mediaLedger,
          });
        } else if (query) {
          rawReply = await agentChat({
            message, history, attachmentNote: (attachmentNote ? attachmentNote + ' ' : '') + 'You asked to research this but web search is not configured on this deployment — answer using your own knowledge and honestly tell the user you cannot verify it live right now.', userPlan, isAdminUser,
            hasPhoto: images.length > 0 || !!photoAlreadyUploaded, hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
            hasVideo: !!videoAlreadyUploaded, videoDurationSec: videoDurationSec || null,
            hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits, mediaLedger,
          });
        }
      } catch (e) {
        console.warn('[Agent] RESEARCH marker parse failed:', e.message);
      }
    }

    // ── CHANNEL_IDEA: العميل طلب فيديو لقناة متربطة دلوقتي (مش مستني الإيميل اليومي) —
    // بنجيب فكرة حقيقية من VidIQ فورًا وبنديها للايجنت في جولة تانية عشان يكمل بيها ──────
    if (rawReply.includes('###CHANNEL_IDEA###')) {
      const afterMarker = rawReply.slice(rawReply.indexOf('###CHANNEL_IDEA###') + '###CHANNEL_IDEA###'.length);
      const { jsonText } = extractJsonAndRest(afterMarker);
      try {
        const { channelId } = JSON.parse(jsonText);
        const channel = userChannels.find(c => c.id === channelId);
        let channelNote;
        if (!channel) {
          channelNote = `You referenced channel id ${channelId} but it doesn't belong to this user — apologize briefly and list their actual connected channels (see CONNECTED CHANNELS above) instead.`;
        } else {
          const fullChannel = await getManagedChannelById(channelId);
          const { idea, format } = await getFreshChannelIdea(fullChannel);
          const estimatedCost = estimateChannelRunCost(fullChannel, format, idea);
          const costNote = estimatedCost != null
            ? `estimated cost: ~${estimatedCost} credits (final cost may vary slightly, charged from their real balance)${typeof userCredits === 'number' ? `; the customer's current balance is ${userCredits} credits${userCredits < estimatedCost ? ' — LOWER than the estimate' : ''}` : ''}`
            : `cost: depends on this channel's content style — you'll be told the exact amount once it's done, charged from their real balance like any other video`;
          channelNote = `Fresh idea sourced from VidIQ for channel "${channel.label || channel.channel_id}" (id ${channelId}): title="${idea.title}", brief="${idea.brief || ''}", videoLanguage="${idea.videoLanguage || 'en'}", format="${format}" (${format === 'short' ? 'short, punchy, ~30s' : 'long-form, several minutes'}), voice="${channel.uses_voice ? 'yes — include narration' : 'no — silent, no narration'}", ${costNote}. Present this idea warmly to the user (title, brief, and the cost note above), then per rule 13b step 2, wait for their explicit go-ahead before ending a reply with ###CHANNEL_GENERATE###{"channelId":${channelId}} — do not use the generic image/video pipeline for this, and do not ask the user for details you already have here.`;
        }
        rawReply = await agentChat({
          message, history, attachmentNote: (attachmentNote ? attachmentNote + ' ' : '') + channelNote, userPlan, isAdminUser,
          hasPhoto: images.length > 0 || !!photoAlreadyUploaded, hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
          hasVideo: !!videoAlreadyUploaded, videoDurationSec: videoDurationSec || null,
          hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits, mediaLedger,
        });
      } catch (e) {
        console.warn('[Agent] CHANNEL_IDEA marker failed:', e.message);
        rawReply = rawReply.replace(/###CHANNEL_IDEA###.*/s, '').trim() || 'معلش، مش قادر أجيب فكرة من القناة دلوقتي — جرب تاني بعد شوية.';
      }
    }

    // ✅ NEW: لو الموديل رجع رد فاضي تمامًا (مثلاً استهلك كل التوكنز في تفكير مخفي غير ظاهر
    // ولم يترك أي نص فعلي) — منسيبش فقاعة فاضية تظهر للعميل وكأن الأجنت "مش بيرد"، نرجع
    // رسالة واضحة تطلب إعادة المحاولة بدل ما نرسل reply فاضي للفرونت إند
    if (!rawReply || !rawReply.trim()) {
      console.warn('[Agent Chat] ⚠️ Empty reply from model — likely reasoning tokens exhausted max_tokens before any visible content');
      return res.json({
        reply: 'معلش، حصل تأخير بسيط في التفكير — ممكن تبعت رسالتك تاني؟',
        transcript, ready: null, editScene: null, videoEdit: null, uploadedVoiceUrl,
      });
    }

    // ── فصل الأمر التقني (###READY### أو ###EDIT_SCENE### أو ###VIDEO_EDIT###) عن رسالة
    // الشات — الـ JSON بقى بييجي الأول في الرد (مش الآخر) عشان لو حصل قطع من حد التوكنز
    // يقطع في الكلام مش في الـ JSON ──
    let { reply, ready, editScene, videoEdit, generateImage, generateVideo, mergeVideosPayload } = parseAgentMarkers(rawReply);

    // ✅ FIX (باج حقيقي متكرر جدًا يسبب شكاوى عملاء حقيقية — "الطلب مش بيتبعت خالص"): أحيانًا
    // رد الموديل بيوعد صراحة إنه هيبدأ التوليد ("تمام، هبدأ أولّد الفيديو دلوقتي") من غير ما
    // يحط أي ماركر تقني فعلي خالص — فمفيش أي حاجة بتتعمل، والعميل بيكرر "ابدأ"/"جرب تاني" وياخد
    // نفس الرد التأكيدي الفاضي كل مرة. لو حصل بالظبط كده (مفيش ولا ماركر واحد نجح + الرد نفسه
    // بيوعد بالتنفيذ)، بنجرب لحد مرتين تانيين فورًا بنفس الطلب + تنبيه صريح إنه لازم يحط الماركر
    // دلوقتي فعليًا أو يسأل سؤال توضيحي واحد بدل ما يكرر وعد فاضي — باج حقيقي شفناه بيصمد حتى
    // بعد محاولة واحدة (الموديل بيكرر نفس الوعد الفاضي أكتر من مرة على التوالي أحيانًا)
    // ✅ FIX (باج حقيقي: "بدأت الحركة دلوقتي" — الموديل أحيانًا بيكتب الوعد بصيغة الماضي
    // "بدأت"/"بدأ" مش بس المستقبل "هبدأ"، وده كان بيفلت من الرصد القديم فمفيش أي retry بيحصل)
    // ✅ FIX (باج حقيقي متكرر — حد الـ40 حرف بين فعل البدء وكلمة "دلوقتي" كان ضيق جدًا): رد
    // زي "هبدأ بحركة المشهد الثالث (الرجل بياخد البرفان) دلوقتي" فيه أكتر من 40 حرف بين
    // الكلمتين بسبب وصف المشهد جوه القوسين — فكان بيفلت من الكشف تمامًا (مفيش retry، مفيش
    // رسالة صريحة)، والعميل كان بياخد نفس "هبدأ دلوقتي" الفاضي من غير تنفيذ، تكرارًا كل ما
    // يقول "ابدأ" تاني. وسّعنا المسافة المسموحة (كانت 40، بقت 150) عشان توصيف قصير للمشهد
    // جوه الجملة ميفلتش من الكشف تاني
    const soundsLikeAnActionPromise = (text) => /(هبدأ|بدأت|بدأ)[^.\n]{0,150}(دلوقتي|الآن|حالا|حالاً)|\bi'?ll start\b[^.\n]{0,150}\bnow\b|\b(started|starting) (right )?now\b/i.test(text);
    // ✅ NEW (باج حقيقي منفصل تمامًا عن "الوعد الفاضي" فوق): العميل يأكد ("ابدأ")، والايجنت
    // بيرد بنفس سؤال التأكيد تاني (أو سؤال تأكيد تاني) من غير ما يحط أي ماركر خالص — مش
    // "هبدأ دلوقتي" فاضي، ده "جاهز أبدأ؟" بيتكرر في حلقة لا نهائية، وأزرار "ابدأ/لأ" السريعة
    // (راجع awaitingConfirmation تحت) كانت بتخلي الحلقة دي تحس إنها طبيعية بدل ما تتكشف كباج
    const looksLikeConfirmationQuestion = (text) => !!text && /(جاهز[ةه]?[^.\n]{0,20}[؟?]|تمام[^.\n]{0,15}(هبدأ|نبدأ|ابدأ)[^.\n]{0,15}[؟?]|(هبدأ|نبدأ|ابدأ)[^.\n]{0,15}[؟?]|ready to (generate|start|proceed)|shall i (start|proceed|generate)|should i (start|proceed|generate)|want me to (start|proceed|generate)|go ahead\?)/i.test(text);
    const userJustConfirmed = /^(ابدأ|ابدا|ابدت|يلا\s*ابدأ|اه|ايوه|تمام|yes|ok|okay|go|start|proceed)[.!\s]*$/i.test(String(message || '').trim());
    // العميل أكّد فعلاً في الرسالة دي، والرد رجع سؤال تأكيد تاني من غير أي ماركر — نفس عرض
    // "مفيش تنفيذ حقيقي حصل" اللي soundsLikeAnActionPromise بيكشفه، بس بشكل مختلف
    const stuckReaskingConfirmation = (text) => userJustConfirmed && looksLikeConfirmationQuestion(text);
    // ✅ NEW (باج حقيقي جديد شافه العميل بالسكرين شوت — العميل زهق تمامًا منه): بالظبط نفس رد
    // "تمام، هبدأ أعمل الصورة الأولى من القصة (مشهد الفجر) بنفس الشخصية." اتكرر حرفيًا مرتين
    // متتاليتين بعد ضغط "ابدأ" مرتين، من غير أي ماركر خالص. الجملة دي أفلتت من كل الكواشف
    // الموجودة فوق: مالهاش "دلوقتي/الآن" (فمتصادتش بـ soundsLikeAnActionPromise) ومالهاش علامة
    // استفهام (فمتصادتش بـ stuckReaskingConfirmation) — يعني وعد فاضي بالتنفيذ يفضل يتكرر حرفيًا
    // من غير ما يتكشف كباج خالص. الكشف هنا مختلف عمدًا: مش محتاج "دلوقتي" ولا "؟"، بس العميل يكون
    // أكّد فعلاً (userJustConfirmed) والرد يبدأ بجملة وعد صريحة بالتنفيذ
    // ⚠️ باج حقيقي كان هنا وقت الكتابة: \b في الآخر مش شغال مع العربي خالص — الحروف العربية
    // مش \w في JS، فـ\b بين حرف عربي وأي حاجة تانية (مسافة/نهاية السترينج) مبيتحققش أبدًا،
    // فالـregex كان بيفشل يمسك حتى "هبدأ" لوحدها. الحل: شلنا الـ\b تمامًا (مش محتاجينه، إحنا
    // بس بنتأكد إن الرد يبدأ بالكلمة دي، مش إنها كلمة منفصلة بالظبط)
    const saysStartingDeclaratively = (text) => userJustConfirmed && /^\s*(تمام[،,]?\s*)?(ه(بدأ|عمل|ولّد|جهز|حرك|ركب)|سأ(بدأ|عمل)|starting|i'?ll start|i will start|let'?s start)/i.test(String(text || '').trim());
    // ✅ FIX (باج حقيقي — طلب العميل: إعلان مفصّل بـ4 مشاهد ثابتة المنتج/المكان اتقفل برسالة
    // "مش قادر أبدأ التوليد" من غير أي محاولة retry خالص): كان شرط الحلقة تحت بيتطلب
    // reply.length < 300 عشان يعتبر الرد "وعد فاضي" — بس رد مفصّل لطلب معقد (زي إعادة صياغة
    // خطة الـ4 مشاهد قبل ما ينسى يحط الماركر) بيبقى غالبًا أطول من 300 حرف، فالحلقة تحت كانت
    // بتتجاهله تمامًا (شرطها مايتحققش)، بينما الفحص الأخير (تحت) اللي بيستبدل الرد برسالة
    // الاعتذار الجاهزة مالوش نفس قيد الطول — فالنتيجة: رد طويل واعد بالتنفيذ من غير ماركر كان
    // بيروح على طول لرسالة الاعتذار من غير ما ياخد ولا فرصة تصحيح واحدة. شلنا قيد الطول تمامًا؛
    // كشف "بيوعد بالتنفيذ" نفسه (regex أعلاه) دقيق بما يكفي بغض النظر عن طول الرد
    const MAX_NUDGE_RETRIES = 3;
    let nudgeAttempts = 0;
    while (
      !ready && !editScene && !videoEdit && !generateImage && !generateVideo && !mergeVideosPayload &&
      (soundsLikeAnActionPromise(reply) || stuckReaskingConfirmation(reply) || saysStartingDeclaratively(reply)) && nudgeAttempts < MAX_NUDGE_RETRIES
    ) {
      nudgeAttempts++;
      console.warn(`[Agent] Reply promised to start generating (or re-asked for confirmation the customer already gave) but included no technical marker — retry ${nudgeAttempts}/${MAX_NUDGE_RETRIES} with an explicit nudge`);
      try {
        const nudgedHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }];
        const nudgeMessage = '(system reminder: the customer already confirmed (or your previous reply said you were about to start generating), but your last reply either repeated the same confirmation question again or promised to start without including the required technical marker — so nothing actually happened and the customer is still waiting with no result. In THIS reply you must either include the real marker now with everything needed to execute it, based on what has already been discussed and confirmed, or ask exactly one specific clarifying question if something is genuinely still missing — never repeat the same or another confirmation question again, and never repeat a vague "starting now" acknowledgement again. If the customer already fully described a multi-scene plan (e.g. several scenes with a consistent product/character/location) or already confirmed a merge/animation/generation plan, do NOT re-explain, re-confirm, or recap that plan back to them again — you already have everything needed and they already said yes, so just emit the marker right now, with at most one short sentence stating the cost so far. Re-asking or re-describing instead of acting on it is exactly the mistake that caused this retry.)';
        const retryRawReply = await agentChat({
          message: nudgeMessage, history: nudgedHistory, attachmentNote, userPlan, isAdminUser,
          hasPhoto: images.length > 0 || !!photoAlreadyUploaded,
          hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
          hasVideo: !!videoAlreadyUploaded,
          videoDurationSec: videoDurationSec || null,
          hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits, mediaLedger,
        });
        if (retryRawReply && retryRawReply.trim()) {
          ({ reply, ready, editScene, videoEdit, generateImage, generateVideo, mergeVideosPayload } = parseAgentMarkers(retryRawReply));
        } else {
          break; // رد فاضي — منستحملش نلف تاني على نفس الفراغ
        }
      } catch (e) {
        console.warn('[Agent] Retry-with-nudge failed:', e.message);
        break;
      }
    }
    // ✅ NEW (طلب العميل: "ممنوع الايجينت يقول رسالة الاعتذار تاني — لازم اجباري المشاهد
    // تتعمل"): لو كل الـMAX_NUDGE_RETRIES العادية فشلت ولسه مفيش أي ماركر، قبل ما نستسلم
    // خالص لرسالة الاعتذار، بنجرب محاولة إنقاذ أخيرة واحدة بمجهود تفكير أعلى (نفس مستوى
    // الخطط المدفوعة — راجع forceStrongerModel/reasoning_effort في agentService.js) مع
    // تعليمة حاسمة إنه يخترع أي تفصيلة إبداعية ناقصة بنفسه (موضوع مشهد، ستايل، إلخ) بدل ما
    // يسأل أو يوعد وعد فاضي تاني — محاولة واحدة نادرة بس قبل أي رسالة اعتذار. ✅ FIX: كانت
    // بترفع الموديل لـqwen3.8-27b الغالي جدًا ($4/مليون توكن إخراج) — العميل أكّد إن الباج ده
    // بالظبط بيحصل على الخطة المدفوعة (اللي أصلاً بتستخدم qwen)، يعني رفع الموديل مش هيحل حاجة
    // ومكلف زيادة من غير أي فايدة حقيقية؛ دلوقتي بيرفع مجهود التفكير بس (نفس gpt-oss-120b)
    if (!ready && !editScene && !videoEdit && !generateImage && !generateVideo && !mergeVideosPayload && (soundsLikeAnActionPromise(reply) || stuckReaskingConfirmation(reply) || saysStartingDeclaratively(reply))) {
      console.warn('[Agent] All nudge retries exhausted with the normal model — attempting one final rescue with the stronger model');
      try {
        const rescueHistory = [...history, { role: 'user', content: message }, { role: 'assistant', content: reply }];
        const rescueMessage = '(system reminder: you have now failed multiple times in a row to include the required technical marker, even after being told explicitly to include it. The customer is frustrated and has been waiting with nothing happening. This is your absolute last chance in this exchange — you must emit the real marker right now with everything it needs to execute. If any creative detail is still genuinely missing (e.g. the exact subject/style of a scene), invent a specific, reasonable one yourself right now instead of asking — never ask another clarifying question and never repeat a "starting now" acknowledgement without the marker again. Output the marker now.)';
        const rescueRawReply = await agentChat({
          message: rescueMessage, history: rescueHistory, attachmentNote, userPlan, isAdminUser,
          hasPhoto: images.length > 0 || !!photoAlreadyUploaded,
          hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
          hasVideo: !!videoAlreadyUploaded,
          videoDurationSec: videoDurationSec || null,
          hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits, mediaLedger,
          forceStrongerModel: true,
        });
        if (rescueRawReply && rescueRawReply.trim()) {
          ({ reply, ready, editScene, videoEdit, generateImage, generateVideo, mergeVideosPayload } = parseAgentMarkers(rescueRawReply));
        }
      } catch (e) {
        console.warn('[Agent] Final rescue attempt (stronger model) failed:', e.message);
      }
    }
    // ✅ FIX: لو بعد كل المحاولات لسه مفيش أي ماركر ناجح والرد لسه بيوعد بالتنفيذ — منسيبش
    // العميل يفتكر إن التوليد بدأ فعلاً وهو ما بدأش. رسالة صريحة بدل الوعد الكاذب، عشان
    // العميل يعرف يعيد صياغة الطلب بدل ما يستنى نتيجة مش هتيجي
    if (!ready && !editScene && !videoEdit && !generateImage && !generateVideo && !mergeVideosPayload && (soundsLikeAnActionPromise(reply) || stuckReaskingConfirmation(reply) || saysStartingDeclaratively(reply))) {
      // ✅ NEW: بنسجل الرد الخام كامل هنا (مش بس تحذير عام) — عشان لو المشكلة رجعت تاني نقدر
      // نشوف بالظبط الموديل كان قاعد يقول ايه في Railway logs، بدل ما نخمّن السبب من غير أي
      // دليل حقيقي (زي ما حصل مع فيكس سابق اتضح إنه مش بيغطي كل الحالات)
      console.error('[Agent] Still no marker after all retries — full raw reply for diagnosis:', JSON.stringify(reply));
      // ✅ FIX: كان بيمسح رد الموديل كله ويستبدله برسالة عامة حتى لو الموديل كتب فعلاً سبب حقيقي
      // (زي تردد بخصوص تفصيلة معينة في الطلب) جنب جملة الوعد الفاضي — فكنا بنضيع أي تفسير حقيقي
      // كتبه الموديل بنفسه ويبقى مفيش أي دليل ليه رفض. دلوقتي: بدل ما نحاول نشيل جملة الوعد
      // بالظبط (حاجز حرفي كان جزء من سبب باج المسافة اللي فوق)، بنحكم على طول الرد كله — رد
      // قصير غالبًا هو بس جملة الوعد الفاضية نفسها، رد أطول يبقى فيه على الأرجح محتوى حقيقي
      // تاني يستاهل يتحفظ بدل ما يتمسح.
      // ✅ FIX (باج حقيقي كان هيصمد حتى بعد فيكس stuckReaskingConfirmation فوق): سؤال التأكيد
      // المتكرر ("...التكلفة 115 كريديت. جاهز أبدأ؟") بيبقى غالبًا أطول من 150 حرف لوحده (فيه
      // ملخص التكلفة كامل جواه) — يعني قيد الطول ده كان هيسيبه زي ما هو من غير ما يتستبدل،
      // فالعميل كان هيشوف نفس سؤال التأكيد المعاد تاني بعد كل الـretries، ونفس زرار "ابدأ"
      // هيفضل يظهر من غير ما الحلقة تتكسر فعليًا. عكس "الوعد الفاضي" (ممكن يحمل معلومة حقيقية
      // جنبه تستاهل تتحفظ)، سؤال تأكيد اتكرر مالوش أي قيمة إضافية بغض النظر عن طوله — نستبدله
      // دايمًا، مش بس لما يكون قصير
      if (stuckReaskingConfirmation(reply) || reply.length < 150) {
        reply = stuckReaskingConfirmation(reply)
          ? 'معلش، حاولت أبدأ التنفيذ بعد تأكيدك بس مش قادر أوتوماتيك دلوقتي — ممكن تبعت "ابدأ" تاني أو تكرر طلبك بوضوح أكتر؟'
          : 'معلش، مش قادر أبدأ التوليد أوتوماتيك دلوقتي — ممكن تكرر طلبك بوضوح أكتر (مثلاً تحدد بالظبط عايز تعمل ايه)؟';
      }
    }
    // ✅ حماية إضافية: أي ماركر تاني ظل موجود جوه reply (الموديل حط أكتر من ماركر في نفس
    // الرد) بيتشال هنا قبل ما نكمل — راجع تعليق stripStrayMarkers فوق
    reply = stripStrayMarkers(reply);

    // ✅ لو المستخدم رفع صوت في نفس الرسالة اللي وصلنا فيها READY، نرفق رابط الصوت الحقيقي
    // عشان الفرونت إند يستخدمه كـ narration فعلي بدل ما يولّد صوت صناعي جديد
    if (ready && uploadedVoiceUrl) {
      ready.uploadedVoiceUrl = uploadedVoiceUrl;
    }

    // ✅ NEW: أي رابط الايجنت "نسخه" بنفسه من الـ history (مش رابط جينا إحنا بيه من السيرفر)
    // لازم يتأكد إنه رابط حقيقي فعلاً ظهر قبل كده، دفاعًا ضد رابط مبتور بسبب انقطاع الرد
    const knownUrls = extractKnownUrls(history, mediaLedger);
    const isKnownUrl = (u) => typeof u === 'string' && knownUrls.has(u.trim());

    // ✅ NEW: توليد صور مستقل بيستخدم صور مرفقة في نفس الرسالة كمرجع بصري لو موجودة — لو
    // الايجنت نفسه حط "referenceImageUrls" في الماركر (روابط صور اتولدت قبل كده في المحادثة،
    // مثلاً صورة شخصية عشان يستخدمها كمرجع لمشاهد جديدة)، بنسيبها زي ما هي ونضيفلها أي صور
    // مرفقة في نفس الرسالة كمان (مش نستبدلها)
    if (generateImage) {
      const fromHistory = Array.isArray(generateImage.referenceImageUrls) ? generateImage.referenceImageUrls.filter(u => typeof u === 'string' && u.trim() && isKnownUrl(u)) : [];
      const combined = [...fromHistory, ...images];
      if (combined.length) generateImage.referenceImageUrls = combined.slice(0, 14);
      // ✅ NEW: تنضيف "prompts" (مشاهد مختلفة في نفس الماركر) قبل ما توصل للراوت — لو مش
      // مصفوفة صحيحة (أقل من برومبتين مختلفين)، بنشيلها عشان ترجع للمسار العادي (prompt+count)
      const distinctPrompts = Array.isArray(generateImage.prompts) ? generateImage.prompts.filter(p => typeof p === 'string' && p.trim()).slice(0, 20) : [];
      if (distinctPrompts.length >= 2) generateImage.prompts = distinctPrompts;
      else delete generateImage.prompts;
      // ✅ NEW (طلب العميل: "لازم يكون في ذكاء" — كل مشهد يقرر لوحده محتاج مرجع ولا لأ، وأي
      // مرجع بالظبط، بدل ما كل المشاهد تاخد نفس المرجع/تتسلسل تلقائيًا على بعضها): "scenes"
      // شكل بديل لـ"prompts" — كل عنصر بيحدد referenceImageUrls الخاصة بيه (ممكن تبقى فاضية
      // تمامًا لو المشهد مش محتاج أي ثبات بصري) و/أو useScenesAsReference (مؤشرات لمشاهد
      // سابقة في نفس الدفعة، الصورة الحقيقية اللي اتولدتلها بتتضاف كمرجع إضافي — مش كل
      // المشاهد اللي قبلها تلقائيًا زي المسار القديم، بس اللي الايجنت شافها فعلاً لازمة).
      // تنضيف مشابه لـ"prompts" فوق بالظبط: لو أقل من مشهدين نشيلها، وكل referenceImageUrls
      // بره الدفعة (روابط من الـhistory) لازم تتأكد إنها روابط حقيقية زي أي حتة تانية
      if (Array.isArray(generateImage.scenes)) {
        const cleanedScenes = generateImage.scenes
          .filter(s => s && typeof s.prompt === 'string' && s.prompt.trim())
          .slice(0, 20)
          .map((s, idx) => {
            const ownRefs = Array.isArray(s.referenceImageUrls)
              ? s.referenceImageUrls.filter(u => typeof u === 'string' && u.trim() && isKnownUrl(u))
              : [];
            const chainIdxs = Array.isArray(s.useScenesAsReference)
              ? s.useScenesAsReference.filter(i => Number.isInteger(i) && i >= 0 && i < idx)
              : [];
            return { prompt: s.prompt.trim(), referenceImageUrls: ownRefs, useScenesAsReference: chainIdxs };
          });
        if (cleanedScenes.length >= 2) generateImage.scenes = cleanedScenes;
        else delete generateImage.scenes;
      }
      // ✅ FIX (باج حقيقي — سكرين شوت العميل: طلب مشاهد عن قطز، مشهد 3 طلع عن هولاكو ومشهد 4
      // عن "شخص غريب"، وسطر عربي على لفافة في مشهد تاني طلع نص مختلف تمامًا عما كتبه العميل):
      // لما فيه سكريبت متقسم حقيقي اتلقط بكود عادي (structuredScenesResult — راجع تعليق
      // "PURE PARSER" فوق)، الـstructuredNote كان بس بيقول للموديل "فيه N مشهد، متلخصهمش" من
      // غير ما يديله نص المشاهد الحقيقي أصلاً يقرا/ينسخ منه — فكان لسه مضطر يرجع لرسالة العميل
      // الخام ويحاول "يستخرج"/يعيد كتابة كل مشهد بنفسه، وده بالظبط السلوك الغير موثوق اللي
      // الـparser اتعمل أصلاً عشان يتجنبه (تلخيص/هلوسة/استبدال محتوى بمحتوى تاني تمامًا).
      // الحل الحقيقي: بعد ما الماركر يتحلل بالكامل، نستبدل نص كل مشهد بالنص الحقيقي المستخرج
      // بالـregex مباشرة (حاجز حتمي في الكود، زي أي حاجز تاني في الملف ده) — مش نثق في نسخة
      // الموديل خالص حتى لو شكلها صح، لأن مفيش ضمان إنها مطابقة للأصل فعلاً
      if (generateImage && structuredScenesResult && structuredScenesResult.length >= 2) {
        // ✅ سقف 20 هنا كمان (زي أي حتة تانية في الملف ده بتحط سقف الدفعة) — الاستبدال ده ميقدرش
        // يتخطى سقف الـMAX_BATCH العادي حتى لو السكريبت الملزوق فيه فقرات/مشاهد أكتر من 20
        const realPrompts = structuredScenesResult.map(s => s.visual).filter(v => v && v.trim()).slice(0, 20);
        if (realPrompts.length >= 2) {
          // ✅ NEW (طلب العميل — سكرين شوت: آخر مشهدين المفروض يكونوا نفس المكان والشخصية بس
          // طلعوا مختلفين بصريًا، والعميل قال "ده الي بيتطلب اضافة مشهد كمرجع"): سكريبتات
          // زي دي غالبًا بتوصف الشخصية/المكان بالكامل في أول مشهد بس، وبعدين تكتفي بعبارة
          // زي "(full description as above)" في المشاهد اللي بعدها بدل ما تعيد الوصف — يعني
          // السكريبت نفسه بيقول بوضوح إن المشاهد دي لازم ترجع لمشهد سابق. وصف نصي متكرر لوحده
          // مش كفاية للثبات البصري (صورتين مستقلتين من نفس الوصف ممكن يطلعوا مختلفين) — لازم
          // مرجع صورة حقيقي. بنكشف عبارات "رجوع لوصف سابق" هنا (إنجليزي/عربي)، ولو لقينا، بنبني
          // "scenes" (بدل "prompts" المسطحة) بربط تلقائي (useScenesAsReference) لآخر "مشهد
          // مرساة" (anchor) قبله — آخر مشهد وصف حاجة بالكامل من غير ما يرجع هو نفسه لحاجة قبله.
          // كده كل مشهد بيرجع؛ للوصف الأصلي الصح (مش بالضرورة المشهد اللي قبله مباشرة لو فيه
          // أكتر من شخصية/مكان في نفس السكريبت)
          const REUSE_MARKER_RE = /\(?\s*(?:full |exact |same )?description\s+as\s+above\s*\)?|\bas\s+(?:described|shown|mentioned)\s+(?:earlier|above|before)\b|\bsame\s+(?:character|person|subject|location|place|setting|scene)\b|\b(?:same as|identical to)\s+(?:before|earlier|above)\b|نفس\s*(?:الشخصية|المكان|الوصف|القاعة|المشهد)|زي\s*ما\s*(?:اتوصف|قلنا|ذكرنا)\s*(?:فوق|قبل\s*كده|سابقًا)|كما\s*(?:وصفنا|ذكرنا)\s*(?:سابقًا|فوق)/i;
          let anchorIdx = null;
          const chains = realPrompts.map((p, i) => {
            const isReuse = REUSE_MARKER_RE.test(p);
            const useScenesAsReference = (isReuse && anchorIdx !== null) ? [anchorIdx] : [];
            if (!isReuse) anchorIdx = i;
            return useScenesAsReference;
          });
          const anyChaining = chains.some(c => c.length > 0);

          if (anyChaining) {
            generateImage.scenes = realPrompts.map((p, i) => {
              const existing = Array.isArray(generateImage.scenes) ? generateImage.scenes[i] : null;
              const ownRefs = existing && Array.isArray(existing.referenceImageUrls) ? existing.referenceImageUrls.filter(u => typeof u === 'string' && u.trim() && isKnownUrl(u)) : [];
              return { prompt: p, referenceImageUrls: ownRefs, useScenesAsReference: chains[i] };
            });
            delete generateImage.prompts;
            console.warn(`[Agent] Auto-detected recurring character/location reuse phrasing in the pasted script — auto-chained ${chains.filter(c => c.length).length} scene(s) to their anchor scene for visual consistency`);
          } else if (Array.isArray(generateImage.scenes) && generateImage.scenes.length) {
            const n = Math.min(generateImage.scenes.length, realPrompts.length);
            if (generateImage.scenes.length !== realPrompts.length) {
              console.warn(`[Agent] GENERATE_IMAGE "scenes" count (${generateImage.scenes.length}) didn't match the real parsed script scene count (${realPrompts.length}) — overriding prompt text for the first ${n} matching entries only`);
            }
            for (let i = 0; i < n; i++) generateImage.scenes[i].prompt = realPrompts[i];
          } else if (Array.isArray(generateImage.prompts)) {
            if (generateImage.prompts.length !== realPrompts.length) {
              console.warn(`[Agent] GENERATE_IMAGE "prompts" count (${generateImage.prompts.length}) didn't match the real parsed script scene count (${realPrompts.length}) — replacing entirely with the real parsed scenes`);
            }
            generateImage.prompts = realPrompts;
          }
        }
      }
    }
    // ✅ FIX (باج حقيقي متكرر رغم الحاجز القديم هنا: عميل بعت برومبت كامل بعناوين "Monster
    // design:"/"Warriors design:"/"Timeline:" وتايم لاين "0-5s:"/"5-10s:" — مكانش بيتلقط لأن
    // الحاجز القديم كان بيدوّر بس على "STYLE:"/"CHARACTER N:"/"COLOR PALETTE:"/"COMPOSITION:"
    // حرفيًا. كمان كان بيفحص رسالة العميل الحالية بس — لو العميل بعت البرومبت الكامل في رسالة،
    // وبعدين وافق "تمام"/"ابدأ" في رسالة تانية، الحاجز القديم مكانش بيلاقي البرومبت خالص لأنه
    // مش في الرسالة الحالية. الحل: (1) توسيع الكشف لأي عنوان قسم "Word:" لوحده في سطر، أو
    // تايم لاين رقمي "N-Ns:"، أو نص طويل جدًا متعدد الفقرات (مش بس الكلمات الأربعة القديمة)،
    // (2) البحث كمان في آخر رسائل العميل في الـhistory لو الرسالة الحالية نفسها مش هي البرومبت
    // ✅ FIX (باج حقيقي رصده مراجعة كود لاحقة لنفس الحاجز فوق): الشرط القديم كان بيكفي "عنوان
    // قسم واحد بس" (زي "Note:" عرضية جوه رسالة عادية طويلة) عشان يصنّف رسالة كاملة عادية كأنها
    // برومبت جاهز — دلوقتي محتاج عنوانين قسم (أو تايم لاين مرتين) على الأقل، مش واحد بس، عشان
    // نتأكد إنه هيكل حقيقي متكرر (زي "Monster design:"/"Warriors design:"/"Timeline:") مش سطر عرضي
    const looksLikeCompleteGenerationPrompt = (text) => {
      if (!text || text.trim().length < 200) return false;
      if (/\b(STYLE|CHARACTER\s*\d|COLOR PALETTE|COMPOSITION)\s*:/i.test(text)) return true;
      if ((text.match(/^\s*[A-Za-z][A-Za-z '\/-]{2,30}:\s*$/gm) || []).length >= 2) return true; // 2+ section headings each alone on their line
      if ((text.match(/^\s*\d{1,3}\s*[-–]\s*\d{1,3}\s*s\s*:/gm) || []).length >= 2) return true; // 2+ "0-5s:" timeline beats
      return text.trim().length >= 400 && (text.match(/\n/g) || []).length >= 3; // long, structured multi-paragraph text
    };
    // ✅ FIX (باج حقيقي تاني من نفس المراجعة): كان بيدوّر 8 رسايل لورا من غير أي فحص صلة —
    // برومبت قديم لمشهد سابق كان ممكن يتطبق غلط على طلب جديد مختلف تمامًا. دلوقتي بيوقف البحث
    // فورًا أول ما يلاقي رسالة قديمة طويلة (>150 حرف) مش هي نفسها برومبت كامل — طول كده يبقى
    // على الأغلب طلب تاني مختلف اتحط في النص، مش مجرد تأكيد قصير ("تمام"/"ابدأ"/"لا مش عايز صور")
    let rawPromptOverride = looksLikeCompleteGenerationPrompt(message) ? message.trim() : null;
    if (!rawPromptOverride && Array.isArray(history)) {
      for (let i = history.length - 1; i >= 0 && i >= history.length - 8; i--) {
        const h = history[i];
        if (h?.role !== 'user' || typeof h.content !== 'string') continue;
        if (looksLikeCompleteGenerationPrompt(h.content)) { rawPromptOverride = h.content.trim(); break; }
        if (h.content.trim().length > 150) break; // رسالة تانية جوهرية اتحطت في النص — بلاش نكمل لورا
      }
    }
    if (rawPromptOverride) {
      if (generateImage && typeof generateImage.prompt === 'string' && generateImage.prompt.trim().length < rawPromptOverride.length * 0.7) {
        console.warn('[Agent] GENERATE_IMAGE prompt looked shortened vs a customer-supplied complete prompt — overriding with the raw message');
        generateImage.prompt = rawPromptOverride;
      }
      if (generateVideo && typeof generateVideo.prompt === 'string' && generateVideo.prompt.trim().length < rawPromptOverride.length * 0.7) {
        console.warn('[Agent] GENERATE_VIDEO prompt looked shortened vs a customer-supplied complete prompt — overriding with the raw message');
        generateVideo.prompt = rawPromptOverride;
      }
    }
    // ✅ حاجز إضافي في الكود نفسه: لو المستخدم فرض موديل يدويًا من picker، نضمن استخدامه بالظبط حتى
    // لو الايجنت (الموديل نفسه) تجاهل التعليمة اللي فوق لأي سبب
    if (generateImage && forcedImageModel && NEW_IMAGE_MODELS[forcedImageModel]) {
      generateImage.model = forcedImageModel;
    }
    if (generateVideo && forcedVideoModel && NEW_VIDEO_MODELS[forcedVideoModel]) {
      generateVideo.model = forcedVideoModel;
    }
    // ✅ NEW (باج حقيقي: عميل كتب "wan 3.0" بالنص العادي في الشات — مفيش أي picker في صفحة
    // الشات العامة دي، بس forcedVideoModel/forcedImageModel فوق بيتفعّلوا بس من قيمة جاية من
    // الفرونت إند (اختيار من واجهة)، مش من تحليل نص الرسالة. لو العميل اسم موديل صراحة بالنص
    // والايجنت استخدم موديل تاني، نصححها هنا بدل ما نصدّق اختيار الايجنت العشوائي)
    // ✅ FIX (باج حقيقي تاني من نفس المراجعة): (1) "p[\s_-]*video" من غير \b قبل الـp كانت
    // بتتطابق مع أي كلمة عادية بتخلص بحرف p ومتبوعة بـ"video" (زي "clip video 2")، دلوقتي
    // محتاجة حدود كلمة حقيقية. (2) الدالة كانت بترجع أول تطابق بترتيب المصفوفة الثابت من غير
    // فحص تعارض — لو العميل كتب "متستخدمش seedance، استخدم wan" كانت هترجع seedance (غلط) لأنه
    // مذكور في نص الرسالة وترتيبه أسبق في المصفوفة. دلوقتي: لو لقينا أكتر من موديل مختلف مذكور
    // في نفس النص، منرجعش حاجة خالص (نسيب اختيار الايجنت زي ما هو) بدل ما نخمّن أنهي واحد يقصد
    const detectExplicitVideoModelMention = (text) => {
      if (!text) return null;
      const t = text.toLowerCase();
      // ✅ كل نمط ليه "عيلة" (نفس عيلة الموديل) — نماذج متداخلة زي seedance_2_0_fast/
      // seedance_2_0 بيتطابقوا مع بعض عمدًا (ده مقصود، أول تطابق بترتيب المصفوفة بيحسم أنهي
      // نسخة بالظبط)، فمش ده اللي بيعتبر "لبس" — اللبس الحقيقي هو لما عيلتين مختلفتين
      // (زي seedance وwan) يتطابقوا مع بعض في نفس النص، هنا بس منرجعش حاجة (نسيب اختيار الايجنت)
      const patterns = [
        ['seedance', /seedance[\s_-]*2[.\s_-]*0[\s_-]*fast/, 'seedance_2_0_fast'],
        ['seedance', /seedance[\s_-]*1[\s_-]*pro[\s_-]*fast/, 'seedance_1_pro_fast'],
        ['seedance', /seedance[\s_-]*2[.\s_-]*5/, 'seedance_2_5'],
        ['seedance', /seedance[\s_-]*2[.\s_-]*0/, 'seedance_2_0'],
        ['seedance', /seedance[\s_-]*1[.\s_-]*5/, 'seedance_1_5'],
        ['wan', /\bwan[\s_-]*3(\.0)?\b/, 'wan_3'],
        ['veo', /veo[\s_-]*3?(\.1)?[\s_-]*fast/, 'veo3_fast'],
        ['veo', /veo[\s_-]*3?(\.1)?[\s_-]*lite/, 'veo3_lite'],
        ['veo', /\bveo[\s_-]*3\b/, 'veo3_standard'],
        ['kling', /kling[\s_-]*2[.\s_-]*5/, 'kling_2_5'],
        ['kling', /kling[\s_-]*2[.\s_-]*1/, 'kling_2_1'],
        ['kling', /kling[\s_-]*3(\.0)?[\s_-]*omni/, 'kling_3_0_omni'],
        ['luma', /luma[\s_-]*ray[\s_-]*2[\s_-]*540/, 'luma_ray2_540p'],
        ['luma', /luma[\s_-]*ray[\s_-]*2[\s_-]*720/, 'luma_ray2_720p'],
        ['pixverse', /pixverse/, 'pixverse_v4_5'],
        ['pvideo', /\bp[\s_-]+video[\s_-]*2\b/, 'prunaai_p_video_2'],
        ['pvideo', /(prunaai|\bp[\s_-]+video\b)/, 'prunaai_p_video'],
        ['omni', /(omni[\s_-]*flash|gemini[\s_-]*omni)/, 'omni_flash_1_1'],
        ['lucy', /lucy[\s_-]*edit/, 'decart_lucy_edit_2'],
      ];
      const familiesFound = new Set();
      let primaryKey = null;
      for (const [family, re, key] of patterns) {
        if (re.test(t) && NEW_VIDEO_MODELS[key]) {
          familiesFound.add(family);
          if (primaryKey === null) primaryKey = key;
        }
      }
      return familiesFound.size === 1 ? primaryKey : null;
    };
    if (generateVideo && !forcedVideoModel) {
      const mentionedModel = detectExplicitVideoModelMention(message) || detectExplicitVideoModelMention(rawPromptOverride);
      if (mentionedModel && generateVideo.model !== mentionedModel) {
        console.warn(`[Agent] Customer explicitly named "${mentionedModel}" in text but the agent picked "${generateVideo.model}" — overriding to the customer's real choice`);
        generateVideo.model = mentionedModel;
      }
    }
    // ✅ NEW: باقي الحقول اللي الايجنت بينسخها من الـ history حرفيًا (مش السيرفر هو اللي جابها) —
    // نفس التحقق: لو الرابط مش موجود بالظبط في الـ history، نرفضه بدل ما نبعته لـ API مضمون يفشل
    if (ready?.animateImageUrl && !isKnownUrl(ready.animateImageUrl)) {
      console.warn('[Agent] Rejected unknown/corrupted animateImageUrl (not found in history), falling back to most recent image');
      delete ready.animateImageUrl;
    }
    if (generateVideo?.sourceVideoUrl && !isKnownUrl(generateVideo.sourceVideoUrl)) {
      console.warn('[Agent] Rejected unknown/corrupted sourceVideoUrl (not found in history)');
      delete generateVideo.sourceVideoUrl;
    }
    if (generateVideo?.imageUrl && !isKnownUrl(generateVideo.imageUrl)) {
      console.warn('[Agent] Rejected unknown/corrupted imageUrl (not found in history)');
      delete generateVideo.imageUrl;
    }
    // ✅ NEW: المدخلات المرجعية (صور/فيديو مرجعي/آخر فريم) — نفس مبدأ isKnownUrl فوق بالظبط (الايجنت
    // بينسخ الروابط من الـhistory، لازم تكون موجودة فعلاً)، ولو الموديل مش بيدعمها بنشيلها بدل ما
    // نبعت طلب مضمون يفشل
    if (generateVideo) {
      const rc = NEW_VIDEO_MODELS[generateVideo.model]?.refCaps;
      const keepKnown = (v, max) => (Array.isArray(v) ? v : []).filter(u => typeof u === 'string' && isKnownUrl(u)).slice(0, max || 0);
      generateVideo.referenceImageUrls = keepKnown(generateVideo.referenceImageUrls, rc?.images);
      generateVideo.referenceVideoUrls = keepKnown(generateVideo.referenceVideoUrls, rc?.videos);
      delete generateVideo.referenceAudioUrls; // الصوت المرجعي مش مربوط بالشات لسه
      if (!(rc?.lastFrame && typeof generateVideo.lastFrameUrl === 'string' && isKnownUrl(generateVideo.lastFrameUrl) && generateVideo.imageUrl)) delete generateVideo.lastFrameUrl;
      // seedance_2_5: الـschema بتمنع الجمع بين أول/آخر فريم وأي مرجع — المرجع يكسب
      if (generateVideo.model === 'seedance_2_5' && (generateVideo.referenceImageUrls.length || generateVideo.referenceVideoUrls.length)) {
        delete generateVideo.imageUrl; delete generateVideo.lastFrameUrl;
      }
    }
    // ✅ FIX (باج حقيقي: صورة اتعملت 16:9، والعميل قال "حرك الصورة دي" من غير ما يكرر
    // النسبة، فالفيديو الناتج طلع 9:16 — الايجنت (الموديل نفسه) اعتمد على تخمينه الافتراضي
    // بدل ما ياخد بالفعل نسبة الصورة الحقيقية من الـ history، رغم التعليمة الصريحة في
    // البرومبت): حاجز إضافي في الكود نفسه، بنفس مبدأ forcedImageModel/isKnownUrl فوق —
    // نفرض نسبة الصورة الحقيقية المصدر بغض النظر عمّا حطّه الايجنت في الماركر
    if (generateVideo?.imageUrl) {
      const sourceRatioMatch = history.find(m => typeof m?.content === 'string' && m.content.includes(generateVideo.imageUrl))?.content?.match(/\(aspect ratio: (\d{1,2}:\d{1,2})\)/);
      if (sourceRatioMatch) generateVideo.aspectRatio = sourceRatioMatch[1];
      // ✅ NEW: نفس الحاجز فوق، بس لصورة اترفعت في نفس الرسالة الحالية (لسه مش موجودة في
      // الـ history لحد دلوقتي — لو العميل رفع صورة وطلب يحركها في نفس الرسالة من غير خطوة تأكيد)
      else if (uploadedPhotoRatioByUrl.has(generateVideo.imageUrl)) {
        generateVideo.aspectRatio = uploadedPhotoRatioByUrl.get(generateVideo.imageUrl).videoRatio;
      }
    }
    // ✅ NEW: تنضيف حقول السرد/الكابشن/الموسيقى الجديدة قبل ما توصل للراوت
    if (generateVideo) {
      if (typeof generateVideo.narrationScript !== 'string' || !generateVideo.narrationScript.trim()) {
        delete generateVideo.narrationScript;
        delete generateVideo.addCaptions; // كابشن محتاج سرد حقيقي، مفيش سرد يبقى مفيش كابشن
      } else {
        generateVideo.narrationScript = generateVideo.narrationScript.trim().slice(0, 4000);
        generateVideo.addCaptions = generateVideo.addCaptions === true;
      }
      if (!['youtube', 'general'].includes(generateVideo.musicStyle)) delete generateVideo.musicStyle;
      if (typeof generateVideo.musicMood !== 'string') delete generateVideo.musicMood;
    }
    if (mergeVideosPayload) {
      const validUrls = mergeVideosPayload.videoUrls.filter(isKnownUrl);
      if (validUrls.length >= 2) mergeVideosPayload.videoUrls = validUrls;
      else {
        console.warn('[Agent] Rejected MERGE_VIDEOS marker — fewer than 2 valid known video URLs after validation');
        mergeVideosPayload = null;
      }
    }
    // ✅ NEW: تنضيف حقول السرد/الكابشن/الموسيقى الجديدة بتاعة الدمج — نفس منطق generateVideo فوق بالظبط
    if (mergeVideosPayload) {
      if (typeof mergeVideosPayload.narrationScript !== 'string' || !mergeVideosPayload.narrationScript.trim()) {
        delete mergeVideosPayload.narrationScript;
        delete mergeVideosPayload.addCaptions;
      } else {
        mergeVideosPayload.narrationScript = mergeVideosPayload.narrationScript.trim().slice(0, 4000);
        mergeVideosPayload.addCaptions = mergeVideosPayload.addCaptions === true;
      }
      if (!['youtube', 'general'].includes(mergeVideosPayload.musicStyle)) delete mergeVideosPayload.musicStyle;
      if (typeof mergeVideosPayload.musicMood !== 'string') delete mergeVideosPayload.musicMood;
      if (typeof mergeVideosPayload.voiceKey !== 'string') delete mergeVideosPayload.voiceKey;
      if (typeof mergeVideosPayload.narrationLanguage !== 'string') delete mergeVideosPayload.narrationLanguage;
    }
    // ✅ FIX: العميل صريح في رسالته عن النسبة اللي عايزها — نفرضها بغض النظر عمّا حطّه
    // الايجنت في الماركر، بدل ما نعتمد بالكامل على التزامه بالتعليمات
    const explicitRatio = detectExplicitAspectRatio(message);
    if (explicitRatio) {
      if (generateImage) generateImage.aspectRatio = explicitRatio;
      if (generateVideo && explicitRatio !== '1:1') generateVideo.aspectRatio = explicitRatio;
    }

    // ✅ NEW: توليد فيديو مستقل (Veo/Kling/Seedance/Luma) بيستخدم أول صورة مرفقة في نفس
    // الرسالة كـ image-to-video لو الموديل بيدعم كده — نفس نمط generateImage فوق بالظبط
    if (generateVideo && images.length && NEW_VIDEO_MODELS[generateVideo.model]?.supportsImageInput) {
      const rcAttach = NEW_VIDEO_MODELS[generateVideo.model].refCaps;
      // لو الايجنت اختار وضع "صور مرجعية" (seedance_2_5)، الصور المرفقة بتنضاف كمراجع
      // (الـschema بتمنع الجمع بين صورة أول فريم وأي مرجع) بدل ما تبقى imageUrl
      if (generateVideo.model === 'seedance_2_5' && (generateVideo.referenceImageUrls?.length || generateVideo.referenceVideoUrls?.length)) {
        generateVideo.referenceImageUrls = [...(generateVideo.referenceImageUrls || []), ...images].slice(0, rcAttach.images);
      } else {
        generateVideo.imageUrl = images[0];
      }
    }

    // ✅ لو نجحنا نطلع "ready"/"editScene"/"videoEdit"/"generateImage"/"generateVideo" بس
    // النص البشري اللي المفروض ييجي بعد الـ JSON اتقطع بالكامل (نادر، بس ممكن لو حد
    // التوكنز وقف بالظبط عند آخر قوس)، منسيبش فقاعة فاضية للعميل
    if ((ready || editScene || videoEdit || generateImage || generateVideo || mergeVideosPayload) && !reply) {
      reply = editScene ? 'تمام، هعدّل المشهد وأدمجه مع باقي الفيديو.' : videoEdit ? 'تمام، هبدأ أعدّل الفيديو دلوقتي.' : generateImage ? 'تمام، هبدأ أولّد الصور دلوقتي.' : generateVideo ? 'تمام، هبدأ أولّد الفيديو دلوقتي.' : mergeVideosPayload ? 'تمام، هبدأ أدمج الفيديوهات دلوقتي.' : 'جاهز، هبدأ التوليد دلوقتي.';
    }

    // ✅ FIX (باج حقيقي حصل مع عملاء حقيقيين): مفيش رصيد حقيقي أبدًا للعميل على خطة "free"
    // (بيبدأ بـ 0 كريديت دايمًا)، فأي READY/EDIT_SCENE/VIDEO_EDIT/GENERATE_IMAGE ليه كان
    // هيفشل في السيرفر بعد ما البوت يكون قال للعميل "جاهز، هبدأ التوليد الآن" — يسيب العميل
    // مستني فيديو/صورة مش هيتعمل ("وين الفيديو؟"). البرومبت بقى بيمنع الموديل من عمل ده
    // أصلاً، بس ده حاجز إضافي في الكود نفسه يضمن إن العميل محدش هيتقال له كلام مضلل حتى لو
    // الموديل تجاهل التعليمات
    if ((ready || editScene || videoEdit || generateImage || generateVideo || mergeVideosPayload) && userPlan === 'free') {
      ready = null; editScene = null; videoEdit = null; generateImage = null; generateVideo = null; mergeVideosPayload = null;
      reply = 'الخطة المجانية معندهاش رصيد كريديت حقيقي، فمش هينفع نبدأ التوليد قبل ما تشترك. تحب أوريك باقات الاشتراك، ولا أوريك أمثلة فيديوهات حقيقية عملناها الأول؟';
    }

    // ── ماركرز ثانوية (مش بتوقف التوليد العادي فوق) — منطقة، اشتراك، أو إجراء على الحساب.
    // بتيجي في آخر الرد البشري نفسه (مش بديلة له زي READY/EDIT_SCENE) ────────────────────
    let showcaseVideos = false;
    if (reply.includes('###SHOWCASE_VIDEOS###')) {
      showcaseVideos = true;
      reply = reply.replace('###SHOWCASE_VIDEOS###', '').trim();
    }
    let setRegionPayload, subscribePayload, accountActionPayload, whiteboardVideoPayload, analyzeVideoPayload, channelGeneratePayload, channelResumePayload;
    ({ text: reply, payload: setRegionPayload } = extractTrailingMarker(reply, '###SET_REGION###'));
    ({ text: reply, payload: subscribePayload } = extractTrailingMarker(reply, '###SUBSCRIBE###'));
    ({ text: reply, payload: accountActionPayload } = extractTrailingMarker(reply, '###ACCOUNT_ACTION###'));
    ({ text: reply, payload: whiteboardVideoPayload } = extractTrailingMarker(reply, '###WHITEBOARD_VIDEO###'));
    ({ text: reply, payload: channelGeneratePayload } = extractTrailingMarker(reply, '###CHANNEL_GENERATE###'));
    ({ text: reply, payload: channelResumePayload } = extractTrailingMarker(reply, '###CHANNEL_RESUME###'));
    // ✅ خطوة موافقة حقيقية بتكلفة كريديت حقيقية زي أي فيديو تاني — نفس حاجز الخطة المجانية
    // المستخدم فوق لـREADY/GENERATE_IMAGE/... بالظبط، بس منفصل لأنه ماركر ثانوي (بعد الحاجز
    // الأساسي فوق) مش من عيلة READY
    if (channelGeneratePayload && userPlan === 'free') {
      channelGeneratePayload = null;
      reply += (reply ? '\n\n' : '') + 'الخطة المجانية معندهاش رصيد كريديت حقيقي، فمش هينفع نبدأ فيديو القناة قبل ما تشترك.';
    }
    // ✅ NEW (طلب العميل: أداة تحليل فيديو مستقلة — "مين بيتكلم إمتى" — متاحة لأي فيديو العميل
    // يرفعه، وكمان خطوة تمهيدية قبل مونتاج فيديو أطول من 10 ثواني): ماركر بسيط (URL واحد بس)
    // فبياخد نفس مسار الماركرز الثانوية الصغيرة زي WHITEBOARD_VIDEO، مش المسار المعقد بتاع
    // GENERATE_IMAGE/VIDEO — التكلفة الحقيقية (متغيرة، مش ثابتة) بتتحسب فعليًا في
    // /api/videos/analyze نفسه، مش هنا
    ({ text: reply, payload: analyzeVideoPayload } = extractTrailingMarker(reply, '###ANALYZE_VIDEO###'));
    if (analyzeVideoPayload && (typeof analyzeVideoPayload.videoUrl !== 'string' || !analyzeVideoPayload.videoUrl.trim() || !isKnownUrl(analyzeVideoPayload.videoUrl))) {
      console.warn('[Agent] ANALYZE_VIDEO marker rejected — missing/unknown videoUrl:', JSON.stringify(analyzeVideoPayload).slice(0, 300));
      analyzeVideoPayload = null;
    }

    // ✅ NEW (طلب العميل: "اربط كل ده بالايجنت ... يظهر في شات الايجنت كمّل الفيديو"):
    // فيديو Whiteboard مجاني (مش بيحتاج كريديت خالص، رصيد 10 دقايق مدى الحياة بس) — الايجنت
    // بيقرر يستخدمه (marker منفصل عن READY تمامًا، بيشتغل حتى لو userPlan==='free' لأنه
    // بطبيعته مجاني) لما المستخدم يكون رفع صوت حقيقي في نفس الرسالة (uploadedVoiceUrl) وطلب
    // فيديو whiteboard/مجاني. بنعيد استخدام نفس ملف الصوت المحفوظ بالفعل (transcribeVoiceForAgent
    // فوق) بدل ما نطلب من المستخدم يرفعه تاني من الصفحة العامة
    let whiteboardVideo = null;
    if (whiteboardVideoPayload && uploadedVoiceUrl) {
      try {
        const audioPath = path.join(process.cwd(), uploadedVoiceUrl.replace(/^\//, ''));
        const audioBuffer = fs.readFileSync(audioPath);
        const { job, thisVideoSeconds } = await startWhiteboardVideoCreation(userId, audioBuffer, 'mp3', 'agent_voice.mp3');
        whiteboardVideo = { job, thisVideoSeconds };
      } catch (e) {
        if (e.code === 'free_budget_exhausted') {
          reply += (reply ? '\n\n' : '') + 'للأسف خلصت رصيدك المجاني (10 دقايق) من فيديوهات الـwhiteboard — لازم تشترك عشان تكمل.';
        } else {
          console.warn('[Agent] Whiteboard video creation failed:', e.message);
          reply += (reply ? '\n\n' : '') + 'حصلت مشكلة وأنا بجهز فيديو الـwhiteboard، جرب تاني كمان شوية.';
        }
      }
    }

    // ✅ NEW (طلب العميل: "اقدر اقول للايجنت اعمل فيديو وانشره على القناة دلوقتي"): يشغّل
    // نفس خط الأتوبايلوت الحقيقي (نفس توجيه نوع المحتوى + تزامن السرد + الرفع التلقائي
    // ليوتيوب) في الخلفية — راجع rule 13b في agentService.js وtriggerChannelRunNow في
    // channelSchedulerService.js. الرد الفوري هنا بس بيأكد إنه بدأ؛ النتيجة الحقيقية (لينك
    // الفيديو + التكلفة الفعلية) بتوصل الشات لاحقًا عن طريق كارت بيعمل poll (زي WhiteboardCard)
    let channelGenerate = null;
    if (channelGeneratePayload) {
      const channelId = Number(channelGeneratePayload.channelId);
      const channel = userChannels.find(c => c.id === channelId);
      if (!channel) {
        reply += (reply ? '\n\n' : '') + 'معلش، القناة دي مش من قنواتك المتربطة — جرب تاني.';
      } else if (channel.status !== 'active') {
        reply += (reply ? '\n\n' : '') + 'القناة دي متوقفة مؤقتًا (Paused) — شغّلها الأول من صفحة "قنواتي" عشان أقدر أعمل فيديو ليها.';
      } else {
        try {
          const fullChannel = await getManagedChannelById(channelId);
          // ✅ NEW (طلب العميل: يقدر يقول "اعمل الفيديو 15 ثانية"/"3 مشاهد"/"من غير كابشن" في
          // الشات نفسه، لمرة واحدة بس، من غير ما يغيّر إعدادات القناة الدائمة) — راجع rule 13b
          // في agentService.js. بيتفلتر/يتحدد هنا (مش بيتوثق فيه أعمى) نفس حدود PATCH العادية
          const sceneN = parseInt(channelGeneratePayload.sceneCountOverride, 10);
          const durN = parseInt(channelGeneratePayload.durationSecOverride, 10);
          const overrides = {};
          if (Number.isInteger(sceneN) && sceneN >= 2 && sceneN <= 20) overrides.sceneCount = sceneN;
          if (Number.isInteger(durN) && durN >= 5 && durN <= 1200) overrides.durationSec = durN;
          if (typeof channelGeneratePayload.captionsOverride === 'boolean') overrides.captionsEnabled = channelGeneratePayload.captionsOverride;
          // الصوت: الكود بيقرا رسائل العميل بنفسه (detectVoiceRequest)، وحقل voiceOverride من الـLLM
          // بس احتياطي لو مفيش ذكر واضح — الحسم للي العميل كتبه فعلاً مش لتفسير الـLLM
          const voiceFromUser = detectVoiceRequest(message, history);
          if (voiceFromUser !== null) overrides.usesVoice = voiceFromUser;
          else if (typeof channelGeneratePayload.voiceOverride === 'boolean') overrides.usesVoice = channelGeneratePayload.voiceOverride;
          const { runId, idea, format, estimatedCost } = await triggerChannelRunNow(fullChannel, overrides);
          channelGenerate = { runId, channelId, ideaTitle: idea.title, format, estimatedCost };
        } catch (e) {
          console.warn('[Agent] CHANNEL_GENERATE marker failed:', e.message);
          reply += (reply ? '\n\n' : '') + 'معلش، حصل خطأ وأنا بحاول أبدأ فيديو القناة — جرب تاني بعد شوية.';
        }
      }
    }

    // ✅ NEW: استكمال فيديو قناة وقف لما الكريديت خلص — الـrunId لازم يكون فعلاً من قنوات العميل نفسه
    if (channelResumePayload) {
      const runId = Number(channelResumePayload.runId);
      if (!userChannels.some(c => Number(c.partial_run_id) === runId)) {
        reply += (reply ? '\n\n' : '') + 'معلش، مش لاقي فيديو ناقص بالرقم ده على قنواتك.';
      } else {
        try {
          const r = await startResumeChannelRun(userId, runId);
          if (r.ok) reply += (reply ? '\n\n' : '') + `تمام، بدأت أكمّل الفيديو من المشهد ${r.scenesDone + 1} من ${r.scenesTotal}. هيتحدّث في مشروع القناة أول ما يخلص.`;
          else if (r.error === 'insufficient_credits') reply += (reply ? '\n\n' : '') + `الرصيد مش كفاية لسه: المشهد الجاي محتاج ${r.needed} كريديت ورصيدك ${r.balance}، وإكمال الفيديو كله محتاج حوالي ${r.estimatedRemaining ?? '؟'} كريديت. اشحن الأول وقولّي "كمّل".`;
          else reply += (reply ? '\n\n' : '') + 'الفيديو ده بيتكمّل بالفعل أو مفيش حاجة ناقصة فيه.';
        } catch (e) {
          console.warn('[Agent] CHANNEL_RESUME marker failed:', e.message);
          reply += (reply ? '\n\n' : '') + 'معلش، حصل خطأ وأنا بحاول أكمّل الفيديو — جرب تاني بعد شوية.';
        }
      }
    }

    if (setRegionPayload?.region) {
      setUserRegion(userId, setRegionPayload.region).catch(e => console.warn('[Agent] set_region failed:', e.message));
    }
    if (accountActionPayload?.action === 'set_region' && accountActionPayload.value) {
      setUserRegion(userId, accountActionPayload.value).catch(e => console.warn('[Agent] account_action set_region failed:', e.message));
    } else if (accountActionPayload?.action === 'update_name' && accountActionPayload.value) {
      updateUserName(userId, accountActionPayload.value).catch(e => console.warn('[Agent] account_action update_name failed:', e.message));
    }

    // ✅ حارس حتمي أخير قبل ما الرد يوصل للعميل خالص — راجع تعريف الدالتين فوق لسبب وجودهم.
    // الترتيب مهم: لازم نفك أي **نجمتين** الأول قبل ما نشيل اسم الموديل اللي جواهم، وإلا
    // بيفضل "****" يتيمة مكسورة (اتأكد فعليًا: لو عكسنا الترتيب، "**Model 8**" بترجع "****")
    reply = stripLegacyModelMentions(stripMarkdownFormatting(reply));

    // ✅ NEW (طلب العميل: أزرار سريعة "ابدأ/لأ" بدل ما يكتبهم يدويًا في كل مرة): لو الرد ده
    // مجرد سؤال تأكيد قبل التوليد (مفيش أي ماركر نفّذ فعليًا في الرد ده)، بنعلّم الفرونت إند
    // بعلم صريح عشان يعرض زرار "ابدأ"/"لأ" (أو "Yes"/"No") تحت الرسالة مباشرة
    const awaitingConfirmation = !ready && !editScene && !videoEdit && !generateImage && !generateVideo && !mergeVideosPayload && !whiteboardVideoPayload && !subscribePayload && !analyzeVideoPayload && !channelGeneratePayload &&
      looksLikeConfirmationQuestion(reply);

    res.json({
      reply, transcript, ready, editScene, videoEdit, generateImage, generateVideo, mergeVideos: mergeVideosPayload, uploadedVoiceUrl,
      analyzeVideo: analyzeVideoPayload,
      awaitingConfirmation,
      structuredScenes: structuredScenesResult, adsScenePlan: adsScenePlanResult,
      subscribe: subscribePayload, showcaseVideos, whiteboardVideo, channelGenerate,
      // ✅ NEW: الروابط الدائمة (R2) لأي صورة العميل رفعها في الرسالة دي — الفرونت إند بيحفظها
      // مع رسالة العميل نفسها عشان تفضل قابلة للاستشهاد بيها في أي رسالة جاية (راجع
      // uploadUserPhotoToR2 فوق)
      uploadedPhotoUrls: uploadedPhotoUrls.length ? uploadedPhotoUrls : undefined,
      // ✅ NEW: نسبة كل صورة الحقيقية (من sharp) بنفس ترتيب uploadedPhotoUrls — الفرونت إند
      // بيحفظها كمان عشان يضيفها كتاج "(aspect ratio: X)" في ملاحظة الـhistory، فحاجز الكود
      // القائم بالفعل (اللي بيقرا نفس التاج للصور اللي بيولدها الايجنت) يشتغل عليها هي كمان
      uploadedPhotoRatios: uploadedPhotoUrls.length ? uploadedPhotoUrls.map(u => uploadedPhotoRatioByUrl.get(u)?.bucket || null) : undefined,
    });

    // ✅ NEW: تسجيل تبادل الشات (رسالة العميل + رد الايجنت) عشان يظهر للأدمن — مش بيوقف
    // الرد للعميل (بعد res.json بالفعل)، ومش بيفشل الطلب لو التسجيل فشل
    logAgentConversation(userId, user?.email || null, userPlan, message, reply).catch(() => {});

    // ✅ NEW: لو الطلب ده اتفهم وخرج منه فيديو فعلي (READY)، نحفظه في ذاكرة الايجنت —
    // عشان طلب مشابه لاحقًا (لنفس العميل أو عميل تاني) يتحل ذاتيًا من غير ما يعاد كل السؤال
    if (ready && fingerprint.length > 12) {
      rememberAgentRequest(userId, fingerprint, message, ready, ready.model).catch(() => {});
    }
  } catch (e) {
    console.error('[Agent Chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/limits', authMiddleware, (req, res) => {
  res.json(AGENT_LIMITS);
});

// ✅ NEW (باج حقيقي: مربع "AI edit this image/video" في نافذة تفاصيل الميديا كان بيبعت كلام
// العميل الخام (أي لغة، صياغة مكسورة أحيانًا) مباشرة كـprompt لـReplicate من غير أي ترجمة أو
// تحسين — بعكس أي prompt بيكتبه الايجنت نفسه، اللي دايمًا بيتترجم/يتحسّن للإنجليزي أولاً. ده
// مسار منفصل تمامًا عن /chat (مفيش أي LLM في النص خالص)، فبنضيف نقطة نهاية خفيفة مخصصة بس
// لخطوة الترجمة/التحسين دي، تتنادى من الفرونت إند قبل ما التعديل يتبعت فعليًا
router.post('/refine-edit-prompt', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'text is required' });
    const refined = await refineEditInstruction(String(text).slice(0, 1000));
    res.json({ refined });
  } catch (e) {
    console.warn('[Agent] refine-edit-prompt failed:', e.message);
    res.json({ refined: req.body?.text || '' }); // فشل الترجمة مايوقفش التعديل — يرجع النص الخام بدل ما يفشل الطلب كله
  }
});

// ✅ NEW (Flow-style context menu — "الإبلاغ عن الناتج"): إبلاغ خفيف عن صورة/فيديو متولد،
// بيبعت إيميل للأدمن بس (مفيش جدول جديد في الداتابيز) — نفس نمط تنبيه الأدمن المستخدم فعليًا
// في supportRoutes.js لإشعارات الشات
router.post('/report-content', authMiddleware, async (req, res) => {
  try {
    const { mediaUrl, prompt, reason } = req.body || {};
    if (!mediaUrl) return res.status(400).json({ error: 'mediaUrl is required' });
    const user = await getUserById(req.user.userId);
    if (process.env.RESEND_API_KEY) {
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Erivion Support <support@erivion.net>',
          to: [process.env.ADMIN_EMAIL || 'digidelight33@gmail.com'],
          subject: `🚩 Content reported — ${user?.email || req.user.userId}`,
          html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px"><h2 style="color:#f87171;margin:0 0 16px">🚩 Generated content reported</h2><table style="width:100%;border-collapse:collapse;margin:16px 0"><tr><td style="color:#888;padding:8px 0;width:110px">User</td><td style="color:#fff">${user?.email || req.user.userId}</td></tr><tr><td style="color:#888;padding:8px 0">Reason</td><td style="color:#fff">${(reason || 'not specified').toString().slice(0, 300)}</td></tr><tr><td style="color:#888;padding:8px 0">Prompt</td><td style="color:#fff">${(prompt || '').toString().slice(0, 400)}</td></tr></table><a href="${mediaUrl}" style="color:#7c6af7;word-break:break-all">${mediaUrl}</a></div>`,
        }),
      }).catch(e => console.warn('[Agent] report-content email failed:', e.message));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ FIX (باج حقيقي حصل مع عميل حقيقي: زرار "تحميل" في قائمة النقط كان بيوداك للينك الخام
// بدل ما ينزّل، وزرار "تحريك" مكنش بيعمل حاجة خالص): السبب الحقيقي كان إن الفرونت إند بيعمل
// fetch() من المتصفح مباشرة على رابط R2 العام — وده رابط من نطاق (origin) مختلف تمامًا عن
// الموقع، وسيرفرات R2 مش بتضيف CORS headers تسمح لموقع خارجي يعمل fetch عليها افتراضيًا، فطلب
// المتصفح كان بيفشل صامت (CORS error) قبل ما يوصل حتى لكود التحميل الفعلي. الحل الحقيقي: بروكسي
// من نفس السيرفر بتاعنا (يجيب الملف من R2 بنفسه — مفيش CORS بين سيرفرين، الفحص ده بس بين متصفح
// وسيرفر تاني) ويرجّعه من نفس نطاق الموقع، فطلب المتصفح بقى "نفس المصدر" (same-origin) ومفيش
// مشكلة CORS خالص. بيتحقق إن الرابط فعلاً من R2 بتاعنا أو replicate.delivery المؤقت، مش أي رابط
// عشوائي (منعًا لاستخدامه كـ open proxy)
router.get('/media-proxy', authMiddleware, async (req, res) => {
  try {
    const { url, mode } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url is required' });
    const r2Base = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
    const isAllowed = (r2Base && url.startsWith(r2Base)) || /^https:\/\/[a-z0-9.-]+\.replicate\.delivery\//i.test(url);
    if (!isAllowed) return res.status(403).json({ error: 'url not allowed' });
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).json({ error: `upstream fetch failed: ${upstream.status}` });
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (mode === 'download') {
      const filename = (url.split('/').pop() || 'download').split('?')[0];
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;