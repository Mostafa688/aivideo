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
let lastReport = null;

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
    if (!list.length) list = STATIC_CANDIDATES; // لو مفيش ولا واحد باين، نجرّب القايمة برضه
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
  } else failures.push('GROQ_API_KEY not set');

  if (process.env.ANTHROPIC_API_KEY) {
    try { return await anthropicVision(payload, Math.max(timeoutMs, 30000)); }
    catch (e) { failures.push(`anthropic ${ANTHROPIC_VISION_MODEL}: ${e.message}`); console.warn('[Vision] anthropic fallback failed:', e.message); }
  }
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
  const out = { groqKey: !!process.env.GROQ_API_KEY, anthropicKey: !!process.env.ANTHROPIC_API_KEY, groqModels: null, tried: [], workingModel };
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
  if (out.anthropicKey) {
    try { const d = await anthropicVision(payload, 20000); out.tried.push({ provider: 'anthropic', model: ANTHROPIC_VISION_MODEL, ok: true, detail: d.choices[0].message.content.slice(0, 60) }); }
    catch (e) { out.tried.push({ provider: 'anthropic', model: ANTHROPIC_VISION_MODEL, ok: false, detail: e.message }); }
  }
  out.anyWorking = out.tried.some(t => t.ok);
  return out;
}

export const _resetVisionForTest = () => { workingModel = null; discovered = null; };
