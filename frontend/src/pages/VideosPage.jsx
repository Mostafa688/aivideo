import React, { useState, useEffect } from 'react';
import { downloadRemoteFile } from '../utils/download.js';

const RATIO_STYLE = {
  '16:9': { maxWidth: 560, aspectRatio: '16/9' },
  '9:16': { maxWidth: 280, aspectRatio: '9/16' },
  '1:1':  { maxWidth: 400, aspectRatio: '1/1' },
};

// ✅ FIX 3: بنبني الـ URL الصح للفيديو
// المشكلة كانت إن video.filename بييجي كاسم ملف بس مش كـ URL كامل
const getVideoUrl = (filename) => {
  if (!filename) return '';
  if (filename.startsWith('http')) return filename;
  if (filename.startsWith('/outputs/')) return filename;
  return '/outputs/' + filename;
};

export default function VideosPage({ onClose }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const token = () => localStorage.getItem('token');

  const loadVideos = () => {
    setLoading(true);
    fetch('/api/auth/videos', {
      headers: { Authorization: 'Bearer ' + token() }
    })
      .then(r => r.json())
      .then(data => { setVideos(data.videos || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadVideos(); }, []);

  const handleDelete = async (videoId, e) => {
    e.stopPropagation();
    if (!(await confirmDialog({ title: 'Delete this video?', message: 'This cannot be undone.', confirmText: 'Delete', cancelText: 'Cancel', tone: 'danger', dir: 'ltr' }))) return;
    setDeleting(videoId);
    try {
      await fetch('/api/auth/videos/' + videoId, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + token() },
      });
      setVideos(v => v.filter(x => x.id !== videoId));
      if (selected?.id === videoId) setSelected(null);
    } catch {}
    setDeleting(null);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(0) + ' KB';
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>←</button>
        <h2 style={{ fontSize: 17, fontWeight: 600, flex: 1 }}>My Videos</h2>
        <span style={{ fontSize: 13, color: 'var(--text3)' }}>{videos.length} video{videos.length !== 1 ? 's' : ''}</span>
        <button onClick={loadVideos}
          style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text3)', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          ↻ Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>

        {loading && (
          <p style={{ color: 'var(--text3)', textAlign: 'center', marginTop: 60 }}>Loading...</p>
        )}

        {!loading && videos.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🎬</div>
            <p style={{ color: 'var(--text3)', fontSize: 15, fontWeight: 500 }}>No videos yet</p>
            <p style={{ color: 'var(--text3)', fontSize: 13, marginTop: 6 }}>Create your first video to see it here</p>
            <button onClick={onClose}
              style={{ marginTop: 20, background: 'var(--accent)', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Create Video
            </button>
          </div>
        )}

        {!loading && videos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 680, margin: '0 auto' }}>
            {videos.map(video => {
              const isSelected = selected?.id === video.id;
              const ratioKey = video.ratio || '16:9';
              const rStyle = RATIO_STYLE[ratioKey] || RATIO_STYLE['16:9'];

              return (
                <div key={video.id}
                  onClick={() => setSelected(isSelected ? null : video)}
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)'),
                    borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    transition: 'border-color 0.2s',
                  }}>

                  {/* Video List Item */}
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 60, height: 44, borderRadius: 8, overflow: 'hidden',
                      background: '#000', flexShrink: 0, position: 'relative',
                    }}>
                      <video
                        src={getVideoUrl(video.filename)}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        muted preload="metadata"
                        onLoadedMetadata={e => { e.target.currentTime = 1; }}
                      />
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.3)' }}>
                        <span style={{ fontSize:14, color:'#fff' }}>▶</span>
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {video.title || 'Untitled Video'}
                      </p>
                      <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        {formatDate(video.created_at)}
                        {video.ratio && <span style={{ marginLeft: 8, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4, fontSize: 11 }}>{video.ratio}</span>}
                        {video.duration && <span style={{ marginLeft: 6, fontSize: 11 }}>{video.duration}</span>}
                        {video.file_size && <span style={{ marginLeft: 6, color: 'var(--text3)', fontSize: 11 }}>{formatSize(video.file_size)}</span>}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        onClick={(e) => handleDelete(video.id, e)}
                        disabled={deleting === video.id}
                        style={{
                          background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.2)',
                          color: 'var(--red)', padding: '4px 10px', borderRadius: 8, fontSize: 12,
                          cursor: 'pointer', opacity: deleting === video.id ? 0.5 : 1,
                        }}>
                        {deleting === video.id ? '...' : '🗑️'}
                      </button>
                      <span style={{ fontSize: 13, color: 'var(--text3)' }}>{isSelected ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* ✅ FIX 4: Video Player بالـ aspect ratio الصح */}
                  {isSelected && (
                    <div style={{ padding: '0 16px 16px' }}>
                      <div style={{
                        width: '100%',
                        maxWidth: rStyle.maxWidth,
                        aspectRatio: rStyle.aspectRatio,
                        margin: '0 auto',
                        borderRadius: 10,
                        overflow: 'hidden',
                        background: '#000',
                        border: '1px solid var(--border)',
                      }}>
                        <video
                          src={getVideoUrl(video.filename)}
                          controls
                          playsInline
                          preload="metadata"
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); downloadRemoteFile(getVideoUrl(video.filename), video.filename || 'erivion-video.mp4'); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'center', marginTop: 10,
                          background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                          padding: '10px', borderRadius: 8, fontWeight: 600,
                          fontSize: 13,
                        }}>
                        ⬇️ Download Video
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}