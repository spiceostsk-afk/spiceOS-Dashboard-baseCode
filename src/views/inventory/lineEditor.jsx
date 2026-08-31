import React, { useCallback, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';

/**
 * The bits every stock document shares: a growing list of lines, each naming
 * an item and a quantity in one of that item's two units.
 *
 * Purchase, wastage and transfer all need exactly this and then differ by a
 * column or two, so the pieces live here and each screen lays out its own
 * table rather than bending one component into three shapes.
 */

let seq = 0;
const newLine = () => ({
  key: `l${(seq += 1)}`,
  inventoryItemId: '',
  qty: '',
  entryUnit: 'base',
  rate: '',
  taxPct: '',
  reason: 'Spoilage',
});

export function useLines() {
  const [lines, setLines] = useState([newLine()]);

  const addLine = useCallback(() => setLines((l) => [...l, newLine()]), []);

  const updateLine = useCallback((key, patch) => {
    setLines((l) => l.map((ln) => (ln.key === key ? { ...ln, ...patch } : ln)));
  }, []);

  const removeLine = useCallback((key) => {
    // Never leave the operator with no row to type in.
    setLines((l) => (l.length === 1 ? [newLine()] : l.filter((ln) => ln.key !== key)));
  }, []);

  const reset = useCallback(() => setLines([newLine()]), []);

  return { lines, addLine, updateLine, removeLine, reset, setLines };
}

export function ItemSelect({ items, value, onChange, exclude = [] }) {
  return (
    <select
      className="ln-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Raw material"
    >
      <option value="">Select raw material…</option>
      {items
        .filter((i) => i.id === value || !exclude.includes(i.id))
        .map((i) => <option key={i.id} value={i.id}>{i.item_name}</option>)}
    </select>
  );
}

/** Only offered when the item actually has two units; otherwise a plain label. */
export function UnitSelect({ item, value, onChange }) {
  const base = item?.unit || 'units';
  const purchase = item?.purchase_unit || base;

  if (!item || purchase === base) {
    return <span className="ln-unit">{base}</span>;
  }

  return (
    <select
      className="ln-select ln-select--unit"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Unit"
    >
      <option value="base">{base}</option>
      <option value="purchase">{purchase}</option>
    </select>
  );
}

export function AddLineButton({ onClick }) {
  return (
    <button type="button" className="ln-add" onClick={onClick}>
      <Plus size={14} /> Add another item
    </button>
  );
}

export function RemoveLineButton({ onClick }) {
  return (
    <button type="button" className="ln-remove" onClick={onClick} title="Remove line">
      <Trash2 size={14} />
    </button>
  );
}

/** Shared styling for every line table. Rendered once per screen. */
export function LineEditorStyles() {
  return (
    <style>{`
      .ln-table { display: flex; flex-direction: column; gap: 8px; }
      .ln-head, .ln-row { display: flex; align-items: center; gap: 10px; }
      .ln-head {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.04em; color: var(--color-text-muted);
        padding-bottom: 2px;
      }

      .ln-select, .ln-input {
        height: 38px; padding: 0 10px;
        border: 1px solid var(--color-border); border-radius: var(--radius-md);
        background: var(--color-surface); font: inherit; font-size: 13px;
        color: var(--color-text); outline: none; width: 100%; box-sizing: border-box;
      }
      .ln-select:focus, .ln-input:focus { border-color: var(--color-border-strong); }
      .ln-input { font-variant-numeric: tabular-nums; }
      .ln-select--unit { padding: 0 4px; }
      .ln-unit {
        display: flex; align-items: center; height: 38px;
        font-size: 12.5px; font-weight: 600; color: var(--color-text-muted);
      }

      .ln-c-item { flex: 2; min-width: 0; }
      .ln-c-qty { width: 96px; flex-shrink: 0; }
      .ln-c-unit { width: 92px; flex-shrink: 0; }
      .ln-c-rate { width: 96px; flex-shrink: 0; }
      .ln-c-tax { width: 76px; flex-shrink: 0; }
      .ln-c-reason { flex: 1; min-width: 130px; }
      .ln-c-amount {
        width: 104px; flex-shrink: 0; text-align: right;
        font-weight: 700; font-variant-numeric: tabular-nums;
      }
      .ln-c-x { width: 32px; flex-shrink: 0; }

      .ln-add {
        align-self: flex-start; display: inline-flex; align-items: center; gap: 6px;
        border: 1px dashed var(--color-border); border-radius: var(--radius-md);
        background: none; padding: 9px 13px; font: inherit; font-size: 13px;
        font-weight: 600; color: var(--color-text-muted); cursor: pointer;
      }
      .ln-add:hover { border-color: var(--color-border-strong); color: var(--color-text); }

      .ln-remove {
        width: 32px; height: 32px; border: none; background: none;
        color: var(--color-text-faint); border-radius: 8px;
        display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
      }
      .ln-remove:hover { background: var(--color-danger-soft); color: var(--color-danger); }

      .ln-warn { font-size: 11.5px; font-weight: 600; color: var(--color-warning); }

      @media (max-width: 880px) {
        .ln-head { display: none; }
        .ln-row { flex-wrap: wrap; padding-bottom: 10px; border-bottom: 1px solid var(--color-border-soft); }
        .ln-c-item { flex-basis: 100%; }
      }
    `}</style>
  );
}
