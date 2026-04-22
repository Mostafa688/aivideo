import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';
import { LANGUAGE_DEFAULT_VOICES } from './scriptService.js';

const OUTPUTS_DIR = 'outputs';

// Windows: exe مباشر | Linux: python3 -m edge_tts
const IS_WIN = process.platform === 'win32';
const EDGE_TTS_CMD = IS_WIN
  ? '"C:\\Users\\Dell\\AppData\\Local\\Programs\\Python\\Python314\\Scripts\\edge-tts.exe"'
  : 'python3 -m edge_tts';

export const VOICE_OPTIONS = {
  'male_wise':       { name: 'Wise Man',         voice: 'en-US-ChristopherNeural', gender: 'male'   },
  'male_young':      { name: 'Young Man',         voice: 'en-US-GuyNeural',         gender: 'male'   },
  'male_american':   { name: 'American Man',      voice: 'en-US-EricNeural',        gender: 'male'   },
  'male_arabic':     { name: 'Arabic Man',        voice: 'ar-SA-HamedNeural',       gender: 'male'   },
  'male_child':      { name: 'Child',             voice: 'en-US-AnaNeural',         gender: 'male'   },
  'female_wise':     { name: 'Wise Woman',        voice: 'en-US-AriaNeural',        gender: 'female' },
  'female_young':    { name: 'Young Woman',       voice: 'en-US-JennyNeural',       gender: 'female' },
  'female_american': { name: 'American Woman',    voice: 'en-US-MichelleNeural',    gender: 'female' },
  'female_arabic':   { name: 'Arabic Woman',      voice: 'ar-SA-ZariyahNeural',     gender: 'female' },
  'female_child':    { name: 'Girl',              voice: 'en-GB-MaisieNeural',      gender: 'female' },
};

const DEFAULT_VOICE_BY_TYPE = {
  motivational: 'male_young',
  storytelling: 'male_wise',
  education:    'male_american',
};

const PITCH_BY_TYPE = {
  motivational: '+5Hz',
  storytelling: '-5Hz',
  education:    '+0Hz',
};

function resolveVoice(voiceKey, videoType, videoLanguage) {
  const lang = videoLanguage || 'en';

  if (lang !== 'en') {
    const langVoices = LANGUAGE_DEFAULT_VOICES[lang];
    if (langVoices) {
      let gender = 'male';
      if (voiceKey) {
        const opt = VOICE_OPTIONS[voiceKey];
        if (opt) gender = opt.gender;
        else if (voiceKey === 'female') gender = 'female';
        else if (voiceKey === 'male') gender = 'male';
      }
      const selectedVoice = langVoices[gender] || langVoices.male;
      console.log(`[TTS] Language ${lang} -> Auto voice: ${selectedVoice} (${gender})`);
      return { voice: selectedVoice, gender, name: `${lang} ${gender}` };
    }
  }

  let voiceData = VOICE_OPTIONS[voiceKey];
  if (!voiceData) {
    if (voiceKey === 'male')        voiceData = VOICE_OPTIONS['male_american'];
    else if (voiceKey === 'female') voiceData = VOICE_OPTIONS['female_american'];
    else voiceData = VOICE_OPTIONS[DEFAULT_VOICE_BY_TYPE[videoType]] || VOICE_OPTIONS['male_american'];
  }
  return voiceData;
}

// Split text into chunks of max 200 chars at sentence boundaries
function splitTextIntoChunks(text, maxChars = 200) {
  const sentences = text.replace(/([.!?؟])\s+/g, '$1|').split('|');
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length <= maxChars) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

// Merge multiple mp3 files using ffmpeg
function mergeAudioFiles(files, output) {
  if (files.length === 1) {
    fs.renameSync(files[0], output);
    return;
  }
  const listFile = output + '_list.txt';
  const listContent = files.map(f => `file '${path.resolve(f)}'`).join('\n');
  fs.writeFileSync(listFile, listContent);
  execSync(`ffmpeg -f concat -safe 0 -i "${listFile}" -c copy -y "${output}"`, { stdio: 'pipe' });
  fs.unlinkSync(listFile);
  files.forEach(f => { try { fs.unlinkSync(f); } catch {} });
}

async function runEdgeTTS(text, voiceName, rateStr, pitch, outputFile) {
  const safeText = text.replace(/"/g, "'").replace(/\n/g, ' ').trim();
  const cmd = EDGE_TTS_CMD
    + ' --voice ' + voiceName
    + ' --rate ' + rateStr
    + ' --pitch ' + pitch
    + ' --text "' + safeText + '"'
    + ' --write-media "' + outputFile + '"';

  execSync(cmd, { stdio: 'pipe', timeout: 90000 });
  return fs.existsSync(outputFile) && fs.statSync(outputFile).size > 1000;
}

export async function generateVoiceover(text, voiceKey = 'male_american', videoType = 'education', speed = 0, videoLanguage = 'en') {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  const filename = 'voice_' + Date.now() + '.mp3';
  const filepath = path.join(OUTPUTS_DIR, filename);

  const voiceData = resolveVoice(voiceKey, videoType, videoLanguage);
  const voiceName = voiceData.voice;
  const pitch = PITCH_BY_TYPE[videoType] || '+0Hz';

  const clampedSpeed = Math.max(-50, Math.min(50, Number(speed) || 0));
  const rateStr = (clampedSpeed >= 0 ? '+' : '') + clampedSpeed + '%';

  console.log(`[TTS] Voice: ${voiceName} | Lang: ${videoLanguage} | Rate: ${rateStr} | Pitch: ${pitch}`);

  // ElevenLabs fallback
  if (videoLanguage === 'en' && process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_API_KEY !== 'your_elevenlabs_key_here') {
    try {
      const { default: fetch } = await import('node-fetch');
      const voiceId = voiceData.gender === 'male' ? 'pNInz6obpgDQGcFmaJgB' : 'EXAVITQu4vr4xnSDxMaL';
      const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voiceId, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        fs.writeFileSync(filepath, Buffer.from(arrayBuffer));
        if (fs.statSync(filepath).size > 1000) return filename;
      }
    } catch (e) {
      console.warn('ElevenLabs failed:', e.message);
    }
  }

  // Edge TTS with chunking for long texts
  try {
    const chunks = splitTextIntoChunks(text, 200);
    console.log(`[TTS] Split into ${chunks.length} chunks`);

    const chunkFiles = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkFile = path.join(OUTPUTS_DIR, `tmp_chunk_${Date.now()}_${i}.mp3`);
      const ok = await runEdgeTTS(chunks[i], voiceName, rateStr, pitch, chunkFile);
      if (ok) {
        chunkFiles.push(chunkFile);
      } else {
        console.warn(`[TTS] Chunk ${i} failed`);
      }
    }

    if (chunkFiles.length === 0) {
      console.warn('[TTS] All chunks failed');
      return null;
    }

    mergeAudioFiles(chunkFiles, filepath);

    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 1000) {
      console.log(`[TTS] Success: ${filename}`);
      return filename;
    } else {
      console.warn('[TTS] Merged file empty');
      return null;
    }
  } catch (e) {
    console.error('[TTS] Edge TTS error:', e.message);
    return null;
  }
}