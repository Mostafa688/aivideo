// ── sources/common.js ── أدوات مشتركة لمصادر الميديا (طلبات JSON/تنزيل بمهلة وإعادة محاولة)
import fetch from 'node-fetch';
import fs from 'fs';

// بعض الجهات (Wikimedia خصوصًا) بتطلب User-Agent واضح بيعرّف التطبيق وطريقة التواصل
export const UA = 'ErivionDocumentary/1.0 (https://erivion.net; digidelight33@gmail.com)';

async function withTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

export async function fetchJson(url, { headers = {}, timeoutMs = 15000, retries = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await withTimeout(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers } }, timeoutMs);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  console.warn(`[Documentary/sources] ${String(url).slice(0, 80)} failed: ${lastErr?.message}`);
  return null;
}

export async function downloadToFile(url, dest, { maxBytes = 60 * 1024 * 1024, timeoutMs = 60000, headers = {} } = {}) {
  const res = await withTimeout(url, { headers: { 'User-Agent': UA, ...headers } }, timeoutMs);
  if (!res.ok) throw new Error(`download ${res.status}`);
  const len = parseInt(res.headers.get('content-length') || '0', 10);
  if (len && len > maxBytes) throw new Error(`file too large (${len} bytes)`);
  const out = fs.createWriteStream(dest);
  let total = 0;
  await new Promise((resolve, reject) => {
    res.body.on('data', (c) => { total += c.length; if (total > maxBytes) { res.body.destroy(new Error('file too large')); } });
    res.body.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    res.body.pipe(out);
  });
  return dest;
}

// تنضيف نص وصف (HTML من Commons مثلًا) لنص عادي قصير
export const stripHtml = (s, max = 400) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, max);

// ترخيص الاستخدام التجاري: بنقبل بس الملك العام/CC0/CC BY (وبنسجّل إن BY محتاج نسب). أي SA/NC/ND مرفوض
export function classifyLicense(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return { ok: false, name: '' };
  if (/\b(nc|nd)\b|non-?commercial|no-?deriv|\bsa\b|share-?alike|fair use|all rights reserved|copyrighted/.test(s)) return { ok: false, name: raw };
  if (/public domain|^pd\b|pd-|cc0|cc-zero|no known copyright|publicdomain|u\.?s\.? government|nasa|usgov/.test(s)) return { ok: true, name: raw, attributionRequired: false };
  if (/^cc[- ]by\b|cc by|attribution/.test(s)) return { ok: true, name: raw, attributionRequired: true };
  return { ok: false, name: raw };
}
