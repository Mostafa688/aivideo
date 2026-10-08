// نداء موديل الرؤية — مشترك. اسم موديل واحد ثابت بيفشل لو الحساب مش مفعّله أو اتشال من Groq (404 model_not_found)،
// فبنعمل: (1) نسأل Groq عن الموديلات المتاحة فعلًا ونجرّب اللي شكله رؤية، (2) قايمة أسماء معروفة، (3) Claude كاحتياطي أخير
// لو ANTHROPIC_API_KEY موجود. ونفتكر اللي نجح. كل الردود بتتحوّل لشكل OpenAI (choices[0].message.content).
import sharp from 'sharp';

const STATIC_CANDIDATES = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
];
const VISION_ID = /llama-4|vision|[-_]vl\b|-vl-|scout|maverick|pixtral|gemma-?3|llava|qwen.*vl/i;
const NOT_VISION = /whisper|guard|tts|orpheus|embed|prompt-guard|safeguard/i;
const ANTHROPIC_VISION_MODEL = process.env.ANTHROPIC_VISION_MODEL || 'claude-haiku-5-5';

let workingModel = null;      // موديل Groq اللي نجح آخر مرة
let discovered = null;        // { at, ids }
let lastError = null;         // آخر فشل حقيقي (للتشخيص)

async function groqModelIds() {
  if (discovered && Date.now() - discovered.at < 60 * 60 * 1000) return discovered.ids;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`models ${res.status}`);
    const ids = ((await res.json()).data || []).map(m => m.id).filter(Boolean);
    discovered = { at: Date.now(), ids };
    return ids;
  } catch (e) {
    console.warn('[Vision] could not list Groq models:', e.message);
    discovered = { at: Date.now() - 50 * 60 * 1000, ids: null }; // نعيد المحاولة بعد ~10 دقايق
    return null;
  }
}

async function groqCandidates() {
  const ids = await groqModelIds();
  let list = STATIC_CANDIDATES;
  if (ids) {
    const live = ids.filter(id => VISION_ID.test(id) && !NOT_VISION.test(id));
    list = [...STATIC_CANDIDATES.filter(m => ids.includes(m)), ...live.filter(m => !STATIC_CANDIDATES.includes(m))];
    // لو Groq قال صراحة إن مفيش عنده موديل رؤية متاح للحساب ده، منضيّعش وقت (ولا رسالة فاشلة) في تجربة أسماء ثابتة
  }
  return workingModel ? [workingModel, ...list.filter(m => m !== workingModel)] : list;
}

// OpenAI-style messages → Anthropic Messages API
function toAnthropic(payload, model) {
  const conv = (c) => {
    if (typeof c === 'string') return c;
    return (c || []).map(p => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      const url = p.image_url?.url || '';
      const m = /^data:([^;]+);base64,(.+)$/s.exec(url);
      return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : { type: 'image', source: { type: 'url', url } };
    });
  };
  return { model, max_tokens: payload.max_tokens || 500, temperature: payload.temperature ?? 0.2, messages: payload.messages.map(x => ({ role: x.role, content: conv(x.content) })) };
}

async function anthropicVision(payload, timeoutMs) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs),
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify(toAnthropic(payload, ANTHROPIC_VISION_MODEL)),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  return { choices: [{ message: { content: text } }], _provider: 'anthropic', _model: ANTHROPIC_VISION_MODEL };
}


// ── Replicate: موديلات رؤية رسمية (التوكن موجود أصلًا للتوليد). OpenAI-style messages → input الخاص بكل عيلة ──
const REPLICATE_VISION_MODELS = (process.env.REPLICATE_VISION_MODELS || 'openai/gpt-4o-mini,google/gemini-2.5-flash').split(',').map(x => x.trim()).filter(Boolean);
let workingReplicate = null;

function toReplicateInput(payload, slug) {
  const texts = [], images = [], sys = [];
  for (const m of payload.messages || []) {
    const parts = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content || []);
    for (const p of parts) {
      if (p.type === 'text') (m.role === 'system' ? sys : texts).push(p.text);
      else if (p.image_url?.url) images.push(p.image_url.url);
    }
  }
  const max = payload.max_tokens || 500, temperature = payload.temperature ?? 0.2;
  const prompt = texts.join('\n\n');
  if (slug.startsWith('google/')) return { prompt, images, temperature, max_output_tokens: Math.max(max, 1024), ...(sys.length ? { system_instruction: sys.join('\n') } : {}) };
  return { prompt, image_input: images, temperature, max_completion_tokens: max, ...(sys.length ? { system_prompt: sys.join('\n') } : {}) };
}

async function replicateVisionOne(slug, payload, timeoutMs) {
  const headers = { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json' };
  const res = await fetch(`https://api.replicate.com/v1/models/${slug}/predictions`, {
    method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { ...headers, Prefer: 'wait=45' },
    body: JSON.stringify({ input: toReplicateInput(payload, slug) }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const err = new Error(`${res.status} ${body.slice(0, 200)}`);
    if (res.status === 429) { err.rateLimited = true; err.retryAfterMs = retryAfterMs(body, res.headers.get('retry-after')); }
    throw err;
  }
  let data = await res.json();
  const deadline = Date.now() + timeoutMs;
  while (data.status && !['succeeded', 'failed', 'canceled'].includes(data.status) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1500));
    const r2 = await fetch(`https://api.replicate.com/v1/predictions/${data.id}`, { headers, signal: AbortSignal.timeout(15000) });
    if (!r2.ok) throw new Error(`poll ${r2.status}`);
    data = await r2.json();
  }
  if (data.status !== 'succeeded') throw new Error(`${data.status || 'no status'}: ${String(data.error || '').slice(0, 200)}`);
  const text = (Array.isArray(data.output) ? data.output.join('') : String(data.output || '')).trim();
  if (!text) throw new Error('empty output');
  return { choices: [{ message: { content: text } }], _provider: 'replicate', _model: slug };
}

// Replicate بيحدّ الحساب اللي رصيده أقل من $5 بـ6 طلبات في الدقيقة وطلب واحد في نفس اللحظة (429) — بنخلّي نداءات الرؤية في طابور
// بفاصل ~10.5 ثانية بعد أول 429 (ومن غير تأخير لو الحساب مش محدود)، ونعيد المحاولة بعد المدة اللي Replicate بيطلبها.
let replicateGapUntil = 0, replicateLast = 0, replicateChain = Promise.resolve();
const REPLICATE_GAP_MS = Number(process.env.REPLICATE_VISION_GAP_MS || 10500);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function retryAfterMs(body, header) {
  const h = Number(header); if (Number.isFinite(h) && h > 0) return Math.min(30000, h * 1000);
  const m = /retry_after"?\s*[:=]\s*(\d+(?:\.\d+)?)/i.exec(body || '') || /in (\d+(?:\.\d+)?) seconds?/i.exec(body || '');
  return m ? Math.min(30000, Math.ceil(Number(m[1]) * 1000) + 500) : 11000;
}
function scheduleReplicate(fn) {
  const run = replicateChain.then(async () => {
    if (Date.now() < replicateGapUntil) { const wait = replicateLast + REPLICATE_GAP_MS - Date.now(); if (wait > 0) await sleep(wait); }
    try { return await fn(); } finally { replicateLast = Date.now(); }
  });
  replicateChain = run.catch(() => {});
  return run;
}

async function replicateVision(payload, timeoutMs, failures) {
  const order = workingReplicate ? [workingReplicate, ...REPLICATE_VISION_MODELS.filter(m => m !== workingReplicate)] : REPLICATE_VISION_MODELS;
  for (const slug of order) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { const out = await scheduleReplicate(() => replicateVisionOne(slug, payload, timeoutMs)); workingReplicate = slug; return out; }
      catch (e) {
        if (e.rateLimited && attempt < 2) { replicateGapUntil = Date.now() + 30 * 60 * 1000; console.warn(`[Vision] replicate rate-limited (${slug}) — waiting ${Math.round((e.retryAfterMs || 11000) / 1000)}s then retrying`); await sleep(e.retryAfterMs || 11000); continue; }
        failures.push(`replicate ${slug}: ${e.message}`); console.warn('[Vision] replicate failed:', slug, e.message);
        if (e.rateLimited) return null; // نفس الحد على أي موديل تاني — مفيش فايدة
        break;
      }
    }
  }
  return null;
}

/** payload = جسم الطلب (OpenAI-style) من غير model. بيرجّع الرد JSON. بيرمي خطأ فيه سبب كل موديل فشل. */
export async function groqVision(payload, { timeoutMs = 25000 } = {}) {
  const failures = [];
  if (process.env.GROQ_API_KEY) {
    for (const model of await groqCandidates()) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST', signal: AbortSignal.timeout(timeoutMs),
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, model }),
        });
        if (!res.ok) {
          const body = (await res.text()).slice(0, 200);
          failures.push(`${model}: ${res.status} ${body}`);
          console.warn('[Vision] request failed:', model, res.status, body);
          if (res.status === 401) break;                       // المفتاح نفسه غلط — مفيش فايدة من باقي الموديلات
          if (res.status === 400 && !/model/i.test(body)) break; // مشكلة في الصورة نفسها
          continue;
        }
        const data = await res.json();
        workingModel = model;
        return data;
      } catch (e) {
        failures.push(`${model}: ${e.message}`);
        console.warn('[Vision] request error:', model, e.message);
      }
    }
    if (!(await groqCandidates()).length) failures.push('groq: no vision-capable model available on this account');
  } else failures.push('GROQ_API_KEY not set');

  if (process.env.REPLICATE_API_TOKEN) {
    const out = await replicateVision(payload, Math.max(timeoutMs, 50000), failures);
    if (out) return out;
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await anthropicVision(payload, Math.max(timeoutMs, 30000)); }
    catch (e) { failures.push(`anthropic ${ANTHROPIC_VISION_MODEL}: ${e.message}`); console.warn('[Vision] anthropic fallback failed:', e.message); }
  }
  lastError = `${new Date().toISOString()} ${failures.join(' | ')}`.slice(0, 500);
  throw new Error(`vision failed — ${failures.join(' | ')}`.slice(0, 700));
}

/** صورة المستخدم → data URL JPEG مصغّرة (Groq بيرفض base64 أكبر من ~4MB، وصيغ زي HEIC/WebP الكبيرة) */
export async function toVisionDataUrl(input, { max = 1280 } = {}) {
  const raw = String(input || '');
  const b64 = raw.replace(/^data:[^;]+;base64,/, '');
  try {
    const buf = await sharp(Buffer.from(b64, 'base64'), { failOn: 'none' }).rotate().resize(max, max, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch (e) {
    console.warn('[Vision] could not re-encode image, sending original:', e.message);
    return raw.startsWith('data:') ? raw : `data:image/jpeg;base64,${raw}`;
  }
}

/** تشخيص للأدمن: بيجرّب كل موديل لوحده على صورة صغيرة ويقول مين شغّال ومين لأ وليه */
export async function visionDiagnostics() {
  const out = { groqKey: !!process.env.GROQ_API_KEY, anthropicKey: !!process.env.ANTHROPIC_API_KEY, replicateKey: !!process.env.REPLICATE_API_TOKEN, groqModels: null, tried: [], workingModel, lastError };
  const img = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 64, height: 64, channels: 3, background: '#cc3333' } }).jpeg().toBuffer()).toString('base64');
  const payload = { max_tokens: 20, temperature: 0, messages: [{ role: 'user', content: [{ type: 'text', text: 'What colour is this image? One word.' }, { type: 'image_url', image_url: { url: img } }] }] };
  if (out.groqKey) {
    discovered = null;
    const ids = await groqModelIds();
    out.groqModels = ids;
    for (const model of await groqCandidates()) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, model }) });
        const txt = await res.text();
        out.tried.push({ provider: 'groq', model, ok: res.ok, status: res.status, detail: res.ok ? (JSON.parse(txt).choices?.[0]?.message?.content || '').slice(0, 60) : txt.slice(0, 200) });
      } catch (e) { out.tried.push({ provider: 'groq', model, ok: false, detail: e.message }); }
    }
  }
  if (process.env.REPLICATE_API_TOKEN) {
    for (const slug of REPLICATE_VISION_MODELS) {
      try { const d = await replicateVisionOne(slug, payload, 60000); out.tried.push({ provider: 'replicate', model: slug, ok: true, detail: d.choices[0].message.content.slice(0, 60) }); }
      catch (e) { out.tried.push({ provider: 'replicate', model: slug, ok: false, detail: e.message }); }
    }
  }
  if (out.anthropicKey) {
    try { const d = await anthropicVision(payload, 20000); out.tried.push({ provider: 'anthropic', model: ANTHROPIC_VISION_MODEL, ok: true, detail: d.choices[0].message.content.slice(0, 60) }); }
    catch (e) { out.tried.push({ provider: 'anthropic', model: ANTHROPIC_VISION_MODEL, ok: false, detail: e.message }); }
  }
  out.anyWorking = out.tried.some(t => t.ok);
  return out;
}

export const _resetVisionForTest = () => { workingModel = null; workingReplicate = null; discovered = null; };
