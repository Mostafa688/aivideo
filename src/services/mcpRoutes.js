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
          'Use generate_video with model "1" or "2" to start a video from this MCP server (the simplest, fastest path). For other models, use the full Erivion chat agent directly.',
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
  server.registerTool(
    'generate_video',
    {
      title: 'Generate a video',
      description: 'Start generating an Erivion video from a topic/idea. Supports Model 1 (AI images) or Model 2 (real stock footage). Returns a jobId — use check_render_status to track progress and get the final video URL once ready (usually takes 1-3 minutes).',
      inputSchema: {
        model: z.enum(['1', '2']).describe('"1" = AI-generated images (Ken Burns style), "2" = real stock video footage. Use "2" unless the user specifically wants AI-generated images.'),
        idea: z.string().min(3).describe('The video topic or idea, described in a sentence or two.'),
        duration: z.enum(['30s', '1min', '3min', '5min']).default('30s').describe('Video length.'),
        ratio: z.enum(['9:16', '16:9', '1:1']).default('9:16').describe('Aspect ratio — 9:16 for Reels/TikTok/Shorts, 16:9 for YouTube, 1:1 for feed posts.'),
        language: z.string().default('en').describe('Narration language code, e.g. "en" or "ar".'),
      },
    },
    async ({ model, idea, duration, ratio, language }) => {
      try {
        const headers = authHeaders();

        // 1) توليد المشاهد (SSE)
        const scenesRes = await fetch(`${INTERNAL_BASE}/api/generate-scenes`, {
          method: 'POST', headers,
          body: JSON.stringify({ idea, duration, mode: 'idea', tone: 'motivational', videoLanguage: language || 'en' }),
        });
        const scenesEvents = parseSSE(await scenesRes.text());
        const errorEvent = scenesEvents.find(e => e.event === 'error');
        if (errorEvent) throw new Error(errorEvent.data.message || 'Scene generation failed');
        const scenes = scenesEvents.filter(e => e.event === 'scene').map(e => e.data);
        if (!scenes.length) throw new Error('Scene generation failed — no scenes returned');

        // 2) صور AI (موديل 1) أو فيديوهات ستوك حقيقية (موديل 2)
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

        // 3) الرندر الفعلي — بيرجع jobId فورًا (async job)
        const renderRes = await fetch(`${INTERNAL_BASE}/api/render`, {
          method: 'POST', headers,
          body: JSON.stringify({
            scenes: finalScenes, ratio, duration,
            videoType: model === '1' ? 'ai_images' : 'pexels_clips',
            videoLanguage: language || 'en', captions: true, transitions: true,
          }),
        });
        const renderData = await renderRes.json();
        if (!renderRes.ok) {
          const msg = renderData.error === 'quota_exceeded'
            ? `Not enough credits — this video needs ${renderData.cost} credits, you have ${renderData.remaining}.`
            : (renderData.message || renderData.error || 'Render failed to start');
          throw new Error(msg);
        }

        return {
          content: [{
            type: 'text',
            text: `Video generation started ✅\nJob ID: ${renderData.jobId}\nCredits charged: ${renderData.creditCost ?? 'see check_credits'}\n\nUse check_render_status with this jobId to track progress and get the final video link once it's ready (usually 1-3 minutes).`,
          }],
          structuredContent: { jobId: renderData.jobId, creditCost: renderData.creditCost ?? null },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to start video generation: ${e.message}` }], isError: true };
      }
    }
  );

  // ── check_render_status ──────────────────────────────────────────────────
  server.registerTool(
    'check_render_status',
    {
      title: 'Check video render status',
      description: 'Check the status of a video generation job previously started with generate_video.',
      inputSchema: { jobId: z.string().describe('The jobId returned by generate_video.') },
    },
    async ({ jobId }) => {
      try {
        const res = await fetch(`${INTERNAL_BASE}/api/render-status/${encodeURIComponent(jobId)}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Status check failed');

        if (data.status === 'done') {
          return {
            content: [{ type: 'text', text: `✅ Video ready: ${INTERNAL_BASE}${data.videoUrl}` }],
            structuredContent: { status: 'done', videoUrl: `${INTERNAL_BASE}${data.videoUrl}` },
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