import React, { useState } from 'react';
import { X, Trash2, History, Pencil, Plus } from 'lucide-react';
import { useUnitMaster } from '../../hooks/useMastersData';

/**
 * The full raw-material editor and the stock movement log.
 *
 * Lifted out of the old Inventory screen unchanged so the Raw Materials master
 * can reuse them: the grid handles bulk cleanup, these handle the per-item
 * details (units, conversion, barcode, reorder level) and the audit trail.
 */

const EMPTY_DRAFT = {
  name: '', categoryId: '', stock: '', unit: '', purchaseUnit: '',
  conversion: '1', barcode: '', reorderAt: '', rate: '', itemType: 'raw',
};

const MOVEMENT_TONE = {
  purchase: 'tone-green',
  transfer_in: 'tone-green',
  production_in: 'tone-green',
  opening: 'tone-blue',
  physical_count: 'tone-blue',
  adjustment: 'tone-neutral',
  consumption: 'tone-amber',
  wastage: 'tone-red',
  shortage: 'tone-red',
  transfer_out: 'tone-amber',
  purchase_return: 'tone-red',
};

const MOVEMENT_LABEL = {
  purchase: 'Purchase', purchase_return: 'Purchase return', consumption: 'Consumption',
  transfer_in: 'Transfer in', transfer_out: 'Transfer out', wastage: 'Wastage',
  shortage: 'Shortage', production_in: 'Production', production_out: 'Production use',
  adjustment: 'Adjustment', physical_count: 'Stock count', opening: 'Opening',
};

export function ItemModal({ item, categories, onClose, onSave, onAddCategory }) {
  // Units come from the Unit Master rather than being typed. Free text is how
  // "Kg", "kg" and "KG" became three different units in the first place, and
  // nothing could be totalled across them.
  const { units } = useUnitMaster();
  const [draft, setDraft] = useState(item ? {
    name: item.name,
    categoryId: item.categoryId || '',
    stock: '',
    unit: item.unit,
    purchaseUnit: item.purchaseUnit,
    conversion: String(item.conversion),
    barcode: item.barcode,
    reorderAt: String(item.reorderAt),
    rate: item.lastRate ?? '',
    itemType: item.itemType,
  } : EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);

  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });

  const dualUnit = (draft.purchaseUnit || '').trim() !== ''
    && (draft.purchaseUnit || '').trim() !== (draft.unit || '').trim();

  const submitCategory = async () => {
    const res = await onAddCategory(newCategory);
    if (res.success) {
      setDraft({ ...draft, categoryId: res.id });
      setNewCategory('');
      setAddingCategory(false);
    } else {
      setError(res.error);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const result = await onSave(draft);
    setSaving(false);
    if (result.success) onClose();
    else setError(result.error || 'Could not save the item.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">{item ? 'Edit item' : 'Add item'}</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="inv-error">{error}</div>}

          <div className="field">
            <label>Item name</label>
            <input value={draft.name} onChange={set('name')} placeholder="e.g. Paneer" required autoFocus />
          </div>

          <div className="field">
            <label>Category</label>
            {addingCategory ? (
              <div className="inv-newcat">
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="New category name"
                />
                <button type="button" className="btn btn--primary btn--sm" onClick={submitCategory}>Add</button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAddingCategory(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="inv-newcat">
                <select value={draft.categoryId} onChange={set('categoryId')}>
                  <option value="">Uncategorised</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAddingCategory(true)}>
                  <Plus size={14} /> New
                </button>
              </div>
            )}
          </div>

          <div className="field-grid">
            <div className="field">
              <label>Consumption unit</label>
              <select value={draft.unit} onChange={set('unit')}>
                <option value="">Select unit…</option>
                {units.filter((u) => u.is_active).map((u) => (
                  <option key={u.id} value={u.symbol}>{u.symbol}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Purchase unit</label>
              <select value={draft.purchaseUnit} onChange={set('purchaseUnit')}>
                <option value="">Same as consumption unit</option>
                {units.filter((u) => u.is_active).map((u) => (
                  <option key={u.id} value={u.symbol}>{u.symbol}</option>
                ))}
              </select>
            </div>

            {dualUnit && (
              <div className="field span-2">
                <label>
                  1 {draft.purchaseUnit.trim()} = how many {(draft.unit || 'units').trim()}?
                </label>
                <input
                  type="number" min="0.0001" step="any"
                  value={draft.conversion} onChange={set('conversion')}
                  placeholder="e.g. 25"
                />
              </div>
            )}

            {!item && (
              <div className="field">
                <label>Opening stock</label>
                <input
                  type="number" min="0" step="any"
                  value={draft.stock} onChange={set('stock')} placeholder="0"
                />
              </div>
            )}
            <div className="field">
              <label>Reorder at</label>
              <input
                type="number" min="0" step="any"
                value={draft.reorderAt} onChange={set('reorderAt')} placeholder="0"
              />
            </div>
            <div className="field">
              <label>Barcode</label>
              <input value={draft.barcode} onChange={set('barcode')} placeholder="Optional" />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={draft.itemType} onChange={set('itemType')}>
                <option value="raw">Raw material</option>
                <option value="semi_finished">Semi finished</option>
              </select>
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : item ? 'Save changes' : 'Add item'}
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
          .inv-newcat { display: flex; gap: 8px; align-items: center; }
          .inv-newcat select, .inv-newcat input { flex: 1; min-width: 0; }
        `}</style>
      </form>
    </div>
  );
}

export function StockLogDrawer({ log, onClose }) {
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
                <div className="card__subtitle">
                  <span className={`pill pill--sm ${MOVEMENT_TONE[entry.type] || 'tone-neutral'}`}>
                    {MOVEMENT_LABEL[entry.type] || entry.type}
                  </span>
                  {' '}{entry.at}
                </div>
              </div>
              {entry.delta !== 0 && (
                <span className={`pill ${entry.delta > 0 ? 'tone-green' : 'tone-amber'}`}>
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
