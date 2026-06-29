import React, { useState, useEffect, useRef } from 'react';

// ─── Mock seed posts (shown when backend has no posts yet) ────────────────────
const SEED_POSTS = [
  {
    id: 'seed_1',
    author: 'Ahmed K.',
    avatar_letter: 'A',
    avatar_color: '#7c6af7',
    plan: 'Pro',
    content: 'Just made my first historical video about the Ottoman Empire using Model 4 Seedance — the quality is insane! 🎬 The AI-generated scenes look genuinely cinematic. Anyone else using it for history content?',
    image_url: null,
    likes: 47,
    liked: false,
    comments: [
      { id: 'c1', author: 'Sara M.', letter: 'S', color: '#06b6d4', text: 'Yes! I use it for educational content. The Arabic voiceover is super natural 🔥', time: '2h ago' },
      { id: 'c2', author: 'Omar T.', letter: 'O', color: '#f59e0b', text: 'Which model do you recommend for history specifically?', time: '1h ago' },
    ],
    tag: 'Showcase',
    tag_color: '#7c6af7',
    time: '3 hours ago',
    seed: true,
  },
  {
    id: 'seed_2',
    author: 'Nour H.',
    avatar_letter: 'N',
    avatar_color: '#10b981',
    plan: 'Plus',
    content: '💡 Pro tip: When writing your script for Model 3 AI Images, use very descriptive scene prompts like "cinematic close-up of ancient Egyptian temple at golden hour" — the results are stunning compared to simple prompts.',
    image_url: null,
    likes: 83,
    liked: false,
    comments: [
      { id: 'c3', author: 'Khalid A.', letter: 'K', color: '#e11d48', text: 'This is exactly what I needed! My prompts were too vague. Thanks 🙏', time: '5h ago' },
      { id: 'c4', author: 'Ramy S.', letter: 'R', color: '#a855f7', text: 'Game changer tip. The difference is night and day when you describe the lighting and mood.', time: '4h ago' },
      { id: 'c5', author: 'Ahmed K.', letter: 'A', color: '#7c6af7', text: 'Agreed! I also add "4K ultra detailed" to every scene prompt 😄', time: '3h ago' },
    ],
    tag: 'Tips',
    tag_color: '#06b6d4',
    time: '6 hours ago',
    seed: true,
  },
  {
    id: 'seed_3',
    author: 'Ramy S.',
    avatar_letter: 'R',
    avatar_color: '#a855f7',
    plan: 'Max',
    content: 'Made 12 videos this week using Erivion. My YouTube channel grew from 800 to 2,400 subscribers in one month! Consistency is everything — the platform makes it so easy to batch produce content. 📈',
    image_url: null,
    likes: 124,
    liked: false,
    comments: [
      { id: 'c6', author: 'Nour H.', letter: 'N', color: '#10b981', text: 'That growth is incredible! What niche are you in?', time: '1d ago' },
      { id: 'c7', author: 'Sara M.', letter: 'S', color: '#06b6d4', text: 'Wow 12 videos in a week! How long does each one take you?', time: '23h ago' },
    ],
    tag: 'Success',
    tag_color: '#10b981',
    time: '1 day ago',
    seed: true,
  },
  {
    id: 'seed_4',
    author: 'Sara M.',
    avatar_letter: 'S',
    avatar_color: '#06b6d4',
    plan: 'Pro',
    content: '🗺️ The Atlas Map model is perfect for geography and history videos! Just made a video about the spread of the Roman Empire and the animated map looks incredibly professional. Highly recommend trying it!',
    image_url: null,
    likes: 56,
    liked: false,
    comments: [
      { id: 'c8', author: 'Omar T.', letter: 'O', color: '#f59e0b', text: 'Is it free to use the map model? Just checked and it says FREE on the model card!', time: '2d ago' },
      { id: 'c9', author: 'Sara M.', letter: 'S', color: '#06b6d4', text: '@Omar yes it\'s completely free! One of the best features on the platform 🎉', time: '2d ago' },
    ],
    tag: 'Showcase',
    tag_color: '#7c6af7',
    time: '2 days ago',
    seed: true,
  },
  {
    id: 'seed_5',
    author: 'Khalid A.',
    avatar_letter: 'K',
    avatar_color: '#e11d48',
    plan: 'Free',
    content: 'Question for the community: What\'s the best video length for YouTube Shorts vs regular YouTube videos? I\'ve been doing 30s shorts and 2min regular but not sure if I should go longer.',
    image_url: null,
    likes: 31,
    liked: false,
    comments: [
      { id: 'c10', author: 'Ramy S.', letter: 'R', color: '#a855f7', text: 'For Shorts: 30-45s is sweet spot. For YouTube: 8-12 mins for max watch time revenue.', time: '3d ago' },
      { id: 'c11', author: 'Nour H.', letter: 'N', color: '#10b981', text: 'Depends on niche too. History/education does better at 5-10 mins. Motivation can be 1-3 mins.', time: '3d ago' },
    ],
    tag: 'Question',
    tag_color: '#f59e0b',
    time: '3 days ago',
    seed: true,
  },
  {
    id: 'seed_6',
    author: 'Omar T.',
    avatar_letter: 'O',
    avatar_color: '#f59e0b',
    plan: 'Plus',
    content: 'Sharing my workflow: I use Erivion for the video, then add custom thumbnails in Canva, schedule with TubeBuddy, and reply to comments with AI. Full automation pipeline! 🚀 Monthly revenue went from $0 to $800 in 3 months.',
    image_url: null,
    likes: 98,
    liked: false,
    comments: [
      { id: 'c12', author: 'Ahmed K.', letter: 'A', color: '#7c6af7', text: 'Can you share more about the thumbnail workflow? Canva templates?', time: '4d ago' },
      { id: 'c13', author: 'Khalid A.', letter: 'K', color: '#e11d48', text: '$800/month is amazing! How many videos per week?', time: '4d ago' },
    ],
    tag: 'Workflow',
    tag_color: '#a855f7',
    time: '4 days ago',
    seed: true,
  },
];

const TAGS = ['All', 'Showcase', 'Tips', 'Question', 'Workflow', 'Success'];
const TAG_COLORS = {
  Showcase: '#7c6af7', Tips: '#06b6d4', Question: '#f59e0b',
  Workflow: '#a855f7', Success: '#10b981', All: '#6b7280',
};

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

function Avatar({ letter, color, size = 36, img }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: img ? 'transparent' : `linear-gradient(135deg,${color},${color}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.38, fontWeight: 800, color: '#fff', flexShrink: 0, overflow: 'hidden', border: `2px solid ${color}44` }}>
      {img ? <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : letter}
    </div>
  );
}

function PostCard({ post, currentUser, onLike, onComment, onDelete, onAskSupport }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [imgExpanded, setImgExpanded] = useState(false);

  const handleComment = async () => {
    if (!commentText.trim() || !currentUser) return;
    setSubmitting(true);
    await onComment(post.id, commentText.trim());
    setCommentText('');
    setSubmitting(false);
    setShowComments(true);
  };

  const planColors = { Free: '#6b7280', Pro: '#7c6af7', Plus: '#06b6d4', Max: '#f59e0b' };

  return (
    <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden', transition: 'border-color 0.2s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(124,106,247,0.25)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}>

      {/* Header */}
      <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Avatar letter={post.avatar_letter} color={post.avatar_color} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{post.author}</span>
            {post.plan && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: `${planColors[post.plan] || '#6b7280'}18`, border: `1px solid ${planColors[post.plan] || '#6b7280'}44`, color: planColors[post.plan] || '#6b7280', letterSpacing: '0.06em' }}>
                {post.plan.toUpperCase()}
              </span>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: `${TAG_COLORS[post.tag] || '#6b7280'}18`, border: `1px solid ${TAG_COLORS[post.tag] || '#6b7280'}30`, color: TAG_COLORS[post.tag] || '#6b7280' }}>
              {post.tag}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#4b5563', marginTop: 2 }}>{post.time || (post.created_at ? timeAgo(post.created_at) : '')}</div>
        </div>
        {currentUser && (post.is_mine || post.seed) && (
          <button onClick={() => onDelete(post.id)} style={{ background: 'none', border: 'none', color: '#374151', cursor: 'pointer', fontSize: 16, padding: '2px 6px', borderRadius: 6, transition: 'color 0.15s' }}
            onMouseEnter={e => e.target.style.color = '#ef4444'} onMouseLeave={e => e.target.style.color = '#374151'}>✕</button>
        )}
      </div>

      {/* Moderation Status Badge — visible only to post owner */}
      {post.is_mine && post.status && post.status !== 'approved' && (
        <div style={{ margin: '12px 20px 0', padding: '10px 14px', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10,
          background: post.status === 'pending'
            ? 'rgba(245,158,11,0.08)'
            : 'rgba(239,68,68,0.08)',
          border: `1px solid ${post.status === 'pending' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>
            {post.status === 'pending' ? '⏳' : '❌'}
          </span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700,
              color: post.status === 'pending' ? '#f59e0b' : '#ef4444',
              marginBottom: post.status === 'rejected' && post.rejection_reason ? 4 : 0,
            }}>
              {post.status === 'pending'
                ? (post.is_arabic ? 'هذا المنشور قيد المراجعة' : 'This post is under review')
                : (post.is_arabic ? 'تم رفض هذا المنشور' : 'This post was rejected')}
            </div>
            {post.status === 'rejected' && post.rejection_reason && (
              <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
                {post.is_arabic ? `السبب: ${post.rejection_reason}` : `Reason: ${post.rejection_reason}`}
              </div>
            )}
          </div>
        </div>
      )}
      {post.is_mine && post.status === 'approved' && post._justApproved && (
        <div style={{ margin: '12px 20px 0', padding: '8px 14px', borderRadius: 10,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          fontSize: 12, fontWeight: 700, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 8 }}>
          ✅ {post.is_arabic ? 'تمت الموافقة على منشورك' : 'Your post has been approved'}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '14px 20px', fontSize: 14, color: '#d1d5db', lineHeight: 1.75 }}>{post.content}</div>

      {/* Image */}
      {post.image_url && (
        <div style={{ padding: '0 20px 16px' }}>
          <img src={post.image_url} alt="post" loading="lazy" onClick={() => setImgExpanded(true)}
            style={{ width: '100%', maxHeight: 360, objectFit: 'cover', borderRadius: 14, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.06)' }} />
        </div>
      )}

      {/* Actions */}
      <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', gap: 16, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 14 }}>
        <button onClick={() => onLike(post.id)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: post.liked ? 'rgba(239,68,68,0.1)' : 'transparent', border: `1px solid ${post.liked ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: '6px 14px', color: post.liked ? '#ef4444' : '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'inherit' }}>
          <span>{post.liked ? '❤️' : '🤍'}</span>
          <span>{post.likes}</span>
        </button>
        <button onClick={() => setShowComments(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, padding: '6px 14px', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'inherit' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(124,106,247,0.3)'; e.currentTarget.style.color = '#a78bfa'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#6b7280'; }}>
          <span>💬</span>
          <span>{post.comments?.length || 0} {post.comments?.length === 1 ? 'comment' : 'comments'}</span>
        </button>
        {!post.seed && !post.support_requested && (
          <button onClick={() => onAskSupport(post.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 20, padding: '6px 14px', color: '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.15s', fontFamily: 'inherit', marginLeft: 'auto' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.5)'; e.currentTarget.style.color = '#f59e0b'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.2)'; e.currentTarget.style.color = '#6b7280'; }}>
            🆘 Ask Support
          </button>
        )}
        {post.support_requested && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
            ⏳ Support notified
          </span>
        )}
      </div>

      {/* Comments */}
      {showComments && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(post.comments || []).map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Avatar letter={c.author?.[0] || '?'} color={c.color || '#6b7280'} size={28} />
              <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '8px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{c.author}</span>
                  <span style={{ fontSize: 10, color: '#374151' }}>{c.time || (c.created_at ? timeAgo(c.created_at) : '')}</span>
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>{c.text || c.content}</div>
              </div>
            </div>
          ))}
          {currentUser && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
              <Avatar letter={(currentUser.email || 'U')[0].toUpperCase()} color="#7c6af7" size={28} />
              <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                <input value={commentText} onChange={e => setCommentText(e.target.value)}
                  placeholder="Write a comment..."
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleComment()}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                  onFocus={e => e.target.style.borderColor = 'rgba(124,106,247,0.4)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
                <button onClick={handleComment} disabled={!commentText.trim() || submitting}
                  style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: commentText.trim() ? 'pointer' : 'not-allowed', opacity: commentText.trim() ? 1 : 0.4, fontFamily: 'inherit' }}>
                  {submitting ? '...' : '→'}
                </button>
              </div>
            </div>
          )}
          {!currentUser && (
            <div style={{ textAlign: 'center', fontSize: 13, color: '#4b5563', padding: '8px 0' }}>Sign in to comment</div>
          )}
        </div>
      )}

      {/* Lightbox */}
      {imgExpanded && (
        <div onClick={() => setImgExpanded(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 20 }}>
          <img src={post.image_url} alt="expanded" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 16, objectFit: 'contain' }} />
        </div>
      )}
    </div>
  );
}

function NewPostModal({ onClose, onSubmit, currentUser }) {
  const [content, setContent] = useState('');
  const [tag, setTag] = useState('Showcase');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Images only (no videos)'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = ev => { setImage(ev.target.result); setImagePreview(ev.target.result); setError(''); };
    reader.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    if (!content.trim()) { setError('Please write something'); return; }
    if (content.trim().length < 10) { setError('Post must be at least 10 characters'); return; }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ content: content.trim(), tag, image_url: image });
      onClose();
    } catch (e) { setError(e.message || 'Failed to post'); setSubmitting(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }}>
      <style>{`@keyframes postIn{from{opacity:0;transform:scale(0.95) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      <div style={{ background: '#09090f', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 32px 80px rgba(0,0,0,0.9)', animation: 'postIn 0.25s cubic-bezier(0.16,1,0.3,1)', padding: 28 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.1em', marginBottom: 4 }}>COMMUNITY</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: 0 }}>Share with the community</h2>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#6b7280', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Tag selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', letterSpacing: '0.08em', marginBottom: 8 }}>CATEGORY</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TAGS.filter(t => t !== 'All').map(t => (
              <button key={t} onClick={() => setTag(t)}
                style={{ padding: '5px 14px', borderRadius: 999, border: `1px solid ${tag === t ? TAG_COLORS[t] : 'rgba(255,255,255,0.08)'}`, background: tag === t ? `${TAG_COLORS[t]}18` : 'transparent', color: tag === t ? TAG_COLORS[t] : '#6b7280', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Text */}
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Share a tip, showcase your work, ask a question, or tell us about your results..."
          rows={5} maxLength={1000}
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '14px 16px', color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box', transition: 'border-color 0.2s' }}
          onFocus={e => e.target.style.borderColor = 'rgba(124,106,247,0.4)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
        <div style={{ fontSize: 11, color: '#374151', textAlign: 'right', marginTop: 4 }}>{content.length}/1000</div>

        {/* Image upload */}
        <div style={{ marginTop: 14 }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
          {imagePreview ? (
            <div style={{ position: 'relative' }}>
              <img src={imagePreview} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }} />
              <button onClick={() => { setImage(null); setImagePreview(null); }}
                style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()}
              style={{ width: '100%', padding: '12px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.12)', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(124,106,247,0.3)'; e.currentTarget.style.color = '#a78bfa'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#6b7280'; }}>
              🖼️ Add Image (optional · max 5MB · no videos)
            </button>
          )}
        </div>

        {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: '#ef4444', fontSize: 13 }}>{error}</div>}

        <button onClick={handleSubmit} disabled={!content.trim() || submitting}
          style={{ width: '100%', marginTop: 20, padding: '14px', borderRadius: 12, border: 'none', background: content.trim() ? 'linear-gradient(135deg,#7c6af7,#6d28d9)' : '#1f1f2e', color: '#fff', fontWeight: 700, fontSize: 15, cursor: content.trim() ? 'pointer' : 'not-allowed', opacity: content.trim() ? 1 : 0.5, boxShadow: content.trim() ? '0 4px 20px rgba(124,106,247,0.3)' : 'none', fontFamily: 'inherit', transition: 'all 0.2s' }}>
          {submitting ? '⏳ Publishing...' : '🚀 Publish Post'}
        </button>
      </div>
    </div>
  );
}

export default function CommunityPage({ onBack, user, onNavigate }) {
  const [posts, setPosts] = useState(SEED_POSTS);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [showNewPost, setShowNewPost] = useState(false);
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'popular'

  // Fetch posts from backend
  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/community/posts', {
        headers: user ? { Authorization: 'Bearer ' + localStorage.getItem('token') } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (data.posts && data.posts.length > 0) {
          // Each post has: status, is_mine, rejection_reason from backend
          // Filter: show approved posts to everyone, show pending/rejected only to owner
          const visiblePosts = data.posts.filter(p =>
            p.status === 'approved' || p.is_mine
          );
          const backendIds = new Set(visiblePosts.map(p => p.id));
          const seeds = SEED_POSTS.filter(s => !backendIds.has(s.id));
          setPosts([...visiblePosts, ...seeds]);
        }
        // else keep seed posts as-is
      }
    } catch (e) {
      // Use seed posts only
    } finally {
      setLoading(false);
    }
  };

  const handleAskSupport = async (postId) => {
    if (postId.startsWith('seed_')) return;
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, support_requested: true } : p));
    try {
      await fetch(`/api/community/posts/${postId}/ask-support`, { method: 'POST' });
    } catch {}
  };

  const handleLike = async (postId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      const wasLiked = p.liked;
      return { ...p, liked: !wasLiked, likes: wasLiked ? p.likes - 1 : p.likes + 1 };
    }));
    if (!postId.startsWith('seed_')) {
      try {
        await fetch(`/api/community/posts/${postId}/like`, {
          method: 'POST',
          headers: user ? { Authorization: 'Bearer ' + localStorage.getItem('token') } : {},
        });
      } catch {}
    }
  };

  const handleComment = async (postId, text) => {
    const newComment = {
      id: 'c_' + Date.now(),
      author: user?.email?.split('@')[0] || 'You',
      letter: (user?.email || 'Y')[0].toUpperCase(),
      color: '#7c6af7',
      text,
      time: 'just now',
    };
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p;
      return { ...p, comments: [...(p.comments || []), newComment] };
    }));
    if (!postId.startsWith('seed_')) {
      try {
        await fetch(`/api/community/posts/${postId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + localStorage.getItem('token') } : {}) },
          body: JSON.stringify({ content: text }),
        });
      } catch {}
    }
  };

  const handleNewPost = async ({ content, tag, image_url }) => {
    const tempId = 'temp_' + Date.now();
    const userLang = localStorage.getItem('language') || 'en';
    const newPost = {
      id: tempId,
      author: user?.email?.split('@')[0] || 'Anonymous',
      avatar_letter: (user?.email || 'A')[0].toUpperCase(),
      avatar_color: '#7c6af7',
      plan: localStorage.getItem('plan')?.charAt(0).toUpperCase() + localStorage.getItem('plan')?.slice(1) || 'Free',
      content,
      image_url,
      likes: 0,
      liked: false,
      comments: [],
      tag,
      time: 'just now',
      is_mine: true,
      status: 'pending',
      is_arabic: userLang === 'ar',
    };
    setPosts(prev => [newPost, ...prev]);

    try {
      const res = await fetch('/api/community/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + localStorage.getItem('token') } : {}) },
        body: JSON.stringify({ content, tag, image_url }),
      });
      if (res.ok) {
        const data = await res.json();
        setPosts(prev => prev.map(p => p.id === tempId ? { ...newPost, id: data.id } : p));
      }
    } catch {}
  };

  const handleDelete = async (postId) => {
    if (postId.startsWith('seed_')) { setPosts(prev => prev.filter(p => p.id !== postId)); return; }
    setPosts(prev => prev.filter(p => p.id !== postId));
    try {
      await fetch(`/api/community/posts/${postId}`, {
        method: 'DELETE',
        headers: user ? { Authorization: 'Bearer ' + localStorage.getItem('token') } : {},
      });
    } catch {}
  };

  const filtered = posts
    .filter(p => {
      // Hide pending/rejected from public feed, show only to owner
      if (p.status && p.status !== 'approved' && !p.is_mine) return false;
      return filter === 'All' || p.tag === filter;
    })
    .sort((a, b) => {
      if (sortBy === 'popular') return (b.likes || 0) - (a.likes || 0);
      // recent: seed posts go last
      if (a.seed && !b.seed) return 1;
      if (!a.seed && b.seed) return -1;
      return 0;
    });

  const stats = {
    posts: posts.length,
    members: 2840 + posts.filter(p => !p.seed).length,
    likes: posts.reduce((acc, p) => acc + (p.likes || 0), 0),
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050508', color: '#fff', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .comm-post{animation:fadeUp 0.4s ease both}
        @media(max-width:768px){
          .comm-layout{grid-template-columns:1fr!important}
          .comm-sidebar{display:none!important}
        }
      `}</style>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(180deg, rgba(124,106,247,0.08) 0%, transparent 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '60px 24px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>← Back</button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 999, border: '1px solid rgba(124,106,247,0.3)', background: 'rgba(124,106,247,0.08)', marginBottom: 16 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c6af7', animation: 'glow 2s ease infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.08em' }}>COMMUNITY</span>
              </div>
              <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, letterSpacing: '-1.5px', margin: '0 0 12px', fontFamily: "'Bricolage Grotesque', sans-serif" }}>
                Creator Community 🚀
              </h1>
              <p style={{ fontSize: 15, color: '#6b7280', maxWidth: 500, lineHeight: 1.7, margin: 0 }}>
                Share your work, get tips, ask questions, and connect with thousands of AI video creators worldwide.
              </p>
            </div>

            {user ? (
              <button onClick={() => setShowNewPost(true)}
                style={{ padding: '13px 28px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 24px rgba(124,106,247,0.4)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', flexShrink: 0 }}>
                ✏️ New Post
              </button>
            ) : (
              <button onClick={() => onNavigate?.('auth')}
                style={{ padding: '13px 28px', borderRadius: 14, border: '1px solid rgba(124,106,247,0.3)', background: 'rgba(124,106,247,0.08)', color: '#a78bfa', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                Sign in to post →
              </button>
            )}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 32, marginTop: 32, flexWrap: 'wrap' }}>
            {[
              { label: 'Posts', value: stats.posts.toLocaleString() },
              { label: 'Members', value: stats.members.toLocaleString() + '+' },
              { label: 'Total Likes', value: stats.likes.toLocaleString() },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#a78bfa', fontFamily: "'Bricolage Grotesque', sans-serif" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: '#4b5563', fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 80px' }}>
        <div className="comm-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 32, alignItems: 'start' }}>

          {/* Posts feed */}
          <div>
            {/* Filters + Sort */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TAGS.map(t => (
                  <button key={t} onClick={() => setFilter(t)}
                    style={{ padding: '6px 16px', borderRadius: 999, border: `1px solid ${filter === t ? (TAG_COLORS[t] || '#7c6af7') : 'rgba(255,255,255,0.08)'}`, background: filter === t ? `${TAG_COLORS[t] || '#7c6af7'}18` : 'transparent', color: filter === t ? (TAG_COLORS[t] || '#a78bfa') : '#6b7280', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['recent', '🕐 Recent'], ['popular', '🔥 Popular']].map(([val, label]) => (
                  <button key={val} onClick={() => setSortBy(val)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${sortBy === val ? 'rgba(124,106,247,0.4)' : 'rgba(255,255,255,0.07)'}`, background: sortBy === val ? 'rgba(124,106,247,0.1)' : 'transparent', color: sortBy === val ? '#a78bfa' : '#6b7280', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <div>Loading posts...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🪴</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#6b7280', marginBottom: 8 }}>No posts yet in this category</div>
                <div>Be the first to share something!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {filtered.map((post, i) => (
                  <div key={post.id} className="comm-post" style={{ animationDelay: `${i * 0.05}s` }}>
                    <PostCard post={post} currentUser={user} onLike={handleLike} onComment={handleComment} onDelete={handleDelete} onAskSupport={handleAskSupport} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="comm-sidebar" style={{ position: 'sticky', top: 80, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Guidelines */}
            <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14, letterSpacing: '0.06em' }}>📋 COMMUNITY RULES</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { icon: '✅', text: 'Share tips, results, and questions' },
                  { icon: '✅', text: 'Images welcome — no MP4 or video files' },
                  { icon: '✅', text: 'Be respectful and supportive' },
                  { icon: '❌', text: 'No spam or self-promotion links' },
                  { icon: '❌', text: 'No inappropriate content' },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{r.icon}</span>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top contributors */}
            <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 14, letterSpacing: '0.06em' }}>🏆 TOP CONTRIBUTORS</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { name: 'Ramy S.', letter: 'R', color: '#a855f7', posts: 24, likes: 312 },
                  { name: 'Omar T.', letter: 'O', color: '#f59e0b', posts: 18, likes: 245 },
                  { name: 'Nour H.', letter: 'N', color: '#10b981', posts: 15, likes: 198 },
                  { name: 'Ahmed K.', letter: 'A', color: '#7c6af7', posts: 12, likes: 167 },
                  { name: 'Sara M.', letter: 'S', color: '#06b6d4', posts: 9, likes: 134 },
                ].map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10, color: '#374151', fontWeight: 800, width: 16, textAlign: 'center' }}>#{i + 1}</span>
                    <Avatar letter={u.letter} color={u.color} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#d1d5db' }}>{u.name}</div>
                      <div style={{ fontSize: 10, color: '#4b5563' }}>{u.posts} posts · {u.likes} likes</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            {!user && (
              <div style={{ background: 'linear-gradient(135deg, rgba(124,106,247,0.1), rgba(6,182,212,0.06))', border: '1px solid rgba(124,106,247,0.2)', borderRadius: 18, padding: 20, textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>🚀</div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Join the community</h3>
                <p style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>Sign up free to post, comment, and connect with creators.</p>
                <button onClick={() => onNavigate?.('auth')}
                  style={{ width: '100%', padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c6af7,#6d28d9)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Get Started Free →
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>

      {showNewPost && <NewPostModal onClose={() => setShowNewPost(false)} onSubmit={handleNewPost} currentUser={user} />}
    </div>
  );
}