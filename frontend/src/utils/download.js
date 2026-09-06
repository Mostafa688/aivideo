// ✅ FIX (باج حقيقي حصل مع عملاء حقيقيين على أكتر من صفحة: دوس على "تحميل" كان بيفتح رابط
// الفيديو/الصورة الخام في تاب جديد بدل ما ينزّله فعليًا): متصفحات بتتجاهل خاصية <a download>
// لأي رابط من نطاق (origin) مختلف عن الموقع نفسه — وده بالظبط حال روابط R2/replicate.delivery.
// الحل الوحيد الحقيقي من جوه المتصفح: نجيب الملف بـ fetch، نحوله Blob محلي (نفس نطاق الموقع)،
// ونعمل تنزيل من الـ Blob ده — مش من الرابط البعيد مباشرة. لو الجلب فشل لأي سبب (شبكة/CORS
// نادر)، بنرجع نفتح الرابط في تاب جديد كحل احتياطي بدل ما نفشل بصمت.
export async function downloadRemoteFile(url, filename) {
  if (!url) return;
  try {
    const res = await fetch(url);
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
