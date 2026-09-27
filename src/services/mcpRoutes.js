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
// ✅ FIX (طلب العميل: "ظبط الـMCP على النظام الجديد"): مستوردين هنا بس أسماء المفاتيح الحقيقية
// (مش أي منطق تسعير/توليد) عشان نبني منها enum الـzod الصحيح لأدوات generate_image/
// generate_video — نفس الاستيراد المستخدم فعليًا في agentService.js لنفس الغرض بالظبط
import { NEW_IMAGE_MODELS } from './newImageModelsService.js';
import { NEW_VIDEO_MODELS } from './newVideoModelsService.js';

// ✅ FIX: كانت بتتحسب من جديد جوه buildMcpServer() في كل طلب MCP رغم إنها ثابتة طول عمر
// الـprocess — بنحسبها مرة واحدة هنا بدل ما نعيد بناء enum الـzod في كل نداء
const IMAGE_MODEL_KEYS = Object.keys(NEW_IMAGE_MODELS);
const VIDEO_MODEL_KEYS = Object.keys(NEW_VIDEO_MODELS);

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

function buildMcpServer(userId, email) {
  const server = new McpServer({ name: 'erivion', version: '1.0.0' });
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
        return `- ${m.label} [key: "${m.key}"] — ${m.creditCostPerSecond} credits/sec, max ${m.maxClipSec}s per clip${tierNote}${imgNote}${editNote}`;
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
            'Typical flow: generate_image to create a scene/character image, then generate_video with "imageUrl" set to that image to animate it — or generate_video directly for pure text-to-video. edit_video applies a precise AI edit to an existing short (max 15s) video from a public URL.',
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
        model: z.enum(IMAGE_MODEL_KEYS).describe('The exact engine key from list_models (e.g. "nano_banana_2").'),
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
    async ({ model, prompt, imageUrl, aspectRatio, durationSec, tier, narrationScript, voiceKey, narrationLanguage, addCaptions, musicStyle, musicMood }) => {
      try {
        const headers = authHeaders();
        const genRes = await fetch(`${INTERNAL_BASE}/api/videos/generate`, {
          method: 'POST', headers,
          body: JSON.stringify({
            model, prompt, imageUrl: imageUrl || null, aspectRatio, durationSec, tier: tier || null,
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