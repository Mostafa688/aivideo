// ── youtubeUploadService.js ──────────────────────────────────────────────────
// ✅ NEW: الحلقة الناقصة في نظام "القنوات" الموجود (channelRoutes.js/ChannelsPage.jsx) —
// حاليًا العميل لازم يرفع الفيديو المولّد بإيده على يوتيوب ويلصق اللينك تاني عشان
// نتابع أداءه (عن طريق VidIQ). هنا بنضيف الرفع التلقائي الحقيقي: العميل بيربط قناته
// مرة واحدة (OAuth كامل بصلاحيات youtube.readonly + youtube.upload)، وبعدها أي فيديو
// يوافق عليه من الاقتراح اليومي بيترفع على يوتيوب أوتوماتيك من غير أي خطوة يدوية.
//
// ⚠️ ملحوظة مهمة: الصلاحيات دي (خصوصًا youtube.upload) محتاجة توثيق (verification) من
// جوجل لأي حساب غير اللي عمل الـOAuth Client نفسه — لحد ما التوثيق يخلص، الرفع مش هيشتغل
// فعليًا لأي عميل حقيقي (هيرجع خطأ من جوجل)، بس الكود جاهز وهيشتغل تلقائي أول ما التوثيق يخلص
// من غير أي تعديل إضافي.

import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import {
  saveYoutubeAuthForChannel, updateYoutubeAccessToken, clearYoutubeAuthForChannel,
  getManagedChannelById,
} from './authService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'erivion_secret_2026';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
// ✅ مسار جديد منفصل تمامًا عن /api/auth/google/callback (بتاع تسجيل الدخول العادي —
// صلاحيات email/profile بس) — لازم يتضاف لقايمة "Authorized redirect URIs" في نفس
// الـOAuth Client من Google Cloud Console → Clients
// ⚠️ لازم FRONTEND_URL يجي الأول هنا (مش SITE_URL) — SITE_URL في Railway بيشاور على
// دومين Railway الخام (aivideo-production-xxxx.up.railway.app) مش الدومين الحقيقي
// (erivion.net) المسجّل فعليًا في Google كـredirect URI، فلو SITE_URL جه الأول كان
// بيبعت redirect_uri مختلف عن المسجّل ويرجّع "Error 400: redirect_uri_mismatch"
const YOUTUBE_CALLBACK_URL = process.env.YOUTUBE_CALLBACK_URL || `${(process.env.FRONTEND_URL || process.env.SITE_URL || 'https://erivion.net').replace(/\/$/, '')}/api/channels/youtube-callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://erivion.net';
const YOUTUBE_SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload';

const TEMP_DIR = path.join(process.cwd(), 'outputs', 'youtube_upload_tmp');

export function getYoutubeConnectUrl(channelId, userId) {
  const state = jwt.sign({ channelId, userId }, JWT_SECRET, { expiresIn: '15m' });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: YOUTUBE_CALLBACK_URL,
    response_type: 'code',
    scope: YOUTUBE_SCOPES,
    access_type: 'offline',
    prompt: 'consent', // ✅ لازم عشان جوجل يرجّع refresh_token فعليًا (مش بس أول مرة)
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ✅ بيتحقق من state (يتأكد إن الطلب ده فعلاً بدأ من عندنا لنفس العميل/القناة)، يبدّل
// الكود بتوكنز حقيقية، يجيب بيانات قناة يوتيوب المتصلة، ويحفظهم على القناة المُدارة
export async function handleYoutubeOAuthCallback(code, state) {
  const decoded = jwt.verify(state, JWT_SECRET); // بيرمي لو منتهي/مزور — بنمسكه في الراوت
  const { channelId, userId } = decoded;

  const channel = await getManagedChannelById(channelId);
  if (!channel || channel.user_id !== userId) throw new Error('Channel not found or not yours');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: YOUTUBE_CALLBACK_URL, grant_type: 'authorization_code',
    }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || 'No access token received from Google');

  const chRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: 'Bearer ' + tokenData.access_token },
  });
  const chData = await chRes.json();
  const ytChannel = chData.items?.[0];
  if (!ytChannel) throw new Error('Could not find a YouTube channel on this Google account — make sure you approved with the right account.');

  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
  await saveYoutubeAuthForChannel(channelId, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    expiresAt,
    youtubeChannelId: ytChannel.id,
    youtubeChannelTitle: ytChannel.snippet?.title || null,
  });
  return { channelId, youtubeChannelTitle: ytChannel.snippet?.title || null };
}

export async function disconnectYoutubeForChannel(channelId, userId) {
  await clearYoutubeAuthForChannel(channelId, userId);
}

// ✅ بيجدد access_token لو قرّب يخلص (أو خلص) باستخدام الـrefresh_token المحفوظ —
// بيرمي error واضح لو مفيش refresh_token خالص (يعني القناة لسه ما اترّبطتش أصلاً)
async function ensureFreshAccessToken(channel) {
  if (!channel.youtube_refresh_token) throw new Error('This channel is not connected to YouTube for auto-upload yet.');
  const expiresAt = channel.youtube_token_expires_at ? new Date(channel.youtube_token_expires_at).getTime() : 0;
  if (channel.youtube_access_token && expiresAt - Date.now() > 60_000) return channel.youtube_access_token; // لسه صالح لدقيقة+ قدام

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: channel.youtube_refresh_token, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || data.error || 'Failed to refresh YouTube access token');
  const newExpiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
  await updateYoutubeAccessToken(channel.id, data.access_token, newExpiresAt);
  return data.access_token;
}

// ✅ الرفع الفعلي — بينزّل الفيديو (رابط داخلي "/outputs/..." أو رابط R2 كامل) لملف مؤقت،
// وبعدين resumable upload حقيقي لـYouTube Data API v3. بيرجّع الـvideo ID الحقيقي (نفس
// الشكل اللي linkYoutubeVideoToRun المستخدمة أصلاً في المسار اليدوي بتتوقعه)
export async function uploadVideoToYoutube(channel, { videoUrl, title, description, tags }) {
  const accessToken = await ensureFreshAccessToken(channel);

  const absoluteUrl = /^https?:\/\//i.test(videoUrl) ? videoUrl : `${(process.env.SITE_URL || process.env.FRONTEND_URL || 'https://erivion.net').replace(/\/$/, '')}${videoUrl}`;
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const tmpPath = path.join(TEMP_DIR, `yt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.mp4`);
  const dlRes = await fetch(absoluteUrl);
  if (!dlRes.ok) throw new Error(`Could not download the video to upload (status ${dlRes.status})`);
  const buffer = Buffer.from(await dlRes.arrayBuffer());
  fs.writeFileSync(tmpPath, buffer);

  // ✅ YouTube tags: حد أقصى 500 حرف مجمّعة كلها مع بعض — بنقص لحد ما نضمن إننا تحت الحد
  const cappedTags = [];
  let tagsCharCount = 0;
  for (const t of Array.isArray(tags) ? tags : []) {
    const clean = String(t || '').trim();
    if (!clean) continue;
    tagsCharCount += clean.length + 1;
    if (tagsCharCount > 480) break;
    cappedTags.push(clean);
  }

  try {
    const metadata = {
      snippet: { title: (title || 'Erivion video').slice(0, 100), description: (description || '').slice(0, 4900), tags: cappedTags, categoryId: '22' },
      // ✅ NEW: الإفصاح الرسمي عن المحتوى المصنوع بالذكاء الاصطناعي (containsSyntheticMedia،
      // مضافة لـYouTube Data API v3 في أكتوبر 2024) — كل فيديو بيتعمل من Erivion محتوى
      // مولّد بالذكاء الاصطناعي فعليًا، فبنعلّمه true دايمًا، مفيش استثناء
      status: { privacyStatus: channel.youtube_privacy_status || 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    };

    // الخطوة 1: نبدأ الـresumable session (بيانات الفيديو (metadata) بس، من غير الملف نفسه)
    const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(buffer.length),
      },
      body: JSON.stringify(metadata),
    });
    if (!initRes.ok) throw new Error(`YouTube upload init failed (${initRes.status}): ${(await initRes.text()).slice(0, 300)}`);
    const uploadUrl = initRes.headers.get('location');
    if (!uploadUrl) throw new Error('YouTube did not return a resumable upload URL');

    // الخطوة 2: نبعت الملف الفعلي على نفس اللينك ده
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(buffer.length) },
      body: buffer,
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok || !uploadData.id) throw new Error(`YouTube upload failed (${uploadRes.status}): ${JSON.stringify(uploadData).slice(0, 300)}`);
    return uploadData.id;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}
