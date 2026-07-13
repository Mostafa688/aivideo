import fetch from 'node-fetch';

const RATIO_ORIENTATION = {
  '16:9': 'landscape',
  '9:16': 'portrait',
  '1:1':  'square',
};

// ✅ FIX: بدل Set عالمي واحد، كل job عنده Set خاص بيه
//    ده بيحل مشكلة الـ concurrent requests اللي بتخرب الـ Set المشترك
const jobSets = new Map();

export function createJobSet(jobId) {
  const set = new Set();
  jobSets.set(String(jobId), set);
  return set;
}

export function getJobSet(jobId) {
  return jobSets.get(String(jobId)) || null;
}

export function clearJobSet(jobId) {
  jobSets.delete(String(jobId));
}

// ✅ للتوافق مع الكود القديم (بيستخدم resetUsedVideos في index.js)
//    دلوقتي مش بنمسح حاجة عالمية - بس بنعمل job set جديد
let _legacyJobId = null;
export function resetUsedVideos(jobId) {
  if (jobId) {
    createJobSet(jobId);
  } else {
    // legacy: نعمل job id مؤقت
    _legacyJobId = 'legacy_' + Date.now();
    createJobSet(_legacyJobId);
  }
}

// ✅ FIX: بحث Pexels نصي حرفي، مش semantic — جملة طويلة كاملة كـ query بتشتت النتائج.
// بناخد أهم كام كلمة بس (بعد شيل كلمات الوصل الشائعة) عشان الاستعلام يفضل قريب من المعنى
// من غير ما يطول أوي ويرجع نتائج عشوائية.
const STOPWORDS = new Set(['a','an','the','is','are','was','were','in','on','at','to','of','and','or','with','for','this','that','it','its','his','her','their','as','by','from','into','over','under','while','then','so','but']);
function toSearchPhrase(text, maxWords = 6) {
  if (!text) return null;
  const words = String(text).replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)
    .filter(w => !STOPWORDS.has(w.toLowerCase()));
  return words.slice(0, maxWords).join(' ') || null;
}

// ✅ FALLBACK KEYWORDS: لو الكلمة ما لاقتش نتائج كافية نجرب كلمات بديلة
const FALLBACK_KEYWORDS = [
  'business', 'technology', 'nature', 'city', 'people',
  'travel', 'background', 'abstract', 'office', 'sky',
  'ocean', 'mountain', 'forest', 'urban', 'modern',
];

function getRandomFallback(exclude = []) {
  const available = FALLBACK_KEYWORDS.filter(k => !exclude.includes(k));
  return available[Math.floor(Math.random() * available.length)] || 'nature';
}

// ✅ FIX الرئيسي: بنجيب per_page=30 بدل 10، وبنعمل page عشوائي
//    وبنتحقق من كل الـ video_files مش بس أول file
// ✅ بنختار الـ video file المناسب للـ ratio بناءً على الـ width/height الفعلي
// Target aspect ratios
const ORIENTATION_RATIO = {
  landscape: 16 / 9,
  portrait:  9 / 16,
  square:    1,
};

function pickBestFile(video_files, orientation) {
  if (!video_files?.length) return null;

  const targetRatio = ORIENTATION_RATIO[orientation] || 16 / 9;
  const TOLERANCE   = 0.05; // 5% tolerance — strict ratio match

  // فلتر صارم: نشيل أي فيديو نسبته بعيدة عن الـ target
  const matching = video_files.filter(f => {
    if (!f.width || !f.height) return false;
    const fileRatio = f.width / f.height;
    return Math.abs(fileRatio - targetRatio) / targetRatio < TOLERANCE;
  });

  const pool = matching.length > 0 ? matching : video_files;

  // نختار hd أولاً ثم sd
  return pool.find(f => f.quality === 'hd')
    || pool.find(f => f.quality === 'sd')
    || pool[0];
}

async function fetchPexelsVideos(query, orientation, usedSet, page = 1) {
  const minWidth = orientation === 'portrait' ? 720 : 1280;
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=30&page=${page}&orientation=${orientation}&min_width=${minWidth}`;
  const res = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!res.ok) return [];

  const data = await res.json();
  const videos = data.videos || [];

  // ✅ بنفلتر: نشيل أي فيديو مفيش فيه file مناسب للـ orientation أو اتستخدم
  return videos.filter(v => {
    const file = pickBestFile(v.video_files, orientation);
    return file && !usedSet.has(file.link);
  });
}

async function fetchPexelsImages(query, orientation, usedSet) {
  const page = Math.floor(Math.random() * 5) + 1; // صفحة عشوائية 1-5
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20&page=${page}&orientation=${orientation}`;
  const res = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.photos || []).filter(p => {
    const imgUrl = p.src?.large2x || p.src?.large;
    return imgUrl && !usedSet.has(imgUrl);
  });
}

// ✅ الدالة الرئيسية - بتقبل jobId أو usedSet مباشرة
export async function fetchMediaForScene(keywords, ratio = '16:9', jobId = null, visual = null) {
  const orientation = RATIO_ORIENTATION[ratio] || 'landscape';

  // نجيب الـ Set الخاص بالـ job ده
  let usedSet;
  if (jobId) {
    usedSet = jobSets.get(String(jobId)) || new Set();
  } else if (_legacyJobId) {
    usedSet = jobSets.get(_legacyJobId) || new Set();
  } else {
    usedSet = new Set(); // fallback لو مفيش job
  }

  const kwList = (keywords || []).filter(Boolean);
  // ✅ Use the scene's actual narration/visual text (trimmed to a short relevant phrase) as the
  // primary query — this is what actually reflects what the scene is ABOUT, not just a generic tag
  const visualPhrase = toSearchPhrase(visual);
  const queriesToTry = [
    visualPhrase,                           // trimmed scene text — most meaningful signal
    kwList[0],                              // visual description (most specific)
    kwList.slice(0, 2).join(' '),          // combine first two
    kwList[1],                              // second keyword
    kwList[2],                              // third keyword
    getRandomFallback(kwList),             // random fallback
  ].filter(Boolean).filter((q, i, arr) => arr.indexOf(q) === i);

  // ✅ نجرب فيديو أول مع كل query
  for (const query of queriesToTry) {
    try {
      // ✅ FIX: كانت بتختار صفحة أساسية عشوائية بين 1-3 — صفحة 2/3 أقل ارتباطًا بالاستعلام
      // من صفحة 1 حسب ترتيب Pexels نفسه، فده كان بيقلل الصلة بالموضوع لصالح "تنويع" مش مضمون.
      // دلوقتي صفحة 1 (الأعلى ارتباطًا) هي الأساس دايمًا، وصفحة 2 بس تكملة لو النتائج قليلة.
      let videos = await fetchPexelsVideos(query, orientation, usedSet, 1);
      if (videos.length < 3) {
        // لو نتائج قليلة، نضيف من صفحة تانية
        const extra = await fetchPexelsVideos(query, orientation, usedSet, 2);
        videos = [...videos, ...extra];
      }

      if (videos.length > 0) {
        // ✅ FIX: كان بيختار عشوائي من كل الـ pool (لحد 60 فيديو من صفحتين) — ده كان بيدي
        // نفس الوزن لفيديو رقم 60 (بعيد جدًا عن الاستعلام) زي فيديو رقم 1 (الأنسب حسب ترتيب
        // Pexels نفسه). دلوقتي بنفضل التنويع بس جوه أعلى النتائج ارتباطًا بالموضوع.
        const TOP_N = Math.min(5, videos.length);
        const video = videos[Math.floor(Math.random() * TOP_N)];

        // ✅ نختار أفضل file مناسب للـ ratio والـ orientation الفعلي
        const file = pickBestFile(video.video_files, orientation);

        if (file && !usedSet.has(file.link)) {
          usedSet.add(file.link);
          console.log(`[Media] ✅ Video found: "${query}" → ${file.link.substring(0, 60)}...`);
          return { type: 'video', url: file.link };
        }
      }
    } catch (err) {
      console.warn(`[Media] Video fetch failed for "${query}":`, err.message);
    }
  }

  // ✅ Fallback لصور لو مفيش فيديو
  for (const query of queriesToTry) {
    try {
      const photos = await fetchPexelsImages(query, orientation, usedSet);
      if (photos.length > 0) {
        const photo = photos[Math.floor(Math.random() * photos.length)];
        const imgUrl = photo.src?.large2x || photo.src?.large;
        if (imgUrl) {
          usedSet.add(imgUrl);
          console.log(`[Media] 🖼️ Image fallback: "${query}"`);
          return { type: 'image', url: imgUrl };
        }
      }
    } catch (err) {
      console.warn(`[Media] Image fetch failed for "${query}":`, err.message);
    }
  }

  console.warn('[Media] ⚠️ No media found, using color slide');
  return { type: 'color', url: null };
}