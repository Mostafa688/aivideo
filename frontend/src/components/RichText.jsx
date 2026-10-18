// ── RichText.jsx ── تنسيق رسائل الايجنت بشكل مقروء: فقرات، قوايم (- / • / 1.)، **عريض**، عناوين (#)، `كود` —
// من غير HTML خام (كل حاجة عناصر React، فمفيش أي خطر حقن)
import React from 'react';

function inline(text, keyBase) {
  const out = []; let rest = String(text); let k = 0;
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/;
  while (rest) {
    const m = re.exec(rest);
    if (!m) { out.push(rest); break; }
    if (m.index) out.push(rest.slice(0, m.index));
    if (m[2] != null) out.push(<strong key={`${keyBase}b${k++}`} style={{ fontWeight: 800, color: 'inherit' }}>{m[2]}</strong>);
    else out.push(<code key={`${keyBase}c${k++}`} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.92em', padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.1)' }}>{m[3]}</code>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

const BULLET = /^\s*([-•*–])\s+(.*)$/;
const NUM = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const HEAD = /^\s*#{1,4}\s+(.*)$/;

export default function RichText({ text }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    if (BULLET.test(ln) || NUM.test(ln)) {
      const ordered = NUM.test(ln); const items = [];
      while (i < lines.length && (ordered ? NUM.test(lines[i]) : BULLET.test(lines[i]))) { items.push((ordered ? NUM : BULLET).exec(lines[i])[2]); i++; }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={`l${i}`} style={{ margin: '4px 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4, listStyle: ordered ? 'decimal' : 'disc' }}>{items.map((it, j) => <li key={j} style={{ lineHeight: 1.7 }}>{inline(it, `l${i}_${j}`)}</li>)}</Tag>);
      continue;
    }
    if (HEAD.test(ln)) { blocks.push(<div key={`h${i}`} style={{ fontWeight: 800, fontSize: '1.02em', margin: '2px 0' }}>{inline(HEAD.exec(ln)[1], `h${i}`)}</div>); i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUM.test(lines[i]) && !HEAD.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={`p${i}`} style={{ margin: 0, lineHeight: 1.75 }}>{para.map((p, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(p, `p${i}_${j}`)}</React.Fragment>)}</p>);
  }
  return <div dir="auto" style={{ display: 'flex', flexDirection: 'column', gap: 8, whiteSpace: 'normal' }}>{blocks}</div>;
}
