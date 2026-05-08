import fetch from 'node-fetch';
import FormData from 'form-data';

/**
 * Transcribes audio buffer using Groq Whisper API
 * @param {Buffer} audioBuffer
 * @param {string} filename
 * @param {string|null} language - ISO 639-1 code e.g. 'ar', 'en'
 * @returns {Promise<string>}
 */
export async function transcribeAudio(audioBuffer, filename, language = null) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: filename || 'audio.mp3',
    contentType: detectMimeType(filename),
  });
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');

  if (language && language !== 'auto') {
    const langMap = {
      ar: 'ar', en: 'en', de: 'de', fr: 'fr',
      es: 'es', ru: 'ru', ja: 'ja', pt: 'pt',
    };
    const langCode = langMap[language];
    if (langCode) form.append('language', langCode);
  }

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.GROQ_API_KEY,
      ...form.getHeaders(),
    },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.text?.trim();
  if (!text) throw new Error('No transcription returned from audio');

  console.log(`[Transcribe] Done: ${text.length} chars | lang: ${data.language || 'auto'}`);
  return text;
}

function detectMimeType(filename) {
  if (!filename) return 'audio/mpeg';
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap = {
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    webm: 'audio/webm',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
  };
  return mimeMap[ext] || 'audio/mpeg';
}
