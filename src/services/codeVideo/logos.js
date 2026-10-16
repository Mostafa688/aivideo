// ── logos.js ── لوجوهات البراندات (من simple-icons: مسارات SVG رسمية، رخصة CC0) عشان نرسمها بالكود كستيكر ورق.
// البراند اللي مش موجود هنا بيتدوّر على صورة لوجو بتاعته في الأرشيف (produce.js)، ولو مالقيناش بنعمل شارة بأول حروفه.
let ICONS = null;
async function load() {
  if (ICONS) return ICONS;
  const si = await import('simple-icons');
  ICONS = Object.values(si).filter(x => x && x.slug && x.path);
  return ICONS;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
// أسماء شائعة بتتقال بشكل مختلف عن اسم اللوجو (منتج ↔ شركة)
const ALIAS = {
  openai: 'openaigym', chatgpt: 'openaigym', gpt: 'openaigym', // أيقونة OpenAI Gym في simple-icons هي نفس شعار OpenAI
  gemini: 'googlegemini', googleai: 'googlegemini', bard: 'googlegemini', metaai: 'meta', llama: 'meta', facebook: 'facebook',
  mistral: 'mistralai', claudeai: 'claude', anthropicclaude: 'claude', huggingface: 'huggingface', twitter: 'x', xcom: 'x',
  youtubeshorts: 'youtubeshorts', ig: 'instagram', fb: 'facebook', whatsappbusiness: 'whatsapp', gpay: 'googlepay',
};

/** @returns {Promise<{ slug, title, hex, path } | null>} path = SVG path في مربع 24×24 */
export async function findLogo(name) {
  const q = norm(name);
  if (q.length < 2) return null;
  const all = await load();
  const want = ALIAS[q] || q;
  // مطابقة دقيقة بس (الاسم بالظبط) — التخمين الجزئي ممكن يجيب لوجو براند تاني غلط
  const hit = all.find(x => x.slug === want) || all.find(x => norm(x.title) === want) || all.find(x => norm(x.title) === q);
  if (!hit) return null;
  const title = hit.slug === 'openaigym' ? 'OpenAI' : hit.title;
  return { slug: hit.slug, title, hex: hit.slug === 'openaigym' ? '#111111' : `#${hit.hex}`, path: hit.path };
}

/** لون ثابت لاسم (للشارة البديلة لما مفيش لوجو) */
export function monoColor(name) {
  const cols = ['#2f5ea8', '#e5762c', '#c1121f', '#2a9d8f', '#6a4c93', '#f0b43c', '#264653', '#d62828'];
  let h = 0; for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return cols[h % cols.length];
}
