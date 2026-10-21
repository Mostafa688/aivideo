// ── produce.js ── فيديو أنيميشن بالكود من صوت: (سكريبت أو صوت مرفوع) → سرد + توقيت → مخرج (JSON) → رندر → صوت (مؤثرات + موسيقى)
import fs from 'fs';
import path from 'path';
import { buildNarration, writeAnimationScript, detectLang, MAX_SECONDS, ABS_MAX_SECONDS, DOC_ABS_MAX_SECONDS } from './narration.js';
import { writeDocumentScript } from './docScript.js';
import { segmentScenes, directVideo, trDuration, LOOKS, isCartoon, LOOK_PALETTES, isGrounded } from './director.js';
import { pickPalette } from './design.js';
import { resolveVoxImages } from './images.js';
import { findLogo } from './logos.js';
import { measureNonLatin } from './typeset.js';
import { designCast, makeCastMap } from './cast.js';
import { designArt } from './art.js';
import { choreograph, designWorldCast, FALLBACK_CAST } from './w3d/choreo.js';
import { GEMINI_VOICE_NAMES } from '../videoAudioService.js';
import { makeMeasurer } from './measure.js';
import { renderCodeVideo, RATIO_SIZE } from './render.js';
import { getBackgroundMusicBuffer } from '../videoAudioService.js';
import { buildCaptionsAss } from '../documentary/captions.js';
import { buildSrt } from '../documentary/uploadPackage.js';
import { watermarkVideo } from '../watermark.js';
import { persistAnimationBundle } from './editAnimation.js';
import { DESIGN_STYLES, paletteForStyle, pickDesignStyle } from './fxStyles.js';

const FEMALE_VOICES = new Set(['Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe', 'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Sulafat']);
export function voiceGenderOf(input) {
  if (input.source === 'voiceover') return 'unknown';
  const k = String(input.voiceKey || '');
  if (/^female_/.test(k) || FEMALE_VOICES.has(k)) return 'female';
  if (/^male_/.test(k) || GEMINI_VOICE_NAMES.has(k)) return 'male';
  return 'unknown';
}
const LOOK_MUSIC = { cartoon: 'upbeat', cartoon3d: 'upbeat', world3d: 'upbeat', vox: 'chill' };
const MUSIC_MOOD = { epic: 'epic', tech: 'upbeat', business: 'chill', nature: 'chill', energetic: 'upbeat', serious: 'tension', clean: 'chill', minimal: 'chill' };

export async function produceAnimation({ id, userId, input, workDir, prog }, deps = {}) {
  let lang = input.language || 'en'; const ratio = input.ratio === '9:16' ? '9:16' : '16:9';
  const look = LOOKS.includes(input.look) ? input.look : 'motion';
  const { w, h } = RATIO_SIZE[ratio];
  let title = input.title || '', script = input.script || '';

  // 1) سكريبت (وضع الموضوع)
  if (input.source === 'topic') {
    await prog('script', 0.2);
    script = await (deps.writeAnimationScript || writeAnimationScript)({ topic: input.topic, seconds: input.seconds || 60, language: lang, brief: input.brief || '', maxSeconds: input.maxSeconds || MAX_SECONDS });
    await prog('script', 1, { script });
  }
  // 1ب) من مستند/PDF: سكريبت شرح من المحتوى المكتوب بس، على قد المدة المطلوبة
  if (input.source === 'document') {
    await prog('script', 0.05);
    const ds = await (deps.writeDocumentScript || writeDocumentScript)({ text: input.documentText, seconds: input.seconds || 180, language: input.language || null, brief: input.brief || '', onProgress: (f) => prog('script', 0.05 + f * 0.9) });
    script = ds.script; lang = ds.language || lang; title = title || ds.title || '';
    await prog('script', 1, { script, ...(title ? { title } : {}) });
  }

  // لغة الفيديو = لغة السكريبت الفعلية (لو العميل كتب عربي واللغة جت en غلط، الصوت والكلام يبقوا عربي)
  if (input.source !== 'voiceover') lang = detectLang(script, lang) || lang;
  // 2) السرد + توقيت الكلمات
  const nar = await (deps.buildNarration || buildNarration)({ mode: input.source === 'voiceover' ? 'voiceover' : 'script', script, audioFile: input.audioFile, lang, voiceKey: input.voiceKey, workDir, prog });
  const maxSec = Math.min((input.source === 'document' || input.docVideo) ? DOC_ABS_MAX_SECONDS : ABS_MAX_SECONDS, input.maxSeconds || MAX_SECONDS);
  if (nar.total > maxSec + 3) { const e = new Error(`narration is ${Math.round(nar.total)}s, over the ${maxSec}s limit`); e.code = 'too_long'; throw e; }
  script = nar.script || script;
  if (nar.lang) lang = nar.lang;

  // 3) المخرج
  const spoken = segmentScenes(nar.tokens, nar.total, look === 'world3d' ? { minLen: 2.2, softMax: 4.2, maxLen: 5.5, maxScenes: Math.max(40, Math.ceil(nar.total / 3)) } : { maxScenes: Math.max(36, Math.ceil(nar.total / 3.4)) }); // فيديو أطول (3-5 دقايق) = مشاهد أكتر // الـ3D: لقطات أقصر وقطع أكتر
  if (!spoken.length) throw new Error('no scenes');
  // كاست الكارتون: الـLLM بيبتكر شخصيات/مخلوقات على مقاس القصة (لو فشل بنستخدم الشخصيات الجاهزة)
  let castMap = makeCastMap([]), castChars = [];
  if (isCartoon(look)) {
    const cr = await (deps.designCast || designCast)({ text: spoken.map(x => x.text).join(' '), topic: input.topic || title, language: lang, look, voiceGender: voiceGenderOf(input) });
    if (cr.characters.length) { castMap = makeCastMap(cr.characters); castChars = cr.characters; }
  }
  // عالم 3D: كاست (شخصيات/حيوانات بملابس وألوان) + بيئة افتراضية على مقاس القصة
  let worldMeta = null;
  if (look === 'world3d') {
    const wc = await (deps.designWorldCast || designWorldCast)({ text: spoken.map(x => x.text).join(' '), topic: input.topic || title, language: lang, voiceGender: voiceGenderOf(input) });
    const castSpecs = Object.keys(wc.castSpecs || {}).length ? wc.castSpecs : { ...FALLBACK_CAST };
    worldMeta = { castSpecs, host: wc.host && castSpecs[wc.host] ? wc.host : Object.keys(castSpecs)[0], env: wc.env, time: wc.time || 'day' };
  }
  const plan = await (deps.directVideo || directVideo)({ spoken, language: lang, ratio, topic: input.topic || title, style: input.style || null, look, voiceGender: voiceGenderOf(input), castMap, worldMeta, onProgress: (f) => prog('plan', f) });
  title = title || plan.title || 'Animated video';
  await prog('plan', 1, { title });

  // 4) تجميع القصة (storyboard)
  let pal = pickPalette((LOOK_PALETTES[look] || []).includes(input.palette) ? input.palette : plan.palette || (look === 'cartoon' ? 'toon' : look === 'cartoon3d' ? 'candy' : look === 'vox' ? 'vox' : look === 'world3d' ? 'daylight' : null), plan.mood);
  // الموشن: نظام تصميم كامل لكل فيديو (glow/flat/swiss/blueprint/pop/pastel) — المخرج بيختاره حسب الموضوع، ولو مختارش بنختار حسب المود
  // مع تنويع (كل فيديو شكل). لو العميل طلب لون من ألوان الموشن صراحةً بنفضل على glow بنفس اللون
  if (look === 'motion') {
    const seedN = [...String(id || title || script)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const design = input.design && DESIGN_STYLES.includes(input.design) ? input.design
      : (LOOK_PALETTES.motion || []).includes(input.palette) ? 'glow'
      : DESIGN_STYLES.includes(plan.design) ? plan.design : pickDesignStyle(plan.mood, seedN);
    if (design !== 'glow') pal = paletteForStyle(design, seedN) || pal;
  }
  const scenes = spoken.map((sc, i) => {
    const p = plan.scenes[i], dur = sc.end - sc.start;
    const prevDur = i > 0 ? spoken[i - 1].end - spoken[i - 1].start : dur;
    const trKind = i === 0 ? 'cut' : p.transition;
    const trDur = trKind === 'cut' ? 0 : Math.min(trDuration(trKind), 0.35 * Math.min(dur, prevDur));
    return {
      index: i, type: p.type, data: p.data, bg: p.bg, cam: p.cam, seed: (i * 1.37) % 7, start: sc.start, end: sc.end,
      trKind: trDur < 0.2 ? 'cut' : trKind, trDur: trDur < 0.2 ? 0 : trDur,
      tokens: sc.tokens.map(t => ({ w: t.w, start: Math.max(0, t.start - sc.start), end: Math.max(0.05, t.end - sc.start) })),
    };
  });
  // الموشن جرافيكس: أي مشهد كلام من غير عنصر بصري بناخد له شكل 3D من معنى الكلام (مفيش مشهد نص بس)
  if (look === 'motion') {
    let gen = 0;
    scenes.forEach((sc, i) => { if (sc.type === 'kinetic' && !sc.data.icon && !sc.data.object) sc.data = { ...sc.data, object: objectForText(spoken[i].text) || (gen++ % 2 ? 'star' : 'sparkle') }; });
    for (let i = 1; i < scenes.length; i++) if (scenes[i].type === 'kinetic' && scenes[i - 1].type === 'kinetic' && scenes[i].data.object && scenes[i].data.object === scenes[i - 1].data.object) scenes[i].data = { ...scenes[i].data, object: undefined, icon: scenes[i].data.icon || 'star' };
  }
  // عالم 3D: "مخرج الحركة" بيحوّل كل مشهد world لعالم 3D (بيئة + شخصيات + مسارات + أغراض + كاميرا) — دايمًا بيرجّع عالم سليم (افتراضي لو فشل)
  const worldIdx = scenes.map((sc, i) => (sc.type === 'world' ? i : -1)).filter(i => i >= 0);
  if (worldIdx.length) {
    await prog('assets', 0);
    let doneW = 0, nextW = 0;
    const workerW = async () => {
      while (nextW < worldIdx.length) {
        const i = worldIdx[nextW++], sc = scenes[i];
        const wd = await (deps.choreograph || choreograph)({ idea: sc.data.idea, text: spoken[i].text, duration: sc.end - sc.start, language: lang, castSpecs: worldMeta.castSpecs, host: worldMeta.host, env: sc.data.env, time: sc.data.time, portrait: ratio === '9:16' });
        sc.data = { ...wd, caption: true, emphasis: sc.data.emphasis || [] };
        await prog('assets', ++doneW / worldIdx.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, worldIdx.length) }, workerW));
  }
  // رسم حر: رسّام (LLM) بيرسم كل مشهد "art" كـ JSON آمن (بيتحقق منه الكود) — اللي ما يتحققش بيتحوّل لمشهد بديل
  const artIdx = scenes.map((sc, i) => (sc.type === 'art' ? i : -1)).filter(i => i >= 0);
  if (artIdx.length) {
    await prog('assets', 0);
    let doneArt = 0, next = 0;
    const worker = async () => {
      while (next < artIdx.length) {
        const i = artIdx[next++], sc = scenes[i], txt0 = spoken[i].text;
        const r = await (deps.designArt || designArt)({ idea: sc.data.idea, text: txt0, language: lang, palette: pal, castMap: isCartoon(look) ? castMap : null, look, textOk: (x) => isGrounded(x, txt0, 0.5) });
        if (r) sc.data = { ...sc.data, bg: r.bg, elements: r.elements };
        else { // بديل حسب النمط
          const words = txt0.split(/\s+/);
          if (isCartoon(look)) { sc.type = 'char_say'; sc.data = { character: plan.host, emotion: 'happy', pose: 'point', emphasis: sc.data.emphasis || [] }; }
          else if (look === 'vox' && words.length >= 4) { sc.type = 'headline'; sc.data = { headline: words.slice(0, 8).join(' '), emphasis: [] }; }
          else { sc.type = 'kinetic'; sc.data = { emphasis: sc.data.emphasis || [] }; }
        }
        await prog('assets', ++doneArt / artIdx.length * 0.5);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, artIdx.length) }, worker));
  }
  // نمط Vox: صور أرشيفية حقيقية (اللي مالقيناش ليه صورة بنحوّله لقصاصة جريدة أو نص متحرك)
  let images = null, imageCredits = [];
  if (look === 'vox' || scenes.some(sc => sc.type === 'poster' && sc.data.query)) {
    const slots = [];
    // لوجوهات: من مكتبة اللوجوهات الرسمية بالكود، واللي مش موجود بندوّر على صورة لوجو بتاعته في الأرشيف
    for (const [i, sc] of scenes.entries()) {
      if (sc.type !== 'logo') continue;
      const L = await findLogo(sc.data.brand).catch(() => null);
      if (L) sc.data = { ...sc.data, logo: L };
      else slots.push({ key: `s${i}`, scene: i, text: spoken[i].text, query: `${sc.data.brand} logo`, named: true });
    }
    scenes.forEach((sc, i) => {
      if (sc.type === 'photo' || sc.type === 'fullphoto') slots.push({ key: `s${i}`, scene: i, text: spoken[i].text, query: sc.data.query, named: sc.data.named, caption: sc.data.caption });
      else if (sc.type === 'collage') sc.data.slots.forEach((q, k) => slots.push({ key: `s${i}_${k}`, scene: i, text: spoken[i].text, query: q.query, named: q.named }));
      else if (sc.type === 'portrait') slots.push({ key: `s${i}`, scene: i, text: spoken[i].text, query: sc.data.query, named: sc.data.named, cutout: sc.data.layout === 'year' ? false : 'model' }); // قص الخلفية (بالكود، وموديل رخيص لو الخلفية مش سادة)
      else if (sc.type === 'poster' && sc.data.query) slots.push({ key: `s${i}`, scene: i, text: spoken[i].text, query: `${sc.data.query} isolated on white background`, named: false, cutout: true }); // صورة متقصوصة (الخلفية بتتشال بالكود)
    });
    await prog('assets', 0);
    const res = slots.length ? await (deps.resolveVoxImages || resolveVoxImages)({ slots, ratio, assetsDir: path.join(workDir, 'images'), onProgress: (f) => prog('assets', f) }) : { images: {}, credits: [], missing: new Set() };
    images = res.images; imageCredits = res.credits;
    scenes.forEach((sc, i) => {
      if (sc.type === 'photo' || sc.type === 'fullphoto') {
        if (images[`s${i}`]) sc.data = { ...sc.data, img: `s${i}` };
        else { const txt = spoken[i].text; sc.type = txt.split(/\s+/).length >= 4 ? 'headline' : 'kinetic'; sc.data = sc.type === 'headline' ? { headline: txt.split(/\s+/).slice(0, 8).join(' '), emphasis: [] } : { emphasis: [] }; }
      } else if (sc.type === 'logo') {
        if (!sc.data.logo && images[`s${i}`]) sc.data = { ...sc.data, img: `s${i}` }; // ولو مفيش: شارة بأول حروف الاسم
      } else if (sc.type === 'portrait') {
        const im = images[`s${i}`];
        if (im && (sc.data.layout === 'year' || im.uriCut)) sc.data = { ...sc.data, img: `s${i}` };
        else if (im) { sc.type = 'photo'; sc.data = { img: `s${i}`, caption: sc.data.title, emphasis: [] }; } // الخلفية متقصتش → صورة مطبوعة عادية
        else { const hero = sc.data.title || sc.data.year; sc.type = hero ? 'poster' : 'kinetic'; sc.data = hero ? { hero, kicker: sc.data.sub } : { emphasis: [] }; }
      } else if (sc.type === 'poster') {
        if (sc.data.query && images[`s${i}`]) sc.data = { ...sc.data, img: `s${i}` };
      } else if (sc.type === 'collage') {
        const ids = sc.data.slots.map((_, k) => `s${i}_${k}`).filter(id => images[id]);
        if (ids.length >= 2) sc.data = { imgs: ids, headline: sc.data.headline };
        else if (ids.length === 1) { sc.type = 'photo'; sc.data = { img: ids[0], emphasis: [] }; }
        else { sc.type = 'kinetic'; sc.data = { emphasis: [] }; }
      }
    });
    await prog('assets', 1);
  }
  // البوستر التحريري: قياس العربي الحقيقي بخطوطه (اللاتيني بيتقاس من الخط نفسه)
  for (const sc of scenes) if (sc.type === 'poster' || sc.type === 'portrait') { try { sc.data._w = await measureNonLatin([sc.data.kicker, sc.data.hero, sc.data.bar, sc.data.tail, sc.data.title, sc.data.sub, sc.data.year]); } catch { /* تقدير */ } }
  const rtl = ['ar', 'he', 'fa', 'ur'].includes(String(lang).split(/[-_]/)[0]);
  const mm = await makeMeasurer(nar.tokens.map(t => t.w), { rtl });
  const story = { w, h, palette: pal, lang, scenes, mm, duration: nar.total, look, cast: isCartoon(look) ? { host: plan.host, map: castMap } : { host: null, map: castMap }, images };

  // 5) الموسيقى
  let musicFile = null;
  if (input.music !== false) {
    try {
      musicFile = path.join(workDir, 'music.mp3');
      const track = input.musicTrack && /^[\w ',.&()\-]+\.mp3$/i.test(input.musicTrack) && fs.existsSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack));
      if (track) fs.copyFileSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack), musicFile);
      else fs.writeFileSync(musicFile, await getBackgroundMusicBuffer('youtube', LOOK_MUSIC[look] || MUSIC_MOOD[plan.mood] || input.musicMood || 'upbeat'));
    } catch (e) { console.warn('[CodeVideo] music unavailable:', e.message); musicFile = null; }
  }

  // 6) كابشن اختياري (النص المتحرك بيغطي الكلام عادةً، فالافتراضي من غير كابشن)
  let assFile = null;
  if (input.captions && input.captions !== 'none') {
    try {
      assFile = path.join(workDir, 'captions.ass');
      const style = ratio === '9:16' ? 'word' : input.captions;
      fs.writeFileSync(assFile, buildCaptionsAss({ words: nar.tokens.map(t => ({ w: t.w, start: t.start, end: t.end })), style, w, h, lang, theme: 'blue' }));
    } catch (e) { console.warn('[CodeVideo] captions skipped:', e.message); assFile = null; }
  }

  // 7) الرندر
  const outFile = path.join(workDir, 'animation.mp4');
  const r = await renderCodeVideo({
    story, narrationFile: nar.narrationFile, musicFile, assFile, workDir: path.join(workDir, 'render'), outFile,
    onProgress: (stage, f) => prog('render', stage === 'frames' ? f * 0.9 : 0.9 + f * 0.1),
  });
  if (input.watermark) r.file = await (deps.watermarkVideo || watermarkVideo)(r.file); // التجربة المجانية عليها علامة Erivion
  const sceneStats = { look, scenes: scenes.length, types: scenes.reduce((a, s) => { a[s.type] = (a[s.type] || 0) + 1; return a; }, {}), sfxEvents: r.sfxEvents, palette: pal.name };
  console.log(`[CodeVideo] job ${id}:`, JSON.stringify(sceneStats));
  // وصفة الفيديو عشان العميل يقدر يعدّل عليه بعدين ("غيّر المشهد ده"/"احذف الجزء ده") من غير ما يتعمل من الأول
  let editor = null;
  try { editor = await (deps.persistAnimationBundle || persistAnimationBundle)({ jobId: id, userId, story, castChars, narrationFile: nar.narrationFile, musicFile, allTokens: nar.tokens.map(t => ({ w: t.w, start: t.start, end: t.end })), input, title, script, workDir }); }
  catch (e) { console.warn('[CodeVideo] edit bundle not saved:', e.message); }
  return { animEditor: editor, sceneStats, file: r.file, duration: r.duration, credits: imageCredits, script, title, chapters: [], srt: buildSrt(nar.tokens.map(t => ({ w: t.w, start: t.start, end: t.end }))) };
}

// كلمة → شكل 3D مناسب (عربي/إنجليزي) — بنقارن ببداية الكلمة بعد شيل السوابق (و/ف/ب/ل/ال) عشان "مال" متطلعش من "أعمال"
const OBJECT_HINTS = [
  ['coin', ['فلوس', 'مال', 'ربح', 'أرباح', 'سعر', 'تمن', 'ثمن', 'دولار', 'جنيه', 'ريال', 'money', 'price', 'cash', 'profit', 'cost', 'salary']],
  ['bulb', ['فكر', 'فكرة', 'أفكار', 'ابداع', 'إبداع', 'idea', 'ideas', 'creative', 'think']],
  ['question', ['ليه', 'لماذا', 'ازاي', 'إزاي', 'كيف', 'سؤال', 'why', 'how', 'question']],
  ['warning', ['خطر', 'خطورة', 'تحذير', 'احذر', 'مشكلة', 'مشاكل', 'risk', 'danger', 'warning', 'problem']],
  ['bolt', ['سرعة', 'بسرعة', 'سريع', 'طاقة', 'speed', 'fast', 'energy', 'quick']],
  ['target', ['هدف', 'أهداف', 'اهداف', 'نجاح', 'goal', 'goals', 'target', 'success']],
  ['arrow', ['نمو', 'زيادة', 'يزيد', 'تكبر', 'growth', 'grow', 'increase']],
  ['heart', ['حب', 'قلب', 'صحة', 'love', 'heart', 'health']],
  ['check', ['صح', 'صحيح', 'أيوه', 'ايوه', 'yes', 'right', 'correct']],
  ['cross', ['غلط', 'خطأ', 'ممنوع', 'no', 'wrong', 'never', 'mistake']],
  ['flame', ['ترند', 'نار', 'hot', 'trend', 'fire', 'viral']],
  ['puzzle', ['حل', 'حلول', 'لغز', 'solve', 'solution', 'puzzle']],
  ['sparkle', ['جديد', 'سحر', 'مميز', 'new', 'magic', 'special']],
];
const AR_PREFIX = /^(وبال|وال|بال|فال|كال|لل|ال|و|ف|ب|ل|ك)(?=[\u0621-\u064A]{2,})/;
function objectForText(text) {
  const words = String(text || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const forms = words.flatMap(w => { const a = [w]; let x = w; for (let k = 0; k < 2; k++) { const y = x.replace(AR_PREFIX, ''); if (y === x) break; a.push(y); x = y; } return a; });
  for (const [ob, list] of OBJECT_HINTS) {
    for (const k of list) {
      const ar = /[\u0600-\u06FF]/.test(k);
      if (forms.some(f => (ar ? f.startsWith(k) && f.length <= k.length + 3 : f === k))) return ob;
    }
  }
  return null;
}
