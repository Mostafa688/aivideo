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
import { verifyApiKey, mintInternalToken, getUserById, getCreditsBalance, verifyOAuthToken, listManagedChannelsForUser, getManagedChannelById, incrementYoutubePublishCount } from './authService.js';
import { uploadVideoToYoutube, uploadThumbnailToYoutube } from './youtubeUploadService.js';
import { YOUTUBE_PUBLISH_ENABLED } from './featureFlags.js';
// ✅ FIX (طلب العميل: "ظبط الـMCP على النظام الجديد"): مستوردين هنا بس أسماء المفاتيح الحقيقية
// (مش أي منطق تسعير/توليد) عشان نبني منها enum الـzod الصحيح لأدوات generate_image/
// generate_video — نفس الاستيراد المستخدم فعليًا في agentService.js لنفس الغرض بالظبط
import { NEW_IMAGE_MODELS } from './newImageModelsService.js';
import { NEW_VIDEO_MODELS, measureVideoDurationSec } from './newVideoModelsService.js';
import { buildCharacterPrompt } from './characterPrompt.js';

// ✅ FIX: كانت بتتحسب من جديد جوه buildMcpServer() في كل طلب MCP رغم إنها ثابتة طول عمر
// الـprocess — بنحسبها مرة واحدة هنا بدل ما نعيد بناء enum الـzod في كل نداء
const IMAGE_MODEL_KEYS = Object.keys(NEW_IMAGE_MODELS);
const VIDEO_MODEL_KEYS = Object.keys(NEW_VIDEO_MODELS).filter(k => !NEW_VIDEO_MODELS[k].performanceTransfer); // نقل الأداء بيتعمل من أداة swap_character_in_video (فيديو مصدر برابط + صورة شخصية) مش من generate_video

const router = express.Router();
const SITE_URL = process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net';
// ✅ نداء داخلي على نفس السيرفر (loopback) — مش نداء خارجي عبر الإنترنت
const INTERNAL_BASE = process.env.INTERNAL_API_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
// ✅ FIX (باج حقيقي كان هيصمد لو سبناه): كل استخدامات "${SITE_URL}${videoUrl}" في الملف ده
// كانت بتفترض إن videoUrl دايمًا رابط نسبي (زي "/outputs/video_x.mp4" بتاع النظام القديم) —
// بس مخرجات النظام الجديد (generateNewModelVideo/composeVideoAudio) بترفع على R2 وترجع رابط
// https كامل من الأساس، فكان بيتلزق بعد SITE_URL ويطلع رابط مكسور مزدوج
// ("https://erivion.nethttps://...")
const resolveUrl = (raw) => (raw && /^https?:\/\//i.test(raw) ? raw : `${SITE_URL}${raw || ''}`);

// ✅ NEW (طلب العميل: "ازاي بيظهر من higgsfield" — سؤاله بعد ما اتأكد إن الـwidget التجريبي
// (MCP Apps/SEP-1865) مش السبب): "resource_link" ده نوع محتوى قياسي فعليًا في نص مواصفة MCP
// نفسها (مش إضافة تجريبية زي registerAppTool فوق) — أي عميل MCP (زي Higgsfield على الأرجح)
// بيرجّعه بيقدر يرندره كـ<video>/<img> حقيقي جوه المحادثة من غير أي دعم تجريبي إضافي مطلوب من
// الـhost. بنضيفه هنا كـcontent block إضافي (مع النص العادي، مش بدل منه — احتياط مضمون لو
// العميل مش بيدعمه، بيتجاهله ببساطة ويفضل النص شغال زي ما هو)
const videoResourceLink = (url, name = 'Generated video') => ({
  type: 'resource_link', uri: url, name, mimeType: 'video/mp4', description: name,
});
const imageResourceLink = (url, name = 'Generated image') => ({
  type: 'resource_link', uri: url, name, mimeType: 'image/jpeg', description: name,
});


// ── نشر على يوتيوب من Claude (MCP) ───────────────────────────────────────────
// SSRF guard: السيرفر هو اللي بيحمّل الفيديو/الصورة من الرابط ويرفعهم — فمنسمحش بأي رابط
// عشوائي؛ بس روابط تخزين Erivion نفسها (R2) أو دومين الموقع (نفس اللي generate_* وأدوات
// "Upload ... get link" بترجّعه أصلاً)
function isErivionMediaUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const allowed = new Set();
    for (const base of [process.env.R2_PUBLIC_URL, SITE_URL]) {
      try { if (base) allowed.add(new URL(base).host); } catch {}
    }
    return allowed.has(u.host);
  } catch { return false; }
}

// حماية ضد الرفع المزدوج (Claude ممكن يعيد النداء بعد timeout أو retry) — نفس درس
// claimRunForPublishing في مسار القنوات: نفس الفيديو على نفس القناة مرتين = فيديوهين حقيقيين
const ytPublishGuard = new Map(); // key -> { status: 'inflight' | 'done', videoId?, at }
const YT_GUARD_TTL_MS = 60 * 60 * 1000;
function ytGuardGet(key) {
  const e = ytPublishGuard.get(key);
  if (!e) return null;
  if (Date.now() - e.at > YT_GUARD_TTL_MS) { ytPublishGuard.delete(key); return null; }
  return e;
}

function buildMcpServer(userId, email) {
  const server = new McpServer({ name: 'erivion', version: '1.1.0' });
  const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + mintInternalToken(userId, email) });

  // ══════════════════════════════════════════════════════════════════════════
  //  ✅ NEW: MCP Apps (SEP-1865) — widget فيديو حقيقي بيبان جوه الشات نفسه بدل
  //  ما يبقى لينك نص عادي. لو الـ host (Claude) بيدعم الإضافة دي، هيرندر الـ HTML
  //  ده جوه iframe محمي ويغذّيه بنتيجة الأداة تلقائيًا. لو مش بيدعمها، بيرجع
  //  تلقائيًا للنص العادي (fallback مضمون، مفيش خطر كسر أي حاجة).
  //
  //  ✅ FIX (باج حقيقي — سبب فشل الاتصال بالكونكتور بالكامل): registerAppTool/
  //  registerAppResource جايين من مكتبة تجريبية منفصلة (@modelcontextprotocol/ext-apps)
  //  بتنفّذ مواصفة لسه مش مستقرة (SEP-1865). لو أي نسخة منها اترفعت تلقائيًا وقت
  //  الديبلوي وبقت مش متوافقة مع نسخة الـSDK الأساسية، أي استدعاء ليها كان بيرمي
  //  استثناء فوري — وده بيحصل جوه buildMcpServer() اللي بينادَى في كل طلب متسجل
  //  دخول عليه، يعني كل محاولة اتصال حقيقية كانت بتفشل بـ500 حتى لو الـauth تمام.
  //  الحل: كل استدعاء لواجهة الـWidget التجريبية دي محاط بـtry/catch وبيرجع
  //  تلقائيًا لـserver.registerTool العادي المستقر (بدون widget، نص عادي بس)
  //  لو المكتبة التجريبية فشلت — عشان فشل feature تجريبي واحد ميكسرش الكونكتور كله
  const videoPlayerResourceUri = 'ui://erivion/video-player.html';
  let appsWidgetOk = true;
  const safeRegisterAppTool = (name, config, handler) => {
    if (appsWidgetOk) {
      try {
        registerAppTool(server, name, config, handler);
        return;
      } catch (e) {
        appsWidgetOk = false;
        console.error('[MCP] registerAppTool failed, falling back to plain tool:', e.message);
      }
    }
    const { _meta, ...plainConfig } = config;
    server.registerTool(name, plainConfig, handler);
  };
  // ✅ FIX (باج حقيقي جوهري — هو السبب الفعلي وراء "الـwidget مبيظهرش خالص" حتى بعد ما
  // اتصلحت كل مشاكل الـ_meta): كان الكود القديم فوق بيبني bridge يدوي بـpostMessage خام
  // (زي كتابة بروتوكول WebSocket من الصفر بدل استخدام مكتبة socket.io الرسمية)، مش
  // مستخدم App class الحقيقية من مكتبة @modelcontextprotocol/ext-apps نفسها. توثيق
  // Claude الرسمي (claude.com/docs/.../mcp-apps/troubleshooting) بيقول صراحة: "أشيع سبب
  // إن الـwidget يبقى مش ظاهر خالص هو missing app.connect() call" — لازم نستورد App
  // الحقيقية جوه الـiframe ونعمل .connect() فعلي (handshake حقيقي مع الـhost)، مش نبعت
  // إشعار postMessage تخميني بننا فاهمين البروتوكول صح. الاستيراد ده لازم يجي من مصدر
  // مسموح بالـCSP الافتراضي للـsandbox (سكريبت inline أو من نفس origin بس)، فمحتاجين
  // كمان نسمح بـunpkg.com صراحة في _meta.ui.csp.resourceDomains — بالظبط زي quickstart
  // الرسمي المتحقق منه على نفس النسخة 1.7.5 المثبتة عندنا بالظبط
  try {
  registerAppResource(server, videoPlayerResourceUri, videoPlayerResourceUri, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [{
      uri: videoPlayerResourceUri,
      mimeType: RESOURCE_MIME_TYPE,
      // ✅ resourceDomains بتتحكم في img-src/script-src/media-src جوه الـsandbox مع بعض —
      // مش سكريبت unpkg بس؛ لازم كمان نسمح بدومين R2 اللي بترفع عليه كل صور/فيديوهات
      // Erivion فعليًا (نفس الدومين المسموح بيه في CSP الموقع نفسه، index.js:169)، وإلا
      // الـ<img>/<video> جوه الـwidget هيتحظروا بصمت حتى لو الـApp اتصلت صح
      _meta: { ui: { csp: { resourceDomains: ['https://unpkg.com', 'https://*.r2.dev'] } } },
      text: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="color-scheme" content="light dark">
<style>
  body { margin:0; padding:0; background:transparent; font-family:sans-serif; display:flex; align-items:center; justify-content:center; min-height:100px; }
  video { max-width:100%; max-height:480px; border-radius:12px; display:block; }
  img { max-width:100%; max-height:480px; border-radius:12px; display:block; margin:4px 0; }
  #msg { color:#888; font-size:13px; padding:20px; text-align:center; }
</style></head>
<body>
  <div id="root"><div id="msg">Loading…</div></div>
  <script type="module">
    // ✅ الـApp الحقيقية من نفس نسخة المكتبة المثبتة عندنا (1.7.5) — مش bridge يدوي
    import { App } from "https://unpkg.com/@modelcontextprotocol/ext-apps@1.7.5/dist/src/app-with-deps.js";
    const app = new App({ name: "Erivion Media Viewer", version: "1.0.0" });
    function render(structuredContent) {
      const root = document.getElementById('root');
      if (structuredContent && structuredContent.status === 'done' && structuredContent.videoUrl) {
        root.innerHTML = '<video src="' + structuredContent.videoUrl + '" controls autoplay muted playsinline></video>';
      } else if (structuredContent && structuredContent.status === 'done' && structuredContent.imageUrls && structuredContent.imageUrls.length) {
        root.innerHTML = structuredContent.imageUrls.map(function (u) {
          return '<img src="' + u + '">';
        }).join('');
      } else if (structuredContent && structuredContent.status === 'failed') {
        root.innerHTML = '<div id="msg">❌ Render failed</div>';
      } else {
        root.innerHTML = '<div id="msg">⏳ Still processing…</div>';
      }
    }
    // ✅ لازم نسجل الـhandler قبل connect() عشان أول نتيجة توصل ميتفوتش
    app.ontoolresult = ({ structuredContent }) => render(structuredContent);
    await app.connect(); // ✅ الـhandshake الحقيقي مع الـhost — ده اللي كان ناقص بالكامل
  </script>
</body></html>`,
    }],
  }));
  } catch (e) {
    appsWidgetOk = false;
    console.error('[MCP] registerAppResource failed, tools will fall back to plain text:', e.message);
  }

  // ── list_models ──────────────────────────────────────────────────────────
  // ✅ FIX (طلب العميل: "ظبط الـMCP على النظام الجديد"): كانت بترجع نص ثابت (hardcoded) لوصف
  // الموديلات 1-8 القديمة المتقاعدة تمامًا من الشات نفسه من زمان — بنقرأ دلوقتي القوائم
  // الحقيقية الحية (/api/images/models و/api/videos/models) بنفس الأسماء التجارية الحقيقية
  // (Veo 3، Nano Banana 2، Seedance، Kling...) المستخدمة فعليًا في generate_image/generate_video
  server.registerTool(
    'list_models',
    {
      title: 'List Erivion AI engines',
      description: 'List all available Erivion AI image and video engines — real current pricing, what each is best for, and how they differ.',
      inputSchema: {},
    },
    async () => {
      const headers = authHeaders();
      const [imgRes, vidRes] = await Promise.all([
        fetch(`${INTERNAL_BASE}/api/images/models`, { headers }),
        fetch(`${INTERNAL_BASE}/api/videos/models`, { headers }),
      ]);
      const imgData = await imgRes.json();
      const vidData = await vidRes.json();
      const imgLines = (imgData.models || []).map(m => {
        const tierNote = m.tiers ? ` (resolutions: ${m.tiers.join('/')})` : '';
        return `- ${m.label} [key: "${m.key}"] — ${m.creditCostPerImage} credits/image${tierNote}`;
      });
      const vidLines = (vidData.models || []).map(m => {
        const tierNote = m.tiers ? ` (resolutions: ${m.tiers.join('/')})` : '';
        const imgNote = m.supportsImageInput ? ', supports image-to-video' : '';
        const editNote = m.supportsVideoEdit ? ', supports editing an existing video' : '';
        const rc = m.referenceCaps;
        const refNote = rc
          ? `, reference inputs: ${[rc.images ? `up to ${rc.images} reference images` : null, rc.videos ? `up to ${rc.videos} reference videos (${m.creditCostPerSecondWithVideoIn ? `about ${m.creditCostPerSecondWithVideoIn} credits/sec instead when used` : 'higher price'})` : null, rc.audios ? `up to ${rc.audios} reference audio files` : null, rc.lastFrame ? 'last frame (end image)' : null].filter(Boolean).join(', ')}`
          : '';
        return `- ${m.label} [key: "${m.key}"] — ${m.creditCostPerSecond} credits/sec, max ${m.maxClipSec}s per clip${tierNote}${imgNote}${editNote}${refNote}`;
      });
      return {
        content: [{
          type: 'text',
          text: [
            'IMAGE ENGINES (use with generate_image, "model" = the exact key in brackets):',
            ...imgLines,
            '',
            'VIDEO ENGINES (use with generate_video, "model" = the exact key in brackets):',
            ...vidLines,
            '',
            'SPECIAL ENGINES: "prunaai_p_video_animate" (P-Video Animate, animates an image with a video motion) is available ONLY inside the Erivion Agent chat, not through this connector. To replace the person inside a video use swap_character_in_video: pick the model with the `engine` parameter: kling (Kling 3.0 Omni edit, recommended, video 3–10 s) or p_video (P-Video Replace, up to 30 s) — for ONE person, keeping the scene and the original audio; SEVERAL characters use Seedance 2.5 automatically (up to 30 s, voices regenerated, much higher price).',
            'CHARACTERS: list_characters shows the user\'s saved characters (reusable in any generation); create_character makes a new AI character with Nano Banana 2.1 (full-body reference on a white background unless the description says otherwise); list_character_templates / apply_character_template put the user\'s character into ready-made trending videos.',
            '',
            'Typical flow: generate_image to create a scene/character image, then generate_video with "imageUrl" set to that image to animate it — or generate_video directly for pure text-to-video. edit_video applies a precise AI edit to an existing short (max 15s) video from a public URL. ' + (YOUTUBE_PUBLISH_ENABLED ? 'To publish a finished video: list_youtube_channels → (optional generate_image 16:9 thumbnail) → confirm title/description/tags/privacy with the user → publish_to_youtube.' : 'Erivion does not publish to YouTube: after generating, give the user the video URL plus a strong title, description, tags and (via generate_image, 16:9) a thumbnail so they can upload it themselves in YouTube Studio.'),
          ].join('\n'),
        }],
      };
    }
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

  // ── generate_image ───────────────────────────────────────────────────────
  // ✅ NEW (طلب العميل: "ظبط الـMCP على النظام الجديد"): النظام الجديد بيفصل توليد الصورة عن
  // تحريكها لفيديو (زي GENERATE_IMAGE/GENERATE_VIDEO في شات الايجنت بالظبط) — أداة مستقلة هنا
  safeRegisterAppTool(
    'generate_image',
    {
      title: 'Generate an image',
      description: 'Generate one or more AI images from a text prompt using Erivion\'s real current image engines — call list_models first to see the exact engine keys, what each is best at, and real per-image pricing. Waits for the result and returns the final image URL(s) automatically (usually well under a minute).',
      inputSchema: {
        model: z.enum(IMAGE_MODEL_KEYS).describe('The exact engine key from list_models (e.g. "nano_banana_2_1" — the newest Nano Banana — or "nano_banana_2").'),
        prompt: z.string().min(3).describe('A detailed English image-generation prompt — concrete subject, style, lighting, composition.'),
        referenceImageUrls: z.array(z.string().url()).max(14).optional().describe('Optional: existing image URL(s) to use as visual reference for a consistent subject/style.'),
        aspectRatio: z.enum(['9:16', '16:9', '1:1']).default('9:16').describe('9:16 for Reels/TikTok/Shorts, 16:9 for YouTube/banners, 1:1 for feed posts.'),
        count: z.number().int().min(1).max(20).default(1).describe('Number of images to generate from the same prompt.'),
        tier: z.string().optional().describe('Quality/resolution tier — only for engines that list "resolutions" in list_models. Omit otherwise.'),
      },
      // ✅ FIX (باج حقيقي رصدته مراجعة كود، هو سبب اختفاء الـwidget بتاع الفيديو نهائيًا في كل
      // طلب): registerAppTool() الحقيقية بتعمل "J._meta.ui" مباشرة من غير أي حماية — لو
      // _meta مش موجودة أصلاً (زي هنا قبل الإصلاح) بترمي استثناء فورًا. وبما إن الأداة دي أول
      // حاجة بتتسجل في buildMcpServer()، الاستثناء ده كان بيسيب appsWidgetOk=false لبقية
      // الطلب كله، فـgenerate_video/check_render_status/edit_video اللي جايين بعدها كانوا
      // بيتخطوا محاولة الـwidget تمامًا من غير ما حتى يتنفذوا
      // ✅ FIX (طلب العميل — دليل قاطع: نفس حساب Claude.ai متصل بـ Higgsfield وبيعرض
      // صورة/فيديو جوه المحادثة نفسها، فالمشكلة مش قصور في الـhost خالص): كنا سايبين _meta
      // فاضية هنا افتراض إن generate_image "مالهاش widget أصلًا". ده كان غلط — لو Claude.ai
      // فعليًا بيرندر بس المحتوى المرتبط بـwidget (MCP Apps الحقيقي) مش resource_link
      // الأساسي وحده، فالصورة كانت هترجع لينك دايمًا مهما عملنا، لأن الأداة دي أصلًا مش
      // مربوطة بأي widget. بنربطها دلوقتي بنفس الـwidget (اللي بقى يعرف يرندر صور برضو
      // بعد إصلاح سابق)، مش بس فيديو
      _meta: { ui: { resourceUri: videoPlayerResourceUri } },
    },
    async ({ model, prompt, referenceImageUrls, aspectRatio, count, tier }) => {
      try {
        const headers = authHeaders();
        const genRes = await fetch(`${INTERNAL_BASE}/api/images/generate`, {
          method: 'POST', headers,
          body: JSON.stringify({ model, prompt, referenceImageUrls: referenceImageUrls || [], aspectRatio, count, tier: tier || null }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) {
          const msg = genData.error === 'quota_exceeded'
            ? `Not enough credits — this generation needs ${genData.cost} credits, you have ${genData.remaining}.`
            : (genData.message || genData.error || 'Image generation failed to start');
          throw new Error(msg);
        }
        const jobId = genData.jobId;

        const maxWaitMs = 90_000, pollIntervalMs = 4_000, startedAt = Date.now();
        while (Date.now() - startedAt < maxWaitMs) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          try {
            const statusRes = await fetch(`${INTERNAL_BASE}/api/images/generate-status/${encodeURIComponent(jobId)}`, { headers: authHeaders() });
            const statusData = await statusRes.json();
            if (statusData.status === 'done') {
              const imageUrls = (statusData.images || []).map(resolveUrl);
              return {
                content: [
                  { type: 'text', text: `✅ Image(s) ready:\n${imageUrls.join('\n')}\nCredits charged: ${genData.creditCost ?? 'see check_credits'}` },
                  ...imageUrls.map((u, i) => imageResourceLink(u, imageUrls.length > 1 ? `Generated image ${i + 1}` : 'Generated image')),
                ],
                structuredContent: { status: 'done', imageUrls, jobId },
              };
            }
            if (statusData.status === 'failed') throw new Error(statusData.error || 'Image generation failed');
          } catch (pollErr) { /* شبكة متقطعة أثناء المراقبة — نكمل نحاول لحد ما الوقت يخلص */ }
        }
        return {
          content: [{ type: 'text', text: `⏳ Still generating after 90 seconds. Job ID: ${jobId}\nCredits charged: ${genData.creditCost ?? 'see check_credits'}\n\nTry generate_image again in a bit, or ask to check this jobId.` }],
          structuredContent: { status: 'processing', jobId },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to start image generation: ${e.message}` }], isError: true };
      }
    }
  );

  // ── generate_video ───────────────────────────────────────────────────────
  // ✅ FIX (طلب العميل: "ظبط الـMCP على النظام الجديد"): كانت الأداة دي بتنادي مسارات
  // الموديلات 1-8 القديمة المتقاعدة تمامًا (model3/render، model4/render، model5/render،
  // model8/render) — نفس الموديلات اللي شات الايجنت نفسه اتقفل عليه خالص من زمان في هذا
  // الجلسة (راجع "MODELS AVAILABLE ON ERIVION" اللي اتشالت من agentService.js). بقت دلوقتي
  // بتنادي /api/videos/generate الحقيقي بنفس المحركات (Veo/Nano Banana/Seedance/Kling...)
  safeRegisterAppTool(
    'generate_video',
    {
      title: 'Generate a video',
      description: 'Generate an Erivion video from a text prompt (optionally animating an existing image, from a public URL only — see "imageUrl") using Erivion\'s real current video engines — call list_models first to see the exact engine keys, what each is best at, and real per-second pricing. Waits for the result and returns the final video automatically (usually 1-3 minutes). Can also add narration (freshly synthesized speech from a script), burned-in captions, and background music on top of the generated clip. IMPORTANT: this tool cannot receive an image you were just attached/uploaded in this conversation directly — MCP has no file-upload channel to this server. If the user wants to animate a photo they just attached here (not a URL from an earlier Erivion generation), do NOT approximate/recreate it from a text description as a workaround — that produces a different image entirely and misleads the user into thinking their real photo was used. Instead tell them plainly you need a direct public URL for that exact image (e.g. they can get one from Erivion → Settings → API & MCP → "Upload image, get link"), and wait for that URL before calling this tool with "imageUrl".',
      inputSchema: {
        model: z.enum(VIDEO_MODEL_KEYS).describe('The exact engine key from list_models (e.g. "veo3_fast", "seedance_2_5", "kling_2_5").'),
        prompt: z.string().min(3).describe('A detailed English video-generation prompt — subject, action, camera movement, style.'),
        imageUrl: z.string().url().optional().describe('Animate this existing image instead of pure text-to-video (image-to-video) — only for engines where list_models says "supports image-to-video". Must be a real, direct public URL (e.g. an earlier Erivion generation\'s URL, or a link the user got from Erivion\'s "Upload image, get link" tool) — never a locally attached/uploaded file from this chat, MCP cannot pass that through. Never fabricate a URL.'),
        referenceImageUrls: z.array(z.string().url()).max(30).optional().describe('Reference images that guide the subject/style (character consistency, a product, a place) — only for engines where list_models says "reference images". In the prompt refer to them as [Image1], [Image2]… (Seedance 2.5). Cannot be combined with imageUrl/lastFrameUrl on Seedance 2.5.'),
        referenceVideoUrls: z.array(z.string().url()).max(10).optional().describe('Reference videos for motion transfer / style (Seedance 2.5 only, up to 10, combined max 30s). Refer to them as [Video1]… in the prompt. NOTE: this costs about 4x more per second — only use when the user actually wants to borrow motion/style from a video.'),
        referenceAudioUrls: z.array(z.string().url()).max(10).optional().describe('Reference audio for audio-driven generation / lip-sync (Seedance 2.5 only, combined max 30s) — needs at least one reference image or video too. Refer to them as [Audio1]… in the prompt.'),
        lastFrameUrl: z.string().url().optional().describe('Ending image — the video transitions from imageUrl (first frame) to this image. Needs imageUrl. Only for engines where list_models says "last frame".'),
        generateAudio: z.boolean().optional().describe('Seedance 2.5 only: set false for a silent clip (default is with synchronized audio).'),
        aspectRatio: z.enum(['9:16', '16:9']).default('16:9').describe('16:9 for YouTube/cinematic, 9:16 for social/reels.'),
        durationSec: z.number().int().min(1).max(60).default(5).describe('Clip length in seconds — must not exceed that engine\'s "max Xs per clip" from list_models. Ignored if narrationScript is given (duration is then set by the real narration length).'),
        tier: z.string().optional().describe('Quality/resolution tier — only for engines that list "resolutions" in list_models. Omit otherwise.'),
        narrationScript: z.string().optional().describe('Full spoken narration text — a real voiceover gets synthesized and the clip duration is set to match it. Omit for a silent/no-narration clip.'),
        voiceKey: z.enum(['male_wise', 'male_american', 'female_american', 'female_arabic']).optional().describe('Narration voice preset — only used with narrationScript.'),
        narrationLanguage: z.string().optional().describe('Narration language code, e.g. "en" or "ar" — omit to auto-detect from the script.'),
        addCaptions: z.boolean().default(false).describe('Burn in captions from the real narration audio — requires narrationScript.'),
        musicStyle: z.enum(['youtube', 'general']).optional().describe('Add background music: "youtube" = royalty-free YouTube-style track, "general" = mood-matched track via musicMood. Omit for no music.'),
        musicMood: z.string().optional().describe('Short mood/genre tag (e.g. "epic", "calm", "upbeat") — only with musicStyle "general".'),
      },
      _meta: { ui: { resourceUri: videoPlayerResourceUri } },
    },
    async ({ model, prompt, imageUrl, aspectRatio, durationSec, tier, narrationScript, voiceKey, narrationLanguage, addCaptions, musicStyle, musicMood, referenceImageUrls, referenceVideoUrls, referenceAudioUrls, lastFrameUrl, generateAudio }) => {
      try {
        const headers = authHeaders();
        const genRes = await fetch(`${INTERNAL_BASE}/api/videos/generate`, {
          method: 'POST', headers,
          body: JSON.stringify({
            model, prompt, imageUrl: imageUrl || null, aspectRatio, durationSec, tier: tier || null,
            referenceImageUrls: referenceImageUrls || [], referenceVideoUrls: referenceVideoUrls || [], referenceAudioUrls: referenceAudioUrls || [],
            lastFrameUrl: lastFrameUrl || null, generateAudio: typeof generateAudio === 'boolean' ? generateAudio : undefined,
            narrationScript: narrationScript || null, voiceKey: voiceKey || null, narrationLanguage: narrationLanguage || null,
            addCaptions: !!addCaptions, musicStyle: musicStyle || null, musicMood: musicMood || null,
          }),
        });
        const genData = await genRes.json();
        if (!genRes.ok) {
          const msg = genData.error === 'quota_exceeded'
            ? `Not enough credits — this video needs ${genData.cost} credits, you have ${genData.remaining}.`
            : (genData.message || genData.error || 'Video generation failed to start');
          throw new Error(msg);
        }
        const jobId = genData.jobId;

        // ✅ بنراقب التقدّم جوه نفس النداء (بدل ما نرجع فورًا) — لحد 90 ثانية، عشان الـ widget
        // يتحدّث لوحده للفيديو النهائي من غير ما العميل يطلب "چيك" يدوي
        const maxWaitMs = 90_000, pollIntervalMs = 5_000, startedAt = Date.now();
        while (Date.now() - startedAt < maxWaitMs) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          try {
            const statusRes = await fetch(`${INTERNAL_BASE}/api/videos/generate-status/${encodeURIComponent(jobId)}`, { headers: authHeaders() });
            const statusData = await statusRes.json();
            if (statusData.status === 'done') {
              const videoUrl = resolveUrl(statusData.videoUrl);
              return {
                content: [
                  { type: 'text', text: `✅ Video ready: ${videoUrl}\nCredits charged: ${genData.creditCost ?? 'see check_credits'}` },
                  videoResourceLink(videoUrl),
                ],
                structuredContent: { status: 'done', videoUrl, jobId },
              };
            }
            if (statusData.status === 'failed') {
              throw new Error(statusData.error || 'Video generation failed');
            }
          } catch (pollErr) { /* شبكة متقطعة أثناء المراقبة — نكمل نحاول لحد ما الوقت يخلص */ }
        }

        // مستغرق أكتر من المتوقع — بنسيب المهمة تكمل في الخلفية ونديله jobId يقدر يتابع بيه
        return {
          content: [{
            type: 'text',
            text: `⏳ Still rendering after 90 seconds — this can happen with longer/narrated videos. Job ID: ${jobId}\nCredits charged: ${genData.creditCost ?? 'see check_credits'}\n\nUse check_render_status with this jobId in a bit to get the final video.`,
          }],
          structuredContent: { status: 'processing', jobId },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to start video generation: ${e.message}` }], isError: true };
      }
    }
  );

  // ── check_render_status ──────────────────────────────────────────────────
  // ✅ FIX (طلب العميل: "ظبط الـMCP على النظام الجديد"): كانت بتلزّق SITE_URL على videoUrl
  // دايمًا حتى لو كان أصلاً رابط https كامل من R2 (مخرجات النظام الجديد) — رابط مكسور مزدوج.
  // كمان jobId بتاع generate_image (بادئة "newimg_") مختلف كليًا (بيرجع "images" مش
  // "videoUrl")، فبنميّز بينهم عشان نستعلم على الـendpoint الصح
  safeRegisterAppTool(
    'check_render_status',
    {
      title: 'Check a generation job status',
      description: 'Check the status of an image or video generation job previously started with generate_image or generate_video.',
      inputSchema: { jobId: z.string().describe('The jobId returned by generate_image or generate_video.') },
      _meta: { ui: { resourceUri: videoPlayerResourceUri } }, // ✅ NEW: بيربط الأداة بالـ widget، لو الـ host بيدعم MCP Apps
    },
    async ({ jobId }) => {
      try {
        const isImageJob = jobId.startsWith('newimg_');
        const statusPath = isImageJob
          ? `/api/images/generate-status/${encodeURIComponent(jobId)}`
          : `/api/render-status/${encodeURIComponent(jobId)}`; // بيغطي رندر قديم + edit_video + فيديو النظام الجديد كلهم (نفس مخزن الـjobs المشترك)
        const res = await fetch(`${INTERNAL_BASE}${statusPath}`, { headers: authHeaders() });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Status check failed');

        if (data.status === 'done') {
          if (isImageJob) {
            const imageUrls = (data.images || []).map(resolveUrl);
            return {
              content: [
                { type: 'text', text: `✅ Image(s) ready:\n${imageUrls.join('\n')}` },
                ...imageUrls.map((u, i) => imageResourceLink(u, imageUrls.length > 1 ? `Generated image ${i + 1}` : 'Generated image')),
              ],
              structuredContent: { status: 'done', imageUrls },
            };
          }
          const videoUrl = resolveUrl(data.videoUrl);
          return {
            content: [
              { type: 'text', text: `✅ Video ready: ${videoUrl}` },
              videoResourceLink(videoUrl),
            ],
            structuredContent: { status: 'done', videoUrl },
          };
        }
        if (data.status === 'failed') {
          return { content: [{ type: 'text', text: `❌ Failed: ${data.error || 'unknown error'}` }], isError: true };
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
  safeRegisterAppTool(
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
              const finalUrl = resolveUrl(statusData.videoUrl);
              return {
                content: [
                  { type: 'text', text: `✅ Edited video ready: ${finalUrl}\nCredits charged: ${editData.creditCost}` },
                  videoResourceLink(finalUrl),
                ],
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


  // ══════════════════════════════════════════════════════════════════════════
  //  ✅ استوديو الشخصيات + تبديل الشخصية في فيديو (نفس مسارات الموقع بالظبط — loopback)
  // ══════════════════════════════════════════════════════════════════════════
  // بيبدأ جوب فيديو على /api/videos/generate وبيراقبه لحد 90 ثانية (زي generate_video)
  const runVideoJob = async (body, label = 'Video') => {
    const genRes = await fetch(`${INTERNAL_BASE}/api/videos/generate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    const genData = await genRes.json();
    if (!genRes.ok) {
      throw new Error(genData.error === 'quota_exceeded'
        ? `Not enough credits — this needs ${genData.cost} credits, you have ${genData.remaining}.`
        : (genData.message || genData.error || `${label} failed to start`));
    }
    const jobId = genData.jobId;
    const maxWaitMs = 90_000, pollIntervalMs = 5_000, startedAt = Date.now();
    while (Date.now() - startedAt < maxWaitMs) {
      await new Promise(r => setTimeout(r, pollIntervalMs));
      try {
        const sd = await (await fetch(`${INTERNAL_BASE}/api/videos/generate-status/${encodeURIComponent(jobId)}`, { headers: authHeaders() })).json();
        if (sd.status === 'done') {
          const videoUrl = resolveUrl(sd.videoUrl);
          return { content: [{ type: 'text', text: `✅ ${label} ready: ${videoUrl}\nCredits charged: ${genData.creditCost ?? 'see check_credits'}` }, videoResourceLink(videoUrl)], structuredContent: { status: 'done', videoUrl, jobId } };
        }
        if (sd.status === 'failed') throw new Error(sd.error || `${label} failed`);
      } catch (pollErr) { if (/failed/i.test(pollErr.message || '')) throw pollErr; /* شبكة متقطعة — نكمل */ }
    }
    return { content: [{ type: 'text', text: `⏳ Still rendering after 90 seconds. Job ID: ${jobId}\nCredits charged: ${genData.creditCost ?? 'see check_credits'}\n\nUse check_render_status with this jobId in a bit to get the final video.` }], structuredContent: { status: 'processing', jobId } };
  };
  const loadCharacters = async () => {
    const r = await fetch(`${INTERNAL_BASE}/api/characters`, { headers: authHeaders() });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Could not load characters');
    return d.characters || [];
  };
  // رابط مرجع الشخصية اللي بيتبعت للموديلات (الصورة المخفية بجسم كامل لو موجودة، وإلا صورة العرض)
  const referenceOf = (c) => c.generation_url || (Array.isArray(c.ref_urls) && c.ref_urls[0]) || c.image_url;

  server.registerTool(
    'list_characters',
    {
      title: 'List my saved characters',
      description: "List the user's saved Erivion characters (reusable faces/characters from the Character Studio) with their id, name, type, description and the reference image URL to use in generate_image (referenceImageUrls), generate_video, swap_character_in_video and apply_character_template. Call this when the user says \"my character\" or names one.",
      inputSchema: {},
    },
    async () => {
      try {
        const chars = await loadCharacters();
        if (!chars.length) return { content: [{ type: 'text', text: 'The user has no saved characters yet. They can add one in Erivion → Characters (upload a photo), or you can create one with create_character.' }] };
        const lines = chars.map(c => `- [id ${c.id}] "${c.label || 'unnamed'}" (${c.kind || 'person'})${c.description ? ` — ${c.description}` : ''}\n  reference image URL: ${resolveUrl(referenceOf(c))}\n  face thumbnail: ${resolveUrl(c.image_url)}`);
        return { content: [{ type: 'text', text: `Saved characters:\n${lines.join('\n')}\n\nUse the "reference image URL" (not the thumbnail) whenever a tool asks for the character image.` }] };
      } catch (e) { return { content: [{ type: 'text', text: `Failed to list characters: ${e.message}` }], isError: true }; }
    }
  );

  server.registerTool(
    'create_character',
    {
      title: 'Create a character with AI',
      description: "Create a new reusable character with Nano Banana 2.1 and save it to the user's Character Studio. It is generated as ONE full-body reference image (shown to the user as a face crop). By default the background is plain white and nothing is held or worn as an accessory — only mention a background, a place or items in the description if the user explicitly asked for them. Costs one Nano Banana 2.1 image (see list_models). Never use names of real people/celebrities. Returns the character id and its reference image URL.",
      inputSchema: {
        name: z.string().min(1).max(60).describe('Character name, e.g. "Nora" or "Captain Sam".'),
        description: z.string().min(3).max(300).describe('What the character looks like: age, hair, skin, features, outfit. Add a background/place/held items ONLY if the user explicitly wants them.'),
        kind: z.enum(['person', 'animal', 'cartoon', 'mascot', 'other']).default('person'),
        style: z.enum(['realistic', 'cartoon3d', 'anime', 'illustration']).default('realistic'),
      },
    },
    async ({ name, description, kind, style }) => {
      try {
        const genRes = await fetch(`${INTERNAL_BASE}/api/images/generate`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ model: 'nano_banana_2_1', prompt: buildCharacterPrompt(kind, style, description), aspectRatio: '3:4', count: 1 }) });
        const genData = await genRes.json();
        if (!genRes.ok) throw new Error(genData.error === 'quota_exceeded' ? `Not enough credits — this needs ${genData.cost} credits, you have ${genData.remaining}.` : (genData.message || genData.error || 'Image generation failed to start'));
        let imageUrl = null; const startedAt = Date.now();
        while (Date.now() - startedAt < 120_000 && !imageUrl) {
          await new Promise(r => setTimeout(r, 4_000));
          try {
            const sd = await (await fetch(`${INTERNAL_BASE}/api/images/generate-status/${encodeURIComponent(genData.jobId)}`, { headers: authHeaders() })).json();
            if (sd.status === 'done') { const first = (sd.images || [])[0]; imageUrl = typeof first === 'string' ? first : first?.url; if (!imageUrl) throw new Error('No image returned'); }
            if (sd.status === 'failed') throw new Error(sd.error || 'Image generation failed');
          } catch (pollErr) { if (/failed|No image/i.test(pollErr.message || '')) throw pollErr; }
        }
        if (!imageUrl) return { content: [{ type: 'text', text: `⏳ The character image is still generating (job ${genData.jobId}). Credits charged: ${genData.creditCost ?? 'see check_credits'}. Try create_character again later only if no image appears — check_render_status with this jobId gives the image URL.` }], structuredContent: { status: 'processing', jobId: genData.jobId } };
        const saveRes = await fetch(`${INTERNAL_BASE}/api/characters/from-url`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ imageUrl, label: name, kind, description }) });
        const saveData = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveData.error || 'Could not save the character');
        const c = saveData.character;
        const ref = resolveUrl(referenceOf(c));
        return { content: [{ type: 'text', text: `✅ Character "${c.label || name}" saved (id ${c.id}).\nReference image URL: ${ref}\nFace thumbnail: ${resolveUrl(c.image_url)}\nCredits charged for the image: ${genData.creditCost ?? 'see check_credits'}` }, imageResourceLink(ref, c.label || 'Character')], structuredContent: { status: 'done', characterId: c.id, imageUrls: [ref] } };
      } catch (e) { return { content: [{ type: 'text', text: `Failed to create the character: ${e.message}` }], isError: true }; }
    }
  );

  safeRegisterAppTool(
    'swap_character_in_video',
    {
      title: 'Put a character into a video',
      description: "Replace the person/people inside the user's own video with character(s) and keep the video's place. ONE character image → two models: `kling` = Kling 3.0 Omni edit (RECOMMENDED and the default when the video is 3–10 s: best result, prompt-driven, 720p/1080p) and `p_video` = P-Video Replace (cheaper, video up to 30 s, 720p/1080p; the default when the video is longer than 10 s). The video must contain ONE person and the character image should show ONE person. TWO OR MORE character images (several people to replace) → Seedance 2.5 automatically, with the video as a reference (video 4–30 s; movement close but not frame-exact; voices/words are regenerated, NOT the original audio; much more expensive; say in `prompt` which person each image replaces, e.g. \"the person on the left becomes [Image1], the one on the right [Image2]\"). Needs a direct public video URL (MCP cannot receive attached files — the user gets one from Erivion → Settings → API & MCP → \"Upload video, get link\", ticking the character-swap option) and the character image URL(s) — use list_characters / create_character, or generate_image, or Erivion image links; characterIds can be used instead of URLs. Tell the user the price first (list_models) when it is large. Only for photos the user owns, AI characters, or people who agreed — never real public figures/celebrities. Very realistic human faces can be refused by the provider's safety filter (credits are refunded) — a stylized character works best.",
      inputSchema: {
        videoUrl: z.string().url().describe('Direct public URL of the user\'s source video.'),
        characterImageUrls: z.array(z.string().url()).max(10).optional().describe('One image URL per character, in the order of the people they replace. ONE → Kling / P-Video Replace; TWO OR MORE → Seedance 2.5.'),
        characterIds: z.array(z.number().int()).max(10).optional().describe('Saved character ids from list_characters, used instead of (or in addition to) characterImageUrls.'),
        prompt: z.string().optional().describe('Optional extra instruction (English), e.g. a look change or effect to add. For several characters say who replaces whom.'),
        tier: z.enum(['480p', '720p', '1080p']).default('720p').describe('Quality. Kling / P-Video Replace: 720p or 1080p. Seedance (several characters): 480p or 720p.'),
        engine: z.enum(['kling', 'p_video']).optional().describe('Only for ONE character: which model replaces the person. Omit for the default (kling for videos of 3–10 s, otherwise p_video). Several characters always use Seedance 2.5.'),
      },
      _meta: { ui: { resourceUri: videoPlayerResourceUri } },
    },
    async ({ videoUrl, characterImageUrls, characterIds, prompt, tier, engine }) => {
      try {
        const urls = [...(characterImageUrls || [])];
        if (characterIds?.length) {
          const chars = await loadCharacters();
          for (const id of characterIds) { const c = chars.find(x => x.id === id); if (!c) throw new Error(`Saved character id ${id} was not found — call list_characters.`); urls.push(referenceOf(c)); }
        }
        const images = [...new Set(urls.map(resolveUrl))];
        if (!images.length) throw new Error('Provide a character image (characterImageUrls or characterIds).');
        const dur = await measureVideoDurationSec(videoUrl);
        if (images.length > 1) { // أكتر من شخصية: Seedance 2.5 بالفيديو كمرجع (تقريبي، الصوت بيتولد من جديد، أغلى)
          if (dur > 30.5) throw new Error(`The video is ${Math.round(dur)}s — replacing several people (Seedance 2.5) supports videos up to 30 seconds. Trim it to 30 seconds or less.`);
          if (dur < 3.7) throw new Error(`The video is ${Math.round(dur * 10) / 10}s — Seedance 2.5 needs a source video of at least 4 seconds.`);
          const mapping = images.map((_, i) => `[Image${i + 1}]`).join(', ');
          const finalPrompt = prompt || `Recreate [Video1] with exactly the same camera, timing, body movements, facial expressions and lip movements, but the people in it, in order from left to right, must be completely replaced by the characters in ${mapping}: use their face, hairstyle, skin tone and clothing and do not keep the original appearance of anyone. Keep the original setting.`;
          return await runVideoJob({ model: 'seedance_2_5', prompt: finalPrompt, referenceImageUrls: images, referenceVideoUrls: [videoUrl], durationSec: Math.min(30, Math.max(4, Math.ceil(dur))), aspectRatio: '16:9', tier: tier === '480p' ? '480p' : '720p' }, 'Character-swapped video');
        }
        const eng = engine || (dur >= 2.7 && dur <= 10.5 ? 'kling' : 'p_video');
        const single = { p_video: ['prunaai_p_video_replace', 30], kling: ['kling_3_0_omni_replace', 10] }[eng];
        if (dur > single[1] + 0.5) throw new Error(`The video is ${Math.round(dur)}s — this model supports videos up to ${single[1]} seconds. Trim it${eng === 'kling' ? ', or use engine "p_video" (up to 30 s)' : ''}.`);
        if (eng === 'kling' && dur < 2.7) throw new Error(`The video is ${Math.round(dur * 10) / 10}s — Kling 3.0 Omni needs a source video of 3 to 10 seconds. Use engine "p_video" or a longer video.`);
        return await runVideoJob({ model: single[0], imageUrl: images[0], sourceVideoUrl: videoUrl, prompt: prompt || '', tier: tier === '1080p' ? '1080p' : '720p' }, 'Character-swapped video');
      } catch (e) { return { content: [{ type: 'text', text: `Failed to swap the character: ${e.message}` }], isError: true }; }
    }
  );

  server.registerTool(
    'list_character_templates',
    {
      title: 'List trending character templates',
      description: 'List the ready-made trending video templates (dance, comedy, cinematic…) where the user\'s own character replaces the original one. Each shows its id, duration and real price per quality tier. Use apply_character_template to make one.',
      inputSchema: {},
    },
    async () => {
      try {
        const d = await (await fetch(`${INTERNAL_BASE}/api/character-studio/templates?language=en`)).json();
        const list = d.templates || [];
        if (!list.length) return { content: [{ type: 'text', text: 'There are no trending templates yet.' }] };
        return { content: [{ type: 'text', text: list.map(t => `- [id ${t.id}] ${t.title} (${t.category}, ${t.durationSec}s) — ${Object.entries(t.costs || {}).map(([k, v]) => `${k}: ${v} credits`).join(' / ')}${t.description ? ` — ${t.description}` : ''}`).join('\n') }] };
      } catch (e) { return { content: [{ type: 'text', text: `Failed to list templates: ${e.message}` }], isError: true }; }
    }
  );

  safeRegisterAppTool(
    'apply_character_template',
    {
      title: 'Make a trending template with my character',
      description: "Make a trending template video with the user's character: same movements, expressions and sound as the template, performed by their character. Needs a template id (list_character_templates) and ONE character: a saved characterId (list_characters) or a direct characterImageUrl. Charged at the template's price for the chosen tier; refunded automatically if generation fails.",
      inputSchema: {
        templateId: z.number().int().describe('Template id from list_character_templates.'),
        characterId: z.number().int().optional().describe('Saved character id from list_characters.'),
        characterImageUrl: z.string().url().optional().describe('Direct URL of the character image (instead of characterId).'),
        tier: z.enum(['720p', '1080p']).default('720p'),
        engine: z.enum(['kling', 'p_video']).optional().describe('Which model makes it (the user chooses; omit for the template\'s own recommended engine): kling = Kling 3.0 Omni (templates of 3–10 s, recommended), p_video = P-Video Replace (up to 30 s).'),
      },
      _meta: { ui: { resourceUri: videoPlayerResourceUri } },
    },
    async ({ templateId, characterId, characterImageUrl, tier, engine }) => {
      try {
        let imageUrl = characterImageUrl ? resolveUrl(characterImageUrl) : null;
        if (!imageUrl && characterId != null) {
          const c = (await loadCharacters()).find(x => x.id === characterId);
          if (!c) throw new Error(`Saved character id ${characterId} was not found — call list_characters.`);
          imageUrl = resolveUrl(referenceOf(c));
        }
        if (!imageUrl) throw new Error('Provide characterId or characterImageUrl.');
        const srcRes = await fetch(`${INTERNAL_BASE}/api/character-studio/templates/${templateId}/source`, { headers: authHeaders() });
        const src = await srcRes.json();
        if (!srcRes.ok) throw new Error(src.error === 'not_found' ? `Template ${templateId} was not found — call list_character_templates.` : (src.error || 'Could not load the template'));
        const wanted = engine ? { p_video: 'prunaai_p_video_replace', kling: 'kling_3_0_omni_replace' }[engine] : null;
        if (wanted && wanted !== src.model) {
          const opt = (src.options || []).find(o => o.engine === wanted);
          if (!opt) throw new Error(`This template (${Math.round(src.durationSec)}s) cannot be made with that engine (too long for it). Pick another engine or omit it.`);
          src.model = wanted; src.mode = opt.mode; src.tiers = opt.tiers; src.prompt = '';
        }
        const useTier = (src.tiers || ['720p']).includes(tier) ? tier : (src.tiers || ['720p'])[0];
        if (src.mode === 'reference') { // قالب Seedance 2.5: الفيديو الأصلي مرجع + صورة الشخصية + برومبت القالب
          return await runVideoJob({ model: src.model, prompt: `Recreate [Video1] with exactly the same camera, timing, body movements, facial expressions and sound energy, but the main person must be completely replaced by the character in [Image1]: use that character's face, hairstyle, skin tone and clothing, and do not keep the original person's appearance anywhere in the video. ${src.prompt || ''}`.trim(), referenceImageUrls: [imageUrl], referenceVideoUrls: [src.sourceVideoUrl], durationSec: Math.min(30, Math.max(4, Math.ceil(src.durationSec || 5))), aspectRatio: src.aspect || '9:16', tier: useTier }, 'Template video');
        }
        return await runVideoJob({ model: src.model, imageUrl, sourceVideoUrl: src.sourceVideoUrl, prompt: src.prompt || 'Match the original performance exactly: same body movements, facial expressions, lip-sync and timing', tier: useTier }, 'Template video');
      } catch (e) { return { content: [{ type: 'text', text: `Failed to apply the template: ${e.message}` }], isError: true }; }
    }
  );


  if (YOUTUBE_PUBLISH_ENABLED) {
  // ── list_youtube_channels ────────────────────────────────────────────────
  server.registerTool(
    'list_youtube_channels',
    {
      title: 'List connected YouTube channels',
      description: "List the YouTube channels this Erivion user has added under 'My Channels', with each channel's numeric id, name, whether it is connected for publishing, and its default privacy. Call this first to get the channelId that publish_to_youtube needs.",
      inputSchema: {},
    },
    async () => {
      try {
        const channels = (await listManagedChannelsForUser(userId)).filter(c => c.platform === 'youtube' || !c.platform);
        if (!channels.length) {
          return { content: [{ type: 'text', text: `No channels yet. The user can add and connect a YouTube channel from Erivion → My Channels (${SITE_URL}).` }], structuredContent: { channels: [] } };
        }
        const lines = channels.map(c => {
          const connected = !!c.youtube_channel_title;
          return `- channelId ${c.id}: "${c.label || c.channel_id}"${connected ? ` (YouTube: ${c.youtube_channel_title}) — connected for publishing, default privacy: ${c.youtube_privacy_status || 'public'}` : ' — NOT connected to YouTube yet (user must click Connect in Erivion → My Channels)'}`;
        });
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: { channels: channels.map(c => ({ channelId: c.id, label: c.label || c.channel_id, youtubeChannelTitle: c.youtube_channel_title || null, connected: !!c.youtube_channel_title, defaultPrivacy: c.youtube_privacy_status || 'public' })) },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to list channels: ${e.message}` }], isError: true };
      }
    }
  );

  // ── publish_to_youtube ───────────────────────────────────────────────────
  server.registerTool(
    'publish_to_youtube',
    {
      title: 'Publish a video to the user\'s YouTube channel',
      description: "Publish an Erivion-generated video (a videoUrl returned by generate_video / check_render_status / edit_video, or from Erivion's 'Upload video, get link') to one of the user's connected YouTube channels, with a title, description, tags, optional custom thumbnail, privacy/schedule, and the AI-content disclosure. THIS IS A REAL, PUBLIC ACTION on the user's real channel. Before offering it, tell the user once that the SAFER option is to download the finished video (the videoUrl) and upload it to YouTube themselves — full control, no automation involved — and that if they still want Erivion to publish, it happens on their say-so and the channel stays their responsibility; the first video published through Erivion goes out Unlisted. Only proceed if they choose Erivion: before calling it, show the user the exact title, description, tags, thumbnail and privacy you intend to use and get their explicit go-ahead — never publish unprompted, and never call it twice for the same video. Recommended flow: (1) write a strong prompt and call generate_video, (2) optionally call generate_image (aspectRatio 16:9, a bold 1-3 word hook, no text that violates YouTube policy) for the thumbnail, (3) call list_youtube_channels for the channelId, (4) confirm metadata with the user, (5) call this tool. Metadata guidance: title ≤100 chars, front-loaded with the main keyword, honest (no misleading clickbait — YouTube demotes/removes it); description: the first 2 lines are what shows in search, include keywords naturally, 3-5 short paragraphs or bullets, no fake claims; 5-15 relevant tags; thumbnail must be a 16:9 image under 2MB (the channel must be phone-verified on YouTube to use custom thumbnails). madeForKids defaults to false; only ask the customer about it when the content looks aimed at children. aiDisclosure should stay true for realistic AI-generated/altered footage (YouTube's policy requires disclosing realistic synthetic content); only set it to false if the video is clearly animated/fantasy/unrealistic AND the user says so.",
      inputSchema: {
        channelId: z.number().int().describe('The numeric channelId from list_youtube_channels.'),
        videoUrl: z.string().url().describe("The Erivion video URL to upload (must be an Erivion-hosted link, e.g. from generate_video's result)."),
        title: z.string().min(1).max(100).describe('Video title, max 100 characters. Strong, honest, keyword-first.'),
        description: z.string().max(4900).default('').describe('Full video description (searchable keywords in the first two lines).'),
        tags: z.array(z.string()).max(30).optional().describe('Search keywords/tags (5-15 relevant ones; total length is capped at ~480 characters by YouTube).'),
        thumbnailUrl: z.string().url().optional().describe('Optional custom thumbnail: an Erivion-hosted image URL (e.g. from generate_image, 16:9, under 2MB).'),
        privacyStatus: z.enum(['public', 'unlisted', 'private']).optional().describe("Omit to use the channel's saved default privacy. Ignored if publishAt is set (scheduled videos go out as private then flip to public automatically)."),
        publishAt: z.string().optional().describe('Optional ISO-8601 datetime in the future (e.g. "2026-10-05T16:00:00Z") to schedule the release instead of publishing immediately.'),
        aiDisclosure: z.boolean().default(true).describe("Mark the video as containing AI-generated/altered content (YouTube's 'altered or synthetic content' disclosure). Keep true for realistic AI footage."),
        madeForKids: z.boolean().default(false).describe("YouTube's 'made for kids' (COPPA) designation. Defaults to false, which is right for most content. It is the customer's call, based on their content and audience: if the video looks aimed at children (cartoons, nursery/kids stories, toys, children as the intended viewers), ask the customer before publishing instead of assuming, because YouTube treats mislabelling kids' content as a policy violation. Set true only when the customer confirms the video is made for kids."),
        categoryId: z.string().optional().describe('YouTube category id, e.g. "22" People & Blogs (default), "24" Entertainment, "27" Education, "28" Science & Tech, "1" Film & Animation, "26" Howto & Style.'),
        language: z.string().max(10).optional().describe('Video language code, e.g. "en" or "ar".'),
      },
    },
    async ({ channelId, videoUrl, title, description, tags, thumbnailUrl, privacyStatus, publishAt, aiDisclosure, madeForKids, categoryId, language }) => {
      const guardKey = `${userId}:${channelId}:${videoUrl}`;
      try {
        const channel = await getManagedChannelById(channelId);
        if (!channel || channel.user_id !== userId) throw new Error('Channel not found on this account — call list_youtube_channels for valid channelIds.');
        if (!channel.youtube_refresh_token) throw new Error("This channel isn't connected to YouTube yet — the user must click Connect in Erivion → My Channels first.");
        if (!channel.youtube_publish_ack_at) throw new Error('The user has not accepted the publishing terms for this channel yet — they must open Erivion → My Channels and press "Accept publishing terms" once. Do not work around this.');
        if (!isErivionMediaUrl(videoUrl)) throw new Error('videoUrl must be an Erivion-hosted video link (use the URL returned by generate_video / check_render_status / edit_video, or one from Erivion\'s "Upload video, get link").');
        if (thumbnailUrl && !isErivionMediaUrl(thumbnailUrl)) throw new Error('thumbnailUrl must be an Erivion-hosted image link (e.g. from generate_image or "Upload image, get link").');
        if (publishAt) {
          const t = new Date(publishAt).getTime();
          if (!Number.isFinite(t)) throw new Error('publishAt is not a valid ISO-8601 datetime.');
          if (t < Date.now() + 5 * 60_000) throw new Error('publishAt must be at least ~5 minutes in the future.');
        }

        const existing = ytGuardGet(guardKey);
        if (existing?.status === 'inflight') throw new Error('This exact video is already being uploaded to this channel right now — wait for it to finish instead of retrying.');
        if (existing?.status === 'done') {
          return { content: [{ type: 'text', text: `⚠️ This exact video was already published to this channel: https://youtu.be/${existing.videoId} — not uploading a duplicate.` }], structuredContent: { status: 'already_published', videoId: existing.videoId, url: `https://youtu.be/${existing.videoId}` } };
        }
        ytPublishGuard.set(guardKey, { status: 'inflight', at: Date.now() });

        let videoId;
        try {
          videoId = await uploadVideoToYoutube(channel, {
            videoUrl, title, description, tags,
            // أول فيديو عن طريقنا على القناة = غير مدرج (إلا لو Claude/العميل حدد خصوصية صراحة أو جدول النشر)
            privacyStatus: privacyStatus || ((channel.youtube_publish_count || 0) === 0 && !publishAt ? 'unlisted' : undefined), publishAt,
            containsSyntheticMedia: aiDisclosure !== false,
            madeForKids: !!madeForKids, categoryId, defaultLanguage: language,
          });
        } catch (upErr) {
          ytPublishGuard.delete(guardKey); // فشل حقيقي — نسمح بمحاولة تانية
          throw upErr;
        }
        ytPublishGuard.set(guardKey, { status: 'done', videoId, at: Date.now() });
        await incrementYoutubePublishCount(channel.id).catch(() => {});
        const firstUnlisted = !privacyStatus && !publishAt && (channel.youtube_publish_count || 0) === 0;

        let thumbNote = '';
        if (thumbnailUrl) {
          try { await uploadThumbnailToYoutube(channel, videoId, thumbnailUrl); thumbNote = '\nThumbnail: set.'; }
          catch (tErr) { thumbNote = `\nThumbnail: NOT set (${tErr.message}). The video itself is published; the user can set a thumbnail manually in YouTube Studio.`; }
        }
        const url = `https://youtu.be/${videoId}`;
        const when = publishAt ? `scheduled for ${new Date(publishAt).toISOString()} (private until then)` : `published as ${firstUnlisted ? 'UNLISTED (first video through Erivion — tell the user to switch it to Public in YouTube Studio once they have checked it)' : (privacyStatus || channel.youtube_privacy_status || 'public')}`;
        return {
          content: [{ type: 'text', text: `✅ Video ${when} on "${channel.youtube_channel_title || channel.label}": ${url}\nAI-content disclosure: ${aiDisclosure !== false ? 'on' : 'off'}.${thumbNote}` }],
          structuredContent: { status: publishAt ? 'scheduled' : 'published', videoId, url, thumbnailSet: !!thumbnailUrl && !thumbNote.includes('NOT set') },
        };
      } catch (e) {
        return { content: [{ type: 'text', text: `Failed to publish to YouTube: ${e.message}` }], isError: true };
      }
    }
  );

  }

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

// ✅ FIX: بنستقبل GET وDELETE كمان جنب POST (مش POST بس زي قبل كده) — الـSDK نفسه
// (transport.handleRequest) بيفرّق بين الطرق التلاتة ويرجع رد متوافق مع مواصفة
// Streamable HTTP لكل واحدة فيهم (405 لو GET/DELETE مش مدعومين في وضعنا الـstateless
// مثلاً). لو الطلب كان بيوصل لـExpress أصلاً بس مسجل على POST بس، أي عميل (زي
// كونكتور Claude.ai) بيبعت GET/DELETE في أي مرحلة من فحص/الاتصال كان بياخد صفحة
// 404 عادية من Express نفسه بدل رد MCP سليم — وده بالظبط اللي بيفسّر رسالة
// "Check that the URL points to a valid MCP server"
async function handleMcpRequest(req, res) {
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
    // ✅ FIX: e.stack بدل e.message بس — عشان أي فشل في بناء السيرفر (زي مكتبة
    // MCP Apps التجريبية لو رمت استثناء مش متوقع) يبان مكانه بالظبط في لوجات
    // Railway بدل ما نشوف رسالة عامة مالهاش أي فايدة في تشخيص المشكلة
    console.error('[MCP] Error:', e.stack || e.message);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
    }
  }
}

router.post('/', express.json(), handleMcpRequest);
router.get('/', handleMcpRequest);
router.delete('/', handleMcpRequest);

export default router;