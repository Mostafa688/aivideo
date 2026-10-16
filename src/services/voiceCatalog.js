// ── voiceCatalog.js ── أصوات الذكاء الاصطناعي اللي العميل بيختار منها في الشات (كارت فيه صورة المتكلم + عينة صوت)
// المفتاح = اسم صوت Gemini TTS نفسه (synthesizeNarration بيقبله مباشرة). العينة بتتولد مرة واحدة لكل صوت/لغة وتتخزن.
import fs from 'fs';
import path from 'path';
import { synthesizeNarration } from './videoAudioService.js';

export const VOICE_CATALOG = [
  { key: 'Charon', gender: 'male', color: '#2f5ea8', ar: { name: 'كريم', tone: 'راوي عميق وهادي — وثائقي' }, en: { name: 'Charon', tone: 'Deep, calm narrator — documentary' } },
  { key: 'Orus', gender: 'male', color: '#264653', ar: { name: 'ياسين', tone: 'حازم وواثق — أخبار وشرح' }, en: { name: 'Orus', tone: 'Firm and confident — news & explainers' } },
  { key: 'Puck', gender: 'male', color: '#e5762c', ar: { name: 'عمر', tone: 'شبابي ومتحمس — ريلز وإعلانات' }, en: { name: 'Puck', tone: 'Upbeat and youthful — reels & ads' } },
  { key: 'Fenrir', gender: 'male', color: '#c1121f', ar: { name: 'طارق', tone: 'حماسي وسريع — رياضة وأكشن' }, en: { name: 'Fenrir', tone: 'Excited and fast — sports & action' } },
  { key: 'Kore', gender: 'female', color: '#6a4c93', ar: { name: 'ليلى', tone: 'واضحة وثابتة — تعليم وشرح' }, en: { name: 'Kore', tone: 'Clear and steady — education' } },
  { key: 'Aoede', gender: 'female', color: '#2a9d8f', ar: { name: 'سلمى', tone: 'ناعمة ودافية — قصص' }, en: { name: 'Aoede', tone: 'Warm and breezy — storytelling' } },
  { key: 'Leda', gender: 'female', color: '#d65a8a', ar: { name: 'نور', tone: 'شبابية ومرحة — محتوى خفيف' }, en: { name: 'Leda', tone: 'Young and playful — light content' } },
  { key: 'Gacrux', gender: 'female', color: '#8a6a3a', ar: { name: 'هدى', tone: 'ناضجة وراقية — براندات' }, en: { name: 'Gacrux', tone: 'Mature and elegant — brands' } },
];
export const VOICE_KEYS = new Set(VOICE_CATALOG.map(v => v.key));

const SAMPLE = {
  ar: (n) => `أهلاً، أنا ${n}. ده صوتي في فيديوهات Erivion، ممكن أحكي قصتك بالطريقة اللي تحبها.`,
  en: (n) => `Hi, I'm ${n}. This is how I sound in your Erivion videos — ready to tell your story.`,
};
const DIR = path.join(process.cwd(), 'outputs', 'voice-previews');
// عينات جاهزة متسجلة مع الكود (بتتقدّم فورًا من غير توليد) — اسم الملف: {Key}_{ar|en}.mp3
const BUNDLED = path.join(process.cwd(), 'assets', 'voice-previews');
const inflight = new Map();

/** مسار ملف عينة الصوت (بيتولد أول مرة بس) */
export async function voicePreviewFile(key, lang = 'en') {
  const v = VOICE_CATALOG.find(x => x.key === key); if (!v) return null;
  const L = lang === 'ar' ? 'ar' : 'en';
  const ready = path.join(BUNDLED, `${v.key}_${L}.mp3`);
  if (fs.existsSync(ready)) return ready;
  const file = path.join(DIR, `${v.key}_${L}.mp3`);
  if (fs.existsSync(file)) return file;
  const id = `${v.key}_${L}`;
  if (!inflight.has(id)) inflight.set(id, (async () => {
    fs.mkdirSync(DIR, { recursive: true });
    const r = await synthesizeNarration(SAMPLE[L](v[L].name), { voiceKey: v.key, languageCode: L });
    fs.copyFileSync(r.audioPath, file);
    try { fs.rmSync(r.workDir, { recursive: true, force: true }); } catch { /* temp */ }
    return file;
  })().finally(() => inflight.delete(id)));
  return inflight.get(id);
}
