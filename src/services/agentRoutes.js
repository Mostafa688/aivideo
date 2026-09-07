import express from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from './authRoutes.js';
import { agentChat, transcribeVoiceForAgent, validateAgentImage, analyzeSceneImage, parseStructuredScript, parseAdsScenePlan, AGENT_LIMITS } from './agentService.js';
import { getUserById, logAgentConversation, setUserRegion, updateUserName, findSimilarAgentRequest, rememberAgentRequest, listManagedChannelsForUser, getManagedChannelById, getCreditsBalance } from './authService.js';
import { searchWeb, WEB_SEARCH_AVAILABLE } from './webSearchService.js';
import { getFreshChannelIdea } from './channelSchedulerService.js';
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
function extractKnownUrls(history) {
  const set = new Set();
  if (!Array.isArray(history)) return set;
  const urlRegex = /https?:\/\/[^\s\]"',]+/g;
  for (const m of history) {
    const content = typeof m?.content === 'string' ? m.content : '';
    const matches = content.match(urlRegex);
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

function repairTruncatedJson(text) {
  let inString = false, escape = false;
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }
  let repaired = text;
  if (inString) repaired += '"';
  for (let i = stack.length - 1; i >= 0; i--) repaired += stack[i] === '{' ? '}' : ']';
  return repaired;
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

    const { message, history, voiceBase64, imageBase64, imagesBase64, photoAlreadyUploaded, voiceAlreadyUploaded, videoAlreadyUploaded, videoDurationSec, hasStructuredScript: clientHasStructuredScript, hasAdsScenePlan: clientHasAdsScenePlan, styleHint, hasClonedVoice, forcedImageModel, forcedVideoModel } = req.body;
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

    // ✅ FIX: بيقبل دلوقتي مصفوفة صور (لحد 2) في نفس الرسالة، مش صورة واحدة بس —
    // imageBase64 (مفرد) لسه متاح للتوافق مع أي كود قديم، بس imagesBase64 (جمع) هو الأساس دلوقتي
    const images = Array.isArray(imagesBase64) && imagesBase64.length
      ? imagesBase64.slice(0, 2)
      : (imageBase64 ? [imageBase64] : []);

    const styleHintNote = styleHint
      ? (styleHint === 'map_video'
          ? `The user selected "Map Video" from the style picker — this means they specifically want Model 5's Map Video mode (historical/geopolitical map documentary, 15s, isMapVideo:true) for this next video, unless the topic they describe clearly can't work as a map video, in which case briefly clarify with them.`
          : `The user selected the "${styleHint.replace('_', ' ')}" visual style from the style picker before describing their idea — reflect this style genuinely in whichever model you end up using (e.g. in "videoStyle"/"styleSuffix" for Models 1-4, in the idea/prompt wording for Model 5, or in the "style" field for Model 7/Ads if it maps to action/cinematic/calm). This is optional context they chose to make their intent clearer, not a separate request — don't mention the picker itself, just naturally apply the style.`)
      : null;
    // ✅ NEW (طلب العميل: زرار سهم يدوي لاختيار موديل الصورة/الفيديو بنفسه — زي Google Flow):
    // المستخدم اختار موديل معيّن يدويًا من قائمة قبل ما يبعت الرسالة — لازم الايجنت يستخدمه
    // بالظبط بدل ما يختار هو، ويقول السعر الصح المرتبط بيه (بعده كمان في الكود فيه حاجز إضافي
    // بيفرض نفس الاختيار حتى لو الموديل تجاهل التعليمة دي)
    const forcedModelNote = forcedImageModel && NEW_IMAGE_MODELS[forcedImageModel]
      ? `The user manually selected the image engine "${forcedImageModel}" from a picker before sending this message — you MUST use exactly this model for any image generation in this turn (do not pick a different one, do not ask which model), and state its real credit cost from the price list above.`
      : forcedVideoModel && NEW_VIDEO_MODELS[forcedVideoModel]
      ? `The user manually selected the video engine "${forcedVideoModel}" from a picker before sending this message — you MUST use exactly this engine for ANY video generation in this turn, INCLUDING animating a generated image (if they ask to animate/move a picture right now, use the ###GENERATE_VIDEO### marker with model:"${forcedVideoModel}" and "imageUrl" set to the exact image URL from history — do NOT fall back to Model 5 for this turn, that would ignore their explicit choice). Do not pick a different engine, do not ask which one, and state its real credit cost from the price list above.`
      : null;
    let attachmentNote = [structuredNote, adsScenePlanNote, styleHintNote, forcedModelNote].filter(Boolean).join(' ') || null;
    let transcript = null;
    let uploadedVoiceUrl = null;

    if (voiceBase64) {
      try {
        const result = await transcribeVoiceForAgent(voiceBase64);
        transcript = result.text;
        uploadedVoiceUrl = result.audioUrl;
        attachmentNote = `User uploaded a voice recording (${Math.round(result.duration)}s) meant to be used AS THE REAL NARRATION AUDIO of the video (true voice-to-video — do NOT generate a new synthetic voice for this, their own recording will be used as-is). Transcript of what they said: "${transcript.slice(0, 500)}". Use this transcript's content directly as the video's script/idea — do NOT ask the user to type a separate idea, you already have it from their recording. Model 5 cannot use this (no voiceover support) — if they picked Model 5, tell them their voice can't be used there.`;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    if (images.length) {
      try {
        for (const img of images) validateAgentImage(img);
        // ✅ NEW: لو العميل رفع صورة مشهد وقال "اعملي نفس المشهد ده" أو أي صيغة مشابهة،
        // نحلل الصورة بالـ vision model ونطلع منها rawPrompt جاهز بدل ما نطلب منه يوصف بنفسه
        const sameSceneIntent = images.length === 1 && /same\s*scene|recreate this|make (a|the) same|make this (a|into a) video|animate this photo|نفس\s*المشهد|زي\s*(الصورة|المشهد)\s*ده|كأنه\s*المشهد|حرك\s*(الصورة|المشهد)\s*دي?/i.test(message || '');
        if (sameSceneIntent) {
          try {
            const sceneDescription = await analyzeSceneImage(images[0]);
            attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + `The user uploaded a photo of a scene and wants a new AI video that recreates it (Model 5). Here is a detailed analysis of the photo, ready to use directly as the rawPrompt: "${sceneDescription}". Use this AS THE rawPrompt in Model 5's "prompt to video" mode (promptMode:"prompt") — light grammar polish only, never change its meaning, and do NOT ask the user to describe the scene themselves, you already have it. Only ask them for duration (5s/10s/15s) if they have not already told you anywhere in the conversation — if they already gave a duration, skip straight to confirming and generating.`;
          } catch (e) {
            console.warn('[Agent] Scene image analysis failed:', e.message);
            attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + 'User uploaded a photo and wants the same scene recreated as a video, but automatic analysis of the photo failed — ask them to briefly describe in a sentence what is happening in the photo themselves so you can use Model 5 prompt-to-video mode instead.';
          }
        } else {
          const note = images.length > 1
            ? 'User just uploaded 2 photos (two characters) for Model 5. This fully satisfies the character reference requirement for BOTH people — treat it as met right now, do not ask for more photos, and proceed toward confirming and generating if you already have the other required details. Mention the cost is a bit higher than a single photo.'
            : 'User just uploaded a photo. This satisfies the required product/character photo for Model 7 (Ads) or Model 5 (character reference) — OR, if they just want the photo animated directly with no scene description at all, this is Model 5\'s "image to video" mode (promptMode:"image", no idea/rawPrompt needed, just confirm duration). Treat the photo requirement as met right now, do not ask for it again, and proceed toward confirming and generating if you already have the other required details.';
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
            hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits,
          });
        } else if (query) {
          rawReply = await agentChat({
            message, history, attachmentNote: (attachmentNote ? attachmentNote + ' ' : '') + 'You asked to research this but web search is not configured on this deployment — answer using your own knowledge and honestly tell the user you cannot verify it live right now.', userPlan, isAdminUser,
            hasPhoto: images.length > 0 || !!photoAlreadyUploaded, hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
            hasVideo: !!videoAlreadyUploaded, videoDurationSec: videoDurationSec || null,
            hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits,
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
          channelNote = `Fresh idea sourced from VidIQ for channel "${channel.label || channel.channel_id}": title="${idea.title}", brief="${idea.brief || ''}", videoLanguage="${idea.videoLanguage || 'en'}", format="${format}" (${format === 'short' ? 'short, punchy, ~30s' : 'long-form, several minutes'}), voice="${channel.uses_voice ? 'yes — use Model 8 audioMode voiceover' : 'no — use Model 8 audioMode none'}". Present this idea warmly to the user, then confirm and generate with Model 8 using this idea (translated/refined per rule 8), matching the format/voice above — do not ask the user for details you already have here.`;
        }
        rawReply = await agentChat({
          message, history, attachmentNote: (attachmentNote ? attachmentNote + ' ' : '') + channelNote, userPlan, isAdminUser,
          hasPhoto: images.length > 0 || !!photoAlreadyUploaded, hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
          hasVideo: !!videoAlreadyUploaded, videoDurationSec: videoDurationSec || null,
          hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice, userCredits,
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
        if (isEditMarker) {
          if (Number.isInteger(parsed.sceneIndex) && typeof parsed.description === 'string') editScene = parsed;
        } else if (isVideoEditMarker) {
          if (typeof parsed.editPrompt === 'string' && parsed.editPrompt.trim()) videoEdit = parsed;
        } else if (isImageGenMarker) {
          const hasDistinctPrompts = Array.isArray(parsed.prompts) && parsed.prompts.filter(p => typeof p === 'string' && p.trim()).length >= 2;
          if (typeof parsed.model === 'string' && NEW_IMAGE_MODELS[parsed.model] && ((typeof parsed.prompt === 'string' && parsed.prompt.trim()) || hasDistinctPrompts)) generateImage = parsed;
        } else if (isVideoGenMarker) {
          if (typeof parsed.model === 'string' && NEW_VIDEO_MODELS[parsed.model] && typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
            const maxSec = getMaxClipSeconds(parsed.model);
            if (maxSec && (!Number.isFinite(parsed.durationSec) || parsed.durationSec > maxSec)) parsed.durationSec = maxSec;
            generateVideo = parsed;
          }
        } else if (isMergeVideosMarker) {
          if (Array.isArray(parsed.videoUrls) && parsed.videoUrls.length >= 2 && parsed.videoUrls.every(u => typeof u === 'string' && u.trim())) {
            mergeVideosPayload = { videoUrls: parsed.videoUrls.slice(0, 10) };
          }
        } else if ([1, 2, 3, 4, 5, 7, 8].includes(parsed.model)) {
          ready = parsed;
        }
      } catch (e) {
        // ✅ FIX: كان بيسيب الطلب كله يفشل من غير فيديو ولا رسالة خطأ واضحة لو الموديل
        // قطع الـ JSON في النص (خصوصًا مع reasoning models زي gpt-oss اللي بتاخد جزء من
        // التوكنز في تفكير مش ظاهر). دلوقتي بنحاول نصلّح الـ JSON المقطوع قبل ما نستسلم.
        console.warn(`[Agent] Could not parse ${markerName} marker, attempting repair:`, e.message);
        try {
          const repaired = JSON.parse(repairTruncatedJson(jsonText));
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
            if (typeof repaired.model === 'string' && NEW_IMAGE_MODELS[repaired.model] && ((typeof repaired.prompt === 'string' && repaired.prompt.trim()) || hasDistinctPrompts)) {
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
              mergeVideosPayload = { videoUrls: repaired.videoUrls.slice(0, 10) };
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
    const knownUrls = extractKnownUrls(history);
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
    }
    // ✅ حاجز إضافي في الكود نفسه: لو المستخدم فرض موديل يدويًا، نضمن استخدامه بالظبط حتى
    // لو الايجنت (الموديل نفسه) تجاهل التعليمة اللي فوق لأي سبب
    if (generateImage && forcedImageModel && NEW_IMAGE_MODELS[forcedImageModel]) {
      generateImage.model = forcedImageModel;
    }
    if (generateVideo && forcedVideoModel && NEW_VIDEO_MODELS[forcedVideoModel]) {
      generateVideo.model = forcedVideoModel;
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
      generateVideo.imageUrl = images[0];
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
    let setRegionPayload, subscribePayload, accountActionPayload, whiteboardVideoPayload;
    ({ text: reply, payload: setRegionPayload } = extractTrailingMarker(reply, '###SET_REGION###'));
    ({ text: reply, payload: subscribePayload } = extractTrailingMarker(reply, '###SUBSCRIBE###'));
    ({ text: reply, payload: accountActionPayload } = extractTrailingMarker(reply, '###ACCOUNT_ACTION###'));
    ({ text: reply, payload: whiteboardVideoPayload } = extractTrailingMarker(reply, '###WHITEBOARD_VIDEO###'));

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

    if (setRegionPayload?.region) {
      setUserRegion(userId, setRegionPayload.region).catch(e => console.warn('[Agent] set_region failed:', e.message));
    }
    if (accountActionPayload?.action === 'set_region' && accountActionPayload.value) {
      setUserRegion(userId, accountActionPayload.value).catch(e => console.warn('[Agent] account_action set_region failed:', e.message));
    } else if (accountActionPayload?.action === 'update_name' && accountActionPayload.value) {
      updateUserName(userId, accountActionPayload.value).catch(e => console.warn('[Agent] account_action update_name failed:', e.message));
    }

    res.json({
      reply, transcript, ready, editScene, videoEdit, generateImage, generateVideo, mergeVideos: mergeVideosPayload, uploadedVoiceUrl,
      structuredScenes: structuredScenesResult, adsScenePlan: adsScenePlanResult,
      subscribe: subscribePayload, showcaseVideos, whiteboardVideo,
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