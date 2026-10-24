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

// بلوك كود (```lang ... ```): نسخ، وللـ HTML (موقع كامل من Claude) معاينة في تاب جديد وتنزيل كملف
function CodeBlock({ lang, code }) {
  const [copied, setCopied] = React.useState(false);
  const isHtml = /^html?$/i.test(lang) || /^\s*<!doctype html|^\s*<html/i.test(code);
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* ignore */ } };
  const blob = () => URL.createObjectURL(new Blob([code], { type: isHtml ? 'text/html' : 'text/plain' }));
  const preview = () => { const u = blob(); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); };
  const download = () => { const u = blob(); const a = document.createElement('a'); a.href = u; a.download = isHtml ? 'erivion-site.html' : `erivion-code.${lang || 'txt'}`; a.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); };
  const btn = { fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#e9e5ff', cursor: 'pointer' };
  const [view, setView] = React.useState(isHtml ? 'preview' : 'code');
  const tab = (k, label) => <button type="button" onClick={() => setView(k)} style={{ ...btn, background: view === k ? 'rgba(124,106,247,0.35)' : btn.background, borderColor: view === k ? 'rgba(169,155,255,0.6)' : 'rgba(255,255,255,0.15)' }}>{label}</button>;
  return (
    <div dir="ltr" style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.35)', overflow: 'hidden', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexWrap: 'wrap' }}>
        {isHtml ? <>{tab('preview', 'Preview')}{tab('code', 'Code')}</> : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontFamily: 'ui-monospace, monospace' }}>{lang || 'code'}</span>}
        <span style={{ flex: 1 }} />
        {isHtml && <button type="button" onClick={preview} style={btn} title="Open in a new tab">↗ Full screen</button>}
        {isHtml && <button type="button" onClick={download} style={btn}>Download</button>}
        <button type="button" onClick={copy} style={btn}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
      {isHtml && view === 'preview'
        // معاينة حيّة للموقع جوه الشات — sandbox من غير same-origin فالكود مش بيوصل لحساب العميل ولا للصفحة
        ? <iframe title="Website preview" srcDoc={code} sandbox="allow-scripts allow-popups allow-forms" loading="lazy"
            style={{ display: 'block', width: '100%', height: 460, border: 'none', background: '#fff' }} />
        : <pre style={{ margin: 0, padding: '10px 12px', maxHeight: 340, overflow: 'auto', fontSize: 12, lineHeight: 1.55, fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre' }}><code>{code}</code></pre>}
    </div>
  );
}

const BULLET = /^\s*([-•*–])\s+(.*)$/;
const NUM = /^\s*(\d{1,2})[.)]\s+(.*)$/;
const HEAD = /^\s*#{1,4}\s+(.*)$/;

// موقع HTML كامل مكتوب من غير ``` (رسايل قديمة/موديل مجاني) → بلوك html عشان يظهر Preview
function fenceBareHtml(t) {
  const m = /<!doctype\s+html|<html[\s>]/i.exec(t); if (!m) return t;
  const before = t.slice(0, m.index); if ((before.match(/```/g) || []).length % 2 === 1) return t;
  const endIdx = t.toLowerCase().indexOf('</html>', m.index); const end = endIdx === -1 ? t.length : endIdx + 7;
  return `${before.replace(/\s+$/, '')}\n\n\`\`\`html\n${t.slice(m.index, end).trim()}\n\`\`\`\n\n${t.slice(end).trim()}`;
}

export default function RichText({ text }) {
  const lines = fenceBareHtml(String(text || '').replace(/\r/g, '')).split('\n');
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i++; continue; }
    const fence = /^\s*```\s*([\w+-]*)[^`]*$/.exec(ln);
    if (fence) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // قفلة البلوك
      blocks.push(<CodeBlock key={`c${i}`} lang={fence[1]} code={code.join('\n')} />);
      continue;
    }
    if (BULLET.test(ln) || NUM.test(ln)) {
      const ordered = NUM.test(ln); const items = [];
      while (i < lines.length && (ordered ? NUM.test(lines[i]) : BULLET.test(lines[i]))) { items.push((ordered ? NUM : BULLET).exec(lines[i])[2]); i++; }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={`l${i}`} style={{ margin: '4px 0', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4, listStyle: ordered ? 'decimal' : 'disc' }}>{items.map((it, j) => <li key={j} style={{ lineHeight: 1.7 }}>{inline(it, `l${i}_${j}`)}</li>)}</Tag>);
      continue;
    }
    if (HEAD.test(ln)) { blocks.push(<div key={`h${i}`} style={{ fontWeight: 800, fontSize: '1.02em', margin: '2px 0' }}>{inline(HEAD.exec(ln)[1], `h${i}`)}</div>); i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUM.test(lines[i]) && !HEAD.test(lines[i]) && !/^\s*```/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={`p${i}`} style={{ margin: 0, lineHeight: 1.75 }}>{para.map((p, j) => <React.Fragment key={j}>{j > 0 && <br />}{inline(p, `p${i}_${j}`)}</React.Fragment>)}</p>);
  }
  return <div dir="auto" style={{ display: 'flex', flexDirection: 'column', gap: 8, whiteSpace: 'normal' }}>{blocks}</div>;
}
