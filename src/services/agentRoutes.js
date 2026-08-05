import express from 'express';
import { authMiddleware } from './authRoutes.js';
import { agentChat, transcribeVoiceForAgent, validateAgentImage, analyzeSceneImage, parseStructuredScript, parseAdsScenePlan, AGENT_LIMITS } from './agentService.js';
import { getUserById } from './authService.js';

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

    const { message, history, voiceBase64, imageBase64, imagesBase64, photoAlreadyUploaded, voiceAlreadyUploaded, videoAlreadyUploaded, videoDurationSec, hasStructuredScript: clientHasStructuredScript, hasAdsScenePlan: clientHasAdsScenePlan, styleHint } = req.body;
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
      structuredNote = `The user pasted a pre-divided scene breakdown with EXACTLY ${parsedScript.scenes.length} scenes, already parsed and captured exactly as written by the system (not by you) — you must NOT reproduce, retype, or summarize the scene text yourself, and must NOT include a "structuredScenes" field in your READY marker at all (the system already has the real content). Stated/implied total duration ≈ ${durLabel}. Voice style hint from the user: "${parsedScript.voiceHint || 'none given'}". Music requested: ${parsedScript.hasMusic ? 'yes' : 'no'}. Your job now: pick which model — 1, 2, 3, 4, or 5's normal modes (never map-video) (ask if unclear), pick ratio (ask if unclear), pick the closest supported duration bucket to ${durLabel} for pricing (the real scene count stays ${parsedScript.scenes.length} regardless — if that's more scenes than the bucket's standard count, remember the per-extra-scene surcharge: Model 3 = 20cr, Model 4 = 35cr, Model 5 = 70cr), map the voice hint to the closest "voice" option, set "music" accordingly, mention once that any "On-screen Text" lines won't render as a separate overlay (captions come from narration audio only), then confirm and emit a normal READY marker with "idea" as just a short label.`;
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
        adsScenePlanNote = `The user pasted a ready-made AD PLAN with a Time/Visual/Voiceover table — EXACTLY ${parsedAdsPlan.scenes.length} scenes, already parsed and captured exactly as written by the system (not by you), each with its own real duration and its own exact voiceover line — you must NOT reproduce, retype, or summarize any scene content yourself, and must NOT include an "adsScenePlan" field in your READY marker at all (the system already has it). Total planned duration ≈ ${parsedAdsPlan.totalDurationSec}s. Style from the plan: ${styleLabel}. Music hint: "${parsedAdsPlan.musicHint || 'none given'}"（informational only — the platform can't generate custom music from a text description, it uses one of its own background tracks; mention this once if relevant). ${parsedAdsPlan.hasOnScreenText ? 'The plan includes "On-Screen Text" — mention once that this platform doesn\'t render separate on-screen text overlays distinct from spoken captions.' : ''} Your job now: this MUST be Model 7 (Ads) — confirm a product photo is uploaded (ask if not), pick ratio (ask if unclear), set "style" from the mapping above, mention the credit cost for ${parsedAdsPlan.scenes.length} planned scenes, then confirm and emit a normal READY marker for model 7 with "idea" as just a short label — do NOT put the script/scenes in "idea".`;
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
    let attachmentNote = [structuredNote, adsScenePlanNote, styleHintNote].filter(Boolean).join(' ') || null;
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
    // ⚠️ Model 8 تحت الصيانة — بس الأدمن يقدر يستخدمه من خلال الايجنت كمان
    const isAdminUser = (user?.email || '').toLowerCase() === (process.env.ADMIN_EMAIL || 'digidelight33@gmail.com').toLowerCase();

    const rawReply = await agentChat({
      message, history, attachmentNote, userPlan, isAdminUser,
      hasPhoto: images.length > 0 || !!photoAlreadyUploaded,
      hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
      hasVideo: !!videoAlreadyUploaded,
      videoDurationSec: videoDurationSec || null,
      hasStructuredScript,
      hasAdsScenePlan,
    });

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
    const isEditMarker = rawReply.includes('###EDIT_SCENE###');
    const isVideoEditMarker = !isEditMarker && rawReply.includes('###VIDEO_EDIT###');
    const markerName = isEditMarker ? '###EDIT_SCENE###' : isVideoEditMarker ? '###VIDEO_EDIT###' : '###READY###';
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

    // ✅ لو المستخدم رفع صوت في نفس الرسالة اللي وصلنا فيها READY، نرفق رابط الصوت الحقيقي
    // عشان الفرونت إند يستخدمه كـ narration فعلي بدل ما يولّد صوت صناعي جديد
    if (ready && uploadedVoiceUrl) {
      ready.uploadedVoiceUrl = uploadedVoiceUrl;
    }

    // ✅ لو نجحنا نطلع "ready"/"editScene"/"videoEdit" بس النص البشري اللي المفروض ييجي بعد
    // الـ JSON اتقطع بالكامل (نادر، بس ممكن لو حد التوكنز وقف بالظبط عند آخر قوس)، منسيبش
    // فقاعة فاضية للعميل
    if ((ready || editScene || videoEdit) && !reply) {
      reply = editScene ? 'تمام، هعدّل المشهد وأدمجه مع باقي الفيديو 🎬' : videoEdit ? 'تمام، هبدأ أعدّل الفيديو دلوقتي 🎬' : 'جاهز، هبدأ التوليد دلوقتي 🎬';
    }


    res.json({ reply, transcript, ready, editScene, videoEdit, uploadedVoiceUrl, structuredScenes: structuredScenesResult, adsScenePlan: adsScenePlanResult });
  } catch (e) {
    console.error('[Agent Chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/limits', authMiddleware, (req, res) => {
  res.json(AGENT_LIMITS);
});

export default router;