import React, { useState } from 'react';
import { Package, X, Trash2, History } from 'lucide-react';
import { useInventoryData } from '../hooks/useInventoryData';

const STATUS = {
  in: { label: 'In stock', tone: 'tone-green', row: 'transparent' },
  low: { label: 'Low', tone: 'tone-amber', row: '#FDFAF3' },
  out: { label: 'Out', tone: 'tone-red', row: '#FDF6F6' },
};

const statusOf = (item) => {
  if (item.stock <= 0) return STATUS.out;
  if (item.stock <= item.reorderAt) return STATUS.low;
  return STATUS.in;
};

const EMPTY_DRAFT = { name: '', category: '', stock: '', unit: '', reorderAt: '' };

function AddItemModal({ onClose, onSave }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const result = await onSave(draft);
    setSaving(false);
    if (result.success) onClose();
    else setError(result.error || 'Could not add the item.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">Add item</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="inv-error">{error}</div>}

          <div className="field">
            <label>Item name</label>
            <input value={draft.name} onChange={set('name')} placeholder="e.g. Paneer" required autoFocus />
          </div>

          <div className="field-grid">
            <div className="field">
              <label>Category</label>
              <input value={draft.category} onChange={set('category')} placeholder="e.g. Dairy" />
            </div>
            <div className="field">
              <label>Unit</label>
              <input value={draft.unit} onChange={set('unit')} placeholder="kg, pcs, litres" />
            </div>
            <div className="field">
              <label>Opening stock</label>
              <input type="number" min="0" step="0.5" value={draft.stock} onChange={set('stock')} placeholder="0" />
            </div>
            <div className="field">
              <label>Reorder at</label>
              <input type="number" min="0" step="0.5" value={draft.reorderAt} onChange={set('reorderAt')} placeholder="0" />
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Adding…' : 'Add item'}
          </button>
        </div>

        <style>{`
          .inv-error {
            padding: 12px 14px;
            border-radius: var(--radius-md);
            background: var(--color-danger-soft);
            color: var(--color-danger);
            font-size: 13px;
            font-weight: 600;
          }
        `}</style>
      </form>
    </div>
  );
}

function StockLogDrawer({ log, onClose }) {
  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer">
        <div className="inv-log__head">
          <div style={{ flex: 1 }}>
            <div className="card__title">Stock in/out log</div>
            <div className="card__subtitle">Most recent first</div>
          </div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        {log.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state__mark"><History size={22} /></span>
            <div className="empty-state__title">No movements yet</div>
            <div className="empty-state__sub">Adjustments show up here as they happen.</div>
          </div>
        ) : (
          log.map((entry) => (
            <div key={entry.id} className="inv-log__row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="inv-log__item">{entry.item}</div>
                <div className="card__subtitle">{entry.reason} · {entry.at}</div>
              </div>
              {entry.delta !== 0 && (
                <span
                  className={`pill ${entry.delta > 0 ? 'tone-green' : 'tone-amber'}`}
                >
                  {entry.delta > 0 ? '+' : ''}{entry.delta}
                </span>
              )}
            </div>
          ))
        )}

        <style>{`
          .inv-log__head {
            display: flex;
            align-items: flex-start;
            gap: 12px;
            padding-bottom: 18px;
            border-bottom: 1px solid var(--color-border);
          }
          .inv-log__row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid var(--color-border-soft);
          }
          .inv-log__row:last-child { border-bottom: none; }
          .inv-log__item { font-size: 13.5px; font-weight: 600; }
        `}</style>
      </div>
    </>
  );
}

export default function Inventory() {
  const { items, log, metrics, loading, adjust, addItem, removeItem } = useInventoryData();
  const [showAdd, setShowAdd] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const cards = [
    { label: 'Items tracked', value: metrics.tracked, color: 'var(--color-text)' },
    { label: 'Low stock', value: metrics.low, color: 'var(--color-warning)' },
    { label: 'Out of stock', value: metrics.out, color: 'var(--color-danger)' },
  ];

  const handleRemove = (item) => {
    if (!window.confirm(`Remove ${item.name} from inventory?`)) return;
    removeItem(item.id);
  };

  return (
    <div className="page">
      <div className="inv-top">
        <div className="metric-grid metric-grid--3" style={{ flex: 1 }}>
          {cards.map((c) => (
            <div key={c.label} className="metric-card">
              <div className="metric-card__label">{c.label}</div>
              <div className="metric-card__value" style={{ color: c.color }}>{c.value}</div>
            </div>
          ))}
        </div>
        <div className="inv-actions">
          <button className="btn btn--ghost" onClick={() => setShowLog(true)}>
            Stock in/out log
          </button>
          <button className="btn btn--primary" onClick={() => setShowAdd(true)}>
            + Add item
          </button>
        </div>
      </div>

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="c-item">Item</div>
          <div className="c-cat">Category</div>
          <div className="c-num">In stock</div>
          <div className="c-num">Reorder at</div>
          <div className="c-status">Status</div>
          <div className="c-updated">Last updated</div>
          <div className="c-adjust">Adjust</div>
        </div>

        {loading && <div className="empty-state">Loading inventory…</div>}

        {!loading && items.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Package size={22} /></span>
            <div className="empty-state__title">No items tracked yet</div>
            <div className="empty-state__sub">
              Add your first item to start tracking stock levels and reorder alerts.
            </div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setShowAdd(true)}>
              + Add item
            </button>
          </div>
        )}

        {!loading && items.map((item) => {
          const s = statusOf(item);
          return (
            <div key={item.id} className="table-row inv-row" style={{ background: s.row }}>
              <div className="c-item strong">{item.name}</div>
              <div className="c-cat muted">{item.category}</div>
              <div className="c-num strong tnum">{item.stock} {item.unit}</div>
              <div className="c-num muted tnum">{item.reorderAt} {item.unit}</div>
              <div className="c-status"><span className={`pill ${s.tone}`}>{s.label}</span></div>
              <div className="c-updated muted">{item.updatedAt}</div>
              <div className="c-adjust">
                <button className="step" onClick={() => adjust(item.id, -1)} title="Stock out">−</button>
                <button className="step" onClick={() => adjust(item.id, +1)} title="Stock in">+</button>
                <button className="step step--danger" onClick={() => handleRemove(item)} title="Remove item">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddItemModal onClose={() => setShowAdd(false)} onSave={addItem} />}
      {showLog && <StockLogDrawer log={log} onClose={() => setShowLog(false)} />}

      <style>{`
        .inv-top { display: flex; align-items: flex-start; gap: 16px; }
        .inv-actions { display: flex; gap: 8px; padding-top: 4px; }
        .inv-row { margin: 0 -24px; padding: 0 24px; }

        .c-item { flex: 1.4; min-width: 0; }
        .c-cat { flex: 1; min-width: 0; }
        .c-num { width: 100px; text-align: right; }
        .c-status { width: 100px; }
        .c-updated { width: 130px; font-size: 12.5px; }
        .c-adjust { width: 110px; display: flex; justify-content: center; gap: 6px; }

        .step {
          width: 26px;
          height: 26px;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          background: var(--color-surface);
          color: var(--color-text-muted);
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .step:hover { background: var(--color-canvas); color: var(--color-text); }
        .step--danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }
      `}</style>
    </div>
  );
}
