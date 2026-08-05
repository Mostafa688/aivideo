// ── mcpRoutes.js ─────────────────────────────────────────────────────────────
// ✅ NEW: MCP Server بعيد (Remote، عن طريق Streamable HTTP) — بيسمح لأي MCP client
// (زي Claude.ai، Claude Desktop، Claude Code) إنه يتصل بمنصة Erivion عن طريق لينك
// واحد + API Key شخصي، ويولّد فيديوهات مباشرة من جوه المحادثة.
//
// التصميم: بدل ما نعيد كتابة منطق الكريديت/الفحص/التوليد من الصفر هنا، كل أداة (tool)
// بتعمل نداء داخلي (loopback) لنفس الـ REST endpoints الموجودة أصلاً في index.js —
// باستخدام JWT قصير العمر (10 دقايق) بنولّده بس للمستخدم اللي معاه API key صحيح.
// ده بيضمن إن كل قواعد الكريديت/الموديريشن/الحدود الموجودة فعليًا تتطبق تلقائيًا من
// غير أي تكرار أو احتمال تعارض بين نسختين من نفس المنطق.

import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { verifyApiKey, mintInternalToken, getUserById, getCreditsBalance, verifyOAuthToken } from './authService.js';

const router = express.Router();
const SITE_URL = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net';
// ✅ نداء داخلي على نفس السيرفر (loopback) — مش نداء خارجي عبر الإنترنت
const INTERNAL_BASE = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

// ── تجميع أحداث SSE (Server-Sent Events) — بعض الـ endpoints الداخلية (زي
// /api/generate-scenes) بترجع stream مش JSON عادي، فمحتاجين نجمّعها يدويًا هنا ──
function parseSSE(rawText) {
  const events = [];
  for (const part of rawText.split('\n\n')) {
    const evMatch = part.match(/^event: (.+)$/m);
    const dataMatch = part.match(/^data: (.+)$/m);
    if (!dataMatch) continue;
    const ev = evMatch ? evMatch[1] : 'message';
    try { events.push({ event: ev, data: JSON.parse(dataMatch[1]) }); } catch {}
  }
  return events;
}

function buildMcpServer(userId, email) {
  const server = new McpServer({ name: 'erivion', version: '1.0.0' });
  const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(userId, email) });

  // ══════════════════════════════════════════════════════════════════════════
  //  ✅ NEW: MCP Apps (SEP-1865) — widget فيديو حقيقي بيبان جوه الشات نفسه بدل
  //  ما يبقى لينك نص عادي. لو الـ host (Claude) بيدعم الإضافة دي، هيرندر الـ HTML
  //  ده جوه iframe محمي ويغذّيه بنتيجة الأداة تلقائيًا. لو مش بيدعمها، بيرجع
  //  تلقائيًا للنص العادي (fallback مضمون، مفيش خطر كسر أي حاجة).
  // ══════════════════════════════════════════════════════════════════════════
  const videoPlayerResourceUri = 'ui://erivion/video-player.html';
  registerAppResource(server, videoPlayerResourceUri, videoPlayerResourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{
      uri: videoPlayerResourceUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body { margin:0; padding:0; background:transparent; font-family:sans-serif; display:flex; align-items:center; justify-content:center; min-height:100px; }
  video { max-width:100%; max-height:480px; border-radius:12px; display:block; }
  #msg { color:#888; font-size:13px; padding:20px; text-align:center; }
</style></head>
<body>
  <div id="root"><div id="msg">Loading video…</div></div>
  <script>
    // ✅ Bridge بسيط (JSON-RPC عن طريق postMessage) — بيسمع لإشعار نتيجة الأداة
    // ويحط الفيديو لما يوصل، بالظبط زي النمط الموثق في مواصفات MCP Apps
    function render(structuredContent) {
      const root = document.getElementById('root');
      if (structuredContent && structuredContent.status === 'done' && structuredContent.videoUrl) {
        root.innerHTML = '<video src="' + structuredContent.videoUrl + '" controls autoplay muted playsinline></video>';
      } else if (structuredContent && structuredContent.status === 'failed') {
        root.innerHTML = '<div id="msg">❌ Render failed</div>';
      } else {
        root.innerHTML = '<div id="msg">⏳ Still processing…</div>';
      }
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || msg.jsonrpc !== '2.0') return;
      if (msg.method === 'ui/notifications/tool-result') {
        render(msg.params?.structuredContent);
      }
    });
    // نبلّغ الـ host إن الواجهة جاهزة تستقبل بيانات
    try { window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/ready', params: {} }, '*'); } catch (e) {}
  </script>
</body></html>`,
    }],
  }));

  // ── list_models ──────────────────────────────────────────────────────────
  server.registerTool(
    'list_models',
    {
      title: 'List Erivion video models',
      description: 'List all available Erivion AI video generation models — what each is best for, and how they differ.',
      inputSchema: {},
    },
    async () => ({
      content: [{
        type: 'text',
        text: [
          'Model 1 (AI Slices): AI-generated images + Ken Burns zoom animation, voiceover, captions. Cheapest option, good for any general topic.',
          'Model 2 (Real Footage): real licensed stock video clips instead of AI images. Best default choice — available on the free plan.',
          'Model 3 (Cinematic Images): higher-quality AI-generated images, supports longer videos (up to 5 minutes).',
          'Model 4 (Cinematic Video): AI-generated video clips (not just images) via Seedance, more cinematic motion.',
          'Model 5 (Character Video): character-consistent AI video — supports uploaded reference photos, stickman-style animation, and historical map documentary videos.',
          'Model 7 (Ads): turns a single product photo into a full video ad with AI voiceover.',
          '',
          'Use generate_video with model "1" through "5" to start a video from this MCP server. Model 7 (Ads) needs an uploaded product photo, so it\'s not available here — use the full Erivion chat agent for that.',
        ].join('\n'),
      }],
    })
  );

  // ── check_credits ────────────────────────────────────────────────────────
  server.registerTool(
    'check_credits',
    {
      title: 'Check credit balance',
      description: "Check the authenticated Erivion user's current credit balance.",
      inputSchema: {},
    },
    async () => {
      const balance = await getCreditsBalance(userId);
      return { content: [{ type: 'text', text: `Current Erivion credit balance: ${balance} credits.` }] };
    }
  );

  // ── generate_video ───────────────────────────────────────────────────────
  // ✅ NEW: بقى بيدعم موديل 1، 2، 3، 4، 5 (وضع الفكرة النصية بس — موديل 5 من غير صورة
  // شخصية، وموديل 7/الإعلانات مش مدعوم هنا لأنه محتاج صورة منتج مرفوعة أصلًا)
  const MODEL3_IMAGE_COUNT = { '30s': 3, '1min': 6, '3min': 18, '5min': 30 };
  const MODEL4_SCENE_COUNT = { '30s': 4, '1min': 8, '3min': 24 };
  registerAppTool(
    server,
    'generate_video',
    {
      title: 'Generate a video',
      description: 'Generate an Erivion video from a topic/idea and wait for it to finish (usually 1-3 minutes) — shows live progress and the final video automatically. Supports Model 1 (AI images), Model 2 (real stock footage), Model 3 (higher-quality AI images, longer videos up to 5min), Model 4 (AI-generated video clips, more cinematic), Model 5 (character-consistent AI video, no reference photo in this tool). For Model 7/Ads (product photo → ad video), use the Erivion chat agent directly since it needs an uploaded photo.',
      inputSchema: {
        model: z.enum(['1', '2', '3', '4', '5']).describe('1=AI images, 2=real stock footage (best default), 3=higher-quality AI images/longer videos, 4=AI video clips/cinematic, 5=character-consistent AI video.'),
        idea: z.string().min(3).describe('The video topic or idea, described in a sentence or two.'),
        duration: z.string().default('30s').describe('Video length. Models 1/2/4: "30s", "1min", "3min", or "5min". Model 3: also supports "5min". Model 5: "5s", "10s", "15s", "30s", or "1min" only.'),
        ratio: z.enum(['9:16', '16:9', '1:1']).default('9:16').describe('Aspect ratio — 9:16 for Reels/TikTok/Shorts, 16:9 for YouTube, 1:1 for feed posts.'),
        language: z.string().default('en').describe('Narration language code, e.g. "en" or "ar".'),
      },
      _meta: { ui: { resourceUri: videoPlayerResourceUri } }, // ✅ NEW: نفس الـ widget بتاع check_render_status
    },
    async ({ model, idea, duration, ratio, language }) => {
      try {
        const headers = authHeaders();
        let renderData, jobId;

        if (model === '1' || model === '2') {
          // ── موديل 1/2: نفس المنطق الأصلي (صور AI أو فيديوهات ستوك حقيقية) ──
          const scenesRes = await fetch(`${INTERNAL_BASE}/api/generate-scenes`, {
            method: 'POST', headers,
            body: JSON.stringify({ idea, duration, mode: 'idea', tone: 'motivational', videoLanguage: language || 'en' }),
          });
          const scenesEvents = parseSSE(await scenesRes.text());
          const errorEvent = scenesEvents.find(e => e.event === 'error');
          if (errorEvent) throw new Error(errorEvent.data.message || 'Scene generation failed');
          const scenes = scenesEvents.filter(e => e.event === 'scene').map(e => e.data);
          if (!scenes.length) throw new Error('Scene generation failed — no scenes returned');

          let finalScenes = scenes;
          if (model === '1') {
            const aiRes = await fetch(`${INTERNAL_BASE}/api/generate-ai-video`, { method: 'POST', headers, body: JSON.stringify({ scenes, ratio }) });
            const aiEvents = parseSSE(await aiRes.text());
            const doneEvent = aiEvents.find(e => e.event === 'done');
            if (doneEvent?.data?.scenes) finalScenes = doneEvent.data.scenes;
          } else {
            const mediaRes = await fetch(`${INTERNAL_BASE}/api/fetch-media`, {
              method: 'POST', headers, body: JSON.stringify({ scenes, ratio, jobId: 'mcp_' + Date.now() }),
            });
            const mediaData = await mediaRes.json();
            if (!mediaRes.ok) throw new Error(mediaData.error || 'Media fetch failed');
            finalScenes = mediaData.scenes || scenes;
          }

          let audioUrl = null;
          try {
            const fullText = finalScenes.map(s => s.text).filter(Boolean).join(' ');
            if (fullText.trim()) {
              const voiceRes = await fetch(`${INTERNAL_BASE}/api/generate-voice`, {
                method: 'POST', headers, body: JSON.stringify({ text: fullText, voice: 'male_wise', videoLanguage: language || 'en' }),
              });
              const voiceData = await voiceRes.json();
              if (voiceRes.ok) audioUrl = voiceData.audioUrl;
            }
          } catch (e) { console.warn('[MCP] Voiceover generation failed, continuing without audio:', e.message); }

          const renderRes = await fetch(`${INTERNAL_BASE}/api/render`, {
            method: 'POST', headers,
            body: JSON.stringify({
              scenes: finalScenes, audioUrl, ratio, duration,
              videoType: model === '1' ? 'ai_images' : 'pexels_clips',
              videoLanguage: language || 'en', captions: true, transitions: true,
            }),
          });
          renderData = await renderRes.json();
          if (!renderRes.ok) {
            const msg = renderData.error === 'quota_exceeded'
              ? `Not enough credits — this video needs ${renderData.cost} credits, you have ${renderData.remaining}.`
              : (renderData.message || renderData.error || 'Render failed to start');
            throw new Error(msg);
          }
          jobId = renderData.jobId;
        } else if (model === '3') {
          // ── موديل 3: صور AI عالية الجودة، فيديوهات أطول ──
          const scenesRes = await fetch(`${INTERNAL_BASE}/api/model3/generate-scenes`, {
            method: 'POST', headers,
            body: JSON.stringify({ idea, script: null, inputMode: 'idea', imageCount: MODEL3_IMAGE_COUNT[duration] || 6, videoLanguage: language || 'en', ratio }),
          });
          const scenesData = await scenesRes.json();
          if (!scenesRes.ok || !scenesData.scenes?.length) throw new Error(scenesData.error || 'Scene generation failed');
          const renderRes = await fetch(`${INTERNAL_BASE}/api/model3/render`, {
            method: 'POST', headers,
            body: JSON.stringify({ scenes: scenesData.scenes, ratio, duration, music: false, captions: true, videoLanguage: language || 'en' }),
          });
          renderData = await renderRes.json();
          if (!renderRes.ok) {
            const msg = renderData.error === 'quota_exceeded' ? `Not enough credits — this video needs ${renderData.cost} credits, you have ${renderData.remaining}.` : (renderData.message || renderData.error || 'Render failed to start');
            throw new Error(msg);
          }
          jobId = renderData.jobId;
        } else if (model === '4') {
          // ── موديل 4: كليبات فيديو مولّدة بالـ AI، أكتر سينمائية ──
          const scenesRes = await fetch(`${INTERNAL_BASE}/api/model4/generate-scenes`, {
            method: 'POST', headers,
            body: JSON.stringify({ idea, script: undefined, inputMode: 'idea', sceneCount: MODEL4_SCENE_COUNT[duration] || 8, videoLanguage: language || 'en', videoStyle: 'cinematic' }),
          });
          const scenesData = await scenesRes.json();
          if (!scenesRes.ok || !scenesData.scenes?.length) throw new Error(scenesData.error || 'Scene generation failed');
          const renderRes = await fetch(`${INTERNAL_BASE}/api/model4/render`, {
            method: 'POST', headers,
            body: JSON.stringify({ scenes: scenesData.scenes, ratio, captions: true, music: false, videoLanguage: language || 'en', videoStyle: 'cinematic' }),
          });
          renderData = await renderRes.json();
          if (!renderRes.ok) {
            const msg = renderData.error === 'quota_exceeded' ? `Not enough credits — this video needs ${renderData.cost} credits, you have ${renderData.remaining}.` : (renderData.message || renderData.error || 'Render failed to start');
            throw new Error(msg);
          }
          jobId = renderData.jobId;
        } else {
          // ── موديل 5: فيديو بشخصية ثابتة، من غير صورة مرجعية هنا (idea بس) ──
          const scenesRes = await fetch(`${INTERNAL_BASE}/api/model5/generate-scenes`, {
            method: 'POST', headers,
            body: JSON.stringify({ idea, characters: [], duration: duration || '30s' }),
          });
          const scenesData = await scenesRes.json();
          if (!scenesRes.ok || !scenesData.scenes?.length) throw new Error(scenesData.error || 'Scene generation failed');
          const renderRes = await fetch(`${INTERNAL_BASE}/api/model5/render`, {
            method: 'POST', headers,
            body: JSON.stringify({ scenes: scenesData.scenes, ratio, duration: duration || '30s', music: false }),
          });
          renderData = await renderRes.json();
          if (!renderRes.ok) {
            const msg = renderData.error === 'quota_exceeded' ? `Not enough credits — this video needs ${renderData.cost} credits, you have ${renderData.remaining}.` : (renderData.message || renderData.error || 'Render failed to start');
            throw new Error(msg);
          }
          jobId = renderData.jobId;
        }

        // 5) ✅ NEW: بنراقب التقدّم جوه نفس النداء (بدل ما نرجع فورًا) — لحد 90 ثانية،
        // عشان الـ widget يتحدّث لوحده للفيديو النهائي من غير ما العميل يطلب "چيك" يدوي
        const maxWaitMs = 90_000, pollIntervalMs = 5_000, startedAt = Date.now();
        while (Date.now() - startedAt < maxWaitMs) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          try {
            const statusRes = await fetch(`${INTERNAL_BASE}/api/render-status/${encodeURIComponent(jobId)}`, { headers: authHeaders() });
            const statusData = await statusRes.json();
            if (statusData.status === 'done') {
              const videoUrl = `${SITE_URL}${statusData.videoUrl}`;
              return {
                content: [{ type: 'text', text: `✅ Video ready: ${videoUrl}\nCredits charged: ${renderData.creditCost ?? 'see check_credits'}` }],
                structuredContent: { status: 'done', videoUrl, jobId },
              };
            }
            if (statusData.status === 'failed') {
              throw new Error(statusData.error || 'Render failed');
            }
          } catch (pollErr) { /* شبكة متقطعة أثناء المراقبة — نكمل نحاول لحد ما الوقت يخلص */ }
        }

        // مستغرق أكتر من المتوقع — بنسيب المهمة تكمل في الخلفية ونديله jobId يقدر يتابع بيه
        return {
          content: [{
            type: 'text',
            text: `⏳ Still rendering after 90 seconds — this can happen with longer videos. Job ID: ${jobId}\nCredits charged: ${renderData.creditCost ?? 'see check_credits'}\n\nUse check_render_status with this jobId in a bit to get the final video.`,
          }],
          structuredContent: { status: 'processing', jobId },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to start video generation: ${e.message}` }], isError: true };
      }
    }
  );

  // ── check_render_status ──────────────────────────────────────────────────
  registerAppTool(
    server,
    'check_render_status',
    {
      title: 'Check video render status',
      description: 'Check the status of a video generation job previously started with generate_video.',
      inputSchema: { jobId: z.string().describe('The jobId returned by generate_video.') },
      _meta: { ui: { resourceUri: videoPlayerResourceUri } }, // ✅ NEW: بيربط الأداة بالـ widget، لو الـ host بيدعم MCP Apps
    },
    async ({ jobId }) => {
      try {
        const res = await fetch(`${INTERNAL_BASE}/api/render-status/${encodeURIComponent(jobId)}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Status check failed');

        if (data.status === 'done') {
          return {
            content: [{ type: 'text', text: `✅ Video ready: ${SITE_URL}${data.videoUrl}` }],
            structuredContent: { status: 'done', videoUrl: `${SITE_URL}${data.videoUrl}` },
          };
        }
        if (data.status === 'failed') {
          return { content: [{ type: 'text', text: `❌ Render failed: ${data.error || 'unknown error'}` }], isError: true };
        }
        return {
          content: [{ type: 'text', text: `⏳ Still processing (status: ${data.status}). Check again in about 20-30 seconds.` }],
          structuredContent: { status: data.status || 'processing' },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Error checking status: ${e.message}` }], isError: true };
      }
    }
  );

  // ── edit_video ────────────────────────────────────────────────────────────
  // ✅ NEW: تعديل video-to-video (Lucy Edit 2) لفيديو خارجي — MCP مفيهوش قناة رفع
  // ملفات حقيقية لسه، فبناخد رابط عام للفيديو بدل الملف نفسه. العميل يقدر ياخد اللينك
  // ده من صفحة Erivion → Settings → API & MCP → "Upload video, get link"
  registerAppTool(
    server,
    'edit_video',
    {
      title: 'Edit a video (video-to-video)',
      description: "Apply a precise AI edit to an existing video (max 15 seconds) while preserving its original motion and timing — e.g. \"change the car's color to red\" or \"make the background snowy\". Requires a direct public video URL (MCP can't accept an uploaded file directly) — get one from Erivion → Settings → API & MCP → \"Upload video, get link\". Cost is 25 credits per second of the video's real length.",
      inputSchema: {
        videoUrl: z.string().url().describe('A direct, publicly accessible URL to the video file (max 15 seconds).'),
        editPrompt: z.string().min(3).describe('Precise instruction of exactly what to change — everything else stays identical.'),
        addVoiceover: z.boolean().default(false).describe('Whether to add a new AI voiceover on top of the edited video.'),
        voiceoverText: z.string().default('').describe('The narration text, if addVoiceover is true.'),
        addCaptions: z.boolean().default(false).describe('Whether to burn in captions (requires addVoiceover to be true).'),
        language: z.string().default('en').describe('Language code for voiceover/captions, e.g. "en" or "ar".'),
      },
      _meta: { ui: { resourceUri: videoPlayerResourceUri } },
    },
    async ({ videoUrl, editPrompt, addVoiceover, voiceoverText, addCaptions, language }) => {
      try {
        const headers = authHeaders();
        const editRes = await fetch(`${INTERNAL_BASE}/api/video-edit-by-url`, {
          method: 'POST', headers,
          body: JSON.stringify({ videoUrl, editPrompt, addVoiceover, voiceoverText, addCaptions, videoLanguage: language || 'en', ratio: '9:16' }),
        });
        const editData = await editRes.json();
        if (!editRes.ok) {
          const msg = editData.error === 'quota_exceeded'
            ? `Not enough credits — this edit needs ${editData.cost} credits, you have ${editData.remaining}.`
            : (editData.message || editData.error || 'Video edit failed to start');
          throw new Error(msg);
        }
        const jobId = editData.jobId;

        // نراقب التقدّم جوه نفس النداء — لحد 90 ثانية، زي generate_video بالظبط
        const maxWaitMs = 90_000, pollIntervalMs = 5_000, startedAt = Date.now();
        while (Date.now() - startedAt < maxWaitMs) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          try {
            const statusRes = await fetch(`${INTERNAL_BASE}/api/render-status/${encodeURIComponent(jobId)}`, { headers: authHeaders() });
            const statusData = await statusRes.json();
            if (statusData.status === 'done') {
              const finalUrl = `${SITE_URL}${statusData.videoUrl}`;
              return {
                content: [{ type: 'text', text: `✅ Edited video ready: ${finalUrl}\nCredits charged: ${editData.creditCost}` }],
                structuredContent: { status: 'done', videoUrl: finalUrl, jobId },
              };
            }
            if (statusData.status === 'failed') throw new Error(statusData.error || 'Edit failed');
          } catch (pollErr) { /* شبكة متقطعة أثناء المراقبة — نكمل نحاول لحد ما الوقت يخلص */ }
        }
        return {
          content: [{ type: 'text', text: `⏳ Still processing after 90 seconds. Job ID: ${jobId}\nCredits charged: ${editData.creditCost}\n\nUse check_render_status with this jobId in a bit to get the final video.` }],
          structuredContent: { status: 'processing', jobId },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to edit video: ${e.message}` }], isError: true };
      }
    }
  );

  return server;
}

// ── POST /mcp — stateless: نعمل server + transport جديدين لكل طلب، عشان الـ
// authentication (API key) يتفحص من الأول في كل نداء، ومفيش أي حالة (session) محفوظة ──
// ✅ NEW: التوكن ممكن يبقى API key عادي (eriv_...) أو JWT صادر من الـ OAuth server —
// بنفرّق بينهم بالشكل ونتحقق بالطريقة المناسبة لكل واحد
async function resolveUserFromToken(token) {
  if (!token) return null;
  if (token.startsWith('eriv_')) {
    const userId = await verifyApiKey(token);
    return userId || null;
  }
  const decoded = verifyOAuthToken(token);
  return decoded?.userId || null;
}

router.post('/', express.json(), async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!token) {
      // ✅ لازم WWW-Authenticate هنا بالظبط — ده اللي بيخلي Claude.ai يكتشف سيرفر
      // الـ OAuth بتاعنا ويبدأ فلو التسجيل/التفويض تلقائيًا بدل ما يفشل بصمت
      res.set('WWW-Authenticate', `Bearer resource_metadata="${SITE_URL}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Authentication required.' }, id: null });
    }
    const userId = await resolveUserFromToken(token);
    if (!userId) {
      res.set('WWW-Authenticate', `Bearer resource_metadata="${SITE_URL}/.well-known/oauth-protected-resource"`);
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Invalid, expired, or revoked token.' }, id: null });
    }
    const user = await getUserById(userId);
    if (!user) {
      return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'User account not found.' }, id: null });
    }

    const server = buildMcpServer(userId, user.email);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { try { transport.close(); } catch {} });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('[MCP] Error:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
});

export default router;