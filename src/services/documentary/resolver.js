// ── resolver.js ── لكل beat: بحث في المصادر → ترتيب بالـLLM (مع بديل heuristic) → تنزيل أول مرشح شغّال
import path from 'path';
import { searchCandidates, materialize, fetchAsset } from './sources/index.js';
import { llmJson } from './llm.js';
import { fallbackBeatPlan } from './planner.js';

async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (i < items.length) { const idx = i++; await fn(items[idx], idx); } }));
}

const STOP = new Set('the a an and or of in on at to for with from by as is was were are be been it this that these those his her their its into over about after before than then them they he she we you i'.split(' '));
const toks = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2 && !STOP.has(w));

export function scoreCandidate(c, beatText, queries, { wantKind = 'either', used = new Set() } = {}) {
  const hay = new Set(toks(`${c.title} ${c.description}`));
  const qTok = new Set(toks((queries || []).join(' ')));
  const bTok = new Set(toks(beatText));
  let s = 0;
  qTok.forEach(t => { if (hay.has(t)) s += 3; });
  bTok.forEach(t => { if (hay.has(t)) s += 1; });
  if (wantKind !== 'either' && c.kind === wantKind) s += 2;
  if (c.kind === 'video' && (c.width || 0) >= 1280) s += 1;
  if (c.kind === 'image' && (c.width || 0) >= 1600) s += 1;
  if (c.source === 'wikimedia' || c.source === 'archive' || c.source === 'nasa') s += 0.5;
  if (used.has(c.id)) s -= 6;
  return s;
}

const kindsFor = (plan, group) => {
  if (plan.kind === 'video') return ['video'];
  if (plan.kind === 'image') return ['image'];
  return ['video', 'image'];
};

async function llmRank(items, deps) {
  const ask = deps.llmJson || llmJson;
  const picks = new Map();
  const CH = 8;
  for (let from = 0; from < items.length; from += CH) {
    const chunk = items.slice(from, from + CH);
    const user = chunk.map(it => `Beat [${it.i}]: "${it.text}"\nCandidates:\n` + it.cands.slice(0, 8).map(c => `- ${c.id} | ${c.kind} | ${String(c.title).slice(0, 80)} | ${String(c.description).slice(0, 110)}`).join('\n')).join('\n\n');
    try {
      const r = await ask({
        system: 'You pick the best photo/video for each documentary narration beat. For each beat choose up to 3 candidate ids that visually match what the sentence says (right subject, place, era, mood), best first. Prefer concrete matches over generic ones; skip candidates that show something unrelated or contradictory. Return ONLY JSON: {"picks":[{"i":0,"ids":["id1","id2"]}]}. Use [] if nothing fits.',
        user, maxTokens: 1500, temperature: 0.1,
      });
      for (const p of r.picks || []) picks.set(Number(p.i), Array.isArray(p.ids) ? p.ids : []);
    } catch (e) { console.warn('[Documentary/resolver] LLM ranking failed:', e.message); }
  }
  return picks;
}

/**
 * @returns {{assets: Array<null|{file,kind,width,height,duration,credit,license,source,pageUrl}>, credits: string[]}}
 */
export async function resolveAssets({ beats, plans, ratio = '16:9', assetsDir, onProgress = () => {}, concurrency = 4 }, deps = {}) {
  const orientation = ratio === '9:16' ? 'portrait' : 'landscape';
  const search = deps.searchCandidates || searchCandidates;
  const mat = deps.materialize || materialize;
  const fetchOne = deps.fetchAsset || fetchAsset;
  const used = new Set();
  const need = beats.map((b, i) => ({ b, i, plan: plans[i] })).filter(x => x.plan.visual !== 'text');
  let done = 0;

  // A) بحث
  const found = new Map();
  await pool(need, concurrency, async ({ b, i, plan }) => {
    const group = plan.visual === 'archive' ? 'archive' : plan.visual === 'nasa' ? 'nasa' : 'stock';
    let cands = [];
    for (const q of plan.queries) {
      const r = await search(q, { group, kinds: kindsFor(plan, group), orientation }, deps.searchDeps);
      cands.push(...r);
      if (cands.length >= 6) break;
    }
    if (cands.length < 2 && group !== 'stock') { // أرشيف مالقاش كفاية → ستوك عام
      const r = await search(plan.queries[plan.queries.length - 1] || fallbackBeatPlan(b).queries[0], { group: 'stock', kinds: ['video', 'image'], orientation }, deps.searchDeps);
      cands.push(...r);
    }
    const seen = new Set();
    cands = cands.filter(c => (seen.has(c.id) ? false : seen.add(c.id)));
    cands.sort((x, y) => scoreCandidate(y, b.text, plan.queries, { wantKind: plan.kind, used }) - scoreCandidate(x, b.text, plan.queries, { wantKind: plan.kind, used }));
    found.set(i, cands);
    onProgress({ stage: 'search', done: ++done, total: need.length });
  });

  // B) ترتيب بالـLLM
  const rankInput = need.map(({ b, i }) => ({ i, text: b.text, cands: found.get(i) || [] })).filter(x => x.cands.length > 1);
  const picks = deps.skipLlmRank ? new Map() : await llmRank(rankInput, deps);
  const ordered = new Map();
  for (const { i } of need) {
    const cands = found.get(i) || [];
    const first = (picks.get(i) || []).map(id => cands.find(c => c.id === id)).filter(Boolean);
    ordered.set(i, [...first, ...cands.filter(c => !first.includes(c))].slice(0, 8));
  }

  // C) تنزيل (أول مرشح شغّال)، بدون تكرار نفس الأصل
  const assets = new Array(beats.length).fill(null);
  done = 0;
  await pool(need, concurrency, async ({ b, i, plan }) => {
    const list = ordered.get(i) || [];
    let tries = 0;
    for (const c0 of list) {
      if (tries >= 4) break;
      if (used.has(c0.id)) continue;
      tries++;
      try {
        const c = await mat(c0, deps.searchDeps);
        if (!c?.url) continue;
        const a = await fetchOne(c, path.join(assetsDir, String(i)), { clipSeconds: Math.max(4, b.dur) });
        used.add(c0.id);
        assets[i] = { ...a, credit: c.credit, license: c.license, source: c.source, pageUrl: c.pageUrl, title: c.title };
        break;
      } catch (e) {
        console.warn(`[Documentary/resolver] beat ${i}: ${c0.id} failed — ${e.message}`);
      }
    }
    onProgress({ stage: 'assets', done: ++done, total: need.length });
  });

  const credits = [...new Set(assets.filter(a => a && a.license?.attributionRequired).map(a => a.credit))];
  const allCredits = [...new Set(assets.filter(Boolean).map(a => a.credit))];
  return { assets, credits, allCredits };
}
