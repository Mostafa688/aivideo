// ── adix/motionKit.js ── موشن جرافيك الإعلانات (Adix): عناصر متحركة فوق الفيديو بيختارها Opus بعد ما يشوف الإعلان.
// كل عنصر بيترسم فريم فريم (SVG → PNG شفاف بـ sharp، العربي بخطوط Noto) وبيتركب على الفيديو بـ ffmpeg في وقته بالظبط.
// العناصر: headline (عنوان كلمة كلمة + كلمة مميزة) · callout (سهم/خط بيشاور على جزء من المنتج + كارت) · badge (عرض/سعر
// في نجمة بتلف) · lowerThird · stat (رقم بيعدّ) · checklist (مميزات بعلامات صح بتترسم) · captions (ترجمة كلمة بكلمة) ·
// flash (وميض انتقال) · endCard (شاشة نهاية كاملة: المنتج مقصوص + البراند + زرار CTA بينبض).
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { buildDesign, FONT_CHOICES } from './designKit.js';

export const OVERLAY_TYPES = ['design', 'headline', 'callout', 'badge', 'lowerThird', 'stat', 'checklist', 'captions', 'flash'];
const FPS = 30;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const P = (t, a, d) => clamp((t - a) / d);
const E = {
  out: (x) => 1 - Math.pow(1 - x, 3), out5: (x) => 1 - Math.pow(1 - x, 5), in: (x) => x * x * x,
  io: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  back: (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  el: (x) => (x === 0 ? 0 : x === 1 ? 1 : Math.pow(2, -9 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
const isAr = (s) => /[؀-ۿ]/.test(String(s || ''));
const FONT_AR = "'Noto Kufi Arabic','Noto Sans Arabic',sans-serif";
const FONT_LAT = "'Noto Sans','DejaVu Sans',sans-serif";
const fam = (s) => (isAr(s) ? FONT_AR : FONT_LAT);
// اتجاه النص: محرّك librsvg بيرتّب العربي (والأرقام جواه) صح لوحده — direction="rtl" بيقلب "0 سكر" لـ"سكر 0"، فمش بنستخدمه
const dirA = () => '';
// الحافة الفعلية اللي النص يتثبت عليها (start = الشمال)
const anc = (s, edge) => (edge === 'right' ? 'end' : 'start');

// قياس العرض الحقيقي بنفس الخط اللي بيترسم بيه (Pango عن طريق sharp) — عند حجم 100px
const MEASURE = new Map();
async function measure100(str, pango = null) {
  const k = pango ? `${pango}|${str}` : String(str); if (MEASURE.has(k)) return MEASURE.get(k);
  let w = 0;
  try { w = (await sharp({ text: { text: esc(String(str)), font: pango ? `${pango} 100` : `${isAr(str) ? 'Noto Kufi Arabic' : 'Noto Sans'} Bold 100`, rgba: true, dpi: 72 } }).metadata()).width || 0; } catch { w = 0; }
  if (!w) w = k.length * 58;
  MEASURE.set(k, w); return w;
}
async function makeMeasurer(words, pango = null) {
  const uniq = [...new Set(words.map(String).filter(Boolean))];
  await Promise.all(uniq.map((w) => measure100(w, pango)));
  const ar = uniq.some(isAr);
  const sp = Math.max(18, (await measure100(ar ? 'م م' : 'n n', pango)) - (await measure100(ar ? 'مم' : 'nn', pango)));
  const key = (w) => (pango ? `${pango}|${w}` : String(w));
  return { word: (w, size) => ((MEASURE.get(key(w)) ?? String(w).length * 58) * size) / 100, space: (size) => (sp * size) / 100 };
}
const hexOk = (c, d) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : d);
// لون مقروء فوق لون الخلفية
const onColor = (hex) => { const n = parseInt(hex.slice(1), 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? '#0d0b14' : '#ffffff'; };

const DEFS = (accent) => `<defs>
  <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000" flood-opacity="0.55"/></filter>
  <filter id="shs" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.6"/></filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <linearGradient id="acc" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity="0.78"/></linearGradient>
  <linearGradient id="glass" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#16131f" stop-opacity="0.86"/><stop offset="1" stop-color="#0c0a12" stop-opacity="0.92"/></linearGradient>
</defs>`;

// تقسيم نص لسطور على عرض أقصى (بقياس حقيقي)
function wrap(words, mw, size, maxW) {
  const lines = []; let cur = []; let w = 0; const sp = mw.space(size);
  for (const wd of words) {
    const ww = mw.word(wd, size);
    if (cur.length && w + sp + ww > maxW) { lines.push(cur); cur = []; w = 0; }
    cur.push(wd); w += (cur.length > 1 ? sp : 0) + ww;
  }
  if (cur.length) lines.push(cur);
  return lines;
}

// ── العناصر: كل واحد بيرجّع دالة frame(t) → SVG (t من 0 لمدة العنصر) ──
async function headline(o, W, H, accent) {
  const text = String(o.text || '').trim(); const rtl = isAr(text);
  const words = text.split(/\s+/).filter(Boolean).slice(0, 14);
  const mw = await makeMeasurer(words);
  const maxW = W * 0.86; let size = Math.round(Math.min(W, H) * (o.size === 'xl' ? 0.12 : o.size === 's' ? 0.065 : 0.09));
  let lines = wrap(words, mw, size, maxW);
  while (lines.length > 3 && size > 30) { size = Math.round(size * 0.88); lines = wrap(words, mw, size, maxW); }
  const lh = size * 1.28; const hi = String(o.highlight || '').trim();
  const cy = (o.position === 'bottom' ? 0.74 : o.position === 'center' ? 0.47 : 0.17) * H;
  const top = cy - (lines.length * lh) / 2 + size * 0.82;
  const sp = mw.space(size);
  // مكان كل كلمة (يمين لشمال للعربي)
  const placed = []; let k = 0;
  lines.forEach((ln, li) => {
    const lw = ln.reduce((a, w, i) => a + mw.word(w, size) + (i ? sp : 0), 0);
    let x = rtl ? W / 2 + lw / 2 : W / 2 - lw / 2;
    ln.forEach((w) => { const ww = mw.word(w, size); const cx = rtl ? x - ww / 2 : x + ww / 2; placed.push({ w, cx, y: top + li * lh, ww, k: k++ }); x += rtl ? -(ww + sp) : ww + sp; });
  });
  const dur = o.end - o.start;
  return (t) => {
    const out = E.in(P(t, dur - 0.35, 0.35));
    let s = '';
    for (const p of placed) {
      const a = 0.06 + p.k * 0.075; const k1 = E.back(P(t, a, 0.42)); const op = clamp(P(t, a, 0.22)) * (1 - out);
      if (op <= 0.01) continue;
      const isHi = hi && hi.split(/\s+/).includes(p.w);
      const dy = (1 - clamp(k1)) * size * 0.55 - out * size * 0.5; const sc = 0.55 + 0.45 * k1;
      if (isHi) {
        const kp = E.out5(P(t, a + 0.12, 0.35)); const pw = (p.ww + size * 0.36) * kp;
        const px = rtl ? p.cx + (p.ww + size * 0.36) / 2 - pw : p.cx - (p.ww + size * 0.36) / 2;
        s += `<rect x="${px.toFixed(1)}" y="${(p.y - size * 0.92 + dy).toFixed(1)}" width="${pw.toFixed(1)}" height="${(size * 1.22).toFixed(1)}" rx="${(size * 0.22).toFixed(1)}" fill="url(#acc)" opacity="${op.toFixed(2)}" transform="rotate(-2 ${p.cx.toFixed(1)} ${p.y.toFixed(1)})"/>`;
      }
      s += `<g transform="translate(${p.cx.toFixed(1)} ${(p.y + dy).toFixed(1)}) scale(${sc.toFixed(3)})" opacity="${op.toFixed(2)}"><text x="0" y="0" text-anchor="middle" font-family="${fam(p.w)}"${dirA(p.w)} font-size="${size}" font-weight="700" fill="${isHi ? onColor(accent) : '#ffffff'}" ${isHi ? '' : 'filter="url(#sh)"'}>${esc(p.w)}</text></g>`;
    }
    return s;
  };
}

async function callout(o, W, H, accent) {
  const ax = clamp(Number(o.x ?? 0.5), 0.05, 0.95) * W, ay = clamp(Number(o.y ?? 0.5), 0.08, 0.92) * H;
  const text = String(o.text || '').trim(); const sub = String(o.sub || '').trim();
  const size = Math.round(Math.min(W, H) * 0.062); const ssz = Math.round(size * 0.66);
  const mw = await makeMeasurer([text, sub].filter(Boolean));
  const tw = Math.max(mw.word(text, size), sub ? mw.word(sub, ssz) * 0.95 : 0);
  const cw = Math.min(W * 0.62, tw + size * 1.4), ch = sub ? size * 2.45 : size * 1.65;
  const right = ax < W / 2; // الكارت على الناحية الفاضية
  const ex = right ? Math.min(W - cw - W * 0.05, ax + W * 0.16) : Math.max(W * 0.05 + cw, ax - W * 0.16);
  const ey = ay < H * 0.5 ? ay + H * 0.1 : ay - H * 0.1;
  const cx0 = right ? ex : ex - cw; const cy0 = ey - ch / 2;
  const elbowX = right ? ex - size * 0.6 : ex + size * 0.6;
  const pathD = `M${ax.toFixed(1)} ${ay.toFixed(1)} L${elbowX.toFixed(1)} ${ey.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}`;
  const len = Math.hypot(elbowX - ax, ey - ay) + Math.abs(ex - elbowX);
  const dur = o.end - o.start;
  return (t) => {
    const out = 1 - E.in(P(t, dur - 0.3, 0.3)); if (out <= 0.01) return '';
    const kd = E.back(P(t, 0, 0.3)); const kl = E.io(P(t, 0.12, 0.45)); const kc = E.back(P(t, 0.42, 0.45));
    const pulse = (t * 1.3) % 1;
    let s = `<g opacity="${out.toFixed(2)}">`;
    s += `<circle cx="${ax}" cy="${ay}" r="${(size * (0.4 + pulse * 1.3)).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="3" opacity="${(0.8 * (1 - pulse)).toFixed(2)}"/>`;
    s += `<circle cx="${ax}" cy="${ay}" r="${(size * 0.26 * clamp(kd)).toFixed(1)}" fill="#fff" stroke="${accent}" stroke-width="5" filter="url(#shs)"/>`;
    s += `<path d="${pathD}" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="${len.toFixed(1)}" stroke-dashoffset="${((1 - kl) * len).toFixed(1)}" filter="url(#shs)"/>`;
    if (kc > 0.01) {
      const sc = 0.4 + 0.6 * kc; const ox = right ? cx0 : cx0 + cw;
      s += `<g transform="translate(${ox.toFixed(1)} ${ey.toFixed(1)}) scale(${sc.toFixed(3)}) translate(${(-ox).toFixed(1)} ${(-ey).toFixed(1)})" opacity="${clamp(kc).toFixed(2)}">`;
      s += `<rect x="${cx0.toFixed(1)}" y="${cy0.toFixed(1)}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}" rx="${(size * 0.32).toFixed(1)}" fill="#ffffff" fill-opacity="0.95" filter="url(#sh)"/>`;
      s += `<rect x="${(isAr(text) ? cx0 + cw - size * 0.22 : cx0).toFixed(1)}" y="${cy0.toFixed(1)}" width="${(size * 0.22).toFixed(1)}" height="${ch.toFixed(1)}" rx="${(size * 0.11).toFixed(1)}" fill="${accent}"/>`;
      const tx = cx0 + cw / 2; const ty = sub ? cy0 + size * 1.12 : cy0 + ch / 2 + size * 0.36;
      s += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" font-family="${fam(text)}"${dirA(text)} font-size="${size}" font-weight="700" fill="#100d18">${esc(text)}</text>`;
      if (sub) s += `<text x="${tx.toFixed(1)}" y="${(cy0 + size * 1.98).toFixed(1)}" text-anchor="middle" font-family="${fam(sub)}"${dirA(sub)} font-size="${ssz}" font-weight="600" fill="#5b5670">${esc(sub)}</text>`;
      s += '</g>';
    }
    return s + '</g>';
  };
}

async function badge(o, W, H, accent) {
  const big = String(o.text || '').trim(); const small = String(o.sub || '').trim();
  const R = Math.min(W, H) * (o.size === 's' ? 0.13 : 0.17);
  const pos = o.position || 'top-right';
  const cx = pos.includes('left') ? W * 0.05 + R * 1.15 : pos.includes('center') ? W / 2 : W * 0.95 - R * 1.15;
  const cy = pos.includes('bottom') ? H * 0.74 : pos.includes('mid') ? H * 0.45 : H * 0.12 + R * 1.15;
  const mw = await makeMeasurer([big, small].filter(Boolean));
  const bsize = Math.min(R * 0.62, (R * 1.5 / Math.max(1, mw.word(big, 100))) * 100); const ssize = R * 0.24;
  const pts = []; for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; const r = i % 2 ? R * 0.86 : R; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  const star = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('') + 'Z';
  const dur = o.end - o.start; const fg = onColor(accent);
  return (t) => {
    const out = 1 - E.in(P(t, dur - 0.28, 0.28)); if (out <= 0.01) return '';
    const k = E.el(P(t, 0, 0.75)); const rot = -18 * (1 - E.out(P(t, 0, 0.6))) + Math.sin(t * 2.4) * 3.5;
    return `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${(k * out).toFixed(3)})">
      <path d="${star}" fill="${accent}" transform="rotate(${(t * 14).toFixed(1)})" filter="url(#sh)"/>
      <circle r="${(R * 0.8).toFixed(1)}" fill="none" stroke="${fg}" stroke-opacity="0.35" stroke-width="3" stroke-dasharray="6 9"/>
      <text x="0" y="${(small ? bsize * 0.18 : bsize * 0.36).toFixed(1)}" text-anchor="middle" font-family="${fam(big)}"${dirA(big)} font-size="${bsize.toFixed(1)}" font-weight="700" fill="${fg}">${esc(big)}</text>
      ${small ? `<text x="0" y="${(bsize * 0.18 + ssize * 1.35).toFixed(1)}" text-anchor="middle" font-family="${fam(small)}"${dirA(small)} font-size="${ssize.toFixed(1)}" font-weight="700" fill="${fg}" opacity="0.9">${esc(small)}</text>` : ''}
    </g>`;
  };
}

async function lowerThird(o, W, H, accent) {
  const title = String(o.text || '').trim(); const sub = String(o.sub || '').trim(); const rtl = isAr(title);
  const size = Math.round(Math.min(W, H) * 0.062); const ssz = Math.round(size * 0.62);
  const mw = await makeMeasurer([title, sub].filter(Boolean));
  const bw = Math.min(W * 0.84, Math.max(mw.word(title, size), sub ? mw.word(sub, ssz) : 0) + size * 1.6); const bh = sub ? size * 2.5 : size * 1.7;
  const y = H * (H > W ? 0.66 : 0.76); const x = rtl ? W * 0.95 - bw : W * 0.05;
  const dur = o.end - o.start;
  return (t) => {
    const out = 1 - E.in(P(t, dur - 0.3, 0.3)); if (out <= 0.01) return '';
    const ka = E.out5(P(t, 0, 0.35)); const kb = E.out5(P(t, 0.12, 0.5)); const kt = E.out(P(t, 0.3, 0.45));
    const ax = rtl ? x + bw - size * 0.3 : x; const bwN = bw * kb;
    const bx = rtl ? x + bw - bwN : x;
    let s = `<g opacity="${out.toFixed(2)}">`;
    s += `<rect x="${bx.toFixed(1)}" y="${y.toFixed(1)}" width="${bwN.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(size * 0.25).toFixed(1)}" fill="url(#glass)" filter="url(#sh)"/>`;
    s += `<rect x="${ax.toFixed(1)}" y="${(y + bh * (1 - ka)).toFixed(1)}" width="${(size * 0.3).toFixed(1)}" height="${(bh * ka).toFixed(1)}" rx="${(size * 0.12).toFixed(1)}" fill="${accent}"/>`;
    const tx = rtl ? x + bw - size * 0.75 : x + size * 0.75; const anchor = rtl ? 'end' : 'start'; const off = (1 - kt) * size * (rtl ? 1 : -1);
    s += `<text x="${(tx + off).toFixed(1)}" y="${(y + (sub ? size * 1.15 : bh / 2 + size * 0.36)).toFixed(1)}" text-anchor="${anc(title, anchor === 'end' ? 'right' : 'left')}" font-family="${fam(title)}"${dirA(title)} font-size="${size}" font-weight="700" fill="#fff" opacity="${kt.toFixed(2)}">${esc(title)}</text>`;
    if (sub) s += `<text x="${(tx + off).toFixed(1)}" y="${(y + size * 1.95).toFixed(1)}" text-anchor="${anc(sub, anchor === 'end' ? 'right' : 'left')}" font-family="${fam(sub)}"${dirA(sub)} font-size="${ssz}" font-weight="600" fill="${accent}" opacity="${kt.toFixed(2)}">${esc(sub)}</text>`;
    return s + '</g>';
  };
}

async function stat(o, W, H, accent) {
  const raw = String(o.text || '').trim(); const label = String(o.sub || '').trim();
  const m = /([^0-9٠-٩]*)([0-9٠-٩][0-9٠-٩.,]*)(.*)/.exec(raw); const toLat = (s) => s.replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const pre = m ? m[1] : ''; const numStr = m ? toLat(m[2]).replace(/,/g, '') : ''; const post = m ? m[3] : raw; const target = Number(numStr) || 0; const dec = (numStr.split('.')[1] || '').length;
  const size = Math.round(Math.min(W, H) * 0.16); const lsz = Math.round(size * 0.3);
  const cx = W * (o.x != null ? clamp(Number(o.x), 0.15, 0.85) : 0.5); const cy = H * (o.position === 'bottom' ? 0.7 : o.position === 'center' ? 0.45 : 0.22);
  const dur = o.end - o.start;
  return (t) => {
    const out = 1 - E.in(P(t, dur - 0.3, 0.3)); if (out <= 0.01) return '';
    const kc = E.out5(P(t, 0.05, Math.min(1.1, dur * 0.5))); const ki = E.back(P(t, 0, 0.4));
    const val = target ? (target * kc).toFixed(dec) : '';
    const txt = target ? `${pre}${val}${post}` : raw;
    const ku = E.io(P(t, 0.3, 0.5));
    return `<g opacity="${out.toFixed(2)}" transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) scale(${(0.6 + 0.4 * ki).toFixed(3)})">
      <text x="0" y="0" text-anchor="middle" font-family="${fam(txt)}"${dirA(txt)} font-size="${size}" font-weight="700" fill="#fff" filter="url(#sh)">${esc(txt)}</text>
      <rect x="${(-size * 1.2 * ku).toFixed(1)}" y="${(size * 0.22).toFixed(1)}" width="${(size * 2.4 * ku).toFixed(1)}" height="${(size * 0.07).toFixed(1)}" rx="${(size * 0.035).toFixed(1)}" fill="${accent}"/>
      ${label ? `<text x="0" y="${(size * 0.22 + lsz * 1.6).toFixed(1)}" text-anchor="middle" font-family="${fam(label)}"${dirA(label)} font-size="${lsz}" font-weight="700" fill="#fff" opacity="${ku.toFixed(2)}" filter="url(#shs)">${esc(label)}</text>` : ''}
    </g>`;
  };
}

async function checklist(o, W, H, accent) {
  const items = (Array.isArray(o.items) ? o.items : String(o.text || '').split('|')).map((x) => String(x).trim()).filter(Boolean).slice(0, 4);
  const rtl = isAr(items.join(' ')); const size = Math.round(Math.min(W, H) * 0.058);
  const mw = await makeMeasurer(items);
  const rowH = size * 1.9; const iw = Math.min(W * 0.8, Math.max(...items.map((it) => mw.word(it, size))) + size * 2.6);
  const ph = rowH * items.length + size * 0.8; const px = rtl ? W * 0.95 - iw : W * 0.05; const py = (o.position === 'bottom' ? 0.62 : o.position === 'top' ? 0.12 : 0.38) * H;
  const dur = o.end - o.start; const stagger = Math.min(0.45, (dur - 1) / Math.max(1, items.length));
  return (t) => {
    const out = 1 - E.in(P(t, dur - 0.3, 0.3)); if (out <= 0.01) return '';
    const kp = E.out5(P(t, 0, 0.4));
    let s = `<g opacity="${out.toFixed(2)}"><rect x="${(rtl ? px + iw * (1 - kp) : px).toFixed(1)}" y="${py.toFixed(1)}" width="${(iw * kp).toFixed(1)}" height="${ph.toFixed(1)}" rx="${(size * 0.4).toFixed(1)}" fill="url(#glass)" filter="url(#sh)"/>`;
    items.forEach((it, i) => {
      const a = 0.25 + i * stagger; const kr = E.out(P(t, a, 0.35)); if (kr <= 0.01) return;
      const yy = py + size * 0.4 + rowH * i + rowH / 2; const cxk = rtl ? px + iw - size * 1.1 : px + size * 1.1;
      const kk = E.io(P(t, a + 0.12, 0.3));
      s += `<circle cx="${cxk.toFixed(1)}" cy="${yy.toFixed(1)}" r="${(size * 0.58 * E.back(P(t, a, 0.35))).toFixed(1)}" fill="${accent}"/>`;
      s += `<path d="M${(cxk - size * 0.26).toFixed(1)} ${yy.toFixed(1)} L${(cxk - size * 0.06).toFixed(1)} ${(yy + size * 0.2).toFixed(1)} L${(cxk + size * 0.28).toFixed(1)} ${(yy - size * 0.2).toFixed(1)}" fill="none" stroke="${onColor(accent)}" stroke-width="${(size * 0.13).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${(size).toFixed(1)}" stroke-dashoffset="${((1 - kk) * size).toFixed(1)}"/>`;
      const tx = rtl ? cxk - size * 0.95 : cxk + size * 0.95; const off = (1 - kr) * size * (rtl ? -0.8 : 0.8);
      s += `<text x="${(tx - off).toFixed(1)}" y="${(yy + size * 0.36).toFixed(1)}" text-anchor="${anc(it, rtl ? 'right' : 'left')}" font-family="${fam(it)}"${dirA(it)} font-size="${size}" font-weight="700" fill="#fff" opacity="${kr.toFixed(2)}">${esc(it)}</text>`;
    });
    return s + '</g>';
  };
}

// ترجمة كلمة بكلمة: words = [{w,start,end}] (توقيت مطلق) — o.start/o.end نطاق الظهور
async function captions(o, W, H, accent, ctx) {
  const words = (ctx.words || []).filter((w) => w.end > o.start && w.start < o.end);
  if (!words.length) return () => '';
  const rtl = isAr(words.map((w) => w.w).join(' '));
  const cs = o.style || {}; const F = FONT_CHOICES[cs.font] || null;
  const family = F ? F.ar : null; const weight = F ? F.w : 700;
  const size = Math.round(Math.min(W, H) * (cs.size || 0.068)); const mw = await makeMeasurer(words.map((w) => w.w), F ? F.pango : null);
  const maxWords = cs.maxWords || 4; const hlColor = cs.highlight || accent; const baseColor = cs.color || '#fff'; const capStyle = cs.style || 'box';
  // مجموعات 2-4 كلمات على قد العرض
  const groups = []; let cur = [];
  for (const w of words) {
    // سكتة طويلة بين كلمتين = مجموعة جديدة (مايظهرش كلام جاي بعد ثواني قبل وقته)
    if (cur.length && w.start - cur[cur.length - 1].end > 0.5) { groups.push(cur); cur = []; }
    cur.push(w); const width = cur.reduce((a, x) => a + mw.word(x.w, size), 0) + mw.space(size) * (cur.length - 1); if (cur.length >= maxWords || width > W * 0.78 || /[.!?؟،,]$/.test(w.w)) { groups.push(cur); cur = []; } }
  if (cur.length) groups.push(cur);
  const y = H * (cs.y || (H > W ? 0.7 : 0.84));
  return (t) => {
    const at = o.start + t;
    if ((ctx.busy || []).some(([a, b]) => at >= a && at <= b)) return ''; // في عنصر تاني تحت (lowerThird…) — الترجمة تختفي ماتتخبطش فيه
    const g = groups.find((gr) => at >= gr[0].start - 0.05 && at <= gr[gr.length - 1].end + 0.15); if (!g) return '';
    const sp = mw.space(size); const tw = g.reduce((a, x) => a + mw.word(x.w, size), 0) + sp * (g.length - 1);
    let x = rtl ? W / 2 + tw / 2 : W / 2 - tw / 2; let s = '';
    const kin = E.back(P(at, g[0].start - 0.05, 0.22));
    for (const w of g) {
      const ww = mw.word(w.w, size); const cx = rtl ? x - ww / 2 : x + ww / 2; const on = at >= w.start && at <= w.end + 0.08;
      if (on && capStyle === 'box') s += `<rect x="${(cx - ww / 2 - size * 0.18).toFixed(1)}" y="${(y - size * 0.95).toFixed(1)}" width="${(ww + size * 0.36).toFixed(1)}" height="${(size * 1.25).toFixed(1)}" rx="${(size * 0.2).toFixed(1)}" fill="${hlColor}"/>`;
      const fillC = on ? (capStyle === 'box' ? onColor(hlColor) : capStyle === 'color' ? hlColor : baseColor) : baseColor;
      s += `<text x="${cx.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${family || fam(w.w)}"${dirA(w.w)} font-size="${size}" font-weight="${weight}" fill="${fillC}" stroke="#000" stroke-opacity="${on && capStyle === 'box' ? 0 : 0.55}" stroke-width="${(size * 0.07).toFixed(1)}" paint-order="stroke">${esc(w.w)}</text>`;
      x += rtl ? -(ww + sp) : ww + sp;
    }
    return `<g transform="translate(${W / 2} ${y}) scale(${(0.85 + 0.15 * kin).toFixed(3)}) translate(${-W / 2} ${-y})">${s}</g>`;
  };
}

async function flash(o, W, H) {
  const dur = o.end - o.start;
  return (t) => {
    const k = Math.sin(Math.PI * clamp(t / dur)); if (k <= 0.01) return '';
    return `<defs><radialGradient id="lf" cx="${o.x ?? 0.7}" cy="${o.y ?? 0.3}" r="0.9"><stop offset="0" stop-color="#fff6e0" stop-opacity="${(0.95 * k).toFixed(2)}"/><stop offset="0.45" stop-color="#ffb36b" stop-opacity="${(0.45 * k).toFixed(2)}"/><stop offset="1" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#lf)"/>`;
  };
}

const BUILDERS = { design: buildDesign, headline, callout, badge, lowerThird, stat, checklist, captions, flash };

/** بيرسم عنصر واحد لفريمات PNG شفافة في dir — بيرجّع { pattern, start, end } */
export async function renderOverlay(o, { W, H, accent = '#ff3d6e', dir, ctx = {} }) {
  const build = BUILDERS[o.type]; if (!build) return null;
  const acc = hexOk(o.accent || accent, '#ff3d6e');
  const frame = await build(o, W, H, acc, ctx);
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.max(1, Math.round((o.end - o.start) * FPS));
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < n) {
      const i = next++;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS(acc)}${frame(i / FPS)}</svg>`;
      await sharp(Buffer.from(svg)).png({ compressionLevel: 1 }).toFile(path.join(dir, `${String(i).padStart(5, '0')}.png`));
    }
  }));
  return { pattern: path.join(dir, '%05d.png'), start: o.start, end: o.end, frames: n };
}

/** شاشة النهاية: خلفية (فريم مضبّب من الإعلان) + المنتج مقصوص بيطفو + البراند + زرار CTA بينبض */
export async function renderEndCard(card, { W, H, accent = '#ff3d6e', bgFile, productPng = null, dir, seconds = 2.6 }) {
  fs.mkdirSync(dir, { recursive: true });
  const acc = hexOk(card.accent || accent, '#ff3d6e');
  const bg = await sharp(bgFile).resize(W, H, { fit: 'cover' }).blur(28).modulate({ brightness: 0.55, saturation: 1.15 }).jpeg().toBuffer();
  const bgRaw = await sharp(bg).raw().toBuffer();
  let prod = null;
  if (productPng && fs.existsSync(productPng)) {
    const meta = await sharp(productPng).metadata(); const maxW = W * 0.62, maxH = H * (H > W ? 0.42 : 0.5);
    const sc = Math.min(maxW / meta.width, maxH / meta.height);
    const w = Math.round(meta.width * sc), h = Math.round(meta.height * sc); const pad = Math.round(Math.max(w, h) * 0.12);
    // الظل بيتعمل مرة واحدة على صورة المنتج بالحجم النهائي (بدل فلتر blur على كل فريم)
    const small = await sharp(productPng).resize(w, h, { fit: 'fill' }).png().toBuffer();
    const shadow = await sharp(small).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha().linear([0, 0, 0, 0.55], [0, 0, 0, 0]).blur(Math.max(4, pad / 3)).png().toBuffer();
    const baked = await sharp(shadow).composite([{ input: small, left: pad, top: Math.round(pad * 0.6) }]).png().toBuffer();
    prod = { uri: `data:image/png;base64,${baked.toString('base64')}`, w: w + pad * 2, h: h + pad * 2 };
  }
  const brand = String(card.brand || card.text || '').trim(); const tag = String(card.tagline || card.sub || '').trim(); const cta = String(card.cta || '').trim(); const price = String(card.price || '').trim();
  const bsz = Math.round(Math.min(W, H) * 0.1), tsz = Math.round(bsz * 0.42), csz = Math.round(bsz * 0.4);
  const mw = await makeMeasurer([cta, brand].filter(Boolean));
  const ctaW = cta ? mw.word(cta, csz) + csz * 2.4 : 0;
  const portrait = H > W;
  const prodCy = portrait ? H * 0.36 : H * 0.42; const textY = portrait ? H * 0.66 : H * 0.78;
  const n = Math.round(seconds * FPS);
  const one = async (i) => {
    const t = i / FPS;
    const kp = E.back(P(t, 0.05, 0.6)); const fl = Math.sin(t * 2.2) * H * 0.008; const kb = E.out5(P(t, 0.3, 0.5)); const kt = E.out(P(t, 0.5, 0.5)); const kc = E.back(P(t, 0.75, 0.5));
    const pulse = 1 + 0.04 * Math.sin(Math.max(0, t - 1.2) * 7);
    let s = `<circle cx="${W / 2}" cy="${prodCy}" r="${(Math.min(W, H) * 0.34 * clamp(kp)).toFixed(1)}" fill="${acc}" opacity="0.28" filter="url(#glow)"/>`;
    if (prod) s += `<g transform="translate(${W / 2} ${(prodCy + fl).toFixed(1)}) scale(${(0.5 + 0.5 * kp).toFixed(3)})" opacity="${clamp(kp).toFixed(2)}"><image href="${prod.uri}" x="${(-prod.w / 2).toFixed(1)}" y="${(-prod.h / 2).toFixed(1)}" width="${prod.w.toFixed(1)}" height="${prod.h.toFixed(1)}"/></g>`;
    if (brand) s += `<text x="${W / 2}" y="${(textY + (1 - kb) * bsz * 0.6).toFixed(1)}" text-anchor="middle" font-family="${fam(brand)}"${dirA(brand)} font-size="${bsz}" font-weight="700" fill="#fff" opacity="${kb.toFixed(2)}" filter="url(#sh)">${esc(brand)}</text>`;
    if (tag) s += `<text x="${W / 2}" y="${(textY + bsz * 0.75).toFixed(1)}" text-anchor="middle" font-family="${fam(tag)}"${dirA(tag)} font-size="${tsz}" font-weight="600" fill="#fff" opacity="${(kt * 0.9).toFixed(2)}">${esc(tag)}</text>`;
    if (price) s += `<text x="${W / 2}" y="${(textY + bsz * 0.75 + tsz * 1.6).toFixed(1)}" text-anchor="middle" font-family="${fam(price)}"${dirA(price)} font-size="${tsz * 1.2}" font-weight="700" fill="${acc}" opacity="${kt.toFixed(2)}">${esc(price)}</text>`;
    if (cta) {
      const cy = textY + bsz * 0.75 + tsz * (price ? 3.6 : 2.2);
      s += `<g transform="translate(${W / 2} ${cy.toFixed(1)}) scale(${(clamp(kc) * pulse).toFixed(3)})" opacity="${clamp(kc).toFixed(2)}"><rect x="${(-ctaW / 2).toFixed(1)}" y="${(-csz * 1.05).toFixed(1)}" width="${ctaW.toFixed(1)}" height="${(csz * 2.1).toFixed(1)}" rx="${(csz * 1.05).toFixed(1)}" fill="${acc}" filter="url(#sh)"/><text x="0" y="${(csz * 0.36).toFixed(1)}" text-anchor="middle" font-family="${fam(cta)}"${dirA(cta)} font-size="${csz}" font-weight="700" fill="${onColor(acc)}">${esc(cta)}</text></g>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS(acc)}${s}</svg>`;
    const layer = await sharp(Buffer.from(svg)).png({ compressionLevel: 0 }).toBuffer();
    await sharp(bgRaw, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: layer }]).jpeg({ quality: 90 }).toFile(path.join(dir, `${String(i).padStart(5, '0')}.jpg`));
  };
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < n) await one(next++); }));
  return { pattern: path.join(dir, '%05d.jpg'), seconds };
}
