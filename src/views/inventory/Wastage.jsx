import React, { useMemo, useState } from 'react';
import { Plus, X, Trash2, Eye, Pencil } from 'lucide-react';
import { useWastageData, WASTAGE_REASONS } from '../../hooks/useStockOps';
import {
  useLines, ItemSelect, UnitSelect, AddLineButton, RemoveLineButton, LineEditorStyles,
} from './lineEditor';
import { ConfirmDelete, DetailDrawer } from '../masters/masterDialogs';
import { MastersStyles } from '../masters/mastersUi';
import { fmtDate } from '../../lib/dates';

/**
 * Wastage — stock that left without being sold.
 *
 * Recording it is what stops the closing count from looking like theft. A
 * variance with a wastage entry behind it is an explained loss; the same
 * variance without one is a question nobody can answer a week later.
 */

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);


function WastageForm({ items, existing, onClose, onSave }) {
  const { lines, addLine, updateLine, removeLine, setLines } = useLines();
  const [head, setHead] = useState(() => (existing
    ? { wastedOn: existing.wasted_on, note: existing.note || '' }
    : { wastedOn: today(), note: '' }));

  React.useEffect(() => {
    if (!existing) return;
    const rows = (existing.stock_wastage_items || []).map((l, i) => ({
      key: `e${i}`,
      inventoryItemId: l.inventory_item_id,
      qty: String(l.qty_base),
      entryUnit: 'base',
      rate: '', taxPct: '',
      reason: l.reason || 'Spoilage',
    }));
    if (rows.length) setLines(rows);
  }, [existing, setLines]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const chosen = lines.map((l) => l.inventoryItemId).filter(Boolean);

  const estimate = lines.reduce((sum, l) => {
    const item = itemById.get(l.inventoryItemId);
    if (!item) return sum;
    const qty = Number(l.qty) || 0;
    const base = l.entryUnit === 'purchase' ? qty * (Number(item.conversion_factor) || 1) : qty;
    return sum + base * (Number(item.last_purchase_rate) || 0);
  }, 0);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const res = await onSave({ ...head, lines });
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error || 'Could not record the wastage.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">{existing ? 'Edit wastage' : 'Record wastage'}</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="wf-error">{error}</div>}

          <div className="wf-head">
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={head.wastedOn}
                onChange={(e) => setHead({ ...head, wastedOn: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>Note</label>
              <input
                value={head.note}
                onChange={(e) => setHead({ ...head, note: e.target.value })}
                placeholder="Optional — e.g. fridge failure overnight"
              />
            </div>
          </div>

          <div className="ln-table">
            <div className="ln-head">
              <div className="ln-c-item">Raw material</div>
              <div className="ln-c-qty">Qty</div>
              <div className="ln-c-unit">Unit</div>
              <div className="ln-c-reason">Reason</div>
              <div className="ln-c-x" />
            </div>

            {lines.map((l) => {
              const item = itemById.get(l.inventoryItemId);
              const qty = Number(l.qty) || 0;
              const base = item && l.entryUnit === 'purchase'
                ? qty * (Number(item.conversion_factor) || 1) : qty;
              const short = item && base > Number(item.stock || 0);

              return (
                <div key={l.key} className="ln-row">
                  <div className="ln-c-item">
                    <ItemSelect
                      items={items}
                      value={l.inventoryItemId}
                      exclude={chosen}
                      onChange={(id) => updateLine(l.key, { inventoryItemId: id, entryUnit: 'base' })}
                    />
                  </div>
                  <div className="ln-c-qty">
                    <input
                      className="ln-input" type="number" step="any" min="0"
                      value={l.qty}
                      onChange={(e) => updateLine(l.key, { qty: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="ln-c-unit">
                    <UnitSelect
                      item={item}
                      value={l.entryUnit}
                      onChange={(u) => updateLine(l.key, { entryUnit: u })}
                    />
                  </div>
                  <div className="ln-c-reason">
                    <select
                      className="ln-select"
                      value={l.reason}
                      onChange={(e) => updateLine(l.key, { reason: e.target.value })}
                    >
                      {WASTAGE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="ln-c-x"><RemoveLineButton onClick={() => removeLine(l.key)} /></div>

                  {short && (
                    <div className="ln-warn" style={{ flexBasis: '100%' }}>
                      More than the {item.stock} {item.unit} on record — stock will go negative.
                    </div>
                  )}
                </div>
              );
            })}

            <AddLineButton onClick={addLine} />
          </div>

          <div className="wf-total">
            <span>Estimated value at last purchase rate</span>
            <strong>{money(estimate)}</strong>
          </div>
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Record wastage'}
          </button>
        </div>

        <style>{`
          .modal--wide { width: 880px; }
          .wf-error {
            padding: 12px 14px; border-radius: var(--radius-md);
            background: var(--color-danger-soft); color: var(--color-danger);
            font-size: 13px; font-weight: 600;
          }
          .wf-head { display: grid; grid-template-columns: 200px 1fr; gap: 14px; }
          .wf-total {
            display: flex; align-items: center; justify-content: space-between;
            padding-top: 12px; border-top: 1px solid var(--color-border);
            font-size: 12.5px; font-weight: 600; color: var(--color-text-muted);
          }
          .wf-total strong { font-size: 18px; color: var(--color-warning); }
          @media (max-width: 880px) { .wf-head { grid-template-columns: 1fr; } }
        `}</style>
        <LineEditorStyles />
      </form>
    </div>
  );
}

export default function Wastage() {
  const {
    entries, items, loading, error, saveWastage, updateWastage, deleteWastage,
  } = useWastageData();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delError, setDelError] = useState('');
  const [notice, setNotice] = useState(null);

  const flash = (msg, tone = 'ok') => {
    setNotice({ msg, tone });
    setTimeout(() => setNotice(null), 3600);
  };

  const confirmDelete = async () => {
    setBusy(true);
    setDelError('');
    const res = await deleteWastage(deleting.id);
    setBusy(false);
    if (res.success) { flash('Wastage entry deleted.'); setDeleting(null); }
    else setDelError(res.error);
  };

  const totals = entries.reduce((acc, e) => {
    if (e.status === 'posted') {
      acc.value += Number(e.total_value) || 0;
      acc.count += 1;
      acc.lines += (e.stock_wastage_items || []).length;
    }
    return acc;
  }, { value: 0, count: 0, lines: 0 });

  return (
    <div className="page">
      <div className="wa-top">
        <div className="metric-grid metric-grid--3" style={{ flex: 1 }}>
          <div className="metric-card">
            <div className="metric-card__label">Wastage entries</div>
            <div className="metric-card__value">{totals.count}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Items written off</div>
            <div className="metric-card__value">{totals.lines}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Value lost</div>
            <div className="metric-card__value metric-card__value--sm" style={{ color: 'var(--color-warning)' }}>
              {money(totals.value)}
            </div>
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => setShowForm(true)}>
          <Plus size={15} /> Record wastage
        </button>
      </div>

      {notice && <div className={`mst-note ${notice.tone === 'bad' ? 'bad' : ''}`}>{notice.msg}</div>}
      {error && <div className="wa-error">{error}</div>}

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="wc-date">Date</div>
          <div className="wc-items">Items</div>
          <div className="wc-note">Note</div>
          <div className="wc-value">Value</div>
          <div className="wc-act" />
        </div>

        {loading && <div className="empty-state">Loading wastage…</div>}

        {!loading && entries.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><Trash2 size={22} /></span>
            <div className="empty-state__title">No wastage recorded</div>
            <div className="empty-state__sub">
              Logging spoilage and spillage as it happens is what turns an unexplained
              variance at closing into a number you can account for.
            </div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setShowForm(true)}>
              <Plus size={15} /> Record wastage
            </button>
          </div>
        )}

        {!loading && entries.map((e) => {
          const lines = e.stock_wastage_items || [];
          return (
            <React.Fragment key={e.id}>
              <div className="table-row wa-row">
                <div className="wc-date strong">{fmtDate(e.wasted_on)}</div>
                <div className="wc-items muted">{lines.length}</div>
                <div className="wc-note muted">{e.note || '—'}</div>
                <div className="wc-value amount">{money(e.total_value)}</div>
                <div className="wc-act">
                  <button className="mini" onClick={() => setViewing(e)} title="View">
                    <Eye size={14} />
                  </button>
                  <button className="mini" onClick={() => setEditing(e)} title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button
                    className="mini mini--danger"
                    onClick={() => { setDelError(''); setDeleting(e); }}
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

            </React.Fragment>
          );
        })}
      </div>

      {showForm && (
        <WastageForm items={items} onClose={() => setShowForm(false)} onSave={saveWastage} />
      )}

      {editing && (
        <WastageForm
          items={items}
          existing={editing}
          onClose={() => setEditing(null)}
          onSave={(draft) => updateWastage(editing.id, draft)}
        />
      )}

      {viewing && (
        <DetailDrawer
          title={`Wastage — ${fmtDate(viewing.wasted_on)}`}
          subtitle={viewing.note || 'No note'}
          meta={[
            { label: 'Status', value: viewing.status },
            { label: 'Items', value: (viewing.stock_wastage_items || []).length },
            { label: 'Value lost', value: money(viewing.total_value) },
          ]}
          lines={viewing.stock_wastage_items || []}
          columns={[
            { key: 'name', label: 'Raw material', flex: 2,
              render: (l) => l.inventory_items?.item_name || 'Item' },
            { key: 'qty', label: 'Quantity', align: 'right',
              render: (l) => `${l.qty_base} ${l.inventory_items?.unit || ''}` },
            { key: 'reason', label: 'Reason', flex: 1.2,
              render: (l) => <span className="pill tone-amber pill--sm">{l.reason}</span> },
          ]}
          footer={<><span>Value lost</span><strong>{money(viewing.total_value)}</strong></>}
          onClose={() => setViewing(null)}
        />
      )}

      {deleting && (
        <ConfirmDelete
          title="Delete wastage entry"
          subject={`Wastage — ${fmtDate(deleting.wasted_on)}, ${money(deleting.total_value)}`}
          permanent
          busy={busy}
          error={delError}
          consequences={[
            `All ${(deleting.stock_wastage_items || []).length} written-off line${(deleting.stock_wastage_items || []).length === 1 ? '' : 's'} are removed.`,
            'The stock this entry wrote off is PUT BACK, and the affected balances are rebuilt from the ledger.',
            'The Stock Summary for its date will report differently afterwards.',
          ]}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}

      <MastersStyles />
      <style>{`
        .wa-top { display: flex; align-items: flex-start; gap: 16px; }
        .wa-error {
          padding: 12px 14px; border-radius: var(--radius-md);
          background: var(--color-danger-soft); color: var(--color-danger);
          font-size: 13px; font-weight: 600;
        }
        .wa-row { margin: 0 -24px; padding: 0 24px; }
        .wc-date { width: 150px; }
        .wc-items { width: 70px; text-align: center; }
        .wc-note { flex: 1; min-width: 0; }
        .wc-value { width: 120px; text-align: right; }
        .wc-act { width: 60px; display: flex; justify-content: flex-end; }

        .mini {
          width: 28px; height: 28px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface); color: var(--color-text-muted);
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .mini:hover { background: var(--color-canvas); color: var(--color-text); }
        .mini.on { transform: rotate(180deg); }

        .wa-detail {
          margin: 0 -24px; padding: 12px 24px 16px;
          background: var(--color-canvas); border-bottom: 1px solid var(--color-border-soft);
        }
        .wa-detail__row {
          display: flex; align-items: center; gap: 14px; padding: 6px 0; font-size: 12.5px;
        }
        .wa-detail__row .strong { flex: 1.5; }
        .wa-detail__row .muted { width: 130px; color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}
