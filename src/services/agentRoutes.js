import express from 'express';
import { authMiddleware } from './authRoutes.js';
import { agentChat, transcribeVoiceForAgent, validateAgentImage, AGENT_LIMITS } from './agentService.js';

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

    const { message, history, voiceBase64, imageBase64 } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' });

    let attachmentNote = null;
    let transcript = null;

    if (voiceBase64) {
      try {
        const result = await transcribeVoiceForAgent(voiceBase64);
        transcript = result.text;
        attachmentNote = `User uploaded a voice recording (${Math.round(result.duration)}s). Transcript: "${transcript.slice(0, 300)}"`;
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    if (imageBase64) {
      try {
        validateAgentImage(imageBase64);
        attachmentNote = (attachmentNote ? attachmentNote + ' ' : '') + 'User uploaded a photo (likely for Model 7 ads or Model 5 character reference).';
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }

    const rawReply = await agentChat({ message, history, attachmentNote });

    // ── فصل رسالة الشات عن الأمر التقني (###READY###{...}) اللي بيبدأ التوليد الفعلي ──
    let reply = rawReply;
    let ready = null;
    const markerIdx = rawReply.indexOf('###READY###');
    if (markerIdx !== -1) {
      reply = rawReply.slice(0, markerIdx).trim();
      const jsonPart = rawReply.slice(markerIdx + '###READY###'.length).trim();
      try {
        const parsed = JSON.parse(jsonPart);
        if ([3, 4, 5].includes(parsed.model)) ready = parsed;
      } catch (e) { console.warn('[Agent] Could not parse READY marker:', e.message); }
    }

    res.json({ reply, transcript, ready });
  } catch (e) {
    console.error('[Agent Chat]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/limits', authMiddleware, (req, res) => {
  res.json(AGENT_LIMITS);
});

export default router;
