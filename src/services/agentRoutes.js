import express from 'express';
import { authMiddleware } from './authRoutes.js';
import { agentChat, transcribeVoiceForAgent, validateAgentImage, AGENT_LIMITS } from './agentService.js';
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

    const { message, history, voiceBase64, imageBase64, imagesBase64, photoAlreadyUploaded, voiceAlreadyUploaded } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    // ✅ FIX: بيقبل دلوقتي مصفوفة صور (لحد 2) في نفس الرسالة، مش صورة واحدة بس —
    // imageBase64 (مفرد) لسه متاح للتوافق مع أي كود قديم، بس imagesBase64 (جمع) هو الأساس دلوقتي
    const images = Array.isArray(imagesBase64) && imagesBase64.length
      ? imagesBase64.slice(0, 2)
      : (imageBase64 ? [imageBase64] : []);

    let attachmentNote = null;
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
        const note = images.length > 1
          ? 'User just uploaded 2 photos (two characters) for Model 5. This fully satisfies the character reference requirement for BOTH people — treat it as met right now, do not ask for more photos, and proceed toward confirming and generating if you already have the other required details. Mention the cost is a bit higher than a single photo.'
          : 'User just uploaded a photo. This fully satisfies the required product/character photo for Model 7 (Ads) or Model 5 (character reference) — treat the photo requirement as met right now, do not ask for it again, and proceed toward confirming and generating if you already have the other required details.';
        attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + note;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const user = await getUserById(userId).catch(() => null);
    const userPlan = user?.plan || 'free';

    const rawReply = await agentChat({
      message, history, attachmentNote, userPlan,
      hasPhoto: images.length > 0 || !!photoAlreadyUploaded,
      hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
    });

    // ✅ NEW: لو الموديل رجع رد فاضي تمامًا (مثلاً استهلك كل التوكنز في تفكير مخفي غير ظاهر
    // ولم يترك أي نص فعلي) — منسيبش فقاعة فاضية تظهر للعميل وكأن الأجنت "مش بيرد"، نرجع
    // رسالة واضحة تطلب إعادة المحاولة بدل ما نرسل reply فاضي للفرونت إند
    if (!rawReply || !rawReply.trim()) {
      console.warn('[Agent Chat] ⚠️ Empty reply from model — likely reasoning tokens exhausted max_tokens before any visible content');
      return res.json({
        reply: 'معلش، حصل تأخير بسيط في التفكير — ممكن تبعت رسالتك تاني؟',
        transcript, ready: null, editScene: null, uploadedVoiceUrl,
      });
    }

    // ── فصل الأمر التقني (###READY### أو ###EDIT_SCENE###) عن رسالة الشات — الـ JSON بقى بييجي
    // الأول في الرد (مش الآخر) عشان لو حصل قطع من حد التوكنز يقطع في الكلام مش في الـ JSON ──
    let reply = rawReply;
    let ready = null;
    let editScene = null;
    const isEditMarker = rawReply.includes('###EDIT_SCENE###');
    const markerName = isEditMarker ? '###EDIT_SCENE###' : '###READY###';
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
        } else if ([1, 2, 3, 4, 5, 7].includes(parsed.model)) {
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
          } else if ([1, 2, 3, 4, 5, 7].includes(repaired.model)) {
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

    // ✅ لو نجحنا نطلع "ready" بس النص البشري اللي المفروض ييجي بعد الـ JSON اتقطع بالكامل
    // (نادر، بس ممكن لو حد التوكنز وقف بالظبط عند آخر قوس)، منسيبش فقاعة فاضية للعميل
    if ((ready || editScene) && !reply) {
      reply = editScene ? 'تمام، هعدّل المشهد وأدمجه مع باقي الفيديو 🎬' : 'جاهز، هبدأ التوليد دلوقتي 🎬';
    }

    res.json({ reply, transcript, ready, editScene, uploadedVoiceUrl });
  } catch (e) {
    console.error('[Agent Chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/limits', authMiddleware, (req, res) => {
  res.json(AGENT_LIMITS);
});

export default router;