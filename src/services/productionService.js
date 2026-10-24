// ── productionService.js ── "مخرج" فيديو كامل من الأول للآخر (بيستخدمه Claude Opus 5.5 / Fable 5 في الايجنت):
// خطة (شخصيات + مشاهد بنصها وصورتها) → صورة مرجعية لكل شخصية → صورة لكل مشهد بنفس الشخصيات (ثبات) →
// صوت لكل مشهد → تحريك المشهد بموديل فيديو رخيص (أو صورة بحركة كاميرا في وضع "stills") → مونتاج + موسيقى → رابط نهائي.
// كل خطوة بتتحفظ في قاعدة البيانات، فلو السيرفر اتعمله restart الشغل بيكمل من مكانه. الكريديت بيتخصم مقدّمًا
// على التقدير، والفرق بيرجع للعميل في الآخر (أو كل اللي ماتنفذش لو فشل).
import fs from 'fs';
import os from 'os';
import path from 'path';
import pkg from 'pg';
import { generateNewModelImages, NEW_IMAGE_MODELS } from './newImageModelsService.js';
import { generateNewModelVideo, NEW_VIDEO_MODELS } from './newVideoModelsService.js';
import { getImageCreditCost, getPerSecondCreditCost } from './creditPricingEngine.js';
import { synthesizeNarration, getBackgroundMusicBuffer } from './videoAudioService.js';
import { uploadBufferToR2 } from './audioVideoService.js';
import { ffmpeg, probeDuration, rmQuiet } from './documentary/ff.js';
import { chargeCredits, addCreditsBalance } from './authService.js';
import { checkContentSafety } from './scriptService.js';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false, max: 3 });

export const PRODUCTION_LIMITS = { maxScenes: 240, maxCharacters: 8, maxTextChars: 40000, maxMinutes: 40 };
const IMAGE_MODELS = ['seedream_4', 'nano_banana_2_lite', 'seedream_5_lite', 'nano_banana_2'];
const VIDEO_MODELS = ['prunaai_p_video_2_pro', 'wan_3', 'seedance_1_pro_fast'];
const DEFAULTS = { imageModel: 'seedream_4', videoModel: 'prunaai_p_video_2_pro', tier: '480p' };
const MUSIC = ['epic', 'documentary', 'tension', 'emotional', 'chill', 'upbeat', 'general'];
const RENDER_FEE_PER_MIN = 2; // ffmpeg + تخزين
const WORDS_PER_SEC = { ar: 2.2, en: 2.6 };

const ready = (async () => {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS production_jobs (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, status TEXT DEFAULT 'queued', stage TEXT DEFAULT 'queued', progress INTEGER DEFAULT 0,
    title TEXT, plan JSONB NOT NULL, state JSONB DEFAULT '{}'::jsonb, quote INTEGER DEFAULT 0, charged INTEGER DEFAULT 0, spent INTEGER DEFAULT 0,
    video_url TEXT, thumb_url TEXT, error TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
})().catch(e => console.warn('[Production] table init failed:', e.message));

const clip = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);

/** بينضّف الخطة اللي الموديل كتبها ويرجّعها بشكل ثابت، أو بيرمي خطأ مفهوم */
export function sanitizePlan(raw) {
  const p = raw && typeof raw === 'object' ? raw : {};
  const characters = (Array.isArray(p.characters) ? p.characters : []).slice(0, PRODUCTION_LIMITS.maxCharacters)
    .map(c => ({ name: clip(c?.name, 40), look: clip(c?.look || c?.description, 600), voice: clip(c?.voice, 30) || null }))
    .filter(c => c.name && c.look);
  const names = new Set(characters.map(c => c.name.toLowerCase()));
  const scenes = (Array.isArray(p.scenes) ? p.scenes : []).slice(0, PRODUCTION_LIMITS.maxScenes).map(s => ({
    text: clip(s?.text || s?.narration || s?.dialogue, 1200),
    visual: clip(s?.visual || s?.image || s?.prompt, 900),
    motion: clip(s?.motion, 300) || null,
    characters: (Array.isArray(s?.characters) ? s.characters : []).map(n => clip(n, 40)).filter(n => names.has(n.toLowerCase())).slice(0, 4),
    voice: clip(s?.voice, 30) || null,
    animate: s?.animate === false ? false : true,
  })).filter(s => s.text && s.visual);
  if (!scenes.length) throw new Error('plan_has_no_scenes');
  const textChars = scenes.reduce((a, s) => a + s.text.length, 0);
  if (textChars > PRODUCTION_LIMITS.maxTextChars) throw new Error('plan_too_long');
  const mode = p.mode === 'stills' ? 'stills' : 'motion';
  return {
    title: clip(p.title, 120) || 'Erivion film',
    aspectRatio: p.aspectRatio === '9:16' ? '9:16' : '16:9',
    style: clip(p.style, 400) || 'cinematic, high detail',
    mode,
    language: /^[a-z]{2}$/.test(String(p.language || '')) ? p.language : 'ar',
    voiceKey: clip(p.voiceKey, 30) || 'male_wise',
    music: MUSIC.includes(p.music) ? p.music : (p.music ? 'general' : null),
    imageModel: IMAGE_MODELS.includes(p.imageModel) && NEW_IMAGE_MODELS[p.imageModel] ? p.imageModel : DEFAULTS.imageModel,
    videoModel: VIDEO_MODELS.includes(p.videoModel) && NEW_VIDEO_MODELS[p.videoModel] ? p.videoModel : DEFAULTS.videoModel,
    tier: p.tier === '720p' ? '720p' : DEFAULTS.tier,
    characters, scenes,
  };
}

const sceneSeconds = (plan, s) => Math.max(2.5, s.text.split(/\s+/).filter(Boolean).length / (WORDS_PER_SEC[plan.language] || 2.4) + 0.6);

/** تقدير التكلفة قبل البدء (بيتعرض على العميل ويتخصم مقدّمًا) */
export function estimateProduction(plan) {
  const img = getImageCreditCost(plan.imageModel, 1);
  let seconds = 0, videoSec = 0;
  for (const s of plan.scenes) { const d = sceneSeconds(plan, s); seconds += d; if (plan.mode === 'motion' && s.animate) videoSec += Math.ceil(d); }
  const images = (plan.characters.length + plan.scenes.length) * img;
  const video = videoSec ? getPerSecondCreditCost(plan.videoModel, videoSec, plan.tier) : 0;
  const voice = getPerSecondCreditCost('gemini_flash_tts', Math.ceil(seconds));
  const render = Math.ceil(seconds / 60) * RENDER_FEE_PER_MIN;
  const total = Math.ceil((images + video + voice + render) * 1.05); // هامش 5% لأن مدة الصوت الحقيقية بتختلف شوية
  return { seconds: Math.round(seconds), minutes: +(seconds / 60).toFixed(1), images, video, voice, render, total, scenes: plan.scenes.length, characters: plan.characters.length, mode: plan.mode };
}

async function save(id, patch) {
  const cols = Object.keys(patch); if (!cols.length) return;
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  await pool.query(`UPDATE production_jobs SET ${sets}, updated_at = NOW() WHERE id = $1`, [id, ...cols.map(c => (c === 'state' || c === 'plan') ? JSON.stringify(patch[c]) : patch[c])]);
}

export async function startProduction(userId, rawPlan) {
  await ready;
  const plan = sanitizePlan(rawPlan);
  const safety = await checkContentSafety([plan.title, plan.style, ...plan.characters.map(c => c.look), ...plan.scenes.map(s => `${s.text} ${s.visual}`)].join('\n').slice(0, 30000)).catch(() => ({ unsafe: false }));
  if (safety.unsafe) throw new Error('content_policy_violation');
  const est = estimateProduction(plan);
  if (est.minutes > PRODUCTION_LIMITS.maxMinutes) throw new Error('plan_too_long');
  const charge = await chargeCredits(userId, est.total);
  if (!charge?.success) { const e = new Error('quota_exceeded'); e.cost = est.total; e.remaining = charge?.remaining; throw e; }
  const { rows: [job] } = await pool.query(`INSERT INTO production_jobs (user_id, title, plan, quote, charged, status, stage) VALUES ($1, $2, $3, $4, $4, 'running', 'characters') RETURNING id`, [userId, plan.title, JSON.stringify(plan), est.total]);
  runProduction(job.id).catch(e => console.warn('[Production] run crashed:', e.message));
  return { jobId: job.id, estimate: est, remaining: charge.remaining };
}

export async function getProductionJob(id, userId) {
  await ready;
  const { rows: [j] } = await pool.query(`SELECT id, user_id, status, stage, progress, title, quote, charged, spent, video_url, thumb_url, error, plan->>'aspectRatio' AS aspect, created_at FROM production_jobs WHERE id = $1`, [Number(id)]);
  if (!j || (userId && j.user_id !== userId)) return null;
  return { id: j.id, status: j.status, stage: j.stage, progress: j.progress, title: j.title, quote: j.quote, charged: j.charged, spent: j.spent, videoUrl: j.video_url, thumbnailUrl: j.thumb_url, error: j.error, aspectRatio: j.aspect, createdAt: j.created_at };
}

// تشغيل بحد أقصى N في نفس الوقت
async function pool3(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }
async function download(url, file) { const r = await fetch(url); if (!r.ok) throw new Error(`download ${r.status}`); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file; }
const firstUrl = (out) => (Array.isArray(out) ? (typeof out[0] === 'string' ? out[0] : out[0]?.url) : (typeof out === 'string' ? out : out?.url)) || null;
const DIM = { '16:9': [1280, 720], '9:16': [720, 1280] };

async function uploadFileToR2(file, key, contentType) {
  // ملف كبير (فيلم طويل): رفع stream بدل ما نحمّله كله في الذاكرة
  if (fs.statSync(file).size < 60 * 1048576) return uploadBufferToR2(fs.readFileSync(file), key, contentType);
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: 'auto', endpoint: process.env.S3_ENDPOINT_URL, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET || 'erivion-videos', Key: key, Body: fs.createReadStream(file), ContentLength: fs.statSync(file).size, ContentType: contentType }));
  return `${(process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')}/${key}`;
}

export async function runProduction(id) {
  await ready;
  const { rows: [job] } = await pool.query(`SELECT * FROM production_jobs WHERE id = $1`, [id]);
  if (!job || ['done', 'failed'].includes(job.status)) return;
  const plan = job.plan; const st = job.state || {}; st.chars = st.chars || {}; st.scenes = st.scenes || plan.scenes.map(() => ({}));
  let spent = job.spent || 0;
  const persist = async (stage, progress) => save(id, { state: st, spent, stage, progress: Math.min(99, Math.round(progress)) });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `prod_${id}_`));
  const imgCost = getImageCreditCost(plan.imageModel, 1);
  const refsOk = !NEW_IMAGE_MODELS[plan.imageModel]?.noReferenceImages;
  const N = plan.scenes.length;
  try {
    // 1) صورة مرجعية لكل شخصية
    for (const c of plan.characters) {
      if (st.chars[c.name]) continue;
      const out = await generateNewModelImages({ modelKey: plan.imageModel, prompt: `${plan.style}. Character design reference of ${c.name}: ${c.look}. Full body, front view, clean plain background, consistent model sheet`, aspectRatio: '1:1', count: 1 });
      st.chars[c.name] = firstUrl(out); spent += imgCost;
      await persist('characters', 5);
    }
    // 2) صورة لكل مشهد بنفس الشخصيات
    let done = st.scenes.filter(s => s.img).length;
    await pool3(plan.scenes, 3, async (s, i) => {
      if (st.scenes[i].img) return;
      const refs = refsOk ? s.characters.map(n => st.chars[plan.characters.find(c => c.name.toLowerCase() === n.toLowerCase())?.name]).filter(Boolean) : [];
      const who = s.characters.map(n => { const c = plan.characters.find(x => x.name.toLowerCase() === n.toLowerCase()); return c ? `${c.name} (${c.look.slice(0, 160)})` : ''; }).filter(Boolean).join('; ');
      const out = await generateNewModelImages({ modelKey: plan.imageModel, prompt: `${plan.style}. ${s.visual}${who ? `. Characters: ${who}. Keep each character exactly as in the reference images` : ''}`, referenceImageUrls: refs, aspectRatio: plan.aspectRatio, count: 1 });
      st.scenes[i].img = firstUrl(out); spent += imgCost; done++;
      await persist('scenes', 5 + 25 * done / N);
    });
    // 3) صوت كل مشهد
    done = st.scenes.filter(s => s.audio).length;
    for (let i = 0; i < N; i++) {
      if (st.scenes[i].audio) continue;
      const s = plan.scenes[i];
      const charVoice = s.characters.length === 1 ? plan.characters.find(c => c.name.toLowerCase() === s.characters[0].toLowerCase())?.voice : null;
      const n = await synthesizeNarration(s.text, { voiceKey: s.voice || charVoice || plan.voiceKey, languageCode: plan.language });
      const url = await uploadBufferToR2(fs.readFileSync(n.audioPath), `production/${id}/a${i}_${Date.now()}.mp3`, 'audio/mpeg');
      st.scenes[i].audio = url; st.scenes[i].dur = n.durationSec; rmQuiet(n.workDir);
      spent += getPerSecondCreditCost('gemini_flash_tts', Math.ceil(n.durationSec)); done++;
      await persist('voice', 30 + 15 * done / N);
    }
    // 4) تحريك المشاهد (وضع motion)
    const vm = NEW_VIDEO_MODELS[plan.videoModel]; const maxC = vm?.maxDurationSec || 10, minC = vm?.minDurationSec || 5;
    const toAnimate = plan.mode === 'motion' ? plan.scenes.map((s, i) => i).filter(i => plan.scenes[i].animate) : [];
    done = toAnimate.filter(i => st.scenes[i].clips?.length).length;
    await pool3(toAnimate, 3, async (i) => {
      if (st.scenes[i].clips?.length) return;
      const s = plan.scenes[i]; const need = (st.scenes[i].dur || sceneSeconds(plan, s)) + 0.3;
      const parts = Math.max(1, Math.ceil(need / maxC)); const each = Math.min(maxC, Math.max(minC, Math.ceil(need / parts)));
      const clips = [];
      for (let k = 0; k < parts; k++) {
        const url = await generateNewModelVideo({ modelKey: plan.videoModel, prompt: `${plan.style}. ${s.visual}. ${s.motion || (k ? 'the camera slowly moves to a new angle, natural motion' : 'subtle natural motion, cinematic camera move')}`, imageUrl: st.scenes[i].img, aspectRatio: plan.aspectRatio, durationSec: each, tier: plan.tier });
        clips.push(url); spent += getPerSecondCreditCost(plan.videoModel, each, plan.tier);
      }
      st.scenes[i].clips = clips; done++;
      await persist('animate', 45 + 35 * done / Math.max(1, toAnimate.length));
    });
    // 5) مونتاج: كل مشهد (فيديو أو صورة بحركة كاميرا) على قد صوته، وبعدين لزق الكل + موسيقى
    const [W, H] = DIM[plan.aspectRatio];
    const sceneFiles = [];
    for (let i = 0; i < N; i++) {
      const sc = st.scenes[i]; const dir = path.join(work, `s${i}`); fs.mkdirSync(dir, { recursive: true });
      const aud = await download(sc.audio, path.join(dir, 'a.mp3'));
      const D = Math.max(1.5, (sc.dur || await probeDuration(aud)) + 0.35);
      const out = path.join(work, `scene_${String(i).padStart(4, '0')}.mp4`);
      const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,format=yuv420p`;
      if (sc.clips?.length) {
        const ins = []; sc.clips.forEach((u, k) => ins.push('-i', u));
        const chain = sc.clips.map((_, k) => `[${k}:v]${norm}[v${k}]`).join(';') + `;${sc.clips.map((_, k) => `[v${k}]`).join('')}concat=n=${sc.clips.length}:v=1:a=0,tpad=stop_mode=clone:stop_duration=${Math.ceil(D)},trim=duration=${D.toFixed(2)},setpts=PTS-STARTPTS[v]`;
        await ffmpeg([...ins, '-i', aud, '-filter_complex', chain, '-map', '[v]', '-map', `${sc.clips.length}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-t', D.toFixed(2), out]);
      } else {
        // صورة ثابتة بحركة كاميرا (Ken Burns) — بدل موديل الفيديو في وضع stills
        const img = await download(sc.img, path.join(dir, 'i.jpg'));
        const frames = Math.ceil(D * 30); const zin = i % 2 === 0;
        const z = zin ? `min(1+0.10*on/${frames},1.10)` : `max(1.10-0.10*on/${frames},1.0)`;
        await ffmpeg(['-loop', '1', '-i', img, '-i', aud, '-filter_complex', `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=30,format=yuv420p[v]`, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-t', D.toFixed(2), out]);
      }
      sceneFiles.push(out); rmQuiet(dir);
      await persist('montage', 80 + 15 * (i + 1) / N);
    }
    const list = path.join(work, 'list.txt'); fs.writeFileSync(list, sceneFiles.map(f => `file '${f}'`).join('\n'));
    const joined = path.join(work, 'joined.mp4');
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined], { timeoutMs: 60 * 60 * 1000 });
    let final = joined;
    if (plan.music) {
      const buf = await getBackgroundMusicBuffer('youtube', plan.music).catch(() => getBackgroundMusicBuffer('general').catch(() => null));
      if (buf) {
        const mf = path.join(work, 'music.mp3'); fs.writeFileSync(mf, buf); final = path.join(work, 'final.mp4');
        await ffmpeg(['-i', joined, '-stream_loop', '-1', '-i', mf, '-filter_complex', '[1:a]volume=0.12[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final], { timeoutMs: 60 * 60 * 1000 });
      }
    }
    await persist('upload', 97);
    const videoUrl = await uploadFileToR2(final, `production/${id}/${Date.now()}.mp4`, 'video/mp4');
    spent += Math.ceil((st.scenes.reduce((a, s) => a + (s.dur || 0), 0)) / 60) * RENDER_FEE_PER_MIN;
    const refund = Math.max(0, job.charged - spent);
    if (refund > 0) await addCreditsBalance(job.user_id, refund).catch(() => {});
    await save(id, { status: 'done', stage: 'done', progress: 100, video_url: videoUrl, thumb_url: st.scenes[0]?.img || null, spent: Math.min(spent, job.charged), state: st });
    console.log(`[Production] #${id} done: ${N} scenes, spent ${spent}/${job.charged} credits, refunded ${refund}`);
  } catch (e) {
    console.warn(`[Production] #${id} failed:`, e.message);
    const refund = Math.max(0, job.charged - spent);
    if (refund > 0) await addCreditsBalance(job.user_id, refund).catch(() => {});
    await save(id, { status: 'failed', error: String(e.message).slice(0, 300), spent, state: st }).catch(() => {});
  } finally { rmQuiet(work); }
}

/** بعد restart: كمّل أي فيلم كان شغال */
export async function resumeProductions() {
  if (!process.env.DATABASE_URL) return;
  await ready;
  const { rows } = await pool.query(`SELECT id FROM production_jobs WHERE status = 'running' ORDER BY id`).catch(() => ({ rows: [] }));
  for (const r of rows) runProduction(r.id).catch(e => console.warn('[Production] resume failed:', e.message));
  if (rows.length) console.log(`[Production] resumed ${rows.length} job(s)`);
}
