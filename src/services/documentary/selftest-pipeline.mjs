// تشغيل: node src/services/documentary/selftest-pipeline.mjs
// اختبار المسار كله (توقيت كلمات → beats → خطة LLM → أصول → timeline → رندر) بخدمات خارجية مُحاكاة:
// مفيش شبكة ولا مفاتيح مطلوبة. بيتأكد من منطق التوقيت والتخطيط والتحقق وإن الفيلم بيترندر.
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { tokenizeScript, alignScriptToWords, tokensFromAsr } from './align.js';
import { buildBeats, planBeats, sanitizeTemplate, numbersInText, enforcePacing } from './planner.js';
import { resolveAssets, scoreCandidate } from './resolver.js';
import { buildTimeline } from './timelineBuilder.js';
import { renderDocumentary } from './index.js';
import { searchWikimedia } from './sources/wikimedia.js';
import { searchNasa, materializeNasa } from './sources/nasa.js';
import { searchInternetArchive, materializeArchive } from './sources/internetArchive.js';
import { searchPexels } from './sources/pexels.js';
import { classifyLicense } from './sources/common.js';

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-pipeline-'));

// ── 1) توقيت: سكريبت vs كلمات ASR فيها اختلافات ──────────────────────────────────────────────
const script = 'In 1969, humans landed on the Moon. Neil Armstrong said a famous line.\n\nMore than 400,000 people worked on Apollo.';
const tokens = tokenizeScript(script);
assert.equal(tokens.length, 20); assert.ok(tokens.some(t => t.paraEnd));
const asr = 'in nineteen sixty nine humans landed on the moon neil armstrong said a famous line more than four hundred thousand people worked on apollo'.split(' ').map((w, i) => ({ w, start: i * 0.4, end: i * 0.4 + 0.35 }));
const aligned = alignScriptToWords(tokens, asr);
assert.ok(aligned.every(t => t.start != null && t.end >= t.start), 'all tokens timed');
assert.ok(aligned.every((t, i) => i === 0 || t.start >= aligned[i - 1].start), 'monotonic');
const moonTok = aligned.find(t => t.w.startsWith('Moon')); assert.ok(Math.abs(moonTok.start - 7 * 0.4) < 0.5);
console.log('align ok');

// ── 2) beats ──────────────────────────────────────────────────────────────────────────────────
const total = aligned[aligned.length - 1].end;
const beats = buildBeats(aligned, { totalDur: total });
assert.ok(beats.length >= 2); assert.equal(beats[0].start, 0);
for (let i = 1; i < beats.length; i++) assert.ok(Math.abs(beats[i].start - beats[i - 1].end) < 1e-6, 'contiguous');
console.log('beats ok:', beats.map(b => `${b.dur.toFixed(1)}s`).join(' '));

// ── 3) تحقق القوالب: أرقام لازم تكون في النص ──────────────────────────────────────────────────────
assert.deepEqual(numbersInText('more than 400,000 people and 1.5 million tons').map(Math.round), [400000, 1500000]);
assert.ok(sanitizeTemplate('counter', { value: 400000, label: 'people' }, 'More than 400,000 people worked'));
assert.equal(sanitizeTemplate('counter', { value: 999999, label: 'invented' }, 'More than 400,000 people worked'), null, 'invented number rejected');
assert.equal(sanitizeTemplate('bar_chart', { items: [{ label: 'a', value: 5 }, { label: 'b', value: 400000 }] }, 'about 400,000 people'), null, 'ungrounded chart item rejected');
assert.equal(sanitizeTemplate('nope', {}, 'x'), null);
assert.ok(sanitizeTemplate('lower_third', { name: 'Neil Armstrong', role: '<b>Commander</b>' }, 'x').role === 'Commander', 'html stripped');
console.log('template validation ok');

// ── 4) خطة LLM مُحاكاة (فيها بيانات سيئة عمدًا) ───────────────────────────────────────────────────
const fakeLlm = async () => ({
  title: 'Apollo', mood: 'epic',
  beats: beats.map((b) => b.i === 0
    ? { i: 0, visual: 'text', kind: 'either', queries: [], template: { name: 'title_card', data: { title: 'The Race to the Moon' } }, chapter: 'Chapter 1' }
    : { i: b.i, visual: 'archive', kind: 'image', queries: ['Neil Armstrong 1969', 'Apollo 11'], grade: 'bw_archive', emphasis: ['Apollo'], template: { name: 'counter', data: { value: 777, label: 'invented' } } }),
});
const { title, mood, plans } = await planBeats({ beats, language: 'en', topic: 'Apollo' }, { llmJson: fakeLlm });
assert.equal(title, 'Apollo'); assert.equal(mood, 'epic');
assert.equal(plans[0].visual, 'text'); assert.equal(plans[0].template.name, 'title_card');
assert.equal(plans[1].overlays.length, 0, 'invented counter rejected');
console.log('planner ok');
// فشل الـLLM = خطة احتياطية بدل انهيار
const { plans: fb } = await planBeats({ beats, language: 'en' }, { llmJson: async () => { throw new Error('boom'); } });
assert.ok(fb.every(p => p.visual === 'stock' && p.queries.length));
console.log('planner fallback ok');
// إيقاع: مفيش نصّين ورا بعض
const pp = [{ visual: 'text', queries: [], template: { name: 'quote' }, overlays: [] }, { visual: 'text', queries: [], template: { name: 'quote' }, overlays: [] }];
enforcePacing(pp, [{ dur: 4, text: 'a b c d' }, { dur: 4, text: 'a b c d' }]);
assert.equal(pp[1].visual, 'stock');
console.log('pacing ok');

// ── 5) مصادر: شكل الردود (fixtures) + فلترة التراخيص ─────────────────────────────────────────────
assert.ok(classifyLicense('CC BY 4.0').attributionRequired && classifyLicense('Public domain').ok && classifyLicense('CC0').ok);
assert.ok(!classifyLicense('CC BY-SA 3.0').ok && !classifyLicense('CC BY-NC 2.0').ok && !classifyLicense('Fair use').ok && !classifyLicense('').ok);
const wm = await searchWikimedia('apollo 11', {}, { fetchJson: async () => ({ query: { pages: {
  1: { pageid: 1, title: 'File:Buzz_Aldrin.jpg', imageinfo: [{ url: 'https://u/1.jpg', thumburl: 'https://u/1_t.jpg', thumbwidth: 1920, thumbheight: 1500, mime: 'image/jpeg', descriptionurl: 'https://c/1', extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: '<a>NASA</a>' }, ImageDescription: { value: 'Buzz on the Moon' } } }] },
  2: { pageid: 2, title: 'File:Sa.jpg', imageinfo: [{ url: 'https://u/2.jpg', mime: 'image/jpeg', extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' } } }] },
  3: { pageid: 3, title: 'File:Doc.pdf', imageinfo: [{ url: 'https://u/3.pdf', mime: 'application/pdf', extmetadata: { LicenseShortName: { value: 'CC0' } } }] } } } }) });
assert.equal(wm.length, 1); assert.equal(wm[0].id, 'wikimedia:1'); assert.match(wm[0].credit, /NASA/);
const nasa = await searchNasa('apollo', {}, { fetchJson: async () => ({ collection: { items: [{ href: 'https://m/collection.json', data: [{ nasa_id: 'AS11', title: 'Apollo 11', media_type: 'video', description: 'Launch', center: 'JSC' }], links: [{ rel: 'preview', href: 'https://t.jpg' }] }] } }) });
assert.equal(nasa[0].kind, 'video');
const nasaMat = await materializeNasa(nasa[0], { fetchJson: async () => ['http://x/AS11~orig.mp4', 'http://x/AS11~medium.mp4', 'http://x/AS11.srt'] });
assert.equal(nasaMat.url, 'https://x/AS11~medium.mp4');
const ia = await searchInternetArchive('moon landing', {}, { fetchJson: async () => ({ response: { docs: [
  { identifier: 'pd1', title: 'Newsreel', collection: ['prelinger'], description: 'old' },
  { identifier: 'cc1', title: 'CC film', licenseurl: 'https://creativecommons.org/publicdomain/zero/1.0/', collection: ['x'] },
  { identifier: 'nope', title: 'Copyrighted', collection: ['x'] }] } }) });
assert.deepEqual(ia.map(x => x.identifier), ['pd1', 'cc1']);
const iaMat = await materializeArchive(ia[0], { fetchJson: async () => ({ files: [{ name: 'a.ogv' }, { name: 'a.mp4', format: 'h.264', size: '1000', length: '300' }] }) });
assert.match(iaMat.url, /download\/pd1\/a\.mp4/); assert.equal(iaMat.duration, 300);
process.env.PEXELS_API_KEY = 'k';
const px = await searchPexels('beach', {}, { fetchJson: async (u) => (u.includes('/videos/') ? { videos: [{ id: 5, url: 'https://pexels.com/video/waves-on-beach-5/', duration: 12, image: 't', user: { name: 'Sam' }, video_files: [{ file_type: 'video/mp4', link: 'https://v.mp4', width: 1920, height: 1080 }] }] } : { photos: [{ id: 6, url: 'https://pexels.com/photo/x-6/', alt: 'a beach', photographer: 'Ann', width: 4000, height: 3000, src: { large2x: 'https://p.jpg', medium: 'm' } }] }) });
assert.equal(px.length, 2); assert.equal(px[0].title, 'waves on beach');
console.log('sources ok');
assert.ok(scoreCandidate({ title: 'Neil Armstrong portrait', description: '', kind: 'image', id: 'a', width: 2000 }, 'Neil Armstrong said', ['Neil Armstrong 1969']) > scoreCandidate({ title: 'cat', description: '', kind: 'image', id: 'b' }, 'Neil Armstrong said', ['Neil Armstrong 1969']));

// ── 6) أصول مُحاكاة + timeline + رندر حقيقي ───────────────────────────────────────────────────────
const photo = path.join(D, 'photo.jpg');
await sharp({ create: { width: 2000, height: 1300, channels: 3, background: '#778' } }).jpeg().toFile(photo);
const { assets, allCredits } = await resolveAssets({ beats, plans, ratio: '16:9', assetsDir: path.join(D, 'assets') }, {
  skipLlmRank: true,
  searchCandidates: async (q) => [{ id: 'wikimedia:' + q, source: 'wikimedia', kind: 'image', title: q, description: '', url: 'u', license: { ok: true }, credit: 'Test credit' }],
  materialize: async (c) => c,
  fetchAsset: async () => ({ file: photo, kind: 'image', width: 2000, height: 1300 }),
});
assert.equal(assets[0], null, 'text beat has no asset'); assert.ok(assets.slice(1).every(a => a?.file));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=f=200:d=${Math.ceil(beats[beats.length - 1].end)}`, '-ar', '44100', '-ac', '2', path.join(D, 'narr.wav')]);
const tl = buildTimeline({ beats, plans, assets, tokens: aligned, narrationFile: path.join(D, 'narr.wav'), theme: 'cinematic', lang: 'en', captionsStyle: 'karaoke' });
assert.equal(tl.beats[0].overlays[0].template, 'title_card'); assert.equal(tl.beats[1].visual.kind, 'image');
const r = await renderDocumentary({ timeline: tl, workDir: path.join(D, 'work') });
assert.equal(r.failures.length, 0); assert.ok(Math.abs(r.duration - beats.reduce((a, b) => a + b.dur, 0)) < 0.5);
console.log(`render ok ${r.duration.toFixed(1)}s credits=${allCredits.length}`);
console.log('ALL PIPELINE CHECKS PASSED');

// ── 7) photo_board: الـresolver بيجيب صور لكل بطاقة، والـtimeline بيعمل overlay، وفيه بدائل لو الصور ناقصة ──
{
  const bt = [{ i: 0, text: 'Lieutenant Commander John Kerans took command of HMS Amethyst in 1949.', dur: 4.5, start: 0, end: 4.5, tokens: [] }];
  const pl = [{ visual: 'text', queries: [], overlays: [], template: { name: 'photo_board', data: { title: 'New commander', photos: [{ query: 'John Kerans 1949', caption: 'Kerans' }, { query: 'HMS Amethyst', caption: 'Amethyst' }, { query: 'nothing here', caption: 'x' }] } }, emphasis: [], transition: 'cut' }];
  const res = await resolveAssets({ beats: bt, plans: pl, ratio: '16:9', assetsDir: path.join(D, 'assets_pb') }, {
    skipLlmRank: true,
    searchCandidates: async (q) => (q === 'nothing here' ? [] : [{ id: 'wikimedia:' + q, source: 'wikimedia', kind: 'image', title: q, description: '', url: 'u', license: { ok: true, attributionRequired: true }, credit: 'Credit ' + q }]),
    materialize: async (c) => c,
    fetchAsset: async () => ({ file: photo, kind: 'image', width: 2000, height: 1300 }),
  });
  assert.equal(res.boards[0].length, 2, 'two photos found, one missing');
  assert.ok(res.credits.includes('Credit John Kerans 1949'));
  const t2 = buildTimeline({ beats: bt, plans: pl, assets: [null], boards: res.boards, tokens: [], narrationFile: path.join(D, 'narr.wav') });
  assert.equal(t2.beats[0].overlays[0].template, 'photo_board'); assert.equal(t2.beats[0].overlays[0].data.photos.length, 2);
  const t3 = buildTimeline({ beats: bt, plans: pl, assets: [null], boards: { 0: [res.boards[0][0]] }, tokens: [], narrationFile: path.join(D, 'narr.wav') });
  assert.equal(t3.beats[0].visual.kind, 'image');
  const t4 = buildTimeline({ beats: bt, plans: pl, assets: [null], boards: { 0: [] }, tokens: [], narrationFile: path.join(D, 'narr.wav') });
  assert.equal(t4.beats[0].visual.kind, 'background');
  assert.equal(sanitizeTemplate('photo_board', { photos: [{ query: 'a' }] }, 'x'), null);
  console.log('photo_board ok');
}
console.log('ALL BOARD CHECKS PASSED');
