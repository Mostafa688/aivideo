// ── visualPick.js ── الشورتس (9:16): موديل رؤية بيبص على اللقطات المرشحة نفسها (مقصوصة زي ما هتظهر على الموبايل)
// ويختار اللي بتعرض كلام الجملة فعلًا. الترتيب بالنص لوحده (عنوان/تاجات) كان بيجيب لقطات بعيدة عن الكلام أو موضوعها مقصوص.
import sharp from 'sharp';
import { groqVision } from '../visionService.js';

const TW = 216, TH = 384, PAD = 10, PER_ROW = 4, ROWS = 4;

async function fetchThumb(url, timeoutMs = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'User-Agent': 'ErivionDocBot/1.0' } });
  if (!res.ok) throw new Error(`thumb ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return sharp(buf, { failOn: 'none' }).resize(TW, TH, { fit: 'cover', position: 'attention' }).jpeg({ quality: 78 }).toBuffer();
}

const badge = (n) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TW}" height="${TH}"><circle cx="30" cy="30" r="22" fill="#000" fill-opacity=".75" stroke="#fff" stroke-width="3"/><text x="30" y="40" font-family="DejaVu Sans" font-weight="700" font-size="28" fill="#fff" text-anchor="middle">${n}</text></svg>`);
const rowTag = (r) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="70" height="${TH}"><rect width="70" height="${TH}" fill="#1b1b22"/><text x="35" y="${TH / 2 + 14}" font-family="DejaVu Sans" font-weight="700" font-size="36" fill="#ffd60a" text-anchor="middle">R${r}</text></svg>`);

/** لوحة: كل صف = جملة، وفيه لحد 4 لقطات مرقّمة */
async function buildSheet(rows, getThumb) {
  const W = 70 + PER_ROW * (TW + PAD) + PAD, H = rows.length * (TH + PAD) + PAD;
  const comps = [];
  const kept = [];
  for (let r = 0; r < rows.length; r++) {
    const y = PAD + r * (TH + PAD);
    comps.push({ input: rowTag(r + 1), left: 0, top: y });
    const shown = [];
    for (const c of rows[r].cands) {
      if (shown.length >= PER_ROW) break;
      let img; try { img = await getThumb(c.thumb); } catch { continue; }
      const x = 70 + PAD + shown.length * (TW + PAD);
      comps.push({ input: img, left: x, top: y }, { input: badge(shown.length + 1), left: x, top: y });
      shown.push(c);
    }
    kept.push(shown);
  }
  const buf = await sharp({ create: { width: W, height: H, channels: 3, background: '#0d0d12' } }).composite(comps).jpeg({ quality: 80 }).toBuffer();
  return { dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}`, kept };
}

const SYSTEM = `You are the picture editor of a vertical (9:16) documentary short for TikTok/Reels/Shorts. Each row R1, R2… of the image shows up to 4 numbered candidate shots exactly as they will appear cropped on a phone, for one narration line. For each row pick the number of the shot that most concretely SHOWS what that line says (the right subject, action, place, era) with the subject clearly visible and not cut off by the crop. Reject shots that are unrelated, generic filler, blurry, mostly text/logos/watermarks, or show something that contradicts the line. If none fits, answer 0. Return ONLY JSON: {"rows":[{"r":1,"pick":2}]}`;

/**
 * items: [{i, text, cands:[{id, thumb,...}]}] (المرشحين بالترتيب الحالي)
 * بيرجّع Map(i → {pick: candidateId | null, shown: [ids]}) — pick null يعني ولا لقطة من اللي اتعرضت تنفع
 */
export async function visualPick(items, deps = {}) {
  const ask = deps.vision || groqVision;
  const getThumb = deps.fetchThumb || fetchThumb;
  const budgetMs = deps.budgetMs ?? 180000;
  const t0 = Date.now();
  const out = new Map();
  const rows = items.map(it => ({ ...it, cands: it.cands.filter(c => c.thumb && /^https?:/.test(c.thumb)).slice(0, PER_ROW + 2) })).filter(it => it.cands.length >= 2);
  let fails = 0;
  for (let from = 0; from < rows.length; from += ROWS) {
    if (Date.now() - t0 > budgetMs || fails >= 2) break;
    const chunk = rows.slice(from, from + ROWS);
    try {
      const { dataUrl, kept } = await buildSheet(chunk, getThumb);
      const lines = chunk.map((it, r) => `R${r + 1}: "${String(it.text).slice(0, 220)}" (${kept[r].length} shots)`).join('\n');
      const res = await ask({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: [{ type: 'text', text: `Narration lines:\n${lines}\nJSON only.` }, { type: 'image_url', image_url: { url: dataUrl } }] }], max_tokens: 300, temperature: 0 }, { timeoutMs: 40000 });
      const txt = String(res?.choices?.[0]?.message?.content || '');
      const j = JSON.parse((txt.match(/\{[\s\S]*\}/) || ['{}'])[0]);
      for (const x of Array.isArray(j.rows) ? j.rows : []) {
        const r = Number(x.r) - 1, n = Number(x.pick);
        const it = chunk[r]; if (!it || !kept[r]?.length) continue;
        out.set(it.i, { pick: n >= 1 && n <= kept[r].length ? kept[r][n - 1].id : null, shown: kept[r].map(c => c.id) });
      }
    } catch (e) { fails++; console.warn('[Documentary/visualPick] batch failed:', e.message); }
  }
  return out;
}

/** ترتيب جديد: اللقطة اللي اتختارت بالعين الأول؛ لو ولا واحدة نفعت، اللي اتشافت ورفضت بتتأخر لآخر القائمة */
export function applyVisualPick(list, v) {
  if (!v) return list;
  if (v.pick) { const c = list.find(x => x.id === v.pick); return c ? [c, ...list.filter(x => x !== c)] : list; }
  const rejected = new Set(v.shown);
  return [...list.filter(x => !rejected.has(x.id)), ...list.filter(x => rejected.has(x.id))];
}
