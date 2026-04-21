import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { execSync } from 'child_process';

const OUTPUTS_DIR = 'outputs';
const TEMP_DIR = 'temp';

// ✅ FIX 5: orientation صح لكل ratio
const RATIO_ORIENTATION = {
  '16:9': 'landscape',
  '9:16': 'portrait',
  '1:1':  'square',
};

// ✅ FIX 5: dimensions صح لكل ratio
const RATIO_DIMS = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1':  { w: 1080, h: 1080 },
};

async function fetchPexelsImage(keywords, ratio = '16:9') {
  const orientation = RATIO_ORIENTATION[ratio] || 'landscape';
  const query = (keywords || []).slice(0, 2).join(' ') || 'nature';
  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=${orientation}`,
    { headers: { Authorization: process.env.PEXELS_API_KEY } }
  );
  if (!res.ok) throw new Error('Pexels error: ' + res.status);
  const data = await res.json();
  const photos = data.photos || [];
  if (!photos.length) throw new Error('No photos found');
  const photo = photos[Math.floor(Math.random() * photos.length)];
  return photo.src.large2x || photo.src.large;
}

// ✅ FIX 5: بنبعت ratio وبنعمل crop صح مش pad
export async function generateAIVideo(scene, sceneIndex, ratio = '16:9') {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  await mkdir(TEMP_DIR, { recursive: true });

  const { w, h } = RATIO_DIMS[ratio] || RATIO_DIMS['16:9'];
  const imgFile = path.join(TEMP_DIR, `ai_img_${sceneIndex}_${Date.now()}.jpg`);
  const videoFile = path.join(OUTPUTS_DIR, `ai_scene_${sceneIndex}_${Date.now()}.mp4`);

  const imageUrl = await fetchPexelsImage(scene.keywords, ratio);
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error('Image download failed: ' + res.status);

  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(imgFile, Buffer.from(arrayBuffer));

  // ✅ FIX 5: crop بدل pad - يملا الـ frame بالمقاس الصح
  // ✅ FIX 4: preset ultrafast للسرعة
  const scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const ffmpegCmd = `ffmpeg -loop 1 -i "${imgFile}" -vf "${scaleFilter},zoompan=z='min(zoom+0.0015,1.5)':d=100:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2),setsar=1" -t 4 -r 25 -crf 18 -preset ultrafast -pix_fmt yuv420p -y "${videoFile}"`;

  execSync(ffmpegCmd, { stdio: 'pipe' });
  try { fs.unlinkSync(imgFile); } catch {}

  return path.basename(videoFile);
}

// ✅ بنبعت ratio لكل مشهد
export async function generateAllAIScenes(scenes, send, ratio = '16:9') {
  const results = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    try {
      send('ai_progress', { index: i + 1, total: scenes.length, status: 'generating' });
      const videoFile = await generateAIVideo(scene, i + 1, ratio);
      results.push({
        ...scene,
        media: { type: 'video', url: null, aiGenerated: true },
        aiVideo: '/outputs/' + videoFile
      });
      send('ai_progress', { index: i + 1, total: scenes.length, status: 'done' });
    } catch (err) {
      console.error('AI scene error:', err.message);
      results.push({ ...scene, aiVideo: null });
    }
  }
  return results;
}