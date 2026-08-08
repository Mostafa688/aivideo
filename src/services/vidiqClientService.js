// ── vidiqClientService.js ────────────────────────────────────────────────────
// كل عميل بيوصل مفتاح VidIQ الشخصي بتاعه هو (من app.vidiq.com/account/settings/mcp) —
// مفيش OAuth "اضغط زرار واحد" متاح من VidIQ لأطراف تالتة، فالطريقة المتاحة فعليًا هي
// المفتاح الشخصي. بنستخدمه هنا كـ MCP client حقيقي (نفس الـ SDK المستخدم في mcpRoutes.js
// بس هنا احنا الـ client مش الـ server) عشان نتصل بسيرفر VidIQ ونجيب بيانات القناة/الأفكار.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const VIDIQ_MCP_URL = 'https://mcp.vidiq.com/mcp';

export async function callVidiqTool(apiKey, toolName, args = {}) {
  if (!apiKey) throw new Error('VidIQ API key is required');
  const transport = new StreamableHTTPClientTransport(new URL(VIDIQ_MCP_URL), {
    requestInit: { headers: { Authorization: 'Bearer ' + apiKey } },
  });
  const client = new Client({ name: 'erivion-channel-agent', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: toolName, arguments: args });
    if (result.isError) {
      const msg = result.content?.find(c => c.type === 'text')?.text || 'VidIQ tool call failed';
      throw new Error(msg);
    }
    const textPart = result.content?.find(c => c.type === 'text');
    if (textPart) {
      try { return JSON.parse(textPart.text); } catch { return textPart.text; }
    }
    return result.structuredContent ?? result;
  } finally {
    await client.close().catch(() => {});
  }
}

// ✅ بيتأكد إن المفتاح شغال فعلاً ويرجّع الإيميل/القنوات المرتبطة بيه — بيتستخدم وقت
// ما العميل يضيف القناة أول مرة، عشان نعرض له فورًا لو المفتاح غلط أو منتهي
export async function verifyVidiqKey(apiKey) {
  const data = await callVidiqTool(apiKey, 'vidiq_user_channels', {});
  return data; // { channels: [...], authenticatedAs: "..." }
}

// ✅ بيحدد شكل القناة (لونج فورم ولا شورتس هي الغالبة) وبيرجّع آخر عناوين حقيقية —
// دول اللي بيتحطوا في البرومبت عشان الايجنت يفهم لغة/لهجة ونوع محتوى القناة فعليًا
export async function buildChannelProfile(apiKey, channelId) {
  const [stats, longVideos, shortVideos] = await Promise.all([
    callVidiqTool(apiKey, 'vidiq_channel_stats', { channelId }).catch(() => null),
    callVidiqTool(apiKey, 'vidiq_channel_videos', { channelId, videoFormat: 'long', popular: false }).catch(() => null),
    callVidiqTool(apiKey, 'vidiq_channel_videos', { channelId, videoFormat: 'short', popular: false }).catch(() => null),
  ]);
  const longCount = Array.isArray(longVideos?.videos) ? longVideos.videos.length : 0;
  const shortCount = Array.isArray(shortVideos?.videos) ? shortVideos.videos.length : 0;
  const format = shortCount > longCount ? 'short' : 'long';
  const recentTitles = (format === 'short' ? shortVideos?.videos : longVideos?.videos || [])
    ?.slice(0, 8).map(v => v.title).filter(Boolean) || [];
  return {
    channelId,
    title: stats?.title || stats?.channelTitle || null,
    country: stats?.country || null,
    topics: stats?.topics || [],
    format,
    recentTitles,
  };
}

// ✅ بيدوّر على أفكار حقيقية شغالة دلوقتي في نفس مجال القناة — مبني على العناوين الحالية
// (بيستخرج منها كلمة مفتاحية) بدل ما يخمّن مجال عشوائي
export async function findVideoIdeaCandidates(apiKey, profile, limit = 6) {
  const keyword = (profile.topics?.[0] || profile.recentTitles?.[0] || '').slice(0, 60) || null;
  const contentType = profile.format === 'short' ? 'short' : 'long';
  try {
    const data = await callVidiqTool(apiKey, 'vidiq_outliers', {
      keyword: keyword || undefined,
      channelIds: keyword ? undefined : [profile.channelId],
      contentType,
      limit,
      sort: 'score',
    });
    return (data?.videos || data?.results || []).slice(0, limit).map(v => ({ title: v.title, views: v.viewCount || v.views }));
  } catch {
    return [];
  }
}
