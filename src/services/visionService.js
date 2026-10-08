// نداء موديل الرؤية (Groq) — مشترك. اسم موديل واحد ثابت بيفشل بـ404 model_not_found لو الحساب مش مفعّله
// (حصل فعلًا قبل كده، راجع audioVideoService.captionImageWithVision)، فبنجرّب كذا موديل بالترتيب ونفتكر اللي نجح.
import sharp from 'sharp';

const VISION_MODEL_CANDIDATES = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
];
let workingModel = null;

/** payload = جسم الطلب من غير model. بيرجّع الرد JSON. بيرمي خطأ فيه سبب كل موديل فشل. */
export async function groqVision(payload, { timeoutMs = 25000 } = {}) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  const order = workingModel ? [workingModel, ...VISION_MODEL_CANDIDATES.filter(m => m !== workingModel)] : VISION_MODEL_CANDIDATES;
  const failures = [];
  for (const model of order) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, model }),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        failures.push(`${model}: ${res.status} ${body}`);
        console.warn('[Vision] request failed:', model, res.status, body);
        // 400 على الصورة نفسها (حجم/صيغة) مش هيتحل بموديل تاني
        if (res.status === 400 && !/model/i.test(body)) break;
        continue;
      }
      const data = await res.json();
      workingModel = model;
      return data;
    } catch (e) {
      failures.push(`${model}: ${e.message}`);
      console.warn('[Vision] request error:', model, e.message);
    } finally { clearTimeout(timer); }
  }
  throw new Error(`vision failed — ${failures.join(' | ')}`.slice(0, 500));
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

export const _resetVisionForTest = () => { workingModel = null; };
