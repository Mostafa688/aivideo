// ── followupEmail.js ── إيميل متابعة لمرة واحدة للمسجّل المجاني اللي كلّم الايجنت ومشترك ش:
// بيتبعت بعد ما يسكت/يخرج بـ 40 دقيقة، فيه فكرته، وفيديوهات حقيقية اتعملت على Erivion، وأزرار "ليه ما كملتش؟"
// اللي بتتسجل (agent_followups.reason) عشان نعرف السبب الحقيقي.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import pkg from 'pg';
import { SHOWCASE_VIDEOS } from './showcaseVideos.js';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false, max: 2 });
const SITE = (process.env.PUBLIC_SITE_URL || 'https://erivion.net').replace(/\/$/, '');
const IDLE_MIN = Number(process.env.FOLLOWUP_IDLE_MINUTES || 40);
export const FOLLOWUP_REASONS = ['price', 'confused', 'not_found', 'later'];

const ready = (async () => {
  if (!process.env.DATABASE_URL) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS agent_followups (
    user_id INTEGER PRIMARY KEY,
    email TEXT,
    status TEXT DEFAULT 'sending',
    topic TEXT,
    reason TEXT,
    reason_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
})().catch(e => console.warn('[Followup] table init failed:', e.message));

const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const followupToken = (userId) => crypto.createHmac('sha256', String(process.env.JWT_SECRET || 'erivion')).update(`followup:${userId}`).digest('hex').slice(0, 24);
// صورة مصغرة لكل فيديو من الأمثلة (بتتعمل مرة واحدة بـ ffmpeg من رابط الفيديو وتتخدم من /outputs/email)
const POSTER_DIR = path.join(process.cwd(), 'outputs', 'email');
const posterFile = (id) => path.join(POSTER_DIR, `${id}.jpg`);
function makePoster(v) {
  return new Promise((resolve) => {
    try { fs.mkdirSync(POSTER_DIR, { recursive: true }); } catch { /* ignore */ }
    const p = spawn('ffmpeg', ['-v', 'error', '-y', '-ss', '2.5', '-i', v.url, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '4', posterFile(v.id)], { stdio: 'ignore' });
    const t = setTimeout(() => p.kill('SIGKILL'), 45000);
    p.on('close', (code) => { clearTimeout(t); resolve(code === 0 && fs.existsSync(posterFile(v.id))); });
    p.on('error', () => { clearTimeout(t); resolve(false); });
  });
}
async function ensurePosters() { for (const v of SHOWCASE_VIDEOS) if (!fs.existsSync(posterFile(v.id))) await makePoster(v); }
const hasPoster = (id) => { try { return fs.statSync(posterFile(id)).size > 1000; } catch { return false; } };
const hasArabic = (s) => /[؀-ۿ]/.test(String(s || ''));

// نوع الفيديو اللي كان عايزه (عشان نختار أمثلة قريبة من طلبه)
function topicOf(text) {
  const t = String(text || '').toLowerCase();
  if (/(اعلان|إعلان|منتج|ugc|\bads?\b|product|commercial)/.test(t)) return 'ad';
  if (/(سينما|سينمائي|اكشن|أكشن|cinematic|action|film|movie)/.test(t)) return 'cinematic';
  if (/(كوميدي|مضحك|comedy|funny)/.test(t)) return 'comedy';
  if (/(وثائقي|وثايقي|documentar)/.test(t)) return 'documentary';
  if (/(انيميشن|أنيميشن|موشن|كرتون|كارتون|animation|motion|cartoon|explainer|شرح)/.test(t)) return 'animation';
  return 'all';
}

export function buildFollowupEmail({ userId, name, messages }) {
  const all = messages.join(' ');
  const ar = hasArabic(all) || !all.trim();
  const topic = topicOf(all);
  const first = String(messages.find((m) => String(m || '').trim().length > 6) || '').replace(/\s+/g, ' ').trim();
  const idea = first.length > 140 ? first.slice(0, 137) + '…' : first;
  const fname = String(name || '').trim().split(/\s+/)[0] || (ar ? 'يا صديقي' : 'there');
  const order = ['ad', 'cinematic', 'comedy'];
  const vids = [...SHOWCASE_VIDEOS].sort((a, b) => (a.kind === topic ? -1 : 0) - (b.kind === topic ? -1 : 0) || order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 3);
  const tok = followupToken(userId);
  const fb = (r) => `${SITE}/api/followup/feedback?u=${userId}&t=${tok}&r=${r}`;
  const what = {
    ad: ar ? 'إعلان لمنتجك' : 'an ad for your product', cinematic: ar ? 'فيديو سينمائي' : 'a cinematic video', comedy: ar ? 'فيديو كوميدي' : 'a comedy video',
    documentary: ar ? 'فيلم وثائقي' : 'a documentary', animation: ar ? 'فيديو أنيميشن' : 'an animated video', all: ar ? 'الفيديو بتاعك' : 'your video',
  }[topic];
  const subject = ar ? `${fname}، ${what} لسه مستنيك 🎬` : `${fname}, ${what} is still waiting 🎬`;
  const dir = ar ? 'rtl' : 'ltr';
  const card = (v) => `<td style="padding:6px;width:33%;vertical-align:top"><a href="${esc(v.url)}" style="display:block;text-decoration:none;background:#1a1a2e;border:1px solid #2c2a4a;border-radius:12px;padding:14px 8px;text-align:center;color:#fff">
      ${hasPoster(v.id) ? `<img src="${SITE}/outputs/email/${esc(v.id)}.jpg" alt="" width="150" style="display:block;width:100%;max-width:170px;height:auto;border-radius:8px;margin:0 auto 4px">` : ''}<div style="font-size:${hasPoster(v.id) ? 15 : 28}px;line-height:1">▶</div><div style="font-size:13px;font-weight:700;margin-top:8px">${esc(v.title[ar ? 'ar' : 'en'])}</div><div style="font-size:11px;color:#a19cc0;margin-top:4px">${ar ? 'اتعمل على Erivion' : 'Made with Erivion'}</div></a></td>`;
  const btn = (r, label) => `<a href="${fb(r)}" style="display:inline-block;margin:4px;padding:9px 14px;border-radius:999px;border:1px solid #3a3760;color:#e7e3ff;text-decoration:none;font-size:13px">${label}</a>`;
  const html = `<div dir="${dir}" style="font-family:'Segoe UI',Tahoma,-apple-system,sans-serif;max-width:560px;margin:auto;padding:28px;background:#0f0f1a;color:#fff;border-radius:16px;text-align:${ar ? 'right' : 'left'}">
  <div style="font-size:22px;font-weight:800">${ar ? `أهلًا ${esc(fname)} 👋` : `Hi ${esc(fname)} 👋`}</div>
  <p style="color:#cfc9ef;font-size:15px;line-height:1.8;margin:14px 0">${ar
    ? `لاحظت إنك اتكلمت مع الإيجنت بتاعنا${idea ? ` عن: <b style="color:#fff">«${esc(idea)}»</b>` : ''}، بس ما كملتش. حبيت أسألك بصراحة: <b style="color:#fff">إيه اللي وقفك؟</b>`
    : `You chatted with our agent${idea ? ` about: <b style="color:#fff">"${esc(idea)}"</b>` : ''} but didn't finish. Honest question: <b style="color:#fff">what stopped you?</b>`}</p>
  <div style="margin:4px 0 20px">${btn('price', ar ? '💸 السعر غالي عليّ' : '💸 Too expensive')}${btn('confused', ar ? '🤔 ما فهمتش الخطوات' : "🤔 Didn't get the steps")}${btn('not_found', ar ? '🔍 ما لقيتش اللي عايزه' : "🔍 Didn't find what I need")}${btn('later', ar ? '⏳ هرجع بعدين' : "⏳ I'll come back later")}</div>
  <div style="font-size:16px;font-weight:700;margin:6px 0 10px">${ar ? 'شوف فيديوهات حقيقية اتعملت على Erivion:' : 'Real videos made with Erivion:'}</div>
  <table style="width:100%;border-collapse:collapse"><tr>${vids.map(card).join('')}</tr></table>
  <p style="color:#cfc9ef;font-size:14.5px;line-height:1.8;margin:18px 0 6px">${ar
    ? 'كل اللي محتاجه: صورة لمنتجك أو فكرة في سطرين، والإيجنت يقترح عليك الفكرة ويقولك السعر بالظبط قبل أي حاجة، ومفيش كريديت بيتخصم غير لما توافق.'
    : 'All you need is a product photo or a two-line idea. The agent suggests the concept and shows the exact price before anything — no credits are charged until you approve.'}</p>
  <div style="text-align:center;margin:22px 0 8px"><a href="${SITE}/" style="display:inline-block;background:linear-gradient(135deg,#7c6af7,#9333ea);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:10px">${ar ? '🎬 كمّل فكرتك دلوقتي' : '🎬 Finish your video now'}</a></div>
  <div style="text-align:center"><a href="${SITE}/pricing" style="color:#a99bff;font-size:13px">${ar ? 'شوف الباقات والأسعار' : 'See plans & prices'}</a></div>
  <p style="color:#6f6a8f;font-size:11.5px;margin-top:22px;text-align:center">${ar ? 'الإيميل ده بيتبعت مرة واحدة بس.' : 'This email is sent only once.'}</p>
</div>`;
  return { subject, html, topic };
}

async function sendOne(row) {
  const { rows: claimed } = await pool.query(
    `INSERT INTO agent_followups (user_id, email, status) VALUES ($1, $2, 'sending') ON CONFLICT (user_id) DO NOTHING RETURNING user_id`, [row.user_id, row.email]);
  if (!claimed.length) return false; // نسخة تانية من السيرفر سبقتنا
  const mail = buildFollowupEmail({ userId: row.user_id, name: row.name, messages: row.msgs || [] });
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Erivion <noreply@erivion.net>', to: row.email, subject: mail.subject, html: mail.html }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    await pool.query(`UPDATE agent_followups SET status = 'sent', topic = $2 WHERE user_id = $1`, [row.user_id, mail.topic]);
    return true;
  } catch (e) {
    await pool.query(`UPDATE agent_followups SET status = 'failed', error = $2 WHERE user_id = $1`, [row.user_id, String(e.message).slice(0, 300)]).catch(() => {});
    console.warn('[Followup] send failed:', e.message);
    return false;
  }
}

export async function runFollowups() {
  if (!process.env.DATABASE_URL || !process.env.RESEND_API_KEY) return 0;
  await ready;
  // مسجّل مجاني + كلّم الايجنت + آخر رسالة من 40 دقيقة لـ 23 ساعة + الإشعارات مش مقفولة + ما اتبعتلوش قبل كده
  const { rows } = await pool.query(`
    SELECT c.user_id, u.email, u.name, array_agg(c.user_message ORDER BY c.created_at) AS msgs
    FROM agent_conversations c
    JOIN users u ON u.id = c.user_id
    LEFT JOIN agent_followups f ON f.user_id = c.user_id
    WHERE f.user_id IS NULL AND COALESCE(u.plan, 'free') = 'free' AND u.email IS NOT NULL AND u.notif_email_enabled IS NOT FALSE
    GROUP BY c.user_id, u.email, u.name
    HAVING MAX(c.created_at) < NOW() - ($1 || ' minutes')::interval AND MAX(c.created_at) > NOW() - INTERVAL '23 hours'
    LIMIT 25`, [String(IDLE_MIN)]);
  if (rows.length) await ensurePosters().catch(() => {});
  let sent = 0;
  for (const r of rows) { if (await sendOne(r)) sent++; await new Promise((x) => setTimeout(x, 600)); }
  if (sent) console.log(`[Followup] sent ${sent} follow-up email(s)`);
  return sent;
}

export async function recordFollowupReason(userId, token, reason) {
  if (!FOLLOWUP_REASONS.includes(reason) || token !== followupToken(userId)) return false;
  await ready;
  const { rowCount } = await pool.query(`UPDATE agent_followups SET reason = $2, reason_at = NOW() WHERE user_id = $1`, [Number(userId), reason]);
  return rowCount > 0;
}

export async function followupStats() {
  await ready;
  const { rows } = await pool.query(`SELECT status, reason, COUNT(*)::int AS n FROM agent_followups GROUP BY status, reason ORDER BY n DESC`);
  return rows;
}

export function startFollowupScheduler() {
  if (!process.env.DATABASE_URL) return;
  const tick = () => runFollowups().catch((e) => console.warn('[Followup]', e.message));
  setTimeout(tick, 90_000).unref?.();
  setInterval(tick, 10 * 60 * 1000).unref?.();
}
