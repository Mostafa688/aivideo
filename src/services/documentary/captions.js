// ── captions.js ── كابشن ASS من توقيت الكلمات (ستايلات: box | karaoke | pop) — بيدعم RTL
import { getTheme } from './themes.js';
import sharp from 'sharp';
import fs_ from 'fs';
import os from 'os';
import path from 'path';
import { ffmpeg, rmQuiet } from './ff.js';
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


const capLayout = (lang, w, h, fsScale = 1) => {
  const rtl = isRtlLang(lang);
  const portrait = h > w;
  return { rtl, portrait, font: rtl ? 'Noto Naskh Arabic' : 'Noto Sans', fs: Math.round((portrait ? 78 : 64) * (rtl ? (portrait ? 1.35 : 1.75) : 1) * fsScale) };  // العربي (Naskh) أصغر بصريًا بنفس الرقم فبنكبّره
};

// قياس عرض كل كلمة بنفس الخط (pango/fontconfig) — بنحتاجه في العربي عشان نوزّع الكلمات بنفسنا:
// libass بيقلب ترتيب/تلوين الكلمات لما يبقى فيه tags لون أو \kf جوه سطر RTL (بيختلف حسب إصدار libass)
const sharpWidth = async (text, font, fs) => (await sharp({ text: { text: text.replace(/&/g, '&amp;').replace(/</g, '&lt;'), font: `${font} Bold ${fs}`, rgba: true, dpi: 72 } }).metadata()).width;

// libass بيفسّر حجم الخط كارتفاع سطر كامل (مش em) فالكلمة بتطلع أصغر من pango بنفس الرقم؛ بنعايرها
// مرة بتجربة رسم حقيقية بـlibass نفسه (ffmpeg) ونقيس عرض الحبر، فالتوزيع بيطابق أي إصدار/خط
let calibCache = null;
async function calibrate(font, fs, ffmpegBin = 'ffmpeg') {
  const key = `${font}|${fs}`;
  if (calibCache?.key === key) return calibCache.k;
  const dir = fs_.mkdtempSync(path.join(os.tmpdir(), 'capcal-'));
  try {
    const W = 1600, H = 300, probe = 'مممممممممم';
    const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: C,${font},${fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:02.00,C,,0,0,0,,${probe}\n`;
    const assFile = path.join(dir, 'c.ass'), png = path.join(dir, 'c.png');
    fs_.writeFileSync(assFile, ass);
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1`, '-vf', `ass=${assFile.replace(/\\/g, '/').replace(/:/g, '\\\\:')}`, '-frames:v', '1', png]);
    const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let min = info.width, max = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[y * info.width + x] > 90) { if (x < min) min = x; if (x > max) max = x; }
    const ink = max - min + 1;
    const pw = await sharpWidth(probe, font, fs);
    const k = ink > 20 && pw > 20 ? ink / pw : null;
    calibCache = { key, k };
    return k;
  } finally { rmQuiet(dir); }
}

export async function measureCaptionWords(words, { lang = 'ar', w = 1920, h = 1080, fsScale = 1 } = {}) {
  const { font, fs } = capLayout(lang, w, h, fsScale);
  const k = await calibrate(font, fs);
  if (!k || k < 0.3 || k > 1.2) throw new Error('caption calibration failed');
  const map = new Map();
  for (const x of words) {
    const t = cleanWord(x.w);
    if (!t || map.has(t)) continue;
    map.set(t, (await sharpWidth(t, font, fs)) * k);
  }
  return map;
}

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

export function buildCaptionsAss({ words, style = 'karaoke', w = 1920, h = 1080, lang = 'en', theme = 'blue', widths = null, position = 'bottom', fsScale = 1, title = null }) {
  const th = getTheme(theme);
  const wordMode = style === 'word'; // الفيديو الطولي: كلمة كلمة، في النص، كبيرة جدًا، بدخول بوب
  const { rtl, portrait, font, fs } = capLayout(lang, w, h, wordMode ? fsScale * 2.3 : fsScale);
  const center = wordMode || position === 'center'; // فيديو قصير: كابشن في النص، كلمات قليلة، دخول سريع (hook)
  const marginV = center ? 0 : (portrait ? Math.round(h * 0.2) : Math.round(h * (fs > 66 ? 0.085 : 0.075)));
  const maxChars = center ? (portrait ? 14 : 20) : (portrait ? 20 : 34);
  // ألوان الكابشن ثابتة عالية التباين (مستقلة عن ستايل الخلفية) — أبيض + أصفر للكلمة الحالية
  const white = '&H00FFFFFF', accent = hexToAssBGR('#FFD60A');
  const boxBack = '&H99000000';
  // BorderStyle 3 = صندوق معتم ورا النص (زي الشكل اللي في المنافسين)، 1 = ستروك
  const isBox = style === 'box';
  const styles = `Style: Cap,${font},${fs},${style === 'karaoke' ? accent : white},${style === 'karaoke' ? white : white},&H00000000,${isBox ? boxBack : '&H64000000'},-1,0,0,0,100,100,0,0,${isBox ? 3 : 1},${isBox ? 12 : 5},${isBox ? 0 : 2},${center ? 5 : 2},60,60,${marginV},1`;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles}${title?.text ? `\nStyle: Title,${font},${Math.round(fs * 0.95)},&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,-1,0,0,0,100,100,0,0,3,${Math.round(fs * 0.22)},0,8,80,80,${Math.round(h * (portrait ? 0.14 : 0.1))},1` : ''}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = [];
  if (wordMode) {
    // كلمة واحدة في كل لحظة: بتدخل بنبضة تكبير (pop) وبتتلوّن حسب طولها (الطويلة أصفر)، وبتتصغّر لو الكلمة طويلة عشان تفضل جوه الإطار
    const lim = w * 0.88;
    words.forEach((x, k) => {
      const text = cleanWord(x.w).replace(/[.,;:!?؟،؛…"“”()\[\]]+/g, '').trim();
      if (!text) return;
      const shown = rtl ? text : text.toUpperCase();
      const st = x.start, nxt = k < words.length - 1 ? words[k + 1].start : x.end + 0.4;
      const en = Math.max(st + 0.2, Math.min(nxt, x.end + 0.3));
      const est = shown.length * fs * (rtl ? 0.5 : 0.62); // تقدير عرض الكلمة بالبكسل
      const k2 = est > lim ? Math.max(0.55, lim / est) : 1;
      const color = shown.length >= 6 ? accent : white;
      const size = Math.round(fs * k2);
      events.push(`Dialogue: 0,${toAss(st)},${toAss(en)},Cap,,0,0,0,,{\\an5\\pos(${(w / 2).toFixed(0)},${(h / 2).toFixed(0)})\\fs${size}\\bord${Math.round(size * 0.075)}\\c${color}\\fad(40,50)\\fscx55\\fscy55\\t(0,120,\\fscx114\\fscy114)\\t(120,210,\\fscx100\\fscy100)}${shown}`);
    });
    return header + events.join('\n') + '\n';
  }
  const groups = groupWords(words, { maxChars, maxWords: center ? 3 : 6, maxDur: center ? 2.2 : 3.2 });
  const cw = (x) => (center && !rtl ? cleanWord(x).toUpperCase() : cleanWord(x));
  const popIn = center ? '{\\fad(60,40)\\fscx86\\fscy86\\t(0,110,\\fscx100\\fscy100)}' : '';
  for (const g of groups) {
    const gStart = g[0].start, gEnd = Math.max(g[g.length - 1].end, gStart + 0.3);
    if (rtl && style !== 'box') {
      // RTL: كل كلمة حدث لوحدها بموضع محسوب (run واحد = بيتعرض صح في أي إصدار libass)
      const texts = g.map(x => cleanWord(x.w));
      if (!widths || texts.some(t => !widths.has(t))) {
        events.push(`Dialogue: 0,${toAss(gStart)},${toAss(gEnd)},Cap,,0,0,0,,${texts.join(' ')}`);
        continue;
      }
      const gap = fs * 0.28;
      const total = texts.reduce((a, t) => a + widths.get(t), 0) + gap * (texts.length - 1);
      let right = w / 2 + total / 2;
      const cy = center ? h * 0.5 : h - marginV - fs * 0.62;
      const pos = texts.map(t => { const cx = right - widths.get(t) / 2; right -= widths.get(t) + gap; return cx; });
      const ev = (st, en, k, extra, color) => events.push(`Dialogue: ${color === white ? 0 : 1},${toAss(st)},${toAss(en)},Cap,,0,0,0,,{\\an5\\pos(${pos[k].toFixed(1)},${cy.toFixed(1)})${center ? '\\fad(60,40)' : ''}\\c${color}${extra}}${texts[k]}`);
      const startOf = (k) => g[k].start;
      const nextOf = (k) => (k < g.length - 1 ? g[k + 1].start : gEnd);
      if (style === 'karaoke') {
        g.forEach((_, k) => { ev(gStart, gEnd, k, '', white); ev(startOf(k), gEnd, k, '', accent); });
      } else {
        g.forEach((_, k) => {
          const st = startOf(k);
          ev(st, gEnd, k, '', white);
          ev(st, Math.max(nextOf(k), st + 0.12), k, '\\fscx118\\fscy118\\t(0,110,\\fscx100\\fscy100)', accent);
        });
      }
    } else if (style === 'box') {
      events.push(`Dialogue: 0,${toAss(gStart)},${toAss(gEnd)},Cap,,0,0,0,,${popIn}${g.map(x => cw(x.w)).join(' ')}`);
    } else if (style === 'karaoke') {
      // \kf = تعبئة لون تدريجية على كل كلمة بمدتها الحقيقية
      const text = g.map((x, i) => {
        const nextStart = i < g.length - 1 ? g[i + 1].start : gEnd;
        const cs = Math.max(1, Math.round((nextStart - x.start) * 100));
        return `{\\kf${cs}}${cw(x.w)}`;
      }).join(' ');
      events.push(`Dialogue: 0,${toAss(gStart)},${toAss(gEnd)},Cap,,0,0,0,,${popIn}${text}`);
    } else {
      // pop: كل كلمة بتظهر في وقتها (تراكمي جوه العبارة) والكلمة الحالية بتكبر نبضة قصيرة وبلون مميز
      g.forEach((x, i) => {
        const st = x.start, en = i < g.length - 1 ? g[i + 1].start : gEnd;
        const shown = g.slice(0, i + 1).map((y, k) => (k === i
          ? `{\\c${accent}\\fscx118\\fscy118\\t(0,110,\\fscx100\\fscy100)}${cw(y.w)}{\\c${white}}`
          : cw(y.w))).join(' ');
        events.push(`Dialogue: 0,${toAss(st)},${toAss(Math.max(en, st + 0.12))},Cap,,0,0,0,,${shown}`);
      });
    }
  }
  if (title?.text) {
    const ts = title.start ?? 0.15, te = title.end ?? 2.6;
    events.push(`Dialogue: 2,${toAss(ts)},${toAss(te)},Title,,0,0,0,,{\\fad(260,260)\\fscx82\\fscy82\\t(0,280,\\fscx100\\fscy100)}${String(title.text).replace(/[{}\\]/g, '').slice(0, 60)}`);
  }
  return header + events.join('\n') + '\n';
}
