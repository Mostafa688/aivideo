// ── common.js ── مكوّنات رسم مشتركة بين المشاهد
import { f1, f2, esc, wrapText, textWidth, clamp01, lerp, easeOutCubic, easeOutBack, easeInOutCubic, easeOutExpo, seg, spring, fade, rgba, mix, lighten, darken, uid, txt } from './design.js';

export const ent = (t, at, dur = 0.6) => {
  const x = (t - at) / dur;
  return { p: x <= 0 ? 0 : spring(x * 0.55, { k: 11, d: 6.5 }), o: clamp01((t - at) / Math.min(0.3, dur)), x: clamp01(x), raw: x };
};

export const cardFill = (c) => (c.pal.dark ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.9)');
export const cardStroke = (c) => (c.pal.dark ? 'rgba(255,255,255,0.2)' : 'rgba(15,23,42,0.14)');

/** لوحة/كارت بزوايا مدوّرة + ظل سفلي + خط إضاءة علوي */
export function card(c, x, y, w, h, { r = 30, fill = null, stroke = null, accent = null, opacity = 1, shadow = true } = {}) {
  const s = c.s; const R = r * s;
  let o = `<g opacity="${f2(opacity)}">`;
  if (shadow) o += `<rect x="${f1(x + 6 * s)}" y="${f1(y + 14 * s)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(R)}" fill="#000" opacity="${c.pal.dark ? 0.32 : 0.12}"/>`;
  o += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${f1(R)}" fill="${fill || cardFill(c)}" stroke="${stroke || cardStroke(c)}" stroke-width="${f1(2.4 * s)}"/>`;
  if (c.pal.dark) o += `<rect x="${f1(x + R * 0.6)}" y="${f1(y + 1.5 * s)}" width="${f1(w - R * 1.2)}" height="${f1(2 * s)}" rx="${f1(s)}" fill="#fff" opacity="0.28"/>`;
  if (accent) o += `<rect x="${f1(x)}" y="${f1(y + R * 0.7)}" width="${f1(9 * s)}" height="${f1(h - R * 1.4)}" rx="${f1(4.5 * s)}" fill="${accent}"/>`;
  return o + '</g>';
}

export function pill(c, cx, cy, text, size, { fill = c.pal.a1, color = null, opacity = 1, padX = 0.9, solid = false } = {}) {
  const wd = textWidth(text, size, true) + size * padX * 2, hh = size * 1.9;
  const col = color || (solid ? (c.pal.dark ? '#06070f' : '#fff') : fill);
  return `<g opacity="${f2(opacity)}"><rect x="${f1(cx - wd / 2)}" y="${f1(cy - hh / 2)}" width="${f1(wd)}" height="${f1(hh)}" rx="${f1(hh / 2)}" fill="${solid ? fill : rgba(fill, 0.16)}" stroke="${fill}" stroke-width="${f1(size * 0.07)}"/>` + txt(c, text, cx, cy + size * 0.35, size, { weight: 800, fill: col, spacing: size * 0.06 }) + '</g>';
}

// التوهّج الكبير بقى جزء من الـplate الناعم (الدوايير الشعاعية الكبيرة غالية في الرسم كل إطار) — الدالة دي بتفضل للتوافق وبترجّع فاضي
export function glowCircle(c, name, cx, cy, r, col, op = 0.5) {
  return '';
  // eslint-disable-next-line no-unreachable
  return `<defs><radialGradient id="${uid(c, name)}"><stop offset="0" stop-color="${col}" stop-opacity="${op}"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></radialGradient></defs><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}" fill="url(#${uid(c, name)})"/>`;
}

export function gradientDef(c, name, c1, c2, { x1 = 0, y1 = 0, x2 = 1, y2 = 0 } = {}) {
  return `<defs><linearGradient id="${uid(c, name)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
}

/** عنوان صغير أعلى المشهد (اختياري) */
export function sceneTitle(c, title, t, y = null) {
  if (!title) return '';
  const { w, h, s, pal } = c; const e = ent(t, 0.05, 0.5);
  const size = (c.portrait ? 54 : 52) * s; const yy = y ?? h * (c.portrait ? 0.13 : 0.15);
  const lines = wrapText(title, w * 0.86, size, { maxLines: 2 });
  let o = '';
  lines.forEach((ln, i) => { o += txt(c, ln, w / 2, yy + i * size * 1.2 + (1 - e.p) * 30 * s, size, { weight: 800, fill: pal.muted, opacity: e.o, spacing: size * 0.02 }); });
  const lw = Math.min(w * 0.14, 150 * s) * easeOutCubic(seg(t, 0.15, 0.7));
  o += `<rect x="${f1(w / 2 - lw / 2)}" y="${f1(yy + lines.length * size * 1.2 - size * 0.45)}" width="${f1(lw)}" height="${f1(5 * s)}" rx="${f1(2.5 * s)}" fill="${pal.a1}"/>`;
  return o;
}

export const num = (v, decimals = 0) => {
  const n = Number(v); if (!Number.isFinite(n)) return String(v ?? '');
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
export const decimalsOf = (v) => { const m = String(v).split('.')[1]; return m ? Math.min(2, m.length) : 0; };

/** ترتيب كلمات في أسطر بعرض حقيقي (من measurer) — بيرجّع الأسطر + إزاحة x لكل كلمة (من مركز السطر) */
export function layoutWords(words, size, maxW, mm, rtl) {
  const sp = rtl ? Math.max(mm.space(size), size * 0.3) : mm.space(size); const lines = []; let cur = [], curW = 0;
  words.forEach((wd, i) => {
    const ww = mm.word(wd.text, size);
    const add = cur.length ? sp + ww : ww;
    if (cur.length && curW + add > maxW) { lines.push({ items: cur, width: curW }); cur = []; curW = 0; }
    cur.push({ ...wd, i, width: ww }); curW += cur.length > 1 ? sp + ww : ww;
  });
  if (cur.length) lines.push({ items: cur, width: curW });
  for (const ln of lines) {
    let x = -ln.width / 2;
    const seq = rtl ? [...ln.items].reverse() : ln.items; // العربي: أول كلمة (منطقيًا) على اليمين
    for (const it of seq) { it.cx = x + it.width / 2; x += it.width + sp; }
  }
  return lines;
}
