// renderWorker.js — runs as a child process via child_process.fork()
// Receives job via IPC message, runs renderVideo, sends result back

import { renderVideo } from './services/renderService.js';

process.on('message', async (job) => {
  try {
    const videoPath = await renderVideo(job);
    process.send({ success: true, videoPath });
  } catch (err) {
    process.send({ success: false, error: err.message || 'Render failed' });
  }
});

// Safety: exit if parent dies
process.on('disconnect', () => process.exit(0));
