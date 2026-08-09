// ── googleAnalyticsService.js ────────────────────────────────────────────────
// لوحة تحكم Google Analytics 4 حقيقية في صفحة الأدمن. عشان مفيش MCP connector رسمي لـ
// Google Analytics متاح، بنعمل نفس اللي عملناه مع VidIQ: تكامل مباشر بمفتاح خاص (هنا:
// Service Account من Google Cloud) بدل الاعتماد على أداة جاهزة. بنستخدم JWT bearer flow
// يدوي (بدون مكتبة googleapis التقيلة) عشان نجيب access token، وبعدين ننادي GA4 Data API
// مباشرة بـ fetch — نفس أسلوب باقي تكاملات الموقع (Groq، VidIQ، Replicate...).
//
// المطلوب من env vars:
//   GA4_PROPERTY_ID              — رقم الـ property بتاع GA4 (من GA4 Admin → Property Settings)
//   GA4_SERVICE_ACCOUNT_JSON     — محتوى ملف الـ JSON بتاع الـ Service Account كامل (كنص واحد)
// الـ Service Account ده لازم يتضاف كـ "Viewer" في GA4 Admin → Property Access Management
// (بالإيميل الموجود جوه ملف الـ JSON نفسه، حقل client_email).

import fetch from 'node-fetch';
import crypto from 'crypto';

const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID;
const GA4_SERVICE_ACCOUNT_JSON = process.env.GA4_SERVICE_ACCOUNT_JSON;

export function isGA4Configured() {
  return !!(GA4_PROPERTY_ID && GA4_SERVICE_ACCOUNT_JSON);
}

let cachedToken = null; // { token, expiresAt }

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

// ✅ JWT bearer flow يدوي (RFC 7523) — بديل خفيف لمكتبة google-auth-library/googleapis
// الرسمية، بدون إضافة أي dependency جديدة للمشروع
async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  let creds;
  try {
    creds = JSON.parse(GA4_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error('GA4_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('GA4_SERVICE_ACCOUNT_JSON is missing client_email/private_key');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(creds.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`GA4 auth failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

async function runReport(body) {
  if (!isGA4Configured()) throw new Error('GA4 not configured — set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON');
  const token = await getAccessToken();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GA4 report failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function rowsToObjects(report) {
  const dimHeaders = (report.dimensionHeaders || []).map(h => h.name);
  const metHeaders = (report.metricHeaders || []).map(h => h.name);
  return (report.rows || []).map(row => {
    const obj = {};
    (row.dimensionValues || []).forEach((v, i) => { obj[dimHeaders[i]] = v.value; });
    (row.metricValues || []).forEach((v, i) => { obj[metHeaders[i]] = v.value; });
    return obj;
  });
}

// ✅ نظرة عامة للأدمن: زوار/جلسات/مشاهدات آخر 7 و30 يوم + أكتر صفحات وأكتر مصادر زيارة
export async function getGA4Overview() {
  const [summary7, summary30, topPages, topSources] = await Promise.all([
    runReport({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }, { name: 'bounceRate' }],
    }),
    runReport({
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
    }),
    runReport({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }),
    runReport({
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8,
    }),
  ]);

  const s7 = summary7.rows?.[0]?.metricValues || [];
  const s30 = summary30.rows?.[0]?.metricValues || [];

  return {
    last7d: {
      activeUsers: Number(s7[0]?.value || 0),
      sessions: Number(s7[1]?.value || 0),
      pageViews: Number(s7[2]?.value || 0),
      avgSessionDurationSec: Number(s7[3]?.value || 0),
      bounceRate: Number(s7[4]?.value || 0),
    },
    last30d: {
      activeUsers: Number(s30[0]?.value || 0),
      sessions: Number(s30[1]?.value || 0),
      pageViews: Number(s30[2]?.value || 0),
    },
    topPages: rowsToObjects(topPages).map(r => ({ path: r.pagePath, views: Number(r.screenPageViews || 0) })),
    topSources: rowsToObjects(topSources).map(r => ({ channel: r.sessionDefaultChannelGroup, sessions: Number(r.sessions || 0) })),
  };
}
