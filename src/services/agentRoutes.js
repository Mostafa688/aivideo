import express from 'express';
import { authMiddleware } from './authRoutes.js';
import { agentChat, transcribeVoiceForAgent, validateAgentImage, AGENT_LIMITS } from './agentService.js';
import { getUserById } from './authService.js';

const router = express.Router();

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

    // ── فصل رسالة الشات عن الأمر التقني (###READY###{...}) اللي بيبدأ التوليد الفعلي ──
    let reply = rawReply;
    let ready = null;
    const markerIdx = rawReply.indexOf('###READY###');
    if (markerIdx !== -1) {
      reply = rawReply.slice(0, markerIdx).trim();
      const jsonPart = rawReply.slice(markerIdx + '###READY###'.length).trim();
      try {
        const parsed = JSON.parse(jsonPart);
        if ([1, 2, 3, 4, 5, 7].includes(parsed.model)) ready = parsed;
      } catch (e) { console.warn('[Agent] Could not parse READY marker:', e.message); }
    }

    // ✅ لو المستخدم رفع صوت في نفس الرسالة اللي وصلنا فيها READY، نرفق رابط الصوت الحقيقي
    // عشان الفرونت إند يستخدمه كـ narration فعلي بدل ما يولّد صوت صناعي جديد
    if (ready && uploadedVoiceUrl) {
      ready.uploadedVoiceUrl = uploadedVoiceUrl;
    }

    res.json({ reply, transcript, ready, uploadedVoiceUrl });
  } catch (e) {
    console.error('[Agent Chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/limits', authMiddleware, (req, res) => {
  res.json(AGENT_LIMITS);
});

export default router;