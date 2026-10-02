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
  return { w, h, s, theme, rtl, lang, ff: fontStack(lang, opts), portrait: h > w, cx: w / 2, cy: h / 2 };
}

const txt = (c, text, x, y, size, { weight = 800, fill, anchor = 'middle', opacity = 1, ls = 0, family, italic = false } = {}) =>
  `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${family || c.ff}" font-size="${(size * c.s).toFixed(1)}" font-weight="${weight}" fill="${fill || c.theme.text}" text-anchor="${anchor}" opacity="${opacity.toFixed(3)}"${ls ? ` letter-spacing="${ls}"` : ''}${italic ? ' font-style="italic"' : ''}>${esc(text)}</text>`;

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


// ── 12) map_reveal — خريطة عالم بكاميرا بتقرّب على الأماكن + دبابيس + مسار منحني بينهم ───────────
// إحداثيات الخريطة (من world.svg اللي اتجاب من simplemaps): equirectangular بمقياس 2.498 درجة→وحدة
const WORLD = JSON.parse(fs.readFileSync(new URL('./worldPaths.json', import.meta.url), 'utf8'));
const WORLD_PATHS = Object.values(WORLD);
const mapX = (lon) => 2.4979 * lon + 500.8;
const mapY = (lat) => -2.551 * lat + 301.66;
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h)); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128]; };
const mixHex = (a, b, f) => { const A = hex2rgb(a), B = hex2rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, '0')).join(''); };

function mapCamera(c, places, t) {
  const k0 = Math.max(c.w / 1000, c.h / 560);
  const pts = places.map(p => ({ x: mapX(p.lon), y: mapY(p.lat) }));
  const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
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
  animEnd: (d) => 2.3 + 0.6 * Math.min(4, (d.places || []).length),
  render(c, d, t) {
    const { w, h, theme } = c;
    const places = (d.places || []).slice(0, 4);
    if (!places.length) return '';
    const cam = mapCamera(c, places, t);
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
    out += '</g>';
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

export const TEMPLATES = { map_reveal, title_card, lower_third, quote, bullet_panel, evidence_board, counter, bar_chart, donut_chart, timeline, route_diagram, kinetic_text };
export const TEMPLATE_NAMES = Object.keys(TEMPLATES);

export function templateAnimEnd(name, data) {
  const tpl = TEMPLATES[name];
  return tpl ? tpl.animEnd(data || {}) : 0;
}

// بيرجّع SVG كامل لإطار واحد. exit: 0..1 تقدّم الخروج (بيتطبّق fade + نزول بسيط على كل المحتوى)
export function renderTemplateFrame(name, data, t, { w, h, theme, lang = 'en', rtl = false, exit = 0 }) {
  const tpl = TEMPLATES[name];
  if (!tpl) throw new Error(`Unknown template: ${name}`);
  const c = ctx(w, h, theme, lang, rtl, name === 'quote' ? { serif: true } : {});
  const inner = tpl.render(c, data || {}, t);
  const e = clamp01(exit);
  const wrap = e > 0 ? `<g opacity="${(1 - easeInOutCubic(e)).toFixed(3)}" transform="translate(0,${(easeInOutCubic(e) * 26 * c.s).toFixed(1)})">${inner}</g>` : inner;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${wrap}</svg>`;
}
