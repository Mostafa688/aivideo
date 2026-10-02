// ── align.js ── توقيت الكلمات: Whisper (Groq) + مطابقة نص السكريبت على الكلمات المنطوقة
import fs from 'fs';
import fetch from 'node-fetch';

const norm = (s) => String(s || '').toLowerCase()
  .replace(/[ً-ٰٟـ]/g, '')       // تشكيل وتطويل
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[^\p{L}\p{N}]+/gu, '');

export async function transcribeWords(audioPath, { language = null } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  const { default: FormData } = await import('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath), { filename: 'audio.mp3', contentType: 'audio/mpeg' });
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  if (language) form.append('language', String(language).split(/[-_]/)[0]);
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key, ...form.getHeaders() }, body: form });
  if (!res.ok) throw new Error(`Whisper error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const d = await res.json();
  const words = (d.words || []).map(w => ({ w: String(w.word || '').trim(), start: w.start, end: w.end })).filter(w => w.w);
  if (!words.length) throw new Error('Whisper returned no word timestamps');
  return { words, segments: (d.segments || []).map(s => ({ text: String(s.text || '').trim(), start: s.start, end: s.end })), text: d.text || '' };
}

// تقسيم السكريبت لتوكنز (كلمات بعلامات ترقيمها) مع علامة نهاية الفقرة
export function tokenizeScript(script) {
  const tokens = [];
  const paras = String(script || '').replace(/\r/g, '').split(/\n{2,}|\n/).map(p => p.trim()).filter(Boolean);
  paras.forEach((p, pi) => {
    const ws = p.split(/\s+/).filter(Boolean);
    ws.forEach((w, wi) => tokens.push({ w, n: norm(w), paraEnd: wi === ws.length - 1 && pi < paras.length - 1 }));
  });
  return tokens;
}

/**
 * يوزّع توقيت الكلمات المنطوقة (ASR) على توكنز السكريبت بـLCS على النصوص المطبّعة، والكلمات اللي ملهاش
 * مقابل بتتوزّع خطيًا بين أقرب كلمتين متطابقتين. بيرجّع نفس التوكنز + start/end.
 */
export function alignScriptToWords(tokens, asrWords) {
  const n = tokens.length, m = asrWords.length;
  const a = tokens.map(t => t.n);
  const b = asrWords.map(w => norm(w.w));
  const out = tokens.map(t => ({ ...t, start: null, end: null }));
  if (!n || !m) return out;
  const W = m + 1;
  const dp = new Uint16Array((n + 1) * W);
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i * W + j] = a[i - 1] && a[i - 1] === b[j - 1] ? dp[(i - 1) * W + (j - 1)] + 1 : Math.max(dp[(i - 1) * W + j], dp[i * W + (j - 1)]);
    }
  }
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] && a[i - 1] === b[j - 1]) { out[i - 1].start = asrWords[j - 1].start; out[i - 1].end = asrWords[j - 1].end; i--; j--; }
    else if (dp[(i - 1) * W + j] >= dp[i * W + (j - 1)]) i--;
    else j--;
  }
  // استيفاء الكلمات غير المطابقة
  const total = asrWords[m - 1].end;
  let k = 0;
  while (k < n) {
    if (out[k].start != null) { k++; continue; }
    let e = k; while (e < n && out[e].start == null) e++;
    const t0 = k > 0 ? out[k - 1].end : 0;
    const t1 = e < n ? out[e].start : total;
    const cnt = e - k;
    for (let x = 0; x < cnt; x++) {
      out[k + x].start = t0 + ((t1 - t0) * x) / cnt;
      out[k + x].end = t0 + ((t1 - t0) * (x + 1)) / cnt;
    }
    k = e;
  }
  // تأكد من الترتيب الزمني التصاعدي
  for (let x = 1; x < n; x++) if (out[x].start < out[x - 1].start) { out[x].start = out[x - 1].start; out[x].end = Math.max(out[x].end, out[x].start); }
  return out;
}

// لو مفيش سكريبت (فويس أوفر مرفوع): بنبني التوكنز من كلمات Whisper نفسها ونعلّم نهاية الجمل من حدود الـsegments
export function tokensFromAsr({ words, segments }) {
  const ends = new Set((segments || []).map(s => s.end));
  return words.map(w => ({ w: w.w, n: norm(w.w), start: w.start, end: w.end, sentenceEnd: [...ends].some(e => Math.abs(e - w.end) < 0.02) }));
}
