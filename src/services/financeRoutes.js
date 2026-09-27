// ── financeRoutes.js ──────────────────────────────────────────────────────────
// ✅ NEW (طلب العميل: "عايز اعمل نظام يحدد المصروفات والمدخولات... عشان لما اسجل الموقع
// تجاري" — دفتر حسابات بسيط داخلي بحت (مفيش صفحة عامة خالص، أدمن بس) لتسجيل كل مصروف
// (Replicate، استضافة، إلخ) ودخل (InstaPay/Gumroad) يدويًا، مع إيصال (receipt) مرفق لكل
// حركة، عشان يبقى عندنا سجل حقيقي جاهز وقت التسجيل التجاري الرسمي. متعمدين نخليه يدوي بالكامل
// (مش مربوط أوتوماتيك بجداول الدفعات الموجودة) — العميل نفسه هو اللي هيحدد كل حركة بنفسه
// بدقة، مش تجميع تلقائي ممكن يشيل تفاصيل مهمة أو يحسب غلط
import express from 'express';
import pkg from 'pg';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { adminAuth } from './adminAuthMiddleware.js';

const { Pool } = pkg;
const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS finance_entries (
    id SERIAL PRIMARY KEY,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL DEFAULT 'expense',
    category TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EGP',
    notes TEXT,
    receipt_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.error('[Finance] create finance_entries error:', e.message));

const VALID_TYPES = ['income', 'expense'];
const VALID_CURRENCIES = ['EGP', 'USD'];

// ── رفع إيصال (نفس نمط coursesRoutes.js's uploadCourseFileToR2 بالظبط) ──────────
const S3_ENDPOINT_URL = process.env.S3_ENDPOINT_URL;
const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
const S3_BUCKET = process.env.S3_BUCKET || 'erivion-videos';
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

async function uploadReceiptToR2(buffer, key, contentType) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: S3_ENDPOINT_URL,
    credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  });
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
  return `${R2_PUBLIC_URL}/${key}`;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB كافي جدًا لأي إيصال (صورة أو PDF)
});

router.post('/admin/upload-receipt', adminAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!S3_ENDPOINT_URL || !S3_ACCESS_KEY || !S3_SECRET_KEY) {
      return res.status(503).json({ error: 'R2 storage is not configured on the server' });
    }
    const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
    const key = `finance-receipts/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = await uploadReceiptToR2(req.file.buffer, key, req.file.mimetype || 'application/octet-stream');
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function buildDateFilter(req, params) {
  const clauses = [];
  if (req.query.from) { params.push(req.query.from); clauses.push(`entry_date >= $${params.length}`); }
  if (req.query.to) { params.push(req.query.to); clauses.push(`entry_date <= $${params.length}`); }
  if (req.query.type && VALID_TYPES.includes(req.query.type)) { params.push(req.query.type); clauses.push(`type = $${params.length}`); }
  if (req.query.currency && VALID_CURRENCIES.includes(req.query.currency)) { params.push(req.query.currency); clauses.push(`currency = $${params.length}`); }
  return clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
}

router.get('/admin/list', adminAuth, async (req, res) => {
  try {
    const params = [];
    const where = buildDateFilter(req, params);
    const { rows } = await pool.query(
      `SELECT * FROM finance_entries ${where} ORDER BY entry_date DESC, id DESC LIMIT 1000`,
      params
    );
    res.json({ entries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ مجمّع لكل عملة لوحدها — عمدًا مش بنحوّل بسعر صرف واحد ثابت هنا (بيتغير باستمرار
// وأي رقم ثابت هيبقى غلط بمرور الوقت)؛ العميل يشوف كل عملة على حدة وصافي ربحها لوحده
router.get('/admin/summary', adminAuth, async (req, res) => {
  try {
    const params = [];
    const where = buildDateFilter(req, params);
    const { rows } = await pool.query(
      `SELECT currency, type, COALESCE(SUM(amount), 0)::float AS total
       FROM finance_entries ${where} GROUP BY currency, type`,
      params
    );
    const byCurrency = {};
    for (const r of rows) {
      byCurrency[r.currency] = byCurrency[r.currency] || { currency: r.currency, income: 0, expense: 0 };
      byCurrency[r.currency][r.type] = r.total;
    }
    const summary = Object.values(byCurrency).map(c => ({ ...c, net: c.income - c.expense }));
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ NEW (طلب العميل: "لو حبيت تجميع لكل حاجة، اقدر احمله ملف Excel جاهز") — نفس فلاتر
// list/summary بالظبط (from/to/type/currency)، ملف .xlsx حقيقي فيه ورقتين: "Entries" (كل
// حركة بتفاصيلها) و"Summary" (نفس الملخص لكل عملة اللي بيبان في الصفحة)، جاهز للتسليم
// المحاسبي المباشر
router.get('/admin/export', adminAuth, async (req, res) => {
  try {
    const listParams = [];
    const where = buildDateFilter(req, listParams);
    const { rows: entries } = await pool.query(
      `SELECT * FROM finance_entries ${where} ORDER BY entry_date ASC, id ASC`,
      listParams
    );

    const summaryParams = [];
    const summaryWhere = buildDateFilter(req, summaryParams);
    const { rows: totalsRows } = await pool.query(
      `SELECT currency, type, COALESCE(SUM(amount), 0)::float AS total
       FROM finance_entries ${summaryWhere} GROUP BY currency, type`,
      summaryParams
    );
    const byCurrency = {};
    for (const r of totalsRows) {
      byCurrency[r.currency] = byCurrency[r.currency] || { currency: r.currency, income: 0, expense: 0 };
      byCurrency[r.currency][r.type] = r.total;
    }
    const summary = Object.values(byCurrency).map(c => ({ ...c, net: c.income - c.expense }));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Erivion';
    workbook.created = new Date();

    const entriesSheet = workbook.addWorksheet('Entries');
    entriesSheet.columns = [
      { header: 'Date', key: 'entry_date', width: 14 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Category', key: 'category', width: 28 },
      { header: 'Amount', key: 'amount', width: 14 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'Notes', key: 'notes', width: 40 },
      { header: 'Receipt', key: 'receipt_url', width: 40 },
    ];
    entriesSheet.getRow(1).font = { bold: true };
    for (const e of entries) {
      entriesSheet.addRow({
        entry_date: e.entry_date ? new Date(e.entry_date).toISOString().slice(0, 10) : '',
        type: e.type,
        category: e.category,
        amount: e.type === 'expense' ? -Number(e.amount) : Number(e.amount),
        currency: e.currency,
        notes: e.notes || '',
        receipt_url: e.receipt_url || '',
      });
    }
    entriesSheet.getColumn('amount').numFmt = '#,##0.00';

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Currency', key: 'currency', width: 12 },
      { header: 'Income', key: 'income', width: 16 },
      { header: 'Expense', key: 'expense', width: 16 },
      { header: 'Net', key: 'net', width: 16 },
    ];
    summarySheet.getRow(1).font = { bold: true };
    for (const c of summary) summarySheet.addRow(c);
    ['income', 'expense', 'net'].forEach(k => { summarySheet.getColumn(k).numFmt = '#,##0.00'; });

    const filename = `erivion-finance-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin', adminAuth, async (req, res) => {
  try {
    const { entry_date, type, category, amount, currency, notes, receipt_url } = req.body;
    if (!category?.trim()) return res.status(400).json({ error: 'category is required' });
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return res.status(400).json({ error: 'amount must be a positive number' });
    const finalType = VALID_TYPES.includes(type) ? type : 'expense';
    const finalCurrency = VALID_CURRENCIES.includes(currency) ? currency : 'EGP';
    const { rows } = await pool.query(
      `INSERT INTO finance_entries (entry_date, type, category, amount, currency, notes, receipt_url)
       VALUES (COALESCE($1, CURRENT_DATE), $2, $3, $4, $5, $6, $7) RETURNING *`,
      [entry_date || null, finalType, category.trim(), amountNum, finalCurrency, notes || null, receipt_url || null]
    );
    res.json({ entry: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/admin/:id', adminAuth, async (req, res) => {
  try {
    const { entry_date, type, category, amount, currency, notes, receipt_url } = req.body;
    const finalType = type === undefined ? null : (VALID_TYPES.includes(type) ? type : 'expense');
    const finalCurrency = currency === undefined ? null : (VALID_CURRENCIES.includes(currency) ? currency : 'EGP');
    const amountNum = amount === undefined ? null : parseFloat(amount);
    if (amount !== undefined && (!Number.isFinite(amountNum) || amountNum <= 0)) {
      return res.status(400).json({ error: 'amount must be a positive number' });
    }
    const { rows } = await pool.query(
      `UPDATE finance_entries SET
        entry_date = COALESCE($1, entry_date),
        type = COALESCE($2, type),
        category = COALESCE($3, category),
        amount = COALESCE($4, amount),
        currency = COALESCE($5, currency),
        notes = $6,
        receipt_url = $7
       WHERE id = $8 RETURNING *`,
      [entry_date || null, finalType, category?.trim() || null, amountNum,
        finalCurrency, notes ?? null, receipt_url === undefined ? null : receipt_url, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/admin/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM finance_entries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
