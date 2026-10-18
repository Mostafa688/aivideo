// ── documentText.js ── استخراج النص من مستند العميل (PDF / Word / نص / ترجمة / CSV) عشان الايجنت يقراه
// (سكريبت جاهز، فكرة إعلان، محتوى درس…). بيرجّع نص بس — الملف نفسه مش بيتخزن.
import path from 'path';

export const DOC_MAX_BYTES = 15 * 1024 * 1024;
export const DOC_MAX_CHARS = 30000;
export const DOC_EXTS = ['.pdf', '.docx', '.txt', '.md', '.srt', '.vtt', '.csv', '.json', '.rtf'];

// بعض ملفات PDF بتطلّع السطر العربي معكوس (ترتيب الحروف المرئي): "النهارده" → "هدراهنلا".
// بنكتشفه من شكل الكلمات (كلمات بتخلص بـ"لا" أكتر من اللي بتبدأ بـ"ال") ونقلب السطر، ونرجّع الأرقام/الإنجليزي لترتيبها
const AR = /[\u0600-\u06FF]/;
function fixReversedArabic(text) {
  return text.split('\n').map(line => {
    if (!AR.test(line)) return line;
    const words = line.split(/\s+/).filter(w => AR.test(w));
    const starts = words.filter(w => /^(ال|وال|بال|فال|لل)/.test(w)).length, ends = words.filter(w => /(لا|لاو|لاب|لاف|لل)$/.test(w)).length;
    if (ends <= starts || ends < 1) return line;
    const rev = [...line].reverse().join('');
    return rev.replace(/[A-Za-z0-9.,:%/\-]+/g, m => [...m].reverse().join(''));
  }).join('\n');
}

// ترتيب نص الصفحة من مواضع الحروف نفسها: pdf-parse العادي بيكسر العربي (الشدة/التنوين بتنزل سطر لوحدها،
// "لا" بتطلع "ال"، وكلمات بتتقلب) خصوصاً في ملفات PDF اللي كل حرف فيها عنصر لوحده (Chrome/Word/Canva).
// بنجمّع العناصر لسطور حسب الارتفاع، والسطر العربي بنرتّبه من اليمين للشمال بالحافة اليمين لكل حرف (فالتشكيل يقع بعد حرفه)،
// والأرقام/الإنجليزي جوه السطر العربي بترجع لترتيبها الطبيعي
const ARC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
export async function renderPdfPageText(pageData) {
  const tc = await pageData.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
  const items = tc.items.filter(it => it && typeof it.str === 'string' && it.str.length).map(it => {
    const h = Math.abs(it.transform[3]) || Math.abs(it.height) || 10;
    return { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h };
  });
  if (!items.length) return '';
  items.sort((a, b) => b.y - a.y);
  // التشكيل (فتحة/كسرة/شدة/تنوين) بيبقى أعلى أو أسفل حرفه، فبنلحقه بأقرب سطر بعد ما السطور تتكوّن
  const isMark = (it) => /^[\u064B-\u065F\u0670\u06D6-\u06ED]+$/.test(it.s);
  const lines = [];
  for (const it of items.filter(i => !isMark(i))) {
    const ln = lines.find(l => Math.abs(l.y - it.y) < Math.max(2, Math.min(l.h, it.h) * 0.45));
    if (ln) { ln.items.push(it); ln.h = Math.max(ln.h, it.h); } else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  for (const it of items.filter(isMark)) {
    let best = null; for (const l of lines) if (!best || Math.abs(l.y - it.y) < Math.abs(best.y - it.y)) best = l;
    if (best && Math.abs(best.y - it.y) < best.h * 1.2) best.items.push({ ...it, w: 0, mark: true });
  }
  lines.sort((a, b) => b.y - a.y);
  const out = []; let prev = null;
  for (const ln of lines) {
    const txt = ln.items.map(i => i.s).join('');
    const nAr = (txt.match(new RegExp(ARC.source, 'g')) || []).length, nLat = (txt.match(/[A-Za-z]/g) || []).length;
    const rtl = nAr > nLat * 1.15;
    const its = ln.items.slice().sort(rtl ? (a, b) => (b.x + b.w) - (a.x + a.w) || a.w - b.w : (a, b) => a.x - b.x);
    // الأرقام/اللاتيني اللي اتقسمت لعناصر جوه سطر عربي: بنرجّع ترتيب المجموعة دي
    if (rtl) {
      for (let i = 0; i < its.length;) {
        if (ARC.test(its[i].s) || !its[i].s.trim()) { i++; continue; }
        let j = i; while (j + 1 < its.length && !ARC.test(its[j + 1].s) && its[j + 1].s.trim() && Math.abs((its[j].x) - (its[j + 1].x + its[j + 1].w)) < its[j].h * 0.3) j++;
        if (j > i) its.splice(i, j - i + 1, ...its.slice(i, j + 1).reverse());
        i = j + 1;
      }
    }
    // في سطر إنجليزي فيه كلام عربي: جملة العربي اتحطت بالترتيب المرئي (شمال→يمين) فبنقلبها
    if (!rtl) {
      for (let i = 0; i < its.length;) {
        if (!ARC.test(its[i].s)) { i++; continue; }
        let j = i; while (j + 1 < its.length && (ARC.test(its[j + 1].s) || (!its[j + 1].s.trim() && its[j + 2] && ARC.test(its[j + 2].s)) || its[j + 1].mark)) j++;
        if (j > i) its.splice(i, j - i + 1, ...its.slice(i, j + 1).reverse());
        i = j + 1;
      }
    }
    // التشكيل بييجي بعد الحرف اللي تحته (أقرب حرف بيغطي مكانه)، مش حسب ترتيبه في الفرز
    const marks = its.filter(i => i.mark), base = its.filter(i => !i.mark);
    for (const m of marks) {
      let at = -1, bd = Infinity;
      base.forEach((b, idx) => { if (b.w <= 0 || !ARC.test(b.s)) return; const c = b.x + b.w / 2, d = Math.abs(c - m.x) - (m.x >= b.x - 1 && m.x <= b.x + b.w + 1 ? 1000 : 0); if (d < bd) { bd = d; at = idx; } });
      if (at >= 0) base[at] = { ...base[at], s: base[at].s + m.s };
    }
    its.length = 0; its.push(...base);
    let line = '';
    for (let k = 0; k < its.length; k++) {
      const a = its[k - 1], b = its[k];
      if (a && b.w > 0) {
        const gap = rtl ? a.x - (b.x + b.w) : b.x - (a.x + a.w);
        if (gap > b.h * 0.22 && !/\s$/.test(line) && !/^\s/.test(b.s)) line += ' ';
      }
      line += b.s;
    }
    if (prev && prev.y - ln.y > Math.max(prev.h, ln.h) * 2.4) out.push('');
    out.push(line.replace(/\s+/g, ' ').trim());
    prev = ln;
  }
  return out.join('\n');
}

const tidy = (s) => String(s || '').replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/** @returns {Promise<{ text: string, chars: number, truncated: boolean, pages?: number }>} */
export async function extractDocumentText(buffer, filename, { maxChars = DOC_MAX_CHARS } = {}) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (!DOC_EXTS.includes(ext)) { const e = new Error('unsupported_type'); e.code = 'unsupported_type'; throw e; }
  let text = '', pages;
  if (ext === '.pdf') {
    // lib/pdf-parse.js مباشرة (الـindex بتاعها بيشغّل اختبار debug لما يتعمله import)
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    let r;
    try { r = await pdfParse(buffer, { pagerender: renderPdfPageText }); } catch { r = null; }
    if (!r || !String(r.text || '').trim()) r = await pdfParse(buffer);
    text = fixReversedArabic(r.text); pages = r.numpages;
  } else if (ext === '.docx') {
    const mammoth = (await import('mammoth')).default;
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (ext === '.rtf') {
    text = buffer.toString('utf8').replace(/\\par[d]?/g, '\n').replace(/\{\\[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, '');
  } else {
    text = buffer.toString('utf8').replace(/^﻿/, '');
    if (ext === '.srt' || ext === '.vtt') text = text.replace(/^WEBVTT.*$/m, '').replace(/^\d+\s*$/gm, '').replace(/^[\d:.,]+ --> [\d:.,]+.*$/gm, '');
  }
  text = tidy(text);
  if (!text) { const e = new Error('empty_document'); e.code = 'empty_document'; throw e; }
  const truncated = text.length > maxChars;
  return { text: truncated ? text.slice(0, maxChars) : text, chars: text.length, truncated, pages };
}
