// ── ShimmerLoader.jsx ────────────────────────────────────────────────────────
// Flow-style generation placeholder: a soft drifting gray gradient with an
// optional progress percentage in the corner — replaces the mix of ad-hoc
// spinners/pulsing-emoji cards used across model pages and the Agent chat.
import React from 'react';
import { ImageIcon } from 'lucide-react';

export default function ShimmerLoader({ ratio = '16:9', progress = null, label = '', style = {} }) {
  const aspect = ratio === '9:16' ? '9/16' : ratio === '1:1' ? '1/1' : '16/9';
  return (
    <div
      className="shimmer-surface"
      style={{
        position: 'relative', width: '100%', aspectRatio: aspect, borderRadius: 'var(--r-lg)',
        overflow: 'hidden', border: '1px solid var(--border2)', ...style,
      }}
    >
      {progress != null && (
        <div style={{
          position: 'absolute', top: 10, insetInlineStart: 12, fontSize: 12, fontWeight: 700,
          color: 'var(--text2)', fontVariantNumeric: 'tabular-nums',
        }}>
          {Math.round(progress)}%
        </div>
      )}
      <div style={{ position: 'absolute', top: 10, insetInlineEnd: 12, color: 'var(--text3)', display: 'flex', alignItems: 'center' }}>
        <ImageIcon size={16} strokeWidth={1.75} />
      </div>
      {label && (
        <div style={{
          position: 'absolute', bottom: 10, left: 12, right: 12, fontSize: 11.5, color: 'var(--text3)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </div>
      )}
    </div>
  );
}
