// تشغيل: node src/services/documentary/selftest-scenes.mjs — ضمان مشاهد الخرائط/لوحات الصور + تقطيع الـhook
import assert from 'node:assert/strict';
import { buildBeats, countriesIn, injectMaps, injectBoards, enforcePacing, planBeats } from './planner.js';
import { buildTimeline } from './timelineBuilder.js';
import { sfxForBeat } from './sfx.js';

assert.deepEqual(countriesIn('In 1939 Germany invaded Poland and Britain declared war').sort(), ['DE', 'GB', 'PL']);
assert.deepEqual(countriesIn('An individual indicated the woman was in Chinatown'), [], 'no partial-word hits');
assert.ok(countriesIn('غزت ألمانيا بولندا عام 1939').includes('DE') && countriesIn('غزت ألمانيا بولندا').includes('PL'));
assert.ok(countriesIn('the United States and the Soviet Union').includes('US') && countriesIn('the Soviet Union').includes('RU'));

// كلام 60 ثانية: كلمات كل 0.4 ثانية، جمل طويلة
const words = []; let t = 0;
const sentences = ['In 1939 Germany invaded Poland and the world changed forever, as Britain and France declared war.', 'The army of Adolf Hitler moved fast across the open plains of the east without any warning.', 'Meanwhile the leaders of the Allies in France and Britain met to decide what to do next about the growing crisis.', 'Soon the war spread to Egypt and Japan and touched the lives of millions of ordinary people.', 'Winston Churchill became prime minister and promised to never surrender to the enemy forces.', 'Years later the war ended and a new world order was born from the ashes of the old one.'];
for (const s of sentences) for (const w of s.split(' ')) { words.push({ w, start: t, end: t + 0.36 }); t += 0.4; }
const beats = buildBeats(words, { totalDur: t });
const hook = beats.filter(b => b.hook);
console.log('beats', beats.map(b => `${b.dur.toFixed(1)}${b.hook ? 'h' : ''}`).join(' '));
assert.ok(hook.length >= 3 && hook.every(b => b.dur <= 4.2), 'hook split into fast beats');
assert.ok(beats.slice(hook.length).every(b => !b.hook));
for (let i = 1; i < beats.length; i++) assert.ok(Math.abs(beats[i].start - beats[i - 1].end) < 1e-6);

const stock = () => ({ visual: 'stock', kind: 'either', queries: ['x'], overlays: [], grade: 'none', emphasis: [], transition: 'cut', template: null });
const plans = beats.map(stock);
const n = injectMaps({ beats, plans, language: 'en' });
console.log('maps injected', n, plans.map((p, i) => p.template?.name ? `${i}:${p.template.name}` : '').filter(Boolean).join(' '));
assert.ok(n >= 1);
const mi = plans.findIndex(p => p.template?.name === 'map_reveal');
assert.ok(!beats[mi].hook && plans[mi].visual === 'text' && plans[mi].template.data.regions.length >= 1 && plans[mi].template.data.regions[0].label);
assert.ok(plans.every((p, i) => !(p.visual === 'text' && plans[i + 1]?.visual === 'text')), 'never two text scenes in a row');
// موجود بالفعل → مش بيزوّد
assert.equal(injectMaps({ beats, plans, language: 'en' }) , Math.max(0, Math.max(1, Math.min(4, Math.round(t / 60))) - plans.filter(p => p.template?.name === 'map_reveal').length));

// لوحات الصور (LLM مُحاكى فيه بيانات سيئة)
const ask = async ({ user }) => { const ids = [...user.matchAll(/^\[(\d+)\]/gm)].map(m => +m[1]); return { boards: [{ i: 9999, photos: [{ query: 'bad' }, { query: 'bad2' }] }, { i: ids[ids.length - 1], title: 'Key people', photos: [{ query: 'Winston Churchill 1940', caption: 'Churchill' }, { query: 'Adolf Hitler 1938', caption: 'Hitler' }] }] }; };
const nb = await injectBoards({ beats, plans, ask, language: 'en' });
assert.equal(nb, 1); const bi = plans.findIndex(p => p.template?.name === 'photo_board'); assert.ok(bi > 0 && plans[bi].template.data.photos.length === 2);
assert.equal(await injectBoards({ beats, plans, ask: async () => { throw new Error('down'); }, language: 'en' }), 0);

// planBeats كامل: LLM بيرجّع stock بس → الخرائط تتضاف + enforcePacing ما يشيلهاش
const full = await planBeats({ beats, language: 'en' }, { llmJson: async ({ system, user }) => (/PHOTO BOARD/.test(system) ? ask({ user }) : { title: 'T', mood: 'epic', beats: beats.map(b => ({ i: b.i, visual: 'archive', kind: 'image', queries: ['q ' + b.i] })) }) });
assert.ok(full.plans.some(p => p.template?.name === 'map_reveal') && full.plans.some(p => p.template?.name === 'photo_board'), 'both scene types survive pacing');

// timeline: hook flags + sfx
const assets = beats.map(() => ({ kind: 'image', file: '/tmp/x.jpg' }));
const tl = buildTimeline({ beats, plans: full.plans, assets, boards: {}, tokens: words, theme: 'blue' });
assert.equal(tl.beats[0].transitionIn, 'flash'); assert.ok(tl.beats[1].hook && !tl.beats[hook.length + 1].hook);
const imp = sfxForBeat(tl.beats[0], 0).some(e => e.type === 'impact'); assert.ok(imp, 'impact on first hook beat');
assert.ok(sfxForBeat(tl.beats[1], 2.3).some(e => e.type === 'whoosh'));
console.log('SCENES SELFTEST PASSED');
