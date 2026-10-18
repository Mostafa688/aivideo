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

const tidy = (s) => String(s || '').replace(/\r\n?/g, '\n').replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/** @returns {Promise<{ text: string, chars: number, truncated: boolean, pages?: number }>} */
export async function extractDocumentText(buffer, filename, { maxChars = DOC_MAX_CHARS } = {}) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  if (!DOC_EXTS.includes(ext)) { const e = new Error('unsupported_type'); e.code = 'unsupported_type'; throw e; }
  let text = '', pages;
  if (ext === '.pdf') {
    // lib/pdf-parse.js مباشرة (الـindex بتاعها بيشغّل اختبار debug لما يتعمله import)
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const r = await pdfParse(buffer);
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
