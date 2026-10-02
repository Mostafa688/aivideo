// ── captions.js ── كابشن ASS من توقيت الكلمات (ستايلات: box | karaoke | pop) — بيدعم RTL
import { getTheme } from './themes.js';
import { isRtlLang } from './textutil.js';

const toAss = (s) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60), cs = Math.min(99, Math.round((s % 1) * 100));
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
};
const hexToAssBGR = (hex, alpha = 0) => {
  const h = hex.replace('#', '');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}`.toUpperCase();
};
const cleanWord = (w) => String(w).replace(/[{}\\]/g, '').replace(/\n/g, ' ');

// تجميع الكلمات في عبارات قصيرة (حد كلمات/حروف/مدة، وبنقطع عند علامات الترقيم والفجوات)
export function groupWords(words, { maxWords = 6, maxChars = 32, maxDur = 3.2, gap = 0.55 } = {}) {
  const groups = [];
  let cur = [];
  const flush = () => { if (cur.length) { groups.push(cur); cur = []; } };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (cur.length) {
      const prev = cur[cur.length - 1];
      const chars = cur.map(x => x.w).join(' ').length + 1 + String(w.w).length;
      if (cur.length >= maxWords || chars > maxChars || w.end - cur[0].start > maxDur || w.start - prev.end > gap) flush();
    }
    cur.push(w);
    if (/[.!?؟،,;:]$/.test(String(w.w)) && cur.length >= 2) flush();
  }
  flush();
  return groups;
}

export function buildCaptionsAss({ words, style = 'karaoke', w = 1920, h = 1080, lang = 'en', theme = 'blue' }) {
  const th = getTheme(theme);
  const rtl = isRtlLang(lang);
  const portrait = h > w;
  const font = rtl ? 'Noto Naskh Arabic' : 'Noto Sans';
  const fs = portrait ? 78 : 64;
  const marginV = portrait ? Math.round(h * 0.2) : Math.round(h * 0.075);
  const maxChars = portrait ? 20 : 34;
  // ألوان الكابشن ثابتة عالية التباين (مستقلة عن ستايل الخلفية) — أبيض + أصفر للكلمة الحالية
  const white = '&H00FFFFFF', accent = hexToAssBGR('#FFD60A');
  const boxBack = '&H99000000';
  // BorderStyle 3 = صندوق معتم ورا النص (زي الشكل اللي في المنافسين)، 1 = ستروك
  const isBox = style === 'box';
  const styles = `Style: Cap,${font},${fs},${style === 'karaoke' ? accent : white},${style === 'karaoke' ? white : white},&H00000000,${isBox ? boxBack : '&H64000000'},-1,0,0,0,100,100,0,0,${isBox ? 3 : 1},${isBox ? 12 : 5},${isBox ? 0 : 2},2,60,60,${marginV},1`;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const groups = groupWords(words, { maxChars });
  const events = [];
  for (const g of groups) {
    const gStart = g[0].start, gEnd = Math.max(g[g.length - 1].end, gStart + 0.3);
    if (style === 'box') {
      events.push(`Dialogue: 0,${toAss(gStart)},${toAss(gEnd)},Cap,,0,0,0,,${g.map(x => cleanWord(x.w)).join(' ')}`);
    } else if (style === 'karaoke') {
      // \kf = تعبئة لون تدريجية على كل كلمة بمدتها الحقيقية
      const text = g.map((x, i) => {
        const nextStart = i < g.length - 1 ? g[i + 1].start : gEnd;
        const cs = Math.max(1, Math.round((nextStart - x.start) * 100));
        return `{\\kf${cs}}${cleanWord(x.w)}`;
      }).join(' ');
      events.push(`Dialogue: 0,${toAss(gStart)},${toAss(gEnd)},Cap,,0,0,0,,${text}`);
    } else {
      // pop: كل كلمة بتظهر في وقتها (تراكمي جوه العبارة) والكلمة الحالية بتكبر نبضة قصيرة وبلون مميز
      g.forEach((x, i) => {
        const st = x.start, en = i < g.length - 1 ? g[i + 1].start : gEnd;
        const shown = g.slice(0, i + 1).map((y, k) => (k === i
          ? `{\\c${accent}\\fscx118\\fscy118\\t(0,110,\\fscx100\\fscy100)}${cleanWord(y.w)}{\\c${white}}`
          : cleanWord(y.w))).join(' ');
        events.push(`Dialogue: 0,${toAss(st)},${toAss(Math.max(en, st + 0.12))},Cap,,0,0,0,,${shown}`);
      });
    }
  }
  return header + events.join('\n') + '\n';
}
