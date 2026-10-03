// ── svgTemplates.js ──────────────────────────────────────────────────────────
// قوالب الموشن جرافيك (زي route diagram/counter/bullet panel/evidence board عند GoMotion): كل قالب
// بيرجّع محتوى SVG لإطار واحد حسب الزمن t (ثواني من بداية القالب) — شفاف، بيتركّب فوق لقطة أو خلفية.
// بنرسم في مساحة بكسلات حقيقية (w×h) وأحجام الخط نسبية لأصغر بُعد (s = min(w,h)/1080)، فنفس القالب
// بيشتغل 16:9 و9:16. النصوص بتتلف بـwrapText، وبتدعم RTL (عربي) بقلب الاتجاهات.
import { esc, wrapText, textWidth, fontStack, fmtNumber } from './textutil.js';
import fs from 'fs';
import { clamp01, lerp, easeOutCubic, easeOutBack, easeOutExpo, easeInOutCubic, seg } from './easing.js';

const SHADOW_DEF = `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur in="SourceAlpha" stdDeviation="10"/><feOffset dy="8" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;

function ctx(w, h, theme, lang, rtl, opts = {}) {
  const s = Math.min(w, h) / 1080;
  return { w, h, s, theme, rtl, lang, ff: fontStack(lang, opts), portrait: h > w, cx: w / 2, cy: h / 2, outline: !!opts.outline };
}

const txt = (c, text, x, y, size, { weight = 800, fill, anchor = 'middle', opacity = 1, ls = 0, family, italic = false } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${family || c.ff}" font-size="${(size * c.s).toFixed(1)}" font-weight="${weight}" fill="${fill || c.theme.text}" text-anchor="${anchor}" opacity="${opacity.toFixed(3)}"${ls ? ` letter-spacing="${ls}"` : ''}${italic ? ' font-style="italic"' : ''}${c.outline ? ` stroke="rgba(0,0,0,0.88)" stroke-width="${Math.max(2, size * c.s * 0.1).toFixed(1)}" stroke-linejoin="round" paint-order="stroke"` : ''}>${esc(text)}</text>`;

const panel = (c, x, y, w, h, { r = 26, fill, stroke, strokeW = 2, opacity = 1 } = {}) =>
  `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(r * c.s).toFixed(1)}" fill="${fill || c.theme.panel}" stroke="${stroke || c.theme.panelStroke}" stroke-width="${strokeW}" opacity="${opacity.toFixed(3)}" filter="url(#sh)"/>`;

// ── 1) title_card — عنوان فصل/عنوان رئيسي ──────────────────────────────────────────────────
const title_card = {
  animEnd: (d) => 1.7 + 0.12 * (d.title ? 1 : 0),
  render(c, d, t) {
    const { w, h, theme } = c;
    const maxW = w * (c.portrait ? 0.86 : 0.74);
    const size = c.portrait ? 92 : 108;
    const lines = wrapText(d.title || '', maxW, size * c.s, { maxLines: 4 });
    const lh = size * 1.18 * c.s;
    const total = lines.length * lh;
    const y0 = c.cy - total / 2 + lh * 0.8 - (d.subtitle ? 28 * c.s : 0);
    let out = SHADOW_DEF;
    if (d.kicker) {
      const p = easeOutCubic(seg(t, 0.0, 0.5));
      out += txt(c, String(d.kicker).toUpperCase(), c.cx, y0 - lines.length * lh * 0.0 - total * 0.0 - lh * 0.95, 34, { weight: 700, fill: theme.accent, opacity: p, ls: 6 });
    }
    lines.forEach((ln, i) => {
      const p = easeOutCubic(seg(t, 0.15 + i * 0.14, 0.75 + i * 0.14));
      out += txt(c, ln, c.cx, y0 + i * lh + (1 - p) * 46 * c.s, size, { weight: 900, opacity: p });
    });
    const barP = easeInOutCubic(seg(t, 0.5, 1.2));
    const barW = Math.min(maxW, 360 * c.s * 1.4) * barP;
    const barY = y0 + (lines.length - 1) * lh + 36 * c.s;
    out += `<rect x="${(c.cx - barW / 2).toFixed(1)}" y="${barY.toFixed(1)}" width="${barW.toFixed(1)}" height="${(7 * c.s).toFixed(1)}" rx="${(3.5 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
    if (d.subtitle) {
      const p = easeOutCubic(seg(t, 0.9, 1.5));
      const sl = wrapText(d.subtitle, maxW, 40 * c.s, { bold: false, maxLines: 2 });
      sl.forEach((ln, i) => { out += txt(c, ln, c.cx, barY + (74 + i * 54) * c.s + (1 - p) * 20 * c.s, 40, { weight: 500, fill: theme.muted, opacity: p }); });
    }
    return out;
  },
};

// ── 2) lower_third — اسم + وصف تحت الشاشة ─────────────────────────────────────────────────
const lower_third = {
  animEnd: () => 1.0,
  render(c, d, t) {
    const { w, h, theme, rtl } = c;
    const name = String(d.name || '');
    const role = String(d.role || '');
    const nameSize = 54, roleSize = 34;
    const bw = Math.min(w * 0.7, Math.max(textWidth(name, nameSize * c.s), textWidth(role, roleSize * c.s, false)) + 120 * c.s);
    const bh = (role ? 150 : 100) * c.s;
    const slide = 1 - easeOutCubic(seg(t, 0, 0.55));
    const x = rtl ? w - 70 * c.s - bw + slide * (bw + 100) : 70 * c.s - slide * (bw + 100);
    const y = h - (c.portrait ? 360 : 190) * c.s;
    let out = SHADOW_DEF + panel(c, x, y, bw, bh, { r: 18 });
    out += `<rect x="${(rtl ? x + bw - 12 * c.s : x).toFixed(1)}" y="${y.toFixed(1)}" width="${(12 * c.s).toFixed(1)}" height="${bh.toFixed(1)}" rx="${(6 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
    const tx = rtl ? x + bw - 44 * c.s : x + 44 * c.s;
    const anchor = rtl ? 'end' : 'start';
    const p2 = easeOutCubic(seg(t, 0.25, 0.7));
    out += txt(c, name, tx, y + (role ? 68 : 66) * c.s, nameSize, { anchor, weight: 800, opacity: p2 });
    if (role) out += txt(c, role, tx, y + 118 * c.s, roleSize, { anchor, weight: 500, fill: theme.muted, opacity: p2 });
    return out;
  },
};

// ── 3) quote — اقتباس ──────────────────────────────────────────────────────────────────────
const quote = {
  animEnd: (d) => 1.2 + Math.min(1.2, (String(d.text || '').split(/\s+/).length) * 0.04),
  render(c, d, t) {
    const { w, theme } = c;
    const maxW = w * (c.portrait ? 0.84 : 0.7);
    const size = c.portrait ? 58 : 66;
    const lines = wrapText(d.text || '', maxW, size * c.s, { bold: false, maxLines: 7 });
    const lh = size * 1.4 * c.s;
    const total = lines.length * lh;
    const y0 = c.cy - total / 2 + lh * 0.3;
    const qp = easeOutBack(seg(t, 0, 0.5));
    let out = `<text x="${c.cx.toFixed(1)}" y="${(y0 - 40 * c.s).toFixed(1)}" font-family="'Noto Serif','DejaVu Serif',serif" font-size="${(220 * c.s * Math.max(0.01, qp)).toFixed(1)}" font-weight="900" fill="${theme.accent}" text-anchor="middle" opacity="${clamp01(qp).toFixed(3)}">“</text>`;
    const n = lines.length;
    lines.forEach((ln, i) => {
      const p = easeOutCubic(seg(t, 0.3 + (i / Math.max(1, n)) * 1.0, 0.85 + (i / Math.max(1, n)) * 1.0));
      out += txt(c, ln, c.cx, y0 + i * lh + (1 - p) * 26 * c.s, size, { weight: 500, italic: !c.rtl, opacity: p, family: c.rtl ? c.ff : "'Noto Serif','DejaVu Serif',serif" });
    });
    if (d.author) {
      const p = easeOutCubic(seg(t, 0.4 + 1.0, 0.9 + 1.0));
      out += txt(c, '— ' + d.author, c.cx, y0 + total + 56 * c.s, 40, { weight: 700, fill: theme.accent, opacity: p });
    }
    return out;
  },
};

// ── 4/5) bullet_panel + evidence_board (نفس البيانات، شكل ورقي بخط يدوي) ───────────────────────
function bulletLike(paper) {
  return {
    animEnd: (d) => 0.7 + 0.5 * Math.min(6, (d.bullets || []).length),
    render(c, d, t) {
      const { w, h, theme, rtl } = c;
      const bullets = (d.bullets || []).slice(0, 6).map(String);
      const pw = Math.min(w * (c.portrait ? 0.9 : 0.46), 900 * c.s);
      const titleSize = paper ? 40 : 46, bSize = paper ? 38 : 40;
      const fam = paper ? fontStack(c.lang, { hand: !rtl }) : c.ff;
      const lineGap = 22 * c.s;
      const wrapped = bullets.map(b => wrapText(b, pw - 190 * c.s, bSize * c.s, { bold: false, maxLines: 3 }));
      const bulletsH = wrapped.reduce((a, ls) => a + ls.length * bSize * 1.25 * c.s + lineGap, 0);
      const headH = (d.title ? 96 : 40) * c.s;
      const ph = headH + bulletsH + 40 * c.s;
      const px = rtl ? (c.portrait ? (w - pw) / 2 : w * 0.06) : (c.portrait ? (w - pw) / 2 : w - pw - w * 0.06);
      const py = c.cy - ph / 2;
      const inP = easeOutCubic(seg(t, 0, 0.5));
      const slide = (1 - inP) * 90 * c.s * (rtl ? -1 : 1);
      let out = SHADOW_DEF + `<g opacity="${inP.toFixed(3)}" transform="translate(${slide.toFixed(1)},0)">`;
      if (paper) {
        out += panel(c, px, py, pw, ph, { r: 8, fill: '#f3e6cf', stroke: '#6b4a2b', strokeW: 3 });
        if (d.title) {
          out += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${(84 * c.s).toFixed(1)}" rx="${(8 * c.s).toFixed(1)}" fill="#8f2a1c"/>`;
          out += txt(c, String(d.title).toUpperCase(), px + pw / 2, py + 56 * c.s, titleSize, { weight: 800, fill: '#fff3df', ls: 3 });
        }
      } else {
        out += panel(c, px, py, pw, ph);
        out += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${pw.toFixed(1)}" height="${(10 * c.s).toFixed(1)}" rx="${(5 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
        if (d.title) out += txt(c, d.title, px + pw / 2, py + 66 * c.s, titleSize, { weight: 800 });
      }
      let y = py + headH + 16 * c.s;
      wrapped.forEach((ls, i) => {
        const p = easeOutBack(seg(t, 0.55 + i * 0.5, 0.95 + i * 0.5));
        const ink = paper ? '#2b2112' : theme.text;
        const bx = rtl ? px + pw - 70 * c.s : px + 70 * c.s;
        // مربع/علامة صح بتنبض
        const boxS = 34 * c.s * Math.max(0.01, p);
        out += `<rect x="${(rtl ? bx - boxS / 2 : bx - boxS / 2).toFixed(1)}" y="${(y + 4 * c.s).toFixed(1)}" width="${boxS.toFixed(1)}" height="${boxS.toFixed(1)}" rx="${(7 * c.s).toFixed(1)}" fill="none" stroke="${paper ? '#5a3a1a' : theme.accent}" stroke-width="${(4 * c.s).toFixed(1)}" opacity="${clamp01(p).toFixed(3)}"/>`;
        if (p > 0.55) out += `<path d="M ${(bx - 10 * c.s).toFixed(1)} ${(y + 22 * c.s).toFixed(1)} l ${(8 * c.s).toFixed(1)} ${(9 * c.s).toFixed(1)} l ${(15 * c.s).toFixed(1)} ${(-20 * c.s).toFixed(1)}" fill="none" stroke="${paper ? '#8f2a1c' : theme.accent2}" stroke-width="${(5 * c.s).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        ls.forEach((ln, k) => {
          out += txt(c, ln, rtl ? bx - 52 * c.s : bx + 52 * c.s, y + 32 * c.s + k * bSize * 1.25 * c.s, bSize, { anchor: rtl ? 'end' : 'start', weight: paper ? 600 : 500, fill: ink, opacity: clamp01(p), family: fam });
        });
        y += ls.length * bSize * 1.25 * c.s + lineGap;
      });
      return out + '</g>';
    },
  };
}
const bullet_panel = bulletLike(false);
const evidence_board = bulletLike(true);

// ── 6) counter — رقم بيعد لحد قيمته ────────────────────────────────────────────────────────
const counter = {
  animEnd: () => 2.0,
  render(c, d, t) {
    const { theme } = c;
    const from = Number(d.from ?? 0), to = Number(d.value ?? 0);
    const dec = Number.isInteger(d.decimals) ? d.decimals : (Number.isInteger(to) ? 0 : 1);
    const p = easeOutExpo(seg(t, 0.15, 1.9));
    const v = lerp(from, to, p);
    const big = `${d.prefix || ''}${fmtNumber(v, dec)}${d.suffix || ''}`;
    const size = Math.min(210, (c.w * 0.86) / Math.max(4, big.length * 0.62) / c.s);
    const inP = easeOutCubic(seg(t, 0, 0.35));
    let out = SHADOW_DEF;
    out += txt(c, big, c.cx, c.cy + 20 * c.s, size, { weight: 900, fill: theme.accent2, opacity: inP, family: "'DejaVu Sans','Noto Sans',sans-serif" });
    const barW = 380 * c.s * easeInOutCubic(seg(t, 0.3, 1.0));
    out += `<rect x="${(c.cx - barW / 2).toFixed(1)}" y="${(c.cy + 62 * c.s).toFixed(1)}" width="${barW.toFixed(1)}" height="${(7 * c.s).toFixed(1)}" rx="${(3.5 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
    if (d.label) {
      const lp = easeOutCubic(seg(t, 0.6, 1.2));
      wrapText(d.label, c.w * 0.8, 52 * c.s, { maxLines: 2 }).forEach((ln, i) => { out += txt(c, ln, c.cx, c.cy + (132 + i * 62) * c.s + (1 - lp) * 18 * c.s, 52, { weight: 700, opacity: lp }); });
    }
    return out;
  },
};

// ── 7) bar_chart ───────────────────────────────────────────────────────────────────────────
const bar_chart = {
  animEnd: (d) => 0.6 + 0.3 * Math.min(8, (d.items || []).length) + 0.9,
  render(c, d, t) {
    const { w, theme, rtl } = c;
    const items = (d.items || []).slice(0, 8).map(i => ({ label: String(i.label), value: Number(i.value) || 0 }));
    const max = Math.max(1, ...items.map(i => i.value));
    const cw = Math.min(w * 0.86, 1500 * c.s), cx0 = (w - cw) / 2;
    const rowH = Math.min(96 * c.s, (c.h * 0.62) / Math.max(1, items.length));
    const labelW = Math.min(cw * 0.3, 360 * c.s);
    const barMax = cw - labelW - 170 * c.s;
    const totalH = items.length * rowH + (d.title ? 110 * c.s : 0);
    let y = c.cy - totalH / 2;
    let out = SHADOW_DEF + panel(c, cx0 - 36 * c.s, y - 40 * c.s, cw + 72 * c.s, totalH + 80 * c.s);
    if (d.title) { out += txt(c, d.title, c.cx, y + 44 * c.s, 48, { weight: 800 }); y += 110 * c.s; }
    items.forEach((it, i) => {
      const p = easeOutCubic(seg(t, 0.4 + i * 0.3, 1.3 + i * 0.3));
      const bh = rowH * 0.5;
      const by = y + i * rowH + (rowH - bh) / 2;
      const bwid = barMax * (it.value / max) * p;
      const lx = rtl ? cx0 + cw : cx0;
      out += txt(c, it.label, lx, by + bh * 0.72, 34, { anchor: rtl ? 'end' : 'start', weight: 600, fill: theme.muted, opacity: clamp01(p * 2) });
      const bx = rtl ? cx0 + cw - labelW - bwid : cx0 + labelW;
      out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${Math.max(0, bwid).toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="${i % 2 ? theme.accent2 : theme.accent}"/>`;
      out += txt(c, fmtNumber(it.value * p, Number.isInteger(it.value) ? 0 : 1), rtl ? bx - 16 * c.s : bx + bwid + 16 * c.s, by + bh * 0.72, 34, { anchor: rtl ? 'end' : 'start', weight: 800, opacity: clamp01(p * 2) });
    });
    return out;
  },
};

// ── 8) donut_chart ─────────────────────────────────────────────────────────────────────────
const donut_chart = {
  animEnd: () => 2.2,
  render(c, d, t) {
    const { theme, rtl } = c;
    const items = (d.items || []).slice(0, 6).map(i => ({ label: String(i.label), value: Math.max(0, Number(i.value) || 0) }));
    const total = items.reduce((a, i) => a + i.value, 0) || 1;
    const R = (c.portrait ? 210 : 250) * c.s, sw = 74 * c.s;
    const cx = c.portrait ? c.cx : (rtl ? c.w * 0.68 : c.w * 0.32);
    const cy = c.portrait ? c.cy - 160 * c.s : c.cy;
    const circ = 2 * Math.PI * R;
    const colors = [theme.accent, theme.accent2, '#34d399', '#f472b6', '#a78bfa', '#fb923c'];
    const p = easeInOutCubic(seg(t, 0.2, 1.9));
    let out = SHADOW_DEF + `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="${sw.toFixed(1)}"/>`;
    let acc = 0;
    items.forEach((it, i) => {
      const frac = it.value / total;
      const start = acc, endv = Math.min(frac, Math.max(0, p - start));
      acc += frac;
      if (endv <= 0.0005) return;
      out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${R.toFixed(1)}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="${sw.toFixed(1)}" stroke-dasharray="${(circ * endv).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(${(-90 + start * 360).toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`;
    });
    if (d.title) out += txt(c, d.title, cx, cy + 12 * c.s, 40, { weight: 800 });
    const lx = c.portrait ? c.cx - 300 * c.s : (rtl ? c.w * 0.1 : c.w * 0.56);
    const ly0 = c.portrait ? cy + R + 110 * c.s : c.cy - (items.length * 70 * c.s) / 2 + 40 * c.s;
    items.forEach((it, i) => {
      const lp = easeOutCubic(seg(t, 0.6 + i * 0.25, 1.1 + i * 0.25));
      const y = ly0 + i * 70 * c.s;
      out += `<circle cx="${(lx + 16 * c.s).toFixed(1)}" cy="${(y - 12 * c.s).toFixed(1)}" r="${(15 * c.s).toFixed(1)}" fill="${colors[i % colors.length]}" opacity="${lp.toFixed(3)}"/>`;
      out += txt(c, `${it.label}  ${Math.round((it.value / total) * 100)}%`, lx + 52 * c.s, y, 38, { anchor: 'start', weight: 700, opacity: lp });
    });
    return out;
  },
};

// ── 9) timeline — خط زمني ──────────────────────────────────────────────────────────────────
const timeline = {
  animEnd: (d) => 0.9 + 0.55 * Math.min(6, (d.events || []).length),
  render(c, d, t) {
    const { w, theme, rtl } = c;
    const ev = (d.events || []).slice(0, 6);
    const n = Math.max(1, ev.length);
    const x0 = w * 0.1, x1 = w * 0.9, y = c.cy + 10 * c.s;
    const prog = easeInOutCubic(seg(t, 0.1, 0.9 + n * 0.5));
    let out = SHADOW_DEF;
    if (d.title) out += txt(c, d.title, c.cx, y - 250 * c.s, 54, { weight: 800, opacity: easeOutCubic(seg(t, 0, 0.5)) });
    const len = (x1 - x0) * prog;
    out += `<line x1="${(rtl ? x1 : x0).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(rtl ? x1 - len : x0 + len).toFixed(1)}" y2="${y.toFixed(1)}" stroke="${theme.accent}" stroke-width="${(8 * c.s).toFixed(1)}" stroke-linecap="round"/>`;
    ev.forEach((e, i) => {
      const frac = n === 1 ? 0.5 : i / (n - 1);
      const x = rtl ? x1 - (x1 - x0) * (0.06 + frac * 0.88) : x0 + (x1 - x0) * (0.06 + frac * 0.88);
      const p = easeOutBack(seg(t, 0.5 + i * 0.5, 0.95 + i * 0.5));
      const up = i % 2 === 0;
      const r = 20 * c.s * Math.max(0.01, p);
      out += `<line x1="${x.toFixed(1)}" y1="${y.toFixed(1)}" x2="${x.toFixed(1)}" y2="${(y + (up ? -1 : 1) * 70 * c.s * clamp01(p)).toFixed(1)}" stroke="${theme.muted}" stroke-width="${(3 * c.s).toFixed(1)}" opacity="${clamp01(p).toFixed(3)}"/>`;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${theme.accent2}" stroke="${theme.bgTop}" stroke-width="${(4 * c.s).toFixed(1)}"/>`;
      const ty = y + (up ? -1 : 1) * 96 * c.s;
      out += txt(c, String(e.date || ''), x, ty + (up ? -6 : 34) * c.s, 44, { weight: 900, fill: theme.accent2, opacity: clamp01(p) });
      const maxLW = (x1 - x0) / n * 1.05;
      wrapText(String(e.label || ''), maxLW, 32 * c.s, { bold: false, maxLines: 3 }).forEach((ln, k) => {
        out += txt(c, ln, x, ty + ((up ? -50 : 76) + (up ? -k : k) * 38) * c.s, 32, { weight: 500, opacity: clamp01(p) });
      });
    });
    return out;
  },
};

// ── 10) route_diagram — خطوات/مسار بعقد ────────────────────────────────────────────────────
const route_diagram = {
  animEnd: (d) => 0.8 + 0.55 * Math.min(6, (d.nodes || []).length),
  render(c, d, t) {
    const { w, theme, rtl } = c;
    const nodes = (d.nodes || []).slice(0, 6).map(String);
    const n = Math.max(1, nodes.length);
    const portrait = c.portrait;
    const pts = nodes.map((_, i) => {
      const f = n === 1 ? 0.5 : i / (n - 1);
      if (portrait) return { x: c.cx + (i % 2 ? 1 : -1) * 150 * c.s, y: c.h * 0.22 + f * c.h * 0.56 };
      return { x: rtl ? w * 0.9 - f * w * 0.8 : w * 0.1 + f * w * 0.8, y: c.cy + (i % 2 ? 1 : -1) * 70 * c.s };
    });
    let out = SHADOW_DEF;
    if (d.title) out += txt(c, d.title, c.cx, c.h * (portrait ? 0.12 : 0.2), 54, { weight: 800, opacity: easeOutCubic(seg(t, 0, 0.5)) });
    for (let i = 0; i < n - 1; i++) {
      const p = easeInOutCubic(seg(t, 0.5 + i * 0.5, 0.95 + i * 0.5));
      const a = pts[i], b = pts[i + 1];
      out += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${lerp(a.x, b.x, p).toFixed(1)}" y2="${lerp(a.y, b.y, p).toFixed(1)}" stroke="${theme.accent}" stroke-width="${(7 * c.s).toFixed(1)}" stroke-dasharray="${(22 * c.s).toFixed(0)} ${(12 * c.s).toFixed(0)}" stroke-linecap="round"/>`;
    }
    pts.forEach((pt, i) => {
      const p = easeOutBack(seg(t, 0.35 + i * 0.5, 0.8 + i * 0.5));
      const r = 34 * c.s * Math.max(0.01, p);
      out += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${(r * 1.5).toFixed(1)}" fill="${theme.accent}" opacity="0.18"/>`;
      out += `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${theme.accent2}" stroke="${theme.bgTop}" stroke-width="${(4 * c.s).toFixed(1)}"/>`;
      out += txt(c, String(i + 1), pt.x, pt.y + 12 * c.s, 34, { weight: 900, fill: '#111', opacity: clamp01(p) });
      wrapText(nodes[i], 360 * c.s, 36 * c.s, { maxLines: 2 }).forEach((ln, k) => {
        out += txt(c, ln, portrait ? pt.x + (i % 2 ? 1 : -1) * 0 : pt.x, pt.y + (i % 2 ? 1 : -1) * (76 + (i % 2 ? k : -k) * 42) * c.s + (i % 2 ? 36 : 0) * c.s, 36, { weight: 700, opacity: clamp01(p) });
      });
    });
    return out;
  },
};

// ── 11) kinetic_text — جملة كبيرة كلماتها بتنط واحدة واحدة ────────────────────────────────────
const kinetic_text = {
  animEnd: (d) => 0.4 + 0.22 * String(d.text || '').split(/\s+/).filter(Boolean).length,
  render(c, d, t) {
    const { theme } = c;
    const words = String(d.text || '').split(/\s+/).filter(Boolean);
    const emph = new Set((d.emphasis || []).map(x => String(x).toLowerCase()));
    const size = words.length > 9 ? 84 : 112;
    const maxW = c.w * (c.portrait ? 0.88 : 0.8);
    // نرتّب الكلمات في سطور
    const lines = [];
    let cur = [], curW = 0;
    words.forEach((wd, i) => {
      const ww = textWidth(wd, size * c.s, true, true) * (emph.has(wd.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')) ? 1.12 : 1) + size * c.s * 0.34;
      if (curW + ww > maxW && cur.length) { lines.push(cur); cur = []; curW = 0; }
      cur.push({ wd, i, ww }); curW += ww;
    });
    if (cur.length) lines.push(cur);
    const lh = size * 1.25 * c.s;
    let y = c.cy - (lines.length * lh) / 2 + lh * 0.8;
    let out = SHADOW_DEF;
    lines.forEach(line => {
      const lineW = line.reduce((a, x) => a + x.ww, 0);
      let x = c.rtl ? c.cx + lineW / 2 : c.cx - lineW / 2;
      line.forEach(({ wd, i, ww }) => {
        const p = easeOutBack(seg(t, 0.1 + i * 0.22, 0.4 + i * 0.22));
        const isE = emph.has(wd.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
        const fs = size * (isE ? 1.12 : 1) * Math.max(0.01, p);
        const cxw = c.rtl ? x - ww / 2 : x + ww / 2;
        out += txt(c, wd, cxw, y, fs, { weight: 900, fill: isE ? theme.accent2 : theme.text, opacity: clamp01(p * 1.5) });
        x += c.rtl ? -ww : ww;
      });
      y += lh;
    });
    return out;
  },
};


// ── 11b) stack_text — كلمات عملاقة فوق بعض بتنزل بضربة (للمونتاج) ────────────────────────────────
const normTok = (x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function stackLines(words) {
  if (words.length <= 4) return words.map(w => [w]);
  const n = 4, per = Math.ceil(words.length / n), lines = [];
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per));
  return lines;
}
const stack_text = {
  animEnd: (d) => 0.45 + 0.2 * stackLines(String(d.text || '').split(/\s+/).filter(Boolean)).length,
  render(c, d, t) {
    const { theme } = c;
    const words = String(d.text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const emph = new Set((d.emphasis || []).map(normTok));
    const lines = stackLines(words);
    const base = (lines.length <= 2 ? 190 : lines.length === 3 ? 160 : 132) * (c.portrait ? 0.82 : 1) * (c.rtl ? 1.3 : 1);
    const maxW = c.w * (c.portrait ? 0.9 : 0.78);
    const lh = base * 1.08 * c.s;
    const total = lines.length * lh;
    let y = c.cy - total / 2 + lh * 0.82;
    let out = SHADOW_DEF;
    lines.forEach((ln, i) => {
      const s0 = 0.08 + i * 0.2;
      const p = easeOutBack(seg(t, s0, s0 + 0.28));
      const text = ln.join(' ');
      const isE = ln.some(w => emph.has(normTok(w)));
      const wFull = textWidth(text, base * c.s, true, true);
      const fit = Math.min(1, maxW / Math.max(1, wFull));
      const sc = lerp(1.7, 1, clamp01(p)) * (p > 1 ? 1 : 1);
      out += txt(c, text, c.cx, y + (1 - clamp01(p)) * 30 * c.s, base * fit * sc * (isE ? 1.06 : 1), { weight: 900, fill: isE ? theme.accent2 : theme.text, opacity: clamp01((t - s0) / 0.1) });
      y += lh;
    });
    const bp = easeInOutCubic(seg(t, 0.2 + lines.length * 0.2, 0.7 + lines.length * 0.2));
    const bw = Math.min(maxW, 520 * c.s) * bp;
    out += `<rect x="${(c.cx - bw / 2).toFixed(1)}" y="${(c.cy + total / 2 + (c.rtl ? 34 : 14) * c.s).toFixed(1)}" width="${bw.toFixed(1)}" height="${(9 * c.s).toFixed(1)}" rx="${(4.5 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
    return out;
  },
};

// ── 11c) marker_text — جملة بكلمات مهمة عليها هايلايت ماركر بيتمسح عليها (للمونتاج) ────────────────
const marker_text = {
  animEnd: (d) => 1.1 + 0.08 * String(d.text || '').split(/\s+/).filter(Boolean).length,
  render(c, d, t) {
    const { theme } = c;
    const words = String(d.text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const emph = new Set((d.emphasis || []).map(normTok));
    const size = (words.length > 8 ? 78 : 100) * (c.rtl ? 1.3 : 1);
    const maxW = c.w * (c.portrait ? 0.88 : 0.76);
    const lines = []; let cur = [], curW = 0;
    words.forEach((wd, i) => {
      const ww = textWidth(wd, size * c.s, true, true) + size * c.s * 0.32;
      if (curW + ww > maxW && cur.length) { lines.push(cur); cur = []; curW = 0; }
      cur.push({ wd, i, ww }); curW += ww;
    });
    if (cur.length) lines.push(cur);
    const lh = size * 1.4 * c.s;
    let y = c.cy - (lines.length * lh) / 2 + lh * 0.72;
    let out = SHADOW_DEF;
    const markers = [], texts = [];
    lines.forEach((line, li) => {
      const lineW = line.reduce((a, x) => a + x.ww, 0);
      let x = c.rtl ? c.cx + lineW / 2 : c.cx - lineW / 2;
      const lp = easeOutCubic(seg(t, 0.05 + li * 0.14, 0.45 + li * 0.14));
      line.forEach(({ wd, ww }) => {
        const isE = emph.has(normTok(wd));
        const left = c.rtl ? x - ww : x;
        if (isE) {
          const mp = easeInOutCubic(seg(t, 0.45 + li * 0.14, 0.85 + li * 0.14));
          const mw = (ww - size * c.s * 0.1) * mp;
          const mx = c.rtl ? left + ww - size * c.s * 0.05 - mw : left + size * c.s * 0.05;
          markers.push(`<rect x="${mx.toFixed(1)}" y="${(y - size * 0.86 * c.s + (1 - lp) * 24 * c.s).toFixed(1)}" width="${mw.toFixed(1)}" height="${(size * 1.08 * c.s).toFixed(1)}" rx="${(10 * c.s).toFixed(1)}" fill="${theme.accent2}" opacity="${(0.96 * lp).toFixed(3)}"/>`);
        }
        const mp2 = isE ? easeInOutCubic(seg(t, 0.45 + li * 0.14, 0.85 + li * 0.14)) : 0;
        texts.push(txt(c, wd, left + ww / 2, y + (1 - lp) * 24 * c.s, size, { weight: 900, fill: isE && mp2 > 0.55 ? '#14110a' : theme.text, opacity: lp }));
        x += c.rtl ? -ww : ww;
      });
      y += lh;
    });
    return out + markers.join('') + texts.join('');
  },
};

// ════════════════ موشن جرافيك إضافي: رسومات متحركة، سنة، VS، ختم، نسبة، مسحات، إطار ════════════════
// أيقونات مرسومة بخطوط (viewBox 64×64) — بتترسم بحركة "رسم بالقلم" (stroke-dashoffset)
const circ = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0`;
export const ICONS = {
  sword: ['M50 12 L20 42', 'M14 36 L28 50', 'M20 42 L10 54', 'M50 12 L56 8'],
  shield: ['M32 8 L52 14 V30 C52 44 42 54 32 58 C22 54 12 44 12 30 V14 Z', 'M32 18 V50'],
  crown: ['M10 46 L14 22 L24 34 L32 16 L40 34 L50 22 L54 46 Z', 'M12 52 H52'],
  ship: ['M8 40 H56 L48 54 H16 Z', 'M32 40 V10', 'M32 12 L50 34 H32', 'M32 18 L18 34 H32'],
  plane: ['M32 6 L36 26 L58 36 V42 L36 38 L34 52 L42 56 V60 L32 58 L22 60 V56 L30 52 L28 38 L6 42 V36 L28 26 Z'],
  rocket: ['M32 6 C42 16 44 30 40 46 H24 C20 30 22 16 32 6 Z', circ(32, 24, 5), 'M24 40 L14 52 L24 50', 'M40 40 L50 52 L40 50', 'M28 50 L32 60 L36 50'],
  book: ['M10 12 H30 C32 12 32 14 32 14 V54 C32 54 30 52 28 52 H10 Z', 'M54 12 H34 C32 12 32 14 32 14 V54 C32 54 34 52 36 52 H54 Z'],
  coin: [circ(32, 32, 22), 'M32 18 V46', 'M39 24 C37 20 25 20 25 27 C25 34 39 31 39 38 C39 45 27 45 25 40'],
  fire: ['M32 6 C34 18 48 24 48 38 C48 50 40 58 32 58 C24 58 16 50 16 38 C16 30 22 26 24 18 C28 22 28 28 30 30 C34 24 34 14 32 6 Z'],
  skull: ['M32 8 C18 8 12 18 14 30 C15 36 18 38 20 40 V50 H44 V40 C46 38 49 36 50 30 C52 18 46 8 32 8 Z', circ(25, 30, 4), circ(39, 30, 4), 'M28 50 V44', 'M32 50 V44', 'M36 50 V44'],
  flag: ['M16 8 V58', 'M16 10 H52 L43 22 L52 34 H16'],
  city: ['M8 56 V30 H20 V56', 'M22 56 V12 H38 V56', 'M40 56 V26 H56 V56', 'M27 20 H33 M27 28 H33 M27 36 H33', 'M4 56 H60'],
  pyramid: ['M6 54 L32 10 L58 54 Z', 'M19 32 H45', 'M12 44 H52'],
  scroll: ['M18 10 H50 V46 C50 52 44 54 40 54 H14 C20 54 18 48 18 44 Z', 'M24 20 H44', 'M24 28 H44', 'M24 36 H38'],
  castle: ['M10 56 V24 H18 V18 H24 V24 H28 V18 H34 V24 H38 V18 H44 V24 H54 V56 Z', 'M28 56 V44 C28 40 36 40 36 44 V56'],
  globe: [circ(32, 32, 24), 'M8 32 H56', 'M32 8 C20 20 20 44 32 56 C44 44 44 20 32 8'],
  clock: [circ(32, 32, 24), 'M32 16 V32 L42 38'],
  star: ['M32 6 L39 24 L58 25 L43 37 L48 56 L32 45 L16 56 L21 37 L6 25 L25 24 Z'],
  bolt: ['M36 6 L14 36 H30 L26 58 L50 26 H34 Z'],
  people: [circ(32, 18, 7), 'M18 54 C18 36 46 36 46 54', circ(13, 28, 5), circ(51, 28, 5), 'M4 52 C4 42 14 40 18 44', 'M60 52 C60 42 50 40 46 44'],
  house: ['M8 32 L32 10 L56 32', 'M14 28 V54 H50 V28', 'M28 54 V40 H36 V54'],
  anchor: [circ(32, 12, 4), 'M32 16 V54', 'M20 26 H44', 'M12 40 C14 52 24 56 32 54 C40 56 50 52 52 40'],
  gear: [circ(32, 32, 10), circ(32, 32, 20), 'M32 8 V12 M32 52 V56 M8 32 H12 M52 32 H56 M15 15 L18 18 M46 46 L49 49 M49 15 L46 18 M18 46 L15 49'],
  tank: ['M8 44 H56 V52 H8 Z', 'M16 44 V34 H44 V44', 'M44 38 H62', circ(16, 48, 2), circ(32, 48, 2), circ(48, 48, 2)],
  trend: ['M8 50 L22 34 L32 42 L56 14', 'M44 14 H56 V26'],
};
export const ICON_NAMES = Object.keys(ICONS);

// ── 13) icon_pop — 2-4 أيقونات مرسومة بالقلم جوه دوائر، كل واحدة بتتحط بنبضة وتحتها عنوان ─────────────────
const icon_pop = {
  animEnd: (d) => 0.5 + 0.55 * Math.min(4, (d.items || []).length) + 0.4,
  render(c, d, t) {
    const { theme } = c;
    const items = (d.items || []).slice(0, 4);
    if (!items.length) return '';
    const n = items.length;
    const vertical = c.portrait && n > 2;
    const R = (c.portrait ? (n > 2 ? 190 : 200) : (n > 3 ? 150 : 175)) * c.s;
    const gap = R * 0.5;
    const total = n * 2 * R + (n - 1) * gap;
    let out = SHADOW_DEF;
    if (d.title) out += txt(c, d.title, c.cx, c.cy - (vertical ? total / 2 + 80 * c.s : R + 120 * c.s), c.portrait ? 76 : 54, { weight: 900, opacity: easeOutCubic(seg(t, 0, 0.4)) });
    items.forEach((it, i) => {
      const s0 = 0.25 + i * 0.55;
      const p = easeOutBack(seg(t, s0, s0 + 0.45));
      const draw = easeInOutCubic(seg(t, s0 + 0.05, s0 + 0.85));
      const cx = vertical ? c.cx : c.cx - total / 2 + R + i * (2 * R + gap);
      const cy = vertical ? c.cy - total / 2 + R + i * (2 * R + gap) : c.cy;
      const sc = Math.max(0.01, p);
      const paths = ICONS[it.icon] || ICONS.star;
      const k = (R * 1.15) / 64; // حجم الأيقونة جوه الدايرة
      out += `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) scale(${sc.toFixed(3)})" opacity="${clamp01(p * 1.4).toFixed(3)}">`
        + `<circle r="${R.toFixed(1)}" fill="${theme.panel}" stroke="${theme.panelStroke}" stroke-width="${(3 * c.s).toFixed(1)}" filter="url(#sh)"/>`
        + `<circle r="${(R * 0.93).toFixed(1)}" fill="none" stroke="${theme.accent}" stroke-width="${(6 * c.s).toFixed(1)}" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${((1 - draw) * 100).toFixed(1)}" transform="rotate(-90)"/>`
        + `<g transform="scale(${k.toFixed(3)}) translate(-32,-32)" fill="none" stroke="${theme.accent2}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">`
        + paths.map(pd => `<path d="${pd}" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${((1 - draw) * 100).toFixed(1)}"/>`).join('')
        + `</g></g>`;
      if (it.label) {
        const lp = easeOutCubic(seg(t, s0 + 0.3, s0 + 0.75));
        out += txt(c, it.label, cx, cy + R + 62 * c.s + (1 - lp) * 16 * c.s, c.portrait ? 62 : 44, { weight: 800, opacity: lp });
      }
    });
    return out;
  },
};

// ── 14) date_card — سنة كبيرة بتلف أرقامها لحد ما توصل، مع خط بيتمدّ وعنوان تحتها ───────────────────────
const date_card = {
  animEnd: () => 2.0,
  render(c, d, t) {
    const { theme } = c;
    const year = Number(d.year) || 2000;
    const p = easeOutExpo(seg(t, 0.1, 1.5));
    const v = Math.round(lerp(year - 70, year, p));
    const size = c.portrait ? 310 : 270;
    const inP = easeOutCubic(seg(t, 0, 0.3));
    let out = SHADOW_DEF;
    const lineW = Math.min(c.w * 0.8, 760 * c.s) * easeInOutCubic(seg(t, 0.15, 1.0));
    const y = c.cy + 40 * c.s;
    out += `<rect x="${(c.cx - lineW / 2).toFixed(1)}" y="${(y - size * 0.9 * c.s).toFixed(1)}" width="${lineW.toFixed(1)}" height="${(6 * c.s).toFixed(1)}" rx="${(3 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
    out += txt(c, String(v), c.cx, y, size, { weight: 900, fill: theme.accent2, opacity: inP, family: "'DejaVu Sans','Noto Sans',sans-serif", ls: 4 });
    out += `<rect x="${(c.cx - lineW / 2).toFixed(1)}" y="${(y + 40 * c.s).toFixed(1)}" width="${lineW.toFixed(1)}" height="${(6 * c.s).toFixed(1)}" rx="${(3 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
    if (d.label) {
      const lp = easeOutCubic(seg(t, 0.9, 1.5));
      wrapText(d.label, c.w * 0.82, (c.portrait ? 76 : 56) * c.s, { maxLines: 2 }).forEach((ln, i) => { out += txt(c, ln, c.cx, y + (130 + i * (c.portrait ? 90 : 66)) * c.s + (1 - lp) * 20 * c.s, c.portrait ? 76 : 56, { weight: 800, opacity: lp }); });
    }
    return out;
  },
};

// ── 15) vs_card — طرفين بيدخلوا من الجنبين وبينهم شارة VS بتنبض ─────────────────────────────────────────
const vs_card = {
  animEnd: () => 1.6,
  render(c, d, t) {
    const { theme, w, h } = c;
    const L = String(d.left?.label || d.left || ''), Rt = String(d.right?.label || d.right || '');
    const p = easeOutBack(seg(t, 0.05, 0.7));
    const pv = c.portrait;
    const pw = pv ? w * 0.86 : w * 0.38, ph = pv ? h * 0.2 : h * 0.42;
    const slide = (1 - Math.min(1, p)) * (pv ? h * 0.6 : w * 0.6);
    let out = SHADOW_DEF;
    const box = (x, y, color, label, fill) => panel(c, x, y, pw, ph, { r: 30, fill, stroke: color, strokeW: 4 })
      + wrapText(label, pw * 0.86, 60 * c.s, { maxLines: 3 }).map((ln, i, arr) => txt(c, ln, x + pw / 2, y + ph / 2 + (i - (arr.length - 1) / 2) * 72 * c.s + 20 * c.s, pv ? 76 : 60, { weight: 900, fill: theme.text })).join('');
    if (pv) {
      out += box(c.cx - pw / 2, c.cy - ph - 85 * c.s - slide, theme.accent, L, theme.panel);
      out += box(c.cx - pw / 2, c.cy + 85 * c.s + slide, theme.accent2, Rt, theme.panel);
    } else {
      out += box(c.cx - pw - 95 * c.s - slide, c.cy - ph / 2, theme.accent, L, theme.panel);
      out += box(c.cx + 95 * c.s + slide, c.cy - ph / 2, theme.accent2, Rt, theme.panel);
    }
    const bp = easeOutBack(seg(t, 0.55, 1.05));
    const pulse = 1 + 0.06 * Math.sin(Math.max(0, t - 1.0) * 9);
    const br = (pv ? 95 : 70) * c.s * Math.max(0.01, bp) * pulse;
    out += `<circle cx="${c.cx}" cy="${c.cy}" r="${br.toFixed(1)}" fill="${theme.accent2}" stroke="#fff" stroke-width="${(5 * c.s).toFixed(1)}" filter="url(#sh)"/>`;
    out += txt(c, 'VS', c.cx, c.cy + 24 * c.s * Math.max(0.01, bp), (pv ? 96 : 72) * Math.max(0.01, bp), { weight: 900, fill: '#111', opacity: clamp01(bp * 1.5), family: "'DejaVu Sans','Noto Sans',sans-serif" });
    return out;
  },
};

// ── 16) stamp — ختم مطاطي بيضرب الشاشة (تدوير + ارتداد) ────────────────────────────────────────────────
const stamp = {
  animEnd: () => 1.0,
  render(c, d, t) {
    const text = String(d.text || '').toUpperCase().slice(0, 26);
    const color = d.tone === 'gold' ? '#f5b301' : '#e11d48';
    const p = easeOutBack(seg(t, 0.05, 0.45));
    const sc = lerp(2.6, 1, Math.min(1, p));
    const rot = lerp(-4, -11, Math.min(1, p));
    const size = (text.length > 12 ? 92 : 132) * (c.portrait ? 1.25 : 1);
    const tw = textWidth(text, size * c.s, true, true);
    const bw = Math.min(c.w * 0.86, tw + 130 * c.s), bh = size * 1.75 * c.s;
    const ring = easeOutCubic(seg(t, 0.4, 1.0));
    const shake = t > 0.4 && t < 0.62 ? Math.sin((t - 0.4) * 70) * 6 * c.s : 0;
    let out = SHADOW_DEF;
    out += `<g transform="translate(${(c.cx + shake).toFixed(1)},${c.cy.toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(3)})" opacity="${clamp01(p * 2).toFixed(3)}">`
      + `<rect x="${(-bw / 2).toFixed(1)}" y="${(-bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(14 * c.s).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(12 * c.s).toFixed(1)}"/>`
      + `<rect x="${(-bw / 2 + 18 * c.s).toFixed(1)}" y="${(-bh / 2 + 18 * c.s).toFixed(1)}" width="${(bw - 36 * c.s).toFixed(1)}" height="${(bh - 36 * c.s).toFixed(1)}" rx="${(8 * c.s).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(4 * c.s).toFixed(1)}"/>`
      + `<text x="0" y="${(size * 0.36 * c.s).toFixed(1)}" font-family="${c.ff}" font-size="${(size * c.s).toFixed(1)}" font-weight="900" fill="${color}" text-anchor="middle" letter-spacing="3">${esc(text)}</text></g>`;
    out += `<circle cx="${c.cx}" cy="${c.cy}" r="${(bw * 0.5 * (0.6 + ring * 0.9)).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(5 * c.s).toFixed(1)}" opacity="${((1 - ring) * 0.6).toFixed(3)}"/>`;
    return out;
  },
};

// ── 17) percent_ring — حلقة نسبة مئوية بتتملي مع رقم بيعدّ ─────────────────────────────────────────────────
const percent_ring = {
  animEnd: () => 2.0,
  render(c, d, t) {
    const { theme } = c;
    const val = Math.max(0, Math.min(100, Number(d.value) || 0));
    const p = easeOutCubic(seg(t, 0.15, 1.7));
    const R = (c.portrait ? 400 : 230) * c.s;
    let out = SHADOW_DEF;
    out += `<g transform="translate(${c.cx},${(c.cy - 30 * c.s).toFixed(1)}) rotate(-90)"><circle r="${R}" fill="none" stroke="${theme.panelStroke}" stroke-width="${(34 * c.s).toFixed(1)}"/>`
      + `<circle r="${R}" fill="none" stroke="${theme.accent2}" stroke-width="${(34 * c.s).toFixed(1)}" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${(100 - val * p).toFixed(2)}"/></g>`;
    out += txt(c, `${Math.round(val * p)}%`, c.cx, c.cy - 30 * c.s + (c.portrait ? 62 : 46) * c.s, c.portrait ? 200 : 140, { weight: 900, fill: theme.text, family: "'DejaVu Sans','Noto Sans',sans-serif" });
    if (d.label) {
      const lp = easeOutCubic(seg(t, 0.8, 1.4));
      wrapText(d.label, c.w * 0.8, (c.portrait ? 72 : 52) * c.s, { maxLines: 2 }).forEach((ln, i) => { out += txt(c, ln, c.cx, c.cy + R + 60 * c.s + i * (c.portrait ? 86 : 62) * c.s + (1 - lp) * 18 * c.s, c.portrait ? 72 : 52, { weight: 800, opacity: lp }); });
    }
    return out;
  },
};

// ── 18) wipe_bars — مسحة أشرطة مائلة بتعدّي على الشاشة (انتقال بين الفصول/اللحظات الدرامية) ───────────────
const wipe_bars = {
  animEnd: () => 0.8,
  render(c, d, t) {
    const { theme, w, h } = c;
    const cols = [theme.accent, theme.accent2, theme.text, theme.accent];
    const n = 5, bw = (w + h) / n + 40;
    let out = '';
    for (let i = 0; i < n; i++) {
      const a = easeInOutCubic(seg(t, i * 0.04, 0.38 + i * 0.04)); // دخول
      const b = easeInOutCubic(seg(t, 0.38 + i * 0.04, 0.78)); // خروج
      const left = lerp(-bw * 2, w + bw, b);       // الحافة اليسرى بتتحرك مع الخروج
      const right = lerp(-bw, w + bw * 2, a);      // الحافة اليمنى بتتحرك مع الدخول
      const y0 = (h / n) * i, hh = h / n + 2;
      const skew = h * 0.18;
      if (right - left <= 2) continue;
      out += `<polygon points="${left + skew},${y0} ${right + skew},${y0} ${right},${y0 + hh} ${left},${y0 + hh}" fill="${cols[i % cols.length]}" opacity="0.96"/>`;
    }
    return out;
  },
};

// ── 19) corner_frame — أقواس زوايا (viewfinder) بتترسم + خط مسح بيعدّي مرة (لمسة "فيلم" على اللقطات) ──────────
const corner_frame = {
  animEnd: () => 0.9,
  render(c, d, t) {
    const { theme, w, h } = c;
    const m = 56 * c.s, L = 110 * c.s * easeOutCubic(seg(t, 0, 0.5));
    const sw = 6 * c.s, col = theme.accent2;
    const o = clamp01(seg(t, 0, 0.2));
    let out = `<g fill="none" stroke="${col}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" opacity="${(0.9 * o).toFixed(3)}">`
      + `<path d="M${m} ${m + L} V${m} H${m + L}"/><path d="M${w - m - L} ${m} H${w - m} V${m + L}"/>`
      + `<path d="M${m} ${h - m - L} V${h - m} H${m + L}"/><path d="M${w - m - L} ${h - m} H${w - m} V${h - m - L}"/></g>`;
    const sp = seg(t, 0.15, 0.85);
    if (sp > 0 && sp < 1) out += `<rect x="0" y="${(h * sp).toFixed(1)}" width="${w}" height="${(3 * c.s).toFixed(1)}" fill="${col}" opacity="${(0.35 * Math.sin(sp * Math.PI)).toFixed(3)}"/>`;
    return out;
  },
};


// ── 20) bottom_sheet — قائمة بتطلع من تحت الشاشة بعنوان وبنود بتظهر واحد واحد ───────────────────────────────
const bottom_sheet = {
  animEnd: (d) => 0.9 + 0.5 * Math.min(4, (d.items || []).length),
  render(c, d, t) {
    const { theme, w, h, rtl } = c;
    const items = (d.items || []).slice(0, 4).map(String);
    if (!items.length) return '';
    const pw = w * (c.portrait ? 0.9 : 0.62);
    const bSize = c.portrait ? 52 : 50;
    const wrapped = items.map(it => wrapText(it, pw - 200 * c.s, bSize * c.s, { maxLines: 2 }));
    const rowH = (ls) => ls.length * bSize * 1.25 * c.s + 24 * c.s;
    const headH = (d.title ? 110 : 44) * c.s;
    const ph = headH + wrapped.reduce((a, ls) => a + rowH(ls), 0) + 30 * c.s;
    const py = h * (c.portrait ? 0.92 : 0.84) - ph, px = (w - pw) / 2;
    const rise = easeOutBack(seg(t, 0, 0.65));
    const dy = (1 - rise) * (h - py + 40 * c.s);
    let out = SHADOW_DEF + `<g transform="translate(0,${dy.toFixed(1)})">`;
    out += panel(c, px, py, pw, ph, { r: 30 });
    out += `<rect x="${(px + 30 * c.s).toFixed(1)}" y="${py.toFixed(1)}" width="${(pw - 60 * c.s).toFixed(1)}" height="${(9 * c.s).toFixed(1)}" rx="${(4.5 * c.s).toFixed(1)}" fill="${theme.accent}"/>`;
    if (d.title) out += txt(c, d.title, px + pw / 2, py + 76 * c.s, c.portrait ? 56 : 54, { weight: 900, fill: theme.accent2 });
    let y = py + headH;
    wrapped.forEach((ls, i) => {
      const p = easeOutCubic(seg(t, 0.5 + i * 0.5, 0.95 + i * 0.5));
      const dot = rtl ? px + pw - 74 * c.s : px + 74 * c.s;
      out += `<circle cx="${dot.toFixed(1)}" cy="${(y + bSize * 0.5 * c.s + 2 * c.s).toFixed(1)}" r="${(11 * c.s * Math.max(0.01, p)).toFixed(1)}" fill="${theme.accent2}"/>`;
      ls.forEach((ln, k) => {
        out += txt(c, ln, rtl ? dot - 40 * c.s : dot + 40 * c.s, y + bSize * 0.78 * c.s + k * bSize * 1.25 * c.s + (1 - p) * 26 * c.s, bSize, { anchor: rtl ? 'end' : 'start', weight: 700, opacity: p });
      });
      y += rowH(ls);
    });
    return out + '</g>';
  },
};

// ── 21) side_note — كارت معلومة بيزحلق من جنب الشاشة (وسم + جملة قصيرة) ────────────────────────────────────
const side_note = {
  animEnd: () => 1.5,
  render(c, d, t) {
    const { theme, w, h, rtl } = c;
    const tag = String(d.tag || (c.lang === 'ar' ? 'معلومة' : 'FACT')).slice(0, 16);
    const pw = w * (c.portrait ? 0.88 : 0.38);
    const size = c.portrait ? 56 : 46;
    const lines = wrapText(String(d.text || ''), pw - 90 * c.s, size * c.s, { maxLines: 4 });
    const ph = 104 * c.s + lines.length * size * 1.3 * c.s + 36 * c.s;
    const px = c.portrait ? (w - pw) / 2 : (rtl ? w - pw - w * 0.05 : w * 0.05);
    const py = c.portrait ? h * 0.08 : h * 0.13;
    const p = easeOutCubic(seg(t, 0, 0.6));
    const fromRight = px > w / 2 || (c.portrait && rtl);
    const dx = (1 - p) * (pw + w * 0.08) * (fromRight ? 1 : -1);
    let out = SHADOW_DEF + `<g transform="translate(${dx.toFixed(1)},0)">`;
    out += panel(c, px, py, pw, ph, { r: 22 });
    out += `<rect x="${(rtl ? px + pw - 14 * c.s : px).toFixed(1)}" y="${py.toFixed(1)}" width="${(14 * c.s).toFixed(1)}" height="${ph.toFixed(1)}" fill="${theme.accent}"/>`;
    const chipW = textWidth(tag, 34 * c.s, true, true) + 48 * c.s;
    const chipX = rtl ? px + pw - 50 * c.s - chipW : px + 50 * c.s;
    out += `<rect x="${chipX.toFixed(1)}" y="${(py + 24 * c.s).toFixed(1)}" width="${chipW.toFixed(1)}" height="${(52 * c.s).toFixed(1)}" rx="${(10 * c.s).toFixed(1)}" fill="${theme.accent2}"/>`;
    out += txt(c, tag, chipX + chipW / 2, py + 61 * c.s, 34, { weight: 900, fill: '#14110a' });
    lines.forEach((ln, i) => {
      const lp = easeOutCubic(seg(t, 0.35 + i * 0.18, 0.75 + i * 0.18));
      out += txt(c, ln, rtl ? px + pw - 50 * c.s : px + 50 * c.s, py + 128 * c.s + i * size * 1.3 * c.s + (1 - lp) * 14 * c.s, size, { anchor: rtl ? 'end' : 'start', weight: 700, opacity: lp });
    });
    return out + '</g>';
  },
};

// ── 22) news_bar — شريط أخبار بيتمدّ من الجنب مع وسم والنص بيتكشف حرف حرف ────────────────────────────────
const news_bar = {
  animEnd: () => 1.9,
  render(c, d, t) {
    const { theme, w, h, rtl } = c;
    const tag = String(d.tag || (c.lang === 'ar' ? 'عاجل' : 'BREAKING')).slice(0, 14);
    const text = String(d.text || '').slice(0, 90);
    const bh = 92 * c.s, by = c.portrait ? h * 0.12 : h * 0.085;
    const size = c.portrait ? 46 : 44;
    const grow = easeInOutCubic(seg(t, 0, 0.55));
    const chipW = textWidth(tag, 38 * c.s, true, true) + 64 * c.s;
    const barW = w * 0.94;
    const x0 = (w - barW) / 2;
    const shownW = barW * grow;
    const bx = rtl ? x0 + barW - shownW : x0;
    let out = SHADOW_DEF;
    out += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${shownW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(12 * c.s).toFixed(1)}" fill="${theme.panel}" stroke="${theme.panelStroke}" stroke-width="2" filter="url(#sh)"/>`;
    if (grow > 0.5) {
      const cx0 = rtl ? x0 + barW - chipW : x0;
      out += `<rect x="${cx0.toFixed(1)}" y="${by.toFixed(1)}" width="${chipW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(12 * c.s).toFixed(1)}" fill="${theme.accent2}"/>`;
      out += txt(c, tag, cx0 + chipW / 2, by + bh * 0.66, 38, { weight: 900, fill: '#14110a' });
      const tx0 = rtl ? x0 + barW - chipW - 28 * c.s : x0 + chipW + 28 * c.s;
      const avail = barW - chipW - 56 * c.s;
      const tw = Math.min(avail, textWidth(text, size * c.s, true, false) + 8);
      const rv = easeOutCubic(seg(t, 0.5, 1.5));
      const cid = `nb${Math.round(t * 100)}`;
      const clipX = rtl ? tx0 - tw * rv : tx0;
      out += `<clipPath id="${cid}"><rect x="${clipX.toFixed(1)}" y="${by.toFixed(1)}" width="${(tw * rv).toFixed(1)}" height="${bh.toFixed(1)}"/></clipPath>`;
      out += `<g clip-path="url(#${cid})">${txt(c, text, tx0, by + bh * 0.66, size, { anchor: rtl ? 'end' : 'start', weight: 700 })}</g>`;
    }
    return out;
  },
};

// ── 12) map_reveal — خريطة عالم بكاميرا بتقرّب على الأماكن + دبابيس + مسار منحني بينهم ───────────
// إحداثيات الخريطة (من world.svg اللي اتجاب من simplemaps): equirectangular بمقياس 2.498 درجة→وحدة
const WORLD = JSON.parse(fs.readFileSync(new URL('./worldPaths.json', import.meta.url), 'utf8'));
const WORLD_PATHS = Object.values(WORLD);
const mapX = (lon) => 2.4979 * lon + 500.8;
const mapY = (lat) => -2.551 * lat + 301.66;
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h)); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128]; };
const mixHex = (a, b, f) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join(''); };

// مربع حدود كل دولة (من مسارها) + مربع أكبر جزء فيها (عشان الاسم ما يقعش على جزر بعيدة زي ألاسكا)
const regionBoxCache = new Map();
function regionBox(code) {
  if (regionBoxCache.has(code)) return regionBoxCache.get(code);
  const d = WORLD[code];
  let out = null;
  if (d) {
    const polys = d.split(/(?=M)/).map(sub => [...sub.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map(m => [+m[1], +m[2]])).filter(a => a.length);
    const box = (pts) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; };
    const all = box(polys.flat());
    const main = polys.map(box).sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];
    out = { all, main };
  }
  regionBoxCache.set(code, out);
  return out;
}
export const WORLD_CODES = new Set(Object.keys(WORLD));

function mapCamera(c, places, regions, t) {
  const k0 = Math.max(c.w / 1000, c.h / 560);
  const pts = places.map(p => ({ x: mapX(p.lon), y: mapY(p.lat) }));
  const frame = [...pts];
  for (const r of regions) { const b = regionBox(r.code)?.main; if (b) frame.push({ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y1 }); }
  const minX = Math.min(...frame.map(p => p.x)), maxX = Math.max(...frame.map(p => p.x));
  const minY = Math.min(...frame.map(p => p.y)), maxY = Math.max(...frame.map(p => p.y));
  const spanX = Math.max(70, maxX - minX), spanY = Math.max(48, maxY - minY);
  let kt = Math.min((c.w * 0.62) / spanX, (c.h * 0.5) / spanY);
  kt = Math.min(Math.max(kt, k0), k0 * 14);
  const cxT = (minX + maxX) / 2, cyT = (minY + maxY) / 2;
  const cx0 = 500, cy0 = 262;
  const p = easeInOutCubic(seg(t, 0.25, 1.9));
  const k = Math.exp(lerp(Math.log(k0), Math.log(kt), p)) * (1 + 0.03 * clamp01(seg(t, 1.9, 6)));
  const cxm = lerp(cx0, cxT, p), cym = lerp(cy0, cyT, p);
  return { k, tx: c.w / 2 - cxm * k, ty: c.h / 2 - cym * k, pts };
}

const map_reveal = {
  animEnd: (d) => 2.3 + 0.6 * Math.min(4, (d.places || []).length) + ((d.regions || []).length ? 0.5 : 0),
  render(c, d, t) {
    const { w, h, theme } = c;
    const places = (d.places || []).slice(0, 4);
    const regions = (d.regions || []).filter(r => regionBox(r.code)).slice(0, 4);
    if (!places.length && !regions.length) return '';
    const cam = mapCamera(c, places, regions, t);
    const ocean = mixHex(theme.bgTop, '#000000', 0.12);
    const land = mixHex(theme.bgBottom, theme.text, 0.2);
    const border = mixHex(theme.bgTop, theme.text, 0.12);
    const grid = mixHex(theme.bgTop, theme.text, 0.1);
    const sw = (1.1 / cam.k).toFixed(3);
    let out = SHADOW_DEF;
    out += `<rect width="${w}" height="${h}" fill="${ocean}"/>`;
    let g = '';
    for (let lon = -180; lon <= 180; lon += 30) g += `<line x1="${mapX(lon).toFixed(1)}" y1="${mapY(84).toFixed(1)}" x2="${mapX(lon).toFixed(1)}" y2="${mapY(-60).toFixed(1)}"/>`;
    for (let lat = -60; lat <= 80; lat += 20) g += `<line x1="${mapX(-180).toFixed(1)}" y1="${mapY(lat).toFixed(1)}" x2="${mapX(180).toFixed(1)}" y2="${mapY(lat).toFixed(1)}"/>`;
    out += `<g transform="translate(${cam.tx.toFixed(2)},${cam.ty.toFixed(2)}) scale(${cam.k.toFixed(4)})">`;
    out += `<g stroke="${grid}" stroke-width="${(0.8 / cam.k).toFixed(3)}" opacity="0.7">${g}</g>`;
    out += `<g fill="${land}" stroke="${border}" stroke-width="${sw}" stroke-linejoin="round">${WORLD_PATHS.map(dd => `<path d="${dd}"/>`).join('')}</g>`;
    // تظليل الدول المذكورة (لون بيظهر تدريجي) فوق الخريطة
    regions.forEach((r, i) => {
      const p = easeOutCubic(seg(t, 0.9 + i * 0.3, 1.8 + i * 0.3));
      if (p <= 0.01) return;
      out += `<path d="${WORLD[r.code]}" fill="${theme.accent}" fill-opacity="${(0.82 * p).toFixed(3)}" stroke="${theme.accent2}" stroke-opacity="${p.toFixed(3)}" stroke-width="${(2.2 / cam.k).toFixed(3)}" stroke-linejoin="round"/>`;
    });
    out += '</g>';
    regions.forEach((r, i) => {
      if (!r.label) return;
      const b = regionBox(r.code).main;
      const p = easeOutCubic(seg(t, 1.5 + i * 0.3, 2.2 + i * 0.3));
      if (p <= 0.01) return;
      const x = cam.tx + ((b.x0 + b.x1) / 2) * cam.k, y = cam.ty + ((b.y0 + b.y1) / 2) * cam.k;
      const label = c.rtl ? String(r.label) : String(r.label).toUpperCase();
      out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${c.ff}" font-size="${(40 * c.s).toFixed(1)}" font-weight="900" fill="#ffffff" fill-opacity="${(0.92 * p).toFixed(3)}" stroke="rgba(0,0,0,0.55)" stroke-width="${(5 * c.s).toFixed(1)}" paint-order="stroke" letter-spacing="${c.rtl ? 0 : (5 * c.s).toFixed(1)}">${esc(label)}</text>`;
    });
    const sc = cam.pts.map(p => ({ x: cam.tx + p.x * cam.k, y: cam.ty + p.y * cam.k }));
    // مسار منحني بين الأماكن بالترتيب
    if (places.length > 1 && d.route !== false) {
      for (let i = 0; i < sc.length - 1; i++) {
        const prog = easeInOutCubic(seg(t, 1.5 + i * 0.6, 2.4 + i * 0.6));
        if (prog <= 0.001) continue;
        const a = sc[i], b = sc[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy) || 1;
        const q = { x: (a.x + b.x) / 2 - (dy / dist) * dist * 0.22, y: (a.y + b.y) / 2 + (dx / dist) * dist * 0.22 };
        const N = 40, steps = Math.max(2, Math.round(N * prog));
        const pts = [];
        for (let s = 0; s <= steps; s++) { const u = (s / N) * 1; const m = Math.min(u, prog); pts.push([(1 - m) ** 2 * a.x + 2 * (1 - m) * m * q.x + m * m * b.x, (1 - m) ** 2 * a.y + 2 * (1 - m) * m * q.y + m * m * b.y]); }
        out += `<polyline points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${theme.accent2}" stroke-width="${(6 * c.s).toFixed(1)}" stroke-dasharray="${(18 * c.s).toFixed(0)} ${(11 * c.s).toFixed(0)}" stroke-linecap="round" opacity="0.95"/>`;
        const hd = pts[pts.length - 1];
        if (prog < 0.999) out += `<circle cx="${hd[0].toFixed(1)}" cy="${hd[1].toFixed(1)}" r="${(11 * c.s).toFixed(1)}" fill="${theme.accent2}"/>`;
      }
    }
    // دبابيس + أسماء
    const placed = [];
    places.forEach((pl, i) => {
      const at = 1.5 + i * 0.6;
      const p = easeOutBack(seg(t, at, at + 0.5));
      if (p <= 0.01) return;
      const { x, y } = sc[i];
      if (x < -50 || x > w + 50 || y < -50 || y > h + 50) return;
      const pulse = (t - at) > 0 ? ((t - at) % 1.6) / 1.6 : 0;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(16 * c.s + pulse * 46 * c.s).toFixed(1)}" fill="none" stroke="${theme.accent}" stroke-width="${(4 * c.s).toFixed(1)}" opacity="${(0.7 * (1 - pulse)).toFixed(3)}"/>`;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(15 * c.s * Math.max(0.01, p)).toFixed(1)}" fill="${theme.accent}" stroke="#ffffff" stroke-width="${(4 * c.s).toFixed(1)}"/>`;
      const label = String(pl.name || '');
      const size = 42;
      const tw = textWidth(label, size * c.s, true) + 44 * c.s;
      let above = !placed.some(q => Math.abs(q.x - x) < (q.tw + tw) / 2 + 10 && Math.abs(q.y - (y - 70 * c.s)) < 50 * c.s);
      const ly = above ? y - 58 * c.s : y + 58 * c.s;
      const lx = Math.min(w - tw / 2 - 12, Math.max(tw / 2 + 12, x));
      placed.push({ x: lx, y: ly, tw });
      const op = clamp01(p);
      out += `<rect x="${(lx - tw / 2).toFixed(1)}" y="${(ly - 34 * c.s).toFixed(1)}" width="${tw.toFixed(1)}" height="${(56 * c.s).toFixed(1)}" rx="${(14 * c.s).toFixed(1)}" fill="rgba(0,0,0,0.72)" stroke="${theme.accent}" stroke-width="${(2.5 * c.s).toFixed(1)}" opacity="${op.toFixed(3)}"/>`;
      out += txt(c, label, lx, ly + 8 * c.s, size, { weight: 800, fill: '#ffffff', opacity: op });
    });
    if (d.title) {
      const op = easeOutCubic(seg(t, 0.1, 0.7));
      const tw = textWidth(d.title, 46 * c.s, true) + 56 * c.s;
      out += `<rect x="${(c.cx - tw / 2).toFixed(1)}" y="${(c.h * 0.07).toFixed(1)}" width="${tw.toFixed(1)}" height="${(72 * c.s).toFixed(1)}" rx="${(16 * c.s).toFixed(1)}" fill="rgba(0,0,0,0.6)" opacity="${op.toFixed(3)}"/>`;
      out += txt(c, d.title, c.cx, c.h * 0.07 + 50 * c.s, 46, { weight: 800, opacity: op });
    }
    return out;
  },
};

// ── 13) photo_board — لوحة صور أرشيفية معلّقة (صور مائلة بدبابيس على ورق/مكتب + شريط عنوان) ───────────
const photo_board = {
  animEnd: (d) => 1.4 + 0.5 * Math.max(1, (d.photos || []).length),
  render(c, d, t) {
    const { w, h, theme } = c;
    const photos = (d.photos || []).slice(0, 4);
    const n = photos.length;
    if (!n) return '';
    const dark = !!d._dark;
    const POL = { h: 1.22, pad: 0.06, cap: 0.22 };
    const ROT = [-5, 3.5, -3, 5];
    // التخطيط: أفقي = صف مع تمايل بسيط، رأسي = تعرّج
    let pw, pos;
    if (c.portrait) {
      pw = w * (n >= 4 ? 0.42 : n === 3 ? 0.46 : 0.52);
      const ys = n === 2 ? [0.33, 0.67] : n === 3 ? [0.26, 0.5, 0.74] : [0.26, 0.4, 0.6, 0.74];
      pos = photos.map((_, i) => ({ x: w * (n === 2 ? (i % 2 ? 0.66 : 0.34) : (i % 2 ? 0.7 : 0.3)), y: h * ys[i] }));
    } else {
      const ph = h * (n >= 4 ? 0.5 : 0.56);
      pw = ph / POL.h;
      const step = n === 2 ? 0.27 : n === 3 ? 0.265 : 0.215;
      pos = photos.map((_, i) => ({ x: w * (0.5 + (i - (n - 1) / 2) * step), y: h * 0.57 + (i % 2 ? 1 : -1) * h * 0.022 }));
    }
    const ph = pw * POL.h;
    const pad = pw * POL.pad, cap = pw * POL.cap;
    const card = dark ? '#f4f1ea' : '#fbf8f1';
    const ink = '#2a2218';
    let out = `<defs><filter id="pbsh" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="${(14 * c.s).toFixed(1)}"/><feOffset dy="${(12 * c.s).toFixed(1)}" result="o"/><feComponentTransfer><feFuncA type="linear" slope="0.5"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter><radialGradient id="pin" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#ff8a80"/><stop offset="0.5" stop-color="#d32f2f"/><stop offset="1" stop-color="#7f1010"/></radialGradient></defs>`;
    if (d._bg) out += `<image href="${d._bg}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`;
    else out += `<rect width="${w}" height="${h}" fill="${theme.bgBottom}"/>`;
    const zoom = 1 + 0.012 * Math.min(t, 4);
    out += `<g transform="translate(${(w / 2).toFixed(1)},${(h / 2).toFixed(1)}) scale(${zoom.toFixed(4)}) translate(${(-w / 2).toFixed(1)},${(-h / 2).toFixed(1)})">`;
    photos.forEach((p, i) => {
      const st = 0.35 + i * 0.5;
      const e = easeOutBack(seg(t, st, st + 0.55));
      if (e <= 0.01) return;
      const sway = Math.sin((t - st) * 1.6 + i) * 0.7 * clamp01(seg(t, st + 0.5, st + 1.2));
      const rot = ROT[i % 4] + (1 - e) * (i % 2 ? 14 : -14) + sway;
      const dy = (1 - Math.min(1, e)) * -h * 0.45;
      const sc = 0.82 + 0.18 * Math.min(1.04, e);
      const { x, y } = pos[i];
      let g = `<g transform="translate(${x.toFixed(1)},${(y + dy).toFixed(1)}) rotate(${rot.toFixed(2)}) scale(${sc.toFixed(3)})" opacity="${clamp01(e * 2).toFixed(3)}">`;
      // ضل رخيص (طبقات شفافة متزاحة) بدل فلتر blur — أسرع بكتير في الرندر
      for (let k = 3; k >= 1; k--) g += `<rect x="${(-pw / 2 - k * 3 * c.s).toFixed(1)}" y="${(-ph / 2 + k * 5 * c.s).toFixed(1)}" width="${(pw + k * 6 * c.s).toFixed(1)}" height="${(ph + k * 3 * c.s).toFixed(1)}" rx="${((4 + k * 3) * c.s).toFixed(1)}" fill="#000" fill-opacity="0.11"/>`;
      g += `<rect x="${(-pw / 2).toFixed(1)}" y="${(-ph / 2).toFixed(1)}" width="${pw.toFixed(1)}" height="${ph.toFixed(1)}" rx="${(4 * c.s).toFixed(1)}" fill="${card}"/>`;
      const ix = -pw / 2 + pad, iy = -ph / 2 + pad, iw = pw - pad * 2, ih = ph - pad - cap;
      if (p.uri) g += `<image href="${p.uri}" x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" preserveAspectRatio="xMidYMid slice"/>`;
      g += `<rect x="${ix.toFixed(1)}" y="${iy.toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="${(1.5 * c.s).toFixed(1)}"/>`;
      if (p.caption) g += `<text x="0" y="${(ph / 2 - cap * 0.36).toFixed(1)}" text-anchor="middle" font-family="${c.ff}" font-size="${(cap * 0.46).toFixed(1)}" font-weight="700" font-style="italic" fill="${ink}">${esc(p.caption)}</text>`;
      g += `<circle cx="0" cy="${(-ph / 2 + pad * 0.55).toFixed(1)}" r="${(pw * 0.034).toFixed(1)}" fill="url(#pin)" stroke="rgba(0,0,0,0.35)" stroke-width="${(1.5 * c.s).toFixed(1)}"/>`;
      g += '</g>';
      out += g;
    });
    out += '</g>';
    if (d.title) {
      const e = easeOutCubic(seg(t, 0.1, 0.7));
      const size = 50 * c.s;
      const tw = textWidth(d.title.toUpperCase(), size, true) + 90 * c.s;
      const ty = c.portrait ? h * 0.085 : h * 0.12;
      out += `<g transform="translate(${(w / 2).toFixed(1)},${ty.toFixed(1)}) rotate(-2.5) scale(${Math.max(0.01, e).toFixed(3)},1)" opacity="${clamp01(e * 1.6).toFixed(3)}">`;
      out += `<rect x="${(-tw / 2).toFixed(1)}" y="${(-size * 0.95).toFixed(1)}" width="${tw.toFixed(1)}" height="${(size * 1.55).toFixed(1)}" fill="#efe3bf" fill-opacity="0.94" stroke="rgba(0,0,0,0.18)" stroke-width="1.5"/>`;
      out += `<text x="0" y="${(size * 0.22).toFixed(1)}" text-anchor="middle" font-family="${c.ff}" font-size="${size.toFixed(1)}" font-weight="900" letter-spacing="${c.rtl ? 0 : (4 * c.s).toFixed(1)}" fill="${ink}">${esc(c.rtl ? d.title : d.title.toUpperCase())}</text>`;
      out += '</g>';
    }
    return out;
  },
};

export const TEMPLATES = { map_reveal, photo_board, title_card, lower_third, quote, bullet_panel, evidence_board, counter, bar_chart, donut_chart, timeline, route_diagram, kinetic_text, stack_text, marker_text, icon_pop, date_card, vs_card, stamp, percent_ring, wipe_bars, corner_frame, bottom_sheet, side_note, news_bar };
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export function templateAnimEnd(name, data) {
  const tpl = TEMPLATES[name];
  return tpl ? tpl.animEnd(data || {}) : 0;
}

// بيرجّع SVG كامل لإطار واحد. exit: 0..1 تقدّم الخروج (بيتطبّق fade + نزول بسيط على كل المحتوى)
export function renderTemplateFrame(name, data, t, { w, h, theme, lang = 'en', rtl = false, exit = 0, outline = false }) {
  const tpl = TEMPLATES[name];
  if (!tpl) throw new Error(`Unknown template: ${name}`);
  const c = ctx(w, h, theme, lang, rtl, { ...(name === 'quote' || name === 'photo_board' ? { serif: true } : {}), outline });
  const inner = tpl.render(c, data || {}, t);
  const e = clamp01(exit);
  const wrap = e > 0 ? `<g opacity="${(1 - easeInOutCubic(e)).toFixed(3)}" transform="translate(0,${(easeInOutCubic(e) * 26 * c.s).toFixed(1)})">${inner}</g>` : inner;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${wrap}</svg>`;
}
