// ── dbBackup.js ── نسخة احتياطية يومية لقاعدة البيانات على Cloudflare R2 (بره Railway) — عشان لو الاستضافة وقفت أو اتمسحت
// بيانات العملاء (الحسابات، الكريديت، المشاريع، الدفعات) متضيعش.
// - بنقرا كل الجداول بـ SQL عادي (من غير pg_dump — مفيش مشكلة اختلاف إصدارات) ونكتبها سطر JSON لكل صف، مضغوطة gzip
// - مشفّرة AES-256-GCM قبل الرفع (الباكت عام — من غير تشفير أي حد يعرف الرابط كان هيقرا بيانات العملاء)
// - بنحتفظ بآخر 14 نسخة؛ الأقدم بيتمسح من R2 تلقائيًا
// - الاسترجاع: scripts/restoreBackup.mjs (بيفك التشفير ويرجّع الصفوف في أي Postgres)
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import pkg from 'pg';

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false, max: 2 });

export const BACKUP_KEEP = 14;
export const BACKUP_MAGIC = Buffer.from('ERVBK1');
const BATCH = 2000;
const LOCK_ID = 774411; // قفل عشان لو فيه أكتر من نسخة من السيرفر متعملش النسخة مرتين

/** مفتاح التشفير: BACKUP_KEY (الأفضل)، ولو مش موجود JWT_SECRET — لازم يتحفظ في مكان آمن بره Railway */
export function backupKey() {
  const raw = process.env.BACKUP_KEY || process.env.JWT_SECRET || '';
  if (!raw) return null;
  return { key: crypto.createHash('sha256').update(String(raw)).digest(), source: process.env.BACKUP_KEY ? 'BACKUP_KEY' : 'JWT_SECRET' };
}

const ready = (async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS db_backups (
    id SERIAL PRIMARY KEY, r2_key TEXT, size_bytes BIGINT, tables INTEGER, rows BIGINT, status TEXT DEFAULT 'running',
    error TEXT, key_source TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), finished_at TIMESTAMPTZ)`);
})().catch(e => console.warn('[Backup] init failed:', e.message));

const r2 = async () => {
  const { S3_ENDPOINT_URL, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env;
  if (!S3_ENDPOINT_URL || !S3_ACCESS_KEY || !S3_SECRET_KEY) return null;
  const sdk = await import('@aws-sdk/client-s3');
  return { sdk, s3: new sdk.S3Client({ region: 'auto', endpoint: S3_ENDPOINT_URL, credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY } }), bucket: process.env.S3_BUCKET || 'erivion-videos' };
};

/** كتابة النسخة في ملف مؤقت: [ERVBK1][iv 12][ciphertext...][tag 16] — جوه الـciphertext: gzip لسطور JSON */
export async function writeEncryptedDump(file, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const gz = zlib.createGzip({ level: 9 });
  const out = fs.createWriteStream(file);
  out.write(BACKUP_MAGIC); out.write(iv);
  gz.pipe(cipher).pipe(out, { end: false });
  const done = new Promise((res, rej) => { cipher.on('end', res); cipher.on('error', rej); gz.on('error', rej); });
  const write = (obj) => new Promise(res => { if (gz.write(JSON.stringify(obj) + '\n')) res(); else gz.once('drain', res); });

  const client = await pool.connect();
  let tables = 0, rows = 0;
  try {
    const { rows: tbls } = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    await write({ kind: 'header', version: 1, createdAt: new Date().toISOString(), tables: tbls.map(t => t.table_name) });
    for (const { table_name: t } of tbls) {
      const { rows: cols } = await client.query(`SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`, [t]);
      const { rows: pk } = await client.query(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary`, [`"${t}"`]);
      await write({ kind: 'table', name: t, columns: cols, primaryKey: pk.map(x => x.attname) });
      for (let off = 0; ; off += BATCH) {
        const { rows: batch } = await client.query(`SELECT * FROM "${t.replace(/"/g, '""')}" ORDER BY ctid LIMIT ${BATCH} OFFSET ${off}`);
        for (const r of batch) await write({ kind: 'row', t, r });
        rows += batch.length;
        if (batch.length < BATCH) break;
      }
      tables++;
    }
    const { rows: seqs } = await client.query(`SELECT schemaname, sequencename, last_value FROM pg_sequences WHERE schemaname = 'public'`).catch(() => ({ rows: [] }));
    await write({ kind: 'sequences', list: seqs.map(s => ({ name: s.sequencename, value: s.last_value })) });
  } finally { client.release(); }
  gz.end();
  await done;
  out.write(cipher.getAuthTag());
  await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));
  return { tables, rows, size: fs.statSync(file).size };
}

/** نسخة احتياطية كاملة دلوقتي → R2. بترجّع سجل النسخة */
export async function runBackup({ reason = 'manual' } = {}) {
  await ready;
  const k = backupKey(); if (!k) throw new Error('BACKUP_KEY (or JWT_SECRET) is not set — cannot encrypt the backup');
  const R = await r2(); if (!R) throw new Error('R2 storage is not configured (S3_ENDPOINT_URL / S3_ACCESS_KEY / S3_SECRET_KEY)');
  const lock = await pool.connect();
  let id = null, file = null;
  try {
    const { rows: [l] } = await lock.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_ID]);
    if (!l.ok) throw new Error('another backup is already running');
    const { rows: [rec] } = await pool.query(`INSERT INTO db_backups (status, key_source) VALUES ('running', $1) RETURNING id`, [k.source]);
    id = rec.id;
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    file = path.join(os.tmpdir(), `erivion-db-${stamp}.ervbk`);
    const info = await writeEncryptedDump(file, k.key);
    // اسم عشوائي طويل (الباكت عام) — والمحتوى مشفّر أصلًا
    const r2Key = `backups/db/${stamp}-${crypto.randomBytes(12).toString('hex')}.ervbk`;
    await R.s3.send(new R.sdk.PutObjectCommand({ Bucket: R.bucket, Key: r2Key, Body: fs.createReadStream(file), ContentLength: info.size, ContentType: 'application/octet-stream' }));
    await pool.query(`UPDATE db_backups SET status = 'done', r2_key = $2, size_bytes = $3, tables = $4, rows = $5, finished_at = NOW() WHERE id = $1`, [id, r2Key, info.size, info.tables, info.rows]);
    console.log(`[Backup] ${reason}: ${info.tables} tables, ${info.rows} rows, ${(info.size / 1048576).toFixed(2)}MB → ${r2Key}`);
    await pruneBackups(R).catch(e => console.warn('[Backup] prune failed:', e.message));
    return { id, r2Key, ...info };
  } catch (e) {
    if (id) await pool.query(`UPDATE db_backups SET status = 'failed', error = $2, finished_at = NOW() WHERE id = $1`, [id, String(e.message || e).slice(0, 500)]).catch(() => {});
    throw e;
  } finally {
    if (file) fs.rm(file, { force: true }, () => {});
    await lock.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    lock.release();
  }
}

/** بنسيب آخر BACKUP_KEEP نسخة ناجحة ونمسح الباقي من R2 */
async function pruneBackups(R) {
  const { rows } = await pool.query(`SELECT id, r2_key FROM db_backups WHERE status = 'done' ORDER BY id DESC OFFSET $1`, [BACKUP_KEEP]);
  for (const b of rows) {
    if (b.r2_key) await R.s3.send(new R.sdk.DeleteObjectCommand({ Bucket: R.bucket, Key: b.r2_key })).catch(() => {});
    await pool.query(`UPDATE db_backups SET status = 'pruned' WHERE id = $1`, [b.id]);
  }
  await pool.query(`DELETE FROM db_backups WHERE status IN ('failed', 'running') AND created_at < NOW() - INTERVAL '30 days'`).catch(() => {});
}

export async function listBackups() {
  await ready;
  const { rows } = await pool.query(`SELECT id, status, size_bytes, tables, rows, error, key_source, created_at, finished_at FROM db_backups WHERE status <> 'pruned' ORDER BY id DESC LIMIT 30`);
  return rows;
}

/** فتح نسخة من R2: raw = الملف المشفّر زي ما هو، غير كده بنفك التشفير ونرجّع gzip لسطور JSON */
export async function openBackupStream(id, { raw = false } = {}) {
  await ready;
  const { rows: [b] } = await pool.query(`SELECT * FROM db_backups WHERE id = $1 AND status = 'done'`, [id]);
  if (!b) return null;
  const R = await r2(); if (!R) throw new Error('R2 storage is not configured');
  const obj = await R.s3.send(new R.sdk.GetObjectCommand({ Bucket: R.bucket, Key: b.r2_key }));
  const buf = Buffer.from(await obj.Body.transformToByteArray());
  if (raw) return { backup: b, buffer: buf, encrypted: true };
  const k = backupKey(); if (!k) throw new Error('BACKUP_KEY is not set');
  return { backup: b, buffer: decryptBackup(buf, k.key), encrypted: false };
}

/** فك التشفير (بيرجّع الـgzip) — نفس الدالة بيستخدمها سكريبت الاسترجاع */
export function decryptBackup(buf, key) {
  if (!buf.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) throw new Error('not an Erivion backup file');
  const iv = buf.subarray(BACKUP_MAGIC.length, BACKUP_MAGIC.length + 12), tag = buf.subarray(buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(BACKUP_MAGIC.length + 12, buf.length - 16)), d.final()]);
}

// ── الجدولة: كل نص ساعة بنشوف — لو مفيش نسخة ناجحة في آخر 22 ساعة والساعة 3 الفجر أو بعدها بتوقيت القاهرة، بنعمل واحدة ──
let timer = null;
export function startBackupScheduler() {
  if (timer || process.env.DISABLE_DB_BACKUP === '1' || !process.env.DATABASE_URL) return;
  const tick = async () => {
    try {
      await ready;
      const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }).format(new Date()));
      const { rows: [last] } = await pool.query(`SELECT created_at FROM db_backups WHERE status = 'done' ORDER BY id DESC LIMIT 1`);
      const age = last ? (Date.now() - new Date(last.created_at).getTime()) / 3600e3 : Infinity;
      if (age >= 22 && (hour >= 3 || age > 30)) await runBackup({ reason: 'daily' });
    } catch (e) { console.warn('[Backup] scheduled backup failed:', e.message); }
  };
  setTimeout(tick, 5 * 60e3);
  timer = setInterval(tick, 30 * 60e3);
}
