// ── timelineBuilder.js ── خطة + أصول + توقيت كلمات → Timeline جاهز لمحرك الرندر
import { punchTimes } from './planner.js';

const MOTIONS = ['in', 'out', 'pan_right', 'pan_left'];

export function buildTimeline({ beats, plans, assets, boards = {}, tokens, ratio = '16:9', theme = 'blue', lang = 'en', captionsStyle = 'karaoke', narrationFile, musicFile = null, musicVolume = 0.15, motionGraphics = true }) {
  let imgCount = 0;
  const out = beats.map((b, i) => {
    const plan = plans[i];
    const a = assets[i];
    const beat = { dur: b.dur, overlays: [], transitionIn: plan.transition || 'cut' };
    const punches = punchTimes(b, plan.emphasis);
    const wantTemplate = motionGraphics !== false;

    const board = plan.visual === 'text' && plan.template?.name === 'photo_board' ? (boards[i] || []) : null;
    if (board && wantTemplate && board.length >= 2) {
      beat.visual = { kind: 'background' };
      beat.overlays.push({ template: 'photo_board', data: { title: plan.template.data.title, photos: board.map(p => ({ file: p.file, caption: p.caption })) }, at: 0.1, dur: Math.max(1.6, b.dur - 0.1) });
    } else if (board) {
      // لوحة صور ناقصة: لو لقينا صورة واحدة نعرضها كصورة كاملة، وإلا نكمّل لأقرب بديل (جملة متحركة)
      const one = board[0];
      if (one) beat.visual = { kind: 'image', file: one.file, grade: gradeFor(plan, one), motion: MOTIONS[imgCount++ % MOTIONS.length], punches };
      else {
        const phrase = shortPhrase(b);
        beat.visual = { kind: 'background' };
        if (phrase && wantTemplate) beat.overlays.push({ template: 'kinetic_text', data: { text: phrase, emphasis: plan.emphasis || [] }, at: 0.1, dur: Math.max(1.2, b.dur - 0.1) });
      }
    } else if (plan.visual === 'text' && plan.template && wantTemplate) {
      beat.visual = { kind: 'background' };
      beat.overlays.push({ template: plan.template.name, data: plan.template.data, at: 0.1, dur: Math.max(1.2, b.dur - 0.1) });
    } else if (a?.kind === 'video') {
      const slack = Math.max(0, (a.duration || 0) - b.dur - 0.5);
      beat.visual = { kind: 'video', file: a.file, grade: gradeFor(plan, a), motion: i % 3 === 0 ? 'push' : 'still', startOffset: slack > 0 ? Math.min(slack, 0.5 + ((i * 7) % 10) / 10 * slack * 0.6) : 0, punches };
    } else if (a?.kind === 'image') {
      beat.visual = { kind: 'image', file: a.file, grade: gradeFor(plan, a), motion: MOTIONS[imgCount++ % MOTIONS.length], punches };
    } else {
      // مفيش أصل: بنعرض الجملة نفسها كنص متحرك على الخلفية بدل شاشة فاضية
      const phrase = shortPhrase(b);
      beat.visual = { kind: 'background' };
      if (phrase && wantTemplate) beat.overlays.push({ template: 'kinetic_text', data: { text: phrase, emphasis: plan.emphasis || [] }, at: 0.1, dur: Math.max(1.2, b.dur - 0.1) });
    }
    if (plan.visual !== 'text' && wantTemplate) for (const ov of plan.overlays || []) beat.overlays.push({ ...ov, at: Math.min(0.6, b.dur * 0.15), dur: Math.max(1.5, Math.min(b.dur - 0.7, 4.5)) });
    return beat;
  });
  const words = tokens.map(t => ({ w: t.w, start: t.start, end: t.end }));
  return { ratio, theme, lang, beats: out, narrationFile, musicFile, musicVolume, captions: captionsStyle ? { words, style: captionsStyle } : null };
}

function gradeFor(plan, a) {
  if (plan.grade && plan.grade !== 'none') return plan.grade;
  // أرشيف قديم أصلًا (أبيض وأسود) من غير تدرّج إضافي، الباقي طبيعي
  return null;
}

function shortPhrase(b) {
  const w = b.text.split(/\s+/);
  return w.length <= 10 ? b.text : w.slice(0, 9).join(' ') + '…';
}
