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

const SHORT_FORM = { sceneCount: 6, sceneDurationSec: 5, ratio: '9:16' };   // ~30s
const LONG_FORM = { sceneCount: 18, sceneDurationSec: 10, ratio: '16:9' }; // ~3min

async function draftDailyIdea(profile, candidates, format, uses_voice) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const titlesList = candidates.map(c => `- ${c.title}`).join('\n') || '(none found)';
  const recentList = (profile.recentTitles || []).map(t => `- ${t}`).join('\n') || '(no recent videos)';
  const system = `You plan ONE new YouTube video idea per day for a real channel, based on real data. You are given the channel's own recent video titles (so you can match its established language, dialect, and tone) and a list of currently-breaking-out videos in its niche (for inspiration only — never copy a title/idea verbatim, always make something original and specific). Output ONLY valid JSON: {"title":"...", "brief":"1-2 sentence description of what the video covers", "videoLanguage":"en"|"ar"|"ar_eg"|"ar_gulf"|etc, "voiceoverScript":"if voice is requested, a short natural narration opening line in the channel's own language/dialect matching its recent titles, else omit", "contentStyle":"realistic"|"map"|"animated"}. Match the channel's actual language and dialect (e.g. Egyptian Arabic vs Gulf Arabic vs MSA vs English) based on its recent titles — do not default to English or MSA if the channel clearly writes in a dialect. The video format is ${format === 'short' ? 'a SHORT (under 60s, punchy, single hook)' : 'a LONG-FORM video (several minutes, more narrative depth)'}. Pick contentStyle based on what actually fits the channel's real content (its recent titles, not just this one idea): "realistic" for content best shown with real-world stock footage (documentary-style, real places/objects/everyday life, product or lifestyle content — not a cartoonish or stylized look); "map" for content centered on geography, a specific country/region/historical territory, or a route/journey across places; "animated" (default) for anything else — stories, tutorials, abstract topics, or content that suits AI-generated stylized visuals better than real footage.`;
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

// ── لو العميل وافق: الموقع يقرر أنسب موديل لمحتوى القناة (contentStyle من draftDailyIdea)
// ويولّد بيه. لو المسار الذكي (واقعي/خريطة) فشل قبل أي خصم كريديت، بنرجع تلقائيًا للمسار
// الافتراضي (موديل 8) بدل ما يوم العميل يضيع بالكامل بسبب باج في مسار جديد
export async function triggerApprovedGeneration(run) {
  const channel = await getManagedChannelById(run.channel_id);
  if (!channel) throw new Error('Channel not found');
  const user = await getUserById(run.user_id);
  const idea = JSON.parse(run.idea_brief || '{}');
  const shape = run.format === 'short' ? SHORT_FORM : LONG_FORM;
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(run.user_id, user.email) };

  const contentStyle = idea.contentStyle === 'map' || idea.contentStyle === 'realistic' ? idea.contentStyle : 'animated';

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
