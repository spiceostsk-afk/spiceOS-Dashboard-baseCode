import React, { useEffect, useMemo, useState } from 'react';
import { X, AlertTriangle, Plus, Trash2, ShieldAlert } from 'lucide-react';
import SearchSelect from '../components/SearchSelect';
import { supabase } from '../lib/supabase';

/**
 * Correcting a bill that has already been settled.
 *
 * Every one of these demands a reason before it will submit, because the whole
 * point is that someone will ask later why yesterday's total changed. The
 * reason is stored with a before-and-after snapshot in order_audit.
 *
 * The warnings are specific rather than generic. "This cannot be undone" tells
 * a manager nothing they did not know; "the ingredients go back to stock and
 * the sales report for 1 Sep will read differently" tells them what they are
 * actually about to do.
 */

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;

function ReasonField({ value, onChange, placeholder }) {
  return (
    <div className="field">
      <label>Reason — required, and kept on record</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus
      />
    </div>
  );
}

/* ------------------------------------------------------------------- Void */
export function VoidOrderModal({ order, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('A reason is required.'); return; }
    const res = await onConfirm(order.id, reason.trim());
    if (res.success) onClose(); else setError(res.error);
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">Void this bill</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}

          <div className="oa-banner">
            <AlertTriangle size={17} />
            <div>
              <strong>{order.billNo || 'This bill'} · {money(order.amount)}</strong>
              <div>
                The revenue is reversed and the ingredients go back to stock. The sales
                report for this date will read differently afterwards.
              </div>
            </div>
          </div>

          <ReasonField
            value={reason}
            onChange={setReason}
            placeholder="e.g. Punched on the wrong table"
          />
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--danger" disabled={busy || !reason.trim()}>
            {busy ? 'Voiding…' : 'Void bill'}
          </button>
        </div>
        <OrderAdminStyles />
      </form>
    </div>
  );
}

/* ----------------------------------------------------------------- Delete */
export function DeleteOrderModal({ order, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('A reason is required.'); return; }
    const res = await onConfirm(order.id, reason.trim());
    if (res.success) onClose(); else setError(res.error);
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">Delete this bill</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}

          <div className="oa-banner danger">
            <AlertTriangle size={17} />
            <div>
              <strong>This will be permanently deleted.</strong>
              <div>
                {order.billNo || 'The bill'} · {money(order.amount)} · {order.items} item
                {order.items === 1 ? '' : 's'} disappears from sales entirely, and its
                ingredients return to stock. Voiding keeps the record and is usually the
                better choice.
              </div>
            </div>
          </div>

          <div className="oa-keep">
            The audit entry survives the deletion, so there is still a record of who
            removed it and why.
          </div>

          <ReasonField
            value={reason}
            onChange={setReason}
            placeholder="e.g. Duplicate of bill #1DE4"
          />
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--danger" disabled={busy || !reason.trim()}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
        <OrderAdminStyles />
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------- Edit */
let seq = 0;
const blank = () => ({ key: `e${(seq += 1)}`, menuItemId: '', quantity: '', price: '' });

export function EditOrderModal({ order, busy, onClose, onConfirm }) {
  const [dishes, setDishes] = useState([]);
  const [lines, setLines] = useState(() => (order.lines?.length
    ? order.lines.map((l, i) => ({
      key: `o${i}`,
      menuItemId: l.menuItemId || '',
      quantity: String(l.qty ?? ''),
      price: String(l.price ?? ''),
    }))
    : [blank()]));
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('menu_items')
      .select('id, item_name, price')
      .order('item_name')
      .then(({ data }) => setDishes(data || []));
  }, []);

  const byId = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const chosen = lines.map((l) => l.menuItemId).filter(Boolean);

  const setLine = (key, patch) =>
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key) =>
    setLines((p) => (p.length === 1 ? [blank()] : p.filter((l) => l.key !== key)));

  const newSubtotal = lines.reduce((sum, l) => {
    if (!l.menuItemId || !(Number(l.quantity) > 0)) return sum;
    const unit = l.price === '' ? Number(byId.get(l.menuItemId)?.price) || 0 : Number(l.price) || 0;
    return sum + unit * Number(l.quantity);
  }, 0);

  const submit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setError('A reason is required.'); return; }
    const res = await onConfirm(order.id, lines, reason.trim());
    if (res.success) onClose(); else setError(res.error);
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <form className="modal modal--wide" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal__head">
          <div className="modal__title">Edit {order.billNo || 'bill'}</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="mst-note bad">{error}</div>}

          <div className="oa-banner">
            <ShieldAlert size={17} />
            <div>
              <strong>This rewrites a bill that has already been reported.</strong>
              <div>
                Stock moves by the difference and is dated to the original bill, so the
                sales and stock reports for that day will both read differently
                afterwards. The change is recorded against your name.
              </div>
            </div>
          </div>

          <div className="oa-head">
            <div className="oa-dish">Dish</div>
            <div className="oa-qty">Qty</div>
            <div className="oa-price">Unit price</div>
            <div className="oa-amt">Amount</div>
            <div className="oa-x" />
          </div>

          {lines.map((l) => {
            const dish = byId.get(l.menuItemId);
            const unit = l.price === '' ? Number(dish?.price) || 0 : Number(l.price) || 0;
            const amt = unit * (Number(l.quantity) || 0);
            return (
              <div key={l.key} className="oa-row">
                <div className="oa-dish">
                  <SearchSelect
                    className="ss-root--cell"
                    value={l.menuItemId}
                    onChange={(v) => setLine(l.key, { menuItemId: v })}
                    options={dishes
                      .filter((d) => d.id === l.menuItemId || !chosen.includes(d.id))
                      .map((d) => ({ value: d.id, label: d.item_name }))}
                    placeholder="Select dish…"
                    ariaLabel="Dish"
                  />
                </div>
                <div className="oa-qty">
                  <input
                    className="gcell" type="number" min="0" step="1"
                    value={l.quantity}
                    onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                  />
                </div>
                <div className="oa-price">
                  <input
                    className="gcell" type="number" min="0" step="any"
                    value={l.price}
                    onChange={(e) => setLine(l.key, { price: e.target.value })}
                    placeholder={dish ? String(dish.price) : '—'}
                  />
                </div>
                <div className="oa-amt">{amt > 0 ? money(amt) : '—'}</div>
                <div className="oa-x">
                  <button type="button" className="step step--danger" onClick={() => removeLine(l.key)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => setLines((p) => [...p, blank()])}
          >
            <Plus size={14} /> Add dish
          </button>

          <div className="oa-compare">
            <div><span>Was</span><strong>{money(order.amount)}</strong></div>
            <div><span>Becomes</span><strong>{money(newSubtotal)}</strong></div>
            <div>
              <span>Difference</span>
              <strong className={newSubtotal - (order.subtotal ?? order.amount) < 0 ? 'neg' : 'pos'}>
                {newSubtotal - (order.subtotal ?? order.amount) > 0 ? '+' : ''}
                {money(newSubtotal - (order.subtotal ?? order.amount))}
              </strong>
            </div>
          </div>

          <ReasonField
            value={reason}
            onChange={setReason}
            placeholder="e.g. Two naan were charged that never went out"
          />
        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !reason.trim()}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        <OrderAdminStyles />
      </form>
    </div>
  );
}

function OrderAdminStyles() {
  return (
    <style>{`
      .modal--wide { width: 760px; }
      .oa-banner {
        display: flex; gap: 11px; padding: 13px 14px; border-radius: var(--radius-md);
        background: var(--color-warning-soft); color: var(--color-warning);
        font-size: 12.5px; line-height: 1.55;
      }
      .oa-banner.danger { background: var(--color-danger-soft); color: var(--color-danger); }
      .oa-banner strong { display: block; font-size: 13px; }
      .oa-keep {
        font-size: 12px; color: var(--color-text-muted);
        padding: 9px 12px; background: var(--color-well); border-radius: var(--radius-md);
      }

      .oa-head, .oa-row { display: flex; gap: 10px; align-items: center; }
      .oa-head {
        font-size: 11px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.04em; color: var(--color-text-muted);
        border-bottom: 1px solid var(--color-border); padding-bottom: 7px;
      }
      .oa-dish { flex: 2.2; min-width: 0; }
      .oa-qty { width: 84px; }
      .oa-price { width: 104px; }
      .oa-amt { width: 100px; text-align: right; font-weight: 700; }
      .oa-x { width: 32px; display: flex; justify-content: flex-end; }

      .oa-compare {
        display: flex; gap: 26px; padding: 12px 14px;
        background: var(--color-well); border-radius: var(--radius-md);
      }
      .oa-compare div { display: flex; flex-direction: column; gap: 2px; }
      .oa-compare span { font-size: 11px; color: var(--color-text-muted); font-weight: 600; }
      .oa-compare strong { font-size: 15px; }
      .pos { color: var(--color-success); }
      .neg { color: var(--color-danger); }

      .step {
        width: 28px; height: 28px; border: 1px solid var(--color-border);
        border-radius: 8px; background: var(--color-surface);
        color: var(--color-text-muted); display: inline-flex;
        align-items: center; justify-content: center; cursor: pointer;
      }
      .step--danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }
    `}</style>
  );
}
