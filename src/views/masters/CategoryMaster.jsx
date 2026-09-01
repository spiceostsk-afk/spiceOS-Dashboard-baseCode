import React, { useState } from 'react';
import { Plus, Pencil, Trash2, FolderTree, Search } from 'lucide-react';
import { useCategoryMaster } from '../../hooks/useMastersData';
import { MastersStyles } from './mastersUi';
import { ConfirmDelete, NameModal } from './masterDialogs';

/**
 * Category Master — how raw materials are grouped.
 *
 * These are the tabs on every stock screen, so the count beside each one is
 * what tells you whether a category is worth keeping.
 */
export default function CategoryMaster() {
  const { categories, usage, loading, error, saveCategory, deleteCategory } = useCategoryMaster();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState('');
  const [notice, setNotice] = useState(null);

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 3400);
  };

  const visible = categories.filter((c) =>
    !query.trim() || c.name.toLowerCase().includes(query.trim().toLowerCase()));

  const confirmDelete = async () => {
    setBusy(true);
    setDelError('');
    const res = await deleteCategory(deleting.id);
    setBusy(false);
    if (res.success) { flash(`Category "${deleting.name}" deleted.`); setDeleting(null); }
    else setDelError(res.error);
  };

  const inUse = deleting ? (usage[deleting.id] || 0) : 0;

  return (
    <div className="page">
      <div className="mst-top">
        <div>
          <h2 className="mst-title">Category Master</h2>
          <div className="card__subtitle">
            {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => setAdding(true)}>
          <Plus size={15} /> Create New
        </button>
      </div>

      {notice && <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>}
      {error && <div className="mst-note bad">{error}</div>}

      <div className="search-input">
        <Search size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search categories" />
      </div>

      <div className="table-card table-card--padded">
        <div className="table-head cm-head">
          <div className="cm-name">Category</div>
          <div className="cm-used">Raw materials</div>
          <div className="cm-act">Action</div>
        </div>

        {loading && <div className="empty-state">Loading categories…</div>}

        {!loading && categories.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><FolderTree size={22} /></span>
            <div className="empty-state__title">No categories yet</div>
            <div className="empty-state__sub">
              Group your raw materials — vegetables, dairy, disposables — and every stock
              screen gains a tab for each.
            </div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
              <Plus size={15} /> Create New
            </button>
          </div>
        )}

        {!loading && visible.map((c) => (
          <div key={c.id} className="table-row cm-row">
            <div className="cm-name strong">{c.name}</div>
            <div className="cm-used">
              {usage[c.id]
                ? <span className="pill pill--sm tone-blue">{usage[c.id]}</span>
                : <span className="muted">Empty</span>}
            </div>
            <div className="cm-act">
              <button className="step" title="Rename" onClick={() => setEditing(c)}>
                <Pencil size={12} />
              </button>
              <button
                className="step step--danger"
                title="Delete"
                onClick={() => { setDelError(''); setDeleting(c); }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <NameModal
          title="Add category"
          label="Category name"
          onClose={() => setAdding(false)}
          onSave={(name) => saveCategory(name)}
        />
      )}

      {editing && (
        <NameModal
          title={`Rename ${editing.name}`}
          label="Category name"
          initial={editing.name}
          onClose={() => setEditing(null)}
          onSave={(name) => saveCategory(name, null, editing.id)}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title="Delete category"
          subject={deleting.name}
          permanent
          busy={busy}
          error={delError}
          consequences={inUse > 0 ? [
            `${inUse} raw material${inUse === 1 ? '' : 's'} in this category will NOT be deleted — they become uncategorised and can be regrouped afterwards.`,
            'The category disappears as a tab from every stock screen.',
          ] : ['No material is in this category, so nothing else is affected.']}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      <MastersStyles />
      <style>{`
        .cm-head, .cm-row { margin: 0 -24px; padding: 0 24px; }
        .cm-name { flex: 1; min-width: 0; }
        .cm-used { width: 170px; }
        .cm-act { width: 80px; display: flex; justify-content: flex-end; gap: 6px; }
        .step {
          width: 26px; height: 26px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface);
          color: var(--color-text-muted); display: inline-flex;
          align-items: center; justify-content: center; cursor: pointer;
        }
        .step:hover { background: var(--color-canvas); color: var(--color-text); }
        .step--danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }
      `}</style>
    </div>
  );
}
