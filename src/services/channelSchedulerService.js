// ── channelSchedulerService.js ───────────────────────────────────────────────
// دورة "القناة اليومية": كل قناة نشطة بنجيبلها فكرة قوية (VidIQ + Groq) مرة كل يوم،
// نبعت للعميل إيميل فيه Approve/Reject، ولو وافق بنعمل الفيديو فعليًا (موديل 8 —
// نفس محرك المشاهد الرخيص، بصوت أو من غيره حسب تفضيل العميل) ونبعتله لينك الفيديو.

import fetch from 'node-fetch';
import crypto from 'crypto';
import {
  getDueManagedChannels, markManagedChannelRun, createDailyVideoRun,
  getDailyVideoRunByToken, updateDailyVideoRunStatus, getManagedChannelById,
  mintInternalToken, getUserById, getCreditsBalance, chargeCredits, saveVideo,
} from './authService.js';
import { buildChannelProfile, findVideoIdeaCandidates, verifyVidiqKey } from './vidiqClientService.js';
import { renderModel8Video } from './pvideoService.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AGENT_MODEL = 'openai/gpt-oss-120b';
const INTERNAL_BASE = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://erivion.net';
const BACKEND_URL = process.env.BACKEND_URL || process.env.SITE_URL || FRONTEND_URL;

// نفس أسعار موديل 8 بالظبط (index.js) — لازم يفضلوا متطابقين لو اتغيروا هناك
const MODEL8_RATE_NONE = 4;
const MODEL8_RATE_VOICEOVER = 5;

const SHORT_FORM = { sceneCount: 6, sceneDurationSec: 5, ratio: '9:16' };   // ~30s
const LONG_FORM = { sceneCount: 18, sceneDurationSec: 10, ratio: '16:9' }; // ~3min

async function draftDailyIdea(profile, candidates, format, uses_voice) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const titlesList = candidates.map(c => `- ${c.title}`).join('\n') || '(none found)';
  const recentList = (profile.recentTitles || []).map(t => `- ${t}`).join('\n') || '(no recent videos)';
  const system = `You plan ONE new YouTube video idea per day for a real channel, based on real data. You are given the channel's own recent video titles (so you can match its established language, dialect, and tone) and a list of currently-breaking-out videos in its niche (for inspiration only — never copy a title/idea verbatim, always make something original and specific). Output ONLY valid JSON: {"title":"...", "brief":"1-2 sentence description of what the video covers", "videoLanguage":"en"|"ar"|"ar_eg"|"ar_gulf"|etc, "voiceoverScript":"if voice is requested, a short natural narration opening line in the channel's own language/dialect matching its recent titles, else omit"}. Match the channel's actual language and dialect (e.g. Egyptian Arabic vs Gulf Arabic vs MSA vs English) based on its recent titles — do not default to English or MSA if the channel clearly writes in a dialect. The video format is ${format === 'short' ? 'a SHORT (under 60s, punchy, single hook)' : 'a LONG-FORM video (several minutes, more narrative depth)'}.`;
  const user = `Channel recent titles:\n${recentList}\n\nCurrently trending/breakout titles in this niche (inspiration only, do not copy):\n${titlesList}\n\nChannel topics: ${(profile.topics || []).join(', ') || 'unknown'}. Voice narration wanted: ${uses_voice ? 'yes' : 'no'}.\n\nJSON only:`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 500, temperature: 0.7, reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

// ✅ NEW: نفس منطق جلب الفكرة، بس كدالة منفصلة قابلة لإعادة الاستخدام — الدورة اليومية
// تحت بتستخدمها، وكمان الايجنت في الشات (agentRoutes.js) بينادوها مباشرة لما العميل
// يطلب فيديو لقناته دلوقتي من غير ما يستنى الإيميل اليومي
export async function getFreshChannelIdea(channel) {
  let channelId = channel.channel_id;
  if (!channelId) {
    const verified = await verifyVidiqKey(channel.vidiq_api_key).catch(() => null);
    channelId = verified?.channels?.[0]?.channelId || null;
    if (!channelId) throw new Error('No YouTube channel found for this VidIQ key');
  }
  const profile = await buildChannelProfile(channel.vidiq_api_key, channelId);
  const candidates = await findVideoIdeaCandidates(channel.vidiq_api_key, profile);
  const format = channel.format_pref === 'auto' ? profile.format : channel.format_pref;
  const idea = await draftDailyIdea(profile, candidates, format, !!channel.uses_voice);
  return { idea, format, profile };
}

// ── الخطوة اليومية: تدور على القنوات المستحقة، تجيب فكرة، تبعت إيميل الموافقة ──────
export async function runDailyChannelCheck() {
  const due = await getDueManagedChannels();
  for (const channel of due) {
    try {
      await markManagedChannelRun(channel.id); // نعلّم فورًا عشان مانعملهاش مرتين لو فشلت
      const { idea, format } = await getFreshChannelIdea(channel);

      const token = crypto.randomBytes(24).toString('hex');
      await createDailyVideoRun({
        channelId: channel.id, userId: channel.user_id,
        ideaTitle: idea.title, ideaBrief: JSON.stringify(idea), format, approveToken: token,
      });
      await sendDailyApprovalEmail(channel, idea, format, token);
    } catch (e) {
      console.warn(`[ChannelScheduler] Channel ${channel.id} failed:`, e.message);
    }
  }
}

async function sendDailyApprovalEmail(channel, idea, format, token) {
  const approveUrl = `${BACKEND_URL}/api/channels/daily-approve?token=${token}`;
  const rejectUrl = `${BACKEND_URL}/api/channels/daily-reject?token=${token}`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Erivion <noreply@erivion.net>',
      to: channel.user_email,
      subject: `🎬 Today's video idea for ${channel.label || 'your channel'}: ${idea.title}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:12px">
        <h2 style="color:#7c6af7;margin-top:0">🎬 Today's video idea</h2>
        <h3 style="color:#fff">${idea.title}</h3>
        <p style="color:#9ca3af;font-size:14px;line-height:1.7">${idea.brief || ''}</p>
        <p style="color:#6b7280;font-size:12px">Format: ${format === 'short' ? 'Short' : 'Long-form'}</p>
        <div style="margin-top:24px;display:flex;gap:12px">
          <a href="${approveUrl}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Make this video</a>
          <a href="${rejectUrl}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Skip today</a>
        </div>
      </div>`,
    }),
  }).catch(e => console.warn('[ChannelScheduler] Approval email failed:', e.message));
}

// ── لو العميل وافق: نولّد المشاهد (بنفس محرك موديل 4 المشترك) ونرندر بموديل 8 مباشرة ──
export async function triggerApprovedGeneration(run) {
  const channel = await getManagedChannelById(run.channel_id);
  if (!channel) throw new Error('Channel not found');
  const user = await getUserById(run.user_id);
  const idea = JSON.parse(run.idea_brief || '{}');
  const shape = run.format === 'short' ? SHORT_FORM : LONG_FORM;
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(run.user_id, user.email) };

  const scenesRes = await fetch(`${INTERNAL_BASE}/api/model4/generate-scenes`, {
    method: 'POST', headers,
    body: JSON.stringify({ idea: idea.title, script: undefined, inputMode: 'idea', sceneCount: shape.sceneCount, videoLanguage: idea.videoLanguage || 'en', videoStyle: 'cinematic' }),
  });
  const scenesData = await scenesRes.json();
  if (!scenesRes.ok || !scenesData.scenes?.length) throw new Error(scenesData.error || 'Scene generation failed');

  const audioMode = channel.uses_voice ? 'voiceover' : 'none';
  const rate = audioMode === 'voiceover' ? MODEL8_RATE_VOICEOVER : MODEL8_RATE_NONE;
  const totalSeconds = shape.sceneCount * shape.sceneDurationSec;
  const cost = totalSeconds * rate;

  const balance = await getCreditsBalance(run.user_id);
  if (balance < cost) throw new Error(`insufficient_credits:${cost}:${balance}`);
  const charge = await chargeCredits(run.user_id, cost);
  if (!charge.success) throw new Error(`insufficient_credits:${cost}:${charge.remaining}`);

  const scenes = scenesData.scenes.map(s => ({ ...s, sceneDurationSec: shape.sceneDurationSec }));
  const { outputFile } = await renderModel8Video({
    scenes, ratio: shape.ratio, audioMode, voiceKey: (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_wise',
    videoLanguage: idea.videoLanguage || 'en', captions: true, jobId: `daily_${run.id}`,
  });
  const videoUrl = '/outputs/' + outputFile;
  await saveVideo(run.user_id, outputFile, idea.title).catch(() => {});
  return videoUrl;
}

export async function sendDailyResultEmail(userEmail, idea, videoUrl, success, errorMessage) {
  const html = success
    ? `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">🎬</div><h2 style="color:#22c55e">Your video is ready!</h2><p style="color:#9ca3af">${idea.title}</p><a href="${FRONTEND_URL}${videoUrl}" style="display:inline-block;margin-top:16px;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700">Watch / Download →</a></div>`
    : `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">⚠️</div><h2 style="color:#ef4444">Today's video couldn't be made</h2><p style="color:#9ca3af">${errorMessage || 'Something went wrong.'}</p></div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Erivion <noreply@erivion.net>', to: userEmail, subject: success ? `✅ ${idea.title} is ready!` : `⚠️ Today's video failed`, html }),
  }).catch(() => {});
}
