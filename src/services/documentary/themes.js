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
