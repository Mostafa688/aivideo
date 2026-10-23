#!/usr/bin/env node
// ── restoreBackup.mjs ── استرجاع نسخة Erivion الاحتياطية في أي قاعدة Postgres (Railway جديدة، Supabase، Neon، جهازك…)
//
// الاستخدام (من فولدر المشروع):
//   node scripts/restoreBackup.mjs <backup.ervbk | backup.ndjson.gz> --db "postgresql://..." [--key "BACKUP_KEY"] [--check]
//
//   --db     رابط قاعدة البيانات اللي هنرجّع فيها (أو متغير DATABASE_URL)
//   --key    مفتاح التشفير: نفس قيمة BACKUP_KEY (أو JWT_SECRET لو BACKUP_KEY مكانش متظبط) — للملفات المشفّرة .ervbk بس
//   --check  بيفك الملف ويعدّ الجداول والصفوف من غير ما يكتب أي حاجة
//
// بيعمل الجداول لو مش موجودة، ويضيف الصفوف (الموجود قبل كده بنفس المفتاح بيتساب زي ما هو)، ويظبط العدادات (sequences).
import fs from 'fs';
import zlib from 'zlib';
import crypto from 'crypto';
import readline from 'readline';
import { Readable } from 'stream';
import pkg from 'pg';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const file = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--db' && args[args.indexOf(a) - 1] !== '--key');
const dbUrl = opt('--db') || process.env.DATABASE_URL;
const keyRaw = opt('--key') || process.env.BACKUP_KEY || process.env.JWT_SECRET;
const checkOnly = args.includes('--check');
if (!file || !fs.existsSync(file)) { console.error('Usage: node scripts/restoreBackup.mjs <backup file> --db "postgresql://..." [--key "..."] [--check]'); process.exit(1); }

const MAGIC = Buffer.from('ERVBK1');
let buf = fs.readFileSync(file);
if (buf.subarray(0, MAGIC.length).equals(MAGIC)) {
  if (!keyRaw) { console.error('This backup is encrypted: pass --key with the BACKUP_KEY (or JWT_SECRET) value.'); process.exit(1); }
  const key = crypto.createHash('sha256').update(String(keyRaw)).digest();
  const iv = buf.subarray(MAGIC.length, MAGIC.length + 12), tag = buf.subarray(buf.length - 16);
  try { const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); buf = Buffer.concat([d.update(buf.subarray(MAGIC.length + 12, buf.length - 16)), d.final()]); }
  catch { console.error('Wrong key: could not decrypt this backup.'); process.exit(1); }
}

const q = (n) => `"${String(n).replace(/"/g, '""')}"`;
function colType(c) {
  if (c.data_type === 'ARRAY') return `${c.udt_name.replace(/^_/, '')}[]`;
  if (c.data_type === 'USER-DEFINED') return c.udt_name;
  return c.data_type;
}

let client = null;
if (!checkOnly) {
  if (!dbUrl) { console.error('Pass --db "postgresql://..." (the database to restore into).'); process.exit(1); }
  client = new pkg.Client({ connectionString: dbUrl, ssl: /localhost|127\.0\.0\.1/.test(dbUrl) ? false : { rejectUnauthorized: false } });
  await client.connect();
}

// القارئ بيتعمل بعد الاتصال بقاعدة البيانات (لو اتعمل قبله السطور بتضيع والسكريبت يفضل مستني)
const lines = readline.createInterface({ input: Readable.from(zlib.gunzipSync(buf)), crlfDelay: Infinity });
const tables = new Map(); let cur = null, pending = [], total = 0;
const flush = async () => {
  if (!pending.length || !cur) { pending = []; return; }
  if (client) {
    const cols = cur.columns.map(c => c.column_name);
    const jsonCols = new Set(cur.columns.filter(c => c.data_type === 'json' || c.data_type === 'jsonb').map(c => c.column_name));
    const vals = [], ph = pending.map((r, i) => `(${cols.map((c, j) => { const v = r[c]; vals.push(v != null && jsonCols.has(c) ? JSON.stringify(v) : v ?? null); return `$${i * cols.length + j + 1}`; }).join(',')})`);
    await client.query(`INSERT INTO ${q(cur.name)} (${cols.map(q).join(',')}) VALUES ${ph.join(',')} ON CONFLICT DO NOTHING`, vals);
  }
  total += pending.length; tables.set(cur.name, (tables.get(cur.name) || 0) + pending.length); pending = [];
};

for await (const line of lines) {
  if (!line.trim()) continue;
  const m = JSON.parse(line);
  if (m.kind === 'header') console.log(`Backup from ${m.createdAt} — ${m.tables.length} tables`);
  else if (m.kind === 'table') {
    await flush(); cur = m; tables.set(m.name, 0);
    if (client) {
      for (const c of m.columns) { const s = /nextval\('([^']+)'/.exec(c.column_default || ''); if (s) await client.query(`CREATE SEQUENCE IF NOT EXISTS ${s[1].split('.').map(q).join('.')}`); }
      const defs = m.columns.map(c => `${q(c.column_name)} ${colType(c)}${c.column_default ? ` DEFAULT ${c.column_default}` : ''}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
      if (m.primaryKey?.length) defs.push(`PRIMARY KEY (${m.primaryKey.map(q).join(',')})`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${q(m.name)} (${defs.join(', ')})`);
    }
  } else if (m.kind === 'row') {
    pending.push(m.r);
    if (pending.length >= Math.max(1, Math.floor(30000 / Math.max(1, cur.columns.length)))) await flush();
  } else if (m.kind === 'sequences') {
    await flush();
    if (client) for (const s of m.list) if (s.value != null) await client.query('SELECT setval($1, $2, true)', [q(s.name), s.value]).catch(() => {});
  }
}
await flush();
if (client) await client.end();
console.log(`${checkOnly ? 'Checked' : 'Restored'} ${total} rows in ${tables.size} tables:`);
for (const [t, n] of tables) console.log(`  ${t}: ${n}`);
