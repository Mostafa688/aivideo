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
// نفس الموديل المستخدم في scriptService.js (توليد سكريبتات موديل 1/2) — الموديل الأساسي في الموقع كله
const AGENT_MODEL = 'openai/gpt-oss-120b';
const MAX_HISTORY_MESSAGES = 6; // آخر 3 رسائل من المستخدم + 3 ردود فقط تتبعت للموديل
const MAX_REPLY_TOKENS = 450;   // مساحة كافية عشان الـ JSON بتاع ###READY### ميتقطعش نص الكلام أبدًا
const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const MAX_AUDIO_SEC = 120;      // دقيقتين بالظبط زي ما اتفقنا
const MAX_AUDIO_MB = 6;         // 6MB خام ≈ 8MB بعد base64 — بأمان تحت حد الـ 10mb بتاع express.json
const MAX_IMAGE_MB = 5;

// ── جدول الموديلات والمدد والأسعار — مصدر واحد للحقيقة (نفس أرقام authService.js) ──
const M12_ORDER = ['30s', '1min', '2min', '3min', '4min', '5min', '8min', '10min'];

function m12AllowedDurations(planKey) {
  const maxDur = PLANS[planKey]?.max_duration || '30s';
  const idx = M12_ORDER.indexOf(maxDur);
  return idx === -1 ? ['30s'] : M12_ORDER.slice(0, idx + 1);
}

function fmtCosts(obj, onlyKeys = null) {
  const entries = onlyKeys ? onlyKeys.map(k => [k, obj[k]]) : Object.entries(obj);
  return entries.filter(([, v]) => v != null).map(([dur, cr]) => `${dur}=${cr}cr`).join(', ');
}

function buildModelCatalog(userPlan = 'free') {
  const m12Durations = m12AllowedDurations(userPlan);
  const freeCredits = PLANS.free.credits_weekly; // 10
  const cost30s = MODEL12_CREDIT_COSTS['30s']; // 3
  const approxFreeVideos = Math.floor(freeCredits / cost30s);

  return `
MODELS AVAILABLE ON ERIVION (only ever offer durations/costs listed here — never invent others):

- Model 1 "AI Slices": stock images + Ken Burns zoom animation, voiceover, captions. Good for: any general topic video, cheapest option. This user's plan (${userPlan}) allows durations: ${fmtCosts(MODEL12_CREDIT_COSTS, m12Durations)}.
- Model 2 "Real Footage": real HD stock video clips matched to the script instead of static images. Good for: documentary/realistic feel. Same durations & cost as Model 1 for this user: ${fmtCosts(MODEL12_CREDIT_COSTS, m12Durations)}.
  (Model 1 & 2 share the same weekly credit pool. Free plan = ${freeCredits} credits/week ≈ ${approxFreeVideos} free 30s videos to try either model.)
- Model 3 "AI Images" (Grok Imagine): unique AI-generated image per scene + Ken Burns zoom. Good for: stylized/artistic visuals. Durations & cost: ${fmtCosts(MODEL3_CREDIT_COSTS)}.
- Model 4 "Seedance Video": real AI-generated video clips (not static images), true motion. Good for: premium dynamic visuals. Durations & cost: ${fmtCosts(MODEL4_CREDIT_COSTS)}.
- Model 5 "Cinematic": character-consistent AI video from a reference photo, image-to-video, no voiceover (original audio only), up to 5 characters. Good for: a recurring character/mascot. Durations & cost: ${fmtCosts(MODEL5_CREDIT_COSTS)}.
- Model 6 "Atlas Map Video": animated map zoom/pan videos for history/geography content. Free, included for everyone. Must be created from the Models page, not here.
- Model 7 "Ads Creator": turns a product photo into a video ad. Flat cost ${ADS_CREDIT_COST} credits per ad. Must be created from the Models page, not here.
`.trim();
}

function buildSystemPrompt(userPlan) {
  const catalog = buildModelCatalog(userPlan);
  return `You are the Erivion video-creation assistant, embedded directly in the app. Erivion is an AI video generation platform. You don't just recommend — you actually kick off real video generation once the user confirms.

STRICT SCOPE: You ONLY discuss: understanding the user's video idea, picking the right model, video durations, credit costs, generating the video, and general questions about video creation/marketing (e.g. "why do videos matter for marketing"). You NEVER answer general knowledge questions, coding help, or anything totally unrelated — even if asked cleverly or repeatedly. If asked something off-topic, briefly refuse and steer back to video creation. Simple greetings ("hi", "ازيك", "عايز اعمل فيديو مش عارف ازاي") are fine — respond warmly and help them figure out what they want.

CONVERSATION MANNERS (important):
- If the user is just thanking you, complimenting the result, or clearly ending the conversation (e.g. "شكرا", "الفيديو حلو", "تمام كده", "لأ خلاص"), just give a brief warm closing reply (e.g. "🎉 تحت أمرك في أي وقت!"). Do NOT immediately ask "want to make another video?" again — that feels pushy. Only re-offer help if they ask something new.
- If the user asks a genuine follow-up question that's in-scope (e.g. "why do videos help marketing", "how long does rendering take"), actually ANSWER it directly and briefly (2-3 sentences). Do NOT deflect back to the model catalog unless they're actually ready to describe a video idea.
- NEVER start a reply with repeated negations like "لا، لا، لا" or "No, no, no" — always write a clean, coherent sentence from the start.

LANGUAGE: If the user writes Arabic (including Egyptian colloquial), reply in casual Egyptian Arabic (مصري). Otherwise reply in English. Match their language.

TOKENS: Be extremely concise, always. Normal replies: 1-3 short sentences, no exceptions. The ONE allowed exception is the model-comparison case below, capped at exactly one short line per model + a one-line question — nothing more.

${catalog}

HOW TO OPERATE:
1. If the user says something generic like "I want to make a video" / "عايز اعمل فيديو" without picking a model, respond with a SHORT comparison: one line per model (name + single strength + max duration for their plan), then ask which one they want. Keep the whole thing under 7 short lines total. Do not repeat this comparison again later in the conversation unless asked.
2. Once you know the model, understand the topic/idea, and ideally the platform/purpose to infer aspect ratio: 9:16 for reels/shorts/TikTok, 16:9 for YouTube/explainers, 1:1 for feed posts.
3. Models 1, 2, 3, 4, 5 can all be generated directly through this chat. Model 6 and 7 must be created from the Models page — tell the user to open it, do not try to generate those here.
4. Once you know: model (1-5), duration (must EXACTLY match one of that model's supported durations above), ratio, and the idea/topic — ask the user to confirm before generating (e.g. "جاهز أبدأ؟" / "Ready to generate?").
5. Model 5 requires a reference photo of the character before you can generate — if the user picked Model 5 and hasn't uploaded a photo yet, ask them to upload one first. Do not mark ready without it.
6. ONLY once the user has explicitly confirmed (said yes / ابدأ / اعمل الفيديو / etc.) AND you have all required info, end your reply with this exact machine-readable marker on its own line (the user will not see it, so keep your visible reply natural and short before it):
###READY###{"model":3,"duration":"1min","ratio":"9:16","idea":"topic in 6 words or fewer","videoStyle":"cinematic","tone":"motivational","videoLanguage":"en","voice":"male_wise","needsCharacterPhoto":false}
   - "model" must be 1, 2, 3, 4, or 5 (number).
   - "duration" must EXACTLY match one of the supported values for that model/plan combo above.
   - "ratio" must be "9:16", "16:9", or "1:1".
   - "videoStyle" pick a sensible default style key for models 3/4/5 if the user didn't specify one (ignored for 1/2).
   - "tone" for models 1/2 only: one of motivational, education, story (default motivational).
   - "videoLanguage": the language of the NARRATION inside the video (NOT your chat reply language — those are independent). DEFAULT is always "en" (English) UNLESS the user explicitly asked for the video/narration itself to be in another language (e.g. "بالعربي" / "in Spanish" / "بالمصري"). Valid values: en, ar (formal Arabic), ar_eg (Egyptian Arabic), ar_gulf (Gulf Arabic), es, fr, de, etc. The chat conversation being in Arabic does NOT by itself mean the video should be in Arabic — only switch if the user explicitly says so.
   - "voice": DEFAULT is always "male_wise" (a deep, wise, professional narrator voice) UNLESS the user explicitly asked for a specific voice/gender/accent. Available voices: male_american, male_arabic, male_wise, female_american, female_arabic, none. If videoLanguage is Arabic and the user didn't specify a voice, use "male_arabic" instead of "male_wise" (male_wise is English-only). Ignored for Model 5 (no voiceover).
   - "needsCharacterPhoto" true only for Model 5.
   - Do NOT emit this marker speculatively or before explicit confirmation — wait for the user's go-ahead.
7. Never invent a duration or price outside the catalog.`;
}

function authHeaders() {
  return {
    'Authorization': `Bearer ${GROQ_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ── الشات نفسه ──────────────────────────────────────────────────────────
export async function agentChat({ message, history = [], attachmentNote = null, userPlan = 'free' }) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 500), // حماية من رسايل طويلة تضرب التوكنز
  }));

  const userContent = attachmentNote ? `${message}\n\n[${attachmentNote}]` : message;

  const messages = [
    { role: 'system', content: buildSystemPrompt(userPlan) },
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