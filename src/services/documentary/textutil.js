// ── textutil.js ── أدوات نص لقوالب SVG: هروب، لفّ سطور تقريبي، خطوط حسب اللغة
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const isRtlLang = (lang) => ['ar', 'he', 'fa', 'ur'].includes(String(lang || '').toLowerCase().split(/[-_]/)[0]);

// عائلات الخطوط (fontconfig بيختار أول واحد متاح) — Noto موجود على Railway (nixpacks.toml)
export function fontStack(lang, { serif = false, hand = false } = {}) {
  if (isRtlLang(lang)) return "'Noto Naskh Arabic', 'Noto Sans Arabic', 'Noto Sans Arabic UI', 'DejaVu Sans', sans-serif";
  if (hand) return "'Caveat', 'Noto Sans', 'DejaVu Sans', cursive, sans-serif";
  if (serif) return "'Noto Serif', 'DejaVu Serif', serif";
  return "'Noto Sans', 'DejaVu Sans', sans-serif";
}

// عرض تقريبي للنص (px) — كفاية للّف السطور؛ العربي أضيق شوية للحرف الواحد
export function textWidth(text, fontSize, bold = true, heavy = false) {
  let w = 0;
  for (const ch of String(text)) {
    const code = ch.codePointAt(0);
    if (code >= 0x0600 && code <= 0x06ff) w += fontSize * 0.5;
    else if (ch === ' ') w += fontSize * 0.28;
    else if ('ilI.,;:!|\''.includes(ch)) w += fontSize * 0.3;
    else if ('mwMW'.includes(ch)) w += fontSize * 0.85;
    else if (code > 0x2e80) w += fontSize * 1.0; // CJK
    else w += fontSize * (heavy ? 0.68 : bold ? 0.58 : 0.54);
  }
  return w;
}

// بيلف النص لسطور لا تتعدى maxWidth، ويرجّع مصفوفة سطور (بحد أقصى maxLines — آخر سطر بيتقطع بـ…)
export function wrapText(text, maxWidth, fontSize, { bold = true, maxLines = 6 } = {}) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (textWidth(test, fontSize, bold) <= maxWidth || !cur) cur = test;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[\s.,;:!?-]*$/, '') + '…';
    return kept;
  }
  return lines;
}

export const fmtNumber = (n, decimals = 0) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? '');
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
