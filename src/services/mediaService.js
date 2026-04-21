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
async function fetchPexelsVideos(query, orientation, usedSet, page = 1) {
  const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=30&page=${page}&orientation=${orientation}`;
  const res = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_API_KEY },
  });
  if (!res.ok) return [];

  const data = await res.json();
  const videos = data.videos || [];

  // ✅ بنفلتر: نشيل أي فيديو كل files بتاعته اتستخدمت
  return videos.filter(v => {
    const hdFile = v.video_files?.find(f => f.quality === 'hd');
    const sdFile = v.video_files?.find(f => f.quality === 'sd');
    const anyFile = hdFile || sdFile || v.video_files?.[0];
    return anyFile && !usedSet.has(anyFile.link);
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
export async function fetchMediaForScene(keywords, ratio = '16:9', jobId = null) {
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
  // ✅ نجرب الكلمتين الأولى مع بعض، ثم كل واحدة لوحدها، ثم fallback
  const queriesToTry = [
    kwList.slice(0, 2).join(' '),          // "motivation success"
    kwList[0],                              // "motivation"
    kwList[1],                              // "success"
    getRandomFallback(kwList),             // كلمة عشوائية
    getRandomFallback([...kwList, 'business']), // كلمة عشوائية تانية
  ].filter(Boolean).filter((q, i, arr) => arr.indexOf(q) === i); // نشيل التكرار

  // ✅ نجرب فيديو أول مع كل query
  for (const query of queriesToTry) {
    try {
      // ✅ نجرب صفحتين مختلفتين عشوائيين لنتائج أكتر تنوعاً
      const page1 = Math.floor(Math.random() * 3) + 1;
      const page2 = page1 === 1 ? 2 : 1;

      let videos = await fetchPexelsVideos(query, orientation, usedSet, page1);
      if (videos.length < 3) {
        // لو نتائج قليلة، نضيف من صفحة تانية
        const extra = await fetchPexelsVideos(query, orientation, usedSet, page2);
        videos = [...videos, ...extra];
      }

      if (videos.length > 0) {
        // ✅ نختار عشوائي من كل النتائج مش بس أول 5
        const video = videos[Math.floor(Math.random() * videos.length)];

        // ✅ نختار أفضل file مناسب للـ ratio
        const hdFile = video.video_files?.find(f => f.quality === 'hd');
        const sdFile = video.video_files?.find(f => f.quality === 'sd');
        const file = hdFile || sdFile || video.video_files?.[0];

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