// ── promo.js ── عرض/خصم مؤقت على باقات مصر: السيرفر هو المصدر (وقت البداية/النهاية الحقيقيين)، والفرونت بيعرض ويعدّ تنازلي
import { useEffect, useState } from 'react';

const EGP_PER_CREDIT = 0.7;
let state = { loaded: false, promo: null, offset: 0 };
const listeners = new Set();
let started = false;

let loading = false;
async function load() {
  if (loading) return; loading = true;
  try {
    const d = await (await fetch('/api/auth/promo')).json();
    state = { loaded: true, promo: d.active ? { percent: d.percent, endsAt: new Date(d.endsAt).getTime() } : null, offset: d.serverNow ? new Date(d.serverNow).getTime() - Date.now() : 0 };
  } catch { state = { ...state, loaded: true }; }
  loading = false;
  listeners.forEach(f => f());
}
function start() { if (started) return; started = true; load(); setInterval(load, 5 * 60 * 1000); }
start();

/** العرض الشغال دلوقتي (أو null) — بنفس ساعة السيرفر */
export function getPromo() {
  const p = state.promo;
  return p && Date.now() + state.offset < p.endsAt ? p : null;
}

/** نفس معادلة السيرفر بالظبط: سعر الكريديت بالجنيه + خصم ٪ بيتقرّب لأقرب 10 جنيه لتحت (420→290، 980→680، 2100→1470) */
export function egPrice(credits, promo = null) {
  const base = Math.round(Number(credits) * EGP_PER_CREDIT);
  if (!promo?.percent) return base;
  return Math.max(10, Math.floor((base * (100 - promo.percent)) / 100 / 10) * 10);
}

/** hook: { promo, remainingMs } بيتحدّث كل ثانية، ولما العرض يخلص بيرجع null */
export function usePromo() {
  const [, force] = useState(0);
  useEffect(() => {
    const on = () => force(x => x + 1);
    listeners.add(on);
    const t = setInterval(() => { on(); if (state.promo && Date.now() + state.offset >= state.promo.endsAt) load(); }, 1000); // خلص التايمر → السيرفر بيبدأ دورة 24 ساعة جديدة، نجيبها فورًا
    return () => { listeners.delete(on); clearInterval(t); };
  }, []);
  const promo = getPromo();
  return { promo, remainingMs: promo ? Math.max(0, promo.endsAt - (Date.now() + state.offset)) : 0 };
}

export function formatRemaining(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return [h, m, x].map(v => String(v).padStart(2, '0')).join(':');
}
