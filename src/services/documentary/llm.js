// ── llm.js ── نداءات Groq (نفس الموديل والأسلوب المستخدمين في باقي المشروع) مع إعادة محاولة وتنضيف JSON
import fetch from 'node-fetch';

const MODEL = 'openai/gpt-oss-120b';

async function call(messages, { maxTokens = 2000, temperature = 0.4 } = {}, retries = 2) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature, reasoning_effort: 'low' }),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`Groq ${res.status}`);
      if (!res.ok) throw new Error(`Groq error ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      if (!text.trim()) throw new Error('empty LLM reply');
      return text;
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function llmText({ system, user, maxTokens, temperature }) {
  return (await call([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens, temperature })).trim();
}

// بيستخرج أول كائن JSON كامل من الرد (يتجاهل ```json والكلام حواليه)
export function extractJson(text) {
  const t = String(text).replace(/```json|```/g, '');
  const start = t.indexOf('{');
  if (start < 0) throw new Error('no JSON in LLM reply');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(t.slice(start, i + 1)); }
  }
  throw new Error('unterminated JSON in LLM reply');
}

export async function llmJson({ system, user, maxTokens = 4000, temperature = 0.3 }) {
  let lastErr;
  for (let i = 0; i < 2; i++) {
    try { return extractJson(await call([{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens, temperature })); }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}
