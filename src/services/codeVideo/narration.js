// ── narration.js ── صوت الفيديو: صوت العميل المرفوع (تفريغ + توقيت كلمات) أو سرد بالذكاء الاصطناعي (TTS + توقيت)
import fs from 'fs';
import path from 'path';
import { synthesizeNarration } from '../videoAudioService.js';
import { ffmpeg, probeDuration, rmQuiet } from '../documentary/ff.js';
import { transcribeWords, tokenizeScript, alignScriptToWords, tokensFromAsr } from '../documentary/align.js';
import { llmText } from '../documentary/llm.js';

export const MAX_SECONDS = 120;          // الحد العادي (Starter/مجاني)
export const ABS_MAX_SECONDS = 300;      // أقصى حد لأي باقة (Studio) — الحد الفعلي لكل عميل بييجي في input.maxSeconds
export const DOC_ABS_MAX_SECONDS = 1200; // فيديو من مستند/PDF: لحد 5 دقايق، و20 دقيقة لباقة Studio
export const WORDS_PER_SEC = { en: 2.5, ar: 2.0, default: 2.3 };
const wps = (lang) => WORDS_PER_SEC[String(lang).split(/[-_]/)[0]] || WORDS_PER_SEC.default;
export const estimateSeconds = (script, lang) => String(script || '').trim().split(/\s+/).filter(Boolean).length / wps(lang);

/** لغة النص الفعلية (عربي/لاتيني) — null لو مش واضحة. اللاتيني بيحافظ على اللغة المطلوبة لو هي لاتينية (en/es/fr/de) */
export function detectLang(text, fallback = 'en') {
  const s = String(text || '');
  const ar = (s.match(/[\u0600-\u06FF]/g) || []).length, la = (s.match(/[A-Za-z\u00C0-\u024F]/g) || []).length;
  if (ar >= 8 && ar > la * 1.5) return 'ar';
  if (la >= 15 && la > ar * 3) return String(fallback).startsWith('ar') ? 'en' : fallback;
  return null;
}

async function toWav(src, dest) { await ffmpeg(['-i', src, '-ar', '44100', '-ac', '2', dest]); return dest; }

// قطع ≤ maxChars على حدود الجمل (نفس منطق الوثائقي)
export function splitForTts(script, maxChars = 700) {
  const chunks = [];
  for (const para of String(script).split(/\n{1,}/).map(p => p.trim()).filter(Boolean)) {
    const sentences = para.match(/[^.!?؟…]+[.!?؟…]*["'”)]*\s*/g) || [para];
    let cur = '';
    for (const s of sentences) {
      if ((cur + s).length > maxChars && cur) { chunks.push({ text: cur.trim(), paraEnd: false }); cur = ''; }
      if (s.length > maxChars) { for (const part of s.split(/(?<=[,;:،؛])\s+/)) { if ((cur + part).length > maxChars && cur) { chunks.push({ text: cur.trim(), paraEnd: false }); cur = ''; } cur += part + ' '; } }
      else cur += s;
    }
    if (cur.trim()) chunks.push({ text: cur.trim(), paraEnd: true });
  }
  return chunks;
}

/** سكريبت سرد قصير لفيديو شرح متحرك من موضوع (بيتكتب بنبرة سريعة وواضحة، بدون أرقام مخترعة) */
export async function writeAnimationScript({ topic, seconds = 60, language = 'en', brief = '', maxSeconds = MAX_SECONDS }) {
  const words = Math.round(Math.min(maxSeconds - 4, Math.max(20, seconds)) * wps(language));
  const langName = String(language).startsWith('ar') ? 'Egyptian-friendly Modern Standard Arabic (simple, spoken, clear)' : language === 'en' ? 'English' : language;
  const text = await llmText({
    system: `You write the voice-over for a short animated explainer video, in ${langName}. About ${words} words (never more than ${Math.round(words * 1.1)}). Structure: a punchy hook in the first sentence, 3-6 clear points or steps with concrete examples, and a short memorable conclusion. Short sentences (max ~18 words), spoken style, no stage directions, no headings, no emojis, no markdown. Only well-established facts; never invent statistics, quotes or sources — if you give a number it must be a well-known fact. Output ONLY the narration text.`,
    user: `Topic: ${topic}${brief ? `\nExtra direction from the customer: ${brief}` : ''}`,
    maxTokens: Math.max(900, words * 4), temperature: 0.6,
  });
  return String(text).replace(/\*\*|^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * @returns {{ tokens, narrationFile, total, script }}
 * mode 'voiceover': audioFile مرفوع. غير كده: script → TTS.
 */
export async function buildNarration({ mode, script = '', audioFile = null, lang = 'en', voiceKey = 'male_wise', workDir, prog = async () => {} }) {
  let tokens, narrationFile = path.join(workDir, 'narration.wav'), outScript = script, detected = null;
  if (mode === 'voiceover') {
    await prog('narration', 0.1);
    const mp3 = path.join(workDir, 'asr.mp3');
    await ffmpeg(['-i', audioFile, '-ac', '1', '-ar', '16000', '-b:a', '48k', mp3]);
    // اللغة بتتعرف من الصوت نفسه (لو اتفرضت لغة غلط Whisper بيترجم/يبوّظ الكلام)
    const asr = await transcribeWords(mp3, {});
    rmQuiet(mp3);
    tokens = tokensFromAsr(asr);
    detected = detectLang(asr.text, lang);
    await toWav(audioFile, narrationFile);
    outScript = asr.text || tokens.map(t => t.w).join(' ');
    // تصحيح كلمات التفريغ الغلط (العربي بالذات: همزات، تاء مربوطة، كلمات اتسمعت غلط) — الكابشن والنص على الشاشة بييجوا من هنا
    await prog('narration', 0.6);
    const fixed = await correctTranscript(asr, detected || lang).catch(() => null);
    if (fixed) { tokens = fixed.tokens; outScript = fixed.text; }
  } else {
    const chunks = splitForTts(script);
    if (!chunks.length) throw new Error('empty script');
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      await prog('narration', (i / chunks.length) * 0.9);
      let n;
      try { n = await synthesizeNarration(chunks[i].text, { voiceKey, languageCode: lang }); }
      catch (e) { if (voiceKey !== 'male_wise') n = await synthesizeNarration(chunks[i].text, { voiceKey: 'male_wise', languageCode: lang }); else throw e; }
      const wav = await toWav(n.audioPath, path.join(workDir, `tts_${i}.wav`));
      rmQuiet(n.workDir);
      let words; try { words = (await transcribeWords(wav, { language: lang })).words; } catch { words = null; }
      parts.push({ wav, dur: await probeDuration(wav), text: chunks[i].text, words });
    }
    const sil = path.join(workDir, 'sil.wav');
    await ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.28', sil]);
    const list = path.join(workDir, 'tts_list.txt'); const lines = []; let offset = 0; tokens = [];
    parts.forEach((p, i) => {
      lines.push(`file '${p.wav}'`);
      const tk = tokenizeScript(p.text);
      const timed = p.words ? alignScriptToWords(tk, p.words) : tk.map((t, k) => ({ ...t, start: (k / tk.length) * p.dur, end: ((k + 1) / tk.length) * p.dur }));
      timed.forEach(t => tokens.push({ ...t, start: t.start + offset, end: t.end + offset, sentenceEnd: false }));
      if (tokens.length) tokens[tokens.length - 1].paraEnd = true;
      offset += p.dur;
      if (i < parts.length - 1) { lines.push(`file '${sil}'`); offset += 0.28; }
    });
    fs.writeFileSync(list, lines.join('\n'));
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', narrationFile]);
    parts.forEach(p => rmQuiet(p.wav));
  }
  const total = await probeDuration(narrationFile);
  await prog('narration', 1);
  return { tokens, narrationFile, total, script: outScript, lang: detected || lang };
}

// ── تصحيح تفريغ الصوت: الموديل بيصلّح أخطاء السمع بس (من غير ما يغيّر الكلام أو اللهجة أو الترتيب)، وبعدين بنركّب النص المصحَّح
// على توقيتات Whisper نفسها. لو التصحيح غيّر الكلام أكتر من اللازم بنرجع للتفريغ الأصلي
const normW = (w) => String(w || '').toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}]/gu, '');
function overlap(a, b) {
  const A = a.map(normW).filter(Boolean), B = b.map(normW).filter(Boolean);
  if (!A.length || !B.length) return 0;
  const prev = new Uint16Array(B.length + 1), cur = new Uint16Array(B.length + 1);
  for (let i = 1; i <= A.length; i++) { for (let j = 1; j <= B.length; j++) cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]); prev.set(cur); }
  return prev[B.length] / Math.max(A.length, B.length);
}
export async function correctTranscript(asr, lang = 'en', deps = {}) {
  const words = (asr?.words || []).map(w => w.w);
  if (words.length < 4) return null;
  const isAr = String(lang).startsWith('ar');
  const raw = await (deps.llmText || llmText)({
    system: `You fix automatic speech-recognition mistakes in the transcript of a recorded voice-over${isAr ? ' in Arabic (any dialect)' : ''}. Fix ONLY recognition errors: words that were clearly misheard and do not fit the context, broken spelling${isAr ? ' (hamza أ/إ/ا, taa marbuta ة/ه, alef maqsura ى/ي, wrongly split or merged words)' : ''}, misspelled names and brands, numbers written wrongly. Keep the speaker's exact words, dialect, word order and length — never rewrite, translate, summarise, formalise the dialect, add or remove content. Add natural punctuation (. ، ؟ ! ,). Return ONLY the corrected transcript text.`,
    user: words.join(' '),
    maxTokens: Math.min(4000, 200 + words.length * 6), temperature: 0,
  });
  const text = String(raw || '').replace(/^["'«]|["'»]$/g, '').replace(/\s+/g, ' ').trim();
  const out = text.split(/\s+/).filter(Boolean);
  if (!out.length || Math.abs(out.length - words.length) > Math.max(3, words.length * 0.15) || overlap(words, out) < 0.6) return null;
  const tokens = alignScriptToWords(tokenizeScript(text), asr.words).map(t => ({ ...t, sentenceEnd: /[.!?؟…]$/.test(t.w) }));
  if (tokens.some(t => !Number.isFinite(t.start) || !Number.isFinite(t.end))) return null;
  return { text, tokens };
}

