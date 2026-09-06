import express from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from './authRoutes.js';
import { agentChat, transcribeVoiceForAgent, validateAgentImage, analyzeSceneImage, parseStructuredScript, parseAdsScenePlan, AGENT_LIMITS } from './agentService.js';
import { getUserById, logAgentConversation, setUserRegion, updateUserName, findSimilarAgentRequest, rememberAgentRequest, listManagedChannelsForUser, getManagedChannelById } from './authService.js';
import { searchWeb, WEB_SEARCH_AVAILABLE } from './webSearchService.js';
import { getFreshChannelIdea } from './channelSchedulerService.js';
import { startWhiteboardVideoCreation } from './whiteboardVideoRoutes.js';
import { NEW_IMAGE_MODELS } from './newImageModelsService.js';
import { NEW_VIDEO_MODELS } from './newVideoModelsService.js';
import { getMaxClipSeconds } from './creditPricingEngine.js';

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

    const { message, history, voiceBase64, imageBase64, imagesBase64, photoAlreadyUploaded, voiceAlreadyUploaded, videoAlreadyUploaded, videoDurationSec, hasStructuredScript: clientHasStructuredScript, hasAdsScenePlan: clientHasAdsScenePlan, styleHint, hasClonedVoice } = req.body;
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
      structuredNote = `The user pasted a pre-divided scene breakdown with EXACTLY ${parsedScript.scenes.length} scenes, already parsed and captured exactly as written by the system (not by you) — you must NOT reproduce, retype, or summarize the scene text yourself, and must NOT include a "structuredScenes" field in your READY marker at all (the system already has the real content). Stated/implied total duration ≈ ${durLabel}. Voice style hint from the user: "${parsedScript.voiceHint || 'none given'}". Music requested: ${parsedScript.hasMusic ? 'yes' : 'no'}. Your job now: pick which model — 1, 2, 3, 4, 5's normal modes (never map-video), or 8 if the user wants the cheaper AI-video-clip engine and it's available to them (ask if unclear), pick ratio (ask if unclear). FOR MODELS 1/2/3/4/5: pick the closest supported duration bucket to ${durLabel} for pricing (the real scene count stays ${parsedScript.scenes.length} regardless — if that's more scenes than the bucket's standard count, remember the per-extra-scene surcharge: Model 3 = 20cr, Model 4 = 35cr, Model 5 = 70cr). FOR MODEL 8: there is no duration bucket and no per-extra-scene surcharge — cost is simply each scene's own duration (up to 20s each, using the plan's per-scene timing if given, else 5s default) × the per-second audio-tier rate (4/5/6cr/sec) summed up; the scene count you generate MUST be exactly ${parsedScript.scenes.length}, never fewer — this has been a real production bug (collapsing a multi-scene plan into a single scene), do not repeat it. Map the voice hint to the closest "voice" option, set "music" accordingly (Model 8 has no music toggle), mention once that any "On-screen Text" lines won't render as a separate overlay (captions come from narration audio only), then confirm and emit a normal READY marker with "idea" as just a short label.`;
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
    const userRegion = user?.region || null;
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
            hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice,
          });
        } else if (query) {
          rawReply = await agentChat({
            message, history, attachmentNote: (attachmentNote ? attachmentNote + ' ' : '') + 'You asked to research this but web search is not configured on this deployment — answer using your own knowledge and honestly tell the user you cannot verify it live right now.', userPlan, isAdminUser,
            hasPhoto: images.length > 0 || !!photoAlreadyUploaded, hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
            hasVideo: !!videoAlreadyUploaded, videoDurationSec: videoDurationSec || null,
            hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice,
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
          hasStructuredScript, hasAdsScenePlan, userRegion, memoryNote, userChannels, hasClonedVoice,
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
    const isEditMarker = rawReply.includes('###EDIT_SCENE###');
    const isVideoEditMarker = !isEditMarker && rawReply.includes('###VIDEO_EDIT###');
    const isImageGenMarker = !isEditMarker && !isVideoEditMarker && rawReply.includes('###GENERATE_IMAGE###');
    const isVideoGenMarker = !isEditMarker && !isVideoEditMarker && !isImageGenMarker && rawReply.includes('###GENERATE_VIDEO###');
    const markerName = isEditMarker ? '###EDIT_SCENE###' : isVideoEditMarker ? '###VIDEO_EDIT###' : isImageGenMarker ? '###GENERATE_IMAGE###' : isVideoGenMarker ? '###GENERATE_VIDEO###' : '###READY###';
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
          if (typeof parsed.model === 'string' && NEW_IMAGE_MODELS[parsed.model] && typeof parsed.prompt === 'string' && parsed.prompt.trim()) generateImage = parsed;
        } else if (isVideoGenMarker) {
          if (typeof parsed.model === 'string' && NEW_VIDEO_MODELS[parsed.model] && typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
            const maxSec = getMaxClipSeconds(parsed.model);
            if (maxSec && (!Number.isFinite(parsed.durationSec) || parsed.durationSec > maxSec)) parsed.durationSec = maxSec;
            generateVideo = parsed;
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
            if (typeof repaired.model === 'string' && NEW_IMAGE_MODELS[repaired.model] && typeof repaired.prompt === 'string' && repaired.prompt.trim()) {
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

    // ✅ NEW: توليد صور مستقل بيستخدم صور مرفقة في نفس الرسالة كمرجع بصري لو موجودة
    if (generateImage && images.length) {
      generateImage.referenceImageUrls = images;
    }

    // ✅ NEW: توليد فيديو مستقل (Veo/Kling/Seedance/Luma) بيستخدم أول صورة مرفقة في نفس
    // الرسالة كـ image-to-video لو الموديل بيدعم كده — نفس نمط generateImage فوق بالظبط
    if (generateVideo && images.length && NEW_VIDEO_MODELS[generateVideo.model]?.supportsImageInput) {
      generateVideo.imageUrl = images[0];
    }

    // ✅ لو نجحنا نطلع "ready"/"editScene"/"videoEdit"/"generateImage"/"generateVideo" بس
    // النص البشري اللي المفروض ييجي بعد الـ JSON اتقطع بالكامل (نادر، بس ممكن لو حد
    // التوكنز وقف بالظبط عند آخر قوس)، منسيبش فقاعة فاضية للعميل
    if ((ready || editScene || videoEdit || generateImage || generateVideo) && !reply) {
      reply = editScene ? 'تمام، هعدّل المشهد وأدمجه مع باقي الفيديو.' : videoEdit ? 'تمام، هبدأ أعدّل الفيديو دلوقتي.' : generateImage ? 'تمام، هبدأ أولّد الصور دلوقتي.' : generateVideo ? 'تمام، هبدأ أولّد الفيديو دلوقتي.' : 'جاهز، هبدأ التوليد دلوقتي.';
    }

    // ✅ FIX (باج حقيقي حصل مع عملاء حقيقيين): مفيش رصيد حقيقي أبدًا للعميل على خطة "free"
    // (بيبدأ بـ 0 كريديت دايمًا)، فأي READY/EDIT_SCENE/VIDEO_EDIT/GENERATE_IMAGE ليه كان
    // هيفشل في السيرفر بعد ما البوت يكون قال للعميل "جاهز، هبدأ التوليد الآن" — يسيب العميل
    // مستني فيديو/صورة مش هيتعمل ("وين الفيديو؟"). البرومبت بقى بيمنع الموديل من عمل ده
    // أصلاً، بس ده حاجز إضافي في الكود نفسه يضمن إن العميل محدش هيتقال له كلام مضلل حتى لو
    // الموديل تجاهل التعليمات
    if ((ready || editScene || videoEdit || generateImage || generateVideo) && userPlan === 'free') {
      ready = null; editScene = null; videoEdit = null; generateImage = null; generateVideo = null;
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
      reply, transcript, ready, editScene, videoEdit, generateImage, generateVideo, uploadedVoiceUrl,
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

export default router;