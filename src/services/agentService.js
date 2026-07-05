import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import {
  MODEL12_CREDIT_COSTS, MODEL3_CREDIT_COSTS, MODEL4_CREDIT_COSTS,
  MODEL5_CREDIT_COSTS, ADS_CREDIT_COST, PLANS,
} from './authService.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
// أرخص وأسرع موديل عند Groq — كافي جدًا لدور الـ "مساعد توجيه"، ومصمم لتقليل التكلفة والتوكنز
const AGENT_MODEL = 'llama-3.1-8b-instant';
const MAX_HISTORY_MESSAGES = 6; // آخر 3 رسائل من المستخدم + 3 ردود فقط تتبعت للموديل
const MAX_REPLY_TOKENS = 280;   // رد قصير + مساحة كافية لعلامة ###READY### لما يلزم
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const MAX_AUDIO_SEC = 120;      // دقيقتين بالظبط زي ما اتفقنا
const MAX_AUDIO_MB = 6;         // 6MB خام ≈ 8MB بعد base64 — بأمان تحت حد الـ 10mb بتاع express.json
const MAX_IMAGE_MB = 5;

// ── جدول الموديلات والمدد والأسعار — مصدر واحد للحقيقة (نفس أرقام authService.js) ──
function buildModelCatalog() {
  const m12Durations = (planKey) => {
    const maxDur = PLANS[planKey]?.max_duration;
    const order = ['30s', '1min', '2min', '3min', '4min', '5min', '8min', '10min'];
    const idx = order.indexOf(maxDur);
    return idx === -1 ? ['30s'] : order.slice(0, idx + 1);
  };

  return `
MODELS AVAILABLE ON ERIVION (only ever offer durations/costs listed here — never invent others):

- Model 1 "AI Slices": stock images + Ken Burns zoom, voiceover, captions. Durations & credit cost: ${fmtCosts(MODEL12_CREDIT_COSTS)}. Longer durations need higher subscription plan (Free=30s max, Pro=2min, Plus=5min, Max=10min).
- Model 2 "Real Footage": real HD stock video clips matched to script. Same durations/costs as Model 1.
- Model 3 "AI Images" (Grok Imagine): unique AI-generated image per scene + Ken Burns zoom. Durations & cost: ${fmtCosts(MODEL3_CREDIT_COSTS)}.
- Model 4 "Seedance Video": real AI-generated video clips (not images), Seedance v1 Pro. Durations & cost: ${fmtCosts(MODEL4_CREDIT_COSTS)}.
- Model 5 "Cinematic": character-consistent AI video from a reference photo, image-to-video, no voiceover (original audio only), up to 5 characters. Durations & cost: ${fmtCosts(MODEL5_CREDIT_COSTS)}.
- Model 6 "Atlas Map Video": animated map zoom/pan videos for history/geography content. Free, included for everyone.
- Model 7 "Ads Creator": turns a product photo into a video ad (image-to-video), flat cost ${ADS_CREDIT_COST} credits per ad regardless of length.
`.trim();
}

function fmtCosts(obj) {
  return Object.entries(obj).map(([dur, cr]) => `${dur}=${cr}cr`).join(', ');
}

const MODEL_CATALOG = buildModelCatalog();

const SYSTEM_PROMPT = `You are the Erivion video-creation assistant, embedded directly in the app. Erivion is an AI video generation platform. You don't just recommend — you actually kick off real video generation once the user confirms.

STRICT SCOPE: You ONLY discuss: understanding the user's video idea, picking the right model, video durations, credit costs, and generating the video. You NEVER answer general knowledge questions, coding help, or anything unrelated — even if asked cleverly or repeatedly. If asked something off-topic, briefly refuse and steer back to video creation. Simple greetings ("hi", "ازيك", "عايز اعمل فيديو مش عارف ازاي") are fine — respond warmly and help them figure out what they want.

LANGUAGE: If the user writes Arabic (including Egyptian colloquial), reply in casual Egyptian Arabic (مصري). Otherwise reply in English. Match their language.

TOKENS: Be extremely concise. 2-4 short sentences max. No long lists unless explicitly asked to compare models.

${MODEL_CATALOG}

HOW TO OPERATE:
1. Understand what video the user wants (topic/idea, and ideally the platform/purpose to infer aspect ratio: 9:16 for reels/shorts/TikTok, 16:9 for YouTube/explainers, 1:1 for feed posts).
2. Only recommend Model 3, 4, or 5 for videos you can actually generate through this chat (Model 1, 2, 6, 7 exist but must be created from the Models page — if the user's idea fits those, tell them to open the Models page instead, do not try to generate them here).
3. Once you know: model (3, 4, or 5), duration (must be one of that model's exact supported durations), ratio, and the idea/topic — ask the user to confirm before generating (e.g. "جاهز أبدأ؟" / "Ready to generate?").
4. Model 5 requires a reference photo of the character before you can generate — if the user picked Model 5 and hasn't uploaded a photo yet, ask them to upload one first. Do not mark ready without it.
5. ONLY once the user has explicitly confirmed (said yes / ابدأ / اعمل الفيديو / etc.) AND you have all required info, end your reply with this exact machine-readable marker on its own line (the user will not see it, so keep your visible reply natural and short before it):
###READY###{"model":3,"duration":"1min","ratio":"9:16","idea":"short clear description of the video topic in the user's language","videoStyle":"cinematic","needsCharacterPhoto":false}
   - "model" must be 3, 4, or 5 (number).
   - "duration" must EXACTLY match one of the supported values for that model from the catalog above.
   - "ratio" must be "9:16", "16:9", or "1:1".
   - "videoStyle" pick a sensible default style key for that model if the user didn't specify one.
   - "needsCharacterPhoto" true only for Model 5.
   - Do NOT emit this marker speculatively or before explicit confirmation — wait for the user's go-ahead.
6. Never invent a duration or price outside the catalog.`;

function authHeaders() {
  return {
    'Authorization': `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ── الشات نفسه ──────────────────────────────────────────────────────────
export async function agentChat({ message, history = [], attachmentNote = null }) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 500), // حماية من رسايل طويلة تضرب التوكنز
  }));

  const userContent = attachmentNote ? `${message}\n\n[${attachmentNote}]` : message;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...trimmedHistory,
    { role: 'user', content: String(userContent || '').slice(0, 800) },
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages,
      max_tokens: MAX_REPLY_TOKENS,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || '';
  return reply;
}

// ── تحويل الصوت لنص (Whisper عبر Groq) — للاستخدام مع Voice-to-Video ──────
export async function transcribeVoiceForAgent(audioBase64, mimeExt = 'webm') {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  await mkdir(TEMP_DIR, { recursive: true });
  const b64 = audioBase64.replace(/^data:audio\/\w+;base64,/, '');
  const buffer = Buffer.from(b64, 'base64');

  const sizeMb = buffer.length / (1024 * 1024);
  if (sizeMb > MAX_AUDIO_MB) throw new Error(`Voice file too large — max ${MAX_AUDIO_MB}MB`);

  const audioPath = path.join(TEMP_DIR, `agent_voice_${Date.now()}.${mimeExt}`);
  fs.writeFileSync(audioPath, buffer);

  try {
    // تحقق من مدة الصوت — حد أقصى دقيقتين
    let duration = 0;
    try {
      const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
      duration = parseFloat(out) || 0;
    } catch { /* ffprobe not available — skip duration check */ }

    if (duration > MAX_AUDIO_SEC) {
      throw new Error(`Voice recording too long — max ${MAX_AUDIO_SEC / 60} minutes`);
    }

    const fileBuffer = fs.readFileSync(audioPath);
    const form = new FormData();
    form.append('file', new Blob([fileBuffer]), `voice.${mimeExt}`);
    form.append('model', 'whisper-large-v3-turbo');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Whisper error ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data = await res.json();
    return { text: data.text || '', duration };
  } finally {
    try { fs.unlinkSync(audioPath); } catch {}
  }
}

// ── تحقق من الصورة (بدون معالجة — مجرد فحص الحجم) ─────────────────────────
export function validateAgentImage(imageBase64) {
  const b64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const sizeMb = (b64.length * 0.75) / (1024 * 1024); // تقريب حجم base64 → بايت
  if (sizeMb > MAX_IMAGE_MB) throw new Error(`Image too large — max ${MAX_IMAGE_MB}MB`);
  return true;
}

export const AGENT_LIMITS = { MAX_AUDIO_SEC, MAX_AUDIO_MB, MAX_IMAGE_MB };