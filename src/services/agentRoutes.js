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
  try {
    const userId = req.user.userId;
    const now = Date.now();
    const last = lastRequestAt.get(userId) || 0;
    if (now - last < MIN_INTERVAL_MS) {
      return res.status(429).json({ error: 'Please wait a moment before sending another message.' });
    }
    lastRequestAt.set(userId, now);

    const { message, history, voiceBase64, imageBase64, photoAlreadyUploaded, voiceAlreadyUploaded } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

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

    if (imageBase64) {
      try {
        validateAgentImage(imageBase64);
        attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + 'User just uploaded a photo. This fully satisfies the required product/character photo for Model 7 (Ads) or Model 5 (character reference) — treat the photo requirement as met right now, do not ask for it again, and proceed toward confirming and generating if you already have the other required details.';
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const user = await getUserById(userId).catch(() => null);
    const userPlan = user?.plan || 'free';

    const rawReply = await agentChat({
      message, history, attachmentNote, userPlan,
      hasPhoto: !!imageBase64 || !!photoAlreadyUploaded,
      hasVoice: !!voiceBase64 || !!voiceAlreadyUploaded,
    });

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