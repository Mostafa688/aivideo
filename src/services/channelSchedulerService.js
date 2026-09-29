// ── channelSchedulerService.js ───────────────────────────────────────────────
// دورة "القناة اليومية": كل قناة نشطة بنجيبلها فكرة قوية (VidIQ + Groq) مرة كل يوم،
// نبعت للعميل إيميل فيه Approve/Reject، ولو وافق بنعمل الفيديو فعليًا (صور مشاهد متسلسلة +
// تحريك + تزامن صوت حقيقي مشهد بمشهد — راجع generateAnimatedVideo تحت) ونحطه في مشروعه
// للمراجعة والنشر.

import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import {
  getDueManagedChannels, markManagedChannelRun, createDailyVideoRun,
  getDailyVideoRunByToken, updateDailyVideoRunStatus, getManagedChannelById,
  mintInternalToken, getUserById, getCreditsBalance, chargeCredits, addCreditsBalance, saveVideo, saveChannelAnalysis,
  getCharacterReferenceById, linkYoutubeVideoToRun, setChannelProjectId,
  claimRunForPublishing, releasePublishingClaim, getNotificationPrefsByEmail, incrementYoutubePublishCount, setDailyVideoRunThumbnail,
  setDailyVideoRunResumeState, claimDailyVideoRunForResume,
} from './authService.js';
import { buildChannelProfile, findVideoIdeaCandidates, verifyVidiqKey, callVidiqTool } from './vidiqClientService.js';
import { getMaxClipSeconds, getFlatCreditCost, getImageCreditCost, getPerSecondCreditCost } from './creditPricingEngine.js';
import { supportsReferenceImages } from './newImageModelsService.js';
import { YOUTUBE_PUBLISH_ENABLED } from './featureFlags.js';
import { synthesizeNarration, conformVideoDurationToAudio, composeVideoAudio, transcribeWithTimestamps, burnCaptions, getBackgroundMusicBuffer } from './videoAudioService.js';
import { mergeVideos } from './videoMergeService.js';
import { uploadVideoToYoutube, uploadThumbnailToYoutube } from './youtubeUploadService.js';
import { createProjectForUser, appendProjectMessages, updateProjectMessageByRunId } from './projectRoutes.js';

const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';
const OUTPUTS_DIR = 'outputs';

const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function uploadBufferToR2(buffer, key, contentType) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `${R2_PUBLIC_URL}/${key}`;
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to download ${url}: ${res.status}`);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AGENT_MODEL = 'openai/gpt-oss-120b';
const INTERNAL_BASE = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://erivion.net';
const BACKEND_URL = process.env.BACKEND_URL || process.env.SITE_URL || FRONTEND_URL;

// ✅ /api/generate-scenes (موديل 1/2) بيرجّع Server-Sent Events مش JSON عادي — كل مشهد
// بييجي كـ event منفصل. بنقرأ الـ stream يدويًا ونجمّع أحداث "scene" لحد "done"/"error"
async function consumeScenesSSE(url, headers, body) {
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Scene generation request failed: ${res.status}`);
  const scenes = [];
  let errorMsg = null;
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += chunk.toString('utf8');
    let sepIdx;
    while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      const eventMatch = block.match(/^event: (.+)$/m);
      const dataMatch = block.match(/^data: (.+)$/m);
      if (!eventMatch || !dataMatch) continue;
      const eventName = eventMatch[1].trim();
      let data;
      try { data = JSON.parse(dataMatch[1]); } catch { continue; }
      if (eventName === 'scene') scenes.push(data);
      else if (eventName === 'error') errorMsg = data.message;
    }
  }
  if (errorMsg) throw new Error(errorMsg);
  if (!scenes.length) throw new Error('No scenes generated');
  scenes.sort((a, b) => (a.index || 0) - (b.index || 0));
  return scenes;
}

// ✅ /api/render و /api/model5/map-video شغالين async (202 + jobId فوري، الرندر بيكمل في
// الخلفية) — بنستنى النتيجة بـ polling على /api/render-status/:jobId زي ما الفرونت إند بيعمل
async function pollRenderJob(jobId, headers, { timeoutMs = 10 * 60 * 1000, intervalMs = 5000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    const res = await fetch(`${INTERNAL_BASE}/api/render-status/${jobId}`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'done') return data.videoUrl;
    if (data.status === 'failed') throw new Error(data.error || 'Render failed');
  }
  throw new Error('Render timed out');
}

// ✅ نفس فكرة pollRenderJob فوق بالظبط، بس لأي job endpoint/result field تاني (زي
// /api/images/generate-status اللي بيرجّع "images" مش "videoUrl") — عشان نعيد استخدام نفس
// منطق الـpolling من غير تكرار
async function pollJobGeneric(url, headers, resultKey, { timeoutMs = 10 * 60 * 1000, intervalMs = 5000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, intervalMs));
    const res = await fetch(url, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'done') return data[resultKey];
    if (data.status === 'failed') throw new Error(data.error || 'Job failed');
  }
  throw new Error('Job timed out');
}

const SHORT_FORM = { sceneCount: 6, sceneDurationSec: 5, ratio: '9:16' };   // ~30s
const LONG_FORM = { sceneCount: 18, sceneDurationSec: 10, ratio: '16:9' }; // ~3min

async function draftDailyIdea(profile, candidates, format, uses_voice, persistedContentStyle = null, contentBrief = null) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const titlesList = candidates.map(c => `- ${c.title}`).join('\n') || '(none found)';
  const recentList = (profile.recentTitles || []).map(t => `- ${t}`).join('\n') || '(no recent videos)';
  // ✅ لو القناة اتحللت أوتوماتيك قبل كده، contentStyle بقى قرار ثابت محفوظ على القناة —
  // منسيبش الـLLM يعيد تخمينه كل يوم من عنوين قليلة، ده بيضمن ثبات نوع المحتوى يوم بعد يوم
  const contentStyleField = persistedContentStyle
    ? `"contentStyle":"${persistedContentStyle}"` : `"contentStyle":"realistic"|"map"|"animated"`;
  const system = `You plan ONE new YouTube video idea per day for a real channel, based on real data, AND write its full upload metadata (this metadata is used as-is for the real YouTube upload — it must be genuinely strong, not a placeholder). You are given the channel's own recent video titles (so you can match its established language, dialect, and tone) and a list of currently-breaking-out videos in its niche (for inspiration only — never copy a title/idea verbatim, always make something original and specific). Output ONLY valid JSON: {"title":"...", "brief":"1-2 sentence description of what the video covers, used internally for planning", "description":"the FULL YouTube video description, 3-5 short paragraphs, written for real viewers: open with a compelling 1-2 sentence hook that naturally includes the main keyword/topic (this part shows in search results before 'more'), then expand on what the video covers, and end with a soft call-to-action to subscribe — written in the same language as the title, never generic filler", "tags":["8 to 15 real, specific, relevant search keywords/phrases a viewer would actually type, no hashtags, no duplicates, ordered most-important first"], "videoLanguage":"en"|"ar"|"ar_eg"|"ar_gulf"|etc, "voiceoverScript":"if voice is requested, a short natural narration opening line in the channel's own language/dialect matching its recent titles, else omit", ${contentStyleField}}. The title itself must be strong and SEO-friendly: specific (not vague/clickbait-empty), front-loads the main keyword, and matches how real viewers in this niche actually search. Match the channel's actual language and dialect (e.g. Egyptian Arabic vs Gulf Arabic vs MSA vs English) based on its recent titles — do not default to English or MSA if the channel clearly writes in a dialect. The video format is ${format === 'short' ? 'a SHORT (under 60s, punchy, single hook)' : 'a LONG-FORM video (several minutes, more narrative depth)'}.${persistedContentStyle ? '' : ` Pick contentStyle based on what actually fits the channel's real content (its recent titles, not just this one idea): "realistic" for content best shown with real-world stock footage (documentary-style, real places/objects/everyday life, product or lifestyle content — not a cartoonish or stylized look); "map" for content centered on geography, a specific country/region/historical territory, or a route/journey across places; "animated" (default) for anything else — stories, tutorials, abstract topics, or content that suits AI-generated stylized visuals better than real footage.`}`;
  const user = `Channel recent titles:\n${recentList}\n\nCurrently trending/breakout titles in this niche (inspiration only, do not copy):\n${titlesList}\n\nChannel topics: ${(profile.topics || []).join(', ') || 'unknown'}. Voice narration wanted: ${uses_voice ? 'yes' : 'no'}.${contentBrief ? `\n\nThe channel owner gave this specific instruction for how their videos should be made — follow it closely, it overrides your own default judgement wherever it applies: "${contentBrief}"` : ''}\n\nJSON only:`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 900, temperature: 0.7, reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
  const idea = JSON.parse(raw);
  if (persistedContentStyle) idea.contentStyle = persistedContentStyle; // ✅ نضمن القيمة حتى لو الـLLM غيّرها غلط
  return idea;
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
  const idea = await draftDailyIdea(profile, candidates, format, !!channel.uses_voice, channel.content_style || null, channel.content_brief || null);
  return { idea, format, profile };
}

// ✅ NEW: مدة فيديو حقيقية من VidIQ ممكن ترجع رقم ثواني عادي أو صيغة ISO 8601 (PT10M30S) —
// نتعامل مع الاتنين لأننا مش متأكدين مين بالظبط اللي هيرجع من الـMCP الحقيقي
function parseDurationToSeconds(v) {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const iso = s.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (iso && (iso[1] || iso[2] || iso[3])) return (parseInt(iso[1] || 0, 10) * 3600) + (parseInt(iso[2] || 0, 10) * 60) + parseInt(iso[3] || 0, 10);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

// ✅ NEW: تحليل تلقائي أعمق للقناة، مرة واحدة (وضع "أوتوماتيك" وقت الربط) — بيحدد فعليًا
// هل فيه راوي/فويس أوفر في المحتوى الحالي، الستايل البصري (واقعي/انمي/كارتون)، ومتوسط طول
// الفيديوهات الحقيقي للقناة (عشان الفيديوهات الجاية تبقى بنفس مقاسها مش مقاس ثابت افتراضي).
// نتيجة التحليل بتتخزن على القناة نفسها (saveChannelAnalysis) وتتستخدم في كل تشغيلة يومية
// جاية بدل ما نعيد كل القرارات دي كل مرة من الصفر
export async function analyzeChannelAutomatically(channel) {
  let channelId = channel.channel_id;
  if (!channelId) {
    const verified = await verifyVidiqKey(channel.vidiq_api_key).catch(() => null);
    channelId = verified?.channels?.[0]?.channelId || null;
    if (!channelId) throw new Error('No YouTube channel found for this VidIQ key');
  }
  const profile = await buildChannelProfile(channel.vidiq_api_key, channelId);
  const format = channel.format_pref && channel.format_pref !== 'auto' ? channel.format_pref : profile.format;

  // ✅ عينة صغيرة بس (فيديوهين) عشان منستهلكش رصيد VidIQ الشخصي بتاع العميل بزيادة — كل
  // نداء لـvidiq_video_transcript بيتحاسب من رصيده هو، مش رصيد Erivion
  let transcriptSample = '';
  const durations = [];
  try {
    const videosData = await callVidiqTool(channel.vidiq_api_key, 'vidiq_channel_videos', { channelId, videoFormat: format === 'short' ? 'short' : 'long', popular: false });
    const sampleVideos = (videosData?.videos || []).slice(0, 5);
    for (const v of sampleVideos) {
      const d = parseDurationToSeconds(v.duration ?? v.durationSeconds ?? v.lengthSeconds ?? v.length);
      if (d) durations.push(d);
    }
    for (const v of sampleVideos.slice(0, 2)) {
      const vid = v.videoId || v.id;
      if (!vid) continue;
      const t = await callVidiqTool(channel.vidiq_api_key, 'vidiq_video_transcript', { videoId: vid }).catch(() => null);
      const text = typeof t === 'string' ? t : (t?.transcript || t?.text || '');
      if (text) transcriptSample += `\n---\n${String(text).slice(0, 1500)}`;
    }
  } catch (e) {
    console.warn(`[ChannelAnalysis] Sampling videos/transcripts failed for channel ${channel.id} (continuing with titles only):`, e.message);
  }

  // ✅ متوسط حقيقي لو قدرنا نحسبه، وإلا نسيب الـLLM يقدّر قيمة معقولة حسب الفورمات
  const realAvgDurationSec = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const recentList = (profile.recentTitles || []).map(t => `- ${t}`).join('\n') || '(no recent videos)';
  const system = `You analyze a real YouTube channel once, to configure automated video generation for it going forward. Output ONLY valid JSON: {"usesVoice": true|false, "contentStyle": "realistic"|"map"|"animated"|"character_adventure"|"whiteboard_sketch", "videoStyle": "realistic"|"anime"|"cartoon"|"cinematic", ${realAvgDurationSec ? '' : '"estimatedDurationSec": number, '}"reasoning": "one short sentence explaining the main signal you used"}. "usesVoice": true if the channel's videos have a spoken narrator/voiceover (a transcript sample is provided when available — real spoken content, not just on-screen text or music); false for purely visual/silent content. "contentStyle": "realistic" for real-world stock-footage-style content (documentary, real places/objects/everyday life, product/lifestyle); "map" for geography/country/region/route-focused content; "character_adventure" ONLY for a very specific, distinctive format: the SAME single recurring character (a person, "you", a mascot) appears throughout every video living through a different scenario/era/story each time (e.g. "what if you lived during Prophet Noah's time" style channels) — pick this only if the recent titles clearly show this exact one-character-per-episode pattern, not just any story content; "whiteboard_sketch" for hand-drawn/doodle/whiteboard-animation explainer channels (simple black-and-white sketch illustrations, common for educational or "explained" content); "animated" (default) for any other story/tutorial/abstract content that doesn't fit the other three. "videoStyle" describes the actual visual look this channel already uses or would suit: "realistic" (live-action look), "anime", "cartoon", or "cinematic" (stylized but not cartoonish).${realAvgDurationSec ? '' : ' "estimatedDurationSec": a realistic average video length in seconds for this channel/niche/format if you had to guess.'}`;
  const user = `Channel recent titles:\n${recentList}\n\nChannel topics: ${(profile.topics || []).join(', ') || 'unknown'}.\n\nFormat: ${format === 'short' ? 'Shorts' : 'long-form'}.${realAvgDurationSec ? ` Real measured average video length: ${realAvgDurationSec} seconds.` : ''}${transcriptSample ? `\n\nSample transcript excerpt(s) from ${transcriptSample.split('---').length - 1} recent video(s):${transcriptSample}` : '\n\nNo transcript could be sampled — infer usesVoice from the titles/topics as best you can.'}\n\nJSON only:`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 400, temperature: 0.3, reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
  const analysis = JSON.parse(raw);

  const targetDurationSec = realAvgDurationSec || Math.round(analysis.estimatedDurationSec) || (format === 'short' ? 30 : 180);
  const secPerScene = format === 'short' ? 5 : 10;
  const targetSceneCount = Math.min(150, Math.max(4, Math.round(targetDurationSec / secPerScene)));

  const result = {
    contentStyle: ['realistic', 'map', 'animated', 'character_adventure', 'whiteboard_sketch'].includes(analysis.contentStyle) ? analysis.contentStyle : 'animated',
    videoStyle: ['realistic', 'anime', 'cartoon', 'cinematic'].includes(analysis.videoStyle) ? analysis.videoStyle : 'cinematic',
    usesVoice: !!analysis.usesVoice,
    targetDurationSec,
    targetSceneCount,
  };
  await saveChannelAnalysis(channel.id, result);
  return { ...result, reasoning: analysis.reasoning || null };
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
      // ✅ العميل لازم ياخد إشعار كل يوم مستحق، سواء اتعملت فكرة ولا لأ — قبل كده كان
      // بيفشل بصمت من غير أي إيميل خالص لو جلب الفكرة نفسه فشل (مشكلة VidIQ/Groq وقتية مثلًا)
      await sendDailyFailureEmail(channel, e.message).catch(() => {});
    }
  }
}

async function sendDailyFailureEmail(channel, errorMessage) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Erivion <noreply@erivion.net>',
      to: channel.user_email,
      subject: `⚠️ Couldn't prepare today's video idea for ${channel.label || 'your channel'}`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">⚠️</div><h2 style="color:#ef4444">Couldn't prepare today's idea</h2><p style="color:#9ca3af">${channel.label || 'Your channel'} — we'll automatically try again tomorrow. If this keeps happening, double-check your VidIQ key is still valid in "My Channels".</p></div>`,
    }),
  }).catch(e => console.warn('[ChannelScheduler] Failure email also failed:', e.message));
}

async function sendDailyApprovalEmail(channel, idea, format, token) {
  const costBreakdown = estimateChannelRunBreakdown(channel, format, idea);
  const userBalance = costBreakdown ? await getCreditsBalance(channel.user_id).catch(() => null) : null;
  const costBlock = costBreakdown ? `<div style="margin-top:16px;padding:12px 14px;border-radius:10px;background:#16162a;font-size:13px;line-height:1.7;color:#d1d5db">Estimated cost: <strong style="color:#fff">~${costBreakdown.total} credits</strong>${userBalance != null ? ` &nbsp;·&nbsp; Your balance: <strong style="color:${userBalance >= costBreakdown.total ? '#22c55e' : '#f59e0b'}">${userBalance}</strong>` : ''}${userBalance != null && userBalance < costBreakdown.total ? `<br/><span style="color:#f59e0b">Your balance may not cover the whole video — top up first, or the video will stop where the credits run out and you can continue it later.</span>` : ''}</div>` : '';
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
        ${costBlock}
        <div style="margin-top:24px;display:flex;gap:12px">
          <a href="${approveUrl}" style="background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✅ Make this video</a>
          <a href="${rejectUrl}" style="background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">❌ Skip today</a>
        </div>
      </div>`,
    }),
  }).catch(e => console.warn('[ChannelScheduler] Approval email failed:', e.message));
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ NEW: تخطيط/تقدير تكلفة تشغيلة قناة + تنفيذ مشترك قابل للإيقاف والاستكمال
// ─────────────────────────────────────────────────────────────────────────────
// نفس معادلات generateAnimatedVideo/generateCharacterAdventureVideo بالظبط (عدد المشاهد، الموديلات،
// مدة المشهد) — بنحسبها هنا لوحدها عشان التقدير قبل التوليد يطابق اللي بيتنفذ فعلاً
function planChannelRun(channel, shape, { characterMode = false } = {}) {
  const sceneCount = Math.min(channel.target_scene_count || shape.sceneCount, 20);
  let imageModel = channel.image_model || 'nano_banana_2';
  if (characterMode && !supportsReferenceImages(imageModel)) imageModel = 'nano_banana_2';
  const animationModel = channel.animation_model || 'seedance_2_5';
  const maxClip = getMaxClipSeconds(animationModel) || 30;
  const defaultSceneDurationSec = Math.min(maxClip, channel.target_duration_sec ? Math.max(3, Math.round(channel.target_duration_sec / sceneCount)) : shape.sceneDurationSec);
  return { sceneCount, imageModel, animationModel, maxClip, defaultSceneDurationSec };
}

// تفصيل التكلفة المتوقعة (صور + كليبات + كابشن) للأنماط اللي بتستخدم موديلات صور/تحريك بكريديت؛
// null للأنماط اللي مالهاش موديلات (خرائط/واقعي/سبورة) — تقدير (مدة المشهد الفعلية مع الصوت
// بتتحدد بمدة السرد الحقيقية وقت التوليد)
export function estimateChannelRunBreakdown(channel, format, idea = null) {
  try {
    const style = idea?.contentStyle || channel.content_style || null;
    const hasExplicit = !!(channel.image_model || channel.animation_model);
    if (style === 'whiteboard_sketch') return null;
    if ((style === 'map' || style === 'realistic') && !hasExplicit) return null;
    const shape = format === 'short' ? SHORT_FORM : LONG_FORM;
    const plan = planChannelRun(channel, shape, { characterMode: style === 'character_adventure' && !!channel.character_reference_id });
    const imagesCost = getImageCreditCost(plan.imageModel, plan.sceneCount);
    const clipCost = getPerSecondCreditCost(plan.animationModel, plan.defaultSceneDurationSec);
    const captions = channel.uses_voice && channel.captions_enabled !== 0 ? getFlatCreditCost('autocaption') : 0;
    return { ...plan, imagesCost, clipCost, clips: clipCost * plan.sceneCount, captions, total: imagesCost + clipCost * plan.sceneCount + captions };
  } catch { return null; }
}

// التكلفة المتوقعة الباقية لفيديو وقف في النص (كليبات المشاهد اللي فاضلة + كابشن)
function estimateRemainingCost(st) {
  try {
    const remaining = Math.max(0, st.images.length - st.nextIndex);
    return getPerSecondCreditCost(st.animationModel, st.defaultSceneDurationSec) * remaining + (st.usesVoice && st.captionsEnabled ? getFlatCreditCost('autocaption') : 0);
  } catch { return null; }
}

// حاجز قبل أي خصم: لازم الرصيد يكفي الصور + أول كليب على الأقل، وإلا نرفض بوضوح ومن غير ما
// نصرف حاجة (الصور بتتخصم كلها مرة واحدة أول ما نبدأ، فلو الرصيد مايكفيش أول كليب هيتصرف على
// صور من غير فيديو خالص)
async function assertCanAffordRunStart(run, plan) {
  const need = getImageCreditCost(plan.imageModel, plan.sceneCount) + getPerSecondCreditCost(plan.animationModel, plan.defaultSceneDurationSec);
  const balance = await getCreditsBalance(run.user_id);
  if (balance < need) {
    const e = new Error(`insufficient_credits: this video needs at least ${need} credits to start and the balance is ${balance}`);
    e.committed = true; // مفيش أي مسار بديل هيفيد — نفس الرصيد
    e.creditsNeeded = need; e.balance = balance;
    throw e;
  }
}

// ✅ الخطوات المشتركة (سرد → تحريك كل مشهد → دمج → كابشن → موسيقى) بين animated وcharacter_adventure،
// وقابلة للاستكمال: لو الكريديت خلص قبل مشهد (طلب الكليب رجع quota_exceeded) بنقف، نركّب اللي
// اتعمل فعلاً كفيديو ناقص، ونحفظ الحالة الكاملة (run._partial + resume_state) عشان نكمّل بنفس
// الموديلات والترتيب لما العميل يشحن. st بيتحفظ بعد كل كليب ناجح.
async function renderScenesFromImages(run, channel, idea, shape, headers, st) {
  const startedAt = st.nextIndex;
  const narrations = []; // بنفس ترتيب المشاهد (من startedAt وطالع بس)
  try {
    // سرد كل مشهد لوحده الأول (مدته الحقيقية بتتقاس) — نداء Replicate من غير كريديت، فآمن بالتوازي
    if (st.usesVoice) {
      const idxs = st.scenes.map((_, i) => i).filter(i => i >= startedAt);
      const synthesized = await Promise.all(idxs.map(i => synthesizeNarration(st.scenes[i].narration || idea.title, { voiceKey: st.voiceKey, languageCode: idea.videoLanguage || 'en' })));
      idxs.forEach((i, k) => { narrations[i] = synthesized[k]; });
    }

    // كل صورة تتحرك لكليب، بمدة = مدة سرد نفس المشهد (لو فيه صوت) وإلا المدة الافتراضية
    let outOfCredits = null;
    for (let i = startedAt; i < st.images.length; i++) {
      const targetDurationSec = st.usesVoice ? Math.max(3, Math.min(st.maxClip, narrations[i].durationSec)) : st.defaultSceneDurationSec;
      const vidRes = await fetch(`${INTERNAL_BASE}/api/videos/generate`, {
        method: 'POST', headers,
        body: JSON.stringify({ model: st.animationModel, prompt: 'subtle natural motion, cinematic camera movement', imageUrl: st.images[i], aspectRatio: st.ratio, durationSec: targetDurationSec }),
      });
      const vidJobData = await vidRes.json();
      if (!vidRes.ok) {
        // الكريديت خلص وسط الفيديو — مش فشل: نقف هنا ونسلّم اللي اتعمل
        if (vidJobData.error === 'quota_exceeded') { outOfCredits = { needed: vidJobData.cost ?? null, remaining: vidJobData.remaining ?? null }; break; }
        // الصور خلاص اتولدت واتخصم تمنها — أي فشل تاني وطالع "committed" عشان منرجعش نخصم تاني على مسار تاني
        const e = new Error(vidJobData.error || 'Scene animation failed'); e.committed = true; throw e;
      }
      let clipUrl = await pollRenderJob(vidJobData.jobId, headers);
      if (st.usesVoice) {
        // مطابقة دقيقة لمدة المشهد لمدة سرده الحقيقية + تركيب سرد المشهد ده على المشهد ده بالذات
        clipUrl = await conformVideoDurationToAudio({ videoUrl: clipUrl, targetDurationSec: narrations[i].durationSec, modelKeyForNaming: st.namingKey });
        clipUrl = await composeVideoAudio({ videoUrl: clipUrl, narrationPath: narrations[i].audioPath, modelKeyForNaming: st.namingKey });
      }
      st.clipUrls.push(clipUrl);
      st.nextIndex = i + 1;
      // كل كليب خلص واتدفع تمنه بيتحفظ فورًا — أي انقطاع بعد كده مايضيعش الشغل
      await setDailyVideoRunResumeState(run.id, st).catch(() => {});
    }

    if (!st.clipUrls.length) {
      const e = new Error(`insufficient_credits: the credits ran out before the first scene could be animated (needs ${outOfCredits?.needed ?? '?'}, balance ${outOfCredits?.remaining ?? '?'})`);
      e.committed = true; e.creditsNeeded = outOfCredits?.needed ?? null; e.balance = outOfCredits?.remaining ?? null;
      throw e;
    }

    // دمج كل الكليبات (كل واحد صوته متزامن بالفعل)
    let videoUrl = st.clipUrls.length === 1 ? st.clipUrls[0] : await mergeVideos(st.clipUrls);

    // كابشن حقيقي لو مطلوب — بكريديت. مش بنعمله على الفيديو الناقص (هيتحسب مرة واحدة عند الاكتمال)
    if (!outOfCredits && st.usesVoice && st.captionsEnabled) {
      const captionCost = getFlatCreditCost('autocaption');
      const balance = await getCreditsBalance(run.user_id);
      if (balance >= captionCost) {
        const charge = await chargeCredits(run.user_id, captionCost);
        if (charge.success) {
          const combinedAudioPath = path.join(TEMP_DIR, `${st.kind}_narr_${run.id}_${Date.now()}.mp3`);
          try {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
            if (startedAt === 0) {
              concatAudioFiles(narrations.map(n => n.audioPath), combinedAudioPath);
            } else {
              // فيديو مستكمل: سرد المشاهد القديمة مش معانا كملفات، فبنسحب الصوت من الفيديو المدموج نفسه
              const tmpVideo = combinedAudioPath.replace(/\.mp3$/, '.mp4');
              await downloadToFile(videoUrl, tmpVideo);
              execSync(`ffmpeg -y -i "${tmpVideo}" -vn -acodec libmp3lame -q:a 4 "${combinedAudioPath}"`, { stdio: 'pipe' });
              try { fs.unlinkSync(tmpVideo); } catch {}
            }
            const words = await transcribeWithTimestamps(combinedAudioPath);
            const isRtl = ['ar', 'ar_eg', 'ar_gulf'].includes(idea.videoLanguage);
            videoUrl = await burnCaptions(videoUrl, words, { rightToLeft: isRtl });
          } catch (capErr) {
            console.warn(`[ChannelScheduler] Captions failed for run ${run.id} (video still delivered without captions, credits refunded):`, capErr.message);
            await addCreditsBalance(run.user_id, captionCost);
          } finally {
            try { fs.unlinkSync(combinedAudioPath); } catch {}
          }
        }
      }
    }

    // موسيقى خلفية خافتة — مجانية تمامًا، بتفشل بهدوء لو فشلت
    if (st.usesVoice) {
      try {
        const musicBuffer = await getBackgroundMusicBuffer('youtube', st.musicMood);
        videoUrl = await composeVideoAudio({ videoUrl, musicBuffer, modelKeyForNaming: st.namingKey });
      } catch (musicErr) {
        console.warn(`[ChannelScheduler] Background music failed for run ${run.id} (video still delivered without music):`, musicErr.message);
      }
    }

    await saveVideo(run.user_id, videoUrl.replace(/^\/outputs\//, ''), idea.title).catch(() => {});

    if (outOfCredits) {
      // نسيب resume_state زي ما هو (اتحفظ بعد آخر كليب) — الفيديو اللي رجع ناقص
      run._partial = {
        scenesDone: st.clipUrls.length, scenesTotal: st.images.length,
        estimatedRemaining: estimateRemainingCost(st), balance: outOfCredits.remaining,
      };
    } else {
      await setDailyVideoRunResumeState(run.id, null).catch(() => {});
    }
    return videoUrl;
  } catch (e) {
    e.committed = true;
    throw e;
  } finally {
    narrations.forEach(n => { try { fs.rmSync(n.workDir, { recursive: true, force: true }); } catch {} });
  }
}

// ── المسار الافتراضي (animated) — سيناريو موديل 4 + النظام الجديد (صور متسلسلة + تحريك +
// تزامن)، بديل تمامًا عن موديل 8 القديم ────────────────────────────────────────────
// ✅ FIX (باج حقيقي بلّغ بيه العميل: فيديو بـ3 مشاهد طلع صوته 12 ثانية والفيديو 52 ثانية —
// "الموقع لسه شغال بالنظام القديم موديل 8"): ده كان المسار الافتراضي (animated) الوحيد اللي
// فضل شغال بمحرك موديل 8 القديم (renderModel8Video: نص فيديو مباشر بـprunaai/p-video، من
// غير صور مرجعية ولا تسلسل اتساق حقيقي بين المشاهد) بعد ما character_adventure وwhiteboard_
// sketch اتحولوا للنظام الجديد. دلوقتي بقى نفس البنية بالظبط: (1) صورة لكل مشهد (نانو بنانا 2)
// وكل مشهد ياخد اللي قبله كمرجع (useScenesAsReference) عشان الستايل يفضل ثابت عبر القصة —
// بدل ما كل مشهد يتولد لوحده من غير أي علاقة بالتاني، (2) لو القناة بتستخدم صوت: سرد كل مشهد
// لوحده الأول (مدته الحقيقية بتتقاس)، (3) كل صورة تتحرك (seedance_2_5) بمدة = سرد نفس المشهد
// بالظبط، (4) conformVideoDurationToAudio + composeVideoAudio لكل كليب لوحده قبل أي دمج —
// تزامن مضمون مشهد بمشهد بدل سرد واحد فوق فيديو بمقاس ثابت غير متعلق بيه خالص
async function generateAnimatedVideo(run, channel, idea, shape, headers) {
  const MAX_SCENES = 20;
  const sceneCount = Math.min(channel.target_scene_count || shape.sceneCount, MAX_SCENES);
  // ✅ NEW (طلب العميل: يختار بنفسه موديل الصور/التحريك بدل ما نفرض الأغلى دايمًا) —
  // channel.image_model/animation_model بيتفلتروا مسبقًا في channelRoutes.js's PATCH handler
  // (مينفعش يوصلوا هنا بموديل مش موجود أو مش بيقبل صورة كمدخل)
  const imageModel = channel.image_model || 'nano_banana_2';
  const animationModel = channel.animation_model || 'seedance_2_5';
  const maxClip = getMaxClipSeconds(animationModel) || 30;
  const defaultSceneDurationSec = Math.min(maxClip, channel.target_duration_sec ? Math.max(3, Math.round(channel.target_duration_sec / sceneCount)) : shape.sceneDurationSec);
  const usesVoice = !!channel.uses_voice;
  const voiceKey = (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_wise';
  await assertCanAffordRunStart(run, { imageModel, animationModel, sceneCount, defaultSceneDurationSec });

  // نفس كتابة السيناريو المستخدمة قبل كده بالظبط (جودة مثبتة: نص سرد + برومبت بصري لكل مشهد،
  // مع قفل شخصية/مكان تلقائي لو القصة فيها) — التغيير الحقيقي في طريقة الرندر تحت بس
  const scenesRes = await fetch(`${INTERNAL_BASE}/api/model4/generate-scenes`, {
    method: 'POST', headers,
    body: JSON.stringify({ idea: idea.title, script: undefined, inputMode: 'idea', sceneCount, videoLanguage: idea.videoLanguage || 'en', videoStyle: channel.video_style || 'cinematic' }),
  });
  const scenesData = await scenesRes.json();
  if (!scenesRes.ok || !scenesData.scenes?.length) throw new Error(scenesData.error || 'Scene generation failed');
  const scenes = scenesData.scenes;

  // ── 1) صور المشاهد — كل مشهد ياخد اللي قبله كمرجع (تسلسل)، عشان الستايل/العناصر تفضل
  // ثابتة عبر القصة من غير ما نحتاج صورة شخصية مرجعية ثابتة (مفيش شخصية واحدة هنا أصلاً) ──
  const imgRes = await fetch(`${INTERNAL_BASE}/api/images/generate`, {
    method: 'POST', headers,
    body: JSON.stringify({
      model: imageModel,
      scenes: scenes.map((s, i) => ({ prompt: s.prompt, useScenesAsReference: i > 0 ? [i - 1] : [] })),
      aspectRatio: shape.ratio,
    }),
  });
  const imgJobData = await imgRes.json();
  if (!imgRes.ok) throw new Error(imgJobData.error || 'Scene image generation failed'); // لسه قبل خصم أي حاجة تانية
  const images = await pollJobGeneric(`${INTERNAL_BASE}/api/images/generate-status/${imgJobData.jobId}`, headers, 'images');
  if (!Array.isArray(images) || images.length < 2) { const e = new Error('Image generation returned too few images'); e.committed = true; throw e; }

  return await renderScenesFromImages(run, channel, idea, shape, headers, {
    kind: 'animated', namingKey: 'animated',
    musicMood: channel.video_style === 'cinematic' ? 'epic cinematic dramatic' : 'calm storytelling narration',
    scenes: scenes.map(sc => ({ narration: (sc.text || '').trim() || idea.title })),
    images, clipUrls: [], nextIndex: 0,
    imageModel, animationModel, maxClip, defaultSceneDurationSec, usesVoice, voiceKey,
    captionsEnabled: channel.captions_enabled !== 0, ratio: shape.ratio,
  });
}

// ── محتوى واقعي (موديل 2 — لقطات حقيقية من Pexels، مش رسوم بالذكاء الاصطناعي) ──────
// بيستخدم /api/render بـ videoType:'pexels_clips' (نفس المسار اللي بيستخدمه أي عميل عادي
// لموديل 2)، فبيتحاسب بنفس MODEL12_CREDIT_COSTS ذاتها تلقائيًا — مفيش حساب كريديت يدوي هنا
// ✅ FIX (طلب العميل الصريح: "أي حاجة فيها صوت تتعمل بـReplicate/Gemini" في نظام القنوات):
// الصوت هنا كان بيتعمل بـEdge TTS (/api/generate-voice، مجاني بس مش Replicate/Gemini) —
// دلوقتي بيستخدم synthesizeNarration (Gemini TTS الحقيقي على Replicate) لكل مشهد لوحده،
// بالظبط زي باقي أنماط المحتوى الجديدة كلها، ونلحمهم في ملف واحد (نفس شكل audioUrl+
// sceneDurations اللي /api/render محتاجه، فباقي الدالة من غير أي تغيير)
async function generateRealisticVideo(run, channel, idea, shape, headers) {
  const duration = shape === LONG_FORM ? '3min' : '30s';
  const scenes = await consumeScenesSSE(`${INTERNAL_BASE}/api/generate-scenes`, headers, {
    idea: idea.title, duration, videoLanguage: idea.videoLanguage || 'en',
  });

  let audioUrl = null, sceneDurations = null;
  if (channel.uses_voice) {
    const voiceKey = (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_american';
    const narrations = [];
    try {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
      for (const s of scenes) {
        const text = (s.text || '').trim();
        if (!text) {
          // ✅ FIX (باج حقيقي رصدته مراجعة كود: كان بيتخطى (continue) المشهد الفاضي نصه تمامًا،
          // فـnarrations/sceneDurations كانت بتبقى أقصر من عدد المشاهد الحقيقي. renderService.js
          // بيرفض realSceneDurations كلها بصمت لو الطول مش متطابق بالظبط مع عدد المشاهد، فكل
          // المشاهد كانت بترجع لتوقيت تقريبي غير دقيق — مش بس المشهد الفاضي ده. دلوقتي بنولّد
          // مقطع صمت قصير بدل التخطي، عشان الطول يفضل مطابق تمامًا لعدد المشاهد دايمًا
          const silentPath = path.join(TEMP_DIR, `realistic_silence_${run.id}_${narrations.length}_${Date.now()}.mp3`);
          execSync(`ffmpeg -f lavfi -i anullsrc=r=48000:cl=mono -t 3 -c:a mp3 -y "${silentPath}"`, { stdio: 'pipe' });
          narrations.push({ audioPath: silentPath, durationSec: 3, workDir: null });
          continue;
        }
        narrations.push(await synthesizeNarration(text, { voiceKey, languageCode: idea.videoLanguage || 'en' }));
      }
      if (narrations.length) {
        fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
        const filename = `realistic_voice_${run.id}_${Date.now()}.mp3`;
        concatAudioFiles(narrations.map(n => n.audioPath), path.join(OUTPUTS_DIR, filename));
        audioUrl = '/outputs/' + filename;
        sceneDurations = narrations.map(n => n.durationSec);
      }
    } catch (e) {
      // ✅ لو توليد الصوت فشل، منوقفش الفيديو كله — بيكمل بدون صوت بدل ما يوم العميل يضيع
      console.warn(`[ChannelScheduler] Gemini narration failed for realistic run ${run.id}, continuing without voice:`, e.message);
    } finally {
      narrations.forEach(n => { try { if (n.workDir) fs.rmSync(n.workDir, { recursive: true, force: true }); else if (n.audioPath) fs.unlinkSync(n.audioPath); } catch {} });
    }
  }

  const mediaRes = await fetch(`${INTERNAL_BASE}/api/fetch-media`, {
    method: 'POST', headers, body: JSON.stringify({ scenes, ratio: shape.ratio, jobId: `daily_${run.id}` }),
  });
  const mediaData = await mediaRes.json();
  if (!mediaRes.ok) throw new Error(mediaData.error || 'Media fetch failed'); // لسه قبل أي خصم كريديت

  const renderRes = await fetch(`${INTERNAL_BASE}/api/render`, {
    method: 'POST', headers,
    body: JSON.stringify({ scenes: mediaData.scenes, audioUrl, ratio: shape.ratio, jobId: `daily_${run.id}`, duration, captions: true, videoType: 'pexels_clips', videoLanguage: idea.videoLanguage || 'en', sceneDurations }),
  });
  const renderData = await renderRes.json();
  // ✅ لو الطلب نفسه فشل، الكريديت لسه ما اتخصمش (الخصم بيحصل جوه /api/render قبل ما يرجع
  // 202) — آمن نرجع للمسار الافتراضي. لو الطلب نجح (202) بس الرندر في الخلفية فشل بعد كده،
  // ده معناه الكريديت اتخصم فعلًا فمينفعش نرجع للمسار التاني (هيبقى خصم مزدوج)
  if (!renderRes.ok) throw new Error(renderData.error || renderData.message || 'Render request failed');

  try {
    const videoUrl = await pollRenderJob(renderData.jobId, headers);
    await saveVideo(run.user_id, videoUrl.replace(/^\/outputs\//, ''), idea.title).catch(() => {});
    return videoUrl;
  } catch (pollErr) {
    pollErr.committed = true;
    throw pollErr;
  }
}

// ── محتوى خريطة/جغرافيا (موديل 5 — Atlas) — مفيش scenes خالص، برومبت واحد بياخد الموضوع
// مباشرة. بيتحاسب بنفس تسعيرة موديل 5 عند 15 ثانية (getModel5CreditCost) تلقائيًا جوه الراوت
async function generateMapVideo(run, channel, idea, shape, headers) {
  const mapRes = await fetch(`${INTERNAL_BASE}/api/model5/map-video`, {
    method: 'POST', headers,
    body: JSON.stringify({ topic: idea.title, ratio: shape.ratio, narrationScript: idea.voiceoverScript || undefined }),
  });
  const mapData = await mapRes.json();
  if (!mapRes.ok) throw new Error(mapData.error || mapData.message || 'Map video request failed'); // لسه قبل أي خصم كريديت

  try {
    const videoUrl = await pollRenderJob(mapData.jobId, headers);
    await saveVideo(run.user_id, videoUrl.replace(/^\/outputs\//, ''), idea.title).catch(() => {});
    return videoUrl;
  } catch (pollErr) {
    pollErr.committed = true; // الكريديت اتخصم فعلًا جوه /api/model5/map-video قبل ما يرجع 202
    throw pollErr;
  }
}

// ✅ NEW: مشاهد بصرية + (لو القناة بتستخدم صوت) جملة سرد مقابلة لكل مشهد، لفيديو "شخصية
// واحدة تعيش مغامرة" — كل مشهد لحظة/بيت مختلف في نفس القصة (زي "لو عشت في زمن سيدنا نوح").
// منستخدمش وصف مظهر الشخصية خالص هنا لأن الصورة المرجعية المحفوظة هي اللي بتحدد الشكل —
// الـvisual prompt بيركز على الحدث/المكان/الإحساس بس. جملة السرد مربوطة بنفس المشهد (مش
// سكريبت واحد طويل منفصل) عشان نقدر نولّد صوتها لوحدها ونقيس مدتها الحقيقية ونظبط طول
// المشهد عليها بالظبط بعد كده (راجع generateCharacterAdventureVideo تحت)
async function draftCharacterAdventureScenes(idea, sceneCount, videoStyle, needsNarration) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const narrationField = needsNarration ? `, "narration": "one short natural narration sentence for this exact scene, in ${idea.videoLanguage?.startsWith('ar') ? 'the same Arabic dialect as the video' : 'English'}, continuing the story from the previous scene's narration"` : '';
  const system = `You write ${sceneCount} distinct scene beats (in English for "visual"${needsNarration ? ', matching-language narration for "narration"' : ''}) for a single-character adventure video. The SAME one character (already shown in a reference photo the image generator has — never describe their face, body, or clothing in "visual", only their actions and expressions) experiences this story across all ${sceneCount} scenes, each a different moment/beat of the adventure, in clear chronological order (setup, rising action, climax, resolution)${needsNarration ? ', with the narration forming one continuous story when read scene by scene' : ''}. Video idea: "${idea.title}" — ${idea.brief || ''}. Visual style: ${videoStyle || 'cinematic'}. Output ONLY a valid JSON array of exactly ${sceneCount} objects: [{"visual": "a single vivid scene description (setting, action, mood, camera angle) — no character appearance details, no dialogue, no scene numbers/labels"${narrationField}}, ...].`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: 'JSON array only:' }],
      max_tokens: 2000, temperature: 0.8, reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
  const scenes = JSON.parse(raw);
  if (!Array.isArray(scenes) || scenes.length < 2) throw new Error('Scene generation returned an invalid list');
  return scenes.slice(0, sceneCount).map(s => ({ visual: String(s.visual || s), narration: needsNarration ? String(s.narration || '') : null }));
}

// ✅ NEW: بيلحم كام ملف صوت محلي (نفس التنسيق — كلهم ناتج synthesizeNarration، mp3) في
// ملف واحد بالترتيب، عن طريق ffmpeg concat demuxer (نفس الأسلوب المستخدم فعليًا في
// cloneVoiceNarration's chunk-stitching بـvoiceCloneService.js)
function concatAudioFiles(audioPaths, outPath) {
  const listPath = outPath + '.txt';
  fs.writeFileSync(listPath, audioPaths.map(p => `file '${path.resolve(p)}'`).join('\n'));
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}"`, { stdio: 'pipe' });
  } finally {
    try { fs.unlinkSync(listPath); } catch {}
  }
}

// ── محتوى "شخصية واحدة تعيش مغامرة" (character_adventure) — بيستخدم صورة مرجعية محفوظة
// من مكتبة الشخصيات عشان نفس الشخصية تفضل ثابتة في كل مشاهد الفيديو:
// 1) صور مشاهد بمرجع الشخصية (نانو بنانا 2، متسلسلة زي أي مرجع تناسق في generateNewModelImages)
// 2) (لو القناة بتستخدم صوت) سرد حقيقي منفصل لكل مشهد (Gemini TTS) — بنقيس مدته الحقيقية
//    ونولّد/نظبط حركة المشهد على نفس المدة دي بالظبط (conformVideoDurationToAudio: لو
//    الصوت أطول من الفيديو المتحرك، الفيديو "يتراجع"/يتباطأ عشان يمتد لنفس المدة؛ لو أقصر،
//    بيتقص لمدة الصوت بالظبط) — تزامن مضمون مشهد بمشهد، مش سرد واحد طويل بيتحط فوق فيديو
//    مدموج ومنقصوش/يتمطط عشوائي زي المسار القديم
// 3) دمج الكليبات (كل واحد فيها صوته الخاص متزامن بالفعل قبل الدمج) وحرق كابشن حقيقي لو
//    مطلوب (بكريديت — التكلفة الحقيقية الوحيدة المتبقية غير توليد الفيديو نفسه)
// ⚠️ محدود بحد أقصى 20 مشهد/كليب — نفس MAX_BATCH بتاع generateNewModelImages (مش قيد
// mergeVideos نفسه، ده بيقبل أي عدد — القيد الحقيقي هنا هو توليد الصور دفعة واحدة).
// قنوات محتواها الطويل جدًا (100+ مشهد) لسه محتاجة تصميم منفصل (batching على أكتر من نداء)،
// خارج نطاق النسخة دي
async function generateCharacterAdventureVideo(run, channel, idea, shape, headers) {
  if (!channel.character_reference_id) throw new Error('No character reference set for this channel — pick one from the Characters library first.');
  const character = await getCharacterReferenceById(channel.character_reference_id);
  if (!character) throw new Error('Saved character reference not found');

  const MAX_SCENES = 20;
  const sceneCount = Math.min(channel.target_scene_count || shape.sceneCount, MAX_SCENES);
  // ✅ NEW (طلب العميل: يختار بنفسه موديل الصور/التحريك — راجع generateAnimatedVideo)
  // ✅ FIX: فكرة "شخصية واحدة ثابتة" مستحيلة من غير صورة مرجعية، وبعض الموديلات (زي Grok Image)
  // بتتجاهل المرجع تمامًا فكل مشهد كان بيطلع بشخصية مختلفة. هنا الشخصية لازم تتثبّت، فلو
  // الموديل المختار مش بياخد مرجع بنستخدم nano_banana_2 (المؤكد) لصور القناة دي بس، وبنسجّل ده
  let imageModel = channel.image_model || 'nano_banana_2';
  if (!supportsReferenceImages(imageModel)) {
    console.warn(`[ChannelScheduler] run ${run.id}: image model "${imageModel}" ignores reference images, so a fixed character is impossible with it — using nano_banana_2 for this character channel instead`);
    imageModel = 'nano_banana_2';
  }
  const animationModel = channel.animation_model || 'seedance_2_5';
  const maxClip = getMaxClipSeconds(animationModel) || 30;
  const defaultSceneDurationSec = Math.min(maxClip, channel.target_duration_sec ? Math.max(3, Math.round(channel.target_duration_sec / sceneCount)) : shape.sceneDurationSec);
  const usesVoice = !!channel.uses_voice;
  const voiceKey = (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_wise';

  await assertCanAffordRunStart(run, { imageModel, animationModel, sceneCount, defaultSceneDurationSec });
  const scenes = await draftCharacterAdventureScenes(idea, sceneCount, channel.video_style, usesVoice);

  // ── 1) صور المشاهد، الشخصية ثابتة عبرهم كلهم ────────────────────────────────
  const imgRes = await fetch(`${INTERNAL_BASE}/api/images/generate`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: imageModel, prompts: scenes.map(s => s.visual), referenceImageUrls: [character.image_url], aspectRatio: shape.ratio }),
  });
  const imgJobData = await imgRes.json();
  if (!imgRes.ok) throw new Error(imgJobData.error || 'Character scene image generation failed'); // لسه قبل خصم أي حاجة تانية
  const images = await pollJobGeneric(`${INTERNAL_BASE}/api/images/generate-status/${imgJobData.jobId}`, headers, 'images');
  if (!Array.isArray(images) || images.length < 2) { const e = new Error('Image generation returned too few images'); e.committed = true; throw e; }

  return await renderScenesFromImages(run, channel, idea, shape, headers, {
    kind: 'char_adv', namingKey: 'char_adv', musicMood: 'epic dramatic historical adventure',
    scenes: scenes.map(sc => ({ narration: sc.narration?.trim() || idea.title })),
    images, clipUrls: [], nextIndex: 0,
    imageModel, animationModel, maxClip, defaultSceneDurationSec, usesVoice, voiceKey,
    captionsEnabled: channel.captions_enabled !== 0, ratio: shape.ratio,
  });
}

// ✅ NEW: مشاهد "سكتش على سبورة بيضاء" (whiteboard_sketch) — نفس فكرة draftCharacterAdventureScenes
// (visual + narration لكل مشهد) بس من غير أي قيد شخصية ثابتة — كل مشهد مستقل بصريًا، ومفيش
// وصف مظهر ممنوع هنا لأن مفيش صورة مرجعية أصلاً
async function draftWhiteboardScenes(idea, sceneCount, needsNarration) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const narrationField = needsNarration ? `, "narration": "one short natural narration sentence for this exact scene, in ${idea.videoLanguage?.startsWith('ar') ? 'the same Arabic dialect as the video' : 'English'}, continuing the story/explanation from the previous scene's narration"` : '';
  const system = `You write ${sceneCount} distinct scene beats (in English for "visual"${needsNarration ? ', matching-language narration for "narration"' : ''}) for a whiteboard-style explainer/story video. Each scene is a different moment/step/idea, in clear chronological or logical order${needsNarration ? ', with the narration forming one continuous script when read scene by scene' : ''}. Video idea: "${idea.title}" — ${idea.brief || ''}. Output ONLY a valid JSON array of exactly ${sceneCount} objects: [{"visual": "what to draw for this scene — the subject, objects, and any figures involved, described plainly (the drawing style itself is applied separately, do not mention style/medium here)"${narrationField}}, ...].`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: AGENT_MODEL,
      messages: [{ role: 'system', content: system }, { role: 'user', content: 'JSON array only:' }],
      max_tokens: 2000, temperature: 0.8, reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
  const scenes = JSON.parse(raw);
  if (!Array.isArray(scenes) || scenes.length < 2) throw new Error('Scene generation returned an invalid list');
  return scenes.slice(0, sceneCount).map(s => ({ visual: String(s.visual || s), narration: needsNarration ? String(s.narration || '') : null }));
}

// ✅ NEW: تحريك بسيط (Ken Burns — زوم بطيء ثابت) لصورة واحدة بـffmpeg، من غير أي موديل AI —
// ده أساس رخص محتوى الـwhiteboard (صور بس + تحريك مجاني، مش رندر فيديو AI لكل مشهد). بيرجع
// المدة المطلوبة بالظبط دايمًا (على عكس موديلات الفيديو اللي بتقرّب المدة)، فمحتاجين conform
// بعد كده خالص
function animateImageKenBurns(imagePath, W, H, durationSec, outPath, fps = 25) {
  const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
    `zoompan=z='min(zoom+0.0012,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${fps}`;
  execSync(
    `ffmpeg -y -loop 1 -framerate ${fps} -i "${imagePath}" -vf "${vf}" -t ${durationSec.toFixed(3)} -c:v libx264 -pix_fmt yuv420p -movflags +faststart "${outPath}"`,
    { stdio: 'pipe' }
  );
}

// ── محتوى "سكتش على سبورة بيضاء" (whiteboard_sketch) — أرخص أنواع المحتوى في النظام الجديد:
// 1) صور مشاهد بستايل رسم سكتش أبيض وأسود على خلفية بيضاء (نانو بنانا 2، من غير أي مرجع
//    شخصية — كل مشهد مستقل ومتوازي، أسرع من character_adventure)
// 2) (لو القناة بتستخدم صوت) نفس منطق التزامن بالظبط بتاع character_adventure: سرد منفصل
//    لكل مشهد، وبعدين تحريك الصورة (Ken Burns) بمدة الصوت الحقيقي بالظبط — بما إن ffmpeg
//    بيطلّع المدة المطلوبة بالظبط دايمًا، مفيش حاجة لـconformVideoDurationToAudio هنا خالص
// 3) دمج الكليبات + كابشن (بكريديت) + موسيقى (مجانية)
async function generateWhiteboardSketchVideo(run, channel, idea, shape, headers) {
  const MAX_SCENES = 20;
  const sceneCount = Math.min(channel.target_scene_count || shape.sceneCount, MAX_SCENES);
  const defaultSceneDurationSec = channel.target_duration_sec ? Math.max(3, Math.round(channel.target_duration_sec / sceneCount)) : shape.sceneDurationSec;
  const usesVoice = !!channel.uses_voice;
  const voiceKey = (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_wise';
  const [W, H] = shape.ratio === '16:9' ? [1920, 1080] : [1080, 1920];

  const scenes = await draftWhiteboardScenes(idea, sceneCount, usesVoice);

  // ── 1) صور السكتش — كل مشهد مستقل، مفيش تناسق شخصية مطلوب هنا ────────────────────
  const sketchStyleSuffix = 'Style: simple black-and-white hand-drawn whiteboard sketch/doodle animation style, clean thin line art, on a plain white background, no color, no shading, no text.';
  // ✅ NEW (طلب العميل: يختار بنفسه موديل الصور — راجع generateAnimatedVideo). مفيش موديل
  // تحريك هنا خالص (Ken Burns بـffmpeg مجاني، مش موديل AI) فمفيش animation_model يتطبق
  const imageModel = channel.image_model || 'nano_banana_2';
  const imgRes = await fetch(`${INTERNAL_BASE}/api/images/generate`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: imageModel, prompts: scenes.map(s => `${s.visual}. ${sketchStyleSuffix}`), aspectRatio: shape.ratio }),
  });
  const imgJobData = await imgRes.json();
  if (!imgRes.ok) throw new Error(imgJobData.error || 'Whiteboard scene image generation failed'); // لسه قبل خصم أي حاجة تانية
  const images = await pollJobGeneric(`${INTERNAL_BASE}/api/images/generate-status/${imgJobData.jobId}`, headers, 'images');
  if (!Array.isArray(images) || images.length < 2) { const e = new Error('Image generation returned too few images'); e.committed = true; throw e; }

  const narrations = [];
  try {
    // ── 2) لو القناة بتستخدم صوت: سرد كل مشهد لوحده الأول عشان نعرف مدته الحقيقية ────────
    // ✅ FIX (تحسين أداء آمن رصدته مراجعة كود — راجع نفس التعليق في generateAnimatedVideo):
    // synthesizeNarration نداء Replicate بحت من غير خصم كريديت، فآمن بالكامل يتنفذ بالتوازي
    if (usesVoice) {
      const synthesized = await Promise.all(scenes.map(s => {
        const text = s.narration?.trim() || idea.title;
        return synthesizeNarration(text, { voiceKey, languageCode: idea.videoLanguage || 'en' });
      }));
      narrations.push(...synthesized);
    }

    // ── 3) كل صورة تتحرك (Ken Burns) بمدة سرد نفس المشهد بالظبط (أو المدة الافتراضية) ───
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    const clipUrls = [];
    for (let i = 0; i < images.length; i++) {
      const targetDurationSec = usesVoice ? Math.max(3, narrations[i].durationSec) : defaultSceneDurationSec;
      const jobId = `wb_${run.id}_${i}_${Date.now()}`;
      const imgPath = path.join(TEMP_DIR, `${jobId}.jpg`);
      const clipPath = path.join(TEMP_DIR, `${jobId}.mp4`);
      try {
        await downloadToFile(images[i], imgPath);
        animateImageKenBurns(imgPath, W, H, targetDurationSec, clipPath);
        let clipUrl = await uploadBufferToR2(fs.readFileSync(clipPath), `generated-videos/whiteboard_${jobId}.mp4`, 'video/mp4');
        // ✅ ffmpeg بيطلّع المدة المطلوبة بالظبط دايمًا (على عكس موديلات فيديو AI) — التزامن
        // هنا أبسط، بس نركّب سرد المشهد على المشهد نفسه بنفس الطريقة
        if (usesVoice) clipUrl = await composeVideoAudio({ videoUrl: clipUrl, narrationPath: narrations[i].audioPath, modelKeyForNaming: 'whiteboard' });
        clipUrls.push(clipUrl);
      } finally {
        try { fs.unlinkSync(imgPath); } catch {}
        try { fs.unlinkSync(clipPath); } catch {}
      }
    }

    // ── 4) دمج كل الكليبات (كل واحد صوته متزامن بالفعل) ────────────────────────────
    let videoUrl = clipUrls.length === 1 ? clipUrls[0] : await mergeVideos(clipUrls);

    // ── 5) كابشن حقيقي لو مطلوب — بكريديت (التكلفة الحقيقية الوحيدة المتبقية هنا) ─────
    if (usesVoice && channel.captions_enabled !== 0) {
      const captionCost = getFlatCreditCost('autocaption');
      const balance = await getCreditsBalance(run.user_id);
      if (balance >= captionCost) {
        const charge = await chargeCredits(run.user_id, captionCost);
        if (charge.success) {
          try {
            const combinedAudioPath = path.join(TEMP_DIR, `whiteboard_narr_${run.id}_${Date.now()}.mp3`);
            concatAudioFiles(narrations.map(n => n.audioPath), combinedAudioPath);
            const words = await transcribeWithTimestamps(combinedAudioPath);
            const isRtl = ['ar', 'ar_eg', 'ar_gulf'].includes(idea.videoLanguage);
            videoUrl = await burnCaptions(videoUrl, words, { rightToLeft: isRtl });
            try { fs.unlinkSync(combinedAudioPath); } catch {}
          } catch (capErr) {
            console.warn(`[ChannelScheduler] Whiteboard captions failed for run ${run.id} (video still delivered without captions, credits refunded):`, capErr.message);
            await addCreditsBalance(run.user_id, captionCost);
          }
        }
      }
    }

    // ── 6) موسيقى خلفية خافتة — مجانية تمامًا، من المكتبة المحلية بمود يناسب محتوى تعليمي/سكتش
    if (usesVoice) {
      try {
        const musicBuffer = await getBackgroundMusicBuffer('youtube', 'calm playful lighthearted educational');
        videoUrl = await composeVideoAudio({ videoUrl, musicBuffer, modelKeyForNaming: 'whiteboard' });
      } catch (musicErr) {
        console.warn(`[ChannelScheduler] Whiteboard background music failed for run ${run.id} (video still delivered without music):`, musicErr.message);
      }
    }

    await saveVideo(run.user_id, videoUrl.replace(/^\/outputs\//, ''), idea.title).catch(() => {});
    return videoUrl;
  } catch (e) {
    // ✅ الصور خلاص اتولدت واتخصم تمنها قبل ما ندخل الكتلة دي — أي فشل من هنا لازم يبقى
    // "committed" عشان triggerApprovedGeneration منيرجعش للمسار الافتراضي ويخصم كريديت تاني
    e.committed = true;
    throw e;
  } finally {
    narrations.forEach(n => { try { fs.rmSync(n.workDir, { recursive: true, force: true }); } catch {} });
  }
}

// ── لو العميل وافق: الموقع يقرر أنسب موديل لمحتوى القناة (contentStyle من draftDailyIdea)
// ويولّد بيه. لو المسار الذكي (واقعي/خريطة) فشل قبل أي خصم كريديت، بنرجع تلقائيًا للمسار
// الافتراضي (generateAnimatedVideo) بدل ما يوم العميل يضيع بالكامل بسبب باج في مسار جديد
export async function triggerApprovedGeneration(run, overrides = {}) {
  const dbChannel = await getManagedChannelById(run.channel_id);
  if (!dbChannel) throw new Error('Channel not found');
  // ✅ NEW (طلب العميل: تجاوز لمرة واحدة بس عن طريق الشات — "اعمل الفيديو 15 ثانية"/"3 مشاهد"/
  // "من غير كابشن" — من غير ما يغيّر إعدادات القناة الدائمة في my channels). بيتفلتر/يتحقق
  // منه في agentRoutes.js's CHANNEL_GENERATE handler قبل ما يوصل هنا، فمش بيوصل غير قيم سليمة.
  // الافتراضي (overrides={}) هو المسار العادي (الإيميل اليومي)، مفيهوش أي تغيير
  const channel = {
    ...dbChannel,
    target_scene_count: overrides.sceneCount ?? dbChannel.target_scene_count,
    target_duration_sec: overrides.durationSec ?? dbChannel.target_duration_sec,
    captions_enabled: overrides.captionsEnabled !== undefined ? (overrides.captionsEnabled ? 1 : 0) : dbChannel.captions_enabled,
    // ✅ FIX: "بدون فويس أوفر" في الشات كان مالوش أي مكان يوصل بيه للتوليد (overrides كانت بس مشاهد/
    // مدة/كابشن)، فالقناة كانت بتكمّل بإعدادها الدائم وتولّد صوت رغم طلب العميل الصريح
    uses_voice: overrides.usesVoice !== undefined ? (overrides.usesVoice ? 1 : 0) : dbChannel.uses_voice,
  };
  const user = await getUserById(run.user_id);
  const idea = JSON.parse(run.idea_brief || '{}');
  const shape = run.format === 'short' ? SHORT_FORM : LONG_FORM;
  // ✅ NEW: claim "channelRun" بيعلّم كل طلب داخلي جاي من الأتوبايلوت اليومي — بيستخدمه
  // /api/videos/merge عشان يعفي رسوم التجميع/الفويس أوفر/الموسيقى (مش الكابشن، ولا توليد
  // الفيديو نفسه) للعملاء الرابطين قنواتهم بالموقع — ميزة تميّز خاصة بيهم
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(run.user_id, user.email, { channelRun: true }) };

  const contentStyle = ['map', 'realistic', 'character_adventure', 'whiteboard_sketch'].includes(idea.contentStyle) ? idea.contentStyle : 'animated';

  // ✅ لو العميل اختار صراحة موديل صور أو تحريك للقناة، نحترم اختياره حتى لو نوع المحتوى
  // واقعي/خرائط (اللي أصلاً بيبني من لقطات Pexels الجاهزة ومفيهوش موديلات) — بنولّد بالمسار
  // الذكي (generateAnimatedVideo) اللي بيستخدم الموديلات دي فعليًا. من غير اختيار صريح
  // (الافتراضي) السلوك القديم زي ما هو بالظبط
  const hasExplicitModel = !!(channel.image_model || channel.animation_model);
  console.log(`[ChannelScheduler] run ${run.id} (channel ${channel.id}) style=${contentStyle} image_model=${channel.image_model || 'DEFAULT(nano_banana_2)'} animation_model=${channel.animation_model || 'DEFAULT(seedance_2_5)'}`);
  if (contentStyle === 'map' && !hasExplicitModel) {
    try { return await generateMapVideo(run, channel, idea, shape, headers); }
    catch (e) {
      if (e.committed) throw e;
      console.warn(`[ChannelScheduler] map pipeline failed before charging for run ${run.id}, falling back to animated:`, e.message);
    }
  } else if (contentStyle === 'realistic' && !hasExplicitModel) {
    try { return await generateRealisticVideo(run, channel, idea, shape, headers); }
    catch (e) {
      if (e.committed) throw e;
      console.warn(`[ChannelScheduler] realistic pipeline failed before charging for run ${run.id}, falling back to animated:`, e.message);
    }
  } else if (contentStyle === 'character_adventure' && channel.character_reference_id) {
    try { return await generateCharacterAdventureVideo(run, channel, idea, shape, headers); }
    catch (e) {
      if (e.committed) throw e;
      console.warn(`[ChannelScheduler] character_adventure pipeline failed before charging for run ${run.id}, falling back to animated:`, e.message);
    }
  } else if (contentStyle === 'whiteboard_sketch') {
    try { return await generateWhiteboardSketchVideo(run, channel, idea, shape, headers); }
    catch (e) {
      if (e.committed) throw e;
      console.warn(`[ChannelScheduler] whiteboard_sketch pipeline failed before charging for run ${run.id}, falling back to animated:`, e.message);
    }
  }
  return await generateAnimatedVideo(run, channel, idea, shape, headers);
}

// ✅ NEW (طلب العميل: "اقدر اقول للايجنت اعمل فيديو وانشره على القناة دلوقتي"): نسخة "دلوقتي"
// من نفس مسار /daily-approve بالظبط (channelRoutes.js) — بس الموافقة بتحصل حية في المحادثة
// نفسها بدل إيميل، فمفيش approve_token ولا إيميل موافقة. بترجع فورًا (runId + idea + تكلفة
// تقديرية لو أمكن حسابها) عشان الايجنت يرد على العميل في نفس اللحظة، والتوليد الفعلي بيشتغل
// في الخلفية (IIFE منفصل، بالظبط زي مسار الإيميل) — التقدّم بيتابَع عن طريق
// GET /api/channels/runs/:id/status، والتكلفة الحقيقية النهائية بتتحسب بفرق الرصيد قبل/بعد
// (أدق من محاولة نجمّع كل خصم كريديت يدويًا عبر كل مسارات المحتوى الخمسة المختلفة)
// ✅ FIX (طلب العميل: "المفروض الصور بتتعمل ورفرنس، النظام الجديد كله" — النمط الافتراضي
// "animated" بقى بيستخدم نفس بنية الصور+تحريك+تزامن الجديدة زي character_adventure/
// whiteboard_sketch بالظبط، مش موديل 8 القديم تاني — راجع generateAnimatedVideo تحت):
// دلوقتي كل أنماط المحتوى الخمسة بتكلفتها من موديلات خارجية متنوعة (صور + تحريك) مش معروفة
// إلا بعد التوليد فعليًا، فمفيش تقدير دقيق مقدمًا لأي نمط تاني — نرجع null زي الباقي كلهم،
// والتكلفة الحقيقية بتتحسب بفرق الرصيد قبل/بعد (triggerChannelRunNow) وتتقال للعميل بعد ما يخلص
export function estimateChannelRunCost(channel, format, idea = null) {
  return estimateChannelRunBreakdown(channel, format, idea)?.total ?? null;
}

// ✅ NEW: مشروع دائم واحد لكل قناة — بيتعمل تلقائيًا أول مرة بس، وبيتحفظ على القناة نفسها
// (managed_channels.project_id) عشان كل تشغيلة جاية (يومية أو من الشات) تستخدم نفس المشروع،
// فسجل مراجعة/نشر الفيديوهات لقناة معينة يفضل مكان واحد ثابت العميل يعرف يرجعله
export async function getOrCreateChannelProject(channel) {
  if (channel.project_id) return channel.project_id;
  const project = await createProjectForUser(channel.user_id, `🎬 ${channel.label || channel.channel_id || 'Channel'} — Auto Videos`);
  await setChannelProjectId(channel.id, project.id);
  return project.id;
}

// رسالة واضحة للعميل عن سبب فشل التشغيلة (نفاد الكريديت بالأرقام لو معروفة)
export function describeRunError(e) {
  if (typeof e?.message === 'string' && e.message.startsWith('insufficient_credits')) {
    return e.creditsNeeded
      ? `Not enough credits — this video needs about ${e.creditsNeeded} credits to start and your balance is ${e.balance}. Top up and try again.`
      : 'Not enough credits — top up your balance and try again.';
  }
  return e?.message || 'Generation failed';
}

// ✅ NEW: فيديو وقف قبل ما يكتمل لأن الكريديت خلص — بيتسلّم للعميل كفيديو ناقص (مركّب زي الطبيعي:
// صوت + موسيقى)، مع حالة "partial" وكارت بزرار "كمّل" وإيميل يشرح كام مشهد اتعمل وكام محتاج
async function finalizePartialRun(run, channel, idea, videoUrl, creditsCharged, resumed) {
  const partial = run._partial;
  await updateDailyVideoRunStatus(run.id, 'done', { videoUrl, creditsCharged, reviewState: 'partial' });
  let projectId = null;
  try {
    projectId = await getOrCreateChannelProject(channel);
    const job = {
      runId: run.id, channelId: channel.id, videoUrl, ideaTitle: idea.title,
      creditsCharged: creditsCharged ?? null, reviewState: 'partial', canPublish: false, partial,
    };
    const patched = resumed && await updateProjectMessageByRunId(projectId, run.id, job).catch(() => false);
    if (!patched) await appendProjectMessages(projectId, channel.user_id, [{ role: 'assistant', type: 'channelReview', job }]);
  } catch (e) {
    console.warn(`[ChannelScheduler] Could not add partial-video card for run ${run.id}:`, e.message);
  }
  const user = await getUserById(channel.user_id);
  if (user?.email) await sendPartialRunEmail(user.email, idea, videoUrl, partial, projectId ? `🎬 ${channel.label || channel.channel_id || 'Channel'} — Auto Videos` : null).catch(() => {});
}

async function sendPartialRunEmail(userEmail, idea, videoUrl, partial, projectName) {
  const prefs = await getNotificationPrefsByEmail(userEmail).catch(() => ({ emailEnabled: true, videoReady: true }));
  if (!prefs.emailEnabled || !prefs.videoReady) return;
  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const needLine = partial.estimatedRemaining ? `Finishing it needs about <strong style="color:#fff">${partial.estimatedRemaining} credits</strong>${partial.balance != null ? ` (your balance: ${partial.balance})` : ''}.` : '';
  const html = `<div style="font-family:sans-serif;max-width:500px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:52px">⚠️</div><h2 style="color:#f59e0b;margin:8px 0">Your credits ran out before the video was finished</h2><p style="color:#d1d5db;font-size:15px"><strong style="color:#fff">${esc(idea.title)}</strong></p><p style="color:#9ca3af;font-size:14px;line-height:1.8">${partial.scenesDone} of ${partial.scenesTotal} scenes were made. Here is the video produced so far:</p><p><a href="${videoUrl}" style="display:inline-block;background:#7c6af7;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700">Watch the video so far →</a></p><p style="color:#9ca3af;font-size:14px;line-height:1.8">To finish it, top up your credits or upgrade to a bigger plan. ${needLine}<br/>Then open ${projectName ? `<strong style="color:#fff">${esc(projectName)}</strong>` : 'your project'} on Erivion and press <strong style="color:#fff">Continue</strong> — the remaining scenes are made in the same style and joined in order.</p><p style="margin-top:20px"><a href="${FRONTEND_URL}" style="display:inline-block;background:#22c55e;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700">Open Erivion →</a></p></div>`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Erivion <noreply@erivion.net>', to: userEmail, subject: `⚠️ ${idea.title} stopped at scene ${partial.scenesDone} of ${partial.scenesTotal} — credits ran out`, html }),
  }).catch(() => {});
}

// ✅ NEW: استكمال فيديو ناقص (زرار "كمّل" في الكارت أو الأجنت). بيتأكد الأول إن الرصيد يكفي
// المشهد الجاي على الأقل، بيعمل claim ذري (ضغطتين = مرة واحدة بس)، وبيكمّل في الخلفية من نفس
// المشهد بنفس الموديلات والترتيب اللي اتحفظوا، وبيحدّث نفس الكارت لما يخلص
export async function startResumeChannelRun(userId, runId) {
  const { getDailyVideoRunById } = await import('./authService.js');
  const runRow = await getDailyVideoRunById(runId, userId);
  if (!runRow || runRow.review_state !== 'partial' || !runRow.resume_state) return { ok: false, error: 'not_resumable' };
  const st = JSON.parse(runRow.resume_state);
  let nextCost;
  try { nextCost = getPerSecondCreditCost(st.animationModel, st.defaultSceneDurationSec); } catch { nextCost = 0; }
  const balance = await getCreditsBalance(userId);
  if (balance < nextCost) return { ok: false, error: 'insufficient_credits', needed: nextCost, balance, estimatedRemaining: estimateRemainingCost(st) };
  const claimed = await claimDailyVideoRunForResume(runId, userId);
  if (!claimed) return { ok: false, error: 'already_resuming' };

  (async () => {
    const channel = await getManagedChannelById(claimed.channel_id);
    const idea = JSON.parse(claimed.idea_brief || '{}');
    const shape = claimed.format === 'short' ? SHORT_FORM : LONG_FORM;
    const run = { id: claimed.id, channel_id: claimed.channel_id, user_id: claimed.user_id, idea_brief: claimed.idea_brief, format: claimed.format };
    try {
      const user = await getUserById(claimed.user_id);
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(claimed.user_id, user.email, { channelRun: true }) };
      const balanceBefore = await getCreditsBalance(claimed.user_id).catch(() => null);
      const videoUrl = await renderScenesFromImages(run, channel, idea, shape, headers, st);
      const balanceAfter = await getCreditsBalance(claimed.user_id).catch(() => null);
      const spent = (balanceBefore != null && balanceAfter != null) ? Math.max(0, balanceBefore - balanceAfter) : 0;
      await finalizeChannelRunAfterGeneration(run, channel, idea, videoUrl, (claimed.credits_charged || 0) + spent, { resumed: true });
    } catch (e) {
      console.error(`[ChannelScheduler] Resume failed for run ${claimed.id}:`, e.message);
      // نرجّعها "ناقصة" (الكليبات اللي خلصت محفوظة) عشان العميل يقدر يجرب تاني بدل ما تضيع
      await updateDailyVideoRunStatus(claimed.id, 'done', { reviewState: 'partial', error: describeRunError(e) }).catch(() => {});
      if (channel?.project_id) await updateProjectMessageByRunId(channel.project_id, claimed.id, { reviewState: 'partial', resumeError: describeRunError(e) }).catch(() => {});
    }
  })();
  return { ok: true, scenesDone: st.clipUrls.length, scenesTotal: st.images.length, estimatedRemaining: estimateRemainingCost(st) };
}

// ✅ NEW (طلب العميل: "العميل يراجع الفيديو الأول وبعد كده يوافق على النشر او لا" — قبل
// كده كان في رفع تلقائي فوري ليوتيوب من غير أي مراجعة بشرية): بعد ما التوليد يخلص بنجاح
// (سواء من الإيميل اليومي أو من الشات دلوقتي)، مشترك بين المسارين الاتنين (channelRoutes.js's
// /daily-approve وtriggerChannelRunNow تحت) — بيحط التشغيلة في حالة "محتاجة مراجعة"، يولّد
// توكن مراجعة، يضيف كارت فيديو حقيقي (قابل للعب) في مشروع القناة الدائم، ويبعت إيميل مراجعة
// فيه زرارين حقيقيين. النشر الفعلي بيحصل بس لما العميل يضغط "نشر الآن" (resolveChannelRunReview)
export async function finalizeChannelRunAfterGeneration(run, channel, idea, videoUrl, creditsCharged, { resumed = false } = {}) {
  // ✅ الكريديت خلص قبل ما الفيديو يكتمل: نسلّم اللي اتعمل كفيديو ناقص (مش حزمة رفع كاملة)
  if (run._partial) return finalizePartialRun(run, channel, idea, videoUrl, creditsCharged, resumed);
  const reviewToken = crypto.randomBytes(24).toString('hex');
  await updateDailyVideoRunStatus(run.id, 'done', { videoUrl, creditsCharged, reviewState: 'awaiting_review', reviewToken });

  // ✅ حزمة الرفع الجاهزة: الصورة المصغّرة بتتولّد هنا مع الفيديو (فشلها مايوقفش أي حاجة —
  // العنوان والوصف والكلمات موجودين أصلاً من فكرة اليوم)
  let thumbnailUrl = null;
  try {
    const owner = await getUserById(channel.user_id);
    const thumbHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(channel.user_id, owner.email, { channelRun: true }) };
    thumbnailUrl = await generateChannelThumbnailImage(idea, thumbHeaders);
    await setDailyVideoRunThumbnail(run.id, thumbnailUrl);
  } catch (e) {
    console.warn(`[ChannelScheduler] Thumbnail generation failed for run ${run.id} (the rest of the upload package is still delivered):`, e.message);
  }

  let projectId = null;
  try {
    projectId = await getOrCreateChannelProject(channel);
    const reviewJob = {
      runId: run.id, channelId: channel.id, videoUrl, ideaTitle: idea.title,
      creditsCharged: creditsCharged ?? null, reviewState: 'awaiting_review',
      canPublish: YOUTUBE_PUBLISH_ENABLED && !!channel.youtube_refresh_token, partial: null,
    };
    // فيديو مستكمل: نحدّث الكارت الناقص الموجود (نفس المكان) بدل ما نضيف كارت تاني
    const patched = resumed && await updateProjectMessageByRunId(projectId, run.id, reviewJob).catch(() => false);
    if (!patched) {
      await appendProjectMessages(projectId, channel.user_id, [{ role: 'assistant', type: 'channelReview', job: reviewJob }]);
    }
  } catch (e) {
    console.warn(`[ChannelScheduler] Could not add review card to channel project for run ${run.id} (video is still safe, just not shown in a project):`, e.message);
  }

  const user = await getUserById(channel.user_id);
  if (user?.email) {
    await sendDailyResultEmail(user.email, idea, videoUrl, true, null, { reviewToken, projectId, thumbnailUrl, projectName: `🎬 ${channel.label || channel.channel_id || 'Channel'} — Auto Videos` }).catch(() => {});
  }
}

// ✅ FIX (طلب العميل: النص على الصورة المصغّرة كان بيحط العنوان كامل — طويل جدًا وميتقراش
// كويس على thumbnail صغير. لازم يكون كلمة لـ3 كلمات بس، قوية ومرتبطة بموضوع الفيديو فعليًا،
// ومش مخالفة لسياسات يوتيوب/الربح (مفيش clickbait وهمي أو إيحاءات عنيفة/جنسية/مضللة) — بنولّد
// "hook" قصير بالـLLM بدل ما نستخدم العنوان الكامل زي ما كان
async function draftThumbnailHookText(idea) {
  if (!GROQ_API_KEY) return idea.title; // ✅ fallback آمن لو Groq مش متاح لأي سبب
  const isArabic = (idea.videoLanguage || '').startsWith('ar');
  const system = `You write extremely short YouTube thumbnail hook text — 1 to 3 words MAXIMUM, in ${isArabic ? 'the same Arabic dialect as the video title' : 'English'}. It must be a strong, punchy, attention-grabbing phrase that is genuinely and honestly related to the video's real content (never a vague or unrelated word just for shock value). It must comply with YouTube's Community Guidelines and monetization/ad-friendly content policies: no clickbait or misleading claims the video doesn't actually deliver, no violent/gory/sexual/hateful implications, no fake urgency or spam-style symbols. Output ONLY the short hook text itself, nothing else — no quotes, no explanation.`;
  const user = `Video title: "${idea.title}"\nBrief: ${idea.brief || ''}\n\nShort hook text (1-3 words):`;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AGENT_MODEL,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        max_tokens: 60, temperature: 0.7, reasoning_effort: 'low',
      }),
    });
    if (!res.ok) return idea.title;
    const data = await res.json();
    const hook = (data.choices?.[0]?.message?.content || '').replace(/^["'\s]+|["'\s]+$/g, '').trim();
    return hook || idea.title;
  } catch {
    return idea.title; // ✅ فشل توليد الـhook مايوقفش الصورة المصغّرة كلها — نرجع للعنوان
  }
}

// ✅ NEW (طلب العميل: صورة مصغّرة تلقائية لكل فيديو قناة بموديل nano_banana_2 تحديدًا —
// موصى بيه لأنه الأفضل حاليًا في كتابة نص عربي/إنجليزي واضح جوه الصورة نفسها، وده أهم عنصر
// في صورة مصغّرة كويسة تجذب مشاهدات على يوتيوب). بيتحاسب بكريديت زي أي صورة عادية (نفس
// مسار /api/images/generate العادي، مفيش تمييز خاص أو إعفاء)
// توليد صورة الصورة المصغّرة فقط (بترجّع الرابط) — بتتولّد مع الفيديو نفسه عشان العميل يلاقيها
// جاهزة ضمن حزمة الرفع، ومن غير رفع أي حاجة على يوتيوب
async function generateChannelThumbnailImage(idea, headers) {
  const isArabic = (idea.videoLanguage || '').startsWith('ar');
  const hookText = await draftThumbnailHookText(idea);
  const prompt = `Create a bold, high-contrast, eye-catching YouTube thumbnail image related to: "${idea.title}". Include this exact short text as large, clearly readable ${isArabic ? 'Arabic' : 'English'} typography overlaid on the image: "${hookText}". Professional YouTube thumbnail style, dramatic lighting, vivid colors. The thumbnail must comply with YouTube's Community Guidelines and monetization policies — no violent, gory, sexual, hateful, or misleading imagery.`;
  const imgRes = await fetch(`${INTERNAL_BASE}/api/images/generate`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: 'nano_banana_2', prompt, aspectRatio: '16:9' }),
  });
  const imgJobData = await imgRes.json();
  if (!imgRes.ok) throw new Error(imgJobData.error || 'Thumbnail image generation failed');
  const images = await pollJobGeneric(`${INTERNAL_BASE}/api/images/generate-status/${imgJobData.jobId}`, headers, 'images');
  const thumbnailUrl = Array.isArray(images) ? images[0] : null;
  if (!thumbnailUrl) throw new Error('Thumbnail generation returned no image');
  return thumbnailUrl;
}

async function generateAndUploadChannelThumbnail(run, channel, idea, videoId, headers) {
  const thumbnailUrl = run.thumbnail_url || await generateChannelThumbnailImage(idea, headers);
  await uploadThumbnailToYoutube(channel, videoId, thumbnailUrl);
}

// ✅ NEW: التنفيذ الفعلي لضغطة "تمت المراجعة" أو "نشر الآن" — مشترك بين مسار الإيميل
// (توكن، من غير تسجيل دخول) ومسار الموقع (المستخدم داخل حسابه) في channelRoutes.js
export async function resolveChannelRunReviewAction(run, action) {
  if (run.review_state === 'partial' || run.review_state === 'resuming') throw new Error('This video is not finished yet (credits ran out before the last scenes) — finish it first.');
  const channel = await getManagedChannelById(run.channel_id);
  if (action === 'reviewed') {
    await updateDailyVideoRunStatus(run.id, 'done', { reviewState: 'reviewed', reviewed: true });
    if (channel?.project_id) {
      await updateProjectMessageByRunId(channel.project_id, run.id, { reviewState: 'reviewed' }).catch(() => {});
    }
    return {};
  }
  if (action === 'publish') {
    if (!YOUTUBE_PUBLISH_ENABLED) throw new Error('Publishing to YouTube from Erivion is turned off. Download the video and upload it yourself from YouTube Studio — your title, description, tags and thumbnail are ready in the video card.');
    if (!channel) throw new Error('Channel not found');
    if (!channel.youtube_refresh_token) throw new Error('This channel is not connected to YouTube yet — connect it first from "My Channels".');
    if (run.youtube_video_id) throw new Error('This video was already published.');
    // ✅ لازم العميل يكون وافق صراحة على شروط النشر عن طريق Erivion (مرة واحدة لكل قناة)
    if (!channel.youtube_publish_ack_at) throw new Error('Before publishing through Erivion, please accept the publishing terms once: open Erivion → My Channels and press "Accept publishing terms" on this channel. (Publishing stays your decision and your responsibility — you can also just download the video and upload it to YouTube yourself.)');
    // ✅ FIX (باج حقيقي رصدته مراجعة كود: مفيش قفل ذري هنا — طلبين "نشر الآن" متزامنين (double
    // click، أو email link-scanner بيعمل prefetch) كانوا بيقروا youtube_video_id=null في نفس
    // اللحظة قبل ما أي واحد يخلص الرفع، فبيرفعوا نفس الفيديو مرتين فعليًا على قناة يوتيوب
    // الحقيقية. claimRunForPublishing بتعمل UPDATE ذري يقفل فورًا قبل أي نداء حقيقي لـYouTube —
    // لو حد تاني كسب السباق أو الفيديو اتنشر فعلاً، مفيش صف يرجع فنوقف هنا
    const claimed = await claimRunForPublishing(run.id);
    if (!claimed) throw new Error('This video is already being published (or was already published).');
    const idea = JSON.parse(run.idea_brief || '{}');
    let youtubeVideoId;
    try {
      // أول فيديو بيتنشر على القناة عن طريقنا بيطلع "غير مدرج" — العميل يحوّله لعام بنفسه بعد ما يتأكد
      const isFirstPublish = (channel.youtube_publish_count || 0) === 0;
      youtubeVideoId = await uploadVideoToYoutube(channel, { videoUrl: run.video_url, title: idea.title, description: idea.description || idea.brief || '', tags: idea.tags, ...(isFirstPublish ? { privacyStatus: 'unlisted' } : {}) });
    } catch (e) {
      // ✅ فشل حقيقي (مش سباق) — نفك القفل عشان العميل يقدر يحاول "نشر الآن" تاني من غير ما يفضل عالق
      await releasePublishingClaim(run.id).catch(() => {});
      throw e;
    }
    await linkYoutubeVideoToRun(run.id, run.user_id, youtubeVideoId);
    await incrementYoutubePublishCount(channel.id).catch(() => {});
    // ✅ NEW (طلب العميل: صورة مصغّرة تلقائية بموديل nano_banana_2 — الأفضل حاليًا في كتابة
    // نص عربي/إنجليزي واضح جوه الصورة، وده أهم حاجة في صورة مصغّرة كويسة على يوتيوب). فشلها
    // مايوقفش النشر خالص — الفيديو خلاص لايف، يوتيوب هيسيب صورته الافتراضية بدلها بس
    try {
      const user = await getUserById(run.user_id);
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(run.user_id, user.email, { channelRun: true }) };
      await generateAndUploadChannelThumbnail(run, channel, idea, youtubeVideoId, headers);
    } catch (e) {
      console.warn(`[ChannelScheduler] Thumbnail generation/upload failed for run ${run.id} (video still published with YouTube's default thumbnail):`, e.message);
    }
    await updateDailyVideoRunStatus(run.id, 'done', { reviewState: 'published', reviewed: true });
    if (channel.project_id) {
      await updateProjectMessageByRunId(channel.project_id, run.id, { reviewState: 'published', youtubeVideoId }).catch(() => {});
    }
    return { youtubeVideoId };
  }
  throw new Error(`Unknown review action: ${action}`);
}

export async function triggerChannelRunNow(channel, overrides = {}) {
  const { idea, format } = await getFreshChannelIdea(channel);
  const estimatedCost = estimateChannelRunCost(channel, format, idea);
  const runId = await createDailyVideoRun({
    channelId: channel.id, userId: channel.user_id,
    ideaTitle: idea.title, ideaBrief: JSON.stringify(idea), format, approveToken: null,
  });
  await updateDailyVideoRunStatus(runId, 'generating', { decided: true });

  (async () => {
    const balanceBefore = await getCreditsBalance(channel.user_id).catch(() => null);
    try {
      const run = { id: runId, channel_id: channel.id, user_id: channel.user_id, idea_brief: JSON.stringify(idea), format };
      const videoUrl = await triggerApprovedGeneration(run, overrides);
      const balanceAfter = await getCreditsBalance(channel.user_id).catch(() => null);
      const creditsCharged = (balanceBefore != null && balanceAfter != null) ? Math.max(0, balanceBefore - balanceAfter) : null;
      await finalizeChannelRunAfterGeneration(run, channel, idea, videoUrl, creditsCharged);
    } catch (e) {
      const errorMsg = describeRunError(e);
      await updateDailyVideoRunStatus(runId, 'failed', { error: errorMsg });
      console.error(`[ChannelScheduler] On-demand (agent-triggered) generation failed for run ${runId}:`, e.message);
    }
  })();

  return { runId, idea, format, estimatedCost };
}

// ✅ FIX (طلب العميل: "العميل يراجع الفيديو الأول وبعد كده يوافق على النشر او لا" — قبل كده
// كان الفيديو بيترفع على يوتيوب تلقائي فورًا من غير أي مراجعة بشرية، والإيميل كان بس بيقول
// "جاهز" مع رابط تحميل): لما success=true دلوقتي، الإيميل بيوضح إن الفيديو جاهز للمراجعة
// (مش منشور لسه) وفيه زرارين حقيقيين (بتوكن review_token، من غير تسجيل دخول): "تمت المراجعة"
// (يأكد بس، من غير نشر) و"نشر الآن" (ينشر فعليًا على يوتيوب لو القناة متربطة). لو مش هيضغط
// أي زرار من الإيميل، نفس الزرارين موجودين جوه مشروع القناة نفسه على الموقع (reviewInfo.projectId)
export async function sendDailyResultEmail(userEmail, idea, videoUrl, success, errorMessage, reviewInfo = null) {
  // ✅ FIX: كان بيبعت الإيميل ده دايمًا من غير أي فحص لتفضيل "Video Ready Alerts" —
  // العميل لسه يقدر يراجع/ينشر الفيديو من صفحة القناة نفسها (نفس النص جوه الإيميل بيقول
  // كده)، فتفويت الإيميل بس آمن تمامًا لو العميل قافل التفضيل ده صراحة
  const prefs = await getNotificationPrefsByEmail(userEmail).catch(() => ({ emailEnabled: true, videoReady: true }));
  if (!prefs.emailEnabled || !prefs.videoReady) return;
  let html;
  if (success && reviewInfo?.reviewToken && !YOUTUBE_PUBLISH_ENABLED) {
    const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const where = reviewInfo.projectName ? `in your project <strong style="color:#fff">${esc(reviewInfo.projectName)}</strong>` : 'in your Erivion projects';
    html = `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">🎬</div><h2 style="color:#22c55e;margin:8px 0">Your video is ready!</h2><p style="color:#d1d5db;font-size:15px;line-height:1.7"><strong style="color:#fff">${esc(idea.title)}</strong></p><p style="color:#9ca3af;font-size:14px;line-height:1.8">The video, thumbnail, title, description and keywords are all ready ${where}.<br/>Open it, copy what you need, and upload it to your channel.</p><p style="margin-top:22px"><a href="${FRONTEND_URL}" style="display:inline-block;background:#7c6af7;color:#fff;padding:12px 26px;border-radius:10px;text-decoration:none;font-weight:700">Open Erivion →</a></p></div>`;
  } else if (success && reviewInfo?.reviewToken) {
    const reviewedUrl = `${BACKEND_URL}/api/channels/review-action?token=${reviewInfo.reviewToken}&action=reviewed`;
    const publishUrl = `${BACKEND_URL}/api/channels/review-action?token=${reviewInfo.reviewToken}&action=publish`;
    const projectNote = reviewInfo.projectId ? `<p style="color:#6b7280;font-size:13px">You can also do this anytime from the video's project on Erivion.</p>` : '';
    html = `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">🎬</div><h2 style="color:#22c55e">Your video is ready for review!</h2><p style="color:#9ca3af">${idea.title}</p><a href="${FRONTEND_URL}${videoUrl}" style="display:inline-block;margin-top:12px;color:#7c6af7;text-decoration:none;font-weight:600">Watch the full video first →</a><div style="margin-top:20px;display:flex;gap:12px;justify-content:center"><a href="${reviewedUrl}" style="background:#374151;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">✅ Reviewed</a><a href="${publishUrl}" style="background:#ef4444;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">🚀 Publish Now</a></div>${projectNote}</div>`;
  } else if (success) {
    html = `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">🎬</div><h2 style="color:#22c55e">Your video is ready!</h2><p style="color:#9ca3af">${idea.title}</p><a href="${FRONTEND_URL}${videoUrl}" style="display:inline-block;margin-top:16px;background:#7c6af7;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700">Watch / Download →</a></div>`;
  } else {
    html = `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:center"><div style="font-size:56px">⚠️</div><h2 style="color:#ef4444">Today's video couldn't be made</h2><p style="color:#9ca3af">${errorMessage || 'Something went wrong.'}</p></div>`;
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Erivion <noreply@erivion.net>', to: userEmail, subject: success ? `✅ ${idea.title} is ready to review!` : `⚠️ Today's video failed`, html }),
  }).catch(() => {});
}
