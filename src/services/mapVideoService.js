import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { generateVoiceover } from './voiceService.js';
import { execSync } from 'child_process';

const execAsync = promisify(exec);
const MAP_SVG_PATH = path.join(process.cwd(), 'public', 'maps', 'world.svg');

const STYLES = {
  dark:     { ocean: '#0f0f1f', land: '#1e2044', border: '#2d3561', text: '#ffffff' },
  classic:  { ocean: '#4a90d9', land: '#f5e6c8', border: '#c8a96e', text: '#333333' },
  military: { ocean: '#0d1a0d', land: '#2d4a2d', border: '#1a3a1a', text: '#ffffff' },
  clean:    { ocean: '#e8f4f8', land: '#ffffff',  border: '#cccccc', text: '#333333' },
};

// ── Country ISO codes ──────────────────────────────────────────────────────────
const COUNTRY_ISO = {
  'afghanistan':'AF','albania':'AL','algeria':'DZ','angola':'AO','argentina':'AR',
  'armenia':'AM','australia':'AU','austria':'AT','azerbaijan':'AZ','bahrain':'BH',
  'bangladesh':'BD','belarus':'BY','belgium':'BE','bolivia':'BO','bosnia':'BA',
  'brazil':'BR','bulgaria':'BG','cambodia':'KH','cameroon':'CM','canada':'CA',
  'chile':'CL','china':'CN','colombia':'CO','congo':'CD','croatia':'HR','cuba':'CU',
  'czech republic':'CZ','czechia':'CZ','denmark':'DK','dominican republic':'DO',
  'ecuador':'EC','egypt':'EG','ethiopia':'ET','finland':'FI','france':'FR',
  'germany':'DE','ghana':'GH','greece':'GR','hungary':'HU','india':'IN',
  'indonesia':'ID','iran':'IR','iraq':'IQ','ireland':'IE','israel':'IL',
  'italy':'IT','japan':'JP','jordan':'JO','kazakhstan':'KZ','kenya':'KE',
  'kuwait':'KW','latvia':'LV','lebanon':'LB','libya':'LY','lithuania':'LT',
  'malaysia':'MY','mali':'ML','mexico':'MX','moldova':'MD','mongolia':'MN',
  'morocco':'MA','mozambique':'MZ','myanmar':'MM','nepal':'NP','netherlands':'NL',
  'new zealand':'NZ','nigeria':'NG','north korea':'KP','norway':'NO','oman':'OM',
  'pakistan':'PK','palestine':'PS','panama':'PA','paraguay':'PY','peru':'PE',
  'philippines':'PH','poland':'PL','portugal':'PT','qatar':'QA','romania':'RO',
  'russia':'RU','saudi arabia':'SA','senegal':'SN','serbia':'RS','slovakia':'SK',
  'somalia':'SO','south africa':'ZA','south korea':'KR','south sudan':'SS',
  'spain':'ES','sri lanka':'LK','sudan':'SD','sweden':'SE','switzerland':'CH',
  'syria':'SY','taiwan':'TW','tanzania':'TZ','thailand':'TH','tunisia':'TN',
  'turkey':'TR','turkiye':'TR','uganda':'UG','ukraine':'UA',
  'united arab emirates':'AE','uae':'AE','united kingdom':'GB','uk':'GB',
  'england':'GB','britain':'GB','united states':'US','usa':'US','america':'US',
  'uruguay':'UY','uzbekistan':'UZ','venezuela':'VE','vietnam':'VN','yemen':'YE',
  'zambia':'ZM','zimbabwe':'ZW','nazi germany':'DE','ottoman empire':'TR',
  'iceland':'IS','luxembourg':'LU','montenegro':'ME','north macedonia':'MK',
  'kosovo':'XK','estonia':'EE','georgia':'GE','malta':'MT','cyprus':'CY',
  'turkmenistan':'TM','kyrgyzstan':'KG','tajikistan':'TJ','eritrea':'ER',
  'djibouti':'DJ','madagascar':'MG','botswana':'BW','namibia':'NA','malawi':'MW',
  'ivory coast':'CI','burkina faso':'BF','niger':'NE','chad':'TD',
  'central african republic':'CF','gambia':'GM','guinea':'GN','guinea-bissau':'GW',
  'sierra leone':'SL','liberia':'LR','togo':'TG','benin':'BJ','mauritania':'MR',
  'bhutan':'BT','laos':'LA','singapore':'SG','papua new guinea':'PG','fiji':'FJ',
  'guatemala':'GT','belize':'BZ','honduras':'HN','el salvador':'SV',
  'nicaragua':'NI','costa rica':'CR','haiti':'HT','jamaica':'JM',
  'puerto rico':'PR','guyana':'GY','suriname':'SR',
};

// ── Country bounding boxes ──────────────────────────────────────────────────────
const COUNTRY_BBOX = {
  'US':[200,150,450,250],'CA':[150,50,500,280],'MX':[200,320,200,180],
  'BR':[380,420,340,340],'AR':[380,580,200,240],'CO':[300,390,120,120],
  'VE':[340,360,130,80],'PE':[310,450,160,160],'CL':[390,480,80,280],
  'GB':[900,100,80,120],'FR':[930,160,100,100],'DE':[980,130,80,100],
  'IT':[990,200,60,120],'ES':[900,200,120,80],'PT':[870,200,50,80],
  'PL':[1040,130,100,80],'RO':[1080,150,80,70],'UA':[1080,130,150,80],
  'NO':[930,60,160,120],'SE':[990,70,100,130],'FI':[1050,60,100,100],
  'RU':[1100,50,700,300],'TR':[1120,200,200,80],'CN':[1350,120,400,280],
  'IN':[1310,250,200,200],'JP':[1600,130,100,150],'EG':[1100,240,120,120],
  'SA':[1180,260,200,160],'IR':[1230,190,180,120],'IQ':[1190,220,80,100],
  'SY':[1160,210,70,60],'AF':[1290,170,120,120],'PK':[1310,190,120,130],
  'NG':[990,360,100,100],'ET':[1160,360,120,100],'ZA':[1060,540,120,120],
  'AU':[1580,440,400,280],'KZ':[1250,110,250,150],'MN':[1380,100,220,120],
};

const ZOOM_REGIONS = {
  'world':       { x:0,    y:0,   w:2000, h:857 },
  'europe':      { x:840,  y:70,  w:520,  h:380 },
  'middle-east': { x:1100, y:180, w:400,  h:320 },
  'gulf':        { x:1190, y:250, w:200,  h:150 },
  'asia':        { x:1200, y:80,  w:700,  h:500 },
  'east-asia':   { x:1380, y:120, w:340,  h:280 },
  'south-asia':  { x:1280, y:200, w:250,  h:200 },
  'africa':      { x:840,  y:230, w:420,  h:500 },
  'north-africa':{ x:860,  y:235, w:380,  h:180 },
  'americas':    { x:100,  y:50,  w:700,  h:750 },
  'north-america':{ x:100, y:50,  w:600,  h:350 },
  'south-america':{ x:280, y:350, w:380,  h:500 },
  'oceania':     { x:1550, y:400, w:430,  h:330 },
};

const COUNTRY_LABELS = {
  'US':[425,270,'United States'],'CA':[400,180,'Canada'],'MX':[300,410,'Mexico'],
  'BR':[555,540,'Brazil'],'AR':[520,690,'Argentina'],'CO':[375,450,'Colombia'],
  'GB':[928,155,'UK'],'FR':[975,205,'France'],'DE':[1025,178,'Germany'],
  'IT':[1033,250,'Italy'],'ES':[950,235,'Spain'],'PT':[895,232,'Portugal'],
  'PL':[1085,165,'Poland'],'RO':[1115,178,'Romania'],'UA':[1160,170,'Ukraine'],
  'NO':[990,105,'Norway'],'SE':[1025,120,'Sweden'],'FI':[1085,103,'Finland'],
  'RU':[1400,175,'Russia'],'TR':[1220,238,'Turkey'],
  'SY':[1203,237,'Syria'],'IQ':[1238,260,'Iraq'],'IR':[1303,258,'Iran'],
  'SA':[1268,330,'Saudi Arabia'],'AE':[1287,293,'UAE'],'EG':[1155,300,'Egypt'],
  'LY':[1080,298,'Libya'],'DZ':[1008,320,'Algeria'],'MA':[943,283,'Morocco'],
  'CN':[1560,288,'China'],'IN':[1410,353,'India'],'JP':[1663,208,'Japan'],
  'AU':[1758,603,'Australia'],'ZA':[1120,603,'South Africa'],
  'NG':[1030,398,'Nigeria'],'ET':[1205,405,'Ethiopia'],
  'SD':[1165,373,'Sudan'],'KE':[1198,440,'Kenya'],
  'PK':[1370,250,'Pakistan'],'AF':[1335,220,'Afghanistan'],
  'KZ':[1365,175,'Kazakhstan'],'MN':[1495,150,'Mongolia'],
};

// ── Historical flags ────────────────────────────────────────────────────────────
const HISTORICAL_FLAGS = {
  // WWII
  'nazi germany': { color: '#cc0000', symbol: '✠', border: '#000' },
  'third reich': { color: '#cc0000', symbol: '✠', border: '#000' },
  'imperial japan': { color: '#bc002d', symbol: '☀', border: '#fff' },
  'fascist italy': { color: '#009246', symbol: 'F', border: '#fff' },
  'vichy france': { color: '#002395', symbol: 'V', border: '#fff' },
  // Empires
  'ottoman empire': { color: '#cc0000', symbol: '☽', border: '#fff' },
  'roman empire': { color: '#8B0000', symbol: 'SPQR', border: '#gold' },
  'byzantine empire': { color: '#6B0000', symbol: '⊕', border: '#gold' },
  'mongol empire': { color: '#4a90d9', symbol: '🐎', border: '#fff' },
  'british empire': { color: '#012169', symbol: '♔', border: '#fff' },
  'french empire': { color: '#002395', symbol: 'N', border: '#fff' },
  'spanish empire': { color: '#c60b1e', symbol: '♔', border: '#ffc400' },
  'portuguese empire': { color: '#006600', symbol: '⚓', border: '#fff' },
  'dutch empire': { color: '#ae1c28', symbol: '🌷', border: '#fff' },
  'austrian empire': { color: '#ED2939', symbol: '⊕', border: '#fff' },
  'austro-hungarian empire': { color: '#ED2939', symbol: '⊕', border: '#fff' },
  'habsburg empire': { color: '#ED2939', symbol: '⊕', border: '#fff' },
  'russian empire': { color: '#0033A0', symbol: '✠', border: '#fff' },
  'persian empire': { color: '#009000', symbol: '☀', border: '#fff' },
  'achaemenid empire': { color: '#009000', symbol: '⚡', border: '#fff' },
  'sassanid empire': { color: '#cc6600', symbol: '☀', border: '#fff' },
  // Modern conflicts
  'soviet union': { color: '#cc0000', symbol: '☭', border: '#ffd700' },
  'ussr': { color: '#cc0000', symbol: '☭', border: '#ffd700' },
  'warsaw pact': { color: '#cc0000', symbol: '☆', border: '#ffd700' },
  'nato': { color: '#003087', symbol: '☆', border: '#fff' },
  'arab league': { color: '#007A3D', symbol: '☾', border: '#fff' },
  'axis powers': { color: '#555', symbol: '⚙', border: '#000' },
  'allies': { color: '#003087', symbol: '★', border: '#fff' },
  // Middle Eastern
  'umayyad caliphate': { color: '#006600', symbol: '☾', border: '#fff' },
  'abbasid caliphate': { color: '#000000', symbol: '☾', border: '#gold' },
  'fatimid caliphate': { color: '#007A3D', symbol: '☾', border: '#fff' },
  'safavid empire': { color: '#cc0000', symbol: '☀', border: '#fff' },
  // African/Asian
  'zulu kingdom': { color: '#000', symbol: '⚡', border: '#fff' },
  'mughal empire': { color: '#046A38', symbol: '☾', border: '#fff' },
  'qing dynasty': { color: '#ffd700', symbol: '龙', border: '#000' },
  'ming dynasty': { color: '#cc0000', symbol: '龙', border: '#gold' },
  'han dynasty': { color: '#cc0000', symbol: '汉', border: '#gold' },
  // Americas
  'aztec empire': { color: '#006600', symbol: '🦅', border: '#fff' },
  'inca empire': { color: '#ffd700', symbol: '☀', border: '#cc0000' },
  'confederate states': { color: '#003087', symbol: '✠', border: '#cc0000' },
};

// ── Military unit symbols ──────────────────────────────────────────────────────
const MILITARY_SYMBOLS = {
  tank: '🪖', plane: '✈', ship: '🚢', army: '⚔', bomb: '💣',
  missile: '🚀', cavalry: '🐴', infantry: '👣', artillery: '💥',
};

function getViewBoxForZone(zone, w, h) {
  let region;
  if (zone && zone.length === 2 && COUNTRY_BBOX[zone]) {
    const [bx, by, bw, bh] = COUNTRY_BBOX[zone];
    const pad = Math.max(bw, bh) * 0.5;
    region = { x: bx - pad, y: by - pad, w: bw + pad * 2, h: bh + pad * 2 };
  } else {
    region = ZOOM_REGIONS[zone] || ZOOM_REGIONS['world'];
  }
  const rx = Math.max(0, region.x), ry = Math.max(0, region.y);
  const rw = Math.min(2000 - rx, region.w), rh = Math.min(857 - ry, region.h);
  const outputAspect = w / h, regionAspect = rw / rh;
  let vbx, vby, vbw, vbh;
  if (regionAspect > outputAspect) {
    vbw = rw; vbh = rw / outputAspect; vbx = rx; vby = ry + (rh - vbh) / 2;
  } else {
    vbh = rh; vbw = rh * outputAspect; vby = ry; vbx = rx + (rw - vbw) / 2;
  }
  vbx = Math.max(0, vbx); vby = Math.max(0, vby);
  return `${Math.round(vbx)} ${Math.round(vby)} ${Math.round(vbw)} ${Math.round(vbh)}`;
}

// ── Generate SVG frame with flags + military units ────────────────────────────
export function generateSVGFrame({ baseSvg, highlights, style, viewBox, w, h, events = [], currentTime = 0, flagData = {} }) {
  const colors = STYLES[style] || STYLES.dark;
  const [vbx, vby, vbw, vbh] = viewBox.split(' ').map(Number);

  let cssRules = `path { fill: ${colors.land}; stroke: ${colors.border}; stroke-width: 0.4; }`;
  for (const [iso, color] of Object.entries(highlights)) {
    cssRules += `#${iso}, [class="${iso}"] { fill: ${color} !important; }`;
  }

  const pathMatches = baseSvg.match(/<path[\s\S]*?(?:\/>|<\/path>)/g) || [];
  const paths = pathMatches.join('\n');

  const labelScale = vbw / 2000;
  const baseFontSize = 14;
  const fontSize = Math.round(baseFontSize * labelScale);
  const minFont = Math.max(8, fontSize);
  // Country labels hidden — cleaner look
  let labelsHTML = '';

  // ── Render active events: flags + military units ──────────────────────────
  let overlaysHTML = '';
  let defsHTML = '';
  let extraCSS = '';

  for (const event of events) {
    if (currentTime < event.time || currentTime >= event.time + event.duration) continue;
    const progress = (currentTime - event.time) / event.duration;

    // ── Flag overlays as pattern fill ON the country shape ───────────────
    if (event.flag && event.countries) {
      for (const iso of event.countries) {
        const label = COUNTRY_LABELS[iso];
        if (!label) continue;
        const [cx, cy] = label;
        const inView = cx >= vbx && cx <= vbx + vbw && cy >= vby && cy <= vby + vbh;
        if (!inView) continue;

        const hist = HISTORICAL_FLAGS[event.entity?.toLowerCase()];
        const patId = `pat_${iso}_${Math.round(currentTime * 10)}`;

        if (hist) {
          // Historical: override country fill with solid color + symbol on top
          defsHTML += `<pattern id="${patId}" patternUnits="userSpaceOnUse" x="0" y="0" width="2000" height="857"><rect width="2000" height="857" fill="${hist.color}" opacity="0.85"/></pattern>`;
          // Override CSS to use pattern
          extraCSS += `#${iso}, [class="${iso}"] { fill: url(#${patId}) !important; }`;
          // Add symbol in center
          overlaysHTML += `<text x="${cx}" y="${cy + 4}" font-size="${Math.round(vbw * 0.018)}" text-anchor="middle" fill="white" font-weight="bold" opacity="0.95">${hist.symbol}</text>`;
        } else {
          const flagImg = flagData[iso.toLowerCase()];
          if (flagImg) {
            // Pattern fill with the flag image covering the entire SVG space
            // The country path clips it naturally
            const bbox = ${JSON.stringify({})}[''] || null;
            // Use the country BBOX for better flag positioning
            const cb = COUNTRY_BBOX[iso];
            if (cb) {
              const [bx, by, bw, bh] = cb;
              defsHTML += `<pattern id="${patId}" patternUnits="userSpaceOnUse" x="${bx}" y="${by}" width="${bw}" height="${bh}"><image href="${flagImg}" x="0" y="0" width="${bw}" height="${bh}" preserveAspectRatio="xMidYMid slice"/></pattern>`;
            } else {
              defsHTML += `<pattern id="${patId}" patternUnits="userSpaceOnUse" x="${cx-60}" y="${cy-40}" width="120" height="80"><image href="${flagImg}" x="0" y="0" width="120" height="80" preserveAspectRatio="xMidYMid slice"/></pattern>`;
            }
            extraCSS += `#${iso}, [class="${iso}"] { fill: url(#${patId}) !important; opacity: 0.95; }`;
          }
          // No fallback needed - country stays highlighted color
        }
      }
    }

    // ── Military units (tanks, planes etc.) ───────────────────────────────
    if (event.military && event.fromCountry && event.toCountry) {
      const fromLabel = COUNTRY_LABELS[event.fromCountry];
      const toLabel = COUNTRY_LABELS[event.toCountry];
      if (fromLabel && toLabel) {
        const [fx, fy] = fromLabel;
        const [tx, ty] = toLabel;
        const inView = fx >= vbx && fx <= vbx + vbw && fy >= vby && fy <= vby + vbh;
        if (inView) {
          // Animate position along path
          const animProgress = Math.min(progress * 1.5, 0.9);
          const mx = fx + (tx - fx) * animProgress;
          const my = fy + (ty - fy) * animProgress;
          const unitSize = Math.round(vbw * 0.018);
          const symbol = MILITARY_SYMBOLS[event.unitType] || '⚔';

          // Draw arrow path
          overlaysHTML += `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${event.color || '#ff6b00'}" stroke-width="${Math.max(1, unitSize * 0.3)}" stroke-dasharray="${unitSize * 2} ${unitSize}" opacity="0.6"/>`;

          // Draw moving unit
          overlaysHTML += `<circle cx="${mx}" cy="${my}" r="${unitSize * 1.2}" fill="${event.color || '#ff6b00'}" opacity="0.9"/>`;
          overlaysHTML += `<text x="${mx}" y="${my + unitSize * 0.4}" font-size="${unitSize * 1.5}" text-anchor="middle">${symbol}</text>`;
        }
      }
    }

    // ── Event label ────────────────────────────────────────────────────────
    if (event.label) {
      const country = event.countries?.[0];
      const labelPos = country ? COUNTRY_LABELS[country] : null;
      if (labelPos) {
        const [cx, cy] = labelPos;
        const inView = cx >= vbx && cx <= vbx + vbw && cy >= vby && cy <= vby + vbh;
        if (inView) {
          const lFontSize = Math.max(8, Math.round(vbw * 0.008));
          const textY = cy - Math.round(vbw * 0.025);
          overlaysHTML += `<rect x="${cx - lFontSize * event.label.length * 0.3}" y="${textY - lFontSize}" width="${lFontSize * event.label.length * 0.6}" height="${lFontSize * 1.4}" fill="rgba(0,0,0,0.7)" rx="3"/>`;
          overlaysHTML += `<text x="${cx}" y="${textY + lFontSize * 0.3}" font-size="${lFontSize}" text-anchor="middle" fill="#fff" font-weight="bold">${event.label}</text>`;
        }
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" width="${w}" height="${h}">
  <defs>${defsHTML}</defs>
  <style>${cssRules}${extraCSS}</style>
  <rect width="2000" height="857" fill="${colors.ocean}"/>
  ${paths}
  ${labelsHTML}
  ${overlaysHTML}
</svg>`;
}

// ── Groq: parse timeline ────────────────────────────────────────────────────────
async function parseMapTimeline(script, idea, mode, language) {
  const content = mode === 'script' ? script : (idea || script || '');

  const prompt = `You are a geographic storyteller. Parse this story into a map animation timeline.

STORY: ${content}

Return a JSON object with:
{
  "script": "clean narration script (the voiceover text)",
  "events": [
    {
      "time": 0,
      "duration": 8,
      "countries": ["EG","US"],
      "zoom": "middle-east",
      "color": "#e11d48",
      "label": "Event name",
      "flag": true,
      "entity": "egypt",
      "military": false,
      "unitType": null,
      "fromCountry": null,
      "toCountry": null
    }
  ]
}

RULES:
- For war/invasion events: set military=true, unitType="tank" or "plane" or "army", fromCountry=attacker ISO, toCountry=defender ISO
- For historical events: set entity to the historical name (e.g. "nazi germany", "ottoman empire")
- flag=true means show flag overlay on the country
- countries use 2-letter ISO codes
- zoom can be: world, europe, middle-east, gulf, asia, africa, americas, north-africa, east-asia, south-asia
- events should cover the full story duration
- Return ONLY valid JSON, no markdown`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.3 }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    // try to extract JSON
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return { script: content, events: [] };
  }
}

function resolveAudioPath(uploadedAudioUrl) {
  if (!uploadedAudioUrl) return null;
  if (fs.existsSync(uploadedAudioUrl)) return uploadedAudioUrl;
  const basename = path.basename(uploadedAudioUrl);
  const candidate = path.join(process.cwd(), 'outputs', basename);
  if (fs.existsSync(candidate)) return candidate;
  const stripped = uploadedAudioUrl.startsWith('/') ? uploadedAudioUrl.slice(1) : uploadedAudioUrl;
  const candidate2 = path.join(process.cwd(), stripped);
  if (fs.existsSync(candidate2)) return candidate2;
  return null;
}

// ── Groq Whisper captions ─────────────────────────────────────────────────────
async function transcribeAudioForMap(audioPath) {
  try {
    const { default: FormData } = await import('form-data');
    const audioBuffer = fs.readFileSync(audioPath);
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + process.env.GROQ_API_KEY, ...formData.getHeaders() },
      body: formData,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.words || null;
  } catch { return null; }
}

// ── Add real captions with ffmpeg drawtext ────────────────────────────────────
async function addMapCaptions(videoPath, audioPath, outputPath, style = 'dark', ratio) {
  const isRTL = false;
  const FONT_PATH = process.platform === 'win32'
    ? 'C\\:/Windows/Fonts/arial.ttf'
    : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

  const words = await transcribeAudioForMap(audioPath);
  if (!words || words.length === 0) {
    fs.copyFileSync(videoPath, outputPath);
    return;
  }

  // Group into chunks of 4 words
  const chunks = [];
  for (let i = 0; i < words.length; i += 4) {
    const group = words.slice(i, i + 4);
    const text = group.map(w => w.word.replace(/['"`:;\\<>{}|]/g, '').trim()).join(' ');
    if (text) chunks.push({ text, start: group[0].start, end: group[group.length-1].end });
  }

  const yExpr = ratio === '9:16' || ratio === '1:1' ? '(h-text_h)/2' : 'h-text_h-60';
  const filters = chunks.map(c =>
    `drawtext=fontfile='${FONT_PATH}':text='${c.text}':fontsize=28:fontcolor=white` +
    `:borderw=2:bordercolor=black:box=1:boxcolor=0x00000088:boxborderw=8` +
    `:x=(w-text_w)/2:y=${yExpr}:enable='between(t,${c.start.toFixed(3)},${c.end.toFixed(3)})'`
  );

  if (!filters.length) { fs.copyFileSync(videoPath, outputPath); return; }

  try {
    execSync(
      `ffmpeg -i "${videoPath}" -vf "${filters.join(',')}" ` +
      `-c:a copy -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch {
    fs.copyFileSync(videoPath, outputPath);
  }
}

// ── Add background music ──────────────────────────────────────────────────────
function addMusicToVideo(videoPath, outputPath) {
  const musicDir = path.join(process.cwd(), 'assets', 'music');
  if (!fs.existsSync(musicDir)) { fs.copyFileSync(videoPath, outputPath); return; }
  const files = fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
  if (!files.length) { fs.copyFileSync(videoPath, outputPath); return; }
  const musicFile = path.join(musicDir, files[Math.floor(Math.random() * files.length)]);
  try {
    execSync(
      `ffmpeg -i "${videoPath}" -i "${musicFile}" ` +
      `-filter_complex "[1:a]volume=0.08[music];[0:a][music]amix=inputs=2:duration=first[aout]" ` +
      `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -y "${outputPath}"`,
      { stdio: 'pipe' }
    );
  } catch { fs.copyFileSync(videoPath, outputPath); }
}


// ── Flag cache ─────────────────────────────────────────────────────────────────
const flagCache = new Map();

async function getFlagBase64(isoCode) {
  if (!isoCode || isoCode.length !== 2) return null;
  const key = isoCode.toLowerCase();
  if (flagCache.has(key)) return flagCache.get(key);

  try {
    const url = `https://flagcdn.com/w80/${key}.png`;
    const res = await fetch(url, { timeout: 5000 });
    if (!res.ok) { flagCache.set(key, null); return null; }
    const buf = await res.arrayBuffer();
    const b64 = Buffer.from(buf).toString('base64');
    const dataUri = `data:image/png;base64,${b64}`;
    flagCache.set(key, dataUri);
    return dataUri;
  } catch {
    flagCache.set(key, null);
    return null;
  }
}

async function preloadFlags(isoCodes) {
  const unique = [...new Set(isoCodes.filter(Boolean).map(c => c.toLowerCase()))];
  await Promise.all(unique.map(iso => getFlagBase64(iso)));
  console.log(`[MapVideo] Preloaded ${flagCache.size} flags`);
}

// ── Main render ────────────────────────────────────────────────────────────────
export async function renderMapVideo({ jobId, formData, jobDir, updateStatus }) {
  const { mode, idea, script, voice, duration, ratio, language, mapStyle, uploadedAudioUrl, captions, music } = formData;

  const FPS = 15;
  const TRANSITION_FRAMES = 8;
  const durationSecs = duration === '30s' ? 30 : duration === '1min' ? 60 : duration === '2min' ? 120 : duration === '3min' ? 180 : 300;
  const [w, h] = ratio === '16:9' ? [1280, 720] : ratio === '1:1' ? [720, 720] : [720, 1280]; // default 9:16

  updateStatus(jobId, { progress: 10, log: ['🧠 Parsing story with AI...'] });

  const timeline = await parseMapTimeline(script, idea, mode, language);
  updateStatus(jobId, { progress: 20, log: [`✅ Timeline — ${timeline.events?.length || 0} events`, '🎙️ Generating voiceover...'] });

  let audioPath = null;
  if (uploadedAudioUrl) {
    audioPath = resolveAudioPath(uploadedAudioUrl);
  } else {
    try {
      const fn = await generateVoiceover(timeline.script || idea || script, voice || 'male_american', 'education', 0, language || 'en');
      audioPath = path.join(process.cwd(), 'outputs', fn);
    } catch (e) {
      console.warn('[MapVideo] TTS failed:', e.message);
    }
  }

  updateStatus(jobId, { progress: 30, log: ['✅ Voiceover ready', '🗺️ Generating map frames...'] });

  let actualAudioDuration = durationSecs;
  if (audioPath && fs.existsSync(audioPath)) {
    try {
      const result = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`,
        { encoding: 'utf8' }
      ).trim();
      const parsed = parseFloat(result);
      if (parsed > 0) actualAudioDuration = parsed;
    } catch {}
  }

  const totalSecs = Math.ceil(actualAudioDuration);
  // Preload all country flags
  const allISOs = (timeline.events || []).flatMap(e => e.countries || []);
  await preloadFlags(allISOs);

  const baseSvg = fs.readFileSync(MAP_SVG_PATH, 'utf8');
  const framesDir = path.join(jobDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const getHighlightsAtTime = (t) => {
    const h2 = {};
    for (const ev of (timeline.events || [])) {
      if (t >= ev.time && t < ev.time + ev.duration) {
        for (const iso of (ev.countries || [])) {
          if (iso && iso.length === 2) h2[iso] = ev.color || '#e11d48';
        }
      }
    }
    return h2;
  };

  const getZoneAtTime = (t) => {
    for (const ev of (timeline.events || [])) {
      if (t >= ev.time && t < ev.time + ev.duration) return ev.zoom || 'world';
    }
    return 'world';
  };

  const interpolateColor = (hex1, hex2, t) => {
    const r1=parseInt(hex1.slice(1,3),16),g1=parseInt(hex1.slice(3,5),16),b1=parseInt(hex1.slice(5,7),16);
    const r2=parseInt(hex2.slice(1,3),16),g2=parseInt(hex2.slice(3,5),16),b2=parseInt(hex2.slice(5,7),16);
    const r=Math.round(r1+(r2-r1)*t),g=Math.round(g1+(g2-g1)*t),b=Math.round(b1+(b2-b1)*t);
    return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  };

  let prevHighlights = {};
  let prevViewBox = getViewBoxForZone('world', w, h);

  for (let sec = 0; sec <= totalSecs; sec++) {
    const t = Math.min(sec, durationSecs);
    const highlights = getHighlightsAtTime(t);
    const zone = getZoneAtTime(t);
    const viewBox = getViewBoxForZone(zone, w, h);
    const allKeys = [...new Set([...Object.keys(prevHighlights), ...Object.keys(highlights)])];
    const COLORS = STYLES[mapStyle] || STYLES.dark;

    for (let tf = 0; tf < TRANSITION_FRAMES; tf++) {
      const progress = tf / TRANSITION_FRAMES;
      const transHighlights = {};
      for (const iso of allKeys) {
        const from = prevHighlights[iso] || COLORS.land;
        const to = highlights[iso] || COLORS.land;
        if (from !== to) transHighlights[iso] = interpolateColor(from, to, progress);
        else if (highlights[iso]) transHighlights[iso] = highlights[iso];
      }

      const parseVB = (vb) => vb.split(' ').map(Number);
      const fromVB = parseVB(prevViewBox), toVB = parseVB(viewBox);
      const curVB = fromVB.map((v, i) => Math.round(v + (toVB[i] - v) * progress));
      const curViewBox = curVB.join(' ');
      const currentTime = sec + progress;

      const svgContent = generateSVGFrame({
        baseSvg, highlights: transHighlights, style: mapStyle,
        viewBox: curViewBox, w, h,
        events: timeline.events || [],
        currentTime,
        flagData: Object.fromEntries(flagCache),
      });

      const frameNum = sec * TRANSITION_FRAMES + tf;
      const pngPath = path.join(framesDir, `frame_${String(frameNum).padStart(6, '0')}.png`);
      await sharp(Buffer.from(svgContent)).resize(w, h, { fit: 'fill' }).png().toFile(pngPath);
    }

    prevHighlights = { ...highlights };
    prevViewBox = viewBox;

    if (sec % 5 === 0) {
      const pct = 30 + Math.round((sec / totalSecs) * 45);
      updateStatus(jobId, { progress: pct, log: [`🖼️ Frames... ${sec}/${totalSecs}s`] });
    }
  }

  updateStatus(jobId, { progress: 75, log: ['✅ Frames done', '🎬 Assembling video...'] });

  const listPath = path.join(framesDir, 'frames.txt');
  let listContent = '';
  const totalFrameCount = (totalSecs + 1) * TRANSITION_FRAMES;
  for (let fi = 0; fi < totalFrameCount; fi++) {
    const pngPath = path.join(framesDir, `frame_${String(fi).padStart(6, '0')}.png`);
    if (fs.existsSync(pngPath)) {
      listContent += `file '${pngPath}'\nduration ${(1 / TRANSITION_FRAMES).toFixed(4)}\n`;
    }
  }
  fs.writeFileSync(listPath, listContent);

  const rawVideoPath = path.join(jobDir, 'raw.mp4');
  const outputPath = path.join(jobDir, 'output.mp4');

  // Step 1: Build raw video — trim to exact audio duration
  let ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}"`;
  if (audioPath && fs.existsSync(audioPath)) {
    ffmpegCmd += ` -i "${audioPath}"`;
    ffmpegCmd += ` -c:v libx264 -pix_fmt yuv420p -crf 18 -preset fast -r ${FPS}`;
    ffmpegCmd += ` -map 0:v:0 -map 1:a:0 -c:a aac -b:a 192k`;
    ffmpegCmd += ` -t ${actualAudioDuration.toFixed(2)}`; // trim to exact audio duration
  } else {
    ffmpegCmd += ` -c:v libx264 -pix_fmt yuv420p -crf 18 -preset fast -r ${FPS}`;
  }
  ffmpegCmd += ` "${rawVideoPath}"`;
  await execAsync(ffmpegCmd);

  updateStatus(jobId, { progress: 88, log: ['✅ Video assembled', '🎵 Adding music & captions...'] });

  // Step 2: Add music
  let currentPath = rawVideoPath;
  if (music !== false) {
    const withMusicPath = path.join(jobDir, 'with_music.mp4');
    addMusicToVideo(currentPath, withMusicPath);
    if (fs.existsSync(withMusicPath) && fs.statSync(withMusicPath).size > 10000) {
      currentPath = withMusicPath;
    }
  }

  // Step 3: Add captions (Groq Whisper)
  if (captions !== false && audioPath && fs.existsSync(audioPath) && process.env.GROQ_API_KEY) {
    updateStatus(jobId, { progress: 92, log: ['🗣️ Generating real captions with Whisper...'] });
    const withCaptionsPath = path.join(jobDir, 'with_captions.mp4');
    await addMapCaptions(currentPath, audioPath, withCaptionsPath, mapStyle, ratio);
    if (fs.existsSync(withCaptionsPath) && fs.statSync(withCaptionsPath).size > 10000) {
      currentPath = withCaptionsPath;
    }
  }

  // Step 4: Final copy
  try {
    execSync(`ffmpeg -i "${currentPath}" -c copy -movflags +faststart -y "${outputPath}"`, { stdio: 'pipe' });
  } catch {
    fs.copyFileSync(currentPath, outputPath);
  }

  updateStatus(jobId, { progress: 98, log: ['🎉 Done!'] });
  return outputPath;
}