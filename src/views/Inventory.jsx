import React, { useMemo, useState } from 'react';
import { Package, X, Trash2, History, Pencil, Search, Plus } from 'lucide-react';
import { useInventoryData } from '../hooks/useInventoryData';
import { useOutlet } from '../context/OutletContext';

/**
 * The raw-material master: what the kitchen tracks, in what units, and how much
 * of it is on hand at the outlet currently selected in the header.
 *
 * Counting, buying, wasting and transferring all live on their own screens.
 * This one is the definition of an item — including the two units it lives in,
 * which is what makes "bought by the sack, cooked by the kilo" work everywhere
 * else in the module.
 */

const STATUS = {
  in: { label: 'In stock', tone: 'tone-green', row: 'transparent' },
  low: { label: 'Low', tone: 'tone-amber', row: '#FDFAF3' },
  out: { label: 'Out', tone: 'tone-red', row: '#FDF6F6' },
};

const levelOf = (item) => (item.outletStock ?? item.stock);

const statusOf = (item) => {
  const level = levelOf(item);
  if (level <= 0) return STATUS.out;
  if (level <= item.reorderAt) return STATUS.low;
  return STATUS.in;
};

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

function ItemModal({ item, categories, onClose, onSave, onAddCategory }) {
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
              <input value={draft.unit} onChange={set('unit')} placeholder="kg, pcs, litres" />
            </div>
            <div className="field">
              <label>Purchase unit</label>
              <input value={draft.purchaseUnit} onChange={set('purchaseUnit')} placeholder="Same as above" />
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

export default function Inventory() {
  const {
    items, categories, log, metrics, loading,
    adjust, addItem, updateItem, removeItem, addCategory,
  } = useInventoryData();
  const { outlet, isMultiOutlet } = useOutlet();

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter && i.categoryId !== categoryFilter) return false;
      if (q && !i.name.toLowerCase().includes(q) && !i.barcode.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, categoryFilter]);

  const cards = [
    { label: 'Items tracked', value: metrics.tracked, color: 'var(--color-text)' },
    { label: 'Low stock', value: metrics.low, color: 'var(--color-warning)' },
    { label: 'Out of stock', value: metrics.out, color: 'var(--color-danger)' },
    { label: 'Stock value', value: `₹${metrics.value.toFixed(0)}`, color: 'var(--color-text)' },
  ];

  const handleRemove = (item) => {
    if (!window.confirm(`Remove ${item.name} from inventory?`)) return;
    removeItem(item.id);
  };

  return (
    <div className="page">
      <div className="inv-top">
        <div className="metric-grid metric-grid--4" style={{ flex: 1 }}>
          {cards.map((c) => (
            <div key={c.label} className="metric-card">
              <div className="metric-card__label">{c.label}</div>
              <div className="metric-card__value metric-card__value--sm" style={{ color: c.color }}>
                {c.value}
              </div>
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

      <div className="inv-tools">
        <div className="search-input inv-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search raw material or barcode"
          />
        </div>
        <select
          className="inv-cat"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {isMultiOutlet && outlet && (
          <span className="inv-outlet">Stock shown for {outlet.name}</span>
        )}
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

        {!loading && items.length > 0 && visible.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__sub">No item matches these filters.</div>
          </div>
        )}

        {!loading && visible.map((item) => {
          const s = statusOf(item);
          const level = levelOf(item);
          return (
            <div key={item.id} className="table-row inv-row" style={{ background: s.row }}>
              <div className="c-item">
                <div className="strong">{item.name}</div>
                {item.purchaseUnit !== item.unit && (
                  <div className="inv-conv">
                    1 {item.purchaseUnit} = {item.conversion} {item.unit}
                  </div>
                )}
              </div>
              <div className="c-cat muted">{item.category}</div>
              <div className="c-num strong tnum">{level} {item.unit}</div>
              <div className="c-num muted tnum">{item.reorderAt} {item.unit}</div>
              <div className="c-status"><span className={`pill ${s.tone}`}>{s.label}</span></div>
              <div className="c-updated muted">{item.updatedAt}</div>
              <div className="c-adjust">
                <button className="step" onClick={() => adjust(item.id, -1)} title="Stock out">−</button>
                <button className="step" onClick={() => adjust(item.id, +1)} title="Stock in">+</button>
                <button className="step" onClick={() => setEditing(item)} title="Edit item">
                  <Pencil size={12} />
                </button>
                <button className="step step--danger" onClick={() => handleRemove(item)} title="Remove item">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <ItemModal
          categories={categories}
          onClose={() => setShowAdd(false)}
          onSave={addItem}
          onAddCategory={addCategory}
        />
      )}
      {editing && (
        <ItemModal
          item={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={(draft) => updateItem(editing.id, draft)}
          onAddCategory={addCategory}
        />
      )}
      {showLog && <StockLogDrawer log={log} onClose={() => setShowLog(false)} />}

      <style>{`
        .inv-top { display: flex; align-items: flex-start; gap: 16px; }
        .inv-actions { display: flex; gap: 8px; padding-top: 4px; }
        .inv-row { margin: 0 -24px; padding: 0 24px; }
        .inv-conv { font-size: 11.5px; color: var(--color-text-muted); }

        .inv-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .inv-search { flex: 1; min-width: 220px; }
        .inv-cat {
          height: 40px; padding: 0 10px; border: 1px solid var(--color-border);
          border-radius: var(--radius-md); background: var(--color-surface);
          font: inherit; font-size: 13px; font-weight: 600; color: var(--color-text);
        }
        .inv-outlet { font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }

        .c-item { flex: 1.4; min-width: 0; }
        .c-cat { flex: 1; min-width: 0; }
        .c-num { width: 100px; text-align: right; }
        .c-status { width: 100px; }
        .c-updated { width: 130px; font-size: 12.5px; }
        .c-adjust { width: 140px; display: flex; justify-content: center; gap: 6px; }
        .tnum { font-variant-numeric: tabular-nums; }

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
