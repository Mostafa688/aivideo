// ── RatingPrompt.jsx ────────────────────────────────────────────────────────
// مكوّن تقييم قابل لإعادة الاستخدام — يُعرض بعد أي فيديو يخلص في أي موديل.
// التقييم الداخلي (نجوم + تعليق) بيتحفظ في كل مرة ويوصل للأدمن. دعوة Trustpilot
// بتظهر تلقائيًا بس أول مرة العميل يدي تقييم عالي (4-5 نجوم) — الباك إند هو
// اللي بيحدد ده (trustpilot_prompted flag)، مش الفرونت، عشان تفضل دقيقة حتى لو
// العميل استخدم أكتر من جهاز/متصفح.
import React, { useState } from 'react';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

export default function RatingPrompt({ modelUsed, onClose, lang = 'ar' }) {
  const isAr = lang !== 'en';
  const [step, setStep] = useState('rate'); // rate | trustpilot | done
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!rating) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/feedback/rate', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ rating, comment: comment.trim(), modelUsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setStep(data.showTrustpilotCTA ? 'trustpilot' : 'done');
    } catch (e) {
      setError(isAr ? 'حصل خطأ، حاول تاني' : 'Something went wrong, try again');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'done') {
    setTimeout(() => onClose?.(), 1400);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#0f0f1a', border: '1px solid rgba(124,106,247,0.25)', borderRadius: 20, padding: '28px 26px', maxWidth: 380, width: '100%', textAlign: 'center', direction: isAr ? 'rtl' : 'ltr', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {step === 'rate' && (
          <>
            <button onClick={onClose} style={{ position: 'absolute', top: 14, insetInlineEnd: 14, background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🎬</div>
            <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>
              {isAr ? 'عجبك الفيديو؟' : 'How was your video?'}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 18px' }}>
              {isAr ? 'رأيك بيساعدنا نتحسن' : 'Your feedback helps us improve'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 16 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} onClick={() => setRating(n)} onMouseEnter={() => setHoverRating(n)} onMouseLeave={() => setHoverRating(0)}
                  style={{ fontSize: 30, cursor: 'pointer', color: (hoverRating || rating) >= n ? '#fbbf24' : 'rgba(255,255,255,0.15)', transition: 'color 0.15s' }}>★</span>
              ))}
            </div>
            <textarea value={comment} onChange={e => setComment(e.target.value)}
              placeholder={isAr ? 'أي تعليق؟ (اختياري)' : 'Any comment? (optional)'} rows={3}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#fff', fontSize: 13, resize: 'vertical', marginBottom: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            {error && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 10 }}>{error}</p>}
            <button onClick={submit} disabled={!rating || loading}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: rating ? 'linear-gradient(135deg,#7c6af7,#6d28d9)' : 'rgba(255,255,255,0.06)', color: rating ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: 14, cursor: rating ? 'pointer' : 'not-allowed' }}>
              {loading ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال' : 'Submit')}
            </button>
          </>
        )}
        {step === 'trustpilot' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🌟</div>
            <h3 style={{ color: '#fff', fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>
              {isAr ? 'شكرًا! تحب تشاركنا رأيك على Trustpilot؟' : 'Thanks! Mind sharing that on Trustpilot?'}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 20px', lineHeight: 1.7 }}>
              {isAr ? 'بيساعدنا كتير نوصل لناس تانية زيك' : 'It really helps other people find us'}
            </p>
            <a href="https://www.trustpilot.com/review/erivion.net" target="_blank" rel="noreferrer" onClick={onClose}
              style={{ display: 'block', padding: 13, borderRadius: 10, background: 'linear-gradient(135deg,#00b67a,#00825b)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', marginBottom: 10 }}>
              {isAr ? '⭐ قيّمنا على Trustpilot' : '⭐ Review us on Trustpilot'}
            </a>
            <button onClick={onClose} style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer' }}>
              {isAr ? 'لأ شكرًا' : 'No thanks'}
            </button>
          </>
        )}
        {step === 'done' && (
          <>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🙏</div>
            <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 800, margin: 0 }}>
              {isAr ? 'شكرًا على رأيك!' : 'Thanks for your feedback!'}
            </h3>
          </>
        )}
      </div>
    </div>
  );
}
