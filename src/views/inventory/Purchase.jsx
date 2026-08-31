import React, { useMemo, useState } from 'react';
import { Plus, X, ShoppingCart, Ban, CheckCircle2, ChevronDown } from 'lucide-react';
import { usePurchaseData, lineTotals } from '../../hooks/usePurchaseData';
import {
  useLines, ItemSelect, UnitSelect, AddLineButton, RemoveLineButton, LineEditorStyles,
} from './lineEditor';

/**
 * Purchase entry — the vendor invoice that puts stock on the shelf.
 *
 * Posting is what moves stock, and it happens inside one database function, so
 * an invoice can never be half-received. Saving as a draft is offered for the
 * case where the goods are counted before the paperwork is straight.
 */

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`;
const today = () => new Date().toISOString().slice(0, 10);

const dateLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

const STATUS_TONE = { posted: 'tone-green', draft: 'tone-amber', cancelled: 'tone-neutral' };

function PurchaseForm({ items, vendors, onClose, onSave }) {
  const { lines, addLine, updateLine, removeLine } = useLines();
  const [head, setHead] = useState({
    vendorId: '', invoiceNo: '', invoiceDate: today(), note: '', discount: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const chosen = lines.map((l) => l.inventoryItemId).filter(Boolean);

  const computed = lines.map((l) => lineTotals(l, itemById.get(l.inventoryItemId)));
  const gross = computed.reduce((s, c) => s + c.amount, 0);
  const total = gross - (Number(head.discount) || 0);

  const submit = async (postNow) => {
    setSaving(true);
    setError('');
    const res = await onSave({ ...head, lines }, { postNow });
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error || 'Could not save the purchase.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">New purchase</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="pf-error">{error}</div>}

          <div className="pf-head">
            <div className="field">
              <label>Vendor</label>
              <select
                value={head.vendorId}
                onChange={(e) => setHead({ ...head, vendorId: e.target.value })}
              >
                <option value="">No vendor</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Invoice no.</label>
              <input
                value={head.invoiceNo}
                onChange={(e) => setHead({ ...head, invoiceNo: e.target.value })}
                placeholder="e.g. INV-2043"
              />
            </div>
            <div className="field">
              <label>Invoice date</label>
              <input
                type="date"
                value={head.invoiceDate}
                onChange={(e) => setHead({ ...head, invoiceDate: e.target.value })}
              />
            </div>
          </div>

          <div className="ln-table">
            <div className="ln-head">
              <div className="ln-c-item">Raw material</div>
              <div className="ln-c-qty">Qty</div>
              <div className="ln-c-unit">Unit</div>
              <div className="ln-c-rate">Rate</div>
              <div className="ln-c-tax">Tax %</div>
              <div className="ln-c-amount">Amount</div>
              <div className="ln-c-x" />
            </div>

            {lines.map((l, i) => {
              const item = itemById.get(l.inventoryItemId);
              return (
                <div key={l.key} className="ln-row">
                  <div className="ln-c-item">
                    <ItemSelect
                      items={items}
                      value={l.inventoryItemId}
                      exclude={chosen}
                      onChange={(id) => {
                        const next = itemById.get(id);
                        updateLine(l.key, {
                          inventoryItemId: id,
                          // Buying usually happens in the purchase unit; start there.
                          entryUnit: next && next.purchase_unit !== next.unit ? 'purchase' : 'base',
                          rate: l.rate || (next?.last_purchase_rate ?? ''),
                        });
                      }}
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
                  <div className="ln-c-rate">
                    <input
                      className="ln-input" type="number" step="any" min="0"
                      value={l.rate}
                      onChange={(e) => updateLine(l.key, { rate: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="ln-c-tax">
                    <input
                      className="ln-input" type="number" step="any" min="0"
                      value={l.taxPct}
                      onChange={(e) => updateLine(l.key, { taxPct: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="ln-c-amount">{money(computed[i].amount)}</div>
                  <div className="ln-c-x"><RemoveLineButton onClick={() => removeLine(l.key)} /></div>

                  {item && l.entryUnit === 'purchase' && item.purchase_unit !== item.unit && Number(l.qty) > 0 && (
                    <div className="ln-conv">
                      Adds {computed[i].qtyBase} {item.unit} to stock
                    </div>
                  )}
                </div>
              );
            })}

            <AddLineButton onClick={addLine} />
          </div>

          <div className="pf-foot">
            <div className="field pf-disc">
              <label>Discount</label>
              <input
                type="number" step="any" min="0"
                value={head.discount}
                onChange={(e) => setHead({ ...head, discount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="field pf-note">
              <label>Note</label>
              <input
                value={head.note}
                onChange={(e) => setHead({ ...head, note: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="pf-total">
              <span>Invoice total</span>
              <strong>{money(total)}</strong>
            </div>
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--ghost" onClick={() => submit(false)} disabled={saving}>
            Save as draft
          </button>
          <button className="btn btn--primary" onClick={() => submit(true)} disabled={saving}>
            {saving ? 'Saving…' : 'Save & add to stock'}
          </button>
        </div>

        <PurchaseFormStyles />
        <LineEditorStyles />
      </div>
    </div>
  );
}

function PurchaseFormStyles() {
  return (
    <style>{`
      .modal--wide { width: 940px; }
      .pf-error {
        padding: 12px 14px; border-radius: var(--radius-md);
        background: var(--color-danger-soft); color: var(--color-danger);
        font-size: 13px; font-weight: 600;
      }
      .pf-head { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 14px; }
      .ln-conv {
        flex-basis: 100%; padding-left: 2px;
        font-size: 11.5px; color: var(--color-text-muted);
      }
      .pf-foot {
        display: flex; align-items: flex-end; gap: 14px;
        padding-top: 12px; border-top: 1px solid var(--color-border);
      }
      .pf-disc { width: 130px; }
      .pf-note { flex: 1; }
      .pf-total {
        display: flex; flex-direction: column; align-items: flex-end;
        font-size: 12px; font-weight: 600; color: var(--color-text-muted);
      }
      .pf-total strong { font-size: 20px; color: var(--color-text); }
      @media (max-width: 880px) { .pf-head { grid-template-columns: 1fr; } }
    `}</style>
  );
}

/* ------------------------------------------------------------------- List */
export default function Purchase() {
  const {
    purchases, vendors, items, loading, error,
    savePurchase, postPurchase, cancelPurchase,
  } = usePurchaseData();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [notice, setNotice] = useState(null);

  const flash = (msg, bad = false) => {
    setNotice({ msg, bad });
    setTimeout(() => setNotice(null), 3200);
  };

  const totals = purchases.reduce((acc, p) => {
    if (p.status === 'posted') {
      acc.value += Number(p.total) || 0;
      acc.count += 1;
    }
    return acc;
  }, { value: 0, count: 0 });

  const handleCancel = async (p) => {
    if (!window.confirm(
      p.status === 'posted'
        ? 'Cancelling takes this stock back off the shelf. Continue?'
        : 'Cancel this draft purchase?',
    )) return;
    const res = await cancelPurchase(p.id);
    flash(res.success ? 'Purchase cancelled.' : res.error, !res.success);
  };

  const handlePost = async (p) => {
    const res = await postPurchase(p.id);
    flash(res.success ? 'Purchase posted — stock updated.' : res.error, !res.success);
  };

  return (
    <div className="page">
      <div className="pu-top">
        <div className="metric-grid metric-grid--3" style={{ flex: 1 }}>
          <div className="metric-card">
            <div className="metric-card__label">Posted invoices</div>
            <div className="metric-card__value">{totals.count}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Purchase value</div>
            <div className="metric-card__value metric-card__value--sm">{money(totals.value)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-card__label">Vendors</div>
            <div className="metric-card__value">{vendors.length}</div>
          </div>
        </div>
        <button className="btn btn--primary" onClick={() => setShowForm(true)}>
          <Plus size={15} /> New purchase
        </button>
      </div>

      {notice && (
        <div className={`pu-notice ${notice.bad ? 'bad' : ''}`}>{notice.msg}</div>
      )}
      {error && <div className="pu-notice bad">{error}</div>}

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="pc-inv">Invoice</div>
          <div className="pc-vendor">Vendor</div>
          <div className="pc-date">Date</div>
          <div className="pc-items">Items</div>
          <div className="pc-total">Total</div>
          <div className="pc-status">Status</div>
          <div className="pc-act" />
        </div>

        {loading && <div className="empty-state">Loading purchases…</div>}

        {!loading && purchases.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><ShoppingCart size={22} /></span>
            <div className="empty-state__title">No purchases recorded</div>
            <div className="empty-state__sub">
              Enter a vendor invoice to bring stock in. Opening balances, purchases and
              counts are what the Stock Summary report is built from.
            </div>
            <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={() => setShowForm(true)}>
              <Plus size={15} /> New purchase
            </button>
          </div>
        )}

        {!loading && purchases.map((p) => {
          const lines = p.purchase_items || [];
          const open = expanded === p.id;
          return (
            <React.Fragment key={p.id}>
              <div className="table-row pu-row">
                <div className="pc-inv strong">{p.invoice_no || '—'}</div>
                <div className="pc-vendor muted">{p.vendors?.name || 'No vendor'}</div>
                <div className="pc-date muted">{dateLabel(p.invoice_date)}</div>
                <div className="pc-items muted">{lines.length}</div>
                <div className="pc-total amount">{money(p.total)}</div>
                <div className="pc-status">
                  <span className={`pill pill--sm ${STATUS_TONE[p.status] || 'tone-neutral'}`}>
                    {p.status}
                  </span>
                </div>
                <div className="pc-act">
                  {p.status === 'draft' && (
                    <button className="mini" onClick={() => handlePost(p)} title="Post to stock">
                      <CheckCircle2 size={14} />
                    </button>
                  )}
                  {p.status !== 'cancelled' && (
                    <button className="mini mini--danger" onClick={() => handleCancel(p)} title="Cancel">
                      <Ban size={14} />
                    </button>
                  )}
                  <button
                    className={`mini ${open ? 'on' : ''}`}
                    onClick={() => setExpanded(open ? null : p.id)}
                    title="Show items"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              {open && (
                <div className="pu-detail">
                  {lines.map((ln) => (
                    <div key={ln.id} className="pu-detail__row">
                      <span className="strong">{ln.inventory_items?.item_name || 'Item'}</span>
                      <span className="muted">
                        {ln.qty} {ln.entry_unit === 'purchase'
                          ? (ln.inventory_items?.purchase_unit || ln.inventory_items?.unit)
                          : ln.inventory_items?.unit}
                        {ln.entry_unit === 'purchase' && (
                          <> → {ln.qty_base} {ln.inventory_items?.unit}</>
                        )}
                      </span>
                      <span className="muted">@ {money(ln.rate)}</span>
                      <span className="amount">{money(ln.amount)}</span>
                    </div>
                  ))}
                  {p.note && <div className="pu-detail__note">{p.note}</div>}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {showForm && (
        <PurchaseForm
          items={items}
          vendors={vendors}
          onClose={() => setShowForm(false)}
          onSave={savePurchase}
        />
      )}

      <style>{`
        .pu-top { display: flex; align-items: flex-start; gap: 16px; }
        .pu-notice {
          padding: 11px 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 600;
          background: var(--color-success-soft); color: var(--color-success);
        }
        .pu-notice.bad { background: var(--color-danger-soft); color: var(--color-danger); }

        .pu-row { margin: 0 -24px; padding: 0 24px; }
        .pc-inv { flex: 1; min-width: 0; }
        .pc-vendor { flex: 1.2; min-width: 0; }
        .pc-date { width: 120px; }
        .pc-items { width: 60px; text-align: center; }
        .pc-total { width: 110px; text-align: right; }
        .pc-status { width: 96px; }
        .pc-act { width: 104px; display: flex; justify-content: flex-end; gap: 6px; }

        .mini {
          width: 28px; height: 28px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface); color: var(--color-text-muted);
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .mini:hover { background: var(--color-canvas); color: var(--color-text); }
        .mini.on { transform: rotate(180deg); }
        .mini--danger:hover { color: var(--color-danger); border-color: var(--color-danger-border); }

        .pu-detail {
          margin: 0 -24px; padding: 12px 24px 16px;
          background: var(--color-canvas); border-bottom: 1px solid var(--color-border-soft);
        }
        .pu-detail__row {
          display: flex; align-items: center; gap: 14px; padding: 6px 0; font-size: 12.5px;
        }
        .pu-detail__row .strong { flex: 1.5; }
        .pu-detail__row .muted { flex: 1; color: var(--color-text-muted); }
        .pu-detail__row .amount { width: 100px; text-align: right; font-weight: 700; }
        .pu-detail__note { padding-top: 8px; font-size: 12.5px; color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}
