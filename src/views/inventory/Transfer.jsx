import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X, ArrowLeftRight, ChevronDown, Send, PackageCheck } from 'lucide-react';
import { useTransferData } from '../../hooks/useStockOps';
import { useOutlet } from '../../context/OutletContext';
import {
  useLines, ItemSelect, UnitSelect, AddLineButton, RemoveLineButton, LineEditorStyles,
} from './lineEditor';

/**
 * Stock moving between branches.
 *
 * Sending and receiving are two separate acts on purpose. The stock leaves the
 * source the moment it is sent; it arrives only when someone at the other end
 * says it did, and they can say a smaller number than was sent. That gap is a
 * shortage, and it is recorded rather than absorbed — a single-step transfer
 * would quietly make in-transit losses disappear.
 */

const today = () => new Date().toISOString().slice(0, 10);

const dateLabel = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

const STATUS_TONE = {
  draft: 'tone-neutral', sent: 'tone-blue', received: 'tone-green', cancelled: 'tone-neutral',
};

function TransferForm({ items, outlets, defaultFrom, sourceStock, loadSourceStock, onClose, onSave }) {
  const { lines, addLine, updateLine, removeLine } = useLines();
  const [head, setHead] = useState({
    fromOutletId: defaultFrom || '',
    toOutletId: '',
    transferDate: today(),
    referenceNo: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadSourceStock(head.fromOutletId); }, [head.fromOutletId, loadSourceStock]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const chosen = lines.map((l) => l.inventoryItemId).filter(Boolean);

  const submit = async (sendNow) => {
    setSaving(true);
    setError('');
    const res = await onSave({ ...head, lines }, { sendNow });
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error || 'Could not save the transfer.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">New transfer</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="tf-error">{error}</div>}

          <div className="tf-head">
            <div className="field">
              <label>From outlet</label>
              <select
                value={head.fromOutletId}
                onChange={(e) => setHead({ ...head, fromOutletId: e.target.value })}
              >
                <option value="">Select…</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>To outlet</label>
              <select
                value={head.toOutletId}
                onChange={(e) => setHead({ ...head, toOutletId: e.target.value })}
              >
                <option value="">Select…</option>
                {outlets
                  .filter((o) => o.id !== head.fromOutletId)
                  .map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={head.transferDate}
                onChange={(e) => setHead({ ...head, transferDate: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Reference</label>
              <input
                value={head.referenceNo}
                onChange={(e) => setHead({ ...head, referenceNo: e.target.value })}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="ln-table">
            <div className="ln-head">
              <div className="ln-c-item">Raw material</div>
              <div className="ln-c-qty">Qty</div>
              <div className="ln-c-unit">Unit</div>
              <div className="ln-c-reason">Available at source</div>
              <div className="ln-c-x" />
            </div>

            {lines.map((l) => {
              const item = itemById.get(l.inventoryItemId);
              const available = sourceStock[l.inventoryItemId];
              const qty = Number(l.qty) || 0;
              const base = item && l.entryUnit === 'purchase'
                ? qty * (Number(item.conversion_factor) || 1) : qty;
              const short = item && available !== undefined && base > available;

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
                    {item ? (
                      <span className={short ? 'ln-warn' : 'tf-avail'}>
                        {available === undefined ? '0' : available} {item.unit}
                        {short && ' — not enough'}
                      </span>
                    ) : <span className="tf-avail">—</span>}
                  </div>
                  <div className="ln-c-x"><RemoveLineButton onClick={() => removeLine(l.key)} /></div>
                </div>
              );
            })}

            <AddLineButton onClick={addLine} />
          </div>

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
          <button className="btn btn--ghost" onClick={() => submit(false)} disabled={saving}>
            Save as draft
          </button>
          <button className="btn btn--primary" onClick={() => submit(true)} disabled={saving}>
            {saving ? 'Sending…' : <><Send size={15} /> Save &amp; send</>}
          </button>
        </div>

        <style>{`
          .modal--wide { width: 900px; }
          .tf-error {
            padding: 12px 14px; border-radius: var(--radius-md);
            background: var(--color-danger-soft); color: var(--color-danger);
            font-size: 13px; font-weight: 600;
          }
          .tf-head { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
          .tf-avail { font-size: 12.5px; color: var(--color-text-muted); font-weight: 600; }
          @media (max-width: 880px) { .tf-head { grid-template-columns: 1fr 1fr; } }
        `}</style>
        <LineEditorStyles />
      </div>
    </div>
  );
}

/** Receiving lets the destination correct the quantity before it is accepted. */
function ReceiveModal({ transfer, outletName, onClose, onConfirm }) {
  const lines = transfer.stock_transfer_items || [];
  const [received, setReceived] = useState(
    Object.fromEntries(lines.map((l) => [l.id, String(l.qty_base)])),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    const res = await onConfirm(transfer.id, received);
    setSaving(false);
    if (res.success) onClose();
    else setError(res.error || 'Could not receive the transfer.');
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">Receive transfer</div>
          <button type="button" className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="modal__body">
          {error && <div className="tf-error">{error}</div>}
          <div className="card__subtitle">
            From {outletName(transfer.from_outlet_id)} · {dateLabel(transfer.transfer_date)}.
            Adjust any quantity that arrived short — the difference is recorded as a shortage.
          </div>

          {lines.map((l) => {
            const short = Number(received[l.id]) < Number(l.qty_base);
            return (
              <div key={l.id} className="rc-line">
                <div className="rc-line__name">
                  <div className="strong">{l.inventory_items?.item_name || 'Item'}</div>
                  <div className="card__subtitle">Sent {l.qty_base} {l.inventory_items?.unit}</div>
                </div>
                <input
                  className="ln-input rc-line__qty"
                  type="number" step="any" min="0"
                  value={received[l.id] ?? ''}
                  onChange={(e) => setReceived({ ...received, [l.id]: e.target.value })}
                />
                {short && <span className="pill tone-amber pill--sm">Short</span>}
              </div>
            );
          })}
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit} disabled={saving}>
            {saving ? 'Receiving…' : <><PackageCheck size={15} /> Confirm receipt</>}
          </button>
        </div>

        <style>{`
          .rc-line { display: flex; align-items: center; gap: 12px; }
          .rc-line__name { flex: 1; min-width: 0; }
          .rc-line__qty { width: 110px; }
          .tf-error {
            padding: 12px 14px; border-radius: var(--radius-md);
            background: var(--color-danger-soft); color: var(--color-danger);
            font-size: 13px; font-weight: 600;
          }
        `}</style>
        <LineEditorStyles />
      </div>
    </div>
  );
}

export default function Transfer() {
  const {
    transfers, items, loading, error, sourceStock, outletId,
    saveTransfer, sendTransfer, receiveTransfer, loadSourceStock, outletName,
  } = useTransferData();
  const { outlets, isMultiOutlet } = useOutlet();

  const [showForm, setShowForm] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [notice, setNotice] = useState(null);

  const flash = (msg, bad = false) => {
    setNotice({ msg, bad });
    setTimeout(() => setNotice(null), 3200);
  };

  const handleSend = async (t) => {
    const res = await sendTransfer(t.id);
    flash(res.success ? 'Transfer sent — stock has left the source outlet.' : res.error, !res.success);
  };

  if (!isMultiOutlet) {
    return (
      <div className="page">
        <div className="card">
          <div className="empty-state">
            <span className="empty-state__mark"><ArrowLeftRight size={22} /></span>
            <div className="empty-state__title">Only one outlet</div>
            <div className="empty-state__sub">
              Transfers move stock between branches. Add a second outlet in Settings and
              this screen becomes available.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="tr-top">
        <div>
          <h2 className="tr-title">Transfers</h2>
          <div className="card__subtitle">Stock moving between your {outlets.length} outlets</div>
        </div>
        <button className="btn btn--primary" onClick={() => setShowForm(true)}>
          <Plus size={15} /> New transfer
        </button>
      </div>

      {notice && <div className={`tr-notice ${notice.bad ? 'bad' : ''}`}>{notice.msg}</div>}
      {error && <div className="tr-notice bad">{error}</div>}

      <div className="table-card table-card--padded">
        <div className="table-head">
          <div className="tc-ref">Reference</div>
          <div className="tc-route">Route</div>
          <div className="tc-date">Date</div>
          <div className="tc-items">Items</div>
          <div className="tc-status">Status</div>
          <div className="tc-act" />
        </div>

        {loading && <div className="empty-state">Loading transfers…</div>}

        {!loading && transfers.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__mark"><ArrowLeftRight size={22} /></span>
            <div className="empty-state__title">No transfers yet</div>
            <div className="empty-state__sub">
              Move stock from one outlet to another and both branches&apos; books stay right.
            </div>
          </div>
        )}

        {!loading && transfers.map((t) => {
          const lines = t.stock_transfer_items || [];
          const open = expanded === t.id;
          const canReceive = t.status === 'sent' && t.to_outlet_id === outletId;

          return (
            <React.Fragment key={t.id}>
              <div className="table-row tr-row">
                <div className="tc-ref strong">{t.reference_no || '—'}</div>
                <div className="tc-route muted">
                  {outletName(t.from_outlet_id)} → {outletName(t.to_outlet_id)}
                </div>
                <div className="tc-date muted">{dateLabel(t.transfer_date)}</div>
                <div className="tc-items muted">{lines.length}</div>
                <div className="tc-status">
                  <span className={`pill pill--sm ${STATUS_TONE[t.status] || 'tone-neutral'}`}>
                    {t.status}
                  </span>
                </div>
                <div className="tc-act">
                  {t.status === 'draft' && (
                    <button className="mini" onClick={() => handleSend(t)} title="Send">
                      <Send size={13} />
                    </button>
                  )}
                  {canReceive && (
                    <button className="mini" onClick={() => setReceiving(t)} title="Receive">
                      <PackageCheck size={14} />
                    </button>
                  )}
                  {t.status === 'sent' && !canReceive && (
                    <span className="tr-await">Awaiting {outletName(t.to_outlet_id)}</span>
                  )}
                  <button
                    className={`mini ${open ? 'on' : ''}`}
                    onClick={() => setExpanded(open ? null : t.id)}
                    title="Show items"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              {open && (
                <div className="tr-detail">
                  {lines.map((ln) => (
                    <div key={ln.id} className="tr-detail__row">
                      <span className="strong">{ln.inventory_items?.item_name || 'Item'}</span>
                      <span className="muted">Sent {ln.qty_base} {ln.inventory_items?.unit}</span>
                      <span className="muted">
                        {ln.received_qty_base === null || ln.received_qty_base === undefined
                          ? 'Not received'
                          : `Received ${ln.received_qty_base} ${ln.inventory_items?.unit}`}
                      </span>
                    </div>
                  ))}
                  {t.note && <div className="tr-detail__note">{t.note}</div>}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {showForm && (
        <TransferForm
          items={items}
          outlets={outlets}
          defaultFrom={outletId}
          sourceStock={sourceStock}
          loadSourceStock={loadSourceStock}
          onClose={() => setShowForm(false)}
          onSave={saveTransfer}
        />
      )}

      {receiving && (
        <ReceiveModal
          transfer={receiving}
          outletName={outletName}
          onClose={() => setReceiving(null)}
          onConfirm={receiveTransfer}
        />
      )}

      <style>{`
        .tr-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .tr-title { font-size: 20px; font-weight: 800; margin: 0; }
        .tr-notice {
          padding: 11px 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 600;
          background: var(--color-success-soft); color: var(--color-success);
        }
        .tr-notice.bad { background: var(--color-danger-soft); color: var(--color-danger); }

        .tr-row { margin: 0 -24px; padding: 0 24px; }
        .tc-ref { width: 130px; }
        .tc-route { flex: 1.4; min-width: 0; }
        .tc-date { width: 120px; }
        .tc-items { width: 60px; text-align: center; }
        .tc-status { width: 96px; }
        .tc-act { width: 170px; display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
        .tr-await { font-size: 11.5px; color: var(--color-text-faint); font-weight: 600; }

        .mini {
          width: 28px; height: 28px; border: 1px solid var(--color-border);
          border-radius: 8px; background: var(--color-surface); color: var(--color-text-muted);
          display: inline-flex; align-items: center; justify-content: center; cursor: pointer;
        }
        .mini:hover { background: var(--color-canvas); color: var(--color-text); }
        .mini.on { transform: rotate(180deg); }

        .tr-detail {
          margin: 0 -24px; padding: 12px 24px 16px;
          background: var(--color-canvas); border-bottom: 1px solid var(--color-border-soft);
        }
        .tr-detail__row {
          display: flex; align-items: center; gap: 14px; padding: 6px 0; font-size: 12.5px;
        }
        .tr-detail__row .strong { flex: 1.5; }
        .tr-detail__row .muted { flex: 1; color: var(--color-text-muted); }
        .tr-detail__note { padding-top: 8px; font-size: 12.5px; color: var(--color-text-muted); }
      `}</style>
    </div>
  );
}
