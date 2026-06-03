import axios from 'axios';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || 'rpa_PXWDA0HK9T4ATKWT3RJRPQIYVLLFXXCW5V5LW3Y21fu90f';
const ENDPOINT_ID = process.env.RUNPOD_WAN_ENDPOINT_ID || 'jcncz22yyxr3h3';
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${ENDPOINT_ID}`;

const runpodHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${RUNPOD_API_KEY}`
};

export async function generateWanVideo({ prompt, negative_prompt = '', num_frames = 33, guidance_scale = 5.0, num_inference_steps = 50, width = 832, height = 480 }) {
  // Submit job
  const submitRes = await axios.post(`${RUNPOD_BASE_URL}/run`, {
    input: { prompt, negative_prompt, num_frames, guidance_scale, num_inference_steps, width, height }
  }, { headers: runpodHeaders });

  const jobId = submitRes.data.id;
  if (!jobId) throw new Error('No job ID returned from RunPod');

  // Poll for result
  let attempts = 0;
  const maxAttempts = 120;

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));

    const statusRes = await axios.get(`${RUNPOD_BASE_URL}/status/${jobId}`, { headers: runpodHeaders });
    const { status, output } = statusRes.data;

    if (status === 'COMPLETED') {
      if (output && output.video_url) return { success: true, videoUrl: output.video_url };
      throw new Error('Job completed but no video URL returned');
    }

    if (status === 'FAILED') throw new Error(statusRes.data.error || 'RunPod job failed');

    attempts++;
  }

  throw new Error('Job timed out after 10 minutes');
}