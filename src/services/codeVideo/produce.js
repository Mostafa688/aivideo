// ── produce.js ── فيديو أنيميشن بالكود من صوت: (سكريبت أو صوت مرفوع) → سرد + توقيت → مخرج (JSON) → رندر → صوت (مؤثرات + موسيقى)
import fs from 'fs';
import path from 'path';
import { buildNarration, writeAnimationScript, MAX_SECONDS } from './narration.js';
import { segmentScenes, directVideo, trDuration } from './director.js';
import { pickPalette } from './design.js';
import { makeMeasurer } from './measure.js';
import { renderCodeVideo, RATIO_SIZE } from './render.js';
import { getBackgroundMusicBuffer } from '../videoAudioService.js';
import { buildCaptionsAss } from '../documentary/captions.js';
import { buildSrt } from '../documentary/uploadPackage.js';

const MUSIC_MOOD = { epic: 'epic', tech: 'upbeat', business: 'chill', nature: 'chill', energetic: 'upbeat', serious: 'tension', clean: 'chill', minimal: 'chill' };

export async function produceAnimation({ id, userId, input, workDir, prog }, deps = {}) {
  const lang = input.language || 'en', ratio = input.ratio === '9:16' ? '9:16' : '16:9';
  const { w, h } = RATIO_SIZE[ratio];
  let title = input.title || '', script = input.script || '';

  // 1) سكريبت (وضع الموضوع)
  if (input.source === 'topic') {
    await prog('script', 0.2);
    script = await (deps.writeAnimationScript || writeAnimationScript)({ topic: input.topic, seconds: input.seconds || 60, language: lang, brief: input.brief || '' });
    await prog('script', 1, { script });
  }

  // 2) السرد + توقيت الكلمات
  const nar = await (deps.buildNarration || buildNarration)({ mode: input.source === 'voiceover' ? 'voiceover' : 'script', script, audioFile: input.audioFile, lang, voiceKey: input.voiceKey, workDir, prog });
  if (nar.total > MAX_SECONDS + 3) { const e = new Error(`narration is ${Math.round(nar.total)}s, over the ${MAX_SECONDS}s limit`); e.code = 'too_long'; throw e; }
  script = nar.script || script;

  // 3) المخرج
  const spoken = segmentScenes(nar.tokens, nar.total);
  if (!spoken.length) throw new Error('no scenes');
  const plan = await (deps.directVideo || directVideo)({ spoken, language: lang, ratio, topic: input.topic || title, style: input.style || null, onProgress: (f) => prog('plan', f) });
  title = title || plan.title || 'Animated video';
  await prog('plan', 1, { title });

  // 4) تجميع القصة (storyboard)
  const pal = pickPalette(input.palette || plan.palette, plan.mood);
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
  const rtl = ['ar', 'he', 'fa', 'ur'].includes(String(lang).split(/[-_]/)[0]);
  const mm = await makeMeasurer(nar.tokens.map(t => t.w), { rtl });
  const story = { w, h, palette: pal, lang, scenes, mm, duration: nar.total };

  // 5) الموسيقى
  let musicFile = null;
  if (input.music !== false) {
    try {
      musicFile = path.join(workDir, 'music.mp3');
      const track = input.musicTrack && /^[\w ',.&()\-]+\.mp3$/i.test(input.musicTrack) && fs.existsSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack));
      if (track) fs.copyFileSync(path.join(process.cwd(), 'assets', 'music', input.musicTrack), musicFile);
      else fs.writeFileSync(musicFile, await getBackgroundMusicBuffer('youtube', MUSIC_MOOD[plan.mood] || input.musicMood || 'upbeat'));
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
  const sceneStats = { scenes: scenes.length, types: scenes.reduce((a, s) => { a[s.type] = (a[s.type] || 0) + 1; return a; }, {}), sfxEvents: r.sfxEvents, palette: pal.name };
  console.log(`[CodeVideo] job ${id}:`, JSON.stringify(sceneStats));
  return { sceneStats, file: r.file, duration: r.duration, credits: [], script, title, chapters: [], srt: buildSrt(nar.tokens.map(t => ({ w: t.w, start: t.start, end: t.end }))) };
}
