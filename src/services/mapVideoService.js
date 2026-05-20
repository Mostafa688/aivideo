import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { generateVoiceover } from './voiceService.js';

const execAsync = promisify(exec);
const MAP_SVG_PATH = path.join(process.cwd(), 'public', 'maps', 'world.svg');

// ── Style definitions ──────────────────────────────────────────────────────
const STYLES = {
  dark:     { ocean: '#0f0f1f', land: '#1e2044', border: '#2d3561', text: '#ffffff' },
  classic:  { ocean: '#4a90d9', land: '#f5e6c8', border: '#c8a96e', text: '#333333' },
  military: { ocean: '#0d1a0d', land: '#2d4a2d', border: '#1a3a1a', text: '#ffffff' },
  clean:    { ocean: '#e8f4f8', land: '#ffffff',  border: '#cccccc', text: '#333333' },
};

// ── Country ISO code lookup (name → ISO2) ──────────────────────────────────
const COUNTRY_ISO = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'angola': 'AO',
  'argentina': 'AR', 'armenia': 'AM', 'australia': 'AU', 'austria': 'AT',
  'azerbaijan': 'AZ', 'bahrain': 'BH', 'bangladesh': 'BD', 'belarus': 'BY',
  'belgium': 'BE', 'bolivia': 'BO', 'bosnia': 'BA', 'brazil': 'BR',
  'bulgaria': 'BG', 'cambodia': 'KH', 'cameroon': 'CM', 'canada': 'CA',
  'chile': 'CL', 'china': 'CN', 'colombia': 'CO', 'congo': 'CD',
  'croatia': 'HR', 'cuba': 'CU', 'czech republic': 'CZ', 'czechia': 'CZ',
  'denmark': 'DK', 'dominican republic': 'DO', 'ecuador': 'EC', 'egypt': 'EG',
  'ethiopia': 'ET', 'finland': 'FI', 'france': 'FR', 'germany': 'DE',
  'ghana': 'GH', 'greece': 'GR', 'hungary': 'HU', 'india': 'IN',
  'indonesia': 'ID', 'iran': 'IR', 'iraq': 'IQ', 'ireland': 'IE',
  'israel': 'IL', 'italy': 'IT', 'japan': 'JP', 'jordan': 'JO',
  'kazakhstan': 'KZ', 'kenya': 'KE', 'kuwait': 'KW', 'latvia': 'LV',
  'lebanon': 'LB', 'libya': 'LY', 'lithuania': 'LT', 'malaysia': 'MY',
  'mali': 'ML', 'mexico': 'MX', 'moldova': 'MD', 'mongolia': 'MN',
  'morocco': 'MA', 'mozambique': 'MZ', 'myanmar': 'MM', 'nepal': 'NP',
  'netherlands': 'NL', 'new zealand': 'NZ', 'nigeria': 'NG', 'north korea': 'KP',
  'norway': 'NO', 'oman': 'OM', 'pakistan': 'PK', 'palestine': 'PS',
  'panama': 'PA', 'paraguay': 'PY', 'peru': 'PE', 'philippines': 'PH',
  'poland': 'PL', 'portugal': 'PT', 'qatar': 'QA', 'romania': 'RO',
  'russia': 'RU', 'saudi arabia': 'SA', 'senegal': 'SN', 'serbia': 'RS',
  'slovakia': 'SK', 'somalia': 'SO', 'south africa': 'ZA', 'south korea': 'KR',
  'south sudan': 'SS', 'spain': 'ES', 'sri lanka': 'LK', 'sudan': 'SD',
  'sweden': 'SE', 'switzerland': 'CH', 'syria': 'SY', 'taiwan': 'TW',
  'tanzania': 'TZ', 'thailand': 'TH', 'tunisia': 'TN', 'turkey': 'TR',
  'turkiye': 'TR', 'uganda': 'UG', 'ukraine': 'UA', 'united arab emirates': 'AE',
  'uae': 'AE', 'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB',
  'britain': 'GB', 'united states': 'US', 'usa': 'US', 'america': 'US',
  'uruguay': 'UY', 'uzbekistan': 'UZ', 'venezuela': 'VE', 'vietnam': 'VN',
  'yemen': 'YE', 'zambia': 'ZM', 'zimbabwe': 'ZW',
  // European powers (WWII etc.)
  'allies': null, 'axis': null, 'nazi germany': 'DE', 'ottoman empire': 'TR',
  'roman empire': null, 'byzantine empire': null, 'mongol empire': null,
};

// Country bounding boxes [x, y, width, height] in SVG 2000x857 space
const COUNTRY_BBOX = {
  'US': [200, 150, 450, 250], 'CA': [150, 50, 500, 280], 'MX': [200, 320, 200, 180],
  'BR': [420, 380, 350, 320], 'AR': [450, 580, 200, 280], 'CL': [420, 480, 80, 350],
  'GB': [920, 120, 60, 100], 'FR': [950, 180, 80, 80], 'DE': [1000, 140, 70, 90],
  'IT': [1010, 200, 70, 120], 'ES': [900, 200, 120, 90], 'PL': [1050, 130, 90, 70],
  'RU': [1100, 60, 700, 280], 'UA': [1100, 150, 150, 80], 'TR': [1160, 200, 150, 80],
  'EG': [1120, 270, 100, 100], 'SA': [1200, 280, 160, 130], 'IR': [1230, 220, 140, 110],
  'IQ': [1200, 230, 80, 80], 'SY': [1175, 210, 60, 60], 'IL': [1165, 250, 25, 35],
  'CN': [1380, 160, 380, 280], 'IN': [1300, 250, 200, 220], 'JP': [1620, 160, 80, 120],
  'AU': [1580, 480, 360, 280], 'ZA': [1060, 600, 130, 130], 'NG': [1000, 400, 80, 80],
  'KE': [1130, 430, 70, 80], 'MA': [920, 260, 80, 80], 'DZ': [940, 280, 140, 130],
  'LY': [1040, 270, 110, 100],
};

// ── Parse timeline from Groq ───────────────────────────────────────────────
export async function parseMapTimeline(script, idea, mode, language) {
  const prompt = `You are a geographic historian AI. Analyze this ${mode === 'idea' ? 'topic idea' : 'narration script'} and extract a precise timeline of geographic events for an animated map video.

${mode === 'idea' ? `Topic: ${idea}` : `Script:\n${script}`}

Return ONLY valid JSON (no markdown, no explanation):
{
  "title": "Short video title",
  "script": "Full narration text for voiceover (${language === 'ar' ? 'in Arabic' : language === 'fr' ? 'in French' : language === 'de' ? 'in German' : language === 'es' ? 'in Spanish' : 'in English'})",
  "events": [
    {
      "time": 0,
      "duration": 4,
      "countries": ["DE", "FR"],
      "color": "#e11d48",
      "label": "Germany invades France",
      "zoom": "europe",
      "action": "highlight"
    }
  ]
}

Rules:
- time is in seconds from video start
- duration is how long this event shows
- countries is array of ISO2 codes
- color: red=#e11d48 for aggression/war, blue=#3b82f6 for alliances, green=#22c55e for growth/peace, yellow=#f59e0b for neutral/trade, purple=#a855f7 for empires
- zoom: "world", "europe", "middle-east", "asia", "africa", "americas", or ISO2 code for single country
- action: "highlight" (color fill), "pulse" (animated), "fade" (remove color)
- Create events for every major geographic moment mentioned
- Events should span the full duration of the video`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
      temperature: 0.3,
    }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

// ── Zoom regions ───────────────────────────────────────────────────────────
const ZOOM_REGIONS = {
  'world':       { x: 0,    y: 0,   w: 2000, h: 857 },
  'europe':      { x: 850,  y: 80,  w: 500,  h: 400 },
  'middle-east': { x: 1100, y: 180, w: 400,  h: 350 },
  'asia':        { x: 1200, y: 80,  w: 700,  h: 500 },
  'africa':      { x: 850,  y: 250, w: 400,  h: 500 },
  'americas':    { x: 100,  y: 50,  w: 700,  h: 750 },
};

// ── Generate one SVG frame ─────────────────────────────────────────────────
export function generateSVGFrame({
  baseSvg, highlights, style, viewBox, width, height,
}) {
  const colors = STYLES[style] || STYLES.dark;

  // Build CSS overrides for highlighted countries
  let cssRules = `
    path { fill: ${colors.land}; stroke: ${colors.border}; stroke-width: 0.3; }
  `;
  for (const [iso, color] of Object.entries(highlights)) {
    cssRules += `#${iso}, .${iso} { fill: ${color} !important; }
`;
  }

  // Fix viewBox
  const vb = viewBox ? `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}` : '0 0 2000 857';
  const W = width || 1920;
  const H = height || 1080;

  // Build clean SVG wrapping the original paths
  // Extract just the path elements from baseSvg
  const pathMatches = baseSvg.match(/<path[^/]*\/?>(?:<\/path>)?|<path[\s\S]*?<\/path>/g) || [];
  const paths = pathMatches.join('
');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W}" height="${H}">
  <style>${cssRules}</style>
  <rect width="2000" height="857" fill="${colors.ocean}"/>
  ${paths}
</svg>`;

  return svg;
}

// ── Main render job ────────────────────────────────────────────────────────
export async function renderMapVideo({ jobId, formData, jobDir, updateStatus }) {
  const { mode, idea, script, voice, duration, ratio, language, mapStyle, uploadedAudioUrl } = formData;

  const FPS = 24;
  const durationSecs = duration === '30s' ? 30 : duration === '1min' ? 60 : duration === '2min' ? 120 : duration === '3min' ? 180 : 300;
  const [w, h] = ratio === '16:9' ? [1920, 1080] : [1080, 1920];

  updateStatus(jobId, { progress: 10, log: ['🧠 Parsing story with AI...'] });

  // 1. Parse timeline
  const timeline = await parseMapTimeline(script, idea, mode, language);
  updateStatus(jobId, { progress: 20, log: ['✅ Timeline created — ' + timeline.events?.length + ' events found', '🎙️ Generating voiceover...'] });

  // 2. Generate voiceover (reuse existing TTS)
  let audioPath = null;
  if (uploadedAudioUrl) {
    audioPath = uploadedAudioUrl;
  } else {
    try {
      const audioFilename = await generateVoiceover(timeline.script, voice || 'male_american', 'education', 0, language || 'en');
      audioPath = path.join(process.cwd(), 'outputs', audioFilename);
    } catch(e) {
      console.warn('[MapVideo] TTS failed, continuing without audio:', e.message);
    }
  }

  updateStatus(jobId, { progress: 30, log: ['✅ Voiceover ready', '🗺️ Generating map frames...'] });

  // 3. Generate frames
  const baseSvg = fs.readFileSync(MAP_SVG_PATH, 'utf8');
  const framesDir = path.join(jobDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const totalFrames = durationSecs * FPS;

  // Build highlight map per frame
  const getHighlightsAtTime = (t) => {
    const highlights = {};
    for (const event of (timeline.events || [])) {
      if (t >= event.time && t < event.time + event.duration) {
        for (const iso of (event.countries || [])) {
          if (iso && iso.length === 2) {
            highlights[iso] = event.color || '#e11d48';
          }
        }
      }
    }
    return highlights;
  };

  const getViewBoxAtTime = (t) => {
    // Find current event
    let zone = 'world';
    for (const event of (timeline.events || [])) {
      if (t >= event.time && t < event.time + event.duration) {
        zone = event.zoom || 'world';
        break;
      }
    }

    // Single country zoom
    if (zone.length === 2 && COUNTRY_BBOX[zone]) {
      const [bx, by, bw, bh] = COUNTRY_BBOX[zone];
      const pad = Math.max(bw, bh) * 0.4;
      return { x: bx - pad, y: by - pad, w: bw + pad * 2, h: bh + pad * 2 };
    }

    return ZOOM_REGIONS[zone] || ZOOM_REGIONS['world'];
  };

  // Generate a frame every FPS (keyframe every second, then duplicate for speed)
  for (let sec = 0; sec <= durationSecs; sec++) {
    const highlights = getHighlightsAtTime(sec);
    const viewBox = getViewBoxAtTime(sec);

    const svgContent = generateSVGFrame({ baseSvg, highlights, style: mapStyle, viewBox, width: w, height: h });

    const svgPath = path.join(framesDir, `frame_${String(sec).padStart(5, '0')}.svg`);
    const pngPath = path.join(framesDir, `frame_${String(sec).padStart(5, '0')}.png`);

    fs.writeFileSync(svgPath, svgContent);

    // Convert SVG to PNG using sharp
    await sharp(Buffer.from(svgContent))
      .resize(w, h, { fit: 'fill' })
      .png()
      .toFile(pngPath);

    if (sec % 10 === 0) {
      const pct = 30 + Math.round((sec / durationSecs) * 40);
      updateStatus(jobId, { progress: pct, log: [`🖼️ Generating frames... ${sec}/${durationSecs}s`] });
    }
  }

  updateStatus(jobId, { progress: 72, log: ['✅ All frames generated', '🎬 Assembling video with FFmpeg...'] });

  // 4. Assemble with FFmpeg
  // Create frame list file (each frame repeated FPS times)
  const listPath = path.join(framesDir, 'frames.txt');
  let listContent = '';
  for (let sec = 0; sec <= durationSecs; sec++) {
    const pngPath = path.join(framesDir, `frame_${String(sec).padStart(5, '0')}.png`);
    if (fs.existsSync(pngPath)) {
      for (let f = 0; f < FPS; f++) {
        listContent += `file '${pngPath}'\nduration ${(1 / FPS).toFixed(4)}\n`;
      }
    }
  }
  fs.writeFileSync(listPath, listContent);

  const outputPath = path.join(jobDir, 'output.mp4');

  let ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}"`;
  if (audioPath && (audioPath.startsWith('http') || fs.existsSync(audioPath))) {
    const audioInput = audioPath.startsWith('http') ? audioPath : audioPath;
    ffmpegCmd += ` -i "${audioInput}" -map 0:v:0 -map 1:a:0 -shortest`;
  }
  ffmpegCmd += ` -c:v libx264 -pix_fmt yuv420p -crf 23 -preset fast "${outputPath}"`;

  await execAsync(ffmpegCmd);

  updateStatus(jobId, { progress: 95, log: ['✅ Video assembled!', '📤 Uploading...'] });

  return outputPath;
}