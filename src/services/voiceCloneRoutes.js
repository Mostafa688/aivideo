import express from 'express';
import { authMiddleware } from './authRoutes.js';
import { saveClonedVoice, getClonedVoiceForUser, deleteClonedVoice, getCreditsBalance, chargeCredits, addCreditsBalance } from './authService.js';
import { checkVoiceSampleDuration, uploadVoiceSampleToR2, cloneVoiceNarration, splitTextIntoChunks, MAX_VOICE_SAMPLE_SEC, RECOMMENDED_VOICE_SAMPLE_SEC } from './voiceCloneService.js';
import { getFlatCreditCost } from './creditPricingEngine.js';

const router = express.Router();

router.get('/limits', (req, res) => {
  res.json({ maxSec: MAX_VOICE_SAMPLE_SEC, recommendedSec: RECOMMENDED_VOICE_SAMPLE_SEC });
});

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const voice = await getClonedVoiceForUser(req.user.userId);
    res.json({ voice });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { audioBase64, label } = req.body;
    if (!audioBase64) return res.status(400).json({ error: 'audioBase64 is required' });
    const { buffer, durationSec } = checkVoiceSampleDuration(audioBase64);
    const mimeMatch = audioBase64.match(/^data:audio\/(\w+);base64,/);
    const ext = mimeMatch ? (mimeMatch[1] === 'mpeg' ? 'mp3' : mimeMatch[1]) : 'mp3';
    const sampleUrl = await uploadVoiceSampleToR2(buffer, ext);
    const voice = await saveClonedVoice(req.user.userId, { label, sampleUrl, durationSec });
    res.json({ voice });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/', authMiddleware, async (req, res) => {
  try {
    await deleteClonedVoice(req.user.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── توليد تعليق صوتي بصوت العميل المحفوظ — للموديلات 1-5 (سكريبت كامل واحد) ───────────
// ✅ FIX (باج حقيقي: التوليد ده كان مجاني بالكامل من غير أي خصم كريديت رغم إنه بينادي
// Replicate فعليًا لكل قطعة نص — راجع chatterbox_voice_clone في creditPricingEngine.js):
// بنحسب عدد القطع اللي النص هيتقسملها (نفس splitTextIntoChunks المستخدمة جوه
// cloneVoiceNarration بالظبط) ونحصّل كريديت لكل قطعة قبل التوليد، ونرجّعه لو التوليد فشل
router.post('/narrate', authMiddleware, async (req, res) => {
  let cost = 0;
  try {
    const { text, videoLanguage } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    const voice = await getClonedVoiceForUser(req.user.userId);
    if (!voice) return res.status(404).json({ error: 'No saved voice found — upload one first via "Save my voice".' });

    const chunkCount = splitTextIntoChunks(text).length;
    cost = getFlatCreditCost('chatterbox_voice_clone') * chunkCount;
    const balance = await getCreditsBalance(req.user.userId);
    if (balance < cost) return res.status(403).json({ error: 'quota_exceeded', message: `This needs ${cost} credits, you have ${balance}.`, cost, remaining: balance });
    const charge = await chargeCredits(req.user.userId, cost);
    if (!charge.success) return res.status(403).json({ error: 'quota_exceeded', message: `This needs ${cost} credits, you have ${charge.remaining}.`, cost, remaining: charge.remaining });

    try {
      const audioPath = await cloneVoiceNarration(voice.sample_url, text, videoLanguage || 'en');
      res.json({ audioUrl: '/' + audioPath.replace(/\\/g, '/'), creditCost: cost });
    } catch (genErr) {
      await addCreditsBalance(req.user.userId, cost);
      throw genErr;
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
