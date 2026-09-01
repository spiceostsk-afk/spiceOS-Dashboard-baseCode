import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Ruler, Search } from 'lucide-react';
import { useUnitMaster } from '../../hooks/useMastersData';
import { MastersStyles } from './mastersUi';
import { ConfirmDelete, NameModal } from './masterDialogs';

/**
 * Unit Master — the units materials are measured and bought in.
 *
 * Renaming a unit here reaches every material using it, because a database
 * trigger keeps the denormalised label on inventory_items in step. That is the
 * whole reason this screen exists: units used to be free text per item, so
 * "Kg", "kg" and "KG" were three different units and nothing could be totalled
 * across them.
 */
export default function UnitMaster() {
  const { units, usage, loading, error, saveUnit, deleteUnit, toggleUnit } = useUnitMaster();
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

  const visible = units.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return u.symbol.toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q);
  });

  const confirmDelete = async () => {
    setBusy(true);
    setDelError('');
    const res = await deleteUnit(deleting.id);
    setBusy(false);
    if (res.success) { flash(`Unit "${deleting.symbol}" deleted.`); setDeleting(null); }
    else setDelError(res.error);
  };

  const inUse = deleting ? (usage[deleting.id] || 0) : 0;

  return (
    <div className="page">
      <div className="mst-top">
        <div>
          <h2 className="mst-title">Unit Master</h2>
          <div className="card__subtitle">
            {units.length} unit{units.length === 1 ? '' : 's'} ·{' '}
            {units.filter((u) => u.is_active).length} in use
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
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search units" />
      </div>

      <div className="table-card table-card--padded">
        <div className="table-head um-head">
          <div className="um-sym">Symbol</div>
          <div className="um-name">Name</div>
          <div className="um-used">Materials using it</div>
          <div className="um-active">Active</div>
          <div className="um-act">Action</div>
        </div>

        {loading && <div className="empty-state">Loading units…</div>}

        {!loading && units.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Ruler size={22} /></span>
            <div className="empty-state__title">No units yet</div>
            <div className="empty-state__sub">
              Add the units your kitchen measures in — Kg, Litre, Piece — and materials
              can then be defined against them.
            </div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>
              <Plus size={15} /> Create New
            </button>
          </div>
        )}

        {!loading && visible.map((u) => (
          <div key={u.id} className={`table-row um-row ${u.is_active ? '' : 'off'}`}>
            <div className="um-sym strong">{u.symbol}</div>
            <div className="um-name muted">{u.name || u.symbol}</div>
            <div className="um-used">
              {usage[u.id]
                ? <span className="pill pill--sm tone-blue">{usage[u.id]}</span>
                : <span className="muted">—</span>}
            </div>
            <div className="um-active">
              <input
                type="checkbox"
                className="gcheck"
                checked={u.is_active}
                onChange={(e) => toggleUnit(u.id, e.target.checked)}
                aria-label={`Active ${u.symbol}`}
              />
            </div>
            <div className="um-act">
              <button className="step" title="Rename" onClick={() => setEditing(u)}>
                <Pencil size={12} />
              </button>
              <button
                className="step step--danger"
                title="Delete"
                onClick={() => { setDelError(''); setDeleting(u); }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <NameModal
          title="Add unit"
          label="Symbol (shown on screens)"
          extra={[{ key: 'name', label: 'Full name', placeholder: 'e.g. Kilogram' }]}
          onClose={() => setAdding(false)}
          onSave={(sym, extras) => saveUnit(sym, extras)}
        />
      )}

      {editing && (
        <NameModal
          title={`Rename ${editing.symbol}`}
          label="Symbol"
          initial={editing.symbol}
          extra={[{ key: 'name', label: 'Full name', initial: editing.name }]}
          onClose={() => setEditing(null)}
          onSave={(sym, extras) => saveUnit(sym, extras, editing.id)}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title="Delete unit"
          subject={`${deleting.symbol}${deleting.name && deleting.name !== deleting.symbol ? ` — ${deleting.name}` : ''}`}
          permanent
          busy={busy}
          error={delError}
          consequences={inUse > 0 ? [
            `${inUse} material${inUse === 1 ? '' : 's'} currently use this unit. They keep their unit label, but stop being linked to the master — so renaming it later will no longer reach them.`,
            'Consider marking it inactive instead, which hides it from new entries without breaking the link.',
          ] : ['No material uses this unit, so nothing else is affected.']}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      <MastersStyles />
      <style>{`
        .um-head, .um-row { margin: 0 -24px; padding: 0 24px; }
        .um-row.off { background: #FAFAFB; }
        .um-row.off .strong { color: var(--color-text-muted); }
        .um-sym { width: 130px; }
        .um-name { flex: 1; min-width: 0; }
        .um-used { width: 150px; }
        .um-active { width: 80px; text-align: center; }
        .um-act { width: 80px; display: flex; justify-content: flex-end; gap: 6px; }
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
