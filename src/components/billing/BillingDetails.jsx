import React, { useState } from 'react';
import {
  Printer, Edit3, CreditCard, Banknote, QrCode, X, Minus, Plus, Trash2, Check,
  ArrowLeftRight, Split, LayoutGrid, RefreshCw, Coffee, FileText,
} from 'lucide-react';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

const fmt = (v) => FORMAT_CURRENCY.format(v || 0);

const minutesSince = (iso) => {
  if (!iso) return null;
  const diff = (Date.now() - new Date(iso).getTime()) / 60000;
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff)) : null;
};

/* ------------------------------------------------------------------ header */

function SessionHeader({ session, items, isPaid, onMoveTable, onSplit, onHold, onVoid, onClose }) {
  const min = minutesSince(session?.started_at);
  const meta = [
    session?.customer_name || 'Walk-in',
    session?.guest_count ? `${session.guest_count} guests` : null,
    min !== null ? `${min} min` : null,
    `${items.length} item${items.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  return (
    <div className="bd-header">
      <div className="bd-header__row">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bd-title">
            Table {session?.restaurant_tables?.table_number}
            {isPaid && <span className="pill pill--sm tone-green" style={{ marginLeft: 8 }}>• PAID</span>}
          </div>
          <div className="bd-meta">{meta}</div>
        </div>
        <button className="icon-button" onClick={onClose} title="Close session view">
          <X size={16} />
        </button>
      </div>

      <div className="bd-actions">
        <button className="btn btn--ghost btn--sm" onClick={onHold} disabled={isPaid}>
          <Coffee size={14} /> Hold
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onMoveTable} disabled={isPaid}>
          <ArrowLeftRight size={14} /> Move
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onSplit} disabled={isPaid}>
          <Split size={14} /> Split
        </button>
        <button className="btn btn--danger btn--sm" onClick={onVoid} disabled={isPaid}>
          <X size={14} /> Void
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- items */

function ItemsList({
  items, isEditing, isPaid, loadingAction,
  onEditItem, onUpdateQty, onDeleteItem, onToggleEdit, onNavigateMenu, isOnline,
}) {
  if (items.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__mark"><FileText size={22} /></span>
        <div className="empty-state__title">No items punched yet</div>
        <div className="empty-state__sub">
          {isOnline
            ? 'Add dishes from the menu to start this bill.'
            : 'You’re offline — use manual order entry below to add items.'}
        </div>
        {isOnline && (
          <button className="btn btn--primary" style={{ marginTop: 12 }} onClick={onNavigateMenu} disabled={isPaid}>
            Add items
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bd-items">
      <div className="bd-section-head">
        <div className="drawer__label" style={{ margin: 0, flex: 1 }}>Items</div>
        <button className="link-action" onClick={onToggleEdit} disabled={isPaid}>
          {isEditing ? 'Done' : 'Edit quantities'}
        </button>
      </div>

      {items.map((item) => (
        <div key={item.id} className="bd-item">
          <div className="bd-item__name">{item.name}</div>

          {isEditing ? (
            <div className="bd-stepper">
              <button onClick={() => onUpdateQty(item, item.qty - 1)} disabled={loadingAction}>
                <Minus size={12} />
              </button>
              <span className="tnum">{item.qty}</span>
              <button onClick={() => onUpdateQty(item, item.qty + 1)} disabled={loadingAction}>
                <Plus size={12} />
              </button>
              <button className="bd-del" onClick={() => onDeleteItem(item)} disabled={loadingAction}>
                <Trash2 size={13} />
              </button>
            </div>
          ) : (
            <>
              <div className="bd-item__qty muted tnum">×{item.qty}</div>
              <div className="bd-item__amt tnum">{fmt(item.price * item.qty)}</div>
              <button className="bd-edit" onClick={() => onEditItem(item)} disabled={isPaid} title="Edit item">
                <Edit3 size={14} />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- adjustments */

function Adjustments({
  discountType, discountValue, subtotal, onSetDiscountType, onSetDiscountValue,
  showServiceCharge, serviceChargePercent, onToggleServiceCharge, onSetServiceChargePercent,
  isPaid,
}) {
  return (
    <div className="bd-well">
      <div className="bd-adjust-row">
        <div className="bd-adjust-label">Discount</div>
        <select
          value={discountType}
          onChange={(e) => onSetDiscountType(e.target.value)}
          disabled={isPaid}
          className="bd-select"
        >
          <option value="none">None</option>
          <option value="percentage">Percentage</option>
          <option value="flat">Flat amount</option>
        </select>
        {discountType !== 'none' && (
          <input
            type="number"
            min="0"
            max={discountType === 'percentage' ? 100 : subtotal}
            step={discountType === 'percentage' ? '1' : '0.01'}
            value={discountValue || ''}
            onChange={(e) => onSetDiscountValue(parseFloat(e.target.value) || 0)}
            placeholder={discountType === 'percentage' ? '%' : '₹'}
            disabled={isPaid}
            className="bd-num"
          />
        )}
      </div>

      <div className="bd-adjust-row">
        <div className="bd-adjust-label">Service charge</div>
        <button
          type="button"
          className={`toggle toggle--sm ${showServiceCharge ? 'on' : ''}`}
          onClick={onToggleServiceCharge}
          disabled={isPaid}
          aria-pressed={showServiceCharge}
        />
        {showServiceCharge && (
          <input
            type="number"
            min="0"
            max="50"
            step="0.5"
            value={serviceChargePercent || ''}
            onChange={(e) => onSetServiceChargePercent(parseFloat(e.target.value) || 0)}
            disabled={isPaid}
            className="bd-num"
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ totals */

function Totals({
  subtotal, discountAmount, serviceCharge, cgst, sgst, total,
  discountType, discountValue, showServiceCharge, serviceChargePercent,
}) {
  return (
    <div className="bd-totals tnum">
      <div className="bd-total-row"><span>Subtotal</span><b>{fmt(subtotal)}</b></div>
      {discountAmount > 0 && (
        <div className="bd-total-row">
          <span>Discount{discountType === 'percentage' ? ` (${discountValue}%)` : ''}</span>
          <b style={{ color: 'var(--color-danger)' }}>−{fmt(discountAmount)}</b>
        </div>
      )}
      {showServiceCharge && serviceCharge > 0 && (
        <div className="bd-total-row"><span>Service charge ({serviceChargePercent}%)</span><b>{fmt(serviceCharge)}</b></div>
      )}
      <div className="bd-total-row"><span>CGST (5%)</span><b>{fmt(cgst)}</b></div>
      <div className="bd-total-row"><span>SGST (5%)</span><b>{fmt(sgst)}</b></div>
      <div className="bd-total-row bd-total-row--grand"><span>Grand total</span><span>{fmt(total)}</span></div>
    </div>
  );
}

/* ---------------------------------------------------------------- invoice */

function InvoicePreview({ session, items, subtotal, discountAmount, serviceCharge, cgst, sgst, total, discountType, discountValue, showServiceCharge, serviceChargePercent }) {
  return (
    <div className="bd-receipt">
      <div className="bd-receipt__logo">
        <div className="bd-receipt__name">Spice OS</div>
        <div>123 Downtown St, Metro</div>
        <div>Tel: +91 90812 01234</div>
      </div>
      <div className="bd-receipt__meta">
        <div><span>Table</span><b>T-{session?.restaurant_tables?.table_number}</b></div>
        <div><span>Bill #</span><b>{session?.id?.slice(0, 4).toUpperCase()}</b></div>
        <div><span>Date</span><b>{session?.started_at ? new Date(session.started_at).toLocaleDateString() : ''}</b></div>
      </div>
      <div className="bd-receipt__items">
        {items.map((item, idx) => (
          <div key={idx} className="bd-receipt__row">
            <span>{item.qty}× {item.name}</span>
            <span className="tnum">{fmt(item.price * item.qty)}</span>
          </div>
        ))}
      </div>
      <div className="bd-receipt__totals tnum">
        <div className="bd-receipt__row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
        {discountAmount > 0 && (
          <div className="bd-receipt__row" style={{ color: 'var(--color-danger)' }}>
            <span>Discount {discountType === 'percentage' ? `(${discountValue}%)` : ''}</span>
            <span>−{fmt(discountAmount)}</span>
          </div>
        )}
        {showServiceCharge && serviceCharge > 0 && (
          <div className="bd-receipt__row"><span>Service charge ({serviceChargePercent}%)</span><span>{fmt(serviceCharge)}</span></div>
        )}
        <div className="bd-receipt__row"><span>CGST (5%)</span><span>{fmt(cgst)}</span></div>
        <div className="bd-receipt__row"><span>SGST (5%)</span><span>{fmt(sgst)}</span></div>
        <div className="bd-receipt__row bd-receipt__row--total"><span>Grand total</span><span>{fmt(total)}</span></div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- split payment */

function SplitPaymentBlock({ splitPayments, total, isPaid, onUpdateSplitPayment, onAddSplit, onRemoveSplit, onSettlePartial }) {
  const methods = [
    { key: 'cash', label: 'Cash' },
    { key: 'card', label: 'Card' },
    { key: 'upi', label: 'UPI' },
  ];

  const splitTotal = splitPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const balance = total - splitTotal;

  return (
    <div className="bd-well">
      <div className="drawer__label" style={{ marginBottom: 8 }}>Split payment</div>

      {splitPayments.map((sp, idx) => (
        <div key={idx} className="bd-split-row">
          <select
            value={sp.method}
            onChange={(e) => onUpdateSplitPayment(idx, { ...sp, method: e.target.value })}
            disabled={isPaid}
            className="bd-select"
          >
            {methods.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            value={sp.amount || ''}
            onChange={(e) => onUpdateSplitPayment(idx, { ...sp, amount: parseFloat(e.target.value) || 0 })}
            placeholder="Amount"
            disabled={isPaid}
            className="bd-num bd-num--wide"
          />
          {splitPayments.length > 1 && (
            <button className="bd-del" onClick={() => onRemoveSplit(idx)} disabled={isPaid}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}

      <div className="bd-split-foot">
        <button className="link-action" onClick={onAddSplit} disabled={isPaid}>+ Add method</button>
        {balance > 0 && <span className="bd-balance tnum">Balance {fmt(balance)}</span>}
      </div>

      <button
        className="btn btn--ghost"
        style={{ width: '100%', marginTop: 8 }}
        onClick={onSettlePartial}
        disabled={isPaid || splitTotal <= 0}
      >
        Pay {fmt(splitTotal)}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- settlement */

function PaymentBlock({ paymentMethod, total, isPaid, itemsEmpty, loadingAction, onSelectPayment, onSettle, onPrint }) {
  const methods = [
    { key: 'cash', label: 'Cash', Icon: Banknote },
    { key: 'card', label: 'Card', Icon: CreditCard },
    { key: 'qr', label: 'UPI', Icon: QrCode },
  ];

  return (
    <div className="bd-pay">
      <div className="bd-pay__methods">
        {methods.map(({ key, label, Icon }) => (
          <button
            key={key}
            className={`bd-method ${paymentMethod === key ? 'on' : ''}`}
            onClick={() => onSelectPayment(key)}
            disabled={isPaid}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <div className="bd-pay__row">
        <button
          className="btn btn--primary"
          style={{ flex: 1 }}
          onClick={onSettle}
          disabled={isPaid || itemsEmpty || loadingAction}
        >
          {isPaid ? 'Paid & completed' : `Settle ${fmt(total)}`}
        </button>
        <button className="btn btn--ghost" onClick={onPrint}>
          <Printer size={14} /> Print bill
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- root */

export default function BillingDetails({
  sessionId, session, items, loading, error, isPaid,
  subtotal, discountAmount, serviceCharge, cgst, sgst, total,
  paymentMethod, isEditingQuantities, loadingAction,
  discountType, discountValue, showServiceCharge, serviceChargePercent, splitPayments,
  onCloseSession, onNavigateMenu, onEditItem, onUpdateQty, onDeleteItem, onToggleEdit,
  onSelectPayment, onSettle, onPrint, onMoveTable, onMergeBill, onSplit, onHold, onVoid,
  isOnline, onAddManualItem, onSetDiscountType, onSetDiscountValue,
  onToggleServiceCharge, onSetServiceChargePercent,
  onUpdateSplitPayment, onAddSplitPayment, onRemoveSplitPayment, onSettlePartial,
}) {
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState(1);
  const [manualPrice, setManualPrice] = useState('');

  if (!sessionId) {
    return (
      <div className="card bd-shell">
        <div className="empty-state">
          <span className="empty-state__mark"><LayoutGrid size={22} /></span>
          <div className="empty-state__title">Select an active table on the left</div>
          <div className="empty-state__sub">
            Pick any table or order to see item details and process the settlement.
          </div>
        </div>
        <BillingStyles />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card bd-shell">
        <div className="empty-state">
          <RefreshCw size={20} className="spin" />
          <div className="empty-state__sub">Loading bill details…</div>
        </div>
        <BillingStyles />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="card bd-shell">
        <div className="empty-state">
          <div className="empty-state__title">Couldn’t load this session</div>
          <div className="empty-state__sub">{error || 'The active session could not be loaded.'}</div>
        </div>
        <BillingStyles />
      </div>
    );
  }

  return (
    <div className="card bd-shell">
      <SessionHeader
        session={session}
        items={items}
        isPaid={isPaid}
        onMoveTable={onMoveTable}
        onSplit={onSplit}
        onHold={onHold}
        onVoid={onVoid}
        onClose={onCloseSession}
      />

      <ItemsList
        items={items}
        isEditing={isEditingQuantities}
        isPaid={isPaid}
        loadingAction={loadingAction}
        onEditItem={onEditItem}
        onUpdateQty={onUpdateQty}
        onDeleteItem={onDeleteItem}
        onToggleEdit={onToggleEdit}
        onNavigateMenu={onNavigateMenu}
        isOnline={isOnline}
      />

      {!isPaid && (
        <Adjustments
          discountType={discountType}
          discountValue={discountValue}
          subtotal={subtotal}
          onSetDiscountType={onSetDiscountType}
          onSetDiscountValue={onSetDiscountValue}
          showServiceCharge={showServiceCharge}
          serviceChargePercent={serviceChargePercent}
          onToggleServiceCharge={onToggleServiceCharge}
          onSetServiceChargePercent={onSetServiceChargePercent}
          isPaid={isPaid}
        />
      )}

      {!isPaid && !isOnline && (
        <div className="bd-well">
          <div className="drawer__label" style={{ marginBottom: 8 }}>Manual order entry</div>
          <div className="bd-manual">
            <input
              type="text"
              placeholder="Item name"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="bd-text"
            />
            <input
              type="number"
              min="1"
              value={manualQty}
              onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="bd-num"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Price"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              className="bd-num bd-num--wide"
            />
            <button
              className="btn btn--primary btn--sm"
              disabled={!manualName || !manualPrice || loadingAction}
              onClick={() => {
                onAddManualItem(manualName, manualQty, parseFloat(manualPrice));
                setManualName('');
                setManualQty(1);
                setManualPrice('');
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      <Totals
        subtotal={subtotal}
        discountAmount={discountAmount}
        serviceCharge={serviceCharge}
        cgst={cgst}
        sgst={sgst}
        total={total}
        discountType={discountType}
        discountValue={discountValue}
        showServiceCharge={showServiceCharge}
        serviceChargePercent={serviceChargePercent}
      />

      <div className="bd-secondary">
        <button className="btn btn--ghost btn--sm" onClick={onMergeBill} disabled={isPaid || !onMergeBill}>
          <FileText size={14} /> Merge bill
        </button>
        <button className="btn btn--ghost btn--sm">
          <Printer size={14} /> Print KOT
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onNavigateMenu} disabled={isPaid || !isOnline}>
          <Plus size={14} /> Add items
        </button>
        {isEditingQuantities && (
          <button className="btn btn--ghost btn--sm" onClick={onToggleEdit}>
            <Check size={14} /> Finish qty
          </button>
        )}
      </div>

      {!isPaid && (
        <SplitPaymentBlock
          splitPayments={splitPayments}
          total={total}
          isPaid={isPaid}
          onUpdateSplitPayment={onUpdateSplitPayment}
          onAddSplit={onAddSplitPayment}
          onRemoveSplit={onRemoveSplitPayment}
          onSettlePartial={onSettlePartial}
        />
      )}

      <PaymentBlock
        paymentMethod={paymentMethod}
        total={total}
        isPaid={isPaid}
        itemsEmpty={items.length === 0}
        loadingAction={loadingAction}
        onSelectPayment={onSelectPayment}
        onSettle={onSettle}
        onPrint={onPrint}
      />

      <details className="bd-invoice">
        <summary>Bill invoice preview</summary>
        <InvoicePreview
          session={session}
          items={items}
          subtotal={subtotal}
          discountAmount={discountAmount}
          serviceCharge={serviceCharge}
          cgst={cgst}
          sgst={sgst}
          total={total}
          discountType={discountType}
          discountValue={discountValue}
          showServiceCharge={showServiceCharge}
          serviceChargePercent={serviceChargePercent}
        />
      </details>

      <BillingStyles />
    </div>
  );
}

function BillingStyles() {
  return (
    <style>{`
      .bd-shell { display: flex; flex-direction: column; gap: 14px; }

      .bd-header { border-bottom: 1px solid var(--color-border); padding-bottom: 14px; }
      .bd-header__row { display: flex; align-items: flex-start; gap: 12px; }
      .bd-title { font-size: 17px; font-weight: 800; display: flex; align-items: center; }
      .bd-meta { font-size: 13px; color: var(--color-text-muted); margin-top: 3px; }
      .bd-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }

      .bd-items { display: flex; flex-direction: column; }
      .bd-section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }

      .bd-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 0;
        border-bottom: 1px solid var(--color-border-soft);
        font-size: 13.5px;
      }
      .bd-item:last-child { border-bottom: none; }
      .bd-item__name { flex: 1; font-weight: 600; min-width: 0; }
      .bd-item__qty { width: 34px; text-align: center; color: var(--color-text-muted); }
      .bd-item__amt { width: 74px; text-align: right; font-weight: 600; }

      .bd-edit { border: none; background: none; color: var(--color-text-faint); display: flex; }
      .bd-edit:hover:not(:disabled) { color: var(--color-text); }
      .bd-edit:disabled { opacity: 0.4; cursor: not-allowed; }

      .bd-stepper { display: flex; align-items: center; gap: 6px; }
      .bd-stepper button {
        width: 26px; height: 26px;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-surface);
        color: var(--color-text-soft);
        display: inline-flex; align-items: center; justify-content: center;
      }
      .bd-stepper button:hover:not(:disabled) { background: var(--color-canvas); }
      .bd-stepper span { min-width: 20px; text-align: center; font-weight: 700; font-size: 13px; }

      .bd-del { border: none; background: none; color: var(--color-danger); display: flex; }
      .bd-del:disabled { opacity: 0.4; cursor: not-allowed; }

      .bd-well {
        background: var(--color-canvas);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 14px 16px;
      }

      .bd-adjust-row { display: flex; align-items: center; gap: 10px; }
      .bd-adjust-row + .bd-adjust-row { margin-top: 10px; }
      .bd-adjust-label { flex: 1; font-size: 13.5px; font-weight: 600; }

      .bd-select, .bd-num, .bd-text {
        height: 36px;
        padding: 0 10px;
        border: 1px solid var(--color-border);
        border-radius: 9px;
        background: var(--color-surface);
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text);
        outline: none;
        box-sizing: border-box;
      }
      .bd-select { min-width: 130px; }
      .bd-num { width: 64px; text-align: center; }
      .bd-num--wide { width: 96px; text-align: right; }
      .bd-text { flex: 1; min-width: 0; text-align: left; }
      .bd-select:disabled, .bd-num:disabled, .bd-text:disabled { opacity: 0.5; cursor: not-allowed; }

      .bd-manual { display: flex; gap: 8px; align-items: center; }
      .bd-split-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
      .bd-split-row .bd-select { flex: 1; }
      .bd-split-foot { display: flex; align-items: center; justify-content: space-between; }
      .bd-balance { font-size: 12.5px; font-weight: 700; color: var(--color-text-muted); }

      .bd-totals { display: flex; flex-direction: column; gap: 7px; font-size: 13.5px; }
      .bd-total-row { display: flex; justify-content: space-between; color: var(--color-text-muted); }
      .bd-total-row b { color: var(--color-text); font-weight: 600; }
      .bd-total-row--grand {
        font-size: 16px;
        font-weight: 800;
        color: var(--color-text);
        padding-top: 8px;
        border-top: 1px solid var(--color-border);
      }

      .bd-secondary { display: flex; gap: 8px; flex-wrap: wrap; }

      .bd-pay { display: flex; flex-direction: column; gap: 10px; }
      .bd-pay__methods { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .bd-pay__row { display: flex; gap: 8px; }

      .bd-method {
        height: 48px;
        border: 1.5px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        font-size: 13px;
        font-weight: 700;
        color: var(--color-text);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }
      .bd-method:hover:not(:disabled) { background: var(--color-canvas); }
      .bd-method.on { background: var(--color-text); border-color: var(--color-text); color: #fff; }
      .bd-method:disabled { opacity: 0.5; cursor: not-allowed; }

      .bd-invoice { border-top: 1px solid var(--color-border); padding-top: 12px; }
      .bd-invoice summary {
        font-size: 13px;
        font-weight: 600;
        color: var(--color-text-muted);
        cursor: pointer;
        list-style: none;
      }
      .bd-invoice summary::-webkit-details-marker { display: none; }
      .bd-invoice summary::before { content: '▸ '; }
      .bd-invoice[open] summary::before { content: '▾ '; }

      .bd-receipt {
        background: var(--color-canvas);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        padding: 16px;
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        font-size: 12.5px;
        color: var(--color-text-soft);
      }
      .bd-receipt__logo { text-align: center; }
      .bd-receipt__name { font-size: 15px; font-weight: 800; color: var(--color-text); }
      .bd-receipt__meta {
        display: flex;
        justify-content: space-between;
        border-top: 1px dashed var(--color-border-strong);
        border-bottom: 1px dashed var(--color-border-strong);
        padding: 8px 0;
      }
      .bd-receipt__meta span { display: block; font-size: 11px; color: var(--color-text-muted); }
      .bd-receipt__meta b { font-size: 12.5px; color: var(--color-text); }
      .bd-receipt__items { display: flex; flex-direction: column; gap: 6px; }
      .bd-receipt__row { display: flex; justify-content: space-between; gap: 12px; }
      .bd-receipt__totals {
        border-top: 1px dashed var(--color-border-strong);
        padding-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .bd-receipt__row--total {
        font-size: 15px;
        font-weight: 800;
        color: var(--color-text);
        margin-top: 4px;
      }
    `}</style>
  );
}
