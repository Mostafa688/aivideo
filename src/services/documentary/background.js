// ── background.js ── خلفيات الستايلات (Blue/Cinematic/Vintage/Light/Grid) كصورة PNG ثابتة
import sharp from 'sharp';
import { getTheme } from './themes.js';

export async function renderBackground(themeName, w, h, outPath) {
  const t = getTheme(themeName);
  const grid = t.grid
    ? `<defs><pattern id="g" width="${Math.round(w / 32)}" height="${Math.round(w / 32)}" patternUnits="userSpaceOnUse"><path d="M ${Math.round(w / 32)} 0 L 0 0 0 ${Math.round(w / 32)}" fill="none" stroke="rgba(120,200,255,0.10)" stroke-width="1.5"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#g)"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="${t.bgTop}"/><stop offset="1" stop-color="${t.bgBottom}"/></linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.25" r="0.7"><stop offset="0" stop-color="${t.accent}" stop-opacity="0.16"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="vg" cx="0.5" cy="0.5" r="0.75"><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${t.vignette}"/></radialGradient>
    <filter id="n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="t"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="${t.grain}"/></feComponentTransfer></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${grid}
  <rect width="${w}" height="${h}" filter="url(#n)"/>
  <rect width="${w}" height="${h}" fill="url(#vg)"/>
</svg>`;
  await sharp(Buffer.from(svg), { density: 72 }).png().toFile(outPath);
  return outPath;
}
