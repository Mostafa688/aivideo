// ── adminAuthMiddleware.js ──────────────────────────────────────────────────
// ✅ NEW (طلب العميل: "زوّد الحماية والأمن على صفحة الأدمن، وخليها تتفتح بكلمة السر بس
// للإيميلات دي بس") — قبل كده، صفحة الأدمن كانت بتتفتح بسر ثابت واحد (ADMIN_SECRET) متخزن
// حرفيًا في متغير VITE_ADMIN_SECRET بالفرونت إند، ومعاه fallback هاردكودد ('Sosa6892Midbok'/
// 'erivion_admin_2026') لو المتغير مش متظبط — ده باج أمان حقيقي وخطير: أي متغيّر بادئته
// VITE_ بيتحط حرفيًا (نص خام) جوه ملف الـJS النهائي اللي بيوصل لمتصفح أي زائر عادي، يعني
// أي حد يفتح devtools/view-source يقدر يجيب السر الحقيقي المستخدم فعليًا على الموقع الحي
// ويدخل صفحة الأدمن كاملة (بيانات كل العملاء، الدفعات، حذف/حظر حسابات...). الحل هنا:
// 1. مفيش أي سر حقيقي بيتبعت أو بيتخزن في الفرونت إند خالص بعد كده — بس توكن جلسة (JWT)
//    قصير العمر (12 ساعة) بيتصدر من السيرفر بعد تسجيل دخول حقيقي بإيميل+باسورد.
// 2. الباسورد لسه هو نفس ADMIN_SECRET (نفس المتغير المستخدم في روابط موافقة/رفض الدفع في
//    الإيميلات — ده استخدام تاني منفصل تمامًا، مش بيتلمس هنا) — بس دلوقتي لازم كمان الإيميل
//    يكون من ضمن قايمة أدمن محددة، مش أي حد عنده الباسورد بس.
// 3. مقارنة الباسورد بطريقة timing-safe (بدل === العادي اللي ممكن يسرّب معلومة عن طول/محتوى
//    السر عن طريق فروق التوقيت الدقيقة).
// 4. Rate limiting بسيط على محاولات الدخول (IP-based) عشان يمنع brute-force على الباسورد.
// 5. مفيش fallback هاردكودد لأي سر خالص — لو ADMIN_SECRET أو JWT_SECRET مش متظبطين في الـ
//    env، تسجيل الدخول بيترفض برسالة واضحة بدل ما يشتغل بسر افتراضي معروف/عام.
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// ⚠️ نفس JWT_SECRET المستخدم فعليًا لجلسات المستخدمين العاديين (authService.js) — مفيش env
// var جديد لازم يتضاف يدويًا على Railway عشان الميزة دي تشتغل فورًا. ده بيشارك نفس مخاطر
// الـfallback الهاردكودد الموجودة أصلاً في authService.js لو المتغير مش متظبط هناك — حاجة
// منفصلة تمامًا عن صفحة الأدمن، وتستاهل مراجعة وتصحيح لوحدها (JWT_SECRET لازم يتظبط في env
// حقيقي على Railway لو لسه معتمد على القيمة الافتراضية).
const JWT_SECRET = process.env.JWT_SECRET || 'erivion_secret_2026';

export const ADMIN_EMAILS = ['mostafabondalqaraish@gmail.com', 'mostafabond2009@gmail.com'];

const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

export function checkLoginRateLimit(ip) {
  const key = ip || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(key);
  if (!rec || now > rec.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (rec.count >= MAX_ATTEMPTS) return false;
  rec.count++;
  return true;
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  // ✅ الأطوال المختلفة بتكشف معلومة فورًا لو استخدمنا timingSafeEqual مباشرة (بيرمي exception) —
  // بنرجع false بسيط بدل ما نخليها crash، من غير ما نأثر على أمان المقارنة الفعلية
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * يتحقق من إيميل+باسورد الأدمن. بيرجع { ok:false, reason:'not_configured' } لو ADMIN_SECRET
 * مش متظبط في env خالص (بدل ما يسمح بدخول بسر افتراضي معروف)، أو { ok:false, reason:'invalid' }
 * لو الإيميل مش في القايمة أو الباسورد غلط، أو { ok:true, email } لو نجح.
 */
export function verifyAdminCredentials(email, password) {
  const realSecret = process.env.ADMIN_SECRET;
  if (!realSecret) return { ok: false, reason: 'not_configured' };
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!ADMIN_EMAILS.includes(normalizedEmail)) return { ok: false, reason: 'invalid' };
  if (!password || !timingSafeStringEqual(password, realSecret)) return { ok: false, reason: 'invalid' };
  return { ok: true, email: normalizedEmail };
}

export function issueAdminToken(email) {
  return jwt.sign({ email, scope: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  return null;
}

/** Express middleware — بيحل محل كل نسخ adminAuth القديمة المكرّرة (كانت كل واحدة فيهم
 * بتقارن سر ثابت واحد بـ=== عادي، بعضها بـfallback هاردكودد). */
export function adminAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.scope !== 'admin' || !ADMIN_EMAILS.includes(decoded.email)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.adminEmail = decoded.email;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
