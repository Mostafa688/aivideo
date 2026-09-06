import React, { useState, useEffect } from 'react';
import { FolderKanban, Plus, MoreVertical, Pencil, Trash2, Check, X } from 'lucide-react';

const LOGO = '/logo.png';

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('token') };
}

const T = {
  ar: {
    title: 'المشاريع',
    subtitle: 'كل فيديوهاتك وصورك المتولدة منظمة في مشاريع منفصلة.',
    newProject: 'مشروع جديد',
    untitled: 'مشروع بدون اسم',
    empty: 'لسه معملتش أي مشروع',
    emptySub: 'ابدأ أول مشروع وهيبقى فيه كل الصور والفيديوهات اللي هتولّدها.',
    createFirst: 'ابدأ أول مشروع',
    rename: 'إعادة تسمية',
    delete: 'حذف',
    confirmDelete: 'تحذف المشروع ده؟',
    yes: 'أيوه احذف',
    cancel: 'إلغاء',
    updated: 'آخر تحديث',
    newProjectTitle: 'مشروع جديد',
    namePlaceholder: 'اسم المشروع...',
    create: 'إنشاء',
  },
  en: {
    title: 'Projects',
    subtitle: 'All your generated videos and images, organized into separate projects.',
    newProject: 'New Project',
    untitled: 'Untitled Project',
    empty: "You haven't created a project yet",
    emptySub: "Start your first project — every video and image you generate will live here.",
    createFirst: 'Start your first project',
    rename: 'Rename',
    delete: 'Delete',
    confirmDelete: 'Delete this project?',
    yes: 'Yes, delete',
    cancel: 'Cancel',
    updated: 'Updated',
    newProjectTitle: 'New Project',
    namePlaceholder: 'Project name...',
    create: 'Create',
  },
};

function timeAgo(iso, lang) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return lang === 'ar' ? 'الآن' : 'just now';
  if (mins < 60) return lang === 'ar' ? `من ${mins} دقيقة` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return lang === 'ar' ? `من ${hrs} ساعة` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return lang === 'ar' ? `من ${days} يوم` : `${days}d ago`;
}

function ProjectCard({ project, lang, onOpen, onRename, onDelete }) {
  const t = T[lang];
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);

  const submitRename = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== project.name) onRename(project.id, trimmed);
    setRenaming(false);
  };

  return (
    <div
      onClick={() => !renaming && !confirmingDelete && onOpen(project)}
      style={{
        position: 'relative', cursor: renaming || confirmingDelete ? 'default' : 'pointer',
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)',
        padding: 18, transition: 'border-color 0.15s ease, transform 0.15s ease',
      }}
      onMouseEnter={e => { if (!renaming && !confirmingDelete) { e.currentTarget.style.borderColor = 'var(--border3)'; e.currentTarget.style.transform = 'translateY(-2px)'; } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{
        width: '100%', aspectRatio: '16/10', borderRadius: 'var(--r-lg)', marginBottom: 14,
        background: 'linear-gradient(135deg, var(--bg3), var(--bg4))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <FolderKanban size={28} strokeWidth={1.5} color="var(--text3)" />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        {renaming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }} onClick={e => e.stopPropagation()}>
            <input
              autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(false); }}
              style={{ flex: 1, fontSize: 14, padding: '6px 8px' }}
            />
            <button onClick={submitRename} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-bg)', color: 'var(--accent2)' }}><Check size={14} strokeWidth={2.5} /></button>
            <button onClick={() => setRenaming(false)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)', color: 'var(--text2)' }}><X size={14} strokeWidth={2.5} /></button>
          </div>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>{t.updated} {timeAgo(project.updated_at, lang)}</div>
          </div>
        )}

        {!renaming && (
          <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(v => !v)} style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: menuOpen ? 'var(--bg3)' : 'transparent', color: 'var(--text2)' }}>
              <MoreVertical size={15} strokeWidth={2} />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                <div style={{ position: 'absolute', top: 32, insetInlineEnd: 0, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 10, padding: 4, minWidth: 140, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', zIndex: 50 }}>
                  <button onClick={() => { setRenaming(true); setMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 7, background: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
                    <Pencil size={14} strokeWidth={2} /> {t.rename}
                  </button>
                  <button onClick={() => { setConfirmingDelete(true); setMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 7, background: 'none', color: '#f87171', fontSize: 13, fontWeight: 600 }}>
                    <Trash2 size={14} strokeWidth={2} /> {t.delete}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {confirmingDelete && (
        <div onClick={e => e.stopPropagation()} style={{ marginTop: 12, padding: 10, borderRadius: 10, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text)', marginBottom: 8 }}>{t.confirmDelete}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onDelete(project.id)} style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, background: '#f87171', color: '#fff' }}>{t.yes}</button>
            <button onClick={() => setConfirmingDelete(false)} style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 7, background: 'var(--bg3)', color: 'var(--text2)' }}>{t.cancel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ✅ NEW (طلب العميل: "لما حد يعمل مشروع جديد يظهر له نافذة تطلب منه يكتب اسم المشروع"):
// نافذة بسيطة بتاخد اسم المشروع قبل الإنشاء الفعلي، بدل ما يتعمل المشروع فورًا باسم افتراضي
function NewProjectModal({ lang, onCreate, onCancel, creating }) {
  const t = T[lang];
  const [name, setName] = useState('');
  const submit = () => { const trimmed = name.trim(); if (trimmed && !creating) onCreate(trimmed); };
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(400px, 90vw)', background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 'var(--r-xl)', padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 14 }}>{t.newProjectTitle}</div>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={t.namePlaceholder}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
          style={{ width: '100%', fontSize: 14, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--bg)', color: 'var(--text)', marginBottom: 16 }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ padding: '9px 16px', borderRadius: 9, background: 'var(--bg3)', color: 'var(--text2)', fontSize: 13, fontWeight: 600 }}>{t.cancel}</button>
          <button className="btn-primary" onClick={submit} disabled={!name.trim() || creating} style={{ padding: '9px 16px', fontSize: 13 }}>{t.create}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsDashboardPage({ lang = 'ar', onOpenProject }) {
  const t = T[lang];
  const [projects, setProjects] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/projects', { headers: authHeaders() });
      const data = await res.json();
      if (res.ok) setProjects(data.projects || []);
    } catch { setProjects([]); }
  };

  useEffect(() => { load(); }, []);

  const createProject = async (name) => {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/projects', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: name || t.untitled }) });
      const data = await res.json();
      if (res.ok && data.project) {
        setProjects(p => [data.project, ...(p || [])]);
        setShowNewModal(false);
        onOpenProject?.(data.project);
      }
    } catch { /* ignore */ } finally { setCreating(false); }
  };

  const renameProject = async (id, name) => {
    setProjects(p => p.map(pr => pr.id === id ? { ...pr, name } : pr));
    fetch(`/api/projects/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ name }) }).catch(() => {});
  };

  const deleteProject = async (id) => {
    setProjects(p => p.filter(pr => pr.id !== id));
    fetch(`/api/projects/${id}`, { method: 'DELETE', headers: authHeaders() }).catch(() => {});
  };

  if (projects === null) return null;

  return (
    <div style={{ minHeight: 'calc(100vh - 74px)', padding: '32px 24px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={LOGO} alt="Erivion" style={{ width: 30, height: 30, objectFit: 'contain' }} />
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', letterSpacing: '-0.3px' }}>{t.title}</h1>
            <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 2 }}>{t.subtitle}</p>
          </div>
        </div>
        {projects.length > 0 && (
          <button className="btn-primary" onClick={() => setShowNewModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} strokeWidth={2.5} /> {t.newProject}
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg2)', border: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <FolderKanban size={28} strokeWidth={1.5} color="var(--text3)" />
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t.empty}</div>
          <div style={{ fontSize: 13.5, color: 'var(--text2)', maxWidth: 380, margin: '0 auto 20px', lineHeight: 1.7 }}>{t.emptySub}</div>
          <button className="btn-primary" onClick={() => setShowNewModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} strokeWidth={2.5} /> {t.createFirst}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} lang={lang} onOpen={onOpenProject} onRename={renameProject} onDelete={deleteProject} />
          ))}
        </div>
      )}

      {showNewModal && (
        <NewProjectModal lang={lang} creating={creating} onCreate={createProject} onCancel={() => setShowNewModal(false)} />
      )}
    </div>
  );
}
