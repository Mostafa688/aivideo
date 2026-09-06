import React, { useEffect, useState } from 'react';
import { downloadRemoteFile } from '../utils/download.js';

export default function HistoryPage({ onBack }) {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('ai_video_history');
    if (saved) setVideos(JSON.parse(saved));
  }, []);

  const deleteVideo = (index) => {
    const updated = videos.filter((_, i) => i !== index);
    setVideos(updated);
    localStorage.setItem('ai_video_history', JSON.stringify(updated));
  };

  return (
    <div style={{ minHeight: '100vh', maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
        <button className="btn-ghost" onClick={onBack} style={{ padding: '8px 14px' }}>Back</button>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>My videos</h1>
      </div>

      {videos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>V</div>
          <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>No videos yet</p>
          <p style={{ fontSize: 14 }}>Create your first video to see it here</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {videos.map((video, i) => (
            <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px', display: 'flex', gap: 16, alignItems: 'center' }}>
              <video src={video.url} style={{ width: 120, height: 68, borderRadius: 8, objectFit: 'cover', background: 'var(--bg4)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.title || 'Untitled video'}</p>
                <p style={{ fontSize: 12, color: 'var(--text3)' }}>{new Date(video.date).toLocaleDateString()}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => downloadRemoteFile(video.url, 'erivion-video.mp4')} style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 8, fontSize: 13, fontWeight: 500 }}>Download</button>
                <button onClick={() => deleteVideo(i)} style={{ padding: '8px 14px', background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.2)', color: 'var(--red)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}