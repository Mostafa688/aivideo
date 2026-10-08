// ── themes.js ── ستايلات الخلفية (زي Blue/Cinematic/Vintage/Light/Grid) + ألوان القوالب
export const THEMES = {
  blue: {
    label: 'Blue', bgTop: '#0b1530', bgBottom: '#12285a', text: '#ffffff', muted: '#9fb4e8', accent: '#4f8cff', accent2: '#ffd166',
    panel: 'rgba(8,16,40,0.78)', panelStroke: 'rgba(120,160,255,0.35)', grain: 0.05, vignette: 0.45, grade: 'cool',
  },
  cinematic: {
    label: 'Cinematic', bgTop: '#1b140c', bgBottom: '#3a2a16', text: '#fff6e5', muted: '#d2b88a', accent: '#e0a44a', accent2: '#ff7a45',
    panel: 'rgba(20,12,4,0.78)', panelStroke: 'rgba(224,164,74,0.4)', grain: 0.09, vignette: 0.6, grade: 'warm',
  },
  vintage: {
    label: 'Vintage', bgTop: '#d9cbb0', bgBottom: '#b8a583', text: '#2b2112', muted: '#6d5b3c', accent: '#8a2b1f', accent2: '#2f5d62',
    panel: 'rgba(247,238,218,0.92)', panelStroke: 'rgba(80,58,28,0.5)', grain: 0.14, vignette: 0.55, grade: 'sepia',
  },
  light: {
    label: 'Light', bgTop: '#ffffff', bgBottom: '#e8ecf4', text: '#12172b', muted: '#5b6482', accent: '#2563eb', accent2: '#f59e0b',
    panel: 'rgba(255,255,255,0.94)', panelStroke: 'rgba(18,23,43,0.18)', grain: 0.02, vignette: 0.12, grade: 'none',
  },
  grid: {
    label: 'Grid', bgTop: '#05070b', bgBottom: '#0b111c', text: '#e9f1ff', muted: '#7d8aa6', accent: '#2dd4bf', accent2: '#f472b6',
    panel: 'rgba(5,9,16,0.82)', panelStroke: 'rgba(45,212,191,0.35)', grain: 0.04, vignette: 0.35, grade: 'cool', grid: true,
  },
};

export const getTheme = (name) => THEMES[name] || THEMES.blue;

// ── ألوان آمنة فوق اللقطات الحقيقية: ثيمات vintage/light نصها غامق (متصمم لخلفية فاتحة) فبيختفي فوق لقطة معتّمة — بنقلبه لنص فاتح
// ولوحات غامقة، وبنفتّح الألوان الباهتة (muted/accent) عشان تتقرا على أي لقطة. الخلفيات المرسومة (visual: background) بتفضل بثيمها الأصلي.
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lumOf = (h) => { const c = hexRgb(h); if (!c) return 1; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const toHex = (c) => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lighten = (h, k) => { const c = hexRgb(h); return c ? toHex(c.map(v => v + (255 - v) * k)) : h; };
// لون غامق → نفس الدرجة بس فاتحة وزاهية (مش رمادية) عشان تبان فوق اللقطة
const vivid = (h) => {
  const c = hexRgb(h); if (!c) return h;
  const [r, g, b] = c.map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hue = 0; if (d) hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
  const sat = Math.max(0.7, d ? d / (1 - Math.abs(mx + mn - 1)) : 0), l = 0.64;
  const k = (n) => (n + hue / 30) % 12, a = sat * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
};
export function footageSafeTheme(th) {
  const out = { ...th };
  if (lumOf(th.text) < 0.4) { // نص غامق
    out.text = '#ffffff'; out.muted = '#ece6d8';
    out.panel = 'rgba(10,9,8,0.82)'; out.panelStroke = 'rgba(255,255,255,0.28)';
  } else if (lumOf(th.muted) < 0.45) out.muted = lighten(th.muted, 0.45);
  for (const k of ['accent', 'accent2']) if (lumOf(th[k]) < 0.3) out[k] = vivid(th[k]);
  return out;
}

// فلتر ffmpeg للتدرّج اللوني على اللقطات (أرشيف أبيض/أسود، سينمائي، دافئ...). null = من غير تغيير
export function gradeFilter(grade) {
  switch (grade) {
    case 'bw_archive': return 'hue=s=0,eq=contrast=1.12:brightness=-0.02,noise=alls=14:allf=t+u,vignette=PI/5';
    case 'sepia': return 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=alls=10:allf=t+u,vignette=PI/5';
    case 'cinematic': return 'eq=contrast=1.06:saturation=1.0,colorbalance=rs=0.03:bs=-0.03:rh=0.03:bh=-0.02,vignette=PI/7';
    case 'warm': return 'colorchannelmixer=rr=1.05:gg=1.0:bb=0.9,eq=contrast=1.05,vignette=PI/6';
    case 'cool': return 'colorchannelmixer=rr=0.95:gg=1.0:bb=1.06,eq=contrast=1.05,vignette=PI/6';
    default: return null;
  }
}
