// ── documentaryRoutes.js ── /api/documentary: خيارات، تقدير، كتابة سكريبت بالـAI، إنشاء/متابعة/قائمة الوظائف
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authMiddleware } from '../authRoutes.js';
import { getCreditsBalance } from '../authService.js';
import { DOCUMENTARY_USD_PER_MINUTE, getDocumentaryCreditCost } from '../creditPricingEngine.js';
import { checkContentSafety } from '../scriptService.js';
import { GEMINI_VOICE_NAMES } from '../videoAudioService.js';
import { sourceAvailability } from './sources/index.js';
import { writeScript, MAX_SCRIPT_CHARS } from './scriptWriter.js';
import { THEMES } from './themes.js';
import { probeDuration, hasAudio, rmQuiet } from './ff.js';
import * as svc from './documentaryService.js';
import { cleanScript, basicClean } from './scriptCleaner.js';
import * as store from './store.js';
import { adminAuth } from '../adminAuthMiddleware.js';
import { buildPackage, composeThumbnail } from './uploadPackage.js';

const router = express.Router();
const TEMP_ROOT = process.platform === 'win32' ? 'temp' : '/tmp/aivideo';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 90 * 1024 * 1024 } });

function musicTracks() {
  try {
    const dir = path.join(process.cwd(), 'assets', 'music');
    return fs.readdirSync(dir).filter(f => /\.mp3$/i.test(f) && !/^(intro|outro|whoosh)/i.test(f)).map(f => {
      const base = f.replace(/\.mp3$/i, '');
      const [title, artist] = base.split(' - ');
      return { id: f, title: title || base, artist: artist || '' };
    });
  } catch { return []; }
}

const VOICES = [
  { key: 'male_wise', label: 'Charon — deep male', lang: 'any' },
  { key: 'male_american', label: 'Puck — upbeat male', lang: 'any' },
  { key: 'female_american', label: 'Kore — firm female', lang: 'any' },
  ...[...GEMINI_VOICE_NAMES].filter(n => !['Charon', 'Puck', 'Kore'].includes(n)).map(n => ({ key: n, label: n, lang: 'any' })),
];

router.get('/options', authMiddleware, async (req, res) => {
  try {
    const balance = await getCreditsBalance(req.user.userId).catch(() => null);
    res.json({
      languages: svc.LANGUAGES,
      themes: Object.entries(THEMES).map(([key, t]) => ({ key, label: t.label, top: t.bgTop, bottom: t.bgBottom })),
      captionStyles: svc.CAPTION_STYLES, moods: svc.MOODS, music: musicTracks(), voices: VOICES,
      limits: { maxMinutes: svc.MAX_MINUTES, maxScriptChars: MAX_SCRIPT_CHARS, minScriptChars: svc.MIN_SCRIPT_CHARS, maxVoiceoverMb: 90 },
      pricing: { perMinute: getDocumentaryCreditCost(1), perMinuteWithOwnVoiceover: getDocumentaryCreditCost(1, { userVoiceover: true }), usd: DOCUMENTARY_USD_PER_MINUTE },
      sources: sourceAvailability(), balance,
      freeTrial: { available: await store.trialAvailable(req.user.userId).catch(() => false), maxSeconds: svc.TRIAL_MAX_SECONDS },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/estimate', authMiddleware, express.json({ limit: '1mb' }), async (req, res) => {
  const { script, minutes, audioDurationSec, language } = req.body || {};
  const q = svc.quote({ script: typeof script === 'string' ? basicClean(script) : '', minutes, audioDurationSec: Number(audioDurationSec) || 0, language });
  const balance = await getCreditsBalance(req.user.userId).catch(() => null);
  const trial = q.userVoiceover && Number(audioDurationSec) <= svc.TRIAL_MAX_SECONDS && await store.trialAvailable(req.user.userId).catch(() => false);
  const cost = trial ? 0 : q.cost;
  res.json({ ...q, cost, trial: !!trial, balance, enough: balance == null ? null : balance >= cost });
});

// "اعمله بالذكاء الاصطناعي": موضوع → سكريبت (مجاني، لكن محدود المعدل)
const scriptCalls = new Map();
router.post('/script', authMiddleware, express.json({ limit: '100kb' }), async (req, res) => {
  const uid = req.user.userId;
  const now = Date.now();
  const recent = (scriptCalls.get(uid) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 6) return res.status(429).json({ error: 'rate_limited', message: 'You can generate up to 6 scripts per hour.' });
  const topic = String(req.body?.topic || '').trim().slice(0, 300);
  if (topic.length < 3) return res.status(400).json({ error: 'topic_required', message: 'Please enter a topic.' });
  const safety = await checkContentSafety(topic);
  if (safety.unsafe) return res.status(400).json({ error: 'content_policy_violation', message: 'This topic cannot be used.' });
  scriptCalls.set(uid, [...recent, now]);
  try {
    const out = await writeScript({ topic, minutes: Math.min(svc.MAX_MINUTES, Math.max(1, Number(req.body?.minutes) || 5)), language: svc.LANGUAGES[req.body?.language] ? req.body.language : 'en' });
    res.json(out);
  } catch (e) {
    console.error('[Documentary] script generation failed:', e.message);
    res.status(502).json({ error: 'script_failed', message: 'Could not write the script right now. Please try again.' });
  }
});

const cleanCalls = new Map();
router.post('/clean-script', authMiddleware, express.json({ limit: '1mb' }), async (req, res) => {
  const uid = req.user.userId;
  const now = Date.now();
  const recent = (cleanCalls.get(uid) || []).filter(t => now - t < 3600e3);
  if (recent.length >= 20) return res.status(429).json({ error: 'rate_limited', message: 'Too many cleanups this hour.' });
  const script = String(req.body?.script || '').slice(0, MAX_SCRIPT_CHARS * 2);
  if (script.trim().length < 20) return res.status(400).json({ error: 'script_too_short', message: 'Paste a script first.' });
  cleanCalls.set(uid, [...recent, now]);
  try {
    const out = await cleanScript(script, { force: !!req.body?.force });
    res.json(out);
  } catch (e) {
    console.error('[Documentary] clean-script failed:', e.message);
    res.status(502).json({ error: 'clean_failed', message: 'Could not clean the script right now.' });
  }
});

// إنشاء وظيفة — JSON (سكريبت/موضوع) أو multipart (فويس أوفر مرفوع في حقل audio + باقي الحقول نصية)
router.post('/jobs', authMiddleware, (req, res, next) => (req.is('multipart/form-data') ? upload.single('audio')(req, res, next) : express.json({ limit: '1mb' })(req, res, next)), async (req, res) => {
  const userId = req.user.userId;
  let body = req.body || {};
  let tmpDir = null;
  try {
    if (req.file) {
      body = { ...body, mode: 'voiceover' };
      tmpDir = path.join(TEMP_ROOT, `docup_${userId}_${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      const ext = (path.extname(req.file.originalname || '').replace(/[^.\w]/g, '') || '.mp3').slice(0, 6);
      const file = path.join(tmpDir, `voiceover${ext}`);
      fs.writeFileSync(file, req.file.buffer);
      if (!(await hasAudio(file))) { rmQuiet(tmpDir); return res.status(400).json({ error: 'bad_audio', message: 'This file has no audio.' }); }
      const dur = await probeDuration(file);
      if (!dur || dur < 20) { rmQuiet(tmpDir); return res.status(400).json({ error: 'bad_audio', message: 'The voiceover is too short.' }); }
      if (dur > svc.MAX_MINUTES * 60 + 5) { rmQuiet(tmpDir); return res.status(400).json({ error: 'too_long', message: `The maximum length is ${svc.MAX_MINUTES} minutes.` }); }
      body.audioFile = file; body.audioDurationSec = dur;
      for (const k of ['motionGraphics', 'music']) if (typeof body[k] === 'string') body[k] = body[k] !== 'false';
    }
    const r = await svc.startJob(userId, body);
    if (!r.ok) { if (tmpDir) rmQuiet(tmpDir); return res.status(r.status).json({ error: r.error, message: r.message, cost: r.cost, remaining: r.remaining }); }
    res.status(202).json({ jobId: r.job.id, status: 'queued', cost: r.cost, trial: !!r.trial, minutes: r.minutes, remaining: r.remaining, queuePosition: svc.queuePosition(r.job.id) });
  } catch (e) {
    if (tmpDir) rmQuiet(tmpDir);
    console.error('[Documentary] create failed:', e.message);
    res.status(500).json({ error: 'failed', message: 'Could not start the job.' });
  }
});

const publicJob = (j) => ({
  id: j.id, status: j.status, stage: j.stage, progress: j.progress, title: j.title, videoUrl: j.result_url, thumbnailUrl: j.thumbnail_url,
  durationSec: j.duration_sec, creditsCharged: j.credits_charged, creditsRefunded: j.credits_refunded, error: j.error, createdAt: j.created_at,
  queuePosition: j.status === 'queued' ? svc.queuePosition(j.id) : 0,
});

router.get('/jobs', authMiddleware, async (req, res) => {
  try { res.json({ jobs: (await store.listJobs(req.user.userId)).map(publicJob) }); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/jobs/:id', authMiddleware, async (req, res) => {
  try {
    const j = await store.getJob(parseInt(req.params.id, 10), req.user.userId);
    if (!j) return res.status(404).json({ error: 'not_found' });
    res.setHeader('Cache-Control', 'no-store');
    const out = publicJob(j);
    if (j.status === 'done') { out.script = j.script; out.credits = j.credits_list || []; out.package = j.meta?.package || null; out.hasSrt = !!j.meta?.srt; }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── حزمة النشر (عنوان/وصف بالمصادر والفصول/كلمات/صورة مصغرة) + ملف الترجمة ──
const packageCalls = new Map();
router.post('/jobs/:id/package', authMiddleware, express.json({ limit: '10kb' }), async (req, res) => {
  try {
    const j = await store.getJob(parseInt(req.params.id, 10), req.user.userId);
    if (!j || j.status !== 'done') return res.status(404).json({ error: 'not_found' });
    const meta = j.meta || {};
    if (meta.package && !req.body?.refresh) return res.json(meta.package);
    const uid = req.user.userId, now = Date.now();
    const recent = (packageCalls.get(uid) || []).filter(t => now - t < 3600e3);
    if (recent.length >= 15) return res.status(429).json({ error: 'rate_limited', message: 'Too many requests this hour.' });
    packageCalls.set(uid, [...recent, now]);
    const pkg = await buildPackage({ title: j.title, script: j.script, language: meta.language || 'en', chapters: meta.chapters, credits: j.credits_list, duration: j.duration_sec });
    let thumbnailUrl = j.thumbnail_url || null;
    if (j.thumbnail_url) {
      try {
        const buf = await composeThumbnail(j.thumbnail_url, pkg.thumbnailText, { lang: meta.language || 'en' });
        const tmp = path.join(TEMP_ROOT, `thumb_${j.id}_${Date.now()}.jpg`);
        fs.mkdirSync(TEMP_ROOT, { recursive: true });
        fs.writeFileSync(tmp, buf);
        thumbnailUrl = await store.uploadFile(tmp, `documentaries/${uid}/${j.id}_thumb.jpg`, 'image/jpeg');
        fs.rmSync(tmp, { force: true });
      } catch (e) { console.warn('[Documentary] thumbnail compose failed:', e.message); }
    }
    const out = { title: pkg.title, description: pkg.description, tags: pkg.tags, thumbnailUrl, chapters: pkg.chapters, hasSrt: !!meta.srt };
    await store.mergeMeta(j.id, { package: out });
    res.json(out);
  } catch (e) {
    console.error('[Documentary] package failed:', e.message);
    res.status(500).json({ error: 'package_failed', message: 'Could not build the upload package right now.' });
  }
});

router.get('/jobs/:id/srt', authMiddleware, async (req, res) => {
  try {
    const j = await store.getJob(parseInt(req.params.id, 10), req.user.userId);
    if (!j || j.status !== 'done' || !j.meta?.srt) return res.status(404).json({ error: 'not_found' });
    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="documentary_${j.id}.srt"`);
    res.send('\uFEFF' + j.meta.srt);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/admin/stats', adminAuth, async (req, res) => {
  try { res.json(await store.adminStats({ days: req.query.days })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
