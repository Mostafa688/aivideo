// ── newImageModelsService.js ─────────────────────────────────────────────────
// Phase 3: the new Replicate image-generation models the client asked to add
// (Nano Banana family, Grok Image, GPT-Image, Seedream 4/5) — separate from
// the existing Model 1-8 image/video pipelines, which are untouched.
//
// Model slugs and input schemas below are confirmed against each model's own
// Replicate page as of Sept 2026. "Nano Banana Lite" is intentionally absent —
// it's only available on fal.ai, not Replicate, so it isn't wired here even
// though it's priced in creditPricingEngine.js for the client's reference table.

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const MAX_BATCH = 20; // client's explicit ask: up to 20 images per generation

function authHeaders() {
  return { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}`, 'Content-Type': 'application/json', 'Prefer': 'wait' };
}

// Seedream uses named size enums instead of an "aspect_ratio" field — mapping
// is best-effort from the model's documented options, verify against the live
// schema (replicate.com/bytedance/seedream-4/api/schema) before relying on it.
function aspectRatioToSeedreamSize(aspectRatio) {
  const map = {
    '1:1': 'square', '9:16': 'portrait_16_9', '16:9': 'landscape_16_9',
    '3:4': 'portrait_4_3', '4:3': 'landscape_4_3',
    '2:3': 'portrait_3_2', '3:2': 'landscape_3_2', '21:9': 'landscape_21_9',
  };
  return map[aspectRatio] || 'square';
}

// Each entry: real Replicate slug, how to build its input object from our
// common params, and whether the model can generate a batch in one call.
export const NEW_IMAGE_MODELS = {
  nano_banana: {
    slug: 'google/nano-banana',
    buildInput: ({ prompt, referenceImageUrls, aspectRatio }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16',
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 14) } : {}),
    }),
  },
  nano_banana_2: {
    slug: 'google/nano-banana-2',
    buildInput: ({ prompt, referenceImageUrls, aspectRatio }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', output_format: 'jpg',
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 14) } : {}),
    }),
  },
  nano_banana_pro: {
    slug: 'google/nano-banana-pro',
    buildInput: ({ prompt, referenceImageUrls, aspectRatio }) => ({
      prompt, aspect_ratio: aspectRatio || '9:16', output_format: 'jpg',
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 14) } : {}),
    }),
  },
  grok_image: {
    slug: 'xai/grok-imagine-image',
    buildInput: ({ prompt, aspectRatio }) => ({ prompt, aspect_ratio: aspectRatio || '9:16' }),
  },
  gpt_image: {
    slug: 'openai/gpt-image-1',
    nativeBatchParam: 'number_of_images',
    maxNativeBatch: 10,
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, count }) => ({
      prompt, aspect_ratio: aspectRatio || '1:1', quality: 'standard',
      number_of_images: Math.min(Math.max(1, count || 1), 10),
      ...(referenceImageUrls?.length ? { input_images: referenceImageUrls } : {}),
    }),
  },
  seedream_4: {
    slug: 'bytedance/seedream-4',
    nativeBatchParam: 'max_images',
    maxNativeBatch: 6,
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, count }) => ({
      prompt, image_size: aspectRatioToSeedreamSize(aspectRatio),
      max_images: Math.min(Math.max(1, count || 1), 6),
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 10) } : {}),
    }),
  },
  seedream_5: {
    slug: 'bytedance/seedream-5-pro',
    nativeBatchParam: 'max_images',
    maxNativeBatch: 6,
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, count }) => ({
      prompt, image_size: aspectRatioToSeedreamSize(aspectRatio),
      max_images: Math.min(Math.max(1, count || 1), 6),
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 10) } : {}),
    }),
  },
  seedream_5_lite: {
    slug: 'bytedance/seedream-5-lite',
    nativeBatchParam: 'max_images',
    maxNativeBatch: 6,
    buildInput: ({ prompt, referenceImageUrls, aspectRatio, count }) => ({
      prompt, image_size: aspectRatioToSeedreamSize(aspectRatio),
      max_images: Math.min(Math.max(1, count || 1), 6),
      ...(referenceImageUrls?.length ? { image_input: referenceImageUrls.slice(0, 10) } : {}),
    }),
  },
};

async function withRetry429(fn, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = /429|throttled|rate limit/i.test(err.message || '');
      if (!is429 || attempt === maxRetries) throw err;
      let waitSec = 18;
      const m = /retry_after["\s:]+(\d+(\.\d+)?)/i.exec(err.message || '');
      if (m) waitSec = Math.max(parseFloat(m[1]) + 3, 8);
      console.warn(`[NewImageModels] 429 rate limited, retrying in ${waitSec}s (attempt ${attempt + 1}/${maxRetries})...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
    }
  }
}

async function pollPrediction(predictionId, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed' || data.status === 'canceled') throw new Error(`${label} failed: ${data.error}`);
  }
  throw new Error(`${label} timed out`);
}

async function runPrediction(slug, input, label) {
  return withRetry429(async () => {
    const res = await fetch(`https://api.replicate.com/v1/models/${slug}/predictions`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ input }),
    });
    if (!res.ok) throw new Error(`${label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (data.error) throw new Error(`${label}: ${data.error}`);
    let output = data.status === 'succeeded' ? data.output : null;
    if (!output && data.id) output = await pollPrediction(data.id, 120000, label);
    if (!output) throw new Error(`${label} returned no output`);
    return Array.isArray(output) ? output : [output];
  });
}

// Runs `tasks` (thunks) with at most `limit` in flight at once.
async function runWithConcurrency(tasks, limit = 4) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Generates `count` images (up to 20) with the given model, returning a flat
 * array of image URLs. Uses the model's native batch parameter when it has
 * one (GPT-Image, Seedream family); otherwise runs one prediction per image
 * with limited concurrency.
 */
export async function generateNewModelImages({ modelKey, prompt, referenceImageUrls = [], aspectRatio = '9:16', count = 1 }) {
  if (!REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not set');
  const model = NEW_IMAGE_MODELS[modelKey];
  if (!model) throw new Error(`Unknown image model: ${modelKey}`);
  if (!prompt?.trim()) throw new Error('prompt is required');
  const total = Math.min(Math.max(1, count || 1), MAX_BATCH);
  const label = `${modelKey} image generation`;

  if (model.nativeBatchParam) {
    const chunks = [];
    let remaining = total;
    while (remaining > 0) {
      const chunkSize = Math.min(remaining, model.maxNativeBatch);
      chunks.push(chunkSize);
      remaining -= chunkSize;
    }
    const results = await runWithConcurrency(
      chunks.map(chunkSize => () => runPrediction(model.slug, model.buildInput({ prompt, referenceImageUrls, aspectRatio, count: chunkSize }), label)),
      3
    );
    return results.flat();
  }

  const results = await runWithConcurrency(
    Array.from({ length: total }, () => () => runPrediction(model.slug, model.buildInput({ prompt, referenceImageUrls, aspectRatio }), label)),
    4
  );
  return results.flat();
}
