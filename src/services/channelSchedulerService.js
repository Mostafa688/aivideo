// ── channelSchedulerService.js ───────────────────────────────────────────────
// دورة "القناة اليومية": كل قناة نشطة بنجيبلها فكرة قوية (VidIQ + Groq) مرة كل يوم،
// نبعت للعميل إيميل فيه Approve/Reject، ولو وافق بنعمل الفيديو فعليًا (موديل 8 —
// نفس محرك المشاهد الرخيص، بصوت أو من غيره حسب تفضيل العميل) ونبعتله لينك الفيديو.

import fetch from 'node-fetch';
import crypto from 'crypto';
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import {
  getDueManagedChannels, markManagedChannelRun, createDailyVideoRun,
  getDailyVideoRunByToken, updateDailyVideoRunStatus, getManagedChannelById,
  mintInternalToken, getUserById, getCreditsBalance, chargeCredits, addCreditsBalance, saveVideo, saveChannelAnalysis,
  getCharacterReferenceById,
} from './authService.js';
import { buildChannelProfile, findVideoIdeaCandidates, verifyVidiqKey, callVidiqTool } from './vidiqClientService.js';
import { renderModel8Video } from './pvideoService.js';
import { getMaxClipSeconds, getFlatCreditCost } from './creditPricingEngine.js';
import { synthesizeNarration, conformVideoDurationToAudio, composeVideoAudio, transcribeWithTimestamps, burnCaptions, getBackgroundMusicBuffer } from './videoAudioService.js';
import { mergeVideos } from './videoMergeService.js';

const TEMP_DIR = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AGENT_MODEL = 'openai/gpt-oss-120b';
const INTERNAL_BASE = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://erivion.net';
const BACKEND_URL = process.env.BACKEND_URL || process.env.SITE_URL || FRONTEND_URL;

// نفس أسعار موديل 8 بالظبط (index.js) — لازم يفضلوا متطابقين لو اتغيروا هناك
const MODEL8_RATE_NONE = 4;
const MODEL8_RATE_VOICEOVER = 5;

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

async function draftDailyIdea(profile, candidates, format, uses_voice, persistedContentStyle = null) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const titlesList = candidates.map(c => `- ${c.title}`).join('\n') || '(none found)';
  const recentList = (profile.recentTitles || []).map(t => `- ${t}`).join('\n') || '(no recent videos)';
  // ✅ لو القناة اتحللت أوتوماتيك قبل كده، contentStyle بقى قرار ثابت محفوظ على القناة —
  // منسيبش الـLLM يعيد تخمينه كل يوم من عنوين قليلة، ده بيضمن ثبات نوع المحتوى يوم بعد يوم
  const contentStyleField = persistedContentStyle
    ? `"contentStyle":"${persistedContentStyle}"` : `"contentStyle":"realistic"|"map"|"animated"`;
  const system = `You plan ONE new YouTube video idea per day for a real channel, based on real data, AND write its full upload metadata (this metadata is used as-is for the real YouTube upload — it must be genuinely strong, not a placeholder). You are given the channel's own recent video titles (so you can match its established language, dialect, and tone) and a list of currently-breaking-out videos in its niche (for inspiration only — never copy a title/idea verbatim, always make something original and specific). Output ONLY valid JSON: {"title":"...", "brief":"1-2 sentence description of what the video covers, used internally for planning", "description":"the FULL YouTube video description, 3-5 short paragraphs, written for real viewers: open with a compelling 1-2 sentence hook that naturally includes the main keyword/topic (this part shows in search results before 'more'), then expand on what the video covers, and end with a soft call-to-action to subscribe — written in the same language as the title, never generic filler", "tags":["8 to 15 real, specific, relevant search keywords/phrases a viewer would actually type, no hashtags, no duplicates, ordered most-important first"], "videoLanguage":"en"|"ar"|"ar_eg"|"ar_gulf"|etc, "voiceoverScript":"if voice is requested, a short natural narration opening line in the channel's own language/dialect matching its recent titles, else omit", ${contentStyleField}}. The title itself must be strong and SEO-friendly: specific (not vague/clickbait-empty), front-loads the main keyword, and matches how real viewers in this niche actually search. Match the channel's actual language and dialect (e.g. Egyptian Arabic vs Gulf Arabic vs MSA vs English) based on its recent titles — do not default to English or MSA if the channel clearly writes in a dialect. The video format is ${format === 'short' ? 'a SHORT (under 60s, punchy, single hook)' : 'a LONG-FORM video (several minutes, more narrative depth)'}.${persistedContentStyle ? '' : ` Pick contentStyle based on what actually fits the channel's real content (its recent titles, not just this one idea): "realistic" for content best shown with real-world stock footage (documentary-style, real places/objects/everyday life, product or lifestyle content — not a cartoonish or stylized look); "map" for content centered on geography, a specific country/region/historical territory, or a route/journey across places; "animated" (default) for anything else — stories, tutorials, abstract topics, or content that suits AI-generated stylized visuals better than real footage.`}`;
  const user = `Channel recent titles:\n${recentList}\n\nCurrently trending/breakout titles in this niche (inspiration only, do not copy):\n${titlesList}\n\nChannel topics: ${(profile.topics || []).join(', ') || 'unknown'}. Voice narration wanted: ${uses_voice ? 'yes' : 'no'}.\n\nJSON only:`;
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
  const idea = await draftDailyIdea(profile, candidates, format, !!channel.uses_voice, channel.content_style || null);
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
  const system = `You analyze a real YouTube channel once, to configure automated video generation for it going forward. Output ONLY valid JSON: {"usesVoice": true|false, "contentStyle": "realistic"|"map"|"animated"|"character_adventure", "videoStyle": "realistic"|"anime"|"cartoon"|"cinematic", ${realAvgDurationSec ? '' : '"estimatedDurationSec": number, '}"reasoning": "one short sentence explaining the main signal you used"}. "usesVoice": true if the channel's videos have a spoken narrator/voiceover (a transcript sample is provided when available — real spoken content, not just on-screen text or music); false for purely visual/silent content. "contentStyle": "realistic" for real-world stock-footage-style content (documentary, real places/objects/everyday life, product/lifestyle); "map" for geography/country/region/route-focused content; "character_adventure" ONLY for a very specific, distinctive format: the SAME single recurring character (a person, "you", a mascot) appears throughout every video living through a different scenario/era/story each time (e.g. "what if you lived during Prophet Noah's time" style channels) — pick this only if the recent titles clearly show this exact one-character-per-episode pattern, not just any story content; "animated" (default) for any other story/tutorial/abstract content that doesn't fit the other three. "videoStyle" describes the actual visual look this channel already uses or would suit: "realistic" (live-action look), "anime", "cartoon", or "cinematic" (stylized but not cartoonish).${realAvgDurationSec ? '' : ' "estimatedDurationSec": a realistic average video length in seconds for this channel/niche/format if you had to guess.'}`;
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
    contentStyle: ['realistic', 'map', 'animated', 'character_adventure'].includes(analysis.contentStyle) ? analysis.contentStyle : 'animated',
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

// ── المسار الافتراضي (سابقًا الوحيد): مشاهد موديل 4 + رندر موديل 8 مباشرة ──────────
async function generateAnimatedVideo(run, channel, idea, shape, headers) {
  // ✅ لو القناة اتحللت أوتوماتيك وعندها طول مستهدف حقيقي (من متوسط فيديوهاتها الفعلي)،
  // نستخدمه بدل المقاس الثابت الافتراضي — عشان الفيديو يطلع بنفس مقاس فيديوهات القناة
  // الحقيقية (مثلاً قناة فيديوهاتها 10 دقايق منعملهاش فيديو 3 دقايق بس)
  const sceneCount = channel.target_scene_count || shape.sceneCount;
  const sceneDurationSec = channel.target_duration_sec ? Math.max(3, Math.round(channel.target_duration_sec / sceneCount)) : shape.sceneDurationSec;

  const scenesRes = await fetch(`${INTERNAL_BASE}/api/model4/generate-scenes`, {
    method: 'POST', headers,
    body: JSON.stringify({ idea: idea.title, script: undefined, inputMode: 'idea', sceneCount, videoLanguage: idea.videoLanguage || 'en', videoStyle: channel.video_style || 'cinematic' }),
  });
  const scenesData = await scenesRes.json();
  if (!scenesRes.ok || !scenesData.scenes?.length) throw new Error(scenesData.error || 'Scene generation failed');

  const audioMode = channel.uses_voice ? 'voiceover' : 'none';
  const rate = audioMode === 'voiceover' ? MODEL8_RATE_VOICEOVER : MODEL8_RATE_NONE;
  const totalSeconds = sceneCount * sceneDurationSec;
  const cost = totalSeconds * rate;

  const balance = await getCreditsBalance(run.user_id);
  if (balance < cost) throw new Error(`insufficient_credits:${cost}:${balance}`);
  const charge = await chargeCredits(run.user_id, cost);
  if (!charge.success) throw new Error(`insufficient_credits:${cost}:${charge.remaining}`);

  const scenes = scenesData.scenes.map(s => ({ ...s, sceneDurationSec }));
  const { outputFile } = await renderModel8Video({
    scenes, ratio: shape.ratio, audioMode, voiceKey: (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_wise',
    videoLanguage: idea.videoLanguage || 'en', captions: true, jobId: `daily_${run.id}`,
  });
  const videoUrl = '/outputs/' + outputFile;
  await saveVideo(run.user_id, outputFile, idea.title).catch(() => {});
  return videoUrl;
}

// ── محتوى واقعي (موديل 2 — لقطات حقيقية من Pexels، مش رسوم بالذكاء الاصطناعي) ──────
// بيستخدم /api/render بـ videoType:'pexels_clips' (نفس المسار اللي بيستخدمه أي عميل عادي
// لموديل 2)، فبيتحاسب بنفس MODEL12_CREDIT_COSTS ذاتها تلقائيًا — مفيش حساب كريديت يدوي هنا
async function generateRealisticVideo(run, channel, idea, shape, headers) {
  const duration = shape === LONG_FORM ? '3min' : '30s';
  const scenes = await consumeScenesSSE(`${INTERNAL_BASE}/api/generate-scenes`, headers, {
    idea: idea.title, duration, videoLanguage: idea.videoLanguage || 'en',
  });

  let audioUrl = null, sceneDurations = null;
  if (channel.uses_voice) {
    const voiceRes = await fetch(`${INTERNAL_BASE}/api/generate-voice`, {
      method: 'POST', headers,
      body: JSON.stringify({ scenes, voice: (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_american', videoLanguage: idea.videoLanguage || 'en' }),
    });
    const voiceData = await voiceRes.json().catch(() => null);
    // ✅ لو توليد الصوت فشل، منوقفش الفيديو كله — بيكمل بدون صوت بدل ما يوم العميل يضيع
    if (voiceRes.ok && voiceData?.audioUrl) { audioUrl = voiceData.audioUrl; sceneDurations = voiceData.sceneDurations; }
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
// ⚠️ محدود بحد أقصى 10 مشاهد/كليبات (حد mergeVideos العملي لمنتج بهذا الحجم)
async function generateCharacterAdventureVideo(run, channel, idea, shape, headers) {
  if (!channel.character_reference_id) throw new Error('No character reference set for this channel — pick one from the Characters library first.');
  const character = await getCharacterReferenceById(channel.character_reference_id);
  if (!character) throw new Error('Saved character reference not found');

  const MAX_SCENES = 10;
  const sceneCount = Math.min(channel.target_scene_count || shape.sceneCount, MAX_SCENES);
  const maxClip = getMaxClipSeconds('seedance_2_5') || 30;
  const defaultSceneDurationSec = Math.min(maxClip, channel.target_duration_sec ? Math.max(3, Math.round(channel.target_duration_sec / sceneCount)) : shape.sceneDurationSec);
  const usesVoice = !!channel.uses_voice;
  const voiceKey = (idea.videoLanguage || '').startsWith('ar') ? 'male_arabic' : 'male_wise';

  const scenes = await draftCharacterAdventureScenes(idea, sceneCount, channel.video_style, usesVoice);

  // ── 1) صور المشاهد، الشخصية ثابتة عبرهم كلهم ────────────────────────────────
  const imgRes = await fetch(`${INTERNAL_BASE}/api/images/generate`, {
    method: 'POST', headers,
    body: JSON.stringify({ model: 'nano_banana_2', prompts: scenes.map(s => s.visual), referenceImageUrls: [character.image_url], aspectRatio: shape.ratio }),
  });
  const imgJobData = await imgRes.json();
  if (!imgRes.ok) throw new Error(imgJobData.error || 'Character scene image generation failed'); // لسه قبل خصم أي حاجة تانية
  const images = await pollJobGeneric(`${INTERNAL_BASE}/api/images/generate-status/${imgJobData.jobId}`, headers, 'images');
  if (!Array.isArray(images) || images.length < 2) { const e = new Error('Image generation returned too few images'); e.committed = true; throw e; }

  // ── 2) لو القناة بتستخدم صوت: نولّد سرد كل مشهد لوحده الأول عشان نعرف مدته الحقيقية ──
  const narrations = [];
  try {
    if (usesVoice) {
      for (const s of scenes) {
        const text = s.narration?.trim() || idea.title;
        narrations.push(await synthesizeNarration(text, { voiceKey, languageCode: idea.videoLanguage || 'en' }));
      }
    }

    // ── 3) كل صورة تتحرك لكليب، بمدة = مدة سرد نفس المشهد (لو فيه صوت) وإلا المدة الافتراضية ──
    const clipUrls = [];
    for (let i = 0; i < images.length; i++) {
      const targetDurationSec = usesVoice ? Math.max(3, Math.min(maxClip, narrations[i].durationSec)) : defaultSceneDurationSec;
      const vidRes = await fetch(`${INTERNAL_BASE}/api/videos/generate`, {
        method: 'POST', headers,
        body: JSON.stringify({ model: 'seedance_2_5', prompt: 'subtle natural motion, cinematic camera movement', imageUrl: images[i], aspectRatio: shape.ratio, durationSec: targetDurationSec }),
      });
      const vidJobData = await vidRes.json();
      // ✅ الصور خلاص اتولدت واتخصم تمنها — أي فشل من هنا وطالع "committed" عشان منرجعش
      // للمسار الافتراضي ونخصم كريديت الحركة تاني على مسار تاني
      if (!vidRes.ok) { const e = new Error(vidJobData.error || 'Scene animation failed'); e.committed = true; throw e; }
      let clipUrl = await pollRenderJob(vidJobData.jobId, headers);

      if (usesVoice) {
        // ✅ مطابقة دقيقة لمدة المشهد لمدة سرده الحقيقية (الموديل نادرًا ما بيطلع المدة
        // المطلوبة بالظبط) — ده اللي بيضمن التزامن الحقيقي مشهد بمشهد، مش تقريب عام
        clipUrl = await conformVideoDurationToAudio({ videoUrl: clipUrl, targetDurationSec: narrations[i].durationSec, modelKeyForNaming: 'char_adv' });
        // ✅ نركّب سرد المشهد ده بالذات على المشهد ده بالذات — كل كليب بيخرج من هنا وصوته
        // متزامن بالفعل، فمفيش أي "قص/تمطيط" عام لاحقًا وقت الدمج النهائي
        clipUrl = await composeVideoAudio({ videoUrl: clipUrl, narrationPath: narrations[i].audioPath, modelKeyForNaming: 'char_adv' });
      }
      clipUrls.push(clipUrl);
    }

    // ── 4) دمج كل الكليبات (كل واحد صوته متزامن بالفعل) ────────────────────────────
    let videoUrl = clipUrls.length === 1 ? clipUrls[0] : await mergeVideos(clipUrls);

    // ── 5) كابشن حقيقي لو مطلوب — بكريديت (التكلفة الحقيقية الوحيدة المتبقية هنا) ─────
    if (usesVoice) {
      const captionCost = getFlatCreditCost('autocaption');
      const balance = await getCreditsBalance(run.user_id);
      if (balance >= captionCost) {
        const charge = await chargeCredits(run.user_id, captionCost);
        if (charge.success) {
          try {
            const combinedAudioPath = path.join(TEMP_DIR, `char_adv_narr_${run.id}_${Date.now()}.mp3`);
            fs.mkdirSync(TEMP_DIR, { recursive: true });
            concatAudioFiles(narrations.map(n => n.audioPath), combinedAudioPath);
            const words = await transcribeWithTimestamps(combinedAudioPath);
            const isRtl = ['ar', 'ar_eg', 'ar_gulf'].includes(idea.videoLanguage);
            videoUrl = await burnCaptions(videoUrl, words, { rightToLeft: isRtl });
            try { fs.unlinkSync(combinedAudioPath); } catch {}
          } catch (capErr) {
            console.warn(`[ChannelScheduler] Captions failed for run ${run.id} (video still delivered without captions, credits refunded):`, capErr.message);
            await addCreditsBalance(run.user_id, captionCost);
          }
        }
      }
    }

    // ── 6) موسيقى خلفية خافتة — مجانية تمامًا (نفس ميزة التميّز)، بنسيبها تفشل بهدوء لو
    // فشلت (مصدرها الخارجي وقتي مثلًا) بدل ما توقف تسليم الفيديو نفسه
    if (usesVoice) {
      try {
        const musicBuffer = await getBackgroundMusicBuffer('general');
        videoUrl = await composeVideoAudio({ videoUrl, musicBuffer, modelKeyForNaming: 'char_adv' });
      } catch (musicErr) {
        console.warn(`[ChannelScheduler] Background music failed for run ${run.id} (video still delivered without music):`, musicErr.message);
      }
    }

    await saveVideo(run.user_id, videoUrl.replace(/^\/outputs\//, ''), idea.title).catch(() => {});
    return videoUrl;
  } catch (e) {
    // ✅ الصور خلاص اتولدت واتخصم تمنها قبل ما ندخل الكتلة دي — أي فشل من هنا وطالع (سرد،
    // تحريك، دمج، كابشن) لازم يبقى "committed" عشان triggerApprovedGeneration منيرجعش
    // للمسار الافتراضي (موديل 8) ويخصم كريديت تاني على مسار تاني فوق اللي خلاص اتصرف
    e.committed = true;
    throw e;
  } finally {
    narrations.forEach(n => { try { fs.rmSync(n.workDir, { recursive: true, force: true }); } catch {} });
  }
}

// ── لو العميل وافق: الموقع يقرر أنسب موديل لمحتوى القناة (contentStyle من draftDailyIdea)
// ويولّد بيه. لو المسار الذكي (واقعي/خريطة) فشل قبل أي خصم كريديت، بنرجع تلقائيًا للمسار
// الافتراضي (موديل 8) بدل ما يوم العميل يضيع بالكامل بسبب باج في مسار جديد
export async function triggerApprovedGeneration(run) {
  const channel = await getManagedChannelById(run.channel_id);
  if (!channel) throw new Error('Channel not found');
  const user = await getUserById(run.user_id);
  const idea = JSON.parse(run.idea_brief || '{}');
  const shape = run.format === 'short' ? SHORT_FORM : LONG_FORM;
  // ✅ NEW: claim "channelRun" بيعلّم كل طلب داخلي جاي من الأتوبايلوت اليومي — بيستخدمه
  // /api/videos/merge عشان يعفي رسوم التجميع/الفويس أوفر/الموسيقى (مش الكابشن، ولا توليد
  // الفيديو نفسه) للعملاء الرابطين قنواتهم بالموقع — ميزة تميّز خاصة بيهم
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(run.user_id, user.email, { channelRun: true }) };

  const contentStyle = ['map', 'realistic', 'character_adventure'].includes(idea.contentStyle) ? idea.contentStyle : 'animated';

  if (contentStyle === 'map') {
    try { return await generateMapVideo(run, channel, idea, shape, headers); }
    catch (e) {
      if (e.committed) throw e;
      console.warn(`[ChannelScheduler] map pipeline failed before charging for run ${run.id}, falling back to animated:`, e.message);
    }
  } else if (contentStyle === 'realistic') {
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
  }
  return await generateAnimatedVideo(run, channel, idea, shape, headers);
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
