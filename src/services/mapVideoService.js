import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { generateVoiceover } from './voiceService.js';

const execAsync = promisify(exec);
const MAP_SVG_PATH = path.join(process.cwd(), 'public', 'maps', 'world.svg');

const STYLES = {
  dark:     { ocean: '#0f0f1f', land: '#1e2044', border: '#2d3561', text: '#ffffff' },
  classic:  { ocean: '#4a90d9', land: '#f5e6c8', border: '#c8a96e', text: '#333333' },
  military: { ocean: '#0d1a0d', land: '#2d4a2d', border: '#1a3a1a', text: '#ffffff' },
  clean:    { ocean: '#e8f4f8', land: '#ffffff',  border: '#cccccc', text: '#333333' },
};

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
  'allies': null, 'axis': null, 'nazi germany': 'DE', 'ottoman empire': 'TR',
  'roman empire': null, 'byzantine empire': null, 'mongol empire': null,
  // ── Extra Europe ──────────────────────────────────────────────────────────
  'norway': 'NO', 'sweden': 'SE', 'finland': 'FI', 'denmark': 'DK',
  'iceland': 'IS', 'netherlands': 'NL', 'belgium': 'BE', 'luxembourg': 'LU',
  'switzerland': 'CH', 'austria': 'AT', 'czech republic': 'CZ', 'czechia': 'CZ',
  'slovakia': 'SK', 'hungary': 'HU', 'slovenia': 'SI', 'croatia': 'HR',
  'bosnia': 'BA', 'bosnia and herzegovina': 'BA', 'serbia': 'RS',
  'montenegro': 'ME', 'albania': 'AL', 'north macedonia': 'MK', 'kosovo': 'XK',
  'bulgaria': 'BG', 'romania': 'RO', 'moldova': 'MD', 'belarus': 'BY',
  'lithuania': 'LT', 'latvia': 'LV', 'estonia': 'EE', 'finland': 'FI',
  'malta': 'MT', 'cyprus': 'CY', 'georgia': 'GE', 'armenia': 'AM',
  'azerbaijan': 'AZ', 'portugal': 'PT', 'greece': 'GR',
  // ── Extra Middle East ──────────────────────────────────────────────────────
  'kuwait': 'KW', 'bahrain': 'BH', 'oman': 'OM', 'qatar': 'QA',
  'uae': 'AE', 'united arab emirates': 'AE', 'lebanon': 'LB', 'jordan': 'JO',
  'afghanistan': 'AF', 'uzbekistan': 'UZ', 'turkmenistan': 'TM',
  'kyrgyzstan': 'KG', 'tajikistan': 'TJ', 'kazakhstan': 'KZ',
  // ── Extra Africa ──────────────────────────────────────────────────────────
  'sudan': 'SD', 'south sudan': 'SS', 'ethiopia': 'ET', 'somalia': 'SO',
  'eritrea': 'ER', 'djibouti': 'DJ', 'kenya': 'KE', 'uganda': 'UG',
  'tanzania': 'TZ', 'mozambique': 'MZ', 'madagascar': 'MG', 'zimbabwe': 'ZW',
  'botswana': 'BW', 'namibia': 'NA', 'zambia': 'ZM', 'malawi': 'MW',
  'angola': 'AO', 'congo': 'CD', 'democratic republic of congo': 'CD',
  'republic of congo': 'CG', 'cameroon': 'CM', 'nigeria': 'NG', 'ghana': 'GH',
  'ivory coast': 'CI', "côte d'ivoire": 'CI', 'burkina faso': 'BF', 'mali': 'ML',
  'niger': 'NE', 'chad': 'TD', 'central african republic': 'CF',
  'senegal': 'SN', 'gambia': 'GM', 'guinea': 'GN', 'guinea-bissau': 'GW',
  'sierra leone': 'SL', 'liberia': 'LR', 'togo': 'TG', 'benin': 'BJ',
  'mauritania': 'MR', 'western sahara': 'EH', 'tunisia': 'TN',
  // ── Extra Asia ────────────────────────────────────────────────────────────
  'mongolia': 'MN', 'bangladesh': 'BD', 'nepal': 'NP', 'bhutan': 'BT',
  'sri lanka': 'LK', 'myanmar': 'MM', 'thailand': 'TH', 'laos': 'LA',
  'vietnam': 'VN', 'cambodia': 'KH', 'malaysia': 'MY', 'singapore': 'SG',
  'indonesia': 'ID', 'philippines': 'PH', 'taiwan': 'TW',
  'south korea': 'KR', 'north korea': 'KP',
  // ── Americas extras ────────────────────────────────────────────────────────
  'guatemala': 'GT', 'belize': 'BZ', 'honduras': 'HN', 'el salvador': 'SV',
  'nicaragua': 'NI', 'costa rica': 'CR', 'panama': 'PA', 'cuba': 'CU',
  'haiti': 'HT', 'dominican republic': 'DO', 'jamaica': 'JM', 'puerto rico': 'PR',
  'colombia': 'CO', 'venezuela': 'VE', 'guyana': 'GY', 'suriname': 'SR',
  'peru': 'PE', 'ecuador': 'EC', 'bolivia': 'BO', 'paraguay': 'PY', 'uruguay': 'UY',
  // ── Oceania ────────────────────────────────────────────────────────────────
  'new zealand': 'NZ', 'papua new guinea': 'PG', 'fiji': 'FJ',
};

// ── Country bounding boxes [x, y, width, height] in SVG 2000x857 space ──────
const COUNTRY_BBOX = {
  // ── Americas ──────────────────────────────────────────────────────────────
  'US': [200, 150, 450, 250], 'CA': [150,  50, 500, 280], 'MX': [200, 320, 200, 180],
  'GT': [235, 370,  40,  40], 'BZ': [255, 360,  25,  30], 'HN': [255, 380,  50,  35],
  'SV': [240, 385,  30,  25], 'NI': [255, 390,  60,  45], 'CR': [260, 415,  40,  35],
  'PA': [275, 420,  55,  30], 'CU': [295, 340,  90,  35], 'HT': [330, 355,  25,  25],
  'DO': [345, 355,  30,  25], 'JM': [310, 355,  20,  15], 'PR': [370, 352,  18,  14],
  'CO': [310, 390, 130, 120], 'VE': [340, 370, 130,  90], 'GY': [400, 370,  50,  70],
  'SR': [430, 375,  35,  65], 'BR': [380, 400, 350, 300], 'PE': [310, 460, 130, 160],
  'EC': [295, 430,  60,  80], 'BO': [380, 490, 110, 120], 'PY': [430, 550,  80,  80],
  'UY': [460, 600,  60,  55], 'AR': [430, 560, 180, 270], 'CL': [400, 490,  70, 340],

  // ── Europe ────────────────────────────────────────────────────────────────
  'IS': [810,  60,  60,  45], 'NO': [940,  60, 100,  90], 'SE': [990,  65,  70, 110],
  'FI': [1045,  55,  80,  95], 'DK': [955, 100,  40,  45], 'GB': [895, 100,  65, 110],
  'IE': [870, 115,  45,  50], 'PT': [875, 195,  40,  75], 'ES': [890, 190, 120,  90],
  'FR': [930, 165,  90,  80], 'BE': [960, 150,  30,  30], 'NL': [960, 140,  30,  30],
  'LU': [968, 160,  12,  12], 'DE': [985, 135,  80,  85], 'CH': [975, 175,  35,  28],
  'AT': [1000, 168,  60,  30], 'IT': [1000, 185,  65, 130], 'MT': [1020, 250,   8,   6],
  'PL': [1040, 130,  90,  70], 'CZ': [1010, 148,  50,  35], 'SK': [1050, 155,  45,  28],
  'HU': [1045, 168,  65,  35], 'SI': [1005, 173,  25,  22], 'HR': [1010, 178,  45,  40],
  'BA': [1020, 182,  38,  32], 'RS': [1040, 175,  40,  35], 'ME': [1035, 188,  18,  18],
  'AL': [1038, 197,  18,  25], 'MK': [1048, 192,  22,  20], 'GR': [1045, 200,  60,  60],
  'BG': [1075, 170,  55,  45], 'RO': [1075, 148,  80,  60], 'MD': [1105, 148,  25,  30],
  'UA': [1080, 130, 160,  80], 'BY': [1060, 115,  85,  55], 'LT': [1060, 108,  45,  30],
  'LV': [1065, 100,  45,  28], 'EE': [1068,  90,  40,  24], 'RU': [1100,  40, 700, 290],
  'CY': [1165, 225,  30,  18], 'TR': [1140, 195, 160,  75],

  // ── Middle East ───────────────────────────────────────────────────────────
  'GE': [1195, 185,  55,  30], 'AM': [1225, 190,  30,  25], 'AZ': [1235, 183,  35,  30],
  'SY': [1170, 210,  65,  55], 'LB': [1168, 225,  18,  20], 'IL': [1162, 240,  22,  35],
  'JO': [1178, 237,  50,  50], 'IQ': [1195, 220,  85,  80], 'KW': [1220, 253,  20,  18],
  'IR': [1230, 200, 145, 115], 'SA': [1185, 265, 165, 130], 'YE': [1210, 340, 100,  60],
  'OM': [1285, 285,  80,  90], 'AE': [1268, 278,  38,  28], 'QA': [1255, 278,  15,  20],
  'BH': [1250, 270,   8,  10], 'AF': [1280, 175, 110,  90], 'PK': [1310, 195, 120, 110],

  // ── Africa ────────────────────────────────────────────────────────────────
  'MA': [900, 245,  85,  75], 'DZ': [930, 255, 155, 130], 'TN': [985, 230,  40,  55],
  'LY': [1020, 245, 120, 105], 'EG': [1100, 248, 110, 105], 'SD': [1115, 318, 100, 110],
  'SS': [1135, 370,  80,  70], 'ET': [1155, 360, 100,  90], 'ER': [1170, 335,  45,  35],
  'DJ': [1200, 358,  15,  18], 'SO': [1200, 360,  80,  90], 'KE': [1160, 400,  75,  85],
  'UG': [1148, 390,  45,  40], 'TZ': [1145, 420,  80,  80], 'MZ': [1130, 470,  80, 110],
  'MG': [1185, 470,  55,  95], 'ZW': [1095, 495,  55,  45], 'BW': [1075, 510,  60,  55],
  'NA': [1040, 495,  70,  65], 'ZA': [1055, 545, 130, 115], 'ZM': [1090, 455,  80,  65],
  'MW': [1148, 455,  28,  50], 'AO': [1040, 415, 100,  90], 'CD': [1070, 378, 120, 100],
  'CG': [1058, 385,  40,  55], 'CM': [1025, 365,  55,  65], 'NG': [985, 358,  90,  80],
  'GH': [955, 365,  45,  60], 'CI': [933, 365,  48,  55], 'BF': [950, 340,  55,  45],
  'ML': [905, 305, 110,  90], 'NE': [980, 300, 100,  80], 'TD': [1055, 315,  80,  90],
  'CF': [1060, 375,  80,  60], 'SN': [870, 345,  45,  35], 'GM': [873, 350,  30,  12],
  'GN': [878, 365,  40,  35], 'GW': [872, 362,  20,  18], 'SL': [880, 378,  28,  25],
  'LR': [893, 380,  30,  28], 'TG': [963, 365,  20,  48], 'BJ': [970, 355,  22,  52],
  'MR': [862, 290,  95,  80], 'EH': [875, 265,  40,  55],

  // ── Asia ──────────────────────────────────────────────────────────────────
  'KZ': [1255, 115, 220, 120], 'UZ': [1295, 160,  90,  60], 'TM': [1255, 180,  90,  55],
  'KG': [1355, 160,  65,  40], 'TJ': [1345, 175,  55,  40],
  'CN': [1370, 145, 380, 285], 'MN': [1375, 105, 240,  90],
  'IN': [1310, 240, 200, 225], 'BD': [1428, 262,  38,  38], 'NP': [1373, 238,  80,  30],
  'BT': [1430, 245,  25,  22], 'LK': [1368, 330,  25,  32], 'MM': [1450, 255,  70,  90],
  'TH': [1470, 295,  55,  80], 'LA': [1488, 265,  45,  60], 'VN': [1510, 260,  45,  90],
  'KH': [1500, 315,  50,  45], 'MY': [1515, 330,  90,  45], 'SG': [1542, 358,   8,   8],
  'ID': [1525, 355, 230,  80], 'PH': [1572, 295,  65,  85], 'TW': [1582, 250,  22,  28],
  'JP': [1620, 145,  85, 125], 'KR': [1590, 185,  40,  50], 'KP': [1575, 165,  45,  38],

  // ── Oceania ───────────────────────────────────────────────────────────────
  'AU': [1575, 465, 365, 275], 'NZ': [1710, 575,  60,  80],
  'PG': [1650, 390,  80,  55], 'FJ': [1760, 440,  20,  18],
};

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
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 3000, temperature: 0.3 }),
  });

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

const ZOOM_REGIONS = {
  'world':       { x: 0,    y: 0,   w: 2000, h: 857 },
  'europe':      { x: 840,  y: 70,  w: 520,  h: 380 },
  'western-europe': { x: 840, y: 100, w: 280, h: 280 },
  'eastern-europe': { x: 1040, y: 95, w: 280, h: 240 },
  'scandinavia': { x: 880, y: 50,  w: 250, h: 200 },
  'balkans':     { x: 1000, y: 155, w: 150, h: 130 },
  'middle-east': { x: 1100, y: 180, w: 400,  h: 320 },
  'gulf':        { x: 1190, y: 250, w: 200,  h: 150 },
  'asia':        { x: 1200, y: 80,  w: 700,  h: 500 },
  'central-asia':{ x: 1250, y: 110, w: 250, h: 180 },
  'east-asia':   { x: 1380, y: 120, w: 340, h: 280 },
  'southeast-asia': { x: 1460, y: 270, w: 250, h: 200 },
  'south-asia':  { x: 1280, y: 200, w: 250, h: 200 },
  'africa':      { x: 840,  y: 230, w: 420,  h: 500 },
  'north-africa':{ x: 860,  y: 235, w: 380,  h: 180 },
  'sub-saharan': { x: 940,  y: 360, w: 320,  h: 320 },
  'americas':    { x: 100,  y: 50,  w: 700,  h: 750 },
  'north-america': { x: 100, y: 50, w: 600, h: 350 },
  'south-america': { x: 280, y: 350, w: 380, h: 500 },
  'central-america': { x: 200, y: 320, w: 200, h: 160 },
  'caribbean':   { x: 280,  y: 330, w: 130, h: 80 },
  'oceania':     { x: 1550, y: 400, w: 430, h: 330 },
};

// ── Country label positions (cx, cy) in SVG 2000x857 space ─────────────────
const COUNTRY_LABELS = {
  // Americas
  'US': [425, 270, 'United States'], 'CA': [400, 180, 'Canada'], 'MX': [300, 410, 'Mexico'],
  'BR': [555, 540, 'Brazil'],        'AR': [520, 690, 'Argentina'], 'CO': [375, 450, 'Colombia'],
  'VE': [405, 415, 'Venezuela'],     'PE': [375, 540, 'Peru'],      'CL': [440, 650, 'Chile'],
  'BO': [435, 550, 'Bolivia'],       'PY': [470, 590, 'Paraguay'],  'UY': [490, 625, 'Uruguay'],
  'EC': [325, 470, 'Ecuador'],       'GY': [425, 405, 'Guyana'],    'SR': [448, 408, 'Suriname'],
  'CU': [340, 357, 'Cuba'],          'GT': [255, 390, 'Guatemala'], 'HN': [280, 397, 'Honduras'],
  // Europe
  'GB': [928, 155, 'UK'],            'FR': [975, 205, 'France'],    'DE': [1025, 178, 'Germany'],
  'IT': [1033, 250, 'Italy'],        'ES': [950, 235, 'Spain'],     'PT': [895, 232, 'Portugal'],
  'PL': [1085, 165, 'Poland'],       'RO': [1115, 178, 'Romania'],  'UA': [1160, 170, 'Ukraine'],
  'NO': [990, 105, 'Norway'],        'SE': [1025, 120, 'Sweden'],   'FI': [1085, 103, 'Finland'],
  'DK': [975, 122, 'Denmark'],       'NL': [975, 155, 'Netherlands'],'BE': [968, 165, 'Belgium'],
  'AT': [1030, 183, 'Austria'],      'CH': [993, 189, 'Switzerland'],'GR': [1075, 230, 'Greece'],
  'BG': [1103, 193, 'Bulgaria'],     'RS': [1060, 193, 'Serbia'],   'HU': [1078, 186, 'Hungary'],
  'CZ': [1035, 165, 'Czechia'],      'SK': [1073, 169, 'Slovakia'], 'HR': [1033, 198, 'Croatia'],
  'BY': [1103, 143, 'Belarus'],      'LT': [1083, 123, 'Lithuania'],'LV': [1088, 114, 'Latvia'],
  'EE': [1088, 102, 'Estonia'],      'RU': [1400, 175, 'Russia'],   'TR': [1220, 238, 'Turkey'],
  'GE': [1223, 200, 'Georgia'],      'AM': [1240, 203, 'Armenia'],  'AZ': [1253, 198, 'Azerbaijan'],
  // Middle East
  'SY': [1203, 237, 'Syria'],        'IQ': [1238, 260, 'Iraq'],     'IR': [1303, 258, 'Iran'],
  'SA': [1268, 330, 'Saudi Arabia'], 'AE': [1287, 293, 'UAE'],      'QA': [1263, 288, 'Qatar'],
  'KW': [1230, 263, 'Kuwait'],       'JO': [1203, 262, 'Jordan'],   'IL': [1173, 258, 'Israel'],
  'LB': [1177, 235, 'Lebanon'],      'YE': [1260, 370, 'Yemen'],    'OM': [1325, 330, 'Oman'],
  'AF': [1335, 220, 'Afghanistan'],  'PK': [1370, 250, 'Pakistan'],
  // Africa
  'EG': [1155, 300, 'Egypt'],        'LY': [1080, 298, 'Libya'],    'DZ': [1008, 320, 'Algeria'],
  'MA': [943, 283, 'Morocco'],       'TN': [1005, 258, 'Tunisia'],  'SD': [1165, 373, 'Sudan'],
  'SS': [1175, 405, 'S. Sudan'],     'ET': [1205, 405, 'Ethiopia'], 'NG': [1030, 398, 'Nigeria'],
  'CD': [1130, 428, 'DR Congo'],     'AO': [1090, 460, 'Angola'],   'MZ': [1170, 525, 'Mozambique'],
  'ZA': [1120, 603, 'South Africa'], 'KE': [1198, 440, 'Kenya'],    'TZ': [1185, 460, 'Tanzania'],
  'GH': [978, 395, 'Ghana'],         'CM': [1053, 398, 'Cameroon'], 'ML': [960, 350, 'Mali'],
  'ZM': [1130, 488, 'Zambia'],       'ZW': [1123, 518, 'Zimbabwe'], 'MG': [1213, 518, 'Madagascar'],
  // Asia
  'CN': [1560, 288, 'China'],        'IN': [1410, 353, 'India'],    'JP': [1663, 208, 'Japan'],
  'KR': [1610, 210, 'S. Korea'],     'KP': [1598, 184, 'N. Korea'], 'MN': [1495, 150, 'Mongolia'],
  'BD': [1447, 281, 'Bangladesh'],   'MM': [1485, 300, 'Myanmar'],  'TH': [1498, 335, 'Thailand'],
  'VN': [1533, 305, 'Vietnam'],      'MY': [1560, 353, 'Malaysia'], 'ID': [1640, 395, 'Indonesia'],
  'PH': [1605, 338, 'Philippines'],  'TW': [1593, 264, 'Taiwan'],   'KZ': [1365, 175, 'Kazakhstan'],
  'UZ': [1340, 190, 'Uzbekistan'],   'TM': [1300, 208, 'Turkmenistan'],
  // Oceania
  'AU': [1758, 603, 'Australia'],    'NZ': [1740, 615, 'New Zealand'],
};

// ✅ حساب الـ viewBox لكل zone — الـ zoom بيتعمل في الـ SVG مباشرة
function getViewBoxForZone(zone, w, h) {
  let region;
  if (zone && zone.length === 2 && COUNTRY_BBOX[zone]) {
    const [bx, by, bw, bh] = COUNTRY_BBOX[zone];
    const pad = Math.max(bw, bh) * 0.5;
    region = { x: bx - pad, y: by - pad, w: bw + pad * 2, h: bh + pad * 2 };
  } else {
    region = ZOOM_REGIONS[zone] || ZOOM_REGIONS['world'];
  }

  const rx = Math.max(0, region.x);
  const ry = Math.max(0, region.y);
  const rw = Math.min(2000 - rx, region.w);
  const rh = Math.min(857 - ry, region.h);

  // نحسب الـ viewBox بحيث يحافظ على نسبة الـ output
  const outputAspect = w / h;
  const regionAspect = rw / rh;

  let vbx, vby, vbw, vbh;
  if (regionAspect > outputAspect) {
    vbw = rw;
    vbh = rw / outputAspect;
    vbx = rx;
    vby = ry + (rh - vbh) / 2;
  } else {
    vbh = rh;
    vbw = rh * outputAspect;
    vby = ry;
    vbx = rx + (rw - vbw) / 2;
  }

  vbx = Math.max(0, vbx);
  vby = Math.max(0, vby);

  return `${Math.round(vbx)} ${Math.round(vby)} ${Math.round(vbw)} ${Math.round(vbh)}`;
}

// ✅ توليد SVG مع viewBox للـ zoom + أسماء الدول
export function generateSVGFrame({ baseSvg, highlights, style, viewBox, w, h }) {
  const colors = STYLES[style] || STYLES.dark;

  let cssRules = `path { fill: ${colors.land}; stroke: ${colors.border}; stroke-width: 0.4; }`;
  for (const [iso, color] of Object.entries(highlights)) {
    cssRules += `#${iso}, [class="${iso}"] { fill: ${color} !important; }`;
  }

  const pathMatches = baseSvg.match(/<path[\s\S]*?(?:\/>|<\/path>)/g) || [];
  const paths = pathMatches.join('\n');

  // ── حساب font size بناءً على الـ viewBox عشان يظهر بشكل صح مهما الـ zoom
  const [vbx, vby, vbw, vbh] = viewBox.split(' ').map(Number);
  const labelScale = vbw / 2000; // كلما صغر الـ viewBox كلما كبر الـ label نسبياً
  const baseFontSize = 14;
  const fontSize = Math.round(baseFontSize * labelScale);
  const minFont = Math.max(8, fontSize);

  // ── أسماء الدول — بنظهرها فقط لو في highlights أو للدول الكبيرة
  const highlightedISOs = new Set(Object.keys(highlights));

  // دول تظهر أسماءها دايماً (الكبيرة)
  const alwaysShow = new Set(['US','CA','BR','RU','CN','AU','IN','SA','NG','DZ','AR','MX','CD','SD','LY','IR','MN','KZ','AO']);

  let labelsHTML = '';
  for (const [iso, [cx, cy, name]] of Object.entries(COUNTRY_LABELS)) {
    const isHighlighted = highlightedISOs.has(iso);
    const isAlways = alwaysShow.has(iso);

    // في الـ world view نظهر الكبيرة فقط، في الـ zoom نظهر المنطقة دي
    const inViewBox = cx >= vbx && cx <= vbx + vbw && cy >= vby && cy <= vby + vbh;
    if (!inViewBox) continue;

    if (!isHighlighted && !isAlways && vbw > 800) continue; // world view: كبيرة فقط

    const fillColor = isHighlighted ? '#ffffff' : (colors.text || '#ffffff');
    const opacity = isHighlighted ? 0.95 : 0.55;
    const fw = isHighlighted ? 'bold' : 'normal';
    const actualFont = Math.max(8, Math.round(minFont * (isHighlighted ? 1.2 : 1)));

    labelsHTML += `<text x="${cx}" y="${cy}" font-family="Arial,sans-serif" font-size="${actualFont}" font-weight="${fw}" fill="${fillColor}" opacity="${opacity}" text-anchor="middle" pointer-events="none">${name}</text>\n`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}">
  <style>${cssRules}</style>
  <rect width="2000" height="857" fill="${colors.ocean}"/>
  ${paths}
  ${labelsHTML}
</svg>`;
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

export async function renderMapVideo({ jobId, formData, jobDir, updateStatus }) {
  const { mode, idea, script, voice, duration, ratio, language, mapStyle, uploadedAudioUrl } = formData;

  const FPS = 12;
  const TRANSITION_FRAMES = 6;
  const durationSecs = duration === '30s' ? 30 : duration === '1min' ? 60 : duration === '2min' ? 120 : duration === '3min' ? 180 : 300;
  const [w, h] = ratio === '16:9' ? [1280, 720] : [720, 1280];

  updateStatus(jobId, { progress: 10, log: ['🧠 Parsing story with AI...'] });

  const timeline = await parseMapTimeline(script, idea, mode, language);
  updateStatus(jobId, { progress: 20, log: ['✅ Timeline created — ' + timeline.events?.length + ' events found', '🎙️ Generating voiceover...'] });

  let audioPath = null;
  if (uploadedAudioUrl) {
    audioPath = resolveAudioPath(uploadedAudioUrl);
    if (!audioPath) console.warn('[MapVideo] Could not resolve uploaded audio path:', uploadedAudioUrl);
    else console.log('[MapVideo] Resolved uploaded audio:', audioPath);
  } else {
    try {
      const audioFilename = await generateVoiceover(timeline.script, voice || 'male_american', 'education', 0, language || 'en');
      audioPath = path.join(process.cwd(), 'outputs', audioFilename);
    } catch(e) {
      console.warn('[MapVideo] TTS failed, continuing without audio:', e.message);
    }
  }

  updateStatus(jobId, { progress: 30, log: ['✅ Voiceover ready', '🗺️ Generating map frames...'] });

  let actualAudioDuration = durationSecs;
  const { execSync: execSyncDur } = await import('child_process');

  // ✅ لو في uploaded audio، نحاول نقرأ مدته بكل الطرق الممكنة
  const audioTarget = audioPath || uploadedAudioUrl;
  if (audioTarget) {
    // حاول resolve الـ path بطرق إضافية
    const tryPaths = [
      audioTarget,
      audioTarget && path.join(process.cwd(), 'outputs', path.basename(audioTarget)),
      audioTarget && path.join(process.cwd(), audioTarget.replace(/^\//, '')),
    ].filter(Boolean);

    for (const tryPath of tryPaths) {
      if (tryPath && fs.existsSync(tryPath)) {
        try {
          const result = execSyncDur(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tryPath}"`,
            { encoding: 'utf8' }
          ).trim();
          const parsed = parseFloat(result);
          if (parsed > 0) {
            actualAudioDuration = parsed;
            audioPath = tryPath; // تأكد إن audioPath صح
            console.log(`[MapVideo] Audio duration: ${actualAudioDuration.toFixed(1)}s from ${tryPath}`);
            break;
          }
        } catch(e) {
          console.warn('[MapVideo] ffprobe failed on:', tryPath, e.message);
        }
      }
    }

    // لو لسه مش عارف يقرأ المدة وفي uploaded audio، استخدم مدة كبيرة
    if (actualAudioDuration === durationSecs && uploadedAudioUrl) {
      console.warn('[MapVideo] Could not read audio duration, using large default for uploaded audio');
      actualAudioDuration = Math.max(durationSecs, 600); // 10 دقايق max fallback
    }
  }

  // ✅ totalSecs = مدة الصوت + 4 ثواني buffer
  const totalSecs = Math.max(Math.ceil(actualAudioDuration) + 4, durationSecs);
  console.log(`[MapVideo] totalSecs: ${totalSecs}`);

  const baseSvg = fs.readFileSync(MAP_SVG_PATH, 'utf8');
  const framesDir = path.join(jobDir, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });

  const getHighlightsAtTime = (t) => {
    const highlights = {};
    for (const event of (timeline.events || [])) {
      if (t >= event.time && t < event.time + event.duration) {
        for (const iso of (event.countries || [])) {
          if (iso && iso.length === 2) highlights[iso] = event.color || '#e11d48';
        }
      }
    }
    return highlights;
  };

  const getZoneAtTime = (t) => {
    for (const event of (timeline.events || [])) {
      if (t >= event.time && t < event.time + event.duration) return event.zoom || 'world';
    }
    return 'world';
  };

  const interpolateColor = (hex1, hex2, t) => {
    const r1 = parseInt(hex1.slice(1,3),16), g1 = parseInt(hex1.slice(3,5),16), b1 = parseInt(hex1.slice(5,7),16);
    const r2 = parseInt(hex2.slice(1,3),16), g2 = parseInt(hex2.slice(3,5),16), b2 = parseInt(hex2.slice(5,7),16);
    const r = Math.round(r1 + (r2-r1)*t), g = Math.round(g1 + (g2-g1)*t), b = Math.round(b1 + (b2-b1)*t);
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
  };

  // ✅ توليد الـ frames مع الـ zoom مدمج في الـ SVG viewBox
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

      // interpolate viewBox للـ smooth zoom transition
      const parseVB = (vb) => vb.split(' ').map(Number);
      const fromVB = parseVB(prevViewBox);
      const toVB = parseVB(viewBox);
      const curVB = fromVB.map((v, i) => Math.round(v + (toVB[i] - v) * progress));
      const curViewBox = curVB.join(' ');

      const svgContent = generateSVGFrame({ baseSvg, highlights: transHighlights, style: mapStyle, viewBox: curViewBox, w, h });
      const frameNum = sec * TRANSITION_FRAMES + tf;
      const pngPath = path.join(framesDir, `frame_${String(frameNum).padStart(6, '0')}.png`);
      await sharp(Buffer.from(svgContent)).resize(w, h, { fit: 'fill' }).png().toFile(pngPath);
    }

    prevHighlights = { ...highlights };
    prevViewBox = viewBox;

    if (sec % 5 === 0) {
      const pct = 30 + Math.round((sec / totalSecs) * 40);
      updateStatus(jobId, { progress: pct, log: [`🖼️ Generating frames... ${sec}/${totalSecs}s`] });
    }
  }

  updateStatus(jobId, { progress: 72, log: ['✅ All frames generated', '🎬 Assembling video with FFmpeg...'] });

  // ✅ Frame list
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

  const outputPath = path.join(jobDir, 'output.mp4');

  // ✅ FFmpeg بسيط بدون zoompan expression — الـ zoom بيجي من الـ frames نفسها
  let ffmpegCmd = `ffmpeg -y -f concat -safe 0 -i "${listPath}"`;
  if (audioPath && fs.existsSync(audioPath)) {
    ffmpegCmd += ` -i "${audioPath}"`;
  }
  ffmpegCmd += ` -c:v libx264 -pix_fmt yuv420p -crf 23 -preset fast -r ${FPS}`;
  if (audioPath && fs.existsSync(audioPath)) {
    ffmpegCmd += ` -map 0:v:0 -map 1:a:0 -c:a aac -b:a 192k -shortest`;
  }
  ffmpegCmd += ` "${outputPath}"`;

  console.log('[MapVideo] FFmpeg cmd:', ffmpegCmd.slice(0, 150));
  await execAsync(ffmpegCmd);

  updateStatus(jobId, { progress: 95, log: ['✅ Video assembled!', '📤 Uploading...'] });

  return outputPath;
}