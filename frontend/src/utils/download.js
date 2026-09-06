// ✅ FIX (باج حقيقي حصل مع عملاء حقيقيين على أكتر من صفحة: دوس على "تحميل" كان بيفتح رابط
// الفيديو/الصورة الخام في تاب جديد بدل ما ينزّله فعليًا): السبب الحقيقي كان CORS — متصفحات
// بتمنع صفحة الموقع من عمل fetch() مباشرة على رابط من نطاق (origin) مختلف تمامًا (زي رابط R2
// العام أو replicate.delivery) إلا لو السيرفر البعيد نفسه سمح بده صراحة، وR2/Replicate مش
// بيسمحوا افتراضيًا. الحل: أي رابط من نطاق مختلف بيعدي على بروكسي من سيرفرنا نفسه
// (/api/agent/media-proxy) بدل ما نجيبه مباشرة من المتصفح — السيرفر بيجيبه هو (مفيش CORS بين
// سيرفرين خالص)، ويرجّعه لينا من نفس نطاق الموقع، فالـ fetch بتاع المتصفح بقى "نفس المصدر"
// ومفيش مشكلة. الروابط المحلية (زي /outputs/...) نفس نطاق الموقع أصلاً، فبتتجاب مباشرة.
function toSameOriginUrl(url, mode) {
  try {
    const u = new URL(url, window.location.href);
    if (u.origin === window.location.origin) return url; // محلي أصلاً — من غير بروكسي
    return `/api/agent/media-proxy?url=${encodeURIComponent(url)}&mode=${mode}`;
  } catch {
    return url;
  }
}

function authFetchHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: 'Bearer ' + token } : {};
}

export async function downloadRemoteFile(url, filename) {
  if (!url) return;
  try {
    const fetchUrl = toSameOriginUrl(url, 'download');
    const res = await fetch(fetchUrl, { headers: authFetchHeaders() });
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || url.split('/').pop().split('?')[0] || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
  } catch (e) {
    console.warn('[downloadRemoteFile] falling back to opening the raw link:', e.message);
    window.open(url, '_blank', 'noopener');
  }
}

// ✅ NEW: بيرجّع Blob محلي (مش تنزيل) لنفس الرابط — نفس منطق الـ CORS-safe proxy فوق، بس
// للاستخدامات اللي محتاجة الملف نفسه (زي تحويله base64 لتحريك صورة)، مش تنزيله كملف
export async function fetchRemoteBlob(url) {
  const fetchUrl = toSameOriginUrl(url, 'fetch');
  const res = await fetch(fetchUrl, { headers: authFetchHeaders() });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return res.blob();
}
