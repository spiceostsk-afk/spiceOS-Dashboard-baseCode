import React, { useMemo, useState } from 'react';
import {
  Plus, X, ChefHat, Trash2, ArrowDown, ArrowUp, CheckCircle2,
} from 'lucide-react';
import { useProductionData } from '../../hooks/useStockOps';
import { useOutlet } from '../../context/OutletContext';
import {
  useLines, ItemSelect, UnitSelect, AddLineButton, RemoveLineButton, LineEditorStyles,
} from './lineEditor';
import { ConfirmDelete } from '../masters/masterDialogs';
import { MastersStyles } from '../masters/mastersUi';
import { fmtDate } from '../../lib/dates';

/**
 * Production — what the kitchen made today.
 *
 * The missing half of stock control. Recipes take Rumali Roti, Fry Tikka and
 * Korma Gravy out when a dish is sold, but nobody buys those from a supplier —
 * the kitchen makes them. Without a way to record the making, they can only
 * ever fall, which is why seventeen materials have never had a single unit put
 * in and sit permanently below zero.
 *
 * A batch has two sides. What was MADE comes into stock; what it was made FROM
 * goes out. Recording only the first would fix the roti and quietly break the
 * flour, so both post together or not at all.
 *
 * The inputs are optional on purpose. "We made 30 roti today" is worth
 * recording on its own, and is a great deal better than the nothing that is
 * there now; the ingredient side can be filled in once the kitchen is used to
 * the screen.
 */

const today = () => new Date().toISOString().slice(0, 10);


const STATUS_TONE = { draft: 'tone-neutral', posted: 'tone-green', cancelled: 'tone-neutral' };

/* ------------------------------------------------------------------- form */
/**
 * One half of a batch.
 *
 * At module scope, not inside BatchForm: a component defined during render
 * is a new type on every render, so React unmounts and remounts the whole
 * subtree — and the quantity input would lose focus after every keystroke.
 */
function Side({ side, label, hint, tone, exclude, items, itemById }) {
  return (
    <div className="pr-side">
      <div className={`pr-side__head ${tone}`}>
        {tone === 'in' ? <ArrowDown size={15} /> : <ArrowUp size={15} />}
        <div>
          <div className="pr-side__title">{label}</div>
          <div className="pr-side__hint">{hint}</div>
        </div>
      </div>

      <div className="ln-table">
        <div className="ln-head">
          <div className="ln-c-item">Raw material</div>
          <div className="ln-c-qty">Qty</div>
          <div className="ln-c-unit">Unit</div>
          <div className="ln-c-reason">In stock now</div>
          <div className="ln-c-x" />
        </div>

        {side.lines.map((l) => {
          const item = itemById.get(l.inventoryItemId);
          return (
            <div key={l.key} className="ln-row">
              <div className="ln-c-item">
                <ItemSelect
                  items={items}
                  value={l.inventoryItemId}
                  exclude={exclude}
                  onChange={(id) => side.updateLine(l.key, {
                    inventoryItemId: id, entryUnit: 'base',
                  })}
                />
              </div>
              <div className="ln-c-qty">
                <input
                  className="ln-input" type="number" step="any" min="0"
                  value={l.qty}
                  onChange={(e) => side.updateLine(l.key, { qty: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="ln-c-unit">
                <UnitSelect
                  item={item}
                  value={l.entryUnit}
                  onChange={(u) => side.updateLine(l.key, { entryUnit: u })}
                />
              </div>
              <div className="ln-c-reason">
                {item ? (
                  <span className={Number(item.stock) < 0 ? 'ln-warn' : 'pr-have'}>
                    {item.stock} {item.unit}
                  </span>
                ) : <span className="pr-have">—</span>}
              </div>
              <div className="ln-c-x">
                <RemoveLineButton onClick={() => side.removeLine(l.key)} />
              </div>
            </div>
          );
        })}

        <AddLineButton onClick={side.addLine} />
      </div>
    </div>
    );
}

function BatchForm({ items, onClose, onSave }) {
  const outputs = useLines();
  const inputs = useLines();

  const [head, setHead] = useState({ madeOn: today(), batchNo: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const chosenOut = outputs.lines.map((l) => l.inventoryItemId).filter(Boolean);
  const chosenIn = inputs.lines.map((l) => l.inventoryItemId).filter(Boolean);

  const filled = outputs.lines.filter((l) => l.inventoryItemId && Number(l.qty) > 0).length;

  const submit = async () => {
    setSaving(true);
    setError('');
    const res = await onSave({ ...head, outputs: outputs.lines, inputs: inputs.lines });
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error || 'Could not save the batch.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">Record production</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="pr-error">{error}</div>}

          <div className="pr-head">
            <div className="field">
              <label>Made on</label>
              <input
                type="date"
                value={head.madeOn}
                max={today()}
                onChange={(e) => setHead({ ...head, madeOn: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Batch reference</label>
              <input
                value={head.batchNo}
                onChange={(e) => setHead({ ...head, batchNo: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>

          <Side
            side={outputs}
            tone="in"
            label="What was made"
            hint="Comes into stock, dated the day it was cooked."
            exclude={chosenOut}
            items={items}
            itemById={itemById}
          />

          <Side
            side={inputs}
            tone="out"
            label="What it was made from"
            hint="Goes out of stock. Optional — leave it empty and only the output is recorded."
            exclude={chosenIn}
            items={items}
            itemById={itemById}
          />

          <div className="field">
            <label>Note</label>
            <input
              value={head.note}
              onChange={(e) => setHead({ ...head, note: e.target.value })}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={saving || filled === 0}>
            {saving ? 'Saving…' : <><CheckCircle2 size={15} /> Record batch</>}
          </button>
        </div>

        <LineEditorStyles />
        <style>{`
          .modal--wide { width: 900px; }
          .pr-error {
            padding: 12px 14px; border-radius: var(--radius-md);
            background: var(--color-danger-soft); color: var(--color-danger);
            font-size: 13px; font-weight: 600;
          }
          .pr-head { display: grid; grid-template-columns: 200px 1fr; gap: 14px; }
          .pr-side {
            padding: 14px; border-radius: var(--radius-lg);
            border: 1px solid var(--color-border); background: var(--color-canvas);
            display: flex; flex-direction: column; gap: 12px;
          }
          .pr-side__head { display: flex; align-items: flex-start; gap: 9px; }
          .pr-side__head.in { color: var(--color-success, #16A34A); }
          .pr-side__head.out { color: var(--color-warning); }
          .pr-side__title { font-size: 13.5px; font-weight: 700; color: var(--color-text); }
          .pr-side__hint { font-size: 12px; color: var(--color-text-muted); font-weight: 500; }
          .pr-have { font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }
        `}</style>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ screen */
export default function Production() {
  const { batches, items, loading, error, saveBatch, cancelBatch } = useProductionData();
  const { outlet, isMultiOutlet } = useOutlet();

  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [notice, setNotice] = useState(null);

  const flash = (msg, bad = false) => {
    setNotice({ msg, bad });
    setTimeout(() => setNotice(null), 4500);
  };

  const save = async (draft) => {
    const res = await saveBatch(draft);
    if (res.success) {
      const r = res.result || {};
      flash(
        `Recorded ${r.made} item${r.made === 1 ? '' : 's'} made on ${fmtDate(draft.madeOn)}`
        + `${r.used ? `, using ${r.used} ingredient${r.used === 1 ? '' : 's'}` : ''}.`,
      );
    }
    return res;
  };

  const doCancel = async () => {
    const res = await cancelBatch(cancelling.id);
    setCancelling(null);
    flash(res.success
      ? 'Batch cancelled — every movement it made has been reversed.'
      : res.error, !res.success);
  };

  return (
    <div className="page">
      <div className="pr-top">
        <div>
          <h2 className="pr-title">Production</h2>
          <div className="card__subtitle">
            What the kitchen made{isMultiOutlet && outlet ? ` at ${outlet.name}` : ''}
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => setCreating(true)}>
          <Plus size={15} /> Record production
        </button>
      </div>

      {notice && <div className={`mst-note ${notice.bad ? 'bad' : ''}`}>{notice.msg}</div>}
      {error && (
        <div className="mst-note bad">
          Production is not set up yet — run db/migrate_production.sql. ({error})
        </div>
      )}

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="pc-date">Date</div>
          <div className="pc-ref">Batch</div>
          <div className="pc-made">Made</div>
          <div className="pc-used">Used</div>
          <div className="pc-status">Status</div>
          <div className="pc-act" />
        </div>

        {loading && <div className="empty-state">Loading production…</div>}

        {!loading && batches.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><ChefHat size={22} /></span>
            <div className="empty-state__title">Nothing recorded yet</div>
            <div className="empty-state__sub">
              Semi-finished materials are consumed by recipes but never bought, so
              until a batch is recorded they can only fall. Record what the kitchen
              made and their balances start telling the truth.
            </div>
          </div>
        )}

        {!loading && batches.map((b) => {
          const lines = b.production_items || [];
          const made = lines.filter((l) => l.role === 'output');
          const used = lines.filter((l) => l.role === 'input');
          return (
            <div key={b.id} className="table-row pc-row">
              <div className="pc-date muted">{fmtDate(b.made_on)}</div>
              <div className="pc-ref strong" title={b.batch_no || ''}>{b.batch_no || '—'}</div>
              <div className="pc-made">
                {made.map((l) => (
                  <span key={l.id} className="pc-chip">
                    {l.inventory_items?.item_name} {l.qty_base} {l.inventory_items?.unit}
                  </span>
                ))}
              </div>
              <div className="pc-used muted">
                {used.length === 0 ? '—' : `${used.length} ingredient${used.length === 1 ? '' : 's'}`}
              </div>
              <div className="pc-status">
                <span className={`pill pill--sm ${STATUS_TONE[b.status] || 'tone-neutral'}`}>
                  {b.status}
                </span>
              </div>
              <div className="pc-act">
                {b.status === 'posted' && (
                  <button
                    className="mini mini--danger"
                    onClick={() => setCancelling(b)}
                    title="Cancel this batch"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {creating && (
        <BatchForm items={items} onClose={() => setCreating(false)} onSave={save} />
      )}

      {cancelling && (
        <ConfirmDelete
          title="Cancel this batch?"
          subject={`Batch of ${fmtDate(cancelling.made_on)}`}
          permanent={false}
          confirmLabel="Cancel batch"
          consequences={[
            'Every movement this batch made is reversed, so the stock it added comes back out and the ingredients it used go back in.',
            'The batch and its reversal both stay on the ledger — nothing is erased.',
          ]}
          onCancel={() => setCancelling(null)}
          onConfirm={doCancel}
        />
      )}

      <MastersStyles />
      <style>{`
        .pr-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .pr-title { font-size: 20px; font-weight: 800; margin: 0; }

        .pc-row { margin: 0 -24px; padding: 0 24px; }
        .pc-date { width: 130px; }
        .pc-ref {
          width: 150px; min-width: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pc-made { flex: 1.6; min-width: 0; display: flex; gap: 5px; overflow: hidden; }
        .pc-used { width: 130px; }
        .pc-status { width: 96px; }
        .pc-act { width: 60px; display: flex; justify-content: flex-end; }

        .pc-chip {
          padding: 2px 8px; border-radius: 999px; white-space: nowrap;
          font-size: 11.5px; font-weight: 600;
          background: var(--color-well, #F6F7F9); color: var(--color-text-soft);
          border: 1px solid var(--color-border-soft);
        }

        .mini {
          width: 28px; height: 28px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface); color: var(--color-text-muted);
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .mini:hover { background: var(--color-canvas); color: var(--color-text); }
        .mini--danger:hover { background: var(--color-danger-soft); color: var(--color-danger); }
      `}</style>
    </div>
  );
}
